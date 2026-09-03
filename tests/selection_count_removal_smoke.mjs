#!/usr/bin/env node
/**
 * Real-browser proof for the FigJam-faithful, count-free selection menu.
 *
 * The saved review board is deliberately part of the journey: moving its first
 * Block must retain the orange cue binding before the same three Blocks are
 * marquee-selected. The menu keeps its batch controls, but never narrates a
 * selected total; Inspect calls the state "Batch edit" rather than a count.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'selection-count-removal.systemsketch')
const FRAME = join(ROOT, 'docs', 'selection-count-removal-live-2026-09-02.png')
const BOUND_FRAME = join(ROOT, 'docs', 'selection-count-removal-bound-2026-09-02.png')
const RESULTS = join(ROOT, 'docs', 'selection-count-removal-results.json')

async function box(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return 'null'
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function clickSelector(page, selector) {
  const rect = await box(page, selector)
  assert.ok(rect, `missing ${selector}`)
  await clickAt(page, rect.x + rect.w / 2, rect.y + rect.h / 2)
}

async function marqueeBlocks(page) {
  const bounds = JSON.parse(await evaluate(page, `(() => JSON.stringify(
    Array.from(document.querySelectorAll('.systemsketch-block-canvas')).map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }),
  ))()`))
  assert.equal(bounds.length, 3, 'the review board contains its three target Blocks')
  const left = Math.min(...bounds.map((entry) => entry.left)) - 34
  const top = Math.min(...bounds.map((entry) => entry.top)) - 34
  const right = Math.max(...bounds.map((entry) => entry.right)) + 34
  const bottom = Math.max(...bounds.map((entry) => entry.bottom)) + 34
  await drag(page, { x: left, y: top }, { x: right, y: bottom })
}

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({
    label: 'selection-count-removal',
    build: 'selection-count-removal-smoke',
    allowSourceRoot: true,
    width: 1800,
    height: 900,
  })
  const { page, port } = app

  try {
    await openApp(page, port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the saved review board')
    await waitFor(page, `document.querySelector('[data-shape-id="shape:source"]')`, 'the first review Block')
    await delay(700)

    const before = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const source = editor.getShape('shape:source')
      const bound = editor.getBindingsFromShape('shape:cue-step-1-arrow', 'arrow')
        .filter((binding) => binding.toId === 'shape:source')
      return JSON.stringify({ x: source.x, y: source.y, bound: bound.length })
    })()`))
    assert.equal(before.bound, 1, 'the first instruction arrow is bound to the first Block')

    const sourceRect = await box(page, '[data-shape-id="shape:source"]')
    assert.ok(sourceRect, 'the first Block has a live canvas element')
    await drag(page,
      { x: sourceRect.x + sourceRect.w * 0.7, y: sourceRect.y + sourceRect.h * 0.72 },
      { x: sourceRect.x + sourceRect.w * 0.7 + 40, y: sourceRect.y + sourceRect.h * 0.72 })
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:source').x > ${before.x + 25}`,
      'the first Block to move')
    const after = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const source = editor.getShape('shape:source')
      const bound = editor.getBindingsFromShape('shape:cue-step-1-arrow', 'arrow')
        .filter((binding) => binding.toId === 'shape:source')
      return JSON.stringify({ x: source.x, y: source.y, bound: bound.length })
    })()`))
    assert.equal(after.bound, 1, 'the moved Block keeps the orange instruction arrow attached')
    const boundCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(BOUND_FRAME, Buffer.from(boundCapture.data, 'base64'))
    pass('moving a review target keeps its orange cue arrow bound')

    await marqueeBlocks(page)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'the three-Block selection menu')
    const menu = JSON.parse(await evaluate(page, `(() => {
      const bar = document.querySelector('.systemsketch-selection-menu__bar')
      return JSON.stringify({
        text: bar?.innerText ?? '',
        obsoleteSummary: Boolean(document.querySelector(
          '.systemsketch-selection-count, .block-mini-menu__count, .block-mini-menu__scope',
        )),
        controls: Array.from(bar?.querySelectorAll(
          '.block-mini-menu__views button, .block-mini-menu__inspect',
        ) ?? []).map((button) => button.innerText.trim().split(/\s+/)[0]),
      })
    })()`))
    assert.equal(menu.obsoleteSummary, false)
    assert.doesNotMatch(menu.text, /\b3 selected\b|\b3 Blocks\b|\b1 Block\b/)
    assert.deepEqual(menu.controls.slice(0, 3).map((control) => control.at(0)), ['S', 'P', 'E'])
    assert.ok(menu.controls.at(-1).startsWith('In'))
    const menuCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(FRAME, Buffer.from(menuCapture.data, 'base64'))
    pass('the three-Block pill starts with S / P / E and has no selected-count summary')

    await clickSelector(page, '.block-mini-menu__inspect')
    await waitFor(page, `document.querySelector('.block-inspector__batch-title')?.textContent === 'Batch edit'`,
      'the count-free batch inspector heading')
    pass('Inspect names the state “Batch edit”, not a selected total')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the saved fixture journey produces zero local console errors')
    await writeFile(RESULTS, JSON.stringify({
      checks,
      before,
      after,
      menu,
      inspectorHeading: 'Batch edit',
      board: BOARD,
      screenshots: { menu: FRAME, bound: BOUND_FRAME },
    }, null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${FRAME}\n  ${BOUND_FRAME}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
