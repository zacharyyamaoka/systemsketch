#!/usr/bin/env node
/** Real-browser proof for automatic Definition linking, drafts, and explicit unlinking. */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'definition-linking-live-2026-09-02.png')
const { checks, pass } = makeChecklist()

async function state(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const blocks = editor.getCurrentPageShapesSorted().filter((shape) => shape.type === 'block')
    return JSON.stringify(blocks.map((shape) => ({
      id: shape.id,
      parentId: shape.parentId,
      title: shape.props.title,
      description: shape.props.description,
      definitionId: shape.props.definitionId,
      definitionKey: shape.props.definitionKey,
      draftOrdinal: shape.props.draftOrdinal ?? null,
    })))
  })()`))
}

async function shapeBox(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    if (!bounds) return null
    const a = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
  })()`)
  return value ? JSON.parse(value) : null
}

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({ label: 'systemsketch-definition-linking', build: 'definition-linking-smoke' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'the SystemSketch editor')
    await delay(500)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const base = editor.getShapeUtil('block').getDefaultProps()
      const expanded = (title, description, definitionId) => ({
        ...base,
        title,
        description,
        view: 'expanded',
        w: base.views.expanded.w,
        h: base.views.expanded.h,
        definitionId,
        definitionKey: title.replace(/\\(\\)$/, ''),
      })
      editor.createShapes([
        { id: 'shape:run-main', type: 'block', x: 80, y: 80, props: expanded('run()', 'canonical body', 'definition-run-main') },
        { id: 'shape:run-collision', type: 'block', x: 720, y: 80, props: expanded('run()', 'experimental body', 'definition-run-collision') },
        { id: 'shape:inner-main', type: 'block', parentId: 'shape:run-main', x: 80, y: 110,
          props: { ...base, title: 'decode()', description: 'inside the shared body', definitionId: 'definition-decode', definitionKey: 'decode' } },
        { id: 'shape:rename-target', type: 'block', x: 80, y: 1120,
          props: { ...base, title: 'target_name()', description: 'same rename content', definitionId: 'definition-rename-target', definitionKey: 'target_name' } },
        { id: 'shape:rename-source', type: 'block', x: 460, y: 1120,
          props: { ...base, title: 'temporary_name()', description: 'same rename content', definitionId: 'definition-rename-source', definitionKey: 'temporary_name' } },
      ])
      editor.select('shape:run-main').duplicateShapes(['shape:run-main'], { x: 0, y: 520 })
    })()`)

    await waitFor(page,
      `document.querySelectorAll('[data-definition-id="definition-run-main"]').length === 2`,
      'two linked run() occurrences')
    await waitFor(page,
      `document.querySelector('[data-definition-key="run_draft_1"] [data-testid="block-definition-badge"]')?.textContent === 'Draft 1'`,
      'the collision Draft 1 badge')
    let blocks = await state(page)
    const topRuns = blocks.filter((block) => block.parentId.startsWith('page:') && block.title === 'run()')
    assert.equal(topRuns.length, 3)
    assert.equal(topRuns.filter((block) => block.definitionId === 'definition-run-main').length, 2)
    assert.equal(topRuns.find((block) => block.definitionId === 'definition-run-collision').definitionKey, 'run_draft_1')
    pass('same-name/different-content becomes Draft 1 while an ordinary duplicate keeps Definition identity')

    await evaluate(page, `(() => { window.__systemsketch.editor.select('shape:rename-source'); return true })()`)
    await waitFor(page, `document.querySelector('[aria-label="Block title"]')`, 'the rename title field')
    await clickElement(page, '[aria-label="Block title"]')
    await shortcut(page, 'a', 'KeyA', 2)
    await page.send('Input.insertText', { text: 'target_name()' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:rename-source')?.props.definitionId === 'definition-rename-target'`, 'matching rename to link')
    pass('finishing a rename against matching content joins the existing Definition')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes(['shape:rename-target', 'shape:rename-source'])
      editor.selectNone()
      return true
    })()`)

    const linked = topRuns.filter((block) => block.definitionId === 'definition-run-main')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const source = editor.getShape(${JSON.stringify(linked[0].id)})
      editor.updateShape({ id: source.id, type: source.type, props: { description: 'linked live' } })
    })()`)
    await waitFor(page, `(() => {
      const editor = window.__systemsketch.editor
      return ${JSON.stringify(linked.map((block) => block.id))}.every((id) => editor.getShape(id)?.props.description === 'linked live')
    })()`, 'linked semantic content to converge')
    pass('editing semantic content on one occurrence updates the other occurrence')

    blocks = await state(page)
    const childCopies = blocks.filter((block) => block.title === 'decode()')
    assert.equal(childCopies.length, 2, 'ordinary duplicate did not materialize the expanded body twice')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const child = editor.getShape(${JSON.stringify(childCopies[0].id)})
      editor.updateShape({ id: child.id, type: child.type, props: { title: 'decode_v2()' } })
    })()`)
    await waitFor(page, `(() => {
      const editor = window.__systemsketch.editor
      return editor.getCurrentPageShapes().filter((shape) => shape.type === 'block' && shape.parentId !== editor.getCurrentPageId())
        .filter((shape) => shape.props.title === 'decode_v2()').length === 2
    })()`, 'expanded-body edits to converge')
    pass('expanded child content is mirrored across linked occurrences')

    const unlinkSource = linked[1]
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(unlinkSource.id)}); return true })()`)
    const box = await shapeBox(page, unlinkSource.id)
    assert.ok(box)
    await clickAt(page, box.x + box.w / 2, box.y + 30, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-unlink-definition"]')`, 'Unlink menu item')
    await clickElement(page, '[data-testid="context-menu.block-unlink-definition"]')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(unlinkSource.id)})?.props.title === 'run_1()'`, 'unique unlinked title')
    const unlinked = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape(${JSON.stringify(unlinkSource.id)}).props)`))
    assert.notEqual(unlinked.definitionId, 'definition-run-main')
    assert.equal(unlinked.definitionKey, 'run_1')
    pass('right-click Unlink creates a new identity and collision-free visible name')

    const duplicateSource = linked[0]
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.select(${JSON.stringify(duplicateSource.id)})
      editor.zoomToSelection({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(250)
    const duplicateBox = await shapeBox(page, duplicateSource.id)
    assert.ok(duplicateBox)
    await clickAt(page, duplicateBox.x + duplicateBox.w / 2, duplicateBox.y + 30, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-duplicate-unlinked"]')`, 'Duplicate unlinked menu item')
    await clickElement(page, '[data-testid="context-menu.block-duplicate-unlinked"]')
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'block' && shape.props.title === 'run_2()')`, 'unlinked duplicate')
    const uniqueDefinitions = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'block' && ['run()', 'run_1()', 'run_2()'].includes(shape.props.title))
      .map((shape) => shape.props.definitionId))`))
    assert.ok(new Set(uniqueDefinitions).size >= 3)
    pass('Duplicate unlinked keeps stock subtree duplication but assigns a fresh Definition and unique name')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(250)
    await key(page, 'Escape', 'Escape')
    await clickAt(page, 1200, 760)
    await delay(150)

    await page.send('Page.captureScreenshot', { format: 'png' }).then(async ({ data }) => {
      const { writeFile } = await import('node:fs/promises')
      await writeFile(SHOT, Buffer.from(data, 'base64'))
    })
    console.log(`definition linking smoke · ${checks.length} checks passed`)
    console.log(`screenshot · ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
