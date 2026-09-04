#!/usr/bin/env node
/**
 * Real-browser proof for workspace folders and future-format compatibility copies.
 *
 * The harness gives this journey fresh app/API ports, a temporary workspace
 * root, a temporary browser profile, and scratch documents. It never reaches
 * the developer's running Preview or the user's auto-saved board.
 *
 * Run with:
 *   node tests/workspace_followup_smoke.mjs
 */
import assert from 'node:assert/strict'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { drawBlock } from './block_journey_helpers.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SHOT_FOLDER_ERROR = join(ASSETS, 'workspace-followup-folder-validation-2026-09-02.png')
const SHOT_FOLDER_CREATED = join(ASSETS, 'workspace-followup-folder-created-2026-09-02.png')
const SHOT_FUTURE = join(ASSETS, 'workspace-followup-future-protected-2026-09-02.png')
const SHOT_COMPATIBLE_DIALOG = join(ASSETS, 'reverse-compatibility-copy-dialog-2026-09-03.png')
const SHOT_COPY = join(ASSETS, 'workspace-followup-compatible-copy-2026-09-02.png')

const validCore = {
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
}

function systemSketchDocument(formatVersion = 1, extras = {}) {
  return JSON.stringify({
    systemSketch: {
      formatVersion,
      application: 'SystemSketch',
      shapes: {},
      bindings: {},
      ...extras,
    },
    ...validCore,
  }, null, 2)
}

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function insertText(page, selector, value) {
  await clickElement(page, selector)
  await page.send('Input.insertText', { text: value })
  await delay(100)
}

async function replaceText(page, selector, value) {
  await clickElement(page, selector)
  await key(page, 'a', 'KeyA', 2)
  await page.send('Input.insertText', { text: value })
  await delay(100)
}

async function waitForFile(path, predicate, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs
  let lastSource = ''
  while (Date.now() < deadline) {
    try {
      lastSource = await readFile(path, 'utf8')
      if (predicate(lastSource)) return lastSource
    } catch {
      // The first save may still be creating the file.
    }
    await delay(80)
  }
  throw new Error(`Timed out waiting for ${label}; last file was ${lastSource.length} bytes`)
}

function consoleErrors(page) {
  return page.events.filter((event) => (
    event.method === 'Runtime.exceptionThrown'
    || (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
  )).map((event) => (
    event.params.exceptionDetails?.text
    ?? event.params.args?.map((argument) => argument.value ?? argument.description).join(' ')
  ))
}

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({
    label: 'systemsketch-workspace-followup',
    build: 'workspace-followup-smoke',
    width: 1400,
    height: 940,
  })
  const { page, port, filesRoot } = app
  const workspace = join(filesRoot, 'SystemSketch')
  const currentPath = join(workspace, 'Current.systemsketch')
  const futurePath = join(workspace, 'Future.systemsketch')
  const copyPath = join(workspace, 'Future compatible copy.tldr')
  const collisionPath = join(workspace, 'Existing')
  const nestedPath = join(workspace, 'Projects', 'Sprint')
  let futureSource = ''

  await ensureDir(workspace)
  await ensureDir(ASSETS)
  await mkdir(collisionPath)
  await writeFile(currentPath, systemSketchDocument())

  try {
    await page.send('Network.enable')
    await openApp(page, port, `?board=${encodeURIComponent(currentPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the current-format board')

    // Open the app-owned workspace dialog and prove failures remain local to it.
    await key(page, 'o', 'KeyO', 2)
    await waitFor(page, `document.querySelector('[data-testid="workspace-dialog"]')`, 'workspace dialog')
    await clickElement(page, '[data-testid="workspace-new-folder"]')
    await insertText(page, '[data-testid="workspace-new-folder-name"]', 'Existing')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('[role="alert"]')?.textContent.includes('already exists')`, 'folder collision error')
    assert.equal(await evaluate(page, 'location.search'), `?board=${encodeURIComponent(currentPath)}`)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-new-folder-name"]'))`), true)
    await capture(page, SHOT_FOLDER_ERROR)
    pass('a colliding folder name reports inline without closing or navigating the workspace dialog')

    await key(page, 'Escape', 'Escape')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-dialog"]'))`), true)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-new-folder-name"]'))`), false)
    pass('Escape cancels only the inline folder form and leaves the workspace dialog open')

    await clickElement(page, '[data-testid="workspace-new-folder"]')
    await insertText(page, '[data-testid="workspace-new-folder-name"]', 'escape/outside')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('[role="alert"]')?.textContent.includes('path separator')`, 'invalid folder error')
    assert.equal(await exists(join(workspace, 'escape')), false)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-dialog"]'))`), true)
    pass('an invalid traversal-like folder name is contained and cannot escape the temporary workspace root')

    await key(page, 'Escape', 'Escape')
    await clickElement(page, '[data-testid="workspace-new-folder"]')
    await insertText(page, '[data-testid="workspace-new-folder-name"]', 'Projects')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).some((node) => node.textContent === 'Projects')`, 'Projects folder')
    assert.equal(await exists(join(workspace, 'Projects')), true)

    await clickElement(page, '[data-testid="workspace-new-folder"]')
    await insertText(page, '[data-testid="workspace-new-folder-name"]', 'Sprint')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).some((node) => node.textContent === 'Sprint')`, 'nested Sprint folder')
    assert.equal(await exists(nestedPath), true)
    await capture(page, SHOT_FOLDER_CREATED)
    pass('Enter creates nested folders, enters each one, and never activates an unrelated selected row')

    await clickElement(page, '[data-testid="workspace-new-folder"]')
    await insertText(page, '[data-testid="workspace-new-folder-name"]', 'Cancelled')
    await key(page, 'Escape', 'Escape')
    assert.equal(await exists(join(nestedPath, 'Cancelled')), false)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-dialog"]'))`), true)
    pass('Escape does not create the partially entered folder')

    // Seed a real SystemSketch Block, then turn only its envelope into a newer
    // version. The regression path must lower this visible custom shape into
    // stock records, not merely relabel the outer wrapper.
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="workspace-dialog"]')`, 'the workspace dialog to close')
    await drawBlock(page, { x: 340, y: 270 }, { x: 650, y: 440 }, 'future source')
    const seededSource = await waitForFile(
      currentPath,
      (source) => {
        try {
          return JSON.parse(source).records?.some((record) => (
            record.typeName === 'shape' && record.type === 'block' && record.props?.title === 'future source'
          ))
        } catch {
          return false
        }
      },
      'the source Block to autosave',
    )
    const seededDocument = JSON.parse(seededSource)
    futureSource = JSON.stringify({
      ...seededDocument,
      systemSketch: {
        ...seededDocument.systemSketch,
        formatVersion: 7,
        futureOnly: { retainedByOriginal: true },
      },
    }, null, 2)
    await writeFile(futurePath, futureSource)

    // Now open a parseable newer document. Its source bytes are protected
    // while the visible board is available for the compatible-copy transform.
    await openApp(page, port, `?board=${encodeURIComponent(futurePath)}`)
    await waitFor(page, `document.querySelector('[data-testid="workspace-future-format"]')`, 'future-format protection')
    assert.equal(await evaluate(page, 'window.__systemsketch.editor.getInstanceState().isReadonly'), true)
    assert.equal(await readFile(futurePath, 'utf8'), futureSource)
    assert.match(
      await evaluate(page, `document.querySelector('[data-testid="workspace-future-format"]').innerText`),
      /original remains byte-for-byte untouched/i,
    )

    // Try a real canvas gesture: the protected original must reject it and
    // remain byte-identical while the board is being inspected.
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 320, y: 250 }, { x: 610, y: 420 })
    await delay(900)
    assert.equal(await evaluate(page, 'window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === "block").length'), 1)
    assert.equal(await readFile(futurePath, 'utf8'), futureSource)
    await capture(page, SHOT_FUTURE)
    pass('a valid future-format document opens for inspection while its original remains read-only and byte-exact')

    await clickElement(page, '[data-testid="workspace-make-compatible-copy"]')
    await waitFor(page, `document.querySelector('[data-testid="workspace-dialog"][data-mode="portableCopy"]')`, 'compatibility-copy dialog')
    assert.equal(
      await evaluate(page, `document.querySelector('#workspace-dialog-title')?.textContent`),
      'Make compatible copy',
    )
    assert.match(
      await evaluate(page, `document.querySelector('[data-testid="workspace-compatible-copy-explanation"]')?.textContent`),
      /editable stock tldraw primitives/i,
    )
    assert.equal(
      await evaluate(page, `document.querySelector('input[aria-label="File name"]').value`),
      'Future compatible copy',
    )
    await capture(page, SHOT_COMPATIBLE_DIALOG)
    await clickElement(page, '[data-testid="workspace-confirm"]')
    await waitFor(page, `new URLSearchParams(location.search).get('board')?.endsWith('Future compatible copy.tldr')`, 'compatibility copy')
    await waitFor(page, 'window.__systemsketch?.editor', 'editable compatibility-copy board')

    const initialCopySource = await waitForFile(
      copyPath,
      (source) => {
        try {
          const parsed = JSON.parse(source)
          return parsed.systemSketch === undefined
            && parsed.records?.some((record) => record.typeName === 'shape' && record.type === 'group')
        } catch {
          return false
        }
      },
      'portable compatibility copy',
    )
    const initialCopy = JSON.parse(initialCopySource)
    assert.equal(initialCopy.systemSketch, undefined)
    assert.equal(initialCopy.records.some((record) => record.typeName === 'shape' && record.type === 'block'), false)
    assert.equal(initialCopy.records.some((record) => record.typeName === 'shape' && record.type === 'group'), true)
    assert.equal(await readFile(futurePath, 'utf8'), futureSource)
    assert.equal(await evaluate(page, 'window.__systemsketch.editor.getInstanceState().isReadonly'), false)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-future-format"]'))`), false)
    pass('Make compatible copy opens a separate stock .tldr of primitives and does not overwrite the original')

    await drawBlock(page, { x: 340, y: 270 }, { x: 650, y: 440 }, 'editable compatibility copy')
    await waitFor(page, `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`, 'copy autosave')
    const editedCopySource = await waitForFile(
      copyPath,
      (source) => {
        try {
          return JSON.parse(source).records?.some((record) => (
            record.typeName === 'shape'
            && record.type === 'block'
            && record.props?.title === 'editable compatibility copy'
          ))
        } catch {
          return false
        }
      },
      'the edited copy autosave',
    )
    assert.notEqual(editedCopySource, initialCopySource)
    assert.equal(await readFile(futurePath, 'utf8'), futureSource)
    await capture(page, SHOT_COPY)
    assert.equal(JSON.parse(editedCopySource).systemSketch, undefined)
    pass('the portable compatibility copy accepts a real Block edit and saves normally while the future original stays untouched')

    const handledDirectoryFailures = page.events.filter((event) => (
      event.method === 'Network.responseReceived'
      && event.params.response.url.endsWith('/api/workspace/directory')
      && event.params.response.status >= 400
    )).map((event) => event.params.response.status)
    assert.deepEqual(handledDirectoryFailures, [409, 409])

    const errors = consoleErrors(page)
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`)
    pass('the two expected validation responses are contained and the full journey raises zero console errors')

    console.log(`\n${checks.length} workspace follow-up checks passed.`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
