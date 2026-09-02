# FigJam capture harness

How the FigJam values in `src/appearance/` were obtained, and how to obtain more.
Nothing here runs in the product or in `npm run check` — it is a measuring
instrument, kept because the alternative to re-running it is guessing.

## What it is for

FigJam is the spec for SystemSketch's selection menu. Copying it by eye produces
a menu that is *nearly* right in a way that is hard to argue with and hard to
correct. Every number, colour and icon path under `src/appearance/` therefore
comes from a reading of the running application, and this is the instrument that
takes the reading.

## Running it

```bash
cd ~/systemsketch/tools/figjam && bash launch.sh
```

That clones Zach's authenticated Chrome profile into `~/.cache/systemsketch-figjam`
(override with `FIGJAM_SCRATCH`) and launches Chrome **on the invisible Xvfb
display `:99`**, never on his desktop, with CDP on port 9333. Then:

```bash
cd ~/systemsketch/tools/figjam && CDP_PORT=9333 python3 icon_trace.py connector shape shape-text
```

`icon_trace.py` draws each subject on a scratch FigJam board, opens every control
in the selection pill, and for each option cell hovers it to read its tooltip and
reads the SVG under the cursor. Output is `appearance/icons-traced.json`.

## Four things that silently break it

- **WebGL is blocklisted under Xvfb.** Figma raises a blocking `alert()` that
  freezes every CDP call, so the launcher passes `--use-gl=angle
  --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- **The logged-in profile is `Default`.** `Profile 1` carries a `figma.session`
  cookie but not `figma.auth_id`, so it loads a signed-out page that looks
  plausible.
- **Page zoom travels with the copied profile.** At 150% every measurement is
  wrong by a factor that is easy to miss; the launcher blanks
  `partition.per_host_zoom_levels`.
- **`pkill -f <pattern>` can kill the calling shell.** The wrapper's own command
  line matches the pattern. Use `pkill -f "[p]attern"`.

## The pill's own chrome, and the picker

`icon_trace.py` only sees option cells. Three things live outside them and were
still being approximated until they were read: the fixed icons on the triggers
(Line style's three bars, Typeface's `Aa`), the Custom cell and the picker
behind it, and the exact box a popover cell and its divider occupy.

```bash
cd ~/systemsketch/tools/figjam && CDP_PORT=9333 python3 chrome_trace.py
cd ~/systemsketch/tools/figjam && CDP_PORT=9333 python3 custom_state_trace.py
cd ~/systemsketch/tools/figjam && CDP_PORT=9333 python3 typeface_trace.py
```

`chrome_trace.py` dumps the pill and each popover as a DOM tree — geometry
relative to its panel, computed colours, radii, fonts, pseudo-element
backgrounds (the slider tracks paint through `::before`), and every SVG's path
data — then types a hex into the picker so the next two can read what FigJam
shows once a shape carries a custom colour. The distilled result is
`docs/assets/figjam-chrome-traced.json`; the raw trees stay in `appearance/`,
which is gitignored.

`emit_icons.py` regenerates `src/appearance/figjamIcons.ts` from the two
captures, so an icon is either in a capture or not in the product:

```bash
cd ~/systemsketch && python3 tools/figjam/emit_icons.py --check
```

Two readings worth knowing before trusting a purple: a labelled chip (Fill /
Transparent / No fill) is chosen in `#9747ff`, but an icon-only cell and the
ring around the chosen swatch use `#8a38f5`. And the Fill chips carry a 24px
icon with no left padding while the Solid / Dashed / None chips carry a 16px
icon in a 24px slot with 4px before it — two components in FigJam, kept as two.

## Reading the output

FigJam's option cells are unlabelled `div`s — an icon's meaning exists only in
its tooltip, which is why the tracer hovers rather than scraping. And FigJam
reuses names across controls: `Triangle` is a shape in the library and an outline
arrowhead in the endpoint list. Any merge must be keyed by control as well as
name, or the shape picker quietly fills up with arrowheads.

## What is already captured

| File | Holds |
|---|---|
| `docs/assets/figjam-icons-traced.json` | 49 option-cell icons, namespaced by control |
| `docs/assets/figjam-palette-hex.json` | 21 colours + Custom, sampled from the swatch centres |
| `docs/assets/figjam-menu-inventory.json` | every control and popover, per subject, with geometry |
| `docs/assets/figjam-chrome-traced.json` | the pill's triggers, the Custom cell and picker, and the Line style, Font size, Typeface and alignment popovers as DOM trees |
| `docs/assets/figjam-chrome-*.png`, `figjam-custom-state-palette.png`, `figjam-typeface-popover.png` | the frames those trees were read from |
