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

/** A frame big enough to engulf the viewport, for the camera scenarios below. */
const OVERSIZED_FRAME = 'shape:selection-menu-oversized-frame'
/**
 * A lone Frame shows no selection menu at all — nothing about it (no colour
 * style, no Block, no wrap target pair) satisfies `hasVisibleActions` in
 * `SystemSketchChrome.tsx`. This tiny rectangle rides alongside it purely to
 * make `canWrapSelection()` true so the menu mounts. It sits outside the
 * frame's own bounds (so tldraw does not auto-adopt it as a child, which
 * would collapse the selection back down to the frame alone) but spans the
 * same y-range as the frame, so it only nudges the selection's *left* edge —
 * the frame's own top and bottom stay the selection's top and bottom.
 */
const FRAME_COMPANION = 'shape:selection-menu-frame-companion'

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
  // The product's Preview controller occupies the very top of the viewport.
  // Keep this real marquee on the canvas: it still encloses a top-edge shape,
  // but does not cross non-canvas chrome on its way down.
  await drag(page,
    { x: Math.min(from.x, to.x) - 60, y: Math.max(Math.min(from.y, to.y) - 60, 64) },
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
 * The true selection bounds in viewport space, computed from raw shape page
 * bounds and the camera transform — not from `editor.getSelectionRotatedScreenBounds()`,
 * which is what the placement code itself reads. Going back to
 * `getShapePageBounds` + `pageToScreen` keeps this an independent check that
 * the right geometry reaches the placement rule, not just that the rule's
 * arithmetic is self-consistent.
 */
async function unionScreenRect(page, ids) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const origin = document.querySelector('.tl-container').getBoundingClientRect()
    const boxes = ${JSON.stringify(ids)}.map((id) => editor.getShapePageBounds(id))
    const minX = Math.min(...boxes.map((b) => b.minX))
    const minY = Math.min(...boxes.map((b) => b.minY))
    const maxX = Math.max(...boxes.map((b) => b.maxX))
    const maxY = Math.max(...boxes.map((b) => b.maxY))
    const topLeft = editor.pageToScreen({ x: minX, y: minY })
    const bottomRight = editor.pageToScreen({ x: maxX, y: maxY })
    return JSON.stringify({
      x: +(topLeft.x - origin.x).toFixed(1), y: +(topLeft.y - origin.y).toFixed(1),
      w: +(bottomRight.x - topLeft.x).toFixed(1), h: +(bottomRight.y - topLeft.y).toFixed(1),
    })
  })()`))
}

/**
 * Re-implements the horizontal half of `placeSelectionMenu`'s rule in plain
 * JS, deliberately not imported from the TS source: an oversized selection
 * centres on its intersection with the viewport, not its own true centre.
 * Checking against the documented rule this way, rather than calling the
 * module under test, is what makes this a real oracle instead of a tautology.
 */
function expectedCentreX(union, viewportW) {
  return union.w > viewportW
    ? (Math.max(union.x, 0) + Math.min(union.x + union.w, viewportW)) / 2
    : union.x + union.w / 2
}

function expectedMenuX(union, viewportW, menuW) {
  const raw = expectedCentreX(union, viewportW) - menuW / 2
  return Math.min(Math.max(raw, MARGIN), viewportW - menuW - MARGIN)
}

/**
 * Zoom with Ctrl/Cmd + wheel, the stock whiteboard modifier gesture.
 *
 * WHY Ctrl/Cmd rather than a plain wheel: `src/canvasCamera.ts` restores
 * stock `wheelBehavior: 'pan'` for every SystemSketch board. tldraw's own
 * wheel handler swaps that to zoom when the modifier is held, so this test
 * follows the ordinary whiteboard contract it is meant to preserve.
 */
async function zoomBy(page, steps, at = { x: 700, y: 460 }) {
  for (let step = 0; step < Math.abs(steps); step += 1) {
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0,
      // tldraw's stock modifier zoom follows the browser direction: scrolling
      // up zooms in. Direct mode flips this only after its explicit opt-in.
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
    // The product's Preview controller owns the top edge, so create just
    // below it and use the normal canvas drag to bring the selection up.
    await drawAndSelectRect(page, { x: 560, y: 150 }, { x: 860, y: 290 })
    await drag(page, { x: 710, y: 220 }, { x: 710, y: 140 })
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the selection menu after the top-edge move')
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

    // 5. Selection's top edge scrolled off above the viewport: pin to the top
    // margin. This used to clamp the menu down against the bottom toolbar —
    // the bug this rule fixes, not a regression in what this check asserts.
    await clearBoard(page)
    await drawAndSelectRect(page, { x: 500, y: 300 }, { x: 940, y: 620 })
    await zoomBy(page, 26)
    const engulfed = await readMenu(page)
    assert.ok(engulfed.shape.y < 0 && engulfed.shape.y + engulfed.shape.h > engulfed.viewport.h,
      'this check needs a selection taller than the viewport')
    assert.equal(engulfed.side, 'pinned',
      'a selection scrolled off above the viewport must pin, not clamp to the floor')
    assert.ok(Math.abs(engulfed.menu.y - MARGIN) <= EPSILON,
      `a pinned menu should sit ${MARGIN}px from the top, was ${engulfed.menu.y}`)
    await frame(page, 'engulfed')
    pass('a selection larger than the viewport pins the menu to the top margin, not the bottom toolbar')

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
    // A plain wheel is the stock pan gesture. Horizontal delta moves the
    // camera without changing zoom, taking the anchored menu beyond the view.
    for (let step = 0; step < 14; step += 1) {
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: 700, y: 400, deltaX: -180, deltaY: 0, modifiers: 0,
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

    // 9. Camera scenarios with a stock Frame: the placement rule has to hold
    // when the oversized selection is a real region the camera moves through,
    // not just a shape stretched by zoom (check 5, above).
    await clearBoard(page)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShape({
        id: ${JSON.stringify(OVERSIZED_FRAME)}, type: 'frame', x: 0, y: 0,
        props: { name: 'Oversized', w: 6000, h: 6000 },
      })
      editor.createShape({
        id: ${JSON.stringify(FRAME_COMPANION)}, type: 'geo', x: -50, y: 3000,
        props: { geo: 'rectangle', w: 10, h: 10 },
      })
      editor.select(${JSON.stringify(OVERSIZED_FRAME)}, ${JSON.stringify(FRAME_COMPANION)})
    })()`)
    const SELECTION_IDS = [OVERSIZED_FRAME, FRAME_COMPANION]

    // 9a. Viewport entirely inside the frame: pinned to the top margin.
    await evaluate(page, `(window.__systemsketch.editor.setCamera({ x: -2000, y: -2000, z: 1 }), null)`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the selection menu for the oversized frame')
    await delay(200)
    const pinned = await readMenu(page)
    const pinnedUnion = await unionScreenRect(page, SELECTION_IDS)
    assert.ok(pinnedUnion.y < 0 && pinnedUnion.y + pinnedUnion.h > pinned.viewport.h,
      'this check needs a frame taller than the viewport on both sides')
    assert.equal(pinned.side, 'pinned',
      'a viewport sitting entirely inside a taller-than-screen frame must pin the menu, not clamp it')
    assert.ok(Math.abs(pinned.menu.y - MARGIN) <= EPSILON,
      `a pinned menu should sit ${MARGIN}px from the top, was ${pinned.menu.y}`)
    assert.ok(
      Math.abs(pinned.menu.x - expectedMenuX(pinnedUnion, pinned.viewport.w, pinned.menu.w)) <= EPSILON,
      'the pinned menu should still centre on the visible-portion intersection, not the true selection centre',
    )
    pass('a viewport entirely inside an oversized frame pins the menu to the top margin')

    // 9b. Pan so the frame's top edge is visible again, near mid-screen:
    // there is room above once more, so this must fall back to the ordinary
    // 'above' placement rather than staying pinned.
    await evaluate(page, `(window.__systemsketch.editor.setCamera({ x: -2000, y: 350, z: 1 }), null)`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.side === 'above'`,
      'the selection menu to flip back to above')
    await delay(200)
    const midScreen = await readMenu(page)
    const midScreenUnion = await unionScreenRect(page, SELECTION_IDS)
    assert.ok(midScreenUnion.y > 0 && midScreenUnion.y < midScreen.viewport.h / 2 + 150,
      "this check needs the frame's top edge visible near mid-screen")
    assert.equal(midScreen.side, 'above')
    assert.ok(
      Math.abs(clearance({ menu: midScreen.menu, shape: midScreenUnion, side: 'above' }) - GAP) <= EPSILON,
      `the menu should clear the frame's top edge by ${GAP}px, was `
      + `${clearance({ menu: midScreen.menu, shape: midScreenUnion, side: 'above' })}`,
    )
    pass("a frame with its top edge visible near mid-screen gets the ordinary 'above' placement")

    // 9c. Pan the camera 600px sideways: the frame stays wider than the
    // viewport throughout, with only its left edge on screen, so the
    // visible-portion centre must move with the pan — the horizontal half of
    // the same rule as 9a and 9b's vertical branches.
    await evaluate(page, `(window.__systemsketch.editor.setCamera({ x: 750, y: 350, z: 1 }), null)`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.side === 'above'`,
      'the selection menu before the sideways pan')
    await delay(200)
    const beforePan = await readMenu(page)
    const beforeUnion = await unionScreenRect(page, SELECTION_IDS)
    assert.ok(beforeUnion.x > 0 && beforeUnion.x < beforePan.viewport.w
      && beforeUnion.x + beforeUnion.w > beforePan.viewport.w,
      "this check needs the frame's left edge on screen and its right edge off screen")

    await evaluate(page, `(window.__systemsketch.editor.setCamera({ x: 150, y: 350, z: 1 }), null)`)
    await delay(200)
    const afterPan = await readMenu(page)
    const afterUnion = await unionScreenRect(page, SELECTION_IDS)
    assert.ok(afterUnion.x > 0 && afterUnion.x < afterPan.viewport.w
      && afterUnion.x + afterUnion.w > afterPan.viewport.w,
      'the left edge must still be on screen after the pan, or this is not testing the tracking edge')

    const centreBefore = beforePan.menu.x + beforePan.menu.w / 2
    const centreAfter = afterPan.menu.x + afterPan.menu.w / 2
    assert.ok(
      Math.abs(centreBefore - expectedCentreX(beforeUnion, beforePan.viewport.w)) <= EPSILON,
      'the menu centre before the pan should match the visible-portion intersection',
    )
    assert.ok(
      Math.abs(centreAfter - expectedCentreX(afterUnion, afterPan.viewport.w)) <= EPSILON,
      'the menu centre after the pan should match the visible-portion intersection',
    )
    assert.ok(Math.abs((centreBefore - centreAfter) - 300) <= EPSILON,
      `a 600px pan moving one tracked edge should shift the centre by half that (300px), was `
      + `${centreBefore - centreAfter}`)
    pass('panning the camera 600px sideways moves the visible-portion centre with it')

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
