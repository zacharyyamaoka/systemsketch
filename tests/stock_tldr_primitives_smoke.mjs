#!/usr/bin/env node
/**
 * Real-browser proof that the context-menu command itself leaves only records
 * that stock tldraw can load and paint. This intentionally does not use the
 * portable-export clone: it catches dependencies hidden in live detachment.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box } from './block_journey_helpers.mjs'

const STOCK_RENDER = join(ROOT, 'docs', 'assets', 'stock-tldr-primitives-live-stock-render.png')

async function detachEverything(page, target) {
  await clickAt(page, target.x, target.y, 'right')
  const selector = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Detach to primitives')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
}

async function detachArrow(page, target) {
  await clickAt(page, target.x, target.y, 'right')
  const selector = '[data-testid="context-menu.connection-detach-to-arrow"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Detach arrow')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
}

async function rebuildBlocks(page, target) {
  await clickAt(page, target.x, target.y, 'right')
  const selector = '[data-testid="context-menu.block-rebuild-from-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Rebuild from primitives')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
}

async function main() {
  const app = await startApp({ label: 'stock-tldr-primitives', build: 'stock-tldr-primitives', width: 1480, height: 920 })
  const { page, port, filesRoot } = app
  try {
    const board = join(filesRoot, 'SystemSketch', 'Stock primitives live detach.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'development seam')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const inputs = [{ id: 'in', name: 'in', type: 'Signal', visible: true }]
      const outputs = [{ id: 'out', name: 'out', type: 'Signal', visible: true }]
      const block = (id, title, x, y) => ({ id, type: 'block', x, y, props: { title, view: 'port', inputs, outputs } })
      editor.createShapes([
        block('shape:data-a', 'data source', 80, 120),
        block('shape:data-b', 'data sink', 460, 120),
        block('shape:async-a', 'async source', 780, 120),
        block('shape:async-b', 'async sink', 1160, 120),
        block('shape:delay-a', 'delay source', 80, 360),
        block('shape:delay-b', 'delay sink', 460, 360),
        { id: 'shape:branch', type: 'branch', x: 850, y: 350, props: {
          w: 500, h: 270, title: 'Loop / branch', view: 'expanded', activeArmId: 'arm_repeat',
          controls: [{ id: 'ctrl', name: 'continue', type: 'bool' }],
          arms: [{ id: 'arm_repeat', title: 'repeat', open: true, h: 90 }, { id: 'arm_exit', title: 'exit', open: false, h: 60 }],
        } },
        { id: 'shape:branch-child', type: 'block', parentId: 'shape:branch', x: 80, y: 100,
          props: { title: 'inside branch', view: 'simple', inputs: [], outputs: [] } },
        { id: 'shape:nested-edge', type: 'connection', parentId: 'shape:branch', x: 80, y: 220,
          props: { start: { x: 0, y: 0 }, end: { x: 320, y: 0 }, routing: 'straight', temporal: 'delayed', delayValue: 'nested', pillPosition: 0.55, curve: null, pins: [], elbowRoute: null } },
        { id: 'shape:loop', type: 'loop', x: 780, y: 650, props: {
          w: 480, h: 220, title: 'For every detection',
          iterable: { id: 'iterable', type: 'Detections' },
          item: { id: 'item', type: 'Detection' }, turn: 'turn 3 / 8',
        } },
        { id: 'shape:loop-child', type: 'block', parentId: 'shape:loop', x: 100, y: 92,
          props: { title: 'inspect()', view: 'port', inputs, outputs: [] } },
        { id: 'shape:loop-item-edge', type: 'connection', parentId: 'shape:loop', x: 0, y: 0,
          props: { start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, routing: 'elbow', temporal: 'data', curve: null, pins: [], elbowRoute: null } },
        { id: 'shape:loop-in-edge', type: 'connection', x: 0, y: 0,
          props: { start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, routing: 'elbow', temporal: 'data', curve: null, pins: [], elbowRoute: null } },
        { id: 'shape:data-edge', type: 'connection', x: 0, y: 0, props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', temporal: 'data', curve: null, pins: [], elbowRoute: null } },
        { id: 'shape:async-edge', type: 'connection', x: 0, y: 0, props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'straight', temporal: 'async', curve: null, pins: [], elbowRoute: null } },
        { id: 'shape:delay-edge', type: 'connection', x: 0, y: 0, props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'curved', temporal: 'delayed', delayValue: '11', pillPosition: 0.6, curve: null, pins: [], elbowRoute: null } },
        // Exercise the separately exposed “Detach arrow” command too: no
        // Block participates in this delayed cable, so the pill must still
        // become a stock group when the command starts from a connection.
        { id: 'shape:direct-edge', type: 'connection', x: 100, y: 780, props: { start: { x: 0, y: 0 }, end: { x: 340, y: 0 }, routing: 'straight', temporal: 'delayed', delayValue: 'direct', pillPosition: 0.55, curve: null, pins: [], elbowRoute: null } },
      ])
      const bind = (edge, from, to) => [
        { type: 'connection', fromId: edge, toId: from, props: { portId: 'out', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: edge, toId: to, props: { portId: 'in', terminal: 'end', face: 'outer' } },
      ]
      editor.createBindings([
        ...bind('shape:data-edge', 'shape:data-a', 'shape:data-b'),
        ...bind('shape:async-edge', 'shape:async-a', 'shape:async-b'),
        ...bind('shape:delay-edge', 'shape:delay-a', 'shape:delay-b'),
        { type: 'connection', fromId: 'shape:loop-item-edge', toId: 'shape:loop', props: { portId: 'item', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:loop-item-edge', toId: 'shape:loop-child', props: { portId: 'in', terminal: 'end', face: 'outer' } },
        { type: 'connection', fromId: 'shape:loop-in-edge', toId: 'shape:delay-a', props: { portId: 'out', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:loop-in-edge', toId: 'shape:loop', props: { portId: 'iterable', terminal: 'end', face: 'outer' } },
      ])
      editor.setSelectedShapes(['shape:data-a', 'shape:data-b', 'shape:async-a', 'shape:async-b', 'shape:delay-a', 'shape:delay-b', 'shape:branch'])
      return true
    })()`)
    await delay(700)
    // The user-reported gap: a Loop used to be absent from the selectable
    // detach family, so its own right-click menu could never offer the action.
    // It carries both an internal item cable and an outside iterable cable to
    // prove that its primitive lowering runs while those ports still exist.
    const loopHeader = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.setSelectedShapes(['shape:loop'])
      const loop = editor.getShape('shape:loop')
      return JSON.stringify(editor.pageToScreen({ x: loop.x + loop.props.w / 2, y: loop.y + 24 }))
    })()`))
    await detachEverything(page, loopHeader)
    await waitFor(page, `(() => {
      const editor = window.__systemsketch.editor
      return editor.getCurrentPageShapes().some((shape) => shape.type === 'frame'
        && shape.meta?.systemSketch?.kind === 'loop')
        && !editor.getShape('shape:loop-item-edge')
        && !editor.getShape('shape:loop-in-edge')
    })()`, 'a Loop-only selection to lower through its own context menu')
    const loopDetach = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const frame = editor.getCurrentPageShapes().find((shape) => shape.type === 'frame'
        && shape.meta?.systemSketch?.kind === 'loop')
      const children = frame ? editor.getSortedChildIdsForParent(frame.id).map((id) => editor.getShape(id)) : []
      const arrowBindings = frame ? editor.getBindingsToShape(frame.id, 'arrow') : []
      return JSON.stringify({
        frame: frame?.type,
        remembered: frame?.meta?.systemSketch?.kind,
        loopShapes: editor.getCurrentPageShapes().filter((shape) => shape.type === 'loop').length,
        loopConnectionsRemain: ['shape:loop-item-edge', 'shape:loop-in-edge']
          .some((id) => editor.getShape(id) !== undefined),
        liveBlocksInside: children.filter((shape) => shape?.type === 'block').length,
        headerRules: children.filter((shape) => shape?.type === 'line').length,
        portDots: children.filter((shape) => shape?.type === 'geo' && shape.props.geo === 'ellipse').length,
        arrowBindings: arrowBindings.length,
      })
    })()`))
    assert.deepEqual(loopDetach, {
      frame: 'frame',
      remembered: 'loop',
      loopShapes: 0,
      loopConnectionsRemain: false,
      liveBlocksInside: 0,
      headerRules: 2,
      portDots: 2,
      arrowBindings: 2,
    })
    const nestedEdgeBefore = JSON.parse(await evaluate(page, `JSON.stringify(
      window.__systemsketch.editor.getShapePageBounds('shape:nested-edge').center
    )`))
    const directArrowPoint = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.setSelectedShapes(['shape:direct-edge'])
      const center = editor.getShapePageBounds('shape:direct-edge').center
      return JSON.stringify(editor.pageToScreen(center))
    })()`))
    await detachArrow(page, directArrowPoint)
    await waitFor(page, `!window.__systemsketch.editor.getShape('shape:direct-edge')
      && window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'arrow'
        && shape.meta?.systemSketch?.delayValue === 'direct')`, 'the directly selected arrow to lower')
    const directEdgeOwnership = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getCurrentPageShapes().find((shape) => shape.type === 'arrow'
        && shape.meta?.systemSketch?.delayValue === 'direct')
      const edgeGroup = arrow && editor.getShape(arrow.parentId)
      const childIds = edgeGroup ? editor.getSortedChildIdsForParent(edgeGroup.id) : []
      const pillGroupId = childIds.find((id) => editor.getShape(id)?.meta?.systemSketch?.kind === 'connection-delay-pill')
      const before = [arrow?.id, pillGroupId].map((id) => editor.getShapePageBounds(id)?.center)
      // This is the normal stock transform on the selected outer group. Its
      // children use parent-local coordinates, so both the arrow and the pill
      // must acquire the same page-space displacement.
      if (edgeGroup) editor.updateShape({ id: edgeGroup.id, type: 'group', x: edgeGroup.x + 37, y: edgeGroup.y + 19 })
      const after = [arrow?.id, pillGroupId].map((id) => editor.getShapePageBounds(id)?.center)
      return JSON.stringify({
        selectedGroup: Boolean(edgeGroup && editor.getSelectedShapeIds().includes(edgeGroup.id)),
        stockEdgeGroup: edgeGroup?.type === 'group',
        hasArrowAndPill: Boolean(arrow && pillGroupId && childIds.includes(arrow.id)),
        movedTogether: before.every((point, index) => point && after[index]
          && Math.abs(after[index].x - point.x - 37) < 0.01
          && Math.abs(after[index].y - point.y - 19) < 0.01),
      })
    })()`))
    assert.equal(directEdgeOwnership.selectedGroup, true)
    assert.equal(directEdgeOwnership.stockEdgeGroup, true)
    assert.equal(directEdgeOwnership.hasArrowAndPill, true)
    assert.equal(directEdgeOwnership.movedTogether, true)
    await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([
      'shape:data-a', 'shape:data-b', 'shape:async-a', 'shape:async-b',
      'shape:delay-a', 'shape:delay-b', 'shape:branch',
    ]); true`)
    const first = await box(page, '[data-shape-id="shape:data-a"] .systemsketch-block-canvas')
    await detachEverything(page, first)
    await waitFor(page, `(() => {
      const shapes = window.__systemsketch.editor.getCurrentPageShapes()
      return !shapes.some((shape) => ['block', 'branch', 'branch-arm', 'loop', 'connection'].includes(shape.type))
    })()`, 'every selected custom composite to lower')
    await delay(350)

    const result = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const source = await window.__systemsketch.serializeTldraw()
      const shapes = editor.getCurrentPageShapes()
      const bindings = editor.store.allRecords().filter((record) => record.typeName === 'binding')
      const temporal = Object.fromEntries(shapes.filter((shape) => shape.type === 'arrow')
        .map((shape) => [shape.meta?.systemSketch?.temporal, shape.props.dash]))
      const nestedArrow = shapes.find((shape) => shape.type === 'arrow'
        && shape.meta?.systemSketch?.delayValue === 'nested')
      const nestedEdgeGroup = nestedArrow && editor.getShape(nestedArrow.parentId)
      const nestedCenter = nestedArrow && editor.getShapePageBounds(nestedArrow.id)?.center
      const stockSvg = await window.__systemsketch.renderStockTldraw(source)
      const host = document.createElement('div')
      host.id = 'stock-live-detach-render'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;padding:20px;overflow:hidden'
      host.innerHTML = stockSvg
      document.body.appendChild(host)
      return JSON.stringify({
        shapeTypes: [...new Set(shapes.map((shape) => shape.type))].sort(),
        bindingTypes: [...new Set(bindings.map((binding) => binding.type))].sort(),
        temporal,
        delayPillGroups: shapes.filter((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'connection-delay-pill').length,
        delayPillText: shapes.filter((shape) => shape.type === 'text').some((shape) => JSON.stringify(shape.props.richText).includes('z⁻¹ = 11')),
        directArrow: shapes.find((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.delayValue === 'direct')?.props.dash,
        directPillGroup: shapes.some((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'connection-delay-pill'
          && shape.meta?.systemSketch?.arrowId && shapes.some((arrow) => arrow.id === shape.meta.systemSketch.arrowId && arrow.meta?.systemSketch?.delayValue === 'direct')),
        // A detached connection is a loose stock primitive. Leaving this
        // delayed arrow below a Branch frame would clip it before ordinary
        // tldraw z-order can bring it back into view.
        nestedEdgeEscapedFrame: nestedEdgeGroup?.parentId === editor.getCurrentPageId(),
        nestedEdgeKeptPosition: Boolean(nestedCenter
          && Math.abs(nestedCenter.x - ${JSON.stringify(nestedEdgeBefore.x)}) < 0.01
          && Math.abs(nestedCenter.y - ${JSON.stringify(nestedEdgeBefore.y)}) < 0.01),
        customPrimitiveStyle: shapes.some((shape) => shape.meta?.systemSketchPrimitiveStyle),
        customGeo: shapes.some((shape) => shape.type === 'geo' && ['systemsketch-rounded-rect', 'excalidraw-rounded-rect'].includes(shape.props.geo)),
        customPaintMarkers: document.querySelectorAll('.systemsketch-detached-card-visual, .systemsketch-detached-arrow__body, .systemsketch-detached-arrow-presentation__body, .systemsketch-detached-text-visual, [data-detached-edge-type], [data-detached-delay-segment]').length,
        stockSvgHasProductMarkers: /systemsketch-detached|data-detached-edge-type|data-detached-delay-segment/.test(stockSvg),
        stockSvgBytes: stockSvg.length,
        stockSvgPresent: Boolean(document.querySelector('#stock-live-detach-render svg')),
      })
    })()`))
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(STOCK_RENDER, Buffer.from(shot.data, 'base64'))
    await evaluate(page, `document.querySelector('#stock-live-detach-render')?.remove(); true`)

    assert.deepEqual(result.bindingTypes, ['arrow'])
    assert.equal(result.temporal.data, 'solid')
    assert.equal(result.temporal.async, 'dashed')
    assert.equal(result.temporal.delayed, 'dotted')
    assert.equal(result.delayPillGroups, 3)
    assert.equal(result.delayPillText, true)
    assert.equal(result.directArrow, 'dotted')
    assert.equal(result.directPillGroup, true)
    assert.equal(result.nestedEdgeEscapedFrame, true)
    assert.equal(result.nestedEdgeKeptPosition, true)
    assert.equal(result.customPrimitiveStyle, false)
    assert.equal(result.customGeo, false)
    assert.equal(result.customPaintMarkers, 0)
    assert.equal(result.stockSvgHasProductMarkers, false)
    assert.equal(result.stockSvgPresent, true)
    assert.ok(result.stockSvgBytes > 1000)

    // Rebuilding a delayed semantic cable must remove the whole outer edge
    // group, including the nested pill descendants. The direct-detached edge
    // remains (its metadata deliberately says `rebuildWithBlocks: false`).
    const rebuildPoint = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const groups = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'block')
        .map((shape) => shape.id)
      editor.setSelectedShapes(groups)
      const bounds = editor.getShapePageBounds(groups[0])
      return JSON.stringify(editor.pageToScreen(bounds.center))
    })()`))
    await rebuildBlocks(page, rebuildPoint)
    await waitFor(page, `(() => {
      const shapes = window.__systemsketch.editor.getCurrentPageShapes()
      return !shapes.some((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.rebuildWithBlocks === true)
        && !shapes.some((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'connection-delay-pill'
          && shapes.some((arrow) => arrow.id === shape.meta.systemSketch.arrowId && arrow.meta?.systemSketch?.rebuildWithBlocks === true))
    })()`, 'rebuild to consume delayed arrow plus its nested pill')
    const rebuildCleanup = JSON.parse(await evaluate(page, `(() => {
      const shapes = window.__systemsketch.editor.getCurrentPageShapes()
      return JSON.stringify({
        rebuiltDelayedConnection: shapes.some((shape) => shape.type === 'connection' && shape.props.temporal === 'delayed'),
        staleRebuildPill: shapes.some((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'connection-delay-pill'
          && shapes.some((arrow) => arrow.id === shape.meta.systemSketch.arrowId && arrow.meta?.systemSketch?.rebuildWithBlocks === true)),
      })
    })()`))
    assert.deepEqual(rebuildCleanup, { rebuiltDelayedConnection: true, staleRebuildPill: false })
    assert.equal(localConsoleErrors(page).length, 0)
    process.stdout.write(`stock tldr primitives passed: ${JSON.stringify(result, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
