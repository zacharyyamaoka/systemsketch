#!/usr/bin/env node
/** Physical proof that Delete frame, leave children preserves every contained subtree. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const OUTER = 'shape:removable-frame'
const DIRECT = 'shape:direct-child'
const NESTED = 'shape:nested-frame'
const GRANDCHILD = 'shape:nested-child'
const OUTSIDE = 'shape:outside-block'
const ASSETS = join(ROOT, 'docs', 'assets')
const SCREENSHOT = join(ASSETS, 'remove-frame-keep-contents-2026-09-02.png')
const RESULTS = join(ASSETS, 'remove-frame-keep-contents-results.json')
const checks = []

function check(id, label, observed, desired = true) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  checks.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
      + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function json(page, expression) {
  return JSON.parse(await evaluate(page, `JSON.stringify(${expression})`))
}

async function boardState(page) {
  return json(page, `(() => {
    const editor = window.__systemsketch.editor
    const details = (id) => {
      const shape = editor.getShape(id)
      const bounds = shape && editor.getShapePageBounds(shape)
      return shape && bounds ? {
        id: shape.id,
        parentId: shape.parentId,
        bounds: {
          minX: Math.round(bounds.minX * 100) / 100,
          minY: Math.round(bounds.minY * 100) / 100,
          maxX: Math.round(bounds.maxX * 100) / 100,
          maxY: Math.round(bounds.maxY * 100) / 100,
        },
      } : null
    }
    return {
      pageId: editor.getCurrentPageId(),
      frame: details(${JSON.stringify(OUTER)}),
      direct: details(${JSON.stringify(DIRECT)}),
      nested: details(${JSON.stringify(NESTED)}),
      grandchild: details(${JSON.stringify(GRANDCHILD)}),
      outside: details(${JSON.stringify(OUTSIDE)}),
      selectedIds: editor.getSelectedShapeIds().slice().sort(),
    }
  })()`)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-remove-frame-keep-contents',
    build: 'remove-frame-keep-contents',
    width: 1920,
    height: 1080,
  })
  const { page, port, filesRoot } = app
  const boardPath = join(filesRoot, 'SystemSketch', 'remove-frame-keep-contents.systemsketch')

  try {
    await ensureDir(join(filesRoot, 'SystemSketch'))
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'product editor', 30_000)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        {
          id: ${JSON.stringify(OUTER)}, type: 'frame', x: 480, y: 180,
          props: { name: 'Release boundary', w: 760, h: 520 },
        },
        {
          id: ${JSON.stringify(DIRECT)}, type: 'block', parentId: ${JSON.stringify(OUTER)}, x: 90, y: 150,
          props: {
            title: 'api()', description: 'Direct child must survive', blockType: 'Service',
            view: 'simple', w: 270, h: 170, inputs: [], outputs: [],
          },
        },
        {
          id: ${JSON.stringify(NESTED)}, type: 'frame', parentId: ${JSON.stringify(OUTER)}, x: 430, y: 110,
          props: { name: 'Nested boundary', w: 270, h: 290 },
        },
        {
          id: ${JSON.stringify(GRANDCHILD)}, type: 'block', parentId: ${JSON.stringify(NESTED)}, x: 35, y: 80,
          props: {
            title: 'job()', description: 'Nested child stays nested', blockType: 'Worker',
            view: 'simple', w: 200, h: 145, inputs: [], outputs: [],
          },
        },
        {
          id: ${JSON.stringify(OUTSIDE)}, type: 'block', x: 80, y: 360,
          props: {
            title: 'outside()', description: 'Unrelated node', blockType: 'Caller',
            view: 'simple', w: 270, h: 170, inputs: [], outputs: [],
          },
        },
      ])
      editor.select(${JSON.stringify(OUTER)})
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(400)

    const before = await boardState(page)
    const frameBox = await elementBox(page, `[data-shape-id="${OUTER}"]`)
    await clickAt(page, frameBox.x + frameBox.width / 2, frameBox.y + 16, 'right')
    await waitFor(page,
      `document.querySelector('[data-testid="context-menu.frame-remove-keep-contents"]')`,
      'Delete frame, leave children context command')
    check('M1', 'right-clicking one unlocked Frame offers Delete frame, leave children', await evaluate(page,
      `document.querySelector('[data-testid="context-menu.frame-remove-keep-contents"]').textContent.trim()`),
    'Delete frame, leave children')

    await clickElement(page, '[data-testid="context-menu.frame-remove-keep-contents"]')
    await waitFor(page, `!window.__systemsketch.editor.getShape(${JSON.stringify(OUTER)})`, 'Frame removal')
    await delay(250)
    const after = await boardState(page)

    check('R1', 'only the selected Frame is deleted', after.frame, null)
    check('R2', 'the direct child keeps its exact page bounds', after.direct.bounds, before.direct.bounds)
    check('R3', 'the nested Frame keeps its exact page bounds', after.nested.bounds, before.nested.bounds)
    check('R4', 'the grandchild keeps its exact page bounds', after.grandchild.bounds, before.grandchild.bounds)
    check('R5', 'direct children are lifted to the removed Frame parent',
      [after.direct.parentId, after.nested.parentId], [before.pageId, before.pageId])
    check('R6', 'nested descendants keep their existing hierarchy', after.grandchild.parentId, NESTED)
    check('R7', 'unrelated shapes remain byte-for-byte positioned', after.outside, before.outside)
    check('R8', 'the surviving direct children become the selection', after.selectedIds, [DIRECT, NESTED].sort())

    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page, `Boolean(window.__systemsketch.editor.getShape(${JSON.stringify(OUTER)}))`, 'undo restoration')
    const undone = await boardState(page)
    check('U1', 'one undo restores the Frame and original parent chain',
      [undone.direct.parentId, undone.nested.parentId, undone.grandchild.parentId],
      [OUTER, OUTER, NESTED])
    check('U2', 'undo also restores every page-space position',
      [undone.direct.bounds, undone.nested.bounds, undone.grandchild.bounds],
      [before.direct.bounds, before.nested.bounds, before.grandchild.bounds])

    await shortcut(page, 'z', 'KeyZ', 10)
    await waitFor(page, `!window.__systemsketch.editor.getShape(${JSON.stringify(OUTER)})`, 'redo removal')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      const close = document.querySelector('[aria-label="Close Inspector"]')
        ?? document.querySelector('[aria-label="Close Block inspector"]')
      close?.click()
      return true
    })()`)
    await waitFor(page, `!document.querySelector('#systemsketch-right-popout')`, 'closed Inspector')
    await delay(300)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
    check('Q1', 'the full remove, undo, and redo journey emits no console errors',
      localConsoleErrors(page), [])

    await writeFile(RESULTS, `${JSON.stringify({ checks }, null, 2)}\n`)
    assert.ok(checks.every((entry) => entry.ok), 'one or more remove-frame checks failed')
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error.stack ?? error}`)
  process.exitCode = 1
})
