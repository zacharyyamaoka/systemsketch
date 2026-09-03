#!/usr/bin/env node
/** Focused real-browser proof for the endpoint-clearance review fixture. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'collision-routing-endpoint-clearance.systemsketch')
const SCREENSHOT = join(ROOT, 'docs', 'assets', 'collision-routing-endpoint-clearance-after.png')
const { checks, pass } = makeChecklist()

async function elementRect(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('missing element ' + ${JSON.stringify(selector)})
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function paintedPathSamples(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="${shapeId}"] path')
    if (!path) throw new Error('missing painted path ${shapeId}')
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const samples = []
    for (let index = 0; index <= 800; index += 1) {
      const point = path.getPointAtLength(length * index / 800)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      samples.push({ x: screen.x, y: screen.y })
    }
    return JSON.stringify(samples)
  })()`))
}

function pathHitsRect(points, rect, inset = 1.5) {
  return points.some((point) => point.x > rect.x + inset && point.x < rect.x + rect.w - inset
    && point.y > rect.y + inset && point.y < rect.y + rect.h - inset)
}

async function runTidy(page) {
  await shortcut(page, 'p', 'KeyP', 2)
  await waitFor(page, `document.querySelector('[aria-label="Search commands"]')`, 'command palette')
  await typeSlowly(page, 'tidy edges')
  await waitFor(page, `document.querySelector('[data-command-id="tidy-edges"]')`, 'Tidy edges command')
  await key(page, 'Enter', 'Enter')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'Tidy completion')
  await delay(400)
}

async function shapePositions(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    ['shape:source', 'shape:blocker', 'shape:target'].map((id) => {
      const shape = window.__systemsketch.editor.getShape(id)
      return { id, x: shape.x, y: shape.y }
    }))`))
}

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: 'collision-routing-endpoint-fixture',
    build: 'collision-routing-endpoint-fixture-smoke',
    width: 1600,
    height: 900,
  })
  const scratchFixture = join(app.filesRoot, 'SystemSketch', 'collision-routing-endpoint-clearance.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await ensureDir(join(ROOT, 'docs', 'assets'))
    await copyFile(FIXTURE, scratchFixture)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(scratchFixture)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:source')`, 'endpoint fixture', 30_000)
    await waitFor(app.page,
      `document.querySelector('[data-shape-id="shape:source"] .systemsketch-block-canvas')`,
      'painted endpoint fixture', 30_000)
    await delay(500)

    const sourceBeforeDrag = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    const cueBeforeDrag = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    await drag(app.page,
      { x: sourceBeforeDrag.x + sourceBeforeDrag.w / 2, y: sourceBeforeDrag.y + 30 },
      { x: sourceBeforeDrag.x + sourceBeforeDrag.w / 2 + 80, y: sourceBeforeDrag.y + 30 })
    const sourceAfterDrag = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    const cueAfterDrag = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    assert.ok(sourceAfterDrag.x - sourceBeforeDrag.x > 60)
    assert.ok(Math.max(
      Math.abs(cueAfterDrag.x - cueBeforeDrag.x),
      Math.abs(cueAfterDrag.w - cueBeforeDrag.w),
    ) > 40)
    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page,
      `Math.abs(document.querySelector('[data-shape-id="shape:source"] .systemsketch-block-canvas')
        .getBoundingClientRect().x - ${sourceBeforeDrag.x}) < 2`,
      'fixture target move undo')
    pass('the Step 1 cue remains attached when source() moves')

    const fixedPositions = await shapePositions(app.page)
    const blocker = await elementRect(app.page, '[data-shape-id="shape:blocker"] .systemsketch-block-canvas')
    assert.equal(pathHitsRect(await paintedPathSamples(app.page, 'shape:collision-edge'), blocker), true)

    const source = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    await clickAt(app.page, source.x + source.w / 2, source.y + 30)
    await waitFor(app.page,
      `window.__systemsketch.editor.getSelectedShapeIds().includes('shape:source')`,
      'source selection')
    await runTidy(app.page)
    await waitFor(app.page, `(() => {
      const props = window.__systemsketch.editor.getShape('shape:collision-edge').props
      return props.routeMode === 'automatic' && props.elbowRoute !== null
    })()`, 'automatic endpoint route')

    assert.equal(pathHitsRect(await paintedPathSamples(app.page, 'shape:collision-edge'), blocker), false)
    assert.deepEqual(await shapePositions(app.page), fixedPositions)
    pass('Tidy clears decode() while all three Blocks remain fixed')

    const routeProps = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShape('shape:collision-edge').props)`))
    assert.equal(routeProps.routeMode, 'automatic')
    const stableRoute = JSON.stringify(routeProps.elbowRoute)
    await runTidy(app.page)
    const rerunProps = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShape('shape:collision-edge').props)`))
    assert.equal(JSON.stringify(rerunProps.elbowRoute), stableRoute)
    pass('the focused endpoint route remains automatic and is idempotent')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the focused fixture journey produces zero local console errors')
    await capture(app.page, SCREENSHOT)

    process.stdout.write(`\n  ${checks.length}/${checks.length} focused fixture checks passed\n`)
    process.stdout.write(`  ${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
