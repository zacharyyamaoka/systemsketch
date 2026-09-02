#!/usr/bin/env node
/**
 * Real-browser proof for the command palette and cross-page board find/replace.
 *
 * The server, browser profile, files root, and board are all throwaway. The
 * journey seeds its scratch document through the public development editor
 * seam, then drives only visible UI and real keyboard shortcuts.
 *
 * Run with:
 *   node tests/command_palette_smoke.mjs
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const COMMANDS_SHOT = join(ASSETS, 'command-palette-commands-2026-09-02.png')
const FIND_SHOT = join(ASSETS, 'command-palette-find-replace-2026-09-02.png')
const PROTECTED_SHOT = join(ASSETS, 'command-palette-protected-2026-09-02.png')
const RESULTS = join(ASSETS, 'command-palette-results.json')
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function replaceFocusedInput(page, value) {
  await shortcut(page, 'a', 'KeyA', 2)
  await typeSlowly(page, value)
}

async function seedScratchBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const firstPage = editor.getCurrentPageId()
    editor.updatePage({ id: firstPage, name: 'Pipeline' })
    editor.createShapes([
      {
        id: 'shape:palette-block',
        type: 'block',
        x: 120,
        y: 160,
        props: { title: 'Decode packet', description: 'Writable Block title' },
      },
      {
        id: 'shape:palette-frame',
        type: 'frame',
        x: 520,
        y: 100,
        props: { name: 'Decode frame', w: 360, h: 260 },
      },
      {
        id: 'shape:palette-rich',
        type: 'geo',
        x: 560,
        y: 450,
        props: {
          geo: 'rectangle',
          w: 300,
          h: 150,
          richText: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'Decode note', marks: [{ type: 'bold' }] }],
            }],
          },
        },
      },
      {
        id: 'shape:palette-boundary',
        type: 'geo',
        x: 930,
        y: 450,
        props: {
          geo: 'rectangle',
          w: 300,
          h: 150,
          richText: {
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Format', marks: [{ type: 'bold' }] },
                { type: 'text', text: 'Boundary' },
              ],
            }],
          },
        },
      },
      {
        id: 'shape:palette-locked',
        type: 'block',
        x: 980,
        y: 150,
        isLocked: true,
        props: { title: 'LockedNeedle', description: 'Searchable, intentionally protected' },
      },
    ])
    editor.createPage({ id: 'page:palette-archive', name: 'Archive' })
    editor.setCurrentPage('page:palette-archive')
    editor.createShape({
      id: 'shape:palette-archive',
      type: 'block',
      x: 320,
      y: 240,
      props: { title: 'Decode archive', description: 'Second-page result' },
    })
    editor.setCurrentPage(firstPage)
    editor.setCurrentTool('select')
    editor.selectNone()
    editor.zoomToFit({ animation: { duration: 0 } })
    return JSON.stringify({ firstPage })
  })()`)
  await delay(450)
}

async function paletteState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const dialog = document.querySelector('[data-testid="systemsketch-command-palette"]')
    return JSON.stringify({
      heading: dialog?.querySelector('h2')?.textContent,
      focusedLabel: document.activeElement?.getAttribute('aria-label'),
      options: Array.from(dialog?.querySelectorAll('[role="option"]') ?? [])
        .map((option) => option.textContent.trim()),
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-command-palette',
    build: 'command-palette-smoke',
    width: 1440,
    height: 940,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'command-palette.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 30_000)
    await waitFor(
      app.page,
      `document.querySelector('[title="Search and commands"]')`,
      'the visible Search and commands action',
      30_000,
    )
    await seedScratchBoard(app.page)

    // 1. Ctrl+K opens the real callback-driven command mode with focus ready.
    await shortcut(app.page, 'k', 'KeyK', 2)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-command-palette"] h2')?.textContent === 'Commands'`,
      'command mode',
    )
    const commands = await paletteState(app.page)
    assert.equal(commands.focusedLabel, 'Search commands')
    assert.ok(commands.options.some((label) => label.includes('Insert Block')))
    assert.ok(commands.options.some((label) => label.includes('Insert Pill')))
    assert.ok(commands.options.some((label) => label.includes('Find and replace on board')))
    await capture(app.page, COMMANDS_SHOT)
    pass('Ctrl+K opens the command palette with its search input focused and real actions listed')

    await typeSlowly(app.page, 'insert block')
    await waitFor(
      app.page,
      `document.querySelectorAll('[role="option"][data-command-id="insert-block"]').length === 1
        && document.querySelectorAll('[role="option"]').length === 1`,
      'the filtered Insert Block command',
    )
    await key(app.page, 'Enter', 'Enter')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="systemsketch-command-palette"]')
        && window.__systemsketch.editor.getCurrentToolId() === 'block'`,
      'the callback-driven command',
    )
    pass('typing and Enter run the filtered command callback, then close the palette')
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.setCurrentTool('select')
      return true
    })()`)

    // 2. The visible trigger proves focus containment and restoration, not only shortcuts.
    await clickElement(app.page, '[title="Search and commands"]')
    await waitFor(
      app.page,
      `document.activeElement?.getAttribute('aria-label') === 'Search commands'`,
      'palette autofocus',
    )
    await key(app.page, 'Tab', 'Tab')
    assert.equal(
      await evaluate(app.page, `document.activeElement?.textContent`),
      'Commands',
      'Tab did not wrap from the last focus target to the first',
    )
    await key(app.page, 'Tab', 'Tab', 8)
    assert.equal(
      await evaluate(app.page, `document.activeElement?.getAttribute('aria-label')`),
      'Search commands',
      'Shift+Tab did not wrap back to the search input',
    )
    for (let step = 0; step < 12; step += 1) {
      await key(app.page, 'Tab', 'Tab', step % 3 === 0 ? 8 : 0)
      assert.equal(
        await evaluate(app.page, `Boolean(document.activeElement?.closest('[role="dialog"]'))`),
        true,
        `focus escaped the dialog on traversal ${step + 1}`,
      )
    }
    await key(app.page, 'Escape', 'Escape')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="systemsketch-command-palette"]')`,
      'Escape dismissal',
    )
    assert.equal(
      await evaluate(app.page, `document.activeElement?.getAttribute('title')`),
      'Search and commands',
    )
    pass('Tab stays inside the modal; Escape closes it and restores focus to the visible trigger')

    // Insert Block intentionally opens its inspector. Close that separate
    // surface so the find evidence is about the palette, not stale chrome.
    if (await evaluate(app.page, `Boolean(document.querySelector('[aria-label="Close Inspector"]'))`)) {
      await clickElement(app.page, '[aria-label="Close Inspector"]')
    }

    // 3. Ctrl+F searches every page through ShapeUtil text readers.
    await shortcut(app.page, 'f', 'KeyF', 2)
    await waitFor(
      app.page,
      `document.activeElement?.getAttribute('aria-label') === 'Find on board'`,
      'find mode autofocus',
    )
    await typeSlowly(app.page, 'Decode')
    await waitFor(
      app.page,
      `document.querySelectorAll('[role="option"][data-replaceable="true"]').length === 4`,
      'four writable matches across pages',
    )
    const matchState = JSON.parse(await evaluate(app.page, `(() => {
      const rows = Array.from(document.querySelectorAll('[role="option"][data-shape-id]'))
      return JSON.stringify({
        summary: document.querySelector('.systemsketch-command-palette__summary')?.textContent,
        ids: rows.map((row) => row.dataset.shapeId),
        pages: rows.map((row) => row.dataset.pageId),
        fields: rows.map((row) => row.dataset.searchField),
      })
    })()`))
    assert.equal(matchState.summary, '4 matches across the board')
    assert.deepEqual(matchState.ids, [
      'shape:palette-block',
      'shape:palette-frame',
      'shape:palette-rich',
      'shape:palette-archive',
    ])
    assert.deepEqual(matchState.fields, ['block-title', 'frame-name', 'rich-text', 'block-title'])
    assert.equal(new Set(matchState.pages).size, 2)
    await capture(app.page, FIND_SHOT)
    pass('Ctrl+F finds Block, Frame, and rich-text adapters in stable order across two pages')

    await clickElement(app.page, '[role="option"][data-shape-id="shape:palette-archive"]')
    await waitFor(
      app.page,
      `window.__systemsketch.editor.getCurrentPageId() === 'page:palette-archive'
        && window.__systemsketch.editor.getOnlySelectedShape()?.id === 'shape:palette-archive'`,
      'cross-page result navigation',
    )
    pass('clicking a result opens its page, selects the shape, and camera-reveals it')

    // Replace one on page two, then replace the remaining three as one undo step.
    await clickElement(app.page, 'input[aria-label="Replace with"]')
    await typeSlowly(app.page, 'Parse')
    await clickElement(app.page, '.systemsketch-command-palette__replace-controls button:first-of-type')
    await waitFor(
      app.page,
      `window.__systemsketch.editor.getShape('shape:palette-archive')?.props.title === 'Parse archive'
        && document.querySelector('.systemsketch-command-palette__summary')?.textContent === '3 matches across the board'`,
      'single replacement',
    )
    await clickElement(app.page, '.systemsketch-command-palette__replace-controls button:nth-of-type(2)')
    await waitFor(
      app.page,
      `(() => {
        const editor = window.__systemsketch.editor
        const text = (id) => editor.getShapeUtil(editor.getShape(id)).getText(editor.getShape(id))
        return text('shape:palette-block') === 'Parse packet'
          && text('shape:palette-frame') === 'Parse frame'
          && text('shape:palette-rich') === 'Parse note'
          && text('shape:palette-archive') === 'Parse archive'
          && document.querySelector('.systemsketch-command-palette__summary')?.textContent === '0 matches across the board'
      })()`,
      'replace all',
    )
    const markedRichText = JSON.parse(await evaluate(app.page, `JSON.stringify(
      window.__systemsketch.editor.getShape('shape:palette-rich').props.richText)`))
    assert.deepEqual(markedRichText.content[0].content[0].marks, [{ type: 'bold' }])
    pass('Replace and Replace All update all supported adapters while retaining rich-text marks')

    await key(app.page, 'Escape', 'Escape')
    await waitFor(
      app.page,
      `!document.querySelector('[data-testid="systemsketch-command-palette"]')`,
      'find palette to close before undo',
    )
    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(
      app.page,
      `(() => {
        const editor = window.__systemsketch.editor
        const text = (id) => editor.getShapeUtil(editor.getShape(id)).getText(editor.getShape(id))
        return text('shape:palette-block') === 'Decode packet'
          && text('shape:palette-frame') === 'Decode frame'
          && text('shape:palette-rich') === 'Decode note'
          && text('shape:palette-archive') === 'Parse archive'
      })()`,
      'single-step replace-all undo',
    )
    pass('one Ctrl+Z restores the entire Replace All batch while preserving the earlier single replacement')

    // 4. A formatting-boundary match remains navigable but cannot be corrupted.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const pipeline = editor.getPages().find((page) => page.name === 'Pipeline')
      if (pipeline) editor.setCurrentPage(pipeline.id)
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    if (await evaluate(app.page, `Boolean(document.querySelector('[aria-label="Close Inspector"]'))`)) {
      await clickElement(app.page, '[aria-label="Close Inspector"]')
    }
    await shortcut(app.page, 'f', 'KeyF', 2)
    await waitFor(app.page, `document.activeElement?.getAttribute('aria-label') === 'Find on board'`, 'protected-search input')
    await typeSlowly(app.page, 'FormatBoundary')
    await waitFor(
      app.page,
      `document.querySelectorAll('[role="option"][data-replaceable="false"]').length === 1`,
      'format-boundary result',
    )
    assert.match(
      await evaluate(app.page, `document.querySelector('[role="option"]')?.textContent`),
      /crosses formatting; replacement is disabled/i,
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('.systemsketch-command-palette__replace-controls button:first-of-type')?.disabled`),
      true,
    )
    await clickElement(app.page, 'input[aria-label="Replace with"]')
    await typeSlowly(app.page, 'Unsafe')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-command-palette__footer [role="status"]')
        ?.textContent.includes('could not be replaced safely')`,
      'contained nonreplaceable request',
    )
    assert.equal(
      await evaluate(app.page, `(() => {
        const editor = window.__systemsketch.editor
        const shape = editor.getShape('shape:palette-boundary')
        return editor.getShapeUtil(shape).getText(shape)
      })()`),
      'FormatBoundary',
    )
    pass('a match spanning formatting is explained, disabled, and safely unchanged even on Enter')
    await capture(app.page, PROTECTED_SHOT)

    // Switch the real find input to a locked shape and prove the second refusal.
    await clickElement(app.page, 'input[aria-label="Find on board"]')
    await replaceFocusedInput(app.page, 'LockedNeedle')
    await waitFor(
      app.page,
      `document.querySelector('[role="option"][data-shape-id="shape:palette-locked"]')
        ?.dataset.replaceable === 'false'`,
      'locked result',
    )
    assert.match(
      await evaluate(app.page, `document.querySelector('[role="option"]')?.textContent`),
      /Locked shape/i,
    )
    assert.equal(
      await evaluate(app.page, `document.querySelector('.systemsketch-command-palette__replace-controls button:first-of-type')?.disabled`),
      true,
    )
    pass('locked shape text is searchable and navigable but its replacement controls stay disabled')

    await key(app.page, 'Escape', 'Escape')
    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the complete keyboard, navigation, edit, undo, and refusal journey emits no browser errors')

    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n${checks.length} command-palette checks passed.\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
