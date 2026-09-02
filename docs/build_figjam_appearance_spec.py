"""Build the FigJam appearance-menu specification report.

Captured from the running FigJam editor over the DevTools Protocol on an
off-screen display. Panel geometry and control inventories come from FigJam's
own DOM; palette names come from each swatch's tooltip; palette values come from
sampling the rendered pixels and were confirmed by applying a colour and reading
it back off the canvas.
"""
from __future__ import annotations

import base64
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent
ASSETS_DIR = DOCS_DIR / "figjam-appearance-2026-09-01"
OUTPUT_PATH = DOCS_DIR / "figjam-appearance-menu-spec-2026-09-01.html"


def figure(name: str) -> str:
    data = base64.b64encode((ASSETS_DIR / f"{name}.png").read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


# (name, hex) in grid order. Row 1 saturated, row 2 light.
PALETTE_ROW_1 = [
    ("Black", "#1e1e1e"), ("Dark gray", "#757575"), ("Red", "#f24822"),
    ("Orange", "#ff9e42"), ("Yellow", "#ffc943"), ("Green", "#66d575"),
    ("Teal", "#5ad8cc"), ("Blue", "#3dadff"), ("Violet", "#874fff"),
    ("Pink", "#f849c1"), ("White", "#ffffff"),
]
PALETTE_ROW_2 = [
    ("Gray", "#b3b3b3"), ("Light gray", "#d9d9d9"), ("Light red", "#ffc7c2"),
    ("Light orange", "#ffe0c2"), ("Light yellow", "#ffecbd"), ("Light green", "#cdf4d3"),
    ("Light teal", "#c6faf6"), ("Light blue", "#c2e5ff"), ("Light violet", "#dcccff"),
    ("Light pink", "#ffc2ec"), ("Custom", None),
]

# state -> controls, in the order they appear in the pill
STATES = [
    ("Shape, no text", "menu-shape", 183,
     ["Shape", "Colour &amp; fill", "Stroke"]),
    ("Shape with text", "menu-shape-text", 603,
     ["Shape", "Colour &amp; fill", "Stroke", "Typeface", "Font size", "Bold",
      "Strikethrough", "Link", "Bulleted list", "Alignment"]),
    ("Connector, no text", "menu-connector", 366,
     ["Colour", "Weight &amp; style", "Add text", "Start point", "Line shape", "End point"]),
    ("Connector with text", "menu-connector-text", 320,
     ["Colour", "Weight &amp; style", "Start point", "Line shape", "End point"]),
    ("Text object", "menu-text", 514,
     ["Colour", "Typeface", "Font size", "Bold", "Strikethrough", "Link",
      "Bulleted list", "Mind map", "Alignment"]),
]

POPOVERS = [
    ("Fill colour", "color-fill", "368 &times; 129",
     "A mode row &mdash; <b>Fill / Transparent / No fill</b> &mdash; above the shared 11&times;2 palette. "
     "This is the shape's <em>fill</em>; the stroke has its own identical grid behind the next control."),
    ("Stroke colour and style", "color-stroke", "368 &times; 129",
     "Same layout, different mode row: <b>Solid / Dashed / None</b>. Note what is <em>not</em> here &mdash; "
     "a shape has no stroke-weight control at all in FigJam. Only connectors get one."),
    ("Text colour", "color-text", "368 &times; 80",
     "For a text object the panel is the bare grid: no mode row, so 49&nbsp;px shorter. A shape's inner text "
     "has <em>no</em> colour control &mdash; it is always the shape's contrasting text colour."),
    ("Connector label colour", "color-connector-label", "368 &times; 137",
     "A connector with a label gains a <b>Text background</b> row with a show/hide eye. The grid then sets "
     "that background, not the line."),
    ("Custom colour", "color-custom", "184 &times; 310",
     "Behind the last cell of row 2: eyedropper, hex field, hue strip, alpha strip, and an SV square. "
     "The hex field is what confirmed Black is <code>#1E1E1E</code>."),
    ("Shape switcher", "shape-picker", "224 &times; 232",
     "A searchable grid, 5 per row, scrolling well past the 30 visible. The current shape is the filled "
     "violet cell. This is the only popover with a text input at the top."),
    ("Connector weight and style", "connector-weight", "145 &times; 44",
     "Two groups of two: <b>thin / thick</b>, then <b>solid / dashed</b>. Four buttons, no dropdown, no "
     "numeric field &mdash; the whole stroke-weight vocabulary is two values."),
    ("Line shape", "connector-shape", "104 &times; 40",
     "Three routings: elbowed, curved, straight."),
    ("Line endings", "connector-endings", "232 &times; 40",
     "Six endings plus a <b>&hellip;</b> for the rest. The same panel serves both the start-point and the "
     "end-point controls; each remembers its own value."),
    ("Typeface", "typeface", "119 &times; 113",
     "Four, each rendered in itself: <b>Simple</b>, <b>Bookish</b>, <b>Technical</b>, <b>Scribbled</b>. "
     "A checkmark marks the current one &mdash; no font search, no system fonts."),
    ("Font size", "font-size", "130 &times; 207",
     "Five presets, each drawn at its own size, over a numeric field for anything else. The ladder is "
     "<b>16 / 24 / 40 / 64 / 96&nbsp;px</b> &mdash; read back from the field after choosing each preset."),
    ("Alignment", "alignment", "104 &times; 40",
     "Left, centre, right. No vertical alignment anywhere, for shapes or for text."),
]

MATRIX = [
    ("Shape", "&#9679;", "&mdash;", "&mdash;", "&mdash;"),
    ("Fill colour + mode", "&#9679;", "&mdash;", "&mdash;", "&mdash;"),
    ("Stroke colour + style", "&#9679;", "&#9679;", "&mdash;", "&mdash;"),
    ("Stroke weight", "&mdash;", "&#9679;", "&mdash;", "&mdash;"),
    ("Line shape", "&mdash;", "&#9679;", "&mdash;", "&mdash;"),
    ("Start / end point", "&mdash;", "&#9679;", "&mdash;", "&mdash;"),
    ("Add text", "&mdash;", "&#9679;<sup>1</sup>", "&mdash;", "&mdash;"),
    ("Text colour", "&mdash;", "&#9679;<sup>2</sup>", "&mdash;", "&#9679;"),
    ("Typeface", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Font size", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Bold / Strikethrough", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Link", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Bulleted list", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Alignment", "&mdash;", "&mdash;", "&#9679;", "&#9679;"),
    ("Mind map", "&mdash;", "&mdash;", "&mdash;", "&#9679;"),
]


def swatch_cells(row):
    cells = []
    for name, value in row:
        if value is None:
            cells.append(
                '<div class="sw"><span class="chip wheel"></span>'
                f'<b>{name}</b><code>picker</code></div>')
        else:
            border = ' style="box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)"' if value == "#1e1e1e" else ""
            cells.append(
                f'<div class="sw"><span class="chip" style="background:{value}"{border}></span>'
                f'<b>{name}</b><code>{value.upper()}</code></div>')
    return "".join(cells)


def build() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; FigJam appearance menu</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a; --muted: #626975; --faint: #8b93a1;
      --line: #dfe3e9; --paper: #f7f8fa; --card: #ffffff;
      --accent: #5b5ee5; --accent-soft: #eeefff;
      --green: #177245; --green-soft: #e9f8ef;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 96px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 900px; margin: 0; font-size: clamp(40px, 5.6vw, 70px); line-height: .97; letter-spacing: -.05em; }}
    .lede {{ max-width: 800px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }}
    .chip-tag {{ display: inline-flex; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .chip-tag.ok {{ border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    h3 {{ margin: 34px 0 6px; font-size: 19px; letter-spacing: -.02em; }}
    .sub {{ margin: 0 0 22px; max-width: 800px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28,34,48,.06); }}
    figure img {{ display: block; width: 100%; height: auto; background: #f2f3f5; }}
    figcaption {{ padding: 13px 17px 15px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }}
    figcaption b {{ color: var(--ink); }}
    .states {{ display: grid; gap: 18px; }}
    .state {{ display: grid; grid-template-columns: 1.15fr .85fr; gap: 0; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--card); box-shadow: 0 12px 40px rgba(28,34,48,.06); }}
    .state img {{ display: block; width: 100%; height: auto; background: #f2f3f5; }}
    .state .copy {{ padding: 20px 22px; }}
    .state h3 {{ margin: 0 0 4px; font-size: 18px; }}
    .state .w {{ color: var(--faint); font: 650 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .state ol {{ margin: 12px 0 0; padding-left: 20px; color: var(--muted); font-size: 14px; line-height: 1.75; }}
    .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
    .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }}
    .palette {{ margin-top: 20px; padding: 20px 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--card); }}
    .row {{ display: grid; grid-template-columns: repeat(11, 1fr); gap: 10px; }}
    .row + .row {{ margin-top: 16px; }}
    .sw {{ text-align: center; }}
    .sw .chip {{ display: block; width: 40px; height: 40px; margin: 0 auto 7px; border-radius: 50%; }}
    .sw .wheel {{ background: conic-gradient(#f24822,#ffc943,#66d575,#5ad8cc,#3dadff,#874fff,#f849c1,#f24822); }}
    .sw b {{ display: block; font-size: 11.5px; font-weight: 650; }}
    .sw code {{ display: block; margin-top: 2px; color: var(--faint); font: 500 10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    table {{ width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }}
    th, td {{ padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--line); line-height: 1.5; }}
    th {{ background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }}
    td.c {{ text-align: center; color: var(--accent); }}
    tr:last-child td {{ border-bottom: none; }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .note {{ margin-top: 22px; padding: 18px 20px; border: 1px solid #c9caf5; border-radius: 16px; background: var(--accent-soft); font-size: 15px; line-height: 1.6; }}
    footer {{ margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }}
    @media (max-width: 900px) {{ .grid2, .grid3, .state {{ grid-template-columns: 1fr; }} .row {{ grid-template-columns: repeat(6, 1fr); }} }}
  </style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; reference capture &middot; 2026-09-01</p>
  <h1>FigJam's appearance menu, control by control</h1>
  <p class="lede">
    Every popover behind every control, for all five selection states, captured from the running editor.
    Panel sizes and control counts are read from FigJam's own DOM; the palette's names come from its
    tooltips and its values from the pixels, confirmed by applying a colour and reading it back off the
    canvas. Companion to the
    <a href="figjam-contextual-menu-spec-2026-09-01.html">placement specification</a>, which covers where
    this menu goes; this one covers what is inside it.
  </p>
  <div class="chips">
    <span class="chip-tag ok">5 states &middot; 33 controls</span>
    <span class="chip-tag ok">12 popovers</span>
    <span class="chip-tag">22-cell palette, named and measured</span>
    <span class="chip-tag">FigJam web, 2026-09-01</span>
  </div>

  <div class="note">
    <b>The shape of the thing.</b> FigJam's whole appearance vocabulary is small and closed: 20 colours plus
    a picker, 2 stroke weights, 3 stroke styles, 4 typefaces, 5 text sizes, 3 alignments, 3 line routings,
    6 line endings. There is no opacity, no vertical text alignment, no corner radius, and no stroke weight
    for shapes at all. That closure is the point &mdash; it is what stops a board drifting into fifteen
    slightly different greys.
  </div>

  <section>
    <h2>1 &middot; The five states</h2>
    <p class="sub">
      Which controls appear is driven entirely by what the selection <em>has</em>. Adding text to a shape
      appends the typography group; adding a label to a connector removes the <em>Add text</em> button and
      changes what the colour control targets.
    </p>
    <div class="states">
      {''.join(f'''
      <div class="state">
        <img src="{figure(asset)}" alt="The FigJam selection menu for {name.lower()}">
        <div class="copy">
          <h3>{name}</h3>
          <span class="w">{width} px wide &middot; {len(controls)} controls</span>
          <ol>{''.join(f'<li>{control}</li>' for control in controls)}</ol>
        </div>
      </div>''' for name, asset, width, controls in STATES)}
    </div>
  </section>

  <section>
    <h2>2 &middot; The palette</h2>
    <p class="sub">
      One 11&times;2 grid, reused by every colour control on every object. Row&nbsp;1 is the saturated set,
      row&nbsp;2 its light twin in the same hue order, and the last cell of row&nbsp;2 is the custom picker.
      Swatches are 24&nbsp;px circles on a 32&nbsp;px pitch, inset 12&nbsp;px from the panel edge.
    </p>
    <div class="palette">
      <div class="row">{swatch_cells(PALETTE_ROW_1)}</div>
      <div class="row">{swatch_cells(PALETTE_ROW_2)}</div>
    </div>
    <div class="note">
      <b>Black is <code>#1E1E1E</code>, not black.</b> It is the same value as the menu surface itself, which
      is why the first swatch reads as an empty ring on the dark panel. Confirmed twice: by filling a shape
      with it and sampling the canvas, and by reading the hex field in the custom picker. An implementation
      that reaches for <code>#000000</code> will be visibly wrong next to a pasted FigJam board.
    </div>
  </section>

  <section>
    <h2>3 &middot; The popovers</h2>
    <p class="sub">
      All of them share the pill's surface: <code>rgb(30,30,30)</code>, 13&nbsp;px radius, 8&nbsp;px padding,
      opening 8&nbsp;px above the pill and clamped to the viewport. Sizes below are as measured.
    </p>
    <div class="grid2">
      {''.join(f'''
      <figure>
        <img src="{figure(asset)}" alt="{name} popover in FigJam">
        <figcaption><b>{name}</b> &middot; {size}<br>{body}</figcaption>
      </figure>''' for name, asset, size, body in POPOVERS)}
    </div>
  </section>

  <section>
    <h2>4 &middot; Control matrix</h2>
    <p class="sub">
      What is reachable from the pill for each kind of selection. A dot means the control is present;
      everything absent is absent by design, not by omission.
    </p>
    <table>
      <tr><th>Control</th><th style="text-align:center">Shape</th><th style="text-align:center">Connector</th><th style="text-align:center">Shape text</th><th style="text-align:center">Text object</th></tr>
      {''.join(f'<tr><td>{name}</td><td class="c">{a}</td><td class="c">{b}</td><td class="c">{c}</td><td class="c">{d}</td></tr>' for name, a, b, c, d in MATRIX)}
    </table>
    <p class="sub" style="margin-top:14px; font-size:14px">
      <sup>1</sup> only while the connector has no label &mdash; the button disappears once one exists.
      &nbsp;<sup>2</sup> the connector's colour control switches to <em>Text background</em> once it has a
      label, with a show/hide eye.
    </p>
  </section>

  <section>
    <h2>5 &middot; Notes for the port</h2>
    <p class="sub">
      Observations that matter when this becomes SystemSketch's own appearance menu, rather than things you
      can see in a screenshot.
    </p>
    <table>
      <tr><th>Observation</th><th>Consequence</th></tr>
      <tr>
        <td>Every colour control is the <em>same</em> 22-cell grid; only the row above it changes
        (Fill/Transparent/No&nbsp;fill, Solid/Dashed/None, Text&nbsp;background, or nothing).</td>
        <td>One palette component with an optional mode row covers all four colour popovers.</td>
      </tr>
      <tr>
        <td>Font sizes are a five-rung ladder with a numeric escape hatch, and each row is drawn at its own
        size.</td>
        <td>Sizes are a named enum, not a slider. The preview <em>is</em> the label.</td>
      </tr>
      <tr>
        <td>Shapes have no stroke-weight control; connectors have exactly two weights.</td>
        <td>Stroke weight is a connector property in this model, not a universal one.</td>
      </tr>
      <tr>
        <td>Text inside a shape has no colour control at all.</td>
        <td>Shape text colour is derived, not authored. Excalidraw differs here &mdash; it lets you select the
        text and colour it &mdash; so this is a real fork in the road.</td>
      </tr>
      <tr>
        <td>There is no vertical alignment, no opacity, and no corner radius anywhere.</td>
        <td>Three controls Excalidraw has that FigJam does not. Worth deciding deliberately rather than
        inheriting by accident.</td>
      </tr>
      <tr>
        <td>The shape switcher is the only popover with a search field, and it scrolls well past 30 shapes.</td>
        <td>It is a library picker wearing a popover, not a segmented control.</td>
      </tr>
    </table>
  </section>

  <footer>
    <p>
      <b>Method.</b> A copy of the signed-in Chrome profile driven over the DevTools Protocol on an
      off-screen X display, against a scratch FigJam draft at 100% browser zoom. For each state the harness
      walks every control in the pill, opens it, records the panel's geometry and every item inside it, and
      captures the panel at 2&times;. Nothing in any existing Figma file was read or written.
    </p>
    <p>
      <b>Scope.</b> One viewport (1680&times;857, dpr&nbsp;1), the free plan, the build served on 2026-09-01.
      Line-ending sets were counted at their default state; the <b>&hellip;</b> overflow was not expanded.
      Rebuild with <code>python3 docs/build_figjam_appearance_spec.py</code>.
    </p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
