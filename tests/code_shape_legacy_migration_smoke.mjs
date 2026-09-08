#!/usr/bin/env node
/**
 * Reopens a real Code block document from the first shipped representation.
 *
 * The original Code primitive stored `fontSize`; the shared appearance menu
 * now uses the stock `size` rung. This regression opens the same schema
 * revision that previously aborted Preview validation with an undefined size.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
	ROOT,
	evaluate,
	localConsoleErrors,
	openApp,
	startApp,
	waitFor,
} from './browser_harness.mjs'
import { shot } from './block_journey_helpers.mjs'

const legacyFixtureSource = join(ROOT, 'sketches', 'review', 'code-block-primitive.systemsketch')

function firstReleaseCodeDocument(source) {
	const legacy = source.replace(
		/("type": "code",\s+"props": \{[\s\S]*?)"size": "m"/,
		'$1"fontSize": 14',
	)
	if (legacy === source) throw new Error('Could not replace the Code block size in the source fixture')
	return legacy
}

async function main() {
	const app = await startApp({ label: 'code-shape-legacy-migration', width: 1440, height: 960 })
	try {
		const legacyPath = join(app.filesRoot, 'legacy-code-block.systemsketch')
		const source = await readFile(legacyFixtureSource, 'utf8')
		await writeFile(legacyPath, firstReleaseCodeDocument(source))

		await openApp(app.page, app.port, `?board=${encodeURIComponent(legacyPath)}`)
		await waitFor(app.page, 'document.querySelector(\'[data-testid="systemsketch-app"] .tl-container\')', 'product canvas')
		await waitFor(app.page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')
		await waitFor(app.page,
			'window.__systemsketch.editor.getShape(\'shape:code-subject\')?.props.size === \'m\'',
			'legacy Code block migrated')

		const facts = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
			const shape = window.__systemsketch.editor.getShape('shape:code-subject')
			return {
				size: shape?.props.size,
				fontScale: shape?.props.fontScale,
				fontSizePresent: Object.hasOwn(shape?.props ?? {}, 'fontSize'),
				canvas: Boolean(document.querySelector('[data-shape-id="shape:code-subject"] .code-block-canvas')),
				loadAlert: document.querySelector('.systemsketch-workspace-alert[role="alert"]')?.textContent ?? null,
			}
		})())`))
		assert.deepEqual(facts, {
			size: 'm',
			fontScale: 14 / 16,
			fontSizePresent: false,
			canvas: true,
			loadAlert: null,
		})
		assert.deepEqual(localConsoleErrors(app.page), [])
		await shot(app.page, 'code-shape-legacy-migration.png')
		process.stdout.write('PASS legacy Code block opens with a stock size rung and no workspace error\n')
	} finally {
		await app.close()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error}\n`)
	process.exitCode = 1
})
