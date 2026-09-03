#!/usr/bin/env node
/** Painted-path proof for port-label keep-outs and persisted multi-elbow Tidy routes. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
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
const BEFORE = join(ASSETS, 'text-aware-routing-before-2026-09-03.png')
const AFTER = join(ASSETS, 'text-aware-routing-after-2026-09-03.png')
const RESULTS = join(ASSETS, 'text-aware-routing-results-2026-09-03.json')
const GALLERY = join(ASSETS, 'text-aware-routing-gallery-2026-09-03.png')
const ATLAS = join(ASSETS, 'text-aware-routing-atlas-2026-09-03.png')
const TEXT_CLEARANCE = 4
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
  await delay(500)
}

async function paintedPathSamples(page, shapeId, count = 900) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="${shapeId}"] path')
    if (!path) throw new Error('missing painted path ${shapeId}')
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const samples = []
    for (let index = 0; index <= ${count}; index += 1) {
      const point = path.getPointAtLength(length * index / ${count})
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
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height,
        text: element.textContent, shapeId: element.closest('[data-shape-id]')?.getAttribute('data-shape-id') }
    })))()`))
}

function expanded(rect, amount) {
  return { x: rect.x - amount, y: rect.y - amount, w: rect.w + amount * 2, h: rect.h + amount * 2 }
}

function pathHitsRect(points, rect, inset = 0) {
  return points.some((point) => point.x > rect.x + inset && point.x < rect.x + rect.w - inset
    && point.y > rect.y + inset && point.y < rect.y + rect.h - inset)
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const port = (id, name, type) => ({ id, name, type, visible: true })
  const block = (id, parentId, x, y, title, inputs, outputs, w = 250, h = 130, view = 'port') => ({
    id, type: 'block', parentId, x, y,
    props: { w, h, title, view, inputs, outputs },
  })
  const frame = block(
    'shape:text-route-frame', 'page:page', 80, 100, 'run()',
    [
      port('raws', 'raws', 'bytes'),
      port('gain', 'gain', 'float'),
      port('poses', 'poses', 'list[Pose]'),
    ], [], 1300, 620, 'expanded',
  )
  const decode = block(
    'shape:text-route-decode', frame.id, 100, 50, 'decode()',
    [port('raws', 'raws', 'bytes')], [port('frame', '', 'Frame')], 250, 130,
  )
  const estimate = block(
    'shape:text-route-estimate', frame.id, 320, 80, 'estimate()',
    [port('frame', 'frame', 'Frame')], [port('pose', '', 'Pose')], 250, 150,
  )
  const append = block(
    'shape:text-route-append', frame.id, 500, 170, 'poses.append()',
    [port('poses', 'poses', ''), port('pose', 'pose', '')], [port('out', '', 'list[Pose]')], 300, 130,
  )
  const random = block(
    'shape:text-route-random', frame.id, 480, 390, 'random_func',
    [port('items', '', 'list[Pose]')], [port('out', '', 'Pose')], 260, 120,
  )
  const target = block(
    'shape:text-route-target', frame.id, 930, 80, 'len()',
    [port('obj', 'obj', 'Sized')], [port('out', '', 'int')], 260, 130,
  )
  const edge = {
    id: 'shape:text-route-edge', type: 'connection', parentId: frame.id, x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
      pins: [], elbowRoute: null, routeMode: 'automatic',
    },
  }
  editor.run(() => {
    editor.createShape(frame)
    editor.createShapes([decode, estimate, append, random, target])
    editor.createShape(edge)
    editor.createBindings([
      { type: 'connection', fromId: edge.id, toId: frame.id,
        props: { portId: 'poses', terminal: 'start', face: 'inner' } },
      { type: 'connection', fromId: edge.id, toId: target.id,
        props: { portId: 'obj', terminal: 'end', face: 'outer' } },
    ])
  })
  window.__textRouteIds = {
    frame: frame.id, edge: edge.id, target: target.id,
    blockers: [decode.id, estimate.id, append.id, random.id],
  }
  editor.select(frame.id)
  editor.zoomToSelection({ animation: { duration: 0 } })
  editor.select(edge.id)
  return true
})()`

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-text-aware-routing',
    build: 'text-aware-routing-smoke',
    width: 1900,
    height: 980,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'text-aware-routing.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    assert.equal(await evaluate(app.page, SEED), true)
    await delay(700)

    const frameNames = await elementRects(
      app.page,
      '[data-shape-id="shape:text-route-frame"] .BlockNode-portName',
    )
    const sourceName = frameNames.find((rect) => rect.text?.trim() === 'poses')
    assert.ok(sourceName, 'missing poses boundary-port name')
    const beforePath = await paintedPathSamples(app.page, 'shape:text-route-edge')
    assert.equal(pathHitsRect(beforePath, expanded(sourceName, TEXT_CLEARANCE)), true)
    await capture(app.page, BEFORE)
    pass('the initial painted cable enters the visible 4px clearance around the boundary port name')

    const blockPositions = JSON.parse(await evaluate(app.page, `JSON.stringify(
      [window.__textRouteIds.frame, window.__textRouteIds.target, ...window.__textRouteIds.blockers]
        .map((id) => { const shape = window.__systemsketch.editor.getShape(id); return { id, x: shape.x, y: shape.y } }))`))
    await runTidy(app.page)
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:text-route-edge').props.elbowRoute !== null`, 'text-aware route')

    const afterPath = await paintedPathSamples(app.page, 'shape:text-route-edge')
    const textRects = await elementRects(
      app.page,
      '.BlockNode-portName,.BlockNode-portType,.BlockNode-portDefault',
    )
    const ownTerminalText = textRects.filter((rect) => rect.shapeId === 'shape:text-route-frame'
      && ['poses', 'list[Pose]'].includes(rect.text?.trim()))
    const otherText = textRects.filter((rect) => !ownTerminalText.includes(rect))
    assert.equal(ownTerminalText.length, 2)
    assert.equal(ownTerminalText.some((rect) => pathHitsRect(afterPath, rect)), false)
    assert.equal(otherText.some((rect) => pathHitsRect(afterPath, expanded(rect, TEXT_CLEARANCE))), false)
    pass('the cable clears its own painted terminal text while every unrelated label keeps a 4px halo')

    const blockerRects = await Promise.all(
      ['decode', 'estimate', 'append', 'random'].map((name) => elementRect(
        app.page,
        `[data-shape-id="shape:text-route-${name}"] .systemsketch-block-canvas`,
      )),
    )
    assert.equal(blockerRects.some((rect) => pathHitsRect(afterPath, rect, 1)), false)
    pass('the same painted path still clears every structural Block obstacle')

    const model = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShape('shape:text-route-edge').props.elbowRoute)`))
    assert.equal(model.startAxis, 'x')
    assert.equal(model.startLeg, undefined)
    assert.ok(model.corners.length >= 4, `expected at least four persisted corners, got ${model.corners.length}`)
    pass('the persisted automatic route keeps the normal straight terminal leg and at least four elbows')

    assert.deepEqual(JSON.parse(await evaluate(app.page, `JSON.stringify(
      [window.__textRouteIds.frame, window.__textRouteIds.target, ...window.__textRouteIds.blockers]
        .map((id) => { const shape = window.__systemsketch.editor.getShape(id); return { id, x: shape.x, y: shape.y } }))`)), blockPositions)
    pass('Tidy changes only edge geometry; the frame and all five child Blocks remain fixed')

    await evaluate(app.page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)
    await delay(250)
    await capture(app.page, AFTER)
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the real canvas journey produces no local console errors')

    const reportPage = await newPage(app.cdpPort)
    await reportPage.send('Page.enable')
    await reportPage.send('Runtime.enable')
    await reportPage.send('Log.enable')
    await reportPage.send('Emulation.setDeviceMetricsOverride', {
      width: 1500, height: 980, deviceScaleFactor: 1, mobile: false,
    })
    await openApp(reportPage, app.port, 'docs/text-aware-routing-2026-09-03.html')
    await waitFor(reportPage, `document.querySelector('h1')?.textContent.includes('the words')`, 'text-aware routing gallery')
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.atlas-card').length`), 20)
    const afterImage = await evaluate(reportPage, `document.querySelector('#proof').src`)
    await clickElement(reportPage, '[data-show="before"]')
    const beforeImage = await evaluate(reportPage, `document.querySelector('#proof').src`)
    assert.notEqual(beforeImage, afterImage)
    await capture(reportPage, GALLERY)
    await evaluate(reportPage, `document.querySelector('.atlas').scrollIntoView({ block: 'start' })`)
    await delay(250)
    await capture(reportPage, ATLAS)
    assert.deepEqual(localConsoleErrors(reportPage), [])
    reportPage.close()
    pass('the self-contained gallery renders 20 examples and its before/after control changes the evidence frame')

    const fixtureBoard = join(app.filesRoot, 'SystemSketch', 'text-aware-routing-review.systemsketch')
    await copyFile(join(ROOT, 'sketches', 'review', 'text-aware-routing.systemsketch'), fixtureBoard)
    const fixturePage = await newPage(app.cdpPort)
    await fixturePage.send('Page.enable')
    await fixturePage.send('Runtime.enable')
    await fixturePage.send('Log.enable')
    await fixturePage.send('Emulation.setDeviceMetricsOverride', {
      width: 1900, height: 980, deviceScaleFactor: 1, mobile: false,
    })
    await openApp(fixturePage, app.port, `?board=${encodeURIComponent(fixtureBoard)}`)
    await waitFor(fixturePage, `window.__systemsketch?.editor?.getShape('shape:text-route-frame')`, 'saved text-routing review fixture')
    await clickElement(fixturePage, '[data-shape-id="shape:text-route-frame"] .BlockNode-headingTitle')
    await waitFor(fixturePage, `document.querySelector('[data-testid="selection-action-tidy-edges"]')`, 'fixture Tidy edges action')
    await clickElement(fixturePage, '[data-testid="selection-action-tidy-edges"]')
    await waitFor(fixturePage, `window.__systemsketch.editor.getShape('shape:text-route-edge').props.elbowRoute !== null`, 'fixture multi-elbow route')
    const fixturePath = await paintedPathSamples(fixturePage, 'shape:text-route-edge')
    const fixtureText = await elementRects(
      fixturePage,
      '.BlockNode-portName,.BlockNode-portType,.BlockNode-portDefault',
    )
    const fixtureTerminalText = fixtureText.filter((rect) => rect.shapeId === 'shape:text-route-frame'
      && ['poses', 'list[Pose]'].includes(rect.text?.trim()))
    assert.equal(fixtureTerminalText.some((rect) => pathHitsRect(fixturePath, rect)), false)
    assert.equal(fixtureText.filter((rect) => !fixtureTerminalText.includes(rect))
      .some((rect) => pathHitsRect(fixturePath, expanded(rect, TEXT_CLEARANCE))), false)
    assert.deepEqual(localConsoleErrors(fixturePage), [])
    fixturePage.close()
    pass('the cold-reopened review fixture completes its visible select-frame then Tidy interaction')

    const results = {
      checks,
      sourceName,
      textRectCount: textRects.length,
      persistedCorners: model.corners.length,
      storedStartLeg: model.startLeg ?? null,
      effectiveStartLeg: model.startLeg ?? 20,
      screenshots: [BEFORE, AFTER, GALLERY, ATLAS],
    }
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
    process.stdout.write(`  ${RESULTS}\n  ${BEFORE}\n  ${AFTER}\n  ${GALLERY}\n  ${ATLAS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
