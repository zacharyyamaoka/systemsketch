#!/usr/bin/env node
/**
 * Custom font size, proven on RENDERED pixels — not stored props.
 *
 * The mechanism under test is the one `docs/build_stock_tldr_capabilities.py`
 * proved in the bare stock viewer: a stock shape's effective text size is
 * `basePx[size rung] × props.scale`. The shared Font size popover's new
 * "Custom" field must hit any typed px on (a) a stock Text shape via stock
 * `scale` and (b) a Code block via its own `fontScale` — and the check is the
 * on-screen size (computed font-size × accumulated CSS transform), because a
 * previous bug in this area was exactly "the prop says X but the render
 * doesn't reflect it".
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'custom-font-size-live-2026-09-05.png')
const { checks, pass } = makeChecklist()

/** Rendered px of the element: computed font-size × total transform scale. */
async function renderedFontPx(page, selector) {
  return evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const fontPx = Number.parseFloat(getComputedStyle(el).fontSize)
    const rect = el.getBoundingClientRect()
    // offsetWidth is the untransformed layout width; the rect is post-transform.
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1
    return fontPx * scale
  })()`)
}

async function openSizePopover(page) {
  await clickElement(page, '[data-control="size"][data-trigger="text"]')
  await waitFor(page, `Boolean(document.querySelector('[data-testid="font-size-custom"]'))`, 'size popover with custom field')
}

async function typeCustomPx(page, px) {
  await clickElement(page, '[data-testid="font-size-custom"]')
  await evaluate(page, `(() => {
    const input = document.querySelector('[data-testid="font-size-custom"]')
    input.focus(); input.select(); return true
  })()`)
  await typeSlowly(page, String(px))
  await key(page, 'Enter')
  await delay(200)
}

const app = await startApp({ label: 'font-size-smoke' })
try {
  const { page, port } = app
  await openApp(page, port, '')
  await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')

  // One stock Text shape, created through the real editor at zoom 1.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShape({
      id: 'shape:fsText', type: 'text', x: 160, y: 160,
      props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sized text' }] }] } },
    })
    editor.resetZoom()
    return true
  })()`)
  await delay(200)
  const textCreated = await evaluate(page, `Boolean(window.__systemsketch.editor.getShape('shape:fsText'))`)
  assert.equal(textCreated, true, 'text shape created')

  // --- Stock Text shape ---
  await evaluate(page, `(() => { window.__systemsketch.editor.setSelectedShapes(['shape:fsText']); return true })()`)
  await delay(300)
  await openSizePopover(page)
  await typeCustomPx(page, 29)

  const textProps = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:fsText').props)`)
  const parsedText = JSON.parse(textProps)
  // 29px on text bases 18/24/36/44 anchors to m (nearest in ratio): 24 × 29/24.
  checks.push(['TEXT-1', 'rung anchors to m for 29px', parsedText.size, 'm'])
  assert.equal(parsedText.size, 'm')
  checks.push(['TEXT-2', 'stock scale is 29/24', Math.round(parsedText.scale * 1000) / 1000, Math.round((29 / 24) * 1000) / 1000])
  assert.ok(Math.abs(parsedText.scale - 29 / 24) < 1e-6)

  const textRendered = await renderedFontPx(page, '.tl-text-shape .tl-rich-text')
  checks.push(['TEXT-3', 'RENDERED text size is ~29px on screen', Math.round(textRendered * 10) / 10, '29 ±0.5'])
  assert.ok(Math.abs(textRendered - 29) < 0.5, `rendered ${textRendered}`)

  const trigger = await evaluate(page, `document.querySelector('[data-control="size"] .systemsketch-appearance__trigger-text')?.textContent`)
  checks.push(['TEXT-4', 'combobox trigger reads the exact px', trigger, '29 px'])
  assert.equal(trigger, '29 px')

  // Preset rows must show NO check while a custom scale is applied.
  const checkedRows = await evaluate(page, `document.querySelectorAll('[data-testid="systemsketch-appearance-panel-size"] [role="menuitemradio"][aria-checked="true"]').length`)
  checks.push(['TEXT-5', 'no preset row claims to be current at 29px', checkedRows, 0])
  assert.equal(checkedRows, 0)

  // Clicking Medium snaps back: scale 1, rendered 24px, check restored.
  await clickElement(page, '[data-testid="systemsketch-appearance-panel-size"] [data-value="m"]')
  await delay(200)
  const afterPreset = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:fsText').props)`))
  checks.push(['TEXT-6', 'Medium preset clears the custom scale', afterPreset.scale, 1])
  assert.equal(afterPreset.scale, 1)
  const renderedPreset = await renderedFontPx(page, '.tl-text-shape .tl-rich-text')
  checks.push(['TEXT-7', 'Medium renders at its named 24px again', Math.round(renderedPreset * 10) / 10, '24 ±0.5'])
  assert.ok(Math.abs(renderedPreset - 24) < 0.5, `rendered ${renderedPreset}`)

  // --- Code block, same menu, same Custom row ---
  await key(page, 'Escape')
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShape({ id: 'shape:fsCode', type: 'code', x: 160, y: 420 })
    editor.setSelectedShapes(['shape:fsCode'])
    return true
  })()`)
  await delay(300)
  await openSizePopover(page)
  await typeCustomPx(page, 18)

  const codeProps = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:fsCode').props)`))
  // 18px on code bases 12/16/20/24 anchors to l (20 × 0.9) by ratio distance.
  checks.push(['CODE-1', 'code rung anchors to l for 18px', codeProps.size, 'l'])
  assert.equal(codeProps.size, 'l')
  checks.push(['CODE-2', 'code fontScale is 18/20', codeProps.fontScale, 0.9])
  assert.ok(Math.abs(codeProps.fontScale - 0.9) < 1e-6)

  const codeRendered = await renderedFontPx(page, '.code-block-canvas .cm-content')
  checks.push(['CODE-3', 'RENDERED code size is ~18px on screen', Math.round(codeRendered * 10) / 10, '18 ±0.5'])
  assert.ok(codeRendered !== null && Math.abs(codeRendered - 18) < 0.5, `rendered ${codeRendered}`)

  // The authored column count survives, so width re-derives rather than drifts.
  checks.push(['CODE-4', 'characterWidth preserved through the scale change', codeProps.characterWidth, 48])
  assert.equal(codeProps.characterWidth, 48)

  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(SHOT, Buffer.from(shot.data, 'base64'))

  assert.deepEqual(localConsoleErrors(page), [], 'no console errors')
  pass('custom font size real-browser journey')
  console.log(SHOT)
} finally {
  app.close()
}
