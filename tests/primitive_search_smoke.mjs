#!/usr/bin/env node
/** Real-browser proof for the cursor-local, primitive-only S search. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'primitive-search-smoke.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'primitive-search.systemsketch')
const { checks, pass } = makeChecklist()

async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'))
}

async function geometry(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const search = document.querySelector('[data-testid="systemsketch-primitive-search"]')
    const toolbar = document.querySelector('[data-testid="systemsketch-tool-library"]')?.closest('.tlui-main-toolbar')
    const rect = search?.getBoundingClientRect()
    const toolbarRect = toolbar?.getBoundingClientRect()
    return JSON.stringify({
      search: rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      toolbarTop: toolbarRect?.top ?? innerHeight,
      viewport: { width: innerWidth, height: innerHeight },
      horizontal: search?.dataset.horizontal,
      vertical: search?.dataset.vertical,
    })
  })()`))
}

async function main() {
  const app = await startApp({ label: 'systemsketch-primitive-search', width: 1440, height: 900 })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'primitive-search.systemsketch')
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor && document.querySelector('[data-testid="systemsketch-tool-library"]')`, 'product canvas')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:function')`, 'saved review function')
    await evaluate(page, `(() => { window.__systemsketch.editor.zoomToFit(); return true })()`)
    await delay(500)

    const followed = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShape('shape:function')
      const endpoint = () => {
        const arrow = editor.getShape('shape:cue-step-1-arrow')
        const handle = editor.getShapeHandles(arrow)?.find((item) => item.id === 'end')
        return editor.getShapePageTransform(arrow.id).applyToPoint(handle)
      }
      const before = endpoint()
      editor.updateShape({ id: target.id, type: target.type, x: target.x + 64 })
      const after = endpoint()
      editor.updateShape({ id: target.id, type: target.type, x: target.x })
      return JSON.stringify({ dx: Math.round(after.x - before.x), dy: Math.round(after.y - before.y) })
    })()`))
    assert.deepEqual(followed, { dx: 64, dy: 0 })
    pass('the saved review fixture cold-opens and its bound step cue follows the function target')

    const point = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.pageToScreen({ x: 790, y: 390 }))`))
    await clickAt(page, point.x, point.y)
    await shortcut(page, 's', 'KeyS')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-primitive-search"]')`, 'S primitive search')
    assert.equal(await evaluate(page,
      `document.activeElement?.getAttribute('aria-label')`), 'Search primitives')
    const initial = await geometry(page)
    assert.ok(initial.search.width <= 304 && initial.search.height < 100)
    assert.ok(initial.search.x >= point.x && initial.search.y >= point.y)
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('.systemsketch-command-palette'))`), false)
    pass('plain S opens a focused, sub-100px primitive search beside the pointer without the command modal')

    await typeSlowly(page, 'arrow')
    await waitFor(page,
      `document.querySelectorAll('[data-testid="systemsketch-primitive-search"] [data-library-item]').length === 3`,
      'three arrow primitives')
    assert.deepEqual(JSON.parse(await evaluate(page, `JSON.stringify(
      Array.from(document.querySelectorAll('[data-testid="systemsketch-primitive-search"] [data-library-item]'))
        .map((node) => node.dataset.libraryItem)
    )`)), ['arrow-straight', 'arrow-curve', 'arrow-elbow'])
    assert.equal(await evaluate(page,
      `document.querySelector('[data-testid="systemsketch-primitive-search"]').textContent.includes('Insert Block')`), false)
    pass('querying arrow returns only the three canonical library primitives and no commands')

    await key(page, 'ArrowDown', 'ArrowDown')
    assert.equal(await evaluate(page,
      `document.querySelector('[data-testid="systemsketch-primitive-search-arrow-curve"]').getAttribute('aria-selected')`), 'true')
    await screenshot(page, 'primitive-search-filtered-2026-09-04.png')
    const shapeCountBeforeChoice = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().length`)
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-primitive-search"]')`, 'search closing after Enter')
    const armed = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        shapeCount: editor.getCurrentPageShapes().length,
        tool: editor.getCurrentToolId(),
        toolbarActive: document.querySelector('[data-testid="systemsketch-tool-shape"]')?.getAttribute('aria-pressed'),
      })
    })()`))
    assert.deepEqual(armed, {
      shapeCount: shapeCountBeforeChoice,
      tool: 'arrow',
      toolbarActive: 'true',
    })

    const arrowCountBeforeDrawing = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length`)
    const arrowStart = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.pageToScreen({ x: 780, y: 385 }))`))
    const arrowEnd = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.pageToScreen({ x: 940, y: 490 }))`))
    await drag(page, arrowStart, arrowEnd)
    await waitFor(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length === ${arrowCountBeforeDrawing + 1}`,
      'canvas drag drawing the armed arrow')
    const drawn = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getOnlySelectedShape()
      return JSON.stringify({
        id: shape?.id,
        type: shape?.type,
        kind: shape?.props?.kind,
        bend: shape?.props?.bend,
      })
    })()`))
    assert.equal(drawn.type, 'arrow')
    assert.equal(drawn.kind, 'arc')
    assert.ok(Math.abs(drawn.bend) > 0)
    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page, `!window.__systemsketch.editor.getShape(${JSON.stringify(drawn.id)})`, 'one-step drawing undo')
    pass('ArrowDown + Enter arms the real Curved arrow tool without inserting; the following canvas drag draws it, and one Undo removes it')

    await clickElement(page, '[title="Shapes library"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-left-popout"] input[aria-label="Search shapes"]')`, 'library search input')
    await clickElement(page, '[data-testid="systemsketch-left-popout"] input[aria-label="Search shapes"]')
    await shortcut(page, 's', 'KeyS')
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="systemsketch-primitive-search"]'))`), false)
    pass('S remains ordinary typing while a library input owns focus')
    await clickElement(page, '[aria-label="Close shapes library"]')

    await shortcut(page, 'p', 'KeyP', 2)
    await waitFor(page, `document.querySelector('.systemsketch-command-palette')`, 'existing command palette')
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="systemsketch-primitive-search"]'))`), false)
    pass('Ctrl+P still opens the existing large Commands modal as a separate surface')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.systemsketch-command-palette')`, 'command palette closing')

    if (await evaluate(page, `Boolean(document.querySelector('[data-testid="systemsketch-right-popout-close"]'))`)) {
      await clickElement(page, '[data-testid="systemsketch-right-popout-close"]')
    }

    const corner = { x: 1400, y: 805 }
    await mouse(page, 'mouseMoved', corner.x, corner.y)
    await evaluate(page, `(() => { window.__systemsketch.editor.focus(); return true })()`)
    await shortcut(page, 's', 'KeyS')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-primitive-search"]')`, 'corner primitive search')
    await typeSlowly(page, 'arrow')
    const cornerGeometry = await geometry(page)
    assert.equal(cornerGeometry.horizontal, 'left')
    assert.equal(cornerGeometry.vertical, 'above')
    assert.ok(cornerGeometry.search.x >= 0 && cornerGeometry.search.right <= cornerGeometry.viewport.width)
    assert.ok(cornerGeometry.search.y >= 0 && cornerGeometry.search.bottom < cornerGeometry.toolbarTop)
    await screenshot(page, 'primitive-search-corner-2026-09-04.png')
    pass('the result stack flips above-left at the corner and stays inside the canvas above the toolbar')

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [])
    pass('the complete primitive-search journey produced no local console errors')

    await writeFile(OUT, JSON.stringify(checks, null, 2))
    console.log(`primitive search: ${checks.length}/${checks.length} checks passed`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
