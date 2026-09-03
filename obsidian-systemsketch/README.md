# SystemSketch for Obsidian

Open `.systemsketch` and `.tldr` files as the real SystemSketch canvas inside
Obsidian. Canvas edits use Obsidian's `TextFileView` autosave path, changes made
outside the pane reload in place, and `![[board.systemsketch]]` renders an inert
read-only preview. Light and dark Obsidian themes reach both tldraw and the
SystemSketch chrome.

## Build and install

```bash
cd ~/systemsketch/obsidian-systemsketch
npm install
npm run build
```

Copy `dist/main.js`, `dist/styles.css`, and `dist/manifest.json` into
`<vault>/.obsidian/plugins/systemsketch-obsidian/`, then enable **SystemSketch**
under Community plugins. This plugin is desktop-only. Its ID is deliberately
`systemsketch-obsidian`, rather than the donor plugin's `systemsketch`, so an
old local install cannot masquerade as this implementation.

## Architecture and provenance

An iframe over the staged Vite app was tried first. Obsidian's
`getResourcePath()` assigns a distinct query URL to every file: `index.html`
loaded, but the relative JavaScript URL emitted inside it omitted the asset's
query and the app never mounted. The accepted fallback bundles the existing
`src/embed/EmbeddedCanvas.tsx` in Obsidian's renderer document. It does not
contain a second canvas implementation. App CSS is prefixed beneath
`.systemsketch-obsidian-scope`, and `dist/bundle.json` records the exception,
its reason, and the exact source commit. The build first stages the VS Code app
and refuses a commit mismatch between that reference app and the Obsidian
bundle.

## Proof

```bash
npm test
```

The test runs a private temporary vault and profile in real Obsidian under
Xvfb. It checks both file extensions, one-edit/one-autosave behavior, external
reload, `.tldr` round-trip encoding, inline read-only embeds, light/dark theme
propagation, and WCAG contrast with a failing same-colour mutation. It never
opens a live vault. Deferred legacy PyBlocks goldens remain deferred; this
plugin adds no legacy reader or migration.

See the [implementation report](../docs/obsidian-plugin-2026-09-02.html) for
the measured journey and screenshots.
