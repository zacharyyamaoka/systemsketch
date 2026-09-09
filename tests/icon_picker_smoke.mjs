#!/usr/bin/env node
/**
 * Real-browser proof for the Block icon picker: the inspector's icon well,
 * the on-canvas context menu, and the inline editor all open the same
 * `BlockIconPicker`, and every kind it can write (a plain Lucide name, a
 * Lucide name outside the curated static set, an emoji, and an uploaded
 * asset) survives a disk round trip and a copy/paste.
 *
 * Replaces `tests/icon_picker_scratch_journey.mjs`, the picker author's own
 * rough proof for this same slice — this file is the real one a peer
 * committed to write once the picker landed.
 *
 * Driven against a SCRATCH COPY of a real committed board (never a review
 * fixture, never Zach's board — CLAUDE.md's rule) so the app's autosave
 * never touches a tracked file.
 *
 * Run with:
 *   npm run test:icon-picker
 */
import assert from 'node:assert/strict'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  openApp,
  readConsoleErrors,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SOURCE_BOARD = join(ROOT, 'sketches', 'review', 'block-title-formatting.systemsketch')
const BLOCK_ID = 'shape:function-block'
const SHOT_INSPECTOR = join(ROOT, 'docs', 'assets', 'icon-picker-inspector.png')
const SHOT_UPLOAD_PREVIEW = join(ROOT, 'docs', 'assets', 'icon-picker-upload-preview.png')
const SHOT_ASSET_ON_CANVAS = join(ROOT, 'docs', 'assets', 'icon-picker-asset-on-canvas.png')
const SHOT_DARK = join(ROOT, 'docs', 'assets', 'icon-picker-dark.png')
// WHY a results file, not a regex over this source: the report builder used
// to count `add(`/`pass(` call sites statically and came out 69 against a
// real run's 70 — a loop-generated check the static count can't see. This
// is the run's own tally, same pattern as workspace_browser_smoke.mjs's
// results file.
const RESULTS = join(ROOT, 'docs', 'assets', 'icon-picker-results.json')

const iconBoxSelector = (shapeId) => `[data-shape-id="${shapeId}"] [data-pb-inline-field='{"kind":"icon"}']`
const shapeSelector = (shapeId) => `[data-shape-id="${shapeId}"]`

async function shapeCentre(page, selector) {
  const box = await elementBox(page, selector)
  return { x: box.cx, y: box.cy }
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await ensureDir(join(path, '..'))
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

/** Poll a file on disk until `predicate` matches its text — the app autosaves async. */
async function waitForFile(path, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      last = await readFile(path, 'utf8')
      if (predicate(last)) return last
    } catch {
      // the first autosave may still be creating the file
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}; last file was ${last.length} bytes`)
}

async function blockIcon(page, shapeId = BLOCK_ID) {
  const value = await evaluate(page, `JSON.stringify((() => {
    const shape = window.__systemsketch.editor.getShape(${JSON.stringify(shapeId)})
    return { icon: shape?.props?.icon ?? null, assetId: shape?.props?.assetId ?? null }
  })())`)
  return JSON.parse(value)
}

async function openWell(page) {
  const well = await elementBox(page, '.block-inspector__icon-well')
  await clickAt(page, well.cx, well.cy)
  await waitFor(page, `document.querySelector('.BlockIconPicker')`, 'the icon picker to open')
}

/** Selection + tldraw's own editing-lifecycle state, for the SPEC-BREAKING undo/deselect checks. */
async function editorState(page) {
  const value = await evaluate(page, `JSON.stringify({
    selected: window.__systemsketch.editor.getSelectedShapeIds(),
    editingShapeId: window.__systemsketch.editor.getEditingShapeId(),
  })`)
  return JSON.parse(value)
}

/**
 * Right-click the Block, drill into Add > Icon…/Change icon… — the
 * context-menu trigger findings 1 and 2 are about. Returns the submenu's
 * Icon…/Change icon… label, read BEFORE the click that closes the menu.
 */
async function openContextMenuIconEntry(page, blockCentre) {
  await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(BLOCK_ID)}); undefined`)
  await delay(150)
  await clickAt(page, blockCentre.x, blockCentre.y, 'right')
  await waitFor(page, `document.querySelector('[data-testid="context-menu-sub.block-add-button"]')`, 'the Block context menu to open with an Add submenu')
  const addSubmenuBox = await elementBox(page, '[data-testid="context-menu-sub.block-add-button"]')
  await clickAt(page, addSubmenuBox.cx, addSubmenuBox.cy)
  await waitFor(page, `document.querySelector('[data-testid="context-menu.block-add-icon"]')`, 'the Add submenu to render its icon entry')
  const menuIconLabel = await evaluate(page, `document.querySelector('[data-testid="context-menu.block-add-icon"]')?.textContent ?? ''`)
  const menuIconBox = await elementBox(page, '[data-testid="context-menu.block-add-icon"]')
  await clickAt(page, menuIconBox.cx, menuIconBox.cy)
  await waitFor(page, `document.querySelector('.BlockIconPicker')`, 'the context menu Icon… entry to open BlockIconPicker')
  return menuIconLabel
}

async function main() {
  const { pass, add, report } = makeChecklist()

  const app = await startApp({
    label: 'icon-picker-smoke',
    build: 'icon-picker-smoke',
    width: 1600,
    height: 1000,
  })
  const { page, port } = app
  try {
    // Real Ctrl+C/Ctrl+V (step 6) round-trips through the OS clipboard API,
    // which headless Chrome refuses without an explicit grant.
    await page.send('Browser.grantPermissions', {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: `http://127.0.0.1:${port}`,
    }).catch(() => undefined)

    // WHY app.filesRoot, not a bare tmpdir: the host only opens a path under
    // its own files_root, which `startApp` already makes disposable per run —
    // never the committed sketches/review/ fixture itself.
    const scratchBoard = join(app.filesRoot, 'block-title-formatting.systemsketch')
    await copyFile(SOURCE_BOARD, scratchBoard)
    await openApp(page, port, `?board=${encodeURIComponent(scratchBoard)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(BLOCK_ID)})`, 'saved Block to load', 30_000)
    await evaluate(page, `window.__systemsketch.editor.zoomToFit(); undefined`)
    await delay(300)

    // ------------------------------------------------------------------
    // 1. Inspector trigger
    // ------------------------------------------------------------------
    const blockCentre = await shapeCentre(page, shapeSelector(BLOCK_ID))
    await clickAt(page, blockCentre.x, blockCentre.y)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the Block inspector to mount')
    pass('1. selecting the Block opens the inspector')

    // ------------------------------------------------------------------
    // finding 8, RISK — the Icons tab default-opens unfiltered over all
    // 1,818 Lucide entries; before windowing this put every cell straight
    // into the DOM on open (measured 473ms to first paint / 11,065 DOM
    // nodes on the dev server, against the proposal's own ~100ms bar). Time
    // the exact well click this journey already needs to open the picker,
    // measured in-page (`performance.now()`, no CDP round-trip noise inside
    // the polling loop itself) until more than 100 cells exist.
    // ------------------------------------------------------------------
    const well = await elementBox(page, '.block-inspector__icon-well')
    await evaluate(page, `window.__iconPickerPerfStart = performance.now(); undefined`)
    await clickAt(page, well.cx, well.cy)
    const perfResult = JSON.parse(await evaluate(page, `new Promise((resolve, reject) => {
      const start = window.__iconPickerPerfStart
      const deadline = performance.now() + 5000
      const check = () => {
        const count = document.querySelectorAll('[data-testid^="icon-picker-cell-lucide-"]').length
        if (count > 100) {
          resolve(JSON.stringify({ elapsedMs: performance.now() - start, cellCount: count }))
        } else if (performance.now() > deadline) {
          reject(new Error('timed out waiting for more than 100 Lucide cells to render'))
        } else {
          requestAnimationFrame(check)
        }
      }
      requestAnimationFrame(check)
    })`))
    process.stdout.write(
      `  finding 8: well click -> >100 Lucide cells in ${perfResult.elapsedMs.toFixed(1)}ms (${perfResult.cellCount} cells in the DOM)`
      + ` — before windowing this was measured at ~473ms with all 1,818 cells (11,065 DOM nodes) rendered at once\n`,
    )
    add(
      `finding 8: opening the picker stays well under the pre-windowing 473ms baseline (got ${perfResult.elapsedMs.toFixed(1)}ms)`,
      perfResult.elapsedMs < 350,
    )
    pass('1. clicking the icon well opens BlockIconPicker on the Icons tab')
    const unfilteredCountText = await evaluate(page, `document.querySelector('.BlockIconPicker-foot span')?.textContent ?? ''`)
    add(
      `finding 8: the count line still reads the full "1818 icons" despite windowing (got ${JSON.stringify(unfilteredCountText)})`,
      unfilteredCountText.includes('1818 icons'),
    )
    add('1. the Icons tab is open and its filter mounts',
      await evaluate(page, `document.querySelector('[data-testid="icon-picker-tab-icons"]')?.getAttribute('aria-selected') === 'true'`))

    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    const filterHasFocus = await evaluate(page, `document.activeElement === document.querySelector('[data-testid="icon-picker-filter"]')`)
    add('1. the filter is focused when the picker opens', filterHasFocus)

    await typeSlowly(page, 'data')
    await waitFor(page, `document.querySelectorAll('[data-testid^="icon-picker-cell-lucide-"]').length > 0`, 'filtered Lucide cells to render')
    await delay(200)
    await screenshot(page, SHOT_INSPECTOR)
    pass(`1. screenshot saved to ${SHOT_INSPECTOR}`)

    const countText = await evaluate(page, `document.querySelector('.BlockIconPicker-foot span')?.textContent ?? ''`)
    const shownMatch = /(\d+) shown/.exec(countText)
    assert.ok(shownMatch, `count line must read "N shown" (got ${JSON.stringify(countText)})`)
    const shownCount = Number(shownMatch[1])
    add(`1. "${countText.trim()}" — shown count ${shownCount} is between 10 and 100`, shownCount > 10 && shownCount < 100)

    const firstCellTestId = await evaluate(page, `document.querySelector('[data-testid^="icon-picker-cell-lucide-"]')?.dataset.testid ?? null`)
    assert.ok(firstCellTestId, 'a filtered cell exists')
    const firstCellBox = await elementBox(page, `[data-testid="${firstCellTestId}"]`)
    const iconBeforeFirstPick = await blockIcon(page)
    await clickAt(page, firstCellBox.cx, firstCellBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after picking')
    pass('1. picking a filtered Lucide cell closes the picker')

    const afterFirstPick = await blockIcon(page)
    add(
      `1. blockIconRef is a plain PascalCase Lucide name (got ${JSON.stringify(afterFirstPick.icon)})`,
      typeof afterFirstPick.icon === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(afterFirstPick.icon) && afterFirstPick.assetId == null,
    )
    const headerHasSvg = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))})?.querySelector('svg'))`)
    add('1. the canvas icon box now contains an svg', headerHasSvg)

    // ------------------------------------------------------------------
    // 12 (part). Exactly one undo step per pick — checked right after step 1.
    // ------------------------------------------------------------------
    await evaluate(page, `window.__systemsketch.editor.undo(); undefined`)
    await delay(200)
    const afterUndo = await blockIcon(page)
    add(
      `12. one undo restores the pre-pick icon (was ${JSON.stringify(iconBeforeFirstPick)}, got ${JSON.stringify(afterUndo)})`,
      afterUndo.icon === iconBeforeFirstPick.icon && afterUndo.assetId === iconBeforeFirstPick.assetId,
    )
    await evaluate(page, `window.__systemsketch.editor.redo(); undefined`)
    await delay(200)
    const afterRedo = await blockIcon(page)
    add(
      `12. redo restores the picked icon (${JSON.stringify(afterRedo)})`,
      afterRedo.icon === afterFirstPick.icon && afterRedo.assetId === afterFirstPick.assetId,
    )

    // ------------------------------------------------------------------
    // 2. Non-curated icon renders after the lazy Lucide chunk
    // ------------------------------------------------------------------
    await openWell(page)
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await typeSlowly(page, 'anchor')
    await waitFor(page, `document.querySelector('[data-testid="icon-picker-cell-lucide-Anchor"]')`, 'the Anchor cell to render')
    const anchorBox = await elementBox(page, '[data-testid="icon-picker-cell-lucide-Anchor"]')
    await clickAt(page, anchorBox.cx, anchorBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after picking Anchor')
    const afterAnchor = await blockIcon(page)
    add(`2. the stored icon is the non-curated name Anchor (got ${JSON.stringify(afterAnchor.icon)})`, afterAnchor.icon === 'Anchor')

    await waitFor(
      page,
      `(() => { const svg = document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))})?.querySelector('svg'); return Boolean(svg) && svg.childElementCount > 0 })()`,
      'the non-curated Anchor glyph to render real path data within 2s',
      2_000,
    )
    pass('2. the non-curated Anchor icon renders real svg path data after the lazy chunk resolves')

    // ------------------------------------------------------------------
    // 3. Emoji tab
    // ------------------------------------------------------------------
    await openWell(page)
    const emojiTab = await elementBox(page, '[data-testid="icon-picker-tab-emoji"]')
    await clickAt(page, emojiTab.cx, emojiTab.cy)
    await waitFor(page, `document.querySelector('[data-testid="icon-picker-filter"]')`, 'the Emoji tab to render its filter')
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await typeSlowly(page, 'rocket')
    await waitFor(page, `document.querySelectorAll('[data-testid^="icon-picker-cell-emoji-"]').length > 0`, 'filtered emoji cells to render')
    const rocketTestId = await evaluate(page, `Array.from(document.querySelectorAll('[data-testid^="icon-picker-cell-emoji-"]')).find((el) => el.textContent.trim() === '🚀')?.dataset.testid ?? null`)
    assert.ok(rocketTestId, 'a 🚀 cell exists among the "rocket" results')
    const rocketBox = await elementBox(page, `[data-testid="${rocketTestId}"]`)
    await clickAt(page, rocketBox.cx, rocketBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after picking 🚀')
    const afterRocket = await blockIcon(page)
    add(`3. props.icon is emoji:🚀 with no assetId (got ${JSON.stringify(afterRocket)})`, afterRocket.icon === 'emoji:🚀' && afterRocket.assetId == null)
    const emojiBoxText = await evaluate(page, `document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))} + ' span')?.textContent ?? null`)
    add(`3. the canvas icon box contains a span reading 🚀 (got ${JSON.stringify(emojiBoxText)})`, emojiBoxText === '🚀')

    // ------------------------------------------------------------------
    // 4. Upload via paste, with the canvas paste guard
    // ------------------------------------------------------------------
    await openWell(page)
    const uploadTab = await elementBox(page, '[data-testid="icon-picker-tab-upload"]')
    await clickAt(page, uploadTab.cx, uploadTab.cy)
    await waitFor(page, `document.querySelector('[data-testid="icon-picker-upload-button"]')`, 'the Upload tab to render')
    pass('4. the Upload tab renders its upload button')

    const imageShapesBeforePaste = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)

    // RISK finding 9: a 64x48 source made the old ≤256px assertion vacuous
    // (already under the cap before the downscale ran). A real 1600x1200
    // PNG, built in-page with a canvas so nothing depends on a hand-authored
    // base64 fixture, then dispatched on `document` in the capture phase —
    // exactly how BlockIconPicker's own paste listener reads a real Ctrl+V
    // (see its onPaste WHY comment) — actually exercises `scaledIconDimensions`.
    await evaluate(page, `(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 1200
      const context = canvas.getContext('2d')
      context.fillStyle = '#3a6cf6'
      context.fillRect(0, 0, 1600, 1200)
      context.fillStyle = '#ffffff'
      context.fillRect(200, 200, 500, 400)
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob produced no image'))), 'image/png')
      })
      const file = new File([blob], 'pasted-icon.png', { type: 'image/png' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer })
      document.dispatchEvent(event)
    })()`)
    await waitFor(page, `document.querySelector('.BlockIconPicker-preview')`, 'the Upload preview to stage the pasted image', 10_000)
    pass('4. pasting a real PNG while the picker is open stages the Upload preview')
    await delay(200)
    await screenshot(page, SHOT_UPLOAD_PREVIEW)
    pass(`4. screenshot saved to ${SHOT_UPLOAD_PREVIEW}`)

    // RISK finding 9 (continued): the preview meta line must show the real
    // downscale for a raster this large, not just its own byte size.
    const previewMetaText = await evaluate(page, `document.querySelector('.BlockIconPicker-previewMeta')?.textContent ?? ''`)
    add(
      `4. the preview meta line shows the 1600×1200 → 256×192 downscale (got "${previewMetaText}")`,
      previewMetaText.includes('1600×1200') && previewMetaText.includes('256×192') && previewMetaText.includes('→'),
    )

    const imageShapesAfterPaste = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)
    add(
      `4. the paste never dropped a second image shape on the canvas (before=${imageShapesBeforePaste}, after=${imageShapesAfterPaste})`,
      imageShapesAfterPaste === imageShapesBeforePaste,
    )

    const saveBox = await elementBox(page, '.BlockIconPicker-save')
    await clickAt(page, saveBox.cx, saveBox.cy)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.assetId`, 'Save to write an assetId onto the Block', 10_000)
    pass('4. Save closes the picker and writes an assetId onto the Block')
    await delay(200)
    await screenshot(page, SHOT_ASSET_ON_CANVAS)
    pass(`4. screenshot saved to ${SHOT_ASSET_ON_CANVAS}`)

    const afterUpload = await blockIcon(page)
    const uploadedAssetId = afterUpload.assetId
    add(`4. assetId starts with "asset:" (got ${JSON.stringify(uploadedAssetId)})`, typeof uploadedAssetId === 'string' && uploadedAssetId.startsWith('asset:'))
    add(`4. icon is the "asset" marker (got ${JSON.stringify(afterUpload.icon)})`, afterUpload.icon === 'asset')

    const assetRecord = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getAsset(${JSON.stringify(uploadedAssetId)})?.props ?? null)`))
    add(`4. the asset src is an inline PNG data URI (got ${String(assetRecord?.src).slice(0, 40)}…)`, typeof assetRecord?.src === 'string' && assetRecord.src.startsWith('data:image/png'))
    // Not just "at most 256px" (vacuous against a source already under the
    // cap) — the exact downscale a 1600x1200 source must land on.
    add(`4. the stored asset downscaled to exactly 256x192 (got ${assetRecord?.w}x${assetRecord?.h})`, assetRecord?.w === 256 && assetRecord?.h === 192)

    const imageShapesAfterSave = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)
    add(`4. saving the uploaded icon still never drops an image shape on the canvas (count=${imageShapesAfterSave})`, imageShapesAfterSave === imageShapesBeforePaste)

    // 4b. Save is ONE undo step for the Block. The asset record itself sits
    // outside history by tldraw design (Editor.createAssets runs with
    // history 'ignore', exactly as for its own pasted images), so it must
    // survive the undo — a Block that redoes must find its image again.
    await evaluate(page, `window.__systemsketch.editor.undo(); undefined`)
    const afterUploadUndo = await blockIcon(page)
    const assetAfterUndo = await evaluate(page, `window.__systemsketch.editor.getAsset(${JSON.stringify(uploadedAssetId)}) ? 'present' : 'gone'`)
    add(
      `4. one undo after Save restores the previous icon (assetId=${JSON.stringify(afterUploadUndo.assetId)}, icon=${JSON.stringify(afterUploadUndo.icon)})`,
      afterUploadUndo.assetId == null && afterUploadUndo.icon !== 'asset',
    )
    add(`4. the asset record survives the undo like tldraw's own images (asset=${assetAfterUndo})`, assetAfterUndo === 'present')
    await evaluate(page, `window.__systemsketch.editor.redo(); undefined`)
    const afterUploadRedo = await blockIcon(page)
    add(
      `4. one redo restores the uploaded icon (assetId=${JSON.stringify(afterUploadRedo.assetId)})`,
      afterUploadRedo.assetId === uploadedAssetId,
    )

    // ------------------------------------------------------------------
    // 5. Disk round trip
    // ------------------------------------------------------------------
    const savedSource = await waitForFile(
      scratchBoard,
      (text) => text.includes(uploadedAssetId),
      'the autosave to write the uploaded asset to disk',
    )
    const savedDoc = JSON.parse(savedSource)
    const savedAssetRecords = savedDoc.records.filter((record) => record.typeName === 'asset' && record.id === uploadedAssetId)
    add(`5. the saved .systemsketch has exactly one asset record for ${uploadedAssetId} (found ${savedAssetRecords.length})`, savedAssetRecords.length === 1)
    add('5. the saved asset record src is an inline PNG data URI', typeof savedAssetRecords[0]?.props?.src === 'string' && savedAssetRecords[0].props.src.startsWith('data:image/png'))

    await openApp(page, port, `?board=${encodeURIComponent(scratchBoard)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(BLOCK_ID)})`, 'the reloaded Block to load', 30_000)
    await evaluate(page, `window.__systemsketch.editor.zoomToFit(); undefined`)
    await delay(300)

    const afterReload = await blockIcon(page)
    add(`5. after reload the Block still decodes to kind:asset (${JSON.stringify(afterReload)})`, afterReload.icon === 'asset' && afterReload.assetId === uploadedAssetId)

    await waitFor(page, `document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))} + ' img')`, 'the reloaded icon <img> to mount', 10_000)
    await waitFor(
      page,
      `(document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))} + ' img')?.naturalWidth ?? 0) > 0`,
      'the reloaded icon <img> to actually decode',
      10_000,
    )
    pass('5. after reload the icon <img> is mounted and decodes to a real image')

    // ------------------------------------------------------------------
    // 6. Copy/paste carries the asset
    // ------------------------------------------------------------------
    const blockCentreAfterReload = await shapeCentre(page, shapeSelector(BLOCK_ID))
    await clickAt(page, blockCentreAfterReload.x, blockCentreAfterReload.y)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the inspector to mount for the reloaded Block')
    await shortcut(page, 'c', 'KeyC', 2)
    await shortcut(page, 'v', 'KeyV', 2)
    await delay(400)
    const selection = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`))
    add(`6. Ctrl+V leaves exactly one new shape selected (got ${JSON.stringify(selection)})`, Array.isArray(selection) && selection.length === 1 && selection[0] !== BLOCK_ID)
    const pastedId = selection[0]
    const pastedIcon = await blockIcon(page, pastedId)
    add(`6. the pasted Block's assetId resolves through editor.getAsset (${JSON.stringify(pastedIcon)})`,
      typeof pastedIcon.assetId === 'string'
      && await evaluate(page, `Boolean(window.__systemsketch.editor.getAsset(${JSON.stringify(pastedIcon.assetId)}))`))
    await waitFor(page, `document.querySelector(${JSON.stringify(iconBoxSelector(pastedId))} + ' img')`, 'the pasted Block icon <img> to mount', 10_000)
    pass('6. the pasted Block renders its own icon <img> on the canvas')

    // WHY: tldraw pastes close enough to the original that the two Blocks'
    // icon boxes can land on the same screen pixel, so a later click aimed
    // at the original's icon box (by DOM rect) can hit-test to the pasted
    // duplicate instead (steps 7-11 only care about the original). Move the
    // duplicate well clear so every later coordinate is unambiguous.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape(${JSON.stringify(pastedId)})
      editor.updateShape({ id: shape.id, type: shape.type, x: shape.x + 3000, y: shape.y + 3000 })
      // zoomToFit would now zoom out to include the far-away duplicate,
      // shrinking the original on screen — zoom to just the original instead.
      editor.select(${JSON.stringify(BLOCK_ID)})
      editor.zoomToSelection()
    })(); undefined`)
    await delay(200)

    // ------------------------------------------------------------------
    // 7. Context-menu trigger
    // ------------------------------------------------------------------
    const originalBlockCentre = await shapeCentre(page, shapeSelector(BLOCK_ID))
    // WHY `openContextMenuIconEntry` re-selects before every right-click:
    // tldraw's stock right-click keeps the PREVIOUS selection when the click
    // point falls inside its bounds, and step 6's pasted duplicate sits close
    // enough to the original that the two selection boxes overlap — a bare
    // right-click could silently reopen the menu on the pasted Block instead.
    // Re-selecting first removes the ambiguity the same way a person
    // clicking the original Block before right-clicking it would (same
    // pattern as `behavior_tree_identity_smoke.mjs`).
    const menuIconLabel = await openContextMenuIconEntry(page, originalBlockCentre)
    add(`7. the Add submenu offers "${menuIconLabel}" (an existing icon reopens as Change)`, menuIconLabel === 'Change icon…' || menuIconLabel === 'Icon…')
    pass('7. the context menu Icon… entry opens BlockIconPicker')

    // ------------------------------------------------------------------
    // 2 (SPEC-BREAKING). Shuffle from the context-menu trigger used to fire
    // once and unmount the picker: `choose()`'s shuffle path passes
    // `keepOpen: true`, but `onChange` used to call `editor.complete()`
    // itself — ending tldraw's editing lifecycle (and with it
    // `BlockInlineEditor`, which returns null once it's not the editing
    // shape) on the very first shuffle regardless of `keepOpen`. Fixed by
    // finding 1: `onChange` no longer touches the editing lifecycle at all.
    // ------------------------------------------------------------------
    const shuffleBox = await elementBox(page, '[data-testid="icon-picker-shuffle"]')
    const beforeShuffle1 = await blockIcon(page)
    await clickAt(page, shuffleBox.cx, shuffleBox.cy)
    await delay(150)
    const afterShuffle1 = await blockIcon(page)
    const pickerOpenAfterShuffle1 = await evaluate(page, `Boolean(document.querySelector('.BlockIconPicker'))`)
    add(
      `finding 2: the first shuffle from the context-menu trigger keeps the picker open and changes the icon (before=${JSON.stringify(beforeShuffle1)}, after=${JSON.stringify(afterShuffle1)}, open=${pickerOpenAfterShuffle1})`,
      pickerOpenAfterShuffle1 && (afterShuffle1.icon !== beforeShuffle1.icon || afterShuffle1.assetId !== beforeShuffle1.assetId),
    )
    // This Block has held step 4's uploaded assetId, untouched, ever since —
    // shuffle1 above is the journey's first non-asset (Lucide) pick since
    // then, so it's the real place the gap this WHY used to describe at
    // step 9 actually opens. Fixed in blockCommands.ts's updateBlockProps:
    // once a stored key would go missing from the shape's next props,
    // updateShape alone can't clear it (tldraw's own partial-props merge
    // only ever adds or overwrites a key that's present), so that command
    // now follows updateShape with a direct `editor.store.update` deleting
    // the keys it dropped — same pattern `stripBehaviorTreeMeta` already
    // uses for `meta` in behaviorTreeDetachable.ts.
    add(
      `assetId fix: a Lucide pick actually clears an assetId the Block was holding (before=${JSON.stringify(beforeShuffle1.assetId)}, after=${JSON.stringify(afterShuffle1.assetId)})`,
      beforeShuffle1.assetId != null && afterShuffle1.assetId == null,
    )
    await clickAt(page, shuffleBox.cx, shuffleBox.cy)
    await delay(150)
    const afterShuffle2 = await blockIcon(page)
    const pickerOpenAfterShuffle2 = await evaluate(page, `Boolean(document.querySelector('.BlockIconPicker'))`)
    add(
      `finding 2: a second shuffle also keeps the picker open and changes the icon again (${JSON.stringify(afterShuffle2)}, open=${pickerOpenAfterShuffle2})`,
      pickerOpenAfterShuffle2 && (afterShuffle2.icon !== afterShuffle1.icon || afterShuffle2.assetId !== afterShuffle1.assetId),
    )

    // ------------------------------------------------------------------
    // 1 (SPEC-BREAKING). A real (non-shuffle) pick from the context-menu
    // trigger must leave the Block selected and cost exactly one undo — the
    // bug: `onChange` completed the editing lifecycle immediately, so by the
    // time `choose()` closed the popover a beat later `editor.cancel()`
    // dispatched to `Idle` instead of `EditingShape`, landing on
    // `Idle.onCancel()` — an extra `markHistoryStoppingPoint` plus
    // `selectNone()`. See BlockInlineEditor.tsx's WHY at the icon field.
    // ------------------------------------------------------------------
    // WHY the undo target is `afterShuffle2` and not the icon from before
    // the popover opened: the two shuffles above are each their own
    // legitimate, independently undoable pick (same as any other choice) —
    // this check is about the cost of THIS pick alone, not the whole
    // interaction since the popover opened.
    const beforeFinalContextPick = afterShuffle2
    // WHY filtered, not the bare first unfiltered cell: with an empty query
    // the Icons grid's own Recent section (shuffle2 above just wrote to it)
    // renders first in DOM order under the SAME `icon-picker-cell-lucide-*`
    // testid prefix as the main grid — so the "first Lucide cell" was
    // shuffle2's own pick, making this click a same-value no-op the store
    // doesn't record a diff for at all, which then threw off the undo count
    // below. `IconsGrid` only renders Recent when the query is empty, so
    // filtering removes the ambiguity outright.
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await typeSlowly(page, 'chevron')
    await waitFor(page, `document.querySelectorAll('[data-testid^="icon-picker-cell-lucide-"]').length > 0`, 'filtered Lucide cells to render for the context-menu-triggered pick')
    const contextPickCellId = await evaluate(page, `document.querySelector('[data-testid^="icon-picker-cell-lucide-"]')?.dataset.testid ?? null`)
    assert.ok(contextPickCellId, 'a filtered Lucide cell renders for the context-menu-triggered pick')
    const contextPickBox = await elementBox(page, `[data-testid="${contextPickCellId}"]`)
    await clickAt(page, contextPickBox.cx, contextPickBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after the context-menu pick')
    const afterContextPick = await blockIcon(page)
    const stateAfterContextPick = await editorState(page)
    add(
      `finding 1: the Block is still selected after a context-menu pick (selected=${JSON.stringify(stateAfterContextPick.selected)})`,
      stateAfterContextPick.selected.length === 1 && stateAfterContextPick.selected[0] === BLOCK_ID,
    )
    add(
      `finding 1: editingShapeId is null after the context-menu popover closes (got ${JSON.stringify(stateAfterContextPick.editingShapeId)})`,
      stateAfterContextPick.editingShapeId === null,
    )

    await evaluate(page, `window.__systemsketch.editor.undo(); undefined`)
    await delay(150)
    const afterContextUndo = await blockIcon(page)
    const stateAfterContextUndo = await editorState(page)
    add(
      `finding 1: exactly ONE undo restores the pre-pick icon (want ${JSON.stringify(beforeFinalContextPick)}, got ${JSON.stringify(afterContextUndo)})`,
      afterContextUndo.icon === beforeFinalContextPick.icon && afterContextUndo.assetId === beforeFinalContextPick.assetId,
    )
    add(
      `finding 1: that one undo did not also clear the selection (selected=${JSON.stringify(stateAfterContextUndo.selected)})`,
      stateAfterContextUndo.selected.length === 1 && stateAfterContextUndo.selected[0] === BLOCK_ID,
    )
    await evaluate(page, `window.__systemsketch.editor.redo(); undefined`)
    await delay(150)
    const afterContextRedo = await blockIcon(page)
    add(
      `finding 1: redo restores the context-menu pick (${JSON.stringify(afterContextRedo)})`,
      afterContextRedo.icon === afterContextPick.icon && afterContextRedo.assetId === afterContextPick.assetId,
    )

    // Escape/outside-close with no pick still ends the lifecycle cleanly —
    // nothing to cancel, so `onOpenChange` reaches for `.complete()` here
    // too (checked below via editingShapeId). WHY this doesn't also assert
    // the Block stays selected, unlike the real-pick checks above: a raw
    // Escape keydown isn't only Radix's dismissable layer — it's also
    // tldraw's own stock "clear selection" shortcut, and nothing here stops
    // that same keypress from reaching both. That's independent of finding
    // 1 (which is about what OUR OWN onChange/onOpenChange do after a pick,
    // not about tldraw's own global Escape binding) and outside this fix's
    // scope.
    await openContextMenuIconEntry(page, originalBlockCentre)
    const beforeContextMenuEscape = await blockIcon(page)
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'Escape to close the context-menu-opened picker')
    const afterContextMenuEscape = await blockIcon(page)
    const stateAfterContextEscape = await editorState(page)
    add('7. Escape closes the picker and leaves the icon unchanged',
      afterContextMenuEscape.icon === beforeContextMenuEscape.icon && afterContextMenuEscape.assetId === beforeContextMenuEscape.assetId)
    add(
      `finding 1: editingShapeId is null after Escape too (got ${JSON.stringify(stateAfterContextEscape.editingShapeId)})`,
      stateAfterContextEscape.editingShapeId === null,
    )

    // ------------------------------------------------------------------
    // 8. Inline-editor trigger
    // ------------------------------------------------------------------
    await key(page, 'Escape', 'Escape')
    await clickAt(page, 40, 900) // an empty stretch of canvas, to deselect
    await delay(200)

    let lastLucidePickName = null
    const iconBoxPoint = await elementBox(page, iconBoxSelector(BLOCK_ID))
    await clickAt(page, iconBoxPoint.cx, iconBoxPoint.cy)
    await delay(200)
    const activeAfterFirstClick = await evaluate(page, `document.querySelectorAll('.BlockNode-inlineEditor').length`)
    add('8. the first click on the icon box only selects the Block', activeAfterFirstClick === 0)

    await delay(700) // out-wait tldraw's 450ms double-click window, per block_click_to_edit_smoke
    await clickAt(page, iconBoxPoint.cx, iconBoxPoint.cy)
    // If the inline-editor trigger is unreachable this way, `add` below fails
    // loudly (per the spec: make this FAIL, never skip it silently) instead
    // of the whole journey dying on a generic waitFor timeout.
    const inlineOpened = await waitFor(
      page,
      `document.querySelector('.BlockIconPicker')`,
      'the slow second click on the icon box to open the inline BlockIconPicker',
    ).then(() => true).catch(() => false)
    add('8. a slow second click on the on-canvas icon box opens BlockIconPicker anchored on the canvas', inlineOpened)

    const pickerBox = await elementBox(page, '.BlockIconPicker')
    const inlineAnchorBox = await elementBox(page, `[data-testid="block-inline-icon"]`)
    const gapX = Math.max(0, inlineAnchorBox.x - (pickerBox.x + pickerBox.width), pickerBox.x - (inlineAnchorBox.x + inlineAnchorBox.width))
    const gapY = Math.max(0, inlineAnchorBox.y - (pickerBox.y + pickerBox.height), pickerBox.y - (inlineAnchorBox.y + inlineAnchorBox.height))
    add(`8. the popover is anchored within 40px of the Block's icon box (gapX=${gapX.toFixed(1)}, gapY=${gapY.toFixed(1)})`, gapX <= 40 && gapY <= 40)

    const beforeInlinePick = await blockIcon(page)
    // WHY filtered, not the bare first unfiltered cell: with an empty query
    // the Icons grid's Recent section renders first in DOM order under the
    // SAME testid prefix as the main grid, and by this point in the journey
    // Recent's own top entry is step 7's last lucide pick — which is also
    // the Block's CURRENT icon. Picking it "unfiltered" would be a same-
    // value no-op the store records no diff for (see finding 1's WHY on the
    // context-menu trigger's own pick, above, for the full mechanism).
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await typeSlowly(page, 'square')
    await waitFor(page, `document.querySelectorAll('[data-testid^="icon-picker-cell-lucide-"]').length > 0`, 'filtered Lucide cells to render for the inline-editor-triggered pick')
    const anyCellTestId = await evaluate(page, `document.querySelector('[data-testid^="icon-picker-cell-lucide-"]')?.dataset.testid ?? null`)
    assert.ok(anyCellTestId, 'at least one filtered Lucide cell renders')
    const anyCellBox = await elementBox(page, `[data-testid="${anyCellTestId}"]`)
    await clickAt(page, anyCellBox.cx, anyCellBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the inline picker to close after picking')
    const afterInlinePick = await blockIcon(page)
    add(
      `8. picking from the inline-editor trigger changed the prop (before=${JSON.stringify(beforeInlinePick)}, after=${JSON.stringify(afterInlinePick)})`,
      afterInlinePick.icon !== beforeInlinePick.icon || afterInlinePick.assetId !== beforeInlinePick.assetId,
    )

    // ------------------------------------------------------------------
    // 1 (SPEC-BREAKING), inline-editor half: same fix, same two checks as
    // the context-menu trigger above — this is the trigger the bug report
    // named first (`BlockInlineEditor.tsx:236-243`).
    // ------------------------------------------------------------------
    const stateAfterInlinePick = await editorState(page)
    add(
      `finding 1: the Block is still selected after an inline-editor pick (selected=${JSON.stringify(stateAfterInlinePick.selected)})`,
      stateAfterInlinePick.selected.length === 1 && stateAfterInlinePick.selected[0] === BLOCK_ID,
    )
    add(
      `finding 1: editingShapeId is null after the inline popover closes (got ${JSON.stringify(stateAfterInlinePick.editingShapeId)})`,
      stateAfterInlinePick.editingShapeId === null,
    )
    await evaluate(page, `window.__systemsketch.editor.undo(); undefined`)
    await delay(150)
    const afterInlineUndo = await blockIcon(page)
    const stateAfterInlineUndo = await editorState(page)
    add(
      `finding 1: exactly ONE undo restores the pre-pick icon (want ${JSON.stringify(beforeInlinePick)}, got ${JSON.stringify(afterInlineUndo)})`,
      afterInlineUndo.icon === beforeInlinePick.icon && afterInlineUndo.assetId === beforeInlinePick.assetId,
    )
    add(
      `finding 1: that one undo did not also clear the selection (selected=${JSON.stringify(stateAfterInlineUndo.selected)})`,
      stateAfterInlineUndo.selected.length === 1 && stateAfterInlineUndo.selected[0] === BLOCK_ID,
    )
    await evaluate(page, `window.__systemsketch.editor.redo(); undefined`)
    await delay(150)
    const afterInlineRedo = await blockIcon(page)
    add(
      `finding 1: redo restores the inline-editor pick (${JSON.stringify(afterInlineRedo)})`,
      afterInlineRedo.icon === afterInlinePick.icon && afterInlineRedo.assetId === afterInlinePick.assetId,
    )

    lastLucidePickName = afterInlinePick.icon

    // ------------------------------------------------------------------
    // 9. Remove
    // ------------------------------------------------------------------
    await clickAt(page, originalBlockCentre.x, originalBlockCentre.y)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the inspector to mount before Remove')
    await openWell(page)
    const removeBox = await elementBox(page, '[data-testid="icon-picker-remove"]')
    await clickAt(page, removeBox.cx, removeBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after Remove')
    const afterRemove = await blockIcon(page)
    // Restored to check both props: fixed in blockCommands.ts's
    // updateBlockProps (see the WHY beside shuffle1 above, step 7) — Remove
    // clears assetId the same way any other non-upload pick now does. This
    // Block's assetId was already cleared back at step 7's first shuffle,
    // so this also proves the fix holds after several more picks in between.
    add(`9. Remove clears both props (got ${JSON.stringify(afterRemove)})`, afterRemove.icon === '' && afterRemove.assetId == null)
    const iconBoxGone = await evaluate(page, `document.querySelector(${JSON.stringify(iconBoxSelector(BLOCK_ID))}) === null`)
    add('9. the canvas icon box is gone from the DOM after Remove', iconBoxGone)

    // ------------------------------------------------------------------
    // 10. Recent
    // ------------------------------------------------------------------
    await openWell(page)
    await waitFor(page, `document.querySelector('.BlockIconPicker-section')`, 'a section to render with an empty filter')
    await delay(150)
    const firstSectionLabel = await evaluate(page, `document.querySelector('.BlockIconPicker-section')?.textContent.trim() ?? null`)
    add(`10. the first section with an empty filter is "Recent" (got ${JSON.stringify(firstSectionLabel)})`, firstSectionLabel === 'Recent')
    const recentHasLastPick = await evaluate(page, `(() => {
      const section = Array.from(document.querySelectorAll('.BlockIconPicker-section')).find((el) => el.textContent.trim() === 'Recent')
      const grid = section?.nextElementSibling
      return Boolean(grid?.querySelector(${JSON.stringify(`[data-testid="icon-picker-cell-lucide-${lastLucidePickName}"]`)}))
    })()`)
    add(`10. the Recent section contains the last Lucide pick (${lastLucidePickName})`, recentHasLastPick)
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'Escape to close the Recent-check picker')

    // ------------------------------------------------------------------
    // finding 7, RISK — the Emoji tab gets its own Recent section (Notion
    // has one too; the picker only ever tracked Lucide picks before). Step
    // 3 picked 🚀 by clicking its cell directly, so it should have recorded.
    //
    // WHY re-select explicitly: same as the Dark theme step below — step
    // 10's Escape can bubble past the (uncontrolled) picker's own
    // dismissable layer into tldraw's global Escape handler, which clears
    // the canvas selection, and with nothing selected the inspector (and
    // its icon well) doesn't render at all.
    // ------------------------------------------------------------------
    await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(BLOCK_ID)}); undefined`)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the inspector to mount before the finding-7 Emoji-Recent check')
    await openWell(page)
    const emojiTabForRecent = await elementBox(page, '[data-testid="icon-picker-tab-emoji"]')
    await clickAt(page, emojiTabForRecent.cx, emojiTabForRecent.cy)
    await waitFor(page, `document.querySelector('.BlockIconPicker-section')`, 'a section to render on the Emoji tab with an empty filter')
    await delay(150)
    const firstEmojiSectionLabel = await evaluate(page, `document.querySelector('.BlockIconPicker-section')?.textContent.trim() ?? null`)
    add(
      `finding 7: the first section on the Emoji tab with an empty filter is "Recent" (got ${JSON.stringify(firstEmojiSectionLabel)})`,
      firstEmojiSectionLabel === 'Recent',
    )
    const emojiRecentHasRocket = await evaluate(page, `(() => {
      const section = Array.from(document.querySelectorAll('.BlockIconPicker-section')).find((el) => el.textContent.trim() === 'Recent')
      const grid = section?.nextElementSibling
      return Array.from(grid?.querySelectorAll('[data-testid^="icon-picker-cell-emoji-"]') ?? []).some((el) => el.textContent.trim() === '🚀')
    })()`)
    add('finding 7: the Emoji Recent section contains the 🚀 pick from step 3', emojiRecentHasRocket)
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'Escape to close the Emoji-Recent-check picker')

    // ------------------------------------------------------------------
    // finding 5, RISK — a URL paste over a text field the picker itself
    // owns (the Icons/Emoji filter) must fill the field instead of hijacking
    // to Upload; only a paste on the Upload tab, or when focus isn't inside
    // a typing target, should jump tabs and fetch.
    //
    // WHY re-select explicitly: same reason as above — finding 7's own
    // Escape just cleared the canvas selection too.
    // ------------------------------------------------------------------
    await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(BLOCK_ID)}); undefined`)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the inspector to mount before the finding-5 URL-paste-guard check')
    await openWell(page)
    await waitFor(
      page,
      `document.querySelector('[data-testid="icon-picker-tab-icons"]')?.getAttribute('aria-selected') === 'true'`,
      'the picker to reopen on the Icons tab for the URL-paste-guard check',
    )
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await evaluate(page, `navigator.clipboard.writeText('https://example.com/mark.png')`)
    await shortcut(page, 'v', 'KeyV', 2)
    await delay(200)
    const filterAfterUrlPaste = await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]')?.value ?? null`)
    const tabAfterUrlPaste = await evaluate(page, `document.querySelector('[data-testid="icon-picker-tab-icons"]')?.getAttribute('aria-selected')`)
    add(
      `finding 5: pasting a URL with the Icons filter focused fills the filter instead of hijacking to Upload (filter=${JSON.stringify(filterAfterUrlPaste)}, Icons tab still selected=${tabAfterUrlPaste})`,
      filterAfterUrlPaste === 'https://example.com/mark.png' && tabAfterUrlPaste === 'true',
    )
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'Escape to close the URL-paste-guard picker')

    // ------------------------------------------------------------------
    // 11. Dark theme
    // ------------------------------------------------------------------
    await evaluate(page, `window.__systemsketch.editor.user.updateUserPreferences({ colorScheme: 'dark' }); undefined`)
    await delay(300)
    // WHY re-select explicitly: step 10's Escape can bubble past the
    // (uncontrolled) picker's own dismissable layer into tldraw's global
    // Escape handler, which clears the canvas selection — and with nothing
    // selected the inspector (and its icon well) doesn't render at all.
    await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(BLOCK_ID)}); undefined`)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the inspector to mount before the dark-theme check')
    await openWell(page)
    await delay(200)
    await screenshot(page, SHOT_DARK)
    pass(`11. screenshot saved to ${SHOT_DARK}`)
    const darkBackground = await evaluate(page, `getComputedStyle(document.querySelector('.BlockIconPicker')).backgroundColor`)
    add(`11. the picker background in dark theme is not white (got ${darkBackground})`, darkBackground !== 'rgb(255, 255, 255)' && darkBackground !== 'rgba(255, 255, 255, 1)' && darkBackground !== '#ffffff')
    await key(page, 'Escape', 'Escape')

    // ------------------------------------------------------------------
    // 12. No console errors across the whole journey
    // ------------------------------------------------------------------
    const consoleErrors = readConsoleErrors(page)
    add(`12. zero local console errors across the journey (got ${consoleErrors.length})`, consoleErrors.length === 0)
    if (consoleErrors.length) process.stderr.write(`  console errors:\n${consoleErrors.join('\n')}\n`)

    const passedCount = report('icon picker')
    process.stdout.write(`  ${SHOT_INSPECTOR}\n  ${SHOT_UPLOAD_PREVIEW}\n  ${SHOT_ASSET_ON_CANVAS}\n  ${SHOT_DARK}\n`)
    await ensureDir(join(RESULTS, '..'))
    await writeFile(RESULTS, JSON.stringify({
      checks: passedCount,
      passed: passedCount,
      firstPaintMs: perfResult.elapsedMs,
      recordedAt: new Date().toISOString(),
    }, null, 1))
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
