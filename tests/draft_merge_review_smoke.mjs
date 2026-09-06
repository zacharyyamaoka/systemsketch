#!/usr/bin/env node
/**
 * Real-browser proof for review-before-apply: Merge and Rebase no longer act on
 * a click, they open the SAME Compare dialog in "action mode" — a per-element
 * accept/reject checkbox on every changed element and a confirm bar at the
 * bottom, IcePanel's `› Merge N changes`.
 *
 * The point of this journey is that the guarantees the earlier passes won are
 * unchanged by the new front door. It drives, in order:
 *
 * 1. MERGE, CLEAN. The dialog opens on Draft-vs-Main, every element checked,
 *    and the confirm merges for real.
 * 2. THE CHECKBOX IS REAL AND HONEST. Unchecking one element disables the
 *    confirm and says why — because `merge()`/`rebaseDraftAction()` apply
 *    everything atomically and there is no per-change apply path in the build.
 *    A checkbox that silently applied the change anyway would be the lie this
 *    assertion exists to prevent.
 * 3. MERGE, DRIFTED. With Main independently edited on disk, the dialog still
 *    opens — the fail-closed check lives in `merge()` and runs at the instant
 *    of the CONFIRM, not at open time — and the confirm is REFUSED, with the
 *    draft intact and Main's own edit untouched.
 * 4. REBASE, CLEAN. The review shows the PROPOSED post-rebase draft (computed
 *    by `computeRebase` without applying it), not today's Main-vs-draft: the
 *    `after` caption says so, and the after board already carries both sides'
 *    work while the live editor still does not.
 * 5. REBASE, CONFLICTED. The dialog opens blocked, with no usable confirm.
 *
 * Run with:
 *   node tests/draft_merge_review_smoke.mjs
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
const SHOT_DIR = join(ROOT, 'docs', 'assets')

async function capture(page, name) {
  await ensureDir(SHOT_DIR)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOT_DIR, name), Buffer.from(shot.data, 'base64'))
}

async function readBoard(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function propsOnDisk(path, recordId) {
  const document = await readBoard(path)
  const record = document.records.find((r) => r.id === recordId)
  if (!record) throw new Error(`${recordId} missing from ${path}`)
  return record.props
}

/** Edit Main's file directly — an external change while the draft holds autosave. */
async function mutateMainOnDisk(path, recordId, patchProps) {
  const document = await readBoard(path)
  const record = document.records.find((r) => r.id === recordId)
  if (!record) throw new Error(`fixture bug: ${recordId} missing from ${path}`)
  Object.assign(record.props, patchProps)
  await writeFile(path, JSON.stringify(document))
  return document
}

async function waitForRecordOnDisk(path, recordId, predicate = () => true, timeoutMs = 8000) {
  const start = Date.now()
  for (;;) {
    try {
      const document = await readBoard(path)
      const record = document.records.find((r) => r.id === recordId)
      if (record && predicate(record)) return document
    } catch {
      // mid-write; keep polling
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${recordId}`)
    await delay(150)
  }
}

const BAR = '[data-testid="systemsketch-draft-bar"]'
const DIALOG = '[data-testid="compare-dialog"]'
const CONFIRM = '[data-testid="compare-action-confirm"]'

const barPresent = `!!document.querySelector('${BAR}')`
const dialogPresent = `!!document.querySelector('${DIALOG}')`

/** Everything the action bar and the review list are saying, in one read. */
async function readReview(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const dialog = document.querySelector('${DIALOG}')
    if (!dialog) return JSON.stringify({ open: false })
    const confirm = dialog.querySelector('${CONFIRM}')
    const boxes = [...dialog.querySelectorAll('[data-testid^="compare-accept-"]')]
    return JSON.stringify({
      open: true,
      title: dialog.querySelector('#compare-dialog-title')?.textContent ?? null,
      action: dialog.getAttribute('data-action'),
      beforeCaption: dialog.querySelector('[data-side="before"] figcaption')?.textContent ?? null,
      afterCaption: dialog.querySelector('[data-side="after"] figcaption')?.textContent ?? null,
      confirmLabel: confirm?.textContent ?? null,
      confirmDisabled: confirm?.disabled ?? null,
      boxCount: boxes.length,
      allChecked: boxes.length > 0 && boxes.every((b) => b.checked),
      note: dialog.querySelector('[data-testid="compare-action-note"]')?.textContent ?? null,
      ready: dialog.querySelector('[data-testid="compare-action-ready"]')?.textContent ?? null,
      error: dialog.querySelector('[data-testid="compare-action-error"]')?.textContent ?? null,
      blocked: dialog.querySelector('[data-testid="compare-action-blocked"]')?.textContent ?? null,
    })
  })()`))
}

async function newDraft(page) {
  await clickElement(page, '[data-testid="systemsketch-drafts-trigger"]')
  await waitFor(page, `!!document.querySelector('[data-testid="systemsketch-drafts-new"]')`, 'drafts menu')
  await clickElement(page, '[data-testid="systemsketch-drafts-new"]')
  await waitFor(page, barPresent, 'draft bar')
}

/** How many records the `after` pane's own tldraw store actually holds. */
async function afterPaneShapeCount(page) {
  return Number(await evaluate(page, `(() => {
    const canvas = document.querySelector('[data-testid="compare-canvas-after"]')
    return canvas ? canvas.querySelectorAll('.tl-shape').length : -1
  })()`))
}

async function main() {
  const app = await startApp({ label: 'draft-merge-review', width: 1600, height: 1000 })
  const board = join(app.filesRoot, 'SystemSketch', 'Merge review scratch.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, '!!window.__systemsketch?.editor', 'editor mounted')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShapes([
        { id: 'shape:alpha', type: 'geo', x: 100, y: 100, props: { geo: 'rectangle', w: 120, h: 80 } },
        { id: 'shape:beta',  type: 'geo', x: 380, y: 100, props: { geo: 'rectangle', w: 80,  h: 80 } },
      ])
      return null
    })()`)
    await waitForRecordOnDisk(board, 'shape:beta')
    pass('Main starts with two shapes (alpha w=120, beta w=80) on a scratch board')

    // =====================================================================
    // 1. MERGE opens the review, and the confirm merges for real
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

    const mergeLabel = await evaluate(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-merge"]')?.textContent`,
    )
    assert.equal(mergeLabel, 'Merge', 'the primary segment keeps its position and its plain label')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge"]')
    await waitFor(app.page, dialogPresent, 'Merge opens the review dialog', 8000)
    await delay(900) // both boards mount and frame
    const review = await readReview(app.page)
    assert.equal(review.action, 'merge', 'the dialog is stamped with the action that opened it')
    assert.equal(review.title, 'Merge changes', 'and titled by it, the way IcePanel titles the same panel')
    assert.equal(review.beforeCaption, 'Main', 'the before side is Main')
    assert.match(review.afterCaption, /^Draft/, 'the after side is the draft')
    assert.ok(review.boxCount >= 1, `at least one accept box, got ${review.boxCount}`)
    assert.equal(review.allChecked, true, 'every box starts checked')
    assert.equal(review.confirmDisabled, false, 'and the confirm is live')
    assert.match(review.confirmLabel, /Merge 1 change$/, `confirm reads "${review.confirmLabel}"`)
    await capture(app.page, 'draft-merge-review-live.png')
    pass(`ONE click on Merge opens the review: "${review.title}", ${review.boxCount} box(es) all checked, "${review.confirmLabel}"`)

    // ---- 2. the checkbox is real, and refuses rather than lying ------------
    const firstBox = await evaluate(app.page, `
      document.querySelector('${DIALOG} [data-testid^="compare-accept-"]').getAttribute('data-testid')`)
    await clickElement(app.page, `[data-testid="${firstBox}"]`)
    await delay(200)
    const unchecked = await readReview(app.page)
    assert.equal(unchecked.allChecked, false, 'the click really unchecks the box — it is not a decoration')
    assert.equal(unchecked.confirmDisabled, true, 'and an unchecked element disables the confirm')
    assert.match(unchecked.note, /isn’t supported yet/, `the bar says why: "${unchecked.note}"`)
    await capture(app.page, 'draft-merge-review-partial-live.png')
    pass(`unchecking one element disables the confirm and says why — "${unchecked.note}"`)

    await clickElement(app.page, `[data-testid="${firstBox}"]`)
    await delay(200)
    const rechecked = await readReview(app.page)
    assert.equal(rechecked.allChecked, true, 're-checking restores every box')
    assert.equal(rechecked.confirmDisabled, false, 'and re-enables the confirm')
    pass('re-checking it restores the confirm — the state is genuinely two-way')

    await clickElement(app.page, CONFIRM)
    await waitFor(app.page, `!${dialogPresent}`, 'the confirm closes the review', 8000)
    await waitFor(app.page, `!${barPresent}`, 'a completed merge unmounts the draft bar', 8000)
    const mergedAlpha = await propsOnDisk(board, 'shape:alpha')
    assert.equal(mergedAlpha.w, 321, "the draft's edit landed on Main's real file")
    pass('confirming merges for real — the dialog closes, the bar unmounts, alpha is 321 on Main')

    // =====================================================================
    // 3. MERGE with Main drifted — the dialog opens, the CONFIRM refuses
    // =====================================================================
    await newDraft(app.page)
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({ id: 'shape:alpha', type: 'geo', props: { w: 444 } })
      return null
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent === 'Compare 1 Change'`,
      'second draft\'s own edit is counted',
      5000,
    )
    await mutateMainOnDisk(board, 'shape:beta', { w: 654 })
    pass('a second draft edits alpha (321 -> 444) while Main is independently edited on disk (beta 80 -> 654)')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge"]')
    await waitFor(app.page, dialogPresent, 'the drifted Merge still opens a review', 8000)
    await delay(700)
    pass('a drifted Merge still OPENS — the fail-closed check belongs to merge(), at confirm time')

    await clickElement(app.page, CONFIRM)
    await waitFor(
      app.page,
      `!!document.querySelector('[data-testid="compare-action-error"]')`,
      'the confirm surfaces merge()\'s refusal',
      8000,
    )
    const refused = await readReview(app.page)
    assert.equal(refused.open, true, 'a refused merge leaves the review open to act on')
    assert.match(refused.error, /Merge blocked — Main has 1 change/, `refusal reads "${refused.error}"`)
    await capture(app.page, 'draft-merge-review-refused-live.png')

    const betaAfterRefusal = await propsOnDisk(board, 'shape:beta')
    const alphaAfterRefusal = await propsOnDisk(board, 'shape:alpha')
    assert.equal(betaAfterRefusal.w, 654, "Main's own independent edit must survive the refused merge")
    assert.equal(alphaAfterRefusal.w, 321, "the draft's content must NOT have been promoted")
    pass(`Merge is REFUSED in the dialog ("${refused.error}") — beta still 654, alpha on Main still 321`)

    await clickElement(app.page, '[data-testid="compare-close"]')
    await waitFor(app.page, `!${dialogPresent}`, 'the review closes')

    // =====================================================================
    // 4. REBASE previews the PROPOSED draft, then applies it for real
    // =====================================================================
    const beforeRebaseLive = JSON.parse(await evaluate(app.page, `JSON.stringify({
      beta: window.__systemsketch.editor.getShape('shape:beta')?.props.w,
    })`))
    assert.equal(beforeRebaseLive.beta, 80, "the live draft has NOT yet seen Main's beta edit")

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge-chevron"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar-rebase"]')`, 'rebase item')
    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-rebase"]')
    await waitFor(app.page, dialogPresent, 'Rebase opens a review too', 8000)
    await delay(1100)
    const rebaseReview = await readReview(app.page)
    assert.equal(rebaseReview.action, 'rebase', 'stamped as the Rebase review')
    assert.equal(rebaseReview.title, 'Rebase changes')
    assert.match(
      rebaseReview.afterCaption,
      /\(after Rebase\)$/,
      `the after side is the PROPOSED draft, not Main — caption "${rebaseReview.afterCaption}"`,
    )
    assert.equal(
      rebaseReview.beforeCaption,
      rebaseReview.afterCaption.replace(' (after Rebase)', ''),
      'and the before side is the draft as it stands today',
    )
    assert.ok(rebaseReview.boxCount >= 1, `the incoming work is listed: ${rebaseReview.boxCount} element(s)`)
    assert.equal(rebaseReview.allChecked, true, 'all checked by default here too')
    assert.equal(rebaseReview.confirmDisabled, false)
    assert.match(rebaseReview.confirmLabel, /Rebase 1 change$/, `confirm reads "${rebaseReview.confirmLabel}"`)
    await capture(app.page, 'draft-rebase-review-live.png')
    pass(`Rebase previews the post-rebase draft ("${rebaseReview.afterCaption}") with "${rebaseReview.confirmLabel}"`)

    // The preview is a real render of a snapshot that does not exist yet: the
    // proposal carries Main's beta edit, while the live editor still does not.
    const proposedShapes = await afterPaneShapeCount(app.page)
    assert.ok(proposedShapes >= 2, `the proposed board renders (${proposedShapes} shapes)`)
    const liveDuringPreview = await evaluate(
      app.page,
      `window.__systemsketch.editor.getShape('shape:beta')?.props.w`,
    )
    assert.equal(Number(liveDuringPreview), 80, 'previewing must not have applied anything to the live draft')
    pass('the preview is a computed proposal — the live draft is still untouched while it is on screen')

    await clickElement(app.page, CONFIRM)
    await waitFor(app.page, `!${dialogPresent}`, 'confirming Rebase closes the review', 10000)
    await waitFor(
      app.page,
      `document.querySelector('${BAR}')?.textContent.includes('Rebased onto the latest Main')`,
      'the bar reports the rebase',
      8000,
    )
    const afterRebase = JSON.parse(await evaluate(app.page, `JSON.stringify({
      beta: window.__systemsketch.editor.getShape('shape:beta')?.props.w,
      alpha: window.__systemsketch.editor.getShape('shape:alpha')?.props.w,
    })`))
    assert.equal(afterRebase.beta, 654, "Main's independent edit is now in the draft")
    assert.equal(afterRebase.alpha, 444, "and the draft's own edit survived it")
    pass(`confirming Rebase applies the real action — the draft now holds both sides (beta ${afterRebase.beta}, alpha ${afterRebase.alpha})`)

    // =====================================================================
    // 5. REBASE with a real conflict — blocked, with no usable confirm
    // =====================================================================
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({ id: 'shape:beta', type: 'geo', props: { w: 111 } })
      return null
    })()`)
    await delay(1400) // past both debounces
    const mainBeforeBlocked = await mutateMainOnDisk(board, 'shape:beta', { w: 999 })
    pass('the draft and Main now change the SAME shape to different values — a real collision')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge-chevron"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar-rebase"]')`, 'rebase item (2nd)')
    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-rebase"]')
    await waitFor(app.page, dialogPresent, 'the conflicted Rebase still opens a review', 8000)
    await delay(900)
    const blockedReview = await readReview(app.page)
    assert.equal(blockedReview.action, 'rebase')
    assert.match(blockedReview.blocked, /Rebase blocked — 1 conflicting change/, `blocked banner reads "${blockedReview.blocked}"`)
    assert.equal(blockedReview.confirmDisabled, true, 'there is nothing safe to apply, so the confirm is unavailable')
    assert.equal(blockedReview.beforeCaption, 'Main', 'the blocked review shows the two sides that actually collided')
    await capture(app.page, 'draft-rebase-review-blocked-live.png')
    pass(`a conflicted Rebase opens BLOCKED with no usable confirm — "${blockedReview.blocked}"`)

    await clickElement(app.page, '[data-testid="compare-close"]')
    await waitFor(app.page, `!${dialogPresent}`, 'the blocked review closes')
    await delay(400)
    const mainAfterBlocked = await readBoard(board)
    assert.deepEqual(mainAfterBlocked, mainBeforeBlocked, 'a blocked Rebase must never write Main')
    const draftStillLocal = await evaluate(
      app.page,
      `window.__systemsketch.editor.getShape('shape:beta')?.props.w`,
    )
    assert.equal(Number(draftStillLocal), 111, 'and must leave the draft\'s own content alone')
    pass('the blocked review wrote nothing: Main is byte-identical and the draft keeps its own beta=111')

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
