/**
 * Process view drag-to-reorder, driven in a real browser — the port Zach
 * directed after reviewing the Tree lane live ("I'm confident that you're on
 * the right path to make it work for the process view", 2026-09-06).
 *
 * Same ownership contract as Tree view, proven the same way, against the
 * Flowstate grammar:
 *   1. a rail step's drag is dnd-kit's whole (select.idle mid-drag, the
 *      editor-scoped signal set) and commits a live reorder of the steps;
 *      the whole drag is one undo;
 *   2. a rail step dropped among the recovery lane's cards reparents into
 *      the Fallback's list — the ancestor/containment adjudication working
 *      across Process's nested boxes;
 *   3. Escape mid-drag restores the exact pre-drag tree;
 *   4. Auto layout OFF is native tldraw with free offsets — and the toggle
 *      itself now exists for Process (one arrangement contract, both views).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-process-drag')
const REGION = 'shape:bt-process-drag'

const results = []
const pending = []
let journeyError = null

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`))
  return ok
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  pending.push({ name, data: Buffer.from(capture.data, 'base64') })
}

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)
const regionProp = (page, key) => evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('${REGION}')?.props.${key} ?? null)`).then(JSON.parse)
const editorPath = (page) => evaluate(page, `window.__systemsketch.editor.getPath()`)
const dndSignal = (page) => evaluate(page, `JSON.stringify(window.__systemsketch.behaviorTree.dndDrag())`).then(JSON.parse)

const rootChildIds = (page) => evaluate(page, `JSON.stringify((() => {
  const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
  const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace')
  return tree.root.children.map((child) => child.id)
})())`).then(JSON.parse)

const fallbackChildIds = (page) => evaluate(page, `JSON.stringify((() => {
  const doc = window.__systemsketch.behaviorTree.parse(window.__systemsketch.editor.getShape('${REGION}').props.xml)
  const tree = window.__systemsketch.behaviorTree.selectTree(doc, 'PickAndPlace')
  const fallback = tree.root.children.find((child) => child.tag === 'Fallback')
  return fallback ? fallback.children.map((child) => child.id) : null
})())`).then(JSON.parse)

async function createRegion(page, xml) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 120, props: { projection: 'process', orientation: 'down', nodeFace: 'simple', xml: ${JSON.stringify(xml)}, title: 'Process drag' } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length > 0`, 'the region to project')
  await delay(300)
}

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 60, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function nodeInfo(page, path) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
    })
    if (!id) return null
    const bounds = editor.getShapePageBounds(id)
    const centre = editor.pageToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 })
    return { id, centre: { x: centre.x, y: centre.y }, heightPx: bounds.height * editor.getZoomLevel() }
  })())`))
}

async function slowDrag(page, from, to, steps, onStep) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  await delay(60)
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + (to.x - from.x) * step / steps
    const y = from.y + (to.y - from.y) * step / steps
    await mouse(page, 'mouseMoved', x, y, { buttons: 1 })
    await delay(40)
    if (onStep) await onStep(step, { x, y })
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(350)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-process-drag', build: 'bt-process-drag-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)
    const sampleXml = await evaluate(page, 'window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML')

    // ==================================================================
    // 1. A rail step's drag: dnd-owned, live reorder, one undo.
    // ==================================================================
    await createRegion(page, sampleXml)
    await fitRegion(page)
    check('setup.tidy', 'a Process region starts with Auto layout on', await regionProp(page, 'arrangement'), 'tidy')
    const xmlBefore = await regionXml(page)
    const closeGrip = await nodeInfo(page, '0.2')
    const moveHome = await nodeInfo(page, '0.3')
    const samples = []
    await slowDrag(page, closeGrip.centre, { x: closeGrip.centre.x, y: moveHome.centre.y + moveHome.heightPx * 0.45 }, 10, async (step) => {
      if (step === 6) {
        samples.push({ path: await editorPath(page), dnd: (await dndSignal(page)) !== null })
        await shot(page, 'process-dnd-mid-drag.png')
      }
    })
    check('rail.dnd-owner', 'mid-drag the select tool is idle and the dnd signal is set — dnd-kit owns the Process gesture',
      samples, [{ path: 'select.idle', dnd: true }])
    check('rail.reordered', 'the two rail steps swapped', await rootChildIds(page), ['SubTree', 'Fallback', 'MoveHome', 'CloseGrip', 'Parallel'])
    const xmlAfterSwap = await regionXml(page)
    check('rail.xml-changed', 'a real structural change committed', xmlAfterSwap === xmlBefore, false)
    await evaluate(page, `(window.__systemsketch.editor.undo(), null)`)
    await delay(300)
    check('rail.one-undo', 'the whole drag is one undo step', await regionXml(page), xmlBefore)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 2. Reparent: a rail step dropped among the recovery lane's cards
    //    joins the Fallback's list.
    // ==================================================================
    await createRegion(page, sampleXml)
    await fitRegion(page)
    const dragged = await nodeInfo(page, '0.3')
    const lane = await nodeInfo(page, '0.1.1')
    await slowDrag(page, dragged.centre, { x: lane.centre.x + 40, y: lane.centre.y }, 12)
    await shot(page, 'process-reparent-after.png')
    const fallbackAfter = await fallbackChildIds(page)
    check('lane.reparented', "the step joined the Fallback's list with the original arms intact, in order",
      {
        joined: fallbackAfter.includes('MoveHome'),
        count: fallbackAfter.length,
        originalsInOrder: fallbackAfter.filter((id) => id !== 'MoveHome'),
      },
      { joined: true, count: 3, originalsInOrder: ['GraspValid', 'CorrectGrip'] })
    check('lane.signal-cleared', 'the dnd signal clears on release', await dndSignal(page), null)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 3. Escape mid-drag restores the pre-drag tree.
    // ==================================================================
    await createRegion(page, sampleXml)
    await fitRegion(page)
    const xmlBeforeEscape = await regionXml(page)
    const escNode = await nodeInfo(page, '0.2')
    const escTarget = await nodeInfo(page, '0.3')
    await mouse(page, 'mouseMoved', escNode.centre.x, escNode.centre.y)
    await mouse(page, 'mousePressed', escNode.centre.x, escNode.centre.y, { buttons: 1 })
    for (let step = 1; step <= 6; step += 1) {
      await mouse(page, 'mouseMoved', escNode.centre.x, escNode.centre.y + (escTarget.centre.y + 60 - escNode.centre.y) * step / 6, { buttons: 1 })
      await delay(40)
    }
    const dndBeforeEscape = await dndSignal(page)
    await key(page, 'Escape', 'Escape')
    await delay(200)
    await mouse(page, 'mouseReleased', escNode.centre.x, escTarget.centre.y + 60)
    await delay(300)
    check('escape.was-dnd', 'the gesture was a live dnd drag before Escape', dndBeforeEscape !== null, true)
    check('escape.xml-restored', 'Escape restores the exact pre-drag tree', await regionXml(page), xmlBeforeEscape)
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)

    // ==================================================================
    // 4. Auto layout OFF: the toggle exists for Process now, and a drag
    //    is native tldraw recording a free offset.
    // ==================================================================
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-auto-layout-toggle"]'))`, 'the Auto layout control for Process')
    await clickElement(page, '[data-testid="bt-auto-layout-toggle"]')
    await delay(200)
    check('off.toggled', 'the Process region flips to free', await regionProp(page, 'arrangement'), 'free')
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    const xmlBeforeFree = await regionXml(page)
    const freeNode = await nodeInfo(page, '0.2')
    const freeSamples = []
    await slowDrag(page, freeNode.centre, { x: freeNode.centre.x + 120, y: freeNode.centre.y + 60 }, 8, async (step) => {
      if (step === 4) freeSamples.push({ path: await editorPath(page), dnd: await dndSignal(page) })
    })
    check('off.native-owner', 'with Auto layout off, tldraw translates and the dnd signal stays null',
      freeSamples, [{ path: 'select.translating', dnd: null }])
    check('off.offset-recorded', 'the drag records a free offset', Object.keys(await regionProp(page, 'offsets')), ['0.2'])
    check('off.xml-untouched', 'a free drag never touches the XML', await regionXml(page), xmlBeforeFree)

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-process-drag-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-process-drag-failed-${entry.name}`), entry.data)
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
