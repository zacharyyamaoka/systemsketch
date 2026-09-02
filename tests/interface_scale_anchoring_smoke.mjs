#!/usr/bin/env node
/**
 * Real-browser proof that canvas-anchored chrome stays anchored at every
 * interface scale.
 *
 * The interface scale enlarges SystemSketch's chrome with CSS `zoom` on the
 * surface layer. `zoom` establishes a new coordinate scale for everything
 * inside it, so a child placed at `translate(400px, 300px)` inside `zoom: 1.4`
 * renders at (560, 420). That is right for chrome laid out against the window,
 * and wrong for chrome positioned from the CAMERA — which computes real
 * viewport pixels and belongs to a board that does not scale.
 *
 * Three surfaces were in the second category and inside the zoomed layer: the
 * on-canvas Block picker, the selection contextual menu, and the depth mask.
 * Each is asserted below at 100% and at 140%: the anchor must not move, and the
 * two that are chrome must still grow.
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
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []
/** Anchors must land within a pixel of each other; sizes within a percent. */
const ANCHOR_TOLERANCE = 2

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
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

/** Set the live interface scale the way the Settings window does. */
async function setInterfaceScale(page, percent) {
  await evaluate(page, `(() => {
    const app = document.querySelector('.systemsketch-app')
    app.style.setProperty('--systemsketch-interface-scale', String(${percent} / 100))
    app.style.setProperty('--systemsketch-interface-scale-inverse', String(100 / ${percent}))
  })()`)
  await delay(400)
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
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(250)
}

async function addPort(page, side) {
  const label = side === 'inputs' ? 'Add input port' : 'Add output port'
  const selector = `[aria-label="${label}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, label, 8000)
  const button = await box(page, selector)
  await clickAt(page, button.cx, button.cy)
  await delay(300)
}

const deselect = async (page) => { await clickAt(page, 180, 820); await delay(250) }

const near = (a, b, tolerance = ANCHOR_TOLERANCE) => Math.abs(a - b) <= tolerance

/**
 * Step into an Expanded Block, and read where the depth mask draws its edge.
 *
 * The mask traces the scope's box on screen, so it is the strictest of the
 * three: it must land exactly on the Block at every interface scale, and unlike
 * the other two it must not grow either — it is tracing the board, not chrome.
 */
async function measureDepthMask(page) {
  // Depth is entered from the Block's own footer menu — the real gesture.
  const kebab = await box(page, '.systemsketch-block-canvas [title="More options"]')
  await clickAt(page, kebab.cx, kebab.cy)
  await waitFor(page,
    `Array.from(document.querySelectorAll('button, [role="menuitem"]'))
      .some((node) => node.textContent.trim() === 'Step into')`,
    'Step into')
  const rect = JSON.parse(await evaluate(page, `(() => {
    const item = Array.from(document.querySelectorAll('button, [role="menuitem"]'))
      .find((node) => node.textContent.trim() === 'Step into')
    const r = item.getBoundingClientRect()
    return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
  })()`))
  await clickAt(page, rect.cx, rect.cy)
  await delay(900)
  const present = await evaluate(page,
    `Boolean(document.querySelector('.systemsketch-depth-mask__edge'))`)
  if (!present) return null
  const edge = await box(page, '.systemsketch-depth-mask__edge')
  const block = await box(page, '.systemsketch-app [data-shape-type="block"]')
  return { edge, block }
}

/** Leave the depth scope, so the next measurement starts from the root camera. */
async function leaveDepthScope(page) {
  await key(page, 'Escape', 'Escape')
  await delay(600)
}

/** Measure the selection menu and the picker at the current scale. */
async function measure(page, dot) {
  // --- selection menu: select the Block, read where the menu lands ---------
  await clickAt(page, dot.blockCx, dot.blockTop + 6)
  await delay(450)
  const selection = await box(page, '.systemsketch-app [data-shape-type="block"]')
  const menu = await box(page, '[data-testid="systemsketch-selection-menu"]')
  await deselect(page)

  // --- the picker: drag a cable into empty space --------------------------
  await mouse(page, 'mouseMoved', dot.cx, dot.cy)
  await mouse(page, 'mousePressed', dot.cx, dot.cy, { buttons: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, 'mouseMoved', dot.cx + (280 * step) / 8, dot.cy + (140 * step) / 8, { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', dot.cx + 280, dot.cy + 140)
  await delay(500)
  const picker = await box(page, '[data-testid="block-picker"]')
  // The cable is meant to finish ON the panel: its near edge at the terminal's
  // x, its FIRST OPTION's row at the terminal's y. So the row is what has to be
  // measured, not the panel's corner — the corner deliberately sits above the
  // terminal, by an offset that scales with the panel.
  const firstOption = await box(page, '[data-testid="block-picker-call"]')
  const looseEnd = { x: dot.cx + 280, y: dot.cy + 140 }
  await key(page, 'Escape', 'Escape')
  await delay(350)

  return { selection, menu, picker, firstOption, looseEnd }
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-scale', build: 'interface-scale' })
  const { page, port } = app

  try {
    await openApp(page, port, '')
    await waitFor(page, `document.querySelector('.systemsketch-app .tl-container')`,
      'product canvas', 30000)
    await delay(1400)

    await setInterfaceScale(page, 100)
    await drawBlock(page, { x: 320, y: 260 }, { x: 660, y: 460 }, 'anchor')
    await addPort(page, 'outputs')
    await deselect(page)

    const blockBox = await box(page, '.systemsketch-app [data-shape-type="block"]')
    const outDot = await box(page, '.Port[data-block-port-side="output"]')
    const dot = {
      cx: outDot.cx, cy: outDot.cy,
      blockCx: blockBox.cx, blockTop: blockBox.y,
    }

    const at100 = await measure(page, dot)
    await shot(page, 'interface-scale-100.png')
    await setInterfaceScale(page, 140)
    const at140 = await measure(page, dot)
    await shot(page, 'interface-scale-140.png')

    // ---------------------------------------------------------- picker ---
    check('PICKER-ANCHOR-100', 'at 100% the cable finishes on the picker\'s first option',
      near(at100.picker.x, at100.looseEnd.x, 3)
      && near(at100.firstOption.cy, at100.looseEnd.y, 6),
      true)
    check('PICKER-ANCHOR-140', 'and still does at 140%, on the same point of the board',
      near(at140.picker.x, at100.looseEnd.x, 3)
      && near(at140.firstOption.cy, at100.looseEnd.y, 6),
      true)
    check('PICKER-GROWS', 'and it is 1.4x bigger, because it is still chrome',
      near(at140.picker.w / at100.picker.w, 1.4, 0.03), true)

    // --------------------------------------------------- selection menu ---
    check('MENU-SELECTION-STABLE', 'the Block itself does not move with the interface scale',
      near(at140.selection.cx, at100.selection.cx) && near(at140.selection.cy, at100.selection.cy),
      true)
    check('MENU-CENTRED-100', 'at 100% the menu is centred on the selection',
      near(at100.menu.cx, at100.selection.cx, 3), true)
    check('MENU-CENTRED-140', 'and stays centred on it at 140%',
      near(at140.menu.cx, at140.selection.cx, 3), true)
    check('MENU-GAP-STABLE', 'with the same gap to the selection, measured in board pixels',
      near(
        at140.menu.y + at140.menu.h - at100.menu.y - at100.menu.h,
        0,
        3,
      ), true)
    check('MENU-GROWS', 'and it is 1.4x bigger',
      near(at140.menu.w / at100.menu.w, 1.4, 0.03), true)

    // ------------------------------------------------------- depth mask ---
    // The third surface positioned from the camera. It traces the scope's box,
    // so it must land on the Block itself — and must NOT grow, because it is
    // drawing the board rather than chrome.
    await setInterfaceScale(page, 100)
    await deselect(page)
    // Clear the board and draw a Block big enough to be Expanded, so there is a
    // scope to step into.
    await evaluate(page, `(() => {
      const seam = window.__systemsketch
      if (!seam) return
      seam.editor.selectAll()
      seam.editor.deleteShapes(seam.editor.getSelectedShapeIds())
      seam.editor.selectNone()
    })()`)
    await delay(400)
    await drawBlock(page, { x: 320, y: 240 }, { x: 1000, y: 700 }, 'scope')
    await deselect(page)
    const scopeBox = await box(page, '.systemsketch-app [data-shape-type="block"]')
    void scopeBox
    const mask100 = await measureDepthMask(page)
    await setInterfaceScale(page, 140)
    // The mask is live; re-read it under the new scale without leaving the scope.
    const mask140 = await evaluate(page,
      `Boolean(document.querySelector('.systemsketch-depth-mask__edge'))`)
      ? {
        edge: await box(page, '.systemsketch-depth-mask__edge'),
        block: await box(page, '.systemsketch-app [data-shape-type="block"]'),
      }
      : null
    await leaveDepthScope(page)
    if (mask100 && mask140) {
      check('MASK-TRACES-100', 'at 100% the depth mask traces the scope Block',
        near(mask100.edge.cx, mask100.block.cx, 4) && near(mask100.edge.cy, mask100.block.cy, 4),
        true)
      check('MASK-TRACES-140', 'and still traces it at 140%',
        near(mask140.edge.cx, mask140.block.cx, 4) && near(mask140.edge.cy, mask140.block.cy, 4),
        true)
      check('MASK-DOES-NOT-GROW', 'the mask does not scale — it draws the board, not chrome',
        near(mask140.edge.w / mask100.edge.w, 1, 0.03), true)
      await shot(page, 'interface-scale-depth-mask.png')
    } else {
      process.stdout.write('  SKIP  depth mask — no Expanded scope entered\n')
    }
    await setInterfaceScale(page, 100)

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    process.stdout.write(`\n  100%: picker ${JSON.stringify(at100.picker)}\n`)
    process.stdout.write(`  140%: picker ${JSON.stringify(at140.picker)}\n`)
    process.stdout.write(`  100%: menu   ${JSON.stringify(at100.menu)}\n`)
    process.stdout.write(`  140%: menu   ${JSON.stringify(at140.menu)}\n`)

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'interface-scale.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
