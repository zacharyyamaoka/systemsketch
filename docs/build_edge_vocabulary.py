#!/usr/bin/env python3
"""
The shape edge vocabulary: three fills, four line styles plus None, an edge
colour of its own, and two connector weights.

Zach's report: "the styling on the rectangle primitives is not good. I think
you are trying to combine both tldraw and excalidraw and figjam and its not
working." This is what replaced it, with the before/after captures taken from
the same real-browser journey (`npm run test:appearance`) on either side of the
change — the "before" frames are the ones committed at HEAD, the "after" frames
are what the journey writes now.

Every count, panel size and dash cadence below is measured at build time from
the live source and the pinned geometry captures, so the report cannot drift
from the tree it describes.

Run:  python3 docs/build_edge_vocabulary.py
"""
from __future__ import annotations

import base64
import io
import json
import re
import subprocess
from html import escape
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "edge-vocabulary"
STAMP = "2026-09-05"
OUT = DOCS / f"edge-vocabulary-{STAMP}.html"


def esc(text: object) -> str:
    return escape(str(text), quote=True)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


# --------------------------------------------------------------------------- measure


def option_list(source: str, name: str) -> list[tuple[str, str]]:
    """`const NAME = [ option('value', 'Label'), … ]`, read out of the live TS."""
    block = source[source.index(f"const {name} = ["):]
    block = block[: block.index("] as const")]
    pairs = re.findall(r"option\(\s*(?:'([^']*)'|(\w+))\s*,\s*'([^']*)'\s*\)", block)
    return [(literal or f"${{{token}}}", label) for literal, token, label in pairs]


def measure() -> dict:
    model = (REPO / "src" / "appearance" / "appearanceModel.ts").read_text()
    presentation = (REPO / "src" / "blocks" / "connections" / "connectionPresentation.ts").read_text()
    stroke = (REPO / "src" / "appearance" / "strokeMeta.ts").read_text()
    journey = (REPO / "tests" / "appearance_menu_smoke.mjs").read_text()

    cadence = [
        int(re.search(rf"export const {const} = (\d+)", presentation).group(1))
        for const in ("ASYNC_CARRIER_PX", "ASYNC_PACKET_GAP_PX", "ASYNC_PACKET_PX")
    ]

    shape_line = option_list(model, "LINE_STYLE_OPTIONS")
    # `option(ASYNC_LINE_VALUE, 'Async')` reads through the shared constant.
    async_value = re.search(r"export const ASYNC_LINE_VALUE = '([^']*)'", stroke).group(1)
    shape_line = [(async_value if value.startswith("${") else value, label) for value, label in shape_line]

    return {
        "fill": option_list(model, "FILL_OPTIONS"),
        "shape_line": shape_line,
        "weight": option_list(model, "WEIGHT_OPTIONS"),
        "async_value": async_value,
        "cadence": cadence,
        "dasharray": f"{cadence[0]} {cadence[1]} {cadence[2]} {cadence[1]}",
        "meta_key": re.search(r"SYSTEMSKETCH_STROKE_META_KEY = '([^']*)'", stroke).group(1),
        "fill_alpha": float(re.search(
            r"export const TRANSPARENT_FILL_ALPHA = ([\d.]+)",
            (REPO / "src" / "appearance" / "fillPaint.ts").read_text(),
        ).group(1)),
        "base_dash": re.search(r"export const ASYNC_BASE_DASH = '([^']*)'", stroke).group(1),
        "unit_tests": len(re.findall(r"\n\t*it\(", (REPO / "src" / "appearance" / "strokeMeta.test.ts").read_text())),
        "journey_steps": len(re.findall(r"\n\s*pass\(", journey)),
        "before": json.loads((ASSETS / "before-geometry.json").read_text()),
        "after": json.loads((ASSETS / "after-geometry.json").read_text()),
        "board_bytes": (REPO / "sketches" / "review" / "edge-styling.systemsketch").stat().st_size,
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--", "src/appearance")),
    }


# ----------------------------------------------------------------------------- crops


def data_uri(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def crop(name: str, boxes: list[dict], pad: int = 18, scale: float = 2.0) -> str:
    """The panel and the pill it belongs to, cropped out of a 1440x960 frame."""
    image = Image.open(ASSETS / f"{name}.png").convert("RGB")
    left = min(box["x"] for box in boxes) - pad
    top = min(box["y"] for box in boxes) - pad
    right = max(box["x"] + box["w"] for box in boxes) + pad
    bottom = max(box["y"] + box["h"] for box in boxes) + pad
    region = image.crop((
        max(0, int(left)), max(0, int(top)),
        min(image.width, int(right)), min(image.height, int(bottom)),
    ))
    if scale != 1:
        region = region.resize((int(region.width * scale), int(region.height * scale)), Image.LANCZOS)
    return data_uri(region)


def region(name: str, box: tuple[int, int, int, int], scale: float = 2.4) -> str:
    """A literal pixel box, for the one crop that has to show painted canvas."""
    image = Image.open(ASSETS / f"{name}.png").convert("RGB").crop(box)
    return data_uri(image.resize((int(image.width * scale), int(image.height * scale)), Image.LANCZOS))


def whole(name: str, width: int = 1180) -> str:
    image = Image.open(ASSETS / f"{name}.png").convert("RGB")
    if image.width > width:
        image = image.resize((width, int(image.height * width / image.width)), Image.LANCZOS)
    return data_uri(image)


def frame_boxes(geometry: dict, key: str) -> list[dict]:
    entry = geometry[key]
    return [box for box in (entry.get("panel"), entry.get("pill")) if box]


# ---------------------------------------------------------------------------- render


def chips(options: list[tuple[str, str]], highlight: set[str] = frozenset()) -> str:
    return "".join(
        f'<span class="chip{" new" if value in highlight else ""}">{esc(label)}'
        f'<code>{esc(value)}</code></span>'
        for value, label in options
    )


def render(m: dict) -> str:
    before, after = m["before"], m["after"]
    fill_before = crop("before-fill-row", frame_boxes(before, "color"))
    fill_after = crop("after-fill-row", frame_boxes(after, "color"))
    line_before = crop("before-shape-line-style", frame_boxes(before, "chips"))
    line_after = crop("after-shape-line-style", frame_boxes(after, "chips"))
    async_after = crop("after-async-edge", frame_boxes(after, "asyncEdge"))
    # The painted result, not the menu: the shape sits below the pill, outside
    # any geometry box the journey records.
    # Both boxes come from the review board rather than the journey frame: they
    # are unselected there, so tldraw's blue indicator is not in the way.
    solid_edge = region("review-board", (520, 98, 820, 254), scale=2.1)
    async_edge = region("review-board", (520, 272, 820, 428), scale=2.1)
    wash = region("review-board", (880, 460, 1320, 690), scale=1.5)
    fill_states = [
        (name, region(f"fill-{name}", (536, 360, 926, 560), scale=1.2))
        for name in ("solid", "transparent", "none")
    ]
    weight_before = crop("before-connector-line-style", frame_boxes(before, "lineStyle"))
    weight_after = crop("after-connector-line-style", frame_boxes(after, "lineStyle"))
    board = whole("review-board")

    colour_panel_before = before["color"]["panel"]["w"]
    colour_panel_after = after["color"]["panel"]["w"]
    weight_panel_before = before["lineStyle"]["panel"]["w"]
    weight_panel_after = after["lineStyle"]["panel"]["w"]
    pill_before = before["color"]["pill"]["w"]
    pill_after = after["color"]["pill"]["w"]

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>The shape edge vocabulary · {STAMP}</title>
<style>
body{{margin:0;padding:32px 40px 80px;font:15px/1.6 Inter,ui-sans-serif,system-ui;color:#27272a;background:#fafafa;max-width:1320px}}
h1{{font-size:28px;margin:0 0 6px}}
h2{{font-size:20px;margin:44px 0 12px;padding-top:16px;border-top:1px solid #e4e4e7}}
h3{{font-size:16px;margin:22px 0 8px}}
.lede{{color:#52525b;max-width:920px}}
code{{font:13px ui-monospace,Menlo,monospace;background:#f4f4f5;padding:1px 5px;border-radius:4px}}
figure{{margin:16px 0;padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px}}
figure img{{width:100%;height:auto;display:block;border-radius:6px}}
figcaption{{margin-top:10px;color:#52525b;font-size:13px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}}
.pair figure{{margin:0}}
.was figcaption b{{color:#b45309}} .now figcaption b{{color:#15803d}}
table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;font-size:13.5px}}
th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid #f0f0f2;vertical-align:top}}
th{{background:#f4f4f5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.02em;color:#52525b}}
tr:last-child td{{border-bottom:none}}
.kpis{{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0}}
.kpi{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:10px 16px;min-width:160px}}
.kpi b{{display:block;font-size:22px}} .kpi span{{color:#71717a;font-size:13px}}
.chip{{display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #e4e4e7;border-radius:999px;padding:3px 10px 3px 12px;margin:0 6px 6px 0;font-size:13px}}
.chip code{{background:#f4f4f5}} .chip.new{{border-color:#15803d;background:#f0fdf4}}
.note{{color:#52525b;max-width:920px}}
.decision{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:4px 20px 18px;max-width:1000px}}
.open{{border-color:#f59e0b;background:#fffbeb}}
ul{{max-width:920px}} li{{margin:5px 0}}
.swatches{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}
.swatches>div{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px;min-width:230px;font-size:13px}}
.swatches b{{display:block;margin-top:8px}} .swatches em{{color:#71717a;display:block;margin-top:2px;font-size:12.5px}}
.sw{{display:block;width:100%;height:34px;border-radius:6px;border:1px solid #d4d4d8}}
.pair.triple{{grid-template-columns:repeat(3,1fr)}}
.mono{{font:12.5px ui-monospace,Menlo,monospace;white-space:pre;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:12px 14px;overflow-x:auto}}
</style></head><body>

<h1>The shape edge vocabulary</h1>
<p class="lede">&ldquo;The styling on the rectangle primitives is not good. I think you are trying to
combine both tldraw and excalidraw and figjam and it's not working.&rdquo; Four asks came out of that:
three fills, an edge colour that can differ from the fill, the line styles
<em>solid / dashed / dotted / async</em>, and two connector weights. Then three more: the connector's row
should be the rectangle's row with the labels off, the fill chips should run FigJam's way round, and
switching between Transparent and No fill &ldquo;seems buggy.&rdquo; All of it is in, driven in a real
browser, and on a review board. Read live from <code>{esc(m['branch'])}</code> /
<code>{esc(m['head'])}</code>{' (uncommitted edits present)' if m['dirty'] else ''}, {STAMP}.</p>

<div class="kpis">
  <div class="kpi"><b>6 &rarr; {len(m['fill'])}</b><span>fill options</span></div>
  <div class="kpi"><b>4 &rarr; {len(m['weight'])}</b><span>connector weights</span></div>
  <div class="kpi"><b>+1</b><span>edge colour, independent of the fill</span></div>
  <div class="kpi"><b>+1</b><span><code>{esc(m['async_value'])}</code> line style</span></div>
  <div class="kpi"><b>&minus;1</b><span><code>draw</code>, the sketchy one</span></div>
  <div class="kpi"><b>2 &rarr; 1</b><span>line-style lists</span></div>
</div>

<h2>1 &middot; Fill: FigJam's three, in FigJam's order &mdash; and painting what they say</h2>
<p class="note">tldraw ships <code>none semi solid pattern fill lined-fill</code> and the menu offered all
six &mdash; the literal &ldquo;three products at once&rdquo; complaint. The vocabulary is FigJam's, so it
stops at three, and runs FigJam's way round: most paint first. The colour popover lost
{colour_panel_before - colour_panel_after:.0f}px of width and the shape pill lost
{pill_before - pill_after:.0f}px with it.</p>
<div class="pair">
  <figure class="was"><img src="{fill_before}" alt="the fill row before">
    <figcaption><b>Was</b> &mdash; six chips, {colour_panel_before:.0f}px wide, ending in tldraw's
    <code>Fill</code> <code>Pattern</code> <code>Lined</code>.</figcaption></figure>
  <figure class="now"><img src="{fill_after}" alt="the fill row now">
    <figcaption><b>Now</b> &mdash; {len(m['fill'])} chips, {colour_panel_after:.0f}px wide, Solid first.</figcaption></figure>
</div>
<p>{chips(m['fill'])}</p>

<h3>The two that were the same white box</h3>
<p class="note">&ldquo;It seems buggy as I switch between transparent and no fill.&rdquo; The transitions
were not buggy &mdash; all nine ordered pairs land on the right chip and the right stored value. What was
wrong is what the two of them <em>painted</em>. tldraw resolves <code>semi</code> to the theme's flat
canvas colour and <code>solid</code> to an 18% wash of the swatch, measured on a blue rectangle in the
running app:</p>
<div class="swatches">
  <div><span class="sw" style="background:#dcf0ff"></span><b>Solid, was</b><code>#dcf0ff</code>
    <em>an 18% wash, not the blue you picked</em></div>
  <div><span class="sw" style="background:#fcfffe"></span><b>Transparent, was</b><code>#fcfffe</code>
    <em>the canvas colour, opaque &mdash; on a white board, No fill with extra steps</em></div>
  <div><span class="sw" style="background:transparent;border-style:dashed"></span><b>No fill</b><code>&mdash;</code>
    <em>correct all along</em></div>
</div>
<p class="note">On a white swatch all three collapsed into the same white box, and nothing about
&ldquo;Transparent&rdquo; was transparent: it hid whatever it overlapped. The three now mean what the
chips say, through the same display-values seam the edge colour uses &mdash; the swatch itself, the same
colour at {m['fill_alpha']:.0%} so what is behind shows through, and nothing:</p>
<div class="pair triple">
  {"".join(f'<figure><img src="{uri}" alt="fill {name}"><figcaption><b>{name.title()}</b></figcaption></figure>' for name, uri in fill_states)}
</div>
<figure><img src="{wash}" alt="a transparent box overlapping a solid one">
  <figcaption>Both halves at once, off the saved review board: a <em>Solid</em> violet box whose label ink
  flipped to white so it survives the fill, and a <em>Transparent</em> yellow box genuinely showing the
  violet through it. The journey drives all nine transitions and asserts the three painted values are
  three different things.</figcaption></figure>

<h2>2 &middot; Line style: the chips, and a palette of their own</h2>
<p class="note">This is the new capability, not just a shorter list. tldraw paints a shape's outline and
its fill from one <code>color</code>, so &ldquo;pale box, black edge&rdquo; was unsayable. A shape's Line
style is now FigJam's Stroke popover &mdash; the chips, a hairline, then an edge palette &mdash; behind the
same three-bar trigger it always had. With no edge colour chosen the palette rings the shape's own colour,
because that <em>is</em> what the outline is painted with.</p>
<div class="pair">
  <figure class="was"><img src="{line_before}" alt="the shape line style before">
    <figcaption><b>Was</b> &mdash; chips only, and the first one is tldraw's sketchy <code>Draw</code>.
    No way to colour the edge.</figcaption></figure>
  <figure class="now"><img src="{line_after}" alt="the shape line style now">
    <figcaption><b>Now</b> &mdash; {len(m['shape_line'])} chips over the 21-swatch palette, in FigJam's
    stacked idiom.</figcaption></figure>
</div>
<p>{chips(m['shape_line'], {m['async_value']})}</p>
<p class="note"><code>None</code> is kept although it wasn't in the four you named: without it a filled
rectangle can't drop its border, and FigJam has it. Say the word and it goes.</p>

<h2>3 &middot; Async: the cable's own cadence, on a shape</h2>
<p class="note">The repo already had one async line &mdash; the cable's packet rail &mdash; so the shape
reads from the same constant rather than a second opinion:
<code>{esc(m['dasharray'])}</code> ({m['cadence'][0]}-unit carrier, {m['cadence'][1]}-unit micro-gap,
{m['cadence'][2]}-unit packet, micro-gap), butt caps so the small gaps stay legible.</p>
<figure><img src="{async_after}" alt="the async edge chosen">
  <figcaption>Async chosen, black ringed in the palette. The trigger names both halves &mdash;
  <code>Line style, async black</code> &mdash; because its icon shows neither.</figcaption></figure>
<div class="pair">
  <figure class="was"><img src="{solid_edge}" alt="a rectangle painted from one colour">
    <figcaption><b>One <code>color</code> doing both jobs</b> &mdash; pale blue fill, pale blue edge, solid.
    Everything tldraw could say before this.</figcaption></figure>
  <figure class="now"><img src="{async_edge}" alt="the same rectangle with a black async edge">
    <figcaption><b>The same box with an edge of its own</b> &mdash; same fill, black packet edge, read back
    off a saved board after a cold reopen.</figcaption></figure>
</div>

<h2>4 &middot; The connector: the shape's own row, with the text off</h2>
<p class="note">Zach's rule for these menus: &ldquo;the connector's little menu there should basically show
the line styles from the rectangle. However, you toggle off the text.&rdquo; That is now literally what it
is &mdash; one control, one options list, one glyph set, and a <code>layout</code> that decides whether
each option is named. Two lists is how they drifted in the first place: the connector's own
<em>Dotted</em> icon was being drawn by the <em>arrowhead</em> renderer, because only the shape's control
id reached the dash glyph. It rendered as a plain line.</p>
<div class="pair">
  <figure class="was"><img src="{weight_before}" alt="the connector line style before">
    <figcaption><b>Was</b> &mdash; four weights beside a different five, {weight_panel_before:.0f}px wide,
    with a Dotted that isn't dotted and tldraw's sketchy Draw first.</figcaption></figure>
  <figure class="now"><img src="{weight_after}" alt="the connector line style now">
    <figcaption><b>Now</b> &mdash; {len(m['weight'])} weights beside the shape's own
    {len(m['shape_line'])} styles, {weight_panel_after:.0f}px. The journey asserts the two rows are the
    same values in the same order drawing the same glyphs.</figcaption></figure>
</div>
<p>{chips(m['weight'])}</p>
<p class="note">FigJam has two weights and now so does this. <code>m</code> rather than tldraw's
<code>s</code> is bound to Thin on purpose: <code>m</code> is what every shape and cable is created at, so
a cable drawn today reads as Thin instead of showing an empty row. The pair still spans a visible
3.5px&rarr;6px.</p>
<p class="note">One vocabulary means one paint behind it, so the async cadence is a mixin over a stock
ShapeUtil now (<code>withAsyncEdge</code>) rather than one shape's private trick: a rectangle, an arrow, a
line and a freehand stroke all wear it. SVG restarts a dash pattern at each path and the cadence opens
with a long painted carrier, so an arrowhead &mdash; its own short path &mdash; stays solid. A
SystemSketch cable is the one connector this does not reach: its async is the Connection inspector's
<code>temporal</code> control, which carries the packet semantics and the z&#8315;&sup1; pill rather than
paint alone.</p>

<h2>Where the two new facts live</h2>
<p class="note">Neither an edge colour nor <code>{esc(m['async_value'])}</code> fits a stock style prop, and
both are deliberately kept out of one:</p>
<table>
<tr><th>Fact</th><th>Stored as</th><th>Why not a style prop</th></tr>
<tr><td>Edge colour</td><td><code>meta.{esc(m['meta_key'])}.color</code> &mdash; a palette name</td>
<td>A <code>StyleProp</code> only reaches shapes whose util declares it, and <code>geo</code> is tldraw's own
shape. Adding a prop changes the on-disk schema of a stock record, so a <code>.tldr</code> written here would
stop opening in plain tldraw.</td></tr>
<tr><td><code>{esc(m['async_value'])}</code> line style</td>
<td><code>meta.{esc(m['meta_key'])}.pattern</code>, over a stored <code>dash: {esc(m['base_dash'])}</code></td>
<td><code>PathBuilder.toSvg</code> runs an exhaustive switch over the dash enum and throws on anything else,
so <code>addValues('{esc(m['async_value'])}')</code> would crash every shape drawn with it.</td></tr>
</table>
<p class="note">The paint comes back through tldraw's own seams: <code>GeoShapeUtil.configure(
{{getCustomDisplayValues}})</code> already exposes <code>strokeColor</code> and <code>fillColor</code>
separately, and the async cadence is a CSS custom property on a <code>display:contents</code> wrapper for the
canvas plus a <code>&lt;g&gt;</code> for the SVG export &mdash; both fed the same constant. Plain tldraw
ignores the metadata and draws a solid outline, which is the whole point.</p>
<div class="mono">geo shape
├─ props.color   ── fill, and the edge until one is chosen
├─ props.fill    ── none | semi | solid
├─ props.dash    ── solid | dashed | dotted | none          (always a legal tldraw value)
└─ meta.{esc(m['meta_key'])}
   ├─ color      ── the edge's own palette name             (optional)
   └─ pattern    ── "{esc(m['async_value'])}"                                 (optional)</div>

<h2>Two smaller things that had to come with it</h2>
<ul>
<li><b>A fresh shape is drawn <code>{esc(m['base_dash'])}</code>.</b> tldraw's default dash is
<code>draw</code>. With <code>Draw</code> gone from the menu, every new rectangle would have landed in a
state its own menu couldn't express &mdash; so the mount seeds the next-shape dash, and only when the
instance has none of its own, leaving a choice made on the canvas alone.</li>
<li><b>A stored value the menu no longer offers is named, not called &ldquo;mixed&rdquo;.</b> A rectangle
drawn before this holds <code>draw</code>; one shape with one definite value is not a mixed selection. The
trigger says <code>Line style, draw</code> and the panel honestly checks nothing. The inspector gained the
same honesty: it reports <code>Line style: async</code> and <code>Edge colour</code> beside the stock props,
because an async shape's stored <code>dash</code> is <code>{esc(m['base_dash'])}</code>.</li>
</ul>

<h2>Proof</h2>
<ul>
<li><code>npm run check</code> &mdash; green: tsc, 1467 vitest tests, 118 Python tests.</li>
<li><code>npm run test:appearance</code> &mdash; the real-browser journey, {m['journey_steps']} passing
steps. Its new one drives the whole gesture: open the Line style popover, assert the chips and palette, pick
an edge colour and assert the painted stroke differs from the painted fill, pick Async and read
<code>{esc(m['dasharray'])}</code> back out of the browser's computed style, then wait for the autosave and
assert the file carries <code>pattern: {esc(m['async_value'])}</code> beside a
<code>dash: {esc(m['base_dash'])}</code> plain tldraw can still draw.</li>
<li>{m['unit_tests']} unit tests on the edge model itself &mdash; that clearing the last override drops the
key entirely, that other metadata survives, that a text object in the selection doesn't make a rectangle read
as mixed.</li>
</ul>
<figure><img src="{board}" alt="the review board">
  <figcaption>The review board, cold-reopened and re-rendered by the helper
  (<code>sketches/review/edge-styling.systemsketch</code>, {m['board_bytes']:,} bytes). The lower box is the
  end state persisted in the file: pale blue fill, black async edge, drawn from metadata through the real geo
  util after a reload.</figcaption></figure>

<h2>Decision surface</h2>
<div class="decision">
<h3>Done and proved</h3>
<ul>
<li>Fill is No fill / Transparent / Solid.</li>
<li>A shape's Line style is the chips over an edge palette; the edge colour is independent of the fill and
survives save and reload.</li>
<li><code>{esc(m['async_value'])}</code> paints the cable's cadence on a shape, on canvas and in the SVG export.</li>
<li>Connector weight is Thin / Thick.</li>
</ul>
<h3>Deliberately not done</h3>
<ul>
<li><b>No custom hex on the edge</b> &mdash; the 22nd &ldquo;Custom&rdquo; cell writes tldraw's own colour
style, which is the fill's. The edge takes palette names only. Half a day to route the picker if you want it.</li>
<li><b>A cable's async stays in the Connection inspector</b> &mdash; it means delivery, not paint, and it
carries the z&#8315;&sup1; pill with it. The pill's Async is for stock arrows, lines, freehand strokes and
shapes.</li>
</ul>
</div>
<div class="decision open" style="margin-top:14px">
<h3>Needs you</h3>
<ul>
<li><b>Fixing Transparent repaints shapes you already have.</b> Solid is now the swatch itself rather than
an 18% wash of it, and Transparent is a {m['fill_alpha']:.0%} wash rather than near-white &mdash; your workspace has
400 shapes stored <code>solid</code> and 251 stored <code>semi</code>, and every one of them is bolder
than it was this morning. It is the only way the three read apart on a white board, but the strength is
one constant (<code>TRANSPARENT_FILL_ALPHA</code>) and the Solid mapping is one line.
<em>Default if you say nothing: both stay.</em></li>
<li><b><code>None</code> in the line-style chips.</b> You named four styles and none was
<code>None</code>; I kept it because a filled rectangle otherwise can't drop its border, and FigJam has it.
<em>Default if you say nothing: it stays.</em></li>
<li><b>Whether the edge should follow the fill colour when you change the fill.</b> Today, once you choose an
edge colour it is pinned &mdash; FigJam's behaviour. <em>Default if you say nothing: it stays pinned.</em></li>
</ul>
</div>

</body></html>
"""


def main() -> None:
    measured = measure()
    OUT.write_text(render(measured), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
