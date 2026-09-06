/**
 * RecoveryNode (Nav2's control extension), driven in a real browser.
 *
 * Zach's ask, after an investigation found that a plain Fallback never
 * actually loops back to retry an earlier sibling: prototype the ONE real
 * BT.CPP/Nav2 primitive that does — Nav2's `RecoveryNode`
 * (nav2_behavior_tree/plugins/control/recovery_node.cpp) — as a genuine new
 * node kind, not a relabeled Fallback, and make its loop-back read clearly
 * in the Process view. Verified against that source file directly
 * (2026-09-06): exactly 2 children (primary, recovery); on the primary's
 * FAILURE it ticks the recovery; the recovery's SUCCESS re-ticks the primary
 * from the top (and only then counts against `number_of_retries`); the
 * recovery's own FAILURE, or the primary failing again once the retry budget
 * is spent, ends the node in FAILURE.
 *
 * This journey proves three things `layouts.test.ts`/`btcppXml.test.ts`
 * cannot: the new "Recovery" row actually appears in the real Add-process
 * menu and actually inserts a working `<RecoveryNode>` end to end; a real
 * example renders correctly in both Tree and Process view in the live app;
 * and the loop-back wire is visually distinct (dashed, backward, labelled)
 * rather than a cosmetic Fallback relabel.
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

const OUT = join(SHOTS, 'behavior-tree-recovery-node')
const REGION = 'shape:bt-recovery-node'

// A trimmed, real shape: Nav2's own `navigate_to_pose_w_replanning_and_recovery.xml`
// wraps ComputePathToPose in exactly this pattern (`number_of_retries="1"`,
// primary = the path computation, recovery = a costmap-clearing Sequence).
const RECOVERY_XML = `<root BTCPP_format="4" main_tree_to_execute="NavigateWithRecovery">
  <BehaviorTree ID="NavigateWithRecovery">
    <Sequence name="Navigate with recovery">
      <RecoveryNode number_of_retries="3" name="ComputePathToPose">
        <ComputePathToPose goal="{goal}" path="{path}"/>
        <Sequence name="Clear and retry">
          <WouldAPlannerRecoveryHelp error_code="{compute_path_error_code}"/>
          <ClearEntireCostmap name="ClearGlobalCostmap-Context"/>
        </Sequence>
      </RecoveryNode>
      <FollowPath path="{path}"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="ComputePathToPose"><input_port name="goal" type="Pose"/><output_port name="path" type="Path"/></Action>
    <Condition ID="WouldAPlannerRecoveryHelp"><input_port name="error_code"/></Condition>
    <Action ID="ClearEntireCostmap"/>
    <Action ID="FollowPath"><input_port name="path" type="Path"/></Action>
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

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-recovery-node', build: 'behavior-tree-recovery-node-smoke', width: 1800, height: 1100 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

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
    const clickViewButton = async (label) => {
      await evaluate(page, `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(label)})
        button?.click()
        return null
      })()`)
      await delay(300)
    }
    const farPoint = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const point = editor.pageToScreen({ x: -400, y: -400 })
      return { x: point.x, y: point.y }
    })())`))
    const mouseTo = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    const openInsertMenuAt = async (testId) => {
      const farAway = await farPoint()
      await mouseTo(farAway.x, farAway.y)
      await delay(150)
      await waitFor(page, `Boolean(document.querySelector('[data-testid="${testId}"]'))`, `insert ${testId}`)
      // WHY: `BtInsertMenu`'s `openUpward` is a purely structural heuristic
      // (`Boolean(openInsert.beforePath)`, see BehaviorTreeCanvas.tsx) — it
      // has no idea where the anchor actually sits on screen. A root/empty/
      // child insert (no `beforePath`) ALWAYS opens downward, so if its "+"
      // lands low in the viewport, a tall Control-flow page (9 rows now)
      // renders partly off-screen and a coordinate click on a lower row hits
      // nothing. Real users hit this too by panning low before opening
      // "Add process" — a genuine pre-existing gap, not something to paper
      // over here. The fix for THIS journey: pin the anchor near the TOP of
      // the viewport first, with headroom below, the way a person would
      // naturally scroll before clicking.
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const button = document.querySelector('[data-testid="${testId}"]')
        const rect = button.getBoundingClientRect()
        const point = editor.screenToPage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        editor.centerOnPoint(point, { animation: { duration: 0 } })
        // Re-read where that point actually landed, then nudge the camera so
        // it sits near the top instead of dead-center — empirical, not a
        // hand-derived camera formula, so it can't get the sign backwards.
        const afterCenter = editor.pageToScreen(point)
        const camera = editor.getCamera()
        const desiredScreenY = 160
        const screenDeltaY = desiredScreenY - afterCenter.y
        editor.setCamera({ x: camera.x + screenDeltaY / camera.z, y: camera.y + screenDeltaY / camera.z, z: camera.z }, { animation: { duration: 0 } })
        return null
      })()`)
      await delay(200)
      // Verify the nudge actually worked before trusting coordinate clicks
      // on whatever opens below it.
      const anchorScreenY = await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const button = document.querySelector('[data-testid="${testId}"]')
        return button ? button.getBoundingClientRect().y : -1
      })()`)
      if (anchorScreenY < 0 || anchorScreenY > 300) {
        throw new Error(`openInsertMenuAt(${testId}): anchor did not land near the top of the viewport (y=${anchorScreenY}); a downward menu would render off-screen`)
      }
      await clickElement(page, `[data-testid="${testId}"]`)
      await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
    }

    // ---- Part 1: a real Nav2-shaped example, seeded directly, in both views
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(RECOVERY_XML)}, title: 'NavigateWithRecovery', projection: 'process' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 3`, 'the tree to project')
    await fitRegion()

    check('process.projection', 'the region opens in Process view', await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.projection`), 'process')
    check('process.failure-chip', 'the primary→recovery Failure chip paints once', await evaluate(page, `document.querySelectorAll('.BehaviorTree-chip[data-kind="failure"]').length`), 1)
    check('process.retry-chip-text', 'the loop-back carries a Retry ×N chip with the real port value', await evaluate(page, `Array.from(document.querySelectorAll('.BehaviorTree-chip[data-kind="decorator"] text')).map((n) => n.textContent)`), ['Retry ×3'])
    check('process.retryloop-edge', 'exactly one retryLoop-kind edge paints', await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="retryLoop"]').length`), 1)
    check('process.retryloop-dashed', 'the loop-back wire is dashed, not a plain solid control wire', await evaluate(page, `getComputedStyle(document.querySelector('.BehaviorTree-edge[data-kind="retryLoop"] .BehaviorTree-wire')).strokeDasharray`) !== 'none', true)
    await shot('process-view.png')

    await evaluate(page, `(() => { window.__systemsketch.editor.select('${REGION}'); return null })()`)
    await delay(150)
    await clickViewButton('Tree')
    await fitRegion()
    check('tree.shows-recovery-node', 'Tree view labels the RecoveryNode occurrence', await evaluate(page, `document.body.innerText.includes('ComputePathToPose')`), true)
    check('tree.shows-both-children', 'Tree view draws both real children — the primary action and the recovery step\'s own Sequence', await evaluate(page, `JSON.stringify(['ComputePathToPose', 'Clear and retry'].map((text) => document.body.innerText.includes(text)))`).then(JSON.parse), [true, true])
    await shot('tree-view.png')
    await clickViewButton('Process')
    await fitRegion()

    // ---- Part 2: the real "Add process" menu names and inserts it, from empty
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: '<root BTCPP_format="4" main_tree_to_execute="MainTree">\\n    <BehaviorTree ID="MainTree"/>\\n</root>\\n', title: 'FreshTree', projection: 'process' } })
      editor.selectNone()
      return null
    })()`)
    await delay(200)
    await fitRegion()
    await openInsertMenuAt('bt-insert-root')
    await clickElement(page, '[data-testid="bt-insert-row-control"]')
    await waitFor(page, `document.querySelectorAll('[data-testid^="bt-insert-row-"]').length > 1`, 'the Control flow page')
    const rows = await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.BehaviorTree-menuRow')).map((row) => ({
      label: row.querySelector('.BehaviorTree-menuRowLabel')?.textContent ?? '',
      detail: row.querySelector('.BehaviorTree-menuRowDetail')?.textContent ?? '',
    })))`).then(JSON.parse)
    const recoveryRow = rows.find((row) => row.label === 'Recovery')
    check('menu.recovery-row-present', 'a "Recovery" row exists in Control flow, distinct from "Fallback"', Boolean(recoveryRow), true)
    check('menu.recovery-row-detail', 'its detail names the loop-back, not a Fallback synonym', recoveryRow?.detail ?? '', 'Loop · one-step fix, then retry')
    check('menu.fallback-still-present', 'Fallback keeps its own separate row (not merged/replaced)', rows.some((row) => row.label === 'Fallback'), true)
    await shot('insert-menu-control-flow.png')
    await clickElement(page, '[data-testid="bt-insert-row-RecoveryNode"]')
    await delay(200)

    const xmlAfterInsert = await regionXml()
    check('insert.creates-recoverynode', 'choosing "Recovery" writes a real <RecoveryNode> tag', /<RecoveryNode[ />]/.test(xmlAfterInsert), true)
    check('insert.default-retries', 'the fresh node carries the menu\'s own default retry count', /number_of_retries="3"/.test(xmlAfterInsert), true)
    await fitRegion()
    await shot('after-insert-empty.png')

    // Add the primary step through the SAME real flow (the always-on "+"
    // an empty control node gets), then the recovery step through the new
    // 1-child persistent prompt `recoveryLoopItem` adds for exactly this case.
    await openInsertMenuAt('bt-insert-empty:0')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, 'Boolean(document.querySelector(\'[data-testid="bt-insert-search"]\'))', 'the Skills page')
    await clickElement(page, '[data-testid="bt-insert-search"]')
    await typeSlowly(page, 'New skill')
    await delay(150)
    await clickElement(page, '[data-testid="bt-insert-row-new-skill"]')
    await delay(200)
    const structureOf = () => evaluate(page, `(() => {
      const seam = window.__systemsketch.behaviorTree
      const tree = seam.selectTree(seam.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml), 'MainTree')
      return JSON.stringify({ id: tree?.root?.id, controlKind: tree?.root?.controlKind, childCount: tree?.root?.children.length ?? -1 })
    })()`).then(JSON.parse)

    const oneChild = await structureOf()
    check('insert.primary-added', 'the primary step landed as RecoveryNode\'s first (and so far only) child', oneChild, { id: 'RecoveryNode', controlKind: 'recoveryLoop', childCount: 1 })

    check('prompt.recovery-still-required', 'a persistent prompt to add the required recovery step is showing', await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-recovery-required:0"]'))`), true)
    await openInsertMenuAt('bt-insert-recovery-required:0')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, 'Boolean(document.querySelector(\'[data-testid="bt-insert-search"]\'))', 'the Skills page')
    await clickElement(page, '[data-testid="bt-insert-search"]')
    await typeSlowly(page, 'New skill')
    await delay(150)
    await clickElement(page, '[data-testid="bt-insert-row-new-skill"]')
    await delay(200)
    const twoChildren = await structureOf()
    check('insert.recovery-added', 'the recovery step landed as RecoveryNode\'s second child, completing the arity', twoChildren, { id: 'RecoveryNode', controlKind: 'recoveryLoop', childCount: 2 })
    check('insert.no-third-prompt', 'the "add recovery" prompt is gone now that the node is complete', await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-recovery-required:0"]'))`), false)
    check('render.retryloop-after-real-build', 'a real loop-back wire now paints for a node built entirely through the UI', await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="retryLoop"]').length`), 1)
    await fitRegion()
    await shot('built-via-insert-menu-complete.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-recovery-node-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-recovery-node-failed-${entry.name}`), entry.data)
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
