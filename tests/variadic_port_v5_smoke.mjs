#!/usr/bin/env node
/**
 * Browser proof for V5 Python variadic call ports. It visits the human review
 * board in the product canvas, then uses the uncommon inspector escape hatch
 * on a real Block in the block-development canvas.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'variadic-port-v5.systemsketch')
const BOARD_SHOT = join(ROOT, 'docs', 'assets', 'variadic-port-v5-review-board.png')
const INSPECTOR_SHOT = join(ROOT, 'docs', 'assets', 'variadic-port-v5-inspector-live.png')
const COMPOSE = 'shape:compose'
const PANEL = '[data-testid="block-development-inspector"]'
const ADD_INPUT = `${PANEL} [aria-label="Add input port"]`
const { checks, pass } = makeChecklist()

async function capture(page, destination) {
  const png = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(destination, Buffer.from(png.data, 'base64'))
}

async function productBoardProof() {
  const app = await startApp({
    label: 'variadic-port-v5-board', build: 'variadic-port-v5-smoke',
    allowSourceRoot: true, width: 1800, height: 900,
  })
  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(app.page, `document.querySelector('[data-shape-id="${COMPOSE}"]')`, 'V5 compose Block')
    await waitFor(app.page, `document.querySelectorAll('.BlockNode-variadicRun').length === 2`, 'two V5 group rails')
    await delay(350)

    const groups = JSON.parse(await evaluate(app.page, `JSON.stringify(
      Array.from(document.querySelectorAll('.BlockNode-variadicRun')).map((node) => ({
        group: node.getAttribute('data-variadic-group'),
        members: Number(node.getAttribute('data-variadic-members')),
        label: node.getAttribute('aria-label'),
      })),
    )`))
    assert.deepEqual(groups, [
      { group: 'positional:overlays', members: 3, label: '*overlays: 3 call expressions' },
      { group: 'keyword:options', members: 3, label: '**options: 3 call expressions' },
    ])
    pass('the real review Block renders one label and bracket for each V5 group')

    const ports = JSON.parse(await evaluate(app.page, `JSON.stringify(
      Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .Port')).map((node) => ({
        id: node.getAttribute('data-block-port-id'),
        variadic: node.classList.contains('Port_variadic'),
        bundled: node.classList.contains('Port_variadic--bundled'),
      })),
    )`))
    assert.equal(ports.filter((port) => port.variadic).length, 6,
      'six concrete variadic call expressions must remain physical ports')
    assert.deepEqual(ports.filter((port) => port.bundled).map((port) => port.id), [
      'overlay-spread', 'option-spread',
    ])
    pass('every direct argument keeps its own port; only *iterable and **mapping sources are dotted')

    const terminalPorts = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify(editor.getBindingsToShape('${COMPOSE}', 'connection')
        .filter((binding) => binding.props.terminal === 'end')
        .map((binding) => binding.props.portId).sort())
    })()`))
    assert.deepEqual(terminalPorts, ['base', 'option-spread', 'overlay-boxes', 'overlay-labels', 'overlay-spread'])
    pass('five visible source cables terminate on five stable, independently addressable slots')

    await capture(app.page, BOARD_SHOT)
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the saved review board renders without local browser errors')
  } finally {
    app.close()
  }
}

async function inspectorProof() {
  const app = await startApp({
    label: 'variadic-port-v5-inspector', build: 'variadic-port-v5-smoke', width: 1440, height: 900,
  })
  try {
    await openApp(app.page, app.port, '?preset=block-dev')
    await waitFor(app.page, `document.querySelector('[data-development-profile="block-dev"] .tl-container')`, 'Block development canvas', 60000)
    await delay(700)
    // Author a real Block through the stock tldraw tool path — no injected
    // shape state — then give its normal input the rare V5 role.
    await key(app.page, 'b', 'KeyB')
    await drag(app.page, { x: 440, y: 300 }, { x: 760, y: 510 })
    await waitFor(app.page, `document.querySelector('[data-testid="block-inline-title"]')`, 'new Block title editor')
    await app.page.send('Input.insertText', { text: 'compose()' })
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector('${PANEL}')`, 'real inspector')
    await clickElement(app.page, ADD_INPUT)
    // Signature metadata is deliberately tucked behind the inspector's rare
    // per-port state control, so ordinary Blocks keep their authoring row lean.
    await clickElement(app.page, `${PANEL} [data-testid="inspector-port-state-toggle-inputs"]`)
    await waitFor(app.page, `document.querySelector('${PANEL} [data-testid^="inspector-variadic-"]')`, 'ordinary port V5 disclosure')
    const disclosure = `${PANEL} [data-testid^="inspector-variadic-"]`
    await clickElement(app.page, `${disclosure} summary`)
    const role = `${disclosure} select[aria-label^="Variadic role for"]`
    await waitFor(app.page, `document.querySelector(${JSON.stringify(role)})`, 'variadic role control')
    await clickElement(app.page, role)
    await key(app.page, 'ArrowDown', 'ArrowDown')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector(${JSON.stringify(role)})?.value === 'positional'`, 'the *args role to commit')
    await waitFor(app.page, `document.querySelector('.BlockNode-variadicRun')`, 'live V5 bracket')
    pass('the inspector turns an ordinary real input into a closed-by-default *args back-room setting')

    await clickElement(app.page, `${disclosure} .block-inspector__variadic-bundle`)
    await waitFor(app.page, `document.querySelector('.Port.Port_variadic--bundled')`, 'dotted collar class')
    pass('toggling bundle through the inspector changes the real port decoration without replacing the port')

    await capture(app.page, INSPECTOR_SHOT)
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the inspector journey renders without local browser errors')
  } finally {
    app.close()
  }
}

async function main() {
  await productBoardProof()
  await inspectorProof()
  process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${BOARD_SHOT}\n  ${INSPECTOR_SHOT}\n`)
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
