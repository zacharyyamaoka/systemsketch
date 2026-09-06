#!/usr/bin/env node
/**
 * Real-browser proof for bulk "Reset to automatic" edge routing: the
 * selection toolbar, the right-click context menu, and the Ctrl+K command
 * palette all reach the same command, and all three resolve a mixed or
 * node-only selection down to just its incident hand-routed edges — because
 * precisely selecting only an arrow is the hard gesture this command exists
 * to route around.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
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
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const CONTEXT_MENU_SCREENSHOT = join(ASSETS, 'reset-routing-context-menu-2026-09-06.png')
const TOOLBAR_SCREENSHOT = join(ASSETS, 'reset-routing-toolbar-2026-09-06.png')
const { checks, pass } = makeChecklist()

// A.out0 -> B.in0 starts hand-routed (an authored pin), exactly like a person
// dragging a rail; B.out0 -> C.in0 starts and stays plain automatic, as the
// edge that must never be touched by a Reset scoped to A or B alone.
const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const block = (id, x, y, title, ports) => ({
    id, type: 'block', x, y,
    props: {
      w: 260, h: 180, title, view: 'port',
      inputs: ports.in ? [{ id: 'in0', name: 'in', type: 'data', visible: true }] : [],
      outputs: ports.out ? [{ id: 'out0', name: 'out', type: 'data', visible: true }] : [],
    },
  })
  const a = block('shape:reset-a', 120, 260, 'A', { out: true })
  const b = block('shape:reset-b', 560, 260, 'B', { in: true, out: true })
  const c = block('shape:reset-c', 1000, 260, 'C', { in: true })
  const edgeAB = {
    id: 'shape:reset-edge-ab', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null,
      pins: [{ index: 1, axis: 'y', t: 0.5, offset: 40 }],
      elbowRoute: null,
      routeMode: 'authored',
    },
  }
  const edgeBC = {
    id: 'shape:reset-edge-bc', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    },
  }
  editor.run(() => {
    editor.createShapes([a, b, c])
    editor.createShapes([edgeAB, edgeBC])
    editor.createBindings([
      { type: 'connection', fromId: edgeAB.id, toId: a.id, props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edgeAB.id, toId: b.id, props: { portId: 'in0', terminal: 'end', face: 'outer' } },
      { type: 'connection', fromId: edgeBC.id, toId: b.id, props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edgeBC.id, toId: c.id, props: { portId: 'in0', terminal: 'end', face: 'outer' } },
    ])
  })
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

async function selectionButtons(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify({
    tidy: Boolean(document.querySelector('[data-testid="selection-action-tidy-edges"]')),
    reset: Boolean(document.querySelector('[data-testid="selection-action-reset-routing"]')),
    organize: Boolean(document.querySelector('[data-testid="selection-action-organize-nodes"]')),
  }))()`))
}

async function edgeRouteState(page, edgeId) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const props = window.__systemsketch.editor.getShape('${edgeId}').props
    return { curve: props.curve, pins: props.pins, elbowRoute: props.elbowRoute, routeMode: props.routeMode }
  })())`))
}

async function blockPositions(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify(
    ['shape:reset-a', 'shape:reset-b', 'shape:reset-c'].map((id) => {
      const shape = window.__systemsketch.editor.getShape(id)
      return { id, x: shape.x, y: shape.y }
    })))()`))
}

/** Re-author A->B with a fresh authored pin, exactly like the initial seed. */
async function authorEdgeAB(page) {
  await evaluate(page, `(() => {
    window.__systemsketch.editor.updateShapes([{
      id: 'shape:reset-edge-ab', type: 'connection',
      props: { pins: [{ index: 1, axis: 'y', t: 0.5, offset: 40 }], routeMode: 'authored' },
    }])
    return true
  })()`)
}

async function select(page, ...ids) {
  await evaluate(page, `(() => { window.__systemsketch.editor.select(${ids.map((id) => `'${id}'`).join(', ')}); return true })()`)
}

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

const AUTOMATIC = { curve: null, pins: [], elbowRoute: null, routeMode: 'automatic' }

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-reset-edge-routing',
    build: 'reset-edge-routing-smoke',
    width: 1440,
    height: 900,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'reset-edge-routing.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(500)

    // 1. Selecting the hand-routed edge directly exposes Reset beside Tidy.
    await select(app.page, 'shape:reset-edge-ab')
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-reset-routing"]')`, 'edge-only reset action')
    assert.deepEqual(await selectionButtons(app.page), { tidy: true, reset: true, organize: false })
    pass('selecting the hand-routed edge directly exposes Reset to automatic beside Tidy edges')

    // 2. The automatic-only edge never shows Reset — nothing to clear.
    await select(app.page, 'shape:reset-edge-bc')
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-tidy-edges"]')`, 'automatic edge selection')
    assert.deepEqual(await selectionButtons(app.page), { tidy: true, reset: false, organize: false })
    pass('an edge that was never hand-routed never shows a Reset button')

    // 3. The right-click context menu carries the same command, live.
    await select(app.page, 'shape:reset-edge-ab')
    const edgeScreenPoint = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:reset-edge-ab')
      return JSON.stringify(editor.pageToScreen({ x: bounds.midX, y: bounds.midY }))
    })()`))
    await clickAt(app.page, edgeScreenPoint.x, edgeScreenPoint.y, 'right')
    await waitFor(app.page, `document.querySelector('[data-testid="context-menu.reset-routing"]')
      && document.querySelector('[data-testid="context-menu.tidy-edges"]')`, 'reset routing in the context menu')
    await capture(app.page, CONTEXT_MENU_SCREENSHOT)
    // A disabled TldrawUiMenuItem renders nothing at all in a context menu
    // (unlike the toolbar's disabled-but-visible button), so presence alone
    // already proves it is live.
    pass('right-clicking a hand-routed edge shows a live Reset to automatic item beside Tidy edges')
    await key(app.page, 'Escape', 'Escape')

    await select(app.page, 'shape:reset-edge-bc')
    const bcScreenPoint = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:reset-edge-bc')
      return JSON.stringify(editor.pageToScreen({ x: bounds.midX, y: bounds.midY }))
    })()`))
    await clickAt(app.page, bcScreenPoint.x, bcScreenPoint.y, 'right')
    await waitFor(app.page, `document.querySelector('[data-testid="context-menu.tidy-edges"]')`, 'automatic-edge context menu')
    assert.equal(await evaluate(app.page, `Boolean(document.querySelector('[data-testid="context-menu.reset-routing"]'))`), false)
    pass('the automatic-only edge never grows a Reset item in the context menu, disabled or otherwise')
    await key(app.page, 'Escape', 'Escape')

    await select(app.page, 'shape:reset-edge-ab')
    await clickAt(app.page, edgeScreenPoint.x, edgeScreenPoint.y, 'right')
    await waitFor(app.page, `document.querySelector('[data-testid="context-menu.reset-routing"]')`, 'reset routing in the context menu again')
    await clickElement(app.page, '[data-testid="context-menu.reset-routing"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.routeMode === 'automatic'
      && window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.pins.length === 0`, 'context-menu reset applied')
    assert.deepEqual(await edgeRouteState(app.page, 'shape:reset-edge-ab'), AUTOMATIC)
    pass('choosing it from the context menu clears the authored rail')

    // 4. The Ctrl+K command palette reaches the identical command.
    await authorEdgeAB(app.page)
    await select(app.page, 'shape:reset-edge-ab')
    await shortcut(app.page, 'k', 'KeyK', 2)
    await waitFor(app.page, `document.querySelector('[aria-label="Search commands"]')`, 'command palette')
    await typeSlowly(app.page, 'reset routing')
    await waitFor(app.page, `document.querySelector('[data-command-id="reset-routing"]')`, 'reset routing command')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'command palette completion')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.routeMode === 'automatic'
      && window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.pins.length === 0`, 'command palette reset applied')
    assert.deepEqual(await edgeRouteState(app.page, 'shape:reset-edge-ab'), AUTOMATIC)
    pass('the Ctrl+K command palette runs the identical Reset routing command')

    // 5. The core ask: selecting only the Block still resets its incident
    // hand-routed cable, and the Block itself never moves.
    await authorEdgeAB(app.page)
    const positionsBeforeBlockReset = await blockPositions(app.page)
    await select(app.page, 'shape:reset-a')
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-reset-routing"]')`, 'incident-edge reset action')
    assert.deepEqual(await selectionButtons(app.page), { tidy: true, reset: true, organize: false })
    await capture(app.page, TOOLBAR_SCREENSHOT)
    await clickElement(app.page, '[data-testid="selection-action-reset-routing"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.routeMode === 'automatic'
      && window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.pins.length === 0`, 'block-scoped reset applied')
    assert.deepEqual(await edgeRouteState(app.page, 'shape:reset-edge-ab'), AUTOMATIC)
    assert.deepEqual(await blockPositions(app.page), positionsBeforeBlockReset)
    pass('selecting only Block A resets its hand-routed incident cable through the toolbar, and never moves any Block')

    // 6. A genuinely mixed selection — a Block plus an unrelated already-
    // automatic edge — still resolves to just the hand-routed edge, and
    // leaves the unrelated edge exactly as it was.
    await authorEdgeAB(app.page)
    const bcBeforeMixedReset = await edgeRouteState(app.page, 'shape:reset-edge-bc')
    await select(app.page, 'shape:reset-a', 'shape:reset-edge-bc')
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-reset-routing"]')`, 'mixed-selection reset action')
    assert.deepEqual(await selectionButtons(app.page), { tidy: true, reset: true, organize: false })
    await clickElement(app.page, '[data-testid="selection-action-reset-routing"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.routeMode === 'automatic'
      && window.__systemsketch.editor.getShape('shape:reset-edge-ab').props.pins.length === 0`, 'mixed-selection reset applied')
    assert.deepEqual(await edgeRouteState(app.page, 'shape:reset-edge-ab'), AUTOMATIC)
    assert.deepEqual(await edgeRouteState(app.page, 'shape:reset-edge-bc'), bcBeforeMixedReset)
    pass('a mixed Block+edge selection resets the hand-routed edge and leaves the already-automatic edge untouched')

    // 7. Two selected Blocks with nothing hand-routed: Organize shows, Reset does not.
    await select(app.page, 'shape:reset-a', 'shape:reset-b')
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-organize-nodes"]')`, 'two-Block organize action')
    assert.deepEqual(await selectionButtons(app.page), { tidy: true, reset: false, organize: true })
    pass('two selected Blocks with no authored geometry show Organize nodes but no Reset button')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the reset-routing journey produced zero local console errors')
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${CONTEXT_MENU_SCREENSHOT}\n  ${TOOLBAR_SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
