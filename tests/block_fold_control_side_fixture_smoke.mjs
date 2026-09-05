#!/usr/bin/env node
/** Drive the generated left/right fold-control review board in a real browser. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
	ROOT,
	clickAt,
	clickElement,
	delay,
	evaluate,
	localConsoleErrors,
	makeChecklist,
	openApp,
	startApp,
	waitFor,
} from './browser_harness.mjs'
import { box, scope } from './block_journey_helpers.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'block-fold-control-side.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-fold-control-side-live-2026-09-05.png')
const SUBJECT = 'shape:fold-subject'
const REFERENCE = 'shape:right-reference'
const { checks, pass } = makeChecklist()

async function foldPosition(page, id) {
	const face = await box(page, `${scope(id)} .systemsketch-block-canvas`)
	const fold = await box(page, `${scope(id)} [data-testid^="block-fold-"]`)
	return { face, fold }
}

async function identityPosition(page, id) {
	return {
		title: await box(page, `${scope(id)} .BlockNode-headingTitle`),
		type: await box(page, `${scope(id)} .BlockNode-headingType`),
	}
}

async function main() {
	const app = await startApp({ label: 'block-fold-control-side', build: 'block-fold-control-side-fixture-smoke', width: 1500, height: 930 })
	const { page, port, filesRoot } = app
	try {
		const board = join(filesRoot, 'SystemSketch', 'block-fold-control-side.systemsketch')
		await mkdir(dirname(board), { recursive: true })
		await copyFile(FIXTURE, board)
		await openApp(page, port, `?board=${encodeURIComponent(board)}`)
		await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(SUBJECT)})`, 'fold-side fixture')
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(SUBJECT)}); true`)
		await waitFor(page, `document.querySelector('[data-testid="block-fold-control-right"]')`, 'Fold control inspector choice')

		const initial = await foldPosition(page, SUBJECT)
		assert.ok(initial.fold.cx - initial.face.x < 28)
		pass('an existing foldable Block defaults to the left corner')

		await clickElement(page, '[data-testid="block-fold-control-right"]')
		await waitFor(page,
			`window.__systemsketch.editor.getShape(${JSON.stringify(SUBJECT)})?.props.foldControlSide === 'right'`,
			'right fold side persistence')
		const right = await foldPosition(page, SUBJECT)
		assert.ok(right.face.x + right.face.width - right.fold.cx < 28)
		const rightIdentity = await identityPosition(page, SUBJECT)
		const titleToTypeGap = rightIdentity.type.x - (rightIdentity.title.x + rightIdentity.title.width)
		assert.ok(titleToTypeGap >= 0 && titleToTypeGap <= 12,
			`right-side type follows the title (gap ${titleToTypeGap})`)
		pass('the inspector moves the fold control right and places type beside the left-side title')

		const reference = await foldPosition(page, REFERENCE)
		assert.ok(reference.face.x + reference.face.width - reference.fold.cx < 28)
		await clickAt(page, reference.fold.cx, reference.fold.cy)
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(REFERENCE)})?.props.folded === true`, 'right-side fold action')
		const foldedReference = await foldPosition(page, REFERENCE)
		assert.ok(foldedReference.face.x + foldedReference.face.width - foldedReference.fold.cx < 28)
		await clickAt(page, foldedReference.fold.cx, foldedReference.fold.cy)
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(REFERENCE)})?.props.folded === false`, 'right-side unfold action')
		pass('right-corner control folds and unfolds both Port and Expanded faces normally')

		await clickElement(page, '[data-testid="block-fold-control-left"]')
		await waitFor(page,
			`window.__systemsketch.editor.getShape(${JSON.stringify(SUBJECT)})?.props.foldControlSide === 'left'`,
			'left fold side restore')
		const restored = await foldPosition(page, SUBJECT)
		assert.ok(restored.fold.cx - restored.face.x < 28)
		pass('Left restores the original placement without changing folding state')

		await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([]); true`)
		await delay(250)
		await clickElement(page, '[data-testid="systemsketch-right-popout-close"]')
		await delay(200)
		const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
		assert.deepEqual(localConsoleErrors(page), [])
		pass('fold-side fixture journey produced zero local console errors')
		process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
	process.exitCode = 1
})
