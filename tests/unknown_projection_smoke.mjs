/**
 * `?` and the projection Block, driven in a real browser.
 *
 *   Mark unresolved says it once on the type line, sets every slot to `?`, and
 *   drops the Block to Simple view — and Port view still shows the `?` rows,
 *   painted so they cannot be mistaken for a resolved name or type. Nothing is
 *   inferred from the cables that land on it.
 *
 *   A cable dropped on empty canvas offers Split; the projection that lands
 *   takes the cable's type as its title and inlet, and its rows are accessors:
 *   typed without a dot they gain one, and a chain stays a single row.
 *
 * Runs in the Block Dev composition on a scratch board. The seam is used only
 * to seed the two Blocks; every claim is read back from the painted DOM or the
 * editor's own record.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  SHOTS,
  box,
  deselect,
  dragFrom,
  portDot,
  shot,
} from './block_journey_helpers.mjs'

const ENCODE = 'shape:encode'
const SEND = 'shape:send'
const RECORD = 'shape:record'

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

const port = (id, name, type) => ({ id, name, type, visible: true })

const blocks = (page) => evaluate(page, `JSON.stringify(
  window.__systemsketch.editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'block')
    .map((shape) => ({
      id: shape.id, view: shape.props.view, title: shape.props.title,
      blockType: shape.props.blockType,
      inputs: shape.props.inputs, outputs: shape.props.outputs,
    })))`).then(JSON.parse)

const blockById = async (page, id) => (await blocks(page)).find((block) => block.id === id) ?? null

/** Every painted port row on one Block, as text plus the classes that style it. */
const rows = (page, id) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll('[data-shape-id="${id}"] .BlockNode-portLabel'))
    .map((row) => ({
      text: Array.from(row.children).map((node) => node.textContent.trim()).filter(Boolean).join(' '),
      unknown: Boolean(row.querySelector('.BlockNode-portName--unknown, .BlockNode-portType--unknown')),
      accessor: Boolean(row.querySelector('.BlockNode-portName--accessor')),
    })))`).then(JSON.parse)

async function rightClick(page, selector) {
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.block-view-button"]')`,
    'the Block context menu')
}

async function menuItem(page, id) {
  const selector = `[data-testid="context-menu.${id}"]`
  await waitFor(page, `document.querySelector('${selector}')`, id)
  await clickElement(page, selector)
  await delay(360)
}

/** Open a submenu by id, then click one item inside it. */
async function submenuItem(page, submenuId, id) {
  const trigger = `[data-testid="context-menu-sub.${submenuId}-button"]`
  await waitFor(page, `document.querySelector('${trigger}')`, `${submenuId} trigger`)
  await clickElement(page, trigger)
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.${submenuId}-content"]')`,
    `${submenuId} submenu`)
  await delay(200)
  await menuItem(page, id)
}

async function openSubmenu(page, id) {
  const trigger = `[data-testid="context-menu-sub.${id}-button"]`
  await waitFor(page, `document.querySelector('${trigger}')`, `${id} trigger`)
  await clickElement(page, trigger)
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.${id}-content"]')`,
    `${id} submenu`)
}

/** A view row is a checkbox item, so it is found by its label inside the submenu. */
async function clickMenuCheckbox(page, submenuId, label) {
  const value = await evaluate(page, `(() => {
    const content = document.querySelector('[data-testid="context-menu-sub.${submenuId}-content"]')
    const row = Array.from(content?.querySelectorAll('[role="menuitemcheckbox"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)})
    if (!row) return null
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  })()`)
  if (!value) throw new Error(`Missing ${label} in ${submenuId}`)
  const point = JSON.parse(value)
  await clickAt(page, point.x, point.y)
}

async function seed(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    const views = (w, h) => ({ simple: { w: 320, h: 206 }, port: { w, h }, expanded: { w, h }, value: { w: 168, h: 56 } })
    const call = (id, x, y, title, inputs, outputs) => ({
      id, type: 'block', x, y,
      props: {
        title, blockType: 'call', description: '', view: 'port', w: 320, h: 190,
        views: views(320, 190), showDescription: false, portLayout: 'inline', inputs, outputs,
      },
    })
    editor.createShapes([
      call(${JSON.stringify(ENCODE)}, 120, 120, 'encode()',
        [${JSON.stringify(port('in_1', 'pose', 'Pose'))}],
        [${JSON.stringify(port('out_1', 'payload', 'bytes'))}]),
      call(${JSON.stringify(SEND)}, 620, 120, 'client.send()',
        [${JSON.stringify(port('in_1', 'self', 'Client'))}, ${JSON.stringify(port('in_2', '', ''))}],
        [${JSON.stringify(port('out_1', '', ''))}]),
      call(${JSON.stringify(RECORD)}, 120, 430, 'to_object_spec()', [],
        [${JSON.stringify(port('out_1', 'self', 'ObjectRecord'))}]),
    ])
    editor.selectNone()
    editor.setCamera({ x: 40, y: 40, z: 1 })
  })()`)
  await delay(400)
}

async function main() {
  const app = await startApp({ label: 'unknown-projection', width: 1440, height: 960 })
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'dev seam')
    await seed(page)
    await deselect(page, { x: 1100, y: 820 })

    // ---- wire encode() into client.send(), so a type IS available to infer ----
    const payloadOut = await box(page, portDot(ENCODE, 'output', 'out_1'))
    const payloadIn = await box(page, portDot(SEND, 'input', 'in_2'))
    const wired = await dragFrom(page, payloadOut, payloadIn)
    check('SEED-1', 'encode() feeds client.send()', wired.count, 1)
    await deselect(page, { x: 1100, y: 820 })
    await shot(page, 'unknown-projection-seeded.png')

    // ---- Mark unresolved -----------------------------------------------------
    const sendTitle = await box(page, `[data-shape-id="${SEND}"]`)
    await clickAt(page, sendTitle.cx, sendTitle.y + 20)
    await delay(220)
    await rightClick(page, `[data-shape-id="${SEND}"]`)
    await menuItem(page, 'block-mark-unresolved')
    const marked = await blockById(page, SEND)
    check('MARK-1', 'the type line carries the opacity once, for the whole call',
      marked?.blockType ?? null, 'unresolved')
    check('MARK-2', 'a signature that cannot be stated is not drawn as a table',
      marked?.view ?? null, 'simple')
    check('MARK-3', 'a slot the call site proves is left alone; only what has nothing to say is marked',
      marked ? [...marked.inputs, ...marked.outputs].map((slot) => `${slot.name}|${slot.type}`) : null,
      ['self|Client', '|?', '|?'])
    check('MARK-4', 'the title still names the callee',
      marked?.title ?? null, 'client.send()')
    check('MARK-5', 'nothing is inferred from the cable that lands on it',
      JSON.stringify(marked?.inputs ?? []).includes('bytes'), false)
    check('MARK-6', 'the cable survives — the ports kept their identities',
      await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'connection').length`), 1)

    // ---- one mark is one undo step ------------------------------------------
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(420)
    const restored = await blockById(page, SEND)
    check('UNDO-1', 'one mark is one undo step, and it restores the whole signature',
      restored ? { blockType: restored.blockType, view: restored.view, first: `${restored.inputs[0].name}:${restored.inputs[0].type}` } : null,
      { blockType: 'call', view: 'port', first: 'self:Client' })

    // ---- and one port can be marked explicitly, by decision -----------------
    await rightClick(page, portDot(SEND, 'input', 'in_1'))
    await menuItem(page, 'block-port-unknown')
    const byHand = await blockById(page, SEND)
    check('PORT-MARK', 'a row that DOES state a type goes unknown only when someone says so — and keeps its name',
      byHand ? `${byHand.inputs[0].name}|${byHand.inputs[0].type}` : null, 'self|?')
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(400)
    check('PORT-MARK-2', 'and that is its own undo step',
      (await blockById(page, SEND))?.inputs[0]?.type ?? null, 'Client')

    // put the mark back, so Port view has `?` rows to show
    await rightClick(page, `[data-shape-id="${SEND}"]`)
    await menuItem(page, 'block-mark-unresolved')
    await deselect(page, { x: 1100, y: 820 })
    await shot(page, 'unknown-projection-marked-simple.png')

    // ---- Port view still shows the rows, and `?` reads as an absence ---------
    await clickAt(page, sendTitle.cx, sendTitle.y + 20)
    await delay(220)
    await rightClick(page, `[data-shape-id="${SEND}"]`)
    await openSubmenu(page, 'block-view')
    await clickMenuCheckbox(page, 'block-view', 'Port')
    await delay(400)
    const painted = await rows(page, SEND)
    check('PORT-1', 'the known row survives, and each unknown row carries exactly one `?`',
      painted.map((row) => row.text), ['self Client', '?', '?'])
    check('PORT-2', 'the `?` rows are painted as absences; the known row is not',
      painted.map((row) => row.unknown), [false, true, true])
    check('PORT-3', 'the generated default puts one `?` per row',
      painted.filter((row) => row.text.split('?').length > 2), [])
    const resolvedRow = await rows(page, ENCODE)
    check('PORT-4', 'a fully resolved Block paints no unknown mark at all',
      resolvedRow.some((row) => row.unknown), false)
    await deselect(page, { x: 1100, y: 820 })
    await shot(page, 'unknown-projection-marked-port.png')

    // ---- a cable dropped on nothing offers Unbundle -------------------------
    const recordOut = await box(page, portDot(RECORD, 'output', 'out_1'))
    const asked = await dragFrom(page, recordOut,
      { x: recordOut.cx + 420, y: recordOut.cy + 60 },
      { shotName: 'unknown-projection-picker-drag.png' })
    check('PICK-1', 'a cable dropped on nothing asks what should take it', asked.offered, true)
    await waitFor(page, `document.querySelector('[data-testid="block-picker-projection"]')`,
      'Unbundle in Quick insert')
    await shot(page, 'unknown-projection-picker-open.png')
    const unbundle = await box(page, '[data-testid="block-picker-projection"]')
    await clickAt(page, unbundle.cx, unbundle.cy)
    await delay(700)
    check('PICK-1B', 'a self-titled projection asks for the MEMBER, not for a name',
      await evaluate(page, `Boolean(document.querySelector('[data-testid^="block-inline-port-name-outputs-"]'))`),
      true)
    await key(page, 'Escape', 'Escape')
    await delay(300)
    const projection = (await blocks(page)).find((block) => block.blockType === 'unbundle') ?? null
    check('PICK-2', 'Unbundle makes a canonical projection, titled by the type that arrived',
      projection ? { blockType: projection.blockType, title: projection.title } : null,
      { blockType: 'unbundle', title: 'ObjectRecord' })
    check('PICK-3', 'the inlet is the type itself and carries no variable name',
      projection ? { name: projection.inputs[0].name, type: projection.inputs[0].type } : null,
      { name: '', type: 'ObjectRecord' })
    check('PICK-4', 'its first row is an accessor, and carries no `?` — a member is assumed to decompose',
      projection ? { name: projection.outputs[0].name, type: projection.outputs[0].type } : null,
      { name: '.', type: '' })
    await deselect(page, { x: 1100, y: 820 })
    await shot(page, 'unknown-projection-split.png')

    // ---- accessor rows: typed members gain their dot, chains stay one row ----
    const addAccessor = async (portId, text) => {
      const projBox = await box(page, `[data-shape-id="${projection.id}"]`)
      await clickAt(page, projBox.cx, projBox.y + 20)
      await delay(220)
      await rightClick(page, `[data-shape-id="${projection.id}"]`)
      await submenuItem(page, 'block-add', 'block-add-accessor')
      await waitFor(page,
        `document.querySelector('[data-testid="block-inline-port-name-outputs-${portId}"]')`,
        `${portId} accessor editor`)
      await page.send('Input.insertText', { text })
      await key(page, 'Enter', 'Enter')
      await delay(400)
      await deselect(page, { x: 1100, y: 820 })
    }

    await addAccessor('out_2', 'object_id')
    const named = await blockById(page, projection.id)
    check('ACC-1', 'Add → Accessor is offered on a projection and starts an editable row',
      named?.outputs.length ?? 0, 2)
    check('ACC-2', 'a member typed without a dot gains one',
      named?.outputs[1]?.name ?? null, '.object_id')
    check('ACC-3', 'a fresh accessor carries no `?`: nothing here was looked at and missed',
      named?.outputs[1]?.type ?? null, '')

    await addAccessor('out_3', 'pose.translation.x')
    const chained = await blockById(page, projection.id)
    check('ACC-4', 'a nested member stays ONE row: `.var.foo.bar`, not a Block per link',
      chained?.outputs[2]?.name ?? null, '.pose.translation.x')

    const accessorRows = await rows(page, projection.id)
    check('ACC-5', 'the rows read as accessors, with no variable name and no `?`',
      accessorRows.filter((row) => row.accessor).map((row) => row.text),
      ['.object_id', '.pose.translation.x'])
    check('ACC-6', 'no accessor is marked unknown — the projection is assumed to decompose',
      accessorRows.some((row) => row.unknown), false)
    await shot(page, 'unknown-projection-accessors.png')

    // ---- the canvas does not police where a `?` goes -------------------------
    await clickAt(page, sendTitle.cx, sendTitle.y + 20)
    await delay(200)
    const selfName = await box(page,
      `[data-shape-id="${SEND}"] .BlockNode-portLabel--in .BlockNode-portName`)
    await clickAt(page, selfName.cx, selfName.cy)
    await waitFor(page,
      `document.querySelector('[data-testid="block-inline-port-name-inputs-in_1"]')`,
      'self name editor')
    await evaluate(page, `(() => {
      const field = document.querySelector('[data-testid="block-inline-port-name-inputs-in_1"]')
      if (field) { field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })) }
    })()`)
    await page.send('Input.insertText', { text: '?' })
    await key(page, 'Enter', 'Enter')
    await delay(400)
    const hacked = await blockById(page, SEND)
    check('HACK-1', 'a `?` typed into a NAME is kept — one per row is a convention, not a rule',
      hacked ? `${hacked.inputs[0].name}|${hacked.inputs[0].type}` : null, '?|Client')
    await deselect(page, { x: 1100, y: 820 })
    check('HACK-2', 'and it paints as an absence there too',
      (await rows(page, SEND))[0]?.unknown ?? null, true)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(400)

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'unknown-projection.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
