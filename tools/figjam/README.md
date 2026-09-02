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

## Reading the output

FigJam's option cells are unlabelled `div`s — an icon's meaning exists only in
its tooltip, which is why the tracer hovers rather than scraping. And FigJam
reuses names across controls: `Triangle` is a shape in the library and an outline
arrowhead in the endpoint list. Any merge must be keyed by control as well as
name, or the shape picker quietly fills up with arrowheads.

## What is already captured

| File | Holds |
|---|---|
| `docs/assets/figjam-icons-traced.json` | 49 icons, namespaced by control |
| `docs/assets/figjam-palette-hex.json` | 21 colours + Custom, sampled from the swatch centres |
| `docs/assets/figjam-menu-inventory.json` | every control and popover, per subject, with geometry |
