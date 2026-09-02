#!/usr/bin/env node
/**
 * State-recorder spike — measures the two things the design rests on, in the
 * real app, before a line of product code exists:
 *
 *   1. The fast channel: how many rows, and how many bytes, a 10-second Block
 *      interaction produces when every input event, state-chart transition,
 *      menu change, store diff and console line is captured off tldraw's public
 *      seams — and what that capture costs the app in milliseconds.
 *   2. The slow channel: how many frames Chrome's own screencast delivers over
 *      the debugging port for the same interaction, how far apart they land,
 *      and how much each one weighs.
 *
 * It runs one representative bug-hunt gesture (draw two Blocks, wire them,
 * move one, open the context menu, zoom) in a throwaway files root, then writes
 * the exact folder the product feature would write, including the clipboard
 * packet as README.md, into docs/assets/recorder-spike/ for the design report.
 *
 * Nothing here touches a real board or Zach's running servers: the harness
 * allocates free ports and a temp files root.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  cables,
  drawBlock,
  dragFrom,
  portDot,
} from '../tests/block_journey_helpers.mjs'

const OUT = join(ROOT, 'docs', 'assets', 'recorder-spike')
const SCRATCH = process.env.RECORDER_SPIKE_SCRATCH ?? join(process.env.CLAUDE_JOB_DIR ?? '/tmp', 'tmp', 'spike', 'frames-full')
const RECORDER_SOURCE = readFileSync(join(ROOT, 'docs', 'recorder_spike_inpage.js'), 'utf8')
const KEEP_GAP_MS = 300 // the subsample committed for the report: at most ~3 frames/s

const pad = (n) => String(Math.max(0, Math.round(n))).padStart(6, '0')
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

async function main() {
  const app = await startApp({ label: 'recorder-spike', build: 'recorder-spike' })
  const { page, port, filesRoot } = app
  const frames = []
  let t0Wall = null
  let screencasting = false

  // Frames arrive as CDP events on the same socket; ack each one or Chrome stops sending.
  page.socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method !== 'Page.screencastFrame') return
    const { data, metadata, sessionId } = message.params
    if (screencasting && t0Wall !== null) {
      frames.push({
        chromeT: metadata?.timestamp ? metadata.timestamp * 1000 - t0Wall : null,
        arrivedT: Date.now() - t0Wall,
        bytes: Buffer.byteLength(data, 'base64'),
        data,
      })
    }
    page.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })

  try {
    const board = join(filesRoot, 'SystemSketch', 'recorder-spike.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'canvas')
    await delay(800)

    // ---- arm: in-page recorder first (it stamps t0), then the screencast
    const header = await evaluate(page, `(${RECORDER_SOURCE})(() => window.__systemsketch.editor)`)
    t0Wall = await evaluate(page, 'window.__ssRecorder.t0Wall')
    await page.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
    screencasting = true
    process.stdout.write(`  armed   path=${header.pathAtStart} shapes=${header.shapeCount} viewport=${header.viewport.w}x${header.viewport.h}\n`)

    // ---- the interaction under test: a plausible "the cable does something odd" hunt
    await drawBlock(page, { x: 300, y: 260 }, { x: 640, y: 460 }, 'camera')
    await addPort(page, 'outputs')
    await delay(350)
    await drawBlock(page, { x: 820, y: 260 }, { x: 1160, y: 460 }, 'detector')
    await addPort(page, 'inputs')
    await delay(350)
    const [camera, detector] = await blockIds(page)
    await clickAt(page, 200, 880) // deselect on empty canvas
    await delay(300)
    await dragFrom(page, await box(page, portDot(camera, 'output', 'out_1')), await box(page, portDot(detector, 'input', 'in_1')), { steps: 14 })
    await delay(400)
    await evaluate(page, `window.__ssRecorder.mark(${JSON.stringify('cable landed — now move the detector and watch the cable')})`)
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

    // ---- disarm
    const result = JSON.parse(await evaluate(page, 'JSON.stringify(window.__ssRecorder.stop())'))
    await delay(250)
    screencasting = false
    await page.send('Page.stopScreencast')
    const cableCount = await cables(page)

    // ---- write the folder the product would write
    await rm(OUT, { recursive: true, force: true })
    await mkdir(join(OUT, 'frames'), { recursive: true })
    await rm(SCRATCH, { recursive: true, force: true })
    await mkdir(SCRATCH, { recursive: true })

    for (const frame of frames) frame.t = frame.chromeT ?? frame.arrivedT
    frames.sort((a, b) => a.t - b.t)
    let lastKept = -Infinity
    const kept = []
    frames.forEach((frame, index) => {
      const last = index === frames.length - 1
      frame.keep = index === 0 || last || frame.t - lastKept >= KEEP_GAP_MS
      if (frame.keep) { lastKept = frame.t; kept.push(frame) }
      frame.file = `f-${pad(frame.t)}.jpg`
    })
    await Promise.all(frames.map((frame) => writeFile(join(SCRATCH, frame.file), Buffer.from(frame.data, 'base64'))))
    await Promise.all(kept.map((frame) => writeFile(join(OUT, 'frames', frame.file), Buffer.from(frame.data, 'base64'))))
    await writeFile(join(OUT, 'frames.jsonl'), frames.map((f) => JSON.stringify({ t: +f.t.toFixed(1), arrivedT: f.arrivedT, bytes: f.bytes, kept: f.keep, file: f.keep ? `frames/${f.file}` : null })).join('\n') + '\n')

    const timeline = result.rows.map((row) => JSON.stringify(row)).join('\n') + '\n'
    await writeFile(join(OUT, 'timeline.jsonl'), timeline)
    const snapshotText = JSON.stringify(result.snapshot)
    await writeFile(join(OUT, 'start.snapshot.json'), snapshotText)
    await writeFile(join(OUT, 'header.json'), JSON.stringify(result.header, null, 2) + '\n')

    // ---- measurements
    const lanes = {}
    for (const row of result.rows) lanes[row.lane] = (lanes[row.lane] ?? 0) + 1
    const inputNames = {}
    for (const row of result.rows) if (row.lane === 'input') inputNames[row.name] = (inputNames[row.name] ?? 0) + 1
    const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
    const transitions = result.rows.filter((row) => row.lane === 'state')
    const consoleRows = result.rows.filter((row) => row.lane === 'console')
    const durationS = result.header.durationMs / 1000
    const metrics = {
      durationMs: result.header.durationMs,
      recorderCostMs: result.header.recorderCostMs,
      recorderOverheadPct: +((result.header.recorderCostMs / result.header.durationMs) * 100).toFixed(2),
      rows: result.rows.length,
      rowsPerLane: lanes,
      inputByName: inputNames,
      timelineBytes: Buffer.byteLength(timeline),
      snapshotBytes: Buffer.byteLength(snapshotText),
      frames: frames.length,
      framesPerSecond: +(frames.length / durationS).toFixed(1),
      frameGapMedianMs: +median(gaps).toFixed(0),
      frameGapMaxMs: +Math.max(0, ...gaps).toFixed(0),
      frameBytesMedian: median(frames.map((f) => f.bytes)),
      frameBytesTotal: frames.reduce((sum, f) => sum + f.bytes, 0),
      framesKept: kept.length,
      framesKeptBytes: kept.reduce((sum, f) => sum + f.bytes, 0),
      clockSkewMedianMs: +median(frames.filter((f) => f.chromeT !== null).map((f) => f.arrivedT - f.chromeT)).toFixed(0),
      stateTransitions: transitions.length,
      consoleRows: consoleRows.length,
      harnessConsoleErrors: localConsoleErrors(page),
      cablesOnBoard: cableCount,
      keepGapMs: KEEP_GAP_MS,
    }
    await writeFile(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n')

    // ---- the clipboard packet, exactly as the product would put it on the clipboard.
    //      Prose first, then absolute paths for the agent to Read — the copy-for-claude shape.
    const abs = (name) => join(OUT, name)
    const marks = result.rows.filter((row) => row.lane === 'mark').map((row) => `  +${(row.t / 1000).toFixed(2)}s  ${row.text}`)
    const transitionLines = transitions.map((row) => `  +${(row.t / 1000).toFixed(2).padStart(6)}s  ${row.from}  →  ${row.to}   (${row.trigger})`)
    const clicks = (inputNames.pointer_down ?? 0)
    const packet = [
      `SystemSketch interaction recording — ${result.header.startedAt}, ${durationS.toFixed(1)} s`,
      `URL ${result.header.url}`,
      `viewport ${result.header.viewport.w}×${result.header.viewport.h} @${result.header.devicePixelRatio}x · state path ${result.header.pathAtStart} → ${result.header.pathAtEnd} · ${result.header.shapeCount} shapes at start`,
      '',
      marks.length ? 'Note from the person recording:' : 'No note was typed.',
      ...marks,
      '',
      `State-chart transitions (${transitions.length}):`,
      ...transitionLines,
      '',
      `Totals: ${lanes.input ?? 0} input events (${inputNames.pointer_move ?? 0} moves, ${clicks} presses, ${inputNames.key_down ?? 0} key downs) · ${lanes.store ?? 0} store diffs · ${lanes.menu ?? 0} menu changes · ${consoleRows.length} console rows · ${kept.length} frames kept of ${frames.length} captured`,
      '',
      'Read these files, in this order:',
      `1. ${abs('README.md')}  — this summary`,
      `2. ${abs('timeline.jsonl')}  — every event, one JSON object per line. \`t\` is ms since start. Lanes: input (what the pointer/keyboard did), state (tldraw state-chart path changes), menu, store (record diffs: add/update/remove with the changed keys), console, mark.`,
      `3. ${abs('frames/')}  — ${kept.length} screenshots named by ms since start (f-${pad(kept[1]?.t ?? 0)}.jpg = +${((kept[1]?.t ?? 0) / 1000).toFixed(3)} s). To see what the screen showed after an event at t, open the first frame with a larger number.`,
      `4. ${abs('start.snapshot.json')}  — the tldraw store (document + session records) at t=0. \`editor.store.loadStoreSnapshot(...)\` reproduces the starting board; the store lane replays from there.`,
      '',
      'Code that owns the states seen above: src/blocks/ports/ (pointing_block_port, dragging_block_port), src/blocks/connections/ (cables, bindings, routing), src/blocks/BlockShapeUtil.tsx (the Block), src/chrome/ (menus).',
      '',
    ].join('\n')
    await writeFile(join(OUT, 'README.md'), packet)

    process.stdout.write(`\n${JSON.stringify(metrics, null, 2)}\n`)
    process.stdout.write(`\nwrote ${OUT}\n  full frame set (${frames.length}) in ${SCRATCH}\n`)
    if (cableCount !== 1) {
      process.stdout.write(`  WARN expected 1 cable on the board, saw ${cableCount}\n`)
    }
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
