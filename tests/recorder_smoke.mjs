#!/usr/bin/env node
/**
 * Real-browser proof of the flight recorder.
 *
 * Every claim is read off the disk the host wrote to and off the painted
 * document, never off the recorder's own report of itself:
 *
 *   1. Preview is idle and unarmed until Start recording is pressed.
 *   2. Start → reproduce → Stop and save writes one folder — packet first,
 *      then timeline, frames, snapshots, playback — and copies the packet.
 *   3. The timeline carries the lanes the design promised, including the DOM
 *      lane that sees keys tldraw never receives, and the packet maps the
 *      states seen to the files that define them.
 *   4. The one-minute safety cap cancels and discards rather than silently
 *      saving a forgotten recording.
 *   5. playback.html opens on its own and renders the frames and the log.
 *   6. Preview and REC notices share a measured collision rule: use the top
 *      row when they fit, otherwise drop below the corner chrome.
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

async function setViewport(page, width, height = 960) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  })
  await delay(350)
}

async function noticeGeometry(page, noticeSelector) {
  return JSON.parse(await evaluate(page, `(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
    }
    return JSON.stringify({
      left: read('[data-testid="systemsketch-top-left-shell"]'),
      notice: read(${JSON.stringify(noticeSelector)}),
      right: read('[data-testid="systemsketch-top-right-shell"]'),
      placement: document.querySelector(${JSON.stringify(noticeSelector)})?.dataset.placement ?? null,
    })
  })()`))
}

function overlaps(a, b) {
  return a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y
}

async function waitForRecorderArmed(apiPort, desired, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const status = await (await fetch(`http://127.0.0.1:${apiPort}/api/recordings/status`)).json()
    if (status.armed === desired) return status
    await delay(80)
  }
  throw new Error(`Timed out waiting for recorder armed=${desired}`)
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

    // ---- 1. idle means genuinely idle, and Preview uses only a fitting row
    const status = await (await fetch(`http://127.0.0.1:${apiPort}/api/recordings/status`)).json()
    check('idle-unarmed', 'opening Preview does not start the recorder or Chrome capture', {
      screencast: status.screencast, armed: status.armed,
    }, { screencast: true, armed: false })

    await setViewport(page, 1990)
    const widePreview = await noticeGeometry(page, '[data-testid="systemsketch-preview-mode"]')
    check('preview-inline-when-fit', 'a wide window keeps Preview in the top chrome gap', {
      placement: widePreview.placement,
      clear: !overlaps(widePreview.left, widePreview.notice) && !overlaps(widePreview.notice, widePreview.right),
    }, { placement: 'inline', clear: true })

    await setViewport(page, 900)
    const narrowPreview = await noticeGeometry(page, '[data-testid="systemsketch-preview-mode"]')
    check('preview-drops-when-tight', 'a tighter window drops Preview below both corner capsules', {
      placement: narrowPreview.placement,
      clear: !overlaps(narrowPreview.left, narrowPreview.notice) && !overlaps(narrowPreview.notice, narrowPreview.right),
    }, { placement: 'below', clear: true })

    // ---- 2. Start is the only capture path in the interface
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-controls"][data-mode="idle"]')`, 'recorder controls')
    await shot(page, 'recorder-dev-menu.png')
    check('note-input-absent', 'the Recording section has no prefatory text input', await evaluate(page, `document.querySelector('[data-testid="recorder-note"]')`), null)
    const splitAtRest = JSON.parse(await evaluate(page, `JSON.stringify({
      primary: document.querySelector('[data-action="start-recording"]').textContent.trim(),
      menu: Boolean(document.querySelector('[data-testid="recorder-menu"]')),
      expanded: document.querySelector('[data-action="more"]').getAttribute('aria-expanded'),
      retrospective: Boolean(document.querySelector('[data-action="save-last"], [data-window], [data-action="toggle"]')),
    })`))
    check('start-stop-rest', 'one quiet split control keeps Start recording directly available', splitAtRest, {
      primary: '● Start recording', menu: false, expanded: 'false', retrospective: false,
    })
    await clickElement(page, '[data-action="more"]')
    const splitMenu = JSON.parse(await evaluate(page, `JSON.stringify({
      copy: Boolean(document.querySelector('[data-testid="recorder-menu"] [data-action="copy-last"]')),
      policy: document.querySelector('[data-testid="recorder-menu"] .systemsketch-recorder__policy').textContent.trim(),
      extraCaptureActions: document.querySelectorAll('[data-testid="recorder-menu"] [data-action]:not([data-action="copy-last"])').length,
    })`))
    check('start-stop-menu', 'the chevron keeps only recovery and the one-minute safety rule', splitMenu, {
      copy: true,
      policy: 'Stop saves and copies · the 1 min limit cancels without saving',
      extraCaptureActions: 0,
    })
    await key(page, 'Escape', 'Escape')
    const escapedMenu = JSON.parse(await evaluate(page, `JSON.stringify({
      menu: Boolean(document.querySelector('[data-testid="recorder-menu"]')),
      controls: Boolean(document.querySelector('[data-testid="recorder-controls"]')),
    })`))
    check('start-stop-escape', 'Escape closes the disclosure without dismissing the Dev panel', escapedMenu, {
      menu: false, controls: true,
    })
    await clickElement(page, '[data-action="more"]')
    await shot(page, 'recorder-split-menu.png')
    await clickElement(page, '[data-action="more"]')
    await clickElement(page, '[data-action="start-recording"]')
    await waitFor(page, `document.querySelector('[data-testid="recorder-indicator"]')`, 'REC notice')
    await waitForRecorderArmed(apiPort, true)

    const activeNotice = await noticeGeometry(page, '[data-testid="recorder-indicator"]')
    const activeNoticeStyle = JSON.parse(await evaluate(page, `(() => {
      const style = getComputedStyle(document.querySelector('[data-testid="recorder-indicator"]'))
      return JSON.stringify({
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
      })
    })()`))
    const activeChrome = JSON.parse(await evaluate(page, `JSON.stringify({
      previewVisible: Boolean(document.querySelector('[data-testid="systemsketch-preview-mode"]')),
      text: document.querySelector('[data-testid="recorder-indicator"]').textContent.replace(/\\s+/g, ' ').trim(),
    })`))
    check('rec-notice-priority', 'REC replaces passive Preview status and clears the corner chrome', {
      previewVisible: activeChrome.previewVisible,
      placement: activeNotice.placement,
      clear: !overlaps(activeNotice.left, activeNotice.notice) && !overlaps(activeNotice.notice, activeNotice.right),
      labels: /REC/.test(activeChrome.text) && /1 min/.test(activeChrome.text) && /Stop and save/.test(activeChrome.text),
      styled: activeNoticeStyle.borderTopWidth === '1px' && activeNoticeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
    }, { previewVisible: false, placement: 'below', clear: true, labels: true, styled: true })
    await shot(page, 'recorder-rec-bar.png')
    await setViewport(page, 1440)

    // Reproduce the bug while the explicit take is active.
    await clickAt(page, 200, 880)
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
    await key(page, 'Escape', 'Escape')
    await delay(400)

    await clickElement(page, '[data-testid="recorder-indicator"] button')
    await waitFor(page, `!document.querySelector('[data-testid="recorder-indicator"]')`, 'manual Stop and save', 30000)
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-testid="recorder-status"]')?.textContent.includes('Saved')`, 'saved status', 30000)
    await shot(page, 'recorder-saved.png')
    await clickElement(page, '[data-action="more"]')
    await waitFor(page, `!document.querySelector('[data-testid="recorder-last-path"]').textContent.includes('Nothing saved')`, 'saved recording recovery surface')

    let clipboard = null
    try {
      clipboard = await evaluate(page, 'navigator.clipboard.readText()')
    } catch (error) {
      clipboard = `unreadable: ${error.message}`
    }
    const copiedMark = await evaluate(page, `document.querySelector('[data-clipboard="copied"]')?.textContent.trim()`)
    check('clipboard-state', 'Stop and save reports the clipboard write as done', copiedMark, 'Packet copied')

    const folders = await recordingFolders(filesRoot)
    check('one-folder', 'exactly one recording folder exists after one save', folders.length, 1)
    const first = await readRecording(folders[0])
    check('folder-files', 'the folder carries the packet, timeline, snapshots, frames and viewer',
      ['README.md', 'end.snapshot.json', 'frames', 'frames.jsonl', 'header.json', 'playback.html', 'start.snapshot.json', 'states.json', 'timeline.jsonl'].every((name) => first.files.includes(name)), true)
    check('packet-first-line', 'the packet opens with the recording headline', first.packet.startsWith('SystemSketch interaction recording'), true)
    check('packet-without-ui-note', 'saving without a UI note produces a complete, path-bearing packet', {
      emptyHeaderNote: first.header.note === '',
      omitsLegacyNoNote: !first.packet.includes('No note was typed.'),
      hasTimelinePath: first.packet.includes(`${folders[0]}/timeline.jsonl`),
    }, { emptyHeaderNote: true, omitsLegacyNoNote: true, hasTimelinePath: true })
    check('packet-paths', 'the packet points at the folder by absolute path', first.packet.includes(`${folders[0]}/timeline.jsonl`), true)
    check('packet-on-clipboard', 'the clipboard holds the packet verbatim', typeof clipboard === 'string' && clipboard === first.packet, true)
    check('header-mode', 'the saved recording is an explicit take on Preview', { mode: first.header.mode, channel: first.header.channel, framesSource: first.header.framesSource }, { mode: 'take', channel: 'preview', framesSource: 'screencast' })

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
    check('snapshots', 'the take snapshot begins at Start and the end contains the reproduction', {
      start: Object.values(JSON.parse(await readFile(join(folders[0], 'start.snapshot.json'), 'utf8')).store).filter((record) => record.typeName === 'shape').length,
      end: Object.values(JSON.parse(await readFile(join(folders[0], 'end.snapshot.json'), 'utf8')).store).filter((record) => record.typeName === 'shape').length,
    }, { start: 0, end: 3 })

    // ---- 3. playback.html stands on its own
    await page.send('Page.navigate', { url: `file://${folders[0]}/playback.html#t=${Math.round(first.header.durationMs)}` })
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

    // ---- 4. the one-minute timer cancels and discards
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor seam again')
    await delay(600)
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `document.querySelector('[data-action="start-recording"]')`, 'Start recording again')
    await evaluate(page, `(() => {
      const original = window.setTimeout.bind(window)
      window.__restoreRecorderTimeout = () => { window.setTimeout = original }
      window.setTimeout = (callback, delay, ...args) => original(callback, delay === 60000 ? 350 : delay, ...args)
      return true
    })()`)
    await clickElement(page, '[data-action="start-recording"]')
    await waitFor(page, `document.querySelector('[data-testid="recorder-indicator"]')`, 'REC notice before cancellation')
    await evaluate(page, `window.__restoreRecorderTimeout()`)
    await waitFor(page, `document.querySelector('[data-testid="recorder-status"]')?.textContent.includes('Cancelled')`, 'one-minute cancellation', 5000)
    await waitForRecorderArmed(apiPort, false)
    check('limit-cancels', 'the one-minute safety timer returns to idle without saving', {
      indicator: Boolean(await evaluate(page, `document.querySelector('[data-testid="recorder-indicator"]')`)),
      folders: (await recordingFolders(filesRoot)).length,
      status: await evaluate(page, `document.querySelector('[data-testid="recorder-status"]').textContent.trim()`),
    }, { indicator: false, folders: 1, status: 'Cancelled · nothing saved' })

    // ---- 5. the isolated preset has the same explicit control
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'preset editor')
    await waitFor(page, `document.querySelector('.systemsketch-recorder--compact')`, 'compact recorder controls')
    check('preset-controls', 'the Block Dev preset carries the same compact Start control', JSON.parse(await evaluate(page, `JSON.stringify({
      split: Boolean(document.querySelector('.systemsketch-recorder--compact [data-testid="recorder-split"]')),
      primary: document.querySelector('.systemsketch-recorder--compact [data-action="start-recording"]')?.textContent.trim(),
      persistentButtons: document.querySelectorAll('.systemsketch-recorder--compact button').length,
    })`)), { split: true, primary: '● Start recording', persistentButtons: 2 })

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
