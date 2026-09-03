#!/usr/bin/env node
/** Real-browser proof that the saved self-loop fixture stays outside its Block. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  drag,
  ensureDir,
  evaluate,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'self-loop-routing.systemsketch')
const SCREENSHOT = join(ROOT, 'docs', 'assets', 'self-loop-routing-fixture-acceptance.png')

async function elementRect(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('missing element ' + ${JSON.stringify(selector)})
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function paintedPathSamples(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="${shapeId}"] path')
    if (!path) throw new Error('missing painted path ${shapeId}')
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const points = []
    for (let index = 0; index <= 480; index += 1) {
      const point = path.getPointAtLength(length * index / 480)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      points.push({ x: screen.x, y: screen.y })
    }
    return JSON.stringify(points)
  })()`))
}

function pathCrossesCardInterior(points, card, inset = 2) {
  return points.some((point) => (
    point.x > card.x + inset
    && point.x < card.x + card.w - inset
    && point.y > card.y + inset
    && point.y < card.y + card.h - inset
  ))
}

async function capture(page) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SCREENSHOT, Buffer.from(screenshot.data, 'base64'))
}

async function main() {
  const before = await readFile(FIXTURE)
  const app = await startApp({
    label: 'self-loop-routing-fixture',
    build: 'self-loop-routing-fixture-smoke',
    allowSourceRoot: true,
    width: 1280,
    height: 800,
  })

  try {
    await ensureDir(join(ROOT, 'docs', 'assets'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(FIXTURE)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:subject')`, 'self-loop fixture')

    const subjectSelector = '[data-shape-id="shape:subject"] .systemsketch-block-canvas'
    const subjectBefore = await elementRect(app.page, subjectSelector)
    const cueBefore = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    await drag(
      app.page,
      { x: subjectBefore.x + subjectBefore.w / 2, y: subjectBefore.y + 150 },
      { x: subjectBefore.x + subjectBefore.w / 2 + 80, y: subjectBefore.y + 150 },
    )
    await waitFor(app.page, `document.querySelector(${JSON.stringify(subjectSelector)})
      .getBoundingClientRect().x > ${subjectBefore.x + 60}`, 'fixture Block moved')
    const cueAfter = JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-1-arrow'))`))
    assert.ok(Math.max(
      Math.abs(cueAfter.x - cueBefore.x),
      Math.abs(cueAfter.y - cueBefore.y),
      Math.abs(cueAfter.w - cueBefore.w),
      Math.abs(cueAfter.h - cueBefore.h),
    ) > 40)
    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page, `Math.abs(document.querySelector(${JSON.stringify(subjectSelector)})
      .getBoundingClientRect().x - ${subjectBefore.x}) < 2`, 'fixture Block move undo')

    const output = await elementRect(app.page, '[data-shape-id="shape:subject"] [data-block-port-id="out_1"]')
    const input = await elementRect(app.page, '[data-shape-id="shape:subject"] [data-block-port-id="in_1"]')
    await drag(
      app.page,
      { x: output.x + output.w / 2, y: output.y + output.h / 2 },
      { x: input.x + input.w / 2, y: input.y + input.h / 2 },
    )
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === 1`,
      'self-loop creation')

    const subject = await elementRect(app.page, subjectSelector)
    const connection = await evaluate(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'connection').id`)
    const connectionPoints = await paintedPathSamples(app.page, connection)
    assert.equal(pathCrossesCardInterior(connectionPoints, subject), false)
    assert.ok(Math.max(...connectionPoints.map((point) => point.y)) > subject.y + subject.h + 4)
    await capture(app.page)

    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === 0`,
      'self-loop removal undo')
    await delay(300)
    assert.deepEqual(await readFile(FIXTURE), before)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
