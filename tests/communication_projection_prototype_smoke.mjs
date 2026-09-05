#!/usr/bin/env node
/**
 * Real-browser proof for the communication projection prototype.
 *
 * One actual SystemSketch board is driven through Dataflow → Tag edges →
 * Components. The journey asserts that the tagged state keeps all canonical
 * protocol legs and ports, while Components collapses those legs, switches the
 * same Block records to Simple, hides literal data nodes, and routes the
 * relationships independently of ports. It also exercises all three proposed
 * relationship route treatments; this is prototype evidence, not a claim that
 * the communication schema is ready for production persistence.
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
    ['frame', 'camera', 'frame', 'perception', 'image', -30],
    ['preview', 'camera', 'preview', 'telemetry', 'preview', -150],
    ['detections', 'perception', 'detections', 'planner', 'detections', -15],
    ['plan', 'planner', 'plan', 'mission', 'plan', 90],
    ['pose_request', 'mission', 'pose_query', 'motion', 'pose_query', -90],
    ['pose_response', 'motion', 'pose_reply', 'mission', 'pose_reply', 90],
    ['move_goal', 'mission', 'move_goal', 'motion', 'move_goal', -42],
    ['move_cancel', 'mission', 'move_cancel', 'motion', 'move_cancel', -12],
    ['move_feedback', 'motion', 'move_feedback', 'mission', 'move_feedback', 42],
    ['move_result', 'motion', 'move_result', 'mission', 'move_result', 72],
    ['status', 'motion', 'status', 'telemetry', 'status', 20],
    ['threshold_value_edge', 'threshold_value', 'out_1', 'perception', 'threshold', 0],
    ['mission_value_edge', 'mission_value', 'out_1', 'mission', 'mission_id', 0],
  ].map(([id, source, sourcePort, target, targetPort, dy]) => ({
    id: 'shape:edge_' + id,
    source: 'shape:' + source,
    target: 'shape:' + target,
    sourcePort,
    targetPort,
    shape: {
      id: 'shape:edge_' + id, type: 'connection', x: 0, y: 0,
      props: {
        start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'curved', curve: dy ? { dx: 0, dy } : null,
        pins: [], elbowRoute: null, routeMode: 'authored', temporal: 'data', delayValue: '', pillPosition: .5,
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

async function state(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const blocks = editor.getCurrentPageShapes().filter((shape) => shape.type === 'block')
    const visibleValues = ['threshold_value', 'mission_value'].filter((name) =>
      document.querySelector('[data-shape-id="shape:' + name + '"]'))
    return {
      mode: document.querySelector('[data-testid="communication-prototype-controls"]')?.dataset.projectionMode,
      tagged: document.querySelectorAll('[data-communication-mode="tagged"]').length,
      relationships: document.querySelectorAll('[data-communication-mode="components"]').length,
      relationshipFamilies: [...document.querySelectorAll('[data-communication-mode="components"]')]
        .map((node) => node.dataset.communicationFamily).sort(),
      routes: [...document.querySelectorAll('[data-communication-mode="components"]')]
        .map((node) => node.dataset.communicationRoute),
      componentViews: blocks.filter((shape) => shape.props.view !== 'value').map((shape) => shape.props.view),
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
    assert.deepEqual(new Set(observed.componentViews), new Set(['port']))
    assert.deepEqual(observed.visibleValues, ['threshold_value', 'mission_value'])
    pass('Dataflow opens as one real 8-node, 13-edge SystemSketch graph in Port view')
    await shot(app.page, '01-dataflow.png')
    const beforeCenters = await centers(app.page)

    await clickElement(app.page, '[data-testid="communication-mode-tagged"]')
    await delay(500)
    observed = await state(app.page)
    assert.equal(observed.mode, 'tagged')
    assert.equal(observed.tagged, 11)
    assert.equal(observed.relationships, 0)
    assert.deepEqual(new Set(observed.componentViews), new Set(['port']))
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
    assert.deepEqual(new Set(observed.componentViews), new Set(['simple']))
    assert.deepEqual(observed.visibleValues, [])
    const afterCenters = await centers(app.page)
    assert.deepEqual(afterCenters, beforeCenters)
    pass('Components preserves occurrence centres, hides literal nodes, and collapses 11 legs into 7 relationships')
    await shot(app.page, '03-components-curved.png')

    for (const route of ['straight', 'laser']) {
      await clickElement(app.page, `[data-testid="communication-route-${route}"]`)
      await delay(400)
      observed = await state(app.page)
      assert.equal(observed.relationships, 7)
      assert.deepEqual(new Set(observed.routes), new Set([route]))
      pass(`Components switches every relationship to the ${route} treatment`)
      await shot(app.page, `04-components-${route}.png`)
    }

    await clickElement(app.page, '[data-testid="communication-mode-wiring"]')
    await delay(500)
    observed = await state(app.page)
    assert.equal(observed.mode, 'wiring')
    assert.equal(observed.tagged, 0)
    assert.equal(observed.relationships, 0)
    assert.deepEqual(new Set(observed.componentViews), new Set(['port']))
    assert.deepEqual(observed.visibleValues, ['threshold_value', 'mission_value'])
    assert.deepEqual(await centers(app.page), beforeCenters)
    pass('returning to Dataflow restores ports and value nodes at the same centres')

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
