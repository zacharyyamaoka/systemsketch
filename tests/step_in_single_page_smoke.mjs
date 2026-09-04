#!/usr/bin/env node
/**
 * Real-browser acceptance for true Step In isolation and the one-canvas
 * document migration. The first visit deliberately authors a legacy two-page
 * file in the unrestricted Block lab; the product then reopens and migrates
 * that exact file before the isolation/resize journey runs on a fresh board.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const MIGRATION_SHOT = join(ASSETS, 'step-in-single-page-migration-2026-09-02.png')
const ISOLATION_SHOT = join(ASSETS, 'step-in-single-page-isolation-2026-09-02.png')
const RESULTS = join(ASSETS, 'step-in-single-page-results.json')
const REFRESH_SCREENSHOTS = process.env.SYSTEMSKETCH_REFRESH_STEP_IN_SCREENSHOTS === '1'

const results = []

function check(id, label, observed, desired = true) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
      + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function json(page, expression) {
  return JSON.parse(await evaluate(page, `JSON.stringify(${expression})`))
}

async function waitForDisk(path, accept, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const source = await readFile(path, 'utf8')
      if (accept(source)) return source
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ''}`)
}

async function main() {
  const app = await startApp({
    label: 'systemsketch-step-in-single-page',
    build: 'step-in-single-page',
    width: 1600,
    height: 1000,
  })
  const { page, port, filesRoot } = app
  const migrationShot = REFRESH_SCREENSHOTS ? MIGRATION_SHOT : join(filesRoot, 'step-in-single-page-migration.png')
  const isolationShot = REFRESH_SCREENSHOTS ? ISOLATION_SHOT : join(filesRoot, 'step-in-single-page-isolation.png')
  const legacyPath = join(filesRoot, 'SystemSketch', 'legacy-two-page.tldr')
  const scopePath = join(filesRoot, 'SystemSketch', 'step-in-scope.systemsketch')

  try {
    await ensureDir(join(filesRoot, 'SystemSketch'))
    // The lab intentionally retains unrestricted stock document mechanics so
    // it can manufacture a genuine pre-migration file for compatibility QA.
    await openApp(
      page,
      port,
      `?preset=block-dev&board=${encodeURIComponent(legacyPath)}`,
    )
    await waitFor(page, 'window.__systemsketch?.editor', 'legacy authoring editor', 30_000)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const first = editor.getCurrentPageId()
      editor.updatePage({ id: first, name: 'Architecture' })
      editor.createShape({
        id: 'shape:architecture-service', type: 'geo', x: 120, y: 120,
        props: { geo: 'rectangle', w: 240, h: 140, color: 'blue' },
      })
      editor.createPage({ id: 'page:legacy-runtime', name: 'Runtime' })
      editor.setCurrentPage('page:legacy-runtime')
      editor.createShape({
        id: 'shape:runtime-worker', type: 'geo', x: 80, y: 100,
        props: { geo: 'ellipse', w: 210, h: 150, color: 'orange' },
      })
      editor.setCurrentPage(first)
      return true
    })()`)
    const legacySource = await evaluate(page, `JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: window.__systemsketch.editor.store.schema.serialize(),
      records: window.__systemsketch.editor.store.allRecords(),
    })`)
    await writeFile(legacyPath, legacySource)
    check('M1', 'fixture is a real saved two-page tldraw file', await json(page,
      `window.__systemsketch.editor.getPages().map((entry) => entry.name)`),
    ['Architecture', 'Runtime'])

    // Reopen in the full product. Loading is the migration boundary: there is
    // only one internal canvas and every former page becomes a named stock Frame.
    await openApp(page, port, `?board=${encodeURIComponent(legacyPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'migrated product editor', 30_000)
    await waitFor(
      page,
      `window.__systemsketch.editor.getPages().length === 1
        && window.__systemsketch.editor.getCurrentPageShapes().filter((shape) =>
          shape.type === 'frame' && shape.meta?.systemSketch?.kind === 'imported-page').length === 2`,
      'page Frames',
      30_000,
    )
    const migration = await json(page, `(() => {
      const editor = window.__systemsketch.editor
      const frames = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'frame' && shape.meta?.systemSketch?.kind === 'imported-page')
        .sort((a, b) => String(a.index).localeCompare(String(b.index)))
      return {
        pageCount: editor.getPages().length,
        maxPages: editor.options.maxPages,
        frames: frames.map((frame) => ({
          id: frame.id,
          name: frame.props.name,
          children: editor.getSortedChildIdsForParent(frame.id),
        })),
        depthInMenu: Boolean(document.querySelector('.systemsketch-top-left-shell .systemsketch-depth-navigator--menu')),
        stockPageTrigger: Boolean(document.querySelector('.tlui-page-menu__trigger')),
      }
    })()`)
    check('M2', 'the product exposes exactly one durable canvas', migration.pageCount, 1)
    check('M3', 'the editor rejects creation of additional pages', migration.maxPages, 1)
    check('M4', 'former page names survive as stock Frames', migration.frames.map((entry) => entry.name),
      ['Architecture', 'Runtime'])
    check('M5', 'each former page keeps its own content inside its Frame',
      migration.frames.map((entry) => entry.children.length), [1, 1])
    check('M6', 'Depth Stack occupies the old page-menu slot', migration.depthInMenu, true)
    check('M7', 'the stock page selector is absent', migration.stockPageTrigger, false)
    const migratedDisk = JSON.parse(await waitForDisk(legacyPath, (source) => {
      try {
        const records = JSON.parse(source).records
        return records.filter((record) => record.typeName === 'page').length === 1
          && records.filter((record) => record.typeName === 'shape'
            && record.type === 'frame'
            && record.meta?.systemSketch?.kind === 'imported-page').length === 2
      } catch { return false }
    }, 'migration autosave'))
    check('M8', 'the one-canvas migration is saved back to disk',
      migratedDisk.records.filter((record) => record.typeName === 'page').length, 1)
    check('M9', 'the saved file contains both imported-page Frames',
      migratedDisk.records.filter((record) => record.typeName === 'shape'
        && record.type === 'frame'
        && record.meta?.systemSketch?.kind === 'imported-page').length,
    2)
    await evaluate(page, `window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); true`)
    await delay(300)
    if (REFRESH_SCREENSHOTS) await ensureDir(ASSETS)
    await screenshot(page, migrationShot)

    // A fresh one-canvas board for the physical Step In proof.
    await openApp(page, port, `?board=${encodeURIComponent(scopePath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'scope editor', 30_000)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        {
          id: 'shape:active-scope', type: 'block', x: 220, y: 150,
          props: {
            title: 'run()', view: 'expanded', w: 720, h: 540,
            inputs: [
              { id: 'bytes', name: 'bytes', type: 'Bytes', visible: true },
              { id: 'in_1', name: 'in_1', type: '', visible: true },
              { id: 'in_2', name: 'in_2', type: '', visible: true },
            ],
            outputs: [{ id: 'result', name: 'result', type: 'Decoded', visible: true }],
          },
        },
        {
          id: 'shape:inside', type: 'geo', parentId: 'shape:active-scope', x: 190, y: 180,
          props: { geo: 'rectangle', w: 300, h: 180, color: 'blue' },
        },
        {
          id: 'shape:outside-sibling', type: 'geo', x: 1120, y: 210,
          props: { geo: 'rectangle', w: 300, h: 240, color: 'orange' },
        },
        {
          id: 'shape:outside-note', type: 'geo', x: 1060, y: 560,
          props: { geo: 'ellipse', w: 260, h: 150, color: 'violet' },
        },
      ])
      editor.select('shape:active-scope')
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(page, `document.querySelector('.block-mini-menu__step-in')`, 'Step in selection action')
    await clickElement(page, '.block-mini-menu__step-in')
    await waitFor(
      page,
      `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '1'`,
      'active depth scope',
    )
    const isolated = await json(page, `(() => {
      const editor = window.__systemsketch.editor
      const paintedIds = Array.from(document.querySelectorAll('[data-shape-id]'))
        .map((node) => node.getAttribute('data-shape-id'))
      return {
        paintedIds,
        siblingHidden: editor.isShapeHidden(editor.getShape('shape:outside-sibling')),
        noteHidden: editor.isShapeHidden(editor.getShape('shape:outside-note')),
        activeHidden: editor.isShapeHidden(editor.getShape('shape:active-scope')),
      }
    })()`)
    check('I1', 'Step In removes unrelated shapes from the rendered board',
      !isolated.paintedIds.includes('shape:outside-sibling')
        && !isolated.paintedIds.includes('shape:outside-note'), true)
    check('I2', 'unrelated records are hidden by the editor, not covered by a mask',
      isolated.siblingHidden && isolated.noteHidden, true)
    check('I3', 'the active Block and its child remain real interactive shapes',
      !isolated.activeHidden
        && isolated.paintedIds.includes('shape:active-scope')
        && isolated.paintedIds.includes('shape:inside'), true)
    check('I4', 'the old four-rectangle scope mask no longer exists',
      await evaluate(page, `Boolean(document.querySelector('.systemsketch-depth-mask'))`), false)

    // Select the active scope, then physically drag the stock southwest resize
    // handle. The handle sits outside the Block perimeter, exactly where the
    // old scope mask intercepted/clipped the pointer.
    await evaluate(page, `window.__systemsketch.editor.select('shape:active-scope'); true`)
    await delay(220)
    const resize = await json(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape('shape:active-scope')
      const overlay = editor.overlays.getCurrentOverlays()
        .find((candidate) => candidate.id === 'selection_fg:bottom_left')
      const geometry = editor.overlays.getOverlayGeometry(overlay)
      const point = editor.pageToScreen(geometry.bounds.center)
      return { x: point.x, y: point.y, before: shape.props.w }
    })()`)
    await mouse(page, 'mouseMoved', resize.x, resize.y)
    await delay(120)
    check('R0', 'the pointer reaches the stock resize overlay outside the Block',
      await evaluate(page, `window.__systemsketch.editor.overlays.getHoveredOverlayId()`),
      'selection_fg:bottom_left')
    await mouse(page, 'mousePressed', resize.x, resize.y, { buttons: 1 })
    const stateAfterPointerDown = await evaluate(page, `window.__systemsketch.editor.getPath()`)
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', resize.x - (120 * step / 8), resize.y, { buttons: 1 })
      await delay(25)
    }
    const stateAfterMove = await evaluate(page, `window.__systemsketch.editor.getPath()`)
    await mouse(page, 'mouseReleased', resize.x - 120, resize.y)
    await delay(240)
    check('R0b', 'pointer-down enters the stock resize state', stateAfterPointerDown,
      'select.pointing_resize_handle')
    check('R0c', 'pointer movement enters active stock resizing', stateAfterMove,
      'select.resizing')
    const afterWidth = await evaluate(page,
      `window.__systemsketch.editor.getShape('shape:active-scope').props.w`)
    check('R1', 'the stock resize control remains draggable outside the active perimeter',
      afterWidth > resize.before + 50, true)
    check('R2', 'stretching the active Block cannot reveal unrelated canvas content',
      await evaluate(page, `window.__systemsketch.editor.isShapeHidden(
        window.__systemsketch.editor.getShape('shape:outside-sibling'))`), true)
    const portGeometry = await json(page, `(() => {
      const block = document.querySelector('[data-shape-id="shape:active-scope"] .systemsketch-block-canvas')
      const input = document.querySelector('[data-shape-id="shape:active-scope"] .Port[data-block-port-side="input"]')
      const output = document.querySelector('[data-shape-id="shape:active-scope"] .Port[data-block-port-side="output"]')
      const b = block.getBoundingClientRect()
      const i = input.getBoundingClientRect()
      const o = output.getBoundingClientRect()
      return {
        inputCrosses: i.left < b.left && i.right > b.left,
        outputCrosses: o.left < b.right && o.right > b.right,
        inputVisible: getComputedStyle(input).visibility !== 'hidden',
        outputVisible: getComputedStyle(output).visibility !== 'hidden',
      }
    })()`)
    check('R3', 'input and output ports visibly straddle the Block perimeter', portGeometry,
      { inputCrosses: true, outputCrosses: true, inputVisible: true, outputVisible: true })
    check('R4', 'resizing still leaves every unrelated record isolated',
      await evaluate(page, `Array.from(document.querySelectorAll('[data-shape-id]'))
        .every((node) => !['shape:outside-sibling','shape:outside-note'].includes(node.getAttribute('data-shape-id')))`),
    true)

    if (await evaluate(page, `Boolean(document.querySelector('[aria-label="Close Block inspector"]'))`)) {
      await clickElement(page, '[aria-label="Close Block inspector"]')
    }
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.zoomToBounds(editor.getShapePageBounds('shape:active-scope'), {
        inset: 130, animation: { duration: 0 },
      })
      return true
    })()`)
    await delay(250)
    await clickElement(page, '.systemsketch-depth-pill__trigger')
    await waitFor(page, `document.querySelector('#systemsketch-depth-stack')`, 'Depth Stack popover')
    const depthText = await evaluate(page,
      `document.querySelector('#systemsketch-depth-stack').textContent.replace(/\\s+/g, ' ').trim()`)
    check('D1', 'the in-slot Depth Stack exposes root and current scope',
      depthText.includes('root canvas') && depthText.includes('run()') && depthText.includes('current scope'), true)
    await screenshot(page, isolationShot)

    const consoleErrors = localConsoleErrors(page)
    check('Q1', 'the physical migration and resize journey emits no local console errors', consoleErrors, [])

    await writeFile(RESULTS, `${JSON.stringify({ checks: results }, null, 2)}\n`)
    assert.ok(results.every((entry) => entry.ok), 'one or more Step In / single-page checks failed')
    process.stdout.write(`\n  ${results.length}/${results.length} browser checks passed\n`)
    process.stdout.write(`  ${migrationShot}\n  ${isolationShot}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(`\n  FAIL  ${error.stack ?? error}`)
  process.exitCode = 1
})
