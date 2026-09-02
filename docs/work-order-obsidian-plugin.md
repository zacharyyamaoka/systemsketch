# Work order — the Obsidian plugin, on the seam the VS Code one already proved

**For:** the agent picking this up. **Repo:** `~/systemsketch`, branch off `main`.
**Written:** 2026-09-02, from measurements on `4c1c33b`. Re-measure before trusting a number.

**Why this one:** the theming lane shipped `src/theme/palettes/obsidian.ts` — a full Obsidian
palette, generated from the real Obsidian 1.13.7 `app.css` — and `KNOWN_HOST_THEMES` already
reads `['vscode', 'obsidian']`. There is a theme waiting for a host that does not exist. The
other open unit is migrating the twelve legacy golden boards to tldraw documents; that is
deliberately *not* this order, and Zach has deferred it.

---

## What you are building

`obsidian-systemsketch/` beside `vscode-systemsketch/` in this repo, so opening a
`.systemsketch` or `.tldr` in a vault shows the SystemSketch canvas in an Obsidian tab, wearing
Obsidian's own colours, saving through Obsidian.

Read [`docs/work-order-host-theming.md`](work-order-host-theming.md) and
[`vscode-systemsketch/README.md`](../vscode-systemsketch/README.md) first. The second one is
the thing you are doing again for a different host, and most of its decisions carry over
unchanged.

---

## Most of this is already built

Do not rebuild any of it. The VS Code plugin was written so the *second* host would be small.

| Already there | Where |
|---|---|
| The whole host seam — document handoff, versioning, stale-edit refusal, external reload | `src/embed/` |
| The import contract a host may reach through | `src/embed/sharedWithHost.ts` |
| Host → theme resolution, already naming Obsidian | `resolveHostTheme()`, `KNOWN_HOST_THEMES` in `src/theme/themeModel.ts` |
| The Obsidian palette, light and dark | `src/theme/palettes/obsidian.ts` (generated — regenerate with `scripts/extract_obsidian_palette.py`, never hand-edit) |
| The `.systemsketch` envelope and suffix rules | `src/workspace/systemSketchFile.ts`, `workspaceModel.ts` |
| A working Obsidian plugin to lift plumbing from | `~/pyblocks/obsidian-systemsketch/src/` — 630 lines |
| A real-host e2e harness | `~/pyblocks/obsidian-systemsketch/tests/obsidian_tldraw_e2e.mjs` — isolated profile under Xvfb |

`EmbeddedCanvas` already does this, today, with no change needed:

```ts
const hostTheme = resolveHostTheme(bridge?.host)   // 'obsidian' → the Obsidian palette
…
data-ss-theme={hostTheme}
data-ss-color-scheme={colorScheme}
```

So a host that declares `host: 'obsidian'` on its bridge and sends one `appearance` message
gets the entire theme for free. **Do not add a theming code path.** If you find yourself
writing one, something upstream is wrong — go fix that instead.

---

## The one decision that is not already made

**How the app gets into an Obsidian tab.** This is the whole architectural difference, and it
is worth your first hour.

VS Code gave each editor a webview — its own document — so the extension ships the app's
*vite build* and loads `index.html` in it. That is the invariant the boundary test protects:
**one build of the canvas, never two.** A second bundle is free to drift from the one Zach
released, and nothing fails loudly when it does.

An Obsidian plugin is a JS module loaded into Obsidian's own renderer. There is no second
document by default, and the naive route — bundle `src/` into `main.js` with esbuild — is
exactly the forbidden second build. The pyblocks donor took that route; its `main.js` is
**7.6 MB** of bundled canvas.

**Hold the invariant.** Preferred mechanism: mount an `<iframe>` in the view and point it at
the staged vite build inside the plugin folder, using
`this.app.vault.adapter.getResourcePath(...)` to get an `app://` URL. That gives you a real
second document, so the existing `postMessage` bridge works **byte-identically to VS Code** and
`scripts/stage_app.mjs` is reused as-is.

**Spike that first, before writing anything else.** Put the staged `index.html` in a plugin
folder, load it in an iframe in a scratch view, and confirm the bundle executes and its assets
resolve. Timebox it.

**If the spike fails**, the fallback is a bundled `main.js`, and then you owe three things
rather than a shrug:

1. Extend `tests/test_stock_boundary.py` to name the exception explicitly, with the reason.
2. Stamp the bundle with the same provenance `dist/app/app.json` carries, and assert in a test
   that the Obsidian bundle and the staged VS Code app came from the same commit — so the two
   builds cannot silently diverge.
3. Say so in the report. A knowingly-taken exception is fine; an undocumented one is not.

### The small protocol change, needed only on the fallback path

`EmbedHostBridge.post()` is already a direct function call, so app → host needs nothing. Only
the inbound direction assumes `window.addEventListener('message')`. If you end up in the same
document, add an optional `subscribe(handler)` to the bridge and have `EmbeddedCanvas` prefer
it when present, falling back to window messages. Symmetrical, about fifteen lines, and it
leaves VS Code untouched.

---

## What Obsidian owns that VS Code did not

The document model is genuinely different and you must not paper over it.

- **`TextFileView` is the base class** — `getViewData()` / `setViewData(data, clear)` /
  `clear()`, with `this.data` and `requestSave()`. Register with `registerView()` and claim
  the file types with `registerExtensions(['systemsketch', 'tldr'], VIEW_TYPE)`.
- **Obsidian autosaves.** VS Code holds a dirty tab until <kbd>Ctrl</kbd>+<kbd>S</kbd>; the
  `vscode_e2e` journey asserts nothing hits disk before that. Obsidian debounces and writes on
  its own schedule. That is the host's model and you follow it — but the journey's assertion
  must change to match, not be quietly deleted. Assert what Obsidian actually promises: the
  bytes land, and they land once per settled edit.
- **`setViewData` is also how an external change arrives**, so the same entry point serves both
  "open this file" and "the file changed underneath you". Distinguish them or you will remount
  the canvas on every keystroke somebody makes in another window.

---

## Increments — each one runnable

**0 · The iframe spike.** Decide the mounting question above. Ends with a one-paragraph note in
the PR saying which path and why.

**1 · A file opens.** Manifest, `registerView`, `registerExtensions`, the staged app, the
bridge declaring `host: 'obsidian'`. Read-only is fine here.
*Done when:* a `.systemsketch` in an isolated vault opens as a canvas in Obsidian, in Obsidian's
own colours, in both its light and dark theme.

**2 · Editing round-trips.** `getViewData`/`setViewData`/`requestSave` wired to the bridge, the
suffix deciding the envelope exactly as in VS Code, external changes reloading.
*Done when:* the real-host journey draws a Block, lets Obsidian save, and reads the envelope
back out of the file on disk.

**3 · Inline embeds** — `![[board.systemsketch]]` rendering read-only inside a note, via a
markdown post-processor. This is the thing Obsidian can do that VS Code cannot, and it is
plausibly the reason the plugin is worth having at all. Lift the donor's post-processor. Defer
it explicitly if 1 and 2 run long; do not half-do it.

---

## Enforcement

**A real-host journey**, `obsidian-systemsketch/tests/obsidian_e2e.mjs`, modelled on the donor's
and on `vscode-systemsketch/tests/vscode_e2e.mjs`. Isolated vault, isolated config dir,
Obsidian under Xvfb, driven over CDP. The oracle is the file's bytes and Obsidian's own DOM —
never the app's internals, which a released build does not expose.

Carry across the two things that made the VS Code journey trustworthy:

- **Contrast, measured.** Read computed foreground and background off live chrome in Obsidian's
  dark theme and assert WCAG ratios, the way `vscode_e2e` now does (it reports
  `section-title 4.8:1`, `active tab 9.48:1`). This is what catches an unreadable panel, and it
  is the check that would have caught the light-only chrome months earlier.
- **A capability probe, not a silent failure.** If a host will not accept synthetic input,
  report the checks you *could* prove and name the ones you could not. Cursor's sign-in wall
  taught that; Obsidian will have its own version.

**Never drive Zach's live Obsidian.** Isolated profile only — the `headless-obsidian` skill in
his vault exists for exactly this, and the donor's harness already does it correctly.

---

## Traps

**`isDesktopOnly: true`.** tldraw and the canvas are not mobile-viable; say so in the manifest
rather than shipping something that breaks on a phone.

**The twelve existing golden boards will not render**, in Obsidian or VS Code. They are
pyblocks' legacy `{version, nodes, edges}` documents with no `tldrawFileFormatVersion`, so
`parseTldrawJsonFile` refuses them and the canvas shows its error banner. That is known and
deferred — do not "fix" it here by adding a legacy reader, and do not use one of them as your
test fixture. Use a blank file, exactly as `vscode_e2e` does.

**Take the donor's plumbing, not its canvas.** `~/pyblocks/obsidian-systemsketch/src/main.ts`
(249 lines) and `view.tsx` (137) are worth reading closely for the Obsidian API wiring. Their
`mountSketchSurface` — React mounted directly, canvas bundled in — is the part you are
deliberately doing differently.

**The boundary test will notice you.** `tests/test_stock_boundary.py` asserts that
`src/embed/sharedWithHost.ts` is the only thing a host imports from the app, and that every
module reachable from it stays free of React, tldraw and the DOM. Adding an Obsidian host is
fine; deep-importing past that seam is not.

**One identifier per marketplace.** The VS Code extension reuses `bam-robotics.systemsketch-vscode`,
which collided with the pyblocks one and silently swapped it on install. Obsidian's donor uses
plugin id `systemsketch`. Decide deliberately whether this replaces it in Zach's vault or takes
a new id, and say which in the report — do not discover it the way we did.

---

## Definition of done

- `obsidian-systemsketch/` in this repo, beside `vscode-systemsketch/`, with a README in the
  same shape.
- One build of the canvas, or a documented and tested exception saying why not.
- A `.systemsketch` and a `.tldr` both open, edit and save in a real isolated Obsidian, proved
  by a journey that reads the bytes on disk.
- Legible in Obsidian's light and dark themes, proved by measured contrast ratios rather than a
  screenshot review, and mutation-tested red.
- Zero new theming code — the palette that already exists is the one being used.
- `npm run check` green, `npm run plugin:test` still green (you must not regress VS Code), and a
  `docs/build_*.py` report rendered headlessly and looked at before handover.
