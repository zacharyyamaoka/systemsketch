/**
 * Zach's ask, 2026-09-06: does "Add failure recovery" work correctly when
 * applied to a node that is ALREADY inside another Fallback's own recovery
 * arm — not just once, but 2-3 levels deep — and does it hold up when built
 * through the real interactive editing flow (select a node, click the
 * inspector's "Add failure recovery" button, fill the new arm through the
 * real "+" insert menu), not by hand-writing XML?
 *
 * `layouts.test.ts`'s `nestedFallbackXml(depth)` fixture already proves the
 * LAYOUT MATH recurses correctly at depth 2 and 3 (deterministic geometry,
 * hand-authored XML). `behavior_tree_nested_fallback_smoke.mjs` proves that
 * same hand-authored 3-level tree renders and accepts further edits in the
 * real app. Neither proves the ACT of nesting itself — clicking "Add failure
 * recovery" (`addBehaviorTreeFailureRecovery`, behaviorTreeCommands.ts) on a
 * node that already sits inside a recovery arm's own chain — has ever been
 * exercised end to end. This journey builds the nesting from the app's own
 * shipped PickAndPlace sample, live, three levels deep:
 *
 *   Fallback0("Grasp or correct")
 *     GraspValid                              — depth-1 guard (unchanged)
 *     Fallback1                               — NEW, wraps the sample's own CorrectGrip
 *       CorrectGrip                           — depth-1's original recovery content
 *       Sequence
 *         Fallback2                           — NEW, wraps a freshly-inserted CorrectGrip
 *           CorrectGrip                       — depth-2's own recovery content
 *           Sequence
 *             PlanPath                        — depth-3's own recovery content
 *
 * i.e. "CorrectGrip also has its own further failure branch to another
 * CorrectGrip" — Zach's literal words — built by clicking the real UI twice,
 * not authored as a fixture. It then confirms both views render it: Process
 * view's hover-gating rule (only the true end-of-tree terminus stays
 * persistent — see the 2026-09-06 processLayout.ts fix) and its one-merge-
 * line-per-Fallback-scope convergence rule both hold at every new level, and
 * Tree view paints the same tree without error.
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
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-nested-recovery-via-ui')
const REGION = 'shape:bt-nested-recovery-ui'

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

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-nested-recovery-via-ui', build: 'behavior-tree-nested-recovery-via-ui-smoke', width: 1800, height: 1150 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace', projection: 'process' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 3`, 'the tree to project')

    const fitRegion = async () => {
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const bounds = editor.getShapePageBounds('${REGION}')
        editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
        return null
      })()`)
      await delay(250)
    }
    const shot = async (name) => {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      pending.push({ name, data: Buffer.from(capture.data, 'base64') })
    }
    const regionXml = () => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)
    const mouseTo = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    const farPoint = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const point = editor.pageToScreen({ x: -400, y: -400 })
      return { x: point.x, y: point.y }
    })())`))
    const clickViewButton = async (testId) => { await clickElement(page, `[data-testid="${testId}"]`); await delay(300) }

    /**
     * The occurrence-th node with this id, in the SAME document-order
     * `.nodes` list `layouts.test.ts` itself reasons about — read live off
     * the region's own current XML through the real parser
     * (`window.__systemsketch.behaviorTree`), so each step's target path is
     * derived from the actual post-edit tree instead of hand-predicted path
     * arithmetic across several dynamic inserts.
     */
    const pathOfNode = async (id, occurrence = 0) => evaluate(page, `(() => {
      const xml = window.__systemsketch.editor.getShape('${REGION}').props.xml
      const doc = window.__systemsketch.behaviorTree.parse(xml)
      const tree = window.__systemsketch.behaviorTree.selectTree(doc, doc.mainTreeId)
      const matches = tree.nodes.filter((node) => node.id === ${JSON.stringify(id)})
      const node = matches[${occurrence}]
      return node ? node.path : null
    })()`)

    const selectPath = async (path) => evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === ${JSON.stringify(path)} && editor.getShape(candidate).meta.btRole === 'node')
      if (id) editor.select(id)
      return id ?? null
    })()`)

    const nodeIdentity = () => evaluate(page, `document.querySelector('[data-testid="bt-node-identity"] .bt-inspector__id')?.textContent ?? null`)

    /** Click a hover-only insert (centering it first so its menu has room), open Skills, pick one model by id — the same shape as behavior_tree_nested_fallback_smoke.mjs's helper. */
    const clickInsertAndChoose = async (testId, skillId) => {
      await waitFor(page, `Boolean(document.querySelector('[data-testid="${testId}"]'))`, `insert ${testId}`)
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const button = document.querySelector('[data-testid="${testId}"]')
        const rect = button.getBoundingClientRect()
        const point = editor.screenToPage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        editor.centerOnPoint(point, { animation: { duration: 0 } })
        return null
      })()`)
      await delay(200)
      await clickElement(page, `[data-testid="${testId}"]`)
      await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
      await clickElement(page, '[data-testid="bt-insert-row-skills"]')
      await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
      await clickElement(page, '[data-testid="bt-insert-search"]')
      await typeSlowly(page, skillId)
      await delay(150)
      await clickElement(page, `[data-testid="bt-insert-row-model:${skillId}"]`)
      await delay(200)
    }

    const failureChipCount = () => evaluate(page, `document.querySelectorAll('.BehaviorTree-chip[data-kind="failure"]').length`)
    const countTag = (xml, tag) => (xml.match(new RegExp(`<${tag}[/ >]`, 'g')) ?? []).length

    /* ---- baseline: the shipped sample has exactly one Fallback --------- */
    await fitRegion()
    check('setup.projection', 'the region opens in Process view', await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.projection`), 'process')
    const xmlBaseline = await regionXml()
    check('setup.one-fallback', 'the sample tree starts with exactly one Fallback', countTag(xmlBaseline, 'Fallback'), 1)
    check('setup.one-failure-chip', 'and paints exactly one Failure chip', await failureChipCount(), 1)
    await shot('00-baseline.png')

    /* ---- level 2: wrap the sample's own CorrectGrip (already inside a recovery arm) --- */
    const correctGrip0 = await pathOfNode('CorrectGrip', 0)
    check('level2.finds-correctgrip', 'the sample\'s CorrectGrip (Fallback0\'s recovery content) resolves to a path', typeof correctGrip0 === 'string' && correctGrip0.length > 0, true)
    await selectPath(correctGrip0)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-inspector"]'))`, 'the inspector for CorrectGrip')
    check('level2.selected-correctgrip', 'the inspector confirms CorrectGrip is selected', await nodeIdentity(), 'CorrectGrip')
    await clickElement(page, '[data-testid="bt-action-recovery"]')
    await delay(300)
    const xmlLevel2Wrapped = await regionXml()
    check('level2.no-crash', 'the edit landed (XML still readable, non-empty)', typeof xmlLevel2Wrapped === 'string' && xmlLevel2Wrapped.length > 0, true)
    check('level2.two-fallbacks', 'wrapping CorrectGrip added exactly one new Fallback (now 2 total)', countTag(xmlLevel2Wrapped, 'Fallback'), 2)
    check('level2.wraps-in-place', 'CorrectGrip is now Fallback1\'s own primary child, still inside Fallback0\'s recovery arm, with an empty Sequence beside it',
      /<Fallback name="Grasp or correct">\s*<GraspValid[^/]*\/>\s*<Fallback>\s*<CorrectGrip[^/]*\/>\s*<Sequence\s*\/>\s*<\/Fallback>\s*<\/Fallback>/.test(xmlLevel2Wrapped), true)
    await fitRegion()
    check('level2.two-failure-chips', 'Process view now paints two Failure chips, one per nesting level', await failureChipCount(), 2)
    await shot('01-level2-wrapped.png')

    // Fill the new (empty) recovery Sequence — `addBehaviorTreeFailureRecovery`
    // always places the wrapped original at index 0 and the fresh recovery
    // Sequence at index 1, so its path is deterministic from here.
    const emptySeq1 = `${correctGrip0}.1`
    await clickInsertAndChoose(`bt-insert-empty:${emptySeq1}`, 'CorrectGrip')
    const xmlLevel2Filled = await regionXml()
    check('level2.correctgrip-added', 'a second CorrectGrip landed inside the new recovery Sequence', countTag(xmlLevel2Filled, 'CorrectGrip') - countTag(xmlBaseline, 'CorrectGrip'), 1)
    check('level2.still-two-fallbacks', 'filling the empty Sequence did not add a Fallback', countTag(xmlLevel2Filled, 'Fallback'), 2)
    await fitRegion()
    await shot('02-level2-filled.png')

    /* ---- level 3: wrap the JUST-INSERTED CorrectGrip — a node that is itself already the content of a recovery arm's own chain --- */
    const correctGrip1 = await pathOfNode('CorrectGrip', 1)
    check('level3.finds-nested-correctgrip', 'the freshly-inserted CorrectGrip (itself already inside a recovery arm) resolves to a path', typeof correctGrip1 === 'string' && correctGrip1.length > 0, true)
    await selectPath(correctGrip1)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-inspector"]'))`, 'the inspector for the nested CorrectGrip')
    check('level3.selected-correctgrip', 'the inspector confirms the nested CorrectGrip is selected', await nodeIdentity(), 'CorrectGrip')
    await clickElement(page, '[data-testid="bt-action-recovery"]')
    await delay(300)
    const xmlLevel3Wrapped = await regionXml()
    check('level3.three-fallbacks', 'wrapping the nested CorrectGrip added a THIRD Fallback — nesting inside nesting works', countTag(xmlLevel3Wrapped, 'Fallback'), 3)
    await fitRegion()
    check('level3.three-failure-chips', 'Process view now paints three Failure chips, one per nesting level', await failureChipCount(), 3)
    await shot('03-level3-wrapped.png')

    const emptySeq2 = `${correctGrip1}.1`
    await clickInsertAndChoose(`bt-insert-empty:${emptySeq2}`, 'PlanPath')
    const xmlFinal = await regionXml()
    check('level3.planpath-added', 'PlanPath landed inside the depth-3 recovery Sequence', countTag(xmlFinal, 'PlanPath') - countTag(xmlBaseline, 'PlanPath'), 1)
    check('final.three-fallbacks-total', 'still exactly three Fallbacks after filling the last arm', countTag(xmlFinal, 'Fallback'), 3)
    check('final.full-nesting-shape', 'the whole chain nests correctly: Fallback0 > Fallback1 > Fallback2, each arm feeding the next',
      /<Fallback name="Grasp or correct">\s*<GraspValid[^/]*\/>\s*<Fallback>\s*<CorrectGrip[^/]*\/>\s*<Sequence>\s*<Fallback>\s*<CorrectGrip[^/]*\/>\s*<Sequence>\s*<PlanPath[^/]*\/>\s*<\/Sequence>\s*<\/Fallback>\s*<\/Sequence>\s*<\/Fallback>\s*<\/Fallback>/.test(xmlFinal), true)
    // The rest of the sample tree (CloseGrip, MoveHome, the Parallel) is
    // untouched — this was a surgical edit at one path, not a rebuild.
    check('final.rest-of-tree-intact', 'CloseGrip/MoveHome/Parallel after the Fallback are untouched',
      /<\/Fallback>\s*<CloseGrip[^/]*\/>\s*<MoveHome[^/]*\/>\s*<Parallel/.test(xmlFinal), true)
    await fitRegion()
    await shot('04-level3-filled-final.png')

    /* ---- Process view: the 2026-09-06 hover-gating fix holds at 3 real levels --- */
    // Deselect first — the last edit's `applyEdit` left the just-created
    // PlanPath selected, and a selected descendant reveals every insert via
    // the same `[data-selected='true']` rule Tree view relies on (see
    // tests/behavior_tree_process_recovery_rail_smoke.mjs's identical note).
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    const farAway = await farPoint()
    await mouseTo(farAway.x, farAway.y)
    await delay(200)
    const laneInsertState = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-testid^="bt-insert-lane-"]')).map((button) => ({
      id: button.dataset.testid,
      persistent: button.dataset.persistent,
      opacity: getComputedStyle(button).opacity,
    })))`))
    check('hover.lane-inserts-found', 'all three nesting levels contributed their own lane-start + lane-end (3 x 2 = 6)', laneInsertState.length, 6)
    check('hover.lane-inserts-not-persistent', 'none of them are persistent, at any nesting depth', laneInsertState.filter((entry) => entry.persistent === 'true').map((entry) => entry.id), [])
    check('hover.lane-inserts-hidden-at-rest', 'none of them are visible with the pointer far away', laneInsertState.filter((entry) => entry.opacity !== '0').map((entry) => entry.id), [])
    const persistentInserts = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.BehaviorTree-insert[data-persistent="true"]')).map((button) => button.dataset.testid))`))
    check('hover.exactly-one-persistent', 'the only always-visible "+" in the whole 3-level tree is the true end-of-tree terminus', persistentInserts, ['bt-insert-end'])

    /* ---- Process view: one merge line per Fallback scope, at every level --- */
    const mergeEdgeCount = await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="merge"]').length`)
    const mergeHeadCount = await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="merge"] .BehaviorTree-arrowHead').length`)
    // Each of the 3 nesting levels is a single-recovery-lane Fallback: one
    // arm drop + one shared run (both arrowed) + one headless rail
    // continuation = 3 merge edges and 2 arrowheads per level.
    check('convergence.merge-edges', '3 merge edges per nesting level x 3 levels', mergeEdgeCount, 9)
    check('convergence.merge-arrowheads', '2 arrowheads per nesting level x 3 levels (the headless rail continuation excluded)', mergeHeadCount, 6)
    const overlaps = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const ids = editor.getSortedChildIdsForParent('${REGION}')
      const rects = ids.map((id) => editor.getShape(id)).filter((shape) => shape && shape.type !== 'behaviorTreeControl')
        .map((shape) => { const bounds = editor.getShapePageBounds(shape.id); return { id: shape.id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h } })
      const bad = []
      for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i], b = rects[j]
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push([a.id, b.id])
      }
      return bad
    })())`))
    check('convergence.no-node-overlap', 'no projected card intersects any other at 3 levels of nesting', overlaps, [])
    await shot('05-process-final-at-rest.png')

    check('console.process', 'no local console errors after all Process-view edits', await localConsoleErrors(page), [])

    /* ---- Tree view: same tree, no corruption --------------------------- */
    await evaluate(page, `(() => { window.__systemsketch.editor.select('${REGION}'); return null })()`)
    await delay(150)
    await clickViewButton('bt-pill-tree')
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return null })()`)
    await fitRegion()
    const treeLeafCount = await evaluate(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').filter((id) => window.__systemsketch.editor.getShape(id)?.meta?.btRole === 'node').length`)
    check('tree.renders-every-node', 'Tree view paints one Block per node, matching the final XML\'s node count',
      treeLeafCount, JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.behaviorTree.selectTree(window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml), 'PickAndPlace').nodes.length)`)))
    const treeLabels = JSON.parse(await evaluate(page, `JSON.stringify(['GraspValid', 'CorrectGrip', 'PlanPath', 'CloseGrip'].map((label) => document.body.innerText.includes(label)))`))
    check('tree.labels-present', 'every real node id from the 3-level chain is painted somewhere in Tree view', treeLabels, [true, true, true, true])
    await shot('06-tree-view-final.png')
    check('console.tree', 'no local console errors after switching to Tree view', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-nested-recovery-via-ui-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-nested-recovery-via-ui-failed-${entry.name}`), entry.data)
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
