#!/usr/bin/env node
/** Interaction and visual proof for the self-contained routing stress report. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

async function main() {
  const app = await startApp({
    label: 'systemsketch-collision-routing-stress-report',
    build: 'collision-routing-stress-report',
    width: 1500,
    height: 980,
  })
  try {
    await openApp(app.page, app.port, 'docs/collision-routing-stress-2026-09-02.html')
    await waitFor(app.page, `document.querySelector('h1')?.textContent.includes('Fifty routes')`, 'stress report')
    assert.equal(await evaluate(app.page, `document.querySelectorAll('tbody tr').length`), 50)

    await evaluate(app.page, `document.querySelector('.comparison').scrollIntoView({ block: 'center' })`)
    const imageBefore = await evaluate(app.page, `document.querySelector('.comparison img').src`)
    await clickElement(app.page, `.comparison [data-show="before"]`)
    const imageAfter = await evaluate(app.page, `document.querySelector('.comparison img').src`)
    assert.notEqual(imageAfter, imageBefore)

    await evaluate(app.page, `document.querySelector('[data-filter="branch"]').scrollIntoView({ block: 'center' })`)
    await clickElement(app.page, `[data-filter="branch"]`)
    assert.equal(await evaluate(app.page,
      `Array.from(document.querySelectorAll('tbody tr')).filter((row) => !row.hidden).length`), 10)
    await evaluate(app.page, `document.querySelector('.gallery').scrollIntoView({ block: 'start' })`)

    const screenshot = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(
      join(ROOT, 'docs', 'assets', 'collision-routing-stress-report.png'),
      Buffer.from(screenshot.data, 'base64'),
    )
    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write('  4/4 stress-report browser checks passed\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
