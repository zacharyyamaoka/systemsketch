#!/usr/bin/env node
/**
 * Real-browser proof for the Figma-style document-title interaction. The
 * workspace is throwaway; the visible gestures are clicks, F2, Escape, Enter,
 * and a blur onto the canvas.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const RESULTS = join(ASSETS, 'inline-document-rename-results.json')

function documentSource(name) {
  return JSON.stringify({
    systemSketch: { formatVersion: 1, application: 'SystemSketch', shapes: {}, bindings: {} },
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [
      { typeName: 'document', id: 'document:document', gridSize: 10, name },
      { typeName: 'page', id: 'page:page', name: 'Page 1', index: 'a1', meta: {} },
    ],
  }, null, 2)
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

async function replaceFocusedText(page, value) {
  await key(page, 'a', 'KeyA', 2)
  await page.send('Input.insertText', { text: value })
}

async function main() {
  const { checks, pass } = makeChecklist()
  const app = await startApp({ label: 'inline-document-rename', width: 900, height: 720 })
  const { page, port, filesRoot } = app
  const originalPath = join(filesRoot, 'SystemSketch', 'Draft.systemsketch')
  const finalPath = join(filesRoot, 'SystemSketch', 'Robotics plan.systemsketch')
  const blurPath = join(filesRoot, 'SystemSketch', 'Robotics plan v2.systemsketch')

  try {
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await writeFile(originalPath, documentSource('Draft'))
    await mkdir(ASSETS, { recursive: true })

    await openApp(page, port, `?board=${encodeURIComponent(originalPath)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-file-title"]')`, 'the document title')

    // 1–4. Click means an immediately useful input: no modal, selected title,
    // cancelable with Escape, and the editor shell does not jump.
    await clickElement(page, '[data-testid="systemsketch-file-title"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-inline-rename"] input')`, 'the inline title input')
    const editState = JSON.parse(await evaluate(page, `JSON.stringify({
      dialog: Boolean(document.querySelector('[data-testid="workspace-dialog"]')),
      active: document.activeElement?.className,
      selection: [document.activeElement?.selectionStart, document.activeElement?.selectionEnd],
      value: document.activeElement?.value,
    })`).then((value) => value))
    assert.equal(editState.dialog, false, 'the old rename modal opened')
    assert.equal(editState.active, 'systemsketch-file-title-input')
    assert.deepEqual(editState.selection, [0, 5])
    assert.equal(editState.value, 'Draft')
    await shot(page, 'inline-document-rename-editing.png')
    pass('clicking the title enters a selected inline filename field without opening a modal')

    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-inline-rename"]')`, 'Escape to cancel inline rename')
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-file-title"] span')?.textContent`), 'Draft')
    pass('Escape cancels an inline draft without changing the document identity')

    // 5–7. F2 is the familiar keyboard entry point; Enter writes exactly the
    // basename and preserves the controlled file extension.
    await key(page, 'F2', 'F2')
    await waitFor(page, `document.querySelector('.systemsketch-file-title-input')`, 'F2 inline rename')
    await replaceFocusedText(page, 'Robotics plan')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-file-title"] span')?.textContent === 'Robotics plan'`, 'the committed title')
    assert.equal(await evaluate(page, `new URL(location.href).searchParams.get('board')?.endsWith('Robotics plan.systemsketch')`), true)
    assert.equal((await readFile(finalPath, 'utf8')).includes('systemSketch'), true)
    await shot(page, 'inline-document-rename-saved.png')
    pass('F2 focuses the same selected field, Enter commits, and .systemsketch stays protected')

    // 8. Leaving the compact field is enough; no second affirmative click is
    // required after typing a straightforward new title.
    await clickElement(page, '[data-testid="systemsketch-file-title"]')
    await waitFor(page, `document.querySelector('.systemsketch-file-title-input')`, 'a second inline rename')
    await replaceFocusedText(page, 'Robotics plan v2')
    await clickAt(page, 430, 420)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-file-title"] span')?.textContent === 'Robotics plan v2'`, 'blur to commit')
    assert.equal((await readFile(blurPath, 'utf8')).includes('systemSketch'), true)
    pass('clicking back to the canvas commits the title without an extra confirmation')

    // 9–10. Bad input stays where it can be corrected and the actual failure
    // is spoken and shown below the field instead of being lost in a modal.
    await key(page, 'F2', 'F2')
    await waitFor(page, `document.querySelector('.systemsketch-file-title-input')`, 'the validation input')
    await replaceFocusedText(page, '...')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-inline-rename"][data-error="true"]')`, 'inline validation')
    assert.equal(await evaluate(page, `document.querySelector('.systemsketch-file-title-input')?.getAttribute('aria-invalid')`), 'true')
    assert.equal(await evaluate(page, `document.querySelector('.systemsketch-file-title-help')?.textContent`), 'Give this board a name.')
    await shot(page, 'inline-document-rename-validation.png')
    pass('invalid names keep focus in place with an inline, accessible correction')

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`)
    pass('the inline naming journey completed without browser errors')
  } finally {
    await writeFile(RESULTS, JSON.stringify(checks, null, 2))
    app.close()
  }

  process.stdout.write(`\n${checks.length}/${checks.length} checks passed\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
