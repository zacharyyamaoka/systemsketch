/**
 * Detaching a Behavior Tree region, driven in a real browser.
 *
 *   A projected child is refused — its truth is the region's XML, so lowering
 *   one occurrence on its own would both lie about who authored it and, because
 *   deleting a projected Block compiles an XML delete, quietly remove the node.
 *   The region detaches whole: it becomes a stock frame carrying the canonical
 *   XML, every occurrence goes through the ordinary Block detach, the painted
 *   layer becomes stock lines, triangles, rectangles and text, and one Ctrl+Z
 *   puts the region back.
 *
 * Every claim is read back from the editor, the painted DOM, or an isolated
 * stock tldraw renderer with no SystemSketch utilities registered.
 * Screenshots land in docs/assets/behavior-tree-detach/ and are buffered until
 * the checks pass.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  clickElement,
  delay,
  drag,
  evaluate,
  key,
  readConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-detach')
const REGION = 'shape:bt-detach-region'
const WITNESS = 'shape:bt-detach-witness'

const results = []
let journeyError = null
const pending = []

function check(id, description, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, description, ok, observed, desired })
  process.stdout.write(`${ok ? '  PASS' : '  FAIL'}  ${id}: ${description}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n        desired= ${JSON.stringify(desired)}\n`))
  return ok
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  pending.push({ name, data: Buffer.from(capture.data, 'base64') })
}

/* ------------------------------- board setup ------------------------------ */

async function seed(page, port, lens = 'none') {
  await openApp(page, port, '')
  await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
  await delay(500)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 220,
      props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace', dataLens: ${JSON.stringify(lens)} } })
    // A stock witness nothing in this journey touches, so "unchanged except the
    // detached records" is a claim with something to fail against.
    editor.createShape({ id: '${WITNESS}', type: 'geo', x: -420, y: 220,
      props: { geo: 'rectangle', w: 180, h: 90, color: 'violet', fill: 'solid' } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 10`, 'the tree to project')
  await delay(400)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.zoomToBounds(editor.getShapePageBounds('${REGION}'), { inset: 70, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)

const board = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const shapes = editor.getCurrentPageShapes()
  const types = {}
  for (const shape of shapes) types[shape.type] = (types[shape.type] ?? 0) + 1
  const witness = editor.getShape('${WITNESS}')
  return {
    types,
    total: shapes.length,
    region: Boolean(editor.getShape('${REGION}')),
    kids: editor.getShape('${REGION}') ? editor.getSortedChildIdsForParent('${REGION}').length : null,
    witness: witness ? { x: witness.x, y: witness.y, props: witness.props, meta: witness.meta } : null,
    btStamped: shapes.filter((shape) => shape.meta.btRegion !== undefined || shape.meta.btRole !== undefined).length,
  }
})())`).then(JSON.parse)

/** A point on the region's header band, in screen pixels. */
const bandPoint = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const bounds = editor.getShapePageBounds('${REGION}')
  const point = editor.pageToScreen({ x: bounds.minX + 140, y: bounds.minY + 22 })
  return { x: point.x, y: point.y }
})())`).then(JSON.parse)

/** A point on the first child matching `filter`, in screen pixels. */
const childPoint = (page, filter) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
    const shape = editor.getShape(candidate)
    return ${filter}
  })
  if (!id) return null
  const bounds = editor.getShapePageBounds(id)
  const point = editor.pageToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY + Math.min(22, bounds.height / 2) })
  return { x: point.x, y: point.y, id }
})())`).then(JSON.parse)

async function openContextMenuAt(page, point) {
  await clickAt(page, point.x, point.y)
  await delay(220)
  await clickAt(page, point.x, point.y, 'right')
  await waitFor(page, `document.querySelector('[data-testid="context-menu"]')`, 'the context menu')
  await delay(150)
}

const hasDetachItem = (page) => evaluate(page,
  `Boolean(document.querySelector('[data-testid="context-menu.block-detach-to-primitives"]'))`)

async function closeMenu(page) {
  await key(page, 'Escape')
  await delay(200)
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-detach', build: 'bt-detach-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    /* ---- a projected child refuses to detach ------------------------------ */
    await seed(page, port)
    const xmlBefore = await regionXml(page)
    const kidsBefore = (await board(page)).kids

    for (const [name, filter] of [
      ['leaf', `shape.type === 'block' && shape.meta.btRole === 'node'`],
      ['control', `shape.type === 'behaviorTreeControl'`],
    ]) {
      const point = await childPoint(page, filter)
      await openContextMenuAt(page, point)
      const selection = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`).then(JSON.parse)
      check(`refuse.${name}.selected`, `right-clicking a projected ${name} selects it`, selection, [point.id])
      check(`refuse.${name}.menu`, `no Detach item is offered for a projected ${name}`, await hasDetachItem(page), false)
      if (name === 'leaf') await shot(page, 'refused-child-menu.png')
      await closeMenu(page)
    }

    // Blackboard pills are Blocks too, and the same refusal must cover them.
    await seed(page, port, 'blackboard')
    const pillPoint = await childPoint(page, `shape.meta.btRole === 'key'`)
    await openContextMenuAt(page, pillPoint)
    check('refuse.key.menu', 'no Detach item is offered for a Blackboard key pill',
      await hasDetachItem(page), false)
    await closeMenu(page)

    await seed(page, port)
    const leafPoint = await childPoint(page, `shape.type === 'block' && shape.meta.btRole === 'node'`)
    await openContextMenuAt(page, leafPoint)
    await closeMenu(page)
    await delay(400)
    check('refuse.xml', 'the XML is byte-identical after a refused child detach',
      await regionXml(page), xmlBefore)
    check('refuse.children', 'the occurrence is still on the canvas', (await board(page)).kids, kidsBefore)

    /* ---- the region detaches whole ---------------------------------------- */
    const before = await board(page)
    const blockKids = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return editor.getSortedChildIdsForParent('${REGION}').filter((id) => editor.getShape(id).type === 'block').length
    })()`)
    await shot(page, 'region-before.png')

    const band = await bandPoint(page)
    await openContextMenuAt(page, band)
    check('region.selected', 'the header band selects the region',
      await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`).then(JSON.parse), [REGION])
    check('region.menu', 'Detach to primitives is offered for the region', await hasDetachItem(page), true)
    await clickElement(page, '[data-testid="context-menu.block-detach-to-primitives"]')
    await delay(1200)

    const after = await board(page)
    check('region.alive', 'the app survived the detach', typeof after.total, 'number')
    check('region.stock', 'only stock record types are left',
      Object.keys(after.types).filter((type) => !['geo', 'text', 'line', 'arrow', 'group', 'frame'].includes(type)).sort(), [])
    check('region.gone', 'the region record is gone', after.region, false)
    check('region.witness', 'the unrelated stock shape is untouched', after.witness, before.witness)
    check('region.unstamped', 'nothing left on the board still claims a region', after.btStamped, 0)

    const frame = await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getCurrentPageShapes().find((candidate) => candidate.type === 'frame')
      if (!shape) return null
      const record = shape.meta.systemSketch
      return {
        name: shape.props.name,
        w: Math.round(shape.props.w), h: Math.round(shape.props.h),
        kind: record?.kind, version: record?.version,
        xml: record?.props?.xml ?? null,
        children: editor.getSortedChildIdsForParent(shape.id).length,
        groups: editor.getSortedChildIdsForParent(shape.id)
          .filter((id) => editor.getShape(id).type === 'group').length,
      }
    })())`).then(JSON.parse)
    check('frame.exists', 'the region became one stock frame named for the tree', frame?.name, 'PickAndPlace')
    check('frame.record', 'the frame carries the canonical XML in JSON-only meta',
      { kind: frame?.kind, version: frame?.version, xml: frame?.xml }, { kind: 'behavior-tree', version: 1, xml: xmlBefore })
    check('frame.occurrences', 'every projected Block became one detached stock group',
      frame?.groups, blockKids)
    await shot(page, 'region-detached.png')
    // Close enough to read one wire, its head, a control card and a lowered leaf.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const frame = editor.getCurrentPageShapes().find((shape) => shape.type === 'frame')
      const bounds = editor.getShapePageBounds(frame.id)
      editor.zoomToBounds({ x: bounds.minX + bounds.width * 0.28, y: bounds.minY, w: bounds.width * 0.34, h: bounds.height * 0.55 },
        { inset: 12, animation: { duration: 0 } })
      return null
    })()`)
    await delay(350)
    await shot(page, 'region-detached-zoom.png')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const frame = editor.getCurrentPageShapes().find((shape) => shape.type === 'frame')
      editor.zoomToBounds(editor.getShapePageBounds(frame.id), { inset: 60, animation: { duration: 0 } })
      return null
    })()`)
    await delay(250)

    check('console', 'no local console errors so far', readConsoleErrors(page), [])

    /* ---- one Ctrl+Z puts the region back ----------------------------------- */
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(1000)
    const undone = await board(page)
    check('undo.region', 'undo restores the region', undone.region, true)
    check('undo.children', 'undo restores its projection', undone.kids, before.kids)
    check('undo.xml', 'undo restores the XML byte for byte', await regionXml(page), xmlBefore)
    check('undo.stock', 'no stock leftovers survive the undo',
      Object.keys(undone.types).sort(), Object.keys(before.types).sort())
    await shot(page, 'region-undone.png')

    /* ---- the result loads in stock tldraw 5.3.2 ---------------------------- */
    const bandAgain = await bandPoint(page)
    await openContextMenuAt(page, bandAgain)
    await clickElement(page, '[data-testid="context-menu.block-detach-to-primitives"]')
    await delay(1200)
    check('redetach', 'the region detaches again after the undo',
      (await board(page)).region, false)

    const stock = await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const source = await window.__systemsketch.serializeTldraw()
      const svg = await window.__systemsketch.renderStockTldraw(source)
      const host = document.createElement('div')
      host.id = 'bt-stock-render'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;padding:16px;overflow:hidden;display:flex;align-items:center;justify-content:center'
      host.innerHTML = svg
      const painted = host.querySelector('svg')
      if (painted) { painted.style.width = '100%'; painted.style.height = '100%' }
      document.body.appendChild(host)
      return JSON.stringify({ ok: true, length: svg.length, types: [...new Set(editor.getCurrentPageShapes().map((shape) => shape.type))].sort() })
    })()`).then(JSON.parse)
    check('stock.render', 'stock tldraw with no SystemSketch utilities renders the detached board', stock.ok, true)
    check('stock.types', 'and every record it painted is a stock type',
      stock.types.filter((type) => !['geo', 'text', 'line', 'arrow', 'group', 'frame'].includes(type)), [])
    await delay(400)
    await shot(page, 'stock-render.png')
    await evaluate(page, `(document.getElementById('bt-stock-render')?.remove(), null)`)

    /* ---- a drawing made inside the region outlives the detach -------------- */
    // A region refuses a shape DRAGGED in, but tldraw parents a newly drawn or
    // pasted one to whatever it landed on — so a person can annotate a tree in
    // place. Deleting the region deletes its whole subtree, and the painted
    // layer only replaces chrome the projection drew, so the annotation has to
    // be lifted out first or detach silently destroys a person's own work.
    await seed(page, port)
    const spot = await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const b = editor.getShapePageBounds('${REGION}')
      const a = editor.pageToScreen({ x: b.minX + 30, y: b.maxY - 95 })
      const c = editor.pageToScreen({ x: b.minX + 170, y: b.maxY - 30 })
      return { ax: a.x, ay: a.y, cx: c.x, cy: c.y }
    })())`).then(JSON.parse)
    await key(page, 'r')
    await delay(200)
    await drag(page, { x: spot.ax, y: spot.ay }, { x: spot.cx, y: spot.cy })
    await delay(600)
    await key(page, 'Escape')
    await delay(200)
    const annotation = await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const drawn = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'geo' && shape.meta.btRole === undefined && shape.id !== '${WITNESS}')
      return { ids: drawn.map((shape) => shape.id), parents: drawn.map((shape) => shape.parentId) }
    })())`).then(JSON.parse)
    check('annotate.parented', 'a rectangle drawn inside the region becomes its child',
      annotation.parents, [REGION])

    const bandFinal = await bandPoint(page)
    await openContextMenuAt(page, bandFinal)
    await clickElement(page, '[data-testid="context-menu.block-detach-to-primitives"]')
    await delay(1300)
    const kept = await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const frame = editor.getCurrentPageShapes().find((shape) => shape.type === 'frame')
      return ${JSON.stringify(annotation.ids)}.map((id) => {
        const shape = editor.getShape(id)
        return shape ? (shape.parentId === frame?.id ? 'in-frame' : 'loose') : 'DESTROYED'
      })
    })())`).then(JSON.parse)
    check('annotate.survives', "the person's own drawing survives the detach, inside the frame",
      kept, annotation.ids.map(() => 'in-frame'))
    await shot(page, 'annotation-kept.png')

    check('console.end', 'no local console errors', readConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-detach-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-detach-failed-${entry.name}`), entry.data)
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
