#!/usr/bin/env node
/**
 * Real-canvas proof for the reverse direction of the communication view:
 * draw Stream / Service / Action arrows between Block surfaces, and get
 * canonical ports and cables that the Dataflow view reads back unchanged.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'communication-authoring')
const RESULTS = join(ASSETS, 'acceptance.json')
const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

/**
 * Three components inside a real Async region: two side by side, one stacked
 * below, so the four-sided port rails have a vertical pair to prove against.
 */
const SEED = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  const sizes = { simple: { w: 320, h: 190 }, port: { w: 340, h: 220 }, expanded: { w: 560, h: 380 }, value: { w: 168, h: 56 } }
  const block = (id, x, y, title) => ({
    id: 'shape:' + id, type: 'block', x, y,
    props: {
      title, description: '', blockType: 'component', view: 'port', w: 340, h: 220,
      views: sizes, showDescription: false, portLayout: 'inline', state: 'normal',
      inputs: [], outputs: [],
    },
  })
  editor.createShape({
    id: 'shape:region', type: 'frame', x: 160, y: 160,
    props: { name: 'Async region', color: 'violet', w: 1180, h: 900 },
    meta: { systemSketchAsyncRegion: { version: 1 } },
  })
  editor.createShapes([
    block('mission', 260, 290, 'Mission'),
    block('robot', 860, 290, 'Robot'),
    block('camera', 560, 760, 'Camera'),
  ])
  editor.reparentShapes(['shape:mission', 'shape:robot', 'shape:camera'], 'shape:region')
  editor.setCamera({ x: 0, y: 0, z: 1 })
  editor.select('shape:region')
  return true
})()`

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`,
  ))
}

/** Press on one Block's surface, drag across, release on another. */
async function dragSurfaces(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 12; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 12,
      from.y + ((to.y - from.y) * step) / 12,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(520)
}

/** Everything the assertions read, straight off the editor and the DOM. */
async function record(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const shapes = editor.getCurrentPageShapes()
    const wires = shapes.filter((shape) => shape.type === 'connection')
    const portsOf = (id) => {
      const shape = editor.getShape(id)
      if (!shape) return null
      const read = (list, side) => list.map((port) => ({
        id: port.id, name: port.name, side, edge: port.edge ?? null,
      }))
      return [...read(shape.props.inputs, 'input'), ...read(shape.props.outputs, 'output')]
    }
    const bindingsOf = (wire) => editor.getBindingsFromShape(wire.id, 'connection')
      .map((binding) => ({
        terminal: binding.props.terminal,
        toId: binding.toId,
        portId: binding.props.portId,
      }))
      .sort((a, b) => a.terminal.localeCompare(b.terminal))
    return {
      toolId: editor.getCurrentToolId(),
      wires: wires.map((wire) => ({
        id: wire.id,
        temporal: wire.props.temporal,
        parentId: wire.parentId,
        bindings: bindingsOf(wire),
      })),
      ports: {
        mission: portsOf('shape:mission'),
        robot: portsOf('shape:robot'),
        camera: portsOf('shape:camera'),
      },
      drawButtons: Array.from(document.querySelectorAll('[data-testid^="communication-draw-"]'))
        .map((node) => ({
          id: node.dataset.testid.replace('communication-draw-', ''),
          armed: node.getAttribute('aria-pressed') === 'true',
        })),
      status: document.querySelector('[data-testid="communication-prototype-status"]')?.textContent ?? '',
      railLabels: Array.from(document.querySelectorAll('.BlockNode-portLabel--rail'))
        .map((node) => node.textContent.trim()),
    }
  })())`))
}

/** The relationships the projection reads back out of the generated dataflow. */
async function relations(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const nodes = Array.from(document.querySelectorAll('[data-communication-mode="components"][data-communication-id]'))
    return nodes.map((node) => node.getAttribute('data-communication-id'))
  })())`))
}

async function armAndDraw(page, family, from, to) {
  await clickElement(page, `[data-testid="communication-draw-${family}"]`)
  await delay(220)
  assert.equal(
    await evaluate(page, 'window.__systemsketch.editor.getCurrentToolId()'),
    'communication-link',
    `${family} should arm the communication link tool`,
  )
  await dragSurfaces(page, from, to)
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-communication-authoring',
    build: 'communication-authoring',
    width: 1900,
    height: 1150,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'communication-authoring.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'communication authoring editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(700)

    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'region lens')
    await clickElement(app.page, '[data-testid="communication-mode-components"]')
    await delay(400)
    let observed = await record(app.page)
    assert.deepEqual(
      observed.drawButtons.map((button) => button.id),
      ['stream', 'service', 'action'],
      JSON.stringify(observed.drawButtons),
    )
    assert.equal(observed.drawButtons.every((button) => !button.armed), true)
    assert.equal(observed.wires.length, 0)
    pass('Components mode offers exactly the three drawable patterns, none armed and nothing wired')
    await shot(app.page, '01-components-draw-row.png')

    // --- Stream: one leg, publisher → subscriber ------------------------------
    const missionSurface = await pagePoint(app.page, { x: 430, y: 400 })
    const robotSurface = await pagePoint(app.page, { x: 1030, y: 400 })
    const cameraSurface = await pagePoint(app.page, { x: 730, y: 870 })

    await armAndDraw(app.page, 'stream', cameraSurface, missionSurface)
    observed = await record(app.page)
    assert.equal(observed.wires.length, 1, JSON.stringify(observed.wires))
    const cameraOut = observed.ports.camera.filter((port) => port.side === 'output')
    const missionIn = observed.ports.mission.filter((port) => port.side === 'input')
    assert.deepEqual(cameraOut.map((port) => port.name), ['camera.stream'])
    assert.deepEqual(missionIn.map((port) => port.name), ['camera.stream'])
    assert.equal(observed.wires[0].temporal, 'async')
    assert.equal(observed.wires[0].parentId, 'shape:region')
    pass('a Stream arrow drawn between two surfaces generates one canonical Async leg named for its publisher')

    // Four-sided ports: Camera sits BELOW Mission, so the sockets face.
    assert.equal(cameraOut[0].edge, 'top', JSON.stringify(cameraOut))
    assert.equal(missionIn[0].edge, 'bottom', JSON.stringify(missionIn))
    pass('a stacked pair puts each generated socket on the facing horizontal rail')
    await shot(app.page, '02-stream-four-sided-rails.png')

    // --- Service: request forward, response back ------------------------------
    await armAndDraw(app.page, 'service', missionSurface, robotSurface)
    observed = await record(app.page)
    assert.equal(observed.wires.length, 3, JSON.stringify(observed.wires.length))
    const missionNames = observed.ports.mission.map((port) => `${port.side}:${port.name}`)
    const robotNames = observed.ports.robot.map((port) => `${port.side}:${port.name}`)
    assert.ok(missionNames.includes('output:robot.request'), JSON.stringify(missionNames))
    assert.ok(missionNames.includes('input:robot.response'), JSON.stringify(missionNames))
    assert.ok(robotNames.includes('input:robot.request'), JSON.stringify(robotNames))
    assert.ok(robotNames.includes('output:robot.response'), JSON.stringify(robotNames))
    pass('a Service arrow generates request forward and response back, naming the client by the arrowhead')

    // --- Action: goal forward, feedback and result back -----------------------
    await armAndDraw(app.page, 'action', missionSurface, robotSurface)
    observed = await record(app.page)
    assert.equal(observed.wires.length, 6, JSON.stringify(observed.wires.length))
    const action = observed.ports.robot.map((port) => `${port.side}:${port.name}`)
    assert.ok(action.includes('input:robot.goal'), JSON.stringify(action))
    assert.ok(action.includes('output:robot.feedback'), JSON.stringify(action))
    assert.ok(action.includes('output:robot.result'), JSON.stringify(action))
    assert.equal(action.some((entry) => entry.includes('cancel')), false, 'cancel is not generated')
    pass('an Action arrow generates goal, feedback and result — and deliberately no cancel leg')
    await shot(app.page, '03-service-and-action.png')

    // --- The round trip: Dataflow reads the generated ports back --------------
    await clickElement(app.page, '[data-testid="communication-mode-wiring"]')
    await delay(450)
    observed = await record(app.page)
    assert.match(observed.status, /6 canonical wires/)
    pass('flipping to Dataflow shows the six real cables the three drawn arrows created')

    // Components mode projects Simple cards whose anchors are deliberately
    // quiet; the four-sided LABEL is a Port-view fact, so it is read here.
    assert.equal(
      observed.railLabels.some((label) => label.includes('camera.stream')),
      true,
      JSON.stringify(observed.railLabels),
    )
    const railGeometry = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const node = Array.from(document.querySelectorAll('.BlockNode-portLabel--rail'))
        .find((candidate) => candidate.textContent.includes('camera.stream'))
      if (!node) return null
      const style = window.getComputedStyle(node)
      return { justify: style.justifyContent, align: style.textAlign, top: node.style.top }
    })())`))
    assert.equal(railGeometry.justify, 'center', JSON.stringify(railGeometry))
    assert.equal(railGeometry.align, 'center', JSON.stringify(railGeometry))
    pass('the four-sided port label is horizontal and centred on its socket, drawn inward per the Node Flow convention')
    await shot(app.page, '04-dataflow-generated-ports.png')

    await clickElement(app.page, '[data-testid="communication-mode-components"]')
    await delay(450)
    const ids = await relations(app.page)
    assert.deepEqual(
      [...new Set(ids)].sort(),
      ['A1', 'S1', 'ST1'],
      `the parser should read the generated board back as one action, one service and one stream: ${JSON.stringify(ids)}`,
    )
    pass('the strict parser reads the generated dataflow back as exactly the three relationships that were drawn')

    // --- Rename travels through the ports, which is where the name lives ------
    // Focus is a canvas gesture: press the collapsed A1 edge itself. Sampling
    // the real rendered path (rather than its bounding box) is what makes this
    // land on an elbow, whose bbox centre is off the stroke.
    const a1 = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const container = document.querySelector('[data-communication-mode="components"][data-communication-id="A1"]')
      if (!container) return null
      // The FIRST path in this container is a marker inside <defs>; the one
      // that carries the focus gesture is the transparent 18px hit stroke.
      const path = container.querySelector('[data-communication-focus-hit]')
      if (!path || !path.getTotalLength()) return null
      const point = path.getPointAtLength(path.getTotalLength() / 2)
      const screen = point.matrixTransform(path.getScreenCTM())
      return { x: screen.x, y: screen.y }
    })())`))
    assert.ok(a1, 'the collapsed A1 relationship edge should be on the canvas')
    await clickAt(app.page, a1.x, a1.y)
    await delay(350)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-rename-input"]')`, 'rename field')
    await evaluate(app.page, `(() => {
      const input = document.querySelector('[data-testid="communication-rename-input"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'dock')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    const typed = await evaluate(app.page, `document.querySelector('[data-testid="communication-rename-input"]').value`)
    assert.equal(typed, 'dock', `the rename field should hold the typed name, got ${typed}`)
    await clickElement(app.page, '[data-testid="communication-rename-submit"]')
    await delay(500)
    observed = await record(app.page)
    const renamed = observed.ports.robot.map((port) => port.name)
    assert.ok(renamed.includes('dock.goal'), JSON.stringify(renamed))
    assert.ok(renamed.includes('dock.result'), JSON.stringify(renamed))
    assert.equal(renamed.some((name) => name.startsWith('robot.goal')), false, JSON.stringify(renamed))
    assert.equal(observed.wires.length, 6, 'renaming must not orphan or duplicate a cable')
    pass('renaming a relationship rewrites its port names and keeps every cable bound')
    await shot(app.page, '05-renamed-relationship.png')

    // --- Escape leaves the tool without disturbing the lens -------------------
    await clickElement(app.page, '[data-testid="communication-draw-stream"]')
    await delay(200)
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getCurrentToolId()'), 'communication-link')
    await clickElement(app.page, '[data-testid="communication-draw-stream"]')
    await delay(250)
    assert.equal(await evaluate(app.page, 'window.__systemsketch.editor.getCurrentToolId()'), 'select')
    pass('the armed family toggles off, returning the canvas to ordinary selection')

    // --- An ordinary board never grows the drawing affordance -----------------
    const outside = await pagePoint(app.page, { x: 1600, y: 1120 })
    await clickAt(app.page, outside.x, outside.y)
    await delay(350)
    observed = await record(app.page)
    assert.equal(observed.drawButtons.length, 0, JSON.stringify(observed.drawButtons))
    pass('leaving the region closes the lens, so an ordinary board has no communication drawing affordance')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the real browser journey emitted no local console errors')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
