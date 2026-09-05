/**
 * Real pointer acceptance for quick dataflow insertion. The dev seam only
 * seeds ordinary Blocks; every offered stock Block comes from a physical port
 * drag and picker click.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt, clickElement, delay, evaluate, key, localConsoleErrors, openApp, shortcut,
  startApp, waitFor,
} from './browser_harness.mjs'
import { SHOTS, box, dragFrom, portDot, shot } from './block_journey_helpers.mjs'

const SOURCE = 'shape:quick-source'
const SINK = 'shape:quick-sink'
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
  if (!ok) process.stdout.write(`        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`)
  return ok
}

const shapes = (page) => evaluate(page, `JSON.stringify(
  window.__systemsketch.editor.getCurrentPageShapes().map((shape) => ({
    id: shape.id, type: shape.type, props: shape.props,
  })).sort((a, b) => a.id.localeCompare(b.id)))`).then(JSON.parse)
const ids = async (page) => (await shapes(page)).map((shape) => shape.id)
const recordIds = (page) => evaluate(page, `JSON.stringify(window.__systemsketch.editor.store.allRecords()
  .filter((record) => record.typeName === 'shape' || record.typeName === 'binding')
  .map((record) => record.id).sort())`).then(JSON.parse)
const blocks = async (page) => (await shapes(page)).filter((shape) => shape.type === 'block')
const connections = async (page) => (await shapes(page)).filter((shape) => shape.type === 'connection')

async function seed(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    const views = { simple: { w: 320, h: 206 }, port: { w: 320, h: 190 }, expanded: { w: 320, h: 190 }, value: { w: 168, h: 56 } }
    const port = (id, name, type) => ({ id, name, type, visible: true })
    const call = (id, x, y, title, inputs, outputs) => ({
      id, type: 'block', x, y,
      props: { title, blockType: 'call', description: '', view: 'port', w: 320, h: 190,
        views, showDescription: false, portLayout: 'inline', inputs, outputs },
    })
    editor.createShapes([
      call(${JSON.stringify(SOURCE)}, 170, 180, 'make_record()', [], [port('out', 'record', 'ObjectRecord')]),
      call(${JSON.stringify(SINK)}, 970, 180, 'consume()', [port('in', 'record', 'ObjectRecord')], []),
    ])
    editor.selectNone(); editor.setCamera({ x: 30, y: 30, z: 1 })
  })()`)
  await delay(350)
}

async function offer(page, from, point) {
  const drag = await dragFrom(page, from, point)
  check(`OFFER-${results.length}`, 'the loose terminal opens the on-canvas picker', drag.offered, true)
}

async function choose(page, testId) {
  await waitFor(page, `document.querySelector('[data-testid="${testId}"]')`, testId)
  const choice = await box(page, `[data-testid="${testId}"]`)
  await clickAt(page, choice.cx, choice.cy)
  await delay(320)
}

async function bindingFacts(page, expectedSourceId, expectedSourcePort, expectedSinkId, expectedSinkPort) {
  return evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const connection = editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
    if (!connection) return null
    const bindings = editor.getBindingsFromShape(connection, 'connection')
    const byTerminal = Object.fromEntries(bindings.map((binding) => [binding.props.terminal, binding]))
    const source = byTerminal.start
    const sink = byTerminal.end
    return {
      count: bindings.length,
      source: source?.toId,
      sourcePort: source?.props.portId,
      sink: sink?.toId,
      sinkPort: sink?.props.portId,
      normalized: source?.toId === ${JSON.stringify(expectedSourceId)}
        && source?.props.portId === ${JSON.stringify(expectedSourcePort)}
        && sink?.toId === ${JSON.stringify(expectedSinkId)}
        && sink?.props.portId === ${JSON.stringify(expectedSinkPort)},
    }
  })())`).then(JSON.parse)
}

async function main() {
  const app = await startApp({ label: 'bundle-unbundle-copy-quick-insert', width: 1440, height: 940 })
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page, `document.querySelector('[data-development-profile="block-dev"] .tl-container')`, 'Block Dev canvas')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor')
    await seed(page)

    const sourceOut = await box(page, portDot(SOURCE, 'output', 'out'))
    const initialRecordIds = await recordIds(page)
    await offer(page, sourceOut, { x: sourceOut.cx + 410, y: sourceOut.cy + 40 })
    const quickRows = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(
      document.querySelectorAll('.OnCanvasBlockPicker-item')).slice(0, 3).map((node) => node.textContent.replace(/\\s+/g, ' ').trim()))`))
    check('QUICK-GROUP', 'Quick insert visibly leads with Bundle, Unbundle, Copy', quickRows,
      ['Bundle2 in · 1 out', 'Unbundle1 in · 1 out', 'Copy1 in · 1 out'])
    const initialPicker = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const node = document.querySelector('[data-testid="block-picker"]')
      const rect = node.getBoundingClientRect()
      const viewport = window.__systemsketch.editor.getViewportScreenBounds()
      return {
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom) },
        viewport: { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h },
        within: rect.left >= viewport.x - 1 && rect.top >= viewport.y - 1
          && rect.right <= viewport.x + viewport.w + 1 && rect.bottom <= viewport.y + viewport.h + 1,
        focused: document.activeElement?.dataset?.testid ?? null,
      }
    })())`))
    check('PICKER-VIEWPORT', 'the first offer is visible and focuses Bundle',
      { within: initialPicker.within, focused: initialPicker.focused }, { within: true, focused: 'block-picker-bundle' })
    if (!initialPicker.within) process.stdout.write(`        geometry=${JSON.stringify(initialPicker)}\n`)
    if (process.env.CAPTURE_QUICK_INSERT_SCREENSHOTS) {
      await shot(page, 'bundle-unbundle-copy-quick-insert-picker.png')
    }
    await choose(page, 'block-picker-bundle')
    const bundle = (await blocks(page)).find((shape) => shape.props.blockType === 'bundle')
    check('BUNDLE-PICK', 'a real click creates the canonical retained-record Block',
      bundle ? { title: bundle.props.title, inputs: bundle.props.inputs.map((port) => port.id), output: bundle.props.outputs[0]?.id } : null,
      { title: 'Bundle', inputs: ['record', 'member_1'], output: 'record_out' })
    check('BUNDLE-BINDINGS', 'forward insertion has two bindings and normalized source→sink terminals',
      await bindingFacts(page, SOURCE, 'out', bundle?.id, 'record'),
      { count: 2, source: SOURCE, sourcePort: 'out', sink: bundle?.id, sinkPort: 'record', normalized: true })
    await waitFor(page, `document.querySelector('[data-testid="bundle-add-member"]')`, 'Bundle member action')
    const addMember = await box(page, '[data-testid="bundle-add-member"]')
    await clickAt(page, addMember.cx, addMember.cy); await delay(220)
    const grownBundle = (await blocks(page)).find((shape) => shape.id === bundle?.id)
    check('BUNDLE-MEMBER', 'the inspector adds a distinct next .field update row',
      grownBundle?.props.inputs.filter((port) => port.id.startsWith('member_')).map((port) => ({ id: port.id, name: port.name, row: port.row ?? 1 })),
      [{ id: 'member_1', name: '.field', row: 1 }, { id: 'member_2', name: '.field', row: 2 }])
    await shortcut(page, 'z', 'KeyZ', 2); await delay(260)
    const restoredBundle = (await blocks(page)).find((shape) => shape.id === bundle?.id)
    check('BUNDLE-MEMBER-UNDO', 'one Ctrl+Z removes only the added member row',
      restoredBundle?.props.inputs.map((port) => port.id), ['record', 'member_1'])
    await waitFor(page, `document.querySelector('[data-testid="block-port-add-inputs"]')`, 'Bundle canvas member bead')
    const memberBead = await box(page, '[data-testid="block-port-add-inputs"]')
    await clickAt(page, memberBead.cx, memberBead.cy)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-name-inputs-member_2"]')`, 'Bundle member inline editor')
    await key(page, 'Escape', 'Escape'); await delay(160)
    const canvasGrownBundle = (await blocks(page)).find((shape) => shape.id === bundle?.id)
    check('BUNDLE-CANVAS-MEMBER', 'the canvas add bead uses the same member_N/.field grammar',
      canvasGrownBundle?.props.inputs.at(-1),
      { id: 'member_2', name: '.field', type: '', visible: true, row: 2 })
    await shortcut(page, 'z', 'KeyZ', 2); await delay(220)
    check('BUNDLE-CANVAS-MEMBER-UNDO', 'the canvas member action is one undo step',
      (await blocks(page)).find((shape) => shape.id === bundle?.id)?.props.inputs.map((port) => port.id),
      ['record', 'member_1'])
    const bundleRect = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const rect = document.querySelector('[data-shape-id="${bundle?.id}"]').getBoundingClientRect()
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    })())`))
    await clickAt(page, bundleRect.x + bundleRect.w / 2, bundleRect.y + 28, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu-sub.block-add-button"]')`, 'Bundle context menu')
    await clickElement(page, '[data-testid="context-menu-sub.block-add-button"]')
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-add-bundle-member"]')`, 'Bundle context member action')
    check('BUNDLE-CONTEXT-LABEL', 'the Add menu names a Bundle member instead of a generic input',
      {
        member: await evaluate(page, `document.querySelector('[data-testid="context-menu.block-add-bundle-member"]')?.textContent?.trim()`),
        genericInput: await evaluate(page, `Boolean(document.querySelector('[data-testid="context-menu.block-add-input-port"]'))`),
      },
      { member: 'Bundle member update', genericInput: false })
    await clickElement(page, '[data-testid="context-menu.block-add-bundle-member"]')
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-name-inputs-member_2"]')`, 'context-created Bundle member')
    await key(page, 'Escape', 'Escape'); await delay(160)
    check('BUNDLE-CONTEXT-MEMBER', 'the context action uses the same member_N/.field grammar',
      (await blocks(page)).find((shape) => shape.id === bundle?.id)?.props.inputs.at(-1),
      { id: 'member_2', name: '.field', type: '', visible: true, row: 2 })
    await shortcut(page, 'z', 'KeyZ', 2); await delay(220)
    check('BUNDLE-CONTEXT-MEMBER-UNDO', 'the context member action is one undo step',
      (await blocks(page)).find((shape) => shape.id === bundle?.id)?.props.inputs.map((port) => port.id),
      ['record', 'member_1'])
    await shortcut(page, 'z', 'KeyZ', 2); await delay(260)
    check('ONE-UNDO', 'the insertion itself remains one Ctrl+Z after separate member edits',
      await recordIds(page), initialRecordIds)

    const copyBefore = await recordIds(page)
    const copyOut = await box(page, portDot(SOURCE, 'output', 'out'))
    await offer(page, copyOut, { x: copyOut.cx + 410, y: copyOut.cy + 45 })
    await choose(page, 'block-picker-copy')
    const copy = (await blocks(page)).find((shape) => shape.props.blockType === 'copy')
    check('COPY-PICK', 'a real click creates Copy with truthful shallow-copy wording',
      copy ? /copy\.copy\(value\).*nested mutable/i.test(copy.props.description) : false, true)
    check('COPY-BINDINGS', 'Copy receives the dragged value through its canonical input',
      await bindingFacts(page, SOURCE, 'out', copy?.id, 'value'),
      { count: 2, source: SOURCE, sourcePort: 'out', sink: copy?.id, sinkPort: 'value', normalized: true })
    await shortcut(page, 'z', 'KeyZ', 2); await delay(260)
    check('COPY-UNDO', 'Copy also leaves no Block or loose cable after one undo', await recordIds(page), copyBefore)

    const cancelBefore = await recordIds(page)
    const cancelUndos = await evaluate(page, 'window.__systemsketch.editor.history.getNumUndos()')
    const cancelOut = await box(page, portDot(SOURCE, 'output', 'out'))
    await offer(page, cancelOut, { x: 1320, y: 760 })
    await waitFor(page, `document.activeElement?.matches('[data-testid="block-picker-bundle"]')`, 'focused first quick action')
    const edgePicker = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const viewport = editor.getViewportScreenBounds()
      const rect = document.querySelector('[data-testid="block-picker"]').getBoundingClientRect()
      return {
        first: document.activeElement?.dataset?.testid ?? null,
        within: rect.left >= viewport.x - 1 && rect.top >= viewport.y - 1
          && rect.right <= viewport.x + viewport.w + 1 && rect.bottom <= viewport.y + viewport.h + 1,
      }
    })())`))
    check('EDGE-PLACEMENT', 'the full picker stays in the viewport at a lower-right cable drop', edgePicker,
      { first: 'block-picker-bundle', within: true })
    await key(page, 'ArrowDown', 'ArrowDown'); await delay(80)
    check('KEYBOARD-NAV', 'ArrowDown reaches the next quick action',
      await evaluate(page, 'document.activeElement?.dataset?.testid ?? null'), 'block-picker-projection')
    await key(page, 'Escape', 'Escape'); await delay(260)
    check('CANCEL', 'Escape removes the offered cable and leaves no undo artifact',
      { ids: await recordIds(page), undos: await evaluate(page, 'window.__systemsketch.editor.history.getNumUndos()') },
      { ids: cancelBefore, undos: cancelUndos })

    const undoCancelBefore = await recordIds(page)
    const undoCancelOut = await box(page, portDot(SOURCE, 'output', 'out'))
    await offer(page, undoCancelOut, { x: undoCancelOut.cx + 410, y: undoCancelOut.cy + 65 })
    await shortcut(page, 'z', 'KeyZ', 2); await delay(220)
    check('UNDO-CANCEL', 'Ctrl+Z cancels an unfinished offer instead of undoing earlier board work',
      await recordIds(page), undoCancelBefore)
    await shortcut(page, 'Z', 'KeyZ', 10); await delay(220)
    check('UNDO-CANCEL-REDO', 'Ctrl+Shift+Z cannot resurrect the transient half-cable',
      await recordIds(page), undoCancelBefore)

    const lateReadonlyBefore = await recordIds(page)
    const lateReadonlyUndos = await evaluate(page, 'window.__systemsketch.editor.history.getNumUndos()')
    const lateReadonlyOut = await box(page, portDot(SOURCE, 'output', 'out'))
    await offer(page, lateReadonlyOut, { x: lateReadonlyOut.cx + 410, y: lateReadonlyOut.cy + 80 })
    await evaluate(page, '(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: true }) })()')
    await waitFor(page, `!document.querySelector('[data-testid="block-picker"]')`, 'readonly transition closes picker')
    check('READONLY-WHILE-OPEN', 'a host readonly transition rolls back the open offer and its history',
      { ids: await recordIds(page), undos: await evaluate(page, 'window.__systemsketch.editor.history.getNumUndos()') },
      { ids: lateReadonlyBefore, undos: lateReadonlyUndos })
    await evaluate(page, '(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: false }) })()')

    const sinkIn = await box(page, portDot(SINK, 'input', 'in'))
    // Land well below the seeded source so the reverse-created producer stays
    // visibly separate while its output still reaches this input from the left.
    await offer(page, sinkIn, { x: sinkIn.cx - 410, y: sinkIn.cy + 350 })
    await choose(page, 'block-picker-projection')
    // End the pick's optional inline-accessor edit before changing the editor's
    // readonly mode; the mode transition itself is not part of this feature.
    await key(page, 'Escape', 'Escape'); await delay(220)
    const unbundle = (await blocks(page)).find((shape) => shape.props.blockType === 'unbundle')
    check('UNBUNDLE-REVERSE', 'a backward drag chooses Unbundle as the needed producer',
      unbundle ? { blockType: unbundle.props.blockType, output: unbundle.props.outputs[0]?.name } : null,
      { blockType: 'unbundle', output: '.' })
    check('REVERSE-BINDINGS', 'reverse insertion still normalizes two bindings to source→sink',
      await bindingFacts(page, unbundle?.id, 'out_1', SINK, 'in'),
      { count: 2, source: unbundle?.id, sourcePort: 'out_1', sink: SINK, sinkPort: 'in', normalized: true })

    const readOnlyBefore = await ids(page)
    await evaluate(page, '(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: true }) })()')
    check('READONLY-STATE', 'the real canvas entered readonly mode before the pointer gesture',
      await evaluate(page, 'window.__systemsketch.editor.getIsReadonly()'), true)
    const readOnlyOut = await box(page, portDot(SOURCE, 'output', 'out'))
    const readonlyDrag = await dragFrom(page, readOnlyOut, { x: 1340, y: 780 })
    const readonlyAfterDrag = await evaluate(page, `JSON.stringify({
      hasEditor: Boolean(window.__systemsketch?.editor), href: location.href,
      readonly: window.__systemsketch?.editor?.getIsReadonly() ?? null,
    })`).then(JSON.parse)
    check('READONLY', 'readonly canvas neither offers nor creates a quick-insert cable',
      { offered: readonlyDrag.offered, ids: await ids(page), state: readonlyAfterDrag },
      { offered: false, ids: readOnlyBefore, state: { hasEditor: true, href: readonlyAfterDrag.href, readonly: true } })
    await evaluate(page, '(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: false }) })()')

    if (process.env.CAPTURE_QUICK_INSERT_SCREENSHOTS) {
      await shot(page, 'bundle-unbundle-copy-quick-insert-reverse.png')
    }
    await page.send('Page.reload')
    await waitFor(page, `document.querySelector('[data-development-profile="block-dev"] .tl-container')`, 'reloaded canvas')
    await delay(900)
    check('REOPEN', 'the reverse Unbundle and its settled cable survive reload',
      { unbundle: (await blocks(page)).some((shape) => shape.props.blockType === 'unbundle'), connections: (await connections(page)).length },
      { unbundle: true, connections: 1 })
    check('CLEAN', 'the real browser journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'bundle-unbundle-copy-quick-insert.json'), JSON.stringify(results, null, 2))
    if (failed.length) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1 })
