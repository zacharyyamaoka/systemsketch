#!/usr/bin/env node
/**
 * Probe the DEPLOYED Stable channel, not a fresh build: open the immutable
 * Stable app on its real port in an isolated Block Dev board and drive the
 * sibling wiring and picker gestures that were broken before the polarity
 * rebuild. Reads the build id the page reports so the claim names the artifact.
 *
 *   node tests/stable_polarity_probe.mjs            # defaults to :4321
 *   STABLE_URL=http://127.0.0.1:4321 node tests/stable_polarity_probe.mjs
 *
 * Uses `?preset=block-dev`, whose board is browser-local to this throwaway
 * Chrome profile, so Zach's real workspace is never opened or written.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  delay,
  evaluate,
  findChrome,
  localConsoleErrors,
  newPage,
  openApp,
  waitFor,
} from './browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  cableEnds,
  deselect,
  dragFrom,
  drawBlock,
  nearestDot,
  portClasses,
  portDot,
  setView,
  shot,
} from './block_journey_helpers.mjs'

const STABLE_URL = process.env.STABLE_URL ?? 'http://127.0.0.1:4321'
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`))
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
  const chromePath = await findChrome()
  const profile = await mkdtemp(join(tmpdir(), 'systemsketch-stable-probe-'))
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--window-size=1440,960', 'about:blank',
  ], { stdio: 'ignore' })
  let page = null
  try {
    const cdpPort = await waitForDevTools(profile, chrome)
    page = await newPage(cdpPort)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable')
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })

    // The URL carries the port; `openApp` wants a bare port, so navigate directly.
    await page.send('Page.navigate', { url: `${STABLE_URL}/?preset=block-dev` })
    await waitFor(page, 'document.readyState === "complete"', 'page load')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas on Stable')
    await delay(700)

    const build = await evaluate(page, `(async () => {
      try { const r = await fetch('/api/release'); return (await r.json()).build ?? null } catch { return null }
    })()`)
    check('STABLE-0', `the page is served by the Stable channel (${STABLE_URL})`, typeof build, 'string')
    process.stdout.write(`        build=${build}\n`)

    const rest = { x: 300, y: 780 }
    await drawBlock(page, { x: 60, y: 140 }, { x: 400, y: 340 }, 'encode')
    const [encode] = await blockIds(page)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await setView(page, 'expanded')
    await deselect(page, rest)
    await drawBlock(page, { x: 700, y: 140 }, { x: 1040, y: 340 }, 'merge')
    const merge = (await blockIds(page)).find((id) => id !== encode)
    await addPort(page, 'inputs')
    await setView(page, 'expanded')
    await deselect(page, rest)
    const names = { [encode]: 'encode', [merge]: 'merge' }
    const dots = {
      'encode.out': await box(page, portDot(encode, 'output', 'out_1')),
      'merge.in': await box(page, portDot(merge, 'input', 'in_1')),
    }

    const sibling = await dragFrom(page, dots['encode.out'], dots['merge.in'])
    const ends = await cableEnds(page).catch(() => null)
    check('STABLE-1', 'two Expanded siblings wire from the output dot', sibling.count, 1)
    check('STABLE-1-DIR', 'and the cable runs from encode.out into merge.in, leaving and arriving rightward',
      ends && { from: nearestDot(ends.from, dots), to: nearestDot(ends.to, dots), leaves: ends.leaveDx > 0, arrives: ends.arriveDx > 0 },
      { from: 'encode.out', to: 'merge.in', leaves: true, arrives: true })
    await shot(page, 'stable-polarity-sibling.png')
    // No cleanup here: the dev seam does not exist in a production build, and
    // the sibling cable staying put is itself a claim — encode.out_1 fans out.

    const before = await blockIds(page)
    const toEmpty = await dragFrom(page, dots['encode.out'], { x: 700, y: 640 })
    check('STABLE-2', 'a drop on empty space offers a Block', toEmpty.offered, true)
    const item = await box(page, '[data-testid="block-picker-call"]')
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: item.cx, y: item.cy })
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: item.cx, y: item.cy, button: 'left', buttons: 1, clickCount: 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: item.cx, y: item.cy, button: 'left', clickCount: 1 })
    await delay(700)
    const spawned = (await blockIds(page)).find((id) => !before.includes(id))
    if (spawned) names[spawned] = 'call'
    const wired = (await portClasses(page)).filter((entry) => entry.connected)
      .map((entry) => `${names[entry.shape] ?? '?'}.${entry.port}`).sort()
    check('STABLE-3', 'the picked Block is wired through its input, beside the sibling cable that stays',
      wired, ['call.in_1', 'encode.out_1', 'merge.in_1'])
    await shot(page, 'stable-polarity-picker.png')

    // Fan-in on the deployed build: the picked Block's output back onto
    // merge.in_1, which encode.out_1 already feeds — the first cable must stay.
    if (spawned) {
      dots['call.out'] = await box(page, portDot(spawned, 'output', 'out_1'))
      const cablesBefore = (await portClasses(page)).length // any read keeps the pointer settled
      void cablesBefore
      const fanIn = await dragFrom(page, dots['call.out'], dots['merge.in'])
      check('STABLE-4', 'a second producer onto the occupied input joins it', fanIn.count, 3)
      check('STABLE-5', 'every dot on the way reads as wired',
        (await portClasses(page)).filter((entry) => entry.connected)
          .map((entry) => `${names[entry.shape] ?? '?'}.${entry.port}`).sort(),
        ['call.in_1', 'call.out_1', 'encode.out_1', 'merge.in_1'])
      await shot(page, 'stable-fanin.png')
    }

    check('STABLE-CLEAN', 'no local console errors', localConsoleErrors(page), [])
    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed against ${STABLE_URL} build ${build}\n`)
    if (failed.length > 0) process.exitCode = 1
  } finally {
    page?.close()
    chrome.kill('SIGKILL')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
