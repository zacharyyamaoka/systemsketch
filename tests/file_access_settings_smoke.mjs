#!/usr/bin/env node
/**
 * Real-browser proof for the "Allow opening files anywhere" toggle.
 *
 * Opening a board from outside the configured workspace root (an agent
 * worktree, another drive) is refused by default — the same fence in
 * workspace_store.py that keeps a stray web request from reaching arbitrary
 * files. Settings > General has an explicit, off-by-default opt-out. This
 * journey reproduces the refusal, flips the toggle, and proves the same
 * board then opens, edits, and autosaves for real.
 *
 * Run with:
 *   node tests/file_access_settings_smoke.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { drawBlock } from './block_journey_helpers.mjs'

const { pass, report } = makeChecklist()

async function waitForFileContains(path, needle, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastText = ''
  while (Date.now() < deadline) {
    try {
      lastText = await readFile(path, 'utf8')
      if (lastText.includes(needle)) return lastText
    } catch {
      // The autosave write may still be staging.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}; last file was ${lastText.length} bytes`)
}

function outsideDocument() {
  return JSON.stringify({
    systemSketch: {
      formatVersion: 1,
      application: 'SystemSketch',
      shapes: {},
      bindings: {},
    },
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [],
  })
}

async function main() {
  const app = await startApp({ label: 'file-access-settings', width: 1280, height: 860 })
  const { page, port, apiPort } = app

  try {
    // Deliberately outside `filesRoot`: this is exactly the shape of the
    // reported failure — an agent worktree board opened by direct path.
    const outsideDirectory = await mkdtemp(join(tmpdir(), 'file-access-outside-'))
    const outsidePath = join(outsideDirectory, 'Elsewhere.systemsketch')
    await writeFile(outsidePath, outsideDocument())

    await openApp(page, port, '?board=' + encodeURIComponent(outsidePath))
    await waitFor(page, `document.querySelector('.systemsketch-workspace-loading strong')?.textContent === 'Could not open the local workspace'`, 'the refused-path message')
    const refusalMessage = await evaluate(page, `document.querySelector('.systemsketch-workspace-loading p')?.textContent`)
    assert.match(refusalMessage, /stay under an allowed root/)
    pass('opening a board outside the workspace root is refused by default, exactly like the reported failure')

    const before = await fetch(`http://127.0.0.1:${apiPort}/api/settings/file-access`).then((response) => response.json())
    assert.deepEqual(before, { allowAnyPath: false })

    // The failed bootstrap screen has no main menu, so Settings is
    // unreachable from it — flip the toggle the same way the client's own
    // Settings dialog would (a POST to this endpoint), then prove the effect
    // through the UI's own retry button below.
    const toggled = await fetch(`http://127.0.0.1:${apiPort}/api/settings/file-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowAnyPath: true }),
    }).then((response) => response.json())
    assert.deepEqual(toggled, { allowAnyPath: true })
    pass('POST /api/settings/file-access persists the opt-in and echoes it back')

    await clickElement(page, '[data-testid="workspace-retry-bootstrap"]')
    await waitFor(page, `window.__systemsketch?.editor && document.querySelector('[data-testid="main-menu.button"]')`, 'product canvas after retry')
    assert.equal(
      await evaluate(page, 'document.title'),
      'Elsewhere — SystemSketch',
      'the retried bootstrap did not open the board outside the workspace root',
    )
    pass('after the toggle, the exact same board link opens with no page reload')

    // A fresh open of a pre-v2 `.systemsketch` schedules its own one-time
    // format-migration autosave. Let that settle before drawing, so the edit
    // below gets its own save rather than racing the migration's in-flight
    // `serializeTldrawJson` snapshot.
    await waitFor(page, `document.querySelector('i[data-state]')?.getAttribute('data-state') === 'clean'`, 'the migration autosave to settle')

    // Prove read/write parity, not just a readable view: draw a real Block
    // with a real pointer gesture and confirm the outside file on disk
    // actually changes.
    await drawBlock(page, { x: 320, y: 260 }, { x: 620, y: 420 }, 'Proof')
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().length > 0`, 'a drawn Block')
    await waitForFileContains(outsidePath, '"type": "block"', 'the outside file to carry the new Block')
    pass('the opened-anywhere board saves a real edit back to its outside path')

    // Confirm Settings itself shows the toggle as on, in the running app —
    // not just via the API used to unblock the retry above.
    await clickElement(page, '[data-testid="main-menu.button"]')
    await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'Settings menu item')
    await clickElement(page, '[data-testid="main-menu.settings"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings dialog')
    await clickElement(page, '[data-testid="systemsketch-settings-category-general"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-general-panel"]')`, 'General settings panel')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-allow-any-path"]')?.getAttribute('aria-checked') === 'true'`, 'toggle reflecting the on state')
    pass('Settings > General shows the toggle already on, matching server state')

    // This journey deliberately triggers real HTTP refusals (the opening
    // 400, and — after re-locking below — the outside board's background
    // poll), each surfacing Chrome's generic resource-load console line
    // regardless of the app's own handling. Anything else is unexpected.
    const expectedRefusal = /Failed to load resource: the server responded with a status of 400/
    const unexpectedErrors = (await localConsoleErrors(page)).filter((message) => !expectedRefusal.test(message))
    assert.deepEqual(unexpectedErrors, [])

    // Flip it back off from the UI itself and confirm the server agrees —
    // proving the control is a real two-way toggle, not a one-shot escape.
    // The board opened from outside the root stays open past this point, so
    // its background revision poll will start failing until it is closed —
    // that is the fence working as intended, not asserted away here.
    await clickElement(page, '[data-testid="systemsketch-allow-any-path"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-allow-any-path"]')?.getAttribute('aria-checked') === 'false'`, 'toggle reflecting the off state')
    await delay(200)
    const restored = await fetch(`http://127.0.0.1:${apiPort}/api/settings/file-access`).then((response) => response.json())
    assert.deepEqual(restored, { allowAnyPath: false })
    pass('switching the toggle off in Settings persists back to the server, restoring the default fence')
  } finally {
    app.close()
  }

  report('file access settings')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
