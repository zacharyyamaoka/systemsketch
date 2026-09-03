#!/usr/bin/env node
/**
 * Real-browser proof for the local Problems view.
 *
 * The app, files root, browser profile, and board are all throwaway. The
 * journey seeds only its scratch board through the public editor seam, opens
 * Problems through the visible utility button, exercises navigation, and
 * proves the derived model removes findings as their board data is repaired.
 *
 * Run with:
 *   node tests/board_diagnostics_smoke.mjs
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
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const PROBLEMS_SCREENSHOT = join(
  ROOT,
  'docs',
  'assets',
  'board-diagnostics-problems-2026-09-02.png',
)
const CLEAR_SCREENSHOT = join(
  ROOT,
  'docs',
  'assets',
  'board-diagnostics-clear-2026-09-02.png',
)
const { checks, pass } = makeChecklist()

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function seedScratchProblems(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      {
        id: 'shape:diagnostics-untitled',
        type: 'block',
        x: 100,
        y: 160,
        props: {
          title: '',
          blockType: 'source adapter',
          description: 'Reads a manifest and emits the parsed model.',
        },
      },
      {
        id: 'shape:diagnostics-input',
        type: 'block',
        x: 380,
        y: 550,
        props: {
          title: 'Load config',
          view: 'port',
          inputs: [{
            id: 'in_path',
            name: 'path',
            type: 'Path',
            visible: true,
            defaultValue: '',
          }],
        },
      },
    ])
    editor.selectNone()
    editor.zoomToFit()
    return true
  })()`)
  await waitFor(
    page,
    `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label') === 'Problems \u2014 2 issues'`,
    'two live diagnostic issues',
  )
}

async function main() {
  await ensureDir(join(ROOT, 'docs', 'assets'))
  const app = await startApp({
    label: 'systemsketch-board-diagnostics',
    build: 'board-diagnostics-smoke',
    width: 1440,
    height: 920,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'board-diagnostics.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 30_000)
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-diagnostics-trigger')`,
      'the visible Problems utility',
      30_000,
    )
    await seedScratchProblems(app.page)
    pass('the visible utility badge derives two issues from the scratch board')

    await clickElement(app.page, '.systemsketch-diagnostics-trigger')
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-diagnostics-panel"][data-diagnostic-count="2"]')`,
      'the Problems panel with both rows',
    )

    const initial = JSON.parse(await evaluate(app.page, `(() => {
      const panel = document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')
      const popout = document.querySelector('[data-testid="systemsketch-right-popout"]')
      return JSON.stringify({
        surface: popout?.dataset.surface,
        title: popout?.querySelector('.systemsketch-popout__header h2')?.textContent,
        boardGroup: panel?.querySelector('.systemsketch-diagnostics__page h3 span')?.textContent,
        boardListLabel: panel?.querySelector('ul')?.getAttribute('aria-label'),
        rows: Array.from(panel?.querySelectorAll('[data-diagnostic-code]') ?? [])
          .map((row) => row.dataset.diagnosticCode),
        warnings: panel?.querySelector('[aria-label="2 warnings"]')?.textContent,
        triggerExpanded: document.querySelector('.systemsketch-diagnostics-trigger')
          ?.getAttribute('aria-expanded'),
      })
    })()`))
    assert.deepEqual(initial.rows, ['block-title.blank', 'input.unresolved'])
    assert.equal(initial.surface, 'diagnostics')
    assert.equal(initial.title, 'Problems')
    // A SystemSketch document is a single canvas (`maxPages: 1`), and 49d8113 removed
    // every surface that named a tldraw page — the PageMenu is gone and Board Overview
    // hardcodes the same word. So Problems groups under the literal 'Board', not a name.
    assert.equal(initial.boardGroup, 'Board')
    assert.equal(initial.boardListLabel, 'Board problems')
    assert.match(initial.warnings, /2/)
    assert.equal(initial.triggerExpanded, 'true')
    pass('Problems groups deterministic warning rows under the single board with honest counts')
    await capture(app.page, PROBLEMS_SCREENSHOT)

    await clickElement(app.page, '[data-diagnostic-code="block-title.blank"]')
    await delay(420)
    const focused = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:diagnostics-untitled')
      const viewport = editor.getViewportPageBounds()
      return JSON.stringify({
        selected: editor.getOnlySelectedShape()?.id,
        visible: Boolean(bounds && viewport.contains(bounds)),
        dx: bounds ? Math.abs(bounds.center.x - viewport.center.x) : null,
        dy: bounds ? Math.abs(bounds.center.y - viewport.center.y) : null,
        panelOpen: Boolean(document.querySelector(
          '[data-testid="systemsketch-right-popout"][data-surface="diagnostics"]',
        )),
      })
    })()`))
    assert.equal(focused.selected, 'shape:diagnostics-untitled')
    assert.equal(focused.visible, true)
    assert.ok(focused.dx < 1 && focused.dy < 1, `camera offset was ${focused.dx}, ${focused.dy}`)
    assert.equal(focused.panelOpen, true)
    pass('clicking a row selects and camera-fits its Block while Problems stays open')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.updateShape({
        id: 'shape:diagnostics-untitled',
        type: 'block',
        props: { title: 'Read manifest' },
      })
      return true
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')?.dataset.diagnosticCount === '1'
        && !document.querySelector('[data-diagnostic-code="block-title.blank"]')
        && Boolean(document.querySelector('[data-diagnostic-code="input.unresolved"]'))`,
      'the repaired title finding to disappear',
    )
    assert.equal(await evaluate(app.page,
      `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label')`), 'Problems \u2014 1 issue')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="systemsketch-right-popout"]')?.dataset.surface`), 'diagnostics')
    pass('repairing a Block removes only its row and updates the badge without closing Problems')

    await clickElement(app.page, '[data-diagnostic-code="input.unresolved"]')
    await waitFor(
      app.page,
      `window.__systemsketch.editor.getOnlySelectedShape()?.id === 'shape:diagnostics-input'`,
      'navigation to the unresolved input Block',
    )
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getShape('shape:diagnostics-input')
      editor.updateShape({
        id: block.id,
        type: block.type,
        props: {
          inputs: block.props.inputs.map((input) => input.id === 'in_path'
            ? { ...input, defaultValue: 'config.yaml' }
            : input),
        },
      })
      return true
    })()`)
    await waitFor(
      app.page,
      `document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')?.dataset.diagnosticCount === '0'
        && document.querySelector('[data-testid="systemsketch-diagnostics-panel"]')
          ?.textContent.includes('Board checks are clear')`,
      'the clean board state',
    )
    assert.equal(await evaluate(app.page,
      `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label')`), 'Problems \u2014 0 issues')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="systemsketch-right-popout"]')?.dataset.surface`), 'diagnostics')
    pass('adding the missing default clears the final finding in place')

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit()
      editor.resetZoom()
      return true
    })()`)
    await delay(350)
    await capture(app.page, CLEAR_SCREENSHOT)
    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the complete Problems journey emits no local browser errors')
  } finally {
    app.close()
  }

  process.stdout.write(`\n${checks.length} board-diagnostics checks passed.\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
