#!/usr/bin/env node
/** Real-browser proof for Settings → Canvas → Pointer/Wheel gestures/Sensitivity and live tuning. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

// Captures live under the ignored reports/media/ half (CLAUDE.md's reports
// contract) rather than tracked docs/assets/ — this journey is new, so it
// follows the current convention (see tests/floating_toolbar_excalidraw_smoke.mjs)
// rather than the older wheel_zoom_smoke.mjs one.
const MEDIA_DIR = join(ROOT, 'reports', 'media', 'mouse-gesture-tuning')
const RESULTS = join(MEDIA_DIR, 'gesture-settings-results.json')
const DEFAULT_PANEL = join(MEDIA_DIR, 'gesture-settings-default-panel.png')
const DIRECT_MODE_PANEL = join(MEDIA_DIR, 'gesture-settings-direct-mode-panel.png')
const TUNE_LIVE = join(MEDIA_DIR, 'gesture-settings-tune-live.png')

const { checks, pass } = makeChecklist()

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function state(page) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    return {
      camera: editor?.getCamera() ?? null,
      cameraOptions: editor ? { panSpeed: editor.getCameraOptions().panSpeed, zoomSpeed: editor.getCameraOptions().zoomSpeed } : null,
      isPasteAtCursorMode: editor?.user.getIsPasteAtCursorMode() ?? null,
      gestures: JSON.parse(localStorage.getItem('systemsketch.gestures.v1') ?? 'null'),
    }
  })()`)
}

async function wheel(page, { ctrl = false, deltaY = 120 } = {}) {
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 640, y: 440, deltaX: 0, deltaY, modifiers: ctrl ? 2 : 0,
  })
  await delay(400)
}

async function openCanvasSettings(page) {
  await waitFor(page, `document.querySelector('[data-testid="main-menu.button"]')`, 'the main menu button')
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-canvas"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')`, 'the Canvas panel')
  await delay(150)
}

async function closeSettingsIfOpen(page) {
  const openDialog = await evaluate(page, `Boolean(document.querySelector('[data-testid="systemsketch-settings-dialog"]'))`)
  if (!openDialog) return
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function setSelectValue(page, testId, value) {
  await evaluate(page, `(() => {
    const select = document.querySelector('[data-testid="${testId}"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    setter.call(select, ${JSON.stringify(value)})
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

/**
 * `PercentInput` commits on blur or Enter, not on every keystroke — see its
 * own WHY. React's synthetic `onBlur` is wired from the native `focusout`
 * event, not a bare `blur` (which does not bubble and React does not listen
 * for directly), so a dispatched Enter keydown is the reliable way to commit
 * a programmatic value — the same path a real person pressing Enter takes.
 */
async function setPercentInput(page, testId, percent) {
  await evaluate(page, `(() => {
    const input = document.querySelector('[data-testid="${testId}"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(String(percent))})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })()`)
}

async function main() {
  await ensureDir(MEDIA_DIR)
  const app = await startApp({ label: 'gesture-settings', build: 'gesture-settings-smoke', width: 1280, height: 860 })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'gesture-settings.systemsketch')
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the SystemSketch editor')
    await delay(300)

    const initial = await state(app.page)
    assert.equal(initial.gestures, null)
    assert.equal(initial.cameraOptions.zoomSpeed, 1)
    assert.equal(initial.cameraOptions.panSpeed, 1)
    assert.equal(initial.isPasteAtCursorMode, true)
    pass('a fresh board has no gesture preference and stock camera speed, with paste-under-cursor already on')

    const beforePan = await state(app.page)
    await wheel(app.page)
    const afterPan = await state(app.page)
    assert.notEqual(afterPan.camera.y, beforePan.camera.y)
    assert.equal(afterPan.camera.z, beforePan.camera.z)
    pass('default stock contract is unchanged: a plain scroll pans, not zooms')

    await wheel(app.page, { ctrl: true })
    const afterCtrlZoom = await state(app.page)
    assert.notEqual(afterCtrlZoom.camera.z, afterPan.camera.z)
    pass('default stock contract is unchanged: Ctrl/Cmd + scroll zooms')

    await openCanvasSettings(app.page)
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-paste-under-cursor"]')?.getAttribute('aria-checked')`), 'true')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-gesture-binding-wheelDown"]')?.value`), 'pan-down')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-gesture-binding-ctrlWheelUp"]')?.value`), 'zoom-in')
    assert.equal(await evaluate(app.page, `Boolean(document.querySelector('[data-testid="systemsketch-scroll-down-zooms-in"]'))`), false)
    pass('Settings → Canvas shows Pointer/Wheel gestures/Sensitivity with the stock mapping, and keeps Direct-mode-only controls out of the way')
    await screenshot(app.page, DEFAULT_PANEL)

    await clickElement(app.page, '[data-testid="systemsketch-paste-under-cursor"]')
    await waitFor(app.page, `window.__systemsketch?.editor?.user.getIsPasteAtCursorMode() === false`, 'paste under cursor to turn off')
    assert.equal(
      await evaluate(app.page, `JSON.parse(localStorage.getItem('systemsketch.gestures.v1'))?.pasteUnderCursor`),
      false,
    )
    pass('turning off Copy/paste under cursor writes tldraw\'s own preference and persists it')
    await clickElement(app.page, '[data-testid="systemsketch-paste-under-cursor"]')
    await waitFor(app.page, `window.__systemsketch?.editor?.user.getIsPasteAtCursorMode() === true`, 'paste under cursor to turn back on')

    await setSelectValue(app.page, 'systemsketch-gesture-binding-ctrlWheelDown', 'pan-down')
    await waitFor(
      app.page,
      `JSON.parse(localStorage.getItem('systemsketch.gestures.v1'))?.bindings?.ctrlWheelDown === 'pan-down'`,
      'the rebound Ctrl + scroll-down binding to persist',
    )
    pass('Ctrl + scroll wheel down can be rebound away from its stock command')

    await setPercentInput(app.page, 'systemsketch-gesture-zoom-speed', 200)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 2`, '200% zoom sensitivity to apply live')
    pass('typing an exact Zoom sensitivity value applies immediately to the live camera')

    await setPercentInput(app.page, 'systemsketch-gesture-pan-speed', 25)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCameraOptions().panSpeed === 0.25`, '25% scroll sensitivity to apply live')
    pass('typing an exact Scroll sensitivity value applies immediately to the live camera')

    await closeSettingsIfOpen(app.page)

    const beforeRebound = await state(app.page)
    await wheel(app.page, { ctrl: true })
    const afterRebound = await state(app.page)
    assert.equal(afterRebound.camera.z, beforeRebound.camera.z, 'Ctrl + scroll-down should no longer zoom once rebound')
    assert.notEqual(afterRebound.camera.y, beforeRebound.camera.y, 'Ctrl + scroll-down should now pan, per its new binding')
    pass('the rebound gesture actually changes what the wheel does on the live canvas')

    await openCanvasSettings(app.page)
    // The Sensitivity section, and its "Tune live…" button, sit well below
    // the fold once Wheel gestures' four rows render above it — a plain
    // coordinate click would miss the button and land on the dialog's own
    // backdrop, dismissing it without ever firing the handler.
    await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-gesture-tune-live"]')?.scrollIntoView({ block: 'center' })`)
    await delay(150)
    await clickElement(app.page, '[data-testid="systemsketch-gesture-tune-live"]')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings to close for live tuning')
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-gesture-tuning-panel"]')`, 'the live-tuning panel')
    assert.equal(
      await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-gesture-tuning-zoom-speed"]')?.value`),
      '200',
    )
    pass('"Tune live…" closes Settings and opens a non-modal panel that mirrors the same sensitivity')
    await screenshot(app.page, TUNE_LIVE)

    await setPercentInput(app.page, 'systemsketch-gesture-tuning-zoom-speed', 80)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 0.8`, 'the tuning panel to move the live camera')
    pass('the live-tuning panel writes to the same store Settings reads, so canvas and dialog agree')

    await clickElement(app.page, '[data-testid="systemsketch-gesture-tuning-close"]')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-gesture-tuning-panel"]')`, 'the tuning panel to close')

    await openCanvasSettings(app.page)
    await clickElement(app.page, '[data-testid="systemsketch-direct-wheel-zoom"]')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="systemsketch-gesture-binding-wheelDown"]')
        && document.querySelector('[data-testid="systemsketch-scroll-down-zooms-in"]')`,
      'Direct wheel zoom controls to replace the gesture-control sections',
    )
    pass('turning on Direct wheel zoom hides Wheel gestures/Sensitivity/Pointer and shows its own controls instead')
    await screenshot(app.page, DIRECT_MODE_PANEL)
    await closeSettingsIfOpen(app.page)

    // Direct wheel zoom makes the PLAIN wheel zoom directly; Ctrl/Cmd + wheel
    // pans instead (or zooms oppositely only if "Ctrl/Cmd + scroll zooms the
    // opposite way" is also on, which this journey never enables) — see
    // `canvasCamera.ts`'s own WHY. A plain scroll is the gesture this step
    // must own instead of the earlier Ctrl-bound rebinding.
    const beforeDirect = await state(app.page)
    await wheel(app.page)
    const afterDirect = await state(app.page)
    assert.notEqual(afterDirect.camera.z, beforeDirect.camera.z, 'Direct wheel zoom should own a plain scroll while active')
    pass('the gesture-rebinding listener stands down while Direct wheel zoom is active')

    await openCanvasSettings(app.page)
    await clickElement(app.page, '[data-testid="systemsketch-direct-wheel-zoom"]')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-gesture-binding-wheelDown"]')
        && window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 0.8`,
      'the gesture-control sections and the saved 80% sensitivity to return',
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-gesture-binding-ctrlWheelDown"]')?.value`),
      'pan-down',
      'the earlier rebinding must survive a round trip through Direct wheel zoom',
    )
    pass('turning Direct wheel zoom back off hands zoom speed back to the gesture-settings value, not a hardcoded reset')
    await closeSettingsIfOpen(app.page)

    const beforeReloadRebound = await state(app.page)
    await wheel(app.page, { ctrl: true })
    const afterReloadRebound = await state(app.page)
    assert.equal(afterReloadRebound.camera.z, beforeReloadRebound.camera.z)
    assert.notEqual(afterReloadRebound.camera.y, beforeReloadRebound.camera.y)
    pass('the earlier rebinding is still live after the Direct wheel zoom round trip')

    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the reloaded editor')
    await waitFor(app.page, `window.__systemsketch?.editor?.getCameraOptions().zoomSpeed === 0.8`, 'the persisted zoom sensitivity')
    const reloaded = await state(app.page)
    assert.equal(reloaded.gestures.bindings.ctrlWheelDown, 'pan-down')
    assert.equal(reloaded.gestures.panSpeedPercent, 25)
    assert.equal(reloaded.gestures.zoomSpeedPercent, 80)
    assert.equal(reloaded.isPasteAtCursorMode, true)
    pass('every gesture-control preference survives a full reload')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [])
    pass('the gesture-settings journey emits no local console errors')

    await writeFile(RESULTS, `${JSON.stringify({
      ranAt: new Date().toISOString(),
      initial,
      afterPan,
      afterCtrlZoom,
      afterRebound,
      reloaded,
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
