#!/usr/bin/env node
/**
 * Full-viewport screenshots of SystemSketch's selection pill for the seven
 * primitives compared in the 2026-09-03 menu-diff report: Block, Rectangle,
 * Rectangle+text, Line, Line+text, Arrow, Arrow+text. One state per app run,
 * cleared between draws so every frame starts from an empty canvas.
 *
 * Companion to `tools/figjam/menu_diff_capture.py`, which captures the same
 * six non-Block states out of the real FigJam app.
 */
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const OUT = join(ROOT, 'docs', 'assets')
const DATE = '2026-09-03'
const WALK = process.argv.includes('--walk')

async function shot(page, slug) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(OUT, `menu-diff-systemsketch-${slug}-${DATE}.png`), Buffer.from(capture.data, 'base64'))
}

async function doubleClickAt(page, x, y) {
  await mouse(page, 'mouseMoved', x, y)
  for (const clickCount of [1, 2]) {
    await mouse(page, 'mousePressed', x, y, { buttons: 1, clickCount })
    await mouse(page, 'mouseReleased', x, y, { clickCount })
    await delay(30)
  }
  await delay(200)
}

const MENU_JS = `(() => {
  const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
  if (!menu || menu.dataset.visible !== 'true') return null
  const appearance = [...document.querySelectorAll('.systemsketch-appearance__trigger')]
    .map((t) => ({ control: t.dataset.control, label: t.getAttribute('aria-label') }))
  const blockMini = document.querySelector('.block-mini-menu')
  const blockButtons = blockMini
    ? [...blockMini.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim())
    : []
  const extra = [...menu.querySelectorAll('.systemsketch-selection-action, .systemsketch-selection-menu__bar > button')]
    .map((b) => (b.getAttribute('title') || b.textContent || '').trim())
    .filter(Boolean)
  return JSON.stringify({
    appearance,
    hasBlockMiniMenu: Boolean(blockMini),
    blockButtons,
    extraButtons: extra,
  })
})()`

/**
 * Open every trigger's popover in turn and screenshot the full frame — the
 * companion to `captureState`'s resting-pill shot. Nothing here asserts
 * anything; these frames are for the judge pass to look at beside FigJam's.
 */
async function walkPopovers(page, slug) {
  const triggers = JSON.parse(await evaluate(page, `JSON.stringify(
    [...document.querySelectorAll('.systemsketch-appearance__trigger, [data-control="addText"]')]
      .map((t) => {
        const r = t.getBoundingClientRect()
        return {
          control: t.dataset.control,
          label: t.getAttribute('aria-label'),
          x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
        }
      }),
  )`))
  for (const trigger of triggers) {
    if (trigger.control === 'addText') continue // opens inline editing, not a popover
    await clickAt(page, trigger.x, trigger.y)
    await delay(350)
    const panelSelector = `[data-testid="systemsketch-appearance-panel-${trigger.control}"]`
    const hasPanel = await evaluate(page, `Boolean(document.querySelector(${JSON.stringify(panelSelector)}))`)
    const controlSlug = (trigger.label ?? trigger.control).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    if (hasPanel) {
      await shot(page, `${slug}-popover-${controlSlug}`)
      console.log(`    popover: ${trigger.label}`)
    } else {
      console.log(`    (no popover) ${trigger.label}`)
    }
    // Not Escape: closing an appearance popover with Escape deselects the
    // shape entirely instead of just closing the popover (a real bug, filed
    // separately) — re-clicking the same trigger toggles it shut safely.
    await clickAt(page, trigger.x, trigger.y)
    await delay(200)
  }
}

async function captureState(page, slug) {
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"][data-visible="true"]')`,
    `the selection menu for ${slug}`)
  await delay(300)
  await shot(page, slug)
  const raw = await evaluate(page, MENU_JS)
  const state = JSON.parse(raw)
  console.log(`  ${slug}: ${JSON.stringify(state)}`)
  await writeFile(join(OUT, `menu-diff-systemsketch-${slug}-${DATE}.json`), JSON.stringify({ subject: slug, ...state }, null, 1))
}

async function clearCanvas(page) {
  await key(page, 'Escape', 'Escape')
  await shortcut(page, 'a', 'KeyA', 2)
  await delay(150)
  await key(page, 'Delete', 'Delete')
  await delay(200)
  await key(page, 'Escape', 'Escape')
  await delay(150)
}

async function main() {
  await ensureDir(OUT)
  const app = await startApp({ label: 'menu-diff-systemsketch' })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, `document.querySelector('.tl-container')`, 'the SystemSketch canvas')
    await delay(500)

    // Rectangle, no text: drawing with the shape's own tool opens an instant
    // label editor (src/instantTextEditing.ts); Escape cancels the empty label
    // but leaves the shape selected.
    await shortcut(page, 'r', 'KeyR')
    await drag(page, { x: 480, y: 260 }, { x: 780, y: 420 })
    await key(page, 'Escape', 'Escape')
    await captureState(page, 'rectangle')
    if (WALK) await walkPopovers(page, 'rectangle')
    await clearCanvas(page)

    // Rectangle, with text: the instant editor is already open post-draw.
    await shortcut(page, 'r', 'KeyR')
    await drag(page, { x: 480, y: 260 }, { x: 780, y: 420 })
    await page.send('Input.insertText', { text: 'Sort items' })
    await delay(200)
    await key(page, 'Escape', 'Escape')
    await captureState(page, 'rectangle-text')
    if (WALK) await walkPopovers(page, 'rectangle-text')
    await clearCanvas(page)

    // Line, no text: 'line' is excluded from instant editing, so it is
    // already just-selected after the drag.
    await shortcut(page, 'l', 'KeyL')
    await drag(page, { x: 480, y: 300 }, { x: 900, y: 300 })
    await captureState(page, 'line')
    await clearCanvas(page)

    // Line, with text: double-click the shaft to open its on-demand label.
    // Deselect first and click off the midpoint — tldraw's midpoint bend
    // handle intercepts a click landing exactly on the shape's centre.
    await shortcut(page, 'l', 'KeyL')
    await drag(page, { x: 480, y: 300 }, { x: 900, y: 300 })
    await key(page, 'Escape', 'Escape')
    await delay(200)
    await doubleClickAt(page, 600, 300)
    await page.send('Input.insertText', { text: 'shared state' })
    await delay(200)
    await key(page, 'Escape', 'Escape')
    await captureState(page, 'line-text')
    await clearCanvas(page)

    // Arrow, no text: same on-demand-label exclusion as Line.
    await shortcut(page, 'a', 'KeyA')
    await drag(page, { x: 480, y: 300 }, { x: 900, y: 300 })
    await captureState(page, 'arrow')
    if (WALK) await walkPopovers(page, 'arrow')
    await clearCanvas(page)

    // Arrow, with text.
    await shortcut(page, 'a', 'KeyA')
    await drag(page, { x: 480, y: 300 }, { x: 900, y: 300 })
    await key(page, 'Escape', 'Escape')
    await delay(200)
    await doubleClickAt(page, 600, 300)
    await page.send('Input.insertText', { text: 'on error' })
    await delay(200)
    await key(page, 'Escape', 'Escape')
    await captureState(page, 'arrow-text')
    if (WALK) await walkPopovers(page, 'arrow-text')
    await clearCanvas(page)

    // Block: no FigJam equivalent, captured for its own sake.
    await shortcut(page, 'b', 'KeyB')
    await drag(page, { x: 480, y: 260 }, { x: 780, y: 420 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'the new Block title editor')
    await page.send('Input.insertText', { text: 'Sorter' })
    await key(page, 'Enter', 'Enter')
    await captureState(page, 'block')
    await clearCanvas(page)

    console.log('done')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
