#!/usr/bin/env node
/**
 * Real-browser proof that the DRAW group is reachable from the keyboard.
 *
 * Three protocols, three digits, in the order the bar paints them. The claims
 * that matter are as much about what the keys must NOT do: 1, 2 and 3 are free
 * keys everywhere else in SystemSketch, so they may only mean a protocol while
 * the group that names them is on screen, and they may never fire while
 * someone is typing.
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
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'communication-draw-hotkeys')
const { checks, pass } = makeChecklist()

/** The digit each family answers to — the contract this journey exists for. */
const SHORTCUTS = [
  { family: 'stream', digit: '1', code: 'Digit1' },
  { family: 'service', digit: '2', code: 'Digit2' },
  { family: 'action', digit: '3', code: 'Digit3' },
]

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(ASSETS, name), Buffer.from(capture.data, 'base64'))
}

/** Two components inside a real Async region — enough to draw between. */
const SEED = `(() => {
  const editor = window.__systemsketch.editor
  editor.deleteShapes([...editor.getCurrentPageShapeIds()])
  const sizes = { simple: { w: 320, h: 190 }, port: { w: 340, h: 220 }, expanded: { w: 560, h: 380 }, value: { w: 168, h: 56 } }
  const block = (id, x, y, title) => ({
    id: 'shape:' + id, type: 'block', x, y,
    props: {
      title, description: '', blockType: 'component', view: 'port', w: 340, h: 220,
      views: sizes, showDescription: false, portLayout: 'inline', state: 'normal',
      inputs: [], outputs: [],
    },
  })
  editor.createShape({
    id: 'shape:region', type: 'frame', x: 160, y: 160,
    props: { name: 'Async region', color: 'violet', w: 1180, h: 760 },
    meta: { systemSketchAsyncRegion: { version: 1 } },
  })
  editor.createShapes([block('mission', 260, 320, 'Mission'), block('robot', 860, 320, 'Robot')])
  editor.reparentShapes(['shape:mission', 'shape:robot'], 'shape:region')
  editor.setCamera({ x: 0, y: 0, z: 1 })
  editor.select('shape:region')
  return true
})()`

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`,
  ))
}

async function dragSurfaces(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 12; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 12,
      from.y + ((to.y - from.y) * step) / 12,
      { buttons: 1 })
    await delay(24)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(520)
}

/** The DRAW row exactly as painted, plus the tool the keystroke actually left behind. */
async function record(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    return {
      toolId: editor.getCurrentToolId(),
      editingShapeId: editor.getEditingShapeId() ?? null,
      active: document.activeElement
        ? document.activeElement.tagName + '.' + (document.activeElement.className || '')
        : null,
      wires: editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length,
      ports: ['mission', 'robot'].reduce((all, id) => {
        const shape = editor.getShape('shape:' + id)
        all[id] = shape
          ? [...shape.props.inputs.map((p) => 'input:' + p.name),
             ...shape.props.outputs.map((p) => 'output:' + p.name)]
          : []
        return all
      }, {}),
      drawButtons: Array.from(document.querySelectorAll('[data-testid^="communication-draw-"]'))
        .map((node) => ({
          id: node.dataset.testid.replace('communication-draw-', ''),
          armed: node.getAttribute('aria-pressed') === 'true',
          // What a reader can SEE, and what a screen reader is told.
          badge: node.querySelector('kbd')?.textContent ?? null,
          keyshortcuts: node.getAttribute('aria-keyshortcuts'),
          title: node.getAttribute('title'),
        })),
    }
  })())`))
}

function armedFamily(observed) {
  return observed.drawButtons.find((button) => button.armed)?.id ?? null
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-communication-draw-hotkeys',
    build: 'communication-draw-hotkeys',
    width: 1900,
    height: 1150,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'communication-draw-hotkeys.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the editor', 30_000)
    await evaluate(app.page, SEED)
    await delay(700)

    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'region lens')
    await clickElement(app.page, '[data-testid="communication-lens-communication"]')
    await delay(400)

    // 1. The mapping is reading order, so the bar has to SAY the digits.
    let observed = await record(app.page)
    assert.deepEqual(
      observed.drawButtons.map((button) => ({ id: button.id, badge: button.badge })),
      SHORTCUTS.map(({ family, digit }) => ({ id: family, badge: digit })),
      JSON.stringify(observed.drawButtons),
    )
    for (const { family, digit } of SHORTCUTS) {
      const button = observed.drawButtons.find((entry) => entry.id === family)
      assert.equal(button.keyshortcuts, digit, `${family} must announce its key`)
      assert.match(button.title, new RegExp(`press ${digit}$`), `${family} tooltip: ${button.title}`)
    }
    pass('each DRAW button paints its digit, announces it, and names it in the tooltip — left to right, 1 2 3')
    await shot(app.page, '01-draw-row-with-digits.png')
    // The report crops these captures to the DRAW row. Record where the row
    // actually is, so a layout change moves the crop instead of silently
    // cutting the subject out of the report.
    const drawRow = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const box = document.querySelector('.communication-prototype-draw').getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    })())`))
    await writeFile(join(ASSETS, 'geometry.json'),
      `${JSON.stringify({ drawRow, viewport: { width: 1900, height: 1150 } }, null, 2)}\n`)

    // 2. Each digit arms its own family.
    for (const { family, digit, code } of SHORTCUTS) {
      await shortcut(app.page, digit, code)
      await delay(220)
      observed = await record(app.page)
      assert.equal(observed.toolId, 'communication-link', `${digit} should arm the link tool`)
      assert.equal(armedFamily(observed), family, `${digit} should arm ${family}, got ${armedFamily(observed)}`)
    }
    pass('1, 2 and 3 each arm their own protocol, and swap directly between them while armed')
    await shot(app.page, '02-armed-by-keyboard.png')

    // 3. The same digit again disarms — the key is the button, not a second control.
    await shortcut(app.page, '3', 'Digit3')
    await delay(220)
    observed = await record(app.page)
    assert.equal(observed.toolId, 'select', 'pressing the armed digit again must leave the tool')
    assert.equal(armedFamily(observed), null, JSON.stringify(observed.drawButtons))
    pass('pressing the armed digit again disarms it, exactly as clicking the pressed button does')

    // 4. The keystroke arms the REAL tool: draw with it and get a real Service.
    const missionSurface = await pagePoint(app.page, { x: 430, y: 430 })
    const robotSurface = await pagePoint(app.page, { x: 1030, y: 430 })
    await shortcut(app.page, '2', 'Digit2')
    await delay(220)
    await dragSurfaces(app.page, missionSurface, robotSurface)
    observed = await record(app.page)
    assert.equal(observed.wires, 2, `a Service is two legs, saw ${observed.wires}`)
    assert.ok(observed.ports.mission.includes('output:robot.request'), JSON.stringify(observed.ports))
    assert.ok(observed.ports.mission.includes('input:robot.response'), JSON.stringify(observed.ports))
    pass('a relationship drawn after pressing 2 generates the same canonical Service legs the button does')
    await shot(app.page, '03-service-drawn-from-the-keyboard.png')

    // 5. Typing wins. A digit must never fire while a text field has focus.
    // Disarm first: the tool deliberately stays armed after a draw, so a
    // "nothing happened" assertion has to start from nothing being armed.
    await shortcut(app.page, '2', 'Digit2')
    await delay(240)
    observed = await record(app.page)
    assert.equal(observed.toolId, 'select', 'the tool should be disarmed before the typing check')
    await key(app.page, 'F2', 'F2')
    await delay(320)
    await waitFor(app.page, `document.querySelector('.systemsketch-file-title-input')`, 'the inline rename field')
    await evaluate(app.page, `document.querySelector('.systemsketch-file-title-input').focus()`)
    await shortcut(app.page, '1', 'Digit1')
    await delay(240)
    observed = await record(app.page)
    assert.equal(observed.toolId, 'select',
      `a digit typed into a name must not arm a tool (focus: ${observed.active})`)
    assert.equal(armedFamily(observed), null, JSON.stringify(observed.drawButtons))
    pass('a digit pressed while a text field has focus types, and arms nothing')
    await key(app.page, 'Escape', 'Escape')
    await delay(280)

    // 6. Outside the group the digits are ordinary keys again.
    await clickElement(app.page, '[data-testid="communication-lens-dataflow"]')
    await delay(420)
    observed = await record(app.page)
    assert.equal(observed.drawButtons.length, 0, 'Dataflow has no DRAW group')
    for (const { digit, code } of SHORTCUTS) {
      await shortcut(app.page, digit, code)
      await delay(200)
      observed = await record(app.page)
      assert.notEqual(observed.toolId, 'communication-link',
        `${digit} armed a protocol with no DRAW group on screen`)
    }
    // The digits are borrowed, not taken: stock tldraw spends 1-9 on "activate
    // the nth toolbar tool", and that has to still be true outside the group.
    const toolbarPressed = await evaluate(app.page,
      `document.querySelector('[data-testid^="systemsketch-tool-"][aria-pressed="true"]')?.dataset.testid ?? null`)
    assert.notEqual(toolbarPressed, null, 'a digit outside the group should still work the toolbar')
    pass(`outside the group the digits go back to the toolbar (${toolbarPressed}), arming nothing`)
    await shot(app.page, '04-dataflow-digits-return-to-toolbar.png')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], JSON.stringify(errors))
    pass('no console errors across the whole journey')

    console.log(`PASS communication DRAW hotkeys real-browser journey (${checks.length}/${checks.length})`)
    for (const check of checks) console.log(`  ✓ ${check}`)
    console.log(join(ASSETS, '01-draw-row-with-digits.png'))
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
