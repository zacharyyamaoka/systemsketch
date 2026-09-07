#!/usr/bin/env node
/**
 * Stress the rule that decides where a drawn arrow puts its sockets:
 * "the ports should appear on the two edges that your arrow intersects."
 *
 * A straight drag between two cards can only ever cross OPPOSING walls — the
 * line leaves the source by the wall pointing at the target and enters the
 * target by the wall pointing back. So the sixteen abstract pairs are not all
 * reachable by a real gesture; the exhaustive segment-vs-rectangle cases live
 * in `arrowEdgeCrossing.test.ts`. This journey walks every placement a person
 * can actually produce — the four axis-aligned directions and the four
 * diagonals — through the real tool, and checks the sockets landed on the
 * walls the line went through, for all three families.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'communication-edge-crossing')
const RESULTS = join(ASSETS, 'acceptance.json')
const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

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
  // Big enough that every placement below stays INSIDE the frame: tldraw clips
  // a frame's children, so a card nudged outside stops being hit-testable and
  // the drag silently lands on nothing.
  editor.createShape({
    id: 'shape:region', type: 'frame', x: -2000, y: -2000,
    props: { name: 'Async region', color: 'violet', w: 4000, h: 4000 },
    meta: { systemSketchAsyncRegion: { version: 1 } },
  })
  editor.createShapes([block('hub', 1830, 1890, 'Hub'), block('peer', 1830, 1890, 'Peer')])
  editor.reparentShapes(['shape:hub', 'shape:peer'], 'shape:region')
  editor.setCamera({ x: 0, y: 0, z: 1 })
  editor.select('shape:region')
  return true
})()`

/** Where the peer card goes for each direction, relative to the hub. */
const PLACEMENTS = [
  { name: 'right', dx: 900, dy: 0, exit: 'right', entry: 'left' },
  { name: 'left', dx: -900, dy: 0, exit: 'left', entry: 'right' },
  { name: 'below', dx: 0, dy: 800, exit: 'bottom', entry: 'top' },
  { name: 'above', dx: 0, dy: -800, exit: 'top', entry: 'bottom' },
  { name: 'below-right', dx: 900, dy: 800, exit: ['right', 'bottom'], entry: ['left', 'top'] },
  { name: 'below-left', dx: -900, dy: 800, exit: ['left', 'bottom'], entry: ['right', 'top'] },
  { name: 'above-right', dx: 900, dy: -800, exit: ['right', 'top'], entry: ['left', 'bottom'] },
  { name: 'above-left', dx: -900, dy: -800, exit: ['left', 'top'], entry: ['right', 'bottom'] },
]

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`,
  ))
}

async function centreOf(page, shapeId) {
  const bounds = JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(shapeId)}))`,
  ))
  return pagePoint(page, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
}

async function dragSurfaces(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 12; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 12,
      from.y + ((to.y - from.y) * step) / 12,
      { buttons: 1 })
    await delay(20)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(420)
}

/** Every generated port on both cards, with the wall it landed on. */
async function ports(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const read = (id) => {
      const shape = editor.getShape(id)
      if (!shape) return []
      return shape.props.inputs.concat(shape.props.outputs)
        .map((port) => ({ name: port.name, edge: port.commEdge ?? null, t: port.commEdgeT ?? null }))
    }
    return { hub: read('shape:hub'), peer: read('shape:peer') }
  })())`))
}

/**
 * Offset the peer from the hub by a PAGE-space delta.
 *
 * Both cards are children of the region, and `reparentShapes` preserves page
 * position by rewriting local coordinates — so a literal x/y here is not the
 * page position it looks like. Reading the hub's own local origin and adding
 * the delta keeps the two in the same space, which is what makes "peer to the
 * right" actually mean to the right. (Getting this wrong is what made the very
 * first case of this journey fail against a correct implementation.)
 */
/**
 * Put BOTH cards where this round wants them, absolutely.
 *
 * Anchoring the peer to wherever the hub currently is looks tidier and is a
 * trap: one stray select-drag moves the hub, and every later round inherits
 * the error. Absolute placement each round makes a round independent of the
 * ones before it.
 */
async function movePeer(page, dx, dy) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.updateShape({ id: 'shape:hub', type: 'block', x: 1830, y: 1890 })
    editor.updateShape({ id: 'shape:peer', type: 'block', x: ${1830 + dx}, y: ${1890 + dy} })
    return true
  })()`)
  await delay(220)
}

/**
 * Arm a family, whatever state the bar is in.
 *
 * The DRAW buttons are toggles and the tool deliberately STAYS armed after a
 * successful draw, so a blind second click disarms it — and the next drag then
 * goes to the select tool and MOVES the card instead of wiring it. That is
 * exactly what corrupted this journey's second case.
 */
async function armFamily(page, family) {
  const selector = `[data-testid="communication-draw-${family}"]`
  const pressed = await evaluate(
    page,
    `document.querySelector('${selector}')?.getAttribute('aria-pressed')`,
  )
  if (String(pressed) !== 'true') await clickElement(page, selector)
  await delay(180)
  const toolId = await evaluate(page, 'window.__systemsketch.editor.getCurrentToolId()')
  assert.equal(toolId, 'communication-link', `${family} did not arm the link tool`)
}

async function resetWiring(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const wires = editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection')
    if (wires.length) editor.deleteShapes(wires.map((shape) => shape.id))
    for (const id of ['shape:hub', 'shape:peer']) {
      const shape = editor.getShape(id)
      if (shape) editor.updateShape({ id, type: 'block', props: { ...shape.props, inputs: [], outputs: [] } })
    }
    return true
  })()`)
  await delay(220)
}

function accepts(expected, actual) {
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-edge-crossing',
    build: 'edge-crossing',
    width: 1900,
    height: 1200,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'edge-crossing.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'edge crossing editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(700)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-lens-communication"]')`, 'region lens')
    await clickElement(app.page, '[data-testid="communication-lens-communication"]')
    await delay(400)

    for (const family of ['stream', 'service', 'action']) {
      for (const placement of PLACEMENTS) {
        await resetWiring(app.page)
        await movePeer(app.page, placement.dx, placement.dy)
        // Keep both cards on screen for the whole gesture.
        await evaluate(app.page, `(() => {
          const editor = window.__systemsketch.editor
          editor.zoomToFit({ animation: { duration: 0 } })
          return true
        })()`)
        await delay(300)

        await armFamily(app.page, family)
        await dragSurfaces(app.page, await centreOf(app.page, 'shape:hub'), await centreOf(app.page, 'shape:peer'))

        const observed = await ports(app.page)
        assert.ok(
          observed.hub.length > 0 && observed.peer.length > 0,
          `${family} ${placement.name}: no ports were generated`,
        )
        // EVERY leg of the interaction sits on the wall the arrow crossed —
        // one arrow, one pair of walls, however many cables it expands into.
        const hubEdges = [...new Set(observed.hub.map((port) => port.edge))]
        const peerEdges = [...new Set(observed.peer.map((port) => port.edge))]
        assert.equal(hubEdges.length, 1, `${family} ${placement.name}: hub split across ${JSON.stringify(hubEdges)}`)
        assert.equal(peerEdges.length, 1, `${family} ${placement.name}: peer split across ${JSON.stringify(peerEdges)}`)
        assert.ok(
          accepts(placement.exit, hubEdges[0]),
          `${family} ${placement.name}: expected the arrow to leave ${JSON.stringify(placement.exit)}, got ${hubEdges[0]}`,
        )
        assert.ok(
          accepts(placement.entry, peerEdges[0]),
          `${family} ${placement.name}: expected the arrow to enter ${JSON.stringify(placement.entry)}, got ${peerEdges[0]}`,
        )
        // And they share that wall rather than piling up. The crossing decides
        // the EDGE only — position along it stays automatic, because "ports
        // should always evenly space the visible ports, no gaps ever" — so the
        // check is on the painted dots, not on a stored fraction.
        const dots = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
          return Array.from(document.querySelectorAll(
            '[data-shape-id="shape:hub"] [data-block-port-edge]',
          )).map((node) => {
            const box = node.getBoundingClientRect()
            return { edge: node.getAttribute('data-block-port-edge'), x: Math.round(box.x), y: Math.round(box.y) }
          })
        })())`))
        // The communication lens paints ONLY the sockets a summary arrow
        // attaches to — one per relationship — while every leg still exists in
        // the store for Dataflow. So the dot count follows the carriers, not
        // the port count.
        assert.equal(
          dots.length,
          1,
          `${family} ${placement.name}: expected one carrier dot, painted ${dots.length}`,
        )
        assert.equal(
          dots[0].edge,
          hubEdges[0],
          `${family} ${placement.name}: the painted dot must be on the wall the arrow crossed`,
        )

      }
      pass(`a ${family} arrow puts its sockets on the walls it crosses, in all eight directions`)
    }

    await shot(app.page, '01-edge-crossing-final.png')

    // The awkward one: a drag that never leaves the card it began in.
    await resetWiring(app.page)
    await movePeer(app.page, 900, 0)
    await evaluate(app.page, `(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()`)
    await delay(300)
    await armFamily(app.page, 'stream')
    const hubCentre = await centreOf(app.page, 'shape:hub')
    await dragSurfaces(app.page, hubCentre, { x: hubCentre.x + 6, y: hubCentre.y + 6 })
    const selfDrag = await ports(app.page)
    assert.deepEqual(selfDrag.hub, [], 'a drag that never left its own card must wire nothing')
    assert.deepEqual(selfDrag.peer, [], 'a drag that never left its own card must wire nothing')
    pass('a drag that never leaves the card it began in wires nothing at all')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the edge-crossing stress journey emitted no local console errors')
  } finally {
    await writeFile(RESULTS, `${JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)}\n`)
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
