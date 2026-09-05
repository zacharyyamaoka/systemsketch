#!/usr/bin/env node
/**
 * Real-browser proof for the communication projection prototype.
 *
 * One actual SystemSketch board is driven through Dataflow → Tag edges →
 * Components. The journey asserts that the tagged state keeps all canonical
 * protocol legs and ports, while Components collapses those legs without
 * mutating any Block record. Simple and Port render in the exact same boxes.
 * Elbow reuses the chosen canonical protocol track (goal for Action, request
 * for Service); Straight follows the component centreline. This is prototype
 * evidence, not a claim that the communication schema is ready for persistence.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'communication-projection')
const RESULTS = join(ASSETS, 'acceptance.json')
const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  const sizes = (w = 340, h = 230) => ({
    simple: { w: 320, h: 190 }, port: { w, h }, expanded: { w: 560, h: 380 }, value: { w: 168, h: 56 },
  })
  const port = (id, name, type) => ({ id, name, type, visible: true })
  const block = (id, x, y, title, blockType, inputs, outputs, w = 340, h = 230) => ({
    id: 'shape:' + id, type: 'block', x, y,
    props: {
      title, description: '', blockType, view: 'port', w, h, views: sizes(w, h),
      showDescription: false, portLayout: 'inline', state: 'normal', inputs, outputs,
    },
  })
  const value = (id, x, y, name, type) => ({
    id: 'shape:' + id, type: 'block', x, y,
    props: {
      title: '', description: '', blockType: '', view: 'value', w: 168, h: 56, views: sizes(),
      showDescription: false, portLayout: 'inline', state: 'normal', inputs: [],
      outputs: [port('out_1', name, type)],
    },
  })
  const blocks = [
    block('camera', 100, 150, 'Camera', 'component', [], [
      port('frame', 'frame', 'Image'), port('preview', 'preview', 'Chunk[Image]'),
    ]),
    block('perception', 610, 120, 'Perception', 'component', [
      port('image', 'image', 'Image'), port('threshold', 'threshold', 'float'),
    ], [port('detections', 'detections', 'Detections')]),
    block('planner', 1120, 150, 'Planner', 'component', [
      port('detections', 'detections', 'Detections'),
    ], [port('plan', 'plan', 'Plan')]),
    block('mission', 120, 570, 'Mission BT', 'action client', [
      port('mission_id', 'mission_id', 'str'), port('plan', 'plan', 'Plan'), port('pose_reply', 'pose.reply', 'Pose'),
      port('move_feedback', 'move.feedback', 'Progress'), port('move_result', 'move.result', 'MoveResult'),
    ], [
      port('pose_query', 'pose.query', 'PoseQuery'), port('move_goal', 'move.goal', 'MoveGoal'),
      port('move_cancel', 'move.cancel', 'GoalId'),
    ], 390, 300),
    block('motion', 700, 540, 'Motion Controller', 'service + action server', [
      port('pose_query', 'pose.query', 'PoseQuery'), port('move_goal', 'move.goal', 'MoveGoal'),
      port('move_cancel', 'move.cancel', 'GoalId'),
    ], [
      port('pose_reply', 'pose.reply', 'Pose'), port('move_feedback', 'move.feedback', 'Progress'),
      port('move_result', 'move.result', 'MoveResult'), port('status', 'status', 'Status'),
    ], 420, 300),
    block('telemetry', 1260, 560, 'Telemetry UI', 'component', [
      port('preview', 'preview', 'Chunk[Image]'), port('status', 'status', 'Status'),
    ], []),
    value('threshold_value', 445, 360, 'threshold', 'float'),
    value('mission_value', 70, 455, 'mission_id', 'str'),
  ]
  const edges = [
    ['frame', 'camera', 'frame', 'perception', 'image'],
    ['preview', 'camera', 'preview', 'telemetry', 'preview'],
    ['detections', 'perception', 'detections', 'planner', 'detections'],
    ['plan', 'planner', 'plan', 'mission', 'plan'],
    ['pose_request', 'mission', 'pose_query', 'motion', 'pose_query'],
    ['pose_response', 'motion', 'pose_reply', 'mission', 'pose_reply'],
    ['move_goal', 'mission', 'move_goal', 'motion', 'move_goal'],
    ['move_cancel', 'mission', 'move_cancel', 'motion', 'move_cancel'],
    ['move_feedback', 'motion', 'move_feedback', 'mission', 'move_feedback'],
    ['move_result', 'motion', 'move_result', 'mission', 'move_result'],
    ['status', 'motion', 'status', 'telemetry', 'status'],
    ['threshold_value_edge', 'threshold_value', 'out_1', 'perception', 'threshold'],
    ['mission_value_edge', 'mission_value', 'out_1', 'mission', 'mission_id'],
  ].map(([id, source, sourcePort, target, targetPort]) => ({
    id: 'shape:edge_' + id,
    source: 'shape:' + source,
    target: 'shape:' + target,
    sourcePort,
    targetPort,
    shape: {
      id: 'shape:edge_' + id, type: 'connection', x: 0, y: 0,
      props: {
        start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow', curve: null,
        pins: [], elbowRoute: null, routeMode: 'automatic', temporal: 'data', delayValue: '', pillPosition: .5,
        tunnel: false, tunnelLayer: '', state: 'normal',
      },
    },
  }))
  editor.run(() => {
    editor.createShapes(blocks)
    editor.createShapes(edges.map((edge) => edge.shape))
    editor.createBindings(edges.flatMap((edge) => [
      { type: 'connection', fromId: edge.id, toId: edge.source,
        props: { portId: edge.sourcePort, terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: edge.target,
        props: { portId: edge.targetPort, terminal: 'end', face: 'outer' } },
    ]))
  })
  editor.selectNone()
  editor.zoomToFit({ animation: { duration: 0 }, inset: 120 })
  return true
})()`

async function centers(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    return ['camera', 'perception', 'planner', 'mission', 'motion', 'telemetry'].map((name) => {
      const bounds = editor.getShapePageBounds('shape:' + name)
      return { name, x: bounds.center.x, y: bounds.center.y }
    })
  })())`))
}

async function componentBoxes(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    return ['camera', 'perception', 'planner', 'mission', 'motion', 'telemetry'].map((name) => {
      const box = document.querySelector('[data-shape-id="shape:' + name + '"]').getBoundingClientRect()
      return { name, x: box.x, y: box.y, w: box.width, h: box.height }
    })
  })())`))
}

async function visiblePath(page, edge) {
  return evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="shape:${edge}"]')
    return (root?.querySelector('[data-communication-track-path]') ?? root?.querySelector('path'))?.getAttribute('d') ?? null
  })()`)
}

async function storedGraph(page) {
  return evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes())`)
}

async function state(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const blocks = editor.getCurrentPageShapes().filter((shape) => shape.type === 'block')
    const visibleValues = ['threshold_value', 'mission_value'].filter((name) =>
      document.querySelector('[data-shape-id="shape:' + name + '"]'))
    return {
      mode: document.querySelector('[data-testid="communication-prototype-controls"]')?.dataset.projectionMode,
	  componentView: [...document.querySelectorAll('[data-testid^="communication-components-view-"]')]
	    .find((node) => node.getAttribute('aria-pressed') === 'true')?.textContent?.trim().toLowerCase() ?? null,
      tagged: document.querySelectorAll('[data-communication-mode="tagged"]').length,
      relationships: document.querySelectorAll('[data-communication-mode="components"]').length,
      relationshipFamilies: [...document.querySelectorAll('[data-communication-mode="components"]')]
        .map((node) => node.dataset.communicationFamily).sort(),
	  representatives: [...document.querySelectorAll('[data-communication-mode="components"]')]
	    .map((node) => ({
	      family: node.dataset.communicationFamily,
	      phase: node.dataset.communicationRepresentativePhase,
	      edge: node.closest('[data-shape-id]')?.getAttribute('data-shape-id'),
	    })),
      routes: [...document.querySelectorAll('[data-communication-mode="components"]')]
        .map((node) => node.dataset.communicationRoute),
	  storedComponentViews: blocks.filter((shape) => shape.props.view !== 'value').map((shape) => shape.props.view),
	  renderedComponentViews: ['camera', 'perception', 'planner', 'mission', 'motion', 'telemetry']
	    .map((name) => document.querySelector('[data-shape-id="shape:' + name + '"] [data-block-view]')?.dataset.blockView),
      visibleValues,
      blockCount: blocks.length,
      edgeCount: editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length,
    }
  })())`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-communication-projection',
    build: 'communication-projection-prototype',
    width: 1800,
    height: 1080,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'communication-projection.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?prototype=communication&board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'prototype board editor', 30_000)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'prototype controls')
    await evaluate(app.page, SEED)
    await delay(850)

    let observed = await state(app.page)
    assert.equal(observed.mode, 'wiring')
    assert.equal(observed.edgeCount, 13)
    assert.deepEqual(new Set(observed.storedComponentViews), new Set(['port']))
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['port']))
    assert.deepEqual(observed.visibleValues, ['threshold_value', 'mission_value'])
    pass('Dataflow opens as one real 8-node, 13-edge SystemSketch graph in Port view')
    await shot(app.page, '01-dataflow.png')
    const beforeCenters = await centers(app.page)
    const beforeBoxes = await componentBoxes(app.page)
    const beforeGraph = await storedGraph(app.page)
    const trackedPaths = Object.fromEntries(await Promise.all(
      ['edge_frame', 'edge_preview', 'edge_pose_request', 'edge_move_goal']
        .map(async (edge) => [edge, await visiblePath(app.page, edge)]),
    ))

    await clickElement(app.page, '[data-testid="communication-mode-tagged"]')
    await delay(500)
    observed = await state(app.page)
    assert.equal(observed.mode, 'tagged')
    assert.equal(observed.tagged, 11)
    assert.equal(observed.relationships, 0)
    assert.deepEqual(new Set(observed.storedComponentViews), new Set(['port']))
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['port']))
    assert.deepEqual(observed.visibleValues, ['threshold_value', 'mission_value'])
    pass('Tag edges recolors and labels all 11 component protocol legs without changing ports or local values')
    await shot(app.page, '02-tagged-edges.png')

    await clickElement(app.page, '[data-testid="communication-mode-components"]')
    await delay(600)
    observed = await state(app.page)
    assert.equal(observed.mode, 'components')
    assert.equal(observed.tagged, 0)
    assert.equal(observed.relationships, 7)
    assert.deepEqual(observed.relationshipFamilies, ['action', 'service', 'stream', 'topic', 'topic', 'topic', 'topic'])
    assert.equal(observed.componentView, 'simple')
    assert.deepEqual(new Set(observed.storedComponentViews), new Set(['port']))
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['simple']))
    assert.deepEqual(new Set(observed.routes), new Set(['elbow']))
    assert.deepEqual(observed.visibleValues, [])
    const afterCenters = await centers(app.page)
    assert.deepEqual(afterCenters, beforeCenters)
    assert.deepEqual(await componentBoxes(app.page), beforeBoxes)
    assert.equal(await storedGraph(app.page), beforeGraph)
    const action = observed.representatives.find((entry) => entry.family === 'action')
    const service = observed.representatives.find((entry) => entry.family === 'service')
    assert.deepEqual(action, { family: 'action', phase: 'goal', edge: 'shape:edge_move_goal' })
    assert.deepEqual(service, { family: 'service', phase: 'request', edge: 'shape:edge_pose_request' })
    for (const [edge, path] of Object.entries(trackedPaths)) {
      assert.equal(await visiblePath(app.page, edge), path)
    }
    pass('Simple overlays the Port-sized boxes without moving or mutating them; Elbow reuses goal/request/data tracks')
    await shot(app.page, '03-components-simple-elbow.png')

    await clickElement(app.page, '[data-testid="communication-components-view-port"]')
    await delay(350)
    observed = await state(app.page)
    assert.equal(observed.componentView, 'port')
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['port']))
    assert.deepEqual(await componentBoxes(app.page), beforeBoxes)
    assert.equal(await storedGraph(app.page), beforeGraph)
    pass('Components toggles to Port without changing any box, centre, or stored Block view')
    await shot(app.page, '04-components-port-elbow.png')

    await clickElement(app.page, '[data-testid="communication-components-view-simple"]')
    await clickElement(app.page, '[data-testid="communication-route-straight"]')
    await delay(400)
    observed = await state(app.page)
    assert.equal(observed.componentView, 'simple')
    assert.deepEqual(new Set(observed.routes), new Set(['straight']))
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['simple']))
    assert.deepEqual(await componentBoxes(app.page), beforeBoxes)
    assert.equal(await storedGraph(app.page), beforeGraph)
    pass('Straight redraws all seven relationships on component centrelines over the same Simple boxes')
    await shot(app.page, '05-components-simple-straight.png')

    await clickElement(app.page, '[data-testid="communication-components-view-port"]')
    await delay(350)
    observed = await state(app.page)
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['port']))
    assert.deepEqual(await componentBoxes(app.page), beforeBoxes)
    await shot(app.page, '06-components-port-straight.png')

    await clickElement(app.page, '[data-testid="communication-mode-wiring"]')
    await delay(500)
    observed = await state(app.page)
    assert.equal(observed.mode, 'wiring')
    assert.equal(observed.tagged, 0)
    assert.equal(observed.relationships, 0)
    assert.deepEqual(new Set(observed.storedComponentViews), new Set(['port']))
    assert.deepEqual(new Set(observed.renderedComponentViews), new Set(['port']))
    assert.deepEqual(observed.visibleValues, ['threshold_value', 'mission_value'])
    assert.deepEqual(await centers(app.page), beforeCenters)
    assert.deepEqual(await componentBoxes(app.page), beforeBoxes)
    assert.equal(await storedGraph(app.page), beforeGraph)
    pass('returning to Dataflow restores values and canonical edges with a byte-identical stored graph')

    const errors = await localConsoleErrors(app.page)
    assert.deepEqual(errors, [])
    pass('the real browser journey emitted no local console errors')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
