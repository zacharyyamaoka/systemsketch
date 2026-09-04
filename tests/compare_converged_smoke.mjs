#!/usr/bin/env node
/**
 * Real-browser proof for the converged review surface.
 *
 * `compare_modal_smoke.mjs` proves the modal still works. This one proves the
 * five things the convergence added, and it is deliberately adversarial about
 * each — a check that only asserts an element EXISTS proves markup, not
 * behaviour, so every claim here is read off computed style, geometry or the
 * live tldraw camera rather than off a class name.
 *
 *   1. the ported omnibox table renders all three states, Modified in BLUE
 *   2. the git-highlight toggle actually changes the painted pixels both ways
 *   3. the tab strip is the app's own `.block-inspector__tabs`, not a lookalike
 *   4. fullscreen keeps the persistent bar, and its stepper MOVES THE CAMERA
 *   5. returning to the modal restores selection, tab, blend and git-ink
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

/** Read the after pane's camera transform — the honest test of a jump. */
const CAMERA = `(() => document.querySelector('[data-testid="compare-canvas-after"] .tl-shapes')?.style.transform ?? '')()`

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

    // ---- 1 · the ported table, and the colour of Modified -----------------
    const states = await evaluate(app.page, `(() => Array.from(
      document.querySelectorAll('[data-testid="compare-property-table"] tbody tr[data-change-id]'),
    ).map((row) => row.dataset.state))()`)
    const kinds = new Set(states)
    assert.ok(kinds.has('added'), 'an Added row')
    assert.ok(kinds.has('removed'), 'a Removed row')
    assert.ok(kinds.has('modified'), 'a Modified row')
    pass(`the ported omnibox table carries all three states (${states.length} rows)`)

    // The table must be the PORTED markup, not the old in-house one: omnibox's
    // badge is a bordered chip in the Layer cell, and its absent cells assert
    // absence with a hatch rather than going blank.
    const portedShape = await evaluate(app.page, `(() => {
      const table = document.querySelector('[data-testid="compare-property-table"]')
      return {
        tableClass: table.className,
        badges: table.querySelectorAll('.systemsketch-review__state[data-state]').length,
        absent: table.querySelectorAll('.systemsketch-review__value[data-absent="true"]').length,
        oldRows: table.querySelectorAll('.systemsketch-compare__row').length,
      }
    })()`)
    assert.equal(portedShape.tableClass, 'systemsketch-review__table', 'the ported table class')
    assert.equal(portedShape.oldRows, 0, "the fork's own table markup is gone, not kept beside it")
    assert.ok(portedShape.badges >= 3, `state badges rendered: ${portedShape.badges}`)
    assert.ok(portedShape.absent >= 2, `absent cells assert absence: ${portedShape.absent}`)
    pass('the table is the omnibox port — bordered state badges and hatched absent cells')

    /*
     * Modified must be BLUE, and "blue" is measured, not asserted from a token
     * name. A test that only checked the CSS said `var(--ss-accent)` would pass
     * just as happily if the accent resolved to orange.
     */
    const badgeColours = await evaluate(app.page, `(() => {
      const read = (state) => {
        const badge = document.querySelector('.systemsketch-review__state[data-state="' + state + '"]')
        if (!badge) return null
        const style = getComputedStyle(badge)
        return { border: style.borderTopColor, background: style.backgroundColor }
      }
      return { added: read('added'), removed: read('removed'), modified: read('modified') }
    })()`)
    const modified = await evaluate(app.page, `${RGB}(${JSON.stringify(badgeColours.modified.border)})`)
    const removed = await evaluate(app.page, `${RGB}(${JSON.stringify(badgeColours.removed.border)})`)
    const added = await evaluate(app.page, `${RGB}(${JSON.stringify(badgeColours.added.border)})`)
    assert.ok(
      modified.b > modified.r && modified.b > modified.g,
      `Modified must be blue-dominant, measured ${JSON.stringify(modified)}`,
    )
    assert.ok(removed.r > removed.b, `Removed stays red-dominant, measured ${JSON.stringify(removed)}`)
    assert.ok(added.g > added.b, `Added stays green-dominant, measured ${JSON.stringify(added)}`)
    // The specific complaint was that amber sat too close to red. Prove the
    // separation rather than just the hue: blue must be nowhere near removed.
    const distance = Math.hypot(modified.r - removed.r, modified.g - removed.g, modified.b - removed.b)
    assert.ok(distance > 120, `Modified must be far from Removed in RGB, measured ${distance.toFixed(0)}`)
    pass(
      `Modified is blue (${modified.r},${modified.g},${modified.b}), `
      + `${distance.toFixed(0)} away from Removed in RGB`,
    )
    await capture(app.page, 'converged-table-blue-modified.png')

    // ---- 2 · the git-highlight toggle -------------------------------------
    const toggleDefault = await evaluate(app.page, `(() => ({
      checked: document.querySelector('[data-testid="compare-highlight-checkbox"]').checked,
      stamp: document.querySelector('[data-testid="compare-property-table"]').dataset.gitHighlight,
    }))()`)
    assert.equal(toggleDefault.checked, false, 'the toggle defaults OFF')
    assert.equal(toggleDefault.stamp, 'off', 'the table is stamped off')
    pass('word-level diff highlighting defaults OFF — the Figma baseline')

    /*
     * The claim is about PAINT, so read paint. With the toggle off both the
     * per-cell wash and the per-run fill must be fully transparent; with it on,
     * both must be opaque enough to see. Asserting only the `data-` stamp would
     * pass even if the stylesheet had been deleted.
     */
    const readInk = `(() => {
      const row = document.querySelector('tr[data-change-id="block:shape:predict"]')
      const cell = row.querySelector('.systemsketch-review__value[data-side="current"]')
      const mark = cell.querySelector('mark[data-token="added"]')
      return {
        cell: getComputedStyle(cell).backgroundColor,
        mark: getComputedStyle(mark).backgroundColor,
        markWeight: getComputedStyle(mark).fontWeight,
        text: cell.textContent,
      }
    })()`

    const inkOff = await evaluate(app.page, readInk)
    const cellOff = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOff.cell)})`)
    const markOff = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOff.mark)})`)
    assert.equal(cellOff.a, 0, `off: the cell wash must be transparent, got ${inkOff.cell}`)
    assert.equal(markOff.a, 0, `off: the run fill must be transparent, got ${inkOff.mark}`)
    pass('with the toggle OFF both layers are gone — Previous/Current are plain text')

    // The value itself must survive the toggle. Hiding the ink must never hide
    // a character: that would be the display lying about a stored property.
    assert.ok(inkOff.text.includes('run_predict'), `the value still reads in full: ${inkOff.text}`)
    pass('turning the ink off hides styling only — the full value still renders')
    await capture(app.page, 'converged-highlight-off.png')

    await clickElement(app.page, '[data-testid="compare-highlight-checkbox"]')
    await delay(250)
    const inkOn = await evaluate(app.page, readInk)
    const cellOn = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOn.cell)})`)
    const markOn = await evaluate(app.page, `${RGB}(${JSON.stringify(inkOn.mark)})`)
    assert.ok(cellOn.a > 0, `on: the cell takes a wash, got ${inkOn.cell}`)
    assert.ok(markOn.a > 0, `on: the run takes a fill, got ${inkOn.mark}`)
    assert.ok(markOn.a > cellOn.a, 'the run must be stronger than the wash it sits in')
    assert.ok(Number(inkOn.markWeight) > Number(inkOff.markWeight), 'the run also gains weight')
    pass(
      `with the toggle ON both layers paint — wash a=${cellOn.a}, run a=${markOn.a} `
      + `(the two-layer effect Zach asked to be able to switch off)`,
    )
    await capture(app.page, 'converged-highlight-on.png')

    // The row BADGE is not part of the toggle — it says which of the three
    // states the row is, which is the table's primary claim.
    const badgeSurvives = await evaluate(app.page, `(() => {
      const badge = document.querySelector('.systemsketch-review__state[data-state="modified"]')
      return getComputedStyle(badge).borderTopColor
    })()`)
    assert.equal(badgeSurvives, badgeColours.modified.border, 'the badge is unaffected by the toggle')
    pass('the Added/Removed/Modified badge is outside the toggle, in both settings')

    // ---- 3 · the app's own tab strip --------------------------------------
    const tabs = await evaluate(app.page, `(() => {
      const strip = document.querySelector('[data-testid="compare-dialog"] .block-inspector__tabs')
      if (!strip) return null
      const buttons = Array.from(strip.querySelectorAll('[role="tab"]'))
      const probe = getComputedStyle(buttons.find((b) => b.classList.contains('is-active')))
      const inspector = getComputedStyle(document.documentElement)
      return {
        role: strip.getAttribute('role'),
        tag: strip.tagName,
        count: buttons.length,
        active: buttons.filter((b) => b.classList.contains('is-active')).map((b) => b.textContent),
        activeSelected: buttons.every((b) => (b.getAttribute('aria-selected') === 'true') === b.classList.contains('is-active')),
        // The class must be doing real work: an inert class name would leave
        // the active tab with a transparent background and no border.
        activeBackground: probe.backgroundColor,
        activeBorder: probe.borderTopColor,
        gridColumns: getComputedStyle(strip).gridTemplateColumns,
      }
    })()`)
    assert.ok(tabs, 'the detail pane uses .block-inspector__tabs')
    assert.equal(tabs.role, 'tablist', 'the container is a real tablist')
    assert.equal(tabs.count, 2, 'Properties and Code')
    assert.deepEqual(tabs.active, ['Properties'], 'exactly one is-active tab')
    assert.equal(tabs.activeSelected, true, 'aria-selected tracks .is-active')
    const activeBg = await evaluate(app.page, `${RGB}(${JSON.stringify(tabs.activeBackground)})`)
    assert.ok(activeBg.a > 0, `the .is-active rule actually paints, got ${tabs.activeBackground}`)
    assert.ok(tabs.gridColumns.split(' ').length === 2, `the strip is the 2-col grid: ${tabs.gridColumns}`)
    pass(`the tab strip IS .block-inspector__tabs — ${tabs.tag}[role=tablist], .is-active painting ${tabs.activeBackground}`)

    // Code is scoped to one change, so pick one first — an unselected Code tab
    // correctly renders a "pick a change" prompt and not a diff.
    await clickElement(app.page, '[data-testid="compare-row-block:shape:predict:title"]')
    await delay(400)
    await clickElement(app.page, '[data-testid="compare-tab-code"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-code-view"]')`, 'code tab')
    const afterSwitch = await evaluate(app.page, `(() => Array.from(
      document.querySelectorAll('[data-testid="compare-dialog"] .block-inspector__tabs [role="tab"]'),
    ).filter((b) => b.classList.contains('is-active')).map((b) => b.textContent))()`)
    assert.deepEqual(afterSwitch, ['Code'], 'the active class moves with the selection')
    pass('switching tabs moves .is-active, the way the Block inspector does')

    // ---- 4 · fullscreen, and the persistent bar ---------------------------
    // Select a change first, so the return trip has something to restore.
    await clickElement(app.page, '[data-testid="compare-tab-properties"]')
    await delay(200)
    await clickElement(app.page, '[data-testid="compare-row-block:shape:predict:title"]')
    await delay(500)

    // The bar is present in the MODAL too — that is the axis. If it only
    // appeared in fullscreen it would be a fullscreen toolbar, not a
    // persistent bar, and the transition would be the hard cut it is meant
    // not to be.
    const barInModal = await evaluate(app.page, `(() => {
      const bar = document.querySelector('[data-testid="compare-bar"]')
      const box = bar?.getBoundingClientRect()
      return { present: !!bar, width: box?.width ?? 0, height: box?.height ?? 0 }
    })()`)
    assert.ok(barInModal.present, 'the bar exists in modal mode')
    assert.ok(barInModal.height > 20, `the bar is visible in modal: ${barInModal.height}px tall`)
    pass('the persistent bar is already present in the modal, before any expansion')

    await clickElement(app.page, '[data-testid="compare-mode-overlay"]')
    await delay(300)
    await setBlend(app.page, '60')
    const beforeJump = await evaluate(app.page, CAMERA)

    await clickElement(app.page, '[data-testid="compare-expand"]')
    await delay(900)

    const full = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const bar = document.querySelector('[data-testid="compare-bar"]')
      const barBox = bar.getBoundingClientRect()
      const stage = document.querySelector('.systemsketch-compare__stage').getBoundingClientRect()
      const hidden = (selector) => {
        const node = document.querySelector(selector)
        return !node || getComputedStyle(node).display === 'none'
      }
      return {
        stamped: dialog.dataset.fullscreen === 'true',
        dialogWidth: dialog.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        barVisible: barBox.height > 20 && getComputedStyle(bar).display !== 'none',
        barTop: barBox.top,
        stageWidth: stage.width,
        detailHidden: hidden('.systemsketch-compare__detail'),
        historyHidden: hidden('.systemsketch-compare__history'),
        titleHidden: hidden('.systemsketch-compare__titlebar'),
        hasCollapse: !!document.querySelector('[data-testid="compare-collapse"]'),
        hasVersionPicker: !!document.querySelector('[data-testid="compare-bar-version"]'),
        hasStepper: !!document.querySelector('[data-testid="compare-step-count"]'),
        hasBlend: !!document.querySelector('[data-testid="compare-blend"]'),
        tableReachable: !!document.querySelector('[data-testid="compare-property-table"]')
          && !hidden('.systemsketch-compare__detail'),
      }
    })()`)
    assert.equal(full.stamped, true, 'the dialog is stamped fullscreen')
    assert.ok(
      full.dialogWidth >= full.viewportWidth - 2,
      `fullscreen takes the viewport: ${full.dialogWidth} vs ${full.viewportWidth}`,
    )
    assert.equal(full.detailHidden, true, 'the property panel is gone')
    assert.equal(full.historyHidden, true, 'the history rail is gone')
    assert.equal(full.titleHidden, true, 'the title bar is gone')
    assert.equal(full.tableReachable, false, 'the table is NOT reachable while fullscreen, per the brief')
    pass('expanding hides every piece of panel chrome and gives the boards the viewport')

    assert.equal(full.barVisible, true, 'the persistent bar survived the expansion')
    assert.equal(full.hasCollapse, true, 'Back-to-modal is on the bar')
    assert.equal(full.hasVersionPicker, true, 'the vs/history picker is on the bar')
    assert.equal(full.hasStepper, true, 'the change stepper is on the bar')
    assert.equal(full.hasBlend, true, 'the opacity slider is on the bar')
    pass('fullscreen keeps ONE bar carrying back · vs · stepper · opacity — nothing else')

    /*
     * The selected change must be FRAMED in the new viewport, not merely still
     * selected. Replaying the modal's camera into a viewport three times wider
     * leaves it pinned against the left edge — which is exactly what this did
     * before a screenshot caught it, with every state assertion passing.
     */
    const framedFull = await evaluate(app.page, `(() => {
      const pane = document.querySelector('[data-testid="compare-canvas-after"]').getBoundingClientRect()
      const mark = document.querySelector('[data-testid="compare-canvas-after"] [data-testid="compare-highlight-mark"]')
      if (!mark) return null
      const box = mark.getBoundingClientRect()
      return {
        offsetFromCentre: Math.abs((box.left + box.width / 2) - (pane.left + pane.width / 2)) / pane.width,
        inside: box.left >= pane.left - 4 && box.right <= pane.right + 4,
      }
    })()`)
    assert.ok(framedFull, 'the selected change is marked on the fullscreen board')
    assert.equal(framedFull.inside, true, 'the selected change is fully inside the fullscreen viewport')
    assert.ok(
      framedFull.offsetFromCentre < 0.2,
      `the selected change is re-centred for the wide viewport, off by ${(framedFull.offsetFromCentre * 100).toFixed(0)}%`,
    )
    pass(
      `expanding re-frames the selected change for the new viewport `
      + `(${(framedFull.offsetFromCentre * 100).toFixed(0)}% off centre, not pinned to an edge)`,
    )
    await capture(app.page, 'converged-fullscreen-bar.png')

    // The stepper has to MOVE THE BOARD, not just relabel itself. This is the
    // check that separates a real jump from a counter.
    const stepStart = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="compare-step-count"]').textContent)()`,
    )
    assert.match(stepStart, /^\d+ of \d+ changes$/, `the stepper reads a position: "${stepStart}"`)

    const cameraBefore = await evaluate(app.page, CAMERA)
    await clickElement(app.page, '[data-testid="compare-step-next"]')
    await delay(800)
    const stepAfter = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="compare-step-count"]').textContent)()`,
    )
    const cameraAfter = await evaluate(app.page, CAMERA)
    assert.notEqual(stepAfter, stepStart, `the counter advanced: ${stepStart} → ${stepAfter}`)
    assert.notEqual(
      cameraAfter,
      cameraBefore,
      `stepping must move the camera, but it stayed at ${cameraBefore}`,
    )
    pass(`the stepper navigates the board while fullscreen (${stepStart} → ${stepAfter}, camera moved)`)
    await capture(app.page, 'converged-fullscreen-stepped.png')

    // Both cameras stay locked in fullscreen, or the crossfade is a lie.
    const lockedFull = await evaluate(app.page, `(() => {
      const panes = document.querySelectorAll('[data-testid^="compare-canvas-"] .tl-shapes')
      return Array.from(panes).map((node) => node.style.transform)
    })()`)
    assert.equal(lockedFull[0], lockedFull[1], `cameras locked in fullscreen: ${lockedFull.join(' vs ')}`)
    pass('the two cameras stay locked through the jump, so the crossfade still shows the board')

    // The slider must still drive the crossfade from inside fullscreen.
    await setBlend(app.page, '15')
    const fullOpacity = await evaluate(app.page, `(() => (
      document.querySelector('.systemsketch-compare__pane[data-side="after"]').style.opacity
    ))()`)
    assert.equal(fullOpacity, '0.15', `the opacity slider works fullscreen, got ${fullOpacity}`)
    pass('the crossfade slider stays live in fullscreen — the effect Zach liked, kept immersive')
    await setBlend(app.page, '60')

    // ---- 5 · the return trip ----------------------------------------------
    const stateBeforeReturn = await evaluate(app.page, `(() => ({
      step: document.querySelector('[data-testid="compare-step-count"]').textContent,
      blend: document.querySelector('[data-testid="compare-blend"]').value,
    }))()`)

    await clickElement(app.page, '[data-testid="compare-collapse"]')
    await delay(800)

    const restored = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const activeTab = Array.from(
        document.querySelectorAll('.block-inspector__tabs [role="tab"]'),
      ).filter((b) => b.classList.contains('is-active')).map((b) => b.textContent)
      const selected = Array.from(
        document.querySelectorAll('[data-testid="compare-property-table"] tr[data-selected]'),
      ).map((row) => row.dataset.changeId)
      return {
        stamped: dialog.dataset.fullscreen,
        step: document.querySelector('[data-testid="compare-step-count"]').textContent,
        blend: document.querySelector('[data-testid="compare-blend"]').value,
        gitHighlight: document.querySelector('[data-testid="compare-property-table"]').dataset.gitHighlight,
        checkbox: document.querySelector('[data-testid="compare-highlight-checkbox"]').checked,
        activeTab,
        selected,
        barVisible: document.querySelector('[data-testid="compare-bar"]').getBoundingClientRect().height > 20,
        detailBack: getComputedStyle(document.querySelector('.systemsketch-compare__detail')).display !== 'none',
      }
    })()`)
    assert.equal(restored.stamped, undefined, 'the fullscreen stamp is gone')
    assert.equal(restored.detailBack, true, 'the property panel came back')
    assert.equal(restored.barVisible, true, 'the bar is still there — it never left')
    assert.equal(restored.step, stateBeforeReturn.step, `same change selected: ${restored.step}`)
    assert.equal(restored.blend, stateBeforeReturn.blend, `same blend: ${restored.blend}%`)
    assert.equal(restored.gitHighlight, 'on', 'the git-ink toggle kept the value set before expanding')
    assert.equal(restored.checkbox, true, 'and the checkbox agrees with it')
    assert.deepEqual(restored.activeTab, ['Properties'], 'the tab selection survived')
    assert.equal(restored.selected.length, 1, 'exactly one row is still selected')
    pass(
      'returning restores everything — selection, tab, blend and the ink toggle '
      + '(state is preserved by construction: the tree never unmounts)',
    )

    // And the same change is re-framed for the narrow pane on the way back, so
    // the return is symmetric with the expansion.
    const framedBack = await evaluate(app.page, `(() => {
      const pane = document.querySelector('[data-testid="compare-canvas-after"]').getBoundingClientRect()
      const mark = document.querySelector('[data-testid="compare-canvas-after"] [data-testid="compare-highlight-mark"]')
      if (!mark) return null
      const box = mark.getBoundingClientRect()
      return {
        offsetFromCentre: Math.abs((box.left + box.width / 2) - (pane.left + pane.width / 2)) / pane.width,
        paneWidth: pane.width,
      }
    })()`)
    assert.ok(framedBack, 'the change is still marked after the return')
    assert.ok(
      framedBack.offsetFromCentre < 0.2,
      `re-framed for the ${framedBack.paneWidth.toFixed(0)}px pane, off by ${(framedBack.offsetFromCentre * 100).toFixed(0)}%`,
    )
    pass(`the return re-frames the same change for the narrower pane (${framedBack.paneWidth.toFixed(0)}px)`)
    await capture(app.page, 'converged-returned-to-modal.png')

    // Escape unwinds one layer at a time, never straight out of the review.
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
    pass('Escape unwinds fullscreen first, so a reviewer cannot lose their place with one key')

    await key(app.page, 'Escape', 'Escape')
    await waitFor(app.page, `!document.querySelector('[data-testid="compare-dialog"]')`, 'closed')
    pass('the second Escape closes the review')

    const untouched = await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      return { shapes: editor.getCurrentPageShapes().length, readonly: editor.getIsReadonly() }
    })()`)
    assert.equal(untouched.readonly, false, 'the live editor is editable again')
    assert.equal(untouched.shapes, 12, 'the board is unchanged by the whole journey')
    pass('the board survives the review unchanged and editable')

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
