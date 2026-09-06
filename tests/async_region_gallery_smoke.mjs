#!/usr/bin/env node
/** Render and exercise the self-contained Async region report. */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  ROOT,
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
  assert.equal(await evaluate(page, 'document.querySelectorAll("[data-figure]").length'), 9)
  assert.equal(await evaluate(page, 'document.querySelectorAll("video[autoplay][muted][loop][controls]").length'), 1)
  assert.equal(await evaluate(page, 'document.querySelector("video source[type=\\"video/mp4\\"]")?.src.startsWith("data:video/mp4;base64,")'), true)
  assert.equal(await evaluate(page, 'document.querySelector("video .hero-gif")?.src.startsWith("data:image/gif;base64,")'), true)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['default', 'stress-fixture'])
  await evaluate(page, `document.querySelector('[data-view="tagged"]').click()`)
  await delay(100)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'tagged')
  await evaluate(page, `document.querySelector('[data-view="fixture"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-fixture'])
  await evaluate(page, `document.querySelector('[data-view="stress-tagged"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-tagged'])
  await evaluate(page, `document.querySelector('[data-view="stress-focus"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-focus'])
  await evaluate(page, `document.querySelector('[data-view="stress-fixed-carriers"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-fixed-carriers'])
  await evaluate(page, `document.querySelector('[data-view="stress-shortest-carriers"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-shortest-carriers'])
  await evaluate(page, `document.querySelector('[data-view="stress-new-wire"]').click()`)
  await delay(100)
  assert.deepEqual(await evaluate(page, '[...document.querySelectorAll("[data-figure].active")].map((node) => node.dataset.figure)'), ['fixture', 'stress-new-wire'])
  assert.deepEqual(localConsoleErrors(page), [])
  process.stdout.write('  PASS  the embedded hero and all nine base/stress evidence views render and switch independently without console errors\n')
} finally {
  page?.close()
  session.kill()
}
