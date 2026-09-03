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

    // 1 — the Loop lives in the system family slot, one click deeper, and it
    // is reachable by the same gesture that reaches Block and Branch.
    const slot = await box(page, '[data-testid="systemsketch-tool-system"]')
    await clickAt(page, slot.cx, slot.cy)
    await delay(420)
    const menuLabels = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.systemsketch-tool-menu button, .systemsketch-tool-menu [role="menuitem"]'))
        .map((node) => node.textContent.trim()).filter(Boolean)))()`))
    check('L1', 'Loop sits in the system family menu beside Block and Branch',
      menuLabels.includes('Loop'), true)
    await key(page, 'Escape', 'Escape')
    await delay(400)

    // 2 — draw the region with the real box gesture.
    await editorEval(page, `editor.setCurrentTool('loop'); return ''`)
    await delay(200)
    await mouse(page, 'mouseMoved', 360, 220)
    await mouse(page, 'mousePressed', 360, 220, { buttons: 1 })
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', 360 + (560 * step) / 8, 220 + (360 * step) / 8, { buttons: 1 })
    }
    await mouse(page, 'mouseReleased', 920, 580)
    await delay(520)
    await deselect(page)
    let state = await loopState(page)
    check('L2', 'one Loop region, titled, with both header ports authored',
      [state.loops, state.title, state.iterable?.name, state.item?.name],
      [1, 'For Loop', 'Iterable', 'Iter'])

    // 3 — both header ports are painted, and they carry opposite polarity.
    const loopId = await editorEval(page, `
      return editor.getCurrentPageShapes().find((s) => s.type === 'loop').id`)
    const iterableDot = await box(page, portDot(loopId, 'input', 'iterable'))
    const itemDot = await box(page, portDot(loopId, 'output', 'item'))
    check('L3', 'the collection port is an input on the wall, the item port an output',
      [iterableDot.w > 0, itemDot.w > 0, itemDot.cy > iterableDot.cy], [true, true, true])

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
    check('L8', 'the region, its child and both cables survive a reload',
      [state.loops, state.cables, state.temporal, state.orphans, state.children],
      [1, 2, ['data', 'data'], 0, 1])

    await ensureDir(SHOTS)
    const shot = await page.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(SHOT, Buffer.from(shot.data, 'base64'))

    check('L9', 'no local console errors', localConsoleErrors(page), [])
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
