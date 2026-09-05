#!/usr/bin/env node
/** Real-browser proof for generic adjacent-port links and all three Inspector treatments. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const COMPOSE = 'shape:compose'
const { checks, pass } = makeChecklist()
const requestedPrototype = process.env.PORT_LINK_PROTOTYPE

// Review boards are deliberately safe for a human to edit. This proof authors
// its one real Block into a disposable, empty document instead of treating a
// reviewer's ordering or link experiment as a product regression.
const TEST_INPUTS = [
  { id: 'base', name: 'base', type: 'Frame', visible: true },
  { id: 'overlays', name: '*overlays', type: 'Layer', visible: true, link: { groupId: 'link:overlays' } },
  { id: 'layer', name: 'layer', type: 'Layer', visible: true, link: { groupId: 'link:overlays' } },
  { id: 'labels', name: 'labels', type: 'Layer', visible: true, link: { groupId: 'link:overlays' } },
  { id: 'opacity', name: 'opacity', type: 'float', visible: true },
  { id: 'options', name: '**options', type: 'object', visible: true },
]

const TEST_BLOCK_PROPS = {
  title: 'compose()',
  description: 'Ordinary names stay editable; a link only groups neighbouring body ports.',
  blockType: 'Frame',
  view: 'port',
  w: 470,
  h: 510,
  inputs: TEST_INPUTS,
  outputs: [{ id: 'result', name: 'result', type: 'Frame', visible: true }],
}

// The editor owns a live document session. Fresh processes keep every visual
// treatment about its own URL/model state instead of a previous route's tree.
if (!requestedPrototype) {
  const script = fileURLToPath(import.meta.url)
  for (const prototype of ['1', '2', '3']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], {
        cwd: ROOT,
        env: { ...process.env, PORT_LINK_PROTOTYPE: prototype },
        stdio: 'inherit',
      })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`V${prototype} browser proof failed`)))
    })
  }
  process.exit(0)
}

async function capture(page, destination) {
  const png = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(destination, Buffer.from(png.data, 'base64'))
}

async function openInspector(page, app, board, prototype) {
  await openApp(page, app.port, `?board=${encodeURIComponent(board)}&portLinkPrototype=${prototype}`)
  await waitFor(page, 'window.__systemsketch?.editor', `V${prototype} editor`)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShape({
      id: '${COMPOSE}',
      type: 'block',
      x: 590,
      y: 210,
      props: ${JSON.stringify(TEST_BLOCK_PROPS)},
    })
  })()`)
  await waitFor(page, `document.querySelector('[data-shape-id="${COMPOSE}"]')`, `V${prototype} compose Block`)
  await waitFor(page, "document.querySelector('i[aria-label=\"Saved\"]')", `V${prototype} fixture save`)
  await clickElement(page, `[data-shape-id="${COMPOSE}"] .NodeShape-heading`)
  await waitFor(page, "document.querySelector('.block-inspector')", `V${prototype} Block inspector`)
  await clickElement(page, '[data-testid="inspector-port-link-toggle-inputs"]')
}

async function main() {
  const app = await startApp({
    label: 'port-linking',
    build: 'port-linking',
    allowSourceRoot: true,
    width: 1800,
    height: 1000,
  })
  try {
    const board = join(app.filesRoot, 'SystemSketch', `port-linking-v${requestedPrototype}.systemsketch`)

    if (requestedPrototype === '1') {
      await openInspector(app.page, app, board, '1')
      await waitFor(app.page, "document.querySelector('[data-testid=\"inspector-link-variant-1\"]')", 'V1 range-pick controls')
      await clickElement(app.page, '[data-testid="inspector-link-select-inputs-base"]')
      await clickElement(app.page, '[data-testid="inspector-link-select-inputs-overlays"]')
      await waitFor(app.page, "document.querySelector('[data-testid=\"inspector-link-selection-apply\"]:not(:disabled)')", 'V1 contiguous selection')
      await capture(app.page, join(ROOT, 'docs', 'assets', 'port-linking-inspector-v1.png'))
      await clickElement(app.page, '[data-testid="inspector-link-selection-apply"]')
      await waitFor(app.page, "document.querySelectorAll('[data-testid^=\"port-link-run-\"]').length === 2", 'V1 range action')
      pass('V1 offers a real two-row selection and creates two independent adjacent slots')
    } else if (requestedPrototype === '2') {
      await openInspector(app.page, app, board, '2')
      await waitFor(app.page, "document.querySelectorAll('[data-testid^=\"inspector-link-seam-inputs-\"]').length === 5", 'V2 seam controls')
      await capture(app.page, join(ROOT, 'docs', 'assets', 'port-linking-inspector-v2.png'))
      await clickElement(app.page, '[data-testid="inspector-link-seam-inputs-labels-opacity"]')
      await waitFor(app.page, "document.querySelector('i[aria-label=\"Unsaved\"], i[aria-label=\"Saving\"]')", 'V2 autosave starts')
      await waitFor(app.page, "document.querySelector('[data-testid=\"port-link-run-overlays\"]')?.dataset.portLinkMembers === '4'", 'V2 joined slot')
      const v2Facts = JSON.parse(await evaluate(app.page, `JSON.stringify({
        names: Array.from(document.querySelectorAll('[data-inspector-section="Inputs"] .block-inspector__port-name')).map((node) => node.value),
        dotCenters: ['overlays', 'layer', 'labels', 'opacity'].map((id) => {
          const rect = document.querySelector('[data-block-port-id="' + id + '"]')?.getBoundingClientRect()
          return rect ? rect.left + rect.width / 2 : null
        }),
        slot: (() => {
          const rect = document.querySelector('[data-testid="port-link-run-overlays"] .BlockNode-portLinkSleeve')?.getBoundingClientRect()
          return rect ? { center: rect.left + rect.width / 2, width: rect.width } : null
        })(),
      })`))
      assert.deepEqual(v2Facts.names, ['base', '*overlays', 'layer', 'labels', 'opacity', '**options'])
      assert.ok(v2Facts.dotCenters.every((center) => Math.abs(center - v2Facts.slot.center) < 0.5), 'the grouping slot stays centred on each linked ordinary port')
      assert.ok(v2Facts.slot.width >= 21.5 && v2Facts.slot.width <= 22.5, 'the slot stays just beyond the ports’ 18px painted diameter')
      await waitFor(app.page, "document.querySelector('i[aria-label=\"Saved\"]')", 'V2 autosave')
      const timeOrigin = await evaluate(app.page, 'String(performance.timeOrigin)')
      await app.page.send('Page.reload')
      await waitFor(app.page, `String(performance.timeOrigin) !== ${JSON.stringify(timeOrigin)}`, 'V2 reload begins')
      await waitFor(app.page, 'document.readyState === "complete"', 'V2 reload')
      await waitFor(app.page, "document.querySelector('[data-testid=\"port-link-run-overlays\"]')?.dataset.portLinkMembers === '4'", 'V2 persisted link')
      pass('V2 joins at one exact seam, preserves written names, centres the tight slot, and persists')
    } else if (requestedPrototype === '3') {
      await openInspector(app.page, app, board, '3')
      await waitFor(app.page, "document.querySelector('[data-testid=\"inspector-link-variant-3\"]')", 'V3 endpoint controls')
      await capture(app.page, join(ROOT, 'docs', 'assets', 'port-linking-inspector-v3.png'))
      await clickElement(app.page, '[data-testid="inspector-link-range-apply"]')
      await waitFor(app.page, "document.querySelector('[data-testid=\"port-link-run-base\"]')?.dataset.portLinkMembers === '6'", 'V3 endpoint range action')
      pass('V3 offers a real explicit start/end range and links that contiguous authored interval')
    } else {
      throw new Error(`Unknown PORT_LINK_PROTOTYPE ${requestedPrototype}`)
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
