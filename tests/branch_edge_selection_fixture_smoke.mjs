#!/usr/bin/env node
/** Drive the saved Branch cable-selection review board through its real gesture. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'branch-edge-selection.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'branch-edge-selection-fixture-driven-2026-09-06.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'branch-edge-selection-fixture-driven-2026-09-06.json')

async function shapeBox(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    if (!bounds) return null
    const a = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
  })()`)
  if (!value) throw new Error(`Missing bounds for ${shapeId}`)
  return JSON.parse(value)
}

async function cablePoint(page) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="shape:cable"] path')
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * 0.5)
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM())
    return JSON.stringify({ x: screen.x, y: screen.y })
  })()`)
  if (!value) throw new Error('Missing painted fixture cable')
  return JSON.parse(value)
}

async function main() {
  const app = await startApp({
    label: 'systemsketch-branch-edge-selection-fixture',
    build: 'branch-edge-selection-fixture',
    width: 1600,
    height: 960,
  })
  const results = {}
  try {
    const scratchDir = join(app.filesRoot, 'SystemSketch')
    const scratch = join(scratchDir, 'branch-edge-selection-copy.systemsketch')
    await mkdir(scratchDir, { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(app.page,
      `window.__systemsketch?.editor?.getShape('shape:cable')`,
      'saved Branch cable review board')
    await delay(450)

    const endpointBefore = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getShape('shape:cue-step-click-wire-arrow')
      const end = editor.getShapeHandles(arrow)?.find((handle) => handle.id === 'end')
      return JSON.stringify(editor.getShapePageTransform(arrow).applyToPoint(end))
    })()`))
    const targetBefore = await shapeBox(app.page, 'shape:target')
    await drag(app.page,
      { x: targetBefore.x + targetBefore.w * 0.5, y: targetBefore.y + targetBefore.h * 0.73 },
      { x: targetBefore.x + targetBefore.w * 0.5 + 52, y: targetBefore.y + targetBefore.h * 0.73 + 18 },
    )
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:target').x > 520`, 'fixture target move')
    const endpointAfter = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getShape('shape:cue-step-click-wire-arrow')
      const end = editor.getShapeHandles(arrow)?.find((handle) => handle.id === 'end')
      return JSON.stringify(editor.getShapePageTransform(arrow).applyToPoint(end))
    })()`))
    assert.ok(endpointAfter.x > endpointBefore.x + 40)
    assert.ok(endpointAfter.y > endpointBefore.y + 10)
    results.cueFollowsMovedTarget = true

    const point = await cablePoint(app.page)
    await clickAt(app.page, point.x, point.y)
    await waitFor(app.page,
      `window.__systemsketch.editor.getOnlySelectedShapeId() === 'shape:cable'`,
      'connection selection from its painted interior')
    await waitFor(app.page,
      `document.querySelector('[aria-label="Connection inspector"]')`,
      'Connection inspector')
    results.selectedShape = await evaluate(app.page, `window.__systemsketch.editor.getOnlySelectedShapeId()`)

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    results.consoleErrors = localConsoleErrors(app.page)
    assert.deepEqual(results.consoleErrors, [])
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    console.log(`PASS saved Branch fixture: cue follows target and interior wire selects → ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
