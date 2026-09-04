#!/usr/bin/env node
/**
 * Drive the saved human-review board, rather than an in-memory imitation.
 *
 * It proves the orange Loop cue remains bound while its target moves, then
 * performs the exact right-click Detach to primitives gesture and undoes it so
 * the handoff board stays ready for a person to repeat the same workflow.
 */
import assert from 'node:assert/strict'
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

const BOARD = join(ROOT, 'sketches', 'review', 'detach-primitives.systemsketch')
const LOOP = 'shape:loop'
const LOOP_CUE_ARROW = 'shape:cue-step-loop-arrow'

async function bounds(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return 'null'
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function main() {
  const app = await startApp({
    label: 'detach-primitives-review-fixture',
    build: 'detach-primitives-review-fixture',
    allowSourceRoot: true,
    width: 1500,
    height: 1000,
  })
  const { page, port } = app

  try {
    await openApp(page, port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(LOOP)})`, 'saved Loop review target', 30_000)
    await waitFor(page, `document.querySelector('[data-shape-id="${LOOP}"]')`, 'painted Loop review target')
    await delay(500)

    const before = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const loop = editor.getShape(${JSON.stringify(LOOP)})
      const cueBindings = editor.getBindingsFromShape(${JSON.stringify(LOOP_CUE_ARROW)}, 'arrow')
        .filter((binding) => binding.toId === ${JSON.stringify(LOOP)})
      return JSON.stringify({ x: loop.x, y: loop.y, cueBindings: cueBindings.length })
    })()`))
    assert.equal(before.cueBindings, 1, 'the Loop instruction arrow is bound to the Loop before moving it')

    const loopBox = await bounds(page, `[data-shape-id="${LOOP}"]`)
    assert.ok(loopBox, 'the saved Loop has a live canvas element')
    await drag(page,
      { x: loopBox.x + loopBox.w * 0.62, y: loopBox.y + 24 },
      { x: loopBox.x + loopBox.w * 0.62 + 34, y: loopBox.y + 24 })
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(LOOP)}).x > ${before.x + 24}`,
      'the Loop to move through the real canvas gesture')
    const moved = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        cueBindings: editor.getBindingsFromShape(${JSON.stringify(LOOP_CUE_ARROW)}, 'arrow')
          .filter((binding) => binding.toId === ${JSON.stringify(LOOP)}).length,
      })
    })()`))
    assert.equal(moved.cueBindings, 1, 'the orange cue stays attached after the Loop moves')
    await evaluate(page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(LOOP)})?.x === ${before.x}`,
      'the fixture move to undo')

    const restoredBox = await bounds(page, `[data-shape-id="${LOOP}"]`)
    await clickAt(page, restoredBox.x + restoredBox.w / 2, restoredBox.y + 22, 'right')
    const edit = '[data-testid="context-menu-sub.edit-button"]'
    await waitFor(page, `document.querySelector(${JSON.stringify(edit)})`, 'Loop Edit submenu')
    await evaluate(page, `(() => {
      const item = document.querySelector(${JSON.stringify(edit)})
      item?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      item?.click()
      return true
    })()`)
    const deleteContainer = '[data-testid="context-menu.remove-frame"]'
    await waitFor(page, `document.querySelector(${JSON.stringify(deleteContainer)})`, 'generic container removal command')
    assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(deleteContainer)}).textContent.trim()`),
      'Delete container, leave children', 'a Loop never calls itself a Frame in the removal menu')

    // Open a fresh right-click menu after inspecting the Edit submenu, then
    // drive the actual Detach command from that same saved Loop.
    await clickAt(page, restoredBox.x + restoredBox.w / 2, restoredBox.y + 22, 'right')
    const command = '[data-testid="context-menu.block-detach-to-primitives"]'
    await waitFor(page, `document.querySelector(${JSON.stringify(command)})`, 'Loop Detach to primitives command')
    assert.match(await evaluate(page, `document.querySelector(${JSON.stringify(command)}).textContent`), /Detach to primitives/)
    const commandBox = await bounds(page, command)
    await clickAt(page, commandBox.x + commandBox.w / 2, commandBox.y + commandBox.h / 2)
    await waitFor(page, `!window.__systemsketch.editor.getShape(${JSON.stringify(LOOP)})
      && window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'group'
        && shape.meta?.systemSketch?.kind === 'loop')`, 'Loop stock primitives')
    const lowered = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const group = editor.getCurrentPageShapes().find((shape) => shape.type === 'group'
        && shape.meta?.systemSketch?.kind === 'loop')
      const children = group ? editor.getSortedChildIdsForParent(group.id).map((id) => editor.getShape(id)) : []
      const card = children.find((shape) => shape?.type === 'geo' && shape.props.geo === 'rectangle')
      return JSON.stringify({
        group: group?.id ?? null,
        wireIsArrow: Boolean(card && editor.getBindingsToShape(card.id, 'arrow').some((binding) =>
          editor.getShape(binding.fromId)?.type === 'arrow')),
        childCount: children.length,
      })
    })()`))
    assert.ok(lowered.group, 'the Loop becomes a fresh stock Group')
    assert.equal(lowered.wireIsArrow, true, 'the real Loop wire becomes a stock arrow')
    assert.ok(lowered.childCount > 4, 'the stock Group owns its materialised visual structure')

    await evaluate(page, '(() => { window.__systemsketch.editor.undo(); return true })()')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(LOOP)})?.type === 'loop'`,
      'the saved review Loop to restore after the proof')
    assert.deepEqual(localConsoleErrors(page), [], 'the saved review journey has no console errors')
    process.stdout.write('review fixture: Loop cue binding, detach, stock arrow, and undo passed\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
