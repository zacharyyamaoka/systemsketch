#!/usr/bin/env node
/**
 * Real-browser proof that arrows and semantic data edges share one selected
 * connector interaction: terminals remain visible, interior controls follow
 * the padded route rectangle, and elbow rails can be grown repeatedly.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
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
    const r = element.getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  const r = JSON.parse(value)
  return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
}

const controlPoints = (page) => evaluate(page,
  `JSON.stringify((window.__systemsketch?.overlayIds() ?? [])
    .filter((id) => id.startsWith('handle:'))
    .map((id) => id.split(':').slice(3).join(':')))`
).then((value) => JSON.parse(value ?? '[]'))

async function pointOnShapePath(page, type, fraction) {
  const value = await evaluate(page, `(() => {
    const paths = [...document.querySelectorAll('[data-shape-type=${JSON.stringify(type)}] path')]
      .filter((candidate) => typeof candidate.getTotalLength === 'function')
    const path = paths.sort((a, b) => b.getTotalLength() - a.getTotalLength())[0]
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * ${fraction})
    const screen = point.matrixTransform(path.getScreenCTM())
    return JSON.stringify({ x: screen.x, y: screen.y })
  })()`)
  if (!value) throw new Error(`No ${type} path to sample`)
  return JSON.parse(value)
}

async function pointOnShapeGeometry(page, type) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const shape = editor?.getCurrentPageShapes().filter((item) => item.type === ${JSON.stringify(type)}).at(-1)
    if (!editor || !shape) return null
    const vertices = editor.getShapeGeometry(shape).vertices ?? []
    let best = null
    for (let index = 0; index < vertices.length - 1; index += 1) {
      const a = vertices[index]
      const b = vertices[index + 1]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (!best || length > best.length) best = { a, b, length }
    }
    if (!best) return null
    const local = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 }
    const pagePoint = editor.getShapePageTransform(shape.id).applyToPoint(local)
    return JSON.stringify(editor.pageToScreen(pagePoint))
  })()`)
  if (!value) throw new Error(`No ${type} geometry to sample`)
  return JSON.parse(value)
}

async function drawBlock(page, from, to, title) {
  await key(page, 'b', 'KeyB')
  await drag(page, from, to)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(240)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  const button = await box(page, `[aria-label="${label}"]`)
  await clickAt(page, button.cx, button.cy)
  await delay(240)
}

async function connectPorts(page) {
  const out = await box(page, '.Port[data-block-port-side="output"]')
  const into = await box(page, '.Port[data-block-port-side="input"]')
  await drag(page, { x: out.cx, y: out.cy }, { x: into.cx, y: into.cy })
  await delay(320)
}

async function selectedHandlePoint(page, id) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const shape = editor?.getOnlySelectedShape()
    const handle = shape && editor.getShapeHandles(shape)?.find((item) => item.id === ${JSON.stringify(id)})
    if (!editor || !shape || !handle) return null
    const pagePoint = editor.getShapePageTransform(shape.id).applyToPoint(handle)
    return JSON.stringify(editor.pageToScreen(pagePoint))
  })()`)
  if (!value) throw new Error(`Missing selected handle ${id}`)
  return JSON.parse(value)
}

async function selectedShapeBoundsCenter(page) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const shape = editor?.getOnlySelectedShape()
    const bounds = shape && editor.getShapePageBounds(shape.id)
    if (!editor || !bounds) return null
    return JSON.stringify(editor.pageToScreen(bounds.center))
  })()`)
  if (!value) throw new Error('Missing selected connector bounds')
  return JSON.parse(value)
}

const arrowRouteState = (page) => evaluate(page, `(() => {
  const editor = window.__systemsketch?.editor
  const arrow = editor?.getOnlySelectedShape()
  const stored = arrow?.meta?.systemSketchArrowRoute
  const handles = arrow ? editor.getShapeHandles(arrow) ?? [] : []
  const body = document.querySelector('.systemsketch-authored-arrow__body path')
  const stockBody = document.querySelector(
    '.systemsketch-authored-arrow__stock > .tl-svg-container > g > g:first-of-type'
  )
  return JSON.stringify({
    selectedType: arrow?.type ?? null,
    corners: stored?.route?.corners?.length ?? 0,
    routeHandles: handles.filter((handle) => handle.id.startsWith('systemsketch-route:')).length,
    pathCommands: (body?.getAttribute('d')?.match(/L/g) ?? []).length,
    stockBodyVisibility: stockBody ? getComputedStyle(stockBody).visibility : null,
  })
})()`).then((value) => JSON.parse(value))

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-connector-controls', build: 'connector-controls' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, `window.__systemsketch?.editor`, 'development editor seam')
    await delay(700)

    // The selection click ends inside the route rectangle, so controls appear
    // immediately without a follow-up move.
    await drawBlock(page, { x: 180, y: 570 }, { x: 450, y: 740 }, 'source')
    await addPort(page, 'outputs')
    await clickAt(page, 1240, 820)
    await drawBlock(page, { x: 830, y: 260 }, { x: 1100, y: 430 }, 'sink')
    await addPort(page, 'inputs')
    await clickAt(page, 1240, 820)
    await connectPorts(page)

    const edgePoint = await pointOnShapePath(page, 'connection', 0.35)
    await clickAt(page, edgePoint.x, edgePoint.y)
    await delay(260)
    const edgeImmediate = await controlPoints(page)
    check('EDGE-SELECT', 'data-edge interior controls exist on the selection click itself',
      edgeImmediate.some((id) => /^(grow|segment|route):/.test(id)), true)

    await mouse(page, 'mouseMoved', 1240, 160)
    await delay(260)
    const edgeFar = await controlPoints(page)
    check('EDGE-TERMINALS', 'outside the rectangle, only data-edge terminals remain',
      edgeFar.sort(), ['end', 'start'])
    await shot(page, 'connector-data-edge-terminals-only.png')

    const edgeInside = await selectedShapeBoundsCenter(page)
    await mouse(page, 'mouseMoved', edgeInside.x, edgeInside.y)
    await delay(260)
    const edgeReturned = await controlPoints(page)
    check('EDGE-BOUNDS', 'inside the route rectangle, data-edge interior controls return',
      edgeReturned.some((id) => /^(grow|segment|route):/.test(id)), true)
    await shot(page, 'connector-data-edge-controls.png')

    // Stock arrow semantics remain stock; only elbow segment authoring is added.
    await clickAt(page, 1240, 820)
    await shortcut(page, 'a', 'KeyA')
    await drag(page, { x: 260, y: 150 }, { x: 760, y: 220 })
    await shortcut(page, 'v', 'KeyV')
    await clickAt(page, 1240, 820)
    const arrowPoint = await pointOnShapeGeometry(page, 'arrow')
    await clickAt(page, arrowPoint.x, arrowPoint.y)
    await waitFor(page,
      `window.__systemsketch.editor.getOnlySelectedShape()?.type === 'arrow'`,
      'selected elbow arrow')

    const arrowImmediate = await controlPoints(page)
    const initialRouteHandles = arrowImmediate.filter((id) => id.startsWith('systemsketch-route:'))
    check('ARROW-SELECT', 'the arrow exposes interior controls on its selection event',
      initialRouteHandles.length >= 2, true)

    await mouse(page, 'mouseMoved', 1240, 760)
    await delay(260)
    check('ARROW-TERMINALS', 'outside the rectangle, only arrow terminals remain',
      (await controlPoints(page)).sort(), ['end', 'start'])
    await shot(page, 'connector-arrow-terminals-only.png')

    const arrowInside = await selectedShapeBoundsCenter(page)
    await mouse(page, 'mouseMoved', arrowInside.x, arrowInside.y)
    await delay(260)
    check('ARROW-BOUNDS', 'inside the route rectangle, arrow interior controls return',
      (await controlPoints(page)).filter((id) => id.startsWith('systemsketch-route:')).length
        >= initialRouteHandles.length,
      true)

    // Repeating the same Excalidraw-style end-segment gesture grows another
    // orthogonal rail on every drag.
    const first = await selectedHandlePoint(page, 'systemsketch-route:0')
    await drag(page, first, { x: first.x, y: first.y + 90 })
    const afterFirst = await arrowRouteState(page)
    check('ARROW-GROW-1', 'one segment drag authors a route with more controls',
      afterFirst.routeHandles > initialRouteHandles.length, true)

    const firstAgain = await selectedHandlePoint(page, 'systemsketch-route:0')
    await drag(page, firstAgain, { x: firstAgain.x + 85, y: firstAgain.y })
    const afterSecond = await arrowRouteState(page)
    check('ARROW-GROW-2', 'dragging the endpoint segment again adds another elbow rail',
      afterSecond.routeHandles > afterFirst.routeHandles, true)
    check('ARROW-BODY', 'the authored body replaces the stock one while stock heads remain owned by tldraw',
      [afterSecond.pathCommands >= 5, afterSecond.stockBodyVisibility], [true, 'hidden'])
    await shot(page, 'connector-arrow-multi-elbow.png')

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'connector-control-parity.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
