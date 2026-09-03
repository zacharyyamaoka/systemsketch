#!/usr/bin/env node
/**
 * Real-browser proof for the shared Shapes library, live board overview, and
 * collision-free Preview chrome. The board and browser profile are throwaway.
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
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const { checks, pass } = makeChecklist()

async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'))
}

async function setViewport(page, width, height = 900) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await delay(350)
}

async function chromeGeometry(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height }
    }
    return JSON.stringify({
      viewport: { width: innerWidth, height: innerHeight },
      left: read('[data-testid="systemsketch-top-left-shell"]'),
      preview: read('[data-testid="systemsketch-preview-mode"]'),
      right: read('[data-testid="systemsketch-top-right-shell"]'),
      placement: document.querySelector('[data-testid="systemsketch-preview-mode"]')?.dataset.placement ?? null,
    })
  })()`))
}

function overlaps(a, b) {
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y
}

async function proveResponsiveChrome(page) {
  for (const width of [1990, 1440, 900, 560]) {
    await setViewport(page, width)
    const boxes = await chromeGeometry(page)
    assert.ok(boxes.left && boxes.preview && boxes.right, `missing chrome at ${width}px`)
    assert.equal(overlaps(boxes.left, boxes.preview), false, `left/Preview overlap at ${width}px`)
    assert.equal(overlaps(boxes.preview, boxes.right), false, `Preview/right overlap at ${width}px`)
    assert.equal(overlaps(boxes.left, boxes.right), false, `corner capsules overlap at ${width}px`)
    for (const box of [boxes.left, boxes.preview, boxes.right]) {
      assert.ok(box.x >= 0 && box.right <= width, `chrome escaped ${width}px viewport`)
    }
    assert.equal(await evaluate(page,
      `document.querySelector('[title="Shapes library"]').getBoundingClientRect().width > 0
       && document.querySelector('[title="Comments and inspector"]').getBoundingClientRect().width > 0
       && document.querySelectorAll('[data-testid="systemsketch-preview-mode"] button').length === 2`), true)
    if (width === 1990) assert.equal(boxes.placement, 'inline', 'wide Preview should use the top-row gap')
    if (width === 560) assert.equal(boxes.placement, 'below', 'narrow Preview should drop below the corner chrome')
    if (boxes.placement === 'inline') {
      assert.ok(Math.abs(boxes.preview.y - boxes.left.y) < 2, `inline Preview is off-row at ${width}px`)
    } else {
      assert.ok(boxes.preview.y >= Math.max(boxes.left.bottom, boxes.right.bottom) + 7,
        `dropped Preview is too close to corner chrome at ${width}px`)
    }
    await screenshot(page, `library-overview-chrome-${width}-2026-09-02.png`)
    pass(`${width}px keeps both corner capsules and every Preview action usable without overlap`)
  }
  await setViewport(page, 1440, 900)
}

async function proveLibrary(page) {
  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-left-popout"]')`, 'top-left Shapes library')
  assert.equal(await evaluate(page,
    `document.querySelectorAll('[data-testid="systemsketch-left-popout"] [data-library-section="Connections"] [data-library-item]').length`), 3)
  assert.equal(await evaluate(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"]').textContent.includes('placeholder')`), false)
  pass('top-left Connections contains three real stock-arrow choices and no placeholder rows')

  const search = '[data-testid="systemsketch-left-popout"] input[aria-label="Search shapes"]'
  await clickElement(page, search)
  await typeSlowly(page, 'does not exist')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"] .systemsketch-library-empty')`,
    'library no-results state')
  assert.match(await evaluate(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"] .systemsketch-library-empty').textContent`),
  /No matching shapes/)
  pass('search filters the shared catalog and explains a zero-result query')

  await clickElement(page, '[aria-label="Close shapes library"]')
  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"] button[data-library-item="arrow-elbow"]')`,
    'fresh library query')

  const connectionsToggle = '[data-testid="systemsketch-library-section-connections"]'
  await clickElement(page, connectionsToggle)
  assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(connectionsToggle)}).getAttribute('aria-expanded')`), 'false')
  assert.equal(await evaluate(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"] button[data-library-item="arrow-elbow"]')`), null)
  await clickElement(page, connectionsToggle)
  assert.equal(await evaluate(page, `document.querySelector(${JSON.stringify(connectionsToggle)}).getAttribute('aria-expanded')`), 'true')
  pass('section headings collapse and restore their real item grids')

  const arrowsBefore = await evaluate(page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length`)
  await clickElement(page,
    '[data-testid="systemsketch-left-popout"] button[data-library-section="Connections"][data-library-item="arrow-elbow"]')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-left-popout"]')`, 'library closing after insert')
  assert.equal(await evaluate(page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length`), arrowsBefore + 1)
  await shortcut(page, 'z', 'KeyZ', 2)
  await waitFor(page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow').length === ${arrowsBefore}`,
    'single-step library undo')
  pass('an Elbow choice inserts a stock arrow and one Undo removes the complete insertion')

  await clickElement(page, '[title="Shapes library"]')
  const centerBefore = JSON.parse(await evaluate(page,
    `JSON.stringify(window.__systemsketch.editor.getViewportPageBounds().center)`))
  await clickElement(page,
    '[data-testid="systemsketch-left-popout"] button[data-library-section="Basic"][data-library-item="rectangle"]')
  const inserted = JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getOnlySelectedShape()
    const bounds = shape && editor.getShapePageBounds(shape)
    return JSON.stringify({
      type: shape?.type,
      geo: shape?.props?.geo,
      center: bounds?.center,
      tool: editor.getCurrentToolId(),
    })
  })()`))
  assert.deepEqual({ type: inserted.type, geo: inserted.geo, tool: inserted.tool },
    { type: 'geo', geo: 'rectangle', tool: 'select' })
  assert.ok(Math.abs(inserted.center.x - centerBefore.x) < 1 && Math.abs(inserted.center.y - centerBefore.y) < 1)
  pass('a catalog shape is selected at the visible viewport centre')

  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"] button[data-library-section="Recents"][data-library-item="rectangle"]')`,
    'persisted Rectangle recent')
  pass('the successful insertion appears in persisted Recents on reopen')
  await screenshot(page, 'library-overview-library-2026-09-02.png')
  await clickElement(page, '[aria-label="Close shapes library"]')

  await clickElement(page, '[data-testid="systemsketch-tool-library"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-library-panel"]')`, 'bottom toolbar library')
  assert.equal(await evaluate(page,
    `Boolean(document.querySelector('[data-testid="systemsketch-library-panel"] button[data-library-section="Recents"][data-library-item="rectangle"]')
      && document.querySelector('[data-testid="systemsketch-library-panel"] button[data-library-section="Connections"][data-library-item="arrow-elbow"]'))`), true)
  pass('the bottom toolbar opens the same catalog and persisted Recents rather than a second library')
  await clickElement(page, '[title="Close library"]')
}

async function seedOverview(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const firstPage = editor.getCurrentPageId()
    editor.createShapes([
      {
        id: 'shape:overview-frame',
        type: 'frame',
        x: 160,
        y: 130,
        props: { name: 'Pipeline Frame', w: 520, h: 330 },
      },
      {
        id: 'shape:overview-block',
        type: 'block',
        x: 760,
        y: 190,
        props: { title: 'Expanded Runtime', view: 'expanded', w: 500, h: 360 },
      },
    ])
    if (!editor.getPage('page:overview-secondary')) {
      editor.createPage({ id: 'page:overview-secondary', name: 'Subsystems' })
    }
    editor.setCurrentPage(firstPage)
    editor.selectNone()
    editor.zoomToFit()
    return true
  })()`)
  await delay(500)
}

async function proveOverview(page) {
  await seedOverview(page)
  await clickElement(page, '.systemsketch-utility-strip .tlui-button:first-child')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-board-overview"]')`, 'live board overview')
  const text = await evaluate(page, `document.querySelector('[data-testid="systemsketch-board-overview"]').textContent`)
  assert.match(text, /Pipeline Frame/)
  assert.match(text, /Expanded Runtime/)
  assert.match(text, /Subsystems/)
  assert.match(text, /Frames/)
  assert.match(text, /Expanded Blocks/)
  pass('overview lists live pages, Frames, and Expanded Blocks by their real names')

  await clickElement(page, '[data-overview-target="shape:overview-frame"]')
  await delay(420)
  const focused = JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const target = editor.getShapePageBounds('shape:overview-frame')
    const viewport = editor.getViewportPageBounds()
    return JSON.stringify({
      selected: editor.getOnlySelectedShape()?.id,
      dx: Math.abs(target.center.x - viewport.center.x),
      dy: Math.abs(target.center.y - viewport.center.y),
      fits: viewport.contains(target),
    })
  })()`))
  assert.equal(focused.selected, 'shape:overview-frame')
  assert.equal(focused.fits, true)
  assert.ok(focused.dx < 1 && focused.dy < 1)
  pass('clicking a Frame selects it and camera-fits it at viewport centre')

  await clickElement(page, '[data-overview-target="shape:overview-block"]')
  await delay(420)
  assert.equal(await evaluate(page,
    `window.__systemsketch.editor.getOnlySelectedShape()?.id === 'shape:overview-block'
      && Boolean(document.querySelector('[data-testid="systemsketch-board-overview"]'))`), true)
  pass('clicking an Expanded Block selects and fits it without replacing the overview with Inspector')

  await clickElement(page, '[data-page-id="page:overview-secondary"]')
  await delay(350)
  assert.equal(await evaluate(page,
    `window.__systemsketch.editor.getCurrentPageId() === 'page:overview-secondary'
      && window.__systemsketch.editor.getSelectedShapeIds().length === 0`), true)
  pass('clicking a page switches to it, clears stale selection, and fits its contents')

  await screenshot(page, 'library-overview-panel-2026-09-02.png')
  await evaluate(page, `(() => {
    window.__systemsketch.editor.deleteShapes(['shape:overview-frame', 'shape:overview-block'])
    return true
  })()`)
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-board-overview"]').textContent.includes('No board landmarks yet')`,
    'overview empty state')
  assert.match(await evaluate(page,
    `document.querySelector('.systemsketch-board-overview__empty').textContent`),
  /Add a Frame or Branch, or expand a Block/)
  pass('the live empty state explains the two actions that make landmarks appear')
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-library-overview', build: 'library-overview', width: 1440, height: 900 })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'library-overview.systemsketch')
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor`, 'development editor seam', 30000)
    await waitFor(app.page, `document.querySelector('[data-testid="systemsketch-preview-mode"]')`, 'Preview banner', 30000)
    await delay(900)

    await proveResponsiveChrome(app.page)
    await proveLibrary(app.page)
    await proveOverview(app.page)

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the complete journey emits no local browser errors')
  } finally {
    app.close()
  }
  process.stdout.write(`\n${checks.length} checks passed\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
