#!/usr/bin/env node
/** Prove the one-page improvement review is readable and its decisions persist. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SCREENSHOT = join(ROOT, 'docs', 'assets', 'repo-improvements-review-gallery.png')
const { checks, pass } = makeChecklist()

async function clickVisible(page, selector) {
  await evaluate(page,
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center', behavior: 'instant' })`)
  await delay(80)
  await page.send('Page.bringToFront')
  await clickElement(page, selector)
}

async function main() {
  const app = await startApp({ label: 'systemsketch-review-gallery', build: 'review-gallery', width: 1440, height: 960 })
  try {
    const targetPort = Number(process.env.SYSTEMSKETCH_REVIEW_PORT ?? app.port)
    assert.equal(Number.isInteger(targetPort) && targetPort > 0, true, 'SYSTEMSKETCH_REVIEW_PORT must be a port number')
    await openApp(app.page, targetPort, 'docs/repo-improvement-review-2026-09-02.html')
    await waitFor(app.page, `document.querySelectorAll('.finding').length === 35`, 'all 35 review findings')
    pass('the report renders exactly 35 ranked findings')

    const structure = JSON.parse(await evaluate(app.page, `JSON.stringify({
      top: document.querySelectorAll('[data-status="shipped"]').length,
      bonus: document.querySelectorAll('[data-status="bonus"]').length,
      open: document.querySelectorAll('[data-status="open"]').length,
      screenshots: document.querySelectorAll('.finding--detail figure img').length,
      decisions: document.querySelectorAll('[data-review="decision"]').length,
      notes: document.querySelectorAll('[data-review="note"]').length,
    })`))
    assert.deepEqual(structure, { top: 10, bonus: 1, open: 24, screenshots: 11, decisions: 35, notes: 35 })
    pass('ten shipped + one bonus + 24 open candidates each have an independent decision surface')

    await waitFor(app.page,
      `Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)`,
      'all embedded evidence images')
    assert.equal(await evaluate(app.page, `document.documentElement.scrollWidth <= window.innerWidth`), true)
    pass('all 15 evidence images load and the 1440px report has no horizontal overflow')

    const handoff = JSON.parse(await evaluate(app.page, `JSON.stringify({
      liveBoard: new URL(document.querySelector('#live-review-board').href).searchParams.get('board'),
      fixtures: Array.from(document.querySelectorAll('[data-review-fixture]'), (link) => link.href),
    })`))
    assert.match(handoff.liveBoard, /\/sketches\/review\/library-overview\.systemsketch$/)
    assert.equal(handoff.fixtures.length, 2)
    const fixtureResponses = await Promise.all(handoff.fixtures.map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      return { ok: response.ok, text: await response.text() }
    }))
    assert.equal(fixtureResponses.every(({ ok, text }) =>
      ok && text.includes('"systemSketch"')), true)
    pass('the live-board URL targets the real combined fixture and both downloadable fixture links resolve')

    await evaluate(app.page, `(() => {
      const checkbox = document.querySelector('[data-key="finding-1"]')
      const note = document.querySelector('[data-key="finding-1-note"]')
      checkbox.click()
      note.value = 'persistence probe'
      note.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'persistence probe' }))
    })()`)
    assert.equal(await evaluate(app.page,
      `localStorage.getItem('systemsketch.repo-review.2026-09-02.finding-1')`), 'true')
    assert.equal(await evaluate(app.page,
      `localStorage.getItem('systemsketch.repo-review.2026-09-02.finding-1-note')`), 'persistence probe')
    pass('checkbox and note input write separate local review state')

    const previousNavigation = await evaluate(app.page, 'performance.timeOrigin')
    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(app.page,
      `performance.timeOrigin !== ${JSON.stringify(previousNavigation)} && document.readyState === 'complete'`,
      'completed browser reload')
    await waitFor(app.page, `document.querySelectorAll('.finding').length === 35`, 'reloaded review findings')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-key="finding-1"]').checked
       && document.querySelector('[data-key="finding-1-note"]').value === 'persistence probe'`), true)
    pass('the decision and note survive a real browser reload')

    await clickVisible(app.page, '[data-filter="open"]')
    const openFilter = JSON.parse(await evaluate(app.page, `JSON.stringify({
      hidden: document.querySelectorAll('.finding.hidden').length,
      visibleStatuses: [...new Set(Array.from(document.querySelectorAll('.finding:not(.hidden)'),
        (card) => card.dataset.status))],
    })`))
    assert.deepEqual(openFilter, { hidden: 11, visibleStatuses: ['open'] })
    pass('Open candidates filters out all eleven implemented cards')

    await evaluate(app.page, `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => { window.__reviewClipboard = text },
    } })`)
    await clickVisible(app.page, '#copy-review')
    const copied = await evaluate(app.page, `window.__reviewClipboard`)
    assert.match(copied, /^# SystemSketch improvement review/m)
    assert.equal((copied.match(/^- \[[ x]\] #/gm) ?? []).length, 35)
    assert.match(copied, /#01 Keep this fix — Quarantine unreadable documents/)
    assert.match(copied, /persistence probe/)
    pass('Copy review Markdown emits all 35 decisions and their notes')

    await clickVisible(app.page, '#reset-review')
    assert.equal(await evaluate(app.page,
      `Object.keys(localStorage).filter((key) => key.startsWith('systemsketch.repo-review.2026-09-02.')).length`), 0)
    pass('Reset removes only this report’s saved review state')

    await clickVisible(app.page, '[data-filter="all"]')
    await evaluate(app.page, `document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0)`)
    await waitFor(app.page, `window.scrollY === 0`, 'top-of-report capture position')
    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the inspected report emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} review-gallery checks passed.\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
