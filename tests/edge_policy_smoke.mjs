#!/usr/bin/env node
/**
 * Real-browser acceptance for Settings › Connections — the edge creation policy.
 *
 * The claim under test is that the SAME gesture on the SAME board produces a
 * different answer depending on the policy, all the way from a plain whiteboard
 * where any dot reaches any other, up to Strict where only an edge that could
 * exist in the running program can be drawn at all.
 *
 * Every policy change is made by clicking the real Settings panel, and every
 * verdict is read from the painted document — the cables that exist on screen
 * after a real press-drag-release. Nothing here asserts against the judge
 * directly; `src/blocks/connections/connectionPolicy.test.ts` does that, and a
 * unit test cannot prove the panel is wired to it.
 *
 *   BASELINE     the default policy behaves exactly as SystemSketch always has
 *   WHITEBOARD   output → output, refused by default, becomes drawable
 *   BLACKBOX     a child reaching past its own Block's wall, both ways
 *   TYPES        Pose → bytes refused, pose → Pose kept
 *   FANIN        a second producer into one input, both ways
 *   CUSTOM       one flipped switch reads Custom, and Reset returns to Guided
 *
 * Run with:
 *   node tests/edge_policy_smoke.mjs
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  mouse,
  openApp,
  readConsoleErrors,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  blockIds,
  box,
  clearCables,
  deselect,
  dragFrom,
  drawBlock,
  portDot,
  scope,
  setView,
  shot,
} from './block_journey_helpers.mjs'

const SHOTS = process.env.SYSTEMSKETCH_SMOKE_ARTIFACT_DIR ?? join(ROOT, 'docs', 'assets')
const PANEL = '[data-testid="systemsketch-connections-panel"]'
// The board shell's inspector has no wrapper testid; its first section is the
// reliable "a Block is selected and the panel has mounted" signal.
const INSPECTOR = '[data-inspector-section="Block"]'
// The inspector owns x >= 1440 and the main toolbar owns the bottom centre, so
// this is canvas nobody else claims — a deselect that lands on a control
// silently changes the selection instead of clearing it.
const EMPTY_CANVAS = { x: 1350, y: 930 }

const { checks, pass, add, report } = makeChecklist()

/* ------------------------------ the settings ------------------------------- */

async function openConnectionSettings(page) {
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-connections"]')
  await waitFor(page, `document.querySelector('${PANEL}')`, 'the Connections panel')
  await delay(220)
}

async function closeSettings(page) {
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`,
    'the Settings dialog to close')
  await delay(220)
}

/** What the panel says about itself: which preset is live, and how many rules bite. */
async function panelState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const panel = document.querySelector('${PANEL}')
    if (!panel) return 'null'
    return JSON.stringify({
      preset: panel.dataset.preset,
      enforced: Number(panel.dataset.enforced),
      readout: panel.querySelector('[data-testid="systemsketch-edge-policy-count"]')?.textContent,
    })
  })()`))
}

/** The persisted record, so a choice outlives this page's memory. */
async function storedPolicy(page) {
  const raw = await evaluate(page, `localStorage.getItem('systemsketch.edgePolicy.v1')`)
  return raw ? JSON.parse(raw) : null
}

/** Apply a preset from the real panel and return to the board. */
async function usePreset(page, id, expectedEnforced) {
  await openConnectionSettings(page)
  await clickElement(page, `[data-testid="systemsketch-edge-preset-${id}"]`)
  await waitFor(page,
    `document.querySelector('${PANEL}')?.dataset.preset === ${JSON.stringify(id)}`,
    `the panel to report the ${id} preset`)
  const state = await panelState(page)
  add(`PRESET-${id.toUpperCase()}  ${id} enforces ${expectedEnforced} of 9 rules, and says so on screen`,
    state.enforced === expectedEnforced && state.readout === `${expectedEnforced}/9`)
  await shot(page, `edge-policy-panel-${id}.png`)
  await closeSettings(page)
  return state
}

/**
 * Click a control inside the Connections panel, which scrolls.
 *
 * `clickElement` clicks page coordinates, and a control below the panel's fold
 * has coordinates outside the panel's clip box — the press lands on whatever is
 * painted there instead, and the setting silently never changes.
 */
async function clickInPanel(page, selector) {
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, selector)
  await evaluate(page, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`)
  await delay(220)
  await clickElement(page, selector)
  await delay(220)
}

/* -------------------------------- the board -------------------------------- */

/** Select a Block by pressing its heading, so the inspector and gutters appear. */
async function selectBlock(page, shapeId) {
  await deselect(page, EMPTY_CANVAS)
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, face.x + 24, face.y + 12)
  await waitFor(page, `document.querySelector('${INSPECTOR}')`, 'the inspector')
  await delay(220)
}

/**
 * Add one port through the real in-window gutter: hover the lane to reveal its
 * bead, click it, and declare the port the way a person types it.
 *
 * The bead parses a Python-shaped declaration, so `pose_out: Pose` authors the
 * NAME and the TYPE in one gesture — which matters here, because the type is
 * exactly what the Typed and Strict policies read. Writing it into the shape
 * through the development seam instead would leave the authoring path unproven.
 */
async function addPortFromGutter(page, side, declaration, painted) {
  const zone = await box(page, `[data-testid="block-port-add-zone-${side}"]`)
  await mouse(page, 'mouseMoved', zone.cx, zone.cy)
  await delay(240)
  const bead = await box(page, `[data-testid="block-port-add-${side}"]`)
  await mouse(page, 'mouseMoved', bead.cx, bead.cy)
  await delay(140)
  await clickAt(page, bead.cx, bead.cy)
  await waitFor(page, `document.querySelector('[data-testid^="block-inline-port-name-${side}-"]')`,
    `the ${side} port name editor`)
  await page.send('Input.insertText', { text: declaration })
  await key(page, 'Enter', 'Enter')
  await waitFor(page,
    `Array.from(document.querySelectorAll('.BlockNode-portName')).some((node) => node.textContent === ${JSON.stringify(painted)})`,
    `the authored ${side} port ${declaration}`)
  await delay(200)
}

/**
 * Draw a Block, give it one typed input and one typed output, and leave it in
 * `finalView`.
 *
 * The port gutter only exists on an Expanded Block, so the view is forced up
 * before authoring and set to its final value afterwards — a Block drawn small
 * enough starts `simple`, where there is no gutter to hover and the ports would
 * silently never be added.
 */
async function makeBlock(page, from, to, title, finalView, input, output) {
  await deselect(page, EMPTY_CANVAS)
  await delay(260)
  const before = await blockIds(page)
  await drawBlock(page, from, to, title)
  const id = (await blockIds(page)).find((shapeId) => !before.includes(shapeId))
  await selectBlock(page, id)
  await setView(page, 'expanded')
  await selectBlock(page, id)
  await addPortFromGutter(page, 'inputs', input.declaration, input.name)
  await selectBlock(page, id)
  await addPortFromGutter(page, 'outputs', output.declaration, output.name)
  await selectBlock(page, id)
  await setView(page, finalView)
  await deselect(page, EMPTY_CANVAS)
  return id
}

/** Every port's declared type, read off the shapes the board actually holds. */
async function declaredTypes(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const shapes = window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'block')
    const read = (list) => list.map((port) => port.name + ':' + port.type)
    return JSON.stringify(Object.fromEntries(shapes.map((shape) => [
      shape.props.title, [...read(shape.props.inputs), ...read(shape.props.outputs)].join(' '),
    ])))
  })()`))
}

/**
 * Drag one dot onto another and report how many cables the board now holds.
 *
 * A refused landing raises nothing anywhere — the cable simply finds no legal
 * target, the drop is discarded, and the count does not move. That is the
 * observable this whole journey turns on.
 */
async function wire(page, from, to, { shotName, afterShot } = {}) {
  const result = await dragFrom(page, from, to, { shotName })
  // The mid-drag frame `dragFrom` takes shows the cable in flight, which looks
  // the same whether the landing is about to be accepted or refused. The report
  // needs the frame AFTER release — that is where the two answers differ.
  if (afterShot) await shot(page, afterShot)
  return { cables: result.count, offered: result.offered }
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'edge-policy', build: 'edge-policy', width: 1720, height: 1040 })
  const { page, port, filesRoot } = app

  try {
    // A scratch board, never Zach's: the app autosaves into whatever it opens.
    const board = join(filesRoot, 'SystemSketch', 'edge-policy.systemsketch')
    // portLanes=0 pins the single-line port editor this journey drives (multi-line lanes are the default).
    await openApp(page, port, `?board=${encodeURIComponent(board)}&portLanes=0`)
    await waitFor(page, `document.querySelector('.tl-container')`, 'the board canvas')
    await delay(1200)

    // -------------------------------------------------------- the scene ---
    // `outer` is an Expanded Block holding `inner`; `sibling` and `extra` are
    // its siblings on the page. That gives both a boundary to cross and three
    // Blocks in one scope to fan cables between.
    const outer = await makeBlock(page, { x: 200, y: 80 }, { x: 900, y: 430 }, 'outer', 'expanded',
      { declaration: 'gate: Pose', name: 'gate' }, { declaration: 'result: Pose', name: 'result' })
    const inner = await makeBlock(page, { x: 320, y: 170 }, { x: 620, y: 340 }, 'inner', 'port',
      { declaration: 'seed: Pose', name: 'seed' }, { declaration: 'step: Pose', name: 'step' })
    const sibling = await makeBlock(page, { x: 200, y: 520 }, { x: 660, y: 700 }, 'sibling', 'port',
      { declaration: 'pose_in: Pose', name: 'pose_in' }, { declaration: 'pose_out: Pose', name: 'pose_out' })
    const extra = await makeBlock(page, { x: 200, y: 760 }, { x: 660, y: 930 }, 'extra', 'port',
      { declaration: 'raw: bytes', name: 'raw' }, { declaration: 'echo: pose', name: 'echo' })

    const dots = async () => ({
      'outer.out': await box(page, portDot(outer, 'output', 'out_1')),
      'inner.out': await box(page, portDot(inner, 'output', 'out_1')),
      'sibling.in': await box(page, portDot(sibling, 'input', 'in_1')),
      'sibling.out': await box(page, portDot(sibling, 'output', 'out_1')),
      'extra.in': await box(page, portDot(extra, 'input', 'in_1')),
      'extra.out': await box(page, portDot(extra, 'output', 'out_1')),
    })
    let dot = await dots()
    await shot(page, 'edge-policy-scene.png')
    pass('SCENE      an Expanded box with a child, and two siblings beside it, all ports typed')

    const parented = await evaluate(page,
      `String(window.__systemsketch.editor.getShape(${JSON.stringify(inner)}).parentId)`)
    add('SCENE-1    inner really is inside outer, so there is a real boundary to cross',
      parented === outer)

    const types = await declaredTypes(page)
    add('SCENE-2    the gutter authored names AND types in one gesture',
      types.sibling === 'pose_in:Pose pose_out:Pose' && types.extra === 'raw:bytes echo:pose')

    /* ---------------------------------------------------- BASELINE ------ */
    add('BASELINE-0  a fresh install has stored no policy at all',
      (await storedPolicy(page)) === null)

    await openConnectionSettings(page)
    const opened = await panelState(page)
    add('BASELINE-1  the panel opens on Guided, enforcing 5 of 9 rules, and says so on screen',
      opened.preset === 'guided' && opened.enforced === 5 && opened.readout === '5/9')
    await shot(page, 'edge-policy-panel-guided.png')
    await closeSettings(page)

    const normal = await wire(page, dot['sibling.out'], dot['extra.in'])
    add('BASELINE-2  an ordinary output → input still wires under the default policy',
      normal.cables === 1)
    await clearCables(page, EMPTY_CANVAS)

    dot = await dots()
    const twoOutputs = await wire(page, dot['sibling.out'], dot['extra.out'],
      { shotName: 'edge-policy-guided-refuses-output-to-output.png', afterShot: 'edge-policy-after-guided-two-outputs.png' })
    add('BASELINE-3  output → output is refused, and offers nothing in its place',
      twoOutputs.cables === 0 && twoOutputs.offered === false)

    const acrossWall = await wire(page, dot['inner.out'], dot['sibling.in'],
      { afterShot: 'edge-policy-after-guided-boundary.png' })
    add('BASELINE-4  a child reaching past its own Block\'s wall is refused — the black box holds',
      acrossWall.cables === 0)
    await clearCables(page, EMPTY_CANVAS)

    /* -------------------------------------------------- WHITEBOARD ------ */
    await usePreset(page, 'whiteboard', 0)
    const permissive = await storedPolicy(page)
    add('WHITEBOARD-1  the choice is persisted with every permission granted',
      permissive?.allowSamePolarity === true && permissive?.allowCrossBoundary === true
        && permissive?.typeMatching === 'off')

    dot = await dots()
    const nowAllowed = await wire(page, dot['sibling.out'], dot['extra.out'],
      { shotName: 'edge-policy-whiteboard-allows-output-to-output.png', afterShot: 'edge-policy-after-whiteboard-two-outputs.png' })
    add('WHITEBOARD-2  the SAME output → output gesture now draws a cable',
      nowAllowed.cables === 1)

    // With polarity withdrawn the model has no opinion left about direction, so
    // it falls back to the whiteboard's own answer: the way you drew it.
    const direction = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const cable = editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
      if (!cable) return 'null'
      const ends = {}
      for (const binding of editor.getBindingsFromShape(cable, 'connection')) {
        ends[binding.props.terminal] = String(binding.toId)
      }
      return JSON.stringify(ends)
    })()`))
    add('WHITEBOARD-3  the arrow points the way it was dragged, sibling → extra',
      direction.start === sibling && direction.end === extra)
    await clearCables(page, EMPTY_CANVAS)

    dot = await dots()
    const throughWall = await wire(page, dot['inner.out'], dot['sibling.in'],
      { shotName: 'edge-policy-whiteboard-crosses-boundary.png', afterShot: 'edge-policy-after-whiteboard-boundary.png' })
    add('BLACKBOX-1  a child now wires straight through its Block\'s wall',
      throughWall.cables === 1)
    const cableParent = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const cable = editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
      return cable ? String(cable.parentId) : null
    })()`)
    add('BLACKBOX-2  the cable takes a parent holding BOTH ends, so neither half is clipped away',
      cableParent !== null && cableParent !== outer)
    await clearCables(page, EMPTY_CANVAS)

    /* -------------------------------------------------------- TYPES ----- */
    await usePreset(page, 'strict', 8)
    dot = await dots()

    const mismatch = await wire(page, dot['sibling.out'], dot['extra.in'],
      { shotName: 'edge-policy-strict-refuses-type-mismatch.png', afterShot: 'edge-policy-after-strict-type-mismatch.png' })
    add('TYPES-1    Pose → bytes is refused under Strict', mismatch.cables === 0)

    const agreeing = await wire(page, dot['extra.out'], dot['sibling.in'],
      { afterShot: 'edge-policy-after-strict-types-agree.png' })
    add('TYPES-2    pose → Pose is kept: a typed whiteboard is not a case-sensitive one',
      agreeing.cables === 1)

    /* -------------------------------------------------------- FANIN ----- */
    // A second producer into the input `extra.out` already feeds. Both ends are
    // Pose, so nothing but the fan-in rule can be doing the refusing.
    dot = await dots()
    const secondProducer = await wire(page, dot['outer.out'], dot['sibling.in'],
      { shotName: 'edge-policy-strict-refuses-fan-in.png', afterShot: 'edge-policy-after-strict-fan-in.png' })
    add('FANIN-1    Strict refuses a second producer into one input',
      secondProducer.cables === 1)

    await usePreset(page, 'guided', 5)
    dot = await dots()
    const fanInAllowed = await wire(page, dot['outer.out'], dot['sibling.in'],
      { shotName: 'edge-policy-guided-allows-fan-in.png', afterShot: 'edge-policy-after-guided-fan-in.png' })
    add('FANIN-2    Guided allows it — the same gesture, the opposite answer',
      fanInAllowed.cables === 2)
    await clearCables(page, EMPTY_CANVAS)

    /* ------------------------------------------------------- CUSTOM ----- */
    await openConnectionSettings(page)
    await clickInPanel(page, '[data-testid="systemsketch-edge-policy-allowCrossBoundary"]')
    await waitFor(page, `document.querySelector('${PANEL}')?.dataset.preset === 'custom'`,
      'the panel to report a custom policy')
    const custom = await panelState(page)
    add('CUSTOM-1   flipping one switch reads Custom rather than naming a preset it is not',
      custom.preset === 'custom' && custom.enforced === 4)
    await shot(page, 'edge-policy-panel-custom.png')

    await clickInPanel(page, '[data-testid="systemsketch-edge-policy-reset"]')
    await waitFor(page, `document.querySelector('${PANEL}')?.dataset.preset === 'guided'`,
      'the panel to return to Guided')
    add('CUSTOM-2   Reset puts every rule back to Guided',
      (await panelState(page)).enforced === 5)

    // Type matching is a three-way, not a switch: prove the middle rung too.
    await clickInPanel(page, '[data-testid="systemsketch-edge-type-matching-lenient"]')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-edge-type-matching-lenient"]')?.getAttribute('aria-checked') === 'true'`,
      'lenient type matching')
    add('CUSTOM-3   type matching moves independently of the nine switches',
      (await storedPolicy(page))?.typeMatching === 'lenient')
    await clickInPanel(page, '[data-testid="systemsketch-edge-policy-reset"]')
    await closeSettings(page)

    const errors = readConsoleErrors(page)
    add('QUIET      the whole journey raised no console errors', errors.length === 0)

    report('edge creation policy')
    // The report builder reads this rather than counting `add(` calls in the
    // source: several checks are raised from helpers that run more than once,
    // so the only honest count is the one this run actually produced.
    await writeFile(join(SHOTS, 'edge-policy-checks.json'),
      JSON.stringify({ checks, total: checks.length }, null, 2))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAILED  ${error?.stack ?? error}\n`)
  process.exitCode = 1
})
