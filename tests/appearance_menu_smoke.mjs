#!/usr/bin/env node
/**
 * Real-browser proof that the selection menu can actually edit appearance.
 *
 * SystemSketch disables tldraw's `StylePanel`, so before this there was no way
 * to change a shape's colour, fill, stroke, size, typeface, alignment, routing
 * or endpoints on canvas at all. The controls are modelled on FigJam's — see
 * docs/figjam-appearance-menu-spec-2026-09-01.html — over tldraw's own styles.
 *
 * Every check reads two independent oracles: the pill's own label, which comes
 * from `useRelevantStyles()` and so round-trips through the document, and the
 * painted `stroke` on the canvas. A change that only moved the UI fails here.
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
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const RESULTS = join(ROOT, 'docs', 'appearance-menu-results.json')
const SHOT = join(ROOT, 'docs', 'appearance-menu-live-2026-09-01.png')
const FRAMES = {
  color: join(ROOT, 'docs', 'appearance-menu-1-color-2026-09-01.png'),
  shape: join(ROOT, 'docs', 'appearance-menu-2-shape-2026-09-01.png'),
  connector: join(ROOT, 'docs', 'appearance-menu-3-connector-2026-09-01.png'),
}

/** FigJam's order, as the model lays it out for a geo shape. */
const SHAPE_CONTROLS = ['geo', 'color', 'dash', 'size', 'font', 'align', 'verticalAlign']
// FigJam's connector order, captured from its own menu as
// `Change color | Line style | Add text | Start point | Line shape | End point`:
// the controls read the way the arrow does — where it leaves, how it travels,
// where it lands.
const CONNECTOR_CONTROLS = ['color', 'dash', 'size', 'font', 'arrowheadStart', 'arrowKind', 'arrowheadEnd']

const EMPTY_CANVAS = { x: 200, y: 820 }

async function readMenu(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const triggers = [...document.querySelectorAll('.systemsketch-appearance__trigger')]
    const shape = document.querySelector('.tl-shape')
    const painted = shape && shape.querySelector('[stroke]')
    const panel = document.querySelector('[data-testid^="systemsketch-appearance-panel-"]')
    const pill = document.querySelector('.systemsketch-selection-menu__bar')
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
    }
    return JSON.stringify({
      controls: triggers.map((t) => t.dataset.control),
      labels: Object.fromEntries(triggers.map((t) => [t.dataset.control, t.getAttribute('aria-label')])),
      stroke: painted ? painted.getAttribute('stroke') : null,
      shapeType: shape ? shape.getAttribute('data-shape-type') : null,
      pill: box(pill),
      panel: panel ? {
        control: panel.dataset.testid.replace('systemsketch-appearance-panel-', ''),
        layout: panel.dataset.layout,
        ...box(panel),
        background: getComputedStyle(panel).backgroundColor,
        radius: getComputedStyle(panel).borderRadius,
        modeRow: [...panel.querySelectorAll('.systemsketch-appearance__mode .systemsketch-appearance__option')]
          .map((b) => b.getAttribute('aria-label')),
        options: [...panel.querySelectorAll('.systemsketch-appearance__options .systemsketch-appearance__option')]
          .map((b) => ({ value: b.dataset.value, checked: b.getAttribute('aria-checked') === 'true' })),
      } : null,
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

/** Open a control's popover; returns the reading with the panel present. */
async function openControl(page, control) {
  await clickSelector(page, `.systemsketch-appearance__trigger[data-control="${control}"]`)
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-appearance-panel-${control}"]')`,
    `the ${control} popover`)
  await delay(160)
  return readMenu(page)
}

/**
 * Close by toggling the same trigger. Escape would also close it, but Escape
 * reaches tldraw too and clears the selection with it — so the gesture a person
 * uses to keep working is the click, and that is what this exercises.
 */
async function closeControl(page, control) {
  await clickSelector(page, `.systemsketch-appearance__trigger[data-control="${control}"]`)
  await waitFor(page,
    `!document.querySelector('[data-testid="systemsketch-appearance-panel-${control}"]')`,
    `the ${control} popover to close`)
  await delay(240)
}

async function pickOption(page, control, value) {
  await clickSelector(page,
    `[data-testid="systemsketch-appearance-panel-${control}"] `
    + `.systemsketch-appearance__option[data-value="${value}"]`)
  await delay(280)
}

async function drawAndSelect(page, from, to, toolKey) {
  await key(page, toolKey, `Key${toolKey.toUpperCase()}`)
  await drag(page, from, to)
  await delay(200)
  await key(page, 'Escape', 'Escape')
  await drag(page,
    { x: Math.min(from.x, to.x) - 60, y: Math.min(from.y, to.y) - 60 },
    { x: Math.max(from.x, to.x) + 60, y: Math.max(from.y, to.y) + 60 })
  await waitFor(page, `document.querySelector('.systemsketch-appearance__trigger')`,
    'the appearance controls')
  await delay(200)
}

async function clearBoard(page) {
  await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
  await shortcut(page, 'a', 'KeyA', 2)
  await key(page, 'Delete', 'Delete')
  await delay(200)
}

async function frame(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(FRAMES[name], Buffer.from(capture.data, 'base64'))
}

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({ label: 'appearance-menu', build: 'appearance-menu-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'appearance-proof.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(800)

    // 1. A shape gets what a shape can have, in FigJam's order.
    await drawAndSelect(page, { x: 560, y: 380 }, { x: 900, y: 540 }, 'r')
    const shape = await readMenu(page)
    assert.deepEqual(shape.controls, SHAPE_CONTROLS)
    assert.equal(shape.labels.geo, 'Shape, rectangle')
    pass('a selected shape gets shape, paint and typography controls, in FigJam order')

    // 2. The colour popover: FigJam's fill row stacked over the palette, above the pill.
    const colorOpen = await openControl(page, 'color')
    assert.equal(colorOpen.panel.layout, 'swatches')
    assert.equal(colorOpen.panel.background, 'rgb(30, 30, 30)')
    assert.equal(colorOpen.panel.radius, '13px')
    assert.deepEqual(colorOpen.panel.modeRow,
      ['No fill', 'Transparent', 'Solid', 'Fill', 'Pattern', 'Lined'])
    const gap = colorOpen.pill.y - (colorOpen.panel.y + colorOpen.panel.h)
    assert.ok(Math.abs(gap - 8) <= 1.5, `popover should sit 8px above the pill, was ${gap}`)
    await frame(page, 'color')
    pass('the colour popover stacks the fill row over the palette, 8px above the pill')

    // 3. Picking a colour writes the document, not just the menu.
    const strokeBefore = colorOpen.stroke
    await pickOption(page, 'color', 'blue')
    const recoloured = await readMenu(page)
    assert.equal(recoloured.labels.color, 'Color, blue')
    assert.notEqual(recoloured.stroke, strokeBefore)
    assert.ok(recoloured.panel.options.find((o) => o.value === 'blue').checked)
    pass('choosing a colour repaints the shape and rings the chosen swatch')

    // 4. The fill row writes a different style from the same popover, and the
    //    popover stays open across picks the way FigJam's does.
    const paintedBefore = (await readMenu(page)).stroke
    await pickOption(page, 'color', 'solid')
    const filled = await readMenu(page)
    assert.ok(filled.panel, 'the popover stays open after a pick')
    assert.equal(filled.panel.modeRow.length, 6)
    assert.equal(filled.labels.color, 'Color, blue', 'filling must not disturb the colour')
    assert.equal(filled.stroke, paintedBefore, 'filling must not change the stroke either')
    await closeControl(page, 'color')
    pass('the fill row and the palette write different styles from one popover')

    // 5. Every value the style accepts is offered — including tldraw's `draw`
    //    default, which a freshly drawn shape actually has.
    const dash = await openControl(page, 'dash')
    assert.deepEqual(dash.panel.options.map((o) => o.value),
      ['draw', 'solid', 'dashed', 'dotted', 'none'])
    assert.ok(dash.panel.options.find((o) => o.value === 'draw').checked,
      'a freshly drawn shape is `draw`, so the menu must be able to show it')
    await pickOption(page, 'dash', 'dashed')
    assert.equal((await readMenu(page)).labels.dash, 'Stroke, dashed')
    await closeControl(page, 'dash')
    pass('the stroke popover offers every dash the document can hold, and applies one')

    // 6. Size and typeface are named ladders, not sliders.
    const size = await openControl(page, 'size')
    assert.deepEqual(size.panel.options.map((o) => o.value), ['s', 'm', 'l', 'xl'])
    await pickOption(page, 'size', 'l')
    assert.equal((await readMenu(page)).labels.size, 'Size, large')
    await closeControl(page, 'size')

    const font = await openControl(page, 'font')
    assert.deepEqual(font.panel.options.map((o) => o.value), ['sans', 'serif', 'mono', 'draw'])
    await pickOption(page, 'font', 'mono')
    assert.equal((await readMenu(page)).labels.font, 'Typeface, technical')
    await closeControl(page, 'font')
    pass('size and typeface are closed named ladders, and both write through')

    // 7. The shape picker turns one geo into another.
    const geo = await openControl(page, 'geo')
    assert.equal(geo.panel.layout, 'library')
    assert.ok(geo.panel.options.length >= 20)
    await frame(page, 'shape')
    await pickOption(page, 'geo', 'ellipse')
    assert.equal((await readMenu(page)).labels.geo, 'Shape, ellipse')
    await closeControl(page, 'geo')
    pass('the shape picker changes a rectangle into an ellipse')

    // 8. One click is one undo step.
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(300)
    assert.equal((await readMenu(page)).labels.geo, 'Shape, rectangle',
      'a single undo must retract exactly the last appearance change')
    pass('each appearance change is one history step')

    // 9. A connector gets routing and endpoints instead of shape and fill.
    await clearBoard(page)
    await drawAndSelect(page, { x: 520, y: 420 }, { x: 940, y: 520 }, 'a')
    const connector = await readMenu(page)
    assert.deepEqual(connector.controls, CONNECTOR_CONTROLS)
    assert.equal(connector.shapeType, 'arrow')
    // The line shape must sit between the two ends, not before them.
    assert.ok(
      connector.controls.indexOf('arrowheadStart') < connector.controls.indexOf('arrowKind') &&
        connector.controls.indexOf('arrowKind') < connector.controls.indexOf('arrowheadEnd'),
      'line shape belongs between start and end',
    )
    const ends = await openControl(page, 'arrowheadEnd')
    assert.ok(ends.panel.options.find((o) => o.value === 'triangle'))
    await pickOption(page, 'arrowheadEnd', 'triangle')
    assert.equal((await readMenu(page)).labels.arrowheadEnd, 'End point, triangle')
    await closeControl(page, 'arrowheadEnd')
    await frame(page, 'connector')
    pass('a connector gets routing and endpoints, and an endpoint applies')

    // 10. A disagreeing selection says so rather than showing a wrong value.
    await clearBoard(page)
    await drawAndSelect(page, { x: 420, y: 380 }, { x: 620, y: 500 }, 'r')
    await openControl(page, 'color')
    await pickOption(page, 'color', 'red')
    await closeControl(page, 'color')
    await key(page, 'Escape', 'Escape')
    await drawAndSelect(page, { x: 780, y: 380 }, { x: 980, y: 500 }, 'r')
    await openControl(page, 'color')
    await pickOption(page, 'color', 'green')
    await closeControl(page, 'color')
    await key(page, 'Escape', 'Escape')
    await shortcut(page, 'a', 'KeyA', 2)
    await delay(400)
    const mixedReading = await readMenu(page)
    assert.equal(mixedReading.labels.color, 'Color, mixed')
    pass('a selection that disagrees reports mixed instead of one shape\'s value')

    // 11. A Block alongside a shape must not put the shape's paint out of reach.
    //     The Block branch of the pill owns the whole pill, so the appearance
    //     controls have to ride on it too — a Block carries no tldraw styles of
    //     its own, so a Block on its own is unchanged.
    await clearBoard(page)
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 460, y: 360 }, { x: 700, y: 500 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'the Block title editor')
    await page.send('Input.insertText', { text: 'encode' })
    await key(page, 'Enter', 'Enter')
    await key(page, 'Escape', 'Escape')
    await delay(300)
    await drag(page, { x: 400, y: 300 }, { x: 760, y: 560 })
    await waitFor(page, `document.querySelector('.block-mini-menu')`, 'the Block mini menu')
    const blockOnly = await readMenu(page)
    assert.deepEqual(blockOnly.controls, [],
      'a Block has no tldraw styles, so it contributes no appearance controls')

    await key(page, 'Escape', 'Escape')
    await key(page, 'r', 'KeyR')
    await drag(page, { x: 840, y: 380 }, { x: 1040, y: 500 })
    await delay(200)
    await key(page, 'Escape', 'Escape')
    await drag(page, { x: 380, y: 290 }, { x: 1100, y: 570 })
    await waitFor(page, `document.querySelector('.systemsketch-appearance__trigger')`,
      'appearance controls beside the Block menu')
    const mixedKinds = await readMenu(page)
    assert.ok(mixedKinds.controls.includes('color'),
      'the rectangle\'s colour must stay reachable while a Block is also selected')
    await openControl(page, 'color')
    await pickOption(page, 'color', 'violet')
    assert.equal((await readMenu(page)).labels.color, 'Color, violet')
    await closeControl(page, 'color')
    pass('a Block selected beside a shape keeps the shape\'s appearance reachable')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

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
