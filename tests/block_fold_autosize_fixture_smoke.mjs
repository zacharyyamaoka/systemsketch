#!/usr/bin/env node
/**
 * Drives the committed review fixture in a real track server. It undoes the
 * membership exit before closing, so the review board remains prepared for a
 * human rather than being left in its post-action state.
 */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

import {
	clickAt,
	clickElement,
	delay,
	evaluate,
	launchChrome,
	localConsoleErrors,
	openCdpPage,
	openApp,
	shortcut,
	waitFor,
} from './browser_harness.mjs'
import { box, scope } from './block_journey_helpers.mjs'

const PORT = Number(process.env.SYSTEMSKETCH_REVIEW_PORT ?? '4730')
const BOARD = resolve(process.env.SYSTEMSKETCH_REVIEW_BOARD ?? 'sketches/review/block-fold-autosize.systemsketch')
const PIPELINE = 'shape:pipeline'
const PARSE = 'shape:decode'

async function main() {
	const chrome = await launchChrome({ label: 'block-fold-autosize-fixture', width: 1600, height: 960 })
	const page = await openCdpPage(await chrome.devToolsPort(), { width: 1600, height: 960 })
	try {
		await openApp(page, PORT, `?board=${encodeURIComponent(BOARD)}`)
		await waitFor(page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(PARSE)})?.parentId === ${JSON.stringify(PIPELINE)}`,
			'the saved review child membership')
		await waitFor(page, `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
			'the cold-opened review fixture')

		const fold = await box(page, `${scope(PIPELINE)} [data-testid^="block-fold-"]`)
		await clickAt(page, fold.cx, fold.cy)
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(PIPELINE)})?.props.folded === true`,
			'the fixture fold action')
		await waitFor(page, `!document.querySelector(${JSON.stringify(`${scope(PARSE)} .systemsketch-block-canvas`)})`,
			'the hidden fixture child')

		const unfold = await box(page, `${scope(PIPELINE)} [data-testid^="block-fold-"]`)
		await clickAt(page, unfold.cx, unfold.cy)
		await waitFor(page, `document.querySelector(${JSON.stringify(`${scope(PARSE)} .systemsketch-block-canvas`)})`,
			'the restored fixture child')

		const parse = await box(page, `${scope(PARSE)} .systemsketch-block-canvas`)
		await clickAt(page, parse.cx, parse.cy, 'right')
		await waitFor(page, `document.querySelector('[data-testid="context-menu.remove-from-container"]')`,
			'the fixture membership exit command')
		await clickElement(page, '[data-testid="context-menu.remove-from-container"]')
		await waitFor(page,
			`window.__systemsketch.editor.getShape(${JSON.stringify(PARSE)})?.parentId === window.__systemsketch.editor.getCurrentPageId()`,
			'the removed fixture child')
		await shortcut(page, 'z', 'KeyZ', 2)
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(PARSE)})?.parentId === ${JSON.stringify(PIPELINE)}`,
			'the restored review fixture state')
		await delay(350)
		assert.deepEqual(localConsoleErrors(page), [])
		process.stdout.write('review fixture fold / auto-fit / membership exit passed and was restored\n')
	} finally {
		page.close()
		chrome.kill()
	}
}

main().catch((error) => {
	process.stderr.write(`${error.stack ?? error}\n`)
	process.exitCode = 1
})
