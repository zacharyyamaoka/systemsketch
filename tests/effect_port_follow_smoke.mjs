#!/usr/bin/env node
/**
 * Real-browser proof that an outer effect port is *calculated*, not placed.
 *
 * The scene is the one that matters: a mutating call sits inside an expanded
 * `run()`. It has an effect port of its own, because `poses.append(pose)` writes
 * its argument in place. `run()` has one too, because it handed its own `poses`
 * to a call that writes it — that is the propagation rule, one level up.
 *
 * The question this answers: where does `run()`'s port go? Nobody should have to
 * say. Draw the cable out of the inner call, and the outer port lands wherever
 * that cable crosses the frame. Reroute the cable and the port follows.
 *
 * Everything is read back from the painted document after real pointer events.
 * A port has "moved" because its dot is painted somewhere else, not because a
 * model said so.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  ROOT,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  blockIds, box, deselect, dragFrom, drawBlock, parentOf, scope, setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const shotPath = (name) => join(SHOTS, `effect-port-follow-${name}-2026-09-03.png`)

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

/**
 * Click a Block to select it. A Block drawn inside an expanded one comes up in
 * a view with no heading band, so aim at the heading when there is one and at
 * the top strip of the card when there is not — either way it is a real click
 * on the painted Block, not a call into the editor.
 */
async function selectBlock(page, shapeId) {
  const hasHeading = await evaluate(page,
    `Boolean(document.querySelector(${JSON.stringify(`${scope(shapeId)} .NodeShape-heading`)}))`)
  const target = hasHeading
    ? await box(page, `${scope(shapeId)} .NodeShape-heading`)
    : await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, target.cx, hasHeading ? target.cy : target.y + 12)
  await delay(360)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  const button = await box(page, `[aria-label="${label}"]`)
  await clickAt(page, button.cx, button.cy)
  await delay(320)
}

async function markMutates(page, portId) {
  const toggle = await box(page, `[data-testid="inspector-port-mutates-${portId}"]`)
  await clickAt(page, toggle.cx, toggle.cy)
  await delay(420)
}

/** The effect port on one Block, and where the frame it sits on begins. */
async function effectPortOf(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return 'null'
    const canvas = wrapper.querySelector('.systemsketch-block-canvas')
    const frame = canvas.getBoundingClientRect()
    const dot = wrapper.querySelector('.Port[data-block-port-edge="top"]')
    if (!dot) return 'null'
    const r = dot.getBoundingClientRect()
    const cx = r.x + r.width / 2
    return JSON.stringify({
      id: dot.dataset.blockPortId,
      cx,
      // Fraction along the frame's top edge — the number the model stores.
      t: (cx - frame.x) / frame.width,
      frame: { x: frame.x, w: frame.width },
    })
  })()`)
  return value === 'null' ? null : JSON.parse(value)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-follow', build: 'effect-port-follow-smoke' })
  const { page, port } = app
  const checks = makeChecklist()
  const add = (label, ok) => { assert.ok(ok, label); checks.pass(label) }

  try {
    // This box runs many agent sessions at once and the load average swings
    // wildly; `openApp`'s stock 20s is a fair assumption on an idle machine and
    // a wrong one here. Navigate and wait with a window that survives a busy
    // host rather than failing for a reason that has nothing to do with the app.
    await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?preset=block-dev` })
    await waitFor(page, 'document.readyState === "complete"', 'page load', 90000)
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas', 90000)
    await delay(700)

    // ---- run(), expanded, with one mutated argument of its own -----------
    await drawBlock(page, { x: 260, y: 190 }, { x: 1020, y: 660 }, 'run')
    const [outer] = await blockIds(page)
    await selectBlock(page, outer)
    await addPort(page, 'inputs')
    await selectBlock(page, outer)
    await markMutates(page, 'in_1')
    // Clicking the mut chip takes focus, and the inspector's View section is
    // only up while the Block is the selection. Re-select before asking for it.
    await selectBlock(page, outer)
    // The View buttons read 'simple/port/expanded' in the DOM; the capitals are
    // CSS, and `setView` matches textContent exactly.
    await setView(page, 'expanded')
    await deselect(page)

    const seeded = await effectPortOf(page, outer)
    add('FOLLOW-1 run() carries an effect port, because it mutates poses', seeded !== null)
    await shot(page, '1-expanded')

    // ---- the mutating call, inside it ------------------------------------
    await drawBlock(page, { x: 380, y: 380 }, { x: 660, y: 540 }, 'poses.append')
    const inner = (await blockIds(page)).find((id) => id !== outer)
    add('FOLLOW-2 the call really is inside the expanded run(), not merely over it',
      (await parentOf(page, inner)) === outer)
    await selectBlock(page, inner)
    await addPort(page, 'inputs')
    await selectBlock(page, inner)
    await markMutates(page, 'in_1')
    await deselect(page)

    const innerPort = await effectPortOf(page, inner)
    add('FOLLOW-3 the inner call grows its own effect port', innerPort !== null)
    await shot(page, '2-inner-marked')

    // ---- a consumer OUTSIDE the frame, and a cable out to it -------------
    // The cable has to actually leave run() for there to be a crossing, so the
    // consumer lives outside it. Dropping onto empty canvas makes no cable at
    // all, which is what made an earlier version of this test pass for the
    // wrong reason.
    await drawBlock(page, { x: 1120, y: 200 }, { x: 1380, y: 330 }, 'len')
    const consumer = (await blockIds(page)).find((id) => id !== outer && id !== inner)
    await selectBlock(page, consumer)
    await addPort(page, 'inputs')
    await deselect(page)
    add('FOLLOW-4 the consumer is outside run(), so a cable to it must cross the frame',
      (await parentOf(page, consumer)) !== outer)

    const from = await box(page, `${scope(inner)} .Port[data-block-port-edge="top"]`)
    const to = await box(page, `${scope(consumer)} .Port[data-block-port-side="input"]`)
    await dragFrom(page, from, to)
    await delay(900)

    const cables = await evaluate(page,
      `document.querySelectorAll('[data-shape-type="connection"]').length`)
    // KNOWN FAILURE, and deliberately left in the tree.
    //
    // `connectionRules.ts` refuses a cable whose two Blocks are in different
    // scopes (`'no-shared-scope'`), and the interior of an expanded Block *is* a
    // scope. So a cable can never cross a frame edge: a boundary is crossed by
    // binding to the frame's own port, inner face on one side and outer on the
    // other. Everything above this line passes; from here the scene cannot be
    // built, which is the finding rather than a flake.
    //
    // This journey is the acceptance test for the fix — drive the outer port's
    // `edgeT` from the inner-face binding's endpoint instead of from a geometric
    // crossing — so it is kept failing rather than deleted or weakened.
    assert.ok(cables >= 1,
      'FOLLOW-5 the cable exists — it does not, because connectionRules refuses '
      + '`no-shared-scope`: a cable cannot join a Block inside an expanded frame to '
      + 'one outside it. Re-point the follow rule at the inner-face binding.')
    checks.pass('FOLLOW-5 the cable exists')
    await shot(page, '3-cable-drawn')

    /** Where the painted cable actually crosses the frame's top edge. */
    const crossingX = async () => JSON.parse(await evaluate(page, `(() => {
      const wrapper = document.querySelector(${JSON.stringify(scope(outer))})
      const frame = wrapper.querySelector('.systemsketch-block-canvas').getBoundingClientRect()
      const path = document.querySelector('[data-shape-type="connection"] path')
      if (!path) return 'null'
      const total = path.getTotalLength()
      let previous = path.getPointAtLength(0)
      const inside = (pt) => pt.y >= frame.y && pt.y <= frame.bottom
        && pt.x >= frame.x && pt.x <= frame.right
      for (let i = 1; i <= 240; i += 1) {
        const pt = path.getPointAtLength((total * i) / 240)
        // the step where it stops being inside, crossing the top edge upward
        if (inside(previous) && !inside(pt) && pt.y < frame.y + 2) {
          return JSON.stringify({ x: (previous.x + pt.x) / 2, frameX: frame.x, frameW: frame.width })
        }
        previous = pt
      }
      return 'null'
    })()`))

    const crossed = await crossingX()
    const outerPort = await effectPortOf(page, outer)
    add('FOLLOW-6 run()\'s effect port sits where the cable crosses the frame',
      crossed !== null && Math.abs(outerPort.cx - crossed.x) < 14)

    // ---- move the consumer; the cable reroutes and the port follows -------
    const before = outerPort.cx
    const card = await box(page, `${scope(consumer)} .systemsketch-block-canvas`)
    await dragFrom(page, { cx: card.cx, cy: card.y + 12 }, { cx: card.cx - 520, cy: card.y + 12 })
    await delay(1000)
    const movedCrossing = await crossingX()
    const movedPort = await effectPortOf(page, outer)
    add('FOLLOW-7 moving the consumer moved the port, with nobody placing it',
      Math.abs(movedPort.cx - before) > 20)
    add('FOLLOW-8 and it landed on the new crossing, not just somewhere else',
      movedCrossing !== null && Math.abs(movedPort.cx - movedCrossing.x) < 14)
    add('FOLLOW-9 it stayed on the top edge, clear of both corners',
      movedPort.t > 0.05 && movedPort.t < 0.95)
    await shot(page, '4-followed')

    add('FOLLOW-10 no console errors from the app', localConsoleErrors(page).length === 0)
  } finally {
    app.close()
  }

  console.log(`\n  ${checks.checks.length}/${checks.checks.length} effect-port-follow checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
