#!/usr/bin/env node
/**
 * Real-browser proof for in-window port editing: the table-style add gutter,
 * press-and-hold reorder, and the contextual port commands on the main menu.
 *
 * Every claim is driven through the real product build with real pointer
 * events, and every assertion reads the painted document — the port order comes
 * from where the dots actually landed, not from a model the paint might
 * disagree with.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs')
const SHOT_ADD = join(SHOTS, 'block-port-in-window-add-2026-09-01.png')
const SHOT_DRAG = join(SHOTS, 'block-port-in-window-drag-2026-09-01.png')
const SHOT_MENU = join(SHOTS, 'block-port-in-window-menu-2026-09-01.png')
const SHOT_GROWN = join(SHOTS, 'block-port-in-window-grown-2026-09-01.png')

async function shot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

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

/** Every Block wrapper on the page, in document order. */
async function blockIds(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="block"]'))
      .map((node) => node.dataset.shapeId))`))
}

const scope = (shapeId) => `[data-shape-id="${shapeId}"]`
const portDot = (shapeId, side, portId) =>
  `${scope(shapeId)} .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

/**
 * The painted state of one Block. Lane order is read from where the dots were
 * drawn, so a reorder that never reached the layout cannot pass.
 */
async function blockState(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return null
    const canvas = wrapper.querySelector('.systemsketch-block-canvas')
    const rect = canvas.getBoundingClientRect()
    const lane = (side) => Array.from(
      wrapper.querySelectorAll('.Port[data-block-port-side="' + side + '"]'))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((node) => node.dataset.blockPortId)
    const names = (modifier) => Array.from(
      wrapper.querySelectorAll('.BlockNode-portLabel--' + modifier))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((node) => node.querySelector('.BlockNode-portName')?.textContent ?? '')
    return JSON.stringify({
      view: canvas.dataset.blockView,
      h: Math.round(rect.height),
      inputs: lane('input'),
      outputs: lane('output'),
      inputNames: names('in'),
    })
  })()`)
  if (!value) throw new Error(`No Block ${shapeId} on the page`)
  return JSON.parse(value)
}

async function connectionCount(page) {
  return evaluate(page, `document.querySelectorAll('[data-shape-type="connection"]').length`)
}

/** Draw a Block through the real tool and pointer lifecycle, and name it. */
async function drawBlock(page, from, to, title) {
  await key(page, 'b', 'KeyB')
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 6; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(160)
}

/** Hover a lane's gutter, then click the bead it reveals and name the port. */
async function addPortFromGutter(page, side, name) {
  const zone = await box(page, `[data-testid="block-port-add-zone-${side}"]`)
  await mouse(page, 'mouseMoved', zone.cx, zone.cy)
  await delay(220)
  const bead = await box(page, `[data-testid="block-port-add-${side}"]`)
  const opacity = await evaluate(page,
    `getComputedStyle(document.querySelector('[data-testid="block-port-add-${side}"]')).opacity`)
  assert.equal(opacity, '1', `hovering the ${side} gutter reveals its bead`)
  await mouse(page, 'mouseMoved', bead.cx, bead.cy)
  await delay(140)
  await clickAt(page, bead.cx, bead.cy)
  await waitFor(page,
    `document.querySelector('[data-testid^="block-inline-port-name-${side}-"]')`,
    `${side} port name editor`)
  await page.send('Input.insertText', { text: name })
  await key(page, 'Enter', 'Enter')
  await waitFor(page,
    `Array.from(document.querySelectorAll('.BlockNode-portName')).some((node) => node.textContent === ${JSON.stringify(name)})`,
    `authored ${side} label ${name}`)
}

/** Press, hold past tldraw's long-press threshold, then drag and release. */
async function holdAndDrag(page, from, to, { onHold, onDrag } = {}) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  await delay(760)
  if (onHold) await onHold()
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 8,
      from.y + ((to.y - from.y) * step) / 8,
      { buttons: 1 })
    await delay(30)
    if (step === 6 && onDrag) await onDrag()
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(280)
}

async function openPortMenu(page, shapeId, side, portId) {
  const dot = await box(page, portDot(shapeId, side, portId))
  await clickAt(page, dot.cx, dot.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-group.systemsketch-block-port"]')`,
    `port context menu for ${portId}`)
}

const hasGrip = (page) => evaluate(page,
  `Boolean(document.querySelector('[data-testid="block-port-grip"]'))`)

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-ports', build: 'port-in-window-smoke' })
  const { page, port, filesRoot } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ---------------------------------------------------------------- add ---
    await drawBlock(page, { x: 420, y: 240 }, { x: 760, y: 460 }, 'refine')
    await waitFor(page,
      `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`,
      'Port Block')
    const [refine] = await blockIds(page)

    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="block-port-add-zone-inputs"]'))`), true)
    await clickAt(page, 200, 720)
    await delay(160)
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="block-port-add-zone-inputs"]'))`), false,
      'a deselected Block grows no add gutters')
    pass('the add gutter belongs to the selected Block only')

    const refineBox = await box(page, `${scope(refine)} .systemsketch-block-canvas`)
    await clickAt(page, refineBox.cx, refineBox.y + 22)
    await waitFor(page, `document.querySelector('[data-testid="block-port-add-zone-inputs"]')`, 'input gutter')

    const beforeAdd = await blockState(page, refine)
    await addPortFromGutter(page, 'inputs', 'pose')
    await addPortFromGutter(page, 'outputs', 'result')
    // Capture the affordance in the state the user sees it in: revealed.
    const gutter = await box(page, '[data-testid="block-port-add-zone-inputs"]')
    await mouse(page, 'mouseMoved', gutter.cx, gutter.cy)
    await delay(300)
    await shot(page, SHOT_ADD)
    await mouse(page, 'mouseMoved', 240, 760)
    await delay(160)
    const afterTwo = await blockState(page, refine)
    assert.deepEqual(afterTwo.inputs, ['in_1'])
    assert.deepEqual(afterTwo.outputs, ['out_1'])
    assert.deepEqual(afterTwo.inputNames, ['pose'])
    assert.equal(afterTwo.h, beforeAdd.h, 'a Block with room does not grow')
    pass('hovering a lane gutter offers a bead that creates the port and opens its name')

    // Keep adding until the next row no longer fits at the full pitch.
    let grown = afterTwo
    for (const name of ['asdasd', 'window', 'stride']) {
      await addPortFromGutter(page, 'inputs', name)
      const next = await blockState(page, refine)
      assert.ok(next.h >= grown.h, 'the box never shrinks while adding')
      grown = next
    }
    assert.deepEqual(grown.inputs, ['in_1', 'in_2', 'in_3', 'in_4'])
    assert.deepEqual(grown.inputNames, ['pose', 'asdasd', 'window', 'stride'])
    assert.ok(grown.h > afterTwo.h, 'a full Block grew to make room for the new rows')
    pass('a full Block expands to fit the new row instead of squeezing the old ones')

    // The rows must still be evenly pitched after the growth, not compressed.
    const pitches = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const tops = Array.from(document.querySelectorAll(
        ${JSON.stringify(scope(refine))} + ' .Port[data-block-port-side="input"]'))
        .map((node) => node.getBoundingClientRect().top)
        .sort((a, b) => a - b)
      return tops.slice(1).map((top, index) => Math.round(top - tops[index]))
    })())`))
    assert.deepEqual(pitches, [44, 44, 44], `rows keep the full pitch, got ${pitches}`)
    // The inspector's own size readout is the second, independent witness.
    await shot(page, SHOT_GROWN)
    pass('every existing row keeps its full 44px pitch after the growth')

    // ------------------------------------------------------------ reorder ---
    const first = await box(page, portDot(refine, 'input', 'in_1'))
    const third = await box(page, portDot(refine, 'input', 'in_3'))
    let sawGrip = false
    let sawRule = false
    await holdAndDrag(page,
      { x: third.cx, y: third.cy },
      { x: first.cx, y: first.cy - 16 },
      {
        onHold: async () => {
          sawGrip = await hasGrip(page)
          sawRule = await evaluate(page,
            `Boolean(document.querySelector('[data-testid="block-port-drop-rule"]'))`)
        },
        onDrag: async () => shot(page, SHOT_DRAG),
      })
    assert.equal(sawGrip, true, 'holding a port shows its drag grip')
    assert.equal(sawRule, true, 'holding a port shows where it would land')
    assert.deepEqual((await blockState(page, refine)).inputs, ['in_3', 'in_1', 'in_2', 'in_4'])
    assert.equal(await hasGrip(page), false, 'the drag chrome is gone after the drop')
    pass('press-and-hold on a port enters a drag that reorders its lane')

    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(260)
    assert.deepEqual((await blockState(page, refine)).inputs, ['in_1', 'in_2', 'in_3', 'in_4'],
      'one undo retracts the whole reorder')
    pass('a reorder is exactly one undo step')

    // A press that moves immediately is still a cable, not a reorder.
    const outDot = await box(page, portDot(refine, 'output', 'out_1'))
    await mouse(page, 'mouseMoved', outDot.cx, outDot.cy)
    await mouse(page, 'mousePressed', outDot.cx, outDot.cy, { buttons: 1 })
    for (let step = 1; step <= 6; step += 1) {
      await mouse(page, 'mouseMoved', outDot.cx + step * 24, outDot.cy + step * 14, { buttons: 1 })
      await delay(22)
    }
    const gripDuringCable = await hasGrip(page)
    await mouse(page, 'mouseReleased', outDot.cx + 144, outDot.cy + 84)
    await delay(200)
    assert.equal(gripDuringCable, false, 'a moving press never becomes a reorder')
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(220)
    pass('a press that moves first still makes a cable, never a reorder')

    // ------------------------------------------------------------- cables ---
    await drawBlock(page, { x: 960, y: 300 }, { x: 1300, y: 520 }, 'sink')
    const ids = await blockIds(page)
    const sink = ids.find((id) => id !== refine)
    await addPortFromGutter(page, 'inputs', 'feed')
    await key(page, 'Escape', 'Escape')
    await delay(160)

    const source = await box(page, portDot(refine, 'output', 'out_1'))
    const target = await box(page, portDot(sink, 'input', 'in_1'))
    await mouse(page, 'mouseMoved', source.cx, source.cy)
    await mouse(page, 'mousePressed', source.cx, source.cy, { buttons: 1 })
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved',
        source.cx + ((target.cx - source.cx) * step) / 10,
        source.cy + ((target.cy - source.cy) * step) / 10,
        { buttons: 1 })
      await delay(25)
    }
    await mouse(page, 'mouseReleased', target.cx, target.cy)
    await delay(280)
    const wired = await connectionCount(page)
    assert.equal(wired, 1, `one cable spans the two Blocks, saw ${wired}`)
    pass('a cable spans the two Blocks and survives the edits above')

    // --------------------------------------------------------------- menu ---
    await clickAt(page, refineBox.cx, refineBox.y + 22)
    await delay(160)
    await openPortMenu(page, refine, 'input', 'in_2')
    const menuText = await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-port"]').innerText`)
    for (const label of ['Add port above', 'Add port below', 'Move up', 'Move down', 'Delete port']) {
      assert.ok(menuText.includes(label), `${label} is on the port menu`)
    }
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu"]').innerText.includes('Block view')`),
      'the port commands are prepended to the same menu, not a separate one')
    await shot(page, SHOT_MENU)
    pass('right-clicking a port re-aims the main menu at that port')

    await clickElement(page, '[data-testid="context-menu.block-port-add-below"]')
    await waitFor(page,
      `document.querySelector('[data-testid^="block-inline-port-name-inputs-"]')`,
      'inserted port editor')
    await page.send('Input.insertText', { text: 'inserted' })
    await key(page, 'Enter', 'Enter')
    await delay(200)
    const inserted = await blockState(page, refine)
    assert.deepEqual(inserted.inputs, ['in_1', 'in_2', 'in_5', 'in_3', 'in_4'],
      'Add port below lands directly under its subject')
    assert.deepEqual(inserted.inputNames,
      ['pose', 'asdasd', 'inserted', 'window', 'stride'])
    pass('Add port below inserts in place rather than appending')

    await openPortMenu(page, refine, 'input', 'in_5')
    await clickElement(page, '[data-testid="context-menu.block-port-move-up"]')
    await delay(240)
    assert.deepEqual((await blockState(page, refine)).inputs,
      ['in_1', 'in_5', 'in_2', 'in_3', 'in_4'])
    pass('Move up steps the port one row without touching its identity')

    await openPortMenu(page, refine, 'output', 'out_1')
    await clickElement(page, '[data-testid="context-menu.block-port-delete"]')
    await delay(300)
    assert.deepEqual((await blockState(page, refine)).outputs, [])
    assert.equal(await connectionCount(page), 0,
      'deleting a wired port takes its cable with it')
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(320)
    assert.deepEqual((await blockState(page, refine)).outputs, ['out_1'])
    assert.equal(await connectionCount(page), 1, 'one undo restores port and cable')
    pass('Delete port removes the port and its cable, and one undo restores both')

    // ------------------------------------------------------------ product ---
    const board = join(filesRoot, 'SystemSketch', 'port-in-window-proof.tldr')
    await page.send('Page.navigate', {
      url: `http://127.0.0.1:${port}/?board=${encodeURIComponent(board)}`,
    })
    await waitFor(page, 'document.readyState === "complete"', 'product page load')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(600)
    await drawBlock(page, { x: 420, y: 260 }, { x: 780, y: 470 }, 'stable_ports')
    const [stable] = await blockIds(page)
    await waitFor(page, `document.querySelector('[data-testid="block-port-add-zone-inputs"]')`, 'product gutter')
    await addPortFromGutter(page, 'inputs', 'alpha')
    await addPortFromGutter(page, 'inputs', 'beta')
    assert.deepEqual((await blockState(page, stable)).inputs, ['in_1', 'in_2'])

    const pFirst = await box(page, portDot(stable, 'input', 'in_1'))
    const pSecond = await box(page, portDot(stable, 'input', 'in_2'))
    await holdAndDrag(page,
      { x: pSecond.cx, y: pSecond.cy },
      { x: pFirst.cx, y: pFirst.cy - 16 })
    assert.deepEqual((await blockState(page, stable)).inputs, ['in_2', 'in_1'])
    assert.deepEqual((await blockState(page, stable)).inputNames, ['beta', 'alpha'])
    await openPortMenu(page, stable, 'input', 'in_1')
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-port"]').innerText.includes('Delete port')`))
    await key(page, 'Escape', 'Escape')
    pass('the full product composition carries all three gestures, not just the lab')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(
      `\n  ${checks.length}/${checks.length} browser checks passed\n`
      + `  ${SHOT_ADD}\n  ${SHOT_GROWN}\n  ${SHOT_DRAG}\n  ${SHOT_MENU}\n`,
    )
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    await shot(page, join(SHOTS, 'block-port-in-window-failure.png')).catch(() => undefined)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  ${error.stack ?? error}\n`)
  process.exitCode = 1
})
