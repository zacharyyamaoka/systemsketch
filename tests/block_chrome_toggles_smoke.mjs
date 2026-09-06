#!/usr/bin/env node
/**
 * Real-browser proof for the two optional pieces of Port/Expanded Block chrome.
 *
 * This drives the actual inspector—not a model command—then checks both paint
 * and geometry. A hidden footer must disappear *and* return its room to the
 * body; a hidden header divider must lose only its line, not its heading.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ID = 'shape:block-chrome-review'
const SCOPE = `[data-shape-id="${ID}"]`
const ASSETS = join(ROOT, 'docs', 'assets')
const BEFORE = join(ASSETS, 'block-chrome-toggles-before-2026-09-04.png')
const AFTER = join(ASSETS, 'block-chrome-toggles-hidden-2026-09-04.png')
const RESULTS = join(ASSETS, 'block-chrome-toggles-results-2026-09-04.json')

async function shot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function visualState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const canvas = document.querySelector(${JSON.stringify(`${SCOPE} .systemsketch-block-canvas`)})
    const heading = canvas?.querySelector('.NodeShape-heading')
    const footer = canvas?.querySelector('.NodeShape-footer')
    const firstPort = canvas?.querySelector('.Port[data-block-port-id="in_1"]')
    const inspector = document.querySelector('[data-inspector-section="Chrome"]')
    return JSON.stringify({
      headerDivider: canvas?.dataset.headerDivider ?? null,
      footer: Boolean(footer),
      footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null,
      heading: Boolean(heading),
      headingBorder: heading ? getComputedStyle(heading).borderBottomColor : null,
      firstPortTop: firstPort ? Math.round(firstPort.getBoundingClientRect().top) : null,
      chromeControls: inspector
        ? Array.from(inspector.querySelectorAll('[role="group"]')).map((group) => ({
          label: group.getAttribute('aria-label'),
          pressed: Array.from(group.querySelectorAll('button[aria-pressed="true"]'))
            .map((button) => button.textContent.trim()),
        }))
        : [],
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({ label: 'block-chrome-toggles', width: 1440, height: 960 })
  const results = {}
  try {
    const { page, port } = app
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'development editor seam')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({
        id: ${JSON.stringify(ID)},
        type: 'block',
        x: 250,
        y: 180,
        props: {
          title: 'compose_scene()',
          blockType: 'RenderPass',
          description: 'A body that visibly expands when its chrome is removed.',
          showDescription: true,
          showFooter: true,
          showHeaderDivider: true,
          view: 'port',
          w: 560,
          h: 200,
          views: {
            simple: { w: 320, h: 206 },
            port: { w: 560, h: 200 },
            expanded: { w: 560, h: 380 },
            value: { w: 168, h: 56 },
          },
          portLayout: 'inline',
          inputs: [
            { id: 'in_1', name: 'camera', type: 'Camera', visible: true },
            { id: 'in_2', name: 'lights', type: 'LightSet', visible: true },
          ],
          outputs: [{ id: 'out_1', name: 'image', type: 'Image', visible: true }],
        },
      })
      editor.setCamera({ x: 0, y: 0, z: 1 })
      editor.select(${JSON.stringify(ID)})
    })()`)

    await waitFor(page, `document.querySelector(${JSON.stringify(`${SCOPE} .NodeShape-footer`)})`, 'visible footer')
    await waitFor(page, `document.querySelector('[data-inspector-section="Chrome"]')`, 'Chrome inspector section')
    await delay(300)
    results.before = await visualState(page)
    assert.equal(results.before.headerDivider, 'shown')
    assert.equal(results.before.footer, true)
    assert.equal(results.before.heading, true)
    assert.deepEqual(results.before.chromeControls, [
      { label: 'Block footer', pressed: ['show'] },
      { label: 'Header divider', pressed: ['show'] },
    ])
    await shot(page, BEFORE)

    await clickElement(page, '[data-inspector-section="Chrome"] [aria-label="Block footer"] button:nth-child(2)')
    await waitFor(page, `!document.querySelector(${JSON.stringify(`${SCOPE} .NodeShape-footer`)})`, 'hidden footer')
    await clickElement(page, '[data-inspector-section="Chrome"] [aria-label="Header divider"] button:nth-child(2)')
    await waitFor(page,
      `document.querySelector(${JSON.stringify(`${SCOPE} .systemsketch-block-canvas`)})?.dataset.headerDivider === 'hidden'`,
      'hidden header divider')
    await delay(250)

    results.after = await visualState(page)
    assert.equal(results.after.footer, false)
    assert.equal(results.after.headerDivider, 'hidden')
    assert.equal(results.after.heading, true, 'hiding the rule retains the heading edit target')
    assert.ok(results.after.headingBorder.includes('0)'), `expected transparent rule, got ${results.after.headingBorder}`)
    assert.ok(results.after.firstPortTop > results.before.firstPortTop,
      'hiding the footer returns its vertical strip to the Port body')
    assert.deepEqual(results.after.chromeControls, [
      { label: 'Block footer', pressed: ['hide'] },
      { label: 'Header divider', pressed: ['hide'] },
    ])
    await shot(page, AFTER)

    results.consoleErrors = localConsoleErrors(page)
    assert.deepEqual(results.consoleErrors, [])
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    process.stdout.write('  PASS  inspector exposes Footer and Header divider controls\n')
    process.stdout.write('  PASS  hiding footer removes it and gives its room to Port rows\n')
    process.stdout.write('  PASS  hiding header divider preserves the heading and removes only its rule\n')
    process.stdout.write(`  ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAILED  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
