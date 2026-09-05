#!/usr/bin/env node
/**
 * Real-browser proof for the deliberately quiet Slanted arrow route.
 *
 * This is not a menu-option assertion. The journey selects a real stock arrow,
 * turns on Slanted in the Inspector, and reads the painted SVG back from the
 * browser: the first leg must be horizontal and the end marker must follow the
 * final diagonal. It then returns to Straight and proves the namespaced route
 * metadata is gone again.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []

function pass(id, detail) {
  results.push({ id, detail, ok: true })
  process.stdout.write(`  PASS  ${id}  ${detail}\n`)
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-slanted-arrow' })
  try {
    const { page, port } = app
    await openApp(page, port, '')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app')
    await waitFor(page, `document.querySelector('.tl-canvas')`, 'the canvas')

    // Use the actual editor to seed a normal tldraw arrow. The interaction
    // under test starts at the Inspector, just as it does for a user who has
    // drawn or selected an arrow by any stock gesture.
    const arrowId = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const id = 'shape:slanted-proof'
      editor.createShape({
        id,
        type: 'arrow',
        x: 330,
        y: 480,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 540, y: -250 },
          kind: 'arc',
          bend: 0,
    size: 'xl',
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
        },
      })
      editor.select(id)
      return JSON.stringify(id)
    })()`))
    await waitFor(page, `document.querySelector('[data-testid="shape-facts-arrow-routing-slanted"]')`, 'the arrow routing controls')
    await delay(360)

    const inspector = JSON.parse(await evaluate(page, `(() => {
      const panel = document.querySelector('[data-testid="systemsketch-shape-facts"]')
      const slanted = document.querySelector('[data-testid="shape-facts-arrow-routing-slanted"]')
      return JSON.stringify({
        panel: !!panel,
        slantedLabel: slanted?.textContent?.trim(),
        slantedPressed: slanted?.getAttribute('aria-pressed'),
        iconPath: slanted?.querySelector('svg path')?.getAttribute('d'),
      })
    })()`))
    assert.deepEqual(inspector, {
      panel: true,
      slantedLabel: 'Slanted',
      slantedPressed: 'false',
      iconPath: 'M 3 17 H 20 L 33 4',
    })
    pass('SLANTED-1', 'the Inspector alone exposes the requested horizontal-then-diagonal icon')
    await shot(page, 'slanted-arrow-inspector-live-2026-09-04.png')

    // The compact tool menu is intentionally unchanged: Slanted is an unusual
    // branch/behaviour-tree affordance, not a fourth everyday arrow tool.
    const tool = await elementBox(page, '[data-testid="systemsketch-tool-shape"]')
    await clickAt(page, tool.x + tool.width / 2, tool.y + tool.height / 2)
    await delay(220)
    const quickMenu = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
        .map((item) => item.textContent?.trim())
    ))()`))
    assert.equal(quickMenu.some((label) => label?.includes('Slanted')), false)
    pass('SLANTED-2', 'the quick arrow menu stays limited to the common presets')
    await key(page, 'Escape', 'Escape')
    await delay(160)

    const slantedButton = await elementBox(page, '[data-testid="shape-facts-arrow-routing-slanted"]')
    await clickAt(page, slantedButton.x + slantedButton.width / 2, slantedButton.y + slantedButton.height / 2)
    await waitFor(page, `document.querySelector('[data-testid="shape-facts-arrow-routing-slanted"]')?.getAttribute('aria-pressed') === 'true'`, 'Slanted to become selected')
    await delay(320)

    const painted = JSON.parse(await evaluate(page, `(() => {
      const shape = document.querySelector('[data-shape-id="${arrowId}"]')
      const body = shape?.querySelector('.systemsketch-slanted-arrow__body')
      const paths = body ? Array.from(body.querySelectorAll('g > path')) : []
      const shaft = paths.find((path) => path.getAttribute('stroke') !== 'none')
      const markerCarrier = paths.find((path) => path.getAttribute('marker-end'))
      if (!shaft || !markerCarrier) return JSON.stringify(null)
      const length = shaft.getTotalLength()
      const point = (fraction) => {
        const raw = shaft.getPointAtLength(length * fraction)
        const screen = raw.matrixTransform(shaft.getScreenCTM())
        return { x: Math.round(screen.x), y: Math.round(screen.y) }
      }
      const markerId = markerCarrier.getAttribute('marker-end')?.match(/#([^)]*)/)?.[1]
      const marker = markerId ? document.getElementById(markerId) : null
    const stockHead = shape?.querySelector('.systemsketch-authored-arrow__stock--replace-head > .tl-svg-container > g > path')
      return JSON.stringify({
        d: shaft.getAttribute('d'),
        length: Math.round(length),
        start: point(0),
        early: point(.12),
        late: point(.86),
        end: point(1),
        markerOrient: marker?.getAttribute('orient'),
    markerUnits: marker?.getAttribute('markerUnits'),
    markerPath: marker?.querySelector('path')?.getAttribute('d'),
    stockHeadVisibility: stockHead ? getComputedStyle(stockHead).visibility : null,
        meta: window.__systemsketch.editor.getShape('${arrowId}')?.meta?.systemSketchSlantedArrow?.version ?? null,
      })
    })()`))
    assert.ok(painted?.d, `the custom slanted shaft did not paint: ${JSON.stringify(painted)}`)
    assert.equal(painted.meta, 1, 'Slanted is not persisted as a versioned metadata extension')
  assert.ok(Math.abs(painted.early.y - painted.start.y) <= 2,
      `the first rendered leg is not horizontal: ${JSON.stringify(painted)}`)
    assert.notEqual(painted.late.y, painted.end.y,
      `the final rendered leg is not diagonal: ${JSON.stringify(painted)}`)
    assert.deepEqual([painted.markerOrient, painted.markerUnits, painted.markerPath, painted.stockHeadVisibility], ['auto', 'strokeWidth', 'M 0 0 L 6 3 L 0 6', 'hidden'],
      `the endpoint does not use browser-oriented arrowhead geometry: ${JSON.stringify(painted)}`)
    pass('SLANTED-3', `the XL painted route has a horizontal lead and browser-oriented diagonal head (${painted.length}px)`)

  // Its elbow follows stock control semantics: reveal the selected route,
  // expose a virtual default point, then use a real pointer drag to author it.
  await mouse(page, 'mouseMoved', painted.early.x, painted.early.y)
  await waitFor(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${arrowId}')
    return editor.getShapeHandles(shape)?.some((handle) => handle.id === 'systemsketch-slanted-elbow')
  })()`, 'the Slanted elbow control')
  const initialElbow = JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${arrowId}')
    const handle = editor.getShapeHandles(shape)?.find((item) => item.id === 'systemsketch-slanted-elbow')
    if (!handle) return JSON.stringify(null)
    const pagePoint = editor.getShapePageTransform(shape.id).applyToPoint(handle)
    return JSON.stringify({
      type: handle.type,
      x: handle.x,
      y: handle.y,
      screen: editor.pageToScreen(pagePoint),
      hasStoredElbow: Object.hasOwn(shape.meta.systemSketchSlantedArrow ?? {}, 'elbowT'),
    })
  })()`))
  assert.equal(initialElbow.type, 'virtual', `the untouched elbow should be virtual: ${JSON.stringify(initialElbow)}`)
  assert.equal(initialElbow.hasStoredElbow, false,
    `an untouched Slanted arrow should not persist a manual elbow: ${JSON.stringify(initialElbow)}`)
  await drag(page, initialElbow.screen, {
    x: initialElbow.screen.x + 120,
    y: initialElbow.screen.y + 80,
  })
  await waitFor(page, `typeof window.__systemsketch.editor.getShape('${arrowId}')?.meta?.systemSketchSlantedArrow?.elbowT === 'number'`, 'the dragged Slanted elbow metadata')
  // The shared reveal policy hides interior controls while the pointer is
  // outside the route rectangle. Re-enter the shaft before reading the
  // post-drag vertex, exactly as a person would after releasing it.
  await mouse(page, 'mouseMoved', painted.early.x, painted.early.y)
  await waitFor(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${arrowId}')
    return editor.getShapeHandles(shape)?.some((handle) => handle.id === 'systemsketch-slanted-elbow')
  })()`, 'the authored Slanted elbow control')
  const draggedElbow = JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${arrowId}')
    const handle = editor.getShapeHandles(shape)?.find((item) => item.id === 'systemsketch-slanted-elbow')
    const body = document.querySelector('[data-shape-id="${arrowId}"] .systemsketch-slanted-arrow__body')
    const shaft = body ? Array.from(body.querySelectorAll('g > path')).find((path) => !path.getAttribute('marker-end')) : null
    if (!handle || !shaft) return JSON.stringify(null)
    const length = shaft.getTotalLength()
    const point = (fraction) => {
      const raw = shaft.getPointAtLength(length * fraction)
      return { x: Math.round(raw.x), y: Math.round(raw.y) }
    }
    return JSON.stringify({
      type: handle.type,
      handle: { x: Math.round(handle.x), y: Math.round(handle.y) },
      storedT: shape.meta.systemSketchSlantedArrow?.elbowT,
      start: shape.props.start,
      early: point(.12),
      end: point(1),
    })
  })()`))
  assert.equal(draggedElbow.type, 'vertex', `the dragged elbow did not become persistent: ${JSON.stringify(draggedElbow)}`)
  assert.equal(draggedElbow.handle.y, draggedElbow.start.y,
    `the elbow drag must only move the horizontal lead: ${JSON.stringify(draggedElbow)}`)
  assert.ok(draggedElbow.storedT > 0.4 && draggedElbow.storedT < 1,
    `the dragged elbow was not saved as a relative endpoint-span position: ${JSON.stringify(draggedElbow)}`)
  assert.ok(Math.abs(draggedElbow.early.y - draggedElbow.start.y) <= 2,
      `the authored control broke the horizontal departure: ${JSON.stringify(draggedElbow)}`)
  pass('SLANTED-4', 'a virtual default elbow becomes a persistent horizontal-only control after a real drag')
    await shot(page, 'slanted-arrow-canvas-live-2026-09-04.png')

    const straightButton = await elementBox(page, '[data-testid="shape-facts-arrow-routing-straight"]')
    const straightPoint = {
      x: straightButton.x + straightButton.width / 2,
      y: straightButton.y + straightButton.height / 2,
    }
    const straightTarget = JSON.parse(await evaluate(page, `(() => {
      const point = { x: ${straightPoint.x}, y: ${straightPoint.y} }
      const target = document.elementFromPoint(point.x, point.y)
      return JSON.stringify({
        target: target?.closest('button')?.dataset?.testid ?? target?.tagName,
        selected: window.__systemsketch.editor.getSelectedShapes().map((shape) => ({ id: shape.id, type: shape.type })),
      })
    })()`))
    assert.equal(straightTarget.target, 'shape-facts-arrow-routing-straight',
      `the physical pointer cannot reach the Straight control: ${JSON.stringify(straightTarget)}`)
    await clickAt(page, straightPoint.x, straightPoint.y)
    await delay(240)
    const resetButton = JSON.parse(await evaluate(page, `(() => JSON.stringify({
      pressed: document.querySelector('[data-testid="shape-facts-arrow-routing-straight"]')?.getAttribute('aria-pressed'),
      route: window.__systemsketch.editor.getShape('${arrowId}')?.meta?.systemSketchSlantedArrow ?? null,
    }))()`))
    assert.deepEqual(resetButton, { pressed: 'true', route: null },
      `Straight did not become selected: ${JSON.stringify({ resetButton, straightTarget })}`)
    const reset = JSON.parse(await evaluate(page, `(() => {
      const shape = document.querySelector('[data-shape-id="${arrowId}"]')
      return JSON.stringify({
        slantedBody: !!shape?.querySelector('.systemsketch-slanted-arrow__body'),
        metadata: window.__systemsketch.editor.getShape('${arrowId}')?.meta?.systemSketchSlantedArrow ?? null,
      })
    })()`))
    assert.deepEqual(reset, { slantedBody: false, metadata: null })
    pass('SLANTED-5', 'Straight cleanly returns the selected arrow to stock rendering')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('CLEAN', 'the real browser reported no console errors')
  } finally {
    app.close()
  }

  await writeFile(join(SHOTS, 'slanted-arrow-results-2026-09-04.json'), JSON.stringify(results, null, 2))
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
