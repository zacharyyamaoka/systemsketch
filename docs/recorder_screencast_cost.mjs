#!/usr/bin/env node
/**
 * Screencast cost — what does taking the screenshots cost the app?
 *
 * The recorder design (see recorder_spike.mjs) leans on Chrome's own
 * `Page.startScreencast` for its slow channel. This script puts a number on
 * that choice: it runs the spike's ~8 s Block gesture in a fresh headless app
 * instance under four screencast settings — none, the spike's, and two cheaper
 * ones — and measures, from inside the page and from outside it, what changed.
 *
 *   inside   requestAnimationFrame interval statistics (p50 / p95 / max, and
 *            how many intervals blew past 33 ms) plus PerformanceObserver
 *            long tasks, both over exactly the gesture window
 *   outside  CPU seconds burned by every Chrome process of that instance
 *            (utime + stime from /proc/<pid>/stat, plus reaped children), the
 *            gesture's wall time, and the frames and bytes the screencast
 *            actually delivered
 *
 * Each variant runs twice, interleaved (A B C D A B C D), so warm-up and
 * drift spread across all four rather than landing on one. Every instance is
 * throwaway: the harness allocates free ports, a temp files root and a temp
 * Chrome profile, and nothing here touches a real board or a running server.
 *
 * Writes docs/assets/recorder-spike/screencast-cost.json and prints a table.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  findChrome,
  key,
  mouse,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'
import {
  addPort,
  box,
  cables,
  drawBlock,
  dragFrom,
  portDot,
} from '../tests/block_journey_helpers.mjs'

const LABEL = 'recorder-cost'
const OUT = join(ROOT, 'docs', 'assets', 'recorder-spike', 'screencast-cost.json')
const CLK_TCK = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) || 100
const SETTLE_MS = 250 // after arming the screencast, before the measured window opens

/** The four settings under test. `null` means no screencast at all. */
const VARIANTS = {
  A: null,
  B: { format: 'jpeg', quality: 70, everyNthFrame: 1 },
  C: { format: 'jpeg', quality: 60, everyNthFrame: 2, maxWidth: 960, maxHeight: 640 },
  D: { format: 'jpeg', quality: 50, everyNthFrame: 3, maxWidth: 720, maxHeight: 480 },
}
const ORDER = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']

/**
 * In-page probe. Installed once per instance, started right before the
 * gesture and stopped right after it, so every statistic covers the same
 * window the outside measurements do.
 *
 * Long tasks are observed with `buffered: true` (as the entry type allows)
 * and then filtered to the window — the buffer also holds page-load tasks,
 * which are not the cost being measured.
 */
const PROBE_SOURCE = `(() => {
  const probe = {
    intervals: [], longTasks: [], startT: null, stopT: null, running: false, rafId: 0, observer: null, result: null,
    start() {
      this.intervals.length = 0
      this.longTasks.length = 0
      this.result = null
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.longTasks.push({ start: entry.startTime, duration: entry.duration })
      })
      this.observer.observe({ type: 'longtask', buffered: true })
      this.running = true
      this.startT = performance.now()
      let last = null
      const tick = (now) => {
        if (!this.running) return
        if (last !== null) this.intervals.push(now - last)
        last = now
        this.rafId = requestAnimationFrame(tick)
      }
      this.rafId = requestAnimationFrame(tick)
    },
    stop() {
      this.running = false
      cancelAnimationFrame(this.rafId)
      this.stopT = performance.now()
      for (const entry of this.observer.takeRecords()) this.longTasks.push({ start: entry.startTime, duration: entry.duration })
      this.observer.disconnect()
      const sorted = [...this.intervals].sort((a, b) => a - b)
      const rank = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : 0
      const round = (x) => Math.round(x * 100) / 100
      const inWindow = this.longTasks.filter((task) => task.start >= this.startT && task.start <= this.stopT)
      this.result = {
        windowMs: round(this.stopT - this.startT),
        visibility: document.visibilityState,
        raf: {
          count: sorted.length,
          p50: round(rank(0.5)),
          p95: round(rank(0.95)),
          max: round(sorted.length ? sorted[sorted.length - 1] : 0),
          over33: sorted.filter((x) => x > 33).length,
        },
        longTasks: {
          count: inWindow.length,
          totalMs: round(inWindow.reduce((sum, task) => sum + task.duration, 0)),
          longestMs: round(inWindow.reduce((most, task) => Math.max(most, task.duration), 0)),
        },
      }
      return this.result
    },
  }
  window.__probe = probe
  return true
})()`

// ---------------------------------------------------------------- outside: the Chrome process set

const chromeProfiles = () => readdirSync(tmpdir()).filter((name) => name.startsWith(`${LABEL}-chrome-`)).map((name) => join(tmpdir(), name))

/**
 * Every process that belongs to one Chrome instance, with its CPU so far.
 *
 * Roots are the pids whose cmdline names the instance's profile dir (the
 * browser, crashpad); renderers, the zygote, GPU and utility processes do not
 * always repeat that flag, so the set is closed under "is a descendant of a
 * root" using the ppid in /proc/<pid>/stat. Ticks are utime + stime (fields
 * 14, 15); `reaped` is cutime + cstime (16, 17), which is where the time of a
 * child that exited mid-window ends up.
 */
function chromeProcesses(profileDir) {
  const table = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    let cmdline, stat
    try {
      cmdline = readFileSync(`/proc/${entry}/cmdline`, 'latin1')
      stat = readFileSync(`/proc/${entry}/stat`, 'latin1')
    } catch { continue }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const [utime, stime, cutime, cstime] = fields.slice(11, 15).map(Number)
    table.set(Number(entry), {
      ppid: Number(fields[1]),
      root: cmdline.includes(profileDir),
      own: utime + stime,
      reaped: cutime + cstime,
    })
  }
  const members = new Map()
  const belongs = (pid, depth = 0) => {
    const row = table.get(pid)
    if (!row || depth > 32) return false
    if (row.root) return true
    return belongs(row.ppid, depth + 1)
  }
  for (const [pid, row] of table) if (belongs(pid)) members.set(pid, row)
  return members
}

function cpuDelta(before, after) {
  let ownTicks = 0
  let reapedTicks = 0
  for (const [pid, row] of after) {
    const earlier = before.get(pid)
    ownTicks += row.own - (earlier?.own ?? 0)
    reapedTicks += row.reaped - (earlier?.reaped ?? 0)
  }
  return {
    cpuSeconds: (ownTicks + reapedTicks) / CLK_TCK,
    cpuReapedSeconds: reapedTicks / CLK_TCK,
    processesBefore: before.size,
    processesAfter: after.size,
  }
}

// ---------------------------------------------------------------- the interaction under test

/** The spike's gesture (recorder_spike.mjs), same events and delays — its one recorder call is a no-op round trip here. */
async function gesture(page) {
  await drawBlock(page, { x: 300, y: 260 }, { x: 640, y: 460 }, 'camera')
  await addPort(page, 'outputs')
  await delay(350)
  await drawBlock(page, { x: 820, y: 260 }, { x: 1160, y: 460 }, 'detector')
  await addPort(page, 'inputs')
  await delay(350)
  // The spike reads `const [camera, detector] = await blockIds(page)`, but that is DOM
  // order, and tldraw renders shapes sorted by id (random nanoids) — a coin flip that
  // came up tails on this script's first run. Resolve the two Blocks by title instead.
  const { camera, detector } = await evaluate(page, `(() => {
    const byTitle = {}
    for (const shape of window.__systemsketch.editor.getCurrentPageShapes()) {
      if (shape.type === 'block') byTitle[shape.props.title ?? shape.props.name] = shape.id
    }
    return byTitle
  })()`)
  if (!camera || !detector) throw new Error('expected Blocks titled camera and detector on the board')
  await clickAt(page, 200, 880) // deselect on empty canvas
  await delay(300)
  await dragFrom(page, await box(page, portDot(camera, 'output', 'out_1')), await box(page, portDot(detector, 'input', 'in_1')), { steps: 14 })
  await delay(400)
  await evaluate(page, 'void 0') // stands in for the spike's `__ssRecorder.mark(...)`: same round trip, no recorder
  const detectorBox = await box(page, `[data-shape-id="${detector}"]`)
  await clickAt(page, detectorBox.cx, detectorBox.cy - 60)
  await delay(250)
  await mouse(page, 'mouseMoved', detectorBox.cx, detectorBox.cy - 60)
  await mouse(page, 'mousePressed', detectorBox.cx, detectorBox.cy - 60, { buttons: 1 })
  for (let step = 1; step <= 16; step += 1) {
    await mouse(page, 'mouseMoved', detectorBox.cx + (60 * step) / 16, detectorBox.cy - 60 + (180 * step) / 16, { buttons: 1 })
    await delay(30)
  }
  await mouse(page, 'mouseReleased', detectorBox.cx + 60, detectorBox.cy + 120)
  await delay(450)
  await clickAt(page, detectorBox.cx + 60, detectorBox.cy + 120, 'right')
  await delay(600)
  await key(page, 'Escape', 'Escape')
  await delay(300)
  await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 700, y: 620, deltaX: 0, deltaY: -240, modifiers: 2 })
  await delay(500)
  await key(page, 'Escape', 'Escape')
  await delay(400)
}

// ---------------------------------------------------------------- one measured run

async function measure(variant, run) {
  const profilesBefore = new Set(chromeProfiles())
  const app = await startApp({ label: LABEL, build: LABEL })
  const { page, port, filesRoot } = app
  const profileDir = chromeProfiles().find((dir) => !profilesBefore.has(dir))
  if (!profileDir) throw new Error('could not find this instance\'s Chrome profile dir')

  const frames = { count: 0, bytes: 0 }
  let armed = false
  // Frames arrive as CDP events on the same socket; ack each one or Chrome stops sending.
  page.socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method !== 'Page.screencastFrame') return
    if (armed) {
      frames.count += 1
      frames.bytes += Buffer.byteLength(message.params.data, 'base64')
    }
    page.send('Page.screencastFrameAck', { sessionId: message.params.sessionId }).catch(() => {})
  })

  try {
    const board = join(filesRoot, 'SystemSketch', `${LABEL}.systemsketch`)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'canvas')
    await delay(800)
    await evaluate(page, PROBE_SOURCE)

    const params = VARIANTS[variant]
    if (params) await page.send('Page.startScreencast', params)
    await delay(SETTLE_MS)

    const processesBefore = chromeProcesses(profileDir)
    if (processesBefore.size === 0) throw new Error(`no Chrome processes found for ${profileDir}`)
    const nodeCpuBefore = process.cpuUsage()
    await evaluate(page, 'window.__probe.start()')
    armed = true
    const wallStart = performance.now()
    await gesture(page)
    const wallMs = performance.now() - wallStart
    armed = false
    const probe = await evaluate(page, 'window.__probe.stop()')
    const nodeCpu = process.cpuUsage(nodeCpuBefore)
    const processesAfter = chromeProcesses(profileDir)
    const cpu = cpuDelta(processesBefore, processesAfter)

    if (params) await page.send('Page.stopScreencast')
    const cableCount = await cables(page)

    const round = (x, places = 2) => Math.round(x * 10 ** places) / 10 ** places
    return {
      variant,
      run,
      wallMs: round(wallMs, 0),
      cpuSeconds: round(cpu.cpuSeconds, 3),
      cpuPct: round((cpu.cpuSeconds / (wallMs / 1000)) * 100, 1),
      raf: probe.raf,
      longTasks: { count: probe.longTasks.count, totalMs: probe.longTasks.totalMs },
      frames: frames.count,
      frameBytes: frames.bytes,
      fps: round(frames.count / (wallMs / 1000), 1),
      // context, not part of the headline numbers
      detail: {
        cpuReapedSeconds: round(cpu.cpuReapedSeconds, 3),
        processesBefore: cpu.processesBefore,
        processesAfter: cpu.processesAfter,
        probeWindowMs: probe.windowMs,
        longestTaskMs: probe.longTasks.longestMs,
        visibility: probe.visibility,
        nodeCpuSeconds: round((nodeCpu.user + nodeCpu.system) / 1e6, 3),
        cablesOnBoard: cableCount,
        profileDir,
      },
    }
  } finally {
    app.close()
  }
}

// ---------------------------------------------------------------- summary + table

function meanOf(rows) {
  const out = {}
  for (const keyName of Object.keys(rows[0])) {
    const values = rows.map((row) => row[keyName])
    if (typeof values[0] === 'number') out[keyName] = Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100
    else if (values[0] && typeof values[0] === 'object') out[keyName] = meanOf(values)
  }
  return out
}

const COLUMNS = [
  ['variant', 3, (r) => r.variant], ['run', 3, (r) => r.run ?? 'x̄'],
  ['wall ms', 8, (r) => r.wallMs.toFixed(0)], ['cpu s', 7, (r) => r.cpuSeconds.toFixed(2)], ['cpu %', 6, (r) => r.cpuPct.toFixed(1)],
  ['rAF n', 6, (r) => r.raf.count.toFixed(0)], ['p50', 6, (r) => r.raf.p50.toFixed(1)], ['p95', 6, (r) => r.raf.p95.toFixed(1)], ['max', 6, (r) => r.raf.max.toFixed(0)], ['>33', 4, (r) => r.raf.over33.toFixed(1)],
  ['long n', 6, (r) => r.longTasks.count.toFixed(1)], ['long ms', 7, (r) => r.longTasks.totalMs.toFixed(0)],
  ['frames', 6, (r) => r.frames.toFixed(0)], ['KB', 6, (r) => (r.frameBytes / 1024).toFixed(0)], ['fps', 5, (r) => r.fps.toFixed(1)],
]
const tableLine = (row) => COLUMNS.map(([, width, cell]) => String(cell(row)).padStart(width)).join('  ')
const tableHeader = () => COLUMNS.map(([name, width]) => name.padStart(width)).join('  ')

function sanity(run) {
  const problems = []
  const finite = (value, name) => { if (!Number.isFinite(value)) problems.push(`${name} is ${value}`) }
  finite(run.cpuSeconds, 'cpuSeconds'); finite(run.raf.p50, 'raf.p50'); finite(run.fps, 'fps')
  if (run.raf.count < 60) problems.push(`only ${run.raf.count} rAF intervals`)
  if (run.cpuSeconds <= 0) problems.push('no CPU consumed')
  if (run.detail.processesAfter < 3) problems.push(`only ${run.detail.processesAfter} Chrome processes seen`)
  if (VARIANTS[run.variant] && run.frames === 0) problems.push('screencast armed but no frames arrived')
  if (!VARIANTS[run.variant] && run.frames !== 0) problems.push('baseline received frames')
  if (run.detail.cablesOnBoard !== 1) problems.push(`expected 1 cable, saw ${run.detail.cablesOnBoard}`)
  return problems
}

async function main() {
  const runs = []
  const seen = {}
  process.stdout.write(`screencast cost — ${ORDER.length} runs, CLK_TCK=${CLK_TCK}\n${tableHeader()}\n`)
  for (const variant of ORDER) {
    seen[variant] = (seen[variant] ?? 0) + 1
    const result = await measure(variant, seen[variant])
    runs.push(result)
    const problems = sanity(result)
    process.stdout.write(`${tableLine(result)}${problems.length ? `   WARN ${problems.join('; ')}` : ''}\n`)
    await delay(1500) // let the killed instance's processes drain before the next one boots
  }

  const summary = {}
  for (const variant of Object.keys(VARIANTS)) {
    const rows = runs.filter((run) => run.variant === variant).map(({ detail, variant: _v, run: _r, ...rest }) => rest)
    summary[variant] = meanOf(rows)
  }
  process.stdout.write(`\nmeans over ${ORDER.length / Object.keys(VARIANTS).length} runs each\n${tableHeader()}\n`)
  for (const variant of Object.keys(VARIANTS)) process.stdout.write(`${tableLine({ variant, ...summary[variant] })}\n`)

  let chromeVersion = null
  try { chromeVersion = execFileSync(await findChrome(), ['--version'], { encoding: 'utf8' }).trim() } catch { /* version is context, not data */ }
  const document = {
    clkTck: CLK_TCK,
    capturedAt: new Date().toISOString(),
    gesture: 'recorder_spike.mjs — draw two Blocks, add ports, wire a cable, drag the detector, right-click, ctrl+wheel',
    chrome: { version: chromeVersion, headless: 'new', gpu: 'disabled (--disable-gpu, software compositing)', viewport: '1440x960 @1x' },
    settleMs: SETTLE_MS,
    variants: VARIANTS,
    order: ORDER,
    runs,
    summary,
  }
  await mkdir(join(OUT, '..'), { recursive: true })
  await writeFile(OUT, JSON.stringify(document, null, 2) + '\n')
  process.stdout.write(`\nwrote ${OUT}\n`)

  const broken = runs.map((run) => [run, sanity(run)]).filter(([, problems]) => problems.length)
  if (broken.length) {
    process.stdout.write(`\n${broken.length} run(s) failed sanity checks:\n`)
    for (const [run, problems] of broken) process.stdout.write(`  ${run.variant}${run.run}: ${problems.join('; ')}\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
