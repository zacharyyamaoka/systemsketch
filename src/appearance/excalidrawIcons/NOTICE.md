# Vendored icon provenance

The SVG glyphs in `icons.tsx` (and the `createIcon` wrapper in
`createIcon.tsx`) are vendored from
[github.com/excalidraw/excalidraw](https://github.com/excalidraw/excalidraw),
specifically `packages/excalidraw/components/icons.tsx` at the commit shallow-
cloned into `/home/bam/excalidraw-reference` on 2026-09-07 (2,582 lines, 208
exports — only the ~45 glyphs this app's floating toolbar needs are taken).

Three upstream licenses cover this set, all permissive, none requiring more
than attribution:

1. **Excalidraw itself — MIT.** The reference clone's `LICENSE` file
   (`/home/bam/excalidraw-reference/LICENSE`) reads:

   > MIT License
   > Copyright (c) 2020 Excalidraw

   This covers every glyph's arrangement, wrapper, and the ones Excalidraw
   drew itself (the fill/stroke/sloppiness/alignment/arrowhead/font-size/
   text-align/z-order icons).

2. **Font Awesome — fontawesome.com/license.** `icons.tsx` itself opens with:

   ```
   // All icons are imported from https://fontawesome.com/icons?d=gallery
   // Icons are under the license https://fontawesome.com/license
   ```

   (source lines 1-3). None of the icons vendored into *this* module are
   Font-Awesome-sourced (the ones this toolbar needs are all Excalidraw's own
   "modified Tabler" hand-drawn set or genuinely original Excalidraw glyphs),
   but the credit is carried forward here because it is the upstream file's
   own blanket header and this module is a subset of that file.

3. **Tabler Icons — MIT, individually annotated.** Upstream, several glyphs
   carry a `// tabler-icons: <name>` comment marking them as derived from
   [tabler.io/icons](https://tabler.io/icons) (MIT) rather than drawn from
   scratch. Every such comment on a glyph vendored here is preserved verbatim
   in `icons.tsx` immediately above the export.

No Excalidraw application code, React component tree, or non-icon module is
vendored — only the glyph markup and the small `createIcon` shell that wraps
it. This module imports only `react`.
