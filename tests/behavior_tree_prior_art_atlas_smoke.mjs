#!/usr/bin/env node
/** Browser-level proof for the self-contained BT prior-art dictionary. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, delay, evaluate, findChrome, freePort, newPage, waitFor } from './browser_harness.mjs'

const REPORT = `file://${join(ROOT, 'docs', 'behavior-tree-moveit-groot-prior-art-2026-09-04.html')}`
const SNAPSHOT = join(tmpdir(), 'systemsketch-bt-prior-art-atlas-qa.png')

async function dispose(child, profile) {
  child.kill('SIGKILL')
  await Promise.race([once(child, 'exit'), delay(1200)])
  // Chrome's crashpad helper may release Default milliseconds after the browser
  // process does. This is only disposable QA state, so retry rather than let a
  // successful visual assertion look like a failed report.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 1, retryDelay: 80 })
      return
    } catch (error) {
      if (attempt === 7) throw error
      await delay(160)
    }
  }
}

async function launch() {
  const chrome = await findChrome()
  const port = await freePort()
  const profile = await mkdtemp(join(tmpdir(), 'ss-bt-atlas-'))
  const environment = { ...process.env }
  delete environment.DISPLAY
  delete environment.WAYLAND_DISPLAY
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1440,1000', 'about:blank',
  ], { stdio: 'ignore', env: environment })
  for (let index = 0; index < 100; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })
      if (response.ok) return { child, port, profile }
    } catch { /* still starting */ }
    await delay(100)
  }
  await dispose(child, profile)
  throw new Error('Chrome did not expose DevTools')
}

async function main() {
  const { child, port, profile } = await launch()
  try {
    const page = await newPage(port)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__atlasErrors=[];window.addEventListener("error",(event)=>window.__atlasErrors.push(event.message))',
    })
    await page.send('Page.navigate', { url: REPORT })
    await waitFor(page,
      'document.readyState === "complete" && document.querySelectorAll(".dictionary-entry").length === 28',
      'all behavior-tree dictionary entries')
    // The report deliberately lazy-loads lower evidence cards for ordinary
    // reading. Turn that off for QA so every embedded source capture is proven
    // before the structure assertion.
    await evaluate(page, `document.querySelectorAll('img[data-asset]').forEach((image) => { image.loading = 'eager' })`)
    await waitFor(page,
      'Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)',
      'all embedded evidence images', 60000)

    const structure = JSON.parse(await evaluate(page, `JSON.stringify({
      entries: document.querySelectorAll('.dictionary-entry').length,
      originalDrawings: document.querySelectorAll('.proposal-svg').length,
      references: document.querySelectorAll('.source-chip:not(.source-system)').length,
      sourceLinks: document.querySelectorAll('.evidence-card figcaption a').length,
      nativeCatalogRows: document.querySelectorAll('.catalog-table tbody tr').length,
      primarySources: document.querySelectorAll('.source-item').length,
      invalidImageSrc: Array.from(document.querySelectorAll('img[data-asset]')).filter((image) => !image.src.startsWith('data:image/')).length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    })`))
    assert.deepEqual(structure, {
      entries: 28, originalDrawings: 28, references: 54, sourceLinks: 57, nativeCatalogRows: 12, primarySources: 19, invalidImageSrc: 0, overflow: false,
    })
    process.stdout.write('PASS  28 useful entries each render source evidence + original proposal\n')

    await evaluate(page, `document.querySelector('[data-filter="later"]').click()`)
    await waitFor(page,
      'Array.from(document.querySelectorAll(".dictionary-entry:not(.hidden)")).every((entry) => entry.dataset.decision === "later")',
      'later filter')
    const laterVisible = await evaluate(page, 'document.querySelectorAll(".dictionary-entry:not(.hidden)").length')
    assert.equal(laterVisible, 5)
    process.stdout.write('PASS  runtime-dependent items filter cleanly\n')

    await evaluate(page, `(() => {
      document.querySelector('[data-filter="all"]').click()
      const entry = document.querySelector('#A07')
      window.scrollTo({ top: entry.getBoundingClientRect().top + window.scrollY - 74, behavior: 'instant' })
    })()`)
    await waitFor(page, 'Math.abs(document.querySelector("#A07").getBoundingClientRect().top - 74) < 6', 'A07 visual-QA position')
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SNAPSHOT, Buffer.from(shot.data, 'base64'))
    assert.deepEqual(JSON.parse(await evaluate(page, 'JSON.stringify(window.__atlasErrors)')), [])
    process.stdout.write(`PASS  filtered report returns to complete view; visual QA capture: ${SNAPSHOT}\n`)
  } finally {
    await dispose(child, profile)
  }
}

main().catch((error) => {
  process.stderr.write(`FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
