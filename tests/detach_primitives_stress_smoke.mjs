#!/usr/bin/env node
/**
 * Fifty real detach journeys, arranged from ordinary cases to the composite
 * edge cases that previously hid behind four friendly screenshots. Each case
 * is captured before and after its own context-menu action; the resulting
 * whole document is then opened by the bare `?stock-viewer=` route, which has
 * no SystemSketch renderer registrations at all.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  ROOT,
  clickAt,
  delay,
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
const ACCEPTANCE = join(ASSETS, 'detach-primitives-stress-acceptance.json')
const STOCK_FILE = join(ASSETS, 'detach-primitives-stress.tldr')
const STOCK_VIEW = join(ASSETS, 'detach-primitives-stress-stock-viewer.png')

const CATEGORIES = ['blocks', 'branches', 'loops', 'multi-elbows', 'nested']
const CASE_W = 340
const CASE_H = 244
const STEP_X = 408
const STEP_Y = 330

function rich(text) {
  return text
}

function position(row, column) {
  return { x: 100 + column * STEP_X, y: 100 + row * STEP_Y, w: CASE_W, h: CASE_H }
}

function port(id, name, type = 'Signal') {
  return { id, name, type, visible: true }
}

function caseDefinition(category, index, rect) {
  const id = `shape:stress-${category}-${index + 1}`
  const title = `${category.slice(0, -1)} ${index + 1}`
  if (category === 'blocks') {
    const views = ['simple', 'port', 'expanded', 'port', 'simple', 'expanded', 'port', 'simple', 'expanded', 'port']
    const view = views[index]
    return {
      id, category, ordinal: index + 1, title: `${view} · ${title}`, rect,
      shape: {
        id, type: 'block', x: rect.x, y: rect.y,
        props: {
          title: `normalize_${index + 1}()`, blockType: index % 2 ? 'Function' : 'Transform', view,
          w: CASE_W, h: CASE_H,
          description: index % 3 === 0 ? 'Stress case with a real stored description.' : '',
          showDescription: index % 3 === 0,
          inputs: Array.from({ length: 1 + (index % 3) }, (_, n) => port(`in_${n}`, `input ${n + 1}`, n ? 'Tensor' : 'Image')),
          outputs: Array.from({ length: 1 + ((index + 1) % 3) }, (_, n) => port(`out_${n}`, `output ${n + 1}`, n ? 'Mask' : 'Result')),
        },
      },
    }
  }
  if (category === 'branches') {
    const armCount = 2 + (index % 3)
    const arms = Array.from({ length: armCount }, (_, n) => ({
      id: `arm_${n}`, title: ['yes', 'no', 'maybe', 'fallback'][n], open: (index + n) % 3 !== 1, h: 48 + ((index + n) % 3) * 24,
    }))
    return {
      id, category, ordinal: index + 1, title: `${armCount} arms · ${title}`, rect,
      shape: {
        id, type: 'branch', x: rect.x, y: rect.y,
        props: {
          w: CASE_W, h: CASE_H, title: ['Choose path', 'Validate result', 'Retry policy'][index % 3],
          view: index % 2 ? 'case' : 'expanded', activeArmId: index % 4 === 3 ? null : arms[index % arms.length].id,
          controls: Array.from({ length: 1 + (index % 3) }, (_, n) => {
            const { visible: _visible, ...control } = port(`control_${n}`, ['is valid', 'has cache', 'manual override'][n], n ? 'bool' : 'Bool')
            return control
          }),
          arms,
        },
      },
    }
  }
  if (category === 'loops') {
    return {
      id, category, ordinal: index + 1, title: `${index % 2 ? 'while' : 'for'} · ${title}`, rect,
      shape: {
        id, type: 'loop', x: rect.x, y: rect.y,
        props: {
          w: CASE_W, h: CASE_H,
          title: ['For every detection', 'For each frame', 'While pending', 'For every batch'][index % 4],
          iterable: { id: 'iterable', type: ['Detections', 'Frames', 'Tasks', 'Batch'][index % 4] },
          item: { id: 'item', type: ['Detection', 'Frame', 'Task', 'Tensor'][index % 4] },
          turn: index % 3 === 0 ? `turn ${index + 1} / 12` : '',
        },
      },
    }
  }
  if (category === 'multi-elbows') {
    const cornerCount = 2 + (index % 5)
    const corners = Array.from({ length: cornerCount }, (_, n) => ({
      tx: (n + 1) / (cornerCount + 1),
      ox: n % 2 ? -42 - index * 2 : 42 + index * 2,
      ty: n % 2 ? 0.72 : 0.28,
      oy: n % 2 ? 42 + index * 3 : -42 - index * 3,
    }))
    return {
      id, category, ordinal: index + 1, title: `${cornerCount + 1} rails · ${title}`, rect,
      shape: {
        id, type: 'connection', x: rect.x + 22, y: rect.y + 42,
        props: {
          start: { x: 0, y: 54 }, end: { x: CASE_W - 44, y: 152 }, routing: 'elbow', temporal: ['data', 'async', 'delayed'][index % 3],
          delayValue: index % 3 === 2 ? String(index + 1) : '', pillPosition: 0.22 + index * 0.05,
          curve: null, pins: index % 2 ? [{ index: 1, axis: 'y', t: 0.5, offset: 22 + index * 3 }] : [],
          elbowRoute: { startAxis: 'x', corners }, routeMode: 'authored',
        },
      },
    }
  }
  // Composite roots intentionally include a nested Expanded Block. The normal
  // selection detach walks descendants; this is the test that catches a parent
  // replacement deleting them or a frame-like survivor clipping the result.
  const isBranch = index % 2 === 0
  const root = isBranch
    ? {
        id, type: 'branch', x: rect.x, y: rect.y,
        props: {
          w: CASE_W, h: CASE_H, title: `Nested choice ${index + 1}`, view: 'expanded', activeArmId: 'yes',
          controls: [(() => { const { visible: _visible, ...control } = port('condition', 'condition', 'Bool'); return control })()],
          arms: [{ id: 'yes', title: 'yes', open: true, h: 108 }, { id: 'no', title: 'no', open: index % 3 !== 0, h: 64 }],
        },
      }
    : {
        id, type: 'loop', x: rect.x, y: rect.y,
        props: {
          w: CASE_W, h: CASE_H, title: `Nested loop ${index + 1}`,
          iterable: { id: 'iterable', type: 'Batch' }, item: { id: 'item', type: 'Item' }, turn: index % 3 ? '' : 'turn 4 / 9',
        },
      }
  return {
    id, category, ordinal: index + 1, title: `${isBranch ? 'Branch' : 'Loop'} + expanded child · ${title}`, rect,
    shape: root,
    children: [{
      id: `${id}-child`, type: 'block', parentId: id, x: 68, y: isBranch ? 100 : 96,
      props: {
        w: 220, h: 104, title: `inside_${index + 1}()`, view: 'expanded',
        inputs: [port('in', 'sample', 'Image')], outputs: [port('out', 'result', 'Result')],
      },
    }],
  }
}

function allCases() {
  return CATEGORIES.flatMap((category, row) => Array.from({ length: 10 }, (_, index) =>
    caseDefinition(category, index, position(row, index))))
}

async function capture(page, path, clip) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { ...clip, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function focusCase(page, rect) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.zoomToBounds(${JSON.stringify(rect)}, { inset: 56, animation: { duration: 0 } })
    const topLeft = editor.pageToViewport({ x: ${rect.x - 22}, y: ${rect.y - 22} })
    const bottomRight = editor.pageToViewport({ x: ${rect.x + rect.w + 22}, y: ${rect.y + rect.h + 22} })
    return JSON.stringify({
      x: Math.floor(topLeft.x), y: Math.floor(topLeft.y),
      width: Math.ceil(bottomRight.x - topLeft.x), height: Math.ceil(bottomRight.y - topLeft.y),
    })
  })()`))
}

async function settleCanvasChrome(page) {
  await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
  const closeSelector = '[aria-label="Close Inspector"], [aria-label="Close Block inspector"], [aria-label="Close Branch inspector"], [aria-label="Close Loop inspector"]'
  const hasClose = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(closeSelector)}))`)
  if (hasClose) {
    const close = await box(page, closeSelector)
    await clickAt(page, close.cx, close.cy)
  }
  await delay(45)
}

async function selectedPoint(page, id, isContainer, isConnection) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.setSelectedShapes([${JSON.stringify(id)}])
    const shape = editor.getShape(${JSON.stringify(id)})
    if (${isConnection}) {
      // An authored multi-elbow can route far away from its bounds centre. Its
      // persisted start is always a real painted point, so right-click there
      // rather than asking hit-testing to guess a middle rail.
      const point = editor.getShapePageTransform(shape).applyToPoint(shape.props.start)
      return JSON.stringify(editor.pageToScreen(point))
    }
    const bounds = editor.getShapePageBounds(${JSON.stringify(id)})
    return JSON.stringify(editor.pageToScreen({
      x: bounds.x + bounds.w / 2,
      y: bounds.y + (${isContainer ? 22 : 'bounds.h / 2'}),
    }))
  })()`))
}

async function detachCase(page, item) {
  const source = join(ASSETS, `detach-stress-${item.category}-${item.ordinal}-before.png`)
  const after = join(ASSETS, `detach-stress-${item.category}-${item.ordinal}-after.png`)
  const diff = join(ASSETS, `detach-stress-${item.category}-${item.ordinal}-diff.png`)
  await settleCanvasChrome(page)
  const clip = await focusCase(page, item.rect)
  await capture(page, source, clip)
  const isConnection = item.category === 'multi-elbows'
  const point = await selectedPoint(page, item.id, !isConnection && item.category !== 'blocks', isConnection)
  await clickAt(page, point.x, point.y, 'right')
  const testId = isConnection ? 'connection-detach-to-arrow' : 'block-detach-to-primitives'
  const selector = `[data-testid="context-menu.${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, `${item.title} menu action`)
  const itemBox = await box(page, selector)
  await clickAt(page, itemBox.cx, itemBox.cy)
  await waitFor(page, `!window.__systemsketch.editor.getShape(${JSON.stringify(item.id)})`, `${item.title} lowered`)
  await settleCanvasChrome(page)
  await delay(70)
  await capture(page, after, clip)
  const { stdout } = await execFileAsync('python3', [join(ROOT, 'tests', 'detach_fidelity_score.py'), source, after, diff])
  return {
    category: item.category, ordinal: item.ordinal, title: item.title,
    before: source.split('/').pop(), after: after.split('/').pop(), diff: diff.split('/').pop(),
    score: JSON.parse(stdout.trim()),
  }
}

async function main() {
  await ensureDir(ASSETS)
  const cases = allCases()
  assert.equal(cases.length, 50)
  const app = await startApp({ label: 'detach-primitives-stress', build: 'detach-primitives-stress', width: 1480, height: 980 })
  const { page, port, filesRoot } = app
  try {
    await openApp(page, port, `?board=${encodeURIComponent(join(filesRoot, 'SystemSketch', 'Detach primitives stress.systemsketch'))}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'SystemSketch authoring canvas')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes(${JSON.stringify(cases.flatMap((item) => [item.shape, ...(item.children ?? [])]))})
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(700)

    const results = []
    for (const item of cases) results.push(await detachCase(page, item))

    const source = await evaluate(page, 'window.__systemsketch.serializeTldraw()')
    await writeFile(STOCK_FILE, source)
    const authoredSummary = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shapes = editor.getCurrentPageShapes()
      return JSON.stringify({
        customShapes: shapes.filter((shape) => ['block', 'branch', 'branch-arm', 'loop', 'connection'].includes(shape.type)).map((shape) => shape.id),
        stockShapes: [...new Set(shapes.map((shape) => shape.type))].sort(),
        frozenPolylines: shapes.filter((shape) => shape.type === 'line'
          && shape.meta?.systemSketch?.kind === 'connection-polyline').length,
      })
    })()`))
    assert.deepEqual(authoredSummary.customShapes, [], `custom survivors: ${authoredSummary.customShapes.join(', ')}`)
    assert.ok(authoredSummary.frozenPolylines >= 10, 'every authored multi-elbow should become a stock Line')

    await openApp(page, port, `?stock-viewer=${encodeURIComponent('/docs/assets/detach-primitives-stress.tldr')}`)
    await waitFor(page, 'window.__stockTldrawViewer', 'bare stock tldraw viewer')
    await delay(500)
    const stockSummary = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__stockTldrawViewer
      const shapes = editor.getCurrentPageShapes()
      return JSON.stringify({
        mounted: Boolean(document.querySelector('[data-testid="stock-tldraw-viewer"] .tl-container')),
        types: [...new Set(shapes.map((shape) => shape.type))].sort(),
        lineCount: shapes.filter((shape) => shape.type === 'line').length,
        errorBoundaries: document.querySelectorAll('.tl-shape-error-boundary').length,
      })
    })()`))
    const stockShot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(STOCK_VIEW, Buffer.from(stockShot.data, 'base64'))

    const checks = {
      fiftyCases: results.length === 50,
      fiveTenCaseFamilies: CATEGORIES.every((category) => results.filter((result) => result.category === category).length === 10),
      noCustomSurvivors: authoredSummary.customShapes.length === 0,
      authoredMultiElbowsUseStockLines: authoredSummary.frozenPolylines >= 10,
      bareStockViewerMounted: stockSummary.mounted,
      bareStockViewerHasLines: stockSummary.lineCount >= 10,
      bareStockViewerNoErrors: stockSummary.errorBoundaries === 0,
      noConsoleErrors: localConsoleErrors(page).length === 0,
      everyVisualScoreMeasured: results.every((result) => Number.isFinite(result.score.score)),
    }
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify({ checks, authoredSummary, stockSummary }, null, 2))
    await writeFile(ACCEPTANCE, `${JSON.stringify({ cases: results, checks, authoredSummary, stockSummary, stockFile: STOCK_FILE.split('/').pop(), stockViewer: STOCK_VIEW.split('/').pop() }, null, 2)}\n`)
    process.stdout.write(`detach primitive stress passed: ${JSON.stringify({ checks, authoredSummary, stockSummary }, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
