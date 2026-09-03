#!/usr/bin/env node
/**
 * Real-browser acceptance for the overnight responsive and keyboard UX pass.
 *
 * The product page uses a disposable `.systemsketch` board and the Block lab
 * uses a directly seeded fixture. Interactions are dispatched through CDP;
 * assertions are read back from the painted DOM and live editor.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const COMPACT_WIDTH = 700
const NARROW_WIDTH = 320
const VIEWPORT_HEIGHT = 760
const INTERFACE_SCALE_STORAGE_KEY = 'systemsketch.interface-scale.v1'
const BLOCK_ID = 'shape:overnight-keyboard-block'
const BLOCK_SCOPE = `[data-shape-id="${BLOCK_ID}"]`
const ADD_INPUT = `${BLOCK_SCOPE} [data-testid="block-port-add-inputs"]`
const ADD_OUTPUT = `${BLOCK_SCOPE} [data-testid="block-port-add-outputs"]`
const DIVIDER = `${BLOCK_SCOPE} [data-testid="block-expanded-divider"]`

async function setViewport(page, width, height = VIEWPORT_HEIGHT) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await delay(350)
}

/** Match Chrome's physical keyboard payload, including native button clicks. */
async function pressPhysicalKey(page, keyName) {
  const keySpec = {
    Tab: { key: 'Tab', code: 'Tab', vk: 9 },
    Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
    Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  }[keyName]
  if (!keySpec) throw new Error(`Unsupported physical key ${keyName}`)

  const common = {
    key: keySpec.key,
    code: keySpec.code,
    windowsVirtualKeyCode: keySpec.vk,
    nativeVirtualKeyCode: keySpec.vk,
    modifiers: 0,
    autoRepeat: false,
    isKeypad: false,
    location: 0,
  }
  await page.send('Input.dispatchKeyEvent', {
    ...common,
    type: keySpec.text === undefined ? 'rawKeyDown' : 'keyDown',
    ...(keySpec.text === undefined
      ? {}
      : { text: keySpec.text, unmodifiedText: keySpec.text }),
  })
  await page.send('Input.dispatchKeyEvent', { ...common, type: 'keyUp' })
  await delay(120)
}

async function proveCompactSidePanels(page) {
  await setViewport(page, COMPACT_WIDTH)
  assert.equal(await evaluate(page, `matchMedia('(max-width: 820px)').matches`), true)

  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"]')
      && !document.querySelector('[data-testid="systemsketch-right-popout"]')`,
    'the compact left panel')

  await clickElement(page, '[title="Comments and inspector"]')
  await waitFor(page,
    `!document.querySelector('[data-testid="systemsketch-left-popout"]')
      && document.querySelector('[data-testid="systemsketch-right-popout"]')`,
    'the newer compact right panel')
  assert.equal(await evaluate(page,
    `document.querySelectorAll('[data-testid="systemsketch-left-popout"], [data-testid="systemsketch-right-popout"]').length`),
  1)

  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"]')
      && !document.querySelector('[data-testid="systemsketch-right-popout"]')`,
    'the newer compact left panel')
  assert.equal(await evaluate(page,
    `document.querySelectorAll('[data-testid="systemsketch-left-popout"], [data-testid="systemsketch-right-popout"]').length`),
  1)

  await clickElement(page, '[aria-label="Close shapes library"]')
  process.stdout.write('  PASS  compact viewport keeps only the newest side panel visible\n')
}

async function proveScaledCompactSidePanels(page, port, board) {
  await evaluate(page, `localStorage.setItem(
    ${JSON.stringify(INTERFACE_SCALE_STORAGE_KEY)},
    JSON.stringify({ version: 1, percent: 160 }),
  )`)
  await setViewport(page, 900)
  await openApp(page, port, `?board=${encodeURIComponent(board)}`)
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-app"][data-interface-scale="160"] .tl-container')
      && window.__systemsketch?.editor`,
    'the 160% interface-scale board')
  assert.equal(await evaluate(page, `matchMedia('(max-width: 820px)').matches`), false)
  assert.equal(await evaluate(page, `matchMedia('(max-width: 1312px)').matches`), true)

  await clickElement(page, '[title="Shapes library"]')
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-left-popout"]')
      && !document.querySelector('[data-testid="systemsketch-right-popout"]')`,
    'the scaled left panel')
  await clickElement(page, '[title="Comments and inspector"]')
  await waitFor(page,
    `!document.querySelector('[data-testid="systemsketch-left-popout"]')
      && document.querySelector('[data-testid="systemsketch-right-popout"]')`,
    'the newer scaled right panel')
  assert.equal(await evaluate(page,
    `document.querySelectorAll('[data-testid="systemsketch-left-popout"], [data-testid="systemsketch-right-popout"]').length`),
  1)
  await clickElement(page, '[aria-label="Close Comments"]')
  process.stdout.write('  PASS  160% interface scale moves the compact breakpoint with enlarged chrome\n')
}

async function seedSelectedArrow(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({
      id: 'shape:overnight-overflow-arrow',
      type: 'arrow',
      x: 54,
      y: 290,
      props: { start: { x: 0, y: 0 }, end: { x: 205, y: 105 }, bend: 0 },
    })
    editor.setCamera({ x: 0, y: 0, z: 1 })
    editor.select('shape:overnight-overflow-arrow')
    return true
  })()`)
  await waitFor(page,
    `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
    'the selected arrow toolbar')
  await delay(300)
}

async function selectionToolbarReading(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const container = document.querySelector('.tl-container')
    const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
    const bar = menu?.querySelector('.systemsketch-selection-menu__bar')
    if (!container || !menu || !bar) return null
    const origin = container.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const barRect = bar.getBoundingClientRect()
    return JSON.stringify({
      viewportWidth: origin.width,
      menu: { left: menuRect.left - origin.left, right: menuRect.right - origin.left,
        width: menuRect.width },
      bar: { left: barRect.left - origin.left, right: barRect.right - origin.left,
        width: barRect.width, clientWidth: bar.clientWidth, scrollWidth: bar.scrollWidth,
        scrollLeft: bar.scrollLeft, overflowX: getComputedStyle(bar).overflowX },
    })
  })()`))
}

async function proveSelectionToolbarOverflow(page) {
  await setViewport(page, NARROW_WIDTH, 720)
  await seedSelectedArrow(page)
  const before = await selectionToolbarReading(page)
  assert.ok(before, 'selection toolbar should be measurable')
  assert.ok(before.menu.left >= 19 && before.menu.right <= before.viewportWidth - 19,
    `menu escaped the 20px viewport margin: ${JSON.stringify(before.menu)}`)
  assert.ok(before.bar.left >= 19 && before.bar.right <= before.viewportWidth - 19,
    `toolbar escaped the 20px viewport margin: ${JSON.stringify(before.bar)}`)
  assert.equal(before.bar.overflowX, 'auto')
  assert.ok(before.bar.scrollWidth > before.bar.clientWidth,
    `toolbar did not overflow: ${JSON.stringify(before.bar)}`)

  const point = JSON.parse(await evaluate(page, `(() => {
    const bar = document.querySelector('.systemsketch-selection-menu__bar')
    bar.scrollLeft = 0
    const rect = bar.getBoundingClientRect()
    return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  })()`))
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: point.x, y: point.y,
  })
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: point.x, y: point.y, deltaX: 240, deltaY: 0,
  })
  await waitFor(page,
    `document.querySelector('.systemsketch-selection-menu__bar').scrollLeft > 0`,
    'horizontal toolbar scrolling')

  // Focus is the keyboard overflow seam: focusing an off-screen native
  // trigger must reveal it inside the scrollport.
  await evaluate(page, `(() => {
    const bar = document.querySelector('.systemsketch-selection-menu__bar')
    bar.scrollLeft = 0
    const triggers = [...bar.querySelectorAll('.systemsketch-appearance__trigger')]
    triggers.at(-1)?.focus()
  })()`)
  await waitFor(page,
    `document.querySelector('.systemsketch-selection-menu__bar').scrollLeft > 0`,
    'focused overflow control reveal')
  const focusedVisible = await evaluate(page, `(() => {
    const bar = document.querySelector('.systemsketch-selection-menu__bar').getBoundingClientRect()
    const active = document.activeElement?.getBoundingClientRect()
    return Boolean(active && active.left >= bar.left - 1 && active.right <= bar.right + 1)
  })()`)
  assert.equal(focusedVisible, true)
  process.stdout.write('  PASS  narrow selection toolbar stays within 20px margins and horizontally scrolls\n')
}

async function seedExpandedBlock(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({
      id: ${JSON.stringify(BLOCK_ID)},
      type: 'block',
      x: 260,
      y: 150,
      props: {
        title: 'Keyboard pipeline',
        blockType: 'call',
        description: '',
        showDescription: false,
        view: 'expanded',
        w: 560,
        h: 380,
        views: {
          simple: { w: 320, h: 206 },
          port: { w: 340, h: 198 },
          expanded: { w: 560, h: 380 },
          value: { w: 168, h: 56 },
        },
        portLayout: 'inline',
        inputs: [
          { id: 'in_1', name: 'first', type: 'Data', visible: true },
          { id: 'in_2', name: 'second', type: 'Data', visible: true, row: 2 },
        ],
        outputs: [{ id: 'out_1', name: 'result', type: 'Data', visible: true }],
      },
    })
    editor.setCamera({ x: 0, y: 0, z: 1 })
    editor.select(${JSON.stringify(BLOCK_ID)})
    return true
  })()`)
  await waitFor(page, `document.querySelector(${JSON.stringify(DIVIDER)})`, 'the Expanded divider')
  await waitFor(page, `document.querySelector(${JSON.stringify(ADD_INPUT)})`, 'the Add input button')
}

async function armKeyboardClickProbe(page, selector, label) {
  await evaluate(page, `(() => {
    window.__overnightKeyboardClicks ??= []
    const button = document.querySelector(${JSON.stringify(selector)})
    button.addEventListener('click', (event) => {
      window.__overnightKeyboardClicks.push({ label: ${JSON.stringify(label)}, detail: event.detail })
    }, { once: true })
    button.focus()
    return true
  })()`)
  assert.equal(await evaluate(page,
    `document.activeElement === document.querySelector(${JSON.stringify(selector)})`), true)
}

async function finishInlinePortName(page, name) {
  await waitFor(page,
    `document.querySelector(${JSON.stringify(`${BLOCK_SCOPE} [data-testid^="block-inline-port-name-"]`)})`,
    `${name} inline editor`)
  await page.send('Input.insertText', { text: name })
  await key(page, 'Enter', 'Enter')
  await waitFor(page,
    `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.inputs
        .concat(window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK_ID)}).props.outputs)
        .some((port) => port.name === ${JSON.stringify(name)})`,
    `${name} port commit`)
}

async function proveBlockKeyboardControls(page) {
  const semantics = JSON.parse(await evaluate(page, `(() => {
    const add = document.querySelector(${JSON.stringify(ADD_INPUT)})
    const divider = document.querySelector(${JSON.stringify(DIVIDER)})
    return JSON.stringify({
      addTag: add?.tagName,
      addType: add?.getAttribute('type'),
      addLabel: add?.getAttribute('aria-label'),
      addTabIndex: add?.tabIndex,
      dividerRole: divider?.getAttribute('role'),
      dividerOrientation: divider?.getAttribute('aria-orientation'),
      dividerLabel: divider?.getAttribute('aria-label'),
      dividerMin: divider?.getAttribute('aria-valuemin'),
      dividerMax: divider?.getAttribute('aria-valuemax'),
      dividerNow: divider?.getAttribute('aria-valuenow'),
      dividerTabIndex: divider?.tabIndex,
    })
  })()`))
  assert.equal(semantics.addTag, 'BUTTON')
  assert.equal(semantics.addType, 'button')
  assert.match(semantics.addLabel, /Add input port to Keyboard pipeline/)
  assert.equal(semantics.addTabIndex, 0)
  assert.equal(semantics.dividerRole, 'separator')
  assert.equal(semantics.dividerOrientation, 'horizontal')
  assert.match(semantics.dividerLabel, /Resize adjacent sections in Keyboard pipeline/)
  assert.equal(semantics.dividerMin, '0')
  assert.equal(semantics.dividerMax, '100')
  assert.ok(Number.isFinite(Number(semantics.dividerNow)))
  assert.equal(semantics.dividerTabIndex, 0)

  // This is a real Tab transition, not a direct focus call. The selected shape
  // means tldraw would normally consume Tab for shape navigation.
  await evaluate(page, `document.querySelector(${JSON.stringify(DIVIDER)}).focus()`)
  await pressPhysicalKey(page, 'Tab')
  assert.equal(await evaluate(page,
    `document.activeElement === document.querySelector(${JSON.stringify(ADD_INPUT)})`), true)
  assert.equal(await evaluate(page,
    `getComputedStyle(document.querySelector(${JSON.stringify(ADD_INPUT)})).opacity`), '1')

  await armKeyboardClickProbe(page, ADD_INPUT, 'Space')
  await pressPhysicalKey(page, 'Space')
  await finishInlinePortName(page, 'space input')

  await armKeyboardClickProbe(page, ADD_OUTPUT, 'Enter')
  await pressPhysicalKey(page, 'Enter')
  await finishInlinePortName(page, 'enter output')

  const clickProbe = JSON.parse(await evaluate(page,
    `JSON.stringify(window.__overnightKeyboardClicks)`))
  assert.deepEqual(clickProbe, [
    { label: 'Space', detail: 0 },
    { label: 'Enter', detail: 0 },
  ])

  const before = Number(await evaluate(page,
    `document.querySelector(${JSON.stringify(DIVIDER)}).getAttribute('aria-valuenow')`))
  await evaluate(page, `document.querySelector(${JSON.stringify(DIVIDER)}).focus()`)
  await key(page, 'ArrowDown', 'ArrowDown')
  await waitFor(page,
    `Number(document.querySelector(${JSON.stringify(DIVIDER)}).getAttribute('aria-valuenow')) > ${before}`,
    'ArrowDown divider adjustment')
  const after = Number(await evaluate(page,
    `document.querySelector(${JSON.stringify(DIVIDER)}).getAttribute('aria-valuenow')`))
  assert.ok(after > before, `divider aria-valuenow did not increase: ${before} -> ${after}`)
  process.stdout.write('  PASS  native Add Port handles Tab, Space, and Enter; separator handles ArrowDown\n')
}

async function main() {
  const app = await startApp({
    label: 'overnight-top-ten',
    build: 'overnight-top-ten-smoke',
    width: 1000,
    height: VIEWPORT_HEIGHT,
  })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'overnight-top-ten.systemsketch')
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')
        && window.__systemsketch?.editor`,
      'the scratch product board')
    await delay(500)
    await proveCompactSidePanels(app.page)
    await proveSelectionToolbarOverflow(app.page)
    await proveScaledCompactSidePanels(app.page, app.port, board)

    await evaluate(app.page, `localStorage.setItem(
      ${JSON.stringify(INTERFACE_SCALE_STORAGE_KEY)},
      JSON.stringify({ version: 1, percent: 100 }),
    )`)
    await setViewport(app.page, 1000)
    await openApp(app.page, app.port, '?preset=block-dev')
    await waitFor(app.page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')
        && window.__systemsketch?.editor`,
      'the Block Dev canvas')
    await seedExpandedBlock(app.page)
    await proveBlockKeyboardControls(app.page)

    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write('  PASS  browser journey produced zero local console errors\n')
    process.stdout.write('  5/5 overnight UX browser checks passed\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
