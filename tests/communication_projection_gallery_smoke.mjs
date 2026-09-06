#!/usr/bin/env node
/** Browser exercise for the self-contained Babble comparison surface. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

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

const report = join(ROOT, 'docs', 'communication-projection-prototype-2026-09-04.html')
const session = await launchChrome({ label: 'communication-projection-gallery', width: 1500, height: 1000, offline: false })
let page

async function clickVisible(page, selector) {
  await evaluate(page, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)})
    const documentTop = target.getBoundingClientRect().top + window.scrollY
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, Math.max(0, documentTop - 320))
  })()`)
  await delay(80)
  await clickElement(page, selector)
}

try {
  page = await openCdpPage(await session.devToolsPort(), { width: 1500, height: 1000 })
  await page.send('Page.navigate', { url: pathToFileURL(report).href })
  await waitFor(page, 'document.readyState === "complete"', 'communication comparison gallery')
  assert.equal(await evaluate(page, 'document.querySelectorAll(".variant-card").length'), 2)
  assert.equal(await evaluate(page, 'document.querySelector("#variant-grid").classList.contains("focus-layout")'), false)

  const card = '[data-variant="v1"]'
  await waitFor(page, `document.querySelector('${card} .prototype').dataset.storyState === 'wiring'`, 'initial Dataflow story state')
  await clickVisible(page, `${card} [data-view-button="tagged"]`)
  await delay(150)
  assert.equal(await evaluate(page, `document.querySelector('${card} .prototype').dataset.storyState`), 'tagged')
  assert.equal(await evaluate(page, `document.querySelector('${card}').dataset.storyIndex`), '1')
  assert.equal(await evaluate(page, `document.querySelector('${card} [data-story-label]').textContent`), 'Audit the semantic parse')

  await clickVisible(page, `${card} [data-story-action="next"]`)
  await delay(150)
  assert.equal(await evaluate(page, `document.querySelector('${card} .prototype').dataset.storyState`), 'component_port')
  assert.equal(await evaluate(page, `getComputedStyle(document.querySelector('${card} [data-view-image="component_port"]')).display`), 'block')

  await clickVisible(page, `${card} [data-view-button="component_simple"]`)
  await delay(150)
  assert.equal(await evaluate(page, `document.querySelector('${card} .prototype').dataset.storyState`), 'component_simple')
  assert.equal(await evaluate(page, `document.querySelector('${card}').dataset.storyIndex`), '3')
  assert.equal(await evaluate(page, `getComputedStyle(document.querySelector('${card} [data-view-image="component_simple"]')).display`), 'block')

  await clickVisible(page, `${card} [data-view-button="wiring"]`)
  await delay(150)
  assert.equal(await evaluate(page, `document.querySelector('${card}').dataset.storyIndex`), '0')
  assert.deepEqual(localConsoleErrors(page), [])
  process.stdout.write('  PASS  two unranked route authorities render in one grid\n')
  process.stdout.write('  PASS  direct view controls and Back/Next share one synchronized state machine\n')
  process.stdout.write('  PASS  Port and same-size Simple evidence are reachable without console errors\n')
} finally {
  page?.close()
  session.kill()
}
