#!/usr/bin/env node
/**
 * Visual QA sweep for the Loop region.
 *
 * Not a pass/fail journey — a capture rig. It drives the region through the
 * cases that actually break a canvas UI (degenerate sizes, long strings,
 * nesting, theme, zoom, selection chrome, fan-out, export) and writes one
 * screenshot per case plus a machine-readable observation. A human or a vision
 * model then looks at every frame and says what is wrong.
 *
 *   node tests/loop_region_qa.mjs            # all cases
 *   node tests/loop_region_qa.mjs wide turn  # just those
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, deselect, dragFrom, drawBlock, portDot } from './block_journey_helpers.mjs'

const OUT = join(ROOT, 'docs', 'assets', 'loop-qa')
const observations = []

const ed = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function shot(page, name, clip) {
  const options = { format: 'png' }
  if (clip) options.clip = { ...clip, scale: 1 }
  const png = await page.send('Page.captureScreenshot', options)
  await writeFile(join(OUT, `${name}.png`), Buffer.from(png.data, 'base64'))
}

function observe(name, note, data) {
  observations.push({ case: name, note, ...data })
  process.stdout.write(`  ${name.padEnd(22)} ${note}\n`)
}

/**
 * Reset to one loop of a given size and props, centred in view.
 *
 * The cancel-and-reset preamble is not decoration. Without it the sweep was
 * order-dependent: `tap-port` leaves an on-canvas picker open, and the `export`
 * case that followed reported the region's chrome missing from the SVG — a
 * defect that vanished when the case ran alone. A rig that lies about a real
 * feature is worse than no rig.
 */
async function seedLoop(page, props = {}) {
  await key(page, 'Escape', 'Escape')
  await delay(200)
  await ed(page, `
    editor.setCurrentTool('select')
    editor.selectNone()
    return ''`)
  await delay(200)
  await ed(page, `
    editor.selectAll(); editor.deleteShapes(editor.getSelectedShapeIds())
    editor.createShape({
      id: 'shape:qa-loop', type: 'loop', x: 200, y: 160,
      props: { w: 640, h: 380, title: 'For Loop',
        iterable: { id: 'iterable', type: 'Iterable' },
        item: { id: 'item', type: 'Iter' },
        turn: '', ...${JSON.stringify(props)} },
    })
    editor.zoomToFit({ animation: { duration: 0 } })
    editor.zoomOut(editor.getViewportScreenCenter(), { animation: { duration: 0 } })
    return ''`)
  await delay(420)
}

/** What the painted region reports about itself, in client pixels. */
const paint = (page) => ed(page, `
  const loop = editor.getCurrentPageShapes().find((s) => s.type === 'loop')
  if (!loop) return JSON.stringify({ loop: null })
  const node = document.querySelector('[data-shape-id="' + loop.id + '"]')
  // The painted region's own border box, not the shape wrapper: the wrapper is
  // not what a reader sees the chip sitting inside.
  const face = node?.querySelector('.systemsketch-loop-canvas')
  const rect = (face ?? node)?.getBoundingClientRect() ?? null
  const read = (selector) => {
    const element = node?.querySelector(selector)
    if (!element) return null
    const r = element.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, text: element.textContent.trim() }
  }
  const overlaps = (a, b) => !!a && !!b
    && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const title = read('.Loop-title')
  const turn = read('.Loop-turn')
  const iterable = read('[data-testid="loop-port-label-iterable"]')
  const item = read('[data-testid="loop-port-label-item"]')
  return JSON.stringify({
    loop: { w: loop.props.w, h: loop.props.h },
    rect: rect && { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    title, turn, iterable, item,
    titleOverTurn: overlaps(title, turn),
    titleOverIterable: overlaps(title, iterable),
    titleOverItem: overlaps(title, item),
    iterableOverItem: overlaps(iterable, item),
    turnInsideRegion: !!turn && !!rect && turn.x >= rect.x - 1 && turn.x + turn.w <= rect.x + rect.w + 1,
    footer: !!node?.querySelector('.Loop-footer'),
    ports: node ? node.querySelectorAll('.Port').length : 0,
  })`).then(JSON.parse)

const CASES = {
  /** The shipped default, as a baseline to compare every other frame against. */
  async baseline(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    const state = await paint(page)
    observe('baseline', `title/turn/labels clear: ${!state.titleOverTurn && !state.titleOverIterable}`, state)
    await shot(page, 'baseline')
  },

  /** Wide and short: the header's three tenants compete for one row. */
  async wide(page) {
    await seedLoop(page, { w: 1180, h: 200, turn: 'iteration 3 of 7' })
    const state = await paint(page)
    observe('wide', `footer=${state.footer} titleOverTurn=${state.titleOverTurn}`, state)
    await shot(page, 'wide')
  },

  /** Narrow: the centred title has nowhere to go. */
  async narrow(page) {
    await seedLoop(page, { w: 300, h: 420, turn: 'iteration 3 of 7' })
    const state = await paint(page)
    observe('narrow', `titleOverTurn=${state.titleOverTurn} titleOverIterable=${state.titleOverIterable}`, state)
    await shot(page, 'narrow')
  },

  /** At its floor, where the footer must yield rather than overlap. */
  async floor(page) {
    await seedLoop(page, { w: 300, h: 180 })
    const state = await paint(page)
    observe('floor', `h=${state.loop?.h} footer=${state.footer} ports=${state.ports}`, state)
    await shot(page, 'floor')
  },

  /** A turn string nobody sized the chip for. */
  async turn(page) {
    await seedLoop(page, { turn: 'iteration 128 of 4096 · 31 ms/turn' })
    const state = await paint(page)
    const edge = state.turn && state.rect
      ? Math.round((state.rect.x + state.rect.w) - (state.turn.x + state.turn.w))
      : null
    observe('turn', `chip right edge is ${edge}px inside the region · overTitle=${state.titleOverTurn}`, state)
    await shot(page, 'turn')
  },

  /** Types long enough to reach the centred title. */
  async longTypes(page) {
    await seedLoop(page, {
      w: 520,
      turn: 'iteration 3 of 7',
      iterable: { id: 'iterable', type: 'Sequence[Mapping[str, Pose]]' },
      item: { id: 'item', type: 'Mapping[str, Pose]' },
    })
    const state = await paint(page)
    observe('long-types', `titleOverIterable=${state.titleOverIterable} iterableOverItem=${state.iterableOverItem}`, state)
    await shot(page, 'long-types')
  },

  /** Selected: stock resize handles and semantic port dots share the edge. */
  async selected(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    await ed(page, `editor.select('shape:qa-loop'); return ''`)
    await delay(420)
    observe('selected', 'stock selection chrome over the header ports', {})
    await shot(page, 'selected')
  },

  /** Empty title: does the header collapse to nothing readable? */
  async untitled(page) {
    await seedLoop(page, { title: '', turn: 'iteration 3 of 7' })
    const state = await paint(page)
    observe('untitled', `title text=${JSON.stringify(state.title?.text ?? null)}`, state)
    await shot(page, 'untitled')
  },

  /** Far out: ports and labels at board-overview zoom. */
  async zoomedOut(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    await ed(page, `
      for (let i = 0; i < 4; i += 1) editor.zoomOut(editor.getViewportScreenCenter(), { animation: { duration: 0 } })
      return ''`)
    await delay(420)
    const state = await paint(page)
    observe('zoomed-out', `painted w=${Math.round(state.rect?.w ?? 0)}px ports=${state.ports}`, state)
    await shot(page, 'zoomed-out')
  },

  /** Dark theme: the region derives its colours from --tl-* tokens. */
  async dark(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    await ed(page, `editor.user.updateUserPreferences({ colorScheme: 'dark' }); return ''`)
    await delay(620)
    observe('dark', 'region chrome in dark theme', {})
    await shot(page, 'dark')
    await ed(page, `editor.user.updateUserPreferences({ colorScheme: 'light' }); return ''`)
    await delay(420)
  },

  /** One element, three consumers: the item port fans out. */
  async fanOut(page) {
    await seedLoop(page, { w: 760, h: 520, turn: 'iteration 3 of 7' })
    await ed(page, `
      const ids = ['a', 'b', 'c']
      ids.forEach((name, index) => {
        editor.createShape({
          id: 'shape:qa-' + name, type: 'block', x: 460, y: 250 + index * 130,
          parentId: 'shape:qa-loop',
          props: { title: name + '()', view: 'port', w: 260, h: 154,
            inputs: [{ id: 'in_1', name: 'item', type: 'Iter', visible: true }],
            outputs: [] },
        })
        const cable = 'shape:qa-cable-' + name
        editor.createShape({ id: cable, type: 'connection', x: 0, y: 0, props: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } })
        editor.createBinding({ type: 'connection', fromId: cable, toId: 'shape:qa-loop', props: { portId: 'item', terminal: 'start', face: 'outer' } })
        editor.createBinding({ type: 'connection', fromId: cable, toId: 'shape:qa-' + name, props: { portId: 'in_1', terminal: 'end', face: 'outer' } })
      })
      editor.zoomToFit({ animation: { duration: 0 } })
      return ''`)
    await delay(700)
    const cables = await ed(page, `
      const shapes = editor.getCurrentPageShapes().filter((s) => s.type === 'connection')
      const bindings = editor.store.allRecords().filter((r) => r.typeName === 'binding' && r.type === 'connection')
      return JSON.stringify({
        cables: shapes.length,
        orphans: shapes.filter((c) => bindings.filter((b) => b.fromId === c.id).length !== 2).length,
      })`).then(JSON.parse)
    observe('fan-out', `cables=${cables.cables} orphans=${cables.orphans}`, cables)
    await shot(page, 'fan-out')
  },

  /** A loop inside a loop: containment, and two headers stacked. */
  async nested(page) {
    await seedLoop(page, { w: 820, h: 560, turn: 'outer 2 of 4' })
    await ed(page, `
      editor.createShape({
        id: 'shape:qa-inner', type: 'loop', x: 300, y: 300, parentId: 'shape:qa-loop',
        props: { w: 520, h: 320, title: 'For Loop',
          iterable: { id: 'iterable', type: 'Iterable' },
          item: { id: 'item', type: 'Iter' }, turn: 'inner 5 of 9' },
      })
      editor.zoomToFit({ animation: { duration: 0 } })
      return ''`)
    await delay(620)
    const nest = await ed(page, `
      const inner = editor.getShape('shape:qa-inner')
      return JSON.stringify({ parent: inner?.parentId ?? null,
        children: editor.getSortedChildIdsForParent('shape:qa-loop').length })`).then(JSON.parse)
    observe('nested', `inner parent=${nest.parent} outer children=${nest.children}`, nest)
    await shot(page, 'nested')
  },

  /** A tap on the item port, which should offer a Block rather than arm a cable. */
  async tapPort(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    const dot = await box(page, portDot('shape:qa-loop', 'output', 'item'))
    await clickAt(page, dot.cx, dot.cy)
    await delay(620)
    const picker = await evaluate(page,
      `document.querySelectorAll('[data-testid="block-picker"]').length`)
    // And it must open BELOW the port, not on top of the header the cable
    // just left, because that is the direction the cable points.
    const below = JSON.parse(await evaluate(page, `(() => {
      const panel = document.querySelector('[data-testid="block-picker"]')
      const port = document.querySelector('[data-testid="loop-port-dot-item"]')
      if (!panel || !port) return JSON.stringify(null)
      const a = panel.getBoundingClientRect()
      const b = port.getBoundingClientRect()
      return JSON.stringify({ dy: Math.round(a.top - b.bottom), dx: Math.round(a.left - b.left) })
    })()`))
    await shot(page, 'tap-port')
    await key(page, 'Escape', 'Escape')
    await delay(300)
    // The control: the SAME tap on an ordinary Block port. If this is 0 too,
    // the picker simply does not answer a synthetic click and there is nothing
    // Loop-specific to fix.
    await ed(page, `
      editor.createShape({ id: 'shape:qa-control', type: 'block', x: 200, y: 620,
        props: { title: 'control()', view: 'port', w: 260, h: 154,
          inputs: [], outputs: [{ id: 'out_1', name: 'v', type: 'Iter', visible: true }] } })
      return ''`)
    await delay(420)
    const controlDot = await box(page, portDot('shape:qa-control', 'output', 'out_1'))
    await clickAt(page, controlDot.cx, controlDot.cy)
    await delay(620)
    const control = await evaluate(page,
      `document.querySelectorAll('[data-testid="block-picker"]').length`)
    observe('tap-port',
      `picker on a Loop port=${picker}, on a Block port=${control} · opens ${below ? below.dy + 'px below' : 'nowhere'}`,
      { picker, control, below })
    await shot(page, 'tap-port-control')
    await key(page, 'Escape', 'Escape')
    await delay(300)
  },

  /** The inspector: three sections, two types, and no name field anywhere. */
  async inspector(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    await ed(page, `editor.select('shape:qa-loop'); return ''`)
    await waitFor(page, `document.querySelector('[data-testid="loop-inspector"]')`,
      'loop inspector', 8000)
    await delay(520)
    const panel = JSON.parse(await evaluate(page, `(() => {
      const node = document.querySelector('[data-testid="loop-inspector"]')
      const rect = node.getBoundingClientRect()
      return JSON.stringify({
        sections: Array.from(node.querySelectorAll('[data-inspector-section]'))
          .map((n) => n.dataset.inspectorSection),
        fields: Array.from(node.querySelectorAll('input')).map((n) => n.getAttribute('aria-label')),
        clipped: node.scrollHeight > Math.ceil(rect.height) + 1,
      })
    })()`))
    observe('inspector',
      `sections=${panel.sections.length} fields=${panel.fields.length} clipped=${panel.clipped}`,
      panel)
    await shot(page, 'inspector')
  },

  /** SVG export: the region's chrome without the browser's HTML. */
  async exported(page) {
    await seedLoop(page, { turn: 'iteration 3 of 7' })
    // The control: a Branch exports its band title through the same frame-like
    // path. If the Branch's title is missing too, this is not Loop-specific.
    await ed(page, `
      editor.createShape({ id: 'shape:qa-branch', type: 'branch', x: 200, y: 620,
        props: { w: 360, h: 220, title: 'If Branch' } })
      return ''`)
    await delay(420)
    const svg = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const result = await editor.getSvgString([...editor.getCurrentPageShapeIds()], { background: false })
      const text = result?.svg ?? ''
      return JSON.stringify({
        hasSvg: !!text,
        bytes: text.length,
        title: text.includes('For Loop'),
        types: (text.match(/>Iterable<|>Iter</g) ?? []).length,
        turn: text.includes('iteration 3 of 7'),
        branchTitleControl: text.includes('If Branch'),
      })
    })()`))
    observe('export',
      `loop title=${svg.title} types=${svg.types} turn=${svg.turn} · BRANCH control=${svg.branchTitleControl} · ${svg.bytes}B`,
      svg)
  },
}

async function run() {
  const wanted = process.argv.slice(2)
  const names = Object.keys(CASES).filter((name) => (
    wanted.length === 0 || wanted.some((want) => name.toLowerCase().includes(want.toLowerCase()))
  ))
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'loop-qa', build: 'loop-qa', width: 1500, height: 940 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'window.__systemsketch?.editor', 'editor')
    await delay(700)
    for (const name of names) {
      await CASES[name](page)
    }
    const errors = localConsoleErrors(page)
    observe('console', `local errors=${errors.length}`, { errors: errors.slice(0, 5) })
  } finally {
    app.close()
  }
  await writeFile(join(OUT, 'observations.json'), JSON.stringify({ observations }, null, 2))
  process.stdout.write(`\n${names.length} cases captured into docs/assets/loop-qa/\n`)
}

run().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
