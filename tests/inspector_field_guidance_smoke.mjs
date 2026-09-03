#!/usr/bin/env node
/**
 * Real-browser proof of the empty-field language in the two authored Block
 * forms that put several adjacent text boxes in front of a person: a Block
 * signature and a literal Pill. It deliberately uses real tools and inspector
 * buttons, then reads the mounted DOM rather than rendering components alone.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const PANEL = '[data-testid="block-development-inspector"]'
const FIXTURE_PANEL = '[data-testid="systemsketch-right-popout"]'
const ASSETS = join(ROOT, 'docs', 'assets')
const SHOT = join(ASSETS, 'inspector-field-guidance-2026-09-03.png')
const RESULTS = join(ASSETS, 'inspector-field-guidance-results-2026-09-03.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'inspector-field-guidance.systemsketch')
const { checks, pass } = makeChecklist()

const fields = (page, selector) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((field) => ({
    label: field.getAttribute('aria-label'),
    value: field.value,
    placeholder: field.getAttribute('placeholder'),
  }))
)`).then(JSON.parse)

async function drawBlankBlock(page) {
  await key(page, 'b', 'KeyB')
  await clickAt(page, 460, 300)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'blank Block title editor')
  await key(page, 'Enter', 'Enter')
  await waitFor(page, `document.querySelector(${JSON.stringify(PANEL)})`, 'Block inspector')
}

async function drawBlankPill(page) {
  await clickAt(page, 1040, 760)
  await key(page, 'p', 'KeyP')
  await clickAt(page, 760, 300)
  await waitFor(page, 'document.querySelector(\'[data-inspector-section="Pill"]\')', 'Pill inspector')
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({ label: 'inspector-field-guidance', build: 'inspector-field-guidance-smoke' })
  const { page, port, filesRoot } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'SystemSketch editor')
    await delay(400)

    await drawBlankBlock(page)
    const block = await fields(page, `${PANEL} input[aria-label="Block title"], ${PANEL} input[aria-label="Block type"]`)
    assert.deepEqual(block, [
      { label: 'Block title', value: '', placeholder: 'Title' },
      { label: 'Block type', value: '', placeholder: 'Type' },
    ])
    assert.equal(
      await evaluate(page, `document.querySelector(${JSON.stringify(`${PANEL} textarea`)})?.getAttribute('placeholder') ?? null`),
      'Display description',
    )
    pass('a blank Block names Title, Type, and Display description without filling them')

    await clickElement(page, `${PANEL} [aria-label="Add input port"]`)
    await waitFor(page,
      `document.querySelector(${JSON.stringify(`${PANEL} [aria-label="inputs in_1 name"]`)})`,
      'new input port')
    const portFields = await fields(page, `${PANEL} [aria-label="inputs in_1 name"], ${PANEL} [aria-label="inputs in_1 type"], ${PANEL} [aria-label="Default value for in_1"]`)
    assert.deepEqual(portFields, [
      { label: 'inputs in_1 name', value: '', placeholder: 'Name' },
      { label: 'inputs in_1 type', value: '', placeholder: 'Type' },
      { label: 'Default value for in_1', value: '', placeholder: 'Default' },
    ])
    pass('a newly added port keeps its internal id private and shows Name, Type, and Default')

    await drawBlankPill(page)
    const pill = await fields(page, '[data-inspector-section="Pill"] input')
    assert.deepEqual(pill, [
      { label: 'Variable name', value: '', placeholder: 'Name' },
      { label: 'Literal value', value: '', placeholder: 'Value' },
      { label: 'Variable type', value: '', placeholder: 'Type' },
    ])
    pass('a blank Pill names Name, Value, and Type without gain, 2.0, or float')

    const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(screenshot.data, 'base64'))

    const fixtureCopy = join(filesRoot, 'SystemSketch', 'inspector-field-guidance-review-copy.systemsketch')
    await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
    await copyFile(FIXTURE, fixtureCopy)
    await openApp(page, port, `?board=${encodeURIComponent(fixtureCopy)}`)
    await waitFor(page,
      `document.querySelector('[data-shape-id="shape:blank-block"] .systemsketch-block-canvas')`,
      'saved blank Block review target',
    )
    const rect = async (selector) => JSON.parse(await evaluate(page, `(() => {
      const box = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect()
      return JSON.stringify(box && { x: box.x, y: box.y, w: box.width, h: box.height })
    })()`))
    const blankBlock = await rect('[data-shape-id="shape:blank-block"] .systemsketch-block-canvas')
    await evaluate(page, `(() => { window.__systemsketch.editor.select('shape:blank-block'); return 'selected' })()`)
    await waitFor(page, `document.querySelector(${JSON.stringify(FIXTURE_PANEL)})`, 'fixture Block inspector')
    assert.deepEqual(
      await fields(page, `${FIXTURE_PANEL} input[aria-label="Block title"], ${FIXTURE_PANEL} input[aria-label="Block type"]`),
      [
        { label: 'Block title', value: '', placeholder: 'Title' },
        { label: 'Block type', value: '', placeholder: 'Type' },
      ],
    )
    await clickElement(page, `${FIXTURE_PANEL} [aria-label="Add input port"]`)
    await waitFor(page, `document.querySelector(${JSON.stringify(`${FIXTURE_PANEL} [aria-label="inputs in_2 name"]`)})`, 'fixture-added input')
    assert.deepEqual(
      await fields(page, `${FIXTURE_PANEL} [aria-label="inputs in_2 name"], ${FIXTURE_PANEL} [aria-label="inputs in_2 type"], ${FIXTURE_PANEL} [aria-label="Default value for in_2"]`),
      [
        { label: 'inputs in_2 name', value: '', placeholder: 'Name' },
        { label: 'inputs in_2 type', value: '', placeholder: 'Type' },
        { label: 'Default value for in_2', value: '', placeholder: 'Default' },
      ],
    )
    await evaluate(page, `(() => { window.__systemsketch.editor.select('shape:blank-pill'); return 'selected' })()`)
    await waitFor(page, `document.querySelector('[data-inspector-section="Pill"]')`, 'fixture Pill inspector')
    assert.deepEqual(await fields(page, '[data-inspector-section="Pill"] input'), [
      { label: 'Variable name', value: '', placeholder: 'Name' },
      { label: 'Literal value', value: '', placeholder: 'Value' },
      { label: 'Variable type', value: '', placeholder: 'Type' },
    ])
    const cueBefore = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-block-arrow'))`))
    await drag(page,
      { x: blankBlock.x + 75, y: blankBlock.y + 84 },
      { x: blankBlock.x + 165, y: blankBlock.y + 84 })
    const cueAfter = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-block-arrow'))`))
    assert.ok(Math.max(
      Math.abs(cueAfter.x - cueBefore.x),
      Math.abs(cueAfter.y - cueBefore.y),
      Math.abs(cueAfter.w - cueBefore.w),
      Math.abs(cueAfter.h - cueBefore.h),
    ) > 40, 'the cue arrow follows its moved Block target')
    pass('the saved review fixture opens, exercises blank Block and Pill fields, and keeps its bound cue attached')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the browser journey has no local console errors')

    const output = { checks, screenshot: SHOT }
    await writeFile(RESULTS, `${JSON.stringify(output, null, 2)}\n`)
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n  ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
