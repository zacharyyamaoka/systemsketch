#!/usr/bin/env node
/**
 * Real-browser proof that an arrow and a data edge are one choice.
 *
 * The rule the user asked for: "setting the default arrow type also sets the
 * default edge type… when you first startup the app it should start at elbow."
 * So A is not an arrow control — it is the connector control, and a cable drawn
 * from a port comes out the same shape as an arrow drawn on empty canvas.
 *
 * Nothing here reads the shape's `kind` or `routing` prop. Every verdict is
 * taken from the stroke the browser actually painted: 48 points sampled along
 * the path, classified by how far they bow off the chord and how many steps run
 * along an axis. That is an oracle independent of the props being asserted —
 * a mislabelled shape that paints the right line would still have to paint it.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
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
import {
  blockIds,
  box,
  cables,
  clearCables,
  deselect,
  drawBlock,
  addPort,
  portDot,
  shot,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

/**
 * Sample the longest stroke inside a shape, in client pixels.
 *
 * The longest one is the connector itself: an arrow also paints arrowhead and
 * clip paths, and a cable paints a wide invisible hit path beside its stroke.
 */
const STROKE_SAMPLER = `(selector) => {
  const paths = Array.from(document.querySelectorAll(selector))
  let best = null
  for (const path of paths) {
    if (typeof path.getTotalLength !== 'function') continue
    const length = path.getTotalLength()
    if (!Number.isFinite(length) || length === 0) continue
    if (!best || length > best.length) best = { path, length }
  }
  if (!best) return null
  const matrix = best.path.getScreenCTM()
  const points = []
  for (let step = 0; step <= 48; step += 1) {
    const point = best.path.getPointAtLength((best.length * step) / 48).matrixTransform(matrix)
    points.push({ x: point.x, y: point.y })
  }
  return JSON.stringify(points)
}`

async function samplePoints(page, selector) {
  const value = await evaluate(page, `(${STROKE_SAMPLER})(${JSON.stringify(selector)})`)
  if (!value) throw new Error(`Nothing painted for ${selector}`)
  return JSON.parse(value)
}

/**
 * Which of the three shapes a painted stroke is.
 *
 * `straight` bows off its own chord by nothing; `elbow` runs along an axis for
 * almost every step (its four rounded corners are the only exceptions); a
 * bezier bows and never holds an axis. Measured separation on this app is wide:
 * an elbow holds ~92% of its steps on an axis, a curve ~21%.
 */
export function classifyStroke(points) {
  const first = points[0]
  const last = points[points.length - 1]
  const chord = Math.hypot(last.x - first.x, last.y - first.y)
  if (chord < 1) return 'degenerate'

  let deviation = 0
  for (const point of points) {
    const t = ((point.x - first.x) * (last.x - first.x)
      + (point.y - first.y) * (last.y - first.y)) / (chord * chord)
    deviation = Math.max(deviation, Math.hypot(
      point.x - (first.x + t * (last.x - first.x)),
      point.y - (first.y + t * (last.y - first.y)),
    ))
  }
  if (deviation < 4) return 'straight'

  let axial = 0
  for (let step = 1; step < points.length; step += 1) {
    const dx = Math.abs(points[step].x - points[step - 1].x)
    const dy = Math.abs(points[step].y - points[step - 1].y)
    if (Math.max(dx, dy) < 0.5 || Math.min(dx, dy) <= 0.35 * Math.max(dx, dy)) axial += 1
  }
  return axial / (points.length - 1) >= 0.8 ? 'elbow' : 'curved'
}

const arrowCount = (page) =>
  evaluate(page, `document.querySelectorAll('[data-shape-type="arrow"]').length`)

/**
 * `[stroke-width]` is doing real work: an arrow also paints a `<clipPath>` in
 * its `<defs>` — the rectangular hole its label sits in — and that path is
 * longer than the stroke and axis-aligned, so a naive "longest path" sampler
 * happily reports every arrow as an elbow. It cost two red checks to find.
 */
const arrowShape = (page) => samplePoints(page, '[data-shape-type="arrow"] path[stroke-width]')
  .then(classifyStroke)

const cableShape = (page) => samplePoints(page, '[data-shape-type="connection"] path')
  .then(classifyStroke)

/** Delete every arrow, so each case measures a stroke it drew itself. */
async function clearArrows(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    if (!editor) return
    const ids = editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'arrow').map((shape) => shape.id)
    if (ids.length > 0) editor.deleteShapes(ids)
  })()`)
  await delay(180)
}

/**
 * Drag an arrow across empty canvas with the arrow tool already armed.
 *
 * SystemSketch drops a freshly drawn shape straight into its label editor, and
 * a port press is deliberately inert while anything is being edited — so the
 * gesture ends the way a person ends it, with Escape.
 */
async function drawArrow(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 8,
      from.y + ((to.y - from.y) * step) / 8,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(420)
  await key(page, 'Escape', 'Escape')
  await delay(240)
}

/** Press a port and release on another, with whatever tool is armed. */
async function wirePorts(page, from, to) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((to.cx - from.cx) * step) / 10,
      from.cy + ((to.cy - from.cy) * step) / 10,
      { buttons: 1 })
    await delay(26)
  }
  await mouse(page, 'mouseReleased', to.cx, to.cy)
  await delay(420)
}

/**
 * Arm the arrow tool on a given preset.
 *
 * A only advances the cycle while the arrow tool is already the current tool —
 * drawing hands the board back to Select — so reaching the next preset from a
 * finished drawing is two presses: one to re-arm, one to advance.
 */
async function armArrow(page, advance) {
  for (let press = 0; press <= advance; press += 1) await shortcut(page, 'a', 'KeyA')
  await delay(220)
}

/** What the toolbar's arrow rows say, top to bottom. */
async function arrowMenuRows(page) {
  const trigger = await box(page, '[data-testid="systemsketch-tool-shape"]')
  await clickAt(page, trigger.cx, trigger.cy)
  await waitFor(page,
    `Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
      .some((node) => node.textContent.includes('arrow'))`,
    'arrow rows')
  const rows = JSON.parse(await evaluate(page, `(() => JSON.stringify(
    Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
      .map((node) => ({
        label: node.querySelector('.tlui-button__label')?.textContent?.trim() ?? '',
        kbd: node.querySelector('kbd')?.textContent?.trim() ?? '',
      }))
      .filter((row) => row.label.includes('arrow'))))()`))
  await key(page, 'Escape', 'Escape')
  await delay(260)
  return rows
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-arrow-sync', build: 'edge-arrow-sync' })
  const { page, port } = app

  try {
    await openApp(page, port, '')
    await waitFor(page, `document.querySelector('.systemsketch-app .tl-container')`,
      'product canvas', 30000)
    await delay(1600)

    // ------------------------------------------------- the toolbar says so ---
    const rows = await arrowMenuRows(page)
    check('TOOLBAR-1', 'the arrow rows are listed in the order A walks them',
      rows.map((row) => row.label),
      ['Elbow arrow', 'Straight arrow', 'Curved arrow'])
    check('TOOLBAR-2', 'and Elbow is the one a single A reaches',
      rows.map((row) => row.kbd), ['A', 'A × 2', 'A × 3'])

    // ------------------------------------------------------- the fixture ---
    await drawBlock(page, { x: 240, y: 430 }, { x: 540, y: 610 }, 'source')
    const [source] = await blockIds(page)
    await addPort(page, 'outputs')
    await deselect(page, { x: 1180, y: 880 })

    await drawBlock(page, { x: 900, y: 660 }, { x: 1200, y: 840 }, 'sink')
    const sink = (await blockIds(page)).find((id) => id !== source)
    await addPort(page, 'inputs')
    await deselect(page, { x: 1180, y: 880 })

    const out = () => box(page, portDot(source, 'output', 'out_1'))
    const into = () => box(page, portDot(sink, 'input', 'in_1'))

    // ------------------------------------------------ a fresh app is elbow ---
    await armArrow(page, 0)
    await drawArrow(page, { x: 340, y: 140 }, { x: 760, y: 320 })
    check('START-ARROW', 'the first A of a fresh app draws an elbow arrow',
      await arrowShape(page), 'elbow')
    await deselect(page, { x: 1180, y: 880 })

    await wirePorts(page, await out(), await into())
    check('START-EDGE-1', 'and a cable drawn from a port lands', await cables(page), 1)
    check('START-EDGE-2', 'shaped like the arrow beside it', await cableShape(page), 'elbow')
    await deselect(page, { x: 1180, y: 880 })
    await shot(page, 'arrow-sync-elbow.png')

    // ------------------------------------------- one key moves both shapes ---
    for (const [id, preset, expected] of [
      ['STRAIGHT', 'Straight', 'straight'],
      ['CURVE', 'Curved', 'curved'],
      ['WRAP', 'Elbow', 'elbow'],
    ]) {
      await clearArrows(page)
      await clearCables(page, { x: 1180, y: 880 })
      await armArrow(page, 1)
      await drawArrow(page, { x: 340, y: 140 }, { x: 760, y: 320 })
      check(`${id}-ARROW`, `cycling to ${preset} draws a ${expected} arrow`,
        await arrowShape(page), expected)
      await deselect(page, { x: 1180, y: 880 })

      await wirePorts(page, await out(), await into())
      check(`${id}-EDGE`, `and the next data edge is ${expected} too`,
        await cableShape(page), expected)
      await deselect(page, { x: 1180, y: 880 })
      await shot(page, `arrow-sync-${expected}.png`)
    }

    // --------------------------------------- A, then a port, is a data edge ---
    await clearArrows(page)
    await clearCables(page, { x: 1180, y: 880 })
    await armArrow(page, 0)
    await wirePorts(page, await out(), await into())
    check('PORT-EDGE-1', 'with A armed, a drag from a port draws a data edge',
      await cables(page), 1)
    check('PORT-EDGE-2', 'and no arrow is left behind by the press that started it',
      await arrowCount(page), 0)
    check('PORT-EDGE-3', 'the edge takes the shape A is holding',
      await cableShape(page), 'elbow')
    await deselect(page, { x: 1180, y: 880 })
    await shot(page, 'arrow-sync-port-edge.png')

    // The same tool on empty canvas still draws tldraw's arrow.
    await armArrow(page, 0)
    await drawArrow(page, { x: 340, y: 140 }, { x: 760, y: 320 })
    check('PORT-EDGE-4', 'while the same tool on empty canvas still draws an arrow',
      await arrowCount(page), 1)
    check('PORT-EDGE-5', 'of the same shape as the edge', await arrowShape(page), 'elbow')
    await deselect(page, { x: 1180, y: 880 })

    check('CLEAN', 'the whole journey raised no local console errors',
      localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'arrow-sync.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
