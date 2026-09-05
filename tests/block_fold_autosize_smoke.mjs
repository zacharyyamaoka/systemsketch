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
	mouse,
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

	await clickInspectorChoice(page, 'Block fold control side', 'right')
	const rightChevron = await box(page, `${scope(container)} [data-testid^="block-fold-"]`)
	const rightFace = await box(page, `${scope(container)} .systemsketch-block-canvas`)
	assert.ok(rightFace.x + rightFace.width - rightChevron.cx < 28,
		'right fold control is pinned to the right header corner')
	await clickInspectorChoice(page, 'Block fold control side', 'left')
	const leftChevron = await box(page, `${scope(container)} [data-testid^="block-fold-"]`)
	const leftFace = await box(page, `${scope(container)} .systemsketch-block-canvas`)
	assert.ok(leftChevron.cx - leftFace.x < 28,
		'left fold control is pinned to the left header corner')
	pass('folding keeps its left default and offers an independent right-corner placement')

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

	// Treat the whole child face as a fast, real-world grab target. The repeated
	// reversals intentionally cross every current container edge; auto-fit must
	// grow and follow, never hand the child to the page mid-gesture.
	await selectBlock(page, child)
	const stressStart = await box(page, `${scope(child)} .systemsketch-block-canvas`)
	const stressOrigin = { x: stressStart.cx, y: stressStart.cy }
	const containerBeforeStress = await shapeFacts(page, container)
	const stressOffsets = [
		{ x: 260, y: 0 }, { x: 260, y: 180 }, { x: -120, y: 180 },
		{ x: -120, y: -90 }, { x: 330, y: -90 }, { x: 330, y: 210 },
		{ x: 40, y: 210 }, { x: 40, y: 30 },
	]
	await mouse(page, 'mouseMoved', stressOrigin.x, stressOrigin.y)
	await mouse(page, 'mousePressed', stressOrigin.x, stressOrigin.y, { buttons: 1 })
	for (let cycle = 0; cycle < 3; cycle += 1) {
		for (const offset of stressOffsets) {
			const x = stressOrigin.x + offset.x
			const y = stressOrigin.y + offset.y
			await mouse(page, 'mouseMoved', x, y, { buttons: 1 })
			assert.equal(await parentOf(page, child), container,
				`auto-fit child stays a member during rapid drag sample ${cycle}:${offset.x},${offset.y}`)
			const duringDrag = await shapeFacts(page, container)
			assert.deepEqual(
				{ x: duringDrag.x, y: duringDrag.y, w: duringDrag.w, h: duringDrag.h },
				{
					x: containerBeforeStress.x,
					y: containerBeforeStress.y,
					w: containerBeforeStress.w,
					h: containerBeforeStress.h,
				},
				`stock translation is the only geometry writer during drag sample ${cycle}:${offset.x},${offset.y}`,
			)
		}
	}
	const stressEnd = stressOffsets.at(-1)
	const childBeforeRelease = await shapeFacts(page, child)
	const childPageBeforeRelease = {
		x: containerBeforeStress.x + childBeforeRelease.x,
		y: containerBeforeStress.y + childBeforeRelease.y,
	}
	await mouse(page, 'mouseReleased', stressOrigin.x + stressEnd.x, stressOrigin.y + stressEnd.y)
	await waitFor(page,
		`(() => {
			const editor = window.__systemsketch?.editor
			const frame = editor?.getShape(${JSON.stringify(container)})
			const member = editor?.getShape(${JSON.stringify(child)})
			return frame && member
				&& member.parentId === ${JSON.stringify(container)}
				&& Math.abs(member.x - 56) < 0.01
				&& Math.abs(member.y - 56) < 0.01
		})()`,
		'one settled stock fit after rapid drag')
	const stressFitted = await shapeFacts(page, container)
	const childAfterRelease = await shapeFacts(page, child)
	assert.equal(stressFitted.autoResize, true)
	assert.ok(Math.abs(stressFitted.x + childAfterRelease.x - childPageBeforeRelease.x) < 0.01,
		'stock fit preserves the child page x')
	assert.ok(Math.abs(stressFitted.y + childAfterRelease.y - childPageBeforeRelease.y) < 0.01,
		'stock fit preserves the child page y')
	await shot(page, 'block-fold-autosize-rapid-drag-2026-09-04.png')
	pass('rapid edge-crossing uses stock translation, then one stock fit preserves membership and page pose')

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
