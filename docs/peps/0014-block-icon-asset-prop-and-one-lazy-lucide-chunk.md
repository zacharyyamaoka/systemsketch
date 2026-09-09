# 0014: A Block's uploaded icon is a tldraw asset behind a prop literally named `assetId`, and the Lucide library ships as one lazy JSON chunk

- **Status:** Accepted
- **Date:** 2026-09-09
- **Merge:** merge of `track/icon-picker-proposal` (lane HEAD `722bbf8c`, judge PASS round 5)

## Context

Zach asked for a much larger Block icon library than the 39 curated Lucide glyphs, in
Notion's exact shape (Emoji · Icons · Upload, a filter, Ctrl+V to paste an image or a link),
with uploads "particularly for websites" — brand logos no stroke-icon set carries. Two forks
were real:

1. **Where an uploaded image lives and how a Block points at it.** A Block stores only a
   string `icon` today. An upload needs bytes, and those bytes must survive save, reload,
   copy/paste between boards and export, while a board without uploads must keep opening on
   the previous build (Stable is the channel Zach trusts).
2. **How 1,818 Lucide glyphs reach the canvas without loading them for every board.** The
   app already imports `lucide-react` statically for the curated set. The whole `icons` map
   is 1,011 KB minified / 165 KB gzipped, +59% on the app chunk if imported statically.

## Decision

**The upload is an ordinary tldraw image asset, and the Block prop that references it is
named exactly `assetId`.** tldraw's copy/export scan (`Editor.getContentFromCurrentPage`)
only carries an asset record with a shape when the prop is literally `assetId`; any other name
pastes a Block whose image silently never arrives. The prop is `assetIdValidator.nullable().optional()`,
is **never written in defaults**, and a later pick genuinely deletes the key (`editor.store.update`
after `updateShape`, inside one `editor.run`, so it is one undo step). The string `icon` keeps
carrying Lucide names, gains `emoji:<glyph>`, and holds the marker `asset` when an upload
applies. There is **no schema-version bump** for the new prop.

**The rest of Lucide is one lazily imported JSON chunk** (`data/lucide-icons.json`, nodes and
tags generated from `lucide-static` at the same version as `lucide-react`, rendered with
lucide's default SVG attributes so glyphs are pixel-identical), loaded on first picker open or
on first paint of a Block whose icon is outside the curated static 39. Emoji data is a sibling
chunk. The picker windows its grid rows; no virtualisation dependency.

## Alternatives considered

- **`iconAssetId` or `icon: 'asset:<id>'` only** — cleaner names, but tldraw's asset scan
  ignores them: copy/paste and export would drop the image. Rejected on the engine's own rule.
- **Bump the Block schema to 13 with an up/down migration for the new prop** — tried in the
  judge loop. tldraw rejects an unknown sequence id *before* validation, so every board saved
  by the new build was quarantined on main, upload or not. The migration protected a state
  (`assetId: null`) that never existed outside the branch. Reverted; optional prop, key only
  when needed, is the compatible move.
- **Files beside the board for uploads** — lighter boards, but a `.systemsketch` would stop
  being one self-contained file. Uploads are downscaled to ≤256 px PNG (SVG kept, 1 MB cap),
  so inline base64 costs ~20–50 KB per icon.
- **`lucide-react/dynamic` (`DynamicIcon`)** — one chunk per icon: 1,818 files in every build
  and in the VSIX. One chunk loads once per session.
- **Static import of the whole `icons` map** — simplest code, +1 MB on the app chunk for
  boards that use none of it.
- **Iconify JSON sets (`@iconify-json/lucide`, Tabler, Simple Icons)** — a second copy of
  the same geometry; earns its keep only if a second icon family is wanted (brand logos are
  covered by upload for now).
- **The shadcn icon pickers Zach linked** — Icons-only on a Tailwind stack; none has an Emoji
  or Upload tab. Their one transferable idea, Lucide's own tags as the search index, was taken.

## Consequences

- A board with an uploaded icon does not open on a build that predates the prop; a board
  without one does. Orphan asset records stay after re-uploads, exactly as for tldraw's own
  pasted images (assets sit outside undo history by engine design); a save-time sweep is a
  later job.
- Adding any future optional Block prop should follow the same shape: validated optional,
  absent from defaults, no sequence bump unless stored data actually needs rewriting.
- The URL half of "paste an image or link" runs through the Python host
  (`POST /api/icon/fetch`), which resolves once, refuses private/loopback targets, pins the
  vetted IP and re-vets each of ≤3 redirects, and accepts only same-origin JSON requests.
- `lucide-static` is a devDependency pinned equal to `lucide-react`; a test asserts the three
  versions (both packages and the generated JSON) agree.

## References

- Code: `src/blocks/ui/iconPicker/iconRef.ts` — the `WHY:` on the prop name and marker
- Code: `src/blocks/ui/iconPicker/lucideLibrary.ts` — the `WHY:` on one lazy chunk
- Code: `src/blocks/commands/blockCommands.ts` — the removed-keys write path
- Evidence: `reports/icon-picker-proposal-2026-09-09.html` (proposal, live mock, implementation
  captures, stock-part table); `tests/icon_picker_smoke.mjs` (70 real-browser checks)
- Related: `docs/pep-0001-reverse-compatible-portable-copies.md` (reverse compatibility is
  not assumed in general; this record narrows that for one prop)
