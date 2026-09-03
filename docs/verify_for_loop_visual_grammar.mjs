#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  delay,
  evaluate,
  findChrome,
  localConsoleErrors,
  newPage,
  waitFor,
} from '../tests/browser_harness.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const GALLERY = join(ROOT, 'docs', 'for-loop-visual-grammar-babble-2026-09-02.html')
const ASSETS = join(ROOT, 'docs', 'assets')

async function waitForDevTools(profile, child) {
  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited early (${child.exitCode})`)
    try {
      const [line] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/)
      if (Number(line) > 0) return Number(line)
    } catch { /* Chrome writes the file after launch. */ }
    await delay(50)
  }
  throw new Error('Chrome DevTools did not become ready')
}

async function capture(page, name, selector) {
  await evaluate(page, `(() => {
    document.documentElement.style.scrollBehavior = 'auto'
    const target = document.querySelector(${JSON.stringify(selector)})
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY)
  })()`)
  await delay(120)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(shot.data, 'base64'))
}

async function main() {
  const profile = await mkdtemp(join(tmpdir(), 'systemsketch-loop-gallery-'))
  const chrome = spawn(await findChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1600,1100',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
  let page
  try {
    const port = await waitForDevTools(profile, chrome)
    page = await newPage(port)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable')
    await page.send('Page.navigate', { url: pathToFileURL(GALLERY).href })
    await waitFor(page, 'document.querySelectorAll(".variant-card").length === 10', 'ten variants')
    await waitFor(page, 'document.querySelectorAll(".stress-card").length === 15', 'fifteen stress examples')

    const interaction = await evaluate(page, `(() => {
      const results = []
      for (const card of document.querySelectorAll('.variant-card')) {
        const direct = card.querySelector('[data-demo-toggle]')
        const back = card.querySelector('[data-story-action="back"]')
        direct.click()
        results.push({
          id: card.dataset.variant,
          afterDirect: card.dataset.storyIndex,
          alt: card.querySelector('.prototype').classList.contains('is-alt'),
        })
        back.click()
        results.at(-1).afterBack = card.dataset.storyIndex
        results.at(-1).base = !card.querySelector('.prototype').classList.contains('is-alt')
      }
      return results
    })()`)
    for (const result of interaction) {
      if (result.afterDirect !== '1' || !result.alt || result.afterBack !== '0' || !result.base) {
        throw new Error(`walkthrough/direct controls drifted for ${result.id}: ${JSON.stringify(result)}`)
      }
    }

    const audit = await evaluate(page, `(() => ({
      variants: document.querySelectorAll('.variant-card').length,
      stress: document.querySelectorAll('.stress-card').length,
      families: [...document.querySelectorAll('.stress-family h3')].map((node) => node.textContent.trim()),
      scoreRows: document.querySelectorAll('#score-matrix tbody tr').length,
      recommended: document.querySelector('#ai-recommendation .recommendation-line')?.textContent.trim() ?? '',
    }))()`)
    if (audit.scoreRows !== 10) throw new Error(`expected 10 score rows, got ${audit.scoreRows}`)

    await capture(page, 'for-loop-grammar-gallery-hero.png', 'header')
    await capture(page, 'for-loop-grammar-gallery-prune.png', '#ai-prune')
    await capture(page, 'for-loop-grammar-gallery-stress.png', '#stress-heading')
    await capture(page, 'for-loop-grammar-gallery-stress-pills.png', '.stress-family:last-of-type')

    const errors = localConsoleErrors(page)
    if (errors.length) throw new Error(`browser console errors: ${errors.join('; ')}`)
    process.stdout.write(`${JSON.stringify({ ...audit, interactions: interaction.length, consoleErrors: 0 }, null, 2)}\n`)
  } finally {
    page?.close()
    chrome.kill('SIGTERM')
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
