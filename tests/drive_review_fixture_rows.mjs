#!/usr/bin/env node
/**
 * Drive a copy of the header-port-rows review fixture once in the real app:
 * open it by `?board=`, hold transform's dot and carry it into the heading,
 * and read the dot's row back from the paint. A copy, because the app
 * autosaves into whatever board it opens.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, clickAt, delay, evaluate, mouse, openApp, startApp, waitFor } from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'header-port-rows.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'header-port-rows-fixture-driven-2026-09-01.png')

async function main() {
  const app = await startApp({ label: 'systemsketch-fixture-rows', build: 'fixture-rows' })
  const { page, port, filesRoot } = app
  try {
    const scratch = join(filesRoot, 'SystemSketch', 'header-port-rows-copy.systemsketch')
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"] .Port[data-block-port-side="input"]').length === 3`, 'fixture Block with three inputs')
    await delay(600)
    const box = async (selector) => JSON.parse(await evaluate(page, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 }) })()`))
    const transform = await box('[data-shape-type="block"] .Port[data-block-port-id="in_3"]')
    const heading = await box('[data-shape-type="block"] .NodeShape-heading')
    await mouse(page, 'mouseMoved', transform.cx, transform.cy)
    await mouse(page, 'mousePressed', transform.cx, transform.cy, { buttons: 1 })
    await delay(760)
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', transform.cx, transform.cy + ((heading.cy + 6 - transform.cy) * step) / 8, { buttons: 1 })
      await delay(30)
    }
    await delay(100)
    const band = await evaluate(page, `document.querySelector('[data-testid="block-port-drop-band"]')?.dataset.dropRow ?? null`)
    await mouse(page, 'mouseReleased', transform.cx, heading.cy + 6)
    await delay(300)
    const row = await evaluate(page, `document.querySelector('[data-shape-type="block"] .Port[data-block-port-id="in_3"]').dataset.blockPortRow`)
    await clickAt(page, 300, 650)
    await delay(300)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    assert.equal(band, '0', `the heading band was offered, saw ${band}`)
    assert.equal(row, '0', `transform rides the heading, saw row ${row}`)
    process.stdout.write(`fixture driven: transform → row ${row}; band ${band}\n${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
