#!/usr/bin/env node
/**
 * Real-browser proof that a port can be put in any row of the burger — the
 * heading included — from every surface that shows rows: the heading's own
 * add bead, a press-and-hold drag on the canvas, the right-click "Move to"
 * menu, and the inspector's mirrored list.
 *
 * Every claim is driven through the real build with real pointer events and
 * read back from the painted document: a port is "in the header" when its dot
 * is painted inside the heading band and carries row 0, never because a model
 * said so.
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

const SHOTS = join(ROOT, 'docs', 'assets')
const shotPath = (name) => join(SHOTS, `header-port-rows-${name}-2026-09-01.png`)

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
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

const exists = (page, selector) => evaluate(page,
  `Boolean(document.querySelector(${JSON.stringify(selector)}))`)

async function blockIds(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="block"]'))
      .map((node) => node.dataset.shapeId))`))
}

const scope = (shapeId) => `[data-shape-id="${shapeId}"]`
const portDot = (shapeId, side, portId) =>
  `${scope(shapeId)} .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

/**
 * The painted state of one Block: each lane's dots top to bottom with the row
 * each one carries, whether the dot sits inside the heading band, and how
 * many full and half dividers are drawn.
 */
async function blockState(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return null
    const canvas = wrapper.querySelector('.systemsketch-block-canvas')
    const heading = wrapper.querySelector('.NodeShape-heading')
    const headingBottom = heading ? heading.getBoundingClientRect().bottom : 0
    const lane = (side) => Array.from(
      wrapper.querySelectorAll('.Port[data-block-port-side="' + side + '"]'))
      .map((node) => ({ node, top: node.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map(({ node, top }) => ({
        id: node.dataset.blockPortId,
        row: Number(node.dataset.blockPortRow),
        inHeading: top + node.getBoundingClientRect().height / 2 < headingBottom,
        title: node.getAttribute('title') || '',
      }))
    return JSON.stringify({
      view: canvas.dataset.blockView,
      inputs: lane('input'),
      outputs: lane('output'),
      fullLines: wrapper.querySelectorAll('.BlockNode-divider:not(.BlockNode-divider--branch)').length,
      halfLines: wrapper.querySelectorAll('.BlockNode-divider--branch').length,
    })
  })()`)
  if (!value) throw new Error(`No Block ${shapeId} on the page`)
  return JSON.parse(value)
}

const inputIds = (state) => state.inputs.map((port) => port.id)
const inputRows = (state) => state.inputs.map((port) => `${port.id}@${port.row}`)
const outputRows = (state) => state.outputs.map((port) => `${port.id}@${port.row}`)

/** The inspector's list for one lane: rows and lines in the order painted. */
async function inspectorList(page, side) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-testid="inspector-ports-${side}"] > li'))
      .map((node) => node.dataset.portId
        ? node.dataset.portId + '@' + node.dataset.row
        : node.className.includes('divider')
          ? (node.textContent || '').trim().toUpperCase()
          : node.className.includes('empty') ? 'EMPTY@' + node.dataset.row : null)
      .filter(Boolean))`))
}

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

/** Hover a gutter, click the bead it reveals, and name the port. */
async function addPortFromGutter(page, where, name) {
  const zone = await box(page, `[data-testid="block-port-add-zone-${where}"]`)
  await mouse(page, 'mouseMoved', zone.cx, zone.cy)
  await delay(220)
  const bead = await box(page, `[data-testid="block-port-add-${where}"]`)
  const opacity = await evaluate(page,
    `getComputedStyle(document.querySelector('[data-testid="block-port-add-${where}"]')).opacity`)
  assert.equal(opacity, '1', `hovering the ${where} gutter reveals its bead`)
  await mouse(page, 'mouseMoved', bead.cx, bead.cy)
  await delay(140)
  await clickAt(page, bead.cx, bead.cy)
  await waitFor(page,
    `document.querySelector('[data-testid^="block-inline-port-name-"]')`,
    `${where} port name editor`)
  await page.send('Input.insertText', { text: name })
  await key(page, 'Enter', 'Enter')
  await delay(200)
}

/** Press, hold past tldraw's long-press threshold, drag, read, release. */
async function holdAndDrag(page, from, to, { onHold, onArrive } = {}) {
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
  }
  await delay(80)
  if (onArrive) await onArrive()
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(300)
}

const dropBand = (page) => evaluate(page, `(() => {
  const band = document.querySelector('[data-testid="block-port-drop-band"]')
  return band ? JSON.stringify({ row: Number(band.dataset.dropRow), branch: Number(band.dataset.dropBranch) }) : null
})()`).then((value) => (value ? JSON.parse(value) : null))

async function openPortMenu(page, shapeId, side, portId) {
  const dot = await box(page, portDot(shapeId, side, portId))
  await clickAt(page, dot.cx, dot.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-group.systemsketch-block-port"]')`,
    `port context menu for ${portId}`)
}

/** Open the "Move to" submenu of an open port menu and click one of its items. */
async function openMoveTo(page) {
  await clickElement(page, '[data-testid="context-menu-sub.block-port-row-button"]')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.block-port-row-content"]')`,
    'Move to submenu')
  await delay(120)
}

/** A checkbox row of the open Move to submenu, found by its label. */
async function clickMoveToRow(page, label) {
  const value = await evaluate(page, `(() => {
    const content = document.querySelector('[data-testid="context-menu-sub.block-port-row-content"]')
    const row = Array.from(content?.querySelectorAll('[role="menuitemcheckbox"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)})
    if (!row) return null
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
  })()`)
  if (!value) throw new Error(`Missing ${label} in Move to`)
  const { cx, cy } = JSON.parse(value)
  await clickAt(page, cx, cy)
  await delay(260)
}

async function chooseMoveTo(page, itemId) {
  await openMoveTo(page)
  await clickElement(page, `[data-testid="context-menu.${itemId}"]`)
  await delay(260)
}

/**
 * Deselect first: a click on the heading of a Block that is already selected
 * is click-to-edit and opens the title, and an editing Block grows no gutters.
 */
async function selectBlock(page, shapeId) {
  await clickAt(page, 200, 760)
  await delay(220)
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, face.cx, face.y + 22)
  await waitFor(page, `document.querySelector('[data-testid="block-port-add-zone-header"]')`, 'selected Block')
}

/**
 * Ctrl+Z reaches tldraw only while its container holds focus, and a closed
 * menu hands focus back to whatever had it before. Focus the container
 * directly: a click on empty canvas would also deselect, and tldraw records a
 * deselect as an undo step of its own — the first Ctrl+Z would then merely
 * restore the selection.
 */
async function undo(page, times = 1) {
  await evaluate(page, `document.querySelector('.tl-container')?.focus()`)
  await delay(120)
  for (let count = 0; count < times; count += 1) {
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(240)
  }
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-rows', build: 'port-rows-smoke' })
  const { page, port, filesRoot } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ------------------------------------------------------------- seed ---
    await drawBlock(page, { x: 420, y: 200 }, { x: 760, y: 470 }, 'run')
    await waitFor(page,
      `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`,
      'Port Block')
    const [run] = await blockIds(page)
    await selectBlock(page, run)
    for (const name of ['raw', 'gain', 'transform']) await addPortFromGutter(page, 'inputs', name)
    for (const name of ['payload', 'pose']) await addPortFromGutter(page, 'outputs', name)
    await selectBlock(page, run)
    const seeded = await blockState(page, run)
    assert.deepEqual(inputRows(seeded), ['in_1@1', 'in_2@1', 'in_3@1'])
    assert.deepEqual(outputRows(seeded), ['out_1@1', 'out_2@1'])

    // ------------------------------------------------ heading add bead ---
    const zone = await box(page, '[data-testid="block-port-add-zone-header"]')
    const heading = await box(page, `${scope(run)} .NodeShape-heading`)
    assert.ok(zone.y >= heading.y - 1 && zone.y + zone.h <= heading.y + heading.h + 1,
      'the heading gutter spans exactly the heading band')
    await mouse(page, 'mouseMoved', zone.cx, zone.cy)
    await delay(260)
    await shot(page, 'heading-bead')
    await addPortFromGutter(page, 'header', 'estimator')
    await selectBlock(page, run)
    const withHeader = await blockState(page, run)
    assert.deepEqual(inputRows(withHeader), ['in_4@0', 'in_1@1', 'in_2@1', 'in_3@1'])
    assert.equal(withHeader.inputs[0].inHeading, true, 'the new dot is painted inside the heading')
    assert.equal(withHeader.inputs[0].title, 'estimator', 'a header dot names itself on hover')
    pass('the heading has its own add gutter, and the port it makes rides the heading band')

    // ------------------------------------------------ drag into heading ---
    const transform = await box(page, portDot(run, 'input', 'in_3'))
    let bandOnHold = null
    let bandOnArrive = null
    await holdAndDrag(page,
      { x: transform.cx, y: transform.cy },
      { x: transform.cx, y: heading.cy + 6 },
      {
        onHold: async () => { bandOnHold = await dropBand(page) },
        onArrive: async () => {
          bandOnArrive = await dropBand(page)
          await shot(page, 'drag-into-heading')
        },
      })
    assert.deepEqual(bandOnHold, { row: 1, branch: 0 }, 'holding shows the row the port is in')
    assert.deepEqual(bandOnArrive, { row: 0, branch: 0 }, 'over the heading, the heading band is offered')
    const lifted = await blockState(page, run)
    assert.deepEqual(inputRows(lifted), ['in_4@0', 'in_3@0', 'in_1@1', 'in_2@1'])
    assert.equal(lifted.inputs[1].inHeading, true)
    assert.equal(await exists(page, '[data-testid="block-port-drop-band"]'), false, 'the band is gone after the drop')
    pass('press-and-hold, then drag above the line: the port joins the heading')

    await undo(page)
    assert.deepEqual(inputRows(await blockState(page, run)), ['in_4@0', 'in_1@1', 'in_2@1', 'in_3@1'])
    pass('one undo brings it back down')

    // ----------------------------------------------------- Move to menu ---
    await openPortMenu(page, run, 'input', 'in_2')
    await openMoveTo(page)
    const moveToText = await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.block-port-row-options"]').innerText`)
    assert.ok(moveToText.includes('Header') && moveToText.includes('Row 1'), `Move to lists Header and Row 1, saw ${moveToText}`)
    await shot(page, 'move-to-menu')
    await clickMoveToRow(page, 'Header')
    assert.deepEqual(inputRows(await blockState(page, run)), ['in_4@0', 'in_2@0', 'in_1@1', 'in_3@1'])
    pass('right-click › Move to › Header lifts the port without a drag')
    await undo(page)

    // ------------------------------------------------- new arm, new row ---
    await openPortMenu(page, run, 'output', 'out_1')
    await chooseMoveTo(page, 'block-port-new-branch')
    const armed = await blockState(page, run)
    assert.equal(armed.halfLines, 1, 'a half-line now divides the two outputs')
    assert.deepEqual(outputRows(armed), ['out_2@1', 'out_1@1'])
    pass('New branch below opens an arm and paints the half-line')

    await openPortMenu(page, run, 'output', 'out_2')
    await chooseMoveTo(page, 'block-port-new-row')
    const rowed = await blockState(page, run)
    assert.equal(rowed.fullLines, 1, 'a full line now divides two rows')
    assert.equal(rowed.halfLines, 0, 'the arm out_1 was alone in compacted away with the row split')
    assert.deepEqual(outputRows(rowed), ['out_1@1', 'out_2@2'])
    assert.deepEqual(inputRows(rowed), ['in_4@0', 'in_1@1', 'in_2@1', 'in_3@1'], 'inputs stay in row 1')
    pass('New row below opens a second row shared by both lanes')

    // --------------------------------------------- drag across the line ---
    await selectBlock(page, run)
    const raw = await box(page, portDot(run, 'input', 'in_1'))
    const pose = await box(page, portDot(run, 'output', 'out_2'))
    let bandAcross = null
    await holdAndDrag(page,
      { x: raw.cx, y: raw.cy },
      { x: raw.cx, y: pose.cy },
      { onArrive: async () => { bandAcross = await dropBand(page); await shot(page, 'drag-across-line') } })
    assert.deepEqual(bandAcross, { row: 2, branch: 0 }, 'across the line, row 2 is offered')
    const crossed = await blockState(page, run)
    assert.deepEqual(inputRows(crossed), ['in_4@0', 'in_2@1', 'in_3@1', 'in_1@2'])
    pass('drag an input across the full line and it changes row')

    // ------------------------------------------------- inspector mirror ---
    const inputsList = await inspectorList(page, 'inputs')
    assert.deepEqual(inputsList, ['in_4@0', 'HEADER', 'in_2@1', 'in_3@1', 'ROW', 'in_1@2'],
      `the inspector lists the inputs as the canvas paints them, saw ${inputsList}`)
    const outputsList = await inspectorList(page, 'outputs')
    assert.deepEqual(outputsList, ['out_1@1', 'ROW', 'out_2@2'])
    pass('the inspector is the canvas read top to bottom, lines included')

    const grip = await box(page, '[data-testid="inspector-port-grip-inputs-in_2"]')
    const headerDivider = await box(page, '[data-testid="inspector-divider-inputs-header-0"]')
    await mouse(page, 'mouseMoved', grip.cx, grip.cy)
    await mouse(page, 'mousePressed', grip.cx, grip.cy, { buttons: 1 })
    const targetY = headerDivider.y - 10
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', grip.cx, grip.cy + ((targetY - grip.cy) * step) / 8, { buttons: 1 })
      await delay(30)
    }
    await delay(120)
    assert.equal(await exists(page, '[data-testid="inspector-drop-band"]'), true, 'the inspector tints the row it offers')
    assert.equal(await exists(page, '[data-testid="inspector-drop-bar"]'), true, 'and rules where the port would land')
    await shot(page, 'inspector-drag')
    await mouse(page, 'mouseReleased', grip.cx, targetY)
    await delay(300)
    assert.deepEqual(inputRows(await blockState(page, run)), ['in_4@0', 'in_2@0', 'in_3@1', 'in_1@2'])
    assert.deepEqual(await inspectorList(page, 'inputs'), ['in_4@0', 'in_2@0', 'HEADER', 'in_3@1', 'ROW', 'in_1@2'])
    pass('dragging a row above the HEADER line in the inspector lifts it on the canvas')

    await undo(page)
    assert.deepEqual(inputRows(await blockState(page, run)), ['in_4@0', 'in_2@1', 'in_3@1', 'in_1@2'])
    pass('an inspector drag is one undo step, like a canvas drag')

    // ------------------------------------------------------- expanded ---
    const expandedButton = JSON.parse(await evaluate(page, `(() => {
      const button = Array.from(document.querySelectorAll('[data-inspector-section="View"] button'))
        .find((node) => node.textContent.trim() === 'expanded')
      const r = button.getBoundingClientRect()
      return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
    })()`))
    await clickAt(page, expandedButton.cx, expandedButton.cy)
    await delay(400)
    await waitFor(page, `document.querySelector('${scope(run)} .systemsketch-block-canvas[data-block-view="expanded"]')`, 'Expanded Block')
    const expanded = await blockState(page, run)
    assert.equal(expanded.fullLines, 1, 'Expanded keeps the row line')
    const expandedRaw = await box(page, portDot(run, 'input', 'in_1'))
    const expandedGain = await box(page, portDot(run, 'input', 'in_2'))
    let bandExpanded = null
    await holdAndDrag(page,
      { x: expandedRaw.cx, y: expandedRaw.cy },
      { x: expandedRaw.cx, y: expandedGain.cy - 8 },
      { onArrive: async () => { bandExpanded = await dropBand(page); await shot(page, 'expanded-drag') } })
    assert.deepEqual(bandExpanded, { row: 1, branch: 0 })
    assert.deepEqual(inputRows(await blockState(page, run)), ['in_4@0', 'in_1@1', 'in_2@1', 'in_3@1'])
    pass('the same hold-and-drag moves a port between rows in Expanded view')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the lab journey produced zero local console errors')

    // -------------------------------------------------------- product ---
    const board = join(filesRoot, 'SystemSketch', 'port-rows-proof.systemsketch')
    await page.send('Page.navigate', {
      url: `http://127.0.0.1:${port}/?board=${encodeURIComponent(board)}`,
    })
    await waitFor(page, 'document.readyState === "complete"', 'product page load')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(600)
    await drawBlock(page, { x: 420, y: 260 }, { x: 780, y: 480 }, 'decode')
    const [decode] = await blockIds(page)
    await selectBlock(page, decode)
    await addPortFromGutter(page, 'inputs', 'frame')
    await selectBlock(page, decode)
    await addPortFromGutter(page, 'header', 'model')
    await selectBlock(page, decode)
    const product = await blockState(page, decode)
    assert.deepEqual(inputRows(product), ['in_2@0', 'in_1@1'])
    assert.equal(product.inputs[0].inHeading, true)
    await openPortMenu(page, decode, 'input', 'in_1')
    assert.ok(await exists(page, '[data-testid="context-menu-sub.block-port-row-button"]'), 'Move to is on the product menu')
    await key(page, 'Escape', 'Escape')
    await shot(page, 'product')
    pass('the product composition carries the heading bead and the row menu, not just the lab')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the product journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`
      + ['heading-bead', 'drag-into-heading', 'move-to-menu', 'drag-across-line', 'inspector-drag', 'expanded-drag', 'product']
        .map((name) => `  ${shotPath(name)}`).join('\n') + '\n')
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    await shot(page, 'failure').catch(() => undefined)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  ${error.stack ?? error}\n`)
  process.exitCode = 1
})
