#!/usr/bin/env node
/** Real renderer proof for V7's containment-only grouping alternatives. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'variadic-port-v7-grouping.systemsketch')
const COMPOSE = 'shape:compose'
const { checks, pass } = makeChecklist()

async function capture(page, destination) {
  const png = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(destination, Buffer.from(png.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: 'variadic-port-v7-grouping',
    build: 'variadic-port-v7-grouping',
    allowSourceRoot: true,
    width: 1800,
    height: 1000,
  })
  try {
    const boardDirectory = join(app.filesRoot, 'SystemSketch')
    const board = join(boardDirectory, 'variadic-port-v7-grouping.systemsketch')
    await mkdir(boardDirectory, { recursive: true })
    await copyFile(FIXTURE, board)

    for (const prototype of ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5']) {
      await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}&variadicPrototype=${prototype}`)
      await waitFor(app.page, `document.querySelector('[data-shape-id="${COMPOSE}"]')`, `${prototype} compose Block`)
      await waitFor(app.page, 'document.querySelectorAll(\'.BlockNode-variadicBackdrop\').length === 2', `${prototype} grouping fields`)
      await delay(250)

      const canvas = JSON.parse(await evaluate(app.page, `JSON.stringify({
        mode: document.querySelector('[data-shape-id="${COMPOSE}"] .systemsketch-block-canvas')?.dataset.variadicPrototype,
        labels: Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicLabel')).map((node) => node.textContent.trim()),
        rails: document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicBracket').length,
        arrows: document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicSocket').length,
        collars: [...new Set(Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .Port_variadic')).map((node) => getComputedStyle(node, '::after').borderColor))],
      })`))
      assert.equal(canvas.mode, prototype)
      assert.deepEqual(canvas.labels, ['*overlays', '**options'])
      assert.equal(canvas.rails, 0, 'containment alternatives must not draw a connecting rail')
      assert.equal(canvas.arrows, 0, 'containment alternatives must not draw arrowheads')
      assert.equal(canvas.collars.length, 1, 'args and kwargs collars share one neutral grouping colour')
      pass(`${prototype} renders two neutral containment fields without cable-like marks`)

      await capture(app.page, join(ROOT, 'docs', 'assets', `variadic-port-v7-${prototype}.png`))

      if (prototype !== 'slot-1') continue
      await clickElement(app.page, `[data-shape-id="${COMPOSE}"] .NodeShape-heading`)
      await waitFor(app.page, 'document.querySelector(\'.block-inspector\')', 'real Block inspector')
      const stateToggle = '[data-testid="inspector-port-state-toggle-inputs"]'
      await waitFor(app.page, `document.querySelector(${JSON.stringify(stateToggle)})?.getAttribute('aria-pressed') === 'false'`, 'quiet default inspector')
      assert.equal(await evaluate(app.page, "document.querySelectorAll('[data-testid^=\\\"inspector-variadic-\\\"]').length"), 0)
      await clickElement(app.page, stateToggle)
      await waitFor(app.page, `document.querySelector(${JSON.stringify(stateToggle)})?.getAttribute('aria-pressed') === 'true'`, 'port state mode')
      await waitFor(app.page, "document.querySelectorAll('[data-testid^=\"inspector-variadic-\"]').length === 7", 'quiet variadic disclosures')
      pass('the quiet V1 editor remains hidden until the explicit Inputs state toggle is pressed')
      await capture(app.page, join(ROOT, 'docs', 'assets', 'variadic-port-v7-inspector-state.png'))

      // Tags is also a disclosure after the semantic-role integration. Target
      // the port-management control specifically: this proof is about its
      // state-mode handoff, not about opening the independent Tags panel.
      const visibleToggle = '[data-inspector-section="Inputs"] .block-inspector__count-pill[aria-expanded]'
      await clickElement(app.page, visibleToggle)
      await waitFor(app.page, `document.querySelector(${JSON.stringify(visibleToggle)})?.getAttribute('aria-expanded') === 'true'`, 'visible port-management mode')
      await waitFor(app.page, `document.querySelector(${JSON.stringify(stateToggle)})?.getAttribute('aria-pressed') === 'false'`, 'state mode closes when visible mode opens')
      assert.equal(await evaluate(app.page, "document.querySelectorAll('[data-testid^=\"inspector-variadic-\"]').length"), 0)
      pass('Inputs visible and state remain mutually exclusive, so reordering never expands the rare metadata editor')
    }
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
