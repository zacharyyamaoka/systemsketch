#!/usr/bin/env node
/**
 * Real-browser proof for board-owned local comments.
 *
 * The app, browser profile, workspace, and boards are all throwaway. This
 * journey creates a real Block through the canvas, comments on it through the
 * right panel, proves the records reached disk and survive a reload, then
 * opens a future-format copy to prove inspection remains available while the
 * composer is protected.
 *
 * Run with:
 *   node tests/local_comments_smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
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
import { drawBlock } from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const COMMENT_SHOT = join(SHOTS, 'repo-improvements-local-comments.png')
const READ_ONLY_SHOT = join(SHOTS, 'repo-improvements-local-comments-readonly.png')
const COMMENT_BODY = 'Check decoder assumptions before merging.'
const REPLY_BODY = 'Confirmed against the compact fixture.'
const POINT_BODY = 'Review the flow around this canvas area.'
const SOURCE_REFERENCE = 'src/pipeline.py:24-31#decode_packet'
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function submitWithCtrlEnter(page) {
  const event = {
    key: 'Enter',
    code: 'Enter',
    modifiers: 2,
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  }
  await page.send('Input.dispatchKeyEvent', { ...event, type: 'rawKeyDown' })
  await page.send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' })
  await delay(120)
}

async function waitForFile(path, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let source = ''
  while (Date.now() < deadline) {
    try {
      source = await readFile(path, 'utf8')
      if (predicate(source)) return source
    } catch {
      // The first debounced autosave may not have created the board yet.
    }
    await delay(90)
  }
  throw new Error(`Timed out waiting for ${label}; last file was ${source.length} bytes`)
}

async function waitForDownload(directory, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const entries = await readdir(directory)
    const name = entries.find((entry) => entry.endsWith('.tldr'))
    if (name && !entries.includes(`${name}.crdownload`)) return join(directory, name)
    await delay(90)
  }
  throw new Error('Timed out waiting for the portable .tldr download')
}

async function openComments(page) {
  const selector = '[title="Comments and inspector"]'
  await clickElement(page, selector)
  await waitFor(
    page,
    `document.querySelector('[data-testid="systemsketch-comments-panel"]')`,
    'local Comments panel',
  )
}

async function commentRecords(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const records = window.__systemsketch.editor.store.allRecords()
      .filter((record) => record.typeName === 'comment-thread' || record.typeName === 'comment')
    return JSON.stringify(records)
  })()`))
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-local-comments',
    build: 'local-comments-smoke',
    width: 1440,
    height: 940,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'local-comments.systemsketch')
  const futureBoard = join(app.filesRoot, 'SystemSketch', 'local-comments-future.systemsketch')
  const downloads = join(app.filesRoot, 'downloads')
  await ensureDir(join(app.filesRoot, 'SystemSketch'))
  await ensureDir(downloads)
  await app.page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })

  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor`, 'development editor seam', 30_000)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-preview-mode"]')`,
      'Preview banner',
      30_000,
    )
    await delay(700)

    await drawBlock(
      app.page,
      { x: 330, y: 250 },
      { x: 710, y: 470 },
      'Decode telemetry',
    )
    const blockId = await evaluate(
      app.page,
      `window.__systemsketch.editor.getOnlySelectedShape()?.id ?? null`,
    )
    assert.match(blockId, /^shape:/)
    pass('a Block is created through the real canvas and remains the selected comment subject')

    await openComments(app.page)
    assert.match(
      await evaluate(
        app.page,
        `document.querySelector('.systemsketch-comments__anchor-hint').textContent`,
      ),
      /selected shape/i,
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__composer textarea').labels[0].textContent`),
      'New comment',
    )
    pass('the accessible composer explicitly reports that it will anchor to the selected shape')

    await clickElement(app.page, '.systemsketch-comments__composer textarea')
    await typeSlowly(app.page, COMMENT_BODY)
    await clickElement(app.page, '.systemsketch-comments__composer input')
    await typeSlowly(app.page, SOURCE_REFERENCE)
    await clickElement(app.page, '.systemsketch-comments__composer textarea')
    assert.deepEqual(
      JSON.parse(await evaluate(app.page, `(() => {
        const form = document.querySelector('.systemsketch-comments__composer')
        return JSON.stringify({
          body: form.querySelector('textarea').value,
          source: form.querySelector('input').value,
          disabled: form.querySelector('button').disabled,
          active: document.activeElement === form.querySelector('textarea'),
        })
      })()`)),
      { body: COMMENT_BODY, source: SOURCE_REFERENCE, disabled: false, active: true },
    )
    await clickElement(app.page, '.systemsketch-comments__compose-actions button')
    await delay(300)
    const submitExceptions = app.page.events.filter((event) => event.method === 'Runtime.exceptionThrown')
    assert.deepEqual(submitExceptions, [], `comment submit errors: ${JSON.stringify(submitExceptions)}`)
    await waitFor(
      app.page,
      `document.querySelectorAll('.systemsketch-comments__thread').length === 1`,
      'new Block comment',
    )
    assert.match(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__thread').innerText`),
      new RegExp(COMMENT_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__source code').textContent`),
      SOURCE_REFERENCE,
    )
    const createdRecords = await commentRecords(app.page)
    const thread = createdRecords.find((record) => record.typeName === 'comment-thread')
    assert.equal(thread.anchor.type, 'shape')
    assert.equal(thread.anchor.shapeId, blockId)
    assert.equal(thread.meta.systemSketchSource.path, 'src/pipeline.py')
    assert.equal(thread.meta.systemSketchSource.startLine, 24)
    assert.equal(thread.meta.systemSketchSource.endLine, 31)
    assert.equal(thread.meta.systemSketchSource.symbol, 'decode_packet')
    pass('the composer creates official comment records anchored to the Block with typed Python provenance')

    await clickElement(app.page, '.systemsketch-comments__reply textarea')
    await typeSlowly(app.page, REPLY_BODY)
    await submitWithCtrlEnter(app.page)
    await waitFor(
      app.page,
      `document.querySelectorAll('.systemsketch-comments__messages li').length === 2`,
      'comment reply',
    )
    assert.match(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__messages').innerText`),
      new RegExp(REPLY_BODY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    )
    pass('a keyboard-submitted reply joins the same flat local thread')

    await clickElement(app.page, '.systemsketch-comments__thread-actions button:first-child')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-comments__empty')?.textContent.includes('No open comments')`,
      'resolved-thread empty state',
    )
    await clickElement(app.page, '.systemsketch-comments__resolved-toggle input')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-comments__thread')?.hasAttribute('data-resolved')`,
      'resolved thread reveal',
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__status').textContent`),
      'Resolved',
    )
    await clickElement(app.page, '.systemsketch-comments__thread-actions button:first-child')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-comments__status')?.textContent === 'Open'`,
      'reopened thread',
    )
    pass('Resolve hides a completed thread by default; Show resolved and Reopen restore it')

    await capture(app.page, COMMENT_SHOT)

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToBounds({ x: 2400, y: 1800, w: 300, h: 220 }, { animation: { duration: 0 } })
      return true
    })()`)
    await delay(250)
    await clickElement(app.page, '.systemsketch-comments__anchor')
    await waitFor(
      app.page,
      `window.__systemsketch.editor.getOnlySelectedShape()?.id === ${JSON.stringify(blockId)}`,
      'comment reveal navigation',
    )
    assert.equal(
      await evaluate(
        app.page,
        `document.querySelector('[data-testid="systemsketch-right-popout"]')?.dataset.surface`,
      ),
      'inspector',
    )
    pass('clicking the thread location selects and camera-reveals its Block, handing the dock to Inspector')

    const savedSource = await waitForFile(
      board,
      (source) => source.includes('comment-thread')
        && source.includes(COMMENT_BODY)
        && source.includes(REPLY_BODY),
      'comment records to reach the scratch board',
    )
    const saved = JSON.parse(savedSource)
    const savedThreads = saved.records.filter((record) => record.typeName === 'comment-thread')
    const savedComments = saved.records.filter((record) => record.typeName === 'comment')
    assert.equal(savedThreads.length, 1)
    assert.equal(savedComments.length, 2)
    pass('debounced workspace autosave persists one thread and both messages into .systemsketch')

    await clickElement(app.page, '[data-testid="systemsketch-share-button"]')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="export-portable-tldr"]')`,
      'portable export action',
    )
    await clickElement(app.page, '[data-testid="export-portable-tldr"]')
    const portablePath = await waitForDownload(downloads)
    const portable = JSON.parse(await readFile(portablePath, 'utf8'))
    assert.equal(
      portable.records.some((record) => (
        record.typeName === 'comment'
        || record.typeName === 'comment-thread'
        || record.typeName === 'comment-reaction'
      )),
      false,
    )
    assert.equal((await commentRecords(app.page)).length, 3)
    pass('portable .tldr strips local discussion while the live .systemsketch thread remains intact')

    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor`, 'reloaded editor seam', 30_000)
    await delay(650)
    await openComments(app.page)
    await waitFor(
      app.page,
      `document.querySelectorAll('.systemsketch-comments__messages li').length === 2`,
      'reloaded comment thread',
    )
    assert.equal((await commentRecords(app.page)).length, 3)
    assert.match(
      await evaluate(app.page, `document.querySelector('.systemsketch-comments__thread').innerText`),
      /Check decoder assumptions[\s\S]*Confirmed against the compact fixture/,
    )
    pass('the official records reload into the same Block thread with source reference and reply intact')

    const viewportCenter = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      const center = editor.getViewportPageBounds().center
      return JSON.stringify({ x: center.x, y: center.y })
    })()`))
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-comments__anchor-hint')?.textContent.includes('centre of the current view')`,
      'viewport-centre comment hint',
    )
    await clickElement(app.page, '.systemsketch-comments__composer textarea')
    await typeSlowly(app.page, POINT_BODY)
    await clickElement(app.page, '.systemsketch-comments__compose-actions button')
    await waitFor(
      app.page,
      `Array.from(document.querySelectorAll('.systemsketch-comments__anchor'))
        .some((node) => node.textContent.includes('Canvas point'))`,
      'canvas-point comment',
    )
    const pointThread = (await commentRecords(app.page)).find(
      (record) => record.typeName === 'comment-thread' && record.anchor.type === 'point',
    )
    assert.ok(pointThread)
    assert.ok(Math.abs(pointThread.anchor.x - viewportCenter.x) < 0.001)
    assert.ok(Math.abs(pointThread.anchor.y - viewportCenter.y) < 0.001)
    pass('without a selection, compose creates a spatial pin at the current viewport centre')

    await waitForFile(
      board,
      (source) => source.includes(POINT_BODY),
      'the canvas-point comment to finish autosaving before navigation',
    )

    const future = JSON.parse(savedSource)
    future.systemSketch.formatVersion += 1
    await writeFile(futureBoard, JSON.stringify(future))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(futureBoard)}`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="workspace-future-format"]')`,
      'future-format protection',
      30_000,
    )
    await openComments(app.page)
    assert.ok(await evaluate(app.page, `Boolean(document.querySelector('.systemsketch-comments__readonly'))`))
    assert.equal(await evaluate(app.page, `document.querySelector('.systemsketch-comments__composer')`), null)
    assert.equal(
      await evaluate(app.page, `document.querySelectorAll('.systemsketch-comments__messages li').length`),
      2,
    )
    assert.equal(
      await evaluate(app.page, `window.__systemsketch.editor.getInstanceState().isReadonly`),
      true,
    )
    await capture(app.page, READ_ONLY_SHOT)
    pass('a future-format copy keeps comments inspectable while removing every comment mutation control')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the complete comments journey emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} checks passed\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
