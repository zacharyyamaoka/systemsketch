#!/usr/bin/env node
/** Drive the generated comparison fixture through both shared Typeface surfaces. */
import assert from 'node:assert/strict'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'contextual-menu-composition.systemsketch')

async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return 'null'
    const box = element.getBoundingClientRect()
    return JSON.stringify({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  })()`))
  assert.ok(point, `missing ${selector}`)
  await clickAt(page, point.x, point.y)
}

async function pagePoint(page, shapeId, where = 'center') {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    const pagePoint = ${JSON.stringify(where)} === 'title'
      ? { x: bounds.x + bounds.w / 2, y: bounds.y + 30 }
      : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
    return JSON.stringify(editor.pageToScreen(pagePoint))
  })()`))
}

async function typefaceRows(page, control) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll(${JSON.stringify(`[data-control="${control}"][data-value]`)}))
      .map((row) => ({
        preview: row.querySelector('.systemsketch-appearance__font')?.textContent,
        label: row.querySelector('.systemsketch-appearance__label')?.textContent,
      })))`))
}

const expectedRows = [
  { preview: 'Aa', label: 'Simple' },
  { preview: 'Aa', label: 'Bookish' },
  { preview: 'Aa', label: 'Technical' },
  { preview: 'Aa', label: 'Scribbled' },
]

async function main() {
  const app = await startApp({ label: 'contextual-menu-fixture', build: 'contextual-menu-fixture' })
  const { page } = app
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'contextual-menu-composition.systemsketch')
    await mkdir(dirname(board), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:ordinary-text')`, 'fixture')
    await delay(500)

    // The fixture skill requires one bound cue to be exercised, not merely
    // assumed from JSON. Drag its actual target and check the arrow follows.
    const before = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getShapePageBounds('shape:cue-step-text-arrow')
      const binding = editor.store.get('binding:cue-step-text-arrow-end')
      return JSON.stringify({ targetX: editor.getShape('shape:ordinary-text').x, arrowMaxX: arrow.maxX, toId: binding?.toId })
    })()`))
    const ordinary = await pagePoint(page, 'shape:ordinary-text')
    await mouse(page, 'mousePressed', ordinary.x, ordinary.y, { buttons: 1 })
    await mouse(page, 'mouseMoved', ordinary.x + 60, ordinary.y, { buttons: 1 })
    await mouse(page, 'mouseReleased', ordinary.x + 60, ordinary.y)
    await delay(250)
    const after = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getShapePageBounds('shape:cue-step-text-arrow')
      const binding = editor.store.get('binding:cue-step-text-arrow-end')
      return JSON.stringify({ targetX: editor.getShape('shape:ordinary-text').x, arrowMaxX: arrow.maxX, toId: binding?.toId })
    })()`))
    assert.ok(after.targetX > before.targetX + 40, 'the real target moved')
    assert.ok(after.arrowMaxX > before.arrowMaxX + 40, 'the bound cue followed it')
    assert.equal(before.toId, 'shape:ordinary-text')
    assert.equal(after.toId, 'shape:ordinary-text')

    await clickSelector(page, '[data-testid="systemsketch-appearance"] [data-kind="font"]')
    await waitFor(page, `document.querySelector('[data-control="font"][data-value="serif"]')`, 'Text Typeface menu')
    assert.deepEqual(await typefaceRows(page, 'font'), expectedRows)
    await clickSelector(page, '[data-testid="systemsketch-appearance"] [data-kind="font"]')

    const title = await pagePoint(page, 'shape:function-block', 'title')
    for (const clickCount of [1, 2]) {
      await mouse(page, 'mousePressed', title.x, title.y, { buttons: 1, clickCount })
      await mouse(page, 'mouseReleased', title.x, title.y, { clickCount })
    }
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'Block title editor')
    await clickSelector(page, '[data-testid="block-title-formatting-menu"] [data-kind="font"]')
    await waitFor(page, `document.querySelector('[data-control="titleFont"][data-value="serif"]')`, 'Block Typeface menu')
    assert.deepEqual(await typefaceRows(page, 'titleFont'), expectedRows)
    await clickSelector(page, '[data-control="titleFont"][data-value="serif"]')
    await delay(160)
    await page.send('Input.insertText', { text: '_v2' })
    await delay(160)
    const titleState = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape('shape:function-block')
      return JSON.stringify({ title: shape.props.title, font: shape.props.titleFont, editing: editor.getEditingShapeId() })
    })()`))
    assert.equal(titleState.title, '_v2', 'the editor selection remains live, so typing replaces it')
    assert.equal(titleState.font, 'serif')
    assert.equal(titleState.editing, 'shape:function-block')
    assert.deepEqual(localConsoleErrors(page), [])

    process.stdout.write('  PASS  the generated cue stays bound after a real target drag\n')
    process.stdout.write('  PASS  Text and live Block title expose the same four registered Typeface rows\n')
    process.stdout.write('  PASS  formatting returns focus to the live Block title\n\n  3/3 fixture checks passed\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
