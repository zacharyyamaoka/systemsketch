#!/usr/bin/env node
/**
 * Real-browser proof of the port-lane prototype (`?portLanes=1`): a Port
 * view's inputs and outputs are two multi-line code fields, one line per
 * port. Clicking the left half of the Block opens the inputs lane with the
 * caret on the clicked port's line; the right half opens the outputs lane,
 * parked just past the right edge and typed the ordinary way. Moving a line
 * (Ctrl+↑, the Alt form is CodeMirror's own) reorders the ports and keeps
 * their ids, Enter adds a port, Shift+Alt+↓ duplicates one, Ctrl+Enter
 * commits, and every other way into a port (double-click, the + bead) opens
 * the lane too — never the one-port editor.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const MEDIA = join(ROOT, 'reports', 'media', 'port-signature-field')
const RESULTS = join(MEDIA, 'port-lanes-results.json')
const shotPath = (name) => join(MEDIA, `port-lanes-${name}.png`)

const BLOCK = 'shape:estimate'
const INPUT_LANE = '[data-testid="block-inline-port-lane-inputs"]'
const OUTPUT_LANE = '[data-testid="block-inline-port-lane-outputs"]'
const EMPTY_CANVAS = { x: 200, y: 860 }
const ALT = 1
const CTRL = 2
const SHIFT = 8

const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

async function laneState(page, selector) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const content = el.querySelector('.cm-content')
    const lines = Array.from(content?.querySelectorAll('.cm-line') ?? [])
    const selection = window.getSelection()
    const anchor = selection?.anchorNode
    const anchorLine = anchor ? (anchor.nodeType === 1 ? anchor : anchor.parentElement)?.closest('.cm-line') : null
    return {
      text: content?.textContent ?? null,
      lines: lines.map((line) => line.textContent),
      caretLine: anchorLine ? lines.indexOf(anchorLine) : null,
      focused: el.contains(document.activeElement),
      align: content ? getComputedStyle(content).textAlign : null,
      left: el.getBoundingClientRect().left,
      lineHeights: lines.map((line) => Math.round(line.getBoundingClientRect().height)),
    }
  })())`))
}

async function storedPorts(page, side) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props[${JSON.stringify(side)}].map((port) => [port.id, port.name, port.type, port.defaultValue ?? null])
  )`))
}

async function paintedNames(page, lane) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--${lane} .BlockNode-portName')).map((node) => node.textContent)
  )`))
}

async function blockBox(page) {
  return elementBox(page, `[data-shape-id=${JSON.stringify(BLOCK)}] .systemsketch-block-canvas`)
}

/** The painted NAME span of one port, for a per-character click. */
async function nameBox(page, lane, name) {
  const box = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const spans = Array.from(document.querySelectorAll('[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--${lane} .BlockNode-portName'))
    const span = spans.find((node) => node.textContent === ${JSON.stringify(name)})
    const rect = span?.getBoundingClientRect()
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
  })())`))
  assert.ok(box, `a painted ${lane} name span reading ${name}`)
  return box
}

/** The painted label of one port, found by its name (nth-of-type counts other siblings). */
async function labelBox(page, lane, name) {
  const box = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const labels = Array.from(document.querySelectorAll('[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--${lane}'))
    const label = labels.find((node) => node.querySelector('.BlockNode-portName')?.textContent === ${JSON.stringify(name)})
    const rect = label?.getBoundingClientRect()
    return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
  })())`))
  assert.ok(box, `a painted ${lane} label named ${name}`)
  return box
}

/** Pick a port-editor variant from the bottom-right prototype drop-down. */
async function choosePrototype(page, mode) {
  await evaluate(page, `(() => {
    const select = document.querySelector('[aria-label="Port editor prototype"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, ${JSON.stringify(mode)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
    return select.value
  })()`)
  await waitFor(page, `document.querySelector('[aria-label="Port editor prototype"]')?.value === ${JSON.stringify(mode)}`, `the switch to read ${mode}`)
  await delay(120)
}

async function seedBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShapes([{
      id: ${JSON.stringify(BLOCK)}, type: 'block', x: 520, y: 240,
      props: {
        title: 'estimate', view: 'port', w: 420, h: 260,
        inputs: [
          { id: 'in_1', name: 'pose', type: 'Pose', visible: true, defaultValue: 'None' },
          { id: 'in_2', name: 'frame', type: 'Frame', visible: true },
          { id: 'in_3', name: 'gain', type: 'float', visible: true, defaultValue: '1.0' },
        ],
        outputs: [
          { id: 'out_1', name: 'pose', type: 'Pose', visible: true },
          { id: 'out_2', name: 'quality', type: 'float', visible: true },
        ],
      },
    }])
    editor.select(${JSON.stringify(BLOCK)})
    return true
  })()`)
}

async function main() {
  await ensureDir(MEDIA)
  const app = await startApp({ label: 'port-lanes', build: 'port-lanes-smoke', width: 1440, height: 960 })
  const { page, port, filesRoot } = app
  try {
    const board = join(filesRoot, 'SystemSketch', 'port-lanes.systemsketch')
    // No URL flag: the prototype is switched on from the in-app drop-down in
    // the bottom-right corner, the way a person reviewing it would.
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the SystemSketch product canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'editor seam')
    await waitFor(page, `document.querySelector('[aria-label="Port editor prototype"]')`, 'the prototype switch')
    await choosePrototype(page, 'lanes')
    await seedBoard(page)
    await delay(300)

    // ------------------------------------- left half opens the inputs lane ---
    const frameLabel = await labelBox(page, 'in', 'frame')
    const box = await blockBox(page)
    // Click in the body to the right of the frame label but still in the
    // left half — bare body, not a painted span.
    await clickAt(page, box.x + box.width * 0.35, frameLabel.y + frameLabel.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'the inputs lane editor', 5000)
    const opened = await laneState(page, INPUT_LANE)
    assert.deepEqual(opened.lines, ['pose: Pose = None', 'frame: Frame', 'gain: float = 1.0'], 'the lane spells every input, one per line')
    assert.equal(opened.focused, true, 'the lane takes focus')
    assert.equal(opened.caretLine, 1, 'the caret opens on the line of the port that was clicked')
    assert.ok(opened.lineHeights.every((height) => Math.abs(height - opened.lineHeights[0]) <= 1), 'every line has the same pinned height')
    assert.deepEqual(await paintedNames(page, 'in'), [], 'the painted input labels step aside while their lane is open')
    assert.deepEqual(await paintedNames(page, 'out'), ['pose', 'quality'], 'the other side keeps its labels')
    await shot(page, 'inputs-open')
    pass('a click on the left half opens the inputs lane: one line per port, caret on the clicked port, painted labels hidden')

    // ------------------------------------------ the caret lands on the character ---
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const gainName = await nameBox(page, 'in', 'gain')
    // Click just past the 'g' of "gain": the nearest caret boundary is 1.
    const charWidth = gainName.width / 4
    await clickAt(page, gainName.x + charWidth * 1.3, gainName.y + gainName.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'the inputs lane again', 5000)
    const caret = await evaluate(page, `(() => {
      const view = document.querySelector(${JSON.stringify(INPUT_LANE)} + ' .cm-content')?.cmView?.view
      if (!view) return null
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      return JSON.stringify({ line: line.number - 1, column: head - line.from })
    })()`)
    assert.deepEqual(JSON.parse(caret), { line: 2, column: 1 }, `the caret opens beside the character that was clicked, not at the line start — got ${caret}`)
    pass('per-character: the caret lands next to the clicked character of the clicked port')

    // A click on the bare body to the right of a line's text lands at its end.
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const frameRow = await labelBox(page, 'in', 'frame')
    const blockBox0 = await blockBox(page)
    await clickAt(page, blockBox0.x + blockBox0.width * 0.42, frameRow.y + frameRow.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'the inputs lane from the bare body', 5000)
    const caretEnd = JSON.parse(await evaluate(page, `(() => {
      const view = document.querySelector(${JSON.stringify(INPUT_LANE)} + ' .cm-content')?.cmView?.view
      const head = view.state.selection.main.head
      const line = view.state.doc.lineAt(head)
      return JSON.stringify({ line: line.number - 1, column: head - line.from, length: line.length })
    })()`))
    assert.deepEqual(caretEnd, { line: 1, column: caretEnd.length, length: caretEnd.length }, 'a click past the text puts the caret at the end of that line')
    pass('a click on the body to the right of a line lands the caret at the end of that line')

    // ------------------------------------------- a long line folds when left ---
    // The caret is at the end of frame's line; step down onto gain's.
    await key(page, 'ArrowDown', 'ArrowDown')
    await key(page, 'End', 'End')
    await typeSlowly(page, ' + some_very_long_expression_that_keeps_going(frame, pose)')
    const longLine = (await laneState(page, INPUT_LANE)).lines[2]
    assert.ok(longLine.length > 40, 'the active line shows everything while it is typed')
    await key(page, 'ArrowUp', 'ArrowUp')
    await delay(150)
    const folded = await laneState(page, INPUT_LANE)
    assert.ok(folded.lines[2].endsWith('…') && folded.lines[2].length < 40, `a line the caret left folds to an ellipsis, got ${JSON.stringify(folded.lines[2])}`)
    assert.ok(await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(INPUT_LANE)} + ' .ss-lane-ellipsis'))`), 'the fold is the ellipsis widget')
    await key(page, 'ArrowDown', 'ArrowDown')
    await delay(150)
    assert.ok(!(await laneState(page, INPUT_LANE)).lines[2].endsWith('…'), 'moving back onto the line unfolds it')
    await shot(page, 'folded')
    // Put the line back so the rest of the journey reads as before.
    await shortcut(page, 'a', 'KeyA', 2)
    await typeSlowly(page, 'pose: Pose = None')
    await key(page, 'Enter', 'Enter')
    await typeSlowly(page, 'frame: Frame')
    await key(page, 'Enter', 'Enter')
    await typeSlowly(page, 'gain: float = 1.0')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs.length === 3 && window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[2].defaultValue === '1.0'`, 'the lane restored')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    pass('a long line runs to the right while active and folds to … once the caret leaves it')

    // ------------------------------------------------ the ⤢ opens a viewer ---
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const frameAgain = await labelBox(page, 'in', 'frame')
    await clickAt(page, frameAgain.x + 16, frameAgain.y + frameAgain.height / 2)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-lane-expand-inputs"]')`, 'the ⤢ button', 5000)
    await clickElement(page, '[data-testid="block-inline-port-lane-expand-inputs"]')
    await waitFor(page, `document.querySelector('[data-testid="block-lane-viewer"] .cm-content')`, 'the lane viewer', 5000)
    const viewerText = await evaluate(page, `document.querySelector('[data-testid="block-lane-viewer"] .cm-content')?.textContent`)
    assert.equal(viewerText, 'pose: Pose = Noneframe: Framegain: float = 1.0', 'the viewer shows the same lane document')
    const viewerStyle = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const viewer = document.querySelector('[data-testid="block-lane-viewer"]')
      const panel = viewer?.querySelector('.BlockNode-laneViewer__panel')
      const panelStyle = panel ? getComputedStyle(panel) : null
      return {
        insideThemeRoot: Boolean(viewer?.closest('[data-ss-theme]')),
        panelBackground: panelStyle?.backgroundColor ?? null,
        panelColor: panelStyle?.color ?? null,
        scrim: viewer ? getComputedStyle(viewer).backgroundColor : null,
      }
    })())`))
    assert.equal(viewerStyle.insideThemeRoot, true, 'the viewer lives inside the theme root, where the colour tokens are')
    assert.notEqual(viewerStyle.panelBackground, 'rgba(0, 0, 0, 0)', 'the panel has a painted background')
    assert.notEqual(viewerStyle.panelColor, viewerStyle.panelBackground, 'its ink is not its paper')
    assert.notEqual(viewerStyle.scrim, 'rgba(0, 0, 0, 0)', 'the scrim is visible')
    await shot(page, 'viewer')
    // The completion popup paints INSIDE the modal, and Escape dismisses it before the viewer.
    await key(page, 'End', 'End')
    await evaluate(page, `(() => { const view = document.querySelector('[data-testid="block-lane-viewer"] .cm-content')?.cmView?.view; view.dispatch({ selection: { anchor: view.state.doc.length } }); return true })()`)
    await key(page, 'Enter', 'Enter')
    await typeSlowly(page, 'z: P')
    await waitFor(page, `document.querySelector('[data-testid="block-lane-viewer"] .cm-tooltip-autocomplete')`, 'a completion popup inside the viewer', 5000)
    const popup = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const tip = document.querySelector('[data-testid="block-lane-viewer"] .cm-tooltip-autocomplete')
      const rect = tip.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + 8, rect.y + 8)
      return { inside: Boolean(tip.closest('.BlockNode-laneViewer__panel')), onTop: Boolean(top && tip.contains(top)), labels: Array.from(tip.querySelectorAll('.cm-completionLabel')).map((n) => n.textContent) }
    })())`))
    assert.equal(popup.inside, true, 'the popup lives inside the viewer panel')
    assert.equal(popup.onTop, true, 'and is painted above the scrim, where it can be seen')
    assert.ok(popup.labels.length > 0, 'offering types for the slot')
    await shot(page, 'viewer-completion')
    await key(page, 'Escape', 'Escape')
    await delay(120)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="block-lane-viewer"]'))`), true, 'the first Escape closes only the popup')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="block-lane-viewer"] .cm-tooltip-autocomplete'))`), false, 'the popup is gone')
    await shortcut(page, 'z', 'KeyZ', 2)
    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs.length === 3`, 'undo to take the typed line back out', 5000)
    // Tab must not strand the person behind the scrim: focus stays in, Escape still closes.
    await key(page, 'Tab', 'Tab')
    await delay(120)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="block-lane-viewer"]')?.contains(document.activeElement))`), true, 'focus stays inside the viewer after Tab')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="block-lane-viewer"]') && !document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the viewer and the lane')
    pass('the ⤢ in the lane\'s corner opens the same document in a bigger wrapped viewer')

    // Re-open for the rest of the journey exactly where it was.
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const frameLabel2 = await labelBox(page, 'in', 'frame')
    const box1 = await blockBox(page)
    await clickAt(page, box1.x + box1.width * 0.35, frameLabel2.y + frameLabel2.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'the inputs lane once more', 5000)

    // ------------------------------------- Alt+Up moves a port, keeps its id ---
    await key(page, 'ArrowUp', 'ArrowUp', CTRL)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[0].id === 'in_2'`, 'the moved line to reorder the ports', 5000)
    assert.deepEqual(await storedPorts(page, 'inputs'), [
      ['in_2', 'frame', 'Frame', null], ['in_1', 'pose', 'Pose', 'None'], ['in_3', 'gain', 'float', '1.0'],
    ], 'ids travel with their lines, so cables stay attached')
    assert.deepEqual(await paintedNames(page, 'in'), [], 'the painted labels stay hidden while the lane is open — the lane is the text')
    await shot(page, 'moved-up')
    pass('Ctrl+↑ moves the port like a line in an IDE, and the port keeps its id')

    // ------------------------------------------- Enter adds, typing fills ---
    await key(page, 'End', 'End')
    await key(page, 'Enter', 'Enter')
    await typeSlowly(page, 'yaw: float = 0')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs.length === 4 && window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[1].defaultValue === '0'`, 'the new line to become a port', 5000)
    const after = await storedPorts(page, 'inputs')
    assert.deepEqual(after.map((entry) => entry[0]), ['in_2', 'in_4', 'in_1', 'in_3'], 'a new line is a new port with a fresh id, in place')
    assert.deepEqual(after[1], ['in_4', 'yaw', 'float', '0'])
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--in').length`), 0, 'still no painted input labels while the lane is open')
    pass('Enter starts a new port on the next line and it paints as you type')

    // ---------------------------------------- Shift+Alt+Down duplicates ---
    await key(page, 'ArrowDown', 'ArrowDown', ALT | SHIFT)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs.length === 5`, 'the copied line to become a port', 5000)
    const duplicated = await storedPorts(page, 'inputs')
    assert.deepEqual(duplicated.slice(1, 3), [['in_4', 'yaw', 'float', '0'], ['in_5', 'yaw', 'float', '0']], 'a duplicated line is a duplicated port with its own id')
    await shot(page, 'duplicated')
    pass('Shift+Alt+↓ duplicates the port the way it duplicates a line')

    // ------------------------------------------------- Ctrl+Enter commits ---
    await key(page, 'Enter', 'Enter', CTRL)
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Ctrl+Enter to close the lane')
    assert.equal((await storedPorts(page, 'inputs')).length, 5, 'the lane\'s ports survive the commit')
    assert.deepEqual(await paintedNames(page, 'in'), ['frame', 'yaw', 'yaw', 'pose', 'gain'])
    await shot(page, 'committed')
    pass('Ctrl+Enter commits and the Block paints the five ports the lane described')

    // ---------------------------------- right half opens the outputs lane ---
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const box2 = await blockBox(page)
    const qualityLabel = await labelBox(page, 'out', 'quality')
    await clickAt(page, box2.x + box2.width * 0.62, qualityLabel.y + qualityLabel.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(OUTPUT_LANE)})`, 'the outputs lane editor', 5000)
    const outputs = await laneState(page, OUTPUT_LANE)
    assert.deepEqual(outputs.lines, ['pose: Pose', 'quality: float'])
    assert.notEqual(outputs.align, 'right', 'the outputs lane is typed left-to-right like any editor')
    assert.ok(outputs.left >= box2.x + box2.width - 2, 'the outputs lane is parked past the Block\'s right edge, beside its dots')
    assert.equal(outputs.caretLine, 1, 'the caret opens on the clicked output')
    await shot(page, 'outputs-open')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    assert.deepEqual(await storedPorts(page, 'outputs'), [['out_1', 'pose', 'Pose', null], ['out_2', 'quality', 'float', null]])
    pass('a click on the right half opens the outputs lane outside the Block, typed normally, and Escape leaves it untouched')

    // ------------------------------- every way in is the lane, never a box ---
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const gainLabel = await labelBox(page, 'in', 'gain')
    await clickAt(page, gainLabel.x + 8, gainLabel.y + gainLabel.height / 2)
    await waitFor(page, `document.querySelector('.BlockNode-inlineEditor')`, 'an editor from the painted label', 5000)
    assert.equal(await evaluate(page, `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid')`), 'block-inline-port-lane-inputs',
      'a click on a painted port label opens the lane, not the one-port editor')
    assert.equal((await laneState(page, INPUT_LANE)).caretLine, 4, 'with the caret on that port\'s line')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    const poseLabel = await labelBox(page, 'in', 'pose')
    await mouse(page, 'mouseMoved', poseLabel.x + 8, poseLabel.y + poseLabel.height / 2)
    for (const clickCount of [1, 2]) {
      await mouse(page, 'mousePressed', poseLabel.x + 8, poseLabel.y + poseLabel.height / 2, { buttons: 1, clickCount })
      await mouse(page, 'mouseReleased', poseLabel.x + 8, poseLabel.y + poseLabel.height / 2, { clickCount })
    }
    await waitFor(page, `document.querySelector('.BlockNode-inlineEditor')`, 'an editor from a double-click', 5000)
    assert.equal(await evaluate(page, `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid')`), 'block-inline-port-lane-inputs',
      'a double-click on a port label opens the lane too — the prototype never falls back to the one-line box')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    pass('a single click, a double-click and the body all open the same lane — never the single-line editor')

    // --------------- the open lane paints above a shape that is above the Block ---
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getShape(${JSON.stringify(BLOCK)})
      // A Block pasted later sits ABOVE estimate in z-order, right where the outputs lane parks.
      editor.createShapes([{ id: 'shape:cover', type: 'block', x: block.x + block.props.w - 40, y: block.y + 60, props: { title: 'cover', view: 'simple', w: 260, h: 160, inputs: [], outputs: [] } }])
      editor.select(${JSON.stringify(BLOCK)})
      return true
    })()`)
    await delay(250)
    const coverBox = await blockBox(page)
    const outRow = await labelBox(page, 'out', 'quality')
    await clickAt(page, coverBox.x + coverBox.width * 0.55, outRow.y + outRow.height / 2)
    await waitFor(page, `document.querySelector(${JSON.stringify(OUTPUT_LANE)})`, 'the outputs lane under a covering shape', 5000)
    const laneTop = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const lane = document.querySelector(${JSON.stringify(OUTPUT_LANE)})
      const rect = lane.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const coverRect = document.querySelector('[data-shape-id="shape:cover"]')?.getBoundingClientRect()
      const overlaps = coverRect ? rect.x < coverRect.right && rect.right > coverRect.x && rect.y < coverRect.bottom && rect.bottom > coverRect.y : false
      return { onTop: Boolean(hit && lane.contains(hit)), overlaps, inShapeLayer: Boolean(lane.closest('.tl-html-layer')) }
    })())`))
    assert.equal(laneTop.overlaps, true, 'the covering Block really overlaps the lane')
    assert.equal(laneTop.onTop, true, 'the open lane paints above the covering Block')
    assert.equal(laneTop.inShapeLayer, true, 'it lives in tldraw\'s shape layer, page-space')
    await typeSlowly(page, 'X')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.outputs.some((port) => port.type === 'floatX' || port.name.endsWith('X'))`, 'typing to reach the store through the overlay', 5000)
    await shot(page, 'lane-above-cover')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    await evaluate(page, `(() => { const editor = window.__systemsketch.editor; editor.deleteShapes(['shape:cover']); editor.updateShape({ id: ${JSON.stringify(BLOCK)}, type: 'block', props: { outputs: editor.getShape(${JSON.stringify(BLOCK)}).props.outputs.map((port) => port.id === 'out_2' ? { ...port, name: 'quality', type: 'float' } : port) } }); return true })()`)
    pass('an open lane is promoted above a shape that sits above its Block in z-order')

    // ------------------------ a header port is not a line: its own editor ---
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const namesBefore = await storedPorts(page, 'inputs')
    await clickElement(page, `[data-shape-id=${JSON.stringify(BLOCK)}] [title="Add header port"]`)
    await waitFor(page, `document.querySelector('.BlockNode-inlineEditor')`, 'an editor for the new header port', 5000)
    const headerEditor = await evaluate(page, `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid')`)
    assert.match(headerEditor ?? '', /^block-inline-port-name-inputs-/, 'the header bead opens the header port\'s own one-line editor, not the body lane')
    await typeSlowly(page, 'fn')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs.some((port) => port.row === 0 && port.name === 'fn')`, 'the header port to be named')
    const namesAfter = await storedPorts(page, 'inputs')
    assert.deepEqual(namesAfter.filter((entry) => entry[1] !== 'fn'), namesBefore, 'no body port was touched by naming the header port')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the editor')
    pass('the header + bead names the header port — never line 0 of the lane')

    // ------------- a Block just drawn: its title editor is open; the body still opens a lane ---
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    await key(page, 'b', 'KeyB')
    // A box this size opens in Port view (a smaller one is a Simple Block, which has no lanes).
    await mouse(page, 'mouseMoved', 120, 540)
    await mouse(page, 'mousePressed', 120, 540, { buttons: 1 })
    for (let step = 1; step <= 6; step += 1) {
      await mouse(page, 'mouseMoved', 120 + (360 * step) / 6, 540 + (240 * step) / 6, { buttons: 1 })
      await delay(20)
    }
    await mouse(page, 'mouseReleased', 480, 780)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'the fresh Block\'s title editor', 5000)
    const freshId = await evaluate(page, `window.__systemsketch.editor.getEditingShapeId()`)
    const fresh = await elementBox(page, `[data-shape-id=${JSON.stringify('__ID__')}] .systemsketch-block-canvas`.replace('__ID__', freshId))
    await clickAt(page, fresh.x + fresh.width * 0.3, fresh.y + fresh.height * 0.5)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'the inputs lane from a Block whose title editor was open', 5000)
    await typeSlowly(page, 'seed: int = 7')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify('__ID__')}.replace('__ID__', ${JSON.stringify(freshId)})).props.inputs.length === 1`, 'the fresh Block\'s first port', 5000)
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the lane')
    await evaluate(page, `(() => { window.__systemsketch.editor.deleteShapes([${JSON.stringify(freshId)}]); return true })()`)
    pass('a Block just drawn, title editor still open: one click on its left half opens the inputs lane and the first port is typed straight in')

    // -------------------- an empty Block: click a half, type, a port is born ---
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([{ id: 'shape:blank', type: 'block', x: 520, y: 620, props: { title: 'blank', view: 'port', w: 360, h: 200, inputs: [], outputs: [] } }])
      editor.select('shape:blank')
      return true
    })()`)
    await delay(250)
    const blank = await elementBox(page, '[data-shape-id="shape:blank"] .systemsketch-block-canvas')
    await clickAt(page, blank.x + blank.width * 0.7, blank.y + blank.height * 0.5)
    await waitFor(page, `document.querySelector(${JSON.stringify(OUTPUT_LANE)})`, 'an empty outputs lane on a Block with no ports', 5000)
    const emptyLane = await laneState(page, OUTPUT_LANE)
    // CodeMirror paints the placeholder inside .cm-content, so ask the document itself.
    assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(OUTPUT_LANE)} + ' .cm-content')?.cmView?.view.state.doc.length`), 0, 'the lane opens empty')
    assert.equal(emptyLane.focused, true, 'with the caret ready at the top')
    assert.equal(await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(OUTPUT_LANE)} + ' .cm-placeholder'))`), true, 'and the grammar as its placeholder')
    await typeSlowly(page, 'result: Pose')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:blank').props.outputs.length === 1`, 'the first output to be born from the first line', 5000)
    assert.deepEqual(JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:blank').props.outputs.map((port) => [port.id, port.name, port.type]))`)),
      [['out_1', 'result', 'Pose']], 'typing into the empty lane creates the port, no inspector needed')
    await key(page, 'Enter', 'Enter', CTRL)
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Ctrl+Enter to close the lane')
    await evaluate(page, `(() => { window.__systemsketch.editor.select('shape:blank'); return true })()`)
    await delay(200)
    await clickAt(page, blank.x + blank.width * 0.3, blank.y + blank.height * 0.5)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_LANE)})`, 'an empty inputs lane on the same Block', 5000)
    await typeSlowly(page, 'frame: Frame')
    await key(page, 'Enter', 'Enter')
    await typeSlowly(page, 'gain: float = 1.0')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:blank').props.inputs.length === 2`, 'two inputs from two lines', 5000)
    await shot(page, 'blank-block')
    await key(page, 'Enter', 'Enter', CTRL)
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Ctrl+Enter to close the lane')
    assert.deepEqual(JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:blank').props.inputs.map((port) => [port.id, port.name, port.type, port.defaultValue ?? null]))`)),
      [['in_1', 'frame', 'Frame', null], ['in_2', 'gain', 'float', '1.0']])
    await evaluate(page, `(() => { window.__systemsketch.editor.deleteShapes(['shape:blank']); return true })()`)
    pass('a Block with no ports: click either half, type, and the ports are created line by line — no inspector needed')

    // ---------------------- Settings › Canvas › Port editor is the switch ---
    await clickElement(page, '[data-testid="main-menu.button"]')
    await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
    await clickElement(page, '[data-testid="main-menu.settings"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
    await clickElement(page, '[data-testid="systemsketch-settings-category-canvas"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-multi-line-port-editor"]')`, 'the Port editor toggle')
    await evaluate(page, `document.querySelector('[data-testid="systemsketch-multi-line-port-editor"]')?.scrollIntoView({ block: 'center' })`)
    await delay(150)
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-multi-line-port-editor"]')?.getAttribute('aria-checked')`), 'true', 'multi-line is on by default')
    await shot(page, 'settings-toggle')
    await clickElement(page, '[data-testid="systemsketch-multi-line-port-editor"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-multi-line-port-editor"]')?.getAttribute('aria-checked') === 'false'`, 'the toggle to read off')
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="Port editor prototype"]')?.value`), 'one-line', 'the bottom-right drop-down follows the setting')
    await clickElement(page, '.systemsketch-settings__header .tlui-button')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const gainOff = await labelBox(page, 'in', 'gain')
    await clickAt(page, gainOff.x + 16, gainOff.y + gainOff.height / 2)
    await waitFor(page, `document.querySelector('.BlockNode-inlineEditor')`, 'an editor with the setting off', 5000)
    assert.equal(await evaluate(page, `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid')`), 'block-inline-port-name-inputs-in_3', 'with the setting off, the single-line editor is back')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the editor')
    await choosePrototype(page, 'lanes')
    pass('Settings › Canvas › Port editor toggles multi-line off and on, live, and the drop-down follows')

    // ----------------------------------- the switch flips back, live ---
    await choosePrototype(page, 'one-line')
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const gainAgain = await labelBox(page, 'in', 'gain')
    await clickAt(page, gainAgain.x + 8, gainAgain.y + gainAgain.height / 2)
    await waitFor(page, `document.querySelector('.BlockNode-inlineEditor')`, 'an editor after switching back', 5000)
    assert.equal(await evaluate(page, `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid')`), 'block-inline-port-name-inputs-in_3',
      'with the switch back on the shipped editor, the same click opens the one-line field again')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the editor')
    assert.equal(await evaluate(page, `JSON.parse(localStorage.getItem('systemsketch.portEditor.v1') ?? '{}').portEditor ?? null`), 'single-line', 'the choice is remembered in this browser (the same preference Settings › Canvas shows)')
    pass('the bottom-right drop-down switches the port editor live, no URL editing, and remembers the choice')

    const errors = localConsoleErrors(page)
    assert.equal(errors.length, 0, `the journey emits no local console errors:\n${errors.join('\n')}`)
    pass('zero local console errors across the whole journey')

    await writeFile(RESULTS, JSON.stringify({ ranAt: new Date().toISOString(), checks }, null, 2) + '\n')
    process.stdout.write(`\n${checks.length} checks passed · ${RESULTS}\n`)
  } catch (error) {
    await shot(page, 'failure').catch(() => undefined)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
