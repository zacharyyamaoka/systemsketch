/**
 * A Behavior Tree region's children belong to the region they sit in, driven
 * in a real browser.
 *
 *   Duplicate and paste re-mint every shape id but copy `meta` verbatim, so a
 *   copied projected child arrives still naming the region it was copied FROM.
 *   Everything that once trusted that name acted on the original: it reparented
 *   the copy into it, recorded the paste distance as one of the ORIGINAL's free
 *   offsets — which is what scrambled its layout, and why Tidy, which clears
 *   offsets, appeared to fix it — and deleted the original's own children as
 *   duplicate strays.
 *
 * So: containment decides. Every claim below is read back from the editor.
 * Screenshots land in docs/assets/behavior-tree-identity/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  delay,
  drag,
  evaluate,
  readConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-identity')
const REGION = 'shape:bt-identity-region'

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

async function seed(page, port, lens = 'none') {
  await openApp(page, port, '')
  await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
  await delay(500)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 200,
      props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace', dataLens: ${JSON.stringify(lens)} } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 10`, 'the tree to project')
  await delay(500)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.zoomToBounds(editor.getShapePageBounds('${REGION}'), { inset: 260, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

/**
 * Everything about a region a copy must not be able to touch: its free
 * offsets, and where each of its children is.
 */
const regionState = (page, id) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const region = editor.getShape(${JSON.stringify(id)})
  if (!region) return null
  const kids = editor.getSortedChildIdsForParent(region.id).map((childId) => {
    const shape = editor.getShape(childId)
    return { path: shape.meta.btPath, role: shape.meta.btRole, type: shape.type,
      x: Math.round(shape.x), y: Math.round(shape.y), stamp: shape.meta.btRegion === region.id }
  })
  return { offsets: region.props.offsets, x: Math.round(region.x), y: Math.round(region.y), kids }
})())`).then(JSON.parse)

const regionIds = (page) => evaluate(page,
  `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'behaviorTree').map((shape) => shape.id))`).then(JSON.parse)

const totalShapes = (page) => evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().length`)

/** Every cable, with the region each of its two ends actually lives in. */
const cableSpans = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const regionOf = (shapeId) => {
    let parent = editor.getShape(editor.getShape(shapeId)?.parentId)
    while (parent) {
      if (parent.type === 'behaviorTree') return parent.id
      parent = editor.getShape(parent.parentId)
    }
    return null
  }
  return editor.getCurrentPageShapes()
    .filter((shape) => shape.meta.btRole === 'cable')
    .map((cable) => {
      const bindings = editor.getBindingsFromShape(cable.id, 'connection')
      const regions = [...new Set(bindings.map((binding) => regionOf(binding.toId)))]
      return { ends: bindings.length, regions: regions.length }
    })
})())`).then(JSON.parse)

async function bandPoint(page, id) {
  return evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(id)})
    const point = editor.pageToScreen({ x: bounds.minX + 140, y: bounds.minY + 22 })
    return { x: point.x, y: point.y }
  })())`).then(JSON.parse)
}

/** Assert the three facts a copy must satisfy, for whichever region is new. */
async function assertCopyIsIndependent(page, label, before, copyId) {
  const after = await regionState(page, REGION)
  check(`${label}.offsets`, `${label}: the original's free offsets are byte-identical`, after.offsets, before.offsets)
  check(`${label}.kids`, `${label}: the original keeps exactly its own children, where they were`, after.kids, before.kids)
  const copy = await regionState(page, copyId)
  check(`${label}.copy.count`, `${label}: the copy has its own full child set`, copy.kids.length, before.kids.length)
  check(`${label}.copy.parent`, `${label}: and every one of them is stamped with the copy, not the original`,
    copy.kids.filter((kid) => !kid.stamp).length, 0)
  check(`${label}.copy.paths`, `${label}: the copy projects the same occurrences`,
    copy.kids.map((kid) => `${kid.role}:${kid.path}`).sort(), before.kids.map((kid) => `${kid.role}:${kid.path}`).sort())
  return copy
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree-identity', build: 'bt-identity-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    /* ---- Ctrl+D ----------------------------------------------------------- */
    await seed(page, port)
    const baseline = await totalShapes(page)
    const before = await regionState(page, REGION)
    check('seed.offsets', 'a freshly projected region has no free offsets', before.offsets, {})

    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await delay(200)
    await shortcut(page, 'd', 'KeyD', 2)
    await delay(1200)
    const afterDuplicate = await regionIds(page)
    check('duplicate.regions', 'Ctrl+D leaves two regions', afterDuplicate.length, 2)
    const duplicateId = afterDuplicate.find((id) => id !== REGION)
    await assertCopyIsIndependent(page, 'duplicate', before, duplicateId)
    await shot(page, 'after-duplicate.png')

    /* ---- moving the copy must not reach the original ---------------------- */
    const from = await bandPoint(page, duplicateId)
    await drag(page, { x: from.x, y: from.y }, { x: from.x + 400, y: from.y + 60 })
    await delay(900)
    const moved = await regionState(page, REGION)
    check('move.offsets', 'dragging the copy 400px leaves the original’s offsets untouched', moved.offsets, before.offsets)
    check('move.kids', 'and leaves every original child exactly where it was', moved.kids, before.kids)
    const movedCopy = await regionState(page, duplicateId)
    check('move.copy', 'while the copy itself moved', movedCopy.x > before.x + 300, true)
    check('move.copy.offsets', 'and moving a whole region is not a free child offset', movedCopy.offsets, {})
    await shot(page, 'after-move.png')

    /* ---- undo removes the copy entirely ----------------------------------- */
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(700)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(1000)
    check('undo.regions', 'undo removes the copy', (await regionIds(page)), [REGION])
    check('undo.total', 'and every record it brought with it', await totalShapes(page), baseline)
    check('undo.original', 'the original is exactly as it started', await regionState(page, REGION), before)

    /* ---- paste ------------------------------------------------------------ */
    // Headless Chrome refuses the async clipboard read, so this drives the same
    // internal path tldraw's paste runs once it HAS the content: content out of
    // the page, content back onto it at a point. The id re-minting under test
    // is that call's, not the clipboard's.
    await clickAt(page, 300, 900)
    await delay(200)
    const pasteBefore = await regionState(page, REGION)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const content = editor.getContentFromCurrentPage(['${REGION}'])
      editor.putContentOntoCurrentPage(content, { point: { x: 2600, y: 1400 }, select: true })
      return null
    })()`)
    await delay(1400)
    const afterPaste = await regionIds(page)
    check('paste.regions', 'paste leaves two regions', afterPaste.length, 2)
    await assertCopyIsIndependent(page, 'paste', pasteBefore, afterPaste.find((id) => id !== REGION))
    await shot(page, 'after-paste.png')

    /* ---- a bare projected child, pasted alone ----------------------------- */
    // The one case containment cannot answer: the copy lands on the page, under
    // no region at all, so the stale stamp is the only thing left to read. It
    // must not become a free offset on the region it was copied from.
    await seed(page, port)
    const loneBefore = await regionState(page, REGION)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const childId = editor.getSortedChildIdsForParent('${REGION}').find((id) => editor.getShape(id).meta.btRole === 'node')
      const content = editor.getContentFromCurrentPage([childId])
      editor.putContentOntoCurrentPage(content, { point: { x: 3200, y: 1800 }, select: true })
      return null
    })()`)
    await delay(1400)
    check('lone.offsets', 'pasting one projected occurrence alone leaves the region’s offsets empty',
      (await regionState(page, REGION)).offsets, loneBefore.offsets)
    check('lone.kids', 'and the region keeps exactly its own children, where they were',
      (await regionState(page, REGION)).kids, loneBefore.kids)

    /* ---- the Dataflow lens: no cable may cross regions -------------------- */
    await seed(page, port, 'dataflow')
    const dataflowBefore = await regionState(page, REGION)
    const cablesBefore = await cableSpans(page)
    check('dataflow.cables', 'the lens wires real cables', cablesBefore.length > 0, true)
    check('dataflow.contained', 'each of which lives inside one region',
      cablesBefore.filter((cable) => cable.regions !== 1).length, 0)

    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await delay(200)
    await shortcut(page, 'd', 'KeyD', 2)
    await delay(1600)
    const dataflowRegions = await regionIds(page)
    check('dataflow.regions', 'Ctrl+D under the lens leaves two regions', dataflowRegions.length, 2)
    await assertCopyIsIndependent(page, 'dataflow', dataflowBefore, dataflowRegions.find((id) => id !== REGION))
    const cablesAfter = await cableSpans(page)
    check('dataflow.cables.count', 'and twice the cables', cablesAfter.length, cablesBefore.length * 2)
    check('dataflow.cables.contained', 'with no cable bound across the two regions',
      cablesAfter.filter((cable) => cable.regions !== 1 || cable.ends !== 2).length, 0)
    await shot(page, 'after-dataflow-duplicate.png')

    check('console', 'no local console errors', readConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-identity-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-identity-failed-${entry.name}`), entry.data)
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
