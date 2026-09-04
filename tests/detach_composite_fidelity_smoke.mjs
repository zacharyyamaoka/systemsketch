#!/usr/bin/env node
/**
 * Same-camera visual evidence for every authored composite's detach command.
 *
 * This does not use a render-only approximation: each case right-clicks the
 * live subject, chooses its own real context-menu command, and compares the
 * identically cropped pixels before and after. The structural assertions make
 * the score meaningful — a blank crop cannot pass as a faithful detach.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

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
import { box } from './block_journey_helpers.mjs'

const execFileAsync = promisify(execFile)
const ASSETS = join(ROOT, 'docs', 'assets')
const ACCEPTANCE = join(ASSETS, 'detach-composite-fidelity-acceptance.json')

async function capture(page, path, clip) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { ...clip, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function subjectClip(page, id) {
  return JSON.parse(await editorEval(page, `
    const bounds = editor.getShapePageBounds(${JSON.stringify(id)})
    const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const bottomRight = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({
      x: Math.floor(topLeft.x - 24), y: Math.floor(topLeft.y - 28),
      width: Math.ceil(bottomRight.x - topLeft.x + 48),
      height: Math.ceil(bottomRight.y - topLeft.y + 56),
    })`))
}

async function subjectPoint(page, id, point = 'header') {
  return JSON.parse(await editorEval(page, `
    const shape = editor.getShape(${JSON.stringify(id)})
    const bounds = editor.getShapePageBounds(shape.id)
    return JSON.stringify(editor.pageToScreen({
      x: bounds.x + bounds.w / 2,
      y: ${JSON.stringify(point)} === 'center' ? bounds.y + bounds.h / 2 : bounds.y + 22,
    }))`))
}

async function runMenuCommand(page, point, testId, label) {
  await clickAt(page, point.x, point.y, 'right')
  const selector = `[data-testid="context-menu.${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, label)
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
}

/**
 * Screenshots compare the canvas subjects, not the inspector a selection
 * happens to open. Closing the real dock (rather than hiding it with CSS)
 * also clears the prior selection run, so each subject gets the same canvas
 * chrome before and after its command.
 */
async function settleCanvasChrome(page) {
  await editorEval(page, 'editor.selectNone(); return true')
  const closeSelector = '[aria-label="Close Inspector"], [aria-label="Close Block inspector"], [aria-label="Close Branch inspector"], [aria-label="Close Loop inspector"]'
  const hasClose = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(closeSelector)}))`)
  if (hasClose) {
    const close = await box(page, closeSelector)
    await clickAt(page, close.cx, close.cy)
  }
  await waitFor(page, '!document.querySelector(\'#systemsketch-right-popout\')', 'closed Inspector')
  await delay(360)
}

async function scoreCase(page, { name, id, menuId, label, detached, point }) {
  const before = join(ASSETS, `detach-composite-${name}-before.png`)
  const after = join(ASSETS, `detach-composite-${name}-after.png`)
  const diff = join(ASSETS, `detach-composite-${name}-diff.png`)
  await settleCanvasChrome(page)
  const clip = await subjectClip(page, id)
  await capture(page, before, clip)
  await editorEval(page, `editor.setSelectedShapes([${JSON.stringify(id)}]); return true`)
  await runMenuCommand(page, await subjectPoint(page, id, point), menuId, label)
  await waitFor(page, detached, `${name} to become primitives`)
  await settleCanvasChrome(page)
  const errorFallbacks = JSON.parse(await evaluate(page, `(() => JSON.stringify(
    [...document.querySelectorAll('.tl-shape-error-boundary')]
      .map((node) => node.closest('[data-shape-id]')?.getAttribute('data-shape-id'))
  ))()`))
  assert.deepEqual(errorFallbacks, [], `${name} detached surface rendered an Error fallback`)
  await capture(page, after, clip)
  const { stdout } = await execFileAsync('python3', [join(ROOT, 'tests', 'detach_fidelity_score.py'), before, after, diff])
  return { name, clip, before: before.split('/').pop(), after: after.split('/').pop(), diff: diff.split('/').pop(), score: JSON.parse(stdout.trim()) }
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({ label: 'detach-composite-fidelity', build: 'detach-composite-fidelity', width: 1480, height: 980 })
  const { page, port, filesRoot } = app
  try {
    await openApp(page, port, `?board=${encodeURIComponent(join(filesRoot, 'SystemSketch', 'Detach composite fidelity.systemsketch'))}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the editor')
    await evaluate(page, 'document.fonts.ready.then(() => true)')
    await editorEval(page, `
      const input = { id: 'in', name: 'input', type: 'Image', visible: true }
      const output = { id: 'out', name: 'output', type: 'Image', visible: true }
      editor.createShapes([
        { id: 'shape:fidelity-block', type: 'block', x: 80, y: 120, props: {
          w: 350, h: 220, title: 'normalize()', blockType: 'Function', view: 'port',
          description: 'Keeps the captured image ready for inspection.', showDescription: true,
          inputs: [input], outputs: [output],
        } },
        { id: 'shape:fidelity-branch', type: 'branch', x: 560, y: 120, props: {
          w: 360, h: 260, title: 'Choose path', view: 'expanded', activeArmId: 'yes',
          controls: [{ id: 'predicate', name: 'is valid', type: 'bool' }],
          arms: [{ id: 'yes', title: 'yes', open: true, h: 92 }, { id: 'no', title: 'no', open: false, h: 62 }],
        } },
        { id: 'shape:fidelity-loop', type: 'loop', x: 1030, y: 120, props: {
          w: 360, h: 260, title: 'For every detection',
          iterable: { id: 'iterable', type: 'Detections' }, item: { id: 'item', type: 'Detection' },
          turn: 'turn 3 / 8',
        } },
        { id: 'shape:fidelity-source', type: 'block', x: 160, y: 620, props: {
          w: 260, h: 140, title: 'source()', view: 'port', inputs: [], outputs: [output],
        } },
        { id: 'shape:fidelity-sink', type: 'block', x: 720, y: 620, props: {
          w: 260, h: 140, title: 'sink()', view: 'port', inputs: [input], outputs: [],
        } },
        { id: 'shape:fidelity-edge', type: 'connection', x: 0, y: 0, props: {
          start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', temporal: 'data',
          curve: null, pins: [], elbowRoute: null,
        } },
      ])
      editor.createBindings([
        { type: 'connection', fromId: 'shape:fidelity-edge', toId: 'shape:fidelity-source', props: { portId: 'out', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:fidelity-edge', toId: 'shape:fidelity-sink', props: { portId: 'in', terminal: 'end', face: 'outer' } },
      ])
      return true`)
    await delay(700)

    const results = []
    results.push(await scoreCase(page, {
      name: 'block', id: 'shape:fidelity-block', menuId: 'block-detach-to-primitives', label: 'Detach Block',
      detached: `!window.__systemsketch.editor.getShape('shape:fidelity-block')`,
    }))
    results.push(await scoreCase(page, {
      name: 'branch', id: 'shape:fidelity-branch', menuId: 'block-detach-to-primitives', label: 'Detach Branch',
      detached: `!window.__systemsketch.editor.getShape('shape:fidelity-branch')
        && window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'group'
          && shape.meta?.systemSketch?.kind === 'branch')`,
    }))
    results.push(await scoreCase(page, {
      name: 'loop', id: 'shape:fidelity-loop', menuId: 'block-detach-to-primitives', label: 'Detach Loop',
      detached: `!window.__systemsketch.editor.getShape('shape:fidelity-loop')
        && window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'group'
          && shape.meta?.systemSketch?.kind === 'loop')`,
    }))
    results.push(await scoreCase(page, {
      name: 'connection', id: 'shape:fidelity-edge', menuId: 'connection-detach-to-arrow', label: 'Detach arrow',
      detached: `!window.__systemsketch.editor.getShape('shape:fidelity-edge')`,
      point: 'center',
    }))

    const subjects = JSON.parse(await editorEval(page, `return JSON.stringify([
      editor.getShape('shape:fidelity-block')?.type ?? null,
      editor.getShape('shape:fidelity-branch')?.type ?? null,
      editor.getShape('shape:fidelity-loop')?.type ?? null,
      editor.getShape('shape:fidelity-edge')?.type ?? null,
    ])`))
    const replacements = JSON.parse(await editorEval(page, `return JSON.stringify([
      editor.getCurrentPageShapes().find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'branch')?.type ?? null,
      editor.getCurrentPageShapes().find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'loop')?.type ?? null,
    ])`))
    const shapes = JSON.parse(await editorEval(page, `return JSON.stringify(editor.getCurrentPageShapes().map((shape) => shape.type))`))
    const checks = {
      allFourContextMenuWorkflowsRan: results.length === 4,
      allSubjectsLowered: JSON.stringify(subjects) === JSON.stringify([null, null, null, null])
        && JSON.stringify(replacements) === JSON.stringify(['group', 'group']),
      everySameCameraScoreIsMeasured: results.every((result) => Number.isFinite(result.score.score)),
      noConsoleErrors: localConsoleErrors(page).length === 0,
    }
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify({ checks, subjects, replacements, shapes, results }, null, 2))
    await writeFile(ACCEPTANCE, `${JSON.stringify({ results, checks, subjects, replacements, shapes }, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify({ results, checks, subjects, replacements, shapes }, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
