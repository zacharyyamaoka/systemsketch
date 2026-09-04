#!/usr/bin/env node
/** Real-app proof: author a port role, then read the live cable inheritance. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, clickAt, delay, evaluate, key, openApp, startApp, waitFor } from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches/review/semantic-role-inheritance.systemsketch')
const SHOT = join(ROOT, 'docs/assets/semantic-role-inheritance-smoke-2026-09-04.png')

async function centre(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
    return JSON.stringify(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null)
  })()`))
}

/** Reload through the app's ordinary autosave/dirty-document guard. */
async function guardedReload(page, timeoutMs = 20_000) {
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
  if (!settled || !loadSeen) throw new Error('timed out reloading the semantic-role board')
  await reload
  if (failure) throw failure
}

async function main() {
  const app = await startApp({ label: 'semantic-role-inheritance', width: 1440, height: 900 })
  const { page, port, filesRoot } = app
  try {
    const scratch = join(filesRoot, 'SystemSketch', 'semantic-role-inheritance-copy.systemsketch')
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page, `document.querySelector('[data-shape-id="shape:emitter"] .Port[data-semantic-role="event"]')`, 'Event source port cue')
		await waitFor(page, `document.querySelector('[data-shape-id="shape:consumer"] .Port[data-semantic-role="control"][aria-label="Control port"]')?.textContent === 'Control'`, 'visible and accessible Branch Control cue')

		const emitter = await centre(page, '[data-shape-id="shape:emitter"]')
		await clickAt(page, emitter.x, emitter.y)
    await waitFor(page, `document.querySelector('select[aria-label="Semantic role for outputs tick"]')`, 'per-port role selector')
    const select = await centre(page, 'select[aria-label="Semantic role for outputs tick"]')
    await clickAt(page, select.x, select.y)
		await key(page, 'ArrowUp', 'ArrowUp')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('select[aria-label="Semantic role for outputs tick"]')?.value === 'data'`, 'Data authoring')
    assert.equal(await evaluate(page, `window.__systemsketch.editor.getShape('shape:emitter').props.outputs[0].semanticRoleAuthored.role`), 'data')

		// Native select keyboard handling differs under headless CDP after the
		// first commit. Dispatch the same bubbling `change` React receives; the
		// earlier Data transition above remains the pointer+keyboard UI proof.
	await evaluate(page, `(() => {
			const element = document.querySelector('select[aria-label="Semantic role for outputs tick"]')
			const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
			setter.call(element, 'event')
			element.dispatchEvent(new Event('change', { bubbles: true }))
	})()`)
    await waitFor(page, `document.querySelector('select[aria-label="Semantic role for outputs tick"]')?.value === 'event'`, 'Event restoration')

		// Selector changes are ordinary history writes; the live role follows undo
		// and redo without a derived copy on the cable to repair.
		await evaluate(page, `(() => { window.__systemsketch.editor.undo(); return true })()`)
		await waitFor(page, `document.querySelector('select[aria-label="Semantic role for outputs tick"]')?.value === 'data'`, 'semantic role undo')
		await evaluate(page, `(() => { window.__systemsketch.editor.redo(); return true })()`)
		await waitFor(page, `document.querySelector('select[aria-label="Semantic role for outputs tick"]')?.value === 'event'`, 'semantic role redo')

		// Selection is already tldraw's public state seam; select the thin cable
		// directly so the assertion is not hostage to its hit padding at this
		// headless zoom. The CUA review journey covers the literal canvas click.
		await evaluate(page, `(() => { window.__systemsketch.editor.select('shape:event-to-control'); return null })()`)
    await waitFor(page, `document.querySelector('[data-testid="connection-semantic-role"]')?.textContent?.includes('Event → Control')`, 'live conflict reading')
    const facts = JSON.parse(await evaluate(page, `JSON.stringify({
      role: document.querySelector('[data-testid="connection-semantic-role"]')?.textContent,
      warning: document.querySelector('.connection-inspector__semantic-warning')?.textContent,
      temporal: window.__systemsketch.editor.getShape('shape:event-to-control').props.temporal,
    })`))
    assert.match(facts.role, /Event → Control/)
    assert.match(facts.warning, /remains legal/)
		assert.match(await evaluate(page, `document.querySelector('[data-testid="connection-endpoints"]')?.textContent ?? ''`), /choose_tick\(\)\.when tick/)
    assert.equal(facts.temporal, 'data', 'role authoring does not change delivery mode')
		await guardedReload(page)
		await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:emitter')?.props.outputs[0].semanticRoleAuthored?.role === 'event'`, 'autosaved semantic role after reload')
		await waitFor(page, `document.querySelector('[data-shape-id="shape:consumer"] .Port[aria-label="Control port"]')?.textContent === 'Control'`, 'Control cue after reload')
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    process.stdout.write(`semantic roles real-app proof passed\n${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
