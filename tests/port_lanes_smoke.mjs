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
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
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
    await openApp(page, port, `?portLanes=1&board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the SystemSketch product canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'editor seam')
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
    await shot(page, 'inputs-open')
    pass('a click on the left half opens the inputs lane: one line per port, caret on the clicked port')

    // ------------------------------------- Alt+Up moves a port, keeps its id ---
    await key(page, 'ArrowUp', 'ArrowUp', CTRL)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[0].id === 'in_2'`, 'the moved line to reorder the ports', 5000)
    assert.deepEqual(await storedPorts(page, 'inputs'), [
      ['in_2', 'frame', 'Frame', null], ['in_1', 'pose', 'Pose', 'None'], ['in_3', 'gain', 'float', '1.0'],
    ], 'ids travel with their lines, so cables stay attached')
    assert.deepEqual(await paintedNames(page, 'in'), ['frame', 'pose', 'gain'], 'the Block repaints in the new order while the lane is open')
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
    assert.deepEqual(await paintedNames(page, 'in'), ['frame', 'yaw', 'pose', 'gain'])
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
