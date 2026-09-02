"""Build the appearance menu implementation report.

Frames are written by `tests/appearance_menu_smoke.mjs` during the run that
asserts the behaviour they show.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import journey_results, line_count, unit_test_count

DOCS_DIR = Path(__file__).resolve().parent
REPO = DOCS_DIR.parent
OUTPUT_PATH = DOCS_DIR / "appearance-menu-implementation-2026-09-01.html"

FRAMES = {
    "color": "appearance-menu-1-color-2026-09-01.png",
    "shape": "appearance-menu-2-shape-2026-09-01.png",
    "connector": "appearance-menu-3-connector-2026-09-01.png",
}


def figure(key: str) -> str:
    data = base64.b64encode((DOCS_DIR / FRAMES[key]).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


CONTROLS = [
    ("Shape", "<code>tldraw:geo</code>", "20", "Searchable-style library grid, 5 per row.",
     "FigJam's picker searches; this one lists, because 20 fits without one."),
    ("Color", "<code>tldraw:color</code>", "13", "Swatch grid, 7 columns.",
     "FigJam has 11 saturated hues over 11 light ones; tldraw carries only four light variants, so the "
     "grid pairs each hue with its twin instead of leaving seven holes."),
    ("Fill", "<code>tldraw:fill</code>", "6", "Labelled mode row above the palette.",
     "Exactly FigJam's Fill / Transparent / No fill idea, with tldraw's three extra treatments."),
    ("Stroke", "<code>tldraw:dash</code>", "5", "Icon row.",
     "FigJam has Solid / Dashed / None. tldraw adds <code>draw</code> &mdash; its default &mdash; and "
     "<code>dotted</code>; both are shown, see below."),
    ("Size", "<code>tldraw:size</code>", "4", "Named list, drawn at its own weight.",
     "FigJam's five-rung 16/24/40/64/96 ladder, on tldraw's four rungs. In tldraw this one prop drives "
     "stroke weight <em>and</em> text size together; FigJam separates them."),
    ("Typeface", "<code>tldraw:font</code>", "4", "Named list, each in its own face.",
     "A clean four-for-four: Simple, Bookish, Technical, Scribbled &mdash; FigJam's names, tldraw's "
     "sans / serif / mono / draw."),
    ("Text alignment", "<code>tldraw:horizontalAlign</code>", "3", "Icon row.", "Left, centre, right."),
    ("Vertical alignment", "<code>tldraw:verticalAlign</code>", "3", "Icon row.",
     "FigJam has none; Excalidraw does, and so does tldraw."),
    ("Line shape", "<code>tldraw:arrowKind</code> / <code>tldraw:spline</code>", "2", "Icon row.",
     "FigJam offers three routings; tldraw's arrows are arc or elbow, and its lines cubic or straight."),
    ("Start / End point", "<code>tldraw:arrowheadStart</code> / <code>End</code>", "9", "Icon row.",
     "FigJam shows six and hides the rest behind a &hellip;; tldraw has nine and shows them all."),
]

DELTAS = [
    (
        "One colour, not two",
        "FigJam gives a shape a separate stroke colour and fill colour, each with its own palette.",
        "tldraw has a single <code>color</code> per shape that tints both. Repeating the grid under Stroke "
        "would be two controls writing one value &mdash; an alias that reads as a bug the first time you "
        "change one and the other moves. Colour lives in the colour popover only.",
    ),
    (
        "Every value, not FigJam's subset",
        "FigJam's stroke styles are Solid / Dashed / None.",
        "A menu that cannot show a state the document can hold is broken, not tidy. tldraw's default dash is "
        "<code>draw</code>: hide it and a freshly drawn shape opens its own stroke popover with nothing "
        "selected. The smoke test asserts <code>draw</code> is present and checked for a new shape.",
    ),
    (
        "Size is one control, not two",
        "FigJam has a stroke weight (2 values, connectors only) and a font size (5 values) as separate controls.",
        "In tldraw <code>size</code> drives both. Splitting them would need a custom style prop and a schema "
        "change, which is the boundary this repo deliberately keeps.",
    ),
    (
        "No opacity",
        "Neither does FigJam. Excalidraw does.",
        "tldraw has <code>getSharedOpacity</code>/<code>setOpacityForSelectedShapes</code> ready, so this is "
        "a one-control addition whenever it is wanted &mdash; left out because the brief was FigJam first.",
    ),
    (
        "A Block contributes nothing, but does not block its neighbours",
        "n/a &mdash; FigJam has no equivalent of a Block.",
        "A Block defines its own style props (<code>systemsketch:blockView</code> and friends) and none of "
        "tldraw's, so it has no appearance to edit and the Block-only pill is unchanged. The catch is that "
        "the Block branch owns the <em>whole</em> pill: without care, selecting a Block alongside a "
        "rectangle would put the rectangle's colour out of reach. The controls therefore ride on both "
        "branches and hide themselves when the selection has no styles.",
    ),
    (
        "Typography shows before there is text",
        "FigJam only grows the typography group once a shape actually has a label.",
        "tldraw reports font and alignment as relevant for any geo shape, since every geo shape can carry a "
        "label. Following tldraw here means you can set the type before you type; it is a deviation, not an "
        "oversight.",
    ),
]


MODEL = "src/appearance/appearanceModel.ts"
MODEL_TESTS = "src/appearance/appearanceModel.test.ts"
SHELL = "src/appearance/AppearanceControls.tsx"
GLYPHS = "src/appearance/AppearanceGlyph.tsx"
SMOKE = "tests/appearance_menu_smoke.mjs"

# The journey's own results, not its source. Reading the run's output proves
# each verdict happened; `journey_results` then refuses if those verdicts predate
# either the journey or the newest file under src/, because a peer refactoring
# the product invalidates every browser verdict on disk.
CHECKS = [row["label"] for row in journey_results(
    DOCS_DIR / "appearance-menu-results.json", REPO / "tests/appearance_menu_smoke.mjs", REPO / "src")]
UNIT_TESTS = unit_test_count(MODEL_TESTS)
CONTROL_COUNT = len(CONTROLS)

FILES = [
    (MODEL, f"{UNIT_TESTS} unit tests",
     "Which controls a selection gets and what each offers, as a pure function of tldraw's "
     "<code>ReadonlySharedStyleMap</code>. No React, no DOM."),
    (SHELL, f"{line_count(SHELL)} lines",
     "One <code>TldrawUiPopover</code> per control; writes go through "
     "<code>markHistoryStoppingPoint</code> + <code>setStyleForSelectedShapes</code> + "
     "<code>setStyleForNextShapes</code>, the same path tldraw's own panel uses."),
    (GLYPHS, f"{line_count(GLYPHS)} lines",
     "FigJam previews a value rather than naming it &mdash; sizes drawn at their weight, endings drawn as "
     "lines, fills drawn on one square so they can be compared."),
    ("src/appearance/appearance.css", "FigJam tokens",
     "<code>rgb(30,30,30)</code>, 13px radius, 8px padding, 8px clear of the pill."),
    (SMOKE, f"{len(CHECKS)} checks",
     "Drives the real product composition and reads two oracles per change."),
]


def build() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; Appearance menu implementation</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a; --muted: #626975; --faint: #8b93a1;
      --line: #dfe3e9; --paper: #f7f8fa; --card: #ffffff;
      --accent: #5b5ee5; --accent-soft: #eeefff;
      --green: #177245; --green-soft: #e9f8ef;
      --amber: #8a5a00; --amber-soft: #fff5e0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 96px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 900px; margin: 0; font-size: clamp(40px, 5.6vw, 70px); line-height: .97; letter-spacing: -.05em; }}
    .lede {{ max-width: 800px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }}
    .chip {{ display: inline-flex; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .chip.ok {{ border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    h3 {{ margin: 30px 0 6px; font-size: 18px; letter-spacing: -.02em; }}
    .sub {{ margin: 0 0 22px; max-width: 800px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28,34,48,.06); }}
    figure img {{ display: block; width: 100%; height: auto; }}
    figcaption {{ padding: 13px 17px 15px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }}
    figcaption b {{ color: var(--ink); }}
    .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
    table {{ width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }}
    th, td {{ padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.55; }}
    th {{ background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }}
    td.n {{ text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }}
    tr:last-child td {{ border-bottom: none; }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre {{ margin: 20px 0 0; padding: 20px 22px; overflow-x: auto; border: 1px solid #23262e; border-radius: 16px; background: #191b21; color: #e6e8ee; font: 500 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre .c {{ color: #8f96a6; }}
    pre .k {{ color: #ff8fbe; }}
    pre .n2 {{ color: #9fd0ff; }}
    ul.checks {{ margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }}
    ul.checks li {{ display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: baseline; padding: 12px 15px; border: 1px solid #c7e6d3; border-radius: 13px; background: var(--green-soft); font-size: 14.5px; }}
    ul.checks b {{ color: var(--green); font: 750 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .delta {{ margin-top: 14px; padding: 18px 20px; border: 1px solid #f0d9a8; border-radius: 16px; background: var(--amber-soft); }}
    .delta h3 {{ margin: 0 0 6px; color: #6b4500; font-size: 16px; }}
    .delta p {{ margin: 0 0 8px; font-size: 14.5px; color: var(--amber); }}
    .delta p:last-child {{ margin-bottom: 0; }}
    .delta .figjam {{ color: #7a6440; font-style: italic; }}
    .note {{ margin-top: 22px; padding: 18px 20px; border: 1px solid #c9caf5; border-radius: 16px; background: var(--accent-soft); font-size: 15px; line-height: 1.6; }}
    footer {{ margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }}
    @media (max-width: 900px) {{ .grid2 {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; implementation report &middot; 2026-09-01</p>
  <h1>You can change how things look now</h1>
  <p class="lede">
    SystemSketch ships with tldraw's style panel switched off, so until now a shape's colour, fill, stroke,
    size, typeface, alignment, routing and endpoints could not be changed on canvas at all. The selection
    pill now carries them, laid out the way
    <a href="figjam-appearance-menu-spec-2026-09-01.html">FigJam lays them out</a>, over tldraw's own styles.
  </p>
  <div class="chips">
    <span class="chip ok">{len(CHECKS)}/{len(CHECKS)} browser checks</span>
    <span class="chip ok">{UNIT_TESTS} model unit tests</span>
    <span class="chip">{CONTROL_COUNT} controls &middot; 0 new shape props</span>
    <span class="chip">tldraw 5.3.2, unforked</span>
  </div>

  <div class="note">
    <b>The closed vocabulary is the feature.</b> Every option is a value tldraw's style system already
    accepts, so the menu can only ever ask for a state a shape can actually hold &mdash; and there is no free
    colour picker, no stroke-width slider, no arbitrary font size. That is the same discipline you get from
    a formatter: fewer choices, and a board that stays coherent because of it.
  </div>

  <section>
    <h2>1 &middot; What it does</h2>
    <div class="grid2">
      <figure>
        <img src="{figure('color')}" alt="A selected rectangle in SystemSketch with the colour popover open above the pill">
        <figcaption><b>Colour.</b> FigJam's fill row stacked over the palette in one popover, 8&nbsp;px clear of the pill, on the pill's own surface. The current colour is ringed; the current fill is filled.</figcaption>
      </figure>
      <figure>
        <img src="{figure('shape')}" alt="The shape picker open, listing twenty geo shapes">
        <figcaption><b>Shape.</b> Every geo tldraw knows, five to a row, each drawn as itself. Choosing one turns the selected rectangle into that shape in a single history step.</figcaption>
      </figure>
    </div>
    <figure style="margin-top:18px">
      <img src="{figure('connector')}" alt="A selected connector showing routing and endpoint controls instead of shape and fill">
      <figcaption><b>Connectors get different controls.</b> No shape, no fill; routing and two endpoints instead. Nothing decides this by hand &mdash; the controls are whatever <code>useRelevantStyles()</code> says applies, which is the same driven-by-what-the-selection-has rule FigJam uses.</figcaption>
    </figure>
  </section>

  <section>
    <h2>2 &middot; The controls</h2>
    <p class="sub">
      {CONTROL_COUNT} controls over stock tldraw styles. No new shape props, no schema change, nothing that would move
      the boundary this repo guards.
    </p>
    <table>
      <tr><th>Control</th><th>tldraw style</th><th class="n">Values</th><th>Popover</th><th>Against FigJam</th></tr>
      {''.join(f'<tr><td><b>{name}</b></td><td>{style}</td><td class="n">{count}</td><td>{layout}</td><td>{note}</td></tr>' for name, style, count, layout, note in CONTROLS)}
    </table>
    <pre><span class="c">// The write path, straight out of tldraw's own style panel</span>
editor.markHistoryStoppingPoint(<span class="n2">'appearance'</span>)
editor.run(() => {{
  <span class="k">if</span> (editor.isIn(<span class="n2">'select'</span>)) editor.setStyleForSelectedShapes(style, value)
  editor.setStyleForNextShapes(style, value)
}})</pre>
  </section>

  <section>
    <h2>3 &middot; Where it deliberately differs from FigJam</h2>
    <p class="sub">
      Five decisions worth arguing with. Each is a consequence of building on tldraw's styles rather than a
      shortcut, and each is reversible.
    </p>
    {''.join(f'''
    <div class="delta">
      <h3>{title}</h3>
      <p class="figjam">FigJam: {figjam}</p>
      <p>{ours}</p>
    </div>''' for title, figjam, ours in DELTAS)}
  </section>

  <section>
    <h2>4 &middot; Live proof</h2>
    <p class="sub">
      <code>npm run test:appearance</code> drives the real product composition on an isolated board. Every
      change is checked against <em>two</em> oracles: the pill's own label, which comes from
      <code>useRelevantStyles()</code> and so round-trips through the document, and the painted
      <code>stroke</code> attribute on the canvas. A change that only moved the UI fails.
    </p>
    <ul class="checks">
      {''.join(f'<li><b>PASS</b><span>{check}</span></li>' for check in CHECKS)}
    </ul>
    <div class="note">
      <b>One bug this found is worth keeping in mind.</b> <code>TldrawUiPopover</code> computes its open
      state as <code>open || isOpen</code> &mdash; it ORs any <code>open</code> prop with its own
      <code>useMenuIsOpen</code>. A component that also tracks the state can therefore open a popover but
      never close it, and clicking the trigger again does nothing. The fix is to pass neither prop and style
      on Radix's <code>data-state="open"</code>.
    </div>
  </section>

  <section>
    <h2>5 &middot; The change</h2>
    <table>
      <tr><th>File</th><th>Carries</th><th>What it is</th></tr>
      {''.join(f'<tr><td><code>{path}</code></td><td>{size}</td><td>{what}</td></tr>' for path, size, what in FILES)}
    </table>
  </section>

  <footer>
    <p>
      <b>Reproduce.</b> <code>npm run test:appearance</code> for the browser proof and its frames;
      <code>npm run check</code> for types and the unit suites. Rebuild this page with
      <code>python3 docs/build_appearance_menu_implementation.py</code>.
    </p>
    <p>
      <b>Not yet done.</b> Opacity, a custom colour picker, and FigJam's separate stroke weight all need
      either a tldraw API that exists but is unused (opacity) or a custom style prop (the other two). Rich
      text &mdash; bold, strikethrough, links, lists &mdash; is a separate tldraw feature with its own
      toolbar and is untouched here.
    </p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
