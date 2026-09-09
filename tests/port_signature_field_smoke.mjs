#!/usr/bin/env node
/**
 * Real-browser proof that a port is ONE line of code — `name: Type = default`
 * — in both places it is edited: the docked inspector row and the on-canvas
 * click-to-edit editor. The line is parsed live into the stored triple (the
 * canvas paints name, type hint and default chip as it is typed), a `:`
 * offers the board's Types, an `=` offers the board's variables, and a bare
 * name is never interrupted by a suggestion.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const MEDIA = join(ROOT, 'reports', 'media', 'port-signature-field')
const RESULTS = join(MEDIA, 'port-signature-field-results.json')
const shotPath = (name) => join(MEDIA, `port-signature-field-${name}.png`)

const BLOCK = 'shape:estimate'
const INPUT_FIELD = '[aria-label="inputs in_1 signature"]'
const OUTPUT_FIELD = '[aria-label="outputs out_1 signature"]'
const EMPTY_CANVAS = { x: 200, y: 860 }

const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

/** What one code text field is actually showing. */
async function fieldState(page, selector) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const content = el.querySelector('.cm-content')
    const classes = Array.from(content?.querySelectorAll('span[class]') ?? []).flatMap((node) => Array.from(node.classList))
    return {
      text: content?.textContent ?? null,
      placeholder: el.querySelector('.cm-placeholder')?.textContent ?? null,
      slots: ['ss-sig-name', 'ss-sig-punct', 'ss-sig-type', 'ss-sig-default'].filter((name) => classes.includes(name)),
      focused: el.contains(document.activeElement),
    }
  })())`))
}

async function storedPort(page, side, index) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const port = window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props[${JSON.stringify(side)}][${index}]
    return { name: port.name, type: port.type, defaultValue: port.defaultValue ?? null }
  })())`))
}

async function paintedInput(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const label = document.querySelector('[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--in')
    return {
      name: label?.querySelector('.BlockNode-portName')?.textContent ?? null,
      type: label?.querySelector('.BlockNode-portType')?.textContent ?? null,
      chip: label?.querySelector('.BlockNode-portDefault')?.textContent?.trim() ?? null,
    }
  })())`))
}

async function completionLabels(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(
    Array.from(document.querySelectorAll('.cm-tooltip-autocomplete .cm-completionLabel')).map((node) => node.textContent)
  )`))
}

async function replaceField(page, selector, text) {
  // The Inputs section sits below the fold of the docked inspector at this
  // viewport; a person scrolls to it, and so does the journey.
  await evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`)
  await delay(120)
  await clickElement(page, selector)
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})?.contains(document.activeElement)`, `${selector} focused`)
  await shortcut(page, 'a', 'KeyA', 2)
  await typeSlowly(page, text)
}

async function selectBlock(page) {
  await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
  await delay(200)
  await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
  await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_FIELD)})`, 'the inspector port row')
}

async function seedBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShapes([
      {
        id: 'shape:pose-type', type: 'block', x: 120, y: 120,
        props: {
          title: 'Pose', blockType: 'type', icon: 'Braces', view: 'port', w: 300, h: 200,
          attributeSource: 'x: float\\ny: float\\nyaw: float', inputs: [], outputs: [],
        },
      },
      {
        id: ${JSON.stringify(BLOCK)}, type: 'block', x: 520, y: 260,
        props: {
          title: 'estimate', view: 'port', w: 360, h: 220,
          inputs: [{ id: 'in_1', name: 'frame', type: 'Frame', visible: true }],
          outputs: [{ id: 'out_1', name: 'pose', type: '', visible: true }],
        },
      },
    ])
    editor.select(${JSON.stringify(BLOCK)})
    return true
  })()`)
}

async function main() {
  await ensureDir(MEDIA)
  const app = await startApp({ label: 'port-signature-field', build: 'port-signature-field-smoke', width: 1440, height: 960 })
  const { page, port, filesRoot } = app
  try {
    const board = join(filesRoot, 'SystemSketch', 'port-signature-field.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the SystemSketch product canvas')
    await waitFor(page, `Boolean(window.__systemsketch?.editor)`, 'editor seam')
    await seedBoard(page)
    await waitFor(page, `document.querySelector(${JSON.stringify(INPUT_FIELD)})`, 'the inspector port row')

    // ------------------------------------------------- one field per port ---
    const initial = await fieldState(page, INPUT_FIELD)
    assert.equal(initial.text, 'frame: Frame', 'the stored triple is spelled as one line')
    assert.deepEqual(initial.slots, ['ss-sig-name', 'ss-sig-punct', 'ss-sig-type'], 'name, colon and type are painted as their roles')
    assert.equal(await evaluate(page, `document.querySelector('[aria-label="inputs in_1 name"], [aria-label="inputs in_1 type"], [aria-label="Default value for in_1"]')`), null,
      'the three separate boxes are gone')
    const outputInitial = await fieldState(page, OUTPUT_FIELD)
    assert.equal(outputInitial.text, 'pose', 'an untyped output is just its name')
    await shot(page, 'inspector-rows')
    pass('every port row in the inspector is one code text field, spelled name: Type = default')

    // ------------------------------------------ parsed live, painted live ---
    await replaceField(page, INPUT_FIELD, 'window: int = 5')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[0].defaultValue === '5'`, 'the default to reach the store')
    assert.deepEqual(await storedPort(page, 'inputs', 0), { name: 'window', type: 'int', defaultValue: '5' })
    const painted = await paintedInput(page)
    assert.equal(painted.name, 'window')
    assert.equal(painted.type, 'int')
    assert.match(painted.chip ?? '', /=\s*5/, 'the canvas paints the default chip while the line is still being typed')
    const typed = await fieldState(page, INPUT_FIELD)
    assert.deepEqual(typed.slots, ['ss-sig-name', 'ss-sig-punct', 'ss-sig-type', 'ss-sig-default'], 'all three roles are highlighted in the field')
    await shot(page, 'inspector-typed')
    pass('the line is split live into name, type and default — stored as the same triple, painted by the Block itself')

    // ------------------------------------- `:` opens the board's own types ---
    await replaceField(page, INPUT_FIELD, 'pose: P')
    await waitFor(page, `document.querySelector('.cm-tooltip-autocomplete .cm-completionLabel')`, 'a completion tooltip after the colon', 5000)
    const typeOptions = await completionLabels(page)
    assert.ok(typeOptions.includes('Pose'), `the Type Block on the board is offered — got ${typeOptions.join(', ')}`)
    await shot(page, 'type-completion')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[0].type === 'Pose'`, 'the accepted type to reach the store')
    assert.equal((await fieldState(page, INPUT_FIELD)).text, 'pose: Pose')
    pass("typing ':' turns the slot into a type: the board's Type Blocks are suggested and Enter accepts one")

    // ---------------------------------- a bare name is never interrupted ---
    await replaceField(page, INPUT_FIELD, 'temperature')
    await delay(500)
    assert.equal(await evaluate(page, `document.querySelector('.cm-tooltip-autocomplete')`), null, 'no suggestion while a name is typed')
    await key(page, 'Tab', 'Tab')
    await delay(200)
    assert.deepEqual(await storedPort(page, 'inputs', 0), { name: 'temperature', type: '', defaultValue: null }, 'free text is a name; the old type and default are cleared, not kept silently')
    pass('a plain word stays a plain name — nothing is suggested and nothing else is imposed')

    // ------------------------------------- the canvas edits the same line ---
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(BLOCK)}); return true })()`)
    await delay(200)
    const nameBox = await elementBox(page, `[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--in .BlockNode-portName`)
    await clickAt(page, nameBox.x + nameBox.width / 2, nameBox.y + nameBox.height / 2)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-name-inputs-in_1"]')`, 'the on-canvas port editor', 5000)
    const canvasEditor = await fieldState(page, '[data-testid="block-inline-port-name-inputs-in_1"]')
    assert.equal(canvasEditor.text, 'temperature', 'the canvas editor opens on the same one line')
    assert.equal(canvasEditor.focused, true, 'and takes focus')
    await key(page, 'End', 'End')
    await typeSlowly(page, ': float = 2.5')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(BLOCK)}).props.inputs[0].defaultValue === '2.5'`, 'the canvas edit to reach the store')
    const midEdit = await paintedInput(page)
    assert.equal(midEdit.type, 'float', 'the type hint is painted while the canvas editor is still open')
    await shot(page, 'canvas-editor')
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Enter to close the canvas editor')
    assert.deepEqual(await storedPort(page, 'inputs', 0), { name: 'temperature', type: 'float', defaultValue: '2.5' })
    pass('click-to-edit on the canvas opens the same line, parses it live, and Enter commits it')

    // ------------------------------ the type span opens the same editor ---
    const typeBox = await elementBox(page, `[data-shape-id=${JSON.stringify(BLOCK)}] .BlockNode-portLabel--in .BlockNode-portType`)
    await clickAt(page, typeBox.x + typeBox.width / 2, typeBox.y + typeBox.height / 2)
    await waitFor(page, `document.querySelector('[data-testid="block-inline-port-name-inputs-in_1"]')`, 'the editor from the type span', 5000)
    assert.equal((await fieldState(page, '[data-testid="block-inline-port-name-inputs-in_1"]')).text, 'temperature: float = 2.5',
      'clicking the type opens the whole line, not a type-only box')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('.BlockNode-inlineEditor')`, 'Escape to close the canvas editor')
    assert.deepEqual(await storedPort(page, 'inputs', 0), { name: 'temperature', type: 'float', defaultValue: '2.5' }, 'Escape leaves the value where it was')
    pass('the painted name and type are two spans over one editable line')

    // ------------------------------------- the inspector agrees afterwards ---
    await selectBlock(page)
    assert.equal((await fieldState(page, INPUT_FIELD)).text, 'temperature: float = 2.5', 'the inspector shows the canonical spelling of what the canvas wrote')
    await shot(page, 'round-trip')
    pass('canvas and inspector are two views of one stored triple')

    const errors = localConsoleErrors(page)
    assert.equal(errors.length, 0, `the journey emits no local console errors:\n${errors.join('\n')}`)
    pass('zero local console errors across the whole journey')

    await writeFile(RESULTS, JSON.stringify({ ranAt: new Date().toISOString(), checks }, null, 2) + '\n')
    process.stdout.write(`\n${checks.length} checks passed · ${RESULTS}\n`)
  } catch (error) {
    await shot(page, 'failure').catch(() => undefined)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
