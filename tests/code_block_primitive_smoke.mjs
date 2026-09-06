#!/usr/bin/env node
/**
 * The Code block primitive, driven in a real browser.
 *
 *   Code lives in the System family slot (and S-search); drawing one yields a
 *   real CodeMirror 6 document inside a stock tldraw shape. Its language and
 *   its text size are ordinary rows in the ONE shared selection menu — the
 *   language combobox is an appearance row, the size control is the standard
 *   Font size ladder — while the Code-specific controls (line numbers, the
 *   character width combobox with presets + custom entry) ride the same pill.
 *   A stock handle drag reports its live `ch` count, presentation changes
 *   preserve the authored character measure, and the second click enters the
 *   existing CodeMirror document instead of placing a stock Text shape.
 *
 * Phase two exercises the babble Source editors that now share CodeMirror:
 * the Type babble V1's Source mode is a CodeMirror document with the
 * board-registry autocomplete as a real completion source.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
	clickAt,
	clickElement,
	delay,
	evaluate,
	key,
	localConsoleErrors,
	mouse,
	openApp,
	shortcut,
	startApp,
	typeSlowly,
	waitFor,
} from './browser_harness.mjs'
import { SHOTS, box, deselect, shot } from './block_journey_helpers.mjs'

const results = []

function check(id, label, observed, desired) {
	const ok = JSON.stringify(observed) === JSON.stringify(desired)
	results.push({ id, label, observed, desired, ok })
	process.stdout.write(
		`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
		+ (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
	)
	return ok
}

const codeFacts = (page) => evaluate(page, `JSON.stringify((() => {
	const shape = window.__systemsketch.editor.getCurrentPageShapes().find((item) => item.type === 'code')
	if (!shape) return null
	return { id: shape.id, x: shape.x, y: shape.y, props: shape.props }
})())`).then(JSON.parse)

async function clickCenter(page, selector) {
	const rect = await box(page, selector)
	await clickAt(page, rect.x + rect.width / 2, rect.y + rect.height / 2)
}

async function drag(page, from, to) {
	await mouse(page, 'mouseMoved', from.x, from.y)
	await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
	await mouse(page, 'mouseMoved', (from.x + to.x) / 2, (from.y + to.y) / 2, { buttons: 1 })
	await mouse(page, 'mouseMoved', to.x, to.y, { buttons: 1 })
	await mouse(page, 'mouseReleased', to.x, to.y)
}

async function main() {
	const app = await startApp({ label: 'code-block-primitive', width: 1440, height: 960 })
	const { page } = app
	try {
		await openApp(page, app.port, '')
		await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-app"] .tl-container\')', 'product canvas')
		await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')
		await delay(600)
		await evaluate(page, 'window.__systemsketch.editor.setCamera({ x: 0, y: 0, z: 1 }); true')

		// ---- The System family offers Code; drawing is the stock box gesture ----
		const familyBox = await box(page, '[data-testid="systemsketch-tool-system"]')
		await clickAt(page, familyBox.x + familyBox.width - 8, familyBox.y + familyBox.height / 2)
		await waitFor(page,
			'document.querySelector(\'[data-testid="systemsketch-tool-system"]\')?.getAttribute(\'aria-expanded\') === \'true\'',
			'System family menu open')
		const codeRow = JSON.parse(await evaluate(page, `(() => {
			const row = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
				.find((node) => node.textContent.trim().startsWith('Code'))
			if (!row) return null
			const rect = row.getBoundingClientRect()
			return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
		})()`))
		check('TOOL-1', 'the System family menu offers Code', codeRow !== null, true)
		await clickAt(page, codeRow.cx, codeRow.cy)
		await waitFor(page, 'window.__systemsketch.editor.getCurrentToolId() === \'code\'', 'Code tool armed')

		await drag(page, { x: 260, y: 240 }, { x: 820, y: 470 })
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.type === \'code\')', 'Code shape created')
		await waitFor(page, 'document.querySelector(\'.code-block-canvas .cm-editor\')', 'CodeMirror surface')
		let code = await codeFacts(page)
		check('CREATE-1', 'a new Code block is a Python CodeMirror document with line numbers, on the shared size style',
			{ language: code.props.language, size: code.props.size, lines: code.props.showLineNumbers, chars: code.props.characterWidth >= 16 },
			{ language: 'python', size: 'm', lines: true, chars: true })
		check('CREATE-2', 'the unselected-state body carries no persistent header chrome',
			await evaluate(page, 'document.querySelector(\'.code-block-canvas__header\') === null'), true)

		// ---- ONE shared selection pill; language is an ordinary appearance row ----
		await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-selection-menu"]\')?.dataset.visible === \'true\'', 'selection pill')
		check('MENU-1', 'the Code selection contributes to the ONE shared pill — no second floating menu',
			JSON.parse(await evaluate(page, `JSON.stringify({
				menus: document.querySelectorAll('[data-testid="systemsketch-selection-menu"]').length,
				legacy: document.querySelectorAll('.code-mini-menu').length,
				language: Boolean(document.querySelector('[data-testid="systemsketch-selection-menu"] .systemsketch-appearance__trigger[data-control="codeLanguage"]')),
				size: Boolean(document.querySelector('[data-testid="systemsketch-selection-menu"] .systemsketch-appearance__trigger[data-control="size"]')),
				lines: Boolean(document.querySelector('[data-testid="systemsketch-selection-menu"] [data-testid="code-line-numbers"]')),
				width: Boolean(document.querySelector('[data-testid="systemsketch-selection-menu"] [data-testid="code-width-trigger"]')),
			})`)),
			{ menus: 1, legacy: 0, language: true, size: true, lines: true, width: true })

		await clickCenter(page, '.systemsketch-appearance__trigger[data-control="codeLanguage"]')
		await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-appearance-panel-codeLanguage"]\')', 'language rows')
		await clickCenter(page, '[data-testid="systemsketch-appearance-panel-codeLanguage"] [data-value="javascript"]')
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === \'code\')?.props.language === \'javascript\'', 'JavaScript applied')
		check('LANG-1', 'the appearance language row drives the live CodeMirror mode',
			(await codeFacts(page)).props.language, 'javascript')
		await key(page, 'Escape', 'Escape')

		// Escape may clear the selection along with the popover; the pill only
		// exists for a selection, so re-assert it between control steps.
		const reselect = async () => {
			const facts = await codeFacts(page)
			await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(facts.id)}); true`)
			await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-selection-menu"]\')?.dataset.visible === \'true\'', 'selection pill back')
		}
		await reselect()

		// ---- The STANDARD Font size ladder is the Code block's size control ----
		const before = await codeFacts(page)
		await clickCenter(page, '.systemsketch-appearance__trigger[data-control="size"]')
		await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-appearance-panel-size"]\')', 'size ladder')
		check('SIZE-1', 'the size rows are the standard Small/Medium/Large/Extra large vocabulary',
			await evaluate(page, `Array.from(document.querySelectorAll('[data-testid="systemsketch-appearance-panel-size"] [data-control="size"]'))
				.map((node) => node.getAttribute('data-value')).join(',')`),
			's,m,l,xl')
		await shot(page, 'code-block-size-ladder.png')
		await clickCenter(page, '[data-testid="systemsketch-appearance-panel-size"] [data-value="xl"]')
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === \'code\')?.props.size === \'xl\'', 'size applied')
		code = await codeFacts(page)
		check('SIZE-2', 'a type-scale change preserves the authored character measure and re-derives pixels',
			{ chars: code.props.characterWidth === before.props.characterWidth, grew: code.props.w > before.props.w },
			{ chars: true, grew: true })
		await key(page, 'Escape', 'Escape')
		await reselect()

		// ---- Line numbers: toggle keeps ch, sheds only the gutter --------------
		const beforeGutter = await codeFacts(page)
		await clickCenter(page, '[data-testid="code-line-numbers"]')
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === \'code\')?.props.showLineNumbers === false', 'gutter off')
		code = await codeFacts(page)
		check('LINES-1', 'the gutter toggle keeps the character width while removing only the gutter',
			{ chars: code.props.characterWidth === beforeGutter.props.characterWidth, shrank: code.props.w < beforeGutter.props.w },
			{ chars: true, shrank: true })

		// ---- Width: a combobox of checked rows plus exact entry ---------------
		await clickCenter(page, '[data-testid="code-width-trigger"]')
		await waitFor(page, 'document.querySelector(\'[data-testid="systemsketch-appearance-panel-codeWidth"]\')', 'width rows')
		check('WIDTH-1', 'width offers the preset rows in the same list idiom as every other combobox',
			await evaluate(page, `Array.from(document.querySelectorAll('[data-testid="systemsketch-appearance-panel-codeWidth"] [data-control="codeWidth"]'))
				.map((node) => node.getAttribute('data-value')).join(',')`),
			'72,80,100')
		await shot(page, 'code-block-width-popover.png')
		await clickCenter(page, '[data-testid="systemsketch-appearance-panel-codeWidth"] [data-value="80"]')
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === \'code\')?.props.characterWidth === 80', '80 ch preset')

		// The popover stays open after a row choice (the appearance idiom); the
		// custom field lives in the same panel.
		await waitFor(page, 'document.querySelector(\'[data-testid="code-width-custom"]\')', 'custom width field')
		await clickCenter(page, '[data-testid="code-width-custom"]')
		await evaluate(page, 'document.querySelector(\'[data-testid="code-width-custom"]\').select(); true')
		await typeSlowly(page, '72')
		await key(page, 'Enter', 'Enter')
		await waitFor(page, 'window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === \'code\')?.props.characterWidth === 72', 'custom 72 ch')
		check('WIDTH-2', 'exact entry persists a 72-character measure', (await codeFacts(page)).props.characterWidth, 72)
		await key(page, 'Escape', 'Escape')
		await reselect()

		// ---- Stock resize with a live `ch` readout at the handle ---------------
		// A 72-ch xl block runs under the shape-facts panel at the window's
		// bottom-right; pan and zoom it clear so the corner handle (and the ch
		// HUD beside it) are genuinely on screen.
		code = await codeFacts(page)
		await evaluate(page, `window.__systemsketch.editor.setCamera({ x: ${Math.round(80 - code.x * 0.7) / 0.7}, y: ${Math.round(140 - code.y * 0.7) / 0.7}, z: 0.7 }); true`)
		await delay(150)
		const handle = JSON.parse(await evaluate(page, `(() => {
			const bounds = window.__systemsketch.editor.getSelectionRotatedScreenBounds()
			return JSON.stringify(bounds && { x: bounds.x + bounds.w, y: bounds.y + bounds.h })
		})()`))
		check('RESIZE-1', 'the selection exposes stock resize bounds', handle !== null, true)
		await mouse(page, 'mouseMoved', handle.x, handle.y)
		await mouse(page, 'mousePressed', handle.x, handle.y, { buttons: 1 })
		for (let step = 1; step <= 8; step++) {
			await mouse(page, 'mouseMoved', handle.x + step * 10, handle.y + step * 2, { buttons: 1 })
			await delay(30)
		}
		await waitFor(page, 'document.querySelector(\'.code-resize-hud\')?.textContent.includes(\'ch\')', 'live ch readout')
		check('RESIZE-2', 'the drag runs in tldraw\'s own select.resizing state',
			await evaluate(page, 'window.__systemsketch.editor.getPath()'), 'select.resizing')
		await shot(page, 'code-block-resize-hud.png')
		await mouse(page, 'mouseReleased', handle.x + 80, handle.y + 14)
		await waitFor(page, 'window.__systemsketch.editor.getPath() === \'select.idle\'', 'resize done')
		code = await codeFacts(page)
		check('RESIZE-3', 'a freely dragged wider shape recalculates its character width', code.props.characterWidth > 72, true)

		// ---- Second click enters the existing CodeMirror document --------------
		const canvasBox = await box(page, '.code-block-canvas')
		const textShapesBefore = await evaluate(page, 'window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === \'text\').length')
		await clickAt(page, canvasBox.x + 200, canvasBox.y + 60)
		await waitFor(page, `window.__systemsketch.editor.getEditingShapeId() === ${JSON.stringify(code.id)}`, 'CodeMirror edit entry')
		await evaluate(page, 'document.querySelector(\'.code-block-canvas .cm-content\')?.focus(); true')
		await key(page, 'End', 'End')
		await typeSlowly(page, ' // smoke')
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(code.id)})?.props.code.includes('// smoke')`, 'CodeMirror text commit')
		check('EDIT-1', 'the click edits the existing Code block without placing a stock Text shape',
			await evaluate(page, 'window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === \'text\').length'),
			textShapesBefore)
		await deselect(page, { x: 1200, y: 850 })
		await shot(page, 'code-block-primitive-live.png')

		check('CLEAN-CODE', 'the Code journey raised no local console errors', localConsoleErrors(page), [])

		// ---- Phase two: the babble Source editors share the same CodeMirror ----
		const babbleId = await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			const { createShapeId } = window.__systemsketch.tldraw ?? {}
			const poseId = 'shape:smoke-pose'
			const babbleId = 'shape:smoke-babble'
			editor.createShapes([
				{ id: poseId, type: 'block', x: 1400, y: 120, props: { blockType: 'type', view: 'port', title: 'Pose', attributeSource: 'x: float\\ny: float' } },
				{ id: babbleId, type: 'block', x: 900, y: 120, props: { blockType: 'type', view: 'port', title: 'EstimateOut', attributeSource: 'pose: Pose' }, meta: { babbleVariant: 1 } },
			])
			editor.setCamera({ x: -820, y: -40, z: 1 })
			editor.select(babbleId)
			return babbleId
		})()`)
		await waitFor(page, 'document.querySelector(\'[data-testid="type-babble-v1"]\')', 'babble V1 region')
		await clickElement(page, '.TypeBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"] .cm-editor\')', 'babble Source is CodeMirror')
		check('BABBLE-1', 'the Source editor takes the cursor immediately',
			await evaluate(page, 'document.activeElement?.closest(\'[data-testid="type-babble-v1-source"]\') !== null'), true)
		check('BABBLE-2', 'the grammar highlight paints through CodeMirror decorations',
			await evaluate(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"] .cm-line .TypeBabble-name\') !== null'), true)

		// The board-registry autocomplete is a real completion source now: type a
		// fresh `name: ` line, query "Po", accept the board type with Tab.
		await evaluate(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"] .cm-content\')?.focus(); true')
		await shortcut(page, 'End', 'End', 2)
		// A real Enter keypress, not an inserted '\n' — contenteditable turns an
		// inserted literal newline into a stray trailing break.
		await key(page, 'Enter', 'Enter')
		await typeSlowly(page, 'next: Po')
		await waitFor(page, 'document.querySelector(\'.cm-tooltip-autocomplete\')', 'completion tooltip')
		check('BABBLE-3', 'the completion lists the live board type with its kind pill and the browse escalation',
			JSON.parse(await evaluate(page, `JSON.stringify((() => {
				const rows = Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li'))
				return {
					pose: rows.some((row) => row.querySelector('.cm-completionLabel')?.textContent === 'Pose'
						&& row.querySelector('.TypeNameAutocomplete-pill--board-type') !== null),
					browse: rows.some((row) => (row.querySelector('.cm-completionLabel')?.textContent ?? '').includes('show every type on this board')),
				}
			})())`)),
			{ pose: true, browse: true })
		await shot(page, 'babble-cm-autocomplete.png')
		await key(page, 'Tab', 'Tab')
		await delay(150)
		check('BABBLE-4', 'Tab accepts the suggestion into the document',
			await evaluate(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"] .cm-content\').textContent.includes(\'next: Pose\')'), true)

		// Click-elsewhere commits the draft as one history step.
		await clickAt(page, 400, 850)
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(babbleId)})?.props.attributeSource === 'pose: Pose\\nnext: Pose'`, 'babble commit')
		check('BABBLE-5', 'clicking outside commits the CodeMirror draft',
			await evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(babbleId)})?.props.attributeSource`),
			'pose: Pose\nnext: Pose')

		// Escape cancels: reopen, mutate, Escape, source untouched.
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(babbleId)}); true`)
		await clickElement(page, '.TypeBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"] .cm-editor\')', 'babble Source reopened')
		await typeSlowly(page, 'zzz')
		await key(page, 'Escape', 'Escape')
		await delay(120)
		await key(page, 'Escape', 'Escape')
		await waitFor(page, 'document.querySelector(\'[data-testid="type-babble-v1-source"]\') === null', 'Source closed')
		check('BABBLE-6', 'Escape discards the draft without writing it',
			await evaluate(page, `window.__systemsketch.editor.getShape(${JSON.stringify(babbleId)})?.props.attributeSource`),
			'pose: Pose\nnext: Pose')

		check('CLEAN-BABBLE', 'the babble journey raised no local console errors', localConsoleErrors(page), [])

		const failed = results.filter((result) => !result.ok)
		process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
		await writeFile(join(SHOTS, 'code-block-primitive.json'), JSON.stringify(results, null, 2))
		if (failed.length > 0) process.exitCode = 1
	} finally {
		await app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error}\n`)
	process.exitCode = 1
})
