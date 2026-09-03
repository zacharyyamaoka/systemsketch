/**
 * Block-journey helpers shared by the edge polarity proof.
 *
 * Everything here drives the real app through real pointer events and reads
 * its answers back from the painted document. The only exception is the
 * development seam, used for facts that have no DOM projection at all: a
 * shape's parent and the overlay list tldraw paints to a `<canvas>`.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  mouse,
  waitFor,
} from './browser_harness.mjs'
import { elementBox as box } from './cdp_kit.mjs'

export const SHOTS = join(ROOT, 'docs', 'assets')

export async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

/**
 * One element's rect. This used to be a second copy of `elementBox` from
 * `browser_harness.mjs` with different property names — the same body twice, in
 * the two files that were each meant to be the shared one. The kit's version now
 * returns both vocabularies, so this is the same function under its other name.
 */
// Imported, not just re-exported: this module's own helpers call `box`, and a
// bare `export ... from` creates no local binding for them.
export { box }

export const scope = (shapeId) => `[data-shape-id="${shapeId}"]`
export const portDot = (shapeId, side, portId) =>
  `${scope(shapeId)} .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

export const blockIds = (page) => evaluate(page, `(() => JSON.stringify(
  Array.from(document.querySelectorAll('[data-shape-type="block"]'))
    .map((node) => node.dataset.shapeId)))()`).then(JSON.parse)

export const cables = (page) =>
  evaluate(page, `document.querySelectorAll('[data-shape-type="connection"]').length`)

export const pickerOpen = (page) =>
  evaluate(page, `Boolean(document.querySelector('[data-testid="block-picker"]'))`)

/** The classes each painted port dot is currently wearing. */
export const portClasses = (page) => evaluate(page, `(() => JSON.stringify(
  Array.from(document.querySelectorAll('.systemsketch-block-canvas .Port')).map((node) => ({
    shape: node.closest('[data-shape-id]')?.dataset.shapeId,
    port: node.dataset.blockPortId,
    side: node.dataset.blockPortSide,
    eligible: node.classList.contains('Port_eligible'),
    hinting: node.classList.contains('Port_hinting'),
    connected: node.classList.contains('Port_connected'),
  }))))()`).then(JSON.parse)

/**
 * Where the painted cable begins and ends, and which way it is heading at
 * each end — all in client pixels, read from the SVG path the browser drew.
 *
 * `from` / `to` are the path's own first and last points; `leaveDx` is the
 * horizontal component of the tangent as the cable leaves `from`, `arriveDx`
 * as it arrives at `to`. In this model a cable always leaves its source
 * heading +x and arrives at its sink heading +x, so both should be positive.
 */
export async function cableEnds(page, index = 0) {
  const value = await evaluate(page, `(() => {
    const paths = document.querySelectorAll('[data-shape-type="connection"] path')
    const path = paths[${index}]
    if (!path) return null
    const total = path.getTotalLength()
    const matrix = path.getScreenCTM()
    const at = (length) => path.getPointAtLength(Math.max(0, Math.min(total, length))).matrixTransform(matrix)
    const from = at(0)
    const to = at(total)
    const afterFrom = at(Math.min(14, total / 4))
    const beforeTo = at(Math.max(total - 14, (total * 3) / 4))
    return JSON.stringify({
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      leaveDx: afterFrom.x - from.x,
      arriveDx: to.x - beforeTo.x,
      length: total,
    })
  })()`)
  if (!value) throw new Error('No cable to sample')
  return JSON.parse(value)
}

/** Evenly spaced client-pixel points along the painted cable. */
export async function cableSamples(page, count = 40, index = 0) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelectorAll('[data-shape-type="connection"] path')[${index}]
    if (!path) return null
    const total = path.getTotalLength()
    const matrix = path.getScreenCTM()
    const points = []
    for (let step = 0; step <= ${count}; step += 1) {
      const point = path.getPointAtLength((total * step) / ${count}).matrixTransform(matrix)
      points.push({ x: point.x, y: point.y })
    }
    return JSON.stringify(points)
  })()`)
  if (!value) throw new Error('No cable to sample')
  return JSON.parse(value)
}

/** Which dot (by label) a client point sits on, within a tolerance. */
export function nearestDot(point, dots, tolerance = 12) {
  let best = null
  let bestDistance = tolerance
  for (const [label, dot] of Object.entries(dots)) {
    const distance = Math.hypot(dot.cx - point.x, dot.cy - point.y)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = label
    }
  }
  return best
}

export async function drawBlock(page, from, to, title) {
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
  await delay(200)
}

export async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  const selector = `[aria-label="${label}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, label, 8000)
  const button = await box(page, selector)
  await clickAt(page, button.cx, button.cy)
  await delay(320)
}

export async function setView(page, view) {
  await waitFor(page,
    `Array.from(document.querySelectorAll('[data-inspector-section="View"] button'))
      .some((node) => node.textContent.trim() === ${JSON.stringify(view)})`,
    `${view} button`)
  const rect = JSON.parse(await evaluate(page, `(() => {
    const button = Array.from(document.querySelectorAll('[data-inspector-section="View"] button'))
      .find((node) => node.textContent.trim() === ${JSON.stringify(view)})
    const r = button.getBoundingClientRect()
    return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
  })()`))
  await clickAt(page, rect.cx, rect.cy)
  await delay(400)
}

/**
 * Click empty canvas to clear the selection.
 *
 * The pause after the click is deliberate: tldraw folds two clicks on one spot
 * inside 450 ms into a double-click, and a double-click on empty canvas starts
 * a text shape — after which the next press on a port is a Block drag, not a
 * cable. Two consecutive deselects must never read as one double-click.
 */
export async function deselect(page, at = { x: 200, y: 900 }) {
  await clickAt(page, at.x, at.y)
  await delay(340)
}

/** Press a port, drag to a point, release. Returns what the release produced. */
export async function dragFrom(page, from, to, { shotName, steps = 10 } = {}) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  const target = { cx: to.cx ?? to.x, cy: to.cy ?? to.y }
  let midClasses = null
  for (let step = 1; step <= steps; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((target.cx - from.cx) * step) / steps,
      from.cy + ((target.cy - from.cy) * step) / steps,
      { buttons: 1 })
    await delay(26)
    if (step === steps) midClasses = await portClasses(page)
  }
  if (shotName) await shot(page, shotName)
  await mouse(page, 'mouseReleased', target.cx, target.cy)
  await delay(340)
  return { midClasses, offered: await pickerOpen(page), count: await cables(page) }
}

/** A real point ON a cable, at a fraction of its length, in client pixels. */
export async function pointOnCable(page, t, index = 0) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelectorAll('[data-shape-type="connection"] path')[${index}]
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * ${t})
    const screen = point.matrixTransform(path.getScreenCTM())
    return JSON.stringify({ cx: screen.x, cy: screen.y })
  })()`)
  if (!value) throw new Error('No cable to sample')
  return JSON.parse(value)
}

/**
 * Remove every cable on the board, so each case starts from a known state.
 *
 * Fixture reset, not a claim: cables paint UNDER Blocks, so a cable that runs
 * across a card cannot be selected by clicking it, and the seam deletes what
 * the pointer cannot reach. Nothing asserted anywhere reads from this.
 */
export async function clearCables(page, deselectAt) {
  if (await pickerOpen(page)) {
    await key(page, 'Escape', 'Escape')
    await delay(280)
  }
  await deselect(page, deselectAt)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    if (!editor) return
    const ids = editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'connection')
      .map((shape) => shape.id)
    if (ids.length > 0) editor.deleteShapes(ids)
  })()`)
  await delay(200)
  await deselect(page, deselectAt)
  return cables(page)
}

/** Delete a Block by clicking its heading and pressing Delete. */
export async function deleteBlock(page, shapeId, deselectAt) {
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, face.x + 24, face.y + 12)
  await delay(200)
  await key(page, 'Delete', 'Delete')
  await delay(300)
  await deselect(page, deselectAt)
}

/** The parent of a shape — a structural fact with no DOM projection. */
export const parentOf = (page, shapeId) => evaluate(page,
  `window.__systemsketch?.editor.getShape(${JSON.stringify(shapeId)})?.parentId ?? null`)
