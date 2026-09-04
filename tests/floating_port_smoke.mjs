/**
 * A free Port is authored as one small semantic endpoint, not a mini Block.
 *
 * The development seam seeds the board because it has no user-facing fixture
 * loader. Every behaviour under test after that (the inspector and both
 * directions of a cable) is driven through the live product canvas.
 */
import assert from 'node:assert/strict'

import {
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  box,
  cables,
  dragFrom,
  portDot,
  shot,
} from './block_journey_helpers.mjs'

const SOURCE = 'shape:source-port'
const BLOCK = 'shape:integrate'
const SINK = 'shape:sink-port'

const results = []
function pass(message) {
  results.push(message)
  process.stdout.write(`  PASS  ${message}\n`)
}

async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return 'null'
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
  })()`))
  assert.ok(point, `missing ${selector}`)
  await clickAt(page, point.x, point.y)
}

async function replaceField(page, label, value) {
  const selector = `[aria-label=${JSON.stringify(label)}]`
  await clickSelector(page, selector)
  await shortcut(page, 'a', 'KeyA', 2)
  await page.send('Input.insertText', { text: value })
  await delay(180)
}

async function seedBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    const port = (id, x, y, props) => ({
      id, type: 'floating-port', x, y,
      props: { w: 1, h: 1, name: 'port', type: 'Any', value: '', direction: 'input', textLayout: 'inline', fill: 'auto', ...props },
    })
    const inputs = [{ id: 'in_velocity', name: 'velocity', type: 'Number', visible: true }]
    const outputs = [{ id: 'out_result', name: 'result', type: 'Number', visible: true }]
    editor.createShapes([
      port(${JSON.stringify(SOURCE)}, 210, 355, { name: 'velocity', type: 'Number', value: '3.5', direction: 'output' }),
      {
        id: ${JSON.stringify(BLOCK)}, type: 'block', x: 500, y: 260,
        props: {
          title: 'integrate()', blockType: 'Function', description: '', view: 'port', w: 300, h: 180,
          views: { simple: { w: 300, h: 206 }, port: { w: 300, h: 180 }, expanded: { w: 300, h: 180 }, value: { w: 168, h: 56 } },
          showDescription: false, portLayout: 'inline', inputs, outputs,
        },
      },
      port(${JSON.stringify(SINK)}, 1080, 355, { name: 'state', type: 'Number', direction: 'input', textLayout: 'offset' }),
    ])
    editor.select(${JSON.stringify(SOURCE)})
    editor.setCamera({ x: 0, y: 0, z: 1 })
  })()`)
  await delay(450)
}

const portState = (page, id) => evaluate(page, `(() => {
  const dot = document.querySelector('[data-testid="floating-port-dot-${id.replace('shape:', '')}"]')
  const label = document.querySelector('[data-testid="floating-port-${id.replace('shape:', '')}"] .FloatingPort-label')
  if (!dot || !label) return null
  return JSON.stringify({
    filled: dot.classList.contains('Port_connected'),
    fill: dot.dataset.floatingPortFill,
    // CSS supplies the visual gaps; read the semantic spans with spaces so
    // this assertion describes what people see rather than JSX whitespace.
    label: Array.from(label.children).map((part) => part.textContent.trim()).join(' '),
  })
})()`).then(JSON.parse)

const bindings = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  return editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').map((connection) =>
    editor.getBindingsFromShape(connection.id, 'connection').map((binding) => ({
      terminal: binding.props.terminal, shape: binding.toId, port: binding.props.portId,
    })).sort((a, b) => a.terminal.localeCompare(b.terminal)),
  )
})())`).then(JSON.parse)

async function main() {
  const app = await startApp({ label: 'floating-port', width: 1440, height: 960 })
  try {
    const { page } = app
    await openApp(page, app.port, '')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'editor seam')
    await seedBoard(page)

    await waitFor(page, `document.querySelector('[data-testid="floating-port-inspector"]')`, 'Port inspector')
    assert.deepEqual(await portState(page, SOURCE), { filled: false, fill: 'auto', label: 'velocity Number = 3.5' })
    pass('a selected Port exposes its small Block-style name, type, value, direction, text, and filled-state editor')

    await replaceField(page, 'Port name', 'speed')
    await replaceField(page, 'Port type', 'float')
    await replaceField(page, 'Port value', '7.2')
    await clickSelector(page, '[aria-label="Port text layout"] button:nth-child(2)')
    const configured = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape(${JSON.stringify(SOURCE)}).props)`))
    assert.deepEqual(
      { name: configured.name, type: configured.type, value: configured.value, direction: configured.direction, textLayout: configured.textLayout, fill: configured.fill },
      { name: 'speed', type: 'float', value: '7.2', direction: 'output', textLayout: 'offset', fill: 'auto' },
    )
    assert.equal((await portState(page, SOURCE)).label, 'speed float = 7.2')
    pass('inspector edits update the free dot in place, including the raised text path and output orientation')

    const sourceDot = await box(page, '[data-testid="floating-port-dot-source-port"]')
    const inputDot = await box(page, portDot(BLOCK, 'input', 'in_velocity'))
    const sourceWire = await dragFrom(page, sourceDot, inputDot)
    assert.equal(sourceWire.count, 1)
    assert.equal((await portState(page, SOURCE)).filled, true)
    pass('an output Port wires into a Block input and its Auto fill follows the real cable')

    const outputDot = await box(page, portDot(BLOCK, 'output', 'out_result'))
    const sinkDot = await box(page, '[data-testid="floating-port-dot-sink-port"]')
    const sinkWire = await dragFrom(page, outputDot, sinkDot)
    assert.equal(sinkWire.count, 2)
    assert.equal((await portState(page, SINK)).filled, true)
    assert.deepEqual(await bindings(page), [
      [
        { terminal: 'end', shape: BLOCK, port: 'in_velocity' },
        { terminal: 'start', shape: SOURCE, port: 'port' },
      ],
      [
        { terminal: 'end', shape: SINK, port: 'port' },
        { terminal: 'start', shape: BLOCK, port: 'out_result' },
      ],
    ])
    pass('a Block output also wires into a free input Port, so a Port is usable from either side')

    await clickSelector(page, `[data-testid="floating-port-${SOURCE.replace('shape:', '')}"] .FloatingPort-label`)
    await waitFor(page, `document.querySelector('[data-testid="floating-port-inspector"]')`, 'reselected Port inspector')
    await clickSelector(page, '[aria-label="Port filled state"] button:nth-child(3)')
    assert.deepEqual(await portState(page, SOURCE), { filled: false, fill: 'empty', label: 'speed float = 7.2' })
    await clickSelector(page, '[aria-label="Port filled state"] button:nth-child(1)')
    assert.equal((await portState(page, SOURCE)).filled, true)
    pass('Empty can temporarily override the derived fill, while Auto restores the cable-derived state')

    await shot(page, 'floating-port-live-2026-09-04.png')
    assert.deepEqual(await localConsoleErrors(page), [])
    pass('the complete Port canvas journey raises no browser console errors')
    process.stdout.write(`\n  ${results.length}/${results.length} browser checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
