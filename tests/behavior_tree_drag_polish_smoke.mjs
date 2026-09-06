/**
 * Tree-view drag polish, driven in a real browser: the two pieces from
 * Zach's 2026-09-05 interaction recordings that are independent of the drag
 * engine —
 *
 *   1. wire live-tracking — while a node is natively translated in a tidy
 *      Tree view, every control wire touching it reads the node's LIVE rect
 *      (top/bottom anchor), instead of pinning to a stale tidy slot and
 *      jumping only when a reorder commits (`liveDragWires.ts`); on drop the
 *      wire settles back onto the committed tidy layout.
 *   2. the Spacing slider — `spacingScale` in the Inspector's View section
 *      scales TREE_LEVEL_GAP/TREE_SIBLING_GAP and PROCESS_GAP through the
 *      one existing layout pipeline, persists on the region, and the live
 *      drag resolution reads the SAME scaled layout the pointer moves over.
 *
 * Run BEFORE the fix, the wire checks fail with the measured lag distance —
 * that failing run is the recorded "before" evidence; green is the "after".
 *
 * Every claim is read back from the editor or the painted SVG `d` attributes,
 * never inferred from screenshots alone; screenshots land in
 * docs/assets/behavior-tree-drag-polish/ for a human to look at.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-drag-polish')
const REGION = 'shape:bt-drag-polish'

const results = []
const pending = []
let journeyError = null

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`))
  return ok
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  pending.push({ name, data: Buffer.from(capture.data, 'base64') })
}

const regionProp = (page, key) => evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('${REGION}')?.props.${key} ?? null)`).then(JSON.parse)

async function createRegion(page, xml, patch = {}) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { ...${JSON.stringify(patch)}, xml: ${JSON.stringify(xml)}, title: 'Drag polish' } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length > 0`, 'the region to project')
  await delay(300)
}

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function nodeCentre(page, path) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
    })
    if (!id) return null
    const bounds = editor.getShapePageBounds(id)
    const point = editor.pageToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 })
    return { x: point.x, y: point.y }
  })())`))
}

const shapeIdAtPath = (page, path) => evaluate(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').find((c) => {
  const shape = window.__systemsketch.editor.getShape(c)
  return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
}) ?? null`)

/**
 * The painter's own answer, read straight from the region's SVG layer: over
 * every painted control wire's LAST point (region-local, same space as a
 * child shape's x/y), the distance to the shape's entry anchor (top-center
 * when top-to-bottom) — and over every FIRST point, the distance to its exit
 * anchor. Before the fix, mid-drag, both grow to wherever the stale tidy
 * slot sits; after it, one wire tracks each anchor within a pixel.
 */
const wireGaps = (page, shapeId) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const shape = editor.getShape(${JSON.stringify(shapeId)})
  if (!shape) return null
  const enter = { x: shape.x + shape.props.w / 2, y: shape.y }
  const exit = { x: shape.x + shape.props.w / 2, y: shape.y + shape.props.h }
  const container = document.querySelector('[data-testid="bt-region-' + '${REGION}' + '"]')
  const wires = [...container.querySelectorAll('path.BehaviorTree-wire')]
  const pointsOf = (d) => {
    const numbers = d.match(/-?\\d+(?:\\.\\d+)?/g).map(Number)
    const pts = []
    for (let i = 0; i + 1 < numbers.length; i += 2) pts.push({ x: numbers[i], y: numbers[i + 1] })
    return pts
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  let toEnter = Infinity
  let fromExit = Infinity
  for (const wire of wires) {
    const pts = pointsOf(wire.getAttribute('d'))
    if (pts.length < 2) continue
    toEnter = Math.min(toEnter, dist(pts[pts.length - 1], enter))
    fromExit = Math.min(fromExit, dist(pts[0], exit))
  }
  return { toEnter: Math.round(toEnter * 100) / 100, fromExit: Math.round(fromExit * 100) / 100 }
})())`).then(JSON.parse)

async function slowDrag(page, from, to, steps, onStep) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  await delay(60)
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + (to.x - from.x) * step / steps
    const y = from.y + (to.y - from.y) * step / steps
    await mouse(page, 'mouseMoved', x, y, { buttons: 1 })
    await delay(40)
    if (onStep) await onStep(step, { x, y })
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(300)
}

/** Drive a real range input the way React hears it. */
async function setRange(page, selector, value) {
  await evaluate(page, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!input) return null
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(String(value))})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return null
  })()`)
  await delay(250)
}

/** Region-local vertical gap between two nodes' boxes, straight off the shapes. */
const levelGap = (page, abovePath, belowPath) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const at = (path) => {
    const id = editor.getSortedChildIdsForParent('${REGION}').find((c) => {
      const shape = editor.getShape(c)
      return shape.meta.btRole === 'node' && shape.meta.btPath === path
    })
    const shape = editor.getShape(id)
    return { y: shape.y, h: shape.props.h }
  }
  const above = at(${JSON.stringify(abovePath)})
  const below = at(${JSON.stringify(belowPath)})
  return Math.round((below.y - (above.y + above.h)) * 100) / 100
})())`).then(JSON.parse)

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-drag-polish', build: 'bt-drag-polish-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    const sampleXml = await evaluate(page, 'window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML')

    // ==================================================================
    // 1. Wire live-tracking, straight edges: drag CloseGrip (0.2) leftward
    //    across its whole row. At EVERY sampled mid-drag frame, some wire's
    //    endpoint must sit on the dragged card's own live top-center.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    const closeGripId = await shapeIdAtPath(page, '0.2')
    const closeGrip = await nodeCentre(page, '0.2')
    const subTree = await nodeCentre(page, '0.0')
    const gapsDuringDrag = []
    await slowDrag(page, closeGrip, { x: subTree.x - 140, y: subTree.y }, 10, async (step) => {
      if (step >= 2 && step <= 9) {
        const gaps = await wireGaps(page, closeGripId)
        if (gaps) gapsDuringDrag.push(gaps.toEnter)
        if (step === 5) await shot(page, 'wire-tracking-mid-drag.png')
      }
    })
    const worstMidDragGap = Math.max(...gapsDuringDrag)
    check('wire.samples', 'mid-drag frames were actually sampled', gapsDuringDrag.length, 8)
    check('wire.live-tracking', `the wire endpoint rides the dragged card every sampled frame (worst gap ${worstMidDragGap}px, per-step ${JSON.stringify(gapsDuringDrag)})`,
      worstMidDragGap <= 1.5, true)
    const settled = await wireGaps(page, closeGripId)
    check('wire.settles-on-drop', 'after the drop, the wire sits on the settled tidy anchor too', settled.toEnter <= 1.5, true)
    await shot(page, 'wire-tracking-after-drop.png')

    // ==================================================================
    // 2. Same rule for a dragged COMPOSITE: the Fallback keeps its incoming
    //    wire on its live top-center and its outgoing child wires leaving
    //    its live bottom-center, even while it is held between two slots.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    const fallbackId = await shapeIdAtPath(page, '0.1')
    const fallback = await nodeCentre(page, '0.1')
    let compositeGaps = null
    await slowDrag(page, fallback, { x: fallback.x + 46, y: fallback.y - 24 }, 6, async (step) => {
      if (step === 4) {
        compositeGaps = await wireGaps(page, fallbackId)
        await shot(page, 'wire-tracking-composite-mid-drag.png')
      }
    })
    check('wire.composite-in', `a mid-slot-held composite keeps its incoming wire on its live top-center (gap ${compositeGaps?.toEnter}px)`,
      compositeGaps !== null && compositeGaps.toEnter <= 1.5, true)
    check('wire.composite-out', `…and its child wires leaving its live bottom-center (gap ${compositeGaps?.fromExit}px)`,
      compositeGaps !== null && compositeGaps.fromExit <= 1.5, true)

    // ==================================================================
    // 3. Elbow style: the live anchor rides the elbow's own final leg.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple', edgeStyle: 'elbow' })
    await fitRegion(page)
    const elbowDraggedId = await shapeIdAtPath(page, '0.3')
    const moveHome = await nodeCentre(page, '0.3')
    let elbowGap = null
    await slowDrag(page, moveHome, { x: moveHome.x - 60, y: moveHome.y + 30 }, 6, async (step) => {
      if (step === 4) elbowGap = await wireGaps(page, elbowDraggedId)
    })
    check('wire.elbow', `the elbow wire's final leg lands on the live anchor too (gap ${elbowGap?.toEnter}px)`,
      elbowGap !== null && elbowGap.toEnter <= 1.5, true)

    // ==================================================================
    // 4. The Spacing slider: present in the View section, scales the Tree
    //    level gap live, persists as spacingScale, scales Process view too.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    const gapBefore = await levelGap(page, '0', '0.0')
    const sizeBefore = await evaluate(page, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape(${JSON.stringify(await shapeIdAtPath(page, '0.2'))})
      return [shape.props.w, shape.props.h]
    })())`).then(JSON.parse)
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-view-spacing"]'))`, 'the Spacing slider')
    check('spacing.default', 'the slider starts at 1×', await evaluate(page, `document.querySelector('[data-testid="bt-view-spacing"]')?.value`), '1')
    await shot(page, 'spacing-slider-at-1x.png')
    await setRange(page, '[data-testid="bt-view-spacing"]', 2)
    check('spacing.prop', 'the region persists spacingScale = 2', await regionProp(page, 'spacingScale'), 2)
    const gapAfter = await levelGap(page, '0', '0.0')
    check('spacing.tree-gap', `the Tree level gap doubles live (${gapBefore}px → ${gapAfter}px)`,
      [gapBefore, gapAfter], [84, 168])
    const sizeAfter = await evaluate(page, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape(${JSON.stringify(await shapeIdAtPath(page, '0.2'))})
      return [shape.props.w, shape.props.h]
    })())`).then(JSON.parse)
    check('spacing.cards-untouched', 'a card keeps its exact size — spacing scales gaps, never boxes', sizeAfter, sizeBefore)
    await fitRegion(page)
    await shot(page, 'spacing-tree-at-2x.png')

    // Process view reads the same knob.
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await clickElement(page, '[data-testid="bt-view-projection-process"]')
    await delay(400)
    const processGapAt2 = await levelGap(page, '0.2', '0.3')
    check('spacing.process-gap', `Process view's unit doubles from the same prop (${processGapAt2}px)`, processGapAt2, 120)
    await fitRegion(page)
    await shot(page, 'spacing-process-at-2x.png')
    await clickElement(page, '[data-testid="bt-view-projection-tree"]')
    await delay(400)
    check('spacing.survives-view-switch', 'spacingScale survives the round trip through Process view', await regionProp(page, 'spacingScale'), 2)

    // ==================================================================
    // 5. Drag resolution at 2× spacing: the pointer moves over a layout
    //    spaced at 2×, and the reorder lands where the pointer actually is —
    //    proof `buildDragRailContext` builds its layouts at the same scale.
    // ==================================================================
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    await fitRegion(page)
    const closeGripAt2 = await nodeCentre(page, '0.2')
    const subTreeAt2 = await nodeCentre(page, '0.0')
    await slowDrag(page, closeGripAt2, { x: subTreeAt2.x - 140, y: subTreeAt2.y }, 10)
    const orderAt2 = await evaluate(page, `JSON.stringify((() => {
      const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
      const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace')
      return tree.root.children.map((child) => child.id)
    })())`).then(JSON.parse)
    check('spacing.drag-still-lands', 'a reorder at 2× spacing lands exactly where the pointer is',
      orderAt2, ['CloseGrip', 'SubTree', 'Fallback', 'MoveHome', 'Parallel'])
    await shot(page, 'spacing-drag-at-2x.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-drag-polish-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-drag-polish-failed-${entry.name}`), entry.data)
    }
    process.stdout.write(`\n${passed}/${results.length} checks passed\n`)
    app.close()
    process.exit(passed === results.length && !journeyError ? 0 : 1)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
