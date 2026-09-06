#!/usr/bin/env node
/**
 * Real-browser proof for the two data-loss repros found by the draft-branching
 * stress pass. Both are driven against a throwaway scratch board on the
 * harness's own ports — never a real board, never 4321-4323.
 *
 * 1. MERGE IS FAST-FORWARD ONLY. Merge writes the draft's snapshot into Main's
 *    slot and forces a save, so it overwrites Main wholesale. Previously it did
 *    that with no check at all: an edit made to Main while the draft was open —
 *    by a peer session, another window, or just earlier — was destroyed without
 *    a diff and the merge reported success. Merge must now REFUSE while Main
 *    has moved, and Rebase-then-Merge must land both sides' work.
 *
 * 2. REBASE MERGES FIELDS, NOT WHOLE RECORDS. Conflict detection used to run
 *    through `compareBoards`, which never looks at a record's top-level `x`/`y`
 *    (position is appearance, not content, for a human-readable diff), while
 *    the merge overlay ran on a raw whole-record diff, which does see them. A
 *    draft that only MOVED a shape was therefore invisible to the conflict
 *    check but visible to the overlay, so the draft's entire stale record was
 *    copied over Main's freshly-edited one — losing Main's edit while
 *    reporting success. Both edits must now survive.
 *
 * The Merge button is asserted mainly by its EFFECTS (does Main's file change,
 * does the draft bar unmount) rather than by status copy — the copy is
 * asserted end to end by `draft_ux_polish_smoke.mjs` and the review dialog by
 * `draft_merge_review_smoke.mjs`.
 *
 * What HAS changed since this file was written is where the confirmation
 * lives. Merge and Rebase used to act from the bar (Merge as a two-step
 * arm-then-confirm); both now open the Compare dialog on the relevant diff and
 * confirm at the bottom of it. Every attempt below therefore goes
 * click -> review -> confirm. The guarantees under test are untouched: the
 * fresh fail-closed drift check still lives in `merge()` and still runs at the
 * instant of the confirm, so a drifted Main must still refuse — the refusal
 * simply surfaces in the review now instead of the bar.
 *
 * Run with:
 *   node tests/draft_merge_guard_smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
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

async function readBoard(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** One record's props off the on-disk board file. */
async function propsOnDisk(path, recordId) {
  const document = await readBoard(path)
  const record = document.records.find((r) => r.id === recordId)
  if (!record) throw new Error(`${recordId} missing from ${path}`)
  return record.props
}

/**
 * Edit the board file directly, simulating an external change to Main while a
 * draft holds the app's autosave — the same technique `draft_rebase_smoke.mjs`
 * uses.
 */
async function mutateMainOnDisk(path, recordId, patchProps) {
  const document = await readBoard(path)
  const record = document.records.find((r) => r.id === recordId)
  if (!record) throw new Error(`fixture bug: ${recordId} missing from ${path}`)
  Object.assign(record.props, patchProps)
  await writeFile(path, JSON.stringify(document))
}

async function waitForRecordOnDisk(path, recordId, timeoutMs = 8000) {
  const start = Date.now()
  for (;;) {
    try {
      const document = await readBoard(path)
      if (document.records.find((r) => r.id === recordId)) return
    } catch {
      // mid-write; keep polling
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${recordId}`)
    await delay(150)
  }
}

const barPresent = `!!document.querySelector('[data-testid="systemsketch-draft-bar"]')`
const dialogPresent = `!!document.querySelector('[data-testid="compare-dialog"]')`

async function newDraft(page) {
  await clickElement(page, '[data-testid="systemsketch-drafts-trigger"]')
  await waitFor(page, `!!document.querySelector('[data-testid="systemsketch-drafts-new"]')`, 'drafts menu')
  await clickElement(page, '[data-testid="systemsketch-drafts-new"]')
  await waitFor(page, barPresent, 'draft bar')
}

/** Open the Merge review and press its confirm. The whole gesture, once. */
async function mergeThroughReview(page, label) {
  await clickElement(page, '[data-testid="systemsketch-draft-bar-merge"]')
  await waitFor(page, dialogPresent, `${label}: Merge opens the review`, 8000)
  await delay(700) // both boards mount before the confirm is pressed
  await clickElement(page, '[data-testid="compare-action-confirm"]')
}

/** Open the Rebase review from the chevron menu and press its confirm. */
async function rebaseThroughReview(page, label) {
  await clickElement(page, '[data-testid="systemsketch-draft-bar-merge-chevron"]')
  await waitFor(page, `!!document.querySelector('[data-testid="systemsketch-draft-bar-rebase"]')`, `${label}: rebase item`)
  await clickElement(page, '[data-testid="systemsketch-draft-bar-rebase"]')
  await waitFor(page, dialogPresent, `${label}: Rebase opens the review`, 8000)
  await delay(700)
  await clickElement(page, '[data-testid="compare-action-confirm"]')
  await waitFor(page, `!${dialogPresent}`, `${label}: the review closes on a confirmed rebase`, 10000)
}

async function main() {
  const app = await startApp({ label: 'draft-merge-guard', width: 1500, height: 950 })
  const board = join(app.filesRoot, 'SystemSketch', 'Merge guard scratch.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, '!!window.__systemsketch?.editor', 'editor mounted')

    // ---- baseline Main: two independent shapes ----------------------------
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShapes([
        { id: 'shape:alpha', type: 'geo', x: 100, y: 100, props: { geo: 'rectangle', w: 120, h: 80 } },
        { id: 'shape:beta',  type: 'geo', x: 400, y: 100, props: { geo: 'rectangle', w: 80,  h: 80 } },
      ])
      return null
    })()`)
    await waitForRecordOnDisk(board, 'shape:beta')
    pass('Main starts with two shapes (alpha w=120, beta w=80) on a scratch board')

    // =====================================================================
    // REPRO 1 — Merge must refuse while Main has drifted
    // =====================================================================
    await newDraft(app.page)
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({ id: 'shape:alpha', type: 'geo', props: { w: 321 } })
      return null
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 1 Change'`,
      'the draft\'s own edit is counted',
      5000,
    )
    pass('a draft edits alpha (w 120 -> 321); the bar counts exactly one change')

    await mutateMainOnDisk(board, 'shape:beta', { w: 654 })
    pass('Main is independently edited on disk in an UNRELATED place (beta w 80 -> 654)')

    await mergeThroughReview(app.page, 'drifted attempt')
    await delay(1500) // let a merge, if it were going to happen, actually happen
    const stillInDraft = await evaluate(app.page, barPresent)
    assert.equal(stillInDraft, true, 'Merge must not complete while Main has drifted')
    const stillReviewing = await evaluate(app.page, dialogPresent)
    assert.equal(stillReviewing, true, 'a refused merge leaves the review open rather than closing on a lie')

    const afterRefusal = await propsOnDisk(board, 'shape:beta')
    const alphaAfterRefusal = await propsOnDisk(board, 'shape:alpha')
    assert.equal(afterRefusal.w, 654, "Main's own independent edit must survive the refused merge")
    assert.equal(alphaAfterRefusal.w, 120, "the draft's content must NOT have been promoted")
    pass('Merge is REFUSED: the draft bar stays up, beta is still 654, alpha on Main is still 120')

    // The refusal now surfaces in the review the confirm was pressed in — the
    // check itself is unchanged and still lives inside `merge()`.
    const refusalText = await evaluate(
      app.page,
      `document.querySelector('[data-testid="compare-action-error"]')?.textContent ?? null`,
    )
    assert.match(String(refusalText), /Merge blocked — Main has 1 change/, 'the review says why it refused')
    await clickElement(app.page, '[data-testid="compare-close"]')
    await waitFor(app.page, `!${dialogPresent}`, 'the refused review closes')

    const conflictShown = await evaluate(
      app.page,
      `!!document.querySelector('[data-testid="systemsketch-draft-bar-conflict"]')`,
    )
    assert.equal(conflictShown, true, 'the refused merge leaves the conflict badge showing why')
    pass(`the refusal is stated in the review ("${refusalText}") and the advisory bar badge is refreshed by the attempt`)

    // ---- Rebase, then Merge: both sides' work lands ------------------------
    await rebaseThroughReview(app.page, 'catch-up rebase')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar"]')?.textContent.includes('Rebased onto the latest Main')`,
      'rebase success',
      5000,
    )
    pass('Rebase succeeds — the draft catches up to the drifted Main')

    await mergeThroughReview(app.page, 'post-rebase merge')
    await waitFor(app.page, `!${barPresent}`, 'draft bar unmounts on a completed merge', 8000)
    await delay(1200)
    const mergedAlpha = await propsOnDisk(board, 'shape:alpha')
    const mergedBeta = await propsOnDisk(board, 'shape:beta')
    assert.equal(mergedAlpha.w, 321, "the draft's edit landed on Main")
    assert.equal(mergedBeta.w, 654, "Main's own independent edit is still there")
    pass('Rebase-then-Merge succeeds and BOTH edits are on Main (alpha 321, beta 654)')

    // =====================================================================
    // REPRO 2 — a draft that MOVES a shape Main edited
    // =====================================================================
    await newDraft(app.page)
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      // The draft drags alpha and touches none of its props...
      editor.updateShape({ id: 'shape:alpha', type: 'geo', x: 640, y: 480 })
      // ...plus one visible edit elsewhere, because the bar's change count
      // comes from the display diff, which deliberately ignores position — a
      // move-only draft reads as "0 Changes" and disables both buttons.
      editor.createShape({ id: 'shape:gamma', type: 'geo', x: 900, y: 100, props: { geo: 'ellipse', w: 40, h: 40 } })
      return null
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 1 Change'`,
      'the draft\'s visible edit is counted',
      5000,
    )
    pass('a second draft MOVES alpha to (640,480) — a change the display diff cannot see')

    await mutateMainOnDisk(board, 'shape:alpha', { w: 777 })
    pass('Main independently edits a PROP of that very same shape on disk (alpha w 321 -> 777)')

    await rebaseThroughReview(app.page, 'move-vs-prop rebase')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar"]')?.textContent.includes('Rebased onto the latest Main')`,
      'rebase success (2nd)',
      5000,
    )
    pass('Rebase succeeds — a move and a prop edit on one shape are not a conflict')

    const alpha = JSON.parse(await evaluate(app.page, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:alpha')
      return JSON.stringify({ x: shape.x, y: shape.y, w: shape.props.w })
    })()`))
    assert.equal(alpha.w, 777, "Main's prop edit must NOT be clobbered by the draft's stale record")
    assert.equal(alpha.x, 640, "the draft's move must survive")
    assert.equal(alpha.y, 480, "the draft's move must survive")
    pass(`both edits survive on one record: x=${alpha.x}, y=${alpha.y}, props.w=${alpha.w}`)

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
