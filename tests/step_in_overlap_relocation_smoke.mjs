#!/usr/bin/env node
/**
 * Physical proof for collision-free resize completion inside Step In.
 * The user stretches the active Block into a hidden sibling; only the active
 * Block subtree relocates, and the same mini-menu action becomes Step out.
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
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SCREENSHOT = join(ASSETS, 'step-in-overlap-relocation-2026-09-02.png')
const RESULTS = join(ASSETS, 'step-in-overlap-relocation-results.json')
const results = []

function check(id, label, observed, desired = true) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
      + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function json(page, expression) {
  return JSON.parse(await evaluate(page, `JSON.stringify(${expression})`))
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-step-in-overlap-relocation',
    build: 'step-in-overlap-relocation',
    width: 1920,
    height: 1080,
  })
  const { page, port, filesRoot } = app
  const boardPath = join(filesRoot, 'SystemSketch', 'step-in-overlap.systemsketch')

  try {
    await ensureDir(join(filesRoot, 'SystemSketch'))
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'product editor', 30_000)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        {
          id: 'shape:active-scope', type: 'block', x: 300, y: 220,
          props: {
            title: 'run()', description: 'Resize this while stepped in',
            view: 'expanded', w: 520, h: 380,
            inputs: [{ id: 'in_1', name: 'request', type: 'Request', visible: true }],
            outputs: [{ id: 'out_1', name: 'result', type: 'Result', visible: true }],
          },
        },
        {
          id: 'shape:child', type: 'block', parentId: 'shape:active-scope', x: 130, y: 130,
          props: { title: 'decode()', view: 'simple', w: 260, h: 150, inputs: [], outputs: [] },
        },
        {
          id: 'shape:fixed-sibling', type: 'block', x: 0, y: 260,
          props: {
            title: 'receive()', description: 'This node must never move or become a child',
            view: 'simple', w: 260, h: 180, inputs: [], outputs: [],
          },
        },
      ])
      editor.select('shape:active-scope')
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)

    await waitFor(page, `document.querySelector('.block-mini-menu__step-in')`, 'Step in action')
    check('S1', 'the root-scope action starts as Step in', await evaluate(page,
      `document.querySelector('.block-mini-menu__step-in').textContent.trim()`), 'Step in')
    await clickElement(page, '.block-mini-menu__step-in')
    await waitFor(page,
      `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '1'`,
      'entered scope')
    await delay(400)
    await evaluate(page, `window.__systemsketch.editor.select('shape:active-scope'); true`)
    await waitFor(page,
      `document.querySelector('.block-mini-menu__step-in')?.textContent.trim() === 'Step out'`,
      'Step out action')
    await delay(260)
    check('S2', 'the active scope action changes to Step out', await evaluate(page,
      `document.querySelector('.block-mini-menu__step-in').textContent.trim()`), 'Step out')

    const before = await json(page, `(() => {
      const editor = window.__systemsketch.editor
      const active = editor.getShape('shape:active-scope')
      const childBounds = editor.getShapePageBounds('shape:child')
      const fixed = editor.getShape('shape:fixed-sibling')
      const overlay = editor.overlays.getCurrentOverlays()
        .find((candidate) => candidate.id === 'selection_fg:bottom_left')
      const point = editor.pageToScreen(editor.overlays.getOverlayGeometry(overlay).bounds.center)
      return {
        active: { x: active.x, y: active.y, w: active.props.w, parentId: active.parentId },
        child: { x: childBounds.minX, y: childBounds.minY, parentId: editor.getShape('shape:child').parentId },
        fixed: { x: fixed.x, y: fixed.y, parentId: fixed.parentId },
        pointer: { x: point.x, y: point.y },
      }
    })()`)

    await mouse(page, 'mouseMoved', before.pointer.x, before.pointer.y)
    await delay(120)
    check('P1', 'the pointer reaches the stock resize overlay', await evaluate(page,
      `window.__systemsketch.editor.overlays.getHoveredOverlayId()`), 'selection_fg:bottom_left')
    await mouse(page, 'mousePressed', before.pointer.x, before.pointer.y, { buttons: 1 })
    const stateAfterPress = await evaluate(page, `window.__systemsketch.editor.getPath()`)
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved', before.pointer.x - (180 * step / 10), before.pointer.y, { buttons: 1 })
      await delay(20)
    }
    const stateAfterMove = await evaluate(page, `window.__systemsketch.editor.getPath()`)
    await mouse(page, 'mouseReleased', before.pointer.x - 180, before.pointer.y)
    await delay(350)

    const after = await json(page, `(() => {
      const editor = window.__systemsketch.editor
      const active = editor.getShape('shape:active-scope')
      const activeBounds = editor.getShapePageBounds(active)
      const childBounds = editor.getShapePageBounds('shape:child')
      const fixed = editor.getShape('shape:fixed-sibling')
      const fixedBounds = editor.getShapePageBounds(fixed)
      const gap = 32
      const clear = activeBounds.maxX <= fixedBounds.minX - gap
        || activeBounds.minX >= fixedBounds.maxX + gap
        || activeBounds.maxY <= fixedBounds.minY - gap
        || activeBounds.minY >= fixedBounds.maxY + gap
      return {
        active: { x: active.x, y: active.y, w: active.props.w, parentId: active.parentId },
        child: { x: childBounds.minX, y: childBounds.minY, parentId: editor.getShape('shape:child').parentId },
        fixed: { x: fixed.x, y: fixed.y, parentId: fixed.parentId },
        clear,
        fixedHiddenInScope: editor.isShapeHidden(fixed),
        fixedBecameDescendant: editor.hasAncestor(fixed, active.id),
      }
    })()`)
    check('P2', 'pointer-down enters the stock resize state', stateAfterPress,
      'select.pointing_resize_handle')
    check('P3', 'pointer movement enters active stock resizing', stateAfterMove, 'select.resizing')
    check('R1', `the physical resize grows the active Block (${before.active.w} → ${after.active.w})`,
      after.active.w > before.active.w + 50, true)
    check('R2', 'the active Block relocates from the raw resize landing position',
      after.active.x > before.active.x - 80, true)
    check('R3', 'the fixed sibling does not move', after.fixed, before.fixed)
    check('R4', 'the relocated Block has a visible clearance from the fixed sibling', after.clear, true)
    check('R5', 'resize overlap never reparents the fixed sibling', after.fixedBecameDescendant, false)
    check('R6', 'the active Block and its child keep their original parent chain',
      [after.active.parentId, after.child.parentId], [before.active.parentId, before.child.parentId])
    check('R7', 'the child travels by exactly the active Block relocation',
      {
        dx: Math.round(after.child.x - before.child.x),
        dy: Math.round(after.child.y - before.child.y),
      },
      {
        dx: Math.round(after.active.x - before.active.x),
        dy: Math.round(after.active.y - before.active.y),
      })
    check('R8', 'the sibling remains truly hidden until Step out', after.fixedHiddenInScope, true)

    await clickElement(page, '.block-mini-menu__step-in')
    await waitFor(page,
      `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '0'`,
      'returned to Board')
    check('S3', 'clicking Step out returns to Board depth zero', await evaluate(page,
      `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth`), '0')
    check('S4', 'the fixed sibling is visible after Step out', await evaluate(page,
      `!window.__systemsketch.editor.isShapeHidden(
        window.__systemsketch.editor.getShape('shape:fixed-sibling'))`), true)

    await evaluate(page, `(() => {
      const close = document.querySelector('[aria-label="Close Inspector"]')
        ?? document.querySelector('[aria-label="Close Block inspector"]')
      close?.click()
      return true
    })()`)
    await waitFor(page, `!document.querySelector('#systemsketch-right-popout')`, 'closed Inspector')
    await evaluate(page, `window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); true`)
    await delay(300)
    await screenshot(page, SCREENSHOT)
    check('Q1', 'the resize, relocation, and Step out journey emits no console errors',
      localConsoleErrors(page), [])

    await writeFile(RESULTS, `${JSON.stringify({ checks: results }, null, 2)}\n`)
    assert.ok(results.every((entry) => entry.ok), 'one or more relocation checks failed')
    process.stdout.write(`\n  ${results.length}/${results.length} browser checks passed\n  ${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error.stack ?? error}`)
  process.exitCode = 1
})
