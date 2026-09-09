#!/usr/bin/env node
/**
 * Scratch CDP journey proving the new Block icon picker end to end in the
 * real running app: the inspector's icon well opens it, typing a filter and
 * clicking a Lucide cell writes a plain Lucide name onto the Block, and the
 * Upload tab's paste path stages an image WITHOUT also dropping a second
 * image shape onto the canvas (the capture-phase paste guard).
 *
 * Rough on purpose — a peer writes the real tests/icon_picker_smoke.mjs
 * after this slice lands; this is this slice's own proof it works, driven
 * against a SCRATCH COPY of a real committed board so the app's autosave
 * never touches the tracked fixture (CLAUDE.md's rule).
 */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SOURCE_BOARD = join(ROOT, 'sketches', 'review', 'block-title-formatting.systemsketch')
const BLOCK_ID = 'shape:function-block'
const SHOT_INSPECTOR = join(ROOT, 'docs', 'assets', 'icon-picker-inspector.png')
const SHOT_UPLOAD_PREVIEW = join(ROOT, 'docs', 'assets', 'icon-picker-upload-preview.png')

// A minimal valid 1x1 opaque red PNG, base64.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

async function shapeBox(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(`[data-shape-id="${shapeId}"]`)})
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`)
  if (!value) throw new Error(`shape ${shapeId} is not painted`)
  const rect = JSON.parse(value)
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }
}

async function elementCentre(page, selector) {
  const value = await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)})
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`)
  if (!value) throw new Error(`missing element ${selector}`)
  const rect = JSON.parse(value)
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await ensureDir(join(path, '..'))
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function main() {
  const { pass, add, report } = makeChecklist()

  const app = await startApp({
    label: 'icon-picker-scratch',
    build: 'icon-picker-scratch',
    width: 1600,
    height: 1000,
  })
  const { page } = app
  try {
    // WHY app.filesRoot, not a bare tmpdir: the host only opens a path under
    // its own files_root (or an explicitly authorized `additional_roots`) —
    // and files_root is already a disposable per-run scratch directory `startApp`
    // makes for exactly this, so there is nothing of Zach's this can ever
    // reach even by accident, unlike pointing `?board=` at the committed
    // sketches/review/ fixture itself (CLAUDE.md: never autosave into a real board).
    const scratchBoard = join(app.filesRoot, 'block-title-formatting.systemsketch')
    await copyFile(SOURCE_BOARD, scratchBoard)
    await openApp(page, app.port, `?board=${encodeURIComponent(scratchBoard)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(BLOCK_ID)})`, 'saved Block to load', 30_000)
    await evaluate(page, `window.__systemsketch.editor.zoomToFit(); undefined`)
    await delay(300)

    // --- Inspector trigger: select the Block, open its icon well -------------
    const blockPoint = await shapeBox(page, BLOCK_ID)
    await clickAt(page, blockPoint.cx, blockPoint.cy)
    await waitFor(page, `document.querySelector('.block-inspector')`, 'the Block inspector to mount')
    pass('selecting the Block opens the inspector')

    const wellPoint = await elementCentre(page, '.block-inspector__icon-well')
    await clickAt(page, wellPoint.cx, wellPoint.cy)
    await waitFor(page, `document.querySelector('.BlockIconPicker')`, 'the icon picker to open')
    pass('clicking the icon well opens BlockIconPicker')

    // --- Icons tab: filter, screenshot, pick a cell ---------------------------
    await evaluate(page, `document.querySelector('[data-testid="icon-picker-filter"]').focus()`)
    await typeSlowly(page, 'data')
    await waitFor(page, `document.querySelectorAll('[data-testid^="icon-picker-cell-lucide-"]').length > 0`, 'filtered Lucide cells to render')
    await delay(200)
    await screenshot(page, SHOT_INSPECTOR)
    pass(`screenshot saved to ${SHOT_INSPECTOR}`)

    const firstCellTestId = await evaluate(page, `document.querySelector('[data-testid^="icon-picker-cell-lucide-"]')?.dataset.testid ?? null`)
    assert.ok(firstCellTestId, 'a filtered cell exists')
    const cellPoint = await elementCentre(page, `[data-testid="${firstCellTestId}"]`)
    await clickAt(page, cellPoint.cx, cellPoint.cy)
    await delay(200)
    await waitFor(page, `!document.querySelector('.BlockIconPicker')`, 'the picker to close after picking')
    pass('picking a Lucide cell closes the picker')

    const iconAfterPick = await evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.icon`)
    const assetIdAfterPick = await evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.assetId ?? null`)
    add(
      `stored icon is a plain Lucide name, not emoji/asset-prefixed (got ${JSON.stringify(iconAfterPick)})`,
      typeof iconAfterPick === 'string' && iconAfterPick.length > 0
        && !iconAfterPick.startsWith('emoji:') && iconAfterPick !== 'asset',
    )
    add('assetId is unset for a Lucide pick', assetIdAfterPick === null)

    // --- Upload tab: paste a synthetic PNG, then Save --------------------------
    await clickAt(page, wellPoint.cx, wellPoint.cy)
    await waitFor(page, `document.querySelector('.BlockIconPicker')`, 'the icon picker to reopen')
    const uploadTabPoint = await elementCentre(page, '[data-testid="icon-picker-tab-upload"]')
    await clickAt(page, uploadTabPoint.cx, uploadTabPoint.cy)
    await waitFor(page, `document.querySelector('[data-testid="icon-picker-upload-button"]')`, 'the Upload tab to render')
    pass('the Upload tab renders its upload button')

    const shapeCountBeforePaste = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)

    // Dispatch a real ClipboardEvent with a DataTransfer holding a small PNG
    // File — the same shape the browser gives a genuine Ctrl+V. Runs in the
    // page itself (not CDP's own paste API) so it exercises BlockIconPicker's
    // own document-level, capture-phase listener exactly as a person's paste
    // would reach it.
    await evaluate(page, `(async () => {
      const bytes = atob(${JSON.stringify(TINY_PNG_BASE64)})
      const array = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i)
      const file = new File([array], 'mark.png', { type: 'image/png' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer })
      document.dispatchEvent(event)
    })()`)
    await waitFor(page, `document.querySelector('.BlockIconPicker-preview')`, 'the Upload preview to stage the pasted image', 10_000)
    pass('pasting an image while the picker is open stages the Upload preview')
    await delay(200)
    await screenshot(page, SHOT_UPLOAD_PREVIEW)
    pass(`screenshot saved to ${SHOT_UPLOAD_PREVIEW}`)

    const shapeCountAfterPaste = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)
    add(
      `the paste did not also drop an image shape on the canvas (before=${shapeCountBeforePaste}, after=${shapeCountAfterPaste})`,
      shapeCountAfterPaste === shapeCountBeforePaste,
    )

    const saveButtonPoint = await elementCentre(page, '.BlockIconPicker-save')
    await clickAt(page, saveButtonPoint.cx, saveButtonPoint.cy)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.assetId`, 'Save to write an assetId onto the Block', 10_000)
    pass('Save closes the picker and writes an assetId onto the Block')

    const assetId = await evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.assetId`)
    const assetSrc = await evaluate(page, `window.__systemsketch.editor.getAsset(${JSON.stringify(assetId)})?.props?.src ?? null`)
    add(
      `the created asset's src is an inline PNG data URI (got ${String(assetSrc).slice(0, 40)}…)`,
      typeof assetSrc === 'string' && assetSrc.startsWith('data:image/png'),
    )

    const shapeCountAfterSave = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'image').length`)
    add(
      `saving the uploaded icon still never drops an image shape on the canvas (count=${shapeCountAfterSave})`,
      shapeCountAfterSave === shapeCountBeforePaste,
    )

    const consoleErrors = localConsoleErrors(page)
    add(`zero local console errors (got ${consoleErrors.length})`, consoleErrors.length === 0)
    if (consoleErrors.length) process.stderr.write(`  console errors:\n${consoleErrors.join('\n')}\n`)

    report('icon picker')
    process.stdout.write(`  ${SHOT_INSPECTOR}\n  ${SHOT_UPLOAD_PREVIEW}\n`)
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
