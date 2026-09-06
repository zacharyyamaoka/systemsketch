#!/usr/bin/env node
/** Prove the inspector aligns the header composition without rewriting title formatting. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'block-header-alignment-live-2026-09-04.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'block-header-alignment-results.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'block-header-alignment.systemsketch')

const { checks, pass } = makeChecklist()

async function headerFacts(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getOnlySelectedShape()
    const face = Array.from(document.querySelectorAll('.systemsketch-block-canvas'))
      .find((candidate) => candidate.closest('[data-shape-id]')?.dataset.shapeId === shape.id)
    const heading = face?.querySelector('.BlockNode-heading')
    const identity = face?.querySelector('[data-testid="block-heading-identity"]')
    const title = face?.querySelector('.BlockNode-headingTitle')
    const meta = face?.querySelector('.BlockNode-headingMeta')
    const draft = face?.querySelector('.BlockNode-definitionBadge')
    if (!shape || !face || !heading || !identity || !title || !meta) return 'null'
    const faceBox = face.getBoundingClientRect()
    const identityBox = identity.getBoundingClientRect()
    const metaBox = meta.getBoundingClientRect()
    return JSON.stringify({
      view: shape.props.view,
      headerAlign: shape.props.headerAlign ?? 'left',
      authoredTitleAlign: shape.props.titleAlign ?? null,
      paintAlign: getComputedStyle(title).textAlign,
      mode: heading.dataset.headerAlign,
      faceLeft: faceBox.left,
      faceRight: faceBox.right,
      faceCenter: faceBox.left + faceBox.width / 2,
      identityLeft: identityBox.left,
      identityCenter: identityBox.left + identityBox.width / 2,
      metaRight: metaBox.right,
      draftText: draft?.textContent?.trim() ?? null,
      draftInsideIdentity: draft ? identity.contains(draft) : null,
    })
  })()`))
}

async function main() {
  const app = await startApp({
    label: 'block-header-alignment',
    build: 'block-header-alignment-smoke',
    width: 1500,
    height: 940,
  })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'block-header-alignment.systemsketch')
    await mkdir(dirname(board), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:header-subject')`, 'header-alignment review fixture')
    await delay(350)

    const boundBefore = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShapePageBounds('shape:header-subject')
      const arrow = editor.getShapePageBounds('shape:cue-step-1-arrow')
      return JSON.stringify({ targetX: target.x, arrowMaxX: arrow.maxX, screen: editor.pageToScreen({ x: target.midX, y: target.midY }) })
    })()`))
    await drag(page, boundBefore.screen, { x: boundBefore.screen.x + 48, y: boundBefore.screen.y })
    const boundAfter = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShapePageBounds('shape:header-subject')
      const arrow = editor.getShapePageBounds('shape:cue-step-1-arrow')
      return JSON.stringify({ targetX: target.x, arrowMaxX: arrow.maxX })
    })()`))
    assert.ok(boundAfter.targetX > boundBefore.targetX + 36)
    assert.ok(boundAfter.arrowMaxX > boundBefore.arrowMaxX + 36)
    pass('the cold-reopened review cue remains bound when its target Block moves')
    await evaluate(page, `window.__systemsketch.editor.undo(); true`)

    await evaluate(page, `window.__systemsketch.editor.select('shape:header-subject'); true`)
    await waitFor(page, `document.querySelector('[data-testid="block-header-align-center"]')`, 'Header alignment inspector control')

    const initial = await headerFacts(page)
    assert.equal(initial.headerAlign, 'left')
    assert.equal(initial.mode, 'left')
    assert.equal(initial.paintAlign, 'left')
    assert.ok(initial.identityLeft - initial.faceLeft >= 10 && initial.identityLeft - initial.faceLeft <= 14)
    pass('existing and newly placed Blocks keep the established left-aligned header by default')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getOnlySelectedShape()
      editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, draftOrdinal: 2 } })
    })()`)
    await waitFor(page, `document.querySelector('.BlockNode-definitionBadge')?.textContent?.includes('Draft 2')`, 'Draft linking badge')

    await clickElement(page, '[data-testid="block-header-align-center"]')
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.props.headerAlign === 'center'`, 'centered header to persist')
    const centered = await headerFacts(page)
    assert.equal(centered.mode, 'center')
    assert.equal(centered.paintAlign, 'center')
    assert.ok(Math.abs(centered.identityCenter - centered.faceCenter) <= 1)
    assert.ok(centered.metaRight <= centered.faceRight - 10)
    assert.equal(centered.draftText, 'Draft 2')
    assert.equal(centered.draftInsideIdentity, true)
    pass('Center puts icon, title, and optional Draft badge on the true midpoint without moving type metadata')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getOnlySelectedShape()
      editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, titleAlign: 'end' } })
    })()`)
    await delay(100)
    const explicitlyFormatted = await headerFacts(page)
    assert.equal(explicitlyFormatted.headerAlign, 'center')
    assert.equal(explicitlyFormatted.authoredTitleAlign, 'end')
    assert.equal(explicitlyFormatted.paintAlign, 'right')
    assert.ok(Math.abs(explicitlyFormatted.identityCenter - explicitlyFormatted.faceCenter) <= 1)
    pass('header composition and the retained per-title alignment remain independent controls')

    await clickElement(page, '[data-testid="block-header-align-left"]')
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.props.headerAlign === 'left'`, 'left header to persist')
    const leftAgain = await headerFacts(page)
    assert.ok(leftAgain.identityLeft - leftAgain.faceLeft >= 10 && leftAgain.identityLeft - leftAgain.faceLeft <= 14)
    assert.equal(leftAgain.authoredTitleAlign, 'end')
    pass('Left restores the established header composition without erasing title-box formatting')

    await clickElement(page, '[data-testid="block-header-align-center"]')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getOnlySelectedShape()
      editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, titleAlign: undefined } })
    })()`)
    await clickElement(page, '[data-inspector-section="View"] [aria-label="Block view"] button:nth-child(3)')
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.props.view === 'expanded'`, 'Expanded view')
    const expanded = await headerFacts(page)
    assert.equal(expanded.headerAlign, 'center')
    assert.equal(expanded.paintAlign, 'center')
    assert.ok(Math.abs(expanded.identityCenter - expanded.faceCenter) <= 1)
    pass('the same persisted option centers both Port and Expanded headers')

    await clickElement(page, '[data-inspector-section="View"] [aria-label="Block view"] button:nth-child(2)')
    await waitFor(page, `window.__systemsketch.editor.getOnlySelectedShape()?.props.view === 'port'`, 'Port view for the review capture')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(page), [])
    pass('the real browser journey produced zero local console errors')

    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
