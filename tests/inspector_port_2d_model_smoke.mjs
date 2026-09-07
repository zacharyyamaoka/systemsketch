#!/usr/bin/env node
/**
 * The property dnd-kit is not allowed to take over: a port row's place is
 * `{ row, branch, before }`, and what the inspector OFFERS must be what the
 * release COMMITS.
 *
 * dnd-kit owns the gesture in the inspector (sensor + draggable handle) and
 * nothing else. Its sortable layer is deliberately not mounted, because it
 * sorts a flat array of DOM ids and a port row does not live in a flat list:
 *
 *   - a body row can hold several conditional ARMS, and a drop must be able to
 *     land in a different arm of the same row;
 *   - the managed face paints HIDDEN ports that the ordinary face filters out,
 *     so painted index and lane index disagree by construction.
 *
 * The oracle is checked in BOTH directions, which is the part that would rot
 * silently if resolution ever drifted to a DOM index: a drop that offers a bar
 * must change the lane, and a drop that offers nothing must leave it alone.
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
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const shotPath = (name) => join(SHOTS, `inspector-port-2d-model-${name}.png`)

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

/** Measure only what is on screen: the panel scrolls, so bring it into view. */
async function box(page, selector) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    element.scrollIntoView({ block: 'center' })
    return '1'
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  await delay(160)
  const rect = JSON.parse(await evaluate(page, `(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`))
  return { ...rect, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }
}

const scope = (shapeId) => `[data-shape-id="${shapeId}"]`
const portDot = (shapeId, side, portId) =>
  `${scope(shapeId)} .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

async function blockIds(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="block"]'))
      .map((node) => node.dataset.shapeId))`))
}

/** The painted dots of one lane, top to bottom, with the row each carries. */
async function laneOnCanvas(page, shapeId, side) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return null
    return JSON.stringify(Array.from(
      wrapper.querySelectorAll('.Port[data-block-port-side="${side}"]'))
      .map((node) => ({ node, top: node.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map(({ node }) => node.dataset.blockPortId + '@' + node.dataset.blockPortRow))
  })()`)
  if (!value) throw new Error(`No Block ${shapeId}`)
  return JSON.parse(value)
}

/**
 * The inspector's list for a lane, as `id@row/arm`.
 *
 * The arm is only legible here — the canvas dot carries its row but not its
 * branch — so this list is the surface where a cross-arm move is observable.
 */
async function laneInInspector(page, side) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-testid="inspector-ports-${side}"] > li'))
      .filter((node) => node.dataset.portId)
      .map((node) => node.dataset.portId + '@' + node.dataset.row + '/' + node.dataset.branch))`))
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

async function addPortFromGutter(page, where, name) {
  const zone = await box(page, `[data-testid="block-port-add-zone-${where}"]`)
  await mouse(page, 'mouseMoved', zone.cx, zone.cy)
  await delay(220)
  const bead = await box(page, `[data-testid="block-port-add-${where}"]`)
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

async function selectBlock(page, shapeId) {
  await clickAt(page, 200, 760)
  await delay(220)
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, face.cx, face.y + 22)
  await waitFor(page, `document.querySelector('[data-testid="block-port-add-zone-header"]')`, 'selected Block')
}

async function openPortMenu(page, shapeId, side, portId) {
  const dot = await box(page, portDot(shapeId, side, portId))
  await clickAt(page, dot.cx, dot.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-group.systemsketch-block-port"]')`,
    `port context menu for ${portId}`)
}

async function chooseRowCommand(page, itemId) {
  await clickElement(page, '[data-testid="context-menu-sub.block-port-row-button"]')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.block-port-row-content"]')`,
    'Move to submenu')
  await delay(140)
  await clickElement(page, `[data-testid="context-menu.${itemId}"]`)
  await delay(300)
}

/**
 * Drag a grip to a y, reporting whether the inspector offered anything before
 * the release. The caller pairs that offer with what the lane actually did.
 */
async function dragGripTo(page, side, portId, targetY) {
  const grip = await box(page, `[data-testid="inspector-port-grip-${side}-${portId}"]`)
  await mouse(page, 'mouseMoved', grip.cx, grip.cy)
  await mouse(page, 'mousePressed', grip.cx, grip.cy, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      grip.cx, grip.cy + ((targetY - grip.cy) * step) / 10, { buttons: 1 })
    await delay(30)
  }
  await delay(220)
  const offered = JSON.parse(await evaluate(page, `JSON.stringify({
    bar: Boolean(document.querySelector('[data-testid="inspector-drop-bar"]')),
    band: Boolean(document.querySelector('[data-testid="inspector-drop-band"]')),
  })`))
  await mouse(page, 'mouseReleased', grip.cx, targetY)
  await delay(420)
  return offered
}

const { pass, report } = makeChecklist()

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-2d', build: 'inspector-2d-model-smoke' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    await drawBlock(page, { x: 400, y: 190 }, { x: 760, y: 470 }, 'route')
    await waitFor(page,
      `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`,
      'Port Block')
    const [route] = await blockIds(page)
    await selectBlock(page, route)
    for (const name of ['probe', 'sample', 'trace']) await addPortFromGutter(page, 'inputs', name)
    for (const name of ['hit', 'miss']) await addPortFromGutter(page, 'outputs', name)
    await selectBlock(page, route)

    // ------------------------------------------------ open a second arm ---
    await openPortMenu(page, route, 'output', 'out_1')
    await chooseRowCommand(page, 'block-port-new-branch')
    await key(page, 'Escape', 'Escape')
    await delay(200)
    await selectBlock(page, route)

    const armed = await laneInInspector(page, 'outputs')
    assert.deepEqual(armed, ['out_2@1/0', 'out_1@1/1'],
      `one row, two arms, saw ${armed}`)
    await shot(page, 'two-arms')
    pass('a row carries two conditional arms — a place a flat list cannot name')

    // ------------------------------------- drag ACROSS arms in one row ---
    // out_1 sits alone in arm 1. Dropping it onto arm 0 is a move a flat
    // sortable list could not even express: the painted neighbour is already
    // adjacent, so an index-based resolver reads it as "nothing to do".
    const armZero = await box(page, '[data-testid="inspector-port-outputs-out_2"]')
    const across = await dragGripTo(page, 'outputs', 'out_1', armZero.y + 3)
    assert.equal(across.bar, true, 'the cross-arm drop offered a landing')

    const afterArm = await laneInInspector(page, 'outputs')
    assert.deepEqual(afterArm, ['out_1@1/0', 'out_2@1/0'],
      `both outputs now share arm 0, saw ${afterArm}`)
    await shot(page, 'across-arms')
    pass('a drop into a different arm lands in that arm, not merely beside a neighbour')

    const canvasAfterArm = await laneOnCanvas(page, route, 'output')
    assert.deepEqual(canvasAfterArm, ['out_1@1', 'out_2@1'],
      `the canvas paints the same order, saw ${canvasAfterArm}`)
    pass('canvas and inspector agree after a cross-arm drop')

    // ------------------------------------------- the oracle says NO too ---
    // Drop a port back onto its own place. The reducer says the lane would not
    // change, so nothing must be offered AND nothing must move. A resolver
    // that trusted painted geometry would happily "move" it to where it is.
    const ownRow = await box(page, '[data-testid="inspector-port-outputs-out_1"]')
    const noop = await dragGripTo(page, 'outputs', 'out_1', ownRow.y + 3)
    assert.equal(noop.bar, false, 'a drop that changes nothing offers no bar')
    assert.equal(noop.band, false, 'and tints no row')
    assert.deepEqual(await laneInInspector(page, 'outputs'), afterArm,
      'the lane is untouched by a no-op release')
    pass('a drop that would change nothing offers nothing and commits nothing')

    // -------------------------------------- the managed face, hidden port ---
    await clickElement(page, '[data-inspector-section="Inputs"] .block-inspector__count-pill')
    await waitFor(page,
      `document.querySelector('.block-inspector__ports--managed')`, 'the managed face')
    await delay(250)
    await clickElement(page, '[aria-label="Hide sample"]')
    await delay(400)

    const managedRows = await laneInInspector(page, 'inputs')
    const visibleDots = await laneOnCanvas(page, route, 'input')
    assert.equal(managedRows.length, 3,
      `the managed face paints all three inputs, saw ${managedRows}`)
    assert.equal(visibleDots.length, 2,
      `the canvas paints only the visible two, saw ${visibleDots}`)
    await shot(page, 'managed-hidden')
    pass('the managed face paints a hidden port the canvas does not')

    // in_3 is last; in_2 (hidden) is painted directly above it. Dropping in_3
    // above the hidden row is a real lane move that an `arrayMove` over the
    // VISIBLE list would never produce, because there in_3 follows in_1.
    const hiddenRow = await box(page, '[data-testid="inspector-port-inputs-in_2"]')
    const pastHidden = await dragGripTo(page, 'inputs', 'in_3', hiddenRow.y + 3)
    assert.equal(pastHidden.bar, true, 'a move past a hidden row is a real move')

    const managedAfter = await laneInInspector(page, 'inputs')
    assert.deepEqual(managedAfter, ['in_1@1/0', 'in_3@1/0', 'in_2@1/0'],
      `the hidden port kept its own place in the lane, saw ${managedAfter}`)
    pass('a drop resolved past a hidden row lands by the lane, not by painted index')

    const visibleAfter = await laneOnCanvas(page, route, 'input')
    assert.deepEqual(visibleAfter, ['in_1@1', 'in_3@1'],
      `the visible lane follows the same order, saw ${visibleAfter}`)
    pass('canvas and managed inspector stay one lane after a hidden-row drop')

    assert.deepEqual(await localConsoleErrors(page), [], 'no console errors')
    pass('the journey produced zero local console errors')
  } finally {
    await app.close()
  }

  report('browser')
  for (const name of ['two-arms', 'across-arms', 'managed-hidden']) console.log(`  ${shotPath(name)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
