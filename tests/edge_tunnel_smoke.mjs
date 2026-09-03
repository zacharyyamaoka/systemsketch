#!/usr/bin/env node
/** Real-browser acceptance for the pyblocks edge-tunnel port. */
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
  mouse,
  newPage,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const INSPECTOR_SHOT = join(ASSETS, 'edge-tunnel-inspector-live-2026-09-02.png')
const HIDDEN_SHOT = join(ASSETS, 'edge-tunnel-hidden-live-2026-09-02.png')
const HOVER_SHOT = join(ASSETS, 'edge-tunnel-hover-live-2026-09-02.png')
const FOCUSED_SHOT = join(ASSETS, 'edge-tunnel-layer-focus-live-2026-09-02.png')
const RESULTS = join(ASSETS, 'edge-tunnel-results-2026-09-02.json')
const REVIEW_FIXTURE = join(ROOT, 'sketches', 'review', 'edge-tunnel.systemsketch')
const { checks, pass } = makeChecklist()

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const source = {
    id: 'shape:tunnel-source', type: 'block', x: 180, y: 340,
    props: {
      w: 300, h: 190, title: 'decode()', blockType: 'Function', view: 'port',
      inputs: [{ id: 'in_1', name: 'raw', type: 'bytes', visible: true }],
      outputs: [{ id: 'out_1', name: 'frame', type: 'Frame', visible: true }],
    },
  }
  const target = {
    id: 'shape:tunnel-target', type: 'block', x: 1120, y: 340,
    props: {
      w: 300, h: 190, title: 'estimate()', blockType: 'Function', view: 'port',
      inputs: [{ id: 'in_1', name: 'frame', type: 'Frame', visible: true }],
      outputs: [{ id: 'out_1', name: 'pose', type: 'Pose', visible: true }],
    },
  }
  const edge = {
    id: 'shape:tunnel-edge', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null, routeMode: 'automatic',
      temporal: 'data', delayValue: '', pillPosition: 0.5,
    },
  }
  const otherEdge = {
    id: 'shape:other-edge', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 220, y: 650 }, end: { x: 1080, y: 650 }, routing: 'straight',
      curve: null, pins: [], elbowRoute: null, routeMode: 'automatic',
      temporal: 'data', delayValue: '', pillPosition: 0.5,
      tunnel: false, tunnelLayer: '',
    },
  }
  editor.run(() => {
    editor.createShapes([source, target])
    editor.createShapes([edge, otherEdge])
    editor.createBindings([
      { type: 'connection', fromId: edge.id, toId: source.id,
        props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: target.id,
        props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
    ])
  })
  editor.zoomToFit({ animation: { duration: 0 } })
  return true
})()`

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function moveAway(page) {
  await mouse(page, 'mouseMoved', 80, 820)
  await delay(260)
}

async function tunnelPaint(page, shapeId = 'shape:tunnel-edge') {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="' + ${JSON.stringify(shapeId)} + '"]')
    const svg = root?.querySelector('[data-tunnel]')
    const path = svg?.querySelector('path')
    return JSON.stringify({
      state: svg?.getAttribute('data-tunnel') ?? null,
      dash: path?.getAttribute('stroke-dasharray') ?? null,
      vias: svg?.querySelectorAll('[data-testid="connection-tunnel-vias"] circle').length ?? 0,
      delayPill: Boolean(svg?.querySelector('[data-testid="connection-delay-pill"]')),
    })
  })()`))
}

async function pathPoint(page, fraction, shapeId = 'shape:tunnel-edge') {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="' + ${JSON.stringify(shapeId)} + '"] [data-tunnel] path')
    const point = path.getPointAtLength(path.getTotalLength() * ${fraction})
    const matrix = path.getScreenCTM()
    return JSON.stringify({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-edge-tunnel',
    build: 'edge-tunnel-smoke',
    width: 1600,
    height: 900,
    allowSourceRoot: true,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'edge-tunnel.systemsketch')
  const reviewBoard = join(app.filesRoot, 'SystemSketch', 'edge-tunnel-review.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(REVIEW_FIXTURE, reviewBoard)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(500)

    await evaluate(app.page, `void window.__systemsketch.editor.select('shape:tunnel-edge')`)
    await waitFor(app.page, `document.querySelector('[data-testid="connection-inspector"]')`, 'connection inspector')
    await clickElement(app.page, '[data-testid="tunnel-toggle"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:tunnel-edge').props.tunnel === true`, 'tunnel enabled')
    await clickElement(app.page, '[data-testid="new-tunnel-layer"]')
    await clickElement(app.page, '[data-testid="new-tunnel-layer-name"]')
    await typeSlowly(app.page, 'Diagnostics')
    await key(app.page, 'Enter')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:tunnel-edge').props.tunnelLayer === 'Diagnostics'`, 'layer saved')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="tunnel-layer"]').value`), 'Diagnostics')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="tunnel-toggle"]').getAttribute('aria-checked')`), 'true')
    pass('the selected edge inspector enables Tunnel and creates a reusable named layer')
    await screenshot(app.page, INSPECTOR_SHOT)

    await evaluate(app.page, `void window.__systemsketch.editor.selectNone()`)
    await moveAway(app.page)
    await waitFor(app.page, `document.querySelector('[data-tunnel="hidden"]')`, 'idle tunnel stubs')
    let paint = await tunnelPaint(app.page)
    assert.equal(paint.state, 'hidden')
    assert.equal(paint.vias, 2)
    assert.match(paint.dash, /^34(?:[ ,])/)
    pass('an idle long tunnel leaves two 34-unit endpoint stubs and exactly two outlined vias')
    await screenshot(app.page, HIDDEN_SHOT)

    const middle = await pathPoint(app.page, 0.5)
    await mouse(app.page, 'mouseMoved', middle.x, middle.y)
    await waitFor(app.page, `document.querySelector('[data-shape-id="shape:tunnel-edge"] [data-tunnel="preview"]')`, 'edge hover preview')
    paint = await tunnelPaint(app.page)
    assert.deepEqual({ state: paint.state, vias: paint.vias, dash: paint.dash }, { state: 'preview', vias: 2, dash: null })
    pass('hover restores the full cable while both outlined tunnel mouths remain visible')
    await screenshot(app.page, HOVER_SHOT)

    await moveAway(app.page)
    await evaluate(app.page, `void window.__systemsketch.editor.select('shape:tunnel-source')`)
    await waitFor(app.page, `document.querySelector('[data-shape-id="shape:tunnel-edge"] [data-tunnel="preview"]')`, 'endpoint preview')
    paint = await tunnelPaint(app.page)
    assert.equal(paint.vias, 2)
    pass('endpoint focus previews the complete route without removing its tunnel mouths')

    await evaluate(app.page, `void window.__systemsketch.editor.selectNone()`)
    await moveAway(app.page)
    await waitFor(app.page, `document.querySelector('[data-tunnel="hidden"]')`, 'tunnel hidden before layer focus')
    await clickElement(app.page, '[data-testid="tunnel-layer-focus"][data-tunnel-layer="Diagnostics"]')
    await waitFor(app.page, `document.querySelector('[data-testid="tunnel-layer-focus"][data-tunnel-layer="Diagnostics"][aria-pressed="true"]')`, 'layer focused')
    await waitFor(app.page, `document.querySelector('[data-shape-id="shape:tunnel-edge"] [data-tunnel="revealed"]')`, 'layer member revealed')
    await waitFor(app.page, `document.querySelector('[data-shape-id="shape:other-edge"] [data-tunnel="hidden"]')`, 'other edge tunneled')
    paint = await tunnelPaint(app.page)
    const otherPaint = await tunnelPaint(app.page, 'shape:other-edge')
    assert.deepEqual({ state: paint.state, vias: paint.vias }, { state: 'revealed', vias: 0 })
    assert.equal(otherPaint.vias, 2)
    assert.match(otherPaint.dash, /^34(?:[ ,])/)
    pass('layer focus removes its members’ mouths and tunnels every edge outside the layer')
    await screenshot(app.page, FOCUSED_SHOT)

    await evaluate(app.page, `void window.__systemsketch.editor.updateShape({
      id: 'shape:tunnel-edge', type: 'connection', props: { temporal: 'delayed', delayValue: '1.0' }
    })`)
    await waitFor(app.page, `document.querySelector('[data-testid="connection-delay-pill"]')`, 'revealed delayed pill')
    await clickElement(app.page, '[data-testid="tunnel-layer-focus"][data-tunnel-layer="Diagnostics"]')
    await moveAway(app.page)
    await waitFor(app.page, `document.querySelector('[data-tunnel="hidden"]')`, 'layer focus cleared')
    paint = await tunnelPaint(app.page)
    assert.equal(paint.delayPill, false)
    assert.equal((await tunnelPaint(app.page, 'shape:other-edge')).state, 'off')
    pass('clearing layer focus restores ordinary visibility and the configured tunnel baseline')
    await evaluate(app.page, `void window.__systemsketch.editor.select('shape:tunnel-target')`)
    await waitFor(app.page, `document.querySelector('[data-testid="connection-delay-pill"]')`, 'delayed pill restored with endpoint')
    paint = await tunnelPaint(app.page)
    assert.deepEqual({ state: paint.state, vias: paint.vias, delayPill: paint.delayPill }, { state: 'preview', vias: 2, delayPill: true })
    await evaluate(app.page, `void window.__systemsketch.editor.updateShape({
      id: 'shape:tunnel-edge', type: 'connection', props: { temporal: 'data', delayValue: '' }
    })`)
    pass('a delayed edge hides its z⁻¹ pill underground and restores it with the full mouth-marked preview')

    await delay(1200)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:tunnel-edge')?.props?.tunnelLayer === 'Diagnostics'`, 'tunnel restored after reload', 20_000)
    const restored = JSON.parse(await evaluate(app.page, `(() => {
      const props = window.__systemsketch.editor.getShape('shape:tunnel-edge').props
      return JSON.stringify({ tunnel: props.tunnel, tunnelLayer: props.tunnelLayer })
    })()`))
    assert.deepEqual(restored, { tunnel: true, tunnelLayer: 'Diagnostics' })
    pass('tunnel mode and layer persist through the ordinary .systemsketch autosave')

    process.stdout.write('  … opening the saved two-edge review fixture\n')
    const fixturePage = await newPage(app.cdpPort)
    let fixtureConsoleErrors = []
    try {
      await fixturePage.send('Page.enable')
      await fixturePage.send('Runtime.enable')
      await fixturePage.send('Log.enable')
      await fixturePage.send('Emulation.setDeviceMetricsOverride', {
        width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
      })
      await openApp(fixturePage, app.port, `?board=${encodeURIComponent(reviewBoard)}`)
      await waitFor(fixturePage, `window.__systemsketch?.editor?.getShape('shape:tunnel')?.props?.tunnel === true`, 'saved review fixture', 20_000)
      process.stdout.write('  … driving fixture hover preview\n')
      await moveAway(fixturePage)
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:tunnel"] [data-tunnel="hidden"]')`, 'fixture idle tunnel')
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:other"] [data-tunnel="off"]')`, 'fixture ordinary edge')
      const fixtureMiddle = await pathPoint(fixturePage, 0.5, 'shape:tunnel')
      await mouse(fixturePage, 'mouseMoved', fixtureMiddle.x, fixtureMiddle.y)
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:tunnel"] [data-tunnel="preview"]')`, 'fixture hover preview')
      assert.equal((await tunnelPaint(fixturePage, 'shape:tunnel')).vias, 2)
      await moveAway(fixturePage)
      process.stdout.write('  … driving fixture layer isolation\n')
      await clickElement(fixturePage, '[data-testid="tunnel-layer-focus"][data-tunnel-layer="Diagnostics"]')
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:tunnel"] [data-tunnel="revealed"]')`, 'fixture layer reveal')
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:other"] [data-tunnel="hidden"]')`, 'fixture other edge tunneled')
      await clickElement(fixturePage, '[data-testid="tunnel-layer-focus"][data-tunnel-layer="Diagnostics"]')
      await evaluate(fixturePage, `void window.__systemsketch.editor.select('shape:decode')`)
      await waitFor(fixturePage, `document.querySelector('[data-shape-id="shape:tunnel"] [data-tunnel="preview"]')`, 'fixture endpoint preview')
      fixtureConsoleErrors = localConsoleErrors(fixturePage)
    } finally {
      fixturePage.close()
    }
    pass('the saved review fixture was driven through hover preview and layer isolation')

    assert.deepEqual([...localConsoleErrors(app.page), ...fixtureConsoleErrors], [])
    pass('the complete journey produced zero local console errors')
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${HIDDEN_SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
