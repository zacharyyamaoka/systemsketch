#!/usr/bin/env node
/** Real-canvas proof for contextual Async regions and their wire default. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'async-region')
const RESULTS = join(ASSETS, 'acceptance.json')
const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  const sizes = { simple: { w: 320, h: 190 }, port: { w: 340, h: 220 }, expanded: { w: 560, h: 380 }, value: { w: 168, h: 56 } }
  const port = (id, name, type) => ({ id, name, type, visible: true })
  const block = (id, x, title, inputs, outputs) => ({
    id: 'shape:' + id, type: 'block', x, y: 290,
    props: {
      title, description: '', blockType: 'component', view: 'port', w: 340, h: 220,
      views: sizes, showDescription: false, portLayout: 'inline', state: 'normal', inputs, outputs,
    },
  })
  editor.createShapes([
    block('producer', 260, 'Telemetry source', [], [port('events', 'events', 'Event')]),
    block('consumer', 790, 'Event processor', [port('events', 'events', 'Event')], []),
    block('outside', 1390, 'Outside component', [port('events', 'events', 'Event')], []),
  ])
  editor.selectNone()
  editor.setCamera({ x: 0, y: 0, z: 1 })
  return true
})()`

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`))
}

async function dragBetween(page, from, to) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((to.cx - from.cx) * step) / 10,
      from.cy + ((to.cy - from.cy) * step) / 10,
      { buttons: 1 })
    await delay(28)
  }
  await mouse(page, 'mouseReleased', to.cx, to.cy)
  await delay(500)
}

async function record(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const region = editor.getCurrentPageShapes().find((shape) =>
      shape.type === 'frame' && shape.meta.systemSketchAsyncRegion?.version === 1)
    const wire = editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
    return {
      region: region ? { id: region.id, name: region.props.name, color: region.props.color } : null,
      parents: ['shape:producer', 'shape:consumer'].map((id) => editor.getShape(id)?.parentId),
      outsideParent: editor.getShape('shape:outside')?.parentId,
      selection: [...editor.getSelectedShapeIds()],
      wire: wire ? {
        id: wire.id,
        parentId: wire.parentId,
        temporal: wire.props.temporal,
        defaultRegionId: wire.meta.systemSketchAsyncRegionDefault?.regionId ?? null,
      } : null,
      controls: Boolean(document.querySelector('[data-testid="communication-prototype-controls"]')),
      status: document.querySelector('[data-testid="communication-prototype-status"]')?.textContent ?? '',
    }
  })())`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-async-region',
    build: 'async-region',
    width: 1900,
    height: 1050,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'async-region.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'Async region editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(650)
    assert.equal((await record(app.page)).controls, false)
    pass('the communication controls are absent on an ordinary board')

    await clickElement(app.page, '[data-testid="systemsketch-tool-system"]')
    await waitFor(app.page,
      `Array.from(document.querySelectorAll('.systemsketch-tool-menu__item')).some((node) => node.textContent.includes('Async region'))`,
      'Async region menu item')
    const item = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const node = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
        .find((candidate) => candidate.textContent.includes('Async region'))
      const box = node.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    })())`))
    await clickAt(app.page, item.x, item.y)
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getCurrentToolId()'), 'async-region')

    const from = await pagePoint(app.page, { x: 175, y: 190 })
    const to = await pagePoint(app.page, { x: 1215, y: 660 })
    await drag(app.page, from, to)
    await delay(600)
    let observed = await record(app.page)
    assert.deepEqual(observed.region && { name: observed.region.name, color: observed.region.color }, {
      name: 'Async region', color: 'violet',
    })
    assert.deepEqual(new Set(observed.parents), new Set([observed.region.id]))
    assert.notEqual(observed.outsideParent, observed.region.id)
    assert.equal(observed.controls, true, JSON.stringify(observed))
    assert.match(observed.status, /default to Async/)
    pass('drawing Async region uses the stock Frame gesture, adopts enclosed components, and opens contextual controls')

    const output = await elementBox(app.page, '[data-shape-id="shape:producer"] .Port[data-block-port-id="events"]')
    const input = await elementBox(app.page, '[data-shape-id="shape:consumer"] .Port[data-block-port-id="events"]')
    await dragBetween(app.page, output, input)
    observed = await record(app.page)
    assert.equal(observed.wire.temporal, 'async')
    assert.equal(observed.wire.parentId, observed.region.id)
    assert.equal(observed.wire.defaultRegionId, observed.region.id)
    assert.equal(observed.controls, true)
    assert.ok(await evaluate(app.page, `Boolean(document.querySelector('[data-shape-id="${observed.wire.id}"] [data-temporal="async"]'))`))
    pass('a real port drag completed inside the region becomes an Async wire and stays painted above its Frame')
    await shot(app.page, '01-contextual-region-and-async-wire.png')

    await evaluate(app.page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(observed.wire.id)}); return true })()`)
    await waitFor(app.page, `document.querySelector('[data-testid="connection-temporal-data"]')`, 'wire delivery controls')
    await clickElement(app.page, '[data-testid="connection-temporal-data"]')
    await delay(350)
    observed = await record(app.page)
    assert.equal(observed.wire.temporal, 'data')
    pass('the Async default remains explicitly overridable through the ordinary wire inspector')

    const outside = await pagePoint(app.page, { x: 80, y: 760 })
    await clickAt(app.page, outside.x, outside.y)
    await delay(300)
    assert.equal((await record(app.page)).controls, false)
    pass('pressing outside the Frame dismisses the region controls')

    const bounds = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(observed.region.id)}))`))
    const border = await pagePoint(app.page, { x: bounds.x + 2, y: bounds.y + bounds.h * 0.55 })
    await clickAt(app.page, border.x, border.y)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'reopened region controls')
    assert.equal((await record(app.page)).wire.temporal, 'data')
    await clickElement(app.page, '[data-testid="communication-cables-split"]')
    await delay(400)
    assert.equal(await evaluate(app.page, `document.querySelectorAll('[data-communication-mode="tagged"]').length`), 1)
    pass('reselecting the Frame reopens its scoped communication lens without reapplying the Async default')
    await shot(app.page, '02-selected-region-tagged-view.png')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the real browser journey emitted no local console errors')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
