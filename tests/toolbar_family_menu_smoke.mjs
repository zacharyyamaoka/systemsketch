#!/usr/bin/env node
/**
 * Real-browser proof for the Miro-style family buttons in the product toolbar.
 *
 * Each remembered family icon is one 43 x 40 menu trigger. There is no tiny
 * second button in its corner: clicks near the left edge, in the centre, and
 * over the chevron all open the same stock tldraw/Radix dropdown and arm the
 * displayed tool. The very next canvas gesture therefore draws, while menu
 * rows still switch the remembered tool and keyboard shortcuts stay direct.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'toolbar-family-menu.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'toolbar-family-menu.systemsketch')
const results = []

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

const currentTool = (page) => evaluate(page, `window.__systemsketch.editor.getCurrentToolId()`)

async function openFamilyAt(page, family, fx, fy) {
  const selector = `[data-testid="systemsketch-tool-${family}"]`
  const box = await elementBox(page, selector)
  await clickAt(page, box.x + box.width * fx, box.y + box.height * fy)
  await waitFor(page,
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded') === 'true'`,
    `${family} menu opened from ${fx}, ${fy}`)
  return box
}

async function closeMenu(page, family) {
  const selector = `[data-testid="systemsketch-tool-${family}"]`
  const box = await elementBox(page, selector)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
  await waitFor(page, `!document.querySelector('.systemsketch-tool-menu')`, 'family menu to close')
}

async function chooseRow(page, label) {
  const locate = `(() => {
    const row = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
      .find((node) => node.textContent.trim().startsWith(${JSON.stringify(label)}))
    if (!row) return null
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
  })()`
  await waitFor(page, locate, `${label} row`)
  const row = JSON.parse(await evaluate(page, locate))
  await clickAt(page, row.cx, row.cy)
  await waitFor(page, `!document.querySelector('.systemsketch-tool-menu')`, `${label} choice to close the menu`)
}

async function emptyCanvasPoint(page) {
  const point = await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    for (let y = 100; y <= 520; y += 70) {
      for (let x = 100; x <= 1340; x += 80) {
        const target = document.elementFromPoint(x, y)
        const pagePoint = editor.screenToPage({ x, y })
        if (target?.closest('.tl-canvas') && !editor.getShapeAtPoint(pagePoint, { hitInside: true })) {
          return JSON.stringify({ x, y })
        }
      }
    }
    return null
  })()`)
  return point ? JSON.parse(point) : null
}

async function main() {
  const app = await startApp({ label: 'systemsketch-toolbar-family-menu', width: 1440, height: 900 })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'toolbar-family-menu.systemsketch')
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-tool-system"]')`, 'product toolbar')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:subject')`, 'review fixture Block')
    await delay(800)

    const beforeSubject = await evaluate(page, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:subject')
      return JSON.stringify({ x: shape.x, y: shape.y, props: shape.props })
    })()`)

    const followed = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShape('shape:subject')
      const endpoint = () => {
        const arrow = editor.getShape('shape:cue-step-2-arrow')
        const handle = editor.getShapeHandles(arrow)?.find((item) => item.id === 'end')
        return editor.getShapePageTransform(arrow.id).applyToPoint(handle)
      }
      const before = endpoint()
      editor.updateShape({ id: target.id, type: target.type, x: target.x + 64 })
      const after = endpoint()
      editor.updateShape({ id: target.id, type: target.type, x: target.x })
      return JSON.stringify({ dx: Math.round(after.x - before.x), dy: Math.round(after.y - before.y) })
    })()`))
    check('FIXTURE-1', 'the delivered fixture cold-opens and its bound cue follows the review target',
      followed, { dx: 64, dy: 0 })

    const geometry = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      ['system', 'shape', 'draw'].map((family) => {
        const button = document.querySelector('[data-testid="systemsketch-tool-' + family + '"]')
        const rect = button.getBoundingClientRect()
        const samples = [[6, 6], [rect.width / 2, rect.height / 2], [rect.width - 8, rect.height - 8]]
          .map(([dx, dy]) => document.elementFromPoint(rect.x + dx, rect.y + dy)
            ?.closest('button')?.dataset.testid ?? null)
        return {
          family,
          x: Math.round(rect.x),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          popup: button.getAttribute('aria-haspopup'),
          samples,
        }
      })))()`))
    check('HIT-1', 'System, Shape, and Draw are each one 43 × 40 menu button',
      geometry.map(({ family, width, height, popup }) => ({ family, width, height, popup })),
      [
        { family: 'system', width: 43, height: 40, popup: 'menu' },
        { family: 'shape', width: 43, height: 40, popup: 'menu' },
        { family: 'draw', width: 43, height: 40, popup: 'menu' },
      ])
    check('HIT-2', 'left edge, centre, and chevron corner all resolve to that same button',
      geometry.map(({ family, x, right, samples }) => ({ family, x, right, samples })),
      geometry.map(({ family, x, right }) => ({ family, x, right, samples: Array(3).fill(`systemsketch-tool-${family}`) })))
    check('HIT-3', 'there is no separate precision chevron button',
      await evaluate(page, `document.querySelectorAll('.systemsketch-family-tool__menu').length`), 0)

    for (const [index, point] of [[0.15, 0.15], [0.5, 0.5], [0.84, 0.79]].entries()) {
      await evaluate(page, `(() => { window.__systemsketch.editor.setCurrentTool('select'); return true })()`)
      await openFamilyAt(page, 'system', point[0], point[1])
      check(`OPEN-${index + 1}`, `the ${['left edge', 'centre', 'chevron corner'][index]} opens the System menu`,
        await evaluate(page, `document.querySelector('.systemsketch-tool-menu__heading')?.textContent ?? null`),
        'System design')
      check(`ARM-${index + 1}`, 'opening the family also arms its displayed Block tool', await currentTool(page), 'block')
      await closeMenu(page, 'system')
    }

    await evaluate(page, `(() => { window.__systemsketch.editor.setCurrentTool('select'); return true })()`)
    const blocksBefore = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'block').length`)
    await openFamilyAt(page, 'system', 0.5, 0.5)
    const blockPoint = await emptyCanvasPoint(page)
    check('BLOCK-TARGET', 'the journey found an empty visible point for Block creation', blockPoint !== null, true)
    await clickAt(page, blockPoint.x, blockPoint.y)
    await delay(400)
    check('BLOCK-DRAW', 'the next canvas click creates the displayed Block',
      await evaluate(page,
        `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'block').length`),
      blocksBefore + 1)

    await openFamilyAt(page, 'shape', 0.5, 0.5)
    await chooseRow(page, 'Rectangle')
    check('PICK-1', 'a menu row activates the remembered tool', await currentTool(page), 'geo')
    check('PICK-2', 'the selected family remains visibly active',
      await evaluate(page, `document.querySelector('[data-testid="systemsketch-tool-shape"]')?.getAttribute('aria-pressed') ?? null`),
      'true')

    await evaluate(page, `(() => { window.__systemsketch.editor.setCurrentTool('select'); return true })()`)
    const geoBefore = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'geo').length`)
    await openFamilyAt(page, 'shape', 0.5, 0.5)
    check('DRAW-1', 'clicking the Shape tile arms the displayed Rectangle', await currentTool(page), 'geo')
    const canvasPassThrough = JSON.parse(await evaluate(page, `(() => {
      const capture = document.querySelector('.tlui-menu-click-capture')
      return JSON.stringify({
        capturePointerEvents: capture ? getComputedStyle(capture).pointerEvents : null,
        triggerState: document.querySelector('[data-testid="systemsketch-tool-shape"]')?.getAttribute('data-state') ?? null,
      })
    })()`))
    check('DRAW-LAYER', 'the family picker releases tldraw\'s dismiss-only canvas layer',
      canvasPassThrough.capturePointerEvents, 'none')
    const shapePoint = await emptyCanvasPoint(page)
    check('DRAW-TARGET', 'the journey found an empty visible canvas point',
      shapePoint !== null, true)
    await clickAt(page, shapePoint.x, shapePoint.y)
    await delay(400)
    check('DRAW-2', 'the next canvas click creates a Rectangle',
      await evaluate(page,
        `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'geo').length`),
      geoBefore + 1)
    check('DRAW-3', 'the drawing click also dismisses the open family menu',
      await evaluate(page, `document.querySelector('.systemsketch-tool-menu') === null`), true)

    await evaluate(page, `(() => { window.__systemsketch.editor.setCurrentTool('select'); return true })()`)
    const drawsBefore = await evaluate(page,
      `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'draw').length`)
    await openFamilyAt(page, 'draw', 0.5, 0.5)
    await shot(page, 'toolbar-family-menu-open.png')
    check('ARM-DRAW', 'clicking the Draw tile arms its displayed Pen', await currentTool(page), 'draw')
    const drawPoint = await emptyCanvasPoint(page)
    check('PEN-TARGET', 'the journey found an empty visible stroke area', drawPoint !== null, true)
    await drag(page, drawPoint, { x: drawPoint.x + 80, y: drawPoint.y + 35 })
    check('PEN-DRAW', 'the next canvas drag creates a Pen stroke',
      await evaluate(page,
        `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'draw').length`),
      drawsBefore + 1)
    check('PEN-CLOSE', 'the drawing drag dismisses the family menu',
      await evaluate(page, `document.querySelector('.systemsketch-tool-menu') === null`), true)

    await shortcut(page, 'b', 'KeyB')
    check('KEY-1', 'B remains the direct path to Block', await currentTool(page), 'block')
    await shortcut(page, 'r', 'KeyR')
    check('KEY-2', 'R remains the direct path to Rectangle', await currentTool(page), 'geo')
    await shortcut(page, 'd', 'KeyD')
    check('KEY-3', 'D remains the direct path to Pen', await currentTool(page), 'draw')

    const afterSubject = await evaluate(page, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:subject')
      return JSON.stringify({ x: shape.x, y: shape.y, props: shape.props })
    })()`)
    check('FIXTURE-2', 'menu and shortcut gestures leave the review Block unchanged', afterSubject, beforeSubject)

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    await writeFile(OUT, JSON.stringify({ checks: results, geometry }, null, 2))
    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
