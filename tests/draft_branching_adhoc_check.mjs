#!/usr/bin/env node
/**
 * Ad-hoc real-browser proof for the draft-branching chrome (build order
 * steps 5-6 of docs plan "misty-soaring-tower"): the Drafts chip + popover,
 * and the draft-mode bar's Compare + Merge▾ split button.
 *
 * Rebase itself (build order step 8) has its own dedicated journey,
 * `tests/draft_rebase_smoke.mjs` — the disjoint-merge and blocked-conflict
 * cases both need Main mutated independently on disk, which does not belong
 * in this click-through. The Rebase click below only proves the trivial case
 * (Main has not moved, so there is nothing to fold in) still wires all the
 * way through and reports success rather than the stub's old throw. It runs
 * on its own ports (via `startApp`'s `freePort()`) against a throwaway
 * `filesRoot`, never a real board.
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
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT_DIR = join(ROOT, 'docs', 'assets')
const { checks, pass } = makeChecklist()

async function capture(page, name) {
  await ensureDir(SHOT_DIR)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOT_DIR, name), Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({ label: 'draft-branching-adhoc', width: 1500, height: 950 })

  try {
    await openApp(app.page, app.port)
    await waitFor(app.page, `!!window.__systemsketch?.editor`, 'editor mounted')
    pass('the app opens on a scratch board (product profile, its own throwaway filesRoot)')

    // ---- Drafts chip -------------------------------------------------------
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-trigger"]')`, 'drafts trigger')
    pass('the Drafts chip renders in the top-left shell, left of the breadcrumb')

    const order = await evaluate(app.page, `(() => {
      const shell = document.querySelector('[data-testid="systemsketch-top-left-shell"]')
      const kids = Array.from(shell.children)
      return kids.map((el) => el.getAttribute('data-testid') || el.tagName).join(',')
    })()`)
    assert.ok(order.includes('systemsketch-drafts-trigger'), `expected drafts trigger in shell order, got: ${order}`)
    // The breadcrumb (DepthStackNavigator) has no stable testid on its root,
    // but it is the menu-placement instance and must render AFTER the chip.
    const draftsIndex = order.split(',').indexOf('systemsketch-drafts-trigger')
    const childCount = order.split(',').length
    assert.ok(draftsIndex < childCount - 1, 'the breadcrumb must stay the last/rightmost child')
    pass('Drafts sits between the file identity and the breadcrumb, which stays rightmost')

    await clickElement(app.page, '[data-testid="systemsketch-drafts-trigger"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-popover"]')`, 'drafts popover')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-drafts-row-main"]')`, 'Main row')
    pass('the popover opens and lists Main')

    await clickElement(app.page, '[data-testid="systemsketch-drafts-new"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar"]')`, 'draft bar')
    pass('New draft creates a draft and the draft-mode bar appears')

    // ---- bar pushes the canvas down, not an overlay ------------------------
    const layout = await evaluate(app.page, `(() => {
      const bar = document.querySelector('[data-testid="systemsketch-draft-bar"]').getBoundingClientRect()
      const canvas = document.querySelector('.systemsketch-app__canvas').getBoundingClientRect()
      return { barBottom: bar.bottom, canvasTop: canvas.top, barTop: bar.top }
    })()`)
    assert.ok(layout.barTop === 0, `expected the bar flush with the top, got ${layout.barTop}`)
    assert.ok(Math.abs(layout.canvasTop - layout.barBottom) < 1, `expected canvas top to start where the bar ends, got bar bottom ${layout.barBottom} vs canvas top ${layout.canvasTop}`)
    pass('the draft-mode bar pushes the canvas down — not an overlay')

    // ---- make an edit so Compare/Merge have something to show --------------
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShape({
        type: 'geo', x: 200, y: 200, props: { geo: 'rectangle', w: 160, h: 100 },
      })
      return null
    })()`)
    // The bar's own change count goes through two chained debounces in
    // DraftProvider (a 300ms snapshot write, then a 400ms recompute) — give
    // waitFor real headroom rather than a fixed delay guessed too short.
    //
    // The wait checks the NUMBER, not the raw string: "Compare 0 Changes" is
    // already `!== 'Compare 0'` on day one now that the label carries the
    // word "Changes" even at the baseline count, which would let this wait
    // resolve before the debounce actually lands and mask a real "still
    // stuck at zero" bug behind a text-format difference that means nothing.
    await waitFor(
      app.page,
      `/^Compare (?!0(?:\\s|$))\\d+ Changes?$/.test(document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent ?? '')`,
      'bar badge picks up the edit',
      5000,
    )
    const compareLabel = await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-draft-bar-compare"]')?.textContent`)
    assert.match(compareLabel, /^Compare \d+ Changes?$/)
    assert.notEqual(compareLabel, 'Compare 0 Changes')
    pass(`an edit is reflected in the bar's Compare button (“${compareLabel}”)`)

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-compare"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="compare-dialog"]')`, 'compare dialog')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid="compare-dialog"] .tl-container').length === 2`,
      'both boards mounted',
    )
    await delay(500)
    pass('Compare opens the generalized dialog with two real boards — Main vs. the draft')
    await capture(app.page, 'draft-branching-compare-live.png')
    await key(app.page, 'Escape')
    await waitFor(app.page, `!document.querySelector('[data-testid="compare-dialog"]')`, 'compare dialog closed')

    // ---- Merge▾ split button, Rebase listed --------------------------------
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-draft-bar-merge"]')?.disabled`, 'merge enabled')
    pass('the Merge▾ split button is enabled once the draft has changes')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-merge-chevron"]')
    await waitFor(app.page, `!!document.querySelector('[data-testid="systemsketch-draft-bar-rebase"]')`, 'rebase item')
    pass('the chevron opens a menu listing Rebase')

    await clickElement(app.page, '[data-testid="systemsketch-draft-bar-rebase"]')
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-draft-bar"]')?.textContent.includes('Rebased onto the latest Main')`, 'rebase success message')
    pass('Rebase runs for real — Main has not moved, so it reports success rather than a conflict')

    await capture(app.page, 'draft-branching-bar-live.png')

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
