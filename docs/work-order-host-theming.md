# Work order — one token layer, so SystemSketch can wear a host's theme

**For:** the agent picking up theming. **Repo:** `~/systemsketch`, branch off `main`.
**Written:** 2026-09-01, from measurements taken on that tree — re-measure before trusting a
number below.

---

## The problem, stated exactly

SystemSketch's chrome is authored light-only. **666 colour literals across 14 stylesheets**
(`find src -name '*.css' | xargs grep -ohE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\('`), against
about 110 references to tldraw's own tokens. So the palette is half-migrated already, and the
half that is still hardcoded is the half that breaks.

You can see it break today. The VS Code plugin carries the host's light/dark choice all the
way to the canvas — `EmbedAppearanceMessage` → `data-embed-color-scheme` on the app root — and
then deliberately refuses to act on it, in `src/embed/EmbeddedCanvas.tsx`:

```ts
useEffect(() => {
  editorRef.current?.user.updateUserPreferences({ colorScheme: 'light' })
}, [colorScheme, openDocument])
```

Passing `colorScheme` there instead of `'light'` works — it was measured working in VS Code's
dark workbench, tldraw repaints, the toolbar goes dark. What also happens is that
`.systemsketch-popout__header` keeps `color: #272b32` and `border-bottom: 1px solid #eceef1`
(`src/chrome/systemsketch-chrome.css:129,159`), so the inspector renders its title in near-black
on near-black. That one line is the whole job in miniature.

**Goal:** SystemSketch looks right in light and dark, and can additionally take its palette
*from its host* — VS Code today, Obsidian when that plugin exists — without any stylesheet
learning what a host is.

---

## Architecture: three layers, and the middle one is the whole idea

### Layer 1 — a closed vocabulary (`src/theme/tokens.css`)

Every SystemSketch stylesheet may reference **only** these. Semantic names, never values, and
deliberately few: a vocabulary you can hold in your head is one that gets used correctly.

| Token | What it names |
|---|---|
| `--ss-surface` | the pane behind everything |
| `--ss-surface-raised` | a panel, popout, menu, or toolbar sitting on it |
| `--ss-surface-sunken` | an input, well, or pressed state |
| `--ss-surface-hover` / `--ss-surface-active` | pointer feedback on a control |
| `--ss-text` / `--ss-text-muted` / `--ss-text-faint` | primary, secondary, tertiary copy |
| `--ss-border` / `--ss-border-strong` | a divider, and an outline you are meant to notice |
| `--ss-accent` / `--ss-accent-text` | selection and focus, and legible text on it |
| `--ss-danger` / `--ss-warning` | destructive and cautionary states |
| `--ss-shadow-1` / `--ss-shadow-2` | a resting panel, and a floating one |

Add a token only when two call sites genuinely need the same new meaning. A one-off is a sign
the design, not the vocabulary, needs the decision.

### Layer 2 — themes supply values, and nothing else

One CSS block per theme, keyed on an attribute:

```css
/* The default: derive from tldraw, so the chrome cannot disagree with the board. */
[data-ss-theme="systemsketch"] {
  --ss-surface:        var(--tl-color-background);
  --ss-surface-raised: var(--tl-color-panel);
  --ss-text:           var(--tl-color-text-1);
  --ss-text-muted:     var(--tl-color-text-3);
  --ss-border:         var(--tl-color-divider);
  --ss-accent:         var(--tl-color-selected);
  --ss-shadow-1:       var(--tl-shadow-1);
  /* … */
}

[data-ss-theme="vscode"] {
  --ss-surface:        var(--vscode-editor-background);
  --ss-surface-raised: var(--vscode-editorWidget-background);
  --ss-text:           var(--vscode-editor-foreground);
  --ss-text-muted:     var(--vscode-descriptionForeground);
  --ss-border:         var(--vscode-panel-border);
  --ss-accent:         var(--vscode-focusBorder);
  /* … */
}
```

**Deriving the default from tldraw is the load-bearing choice.** The chrome renders *inside*
`.tl-container`, so `--tl-*` already resolves for it — SystemSketch references those tokens in
about 110 places today and they work. tldraw already has a complete, well-named, professionally
tuned light and dark palette (`--tl-color-panel`, `--tl-color-text-1`, `--tl-color-text-3`,
`--tl-color-divider`, `--tl-color-selected`, `--tl-shadow-1..4`; read `.tl-theme__light` and
`.tl-theme__dark` in `node_modules/tldraw/tldraw.css`). Inventing a second palette means two
palettes to keep in agreement forever, and the board and the panel sitting on it are exactly
where a disagreement shows.

**No theme needs a light/dark branch.** Every value source already carries the scheme:
tldraw's tokens flip with `.tl-theme__light` / `.tl-theme__dark`, and `--vscode-*` is already
dark in a dark workbench. `data-ss-color-scheme` exists only for the handful of *derived*
values that genuinely differ — an overlay's alpha, a shadow's opacity. If you find yourself
writing a scheme branch for a plain colour, the token is wrong, not the theme.

### Layer 3 — one place decides which theme is on

The app root, and nowhere else. Both inputs already exist and are unused for this:

- `EmbedHostBridge.host` in `src/embed/embedProtocol.ts` — the VS Code extension already sends
  `host: 'vscode'` (see the bridge script in `vscode-systemsketch/src/extension.ts`).
- `EmbedAppearanceMessage.colorScheme` — already delivered on open and on every theme change.

So: standalone → `data-ss-theme="systemsketch"`; embedded → `data-ss-theme={bridge.host}` with
a fallback to `"systemsketch"` for an unknown host, which must degrade to a correct-looking app
rather than an unstyled one. Write that fallback deliberately; it is what makes the Obsidian
plugin a one-file addition later rather than a second migration.

---

## What NOT to theme

**Document content is not chrome.** A Block's colour, a port's type colour
(`portColor()` in `src/blocks/ui/BlockCanvas.tsx`), the FigJam swatches in
`src/appearance/figjamTokens.ts` and `appearance.css` — these are choices a person made and
saved into the file. They must render identically in every host and every scheme, or a board
means something different depending on who opens it. Leave them as literals and exclude them
from the lint below.

Same for `src/blocks/ui/hit-area-overlay.css`: its reds are a debug instrument, compiled out
of released builds. Exclude it.

The honest split is roughly: **chrome** = `chrome/`, `toolbar/`, `settings/`, `depth/`,
`workspace/`, `embed/`, `systemsketch-utilities.css`, `app.css`, `block-inspector.css`,
`on-canvas-block-picker.css`; **content** = `appearance/`, `hit-area-overlay.css`, and the
colour-bearing parts of `block-canvas.css`. Verify that split yourself before trusting it —
`block-canvas.css` is genuinely mixed and is the one file that needs judgment rather than a
rule.

---

## Increments — each one shippable, each one runnable

Do not build a rung you cannot run. Each of these ends with the app driven and looked at.

**1 · Tokens, the switch, and the chrome that actually breaks.**
Create `src/theme/tokens.css` and the `systemsketch` theme. Migrate only
`chrome/systemsketch-chrome.css` (84 literals — the invisible header lives here),
`toolbar/systemsketch-toolbar.css` (39) and `embed/embed.css` (8). Flip `EmbeddedCanvas` to
pass the real `colorScheme`. Drive VS Code in a dark theme and look at the inspector.
*Done when:* the popout header is legible in dark, and `npm run plugin:test`'s theme check has
been updated from its deliberate pin (`painted: false`) to `painted: workbenchIsDark`.

**2 · The rest of the chrome.** `systemsketch-utilities.css` (182 literals — the largest
single file), `workspace/local-workspace.css` (65), `blocks/ui/block-inspector.css` (88),
`settings/interface-settings.css` (32), `depth/depth-stack-navigator.css` (37),
`development/development-preview.css` (17), `on-canvas-block-picker.css` (9), `app.css` (2).
*Done when:* the lint test below is green with an allowlist containing only content files.

**3 · The VS Code theme.** Add `[data-ss-theme="vscode"]` and select it from `bridge.host`.
*Done when:* the plugin's chrome matches the workbench in both a light and a dark VS Code
theme, captured side by side.

**4 · Obsidian, when its plugin exists.** One more block mapping to `--background-primary`,
`--background-secondary`, `--text-normal`, `--text-muted`, `--background-modifier-border`,
`--interactive-accent`. Do not write this speculatively — verify each variable against a
running Obsidian rather than trusting this list, the same way you would verify the VS Code
names against a running workbench.

---

## Enforcement — two gates, because "looks fine" is not a check

**A lint test, in `tests/` beside `test_stock_boundary.py`.** Scan `src/**/*.css`; fail on any
colour literal outside `src/theme/`, with an explicit allowlist of content files and a comment
on each entry saying why it is content rather than chrome. This is the gate that stops the
migration silently regressing one file at a time.

**A contrast journey**, in the `tests/*_smoke.mjs` pattern using `browser_harness.mjs`. Drive
the real app in both schemes, and for each piece of chrome that carries text —
popout header, inspector labels, toolbar buttons, selection menu, depth navigator — read the
computed foreground and background off the live element and compute the WCAG contrast ratio.
Assert ≥ 4.5:1 for body text, ≥ 3:1 for large text and borders.

Make that ratio the acceptance criterion, not a screenshot review. It is an oracle independent
of the CSS that produced it, it is the exact thing that failed here, and it would have caught
the invisible header the moment dark mode was switched on. Mutation-test it: hardcode one
header back to `#272b32`, confirm the journey goes red, then restore.

---

## Traps found while building the plugin

**`--tl-color-text-2` does not exist.** SystemSketch references it 8 times, in
`blocks/ui/block-inspector.css` and `blocks/ui/block-canvas.css`. tldraw defines `text-0`,
`text-1`, `text-3` and no `text-2` — grep all of `node_modules/@tldraw/` and confirm. Those
declarations resolve to nothing today and inherit whatever is above them. Fix them as part of
increment 2; do not carry the typo into a token.

**The chrome is inside `.tl-container`, so `--tl-*` resolves — but check before you rely on
it.** Anything portalled to `document.body` (a Radix popover, a dialog) escapes the themed
container and gets nothing. Put the `data-ss-theme` attribute somewhere that covers those too,
or explicitly re-declare on the portal root.

**Existing `--systemsketch-*` variables are geometry, not colour**, and are defined ad hoc in
three files (`chrome/systemsketch-chrome.css`, `settings/interface-settings.css`,
`blocks/ui/on-canvas-block-picker.css`). `--systemsketch-panel-border`, `-panel-shadow` and
`-panel-radius` are the exceptions and should fold into the new tokens. Move the geometry ones
into `src/theme/` too while you are there — one place for the whole design surface.

**Interface scale uses CSS `zoom` on the surface layer**, and `zoom` establishes a new
coordinate scale. Three surfaces are exempted from it because they position from the camera
(see the scale notes in `SYSTEMSKETCH_CHANGELOG.md` and `npm run test:scale`). Theming does not
interact with that — but if you touch the surface layer's CSS, re-run `npm run test:scale`, it
is the test that catches it.

**The stock boundary test will notice you.** `tests/test_stock_boundary.py` asserts the
embedded composition and the host-import seam. Adding a theme provider to `EmbeddedCanvas` is
fine; adding a second canvas or a new import path out of `src/embed/sharedWithHost.ts` is not.

---

## Definition of done

- `src/theme/tokens.css` is the only place in `src/` with a chrome colour literal, enforced by
  a test with a commented allowlist.
- The app is legible in light and dark, proved by measured contrast ratios in a browser
  journey, not by a screenshot review — and that journey has been mutation-tested red.
- `npm run plugin:test` is green with the theme check asserting the board follows the host,
  and both captures in the report show a dark workbench with a dark, legible pane.
- Adding a host is one CSS block and one string, demonstrated by the VS Code theme, with a
  documented fallback for a host nobody has written a theme for yet.
- `npm run check` green; the report at `docs/build_ide_plugin_and_goldens.py` rebuilt so its
  "the board stays light on purpose" section is replaced by what actually shipped.
