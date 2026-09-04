#!/usr/bin/env node
/**
 * Real-browser proof that a cable may be detached on its own and that both
 * direct and Block-triggered detachment preserve Async / Delayed presentation
 * using only native stock primitives. Pixel crops are measured, then real
 * pointer drags prove that stock Arrow bindings remain live. The former custom
 * presentation layer is specifically forbidden by this proof.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box } from './block_journey_helpers.mjs'

const execFileAsync = promisify(execFile)
const ASSETS = join(ROOT, 'docs', 'assets')
const BEFORE = join(ASSETS, 'detached-connection-presentation-before.png')
const AFTER = join(ASSETS, 'detached-connection-presentation-after.png')
const MOVED = join(ASSETS, 'detached-connection-presentation-moved.png')
const ACCEPTANCE = join(ASSETS, 'detached-connection-presentation-acceptance.json')

async function shot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function clip(page, path, rect) {
  const capture = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { ...rect, scale: 1 },
  })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function corridor(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="${shapeId}"]')
    const paths = Array.from(root?.querySelectorAll('path') ?? []).filter((path) => {
      return path.hasAttribute('data-edge-type')
        || path.hasAttribute('data-delay-segment')
        || path.hasAttribute('data-detached-edge-type')
        || path.hasAttribute('data-detached-delay-segment')
    })
    const pill = root?.querySelector('[data-testid="connection-delay-pill"], [data-testid="detached-arrow-delay-pill"]')
    const rects = [...paths.map((path) => path.getBoundingClientRect()), ...(pill ? [pill.getBoundingClientRect()] : [])]
    const left = Math.min(...rects.map((rect) => rect.left))
    const top = Math.min(...rects.map((rect) => rect.top))
    const right = Math.max(...rects.map((rect) => rect.right))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    return JSON.stringify({
      x: Math.floor(left + 18),
      y: Math.floor(top - 18),
      width: Math.max(1, Math.ceil(right - left - 36)),
      height: Math.max(1, Math.ceil(bottom - top + 36)),
    })
  })()`))
}

async function pointOn(page, shapeId, fraction = 0.5) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="${shapeId}"]')
    const path = root.querySelector('path[data-edge-type], path[data-delay-segment]')
    const point = path.getPointAtLength(path.getTotalLength() * ${fraction})
    const matrix = path.getScreenCTM()
    return JSON.stringify({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    })
  })()`))
}

async function clickMenuItem(page, selector, label) {
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, label, 8000)
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
  await delay(320)
}

async function arrowStates(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shapes = editor.getCurrentPageShapes()
    const descendants = (parentId) => {
      const result = []
      for (const childId of editor.getSortedChildIdsForParent(parentId)) {
        const child = editor.getShape(childId)
        if (!child) continue
        result.push(child, ...descendants(child.id))
      }
      return result
    }
    return JSON.stringify(shapes
      .filter((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.kind === 'connection')
      .map((shape) => {
        const root = document.querySelector('[data-shape-id="' + shape.id + '"]')
        const record = shape.meta.systemSketch
        const pillGroup = shapes.find((candidate) => candidate.type === 'group'
          && candidate.meta?.systemSketch?.kind === 'connection-delay-pill'
          && candidate.meta.systemSketch.arrowId === shape.id)
        const pillShapes = pillGroup ? descendants(pillGroup.id) : []
        const pillText = pillShapes.find((candidate) => candidate.type === 'text')
        const text = pillText?.props?.richText?.content?.[0]?.content?.[0]?.text ?? null
        return {
          id: shape.id,
          routing: record.routing,
          rebuildWithBlocks: record.rebuildWithBlocks,
          temporal: record.temporal,
          delayValue: record.delayValue,
          kind: shape.props.kind,
          dash: shape.props.dash,
          exact: Boolean(root?.querySelector('[data-systemsketch-detached-edge="exact"]')),
          presentationBody: Boolean(root?.querySelector('.systemsketch-detached-arrow-presentation__body')),
          pill: pillGroup ? {
            types: pillShapes.map((candidate) => candidate.type).sort(),
            text,
          } : null,
          bindings: editor.getBindingsFromShape(shape.id, 'arrow').length,
        }
      })
      .sort((a, b) => (a.temporal + a.routing).localeCompare(b.temporal + b.routing)))
  })()`))
}

async function moveShape(page, shapeId, dx, dy) {
  await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([${JSON.stringify(shapeId)}]); true`)
  await delay(120)
  const before = JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    return JSON.stringify(editor.pageToScreen(bounds.center))
  })()`))
  await drag(page, before, { x: before.x + dx, y: before.y + dy })
  await delay(260)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'detached-connection-presentation',
    build: 'detached-connection-presentation',
    width: 1500,
    height: 920,
  })
  const { page, port, filesRoot } = app
  const crops = []

  try {
    const board = join(filesRoot, 'SystemSketch', 'detached-connection-presentation.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor')
    await evaluate(page, `localStorage.setItem('systemsketch.cable-presentation.v1', JSON.stringify({ solidBeforePill: true })); true`)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'editor with split delayed presentation')
    await delay(450)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const block = (id, title, x, y, inputs, outputs) => ({
        id, type: 'block', x, y,
        props: { title, blockType: 'Function', view: 'port', w: 250, h: 150, inputs, outputs },
      })
      const input = [{ id: 'in_1', name: 'value', type: 'float', visible: true }]
      const output = [{ id: 'out_1', name: 'result', type: 'float', visible: true }]
      const cable = (id, routing, temporal, delayValue = '') => ({
        id, type: 'connection', x: 0, y: 0,
        props: {
          start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing,
          curve: null, pins: [], elbowRoute: null, routeMode: 'automatic',
          temporal, delayValue, pillPosition: temporal === 'delayed' ? 0.58 : 0.5,
        },
      })
      editor.createShapes([
        block('shape:source', 'source', 70, 120, [], output),
        block('shape:middle', 'middle', 580, 100, input, output),
        block('shape:sink', 'sink', 1090, 120, input, []),
        cable('shape:delayed', 'elbow', 'delayed', '11'),
        cable('shape:async-block', 'curved', 'async'),
        block('shape:direct-source', 'direct source', 130, 540, [], output),
        block('shape:direct-sink', 'direct sink', 920, 500, input, []),
        cable('shape:async-direct', 'straight', 'async'),
      ])
      editor.createBindings([
        { type: 'connection', fromId: 'shape:delayed', toId: 'shape:source', props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:delayed', toId: 'shape:middle', props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
        { type: 'connection', fromId: 'shape:async-block', toId: 'shape:middle', props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:async-block', toId: 'shape:sink', props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
        { type: 'connection', fromId: 'shape:async-direct', toId: 'shape:direct-source', props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:async-direct', toId: 'shape:direct-sink', props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
      ])
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="connection"]').length === 3`, 'three semantic cables')
    await delay(420)

    const beforeRects = {}
    for (const id of ['shape:delayed', 'shape:async-block', 'shape:async-direct']) {
      beforeRects[id] = await corridor(page, id)
      const path = join(ASSETS, `detached-connection-${id.slice(6)}-before.png`)
      await clip(page, path, beforeRects[id])
      crops.push({ key: id.slice(6), before: path, rect: beforeRects[id] })
    }
    await shot(page, BEFORE)

    // A connection has its own detach action; neither endpoint Block is touched.
    const directPoint = await pointOn(page, 'shape:async-direct', 0.5)
    await clickAt(page, directPoint.x, directPoint.y, 'right')
    const detachSelector = '[data-testid="context-menu.connection-detach-to-arrow"]'
    await waitFor(page, `document.querySelector(${JSON.stringify(detachSelector)})`, 'Detach arrow action')
    const detachLabel = await evaluate(page, `document.querySelector(${JSON.stringify(detachSelector)}).textContent.trim()`)
    assert.equal(detachLabel, 'Detach arrow')
    await clickMenuItem(page, detachSelector, 'Detach arrow')

    // Detaching the middle Block converts its two cables through the same path.
    const middle = await box(page, '[data-shape-id="shape:middle"] .systemsketch-block-canvas')
    await clickAt(page, middle.cx, middle.cy, 'right')
    await clickMenuItem(page, '[data-testid="context-menu.block-detach-to-primitives"]', 'Detach to primitives')
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.kind === 'connection').length === 3`, 'three detached arrows')
    await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
    await delay(320)

    const immediate = await arrowStates(page)
    const exported = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const ids = editor.getCurrentPageShapes()
        .filter((shape) => (shape.type === 'arrow' && shape.meta?.systemSketch?.kind === 'connection')
          || (shape.type === 'group' && shape.meta?.systemSketch?.kind === 'connection-delay-pill'))
        .map((shape) => shape.id)
      const result = await editor.getSvgString(ids, { background: false })
      const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
      return JSON.stringify({
        pathCount: svg.querySelectorAll('path').length,
        text: Array.from(svg.querySelectorAll('text')).map((node) => node.textContent),
        customPresentationNodes: svg.querySelectorAll(
          '[data-systemsketch-detached-edge], [data-detached-edge-type], [data-detached-delay-segment], .systemsketch-detached-arrow-presentation__body',
        ).length,
      })
    })()`))
    await shot(page, AFTER)
    for (const item of crops) {
      item.after = join(ASSETS, `detached-connection-${item.key}-after.png`)
      await clip(page, item.after, item.rect)
      const { stdout } = await execFileAsync('python3', [
        join(ROOT, 'tests', 'detach_fidelity_score.py'), item.before, item.after,
        join(ASSETS, `detached-connection-${item.key}-diff.png`),
      ])
      item.score = JSON.parse(stdout.trim())
    }

    const middleGroup = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'block' && shape.meta.systemSketch.props.title === 'middle')?.id`)
    assert.ok(middleGroup)
    await moveShape(page, middleGroup, 80, 75)
    await moveShape(page, 'shape:direct-sink', 80, -55)
    await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
    await delay(320)
    const moved = await arrowStates(page)
    await shot(page, MOVED)
    await delay(1300)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.kind === 'connection').length === 3`, 'detached arrows restored')
    await delay(350)
    const reloaded = await arrowStates(page)

    const asyncArrows = immediate.filter((arrow) => arrow.temporal === 'async')
    const delayedArrow = immediate.find((arrow) => arrow.temporal === 'delayed')
    const checks = {
      standaloneMenuActionExists: detachLabel === 'Detach arrow',
      standaloneAndBlockDetachBothConvert: immediate.length === 3,
      standaloneStaysIndependent: immediate.filter((arrow) => !arrow.rebuildWithBlocks).length === 1,
      nativeStockGeometryFromFirstFrame: immediate.every((arrow) => !arrow.exact && !arrow.presentationBody),
      temporalStockStyles: asyncArrows.length === 2
        && asyncArrows.every((arrow) => arrow.dash === 'dashed')
        && delayedArrow?.dash === 'dotted',
      delayedUsesStockPill: delayedArrow?.pill?.text === 'z⁻¹ = 11'
        && JSON.stringify(delayedArrow.pill.types) === JSON.stringify(['geo', 'text']),
      svgExportHasNoCustomPresentation: exported.pathCount >= 3
        && exported.customPresentationNodes === 0,
      edgeCropsMeasured: crops.every((item) => Number.isFinite(item.score.score)),
      movementKeepsStockGeometry: moved.length === 3 && moved.every((arrow) => !arrow.exact && !arrow.presentationBody),
      movementKeepsStockSemantics: moved.filter((arrow) => arrow.temporal === 'async').every((arrow) => arrow.dash === 'dashed')
        && moved.find((arrow) => arrow.temporal === 'delayed')?.pill?.text === 'z⁻¹ = 11',
      bindingsRemainLive: moved.every((arrow) => arrow.bindings === 2),
      reloadKeepsStockSemantics: reloaded.length === 3
        && reloaded.filter((arrow) => arrow.temporal === 'async').every((arrow) => arrow.dash === 'dashed')
        && reloaded.find((arrow) => arrow.temporal === 'delayed')?.pill?.text === 'z⁻¹ = 11',
      noConsoleErrors: localConsoleErrors(page).length === 0,
    }
    const result = {
      immediate: immediate.map(({ id: _id, ...arrow }) => arrow),
      moved: moved.map(({ id: _id, ...arrow }) => arrow),
      reloaded: reloaded.map(({ id: _id, ...arrow }) => arrow),
      exported,
      crops: crops.map(({ key, score }) => ({ key, score })),
      checks,
    }
    await writeFile(ACCEPTANCE, JSON.stringify(result, null, 2))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify(result, null, 2))
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
