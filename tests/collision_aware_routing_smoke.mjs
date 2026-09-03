#!/usr/bin/env node
/** Painted-path proof for Block and Branch collision-aware Tidy routing. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  newPage,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const BLOCK_BEFORE = join(ASSETS, 'collision-aware-routing-block-before-2026-09-02.png')
const BLOCK_AFTER = join(ASSETS, 'collision-aware-routing-block-after-2026-09-02.png')
const BRANCH_BEFORE = join(ASSETS, 'collision-aware-routing-branch-before-2026-09-02.png')
const BRANCH_AFTER = join(ASSETS, 'collision-aware-routing-branch-after-2026-09-02.png')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
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

async function paintedPathSamples(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="${shapeId}"] path')
    if (!path) throw new Error('missing painted path ${shapeId}')
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const samples = []
    for (let index = 0; index <= 400; index += 1) {
      const point = path.getPointAtLength(length * index / 400)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      samples.push({ x: screen.x, y: screen.y })
    }
    return JSON.stringify(samples)
  })()`))
}

async function elementRect(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('missing element ' + ${JSON.stringify(selector)})
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function elementRects(page, selector) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify(
    Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    })))()`))
}

function pathHitsRect(points, rect, inset = 2) {
  return points.some((point) => point.x > rect.x + inset && point.x < rect.x + rect.w - inset
    && point.y > rect.y + inset && point.y < rect.y + rect.h - inset)
}

const SEED_BLOCK_COLLISION = `(() => {
  const editor = window.__systemsketch.editor
  const block = (id, x, y, title, inputs, outputs) => ({
    id, type: 'block', x, y,
    props: {
      w: 280, h: 210, title, view: 'port',
      inputs: inputs.map((name, index) => ({ id: 'in' + index, name, type: 'Data', visible: true })),
      outputs: outputs.map((name, index) => ({ id: 'out' + index, name, type: 'Data', visible: true })),
    },
  })
  const source = block('shape:collision-source', 80, 300, 'source()', [], ['data'])
  const blocker = block('shape:collision-blocker', 510, 170, 'decode()', ['raw'], ['frame'])
  blocker.props.h = 390
  const target = block('shape:collision-target', 980, 300, 'target()', ['data'], [])
  const edge = {
    id: 'shape:collision-edge', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
      pins: [], elbowRoute: null, routeMode: 'automatic',
    },
  }
  editor.run(() => {
    editor.createShapes([source, blocker, target])
    editor.createShape(edge)
    editor.createBindings([
      { type: 'connection', fromId: edge.id, toId: source.id,
        props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: target.id,
        props: { portId: 'in0', terminal: 'end', face: 'outer' } },
    ])
  })
  editor.select(edge.id)
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

const SEED_BRANCH_COLLISION = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes(editor.getCurrentPageShapes().map((shape) => shape.id))
  const source = {
    id: 'shape:branch-source', type: 'block', x: 40, y: 150,
    props: {
      w: 280, h: 210, title: 'incoming()', view: 'port', inputs: [],
      outputs: [{ id: 'out0', name: 'frame', type: 'Frame', visible: true }],
    },
  }
  const branch = {
    id: 'shape:routing-branch', type: 'branch', x: 430, y: 80,
    props: {
      w: 620, h: 474, title: 'Branch', view: 'expanded', activeArmId: null, controls: [],
      arms: [
        { id: 'arm_1', title: 'if', open: true, h: 180 },
        { id: 'arm_2', title: 'else', open: true, h: 180 },
      ],
    },
  }
  const target = {
    id: 'shape:branch-target', type: 'block', parentId: branch.id, x: 230, y: 306,
    meta: { branchArm: 'arm_2' },
    props: {
      w: 280, h: 150, title: 'fallback()', view: 'port',
      inputs: [{ id: 'in0', name: 'frame', type: 'Frame', visible: true }], outputs: [],
    },
  }
  const edge = {
    id: 'shape:branch-edge', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
      pins: [], elbowRoute: null, routeMode: 'automatic',
    },
  }
  editor.run(() => {
    editor.createShapes([source, branch])
    editor.createShape(target)
    editor.createShape(edge)
    editor.createBindings([
      { type: 'connection', fromId: edge.id, toId: source.id,
        props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: target.id,
        props: { portId: 'in0', terminal: 'end', face: 'outer' } },
    ])
  })
  editor.select(edge.id)
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-collision-aware-routing',
    build: 'collision-aware-routing-smoke',
    width: 1500,
    height: 980,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'collision-aware-routing.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)

    await evaluate(app.page, SEED_BLOCK_COLLISION)
    await delay(600)
    const blocker = await elementRect(app.page, '[data-shape-id="shape:collision-blocker"] .systemsketch-block-canvas')
    const beforeBlockPath = await paintedPathSamples(app.page, 'shape:collision-edge')
    assert.equal(pathHitsRect(beforeBlockPath, blocker), true)
    await capture(app.page, BLOCK_BEFORE)

    const blockPositions = JSON.parse(await evaluate(app.page, `JSON.stringify(
      ['shape:collision-source','shape:collision-blocker','shape:collision-target']
        .map((id) => { const shape = window.__systemsketch.editor.getShape(id); return { id, x: shape.x, y: shape.y } }))`))
    await runTidy(app.page)
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:collision-edge').props.elbowRoute !== null
      && window.__systemsketch.editor.getShape('shape:collision-edge').props.routeMode === 'automatic'`, 'automatic obstacle route')
    const afterBlockPath = await paintedPathSamples(app.page, 'shape:collision-edge')
    assert.equal(pathHitsRect(afterBlockPath, blocker), false)
    assert.deepEqual(JSON.parse(await evaluate(app.page, `JSON.stringify(
      ['shape:collision-source','shape:collision-blocker','shape:collision-target']
        .map((id) => { const shape = window.__systemsketch.editor.getShape(id); return { id, x: shape.x, y: shape.y } }))`)), blockPositions)
    await capture(app.page, BLOCK_AFTER)
    pass('Tidy reroutes an automatic elbow around an intervening Block without moving any Block')

    const branchPage = await newPage(app.cdpPort)
    const branchBoard = join(app.filesRoot, 'SystemSketch', 'collision-aware-routing-branch.systemsketch')
    await openApp(branchPage, app.port, `?board=${encodeURIComponent(branchBoard)}`)
    await waitFor(branchPage, 'window.__systemsketch?.editor', 'Branch scratch board editor', 30_000)
    await evaluate(branchPage, SEED_BRANCH_COLLISION)
    await delay(600)
    const beforeBranchPath = await paintedPathSamples(branchPage, 'shape:branch-edge')
    const band = await elementRect(branchPage, '[data-shape-id="shape:routing-branch"] .Branch-band')
    const headers = await elementRects(branchPage, '[data-shape-id="shape:routing-branch"] .Branch-armHeader')
    const branchRect = await elementRect(branchPage, '[data-shape-id="shape:routing-branch"] .systemsketch-branch-canvas')
    const forbiddenIfBody = {
      x: branchRect.x,
      y: headers[0].y + headers[0].h,
      w: branchRect.w,
      h: headers[1].y - (headers[0].y + headers[0].h),
    }
    assert.equal(
      pathHitsRect(beforeBranchPath, band)
        || headers.some((rect) => pathHitsRect(beforeBranchPath, rect))
        || pathHitsRect(beforeBranchPath, forbiddenIfBody),
      true,
    )
    await capture(branchPage, BRANCH_BEFORE)

    await runTidy(branchPage)
    await waitFor(branchPage, `window.__systemsketch.editor.getShape('shape:branch-edge').props.elbowRoute !== null`, 'Branch-aware route')
    const afterBranchPath = await paintedPathSamples(branchPage, 'shape:branch-edge')
    assert.equal(pathHitsRect(afterBranchPath, band), false)
    assert.equal(headers.some((rect) => pathHitsRect(afterBranchPath, rect)), false)
    assert.equal(pathHitsRect(afterBranchPath, forbiddenIfBody), false)
    await capture(branchPage, BRANCH_AFTER)
    pass('Tidy enters only the target Branch arm and avoids the band, headers, and sibling arm')

    const authoredBefore = JSON.parse(await evaluate(branchPage, `(() => {
      const editor = window.__systemsketch.editor
      editor.updateShape({ id: 'shape:branch-edge', type: 'connection', props: { routeMode: 'authored' } })
      return JSON.stringify(editor.getShape('shape:branch-edge').props)
    })()`))
    await runTidy(branchPage)
    const authoredAfter = JSON.parse(await evaluate(branchPage, `JSON.stringify(
      window.__systemsketch.editor.getShape('shape:branch-edge').props)`))
    assert.deepEqual(authoredAfter, authoredBefore)
    pass('Tidy preserves an authored route byte-for-byte')
    assert.deepEqual(localConsoleErrors(branchPage), [])
    branchPage.close()

    const reviewFixture = join(app.filesRoot, 'SystemSketch', 'collision-aware-routing-review.systemsketch')
    await copyFile(join(ROOT, 'sketches', 'review', 'collision-aware-routing.systemsketch'), reviewFixture)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(reviewFixture)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:source')`, 'collision review fixture', 30_000)
    await delay(500)

    const sourceBeforeDrag = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    const cueBoundsBeforeDrag = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    await drag(app.page,
      { x: sourceBeforeDrag.x + sourceBeforeDrag.w / 2, y: sourceBeforeDrag.y + 30 },
      { x: sourceBeforeDrag.x + sourceBeforeDrag.w / 2 + 80, y: sourceBeforeDrag.y + 30 })
    const sourceAfterDrag = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    const cueBoundsAfterDrag = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    assert.ok(sourceAfterDrag.x - sourceBeforeDrag.x > 60)
    assert.ok(Math.max(
      Math.abs(cueBoundsAfterDrag.x - cueBoundsBeforeDrag.x),
      Math.abs(cueBoundsAfterDrag.w - cueBoundsBeforeDrag.w),
    ) > 40)
    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page,
      `Math.abs(document.querySelector('[data-shape-id="shape:source"] .systemsketch-block-canvas').getBoundingClientRect().x - ${sourceBeforeDrag.x}) < 2`,
      'review fixture target move undo')
    pass('the review fixture cue remains attached when its target Block moves')

    const reviewSource = await elementRect(app.page, '[data-shape-id="shape:source"] .systemsketch-block-canvas')
    const reviewBlocker = await elementRect(app.page, '[data-shape-id="shape:blocker"] .systemsketch-block-canvas')
    assert.equal(pathHitsRect(await paintedPathSamples(app.page, 'shape:collision-edge'), reviewBlocker), true)
    await clickAt(app.page, reviewSource.x + reviewSource.w / 2, reviewSource.y + 30)
    await waitFor(app.page, `window.__systemsketch.editor.getSelectedShapeIds().includes('shape:source')`, 'review source selection')
    await runTidy(app.page)
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:collision-edge').props.elbowRoute !== null`, 'review fixture collision route')
    assert.equal(pathHitsRect(await paintedPathSamples(app.page, 'shape:collision-edge'), reviewBlocker), false)
    pass('the saved review fixture completes its visible collision-aware Tidy gesture')

    const reportPage = await newPage(app.cdpPort)
    await openApp(reportPage, app.port, 'docs/collision-aware-routing-2026-09-02.html')
    await waitFor(reportPage, `document.querySelector('h1')?.textContent.includes("where they don’t belong")`, 'implementation gallery')
    const branchImageBefore = await evaluate(reportPage, `document.querySelector('[data-case="branch"] img').src`)
    await evaluate(reportPage, `document.querySelector('[data-case="branch"] [data-show="after"]').scrollIntoView({ block: 'center' })`)
    await clickElement(reportPage, '[data-case="branch"] [data-show="after"]')
    const branchImageAfter = await evaluate(reportPage, `document.querySelector('[data-case="branch"] img').src`)
    assert.notEqual(branchImageAfter, branchImageBefore)
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.stage').length`), 5)
    reportPage.close()
    pass('the self-contained gallery renders and its before/after comparison is interactive')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the painted-path journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
    for (const path of [BLOCK_BEFORE, BLOCK_AFTER, BRANCH_BEFORE, BRANCH_AFTER]) {
      process.stdout.write(`  ${path}\n`)
    }
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
