#!/usr/bin/env node
/** Real-browser proof for stock canvas navigation and opt-in direct wheel zoom. */
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
const RESULTS = join(ASSETS, 'canvas-navigation-controls-results.json')
const STOCK = join(ASSETS, 'canvas-navigation-stock.png')
const PAN = join(ASSETS, 'canvas-navigation-pan.png')
const MODIFIER_ZOOM = join(ASSETS, 'canvas-navigation-modifier-zoom.png')
const DEFAULT_SETTING = join(ASSETS, 'canvas-navigation-default-setting.png')
const DIRECT_SETTING = join(ASSETS, 'canvas-navigation-direct-setting.png')
const DIRECT = join(ASSETS, 'canvas-navigation-direct-zoom.png')
const RESTORED = join(ASSETS, 'canvas-navigation-restored.png')

const { checks, pass } = makeChecklist()

async function cameraState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    return JSON.stringify({
      camera: editor?.getCamera() ?? null,
      inputMode: editor?.user.getUserPreferences().inputMode ?? null,
      isZoomDirectionInverted: editor?.user.getUserPreferences().isZoomDirectionInverted ?? null,
      wheelBehavior: editor?.getCameraOptions().wheelBehavior ?? null,
      zoomSpeed: editor?.getCameraOptions().zoomSpeed ?? null,
      zoomLabel: document.querySelector('.systemsketch-utility-strip .tlui-zoom-menu__button')?.textContent?.trim() ?? null,
      appearance: JSON.parse(localStorage.getItem('systemsketch.appearance.v1') ?? 'null'),
    })
  })()`))
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function wheel(page, { ctrl = false } = {}) {
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 640,
    y: 440,
    deltaX: 0,
    deltaY: 120,
    modifiers: ctrl ? 2 : 0,
  })
  await delay(500)
}

async function openCanvasSettings(page) {
  await waitFor(page, `document.querySelector('[data-testid="main-menu.button"]')`, 'the main menu button')
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-appearance"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-theme-list"]')`, 'the Appearance settings')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')`, 'Canvas controls to stay out of Appearance')
  await clickElement(page, '[data-testid="systemsketch-settings-category-canvas"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')`, 'the direct-wheel preference')
  await evaluate(page, `document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')?.scrollIntoView({ block: 'center' })`)
  await delay(180)
}

async function closeSettings(page) {
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function setSensitivity(page, percent) {
  await evaluate(page, `(() => {
    const input = document.querySelector('[data-testid="systemsketch-wheel-zoom-sensitivity"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${percent})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

async function main() {
  const app = await startApp({ label: 'canvas-navigation', build: 'canvas-navigation-smoke', width: 1280, height: 820 })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'canvas-navigation.systemsketch')
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the SystemSketch editor')

    // Seed an on-board scale cue through the public tool interaction, not the model.
    await key(app.page, 'r', 'KeyR')
    await drag(app.page, { x: 390, y: 270 }, { x: 860, y: 610 })
    await key(app.page, 'Escape', 'Escape')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
      'the scale cue autosave before navigation proof',
    )

    // A previous direct-wheel session may have left tldraw's global preference
    // in mouse mode. The product default must explicitly restore stock pan.
    await evaluate(app.page, `window.__systemsketch.editor.user.updateUserPreferences({ inputMode: 'mouse' })`)
    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'trackpad'`,
      'the reloaded stock navigation contract',
    )
    await delay(350)

    const stockBefore = await cameraState(app.page)
    assert.equal(stockBefore.wheelBehavior, 'pan')
    assert.equal(stockBefore.zoomSpeed, 1)
    assert.equal(stockBefore.inputMode, 'trackpad')
    assert.equal(stockBefore.appearance, null)
    pass('first run restores stock wheel pan with standard Ctrl/Cmd zoom gain and no app preference')
    await screenshot(app.page, STOCK)

    await wheel(app.page)
    const panned = await cameraState(app.page)
    assert.notEqual(panned.camera.y, stockBefore.camera.y)
    assert.equal(panned.camera.z, stockBefore.camera.z)
    assert.equal(panned.zoomLabel, stockBefore.zoomLabel)
    pass('a plain scroll changes page position but leaves the scale unchanged')
    await screenshot(app.page, PAN)

    await wheel(app.page, { ctrl: true })
    const modifierZoomed = await cameraState(app.page)
    assert.notEqual(modifierZoomed.camera.z, panned.camera.z)
    pass('Ctrl/Cmd + scroll changes the stock camera scale')
    await screenshot(app.page, MODIFIER_ZOOM)

    await openCanvasSettings(app.page)
    const initialToggle = await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')?.getAttribute('aria-checked')`)
    assert.equal(initialToggle, 'false')
    assert.equal(await evaluate(app.page, `Boolean(document.querySelector('[data-testid="systemsketch-wheel-zoom-sensitivity"]'))`), false)
    pass('Canvas says Direct wheel zoom is off and keeps direct-only controls out of the way')
    await screenshot(app.page, DEFAULT_SETTING)

    await clickElement(app.page, '[data-testid="systemsketch-direct-wheel-zoom"]')
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'mouse'
        && document.querySelector('[data-testid="systemsketch-wheel-zoom-sensitivity"]')`,
      'direct wheel zoom and its controls',
    )
    const enabled = await cameraState(app.page)
    assert.equal(enabled.wheelBehavior, 'zoom')
    assert.equal(enabled.zoomSpeed, 1)
    assert.equal(enabled.appearance.directWheelZoom, true)
    pass('enabling Direct wheel zoom switches the live stock camera and persists the opt-in')
    await screenshot(app.page, DIRECT_SETTING)
    await closeSettings(app.page)

    const directBefore = await cameraState(app.page)
    await wheel(app.page)
    const directAfter = await cameraState(app.page)
    assert.ok(directAfter.camera.z > directBefore.camera.z)
    pass('with direct mode enabled, a plain scroll-down zooms in')
    await screenshot(app.page, DIRECT)

    await openCanvasSettings(app.page)
    await setSensitivity(app.page, 150)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 1.5`, 'the direct 150% sensitivity')
    await clickElement(app.page, '[data-testid="systemsketch-direct-wheel-zoom"]')
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'trackpad'
        && window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 1
        && !document.querySelector('[data-testid="systemsketch-wheel-zoom-sensitivity"]')`,
      'the restored stock navigation contract',
    )
    const restored = await cameraState(app.page)
    assert.equal(restored.appearance.directWheelZoom, false)
    pass('turning direct mode back off restores pan, hides its tuning controls, and resets modifier zoom to stock gain')
    await screenshot(app.page, RESTORED)
    await closeSettings(app.page)

    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'trackpad'
        && JSON.parse(localStorage.getItem('systemsketch.appearance.v1')).directWheelZoom === false`,
      'the persisted restored stock navigation mode',
    )
    pass('stock navigation survives a full reload after opting out of direct zoom')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [])
    pass('the canvas navigation journey emits no local console errors')

    await writeFile(RESULTS, `${JSON.stringify({
      ranAt: new Date().toISOString(),
      stockBefore,
      panned,
      modifierZoomed,
      enabled,
      directBefore,
      directAfter,
      restored,
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
