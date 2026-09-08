# Tailwind v4 + stock tldraw@5.3.2 — measured probe

Working tree: `/home/bam/.claude/jobs/c3a25911/tmp/tw-tldraw-probe/` (not part of the
systemsketch repo; `tests/cdp_kit.mjs` was read-only imported by absolute path).

## 1. Versions (from `package-lock.json`, resolved by `npm install tldraw@5.3.2 react@19
react-dom@19 tailwindcss@4 @tailwindcss/vite@4` on top of a fresh
`npm create vite@latest probe -- --template react-ts`)

| package | requested | resolved |
|---|---|---|
| tldraw | 5.3.2 | **5.3.2** |
| react | 19 | **19.2.8** |
| react-dom | 19 | **19.2.8** |
| tailwindcss | 4 | **4.3.3** |
| @tailwindcss/vite | 4 | **4.3.3** |
| vite (scaffold default) | — | 8.2.2 |
| typescript (scaffold default) | — | ~6.0.2 (tsc 6.0.3) |

The `probe-shadcn` copy (see §5) additionally resolved: `@base-ui/react` 1.8.0, `shadcn`
4.21.0, and — pulled in only by the Kibo UI add — `radix-ui` 1.6.7, `color` 5.0.3,
`lucide-react` 1.42.0.

## 2. App under test

One Vite/React app, mode read once at startup from `?mode=none|full|layers` and used to
decide which CSS file (if any) is dynamically `import()`ed — `src/styles/full.css`
(`@import "tailwindcss";`) or `src/styles/layers.css` (`@import
"tailwindcss/theme.css" layer(theme); @import "tailwindcss/utilities.css"
layer(utilities);`). `tldraw/tldraw.css` and an intentionally empty `src/index.css` are
always statically imported, so `mode=none` loads only `tldraw.css`. Verified in the
production build (`vite build`): three separate CSS chunks were emitted —
`layers-*.css` (2.56 kB, no preflight rules), `full-*.css` (6.65 kB, includes preflight:
2 `box-sizing:border-box` resets + a `margin:0` reset that `layers-*.css` has zero of),
`index-*.css` (77.42 kB, = tldraw's own stylesheet, loaded in every mode). Only one of
the two Tailwind chunks is ever requested per mode, confirmed by the built
`index.html` referencing only `index-*.css` statically.

`App.tsx` seeds one of each requested shape via `editor.createShapes([...])` with fixed
`createShapeId()`s (rectangle: fill solid/dash draw/size m/color blue/label "Label";
ellipse: fill pattern; arrow labelled "arrow"; text "Hello"; note "note"; a draw shape
from 5 fixed points via `compressLegacySegments`; a line via `getIndices(2)`; a frame
named "Frame"; a highlight), then `selectNone()`, `setCamera({x:0,y:0,z:1})`,
`updateInstanceState({isDebugMode:false})`, and sets `window.__ready = true`. A 280px
`<aside>` next to the fixed 1000×800 `<Tldraw>` box carries `p-3 text-sm rounded-md
border bg-neutral-100`, a plain `<button>`, and an `<input type=number>`.

## 3. Pixel diff (Python PIL, `ImageChops.difference`, viewport 1440×960, board and
panel screenshots, `none` as baseline)

**Full viewport** (includes the `<aside>`, which intentionally differs since it carries
Tailwind utility classes in `full`/`layers` and none in `none`):

| pair | what | changed px | % | bbox |
|---|---|---|---|---|
| none vs layers | board | 282,352 | 20.42% | (1008,8)-(1314,945) |
| none vs layers | panel | 282,352 | 20.42% | (1008,8)-(1314,945) |
| none vs full | board | 401,261 | 29.03% | (0,0)-(1440,960) full frame |
| none vs full | panel | 407,218 | 29.46% | (0,0)-(1440,960) full frame |

**Tldraw canvas only** (the 1000×800 `<div>` holding `<Tldraw>`, cropped before diffing
— this isolates whether tldraw's own rendering changed, independent of the aside):

| pair | what | changed px | % | bbox |
|---|---|---|---|---|
| **none vs layers** | board | **0** | **0.0000%** | none |
| **none vs layers** | panel | **0** | **0.0000%** | none |
| **none vs full** | board | 92,049 | 11.51% | (0,0)-(1000,800) — whole canvas |
| **none vs full** | panel | 98,006 | 12.25% | (0,0)-(1000,800) — whole canvas |

**Answer to (a)/(b)/(c): the layer-only import (b) is pixel-identical to no Tailwind (c)
inside the tldraw canvas — 0 of 800,000 pixels differ, in both the plain board and the
style-panel-open screenshot. The full import with preflight (a) changes ~11.5–12.25% of
the canvas's own pixels**, not just the aside.

## 4. Computed-style deltas (only properties that differ from `none`; `layers` matched
`none` on every probed property)

| selector | property | none / layers | full |
|---|---|---|---|
| `.tl-container` | `font-family` | `"Times New Roman"` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...` |
| `.tl-container` | `line-height` | `normal` | `18px` |
| `.tlui-button` | `font` (family part) | `... "Times New Roman"` | `... -apple-system, ...` (size/line-height unchanged: `500 12px / 19.2px`) |
| `body` | `margin` | `8px` | `0px` |
| `body` | `line-height` | `normal` | `24px` |
| `body` | `font-family` | `"Times New Roman"` | `-apple-system, BlinkMacSystemFont, ...` |

Unchanged across all three modes: `.tl-svg-container` (`display: block`),
`.tlui-style-panel` (background/box-shadow/border-radius identical), and
`.tl-text-label__inner` (`font-family: tldraw_draw, sans-serif`, `font-size: 20px`,
`white-space: normal` — tldraw sets this explicitly on the label element itself, so it
does not inherit the cascade change).

**Root cause of the canvas pixel diff**: Tailwind's preflight resets `html`/`body`'s
font-family to its default sans-serif stack. `.tl-container` has no explicit
`font-family` of its own for the base case, so it inherits whatever the page cascade
provides — normally the browser default serif (`Times New Roman`, since the test app's
`index.css` is intentionally empty), but the system sans-serif stack once preflight
runs. That inherited font affects text metrics tldraw uses for auto-sizing (note/frame
growY, text measurement), which is why shape outlines shift by a few pixels, not just
the glyphs — visible in `diff-none-vs-full-board.png` as doubled edges around the note,
frame and rectangle, not just around the text.

## 5. Console errors

Identical across all three modes: 2 console errors (`"Uncaught (in promise)"` ×2,
89 total console/log events each) — this is tldraw's own unrelated license/analytics
promise rejection in this bare non-licensed embed, not something Tailwind introduced.

## 6. `npx shadcn@latest init` with Base UI, non-interactively

Command that worked, run in a fresh copy of the `layers`-mode project
(`cp -r probe probe-shadcn`), **after** adding a `@/*` → `./src/*` path alias to
`tsconfig.json` / `tsconfig.app.json` and a matching `resolve.alias` in
`vite.config.ts` — shadcn's own preflight step ("Validating import alias") refuses to
proceed on a bare Vite scaffold, which has no alias by default:

```
npx shadcn@latest init -b base -p nova -t vite -y </dev/null
```

(`-b base` selects the Base UI primitive layer; `--defaults`/`-d` alone does not work
for this — it forces `--template=next`. `-p base-nova` — the guessed preset name from
the CLI's own `-d` help text — is invalid; the real preset name is bare `nova`, `-b
base` supplies the "base" half separately. Feeding a bare `-y` without `-p` drops into
an interactive preset picker even with `-y`/`--yes` set, so `-p nova` is required to
avoid the prompt.)

`components.json` it wrote:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/full.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

It picked `src/styles/full.css` — the file already containing `@import "tailwindcss";`
— as the Tailwind entry to append its theme/base layers to (there was no ambiguity here
since `layers.css` doesn't carry that literal import string).

`npx shadcn@latest add button input select slider toggle-group tabs collapsible popover
tooltip separator field input-group button-group -y`: **all 13 requested components
succeeded** (`button` was skipped as already-identical from `init`; `input-group` /
`toggle-group` pulled in `toggle`, `label`, `textarea` as transitive component deps —
15 files created total). None of the requested names failed to resolve.

**Primitive package landed**: `@base-ui/react@1.8.0`. Zero `@radix-ui/*` or `radix-ui`
in `package.json` at this point.

```
$ grep -rn "from \"@base-ui/react\|from \"radix-ui\|@radix-ui" src/components/ui | sort | uniq -c | head
      1 src/components/ui/button-group.tsx:1:import { mergeProps } from "@base-ui/react/merge-props"
      1 src/components/ui/button-group.tsx:2:import { useRender } from "@base-ui/react/use-render"
      1 src/components/ui/button.tsx:1:import { Button as ButtonPrimitive } from "@base-ui/react/button"
      1 src/components/ui/collapsible.tsx:1:import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
      1 src/components/ui/input.tsx:2:import { Input as InputPrimitive } from "@base-ui/react/input"
      1 src/components/ui/popover.tsx:4:import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
      1 src/components/ui/select.tsx:2:import { Select as SelectPrimitive } from "@base-ui/react/select"
      1 src/components/ui/separator.tsx:3:import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
      1 src/components/ui/slider.tsx:1:import { Slider as SliderPrimitive } from "@base-ui/react/slider"
      1 src/components/ui/tabs.tsx:3:import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
      1 src/components/ui/toggle-group.tsx:2:import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
      1 src/components/ui/toggle.tsx:1:import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
      1 src/components/ui/tooltip.tsx:1:import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
```

14 of 14 `ui/*` component files import exclusively from `@base-ui/react/*`; zero from
Radix.

**`npx tsc --noEmit -p tsconfig.app.json`: FAILS**, and so does the project's own
`npm run build` (`tsc -b && vite build`), on the very tsconfig edit shadcn's own alias
check demanded:

```
tsconfig.app.json:3:5 - error TS5101: Option 'baseUrl' is deprecated and will stop
functioning in TypeScript 7.0. Specify compilerOption '"ignoreDeprecations": "6.0"' to
silence this error.
    "baseUrl": ".",
```

This project's `typescript` is `~6.0.2` (`tsc` 6.0.3), and TS 6.0 treats the classic
`baseUrl`/`paths` alias pattern from shadcn's own documented manual Vite setup as an
error-by-default deprecation, not just a warning. `vite build` run standalone (no type
check step, esbuild/rolldown only strip types) **succeeds** regardless — 5 CSS/JS
chunks emitted, including the by-then-larger `full-*.css` (64.98 kB, up from 6.65 kB —
shadcn's `@theme`/`:root`/`.dark` tokens plus `tw-animate-css` layered in) and
`layers-*.css` (36.64 kB, up from 2.56 kB). So: **the CLI flow works end-to-end and
`vite build` is green, but the project's own `tsc -b`/`npm run build` is red out of the
box** unless `"ignoreDeprecations": "6.0"` is added by hand.

## 7. Kibo UI, in the same `probe-shadcn` project

```
npx shadcn@latest add https://www.kibo-ui.com/r/color-picker.json -y </dev/null
```

— the guessed registry URL pattern (`https://www.kibo-ui.com/r/<slug>.json`) worked
first try, no lookup needed. Result: 1 file created
(`src/components/kibo-ui/color-picker/index.tsx`), 3 files skipped as already-identical
(`ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx` — Kibo's registry entry declares those
shadcn primitives as dependencies).

**Dependencies it pulled into `package.json`**: `color@5.0.3`, and — the key fact —
**`radix-ui@1.6.7`**, even though this project's `components.json` `style` is
`base-nova` (Base UI). Kibo's own source imports Radix directly, unconditionally:

```ts
// src/components/kibo-ui/color-picker/index.tsx
import { Slider } from "radix-ui";
```

So the project now has both `@base-ui/react` (used by every local `ui/*` component)
and `radix-ui` (used only by the Kibo component) installed side by side — Kibo UI does
not respect or adapt to the project's chosen primitive layer.

**Does it typecheck alongside the Base UI components?** `tsc --noEmit` still reports
only the pre-existing `TS5101` config error (same as §6 — TS stops at the first
config-diagnostic and never reaches the file-level check). Temporarily adding
`"ignoreDeprecations": "6.0"` to get past that (then reverting it, since that edit isn't
part of what shadcn/Kibo produced by default) surfaces one real, otherwise-hidden type
error, and only one:

```
src/components/kibo-ui/color-picker/index.tsx:316:13 - error TS2322: Type '(mode:
string) => void' is not assignable to type '(value: string | null,
eventDetails: SelectRootChangeEventDetails) => void'.
  Types of parameters 'mode' and 'value' are incompatible.
    Type 'string | null' is not assignable to type 'string'.
      Type 'null' is not assignable to type 'string'.

    <Select onValueChange={setMode} value={mode}>
            ~~~~~~~~~~~~~

  node_modules/@base-ui/react/select/root/SelectRoot.d.mts:143:3
    onValueChange?: ((value: SelectValueType<Value, Multiple> | (Multiple extends
    true ? never : null), eventDetails: SelectRootChangeEventDetails) => void) |
    undefined;
```

Kibo's `color-picker` renders the project's local `@/components/ui/select` (Base UI
under `-b base`) but was written against the Radix-shaped `onValueChange(value:
string)` signature; Base UI's typed `onValueChange` allows `null` (for a
clearable/uncontrolled select) and Kibo's `setMode` callback doesn't accept that. **So:
Kibo UI's registry component is not type-compatible with a Base UI–flavored shadcn
project out of the box** — one concrete, load-bearing type error, not a style nit.

## 8. Screenshots and data files (all under
`/home/bam/.claude/jobs/c3a25911/tmp/tw-tldraw-probe/shots/`)

- `none-board.png`, `full-board.png`, `layers-board.png` — the seeded canvas, no
  selection
- `none-panel.png`, `full-panel.png`, `layers-panel.png` — same, with the rectangle
  selected so `DefaultStylePanel` is visible
- `diff-none-vs-layers-board.png`, `diff-none-vs-layers-panel.png` — amplified (×8)
  diff, full viewport (all signal is in the aside; canvas region is solid black =
  zero difference)
- `diff-none-vs-full-board.png`, `diff-none-vs-full-panel.png` — amplified diff,
  visibly lit up across the whole canvas, not just the aside
- `panel-compare.png` — the three panel screenshots' right-400px strip side by side
  (none | full | layers)
- `none-styles.json`, `full-styles.json`, `layers-styles.json` — raw
  `getComputedStyle` dumps per mode
- `capture-results.json` — styles + console-error data for all three modes, one file
- `diff-results.json` — full-viewport pixel-diff numbers
- `diff-canvas-only-results.json` — the canvas-only pixel-diff numbers (§3, second
  table)

Build/config sources: `probe/src/App.tsx`, `probe/src/main.tsx`,
`probe/src/styles/{full,layers}.css`, `probe/vite.config.ts`; the shadcn probe lives
entirely in the sibling `probe-shadcn/` copy.

## Conclusion (measured only)

1. Tailwind v4's **layer-only import (skip preflight)** is **pixel-bit-identical** to no
   Tailwind at all inside the tldraw canvas — 0/800,000 px differ, in two different
   screenshot states (idle board, style panel open).
2. Tailwind v4's **full import (with preflight)** measurably repaints tldraw's own
   canvas — **~11.5–12.25%** of canvas pixels differ from the no-Tailwind baseline,
   because preflight's `html`/`body` font-family reset cascades into `.tl-container`
   (which sets no font-family of its own) and shifts text-dependent shape geometry, not
   just glyphs.
3. `.tlui-style-panel` and `.tl-text-label__inner` are the two probed selectors that
   stayed byte-identical under `full` too — tldraw sets those font/background
   properties explicitly rather than relying on inheritance, so they're immune to
   preflight even though `.tl-container` and `body` are not.
4. `shadcn@latest init -b base -p nova -t vite -y` and the follow-on `add` of 13
   components both work non-interactively today and land 100% on `@base-ui/react`
   (zero Radix) — but only after hand-adding a path alias that itself breaks this
   project's default `tsc -b`/`npm run build` under TypeScript ~6.0 (`TS5101`); `vite
   build` alone stays green.
5. Kibo UI's `color-picker` installs cleanly via `shadcn add <url>` but is not written
   against Base UI: it imports `radix-ui` directly and its use of the project's local
   `Select` component produces one concrete `tsc` type error, so "Base UI as the
   project's primitive layer" and "Kibo UI components" are not fully composable
   out of the box.
