#!/usr/bin/env node
/**
 * Real-browser proof for the editable port rows produced by Detach to primitives.
 *
 * Fixture setup uses the development editor seam to give one real Block an
 * input with name, type and default plus one output. The claims themselves are
 * exercised through the UI: the context-menu detach and a pointer drag that
 * begins on the selected input row's name.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, drawBlock, shot } from './block_journey_helpers.mjs'

const RESULTS = join(ROOT, 'docs', 'assets', 'detached-port-row-acceptance.json')
const { checks, pass } = makeChecklist()

async function runMenuItem(page, at, itemId, label) {
  await clickAt(page, at.cx, at.cy, 'right')
  const selector = `[data-testid="context-menu.${itemId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, `${label} menu item`)
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
  await delay(450)
}

async function shapeBox(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const bounds = editor?.getShapePageBounds(${JSON.stringify(shapeId)})
    if (!editor || !bounds) return null
    const a = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
  })()`)
  if (!value) throw new Error(`missing screen bounds for ${shapeId}`)
  const bounds = JSON.parse(value)
  return { ...bounds, cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2 }
}

async function detachedStructure(page) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const plain = (shape) => JSON.stringify(shape.props?.richText ?? {})
    const outer = editor.getCurrentPageShapes()
      .find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'block')
    if (!outer) return null
    const rows = editor.getSortedChildIdsForParent(outer.id)
      .map((id) => editor.getShape(id))
      .filter((shape) => shape?.type === 'group')
      .map((row) => ({
        id: row.id,
        parentId: row.parentId,
        children: editor.getSortedChildIdsForParent(row.id).map((id) => {
          const shape = editor.getShape(id)
          return {
            id,
            type: shape.type,
            geo: shape.props?.geo ?? null,
            w: shape.props?.w ?? null,
            h: shape.props?.h ?? null,
            text: shape.type === 'text' ? plain(shape) : '',
            parentId: shape.parentId,
          }
        }),
      }))
    return JSON.stringify({ outerId: outer.id, rows })
  })()`).then((value) => value ? JSON.parse(value) : null)
}

async function childOrigins(page, rowId) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    return JSON.stringify(Object.fromEntries(
      editor.getSortedChildIdsForParent(${JSON.stringify(rowId)}).map((id) => {
        const bounds = editor.getShapePageBounds(id)
        return [id, { x: bounds.x, y: bounds.y }]
      })))
  })()`).then(JSON.parse)
}

async function main() {
  const app = await startApp({ label: 'detached-port-row', build: 'detached-port-row' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    await drawBlock(page, { x: 520, y: 300 }, { x: 920, y: 560 }, 'transform')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getCurrentPageShapes().find((shape) => shape.type === 'block')
      editor.updateShape({
        id: block.id,
        type: 'block',
        props: {
          inputs: [{ id: 'in_1', name: 'payload', type: 'int', defaultValue: '5', visible: true }],
          outputs: [{ id: 'out_1', name: 'result', type: 'float', visible: true }],
        },
      })
      editor.selectNone()
    })()`)
    await waitFor(page,
      `document.querySelector('.BlockNode-portName')?.textContent === 'payload'`,
      'the seeded input row')

    const blockFace = await box(page, '.systemsketch-block-canvas')
    await runMenuItem(page, blockFace, 'block-detach-to-primitives', 'Detach to primitives')
    const structure = await detachedStructure(page)
    assert.ok(structure, 'detach should leave one remembered outer group')
    assert.equal(structure.rows.length, 2, 'each of the two port rows should be a nested group')
    pass('each visible port row is a stock group nested directly inside the detached Block group')

    for (const row of structure.rows) {
      assert.equal(row.parentId, structure.outerId)
      assert.equal(row.children.filter((child) => child.geo === 'ellipse'
        && child.w === 18 && child.h === 18).length, 1,
      'a detached port row must contain exactly one 18px outer ring')
      assert.ok(row.children.every((child) => child.parentId === row.id),
        'every row part must share the nested group parent')
    }
    pass('every port row contains its outer circle inside the nested row group')

    const inputRow = structure.rows.find((row) =>
      row.children.some((child) => child.text.includes('payload')))
    assert.ok(inputRow, 'the input row group should contain the payload name')
    const inputText = inputRow.children.map((child) => child.text).join(' ')
    assert.match(inputText, /payload/)
    assert.match(inputText, /int/)
    assert.match(inputText, /= 5/)
    assert.equal(inputRow.children.filter((child) => child.geo === 'ellipse'
      && child.w === 12 && child.h === 12).length, 1,
      'the defaulted input should detach as an outer ring plus an inner filled circle')
    const outputRow = structure.rows.find((row) => row.id !== inputRow.id)
    assert.ok(outputRow, 'the output row should remain present')
    assert.equal(outputRow.children.filter((child) => child.geo === 'ellipse').length, 1,
      'the hollow output should detach as an outer ring only')
    pass('the ring, optional core, name, type and default all belong to the same port-row group')

    await shot(page, 'detached-port-row-before-move.png')

    const nameShape = inputRow.children.find((child) => child.text.includes('payload'))
    const before = await childOrigins(page, inputRow.id)
    const nameBox = await shapeBox(page, nameShape.id)
    // The outer detached Block starts selected. One ordinary click drills to
    // the nested port-row group using tldraw's stock group selection path.
    await clickAt(page, nameBox.cx, nameBox.cy)
    await delay(520)
    assert.equal(await evaluate(page,
      `window.__systemsketch.editor.getOnlySelectedShape()?.id ?? null`),
      inputRow.id,
      'clicking the port name once should select its nested row group')
    pass('one click on the port name selects the nested row group')
    await drag(page,
      { x: nameBox.cx, y: nameBox.cy },
      { x: nameBox.cx, y: nameBox.cy + 64 })
    const after = await childOrigins(page, inputRow.id)
    const deltas = Object.keys(before).map((id) => ({
      x: after[id].x - before[id].x,
      y: after[id].y - before[id].y,
    }))
    assert.ok(deltas.every((delta) => Math.abs(delta.x) < 1),
      `row children should not separate horizontally: ${JSON.stringify(deltas)}`)
    assert.ok(deltas.every((delta) => Math.abs(delta.y - deltas[0].y) < 1),
      `row children must move by the same vertical delta: ${JSON.stringify(deltas)}`)
    assert.ok(Math.abs(deltas[0].y) > 20,
      `the pointer drag must materially move the port row: ${JSON.stringify(deltas)}`)
    pass('dragging from the port name moves the circle, name, type and default together')

    await shot(page, 'detached-port-row-after-move.png')
    assert.deepEqual(localConsoleErrors(page), [])
    pass('the journey produced zero local console errors')

    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
