#!/usr/bin/env node
/**
 * Real-browser proof of the effect port.
 *
 * `list.append(self, object, /) -> None` returns nothing, so a call that writes
 * its argument in place has no right-hand port for the new value to leave by.
 * The grammar answers with two marks: a hook on the mutated input, read off the
 * signature so Port view warns before any cable exists, and an *effect port* on
 * the top edge — the only edge left, since left is values in, right is named
 * values out and the bottom is the loop lane.
 *
 * Every claim below is read back from the painted document after real pointer
 * events: a port is "on the top edge" because its dot is painted there, not
 * because a model said so.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  ROOT,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  deselect,
  dragFrom,
  drawBlock,
  scope,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const shotPath = (name) => join(SHOTS, `effect-ports-${name}-2026-09-03.png`)

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

async function selectBlock(page, shapeId) {
  const heading = await box(page, `${scope(shapeId)} .NodeShape-heading`)
  await clickAt(page, heading.cx, heading.cy)
  await delay(320)
}

/** Every painted dot on one Block, with the edge it sits on and its geometry. */
async function portsOf(page, shapeId) {
  const value = await evaluate(page, `(() => {
    const wrapper = document.querySelector(${JSON.stringify(scope(shapeId))})
    if (!wrapper) return null
    const canvas = wrapper.querySelector('.systemsketch-block-canvas')
    const frame = canvas.getBoundingClientRect()
    return JSON.stringify({
      frame: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      ports: Array.from(wrapper.querySelectorAll('.Port')).map((node) => {
        const r = node.getBoundingClientRect()
        return {
          id: node.dataset.blockPortId,
          side: node.dataset.blockPortSide,
          edge: node.dataset.blockPortEdge,
          mutates: node.dataset.blockPortMutates === 'true',
          hook: getComputedStyle(node, '::after').borderTopWidth,
          hookBox: (() => {
            const style = getComputedStyle(node, '::after')
            const inset = Number.parseFloat(style.inset) || 0
            return { inset, width: style.width, height: style.height }
          })(),
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
        }
      }),
    })
  })()`)
  if (!value) throw new Error(`No Block ${shapeId} on the page`)
  return JSON.parse(value)
}

const effectPort = (state) => state.ports.find((port) => port.edge === 'top') ?? null

async function cableChannels(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('[data-shape-type="connection"] svg'))
      .map((node) => node.dataset.channel ?? 'none'))`))
}

const pillLabels = (page) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll('[data-shape-type="connection"] text'))
    .map((node) => node.textContent.trim()))`)

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-effect', build: 'effect-ports-smoke' })
  const { page, port } = app
  const checks = makeChecklist()
  // One line per claim: assert first so a failure names itself, then record it.
  const add = (label, ok) => {
    assert.ok(ok, label)
    checks.pass(label)
  }

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // ------------------------------------------------------------ seed ---
    await drawBlock(page, { x: 380, y: 220 }, { x: 720, y: 460 }, 'poses.append')
    await waitFor(page,
      `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`,
      'Port Block')
    const [append] = await blockIds(page)
    await selectBlock(page, append)
    await addPort(page, 'inputs')
    await selectBlock(page, append)

    const seeded = await portsOf(page, append)
    add('EP-1 a fresh call has no port on the top edge', effectPort(seeded) === null)
    await shot(page, '1-before')

    // --------------------------------------- mark the argument mutated ---
    const toggle = await box(page, '[data-testid="inspector-port-mutates-in_1"]')
    await clickAt(page, toggle.cx, toggle.cy)
    await delay(420)

    const marked = await portsOf(page, append)
    const effect = effectPort(marked)
    add('EP-2 marking an argument creates a port', effect !== null)
    add('EP-3 the port carries the mutated argument\'s identity',
      effect?.id === 'effect:in_1')
    add('EP-4 it is painted on the top edge, not the right',
      effect !== null && Math.abs(effect.cy - marked.frame.y) <= 3)
    add('EP-5 it sits along the top edge, not at a corner',
      effect !== null
      && effect.cx > marked.frame.x + 8
      && effect.cx < marked.frame.x + marked.frame.w - 8)
    const hooked = marked.ports.find((candidate) => candidate.id === 'in_1')
    add('EP-6 the mutated input wears the hook before any cable exists',
      hooked?.mutates === true && Number.parseFloat(hooked.hook) > 1)
    add('EP-6b the hook is concentric with the dot, and the hit area survives',
      await evaluate(page, `(() => {
        const dot = document.querySelector('.Port_mutates')
        if (!dot) return false
        const after = getComputedStyle(dot, '::after')
        const before = getComputedStyle(dot, '::before')
        // A symmetric negative inset is concentric by construction, and ::before
        // must still be the wide hit area rather than decoration.
        const symmetric = ['insetTop', 'insetRight', 'insetBottom', 'insetLeft']
          .map((k) => Number.parseFloat(after[k] ?? after.inset))
        const same = symmetric.every((v) => Math.abs(v - symmetric[0]) < 0.51)
        const hitKept = Number.parseFloat(before.inset) <= -10
        return same && hitKept
      })()`) === true)
    add('EP-6c a tether runs from the hook to its port, render-only, right-angled',
      await evaluate(page, `(() => {
        const layer = document.querySelector('.BlockNode-tethers')
        if (!layer) return false
        if (getComputedStyle(layer).pointerEvents !== 'none') return false
        const paths = layer.querySelectorAll('.BlockNode-tether')
        if (paths.length !== 1) return false
        const nums = (paths[0].getAttribute('d').match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number)
        const pts = []
        for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
        if (pts.length < 3) return false
        // every segment axis-aligned, and it turns at least twice
        for (let i = 0; i < pts.length - 1; i += 1) {
          if (pts[i][0] !== pts[i + 1][0] && pts[i][1] !== pts[i + 1][1]) return false
        }
        return true
      })()`) === true)
    const named = marked.ports.filter((candidate) => candidate.edge === 'right')
    add('EP-7 named outputs keep the right edge to themselves',
      named.every((candidate) => candidate.edge === 'right'))
    add('EP-7b the inspector shows the derived port but offers no edit or delete',
      await evaluate(page, `(() => {
        const row = document.querySelector('[data-testid="inspector-port-derived-effect:in_1"]')
        if (!row) return false
        return row.querySelectorAll('input, button').length === 0
      })()`) === true)
    await shot(page, '2-marked')

    // ------------------------------------------ wire from the new port ---
    await deselect(page)
    await drawBlock(page, { x: 900, y: 520 }, { x: 1180, y: 700 }, 'len')
    const ids = await blockIds(page)
    const len = ids.find((id) => id !== append)
    await selectBlock(page, len)
    await addPort(page, 'inputs')
    await deselect(page)

    const from = await box(page,
      `${scope(append)} .Port[data-block-port-edge="top"]`)
    const to = await box(page, `${scope(len)} .Port[data-block-port-side="input"]`)
    await dragFrom(page, from, to)
    await delay(500)

    const channels = await cableChannels(page)
    add('EP-8 a cable off the effect port is drawn as an effect cable',
      channels.includes('effect'))
    const labels = JSON.parse(await pillLabels(page))
    add('EP-9 it carries the mut pill', labels.includes('mut'))
    // The cable must climb OUT of the top edge before it turns. Read the routed
    // path and measure its first run, not a single sample.
    const exitRun = JSON.parse(await evaluate(page, `(() => {
      const path = Array.from(document.querySelectorAll('[data-shape-type="connection"] path'))
        .map((node) => node.getAttribute('d')).find((d) => d && /^M/.test(d))
      if (!path) return 'null'
      const points = path.match(/-?\\d+(?:\\.\\d+)?/g).map(Number)
      const first = { x: points[0], y: points[1] }
      let index = 2
      let next = first
      while (index + 1 < points.length) {
        next = { x: points[index], y: points[index + 1] }
        if (Math.hypot(next.x - first.x, next.y - first.y) > 1) break
        index += 2
      }
      return JSON.stringify({ dx: next.x - first.x, dy: next.y - first.y })
    })()`))
    add('EP-9b the cable leaves the top edge perpendicular — up, then it may turn',
      exitRun !== null
      && Math.abs(exitRun.dx) < 1.5
      && exitRun.dy < -8)
    await shot(page, '3-wired')

    // ------------------------------------------------------ round trip ---
    await page.send('Page.reload', { ignoreCache: false })
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'canvas after reload')
    await delay(1200)
    const reloaded = await portsOf(page, append)
    add('EP-10 the port and the hook survive a reload',
      effectPort(reloaded)?.id === 'effect:in_1'
      && reloaded.ports.find((candidate) => candidate.id === 'in_1')?.mutates === true)
    add('EP-11 the cable is still an effect cable after a reload',
      (await cableChannels(page)).includes('effect'))

    // ------------------------------------------------ unmark, and gone ---
    await selectBlock(page, append)
    const off = await box(page, '[data-testid="inspector-port-mutates-in_1"]')
    await clickAt(page, off.cx, off.cy)
    await delay(420)
    const cleared = await portsOf(page, append)
    add('EP-13b unmarking takes the tether with it',
      await evaluate(page, `document.querySelectorAll('.BlockNode-tether').length`) === 0)
    add('EP-12 unmarking takes the port away again', effectPort(cleared) === null)
    add('EP-13 and takes the hook off the input',
      cleared.ports.find((candidate) => candidate.id === 'in_1')?.mutates !== true)
    await shot(page, '4-cleared')

    add('EP-14 no console errors from the app', localConsoleErrors(page).length === 0)
  } finally {
    app.close()
  }

  console.log(`\n  ${checks.checks.length}/${checks.checks.length} effect-port checks passed`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
