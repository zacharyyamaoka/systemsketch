/**
 * Three pieces of Process-view feedback, driven in a real browser:
 *
 *   1. Attachment points default to hover-reveal in Process view only — Tree
 *      view keeps showing every "+" the moment it is selected or hovered.
 *   2. A leaf pinned to Expanded (the ordinary Block view pill, reached from
 *      the Node section) autosizes the scene around it without overlap.
 *   3. STEP INSIDE a Sub Tree leaf: the region swaps to the tree it names,
 *      offers the same View section, and Step out restores the caller.
 *
 * Every claim is read back from the editor or the painted DOM, the way every
 * other `tests/behavior_tree_*_smoke.mjs` journey in this repo does.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-process-v2')
const REGION = 'shape:bt-process-v2'

/** A Sequence with an interior insert and a Sub Tree leaf, for items 1–3. */
const XML = `<root BTCPP_format="4" main_tree_to_execute="Main">
  <BehaviorTree ID="Main">
    <Sequence name="Main Sequence">
      <CheckBattery/>
      <SubTree ID="Charge"/>
      <Proceed/>
    </Sequence>
  </BehaviorTree>
  <BehaviorTree ID="Charge">
    <Sequence name="Charge Sequence">
      <MoveToCharger/>
      <DockRobot/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="CheckBattery"/>
    <Action ID="Proceed"/>
    <Action ID="MoveToCharger"/>
    <Action ID="DockRobot"/>
  </TreeNodesModel>
</root>`

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

const region = (page) => evaluate(page, `JSON.stringify((() => {
  const shape = window.__systemsketch.editor.getShape('${REGION}')
  return shape ? { ...shape.props, xml: undefined, xmlLength: shape.props.xml.length } : null
})())`).then(JSON.parse)

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function selectRegion(page) {
  await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
  await delay(200)
}

async function selectPath(page, path) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === ${JSON.stringify(path)} && editor.getShape(candidate).meta.btRole === 'node')
    if (id) editor.select(id)
    return id ?? null
  })()`).then((value) => value ?? null)
}

async function mouseTo(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
}

/** The on-screen center of an insert button, even while it is fully transparent
 * (opacity does not remove it from layout, only from paint). */
async function insertCenter(page, testId) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const rect = document.querySelector('[data-testid="${testId}"]').getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })())`))
}

/** A far-away, empty patch of canvas — "nowhere near an insert". */
async function farPoint(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const point = editor.pageToScreen({ x: -400, y: -400 })
    return { x: point.x, y: point.y }
  })())`))
}

async function insertOpacity(page, testId) {
  return Number(await evaluate(page, `Number(getComputedStyle(document.querySelector('[data-testid="${testId}"]'))?.opacity ?? -1)`))
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-process-v2', build: 'behavior-tree-process-v2-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    // ---- setup --------------------------------------------------------------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(XML)}, title: 'Main', projection: 'process' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 3`, 'the tree to project')
    await fitRegion(page)
    check('setup.projection', 'the region opens in Process view', (await region(page)).projection, 'process')

    // =========================================================================
    // Item 1 — attachment points default to hover-reveal in Process view
    // =========================================================================
    check('item1.default', 'Process view defaults to Show on hover', (await region(page)).insertVisibility, 'hover')

    const betweenTestId = 'bt-insert-between:0:1'
    const endTestId = 'bt-insert-end'
    const farAway = await farPoint(page)
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await shot(page, 'process-hover-none.png')
    const interiorHidden = await insertOpacity(page, betweenTestId)
    const endAlwaysShown = await insertOpacity(page, endTestId)
    check('item1.interior-hidden-at-rest', 'an interior "+" is invisible with the pointer far away', interiorHidden, 0)
    check('item1.end-persistent', 'the terminal "+" stays visible regardless', endAlwaysShown, 1)

    // 15px off the insert's own center: outside its visible 14px icon, but
    // inside the 24px-radius padded zone — proving "near it", not "on it".
    const interiorInsert = await insertCenter(page, betweenTestId)
    await mouseTo(page, interiorInsert.x + 15, interiorInsert.y)
    await delay(150)
    await shot(page, 'process-hover-near.png')
    const interiorRevealed = await insertOpacity(page, betweenTestId)
    check('item1.interior-hover-reveal', 'the interior "+" fades in once the pointer is near (not on) it', interiorRevealed, 1)

    // The inspector's explicit debug toggle: Show all attachment points.
    await selectRegion(page)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-view-inserts"]'))`, "the inspector's Attachment points row")
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await clickElement(page, '[data-testid="bt-view-inserts-all"]')
    await delay(200)
    check('item1.toggle-all', 'the inspector toggle sets insertVisibility to all', (await region(page)).insertVisibility, 'all')
    const interiorUnderAll = await insertOpacity(page, betweenTestId)
    check('item1.all-reveals-everything', '"Show all" reveals the interior target with the pointer away', interiorUnderAll, 1)
    await shot(page, 'process-show-all.png')
    await clickElement(page, '[data-testid="bt-view-inserts-hover"]')
    await delay(200)
    check('item1.toggle-back', 'the toggle switches back to hover-reveal', (await region(page)).insertVisibility, 'hover')

    // Tree view is untouched: selecting it reveals every target regardless.
    await clickElement(page, '[data-testid="bt-view-projection-tree"]')
    await delay(250)
    await fitRegion(page)
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    const treeInsertOpacity = await evaluate(page, `Number(getComputedStyle(document.querySelector('.systemsketch-behavior-tree .BehaviorTree-insert'))?.opacity ?? -1)`)
    check('item1.tree-untouched', 'Tree view still shows its targets once the region is selected', Number(treeInsertOpacity), 1)
    await shot(page, 'tree-view-untouched.png')
    await clickElement(page, '[data-testid="bt-view-projection-process"]')
    await delay(250)
    await fitRegion(page)

    // =========================================================================
    // Item 2 — expanded nodes autosize the surrounding layout
    // =========================================================================
    const before = Number(await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.h`))
    await selectPath(page, '0.0')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-node-view"]'))`, 'the per-node View pill')
    await shot(page, 'process-before-expand.png')
    await clickElement(page, '[data-testid="bt-node-view-expanded"]')
    await waitFor(page, `window.__systemsketch.editor.getShape('${REGION}').props.h > ${before}`, 'the region to grow around the expanded leaf')
    await fitRegion(page)
    await shot(page, 'process-after-expand.png')
    const afterExpand = await region(page)
    check('item2.override-recorded', 'the region remembers the Expanded leaf as a node view override', afterExpand.nodeViewOverrides['0.0']?.view, 'expanded')
    const expandedChildW = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === '0.0')
      return editor.getShape(id).props.w
    })()`)
    check('item2.child-is-expanded-box', 'the projected child actually carries the Expanded box (560 wide)', expandedChildW, 560)
    // A structural edit — reconcile — must not stomp the override back to Simple.
    await evaluate(page, `window.__systemsketch.behaviorTree.reconcile('${REGION}')`)
    await delay(150)
    const afterReconcile = await region(page)
    check('item2.survives-reconcile', 'the override survives an explicit reconcile pass', afterReconcile.nodeViewOverrides['0.0']?.view, 'expanded')
    // Revert: the pill can also shrink the leaf back, and the override forgets it.
    await selectPath(page, '0.0')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-node-view"]'))`, 'the per-node View pill again')
    await clickElement(page, '[data-testid="bt-node-view-simple"]')
    await delay(250)
    const afterRevert = await region(page)
    check('item2.override-forgotten', 'reverting to Simple forgets the override', afterRevert.nodeViewOverrides['0.0'], undefined)
    await fitRegion(page)

    // =========================================================================
    // Item 3 — STEP INSIDE a Sub Tree leaf
    // =========================================================================
    await selectPath(page, '0.1')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-step-into-subtree"]'))`, 'the Step into subtree pill')
    await shot(page, 'subtree-leaf-selected.png')
    await clickElement(page, '[data-testid="bt-step-into-subtree"]')
    await waitFor(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.treeId === 'Charge'`, 'the region to swap to the Charge tree')
    await fitRegion(page)
    const insideCharge = await region(page)
    check('item3.stepped-in', 'the SAME region now projects the Charge tree', insideCharge.treeId, 'Charge')
    check('item3.stack-recorded', 'the outer tree is remembered for Step out', insideCharge.treeStack, [''])
    const chargeKids = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').map((id) => window.__systemsketch.editor.getShape(id).props.title ?? window.__systemsketch.editor.getShape(id).props.label))`).then(JSON.parse)
    check('item3.charge-contents', "Charge's own two actions are what got projected", chargeKids.sort(), ['DockRobot', 'MoveToCharger'].sort())
    check('item3.breadcrumb', 'the header shows a Step out breadcrumb', await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-step-out-breadcrumb"]'))`), true)
    // Zach's ask: the same contextual menu (the region's own View section)
    // is available while stepped in — because it IS the region, selected.
    check('item3.inspector-reused', "the region's own View section is showing (same Inspector, new treeId)", await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-view-projection"]'))`), true)
    await shot(page, 'inside-subtree.png')

    await clickElement(page, '[data-testid="bt-step-out-breadcrumb"]')
    await waitFor(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.treeId === ''`, 'Step out to restore Main')
    await fitRegion(page)
    const backOutside = await region(page)
    check('item3.stepped-out', 'Step out restores the calling tree', backOutside.treeId, '')
    check('item3.stack-cleared', 'the stack is empty again after stepping back out', backOutside.treeStack, [])
    await shot(page, 'after-step-out.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-process-v2-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-process-v2-failed-${entry.name}`), entry.data)
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
