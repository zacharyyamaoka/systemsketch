#!/usr/bin/env node
/** Real-browser proof for occurrence-local title renames and FIFO Draft promotion. */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'

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
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'definition-title-draft-promotion-live-2026-09-05.png')
const { checks, pass } = makeChecklist()

async function block(page, id) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape(${JSON.stringify(id)})?.props ?? null)`))
}

async function focusTitle(page, id) {
  await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(id)}); return true })()`)
  await waitFor(page, `document.querySelector('[aria-label="Block title"]')`, `${id} title field`)
  await clickElement(page, '[aria-label="Block title"]')
  await shortcut(page, 'a', 'KeyA', 2)
}

async function finishTitle(page, title) {
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
}

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({
    label: 'systemsketch-definition-title-draft-promotion',
    build: 'definition-title-draft-promotion-smoke',
    width: 1500,
    height: 1000,
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'the SystemSketch editor')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      const base = editor.getShapeUtil('block').getDefaultProps()
      const item = (id, x, y, title, description, definitionId, definitionKey, draftOrdinal) => ({
        id: 'shape:' + id,
        type: 'block',
        x, y,
        props: {
          ...base,
          title,
          description,
          definitionId,
          definitionKey,
          ...(draftOrdinal === undefined ? {} : { draftOrdinal }),
        },
      })
      editor.createShapes([
        item('component-c', 80, 80, 'ComponentC', 'shared body', 'definition-component', 'ComponentC'),
        item('component-e', 540, 80, 'ComponentC', 'shared body', 'definition-component', 'ComponentC'),
        item('lone-draft', 1000, 80, 'orphan()', 'only body with this name', 'definition-orphan-draft', 'orphan_draft_4', 4),
        item('rename-main', 80, 390, 'queue()', 'canonical queue body', 'definition-queue-main', 'queue'),
        item('rename-draft-1', 540, 390, 'queue()', 'first queued body', 'definition-queue-draft-1', 'queue_draft_1', 1),
        item('rename-draft-2', 1000, 390, 'queue()', 'second queued body', 'definition-queue-draft-2', 'queue_draft_2', 2),
        item('delete-main', 80, 700, 'delete_queue()', 'canonical delete body', 'definition-delete-main', 'delete_queue'),
        item('delete-draft-1', 540, 700, 'delete_queue()', 'first delete body', 'definition-delete-draft-1', 'delete_queue_draft_1', 1),
        item('delete-draft-2', 1000, 700, 'delete_queue()', 'second delete body', 'definition-delete-draft-2', 'delete_queue_draft_2', 2),
      ])
      return true
    })()`)
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:rename-draft-1')?.props.draftOrdinal === 1
        && window.__systemsketch.editor.getShape('shape:rename-draft-2')?.props.draftOrdinal === 2`,
      'the ordered rename drafts')
    pass('same-name, different-content Definitions keep stable Draft 1 / Draft 2 positions')

    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:lone-draft')?.props.draftOrdinal === undefined
        && window.__systemsketch.editor.getShape('shape:lone-draft')?.props.definitionKey === 'orphan'`,
      'the lone stale Draft to become canonical')
    pass('a Draft that is already the only Definition with its name is promoted on reconciliation')

    const beforeLeft = await block(page, 'shape:component-c')
    const beforeRight = await block(page, 'shape:component-e')
    assert.equal(beforeLeft.definitionId, beforeRight.definitionId)

    await focusTitle(page, 'shape:component-e')
    await page.send('Input.insertText', { text: 'ComponentE' })
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:component-e')?.props.title === 'ComponentE'
        && window.__systemsketch.editor.getShape('shape:component-c')?.props.title === 'ComponentC'`,
      'the rename to stay on one occurrence while typing')
    assert.equal((await block(page, 'shape:component-e')).definitionId, beforeLeft.definitionId)
    pass('title keystrokes never broadcast to a linked occurrence')

    await key(page, 'Enter', 'Enter')
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:component-e')?.props.definitionId
        !== window.__systemsketch.editor.getShape('shape:component-c')?.props.definitionId`,
      'the renamed occurrence to leave the old Definition')
    assert.equal((await block(page, 'shape:component-c')).title, 'ComponentC')
    assert.equal((await block(page, 'shape:component-e')).definitionKey, 'ComponentE')
    pass('finishing the distinct title gives only that occurrence a fresh Definition')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.updateShape({ id: 'shape:component-e', type: 'block', props: { description: 'now independent' } })
      return true
    })()`)
    await delay(100)
    assert.equal((await block(page, 'shape:component-e')).description, 'now independent')
    assert.equal((await block(page, 'shape:component-c')).description, 'shared body')
    pass('shared semantic edits stop crossing the rename-created Definition boundary')

    await focusTitle(page, 'shape:rename-main')
    await finishTitle(page, 'retired_queue()')
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:rename-draft-1')?.props.draftOrdinal === undefined
        && window.__systemsketch.editor.getShape('shape:rename-draft-1')?.props.definitionKey === 'queue'`,
      'Draft 1 to be promoted after the canonical rename')
    const renameDraft2 = await block(page, 'shape:rename-draft-2')
    assert.equal(renameDraft2.draftOrdinal, 2)
    assert.equal(renameDraft2.definitionKey, 'queue_draft_2')
    pass('renaming the canonical Definition promotes the lowest Draft and keeps later numbers stable')

    await evaluate(page, `(() => {
      window.__systemsketch.editor.deleteShapes(['shape:delete-main'])
      return true
    })()`)
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:delete-draft-1')?.props.draftOrdinal === undefined
        && window.__systemsketch.editor.getShape('shape:delete-draft-1')?.props.definitionKey === 'delete_queue'`,
      'Draft 1 to be promoted after deletion')
    assert.equal((await block(page, 'shape:delete-draft-2')).draftOrdinal, 2)
    pass('deleting the canonical Definition uses the same lowest-Draft promotion rule')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(250)
    await page.send('Page.captureScreenshot', { format: 'png' }).then(async ({ data }) => {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(SHOT, Buffer.from(data, 'base64'))
    })
    assert.deepEqual(await localConsoleErrors(page), [])
    pass('the focused real-browser journey finishes without console errors')

    console.log(`definition title + draft promotion smoke · ${checks.length} checks passed`)
    console.log(`screenshot · ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
