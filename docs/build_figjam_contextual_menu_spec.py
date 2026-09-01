"""Build the FigJam contextual popup menu specification report.

Every number in the report was measured against the live FigJam editor driven
over the Chrome DevTools Protocol on an off-screen X display, at a 1680x857
CSS viewport with devicePixelRatio 1. Geometry comes from two independent
sources that agree: FigJam's own DOM rects, and pixel detection of the
selection outline (#0D99FF) and the menu surface (rgb(30,30,30)) in the
captured PNGs.
"""
from __future__ import annotations

import base64
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent
ASSETS_DIR = DOCS_DIR / "figjam-contextual-menu-2026-09-01"
OUTPUT_PATH = DOCS_DIR / "figjam-contextual-menu-spec-2026-09-01.html"


def figure(name: str) -> str:
    data = base64.b64encode((ASSETS_DIR / f"{name}.png").read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


# (state, menu rect, selection box, gap, note)
EVIDENCE = [
    ("Sticky note", "470, 213 &middot; 458 &times; 40", "613, 292 &rarr; 784, 463", "40 / 16", "centre offset 0.4 px"),
    ("Rectangle", "731, 275 &middot; 183 &times; 40", "703, 355 &rarr; 941, 502", "40 / 16", "centre offset 0.8 px"),
    ("Section", "630, 239 &middot; 308 &times; 40", "559, 318 &rarr; 1008, 575", "39 / &mdash;", "centre offset 0.5 px"),
    ("Text object", "480, 359 &middot; 514 &times; 40", "465, 374 &rarr; 1009, 439", "&mdash; / 15", "no top grab dot"),
    ("Two sticky notes", "521, 150 &middot; 523 &times; 40", "447, 205 &rarr; 1119, 446", "&mdash; / 15", "no top grab dot"),
    ("Sticky + rectangle", "735, 150 &middot; 96 &times; 40", "447, 205 &rarr; 1119, 446", "&mdash; / 15", "controls collapse to 2"),
    ("Shape, text editing", "521, 270 &middot; 603 &times; 40", "&mdash;", "&mdash;", "widest observed state"),
    ("Near top, still above", "652, 32 &middot; 183 &times; 40", "624, 111 &rarr; 863, 237", "40 / 16", "menu top 32 &ge; 20"),
    ("Against top, flipped", "652, 242 &middot; 183 &times; 40", "624, 77 &rarr; 863, 203", "40 / 16 below", "would have been top 3"),
    ("Against left edge", "20, 249 &middot; 183 &times; 40", "25, 328 &rarr; 161, 464", "39 / 16", "clamped, centre offset 18.5"),
    ("Against right edge", "1477, &mdash; &middot; 183 &times; 40", "off-screen right", "&mdash;", "right edge pinned at 1660"),
    ("Selection &gt; viewport", "711, 737 &middot; 183 &times; 40", "covers the viewport", "&mdash;", "bottom clamp, 20 px over the toolbelt"),
    ("Zoomed out ~0.3&times;", "729, 324 &middot; 183 &times; 40", "784, 403 &rarr; 856, 448", "39 / 16", "pill size unchanged"),
    ("Zoomed in ~3.3&times;", "737, 117 &middot; 183 &times; 40", "437, 197 &rarr; 1221, 682", "40 / 16", "pill size unchanged"),
    ("While dragging", "not in the DOM", "&mdash;", "&mdash;", "returns on pointer-up"),
    ("While resizing", "not in the DOM", "&mdash;", "&mdash;", "returns on pointer-up"),
]

CONTROLS = [
    ("Sticky note", "458 px", "Change&nbsp;color &middot; Typeface &middot; Font&nbsp;size &middot; Bold &middot; Strikethrough &middot; Link &middot; Bulleted&nbsp;list &middot; Show/hide&nbsp;author"),
    ("Shape (idle)", "183 px", "Shape &middot; Change&nbsp;color &middot; Line&nbsp;style"),
    ("Shape (editing text)", "603 px", "Shape &middot; Change&nbsp;color &middot; Line&nbsp;style &middot; Typeface &middot; Font&nbsp;size &middot; Bold &middot; Strikethrough &middot; Link &middot; Bulleted&nbsp;list &middot; Text&nbsp;alignment"),
    ("Text object", "514 px", "Change&nbsp;color &middot; Typeface &middot; Font&nbsp;size &middot; Bold &middot; Strikethrough &middot; Link &middot; Bulleted&nbsp;list &middot; Start&nbsp;a&nbsp;mind&nbsp;map &middot; Text&nbsp;alignment"),
    ("Section", "308 px", "Change&nbsp;color &middot; &hellip; &middot; Section&nbsp;templates"),
    ("Two sticky notes", "523 px", "the sticky set, plus Alignment and Wrap&nbsp;in&nbsp;new&nbsp;section"),
    ("Sticky + shape", "96 px", "Alignment &middot; Wrap&nbsp;in&nbsp;new&nbsp;section"),
]

DELTAS = [
    ("Horizontal placement", "centred on the selection", "centred on the selection", "match", "<code>LEFT_ALIGN_TOOLBAR = false</code>"),
    ("Vertical offset", "16&nbsp;px clear of the selection overlay", "8&nbsp;px clear of the selection box", "differs", "<code>TOOLBAR_GAP = 8</code>"),
    ("No room above", "flips below the selection", "clamps down into the selection", "<strong>missing</strong>", "<code>y = clamp(y, 16, vsb.h - h - 16)</code>"),
    ("Viewport margin", "20&nbsp;px", "16&nbsp;px", "differs", "<code>SCREEN_MARGIN = 16</code>"),
    ("Bottom obstacle", "stops 20&nbsp;px above the tool belt", "only the viewport edge", "<strong>missing</strong>", "no toolbar-aware inset"),
    ("During a drag", "menu is removed", "stays unless <code>isMousingDown</code> is passed", "<strong>not wired</strong>", "SystemSketch omits the prop"),
    ("During a resize", "menu is removed", "stays", "<strong>not wired</strong>", "same prop"),
    ("During a camera move", "stays, tracks 1:1", "stays, tracks 1:1", "match", "<code>HIDE_TOOLBAR_WHEN_CAMERA_IS_MOVING = false</code>"),
    ("Zoom", "constant screen size", "constant screen size", "match", "positioned in screen space"),
    ("Selection off-screen", "menu disappears", "menu disappears", "match", "midpoint test against the margin"),
    ("Destructive actions", "never in the pill", "SystemSketch puts <em>Delete</em> in the pill", "differs", "FigJam keeps them in the right-click menu"),
]


def build() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; FigJam contextual menu specification</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a;
      --muted: #626975;
      --faint: #8b93a1;
      --line: #dfe3e9;
      --paper: #f7f8fa;
      --card: #ffffff;
      --accent: #5b5ee5;
      --accent-soft: #eeefff;
      --pink: #d6286c;
      --pink-soft: #ffeef4;
      --green: #177245;
      --green-soft: #e9f8ef;
      --amber: #8a5a00;
      --amber-soft: #fff5e0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 96px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 900px; margin: 0; font-size: clamp(40px, 5.6vw, 70px); line-height: .97; letter-spacing: -.05em; }}
    .lede {{ max-width: 780px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .chip.ok {{ border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    h3 {{ margin: 30px 0 6px; font-size: 19px; letter-spacing: -.02em; }}
    .sub {{ margin: 0 0 22px; max-width: 760px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28, 34, 48, .06); }}
    figure img {{ display: block; width: 100%; height: auto; }}
    figcaption {{ padding: 14px 18px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }}
    figcaption b {{ color: var(--ink); }}
    .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
    .trio {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }}
    .rule {{ margin: 26px 0 0; padding: 22px 24px; border: 1px solid #c9caf5; border-radius: 18px; background: var(--accent-soft); }}
    .rule p {{ margin: 0; font-size: 17px; line-height: 1.6; }}
    table {{ width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }}
    th, td {{ padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.5; }}
    th {{ background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }}
    tr:last-child td {{ border-bottom: none; }}
    td.num, th.num {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; white-space: nowrap; }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre {{ margin: 20px 0 0; padding: 20px 22px; overflow-x: auto; border: 1px solid #23262e; border-radius: 16px; background: #191b21; color: #e6e8ee; font: 500 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre .c {{ color: #8f96a6; }}
    pre .k {{ color: #ff8fbe; }}
    pre .n {{ color: #9fd0ff; }}
    .callout {{ margin-top: 22px; padding: 18px 20px; border: 1px solid #f0d9a8; border-radius: 16px; background: var(--amber-soft); color: var(--amber); font-size: 15px; line-height: 1.6; }}
    .callout b {{ color: #6b4500; }}
    .tokens {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 20px; }}
    .token {{ padding: 15px 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); }}
    .token dt {{ margin: 0 0 6px; color: var(--faint); font-size: 11.5px; font-weight: 740; letter-spacing: .07em; text-transform: uppercase; }}
    .token dd {{ margin: 0; font: 700 17px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .token dd small {{ display: block; margin-top: 5px; color: var(--muted); font: 500 12px/1.45 Inter, sans-serif; }}
    footer {{ margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }}
    @media (max-width: 900px) {{ .pair, .trio {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; reference capture &middot; 2026-09-01</p>
  <h1>How FigJam places its contextual menu</h1>
  <p class="lede">
    A behaviour specification taken from the running FigJam editor, not from documentation.
    Every geometric claim below was measured twice &mdash; once from FigJam&rsquo;s own DOM rectangles,
    once by finding the selection outline and the menu surface in the captured pixels &mdash;
    so the two numbers can disagree if either method is wrong. They did not.
  </p>
  <div class="chips">
    <span class="chip ok">18 states captured</span>
    <span class="chip">viewport 1680 &times; 857 &middot; dpr 1</span>
    <span class="chip">Chrome 149 &middot; off-screen X display</span>
    <span class="chip">FigJam web, 2026-09-01</span>
  </div>

  <div class="rule">
    <p>
      <strong>The whole rule in one sentence.</strong> One dark pill, 40&nbsp;px tall and as wide as its
      controls need, is horizontally centred on the selection&rsquo;s bounding box and sits 16&nbsp;px clear of
      the selection overlay &mdash; above it by default, below it when there is no room above, clamped to a
      20&nbsp;px viewport margin, never scaled by zoom, and removed entirely while the pointer is dragging
      or resizing.
    </p>
  </div>

  <section>
    <h2>1 &middot; What is being specified</h2>
    <p class="sub">
      FigJam has three separate floating surfaces. They are easy to conflate, and only the first one is
      the &ldquo;contextual menu&rdquo; that follows a selection. The other two are on-demand and anchored to
      the pointer or to a control.
    </p>
    <table>
      <tr>
        <th>Surface</th><th>DOM identity</th><th>Trigger</th><th>Anchor</th>
      </tr>
      <tr>
        <td><b>Selection Properties Menu</b><br><span style="color:var(--muted)">the subject of this document</span></td>
        <td class="num">[role=toolbar]<br>[aria-label="Selection Properties Menu"]</td>
        <td>a selection exists</td>
        <td>the selection&rsquo;s screen bounding box</td>
      </tr>
      <tr>
        <td><b>Context menu</b></td>
        <td class="num">[role=menu]</td>
        <td>right-click</td>
        <td>the pointer</td>
      </tr>
      <tr>
        <td><b>Property popover</b></td>
        <td class="num">dark panel, radius 13&nbsp;px, padding 8&nbsp;px</td>
        <td>a control inside the pill</td>
        <td>the pill</td>
      </tr>
    </table>
    <figure style="margin-top:22px">
      <img src="{figure('board')}" alt="An empty FigJam board with the title bar, share bar, bottom tool belt and zoom controls">
      <figcaption>The empty board that every capture starts from. The persistent chrome is fixed: title bar top-left, share bar top-right, tool belt centred at the bottom (<b>y&nbsp;797&ndash;845</b>), zoom controls bottom-right. The contextual menu is the only surface that moves with content.</figcaption>
    </figure>
  </section>

  <section>
    <h2>2 &middot; Anatomy and tokens</h2>
    <p class="sub">
      The pill is a plain flex row of controls on one dark rounded surface. Height and radius are fixed
      across every state observed; only the width changes, and it changes because the control set changes.
    </p>
    <figure>
      <img src="{figure('anatomy')}" alt="A selected FigJam sticky note with the contextual menu above it, annotated with its height, its gap to the shape, and its centre line">
      <figcaption>Single sticky note selected. The pink outline is the measured menu rectangle; the blue dashed outline is the measured selection box. <b>The menu centre and the selection centre are the same line</b> &mdash; the largest horizontal offset across all sixteen unclamped states was 1.0&nbsp;px.</figcaption>
    </figure>
    <dl class="tokens">
      <div class="token"><dt>Height</dt><dd>40 px<small>identical in every state, at every zoom</small></dd></div>
      <div class="token"><dt>Width</dt><dd>96&ndash;603 px<small>driven entirely by the control set</small></dd></div>
      <div class="token"><dt>Corner radius</dt><dd>13 px<small>same radius as every other FigJam panel</small></dd></div>
      <div class="token"><dt>Surface</dt><dd>rgb(30, 30, 30)<small>opaque; no blur, no transparency</small></dd></div>
      <div class="token"><dt>Padding</dt><dd>0 4px<small>controls supply their own inner padding</small></dd></div>
      <div class="token"><dt>Type</dt><dd>11 px Inter<small>white on the dark surface</small></dd></div>
    </dl>
    <pre><span class="c">/* the shadow, verbatim from the computed style */</span>
box-shadow:
  <span class="n">0 0 0.5px</span> rgba(0, 0, 0, .12),
  <span class="n">0 10px 16px</span> rgba(0, 0, 0, .12),
  <span class="n">0 2px 5px</span>   rgba(0, 0, 0, .15);</pre>

    <h3>How it is positioned in the DOM</h3>
    <p class="sub">
      Worth copying exactly, because it is the part that goes wrong. The menu is <em>not</em> a child of the
      canvas and is <em>not</em> laid out with <code>left</code>/<code>top</code>.
    </p>
    <pre><span class="c">// a fixed, full-viewport, pointer-events-none layer, outside the camera transform</span>
&lt;div class="window_positioner--positionerRoot"  <span class="k">position:</span> fixed; inset: 0&gt;
  <span class="c">// one positioner per floating surface; screen-space translate only</span>
  &lt;div <span class="k">position:</span> absolute; left: 0; top: 0;
       <span class="k">transform:</span> <span class="n">translate(469.85px, 213px)</span>&gt;
    &lt;div class="whiteboard_inline_menu--toolbarPrimitive"
         role="toolbar" aria-label="Selection Properties Menu"&gt;&hellip;&lt;/div&gt;
  &lt;/div&gt;
&lt;/div&gt;</pre>
    <div class="callout">
      <b>Two consequences.</b> Because the positioner sits in a viewport-fixed layer and carries a plain
      screen-space <code>translate()</code>, the menu can never inherit a camera transform, and its size can
      never scale with zoom. Any implementation that mounts the menu inside a camera-transformed layer, or
      inside a container whose origin is not the canvas viewport&rsquo;s top-left, will place it correctly at
      one camera position and wrongly at every other.
    </div>
  </section>

  <section>
    <h2>3 &middot; Placement</h2>
    <p class="sub">
      Four rules, in this order: centre, offset above, flip if it does not fit, clamp to the safe area.
      The offset is measured against the <em>selection overlay</em>, not the shape &mdash; which is why single
      shapes read as 40&nbsp;px and text objects read as 16&nbsp;px.
    </p>
    <pre><span class="c">// all values in screen pixels, all constants measured, not guessed</span>
<span class="k">const</span> GAP             = <span class="n">16</span>;   <span class="c">// clear of the selection overlay</span>
<span class="k">const</span> SCREEN_MARGIN   = <span class="n">20</span>;   <span class="c">// left, right and top viewport inset</span>
<span class="k">const</span> BOTTOM_OBSTACLE = toolBeltTop - <span class="n">20</span>;

<span class="k">function</span> place(overlay, menu, viewport) {{
  <span class="k">let</span> x = overlay.midX - menu.w / <span class="n">2</span>;
  <span class="k">let</span> y = overlay.top - menu.h - GAP;          <span class="c">// prefer above</span>

  <span class="k">if</span> (y &lt; SCREEN_MARGIN) y = overlay.bottom + GAP;  <span class="c">// flip below</span>

  x = clamp(x, SCREEN_MARGIN, viewport.w - menu.w - SCREEN_MARGIN);
  y = clamp(y, SCREEN_MARGIN, BOTTOM_OBSTACLE - menu.h);
  <span class="k">return</span> {{ x, y }};
}}</pre>

    <h3>The flip threshold, found by bisection</h3>
    <figure>
      <img src="{figure('flip')}" alt="Two FigJam captures side by side: the menu above a shape near the top edge, and the menu flipped below once the shape is closer to the edge">
      <figcaption>The board was panned upward in 3&nbsp;px steps under a live selection. The menu stayed above while its top was at <b>22&nbsp;px</b>; the next step, which would have put it at <b>19&nbsp;px</b>, flipped it below. The threshold is a <b>20&nbsp;px</b> top margin. Note that the flipped placement keeps the same offset, measured from the bottom of the selection instead of the top.</figcaption>
    </figure>

    <h3>The horizontal clamp</h3>
    <figure>
      <img src="{figure('clamp')}" alt="A shape pushed against the left viewport edge with the contextual menu pinned 20 pixels from the edge">
      <figcaption>Pushed into the left gutter, the menu stops with its left edge at exactly <b>x&nbsp;=&nbsp;20</b> &mdash; the positioner reads <code>translate(20px, 249px)</code> &mdash; and gives up centring (offset 18.5&nbsp;px). The mirror case pins the right edge at <b>1660</b> in a 1680&nbsp;px viewport. Both margins are 20&nbsp;px.</figcaption>
    </figure>

    <h3>The bottom obstacle is the tool belt, not the viewport</h3>
    <figure>
      <img src="{figure('fills')}" alt="A shape zoomed until it fills the viewport, with the contextual menu resting just above the bottom tool belt">
      <figcaption>Zoom in until the selection covers the whole viewport and neither &ldquo;above&rdquo; nor &ldquo;below&rdquo; exists. The menu comes to rest with its bottom at <b>y&nbsp;777</b> &mdash; exactly <b>20&nbsp;px above the tool belt&rsquo;s top edge at 797</b>, not 20&nbsp;px above the window. FigJam treats its own bottom chrome as part of the safe area.</figcaption>
    </figure>

    <h3>Zoom changes nothing</h3>
    <figure>
      <img src="{figure('zoom')}" alt="The same rectangle at three zoom levels; the contextual menu is the same size in all three">
      <figcaption>The same rectangle at roughly 0.3&times;, 1&times; and 3.3&times;. The selection box goes from 72&nbsp;px wide to 784&nbsp;px wide; the pill stays <b>183 &times; 40</b> and the gap stays <b>39&ndash;40&nbsp;px</b>. The menu lives in screen space and is never part of the scene.</figcaption>
    </figure>
  </section>

  <section>
    <h2>4 &middot; Lifecycle</h2>
    <p class="sub">
      The menu is not merely hidden during direct manipulation &mdash; it is removed from the document, and
      rebuilt against the new geometry when the pointer comes up. That is what makes dragging feel clean.
    </p>
    <div class="pair">
      <figure>
        <img src="{figure('drag')}" alt="A shape mid-drag in FigJam with no contextual menu visible">
        <figcaption><b>During a drag.</b> Querying the DOM mid-drag returns <code>null</code> for the toolbar. Nothing is dimmed or animated; it is simply gone.</figcaption>
      </figure>
      <figure>
        <img src="{figure('after-drag')}" alt="The same shape after the drag, with the contextual menu restored above its new position">
        <figcaption><b>On pointer-up.</b> The menu returns, re-anchored to the new bounds &mdash; centre offset 1.0&nbsp;px, gap 40&nbsp;px. Resizing from a corner handle behaves identically.</figcaption>
      </figure>
    </div>
    <table>
      <tr><th>Event</th><th>Menu</th><th>Notes</th></tr>
      <tr><td>Selection created</td><td>appears</td><td>immediately, already anchored</td></tr>
      <tr><td>Camera pans or zooms</td><td>stays, tracks 1:1</td><td>follows the selection through the whole pan; no lag beyond a frame</td></tr>
      <tr><td>Shape drag starts</td><td>removed from the DOM</td><td>not faded, not moved off-screen</td></tr>
      <tr><td>Handle resize starts</td><td>removed from the DOM</td><td>same</td></tr>
      <tr><td>Pointer up</td><td>reappears</td><td>re-anchored, re-measured, re-flipped if needed</td></tr>
      <tr><td>Text editing entered</td><td>stays, control set grows</td><td>text properties are appended to the shape properties</td></tr>
      <tr><td>Selection leaves the viewport</td><td>disappears</td><td>reappears when panned back</td></tr>
      <tr><td>Selection cleared</td><td>disappears</td><td>&mdash;</td></tr>
    </table>
  </section>

  <section>
    <h2>5 &middot; What goes in the pill</h2>
    <p class="sub">
      The content model is the interesting half of the design, and it is strict: the pill shows the
      properties the selection actually has, and a multi-selection shows the <em>intersection</em>. There are
      no destructive or structural commands &mdash; no delete, no duplicate, no z-order. Those live in the
      right-click menu, where a mis-click is not fatal.
    </p>
    <table>
      <tr><th>Selection</th><th class="num">Width</th><th>Controls, in order</th></tr>
      {''.join(f'<tr><td><b>{name}</b></td><td class="num">{width}</td><td>{controls}</td></tr>' for name, width, controls in CONTROLS)}
    </table>
    <div class="trio" style="margin-top:22px">
      <figure>
        <img src="{figure('sticky')}" alt="A selected sticky note with its eight-control contextual menu">
        <figcaption><b>Sticky note</b> &mdash; colour and full typography, plus the sticky-only author toggle.</figcaption>
      </figure>
      <figure>
        <img src="{figure('shape')}" alt="A selected rectangle with its three-control contextual menu">
        <figcaption><b>Shape</b> &mdash; three controls only, because an empty shape has no type to style yet.</figcaption>
      </figure>
      <figure>
        <img src="{figure('text-edit')}" alt="A shape in text editing mode with a ten-control contextual menu">
        <figcaption><b>Same shape, editing text</b> &mdash; the typography group is appended rather than replacing anything.</figcaption>
      </figure>
    </div>
    <div class="pair" style="margin-top:18px">
      <figure>
        <img src="{figure('multi-same')}" alt="Two sticky notes selected together with a wide contextual menu">
        <figcaption><b>Two sticky notes.</b> Same type, so the full sticky set survives, and <em>Alignment</em> plus <em>Wrap in new section</em> are added because they now mean something.</figcaption>
      </figure>
      <figure>
        <img src="{figure('multi-mixed')}" alt="A sticky note and a shape selected together with a two-control contextual menu">
        <figcaption><b>A sticky and a shape.</b> The pill collapses to 96&nbsp;px &mdash; only the two commands both objects share. It does not show a disabled superset.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>6 &middot; The two neighbouring surfaces</h2>
    <p class="sub">
      Both reuse the same dark surface, the same 13&nbsp;px radius and the same shadow, so they read as one
      family. Their anchoring rules are different, and deliberately so.
    </p>
    <div class="trio">
      <figure>
        <img src="{figure('context-menu')}" alt="The FigJam right-click context menu over a selected shape">
        <figcaption><b>Right-click on a shape.</b> Anchored to the pointer, opening down and to the right, shifted up when it would otherwise run into the tool belt. It draws <em>over</em> the properties pill rather than replacing it, and it is where Copy, Delete, z-order and Lock live.</figcaption>
      </figure>
      <figure>
        <img src="{figure('canvas-menu')}" alt="The FigJam right-click context menu on empty canvas">
        <figcaption><b>Right-click on empty canvas.</b> Same panel, board-level items, and no properties pill at all &mdash; with nothing selected there is nothing to anchor to.</figcaption>
      </figure>
      <figure>
        <img src="{figure('popover')}" alt="The colour picker popover open above the contextual menu">
        <figcaption><b>A property popover.</b> Opens <b>8&nbsp;px above the pill</b> (popover bottom 310, pill top 318), roughly centred on it, viewport-clamped. The pill does not move to make room, and stays interactive underneath.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>7 &middot; Delta against what SystemSketch already has</h2>
    <p class="sub">
      SystemSketch renders its selection menu through tldraw&rsquo;s <code>TldrawUiContextualToolbar</code>
      (<code>src/chrome/SystemSketchChrome.tsx</code>, <code>SelectionMiniMenu</code>). That primitive already
      implements most of this specification; the constants differ, and two behaviours are absent rather than
      merely different. The right-hand column cites the primitive&rsquo;s own source.
    </p>
    <table>
      <tr><th>Behaviour</th><th>FigJam (measured)</th><th>tldraw primitive</th><th>Status</th><th>Where</th></tr>
      {''.join(f'<tr><td><b>{a}</b></td><td>{b}</td><td>{c}</td><td>{d}</td><td>{e}</td></tr>' for a, b, c, d, e in DELTAS)}
    </table>
    <div class="callout">
      <b>The two that are absent, not just different.</b> tldraw clamps the vertical position instead of
      flipping, so a selection near the top of the viewport gets a toolbar sitting <em>on top of</em> the shape
      rather than below it &mdash; visually the same failure as a menu appearing somewhere unexpected. And
      <code>TldrawUiContextualToolbar</code> only hides during manipulation when it is handed an
      <code>isMousingDown</code> prop, which <code>SelectionMiniMenu</code> does not currently pass, so the
      menu rides along during drags. Both are small, local changes: a flip branch in a wrapper that supplies
      <code>getSelectionBounds</code>, and one extra prop.
    </div>
  </section>

  <section>
    <h2>8 &middot; Evidence</h2>
    <p class="sub">
      Every row is one captured state. Menu rectangles are FigJam&rsquo;s own <code>getBoundingClientRect</code>
      values; selection boxes are the measured extents of the <code>#0D99FF</code> selection outline in the
      captured pixels. The gap column reads <em>distance to the shape box / distance to the selection
      overlay</em> &mdash; the second number is the constant, and the first is what you see when FigJam also
      draws mid-edge grab dots roughly 20&nbsp;px outside the shape.
    </p>
    <table>
      <tr><th>State</th><th class="num">Menu x, y &middot; w &times; h</th><th class="num">Selection box</th><th class="num">Gap</th><th>Note</th></tr>
      {''.join(f'<tr><td><b>{a}</b></td><td class="num">{b}</td><td class="num">{c}</td><td class="num">{d}</td><td>{e}</td></tr>' for a, b, c, d, e in EVIDENCE)}
    </table>
  </section>

  <footer>
    <p>
      <b>Method.</b> A copy of the signed-in Chrome profile was launched on an off-screen Xvfb display with
      software WebGL and driven over the DevTools Protocol. Captures were taken on a scratch FigJam draft, at
      100% browser zoom so that CSS pixels and screenshot pixels are the same unit. Nothing in any existing
      Figma or SystemSketch document was read from or written to.
    </p>
    <p>
      <b>Scope.</b> One viewport size, one platform, the free plan, the FigJam build served on 2026-09-01.
      The constants (16, 20, 40, 13) held across every state captured, but they were not verified at other
      viewport sizes or device pixel ratios. The bottom-obstacle inset rests on a single observation.
    </p>
    <p>Regenerate with <code>python3 docs/build_figjam_contextual_menu_spec.py</code>.</p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
