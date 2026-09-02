#!/usr/bin/env node
/**
 * Real-browser proof of the flight recorder.
 *
 * Every claim is read off the disk the host wrote to and off the painted
 * document, never off the recorder's own report of itself:
 *
 *   1. In Preview the recorder is armed by default and the host can screencast
 *      the window over Chrome's debugging port.
 *   2. "Save the last 30 s" writes one folder — packet first, then timeline,
 *      frames, snapshots, playback — and puts the packet on the clipboard.
 *   3. The timeline carries the lanes the design promised, including the DOM
 *      lane that sees keys tldraw never receives, and the packet maps the
 *      states seen to the files that define them.
 *   4. An explicit take shows the red bar, stops itself at the cap, and saves
 *      a folder without touching the clipboard.
 *   5. playback.html opens on its own and renders the frames and the log.
 *   6. The toggle turns recording off, and the choice survives a reload.
 *
 * The journey works in a throwaway files root, so it can never touch a real
 * board or a real recordings folder.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { addPort, box, drawBlock, dragFrom, portDot, shot } from './block_journey_helpers.mjs'

const RESULTS = join(ROOT, 'docs', 'assets', 'recorder-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n        desired= ${JSON.stringify(desired)}\n`),
  )
  return ok
}

/**
 * Blocks by title. A fixture lookup, not an assertion: the painted order of
 * shapes follows their ids, not their creation, so "first Block" is a coin flip.
 */
async function blocksByTitle(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(Object.fromEntries(
    window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'block')
      .map((shape) => [shape.props.title, shape.id])))`))
}

async function recordingFolders(filesRoot) {
  const root = join(filesRoot, 'SystemSketch', 'recordings')
  try {
    return (await readdir(root)).filter((name) => !name.startsWith('.')).sort().map((name) => join(root, name))
  } catch {
    return []
  }
}

async function readRecording(folder) {
  const header = JSON.parse(await readFile(join(folder, 'header.json'), 'utf8'))
  const rows = (await readFile(join(folder, 'timeline.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const frames = (await readFile(join(folder, 'frames.jsonl'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const packet = await readFile(join(folder, 'README.md'), 'utf8')
  const files = (await readdir(folder)).sort()
  const frameFiles = (await readdir(join(folder, 'frames'))).sort()
  return { header, rows, frames, packet, files, frameFiles }
}

async function main() {
  const app = await startApp({ label: 'recorder-smoke', build: 'recorder-smoke', cdpToApi: true })
  const { page, port, apiPort, filesRoot } = app
  try {
    await page.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: `http://127.0.0.1:${port}`,
    }).catch(() => undefined)

    const board = join(filesRoot, 'SystemSketch', 'recorder-proof.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'canvas')
    await delay(900)

    // ---- 1. armed by default, screencast available
    const status = await (await fetch(`http://127.0.0.1:${apiPort}/api/recordings/status`)).json()
    check('armed-by-default', 'the host was armed for screencast frames by the page on mount', { screencast: status.screencast, armed: status.armed }, { screencast: true, armed: true })

    // ---- the interaction under test
    await drawBlock(page, { x: 300, y: 260 }, { x: 640, y: 460 }, 'camera')
    await addPort(page, 'outputs')
    await delay(300)
    await drawBlock(page, { x: 820, y: 260 }, { x: 1160, y: 460 }, 'detector')
    await addPort(page, 'inputs')
    await delay(300)
    const blocks = await blocksByTitle(page)
    await clickAt(page, 200, 880)
    await delay(250)
    await dragFrom(page, await box(page, portDot(blocks.camera, 'output', 'out_1')), await box(page, portDot(blocks.detector, 'input', 'in_1')), { steps: 12 })
    await delay(300)
    await key(page, 'Escape', 'Escape') // a key tldraw does not always see: the DOM lane must
    await delay(400)

    // ---- 2. save the last 30 s from the Dev menu
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"][data-enabled="true"]')`, 'recorder rows')
    await shot(page, 'recorder-dev-menu.png')
    check('note-input-absent', 'the Recording section has no prefatory text input', await evaluate(page, `document.querySelector('[data-testid="recorder-note"]')`), null)
    await clickElement(page, '[data-action="save-last"]')
    await waitFor(page, `!document.querySelector('[data-testid="recorder-last-path"]').textContent.includes('Nothing saved')`, 'a saved recording', 30000)
    await delay(300)
    await shot(page, 'recorder-saved.png')

    let clipboard = null
    try {
      clipboard = await evaluate(page, 'navigator.clipboard.readText()')
    } catch (error) {
      clipboard = `unreadable: ${error.message}`
    }
    const copiedMark = await evaluate(page, `document.querySelector('[data-action="copy-last"] em')?.textContent`)
    check('clipboard-state', 'the Copy row reports the clipboard write as done', copiedMark, 'Copied')

    const folders = await recordingFolders(filesRoot)
    check('one-folder', 'exactly one recording folder exists after one save', folders.length, 1)
    const first = await readRecording(folders[0])
    check('folder-files', 'the folder carries the packet, timeline, snapshots, frames and viewer',
      ['README.md', 'end.snapshot.json', 'frames', 'frames.jsonl', 'header.json', 'playback.html', 'start.snapshot.json', 'states.json', 'timeline.jsonl'].every((name) => first.files.includes(name)), true)
    check('packet-first-line', 'the packet opens with the recording headline', first.packet.startsWith('SystemSketch interaction recording'), true)
    check('packet-without-ui-note', 'saving without a UI note produces a complete, path-bearing packet', {
      emptyHeaderNote: first.header.note === '',
      saysNoNote: first.packet.includes('No note was typed.'),
      hasTimelinePath: first.packet.includes(`${folders[0]}/timeline.jsonl`),
    }, { emptyHeaderNote: true, saysNoNote: true, hasTimelinePath: true })
    check('packet-paths', 'the packet points at the folder by absolute path', first.packet.includes(`${folders[0]}/timeline.jsonl`), true)
    check('packet-on-clipboard', 'the clipboard holds the packet verbatim', typeof clipboard === 'string' && clipboard === first.packet, true)
    check('header-mode', 'a retroactive save is stamped as such, on the preview channel', { mode: first.header.mode, channel: first.header.channel, framesSource: first.header.framesSource }, { mode: 'last', channel: 'preview', framesSource: 'screencast' })

    const lanes = new Set(first.rows.map((row) => row.lane))
    check('lanes', 'the timeline carries input, state, store and DOM lanes', ['input', 'state', 'store', 'dom'].every((lane) => lanes.has(lane)), true)
    check('dom-keydown', 'the DOM lane saw the Escape key-down', first.rows.some((row) => row.lane === 'dom' && row.event === 'keydown' && row.key === 'Escape'), true)
    check('state-port', 'the state lane saw the port press that started the cable', first.rows.some((row) => row.lane === 'state' && row.to === 'select.pointing_block_port'), true)
    check('rows-rebased', 'every row is inside the window, from t=0', first.rows.every((row) => row.t >= 0 && row.t <= first.header.windowMs), true)
    check('states-mapped', 'the packet maps pointing_block_port to the file that defines it', /pointing_block_port\s+src\/blocks\//.test(first.packet), true)
    const maxFrames = Math.ceil(first.header.durationMs / 300) + 2
    check('frames-kept', 'screencast frames exist, named by ms, and stay within one per 300 ms',
      { some: first.frames.length > 0, capped: first.frames.length <= maxFrames, named: first.frameFiles.every((name) => /^f-\d{6}\.jpg$/.test(name)), listed: first.frameFiles.length === first.frames.length },
      { some: true, capped: true, named: true, listed: true })
    const firstFrameFile = first.frameFiles[0]
    const bytes = firstFrameFile ? (await readFile(join(folders[0], 'frames', firstFrameFile))).length : 0
    check('frame-is-jpeg', 'a kept frame is a real JPEG', bytes > 1000, true)
    check('snapshots', 'the start snapshot is rewound: it holds fewer shapes than the end', {
      start: Object.values(JSON.parse(await readFile(join(folders[0], 'start.snapshot.json'), 'utf8')).store).filter((record) => record.typeName === 'shape').length,
      end: Object.values(JSON.parse(await readFile(join(folders[0], 'end.snapshot.json'), 'utf8')).store).filter((record) => record.typeName === 'shape').length,
    }, { start: 0, end: 3 })

    // ---- 3. an explicit take at the 5 s cap: red bar, auto-stop, no clipboard
    await clickElement(page, '[data-window="5000"]')
    await evaluate(page, `navigator.clipboard.writeText('sentinel').catch(() => undefined)`)
    await clickElement(page, '[data-action="take"]')
    await waitFor(page, `document.querySelector('[data-testid="recorder-indicator"]')`, 'REC bar')
    const barText = await evaluate(page, `document.querySelector('[data-testid="recorder-indicator"]').textContent`)
    check('rec-bar', 'the REC bar is painted at the top while the take runs', /REC/.test(barText) && /5 s/.test(barText), true)
    await shot(page, 'recorder-rec-bar.png')
    // Move the detector while the take runs, pressing on its body rather than its title.
    const detector = await box(page, `[data-shape-id="${blocks.detector}"]`)
    await mouse(page, 'mouseMoved', detector.cx, detector.cy + 40)
    await mouse(page, 'mousePressed', detector.cx, detector.cy + 40, { buttons: 1 })
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved', detector.cx + 6 * step, detector.cy + 40 + 12 * step, { buttons: 1 })
      await delay(30)
    }
    await mouse(page, 'mouseReleased', detector.cx + 60, detector.cy + 160)
    const takeStarted = Date.now()
    await waitFor(page, `!document.querySelector('[data-testid="recorder-indicator"]')`, 'the take to stop itself', 12000)
    const stoppedAfter = Date.now() - takeStarted
    check('take-auto-stop', 'the take stopped itself once the cap passed', stoppedAfter < 9000, true)
    // Dragging on the canvas dismissed the Dev panel (outside click), so open it again.
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"][data-mode="idle"]')`, 'the recorder to be idle again')
    await delay(400)
    const afterTake = await recordingFolders(filesRoot)
    check('take-folder', 'the take wrote a second folder', afterTake.length, 2)
    const take = await readRecording(afterTake[1])
    check('take-header', 'the take is stamped as a take and lasted about the cap', { mode: take.header.mode, capped: take.header.durationMs >= 4500 && take.header.durationMs <= 6500 }, { mode: 'take', capped: true })
    check('take-translating', 'the take saw the Block being dragged', take.rows.some((row) => row.lane === 'state' && row.to === 'select.translating'), true)
    check('take-frames-capped', 'the take kept at most one frame per 300 ms over its cap', take.frames.length <= Math.ceil(take.header.durationMs / 300) + 2 && take.frames.length > 0, true)
    let clipboardAfterTake = null
    try { clipboardAfterTake = await evaluate(page, 'navigator.clipboard.readText()') } catch { clipboardAfterTake = null }
    check('take-no-clipboard', 'an auto-stopped take leaves the clipboard alone', clipboardAfterTake, 'sentinel')

    // ---- 4. playback.html stands on its own
    await page.send('Page.navigate', { url: `file://${afterTake[0]}/playback.html#t=${Math.round(first.header.durationMs)}` })
    await waitFor(page, `document.querySelectorAll('#log div').length > 0`, 'playback log')
    await waitFor(page, `document.querySelector('#frame').naturalWidth > 0`, 'playback frame image')
    const playback = JSON.parse(await evaluate(page, `JSON.stringify({
      logLines: document.querySelectorAll('#log div').length,
      strip: document.querySelectorAll('#strip img').length,
      frameLoaded: document.querySelector('#frame').naturalWidth > 0,
      title: document.title,
    })`))
    check('playback', 'playback.html renders the log, the filmstrip and a loaded frame', { lines: playback.logLines > 0, strip: playback.strip === first.frames.length, frame: playback.frameLoaded }, { lines: true, strip: true, frame: true })
    await shot(page, 'recorder-playback.png')

    // ---- 5. the toggle, and its persistence
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam again')
    await delay(600)
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"]')`, 'recorder rows again')
    await clickElement(page, '[data-action="toggle"]')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"][data-enabled="false"]')`, 'recorder off')
    const offState = JSON.parse(await evaluate(page, `JSON.stringify({
      saveDisabled: document.querySelector('[data-action="save-last"]').disabled,
      stored: localStorage.getItem('systemsketch.recorder.enabled.v1'),
    })`))
    check('toggle-off', 'turning the recorder off disables Save and persists the choice', offState, { saveDisabled: true, stored: 'off' })
    await delay(300)
    const disarmed = await (await fetch(`http://127.0.0.1:${apiPort}/api/recordings/status`)).json()
    check('toggle-disarms-host', 'the host stops the screencast when the page turns recording off', disarmed.armed, false)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam after reload')
    await delay(500)
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"]')`, 'recorder rows after reload')
    check('toggle-persists', 'the off choice survives a reload', await evaluate(page, `document.querySelector('[data-testid="recorder-controls"]').dataset.enabled`), 'false')
    await clickElement(page, '[data-action="toggle"]')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"][data-enabled="true"]')`, 'recorder on again')

    // ---- 6. the isolated preset has the compact controls too
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'preset editor')
    await waitFor(page, `document.querySelector('.systemsketch-recorder--compact')`, 'compact recorder controls')
    check('preset-controls', 'the Block Dev preset carries the compact recorder controls', await evaluate(page, `document.querySelectorAll('.systemsketch-recorder--compact button').length`), 4)

    const consoleErrors = localConsoleErrors(page)
    check('console-clean', 'the journey raised no local console errors', consoleErrors, [])

    const failed = results.filter((result) => !result.ok)
    if (failed.length) {
      process.stdout.write(`\n${failed.length} check(s) failed\n`)
      process.exitCode = 1
      return
    }
    // The run's own record, for the report builder. Written last, so it
    // exists only if every check above actually passed. The first packet
    // travels with it, so the report can show a real one.
    await writeFile(join(ROOT, 'docs', 'assets', 'recorder-sample-packet.txt'), first.packet)
    await writeFile(join(ROOT, 'docs', 'assets', 'recorder-sample-timeline.jsonl'), first.rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
    await writeFile(RESULTS, JSON.stringify(results, null, 1))
    process.stdout.write(`\nall ${results.length} checks passed · ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
