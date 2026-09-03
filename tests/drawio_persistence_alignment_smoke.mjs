#!/usr/bin/env node
/**
 * Real-browser proof for the draw.io-inspired preserve-both conflict path.
 *
 * The contested source is changed directly on disk before a local edit. The
 * local autosave must stop at the digest fence, then Make Copy must preserve
 * both exact external bytes and the unsaved local canvas revision.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const screenshotPath = join(ROOT, 'docs', 'assets', 'drawio-conflict-make-copy.png')

const emptyDocument = {
  systemSketch: {
    formatVersion: 2,
    application: 'SystemSketch',
    shapes: {},
    bindings: {},
  },
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
}

const app = await startApp({
  label: 'systemsketch-drawio-alignment',
  build: 'drawio-persistence-alignment',
  width: 1440,
  height: 960,
})
const { page, port, filesRoot } = app
const workspace = join(filesRoot, 'SystemSketch')
const contestedPath = join(workspace, 'Contested.systemsketch')
const copyPath = join(workspace, 'Contested local copy.systemsketch')
const initialSource = JSON.stringify(emptyDocument)
// Same valid document but intentionally different exact bytes. The digest,
// rather than timestamp or parsed equality, is the revision fence under test.
const externalSource = JSON.stringify(emptyDocument, null, 2) + '\n'

async function waitForPausedWrite(afterIndex) {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    for (let index = afterIndex; index < page.events.length; index += 1) {
      const event = page.events[index]
      if (
        event.method === 'Fetch.requestPaused'
        && event.params.request.method === 'POST'
        && event.params.request.url.endsWith('/api/workspace/file')
      ) return { index, requestId: event.params.requestId }
    }
    await delay(40)
  }
  throw new Error('Timed out waiting for a paused workspace write')
}

try {
  await ensureDir(workspace)
  await ensureDir(join(ROOT, 'docs', 'assets'))
  await writeFile(contestedPath, initialSource)
  await page.send('Network.enable')
  await openApp(page, port, `?board=${encodeURIComponent(contestedPath)}`)
  await waitFor(page, 'window.__systemsketch?.editor', 'the contested board')
  process.stdout.write('READY contested board opened\n')

  await writeFile(contestedPath, externalSource)
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:local-proof',
      type: 'geo',
      x: 260,
      y: 190,
      props: { geo: 'rectangle', w: 320, h: 180, color: 'orange', fill: 'semi' },
    })
  })()`)

  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'conflict'`,
    'the digest conflict',
  )
  process.stdout.write('READY digest conflict shown\n')
  const expectedConflictErrors = localConsoleErrors(page)
  assert.ok(
    expectedConflictErrors.some((message) => /409 \(Conflict\)/.test(message)),
    'the digest fence did not surface the expected HTTP conflict',
  )
  // The rejected autosave is the behavior under test. Start the console-error
  // audit after acknowledging that one expected transport entry.
  page.events.length = 0
  assert.equal(await readFile(contestedPath, 'utf8'), externalSource)
  assert.equal(
    await evaluate(page, `document.querySelector('[data-testid="workspace-conflict-overwrite"]')?.textContent.trim()`),
    'Overwrite disk version',
  )

  await clickElement(page, '[data-testid="workspace-conflict-make-copy"]')
  await waitFor(
    page,
    `document.querySelector('[data-testid="workspace-dialog"][data-mode="saveAs"]')`,
    'the preserve-version dialog',
  )
  process.stdout.write('READY preserve-version dialog shown\n')
  assert.equal(
    await evaluate(page, `document.querySelector('#workspace-dialog-title')?.textContent.trim()`),
    'Preserve your version',
  )
  assert.equal(
    await evaluate(page, `document.querySelector('input[aria-label="File name"]')?.value`),
    'Contested local copy',
  )

  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'))

  // Hold Make Copy at the real request boundary, then edit the mounted canvas.
  // The saved snapshot may finish first, but that later edit must remain dirty
  // and follow the editor onto the new file identity.
  await page.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/workspace/file', requestStage: 'Request' }],
  })
  let eventCursor = page.events.length
  await clickElement(page, '[data-testid="workspace-confirm"]')
  const copyWrite = await waitForPausedWrite(eventCursor)
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:during-make-copy', type: 'geo', x: 260, y: 420,
      props: { geo: 'rectangle', w: 320, h: 150, color: 'green', fill: 'semi' },
    })
  })()`)
  await page.send('Fetch.continueRequest', { requestId: copyWrite.requestId })
  await page.send('Fetch.disable')
  process.stdout.write('READY separate-copy save submitted\n')
  await waitFor(
    page,
    `new URLSearchParams(location.search).get('board') === ${JSON.stringify(copyPath)}`,
    'the separate local copy',
  )
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'the edit made during Make Copy to reach the new path',
  )

  assert.equal(
    await readFile(contestedPath, 'utf8'),
    externalSource,
    'Make Copy changed the external disk revision',
  )
  const copied = JSON.parse(await readFile(copyPath, 'utf8'))
  assert.ok(
    copied.records.some((record) => record.id === 'shape:local-proof'),
    'the separate copy lost the local canvas revision',
  )
  assert.ok(
    copied.records.some((record) => record.id === 'shape:during-make-copy'),
    'the separate copy lost an edit made while its first write was in flight',
  )

  // draw.io's shadowModified flag keeps edits made during a write dirty. Hold
  // the actual HTTP request at the browser boundary and prove SystemSketch's
  // epoch fence emits a second complete revision instead of losing that edit.
  await waitFor(page, 'window.__systemsketch?.editor', 'the copied board after navigation')
  await page.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/workspace/file', requestStage: 'Request' }],
  })
  eventCursor = page.events.length
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:before-paused-save', type: 'geo', x: 620, y: 190,
      props: { geo: 'rectangle', w: 220, h: 120, color: 'blue', fill: 'semi' },
    })
  })()`)
  const firstWrite = await waitForPausedWrite(eventCursor)
  eventCursor = firstWrite.index + 1
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:during-paused-save', type: 'geo', x: 620, y: 360,
      props: { geo: 'rectangle', w: 220, h: 120, color: 'green', fill: 'semi' },
    })
  })()`)
  await page.send('Fetch.continueRequest', { requestId: firstWrite.requestId })
  const secondWrite = await waitForPausedWrite(eventCursor)
  await page.send('Fetch.continueRequest', { requestId: secondWrite.requestId })
  await page.send('Fetch.disable')
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'the follow-up revision after the paused save',
  )
  const afterPausedSave = JSON.parse(await readFile(copyPath, 'utf8'))
  assert.ok(afterPausedSave.records.some((record) => record.id === 'shape:before-paused-save'))
  assert.ok(afterPausedSave.records.some((record) => record.id === 'shape:during-paused-save'))

  // Simulate the HTTP-only ambiguity draw.io's raw Electron save does not
  // have: disk commits B, but the browser loses B's response. Then author C
  // before retry. The client must replay exact B/A, accept its digest, and only
  // then save C/B; sending C/A would create a false self-conflict.
  await page.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/workspace/file', requestStage: 'Response' }],
  })
  eventCursor = page.events.length
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:committed-before-response-loss', type: 'geo', x: 900, y: 190,
      props: { geo: 'rectangle', w: 220, h: 120, color: 'violet', fill: 'semi' },
    })
  })()`)
  const lostResponse = await waitForPausedWrite(eventCursor)
  await page.send('Fetch.failRequest', {
    requestId: lostResponse.requestId,
    errorReason: 'ConnectionClosed',
  })
  await page.send('Fetch.disable')
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'error'`,
    'the intentionally lost save response',
  )
  // Lose the first exact replay response as well. Its next backoff is three
  // seconds, long enough for the 1.5-second disk watcher to observe B. The
  // watcher must defer to the pending B/A replay instead of calling B external.
  await page.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/workspace/file', requestStage: 'Response' }],
  })
  eventCursor = page.events.length
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:edited-after-response-loss', type: 'geo', x: 900, y: 360,
      props: { geo: 'rectangle', w: 220, h: 120, color: 'red', fill: 'semi' },
    })
  })()`)
  const lostReplayResponse = await waitForPausedWrite(eventCursor)
  await page.send('Fetch.failRequest', {
    requestId: lostReplayResponse.requestId,
    errorReason: 'ConnectionClosed',
  })
  await page.send('Fetch.disable')
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'error'`,
    'the intentionally lost exact-replay response',
  )
  await delay(1_800)
  assert.equal(
    await evaluate(page, `document.querySelector('.systemsketch-file-title i')?.dataset.state`),
    'error',
    'the disk watcher manufactured a conflict while an exact replay was pending',
  )
  page.events.length = 0
  try {
    await waitFor(
      page,
      `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
      'the exact replay followed by the newer revision',
    )
  } catch (error) {
    const visibleState = await evaluate(page, `(() => {
      const indicator = document.querySelector('.systemsketch-file-title i')
      return { state: indicator?.dataset.state, text: indicator?.textContent, title: indicator?.title }
    })()`)
    const idsOnDisk = JSON.parse(await readFile(copyPath, 'utf8')).records.map((record) => record.id)
    const transport = page.events.filter((event) => (
      event.method === 'Fetch.requestPaused'
      || event.method === 'Network.loadingFailed'
      || event.method === 'Network.responseReceived'
    )).slice(-12).map((event) => ({ method: event.method, params: event.params }))
    throw new Error(`${error.message}; state=${JSON.stringify(visibleState)}; ids=${JSON.stringify(idsOnDisk)}; transport=${JSON.stringify(transport)}`)
  }
  const afterResponseLoss = JSON.parse(await readFile(copyPath, 'utf8'))
  assert.ok(afterResponseLoss.records.some(
    (record) => record.id === 'shape:committed-before-response-loss',
  ))
  assert.ok(afterResponseLoss.records.some(
    (record) => record.id === 'shape:edited-after-response-loss',
  ))

  const errors = localConsoleErrors(page)
  assert.deepEqual(errors, [], `browser console errors: ${errors.join('; ')}`)
  process.stdout.write('PASS digest conflict stopped automatic overwrite\n')
  process.stdout.write('PASS Make Copy preserved external bytes and the local canvas revision\n')
  process.stdout.write('PASS an edit made during Make Copy stayed dirty and reached the new path\n')
  process.stdout.write('PASS an edit made during a paused save landed in the follow-up revision\n')
  process.stdout.write('PASS disk polling deferred to an exact replay throughout retry backoff\n')
  process.stdout.write('PASS response-lost B replayed before newer edit C without a false conflict\n')
  process.stdout.write(`PASS screenshot ${screenshotPath}\n`)
} finally {
  app.close()
}
