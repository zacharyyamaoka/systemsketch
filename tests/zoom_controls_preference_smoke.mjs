#!/usr/bin/env node
/**
 * Real-browser proof for the Appearance preference that keeps the compact
 * zoom strip as the default while allowing the explicit −/+ actions back.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'zoom-controls-preference.json')
const checks = []

function pass(label) {
  checks.push({ label, ok: true })
  process.stdout.write(`  PASS  ${label}\n`)
}

function assert(condition, label, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ''}`)
  pass(label)
}

async function state(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify({
    zoomOut: Boolean(document.querySelector('[data-testid="systemsketch-zoom-out"]')),
    zoomIn: Boolean(document.querySelector('[data-testid="systemsketch-zoom-in"]')),
    percentage: document.querySelector('.systemsketch-utility-strip .tlui-zoom-menu__button')?.textContent?.trim() ?? null,
    zoom: window.__systemsketch?.editor?.getZoomLevel() ?? null,
    stored: localStorage.getItem('systemsketch.appearance.v1'),
  })`))
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

async function waitForApp(page) {
  await waitFor(page, `window.__systemsketch?.editor && document.querySelector('.systemsketch-utility-strip .tlui-zoom-menu__button')`, 'the utility strip')
  await delay(300)
}

async function openAppearanceSettings(page) {
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-appearance"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-show-zoom-buttons"]')`, 'the zoom-buttons preference')
  await evaluate(page, `document.querySelector('[data-testid="systemsketch-show-zoom-buttons"]')?.scrollIntoView({ block: 'center' })`)
  await delay(180)
}

async function closeSettings(page) {
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'zoom-controls-preference', build: 'zoom-controls-preference-smoke', width: 1280, height: 820 })
  const { page, port } = app
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'zoom-controls-preference.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitForApp(page)

    const initial = await state(page)
    assert(!initial.zoomOut && !initial.zoomIn, '−/+ zoom buttons are hidden by default')
    assert(initial.percentage === '100%', 'the 100% zoom menu remains visible in the compact default')
    assert(initial.stored === null, 'the compact default needs no stored preference')
    await shot(page, 'zoom-controls-hidden.png')

    await openAppearanceSettings(page)
    const unchecked = await evaluate(page, `document.querySelector('[data-testid="systemsketch-show-zoom-buttons"]')?.getAttribute('aria-checked')`)
    assert(unchecked === 'false', 'Appearance opens with Show zoom −/+ buttons unchecked')
    await shot(page, 'zoom-controls-appearance-setting.png')

    await clickElement(page, '[data-testid="systemsketch-show-zoom-buttons"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-zoom-out"]') && document.querySelector('[data-testid="systemsketch-zoom-in"]')`, 'both zoom step buttons')
    const enabled = await state(page)
    assert(enabled.stored === '{"version":1,"showZoomButtons":true}', 'enabling persists the versioned local preference')
    await closeSettings(page)
    await shot(page, 'zoom-controls-shown.png')

    const before = (await state(page)).zoom
    await clickElement(page, '[data-testid="systemsketch-zoom-in"]')
    const zoomedIn = (await state(page)).zoom
    assert(zoomedIn > before, 'the restored + button invokes the stock zoom-in action')
    await clickElement(page, '[data-testid="systemsketch-zoom-out"]')
    const zoomedOut = (await state(page)).zoom
    assert(zoomedOut < zoomedIn, 'the restored − button invokes the stock zoom-out action')

    await page.send('Page.reload', { ignoreCache: true })
    await delay(700)
    await waitForApp(page)
    const reloadedShown = await state(page)
    assert(reloadedShown.zoomOut && reloadedShown.zoomIn, 'shown buttons survive a full reload')

    await openAppearanceSettings(page)
    const checked = await evaluate(page, `document.querySelector('[data-testid="systemsketch-show-zoom-buttons"]')?.getAttribute('aria-checked')`)
    assert(checked === 'true', 'Appearance reflects the stored enabled state')
    await clickElement(page, '[data-testid="systemsketch-show-zoom-buttons"]')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-zoom-out"]') && !document.querySelector('[data-testid="systemsketch-zoom-in"]')`, 'both zoom step buttons to hide')
    await closeSettings(page)

    await page.send('Page.reload', { ignoreCache: true })
    await delay(700)
    await waitForApp(page)
    const reloadedHidden = await state(page)
    assert(!reloadedHidden.zoomOut && !reloadedHidden.zoomIn, 'hidden buttons stay hidden after reload')
    assert(reloadedHidden.percentage !== null, 'the zoom percentage remains available after reload')

    const errors = localConsoleErrors(page)
    assert(errors.length === 0, 'the journey emits no local console errors', errors.join('\n'))
    await writeFile(RESULTS, JSON.stringify({ ranAt: new Date().toISOString(), checks }, null, 2) + '\n')
    process.stdout.write(`\n${checks.length} checks passed · ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
