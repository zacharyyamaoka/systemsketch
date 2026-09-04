#!/usr/bin/env node
/**
 * A detached Block must escape an Expanded Block's frame tree.
 *
 * The visible failure was a data edge that stopped at the enclosing Block's
 * boundary. Before detach, `connection` children are deliberately exempt from
 * that frame clip. After detach they become stock arrows, so preserving the
 * parent makes the ancestor clip them before ordinary z-order can help.
 *
 * This creates the reported topology through real tools: an Expanded Block and
 * a port Block that a user has dragged partly beyond its bottom boundary. A
 * real context-menu detach must leave both the stock card group and its
 * converted arrow as page-level, non-frame primitives while retaining their
 * page positions and bindings.
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
import {
  addPort,
  blockIds,
  box,
  deselect,
  dragFrom,
  drawBlock,
  portDot,
  scope,
  setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'detached-block-loose-primitives-acceptance.json')
const SCREENSHOT = join(SHOTS, 'detached-block-loose-primitives-2026-09-03.png')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
  if (!ok) process.stdout.write(`        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`)
}

async function screenshot(page) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
}

async function detachAt(page, shapeId) {
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  // The fixture deliberately leaves only the top strip inside the Expanded
  // parent. Its heading is still a real target, which is the interaction a
  // person has before detaching a child that crosses a frame boundary.
  await clickAt(page, face.x + 28, face.y + 4, 'right')
  const item = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(item)})`, 'Detach to primitives')
  const itemBox = await box(page, item)
  await clickAt(page, itemBox.cx, itemBox.cy)
  await delay(500)
}

async function structuralState(page, containerId) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shapes = editor.getCurrentPageShapes()
    const detachedGroup = shapes.find((shape) => shape.type === 'group'
      && shape.meta?.systemSketch?.kind === 'block')
    const arrow = shapes.find((shape) => shape.type === 'arrow'
      && shape.meta?.systemSketch?.kind === 'connection')
    const card = detachedGroup && editor.getSortedChildIdsForParent(detachedGroup.id)
      .map((id) => editor.getShape(id))
      .find((shape) => shape?.type === 'geo' && shape.meta?.systemSketch?.kind === 'block-card')
    const root = arrow && document.querySelector('[data-shape-id="' + arrow.id + '"]')
    const arrowPath = root?.querySelector('path:not(clipPath path)')
    const container = document.querySelector('[data-shape-id="' + ${JSON.stringify(containerId)} + '"]')
    const containerRect = container?.getBoundingClientRect()
    const arrowRect = root?.getBoundingClientRect()
    return JSON.stringify({
      detachedGroup: detachedGroup && {
        parentId: detachedGroup.parentId,
        frameLike: editor.isShapeFrameLike(detachedGroup),
        index: detachedGroup.index,
      },
      card: card && { parentId: card.parentId, frameLike: editor.isShapeFrameLike(card) },
      arrow: arrow && { parentId: arrow.parentId, index: arrow.index },
      semanticConnections: shapes.filter((shape) => shape.type === 'connection').length,
      paintedArrow: Boolean(root && arrowPath && arrowPath.getTotalLength() > 0),
      escapesContainerBottom: Boolean(arrowRect && containerRect && arrowRect.bottom > containerRect.bottom),
      arrowAboveContainer: Boolean(arrow && editor.getShape(${JSON.stringify(containerId)})
        && arrow.index > editor.getShape(${JSON.stringify(containerId)}).index),
    })
  })()`))
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'detached-block-loose-primitives',
    build: 'detached-block-loose-primitives',
    width: 1440,
    height: 960,
  })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'Detached Block Loose Primitives.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'canvas')
    await delay(700)

    // The enclosing frame-like Block and an inner consumer. Drawing the
    // consumer inside the Expanded body gives it real parentage; the assertion
    // below catches a merely geometric overlap.
    await drawBlock(page, { x: 270, y: 120 }, { x: 1110, y: 700 }, 'While Loop')
    const [container] = await blockIds(page)
    await addPort(page, 'inputs')
    await setView(page, 'expanded')
    await evaluate(page, `(() => {
      window.__systemsketch.editor.updateShape({
        id: ${JSON.stringify(container)}, type: 'block', props: { w: 840, h: 580 },
      })
      return true
    })()`)
    await deselect(page, { x: 1200, y: 850 })

    const beforeChild = new Set(await blockIds(page))
    await drawBlock(page, { x: 520, y: 330 }, { x: 820, y: 510 }, 'func')
    await addPort(page, 'inputs')
    await setView(page, 'port')
    const child = (await blockIds(page)).find((id) => !beforeChild.has(id))
    await deselect(page, { x: 1200, y: 850 })

    // This is a normal permitted tldraw pose: a child can be dragged beyond
    // an Expanded parent, where an exempt semantic connection remains visible.
    // It is the geometry in the report screenshots that exposed the detach
    // regression.
    await evaluate(page, `(() => {
      window.__systemsketch.editor.updateShape({
        id: ${JSON.stringify(child)}, type: 'block', x: 260, y: 570,
      })
      return true
    })()`)
    await delay(280)
    const authored = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        childParent: editor.getShape(${JSON.stringify(child)}).parentId,
        childEscapesBottom: (() => {
          const child = document.querySelector('[data-shape-id="' + ${JSON.stringify(child)} + '"]')?.getBoundingClientRect()
          const container = document.querySelector('[data-shape-id="' + ${JSON.stringify(container)} + '"]')?.getBoundingClientRect()
          return Boolean(child && container && child.bottom > container.bottom)
        })(),
      })
    })()`))
    check('AUTHORED-PARENTAGE', 'the target is a real child that extends beyond the Expanded Block', authored,
      { childParent: container, childEscapesBottom: true })

    await dragFrom(
      page,
      await box(page, portDot(container, 'input', 'in_1')),
      await box(page, portDot(child, 'input', 'in_1')),
    )
    await delay(300)
    const cableParent = JSON.parse(await evaluate(page, `(() => {
      const edge = window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
      return JSON.stringify(edge?.parentId ?? null)
    })()`))
    check('AUTHORED-CABLE-PARENT', 'the live data edge enters through the Expanded Block', cableParent, container)

    await detachAt(page, child)
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes()
      .some((shape) => shape.type === 'arrow' && shape.meta?.systemSketch?.kind === 'connection')`,
    'the detached stock arrow')
    await screenshot(page)

    const detached = await structuralState(page, container)
    check('LOOSE-NOT-FRAME', 'the replacement is a normal stock group and rectangle',
      { groupParent: detached.detachedGroup?.parentId, groupFrameLike: detached.detachedGroup?.frameLike,
        cardFrameLike: detached.card?.frameLike },
      { groupParent: 'page:page', groupFrameLike: false, cardFrameLike: false })
    check('EDGE-ESCAPES-FRAME', 'the converted data edge is a page-level stock arrow above the container',
      { arrowParent: detached.arrow?.parentId, semanticConnections: detached.semanticConnections,
        paintedArrow: detached.paintedArrow, escapesContainerBottom: detached.escapesContainerBottom,
        arrowAboveContainer: detached.arrowAboveContainer },
      { arrowParent: 'page:page', semanticConnections: 0, paintedArrow: true,
        escapesContainerBottom: true, arrowAboveContainer: true })
    check('CLEAN', 'the real canvas journey raised no console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }

  const failed = results.filter((result) => !result.ok)
  await writeFile(RESULTS, JSON.stringify(results, null, 2))
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
