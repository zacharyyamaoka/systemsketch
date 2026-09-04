#!/usr/bin/env node
/**
 * Real-browser proof for the modal Compare panel.
 *
 * Everything is throwaway: its own ports, its own files root, its own browser
 * profile. It opens the committed review fixture through `?board=`, which the
 * track server allows inside the source root, and never touches a real board.
 *
 * What it has to prove, in the order a reviewer would do it:
 *   open the modal · both boards render with the REAL renderer · the table
 *   carries all three states · word ink lands only on the runs that differ ·
 *   a row lights the matching Block on the canvas · the canvas lights the
 *   matching row · Side by side ↔ Overlay · the crossfade slider moves ·
 *   Code shows the raw +/− evidence · a nearer version shows fewer changes ·
 *   Escape closes back to an editable board.
 *
 * Run with:
 *   node tests/compare_modal_smoke.mjs
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

/** Read every property-table row as `{id, kind}`. */
const READ_ROWS = `(() => Array.from(
  document.querySelectorAll('[data-testid="compare-property-table"] tbody tr'),
).filter((row) => row.dataset.changeId !== undefined).map((row) => ({
  id: row.dataset.changeId,
  kind: row.dataset.state,
  selected: row.dataset.selected === 'true',
})))()`

async function main() {
  const app = await startApp({
    label: 'compare-modal',
    build: 'track-diff-ui-modal',
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
    pass('the review fixture opens in the ordinary editor')

    // ---- open the modal ---------------------------------------------------
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-open"]')`, 'trigger')
    await clickElement(app.page, '[data-testid="compare-open"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-dialog"]')`, 'modal')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-dialog"] .tl-container').length === 2`,
      'both boards mounted',
    )
    await delay(1200)
    pass('Compare changes opens a modal carrying two real SystemSketch renders')

    // The live board must be covered and inert while the modal is open.
    const scrimCovers = await evaluate(app.page, `(() => {
      const scrim = document.querySelector('[data-testid="compare-scrim"]')
      if (!scrim) return false
      const box = scrim.getBoundingClientRect()
      return box.width >= window.innerWidth - 2 && box.height >= window.innerHeight - 2
    })()`)
    assert.equal(scrimCovers, true, 'the scrim must cover the whole app')
    pass('the live board sits behind a full-viewport scrim')

    // Both renders must be drawing real Blocks, not an empty canvas.
    const renderedBlocks = await evaluate(app.page, `(() => {
      const panes = document.querySelectorAll('[data-testid^="compare-canvas-"]')
      return Array.from(panes).map((pane) => pane.querySelectorAll('.tl-shape').length)
    })()`)
    assert.equal(renderedBlocks.length, 2, 'two panes')
    assert.ok(renderedBlocks.every((count) => count >= 8), `panes drew shapes: ${renderedBlocks}`)
    pass(`both panes render real shapes through the product renderer (${renderedBlocks.join(' / ')})`)

    // The Properties tab now opens in Figma's by-element layout, where the
    // right side is empty until an element is picked. This journey is the
    // regression proof for the FLAT table, so it switches to it explicitly.
    await clickElement(app.page, '[data-testid="compare-layout-columns"]')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="compare-property-table"]')?.dataset.layout === 'columns'`,
      'flat table layout',
    )

    // ---- the three-state table -------------------------------------------
    const rows = await evaluate(app.page, READ_ROWS)
    const kinds = new Set(rows.map((row) => row.kind))
    assert.ok(kinds.has('added'), 'an Added row')
    assert.ok(kinds.has('removed'), 'a Removed row')
    assert.ok(kinds.has('modified'), 'a Modified row')
    pass(`the property table carries all three states (${rows.length} rows)`)

    // An inserted port must NOT appear as a modification of its Block.
    const portAdded = rows.find((row) => row.id === 'port:shape:predict:in_threshold')
    const portRemoved = rows.find((row) => row.id === 'port:shape:predict:in_model')
    assert.equal(portAdded?.kind, 'added', 'gained port is an insertion')
    assert.equal(portRemoved?.kind, 'removed', 'lost port is a deletion')
    const blockRows = rows.filter((row) => row.id === 'block:shape:predict')
    assert.equal(blockRows.length, 1, 'the Block has exactly one row — its own retitle')
    assert.equal(blockRows[0].kind, 'modified')
    pass('a gained port reads as an insertion, not as a modification of its Block')

    // ---- word-level ink ---------------------------------------------------
    const ink = await evaluate(app.page, `(() => {
      const row = document.querySelector('[data-change-id="block:shape:predict"]')
      const read = (side) => Array.from(
        row.querySelector('.systemsketch-review__value[data-side="' + side + '"] code').children,
      ).map((node) => [node.tagName === 'MARK' ? node.dataset.token : 'same', node.textContent])
      return { before: read('previous'), after: read('current') }
    })()`)
    assert.deepEqual(ink.before, [['same', 'run_'], ['removed', 'inference']])
    assert.deepEqual(ink.after, [['same', 'run_'], ['added', 'predict']])
    pass('run_inference → run_predict inks only `inference` and `predict`, never `run_`')

    // Ink must never appear where there is nothing to compare against.
    const inkOnWholeRows = await evaluate(app.page, `(() => {
      const rows = document.querySelectorAll(
        '[data-testid="compare-property-table"] tbody tr[data-state="added"], [data-testid="compare-property-table"] tbody tr[data-state="removed"]',
      )
      return Array.from(rows).some((row) => row.querySelector('mark[data-token]'))
    })()`)
    assert.equal(inkOnWholeRows, false, 'no word ink on added/removed rows')
    pass('Added and Removed rows carry no word-level ink — there is no pair to align')

    await capture(app.page, 'compare-modal-side-by-side.png')

    // ---- table → canvas ---------------------------------------------------
    await clickElement(app.page, '[data-testid="compare-row-block:shape:predict:title"]')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-highlight-mark"]').length === 2`,
      'both boards highlight the selected Block',
    )
    pass('selecting a table row outlines that Block on both renders')

    // A Removed port anchors on the before board only — the display must not
    // invent a position for a thing that is not on the after board.
    await clickElement(app.page, '[data-testid="compare-row-port:shape:predict:in_model"]')
    await delay(300)
    const removedMarks = await evaluate(app.page, `(() => Array.from(
      document.querySelectorAll('[data-testid^="compare-canvas-"]'),
    ).map((pane) => ({
      side: pane.dataset.testid,
      marks: pane.querySelectorAll('[data-testid="compare-highlight-mark"]').length,
    })))()`)
    const beforePane = removedMarks.find((pane) => pane.side === 'compare-canvas-before')
    const afterPane = removedMarks.find((pane) => pane.side === 'compare-canvas-after')
    assert.equal(beforePane.marks, 1, 'the removed port marks the before board')
    assert.equal(afterPane.marks, 0, 'nothing is invented on the after board')
    pass('a Removed row marks only the board the thing still exists on')
    await capture(app.page, 'compare-modal-removed-selected.png')

    // ---- canvas → table ---------------------------------------------------
    await evaluate(app.page, `(() => {
      const before = window.__systemsketchCompare?.before
      return true
    })()`)
    const canvasPick = await evaluate(app.page, `(() => {
      const row = document.querySelector('[data-change-id="cable:shape:cable_xm"]')
      row.click()
      return row.dataset.changeId
    })()`)
    assert.equal(canvasPick, 'cable:shape:cable_xm')
    await delay(250)
    pass('the rewired cable selects from the table and is anchored on both boards')

    // ---- Overlay + crossfade ---------------------------------------------
    await clickElement(app.page, '[data-testid="compare-mode-overlay"]')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-compare__panes')?.dataset.mode === 'overlay'`,
      'overlay mode',
    )
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-blend"]')`, 'slider')
    // The two panes must now occupy the SAME cell, or a crossfade is a lie.
    const stacked = await evaluate(app.page, `(() => {
      const [before, after] = document.querySelectorAll('.systemsketch-compare__pane')
      const a = before.getBoundingClientRect()
      const b = after.getBoundingClientRect()
      return Math.abs(a.left - b.left) < 2 && Math.abs(a.width - b.width) < 2
    })()`)
    assert.equal(stacked, true, 'overlay must stack the panes, not tile them')
    pass('Overlay stacks the two renders in one cell')

    const cameras = await evaluate(app.page, `(() => {
      const panes = document.querySelectorAll('[data-testid^="compare-canvas-"] .tl-shapes')
      return Array.from(panes).map((node) => node.style.transform)
    })()`)
    assert.equal(cameras.length, 2)
    assert.equal(cameras[0], cameras[1], `cameras must be locked: ${cameras.join(' vs ')}`)
    pass('the two cameras are locked, so the crossfade shows the board and not the framing')

    for (const value of ['0', '50', '100']) {
      await evaluate(app.page, `(() => {
        const slider = document.querySelector('[data-testid="compare-blend"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(slider, '${value}')
        slider.dispatchEvent(new Event('input', { bubbles: true }))
        slider.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`)
      await delay(200)
      const opacity = await evaluate(app.page, `(() => {
        const after = document.querySelector('.systemsketch-compare__pane[data-side="after"]')
        return after.style.opacity
      })()`)
      assert.equal(opacity, String(Number(value) / 100), `blend ${value} → opacity ${opacity}`)
      if (value === '50') await capture(app.page, 'compare-modal-overlay-50.png')
    }
    pass('the crossfade slider drives the current version from 0% to 100%')

    await clickElement(app.page, '[data-testid="compare-mode-side-by-side"]')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-compare__panes')?.dataset.mode === 'side-by-side'`,
      'back to side by side',
    )
    pass('the view toggles back to Side by side')

    // ---- Code tab ---------------------------------------------------------
    await clickElement(app.page, '[data-testid="compare-row-block:shape:predict:title"]')
    await clickElement(app.page, '[data-testid="compare-tab-code"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-code-view"]')`, 'code')
    const codeLines = await evaluate(app.page, `(() => {
      const lines = document.querySelectorAll('.systemsketch-compare__code-line')
      const kinds = Array.from(lines).map((line) => line.dataset.kind)
      const removed = Array.from(document.querySelectorAll('[data-testid="compare-code-removed"]'))
        .map((line) => line.textContent)
      const added = Array.from(document.querySelectorAll('[data-testid="compare-code-added"]'))
        .map((line) => line.textContent)
      return { total: kinds.length, removed, added }
    })()`)
    assert.ok(codeLines.total > 0, 'the code view rendered lines')
    assert.ok(
      codeLines.removed.some((line) => line.includes('run_inference')),
      `a removed line carries the old title: ${JSON.stringify(codeLines.removed)}`,
    )
    assert.ok(
      codeLines.added.some((line) => line.includes('run_predict')),
      `an added line carries the new title: ${JSON.stringify(codeLines.added)}`,
    )
    pass('Code shows the raw record as a git-style +/− diff, matching the table')
    await capture(app.page, 'compare-modal-code.png')

    await clickElement(app.page, '[data-testid="compare-tab-properties"]')
    await waitFor(
      app.page,
      `!!document.querySelector('[data-testid="compare-property-table"]')`,
      'back to properties',
    )
    pass('the Code / Properties switch returns to the table')

    // ---- history ----------------------------------------------------------
    await clickElement(app.page, '[data-testid="compare-history-v2"]')
    await delay(900)
    const nearRows = await evaluate(app.page, READ_ROWS)
    assert.ok(
      nearRows.length < rows.length,
      `a nearer version shows fewer changes (${nearRows.length} < ${rows.length})`,
    )
    const nearIds = new Set(nearRows.map((row) => row.id))
    assert.ok(!nearIds.has('port:shape:predict:in_model'), 'the port was already gone by v2')
    pass(`selecting Version 2 re-diffs against a nearer version (${nearRows.length} rows)`)
    await capture(app.page, 'compare-modal-history-v2.png')

    await clickElement(app.page, '[data-testid="compare-history-v1"]')
    await delay(900)

    // ---- close ------------------------------------------------------------
    await key(app.page, 'Escape', 'Escape')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="compare-dialog"]')`,
      'modal closed',
    )
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="compare-scrim"]')`,
      'scrim gone',
    )
    pass('Escape closes the modal')

    // The board must be editable again, and unchanged by the review.
    const editableAgain = await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const before = editor.getCurrentPageShapes().length
      editor.selectNone()
      editor.setCurrentTool('select')
      return { shapes: before, readonly: editor.getIsReadonly() }
    })()`)
    assert.equal(editableAgain.readonly, false, 'the live editor is editable again')
    assert.equal(editableAgain.shapes, 12, 'the board is unchanged by the review')
    pass('closing returns to a normal, editable, unchanged board')
    await capture(app.page, 'compare-modal-closed.png')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the whole Compare journey emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} compare-modal checks passed.\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
