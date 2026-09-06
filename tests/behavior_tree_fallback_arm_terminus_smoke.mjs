/**
 * Zach's report, 2026-09-05: the Process view's hover-reveal insert points
 * (today's rebuild) place a persistent "+" at the end of the tree's main
 * sequence(s), but not at the end of a Fallback's failure/recovery arm — the
 * `GraspValid` → `CorrectGrip` guarded-Fallback pattern in the sample tree.
 * "The failure branch just becomes another sequential branch that you can
 * begin to stack skills and other things on."
 *
 * CORRECTED 2026-09-06: that same-day ruling made this terminus always-on
 * (`persistent: true`), which read fine for one arm. Once his literal
 * PickAndPlace board had multiple arms and a nested Fallback, every arm at
 * every level lit its own always-on "+" at once — "every single insert icon
 * is visible... the only icon that should show by default is the one at the
 * bottom." This journey now proves the corrected rule, in the real running
 * app:
 *   1. The "+" after `CorrectGrip` is HIDDEN at rest, like any other interior
 *      insert — no longer exempt — and fades in only once the pointer is
 *      near it (see `tests/behavior_tree_pickandplace_literal_smoke.mjs` for
 *      the fuller "only the true end-of-tree terminus stays persistent"
 *      proof across a whole nested board).
 *   2. Clicking it and choosing a Skill actually grows the tree correctly:
 *      `CorrectGrip` (a bare leaf under the Fallback) gets wrapped in a
 *      `Sequence` with the new node appended after it — not a third
 *      Fallback alternative.
 *   3. The same insert, clicked a second time after that growth, appends
 *      inside the now-existing Sequence rather than double-wrapping it —
 *      the "longer existing failure-arm chain" case Zach asked to check.
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

const OUT = join(SHOTS, 'behavior-tree-fallback-arm-terminus')
const REGION = 'shape:bt-fallback-arm'

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

/** Move the pointer onto the insert's own icon — inside its padded hover zone too, since the icon sits centered in it. */
async function hoverInsert(page, testId) {
  const box = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const rect = document.querySelector('[data-testid="${testId}"]').getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })())`))
  await mouseTo(page, box.x, box.y)
  await delay(200)
}

/** The Fallback's path in the sample tree — see btcppXml.ts's SAMPLE_BEHAVIOR_TREE_XML. */
const FALLBACK_PATH = '0.1'
const laneEndTestId = (index) => `bt-insert-lane-end:${FALLBACK_PATH}:${index}`

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-fallback-arm-terminus', build: 'behavior-tree-fallback-arm-terminus-smoke', width: 1680, height: 1050 })
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

    // ---- 1. the terminus insert exists and is hover-only, not persistent --
    const farAway = await farPoint(page)
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="${laneEndTestId(0)}"]'))`, 'a "+" after CorrectGrip')
    const atRest = await insertOpacity(page, laneEndTestId(0))
    check('lane-end.present-by-default', 'a "+" sits after CorrectGrip without the "Show all" toggle', (await region(page)).insertVisibility, 'hover')
    check('lane-end.hidden-at-rest', 'that "+" is invisible with the pointer far away — no longer an always-on exemption', atRest, 0)
    await shot(page, 'before-correctgrip-terminal.png')
    await hoverInsert(page, laneEndTestId(0))
    check('lane-end.hover-reveal', 'it fades in once the pointer is near it, same as any other interior insert', await insertOpacity(page, laneEndTestId(0)), 1)

    // ---- 2. clicking it grows CorrectGrip's bare-leaf arm into a Sequence ---
    const xmlBefore = await regionXml(page)
    await clickElement(page, `[data-testid="${laneEndTestId(0)}"]`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
    await clickElement(page, '[data-testid="bt-insert-row-model:PlanPath"]')
    await delay(200)
    const xmlAfterFirst = await regionXml(page)
    check('lane-end.wraps-bare-leaf', "CorrectGrip's arm is wrapped in a Sequence with the new node after it, not a third Fallback alternative",
      /<Fallback[^>]*>\s*<GraspValid[^/]*\/>\s*<Sequence>\s*<CorrectGrip[^/]*\/>\s*<PlanPath/.test(xmlAfterFirst), true)
    check('lane-end.node-count', 'exactly one PlanPath was added', (xmlAfterFirst.match(/<PlanPath/g) ?? []).length - (xmlBefore.match(/<PlanPath/g) ?? []).length, 1)
    await fitRegion(page)
    await shot(page, 'after-correctgrip-wrapped.png')

    // ---- 3. the same terminus, clicked again, grows in place (no double-wrap) --
    // Deselect first — `applyEdit` left the just-created PlanPath selected,
    // and a selected descendant reveals every insert via the same
    // `[data-selected='true']` rule Tree view relies on (see
    // tests/behavior_tree_process_recovery_rail_smoke.mjs's identical note).
    await evaluate(page, '(window.__systemsketch.editor.selectNone(), null)')
    await mouseTo(page, farAway.x, farAway.y)
    await delay(150)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="${laneEndTestId(0)}"]'))`, 'a "+" after the now-longer chain')
    const stillAtRest = await insertOpacity(page, laneEndTestId(0))
    check('lane-end.stays-hover-only-on-longer-chain', 'the terminus insert stays hidden at rest once the arm already has a Sequence', stillAtRest, 0)
    await clickElement(page, `[data-testid="${laneEndTestId(0)}"]`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu again')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page again')
    await clickElement(page, '[data-testid="bt-insert-row-model:FollowPath"]')
    await delay(200)
    const xmlAfterSecond = await regionXml(page)
    check('lane-end.grows-in-place', 'the second append lands inside the same Sequence — no nested Sequence(Sequence(...))',
      /<Fallback[^>]*>\s*<GraspValid[^/]*\/>\s*<Sequence>\s*<CorrectGrip[^/]*\/>\s*<PlanPath[^/]*\/>\s*<FollowPath/.test(xmlAfterSecond), true)
    check('lane-end.no-nested-sequence', 'never a Sequence directly inside another', /<Sequence>\s*<Sequence>/.test(xmlAfterSecond), false)
    await fitRegion(page)
    await shot(page, 'after-correctgrip-grown-again.png')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-fallback-arm-terminus-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-fallback-arm-terminus-failed-${entry.name}`), entry.data)
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
