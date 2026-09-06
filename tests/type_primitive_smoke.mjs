#!/usr/bin/env node
/**
 * The Type primitive, driven in a real browser.
 *
 *   The Type tool draws a Port-view Block with a compact attribute tree; a
 *   pasted `class Foo(NamedTuple):` body loses its wrapper and docstring but
 *   keeps its fields; every row opens the same ordinary textarea over the
 *   whole source, with native cursor placement, paste, blur-to-commit,
 *   Escape-to-cancel, and undo; nested branches fold on click and keep a
 *   folded chevron visible; T stays the stock text tool; and the product
 *   toolbar, System family slot, and Dev Hub gutter switch all carry Type.
 *
 * Runs in the Block Dev composition on a scratch board for the tool and
 * editing surface, then switches to the product composition (still on the
 * scratch files root) for the toolbar, palette, and Dev Hub checks.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
	clickAt,
	clickElement,
	delay,
	drag,
	evaluate,
	hoverElement,
	key,
	localConsoleErrors,
	mouse,
	openApp,
	shortcut,
	startApp,
	waitFor,
} from './browser_harness.mjs'
import { SHOTS, box, deselect, shot } from './block_journey_helpers.mjs'

// `position` sits deeper than the class body's own learned indent, so it
// nests under `pose` — exercising fold/unfold alongside the wrapper strip.
const NAMED_TUPLE_SOURCE = 'class EstimatePairOut(NamedTuple):\n    """A pose and a confidence score.\n\n    The prose above must not become a fake attribute.\n    """\n    pose: Pose\n        position: Position\n    quality: float = 1.0'
const POSE_ROW = '.TypeAttributeRegion-tree > .TypeAttributeRegion-row[data-has-children]:first-child'

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

const shapeFacts = (page, id) => evaluate(page, `JSON.stringify((() => {
	const shape = window.__systemsketch.editor.getShape(${JSON.stringify(id)})
	if (!shape) return null
	return {
		type: shape.type, blockType: shape.props.blockType, view: shape.props.view,
		icon: shape.props.icon, source: shape.props.attributeSource,
		x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h,
		inputs: shape.props.inputs.length, outputs: shape.props.outputs.length,
	}
})())`).then(JSON.parse)

const regionText = (page) => evaluate(page,
	'document.querySelector(\'[data-testid="type-attribute-region"]\')?.textContent ?? null')

const chevronVisible = (page, rowSelector) => evaluate(page,
	`document.querySelector(${JSON.stringify(`${rowSelector} > .TypeAttributeRegion-chevron`)})?.dataset.visible ?? null`)

/** Draw a Type from an arbitrary rectangle and name it, returning its shape id. */
async function drawType(page, from, to, title) {
	await drag(page, from, to)
	await waitFor(page, 'document.querySelector(\'[data-testid=block-inline-title]\')', 'new Type title editor')
	await page.send('Input.insertText', { text: title })
	await key(page, 'Enter', 'Enter')
	await waitFor(page, 'document.querySelector(\'[data-testid=type-attribute-region]\')', 'compact Type attributes')
	return evaluate(page, 'window.__systemsketch.editor.getSelectedShapeIds()[0]')
}

async function main() {
	const app = await startApp({ label: 'type-primitive', width: 1440, height: 960 })
	const { page } = app
	try {
		// ---- Block Dev: the tool, the fixed size, and the editing surface ----
		await openApp(page, app.port, '?preset=block-dev')
		await waitFor(page,
			'document.querySelector(\'[data-development-profile="block-dev"] .tl-container\')',
			'Block Dev canvas')
		await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')
		await waitFor(page, 'document.querySelector(\'[data-testid="tools.type"]\')', 'Type dev toolbar button')
		await deselect(page, { x: 1000, y: 900 })

		// A fixed-size box drawn from an arbitrary rectangle keeps the drag's
		// centre, the same correction the Pill tool makes for the same reason.
		await clickElement(page, '[data-testid="tools.type"]')
		const toolAfterSelect = await evaluate(page, 'window.__systemsketch.editor.getCurrentToolId()')
		// The drag rectangle's centre in PAGE space — not screen pixels, which
		// the camera may have panned or zoomed away from — is what a fixed-size
		// Type box should stay centred on.
		const expectedCentre = JSON.parse(await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			const a = editor.screenToPage({ x: 300, y: 250 })
			const b = editor.screenToPage({ x: 500, y: 450 })
			return JSON.stringify({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
		})()`))
		const typeId = await drawType(page, { x: 300, y: 250 }, { x: 500, y: 450 }, 'EstimatePairOut')

		check('TOOL-1', 'clicking the Type tool arms it', toolAfterSelect, 'type')
		const created = await shapeFacts(page, typeId)
		check('CREATE-1', 'the drawn Type is the canonical Block primitive, compact and portless',
			{ type: created.type, blockType: created.blockType, view: created.view, icon: created.icon, source: created.source, w: created.w, h: created.h, inputs: created.inputs, outputs: created.outputs },
			{ type: 'block', blockType: 'type', view: 'port', icon: 'Braces', source: 'field: Type', w: 380, h: 264, inputs: 0, outputs: 0 })
		check('CREATE-2', "a fixed-size Type keeps the drag's centre instead of its top-left corner",
			{ dx: Math.round(created.x + created.w / 2 - expectedCentre.x), dy: Math.round(created.y + created.h / 2 - expectedCentre.y) },
			{ dx: 0, dy: 0 })

		// ---- Click a row: one ordinary textarea, cursor ready immediately -----
		await clickElement(page, '.TypeAttributeRegion-line')
		await waitFor(page, 'document.querySelector(\'[data-testid=type-attribute-source]\')', 'Type source textarea')
		check('EDIT-1', 'the opened textarea takes the cursor immediately',
			await evaluate(page, 'document.activeElement === document.querySelector(\'[data-testid="type-attribute-source"]\')'), true)
		await shortcut(page, 'a', 'KeyA', 2)
		await page.send('Input.insertText', { text: NAMED_TUPLE_SOURCE })

		// ---- Escape discards the draft; the committed source is untouched -----
		await key(page, 'Escape', 'Escape')
		check('CANCEL-1', 'Escape closes the editor without writing the draft', {
			closed: await evaluate(page, 'document.querySelector("[data-testid=type-attribute-source]") === null'),
			source: (await shapeFacts(page, typeId)).source,
		}, { closed: true, source: 'field: Type' })

		// ---- Re-open, paste for real, blur to commit ---------------------------
		await clickElement(page, '.TypeAttributeRegion-line')
		await waitFor(page, 'document.querySelector(\'[data-testid=type-attribute-source]\')', 'Type source textarea reopened')
		await shortcut(page, 'a', 'KeyA', 2)
		await page.send('Input.insertText', { text: NAMED_TUPLE_SOURCE })
		await key(page, 'Tab', 'Tab')
		await waitFor(page,
			`window.__systemsketch.editor.getShape(${JSON.stringify(typeId)})?.props.attributeSource === ${JSON.stringify(NAMED_TUPLE_SOURCE)}`,
			'source edit commit')
		check('COMMIT-1', 'blur commits the exact pasted source, unmodified', (await shapeFacts(page, typeId)).source, NAMED_TUPLE_SOURCE)
		check('COMMIT-2', 'blur returns to the compact projection', await evaluate(page, 'document.querySelector("[data-testid=type-attribute-source]")'), null)
		const parsedText = await regionText(page)
		check('PARSE-1', 'the class wrapper and its docstring never become attribute rows',
			(parsedText ?? '').includes('NamedTuple') || (parsedText ?? '').includes('confidence score'), false)
		check('PARSE-2', 'the compact tree reads name, type, and default exactly as written',
			['pose', 'Pose', 'position', 'Position', 'quality', 'float', '1.0'].every((token) => (parsedText ?? '').includes(token)), true)
		await shot(page, 'type-primitive-parsed.png')

		// ---- A branch's chevron is hidden until hover; folded stays visible ----
		await mouse(page, 'mouseMoved', 60, 60)
		await delay(120)
		check('FOLD-1', 'an unfolded branch hides its chevron until the row is hovered', await chevronVisible(page, POSE_ROW), null)
		await hoverElement(page, `${POSE_ROW} > .TypeAttributeRegion-line`)
		check('FOLD-2', 'hovering the row reveals its chevron', await chevronVisible(page, POSE_ROW), 'true')
		await clickElement(page, `${POSE_ROW} > .TypeAttributeRegion-chevron`)
		await waitFor(page, `document.querySelector(${JSON.stringify(POSE_ROW)})?.dataset.folded === 'true'`, 'folded attribute')
		await mouse(page, 'mouseMoved', 60, 60)
		await delay(120)
		check('FOLD-3', 'a folded branch keeps its chevron visible even without hover', await chevronVisible(page, POSE_ROW), 'true')
		const foldedText = await regionText(page)
		check('FOLD-4', 'folding hides the nested rows but leaves the source untouched',
			{ text: (foldedText ?? '').includes('Position'), source: (await shapeFacts(page, typeId)).source },
			{ text: false, source: NAMED_TUPLE_SOURCE })
		await clickElement(page, `${POSE_ROW} > .TypeAttributeRegion-chevron`)
		await waitFor(page, `document.querySelector(${JSON.stringify(POSE_ROW)})?.dataset.folded === undefined`, 'reopened attribute')
		const reopenedText = await regionText(page)
		check('FOLD-5', 'reopening restores the nested row', (reopenedText ?? '').includes('Position'), true)

		// ---- One committed edit is one undo step -------------------------------
		await shortcut(page, 'z', 'KeyZ', 2)
		await delay(200)
		check('UNDO-1', 'one Ctrl+Z restores the whole pasted body in a single step', (await shapeFacts(page, typeId)).source, 'field: Type')
		await shortcut(page, 'z', 'KeyZ', 10)
		await delay(200)
		check('REDO-1', 'redo restores the pasted body', (await shapeFacts(page, typeId)).source, NAMED_TUPLE_SOURCE)

		// ---- T remains the stock Text tool; Type carries no shortcut -----------
		await deselect(page, { x: 1000, y: 900 })
		await shortcut(page, 't', 'KeyT')
		check('SHORTCUT-1', 'T still arms the stock text tool, not Type', await evaluate(page, 'window.__systemsketch.editor.getCurrentToolId()'), 'text')
		await key(page, 'Escape', 'Escape')

		check('CLEAN-DEV', 'the Block Dev journey raised no local console errors', localConsoleErrors(page), [])

		// ---- Product: toolbar, System family slot, palette, Dev Hub -----------
		await openApp(page, app.port, '')
		await waitFor(page, 'document.querySelector(\'.tl-container\')', 'product canvas')
		await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'product seam')
		await delay(500)

		const familyBox = await box(page, '[data-testid="systemsketch-tool-system"]')
		await clickAt(page, familyBox.x + familyBox.width - 8, familyBox.y + familyBox.height / 2)
		await waitFor(page,
			'document.querySelector(\'[data-testid="systemsketch-tool-system"]\')?.getAttribute(\'aria-expanded\') === \'true\'',
			'System family menu open')
		const typeRow = JSON.parse(await evaluate(page, `(() => {
			const row = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
				.find((node) => node.textContent.trim().startsWith('Type'))
			if (!row) return null
			const rect = row.getBoundingClientRect()
			return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, noShortcut: !row.querySelector('kbd') })
		})()`))
		check('PALETTE-1', 'the System family menu offers Type with no shortcut kbd hint', Boolean(typeRow?.noShortcut), true)
		await clickAt(page, typeRow.cx, typeRow.cy)
		await waitFor(page, '!document.querySelector(\'.systemsketch-tool-menu\')', 'menu closed after choosing Type')
		check('PROD-1', 'choosing Type from the family menu arms the Type tool', await evaluate(page, 'window.__systemsketch.editor.getCurrentToolId()'), 'type')

		const productTypeId = await drawType(page, { x: 700, y: 460 }, { x: 900, y: 620 }, 'ProductType')
		check('PROD-2', 'the product Type is the same primitive as the Block Dev one', (await shapeFacts(page, productTypeId)).blockType, 'type')
		check('PROD-3', 'the family slot remembers Type as the last system tool, and rests once the draw is done',
			JSON.parse(await evaluate(page, `JSON.stringify([
				JSON.parse(localStorage.getItem('systemsketch.toolbar-preferences.v1') ?? '{}').lastSystemTool ?? null,
				document.querySelector('[data-testid="systemsketch-tool-system"]')?.getAttribute('aria-pressed') ?? null,
			])`)),
			['type', 'false'])
		await deselect(page, { x: 1300, y: 850 })
		await shot(page, 'type-primitive-product.png')

		// ---- Dev Hub: the chevron-placement switch on the live renderer -------
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(productTypeId)}); true`)
		await clickElement(page, '.systemsketch-dev-trigger')
		await waitFor(page, 'document.querySelector(\'[data-testid=systemsketch-dev-type-chevron-gutter]\')', 'Dev chevron preference')
		const inlinePlacement = JSON.parse(await evaluate(page, `JSON.stringify((() => {
			const region = document.querySelector('[data-testid=type-attribute-region]')
			return { gutter: region?.classList.contains('TypeAttributeRegion--gutter') ?? null, inline: region?.classList.contains('TypeAttributeRegion--inline') ?? null }
		})())`))
		check('GUTTER-0', 'the region starts in the default inline placement', inlinePlacement, { gutter: false, inline: true })
		await clickElement(page, '[data-testid="systemsketch-dev-type-chevron-gutter"]')
		await waitFor(page, 'document.querySelector(\'[data-testid=type-attribute-region]\')?.classList.contains(\'TypeAttributeRegion--gutter\')', 'gutter placement')
		const gutterPlacement = JSON.parse(await evaluate(page, `JSON.stringify((() => {
			const region = document.querySelector('[data-testid=type-attribute-region]')
			const chevron = region?.querySelector('.TypeAttributeRegion-chevron')
			const line = region?.querySelector('.TypeAttributeRegion-line')
			return {
				gutter: region?.classList.contains('TypeAttributeRegion--gutter'),
				chevronLeftOfLine: Math.round(chevron?.getBoundingClientRect().left ?? 0) < Math.round(line?.getBoundingClientRect().left ?? 0),
				remembered: JSON.parse(localStorage.getItem('systemsketch.type-attributes.v1') ?? '{}').chevronPlacement,
			}
		})())`))
		check('GUTTER-1', 'the gutter switch fixes every chevron to one column left of the text, and is remembered',
			gutterPlacement, { gutter: true, chevronLeftOfLine: true, remembered: 'gutter' })
		await clickElement(page, '[data-testid="systemsketch-dev-type-chevron-gutter"]')
		await waitFor(page, 'document.querySelector(\'[data-testid=type-attribute-region]\')?.classList.contains(\'TypeAttributeRegion--inline\')', 'inline placement restored')

		check('CLEAN-PROD', 'the product journey raised no local console errors', localConsoleErrors(page), [])

		const failed = results.filter((result) => !result.ok)
		process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
		await writeFile(join(SHOTS, 'type-primitive.json'), JSON.stringify(results, null, 2))
		if (failed.length > 0) process.exitCode = 1
	} finally {
		await app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error}\n`)
	process.exitCode = 1
})
