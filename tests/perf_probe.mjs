#!/usr/bin/env node
/**
 * Performance probe: where does the time go?
 *
 * Seeds a board of Port-view Blocks wired into a chain, then drives the same
 * gestures a person makes — idle, pan, zoom, drag a Block, draw a cable, move
 * everything — while recording three independent instruments:
 *
 *   frames      requestAnimationFrame timestamps → mean / p95 / max frame gap
 *   long tasks  PerformanceObserver('longtask') → count and total blocking ms
 *   CPU         the V8 sampling profiler over CDP → self and inclusive time per
 *               function, attributed to a file in src/, to tldraw, or to React
 *
 * Numbers are written to docs/assets/perf-probe-<label>.json so a report can
 * measure itself from the run rather than from memory. Run with
 *
 *   node tests/perf_probe.mjs [label] [blocks]
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  key,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const LABEL = process.argv[2] ?? 'baseline'
const BLOCKS = Number(process.argv[3] ?? 48)
const COLS = 6
const OUT_DIR = join(ROOT, 'docs', 'assets')

function shortUrl(url) {
  if (!url) return '(native)'
  const match = url.match(/\/(src\/[^?]+)/)
  if (match) return match[1]
  if (url.includes('/node_modules/.vite/deps/')) {
    const dep = url.match(/deps\/([^?]+)/)?.[1] ?? 'deps'
    return `dep:${dep}`
  }
  if (url.includes('/node_modules/')) {
    const pkg = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? 'node_modules'
    return `pkg:${pkg}`
  }
  return url.replace(/^https?:\/\/[^/]+/, '')
}

function bucketOf(url) {
  if (!url) return 'native'
  if (url.includes('/src/')) return 'src'
  if (/tldraw|@tldraw/.test(url)) return 'tldraw'
  if (/react/.test(url)) return 'react'
  return 'other'
}

/** Self and inclusive microseconds per function, plus per-bucket totals. */
function aggregate(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const selfById = new Map()
  let total = 0
  for (let index = 0; index < profile.samples.length; index += 1) {
    const dt = profile.timeDeltas[index] ?? 0
    total += dt
    selfById.set(profile.samples[index], (selfById.get(profile.samples[index]) ?? 0) + dt)
  }
  const keyOf = (node) => {
    const frame = node.callFrame
    const name = frame.functionName || '(anonymous)'
    return `${name}  ${shortUrl(frame.url)}:${frame.lineNumber + 1}`
  }
  const inclusive = new Map()
  const visit = (node, ancestors) => {
    let sum = selfById.get(node.id) ?? 0
    for (const childId of node.children ?? []) {
      const child = byId.get(childId)
      if (child) sum += visit(child, ancestors)
    }
    const key = keyOf(node)
    // Credit inclusive time once per call chain: not again for a recursive frame.
    if (!ancestors.has(key)) {
      ancestors.add(key)
      inclusive.set(key, (inclusive.get(key) ?? 0) + sum)
      ancestors.delete(key)
    }
    return sum
  }
  // Inclusive needs ancestor tracking down each path; do it with an explicit walk.
  const walk = (node, chain) => {
    const key = keyOf(node)
    const seen = chain.has(key)
    if (!seen) chain.add(key)
    let sum = selfById.get(node.id) ?? 0
    for (const childId of node.children ?? []) {
      const child = byId.get(childId)
      if (child) sum += walk(child, chain)
    }
    if (!seen) {
      inclusive.set(key, (inclusive.get(key) ?? 0) + sum)
      chain.delete(key)
    }
    return sum
  }
  void visit
  const root = profile.nodes.find((node) => node.callFrame.functionName === '(root)') ?? profile.nodes[0]
  walk(root, new Set())

  const self = new Map()
  const buckets = { src: 0, tldraw: 0, react: 0, other: 0, native: 0, idle: 0, program: 0, gc: 0 }
  for (const [id, us] of selfById) {
    const node = byId.get(id)
    const name = node.callFrame.functionName
    if (name === '(idle)') { buckets.idle += us; continue }
    if (name === '(program)') { buckets.program += us; continue }
    if (name === '(garbage collector)') { buckets.gc += us; continue }
    buckets[bucketOf(node.callFrame.url)] += us
    const key = keyOf(node)
    self.set(key, (self.get(key) ?? 0) + us)
  }
  const top = (map, count) => [...map.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, count)
    .map(([key, us]) => ({ fn: key, ms: Math.round(us / 100) / 10 }))
  const busy = total - buckets.idle
  return {
    totalMs: Math.round(total / 1000),
    busyMs: Math.round(busy / 1000),
    buckets: Object.fromEntries(Object.entries(buckets).map(([name, us]) => [name, Math.round(us / 1000)])),
    topSelf: top(self, 30),
    topInclusive: top(inclusive, 40).filter((entry) => !/^\((root|program|idle)\)/.test(entry.fn)),
    srcInclusive: top(new Map([...inclusive].filter(([key]) => key.includes('  src/'))), 40),
  }
}

const SEED = (blocks) => `(() => {
  const editor = window.__systemsketch.editor
  const N = ${blocks}, COLS = ${COLS}
  const views = { simple: { w: 320, h: 206 }, port: { w: 340, h: 198 }, expanded: { w: 560, h: 380 } }
  const ids = []
  const shapes = []
  for (let i = 0; i < N; i += 1) {
    const id = 'shape:perf-block-' + i
    const col = i % COLS, row = Math.floor(i / COLS)
    const inputs = [0, 1, 2].map((k) => ({ id: 'in' + k, name: 'input ' + k, type: k === 0 ? 'image' : 'number', visible: true }))
    const outputs = [0, 1].map((k) => ({ id: 'out' + k, name: 'output ' + k, type: 'image', visible: true }))
    shapes.push({
      id, type: 'block', x: col * 480, y: row * 320,
      props: {
        w: 340, h: 198, title: 'Block ' + i, description: 'Stage ' + i + ' of the pipeline',
        blockType: 'Transform', icon: '', view: 'port', views, showDescription: true, notes: '',
        portLayout: 'inline', inputs, outputs,
      },
    })
    ids.push(id)
  }
  const cables = []
  const bindings = []
  const cable = (index, fromBlock, fromPort, toBlock, toPort) => {
    const cid = 'shape:perf-cable-' + index
    cables.push({ id: cid, type: 'connection', x: 0, y: 0,
      props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow', curve: null, pins: [], elbowRoute: null } })
    bindings.push({ type: 'connection', fromId: cid, toId: fromBlock, props: { portId: fromPort, terminal: 'start', face: 'outer' } })
    bindings.push({ type: 'connection', fromId: cid, toId: toBlock, props: { portId: toPort, terminal: 'end', face: 'outer' } })
  }
  let cableIndex = 0
  for (let i = 0; i < N - 1; i += 1) cable(cableIndex++, ids[i], 'out0', ids[i + 1], 'in0')
  for (let i = 0; i + COLS < N; i += 2) cable(cableIndex++, ids[i], 'out1', ids[i + COLS], 'in1')
  const t0 = performance.now()
  editor.run(() => {
    editor.createShapes(shapes)
    editor.createShapes(cables)
    editor.createBindings(bindings)
  })
  editor.selectNone()
  editor.zoomToFit({ animation: { duration: 0 } })
  const t1 = performance.now()
  return JSON.stringify({ blocks: ids.length, cables: cables.length, seedMs: Math.round(t1 - t0),
    zoom: editor.getZoomLevel(), shapesOnPage: editor.getCurrentPageShapeIds().size })
})()`

const INSTRUMENT = `(() => {
  window.__perf = {
    start() {
      this.frames = []; this.on = true; this.longTasks = []
      const loop = (t) => { if (!this.on) return; this.frames.push(t); requestAnimationFrame(loop) }
      requestAnimationFrame(loop)
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) this.longTasks.push(entry.duration)
        })
        this.observer.observe({ entryTypes: ['longtask'] })
      } catch { this.observer = null }
    },
    stop() {
      this.on = false
      this.observer?.disconnect()
      const frames = this.frames
      const gaps = []
      for (let i = 1; i < frames.length; i += 1) gaps.push(frames[i] - frames[i - 1])
      gaps.sort((a, b) => a - b)
      const sum = gaps.reduce((a, b) => a + b, 0)
      return {
        frames: frames.length,
        spanMs: frames.length ? Math.round(frames[frames.length - 1] - frames[0]) : 0,
        meanGapMs: Math.round((sum / (gaps.length || 1)) * 10) / 10,
        p95GapMs: Math.round((gaps[Math.floor(gaps.length * 0.95)] ?? 0) * 10) / 10,
        maxGapMs: Math.round((gaps[gaps.length - 1] ?? 0) * 10) / 10,
        longTasks: this.longTasks.length,
        longTaskMs: Math.round(this.longTasks.reduce((a, b) => a + b, 0)),
      }
    },
  }
  return true
})()`

async function box(page, selector) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  const rect = JSON.parse(value)
  return { ...rect, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }
}

async function scenario(page, name, run) {
  await page.send('Profiler.enable')
  await page.send('Profiler.setSamplingInterval', { interval: 200 })
  await evaluate(page, 'window.__perf.start()')
  await page.send('Profiler.start')
  const t0 = Date.now()
  await run()
  const wallMs = Date.now() - t0
  const { profile } = await page.send('Profiler.stop')
  const frames = JSON.parse(await evaluate(page, 'JSON.stringify(window.__perf.stop())'))
  await page.send('Profiler.disable')
  const cpu = aggregate(profile)
  const result = { name, wallMs, frames, cpu }
  process.stdout.write(
    `  ${name.padEnd(16)} wall ${String(wallMs).padStart(5)}ms  busy ${String(cpu.busyMs).padStart(5)}ms`
    + `  frames ${String(frames.frames).padStart(3)}  mean ${String(frames.meanGapMs).padStart(6)}ms`
    + `  p95 ${String(frames.p95GapMs).padStart(6)}ms  max ${String(frames.maxGapMs).padStart(6)}ms`
    + `  long ${frames.longTasks}/${frames.longTaskMs}ms`
    + `  src ${cpu.buckets.src} tldraw ${cpu.buckets.tldraw} react ${cpu.buckets.react} gc ${cpu.buckets.gc}\n`,
  )
  return result
}

async function dragSteps(page, from, to, steps, stepDelay = 16) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= steps; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps,
      { buttons: 1 })
    await delay(stepDelay)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(200)
}

async function wheel(page, x, y, deltaX, deltaY, count, modifiers = 0) {
  for (let step = 0; step < count; step += 1) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY, modifiers })
    await delay(16)
  }
  await delay(200)
}

async function main() {
  await ensureDir(OUT_DIR)
  const app = await startApp({ label: 'systemsketch-perf', width: 1440, height: 960 })
  const { page, port } = app
  const results = { label: LABEL, blocks: BLOCKS, at: new Date().toISOString(), scenarios: [] }
  try {
    const tLoad = Date.now()
    await openApp(page, port, '')
    await waitFor(page, 'window.__systemsketch?.editor', 'editor')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'canvas')
    results.loadMs = Date.now() - tLoad
    await delay(500)

    const seeded = JSON.parse(await evaluate(page, SEED(BLOCKS)))
    results.seed = seeded
    process.stdout.write(`  seeded ${seeded.blocks} blocks, ${seeded.cables} cables in ${seeded.seedMs}ms; zoom ${seeded.zoom.toFixed(3)}; load ${results.loadMs}ms\n`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length >= ${Math.min(BLOCKS, 8)}`, 'blocks painted')
    await delay(800)
    await evaluate(page, INSTRUMENT)

    const shotBase = await page.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(OUT_DIR, `perf-probe-${LABEL}-board.png`), Buffer.from(shotBase.data, 'base64'))

    results.scenarios.push(await scenario(page, 'idle', () => delay(3000)))

    // What one alt-tab costs: the app window losing focus, then the next frame.
    results.scenarios.push(await scenario(page, 'window-blur', async () => {
      await evaluate(page, `(() => { window.dispatchEvent(new Event('blur')); return true })()`)
      await delay(700)
    }))

    results.scenarios.push(await scenario(page, 'pan', () => wheel(page, 720, 480, 30, 0, 40)))
    await delay(300)
    results.scenarios.push(await scenario(page, 'zoom', async () => {
      await wheel(page, 720, 480, 0, -20, 12, 2)
      await wheel(page, 720, 480, 0, 20, 12, 2)
    }))
    await delay(300)
    await evaluate(page, `(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()`)
    await delay(300)

    // Drag one wired Block by its heading.
    const pick = Math.min(BLOCKS - 1, COLS + 2)
    const heading = await box(page, `[data-shape-id="shape:perf-block-${pick}"] .BlockNode-headingTitle`)
    results.scenarios.push(await scenario(page, 'block-drag', () =>
      dragSteps(page, { x: heading.cx, y: heading.cy }, { x: heading.cx + 60, y: heading.cy + 140 }, 40)))
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)
    await delay(200)

    // Draw a cable from an output across the board to empty space, then decline the offer.
    const dot = await box(page, `[data-shape-id="shape:perf-block-${pick}"] .Port[data-block-port-side="output"][data-block-port-id="out1"]`)
    results.scenarios.push(await scenario(page, 'cable-drag', async () => {
      await dragSteps(page, { x: dot.cx, y: dot.cy }, { x: dot.cx + 90, y: dot.cy + 200 }, 40)
    }))
    if (await evaluate(page, `Boolean(document.querySelector('[data-testid="block-picker"]'))`)) {
      await key(page, 'Escape', 'Escape')
      await delay(200)
    }
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)
    await delay(200)

    // Select everything and move it.
    await evaluate(page, `(() => { window.__systemsketch.editor.selectAll(); return true })()`)
    await delay(300)
    const first = await box(page, `[data-shape-id="shape:perf-block-${pick}"] .BlockNode-headingTitle`)
    results.scenarios.push(await scenario(page, 'select-all-drag', () =>
      dragSteps(page, { x: first.cx, y: first.cy }, { x: first.cx + 40, y: first.cy + 30 }, 40)))
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)

    // Hover across the board: what tldraw's own hover pass costs with our geometry.
    results.scenarios.push(await scenario(page, 'hover-sweep', async () => {
      for (let step = 0; step <= 40; step += 1) {
        await mouse(page, 'mouseMoved', 100 + step * 30, 200 + step * 15)
        await delay(16)
      }
    }))

    const shotEnd = await page.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(OUT_DIR, `perf-probe-${LABEL}-after.png`), Buffer.from(shotEnd.data, 'base64'))
  } finally {
    await writeFile(join(OUT_DIR, `perf-probe-${LABEL}.json`), JSON.stringify(results, null, 2))
    app.close()
  }
  process.stdout.write(`  wrote docs/assets/perf-probe-${LABEL}.json\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exit(1)
})
