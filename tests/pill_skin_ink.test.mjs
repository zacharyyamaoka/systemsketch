import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// WHY this test lives in `tests/` rather than beside the CSS it reads: vitest
// runs with `css: false`, so a `./pillSkins.css?raw` import resolves through
// Vite's CSS pipeline and comes back as an empty stub — the assertions all
// pass vacuously. Reading the real bytes needs `node:fs`, which
// `tsconfig.app.json` (types: vite/client + vitest/globals, include: src)
// deliberately does not type, so the file belongs on this side of the line
// with the rest of the repo's filesystem-aware test code.
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (relativePath) => readFileSync(join(REPO_ROOT, relativePath), 'utf8')

const appearanceCss = read('src/appearance/appearance.css')
const pillSkinsCss = read('src/appearance/pillSkins.css')
const chromeCss = read('src/chrome/systemsketch-chrome.css')
const codeBlockCss = read('src/code/code-block.css')
const wrapSelectionCss = read('src/frames/wrap-selection.css')
const propagationFocusCss = read('src/propagation/propagation-focus.css')

/**
 * The Pill lab skins (pillSkins.css) repaint the selection pill's surface.
 * Anything drawn ON that surface therefore has to read the skin's own ink
 * token, and any ink drawn on the skin's ACCENT has to read the skin's
 * on-accent ink. Both rules were broken in ways nothing caught:
 *
 *  - the Wrap trigger, the propagation-focus controls and the Code width row
 *    painted `var(--ss-text-inverse)` — fixed white — so under the four light
 *    skins the glyph, its label and its chevron went white-on-white (measured
 *    1.00:1 against skin 3, 1.04-1.14:1 against skins 1/2/4 in a real browser);
 *  - the CHOSEN cell in every appearance popover sits on the accent rather than
 *    the surface, but still inherited the surface's ink — 1.00:1 in Ink Mono,
 *    whose accent IS its ink, and 1.69/2.69/2.73:1 in the other three.
 *
 * These are contrast facts, not snapshots, so they stay true if a skin's
 * palette is retuned — they only fail if a skin becomes illegible again.
 */

const SKIN_NAMES = {
  '1': 'Ink Mono',
  '2': 'Soft Elevation',
  '3': 'High Contrast Outline',
  '4': 'Warm Paper',
  '5': 'Dark Compact',
}

/** The `--systemsketch-pill-*` declarations inside one skin's rule block. */
function readSkinTokens(css, skinId) {
  const block = new RegExp(
    `\\.systemsketch-app\\[data-ss-pill-skin='${skinId}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`,
  ).exec(css)
  if (!block) throw new Error(`pillSkins.css has no rule block for skin ${skinId}`)
  const tokens = new Map()
  for (const [, name, value] of block[1].matchAll(/(--systemsketch-pill-[\w-]+):\s*([^;]+);/g)) {
    tokens.set(name, value.trim())
  }
  return tokens
}

function relativeLuminance(hex) {
  const digits = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const skinIds = Object.keys(SKIN_NAMES)

describe('every Pill lab skin stays legible', () => {
  it('all five skins declare the same token set — a token added to one is added to all', () => {
    const perSkin = skinIds.map((id) => [...readSkinTokens(pillSkinsCss, id).keys()].sort())
    for (const names of perSkin) expect(names).toEqual(perSkin[0])
  })

  it.each(skinIds)('skin %s reads its own body ink against its own surface', (skinId) => {
    const tokens = readSkinTokens(pillSkinsCss, skinId)
    const ratio = contrastRatio(tokens.get('--systemsketch-pill-ink'), tokens.get('--systemsketch-pill-surface'))
    expect(ratio, `${SKIN_NAMES[skinId]}: ink on surface is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })

  /**
   * The regression that shipped: a chosen option's content sits on the accent,
   * not the surface, so `--systemsketch-pill-ink` is the WRONG ink there. 3:1
   * is the threshold for icons and other non-text graphics; every skin clears
   * it by a wide margin, so a failure here means a palette change actually
   * made the selected value invisible again.
   */
  it.each(skinIds)('skin %s reads its on-accent ink against BOTH accents', (skinId) => {
    const tokens = readSkinTokens(pillSkinsCss, skinId)
    const onAccentInk = tokens.get('--systemsketch-pill-accent-ink')
    expect(onAccentInk, `${SKIN_NAMES[skinId]} declares no --systemsketch-pill-accent-ink`).toBeDefined()
    for (const accentToken of ['--systemsketch-pill-accent', '--systemsketch-pill-accent-radio']) {
      const ratio = contrastRatio(onAccentInk, tokens.get(accentToken))
      expect(ratio, `${SKIN_NAMES[skinId]}: accent ink on ${accentToken} is ${ratio.toFixed(2)}:1`)
        .toBeGreaterThanOrEqual(3)
    }
  })
})

/**
 * Stylesheets whose rules paint onto the pill bar or one of its popovers.
 * A surface that supplies its OWN inverse background (the rich-text toolbar,
 * the Code resize HUD, the workspace and recorder panels) is internally
 * consistent and deliberately absent — a skin never repaints those.
 */
const PILL_SURFACE_STYLESHEETS = [
  ['src/appearance/appearance.css', appearanceCss],
  ['src/chrome/systemsketch-chrome.css', chromeCss],
  ['src/code/code-block.css', codeBlockCss],
  ['src/frames/wrap-selection.css', wrapSelectionCss],
  ['src/propagation/propagation-focus.css', propagationFocusCss],
]

describe('nothing on the pill surface hardcodes an ink the skin cannot move', () => {
  it.each(PILL_SURFACE_STYLESHEETS)('%s routes every inverse ink through --systemsketch-pill-ink', (path, css) => {
    // A rule that paints the fixed-white inverse ink is only a bug when it
    // draws on somebody ELSE's surface — a rule supplying its own opaque
    // background (the named-landmarks Save button on `--ss-accent`, say) is
    // internally consistent and no skin repaints it. `transparent` is not a
    // surface, which is exactly how the Wrap trigger got caught.
    const offenders = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector.trim().split('\n').pop().trim(), body }))
      .filter(({ body }) =>
        /color:[^;]*--ss-text-inverse/.test(body)
        && !/color:[^;]*--systemsketch-pill-ink/.test(body))
      .filter(({ body }) => {
        const background = /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1].trim()
        return !background || background === 'transparent' || background === 'none'
      })
      .map(({ selector }) => selector)
    expect(offenders, `${path} paints ink onto a skinned surface that the Pill lab cannot move`)
      .toEqual([])
  })

  it('the Wrap trigger — the control that actually vanished — reads the pill ink', () => {
    expect(wrapSelectionCss).toMatch(/\.systemsketch-wrap__trigger\s*\{[\s\S]*?color:\s*var\(--systemsketch-pill-ink,/)
  })

  /**
   * The invariant both halves of this bug violated, stated once: a chosen
   * option's ink must match the surface that rule actually paints on. Fill the
   * cell with the accent and it needs the on-accent ink; take the fill back off
   * (the Typeface / Font size lists, which FigJam marks with a check alone) and
   * the ink has to go back to the panel ink with it. Fixing only the first half
   * is what made "Scribbled" and "Medium" vanish under Dark Compact.
   */
  it('a chosen appearance option inks itself for the surface it actually sits on', () => {
    const chosenRules = [...appearanceCss.matchAll(/([^{}]*\[aria-checked='true'\][^{}]*)\{([^}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector.trim().split('\n').pop().trim(), body }))
      .map(({ selector, body }) => ({
        selector,
        body,
        background: /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1].trim(),
      }))

    const accentFilled = chosenRules.filter(({ background }) =>
      background?.startsWith('var(--systemsketch-pill-accent'))
    expect(accentFilled.length, 'no accent-filled chosen rule found — did the selector change?')
      .toBeGreaterThan(0)
    for (const { selector, body } of accentFilled) {
      expect(body, `${selector} fills with the accent, so it must ink with --systemsketch-pill-accent-ink`)
        .toMatch(/color:\s*var\(--systemsketch-pill-accent-ink,/)
    }

    const unfilled = chosenRules.filter(({ background }) =>
      background === 'transparent' || background === 'none')
    expect(unfilled.length, 'no un-filled chosen rule found — did the list layout change?')
      .toBeGreaterThan(0)
    for (const { selector, body } of unfilled) {
      expect(body, `${selector} takes the fill back off the accent, so its ink must return to --systemsketch-pill-ink`)
        .toMatch(/color:\s*var\(--systemsketch-pill-ink,/)
    }
  })
})
