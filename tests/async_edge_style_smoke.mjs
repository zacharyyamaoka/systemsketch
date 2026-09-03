#!/usr/bin/env node
/**
 * Happy-path browser proof for the V1 async cable. A real mouse draws one
 * short cable, the Edge type inspector marks it Async, the canvas and SVG
 * export share `56 4 10 4`, the context menu exposes the same semantic
 * selector, and ordinary autosave/reload keeps the choice.
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
const SHOT = join(SHOTS, 'async-edge-style-acceptance.png')
const SELECTOR_SHOT = join(SHOTS, 'async-edge-style-selector.png')
const OUT = join(SHOTS, 'async-edge-style-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function clickTestId(page, testId) {
  const selector = `[data-testid="${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, testId, 8000)
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy)
  await delay(260)
}

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

async function painted(page, cableId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"]')
    const path = root?.querySelector('path[data-edge-type]')
    return JSON.stringify({
      dash: path?.getAttribute('stroke-dasharray') ?? null,
      offset: path?.getAttribute('stroke-dashoffset') ?? null,
      cap: path?.getAttribute('stroke-linecap') ?? null,
      edgeType: path?.getAttribute('data-edge-type') ?? null,
      pill: Boolean(root?.querySelector('[data-testid="connection-delay-pill"]')),
    })
  })()`))
}

async function pointOnCable(page, cableId, t = 0.5) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"] path[data-edge-type]')
    const point = path.getPointAtLength(path.getTotalLength() * ${t})
    const matrix = path.getScreenCTM()
    return JSON.stringify({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    })
  })()`))
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-async-edge-style',
    build: 'async-edge-style',
    width: 1800,
    height: 1000,
  })
  const { page, port, filesRoot } = app
  const board = join(filesRoot, 'SystemSketch', 'async-edge-style-proof.systemsketch')

  try {
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await delay(700)

    const source = await portBlock(page, { x: 100, y: 300 }, { x: 350, y: 430 }, 'emit()')
    const sink = await portBlock(page, { x: 500, y: 300 }, { x: 750, y: 430 }, 'receive()')
    await dragFrom(page, await box(page, portDot(source, 'output', 'out_1')), await box(page, portDot(sink, 'input', 'in_1')))
    await deselect(page, { x: 80, y: 900 })

    let cable = await cableRecord(page)
    check('AS-1', 'a newly drawn connection remains ordinary data', cable.temporal, 'data')

    const selectAt = await pointOnCable(page, cable.id, 0.35)
    await clickAt(page, selectAt.x, selectAt.y)
    await waitFor(page, `document.querySelector('[data-testid="connection-inspector"]')`, 'connection inspector')
    const selector = JSON.parse(await evaluate(page, `JSON.stringify({
      title: document.querySelector('[data-inspector-section="Edge type"] .block-inspector__section-title')?.textContent,
      choices: Array.from(document.querySelectorAll('[aria-label="Connection edge type"] button')).map((button) => button.textContent.trim())
    })`))
    check('AS-2', 'the inspector presents the three semantic edge types', selector,
      { title: 'Edge type', choices: ['Data', 'Async', 'Delayed (z⁻¹)'] })

    await clickTestId(page, 'connection-temporal-async')
    cable = await cableRecord(page)
    check('AS-3', 'choosing Async paints the selected V1 packet cadence',
      { temporal: cable.temporal, ...(await painted(page, cable.id)) },
      { temporal: 'async', dash: '56 4 10 4', offset: '35', cap: 'butt', edgeType: 'async', pill: false })
    const selectorCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SELECTOR_SHOT, Buffer.from(selectorCapture.data, 'base64'))

    const exported = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const result = await editor.getSvgString([${JSON.stringify(cable.id)}], { background: false })
      const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
      const path = svg.querySelector('[data-edge-type="async"]')
      return JSON.stringify({
        dash: path?.getAttribute('stroke-dasharray'),
        offset: path?.getAttribute('stroke-dashoffset'),
        cap: path?.getAttribute('stroke-linecap'),
      })
    })()`))
    check('AS-4', 'SVG export uses the same cadence and cap', exported,
      { dash: '56 4 10 4', offset: '35', cap: 'butt' })

    const contextAt = await pointOnCable(page, cable.id, 0.5)
    await clickAt(page, contextAt.x, contextAt.y, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu-sub.connection-temporal-button"]')`, 'Edge type context submenu')
    await clickTestId(page, 'context-menu-sub.connection-temporal-button')
    const contextChoices = JSON.parse(await evaluate(page, `JSON.stringify(
      Array.from(document.querySelectorAll('[data-testid="context-menu-sub.connection-temporal-content"] [role="menuitemcheckbox"]'))
        .map((item) => ({ label: item.textContent.trim(), checked: item.getAttribute('data-state') }))
    )`))
    check('AS-5', 'right-click exposes the same selector with Async checked', contextChoices,
      [
        { label: 'Data', checked: 'unchecked' },
        { label: 'Async', checked: 'checked' },
        { label: 'Delayed (z⁻¹)', checked: 'unchecked' },
      ])

    await key(page, 'Escape', 'Escape')
    await delay(100)
    await key(page, 'Escape', 'Escape')
    await editorEval(page, 'editor.selectNone(); return true')
    await delay(260)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    await delay(1400)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="connection"]').length === 1`, 'async cable restored', 10000)
    await delay(500)
    cable = await cableRecord(page)
    check('AS-6', 'autosave and reload preserve the async edge type and paint',
      { temporal: cable.temporal, ...(await painted(page, cable.id)) },
      { temporal: 'async', dash: '56 4 10 4', offset: '35', cap: 'butt', edgeType: 'async', pill: false })
    check('AS-7', 'the happy path produced no local console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`${results.length - failed.length}/${results.length} passed → ${OUT}\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })
