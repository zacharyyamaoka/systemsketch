/**
 * Zach's three Process-view placement rules (2026-09-05), measured in the
 * REAL running app with getBoundingClientRect — not just in scene space:
 *
 *  1. one spacing unit everywhere — his annotated Flowstate reference marks
 *     the SAME gap for node→node in a stack, fork-bar→each branch's first
 *     node, and Start→first node ("the space between any edge and node
 *     should match the space between nodes");
 *  2. no blue "+" ever overlaps a node card ("there's still cases where the
 *     icons are being rendered beneath the leaf nodes");
 *  3. a sequential "+" is centered on its own single-direction run — for a
 *     top-to-bottom flow, on its host column's center line, half a unit off
 *     the card face it acts on — never on a junction or a cross-axis leg
 *     ("BOTH OF THESE ARE WRONG" over the on-corner AND the offset-along-
 *     the-horizontal-leg placements).
 *
 * Scene A is the exact NestedRecovery tree from his annotated screenshot
 * (GraspValid / CorrectGrip / RetryGrasp / ReleaseAndRetry / CloseGrip);
 * scene B is the Flowstate-style Start→group→3-branch Parallel. Both are
 * captured with Attachment points = "Show all", the debug view he asked for
 * ("so I can visually see at a glance you are putting them in the correct
 * place").
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

const OUT = join(SHOTS, 'behavior-tree-process-spacing')
const REGION = 'shape:bt-process-spacing'
/** One PROCESS_GAP unit — keep in sync with processLayout.ts. */
const GAP = 60
const ICON = 28
/** Viewport-px tolerance: sub-pixel zoom rounding, nothing structural. */
const TOL = 2.5

const NESTED_XML = `<root BTCPP_format="4" main_tree_to_execute="NestedRecovery">
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
      <MoveHome target="{home_pose}"/>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="GraspValid"><input_port name="pose" type="Pose"/><output_port name="quality" type="double"/></Condition>
    <Action ID="CorrectGrip"><input_port name="pose" type="Pose"/><output_port name="corrected" type="Pose"/></Action>
    <Action ID="RetryGrasp"><input_port name="pose" type="Pose"/></Action>
    <Action ID="ReleaseAndRetry"><input_port name="pose" type="Pose"/></Action>
    <Action ID="CloseGrip"><input_port name="force" type="double" default="20"/><output_port name="state" type="GripState"/></Action>
    <Action ID="MoveHome"><input_port name="target" type="Pose"/></Action>
  </TreeNodesModel>
</root>`

const FLOWSTATE_XML = `<root BTCPP_format="4" main_tree_to_execute="InitializeWorkcell">
  <BehaviorTree ID="InitializeWorkcell">
    <Sequence name="Initialize Workcell">
      <Parallel success_count="-1" failure_count="1">
        <Sequence>
          <enable_motion robot="robot2"/>
          <planned_move robot="robot2"/>
        </Sequence>
        <Sequence>
          <enable_motion robot="robot1"/>
          <planned_move robot="robot1"/>
        </Sequence>
        <Sequence>
          <command_trommel trommel="trommel"/>
          <command_trommel trommel="trommel"/>
        </Sequence>
      </Parallel>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="enable_motion"><input_port name="robot"/></Action>
    <Action ID="planned_move"><input_port name="robot"/></Action>
    <Action ID="command_trommel"><input_port name="trommel"/></Action>
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

function near(value, target, tolerance = TOL) {
  return Math.abs(value - target) <= tolerance
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-process-spacing', build: 'behavior-tree-process-spacing-smoke', width: 1800, height: 1100 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)

    const createRegion = async (xml, title) => {
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        editor.deleteShapes([...editor.getCurrentPageShapeIds()])
        editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(xml)}, title: ${JSON.stringify(title)}, projection: 'process', insertVisibility: 'all' } })
        editor.selectNone()
        return null
      })()`)
      await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 2`, 'the tree to project')
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        editor.zoomToBounds(editor.getShapePageBounds('${REGION}'), { inset: 60, animation: { duration: 0 } })
        return null
      })()`)
      await delay(300)
    }

    /** Viewport rects of every projected leaf Block, keyed by its node path. */
    const readCards = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const out = {}
      for (const id of editor.getSortedChildIdsForParent('${REGION}')) {
        const shape = editor.getShape(id)
        if (!shape || shape.meta?.btRole !== 'node') continue
        const dom = document.querySelector('.tl-shape[data-shape-id="' + id + '"]')
        if (!dom) continue
        const rect = dom.getBoundingClientRect()
        out[shape.meta.btPath] = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      }
      return out
    })())`))

    /** Viewport rects of every insert "+" button, keyed by insert id. */
    const readInserts = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const out = {}
      for (const button of document.querySelectorAll('.BehaviorTree-insert')) {
        const id = (button.dataset.testid || button.getAttribute('data-testid') || '').replace(/^bt-insert-/, '')
        const rect = button.getBoundingClientRect()
        out[id] = { x: rect.x, y: rect.y, w: rect.width, h: rect.height, persistent: button.dataset.persistent === 'true' }
      }
      return out
    })())`))

    const readZoom = async () => Number(await evaluate(page, 'window.__systemsketch.editor.getZoomLevel()'))
    const center = (rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })
    const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    const shot = async (name, clip) => {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(clip ? { clip: { ...clip, scale: 2 } } : {}) })
      pending.push({ name, data: Buffer.from(capture.data, 'base64') })
    }

    /* ---------------- Scene A: Zach's NestedRecovery board ---------------- */
    await createRegion(NESTED_XML, 'NestedRecovery')
    const zoomA = await readZoom()
    const cards = await readCards()
    const inserts = await readInserts()
    check('nested.cards', 'all six leaves project as Blocks',
      Object.keys(cards).sort().length, 6)

    // Rule 2 — no "+" box intersects any card, hover ones included.
    const collisions = []
    for (const [id, insert] of Object.entries(inserts)) {
      for (const [path, card] of Object.entries(cards)) {
        if (intersects(insert, card)) collisions.push(`${id}∩${path}`)
      }
    }
    check('nested.no-overlap', 'no insert box intersects any node card', collisions, [])

    // Rule 3 — each recovery arm's prepend "+" and (bare-leaf) terminus "+"
    // ride their own card's column center line, half a unit off its face.
    const columnPairs = [
      ['lane-start:0.0:0', 'CorrectGrip', '0.0.1.0'],
      ['lane-start:0.0.1:0', 'RetryGrasp', '0.0.1.1.0'],
      ['lane-start:0.0.1.1:0', 'ReleaseAndRetry', '0.0.1.1.1'],
    ]
    for (const [insertId, name, path] of columnPairs) {
      const insert = inserts[insertId]
      const card = cards[path]
      check(`nested.${insertId}.exists`, `${insertId} is rendered`, Boolean(insert && card), true)
      if (!insert || !card) continue
      check(`nested.${insertId}.column`, `prepend "+" shares ${name}'s column center`,
        near(center(insert).x, center(card).x), true)
      check(`nested.${insertId}.half-unit`, `prepend "+" centers half a unit above ${name}`,
        near(center(insert).y, card.y - (GAP / 2) * zoomA), true)
    }
    const bareTerminus = inserts['lane-end:0.0.1.1:0']
    const bareArm = cards['0.0.1.1.1']
    check('nested.lane-end-bare.column', 'bare arm terminus "+" shares its own card\'s column',
      Boolean(bareTerminus && bareArm) && near(center(bareTerminus).x, center(bareArm).x), true)
    check('nested.lane-end-bare.half-unit', 'bare arm terminus "+" centers half a unit below its card',
      Boolean(bareTerminus && bareArm) && near(center(bareTerminus).y, bareArm.y + bareArm.h + (GAP / 2) * zoomA), true)

    // The junction Zach marked twice as wrong: the depth-1 arm is itself a
    // Fallback, so its exit IS its own merge corner. Its terminus "+" must
    // sit on CorrectGrip's rail column (the arm's own flow line), NOT off to
    // the side along the horizontal merge leg.
    const nestedTerminus = inserts['lane-end:0.0:0']
    const rail = cards['0.0.1.0']
    check('nested.lane-end-nested.on-flow-column', 'nested-arm terminus "+" sits on its arm\'s own rail column, not the horizontal leg',
      Boolean(nestedTerminus && rail) && near(center(nestedTerminus).x, center(rail).x), true)

    // CORRECTED 2026-09-06: every one of THIS scene's lane-start/lane-end
    // inserts (3 levels deep) must be hover-only, not persistent — only the
    // scene's own `end` insert is exempt. Geometry above already proves they
    // land in the right place; this proves they don't also stay on-screen
    // the way an earlier same-day ruling had them ("every single insert icon
    // is visible simultaneously" was Zach's report on this exact shape).
    const laneEntries = Object.entries(inserts).filter(([id]) => id.startsWith('lane-start:') || id.startsWith('lane-end:'))
    check('nested.lane-inserts.found', 'every nesting level contributed its own lane-start and lane-end (3 levels x 2 = 6)', laneEntries.length, 6)
    check('nested.lane-inserts.none-persistent', 'none of them are persistent — all hover-reveal', laneEntries.map(([id, insert]) => [id, insert.persistent]).filter(([, persistent]) => persistent), [])

    // Rule 1 — the start gap: Start→GraspValid equals one unit, with the
    // hover prepend "+" at its exact midpoint.
    const startInsert = inserts['start']
    const first = cards['0.0.0']
    check('nested.start.midpoint', 'the Start-gap "+" centers in its own gap on the rail column',
      Boolean(startInsert && first) && near(center(startInsert).y, first.y - (GAP / 2) * zoomA) && near(center(startInsert).x, center(first).x), true)

    await shot('nested-all-attachment-points.png')
    // Crop the exact junction from his annotated comparison (depth-1 arm
    // terminus below the nested Fallback's own merge corner).
    if (nestedTerminus) {
      await shot('nested-terminus-junction-crop.png', {
        x: Math.max(0, center(nestedTerminus).x - 260), y: Math.max(0, center(nestedTerminus).y - 200), width: 520, height: 400,
      })
    }

    /* ------------- Scene B: the Flowstate three-branch Parallel ------------- */
    await createRegion(FLOWSTATE_XML, 'InitializeWorkcell')
    const zoomB = await readZoom()
    const cardsB = await readCards()
    const insertsB = await readInserts()
    check('flowstate.cards', 'all six branch leaves project', Object.keys(cardsB).length, 6)

    // Rule 1 — within-branch stacking: every branch's two cards one unit apart.
    const stacks = [['0.0.0.0', '0.0.0.1'], ['0.0.1.0', '0.0.1.1'], ['0.0.2.0', '0.0.2.1']]
    const stackGaps = stacks.map(([a, b]) => (cardsB[b].y - (cardsB[a].y + cardsB[a].h)) / zoomB)
    check('flowstate.stack-gaps', 'all three branch stacks use exactly the unit',
      stackGaps.every((gap) => near(gap, GAP, TOL / zoomB)), true)

    // Rule 1 — fork-bar→node: the same unit for ALL THREE branches at once
    // (his red arrows mark the bar→branch gap on every branch, not just one).
    // The between-branch "+" rides the fork bar, so its center y IS the bar.
    const betweenB = Object.entries(insertsB).filter(([id]) => id.startsWith('between:0.0:'))
    check('flowstate.between-count', 'three branches offer exactly two between-branch inserts', betweenB.length, 2)
    const barY = betweenB.length > 0 ? center(betweenB[0][1]).y : NaN
    const barGaps = ['0.0.0.0', '0.0.1.0', '0.0.2.0'].map((path) => (cardsB[path].y - barY) / zoomB)
    check('flowstate.bar-to-node', 'fork bar→first node is the unit on every branch',
      barGaps.every((gap) => near(gap, GAP, TOL / zoomB)), true)

    // Rule 1 — branch→branch across the flow: adjacent branch boxes one unit
    // apart, edge to edge (branches 2 and 3 are plain card stacks, so their
    // card unions are their layout boxes).
    const unionX = (paths) => {
      const rects = paths.map((path) => cardsB[path])
      return { left: Math.min(...rects.map((rect) => rect.x)), right: Math.max(...rects.map((rect) => rect.x + rect.w)) }
    }
    const lane2 = unionX(['0.0.1.0', '0.0.1.1'])
    const lane3 = unionX(['0.0.2.0', '0.0.2.1'])
    check('flowstate.branch-gap', 'branch→branch box gap equals the unit',
      near((lane3.left - lane2.right) / zoomB, GAP, TOL / zoomB), true)

    // Rule 2 again on this shape.
    const collisionsB = []
    for (const [id, insert] of Object.entries(insertsB)) {
      for (const [path, card] of Object.entries(cardsB)) {
        if (intersects(insert, card)) collisionsB.push(`${id}∩${path}`)
      }
    }
    check('flowstate.no-overlap', 'no insert box intersects any card', collisionsB, [])

    // The terminal end "+": wire ends in it, one unit past the join
    // (semantics: cable terminates in the plus — the geometry he approved).
    const endInsert = insertsB['end']
    check('flowstate.end-persistent', 'the end "+" is always visible', endInsert?.persistent, true)

    await shot('flowstate-parallel-unit-gaps.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-process-spacing-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-process-spacing-failed-${entry.name}`), entry.data)
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
