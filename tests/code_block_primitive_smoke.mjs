#!/usr/bin/env node
/**
 * Real-browser acceptance for the CodeMirror-backed canvas Code primitive.
 *
 * It drives the shipped toolbar, tldraw's actual resize overlay and the
 * selected-object ribbon. The assertions inspect the live editor records after
 * those gestures; no component test or DOM mock can prove this composition.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
	ROOT,
	clickAt,
	delay,
	elementBox,
	evaluate,
	key,
	localConsoleErrors,
	mouse,
	shortcut,
	startApp,
	typeSlowly,
	waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SCREENSHOT = join(ASSETS, 'code-block-primitive-live-2026-09-05.png')
const RESULTS = join(ROOT, 'docs', 'code-block-primitive-results-2026-09-05.json')

async function rect(page, selector) {
	return elementBox(page, selector)
}

async function clickSelector(page, selector) {
	const box = await rect(page, selector)
	await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
}

async function codeRecord(page) {
	return JSON.parse(await evaluate(page, `(() => {
		const shape = window.__systemsketch.editor.getCurrentPageShapes().find((item) => item.type === 'code')
		return JSON.stringify(shape && { id: shape.id, x: shape.x, y: shape.y, props: shape.props })
	})()`))
}

async function capture(page, path) {
	const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
	await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function main() {
	await mkdir(ASSETS, { recursive: true })
	const app = await startApp({ label: 'code-block-primitive', width: 1440, height: 900 })
	const { page, port, filesRoot } = app
	const checks = []
	const check = (id, condition, detail) => {
		checks.push({ id, ok: Boolean(condition), detail })
		assert.ok(condition, `${id}: ${detail}`)
	}

	try {
		const board = join(filesRoot, 'SystemSketch', 'code-block-primitive.systemsketch')
		await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?board=${encodeURIComponent(board)}` })
		await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
		await delay(700)

		// Choose Code through the visible system family, then draw it with the
		// stock BaseBoxShapeTool gesture. This is deliberately not a store write.
		await clickSelector(page, '[data-testid="systemsketch-tool-system"]')
		await waitFor(page, `document.querySelector('.systemsketch-tool-menu')`, 'system tool menu')
		const row = JSON.parse(await evaluate(page, `(() => {
			const item = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
				.find((node) => node.textContent.trim().startsWith('Code'))
			if (!item) return null
			const box = item.getBoundingClientRect()
			return JSON.stringify({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
		})()`))
		check('TOOL-1', row !== null, 'Code is available from the system family')
		await clickAt(page, row.x, row.y)
		await waitFor(page, `window.__systemsketch.editor.getCurrentToolId() === 'code'`, 'Code tool activation')

		await mouse(page, 'mouseMoved', 250, 235)
		await mouse(page, 'mousePressed', 250, 235, { buttons: 1 })
		await mouse(page, 'mouseMoved', 780, 500, { buttons: 1 })
		await mouse(page, 'mouseReleased', 780, 500)
		await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === 'code')`, 'Code shape creation')
		await waitFor(page, `document.querySelector('.code-block-canvas .cm-editor')`, 'CodeMirror surface')
		let code = await codeRecord(page)
		check('CREATE-1', code?.props.language === 'python' && code.props.showLineNumbers === true,
			'new Code block has a real CodeMirror-backed Python document with line numbers')
		check('CREATE-2', code?.props.characterWidth >= 16,
			'new Code block persists its readable character width')

		// Change a language with the native selected-object control, then make a
		// presentational change that must preserve the `ch` contract.
		const language = await rect(page, '[data-testid="code-language"]')
		await clickAt(page, language.x + language.width / 2, language.y + language.height / 2)
		await key(page, 'ArrowDown', 'ArrowDown')
		await key(page, 'Enter', 'Enter')
		await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'code')?.props.language === 'javascript'`, 'JavaScript language choice')
		const beforeGutter = await codeRecord(page)
		await clickSelector(page, '[data-testid="code-line-numbers"]')
		await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'code')?.props.showLineNumbers === false`, 'line number toggle')
		code = await codeRecord(page)
		check('RIBBON-1', code.props.language === 'javascript', 'language control updates the live CodeMirror mode')
		check('RIBBON-2', code.props.characterWidth === beforeGutter.props.characterWidth && code.props.w < beforeGutter.props.w,
			'line-number toggle keeps the authored character width while removing only the gutter')

		// The FigJam-style width sheet accepts a custom number, not just named presets.
		await clickSelector(page, '[data-testid="code-width-trigger"]')
		await waitFor(page, `document.querySelector('[data-testid="code-width-custom"]')`, 'Code width chooser')
		const custom = await rect(page, '[data-testid="code-width-custom"]')
		await clickAt(page, custom.x + custom.width / 2, custom.y + custom.height / 2)
		await shortcut(page, 'a', 'KeyA', 2)
		await typeSlowly(page, '72')
		await key(page, 'Enter', 'Enter')
		await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'code')?.props.characterWidth === 72`, 'custom character width')
		code = await codeRecord(page)
		check('WIDTH-1', code.props.characterWidth === 72,
			'typed custom width is persisted as a 72-character measure')
		await capture(page, SCREENSHOT)

		// A live stock handle drag owns the pixel geometry, and our narrow shape
		// seam reports its reciprocal ch while tldraw is in select.resizing.
		await clickSelector(page, '[data-testid="code-width-trigger"]')
		const resize = JSON.parse(await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			const overlay = editor.overlays.getCurrentOverlays().find((item) => item.id === 'selection_fg:bottom_right')
			if (!overlay) return null
			const point = editor.pageToScreen(editor.overlays.getOverlayGeometry(overlay).bounds.center)
			return JSON.stringify({ x: point.x, y: point.y })
		})()`))
		check('RESIZE-1', resize !== null, 'the Code block exposes tldraw’s stock bottom-right resize overlay')
		await mouse(page, 'mouseMoved', resize.x, resize.y)
		await mouse(page, 'mousePressed', resize.x, resize.y, { buttons: 1 })
		await mouse(page, 'mouseMoved', resize.x + 74, resize.y + 16, { buttons: 1 })
		await waitFor(page, `document.querySelector('.code-resize-hud')?.textContent.includes('ch')`, 'live character resize readout')
		check('RESIZE-2', await evaluate(page, `window.__systemsketch.editor.getPath()`) === 'select.resizing',
			'Code width uses tldraw’s active select.resizing state')
		await mouse(page, 'mouseReleased', resize.x + 74, resize.y + 16)
		await waitFor(page, `window.__systemsketch.editor.getPath() === 'select.idle'`, 'resize completion')
		code = await codeRecord(page)
		check('RESIZE-3', code.props.characterWidth > 72,
			'a freely dragged wider shape recalculates its visible character width')

		// The second click must enter the existing CodeMirror document, never
		// fall through to tldraw’s “place a new Text shape” behavior.
		const codeCanvas = await rect(page, '.code-block-canvas')
		const beforeTextCount = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'text').length`)
		await clickAt(page, codeCanvas.x + 180, codeCanvas.y + 75)
		await waitFor(page, `window.__systemsketch.editor.getEditingShapeId() === ${JSON.stringify(code.id)}`, 'CodeMirror edit entry')
		await typeSlowly(page, '\n// CodeMirror smoke')
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(code.id)})?.props.code.includes('// CodeMirror smoke')`, 'CodeMirror text commit')
		check('EDIT-1', await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'text').length`) === beforeTextCount,
			'second click edits the existing Code block without creating a stock Text shape')

		check('CONSOLE-1', localConsoleErrors(page).length === 0, 'no browser console errors occurred')
		await writeFile(RESULTS, `${JSON.stringify({ checks, screenshot: SCREENSHOT }, null, 2)}\n`)
		process.stdout.write(`PASS code block primitive real-browser journey\n${SCREENSHOT}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
