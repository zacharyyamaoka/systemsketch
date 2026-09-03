#!/usr/bin/env node
/**
 * Real-browser proof for the Loop region and "B solid drop".
 *
 * The claim under test is not decorative. B says: the header is an operator,
 * the collection lands ON it, the element leaves it through a REAL port, and
 * the cable that element travels on is an ordinary SOLID connection — because
 * dotted already means `temporal: delayed`, one turn late, and the element is
 * this turn's value. So the journey drives the toolbar, draws the region,
 * welds both header ports with real mouse events, and then reads the painted
 * path to confirm the item cable carries no dash pattern while a delayed cable
 * on the same board does.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, deselect, dragFrom, drawBlock, portDot } from './block_journey_helpers.mjs'

async function clickSelector(page, selector) {
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, selector, 8000)
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy)
  await delay(280)
}

/** Focus a live inspector field by its accessible name, replace it, commit. */
async function retype(page, ariaLabel, text) {
  const field = await box(page, `input[aria-label="${ariaLabel}"]`)
  // Triple-click selects the whole value. Ctrl+A did not: it left the caret
  // where it was, so the new text was inserted into the old and the check read
  // `IterablPosese`.
  await mouse(page, 'mouseMoved', field.cx, field.cy)
  await mouse(page, 'mousePressed', field.cx, field.cy, { buttons: 1, clickCount: 3 })
  await mouse(page, 'mouseReleased', field.cx, field.cy, { buttons: 1, clickCount: 3 })
  await delay(160)
  await page.send('Input.insertText', { text })
  await key(page, 'Enter', 'Enter')
  await delay(320)
}

const SHOTS = join(ROOT, 'docs', 'assets')
const SHOT = join(SHOTS, 'loop-region-acceptance.png')
const OUT = join(SHOTS, 'loop-region-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

const loopState = (page) => editorEval(page, `
  const loops = editor.getCurrentPageShapes().filter((s) => s.type === 'loop')
  const cables = editor.getCurrentPageShapes().filter((s) => s.type === 'connection')
  const bindings = editor.store.allRecords()
    .filter((r) => r.typeName === 'binding' && r.type === 'connection')
  const loop = loops[0] ?? null
  return JSON.stringify({
    loops: loops.length,
    title: loop?.props.title ?? null,
    iterable: loop?.props.iterable ?? null,
    item: loop?.props.item ?? null,
    cables: cables.length,
    temporal: cables.map((c) => c.props.temporal).sort(),
    bindings: bindings.length,
    orphans: cables.filter((c) => bindings.filter((b) => b.fromId === c.id).length !== 2).length,
    children: loop ? editor.getSortedChildIdsForParent(loop.id).length : 0,
    childTypes: loop
      ? editor.getSortedChildIdsForParent(loop.id)
          .map((id) => editor.getShape(id)?.type).filter(Boolean).sort()
      : [],
    fromLoopItem: bindings
      .filter((b) => b.toId === loop?.id && b.props.portId === 'item')
      .map((b) => b.props.terminal),
    intoLoopIterable: bindings
      .filter((b) => b.toId === loop?.id && b.props.portId === 'iterable')
      .map((b) => b.props.terminal),
  })
`).then(JSON.parse)

async function run() {
  const app = await startApp({ label: 'loop-region', build: 'loop-region-smoke' })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'window.__systemsketch?.editor', 'editor')
    await delay(700)

    // 1 — the gesture a person actually makes: open the system family slot,
    // CLICK Loop, and get the loop tool. Asserting only that the menu lists the
    // item is what let a dead menu entry ship — `selectSystemFamilyTool` calls
    // `tools[id]?.onSelect()`, and an id with no registry entry no-ops.
    const slot = await box(page, '[data-testid="systemsketch-tool-system"]')
    await clickAt(page, slot.cx, slot.cy)
    await delay(460)
    const item = JSON.parse(await evaluate(page, `(() => {
      const node = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
        .find((candidate) => candidate.textContent.includes('Loop'))
      if (!node) return JSON.stringify(null)
      const rect = node.getBoundingClientRect()
      return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
    })()`))
    check('L1', 'the system family menu offers Loop beside Block and Branch',
      item !== null, true)
    await clickAt(page, item.cx, item.cy)
    await delay(420)
    check('L1b', 'clicking it actually activates the loop tool',
      await editorEval(page, 'return editor.getCurrentToolId()'), 'loop')

    // 2 — draw the region with the real box gesture, using the tool the click
    // above left active. No `setCurrentTool` anywhere in this journey.
    await mouse(page, 'mouseMoved', 360, 220)
    await mouse(page, 'mousePressed', 360, 220, { buttons: 1 })
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', 360 + (560 * step) / 8, 220 + (360 * step) / 8, { buttons: 1 })
    }
    await mouse(page, 'mouseReleased', 920, 580)
    await delay(520)
    await deselect(page)
    let state = await loopState(page)
    check('L2', 'one Loop region, titled, both header ports typed and unnamed',
      [state.loops, state.title, state.iterable?.type, state.item?.type,
        'name' in (state.iterable ?? {}), 'name' in (state.item ?? {})],
      [1, 'For Loop', 'Iterable', 'Iter', false, false])

    // 3 — both header ports are painted, and they carry opposite polarity.
    const loopId = await editorEval(page, `
      return editor.getCurrentPageShapes().find((s) => s.type === 'loop').id`)
    const iterableDot = await box(page, portDot(loopId, 'input', 'iterable'))
    const itemDot = await box(page, portDot(loopId, 'output', 'item'))
    check('L3', 'the inlet is on the wall; the item port is inside it, on the header edge',
      [iterableDot.w > 0, itemDot.w > 0, itemDot.cy > iterableDot.cy,
        itemDot.cx > iterableDot.cx],
      [true, true, true, true])

    // 4 — a Block drawn inside the region is adopted by it.
    await drawBlock(page, { x: 560, y: 380 }, { x: 860, y: 520 }, 'merge()')
    await delay(520)
    await deselect(page)
    state = await loopState(page)
    check('L4', 'a Block drawn inside the region becomes its child',
      [state.children, state.childTypes], [1, ['block']])

    // 5 — THE CLAIM. Drag from the item outlet to the Block's input. It must
    // produce an ordinary connection, not a new kind of edge.
    const blockId = await editorEval(page, `
      const block = editor.getCurrentPageShapes().find((s) => s.type === 'block')
      editor.updateShape({
        id: block.id, type: 'block',
        props: { inputs: [{ id: 'in_1', name: 'other', type: 'Pose', visible: true }] },
      })
      return block.id`)
    await delay(360)
    const blockIn = await box(page, portDot(blockId, 'input', 'in_1'))
    await dragFrom(page, await box(page, portDot(loopId, 'output', 'item')), blockIn)
    await dragFrom(page, await box(page, portDot(loopId, 'output', 'item')), blockIn)
    await delay(520)
    await deselect(page)
    state = await loopState(page)
    check('L5', 'the item port welds an ordinary SOLID cable — data, never delayed',
      [state.cables, state.temporal, state.orphans, state.fromLoopItem],
      [1, ['data'], 0, ['start']])

    // 5b — and it leaves PERPENDICULAR: the run's first segment drops straight
    // down out of the header rather than setting off sideways around the region.
    const firstLeg = JSON.parse(await evaluate(page, `(() => {
      const path = document.querySelector('[data-shape-type="connection"] path')
      const matrix = path.getScreenCTM()
      const at = (length) => {
        const point = path.getPointAtLength(length).matrixTransform(matrix)
        return { x: point.x, y: point.y }
      }
      const a = at(0)
      const b = at(Math.min(24, path.getTotalLength() / 3))
      return JSON.stringify({ dx: Math.abs(b.x - a.x), dy: b.y - a.y })
    })()`))
    check('L5b', 'the item cable leaves the header edge straight down',
      [firstLeg.dy > 8, firstLeg.dx < 3], [true, true])

    // 6 — the collection lands ON the header: an outside Block feeds the inlet.
    await drawBlock(page, { x: 80, y: 200 }, { x: 300, y: 320 }, 'source()')
    await delay(520)
    await deselect(page)
    const sourceId = await editorEval(page, `
      const loop = editor.getCurrentPageShapes().find((s) => s.type === 'loop')
      const source = editor.getCurrentPageShapes()
        .filter((s) => s.type === 'block').find((b) => b.parentId !== loop.id)
      editor.updateShape({
        id: source.id, type: 'block',
        props: { outputs: [{ id: 'out_1', name: 'others', type: 'Poses', visible: true }] },
      })
      return source.id`)
    await delay(360)
    await dragFrom(page, await box(page, portDot(sourceId, 'output', 'out_1')),
      await box(page, portDot(loopId, 'input', 'iterable')))
    await delay(520)
    await deselect(page)
    state = await loopState(page)
    check('L6', 'the collection lands on the header, welded to the Iterable inlet',
      [state.cables, state.orphans, state.intoLoopIterable], [2, 0, ['end']])

    // 7 — solid means solid. The painted item cable carries no dash pattern,
    // and a delayed cable on the same board does, so the two cannot be read
    // as the same thing.
    await editorEval(page, `
      const cable = editor.getCurrentPageShapes().filter((s) => s.type === 'connection')[0]
      editor.updateShape({ id: cable.id, type: 'connection', props: { temporal: 'delayed' } })
      return ''`)
    await delay(420)
    const dashes = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('[data-shape-type="connection"] path'))
        .map((node) => (getComputedStyle(node).strokeDasharray || 'none'))))()`))
    const anyDashed = dashes.some((value) => value !== 'none' && value !== '')
    const anySolid = dashes.some((value) => value === 'none' || value === '')
    check('L7', 'a delayed cable paints dashes; a data cable paints none',
      [anyDashed, anySolid], [true, true])
    await editorEval(page, `
      const cable = editor.getCurrentPageShapes().filter((s) => s.type === 'connection')[0]
      editor.updateShape({ id: cable.id, type: 'connection', props: { temporal: 'data' } })
      return ''`)
    await delay(360)

    // 8 — it survives autosave and a cold reload.
    await delay(1200)
    await openApp(page, port, '')
    await waitFor(page, 'window.__systemsketch?.editor', 'editor after reload')
    await delay(1400)
    state = await loopState(page)
    // The region owns its Block AND both cables — a cable inside a region is
    // that region's child, which is what keeps it clickable (L12).
    check('L8', 'the region, its child and both cables survive a reload',
      [state.loops, state.cables, state.temporal, state.orphans, state.childTypes],
      [1, 2, ['data', 'data'], 0, ['block', 'connection', 'connection']])

    // 9 — the two header types are authored, not baked in. You said a header
    // port carries a type you can define; until now there was nowhere to
    // define it.
    // The reload above minted new shape ids, so re-resolve rather than reusing
    // the pre-reload handle.
    await editorEval(page, `
      const loop = editor.getCurrentPageShapes().find((s) => s.type === 'loop')
      editor.select(loop.id)
      return ''`)
    await delay(420)
    // Selecting the region opens its panel, the way selecting a Block or a
    // Branch does. No extra click.
    await waitFor(page, `document.querySelector('[data-testid="loop-inspector"]')`, 'loop inspector')
    const fields = JSON.parse(await evaluate(page, `(() => {
      const panel = document.querySelector('[data-testid="loop-inspector"]')
      return JSON.stringify({
        sections: Array.from(panel.querySelectorAll('[data-inspector-section]'))
          .map((n) => n.dataset.inspectorSection),
        types: Array.from(panel.querySelectorAll('input[aria-label$="type"]'))
          .map((n) => n.value),
        // A header port has no name, so the panel must not offer one.
        nameFields: panel.querySelectorAll('input[aria-label$="name"]').length,
      })
    })()`))
    check('L9', 'the Loop inspector offers both types and no name field',
      [fields.sections, fields.types, fields.nameFields],
      [['Loop', 'Header ports', 'Turn'], ['Iterable', 'Iter'], 0])

    // 10 — THE CLAIM of this slice: retyping a header port must not disturb the
    // cable welded to it, because a cable is welded by port ID.
    await retype(page, 'Iterable in type', 'Poses')
    await retype(page, 'Element out type', 'Pose')
    await delay(420)
    state = await loopState(page)
    const painted = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      ['iterable', 'item'].map((id) => document
        .querySelector('[data-testid="loop-port-label-' + id + '"]')?.textContent.trim() ?? null)))()`))
    check('L10', 'retyping repaints the header and keeps both cables welded',
      [state.iterable?.type, state.item?.type, painted, state.cables, state.orphans],
      ['Poses', 'Pose', ['Poses', 'Pose'], 2, 0])

    // 12 — every cable you can SEE inside the region is a cable you can click.
    // tldraw stops hit-testing at a frame-like shape's hollow face and answers
    // nothing, so a cable left in the page beneath the Loop was unselectable
    // wherever it crossed it — while the same cable inside an Expanded Block
    // worked, purely because being that Block's child sorted it above the
    // frame. Clicking is the only honest proof: geometry alone hid this.
    await editorEval(page, 'editor.selectNone(); return \'\'')
    const cableTargets = JSON.parse(await editorEval(page, `
      const out = []
      document.querySelectorAll('[data-shape-type="connection"]').forEach((node) => {
        const path = node.querySelector('path')
        if (!path) return
        const point = path.getPointAtLength(path.getTotalLength() / 2)
          .matrixTransform(path.getScreenCTM())
        out.push({ id: node.dataset.shapeId, x: point.x, y: point.y })
      })
      return JSON.stringify(out)`))
    const cableClicks = []
    for (const target of cableTargets) {
      await clickAt(page, target.x, target.y)
      await delay(200)
      const selected = await editorEval(page, `
        const ids = editor.getSelectedShapeIds()
        return ids.length === 1 ? editor.getShape(ids[0]).type : String(ids.length)`)
      cableClicks.push(selected)
      await editorEval(page, 'editor.selectNone(); return \'\'')
      await delay(120)
    }
    check('L12', 'clicking any cable painted over the region selects that cable',
      [cableTargets.length > 0, cableClicks],
      [true, cableTargets.map(() => 'connection')])

    // 13 — the footer is chrome, the open body is not. The footer shipped with
    // no hit geometry at all, so the one band Zach reached for did nothing.
    const bands = await editorEval(page, `
      const loop = editor.getCurrentPageShapes().find((s) => s.type === 'loop')
      const b = editor.getShapePageBounds(loop.id)
      return JSON.stringify({
        footer: editor.screenToPage
          ? editor.pageToScreen({ x: b.x + b.w / 2, y: b.y + b.h - 15 })
          : null,
        header: editor.pageToScreen({ x: b.x + b.w / 2, y: b.y + 18 }),
      })`)
    const { footer, header } = JSON.parse(bands)
    const grab = async (point) => {
      await clickAt(page, point.x, point.y)
      await delay(200)
      const hit = await editorEval(page, `
        const ids = editor.getSelectedShapeIds()
        return ids.length === 1 ? editor.getShape(ids[0]).type : 'none'`)
      await editorEval(page, 'editor.selectNone(); return \'\'')
      await delay(120)
      return hit
    }
    check('L13', 'the header AND the footer grab the region',
      [await grab(header), await grab(footer)], ['loop', 'loop'])

    // 14 — and the cables sit under the region's own Blocks, where the paint
    // rule puts them. Being clickable must not have raised them over the cards.
    const stacking = await editorEval(page, `
      const loop = editor.getCurrentPageShapes().find((s) => s.type === 'loop')
      const kinds = editor.getSortedChildIdsForParent(loop.id)
        .map((id) => editor.getShape(id).type)
      const lastCable = kinds.lastIndexOf('connection')
      const firstBlock = kinds.indexOf('block')
      return JSON.stringify({
        cables: kinds.filter((k) => k === 'connection').length,
        cablesUnderBlocks: firstBlock === -1 || lastCable < firstBlock,
      })`)
    check('L14', 'the region owns its cables, and they still paint under its Blocks',
      JSON.parse(stacking), { cables: 2, cablesUnderBlocks: true })

    await ensureDir(SHOTS)
    const shot = await page.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(SHOT, Buffer.from(shot.data, 'base64'))

    check('L11', 'no local console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }
  await writeFile(OUT, JSON.stringify({ results }, null, 2))
  const failed = results.filter((entry) => !entry.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
  if (failed.length > 0) process.exit(1)
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
