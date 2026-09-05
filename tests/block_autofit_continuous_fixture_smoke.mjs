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
const PIPELINE = 'shape:pipeline'
const PARSE = 'shape:decode'
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
		await evaluate(page, `document.querySelector('[data-testid="systemsketch-right-popout-close"]')?.click(); true`)
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

		await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([]); true`)
		await delay(250)
		const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
		assert.deepEqual(localConsoleErrors(page), [])
		pass('continuous fixture journey produced zero local console errors')

		process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${HELD_SHOT}\n  ${SHOT}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
	process.exitCode = 1
})
