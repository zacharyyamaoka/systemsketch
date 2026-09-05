#!/usr/bin/env node
/** Real-browser persistence, protection, and selection journey for saved views in Frames. */
import assert from 'node:assert/strict'
import { copyFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT, clickElement, delay, ensureDir, evaluate, key, localConsoleErrors, makeChecklist, openApp, shortcut, startApp, typeSlowly, waitFor } from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches/review/named-landmarks.systemsketch')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({ label: 'systemsketch-named-landmarks', build: 'named-landmarks-smoke', width: 1440, height: 920 })
  const board = join(app.filesRoot, 'SystemSketch/named-landmarks.systemsketch')
  const screenshot = join(app.filesRoot, 'named-landmarks-panel.png')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 30_000)
    await evaluate(app.page, '(() => { const editor = window.__systemsketch.editor; editor.select("shape:ingest"); editor.setCamera({ x: -410, y: -230, z: .72 }); return true })()')
    await clickElement(app.page, '[data-testid="systemsketch-board-overview-trigger"]')
    await waitFor(app.page, 'document.querySelector("[data-testid=systemsketch-board-overview]")', 'the unified Frames panel')
    assert.equal(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=landmark]").length'), 0)
    assert.ok(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=target]").length >= 2'))
    pass('Frames keeps the structural index visible while no saved camera exists')

    await clickElement(app.page, '[data-testid="systemsketch-landmark-name"]')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Runtime focus')
    await clickElement(app.page, '[data-testid="systemsketch-landmark-save"]')
    await waitFor(app.page, 'document.querySelector(".systemsketch-frames-panel__item[data-kind=landmark]")', 'the saved camera row')
    const landmarkKey = await evaluate(app.page, 'document.querySelector(".systemsketch-frames-panel__item[data-kind=landmark]").dataset.testid.replace("systemsketch-frames-panel-item-", "")')
    const saved = JSON.parse(await evaluate(app.page, 'JSON.stringify({ entry: window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.landmarks[0], selected: window.__systemsketch.editor.getOnlySelectedShape()?.id })'))
    assert.deepEqual(saved.entry.camera, { x: -410, y: -230, z: .72 })
    assert.equal(saved.entry.name, 'Runtime focus'); assert.equal(saved.selected, 'shape:ingest')
    pass('Save writes the board-owned camera without clearing canvas selection')

    await evaluate(app.page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=landmark]").length === 0', 'undo removal')
    await evaluate(app.page, '(() => { window.__systemsketch.editor.redo(); return true })()')
    await waitFor(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=landmark]").length === 1', 'redo restoration')
    pass('Save remains one ordinary independent undo/redo history step')

    await evaluate(app.page, '(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()')
    await capture(app.page, screenshot); assert.ok((await stat(screenshot)).size > 0)
    await evaluate(app.page, '(() => { window.__systemsketch.editor.setCamera({ x: 110, y: 90, z: 1.4 }); return true })()')
    await clickElement(app.page, `[data-testid="systemsketch-frames-panel-focus-${landmarkKey}"]`)
    await delay(360)
    const focused = JSON.parse(await evaluate(app.page, 'JSON.stringify(window.__systemsketch.editor.getCamera())'))
    assert.deepEqual({ x: focused.x, y: focused.y, z: focused.z }, { x: -410, y: -230, z: .72 })
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getOnlySelectedShape()?.id'), 'shape:ingest')
    pass('Focus restores the saved camera only and preserves ordinary selection')

    const row = `[data-testid="systemsketch-frames-panel-item-${landmarkKey}"]`
    await evaluate(app.page, `document.querySelector('${row}').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-frames-panel-rename-${landmarkKey}"]')`, 'the unified inline editor')
    await shortcut(app.page, 'a', 'KeyA', 2); await typeSlowly(app.page, 'Execution view'); await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector('${row}').textContent.includes('Execution view')`, 'the renamed saved camera')
    await delay(900)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the reopened board', 30_000)
    await clickElement(app.page, '[data-testid="systemsketch-board-overview-trigger"]')
    await waitFor(app.page, `document.querySelector('${row}')?.textContent.includes('Execution view')`, 'the persisted rename')
    pass('Saved-camera rename survives the ordinary local workspace reopen')

    await clickElement(app.page, `${row} .systemsketch-frames-panel__item-menu summary`)
    await clickElement(app.page, `${row} [role="menuitem"]:last-child`)
    await waitFor(app.page, 'document.querySelectorAll(".systemsketch-frames-panel__item[data-kind=landmark]").length === 0', 'item-menu deletion')
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.landmarks.length'), 0)
    pass('The unified item menu explicitly deletes the board-owned camera')

    await evaluate(app.page, '(() => { const editor = window.__systemsketch.editor; editor.updatePage({ id: editor.getCurrentPageId(), meta: { systemSketchLandmarks: { version: 9, landmarks: [{ opaque: true }] } } }); return true })()')
    await waitFor(app.page, 'document.querySelector(".systemsketch-frames-panel__status")?.textContent.includes("unknown format") && document.querySelector("[data-testid=systemsketch-landmark-save]").disabled', 'the protected future-format state')
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.version'), 9)
    pass('Unknown saved-view metadata disables writes and stays byte-preserved')

    await evaluate(app.page, '(() => { const editor = window.__systemsketch.editor; editor.updatePage({ id: editor.getCurrentPageId(), meta: { systemSketchLandmarks: { version: 1, landmarks: [] } } }); editor.updateInstanceState({ isReadonly: true }); return true })()')
    await waitFor(app.page, 'document.querySelector(".systemsketch-frames-panel__status")?.textContent.includes("read-only") && document.querySelector("[data-testid=systemsketch-landmark-save]").disabled', 'the reactive readonly state')
    pass('Read-only state visibly prevents saved-camera mutations')
    assert.deepEqual(localConsoleErrors(app.page), []); pass('The complete saved-camera journey has no browser console errors')
  } finally { app.close() }
  process.stdout.write(`\n${checks.length}/${checks.length} named-landmarks browser checks passed\n`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
