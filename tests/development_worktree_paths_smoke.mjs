#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const linkedDirectory = await mkdtemp(join(ROOT, '.systemsketch-linked-board-'))
const linkedBoard = join(linkedDirectory, 'Linked.systemsketch')
const futureBoard = join(linkedDirectory, 'Future.systemsketch')
const outsideBoard = join('/tmp', `systemsketch-outside-${process.pid}.systemsketch`)
const app = await startApp({
  label: 'systemsketch-worktree-paths',
  build: 'development-worktree-paths',
  allowSourceRoot: true,
})
const { page, port, apiPort, filesRoot } = app
const primaryWorkspace = join(filesRoot, 'SystemSketch')
const savedCopy = join(primaryWorkspace, 'Linked.systemsketch')
const futureCopyFolder = join(primaryWorkspace, 'Review copies')
const futureCopy = join(futureCopyFolder, 'Future compatible copy.systemsketch')
const futureSource = JSON.stringify({
  systemSketch: {
    formatVersion: 7,
    application: 'SystemSketch',
    shapes: {},
    bindings: {},
    futureOnly: { preserve: true },
  },
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
}, null, 2)

async function captureIfRequested() {
  const target = process.env.SYSTEMSKETCH_WORKTREE_SCREENSHOT
  if (!target) return
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(target, Buffer.from(shot.data, 'base64'))
}

try {
  await page.send('Network.enable')
  await writeFile(futureBoard, futureSource)
  await openApp(page, port, `?board=${encodeURIComponent(linkedBoard)}`)
  await waitFor(page, 'window.__systemsketch?.editor', 'the linked worktree board')
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:linked-proof',
      type: 'geo',
      x: 240,
      y: 180,
      props: { geo: 'rectangle', w: 260, h: 140, color: 'green', fill: 'semi' },
    })
  })()`)
  await waitFor(
    page,
    `['dirty', 'saving'].includes(document.querySelector('.systemsketch-file-title i')?.dataset.state)`,
    'the source-worktree board to become dirty',
  )
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'autosave into the source worktree',
  )
  await delay(200)

  const document = JSON.parse(await readFile(linkedBoard, 'utf8'))
  if (!document.records.some((record) => record.id === 'shape:linked-proof')) {
    throw new Error('the source-worktree document did not receive the saved shape')
  }

  await openApp(page, port, `?board=${encodeURIComponent(linkedBoard)}`)
  await waitFor(
    page,
    `window.__systemsketch?.editor?.getShape('shape:linked-proof')`,
    'the cold-reopened source-worktree shape',
  )

  // A direct worktree file is authorized for document operations, but its
  // parent is intentionally not a second workspace browser root. Save As must
  // therefore start in the primary workspace without first issuing a rejected
  // attempt to list the source checkout.
  const linkedSource = await readFile(linkedBoard, 'utf8')
  await key(page, 's', 'KeyS', 10)
  await waitFor(
    page,
    `document.querySelector('[data-testid="workspace-dialog"][data-mode="saveAs"]')`,
    'Save As from the source-worktree board',
  )
  assert.equal(
    await evaluate(page, `Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).at(-1)?.textContent`),
    'SystemSketch',
  )
  assert.equal(
    await evaluate(page, `document.querySelector('[data-testid="workspace-dialog"] [role="alert"]')?.textContent ?? ''`),
    '',
  )
  await captureIfRequested()
  await clickElement(page, '[data-testid="workspace-confirm"]')
  await waitFor(
    page,
    `new URLSearchParams(location.search).get('board') === ${JSON.stringify(savedCopy)}`,
    'the primary-workspace Save As copy',
  )
  assert.equal(await readFile(linkedBoard, 'utf8'), linkedSource)
  assert.equal(JSON.parse(await readFile(savedCopy, 'utf8')).systemSketch.formatVersion, 1)

  // New uses the same confined browser-home decision even though it does not
  // show the dialog. It must reserve its Untitled path under the primary root.
  await openApp(page, port, `?board=${encodeURIComponent(linkedBoard)}`)
  await waitFor(page, 'window.__systemsketch?.editor', 'the linked board before New')
  await key(page, 'n', 'KeyN', 2)
  await waitFor(
    page,
    `new URLSearchParams(location.search).get('board')?.startsWith(${JSON.stringify(`${primaryWorkspace}/Untitled`)})`,
    'a primary-workspace Untitled board',
  )

  // The protected-document action shares Save As. Exercise it independently,
  // then create a folder through the dialog: both browsing and directory
  // creation must stay in the primary root while the future original remains
  // untouched in the worktree.
  await openApp(page, port, `?board=${encodeURIComponent(futureBoard)}`)
  await waitFor(page, `document.querySelector('[data-testid="workspace-future-format"]')`, 'future worktree protection')
  await clickElement(page, '[data-testid="workspace-future-format"] button.primary')
  await waitFor(
    page,
    `document.querySelector('[data-testid="workspace-dialog"][data-mode="saveAs"]')`,
    'Create editable copy from the future worktree board',
  )
  assert.equal(
    await evaluate(page, `Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).at(-1)?.textContent`),
    'SystemSketch',
  )
  await clickElement(page, '[data-testid="workspace-new-folder"]')
  await clickElement(page, '[data-testid="workspace-new-folder-name"]')
  await page.send('Input.insertText', { text: 'Review copies' })
  await key(page, 'Enter', 'Enter')
  await waitFor(
    page,
    `Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).some((node) => node.textContent === 'Review copies')`,
    'the primary-workspace copy folder',
  )
  await clickElement(page, '[data-testid="workspace-confirm"]')
  await waitFor(
    page,
    `new URLSearchParams(location.search).get('board') === ${JSON.stringify(futureCopy)}`,
    'the primary-workspace editable copy',
  )
  assert.equal(await readFile(futureBoard, 'utf8'), futureSource)
  assert.equal(JSON.parse(await readFile(futureCopy, 'utf8')).systemSketch.formatVersion, 1)

  const listedWorktree = await fetch(
    `http://127.0.0.1:${apiPort}/api/workspace/list?dir=${encodeURIComponent(linkedDirectory)}`,
  )
  assert.equal(listedWorktree.status, 400)
  const createdInWorktree = await fetch(`http://127.0.0.1:${apiPort}/api/workspace/directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: linkedDirectory, name: 'Escaped' }),
  })
  assert.equal(createdInWorktree.status, 409)

  await writeFile(outsideBoard, await readFile(linkedBoard))
  const rejected = await fetch(
    `http://127.0.0.1:${apiPort}/api/workspace/file?path=${encodeURIComponent(outsideBoard)}`,
  )
  const rejection = await rejected.json()
  if (rejected.status !== 400 || !String(rejection.error).includes('allowed root')) {
    throw new Error(`an unrelated machine path was not rejected: ${rejected.status} ${JSON.stringify(rejection)}`)
  }

  const errors = localConsoleErrors(page)
  if (errors.length) throw new Error(`browser console errors: ${errors.join('; ')}`)
  process.stdout.write('PASS source-worktree URL opened, autosaved, and cold-reopened\n')
  process.stdout.write('PASS source-worktree Save As and New fell back to the primary workspace\n')
  process.stdout.write('PASS future worktree Create editable copy and New Folder stayed in the primary workspace\n')
  process.stdout.write('PASS worktree directory listing and creation remained rejected\n')
  process.stdout.write('PASS unrelated machine path remained rejected\n')
} finally {
  app.close()
  await rm(linkedDirectory, { recursive: true, force: true })
  await rm(outsideBoard, { force: true })
}
