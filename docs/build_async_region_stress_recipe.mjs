#!/usr/bin/env node
/** Build the reproducible adversarial review recipe for contextual Async regions. */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('sketches/review/async-region-stress.recipe.json')
const regionId = 'async-region-stress'
const regionMeta = { systemSketchAsyncRegion: { version: 1 } }

const port = (id, name, type) => ({ id, name, type, visible: true })
const views = (w, h) => ({
  simple: { w: 320, h: 190 },
  port: { w, h },
  expanded: { w: Math.max(620, w), h: Math.max(440, h) },
  value: { w: 168, h: 56 },
})
const block = (id, x, y, title, description, w, h, inputs, outputs) => ({
  id,
  type: 'block',
  parentId: regionId,
  x,
  y,
  props: {
    title,
    description,
    blockType: 'component',
    view: 'port',
    w,
    h,
    views: views(w, h),
    showDescription: true,
    portLayout: 'inline',
    state: 'normal',
    inputs,
    outputs,
  },
})

const shapes = [
  {
    id: regionId,
    type: 'frame',
    x: 500,
    y: 260,
    props: { w: 1700, h: 1020, name: 'Async region · Warehouse autonomy', color: 'violet' },
    meta: regionMeta,
  },
  block('camera', 50, 100, 'Camera gateway', 'Topic + Stream producer; alerts is intentionally unwired', 500, 220, [], [
    port('frame', 'frame', 'Image'),
    port('preview', 'preview', 'Chunk[Image]'),
    port('alerts', 'alerts', 'Alert'),
  ]),
  block('perception', 670, 100, 'Perception', 'Consumes frames and publishes detections', 360, 220, [
    port('frame', 'frame', 'Image'),
  ], [
    port('detections', 'detections', 'Detections'),
  ]),
  block('telemetry', 1200, 100, 'Telemetry UI', 'Stream consumer; alerts is the live defaulting target', 450, 220, [
    port('preview', 'preview', 'Chunk[Image]'),
    port('alerts', 'alerts', 'Alert'),
  ], []),
  block('mission', 70, 390, 'Mission orchestrator', 'Three Actions + three Services share one component pair', 600, 540, [
    port('detections', 'detections', 'Detections'),
    port('dock_feedback', 'dock.feedback', 'Progress'),
    port('dock_result', 'dock.result', 'DockResult'),
    port('move_feedback', 'move.feedback', 'Progress'),
    port('move_result', 'move.result', 'MoveResult'),
    port('status_action_result', 'status.result', 'StatusResult'),
    port('health_response', 'health.response', 'Health'),
    port('pose_response', 'pose.response', 'Pose'),
    port('status_service_response', 'status.response', 'Status'),
  ], [
    port('dock_goal', 'dock.goal', 'DockGoal'),
    port('move_goal', 'move.goal', 'MoveGoal'),
    port('move_cancel', 'move.cancel', 'GoalId'),
    port('status_action_goal', 'status.goal', 'StatusGoal'),
    port('health_request', 'health.request', 'HealthQuery'),
    port('pose_request', 'pose.request', 'PoseQuery'),
    port('status_service_request', 'status.request', 'StatusQuery'),
  ]),
  block('runtime', 1030, 390, 'Robot runtime', 'Server for every Action and Service on the left', 600, 540, [
    port('dock_goal', 'dock.goal', 'DockGoal'),
    port('move_goal', 'move.goal', 'MoveGoal'),
    port('move_cancel', 'move.cancel', 'GoalId'),
    port('status_action_goal', 'status.goal', 'StatusGoal'),
    port('health_request', 'health.request', 'HealthQuery'),
    port('pose_request', 'pose.request', 'PoseQuery'),
    port('status_service_request', 'status.request', 'StatusQuery'),
  ], [
    port('dock_feedback', 'dock.feedback', 'Progress'),
    port('dock_result', 'dock.result', 'DockResult'),
    port('move_feedback', 'move.feedback', 'Progress'),
    port('move_result', 'move.result', 'MoveResult'),
    port('status_action_result', 'status.result', 'StatusResult'),
    port('health_response', 'health.response', 'Health'),
    port('pose_response', 'pose.response', 'Pose'),
    port('status_service_response', 'status.response', 'Status'),
  ]),
]

const bindings = []
const edges = []

function connect(id, fromId, fromPort, toId, toPort) {
  const edgeId = `edge-${id}`
  edges.push({
    id: edgeId,
    type: 'connection',
    parentId: regionId,
    x: 0,
    y: 0,
    props: { routing: 'elbow', temporal: 'async' },
    meta: {
      systemSketchAsyncRegionDefault: { version: 1, regionId: `shape:${regionId}` },
    },
  })
  bindings.push(
    {
      type: 'connection',
      fromId: edgeId,
      toId: fromId,
      props: { portId: fromPort, terminal: 'start', face: 'outer' },
    },
    {
      type: 'connection',
      fromId: edgeId,
      toId,
      props: { portId: toPort, terminal: 'end', face: 'outer' },
    },
  )
}

// Single-leg Topic and Stream patterns across three different component pairs.
connect('frame', 'camera', 'frame', 'perception', 'frame')
connect('preview', 'camera', 'preview', 'telemetry', 'preview')
connect('detections', 'perception', 'detections', 'mission', 'detections')

// Three Actions on one pair, including Action and Service both named `status`.
connect('dock-goal', 'mission', 'dock_goal', 'runtime', 'dock_goal')
connect('dock-feedback', 'runtime', 'dock_feedback', 'mission', 'dock_feedback')
connect('dock-result', 'runtime', 'dock_result', 'mission', 'dock_result')
connect('move-goal', 'mission', 'move_goal', 'runtime', 'move_goal')
connect('move-cancel', 'mission', 'move_cancel', 'runtime', 'move_cancel')
connect('move-feedback', 'runtime', 'move_feedback', 'mission', 'move_feedback')
connect('move-result', 'runtime', 'move_result', 'mission', 'move_result')
connect('status-action-goal', 'mission', 'status_action_goal', 'runtime', 'status_action_goal')
connect('status-action-result', 'runtime', 'status_action_result', 'mission', 'status_action_result')

// Three Services on the same pair. Names, direction, and phases must not bleed.
connect('health-request', 'mission', 'health_request', 'runtime', 'health_request')
connect('health-response', 'runtime', 'health_response', 'mission', 'health_response')
connect('pose-request', 'mission', 'pose_request', 'runtime', 'pose_request')
connect('pose-response', 'runtime', 'pose_response', 'mission', 'pose_response')
connect('status-service-request', 'mission', 'status_service_request', 'runtime', 'status_service_request')
connect('status-service-response', 'runtime', 'status_service_response', 'mission', 'status_service_response')

const callouts = [
  {
    id: 'step-open',
    kind: 'step',
    text: '1 · Click this Async region, then Tag edges. All 18 seeded wires should receive a semantic label.',
    x: 520,
    y: 30,
    w: 600,
    h: 140,
    target: { shapeId: regionId, anchor: 'top', dx: -500 },
  },
  {
    id: 'step-count',
    kind: 'step',
    text: '2 · Confirm A1 dock · A2 move · A3 status, S1 health · S2 pose · S3 status, T1 detections · T2 frame, and ST1 preview.',
    x: 1500,
    y: 30,
    w: 620,
    h: 140,
    target: { shapeId: regionId, anchor: 'top', dx: 500 },
  },
  {
    id: 'step-focus',
    kind: 'step',
    text: '3 · Switch to Components and click A2. Exactly move.goal, cancel, feedback, and result belong to that focus.',
    x: 20,
    y: 500,
    w: 380,
    h: 190,
    target: { shapeId: regionId, anchor: 'left', dy: -250 },
  },
  {
    id: 'step-wire',
    kind: 'step',
    text: '4 · Return to Dataflow. Drag Camera gateway.alerts onto Telemetry UI.alerts. The nineteenth wire should default to Async.',
    x: 2300,
    y: 500,
    w: 440,
    h: 190,
    target: { shapeId: regionId, anchor: 'right', dy: -250 },
  },
  {
    id: 'step-dismiss',
    kind: 'step',
    text: '5 · Click outside the frame. The contextual controls should close while every wire and component remains.',
    x: 520,
    y: 1400,
    w: 650,
    h: 170,
    target: { shapeId: regionId, anchor: 'bottom', dx: -450 },
  },
  {
    id: 'pass',
    kind: 'pass',
    text: 'PASS WHEN · Nine relationships collapse from 18 correctly grouped protocol legs, A2 isolates four move legs, and the new alerts wire is Async by default.',
    x: 1500,
    y: 1400,
    w: 650,
    h: 170,
  },
]

const recipe = {
  feature: 'Async region stress test · mixed communication protocols',
  viewport: { width: 2800, height: 1650 },
  pages: [{ id: 'review', name: 'Async region stress test' }],
  shapes: [...shapes, ...edges],
  bindings,
  callouts,
}

await writeFile(output, `${JSON.stringify(recipe, null, 2)}\n`)
process.stdout.write(`Wrote ${output} with ${edges.length} semantic wires\n`)
