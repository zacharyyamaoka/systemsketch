/**
 * The live title editor owns its text; its FigJam-style menu must stay with it
 * while typography changes. This drives the actual product composition rather
 * than a mounted component so focus, the select.editing_shape lifecycle, and
 * the floating anchor are all real.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  mouse,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'block-title-formatting-live-2026-09-04.png')

async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return 'null'
    const box = element.getBoundingClientRect()
    return JSON.stringify({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  })()`))
  assert.ok(point, `missing ${selector}`)
  await clickAt(page, point.x, point.y)
}

async function shapeAndPaint(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const editingId = editor?.getEditingShapeId()
    const shape = editingId
      ? editor.getShape(editingId)
      : editor?.getOnlySelectedShape() ?? editor?.getCurrentPageShapes().find((candidate) => candidate.type === 'block')
    const title = document.querySelector('[data-testid="block-inline-title"]')
      ?? document.querySelector('.BlockNode-simpleTitleText, .BlockNode-headingTitle, .BlockNode-valueText')
    if (!shape || !title) return 'null'
    const style = getComputedStyle(title)
    const holder = document.querySelector('.BlockNode-simpleTitle')
    return JSON.stringify({
      id: shape.id,
      editing: editor.getEditingShapeId(),
      props: shape.props,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      color: style.color,
      textAlign: style.textAlign,
      justifyContent: holder ? getComputedStyle(holder).justifyContent : null,
    })
  })()`))
}

async function drawBlock(page) {
  await key(page, 'b', 'KeyB')
  await mouse(page, 'mouseMoved', 430, 330)
  await mouse(page, 'mousePressed', 430, 330, { buttons: 1 })
  await mouse(page, 'mouseMoved', 860, 560, { buttons: 1 })
  await mouse(page, 'mouseReleased', 860, 560)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'Block title editor')
  await page.send('Input.insertText', { text: 'classify_frame' })
  await delay(200)
}

async function main() {
  const app = await startApp({ label: 'block-title-formatting', build: 'block-title-formatting' })
  const { page } = app
  const checks = []
  const pass = (message) => { checks.push(message); process.stdout.write(`  PASS  ${message}\n`) }

  try {
    await page.send('Page.navigate', { url: `http://127.0.0.1:${app.port}/` })
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await drawBlock(page)

    await waitFor(page,
      `document.querySelector('[data-testid="block-title-formatting-menu"]')?.closest('[data-visible="true"]')`,
      'title formatting menu',
    )
    const controls = JSON.parse(await evaluate(page, `JSON.stringify(
      Array.from(document.querySelectorAll('[data-testid="block-title-formatting-menu"] [data-control]'))
        .map((element) => element.dataset.control))`))
    assert.deepEqual(controls, ['titleFont', 'titleSize', 'titleBold', 'titleColor', 'titleAlign'])
    const initial = await shapeAndPaint(page)
    assert.equal(initial.editing, initial.id)
    assert.equal(initial.props.title, 'classify_frame')
    pass('editing a Block title keeps a FigJam-style toolbar with typeface, size, bold, colour, and alignment')

    await clickSelector(page, '[data-control="titleFont"]')
    await waitFor(page, `document.querySelector('[data-control="titleFont"][data-value="serif"]')`, 'title typeface options')
    await clickSelector(page, '[data-control="titleFont"][data-value="serif"]')
    await delay(160)
    let formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleFont, 'serif')
    assert.match(formatted.fontFamily, /Georgia/i)
    assert.equal(formatted.editing, formatted.id)
    pass('typeface changes live without ending title editing')

    await clickSelector(page, '[data-control="titleSize"]')
    await waitFor(page, `document.querySelector('[data-control="titleSize"][data-value="m"]')`, 'title size options')
    await clickSelector(page, '[data-control="titleSize"][data-value="m"]')
    await delay(160)
    formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleSize, 'm')
    assert.equal(formatted.fontSize, '24px')
    assert.equal(formatted.editing, formatted.id)
    pass('font size changes live and the contextual menu remains tied to the active editor')

    await clickSelector(page, '[data-control="titleBold"]')
    formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleBold, true)
    assert.equal(formatted.fontWeight, '700')
    await clickSelector(page, '[data-control="titleBold"]')
    formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleBold, false)
    assert.equal(formatted.fontWeight, '400')
    pass('bold is an explicit, undoable title style rather than a text rewrite')

    await clickSelector(page, '[data-control="titleColor"]')
    await waitFor(page, `document.querySelector('[data-control="titleColor"][data-value="blue"]')`, 'title colour options')
    await clickSelector(page, '[data-control="titleColor"][data-value="blue"]')
    await delay(160)
    formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleColor, 'blue')
    assert.equal(formatted.color, 'rgb(61, 173, 255)')
    assert.equal(formatted.editing, formatted.id)
    pass('the FigJam palette changes title ink without changing the Block face')

    await clickSelector(page, '[data-control="titleAlign"]')
    await waitFor(page, `document.querySelector('[data-control="titleAlign"][data-value="end"]')`, 'title alignment options')
    await clickSelector(page, '[data-control="titleAlign"][data-value="end"]')
    await delay(160)
    formatted = await shapeAndPaint(page)
    assert.equal(formatted.props.titleAlign, 'end')
    assert.equal(formatted.textAlign, 'right')
    assert.equal(formatted.editing, formatted.id)
    pass('right alignment moves the title group while the Block remains an editable title field')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    await key(page, 'Enter', 'Enter')
    await delay(160)
    const committed = await shapeAndPaint(page)
    assert.equal(committed.editing, null)
    assert.equal(committed.props.title, 'classify_frame')
    assert.equal(committed.props.titleColor, 'blue')
    assert.equal(committed.props.titleAlign, 'end')
    pass('Enter commits the text normally and leaves its visual presentation on the Block occurrence')

    assert.deepEqual(page.events.filter((event) => event.method === 'Runtime.exceptionThrown'), [])
    pass('the journey produced no browser exceptions')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
