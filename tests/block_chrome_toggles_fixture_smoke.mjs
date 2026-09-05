#!/usr/bin/env node
/** Drive the saved Block-chrome review board once through the real product app. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'block-chrome-toggles.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-chrome-toggles-fixture-driven-2026-09-04.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'block-chrome-toggles-fixture-driven-2026-09-04.json')
const SCOPE = '[data-shape-id="shape:shown"]'

async function fixtureState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const target = editor.getShape('shape:shown')
    const arrows = editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow')
    const bindings = arrows.map((arrow) => ({
      id: arrow.id,
			targets: editor.getBindingsFromShape(arrow.id, 'arrow').map((binding) => binding.toId),
    }))
    const canvas = document.querySelector(${JSON.stringify(`${SCOPE} .systemsketch-block-canvas`)})
    return JSON.stringify({
      target: { x: target.x, y: target.y },
      cueArrowsBoundToShown: bindings.filter((arrow) => arrow.targets.includes('shape:shown')).length,
      footer: Boolean(canvas?.querySelector('.NodeShape-footer')),
      headerDivider: canvas?.dataset.headerDivider ?? null,
    })
  })()`))
}

async function main() {
  const app = await startApp({ label: 'block-chrome-fixture', build: 'block-chrome-fixture' })
  const results = {}
  try {
    const { page, port, filesRoot } = app
    const scratchDir = join(filesRoot, 'SystemSketch')
    const scratch = join(scratchDir, 'block-chrome-toggles-copy.systemsketch')
    await mkdir(scratchDir, { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page,
      `document.querySelector(${JSON.stringify(`${SCOPE} .NodeShape-footer`)})`,
      'shown review Block')
    await delay(450)

    results.before = await fixtureState(page)
    assert.equal(results.before.cueArrowsBoundToShown, 2, 'each numbered cue is bound to its target Block')

    // A real footer drag moves the primary target. The two stock cue arrows
    // are bound at their arrow terminals, so both must stay bound after this
    // independent product gesture—not merely look roughly connected once.
    const footer = await elementBox(page, `${SCOPE} .NodeShape-footer`)
    await drag(page, { x: footer.x + 32, y: footer.y + footer.height / 2 }, {
      x: footer.x + 122,
      y: footer.y + footer.height / 2 + 42,
    })
    await delay(350)
    results.moved = await fixtureState(page)
		assert.ok(results.moved.target.x > results.before.target.x + 70, 'real footer drag moved target right')
		assert.ok(results.moved.target.y > results.before.target.y + 30, 'real footer drag moved target down')
    assert.equal(results.moved.cueArrowsBoundToShown, 2, 'cue arrows remain attached after target motion')

    await waitFor(page, `document.querySelector('[data-inspector-section="Chrome"]')`, 'Chrome inspector')
    await clickElement(page, '[data-inspector-section="Chrome"] [aria-label="Block footer"] button:nth-child(2)')
    await waitFor(page, `!document.querySelector(${JSON.stringify(`${SCOPE} .NodeShape-footer`)})`, 'footer hidden in fixture')
    await clickElement(page, '[data-inspector-section="Chrome"] [aria-label="Header divider"] button:nth-child(2)')
    await waitFor(page,
      `document.querySelector(${JSON.stringify(`${SCOPE} .systemsketch-block-canvas`)})?.dataset.headerDivider === 'hidden'`,
      'header divider hidden in fixture')
    await delay(250)
    results.after = await fixtureState(page)
    assert.equal(results.after.footer, false)
    assert.equal(results.after.headerDivider, 'hidden')
    assert.equal(results.after.cueArrowsBoundToShown, 2)
    results.consoleErrors = localConsoleErrors(page)
    assert.deepEqual(results.consoleErrors, [])

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    process.stdout.write('  PASS  review cue arrows remain bound during a real footer drag\n')
    process.stdout.write('  PASS  saved review Block reaches the expected stripped chrome state\n')
    process.stdout.write(`  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAILED  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
