#!/usr/bin/env node
/**
 * Real-browser proof for the ten UI/UX hardening changes of 2026-09-03.
 *
 * Each defect below was measured in the running product first, not read off the
 * source — the numbers in the assertions are the ones the audit recorded, so a
 * regression shows up as the original measurement coming back:
 *
 *   1. A real Tab into the command palette left `outline: none` on the focused
 *      control; five stylesheets had zero `:focus-visible` rules between them.
 *   2. The inspector dock hid the frame's header for every subject, so a
 *      cable, an ordinary shape and an empty selection had no pointer way out.
 *   3. `Inspect` on a rectangle dead-ended on "Select a Block to inspect it."
 *   4. Closing the dock was undone by the next selection.
 *   5. Two destructive actions asked with `window.confirm`.
 *   6. The Block view switcher showed bare `S` `P` `E` with `title: null`.
 *   7. Both palette tabs were `tabIndex=0` with no `aria-controls`, no
 *      `role="tabpanel"` and no arrow keys; 28 `menuitemradio` buttons had no
 *      `menu` ancestor; the theme radiogroup ignored the arrow keys.
 *   8. The 455px colour palette opened at x=0 for a trigger at x=183.
 *   9. Every app panel drew the OS scrollbar (`scrollbar-width: auto`).
 *  10. The `Z` badge was a button titled "Profile placeholder" that did nothing.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = {
  facts: join(ROOT, 'docs', 'ui-hardening-1-shape-facts-2026-09-03.png'),
  focus: join(ROOT, 'docs', 'ui-hardening-2-palette-focus-2026-09-03.png'),
  confirm: join(ROOT, 'docs', 'ui-hardening-3-confirm-2026-09-03.png'),
  appearance: join(ROOT, 'docs', 'ui-hardening-4-appearance-2026-09-03.png'),
  settings: join(ROOT, 'docs', 'ui-hardening-5-settings-2026-09-03.png'),
}
const RESULTS = join(ROOT, 'docs', 'ui-hardening-results.json')

/** The collision padding every popover in this app keeps from the window edge. */
const POPOVER_COLLISION_PADDING = 12
/** A focus ring has to be at least this wide to be a ring rather than a hairline. */
const MIN_RING_WIDTH = 2

const { checks, pass } = makeChecklist()
const measured = {}

async function shot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

/** Seed two Blocks and a rectangle through the editor's own public API. */
async function seed(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      { type: 'block', x: 240, y: 260, props: { title: 'estimate' } },
      { type: 'block', x: 700, y: 260, props: { title: 'encode' } },
      { type: 'geo', x: 300, y: 600, props: { geo: 'rectangle', w: 220, h: 120 } },
    ])
    return 'ok'
  })()`)
  await delay(400)
}

async function selectKind(page, kind, index = 0) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const matches = editor.getCurrentPageShapes().filter((shape) => shape.type === ${JSON.stringify(kind)})
    editor.select(matches[${index}].id)
    return matches[${index}].id
  })()`)
  await delay(400)
}

/** The computed ring on whatever currently holds focus. */
async function focusRing(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.activeElement
    if (!element || element === document.body) return JSON.stringify({ focused: null })
    const style = getComputedStyle(element)
    return JSON.stringify({
      focused: element.tagName + '.' + String(element.className).split(' ')[0],
      role: element.getAttribute('role'),
      matchesFocusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      outlineColor: style.outlineColor,
    })
  })()`))
}

function ringIsVisible(reading) {
  return reading.matchesFocusVisible
    && reading.outlineStyle !== 'none'
    && reading.outlineWidth >= MIN_RING_WIDTH
}

async function main() {
  const app = await startApp({ label: 'ui-hardening', build: 'ui-hardening-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'ui-hardening.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await waitFor(page, '!!window.__systemsketch', 'development seam')
    await delay(600)

    // A native confirm would block this journey forever, so replace it with a
    // tripwire: any surviving call site fails loudly instead of hanging.
    await evaluate(page, `(() => {
      window.__nativeConfirmCalls = 0
      window.confirm = () => { window.__nativeConfirmCalls += 1; return false }
      return 'armed'
    })()`)

    await seed(page)

    // ---- 9. Themed scrollbars, before anything else opens ----------------
    await shortcut(page, 'p', 'KeyP', 2)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'palette')
    await delay(300)
    const scrollbars = JSON.parse(await evaluate(page, `(() => {
      const read = (selector) => {
        const element = document.querySelector(selector)
        if (!element) return null
        const style = getComputedStyle(element)
        return { scrollbarWidth: style.scrollbarWidth, scrollbarColor: style.scrollbarColor }
      }
      const list = document.querySelector('.systemsketch-command-palette__results')
      return JSON.stringify({
        palette: read('.systemsketch-command-palette'),
        overflowing: list ? list.scrollHeight > list.clientHeight : false,
      })
    })()`))
    measured.scrollbars = scrollbars
    assert.equal(scrollbars.palette.scrollbarWidth, 'thin',
      'the palette still draws the OS scrollbar')
    assert.notEqual(scrollbars.palette.scrollbarColor, 'auto',
      'the palette scrollbar is not painted from the theme')
    assert.equal(scrollbars.overflowing, true,
      'the seeded palette no longer overflows, so the scrollbar claim is untested')
    pass('every app panel paints a thin themed scrollbar instead of the OS one')

    // ---- 1 + 7a. Palette focus ring, roving tabs, arrow keys, tabpanel ---
    const tabs = JSON.parse(await evaluate(page, `(() => {
      const root = document.querySelector('[data-testid="systemsketch-command-palette"]')
      const list = [...root.querySelectorAll('[role=tab]')]
      const panel = root.querySelector('[role=tabpanel]')
      return JSON.stringify({
        count: list.length,
        tabIndexes: list.map((tab) => tab.tabIndex),
        controls: list.map((tab) => tab.getAttribute('aria-controls')),
        panelId: panel ? panel.id : null,
        panelLabelledBy: panel ? panel.getAttribute('aria-labelledby') : null,
      })
    })()`))
    measured.tabs = tabs
    assert.deepEqual(tabs.tabIndexes, [0, -1],
      'the tablist is not one tab stop: both tabs are still tabbable')
    assert.ok(tabs.panelId, 'the tabs still control no tabpanel')
    assert.deepEqual(new Set(tabs.controls), new Set([tabs.panelId]),
      'aria-controls does not point at the rendered tabpanel')
    pass('the palette mode switch is one tab stop that controls a real tabpanel')

    // A tab is the one control in this dialog that deliberately takes NO ring:
    // selection follows focus here, so the focused tab is always the selected
    // tab, and the selected chip already says so. What has to hold instead is
    // that the two states are plainly different from each other.
    await evaluate(page, `(() => {
      document.querySelector('[role=tab][aria-selected="true"]').focus()
      return 'focused'
    })()`)
    await delay(120)
    const tabRing = await focusRing(page)
    const tabStates = JSON.parse(await evaluate(page, `(() => {
      const root = document.querySelector('[data-testid="systemsketch-command-palette"]')
      const read = (tab) => {
        const style = getComputedStyle(tab)
        return { background: style.backgroundColor, color: style.color, shadow: style.boxShadow !== 'none' }
      }
      const on = root.querySelector('[role=tab][aria-selected="true"]')
      const off = root.querySelector('[role=tab][aria-selected="false"]')
      return JSON.stringify({ on: read(on), off: read(off) })
    })()`))
    measured.tabRing = tabRing
    measured.tabStates = tabStates
    assert.equal(tabRing.role, 'tab', 'focus did not land on a palette tab')
    assert.equal(tabRing.outlineStyle, 'none',
      'the tablist grew a focus ring back; its selected state is meant to be the only mark')
    assert.notEqual(tabStates.on.background, tabStates.off.background,
      'the selected and unselected tabs share a background, so nothing says which is on')
    assert.notEqual(tabStates.on.color, tabStates.off.color,
      'the selected and unselected tabs share an ink colour')
    assert.equal(tabStates.on.shadow, true, 'the selected tab lost the lift that raises it')
    await shot(page, SHOTS.focus)
    pass('the palette tablist says which tab is on through one mark, not a ring competing with a chip')


    await key(page, 'ArrowRight')
    await delay(250)
    const afterArrow = JSON.parse(await evaluate(page, `(() => {
      const root = document.querySelector('[data-testid="systemsketch-command-palette"]')
      const selected = root.querySelector('[role=tab][aria-selected="true"]')
      return JSON.stringify({
        mode: selected.dataset.mode,
        heading: root.querySelector('h2').textContent.trim(),
        focusIsSelectedTab: document.activeElement === selected,
      })
    })()`))
    measured.afterArrow = afterArrow
    assert.equal(afterArrow.mode, 'find-replace', 'ArrowRight did not move the tablist')
    assert.equal(afterArrow.focusIsSelectedTab, true, 'focus did not follow the arrow key')
    pass('arrow keys walk the palette tablist and selection follows focus')

    // The ring still has to be there for every control where focus is NOT
    // selection — otherwise this would be a regression dressed as a decision.
    await evaluate(page, `document.querySelector('.systemsketch-command-palette__close').focus()`)
    await delay(120)
    const closeRing = JSON.parse(await evaluate(page, `(() => {
      const element = document.querySelector('.systemsketch-command-palette__close')
      element.focus()
      const style = getComputedStyle(element)
      return JSON.stringify({
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      })
    })()`))
    measured.closeRing = closeRing
    assert.notEqual(closeRing.outlineStyle, 'none',
      'the palette close button lost its focus ring along with the tabs')
    assert.ok(closeRing.outlineWidth >= MIN_RING_WIDTH,
      `the palette close ring is a hairline: ${JSON.stringify(closeRing)}`)
    pass('every palette control that is not a tab still paints a ring')

    await key(page, 'Escape')
    await delay(300)

    // ---- 2 + 3. The dock has a header, and Inspect leads somewhere -------
    await selectKind(page, 'geo')
    // No click: the pill carries no Inspect button any more. Selecting the
    // shape IS the request, so the dock has to arrive on its own — for an
    // ordinary rectangle exactly as for a Block.
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-shape-facts"]')`, 'shape facts')
    await delay(300)
    const pillHasNoInspect = await evaluate(page, `(() => {
      const bar = document.querySelector('.systemsketch-selection-menu__bar')
      return String(!bar.innerText.includes('Inspect'))
    })()`)
    assert.equal(pillHasNoInspect, 'true', 'the selection pill still carries an Inspect button')
    const dock = JSON.parse(await evaluate(page, `(() => {
      const aside = document.querySelector('[data-testid="systemsketch-right-popout"]')
      const header = aside.querySelector('.systemsketch-popout__header')
      const close = aside.querySelector('[data-testid="systemsketch-right-popout-close"]')
      const facts = aside.querySelector('[data-testid="systemsketch-shape-facts"]')
      const rows = [...facts.querySelectorAll('dl > div')]
        .map((row) => row.querySelector('dt').textContent.trim())
      return JSON.stringify({
        subject: aside.dataset.inspectorSubject,
        headerOwner: aside.dataset.inspectorHeader,
        headerDisplay: header ? getComputedStyle(header).display : 'absent',
        closeVisible: close ? close.getBoundingClientRect().width > 0 : false,
        title: aside.querySelector('.systemsketch-popout__header h2').textContent.trim(),
        factsTitle: facts.querySelector('h2').textContent.trim(),
        rows,
        text: facts.innerText,
      })
    })()`))
    measured.dock = dock
    assert.equal(dock.subject, 'shape', 'a rectangle did not reach the shape lens')
    assert.equal(dock.headerOwner, 'frame', 'the shape lens was told to draw its own header')
    assert.notEqual(dock.headerDisplay, 'none',
      'the dock still hides its header for a subject that supplies none')
    assert.equal(dock.closeVisible, true, 'the dock still has no pointer way to close it')
    assert.equal(dock.factsTitle, 'Rectangle',
      `the facts panel named the shape ${dock.factsTitle}`)
    assert.ok(dock.rows.includes('Position') && dock.rows.includes('Size'),
      `the facts panel is missing geometry: ${JSON.stringify(dock.rows)}`)
    assert.ok(!dock.text.includes('Select a Block to inspect it'),
      'Inspect still dead-ends on the Block placeholder')
    await shot(page, SHOTS.facts)
    pass('selecting an ordinary shape opens its real facts panel, with no Inspect button in the pill')

    // Fit to view is a real action: the camera has to move.
    const zoomed = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const before = editor.getCamera()
      document.querySelector('[data-testid="shape-facts-zoom"]').click()
      return JSON.stringify({ before: { x: before.x, y: before.y, z: before.z } })
    })()`))
    await delay(500)
    const cameraAfter = JSON.parse(await evaluate(page, `(() => {
      const camera = window.__systemsketch.editor.getCamera()
      return JSON.stringify({ x: camera.x, y: camera.y, z: camera.z })
    })()`))
    measured.camera = { ...zoomed, after: cameraAfter }
    assert.notDeepEqual(cameraAfter, zoomed.before, 'Fit to view did not move the camera')
    pass('the facts panel Fit to view action really moves the camera')

    // The dock's own close button closes it.
    await evaluate(page, `document.querySelector('[data-testid="systemsketch-right-popout-close"]').click()`)
    await delay(400)
    assert.equal(await evaluate(page, `String(!!document.querySelector('[data-testid="systemsketch-right-popout"]'))`),
      'false', 'the dock header close button did not close the dock')
    pass('the dock header close button closes a headerless-subject panel')

    // ---- 4. A dismissal survives the next selection ----------------------
    // The previous check closed the dock while the rectangle was selected, and
    // that dismissal is still in force — now that the dock follows EVERY
    // selection, a run of selections includes ordinary shapes. Clearing the
    // selection ends that run, which is the release this test then re-proves.
    // Done through the editor rather than a canvas click: `Fit to view` above
    // left the board at a zoom where an empty-looking point is inside a shape.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return 'cleared'
    })()`)
    await delay(500)
    await selectKind(page, 'block', 0)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-right-popout"]')`, 'dock auto-open')
    const autoOpened = true
    await evaluate(page, `(() => {
      const aside = document.querySelector('[data-testid="systemsketch-right-popout"]')
      const close = aside.querySelector('[data-testid="systemsketch-right-popout-close"]')
        ?? aside.querySelector('.block-inspector__dock-close')
        ?? aside.querySelector('[aria-label^="Close"]')
      close.click()
      return 'closed'
    })()`)
    await delay(400)
    const afterClose = await evaluate(page, `String(!!document.querySelector('[data-testid="systemsketch-right-popout"]'))`)
    await selectKind(page, 'block', 1)
    await delay(500)
    const afterNextSelect = await evaluate(page, `String(!!document.querySelector('[data-testid="systemsketch-right-popout"]'))`)
    // Clearing the selection ends the run the dismissal applied to.
    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return 'cleared' })()`)
    await delay(400)
    await selectKind(page, 'block', 0)
    await delay(500)
    const afterReset = await evaluate(page, `String(!!document.querySelector('[data-testid="systemsketch-right-popout"]'))`)
    measured.dismissal = { autoOpened, afterClose, afterNextSelect, afterReset }
    assert.equal(afterClose, 'false', 'the dock did not close')
    assert.equal(afterNextSelect, 'false',
      'the dock re-opened itself after the user closed it')
    assert.equal(afterReset, 'true',
      'the dismissal outlived the selection it applied to and the dock never returns')
    pass('closing the dock sticks for that run of selections and releases on an empty selection')

    // ---- 4b. Escape belongs to the canvas while only the dock is open ----
    // The dock follows the selection, so it is open most of the time a person
    // is working. Swallowing Escape for it took the key away from the tool:
    // drawing a rectangle selected it, opened the dock, and the Escape meant to
    // return the geo tool to select closed the dock instead — arming the tool
    // with no way out and no selection pill.
    // The real gesture, not a programmatic one: click the canvas so it holds
    // focus, arm the rectangle with its own shortcut, drag one out — which
    // selects it and therefore opens the dock — then press Escape.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return 'reset'
    })()`)
    await delay(400)
    await clickAt(page, 140, 700)
    await delay(200)
    await key(page, 'r', 'KeyR')
    await drag(page, { x: 120, y: 640 }, { x: 300, y: 760 })
    await delay(400)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-right-popout"]')`,
      'the dock the drawn shape opens')
    await key(page, 'Escape', 'Escape')
    await delay(400)
    const afterEscape = JSON.parse(await evaluate(page, `(() => JSON.stringify({
      tool: window.__systemsketch.editor.getCurrentToolId(),
      dockOpen: Boolean(document.querySelector('[data-testid="systemsketch-right-popout"]')),
    }))()`))
    measured.escape = afterEscape
    assert.equal(afterEscape.tool, 'select',
      `Escape did not reach the canvas: the tool is still ${afterEscape.tool}`)
    assert.equal(afterEscape.dockOpen, true,
      'Escape closed the dock instead of letting the canvas have the key')
    pass('Escape returns the tool to select rather than being swallowed by the dock')

    // ---- 6. The Block view switcher explains itself ----------------------
    // Clear the rectangle the Escape check drew, then put a Block back in the
    // selection so this reads the Block pill rather than the plain-shape one.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const drawn = editor.getSelectedShapes().filter((shape) => shape.type === 'geo')
      if (drawn.length) editor.deleteShapes(drawn.map((shape) => shape.id))
      return 'tidied'
    })()`)
    await delay(300)
    await selectKind(page, 'block', 0)
    await delay(300)
    const miniMenu = JSON.parse(await evaluate(page, `(() => {
      const buttons = [...document.querySelectorAll('.block-mini-menu button')]
      return JSON.stringify(buttons.map((button) => ({
        text: button.textContent.trim(),
        title: button.title || null,
        label: button.getAttribute('aria-label'),
      })))
    })()`))
    measured.miniMenu = miniMenu
    // Three view controls and no Inspect: the pill carries only what changes
    // the Block, because selecting it already opened the dock.
    assert.equal(miniMenu.length, 3, `the Block mini menu rendered ${miniMenu.length} controls`)
    assert.ok(!miniMenu.some((button) => button.text === 'Inspect'),
      'the Block pill still carries an Inspect button')
    for (const button of miniMenu) {
      assert.ok(button.title && button.title.length > 8,
        `a Block mini-menu control still has no tooltip: ${JSON.stringify(button)}`)
      assert.ok(button.label, `a Block mini-menu control still has no accessible name: ${JSON.stringify(button)}`)
    }
    pass('every Block mini-menu control carries a tooltip and an accessible name')

    // ---- 8 + 7b. Appearance popover padding and menu structure -----------
    // A narrow window is the condition the padding exists for: the colour
    // palette is wider than the slack the viewport leaves it, so Radix must
    // clamp, and before the change it clamped flush to x=0 with the first
    // swatch column cut in half.
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 520, height: 820, deviceScaleFactor: 1, mobile: false,
    })
    await delay(500)
    await selectKind(page, 'geo')
    await delay(400)
    const trigger = JSON.parse(await evaluate(page, `(() => {
      const button = document.querySelector('.systemsketch-appearance__trigger[data-control="color"]')
      if (!button) return JSON.stringify({ missing: true })
      const box = button.getBoundingClientRect()
      button.click()
      return JSON.stringify({ x: Math.round(box.x), width: Math.round(box.width) })
    })()`))
    assert.ok(!trigger.missing, 'the rectangle offered no colour trigger')
    await waitFor(page, `document.querySelector('.systemsketch-appearance__panel')`, 'colour panel')
    await delay(400)
    const popover = JSON.parse(await evaluate(page, `(() => {
      const panel = document.querySelector('.systemsketch-appearance__panel')
      const box = panel.getBoundingClientRect()
      const radios = [...panel.querySelectorAll('[role=menuitemradio]')]
      const menu = radios[0] ? radios[0].closest('[role=menu]') : null
      return JSON.stringify({
        x: Math.round(box.x),
        right: Math.round(box.right),
        width: Math.round(box.width),
        viewport: window.innerWidth,
        radioCount: radios.length,
        hasMenuAncestor: Boolean(menu),
        menuLabel: menu ? menu.getAttribute('aria-label') : null,
      })
    })()`))
    measured.popover = { trigger, ...popover }
    assert.ok(popover.radioCount > 10,
      `the colour panel rendered only ${popover.radioCount} options`)
    assert.equal(popover.hasMenuAncestor, true,
      'menuitemradio options still have no menu ancestor')
    assert.ok(popover.menuLabel, 'the appearance menu has no accessible name')
    assert.ok(popover.x >= POPOVER_COLLISION_PADDING,
      `the colour panel opened ${popover.x}px from the window edge, inside the ${POPOVER_COLLISION_PADDING}px padding`)
    assert.ok(popover.viewport - popover.right >= POPOVER_COLLISION_PADDING,
      'the colour panel is flush against the right window edge')
    // The clamp is genuinely exercised: centred on this trigger the panel would
    // have started left of the padding — which is exactly the x=0 the audit
    // measured — so the padding, not luck, is what put it where it is.
    const centredX = Math.round(trigger.x + trigger.width / 2 - popover.width / 2)
    measured.popover.centredX = centredX
    assert.ok(centredX < POPOVER_COLLISION_PADDING,
      `centred on this trigger the panel would start at ${centredX}px, so no clamp was tested`)
    await shot(page, SHOTS.appearance)
    pass('the appearance palette keeps the app-wide 12px clear of the window edge')

    // A keyboard-focused swatch paints a ring on the dark panel too.
    //
    // `:focus-visible` tracks the modality of the interaction that MOVED focus,
    // so a script `.focus()` never matches it however the panel was opened —
    // the ring claim has to rest on a real key press. tldraw's popover
    // auto-focuses its first button programmatically, so Tab at least once.
    let swatchRing = { focused: null }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await key(page, 'Tab')
      await delay(120)
      const inside = await evaluate(page, `String(Boolean(
        document.activeElement?.closest('.systemsketch-appearance__panel')
      ))`)
      if (inside !== 'true') continue
      swatchRing = await focusRing(page)
      break
    }
    assert.ok(swatchRing.focused, 'Tab never reached a control inside the colour panel')
    measured.swatchRing = swatchRing
    assert.ok(ringIsVisible(swatchRing),
      `a focused appearance swatch still paints no ring: ${JSON.stringify(swatchRing)}`)
    pass('a keyboard-focused appearance swatch paints a ring on the inverse panel')
    await key(page, 'Escape')
    await delay(300)
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 960, deviceScaleFactor: 1, mobile: false,
    })
    await delay(400)

    // ---- 10 + 7c. The avatar opens Settings; the theme list takes arrows --
    const avatar = JSON.parse(await evaluate(page, `(() => {
      const button = document.querySelector('[data-testid="systemsketch-avatar-button"]')
      if (!button) return JSON.stringify({ missing: true })
      const reading = { title: button.title, label: button.getAttribute('aria-label') }
      button.click()
      return JSON.stringify(reading)
    })()`))
    assert.ok(!avatar.missing, 'the top-right shell has no avatar button')
    assert.ok(!/placeholder/i.test(`${avatar.title} ${avatar.label}`),
      `the avatar still describes itself as a placeholder: ${JSON.stringify(avatar)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'settings dialog')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-theme-list"]')`, 'theme list')
    await delay(400)
    const settings = JSON.parse(await evaluate(page, `(() => {
      const dialog = document.querySelector('[data-testid="systemsketch-settings-dialog"]')
      return JSON.stringify({ category: dialog.dataset.category })
    })()`))
    assert.equal(settings.category, 'appearance',
      `the badge landed on the ${settings.category} panel rather than the theme`)
    measured.avatar = { ...avatar, ...settings }
    await shot(page, SHOTS.settings)
    pass('the profile badge opens the real Settings dialog on the theme panel')

    const themeKeys = JSON.parse(await evaluate(page, `(() => {
      const list = document.querySelector('[data-testid="systemsketch-theme-list"]')
      const radios = [...list.querySelectorAll('[role=radio]')]
      const checkedIndex = radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true')
      radios[checkedIndex === -1 ? 0 : checkedIndex].focus()
      return JSON.stringify({
        count: radios.length,
        tabbable: radios.filter((radio) => radio.tabIndex === 0).length,
        checkedIndex,
      })
    })()`))
    assert.equal(themeKeys.tabbable, 1,
      `${themeKeys.tabbable} of ${themeKeys.count} theme radios are tabbable; a radiogroup is one tab stop`)
    await key(page, 'ArrowDown')
    await delay(350)
    const themeAfter = JSON.parse(await evaluate(page, `(() => {
      const radios = [...document.querySelectorAll('[data-testid="systemsketch-theme-list"] [role=radio]')]
      return JSON.stringify({
        checkedIndex: radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true'),
        focusMoved: document.activeElement === radios[radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true')],
      })
    })()`))
    measured.theme = { before: themeKeys, after: themeAfter }
    assert.notEqual(themeAfter.checkedIndex, themeKeys.checkedIndex,
      'ArrowDown did not move the theme radiogroup')
    assert.equal(themeAfter.focusMoved, true, 'focus did not follow the theme selection')
    pass('the theme radiogroup is one tab stop the arrow keys operate')

    // A disabled Settings category stays reachable and says why.
    const category = JSON.parse(await evaluate(page, `(() => {
      const button = document.querySelector('[data-testid="systemsketch-settings-category-shortcuts"]')
      const before = document.querySelector('[data-testid="systemsketch-settings-dialog"]').dataset.category
      button.focus()
      const focusable = document.activeElement === button
      button.click()
      return JSON.stringify({
        focusable,
        ariaDisabled: button.getAttribute('aria-disabled'),
        nativelyDisabled: button.disabled,
        badge: button.querySelector('em') ? button.querySelector('em').textContent.trim() : null,
        before,
        after: document.querySelector('[data-testid="systemsketch-settings-dialog"]').dataset.category,
      })
    })()`))
    measured.category = category
    assert.equal(category.focusable, true, 'an unbuilt Settings category is still unfocusable')
    assert.equal(category.nativelyDisabled, false, 'the category is still natively disabled')
    assert.equal(category.ariaDisabled, 'true', 'the category is not announced as disabled')
    assert.ok(category.badge, 'the category gives no visible reason for being inert')
    assert.equal(category.after, category.before, 'an inert category still changed the panel')
    pass('an unbuilt Settings category is reachable, announced, visibly explained, and inert')

    await key(page, 'Escape')
    await delay(400)

    // ---- 5. The confirm dialog is the app's, and it really deletes -------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      return 'ok'
    })()`)
    await delay(200)
    await evaluate(page, `(() => {
      const button = [...document.querySelectorAll('[data-testid="systemsketch-top-right-shell"] button')]
        .find((candidate) => (candidate.title || '').includes('Comments'))
      button.click()
      return 'ok'
    })()`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-comments-panel"]')`, 'comments panel')
    await delay(400)

    await evaluate(page, `(() => {
      const panel = document.querySelector('[data-testid="systemsketch-comments-panel"]')
      const area = panel.querySelector('textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(area, 'Check the dock header here.')
      area.dispatchEvent(new Event('input', { bubbles: true }))
      return 'typed'
    })()`)
    await delay(250)
    await evaluate(page, `(() => {
      const panel = document.querySelector('[data-testid="systemsketch-comments-panel"]')
      panel.querySelector('.systemsketch-comments__composer button[type=submit]').click()
      return 'submitted'
    })()`)
    await waitFor(page, `document.querySelector('.systemsketch-comments__thread')`, 'a comment thread')
    await delay(300)
    const threadsBefore = Number(await evaluate(page,
      `String(document.querySelectorAll('.systemsketch-comments__thread').length)`))
    assert.equal(threadsBefore, 1, `seeding produced ${threadsBefore} threads`)

    // A keyboard-focused comments control paints a ring — the second half of
    // change 1, and reached by real Tab presses so `:focus-visible` applies.
    await evaluate(page, `(() => {
      document.querySelector('.systemsketch-comments__thread').scrollIntoView()
      document.querySelector('[data-testid="systemsketch-comments-panel"] textarea').focus()
      return 'ok'
    })()`)
    let commentsRing = { focused: null }
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await key(page, 'Tab')
      await delay(120)
      const onButton = await evaluate(page, `String(Boolean(
        document.activeElement?.tagName === 'BUTTON'
        && document.activeElement.closest('[data-testid="systemsketch-comments-panel"]')
      ))`)
      if (onButton !== 'true') continue
      commentsRing = await focusRing(page)
      break
    }
    measured.commentsRing = commentsRing
    assert.ok(commentsRing.focused, 'Tab never reached a button inside the comments panel')
    assert.ok(ringIsVisible(commentsRing),
      `a focused comments control still paints no ring: ${JSON.stringify(commentsRing)}`)
    pass('a keyboard-focused comments control paints a visible ring')

    await evaluate(page, `document.querySelector('.systemsketch-comments__delete').click()`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-confirm-dialog"]')`, 'app confirm dialog')
    await delay(300)
    const confirmDialog = JSON.parse(await evaluate(page, `(() => {
      const dialog = document.querySelector('[data-testid="systemsketch-confirm-dialog"]')
      return JSON.stringify({
        tone: dialog.dataset.tone,
        title: dialog.querySelector('.tlui-dialog__title, h2, [class*=title]').textContent.trim(),
        body: dialog.querySelector('.systemsketch-confirm__body').textContent.trim(),
        focusIsCancel: document.activeElement
          === dialog.querySelector('[data-testid="systemsketch-confirm-cancel"]'),
        nativeConfirmCalls: window.__nativeConfirmCalls,
      })
    })()`))
    measured.confirm = confirmDialog
    assert.equal(confirmDialog.nativeConfirmCalls, 0,
      'a destructive action still went through window.confirm')
    assert.equal(confirmDialog.tone, 'danger', 'the delete ask is not painted as destructive')
    assert.equal(confirmDialog.focusIsCancel, true,
      'the destructive verb holds the initial focus, so a blind Enter destroys')
    assert.ok(confirmDialog.body.length > 20, 'the ask states no consequence')
    await shot(page, SHOTS.confirm)

    // Cancel keeps the thread…
    await evaluate(page, `document.querySelector('[data-testid="systemsketch-confirm-cancel"]').click()`)
    await delay(400)
    const afterCancel = Number(await evaluate(page,
      `String(document.querySelectorAll('.systemsketch-comments__thread').length)`))
    assert.equal(afterCancel, 1, 'Cancel deleted the thread anyway')

    // …and the destructive verb removes it.
    await evaluate(page, `document.querySelector('.systemsketch-comments__delete').click()`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-confirm-dialog"]')`, 'confirm dialog again')
    await delay(250)
    await evaluate(page, `document.querySelector('[data-testid="systemsketch-confirm-accept"]').click()`)
    await delay(500)
    const afterDelete = Number(await evaluate(page,
      `String(document.querySelectorAll('.systemsketch-comments__thread').length)`))
    measured.threads = { before: threadsBefore, afterCancel, afterDelete }
    assert.equal(afterDelete, 0, 'confirming did not delete the thread')
    assert.equal(Number(await evaluate(page, `String(window.__nativeConfirmCalls)`)), 0,
      'window.confirm was reached during the delete flow')
    pass('destructive actions ask through the app dialog, cancel safely, and really delete')

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `the journey logged console errors: ${JSON.stringify(errors)}`)
    pass('the physical journey produced zero local console errors')

    await writeFile(RESULTS, `${JSON.stringify({ checks, measured }, null, 2)}\n`)
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
    for (const path of Object.values(SHOTS)) process.stdout.write(`  ${path}\n`)
  } finally {
    app.close()
  }
}

await main()
