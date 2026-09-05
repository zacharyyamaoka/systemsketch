#!/usr/bin/env node
/**
 * Real-browser proof for the Figma-language history list, in BOTH places.
 *
 * The claims this has to defend are not "an element exists" — they are about
 * whether two panels are genuinely one component, whether the rows carry
 * measured data rather than filenames, and whether moving a panel loses a
 * reviewer's place. So every check reads computed style, geometry or text off
 * the running app.
 *
 *   1. the Compare button is INSIDE the top-right shell, not floating past it
 *   2. the board rail is Figma's row: avatar · title · relative time, tinted
 *   3. the titles are MEASURED from the diff, and no author is invented
 *   4. the description discloses on its own control, without moving the diff
 *   5. Properties/Code docks right ↔ bottom, and state survives both ways
 *   6. a Block's inspector grows a History tab in the identical component
 *
 * Run with:
 *   node tests/compare_history_figma_smoke.mjs
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
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT_DIR = join(ROOT, 'docs', 'assets')
/* A copy under `.track/boards/`, never `sketches/review/` — the app autosaves
   into whatever board it opens, and a journey must not rewrite a fixture. */
const BOARD = join(ROOT, '.track', 'boards', 'history-figma', 'diff-review-modal.systemsketch')
const BLOCK_ELEMENT = 'block:shape:predict'
const { checks, pass } = makeChecklist()

async function capture(page, name) {
  await ensureDir(SHOT_DIR)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOT_DIR, name), Buffer.from(shot.data, 'base64'))
}

const RGB = `((value) => {
  const parts = String(value).match(/[\\d.]+/g) ?? []
  return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a: parts[3] === undefined ? 1 : Number(parts[3]) }
})`

/** Read one history list's rows, whichever mount it is. */
const READ_LIST = `((prefix) => {
  const list = document.querySelector('[data-testid="' + prefix + '"]')
  if (!list) return null
  const rows = Array.from(list.querySelectorAll('.ss-history__row'))
  return {
    density: list.dataset.density,
    rows: rows.map((row) => ({
      id: row.dataset.testid.replace(prefix + '-row-', ''),
      selected: row.dataset.selected === 'true',
      avatar: row.querySelector('.ss-history__avatar')?.textContent ?? null,
      tone: row.querySelector('.ss-history__avatar')?.dataset.tone ?? null,
      title: row.querySelector('.ss-history__title')?.textContent ?? null,
      meta: row.querySelector('.ss-history__meta')?.textContent ?? null,
      metaTitleAttr: row.querySelector('.ss-history__meta')?.getAttribute('title') ?? null,
      hasDisclosure: !!row.querySelector('.ss-history__disclose'),
      pin: row.querySelector('.ss-history__pin')?.textContent ?? null,
    })),
  }
})`

async function main() {
  const app = await startApp({
    label: 'compare-history-figma',
    build: 'track-diff-ui-history-figma',
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
    await delay(600)

    // ---- 1 · the Compare button joined the chrome -------------------------
    /*
     * Geometry, not a class name. The old button was styled to look like a
     * button and positioned 4px BELOW the shell, which no class assertion would
     * have caught — only "is its box inside the shell's box" does.
     */
    const trigger = await evaluate(app.page, `(() => {
      const button = document.querySelector('[data-testid="compare-open"]')
      const shell = document.querySelector('[data-testid="systemsketch-top-right-shell"]')
      if (!button || !shell) return null
      const b = button.getBoundingClientRect()
      const s = shell.getBoundingClientRect()
      return {
        inShellDom: shell.contains(button),
        insideBox: b.top >= s.top - 1 && b.bottom <= s.bottom + 1 && b.left >= s.left - 1 && b.right <= s.right + 1,
        floatingSlots: document.querySelectorAll('.systemsketch-compare-trigger-slot').length,
        position: getComputedStyle(button).position,
        label: button.getAttribute('aria-label'),
        shortcut: button.getAttribute('aria-keyshortcuts'),
      }
    })()`)
    assert.ok(trigger, 'the Compare button and the top-right shell both render')
    assert.equal(trigger.inShellDom, true, 'the button is a CHILD of the top-right shell')
    assert.equal(trigger.insideBox, true, 'and its box sits inside the shell, not below it')
    assert.equal(trigger.floatingSlots, 0, 'the absolutely-positioned floating slot is gone')
    assert.notEqual(trigger.position, 'absolute', `it is laid out by the shell, got ${trigger.position}`)
    assert.equal(trigger.label, 'Compare changes', 'the label survives as an accessible name')
    assert.equal(trigger.shortcut, 'Shift+D', 'and the shortcut is advertised')
    pass('the Compare button is inside the top-right shell — no floating pill, no absolute position')
    await capture(app.page, 'history-figma-trigger-in-shell.png')

    await clickElement(app.page, '[data-testid="compare-open"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-dialog"]')`, 'modal')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-dialog"] .tl-container').length === 2`,
      'both boards mounted',
    )
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-history-panel"] .ss-history__row').length >= 3`,
      'history rows',
    )
    await delay(1200)
    pass('the modal opens on a board that has real .v1 / .v2 versions beside it')

    // ---- 2 · Figma's row anatomy ------------------------------------------
    const board = await evaluate(app.page, `${READ_LIST}('compare-history')`)
    assert.ok(board, 'the board history list rendered')
    assert.equal(board.density, 'comfortable', 'the rail runs at comfortable density')
    assert.equal(board.rows.length, 3, `three versions: ${board.rows.map((r) => r.id).join(', ')}`)

    // Newest first, the way Figma lists them.
    assert.equal(board.rows[0].id, 'current', `newest first, got ${board.rows.map((r) => r.id).join(' → ')}`)
    assert.equal(board.rows[2].id, 'v1', 'and the oldest is last')
    pass(`the rail lists newest first (${board.rows.map((r) => r.id).join(' → ')})`)

    for (const row of board.rows) {
      assert.ok(row.avatar, `row ${row.id} has a circular slot with content`)
      assert.ok(row.title && row.title.length > 0, `row ${row.id} has a title`)
      assert.ok(row.meta && row.meta.length > 0, `row ${row.id} has a secondary line`)
    }
    pass('every row is avatar · title · secondary line — Figma\'s anatomy')

    // ---- 3 · the data is measured, and no author is invented --------------
    /*
     * The single most important assertion in this file.
     *
     * A history panel is trivially easy to make look excellent with fabricated
     * rows, and this app has NO author identity and NO change log. So: the
     * titles must be measured from the diff (not "Version 1"), the timestamps
     * must be real, and no row may carry a person's name.
     */
    const saved = board.rows.filter((row) => row.id !== 'current')
    const measured = saved.filter((row) =>
      /^(Added|Removed|Edited) \S+/.test(row.title)
      || /\d+ (added|removed|edited)/.test(row.title)
      || /^Earliest recorded version$/.test(row.title),
    )
    assert.equal(
      measured.length,
      saved.length,
      `every saved version's title is measured from the diff, not its filename: `
      + `${saved.map((r) => r.title).join(' | ')}`,
    )
    assert.ok(
      board.rows.every((row) => !/^Version \d+$/.test(row.title)),
      `no row falls back to a bare "Version N": ${board.rows.map((r) => r.title).join(' | ')}`,
    )
    // The live row is labelled plainly — but its measurement must survive into
    // the description rather than being dropped for the sake of a short title.
    const currentRow = board.rows.find((row) => row.id === 'current')
    assert.equal(currentRow.title, 'Current version', `the live row is labelled plainly, got "${currentRow.title}"`)
    assert.equal(currentRow.hasDisclosure, true, 'and still carries its measurement behind a disclosure')
    pass(`titles are measured: ${board.rows.map((r) => r.title).join(' | ')}`)

    // Relative time, Figma's phrasing, on rows whose files have real mtimes.
    const dated = board.rows.filter((row) => /(just now|minutes? ago|hours? ago|days? ago|\d{4})/.test(row.meta))
    assert.equal(dated.length, board.rows.length, `every row shows a real time: ${board.rows.map((r) => r.meta).join(' | ')}`)
    assert.ok(
      board.rows.every((row) => row.metaTitleAttr && !/No timestamp/.test(row.metaTitleAttr)),
      'and the absolute stamp is reachable behind it',
    )
    pass(`every row carries a real relative timestamp (${board.rows.map((r) => r.meta).join(' | ')})`)

    // No fabricated author anywhere. The meta line is `<when>` alone — the
    // ` · <name>` half only renders with an author, and there is never one.
    assert.ok(
      board.rows.every((row) => !row.meta.includes('·')),
      `no author is invented on any row: ${board.rows.map((r) => r.meta).join(' | ')}`,
    )
    const authorAvatars = await evaluate(
      app.page,
      `(() => document.querySelectorAll('.ss-history__avatar[data-kind="author"]').length)()`,
    )
    assert.equal(authorAvatars, 0, 'and no row draws an author avatar it cannot fill')
    pass('no author is fabricated — the app records none, so no row shows one')

    // The selected row is TINTED, and measurably different from its neighbours.
    const tint = await evaluate(app.page, `(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid="compare-history-panel"] .ss-history__row'))
      const selected = rows.find((row) => row.dataset.selected === 'true')
      const plain = rows.find((row) => row.dataset.selected !== 'true')
      const bar = selected ? getComputedStyle(selected, '::before') : null
      return {
        selectedId: selected?.dataset.testid ?? null,
        selectedBg: selected ? getComputedStyle(selected).backgroundColor : null,
        plainBg: plain ? getComputedStyle(plain).backgroundColor : null,
        titleColour: selected ? getComputedStyle(selected.querySelector('.ss-history__title')).color : null,
        barWidth: bar?.width ?? null,
        barColour: bar?.backgroundColor ?? null,
      }
    })()`)
    const selectedBg = await evaluate(app.page, `${RGB}(${JSON.stringify(tint.selectedBg)})`)
    const plainBg = await evaluate(app.page, `${RGB}(${JSON.stringify(tint.plainBg)})`)
    assert.ok(selectedBg.a > 0, `the selected row paints a tint, got ${tint.selectedBg}`)
    assert.equal(plainBg.a, 0, `an unselected row paints nothing, got ${tint.plainBg}`)
    assert.equal(tint.barWidth, '2px', `and carries the accent bar, got ${tint.barWidth}`)
    /*
     * The title on that tint must be INK, not accent.
     *
     * accent-on-accent-soft measures 2.6–4.3:1 in every palette this app ships,
     * which is under the floor for body text — so the accent is allowed to be
     * the bar and nothing else. The check is therefore "is the title a different
     * colour from the bar", which is the rule stated directly, rather than a
     * contrast ratio against the tint: `--ss-accent-soft` resolves to a
     * translucent `color(srgb …)`, so its computed value is the UNCOMPOSITED
     * token and any ratio computed from it would be measuring a colour that is
     * never actually painted.
     */
    const titleColour = await evaluate(app.page, `${RGB}(${JSON.stringify(tint.titleColour)})`)
    const barColour = await evaluate(app.page, `${RGB}(${JSON.stringify(tint.barColour)})`)
    const separation = Math.hypot(
      titleColour.r - barColour.r,
      titleColour.g - barColour.g,
      titleColour.b - barColour.b,
    )
    assert.ok(
      separation > 100,
      `the title is ink, not the accent the bar uses — separation ${separation.toFixed(0)} `
      + `(title ${tint.titleColour}, bar ${tint.barColour})`,
    )
    assert.ok(barColour.b > barColour.r, `and the bar itself IS the accent, got ${tint.barColour}`)
    pass(
      `the selected row is a tint + accent bar with ink copy `
      + `(title ${tint.titleColour}, bar ${tint.barColour}, ${separation.toFixed(0)} apart)`,
    )

    // ---- 4 · the description discloses without moving the diff ------------
    const withDescription = board.rows.find((row) => row.hasDisclosure && !row.selected)
    assert.ok(withDescription, `at least one row carries a description: ${JSON.stringify(board.rows.map((r) => [r.id, r.hasDisclosure]))}`)
    const beforeDisclose = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="compare-history-panel"] .ss-history__row[data-selected]').dataset.testid)()`,
    )
    await clickElement(app.page, `[data-testid="compare-history-disclose-${withDescription.id}"]`)
    await delay(250)
    const disclosed = await evaluate(app.page, `(() => {
      const body = document.querySelector('[data-testid="compare-history-description-${withDescription.id}"]')
      return {
        text: body?.textContent ?? null,
        stillSelected: document.querySelector('[data-testid="compare-history-panel"] .ss-history__row[data-selected]').dataset.testid,
        expanded: document.querySelector('[data-testid="compare-history-disclose-${withDescription.id}"]').getAttribute('aria-expanded'),
      }
    })()`)
    assert.ok(disclosed.text && disclosed.text.length > 0, 'the description appears')
    assert.equal(disclosed.expanded, 'true', 'and the control reports itself expanded')
    assert.equal(
      disclosed.stillSelected,
      beforeDisclose,
      'reading a row does NOT re-point the diff at it — the chevron is not the row',
    )
    pass(`the description discloses on its own control without moving the diff ("${disclosed.text.slice(0, 60)}…")`)
    await capture(app.page, 'history-figma-board-rail.png')

    // ---- 5 · the dock switch, right ↔ bottom ------------------------------
    await clickElement(app.page, `[data-testid="compare-element-${BLOCK_ELEMENT}"]`)
    await delay(500)
    await clickElement(app.page, '[data-testid="compare-highlight-checkbox"]')
    await delay(200)

    const readPlacement = `(() => {
      const body = document.querySelector('.systemsketch-compare__body')
      const detail = document.querySelector('.systemsketch-compare__detail')
      const stage = document.querySelector('.systemsketch-compare__stage')
      const rail = document.querySelector('[data-testid="compare-history-panel"]')
      const d = detail.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      const r = rail.getBoundingClientRect()
      return {
        dock: body.dataset.dock,
        detail: { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) },
        stage: { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.width), h: Math.round(s.height) },
        railHeight: Math.round(r.height),
        belowStage: d.top >= s.bottom - 2,
        rightOfStage: d.left >= s.right - 2,
        // state that must survive the move
        layout: document.querySelector('[data-testid="compare-property-table"]')?.dataset.layout ?? null,
        ink: document.querySelector('[data-testid="compare-property-table"]')?.dataset.gitHighlight ?? null,
        checkbox: document.querySelector('[data-testid="compare-highlight-checkbox"]').checked,
        tab: Array.from(document.querySelectorAll('[data-testid="compare-dialog"] .block-inspector__tabs [role="tab"]'))
          .filter((b) => b.classList.contains('is-active')).map((b) => b.textContent),
        element: document.querySelector('[data-testid="compare-element-list"] button[data-selected]')?.dataset.testid ?? null,
        rows: document.querySelectorAll('[data-testid="compare-property-table"] tbody tr[data-change-id]').length,
      }
    })()`

    const right = await evaluate(app.page, readPlacement)
    assert.equal(right.dock, 'right', 'the panel starts docked right')
    assert.equal(right.rightOfStage, true, 'and sits to the right of the boards')
    assert.equal(right.ink, 'on', 'the ink toggle was switched on before the move')

    await clickElement(app.page, '[data-testid="compare-dock-toggle"]')
    await delay(700)
    const bottom = await evaluate(app.page, readPlacement)
    assert.equal(bottom.dock, 'bottom', 'the toggle docks it to the bottom')
    assert.equal(bottom.belowStage, true, `and it sits BELOW the boards (detail y=${bottom.detail.y}, stage bottom=${bottom.stage.y + bottom.stage.h})`)
    assert.ok(
      bottom.stage.w > right.stage.w + 200,
      `the boards take the width back: ${right.stage.w}px → ${bottom.stage.w}px`,
    )
    assert.ok(
      bottom.detail.w > right.detail.w + 200,
      `and the panel spans the width it gained: ${right.detail.w}px → ${bottom.detail.w}px`,
    )
    // The rail is navigation and keeps its full height in both placements.
    assert.ok(
      Math.abs(bottom.railHeight - right.railHeight) < 4,
      `the History rail keeps full height (${right.railHeight}px → ${bottom.railHeight}px)`,
    )
    pass(`docking to the bottom widens the boards ${right.stage.w}→${bottom.stage.w}px and the panel ${right.detail.w}→${bottom.detail.w}px`)

    // Nothing may be lost on a mode change — the same discipline as fullscreen.
    assert.equal(bottom.layout, right.layout, `the table layout survived (${bottom.layout})`)
    assert.equal(bottom.ink, 'on', 'the ink toggle survived')
    assert.equal(bottom.checkbox, true, 'and its checkbox agrees')
    assert.deepEqual(bottom.tab, right.tab, `the active tab survived (${bottom.tab.join(',')})`)
    assert.equal(bottom.element, right.element, `the selected element survived (${bottom.element})`)
    assert.equal(bottom.rows, right.rows, `and the same ${bottom.rows} rows are still shown`)
    pass('the move preserves tab, layout, ink, selected element and rows — the subtree never unmounts')

    /*
     * And the boards RE-FRAME for the stage they now have.
     *
     * The first build of this dock kept the camera, which is what "preserve
     * state" naively asks for and is wrong: a framing computed for a tall narrow
     * pane, replayed into a short wide one, cut the bottom off the board. Only a
     * screenshot showed it. This asserts the selected change is actually visible
     * inside the pane afterwards, which is the property that was violated.
     */
    const framed = await evaluate(app.page, `(() => {
      const pane = document.querySelector('[data-testid="compare-canvas-after"]').getBoundingClientRect()
      const mark = document.querySelector('[data-testid="compare-canvas-after"] [data-testid="compare-highlight-mark"]')
      if (!mark) return { mark: false }
      const m = mark.getBoundingClientRect()
      return {
        mark: true,
        inside: m.top >= pane.top - 1 && m.bottom <= pane.bottom + 1
          && m.left >= pane.left - 1 && m.right <= pane.right + 1,
        offCentreY: Math.abs((m.top + m.height / 2) - (pane.top + pane.height / 2)) / pane.height,
      }
    })()`)
    assert.equal(framed.mark, true, 'the selected change still draws its mark after the dock move')
    assert.equal(framed.inside, true, 'and the mark is fully inside the re-shaped pane, not cut off')
    assert.ok(
      framed.offCentreY < 0.3,
      `and is re-centred for the shorter pane, ${(framed.offCentreY * 100).toFixed(0)}% off centre`,
    )
    pass(`the boards re-frame for the new stage shape (${(framed.offCentreY * 100).toFixed(0)}% off centre, fully visible)`)
    await capture(app.page, 'history-figma-dock-bottom.png')

    // The Code tab must be usable down there too, not just the table.
    await clickElement(app.page, '[data-testid="compare-tab-code"]')
    await delay(400)
    const codeAtBottom = await evaluate(app.page, `(() => {
      const detail = document.querySelector('.systemsketch-compare__detail').getBoundingClientRect()
      const code = document.querySelector('.systemsketch-compare__detail pre, .systemsketch-compare__detail code')
      const c = code?.getBoundingClientRect()
      return { present: !!code, insideDetail: c ? c.top >= detail.top - 1 && c.left >= detail.left - 1 : false }
    })()`)
    assert.equal(codeAtBottom.present, true, 'the Code view renders while docked at the bottom')
    assert.equal(codeAtBottom.insideDetail, true, 'and stays inside the docked panel')
    pass('the Code tab works in the bottom dock, not only the table')
    await capture(app.page, 'history-figma-dock-bottom-code.png')
    await clickElement(app.page, '[data-testid="compare-tab-properties"]')
    await delay(300)

    await clickElement(app.page, '[data-testid="compare-dock-toggle"]')
    await delay(700)
    const backToRight = await evaluate(app.page, readPlacement)
    assert.equal(backToRight.dock, 'right', 'the toggle returns it to the right')
    assert.equal(backToRight.rightOfStage, true, 'and it is beside the boards again')
    assert.equal(backToRight.element, right.element, 'the selected element survived the return trip')
    assert.equal(backToRight.ink, 'on', 'and so did the ink toggle')
    assert.equal(backToRight.rows, right.rows, `and the same ${backToRight.rows} rows`)
    pass('the return trip restores the right dock with every piece of state intact')

    // ---- 6 · the SAME list in a Block's own inspector ---------------------
    await clickElement(app.page, '[data-testid="compare-close"]')
    await waitFor(app.page, `!document.querySelector('[data-testid="compare-dialog"]')`, 'modal closed')
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getCurrentPageShapes().find((shape) => shape.id === 'shape:predict')
      editor.setCurrentTool('select')
      editor.select(block.id)
      return block.id
    })()`)
    await waitFor(app.page, `!!document.querySelector('.block-inspector__tabs')`, 'Block inspector open')
    await delay(400)

    const tabs = await evaluate(app.page, `(() => {
      const strip = document.querySelector('.block-inspector .block-inspector__tabs')
      const buttons = Array.from(strip.querySelectorAll('[role="tab"]'))
      const stripBox = strip.getBoundingClientRect()
      const span = buttons[buttons.length - 1].getBoundingClientRect().right - buttons[0].getBoundingClientRect().left
      return {
        labels: buttons.map((b) => b.textContent.trim()),
        stripWidth: stripBox.width,
        tabsWidth: span,
      }
    })()`)
    assert.deepEqual(tabs.labels, ['Details', 'Notes', 'History'], `History joins the strip: ${tabs.labels.join(' / ')}`)
    // The inherited compact-tabs fix must still hold with a third tab.
    assert.ok(
      tabs.tabsWidth < tabs.stripWidth * 0.9,
      `three tabs still hug their labels — ${tabs.tabsWidth.toFixed(0)}px of ${tabs.stripWidth.toFixed(0)}px`,
    )
    pass(`the Block inspector grows a History tab and still hugs (${tabs.tabsWidth.toFixed(0)}px of ${tabs.stripWidth.toFixed(0)}px)`)

    await clickElement(app.page, '[data-testid="block-inspector-tab-history"]')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="element-history-panel"]')?.dataset.state === 'ready'`,
      'element history loaded',
    )
    await delay(400)

    const element = await evaluate(app.page, `${READ_LIST}('element-history')`)
    assert.ok(element, 'the element history list rendered')
    assert.equal(element.density, 'compact', 'and runs at compact density in the narrower panel')
    assert.ok(element.rows.length >= 1, `it has rows: ${element.rows.length}`)

    /*
     * The unity claim, proved structurally rather than by eye.
     *
     * Both mounts must produce the SAME class names in the SAME nesting — that
     * is what a shared component means and what a re-skin would fail. The
     * densities differ, which is the only thing that is allowed to.
     */
    const unity = await evaluate(app.page, `(() => {
      const shape = (root) => {
        const row = root.querySelector('.ss-history__row')
        if (!row) return null
        return {
          hasAvatar: !!row.querySelector('.ss-history__avatar'),
          hasTitle: !!row.querySelector('.ss-history__title'),
          hasMeta: !!row.querySelector('.ss-history__meta'),
          pickIsButton: row.querySelector('.ss-history__pick')?.tagName ?? null,
          // The row's own class list, which a re-skin would have changed.
          classes: row.className,
        }
      }
      return { element: shape(document.querySelector('[data-testid="element-history"]')) }
    })()`)
    assert.ok(unity.element, 'the element list produced a row')
    assert.equal(unity.element.hasAvatar, true, 'with the same avatar element')
    assert.equal(unity.element.hasTitle, true, 'the same title element')
    assert.equal(unity.element.hasMeta, true, 'the same meta element')
    assert.equal(unity.element.pickIsButton, 'BUTTON', 'and the same button anatomy')
    assert.equal(unity.element.classes, 'ss-history__row', 'no per-mount class was bolted on')
    pass('the inspector list is the SAME component: identical row classes, only the density differs')

    // The honest gap must be visible in the panel, not only in a report.
    const provenance = await evaluate(
      app.page,
      `(() => document.querySelector('[data-testid="element-history-provenance"]')?.textContent ?? null)()`,
    )
    assert.ok(provenance, 'the panel states where its rows came from')
    assert.ok(
      /does not record who made a change/.test(provenance),
      `and says plainly that no author is recorded: "${provenance}"`,
    )
    assert.ok(/compar/i.test(provenance), 'and that the history is derived by comparison, not logged')
    pass(`the panel states its own provenance in words ("${provenance.trim().slice(0, 78)}…")`)
    await capture(app.page, 'history-figma-element-tab.png')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the whole journey emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} history-figma checks passed.\n`)
}


main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
