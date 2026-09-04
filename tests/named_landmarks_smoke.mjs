#!/usr/bin/env node
/**
 * Real-browser acceptance for board-owned saved camera landmarks.
 *
 * It drives the visible utility, records a camera view through the panel,
 * leaves that view, jumps back without touching selection, then renames and
 * deletes it. The board path is disposable; page metadata persistence is also
 * covered by the pure model test.
 */
import assert from 'node:assert/strict'
import { copyFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const REVIEW_FIXTURE = join(ROOT, 'sketches', 'review', 'named-landmarks.systemsketch')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: 'systemsketch-named-landmarks',
    build: 'named-landmarks-smoke',
    width: 1440,
    height: 920,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'named-landmarks.systemsketch')
  // Keep the gallery's committed evidence stable. Browser acceptance captures
  // a fresh proof into its disposable profile instead of rewriting a tracked
  // PNG with compositor-timing-dependent bytes on every test run.
  const screenshot = join(app.filesRoot, 'named-landmarks-panel.png')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(REVIEW_FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 30_000)
    await waitFor(app.page, 'document.querySelector(\'[data-testid="systemsketch-board-overview-trigger"]\')', 'the board utility')

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.select('shape:ingest')
      editor.setCamera({ x: -410, y: -230, z: 0.72 })
      return JSON.stringify(editor.getCamera())
    })()`)

    await clickElement(app.page, '[data-testid="systemsketch-board-overview-trigger"]')
    await waitFor(app.page, 'document.querySelector(\'[data-testid="systemsketch-named-landmarks-empty"]\')', 'the saved view empty state')
    pass('Board overview presents an honest empty saved-view panel beside structural landmarks')

    await clickElement(app.page, '[data-testid="systemsketch-landmark-name"]')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Runtime focus')
    await clickElement(app.page, '[data-testid="systemsketch-landmark-save"]')
    await waitFor(
      app.page,
      `document.querySelectorAll('[data-testid^="systemsketch-landmark-jump-"]').length === 1`,
      'the saved landmark row',
    )
    const saved = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const page = editor.getCurrentPage()
      return JSON.stringify({
        entry: page.meta.systemSketchLandmarks?.landmarks?.[0],
        selected: editor.getOnlySelectedShape()?.id,
      })
    })()`))
    assert.deepEqual(saved.entry.camera, { x: -410, y: -230, z: 0.72 })
    assert.equal(saved.entry.name, 'Runtime focus')
    assert.equal(saved.selected, 'shape:ingest')
    pass('Save captures the current board camera in board metadata without clearing selection')
    await evaluate(app.page, `(() => { window.__systemsketch.editor.undo(); return true })()`)
    await waitFor(app.page, 'document.querySelectorAll(\'[data-testid^="systemsketch-landmark-jump-"]\').length === 0', 'undo to remove the saved view')
    await evaluate(app.page, `(() => { window.__systemsketch.editor.redo(); return true })()`)
    await waitFor(app.page, 'document.querySelectorAll(\'[data-testid^="systemsketch-landmark-jump-"]\').length === 1', 'redo to restore the saved view')
    pass('Save is one ordinary tldraw undo/redo step, independent of the fixture canvas')
    await evaluate(app.page, `(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()`)
    await evaluate(app.page, `(() => {
      if (!document.querySelector('[data-testid="systemsketch-right-popout"][data-surface="board-overview"]')) {
        document.querySelector('[data-testid="systemsketch-board-overview-trigger"]')?.click()
      }
      return true
    })()`)
    await waitFor(app.page, 'document.querySelector(\'[data-testid="systemsketch-right-popout"][data-surface="board-overview"]\')', 'Board overview after camera fit')
    await capture(app.page, screenshot)
    assert.ok((await stat(screenshot)).size > 0)

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.setCamera({ x: 110, y: 90, z: 1.4 })
      return true
    })()`)
    const landmarkId = await evaluate(app.page, `document.querySelector('[data-testid^="systemsketch-landmark-jump-"]').dataset.testid.replace('systemsketch-landmark-jump-', '')`)
    await clickElement(app.page, `[data-testid="systemsketch-landmark-jump-${landmarkId}"]`)
    await delay(360)
    const focused = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const camera = editor.getCamera()
      return JSON.stringify({ x: camera.x, y: camera.y, z: camera.z, selected: editor.getOnlySelectedShape()?.id })
    })()`))
    assert.deepEqual({ x: focused.x, y: focused.y, z: focused.z }, { x: -410, y: -230, z: 0.72 })
    assert.equal(focused.selected, 'shape:ingest')
    pass('Jump returns to the saved camera only; it keeps the ordinary canvas selection intact')

    await clickElement(app.page, `[data-testid="systemsketch-landmark-rename-${landmarkId}"]`)
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Execution view')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector('[data-landmark-id="${landmarkId}"]')?.textContent.includes('Execution view')`, 'the renamed view')
    // This is the actual local-workspace save/reopen path, not merely the
    // in-memory page object used above. A named camera view is only honest if
    // it survives the same file journey as the rest of the board.
    await delay(900)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the reopened fixture board', 30_000)
    await clickElement(app.page, '[data-testid="systemsketch-board-overview-trigger"]')
    await waitFor(app.page, `document.querySelector('[data-landmark-id="${landmarkId}"]')?.textContent.includes('Execution view')`, 'the persisted renamed view')
    pass('The saved view survives the ordinary local workspace file reopen')
    await clickElement(app.page, `[data-testid="systemsketch-landmark-remove-${landmarkId}"]`)
    await waitFor(app.page, 'document.querySelector(\'[data-testid="systemsketch-named-landmarks-empty"]\')', 'the empty panel after deletion')
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.landmarks.length`), 0)
    pass('The same panel renames and explicitly deletes the board-owned landmark')

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.updatePage({ id: editor.getCurrentPageId(), meta: { systemSketchLandmarks: { version: 9, landmarks: [{ opaque: true }] } } })
      return true
    })()`)
    await waitFor(app.page, `document.querySelector('.systemsketch-named-landmarks__status')?.textContent.includes('unknown format')
      && document.querySelector('[data-testid="systemsketch-landmark-save"]')?.disabled`, 'the protected future-format message')
    await clickElement(app.page, '[data-testid="systemsketch-landmark-name"]')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, 'Keep this name')
    await key(app.page, 'Enter', 'Enter')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-landmark-name"]').value`), 'Keep this name')
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getCurrentPage().meta.systemSketchLandmarks.version`), 9)
    pass('Unknown saved-view metadata disables writes, explains why, and preserves entered text')

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.updatePage({ id: editor.getCurrentPageId(), meta: { systemSketchLandmarks: { version: 1, landmarks: [] } } })
      editor.updateInstanceState({ isReadonly: true })
      return true
    })()`)
    await waitFor(app.page, `document.querySelector('.systemsketch-named-landmarks__status')?.textContent.includes('read-only')
      && document.querySelector('[data-testid="systemsketch-landmark-save"]')?.disabled`, 'the read-only saved-view message')
    pass('Read-only documents visibly prevent landmark writes rather than claiming a save')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('The saved-view journey has no browser console errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length}/${checks.length} named-landmarks browser checks passed\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
