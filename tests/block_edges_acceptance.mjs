#!/usr/bin/env node
/**
 * Real-browser acceptance for SystemSketch data edges.
 *
 * Born on 2026-09-01 as `boundary_port_edge_diagnosis.mjs`, the reproduction for
 * the two bugs reported in `FR - Block, Ports & Edges Primitive` § Ports → Bugs
 * → "Connecting from ports in expanded view to port inside". It always asserted
 * the DESIRED column, so the same cases became the regression suite the moment
 * the rebuild landed.
 *
 * Everything below is driven through the real product build with real pointer
 * events, and every assertion reads the painted document — never an editor API
 * call standing in for a gesture.
 *
 *   BOUNDARY   the four wirings at an Expanded Block's edge. Two are the only
 *              ones a hierarchy needs; two must be refused. Before the rebuild
 *              all four were wrong, and inverted rather than merely strict.
 *   AFFORDANCE a drag lights the ports it could legally land on.
 *   PICKER     a cable that lands on empty space offers a Block for its far end
 *              and binds it; declining removes the cable.
 *   EXITS      every way of leaving a port gesture cleans up after itself.
 *   REPLACE    a second cable onto an occupied input replaces the first.
 *   DURABILITY an inner-face cable survives a view switch and a reload.
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

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
  return ok
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
 * A real point ON a cable, at a fraction of its length, in client pixels.
 *
 * The path element's bounding-box centre is not on the curve — and worse, the
 * curve's own midpoint belongs to the insert `+`, a different affordance with a
 * different job. Sampling the path is the only way to press the cable where a
 * user would.
 */
async function pointOnCable(page, t) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-type="connection"] path')
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * ${t})
    const screen = point.matrixTransform(path.getScreenCTM())
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

const pickerOpen = (page) =>
  evaluate(page, `Boolean(document.querySelector('[data-testid="block-picker"]'))`)

/** The classes each painted port dot is currently wearing. */
const portClasses = (page) => evaluate(page, `(() => JSON.stringify(
  Array.from(document.querySelectorAll('.systemsketch-block-canvas .Port')).map((node) => ({
    shape: node.closest('[data-shape-id]')?.dataset.shapeId,
    port: node.dataset.blockPortId,
    eligible: node.classList.contains('Port_eligible'),
    hinting: node.classList.contains('Port_hinting'),
    connected: node.classList.contains('Port_connected'),
  }))))()`).then(JSON.parse)

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

async function setView(page, view) {
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

async function deselect(page) {
  await clickAt(page, 200, 830)
  await delay(200)
}

/** Press a port, drag to a point, release. Returns what the release produced. */
async function dragFrom(page, from, to, { shotName, steps = 10 } = {}) {
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
    // Sample once the pointer has actually arrived, so the hinted port is the
    // one under it rather than the one it was still approaching.
    if (step === steps) midClasses = await portClasses(page)
  }
  if (shotName) await shot(page, shotName)
  await mouse(page, 'mouseReleased', target.cx, target.cy)
  await delay(340)
  return { midClasses, offered: await pickerOpen(page), count: await cables(page) }
}

/** Remove every cable on the board, so each case starts from a known state. */
async function clearCables(page) {
  if (await pickerOpen(page)) {
    await key(page, 'Escape', 'Escape')
    await delay(280)
  }
  for (let guard = 0; guard < 6 && (await cables(page)) > 0; guard += 1) {
    await deselect(page)
    const at = await pointOnCable(page, 0.25)
    await clickAt(page, at.cx, at.cy)
    await key(page, 'Delete', 'Delete')
    await delay(260)
  }
  await deselect(page)
  return cables(page)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-edges', build: 'edge-acceptance' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ------------------------------------------------- the reported scene ---
    await drawBlock(page, { x: 320, y: 200 }, { x: 1060, y: 700 }, 'run')
    const [run] = await blockIds(page)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await setView(page, 'expanded')
    await deselect(page)

    await drawBlock(page, { x: 620, y: 330 }, { x: 940, y: 520 }, 'decode')
    const decode = (await blockIds(page)).find((id) => id !== run)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await setView(page, 'port')
    await deselect(page)

    const dots = {
      'run.in': await box(page, portDot(run, 'input', 'in_1')),
      'run.out': await box(page, portDot(run, 'output', 'out_1')),
      'decode.in': await box(page, portDot(decode, 'input', 'in_1')),
      'decode.out': await box(page, portDot(decode, 'output', 'out_1')),
    }
    await shot(page, 'edge-accept-scene.png')

    // ---------------------------------------------------------- boundary ---
    const MATRIX = [
      ['BOUNDARY-1a', 'run.in', 'decode.in', 1,
        'boundary INPUT feeds the inner Block — the reported gesture'],
      ['BOUNDARY-1b', 'decode.out', 'run.out', 1,
        'inner Block returns through the boundary OUTPUT'],
      ['BOUNDARY-1c', 'decode.out', 'run.in', 0,
        'inner OUTPUT into the boundary INPUT — data leaving through an inlet'],
      ['BOUNDARY-1d', 'run.out', 'decode.in', 0,
        'boundary OUTPUT feeding the inside — an outlet acting as a source'],
    ]
    for (const [id, from, to, desired, label] of MATRIX) {
      const result = await dragFrom(page, dots[from], dots[to], {
        shotName: `edge-accept-${id.toLowerCase()}-drag.png`,
      })
      await shot(page, `edge-accept-${id.toLowerCase()}-drop.png`)
      check(id, `${from} → ${to}: ${label}`, result.count, desired)
      check(`${id}-QUIET`, `${from} → ${to} never offers a Block on top of a Block`,
        result.offered, false)
      await clearCables(page)
    }

    // -------------------------------------------------------- affordance ---
    const affordance = await dragFrom(page, dots['run.in'], dots['decode.in'], {
      shotName: 'edge-accept-affordance.png',
    })
    const lit = (affordance.midClasses ?? [])
      .filter((entry) => entry.eligible || entry.hinting)
      .map((entry) => `${entry.shape === run ? 'run' : 'decode'}.${entry.port}`)
      .sort()
    check('AFFORD-1', 'a drag out of the boundary lights only the legal targets',
      lit, ['decode.in_1', 'run.out_1'])
    check('AFFORD-2', 'the port under the pointer is the hinted one',
      (affordance.midClasses ?? []).filter((entry) => entry.hinting).map((entry) => entry.port),
      ['in_1'])
    await clearCables(page)
    check('AFFORD-3', 'the highlight is cleared once the gesture ends',
      (await portClasses(page)).some((entry) => entry.eligible || entry.hinting), false)

    // ------------------------------------------------------------ picker ---
    const toEmpty = await dragFrom(page, dots['decode.out'], { x: 1180, y: 620 })
    check('PICKER-1', 'a cable into empty space offers a Block', toEmpty.offered, true)
    await shot(page, 'edge-accept-picker-open.png')
    const beforePick = (await blockIds(page)).length
    const item = await box(page, '[data-testid="block-picker-call"]')
    await clickAt(page, item.cx, item.cy)
    await delay(600)
    check('PICKER-2', 'picking creates exactly one Block',
      (await blockIds(page)).length - beforePick, 1)
    check('PICKER-3', 'and the cable it answered is bound', await cables(page), 1)
    check('PICKER-4', 'the offer closes on a pick', await pickerOpen(page), false)
    await shot(page, 'edge-accept-picker-picked.png')
    const wired = (await portClasses(page)).filter((entry) => entry.connected)
      .map((entry) => entry.port).sort()
    check('PICKER-5', 'the new Block is wired through its first matching port',
      wired, ['in_1', 'out_1'])

    await clearCables(page)
    await deselect(page)
    const spawned = (await blockIds(page)).find((id) => id !== run && id !== decode)
    if (spawned) {
      const spawnedBox = await box(page, `${scope(spawned)} .systemsketch-block-canvas`)
      await clickAt(page, spawnedBox.cx, spawnedBox.y + 8)
      await key(page, 'Delete', 'Delete')
      await delay(280)
    }
    await deselect(page)

    const declined = await dragFrom(page, dots['decode.out'], { x: 1180, y: 620 })
    check('PICKER-6', 'declining is offered', declined.offered, true)
    await key(page, 'Escape', 'Escape')
    await delay(380)
    check('PICKER-7', 'Escape removes the cable the offer was for', await cables(page), 0)
    check('PICKER-8', 'and closes the offer', await pickerOpen(page), false)

    await clickAt(page, dots['decode.out'].cx, dots['decode.out'].cy)
    await delay(440)
    check('PICKER-9', 'tapping a port makes the same offer', await pickerOpen(page), true)
    await shot(page, 'edge-accept-picker-tap.png')
    await key(page, 'Escape', 'Escape')
    await delay(380)
    check('PICKER-10', 'declining a tap leaves no cable', await cables(page), 0)

    // ------------------------------------------------------------- exits ---
    for (const [id, label, leave] of [
      ['EXIT-A', 'pressing A (arrow tool) mid-offer', async () => {
        await shortcut(page, 'a', 'KeyA')
        await delay(420)
        await shortcut(page, 'v', 'KeyV')
      }],
      ['EXIT-TOOLBAR', 'clicking another toolbar tool mid-offer', async () => {
        const tool = await box(page,
          '[data-testid="tools.arrow"], [data-testid="tools.arrow-straight"]')
        await clickAt(page, tool.cx, tool.cy)
        await delay(420)
        await shortcut(page, 'v', 'KeyV')
      }],
      ['EXIT-ESCAPE', 'pressing Escape mid-offer', async () => {
        await key(page, 'Escape', 'Escape')
        await delay(320)
      }],
      ['EXIT-CANVAS', 'clicking empty canvas mid-offer', async () => {
        await clickAt(page, 260, 800)
        await delay(320)
      }],
    ]) {
      await deselect(page)
      await clickAt(page, dots['decode.out'].cx, dots['decode.out'].cy)
      await delay(420)
      await leave()
      await delay(420)
      check(id, `${label} leaves no cable behind`,
        { cables: await cables(page), picker: await pickerOpen(page) },
        { cables: 0, picker: false })
      await clearCables(page)
    }

    // ----------------------------------------------------------- replace ---
    await dragFrom(page, dots['run.in'], dots['decode.in'])
    check('REPLACE-1', 'the boundary cable landed', await cables(page), 1)
    await dragFrom(page, dots['run.out'], dots['decode.in'])
    check('REPLACE-2', 'a refused second cable does not stack on the occupied input',
      await cables(page), 1)
    await clearCables(page)

    // -------------------------------------------------------- durability ---
    await dragFrom(page, dots['run.in'], dots['decode.in'])
    check('DURABLE-1', 'a boundary cable exists', await cables(page), 1)
    const runBox = await box(page, `${scope(run)} .systemsketch-block-canvas`)
    await clickAt(page, runBox.x + 8, runBox.y + 8)
    await delay(280)
    await setView(page, 'port')
    await delay(420)
    check('DURABLE-2', 'it survives the boundary leaving Expanded', await cables(page), 1)
    await setView(page, 'expanded')
    await delay(420)
    check('DURABLE-3', 'and coming back', await cables(page), 1)
    await deselect(page)
    await shot(page, 'edge-accept-durable.png')

    await page.send('Page.reload')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'reloaded canvas')
    await delay(1200)
    check('DURABLE-4', 'and a reload', await cables(page), 1)

    check('CLEAN', 'the whole journey raised no local console errors',
      localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'edge-acceptance.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
