#!/usr/bin/env node
/** Real-browser proof for default and flipped plain-wheel zoom directions. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const RESULTS = join(ASSETS, 'wheel-zoom-results.json')
const BEFORE = join(ASSETS, 'wheel-zoom-before.png')
const AFTER = join(ASSETS, 'wheel-zoom-after.png')
const SETTING = join(ASSETS, 'wheel-zoom-direction-setting.png')
const FLIPPED = join(ASSETS, 'wheel-zoom-flipped.png')

const { checks, pass } = makeChecklist()

async function cameraState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    return JSON.stringify({
      camera: editor?.getCamera() ?? null,
      inputMode: editor?.user.getUserPreferences().inputMode ?? null,
      isZoomDirectionInverted: editor?.user.getUserPreferences().isZoomDirectionInverted ?? null,
      wheelBehavior: editor?.getCameraOptions().wheelBehavior ?? null,
      zoomLabel: document.querySelector('.systemsketch-utility-strip .tlui-zoom-menu__button')?.textContent?.trim() ?? null,
      appearance: JSON.parse(localStorage.getItem('systemsketch.appearance.v1') ?? 'null'),
    })
  })()`))
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function openAppearanceSettings(page) {
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-appearance"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-scroll-down-zooms-in"]')`, 'the wheel direction preference')
  await evaluate(page, `document.querySelector('[data-testid="systemsketch-scroll-down-zooms-in"]')?.scrollIntoView({ block: 'center' })`)
  await delay(180)
}

async function closeSettings(page) {
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function main() {
  process.stdout.write('  SETUP starting isolated app\n')
  const app = await startApp({ label: 'wheel-zoom', build: 'wheel-zoom-smoke', width: 1280, height: 820 })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'wheel-zoom.systemsketch')
    process.stdout.write('  SETUP opening scratch board\n')
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the SystemSketch editor')

    // Seed visible scale cues through stock shape interaction, not through the model seam.
    process.stdout.write('  SETUP drawing scale cue\n')
    await key(app.page, 'r', 'KeyR')
    await drag(app.page, { x: 390, y: 270 }, { x: 860, y: 610 })
    await key(app.page, 'Escape', 'Escape')
    await delay(250)

    // Reproduce the saved setting that overrides tldraw camera options, then
    // prove a fresh SystemSketch mount takes the wheel contract back.
    process.stdout.write('  SETUP reproducing stale Trackpad mode\n')
    await evaluate(app.page, `window.__systemsketch.editor.user.updateUserPreferences({ inputMode: 'trackpad' })`)
    process.stdout.write('  SETUP remounting scratch board\n')
    await openApp(
      app.page,
      app.port,
      `?board=${encodeURIComponent(board)}&wheelProof=remount`,
    )
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'mouse'
        && window.__systemsketch?.editor?.user.getUserPreferences().isZoomDirectionInverted === true`,
      'the reloaded SystemSketch wheel contract',
    )
    await delay(350)

    const before = await cameraState(app.page)
    assert.equal(before.wheelBehavior, 'zoom')
    pass('the mounted stock camera declares plain-wheel zoom behavior')
    assert.equal(before.inputMode, 'mouse')
    pass('a stale Trackpad preference cannot override wheel zoom after remount')
    assert.equal(before.isZoomDirectionInverted, true)
    assert.equal(before.appearance, null)
    pass('scroll down to zoom in is the first-run default')
    await screenshot(app.page, BEFORE)

    await app.page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 640,
      y: 440,
      deltaX: 0,
      deltaY: 120,
      modifiers: 0,
    })
    await delay(500)

    const after = await cameraState(app.page)
    assert.ok(after.camera.z > before.camera.z)
    pass(`a plain scroll-down gesture zooms in (${before.camera.z.toFixed(2)} → ${after.camera.z.toFixed(2)})`)
    assert.notEqual(after.zoomLabel, before.zoomLabel)
    pass(`the visible zoom readout follows the gesture (${before.zoomLabel} → ${after.zoomLabel})`)
    await screenshot(app.page, AFTER)

    await openAppearanceSettings(app.page)
    const checked = await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-scroll-down-zooms-in"]')?.getAttribute('aria-checked')`)
    assert.equal(checked, 'true')
    pass('Appearance exposes the enabled Scroll down to zoom in default')
    await screenshot(app.page, SETTING)

    await clickElement(app.page, '[data-testid="systemsketch-scroll-down-zooms-in"]')
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().isZoomDirectionInverted === false`,
      'the flipped live wheel direction',
    )
    const switched = await cameraState(app.page)
    assert.equal(switched.appearance.scrollDownZoomsIn, false)
    pass('flipping the setting updates the live stock camera preference and local storage')
    await closeSettings(app.page)

    const flippedBefore = await cameraState(app.page)
    await app.page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 640,
      y: 440,
      deltaX: 0,
      deltaY: -120,
      modifiers: 0,
    })
    await delay(500)
    const flippedAfter = await cameraState(app.page)
    assert.ok(flippedAfter.camera.z > flippedBefore.camera.z)
    pass(`after the flip, a plain scroll-up gesture zooms in (${flippedBefore.camera.z.toFixed(2)} → ${flippedAfter.camera.z.toFixed(2)})`)
    await screenshot(app.page, FLIPPED)

    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().isZoomDirectionInverted === false`,
      'the persisted flipped wheel direction',
    )
    pass('the flipped direction survives a full reload')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [])
    pass('the wheel journey emits no local console errors')

    await writeFile(RESULTS, `${JSON.stringify({
      ranAt: new Date().toISOString(),
      before,
      after,
      switched,
      flippedBefore,
      flippedAfter,
      checks,
    }, null, 2)}\n`)
    process.stdout.write(`\n${checks.length} checks passed · ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
