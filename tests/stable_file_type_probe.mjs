#!/usr/bin/env node
/**
 * Probe the DEPLOYED Stable channel for the `.systemsketch` document type.
 *
 * A fresh build proving itself is not the same claim as the immutable build
 * Zach opens from his dock. This drives that one on its real port, against a
 * scratch board inside the repo's `sketches/` folder, and deletes the file it
 * made. His own `~/SystemSketch` workspace is never opened or written.
 *
 *   node tests/stable_file_type_probe.mjs           # defaults to :4321
 *   STABLE_URL=http://127.0.0.1:4321 node tests/stable_file_type_probe.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  findChrome,
  localConsoleErrors,
  newPage,
  waitFor,
} from './browser_harness.mjs'
import { addPort, blockIds, box, cables, drawBlock, dragFrom, portClasses, portDot, shot }
  from './block_journey_helpers.mjs'

const STABLE_URL = process.env.STABLE_URL ?? 'http://127.0.0.1:4321'
const SCRATCH_DIR = join(ROOT, 'sketches')
const SCRATCH = join(SCRATCH_DIR, 'stable-file-type-probe.systemsketch')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n        desired= ${JSON.stringify(desired)}\n`))
}

async function waitForDevTools(profileDir, chrome, timeoutMs = 20000) {
  const portFile = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited (${chrome.exitCode})`)
    try {
      const [line] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/)
      const port = Number(line)
      if (Number.isInteger(port) && port > 0) return port
    } catch { /* not yet */ }
    await delay(50)
  }
  throw new Error('Timed out waiting for Chrome DevTools')
}

async function main() {
  await mkdir(SCRATCH_DIR, { recursive: true })
  await rm(SCRATCH, { force: true })
  const chromePath = await findChrome()
  const profile = await mkdtemp(join(tmpdir(), 'systemsketch-file-type-probe-'))
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--window-size=1440,960', 'about:blank',
  ], { stdio: 'ignore' })
  let page = null
  let build = null
  try {
    const cdpPort = await waitForDevTools(profile, chrome)
    page = await newPage(cdpPort)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable')
    await page.send('Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

    await page.send('Page.navigate', { url: `${STABLE_URL}/?board=${encodeURIComponent(SCRATCH)}` })
    await waitFor(page, 'document.readyState === "complete"', 'page load')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the SystemSketch product canvas on Stable')
    await delay(900)

    build = await evaluate(page, `(async () => {
      try { return (await (await fetch('/api/health')).json()).build ?? null } catch { return null }
    })()`)
    // The oracle is the channel manifest on disk, not the page's word for
    // itself: a Preview lane answering on :4321 would otherwise pass this.
    const channels = JSON.parse(await readFile(
      join(homedir(), '.local', 'share', 'systemsketch', 'runtime', 'channels.json'), 'utf8'))
    check('STABLE-BUILD',
      `the page on ${STABLE_URL} is the build the channel manifest calls Stable`,
      build, channels.stable)
    check('STABLE-OPENS-SYSTEMSKETCH', 'Stable accepted a .systemsketch path and named it',
      await evaluate(page, `document.querySelector('.systemsketch-file-title span')?.textContent`),
      'stable-file-type-probe')

    await drawBlock(page, { x: 300, y: 260 }, { x: 640, y: 460 }, 'ingest')
    await addPort(page, 'outputs')
    await drawBlock(page, { x: 820, y: 260 }, { x: 1160, y: 460 }, 'classify')
    await addPort(page, 'inputs')
    await clickAt(page, 200, 900)
    await delay(340)
    const ports = await portClasses(page)
    await dragFrom(page,
      await box(page, portDot(ports.find((p) => p.port === 'out_1').shape, 'output', 'out_1')),
      await box(page, portDot(ports.find((p) => p.port === 'in_1').shape, 'input', 'in_1')))
    await delay(400)
    check('STABLE-AUTHORS', 'two Blocks and a semantic cable are authored on Stable',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })

    await waitFor(page,
      `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
      'Stable to report the document saved', 15000)
    await delay(300)
    await shot(page, 'stable-file-type-board.png')

    const written = JSON.parse(await readFile(SCRATCH, 'utf8'))
    check('STABLE-WRITES-THE-ENVELOPE', 'the file Stable wrote is a .systemsketch document',
      {
        firstKey: Object.keys(written)[0],
        application: written.systemSketch?.application,
        formatVersion: written.systemSketch?.formatVersion,
        blocks: written.systemSketch?.shapes?.block ?? 0,
        tldrawFileFormatVersion: written.tldrawFileFormatVersion,
      },
      {
        firstKey: 'systemSketch',
        application: 'SystemSketch',
        formatVersion: 1,
        blocks: 2,
        tldrawFileFormatVersion: 1,
      })

    await page.send('Page.navigate', { url: `${STABLE_URL}/?board=${encodeURIComponent(SCRATCH)}` })
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'the board to reopen from the .systemsketch file on Stable')
    check('STABLE-REOPENS', 'Stable reopens what it wrote, cable included',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })

    check('CLEAN', 'the probe raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed on ${STABLE_URL}\n`)
    await writeFile(join(ROOT, 'docs', 'assets', 'stable-file-type.json'),
      JSON.stringify({ build, url: STABLE_URL, results }, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    page?.close()
    chrome.kill('SIGKILL')
    // The probe leaves nothing behind in the workspace it borrowed.
    await rm(SCRATCH, { force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
