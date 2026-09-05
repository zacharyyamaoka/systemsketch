#!/usr/bin/env node
/** Drive the exact saved review board, then undo every document mutation. */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'async-region.systemsketch')
const REGION = 'shape:async-region'
const PRODUCER = 'shape:producer'
const CUE = 'shape:cue-step-2-arrow'

async function dragBetween(page, from, to) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((to.cx - from.cx) * step) / 10,
      from.cy + ((to.cy - from.cy) * step) / 10,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', to.cx, to.cy)
  await delay(450)
}

async function main() {
  const app = await startApp({
    label: 'async-region-review-fixture',
    build: 'async-region-review-fixture',
    allowSourceRoot: true,
    width: 1900,
    height: 1050,
  })
  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(REGION)})`, 'saved Async region', 30_000)
    await waitFor(app.page, `[...document.querySelectorAll('[data-shape-id]')].some((node) => node.dataset.shapeId === ${JSON.stringify(PRODUCER)})`, 'painted producer')
    await delay(500)

    const before = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const producer = editor.getShape(${JSON.stringify(PRODUCER)})
      return {
        x: producer.x,
        cueBindings: editor.getBindingsFromShape(${JSON.stringify(CUE)}, 'arrow')
          .filter((binding) => binding.toId === ${JSON.stringify(PRODUCER)}).length,
        connections: editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length,
      }
    })())`))
    assert.equal(before.cueBindings, 1)

    const producer = await elementBox(app.page, `[data-shape-id="${PRODUCER}"]`)
    await drag(app.page,
      { x: producer.x + producer.w * 0.42, y: producer.y + 18 },
      { x: producer.x + producer.w * 0.42 + 36, y: producer.y + 18 })
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(PRODUCER)}).x > ${before.x + 25}`, 'producer move')
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getBindingsFromShape(${JSON.stringify(CUE)}, 'arrow').filter((binding) => binding.toId === ${JSON.stringify(PRODUCER)}).length`), 1)
    await evaluate(app.page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(PRODUCER)}).x === ${before.x}`, 'producer move undo')
    process.stdout.write('  PASS  the saved orange cue stays bound when its target moves\n')

    const frameBounds = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(REGION)}))`))
    const border = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.pageToViewport({ x: ${frameBounds.x + frameBounds.w - 2}, y: ${frameBounds.y + frameBounds.h * 0.55} }))`))
    await clickAt(app.page, border.x, border.y)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'contextual communication controls')

    const output = await elementBox(app.page, `[data-shape-id="${PRODUCER}"] .Port[data-block-port-id="metrics"]`)
    const input = await elementBox(app.page, '[data-shape-id="shape:consumer"] .Port[data-block-port-id="metrics"]')
    await dragBetween(app.page, output, input)
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === ${before.connections + 1}`, 'new metrics wire')
    const newWire = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'connection')
      .find((shape) => shape.id !== 'shape:events-wire'))`))
    assert.equal(newWire.props.temporal, 'async')
    assert.equal(newWire.parentId, REGION)
    await evaluate(app.page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === ${before.connections}`, 'metrics wire undo')
    process.stdout.write('  PASS  the saved fixture creates an Async metrics wire through the real port gesture\n')

    const outside = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.pageToViewport({ x: ${frameBounds.x - 160}, y: ${frameBounds.y + frameBounds.h + 120} }))`))
    await clickAt(app.page, outside.x, outside.y)
    await waitFor(app.page, `!document.querySelector('[data-testid="communication-prototype-controls"]')`, 'context controls dismissal')
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getShape('shape:events-wire').props.temporal`), 'async')
    assert.deepEqual(await localConsoleErrors(app.page), [])
    process.stdout.write('  PASS  outside click dismisses the controls and the review board returns to its seeded state\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
