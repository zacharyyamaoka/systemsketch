#!/usr/bin/env node
/** Real-browser proof for the selection toolbar's Tidy edges / Organize nodes buttons. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
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
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SCREENSHOT = join(ASSETS, 'contextual-tidy-controls-live-2026-09-02.png')
const RESULTS = join(ASSETS, 'contextual-tidy-controls-results-2026-09-02.json')
const { checks, pass } = makeChecklist()

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const source = {
    id: 'shape:contextual-source', type: 'block', x: 760, y: 500,
    props: {
      w: 280, h: 210, title: 'Source', view: 'port',
      inputs: [{ id: 'in0', name: 'trigger', type: 'event', visible: true }],
      outputs: [{ id: 'out0', name: 'packet', type: 'bytes', visible: true }],
    },
  }
  const target = {
    id: 'shape:contextual-target', type: 'block', x: 220, y: 180,
    props: {
      w: 300, h: 230, title: 'Target', view: 'port',
      inputs: [{ id: 'in0', name: 'packet', type: 'bytes', visible: true }],
      outputs: [{ id: 'out0', name: 'result', type: 'data', visible: true }],
    },
  }
  const edges = Array.from({ length: 4 }, (_, index) => ({
    id: 'shape:contextual-edge-' + index,
    type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    },
  }))
  const bindings = edges.flatMap((edge) => [
    { type: 'connection', fromId: edge.id, toId: source.id,
      props: { portId: 'out0', terminal: 'start', face: 'outer' } },
    { type: 'connection', fromId: edge.id, toId: target.id,
      props: { portId: 'in0', terminal: 'end', face: 'outer' } },
  ])
  editor.run(() => {
    editor.createShapes([source, target])
    editor.createShapes(edges)
    editor.createBindings(bindings)
  })
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

async function selectionButtons(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify({
    tidy: Boolean(document.querySelector('[data-testid="selection-action-tidy-edges"]')),
    organize: Boolean(document.querySelector('[data-testid="selection-action-organize-nodes"]')),
    labels: Array.from(document.querySelectorAll('.systemsketch-selection-layout-action'))
      .map((button) => ({ label: button.getAttribute('aria-label'), title: button.getAttribute('title') })),
  }))()`))
}

async function blockPositions(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify(
    ['shape:contextual-source', 'shape:contextual-target'].map((id) => {
      const shape = window.__systemsketch.editor.getShape(id)
      return { id, x: shape.x, y: shape.y }
    })))()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-contextual-layout-actions',
    build: 'contextual-layout-actions-smoke',
    width: 1440,
    height: 900,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'contextual-layout-actions.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(500)

    await evaluate(app.page, `(() => { window.__systemsketch.editor.select('shape:contextual-edge-0'); return true })()`)
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-tidy-edges"]')`, 'edge-only tidy action')
    assert.deepEqual(await selectionButtons(app.page), {
      tidy: true,
      organize: false,
      labels: [{ label: 'Tidy edges', title: 'Tidy edges' }],
    })
    pass('an edge-only selection exposes Tidy edges, with no inapplicable Organize nodes button')

    const positionsBeforeTidy = await blockPositions(app.page)
    await clickElement(app.page, '[data-testid="selection-action-tidy-edges"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:contextual-edge-0').props.pins.length > 0`, 'contextual edge tidy')
    assert.deepEqual(await blockPositions(app.page), positionsBeforeTidy)
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getShape('shape:contextual-edge-1').props.pins.length`), 0)
    pass('clicking the toolbar runs the existing selection-scoped edge command and leaves nodes and unselected edges unchanged')

    await evaluate(app.page, `(() => { window.__systemsketch.editor.select('shape:contextual-source'); return true })()`)
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-tidy-edges"]')`, 'incident-edge tidy action')
    assert.deepEqual(await selectionButtons(app.page), {
      tidy: true,
      organize: false,
      labels: [{ label: 'Tidy edges', title: 'Tidy edges' }],
    })
    pass('one selected Block exposes Tidy edges for its incident cables without pretending one node can be organized')

    await evaluate(app.page, `(() => { window.__systemsketch.editor.select('shape:contextual-source', 'shape:contextual-target'); return true })()`)
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-organize-nodes"]')`, 'two-Block organize action')
    assert.deepEqual(await selectionButtons(app.page), {
      tidy: true,
      organize: true,
      labels: [
        { label: 'Tidy edges', title: 'Tidy edges' },
        { label: 'Organize nodes', title: 'Organize nodes' },
      ],
    })
    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))

    const positionsBeforeOrganize = await blockPositions(app.page)
    await clickElement(app.page, '[data-testid="selection-action-organize-nodes"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:contextual-source').x < window.__systemsketch.editor.getShape('shape:contextual-target').x`, 'contextual node organization', 30_000)
    assert.notDeepEqual(await blockPositions(app.page), positionsBeforeOrganize)
    pass('two selected Blocks expose both actions and the grid button invokes the existing Organize nodes command')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the contextual toolbar journey produced zero local console errors')
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
