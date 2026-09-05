#!/usr/bin/env node
/** Prove continuous auto-fit feedback and the stock release commit in a real browser. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
	ROOT,
	delay,
	evaluate,
	localConsoleErrors,
	makeChecklist,
	mouse,
	openApp,
	startApp,
	waitFor,
} from './browser_harness.mjs'
import { box, scope } from './block_journey_helpers.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'block-autofit-continuous.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-autofit-continuous-live-2026-09-05.png')
const HELD_SHOT = join(ROOT, 'docs', 'assets', 'block-autofit-continuous-held-2026-09-05.png')
const FIRST_DRAG_SHOT = join(ROOT, 'docs', 'assets', 'block-autofit-child-first-drag-2026-09-05.png')
const PIPELINE = 'shape:pipeline'
const PARSE = 'shape:decode'
const TOKENIZE = 'shape:stress-tokenize'
const VALIDATE = 'shape:stress-validate'
const { checks, pass } = makeChecklist()

async function shapeFacts(page, id) {
	return JSON.parse(await evaluate(page, `(() => {
		const shape = window.__systemsketch?.editor.getShape(${JSON.stringify(id)})
		return JSON.stringify(shape ? {
			x: shape.x, y: shape.y, parentId: shape.parentId,
			w: shape.props.w, h: shape.props.h,
		} : null)
	})()`))
}

async function livePresentation(page) {
	return JSON.parse(await evaluate(page, `(() => {
		const root = document.querySelector(${JSON.stringify(`${scope(PIPELINE)} .systemsketch-block-canvas`)})
		const layer = root?.querySelector('.BlockNode-layer')
		if (!root || !layer || root.getAttribute('data-auto-fit-live') !== 'true') return 'null'
		const rect = layer.getBoundingClientRect()
		return JSON.stringify({
			x: Number(root.getAttribute('data-auto-fit-x')),
			y: Number(root.getAttribute('data-auto-fit-y')),
			w: Number(root.getAttribute('data-auto-fit-w')),
			h: Number(root.getAttribute('data-auto-fit-h')),
			left: rect.left, top: rect.top, width: rect.width, height: rect.height,
		})
	})()`))
}

async function main() {
	const app = await startApp({
		label: 'block-autofit-continuous-fixture',
		build: 'block-autofit-continuous-fixture-smoke',
		width: 1600,
		height: 960,
	})
	const { page, port, filesRoot } = app

	try {
		const board = join(filesRoot, 'SystemSketch', 'block-autofit-continuous.systemsketch')
		await mkdir(dirname(board), { recursive: true })
		await copyFile(FIXTURE, board)
		await openApp(page, port, `?board=${encodeURIComponent(board)}`)
		await waitFor(page,
			`window.__systemsketch?.editor?.getShape(${JSON.stringify(PARSE)})?.parentId === ${JSON.stringify(PIPELINE)}`,
			'cold-reopened continuous fixture membership')
		await delay(300)
		await evaluate(page, `document.querySelector('[data-testid="systemsketch-right-popout-close"]')?.click(); true`)
		await delay(120)

		// Reproduce the reported sequence in the real state chart: select the
		// outer Block, then immediately press and drag its visible child. Stock
		// tldraw normally preserves a selected ancestor until pointer-up; our
		// adapter must hand selection to the child before translation snapshots it.
		const parentSurface = await box(page, `${scope(PIPELINE)} .systemsketch-block-canvas`)
		const parentHeader = { x: parentSurface.x + parentSurface.width / 2, y: parentSurface.y + 24 }
		await mouse(page, 'mouseMoved', parentHeader.x, parentHeader.y)
		await mouse(page, 'mousePressed', parentHeader.x, parentHeader.y, { buttons: 1 })
		await mouse(page, 'mouseReleased', parentHeader.x, parentHeader.y)
		await waitFor(page,
			`window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(PIPELINE)}`,
			'outer Block selected')

		const firstFrameBefore = await shapeFacts(page, PIPELINE)
		const firstChildBefore = await shapeFacts(page, PARSE)
		const firstChildPageBefore = {
			x: firstFrameBefore.x + firstChildBefore.x,
			y: firstFrameBefore.y + firstChildBefore.y,
		}
		const firstChildSurface = await box(page, `${scope(PARSE)} .systemsketch-block-canvas`)
		const firstStart = {
			x: firstChildSurface.x + firstChildSurface.width / 2,
			y: firstChildSurface.y + firstChildSurface.height / 2,
		}
		const firstEnd = { x: firstStart.x + 96, y: firstStart.y + 54 }
		await mouse(page, 'mouseMoved', firstStart.x, firstStart.y)
		await mouse(page, 'mousePressed', firstStart.x, firstStart.y, { buttons: 1 })
		await mouse(page, 'mouseMoved', firstEnd.x, firstEnd.y, { buttons: 1 })
		await waitFor(page,
			`window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(PARSE)}
				&& window.__systemsketch.editor.isIn('select.translating')`,
			'first child drag owns stock translation')
		const firstFrameDuring = await shapeFacts(page, PIPELINE)
		const firstChildDuring = await shapeFacts(page, PARSE)
		assert.deepEqual(firstFrameDuring, firstFrameBefore,
			'the selected parent is not translated by the child gesture')
		assert.equal(firstChildDuring.parentId, PIPELINE)
		assert.ok(Math.abs(firstChildDuring.x - firstChildBefore.x) > 10)
		assert.ok(Math.abs(firstChildDuring.y - firstChildBefore.y) > 10)
		const firstCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(FIRST_DRAG_SHOT, Buffer.from(firstCapture.data, 'base64'))
		await mouse(page, 'mouseReleased', firstEnd.x, firstEnd.y)
		await waitFor(page, `(() => {
			const editor = window.__systemsketch?.editor
			const child = editor?.getShape(${JSON.stringify(PARSE)})
			return editor?.getPath() === 'select.idle'
				&& child?.parentId === ${JSON.stringify(PIPELINE)}
				&& Math.abs(child.x - 56) < 0.01
				&& Math.abs(child.y - 56) < 0.01
		})()`, 'first child drag settles through stock fit')
		const firstFrameAfter = await shapeFacts(page, PIPELINE)
		const firstChildAfter = await shapeFacts(page, PARSE)
		assert.ok(Math.abs(
			(firstFrameAfter.x + firstChildAfter.x) - (firstChildPageBefore.x + 96)
		) < 0.05)
		assert.ok(Math.abs(
			(firstFrameAfter.y + firstChildAfter.y) - (firstChildPageBefore.y + 54)
		) < 0.05)
		pass('an immediate child drag after selecting the parent moves only the child')
		pass('the first drag preserves membership and settles through stock fit-to-content')

		await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			editor.setEditingShape(null)
			editor.setSelectedShapes([${JSON.stringify(PARSE)}])
			return true
		})()`)
		await waitFor(page,
			`window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(PARSE)}
				&& window.__systemsketch.editor.getPath() === 'select.idle'`,
			'fixture child selection')
		await delay(160)

		const origin = await box(page, `${scope(PARSE)} .systemsketch-block-canvas`)
		const dragStart = { x: origin.x + origin.width - 14, y: origin.y + origin.height / 2 }
		const frameBefore = await shapeFacts(page, PIPELINE)
		const offsets = [
			{ x: 250, y: 0 }, { x: 250, y: 170 }, { x: -100, y: 170 },
			{ x: -100, y: -80 }, { x: 320, y: -80 }, { x: 320, y: 200 },
			{ x: 45, y: 200 }, { x: 45, y: 35 },
		]
		const projected = new Set()
		let lastPresentation = null
		await mouse(page, 'mouseMoved', dragStart.x, dragStart.y)
		await mouse(page, 'mousePressed', dragStart.x, dragStart.y, { buttons: 1 })
		for (let cycle = 0; cycle < 4; cycle += 1) {
			for (const offset of offsets) {
				await mouse(page, 'mouseMoved', dragStart.x + offset.x, dragStart.y + offset.y, { buttons: 1 })
				await delay(12)
				const frameDuring = await shapeFacts(page, PIPELINE)
				const childDuring = await shapeFacts(page, PARSE)
				const live = await livePresentation(page)
				if (!live) {
					const diagnostic = await evaluate(page, `(() => {
						const editor = window.__systemsketch?.editor
						const root = document.querySelector(${JSON.stringify(`${scope(PIPELINE)} .systemsketch-block-canvas`)})
						return JSON.stringify({
							state: editor?.getPath?.(), pointing: editor?.inputs.getIsPointing(),
							translating: editor?.isIn('select.translating'),
							root: root?.outerHTML.slice(0, 500),
						})
					})()`)
					throw new Error(`no live surface during sample ${cycle}:${offset.x},${offset.y}: ${diagnostic}`)
				}
				assert.equal(childDuring.parentId, PIPELINE)
				assert.deepEqual(frameDuring, frameBefore,
					`persisted frame remains stable during sample ${cycle}:${offset.x},${offset.y}`)
				assert.ok(Math.abs(live.x - (childDuring.x - 56)) < 0.05)
				assert.ok(Math.abs(live.y - (childDuring.y - 56)) < 0.05)
				assert.ok(Math.abs(live.w - (childDuring.w + 112)) < 0.05)
				assert.ok(Math.abs(live.h - (childDuring.h + 112)) < 0.05)
				assert.ok(live.width > 0 && live.height > 0)
				projected.add(`${live.x.toFixed(1)}:${live.y.toFixed(1)}`)
				lastPresentation = live
			}
		}
		assert.ok(projected.size >= offsets.length, 'the projected boundary follows each distinct held position')
		pass('32 held edge-crossing samples continuously project the padded Block boundary')
		pass('the persisted frame remains unchanged while stock translation owns the gesture')
		const heldCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(HELD_SHOT, Buffer.from(heldCapture.data, 'base64'))
		pass('held-state screenshot records the derived boundary before release')

		const end = offsets.at(-1)
		const childBeforeRelease = await shapeFacts(page, PARSE)
		const pageBeforeRelease = {
			x: frameBefore.x + childBeforeRelease.x,
			y: frameBefore.y + childBeforeRelease.y,
		}
		await mouse(page, 'mouseReleased', dragStart.x + end.x, dragStart.y + end.y)
		await waitFor(page, `(() => {
			const editor = window.__systemsketch?.editor
			const child = editor?.getShape(${JSON.stringify(PARSE)})
			const root = document.querySelector(${JSON.stringify(`${scope(PIPELINE)} .systemsketch-block-canvas`)})
			return child?.parentId === ${JSON.stringify(PIPELINE)}
				&& Math.abs(child.x - 56) < 0.01
				&& Math.abs(child.y - 56) < 0.01
				&& !root?.hasAttribute('data-auto-fit-live')
		})()`, 'stock release fit replaces the live projection')
		const frameAfter = await shapeFacts(page, PIPELINE)
		const childAfter = await shapeFacts(page, PARSE)
		assert.ok(lastPresentation)
		assert.ok(Math.abs(frameAfter.x - (frameBefore.x + lastPresentation.x)) < 0.05)
		assert.ok(Math.abs(frameAfter.y - (frameBefore.y + lastPresentation.y)) < 0.05)
		assert.ok(Math.abs(frameAfter.w - lastPresentation.w) < 0.05)
		assert.ok(Math.abs(frameAfter.h - lastPresentation.h) < 0.05)
		assert.ok(Math.abs(frameAfter.x + childAfter.x - pageBeforeRelease.x) < 0.01)
		assert.ok(Math.abs(frameAfter.y + childAfter.y - pageBeforeRelease.y) < 0.01)
		pass('release commits the same projected box without changing child page pose or membership')

		// The reported stack overflow appeared after the board had accumulated
		// several members. Exercise that exact shape graph and rapid alternation:
		// the paint projection may read children, but tldraw's cached geometry must
		// remain a pure function of each shape record.
		await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			const template = editor.getShape(${JSON.stringify(PARSE)})
			editor.createShapes([
				{
					id: ${JSON.stringify(TOKENIZE)}, type: 'block', parentId: ${JSON.stringify(PIPELINE)},
					x: 330, y: 70,
					props: { ...template.props, title: 'tokenize()', autoResize: false },
				},
				{
					id: ${JSON.stringify(VALIDATE)}, type: 'block', parentId: ${JSON.stringify(PIPELINE)},
					x: 90, y: 260,
					props: { ...template.props, title: 'validate()', autoResize: false },
				},
			])
			return true
		})()`)
		await waitFor(page, `(() => {
			const editor = window.__systemsketch?.editor
			return editor?.getShape(${JSON.stringify(TOKENIZE)})?.parentId === ${JSON.stringify(PIPELINE)}
				&& editor?.getShape(${JSON.stringify(VALIDATE)})?.parentId === ${JSON.stringify(PIPELINE)}
				&& editor?.getPath() === 'select.idle'
		})()`, 'multi-member auto-fit fixture')
		await delay(100)
		await evaluate(page,
			`window.__systemsketch.editor.setSelectedShapes([${JSON.stringify(PIPELINE)}]); true`)
		const stressSurface = await box(page, `${scope(TOKENIZE)} .systemsketch-block-canvas`)
		const stressStart = {
			x: stressSurface.x + stressSurface.width / 2,
			y: stressSurface.y + stressSurface.height / 2,
		}
		const stressOffsets = [
			{ x: 180, y: 20 }, { x: -80, y: 120 }, { x: 260, y: -90 },
			{ x: 30, y: 210 }, { x: 120, y: 60 },
		]
		await mouse(page, 'mouseMoved', stressStart.x, stressStart.y)
		await mouse(page, 'mousePressed', stressStart.x, stressStart.y, { buttons: 1 })
		for (let cycle = 0; cycle < 10; cycle += 1) {
			for (const offset of stressOffsets) {
				await mouse(page, 'mouseMoved', stressStart.x + offset.x, stressStart.y + offset.y, { buttons: 1 })
				await delay(3)
			}
		}
		await waitFor(page,
			`window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(TOKENIZE)}
				&& window.__systemsketch.editor.isIn('select.translating')`,
			'multi-member child owns rapid drag')
		const stressEnd = stressOffsets.at(-1)
		await mouse(page, 'mouseReleased', stressStart.x + stressEnd.x, stressStart.y + stressEnd.y)
		await waitFor(page, `(() => {
			const editor = window.__systemsketch?.editor
			return editor?.getPath() === 'select.idle'
				&& [${JSON.stringify(PARSE)}, ${JSON.stringify(TOKENIZE)}, ${JSON.stringify(VALIDATE)}]
					.every((id) => editor.getShape(id)?.parentId === ${JSON.stringify(PIPELINE)})
				&& !editor.getCrashingError?.()
		})()`, 'rapid multi-member drag settles without a reactive crash')
		assert.equal(await evaluate(page,
			`Boolean(document.body.textContent?.includes('Maximum call stack size exceeded'))`), false)
		pass('50 rapid multi-member samples settle with an acyclic membership graph and no stack overflow')

		await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([]); true`)
		await delay(250)
		const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
		assert.deepEqual(localConsoleErrors(page), [])
		pass('continuous fixture journey produced zero local console errors')

		process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${FIRST_DRAG_SHOT}\n  ${HELD_SHOT}\n  ${SHOT}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
	process.exitCode = 1
})
