#!/usr/bin/env node
/**
 * Real-browser proof for optional Block folding, stock-derived auto-fit, and
 * the explicit membership escape hatch. Every setting is selected through the
 * inspector; the only development-seam reads are persisted geometry/parent
 * facts that have no separate DOM representation.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { blockIds, box, drawBlock, parentOf, scope, setView, shot } from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const { checks, pass } = makeChecklist()

async function clickInspectorChoice(page, label, value) {
  const target = await evaluate(page, `(() => {
    const group = document.querySelector('[data-inspector-section="Behaviour"] [aria-label=${JSON.stringify(label)}]')
    const button = Array.from(group?.querySelectorAll('button') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(value)})
    if (!button) return null
    const rect = button.getBoundingClientRect()
    return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  })()`)
  if (!target) throw new Error(`Missing ${value} in ${label}`)
  const point = JSON.parse(target)
  await clickAt(page, point.x, point.y)
  await delay(260)
}

async function selectBlock(page, id) {
  const face = await box(page, `${scope(id)} .systemsketch-block-canvas`)
  await clickAt(page, face.x + 48, face.y + 20)
  await delay(240)
}

async function shapeFacts(page, id) {
  return JSON.parse(await evaluate(page, `(() => {
    const shape = window.__systemsketch?.editor.getShape(${JSON.stringify(id)})
    return JSON.stringify(shape ? {
      x: shape.x, y: shape.y, parentId: shape.parentId,
      w: shape.props.w, h: shape.props.h,
      foldable: shape.props.foldable, folded: shape.props.folded, autoResize: shape.props.autoResize,
    } : null)
  })()`))
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-block-fold-autosize',
    build: 'block-fold-autosize-smoke',
    width: 1600,
    height: 980,
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    await drawBlock(page, { x: 160, y: 150 }, { x: 900, y: 690 }, 'pipeline()')
    const [container] = await blockIds(page)
    await setView(page, 'expanded')
    await delay(220)

    // Create a real child through stock frame-like hit testing before auto-fit
    // is enabled, so the next inspector setting has an authored body to fit.
    await drawBlock(page, { x: 350, y: 330 }, { x: 620, y: 470 }, 'decode()')
    const child = (await blockIds(page)).find((id) => id !== container)
    assert.ok(child, 'child Block was created')
    await waitFor(page,
      `window.__systemsketch?.editor.getShape(${JSON.stringify(child)})?.parentId === ${JSON.stringify(container)}`,
      'child membership in Expanded Block')
    pass('Expanded Block uses stock frame membership for a child drawn inside it')

    await selectBlock(page, container)
    await clickInspectorChoice(page, 'Enable block folding', 'enabled')
    await clickInspectorChoice(page, 'Auto fit Block children', 'enabled')
    await waitFor(page, `(() => {
      const shape = window.__systemsketch?.editor.getShape(${JSON.stringify(container)})
      return shape?.props.autoResize && shape.props.foldable && shape.props.w < 740 && shape.props.h < 540
    })()`, 'stock auto-fit after enabling it')
    const fitted = await shapeFacts(page, container)
    assert.equal(fitted.autoResize, true)
    assert.equal(fitted.foldable, true)
    assert.equal(fitted.folded, false)
    await shot(page, 'block-fold-autosize-expanded-2026-09-04.png')
    pass('inspector enables occurrence-local folding and auto-fit, then derives a tighter Expanded box')

    const chevron = await box(page, `${scope(container)} [data-testid^="block-fold-"]`)
    await clickAt(page, chevron.cx, chevron.cy)
    await waitFor(page,
      `window.__systemsketch?.editor.getShape(${JSON.stringify(container)})?.props.folded === true`,
      'compact fold state')
    await waitFor(page,
      `!document.querySelector(${JSON.stringify(`${scope(child)} .systemsketch-block-canvas`)})`,
      'hidden child canvas while folded')
    const folded = await shapeFacts(page, container)
    assert.equal(folded.h, 48)
    assert.equal(await parentOf(page, child), container)
    await shot(page, 'block-fold-autosize-folded-2026-09-04.png')
    pass('furthest-left chevron folds to a header, hides children, and preserves membership')

    const foldedChevron = await box(page, `${scope(container)} [data-testid^="block-fold-"]`)
    await clickAt(page, foldedChevron.cx, foldedChevron.cy)
    await waitFor(page,
      `window.__systemsketch?.editor.getShape(${JSON.stringify(container)})?.props.folded === false`,
      'expanded fold state')
    await waitFor(page,
      `document.querySelector(${JSON.stringify(`${scope(child)} .systemsketch-block-canvas`)})`,
      'restored child canvas')
    pass('same chevron restores the parked Expanded box and exact child record')

    await selectBlock(page, child)
    const childFace = await box(page, `${scope(child)} .systemsketch-block-canvas`)
    await clickAt(page, childFace.cx, childFace.cy, 'right')
    await waitFor(page,
      `document.querySelector('[data-testid="context-menu.remove-from-container"]')`,
      'Remove from container context command')
    await clickElement(page, '[data-testid="context-menu.remove-from-container"]')
    await waitFor(page,
      `window.__systemsketch?.editor.getShape(${JSON.stringify(child)})?.parentId === window.__systemsketch?.editor.getCurrentPageId()`,
      'stock reparent after explicit removal')
    assert.equal(await parentOf(page, child), 'page:page')
    pass('right-click exposes Remove from container and preserves the child while removing membership')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('fold / auto-fit / removal journey has no local browser errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
