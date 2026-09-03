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
 * Geometry is asserted against the numbers read out of FigJam's DOM
 * (docs/assets/figjam-chrome-traced.json), not against taste.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
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

const RESULTS = join(ROOT, 'docs', 'appearance-menu-results.json')
/** Where the pill, panel and picker sat in each frame, so the report can crop them. */
const GEOMETRY = join(ROOT, 'docs', 'appearance-menu-geometry.json')
const SHOT = join(ROOT, 'docs', 'appearance-menu-live-2026-09-01.png')
const FRAMES = {
  color: join(ROOT, 'docs', 'appearance-menu-1-color-2026-09-01.png'),
  shape: join(ROOT, 'docs', 'appearance-menu-2-shape-2026-09-01.png'),
  connector: join(ROOT, 'docs', 'appearance-menu-3-connector-2026-09-01.png'),
  picker: join(ROOT, 'docs', 'appearance-menu-4-custom-picker-2026-09-01.png'),
  custom: join(ROOT, 'docs', 'appearance-menu-5-custom-applied-2026-09-01.png'),
  lineStyle: join(ROOT, 'docs', 'appearance-menu-6-line-style-2026-09-01.png'),
  fontSize: join(ROOT, 'docs', 'appearance-menu-7-font-size-2026-09-01.png'),
  chips: join(ROOT, 'docs', 'appearance-menu-8-shape-line-style-2026-09-01.png'),
  mixed: join(ROOT, 'docs', 'appearance-menu-9-mixed-selection-2026-09-01.png'),
  arrowRouting: join(ROOT, 'docs', 'assets', 'arrow-routing-three-options.png'),
  arrowRoutingSwitched: join(ROOT, 'docs', 'assets', 'arrow-routing-switched-control.png'),
}

/**
 * FigJam's shape pill, captured as `Shape | Change color, Line style |
 * Typeface, Font size | ... | Text alignment`: Font size follows Typeface.
 */
const SHAPE_CONTROLS = ['geo', 'color', 'dash', 'font', 'size', 'align', 'verticalAlign']
/**
 * FigJam's connector pill, `Change color | Line style | Add text | Start point
 * | Line shape | End point`: one Line style holding weight and dash, then the
 * ends and the shape between them, the way the arrow itself reads.
 */
const CONNECTOR_CONTROLS = ['color', 'lineStyle', 'font', 'arrowheadStart', 'arrowKind', 'arrowheadEnd']

/** Read out of FigJam's DOM; see figjamTokens.ts for where each came from. */
const FIGJAM = {
  trigger: 56, colorTrigger: 54, textTrigger: 144, separatorClear: 4,
  cell: 24, cellRadius: '5px', cellChosen: 'rgb(138, 56, 245)', chipChosen: 'rgb(151, 71, 255)',
  paletteGrid: 352, palettePanelHeight: 129, lineStylePanelHeight: 44,
  picker: { w: 184, h: 310 }, fontSizes: { s: 12, m: 13, l: 14, xl: 16 },
}

const EMPTY_CANVAS = { x: 200, y: 820 }

async function readMenu(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const triggers = [...document.querySelectorAll('.systemsketch-appearance__trigger')]
    const shape = document.querySelector('.tl-shape')
    const painted = shape && shape.querySelector('[stroke]')
    const panel = document.querySelector('[data-testid^="systemsketch-appearance-panel-"]')
    const picker = document.querySelector('[data-testid="systemsketch-appearance-picker"]')
    const pill = document.querySelector('.systemsketch-selection-menu__bar')
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
    }
    const cell = (b) => ({
      value: b.dataset.value, checked: b.getAttribute('aria-checked') === 'true',
      ...box(b), radius: getComputedStyle(b).borderRadius, background: getComputedStyle(b).backgroundColor,
      fontSize: b.querySelector('.systemsketch-appearance__label')
        ? parseFloat(getComputedStyle(b.querySelector('.systemsketch-appearance__label')).fontSize) : null,
      check: b.querySelector('.systemsketch-appearance__check')
        ? getComputedStyle(b.querySelector('.systemsketch-appearance__check')).opacity : null,
    })
    const custom = panel && panel.querySelector('.systemsketch-appearance__custom')
    const disc = custom && custom.querySelector('.systemsketch-appearance__custom-disc')
    return JSON.stringify({
      controls: triggers.map((t) => t.dataset.control),
      labels: Object.fromEntries(triggers.map((t) => [t.dataset.control, t.getAttribute('aria-label')])),
      triggers: triggers.map((t) => ({
        control: t.dataset.control, kind: t.dataset.trigger, ...box(t),
        text: t.querySelector('.systemsketch-appearance__trigger-text')?.textContent ?? null,
        icon: t.querySelector('[data-icon]')?.dataset.icon ?? null,
      })),
      separators: [...document.querySelectorAll('.systemsketch-appearance__separator')].map(box),
      stroke: painted ? painted.getAttribute('stroke') : null,
      strokeWidth: painted ? painted.getAttribute('stroke-width') : null,
      opacity: shape ? getComputedStyle(shape).opacity : null,
      shapeType: shape ? shape.getAttribute('data-shape-type') : null,
      pill: box(pill),
      selectionSummary: document.querySelector(
        '.systemsketch-selection-count, .block-mini-menu__count, .block-mini-menu__scope',
      )?.textContent ?? null,
      panel: panel ? {
        control: panel.dataset.testid.replace('systemsketch-appearance-panel-', ''),
        layout: panel.dataset.layout,
        mode: panel.dataset.mode ?? null,
        ...box(panel),
        background: getComputedStyle(panel).backgroundColor,
        radius: getComputedStyle(panel).borderRadius,
        modeRow: [...panel.querySelectorAll('.systemsketch-appearance__mode .systemsketch-appearance__option')].map(cell),
        group: [...panel.querySelectorAll('.systemsketch-appearance__group .systemsketch-appearance__option')].map(cell),
        divider: box(panel.querySelector('.systemsketch-appearance__divider')),
        grid: box(panel.querySelector('.systemsketch-appearance__options')),
        options: [...panel.querySelectorAll('.systemsketch-appearance__options .systemsketch-appearance__option')].map(cell),
        custom: custom ? {
          ...box(custom), active: custom.hasAttribute('data-active'),
          checked: custom.getAttribute('aria-checked') === 'true',
          disc: disc ? getComputedStyle(disc).backgroundColor : null,
        } : null,
      } : null,
      picker: picker ? {
        ...box(picker),
        hex: picker.querySelector('.systemsketch-appearance__hex-input')?.value ?? null,
        hexFocused: document.activeElement === picker.querySelector('.systemsketch-appearance__hex-input'),
        sv: box(picker.querySelector('.systemsketch-appearance__sv')),
        alpha: box(picker.querySelector('[data-slider="alpha"]')),
        hue: box(picker.querySelector('[data-slider="hue"]')),
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

const geometry = {}

async function saveScreenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function frame(page, name) {
  await saveScreenshot(page, FRAMES[name])
  const reading = await readMenu(page)
  geometry[name] = {
    file: FRAMES[name].slice(ROOT.length + 1),
    pill: reading.pill,
    panel: reading.panel ? { x: reading.panel.x, y: reading.panel.y, w: reading.panel.w, h: reading.panel.h } : null,
    picker: reading.picker ? { x: reading.picker.x, y: reading.picker.y, w: reading.picker.w, h: reading.picker.h } : null,
    triggers: reading.triggers.map(({ control, kind, x, y, w, h }) => ({ control, kind, x, y, w, h })),
  }
}

const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance

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

    // 1. A shape gets what a shape can have, in FigJam's order, at FigJam's sizes.
    await drawAndSelect(page, { x: 560, y: 380 }, { x: 900, y: 540 }, 'r')
    const shape = await readMenu(page)
    assert.deepEqual(shape.controls, SHAPE_CONTROLS)
    assert.equal(shape.labels.geo, 'Shape, rectangle')
    assert.equal(shape.labels.dash, 'Line style, draw')
    assert.equal(shape.labels.size, 'Font size, medium')
    for (const trigger of shape.triggers) {
      const expected = trigger.control === 'color' ? FIGJAM.colorTrigger
        : trigger.kind === 'text' ? FIGJAM.textTrigger : FIGJAM.trigger
      assert.ok(near(trigger.w, expected), `${trigger.control} trigger is ${trigger.w}px, FigJam's is ${expected}`)
      assert.equal(trigger.h, 40)
    }
    assert.equal(shape.triggers.find((t) => t.control === 'size').text, 'Medium')
    assert.equal(shape.triggers.find((t) => t.control === 'font').icon, 'trigger/Typeface')
    assert.equal(shape.triggers.find((t) => t.control === 'dash').icon, 'trigger/Line style')
    // FigJam's hairlines: Shape | Color, Line style | Typeface, Font size | Alignment.
    assert.equal(shape.separators.length, 3)
    for (const separator of shape.separators) {
      assert.equal(separator.w, 1)
      const after = shape.triggers.find((t) => near(t.x, separator.x + 1 + FIGJAM.separatorClear))
      assert.ok(after, `a trigger should sit ${FIGJAM.separatorClear}px after each hairline`)
    }
    pass('a selected shape gets shape, paint and typography controls, in FigJam order and at FigJam\'s widths')

    // 2. The colour popover: FigJam's fill row stacked over the palette, above the pill.
    const colorOpen = await openControl(page, 'color')
    assert.equal(colorOpen.panel.layout, 'swatches')
    assert.equal(colorOpen.panel.mode, 'above')
    assert.equal(colorOpen.panel.background, 'rgb(30, 30, 30)')
    assert.equal(colorOpen.panel.radius, '13px')
    assert.deepEqual(colorOpen.panel.modeRow.map((c) => c.value),
      ['none', 'semi', 'solid', 'fill', 'pattern', 'lined-fill'])
    const gap = colorOpen.pill.y - (colorOpen.panel.y + colorOpen.panel.h)
    assert.ok(near(gap, 8), `popover should sit 8px above the pill, was ${gap}`)
    // 24px discs on a 32px pitch, inset 4px: the grid FigJam's 368px panel holds.
    assert.equal(colorOpen.panel.options.length, 21)
    assert.ok(colorOpen.panel.options.every((c) => c.w === FIGJAM.cell && c.h === FIGJAM.cell))
    assert.ok(near(colorOpen.panel.options[1].x - colorOpen.panel.options[0].x, 32))
    assert.ok(near(colorOpen.panel.grid.w, FIGJAM.paletteGrid), `palette grid ${colorOpen.panel.grid.w}`)
    assert.ok(near(colorOpen.panel.h, FIGJAM.palettePanelHeight), `palette panel ${colorOpen.panel.h}`)
    // The 22nd cell: 32px on the same pitch, idle.
    assert.ok(colorOpen.panel.custom, 'the palette has a Custom cell')
    assert.equal(colorOpen.panel.custom.w, 32)
    assert.equal(colorOpen.panel.custom.active, false)
    const lastSwatch = colorOpen.panel.options[20]
    assert.ok(near(colorOpen.panel.custom.x + 16, lastSwatch.x + 12 + 32), 'Custom sits one pitch after the last swatch')
    await frame(page, 'color')
    pass('the colour popover stacks the fill row over the palette at FigJam\'s pitch, 8px above the pill, with a Custom cell')

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
    assert.equal(filled.panel.modeRow.find((c) => c.value === 'solid').background, FIGJAM.chipChosen)
    assert.equal(filled.labels.color, 'Color, blue', 'filling must not disturb the colour')
    assert.equal(filled.stroke, paintedBefore, 'filling must not change the stroke either')
    pass('the fill row and the palette write different styles from one popover')

    // 5. Custom: the picker opens flush under the palette, centred on the cell,
    //    with the current colour's hex selected and ready to overtype.
    await clickSelector(page, '[data-testid="systemsketch-appearance-panel-color"] .systemsketch-appearance__custom')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-appearance-picker"]')`, 'the picker')
    await delay(300)
    const pickerOpen = await readMenu(page)
    assert.ok(pickerOpen.panel, 'the palette stays open under the picker')
    assert.equal(pickerOpen.picker.w, FIGJAM.picker.w)
    assert.equal(pickerOpen.picker.h, FIGJAM.picker.h)
    assert.ok(near(pickerOpen.picker.y, pickerOpen.panel.y + pickerOpen.panel.h),
      `picker top ${pickerOpen.picker.y} should meet the palette's bottom ${pickerOpen.panel.y + pickerOpen.panel.h}`)
    assert.ok(near(pickerOpen.picker.x + pickerOpen.picker.w / 2, pickerOpen.panel.custom.x + 16),
      'the picker is centred on the Custom cell')
    assert.equal(pickerOpen.picker.hex, '#3DADFF', 'seeded with the selection\'s colour, FigJam\'s blue')
    assert.equal(pickerOpen.picker.hexFocused, true)
    assert.equal(pickerOpen.picker.sv.w, 184)
    assert.equal(pickerOpen.picker.sv.h, 184)
    assert.equal(pickerOpen.picker.hue.w, 152)
    await frame(page, 'picker')
    pass('Custom opens FigJam\'s 184x310 picker flush under the palette, on the current colour')

    // 6. A typed hex becomes a named colour the document holds.
    await page.send('Input.insertText', { text: 'A3F2C1' })
    await key(page, 'Enter', 'Enter')
    await delay(300)
    const typed = await readMenu(page)
    assert.equal(typed.labels.color, 'Color, custom')
    assert.equal(typed.stroke, '#a3f2c1', 'the canvas paints the typed hex')
    assert.equal(typed.panel.custom.active, true)
    assert.equal(typed.panel.custom.checked, true)
    assert.equal(typed.panel.custom.disc, 'rgb(163, 242, 193)', 'the Custom cell shows the colour')
    assert.ok(typed.panel.options.every((o) => !o.checked), 'no palette swatch is ringed')
    assert.equal(typed.picker.hex, '#A3F2C1')
    await frame(page, 'custom')
    pass('typing a hex applies it as a custom colour: the shape, the trigger and the Custom cell all show it')

    // 7. Dragging on the square repaints live, and one drag is one undo step.
    const square = typed.picker.sv
    await drag(page, { x: square.x + 92, y: square.y + 92 }, { x: square.x + 170, y: square.y + 20 })
    const dragged = await readMenu(page)
    assert.notEqual(dragged.stroke, '#a3f2c1')
    assert.match(dragged.stroke, /^#[0-9a-f]{6}$/)
    assert.equal(dragged.picker.hex, dragged.stroke.toUpperCase())
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(300)
    assert.equal((await readMenu(page)).stroke, '#a3f2c1', 'one undo retracts the whole drag')
    pass('dragging the saturation/value square repaints the shape live, as one history step')

    // 8. The opacity slider is FigJam's alpha on tldraw's own opacity.
    const alpha = (await readMenu(page)).picker.alpha
    await drag(page, { x: alpha.x + alpha.w - 2, y: alpha.y + 8 }, { x: alpha.x + alpha.w / 2, y: alpha.y + 8 })
    const faded = await readMenu(page)
    assert.ok(near(parseFloat(faded.opacity), 0.5, 0.05), `opacity ${faded.opacity}`)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(300)
    assert.equal(parseFloat((await readMenu(page)).opacity), 1)
    pass('the opacity slider writes tldraw\'s shape opacity, and undoes as one step')

    // Close the picker by its own cell, then the palette by its trigger.
    await clickSelector(page, '[data-testid="systemsketch-appearance-panel-color"] .systemsketch-appearance__custom')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-appearance-picker"]')`, 'the picker to close')
    await closeControl(page, 'color')

    // 9. The hex is in the file, and the file opens on a fresh load.
    const deadline = Date.now() + 8000
    let saved = ''
    while (Date.now() < deadline) {
      saved = await readFile(board, 'utf8').catch(() => '')
      if (saved.includes('"custom-a3f2c1"')) break
      await delay(200)
    }
    assert.ok(saved.includes('"custom-a3f2c1"'), 'the saved board names the custom colour by its hex')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the product canvas again')
    await delay(800)
    await waitFor(page, `document.querySelector('.tl-shape')`, 'the reloaded shape')
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await shortcut(page, 'a', 'KeyA', 2)
    await waitFor(page, `document.querySelector('.systemsketch-appearance__trigger')`, 'the pill after reload')
    await delay(200)
    const reloaded = await readMenu(page)
    assert.equal(reloaded.labels.color, 'Color, custom')
    assert.equal(reloaded.stroke, '#a3f2c1', 'a fresh load registers the colour before parsing the file')
    pass('a board naming a custom colour saves the hex in the file and reopens painted with it')

    // 10. A shape's Line style is FigJam's labelled chips, and every dash the
    //     document can hold is offered — including tldraw's `draw` default.
    const dash = await openControl(page, 'dash')
    assert.equal(dash.panel.layout, 'chips')
    assert.deepEqual(dash.panel.options.map((o) => o.value), ['draw', 'solid', 'dashed', 'dotted', 'none'])
    assert.ok(dash.panel.options.find((o) => o.value === 'draw').checked,
      'a freshly drawn shape is `draw`, so the menu must be able to show it')
    assert.ok(dash.panel.options.every((o) => o.h === FIGJAM.cell && o.radius === FIGJAM.cellRadius))
    assert.equal(dash.panel.options.find((o) => o.value === 'draw').background, FIGJAM.cellChosen)
    await frame(page, 'chips')
    await pickOption(page, 'dash', 'dashed')
    assert.equal((await readMenu(page)).labels.dash, 'Line style, dashed')
    await closeControl(page, 'dash')
    pass('a shape\'s Line style is a row of labelled chips offering every dash the document can hold')

    // 11. Font size is FigJam's combobox: each rung listed at its own size,
    //     the chosen one checked; Typeface keeps its `Aa` trigger.
    const size = await openControl(page, 'size')
    assert.equal(size.panel.layout, 'list')
    assert.deepEqual(size.panel.options.map((o) => o.value), ['s', 'm', 'l', 'xl'])
    for (const row of size.panel.options) {
      assert.equal(row.fontSize, FIGJAM.fontSizes[row.value], `${row.value} row at ${row.fontSize}px`)
      assert.equal(row.check, row.checked ? '1' : '0', 'only the chosen row shows its check')
    }
    await frame(page, 'fontSize')
    await pickOption(page, 'size', 'l')
    const sized = await readMenu(page)
    assert.equal(sized.labels.size, 'Font size, large')
    assert.equal(sized.triggers.find((t) => t.control === 'size').text, 'Large')
    await closeControl(page, 'size')

    const font = await openControl(page, 'font')
    assert.deepEqual(font.panel.options.map((o) => o.value), ['sans', 'serif', 'mono', 'draw'])
    await pickOption(page, 'font', 'mono')
    const faced = await readMenu(page)
    assert.equal(faced.labels.font, 'Typeface, technical')
    assert.equal(faced.triggers.find((t) => t.control === 'font').icon, 'trigger/Typeface')
    await closeControl(page, 'font')
    pass('Font size lists each rung at its own size and names the chosen one on its trigger; Typeface keeps Aa')

    // 12. The shape picker turns one geo into another.
    const geo = await openControl(page, 'geo')
    assert.equal(geo.panel.layout, 'library')
    assert.ok(geo.panel.options.length >= 20)
    await frame(page, 'shape')
    await pickOption(page, 'geo', 'ellipse')
    assert.equal((await readMenu(page)).labels.geo, 'Shape, ellipse')
    await closeControl(page, 'geo')
    pass('the shape picker changes a rectangle into an ellipse')

    // 13. One click is one undo step.
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(300)
    assert.equal((await readMenu(page)).labels.geo, 'Shape, rectangle',
      'a single undo must retract exactly the last appearance change')
    pass('each appearance change is one history step')

    // 14. A connector gets one Line style holding weight beside dash, then
    //     routing and endpoints, instead of shape and fill.
    await clearBoard(page)
    await drawAndSelect(page, { x: 520, y: 420 }, { x: 940, y: 520 }, 'a')
    const connector = await readMenu(page)
    assert.deepEqual(connector.controls, CONNECTOR_CONTROLS)
    assert.equal(connector.shapeType, 'arrow')
    assert.equal(connector.triggers.find((t) => t.control === 'lineStyle').icon, 'trigger/Line style')
    const lineStyle = await openControl(page, 'lineStyle')
    assert.equal(lineStyle.panel.mode, 'beside')
    assert.deepEqual(lineStyle.panel.group.map((c) => c.value), ['s', 'm', 'l', 'xl'])
    assert.deepEqual(lineStyle.panel.options.map((o) => o.value), ['draw', 'solid', 'dashed', 'dotted', 'none'])
    assert.ok(near(lineStyle.panel.h, FIGJAM.lineStylePanelHeight), `line style panel ${lineStyle.panel.h}`)
    assert.equal(lineStyle.panel.divider.w, 1)
    assert.ok(near(lineStyle.panel.divider.h, lineStyle.panel.h), 'the hairline cuts the full panel height')
    assert.ok([...lineStyle.panel.group, ...lineStyle.panel.options]
      .every((c) => c.w === FIGJAM.cell && c.h === FIGJAM.cell && c.radius === FIGJAM.cellRadius))
    const widthBefore = lineStyle.strokeWidth
    await pickOption(page, 'lineStyle', 'xl')
    const weighted = await readMenu(page)
    assert.ok(weighted.panel, 'the popover stays open after a weight')
    assert.ok(weighted.panel.group.find((c) => c.value === 'xl').checked)
    assert.equal(weighted.panel.group.find((c) => c.value === 'xl').background, FIGJAM.cellChosen)
    assert.notEqual(weighted.strokeWidth, widthBefore, 'the weight repaints the stroke')
    await frame(page, 'lineStyle')
    await pickOption(page, 'lineStyle', 'dashed')
    assert.equal((await readMenu(page)).labels.lineStyle, 'Line style, dashed')
    await closeControl(page, 'lineStyle')
    pass('a connector\'s Line style holds weight beside dash in one 44px popover, and both write through')

    // 15. The line shape must sit between the two ends. Stock tldraw stores a
    //     straight arrow as an arc with zero bend; this control exposes that
    //     third visual state and translates it at the UI seam.
    assert.ok(
      connector.controls.indexOf('arrowheadStart') < connector.controls.indexOf('arrowKind') &&
        connector.controls.indexOf('arrowKind') < connector.controls.indexOf('arrowheadEnd'),
      'line shape belongs between start and end',
    )
    const routing = await openControl(page, 'arrowKind')
    assert.deepEqual(routing.panel.options.map((o) => o.value), ['elbow', 'curve', 'straight'])
    await frame(page, 'arrowRouting')
    await pickOption(page, 'arrowKind', 'straight')
    const straightArrow = JSON.parse(await evaluate(page, `(() => {
      const arrow = window.__systemsketch?.editor?.getOnlySelectedShape()
      return JSON.stringify({ type: arrow?.type, kind: arrow?.props?.kind, bend: arrow?.props?.bend })
    })()`))
    assert.deepEqual(straightArrow, { type: 'arrow', kind: 'arc', bend: 0 })
    assert.equal((await readMenu(page)).labels.arrowKind, 'Line shape, straight')
    const switchedArrowBounds = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch?.editor
      const arrow = editor?.getOnlySelectedShape()
      const bounds = arrow && editor.getShapePageBounds(arrow.id)
      return JSON.stringify(bounds ? editor.pageToScreen(bounds.center) : null)
    })()`))
    assert.ok(switchedArrowBounds, 'the switched arrow still has selected bounds')
    await mouse(page, 'mouseMoved', switchedArrowBounds.x, switchedArrowBounds.y)
    await delay(240)
    const switchedArrowHandles = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch?.editor
      const arrow = editor?.getOnlySelectedShape()
      return JSON.stringify(arrow ? (editor.getShapeHandles(arrow) ?? []).map((handle) => handle.id) : [])
    })()`))
    assert.ok(switchedArrowHandles.includes('middle'),
      'the transparent menu-dismiss layer must not hide the switched arrow control inside its rectangle')
    await saveScreenshot(page, FRAMES.arrowRoutingSwitched)
    await closeControl(page, 'arrowKind')
    pass('an arrow offers Elbowed, Curved, and Straight; switching preserves its in-rectangle control point')

    const ends = await openControl(page, 'arrowheadEnd')
    assert.ok(ends.panel.options.find((o) => o.value === 'triangle'))
    assert.ok(ends.panel.options.every((c) => c.w === FIGJAM.cell && c.radius === FIGJAM.cellRadius))
    await pickOption(page, 'arrowheadEnd', 'triangle')
    assert.equal((await readMenu(page)).labels.arrowheadEnd, 'End point, triangle')
    await closeControl(page, 'arrowheadEnd')
    await frame(page, 'connector')
    pass('a connector gets routing and endpoints, and an endpoint applies')

    // 16. A disagreeing selection says so rather than showing a wrong value.
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

    // 17. A Block alongside a shape must not put the shape's paint out of reach,
    //     and the pill must say what it is: the whole selection, with the
    //     Block-only group marked as the Blocks'.
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
    assert.equal(blockOnly.selectionSummary, null, 'a Block selection has no count summary')

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
    assert.equal(mixedKinds.selectionSummary, null,
      'a mixed selection has no count summary in the contextual menu')
    await frame(page, 'mixed')
    await openControl(page, 'color')
    await pickOption(page, 'color', 'violet')
    assert.equal((await readMenu(page)).labels.color, 'Color, violet')
    await closeControl(page, 'color')
    pass('a Block selected beside a shape keeps the shape\'s appearance reachable without a count summary')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    // The run's own record, for the report builder. Written last, so it exists
    // only if every check above actually passed — a report can then prove its
    // verdicts happened rather than restating labels from source.
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 1))
    await writeFile(GEOMETRY, JSON.stringify(geometry, null, 1))

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
    const capture = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
    if (capture) await writeFile(join(ROOT, 'docs', 'appearance-menu-failure.png'), Buffer.from(capture.data, 'base64'))
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
