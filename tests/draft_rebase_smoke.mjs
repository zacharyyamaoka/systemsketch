#!/usr/bin/env node
/**
 * Real-browser proof for Rebase (build order step 8 of docs plan
 * "misty-soaring-tower"): pulling Main's current state into an open draft.
 *
 * `tests/draft_branching_adhoc_check.mjs` proves the chrome slice (steps
 * 5-6) and stops at the point Rebase used to throw a stub. This journey picks
 * up from there and drives the real thing against a scratch board, on its own
 * throwaway ports/filesRoot — never a real board:
 *
 *  1. Successful rebase: the draft edits one shape, Main is mutated directly
 *     on disk (simulating "Main changed elsewhere while the draft was open" —
 *     the same disk-write technique `workspace_visual_polish_smoke.mjs` and
 *     `development_worktree_paths_smoke.mjs` use to seed/inspect a board
 *     without going through the app) in a DISJOINT place. Rebase must fold
 *     both changes together and clear the old base/head gap in Compare.
 *  2. Blocked rebase: the same shape is then touched on both sides. Rebase
 *     must refuse rather than corrupt anything, and Main's file on disk must
 *     be byte-identical before and after the attempt either way — Rebase
 *     must never write Main.
 *
 * Rebase is now REVIEWED before it applies: the chevron's Rebase item opens
 * the Compare dialog on `computeRebase`'s proposal (a dry run of the very
 * function the real action uses) and the confirm at the bottom of it runs the
 * real `rebaseDraftAction`. A blocked rebase opens the review with no usable
 * confirm instead. Both outcomes below are therefore driven through that path;
 * the outcomes themselves, and the bar's status copy, are unchanged.
 * `draft_merge_review_smoke.mjs` is what asserts the review's own contents.
 *
 * Run with:
 *   node tests/draft_rebase_smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const { checks, pass } = makeChecklist()

const dialogPresent = `!!document.querySelector('[data-testid="compare-dialog"]')`

/** Open the Rebase review from the split button's chevron menu. */
async function openRebaseReview(page, label) {
  await clickElement(page, '[data-testid="systemsketch-draft-bar-merge-chevron"]')
  await waitFor(page, `!!document.querySelector('[data-testid="systemsketch-draft-bar-rebase"]')`, `${label}: rebase item`)
  await clickElement(page, '[data-testid="systemsketch-draft-bar-rebase"]')
  await waitFor(page, dialogPresent, `${label}: the review opens`, 8000)
  await delay(800) // both boards mount and frame before anything is asserted
}

/** Read the board file straight off disk and hand back its parsed records array. */
async function readBoardRecords(path) {
  const raw = await readFile(path, 'utf8')
  return JSON.parse(raw)
}

/**
 * Poll the on-disk file until a record satisfies `predicate`, rather than
 * trusting the file-title's clean/dirty indicator: that indicator is already
 * "clean" the instant the board loads with nothing to save, so waiting on it
 * right after an edit can pass before THIS edit's autosave has actually
 * reached disk.
 */
async function waitForRecordOnDisk(path, recordId, predicate, timeoutMs = 8000) {
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

/** Directly edit one record's prop in the on-disk board file — simulating an
 * external change to Main while a draft holds the app's own autosave. */
async function mutateMainOnDisk(path, recordId, patchProps) {
  const document = await readBoardRecords(path)
  const record = document.records.find((r) => r.id === recordId)
  if (!record) throw new Error(`fixture bug: ${recordId} missing from ${path}`)
  Object.assign(record.props, patchProps)
  await writeFile(path, JSON.stringify(document))
  return document
}

async function main() {
  const app = await startApp({ label: 'draft-rebase-smoke', width: 1500, height: 950 })
  const board = join(app.filesRoot, 'SystemSketch', 'Rebase scratch.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, '!!window.__systemsketch?.editor', 'editor mounted')

    // ---- baseline Main: one shape both sides will start from -------------
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShape({
        id: 'shape:base-rect', type: 'geo', x: 100, y: 100,
        props: { geo: 'rectangle', w: 120, h: 80 },
      })
      return null
    })()`)
    await waitForRecordOnDisk(board, 'shape:base-rect', () => true)
    pass('Main starts with one shape, autosaved to a real scratch board file')

    // ---- open a draft, make its own edit -----------------------------------
    await clickElement(app.page, '[data-testid="systemsketch-drafts-trigger"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-row-main"]')`, 'Main row')
    await clickElement(app.page, '[data-testid="systemsketch-drafts-new"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar"]')`, 'draft bar')
    pass('a draft forks off Main and the draft-mode bar appears')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShape({
        id: 'shape:draft-add', type: 'geo', x: 300, y: 100,
        props: { geo: 'rectangle', w: 60, h: 60 },
      })
      return null
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 1 Change'`,
      'the bar counts the draft\'s own new shape',
      5000,
    )
    pass('the draft adds its own shape — the bar counts exactly one change')

    // ---- Main moves independently, in a disjoint place ---------------------
    const mainAfterExternalEdit = await mutateMainOnDisk(board, 'shape:base-rect', { w: 999 })
    pass('Main is mutated directly on disk (w: 120 -> 999) while the draft holds autosave')

    // ---- Rebase: review the proposal, then fold both changes together ------
    await openRebaseReview(app.page, 'clean rebase')
    const proposal = await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      return dialog?.querySelector('[data-side="after"] figcaption')?.textContent ?? null
    })()`)
    assert.match(String(proposal), /\(after Rebase\)$/, 'the review shows the PROPOSED draft, not Main')
    await clickElement(app.page, '[data-testid="compare-action-confirm"]')
    await waitFor(app.page, `!${dialogPresent}`, 'the confirmed review closes', 10000)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar"]')?.textContent.includes('Rebased onto the latest Main')`,
      'rebase success status',
      5000,
    )
    pass(`Rebase previews "${proposal}" and its confirm reports success`)

    const afterRebase = JSON.parse(await evaluate(app.page, `JSON.stringify({
      baseRectW: window.__systemsketch.editor.getShape('shape:base-rect')?.props.w,
      draftAddPresent: !!window.__systemsketch.editor.getShape('shape:draft-add'),
      conflictBanner: !!document.querySelector('[data-testid="systemsketch-draft-bar-conflict"]'),
    })`))
    assert.equal(afterRebase.baseRectW, 999, 'Main\'s independent change landed in the draft')
    assert.equal(afterRebase.draftAddPresent, true, 'the draft\'s own change survived the rebase')
    assert.equal(afterRebase.conflictBanner, false, 'no conflict banner once the base has caught up to Main')
    pass('the live draft now contains BOTH its own edit and Main\'s independent one')

    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 1 Change'`,
      'Compare re-settles to only the draft\'s own remaining delta',
      5000,
    )
    pass('Compare now shows only the draft\'s own change — the rebased base absorbed Main\'s')

    const mainOnDiskAfterRebase = await readBoardRecords(board)
    assert.deepEqual(mainOnDiskAfterRebase, mainAfterExternalEdit, 'Rebase must never write Main\'s file')
    pass('Main\'s file on disk is byte-for-byte unchanged by Rebase')

    // ---- Second run: the SAME record collides on both sides ---------------
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({
        id: 'shape:base-rect', type: 'geo', props: { w: 50 },
      })
      return null
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 2 Changes'`,
      'the draft\'s own colliding edit is counted',
      5000,
    )
    await mutateMainOnDisk(board, 'shape:base-rect', { w: 700 })
    const mainBeforeBlockedAttempt = await readBoardRecords(board)
    pass('Main independently changes the SAME shape the draft just edited — a real collision')

    await openRebaseReview(app.page, 'blocked rebase')
    const blocked = JSON.parse(await evaluate(app.page, `(() => {
      const dialog = document.querySelector('[data-testid="compare-dialog"]')
      const confirm = dialog?.querySelector('[data-testid="compare-action-confirm"]')
      return JSON.stringify({
        banner: dialog?.querySelector('[data-testid="compare-action-blocked"]')?.textContent ?? null,
        confirmDisabled: confirm?.disabled ?? null,
      })
    })()`))
    assert.match(String(blocked.banner), /Rebase blocked — 1 conflicting change\./, 'the review states the refusal')
    assert.equal(blocked.confirmDisabled, true, 'and offers no way to apply it anyway')
    await clickElement(app.page, '[data-testid="compare-close"]')
    await waitFor(app.page, `!${dialogPresent}`, 'the blocked review closes')

    // The bar's own status line survives the dialog — it is the trace left for
    // a reviewer who dismisses the review without reading it.
    const statusText = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar"]')?.textContent`,
    )
    assert.match(statusText, /Rebase blocked — 1 conflicting change\. Review in Compare\./)
    pass(`Rebase refuses the collision in the review (“${blocked.banner}”) — not a crash, not a silent merge`)

    const draftStillLocal = await evaluate(
      app.page,
      `window.__systemsketch.editor.getShape('shape:base-rect')?.props.w`,
    )
    assert.equal(draftStillLocal, 50, 'the blocked rebase left the draft\'s own content untouched')

    const mainOnDiskAfterBlock = await readBoardRecords(board)
    assert.deepEqual(mainOnDiskAfterBlock, mainBeforeBlockedAttempt, 'a blocked Rebase must never write Main either')
    pass('the draft keeps its own content and Main\'s file is untouched, whether Rebase succeeds or blocks')

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
