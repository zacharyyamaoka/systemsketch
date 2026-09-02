#!/usr/bin/env node
/**
 * Real-browser proof for the edge editor: three routings, control points that
 * only appear under Figma's rule, cables painted under Blocks, and the
 * connection inspector.
 *
 * Driven through the real product build with real pointer events; every
 * assertion reads the painted document.
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
  startApp,
  waitFor,
} from './browser_harness.mjs'

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

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
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

/**
 * A real point ON the cable, at a fraction of its length, in client pixels.
 *
 * The path element's bounding-box centre is not on the curve, so sampling the
 * path is the only way to press the cable where the user would.
 */
async function pointOnCable(page, t) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-type="connection"] path')
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * ${t})
    const matrix = path.getScreenCTM()
    const screen = point.matrixTransform(matrix)
    return JSON.stringify({ cx: screen.x, cy: screen.y })
  })()`)
  if (!value) throw new Error('No cable to sample')
  return JSON.parse(value)
}

const scope = (shapeId) => `[data-shape-id="${shapeId}"]`
const portDot = (shapeId, side, portId) =>
  `${scope(shapeId)} .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

const blockIds = (page) => evaluate(page, `(() => JSON.stringify(
  Array.from(document.querySelectorAll('[data-shape-type="block"]'))
    .map((node) => node.dataset.shapeId)))()`).then(JSON.parse)

const cables = (page) =>
  evaluate(page, `document.querySelectorAll('[data-shape-type="connection"]').length`)

/** The `d` attribute of the one cable on the board — its actual painted route. */
const cablePath = (page) => evaluate(page,
  `document.querySelector('[data-shape-type="connection"] path')?.getAttribute('d') ?? null`)

/**
 * How many shape handles the renderer is currently offering.
 *
 * tldraw v5 paints handles to a <canvas>, so this is the one claim in this file
 * with no DOM to read. The development seam reports the overlay list the
 * renderer is about to paint — one step from the pixels, not from the model.
 */
const handleIds = (page) => evaluate(page,
  `JSON.stringify((window.__systemsketch?.overlayIds() ?? []).filter((id) => id.startsWith('handle:')))`)
  .then((value) => JSON.parse(value ?? '[]'))

/**
 * Painted stacking order: a cable's fractional index must sort BELOW every
 * Block in the same parent, so a wire runs behind the cards it joins.
 */
const cableIsUnderBlocks = (page) => evaluate(page, `(() => {
  const seam = window.__systemsketch
  if (!seam) return null
  const indexOf = (selector) => Array.from(document.querySelectorAll(selector))
    .map((node) => seam.shapeIndex(node.dataset.shapeId))
    .filter(Boolean)
  const cables = indexOf('[data-shape-type="connection"]')
  const blocks = indexOf('[data-shape-type="block"]')
  if (cables.length === 0 || blocks.length === 0) return null
  return cables.every((cable) => blocks.every((block) => cable < block))
})()`)

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
  await delay(200)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  const selector = `[aria-label="${label}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, label, 8000)
  const button = await box(page, selector)
  await clickAt(page, button.cx, button.cy)
  await delay(320)
}

async function deselect(page) {
  await clickAt(page, 200, 830)
  await delay(220)
}

async function dragBetween(page, from, to, steps = 10) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  for (let step = 1; step <= steps; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((to.cx - from.cx) * step) / steps,
      from.cy + ((to.cy - from.cy) * step) / steps,
      { buttons: 1 })
    await delay(28)
  }
  await mouse(page, 'mouseReleased', to.cx, to.cy)
  await delay(340)
}

/**
 * Choose a routing through the real right-click menu.
 *
 * tldraw's checkbox menu items carry no test id, so the option is found by the
 * label the user reads — which is the right thing to assert against anyway.
 */
async function setRouting(page, at, routing) {
  const label = routing[0].toUpperCase() + routing.slice(1)
  await clickAt(page, at.cx, at.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.connection-routing-button"]')`,
    'routing submenu')
  const trigger = await box(page, '[data-testid="context-menu-sub.connection-routing-button"]')
  await mouse(page, 'mouseMoved', trigger.cx, trigger.cy)
  await delay(200)
  await clickAt(page, trigger.cx, trigger.cy)
  const optionSelector = `[data-testid="context-menu-sub.connection-routing-content"] .tlui-button__checkbox`
  await waitFor(page,
    `Array.from(document.querySelectorAll('${optionSelector}'))
      .some((node) => node.textContent.trim() === ${JSON.stringify(label)})`,
    `${routing} option`)
  const rect = JSON.parse(await evaluate(page, `(() => {
    const option = Array.from(document.querySelectorAll('${optionSelector}'))
      .find((node) => node.textContent.trim() === ${JSON.stringify(label)})
    const r = option.getBoundingClientRect()
    return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
  })()`))
  await clickAt(page, rect.cx, rect.cy)
  await delay(450)
  await key(page, 'Escape', 'Escape')
  await delay(220)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-edge-editor', build: 'edge-editor' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    await drawBlock(page, { x: 220, y: 240 }, { x: 520, y: 420 }, 'source')
    const [source] = await blockIds(page)
    await addPort(page, 'outputs')
    await deselect(page)

    await drawBlock(page, { x: 880, y: 520 }, { x: 1180, y: 700 }, 'sink')
    const sink = (await blockIds(page)).find((id) => id !== source)
    await addPort(page, 'inputs')
    await deselect(page)

    const out = await box(page, portDot(source, 'output', 'out_1'))
    const into = await box(page, portDot(sink, 'input', 'in_1'))
    await dragBetween(page, out, into)
    check('WIRED', 'a cable joins the two Blocks', await cables(page), 1)
    check('ZORDER', 'the cable paints under the Blocks', await cableIsUnderBlocks(page), true)
    await deselect(page)
    await shot(page, 'edge-editor-curved.png')

    const curvedPath = await cablePath(page)
    check('ROUTE-CURVED', 'the default route is a cubic', /^M .* C /.test(curvedPath ?? ''), true)

    // ---------------------------------------------------- Figma's rule ---
    const onCable = await pointOnCable(page, 0.25)
    const mid = await pointOnCable(page, 0.5)
    await clickAt(page, onCable.cx, onCable.cy)
    await delay(300)
    // Selected, but the pointer parked far away.
    await mouse(page, 'mouseMoved', 260, 800)
    await delay(320)
    const farHandles = await handleIds(page)
    await mouse(page, 'mouseMoved', onCable.cx, onCable.cy)
    await delay(320)
    const nearHandles = await handleIds(page)
    await shot(page, 'edge-editor-controlpoints.png')
    check('FIGMA-1', 'a selected cable with the pointer far away offers only its two terminals',
      farHandles.length, 2)
    check('FIGMA-2', 'and offers its control point as the pointer approaches',
      nearHandles.length, 3)

    // ------------------------------------------------- drag it to bend ---
    const before = await cablePath(page)
    await dragBetween(page, { cx: mid.cx, cy: mid.cy }, { cx: mid.cx, cy: mid.cy - 140 })
    const bent = await cablePath(page)
    check('BEND-1', 'dragging the control point changes the route', bent !== before, true)
    check('BEND-2', 'and the bent curve is a quadratic through the pointer',
      /^M .* Q /.test(bent ?? ''), true)
    await shot(page, 'edge-editor-bent.png')

    // ------------------------------------------------------- routings ---
    await setRouting(page, await pointOnCable(page, 0.25), 'straight')
    const straight = await cablePath(page)
    check('ROUTE-STRAIGHT', 'straight routing draws one line segment',
      /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/.test(straight ?? ''), true)
    check('ROUTE-RESET', 'switching routing forgets the previous bend',
      /Q/.test(straight ?? ''), false)
    await shot(page, 'edge-editor-straight.png')

    await setRouting(page, await pointOnCable(page, 0.25), 'elbow')
    const elbow = await cablePath(page)
    const corners = (elbow ?? '').split(/L/).length - 1
    check('ROUTE-ELBOW', 'elbow routing draws an orthogonal polyline', corners >= 2, true)
    check('ROUTE-ELBOW-PERPENDICULAR',
      'and its first segment leaves the port horizontally', (() => {
        const points = [...(elbow ?? '').matchAll(/([-\d.]+) ([-\d.]+)/g)]
          .map(([, x, y]) => ({ x: Number(x), y: Number(y) }))
        if (points.length < 2) return false
        return Math.abs(points[0].y - points[1].y) < 0.5
      })(), true)
    await deselect(page)
    await shot(page, 'edge-editor-elbow.png')

    // ---------------------------------------------------- the inspector ---
    // A selected cable is the dock's other subject; before this it had no home
    // in the panel at all and routing lived only in a right-click gesture. Back
    // to curved first, because the inspector is read for which routing it shows.
    await setRouting(page, await pointOnCable(page, 0.25), 'curved')
    await deselect(page)
    await clickAt(page, (await pointOnCable(page, 0.3)).cx, (await pointOnCable(page, 0.3)).cy)
    await delay(400)
    check('INSPECT-1', 'selecting a cable opens the connection inspector',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="connection-inspector"]'))`),
      true)
    check('INSPECT-2', 'and it names both endpoints',
      await evaluate(page,
        `/^\\S+ → \\S+$/.test(document.querySelector('[data-testid="connection-endpoints"]')?.textContent?.trim() ?? '')`),
      true)
    check('INSPECT-3', 'with the live routing pressed',
      await evaluate(page,
        `document.querySelector('[data-testid="connection-routing-curved"]')?.getAttribute('aria-pressed')`),
      'true')
    await shot(page, 'edge-editor-inspector.png')

    const elbowButton = await box(page, '[data-testid="connection-routing-elbow"]')
    await clickAt(page, elbowButton.cx, elbowButton.cy)
    await delay(450)
    check('INSPECT-4', 'the inspector switches routing like the menu does',
      await evaluate(page,
        `document.querySelector('[data-testid="connection-routing-elbow"]')?.getAttribute('aria-pressed')`),
      'true')
    check('INSPECT-5', 'and the cable repaints as an orthogonal polyline',
      /L/.test((await cablePath(page)) ?? ''), true)
    await deselect(page)

    check('CLEAN', 'the whole journey raised no local console errors',
      localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'edge-editor.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
