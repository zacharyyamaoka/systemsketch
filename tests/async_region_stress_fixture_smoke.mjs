#!/usr/bin/env node
/** Adversarial real-browser proof for mixed protocols inside one Async region. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'async-region-stress.systemsketch')
const ASSETS = join(ROOT, 'docs', 'assets', 'async-region-stress')
const RESULTS = join(ASSETS, 'acceptance.json')
const REGION = 'shape:async-region-stress'
const { checks, pass } = makeChecklist()
const findings = []

const MOVE_EDGES = [
  'shape:edge-move-goal',
  'shape:edge-move-cancel',
  'shape:edge-move-feedback',
  'shape:edge-move-result',
]

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`))
}

async function dragBetween(page, from, to) {
  await mouse(page, 'mouseMoved', from.cx, from.cy)
  await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
  for (let step = 1; step <= 12; step += 1) {
    await mouse(page, 'mouseMoved',
      from.cx + ((to.cx - from.cx) * step) / 12,
      from.cy + ((to.cy - from.cy) * step) / 12,
      { buttons: 1 })
    await delay(22)
  }
  await mouse(page, 'mouseReleased', to.cx, to.cy)
  await delay(500)
}

async function semanticIdFor(page, connectionId) {
  return evaluate(page, `document.querySelector('[data-shape-id="${connectionId}"] [data-communication-id]')?.getAttribute('data-communication-id') ?? null`)
}

async function renderedPathLengths(page, connectionIds) {
  return JSON.parse(await evaluate(page, `JSON.stringify(Object.fromEntries(${JSON.stringify(connectionIds)}.map((id) => {
    const root = document.querySelector('[data-shape-id="' + id + '"] [data-communication-mode="tagged"]')
    const path = root?.querySelector(':scope > path:not([data-communication-focus-hit])')
    return [id, path?.getTotalLength() ?? Number.POSITIVE_INFINITY]
  })))`))
}

async function representativeState(page, displayId) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const node = document.querySelector('[data-communication-mode="components"][data-communication-id="${displayId}"]')
    return {
      phase: node?.getAttribute('data-communication-representative-phase') ?? null,
      id: node?.getAttribute('data-communication-representative-id') ?? null,
      policy: node?.getAttribute('data-communication-representative-policy') ?? null,
    }
  })())`))
}

async function selectTrack(page, testId, value) {
  await evaluate(page, `(() => {
    const element = document.querySelector('[data-testid="${testId}"]')
    if (!(element instanceof HTMLSelectElement)) throw new Error('Missing ${testId}')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'async-region-stress-review',
    build: 'async-region-stress-review',
    allowSourceRoot: true,
    width: 2800,
    height: 1650,
  })
  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(REGION)})`, 'stress Async region', 30_000)
    await waitFor(app.page, `[...document.querySelectorAll('[data-shape-id]')].some((node) => node.dataset.shapeId === 'shape:camera')`, 'stress components')
    await delay(500)

    const initial = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const region = editor.getShape(${JSON.stringify(REGION)})
      const connections = editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection')
      const children = ['shape:camera', 'shape:perception', 'shape:telemetry', 'shape:mission', 'shape:runtime']
      return {
        regionX: region.x,
        connections: connections.map((shape) => ({
          id: shape.id,
          parentId: shape.parentId,
          temporal: shape.props.temporal,
        })),
        childParents: children.map((id) => editor.getShape(id)?.parentId),
        cueBindings: editor.getBindingsFromShape('shape:cue-step-open-arrow', 'arrow')
          .filter((binding) => binding.toId === ${JSON.stringify(REGION)}).length,
      }
    })())`))
    assert.equal(initial.connections.length, 18)
    assert.ok(initial.connections.every((edge) => edge.parentId === REGION && edge.temporal === 'async'))
    assert.ok(initial.childParents.every((parentId) => parentId === REGION))
    assert.equal(initial.cueBindings, 1)
    const seededGraph = await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes())`)
    pass('the saved stress board has five real component children and 18 real Async connection records')

    const regionBounds = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(REGION)}))`))
    const dragFrom = await pagePoint(app.page, { x: regionBounds.x + 2, y: regionBounds.y + regionBounds.h * 0.74 })
    await drag(app.page, dragFrom, { x: dragFrom.x + 30, y: dragFrom.y })
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(REGION)}).x > ${initial.regionX + 20}`, 'region move')
    assert.equal(await evaluate(app.page, `window.__systemsketch.editor.getBindingsFromShape('shape:cue-step-open-arrow', 'arrow').filter((binding) => binding.toId === ${JSON.stringify(REGION)}).length`), 1)
    await evaluate(app.page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(REGION)}).x === ${initial.regionX}`, 'region move undo')
    pass('a real Frame move keeps the numbered cue attached and carries the entire stress topology')

    const border = await pagePoint(app.page, { x: regionBounds.x + 2, y: regionBounds.y + regionBounds.h * 0.56 })
    await clickAt(app.page, border.x, border.y)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'contextual communication controls')
    await clickElement(app.page, '[data-testid="communication-cables-split"]')
    await waitFor(app.page, `document.querySelectorAll('[data-communication-mode="tagged"]').length === 18`, '18 tagged protocol legs')

    const expectedCounts = { A1: 3, A2: 4, A3: 2, S1: 2, S2: 2, S3: 2, T1: 1, T2: 1, ST1: 1 }
    const observedCounts = JSON.parse(await evaluate(app.page, `JSON.stringify([...document.querySelectorAll('[data-communication-mode="tagged"]')]
      .reduce((counts, node) => {
        const id = node.getAttribute('data-communication-id')
        counts[id] = (counts[id] ?? 0) + 1
        return counts
      }, {}))`))
    assert.deepEqual(observedCounts, expectedCounts)
    const taggedStatus = await evaluate(app.page, `document.querySelector('[data-testid="communication-prototype-status"]')?.textContent ?? ''`)
    assert.match(taggedStatus, /18 protocol legs parsed/)
    assert.match(taggedStatus, /0 unresolved · 0 issues/)
    assert.equal(await semanticIdFor(app.page, 'shape:edge-status-action-goal'), 'A3')
    assert.equal(await semanticIdFor(app.page, 'shape:edge-status-service-request'), 'S3')
    for (const edgeId of MOVE_EDGES) assert.equal(await semanticIdFor(app.page, edgeId), 'A2')
    const moveLengths = await renderedPathLengths(app.page, MOVE_EDGES)
    const poseEdges = ['shape:edge-pose-request', 'shape:edge-pose-response']
    const poseLengths = await renderedPathLengths(app.page, poseEdges)
    pass('Tag edges separates three Actions, three Services, two Topics, and one Stream with no name bleed')

    await shot(app.page, '01-nine-groups-across-eighteen-legs.png')

    await clickElement(app.page, '[data-testid="communication-lens-communication"]')
    await waitFor(app.page, `document.querySelectorAll('[data-communication-mode="components"]').length === 9`, 'nine component relationships')
    const componentStatus = await evaluate(app.page, `document.querySelector('[data-testid="communication-prototype-status"]')?.textContent ?? ''`)
    assert.match(componentStatus, /9 component relationships/)
    const moveRelation = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const node = document.querySelector('[data-communication-mode="components"][data-communication-id="A2"]')
      return {
        edges: Number(node?.getAttribute('data-communication-edges')),
        representative: node?.getAttribute('data-communication-representative-phase'),
        members: (node?.getAttribute('data-communication-member-ids') ?? '').split(',').filter(Boolean),
      }
    })())`))
    assert.equal(moveRelation.edges, 4)
    assert.equal(moveRelation.representative, 'goal')
    assert.deepEqual(new Set(moveRelation.members), new Set(MOVE_EDGES))
    pass('Components collapses the graph to nine relationships and carries A2 on the move.goal track')

    assert.deepEqual(await representativeState(app.page, 'S2'), {
      phase: 'request', id: 'shape:edge-pose-request', policy: 'request',
    })
    const serviceFocusHit = await elementBox(app.page, '[data-communication-mode="components"][data-communication-id="S1"] [data-communication-focus-hit]')
    await clickAt(app.page, serviceFocusHit.cx, serviceFocusHit.cy)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-status"]')?.textContent.includes('S1 focused · 2 legs')`, 'S1 focus')
    const focusedServiceLabels = JSON.parse(await evaluate(app.page, `JSON.stringify([
      ...document.querySelectorAll('[data-communication-id="S1"][data-communication-focus="active"] [data-communication-label="S1"] text')
    ].map((node) => node.textContent))`))
    assert.deepEqual(new Set(focusedServiceLabels), new Set(['S1 · request', 'S1 · response']))
    pass('focused Service tags identify the exact request and response legs instead of repeating the aggregate relationship')
    await shot(app.page, '02-service-focus-exact-phases.png')
    await clickElement(app.page, '[data-testid="communication-focus-clear"]')
    await waitFor(app.page, `!document.querySelector('[data-testid="communication-prototype-status"]')?.textContent.includes('S1 focused')`, 'cleared S1 focus')

    await selectTrack(app.page, 'communication-service-track', 'response')
    await selectTrack(app.page, 'communication-action-track', 'result')
    await waitFor(app.page, `document.querySelector('[data-communication-id="A2"]')?.getAttribute('data-communication-representative-phase') === 'result'`, 'Action result representative')
    assert.deepEqual(await representativeState(app.page, 'A2'), {
      phase: 'result', id: 'shape:edge-move-result', policy: 'result',
    })
    assert.deepEqual(await representativeState(app.page, 'S2'), {
      phase: 'response', id: 'shape:edge-pose-response', policy: 'response',
    })
    assert.deepEqual(await representativeState(app.page, 'T1'), {
      phase: 'publish', id: 'shape:edge-detections', policy: 'data',
    })
    assert.deepEqual(await representativeState(app.page, 'ST1'), {
      phase: 'stream', id: 'shape:edge-preview', policy: 'data',
    })
    pass('Service and Action selectors change only their aggregate carrier while Topic and Stream stay on data')
    await shot(app.page, '02a-result-and-response-tracks.png')

    await selectTrack(app.page, 'communication-action-track', 'feedback')
    await waitFor(app.page, `document.querySelector('[data-communication-id="A2"]')?.getAttribute('data-communication-representative-phase') === 'feedback'`, 'Action feedback representative')
    assert.deepEqual(await representativeState(app.page, 'A2'), {
      phase: 'feedback', id: 'shape:edge-move-feedback', policy: 'feedback',
    })
    assert.equal((await representativeState(app.page, 'A3')).phase, 'goal')
    pass('an Action without optional feedback falls back to its initiating goal instead of disappearing')

    await selectTrack(app.page, 'communication-service-track', 'shortest')
    await selectTrack(app.page, 'communication-action-track', 'shortest')
    const shortestMoveId = Object.entries(moveLengths)
      .filter(([id]) => id !== 'shape:edge-move-cancel')
      .sort(([, a], [, b]) => a - b)[0][0]
    const shortestPoseId = Object.entries(poseLengths).sort(([, a], [, b]) => a - b)[0][0]
    await waitFor(app.page, `document.querySelector('[data-communication-id="A2"]')?.getAttribute('data-communication-representative-policy') === 'shortest'`, 'shortest representatives')
    assert.equal((await representativeState(app.page, 'A2')).id, shortestMoveId)
    assert.equal((await representativeState(app.page, 'S2')).id, shortestPoseId)
    assert.equal(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes())`), seededGraph)
    pass('Shortest measures the real routed polyline, excludes Action cancel, and never mutates canonical wiring')
    await shot(app.page, '02b-shortest-tracks.png')

    await clickElement(app.page, '[data-testid="communication-route-straight"]')
    await waitFor(app.page, `document.querySelector('[data-testid="communication-service-track"]')?.disabled === true`, 'straight-route selector guard')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="communication-action-track"]')?.disabled === true`), true)
    await clickElement(app.page, '[data-testid="communication-route-elbow"]')
    pass('representative selectors become unavailable when Straight makes every carrier the same centre line')

    const focusHit = await elementBox(app.page, '[data-communication-mode="components"][data-communication-id="A2"] [data-communication-focus-hit]')
    await clickAt(app.page, focusHit.cx, focusHit.cy)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-status"]')?.textContent.includes('A2 focused · 4 legs')`, 'A2 focus')
    assert.equal(await evaluate(app.page, `document.querySelectorAll('[data-communication-mode="components"][data-communication-focus="active"]').length`), 1)
    assert.equal(await evaluate(app.page, `document.querySelectorAll('[data-communication-mode="components"][data-communication-focus="dim"]').length`), 8)
    pass('clicking A2 isolates only the four-leg move Action from eight unrelated relationships')
    await shot(app.page, '02-a2-focus-over-simple-components.png')

    await clickElement(app.page, '[data-testid="communication-cables-split"]')
    await waitFor(app.page, `document.querySelectorAll('[data-communication-mode="tagged"][data-communication-focus="active"]').length === 4`, 'focused A2 protocol legs')
    assert.equal(await evaluate(app.page, `document.querySelectorAll('[data-communication-mode="tagged"][data-communication-focus="dim"]').length`), 14)
    pass('the A2 focus expands back to exactly goal, cancel, feedback, and result in Tagged view')

    await clickElement(app.page, '[data-testid="communication-lens-dataflow"]')
    const alertsOutput = await elementBox(app.page, '[data-shape-id="shape:camera"] .Port[data-block-port-id="alerts"]')
    const alertsInput = await elementBox(app.page, '[data-shape-id="shape:telemetry"] .Port[data-block-port-id="alerts"]')
    await dragBetween(app.page, alertsOutput, alertsInput)
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === 19`, 'nineteenth Async wire')
    const newWire = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'connection')
      .find((shape) => !shape.id.startsWith('shape:edge-')))`))
    assert.equal(newWire.props.temporal, 'async')
    assert.equal(newWire.parentId, REGION)
    assert.equal(newWire.meta.systemSketchAsyncRegionDefault?.regionId, REGION)
    pass('a real alerts port drag adds a nineteenth wire with the region Async default and provenance')
    await shot(app.page, '03-new-alerts-wire-defaults-async.png')

    const problemTitle = await evaluate(app.page, `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label') ?? document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('title') ?? ''`)
    assert.match(problemTitle, /1 issue/)
    await clickElement(app.page, '.systemsketch-diagnostics-trigger')
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')`, 'stress-board diagnostics')
    const diagnostics = JSON.parse(await evaluate(app.page, `JSON.stringify([...document.querySelectorAll('[data-diagnostic-code]')].map((node) => ({
      code: node.getAttribute('data-diagnostic-code'),
      label: node.getAttribute('aria-label'),
    })))`))
    assert.equal(diagnostics.length, 1)
    findings.push(`After the live nineteenth-wire mutation, the generic Problems analyzer reports ${diagnostics[0].code}: ${diagnostics[0].label}. The communication lens itself reports zero association issues.`)
    await clickElement(app.page, '.systemsketch-diagnostics-trigger')
    await waitFor(app.page, `!document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')`, 'closed stress-board diagnostics')
    pass('the stress test records the adjacent generic diagnostic raised after the valid live wire instead of hiding it')

    await evaluate(app.page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === 18`, 'alerts wire undo')
    const outside = await pagePoint(app.page, { x: regionBounds.x - 180, y: regionBounds.y + regionBounds.h + 100 })
    await clickAt(app.page, outside.x, outside.y)
    await waitFor(app.page, `!document.querySelector('[data-testid="communication-prototype-controls"]')`, 'context controls dismissal')
    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('clicking outside dismisses the lens and the saved board returns to its seeded 18-wire state')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks, findings }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
