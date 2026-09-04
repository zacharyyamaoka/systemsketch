#!/usr/bin/env node
/** Real-canvas proof that Tidy clears a lowered-node near miss without moving nodes. */
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
const BEFORE = join(ASSETS, 'tidy-soft-clearance-before-2026-09-03.png')
const AFTER = join(ASSETS, 'tidy-soft-clearance-after-2026-09-03.png')
const GALLERY = join(ASSETS, 'tidy-soft-clearance-gallery-2026-09-03.png')
const RESULTS = join(ASSETS, 'tidy-soft-clearance-results-2026-09-03.json')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function runTidy(page) {
  await shortcut(page, 'k', 'KeyK', 2)
  await waitFor(page, `document.querySelector('[aria-label="Search commands"]')`, 'command palette')
  await typeSlowly(page, 'tidy edges')
  await waitFor(page, `document.querySelector('[data-command-id="tidy-edges"]')`, 'Tidy edges command')
  await key(page, 'Enter', 'Enter')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'Tidy completion')
  await delay(450)
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const port = (id, name, type) => ({ id, name, type, visible: true })
  const block = (id, parentId, x, y, title, inputs, outputs, w = 220, h = 132, view = 'port') => ({
    id, type: 'block', parentId, x, y,
    props: { w, h, title, view, inputs, outputs },
  })
  const call = block(
    'shape:soft-call', 'page:page', 80, 70, 'call()',
    [port('self', 'self', 'Self'), port('frame', 'frame', 'Frame'), port('gain', 'gain', 'Float')],
    [port('pose', 'pose', 'Pose')], 1360, 600, 'expanded',
  )
  const splitter = block(
    'shape:soft-splitter', call.id, 170, 84, 'splitter',
    [port('in_1', 'in_1', 'Self')], [port('quality', 'quality', 'Float')], 210, 140,
  )
  // Deliberately a little lower: this is the user's near-intersection case.
  const add = block(
    'shape:soft-add', call.id, 470, 170, 'add',
    [port('in_1', 'in_1', 'Float'), port('in_2', 'in_2', 'Float')], [port('out', 'out', 'Float')], 220, 150,
  )
  const adjust = block(
    'shape:soft-adjust', call.id, 820, 135, 'adjust',
    [port('in_1', 'in_1', 'Float'), port('in_2', 'in_2', 'Frame')], [port('out', 'out', 'Pose')], 230, 165,
  )
  const edge = (id) => ({ id, type: 'connection', parentId: call.id, x: 0, y: 0, props: {
    start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow', curve: null,
    pins: [], elbowRoute: null, routeMode: 'automatic',
  } })
  const edges = [
    edge('shape:soft-self'), edge('shape:soft-quality'), edge('shape:soft-gain'),
    edge('shape:soft-frame'), edge('shape:soft-add-out'), edge('shape:soft-pose'),
  ]
  const bind = (edgeId, fromId, fromPort, fromFace, toId, toPort, toFace) => [
    { type: 'connection', fromId: edgeId, toId: fromId, props: { portId: fromPort, terminal: 'start', face: fromFace } },
    { type: 'connection', fromId: edgeId, toId: toId, props: { portId: toPort, terminal: 'end', face: toFace } },
  ]
  const bindings = [
    ...bind(edges[0].id, call.id, 'self', 'inner', splitter.id, 'in_1', 'outer'),
    ...bind(edges[1].id, splitter.id, 'quality', 'outer', add.id, 'in_1', 'outer'),
    ...bind(edges[2].id, call.id, 'gain', 'inner', add.id, 'in_2', 'outer'),
    ...bind(edges[3].id, call.id, 'frame', 'inner', adjust.id, 'in_2', 'outer'),
    ...bind(edges[4].id, add.id, 'out', 'outer', adjust.id, 'in_1', 'outer'),
    ...bind(edges[5].id, adjust.id, 'out', 'outer', call.id, 'pose', 'inner'),
  ]
  editor.run(() => {
    editor.createShape(call)
    editor.createShapes([splitter, add, adjust])
    editor.createShapes(edges)
    editor.createBindings(bindings)
  })
  window.__softClearanceIds = { call: call.id, add: add.id, frame: edges[3].id, gain: edges[2].id }
  editor.select(call.id)
  editor.zoomToSelection({ animation: { duration: 0 } })
  return true
})()`

async function state(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const ids = window.__softClearanceIds
    const route = (id) => {
      const path = document.querySelector('[data-shape-id="' + id + '"] path')
      if (!path) throw new Error('missing painted route ' + id)
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      return Array.from({ length: 361 }, (_, index) => {
        const point = path.getPointAtLength(length * index / 360)
        const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
        return { x: screen.x, y: screen.y }
      })
    }
    const block = (id) => { const shape = editor.getShape(id); return { x: shape.x, y: shape.y } }
    const model = (id) => editor.getShape(id).props.elbowRoute
    return JSON.stringify({
      frame: route(ids.frame), gain: route(ids.gain),
      frameModel: model(ids.frame), gainModel: model(ids.gain), add: block(ids.add),
    })
  })()`))
}

function minimumGap(firstPoints, secondPoints) {
  let gap = Number.POSITIVE_INFINITY
  for (const first of firstPoints) {
    for (const second of secondPoints) {
      gap = Math.min(gap, Math.hypot(first.x - second.x, first.y - second.y))
    }
  }
  return gap
}

function hasStrictCrossing(firstPoints, secondPoints) {
  const orientation = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  for (let firstIndex = 0; firstIndex + 1 < firstPoints.length; firstIndex += 1) {
    const firstStart = firstPoints[firstIndex]
    const firstEnd = firstPoints[firstIndex + 1]
    for (let secondIndex = 0; secondIndex + 1 < secondPoints.length; secondIndex += 1) {
      const secondStart = secondPoints[secondIndex]
      const secondEnd = secondPoints[secondIndex + 1]
      const firstSide = orientation(firstStart, firstEnd, secondStart)
      const secondSide = orientation(firstStart, firstEnd, secondEnd)
      const thirdSide = orientation(secondStart, secondEnd, firstStart)
      const fourthSide = orientation(secondStart, secondEnd, firstEnd)
      if (firstSide * secondSide < -1e-6 && thirdSide * fourthSide < -1e-6) return true
    }
  }
  return false
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-tidy-soft-clearance',
    build: 'tidy-soft-clearance-smoke',
    width: 1640,
    height: 920,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'tidy-soft-clearance.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    assert.equal(await evaluate(app.page, SEED), true)
    await delay(650)

    const before = await state(app.page)
    await capture(app.page, BEFORE)
    await runTidy(app.page)
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:soft-frame').props.elbowRoute !== null`, 'tidied frame route')
    const after = await state(app.page)
    await capture(app.page, AFTER)

    const beforeGap = minimumGap(before.frame, before.gain)
    const afterGap = minimumGap(after.frame, after.gain)
    const beforeCrossing = hasStrictCrossing(before.frame, before.gain)
    const afterCrossing = hasStrictCrossing(after.frame, after.gain)
    assert.deepEqual(after.add, before.add)
    assert.equal(beforeCrossing, true)
    assert.equal(afterCrossing, false)
    assert.ok(afterGap > beforeGap, `expected a larger frame/gain gap, got ${beforeGap} → ${afterGap}`)
    pass(`the lowered add() case removes the frame/gain crossing and improves its screen gap from ${beforeGap}px to ${afterGap}px without moving add()`)

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the real canvas journey has no local console errors')

    // Reopen the byte-identical persisted review fixture—not a seeded in-memory
    // copy—inside the browser's disposable file root.
    const fixturePage = await newPage(app.cdpPort)
    await fixturePage.send('Page.enable')
    await fixturePage.send('Runtime.enable')
    await fixturePage.send('Log.enable')
    await fixturePage.send('Emulation.setDeviceMetricsOverride', {
      width: 1640, height: 920, deviceScaleFactor: 1, mobile: false,
    })
    const fixtureBoard = join(app.filesRoot, 'SystemSketch', 'tidy-soft-clearance-review.systemsketch')
    await copyFile(join(ROOT, 'sketches', 'review', 'tidy-soft-clearance.systemsketch'), fixtureBoard)
    await openApp(fixturePage, app.port, `?board=${encodeURIComponent(fixtureBoard)}`)
    await waitFor(fixturePage,
      `window.__systemsketch?.editor?.getShape('shape:call')`,
      'saved soft-clearance review fixture')
    await clickElement(fixturePage, '[data-shape-id="shape:call"] .BlockNode-headingTitle')
    await waitFor(fixturePage,
      `document.querySelector('[data-testid="selection-action-tidy-edges"]')`,
      'fixture Tidy edges action')
    await clickElement(fixturePage, '[data-testid="selection-action-tidy-edges"]')
    await delay(450)
    assert.equal(await evaluate(fixturePage,
      `Boolean(window.__systemsketch?.editor?.getShape('shape:call'))`), true)
    assert.deepEqual(localConsoleErrors(fixturePage), [])
    fixturePage.close()
    pass('the cold-reopened review fixture completes its visible select-call then Tidy interaction')

    const galleryPage = await newPage(app.cdpPort)
    await galleryPage.send('Page.enable')
    await galleryPage.send('Runtime.enable')
    await galleryPage.send('Log.enable')
    await galleryPage.send('Emulation.setDeviceMetricsOverride', {
      width: 1640, height: 920, deviceScaleFactor: 1, mobile: false,
    })
    await openApp(galleryPage, app.port, 'docs/tidy-soft-clearance-2026-09-03.html')
    await waitFor(galleryPage,
      `document.querySelector('h1')?.textContent.includes('Hard safety')`,
      'soft-clearance gallery')
    assert.equal(await evaluate(galleryPage,
      `document.querySelectorAll('img').length >= 2 && document.body.innerText.includes('Every soft lever')`), true)
    await capture(galleryPage, GALLERY)
    assert.deepEqual(localConsoleErrors(galleryPage), [])
    galleryPage.close()
    pass('the self-contained gallery renders the before/after proof and tuning controls in a real browser')

    await writeFile(RESULTS, JSON.stringify({ beforeGap, afterGap, beforeCrossing, afterCrossing, checks }, null, 2))
    console.log(JSON.stringify({ checks, beforeGap, afterGap, beforeCrossing, afterCrossing }, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
