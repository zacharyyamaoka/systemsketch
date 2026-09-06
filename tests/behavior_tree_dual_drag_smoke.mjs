/**
 * The dual-drag ownership boundary, driven in a real browser.
 *
 * Zach's scoped exception to the one-drag-engine rule (`treeDndDrag.tsx`):
 * with Auto layout ON, pressing a diagram node hands the gesture to a real
 * mounted dnd-kit context; pressing anything else — whiteboard primitives
 * drawn OVER the diagram included — stays native tldraw. This journey proves
 * the boundary from both sides, reading which system owns each gesture from
 * the editor itself mid-drag:
 *
 *   1. a whiteboard arrow drawn across the diagram drags natively
 *      (`select.translating`, dnd signal null, XML untouched) — the single
 *      most direct test of the mutual-exclusivity boundary;
 *   2. a diagram node drags via dnd-kit (`select.idle` the whole time —
 *      tldraw stood down — dnd signal set, live reorder commits);
 *   3. a plain click still selects, with zero dnd involvement;
 *   4. Escape mid-drag cancels the whole gesture back to the pre-drag tree
 *      (the observer path used to leave the last candidate committed);
 *   5. Auto layout OFF is byte-identical native tldraw (free offsets,
 *      `select.translating`, dnd signal never set);
 *   6. rapid on/off/on toggling leaves no stuck state and each gesture is
 *      owned by the right system for the mode it starts in;
 *   7. a remote peer flipping Auto layout mid-drag does not wedge the
 *      session — it completes, the signal clears, and the next gesture on
 *      each side works;
 *   8. a multi-select drag of diagram nodes stays native and settles back
 *      to the tidy layout on release (glide-and-settle, no reorder).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-dual-drag')
const REGION = 'shape:bt-dual-drag'
const ARROW = 'shape:bt-dual-drag-arrow'

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

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)
const regionProp = (page, key) => evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('${REGION}')?.props.${key} ?? null)`).then(JSON.parse)
const editorPath = (page) => evaluate(page, `window.__systemsketch.editor.getPath()`)
const dndSignal = (page) => evaluate(page, `JSON.stringify(window.__systemsketch.behaviorTree.dndDrag())`).then(JSON.parse)
const setArrangement = (page, value) => evaluate(page, `(window.__systemsketch.editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { arrangement: ${JSON.stringify(value)} } }), null)`)

async function createRegion(page, xml, patch = {}) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { ...${JSON.stringify(patch)}, xml: ${JSON.stringify(xml)}, title: 'Dual drag' } })
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
    editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

/** The projected child shape id at `path`, plus its page-space centre in screen coords. */
async function nodeInfo(page, path) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
    })
    if (!id) return null
    const bounds = editor.getShapePageBounds(id)
    const centrePage = { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 }
    const centre = editor.pageToScreen(centrePage)
    return { id, centre: { x: centre.x, y: centre.y }, centrePage, bounds: { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height } }
  })())`))
}

const rootChildIds = (page) => evaluate(page, `JSON.stringify((() => {
  const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
  const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace')
  return tree.root.children.map((child) => child.id)
})())`).then(JSON.parse)

/** A slow, many-step drag with a callback fired after every intermediate move. */
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

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-dual-drag', build: 'bt-dual-drag-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    const sampleXml = await evaluate(page, 'window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML')
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    check('setup.tidy', 'Auto layout starts on', await regionProp(page, 'arrangement'), 'tidy')

    // ==================================================================
    // 1. A whiteboard arrow drawn ACROSS the diagram is tldraw's, whole.
    //    The arrow crosses straight through a node's centre; the press
    //    lands exactly where both overlap, and z-order (tldraw's own hit
    //    test) gives the gesture to the arrow, natively.
    // ==================================================================
    const overNode = await nodeInfo(page, '0.1')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShape({ id: '${ARROW}', type: 'arrow', x: ${overNode.centrePage.x - 150}, y: ${overNode.centrePage.y - 80}, props: { start: { x: 0, y: 0 }, end: { x: 300, y: 160 } } })
      editor.selectNone()
      return null
    })()`)
    await delay(200)
    await shot(page, 'arrow-over-diagram-before.png')
    const xmlBeforeArrowDrag = await regionXml(page)
    const arrowBefore = JSON.parse(await evaluate(page, `JSON.stringify((() => { const s = window.__systemsketch.editor.getShape('${ARROW}'); return { x: s.x, y: s.y } })())`))
    const pressOnOverlap = overNode.centre
    const arrowSamples = []
    await slowDrag(page, pressOnOverlap, { x: pressOnOverlap.x + 130, y: pressOnOverlap.y + 60 }, 8, async (step) => {
      if (step === 4) {
        arrowSamples.push({ path: await editorPath(page), dnd: await dndSignal(page) })
        await shot(page, 'arrow-over-diagram-mid-drag.png')
      }
    })
    await shot(page, 'arrow-over-diagram-after.png')
    const arrowAfter = JSON.parse(await evaluate(page, `JSON.stringify((() => { const s = window.__systemsketch.editor.getShape('${ARROW}'); return { x: s.x, y: s.y } })())`))
    check('arrow.native-owner', 'mid-drag the select tool is translating and the dnd signal is null — tldraw owns the arrow',
      arrowSamples, [{ path: 'select.translating', dnd: null }])
    check('arrow.moved', 'the arrow actually moved with the pointer',
      Math.abs(arrowAfter.x - arrowBefore.x) > 60 && Math.abs(arrowAfter.y - arrowBefore.y) > 25, true)
    check('arrow.xml-untouched', 'dragging the arrow over the diagram never touches the tree', await regionXml(page), xmlBeforeArrowDrag)
    check('arrow.no-offsets', 'no node recorded a free offset either', await regionProp(page, 'offsets'), {})
    await evaluate(page, `(window.__systemsketch.editor.deleteShapes(['${ARROW}']), window.__systemsketch.editor.selectNone(), null)`)
    await delay(150)

    // ==================================================================
    // 2. A diagram node's drag is dnd-kit's, whole: tldraw sits in
    //    select.idle for the entire gesture while the reorder commits live.
    // ==================================================================
    const closeGrip = await nodeInfo(page, '0.2')
    const subTree = await nodeInfo(page, '0.0')
    const xmlBeforeNodeDrag = await regionXml(page)
    const nodeSamples = []
    await slowDrag(page, closeGrip.centre, { x: subTree.centre.x - 140, y: subTree.centre.y }, 10, async (step) => {
      if (step === 5 || step === 8) {
        nodeSamples.push({ path: await editorPath(page), dnd: await dndSignal(page) })
        if (step === 5) await shot(page, 'node-dnd-mid-drag.png')
      }
    })
    check('node.dnd-owner', 'mid-drag the select tool is idle and the dnd signal names this region + node — dnd-kit owns the gesture',
      nodeSamples.map((sample) => ({ path: sample.path, region: sample.dnd?.regionId ?? null, shape: sample.dnd?.shapeId ?? null })),
      [
        { path: 'select.idle', region: REGION, shape: closeGrip.id },
        { path: 'select.idle', region: REGION, shape: closeGrip.id },
      ])
    check('node.reordered', 'the drag committed a live reorder', await rootChildIds(page), ['CloseGrip', 'SubTree', 'Fallback', 'MoveHome', 'Parallel'])
    check('node.signal-cleared', 'the dnd signal clears on release', await dndSignal(page), null)
    check('node.state-at-rest', 'the select tool is idle at rest', await editorPath(page), 'select.idle')
    check('node.xml-changed', 'the reorder is a real structural change', (await regionXml(page)) === xmlBeforeNodeDrag, false)

    // ==================================================================
    // 3. A plain click on a node still selects it — zero dnd involvement.
    // ==================================================================
    const fallback = await nodeInfo(page, '0.2')
    await mouse(page, 'mouseMoved', fallback.centre.x, fallback.centre.y)
    await mouse(page, 'mousePressed', fallback.centre.x, fallback.centre.y, { buttons: 1 })
    await delay(80)
    const dndDuringClick = await dndSignal(page)
    await mouse(page, 'mouseReleased', fallback.centre.x, fallback.centre.y)
    await delay(200)
    check('click.selects', 'the click selected the node', await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`).then(JSON.parse), [fallback.id])
    check('click.no-dnd', 'a motionless press never touches dnd-kit', dndDuringClick, null)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 4. Escape mid-drag cancels the WHOLE gesture: the tree returns to
    //    its pre-drag state, not the last candidate frame.
    // ==================================================================
    const xmlBeforeEscape = await regionXml(page)
    const moveHome = await nodeInfo(page, '0.3')
    const parallel = await nodeInfo(page, '0.4')
    await mouse(page, 'mouseMoved', moveHome.centre.x, moveHome.centre.y)
    await mouse(page, 'mousePressed', moveHome.centre.x, moveHome.centre.y, { buttons: 1 })
    for (let step = 1; step <= 6; step += 1) {
      await mouse(page, 'mouseMoved',
        moveHome.centre.x + (parallel.centre.x + 120 - moveHome.centre.x) * step / 6,
        moveHome.centre.y, { buttons: 1 })
      await delay(40)
    }
    const dndBeforeEscape = await dndSignal(page)
    await key(page, 'Escape', 'Escape')
    await delay(200)
    const dndAfterEscape = await dndSignal(page)
    await mouse(page, 'mouseReleased', parallel.centre.x + 120, moveHome.centre.y)
    await delay(300)
    await shot(page, 'escape-reverted.png')
    check('escape.was-dragging', 'the gesture was a live dnd drag before Escape', dndBeforeEscape !== null, true)
    check('escape.signal-cleared', 'Escape clears the dnd signal', dndAfterEscape, null)
    check('escape.xml-restored', 'Escape restores the exact pre-drag tree', await regionXml(page), xmlBeforeEscape)

    // ==================================================================
    // 5. Auto layout OFF: native tldraw, byte-identical — free offsets,
    //    select.translating, and the dnd signal never fires.
    // ==================================================================
    await setArrangement(page, 'free')
    await delay(200)
    const xmlBeforeFree = await regionXml(page)
    const freeNode = await nodeInfo(page, '0.3')
    const freeSamples = []
    await slowDrag(page, freeNode.centre, { x: freeNode.centre.x + 90, y: freeNode.centre.y + 130 }, 8, async (step) => {
      if (step === 4) freeSamples.push({ path: await editorPath(page), dnd: await dndSignal(page) })
    })
    check('off.native-owner', 'with Auto layout off, tldraw translates and the dnd signal stays null',
      freeSamples, [{ path: 'select.translating', dnd: null }])
    check('off.offset-recorded', 'the drag records a free offset, exactly as before', Object.keys(await regionProp(page, 'offsets')), ['0.3'])
    check('off.xml-untouched', 'a free drag never touches the XML', await regionXml(page), xmlBeforeFree)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 6. Rapid toggling leaves no stuck state; each gesture is owned by
    //    the right system for the mode it starts in.
    // ==================================================================
    for (const value of ['tidy', 'free', 'tidy', 'free', 'tidy']) await setArrangement(page, value)
    await delay(250)
    const toggledNode = await nodeInfo(page, '0.0')
    const toggledTarget = await nodeInfo(page, '0.2')
    const toggleSamples = []
    await slowDrag(page, toggledNode.centre, { x: toggledTarget.centre.x + 90, y: toggledTarget.centre.y }, 8, async (step) => {
      if (step === 4) toggleSamples.push({ path: await editorPath(page), dnd: (await dndSignal(page)) !== null })
    })
    check('toggle.dnd-after-rapid', 'after a rapid off/on burst ending tidy, a node drag is dnd-owned again',
      toggleSamples, [{ path: 'select.idle', dnd: true }])
    check('toggle.no-stuck-signal', 'the signal is clear at rest', await dndSignal(page), null)

    // ==================================================================
    // 7. A remote peer flips Auto layout mid-drag: the session completes,
    //    nothing wedges, and the next gesture on each side works.
    // ==================================================================
    const midFlipNode = await nodeInfo(page, '0.1')
    await mouse(page, 'mouseMoved', midFlipNode.centre.x, midFlipNode.centre.y)
    await mouse(page, 'mousePressed', midFlipNode.centre.x, midFlipNode.centre.y, { buttons: 1 })
    for (let step = 1; step <= 3; step += 1) {
      await mouse(page, 'mouseMoved', midFlipNode.centre.x + step * 20, midFlipNode.centre.y, { buttons: 1 })
      await delay(40)
    }
    const dndBeforeFlip = await dndSignal(page)
    await setArrangement(page, 'free')
    for (let step = 4; step <= 6; step += 1) {
      await mouse(page, 'mouseMoved', midFlipNode.centre.x + step * 20, midFlipNode.centre.y, { buttons: 1 })
      await delay(40)
    }
    await mouse(page, 'mouseReleased', midFlipNode.centre.x + 120, midFlipNode.centre.y)
    await delay(300)
    check('midflip.was-dnd', 'the gesture started dnd-owned', dndBeforeFlip !== null, true)
    check('midflip.signal-cleared', 'the session completed and cleared despite the mid-drag flip', await dndSignal(page), null)
    check('midflip.state-at-rest', 'the select tool is idle at rest', await editorPath(page), 'select.idle')
    await setArrangement(page, 'tidy')
    await delay(250)

    // ==================================================================
    // 8. A multi-select drag stays native and settles back: glide, no
    //    reorder, tidy layout restored on release.
    // ==================================================================
    const glideA = await nodeInfo(page, '0.0')
    const glideB = await nodeInfo(page, '0.2')
    await evaluate(page, `(window.__systemsketch.editor.setSelectedShapes(['${glideA.id}', '${glideB.id}']), null)`)
    await delay(150)
    const xmlBeforeGlide = await regionXml(page)
    const glideSamples = []
    await slowDrag(page, glideA.centre, { x: glideA.centre.x + 110, y: glideA.centre.y + 90 }, 8, async (step) => {
      if (step === 4) glideSamples.push({ path: await editorPath(page), dnd: await dndSignal(page) })
    })
    const glideRectAfter = await nodeInfo(page, '0.0')
    check('multi.native-owner', 'a multi-select drag stays native (translating, no dnd signal)',
      glideSamples, [{ path: 'select.translating', dnd: null }])
    check('multi.xml-untouched', 'a glide commits no reorder', await regionXml(page), xmlBeforeGlide)
    check('multi.settles-back', 'the glided nodes snap back onto the tidy layout on release',
      Math.abs(glideRectAfter.bounds.x - glideA.bounds.x) < 1 && Math.abs(glideRectAfter.bounds.y - glideA.bounds.y) < 1, true)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 9. The drag-model debug overlay (Dev panel toggle): the invisible
    //    Kanban — per-parent column zones, container bounds, virtual card
    //    slots — painted from the REAL resolution geometry, at rest and
    //    live through a drag, and gone again when toggled off.
    // ==================================================================
    await createRegion(page, sampleXml, {
      projection: 'tree',
      orientation: 'down',
      nodeFace: 'simple',
      // One Expanded leaf so the virtual-slot padding (the whole list's
      // slots widen to the Expanded member) is visibly different from the
      // painted card boxes.
      nodeViewOverrides: { '0.1.0': { view: 'expanded', w: 420, h: 320 } },
    })
    await fitRegion(page)
    check('overlay.absent-by-default', 'with the Dev toggle off (the default) the overlay does not exist',
      await evaluate(page, `document.querySelectorAll('[data-testid="bt-drag-model-overlay"]').length`), 0)
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="systemsketch-dev-tree-drag-model"]'))`, 'the Dev panel drag-model toggle')
    await clickElement(page, '[data-testid="systemsketch-dev-tree-drag-model"]')
    await delay(150)
    await clickElement(page, '.systemsketch-dev-trigger')
    await delay(200)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-drag-model-overlay"]'))`, 'the drag-model overlay')
    const zoneRows = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const zones = [...document.querySelectorAll('.BehaviorTree-dragModelZone rect')]
      return zones.map((rect) => ({ y: Math.round(Number(rect.getAttribute('y'))), x: Math.round(Number(rect.getAttribute('x'))) }))
    })())`))
    const rowsByY = new Map()
    for (const zone of zoneRows) rowsByY.set(zone.y, (rowsByY.get(zone.y) ?? 0) + 1)
    check('overlay.columns', 'at least one depth strip shows two column zones side by side (parallel sibling lists)',
      [...rowsByY.values()].some((count) => count >= 2), true)
    check('overlay.nested-rows', 'zones exist at several depths (nested lists paint as rows of columns)', rowsByY.size >= 3, true)
    check('overlay.padded-slot', "the Expanded leaf's list paints visibly padded virtual slots",
      (await evaluate(page, `document.querySelectorAll('.BehaviorTree-dragModelSlot[data-padded="true"]').length`)) >= 2, true)
    await shot(page, 'overlay-at-rest.png')
    const overlayDragFrom = await nodeInfo(page, '0.2')
    const overlayDragTo = await nodeInfo(page, '0.0')
    let overlayMid = null
    await slowDrag(page, overlayDragFrom.centre, { x: overlayDragTo.centre.x - 120, y: overlayDragTo.centre.y }, 10, async (step) => {
      if (step === 6) {
        overlayMid = JSON.parse(await evaluate(page, `JSON.stringify({
          present: document.querySelectorAll('[data-testid="bt-drag-model-overlay"]').length,
          activeZones: document.querySelectorAll('.BehaviorTree-dragModelZone[data-active="true"]').length,
          dnd: window.__systemsketch.behaviorTree.dndDrag() !== null,
        })`))
        await shot(page, 'overlay-mid-drag.png')
      }
    })
    check('overlay.live-during-drag', "mid-drag the overlay paints the live session's geometry with the hysteresis container highlighted",
      overlayMid, { present: 1, activeZones: 1, dnd: true })
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="systemsketch-dev-tree-drag-model"]'))`, 'the Dev panel drag-model toggle')
    await clickElement(page, '[data-testid="systemsketch-dev-tree-drag-model"]')
    await delay(150)
    await clickElement(page, '.systemsketch-dev-trigger')
    await delay(200)
    check('overlay.off-again', 'toggling off removes the overlay entirely',
      await evaluate(page, `document.querySelectorAll('[data-testid="bt-drag-model-overlay"]').length`), 0)

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-dual-drag-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-dual-drag-failed-${entry.name}`), entry.data)
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
