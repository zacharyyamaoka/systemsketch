#!/usr/bin/env node
/** Prove the follow-up gallery is complete, responsive, and usable. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

import {
  ROOT,
  clickElement,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SCREENSHOT = join(ROOT, 'docs', 'assets', 'followup-review-gallery-2026-09-02.png')
const EXPECTED_RANKS = ['4', '23', '24', '25', '33', '34']
const EXPECTED_FIXTURES = [
  'local-comments.systemsketch',
  'board-find-replace.systemsketch',
  'board-diagnostics.systemsketch',
]
const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({ label: 'systemsketch-followup-gallery', build: 'followup-gallery', width: 1440, height: 960 })
  try {
    await openApp(app.page, app.port, 'docs/repo-improvement-followup-review-2026-09-02.html')
    await waitFor(app.page, `document.querySelectorAll('.feature').length === 6`, 'six follow-up cards')

    const structure = JSON.parse(await evaluate(app.page, `JSON.stringify({
      ranks: Array.from(document.querySelectorAll('.feature'), (card) => card.dataset.rank),
      decisions: document.querySelectorAll('[data-review="decision"]').length,
      notes: document.querySelectorAll('[data-review="note"]').length,
      images: document.images.length,
      checklistSizes: Array.from(document.querySelectorAll('.acceptance ul'), (list) => list.children.length),
      stockAnswer: document.querySelector('.stock-note').textContent,
    })`))
    assert.deepEqual(structure.ranks, EXPECTED_RANKS)
    assert.equal(structure.decisions, 6)
    assert.equal(structure.notes, 6)
    assert.equal(structure.images, 10)
    assert.deepEqual(structure.checklistSizes, [3, 3, 3, 3, 3, 3])
    assert.match(structure.stockAnswer, /tldraw:.*snapshots.*serializer/is)
    assert.match(structure.stockAnswer, /SystemSketch.*revision queues.*lifecycle flushing.*navigation guards/is)
    pass('six independently judgeable cards and the host-vs-tldraw ownership explainer render')

    await waitFor(app.page,
      `Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)`,
      'all embedded evidence images')
    assert.equal(await evaluate(app.page, `document.documentElement.scrollWidth <= window.innerWidth`), true)
    pass('all ten real screenshots load from embedded data with no desktop overflow')

    const links = JSON.parse(await evaluate(app.page, `JSON.stringify(Array.from(
      document.querySelectorAll('[data-live-fixture]'),
      (link) => ({ fixture: link.dataset.liveFixture, href: link.href })
    ))`))
    assert.deepEqual(links.map(({ fixture }) => fixture), EXPECTED_FIXTURES)
    for (const { fixture, href } of links) {
      const url = new URL(href)
      assert.equal(url.origin, 'http://127.0.0.1:4400')
      assert.equal(url.pathname, '/')
      const boardPath = url.searchParams.get('board')
      assert.ok(boardPath && isAbsolute(boardPath))
      assert.equal(boardPath.endsWith(join('sketches', 'review', fixture)), true)
    }
    const fixtureResponses = await Promise.all(Array.from(EXPECTED_FIXTURES, async (fixture) => {
      const response = await fetch(`http://127.0.0.1:${app.port}/sketches/review/${fixture}`, {
        signal: AbortSignal.timeout(5000),
      })
      return { ok: response.ok, text: await response.text() }
    }))
    assert.equal(fixtureResponses.every(({ ok, text }) => ok && text.includes('"systemSketch"')), true)
    pass('all three exact Preview links target real, downloadable seeded review boards')

    await evaluate(app.page, `(() => {
      const checkbox = document.querySelector('[data-key="23"]')
      const note = document.querySelector('[data-key="23-note"]')
      checkbox.click()
      note.value = 'keep the Python reference explicit'
      note.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })()`)
    assert.equal(await evaluate(app.page,
      `localStorage.getItem('systemsketch.followup-review.2026-09-02.23')`), 'true')
    assert.equal(await evaluate(app.page,
      `localStorage.getItem('systemsketch.followup-review.2026-09-02.23-note')`),
    'keep the Python reference explicit')
    const oldTimeOrigin = await evaluate(app.page, 'performance.timeOrigin')
    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(app.page,
      `performance.timeOrigin !== ${JSON.stringify(oldTimeOrigin)} && document.querySelectorAll('.feature').length === 6`,
      'reloaded follow-up gallery')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-key="23"]').checked
       && document.querySelector('[data-key="23-note"]').value === 'keep the Python reference explicit'`), true)
    pass('acceptance and notes persist across a real browser reload')

    await evaluate(app.page, `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => { window.__followupClipboard = text },
    } })`)
    await clickElement(app.page, '#copy-review')
    const copied = await evaluate(app.page, 'window.__followupClipboard')
    assert.match(copied, /^# SystemSketch follow-up review/m)
    assert.equal((copied.match(/^- \[[ x]\] #/gm) ?? []).length, 6)
    assert.match(copied, /- \[x\] #23 Accept — Local canvas comments/)
    assert.match(copied, /keep the Python reference explicit/)
    pass('copy-to-clipboard emits all six Markdown decisions and review notes')

    await app.page.send('Emulation.setDeviceMetricsOverride', {
      width: 560, height: 900, deviceScaleFactor: 1, mobile: false,
    })
    await waitFor(app.page, `window.innerWidth === 560`, '560px review viewport')
    const responsive = JSON.parse(await evaluate(app.page, `JSON.stringify({
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      bodyColumns: getComputedStyle(document.querySelector('.feature-body')).gridTemplateColumns.split(' ').length,
      footColumns: getComputedStyle(document.querySelector('.feature-foot')).gridTemplateColumns.split(' ').length,
      buttonsVisible: Array.from(document.querySelectorAll('.controls button'), (button) => {
        const rect = button.getBoundingClientRect(); return rect.width > 0 && rect.height > 0
      }).every(Boolean),
    })`))
    assert.deepEqual(responsive, { noOverflow: true, bodyColumns: 1, footColumns: 1, buttonsVisible: true })
    pass('the decision surface collapses cleanly at 560px with usable controls and no overflow')

    await app.page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 960, deviceScaleFactor: 1, mobile: false,
    })
    await evaluate(app.page, `window.scrollTo(0, 0)`)
    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the visually inspected gallery emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} follow-up gallery checks passed.\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
