#!/usr/bin/env node
/** Real-browser acceptance for the unified Frames / saved-camera panel. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, clickElement, delay, drag, elementBox, ensureDir, evaluate, key, localConsoleErrors, makeChecklist, openApp, shortcut, startApp, typeSlowly, waitFor } from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches/review/frames-panel.systemsketch')
const SCREENSHOT = join(ROOT, 'docs/assets/frames-panel-2026-09-04.png')
const { checks, pass } = makeChecklist()

async function capture(page) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SCREENSHOT, Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({ label: 'systemsketch-frames-panel', build: 'frames-panel-smoke', width: 1440, height: 920 })
  const board = join(app.filesRoot, 'SystemSketch', 'frames-panel.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch Frames board', 30_000)
    await clickElement(app.page, '[data-testid="systemsketch-board-overview-trigger"]')
    await waitFor(app.page, 'document.querySelector("[data-testid=systemsketch-board-overview]")', 'the Frames panel')
    assert.equal(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__preview-button").length'), 2)
    assert.equal(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__preview-viewport").length'), 2)
    pass('Frame cards render their own compact SVG previews in the real panel')

    await evaluate(app.page, '(() => { window.__systemsketch.editor.setCamera({ x: -410, y: -230, z: .72 }); return true })()')
    await clickElement(app.page, '[data-testid="systemsketch-landmark-name"]')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Architecture camera')
    await clickElement(app.page, '[data-testid="systemsketch-landmark-save"]')
    await waitFor(app.page, 'document.querySelector(".systemsketch-frames-panel__item[data-kind=landmark]")', 'the saved camera row')
    const landmarkKey = await evaluate(app.page, 'document.querySelector(".systemsketch-frames-panel__item[data-kind=landmark]").dataset.testid.replace("systemsketch-frames-panel-item-", "")')
    const savedCamera = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.landmarks[0].camera)'))
    assert.deepEqual(savedCamera, { x: -410, y: -230, z: .72 })
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-frames-panel-item-${landmarkKey}"] .systemsketch-frames-panel__preview-viewport') !== null`), true)
    await capture(app.page)
    pass('A saved-view card records and visibly projects its saved camera viewport')

    await clickElement(app.page, '[data-testid="systemsketch-frames-panel-view-menu"]')
    await clickElement(app.page, '[role="menuitemradio"]:last-child')
    await waitFor(app.page, 'document.querySelector(".systemsketch-frames-panel__items.is-list")', 'the compact-list mode')
    assert.equal(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__preview-button").length'), 0)
    pass('Panel menu switches from thumbnail cards to the compact list')

    const landmarkRow = `[data-testid="systemsketch-frames-panel-item-${landmarkKey}"]`
    await evaluate(app.page, `document.querySelector('${landmarkRow}').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-frames-panel-rename-${landmarkKey}"]')`, 'the outside-double-click name editor')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Architecture return')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector('${landmarkRow}').textContent.includes('Architecture return')`, 'the committed direct rename')
    pass('Double-clicking the row directly opens Enter/Escape-capable inline rename')

    const sourceBox = await elementBox(app.page, `${landmarkRow} .systemsketch-frames-panel__handle`)
    const targetBox = await elementBox(app.page, '[data-testid="systemsketch-frames-panel-item-shape:shape:architecture"]')
    await evaluate(app.page, 'window.__framesDragEvents = []; ["dragstart", "dragenter", "dragover", "drop", "dragend"].forEach((type) => document.addEventListener(type, (event) => window.__framesDragEvents.push(type), true))')
    await drag(app.page, { x: sourceBox.cx, y: sourceBox.cy }, { x: targetBox.cx, y: targetBox.y + targetBox.height - 3 })
    const dragEvents = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__framesDragEvents)'))
    assert.ok(dragEvents.includes('dragstart') && dragEvents.includes('drop'), `native drag sequence: ${dragEvents.join(',')}`)
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPage().meta.systemSketchFramesPanelOrder?.order?.[1] === '${landmarkKey}'`, 'the persisted below-row reorder')
    pass('Dragging below a row persists a duplicate-free unified order')

    await evaluate(app.page, '(() => { window.__systemsketch.editor.setCamera({ x: 4, y: 8, z: 1.2 }); return true })()')
    await clickElement(app.page, `[data-testid="systemsketch-frames-panel-focus-${landmarkKey}"]`)
    await delay(320)
    const focusedCamera = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCamera())'))
    assert.deepEqual({ x: focusedCamera.x, y: focusedCamera.y, z: focusedCamera.z }, { x: -410, y: -230, z: .72 })
    pass('Focusing a saved row restores only its original board camera')

    await clickElement(app.page, `${landmarkRow} .systemsketch-frames-panel__item-menu summary`)
    await clickElement(app.page, `${landmarkRow} [role="menuitem"]:last-child`)
    await waitFor(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=landmark]").length === 0', 'item-menu deletion')
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('The item menu deletes a saved camera without browser errors')
  } finally {
    app.close()
  }
  process.stdout.write(`\n${checks.length}/${checks.length} Frames-panel browser checks passed\n`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
