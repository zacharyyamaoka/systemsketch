#!/usr/bin/env node
/**
 * Same-camera proof that a semantic cable keeps its route and paint when one
 * endpoint Block is detached to stock primitives.
 *
 * The pixel crop contains only the cable corridor.  Geometry is also sampled
 * directly from the two painted SVG paths so a mostly-empty screenshot cannot
 * hide a visibly different curve.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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
const BEFORE = join(ASSETS, 'detach-edge-fidelity-before.png')
const AFTER = join(ASSETS, 'detach-edge-fidelity-after.png')
const DIFF = join(ASSETS, 'detach-edge-fidelity-diff.png')
const ACCEPTANCE = join(ASSETS, 'detach-edge-fidelity-acceptance.json')

async function capture(page, path, clip) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...clip, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function paintedPath(page, shapeType, samples = 96) {
  const value = await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-type=${JSON.stringify(shapeType)}]')
    if (!root) return null
    const candidates = Array.from(root.querySelectorAll('path'))
      .filter((path) => !path.closest('defs'))
      .map((path) => {
        try { return { path, length: path.getTotalLength() } } catch { return null }
      })
      .filter((entry) => entry && entry.length > 1)
      .sort((a, b) => b.length - a.length)
    const path = candidates[0]?.path
    if (!path) return null
    const length = path.getTotalLength()
    const matrix = path.getScreenCTM()
    const points = []
    for (let index = 0; index <= ${samples}; index += 1) {
      const point = path.getPointAtLength(length * index / ${samples}).matrixTransform(matrix)
      points.push({ x: point.x, y: point.y })
    }
    const css = getComputedStyle(path)
    return JSON.stringify({
      d: path.getAttribute('d'),
      length,
      points,
      stroke: css.stroke,
      strokeWidth: Number.parseFloat(css.strokeWidth),
      strokeLinecap: css.strokeLinecap,
      strokeLinejoin: css.strokeLinejoin,
    })
  })()`)
  if (!value) throw new Error(`No painted ${shapeType} path`)
  return JSON.parse(value)
}

function routeError(before, after) {
  const compare = (second) => {
    const distances = before.points.map((point, index) =>
      Math.hypot(point.x - second[index].x, point.y - second[index].y))
    return {
      rms: Math.sqrt(distances.reduce((sum, distance) => sum + distance * distance, 0) / distances.length),
      max: Math.max(...distances),
    }
  }
  const direct = compare(after.points)
  const reversed = compare([...after.points].reverse())
  return direct.rms <= reversed.rms ? direct : reversed
}

async function detachSource(page) {
  const source = await box(page, '[data-shape-id="shape:edge-source"] .systemsketch-block-canvas')
  await clickAt(page, source.cx, source.cy, 'right')
  const selector = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Detach to primitives')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
  await waitFor(page,
    `document.querySelectorAll('[data-shape-type="connection"]').length === 0
      && document.querySelectorAll('[data-shape-type="arrow"]').length === 1`,
    'the cable to become one stock arrow')
  await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
  await delay(350)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'detach-edge-fidelity',
    build: 'detach-edge-fidelity',
    width: 1440,
    height: 820,
  })
  const { page, port, filesRoot } = app
  try {
    const boardPath = join(filesRoot, 'SystemSketch', 'Detach Edge Fidelity.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the editor')
    await delay(500)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        {
          id: 'shape:edge-source', type: 'block', x: 120, y: 320,
          props: {
            title: 'emit()', view: 'port', w: 280, h: 190,
            inputs: [],
            outputs: [{ id: 'out_1', name: 'out_1', type: 'Float', visible: true }],
          },
        },
        {
          id: 'shape:edge-target', type: 'block', x: 900, y: 150,
          props: {
            title: 'normalize()', view: 'port', w: 300, h: 190,
            inputs: [{ id: 'in_1', name: 'in_1', type: 'Float', visible: true }],
            outputs: [],
          },
        },
        {
          id: 'shape:edge-cable', type: 'connection', x: 0, y: 0,
          props: {
            start: { x: 0, y: 0 }, end: { x: 100, y: 0 },
            routing: 'curved', curve: null, pins: [], elbowRoute: null,
            temporal: 'data', delayValue: '', pillPosition: 0.5,
          },
        },
      ])
      editor.createBindings([
        {
          type: 'connection', fromId: 'shape:edge-cable', toId: 'shape:edge-source',
          props: { portId: 'out_1', terminal: 'start', face: 'outer' },
        },
        {
          type: 'connection', fromId: 'shape:edge-cable', toId: 'shape:edge-target',
          props: { portId: 'in_1', terminal: 'end', face: 'outer' },
        },
      ])
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="connection"]').length === 1`, 'the semantic cable')
    await evaluate(page, 'document.fonts.ready.then(() => true)')
    await delay(450)

    const corridor = JSON.parse(await evaluate(page, `(() => {
      const port = (shape, side, id) => document.querySelector(
        '[data-shape-id="' + shape + '"] .Port[data-block-port-side="' + side + '"][data-block-port-id="' + id + '"]'
      ).getBoundingClientRect()
      const start = port('shape:edge-source', 'output', 'out_1')
      const end = port('shape:edge-target', 'input', 'in_1')
      const startX = start.x + start.width / 2
      const startY = start.y + start.height / 2
      const endX = end.x + end.width / 2
      const endY = end.y + end.height / 2
      return JSON.stringify({
        x: Math.floor(Math.min(startX, endX) + 12),
        y: Math.floor(Math.min(startY, endY) - 120),
        width: Math.ceil(Math.abs(endX - startX) - 24),
        height: Math.ceil(Math.abs(endY - startY) + 240),
      })
    })()`))

    const before = await paintedPath(page, 'connection')
    await capture(page, BEFORE, corridor)
    await detachSource(page)
    const after = await paintedPath(page, 'arrow')
    await capture(page, AFTER, corridor)

    const arrow = JSON.parse(await evaluate(page, `(() => {
      const shape = window.__systemsketch.editor.getCurrentPageShapes().find((entry) => entry.type === 'arrow')
      return JSON.stringify({
        kind: shape?.props.kind,
        dash: shape?.props.dash,
        primitiveStyle: shape?.meta?.systemSketchPrimitiveStyle ?? null,
        remembered: shape?.meta?.systemSketch ?? null,
      })
    })()`))
    const geometry = routeError(before, after)
    const { stdout } = await execFileAsync('python3', [
      join(ROOT, 'tests', 'detach_fidelity_score.py'), BEFORE, AFTER, DIFF,
    ])
    const pixels = JSON.parse(stdout.trim())
    const checks = {
      stockArrowRemembersCable: arrow.kind === 'arc'
        && arrow.remembered?.kind === 'connection'
        && arrow.remembered?.routing === 'curved',
      routeRmsAtMostHalfPixel: geometry.rms <= 0.5,
      routeMaxAtMostOnePixel: geometry.max <= 1,
      pathLengthWithinHalfPixel: Math.abs(before.length - after.length) <= 0.5,
      strokeColorMatches: before.stroke === after.stroke,
      strokeWidthMatches: Math.abs(before.strokeWidth - after.strokeWidth) <= 0.01,
      roundedStrokeMatches: before.strokeLinecap === after.strokeLinecap
        && before.strokeLinejoin === after.strokeLinejoin,
      foregroundSimilarityAtLeast99Percent: pixels.foregroundSimilarity >= 0.99,
      edgeSimilarityAtLeast99Percent: pixels.edgeSimilarity >= 0.99,
      noConsoleErrors: localConsoleErrors(page).length === 0,
    }
    const compactPath = ({ d, length, stroke, strokeWidth, strokeLinecap, strokeLinejoin }) => ({
      d, length, stroke, strokeWidth, strokeLinecap, strokeLinejoin,
    })
    const result = {
      corridor,
      before: compactPath(before),
      after: compactPath(after),
      geometry,
      pixels,
      arrow: {
        kind: arrow.kind,
        dash: arrow.dash,
        exactPathSnapshot: arrow.primitiveStyle?.kind === 'arrow' && Boolean(arrow.primitiveStyle.path),
        remembered: arrow.remembered,
      },
      checks,
    }
    await writeFile(ACCEPTANCE, JSON.stringify(result, null, 2))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (Object.values(checks).some((ok) => !ok)) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
