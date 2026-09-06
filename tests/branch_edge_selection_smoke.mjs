#!/usr/bin/env node
/**
 * Regression proof for selecting a semantic cable through an open Branch arm.
 *
 * The arm's invisible structural frame must crop its ordinary children without
 * becoming an opaque hit-test sheet over the semantic cable that the Branch
 * owns. The click below is sampled from the painted wire, rather than guessed
 * from its bounds, so it reproduces the actual pointer failure precisely.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const SHOT = join(SHOTS, 'branch-edge-selection.png')

const SEED_BRANCH = `(() => {
  const editor = window.__systemsketch.editor
  const branch = {
    id: 'shape:edge-branch', type: 'branch', x: 160, y: 120,
    props: {
      w: 920, h: 524, title: 'Route inside this arm', view: 'expanded', activeArmId: null, controls: [],
      arms: [
        { id: 'arm_1', title: 'if', open: true, h: 200 },
        { id: 'arm_2', title: 'else', open: true, h: 200 },
      ],
    },
  }
  editor.createShape(branch)
  return true
})()`

const SEED_CONTENT = `(() => {
  const editor = window.__systemsketch.editor
  const branch = editor.getShape('shape:edge-branch')
  const arm = editor.getCurrentPageShapes().find((shape) =>
    shape.type === 'branch-arm' && shape.parentId === branch.id && shape.props.armId === 'arm_1')
  if (!arm) throw new Error('Branch arm frame did not materialize')
  const block = (id, x, title, inputs, outputs) => ({
    id, type: 'block', parentId: arm.id, x, y: 58,
    meta: { branchArm: 'arm_1' },
    props: { w: 260, h: 150, title, view: 'port', inputs, outputs },
  })
  const source = block('shape:edge-source', 54, 'source()', [], [
    { id: 'out0', name: 'payload', type: 'Data', visible: true },
  ])
  const target = block('shape:edge-target', 600, 'sink()', [
    { id: 'in0', name: 'payload', type: 'Data', visible: true },
  ], [])
  const edge = {
    id: 'shape:edge-within-branch', type: 'connection', x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
      pins: [], elbowRoute: null, routeMode: 'automatic',
    },
  }
  editor.run(() => {
    editor.createShapes([source, target, edge])
    editor.createBindings([
      { type: 'connection', fromId: edge.id, toId: source.id,
        props: { portId: 'out0', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: target.id,
        props: { portId: 'in0', terminal: 'end', face: 'outer' } },
    ])
  })
  editor.zoomToFit({ animation: { duration: 0 }, inset: 120 })
  return true
})()`

async function pointOnWireInFirstArm(page) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const edgeId = 'shape:edge-within-branch'
    const path = document.querySelector('[data-shape-id="' + edgeId + '"] path')
    const arm = editor.getCurrentPageShapes().find((shape) =>
      shape.type === 'branch-arm' && shape.parentId === 'shape:edge-branch' && shape.props.armId === 'arm_1')
    if (!path || !arm) return null
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const canvas = editor.getContainer().getBoundingClientRect()
    const armBounds = editor.getShapePageBounds(arm.id)
    const blocks = ['shape:edge-source', 'shape:edge-target'].map((id) => editor.getShapePageBounds(id))
    for (let i = 10; i < 90; i += 1) {
      const local = path.getPointAtLength(length * i / 100)
      const client = new DOMPoint(local.x, local.y).matrixTransform(matrix)
      const pagePoint = editor.screenToPage({ x: client.x - canvas.left, y: client.y - canvas.top })
      const onArm = armBounds.containsPoint(pagePoint, 12)
      const overBlock = blocks.some((bounds) => bounds.containsPoint(pagePoint, 18))
      if (onArm && !overBlock) return JSON.stringify({ x: client.x, y: client.y, pagePoint })
    }
    return null
  })()`)
  if (!value) throw new Error('Could not find a painted wire point inside the open Branch arm')
  return JSON.parse(value)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-branch-edge-selection',
    build: 'branch-edge-selection',
    width: 1440,
    height: 900,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'branch-edge-selection.systemsketch')
  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'development editor seam', 30_000)
    await evaluate(app.page, SEED_BRANCH)
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) =>
        shape.type === 'branch-arm' && shape.parentId === 'shape:edge-branch').length === 2`,
      'materialized Branch arm frames')
    await evaluate(app.page, SEED_CONTENT)
    await waitFor(app.page,
      `window.__systemsketch.editor.getShape('shape:edge-within-branch')?.parentId === 'shape:edge-branch'`,
      'semantic cable settled above the Branch face')
    await waitFor(app.page,
      `document.querySelector('[data-shape-id="shape:edge-within-branch"] path')`,
      'painted semantic cable')
    await delay(350)

    const point = await pointOnWireInFirstArm(app.page)
    await clickAt(app.page, point.x, point.y)
    await waitFor(app.page,
      `window.__systemsketch.editor.getOnlySelectedShapeId() === 'shape:edge-within-branch'`,
      'semantic cable selection through the arm frame')

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    console.log(`PASS Branch-arm interior wire selects its connection → ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
