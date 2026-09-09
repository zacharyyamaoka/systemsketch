#!/usr/bin/env node
/**
 * Real-browser proof for the parametric property system (Expanding Cell):
 *
 * 1. A plain literal default value looks and behaves exactly as it does
 *    today — no new UI, no toggle (hard gate: the whiteboard stays dumb,
 *    and old boards must not visibly change).
 * 2. Typing an expression that references an undefined name shows a real
 *    wavy underline plus the exact Python error, and the reference shows
 *    up, un-prompted, in the Block's own "Variables used here" section.
 * 3. Giving that variable a value there resolves the property live, with
 *    real Python syntax highlighting throughout (including the collapsed,
 *    unfocused state — evaluation is always on, never a toggle).
 * 4. Editing the SAME variable from the board-wide Variables panel updates
 *    every property that references it, without touching those properties
 *    directly — the actual "model-driven design" payoff.
 * 5. A legacy, non-Python-safe default value (the real `bytes` port fixture
 *    `defaultValue: 'raw'`) falls back to its own raw text with a quiet
 *    warning glyph — never a crash, never silently rewritten.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  elementBox,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'parametric-property-expanding-cell-2026-09-06.png')
const REFRESH_SCREENSHOT = process.env.SYSTEMSKETCH_REFRESH_PARAMETRIC_SCREENSHOT === '1'

async function shoot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

/** Text CodeMirror is actually showing for one expression field. */
async function fieldText(page, ariaLabel) {
  return evaluate(page, `document.querySelector('[aria-label=${JSON.stringify(ariaLabel)}]')?.querySelector('.cm-content')?.textContent ?? null`)
}

/**
 * A port signature field's full state, read off its `.ss-code-field-frame`
 * wrapper. `text` strips the live-resolved `.ss-sig-resolved` widget CodeMirror
 * paints inside `.cm-content` after the default slot — that widget is a reader
 * aid, not part of the stored line, so it must not leak into the text a test
 * compares against the authored `name: Type = default` line.
 */
async function fieldState(page, ariaLabel) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const el = document.querySelector('[aria-label=${JSON.stringify(ariaLabel)}]')
    if (!el) return null
    const wrapper = el.closest('.ss-code-field-frame')
    const content = el.querySelector('.cm-content')
    const clone = content?.cloneNode(true)
    clone?.querySelectorAll('.ss-sig-resolved, .cm-placeholder').forEach((node) => node.remove())
    return {
      text: clone?.textContent ?? null,
      html: content?.innerHTML ?? null,
      dataError: wrapper?.getAttribute('data-error') ?? null,
      help: wrapper?.querySelector('.ss-code-field-frame__help')?.textContent ?? null,
      warning: Boolean(wrapper?.querySelector('.ss-code-field-frame__warning')),
      resolved: wrapper?.querySelector('.ss-sig-resolved')?.textContent ?? null,
    }
  })())`))
}

/**
 * Focus a field and wait for real focus-within, the way a person's click
 * lands: no `is-expanded` state exists for a port row any more, only the
 * board-wide Variables panel's plain expression fields still carry it, and
 * this check works for either since it reads focus off the field itself.
 */
async function focusField(page, ariaLabel) {
  const selector = `[aria-label=${JSON.stringify(ariaLabel)}]`
  const box = await elementBox(page, selector)
  await clickElement(page, selector)
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})?.contains(document.activeElement)`, `${ariaLabel} focused`)
  return box
}

/** Leaves the field without tldraw's global Escape-to-deselect side effect. */
async function blurByTab(page) {
  await key(page, 'Tab', 'Tab')
  await delay(260)
}

async function main() {
  const app = await startApp({ label: 'systemsketch-parametric-property', build: 'parametric-property', width: 1400, height: 1500 })
  const board = join(app.filesRoot, 'SystemSketch', 'parametric-property.systemsketch')
  try {
    await mkdir(join(app.filesRoot, 'SystemSketch'), { recursive: true })
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'editor')

    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([{
        id: 'shape:wheel',
        type: 'block',
        x: 100,
        y: 100,
        props: {
          title: 'DriveWheel',
          view: 'simple',
          inputs: [
            { id: 'in_1', name: 'radius', type: 'float', visible: true, defaultValue: '0.1' },
            { id: 'in_2', name: 'packet', type: 'bytes', visible: true, defaultValue: 'raw' },
          ],
        },
      }])
      editor.select('shape:wheel')
      return true
    })()`)
    await waitFor(app.page, `document.querySelector('[aria-label="inputs in_1 signature"]')`, 'radius field mounted')

    // 1. A plain literal: today's behaviour, unchanged, but for real syntax
    //    highlighting under it — even collapsed, even with no variable at all.
    const literalState = await fieldState(app.page, 'inputs in_1 signature')
    assert.equal(literalState.text, 'radius: float = 0.1', 'plain literal shows as one name: Type = default line')
    assert.equal(literalState.dataError, null, 'a plain literal is never an error')
    assert.match(literalState.html, /tok-number/, 'a bare literal still gets real Python token coloring, collapsed')

    // 2. Type an expression referencing an undefined name.
    await focusField(app.page, 'inputs in_1 signature')
    await shortcut(app.page, 'a', 'KeyA', 2) // Ctrl+A: replace the whole line outright
    await typeSlowly(app.page, 'radius: float = chassis_width / 4')
    await waitFor(app.page, `document.querySelector('[aria-label="inputs in_1 signature"]')?.closest('.ss-code-field-frame')?.getAttribute('data-error') === 'true'`, 'undefined-name error')
    const undefinedState = await fieldState(app.page, 'inputs in_1 signature')
    assert.equal(undefinedState.text, 'radius: float = chassis_width / 4', 'the whole line is preserved verbatim while the default is broken')
    assert.match(undefinedState.help, /chassis_width.*not defined/, 'the exact Python NameError surfaces in the tooltip')
    assert.match(undefinedState.html, /ss-expr-squiggle/, 'the undefined name gets a real wavy underline')
    assert.match(undefinedState.html, /tok-variableName/, 'the reference itself is still real, colored Python syntax')

    // The reference shows up, un-prompted, in "Variables used here".
    await waitFor(app.page, `document.querySelector('[data-testid="inspector-used-variables"]')?.textContent.includes('chassis_width')`, 'auto-detected in Variables used here')
    const usedSectionHasNewBadge = await evaluate(app.page, `document.querySelector('[data-testid="inspector-used-variables"]')?.textContent.includes('new')`)
    assert.equal(usedSectionHasNewBadge, true, 'an undefined reference is flagged as new, ready to define inline')

    // 3. Define it right there — the "super economic to create a variable" flow.
    await blurByTab(app.page)
    await focusField(app.page, 'Global value for chassis_width')
    await typeSlowly(app.page, '0.42')
    await blurByTab(app.page)
    await waitFor(app.page, `document.querySelector('[aria-label="inputs in_1 signature"]')?.closest('.ss-code-field-frame')?.getAttribute('data-error') !== 'true'`, 'radius resolves once chassis_width exists')
    const resolvedState = await fieldState(app.page, 'inputs in_1 signature')
    assert.equal(resolvedState.resolved, '⇢ 0.105', 'chassis_width / 4 resolves once the variable is defined, painted after the formula')
    assert.equal(resolvedState.dataError, null)

    // 4. The board-wide Variables panel edits the SAME variable — and every
    //    property referencing it updates live, without being touched itself.
    await shortcut(app.page, 'p', 'KeyP', 2) // Ctrl+P: command palette (see command_palette_smoke.mjs)
    await waitFor(app.page, `document.querySelector('input[aria-label="Search commands"]')`, 'command palette open')
    await typeSlowly(app.page, 'Show Variables')
    await waitFor(app.page, `document.querySelector('[data-command-id="show-variable-registry"]')`, 'Show Variables command listed')
    await clickElement(app.page, '[data-command-id="show-variable-registry"]')
    await waitFor(app.page, `document.querySelector('[aria-label="Value for chassis_width"]')`, 'Variables panel open')
    assert.equal(await fieldText(app.page, 'Value for chassis_width'), '0.42', 'the panel reads the same value the inline section wrote')

    await focusField(app.page, 'Value for chassis_width')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, '0.5')
    await blurByTab(app.page)
    assert.equal(await fieldText(app.page, 'Value for chassis_width'), '0.5')

    // Switch back to the Block inspector without touching radius at all —
    // via the same "Show inspector" command a real user would reach for,
    // since the Block never left selection (a same-shape re-select would be
    // a no-op for the panel's own auto-open-on-change effect).
    await shortcut(app.page, 'p', 'KeyP', 2)
    await waitFor(app.page, `document.querySelector('input[aria-label="Search commands"]')`, 'command palette reopened')
    await typeSlowly(app.page, 'Show inspector')
    await waitFor(app.page, `document.querySelector('[data-command-id="show-inspector"]')`, 'Show inspector command listed')
    await clickElement(app.page, '[data-command-id="show-inspector"]')
    await waitFor(app.page, `document.querySelector('[aria-label="inputs in_1 signature"]')`, 'inspector back open')
    await waitFor(app.page,
      `document.querySelector('[aria-label="inputs in_1 signature"]')?.closest('.ss-code-field-frame')?.querySelector('.ss-sig-resolved')?.textContent === '⇢ 0.125'`,
      'radius updates live from the registry, untouched')

    // 5. A legacy, non-Python-safe literal (the real bytes-port fixture) never
    //    breaks — it falls back to its own raw text with a quiet warning.
    const packetState = await fieldState(app.page, 'inputs in_2 signature')
    assert.equal(packetState.text, 'packet: bytes = raw', 'a legacy bare-word value displays completely unchanged, in its full line')
    assert.equal(packetState.dataError, 'true')
    assert.equal(packetState.warning, true, 'the passive warning glyph, not an intrusive dialog')
    assert.match(packetState.help, /'raw' is not defined/)
    const storedPacketValue = await evaluate(app.page, `window.__systemsketch.editor.getShape('shape:wheel').props.inputs[1].defaultValue`)
    assert.equal(storedPacketValue, 'raw', 'the stored data itself is never rewritten by evaluation')

    if (REFRESH_SCREENSHOT) {
      await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })
      await evaluate(app.page, `(() => { window.__systemsketch.editor.select('shape:wheel'); return true })()`)
      await focusField(app.page, 'inputs in_1 signature')
      await shoot(app.page, SHOT)
      await blurByTab(app.page)
    }

    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write('PASS parametric-property/expanding-cell real-browser journey\n')
  } finally {
    app.close()
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1 })
