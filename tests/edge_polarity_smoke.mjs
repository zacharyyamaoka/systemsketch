#!/usr/bin/env node
/**
 * Real-browser proof for edge polarity — which end of a cable is the source,
 * decided by WHERE the cable lands rather than by which dot was pressed.
 *
 * Born on 2026-09-01 as the reproduction for three reports in
 * `FR - Block, Ports & Edges Primitive` § "I cannot connect ports on blocks
 * outside anymore": an Expanded Block could not be wired to a sibling from
 * its own dots, a picker-spawned Block was wired output-to-output, and the
 * cable left the output heading the wrong way. Every check asserts the
 * DESIRED outcome, so the run that starts passing is the signal the fix
 * landed — and it stays as the regression suite afterwards.
 *
 *   SIBLING  two Expanded Blocks side by side, wired from either dot
 *   PICKER   a cable from an Expanded Block's output into empty space
 *   NESTED   the boundary of an Expanded Block and a Block inside it
 *   SCOPE    the picker places its Block in the scope the cable landed in
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  SHOTS,
  addPort,
  blockIds,
  box,
  cableEnds,
  cableSamples,
  cables,
  clearCables,
  deleteBlock,
  deselect,
  dragFrom,
  drawBlock,
  nearestDot,
  parentOf,
  pickerOpen,
  pointOnCable,
  portClasses,
  portDot,
  scope,
  setView,
  shot,
} from './block_journey_helpers.mjs'

const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
  return ok
}

/** Read the one cable's ends as dot labels plus the sign of each tangent. */
async function describeCable(page, dots) {
  try {
    const ends = await cableEnds(page)
    return {
      from: nearestDot(ends.from, dots),
      to: nearestDot(ends.to, dots),
      leavesRight: ends.leaveDx > 0,
      arrivesRight: ends.arriveDx > 0,
    }
  } catch {
    return null
  }
}

/** The index of the painted cable whose path starts on a given dot. */
async function cableIndexFrom(page, dots, label) {
  const count = await cables(page)
  for (let index = 0; index < count; index += 1) {
    const ends = await cableEnds(page, index)
    if (nearestDot(ends.from, dots) === label) return index
  }
  throw new Error(`No cable leaves ${label}`)
}

/** Selected shape types — selection has no DOM projection in tldraw v5, so this is a fixture read. */
const selectedTypes = (page) => evaluate(page,
  `JSON.stringify((window.__systemsketch?.editor.getSelectedShapes() ?? []).map((shape) => shape.type))`)
  .then((value) => JSON.parse(value ?? '[]'))

/** Pick a preset from the open offer and return the Block it created. */
async function pickCall(page, before) {
  const item = await box(page, '[data-testid="block-picker-call"]')
  await clickAt(page, item.cx, item.cy)
  await delay(600)
  await key(page, 'Escape', 'Escape') // leave the new Block's title editor
  await delay(200)
  return (await blockIds(page)).find((id) => !before.includes(id)) ?? null
}

const wiredPorts = async (page, names) => (await portClasses(page))
  .filter((entry) => entry.connected)
  .map((entry) => `${names[entry.shape] ?? '?'}.${entry.port}`)
  .sort()

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-polarity', build: 'edge-polarity' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ================================================== SIBLING + PICKER ===
    // Zach's screenshot: two Expanded Blocks next to each other. Drawn as Port
    // view first so both fit left of the inspector, then switched to Expanded,
    // which restores each Block's remembered 560 × 380 box.
    const restA = { x: 640, y: 830 }
    await drawBlock(page, { x: 60, y: 140 }, { x: 400, y: 340 }, 'encode')
    const [encode] = await blockIds(page)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await setView(page, 'expanded')
    await deselect(page, restA)

    await drawBlock(page, { x: 700, y: 140 }, { x: 1040, y: 340 }, 'merge')
    const merge = (await blockIds(page)).find((id) => id !== encode)
    await addPort(page, 'inputs')
    await addPort(page, 'inputs')
    await setView(page, 'expanded')
    await deselect(page, restA)

    // A second producer on the page, for the fan-in cases.
    await drawBlock(page, { x: 60, y: 560 }, { x: 400, y: 760 }, 'filter')
    const filter = (await blockIds(page)).find((id) => id !== encode && id !== merge)
    await addPort(page, 'outputs')
    await deselect(page, restA)

    const names = { [encode]: 'encode', [merge]: 'merge', [filter]: 'filter' }
    const dots = {
      'encode.in': await box(page, portDot(encode, 'input', 'in_1')),
      'encode.out': await box(page, portDot(encode, 'output', 'out_1')),
      'merge.in': await box(page, portDot(merge, 'input', 'in_1')),
      'merge.in2': await box(page, portDot(merge, 'input', 'in_2')),
      'filter.out': await box(page, portDot(filter, 'output', 'out_1')),
    }
    await shot(page, 'polarity-sibling-scene.png')

    // --- SIBLING-1: the reported gesture, output of one Expanded Block to the
    // input of the other.
    const sib1 = await dragFrom(page, dots['encode.out'], dots['merge.in'], {
      shotName: 'polarity-sibling-1-drag.png',
    })
    await shot(page, 'polarity-sibling-1-drop.png')
    check('SIBLING-1', 'encode.out → merge.in wires two Expanded siblings', sib1.count, 1)
    check('SIBLING-1-DIR', 'the cable leaves the output rightward and enters the input rightward',
      await describeCable(page, dots),
      { from: 'encode.out', to: 'merge.in', leavesRight: true, arrivesRight: true })
    await clearCables(page, restA)

    // --- SIBLING-2: the same wire made from the OTHER dot.
    const sib2 = await dragFrom(page, dots['merge.in'], dots['encode.out'], {
      shotName: 'polarity-sibling-2-drag.png',
    })
    check('SIBLING-2', 'merge.in → encode.out makes the same wire from the input dot', sib2.count, 1)
    check('SIBLING-2-DIR', 'and it is still drawn from the output to the input',
      await describeCable(page, dots),
      { from: 'encode.out', to: 'merge.in', leavesRight: true, arrivesRight: true })
    await clearCables(page, restA)

    // --- SIBLING-3 / 4: refusals that must hold between siblings.
    const sib3 = await dragFrom(page, dots['encode.in'], dots['merge.in'])
    check('SIBLING-3', 'input → input between siblings is refused', sib3.count, 0)
    await clearCables(page, restA)
    const through = await dragFrom(page, dots['encode.in'], dots['encode.out'], {
      shotName: 'polarity-passthrough-drag.png',
    })
    check('PASSTHROUGH-1', 'an Expanded Block passes its inlet straight through to its outlet',
      through.count, 1)
    check('PASSTHROUGH-1-DIR', 'drawn from the inlet\'s inside to the outlet\'s inside',
      await describeCable(page, dots),
      { from: 'encode.in', to: 'encode.out', leavesRight: true, arrivesRight: true })
    await shot(page, 'polarity-passthrough-drop.png')
    await clearCables(page, restA)

    // --- FAN-IN: an input takes many cables; only an exact duplicate is refused.
    await dragFrom(page, dots['encode.out'], dots['merge.in'])
    const second = await dragFrom(page, dots['filter.out'], dots['merge.in'], {
      shotName: 'polarity-fanin-drag.png',
    })
    await shot(page, 'polarity-fanin-two.png')
    check('FANIN-1', 'a second producer onto an occupied input joins it — the first cable stays',
      second.count, 2)
    check('FANIN-2', 'both producers and the input read as wired',
      await wiredPorts(page, names), ['encode.out_1', 'filter.out_1', 'merge.in_1'])
    const duplicate = await dragFrom(page, dots['encode.out'], dots['merge.in'])
    check('FANIN-3', 'the same wire a second time is refused', duplicate.count, 2)
    const fromOccupied = await dragFrom(page, dots['merge.in'], { x: 900, y: 640 })
    check('FANIN-4', 'pressing the occupied input starts a NEW cable rather than moving one',
      { offered: fromOccupied.offered, cables: fromOccupied.count }, { offered: true, cables: 3 })
    await key(page, 'Escape', 'Escape')
    await delay(380)
    check('FANIN-5', 'declining leaves the two cables in place', await cables(page), 2)
    // Move one of the two by its own handle: select the encode cable (found by
    // which dot its path leaves from, since DOM order says nothing about that),
    // then press the dot its END handle sits on and drag to the other input.
    const encodeIndex = await cableIndexFrom(page, dots, 'encode.out')
    const encodeCable = await pointOnCable(page, 0.5, encodeIndex)
    await clickAt(page, encodeCable.cx, encodeCable.cy)
    await delay(300)
    check('FANIN-6-SELECT', 'the encode cable is selected by clicking it in the gap',
      await selectedTypes(page), ['connection'])
    const moved = await dragFrom(page, dots['merge.in'], dots['merge.in2'])
    check('FANIN-6', 'a selected cable is re-routed by dragging its handle off the input',
      { cables: moved.count, wired: await wiredPorts(page, names) },
      { cables: 2, wired: ['encode.out_1', 'filter.out_1', 'merge.in_1', 'merge.in_2'] })
    await shot(page, 'polarity-fanin-moved.png')
    await clearCables(page, restA)

    // --- PICKER: the reported "order is switched" gesture.
    const before = await blockIds(page)
    const toEmpty = await dragFrom(page, dots['encode.out'], { x: 700, y: 640 })
    check('PICKER-1', 'a cable from an Expanded output into empty space offers a Block',
      toEmpty.offered, true)
    await shot(page, 'polarity-picker-open.png')
    const spawned = await pickCall(page, before)
    check('PICKER-2', 'picking creates one Block and binds the cable',
      { created: spawned !== null, cables: await cables(page) }, { created: true, cables: 1 })
    if (spawned) {
      names[spawned] = 'call'
      dots['call.in'] = await box(page, portDot(spawned, 'input', 'in_1'))
      dots['call.out'] = await box(page, portDot(spawned, 'output', 'out_1'))
    }
    await shot(page, 'polarity-picker-picked.png')
    check('PICKER-3', 'the new Block is wired through its INPUT, not its output',
      await wiredPorts(page, names), ['call.in_1', 'encode.out_1'])
    check('PICKER-4', 'and the cable leaves encode.out rightward into call.in',
      await describeCable(page, dots),
      { from: 'encode.out', to: 'call.in', leavesRight: true, arrivesRight: true })
    check('PICKER-5', 'a sibling of the cable\'s other end lands on the page',
      spawned ? await parentOf(page, spawned) : null, 'page:page')
    await clearCables(page, restA)
    if (spawned) await deleteBlock(page, spawned, restA)
    await deleteBlock(page, encode, restA)
    await deleteBlock(page, merge, restA)
    await deleteBlock(page, filter, restA)
    check('SIBLING-CLEAR', 'the sibling scene is cleared', (await blockIds(page)).length, 0)

    // ============================================================ NESTED ===
    const restB = { x: 60, y: 800 }
    await drawBlock(page, { x: 120, y: 120 }, { x: 1100, y: 700 }, 'run')
    const [run] = await blockIds(page)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await deselect(page, restB)

    await drawBlock(page, { x: 480, y: 300 }, { x: 820, y: 500 }, 'decode')
    const decode = (await blockIds(page)).find((id) => id !== run)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await deselect(page, restB)
    check('NESTED-0', 'decode was drawn inside run', await parentOf(page, decode), run)

    const nestedNames = { [run]: 'run', [decode]: 'decode' }
    const nested = {
      'run.in': await box(page, portDot(run, 'input', 'in_1')),
      'run.out': await box(page, portDot(run, 'output', 'out_1')),
      'decode.in': await box(page, portDot(decode, 'input', 'in_1')),
      'decode.out': await box(page, portDot(decode, 'output', 'out_1')),
    }
    await shot(page, 'polarity-nested-scene.png')

    const nest1 = await dragFrom(page, nested['run.in'], nested['decode.in'], {
      shotName: 'polarity-nested-1-drag.png',
    })
    check('NESTED-1', 'the boundary input feeds the inner Block', nest1.count, 1)
    check('NESTED-1-DIR', 'and leaves the inlet heading INTO the box',
      await describeCable(page, nested),
      { from: 'run.in', to: 'decode.in', leavesRight: true, arrivesRight: true })

    // --- ELBOW: the boundary is the cable's container, not an obstacle. The
    // FR's "switched to elbow and it went outside the board" was the router
    // steering around the very frame the cable lives inside.
    const onCable = await pointOnCable(page, 0.5)
    await clickAt(page, onCable.cx, onCable.cy)
    await delay(300)
    const elbowButton = await box(page, '[data-testid="connection-routing-elbow"]')
    await clickAt(page, elbowButton.cx, elbowButton.cy)
    await delay(400)
    await deselect(page, restB)
    await shot(page, 'polarity-elbow-inside.png')
    const runFace = await box(page, `${scope(run)} .systemsketch-block-canvas`)
    const elbow = await cableSamples(page, 40)
    check('ELBOW-1', 'switched to elbow, the boundary cable stays inside its own frame',
      elbow.every((point) => point.x >= runFace.x - 2 && point.x <= runFace.x + runFace.w + 2
        && point.y >= runFace.y - 2 && point.y <= runFace.y + runFace.h + 2),
      true)
    check('ELBOW-1-DIR', 'and still runs from the inlet into decode',
      await describeCable(page, nested),
      { from: 'run.in', to: 'decode.in', leavesRight: true, arrivesRight: true })

    // --- DELETE: a cable inside a frame is a real shape you can select by
    // pointer and delete — the claim the seam-based reset stopped proving.
    const onElbow = await pointOnCable(page, 0.5)
    await clickAt(page, onElbow.cx, onElbow.cy)
    await delay(240)
    await key(page, 'Delete', 'Delete')
    await delay(300)
    check('DELETE-1', 'clicking the cable and pressing Delete removes it, and only it',
      { cables: await cables(page), blocks: (await blockIds(page)).length }, { cables: 0, blocks: 2 })
    await clearCables(page, restB)

    const nest2 = await dragFrom(page, nested['decode.out'], nested['run.out'])
    check('NESTED-2', 'the inner Block returns through the boundary output', nest2.count, 1)
    check('NESTED-2-DIR', 'and arrives at the outlet from inside the box',
      await describeCable(page, nested),
      { from: 'decode.out', to: 'run.out', leavesRight: true, arrivesRight: true })
    await clearCables(page, restB)

    const nest3 = await dragFrom(page, nested['decode.out'], nested['run.in'])
    check('NESTED-3', 'data leaving the box through its own inlet is refused', nest3.count, 0)
    await clearCables(page, restB)
    const nest4 = await dragFrom(page, nested['run.out'], nested['decode.in'])
    check('NESTED-4', 'the outlet acting as a source for the inside is refused', nest4.count, 0)
    await clearCables(page, restB)
    const self = await dragFrom(page, nested['decode.out'], nested['decode.in'])
    check('NESTED-5', 'a collapsed Block feeding its own input is refused', self.count, 0)
    await clearCables(page, restB)

    // ============================================================= SCOPE ===
    // The picker puts its Block where the cable landed: inside the boundary
    // when the drop is inside, on the page when it is outside.
    let beforeScope = await blockIds(page)
    const inside = await dragFrom(page, nested['decode.out'], { x: 960, y: 620 })
    check('SCOPE-1', 'a child\'s output into the boundary\'s empty interior offers a Block',
      inside.offered, true)
    let child = await pickCall(page, beforeScope)
    if (child) {
      nestedNames[child] = 'call'
      nested['call.in'] = await box(page, portDot(child, 'input', 'in_1'))
    }
    await shot(page, 'polarity-scope-child.png')
    check('SCOPE-2', 'the new Block is a child of the boundary',
      child ? await parentOf(page, child) : null, run)
    check('SCOPE-3', 'wired from decode.out into its input',
      await wiredPorts(page, nestedNames), ['call.in_1', 'decode.out_1'])
    await clearCables(page, restB)
    if (child) await deleteBlock(page, child, restB)
    delete nested['call.in']

    beforeScope = await blockIds(page)
    const inlet = await dragFrom(page, nested['run.in'], { x: 300, y: 620 })
    check('SCOPE-4', 'the boundary inlet dragged into its own interior offers a Block',
      inlet.offered, true)
    child = await pickCall(page, beforeScope)
    if (child) {
      nestedNames[child] = 'call'
      nested['call.in'] = await box(page, portDot(child, 'input', 'in_1'))
    }
    await shot(page, 'polarity-scope-inlet.png')
    check('SCOPE-5', 'the new Block is inside, fed by the inlet',
      { parent: child ? await parentOf(page, child) : null, wired: await wiredPorts(page, nestedNames) },
      { parent: run, wired: ['call.in_1', 'run.in_1'] })
    check('SCOPE-5-DIR', 'and the cable leaves the inlet heading into the box',
      await describeCable(page, nested),
      { from: 'run.in', to: 'call.in', leavesRight: true, arrivesRight: true })
    await clearCables(page, restB)
    if (child) await deleteBlock(page, child, restB)
    delete nested['call.in']

    beforeScope = await blockIds(page)
    const outside = await dragFrom(page, nested['run.out'], { x: 1000, y: 800 })
    check('SCOPE-6', 'the boundary output dragged outside offers a Block', outside.offered, true)
    child = await pickCall(page, beforeScope)
    if (child) nestedNames[child] = 'call'
    await shot(page, 'polarity-scope-outside.png')
    check('SCOPE-7', 'the new Block lands on the page, fed by the outlet',
      { parent: child ? await parentOf(page, child) : null, wired: await wiredPorts(page, nestedNames) },
      { parent: 'page:page', wired: ['call.in_1', 'run.out_1'] })
    check('SCOPE-8', 'the offer is closed', await pickerOpen(page), false)

    check('CLEAN', 'the whole journey raised no local console errors',
      localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'edge-polarity.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
