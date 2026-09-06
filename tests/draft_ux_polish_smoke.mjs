#!/usr/bin/env node
/**
 * Real-browser proof for the UX-polish pass over document-draft branching —
 * the regression guard for this task, the same way `draft_merge_guard_smoke.mjs`
 * guards the correctness fix it followed. Driven against a throwaway scratch
 * board on the harness's own ports — never a real board, never 4321-4323.
 *
 * Covers, in order:
 *
 * 1. THE ORIGINAL REPORTED BUG. `beginRename` opens the rename input on a
 *    single click and selects its text; a user's habitual double-click's
 *    second click lands ~90-200ms later on the now-different element (the
 *    freshly-mounted `<input>`, not the button) — a plain click-inside-a-
 *    focused-input, which collapses the selection to a caret. Typing then
 *    inserts mid-word instead of replacing. Exercised at BOTH rename sites
 *    that share the bug: the draft bar's own name (where the second click
 *    lands at the SAME coordinates the trigger occupied, the literal repro),
 *    and the popover's `InlineRename` row control (whose pencil trigger does
 *    NOT sit where its input appears, so this drives the second click onto
 *    the input directly — the same guarded code path, exercised at the point
 *    that actually matters).
 *
 * 2. A draft that only MOVES a shape (no `props` touched) must still be
 *    promotable: `compareBoards` structurally cannot see `x`/`y`, so the
 *    "Compare N Changes" badge staying truthfully at 0 must NOT disable
 *    Merge/Rebase — those gate on `hasUnpromotedEdits`, a raw digest of the
 *    draft's stored source, not on the display diff.
 *
 * 3. Merge is confirmed somewhere OTHER than the button. This used to be a
 *    two-step confirm on the button itself (click to arm, click to merge);
 *    that has been replaced — not dropped — by a review: one click opens the
 *    Compare dialog on the same Draft-vs-Main diff, with the confirm at the
 *    bottom of it. What this section still proves is unchanged and is the
 *    reason it exists: a SINGLE click on Merge must never merge anything.
 *    (`draft_merge_review_smoke.mjs` is the journey that covers the review
 *    itself — the checkboxes, the refusal, the Rebase preview.)
 *
 *    The draft under test here is MOVE-ONLY, which makes it the one place that
 *    exercises the zero-display-changes confirm label: `compareBoards` cannot
 *    see `x`/`y`, so "Merge 0 changes" would be the naive text for a draft
 *    that is nonetheless perfectly mergeable.
 *
 * Run with:
 *   node tests/draft_ux_polish_smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const { checks, pass } = makeChecklist()

async function readBoardRecords(path) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

async function waitForRecordOnDisk(path, recordId, predicate = () => true, timeoutMs = 8000) {
  const start = Date.now()
  for (;;) {
    try {
      const document = await readBoardRecords(path)
      const record = document.records.find((r) => r.id === recordId)
      if (record && predicate(record)) return document
    } catch {
      // file not written yet, or mid-write — keep polling
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timed out waiting for ${recordId} on disk at ${path}`)
    }
    await delay(150)
  }
}

/**
 * The literal repro from the bug report: click once (opens the rename input,
 * selecting its full text), wait ~150ms — squarely inside the mousedown-guard
 * window and squarely where a real double-click's second click lands — then
 * click AGAIN at the same coordinates, landing on the now-mounted input. If
 * the guard works, that second click leaves the selection intact rather than
 * collapsing it to a caret, so typing replaces the old name outright.
 */
async function doubleClickRename(page, triggerSelector) {
  const box = await elementBox(page, triggerSelector)
  await mouse(page, 'mouseMoved', box.cx, box.cy)
  await mouse(page, 'mousePressed', box.cx, box.cy, { buttons: 1 })
  await mouse(page, 'mouseReleased', box.cx, box.cy)
  await delay(150)
  await mouse(page, 'mousePressed', box.cx, box.cy, { buttons: 1 })
  await mouse(page, 'mouseReleased', box.cx, box.cy)
  await delay(80)
}

/**
 * The popover's pencil button does NOT sit where its own rename input ends
 * up — opening rename replaces the row's `__main` slot, not the actions
 * cluster the pencil lives in — so a real double-click's second click cannot
 * land on the input by hitting the same coordinates the way the bar's does.
 * What is identical is the code path this exists to protect: `InlineRename`'s
 * `mousedown` guard on the input itself. This exercises that guard directly —
 * open rename with one click, then fire the second one at the ~150ms mark
 * squarely on the now-mounted input — which is the scenario a slightly
 * off-target real double-click (or a fast deliberate two-click) produces.
 */
async function openThenRapidSecondClickOnInput(page, triggerSelector, inputSelector) {
  await clickElement(page, triggerSelector)
  await waitFor(page, `!!document.querySelector('${inputSelector}')`, 'rename input mounted')
  const box = await elementBox(page, inputSelector)
  await delay(150)
  await mouse(page, 'mousePressed', box.cx, box.cy, { buttons: 1 })
  await mouse(page, 'mouseReleased', box.cx, box.cy)
  await delay(80)
}

async function main() {
  const app = await startApp({ label: 'draft-ux-polish-smoke', width: 1500, height: 950 })
  const board = join(app.filesRoot, 'SystemSketch', 'UX polish scratch.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, '!!window.__systemsketch?.editor', 'editor mounted')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShape({
        id: 'shape:base', type: 'geo', x: 100, y: 100,
        props: { geo: 'rectangle', w: 120, h: 80 },
      })
      return null
    })()`)
    await waitForRecordOnDisk(board, 'shape:base')
    pass('Main starts with one shape, autosaved to a real scratch board file')

    // =====================================================================
    // 1a. RENAME CORRUPTION — the draft bar's own name
    // =====================================================================
    await clickElement(app.page, '[data-testid="systemsketch-drafts-trigger"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-new"]')`, 'drafts menu')
    await clickElement(app.page, '[data-testid="systemsketch-drafts-new"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar"]')`, 'draft bar')
    const originalName = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-name"]')?.textContent`,
    )
    pass(`a draft forks off Main, named "${originalName}"`)

    await doubleClickRename(app.page, '[data-testid="systemsketch-draft-bar-name"]')
    await waitFor(app.page, `!!document.querySelector('.systemsketch-draft-bar__rename-input')`, 'rename input mounted')
    pass('two rapid clicks land on the button, then the freshly-mounted input — the literal repro')

    await typeSlowly(app.page, 'Renamed bar draft')
    await key(app.page, 'Enter')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-name"]')?.textContent === 'Renamed bar draft'`,
      'bar rename commits cleanly',
      3000,
    )
    const barRenameResult = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-name"]')?.textContent`,
    )
    assert.equal(barRenameResult, 'Renamed bar draft', `before "${originalName}", typed "Renamed bar draft", got "${barRenameResult}"`)
    pass(`the bar's rename commits EXACTLY "Renamed bar draft" — not a corrupted splice of the old name`)

    // =====================================================================
    // 1b. RENAME CORRUPTION — the popover's InlineRename row control
    // =====================================================================
    await clickElement(app.page, '[data-testid="systemsketch-drafts-trigger"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-popover"]')`, 'drafts popover')
    // Exclude the fixed "Main" row (`systemsketch-drafts-row-main`) — only an
    // actual DraftRow has a rename pencil.
    const draftId = await evaluate(
      app.page,
      `[...document.querySelectorAll('[data-testid^="systemsketch-drafts-row-"]')]
        .map((el) => el.getAttribute('data-testid').replace('systemsketch-drafts-row-', ''))
        .find((id) => id !== 'main')`,
    )
    const pencilSelector = `[data-testid="systemsketch-drafts-row-${draftId}"] .systemsketch-drafts-row__action`

    await openThenRapidSecondClickOnInput(app.page, pencilSelector, '.systemsketch-drafts-rename-input')
    pass('the popover input gets a rapid second click ~150ms after mount — the same guarded code path')

    await typeSlowly(app.page, 'Renamed row draft')
    await key(app.page, 'Enter')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-drafts-row-${draftId}"] b')?.textContent === 'Renamed row draft'`,
      'popover rename commits cleanly',
      3000,
    )
    const rowRenameResult = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-drafts-row-${draftId}"] b')?.textContent`,
    )
    assert.equal(rowRenameResult, 'Renamed row draft', `typed "Renamed row draft", got "${rowRenameResult}"`)
    pass(`the popover's InlineRename commits EXACTLY "Renamed row draft" — same fix, same site class`)

    await clickElement(app.page, '[data-testid="systemsketch-drafts-trigger"]')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-drafts-popover"]')`, 'popover closes')

    // =====================================================================
    // 2. A MOVE-ONLY DRAFT MUST STILL BE MERGEABLE
    // =====================================================================
    const beforeMove = JSON.parse(await evaluate(app.page, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:base')
      return JSON.stringify({ x: shape.x, y: shape.y })
    })()`))
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({ id: 'shape:base', type: 'geo', x: 500, y: 400 })
      return null
    })()`)
    await delay(1200) // past both the snapshot- and changes-recompute debounces

    const compareTextAfterMove = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent`,
    )
    assert.equal(compareTextAfterMove, 'Compare 0 Changes', 'a pure move is invisible to the display diff BY DESIGN — compareBoards never looks at x/y')
    pass(`moving the shape leaves the badge truthfully at "${compareTextAfterMove}" (position is not a display change)`)

    const mergeDisabledAfterMove = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-merge"]')?.disabled`,
    )
    const chevronDisabledAfterMove = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-merge-chevron"]')?.disabled`,
    )
    assert.equal(mergeDisabledAfterMove, false, 'Merge must be enabled by a move-only edit, not gated on changes.total')
    assert.equal(chevronDisabledAfterMove, false, 'the Rebase chevron must be enabled too')
    pass('Merge and the Rebase chevron are BOTH enabled despite the badge reading "0 Changes" — hasUnpromotedEdits, not changes.total, gates them')

    // =====================================================================
    // 3. MERGE IS CONFIRMED IN THE REVIEW, NEVER ON THE BUTTON
    // =====================================================================
    const labelBeforeConfirm = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-merge"]')?.textContent`,
    )
    assert.equal(labelBeforeConfirm, 'Merge', 'the primary segment keeps its position and its plain "Merge" label')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge"]')
    await waitFor(
      app.page,
      `!!document.querySelector('[data-testid="compare-dialog"]')`,
      'one click on Merge opens the review',
      8000,
    )
    await delay(800) // both boards mount
    const stillDraftAfterOneClick = await evaluate(
      app.page,
      `!!document.querySelector('[data-testid="systemsketch-draft-bar"]')`,
    )
    assert.equal(stillDraftAfterOneClick, true, 'a single click must NOT merge — it opens a review to confirm in')
    const opened = JSON.parse(await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const confirm = dialog.querySelector('[data-testid="compare-action-confirm"]')
      return JSON.stringify({
        action: dialog.getAttribute('data-action'),
        title: dialog.querySelector('#compare-dialog-title')?.textContent ?? null,
        confirmLabel: confirm?.textContent ?? null,
        confirmDisabled: confirm?.disabled ?? null,
      })
    })()`))
    assert.equal(opened.action, 'merge', 'and the review is stamped with the action that opened it')
    assert.equal(opened.title, 'Merge changes')
    // The move-only case: no display-diff rows at all, so a count would read
    // "Merge 0 changes" over a draft that is genuinely mergeable.
    assert.match(
      opened.confirmLabel,
      /Merge this draft into Main$/,
      `a zero-display-change draft gets words, not a count — got "${opened.confirmLabel}"`,
    )
    assert.equal(opened.confirmDisabled, false, 'and the confirm is live for it, matching hasUnpromotedEdits')
    pass(`one click opens the review ("${opened.title}", "${opened.confirmLabel}") without merging anything yet`)

    await clickElement(app.page, '[data-testid="compare-action-confirm"]')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="systemsketch-draft-bar"]')`,
      'the review\'s confirm actually merges — the draft bar unmounts',
      8000,
    )
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="compare-dialog"]')`,
      'and the review closes behind it',
      8000,
    )
    pass('confirming in the review merges — the draft bar unmounts and the dialog closes')

    const mainAfterMerge = await waitForRecordOnDisk(board, 'shape:base', (record) => record.x === 500 && record.y === 400)
    const mergedShape = mainAfterMerge.records.find((r) => r.id === 'shape:base')
    assert.equal(mergedShape.x, 500)
    assert.equal(mergedShape.y, 400)
    pass(`the move-only draft's position change (${beforeMove.x},${beforeMove.y} -> 500,400) landed on Main's real file`)

    console.log(`\n${checks.length} checks passed:`)
    for (const c of checks) console.log(`  - ${c}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
