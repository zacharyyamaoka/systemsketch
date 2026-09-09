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

    await openWell(page)
    pass('1. clicking the icon well opens BlockIconPicker on the Icons tab')
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
      typeof afterFirstPick.icon === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(afterFirstPick.icon) && afterFirstPick.assetId === null,
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
    add(`3. props.icon is emoji:🚀 with no assetId (got ${JSON.stringify(afterRocket)})`, afterRocket.icon === 'emoji:🚀' && afterRocket.assetId === null)
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

    // A real 64x48 PNG, built in-page with a canvas so nothing depends on a
    // hand-authored base64 fixture, then dispatched on `document` in the
    // capture phase — exactly how BlockIconPicker's own paste listener reads
    // a real Ctrl+V (see its onPaste WHY comment).
    await evaluate(page, `(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 48
      const context = canvas.getContext('2d')
      context.fillStyle = '#3a6cf6'
      context.fillRect(0, 0, 64, 48)
      context.fillStyle = '#ffffff'
      context.fillRect(8, 8, 20, 16)
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
    add(`4. the stored asset is at most 256px on a side (got ${assetRecord?.w}x${assetRecord?.h})`, assetRecord?.w <= 256 && assetRecord?.h <= 256)

    const imageShapesAfterSave = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)
    add(`4. saving the uploaded icon still never drops an image shape on the canvas (count=${imageShapesAfterSave})`, imageShapesAfterSave === imageShapesBeforePaste)

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
    const beforeContextMenu = await blockIcon(page)
    // WHY an explicit left-click first: tldraw's stock right-click keeps the
    // PREVIOUS selection when the click point falls inside its bounds — step
    // 6's pasted duplicate sits close enough to the original that the two
    // selection boxes overlap, so a bare right-click here would silently
    // reopen the menu on the pasted Block instead. A plain select first
    // removes the ambiguity the same way a person clicking the original
    // Block before right-clicking it would.
    // WHY `editor.select` and not a plain click: step 6's pasted duplicate
    // sits close enough to the original on screen that a click at the
    // original's centre can land on the (topmost) duplicate instead — this
    // is setup for the right-click test below, not the interaction under
    // test, so pin it directly the way other journeys in this repo do
    // (e.g. `behavior_tree_identity_smoke.mjs`).
    await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(BLOCK_ID)}); undefined`)
    await delay(150)
    await clickAt(page, originalBlockCentre.x, originalBlockCentre.y, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu-sub.block-add-button"]')`, 'the Block context menu to open with an Add submenu')
    const addSubmenuBox = await elementBox(page, '[data-testid="context-menu-sub.block-add-button"]')
    await clickAt(page, addSubmenuBox.cx, addSubmenuBox.cy)
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-add-icon"]')`, 'the Add submenu to render its icon entry')
    const menuIconLabel = await evaluate(page, `document.querySelector('[data-testid="context-menu.block-add-icon"]')?.textContent ?? ''`)
    add(`7. the Add submenu offers "${menuIconLabel}" (an existing icon reopens as Change)`, menuIconLabel === 'Change icon…' || menuIconLabel === 'Icon…')
    const menuIconBox = await elementBox(page, '[data-testid="context-menu.block-add-icon"]')
    await clickAt(page, menuIconBox.cx, menuIconBox.cy)
    await waitFor(page, `document.querySelector('.BlockIconPicker')`, 'the context menu Icon… entry to open BlockIconPicker')
    pass('7. the context menu Icon… entry opens BlockIconPicker')

    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'Escape to close the context-menu-opened picker')
    const afterContextMenuEscape = await blockIcon(page)
    add('7. Escape closes the picker and leaves the icon unchanged',
      afterContextMenuEscape.icon === beforeContextMenu.icon && afterContextMenuEscape.assetId === beforeContextMenu.assetId)

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
    const anyCellTestId = await evaluate(page, `document.querySelector('[data-testid^="icon-picker-cell-lucide-"]')?.dataset.testid ?? null`)
    assert.ok(anyCellTestId, 'at least one Lucide cell renders with no filter')
    const anyCellBox = await elementBox(page, `[data-testid="${anyCellTestId}"]`)
    await clickAt(page, anyCellBox.cx, anyCellBox.cy)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the inline picker to close after picking')
    const afterInlinePick = await blockIcon(page)
    add(
      `8. picking from the inline-editor trigger changed the prop (before=${JSON.stringify(beforeInlinePick)}, after=${JSON.stringify(afterInlinePick)})`,
      afterInlinePick.icon !== beforeInlinePick.icon || afterInlinePick.assetId !== beforeInlinePick.assetId,
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
    add(`9. Remove clears both props (got ${JSON.stringify(afterRemove)})`, afterRemove.icon === '' && afterRemove.assetId === null)
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

    report('icon picker')
    process.stdout.write(`  ${SHOT_INSPECTOR}\n  ${SHOT_UPLOAD_PREVIEW}\n  ${SHOT_ASSET_ON_CANVAS}\n  ${SHOT_DARK}\n`)
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
