/**
 * Zach's before/after mockups, 2026-09-05: two Process-view gaps that were
 * missing a prepend "+".
 *
 *   1. A Fallback's Failure edge used to graft almost straight into the SIDE
 *      of the recovery arm's first node. It now turns down with real
 *      vertical room and enters the node's TOP, the same face every other
 *      node-to-node connection enters from — and that room holds a "+" to
 *      prepend a node before the arm's current first node. This one FIRST
 *      shipped persistent (matching a same-day ruling that a recovery arm's
 *      terminus should be always-on like a Sequence's tail), but Zach's
 *      2026-09-06 follow-up on his fuller, multi-arm/nested board reversed
 *      that: every arm's own prepend/terminus is an interior gap like any
 *      other and should hover-reveal — only the true end-of-tree terminus
 *      stays persistent (see `processLayout.ts`'s `lanesWithRecovery`).
 *   2. Every node-to-node gap in the root sequence already had a "+" except
 *      the very first one, between Start and the tree's current first node.
 *      This one FIRST shipped persistent too, but Zach's follow-up call the
 *      same day was that it's an interior gap like any other, so it should
 *      hover-reveal instead — see `processLayout.ts`'s `start` insert.
 *
 * This journey proves both, in the real running app, now with the SAME
 * shape: hidden at rest, fades in only once the pointer is near it, and the
 * inspector's "Show all attachment points" toggle still force-reveals it —
 * matching every other interior insert (see
 * `tests/behavior_tree_process_v2_smoke.mjs`'s Item 1 for that same proof
 * shape). Both then get clicked to confirm the Add-process menu opens and
 * the resulting XML shows the new node landed exactly where it should —
 * BEFORE the previous first node, not after it and not as a new Fallback
 * alternative. See `tests/behavior_tree_fallback_arm_terminus_smoke.mjs`,
 * which proves the append-after mirror of this same insert.
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

const OUT = join(SHOTS, 'behavior-tree-recovery-rail')
const REGION = 'shape:bt-recovery-rail'

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
  return shape ? { ...shape.props, xml: undefined } : null
})())`).then(JSON.parse)

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function mouseTo(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
}

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

/**
 * A point inside an insert's padded hover zone but outside its own visible
 * icon — "near it", not "on it" — measured live off both boxes' actual
 * screen rects rather than a fixed pixel offset. This region's fit-to-bounds
 * zoom is far below 1x (a bigger tree than `behavior_tree_process_v2_smoke`
 * fits), which shrinks both boxes on screen; a hardcoded +15px (right for
 * that other journey's own zoom) landed outside this zone entirely and
 * always read opacity 0.
 */
async function insertHoverPoint(page, testId) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const el = document.querySelector('[data-testid="${testId}"]')
    const buttonRect = el.getBoundingClientRect()
    const zone = el.closest('.BehaviorTree-insertZone')
    const zoneRect = zone ? zone.getBoundingClientRect() : buttonRect
    const cx = buttonRect.x + buttonRect.width / 2
    const cy = buttonRect.y + buttonRect.height / 2
    const offset = (buttonRect.width / 2 + zoneRect.width / 2) / 2
    return { x: cx + offset, y: cy }
  })())`))
}

async function selectRegion(page) {
  await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
  await delay(200)
}

/** The Fallback's path in the sample tree — see btcppXml.ts's SAMPLE_BEHAVIOR_TREE_XML. */
const FALLBACK_PATH = '0.1'
const laneStartTestId = `bt-insert-lane-start:${FALLBACK_PATH}:0`
const startTestId = 'bt-insert-start'

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-process-recovery-rail', build: 'behavior-tree-process-recovery-rail-smoke', width: 1680, height: 1050 })
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
    await fitRegion(page)
    check('setup.projection', 'the region opens in Process view', (await region(page)).projection, 'process')

    // ---- Ask 1: the recovery-rail prepend, above CorrectGrip -------------
    const farAway = await farPoint(page)
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="${laneStartTestId}"]'))`, 'a "+" above CorrectGrip')
    const laneStartAtRest = await insertOpacity(page, laneStartTestId)
    check('lane-start.hidden-at-rest', 'the prepend "+" above CorrectGrip is invisible with the pointer far away — no longer an always-on exemption', laneStartAtRest, 0)
    await shot(page, 'before-fallback-arm.png')

    const laneStartHover = await insertHoverPoint(page, laneStartTestId)
    await mouseTo(page, laneStartHover.x, laneStartHover.y)
    await delay(150)
    check('lane-start.hover-reveal', 'it fades in once the pointer is near (not on) it, same as any other interior insert', await insertOpacity(page, laneStartTestId), 1)
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)

    const xmlBeforeLane = await regionXml(page)
    await clickElement(page, `[data-testid="${laneStartTestId}"]`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
    await clickElement(page, '[data-testid="bt-insert-row-model:PlanPath"]')
    await delay(200)
    const xmlAfterLane = await regionXml(page)
    check('lane-start.wraps-bare-leaf-before', 'CorrectGrip is wrapped in a Sequence with the new node BEFORE it, not a third Fallback alternative',
      /<Fallback[^>]*>\s*<GraspValid[^/]*\/>\s*<Sequence>\s*<PlanPath[^/]*\/>\s*<CorrectGrip/.test(xmlAfterLane), true)
    check('lane-start.node-count', 'exactly one PlanPath was added', (xmlAfterLane.match(/<PlanPath/g) ?? []).length - (xmlBeforeLane.match(/<PlanPath/g) ?? []).length, 1)
    await fitRegion(page)
    await shot(page, 'after-fallback-arm-prepend.png')

    // ---- Ask 2: the root-sequence prepend, between Start and MoveToObj ---
    // Unlike the recovery-arm prepend above, this one is NOT persistent —
    // Zach's same-day follow-up call was that it's an interior gap like any
    // other, so it hover-reveals exactly like `bt-insert-between:*` does in
    // tests/behavior_tree_process_v2_smoke.mjs. Ask 1's insert left its new
    // PlanPath node selected (applyEdit selects whatever it just created),
    // and a selected descendant reveals every insert via the same
    // `[data-selected='true']` rule Tree view relies on — deselect first so
    // this rest check reflects an actually-at-rest region, not a residual
    // selection from the previous insert.
    await evaluate(page, '(window.__systemsketch.editor.selectNone(), null)')
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="${startTestId}"]'))`, 'a "+" between Start and the first node')
    const startAtRest = await insertOpacity(page, startTestId)
    check('start.hidden-at-rest', 'the Start→root prepend "+" is invisible with the pointer far away', startAtRest, 0)
    await shot(page, 'before-root-prepend-hidden.png')

    // Between the insert's own icon and the edge of its padded hover zone —
    // proving "near it", not "on it" — measured live (see `insertHoverPoint`)
    // since this region's fit-to-bounds zoom is well under 1x.
    const startHover = await insertHoverPoint(page, startTestId)
    await mouseTo(page, startHover.x, startHover.y)
    await delay(150)
    const startRevealed = await insertOpacity(page, startTestId)
    check('start.hover-reveal', 'the Start→root prepend "+" fades in once the pointer is near (not on) it', startRevealed, 1)
    await shot(page, 'before-root-prepend.png')

    // The inspector's explicit debug toggle also force-reveals it, same as
    // every other interior insert.
    await selectRegion(page)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-view-inserts"]'))`, "the inspector's Attachment points row")
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await clickElement(page, '[data-testid="bt-view-inserts-all"]')
    await delay(200)
    const startUnderAll = await insertOpacity(page, startTestId)
    check('start.all-reveals-it', '"Show all" reveals the Start→root prepend "+" with the pointer away', startUnderAll, 1)
    await clickElement(page, '[data-testid="bt-view-inserts-hover"]')
    await delay(200)
    check('start.toggle-back', 'the toggle switches back to hover-reveal', (await region(page)).insertVisibility, 'hover')

    const xmlBeforeRoot = await regionXml(page)
    // This insert's menu opens UPWARD (see BtInsertMenu's `openUpward`) since
    // its own node sits right below it — Start is only one PROCESS_GAP unit away
    // at the top of the fitted view, so give it room the way a person would
    // scroll before adding, same as `bt-insert-end`'s own centering in
    // tests/behavior_tree_smoke.mjs. No manual hover needed here —
    // `clickElement` moves the mouse to the target's own center before
    // pressing, which reveals a hover-only "+" exactly the way a real click
    // would.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const button = document.querySelector('[data-testid="${startTestId}"]')
      const rect = button.getBoundingClientRect()
      const point = editor.screenToPage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      editor.centerOnPoint(point, { animation: { duration: 0 } })
      return null
    })()`)
    await delay(200)
    await clickElement(page, `[data-testid="${startTestId}"]`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu for the root prepend')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page for the root prepend')
    await clickElement(page, '[data-testid="bt-insert-row-model:MoveHome"]')
    await delay(200)
    const xmlAfterRoot = await regionXml(page)
    check('start.prepends-before-first-child', 'MoveHome is now the root sequence\'s first child, MoveToObj shifted to second',
      /<Sequence name="Pick and place">\s*<MoveHome[^/]*\/>\s*<SubTree ID="MoveToObj"/.test(xmlAfterRoot), true)
    check('start.node-count', 'exactly one MoveHome was added', (xmlAfterRoot.match(/<MoveHome/g) ?? []).length - (xmlBeforeRoot.match(/<MoveHome/g) ?? []).length, 1)
    await fitRegion(page)
    await shot(page, 'after-root-prepend.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-process-recovery-rail-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-process-recovery-rail-failed-${entry.name}`), entry.data)
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
