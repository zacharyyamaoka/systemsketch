#!/usr/bin/env node
/**
 * The Port text-authoring babble (dev-only, 4 variants), driven in a real
 * browser: create a Block, toggle into text mode (or — V4 — there is no
 * toggle, it is always live), edit, commit, and confirm the real
 * `props.inputs`/`outputs` changed. Never touches Zach's real board — every
 * shape here is created fresh on a scratch app instance.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
	clickElement,
	delay,
	evaluate,
	key,
	localConsoleErrors,
	openApp,
	shortcut,
	startApp,
	typeSlowly,
	waitFor,
} from './browser_harness.mjs'
import { SHOTS, deselect, shot } from './block_journey_helpers.mjs'

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

const portFacts = (page, id) => evaluate(page, `JSON.stringify((() => {
	const shape = window.__systemsketch.editor.getShape(${JSON.stringify(id)})
	if (!shape) return null
	return {
		inputs: shape.props.inputs.map((p) => ({ id: p.id, name: p.name, type: p.type, defaultValue: p.defaultValue ?? null, row: p.row ?? null })),
		outputs: shape.props.outputs.map((p) => ({ id: p.id, name: p.name, type: p.type, row: p.row ?? null, branch: p.branch ?? null })),
	}
})())`).then(JSON.parse)

async function selectAllAndType(page, text) {
	await shortcut(page, 'a', 'KeyA', 2)
	await page.send('Input.insertText', { text })
}

async function main() {
	const app = await startApp({ label: 'port-text-babble', width: 1440, height: 1000 })
	const { page } = app
	try {
		await openApp(page, app.port, '')
		await waitFor(page, 'document.querySelector(\'.tl-container\')', 'product canvas')
		await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')

		const ids = JSON.parse(await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			// Each shape needs its own title AND definitionId: this app's Definition
			// Linking feature (src/blocks/definitions/definitionLinking.ts) treats
			// same-titled, same-shaped Blocks with no explicit definitionId as
			// occurrences of ONE definition and keeps their bodies in sync -- which
			// would make editing one variant's ports silently rewrite the others.
			const mk = (idSuffix, x, variant) => ({
				id: 'shape:port-text-' + idSuffix,
				type: 'block',
				x,
				y: 120,
				props: {
					title: 'Sample' + idSuffix, blockType: '', view: 'port', definitionId: 'def-' + idSuffix,
					inputs: [
						{ id: 'in_1', name: 'pose', type: 'Pose', visible: true, defaultValue: '10' },
						{ id: 'in_2', name: 'window', type: 'int', visible: true },
					],
					outputs: [
						{ id: 'out_1', name: 'result', type: 'float', visible: true },
					],
				},
				meta: { portTextBabbleVariant: variant },
			})
			const shapes = [mk('v1', 100, 1), mk('v2', 560, 2), mk('v3', 1020, 3), mk('v4', 1480, 4)]
			editor.createShapes(shapes)
			editor.setCamera({ x: 0, y: 0, z: 0.7 })
			return JSON.stringify(shapes.map((s) => s.id))
		})()`))
		const [v1Id, v2Id, v3Id, v4Id] = ids

		// A CodeMirror doc is not a bare textarea: Tab is bound to accept-completion
		// (falling through to indent-with-Tab, never a blur). Commit only ever
		// happens on real focus loss — a click outside the editor's own mount, the
		// same "clicked outside" path `usePortTextToggleEditor` documents.
		const commitByClickingAway = () => deselect(page, { x: 1300, y: 900 })

		// ---- V1: two-lane grammar, toggle UI/Source, rename + add a branch ----
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v1Id)}); true`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v1"]\')', 'V1 region')
		check('V1-READ', 'the read view shows both lanes with a connection bullet', await evaluate(page,
			'document.querySelector(\'[data-testid="port-text-babble-v1"]\').textContent.includes("pose") '
			+ '&& document.querySelector(\'[data-testid="port-text-babble-v1"]\').textContent.includes("result")'), true)
		await clickElement(page, '[data-testid="port-text-babble-v1"] .PortTextBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v1-source"] .cm-editor\')', 'V1 Source is CodeMirror')
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v1-source"] .cm-content\')?.focus(); true')
		// Rename `pose` -> `transform` (same position => same id), add a second
		// output arm named `error` carrying `message: str`.
		await selectAllAndType(page, 'transform: Pose = 10\nwindow: int\n=== outputs ===\nresult: float\n--- error\nmessage: str')
		await commitByClickingAway()
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(v1Id)})?.props.inputs[0]?.name === 'transform'`, 'V1 commit')
		const v1After = await portFacts(page, v1Id)
		check('V1-RENAME', 'a same-position retype keeps the old port id (cable-preserving rename)',
			v1After.inputs.find((p) => p.name === 'transform')?.id, 'in_1')
		check('V1-BRANCH', 'a named divider on the output lane opens a new branch, and the label itself is not persisted',
			v1After.outputs.map((p) => [p.name, p.branch]), [['result', null], ['message', 1]])
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v1Id)}); true`)
		await shot(page, 'port-text-babble-v1.png')

		// ---- V1 autocomplete: the shared type-name completion source works ----
		await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			editor.createShapes([{ id: 'shape:port-text-pose-type', type: 'block', x: 100, y: 620, props: { title: 'Pose', blockType: 'type', view: 'port', attributeSource: 'x: float\\ny: float' } }])
			editor.select(${JSON.stringify(v1Id)})
			return true
		})()`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v1"]\')', 'V1 region reselected')
		await clickElement(page, '[data-testid="port-text-babble-v1"] .PortTextBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v1-source"] .cm-editor\')', 'V1 Source reopened')
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v1-source"] .cm-content\')?.focus(); true')
		await shortcut(page, 'End', 'End', 2)
		await key(page, 'Enter', 'Enter')
		await typeSlowly(page, 'next: Po')
		await waitFor(page, 'document.querySelector(\'.cm-tooltip-autocomplete\')', 'V1 completion tooltip')
		check('V1-AUTOCOMPLETE', 'the live board-type registry surfaces Pose with its kind pill', await evaluate(page, `(() => {
			const rows = Array.from(document.querySelectorAll('.cm-tooltip-autocomplete li'))
			return rows.some((row) => row.querySelector('.cm-completionLabel')?.textContent === 'Pose'
				&& row.querySelector('.TypeNameAutocomplete-pill--board-type') !== null)
		})()`), true)
		await key(page, 'Escape', 'Escape')
		await key(page, 'Escape', 'Escape')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v1-source"]\') === null', 'V1 Escape cancels back to UI')

		// ---- V2: single flat list with >/< sigils, shared row counter --------
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v2Id)}); true`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v2"]\')', 'V2 region')
		await clickElement(page, '[data-testid="port-text-babble-v2"] .PortTextBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v2-source"] .cm-editor\')', 'V2 Source is CodeMirror')
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v2-source"] .cm-content\')?.focus(); true')
		await selectAllAndType(page, '> pose: Pose = 10\n---\n> window: int\n< result: float\n< extra: str')
		await commitByClickingAway()
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(v2Id)})?.props.outputs.find((p) => p.name === 'extra')`, 'V2 commit')
		const v2After = await portFacts(page, v2Id)
		check('V2-SHARED-ROW', 'an input and an output written between the same dividers share one row',
			[v2After.inputs.find((p) => p.name === 'window')?.row, v2After.outputs.find((p) => p.name === 'result')?.row],
			[v2After.inputs.find((p) => p.name === 'window')?.row, v2After.inputs.find((p) => p.name === 'window')?.row])
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v2Id)}); true`)
		await shot(page, 'port-text-babble-v2.png')

		// ---- V3: inputs:/outputs: keywords, strict default-expr flag ---------
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v3Id)}); true`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v3"]\')', 'V3 region')
		check('V3-COLUMNS', 'the read view lays out two columns for the inline port layout', await evaluate(page,
			'document.querySelectorAll(\'[data-testid="port-text-babble-v3"] .PortTextBabbleV3-column\').length'), 2)
		await clickElement(page, '[data-testid="port-text-babble-v3"] .PortTextBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v3-source"] .cm-editor\')', 'V3 Source is CodeMirror')
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v3-source"] .cm-content\')?.focus(); true')
		await selectAllAndType(page, 'inputs:\npose: Pose = 10\nrandom: MyComponent = Component(var=0.1)\noutputs:\nresult: float')
		check('V3-NO-DIAGNOSTIC-FOR-VALID', 'a restricted-subset default raises no diagnostic',
			await evaluate(page, 'document.querySelector(\'[data-testid="port-text-diagnostics"]\') === null'), true)
		await commitByClickingAway()
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(v3Id)})?.props.inputs.find((p) => p.name === 'random')`, 'V3 commit')
		const v3After = await portFacts(page, v3Id)
		check('V3-CALL-DEFAULT', 'a call-shaped default in the restricted subset is stored verbatim',
			v3After.inputs.find((p) => p.name === 'random')?.defaultValue, 'Component(var=0.1)')

		// Now break the subset and confirm it is flagged live but still kept.
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v3Id)}); true`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v3"]\')', 'V3 region reselected')
		await clickElement(page, '[data-testid="port-text-babble-v3"] .PortTextBabbleV1-toggle button:nth-child(2)')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v3-source"] .cm-editor\')', 'V3 Source reopened')
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v3-source"] .cm-content\')?.focus(); true')
		// `1 + 2` is arithmetic, not a literal or a keyword call — outside the
		// restricted subset (a bare no-arg call like `f()` is deliberately still
		// IN the subset: it is a call with zero literal keyword args, no less
		// restricted than `Component(var=0.1)` with one).
		await selectAllAndType(page, 'inputs:\npose: Pose = 1 + 2\noutputs:\nresult: float')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-diagnostics"]\') !== null', 'V3 live diagnostic')
		check('V3-DIAGNOSTIC-LIVE', 'an out-of-subset expression is flagged live, before commit', await evaluate(page,
			'document.querySelector(\'[data-testid="port-text-babble-v3-source"] .cm-line .PortTextBabble-invalidValue\') !== null'), true)
		await commitByClickingAway()
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(v3Id)})?.props.inputs.find((p) => p.name === 'pose')?.defaultValue === '1 + 2'`, 'V3 flagged commit')
		check('V3-KEEP-INVALID', 'the flagged default is still written verbatim, never dropped',
			(await portFacts(page, v3Id)).inputs.find((p) => p.name === 'pose')?.defaultValue, '1 + 2')
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v3Id)}); true`)
		await shot(page, 'port-text-babble-v3.png')

		// ---- V4: always-live hybrid, no toggle at all -------------------------
		await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(v4Id)}); true`)
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v4"]\')', 'V4 region')
		check('V4-NO-TOGGLE', 'V4 has no UI/Source toggle — the source editor is already there',
			await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v4"] .PortTextBabbleV1-toggle\') === null '
				+ '&& document.querySelector(\'[data-testid="port-text-babble-v4-source"] .cm-editor\') !== null'), true)
		await evaluate(page, 'document.querySelector(\'[data-testid="port-text-babble-v4-source"] .cm-content\')?.focus(); true')
		await selectAllAndType(page, 'pose: Pose = 10\nwindow: int\nnewinput: str\n=== outputs ===\nresult: float')
		await waitFor(page, 'document.querySelector(\'[data-testid="port-text-babble-v4-preview"]\')?.textContent.includes(\'newinput\')', 'V4 live preview updates from the draft')
		check('V4-LIVE-BEFORE-COMMIT', 'the preview reflects the draft before any blur/commit',
			JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape(${JSON.stringify(v4Id)}).props.inputs.map((p) => p.name))`)),
			['pose', 'window'])
		await deselect(page, { x: 1300, y: 900 })
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(v4Id)})?.props.inputs.find((p) => p.name === 'newinput')`, 'V4 commit on click-away')
		check('V4-COMMIT', 'clicking away commits the live draft into real ports',
			(await portFacts(page, v4Id)).inputs.map((p) => p.name), ['pose', 'window', 'newinput'])
		await shot(page, 'port-text-babble-v4.png')

		check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

		const failed = results.filter((result) => !result.ok)
		process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
		await writeFile(join(SHOTS, 'port-text-babble.json'), JSON.stringify(results, null, 2))
		if (failed.length > 0) process.exitCode = 1
	} finally {
		await app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error}\n`)
	process.exitCode = 1
})
