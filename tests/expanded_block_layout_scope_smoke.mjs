#!/usr/bin/env node
/** Real-browser proof for the one-selected Expanded Block layout exception. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  newPage,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const BEFORE = join(ASSETS, 'expanded-block-layout-scope-before-2026-09-02.png')
const AFTER = join(ASSETS, 'expanded-block-layout-scope-after-2026-09-02.png')
const RESULTS = join(ASSETS, 'expanded-block-layout-scope-results-2026-09-02.json')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const port = (id, side) => ({ id, name: id, type: 'data', visible: true })
  const block = (id, parentId, x, y, title, view = 'port', w = 240, h = 160) => ({
    id, type: 'block', parentId, x, y,
    props: {
      w, h, title, view,
      inputs: [port('in0', 'input')],
      outputs: [port('out0', 'output')],
    },
  })
  const cable = (id, parentId) => ({
    id, type: 'connection', parentId, x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    },
  })
  const weld = (fromId, toId, terminal, portId, face = 'outer') => ({
    type: 'connection', fromId, toId, props: { terminal, portId, face },
  })

  const parent = block('shape:scope-parent', 'page:page', 180, 120, 'Selected expanded scope', 'expanded', 1800, 900)
  const first = block('shape:scope-first', parent.id, 300, 500, 'Decode')
  const nested = block('shape:scope-nested', parent.id, 800, 320, 'Nested subsystem', 'expanded', 320, 240)
  const second = block('shape:scope-second', parent.id, 350, 130, 'Encode', 'port', 270, 180)
  const grandchild = block('shape:scope-grandchild', nested.id, 36, 82, 'Nested private child', 'port', 180, 110)
  const directEdges = [
    cable('shape:scope-boundary-in', parent.id),
    ...Array.from({ length: 5 }, (_, index) => cable('shape:scope-parallel-' + index, parent.id)),
    cable('shape:scope-to-second', parent.id),
    cable('shape:scope-boundary-out', parent.id),
  ]
  const directBindings = [
    weld('shape:scope-boundary-in', parent.id, 'start', 'in0', 'inner'),
    weld('shape:scope-boundary-in', first.id, 'end', 'in0'),
    ...Array.from({ length: 5 }, (_, index) => [
      weld('shape:scope-parallel-' + index, first.id, 'start', 'out0'),
      weld('shape:scope-parallel-' + index, nested.id, 'end', 'in0'),
    ]).flat(),
    weld('shape:scope-to-second', nested.id, 'start', 'out0'),
    weld('shape:scope-to-second', second.id, 'end', 'in0'),
    weld('shape:scope-boundary-out', second.id, 'start', 'out0'),
    weld('shape:scope-boundary-out', parent.id, 'end', 'out0', 'inner'),
  ]
  const nestedEdge = cable('shape:scope-nested-private', nested.id)
  const nestedBindings = [
    weld(nestedEdge.id, nested.id, 'start', 'in0', 'inner'),
    weld(nestedEdge.id, grandchild.id, 'end', 'in0'),
  ]
  const exterior = block('shape:scope-exterior', 'page:page', 2140, 280, 'Outside sentinel')
  const exteriorEdge = cable('shape:scope-exterior-edge', 'page:page')
  const exteriorBindings = [
    weld(exteriorEdge.id, parent.id, 'start', 'out0'),
    weld(exteriorEdge.id, exterior.id, 'end', 'in0'),
  ]

  const noise = Array.from({ length: 20 }, (_, index) => block(
    'shape:noise-' + index, 'page:page',
    120 + (index % 5) * 430, 1160 + Math.floor(index / 5) * 250,
    'Outside ' + (index + 1), 'port', 190 + (index % 3) * 20, 130 + (index % 2) * 18,
  ))
  const noiseEdges = []
  const noiseBindings = []
  for (let index = 0; index < noise.length - 1; index += 1) {
    const edge = cable('shape:noise-edge-' + index, 'page:page')
    noiseEdges.push(edge)
    noiseBindings.push(
      weld(edge.id, noise[index].id, 'start', 'out0'),
      weld(edge.id, noise[index + 1].id, 'end', 'in0'),
    )
  }

  const disconnectedParent = block('shape:single-disconnected-parent', 'page:page', 2550, 120, 'One disconnected child', 'expanded', 700, 430)
  const disconnectedChild = block('shape:single-disconnected-child', disconnectedParent.id, 180, 150, 'No placement objective')
  const connectedParent = block('shape:single-connected-parent', 'page:page', 2550, 700, 'One boundary-connected child', 'expanded', 760, 480)
  const connectedChild = block('shape:single-connected-child', connectedParent.id, 390, 220, 'Align me')
  const singleEdge = cable('shape:single-connected-edge', connectedParent.id)
  const singleBindings = [
    weld(singleEdge.id, connectedParent.id, 'start', 'in0', 'inner'),
    weld(singleEdge.id, connectedChild.id, 'end', 'in0'),
  ]

  editor.run(() => {
    editor.createShapes([parent, exterior, disconnectedParent, connectedParent, ...noise])
    editor.createShapes([first, nested, second, disconnectedChild, connectedChild])
    editor.createShapes([grandchild])
    editor.createShapes([...directEdges, nestedEdge, exteriorEdge, ...noiseEdges, singleEdge])
    editor.createBindings([
      ...directBindings, ...nestedBindings, ...exteriorBindings, ...noiseBindings, ...singleBindings,
    ])
  })
  window.__expandedScopeIds = {
    parent: parent.id,
    children: [first.id, nested.id, second.id],
    grandchild: grandchild.id,
    directEdges: directEdges.map((edge) => edge.id),
    sentinels: [parent.id, grandchild.id, exterior.id, exteriorEdge.id,
      ...noise.map((shape) => shape.id), ...noiseEdges.map((shape) => shape.id)],
  }
  editor.select(parent.id)
  editor.zoomToSelection({ animation: { duration: 0 } })
  return { noiseBlocks: noise.length, noiseEdges: noiseEdges.length, directEdges: directEdges.length }
})()`

async function state(page, idsExpression) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify((${idsExpression}).map((id) => {
    const shape = window.__systemsketch.editor.getShape(id)
    return shape.type === 'connection'
      ? { id, parentId: shape.parentId, pins: shape.props.pins,
        elbowRoute: shape.props.elbowRoute, routeMode: shape.props.routeMode }
      : { id, parentId: shape.parentId, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h }
  })))()`))
}

async function actions(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify({
    tidy: Boolean(document.querySelector('[data-testid="selection-action-tidy-edges"]')),
    organize: Boolean(document.querySelector('[data-testid="selection-action-organize-nodes"]')),
  })`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-expanded-block-layout-scope',
    build: 'expanded-block-layout-scope-smoke',
    width: 1550,
    height: 980,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'expanded-block-layout-scope.systemsketch')
  let fixturePage = null
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    assert.deepEqual(await evaluate(app.page, SEED), { noiseBlocks: 20, noiseEdges: 19, directEdges: 8 })
    await delay(700)

    assert.deepEqual(await actions(app.page), { tidy: true, organize: true })
    const sentinelsBefore = await state(app.page, 'window.__expandedScopeIds.sentinels')
    const childrenBefore = await state(app.page, 'window.__expandedScopeIds.children')
    await capture(app.page, BEFORE)
    pass('one selected Expanded Block with three immediate children exposes both layout actions')

    await clickElement(app.page, '[data-testid="selection-action-tidy-edges"]')
    await waitFor(app.page, `window.__expandedScopeIds.directEdges.some((id) =>
      window.__systemsketch.editor.getShape(id).props.elbowRoute !== null)`, 'interior edge tidy')
    const tidiedCounts = JSON.parse(await evaluate(app.page, `JSON.stringify(
      window.__expandedScopeIds.directEdges.map((id) =>
        window.__systemsketch.editor.getShape(id).props.elbowRoute !== null))`))
    assert.ok(tidiedCounts.filter(Boolean).length >= 4)
    assert.deepEqual(await state(app.page, 'window.__expandedScopeIds.sentinels'), sentinelsBefore)
    assert.deepEqual(await state(app.page, 'window.__expandedScopeIds.children'), childrenBefore)
    pass('Tidy edges changes direct-scope cables only; 20 outside Blocks, 20 outside cables, and nested contents remain byte-stable')

    await clickElement(app.page, '[data-testid="selection-action-organize-nodes"]')
    await waitFor(app.page, `window.__expandedScopeIds.children.some((id, index) => {
      const shape = window.__systemsketch.editor.getShape(id)
      const before = ${JSON.stringify(childrenBefore)}[index]
      return Math.abs(shape.x - before.x) > .5 || Math.abs(shape.y - before.y) > .5
    })`, 'expanded Block child organization', 30_000)
    const childrenAfter = await state(app.page, 'window.__expandedScopeIds.children')
    assert.notDeepEqual(childrenAfter, childrenBefore)
    assert.deepEqual(await state(app.page, 'window.__expandedScopeIds.sentinels'), sentinelsBefore)
    assert.equal(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const parent = editor.getShape(window.__expandedScopeIds.parent)
      const parentBounds = editor.getShapePageBounds(parent.id)
      return window.__expandedScopeIds.children.every((id) => {
        const bounds = editor.getShapePageBounds(id)
        return bounds.minX >= parentBounds.minX && bounds.maxX <= parentBounds.maxX
          && bounds.minY >= parentBounds.minY && bounds.maxY <= parentBounds.maxY
      })
    })()`), true)
    await capture(app.page, AFTER)
    pass('Organize nodes moves immediate children only, keeps them inside the parent, and leaves parent, nested descendants, exterior incident cable, and dense outside graph unchanged')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.select('shape:single-disconnected-parent')
      window.__systemsketch.editor.zoomToSelection({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(350)
    assert.deepEqual(await actions(app.page), { tidy: false, organize: false })
    pass('one disconnected child does not expose an arbitrary Organize nodes action')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.select('shape:single-connected-parent')
      window.__systemsketch.editor.zoomToSelection({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-organize-nodes"]')`, 'single boundary-connected child action')
    assert.deepEqual(await actions(app.page), { tidy: true, organize: true })
    pass('one boundary-connected child does expose Organize nodes because its parent port is a real alignment target')

    const reviewBoard = join(app.filesRoot, 'SystemSketch', 'expanded-block-layout-scope-review.systemsketch')
    await copyFile(join(ROOT, 'sketches', 'review', 'expanded-block-layout-scope.systemsketch'), reviewBoard)
    fixturePage = await newPage(app.cdpPort)
    await fixturePage.send('Page.enable')
    await fixturePage.send('Runtime.enable')
    await fixturePage.send('Log.enable')
    await fixturePage.send('Emulation.setDeviceMetricsOverride', {
      width: 1550, height: 980, deviceScaleFactor: 1, mobile: false,
    })
    await openApp(fixturePage, app.port, `?board=${encodeURIComponent(reviewBoard)}`)
    await waitFor(fixturePage, `window.__systemsketch?.editor?.getShape('shape:scope-parent')`, 'generated review fixture')
    const cueArrow = await evaluate(fixturePage, `(() => {
      const editor = window.__systemsketch.editor
      return editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow')
        .find((shape) => editor.getBindingsFromShape(shape, 'arrow')
          .some((binding) => binding.toId === 'shape:scope-parent'))?.id ?? null
    })()`)
    assert.ok(cueArrow)
    await evaluate(fixturePage, `(() => {
      const editor = window.__systemsketch.editor
      const parent = editor.getShape('shape:scope-parent')
      editor.updateShape({ id: parent.id, type: parent.type, x: parent.x + 24 })
      return true
    })()`)
    assert.equal(await evaluate(fixturePage, `window.__systemsketch.editor
      .getBindingsFromShape(${JSON.stringify(cueArrow)}, 'arrow')
      .some((binding) => binding.toId === 'shape:scope-parent')`), true)
    await evaluate(fixturePage, `(() => {
      const editor = window.__systemsketch.editor
      editor.undo()
      editor.select('shape:scope-parent')
      editor.zoomToSelection({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(fixturePage, `document.querySelector('[data-testid="selection-action-tidy-edges"]')`, 'fixture Tidy edges action')
    await clickElement(fixturePage, '[data-testid="selection-action-tidy-edges"]')
    await waitFor(fixturePage, `['shape:parallel-1','shape:parallel-2','shape:parallel-3','shape:parallel-4']
      .some((id) => window.__systemsketch.editor.getShape(id).props.elbowRoute !== null)`, 'fixture tidied cables')
    const decodeBefore = JSON.parse(await evaluate(fixturePage, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape('shape:decode')
      return { x: shape.x, y: shape.y }
    })())`))
    await clickElement(fixturePage, '[data-testid="selection-action-organize-nodes"]')
    await waitFor(fixturePage, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:decode')
      return Math.abs(shape.x - ${decodeBefore.x}) > .5 || Math.abs(shape.y - ${decodeBefore.y}) > .5
    })()`, 'fixture organized children', 30_000)
    pass('the generated review fixture keeps its cue binding attached and completes both intended layout gestures in the real app')

    assert.deepEqual(localConsoleErrors(app.page), [])
    assert.deepEqual(localConsoleErrors(fixturePage), [])
    pass('the Expanded Block layout journey produced zero local console errors')
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${AFTER}\n`)
  } finally {
    fixturePage?.close()
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
