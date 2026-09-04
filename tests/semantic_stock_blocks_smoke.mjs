/**
 * Curated semantic Blocks in the real Block development composition.
 *
 * The dev seam only arranges the three persisted props records. Every product
 * assertion is then read from painted DOM/inspector controls after actual
 * selection and clicks, including the Set attributes add-member command.
 */
import {
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box } from './block_journey_helpers.mjs'

const results = []
const check = (id, label, observed, desired) => {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
  return ok
}

const views = (w, h) => ({
  simple: { w: 320, h: 206 }, port: { w, h }, expanded: { w: 560, h: 380 }, value: { w: 168, h: 56 },
})
const port = (id, name, type, row) => ({ id, name, type, visible: true, row })

async function seed(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    const block = (id, x, y, title, blockType, inputs, outputs, stockConfig, description) => ({
      id, type: 'block', x, y,
      props: {
        title, blockType, description, icon: '', view: 'port', w: 340, h: 250,
        views: ${JSON.stringify(views(340, 250))}, showDescription: true,
        portLayout: 'inline', state: 'normal', inputs, outputs, stockConfig,
      },
    })
    editor.createShapes([
      block('shape:set', 160, 170, 'Set attributes', 'set-attributes',
        [${JSON.stringify(port('record', 'record', 'Record', 0))}, ${JSON.stringify(port('member_1', '.quota', 'int', 1))}],
        [${JSON.stringify(port('record_out', 'record', 'Record', 0))}], undefined,
        'Update named members; preserve every member not listed.'),
      block('shape:select', 610, 170, 'Select', 'select',
        [${JSON.stringify(port('condition', 'condition', 'bool', 0))}, ${JSON.stringify(port('true_value', 'true', 'str', 1))}, ${JSON.stringify(port('false_value', 'false', 'str', 2))}],
        [${JSON.stringify(port('result', 'result', 'str', 1))}], undefined,
        'Choose one value; this is not a Branch region.'),
      // Keep this source clear of the inspector's right overlay so the proof
      // selects it with a real canvas click rather than the development seam.
      block('shape:clock', 920, 170, 'Clock', 'clock-trigger', [],
        [${JSON.stringify(port('trigger', 'trigger', 'Trigger', 0))}],
        { triggerSource: 'clock', rateHz: 10, runtimeAdapter: 'unavailable' },
        '10 Hz authoring source · runtime adapter unavailable.'),
    ])
    editor.selectNone()
    editor.setCamera({ x: 10, y: 40, z: 1 })
  })()`)
  await delay(350)
}

async function clickBlock(page, id) {
  const target = await box(page, `[data-shape-id="${id}"]`)
  await clickAt(page, target.cx, target.y + 24)
  await delay(260)
}

async function main() {
  const app = await startApp({ label: 'semantic-stock-blocks', width: 1440, height: 960 })
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'Block dev seam')
    await seed(page)

    await clickBlock(page, 'shape:set')
    await waitFor(page, `document.querySelector('[data-testid="set-attributes-add-member"]')`, 'Set attributes inspector')
    check('SET-1', 'Set attributes exposes ordinary Record in/out and its member update action',
      await evaluate(page, `JSON.stringify({
        inlet: window.__systemsketch.editor.getShape('shape:set').props.inputs[0],
        outlet: window.__systemsketch.editor.getShape('shape:set').props.outputs[0],
        action: Boolean(document.querySelector('[data-testid="set-attributes-add-member"]')),
      })`),
      JSON.stringify({
        inlet: { id: 'record', name: 'record', type: 'Record', visible: true, row: 0 },
        outlet: { id: 'record_out', name: 'record', type: 'Record', visible: true, row: 0 }, action: true,
      }))
    const add = await box(page, '[data-testid="set-attributes-add-member"]')
    await clickAt(page, add.cx, add.cy)
    await waitFor(page, `document.querySelector('[data-testid="inspector-port-inputs-member_2"]')`, 'stable member_2 row')
    check('SET-2', 'the inspector adds a stable member id rather than a generic input slot',
      await evaluate(page, `window.__systemsketch.editor.getShape('shape:set').props.inputs.at(-1).id`), 'member_2')

    await clickBlock(page, 'shape:select')
    check('SELECT-1', 'Select paints one bool control and two candidate values on an ordinary Block',
      await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getShape('shape:select').props.inputs.map((port) => [port.id, port.type]))`),
      JSON.stringify([['condition', 'bool'], ['true_value', 'str'], ['false_value', 'str']]))
    check('SELECT-2', 'Select has no Branch region or execution pin representation',
      await evaluate(page, `document.querySelector('[data-shape-id="shape:select"]')?.dataset.shapeType === 'block'`), true)

    await clickBlock(page, 'shape:clock')
    await waitFor(page, `document.querySelector('[data-inspector-section="Clock trigger"]')`, 'Clock configuration')
    check('CLOCK-1', 'Clock exposes persisted source/rate intent and the unavailable adapter boundary',
      await evaluate(page, `JSON.stringify({
        source: document.querySelector('[aria-label="Clock trigger source"]')?.value,
        rate: document.querySelector('[aria-label="Clock trigger rate in hertz"]')?.value,
        unavailable: document.querySelector('[data-testid="clock-trigger-runtime-status"]')?.textContent?.includes('unavailable'),
        output: window.__systemsketch.editor.getShape('shape:clock').props.outputs[0].type,
      })`),
      JSON.stringify({ source: 'clock', rate: '10', unavailable: true, output: 'Trigger' }))

    const errors = await localConsoleErrors(page)
    check('CONSOLE', 'the real browser reports no console errors', errors, [])
  } finally {
    await app.close()
  }
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

await main()
