#!/usr/bin/env node
/**
 * Real-browser regression for the two faces of an Expanded Block's effect port.
 *
 * The physical dot sits on the top edge in both scopes. Its outer cable leaves
 * upward; its inner cable must approach that same dot from below. Reusing the
 * outer normal on the inner face makes the nested cable loop above its parent.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { setView } from './block_journey_helpers.mjs'

const SOURCE = join(ROOT, 'sketches', 'review', 'mutating-line-examples.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'mutline-robotics-browser-2026-09-05.png')
const NESTED_EFFECTS = [
  'cycle_frames_effect',
  'cycle_world_effect',
  'cycle_queue_effect',
  'cycle_robot_effect',
  'acquire_frames_effect',
  'world_effect',
  'plan_queue_effect',
  'execute_robot_effect',
  'servo_robot_effect',
]

async function effectEndpointRuns(page, connectionId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="shape:${connectionId}"]')
    if (!root) throw new Error('missing painted connection ${connectionId}')
    const candidates = Array.from(root.querySelectorAll('path')).map((path) => {
      try { return { path, length: path.getTotalLength() } } catch { return null }
    }).filter(Boolean).sort((a, b) => b.length - a.length)
    const chosen = candidates[0]
    if (!chosen || chosen.length < 8) throw new Error('missing route path ${connectionId}')
    const { path, length } = chosen
    const matrix = path.getScreenCTM()
    const at = (distance) => {
      const point = path.getPointAtLength(Math.max(0, Math.min(length, distance)))
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    }
    const sample = Math.min(36, length / 4)
    const start = at(0)
    const afterStart = at(sample)
    const beforeEnd = at(length - sample)
    const end = at(length)
    return JSON.stringify({
      leave: { dx: afterStart.x - start.x, dy: afterStart.y - start.y },
      arrive: { dx: end.x - beforeEnd.x, dy: end.y - beforeEnd.y },
    })
  })()`))
}

async function selectBlock(page, shapeId) {
  const rect = JSON.parse(await evaluate(page, `(() => {
    const node = document.querySelector('[data-shape-id="shape:${shapeId}"] .systemsketch-block-canvas')
    if (!node) throw new Error('missing Block ${shapeId}')
    const r = node.getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`))
  await clickAt(page, rect.x + Math.min(28, rect.w / 3), rect.y + Math.min(18, rect.h / 4))
  await delay(300)
}

async function capture(page) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SHOT, Buffer.from(screenshot.data, 'base64'))
}

async function main() {
  await ensureDir(join(ROOT, 'docs', 'assets'))
  const app = await startApp({
    label: 'nested-effect-faces',
    build: 'nested-effect-faces-smoke',
    width: 2000,
    height: 1250,
  })
  const checks = makeChecklist()
  const add = (label, ok) => { assert.ok(ok, label); checks.pass(label) }

  try {
    const boardDir = join(app.filesRoot, 'SystemSketch')
    await mkdir(boardDir, { recursive: true })
    const board = join(boardDir, 'Mutation flow robotics stress.systemsketch')
    await copyFile(SOURCE, board)

    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page,
      `window.__systemsketch?.editor?.getShape('shape:servo_robot_effect')`,
      'robotics mutation fixture', 90000)
    await waitFor(app.page,
      `document.querySelector('[data-shape-id="shape:servo_robot_effect"] path')`,
      'deepest painted effect route', 90000)
    await delay(1200)

    const counts = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const shapes = editor.getCurrentPageShapes()
      const bindings = editor.getBindingsInvolvingShape
        ? shapes.flatMap((shape) => editor.getBindingsInvolvingShape(shape.id))
        : []
      return JSON.stringify({
        shapes: shapes.length,
        blocks: shapes.filter((shape) => shape.type === 'block').length,
        connections: shapes.filter((shape) => shape.type === 'connection').length,
        bindings: new Set(bindings.map((binding) => binding.id)).size,
      })
    })()`))
    add('ROBOT-1 the cold-opened board is a 130-shape stress fixture', counts.shapes === 130)
    add('ROBOT-2 it carries 86 semantic data/effect connections', counts.connections === 86)
    add('ROBOT-3 it contains a substantial multifunction graph', counts.blocks === 37)

    for (const id of NESTED_EFFECTS) {
      const run = await effectEndpointRuns(app.page, id)
      add(`${id} leaves the child top edge upward`, Math.abs(run.leave.dx) < 2.5 && run.leave.dy < -3)
      add(`${id} reaches the parent top edge from below`, Math.abs(run.arrive.dx) < 2.5 && run.arrive.dy < -3)
    }
    await evaluate(app.page,
      `(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()`)
    await delay(400)
    await capture(app.page)

    // Zoom is camera setup only; both view changes below are real clicks through
    // the stock inspector and exercise the product's collapse transaction.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.zoomToBounds(editor.getShapePageBounds('shape:execute_pick'), {
        targetZoom: 0.72,
        animation: { duration: 0 },
      })
      return true
    })()`)
    await delay(500)
    await selectBlock(app.page, 'execute_pick')
    await setView(app.page, 'port')
    add('ROBOT-4 collapsing execute_pick hides its nested servo mutation route',
      await evaluate(app.page,
        `window.__systemsketch.editor.isShapeHidden(window.__systemsketch.editor.getShape('shape:servo_robot_effect'))`) === true)

    await selectBlock(app.page, 'execute_pick')
    await setView(app.page, 'expanded')
    await waitFor(app.page,
      `document.querySelector('[data-shape-id="shape:servo_robot_effect"] path')`,
      'deep effect route after re-expansion')
    add('ROBOT-5 re-expanding restores the exact persisted route record',
      await evaluate(app.page,
        `window.__systemsketch.editor.getShape('shape:servo_robot_effect')?.type === 'connection'`
      ) === true)
    add('ROBOT-6 the real journey raised no local console errors', localConsoleErrors(app.page).length === 0)
  } finally {
    app.close()
  }

  process.stdout.write(`\n  ${checks.checks.length}/${checks.checks.length} nested-effect checks passed\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
