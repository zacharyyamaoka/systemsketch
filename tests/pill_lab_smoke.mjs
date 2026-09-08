#!/usr/bin/env node
/**
 * Real-browser proof of the Phase 2 ink-pass comparison lab: Settings ->
 * Pill lab arms an on-canvas switcher (never the shipped pill itself, until
 * armed), which flips the real selection pill between its default recipe and
 * the two real structural layouts (V1 Excalidraw Compact, V3 Figma
 * Segmented), and between the five style skins — all against a real drawn
 * shape's real, live-wired pill, never a mock.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
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

const MEDIA_DIR = join(ROOT, 'reports', 'media', 'pill-lab')
const RECT = { from: { x: 400, y: 300 }, to: { x: 600, y: 420 } }

async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(MEDIA_DIR, name), Buffer.from(data, 'base64'))
}

/** The registry-driven recipe id, read straight off `ContextualControls`'s own root. */
async function pillRecipe(page) {
  return evaluate(page, `document.querySelector('[data-testid="systemsketch-appearance"]')?.dataset.contextualRecipe ?? null`)
}

async function pillLayoutAttr(page) {
  return evaluate(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.ssPillLayout ?? null`)
}

/** True only when a divider immediately precedes Arrange — V3's own trailing segment. */
async function arrangeIsDivided(page) {
  return evaluate(page, `Boolean(document.querySelector('.systemsketch-appearance__separator + .systemsketch-arrange'))`)
}

async function pillSurfaceColor(page) {
  return evaluate(page, `(() => {
    const bar = document.querySelector('.systemsketch-selection-menu__bar')
    return bar ? getComputedStyle(bar).backgroundColor : null
  })()`)
}

async function setSelectValue(page, testId, value) {
  await evaluate(page, `(() => {
    const element = document.querySelector('[data-testid="${testId}"]')
    if (!(element instanceof HTMLSelectElement)) throw new Error('Missing ${testId}')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
}

const { checks, pass } = makeChecklist()

async function main() {
  await mkdir(MEDIA_DIR, { recursive: true })
  const app = await startApp({ label: 'pill-lab', build: 'pill-lab-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'pill-lab-proof.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'full SystemSketch product canvas')
    await delay(500)

    await key(page, 'r', 'KeyR')
    await drag(page, RECT.from, RECT.to)
    await delay(200)
    const rectId = await evaluate(page, `window.__systemsketch.editor.getOnlySelectedShape()?.id`)
    assert.ok(rectId, 'drawing the rectangle should select it')
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`, 'the selection pill')
    await delay(200)

    // 1. Untouched baseline: no lab attribute, no chip, the stock recipe.
    assert.equal(await pillLayoutAttr(page), null, 'the shipped pill must carry no layout attribute until Pill lab is armed')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="systemsketch-pill-presentation-chip"]'))`), false,
      'the switcher chip must not exist until Settings -> Pill lab turns comparison on')
    const stockRecipe = await pillRecipe(page)
    await screenshot(page, '1-stock-pill.png')
    pass('the shipped pill renders untouched — no layout attribute, no chip, until Pill lab is armed')

    // 2. Arm it from Settings, exactly the way a person would.
    await waitFor(page, `document.querySelector('[data-testid="main-menu.button"]')`, 'main menu button')
    await clickElement(page, '[data-testid="main-menu.button"]')
    await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'Settings menu item')
    await clickElement(page, '[data-testid="main-menu.settings"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings dialog')
    await clickElement(page, '[data-testid="systemsketch-settings-category-pill-lab"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-pill-lab-panel"]')`, 'Pill lab settings panel')
    await clickElement(page, '[data-testid="systemsketch-pill-lab-compare"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-pill-lab-compare"]')?.getAttribute('aria-checked') === 'true'`,
      'the Compare toolbar layouts switch to report on')
    await key(page, 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings closing')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-pill-presentation-chip"]')`, 'the on-canvas switcher chip')
    // Opening the main menu drops the canvas selection — re-select the
    // rectangle exactly as a person would after closing the dialog.
    await clickAt(page, (RECT.from.x + RECT.to.x) / 2, (RECT.from.y + RECT.to.y) / 2)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`, 'the pill after re-selecting')
    pass('Settings -> Pill lab arms the on-canvas switcher chip')

    // 3. V1 Excalidraw Compact: one flat recipe, no group separators inside it.
    await setSelectValue(page, 'systemsketch-pill-chip-layout', 'v1')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.ssPillLayout === 'v1'`,
      'the pill wrapper to report layout v1')
    assert.equal(await pillRecipe(page), 'v1-compact', 'V1 must compose through the v1-compact recipe')
    await screenshot(page, '2-v1-compact.png')
    pass('picking V1 in the chip switches the live pill to the v1-compact recipe')

    // 4. V3 Figma Segmented: Arrange peels off behind its own divider.
    assert.equal(await arrangeIsDivided(page), false, 'V1 must not draw a divider before Arrange')
    await setSelectValue(page, 'systemsketch-pill-chip-layout', 'v3')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.ssPillLayout === 'v3'`,
      'the pill wrapper to report layout v3')
    assert.equal(await pillRecipe(page), 'v3-segmented', 'V3 must compose through the v3-segmented recipe')
    assert.equal(await arrangeIsDivided(page), true, 'V3 must draw a divider immediately before its trailing Arrange segment')
    await screenshot(page, '3-v3-segmented.png')
    pass('picking V3 in the chip switches the live pill to the v3-segmented recipe, Arrange divided off')

    // 5. A style skin re-themes the real pill bar's own computed background.
    const surfaceBeforeSkin = await pillSurfaceColor(page)
    await setSelectValue(page, 'systemsketch-pill-chip-skin', '3')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')?.dataset.ssPillSkin === '3'`, 'skin 3 armed at the app root')
    await delay(150)
    const surfaceAfterSkin = await pillSurfaceColor(page)
    assert.notEqual(surfaceAfterSkin, surfaceBeforeSkin, 'skin 3 (High Contrast Outline, white) must repaint the pill bar\'s computed background')
    assert.equal(surfaceAfterSkin, 'rgb(255, 255, 255)', `skin 3's surface should compute to white, got ${surfaceAfterSkin}`)
    await screenshot(page, '4-skin-3-high-contrast.png')
    pass('picking a style skin repaints the real pill bar\'s computed background')

    // 6. Turning comparison off restores the exact shipped baseline.
    await clickElement(page, '[data-testid="main-menu.button"]')
    await clickElement(page, '[data-testid="main-menu.settings"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings dialog again')
    await clickElement(page, '[data-testid="systemsketch-settings-category-pill-lab"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-pill-lab-panel"]')`, 'Pill lab settings panel again')
    await clickElement(page, '[data-testid="systemsketch-pill-lab-compare"]')
    await key(page, 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings closing again')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-pill-presentation-chip"]')`, 'the chip to disappear')
    await clickAt(page, (RECT.from.x + RECT.to.x) / 2, (RECT.from.y + RECT.to.y) / 2)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`, 'the pill after re-selecting again')
    assert.equal(await pillLayoutAttr(page), null, 'turning comparison off must clear the layout attribute')
    assert.equal(await pillRecipe(page), stockRecipe, 'turning comparison off must restore the exact stock recipe')
    await screenshot(page, '5-restored-stock.png')
    pass('turning Compare off restores the pill to its exact shipped baseline')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    const capture = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
    if (capture) await writeFile(join(MEDIA_DIR, 'failure.png'), Buffer.from(capture.data, 'base64'))
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
