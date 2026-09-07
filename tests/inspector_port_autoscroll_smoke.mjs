#!/usr/bin/env node
/**
 * Real-browser proof that an inspector port drag can reach a row that is off
 * screen when the drag begins.
 *
 * The inspector body scrolls, and its port list routinely runs past the fold —
 * with only four inputs the last grip already sits below a 960px viewport. The
 * hand-rolled pointer loop this replaced had no auto-scroll of any kind, so a
 * port could only ever be dragged to a row that happened to be painted at the
 * same time as its own grip. dnd-kit owns the gesture now purely to get that
 * back; the drop is still resolved by `listDropTarget` and committed by
 * `moveBlockPortToSection`, exactly as the canvas resolves the same drop.
 *
 * The claim is read from the running app: the panel's own `scrollTop` moves
 * while the pointer holds still near the top edge, and the port lands in the
 * row that was off screen when the press began.
 */
import assert from 'node:assert/strict'
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
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const shotPath = (name) => join(SHOTS, `inspector-port-autoscroll-${name}.png`)

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

const scope = (shapeId) => `[data-shape-id="${shapeId}"]`

async function blockIds(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="block"]'))
      .map((node) => node.dataset.shapeId))`))
}

/** Each input dot top to bottom, with the row it carries. */
async function inputRows(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return null
    return JSON.stringify(Array.from(
      wrapper.querySelectorAll('.Port[data-block-port-side="input"]'))
      .map((node) => ({ node, top: node.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top)
      .map(({ node }) => node.dataset.blockPortId + '@' + node.dataset.blockPortRow))
  })()`)
  if (!value) throw new Error(`No Block ${shapeId} on the page`)
  return JSON.parse(value)
}

/** The scrolling ancestor of the inputs list — the panel body. */
const SCROLLER = `(() => {
  let element = document.querySelector('[data-testid="inspector-ports-inputs"]')
  while (element) {
    element = element.parentElement
    if (element && /(auto|scroll)/.test(getComputedStyle(element).overflowY)) return element
  }
  return null
})()`

const scrollTop = (page) => evaluate(page, `String(${SCROLLER}?.scrollTop ?? -1)`).then(Number)

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

/** Enough body rows that the lane cannot fit in a laptop-height panel. */
const BODY_INPUTS = 14

const { pass, report } = makeChecklist()

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-autoscroll', build: 'inspector-autoscroll-smoke' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ------------------------------------------------------------- seed ---
    // Enough inputs that the lane cannot fit beside the header in one screen.
    await drawBlock(page, { x: 420, y: 180 }, { x: 780, y: 520 }, 'ingest')
    await waitFor(page,
      `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`,
      'Port Block')
    const [ingest] = await blockIds(page)
    await selectBlock(page, ingest)
    for (let index = 1; index <= BODY_INPUTS; index += 1) {
      await addPortFromGutter(page, 'inputs', `field_${index}`)
    }
    await selectBlock(page, ingest)
    await addPortFromGutter(page, 'header', 'clock')
    await selectBlock(page, ingest)

    const headerPort = `in_${BODY_INPUTS + 1}`
    const lastPort = `in_${BODY_INPUTS}`
    const bodyPorts = Array.from({ length: BODY_INPUTS }, (_, index) => `in_${index + 1}@1`)
    const seeded = await inputRows(page, ingest)
    assert.deepEqual(seeded, [`${headerPort}@0`, ...bodyPorts], `seeded lane, saw ${seeded}`)
    pass(`a Block with a heading port and ${BODY_INPUTS} body inputs is seeded`)

    // ------------------------------------------- put the target off screen ---
    // A laptop-height window, applied only now so the seeding above ran at the
    // ordinary size. The panel is a fixed column, so a short viewport is the
    // honest way to reach the state every long port list reaches on a real
    // screen: more rows than fit, with the heading line above the fold.
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 420, deviceScaleFactor: 1, mobile: false,
    })
    await delay(500)

    // Scroll the panel so the LAST grip is on screen and the heading divider
    // it must reach is not. This is the state the old pointer loop could not
    // escape: no gesture it owned could move the panel.
    await evaluate(page, `(() => {
      const LAST = ${JSON.stringify(lastPort)}
      const list = document.querySelector('[data-testid="inspector-ports-inputs"]')
      list.querySelector('[data-port-id="' + LAST + '"]')?.scrollIntoView({ block: 'end' })
    })()`)
    await delay(400)
    const startScroll = await scrollTop(page)

    const offScreen = await evaluate(page, `(() => {
      const divider = document.querySelector('[data-testid="inspector-divider-inputs-header-0"]')
      const grip = document.querySelector('[data-testid="inspector-port-grip-inputs-' + ${JSON.stringify(lastPort)} + '"]')
      if (!divider || !grip) return 'MISSING'
      const d = divider.getBoundingClientRect()
      const g = grip.getBoundingClientRect()
      return JSON.stringify({
        dividerTop: Math.round(d.top),
        gripTop: Math.round(g.top),
        viewport: window.innerHeight,
        dividerVisible: d.top >= 0 && d.bottom <= window.innerHeight,
        gripVisible: g.top >= 0 && g.bottom <= window.innerHeight,
      })
    })()`)
    const geometry = JSON.parse(offScreen)
    assert.equal(geometry.gripVisible, true, `the dragged grip is on screen, saw ${offScreen}`)
    assert.equal(geometry.dividerVisible, false,
      `the header line it must reach starts off screen, saw ${offScreen}`)
    await shot(page, 'before')
    pass('the heading row starts off screen while the port being dragged is visible')

    // ------------------------------------------------------- the gesture ---
    const grip = await box(page, `[data-testid="inspector-port-grip-inputs-${lastPort}"]`)
    const scrollerTop = await evaluate(page,
      `String(Math.round(${SCROLLER}.getBoundingClientRect().top))`).then(Number)
    await mouse(page, 'mouseMoved', grip.cx, grip.cy)
    await mouse(page, 'mousePressed', grip.cx, grip.cy, { buttons: 1 })
    // Ease into the auto-scroll band near the top edge of the panel and HOLD.
    // Nothing below depends on further pointer travel: if the panel moves from
    // here, it moved because dnd-kit scrolled it. The hold sits well inside the
    // band rather than hard against the edge — dnd-kit accelerates with
    // proximity, and at full speed the row we came for crosses the window
    // faster than a screenshot takes.
    const holdY = scrollerTop + 44
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved',
        grip.cx, grip.cy + ((holdY - grip.cy) * step) / 8, { buttons: 1 })
      await delay(30)
    }

    // Ride the scroll, watching for the heading line to arrive. Polling from
    // the first frame rather than sleeping: the panel keeps travelling while
    // the pointer stays in the band, so any fixed wait sails past the row.
    let dropY = null
    let scrollOnArrival = null
    let scrollSeen = null
    let bandHeldWhileScrolling = false
    for (let tick = 0; tick < 120 && dropY === null; tick += 1) {
      const seen = JSON.parse(await evaluate(page, `(() => {
        const divider = document.querySelector('[data-testid="inspector-divider-inputs-header-0"]')
        const scroller = ${SCROLLER}
        if (!divider || !scroller) return 'null'
        const rect = divider.getBoundingClientRect()
        return JSON.stringify({
          top: rect.top,
          scrollTop: scroller.scrollTop,
          band: Boolean(document.querySelector('[data-testid="inspector-drop-band"]')),
          visible: rect.top > 40 && rect.bottom < window.innerHeight - 8,
        })
      })()`))
      if (!seen) break
      if (scrollOnArrival === null) scrollOnArrival = seen.scrollTop
      scrollSeen = seen.scrollTop
      if (seen.band) bandHeldWhileScrolling = true
      if (seen.visible) dropY = seen.top - 6
      else await delay(45)
    }

    assert.ok(scrollSeen !== null && scrollSeen < scrollOnArrival - 20,
      `holding at the top edge scrolls the panel up, saw ${scrollOnArrival} then ${scrollSeen}`)
    pass('holding a dragged port at the panel edge auto-scrolls toward the off-screen row')

    assert.equal(bandHeldWhileScrolling, true,
      'the offered row stays tinted while the panel scrolls')
    pass('the drop preview keeps up with the scrolling list')

    assert.ok(dropY !== null, 'the heading line scrolled into view during the drag')
    await shot(page, 'during')

    await mouse(page, 'mouseMoved', grip.cx, dropY, { buttons: 1 })
    await delay(250)
    await mouse(page, 'mouseReleased', grip.cx, dropY)
    await delay(400)
    await shot(page, 'after')

    // Released above the header line, so it lands ahead of the port already
    // in the heading — the drop is placed to the row AND the position in it.
    const landed = await inputRows(page, ingest)
    assert.deepEqual(landed,
      [`${lastPort}@0`, `${headerPort}@0`, ...bodyPorts.slice(0, BODY_INPUTS - 1)],
      `the port joined the heading row on the canvas, saw ${landed}`)
    pass('the port lands in the row that was off screen when the drag began')

    // The canvas is the model's own face — if the inspector and the Block
    // disagreed, one of them would be reading a private copy of the lane.
    const mirrored = JSON.parse(await evaluate(page, `JSON.stringify(
      Array.from(document.querySelectorAll('[data-testid="inspector-ports-inputs"] > li'))
        .map((node) => node.dataset.portId ? node.dataset.portId + '@' + node.dataset.row : null)
        .filter(Boolean))`))
    assert.deepEqual(mirrored, landed,
      `the inspector list matches the canvas lane, saw ${mirrored}`)
    pass('canvas and inspector agree on the lane after the drop')

    // One gesture, one history step — the same contract a canvas drag keeps.
    await evaluate(page, `document.querySelector('.tl-container')?.focus()`)
    await delay(150)
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
    })
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2,
    })
    await delay(400)
    const undone = await inputRows(page, ingest)
    assert.deepEqual(undone, seeded, `one undo restores the lane, saw ${undone}`)
    pass('an auto-scrolled drag is still a single undo step')

    assert.deepEqual(await localConsoleErrors(page), [], 'no console errors')
    pass('the journey produced zero local console errors')

    assert.ok(startScroll > 0, 'the panel really was scrolled to begin with')
  } finally {
    await app.close()
  }

  report('browser')
  for (const name of ['before', 'during', 'after']) console.log(`  ${shotPath(name)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
