#!/usr/bin/env node
/** Real-browser proof that an unmodified vertical wheel gesture zooms the board. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
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

const { checks, pass } = makeChecklist()

async function cameraState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    return JSON.stringify({
      camera: editor?.getCamera() ?? null,
      inputMode: editor?.user.getUserPreferences().inputMode ?? null,
      wheelBehavior: editor?.getCameraOptions().wheelBehavior ?? null,
      zoomLabel: document.querySelector('.systemsketch-utility-strip .tlui-zoom-menu__button')?.textContent?.trim() ?? null,
    })
  })()`))
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
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
    process.stdout.write('  SETUP reloading scratch board\n')
    await app.page.send('Page.reload', { ignoreCache: true })
    await waitFor(
      app.page,
      `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'mouse'`,
      'the reloaded SystemSketch wheel contract',
    )
    await delay(350)

    const before = await cameraState(app.page)
    assert.equal(before.wheelBehavior, 'zoom')
    pass('the mounted stock camera declares plain-wheel zoom behavior')
    assert.equal(before.inputMode, 'mouse')
    pass('a stale Trackpad preference cannot override wheel zoom after reload')
    await screenshot(app.page, BEFORE)

    await app.page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 640,
      y: 440,
      deltaX: 0,
      deltaY: -120,
      modifiers: 0,
    })
    await delay(500)

    const after = await cameraState(app.page)
    assert.notEqual(after.camera.z, before.camera.z)
    pass(`an unmodified vertical wheel gesture changes zoom (${before.camera.z.toFixed(2)} → ${after.camera.z.toFixed(2)})`)
    assert.notEqual(after.zoomLabel, before.zoomLabel)
    pass(`the visible zoom readout follows the gesture (${before.zoomLabel} → ${after.zoomLabel})`)
    await screenshot(app.page, AFTER)

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [])
    pass('the wheel journey emits no local console errors')

    await writeFile(RESULTS, `${JSON.stringify({
      ranAt: new Date().toISOString(),
      before,
      after,
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
