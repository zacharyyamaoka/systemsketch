#!/usr/bin/env node
/**
 * Real-browser proof for the reported bug and its fix.
 *
 * Zach, 2026-09-06: "I need the option to control the line thickness of the
 * rectangle. Right now its seems linked to the thickness of the text which is
 * bad!!!" — stock tldraw derives a geo shape's stroke width AND its label font
 * size from one `size` rung, so the Font size list was silently the thickness
 * control too. Two things have to be true afterwards, and both are checked
 * here against the PAINTED canvas, never the menu alone:
 *
 *   1. There is a thickness control, and each rung paints its own width.
 *   2. Changing the font size no longer moves the outline.
 *
 * Then the same registered control is proven on a connector (beside, labels
 * off) and in the composition lab, where every lever is pressable.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

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
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const RESULTS = join(ROOT, 'docs', 'assets', 'line-thickness-results-2026-09-06.json')

const FRAMES = {
  shapeStack: join(ROOT, 'docs', 'assets', 'line-thickness-1-shape-stack-2026-09-06.png'),
  thick: join(ROOT, 'docs', 'assets', 'line-thickness-2-thick-2026-09-06.png'),
  fontSize: join(ROOT, 'docs', 'assets', 'line-thickness-3-font-size-holds-2026-09-06.png'),
  connector: join(ROOT, 'docs', 'assets', 'line-thickness-4-connector-row-2026-09-06.png'),
  lab: join(ROOT, 'docs', 'assets', 'menu-lab-1-shape-2026-09-06.png'),
  labConnector: join(ROOT, 'docs', 'assets', 'menu-lab-2-connector-2026-09-06.png'),
  labComposed: join(ROOT, 'docs', 'assets', 'menu-lab-3-composed-2026-09-06.png'),
  settings: join(ROOT, 'docs', 'assets', 'menu-lab-4-settings-2026-09-06.png'),
}

const EMPTY_CANVAS = { x: 200, y: 820 }

async function shot(page, path) {
  await mkdir(dirname(path), { recursive: true })
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function read(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const shape = document.querySelector('.tl-shape')
    const painted = shape && shape.querySelector('[stroke]')
    const label = shape && shape.querySelector('.tl-rich-text, .tl-text-content')
    const panel = document.querySelector('[data-testid^="systemsketch-appearance-panel-"]')
    const section = (id) => panel
      ? [...panel.querySelectorAll('.systemsketch-appearance__mode[data-mode-control="' + id + '"] .systemsketch-appearance__option')]
        .map((b) => ({ value: b.dataset.value, checked: b.getAttribute('aria-checked') === 'true' }))
      : []
    return JSON.stringify({
      strokeWidth: painted ? Number(painted.getAttribute('stroke-width')) : null,
      labelFontSize: label ? parseFloat(getComputedStyle(label).fontSize) : null,
      shapeType: shape ? shape.getAttribute('data-shape-type') : null,
      panelControl: panel ? panel.dataset.testid.replace('systemsketch-appearance-panel-', '') : null,
      panelMode: panel ? (panel.dataset.mode ?? null) : null,
      sections: panel
        ? [...panel.querySelectorAll('.systemsketch-appearance__mode')].map((s) => s.dataset.modeControl)
        : [],
      thicknessStacked: section('strokeWidth'),
      lineStyleStacked: section('lineStyle'),
      thicknessBeside: panel
        ? [...panel.querySelectorAll('.systemsketch-appearance__group .systemsketch-appearance__option')]
          .map((b) => ({
            value: b.dataset.value,
            checked: b.getAttribute('aria-checked') === 'true',
            hasLabel: Boolean(b.querySelector('.systemsketch-appearance__label')),
          }))
        : [],
    })
  })()`))
}

/**
 * Click a real element with a real mouse event.
 *
 * The lab's lever list scrolls, and most rows start below the fold, so the
 * element is brought into view first — a click at a rect that is off-screen
 * lands on whatever is actually at those coordinates, which is how this
 * silently "passed" nothing the first time it ran.
 */
async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'null'
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)])
  })()`))
  assert.ok(point, `missing ${selector}`)
  await delay(120)
  const settled = JSON.parse(await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    const r = el.getBoundingClientRect()
    return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)])
  })()`))
  await clickAt(page, settled[0], settled[1])
  await delay(220)
}

async function openControl(page, control) {
  await clickSelector(page, `.systemsketch-appearance__trigger[data-control="${control}"]`)
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-appearance-panel-${control}"]')`,
    `the ${control} popover`)
  await delay(180)
  return read(page)
}

async function pick(page, control, value) {
  await clickSelector(page,
    `[data-testid="systemsketch-appearance-panel-${control}"] `
    + `.systemsketch-appearance__option[data-value="${value}"]`)
  await delay(300)
}

async function drawAndSelect(page, from, to, toolKey) {
  await key(page, toolKey, `Key${toolKey.toUpperCase()}`)
  await drag(page, from, to)
  await delay(220)
  await key(page, 'Escape', 'Escape')
  await drag(page,
    { x: Math.min(from.x, to.x) - 60, y: Math.min(from.y, to.y) - 60 },
    { x: Math.max(from.x, to.x) + 60, y: Math.max(from.y, to.y) + 60 })
  await waitFor(page, `document.querySelector('.systemsketch-appearance__trigger')`,
    'the appearance controls')
  await delay(220)
}

/** What the canvas actually painted, written out for the report to quote. */
const measured = { checks: [], consoleErrors: [] }

async function main() {
  const { pass: record, report } = makeChecklist()
  const pass = (label) => { measured.checks.push(label); record(label) }
  const app = await startApp({ label: 'line-thickness' })
  try {
    await openApp(app.page, app.port, '')
    await waitFor(app.page, 'document.querySelector(".tl-canvas")', 'the canvas')
    await delay(700)

    // 1. A rectangle with a label: the exact shape from the report.
    await drawAndSelect(app.page, { x: 480, y: 320 }, { x: 900, y: 560 }, 'r')
    await key(app.page, 'Enter', 'Enter')
    await delay(300)
    await typeSlowly(app.page, 'Title')
    await key(app.page, 'Escape', 'Escape')
    await delay(400)
    await waitFor(app.page,
      `document.querySelector('.systemsketch-appearance__trigger[data-control="size"]')`,
      'the Font size control, which appears only once the shape carries text')
    const fresh = await read(app.page)
    assert.equal(fresh.shapeType, 'geo')
    assert.equal(fresh.strokeWidth, 3.5, 'a fresh rectangle paints tldraw\'s `m` width')
    measured.freshStrokeWidth = fresh.strokeWidth

    // 2. The Line style popover now stacks three sections: thickness over
    //    line style over the palette — the layout Zach drew.
    const stroke = await openControl(app.page, 'strokeColor')
    assert.deepEqual(stroke.sections, ['strokeWidth', 'lineStyle'],
      'thickness sits above line style, both above the palette')
    assert.deepEqual(stroke.thicknessStacked.map((cell) => cell.value),
      ['thin', 'medium', 'thick'])
    assert.ok(stroke.thicknessStacked.find((cell) => cell.value === 'medium').checked,
      'an untouched rectangle reads Medium — the width it is already painted at')
    await shot(app.page, FRAMES.shapeStack)
    pass('the shape Stroke popover stacks thickness over line style over the palette')

    // 3. Each rung paints its own width, read off the canvas.
    await pick(app.page, 'strokeColor', 'thick')
    const thick = await read(app.page)
    assert.equal(thick.strokeWidth, 7, 'thick paints double medium')
    measured.rungs = { thick: thick.strokeWidth }
    assert.ok(thick.thicknessStacked.find((cell) => cell.value === 'thick').checked)
    await shot(app.page, FRAMES.thick)
    await pick(app.page, 'strokeColor', 'thin')
    measured.rungs.thin = (await read(app.page)).strokeWidth
    assert.equal(measured.rungs.thin, 2, 'thin paints tldraw\'s own `s` width')
    await pick(app.page, 'strokeColor', 'thick')
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    pass('each thickness rung repaints the rectangle at its own width')

    // 4. THE REPORTED BUG. Font size must move the type and nothing else.
    const beforeType = await read(app.page)
    await openControl(app.page, 'size')
    await pick(app.page, 'size', 'xl')
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="size"]')
    const afterType = await read(app.page)
    assert.ok(afterType.labelFontSize > beforeType.labelFontSize,
      'Extra large must actually grow the label')
    assert.equal(afterType.strokeWidth, beforeType.strokeWidth,
      'and must leave the outline exactly where it was — the reported bug')
    // Stock tldraw would have painted `xl` at 10; the pin is what stops it.
    assert.equal(afterType.strokeWidth, 7)
    measured.fontSize = {
      beforeLabelPx: beforeType.labelFontSize,
      afterLabelPx: afterType.labelFontSize,
      beforeStrokeWidth: beforeType.strokeWidth,
      afterStrokeWidth: afterType.strokeWidth,
      stockWouldHavePainted: 10,
    }
    const reopened = await openControl(app.page, 'strokeColor')
    assert.ok(reopened.thicknessStacked.find((cell) => cell.value === 'thick').checked,
      'and the thickness row still reads what it read before the type change')
    await shot(app.page, FRAMES.fontSize)
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    pass('changing the font size grows the label and leaves the outline alone')

    // 5. A newly drawn shape inherits the chosen thickness, the way colour and
    //    line style already do.
    await clickAt(app.page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    await drawAndSelect(app.page, { x: 1000, y: 320 }, { x: 1240, y: 460 }, 'r')
    assert.equal((await read(app.page)).strokeWidth, 7,
      'the next rectangle is drawn at the thickness last chosen')
    pass('a chosen thickness carries to the next shape drawn')

    // 6. The SAME registered control on a connector: beside, labels off.
    await clickAt(app.page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await shortcut(app.page, 'a', 'KeyA', 2)
    await key(app.page, 'Delete', 'Delete')
    await delay(250)
    await drawAndSelect(app.page, { x: 520, y: 420 }, { x: 940, y: 520 }, 'a')
    const connector = await openControl(app.page, 'lineStyle')
    assert.equal(connector.shapeType, 'arrow')
    assert.equal(connector.panelMode, 'beside')
    assert.deepEqual(connector.thicknessBeside.map((cell) => cell.value),
      ['thin', 'medium', 'thick'], 'the connector row is the shape\'s rungs')
    assert.ok(connector.thicknessBeside.every((cell) => !cell.hasLabel),
      'with the labels hidden, as Zach asked')
    assert.deepEqual(connector.sections, [], 'and nothing stacked above it')
    await pick(app.page, 'lineStyle', 'thin')
    measured.connector = {
      rungs: connector.thicknessBeside.map((cell) => cell.value),
      labelled: connector.thicknessBeside.some((cell) => cell.hasLabel),
      strokeWidth: (await read(app.page)).strokeWidth,
    }
    assert.equal(measured.connector.strokeWidth, 2, 'and it writes through to the arrow')
    await shot(app.page, FRAMES.connector)
    pass('a connector gets the same thickness control beside its line styles, labels off')

    // 7. The Settings entry point — the lab where a person will actually
    //    find it, inside the real app rather than at a URL they must know.
    await clickSelector(app.page, '[data-testid="main-menu.button"]')
    await waitFor(app.page, `document.querySelector('[data-testid="main-menu.settings"]')`,
      'the Settings menu item')
    await clickSelector(app.page, '[data-testid="main-menu.settings"]')
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`,
      'the Settings dialog')
    await clickSelector(app.page, '[data-testid="systemsketch-settings-category-menu-lab"]')
    await waitFor(app.page, `document.querySelector('[data-testid="menu-lab-menu"]')`,
      'the composed menu inside Settings')
    await delay(500)
    const settingsLab = JSON.parse(await evaluate(app.page, `(() => {
      const shell = document.querySelector('[data-testid="menu-lab-shell"]')
      const dialog = document.querySelector('[data-testid="systemsketch-settings-dialog"]')
      return JSON.stringify({
        insideDialog: Boolean(dialog && shell && dialog.contains(shell)),
        // The embedded board must not mount a second editor beside the app's.
        canvases: document.querySelectorAll('.tl-canvas').length,
        triggers: [...document.querySelectorAll('[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger')]
          .map((t) => t.dataset.control),
      })
    })()`))
    assert.equal(settingsLab.insideDialog, true, 'the lab renders inside the Settings dialog')
    assert.equal(settingsLab.canvases, 1,
      'the embedded board uses the app\'s editor rather than mounting a second one')
    assert.ok(settingsLab.triggers.includes('strokeColor'))
    // A popover opened from inside the dialog must actually be reachable —
    // a dialog is a scroll container, and tldraw portals its popovers out.
    await clickSelector(app.page,
      '[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(app.page,
      `document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')`,
      'the lab popover, opened inside Settings')
    const settingsPopover = JSON.parse(await evaluate(app.page, `(() => {
      const panel = document.querySelector('[data-testid="systemsketch-appearance-panel-strokeColor"]')
      const rect = panel.getBoundingClientRect()
      const middle = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return JSON.stringify({
        onScreen: rect.x >= 0 && rect.y >= 0
          && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight,
        // Nothing may be painted over it: the point in its middle has to be
        // the panel or something inside it.
        onTop: Boolean(middle && panel.contains(middle)),
        sections: [...panel.querySelectorAll('.systemsketch-appearance__mode')]
          .map((section) => section.dataset.modeControl),
      })
    })()`))
    assert.equal(settingsPopover.onScreen, true, 'the popover is not clipped out of the dialog')
    assert.equal(settingsPopover.onTop, true, 'and nothing is painted over it')
    assert.deepEqual(settingsPopover.sections, ['strokeWidth', 'lineStyle'])
    await shot(app.page, FRAMES.settings)
    measured.settings = settingsLab
    pass('Settings > Menu lab renders the real board, on the app\'s own editor')

    await clickSelector(app.page, '.systemsketch-settings__header .tlui-button')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`,
      'the Settings dialog to close')
    await delay(300)

    // 8. The composition lab: the levers themselves.
    await openApp(app.page, app.port, '?menu-lab')
    await waitFor(app.page, 'document.querySelector("[data-testid=\\"menu-lab\\"]")', 'the lab')
    await waitFor(app.page, 'document.querySelector("[data-testid=\\"menu-lab-menu\\"]")',
      'the composed menu')
    await delay(600)
    const labShape = JSON.parse(await evaluate(app.page, `(() => JSON.stringify({
      order: document.querySelector('[data-testid="menu-lab-order"]').textContent,
      groups: document.querySelector('[data-testid="menu-lab-groups"]').textContent,
      triggers: [...document.querySelectorAll('[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger')]
        .map((t) => t.dataset.control),
    }))()`))
    assert.ok(labShape.triggers.includes('strokeColor'))
    assert.ok(!labShape.triggers.includes('strokeWidth'),
      'stacked controls are folded into their host, not emitted beside it')
    await shot(app.page, FRAMES.lab)
    pass('the lab composes the shape surface out of levers, using the real renderer')

    await clickSelector(app.page, '[data-testid="menu-lab-preset-connector"]')
    await delay(400)
    const labConnector = JSON.parse(await evaluate(app.page, `(() => JSON.stringify({
      triggers: [...document.querySelectorAll('[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger')]
        .map((t) => t.dataset.control),
      recipe: document.querySelector('[data-testid="menu-lab-recipe"]').textContent,
    }))()`))
    assert.deepEqual(labConnector.triggers,
      ['color', 'lineStyle', 'arrowheadStart', 'lineShape', 'arrowheadEnd'])
    measured.lab = { shapeTriggers: labShape.triggers, connectorTriggers: labConnector.triggers }
    assert.ok(labConnector.recipe.includes("items: ['arrowheadStart', 'lineShape', 'arrowheadEnd']"),
      'the lab prints the recipe literal its levers describe')
    await shot(app.page, FRAMES.labConnector)
    pass('switching preset recomposes the same registry into the connector surface')

    // 9. A lever Zach can press: add a control, then hide its labels.
    await clickSelector(app.page, '[data-testid="menu-lab-include-geo"]')
    await delay(300)
    const added = JSON.parse(await evaluate(app.page, `(() => JSON.stringify(
      [...document.querySelectorAll('[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger')]
        .map((t) => t.dataset.control)))()`))
    assert.ok(added.includes('geo'), 'ticking a control adds it to the composed menu')
    // A native setter plus a bubbling change is what React's synthetic system
    // actually listens for; assigning `.value` alone is swallowed by its
    // value tracker and the lever appears to do nothing.
    await evaluate(app.page, `(() => {
      const select = document.querySelector('[data-testid="menu-lab-stack-geo"]')
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype, 'value').set
      setter.call(select, 'beside')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await delay(300)
    const stacked = JSON.parse(await evaluate(app.page, `(() => JSON.stringify(
      [...document.querySelectorAll('[data-testid="menu-lab-menu"] .systemsketch-appearance__trigger')]
        .map((t) => t.dataset.control)))()`))
    assert.ok(!stacked.includes('geo'),
      'and setting stack folds it into the next control instead')
    // Last in the list, it has nothing to fold into — so the lab says so
    // rather than letting the control silently vanish.
    const dangling = await evaluate(app.page,
      `(() => document.querySelector('[data-testid="menu-lab-dangling"]')?.textContent ?? '')()`)
    assert.ok(dangling.includes('geo'),
      'a control stacked onto nothing is named, not silently dropped')
    measured.lab.leverAdded = added
    measured.lab.leverStacked = stacked
    await shot(app.page, FRAMES.labComposed)
    pass('a lever added a control and then folded it into its neighbour, live')

    measured.consoleErrors = await localConsoleErrors(app.page)
    const errors = measured.consoleErrors
    assert.deepEqual(errors, [], `console errors: ${JSON.stringify(errors)}`)
    pass('the physical journey produced zero local console errors')

    await writeFile(RESULTS, `${JSON.stringify(measured, null, 2)}\n`)
    report('line thickness')
    for (const path of Object.values(FRAMES)) console.log(`  ${path}`)
  } finally {
    app.close()
  }
}

await main()
