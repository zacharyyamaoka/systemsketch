#!/usr/bin/env node
/**
 * Real-browser proof for where a cable's control points appear.
 *
 * The rule is Figma's, and the user picked it explicitly: a rectangle that fits
 * the arrow's own outer extents, padded generously, recomputed as the arrow
 * bends. Come inside it and the control points appear; leave and they go.
 *
 * The case that forces a rectangle rather than a corridor is the elbow. A
 * U-shaped route encloses a large empty area, so the pointer can be squarely
 * inside the arrow's footprint — reading as "on" the arrow to anyone looking at
 * it — while being hundreds of pixels from the nearest stroke. Every assertion
 * below is driven with real pointer events and read from the renderer's own
 * overlay list, because tldraw v5 paints handles to a <canvas> with no DOM.
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
    const r = element.getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  const r = JSON.parse(value)
  return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
}

/**
 * Which control points the renderer is offering.
 *
 * tldraw v5 paints handles to a <canvas>, so this is read from the overlay list
 * through the dev seam — one step from the pixels, not from the model.
 */
const controlPoints = (page) => evaluate(page,
  `JSON.stringify((window.__systemsketch?.overlayIds() ?? [])
    .filter((id) => id.startsWith('handle:'))
    .map((id) => id.split(':').slice(3).join(':')))`).then((v) => JSON.parse(v ?? '[]'))

/** The reveal rectangle the hit test is actually using, in client pixels. */
const revealRect = (page) => evaluate(page, `(() => {
  const element = document.querySelector('.systemsketch-hit-area[data-kind="reveal"]')
  if (!element) return null
  const r = element.getBoundingClientRect()
  return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
})()`).then((v) => (v ? JSON.parse(v) : null))

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

async function drawBlock(page, from, to, title) {
  await key(page, 'b', 'KeyB')
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 6; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(250)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  await waitFor(page, `document.querySelector('[aria-label="${label}"]')`, label, 8000)
  const button = await box(page, `[aria-label="${label}"]`)
  await clickAt(page, button.cx, button.cy)
  await delay(280)
}

const deselect = async (page) => { await clickAt(page, 1250, 840); await delay(260) }

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
  const optionSelector = '[data-testid="context-menu-sub.connection-routing-content"] .tlui-button__checkbox'
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
  await delay(420)
  await key(page, 'Escape', 'Escape')
  await delay(220)
}

/**
 * The contextual menu overlaps the cable it belongs to, so it is the case that
 * proves the rule: a pointer over chrome is not a pointer over the board.
 * It only exists in the product composition, which is why this reloads.
 */
async function checkChromeRule(app) {
  const { page, port } = app
  await openApp(page, port, '?hitareas=1')
  await waitFor(page, `document.querySelector('.systemsketch-app .tl-container')`,
    'product canvas', 30000)
  await delay(1400)

  await drawBlock(page, { x: 260, y: 500 }, { x: 560, y: 680 }, 'from')
  await addPort(page, 'outputs')
  await clickAt(page, 1250, 840)
  await delay(260)
  await drawBlock(page, { x: 820, y: 220 }, { x: 1080, y: 400 }, 'to')
  await addPort(page, 'inputs')
  await clickAt(page, 1250, 840)
  await delay(260)

  const out = await box(page, '.systemsketch-app .Port[data-block-port-side="output"]')
  const into = await box(page, '.systemsketch-app .Port[data-block-port-side="input"]')
  await mouse(page, 'mouseMoved', out.cx, out.cy)
  await mouse(page, 'mousePressed', out.cx, out.cy, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      out.cx + ((into.cx - out.cx) * step) / 10,
      out.cy + ((into.cy - out.cy) * step) / 10,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', into.cx, into.cy)
  await delay(420)
  await clickAt(page, 1250, 840)
  await delay(260)

  const at = await pointOnCable(page, 0.25)
  await clickAt(page, at.cx, at.cy)
  await delay(500)
  const mid = await pointOnCable(page, 0.5)
  await mouse(page, 'mouseMoved', mid.cx + 60, mid.cy)
  await delay(340)
  check('CHROME-BASELINE', 'inside the region, the control point is offered',
    (await controlPoints(page)).includes('bend'), true)

  const menu = await box(page, '[data-testid="systemsketch-selection-menu"]')
  const rect = await revealRect(page)
  const overlaps = rect !== null
    && menu.x < rect.x + rect.w && menu.x + menu.w > rect.x
    && menu.y < rect.y + rect.h && menu.y + menu.h > rect.y
  check('CHROME-OVERLAPS', 'the menu really does sit over the reveal region', overlaps, true)

  await mouse(page, 'mouseMoved', menu.cx, menu.cy)
  await delay(400)
  check('CHROME', 'a pointer over the contextual menu is not a pointer over the board',
    (await controlPoints(page)).sort(), ['end', 'start'])
  await shot(page, 'reveal-over-menu.png')
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-reveal', build: 'edge-reveal' })
  const { page, port } = app

  try {
    // The hit-area overlay is on, so every region asserted below is also drawn.
    await openApp(page, port, '?preset=block-dev&hitareas=1')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(800)

    // A source low-left and a sink high-right, so an elbow has to wrap around.
    await drawBlock(page, { x: 200, y: 560 }, { x: 500, y: 740 }, 'source')
    await addPort(page, 'outputs')
    await deselect(page)
    await drawBlock(page, { x: 780, y: 180 }, { x: 1080, y: 360 }, 'sink')
    await addPort(page, 'inputs')
    await deselect(page)

    const out = await box(page, '.Port[data-block-port-side="output"]')
    const into = await box(page, '.Port[data-block-port-side="input"]')
    await mouse(page, 'mouseMoved', out.cx, out.cy)
    await mouse(page, 'mousePressed', out.cx, out.cy, { buttons: 1 })
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved',
        out.cx + ((into.cx - out.cx) * step) / 10,
        out.cy + ((into.cy - out.cy) * step) / 10,
        { buttons: 1 })
      await delay(24)
    }
    await mouse(page, 'mouseReleased', into.cx, into.cy)
    await delay(420)
    await deselect(page)

    // ------------------------------------------------------------ curved ---
    const onCable = await pointOnCable(page, 0.25)
    await clickAt(page, onCable.cx, onCable.cy)
    await delay(420)

    const rect = await revealRect(page)
    check('AREA-DRAWN', 'the reveal region is a rectangle around the cable', rect !== null, true)

    // Well outside the box.
    await mouse(page, 'mouseMoved', rect.x - 120, rect.y - 120)
    await delay(320)
    check('CURVED-OUTSIDE', 'outside the region, only the two terminals are offered',
      (await controlPoints(page)).sort(), ['end', 'start'])

    // Inside the box, but deliberately not on the stroke.
    const mid = await pointOnCable(page, 0.5)
    await mouse(page, 'mouseMoved', mid.cx + 90, mid.cy)
    await delay(320)
    check('CURVED-INSIDE', 'inside it — 90px off the stroke — the control point appears',
      (await controlPoints(page)).includes('bend'), true)
    await shot(page, 'reveal-curved.png')

    // Just inside, and just outside, the same edge of the box.
    await mouse(page, 'mouseMoved', rect.x + rect.w - 6, rect.y + rect.h / 2)
    await delay(300)
    const justInside = (await controlPoints(page)).length
    await mouse(page, 'mouseMoved', rect.x + rect.w + 14, rect.y + rect.h / 2)
    await delay(300)
    const justOutside = (await controlPoints(page)).length
    check('BOUNDARY', 'the region has an edge, and it is where the rectangle says',
      { justInside, justOutside }, { justInside: 3, justOutside: 2 })

    // -------------------------------------------------------------- elbow ---
    await setRouting(page, await pointOnCable(page, 0.25), 'elbow')
    const onElbow = await pointOnCable(page, 0.3)
    await clickAt(page, onElbow.cx, onElbow.cy)
    await delay(420)
    const elbowRect = await revealRect(page)
    check('ELBOW-AREA', 'the elbow gets its own, larger rectangle',
      elbowRect !== null && elbowRect.h > rect.h * 0.9, true)

    // The point that matters is not the box's centre — an elbow's own rail can
    // run straight through that — but the point INSIDE the box that is farthest
    // from every stroke. That is the pixel a distance-to-the-curve test gets
    // most wrong, and the whole reason the region is a rectangle.
    const worst = JSON.parse(await evaluate(page, `(() => {
      const path = document.querySelector('[data-shape-type="connection"] path')
      const matrix = path.getScreenCTM()
      const total = path.getTotalLength()
      const stroke = []
      for (let i = 0; i <= 300; i += 1) {
        stroke.push(path.getPointAtLength((total * i) / 300).matrixTransform(matrix))
      }
      let best = { x: 0, y: 0, d: -1 }
      for (let gx = 1; gx < 24; gx += 1) {
        for (let gy = 1; gy < 24; gy += 1) {
          const x = ${elbowRect.x} + (${elbowRect.w} * gx) / 24
          const y = ${elbowRect.y} + (${elbowRect.h} * gy) / 24
          let nearest = Infinity
          for (const p of stroke) nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y))
          if (nearest > best.d) best = { x, y, d: nearest }
        }
      }
      return JSON.stringify({ x: Math.round(best.x), y: Math.round(best.y), d: Math.round(best.d) })
    })()`))
    process.stdout.write(`  farthest point inside the elbow's box is ${worst.d}px from any stroke\n`)
    check('ELBOW-GAP', 'the box contains a point no corridor could ever reach',
      worst.d > 60, true)

    await mouse(page, 'mouseMoved', worst.x, worst.y)
    await delay(360)
    check('ELBOW-INSIDE', 'standing on that point reveals the segment handles',
      (await controlPoints(page)).length > 2, true)
    await shot(page, 'reveal-elbow.png')

    await mouse(page, 'mouseMoved', elbowRect.x - 120, elbowRect.y + elbowRect.h / 2)
    await delay(320)
    check('ELBOW-OUTSIDE', 'and leaving it puts them away',
      (await controlPoints(page)).sort(), ['end', 'start'])

    // ----------------------------------------------------------- straight ---
    await setRouting(page, await pointOnCable(page, 0.25), 'straight')
    const onStraight = await pointOnCable(page, 0.25)
    await clickAt(page, onStraight.cx, onStraight.cy)
    await delay(420)
    const straightMid = await pointOnCable(page, 0.5)
    await mouse(page, 'mouseMoved', straightMid.cx + 70, straightMid.cy - 70)
    await delay(340)
    check('STRAIGHT-INSIDE', 'a straight cable offers its control point the same way',
      (await controlPoints(page)).includes('bend'), true)
    await shot(page, 'reveal-straight.png')

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    // -------------------------------------------------------------- chrome ---
    // Reaching for the contextual menu must not light up the very control
    // points the menu offers an alternative to. The menu is product chrome, so
    // this one runs on the product board.
    await checkChromeRule(app)

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'edge-reveal.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
