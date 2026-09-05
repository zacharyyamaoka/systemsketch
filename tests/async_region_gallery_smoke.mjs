#!/usr/bin/env node
/** Render and exercise the self-contained Async region report. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  launchChrome,
  localConsoleErrors,
  openCdpPage,
  waitFor,
} from './browser_harness.mjs'

const report = join(ROOT, 'docs', 'async-region-2026-09-05.html')
const session = await launchChrome({ label: 'async-region-gallery', width: 1500, height: 1000 })
let page
try {
  page = await openCdpPage(await session.devToolsPort(), { width: 1500, height: 1000 })
  await page.send('Page.navigate', { url: pathToFileURL(report).href })
  await waitFor(page, 'document.readyState === "complete"', 'Async region gallery')
  assert.equal(await evaluate(page, 'document.querySelectorAll("[data-figure]").length'), 3)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'default')
  await clickElement(page, '[data-view="tagged"]')
  await delay(100)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'tagged')
  await clickElement(page, '[data-view="fixture"]')
  await delay(100)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'fixture')
  assert.deepEqual(localConsoleErrors(page), [])
  process.stdout.write('  PASS  all three embedded evidence views render and switch without console errors\n')
} finally {
  page?.close()
  session.kill()
}
