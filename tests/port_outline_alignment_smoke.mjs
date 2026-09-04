#!/usr/bin/env node
/**
 * Real-browser proof that a Block, Branch or Loop's selection/hover outline
 * traces a socket around every port dot it paints — never a straight edge
 * cutting through one.
 *
 * `getIndicatorPath` is tldraw's one hook for that outline, and it is a pure
 * function of `shape.props` computed independently of `BlockCanvas`'s live
 * DOM paint. The two can drift: this repo shipped a version that skipped
 * `subtle` ports (Simple Block's dots, hidden until canvas-hover) entirely,
 * so a Simple Block's selection edge ran straight through its own port dot
 * instead of arcing around it the moment hover revealed the dot.
 *
 * The oracle is the app's own `layoutBlock` / `branchLayout` / `loopLayout` —
 * dynamically imported from the running Vite dev server, not reimplemented
 * here — mapped through the shape's real page transform and
 * `editor.pageToScreen`. Two independent claims are checked per port:
 *   - position: the computed indicator centre lands within POSITION_TOLERANCE
 *     of the live `.Port` dot's own `getBoundingClientRect` centre.
 *   - existence: the live selection-overlay canvas actually has ink at a
 *     point just outside the socket radius, on the port's outward side —
 *     the one place only a real circular stroke reaches, never the shape's
 *     straight body edge. A skipped port (the historical bug) paints nothing
 *     there at all.
 *
 * Every primitive that carries ports is covered: Block's port/simple/
 * expanded/value views, ports on the left, right and top (mutates/effect)
 * edges, a dense many-port stress case, a connected many-to-one port, an
 * unconnected default-value port, a Branch region's control ports, and a
 * Loop region's two header ports — `iterable` on the left wall, `item` on
 * the header's BOTTOM edge, the one edge no Block or Branch port ever sits
 * on — at multiple zoom levels.
 *
 * A resize is the one live edit most likely to desync `getIndicatorPath`
 * from the paint again — `layoutBlock`, `branchLayout` and `loopLayout` all
 * recompute every port position from `props.w`/`props.h` — so a Block, a
 * Branch and a Loop are each driven through `editor.resizeShape` (the same
 * call a dragged handle makes) across a size matrix, plus one genuine
 * mouse-drag on the real resize handle.
 *
 * One full-app screenshot per configuration lands in `docs/assets/` as
 * `port-outline-gallery-<slug>-2026-09-03.png` (or
 * `port-outline-gallery-resize-<size>-2026-09-03.png` for the resize
 * matrix), manifest alongside, for `docs/build_port_outline_gallery.py` to
 * lay out as a visual catalogue.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'port-outline-alignment-results-2026-09-03.json')
const SHOT = join(SHOTS, 'port-outline-alignment-acceptance-2026-09-03.png')

// Sub-pixel noise (measured on this suite's own baseline, every shape,
// several zoom levels) tops out around 0.4px. The historical bug was a
// straight edge cutting through a whole 18px-diameter socket — multiple
// pixels at any zoom. 1px is tight enough to catch a real regression and
// loose enough to never flake on rendering noise.
const POSITION_TOLERANCE_PX = 1
// A coarser bound for the pixel-sampled existence probe, which inherits
// antialiasing/rounding noise the pure-transform position check does not.
const EXISTENCE_PROBE_TOLERANCE_PX = 3

const checks = []
function pass(label, ok, detail) {
  checks.push({ label, ok, detail })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (${detail})`}\n`)
}

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const port = (id, name, type, extra = {}) => ({ id, name, type, visible: true, ...extra })
  const block = (id, x, y, title, view, w, h, inputs, outputs) => ({
    id, type: 'block', parentId: 'page:page', x, y,
    props: { w, h, title, view, inputs, outputs },
  })

  // Every edge a Block port can sit on: left (input), right (output), and
  // top (a mutates input becomes an effect output on the top edge).
  const portView = block('shape:port-view', 100, 100, 'Port view', 'port', 300, 240,
    [
      port('in0', 'alpha', 'text'),
      port('in1', 'beta', 'number'),
      port('in2', 'mut', 'text', { mutates: true }),
    ],
    [
      port('out0', 'delta', 'image'),
      port('out1', 'epsilon', 'latent'),
      port('out2', 'zeta', 'any'),
    ])

  // Simple's ports are 'subtle': invisible until canvas hover, and the shape
  // whose indicator historically skipped them outright.
  const simpleView = block('shape:simple-view', 500, 100, 'Chromeless', 'simple', 220, 140,
    [port('in0', 'x', 'text')], [port('out0', 'y', 'any')])

  const valueView = block('shape:value-view', 800, 100, 'Value pill', 'value', 160, 60,
    [port('in0', 'v', 'any')], [])

  const child = block('shape:child', 60, 90, 'Child', 'port', 200, 160,
    [port('in0', 'a', 'text')], [port('out0', 'b', 'number')])
  const expandedView = block('shape:expanded-view', 100, 400, 'Container', 'expanded', 520, 420,
    [port('in0', 'p', 'text'), port('in1', 'q', 'number')],
    [port('out0', 'r', 'image')])

  // A dense stress case: six ports a side, every family colour represented.
  const families = ['text', 'number', 'model', 'latent', 'image', 'any']
  const manyPorts = block('shape:many-ports', 700, 400, 'Many ports', 'port', 340, 520,
    families.map((f, i) => port('in' + i, 'input' + i, f)),
    families.map((f, i) => port('out' + i, 'output' + i, f)))

  // Port_default: an unconnected input carrying a default value paints a
  // filled muted core inside its ring, with no cable and no producer badge.
  const defaults = block('shape:defaults', 1150, 1000, 'Defaults', 'port', 260, 160,
    [port('in0', 'threshold', 'number', { defaultValue: '5' })], [])

  // A dedicated shape for the resize matrix: ports on all three edges (left,
  // right, top), so a resize's effect on row spacing AND the top-edge effect
  // port are both exercised, isolated from the shapes the gallery screenshots.
  const resizeProbe = block('shape:resize-probe', 1900, 100, 'Resize probe', 'port', 300, 240,
    [
      port('in0', 'alpha', 'text'), port('in1', 'beta', 'number'), port('in2', 'mut', 'text', { mutates: true }),
    ],
    [port('out0', 'delta', 'image'), port('out1', 'epsilon', 'latent')])

  const resizeProbeBranch = {
    id: 'shape:resize-probe-branch', type: 'branch', parentId: 'page:page', x: 1900, y: 500,
    props: {
      w: 400, h: 340, title: 'Resize branch', view: 'expanded', activeArmId: null,
      controls: [
        { id: 'ctl0', name: 'cond', type: 'bool' },
        { id: 'ctl1', name: 'value', type: 'any' },
      ],
      arms: [
        { id: 'arm_1', title: 'if', open: true, h: 130 },
        { id: 'arm_2', title: 'else', open: true, h: 130 },
      ],
    },
  }

  const branch = {
    id: 'shape:branch', type: 'branch', parentId: 'page:page', x: 1150, y: 100,
    props: {
      w: 520, h: 380, title: 'Branch', view: 'expanded', activeArmId: null,
      controls: [
        { id: 'ctl0', name: 'cond', type: 'bool' },
        { id: 'ctl1', name: 'value', type: 'any' },
      ],
      arms: [
        { id: 'arm_1', title: 'if', open: true, h: 150 },
        { id: 'arm_2', title: 'else', open: true, h: 150 },
      ],
    },
  }

  // Loop's two header ports: 'iterable' lands on the left wall like a Branch
  // control port, 'item' leaves the header's BOTTOM edge — the one edge no
  // Block port or Branch control ever sits on.
  const loop = {
    id: 'shape:loop', type: 'loop', parentId: 'page:page', x: 1500, y: 900,
    props: {
      w: 420, h: 260, title: 'For Loop',
      iterable: { id: 'iterable', type: 'Iterable' },
      item: { id: 'item', type: 'Iter' },
      turn: 'i',
    },
  }
  const resizeProbeLoop = {
    id: 'shape:resize-probe-loop', type: 'loop', parentId: 'page:page', x: 1500, y: 1250,
    props: {
      w: 400, h: 220, title: 'Resize loop',
      iterable: { id: 'iterable', type: 'Iterable' },
      item: { id: 'item', type: 'Iter' },
      turn: '',
    },
  }

  // A connected many-to-one port: two sources feed one sink input, which
  // paints the filled core plus the producer-count badge.
  const src1 = block('shape:src1', 1150, 560, 'Source 1', 'port', 220, 140, [], [port('out0', 'v', 'any')])
  const src2 = block('shape:src2', 1150, 760, 'Source 2', 'port', 220, 140, [], [port('out0', 'v', 'any')])
  const sink = block('shape:sink', 1500, 620, 'Sink', 'port', 260, 200, [port('in0', 'target', 'any')], [])
  const cable = (id) => ({
    id, type: 'connection', parentId: 'page:page', x: 0, y: 0,
    props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow', curve: null, pins: [], elbowRoute: null },
  })
  const weld = (fromId, toId, terminal, portId) => ({
    type: 'connection', fromId, toId, props: { terminal, portId, face: 'outer' },
  })
  const c1 = cable('shape:c1')
  const c2 = cable('shape:c2')

  editor.run(() => {
    editor.createShapes([
      portView, simpleView, valueView, expandedView, manyPorts, branch, src1, src2, sink, defaults,
      resizeProbe, resizeProbeBranch, loop, resizeProbeLoop,
    ])
    editor.createShapes([child])
    editor.reparentShapes([child.id], expandedView.id)
    editor.createShapes([c1, c2])
    editor.createBindings([
      weld(c1.id, src1.id, 'start', 'out0'),
      weld(c1.id, sink.id, 'end', 'in0'),
      weld(c2.id, src2.id, 'start', 'out0'),
      weld(c2.id, sink.id, 'end', 'in0'),
    ])
  })

  return {
    portView: portView.id, simpleView: simpleView.id, valueView: valueView.id,
    expandedView: expandedView.id, manyPorts: manyPorts.id, branch: branch.id, sink: sink.id,
    defaults: defaults.id, resizeProbe: resizeProbe.id, resizeProbeBranch: resizeProbeBranch.id,
    loop: loop.id, resizeProbeLoop: resizeProbeLoop.id,
  }
})()`

/** One shape's ports, measured against its live paint at the current camera. */
const MEASURE = (shapeId, kind) => `(async () => {
  const editor = window.__systemsketch.editor
  const shape = editor.getShape(${JSON.stringify(shapeId)})
  if (!shape) return JSON.stringify({ error: 'missing shape' })
  const wrapper = document.querySelector('[data-shape-id="${shapeId}"]')
  if (!wrapper) return JSON.stringify({ error: 'missing wrapper' })

  const pageTransform = editor.getShapePageTransform(shape)
  const canvas = document.querySelector('canvas.tl-canvas-overlays')
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  function inkNear(screenPoint, windowPx) {
    const x0 = Math.max(0, Math.round((screenPoint.x - windowPx / 2) * dpr))
    const y0 = Math.max(0, Math.round((screenPoint.y - windowPx / 2) * dpr))
    const size = Math.max(1, Math.round(windowPx * dpr))
    const data = ctx.getImageData(x0, y0, size, size).data
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) return true
    return false
  }

  const toScreen = (local) => editor.pageToScreen(pageTransform.applyToPoint(local))
  const EDGE_OUTWARD = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }

  let ports, radius
  if (${JSON.stringify(kind)} === 'branch') {
    const { branchLayout, BRANCH_PORT_RADIUS } = await import('/src/branch/branchModel.ts')
    const layout = branchLayout(shape.props)
    radius = BRANCH_PORT_RADIUS + 3
    ports = layout.controls.map((c) => ({
      id: c.port.id, side: 'input', edge: 'left', x: c.x, y: c.y, subtle: false,
    }))
  } else if (${JSON.stringify(kind)} === 'loop') {
    const { loopLayout, LOOP_PORT_RADIUS } = await import('/src/loop/loopModel.ts')
    const layout = loopLayout(shape.props)
    radius = LOOP_PORT_RADIUS + 3
    // elbowSide is Loop's name for the same concept Block calls 'edge' — the
    // wall/edge a cable leaves the port perpendicular to. 'item's is
    // 'bottom', the one edge no Block port ever sits on.
    ports = [layout.iterable, layout.item].map((p) => ({
      id: p.port.id, side: p.side, edge: p.elbowSide, x: p.x, y: p.y, subtle: false,
    }))
  } else {
    const { layoutBlock, BLOCK_PORT_RADIUS } = await import('/src/blocks/layoutBlock.ts')
    const layout = layoutBlock(shape.props)
    radius = BLOCK_PORT_RADIUS + 3
    ports = layout.ports.map((p) => ({
      id: p.port.id, side: p.side, edge: p.edge, x: p.x, y: p.y, subtle: p.subtle,
    }))
  }

  // Mirror getIndicatorPath's own dedup: two ports at the same rounded local
  // point share one circle, owned by whichever came first.
  const seen = new Set()
  const owning = ports.filter((p) => {
    const key = Math.round(p.x) + ':' + Math.round(p.y)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const results = owning.map((p) => {
    const dotSelector = '[data-block-port-id="' + p.id + '"][data-block-port-side="' + p.side + '"]'
    const dot = wrapper.querySelector(dotSelector)
    if (!dot) return { portId: p.id, side: p.side, error: 'no DOM dot for ' + dotSelector }
    const rect = dot.getBoundingClientRect()
    const domCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    const expectedCenter = toScreen({ x: p.x, y: p.y })
    const positionDelta = Math.hypot(expectedCenter.x - domCenter.x, expectedCenter.y - domCenter.y)

    // The probe lands exactly on the ring's own outer edge, in the port's
    // outward direction — computed by transforming that exact local point
    // through the SAME page transform, so it tracks the ring's true screen
    // radius (which scales with zoom) rather than a page-space pad that
    // would drift off a thin, zoom-compensated stroke at high zoom.
    const outward = EDGE_OUTWARD[p.edge] || EDGE_OUTWARD.left
    const probeLocal = { x: p.x + outward.x * radius, y: p.y + outward.y * radius }
    const probeScreen = toScreen(probeLocal)
    const socketPainted = inkNear(probeScreen, 8)

    return {
      portId: p.id, side: p.side, edge: p.edge, subtle: p.subtle,
      domCenter, expectedCenter, positionDelta, socketPainted,
    }
  })

  return JSON.stringify({ results })
})()`

async function measure(page, shapeId, kind = 'block') {
  const raw = await evaluate(page, MEASURE(shapeId, kind))
  return JSON.parse(raw)
}

async function selectAndSettle(page, shapeId, { zoomMultiplier = 1, minZoom = 0 } = {}) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectNone()
    editor.select(${JSON.stringify(shapeId)})
    editor.zoomToSelection({ animation: { duration: 0 }, inset: 150 })
    // A small Block (Value pill, Defaults) fits comfortably well under 100%
    // zoom-to-selection in a 1600px-wide viewport — too small to read a
    // port's socket by eye. minZoom lifts it for legibility, but an extreme
    // aspect ratio (very-wide, very-tall) means the SAME multiplier that's
    // still safe for a square shape pushes its far edge — and this suite's
    // own outward-of-the-ring existence probe with it — off the actual
    // rendered canvas, reading as a false "no ink" rather than a real bug.
    // Cap the boost at whatever keeps the whole shape's screen bounds inside
    // the viewport, so the probe is always sampling real painted pixels.
    const bounds = editor.getSelectionPageBounds()
    const screen = editor.getViewportScreenBounds()
    const maxSafeZoom = bounds
      ? Math.min(screen.w / bounds.w, screen.h / bounds.h) * 0.85
      : Infinity
    const effective = Math.min(
      Math.max(${zoomMultiplier}, ${minZoom} / editor.getZoomLevel()),
      maxSafeZoom / editor.getZoomLevel(),
    )
    if (effective !== 1) {
      editor.setCamera({ ...editor.getCamera(), z: editor.getZoomLevel() * effective }, { animation: { duration: 0 } })
      // setCamera zooms around the viewport's own origin, not the shape —
      // recentre so a >1x multiplier doesn't push the shape's ports off-canvas.
      if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } })
    }
    return true
  })()`)
  await delay(220)
}

/**
 * Resize a shape to (approximately) a target size through tldraw's real
 * `resizeShape` API — the same call a dragged resize handle makes — then
 * report the size actually landed, since a Branch's `reconcileBranchProps`
 * (or any future min-size floor) may not hit the naive target exactly.
 */
async function resizeShapeTo(page, shapeId, targetW, targetH) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape(${JSON.stringify(shapeId)})
    const scale = { x: ${targetW} / shape.props.w, y: ${targetH} / shape.props.h }
    editor.resizeShape(shape.id, scale)
    const after = editor.getShape(${JSON.stringify(shapeId)})
    return JSON.stringify({ w: after.props.w, h: after.props.h })
  })()`))
}

function checkShape(label, out) {
  if (out.error) { pass(label, false, out.error); return }
  for (const r of out.results) {
    if (r.error) { pass(`${label} ${r.portId}`, false, r.error); continue }
    const tol = r.subtle ? EXISTENCE_PROBE_TOLERANCE_PX : POSITION_TOLERANCE_PX
    const positionOk = r.positionDelta <= tol
    pass(
      `${label} ${r.side}/${r.edge} ${r.portId} indicator centred`,
      positionOk,
      `delta=${r.positionDelta.toFixed(2)}px tolerance=${tol}px`,
    )
    pass(
      `${label} ${r.side}/${r.edge} ${r.portId} socket painted (not a straight edge through the dot)`,
      r.socketPainted,
      r.socketPainted ? 'ink found outward of the dot' : 'NO ink outward of the dot — indicator skipped this port',
    )
  }
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'port-outline-alignment', width: 1600, height: 1000 })
  const { page } = app
  try {
    await openApp(page, app.port, '')
    await waitFor(page, 'window.__systemsketch?.editor', 'development editor seam')
    const ids = await evaluate(page, SEED)

    // minZoom only lifts shapes small enough that zoom-to-selection alone
    // leaves their ports too small to inspect by eye in a 1600px-wide
    // viewport; a shape that already fills the frame keeps its natural fit
    // so a boost doesn't clip its far ports out of the capture.
    const shapes = [
      { label: 'port view', slug: 'port-view', id: ids.portView, kind: 'block', minZoom: 2.5 },
      { label: 'simple view', slug: 'simple-view', id: ids.simpleView, kind: 'block', minZoom: 3 },
      { label: 'value view', slug: 'value-view', id: ids.valueView, kind: 'block', minZoom: 3 },
      { label: 'expanded view', slug: 'expanded-view', id: ids.expandedView, kind: 'block', minZoom: 0 },
      { label: 'many ports', slug: 'many-ports', id: ids.manyPorts, kind: 'block', minZoom: 0 },
      { label: 'branch region', slug: 'branch-region', id: ids.branch, kind: 'branch', minZoom: 0 },
      { label: 'connected sink', slug: 'connected-sink', id: ids.sink, kind: 'block', minZoom: 2 },
      { label: 'default value', slug: 'default-value', id: ids.defaults, kind: 'block', minZoom: 3 },
      { label: 'loop region', slug: 'loop-region', id: ids.loop, kind: 'loop', minZoom: 2 },
    ]

    const galleryShots = []
    for (const { label, slug, id, kind, minZoom } of shapes) {
      await selectAndSettle(page, id, { minZoom })
      checkShape(label, await measure(page, id, kind))
      const shotName = `port-outline-gallery-${slug}-2026-09-03.png`
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      const bytes = Buffer.from(capture.data, 'base64')
      await writeFile(join(SHOTS, shotName), bytes)
      if (slug === 'port-view') await writeFile(SHOT, bytes) // legacy path, kept for the earlier bug-fix report
      galleryShots.push({ label, slug, file: shotName })
    }
    await writeFile(join(SHOTS, 'port-outline-gallery-manifest-2026-09-03.json'), JSON.stringify(galleryShots, null, 2))

    // Zoom sensitivity: the same Block re-measured at two very different
    // camera zooms, to catch a regression that only shows up off the
    // default zoom-to-selection level.
    for (const zoom of [0.5, 2.5]) {
      await selectAndSettle(page, ids.portView, { zoomMultiplier: zoom })
      checkShape(`port view @${zoom}x`, await measure(page, ids.portView, 'block'))
    }

    // Resize stress: layoutBlock/branchLayout recompute every port position
    // from w/h, so a resize is the one live edit most likely to desync them
    // from getIndicatorPath again. Every size below is driven through the
    // real `editor.resizeShape` API — the same call a dragged handle makes —
    // never a hand-written prop patch.
    const SIZE_MATRIX = [
      { label: 'tiny', w: 140, h: 100 },
      { label: 'small', w: 220, h: 160 },
      { label: 'large', w: 700, h: 560 },
      { label: 'very-wide', w: 1000, h: 160 },
      { label: 'very-tall', w: 200, h: 780 },
      { label: 'square', w: 420, h: 420 },
    ]
    const resizeShots = []
    for (const { label: sizeLabel, w, h } of SIZE_MATRIX) {
      const landed = await resizeShapeTo(page, ids.resizeProbe, w, h)
      await selectAndSettle(page, ids.resizeProbe, { minZoom: 2 })
      checkShape(`resize probe ${sizeLabel} (${landed.w}x${landed.h})`, await measure(page, ids.resizeProbe, 'block'))
      const shotName = `port-outline-gallery-resize-${sizeLabel}-2026-09-03.png`
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(join(SHOTS, shotName), Buffer.from(capture.data, 'base64'))
      resizeShots.push({ label: sizeLabel, w: landed.w, h: landed.h, file: shotName })
    }
    await writeFile(join(SHOTS, 'port-outline-gallery-resize-manifest-2026-09-03.json'), JSON.stringify(resizeShots, null, 2))

    // Branch resizes differently — reconcileBranchProps spreads a height
    // delta across open arms rather than just stretching a body — so it gets
    // its own smaller matrix rather than assuming Block's math covers it.
    for (const { label: sizeLabel, w, h } of [
      { label: 'tiny', w: 240, h: 160 }, { label: 'large', w: 900, h: 700 }, { label: 'very-wide', w: 1100, h: 160 },
    ]) {
      const landed = await resizeShapeTo(page, ids.resizeProbeBranch, w, h)
      await selectAndSettle(page, ids.resizeProbeBranch, { minZoom: 1.5 })
      checkShape(`resize branch ${sizeLabel} (${landed.w}x${landed.h})`, await measure(page, ids.resizeProbeBranch, 'branch'))
      if (sizeLabel === 'large') {
        const shotName = 'port-outline-gallery-resize-branch-large-2026-09-03.png'
        const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
        await writeFile(join(SHOTS, shotName), Buffer.from(capture.data, 'base64'))
        resizeShots.push({ label: 'branch-large', w: landed.w, h: landed.h, file: shotName })
      }
    }

    // Loop floors at LOOP_MIN_WIDTH x LOOP_MIN_HEIGHT (reconcileLoopProps) —
    // 'tiny' below is intentionally under that floor, to prove the floor
    // itself doesn't leave iterable/item stranded at some earlier position.
    for (const { label: sizeLabel, w, h } of [
      { label: 'tiny', w: 200, h: 120 }, { label: 'large', w: 900, h: 600 }, { label: 'very-wide', w: 1100, h: 190 },
    ]) {
      const landed = await resizeShapeTo(page, ids.resizeProbeLoop, w, h)
      await selectAndSettle(page, ids.resizeProbeLoop, { minZoom: 1.5 })
      checkShape(`resize loop ${sizeLabel} (${landed.w}x${landed.h})`, await measure(page, ids.resizeProbeLoop, 'loop'))
      if (sizeLabel === 'large') {
        const shotName = 'port-outline-gallery-resize-loop-large-2026-09-03.png'
        const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
        await writeFile(join(SHOTS, shotName), Buffer.from(capture.data, 'base64'))
        resizeShots.push({ label: 'loop-large', w: landed.w, h: landed.h, file: shotName })
      }
    }

    // The literal user gesture, not just the API it calls underneath: drag
    // the real bottom-right resize handle and re-check afterward.
    await selectAndSettle(page, ids.resizeProbe, { minZoom: 1.5 })
    const handle = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const overlay = editor.overlays.getCurrentOverlays().find((o) => o.id === 'selection_fg:bottom_right')
      const point = editor.pageToScreen(editor.overlays.getOverlayGeometry(overlay).bounds.center)
      return JSON.stringify(point)
    })()`))
    await mouse(page, 'mouseMoved', handle.x, handle.y)
    await delay(100)
    await mouse(page, 'mousePressed', handle.x, handle.y, { buttons: 1 })
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved', handle.x + (220 * step / 10), handle.y + (140 * step / 10), { buttons: 1 })
      await delay(20)
    }
    await mouse(page, 'mouseReleased', handle.x + 220, handle.y + 140)
    await delay(300)
    await selectAndSettle(page, ids.resizeProbe, { minZoom: 1.5 })
    checkShape('resize probe dragged by hand', await measure(page, ids.resizeProbe, 'block'))
    const draggedShot = 'port-outline-gallery-resize-dragged-2026-09-03.png'
    const draggedCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(SHOTS, draggedShot), Buffer.from(draggedCapture.data, 'base64'))
    resizeShots.push({ label: 'dragged', file: draggedShot })
    await writeFile(join(SHOTS, 'port-outline-gallery-resize-manifest-2026-09-03.json'), JSON.stringify(resizeShots, null, 2))

    await writeFile(RESULTS, JSON.stringify(checks, null, 2))
  } finally {
    app.close()
  }

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length > 0) {
    console.error(`${failed.length} FAILED`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
