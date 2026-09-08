#!/usr/bin/env node
/**
 * Real-browser proof of the Excalidraw-parity floating toolbar: the
 * selection pill drawn with vendored Excalidraw glyphs (fill, stroke width,
 * dash, arrowheads, alignment) and the four new controls the plan added on
 * top of stock tldraw editor APIs — Opacity (getSharedOpacity /
 * setOpacityForSelectedShapes), Arrange z-order (sendToBack / bringToFront /
 * ...) and align (alignShapes) — plus the placement-engine swap
 * (selectionMenuPlacement.ts -> floatingToolbarPlacement.ts, backed by
 * @floating-ui/core) still flipping the pill below a selection pinned near
 * the top edge.
 *
 * The vendored-icon claim is checked against the actual source file, not a
 * value copied into this test by hand: `expectedStrokeWidthBoldPath()` reads
 * src/appearance/excalidrawIcons/icons.tsx at run time and pulls the `d` of
 * `StrokeWidthBoldIcon` with a regex, because this repo's *.mjs journeys run
 * under plain Node (no JSX/TS transform — see CLAUDE.md's `tsc -b` note), so
 * the component itself cannot be `import`ed here the way a vitest test could.
 * A drift in the vendored path fails this test the same way a hand-copied
 * constant would, without risking a second, silently-stale copy of it.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
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
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const MEDIA_DIR = join(ROOT, 'reports', 'media', 'floating-toolbar-excalidraw')
const ICONS_SOURCE = join(ROOT, 'src', 'appearance', 'excalidrawIcons', 'icons.tsx')

const FRAMES = {
  pill: join(MEDIA_DIR, '1-pill-appears.png'),
  vendoredIcons: join(MEDIA_DIR, '2-vendored-stroke-width-icons.png'),
  opacity: join(MEDIA_DIR, '3-opacity-30.png'),
  fillHatched: join(MEDIA_DIR, '4-fill-hatched.png'),
  dashHandDrawn: join(MEDIA_DIR, '5-dash-hand-drawn.png'),
  bringToFront: join(MEDIA_DIR, '6-bring-to-front.png'),
  alignTop: join(MEDIA_DIR, '7-align-top.png'),
  flippedBelow: join(MEDIA_DIR, '8-flipped-below.png'),
}

/**
 * Two overlapping rectangles. A freshly drawn geo shape paints `fill: 'none'`
 * by default, so a plain click inside it hits nothing — tldraw only
 * hit-tests an unfilled shape's stroke. Every marquee below is therefore
 * sized to fully enclose exactly the rectangle(s) it names (tldraw's brush
 * select is an intersection test, not a containment test, so each marquee
 * also has to clear the OTHER rectangle's bounds entirely).
 */
const RECT_A = { from: { x: 500, y: 380 }, to: { x: 700, y: 500 } }
const RECT_B = { from: { x: 650, y: 450 }, to: { x: 850, y: 570 } }
const MARQUEE_A_ONLY = { from: { x: 440, y: 320 }, to: { x: 640, y: 440 } }
const MARQUEE_B_ONLY = { from: { x: 720, y: 480 }, to: { x: 860, y: 590 } }
const MARQUEE_BOTH = { from: { x: 440, y: 320 }, to: { x: 900, y: 610 } }
const TEXT_POINT = { x: 980, y: 380 }
const EMPTY_CANVAS = { x: 200, y: 820 }

/** Deselect, then brush-select exactly the shapes a marquee encloses. */
async function selectByMarquee(page, marquee) {
  await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
  await drag(page, marquee.from, marquee.to)
  await delay(200)
}

/**
 * Read the exact `d` this repo vendored for `StrokeWidthBoldIcon` straight
 * from source, so this test fails the moment the vendored path drifts from
 * whatever `icons.test.tsx` and the app itself actually render — never a
 * value retyped here by hand.
 */
async function expectedStrokeWidthBoldPath() {
  const source = await readFile(ICONS_SOURCE, 'utf8')
  const match = source.match(/export const StrokeWidthBoldIcon = createIcon\(\s*<path\s+d="([^"]+)"/)
  assert.ok(match, 'could not find StrokeWidthBoldIcon\'s path in icons.tsx — did the export move or rename?')
  return match[1]
}

/** The selection pill's own dataset, read straight off its DOM node. */
async function readPill(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
    return JSON.stringify({
      present: Boolean(menu),
      visible: menu ? menu.dataset.visible : null,
      side: menu ? (menu.dataset.side ?? null) : null,
    })
  })()`))
}

async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'null'
    const r = el.getBoundingClientRect()
    return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)])
  })()`))
  assert.ok(point, `missing ${selector}`)
  await clickAt(page, point[0], point[1])
}

async function elementRect(page, selector) {
  const rect = JSON.parse(await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'null'
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`))
  assert.ok(rect, `missing ${selector}`)
  return rect
}

async function screenCenterOf(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    const point = editor.pageToScreen(bounds.center)
    return JSON.stringify({ x: point.x, y: point.y })
  })()`))
}

async function shapeProps(page, shapeId) {
  return evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(shapeId)})?.props`)
}

/** `opacity` is a base shape field (like x/y/rotation), not a style in `props`. */
async function shapeOpacity(page, shapeId) {
  return evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(shapeId)})?.opacity`)
}

async function saveScreenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(MEDIA_DIR)
  const expectedBoldPath = await expectedStrokeWidthBoldPath()

  const app = await startApp({ label: 'floating-toolbar-excalidraw', build: 'floating-toolbar-excalidraw-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'floating-toolbar-excalidraw-proof.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(800)

    // 1. Draw two overlapping rectangles and a text shape with real pointer
    // gestures — never `editor.createShapes`, so the drawing tool, the drag
    // gesture and tldraw's own auto-selection are all exercised for real.
    await key(page, 'r', 'KeyR')
    await drag(page, RECT_A.from, RECT_A.to)
    await delay(200)
    const rectA = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id`)
    assert.ok(rectA, 'drawing the first rectangle should select it')
    // Drawing a shape hands keyboard focus to a rich-text (ProseMirror) node
    // in the auto-opened inspector dock, not back to the canvas — a bare
    // 'r' keydown right after a draw is swallowed as text there instead of
    // reaching tldraw's tool-shortcut listener. Every draw-then-shortcut
    // journey in this repo (see `drawAndSelectRect` in
    // `selection_menu_smoke.mjs`) presses Escape first to release that
    // focus; this journey draws twice in a row, so it needs the same
    // Escape before each subsequent tool switch.
    await key(page, 'Escape', 'Escape')
    await delay(150)

    await key(page, 'r', 'KeyR')
    await drag(page, RECT_B.from, RECT_B.to)
    await delay(200)
    const rectB = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id`)
    assert.ok(rectB, 'drawing the second, overlapping rectangle should select it')
    assert.notEqual(rectA, rectB)
    await key(page, 'Escape', 'Escape')
    await delay(150)

    await key(page, 't', 'KeyT')
    await clickAt(page, TEXT_POINT.x, TEXT_POINT.y)
    await delay(300)
    await page.send('Input.insertText', { text: 'Floating toolbar' })
    await key(page, 'Escape', 'Escape')
    await delay(200)
    const textShapeCount = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'text').length`)
    assert.equal(textShapeCount, 1, 'the text tool should have drawn exactly one text shape')
    pass('two overlapping rectangles and a text shape are drawn with real pointer gestures')

    // 2. Selecting ONE rectangle (a marquee that only fully encloses the
    // back rectangle) shows the pill.
    await selectByMarquee(page, MARQUEE_A_ONLY)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the selection pill over the single rectangle')
    await delay(200)
    const singleSelection = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id`)
    assert.equal(singleSelection, rectA, 'the exclusive point must select the back rectangle alone')
    const pillOnSelect = await readPill(page)
    assert.equal(pillOnSelect.present, true)
    assert.equal(pillOnSelect.visible, 'true')
    await saveScreenshot(page, FRAMES.pill)
    pass('selecting one rectangle shows the pill (data-testid=systemsketch-selection-menu, data-visible=true)')

    // 3. PROVE THE VENDORED ICONS SHIP: the Line style popover's stroke-width
    // radio draws `StrokeWidthBoldIcon` for "medium" — read the live DOM path
    // and diff it against the same icon's `d` pulled straight from
    // icons.tsx, not a value retyped into this test.
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')`,
      'the Line style popover')
    await delay(200)
    const mediumGlyphSelector = '[data-testid="systemsketch-appearance-panel-strokeColor"] '
      + '.systemsketch-appearance__mode[data-mode-control="strokeWidth"] '
      + '.systemsketch-appearance__option[data-value="medium"] '
      + '.systemsketch-appearance__glyph--excalidraw svg path'
    const domPath = await evaluate(page, `document.querySelector(${JSON.stringify(mediumGlyphSelector)})?.getAttribute('d')`)
    assert.equal(domPath, expectedBoldPath,
      `the medium stroke-width option should render the vendored StrokeWidthBoldIcon (d="${expectedBoldPath}"), got "${domPath}"`)
    // And the wrapper class the vendored-icon glyph layer uses, so this is
    // provably the Excalidraw icon path and not a coincidental match.
    const wrapperClass = await evaluate(page, `document.querySelector(
      '[data-testid="systemsketch-appearance-panel-strokeColor"] .systemsketch-appearance__mode[data-mode-control="strokeWidth"] .systemsketch-appearance__option[data-value="medium"] span'
    )?.className`)
    assert.ok(wrapperClass?.includes('systemsketch-appearance__glyph--excalidraw'),
      'the medium stroke-width glyph must be wrapped as a vendored Excalidraw icon, not a drawn one')
    await saveScreenshot(page, FRAMES.vendoredIcons)
    pass('the stroke-width radio renders the vendored Excalidraw StrokeWidthBoldIcon path, read live from the DOM')
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')`,
      'the Line style popover to close')

    // 4. NEW CONTROL (a): select both rectangles and drag the Opacity slider
    // to 30% — every selected shape's opacity must land at 0.3.
    await selectByMarquee(page, MARQUEE_BOTH)
    await waitFor(page, `window.__systemsketch.editor.getSelectedShapeIds().length === 2`, 'both rectangles selected')
    const opacitySlider = await elementRect(page, '[data-testid="systemsketch-opacity-slider"]')
    // A native <input type="range"> jumps to wherever it is clicked, but the
    // click-to-position mapping insets for the thumb's own radius, so a
    // click at a fraction of the track's width lands close to but not
    // exactly on a round value (measured: 30% of the track produced 20, not
    // 30). Click near the minimum instead, then step by the input's own
    // `step="10"` with the keyboard — exact, and it exercises the slider as
    // a real focused control rather than fighting its pixel geometry.
    await clickAt(page, opacitySlider.x + 2, opacitySlider.y + opacitySlider.h / 2)
    await delay(150)
    for (let step = 0; step < 3; step += 1) {
      await key(page, 'ArrowRight', 'ArrowRight')
    }
    await delay(250)
    const opacityA = await shapeOpacity(page, rectA)
    const opacityB = await shapeOpacity(page, rectB)
    assert.equal(opacityA, 0.3, `rectangle A opacity should be 0.3, was ${opacityA}`)
    assert.equal(opacityB, 0.3, `rectangle B opacity should be 0.3, was ${opacityB}`)
    await saveScreenshot(page, FRAMES.opacity)
    pass('dragging the Opacity slider to 30% sets every selected shape\'s opacity to 0.3')

    // 5. NEW CONTROL (b): Fill -> Hatched writes stock tldraw's `pattern` fill.
    await selectByMarquee(page, MARQUEE_A_ONLY)
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id === ${JSON.stringify(rectA)}`,
      'rectangle A selected alone')
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="color"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-appearance-panel-color"]')`, 'the Color popover')
    await delay(160)
    await clickSelector(page, '[data-testid="systemsketch-appearance-panel-color"] .systemsketch-appearance__option[data-value="pattern"]')
    await delay(250)
    const filled = await shapeProps(page, rectA)
    assert.equal(filled.fill, 'pattern', `rectangle A fill should be "pattern", was ${filled.fill}`)
    await saveScreenshot(page, FRAMES.fillHatched)
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="color"]')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-appearance-panel-color"]')`, 'the Color popover to close')
    pass('clicking Fill -> Hatched writes stock tldraw\'s pattern fill')

    // 6. NEW CONTROL (c): Line style -> Hand-drawn writes stock tldraw's
    // `draw` dash.
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')`, 'the Line style popover')
    await delay(160)
    await clickSelector(page, '[data-testid="systemsketch-appearance-panel-strokeColor"] .systemsketch-appearance__option[data-value="draw"]')
    await delay(250)
    const dashed = await shapeProps(page, rectA)
    assert.equal(dashed.dash, 'draw', `rectangle A dash should be "draw", was ${dashed.dash}`)
    await saveScreenshot(page, FRAMES.dashHandDrawn)
    await clickSelector(page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')`, 'the Line style popover to close')
    pass('clicking Line style -> Hand-drawn writes stock tldraw\'s draw dash')

    // 7. NEW CONTROL (d): with the BACK rectangle selected, Bring to front
    // must sort it above the front rectangle.
    const beforeOrder = await evaluate(page,
      `window.__systemsketch.editor.getSortedChildIdsForParent(window.__systemsketch.editor.getCurrentPageId())`)
    assert.ok(beforeOrder.indexOf(rectA) < beforeOrder.indexOf(rectB),
      'rectangle A (drawn first) should start behind rectangle B')
    await clickSelector(page, '[data-testid="systemsketch-arrange-bringToFront"]')
    await delay(250)
    const afterOrder = await evaluate(page,
      `window.__systemsketch.editor.getSortedChildIdsForParent(window.__systemsketch.editor.getCurrentPageId())`)
    assert.ok(afterOrder.indexOf(rectA) > afterOrder.indexOf(rectB),
      'Bring to front should sort rectangle A above rectangle B')
    await saveScreenshot(page, FRAMES.bringToFront)
    pass('Bring to front sorts the back rectangle above its sibling (getSortedChildIdsForParent order)')

    // 8. NEW CONTROL (e): select both rectangles and Align top.
    await selectByMarquee(page, MARQUEE_BOTH)
    await waitFor(page, `window.__systemsketch.editor.getSelectedShapeIds().length === 2`, 'both rectangles selected again')
    const beforeAlign = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        a: editor.getShapePageBounds(${JSON.stringify(rectA)}).y,
        b: editor.getShapePageBounds(${JSON.stringify(rectB)}).y,
      })
    })()`)
    assert.notEqual(JSON.parse(beforeAlign).a, JSON.parse(beforeAlign).b, 'the two rectangles must start at different y, or Align top proves nothing')
    await clickSelector(page, '[data-testid="systemsketch-arrange-top"]')
    await delay(250)
    const afterAlign = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        a: editor.getShapePageBounds(${JSON.stringify(rectA)}).y,
        b: editor.getShapePageBounds(${JSON.stringify(rectB)}).y,
      })
    })()`))
    assert.equal(afterAlign.a, afterAlign.b, `Align top should leave both rectangles at the same page y, got ${JSON.stringify(afterAlign)}`)
    await saveScreenshot(page, FRAMES.alignTop)
    pass('Align top leaves both selected rectangles at the same page y')

    // 9. Placement-engine regression: select one shape, drag it near the top
    // edge, and the pill must flip to data-side="below" — the exact FigJam
    // semantic the @floating-ui/core swap (floatingToolbarPlacement.ts) had
    // to preserve, proven here against the real DOM rather than only the
    // frozen-oracle differential unit test.
    await selectByMarquee(page, MARQUEE_A_ONLY)
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id === ${JSON.stringify(rectA)}`,
      'rectangle A selected alone before the flip check')
    const centerBeforeDrag = await screenCenterOf(page, rectA)
    await drag(page, centerBeforeDrag, { x: centerBeforeDrag.x, y: 90 })
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the pill after the shape is dragged to the top edge')
    await delay(250)
    const flipped = await readPill(page)
    assert.equal(flipped.side, 'below', `a selection pinned near the top edge must flip the pill below, got side="${flipped.side}"`)
    await saveScreenshot(page, FRAMES.flippedBelow)
    pass('dragging the selection near the top edge flips the pill to data-side="below"')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
    for (const path of Object.values(FRAMES)) process.stdout.write(`  ${path}\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    process.stderr.write(`  Pill reading: ${JSON.stringify(await readPill(page).catch(() => 'unreadable'))}\n`)
    const capture = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
    if (capture) await writeFile(join(MEDIA_DIR, 'failure.png'), Buffer.from(capture.data, 'base64'))
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
