#!/usr/bin/env node
/**
 * Browser acceptance for the stock-record Callout composition.
 *
 * This deliberately drives the real toolbar and real canvas: a semantic card
 * is not enough if the two-click leader, the add-leader picker, or the existing
 * stock-arrow knee handles stop working once the app is mounted.
 */
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE_RECIPE = join(ROOT, 'sketches', 'review', 'callout-primitive.recipe.json')
const CREATE_FIXTURE = join(ROOT, 'skills', 'systemsketch-review-fixture', 'scripts', 'create_fixture.mjs')
const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'callout-primitive-smoke.json')
const results = []
const execFileAsync = promisify(execFile)

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
  if (!ok) process.stdout.write(`        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`)
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

async function clickMenuRow(page, startsWith) {
  const locate = `(() => {
    const row = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item'))
      .find((node) => (node.textContent ?? '').trim().startsWith(${JSON.stringify(startsWith)}))
    if (!row) return null
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  })()`
  await waitFor(page, locate, `${startsWith} menu row`)
  const point = JSON.parse(await evaluate(page, locate))
  await clickAt(page, point.x, point.y)
}

async function openSystemMenu(page) {
  const box = await elementBox(page, '[data-testid="systemsketch-tool-system"]')
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
  await waitFor(page, `document.querySelector('.systemsketch-tool-menu')`, 'System menu')
}

async function pagePoint(page, x, y) {
  return JSON.parse(await evaluate(page,
    `JSON.stringify(window.__systemsketch.editor.pageToScreen({ x: ${x}, y: ${y} }))`))
}

const semanticSummary = (page) => evaluate(page, `(() => {
  const shapes = window.__systemsketch.editor.getCurrentPageShapes()
  const callout = (shape) => shape.meta?.systemSketchCallout
  const cards = shapes.filter((shape) => callout(shape)?.role === 'card')
  const leaders = shapes.filter((shape) => callout(shape)?.role === 'leader')
  return JSON.stringify({
    cards: cards.length,
    leaders: leaders.length,
    pending: leaders.filter((shape) => callout(shape).cardId === 'shape:pending-callout').length,
  })
})()`)

async function main() {
  const app = await startApp({ label: 'systemsketch-callout-primitive', width: 1440, height: 960 })
  const { page, port, filesRoot } = app
  try {
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    const board = join(filesRoot, 'SystemSketch', 'callout-primitive.systemsketch')
    // The review board is deliberately playable, and its normal autosave is
    // proof that it is a real board. Regenerate this journey's private seed
    // instead of overwriting somebody's changes to the shared human fixture.
    await execFileAsync(process.execPath, [
      CREATE_FIXTURE,
      '--recipe', FIXTURE_RECIPE,
      '--output', board,
      '--force',
    ], { cwd: ROOT })
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor`, 'mounted SystemSketch editor')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:card-multi')`, 'review fixture')
    await delay(700)

    check('FIXTURE-1', 'the review board starts with four orientations and a two-leader card',
      JSON.parse(await semanticSummary(page)), { cards: 5, leaders: 6, pending: 0 })

    // ── Create: target click, rubber-band, card click ─────────────────────
    await openSystemMenu(page)
    await clickMenuRow(page, 'Callout')
    check('TOOL-1', 'the System menu arms the two-click Callout tool',
      await evaluate(page, `window.__systemsketch.editor.getCurrentToolId()`), 'callout')

    const target = await pagePoint(page, 584, 402)
    const notePosition = await pagePoint(page, 1120, 332)
    await clickAt(page, target.x, target.y)
    await mouse(page, 'mouseMoved', notePosition.x, notePosition.y)
    await delay(220)
    check('CREATE-1', 'the first click leaves one live, uncommitted pointed leader under the cursor',
      [
        await evaluate(page, `window.__systemsketch.editor.getPath()`),
        JSON.parse(await semanticSummary(page)),
      ],
      ['callout.placing_card', { cards: 5, leaders: 7, pending: 1 }])
    await shot(page, 'callout-primitive-rubber-band.png')

    await clickAt(page, notePosition.x, notePosition.y)
    await delay(360)
    const created = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const card = editor.getOnlySelectedShape()
      const leaders = editor.getCurrentPageShapes().filter((shape) =>
        shape.meta?.systemSketchCallout?.role === 'leader'
          && shape.meta.systemSketchCallout.cardId === card?.id)
      const leader = leaders[0]
      const bindings = leader ? editor.getBindingsFromShape(leader.id, 'arrow') : []
      return JSON.stringify({
        card: card?.type,
        isEditing: editor.getEditingShapeId() === card?.id,
        leaderCount: leaders.length,
        terminals: bindings.map((binding) => binding.props.terminal).sort(),
      })
    })()`))
    check('CREATE-2', 'the second click makes an editable stock card and welds both leader terminals',
      created, { card: 'geo', isEditing: true, leaderCount: 1, terminals: ['end', 'start'] })
    await shot(page, 'callout-primitive-created.png')

    // ── Add a second leader through the selected-card menu ────────────────
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
    await delay(180)
    const newCardId = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id ?? null`)
    await openSystemMenu(page)
    await clickMenuRow(page, 'Add leader to selected Callout')
    check('LEADER-1', 'selected Callout menu enters the second-target picker',
      await evaluate(page, `window.__systemsketch.editor.getCurrentToolId()`), 'callout-add-leader')
    const secondTarget = await pagePoint(page, 811, 480)
    await clickAt(page, secondTarget.x, secondTarget.y)
    await delay(260)
    const multiple = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const leaders = editor.getCurrentPageShapes().filter((shape) =>
        shape.meta?.systemSketchCallout?.role === 'leader'
          && shape.meta.systemSketchCallout.cardId === ${JSON.stringify(newCardId)})
      const second = editor.getOnlySelectedShape()
      const targetIds = second ? editor.getBindingsFromShape(second.id, 'arrow').map((binding) => binding.toId).sort() : []
      return JSON.stringify({ leaders: leaders.length, selected: editor.getOnlySelectedShape()?.type, targetIds })
    })()`))
    check('LEADER-2', 'a second independent stock arrow attaches to the same card and the clicked detail',
      [multiple.leaders, multiple.selected, multiple.targetIds.includes('shape:detail-b'), multiple.targetIds.includes(newCardId)],
      [2, 'arrow', true, true])
    await shot(page, 'callout-primitive-multiple-leaders.png')

    // ── Move a visible rail with the existing stock-arrow handle seam ─────
    const activeLeaderId = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id ?? null`)
    const routePoint = JSON.parse(await evaluate(page, `(() => {
      const element = document.querySelector('[data-shape-id="' + ${JSON.stringify(activeLeaderId)} + '"]')
      const rect = element?.getBoundingClientRect()
      return JSON.stringify(rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null)
    })()`))
    await mouse(page, 'mouseMoved', routePoint.x, routePoint.y)
    await delay(260)
    const handle = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const arrow = editor.getShape(${JSON.stringify(activeLeaderId)})
      const handle = editor.getShapeHandles(arrow)?.find((item) => item.id.startsWith('systemsketch-route:'))
      if (!handle) return JSON.stringify({
        id: null,
        path: editor.getPath(),
        bounds: editor.getShapePageBounds(arrow.id),
        allHandles: editor.getShapeHandles(arrow)?.map((item) => item.id),
      })
      const pagePoint = editor.getShapePageTransform(arrow.id).applyToPoint(handle)
      return JSON.stringify({ id: handle.id, screen: editor.pageToScreen(pagePoint) })
    })()`))
    check('KNEE-1', 'a selected Callout leader exposes a movable interior rail handle immediately',
      Boolean(handle?.id), true)
    if (handle?.screen) {
      await drag(page, handle.screen, { x: handle.screen.x, y: handle.screen.y + 62 })
      await delay(260)
    }
    check('KNEE-2', 'dragging that rail authors an elbow route without breaking the card attachment',
      JSON.parse(await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const arrow = editor.getShape(${JSON.stringify(activeLeaderId)})
        const bindings = editor.getBindingsFromShape(arrow.id, 'arrow')
        return JSON.stringify({ authored: Boolean(arrow.meta?.systemSketchArrowRoute), terminals: bindings.length })
      })()`)),
      { authored: true, terminals: 2 })
    await shot(page, 'callout-primitive-knee-moved.png')

    check('CLEAN', 'the completed interaction emitted no local browser console errors', localConsoleErrors(page), [])
    await writeFile(OUT, JSON.stringify({ checks: results }, null, 2))
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
