/**
 * The literal-argument pill, driven in a real browser.
 *
 *   P draws a capsule and the literal types straight in; its outlet wires into
 *   a consumer's input and dims that input's definition default; a click on
 *   `=` names it (and the name is the outlet's name); a long literal folds to
 *   `…` with the full text in the tooltip; an input dropped on empty canvas
 *   can pick Value; and the product toolbar carries the Pill slot with P.
 *
 * Runs in the Block Dev composition on a scratch board, then switches to the
 * product composition (still on the scratch files root) for the toolbar check.
 * Every claim is read back from the painted DOM or the editor; the seam is
 * used only to seed the two consumer Blocks.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  SHOTS,
  box,
  cables,
  deselect,
  dragFrom,
  pickerOpen,
  portDot,
  shot,
} from './block_journey_helpers.mjs'

const DICT = '{"quat": True, "units": "m", "frame_id": "base_link"}'
const ESTIMATE = 'shape:estimate'
const ENCODE = 'shape:encode'

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

const port = (id, name, type, extra = {}) => ({ id, name, type, visible: true, ...extra })

/** Every Block on the page, as the facts the checks read. */
const blocks = (page) => evaluate(page, `JSON.stringify(
  window.__systemsketch.editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'block')
    .map((shape) => ({
      id: shape.id, view: shape.props.view, title: shape.props.title,
      w: shape.props.w, h: shape.props.h,
      inputs: shape.props.inputs, outputs: shape.props.outputs,
    })))`).then(JSON.parse)

/** What the capsule paints, span by span: "= 2.0" or "gain = 2.0". */
const valueText = (page, id) => evaluate(page, `(() => {
  const root = document.querySelector('[data-shape-id="${id}"] [data-testid="block-value"]')
  if (!root) return null
  return Array.from(root.children).map((node) => node.textContent.trim()).join(' ')
})()`)

const valueTooltip = (page, id) => evaluate(page,
  `document.querySelector('[data-shape-id="${id}"] [data-testid="block-value"]')?.getAttribute('title') ?? null`)

const hasClass = (page, selector, className) => evaluate(page,
  `Boolean(document.querySelector(${JSON.stringify(selector)})?.classList.contains(${JSON.stringify(className)}))`)

/** Each cable's two bindings: which shape, which port, which terminal. */
const cableBindings = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  return editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'connection')
    .map((cable) => editor.getBindingsFromShape(cable.id, 'connection')
      .map((binding) => ({ terminal: binding.props.terminal, to: binding.toId, port: binding.props.portId }))
      .sort((a, b) => a.terminal.localeCompare(b.terminal)))
})())`).then(JSON.parse)

async function seedConsumers(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    const views = (w, h) => ({ simple: { w: 320, h: 206 }, port: { w, h }, expanded: { w, h }, value: { w: 168, h: 56 } })
    const call = (id, x, y, title, inputs, outputs) => ({
      id, type: 'block', x, y,
      props: {
        title, blockType: 'call', description: '', view: 'port', w: 300, h: 180,
        views: views(300, 180), showDescription: false, portLayout: 'inline', inputs, outputs,
      },
    })
    editor.createShapes([
      call(${JSON.stringify(ESTIMATE)}, 120, 80, 'estimate()',
        [${JSON.stringify(port('in_1', 'frame', 'Frame'))}, ${JSON.stringify(port('in_2', 'gain', 'float', { defaultValue: '1.0' }))}],
        [${JSON.stringify(port('out_1', 'pose', 'Pose'))}]),
      call(${JSON.stringify(ENCODE)}, 620, 80, 'encode()',
        [${JSON.stringify(port('in_1', 'pose', 'Pose'))}, ${JSON.stringify(port('in_2', 'opts', 'dict', { defaultValue: 'None' }))}],
        [${JSON.stringify(port('out_1', 'payload', 'bytes'))}]),
    ])
    editor.selectNone()
    editor.setCamera({ x: 40, y: 40, z: 1 })
  })()`)
  await delay(400)
}

/** Press P, click a spot, type the literal, Enter. Returns the pill made. */
async function drawPill(page, at, literal) {
  const before = new Set((await blocks(page)).map((block) => block.id))
  await key(page, 'p', 'KeyP')
  await delay(120)
  const tool = await evaluate(page, `window.__systemsketch.editor.getCurrentToolId()`)
  await clickAt(page, at.x, at.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'literal editor')
  await page.send('Input.insertText', { text: literal })
  await key(page, 'Enter', 'Enter')
  await delay(320)
  const pill = (await blocks(page)).find((block) => !before.has(block.id)) ?? null
  return { tool, pill }
}

async function main() {
  const app = await startApp({ label: 'literal-pill', width: 1440, height: 960 })
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'dev seam')
    await seedConsumers(page)
    await deselect(page, { x: 1000, y: 800 })

    // ---- P draws a capsule and the literal types straight in --------------
    const first = await drawPill(page, { x: 300, y: 520 }, '2.0')
    check('TOOL-1', 'P selects the pill tool', first.tool, 'pill')
    const pill = first.pill
    check('PILL-1', 'a click with the pill tool makes a Block in the value view', pill?.view ?? null, 'value')
    check('PILL-2', 'the literal is the title; one unnamed inlet and outlet, typed from the literal',
      pill ? { title: pill.title, name: pill.outputs[0]?.name, type: pill.outputs[0]?.type, inputs: pill.inputs.length, outputs: pill.outputs.length, inletType: pill.inputs[0]?.type } : null,
      { title: '2.0', name: '', type: 'float', inputs: 1, outputs: 1, inletType: 'float' })
    check('PILL-3', 'the capsule is one line tall and as wide as its text',
      pill ? { h: pill.h, fitted: pill.w >= 96 && pill.w < 200 } : null, { h: 56, fitted: true })
    check('PILL-4', 'the face reads "= 2.0"', await valueText(page, pill.id), '= 2.0')
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-typed.png')

    // ---- the outlet wires into gain and dims its definition default --------
    const gainSelector = portDot(ESTIMATE, 'input', 'in_2')
    const gainDot = await box(page, gainSelector)
    const outlet = await box(page, portDot(pill.id, 'output', 'out_1'))
    const drop = await dragFrom(page, outlet, gainDot, { shotName: 'literal-pill-wire-drag.png' })
    check('WIRE-1', 'the outlet lands on gain', drop.count, 1)
    check('WIRE-2', 'gain paints wired', await hasClass(page, gainSelector, 'Port_connected'), true)
    check('WIRE-3', 'the grey definition-default chip dims once a cable overrides it',
      await hasClass(page, `[data-shape-id="${ESTIMATE}"] .BlockNode-portDefault`, 'BlockNode-portDefault--overridden'), true)
    check('WIRE-4', 'the pill is the source of the cable, judged at the landing',
      (await cableBindings(page))[0],
      [{ terminal: 'end', to: ESTIMATE, port: 'in_2' }, { terminal: 'start', to: pill.id, port: 'out_1' }])
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-wired.png')

    // ---- a click on `=` names it; the name is the outlet's name ------------
    const face = await box(page, `[data-shape-id="${pill.id}"] [data-testid="block-value-text"]`)
    await clickAt(page, face.cx, face.cy)
    await delay(260)
    const equals = await box(page, `[data-shape-id="${pill.id}"] .BlockNode-valueEquals`)
    await clickAt(page, equals.cx, equals.cy)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-name-outputs-out_1"]')`, 'name editor')
    await page.send('Input.insertText', { text: 'gain' })
    await key(page, 'Enter', 'Enter')
    await delay(320)
    const named = (await blocks(page)).find((block) => block.id === pill.id)
    check('NAME-1', 'the typed name is the outlet name', named.outputs[0].name, 'gain')
    check('NAME-2', 'the face reads "gain = 2.0"', await valueText(page, pill.id), 'gain = 2.0')
    check('NAME-3', 'the capsule grew to fit the name', named.w > pill.w, true)
    check('NAME-4', 'the cable survived the rename', await cables(page), 1)
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-named.png')

    // ---- a long literal folds ----------------------------------------------
    const long = (await drawPill(page, { x: 760, y: 520 }, DICT)).pill
    check('LONG-1', 'a long literal folds to "= …"', long ? await valueText(page, long.id) : null, '= …')
    check('LONG-2', 'the full literal rides the tooltip', long ? await valueTooltip(page, long.id) : null, DICT)
    check('LONG-3', 'its outlet is typed dict', long?.outputs[0]?.type ?? null, 'dict')
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-folded.png')

    // ---- an input dropped on nothing can pick Value ---------------------------
    const optsDot = await box(page, portDot(ENCODE, 'input', 'in_2'))
    const asked = await dragFrom(page, optsDot, { x: optsDot.cx - 200, y: optsDot.cy + 210 },
      { shotName: 'literal-pill-picker-drag.png' })
    check('PICK-1', 'an input dropped on nothing asks what should feed it', asked.offered, true)
    await waitFor(page, `document.querySelector('[data-testid="block-picker-value"]')`, 'Value in the offer')
    await shot(page, 'literal-pill-picker-open.png')
    const item = await box(page, '[data-testid="block-picker-value"]')
    await clickAt(page, item.cx, item.cy)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'picked literal editor')
    await page.send('Input.insertText', { text: '{}' })
    await key(page, 'Enter', 'Enter')
    await delay(320)
    const picked = (await blocks(page)).find((block) => block.view === 'value' && block.title === '{}') ?? null
    check('PICK-2', 'Value makes a capsule wired into opts',
      { view: picked?.view ?? null, cables: await cables(page), offered: await pickerOpen(page) },
      { view: 'value', cables: 2, offered: false })
    check('PICK-3', 'the picked capsule feeds opts from its outlet',
      picked ? (await cableBindings(page)).some((bindings) => JSON.stringify(bindings) === JSON.stringify(
        [{ terminal: 'end', to: ENCODE, port: 'in_2' }, { terminal: 'start', to: picked.id, port: 'out_1' }])) : false,
      true)
    check('PICK-4', 'its type follows the literal', picked?.outputs[0]?.type ?? null, 'dict')
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-picked.png')

    // ---- a pill can be fed: a variable holding a call's result ---------------
    const result = (await drawPill(page, { x: 1060, y: 520 }, '')).pill
    const poseOut = await box(page, portDot(ESTIMATE, 'output', 'out_1'))
    const resultIn = await box(page, portDot(result.id, 'input', 'in_1'))
    const fedDrop = await dragFrom(page, poseOut, resultIn)
    check('FEED-1', "estimate's pose lands on the pill's inlet", fedDrop.count, 3)
    check('FEED-2', 'a fed pill shows ⋯ where its literal would be',
      await evaluate(page, `document.querySelector('[data-shape-id="${result.id}"] [data-testid="block-value-fed"]')?.textContent ?? null`), '⋯')
    await deselect(page, { x: 1000, y: 800 })
    const resultFace = await box(page, `[data-shape-id="${result.id}"] .BlockNode-valueEquals`)
    await clickAt(page, resultFace.cx, resultFace.cy)
    await delay(300)
    await waitFor(page, `document.querySelector('[data-inspector-section="Pill"] input[aria-label="Variable name"]')`, 'Pill name field')
    const nameField = await box(page, '[data-inspector-section="Pill"] input[aria-label="Variable name"]')
    await clickAt(page, nameField.cx, nameField.cy)
    await page.send('Input.insertText', { text: 'pose' })
    await key(page, 'Enter', 'Enter')
    await delay(300)
    const named2 = (await blocks(page)).find((block) => block.id === result.id)
    check('FEED-3', 'naming through the inspector names both rims',
      { inlet: named2.inputs[0].name, outlet: named2.outputs[0].name, face: await valueText(page, result.id) },
      { inlet: 'pose', outlet: 'pose', face: 'pose = ⋯' })
    check('FEED-4', 'the inspector says what feeds the pill',
      (await evaluate(page, `document.querySelector('[data-testid="pill-wiring"]')?.textContent ?? ''`)).includes('Fed by estimate() · pose'), true)
    check('FEED-5', 'the Value field is read-only while a cable feeds the pill',
      await evaluate(page, `document.querySelector('[data-inspector-section="Pill"] input[aria-label="Literal value"]')?.disabled ?? null`), true)
    check('FEED-6', "a fed pill with no type of its own takes the cable's, in the panel and in the record",
      {
        field: await evaluate(page, `document.querySelector('[data-inspector-section="Pill"] input[aria-label="Variable type"]')?.value ?? null`),
        record: { inlet: named2.inputs[0].type, outlet: named2.outputs[0].type },
      },
      { field: 'Pose', record: { inlet: 'Pose', outlet: 'Pose' } })
    await shot(page, 'literal-pill-fed-inspector.png')
    await deselect(page, { x: 1000, y: 800 })
    const resultOut = await box(page, portDot(result.id, 'output', 'out_1'))
    const encodePose = await box(page, portDot(ENCODE, 'input', 'in_1'))
    const onward = await dragFrom(page, resultOut, encodePose)
    check('FEED-7', 'the same pill feeds encode: one variable, written and read', onward.count, 4)
    await deselect(page, { x: 1000, y: 800 })
    await shot(page, 'literal-pill-fed.png')

    // ---- the value view is one of the Block's views in the inspector ---------
    await clickAt(page, face.cx, face.cy)
    await delay(300)
    check('VIEW-1', 'the inspector offers value beside simple, port and expanded',
      await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-inspector-section="View"] button')).map((node) => node.textContent.trim()))`),
      JSON.stringify(['simple', 'port', 'expanded', 'value']))
    check('VIEW-2', 'the inspector shows a Pill section in place of the Block sections',
      await evaluate(page, `JSON.stringify(['Pill', 'Block', 'Tags', 'Inputs', 'Outputs', 'Ports'].map((name) => Boolean(document.querySelector('[data-inspector-section="' + name + '"]'))))`),
      JSON.stringify([true, false, false, false, false, false]))
    check('VIEW-3', 'the Pill section reads the literal as the value and the ports\' name as the name',
      await evaluate(page, `JSON.stringify([
        document.querySelector('[data-inspector-section="Pill"] input[aria-label="Variable name"]')?.value,
        document.querySelector('[data-inspector-section="Pill"] input[aria-label="Literal value"]')?.value,
        document.querySelector('[data-inspector-section="Pill"] input[aria-label="Variable type"]')?.value,
      ])`),
      JSON.stringify(['gain', '2.0', 'float']))
    await shot(page, 'literal-pill-inspector.png')
    await deselect(page, { x: 1000, y: 800 })

    check('CLEAN-DEV', 'the Block Dev journey raised no local console errors', localConsoleErrors(page), [])

    // ---- the product composition: the Pill slot beside Block, and P ----------
    await openApp(page, app.port, '')
    await waitFor(page, `document.querySelector('.tl-container')`, 'product canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'product seam')
    await delay(600)
    check('PROD-1', 'the product toolbar has a Pill slot beside Block',
      await evaluate(page, `JSON.stringify([
        Boolean(document.querySelector('[data-testid="systemsketch-tool-block"]')),
        Boolean(document.querySelector('[data-testid="systemsketch-tool-pill"]')),
      ])`),
      JSON.stringify([true, true]))
    await deselect(page, { x: 700, y: 700 })
    const product = await drawPill(page, { x: 700, y: 480 }, '1')
    check('PROD-2', 'P draws a pill in the product too', { tool: product.tool, view: product.pill?.view ?? null, type: product.pill?.outputs[0]?.type ?? null },
      { tool: 'pill', view: 'value', type: 'int' })
    check('PROD-3', 'the toolbar shows the Pill slot active while drawing',
      await evaluate(page, `document.querySelector('[data-testid="systemsketch-tool-pill"]')?.getAttribute('aria-pressed')`), 'false')
    await deselect(page, { x: 700, y: 700 })
    await shot(page, 'literal-pill-product.png')
    check('CLEAN-PROD', 'the product journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'literal-pill.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
