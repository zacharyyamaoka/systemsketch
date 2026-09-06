#!/usr/bin/env node
/**
 * Real-browser proof that the registry-driven detach sweep composes.
 *
 * The historical suites detached composites in their narrowest states — the
 * Behavior Tree case never had a cable or pill on the board, and no case put a
 * *registered* kind inside a region. This journey detaches composites with
 * their real contents present:
 *
 *   1. a Behavior Tree region in its Dataflow lens — projected cables and
 *      unbundle pills live — carrying a person's own Code block and a plain
 *      annotation rectangle; everything the region owned lowers, the Code
 *      block lowers through its own kind (the old code left it as a custom
 *      record inside a stock frame), the annotation survives, one undo puts
 *      the region back;
 *   2. a Branch wired to an unselected Block and holding a foreign star —
 *      the cable lowers while both ends stand, the wired control keeps its
 *      filled core, the star is preserved inside the group;
 *   3. a Block and a Loop wired together, both selected — the finalize phase
 *      clears the arrow's Block-rebuild promise because one end became a
 *      container card;
 *   4. a lone Code block through its own context menu — newly detachable.
 */
import { join } from 'node:path'

import {
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box } from './block_journey_helpers.mjs'

let passed = 0
let failed = 0
function check(id, description, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  if (ok) passed += 1
  else failed += 1
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${id}: ${description}`)
  if (!ok) {
    console.log(`        observed ${JSON.stringify(observed)}`)
    console.log(`        desired  ${JSON.stringify(desired)}`)
  }
}

const state = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const shapes = editor.getCurrentPageShapes()
  const types = {}
  for (const shape of shapes) types[shape.type] = (types[shape.type] ?? 0) + 1
  return {
    types,
    stamped: shapes.filter((shape) => shape.meta.btRegion !== undefined || shape.meta.btRole !== undefined).length,
  }
})())`).then(JSON.parse)

const descendantsOf = (page, id) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const out = []
  const visit = (parentId) => {
    for (const childId of editor.getSortedChildIdsForParent(parentId)) {
      const shape = editor.getShape(childId)
      if (!shape) continue
      out.push({
        id: shape.id,
        type: shape.type,
        geo: shape.props?.geo ?? null,
        w: shape.props?.w ?? null,
        kind: shape.meta?.systemSketch?.kind ?? null,
        rebuildWithBlocks: shape.meta?.systemSketch?.rebuildWithBlocks ?? null,
      })
      visit(childId)
    }
  }
  visit(${JSON.stringify(id)})
  return out
})())`).then(JSON.parse)

async function detachViaMenu(page, targetPoint) {
  await clickAt(page, targetPoint.x, targetPoint.y, 'right')
  const selector = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Detach to primitives')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
}

const screenPointOn = (page, id, insetY = 22) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  const bounds = editor.getShapePageBounds(${JSON.stringify(id)})
  return editor.pageToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY + ${insetY} })
})())`).then(JSON.parse)

async function clearBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.selectNone()
    return null
  })()`)
  await delay(250)
}

/* ------------------------- 1. region with contents ------------------------- */

async function regionCase(page) {
  await clearBoard(page)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShape({ id: 'shape:h-region', type: 'behaviorTree', x: 200, y: 200,
      props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace', dataLens: 'dataflow' } })
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('shape:h-region').length >= 10`, 'the tree to project')
  await delay(500)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    // A person's own work inside the region: a registered kind and a plain one.
    editor.createShapes([
      { id: 'shape:h-code', type: 'code', parentId: 'shape:h-region', x: 40, y: 620,
        props: { code: 'retries = 3', w: 220, h: 110 } },
      { id: 'shape:h-note', type: 'geo', parentId: 'shape:h-region', x: 300, y: 620,
        props: { geo: 'rectangle', w: 140, h: 80, color: 'orange', fill: 'none' } },
    ])
    editor.zoomToBounds(editor.getShapePageBounds('shape:h-region'), { inset: 70, animation: { duration: 0 } })
    editor.selectNone()
    return null
  })()`)
  await delay(400)

  const before = await state(page)
  check('region.lens', 'the Dataflow lens projects real cables onto the board',
    (before.types.connection ?? 0) > 0, true)
  const pillCount = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .filter((shape) => shape.meta.btRole === 'unbundle' || shape.meta.btRole === 'key').length`)
  check('region.pills', 'and Blackboard/unbundle pills as real Blocks', pillCount > 0, true)

  await detachViaMenu(page, await screenPointOn(page, 'shape:h-region'))
  await waitFor(page, `!window.__systemsketch.editor.getShape('shape:h-region')`, 'the region to lower')
  await delay(400)

  const after = await state(page)
  check('region.stock', 'no custom record survives the region detach',
    ['behaviorTree', 'behaviorTreeControl', 'block', 'connection', 'code', 'branch', 'loop']
      .filter((type) => (after.types[type] ?? 0) > 0), [])
  check('region.unstamped', 'no region stamp survives either', after.stamped, 0)

  const frameId = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .find((shape) => shape.type === 'frame' && shape.meta?.systemSketch?.kind === 'behavior-tree')?.id ?? null`)
  check('region.frame', 'the region became the remembering stock frame', Boolean(frameId), true)
  const family = await descendantsOf(page, frameId)
  check('region.cables', 'projected cables became stock arrows inside the frame, promising no Block rebuild',
    family.some((shape) => shape.type === 'arrow' && shape.kind === 'connection' && shape.rebuildWithBlocks === false), true)
  check('region.blocks', 'projected occurrences became remembered stock groups inside the frame',
    family.some((shape) => shape.type === 'group' && shape.kind === 'block'), true)
  check('region.code', "the person's Code block lowered through its own kind, inside the frame",
    family.some((shape) => shape.type === 'group' && shape.kind === 'code'), true)
  check('region.note', "the person's annotation survives inside the frame",
    family.some((shape) => shape.type === 'geo' && shape.geo === 'rectangle' && shape.w === 140), true)

  await shortcut(page, 'z', 'KeyZ', 2)
  await delay(500)
  const undone = await state(page)
  check('region.undo', 'one undo restores the region, the Code block, and the annotation', {
    region: await evaluate(page, `Boolean(window.__systemsketch.editor.getShape('shape:h-region'))`),
    code: await evaluate(page, `window.__systemsketch.editor.getShape('shape:h-code')?.type ?? null`),
    note: await evaluate(page, `window.__systemsketch.editor.getShape('shape:h-note')?.type ?? null`),
    frames: undone.types.frame ?? 0,
  }, { region: true, code: 'code', note: 'geo', frames: 0 })
}

/* --------------------- 2. branch with star and cable ---------------------- */

async function branchCase(page) {
  await clearBoard(page)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      { id: 'shape:h-branch', type: 'branch', x: 560, y: 160, props: {
        w: 360, h: 260, title: 'Choose path', view: 'expanded', activeArmId: 'yes',
        controls: [{ id: 'predicate', name: 'is valid', type: 'bool' }],
        arms: [{ id: 'yes', title: 'yes', open: true, h: 92 }, { id: 'no', title: 'no', open: false, h: 62 }],
      } },
      { id: 'shape:h-star', type: 'geo', parentId: 'shape:h-branch', x: 80, y: 120,
        props: { geo: 'star', w: 60, h: 60, color: 'yellow', fill: 'solid' } },
      { id: 'shape:h-feeder', type: 'block', x: 120, y: 200, props: {
        title: 'decide()', view: 'port', inputs: [],
        outputs: [{ id: 'out', name: 'ok', type: 'bool', visible: true }],
      } },
      { id: 'shape:h-wire', type: 'connection', x: 0, y: 0, props: {
        start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', temporal: 'data',
        curve: null, pins: [], elbowRoute: null,
      } },
    ])
    editor.createBindings([
      { type: 'connection', fromId: 'shape:h-wire', toId: 'shape:h-feeder', props: { portId: 'out', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: 'shape:h-wire', toId: 'shape:h-branch', props: { portId: 'predicate', terminal: 'end', face: 'outer' } },
    ])
    editor.zoomToFit({ animation: { duration: 0 } })
    editor.setSelectedShapes(['shape:h-branch'])
    return null
  })()`)
  await delay(500)

  await detachViaMenu(page, await screenPointOn(page, 'shape:h-branch'))
  await waitFor(page, `!window.__systemsketch.editor.getShape('shape:h-branch')`, 'the branch to lower')
  await delay(300)

  check('branch.feeder', 'the unselected feeder Block stays semantic',
    await evaluate(page, `window.__systemsketch.editor.getShape('shape:h-feeder')?.type ?? null`), 'block')
  const groupId = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'branch')?.id ?? null`)
  check('branch.group', 'the branch became the remembering stock group', Boolean(groupId), true)
  const family = await descendantsOf(page, groupId)
  check('branch.star', "the person's star survives inside the group",
    family.some((shape) => shape.geo === 'star'), true)
  check('branch.core', 'the wired control keeps its filled 12px core',
    family.some((shape) => shape.geo === 'ellipse' && shape.w === 12), true)
  const arrow = await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const record = editor.getCurrentPageShapes().find((shape) => shape.type === 'arrow')
    if (!record) return null
    const bindings = editor.getBindingsFromShape(record.id, 'arrow').map((binding) => editor.getShape(binding.toId)?.type ?? null)
    return { rebuildWithBlocks: record.meta?.systemSketch?.rebuildWithBlocks ?? null, boundTo: bindings.sort() }
  })())`).then(JSON.parse)
  check('branch.cable', 'the cable lowered while both ends stood: a stock arrow bound to the live Block and the stock card, promising no rebuild',
    arrow, { rebuildWithBlocks: false, boundTo: ['block', 'geo'] })
}

/* ----------------------- 3. block + loop, both selected -------------------- */

async function mixedCase(page) {
  await clearBoard(page)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      { id: 'shape:h-source', type: 'block', x: 120, y: 200, props: {
        title: 'detect()', view: 'port', inputs: [],
        outputs: [{ id: 'out', name: 'detections', type: 'Detections', visible: true }],
      } },
      { id: 'shape:h-loop', type: 'loop', x: 640, y: 160, props: {
        w: 420, h: 220, title: 'For every detection',
        iterable: { id: 'iterable', type: 'Detections' }, item: { id: 'item', type: 'Detection' },
        turn: '',
      } },
      { id: 'shape:h-mixed-wire', type: 'connection', x: 0, y: 0, props: {
        start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', temporal: 'data',
        curve: null, pins: [], elbowRoute: null,
      } },
    ])
    editor.createBindings([
      { type: 'connection', fromId: 'shape:h-mixed-wire', toId: 'shape:h-source', props: { portId: 'out', terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: 'shape:h-mixed-wire', toId: 'shape:h-loop', props: { portId: 'iterable', terminal: 'end', face: 'outer' } },
    ])
    editor.zoomToFit({ animation: { duration: 0 } })
    editor.setSelectedShapes(['shape:h-source', 'shape:h-loop'])
    return null
  })()`)
  await delay(500)

  await detachViaMenu(page, await screenPointOn(page, 'shape:h-source', 40))
  await waitFor(page, `!window.__systemsketch.editor.getShape('shape:h-source')
    && !window.__systemsketch.editor.getShape('shape:h-loop')`, 'both subjects to lower')
  await delay(300)

  const loopGroupId = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'loop')?.id ?? null`)
  const loopFamily = await descendantsOf(page, loopGroupId)
  check('mixed.core', 'the loop keeps the filled core for the port whose cable went down with the Block',
    loopFamily.some((shape) => shape.geo === 'ellipse' && shape.w === 12), true)
  const arrow = await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const record = editor.getCurrentPageShapes().find((shape) => shape.type === 'arrow')
    if (!record) return null
    return {
      rebuildWithBlocks: record.meta?.systemSketch?.rebuildWithBlocks ?? null,
      ends: editor.getBindingsFromShape(record.id, 'arrow').length,
    }
  })())`).then(JSON.parse)
  check('mixed.finalize', 'the Block-claimed cable became an arrow bound at both ends, and finalize cleared the rebuild promise because one end is a container card',
    arrow, { rebuildWithBlocks: false, ends: 2 })
}

/* ------------------------------- 4. lone code ------------------------------ */

async function codeCase(page) {
  await clearBoard(page)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShape({ id: 'shape:h-lone-code', type: 'code', x: 300, y: 220,
      props: { code: 'threshold = 0.5', w: 260, h: 120 } })
    editor.zoomToFit({ animation: { duration: 0 } })
    editor.setSelectedShapes(['shape:h-lone-code'])
    return null
  })()`)
  await delay(400)

  await detachViaMenu(page, await screenPointOn(page, 'shape:h-lone-code', 40))
  await waitFor(page, `!window.__systemsketch.editor.getShape('shape:h-lone-code')`, 'the code block to lower')
  await delay(300)

  const group = await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const record = editor.getCurrentPageShapes().find((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'code')
    if (!record) return null
    const children = editor.getSortedChildIdsForParent(record.id).map((id) => editor.getShape(id)?.type)
    const text = editor.getCurrentPageShapes().find((shape) => shape.type === 'text')
    return {
      children: children.sort(),
      rememberedCode: record.meta.systemSketch.props?.code ?? null,
      paintedText: JSON.stringify(text?.props?.richText ?? null).includes('threshold = 0.5'),
    }
  })())`).then(JSON.parse)
  check('code.group', 'a lone Code block detaches from its own menu into a remembering stock group with the authored literal painted',
    group, { children: ['geo', 'text'], rememberedCode: 'threshold = 0.5', paintedText: true })

  await shortcut(page, 'z', 'KeyZ', 2)
  await delay(400)
  check('code.undo', 'one undo puts the Code block back',
    await evaluate(page, `window.__systemsketch.editor.getShape('shape:h-lone-code')?.type ?? null`), 'code')
}

/* ---------------------------------- main ----------------------------------- */

async function main() {
  const app = await startApp({ label: 'detach-hierarchy', build: 'detach-hierarchy', width: 1480, height: 980 })
  const { page, port, filesRoot } = app
  try {
    await openApp(page, port, `?board=${encodeURIComponent(join(filesRoot, 'SystemSketch', 'Detach hierarchy.systemsketch'))}`)
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(500)

    await regionCase(page)
    await branchCase(page)
    await mixedCase(page)
    await codeCase(page)

    check('console', 'no local console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }
  console.log(`\n${passed}/${passed + failed} checks passed`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
