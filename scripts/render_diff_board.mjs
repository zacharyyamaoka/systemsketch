#!/usr/bin/env node
/**
 * Author a plain board recipe through the real SystemSketch editor, save it,
 * cold-reopen it, and capture what the app actually drew.
 *
 * This exists because "the app is the renderer" has to be literally true for
 * the conformance diff: the report's captures may not come from a second
 * drawing of the same data. A projector emits an ordinary `.systemsketch`
 * recipe — Blocks, ports, cables, and a `state` on the ones a lens marks — and
 * this drives the product's own canvas, autosave and reopen path over CDP,
 * exactly the way a smoke test does.
 *
 * It is deliberately NOT the review-fixture helper. That one requires numbered
 * cue cards and a PASS WHEN card, because its output is a board a person is
 * about to be asked to drive. This one's output is a picture of a diff, and a
 * cue card in it would be a second rendering thing to maintain.
 *
 *   node scripts/render_diff_board.mjs \
 *     --recipe /tmp/diff-03.json \
 *     --output /tmp/diff-03.systemsketch \
 *     --screenshot /tmp/diff-03.png \
 *     [--variant was-now] [--width 1700] [--height 1000] [--pad 64]
 *
 * `--variant` sets the diff paint variant the way the app itself does, through
 * the localStorage preference, before the first paint — so the capture is the
 * product's own switch and not a test-only code path.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import {
	delay,
	evaluate,
	localConsoleErrors,
	openApp,
	startApp,
	waitFor,
} from '../tests/browser_harness.mjs'

const USAGE = 'Usage: node render_diff_board.mjs --recipe R.json --output B.systemsketch '
	+ '[--screenshot B.png] [--variant NAME] [--width N] [--height N] [--pad N]'

function parseArguments(argv) {
	const result = { width: 1700, height: 1000, pad: 64 }
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index]
		const takesValue = ['--recipe', '--output', '--screenshot', '--variant', '--width', '--height', '--pad']
		if (flag === '--help' || flag === '-h') {
			process.stdout.write(`${USAGE}\n`)
			process.exit(0)
		}
		if (!takesValue.includes(flag)) throw new Error(`unknown argument: ${flag}\n${USAGE}`)
		const value = argv[index + 1]
		if (!value) throw new Error(`${flag} requires a value\n${USAGE}`)
		const key = flag.slice(2)
		result[key] = ['width', 'height', 'pad'].includes(key) ? Number(value) : value
		index += 1
	}
	if (!result.recipe || !result.output) throw new Error(USAGE)
	result.screenshot ??= result.output.replace(/\.systemsketch$/i, '.png')
	return result
}

async function atomicWrite(path, bytes) {
	await mkdir(dirname(path), { recursive: true })
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
	await writeFile(temporary, bytes)
	await rename(temporary, path)
}

/** The product's own dirty-document guard may raise a beforeunload dialog. */
async function guardedReload(page, timeoutMs = 20000) {
	const firstEvent = page.events.length
	let settled = false
	let failure
	const reload = page.send('Page.reload', { ignoreCache: true })
		.catch((cause) => { failure = cause })
		.finally(() => { settled = true })
	const deadline = Date.now() + timeoutMs
	let handledDialog = false
	let loadSeen = false
	while ((!settled || !loadSeen) && Date.now() < deadline) {
		const events = page.events.slice(firstEvent)
		if (!handledDialog && events.some((event) => event.method === 'Page.javascriptDialogOpening')) {
			handledDialog = true
			await page.send('Page.handleJavaScriptDialog', { accept: true })
		}
		loadSeen = events.some((event) => event.method === 'Page.loadEventFired')
		await delay(40)
	}
	if (!settled || !loadSeen) throw new Error('timed out cold-reopening the diff board')
	await reload
	if (failure) throw failure
}

async function main() {
	const args = parseArguments(process.argv.slice(2))
	const recipe = JSON.parse(await readFile(resolve(args.recipe), 'utf8'))
	if (!Array.isArray(recipe.shapes) || recipe.shapes.length === 0) {
		throw new Error('recipe.shapes must contain at least one shape')
	}
	const width = Math.max(900, Math.round(recipe.viewport?.width ?? args.width))
	const height = Math.max(700, Math.round(recipe.viewport?.height ?? args.height))

	const app = await startApp({ label: 'systemsketch-diff-board', build: 'diff-board', width, height })
	const scratchPath = join(app.filesRoot, 'SystemSketch', basename(resolve(args.output)))
	const { page, port } = app

	try {
		// Set the paint variant the way the app does, before the first paint.
		await openApp(page, port, '?board=')
		if (args.variant) {
			await evaluate(page, `window.localStorage.setItem(
				'systemsketch.diff-presentation.v1',
				JSON.stringify({ variant: ${JSON.stringify(args.variant)} }),
			)`)
		}
		await openApp(page, port, `?board=${encodeURIComponent(scratchPath)}`)
		await waitFor(page, 'window.__systemsketch?.editor', 'the real SystemSketch editor')

		const created = await evaluate(page, `(() => {
			const recipe = ${JSON.stringify(recipe)}
			const editor = window.__systemsketch.editor
			const shapeId = (id) => id.startsWith('shape:') ? id : \`shape:\${id}\`
			const bindingId = (id) => id.startsWith('binding:') ? id : \`binding:\${id}\`
			const toRichText = (text) => ({
				type: 'doc',
				content: String(text).split('\\n').map((line) => line
					? { type: 'paragraph', content: [{ type: 'text', text: line }] }
					: { type: 'paragraph' }),
			})
			const normalize = (shape) => {
				const { id, parentId, text, props = {}, ...rest } = shape
				const next = { ...props }
				if (typeof text === 'string') next.richText = toRichText(text)
				return {
					...rest,
					id: shapeId(id),
					...(parentId ? { parentId: shapeId(parentId) } : {}),
					props: next,
				}
			}
			editor.createShapes(recipe.shapes.map(normalize))
			if (recipe.bindings?.length) {
				editor.createBindings(recipe.bindings.map((binding, index) => ({
					...binding,
					id: bindingId(binding.id ?? \`\${binding.type}-\${index + 1}\`),
					fromId: shapeId(binding.fromId),
					toId: shapeId(binding.toId),
				})))
			}
			editor.selectNone()
			editor.zoomToFit({ animation: { duration: 0 } })
			editor.setCamera(
				{ ...editor.getCamera(), z: Math.min(1, editor.getCamera().z) },
				{ animation: { duration: 0 } },
			)
			const shapes = editor.store.allRecords().filter((record) => record.typeName === 'shape')
			return {
				count: shapes.length,
				stated: shapes.filter((shape) => shape.props?.state && shape.props.state !== 'normal').length,
				ghostPorts: shapes.filter((shape) => shape.type === 'block').reduce((total, block) => (
					total
					+ block.props.inputs.filter((entry) => entry.state === 'removed').length
					+ block.props.outputs.filter((entry) => entry.state === 'removed').length
				), 0),
			}
		})()`)
		if (created.count !== recipe.shapes.length) {
			throw new Error(`editor created ${created.count} shapes; expected ${recipe.shapes.length}`)
		}

		await waitFor(page,
			`document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
			'diff board autosave')
		await delay(250)
		await guardedReload(page)
		await waitFor(page,
			`window.__systemsketch?.editor?.store.allRecords().filter((record) => record.typeName === 'shape').length === ${recipe.shapes.length}`,
			'the cold-reopened diff board')
		await delay(500)

		// Frame the graph the way a reader would, with the marks well inside.
		await evaluate(page, `(() => {
			const editor = window.__systemsketch.editor
			editor.selectNone()
			editor.zoomToFit({ animation: { duration: 0 }, inset: ${Math.round(args.pad)} })
			editor.setCamera(
				{ ...editor.getCamera(), z: Math.min(1, editor.getCamera().z) },
				{ animation: { duration: 0 } },
			)
		})()`)
		await delay(400)

		const documentBytes = await readFile(scratchPath)
		const document = JSON.parse(documentBytes)
		if (Object.keys(document)[0] !== 'systemSketch') {
			throw new Error('saved diff board does not lead with the systemSketch envelope')
		}
		const savedShapes = document.records.filter((record) => record.typeName === 'shape').length
		if (savedShapes !== recipe.shapes.length) {
			throw new Error(`saved board contains ${savedShapes} shapes; expected ${recipe.shapes.length}`)
		}
		const errors = localConsoleErrors(page)
		if (errors.length) throw new Error(`browser console errors: ${errors.join('; ')}`)

		const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
		await atomicWrite(resolve(args.output), documentBytes)
		await atomicWrite(resolve(args.screenshot), Buffer.from(capture.data, 'base64'))
		process.stdout.write(`${JSON.stringify({
			board: resolve(args.output),
			screenshot: resolve(args.screenshot),
			variant: args.variant ?? 'was-now',
			shapes: savedShapes,
			statedShapes: created.stated,
			ghostPorts: created.ghostPorts,
			boardBytes: (await stat(resolve(args.output))).size,
			screenshotBytes: (await stat(resolve(args.screenshot))).size,
			verified: 'cold-reopen',
		}, null, 2)}\n`)
	} finally {
		app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error.message}\n`)
	process.exitCode = 1
})
