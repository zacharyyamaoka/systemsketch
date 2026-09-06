/**
 * Zach's ask, 2026-09-05: "make sure that we can support nested fallback
 * failure loops … once you start a new failure loop, if that failure loop
 * fails, you should be able to also make a failure branch from a node that
 * already has a failure branch — and make sure that all the spacing and
 * everything in terms of going back onto the main branch works properly."
 *
 * `lanesWithRecovery`/`buildItem` (processLayout.ts) already recurse without
 * any single-level special-casing — a nested Fallback is just another `Item`
 * laid out like any other recovery-arm node — so this journey exists to
 * PROVE that holds at 2 and 3 levels deep in the real running app, not just
 * in the layout math (see `layouts.test.ts`'s "nested inside another
 * Fallback's recovery arm" suite for the deterministic geometry proof).
 *
 * Three levels of Fallback, each guarding the one below it:
 *   Fallback("Grasp or correct")
 *     GraspValid                                     — depth-1 guard
 *     Fallback("Correct or retry")
 *       CorrectGrip                                  — depth-2 guard
 *       Fallback("Retry or release")
 *         RetryGrasp                                 — depth-3 guard
 *         ReleaseAndRetry                            — depth-3's bare-leaf arm
 *
 * The journey grows EVERY level's own recovery arm — the deepest first, so
 * later edits prove the shallower levels still work once their own child
 * subtree has grown complicated — then confirms via `shape.props.xml`
 * readback that each edit landed at the structurally correct depth, and
 * screenshots both Tree and Process views before and after.
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

const OUT = join(SHOTS, 'behavior-tree-nested-fallback')
const REGION = 'shape:bt-nested-fallback'

const NESTED_FALLBACK_XML = `<root BTCPP_format="4" main_tree_to_execute="NestedRecovery">
  <BehaviorTree ID="NestedRecovery">
    <Sequence name="Grasp with nested recovery">
      <Fallback name="Grasp or correct">
        <GraspValid pose="{object_pose}" quality="{quality}"/>
        <Fallback name="Correct or retry">
          <CorrectGrip pose="{object_pose}" corrected="{object_pose}"/>
          <Fallback name="Retry or release">
            <RetryGrasp pose="{object_pose}"/>
            <ReleaseAndRetry pose="{object_pose}"/>
          </Fallback>
        </Fallback>
      </Fallback>
      <CloseGrip force="{grip_force}" state="{grip_state}"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"><input_port name="pose" type="Pose"/><output_port name="quality" type="double"/></Condition>
    <Action ID="CorrectGrip"><input_port name="pose" type="Pose"/><output_port name="corrected" type="Pose"/></Action>
    <Action ID="RetryGrasp"><input_port name="pose" type="Pose"/></Action>
    <Action ID="ReleaseAndRetry"><input_port name="pose" type="Pose"/></Action>
    <Action ID="CloseGrip"><input_port name="force" type="double" default="20"/><output_port name="state" type="GripState"/></Action>
    <Action ID="Retreat"/>
    <Action ID="Escalate"/>
    <Action ID="Abort"/>
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
  const app = await startApp({ label: 'behavior-tree-nested-fallback', build: 'behavior-tree-nested-fallback-smoke', width: 1800, height: 1100 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(NESTED_FALLBACK_XML)}, title: 'NestedRecovery', projection: 'process' } })
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
    const farPoint = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const point = editor.pageToScreen({ x: -400, y: -400 })
      return { x: point.x, y: point.y }
    })())`))
    const mouseTo = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    const clickViewButton = async (label) => {
      await evaluate(page, `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(label)})
        button?.click()
        return null
      })()`)
      await delay(300)
    }

    // ---- reproduce: does the un-edited 3-level tree even render cleanly? ---
    await fitRegion()
    check('setup.projection', 'the region opens in Process view', (await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.projection`)), 'process')
    // Three levels means three Failure chips, one per Fallback.
    const chipCount = await evaluate(page, `document.querySelectorAll('.BehaviorTree-chip[data-kind="failure"]').length`)
    check('reproduce.three-failure-chips', 'all three nesting levels paint their own Failure chip', chipCount, 3)
    await shot('process-view-3-levels-before.png')

    await evaluate(page, `(() => { window.__systemsketch.editor.select('${REGION}'); return null })()`)
    await delay(150)
    await clickViewButton('Tree')
    await fitRegion()
    const treeLabels = await evaluate(page, `JSON.stringify(['Grasp or correct', 'Correct or retry', 'Retry or release'].map((label) => document.body.innerText.includes(label)))`).then(JSON.parse)
    check('reproduce.tree-view-shows-all-three-fallbacks', 'Tree view labels all three nested Fallback conditions', treeLabels, [true, true, true])
    await shot('tree-view-3-levels-before.png')
    await clickViewButton('Process')
    await fitRegion()

    // ---- generalize: grow every level's own recovery arm, deepest first --
    const farAway = await farPoint()
    const clickInsertAndChoose = async (testId, skillId) => {
      await mouseTo(farAway.x, farAway.y)
      await delay(150)
      await waitFor(page, `Boolean(document.querySelector('[data-testid="${testId}"]'))`, `insert ${testId}`)
      // Center it in the viewport so its menu (opening up or down) has room —
      // same convention as `bt-insert-end` in tests/behavior_tree_smoke.mjs.
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
      // Filter to exactly this skill — this fixture's declared-model list is
      // long enough to scroll, and a coordinate click on an unfiltered row
      // can miss (or hit whatever the canvas painted underneath it).
      await clickElement(page, '[data-testid="bt-insert-search"]')
      await typeSlowly(page, skillId)
      await delay(150)
      await clickElement(page, `[data-testid="bt-insert-row-model:${skillId}"]`)
      await delay(200)
    }

    // Depth-3's own prepend: before ReleaseAndRetry, the bare-leaf arm at
    // the bottom of the chain — the same "wrap a bare leaf" path as the
    // top-level ask, just three Fallbacks deep.
    const xmlBefore3 = await regionXml()
    await clickInsertAndChoose('bt-insert-lane-start:0.0.1.1:0', 'Retreat')
    const xmlAfter3 = await regionXml()
    check('depth3.prepend-wraps-bare-leaf', 'Retreat lands BEFORE ReleaseAndRetry inside a fresh Sequence, still inside the depth-3 Fallback',
      /<Fallback name="Retry or release">\s*<RetryGrasp[^/]*\/>\s*<Sequence>\s*<Retreat\/>\s*<ReleaseAndRetry/.test(xmlAfter3), true)
    check('depth3.node-count', 'exactly one Retreat was added', (xmlAfter3.match(/<Retreat\/>/g) ?? []).length - (xmlBefore3.match(/<Retreat\/>/g) ?? []).length, 1)
    await fitRegion()
    await shot('process-after-depth3-prepend.png')

    // Depth-2's own terminus: after the WHOLE depth-3 Fallback subtree
    // (itself already grown by the edit above) — proves the terminus insert
    // still resolves to "the deepest last-in-flow node of THIS level's own
    // arm" and not something confused by the deeper nesting.
    await clickInsertAndChoose('bt-insert-lane-end:0.0.1:0', 'Escalate')
    const xmlAfter2 = await regionXml()
    check('depth2.terminus-wraps-nested-fallback', 'Escalate lands AFTER the entire depth-3 Fallback block, inside a fresh Sequence at the depth-2 Fallback\'s own slot',
      /<Fallback name="Correct or retry">\s*<CorrectGrip[^/]*\/>\s*<Sequence>\s*<Fallback name="Retry or release">\s*<RetryGrasp[^/]*\/>\s*<Sequence>\s*<Retreat\/>\s*<ReleaseAndRetry[^/]*\/>\s*<\/Sequence>\s*<\/Fallback>\s*<Escalate\/>\s*<\/Sequence>\s*<\/Fallback>/.test(xmlAfter2), true)
    await fitRegion()
    await shot('process-after-depth2-terminus.png')

    // Depth-1's own prepend: before the entire (now heavily modified) depth-2
    // Fallback subtree — proves the outermost level's insert still works
    // once its sibling subtree has grown three levels of real structure.
    await clickInsertAndChoose('bt-insert-lane-start:0.0:0', 'Abort')
    const xmlAfter1 = await regionXml()
    check('depth1.prepend-wraps-nested-fallback-preserving-depth2-and-3-edits', 'Abort lands BEFORE the entire depth-2 Fallback block, and both deeper edits survived untouched',
      /<Fallback name="Grasp or correct">\s*<GraspValid[^/]*\/>\s*<Sequence>\s*<Abort\/>\s*<Fallback name="Correct or retry">\s*<CorrectGrip[^/]*\/>\s*<Sequence>\s*<Fallback name="Retry or release">\s*<RetryGrasp[^/]*\/>\s*<Sequence>\s*<Retreat\/>\s*<ReleaseAndRetry[^/]*\/>\s*<\/Sequence>\s*<\/Fallback>\s*<Escalate\/>\s*<\/Sequence>\s*<\/Fallback>\s*<\/Sequence>\s*<\/Fallback>/.test(xmlAfter1), true)
    // The chain still converges back onto the main flow: CloseGrip (the
    // node after the whole nested-Fallback tree) is untouched and still last.
    check('depth1.main-flow-intact', 'CloseGrip still follows the whole nested-Fallback subtree, unmoved', /<\/Fallback>\s*<CloseGrip/.test(xmlAfter1), true)
    await fitRegion()
    await shot('process-view-3-levels-after.png')

    await clickViewButton('Tree')
    await fitRegion()
    await shot('tree-view-3-levels-after.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-nested-fallback-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-nested-fallback-failed-${entry.name}`), entry.data)
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
