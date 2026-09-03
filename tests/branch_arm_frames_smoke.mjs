#!/usr/bin/env node
/**
 * Focused real-browser proof for Branch arm frames.
 *
 * The ordinary Branch journey covers authoring, wiring, folding and reload.
 * This fixture deliberately places Blocks across both kinds of arm boundary:
 * an arm's own header (visible, above the chrome) and the next arm (clipped).
 */
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
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, scope } from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const SHOT = join(SHOTS, 'branch-arm-frames-clipping.png')
const OUT = join(SHOTS, 'branch-arm-frames-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-branch-arm-frames',
    build: 'branch-arm-frames',
    width: 1440,
    height: 900,
  })
  const { page, port, filesRoot } = app
  const board = join(filesRoot, 'SystemSketch', 'branch-arm-frames-proof.tldr')

  try {
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor`, 'development editor seam')

    await editorEval(page, `
      editor.createShape({
        id: 'shape:branch-arm-frame-proof',
        type: 'branch',
        x: 320,
        y: 140,
        props: {
          w: 720,
          h: 504,
          title: 'Branch arm clipping',
          view: 'expanded',
          activeArmId: null,
          controls: [],
          arms: [
            { id: 'arm_1', title: 'if', open: true, h: 200 },
            { id: 'arm_2', title: 'else', open: true, h: 200 },
          ],
        },
      })
    `)
    await waitFor(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'branch-arm').length === 2`,
      'two materialized arm frames')

    await editorEval(page, `
      const frame = editor.getCurrentPageShapes().find((s) => s.type === 'branch-arm' && s.props.armId === 'arm_1')
      editor.createShapes([
        {
          id: 'shape:header-overlap-proof',
          type: 'block',
          parentId: frame.id,
          x: 24,
          y: 8,
          props: { title: 'header overlap()', w: 300, h: 148, view: 'expanded' },
          meta: { branchArm: 'arm_1' },
        },
        {
          id: 'shape:divider-clip-proof',
          type: 'block',
          parentId: frame.id,
          x: 390,
          y: 80,
          props: { title: 'divider clip()', w: 300, h: 198, view: 'port' },
          meta: { branchArm: 'arm_1' },
        },
      ])
      editor.zoomToFit({ animation: { duration: 0 }, inset: 100 })
    `)
    await waitFor(page, `document.querySelector(${JSON.stringify(scope('shape:divider-clip-proof'))})`, 'framed Blocks')
    await delay(500)

    const structure = JSON.parse(await editorEval(page, `
      const branch = editor.getShape('shape:branch-arm-frame-proof')
      const frames = editor.getSortedChildIdsForParent(branch.id)
        .map((id) => editor.getShape(id))
        .filter((s) => s.type === 'branch-arm')
        .map((s) => ({ armId: s.props.armId, x: s.x, y: s.y, w: s.props.w, h: s.props.h }))
      const children = ['shape:header-overlap-proof', 'shape:divider-clip-proof'].map((id) => {
        const shape = editor.getShape(id)
        return { id, parentType: editor.getShape(shape.parentId)?.type, parentArm: editor.getShape(shape.parentId)?.props.armId }
      })
      return JSON.stringify({ frames, children })
    `))
    check('BAF-1', 'each semantic arm has one invisible full-row frame', structure.frames, [
      { armId: 'arm_1', x: 0, y: 40, w: 720, h: 227 },
      { armId: 'arm_2', x: 0, y: 267, w: 720, h: 227 },
    ])
    check('BAF-2', 'Blocks are real children of the matching arm frame', structure.children, [
      { id: 'shape:header-overlap-proof', parentType: 'branch-arm', parentArm: 'arm_1' },
      { id: 'shape:divider-clip-proof', parentType: 'branch-arm', parentArm: 'arm_1' },
    ])
    check('BAF-2b', 'selecting an internal arm frame resolves to the semantic Branch',
      JSON.parse(await editorEval(page, `
        const frame = editor.getCurrentPageShapes().find((shape) => shape.type === 'branch-arm' && shape.props.armId === 'arm_1')
        editor.setSelectedShapes([frame.id])
        return JSON.stringify(editor.getSelectedShapeIds())
      `)),
      ['shape:branch-arm-frame-proof'])

    const mask = JSON.parse(await editorEval(page, `
      const points = editor.getShapeMask('shape:divider-clip-proof')
      return JSON.stringify(points.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) })))
    `))
    check('BAF-3', 'the child mask is exactly the four corners of its arm row', mask, [
      { x: 320, y: 180 }, { x: 1040, y: 180 }, { x: 1040, y: 407 }, { x: 320, y: 407 },
    ])

    const painted = JSON.parse(await editorEval(page, `
      const clientAt = (pagePoint) => {
        const screen = editor.pageToScreen(pagePoint)
        const canvas = editor.getContainer().getBoundingClientRect()
        return { x: screen.x + canvas.left, y: screen.y + canvas.top }
      }
      const ownerAt = (pagePoint) => {
        const client = clientAt(pagePoint)
        return document.elementFromPoint(client.x, client.y)?.closest('[data-shape-id]')?.getAttribute('data-shape-id') ?? null
      }
      return JSON.stringify({
        overOwnHeader: ownerAt({ x: 360, y: 196 }),
        beforeDivider: editor.getShapeAtPoint({ x: 725, y: 400 }, { hitInside: true, filter: (shape) => shape.id === 'shape:divider-clip-proof' })?.id ?? null,
        afterDivider: editor.getShapeAtPoint({ x: 725, y: 424 }, { hitInside: true, filter: (shape) => shape.id === 'shape:divider-clip-proof' })?.id ?? null,
        paintedAfterDivider: ownerAt({ x: 725, y: 424 }),
      })
    `))
    check('BAF-4', 'content paints above its own header but stops at the next arm', painted, {
      overOwnHeader: 'shape:header-overlap-proof',
      beforeDivider: 'shape:divider-clip-proof',
      afterDivider: null,
      paintedAfterDivider: 'shape:branch-arm-frame-proof',
    })

    // Drive the actual header control with a pointer: folding still hides the
    // framed descendants recursively, exactly as the old membership did.
    const fold = await box(page, '[data-testid="branch-arm-fold-arm_1"]')
    await clickAt(page, fold.cx, fold.cy)
    await delay(300)
    check('BAF-5', 'folding the arm hides both framed Blocks without deleting them',
      JSON.parse(await editorEval(page, `return JSON.stringify({
        hidden: ['shape:header-overlap-proof', 'shape:divider-clip-proof'].map((id) => editor.isShapeHidden(id)),
        present: ['shape:header-overlap-proof', 'shape:divider-clip-proof'].map((id) => Boolean(editor.getShape(id))),
      })`)),
      { hidden: [true, true], present: [true, true] })
    await clickAt(page, fold.cx, fold.cy)
    await delay(300)

    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(250)
    const undone = JSON.parse(await editorEval(page, `return JSON.stringify({
      open: editor.getShape('shape:branch-arm-frame-proof').props.arms[0].open,
      hidden: editor.isShapeHidden('shape:divider-clip-proof'),
      frames: editor.getCurrentPageShapes().filter((shape) => shape.type === 'branch-arm').length,
    })`))
    await shortcut(page, 'z', 'KeyZ', 10)
    await delay(250)
    check('BAF-6', 'undo and redo treat fold plus frame repair as one ordinary history step', undone,
      { open: false, hidden: true, frames: 2 })

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    check('BAF-7', 'the browser journey emitted no local application errors', localConsoleErrors(page).length, 0)
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  console.log(`${results.length - failed.length}/${results.length} passed → ${OUT}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
