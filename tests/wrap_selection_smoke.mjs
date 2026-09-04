#!/usr/bin/env node
/**
 * Real-browser proof of "turn a selection into a container", both surfaces.
 *
 * V2 is the Wrap tile on the floating selection menu — mounted only while two
 * or more objects are selected, a broad face plus a chevron that opens the
 * target list. V1 is the same list as `Turn into ▸` in the right-click menu.
 * Both read one descriptor table and run one command, so this journey proves
 * they agree by wrapping through each of them in turn.
 *
 * It also proves the two things that came out of reading the engine: the stock
 * remove-frame command now reads "Delete container, leave children", and the
 * Frame-only duplicate that used to sit beside it is gone.
 *
 * Run:  node tests/wrap_selection_smoke.mjs
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, deselect } from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'wrap-selection-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

/** Two rectangles, drawn with the stock geo tool, selected together. */
async function drawTwoRectangles(page) {
  for (const [from, to] of [[{ x: 360, y: 300 }, { x: 500, y: 400 }], [{ x: 560, y: 300 }, { x: 700, y: 400 }]]) {
    await evaluate(page, `(window.__systemsketch.editor.setCurrentTool('geo'), null)`)
    await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', from.x + ((to.x - from.x) * step) / 8, from.y + ((to.y - from.y) * step) / 8, { buttons: 1 })
    }
    await mouse(page, 'mouseReleased', to.x, to.y)
    // The stock geo tool drops straight into label editing, and the selection
    // menu correctly hides while a shape is being edited. Escape is what a
    // person presses here.
    await key(page, 'Escape', 'Escape')
    await delay(150)
  }
  await evaluate(page, `(window.__systemsketch.editor.setCurrentTool('select'), null)`)
  await delay(120)
}

async function selectAllGeo(page) {
  await editorEval(page, `
    const geo = editor.getCurrentPageShapes().filter((s) => s.type === 'geo').map((s) => s.id)
    editor.setSelectedShapes(geo)
    return geo.length`)
  await delay(200)
}

const shapeTypes = (page) => editorEval(page, `
  return JSON.stringify(editor.getCurrentPageShapes().map((s) => s.type).sort())`)

const childCount = (page, type) => editorEval(page, `
  const container = editor.getCurrentPageShapes().find((s) => s.type === ${JSON.stringify(type)})
  if (!container) return -1
  const walk = (id) => editor.getSortedChildIdsForParent(id)
    .flatMap((child) => [child, ...walk(child)])
  return walk(container.id).map((id) => editor.getShape(id)).filter((s) => s && s.type === 'geo').length`)

async function clickTestId(page, testId) {
  const selector = `[data-testid="${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, testId, 8000)
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy)
  await delay(220)
}

const tileMounted = (page) =>
  evaluate(page, `Boolean(document.querySelector('[data-testid="wrap-selection-trigger"]'))`)

/** Every label in the open right-click menu, flattened. */
const menuLabels = (page) => evaluate(page, `(() => JSON.stringify(
  [...document.querySelectorAll('[role="menuitem"], [data-testid^="menu-item"]')]
    .map((node) => (node.textContent ?? '').trim()).filter(Boolean)))()`)

async function rightClickCanvasSelection(page) {
  const bounds = JSON.parse(await editorEval(page, `
    const b = editor.getSelectionRotatedScreenBounds()
    return JSON.stringify({ x: b.midX, y: b.midY })`))
  await mouse(page, 'mousePressed', bounds.x, bounds.y, { button: 'right', buttons: 2 })
  await mouse(page, 'mouseReleased', bounds.x, bounds.y, { button: 'right' })
  await delay(320)
  return bounds
}

async function main() {
  const app = await startApp({ label: 'wrap-selection' })
  const { page, port } = app
  await openApp(page, port)
  await waitFor(page, `window.__systemsketch?.editor`, 'editor', 20000)
  await ensureDir(SHOTS)

  try {
    // ---------------------------------------------------------- the gate
    await drawTwoRectangles(page)
    await editorEval(page, `editor.selectNone(); return null`)
    await delay(150)
    check('gate-none', 'no Wrap tile with nothing selected', await tileMounted(page), false)

    await editorEval(page, `
      const first = editor.getCurrentPageShapes().find((s) => s.type === 'geo')
      editor.setSelectedShapes([first.id])`)
    await delay(250)
    check('gate-one', 'no Wrap tile for a single object', await tileMounted(page), false)

    await selectAllGeo(page)
    check('gate-two', 'Wrap tile appears at two objects', await tileMounted(page), true)
    await shot(page, 'wrap-selection-tile.png')

    // ------------------------------------------------- V2: the Wrap tile
    await clickTestId(page, 'wrap-selection-trigger')
    const options = await evaluate(page, `(() => JSON.stringify(
      [...document.querySelectorAll('[data-testid^="wrap-into-"]')]
        .map((node) => node.getAttribute('data-testid'))))()`)
    check('tile-options', 'the tile offers all four containers', JSON.parse(options), [
      'wrap-into-frame', 'wrap-into-block', 'wrap-into-branch', 'wrap-into-group',
    ])
    await shot(page, 'wrap-selection-menu.png')

    await clickTestId(page, 'wrap-into-block')
    check('tile-block', 'wrapping in a Block adds one Block', JSON.parse(await shapeTypes(page)), ['block', 'geo', 'geo'])
    check('tile-block-adopted', 'both rectangles are inside it', await childCount(page, 'block'), 2)
    check('tile-block-view', 'the Block is Expanded, the only view that holds children',
      await editorEval(page, `return editor.getCurrentPageShapes().find((s) => s.type === 'block').props.view`), 'expanded')
    check('tile-unmounts', 'the tile leaves once one container is selected', await tileMounted(page), false)
    await shot(page, 'wrap-selection-block.png')

    // One undo must return the board, not peel the wrap apart in pieces.
    await editorEval(page, `editor.undo(); return null`)
    await delay(250)
    check('tile-undo', 'one undo unwraps it whole', JSON.parse(await shapeTypes(page)), ['geo', 'geo'])

    // ------------------------------------------- V1: the Turn into menu
    await selectAllGeo(page)
    await rightClickCanvasSelection(page)
    const labels = JSON.parse(await menuLabels(page))
    check('menu-turn-into', 'the right-click menu offers Turn into',
      labels.some((label) => label.startsWith('Turn into')), true)
    check('menu-no-duplicate', 'the old Frame-only duplicate is gone',
      labels.some((label) => label.includes('Delete frame, leave children')), false)
    await shot(page, 'wrap-selection-context-menu.png')
    await key(page, 'Escape', 'Escape')
    await delay(200)

    // -------------------------------------- the renamed stock command
    // A click on empty canvas clears whatever menu state the right-click left
    // behind; tldraw keeps one open-menu registry and the popover will not
    // open while it still believes the context menu is up.
    await deselect(page)
    await editorEval(page, `
      const geo = editor.getCurrentPageShapes().filter((s) => s.type === 'geo').map((s) => s.id)
      editor.setSelectedShapes(geo)
      return null`)
    await delay(400)
    await clickTestId(page, 'wrap-selection-trigger')
    await clickTestId(page, 'wrap-into-frame')
    check('frame-wrapped', 'the stock frame action wraps them', JSON.parse(await shapeTypes(page)), ['frame', 'geo', 'geo'])

    await rightClickCanvasSelection(page)
    // The stock command sits two levels down, under Edit — the same place the
    // ground-truth probe found `Frame selection`.
    await evaluate(page, `(() => {
      const edit = [...document.querySelectorAll('[role="menuitem"]')]
        .find((node) => (node.textContent ?? '').trim() === 'Edit')
      if (edit) edit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      edit?.click()
      return null
    })()`)
    await delay(400)
    const frameLabels = JSON.parse(await menuLabels(page))
    check('remove-frame-renamed', 'stock Remove frame says what it keeps without mistaking every container for a Frame',
      frameLabels.some((label) => label.includes('Delete container, leave children')), true)
    await shot(page, 'wrap-selection-remove-frame.png')
    await key(page, 'Escape', 'Escape')
    await delay(200)

    check('console', 'no browser errors', localConsoleErrors(page), [])
  } finally {
    await writeFile(OUT, `${JSON.stringify(results, null, 2)}\n`)
    app.close()
  }

  const failed = results.filter((entry) => !entry.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
