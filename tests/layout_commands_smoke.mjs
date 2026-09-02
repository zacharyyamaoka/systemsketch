#!/usr/bin/env node
/** Real-app proof for Tidy edges, Organize nodes, and their 40-case report. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
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
const BEFORE = join(ASSETS, 'layout-commands-live-before-2026-09-02.png')
const TIDIED = join(ASSETS, 'layout-commands-live-tidied-2026-09-02.png')
const ORGANIZED = join(ASSETS, 'layout-commands-live-organized-2026-09-02.png')
const REPORT = join(ASSETS, 'layout-comparison-report-2026-09-02.png')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function runCommand(page, query, id) {
  await shortcut(page, 'k', 'KeyK', 2)
  await waitFor(page, `document.querySelector('[aria-label="Search commands"]')`, 'command palette')
  await typeSlowly(page, query)
  await waitFor(page, `document.querySelector('[data-command-id="${id}"]')`, `${query} command`)
  await key(page, 'Enter', 'Enter')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, `${query} completion`, 30_000)
}

const SEED_TIDY = `(() => {
  const editor = window.__systemsketch.editor
  const block = (id, x, y, title, inputs, outputs) => ({
    id, type: 'block', x, y,
    props: {
      w: 280, h: 210, title, view: 'port',
      inputs: Array.from({ length: inputs }, (_, index) => ({
        id: 'in' + index, name: 'input ' + (index + 1), type: 'data', visible: true,
      })),
      outputs: Array.from({ length: outputs }, (_, index) => ({
        id: 'out' + index, name: 'output ' + (index + 1), type: 'data', visible: true,
      })),
    },
  })
  const source = block('shape:layout-source', 120, 260, 'Source', 1, 5)
  const target = block('shape:layout-target', 900, 100, 'Target', 5, 1)
  const edges = []
  const bindings = []
  for (let index = 0; index < 5; index += 1) {
    const id = 'shape:layout-edge-' + index
    edges.push({ id, type: 'connection', x: 0, y: 0, props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    } })
    bindings.push(
      { type: 'connection', fromId: id, toId: source.id,
        props: { portId: 'out' + index, terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: id, toId: target.id,
        props: { portId: 'in' + index, terminal: 'end', face: 'outer' } },
    )
  }
  editor.run(() => {
    editor.createShapes([source, target])
    editor.createShapes(edges)
    editor.createBindings(bindings)
  })
  editor.selectNone()
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

const SEED_ORGANIZE = `(() => {
  const editor = window.__systemsketch.editor
  const blocks = Array.from({ length: 6 }, (_, index) => ({
    id: 'shape:organize-block-' + index,
    type: 'block',
    x: 250 + (index % 3) * 180,
    y: 210 + (index % 2) * 110,
    props: {
      w: 220 + (index % 2) * 50,
      h: 140 + (index % 3) * 24,
      title: 'Stage ' + (index + 1), view: 'port',
      inputs: [{ id: 'in0', name: 'input', type: 'data', visible: true }],
      outputs: [{ id: 'out0', name: 'output', type: 'data', visible: true }],
    },
  }))
  const pairs = [[0,1],[1,2],[2,3],[3,4],[4,5]]
  const edges = []
  const bindings = []
  pairs.forEach(([source, target], index) => {
    const id = 'shape:organize-edge-' + index
    edges.push({ id, type: 'connection', x: 0, y: 0, props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    } })
    bindings.push(
      { type: 'connection', fromId: id, toId: blocks[source].id,
        props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: id, toId: blocks[target].id,
        props: { portId: 'in0', terminal: 'end', face: 'outer' } },
    )
  })
  window.__layoutSeed = { blocks, edges, bindings }
  return true
})()`

async function blockPositions(page, prefix) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify(
    window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'block' && shape.id.startsWith(${JSON.stringify(prefix)}))
      .map((shape) => ({ id: shape.id, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h }))
      .sort((a, b) => a.id.localeCompare(b.id))))()`))
}

function overlapPairs(shapes) {
  let count = 0
  for (let i = 0; i < shapes.length; i += 1) for (let j = i + 1; j < shapes.length; j += 1) {
    if (shapes[i].x < shapes[j].x + shapes[j].w && shapes[i].x + shapes[i].w > shapes[j].x
      && shapes[i].y < shapes[j].y + shapes[j].h && shapes[i].y + shapes[i].h > shapes[j].y) count += 1
  }
  return count
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-layout-commands',
    build: 'layout-commands-smoke',
    width: 1500,
    height: 980,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'layout-commands.systemsketch')
  let reportPage = null
  let fixturePage = null
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)

    await evaluate(app.page, SEED_TIDY)
    await delay(650)
    const positionsBeforeTidy = await blockPositions(app.page, 'shape:layout-')
    await capture(app.page, BEFORE)
    const overlapBefore = Number(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const routes = editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection')
        .map((shape) => window.__systemsketch.getConnectionElbowRoute
          ? window.__systemsketch.getConnectionElbowRoute(editor, shape).points : shape.props.pins)
      return routes.length
    })()`))
    assert.equal(overlapBefore, 5)

    await runCommand(app.page, 'tidy edges', 'tidy-edges')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'connection')
      .some((shape) => shape.props.pins.length > 0)`, 'persisted tidy pins')
    const tidyState = JSON.parse(await evaluate(app.page, `(() => JSON.stringify({
      pins: window.__systemsketch.editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'connection').map((shape) => shape.props.pins.length),
      positions: window.__systemsketch.editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'block').map((shape) => ({
          id: shape.id, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      toast: Array.from(document.querySelectorAll('[data-testid="toast"]')).map((node) => node.textContent).join(' '),
    }))()`))
    assert.ok(tidyState.pins.filter((count) => count > 0).length >= 4)
    assert.deepEqual(tidyState.positions, positionsBeforeTidy)
    await capture(app.page, TIDIED)
    pass('Tidy edges runs through Ctrl+K, persists elbow pins, and leaves every node fixed')

    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'connection').every((shape) => shape.props.pins.length === 0)`, 'one-step tidy undo')
    pass('Tidy edges is one undoable history operation')

    const seededOrganize = await app.page.send('Runtime.evaluate', {
      expression: SEED_ORGANIZE,
      awaitPromise: true,
      returnByValue: false,
      userGesture: true,
    })
    if (seededOrganize.exceptionDetails) {
      throw new Error(seededOrganize.exceptionDetails.exception?.description
        ?? seededOrganize.exceptionDetails.text)
    }
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShapes(window.__layoutSeed.blocks)
      return true
    })()`)
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createShapes(window.__layoutSeed.edges)
      return true
    })()`)
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.createBindings(window.__layoutSeed.bindings)
      return true
    })()`)
    await delay(600)
    const positionsBeforeOrganize = await blockPositions(app.page, 'shape:')
    const overlapsBefore = overlapPairs(positionsBeforeOrganize)
    assert.ok(overlapsBefore > 0)
    const anchorBefore = {
      x: Math.min(...positionsBeforeOrganize.map((shape) => shape.x)),
      y: Math.min(...positionsBeforeOrganize.map((shape) => shape.y)),
    }

    await runCommand(app.page, 'organize nodes', 'organize-nodes')
    await delay(500)
    const positionsAfterOrganize = await blockPositions(app.page, 'shape:')
    assert.notDeepEqual(positionsAfterOrganize, positionsBeforeOrganize)
    assert.equal(overlapPairs(positionsAfterOrganize), 0)
    const anchorAfter = {
      x: Math.min(...positionsAfterOrganize.map((shape) => shape.x)),
      y: Math.min(...positionsAfterOrganize.map((shape) => shape.y)),
    }
    assert.ok(Math.abs(anchorBefore.x - anchorAfter.x) < 0.5)
    assert.ok(Math.abs(anchorBefore.y - anchorAfter.y) < 0.5)
    await capture(app.page, ORGANIZED)
    pass('Organize nodes runs through Ctrl+K, removes all node overlap, and preserves the graph anchor')

    await shortcut(app.page, 'z', 'KeyZ', 2)
    const blockZeroBefore = positionsBeforeOrganize.find((shape) => shape.id === 'shape:organize-block-0')
    await waitFor(app.page, `Math.abs(window.__systemsketch.editor.getShape('shape:organize-block-0').x - ${blockZeroBefore.x}) < .5`, 'one-step organize undo')
    assert.deepEqual(await blockPositions(app.page, 'shape:'), positionsBeforeOrganize)
    pass('Organize nodes is one undoable history operation')

    const first = JSON.parse(await evaluate(app.page, `(() => {
      const element = document.querySelector('[data-shape-id="shape:organize-block-0"] .systemsketch-block-canvas')
      const rect = element.getBoundingClientRect()
      return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
    })()`))
    await clickAt(app.page, first.x, first.y, 'right')
    await waitFor(app.page, `document.querySelector('[data-testid="context-menu.tidy-edges"]')
      && document.querySelector('[data-testid="context-menu.organize-nodes"]')`, 'layout context-menu actions')
    pass('the same two commands are present in the real semantic context menu')
    await key(app.page, 'Escape', 'Escape')
    assert.deepEqual(localConsoleErrors(app.page), [])

    reportPage = await newPage(app.cdpPort)
    await reportPage.send('Page.enable')
    await reportPage.send('Runtime.enable')
    await reportPage.send('Log.enable')
    await reportPage.send('Emulation.setDeviceMetricsOverride', {
      width: 1500, height: 980, deviceScaleFactor: 1, mobile: false,
    })
    await reportPage.send('Page.navigate', {
      url: `http://127.0.0.1:${app.port}/docs/layout-comparison-2026-09-02.html`,
    })
    await waitFor(reportPage, `document.querySelectorAll('.case').length === 40`, '40 report cases', 30_000)
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.case[data-kind="edges"]').length`), 20)
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.case[data-kind="nodes"]').length`), 20)
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.compare svg').length`), 80)
    await clickElement(reportPage, '[data-filter="nodes"]')
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.case[data-kind="edges"]:not([hidden])').length`), 0)
    assert.equal(await evaluate(reportPage, `document.querySelectorAll('.case[data-kind="nodes"]:not([hidden])').length`), 20)
    await evaluate(reportPage, `document.querySelector('.case[data-kind="nodes"] .compare').scrollIntoView({ block: 'center' })`)
    await clickElement(reportPage, '.case[data-kind="nodes"] .compare')
    await waitFor(reportPage, `document.querySelector('#zoom[open]')`, 'full-screen comparison')
    await key(reportPage, 'Escape', 'Escape')
    await clickElement(reportPage, '[data-filter="all"]')
    await evaluate(reportPage, `window.scrollTo(0, 0)`)
    await capture(reportPage, REPORT)
    pass('the self-contained report renders 20 + 20 cases, filters, and full-screen inspection')

    assert.deepEqual(localConsoleErrors(reportPage), [])
    pass('the real-app and report journeys produced zero local console errors')

    const tidyFixture = join(app.filesRoot, 'SystemSketch', 'tidy-edges-review.systemsketch')
    const organizeFixture = join(app.filesRoot, 'SystemSketch', 'organize-nodes-review.systemsketch')
    await copyFile(join(ROOT, 'sketches', 'review', 'tidy-edges.systemsketch'), tidyFixture)
    await copyFile(join(ROOT, 'sketches', 'review', 'organize-nodes.systemsketch'), organizeFixture)
    fixturePage = await newPage(app.cdpPort)
    await fixturePage.send('Page.enable')
    await fixturePage.send('Runtime.enable')
    await fixturePage.send('Log.enable')
    await fixturePage.send('Emulation.setDeviceMetricsOverride', {
      width: 1500, height: 980, deviceScaleFactor: 1, mobile: false,
    })

    await openApp(fixturePage, app.port, `?board=${encodeURIComponent(tidyFixture)}`)
    await waitFor(fixturePage, `window.__systemsketch?.editor?.getShape('shape:cable-1')`, 'tidy review fixture')
    const fixtureBlocksBefore = await blockPositions(fixturePage, 'shape:')
    await runCommand(fixturePage, 'tidy edges', 'tidy-edges')
    await waitFor(fixturePage, `window.__systemsketch.editor.getShape('shape:cable-1').props.pins.length > 0`, 'tidied review fixture')
    assert.deepEqual(await blockPositions(fixturePage, 'shape:'), fixtureBlocksBefore)

    fixturePage.close()
    fixturePage = await newPage(app.cdpPort)
    await fixturePage.send('Page.enable')
    await fixturePage.send('Runtime.enable')
    await fixturePage.send('Log.enable')
    await fixturePage.send('Emulation.setDeviceMetricsOverride', {
      width: 1500, height: 980, deviceScaleFactor: 1, mobile: false,
    })
    await openApp(fixturePage, app.port, `?board=${encodeURIComponent(organizeFixture)}`)
    await waitFor(fixturePage, `window.__systemsketch?.editor?.getShape('shape:stage-a')`, 'organize review fixture')
    assert.ok(overlapPairs(await blockPositions(fixturePage, 'shape:')) > 0)
    await runCommand(fixturePage, 'organize nodes', 'organize-nodes')
    await waitFor(fixturePage, `window.__systemsketch.editor.getShape('shape:stage-f').x > 1200`, 'organized review fixture', 30_000)
    assert.equal(overlapPairs(await blockPositions(fixturePage, 'shape:')), 0)
    assert.deepEqual(localConsoleErrors(fixturePage), [])
    pass('both generated review fixtures complete their intended gesture in the real app')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
    for (const path of [BEFORE, TIDIED, ORGANIZED, REPORT]) process.stdout.write(`  ${path}\n`)
  } finally {
    fixturePage?.close()
    reportPage?.close()
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
