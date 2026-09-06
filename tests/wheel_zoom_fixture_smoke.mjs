#!/usr/bin/env node
/** Drive the committed review fixture through stock and direct wheel navigation. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'wheel-zoom.systemsketch')
const DRIVEN_SCREENSHOT = '/tmp/systemsketch-wheel-zoom-fixture-driven.png'
const { checks, pass } = makeChecklist()

async function arrowBounds(page) {
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-2-arrow'))`,
  ))
}

async function wheel(page, x, y, { ctrl = false } = {}) {
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX: 0,
    deltaY: 120,
    modifiers: ctrl ? 2 : 0,
  })
  await delay(400)
}

async function enableDirectWheelZoom(page) {
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-canvas"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-direct-wheel-zoom"]')`, 'the Canvas setting')
  await clickElement(page, '[data-testid="systemsketch-direct-wheel-zoom"]')
  await waitFor(page, `window.__systemsketch?.editor?.user.getUserPreferences().inputMode === 'mouse'`, 'direct zoom enabled')
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function main() {
  const app = await startApp({ label: 'wheel-zoom-fixture', build: 'wheel-zoom-fixture-smoke', width: 1280, height: 720 })
  try {
    const board = join(app.filesRoot, 'wheel-zoom-driven.systemsketch')
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `document.querySelector('[data-shape-type="block"]')`, 'the fixture target Block')
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the fixture editor')
    await delay(300)

    const target = await elementBox(app.page, '[data-shape-type="block"]')
    const arrowBefore = await arrowBounds(app.page)
    await drag(
      app.page,
      { x: target.x + target.w / 2, y: target.y + target.h / 2 },
      { x: target.x + target.w / 2 + 70, y: target.y + target.h / 2 },
    )
    const arrowAfter = await arrowBounds(app.page)
    assert.notDeepEqual(arrowAfter, arrowBefore)
    pass('moving the real target Block reroutes its bound orange cue arrow')

    const at = { x: target.x + target.w / 2, y: target.y + target.h / 2 }
    const before = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCamera())'))
    await wheel(app.page, at.x, at.y)
    const panned = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCamera())'))
    assert.notEqual(panned.y, before.y)
    assert.equal(panned.z, before.z)
    pass('the fixture’s literal plain-scroll gesture pans without changing zoom')

    await wheel(app.page, at.x, at.y, { ctrl: true })
    const modifierZoomed = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCamera())'))
    assert.notEqual(modifierZoomed.z, panned.z)
    pass('the fixture’s Ctrl/Cmd + scroll gesture changes zoom')

    await enableDirectWheelZoom(app.page)
    const directBefore = await evaluate(app.page, 'window.__systemsketch.editor.getZoomLevel()')
    await wheel(app.page, at.x, at.y)
    const directAfter = await evaluate(app.page, 'window.__systemsketch.editor.getZoomLevel()')
    assert.ok(directAfter > directBefore)
    pass('after the Canvas opt-in, the same plain scroll-down gesture zooms in')

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(DRIVEN_SCREENSHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the driven fixture emits no local console errors')
    process.stdout.write(`\n${checks.length} checks passed · ${DRIVEN_SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
