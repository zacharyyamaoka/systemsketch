#!/usr/bin/env node
/**
 * Adversarial real-browser proof for communication association and focus.
 *
 * Several Actions and Services share one component pair; Action and Service
 * also deliberately reuse the `status` stem. The visible A/S reference IDs,
 * strict unresolved cases, click focus, and constituent-track reveal are all
 * asserted against the real SystemSketch canvas without mutating its graph.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'communication-association-focus')
const RESULTS = join(ASSETS, 'acceptance.json')
const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  const sizes = (w, h) => ({
    simple: { w: 320, h: 190 }, port: { w, h }, expanded: { w: 620, h: 440 }, value: { w: 168, h: 56 },
  })
  const port = (id, name, type = 'Message') => ({ id, name, type, visible: true })
  const block = (id, x, y, title, blockType, inputs, outputs, w, h) => ({
    id: 'shape:' + id, type: 'block', x, y,
    props: {
      title, description: '', blockType, view: 'port', w, h, views: sizes(w, h),
      showDescription: false, portLayout: 'inline', state: 'normal', inputs, outputs,
    },
  })
  const missionInputs = [
    ['move_feedback', 'move.feedback'], ['move_result', 'move.result'],
    ['dock_feedback', 'dock.feedback'], ['dock_result', 'dock.result'],
    ['status_action_result', 'status.result'], ['pose_response', 'pose.response'],
    ['health_reply', 'health.reply'], ['status_service_response', 'status.response'],
  ].map(([id, name]) => port(id, name))
  const missionOutputs = [
    ['move_goal', 'move.goal'], ['move_cancel', 'move.cancel'], ['dock_goal', 'dock.goal'],
    ['status_action_goal', 'status.goal'], ['pose_request', 'pose.request'],
    ['health_query', 'health.query'], ['status_service_request', 'status.request'],
    ['bare_goal', 'goal'], ['conflict_move', 'move.goal'],
  ].map(([id, name]) => port(id, name))
  const runtimeInputs = [
    ['move_goal', 'move.goal'], ['move_cancel', 'move.cancel'], ['dock_goal', 'dock.goal'],
    ['status_action_goal', 'status.goal'], ['pose_request', 'pose.request'],
    ['health_query', 'health.query'], ['status_service_request', 'status.request'],
    ['super_pose_request', 'pose.request'], ['bare_goal', 'goal'], ['conflict_dock', 'dock.goal'],
  ].map(([id, name]) => port(id, name))
  const runtimeOutputs = [
    ['move_feedback', 'move.feedback'], ['move_result', 'move.result'],
    ['dock_feedback', 'dock.feedback'], ['dock_result', 'dock.result'],
    ['status_action_result', 'status.result'], ['pose_response', 'pose.response'],
    ['health_reply', 'health.reply'], ['status_service_response', 'status.response'],
    ['super_pose_response', 'pose.response'], ['telemetry', 'telemetry'], ['scene_stream', 'scene.stream'],
  ].map(([id, name]) => port(id, name))
  const blocks = [
    block('mission', 120, 190, 'Mission Orchestrator', 'action + service client', missionInputs, missionOutputs, 470, 660),
    block('runtime', 830, 150, 'Robot Runtime', 'action + service server', runtimeInputs, runtimeOutputs, 500, 720),
    block('supervisor', 1570, 230, 'Supervisor', 'service client', [port('pose_response', 'pose.response')], [port('pose_request', 'pose.request')], 360, 220),
    block('dashboard', 1570, 620, 'Operations UI', 'topic + stream sink', [port('telemetry', 'telemetry'), port('scene_stream', 'scene.stream')], [], 360, 250),
  ]
  const edges = [
    ['move_goal', 'mission', 'move_goal', 'runtime', 'move_goal'],
    ['move_cancel', 'mission', 'move_cancel', 'runtime', 'move_cancel'],
    ['move_feedback', 'runtime', 'move_feedback', 'mission', 'move_feedback'],
    ['move_result', 'runtime', 'move_result', 'mission', 'move_result'],
    ['dock_goal', 'mission', 'dock_goal', 'runtime', 'dock_goal'],
    ['dock_feedback', 'runtime', 'dock_feedback', 'mission', 'dock_feedback'],
    ['dock_result', 'runtime', 'dock_result', 'mission', 'dock_result'],
    ['status_action_goal', 'mission', 'status_action_goal', 'runtime', 'status_action_goal'],
    ['status_action_result', 'runtime', 'status_action_result', 'mission', 'status_action_result'],
    ['pose_request', 'mission', 'pose_request', 'runtime', 'pose_request'],
    ['pose_response', 'runtime', 'pose_response', 'mission', 'pose_response'],
    ['health_request', 'mission', 'health_query', 'runtime', 'health_query'],
    ['health_response', 'runtime', 'health_reply', 'mission', 'health_reply'],
    ['status_service_request', 'mission', 'status_service_request', 'runtime', 'status_service_request'],
    ['status_service_response', 'runtime', 'status_service_response', 'mission', 'status_service_response'],
    ['super_pose_request', 'supervisor', 'pose_request', 'runtime', 'super_pose_request'],
    ['super_pose_response', 'runtime', 'super_pose_response', 'supervisor', 'pose_response'],
    ['telemetry', 'runtime', 'telemetry', 'dashboard', 'telemetry'],
    ['scene_stream', 'runtime', 'scene_stream', 'dashboard', 'scene_stream'],
    ['bare_goal', 'mission', 'bare_goal', 'runtime', 'bare_goal'],
    ['conflicting_claims', 'mission', 'conflict_move', 'runtime', 'conflict_dock'],
  ].map(([id, source, sourcePort, target, targetPort]) => ({
    id: 'shape:edge_' + id,
    source: 'shape:' + source,
    target: 'shape:' + target,
    sourcePort,
    targetPort,
    shape: {
      id: 'shape:edge_' + id, type: 'connection', x: 0, y: 0,
      props: {
        start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow', curve: null,
        pins: [], elbowRoute: null, routeMode: 'automatic', temporal: 'data', delayValue: '', pillPosition: .5,
        tunnel: false, tunnelLayer: '', state: 'normal',
      },
    },
  }))
  editor.run(() => {
    editor.createShapes(blocks)
    editor.createShapes(edges.map((edge) => edge.shape))
    editor.createBindings(edges.flatMap((edge) => [
      { type: 'connection', fromId: edge.id, toId: edge.source,
        props: { portId: edge.sourcePort, terminal: 'start', face: 'outer' } },
      { type: 'connection', fromId: edge.id, toId: edge.target,
        props: { portId: edge.targetPort, terminal: 'end', face: 'outer' } },
    ]))
  })
  editor.selectNone()
  editor.zoomToFit({ animation: { duration: 0 }, inset: 150 })
  return true
})()`

async function storedGraph(page) {
  return evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes())`)
}

async function projectionState(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const roots = [...document.querySelectorAll('[data-communication-mode]')]
    const tagged = roots.filter((node) => node.dataset.communicationMode === 'tagged')
    const components = roots.filter((node) => node.dataset.communicationMode === 'components')
    const members = roots.filter((node) => node.dataset.communicationMode === 'focus-member')
    const counts = (nodes) => nodes.reduce((result, node) => {
      const id = node.dataset.communicationId
      result[id] = (result[id] ?? 0) + 1
      return result
    }, {})
    return {
      mode: document.querySelector('[data-testid="communication-prototype-controls"]')?.dataset.projectionMode,
      tagged: tagged.length,
      components: components.length,
      members: members.length,
      taggedIds: counts(tagged),
      componentIds: components.map((node) => node.dataset.communicationId).sort(),
      memberIds: members.map((node) => node.dataset.communicationId),
      active: roots.filter((node) => node.dataset.communicationFocus === 'active').length,
      dim: roots.filter((node) => node.dataset.communicationFocus === 'dim').length,
      none: roots.filter((node) => node.dataset.communicationFocus === 'none').length,
      activeIds: [...new Set(roots.filter((node) => node.dataset.communicationFocus === 'active')
        .map((node) => node.dataset.communicationId))],
      neutralDim: document.querySelectorAll('[data-communication-neutral-focus="dim"]').length,
      status: document.querySelector('[data-testid="communication-prototype-status"]')?.textContent ?? '',
      relationshipMembers: Object.fromEntries(components.map((node) => [
        node.dataset.communicationId,
        (node.dataset.communicationMemberIds ?? '').split(',').filter(Boolean).length,
      ])),
    }
  })())`))
}

/**
 * Press a relationship's own stroke.
 *
 * The midpoint alone is not safe: several relationships between one pair of
 * cards run as parallel channels whose LABEL pills all sit near the middle, so
 * a midpoint press can land on a neighbour's pill and focus the wrong one.
 * Sample along the path and take the first point that actually hit-tests back
 * to this relationship.
 */
async function clickRelationship(page, id, mode = 'components') {
  const point = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const root = [...document.querySelectorAll('[data-communication-mode="${mode}"]')]
      .find((node) => node.dataset.communicationId === ${JSON.stringify(id)})
    const path = root?.querySelector('[data-communication-focus-hit]')
    if (!path || !path.getTotalLength || !path.getScreenCTM) return null
    // Aim at the label pill, unconditionally, and do NOT check what is painted
    // on top of it. Several relationships between one pair of cards share a
    // long corridor — in Simple view they leave the same edge midpoint — so the
    // last arrow painted covers every other one's pill. The product rule is
    // that a pill always wins its own click; clicking only where a relationship
    // happened to be topmost is what hid that bug for as long as it existed.
    const label = root.querySelector('[data-communication-label]')
    if (label) {
      const box = label.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    const length = path.getTotalLength()
    const ctm = path.getScreenCTM()
    const fractions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85]
    let fallback = null
    for (const fraction of fractions) {
      const local = path.getPointAtLength(length * fraction)
      const screen = new DOMPoint(local.x, local.y).matrixTransform(ctm)
      const candidate = { x: screen.x, y: screen.y }
      if (!fallback) fallback = candidate
      const hit = document.elementFromPoint(candidate.x, candidate.y)
      if (hit && root.contains(hit)) return candidate
    }
    return fallback
  })())`))
  if (!point) throw new Error(`Missing ${mode} relationship ${id}`)
  await clickAt(page, point.x, point.y)
}

async function clickShapeCenter(page, shapeId) {
  const point = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    return bounds ? editor.pageToViewport(bounds.center) : null
  })())`))
  if (!point) throw new Error(`Missing shape ${shapeId}`)
  await clickAt(page, point.x, point.y)
}

async function clickBlankCanvas(page) {
  const point = JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const canvas = document.querySelector('.tl-canvas')
    const rect = canvas?.getBoundingClientRect()
    if (!canvas || !rect) return null
    for (let y = Math.min(rect.bottom - 120, 1040); y >= rect.top + 140; y -= 70) {
      for (let x = rect.left + 120; x <= Math.min(rect.right - 120, 1680); x += 90) {
        const target = document.elementFromPoint(x, y)
        const pagePoint = editor.screenToPage({ x, y })
        if (target?.closest('.tl-canvas') && !editor.getShapeAtPoint(pagePoint, { hitInside: true })) {
          return { x, y }
        }
      }
    }
    return null
  })())`))
  if (!point) throw new Error('Missing blank canvas point')
  await clickAt(page, point.x, point.y)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-communication-association-focus',
    build: 'communication-association-focus',
    width: 2200,
    height: 1200,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'communication-association-focus.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?prototype=communication&board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'association board editor', 30_000)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'communication controls')
    await evaluate(app.page, SEED)
    await delay(900)
    const before = await storedGraph(app.page)
    pass('adversarial board opens with 21 canonical data edges and no projection metadata')
    await shot(app.page, '01-adversarial-dataflow.png')

    await clickElement(app.page, '[data-testid="communication-cables-split"]')
    await delay(500)
    let state = await projectionState(app.page)
    assert.equal(state.tagged, 19)
    assert.deepEqual(state.taggedIds, {
      A1: 3, A2: 4, A3: 2,
      S1: 2, S2: 2, S3: 2, S4: 2,
      ST1: 1, T1: 1,
    })
    assert.match(state.status, /2 issues/)
    pass('strict grouping assigns stable repeated IDs while two ambiguous legs remain neutral and diagnosed')
    await shot(app.page, '02-tagged-reference-ids.png')

    await clickRelationship(app.page, 'A2', 'tagged')
    await delay(350)
    state = await projectionState(app.page)
    assert.equal(state.active, 4)
    assert.equal(state.dim, 15)
    assert.equal(state.neutralDim, 2)
    assert.deepEqual(state.activeIds, ['A2'])
    assert.match(state.status, /A2 focused · 4 legs/)
    assert.equal(JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`)).length, 1)
    pass('clicking one A2 leg focuses all four A2 legs and dims every unrelated edge, including unresolved wiring')
    await shot(app.page, '03-tagged-a2-focus.png')

    await clickBlankCanvas(app.page)
    await delay(350)
    state = await projectionState(app.page)
    assert.equal(state.active, 0)
    assert.equal(state.dim, 0)
    assert.equal(state.neutralDim, 0)
    assert.deepEqual(JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`)), [])
    pass('selecting blank canvas clears the active communication focus')
    await shot(app.page, '03b-canvas-dismisses-focus.png')

    await clickRelationship(app.page, 'A2', 'tagged')
    await clickRelationship(app.page, 'S1', 'tagged')
    await delay(350)
    state = await projectionState(app.page)
    assert.deepEqual(state.activeIds, ['S1'])
    assert.match(state.status, /S1 focused · 2 legs/)
    pass('selecting another communication edge transfers focus to its relationship')

    await clickShapeCenter(app.page, 'shape:dashboard')
    await delay(350)
    state = await projectionState(app.page)
    assert.equal(state.active, 0)
    assert.equal(state.dim, 0)
    assert.deepEqual(JSON.parse(await evaluate(app.page,
      `JSON.stringify(window.__systemsketch.editor.getSelectedShapeIds())`)), ['shape:dashboard'])
    pass('selecting a component clears communication focus while preserving the new selection')
    await shot(app.page, '03c-component-dismisses-focus.png')

    // The communication lens is always Summary now and offers no cable control,
    // so entering the lens IS the summary choice. (Leaving this click in was a
    // deterministic break an adversarial audit caught.)
    await clickElement(app.page, '[data-testid="communication-lens-communication"]')
    await delay(550)
    state = await projectionState(app.page)
    assert.equal(state.components, 9)
    assert.deepEqual(state.componentIds, ['A1', 'A2', 'A3', 'S1', 'S2', 'S3', 'S4', 'ST1', 'T1'])
    assert.deepEqual(state.relationshipMembers, {
      A1: 3, A2: 4, A3: 2,
      S1: 2, S2: 2, S3: 2, S4: 2,
      ST1: 1, T1: 1,
    })
    pass('Components collapses the same graph into nine enumerated relationships without namespace collisions')
    await shot(app.page, '04-components-enumerated.png')

    // Every pill has to be readable and aimable: clear of its own endpoint
    // cards, which paint OVER a cable, and clear of every other pill. Both
    // failed before — `S1 · service · robot` rendered as `S1 · service ·` with
    // its tail behind a card, and `A2` sat under `A3` where it could not be
    // clicked at all.
    const pills = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const cards = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'block')
        .map((shape) => {
          const bounds = editor.getShapePageBounds(shape.id)
          const a = editor.pageToViewport({ x: bounds.minX, y: bounds.minY })
          const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
          return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }
        })
      return [...document.querySelectorAll('[data-communication-mode="components"] [data-communication-label]')]
        .map((node) => {
          const box = node.getBoundingClientRect()
          const rect = { minX: box.x, minY: box.y, maxX: box.right, maxY: box.bottom }
          const overlaps = (other) => rect.minX < other.maxX && other.minX < rect.maxX
            && rect.minY < other.maxY && other.minY < rect.maxY
          return {
            id: node.dataset.communicationLabel,
            rect,
            underCard: cards.some(overlaps),
          }
        })
    })())`))
    assert.equal(pills.length, 9, JSON.stringify(pills.map((pill) => pill.id)))
    assert.deepEqual(
      pills.filter((pill) => pill.underCard).map((pill) => pill.id), [],
      'a label pill slid under a component card, where a cable is painted over',
    )
    for (let i = 0; i < pills.length; i += 1) {
      for (let j = i + 1; j < pills.length; j += 1) {
        const a = pills[i].rect
        const b = pills[j].rect
        const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
        assert.equal(overlap, false, `${pills[i].id} and ${pills[j].id} pills overlap`)
      }
    }
    pass('every relationship pill is fully readable: clear of both endpoint cards and of every other pill')

    await clickRelationship(app.page, 'A2')
    await delay(400)
    state = await projectionState(app.page)
    assert.equal(state.components, 9)
    assert.equal(state.members, 3)
    assert.deepEqual(new Set(state.memberIds), new Set(['A2']))
    assert.equal(state.dim, 8)
    assert.match(state.status, /A2 focused · 4 legs/)
    pass('focused A2 aggregate reveals cancel, feedback, and result over the Simple cards while goal remains the aggregate track')
    await shot(app.page, '05-components-a2-focus-elbow.png')

    // Straight re-DRAWS every cable in the region and writes nothing: the two
    // lenses have completely separate appearances, so a shape chosen here can
    // never reach Dataflow's stored routes. Focus still reveals A2's other
    // three legs, and every one of them still runs port to port.
    const trackPath = (id) => evaluate(app.page,
      `document.querySelector('[data-communication-mode="components"][data-communication-id=${JSON.stringify(id)}] [data-communication-track-path]')?.getAttribute('d') ?? ''`)
    const elbowPath = await trackPath('A2')
    await clickElement(app.page, '[data-testid="communication-route-straight"]')
    await delay(500)
    state = await projectionState(app.page)
    assert.equal(state.members, 3, JSON.stringify(state.memberIds))
    assert.deepEqual(new Set(state.memberIds), new Set(['A2']))
    const straightPath = await trackPath('A2')
    assert.notEqual(straightPath, elbowPath)
    assert.ok(straightPath.length > 0, straightPath)
    const routings = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      return [...new Set(editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'connection')
        .map((shape) => shape.props.routing))]
    })())`))
    assert.deepEqual(routings, ['elbow'], JSON.stringify(routings))
    pass('the Arrow control redraws every cable in the region without writing a stored route')
    await shot(app.page, '06-components-a2-focus-straight.png')

    await clickElement(app.page, '[data-testid="communication-focus-clear"]')
    await clickElement(app.page, '[data-communication-mode="components"] [data-communication-label="S4"]')
    await delay(350)
    state = await projectionState(app.page)
    assert.deepEqual(state.activeIds, ['S4'])
    // One of S4's two legs IS the summary cable's route, so only the other one
    // needs its own tag — the representative would otherwise draw twice.
    assert.equal(state.members, 1, JSON.stringify(state.memberIds))
    assert.match(state.status, /S4 focused · 2 legs/)
    pass('every relationship stays independently focusable by its own label')
    await shot(app.page, '07-components-s4-focus-straight.png')

    // Nothing the lens did is on the undo stack, because nothing it did touched
    // the document. Undo is the sharpest way to say so: it must NOT restore an
    // elbow, because the elbow was never replaced — and it must not reach past
    // the lens into the seeded graph either.
    await evaluate(app.page, `(() => { window.__systemsketch.editor.undo(); return true })()`)
    await delay(400)
    assert.equal(await storedGraph(app.page), before)
    pass('the projection choice is not a history step: undo has nothing of the lens to take back')

    if (await evaluate(app.page, `Boolean(document.querySelector('[data-testid="communication-focus-clear"]'))`) === 'true'
      || await evaluate(app.page, `Boolean(document.querySelector('[data-testid="communication-focus-clear"]'))`) === true) {
      await clickElement(app.page, '[data-testid="communication-focus-clear"]')
    }
    await clickElement(app.page, '[data-testid="communication-lens-dataflow"]')
    await delay(350)
    assert.equal(await storedGraph(app.page), before)
    pass('clearing focus and returning to Dataflow leaves the stored graph byte-identical')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the adversarial focus journey emitted no local console errors')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
