#!/usr/bin/env node
/**
 * Real-browser proof that the selection contextual menu follows the FigJam
 * placement spec measured in docs/figjam-contextual-menu-spec-2026-09-01.html.
 *
 * The bug this locks down: SystemSketch drove the menu through tldraw's
 * `TldrawUiContextualToolbar`, which clamps the toolbar down onto a selection
 * near the top of the viewport rather than flipping it below, and which only
 * hides during a gesture when the caller supplies an `isMousingDown` prop that
 * nothing supplied. The menu also mounted mid-marquee, when its own element did
 * not exist yet, which left its position reactor subscribed to nothing — so it
 * sat unplaced at the container's origin, on top of the document title.
 *
 * Everything below is measured from the running product composition. The
 * constants are not restated from the source; they are read out of the DOM and
 * compared against the shape they annotate.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
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

const RESULTS = join(ROOT, 'docs', 'selection-menu-results.json')
const SHOT = join(ROOT, 'docs', 'selection-menu-live-2026-09-01.png')
/** Frames for the implementation report, written by the run that asserts them. */
const FRAMES = {
  anchored: join(ROOT, 'docs', 'selection-menu-1-anchored-2026-09-01.png'),
  flipped: join(ROOT, 'docs', 'selection-menu-2-flipped-2026-09-01.png'),
  clamped: join(ROOT, 'docs', 'selection-menu-3-clamped-2026-09-01.png'),
  engulfed: join(ROOT, 'docs', 'selection-menu-4-tool-belt-2026-09-01.png'),
  dragging: join(ROOT, 'docs', 'selection-menu-5-dragging-2026-09-01.png'),
}

/** Straight out of the spec: 16px clear of the overlay, 20px viewport margin. */
const GAP = 16
const MARGIN = 20
/** How far tldraw paints its selection handles outside the shape's box. */
const OVERLAY_INSET = 5
/** Sub-pixel slack: the menu is placed on whole pixels. */
const EPSILON = 1.2

const EMPTY_CANVAS = { x: 200, y: 820 }

/**
 * One reading of everything the spec talks about, all in viewport space so the
 * numbers can be compared to each other directly.
 */
async function readMenu(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const container = document.querySelector('.tl-container')
    const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
    const bar = menu && menu.querySelector('.systemsketch-selection-menu__bar')
    const shape = document.querySelector('.tl-shape')
    const belt = document.querySelector('.tlui-layout__bottom__main')
    const origin = container.getBoundingClientRect()
    const box = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        x: +(rect.x - origin.x).toFixed(1), y: +(rect.y - origin.y).toFixed(1),
        w: +rect.width.toFixed(1), h: +rect.height.toFixed(1),
      }
    }
    const style = bar ? getComputedStyle(bar) : null
    let hitsMenu = false
    if (menu) {
      const rect = menu.getBoundingClientRect()
      const at = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      hitsMenu = Boolean(at && menu.contains(at))
    }
    return JSON.stringify({
      present: Boolean(menu),
      visible: menu ? menu.dataset.visible : null,
      side: menu ? (menu.dataset.side ?? null) : null,
      hitsMenu,
      menu: box(bar),
      shape: box(shape),
      viewport: { w: +origin.width.toFixed(1), h: +origin.height.toFixed(1) },
      beltTop: belt ? +(belt.getBoundingClientRect().y - origin.y).toFixed(1) : null,
      surface: style && {
        height: style.height, radius: style.borderRadius, background: style.backgroundColor,
      },
    })
  })()`))
}

/** Draw a rectangle with the stock shortcut, then marquee it from bare canvas. */
async function drawAndSelectRect(page, from, to) {
  await key(page, 'r', 'KeyR')
  await drag(page, from, to)
  await delay(200)
  await key(page, 'Escape', 'Escape')
  await drag(page,
    { x: Math.min(from.x, to.x) - 60, y: Math.min(from.y, to.y) - 60 },
    { x: Math.max(from.x, to.x) + 60, y: Math.max(from.y, to.y) + 60 })
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-selection-menu"]')`,
    'the selection menu to appear')
  await delay(200)
}

/** Clearance between the menu and the selection overlay, on whichever side. */
function clearance({ menu, shape, side }) {
  return side === 'above'
    ? (shape.y - OVERLAY_INSET) - (menu.y + menu.h)
    : menu.y - (shape.y + shape.h + OVERLAY_INSET)
}

function centreOffset({ menu, shape }) {
  return (menu.x + menu.w / 2) - (shape.x + shape.w / 2)
}

/**
 * Zoom with ctrl+wheel — the gesture a person uses, and the only one that does
 * not depend on tldraw's shortcut layer receiving a virtual key code.
 */
async function zoomBy(page, steps, at = { x: 700, y: 460 }) {
  for (let step = 0; step < Math.abs(steps); step += 1) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0,
      deltaY: steps > 0 ? -120 : 120, modifiers: 2,
    })
    await delay(90)
  }
  await delay(300)
}

/** Press and hold, move, and read the menu mid-gesture without releasing. */
async function duringGesture(page, from, steps, onHold) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  let at = from
  for (const step of steps) {
    at = step
    await mouse(page, 'mouseMoved', step.x, step.y, { buttons: 1 })
    await delay(40)
  }
  await delay(240)
  const reading = await readMenu(page)
  if (onHold) await onHold()
  await mouse(page, 'mouseReleased', at.x, at.y)
  await delay(320)
  return { during: reading, after: await readMenu(page) }
}

/**
 * A report frame. Captured from the renderer rather than the surface: a
 * `fromSurface` capture pauses the compositor long enough to disturb the
 * pointer gesture that follows it.
 */
async function frame(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(FRAMES[name], Buffer.from(capture.data, 'base64'))
}

/** Empty the board so the next check starts from a known canvas. */
async function clearBoard(page) {
  await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
  await shortcut(page, 'a', 'KeyA', 2)
  await key(page, 'Delete', 'Delete')
  await delay(200)
}

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({ label: 'selection-menu', build: 'selection-menu-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'selection-menu-proof.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(800)

    // 1. Anchored: centred on the selection, one gap above it.
    await drawAndSelectRect(page, { x: 560, y: 380 }, { x: 860, y: 540 })
    const anchored = await readMenu(page)
    assert.equal(anchored.visible, 'true')
    assert.equal(anchored.side, 'above')
    assert.ok(Math.abs(centreOffset(anchored)) <= EPSILON,
      `menu should be centred on the selection, was off by ${centreOffset(anchored)}`)
    assert.ok(Math.abs(clearance(anchored) - GAP) <= EPSILON,
      `menu should clear the overlay by ${GAP}px, was ${clearance(anchored)}`)
    assert.equal(anchored.surface.height, '40px')
    assert.equal(anchored.surface.radius, '13px')
    assert.equal(anchored.surface.background, 'rgb(30, 30, 30)')
    await frame(page, 'anchored')
    pass('a selected shape gets one 40px pill, centred on the selection and 16px clear of its overlay')

    // 2. The menu is chrome, not scenery: zoom must not touch its size or gap.
    const zoomed = {}
    for (const [label, steps] of [['in', 5], ['out', -10]]) {
      await zoomBy(page, steps)
      zoomed[label] = await readMenu(page)
    }
    await shortcut(page, '0', 'Digit0', 8)   // Shift+0 restores 100%
    await delay(400)
    const atRest = await readMenu(page)
    for (const [label, reading] of Object.entries(zoomed)) {
      assert.ok(Math.abs(reading.menu.w - atRest.menu.w) <= EPSILON
        && Math.abs(reading.menu.h - atRest.menu.h) <= EPSILON,
        `menu resized when zoomed ${label}: ${JSON.stringify(reading.menu)}`)
      assert.ok(Math.abs(clearance(reading) - GAP) <= EPSILON,
        `gap changed when zoomed ${label}: ${clearance(reading)}`)
      assert.ok(reading.shape.w !== atRest.shape.w, `zoom ${label} did not change the shape`)
    }
    pass('zooming resizes the shape but never the menu, and the gap stays put')

    // 3. No room above: flip below rather than clamp down onto the shape.
    await clearBoard(page)
    await drawAndSelectRect(page, { x: 560, y: 70 }, { x: 860, y: 210 })
    const flipped = await readMenu(page)
    assert.equal(flipped.side, 'below', 'a selection near the top must flip the menu below it')
    assert.ok(flipped.menu.y >= flipped.shape.y + flipped.shape.h,
      'the flipped menu must sit clear of the shape, not on top of it')
    assert.ok(Math.abs(clearance(flipped) - GAP) <= EPSILON,
      `the flipped menu should keep the same gap, was ${clearance(flipped)}`)
    await frame(page, 'flipped')
    pass('a selection against the top edge flips the menu below instead of clamping it onto the shape')

    // 4. Edges: clamp into the safe area and give up centring.
    await clearBoard(page)
    await drawAndSelectRect(page, { x: 560, y: 380 }, { x: 860, y: 520 })
    await drag(page, { x: 710, y: 450 }, { x: 60, y: 450 })
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the menu to settle after the shape is shoved into the gutter')
    const clamped = await readMenu(page)
    assert.equal(clamped.menu.x, MARGIN, 'the menu should stop at the left viewport margin')
    assert.ok(Math.abs(centreOffset(clamped)) > EPSILON,
      'a clamped menu is no longer centred — that is the point of the clamp')
    await frame(page, 'clamped')
    pass('pushed into the gutter the menu clamps to the 20px margin instead of leaving the viewport')

    // 5. The bottom toolbar is an obstacle, not the window edge.
    await clearBoard(page)
    await drawAndSelectRect(page, { x: 500, y: 300 }, { x: 940, y: 620 })
    await zoomBy(page, 26)
    const engulfed = await readMenu(page)
    assert.ok(engulfed.shape.y < 0 && engulfed.shape.y + engulfed.shape.h > engulfed.viewport.h,
      'this check needs a selection taller than the viewport')
    assert.ok(Math.abs((engulfed.menu.y + engulfed.menu.h) - (engulfed.beltTop - MARGIN)) <= EPSILON,
      `a menu with nowhere to go should rest ${MARGIN}px above the tool belt at ${engulfed.beltTop}, `
      + `was ${engulfed.menu.y + engulfed.menu.h}`)
    await frame(page, 'engulfed')
    pass('a selection larger than the viewport parks the menu above the tool belt, not at the window edge')

    // 6. Direct manipulation: gone for the gesture, back and re-anchored after.
    await shortcut(page, '0', 'Digit0', 8)
    await delay(400)
    const before = await readMenu(page)
    const centre = {
      x: before.shape.x + before.shape.w / 2,
      y: before.shape.y + before.shape.h / 2,
    }
    const dragged = await duringGesture(page, centre, [
      { x: centre.x + 40, y: centre.y + 30 },
      { x: centre.x + 90, y: centre.y + 60 },
      { x: centre.x + 130, y: centre.y + 80 },
    ], () => frame(page, 'dragging'))
    assert.equal(dragged.during.present, false, 'the menu must leave the document during a drag')
    assert.equal(dragged.after.visible, 'true', 'the menu must come back when the drag ends')
    assert.ok(Math.abs(centreOffset(dragged.after)) <= EPSILON,
      're-anchoring after a drag must centre on the shape\'s new position')
    pass('dragging a shape removes the menu for the gesture and re-anchors it on release')

    // 7. The same for a handle resize, which no pointer-down flag would catch.
    const settled = await readMenu(page)
    const handle = {
      x: settled.shape.x + settled.shape.w,
      y: settled.shape.y + settled.shape.h,
    }
    const resized = await duringGesture(page, handle, [
      { x: handle.x + 30, y: handle.y + 20 },
      { x: handle.x + 70, y: handle.y + 50 },
    ])
    assert.equal(resized.during.present, false, 'the menu must leave the document during a resize')
    assert.equal(resized.after.visible, 'true', 'the menu must come back when the resize ends')
    pass('resizing from a handle removes the menu for the gesture and re-anchors it on release')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    // 8. Panned off screen: invisible *and* out of the way of the pointer.
    for (let step = 0; step < 14; step += 1) {
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: 700, y: 400, deltaX: -180, deltaY: 0,
      })
      await delay(90)
    }
    await delay(400)
    const offscreen = await readMenu(page)
    assert.equal(offscreen.visible, 'false', 'the menu hides once the selection leaves the viewport')
    assert.equal(offscreen.hitsMenu, false,
      'a hidden menu must not answer hit tests — an invisible menu that still '
      + 'swallows clicks is the failure this locks down')
    pass('panning the selection off screen hides the menu and stops it answering hit tests')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    // The run's own record, for the report builder. Written last, so it exists
    // only if every check above actually passed — a report can then prove its
    // verdicts happened rather than restating labels from source.
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 1))

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
    for (const path of Object.values(FRAMES)) process.stdout.write(`  ${path}\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    process.stderr.write(`  Menu reading: ${JSON.stringify(await readMenu(page).catch(() => 'unreadable'))}\n`)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
