#!/usr/bin/env node
/**
 * A real drag through a linked Definition's materialized body.
 *
 * The recovered pose pipeline exposed this sequence: an outer assignment port
 * reaches a literal that lives inside the expanded assignment. The second
 * Definition occurrence must receive the same cable, but that derived write
 * must happen after the pointer operation has left tldraw's store transaction.
 */
import assert from 'node:assert/strict'

import {
  delay,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSIGNMENT = 'shape:linked-assignment'
const LITERAL = 'shape:linked-assignment-literal'

const portDot = (shapeId, side, portId) =>
  `[data-shape-id="${shapeId}"] .Port[data-block-port-side="${side}"][data-block-port-id="${portId}"]`

async function box(page, selector) {
  const result = await evaluate(page, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)})
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  })()`)
  assert.ok(result, `missing ${selector}`)
  return JSON.parse(result)
}

const app = await startApp({ label: 'systemsketch-port-drag-depth', build: 'port-drag-depth-repro' })

try {
  await openApp(app.page, app.port, '?preset=block-dev')
  await waitFor(app.page, 'window.__systemsketch?.editor', 'Block development canvas')
  await evaluate(app.page, `(() => {
    const editor = window.__systemsketch.editor
    const base = editor.getShapeUtil('block').getDefaultProps()
    editor.createShapes([
      {
        id: ${JSON.stringify(ASSIGNMENT)}, type: 'block', x: 180, y: 150,
        props: {
          ...base, title: 'assignment', view: 'expanded',
          w: base.views.expanded.w, h: base.views.expanded.h,
          definitionId: 'definition-assignment', definitionKey: 'assignment',
          inputs: [
            { id: 'in_1', name: 'self', type: 'Class', visible: true },
            { id: 'in_2', name: '.attr_1', type: 'type', visible: true },
          ],
          outputs: [],
        },
      },
      {
        id: ${JSON.stringify(LITERAL)}, type: 'block', parentId: ${JSON.stringify(ASSIGNMENT)}, x: 260, y: 170,
        props: {
          ...base, title: '', blockType: 'literal', view: 'value',
          w: base.views.value.w, h: base.views.value.h,
          inputs: [{ id: 'in_1', name: 'self.attr_1', type: '', visible: true }],
          outputs: [{ id: 'out_1', name: 'self.attr_1', type: '', visible: true }],
        },
      },
    ])
    editor.select(${JSON.stringify(ASSIGNMENT)})
    editor.duplicateShapes([${JSON.stringify(ASSIGNMENT)}], { x: 760, y: 0 })
    editor.select(${JSON.stringify(ASSIGNMENT)})
    editor.zoomToSelection({ animation: { duration: 0 } })
    return true
  })()`)
  await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'block' && shape.parentId === window.__systemsketch.editor.getCurrentPageId()
      && shape.props.definitionId === 'definition-assignment').length === 2`, 'two linked assignment occurrences')
  await delay(300)

  const from = await box(app.page, portDot(ASSIGNMENT, 'input', 'in_2'))
  const to = await box(app.page, portDot(LITERAL, 'input', 'in_1'))
  await mouse(app.page, 'mouseMoved', from.x, from.y)
  await mouse(app.page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 12; step += 1) {
    await mouse(app.page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 12,
      from.y + ((to.y - from.y) * step) / 12,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(app.page, 'mouseReleased', to.x, to.y)

  await waitFor(app.page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === 2`,
    'the source cable and its linked Definition copy')
  assert.deepEqual(localConsoleErrors(app.page), [])
  console.log('PASS linked assignment input reaches its nested literal without a store-depth loop')
} finally {
  app.close()
}
