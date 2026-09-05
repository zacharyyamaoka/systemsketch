#!/usr/bin/env node
/** Drive the generated stock-settled auto-fit review board in a real browser. */
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
	mouse,
	openApp,
	startApp,
	waitFor,
} from './browser_harness.mjs'
import { box, scope } from './block_journey_helpers.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'block-autofit-stock-settle.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-autofit-stock-settle-live-2026-09-05.png')
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

async function main() {
	const app = await startApp({
		label: 'block-autofit-stock-settle-fixture',
		build: 'block-autofit-stock-settle-fixture-smoke',
		width: 1600,
		height: 960,
	})
	const { page, port, filesRoot } = app

	try {
		const board = join(filesRoot, 'SystemSketch', 'block-autofit-stock-settle.systemsketch')
		await mkdir(dirname(board), { recursive: true })
		await copyFile(FIXTURE, board)
		await openApp(page, port, `?board=${encodeURIComponent(board)}`)
		await waitFor(page,
			`window.__systemsketch?.editor?.getShape(${JSON.stringify(PARSE)})?.parentId === ${JSON.stringify(PIPELINE)}`,
			'cold-reopened fixture membership')
		await delay(300)

		const childFace = await box(page, `${scope(PARSE)} .systemsketch-block-canvas`)
		await clickAt(page, childFace.cx, childFace.cy)
		await waitFor(page,
			`window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(PARSE)}`,
			'fixture child selection')

		const origin = await box(page, `${scope(PARSE)} .systemsketch-block-canvas`)
		const frameBefore = await shapeFacts(page, PIPELINE)
		const offsets = [
			{ x: 250, y: 0 }, { x: 250, y: 170 }, { x: -100, y: 170 },
			{ x: -100, y: -80 }, { x: 320, y: -80 }, { x: 320, y: 200 },
			{ x: 45, y: 200 }, { x: 45, y: 35 },
		]
		await mouse(page, 'mouseMoved', origin.cx, origin.cy)
		await mouse(page, 'mousePressed', origin.cx, origin.cy, { buttons: 1 })
		for (let cycle = 0; cycle < 4; cycle += 1) {
			for (const offset of offsets) {
				await mouse(page, 'mouseMoved', origin.cx + offset.x, origin.cy + offset.y, { buttons: 1 })
				const frameDuring = await shapeFacts(page, PIPELINE)
				const childDuring = await shapeFacts(page, PARSE)
				assert.equal(childDuring.parentId, PIPELINE)
				assert.deepEqual(frameDuring, frameBefore,
					`frame remains unchanged during stock translation ${cycle}:${offset.x},${offset.y}`)
			}
		}
		pass('four rapid edge-crossing cycles leave stock translation as the sole geometry writer')

		const end = offsets.at(-1)
		const childBeforeRelease = await shapeFacts(page, PARSE)
		const pageBeforeRelease = {
			x: frameBefore.x + childBeforeRelease.x,
			y: frameBefore.y + childBeforeRelease.y,
		}
		await mouse(page, 'mouseReleased', origin.cx + end.x, origin.cy + end.y)
		await waitFor(page, `(() => {
			const editor = window.__systemsketch?.editor
			const child = editor?.getShape(${JSON.stringify(PARSE)})
			return child?.parentId === ${JSON.stringify(PIPELINE)}
				&& Math.abs(child.x - 56) < 0.01
				&& Math.abs(child.y - 56) < 0.01
		})()`, 'single settled stock fit')
		const frameAfter = await shapeFacts(page, PIPELINE)
		const childAfter = await shapeFacts(page, PARSE)
		assert.ok(Math.abs(frameAfter.x + childAfter.x - pageBeforeRelease.x) < 0.01)
		assert.ok(Math.abs(frameAfter.y + childAfter.y - pageBeforeRelease.y) < 0.01)
		pass('release performs one stock fit without changing the child page pose or membership')
		await evaluate(page, `window.__systemsketch.editor.setSelectedShapes([]); true`)
		await delay(250)
		await clickElement(page, '[data-testid="systemsketch-right-popout-close"]')
		await delay(200)
		const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
		assert.deepEqual(localConsoleErrors(page), [])
		pass('fixture stress journey produced zero local console errors')

		process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
	process.exitCode = 1
})
