#!/usr/bin/env node
/**
 * Real-browser proof for the converged review surface.
 *
 * `compare_modal_smoke.mjs` proves the base modal still works. This one proves
 * what the convergence added, and it is deliberately adversarial about each —
 * a check that only asserts an element EXISTS proves markup, not behaviour, so
 * every claim here is read off computed style, geometry, DOM order or the live
 * tldraw camera rather than off a class name.
 *
 *   1. a selected CABLE gets a shadow under its stroke, not a box round it
 *   2. two real table layouts — by-element and flat — both over real rows
 *   3. the shared tab strip hugs its content, in Compare AND in a Block
 *   4. the modal's bottom row: modes · slider · Fullscreen
 *   5. the fullscreen bar is at the BOTTOM: vs · stepper · slider + Return
 *   6. Modified is blue, the ink toggle works, and the return restores state
 *
 * Run with:
 *   node tests/compare_converged_smoke.mjs
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT_DIR = join(ROOT, 'docs', 'assets')
const BOARD = join(ROOT, 'sketches', 'review', 'diff-review-modal.systemsketch')
const { checks, pass } = makeChecklist()

/** The rewired cable in the fixture, and the Block most rows hang off. */
const CABLE_CHANGE = 'cable:shape:cable_xm'
const CABLE_SHAPE = 'shape:cable_xm'
const BLOCK_ELEMENT = 'block:shape:predict'

async function capture(page, name) {
  await ensureDir(SHOT_DIR)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOT_DIR, name), Buffer.from(shot.data, 'base64'))
}

/** Parse `rgb(r, g, b)` / `rgba(...)` into channels. */
const RGB = `((value) => {
  const parts = String(value).match(/[\\d.]+/g) ?? []
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a: parts[3] === undefined ? 1 : Number(parts[3]) }
})`

async function setBlend(page, value) {
  await evaluate(page, `(() => {
    const slider = document.querySelector('[data-testid="compare-blend"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(slider, '${value}')
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  await delay(200)
}

async function main() {
  const app = await startApp({
    label: 'compare-converged',
    build: 'track-diff-ui-converged-persistent-bar',
    width: 1600,
    height: 1000,
    allowSourceRoot: true,
  })

  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(app.page, `!!window.__systemsketch?.editor`, 'editor mounted')
    await waitFor(
      app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'block').length === 4`,
      'fixture board loaded',
    )

    await clickElement(app.page, '[data-testid="compare-open"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-dialog"]')`, 'modal')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-dialog"] .tl-container').length === 2`,
      'both boards mounted',
    )
    await delay(1400)
    pass('the converged modal opens with two real SystemSketch renders')

    // ---- 1 · Figma's by-element layout ------------------------------------
    const figmaDefault = await evaluate(app.page, `(() => {
      const list = document.querySelector('[data-testid="compare-element-list"]')
      const empty = document.querySelector('[data-testid="compare-figma-empty"]')
      return {
        layoutPresent: !!document.querySelector('[data-testid="compare-figma-layout"]'),
        emptyCopy: empty?.textContent?.trim() ?? null,
        tablePresent: !!document.querySelector('[data-testid="compare-property-table"]'),
        elements: Array.from(list?.querySelectorAll('button') ?? []).map((button) => ({
          id: button.dataset.testid.replace('compare-element-', ''),
          status: button.dataset.status,
          name: button.querySelector('.systemsketch-review__element-name').textContent,
          badge: button.querySelector('.systemsketch-review__element-status').textContent,
        })),
      }
    })()`)
    assert.equal(figmaDefault.layoutPresent, true, 'the by-element layout is the default')
    assert.equal(
      figmaDefault.emptyCopy,
      'Select an edited element to compare changes',
      `Figma's own empty-state copy, verbatim — got "${figmaDefault.emptyCopy}"`,
    )
    assert.equal(figmaDefault.tablePresent, false, 'nothing selected means no table, not an empty grid')
    pass(`nothing selected shows Figma's own sentence, not an empty grid`)

    // The list must be ELEMENTS — Blocks and cables — never ports and never
    // properties. That is the whole point of the regrouping.
    assert.ok(figmaDefault.elements.length >= 2, `elements listed: ${figmaDefault.elements.length}`)
    const badges = new Set(figmaDefault.elements.map((element) => element.badge))
    assert.ok(
      [...badges].every((badge) => ['Added', 'Edited', 'Removed'].includes(badge)),
      `element badges are Figma's vocabulary, got ${[...badges].join(', ')}`,
    )
    const names = figmaDefault.elements.map((element) => element.name)
    assert.ok(
      names.every((name) => !name.includes('·')),
      `an element name is a thing on the board, never a property path: ${names.join(' | ')}`,
    )
    pass(`the left list is elements with Added/Edited/Removed badges (${names.join(', ')})`)
    await capture(app.page, 'converged-figma-empty.png')

    // Picking an element scopes the right side to ONLY that element.
    await clickElement(app.page, `[data-testid="compare-element-${BLOCK_ELEMENT}"]`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="compare-property-table"]')?.dataset.layout === 'figma'`,
      'scoped table',
    )
    const scoped = await evaluate(app.page, `(() => {
      const table = document.querySelector('[data-testid="compare-property-table"]')
      const rows = Array.from(table.querySelectorAll('tbody tr[data-change-id]'))
      return {
        headers: Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent),
        elementIds: [...new Set(rows.map((row) => row.dataset.elementId))],
        properties: rows.map((row) => row.querySelector('.systemsketch-review__property-name').textContent),
        rows: rows.length,
      }
    })()`)
    assert.deepEqual(
      scoped.headers,
      ['Property', 'Previous', 'Current'],
      `the scoped table drops the element column: ${scoped.headers.join(' | ')}`,
    )
    assert.deepEqual(
      scoped.elementIds,
      [BLOCK_ELEMENT],
      `every row belongs to the picked element, got ${scoped.elementIds.join(', ')}`,
    )
    assert.ok(scoped.rows >= 3, `the picked element has real rows: ${scoped.rows}`)
    assert.ok(
      scoped.properties.every((property) => property && property.length > 0),
      `every row names a property: ${scoped.properties.join(' | ')}`,
    )
    pass(`picking an element scopes the table to it (${scoped.rows} rows: ${scoped.properties.join(', ')})`)
    await capture(app.page, 'converged-figma-selected.png')

    // ---- 2 · the flat Element/Property layout ------------------------------
    await clickElement(app.page, '[data-testid="compare-layout-columns"]')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="compare-property-table"]')?.dataset.layout === 'columns'`,
      'flat layout',
    )
    const flat = await evaluate(app.page, `(() => {
      const table = document.querySelector('[data-testid="compare-property-table"]')
      const rows = Array.from(table.querySelectorAll('tbody tr[data-change-id]'))
      return {
        headers: Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent),
        states: rows.map((row) => row.dataset.state),
        cells: rows.map((row) => ({
          element: row.querySelector('.systemsketch-review__layer-name').textContent,
          property: row.querySelector('.systemsketch-review__property-name').textContent,
        })),
      }
    })()`)
    assert.deepEqual(
      flat.headers,
      ['Element', 'Property', 'Previous', 'Current'],
      `four columns, element first: ${flat.headers.join(' | ')}`,
    )
    const flatStates = new Set(flat.states)
    assert.ok(flatStates.has('added') && flatStates.has('removed') && flatStates.has('modified'),
      `all three states present: ${[...flatStates].join(', ')}`)
    // The element must be its OWN column now, never folded back into a path.
    assert.ok(
      flat.cells.every((cell) => cell.element && !cell.element.includes('·')),
      `element column carries a plain element name: ${flat.cells.map((c) => c.element).join(' | ')}`,
    )
    const portRow = flat.cells.find((cell) => cell.property === 'threshold')
    assert.ok(portRow, `a port reads as a property of its Block: ${JSON.stringify(flat.cells)}`)
    assert.equal(portRow.element, 'run_predict', "a port's element is its host Block, never the port")

    /*
     * Every cell must actually SIT under its own header.
     *
     * This is geometry rather than content on purpose: `display: flex` on a
     * `<td>` takes it out of the table's column layout, and the property text
     * rendered on its own line beneath the Element column — present, correct,
     * readable by every content assertion above, and in the wrong place. Only a
     * screenshot or a coordinate catches that.
     */
    const columns = await evaluate(app.page, `(() => {
      const table = document.querySelector('[data-testid="compare-property-table"]')
      const headers = Array.from(table.querySelectorAll('thead th'))
        .map((th) => ({ label: th.textContent, left: th.getBoundingClientRect().left }))
      const row = table.querySelector('tbody tr[data-change-id]')
      const cells = Array.from(row.children).map((cell) => cell.getBoundingClientRect().left)
      return { headers, cells, sameRow: row.children.length }
    })()`)
    assert.equal(columns.sameRow, 4, `the row has four cells, one per header: ${columns.sameRow}`)
    for (const [index, header] of columns.headers.entries()) {
      const drift = Math.abs(columns.cells[index] - header.left)
      assert.ok(
        drift < 6,
        `the ${header.label} cell sits under its header (drifted ${drift.toFixed(0)}px)`,
      )
    }
    pass('every cell sits under its own column header — no cell escapes the table layout')
    pass(`the flat layout is Element · Property · Previous · Current (${flat.cells.length} rows, port grouped under its Block)`)
    await capture(app.page, 'converged-flat-columns.png')

    // ---- 3 · Modified is blue (measured, not asserted from a token name) ---
    const badgeColours = await evaluate(app.page, `(() => {
      const read = (state) => {
        const badge = document.querySelector('.systemsketch-review__state[data-state="' + state + '"]')
        return badge ? getComputedStyle(badge).borderTopColor : null
      }
      return { added: read('added'), removed: read('removed'), modified: read('modified') }
    })()`)
    const modified = await evaluate(app.page, `${RGB}(${JSON.stringify(badgeColours.modified)})`)
    const removed = await evaluate(app.page, `${RGB}(${JSON.stringify(badgeColours.removed)})`)
    assert.ok(
      modified.b > modified.r && modified.b > modified.g,
      `Modified must be blue-dominant, measured ${JSON.stringify(modified)}`,
    )
    const distance = Math.hypot(modified.r - removed.r, modified.g - removed.g, modified.b - removed.b)
    assert.ok(distance > 120, `Modified must be far from Removed in RGB, measured ${distance.toFixed(0)}`)
    pass(`Modified is blue (${modified.r},${modified.g},${modified.b}), ${distance.toFixed(0)} from Removed`)

    // ---- 4 · the git-highlight toggle, still both layers, still default off -
    const readInk = `(() => {
      const row = document.querySelector('tr[data-change-id="block:shape:predict"]')
      const cell = row.querySelector('.systemsketch-review__value[data-side="current"]')
      const mark = cell.querySelector('mark[data-token="added"]')
      return {
        cell: getComputedStyle(cell).backgroundColor,
        mark: getComputedStyle(mark).backgroundColor,
        text: cell.textContent,
      }
    })()`
    const toggleDefault = await evaluate(app.page, `(() => ({
      checked: document.querySelector('[data-testid="compare-highlight-checkbox"]').checked,
      stamp: document.querySelector('[data-testid="compare-property-table"]').dataset.gitHighlight,
    }))()`)
    assert.equal(toggleDefault.checked, false, 'the toggle defaults OFF')
    assert.equal(toggleDefault.stamp, 'off', 'the table is stamped off')
    const inkOff = await evaluate(app.page, readInk)
    const cellOff = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOff.cell)})`)
    const markOff = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOff.mark)})`)
    assert.equal(cellOff.a, 0, `off: the cell wash is transparent, got ${inkOff.cell}`)
    assert.equal(markOff.a, 0, `off: the run fill is transparent, got ${inkOff.mark}`)
    assert.ok(inkOff.text.includes('run_predict'), `the value still reads in full: ${inkOff.text}`)
    pass('word-level ink still defaults OFF, and off means both layers gone but the value intact')
    await capture(app.page, 'converged-highlight-off.png')

    await clickElement(app.page, '[data-testid="compare-highlight-checkbox"]')
    await delay(250)
    const inkOn = await evaluate(app.page, readInk)
    const cellOn = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOn.cell)})`)
    const markOn = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOn.mark)})`)
    assert.ok(cellOn.a > 0 && markOn.a > 0, `on: both layers paint (${inkOn.cell} / ${inkOn.mark})`)
    assert.ok(markOn.a > cellOn.a, 'the run is stronger than the wash it sits in')
    pass(`toggling on restores both layers — wash a=${cellOn.a}, run a=${markOn.a}`)
    await capture(app.page, 'converged-highlight-on.png')

    // ---- 5 · the shared tab strip hugs its content ------------------------
    /*
     * The defect was `grid-template-columns: 1fr 1fr` on `.block-inspector__tabs`,
     * which stretched two short labels across a whole panel. The fix had to land
     * on the SHARED rule, so this checks the stylesheet itself and then proves
     * the effect in two different consumers.
     */
    const sharedRule = await evaluate(app.page, `(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules
        try { rules = Array.from(sheet.cssRules) } catch { continue }
        for (const rule of rules) {
          if (rule.selectorText !== '.block-inspector__tabs') continue
          return {
            display: rule.style.display,
            gridColumns: rule.style.gridTemplateColumns,
          }
        }
      }
      return null
    })()`)
    assert.ok(sharedRule, 'the shared .block-inspector__tabs rule is loaded')
    assert.equal(sharedRule.display, 'flex', `the strip is flex, not grid: ${sharedRule.display}`)
    assert.equal(
      sharedRule.gridColumns,
      '',
      `the 1fr 1fr stretch is gone from the SHARED rule, got "${sharedRule.gridColumns}"`,
    )
    pass('the stretch is fixed on the shared .block-inspector__tabs rule, not patched per caller')

    const compareTabs = await evaluate(app.page, `(() => {
      const strip = document.querySelector('[data-testid="compare-dialog"] .block-inspector__tabs')
      const buttons = Array.from(strip.querySelectorAll('[role="tab"]'))
      const stripBox = strip.getBoundingClientRect()
      const span = buttons[buttons.length - 1].getBoundingClientRect().right - buttons[0].getBoundingClientRect().left
      return {
        stripWidth: stripBox.width,
        tabsWidth: span,
        active: buttons.filter((b) => b.classList.contains('is-active')).map((b) => b.textContent),
        role: strip.getAttribute('role'),
      }
    })()`)
    assert.equal(compareTabs.role, 'tablist', 'still a real tablist')
    assert.deepEqual(compareTabs.active, ['Properties'], 'still exactly one is-active tab')
    assert.ok(
      compareTabs.tabsWidth < compareTabs.stripWidth * 0.6,
      `two tabs must hug, not span the panel — ${compareTabs.tabsWidth.toFixed(0)}px of ${compareTabs.stripWidth.toFixed(0)}px`,
    )
    pass(`the Compare tabs hug their labels (${compareTabs.tabsWidth.toFixed(0)}px in a ${compareTabs.stripWidth.toFixed(0)}px strip)`)

    // ---- 6 · the cable's shadow, not a box --------------------------------
    await clickElement(app.page, '[data-testid="compare-layout-figma"]')
    await delay(300)
    await clickElement(app.page, `[data-testid="compare-element-${CABLE_CHANGE}"]`)
    await delay(700)
    const cableMark = await evaluate(app.page, `(() => {
      const pane = document.querySelector('[data-testid="compare-canvas-after"]')
      const shape = pane.querySelector('.tl-shape[data-shape-id="${CABLE_SHAPE}"]')
      return {
        boxes: pane.querySelectorAll('[data-testid="compare-highlight-mark"]').length,
        shapeFound: !!shape,
        filter: shape ? getComputedStyle(shape).filter : null,
        isPath: !!shape?.querySelector('path'),
      }
    })()`)
    assert.equal(cableMark.shapeFound, true, 'the cable shape is rendered in the after pane')
    assert.equal(cableMark.boxes, 0, 'a selected cable draws NO bounding rectangle')
    assert.equal(cableMark.isPath, true, 'the cable is a real SVG stroke, so a filter follows it')
    assert.ok(
      /drop-shadow/.test(cableMark.filter ?? ''),
      `the cable takes a drop shadow under its own stroke, got "${cableMark.filter}"`,
    )
    pass(`a selected cable gets a shadow under its stroke and no box (filter: ${cableMark.filter.slice(0, 58)}…)`)
    await capture(app.page, 'converged-cable-shadow.png')

    // A BLOCK must still get the plain rectangle — the change is cable-only.
    await clickElement(app.page, `[data-testid="compare-element-${BLOCK_ELEMENT}"]`)
    await delay(600)
    const blockMark = await evaluate(app.page, `(() => {
      const pane = document.querySelector('[data-testid="compare-canvas-after"]')
      const cable = pane.querySelector('.tl-shape[data-shape-id="${CABLE_SHAPE}"]')
      return {
        boxes: pane.querySelectorAll('[data-testid="compare-highlight-mark"]').length,
        cableFilter: cable ? getComputedStyle(cable).filter : null,
      }
    })()`)
    assert.equal(blockMark.boxes, 1, 'a Block still gets Simulink\'s plain rectangle')
    assert.ok(
      !/drop-shadow/.test(blockMark.cableFilter ?? ''),
      `the cable's shadow is released when it is not selected, got "${blockMark.cableFilter}"`,
    )
    pass('a Block keeps the rectangle, and the cable shadow is released on deselect')

    // ---- 7 · the modal's bottom row ---------------------------------------
    await clickElement(app.page, '[data-testid="compare-mode-overlay"]')
    await delay(300)
    const modalBar = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]').getBoundingClientRect()
      const bar = document.querySelector('[data-testid="compare-bar"]')
      const box = bar.getBoundingClientRect()
      const slot = (name) => bar.querySelector('[data-slot="' + name + '"]')
      return {
        mode: bar.dataset.mode,
        belowMidline: box.top > dialog.top + dialog.height / 2,
        left: !!slot('left').querySelector('[data-testid="compare-mode-overlay"]'),
        centre: !!slot('centre') || !!slot('center').querySelector('[data-testid="compare-blend"]'),
        right: slot('right').querySelector('[data-testid="compare-expand"]')?.textContent,
        noExpandElsewhere: document.querySelectorAll('[data-testid="compare-expand"]').length,
      }
    })()`)
    assert.equal(modalBar.mode, 'modal', 'the bar knows it is in modal mode')
    assert.equal(modalBar.belowMidline, true, 'the row is at the bottom of the modal')
    assert.equal(modalBar.left, true, 'Side by side / Overlay is on the left')
    assert.equal(modalBar.centre, true, 'the crossfade slider is in the middle, in Overlay')
    assert.equal(modalBar.right, 'Fullscreen', 'Fullscreen is right-aligned in the corner')
    assert.equal(modalBar.noExpandElsewhere, 1, 'there is exactly ONE Fullscreen control, not a duplicate')
    pass('the modal bottom row is [modes] · slider · Fullscreen, with no second entry point')

    // In Side by side there is nothing to blend, so the slider is absent.
    await clickElement(app.page, '[data-testid="compare-mode-side-by-side"]')
    await delay(250)
    const sliderGone = await evaluate(
      app.page,
      `(() => document.querySelectorAll('[data-testid="compare-blend"]').length)()`,
    )
    assert.equal(sliderGone, 0, 'no slider in Side by side — nothing to crossfade')
    pass('the slider appears only in Overlay')
    await capture(app.page, 'converged-modal-bottom-row.png')
    await clickElement(app.page, '[data-testid="compare-mode-overlay"]')
    await delay(250)
    await setBlend(app.page, '60')

    // ---- 8 · the fullscreen bar, at the bottom ----------------------------
    await clickElement(app.page, '[data-testid="compare-expand"]')
    await delay(900)
    const fullBar = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const bar = document.querySelector('[data-testid="compare-bar"]')
      const box = bar.getBoundingClientRect()
      const slot = (name) => bar.querySelector('[data-slot="' + name + '"]')
      const right = slot('right')
      // DOM order inside the right slot decides which is nearer the corner.
      const rightOrder = Array.from(right.children).map((node) =>
        node.querySelector('[data-testid="compare-blend"]') || node.matches('[data-testid="compare-blend"]')
          ? 'slider'
          : node.dataset.testid === 'compare-collapse' ? 'return' : 'other')
      const hidden = (selector) => {
        const node = document.querySelector(selector)
        return !node || getComputedStyle(node).display === 'none'
      }
      const barCentre = box.left + box.width / 2
      const stepper = slot('center').querySelector('[data-testid="compare-step-count"]')
      const stepBox = stepper.getBoundingClientRect()
      return {
        stamped: dialog.dataset.fullscreen === 'true',
        mode: bar.dataset.mode,
        inBottomHalf: box.top > window.innerHeight / 2,
        distanceFromBottom: window.innerHeight - box.bottom,
        vsOnLeft: !!slot('left').querySelector('[data-testid="compare-bar-version"]'),
        stepperCentred: Math.abs((stepBox.left + stepBox.width / 2) - barCentre) < 40,
        rightOrder,
        detailHidden: hidden('.systemsketch-compare__detail'),
        historyHidden: hidden('.systemsketch-compare__history'),
        titleHidden: hidden('.systemsketch-compare__titlebar'),
        // Visibility, not DOM presence: the table stays mounted so the return
        // trip has state to restore, but it must not be on screen.
        tableVisible: (document.querySelector('[data-testid="compare-property-table"]')
          ?.getClientRects().length ?? 0) > 0,
      }
    })()`)
    assert.equal(fullBar.stamped, true, 'the dialog is stamped fullscreen')
    assert.equal(fullBar.mode, 'fullscreen', 'the bar switched contents, not position')
    assert.equal(fullBar.inBottomHalf, true, `the bar is in the bottom half (top at ${fullBar.distanceFromBottom}px from the bottom)`)
    assert.ok(fullBar.distanceFromBottom < 12, `and flush to the bottom edge, ${fullBar.distanceFromBottom}px off`)
    assert.equal(fullBar.detailHidden, true, 'the property panel is gone')
    assert.equal(fullBar.historyHidden, true, 'the history rail is gone')
    assert.equal(fullBar.titleHidden, true, 'the title bar is gone')
    assert.equal(fullBar.tableVisible, false, 'the table is not visible while fullscreen')
    pass(`the fullscreen bar moved to the BOTTOM (${fullBar.distanceFromBottom}px off the edge), all panel chrome hidden`)

    assert.equal(fullBar.stepperCentred, true, 'the stepper is centred on the bar, not floated')
    assert.equal(fullBar.vsOnLeft, true, 'the vs picker takes the left slot, where the rail used to answer')
    assert.deepEqual(
      fullBar.rightOrder,
      ['slider', 'return'],
      `slider then Return, Return in the corner — got ${fullBar.rightOrder.join(' → ')}`,
    )
    pass('layout is vs · [stepper centred] · slider + Return, with Return in the rightmost corner')

    // The version picker exists here and NOWHERE else — the duplication the
    // last round shipped is resolved, not merely rearranged.
    const pickerCount = await evaluate(
      app.page,
      `(() => document.querySelectorAll('[data-testid="compare-bar-version"]').length)()`,
    )
    assert.equal(pickerCount, 1, 'exactly one version control on screen')
    pass('the History rail and the vs picker are never both on screen — one control per fact')
    await capture(app.page, 'converged-fullscreen-bottom-bar.png')

    // ---- 9 · the stepper still drives the board ---------------------------
    const stepStart = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="compare-step-count"]').textContent)()`,
    )
    assert.match(stepStart, /^\d+ of \d+ changes$/, `the stepper reads a position: "${stepStart}"`)
    /*
     * Walk the whole list rather than asserting that ONE step moves the camera.
     *
     * Three of this fixture's five changes are a port added, a port removed and
     * a retitle on the SAME Block, and all three anchor on that Block's bounds —
     * so stepping between them correctly does not move the camera, because the
     * thing being pointed at has not moved. Asserting a move on every step would
     * be asserting a bug. The real claim is that the stepper walks every change
     * and that crossing to another element does move the board.
     */
    const walk = []
    let camera = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="compare-canvas-after"] .tl-shapes').style.transform)()`,
    )
    let moved = 0
    for (let index = 0; index < 5; index += 1) {
      await clickElement(app.page, '[data-testid="compare-step-next"]')
      await delay(700)
      const at = await evaluate(app.page, `(() => ({
        label: document.querySelector('[data-testid="compare-step-count"]').textContent,
        camera: document.querySelector('[data-testid="compare-canvas-after"] .tl-shapes').style.transform,
      }))()`)
      walk.push(at.label)
      if (at.camera !== camera) moved += 1
      camera = at.camera
    }
    const positions = walk.map((label) => label.split(' ')[0])
    assert.equal(new Set(positions).size, 5, `the stepper visits all five changes: ${positions.join(' → ')}`)
    assert.ok(moved >= 1, `crossing to another element moves the board (${moved} of 5 steps moved it)`)
    pass(`the stepper walks every change while fullscreen (${stepStart} → ${walk.join(' → ')}, camera moved ${moved}×)`)
    await capture(app.page, 'converged-fullscreen-stepped.png')

    await setBlend(app.page, '15')
    const fullOpacity = await evaluate(app.page, `(() => (
      document.querySelector('.systemsketch-compare__pane[data-side="after"]').style.opacity
    ))()`)
    assert.equal(fullOpacity, '0.15', `the slider works fullscreen, got ${fullOpacity}`)
    pass('the crossfade slider stays live in fullscreen')
    await setBlend(app.page, '60')

    // ---- 10 · the return trip ---------------------------------------------
    const before = await evaluate(app.page, `(() => ({
      step: document.querySelector('[data-testid="compare-step-count"]').textContent,
      blend: document.querySelector('[data-testid="compare-blend"]').value,
    }))()`)
    await clickElement(app.page, '[data-testid="compare-collapse"]')
    await delay(900)
    const restored = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const bar = document.querySelector('[data-testid="compare-bar"]')
      const pane = document.querySelector('[data-testid="compare-canvas-after"]').getBoundingClientRect()
      const mark = document.querySelector('[data-testid="compare-canvas-after"] [data-testid="compare-highlight-mark"]')
      const markBox = mark?.getBoundingClientRect()
      return {
        stamped: dialog.dataset.fullscreen,
        barMode: bar.dataset.mode,
        step: document.querySelector('[data-testid="compare-step-count"]') ? null : 'stepper gone from modal bar',
        blend: document.querySelector('[data-testid="compare-blend"]').value,
        gitHighlight: document.querySelector('[data-testid="compare-property-table"]')?.dataset.gitHighlight,
        checkbox: document.querySelector('[data-testid="compare-highlight-checkbox"]').checked,
        layout: document.querySelector('[data-testid="compare-property-table"]')?.dataset.layout,
        activeTab: Array.from(document.querySelectorAll('.block-inspector__tabs [role="tab"]'))
          .filter((b) => b.classList.contains('is-active')).map((b) => b.textContent),
        selectedElement: document.querySelector('[data-testid="compare-element-list"] button[data-selected]')
          ?.dataset.testid,
        offCentre: markBox
          ? Math.abs((markBox.left + markBox.width / 2) - (pane.left + pane.width / 2)) / pane.width
          : null,
        detailBack: getComputedStyle(document.querySelector('.systemsketch-compare__detail')).display !== 'none',
      }
    })()`)
    assert.equal(restored.stamped, undefined, 'the fullscreen stamp is gone')
    assert.equal(restored.barMode, 'modal', 'the bar is back to its modal contents')
    assert.equal(restored.detailBack, true, 'the property panel came back')
    assert.equal(restored.blend, before.blend, `same blend: ${restored.blend}%`)
    assert.equal(restored.gitHighlight, 'on', 'the ink toggle kept the value set before expanding')
    assert.equal(restored.checkbox, true, 'and the checkbox agrees')
    assert.equal(restored.layout, 'figma', 'the chosen layout survived the round trip')
    assert.deepEqual(restored.activeTab, ['Properties'], 'the tab selection survived')
    assert.ok(restored.selectedElement, `the element stayed selected: ${restored.selectedElement}`)
    assert.ok(
      restored.offCentre !== null && restored.offCentre < 0.2,
      `and is re-framed for the narrower pane, ${(restored.offCentre * 100).toFixed(0)}% off centre`,
    )
    pass('returning restores layout, element, tab, blend and ink, and re-frames for the narrower pane')
    await capture(app.page, 'converged-returned-to-modal.png')

    // Escape unwinds one layer at a time.
    await clickElement(app.page, '[data-testid="compare-expand"]')
    await delay(600)
    await key(app.page, 'Escape', 'Escape')
    await delay(400)
    const afterEscape = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      return { open: !!dialog, fullscreen: dialog?.dataset.fullscreen }
    })()`)
    assert.equal(afterEscape.open, true, 'the first Escape does NOT close the review')
    assert.equal(afterEscape.fullscreen, undefined, 'the first Escape leaves fullscreen')
    pass('Escape unwinds fullscreen first, so one key cannot lose a reviewer their place')

    await key(app.page, 'Escape', 'Escape')
    await waitFor(app.page, `!document.querySelector('[data-testid="compare-dialog"]')`, 'closed')
    pass('the second Escape closes the review')

    // ---- 11 · the SAME tab fix, in a real Block inspector -----------------
    /*
     * The fix went into a shared stylesheet, so a second consumer is the proof
     * that it propagated rather than being a Compare-only patch.
     */
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getCurrentPageShapes().find((shape) => shape.type === 'block')
      editor.setCurrentTool('select')
      editor.select(block.id)
      return block.id
    })()`)
    await waitFor(app.page, `!!document.querySelector('.block-inspector__tabs')`, 'Block inspector open')
    await delay(500)
    const blockTabs = await evaluate(app.page, `(() => {
      const strip = document.querySelector('.block-inspector .block-inspector__tabs')
      if (!strip) return null
      const buttons = Array.from(strip.querySelectorAll('[role="tab"]'))
      const stripBox = strip.getBoundingClientRect()
      const span = buttons[buttons.length - 1].getBoundingClientRect().right - buttons[0].getBoundingClientRect().left
      const close = strip.querySelector('.block-inspector__dock-close')
      const closeBox = close?.getBoundingClientRect()
      return {
        labels: buttons.map((b) => b.textContent.trim()),
        stripWidth: stripBox.width,
        tabsWidth: span,
        // The close button is a child positioned against the strip's right
        // edge — if the strip had been shrunk instead of the tabs, it would
        // have walked inward with it.
        closeAtRightEdge: closeBox ? stripBox.right - closeBox.right < 12 : null,
      }
    })()`)
    assert.ok(blockTabs, 'the Block inspector rendered its tab strip')
    assert.ok(
      blockTabs.tabsWidth < blockTabs.stripWidth * 0.7,
      `the Block inspector's tabs hug too — ${blockTabs.tabsWidth.toFixed(0)}px of ${blockTabs.stripWidth.toFixed(0)}px`,
    )
    if (blockTabs.closeAtRightEdge !== null) {
      assert.equal(blockTabs.closeAtRightEdge, true, 'its close button is still pinned to the panel edge')
    }
    pass(
      `the same fix reaches the Block inspector (${blockTabs.labels.join(' / ')}: `
      + `${blockTabs.tabsWidth.toFixed(0)}px in a ${blockTabs.stripWidth.toFixed(0)}px strip)`,
    )
    await capture(app.page, 'converged-block-inspector-tabs.png')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the whole converged journey emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} converged-review checks passed.\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
