#!/usr/bin/env node
/** Real-browser interaction check for the self-contained association report. */
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

const report = join(ROOT, 'docs', 'communication-association-focus-2026-09-04.html')
const session = await launchChrome({ label: 'communication-association-gallery', width: 1500, height: 1000 })
let page

try {
  page = await openCdpPage(await session.devToolsPort(), { width: 1500, height: 1000 })
  await page.send('Page.navigate', { url: pathToFileURL(report).href })
  await waitFor(page, 'document.readyState === "complete"', 'association gallery')
  assert.equal(await evaluate(page, 'document.querySelectorAll("[data-figure]").length'), 8)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'dataflow')
	await clickElement(page, '[data-view="canvas-dismiss"]')
	await delay(120)
	assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'canvas-dismiss')
	await clickElement(page, '[data-view="shape-dismiss"]')
	await delay(120)
	assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'shape-dismiss')
  await clickElement(page, '[data-view="elbow-focus"]')
  await delay(120)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'elbow-focus')
  await clickElement(page, '[data-view="straight-focus"]')
  await delay(120)
  assert.equal(await evaluate(page, 'document.querySelector("[data-figure].active")?.dataset.figure'), 'straight-focus')
  assert.deepEqual(localConsoleErrors(page), [])
  process.stdout.write('  PASS  all eight embedded evidence states render in the self-contained report\n')
  process.stdout.write('  PASS  evidence tabs switch through focus, click-away, and route treatments without console errors\n')
} finally {
  page?.close()
  session.kill()
}
