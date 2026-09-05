#!/usr/bin/env node
/**
 * Real-browser proof for the Inputs row's code-style punctuation: Name, Type
 * and Default read as `name: type = default`, all three in monospace, the
 * ':' and '=' muted rather than full-ink — on by default, with the plain row
 * kept one Appearance toggle away, and the choice surviving a reload.
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
  elementBox,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'port-row-punctuation.json')
const shotPath = (name) => join(SHOTS, `port-row-punctuation-${name}.png`)

const INPUTS_LIST = '[data-testid="inspector-ports-inputs"]'
const NAME_FIELD = `${INPUTS_LIST} .block-inspector__port-name`
const TYPE_FIELD = `${INPUTS_LIST} .block-inspector__port-type`
const DEFAULT_FIELD = `${INPUTS_LIST} .block-inspector__port-default`
const PUNCT_ROW = `${INPUTS_LIST} .block-inspector__port-row`
const TOGGLE = '[data-testid="systemsketch-punctuated-port-row"]'

const { checks, pass } = makeChecklist()

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(shotPath(name), Buffer.from(capture.data, 'base64'))
}

async function selectFieldText(page, selector) {
  const found = JSON.stringify(selector)
  await waitFor(page, `document.querySelector(${found})`, selector)
  const box = await elementBox(page, selector)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await mouse(page, 'mouseMoved', x, y)
  for (const clickCount of [1, 2, 3]) {
    await mouse(page, 'mousePressed', x, y, { buttons: 1, clickCount })
    await mouse(page, 'mouseReleased', x, y, { clickCount })
  }
  await waitFor(page, `document.activeElement === document.querySelector(${found})`,
    `focus to land on ${selector}`, 5000)
}

async function typeInto(page, selector, text) {
  await selectFieldText(page, selector)
  await page.send('Input.insertText', { text })
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(text)}`,
    `${selector} to hold ${JSON.stringify(text)}`, 5000)
}

/** The painted state of the one input row this journey authors. */
async function rowState(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const row = document.querySelector(${JSON.stringify(PUNCT_ROW)})
    const name = document.querySelector(${JSON.stringify(NAME_FIELD)})
    const type = document.querySelector(${JSON.stringify(TYPE_FIELD)})
    const def = document.querySelector(${JSON.stringify(DEFAULT_FIELD)})
    if (!row || !name || !type || !def) return null
    const glyphs = Array.from(row.querySelectorAll('.block-inspector__port-punct')).map((node) => node.textContent)
    return {
      punctuated: row.classList.contains('block-inspector__port-row--punctuated'),
      glyphs,
      nameFont: getComputedStyle(name).fontFamily,
      typeFont: getComputedStyle(type).fontFamily,
      defaultPlaceholder: def.placeholder,
      values: { name: name.value, type: type.value, default: def.value },
    }
  })())`))
}

async function selectBlock(page, shapeId) {
  await clickAt(page, 200, 760)
  await delay(200)
  const face = await elementBox(page, `[data-shape-id="${shapeId}"] .systemsketch-block-canvas`)
  await clickAt(page, face.x + face.width / 2, face.y + 22)
  await waitFor(page, INPUTS_LIST ? `document.querySelector('${INPUTS_LIST}')` : '', 'the inspector to open on selection')
}

async function drawBlock(page, from, to, title) {
  await key(page, 'b', 'KeyB')
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 6; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 6,
      from.y + ((to.y - from.y) * step) / 6,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(160)
}

async function openAppearanceSettings(page) {
  await clickElement(page, '[data-testid="main-menu.button"]')
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings menu item')
  await clickElement(page, '[data-testid="main-menu.settings"]')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  await clickElement(page, '[data-testid="systemsketch-settings-category-appearance"]')
  await waitFor(page, `document.querySelector('${TOGGLE}')`, 'the code-style Inputs row preference')
  await evaluate(page, `document.querySelector('${TOGGLE}')?.scrollIntoView({ block: 'center' })`)
  await delay(180)
}

async function closeSettings(page) {
  await clickElement(page, '.systemsketch-settings__header .tlui-button')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog to close')
}

async function storedPunctuation(page) {
  const stored = await evaluate(page, `localStorage.getItem('systemsketch.appearance.v1')`)
  return stored ? JSON.parse(stored).punctuatedPortRow : null
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'port-row-punctuation', build: 'port-row-punctuation-smoke', width: 1280, height: 860 })
  const { page, port, filesRoot } = app
  try {
    const board = join(filesRoot, 'SystemSketch', 'port-row-punctuation.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the SystemSketch product canvas')
    await delay(600)

    await drawBlock(page, { x: 420, y: 260 }, { x: 780, y: 480 }, 'transform')
    const shapeId = JSON.parse(await evaluate(page,
      `JSON.stringify(document.querySelector('[data-shape-type="block"]')?.dataset.shapeId ?? null)`))
    assert.ok(shapeId, 'the drawn Block has a shape id')

    await selectBlock(page, shapeId)
    await clickElement(page, '[aria-label="Add input port"]')
    await waitFor(page, `document.querySelector('${NAME_FIELD}')`, 'the new input port row')
    await typeInto(page, NAME_FIELD, 'count')
    await typeInto(page, TYPE_FIELD, 'int')
    await typeInto(page, DEFAULT_FIELD, '0')
    pass('a real input port is authored with a name, type and default through the docked inspector')

    // ------------------------------------------ default: punctuated on ---
    const initial = await rowState(page)
    assert.equal(initial.punctuated, true, 'the row carries the punctuated modifier class with no stored preference')
    assert.deepEqual(initial.glyphs, [':', '='], 'exactly the colon and equals glyphs are painted, in order')
    assert.match(initial.nameFont, /mono/i, 'Name renders in the monospace stack once punctuated')
    assert.match(initial.typeFont, /mono/i, 'Type stays in the monospace stack')
    assert.equal(initial.defaultPlaceholder, 'Default', "Default's own placeholder stays the app's guidance label, which doesn't duplicate the external '=' glyph")
    assert.deepEqual(initial.values, { name: 'count', type: 'int', default: '0' }, 'the authored values round-trip through the punctuated row')
    assert.equal(await storedPunctuation(page), null, 'the default needs no stored preference')
    await shot(page, 'default-on')
    pass("code-style punctuation is on by default: 'count : int = 0', Name and Type both monospace")

    // -------------------------------------------------- toggle it off ---
    await openAppearanceSettings(page)
    const checkedOn = await evaluate(page, `document.querySelector('${TOGGLE}')?.getAttribute('aria-checked')`)
    assert.equal(checkedOn, 'true', 'Appearance opens with the toggle already checked, matching the default-on row')
    await shot(page, 'appearance-setting')
    await clickElement(page, TOGGLE)
    await waitFor(page, `!document.querySelector('${PUNCT_ROW}.block-inspector__port-row--punctuated')`, 'the row to drop the punctuated class')
    await closeSettings(page)

    const off = await rowState(page)
    assert.equal(off.punctuated, false, 'the modifier class is gone once the toggle is off')
    assert.deepEqual(off.glyphs, [], 'no separator glyphs render for the plain row')
    assert.doesNotMatch(off.nameFont, /mono/i, "Name reverts to the app's sans-serif stack")
    assert.equal(off.defaultPlaceholder, 'Default', "Default's own placeholder is unchanged by the toggle — only the row's punctuation reacts")
    assert.deepEqual(off.values, { name: 'count', type: 'int', default: '0' }, 'turning punctuation off does not touch the authored port data')
    assert.equal(await storedPunctuation(page), false, 'disabling persists punctuatedPortRow:false')
    await shot(page, 'default-off')
    pass('the plain row (today\'s implementation) is one Appearance toggle away and keeps the port data untouched')

    // ------------------------------------------------ survives a reload ---
    await page.send('Page.reload', { ignoreCache: true })
    await delay(700)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the reloaded canvas')
    await selectBlock(page, shapeId)
    const reloadedOff = await rowState(page)
    assert.equal(reloadedOff.punctuated, false, 'the plain row survives a full reload')
    assert.deepEqual(reloadedOff.values, { name: 'count', type: 'int', default: '0' }, 'the authored port survives the reload too')
    pass('the plain-row choice, and the board content, both survive a reload')

    // ------------------------------------------------- switch back on ---
    await openAppearanceSettings(page)
    const checkedOff = await evaluate(page, `document.querySelector('${TOGGLE}')?.getAttribute('aria-checked')`)
    assert.equal(checkedOff, 'false', 'Appearance reflects the stored disabled state')
    await clickElement(page, TOGGLE)
    await waitFor(page, `document.querySelector('${PUNCT_ROW}.block-inspector__port-row--punctuated')`, 'the row to regain the punctuated class')
    await closeSettings(page)
    await page.send('Page.reload', { ignoreCache: true })
    await delay(700)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'the reloaded canvas')
    await selectBlock(page, shapeId)
    const reloadedOn = await rowState(page)
    assert.equal(reloadedOn.punctuated, true, 're-enabling the code-style row also survives a reload')
    await shot(page, 'reenabled')
    pass('switching back to the code-style row survives a reload the same way')

    const errors = localConsoleErrors(page)
    assert.equal(errors.length, 0, 'the journey emits no local console errors', errors.join('\n'))
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
