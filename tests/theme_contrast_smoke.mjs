#!/usr/bin/env node
/**
 * Real-browser proof that every theme is legible, measured rather than eyeballed.
 *
 * For each shipped theme the journey loads the product, selects a Block so the
 * inspector and the selection pill are on screen, opens Settings, and for every
 * piece of chrome that carries text or an icon reads the painted foreground and
 * the effective background off the live element — compositing translucent
 * layers down to the first opaque one — and computes the WCAG contrast ratio.
 * Body text must reach 4.5:1; text on an accent fill, icons and input
 * boundaries 3:1. (A labelled button's border is decorative — the label is
 * what identifies the control — so only text inputs are measured as
 * boundaries.) The ratio is the acceptance criterion: an oracle independent
 * of the CSS that produced it, and exactly the thing that failed when the
 * popout header kept `color: #272b32` on a dark board.
 *
 * Two more things are proved on the way: the picker in Settings → Appearance
 * switches the theme live (root attributes, tldraw's own dark class, the
 * canvas colour), and importing a VS Code theme file through the real file
 * input yields a palette whose values match what the pure mapping says.
 *
 * Runs with `node --experimental-strip-types` so it can read the shipped
 * palettes and the mapping straight from the TypeScript that ships them.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, drawBlock } from './block_journey_helpers.mjs'
// Node's type stripping wants explicit extensions on relative imports, which
// the app's own modules do not carry, so the palettes are read one file each.
import { DARK_MODERN_PALETTE } from '../src/theme/palettes/darkModern.ts'
import { OBSIDIAN_DARK_PALETTE, OBSIDIAN_LIGHT_PALETTE } from '../src/theme/palettes/obsidian.ts'
import { parseVsCodeThemeText, vsCodeThemeTokens, vsCodeThemeScheme } from '../src/theme/vscodeTheme.ts'

const BUILT_IN_PALETTES = [OBSIDIAN_LIGHT_PALETTE, OBSIDIAN_DARK_PALETTE, DARK_MODERN_PALETTE]

/** Where captures and the verdict land; a mutation run points this elsewhere. */
const SHOTS = process.env.SYSTEMSKETCH_THEME_CAPTURE_DIR ?? join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'theme-contrast.json')
/** A light VS Code theme, so the import proves a scheme the shipped palette does not. */
const IMPORT_CANDIDATES = [
  '/usr/share/cursor/resources/app/extensions/theme-defaults/themes/light_modern.json',
  '/usr/share/code/resources/app/extensions/theme-defaults/themes/light_modern.json',
  '/snap/code/current/usr/share/code/resources/app/extensions/theme-defaults/themes/light_modern.json',
]

const THRESHOLDS = { text: 4.5, 'text-on-accent': 3, icon: 3, boundary: 3 }

/**
 * Every piece of chrome the journey measures. `pseudo` reads the background
 * off a pseudo-element (tldraw paints a tool's active fill on `::after`);
 * `boundary` compares the border colour to the element's own background.
 */
const PROBES = [
  { label: 'file title, top-left shell', selector: '.systemsketch-top-left-shell .systemsketch-file-title', kind: 'text' },
  { label: 'comments button', selector: '.systemsketch-top-right-shell .systemsketch-shell-icon-button', kind: 'icon' },
  { label: 'Share button', selector: '.systemsketch-share-button', kind: 'text-on-accent' },
  { label: 'toolbar tool icon (resting)', selector: '.tlui-main-toolbar__tools .tlui-button__tool:not([aria-pressed="true"])', kind: 'icon' },
  { label: 'toolbar tool icon (active)', selector: '.tlui-main-toolbar__tools .tlui-button__tool[aria-pressed="true"]', kind: 'icon', pseudo: '::after' },
  { label: 'Block tool button', selector: '[data-testid="systemsketch-tool-block"]', kind: 'icon' },
  { label: 'utility strip button', selector: '.systemsketch-utility-strip .tlui-button', kind: 'icon' },
  { label: 'inspector active tab', selector: '.block-inspector__tabs > [role="tab"].is-active', kind: 'text' },
  { label: 'inspector section title', selector: '.block-inspector__section-title', kind: 'text' },
  { label: 'inspector field label', selector: '.block-inspector__field > span', kind: 'text' },
  { label: 'inspector input text', selector: '.block-inspector__section input:not([disabled])', kind: 'text' },
  { label: 'inspector input boundary', selector: '.block-inspector__section input:not([disabled])', kind: 'boundary' },
  { label: 'selection pill count', selector: '.systemsketch-selection-menu[data-visible="true"] .systemsketch-selection-count, .systemsketch-selection-menu[data-visible="true"] .block-mini-menu__count', kind: 'text', optional: true },
  { label: 'selection pill button', selector: '.systemsketch-selection-menu[data-visible="true"] .block-mini-menu button, .systemsketch-selection-menu[data-visible="true"] .systemsketch-selection-action', kind: 'text' },
  { label: 'Block heading on the canvas', selector: '.systemsketch-block-canvas .BlockNode-headingTitle, .systemsketch-block-canvas .BlockNode-simpleTitleText', kind: 'text' },
  { label: 'left popout header', selector: '.systemsketch-popout--left .systemsketch-popout__header h2', kind: 'text', optional: true },
]

const DIALOG_PROBES = [
  { label: 'main menu item (tldraw menu)', selector: '[data-testid="main-menu.settings"]', kind: 'text', phase: 'menu' },
  { label: 'settings heading', selector: '.systemsketch-settings__intro h2', kind: 'text' },
  { label: 'settings body copy', selector: '.systemsketch-settings__intro p', kind: 'text' },
  { label: 'settings active category', selector: '.systemsketch-settings__nav button.is-active', kind: 'text' },
  { label: 'settings inactive category', selector: '.systemsketch-settings__nav button:not(.is-active):not(:disabled)', kind: 'text' },
  { label: 'theme option label (active)', selector: '.systemsketch-theme-option.is-active .systemsketch-theme-option__label', kind: 'text' },
  { label: 'theme option detail', selector: '.systemsketch-theme-option:not(.is-active) .systemsketch-theme-option__detail', kind: 'text' },
  { label: 'Import button', selector: '.systemsketch-settings__import', kind: 'text' },
  { label: 'dialog close button icon', selector: '.systemsketch-settings__header .tlui-button', kind: 'icon' },
]

const THEMES = [
  { id: 'systemsketch:light', label: 'Light', choice: { kind: 'systemsketch', scheme: 'light' }, scheme: 'light', theme: 'systemsketch' },
  { id: 'systemsketch:dark', label: 'Dark', choice: { kind: 'systemsketch', scheme: 'dark' }, scheme: 'dark', theme: 'systemsketch' },
  ...BUILT_IN_PALETTES.map((palette) => ({
    id: palette.id,
    label: palette.label,
    choice: { kind: 'palette', id: palette.id },
    scheme: palette.scheme,
    theme: 'palette',
    canvas: palette.tokens.surface,
  })),
]

const results = { ranAt: new Date().toISOString(), themes: [], checks: [], importer: null }
const checks = []
function pass(label) {
  checks.push({ label, ok: true })
  process.stdout.write(`  PASS  ${label}\n`)
}
function fail(label, detail) {
  checks.push({ label, ok: false, detail })
  process.stdout.write(`  FAIL  ${label}\n        ${detail}\n`)
}

/** The colour parser and compositor, run inside the page. */
const CONTRAST_SCRIPT = `
  const parseColor = (text) => {
    if (!text) return null
    let match = text.match(/^rgba?\\(([^)]+)\\)$/)
    if (match) {
      const parts = match[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number)
      return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts.length > 3 ? parts[3] : 1 }
    }
    match = text.match(/^color\\(srgb ([^)]+)\\)$/)
    if (match) {
      const parts = match[1].split(/[\\s\\/]+/).filter(Boolean).map(Number)
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
    }
    return null
  }
  const over = (top, below) => {
    const a = top.a + below.a * (1 - top.a)
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const mix = (c) => (top[c] * top.a + below[c] * below.a * (1 - top.a)) / a
    return { r: mix('r'), g: mix('g'), b: mix('b'), a }
  }
  const effectiveBackground = (element, pseudo) => {
    let stack = { r: 0, g: 0, b: 0, a: 0 }
    let node = element
    let first = true
    while (node && node !== document) {
      const style = first && pseudo ? getComputedStyle(node, pseudo) : getComputedStyle(node)
      first = false
      const color = parseColor(style.backgroundColor)
      if (color && color.a > 0) stack = over(stack, color)
      if (stack.a >= 0.999) break
      node = node.parentElement
    }
    return over(stack, { r: 1, g: 1, b: 1, a: 1 })
  }
  const luminance = ({ r, g, b }) => {
    const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const ratio = (fg, bg) => {
    const composed = over(fg, bg)
    const [light, dark] = [luminance(composed), luminance(bg)].sort((a, b) => b - a)
    return (light + 0.05) / (dark + 0.05)
  }
  const hex = ({ r, g, b, a }) => '#' + [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('') + (a < 1 ? ' @ ' + a.toFixed(2) : '')
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
  }
  const probe = ({ selector, kind, pseudo }) => {
    const element = [...document.querySelectorAll(selector)].find(visible)
    if (!element) return { found: false }
    const style = getComputedStyle(element)
    const fg = parseColor(kind === 'boundary' ? style.borderTopColor : style.color)
    if (!fg) return { found: true, error: 'unparseable colour ' + (kind === 'boundary' ? style.borderTopColor : style.color) }
    const bg = kind === 'boundary'
      ? effectiveBackground(element)
      : effectiveBackground(element, pseudo)
    return { found: true, fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio(fg, bg) * 100) / 100, text: (element.textContent || '').trim().slice(0, 40) }
  }
`

async function measure(page, probes) {
  return evaluate(page, `(() => { ${CONTRAST_SCRIPT}; return JSON.stringify(${JSON.stringify(probes)}.map((item) => ({ ...item, ...probe(item) }))) })()`)
    .then((text) => JSON.parse(text))
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
  return `docs/assets/${name}`
}

async function rootState(page) {
  return evaluate(page, `(() => {
    const root = document.querySelector('[data-testid="systemsketch-theme-root"]')
    const container = document.querySelector('.tl-container')
    const background = document.querySelector('.tl-background')
    return JSON.stringify({
      theme: root?.dataset.ssTheme ?? null,
      scheme: root?.dataset.ssColorScheme ?? null,
      tldrawDark: Boolean(container?.classList.contains('tl-theme__dark')),
      canvas: background ? getComputedStyle(background).backgroundColor : null,
      htmlStillStamped: document.documentElement.hasAttribute('data-ss-theme'),
      inlineSurface: root?.style.getPropertyValue('--ss-surface') || null,
    })
  })()`).then((text) => JSON.parse(text))
}

/** `#1f1f1f` → `rgb(31, 31, 31)`, the way Chrome serialises a computed colour. */
function expectedCanvas(hex) {
  const digits = hex.replace('#', '')
  const wide = digits.length === 3 ? digits.split('').map((d) => d + d).join('') : digits
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(wide.slice(offset, offset + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

async function setStoredTheme(page, theme) {
  await evaluate(page, `localStorage.setItem('systemsketch.theme.v1', ${JSON.stringify(JSON.stringify({ version: 1, choice: theme.choice, scheme: theme.scheme }))})`)
}

async function waitForApp(page) {
  await waitFor(page, `document.querySelector('.tl-container') && document.querySelector('[data-testid="systemsketch-theme-root"]')`, 'the app root')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-tool-block"]')`, 'the toolbar')
  await delay(400)
}

async function selectBlock(page) {
  const block = await box(page, '.systemsketch-block-canvas')
  await clickAt(page, block.cx, block.y + 30)
  await waitFor(page, `document.querySelector('.systemsketch-selection-menu[data-visible="true"]')`, 'the selection pill')
  await waitFor(page, `document.querySelector('[data-surface="inspector"] .block-inspector')`, 'the inspector')
  await delay(250)
}

async function openSettings(page) {
  const trigger = await box(page, '[data-testid="main-menu.button"]')
  await clickAt(page, trigger.cx, trigger.cy)
  await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'the Settings item')
  await delay(120)
}

async function chooseSettingsItem(page) {
  const item = await box(page, '[data-testid="main-menu.settings"]')
  await clickAt(page, item.cx, item.cy)
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the Settings dialog')
  const appearance = await box(page, '[data-testid="systemsketch-settings-category-appearance"]')
  await clickAt(page, appearance.cx, appearance.cy)
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-theme-list"]')`, 'the theme list')
  await delay(200)
}

async function closeDialog(page) {
  // The dialog's own close button, not Escape: after the file input has taken
  // the focus, Radix no longer hears the key, and a person would click anyway.
  const close = await box(page, '.systemsketch-settings__header .tlui-button')
  await clickAt(page, close.cx, close.cy)
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'the dialog to close')
  await delay(150)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'theme-contrast', build: 'theme-contrast-smoke' })
  const { page, port } = app
  let failed = false
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'theme-contrast.systemsketch')
    const query = `?board=${encodeURIComponent(board)}`

    // The page served has the pre-paint stamp, so a dark theme never opens white.
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text()
    if (html.includes('data-ss-prepaint') && html.includes('systemsketch.theme.v1')) pass('index.html carries the pre-paint theme stamp')
    else fail('index.html carries the pre-paint theme stamp', 'script missing from the served page')

    await openApp(page, port, query)
    await waitForApp(page)
    await drawBlock(page, { x: 480, y: 360 }, { x: 860, y: 600 }, 'Theme probe')
    await delay(300)

    // 1. The picker switches the theme live, no reload.
    await openSettings(page)
    const menuProbe = (await measure(page, DIALOG_PROBES.filter((item) => item.phase === 'menu')))[0]
    await chooseSettingsItem(page)
    const before = await rootState(page)
    const option = await box(page, '[data-testid="systemsketch-theme-option-dark-modern"]')
    await clickAt(page, option.cx, option.cy)
    await delay(400)
    const after = await rootState(page)
    const darkModern = BUILT_IN_PALETTES.find((palette) => palette.id === 'dark-modern')
    const live = before.theme === 'systemsketch' && before.scheme === 'light' && !before.tldrawDark
      && after.theme === 'palette' && after.scheme === 'dark' && after.tldrawDark
      && after.canvas === expectedCanvas(darkModern.tokens.surface)
      && after.inlineSurface === darkModern.tokens.surface
    if (live) pass(`the picker switches Light → Dark Modern live: root palette/dark, tldraw dark class, canvas ${after.canvas}`)
    else fail('the picker switches Light → Dark Modern live', JSON.stringify({ before, after }))
    if (!after.htmlStillStamped) pass('the pre-paint stamp on <html> is released once the app root owns the theme')
    else fail('the pre-paint stamp on <html> is released once the app root owns the theme', 'html still carries data-ss-theme')
    await shot(page, 'theme-picker-dark-modern.png')

    // 2. Importing a VS Code theme through the real file input.
    const importPath = IMPORT_CANDIDATES.find((candidate) => existsSync(candidate))
    if (importPath) {
      const text = await readFile(importPath, 'utf8')
      const theme = parseVsCodeThemeText(text)
      const scheme = vsCodeThemeScheme(theme)
      const expected = vsCodeThemeTokens(theme.colors ?? {}, scheme).tokens
      const { root } = await page.send('DOM.getDocument', { depth: 1 })
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-testid="systemsketch-theme-import"]' })
      await page.send('DOM.setFileInputFiles', { files: [importPath], nodeId })
      await waitFor(page, `document.querySelector('[data-testid="systemsketch-theme-import-message"]')`, 'the import message')
      await delay(400)
      const imported = await rootState(page)
      const importState = await evaluate(page, `JSON.stringify({
        message: document.querySelector('[data-testid="systemsketch-theme-import-message"]')?.textContent ?? '',
        option: [...document.querySelectorAll('.systemsketch-theme-option.is-active .systemsketch-theme-option__label')].map((n) => n.textContent)[0] ?? null,
        stored: localStorage.getItem('systemsketch.imported-themes.v1'),
      })`).then((value) => JSON.parse(value))
      const storedPalettes = JSON.parse(importState.stored ?? '{"palettes":[]}').palettes
      const storedTokens = storedPalettes[0]?.tokens
      const tokensMatch = storedTokens && Object.keys(expected).every((name) => storedTokens[name] === expected[name])
      const ok = imported.theme === 'palette' && imported.scheme === scheme
        && imported.canvas === expectedCanvas(expected.surface) && tokensMatch
        && imported.tldrawDark === (scheme === 'dark')
      results.importer = {
        file: importPath, name: theme.name ?? null, scheme, expectedSurface: expected.surface,
        canvas: imported.canvas, message: importState.message, option: importState.option, tokensMatch: Boolean(tokensMatch),
      }
      if (ok) pass(`importing ${theme.name} through the file input yields the mapping's own tokens and a ${scheme} board (${imported.canvas})`)
      else fail(`importing ${theme.name} through the file input`, JSON.stringify({ imported, importState: { ...importState, stored: undefined }, expectedSurface: expected.surface }))
      await shot(page, 'theme-picker-imported.png')
      // Leave the imported theme in place for the sweep? No — the sweep is the shipped set.
      await evaluate(page, `localStorage.removeItem('systemsketch.imported-themes.v1')`)
    } else {
      fail('importing a VS Code theme through the file input', 'no light_modern.json on this machine')
    }
    await closeDialog(page)
    results.menuProbe = menuProbe

    // 3. The sweep: every shipped theme, measured.
    for (const theme of THEMES) {
      await setStoredTheme(page, theme)
      await page.send('Page.reload')
      await waitForApp(page)
      const state = await rootState(page)
      const entry = { id: theme.id, label: theme.label, scheme: theme.scheme, state, probes: [], screenshots: [] }
      results.themes.push(entry)

      const stateOk = state.theme === theme.theme && state.scheme === theme.scheme && state.tldrawDark === (theme.scheme === 'dark')
        && (!theme.canvas || state.canvas === expectedCanvas(theme.canvas))
      if (stateOk) pass(`${theme.label}: root ${state.theme}/${state.scheme}, tldraw ${state.tldrawDark ? 'dark' : 'light'}, canvas ${state.canvas}`)
      else fail(`${theme.label}: root, tldraw class and canvas colour`, JSON.stringify({ state, expected: theme }))

      await selectBlock(page)
      const probes = await measure(page, PROBES)
      entry.screenshots.push(await shot(page, `theme-${theme.id.replace(':', '-')}.png`))

      await openSettings(page)
      const menu = await measure(page, DIALOG_PROBES.filter((item) => item.phase === 'menu'))
      await chooseSettingsItem(page)
      const dialog = await measure(page, DIALOG_PROBES.filter((item) => item.phase !== 'menu'))
      entry.screenshots.push(await shot(page, `theme-${theme.id.replace(':', '-')}-settings.png`))
      await closeDialog(page)

      for (const probe of [...probes, ...menu, ...dialog]) {
        const threshold = THRESHOLDS[probe.kind]
        const record = { label: probe.label, selector: probe.selector, kind: probe.kind, threshold, ...probe }
        delete record.phase
        entry.probes.push(record)
        if (!probe.found) {
          if (probe.optional) continue
          fail(`${theme.label}: ${probe.label}`, `nothing visible matches ${probe.selector}`)
          continue
        }
        if (probe.error) { fail(`${theme.label}: ${probe.label}`, probe.error); continue }
        record.ok = probe.ratio >= threshold
        if (record.ok) pass(`${theme.label}: ${probe.label} ${probe.ratio}:1 (≥ ${threshold}) ${probe.fg} on ${probe.bg}`)
        else fail(`${theme.label}: ${probe.label} ${probe.ratio}:1 < ${threshold}:1`, `${probe.fg} on ${probe.bg} "${probe.text}"`)
      }
    }

    const errors = localConsoleErrors(page)
    if (errors.length === 0) pass('no console errors from the app during the sweep')
    else fail('no console errors from the app during the sweep', errors.join(' | '))
  } catch (error) {
    failed = true
    fail('journey', error instanceof Error ? error.stack ?? error.message : String(error))
  } finally {
    results.checks = checks
    results.passed = checks.filter((check) => check.ok).length
    results.failed = checks.filter((check) => !check.ok).length
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    app.close()
  }
  process.stdout.write(`\n${results.passed} passed, ${results.failed} failed → ${RESULTS.replace(`${ROOT}/`, '')}\n`)
  if (failed || results.failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
