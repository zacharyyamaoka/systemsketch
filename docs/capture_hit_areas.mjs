#!/usr/bin/env node
/**
 * Capture the proposed hit areas, drawn in red, straight from the running app.
 *
 * The regions that decide "did I hit that" are invisible, so the only way to
 * have an opinion about them is to look at them. Every rectangle in these shots
 * is painted by `HitAreaOverlay`, which reads the SAME functions the hit tests
 * call — a picture that disagreed with the behaviour would be worse than none.
 *
 * Output: docs/assets/hitarea-*.png, consumed by docs/build_hit_area_proposal.py
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
  process.stdout.write(`  wrote ${name}\n`)
}

async function box(page, selector) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const r = element.getBoundingClientRect()
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height })
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  const r = JSON.parse(value)
  return { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
}

async function pointOnCable(page, t) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-type="connection"] path')
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * ${t})
    const screen = point.matrixTransform(path.getScreenCTM())
    return JSON.stringify({ cx: screen.x, cy: screen.y })
  })()`)
  if (!value) throw new Error('No cable')
  return JSON.parse(value)
}

async function drawBlock(page, from, to, title) {
  await key(page, 'b', 'KeyB')
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 6; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(250)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  await waitFor(page, `document.querySelector('[aria-label="${label}"]')`, label, 8000)
  const button = await box(page, `[aria-label="${label}"]`)
  await clickAt(page, button.cx, button.cy)
  await delay(280)
}

const deselect = async (page) => { await clickAt(page, 1250, 850); await delay(260) }

async function setRouting(page, at, routing) {
  const label = routing[0].toUpperCase() + routing.slice(1)
  await clickAt(page, at.cx, at.cy, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.connection-routing-button"]')`,
    'routing submenu')
  const trigger = await box(page, '[data-testid="context-menu-sub.connection-routing-button"]')
  await mouse(page, 'mouseMoved', trigger.cx, trigger.cy)
  await delay(200)
  await clickAt(page, trigger.cx, trigger.cy)
  const optionSelector = '[data-testid="context-menu-sub.connection-routing-content"] .tlui-button__checkbox'
  await waitFor(page,
    `Array.from(document.querySelectorAll('${optionSelector}'))
      .some((node) => node.textContent.trim() === ${JSON.stringify(label)})`, `${routing}`)
  const rect = JSON.parse(await evaluate(page, `(() => {
    const option = Array.from(document.querySelectorAll('${optionSelector}'))
      .find((node) => node.textContent.trim() === ${JSON.stringify(label)})
    const r = option.getBoundingClientRect()
    return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
  })()`))
  await clickAt(page, rect.cx, rect.cy)
  await delay(420)
  await key(page, 'Escape', 'Escape')
  await delay(220)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'hit-areas', build: 'hit-areas', width: 1440, height: 960 })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev&hitareas=1')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`, 'canvas')
    await delay(800)

    // ---- a Block with no ports yet: where does the add gutter go? ---------
    await drawBlock(page, { x: 260, y: 200 }, { x: 700, y: 620 }, 'block')
    await delay(400)
    await shot(page, 'hitarea-no-ports.png')

    // ---- the same Block, with ports ---------------------------------------
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await delay(400)
    await shot(page, 'hitarea-ports.png')
    await deselect(page)

    // ---- a clean board for the cable shots ---------------------------------
    // The port Block above would otherwise sit under the cable and steal the
    // clicks that select it.
    await deselect(page)
    await shortcut(page, 'a', 'KeyA', 2)
    await key(page, 'Delete', 'Delete')
    await delay(400)

    // ---- a wrapping cable, in all three routings --------------------------
    await drawBlock(page, { x: 220, y: 620 }, { x: 500, y: 790 }, 'source')
    await addPort(page, 'outputs')
    await deselect(page)
    await drawBlock(page, { x: 800, y: 150 }, { x: 1080, y: 320 }, 'sink')
    await addPort(page, 'inputs')
    await deselect(page)

    const out = await box(page,
      '[data-shape-type="block"]:last-of-type .Port[data-block-port-side="output"]')
      .catch(() => null)
    const outs = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.Port[data-block-port-side="output"]'))
        .map((n) => { const r = n.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } })))()`))
    const ins = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.Port[data-block-port-side="input"]'))
        .map((n) => { const r = n.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } })))()`))
    void out
    // The lowest output is `source`; the highest input is `sink`.
    const from = outs.reduce((best, p) => (p.cy > best.cy ? p : best))
    const to = ins.reduce((best, p) => (p.cy < best.cy ? p : best))

    await mouse(page, 'mouseMoved', from.cx, from.cy)
    await mouse(page, 'mousePressed', from.cx, from.cy, { buttons: 1 })
    for (let step = 1; step <= 10; step += 1) {
      await mouse(page, 'mouseMoved',
        from.cx + ((to.cx - from.cx) * step) / 10,
        from.cy + ((to.cy - from.cy) * step) / 10,
        { buttons: 1 })
      await delay(24)
    }
    await mouse(page, 'mouseReleased', to.cx, to.cy)
    await delay(450)
    await deselect(page)

    for (const routing of ['curved', 'straight', 'elbow']) {
      // The routing submenu only appears for a selected cable, so select first.
      const at = await pointOnCable(page, 0.25)
      await clickAt(page, at.cx, at.cy)
      await delay(420)
      if (routing !== 'curved') await setRouting(page, at, routing)
      const select = await pointOnCable(page, 0.25)
      await clickAt(page, select.cx, select.cy)
      await delay(420)
      const mid = await pointOnCable(page, 0.5)
      // Park the pointer inside the region but deliberately off the stroke.
      await mouse(page, 'mouseMoved', mid.cx + 70, mid.cy - 40)
      await delay(420)
      await shot(page, `hitarea-${routing}.png`)
      await deselect(page)
    }
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
