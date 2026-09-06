#!/usr/bin/env node
/**
 * Real-browser proof for the React-Flow-homepage marching-ants treatment on
 * a plain `data` cable: `ConnectionShapeUtil.tsx`'s `DataCablePath` (V1,
 * 2026-09-05, Zach's literal ask — see the WHY comment there).
 *
 * A drawn cable's stroke-dashoffset is a CSS animation, not a static SVG
 * attribute, so the one proof that actually matters is that it MOVES: two
 * `getComputedStyle` reads a beat apart must disagree, and two screenshots of
 * the same cable region a beat apart must disagree in bytes too — code that
 * merely LOOKS right (attribute present, class applied) has shipped broken
 * before in this app when the SVG/viewBox setup swallowed the motion.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
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
  portDot,
  setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const SHOT = join(SHOTS, 'data-cable-march-acceptance.png')
const OUT = join(SHOTS, 'data-cable-march-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
  return ok
}

function checkTruthy(id, label, observed) {
  const ok = Boolean(observed)
  results.push({ id, label, observed, desired: 'truthy', ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n`),
  )
  return ok
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function portBlock(page, from, to, title) {
  const before = new Set(await blockIds(page))
  await drawBlock(page, from, to, title)
  await addPort(page, 'inputs')
  await addPort(page, 'outputs')
  await setView(page, 'port')
  await deselect(page, { x: 80, y: 900 })
  return (await blockIds(page)).find((id) => !before.has(id))
}

async function cableRecord(page) {
  return JSON.parse(await editorEval(page, `
    const cable = editor.getCurrentPageShapes().find((shape) => shape.type === 'connection')
    return JSON.stringify({ id: cable.id, temporal: cable.props.temporal })`))
}

/** The live painted path: its static attributes plus two dashoffset reads a beat apart. */
async function paintedMotion(page, cableId) {
  return JSON.parse(await evaluate(page, `(async () => {
    const root = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"]')
    const path = root?.querySelector('path[data-edge-type="data"]')
    if (!path) return JSON.stringify({ found: false })
    const cls = path.getAttribute('class') ?? ''
    const dash = path.getAttribute('stroke-dasharray')
    const cap = getComputedStyle(path).strokeLinecap
    const animationName = getComputedStyle(path).animationName
    const first = getComputedStyle(path).strokeDashoffset
    await new Promise((resolve) => setTimeout(resolve, 260))
    const second = getComputedStyle(path).strokeDashoffset
    return JSON.stringify({ found: true, cls, dash, cap, animationName, first, second, moved: first !== second })
  })()`))
}

async function reducedMotionState(page, cableId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"]')
    const path = root?.querySelector('path[data-edge-type="data"]')
    return JSON.stringify({ animationName: getComputedStyle(path).animationName })
  })()`))
}

async function clipShot(page, selector) {
  const rect = await box(page, selector)
  const capture = await page.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x - 4, y: rect.y - 4, width: rect.w + 8, height: rect.h + 8, scale: 1 },
    captureBeyondViewport: true,
  })
  return Buffer.from(capture.data, 'base64')
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-data-cable-march',
    build: 'data-cable-march',
    width: 1400,
    height: 900,
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    const source = await portBlock(page, { x: 100, y: 300 }, { x: 350, y: 430 }, 'emit()')
    const sink = await portBlock(page, { x: 550, y: 300 }, { x: 800, y: 430 }, 'receive()')
    await dragFrom(page, await box(page, portDot(source, 'output', 'out_1')), await box(page, portDot(sink, 'input', 'in_1')))
    await deselect(page, { x: 80, y: 850 })

    const cable = await cableRecord(page)
    check('DCM-1', 'a freshly drawn cable is the plain `data` kind', cable.temporal, 'data')

    const pathSelector = `[data-shape-id="${cable.id}"] path[data-edge-type="data"]`

    const motion = await paintedMotion(page, cable.id)
    checkTruthy('DCM-2', 'the data cable path is found and painted', motion.found)
    check('DCM-3', 'stroke-dasharray matches the React-Flow-read 5px cadence', motion.dash, '5')
    check('DCM-4', 'butt caps, matching the reference site (not the round default)', motion.cap, 'butt')
    check('DCM-5', 'the CSS animation is actually attached', motion.animationName, 'systemsketch-data-cable-march')
    checkTruthy('DCM-6', 'stroke-dashoffset genuinely changed between two reads 260ms apart', motion.moved)

    const shotA = await clipShot(page, pathSelector)
    await delay(260)
    const shotB = await clipShot(page, pathSelector)
    checkTruthy('DCM-7', 'a real screenshot of the cable region changed pixel bytes between frames', !shotA.equals(shotB))

    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await delay(120)
    const reduced = await reducedMotionState(page, cable.id)
    check('DCM-8', 'prefers-reduced-motion turns the animation off', reduced.animationName, 'none')
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await delay(120)

    const exported = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const result = await editor.getSvgString([${JSON.stringify(cable.id)}], { background: false })
      if (!result || typeof result.svg !== 'string' || result.svg.length === 0) {
        return JSON.stringify({ ok: false, reason: 'empty export' })
      }
      const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
      if (svg.querySelector('parsererror')) return JSON.stringify({ ok: false, reason: 'unparsable svg' })
      const path = svg.querySelector('[data-edge-type="data"]')
      const raw = result.svg
      return JSON.stringify({
        ok: true,
        dash: path?.getAttribute('stroke-dasharray') ?? null,
        hasHole: /undefined|NaN/.test(raw),
        // React Flow's own export omits the animation on a static document —
        // this app follows suit: a baked, frozen dash pattern, no CSS/keyframes.
        carriesLiveAnimation: raw.includes('systemsketch-data-cable-march') || raw.includes('@keyframes'),
      })
    })()`))
    check('DCM-9', 'toSvg export succeeds and has no template holes', { ok: exported.ok, hasHole: exported.hasHole }, { ok: true, hasHole: false })
    check('DCM-10', 'export bakes the static dash pattern in place of the live animation', exported.dash, '5')
    check('DCM-11', 'export carries no animation/keyframes — a static snapshot, same as the live dasharray', exported.carriesLiveAnimation, false)

    await editorEval(page, 'editor.selectNone(); return true')
    await delay(200)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    check('DCM-12', 'the happy path produced no local console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`${results.length - failed.length}/${results.length} passed → ${OUT}\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })
