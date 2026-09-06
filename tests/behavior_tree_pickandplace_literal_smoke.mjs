/**
 * Zach's literal PickAndPlace repro (2026-09-05, the failure-branch-formatting
 * board): a flat Fallback whose recovery chain is `MoveHome` →Failure→
 * `GraspValid` condition →Failure→ (`CorrectGrip` → `GraspValid` re-check),
 * all converging on one straight merge line back to the main flow, `CloseGrip`
 * after. The other journeys prove the algorithm on synthetic fixtures; this
 * one proves HIS exact tree in the real running app, plus the two visual
 * grammar rules from his annotated mockup:
 *
 *   - "ICONS SHOW ONLY ON HOVER" — CORRECTED 2026-09-06. This first proved a
 *     recovery arm's own start/end "+" stays always-on ("his explicit
 *     ruling that a recovery arm is just another sequential branch"). Once
 *     Zach looked at this SAME literal board rendered — two arms, each with
 *     its own persistent prepend and terminus — he called it out as the
 *     opposite of what he wanted: "every single insert icon is visible
 *     simultaneously... the only icon that should show by default is the
 *     one at the bottom [the true end-of-tree terminus]." This journey now
 *     proves THAT rule: every `lane-start`/`lane-end` insert (both recovery
 *     arms) is hidden at rest and fades in only on approach; the ONE
 *     persistent icon in the whole region is `bt-insert-end`, after
 *     `CloseGrip`.
 *   - "Note the arrow ends" — every landing on the convergence is marked: a
 *     head where each arm's drop meets the merge line, ONE head where the
 *     single merge run meets the main-rail junction, none on the rail's own
 *     continuation through it.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-pickandplace')
const REGION = 'shape:bt-pickandplace-literal'

const PICK_AND_PLACE_XML = `<root BTCPP_format="4" main_tree_to_execute="PickAndPlace">
  <BehaviorTree ID="PickAndPlace">
    <Sequence name="Pick and place">
      <Fallback name="Move or correct">
        <MoveHome/>
        <GraspValid/>
        <!-- anonymous on purpose: his literal board draws the arm as bare cards, no group frame -->
        <Sequence>
          <CorrectGrip/>
          <GraspValid/>
        </Sequence>
      </Fallback>
      <CloseGrip/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveHome"/>
    <Condition ID="GraspValid"/>
    <Action ID="CorrectGrip"/>
    <Action ID="CloseGrip"/>
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
  const app = await startApp({ label: 'behavior-tree-pickandplace', build: 'behavior-tree-pickandplace-smoke', width: 1800, height: 1100 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(PICK_AND_PLACE_XML)}, title: 'PickAndPlace', projection: 'process' } })
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
    const mouseTo = (x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    // Park the pointer far from the region so no hover state leaks into a check.
    const parkPointer = async () => { await mouseTo(4, 4); await delay(200) }

    await fitRegion()
    await parkPointer()
    check('setup.projection', 'the region opens in Process view', (await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.projection`)), 'process')
    check('setup.titles', 'his exact node names all painted', JSON.parse(await evaluate(page, `JSON.stringify(['MoveHome', 'GraspValid', 'CorrectGrip', 'CloseGrip'].map((t) => document.body.innerText.includes(t)))`)), [true, true, true, true])
    check('setup.failure-chips', 'one Failure chip per recovery hand-off (MoveHome→GraspValid, GraspValid→CorrectGrip)', (await evaluate(page, `document.querySelectorAll('.BehaviorTree-chip[data-kind="failure"]').length`)), 2)

    // ---- the height fix, on his literal tree: no card overlaps any other --
    const overlaps = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const ids = editor.getSortedChildIdsForParent('${REGION}')
      const rects = ids
        .map((id) => editor.getShape(id))
        .filter((shape) => shape && shape.type !== 'behaviorTreeControl')
        .map((shape) => {
          const bounds = editor.getShapePageBounds(shape.id)
          return { id: shape.id, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
        })
      const bad = []
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i], b = rects[j]
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push([a.id, b.id])
        }
      }
      return bad
    })())`))
    check('layout.no-node-overlap', 'no projected card intersects any other', overlaps, [])

    // ---- "Note the arrow ends" ----------------------------------------
    check('arrows.merge-heads', 'two drop landings + one junction arrival are marked', (await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="merge"] .BehaviorTree-arrowHead').length`)), 3)
    check('arrows.merge-edges', 'two drops, one run, one headless rail continuation', (await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="merge"]').length`)), 4)
    check('arrows.failure-heads', 'both Failure hand-off edges keep their arrowheads', (await evaluate(page, `document.querySelectorAll('.BehaviorTree-edge[data-kind="recovery"] .BehaviorTree-arrowHead').length`)), 2)
    await shot('process-literal.png')

    // ---- "ICONS SHOW ONLY ON HOVER" ------------------------------------
    const insertOpacity = (selector) => evaluate(page, `(() => {
      const button = document.querySelector('${selector}')
      return button ? getComputedStyle(button).opacity : 'missing'
    })()`)
    check('hover.interior-hidden-at-rest', 'a non-persistent "+" is invisible until approached', (await insertOpacity('.BehaviorTree-insertZone .BehaviorTree-insert')), '0')

    // Both recovery arms (MoveHome's and GraspValid's) each have their own
    // prepend + terminus — four `lane-*` inserts total on this flat, two-arm
    // Fallback. EVERY one of them must be hover-only: none carry
    // data-persistent, and each sits opacity 0 at rest. This is the direct
    // regression check for "every single insert icon is visible
    // simultaneously" — checked generically (not by hardcoded path) so it
    // catches a persistent lane insert at ANY arm, not just the one Zach
    // happened to screenshot.
    const laneInsertState = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-testid^="bt-insert-lane-"]')).map((button) => ({
      id: button.dataset.testid,
      persistent: button.dataset.persistent,
      opacity: getComputedStyle(button).opacity,
    })))`))
    check('hover.lane-inserts-present', 'both arms\' prepend+terminus inserts are all in the DOM (2 arms x 2 = 4)', laneInsertState.length, 4)
    check('hover.lane-inserts-not-persistent', 'none of them carry data-persistent', laneInsertState.map((entry) => entry.persistent), laneInsertState.map(() => 'false'))
    check('hover.lane-inserts-hidden-at-rest', 'none of them are visible with the pointer far away', laneInsertState.map((entry) => entry.opacity), laneInsertState.map(() => '0'))

    // Exactly one persistent icon in the whole region: the true end-of-tree
    // terminus after CloseGrip. "the only icon that should show by default
    // is the one at the bottom."
    const persistentInserts = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.BehaviorTree-insert[data-persistent="true"]')).map((button) => button.dataset.testid))`))
    check('hover.exactly-one-persistent-terminus', 'the ONLY always-visible "+" is the end-of-tree terminus after CloseGrip', persistentInserts, ['bt-insert-end'])
    check('hover.terminus-visible-at-rest', 'that end-of-tree terminus "+" stays visible with the pointer far away', (await insertOpacity('[data-testid="bt-insert-end"]')), '1')

    const zoneCenter = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const zone = document.querySelector('.BehaviorTree-insertZone')
      const rect = zone.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })())`))
    await mouseTo(zoneCenter.x, zoneCenter.y)
    await delay(350)
    check('hover.interior-revealed', 'the same "+" fades in over its own hover zone', (await insertOpacity('.BehaviorTree-insertZone:hover .BehaviorTree-insert')), '1')
    await shot('process-literal-hover-reveal.png')
    await parkPointer()

    // ---- Tree view still renders his tree ------------------------------
    await evaluate(page, `(() => { window.__systemsketch.editor.select('${REGION}'); return null })()`)
    await delay(150)
    await evaluate(page, `(() => {
      const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Tree')
      button?.click()
      return null
    })()`)
    await delay(300)
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return null })()`)
    await fitRegion()
    check('tree.fallback-labeled', 'Tree view shows the Fallback control', (await evaluate(page, `document.body.innerText.includes('Move or correct')`)), true)
    await shot('tree-literal.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-pickandplace-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-pickandplace-failed-${entry.name}`), entry.data)
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
