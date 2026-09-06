/**
 * Tree view drag-to-reorder, driven in a real browser.
 *
 * Today's Tree view drag writes a raw pixel offset — nothing else reflows,
 * so a child that ends up above its parent draws a dead-end stub wire (the
 * bug Zach reported). This journey proves the fix: with the region's Auto
 * layout toggle on (the promoted Tidy button, `arrangement: 'tidy'`), a drag
 * becomes a live model reorder — `src/behaviorTree/dragListReorder.ts`,
 * wired through `installBehaviorTreeRegions.ts`'s `handleAutoLayoutDrag`.
 *
 *   1. plain sibling reorder    — the other siblings reflow, nobody else moves
 *   2. a control carries its subtree — moving a Fallback brings its children
 *   3. an illegal drop           — a refusal toast, nothing corrupts
 *   4. Auto layout OFF           — today's exact free-offset behaviour, untouched
 *   5. an Expanded leaf's override — resolution follows the painted layout,
 *      not the plain nodeFace formula (an independent audit's finding: this
 *      was silently unthreaded, see `dragListReorder.ts`'s
 *      `DragRailOptions.nodeViewOverrides`)
 *
 * Every claim is read back from the editor (`shape.props.xml`, parsed) or the
 * painted DOM, never inferred from screenshots alone. Screenshots still land
 * in docs/assets/behavior-tree-tree-drag-reorder/ for a human to look at.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-tree-drag-reorder')
const REGION = 'shape:bt-drag-reorder'

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

async function createRegion(page, xml, patch = {}) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { ...${JSON.stringify(patch)}, xml: ${JSON.stringify(xml)}, title: 'Drag reorder' } })
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

/** Screen-space centre of the projected child at `path`. */
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

/**
 * Screen-space point at a fraction across a node's own painted width — a
 * pointer landing exactly ON a neighbor's centre only ever resolves to
 * "before" it (the boundary test is a strict `>`), which is a no-op for a
 * node that is already first. `xFraction` past 0.5 nudges into "after"
 * instead, so a same-slot swap is actually exercised.
 */
async function nodePointAtFraction(page, path, xFraction) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
    })
    if (!id) return null
    const bounds = editor.getShapePageBounds(id)
    const point = editor.pageToScreen({ x: bounds.minX + bounds.width * ${xFraction}, y: bounds.minY + bounds.height / 2 })
    return { x: point.x, y: point.y }
  })())`))
}

const rootChildIds = (page) => evaluate(page, `JSON.stringify((() => {
  const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
  const tree = window.__systemsketch.behaviorTree.selectTree(doc, '${'PickAndPlace'}')
  return tree.root.children.map((child) => child.id)
})())`).then(JSON.parse)

const fallbackChildIds = (page) => evaluate(page, `JSON.stringify((() => {
  const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
  const tree = window.__systemsketch.behaviorTree.selectTree(doc, '${'PickAndPlace'}')
  const fallback = tree.root.children.find((child) => child.tag === 'Fallback')
  return fallback ? fallback.children.map((child) => child.id) : null
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
  const app = await startApp({ label: 'bt-tree-drag-reorder', build: 'bt-tree-drag-reorder-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    const sampleXml = await evaluate(page, 'window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML')

    // ==================================================================
    // Setup: Tree view, orientation down. `arrangement` defaults to
    // 'tidy' — Auto layout is on out of the box.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    check('setup.arrangement-default', 'a fresh region starts with Auto layout on', await regionProp(page, 'arrangement'), 'tidy')
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-auto-layout-toggle"]'))`, 'the Auto layout control')
    check('setup.toggle-on', 'the pill shows Auto layout pressed', await evaluate(page, `document.querySelector('[data-testid="bt-auto-layout-toggle"]')?.getAttribute('aria-pressed')`), 'true')
    await shot(page, 'setup-auto-layout-on.png')
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    const xmlBeforeAll = await regionXml(page)

    // ==================================================================
    // 1. Plain sibling reorder — CloseGrip (0.2) to before SubTree (0.0).
    //    The others just reflow to their new order; nobody else is dragged.
    // ==================================================================
    const closeGrip = await nodeCentre(page, '0.2')
    const subTree = await nodeCentre(page, '0.0')
    const subTreeXBefore = subTree.x
    // Captured by tldraw shape id, not by BT path — a live reorder restamps
    // paths mid-drag as the candidate structure changes, so path '0.0' will
    // not reliably still name this shape a few frames in. The shape id is
    // stable across a reposition/restamp; only a create or delete would
    // change it, and a pure reorder never creates or deletes.
    const subTreeShapeId = await evaluate(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').find((c) => window.__systemsketch.editor.getShape(c).meta.btPath === '0.0')`)
    const target1 = { x: subTree.x - 140, y: subTree.y }
    let subTreeXMidDrag = null
    await slowDrag(page, closeGrip, target1, 10, async (step) => {
      // Halfway through the gesture the pointer has already crossed into
      // SubTree's row on its way past — this is the live-reflow claim itself:
      // SubTree must already have shifted right to open the gap, mid-drag,
      // well before mouseup commits anything.
      if (step === 6) {
        subTreeXMidDrag = await evaluate(page, `window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(subTreeShapeId)})?.minX ?? null`)
        await shot(page, 'reorder-sibling-mid-drag.png')
      }
    })
    await shot(page, 'reorder-sibling-after-drop.png')
    check('reorder.live-reflow', 'SubTree has already shifted right mid-drag, before the drop commits anything',
      subTreeXMidDrag !== null && subTreeXMidDrag > subTreeXBefore + 20, true)
    check('reorder.legal-landing', 'the drag lands legally (no refusal fired)', await evaluate(page, `document.querySelectorAll('.tlui-toast__container').length`), 0)
    check('reorder.order', 'CloseGrip lands before SubTree; everything else keeps its relative order', await rootChildIds(page),
      ['CloseGrip', 'SubTree', 'Fallback', 'MoveHome', 'Parallel'])
    const xmlAfterReorder = await regionXml(page)
    await shortcut(page, 'z', 'KeyZ', 2) // ctrl+z
    await delay(300)
    check('reorder.one-undo', 'the whole drag — every intermediate frame included — is one undo step', await regionXml(page), xmlBeforeAll)
    await shortcut(page, 'z', 'KeyZ', 10) // ctrl+shift+z (redo)
    await delay(300)
    check('reorder.redo', 'redo restores the reordered tree', await regionXml(page), xmlAfterReorder)

    // ==================================================================
    // 2. A control node carries its whole contained subtree — dragging the
    //    Fallback ('Grasp or correct') to the far end of root brings
    //    GraspValid and CorrectGrip with it, in their own order.
    // ==================================================================
    // After step 1's reorder the root reads [CloseGrip, SubTree, Fallback,
    // MoveHome, Parallel] — Fallback is now 0.2, Parallel stays 0.4.
    const fallback = await nodeCentre(page, '0.2')
    const parallel = await nodeCentre(page, '0.4')
    const target2 = { x: parallel.x + 420, y: parallel.y }
    await slowDrag(page, fallback, target2, 12)
    await shot(page, 'reorder-subtree-carried.png')
    const rootAfterSubtreeMove = await rootChildIds(page)
    check('subtree.fallback-last', 'the Fallback lands last among its new siblings', rootAfterSubtreeMove[rootAfterSubtreeMove.length - 1], 'Fallback')
    check('subtree.children-intact', "the Fallback's own children moved with it, in order", await fallbackChildIds(page), ['GraspValid', 'CorrectGrip'])
    check('subtree.count-preserved', 'no node was created or lost', rootAfterSubtreeMove.length, 5)

    // ==================================================================
    // 3. An illegal drop: a decorator that already holds a child refuses a
    //    second one. A refusal toast fires and the structure stays sound.
    // ==================================================================
    const decoratorXml = `<root BTCPP_format="4" main_tree_to_execute="Guarded">
      <BehaviorTree ID="Guarded">
        <Sequence>
          <Inverter>
            <ConditionA/>
          </Inverter>
          <ActionB/>
        </Sequence>
      </BehaviorTree>
      <TreeNodesModel>
        <Condition ID="ConditionA"/>
        <Action ID="ActionB"/>
      </TreeNodesModel>
    </root>`
    await createRegion(page, decoratorXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple', arrangement: 'tidy' })
    await fitRegion(page)
    const xmlBeforeIllegal = await regionXml(page)
    const actionB = await nodeCentre(page, '0.1')
    const conditionA = await nodeCentre(page, '0.0.0')
    await slowDrag(page, actionB, conditionA, 10)
    await delay(200)
    await shot(page, 'illegal-drop-toast.png')
    const toastText = await evaluate(page, `document.querySelector('.tlui-toast__title')?.textContent ?? null`)
    check('illegal.toast', 'a refusal toast names the reason', typeof toastText === 'string' && /decorator/i.test(toastText), true)
    const guardedXml = await regionXml(page)
    check('illegal.no-corruption', 'both occurrences still exist exactly once, the Inverter still holds exactly one child',
      JSON.parse(await evaluate(page, `JSON.stringify((() => {
        const doc = window.__systemsketch.behaviorTree.parse(${JSON.stringify(guardedXml)})
        const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'Guarded')
        const ids = tree.nodes.map((n) => n.id)
        const inverter = tree.root.children.find((c) => c.tag === 'Inverter')
        return [ids.filter((id) => id === 'ConditionA').length, ids.filter((id) => id === 'ActionB').length, inverter.children.length]
      })())`)),
      [1, 1, 1])

    // ==================================================================
    // 4. Auto layout OFF: today's exact free-offset behaviour, untouched.
    // ==================================================================
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple' })
    await fitRegion(page)
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-auto-layout-toggle"]'))`, 'the Auto layout control')
    await clickElement(page, '[data-testid="bt-auto-layout-toggle"]')
    await delay(200)
    check('off.toggled', 'the toggle now reads off', await evaluate(page, `document.querySelector('[data-testid="bt-auto-layout-toggle"]')?.getAttribute('aria-pressed')`), 'false')
    check('off.prop', 'the region prop flips to free', await regionProp(page, 'arrangement'), 'free')
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    const xmlBeforeFreeDrag = await regionXml(page)
    const moveHome = await nodeCentre(page, '0.3')
    await drag(page, moveHome, { x: moveHome.x + 90, y: moveHome.y + 140 })
    await shot(page, 'auto-layout-off-free-drag.png')
    check('off.offset-recorded', 'a drag records a free offset, same as before this feature', Object.keys(await regionProp(page, 'offsets')), ['0.3'])
    check('off.xml-untouched', 'a free drag never touches the XML', await regionXml(page), xmlBeforeFreeDrag)

    // ==================================================================
    // 5. An Expanded leaf shifts the rows below it, and the drag must
    //    resolve against the PAINTED (override-aware) position, not the
    //    plain nodeFace formula. An independent audit found this
    //    unthreaded — the context builder was building its base/ghost
    //    layouts with no `nodeViewOverrides`, so any Expanded leaf silently
    //    desynced every row below it from what the pointer actually sits
    //    over. See `dragListReorder.ts`'s `DragListOptions.nodeViewOverrides`.
    // ==================================================================
    await createRegion(page, sampleXml, {
      projection: 'tree',
      orientation: 'down',
      nodeFace: 'simple',
      // GraspValid (0.1.0) pinned Expanded, same as item 2's Block-view pill
      // would record — 320 tall instead of its ordinary 112, which pushes
      // depth 3 (Sequence's own two children, 0.4.1.0/0.4.1.1) down with it.
      nodeViewOverrides: { '0.1.0': { view: 'expanded', w: 420, h: 320 } },
    })
    await fitRegion(page)
    const graspValidSize = await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const id = editor.getSortedChildIdsForParent('${REGION}').find((c) => editor.getShape(c).meta.btPath === '0.1.0')
      const shape = editor.getShape(id)
      return [shape.props.w, shape.props.h]
    })())`).then(JSON.parse)
    check('override.painted-size', 'GraspValid actually paints at the Expanded size', graspValidSize, [420, 320])
    const xmlBeforeOverrideDrag = await regionXml(page)
    // MoveHome's REAL painted position — already 208px lower than the plain
    // nodeFace formula would place it, because GraspValid sits above it.
    // Land a touch past its centre (not exactly on it): the boundary test is
    // a strict `>`, so landing exactly on a neighbour's centre only ever
    // resolves to "before" it — a no-op here, since CloseGrip is already
    // first. Past-centre is what actually exercises the swap.
    const closeGripDeep = await nodeCentre(page, '0.4.1.0')
    const pastMoveHomeCentre = await nodePointAtFraction(page, '0.4.1.1', 0.75)
    await slowDrag(page, closeGripDeep, pastMoveHomeCentre, 10)
    await shot(page, 'override-aware-drag.png')
    const afterOverrideDrag = await regionXml(page)
    // A refusal never touches the XML (see scenario 3), so a real structural
    // change here is itself proof the drop landed legally — a toast-presence
    // check would be flakier: toasts are app-level (outlive the region that
    // raised one) and auto-dismiss on their own timer, both independent of
    // this specific drag.
    check('override.xml-changed', 'the drag actually committed a structural change, so it landed legally', afterOverrideDrag === xmlBeforeOverrideDrag, false)
    const sequenceChildren = await evaluate(page, `JSON.stringify((() => {
      const doc = window.__systemsketch.behaviorTree.parse(${JSON.stringify(afterOverrideDrag)})
      const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace')
      const parallel = tree.root.children.find((c) => c.tag === 'Parallel')
      const seq = parallel.children.find((c) => c.tag === 'Sequence')
      return seq.children.map((c) => c.id)
    })())`).then(JSON.parse)
    check('override.resolves-at-painted-row', 'hovering the real painted position of MoveHome lands the drag beside it, inside the same Sequence — not wherever the un-Expanded formula would have placed that row',
      sequenceChildren, ['MoveHome', 'CloseGrip'])
    check('override.count-preserved', 'no node was created or lost', await evaluate(page, `JSON.stringify((() => {
      const doc = window.__systemsketch.behaviorTree.parse(${JSON.stringify(afterOverrideDrag)})
      return window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace').nodes.length
    })())`).then(JSON.parse), 13)
    check('override.survives-the-move', "GraspValid's own Expanded override is still there afterward, correctly re-keyed", await regionProp(page, 'nodeViewOverrides'), { '0.1.0': { view: 'expanded', w: 420, h: 320 } })

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-drag-reorder-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-drag-reorder-failed-${entry.name}`), entry.data)
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
