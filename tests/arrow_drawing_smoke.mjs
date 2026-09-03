#!/usr/bin/env node
/**
 * Real-browser proof of the two things Zach asked for on arrows.
 *
 *   1. An arrow is drawn by CLICKING its two ends. The press-and-drag that
 *      tldraw ships still draws exactly the arrow it always did; what changes
 *      is the release tldraw currently throws away — a click that never became
 *      a drag now leaves the arrow's end on the pointer, and the next click
 *      lands it.
 *   2. Drawing an arrow does not open a text editor on it. That was SystemSketch's
 *      own "name the box you just drew" behaviour reaching a shape it should not
 *      have; a rectangle still names itself, an arrow no longer does.
 *
 * Every claim is read from what the browser painted: the arrow's own SVG stroke
 * sampled through `getScreenCTM`, the container's state attribute, and the
 * presence of a live text editor in the DOM. The last section runs the same
 * gesture against the pinned stock-tldraw profile served by the same build, so
 * the before and the after are measured in one run rather than argued about.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []
/** Numbers this run measured, for the report to quote instead of hardcoding. */
const measurements = {}

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n        desired= ${JSON.stringify(desired)}\n`),
  )
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

/** tldraw paints its own state path onto the container; it is the honest oracle. */
const toolState = (page) =>
  evaluate(page, `document.querySelector('.tl-container')?.getAttribute('data-state') ?? null`)

const arrowCount = (page) =>
  evaluate(page, `document.querySelectorAll('[data-shape-type="arrow"]').length`)

/** Is any shape's text editor live on the canvas right now? */
const liveTextEditor = (page) => evaluate(page, `(() => {
  const editing = document.querySelector('.tl-shape [contenteditable="true"], .tl-shape input:not([type="hidden"])')
  if (!editing) return null
  return editing.closest('[data-shape-type]')?.dataset.shapeType ?? 'unknown'
})()`)

/**
 * Where the browser actually drew each arrow, in client pixels.
 *
 * The shaft is the longest painted `path` in the shape that is not inside a
 * clip path — an arrow also paints its head and a clipped hit region, and
 * reading one of those instead of the stroke is a silent way to measure the
 * wrong thing. Two measured facts about that shaft shape this journey's
 * assertions: its `d` traverses the same geometry twice (a 500 px arrow reports
 * a 1000 px path), so the point at half its length is its END, not its middle —
 * hence `samples`, from which curvature is taken as the largest departure from
 * the straight line between the ends rather than from any single midpoint.
 */
async function paintedArrows(page) {
  const value = await evaluate(page, `(() => JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="arrow"]')).map((shape) => {
    const paths = Array.from(shape.querySelectorAll('path'))
      .filter((path) => !path.closest('clipPath') && !path.closest('defs'))
      .map((path) => ({ path, length: path.getTotalLength() }))
      .sort((a, b) => b.length - a.length)
    if (paths.length === 0) return null
    const { path, length } = paths[0]
    const matrix = path.getScreenCTM()
    const at = (distance) => {
      const point = path.getPointAtLength(Math.max(0, Math.min(length, distance))).matrixTransform(matrix)
      return { x: Math.round(point.x), y: Math.round(point.y) }
    }
    const samples = []
    for (let step = 0; step <= 40; step += 1) samples.push(at((length * step) / 40))
    return { id: shape.dataset.shapeId, from: at(0), to: at(length), samples, length: Math.round(length) }
  }).filter(Boolean)))()`)
  return JSON.parse(value)
}

/** The one arrow that starts where a gesture started, whatever the paint order. */
function arrowFrom(arrows, point, tolerance = 16) {
  const matches = arrows.filter((arrow) => near(arrow.from, point, tolerance))
  if (matches.length !== 1) {
    throw new Error(`Expected one arrow starting near ${JSON.stringify(point)}, found ${matches.length}`
      + ` in ${JSON.stringify(arrows)}`)
  }
  return matches[0]
}

const near = (point, target, tolerance = 16) =>
  Math.hypot(point.x - target.x, point.y - target.y) <= tolerance

/** How far the painted stroke bows away from the straight line between its ends. */
function bow({ from, to, samples }) {
  const span = Math.hypot(to.x - from.x, to.y - from.y)
  if (span === 0) return 0
  const deviation = (point) =>
    Math.abs((to.x - from.x) * (from.y - point.y) - (from.x - point.x) * (to.y - from.y)) / span
  return Math.round(Math.max(...samples.map(deviation)))
}

async function selectArrowTool(page, presses = 1) {
  for (let press = 0; press < presses; press += 1) {
    await shortcut(page, 'a', 'KeyA')
  }
  await delay(160)
}

/**
 * Choose an arrow preset from the real toolbar menu.
 *
 * Pressing A repeatedly cycles the preset, so counting keystrokes across a long
 * journey is a bookkeeping exercise that silently draws the wrong shape — it
 * did, on the first run of this file. The menu names the preset it sets.
 */
async function pickArrowPreset(page, label, { shotName } = {}) {
  const trigger = await elementBox(page, '[data-testid="systemsketch-tool-shape"]')
  await clickAt(page, trigger.x + trigger.width / 2, trigger.y + trigger.height / 2)
  await delay(320)
  const locate = `(() => {
    const node = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
      .find((candidate) => (candidate.textContent ?? '').trim().startsWith(${JSON.stringify(label)}))
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
  })()`
  await waitFor(page, locate, `the ${label} menu entry`)
  if (shotName) await shot(page, shotName)
  const rect = JSON.parse(await evaluate(page, locate))
  await clickAt(page, rect.cx, rect.cy)
  await delay(320)
}

/** A click that is unmistakably a click: no movement between press and release. */
async function clickPoint(page, point) {
  await mouse(page, 'mouseMoved', point.x, point.y)
  await delay(60)
  await mouse(page, 'mousePressed', point.x, point.y, { buttons: 1 })
  await delay(60)
  await mouse(page, 'mouseReleased', point.x, point.y)
  await delay(220)
}

async function moveTo(page, point) {
  await mouse(page, 'mouseMoved', point.x, point.y)
  await delay(140)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-arrows' })
  try {
    const { page, port } = app
    await openApp(page, port, '')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'the canvas')
    await delay(600)

    // ── 1. Click, move, click ────────────────────────────────────────────────
    const start = { x: 360, y: 300 }
    const halfway = { x: 560, y: 420 }
    const end = { x: 860, y: 300 }

    await selectArrowTool(page)
    check('ARROW-1a', 'A selects the arrow tool', await toolState(page), 'arrow.idle')
    await pickArrowPreset(page, 'Straight arrow')

    await clickPoint(page, start)
    check('ARROW-1b', 'one click hands the end point to tldraw\'s own handle drag',
      await toolState(page), 'select.dragging_handle')

    await moveTo(page, halfway)
    const rubberBand = arrowFrom(await paintedArrows(page), start)
    check('ARROW-1c', 'the arrow is already drawn from the click to the pointer',
      [near(rubberBand.from, start), near(rubberBand.to, halfway)], [true, true])
    await shot(page, 'arrow-placement-rubber-band.png')

    await moveTo(page, end)
    await clickPoint(page, end)
    const drawn = arrowFrom(await paintedArrows(page), start)
    check('ARROW-1d', 'the second click lands it, spanning the two clicked points',
      [await arrowCount(page), near(drawn.from, start), near(drawn.to, end)], [1, true, true])

    // ── 2. No text editor on a new arrow ────────────────────────────────────
    check('ARROW-2a', 'nothing on the arrow is asking to be typed into',
      [await liveTextEditor(page), await toolState(page)], [null, 'select.idle'])
    await shot(page, 'arrow-placement-landed.png')

    // ── 3. The gesture it replaces still works ──────────────────────────────
    await selectArrowTool(page)
    await drag(page, { x: 360, y: 560 }, { x: 860, y: 660 })
    const dragged = arrowFrom(await paintedArrows(page), { x: 360, y: 560 })
    check('ARROW-3a', 'press-and-drag still draws exactly the arrow it always did',
      [await arrowCount(page), near(dragged.from, { x: 360, y: 560 }), near(dragged.to, { x: 860, y: 660 })],
      [2, true, true])
    check('ARROW-3b', 'and it does not open a text editor either',
      await liveTextEditor(page), null)

    // ── 4. A rectangle still names itself ───────────────────────────────────
    await key(page, 'r', 'KeyR')
    await drag(page, { x: 1000, y: 520 }, { x: 1240, y: 700 })
    check('ARROW-4a', 'a rectangle still opens its own name, which is why this feature exists',
      await liveTextEditor(page), 'geo')
    await shot(page, 'arrow-rectangle-still-names-itself.png')
    await key(page, 'Escape', 'Escape')
    await delay(200)

    // ── 5. Escape mid-placement ─────────────────────────────────────────────
    const before = await arrowCount(page)
    await selectArrowTool(page)
    await clickPoint(page, { x: 300, y: 780 })
    await moveTo(page, { x: 600, y: 800 })
    const midPlacement = await arrowCount(page)
    await key(page, 'Escape', 'Escape')
    await delay(260)
    check('ARROW-5a', 'Escape takes the half-drawn arrow with it and hands back the tool',
      [midPlacement, await arrowCount(page), await toolState(page)],
      [before + 1, before, 'arrow.idle'])

    // ── 6. A second click that never left the first ─────────────────────────
    await clickPoint(page, { x: 300, y: 820 })
    await delay(500)
    await clickPoint(page, { x: 302, y: 821 })
    await delay(300)
    check('ARROW-6a', 'a second click on the start point means never mind, not a zero-length arrow',
      [await arrowCount(page), await toolState(page)], [before, 'arrow.idle'])

    // ── 7. Leaving for another tool ─────────────────────────────────────────
    await selectArrowTool(page)
    await clickPoint(page, { x: 1120, y: 300 })
    await moveTo(page, { x: 1240, y: 380 })
    await key(page, 'r', 'KeyR')
    await delay(300)
    check('ARROW-7a', 'walking away for another tool strands nothing on the board',
      [await arrowCount(page), (await toolState(page)).startsWith('geo')], [before, true])

    // ── 8. The Curve preset still reaches a click-placed arrow ──────────────
    await pickArrowPreset(page, 'Curved arrow', { shotName: 'arrow-preset-menu.png' })
    await clickPoint(page, { x: 360, y: 180 })
    await moveTo(page, { x: 860, y: 180 })
    await clickPoint(page, { x: 860, y: 180 })
    await delay(260)
    const curved = arrowFrom(await paintedArrows(page), { x: 360, y: 180 })
    check('ARROW-8a', 'the Curve preset bends a click-placed arrow, as it does a dragged one',
      [await arrowCount(page) - before, bow(curved) > 20, bow(drawn) <= 2], [1, true, true])
    await shot(page, 'arrow-curve-preset.png')

    // ── 9. A click that lands on a shape still binds to it ──────────────────
    await pickArrowPreset(page, 'Straight arrow')
    const insideRectangle = { x: 1120, y: 610 }
    await clickPoint(page, { x: 700, y: 610 })
    await moveTo(page, insideRectangle)
    await clickPoint(page, insideRectangle)
    await delay(300)
    const bound = arrowFrom(await paintedArrows(page), { x: 700, y: 610 })
    // The rectangle drawn in section 4 spans x 1000–1240. An arrow that bound to
    // it stops at its edge; an unbound one would run all the way to the click.
    check('ARROW-9a', 'a click that lands inside a shape still binds the arrow to it',
      [bound.to.x < insideRectangle.x - 60, bound.to.x > 960], [true, true])
    await shot(page, 'arrow-bound-to-shape.png')
    measurements.straightBow = bow(drawn)
    measurements.curveBow = bow(curved)
    measurements.clickedInside = insideRectangle
    measurements.boundEnd = bound.to
    measurements.rectangle = JSON.parse(await evaluate(page, `(() => {
      const node = document.querySelector('[data-shape-type="geo"]')
      const rect = node.getBoundingClientRect()
      return JSON.stringify({
        x: Math.round(rect.x), y: Math.round(rect.y),
        w: Math.round(rect.width), h: Math.round(rect.height),
      })
    })()`))
    for (const [name, value] of Object.entries(measurements)) {
      process.stdout.write(`  MEASURED  ${name} = ${JSON.stringify(value)}\n`)
    }

    // ── 10. The same gesture against pinned stock tldraw ────────────────────
    await openApp(page, port, '?preset=stock')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'the stock canvas')
    await delay(700)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch?.editor
      if (editor) editor.deleteShapes(editor.getCurrentPageShapeIds() ? [...editor.getCurrentPageShapeIds()] : [])
      return true
    })()`)
    await shortcut(page, 'a', 'KeyA')
    await clickPoint(page, start)
    await moveTo(page, end)
    await clickPoint(page, end)
    await delay(300)
    check('STOCK-1', 'in pinned stock tldraw the same two clicks still draw nothing',
      [await arrowCount(page), await toolState(page)], [0, 'arrow.idle'])
    await shot(page, 'arrow-stock-two-clicks-draw-nothing.png')

    const errors = localConsoleErrors(page)
    check('CLEAN', 'no console errors from the app', errors, [])
  } finally {
    app.close()
  }

  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
  if (failed.length > 0) process.exitCode = 1
  await writeFile(join(SHOTS, 'arrow-drawing-results.json'), JSON.stringify(results, null, 2))
  await writeFile(join(SHOTS, 'arrow-drawing-measurements.json'), JSON.stringify(measurements, null, 2))
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
