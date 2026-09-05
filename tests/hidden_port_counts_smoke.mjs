#!/usr/bin/env node
/**
 * Real-browser proof that a compact Block makes deliberately hidden contract
 * surface visible as per-side `+N more` disclosures. The test writes the
 * visibility flags through the same record field the inspector's eye toggles,
 * then reads painted DOM rather than accepting a model-only count.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'hidden-port-counts-2026-09-04.png')
const BLOCK_ID = 'shape:component-contract'
const FIXTURE_BLOCK_ID = 'shape:component'

async function screenshot(page) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
}

async function paintedState(page) {
  const result = await evaluate(page, `(() => {
    const block = document.querySelector('[data-shape-id="${BLOCK_ID}"]')
    if (!block) return null
    const summary = (side) => {
      const node = block.querySelector('.BlockNode-hiddenPorts--' + side)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return { text: node.textContent.trim(), count: node.dataset.hiddenPortCount, top: rect.top, bottom: rect.bottom }
    }
    const labelBottom = (side) => Math.max(-Infinity, ...Array.from(
      block.querySelectorAll('.BlockNode-portLabel--' + (side === 'input' ? 'in' : 'out')),
    ).map((node) => node.getBoundingClientRect().bottom))
    return JSON.stringify({
      input: summary('input'),
      output: summary('output'),
      inputLabelBottom: labelBottom('input'),
      outputLabelBottom: labelBottom('output'),
      paintedPortIds: Array.from(block.querySelectorAll('.Port')).map((node) => node.dataset.blockPortId).sort(),
    })
  })()`)
  if (!result) throw new Error('the component Block did not paint')
  return JSON.parse(result)
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(join(ROOT, 'docs', 'assets'))
  const app = await startApp({
    label: 'hidden-port-counts',
    build: 'hidden-port-counts',
    allowSourceRoot: true,
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor && document.querySelector(".tl-container")', 'Block Dev canvas')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const base = editor.getShapeUtil('block').getDefaultProps()
      editor.createShape({
        id: '${BLOCK_ID}', type: 'block', x: 490, y: 220,
        props: {
          ...base,
          title: 'Component', blockType: 'async component', view: 'port',
          w: 420, h: 310,
          views: { ...base.views, port: { w: 420, h: 310 } },
          showDescription: false,
          inputs: [
            { id: 'in_state', name: 'state', type: 'State', visible: true },
            { id: 'in_config', name: 'config', type: 'Config', visible: true },
            { id: 'in_data', name: 'data_in', type: 'Packet', visible: false },
            { id: 'in_tick', name: 'tick', type: 'Event', visible: false },
            { id: 'in_control', name: 'control', type: 'Control', visible: false },
          ],
          outputs: [
            { id: 'out_state', name: 'state', type: 'State', visible: true },
            { id: 'out_logs', name: 'logs', type: 'Logs', visible: false },
            { id: 'out_dx', name: 'dx', type: 'Diagnostics', visible: false },
          ],
        },
      })
      editor.select('${BLOCK_ID}')
      return true
    })()`)
    await waitFor(page, `document.querySelector('[data-shape-id="${BLOCK_ID}"] .BlockNode-hiddenPorts--input')`, 'input count')
    await delay(300)

    const initial = await paintedState(page)
    assert.deepEqual(initial.input && { text: initial.input.text, count: initial.input.count }, { text: '+3 more', count: '3' })
    assert.deepEqual(initial.output && { text: initial.output.text, count: initial.output.count }, { text: '+2 more', count: '2' })
    assert.ok(initial.input.top >= initial.inputLabelBottom, 'input count follows the final visible input')
    assert.ok(initial.output.top >= initial.outputLabelBottom, 'output count follows the final visible output')
    assert.deepEqual(initial.paintedPortIds, ['in_config', 'in_state', 'out_state'])
    pass('the live face separates three hidden inputs from two hidden outputs and paints no phantom dots')

    await screenshot(page)

    // Drive the inspector's real eye control once. The count is not a
    // decoration for seeded data; it must follow the ordinary visibility
    // gesture a person uses to curate a component's surface.
    await clickElement(page, '[data-inspector-section="Inputs"] .block-inspector__count-pill')
    await waitFor(page, 'document.querySelector(\'button[aria-label="Hide config"]\')', 'managed input rows')
    await clickElement(page, 'button[aria-label="Hide config"]')
    await waitFor(page, `document.querySelector('[data-shape-id="${BLOCK_ID}"] .BlockNode-hiddenPorts--input')?.textContent.includes('+4 more')`, 'count after hiding config')
    assert.equal((await paintedState(page)).input.text, '+4 more')
    await clickElement(page, 'button[aria-label="Show config"]')
    await waitFor(page, `document.querySelector('[data-shape-id="${BLOCK_ID}"] .BlockNode-hiddenPorts--input')?.textContent.includes('+3 more')`, 'count after restoring config')
    await clickElement(page, '[data-inspector-section="Inputs"] .block-inspector__count-pill')
    pass('the inspector’s Hide / Show control updates the on-card count in the same gesture')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape('${BLOCK_ID}')
      editor.updateShape({
        id: shape.id, type: 'block',
        props: {
          inputs: shape.props.inputs.map((port) => port.id === 'in_data' ? { ...port, visible: true } : port),
          outputs: shape.props.outputs.map((port) => ({ ...port, visible: true })),
        },
      })
      return true
    })()`)
    await waitFor(page, `document.querySelector('[data-shape-id="${BLOCK_ID}"] .BlockNode-hiddenPorts--input')?.textContent.includes('+2 more')`, 'updated input count')
    const updated = await paintedState(page)
    assert.deepEqual(updated.input && { text: updated.input.text, count: updated.input.count }, { text: '+2 more', count: '2' })
    assert.equal(updated.output, null, 'showing every output removes the output disclosure')
    assert.deepEqual(updated.paintedPortIds, ['in_config', 'in_data', 'in_state', 'out_dx', 'out_logs', 'out_state'])
    pass('changing the real visibility flags immediately updates and removes the derived summaries')

    // The seeded review board is the human-facing copy, so open that exact
    // saved document and exercise its stated gesture as well.
    const fixture = join(ROOT, 'sketches', 'review', 'hidden-port-counts.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(fixture)}`)
    await waitFor(page, `document.querySelector('[data-shape-id="${FIXTURE_BLOCK_ID}"]')`, 'saved review fixture')
    const fixtureBlock = JSON.parse(await evaluate(page, `(() => {
      const rect = document.querySelector('[data-shape-id="${FIXTURE_BLOCK_ID}"] .systemsketch-block-canvas')?.getBoundingClientRect()
      return rect ? JSON.stringify({ x: rect.x, y: rect.y }) : null
    })()`))
    await clickAt(page, fixtureBlock.x + 26, fixtureBlock.y + 24)
    await waitFor(page, 'document.querySelector(\'[data-inspector-section="Inputs"] .block-inspector__count-pill\')', 'fixture inspector')
    await clickElement(page, '[data-inspector-section="Inputs"] .block-inspector__count-pill')
    await clickElement(page, 'button[aria-label="Hide config"]')
    await waitFor(page, `document.querySelector('[data-shape-id="${FIXTURE_BLOCK_ID}"] .BlockNode-hiddenPorts--input')?.textContent.includes('+4 more')`, 'fixture count after hiding config')
    await clickElement(page, 'button[aria-label="Show config"]')
    await waitFor(page, `document.querySelector('[data-shape-id="${FIXTURE_BLOCK_ID}"] .BlockNode-hiddenPorts--input')?.textContent.includes('+3 more')`, 'fixture count after restoring config')
    pass('the saved review board opens and its documented inspector gesture updates the real Block')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the rendered projection produced no browser errors')
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  ${error.stack ?? error}\n`)
  process.exitCode = 1
})
