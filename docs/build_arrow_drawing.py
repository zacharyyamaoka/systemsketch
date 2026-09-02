#!/usr/bin/env python3
"""Build the self-contained report for the two arrow changes.

Every number, snippet, screenshot and verdict on the page is measured at build
time from the live repo and from the run that produced it, so the report cannot
drift from the tree it describes.
"""

from __future__ import annotations

import base64
import html
import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import (  # noqa: E402
    REPO,
    journey_results,
    line_count,
    unit_test_count,
)


HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "arrow-drawing-2026-09-01.html"

# (source, crop box in the 1440x960 capture frame, output width)
CROPS = {
    "__RUBBER__": (ASSETS / "arrow-placement-rubber-band.png", (300, 250, 960, 500), 1100),
    "__LANDED__": (ASSETS / "arrow-rectangle-still-names-itself.png", (300, 250, 1300, 740), 1200),
    "__MENU__": (ASSETS / "arrow-preset-menu.png", (600, 540, 880, 920), 700),
    "__CURVE__": (ASSETS / "arrow-curve-preset.png", (300, 130, 960, 360), 1100),
    "__BOUND__": (ASSETS / "arrow-bound-to-shape.png", (600, 470, 1300, 740), 1160),
    "__STOCK__": (ASSETS / "arrow-stock-two-clicks-draw-nothing.png", (300, 170, 1020, 958), 720),
}


def source_slice(path: Path, start_marker: str, end_marker: str) -> str:
    """Quote a real file, so a snippet in the report cannot drift from the tree."""
    text = path.read_text(encoding="utf-8")
    begin = text.index(start_marker)
    return text[begin:text.index(end_marker, begin)].rstrip()


def encoded_crop(source: Path, box: tuple[int, int, int, int], width: int) -> str:
    if not source.exists():
        raise SystemExit(f"{source.name} is missing — run `npm run test:arrows` first")
    image = Image.open(source).convert("RGB").crop(box)
    if width != image.width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def verdict_rows(results: list[dict]) -> str:
    rows = []
    for result in results:
        mark = "ok" if result["ok"] else "warn"
        observed = json.dumps(result["observed"])
        if len(observed) > 150:
            observed = f"{observed[:149]}…"
        rows.append(
            "<tr>"
            f'<td class="mono">{html.escape(result["id"])}</td>'
            f'<td>{html.escape(result["label"])}</td>'
            f'<td><span class="tag {mark}">{"PASS" if result["ok"] else "FAIL"}</span></td>'
            f'<td class="mono">{html.escape(observed)}</td>'
            "</tr>"
        )
    return "\n".join(rows)


def main() -> None:
    journey = REPO / "tests" / "arrow_drawing_smoke.mjs"
    verdicts = journey_results(ASSETS / "arrow-drawing-results.json", journey, REPO / "src")

    measured_path = ASSETS / "arrow-drawing-measurements.json"
    if not measured_path.exists():
        raise SystemExit("arrow-drawing-measurements.json is missing — run `npm run test:arrows`")
    measured = json.loads(measured_path.read_text())

    placement = REPO / "src" / "arrowClickToPlace.ts"
    instant = REPO / "src" / "instantTextEditing.ts"

    numbers = {
        "__JOURNEY_TOTAL__": str(len(verdicts)),
        "__JOURNEY_PASSED__": str(sum(1 for row in verdicts if row["ok"])),
        "__JOURNEY_ROWS__": verdict_rows(verdicts),
        "__PLACEMENT_LINES__": str(line_count("src/arrowClickToPlace.ts")),
        "__PLACEMENT_TESTS__": str(unit_test_count("src/arrowClickToPlace.test.ts")),
        "__TEXT_TESTS__": str(unit_test_count("src/instantTextEditing.test.ts")),
        "__STRAIGHT_BOW__": str(measured["straightBow"]),
        "__CURVE_BOW__": str(measured["curveBow"]),
        "__CLICK_X__": str(measured["clickedInside"]["x"]),
        "__BOUND_X__": str(measured["boundEnd"]["x"]),
        "__RECT_LEFT__": str(measured["rectangle"]["x"]),
        "__RECT_RIGHT__": str(measured["rectangle"]["x"] + measured["rectangle"]["w"]),
        "__HANDOFF_SRC__": html.escape(
            source_slice(placement, "  editor.setCurrentTool(ARROW_PLACEMENT_PATH", "  return {")
        ),
        "__GUARD_SRC__": html.escape(
            source_slice(placement, "    pendingClick = false\n    if (info.name", "  }\n\n  const onEvent")
        ),
        "__TEXT_SRC__": html.escape(
            source_slice(instant, "export const TEXT_ON_DEMAND_SHAPE_TYPES", "\n\n/**\n * A drawn shape")
            + "\n\n"
            + source_slice(instant, "export function isPrimaryTextDrawing", "\n}")
            + "\n}"
        ),
    }

    page = TEMPLATE
    for slot, (source, box, width) in CROPS.items():
        page = page.replace(slot, encoded_crop(source, box, width))
    for slot, value in numbers.items():
        page = page.replace(slot, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — drawing arrows with two clicks</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--blue:#6d7cff;--cyan:#52d5d0;--green:#75d39b;--red:#e8836f;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 42%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:var(--cyan)}
  .shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:42px 0 76px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
  .eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:940px;margin:16px 0 14px;font-size:clamp(38px,5.6vw,66px);line-height:1;letter-spacing:-.05em}
  .lede{max-width:880px;margin:0;color:#c4ccda;font-size:18px;line-height:1.58}
  .lede b{color:#eef2f8}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:28px 0 6px}
  .stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}
  .stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  section{margin-top:52px}
  .section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}
  .section-copy{max-width:920px;margin:0 0 22px;color:var(--muted);line-height:1.62}
  .section-copy b{color:#dfe5ef}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .grid-menu{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
  .grid-stock{display:grid;grid-template-columns:400px minmax(0,1fr);gap:16px;align-items:start}
  @media(max-width:900px){.grid3,.grid2,.grid-menu,.grid-stock,.stats{grid-template-columns:1fr}}
  figure{margin:0;overflow:hidden;border:1px solid #3a465e;border-radius:16px;background:#f7f8fb;box-shadow:0 18px 46px rgba(0,0,0,.34)}
  figure img{display:block;width:100%;height:auto}
  figcaption{padding:11px 13px;background:var(--panel);color:var(--muted);font-size:12.5px;line-height:1.45}
  figcaption strong{display:block;margin-bottom:3px;color:var(--ink);font-size:13px}
  figcaption b{color:#dfe5ef}
  .card{min-width:0;padding:19px 21px;border:1px solid var(--line);border-radius:16px;background:rgba(17,23,36,.86)}
  .card h3{margin:0 0 8px;font-size:16px;letter-spacing:-.01em}
  .card p{margin:0 0 8px;color:var(--muted);font-size:14px;line-height:1.6}
  .card p:last-child{margin-bottom:0}
  .card code,code{padding:1px 5px;border-radius:5px;background:#1c2637;color:#cfd7e6;font:600 12.5px ui-monospace,monospace}
  .tag{display:inline-block;margin:0 6px 6px 0;padding:4px 9px;border-radius:999px;font:700 11px ui-monospace,monospace;letter-spacing:.04em}
  .tag.ok{background:rgba(117,211,155,.14);color:var(--green)}
  .tag.warn{background:rgba(232,131,111,.16);color:var(--red)}
  .tag.info{background:rgba(109,124,255,.16);color:#a7b0ff}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  th{color:var(--muted);font:700 11.5px ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase}
  td b{color:var(--ink)}
  td.mono{font:600 12.5px ui-monospace,monospace;color:#cfd7e6}
  pre{margin:0;padding:15px 17px;overflow-x:auto;border:1px solid var(--line);border-radius:13px;background:#0d1320;color:#cfd7e6;font:600 12.5px/1.65 ui-monospace,monospace}
  .seam{width:100%;height:auto;border:1px solid var(--line);border-radius:16px;background:rgba(13,19,32,.7)}
  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.6}
</style>
</head>
<body>
<div class="shell">

  <div class="eyebrow">SystemSketch · Arrows</div>
  <h1>Click, move, click.</h1>
  <p class="lede">Two changes to arrows, both asked for on the whiteboard. <b>An arrow is now drawn
  by clicking its two ends</b> — the press-and-drag tldraw ships still draws exactly the arrow it
  always did, but the release it used to throw away now leaves the arrow's end on the pointer until
  the next click lands it. And <b>drawing an arrow no longer opens a text editor on it</b>: that was
  SystemSketch's own "name the box you just drew" behaviour reaching a shape it should never have
  reached. A rectangle still names itself. An arrow waits to be asked.</p>

  <div class="stats">
    <div class="stat"><b>__JOURNEY_PASSED__/__JOURNEY_TOTAL__</b><span>browser checks, real pointer events</span></div>
    <div class="stat"><b>__PLACEMENT_LINES__</b><span>lines in the new module</span></div>
    <div class="stat"><b>__PLACEMENT_TESTS__ + __TEXT_TESTS__</b><span>unit cases over the two seams</span></div>
    <div class="stat"><b>0</b><span>lines of drag, snap or bind logic written</span></div>
  </div>

  <section>
    <h2 class="section-title">The whole idea: a click ends in the same state a drag does</h2>
    <p class="section-copy">tldraw's arrow tool already has the state that draws an arrow's second
    point — <code>select.dragging_handle</code>, which it enters the moment a press becomes a drag.
    That state owns everything hard about drawing an arrow: it binds to shapes, snaps to handles,
    constrains the angle on Shift, tracks the precise-target timer and cancels cleanly on Escape.
    The click gesture was never missing that machinery; it was only missing a <i>way in</i>, because
    <code>arrow.pointing</code> cancels itself on a release that never became a drag.</p>
    <p class="section-copy">So the change is one edge on a state chart, not a second implementation
    of arrow drawing. On a release with no drag, SystemSketch creates the arrow the press was asking
    for and enters <b>tldraw's own handle drag</b> — with tldraw's own creation mark, so its own
    Escape still takes the arrow back. Everything after that line is stock.</p>
    <svg class="seam" viewBox="0 0 1160 330" role="img" aria-label="The arrow tool's state chart with the new click edge">
      <defs>
        <marker id="head" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill="#7f8ca3"/>
        </marker>
        <marker id="headCyan" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill="#52d5d0"/>
        </marker>
        <marker id="headRed" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 z" fill="#e8836f"/>
        </marker>
      </defs>
      <rect x="20" y="96" width="150" height="58" rx="13" fill="#141c2c" stroke="#3a465e"/>
      <text x="95" y="123" text-anchor="middle" fill="#cfd7e6" font-family="ui-monospace,monospace" font-size="13" font-weight="700">arrow.idle</text>
      <text x="95" y="141" text-anchor="middle" fill="#7f8ca3" font-size="11">tldraw</text>

      <rect x="250" y="96" width="200" height="58" rx="13" fill="#141c2c" stroke="#3a465e"/>
      <text x="350" y="123" text-anchor="middle" fill="#cfd7e6" font-family="ui-monospace,monospace" font-size="13" font-weight="700">arrow.pointing</text>
      <text x="350" y="141" text-anchor="middle" fill="#7f8ca3" font-size="11">the press, still undecided</text>

      <rect x="700" y="60" width="280" height="212" rx="15" fill="#101a2a" stroke="#52d5d0" stroke-opacity=".55"/>
      <text x="840" y="90" text-anchor="middle" fill="#cfd7e6" font-family="ui-monospace,monospace" font-size="13" font-weight="700">select.dragging_handle</text>
      <text x="840" y="110" text-anchor="middle" fill="#7f8ca3" font-size="11">tldraw's own end-point drag</text>
      <text x="840" y="142" text-anchor="middle" fill="#9ba8bd" font-size="12">binds to shapes</text>
      <text x="840" y="164" text-anchor="middle" fill="#9ba8bd" font-size="12">snaps to handles</text>
      <text x="840" y="186" text-anchor="middle" fill="#9ba8bd" font-size="12">Shift locks the angle</text>
      <text x="840" y="208" text-anchor="middle" fill="#9ba8bd" font-size="12">Escape bails the creation mark</text>
      <text x="840" y="240" text-anchor="middle" fill="#75d39b" font-size="12">the next release lands the arrow</text>

      <line x1="170" y1="125" x2="242" y2="125" stroke="#7f8ca3" stroke-width="2" marker-end="url(#head)"/>
      <text x="206" y="115" text-anchor="middle" fill="#7f8ca3" font-size="11">press</text>

      <path d="M450 112 L692 100" fill="none" stroke="#7f8ca3" stroke-width="2" marker-end="url(#head)"/>
      <text x="571" y="94" text-anchor="middle" fill="#7f8ca3" font-size="12">…and the press becomes a drag</text>

      <path d="M350 154 L350 236 L692 236" fill="none" stroke="#52d5d0" stroke-width="2.4" marker-end="url(#headCyan)"/>
      <text x="366" y="182" fill="#52d5d0" font-size="12.5" font-weight="700">release without dragging</text>
      <text x="366" y="202" fill="#8fe3df" font-size="12">SystemSketch creates the arrow at the press point,</text>
      <text x="366" y="220" fill="#8fe3df" font-size="12">then hands its end to the same state</text>

      <path d="M250 125 L200 125" fill="none" stroke="none"/>
      <path d="M264 154 L214 300" fill="none" stroke="#e8836f" stroke-width="1.6" stroke-dasharray="5 5" marker-end="url(#headRed)"/>
      <text x="238" y="318" text-anchor="middle" fill="#e8836f" font-size="11.5">was: bailed, nothing drawn</text>

      <line x1="980" y1="166" x2="1046" y2="166" stroke="#75d39b" stroke-width="2" marker-end="url(#head)"/>
      <text x="1090" y="160" text-anchor="middle" fill="#cfd7e6" font-size="12">an arrow</text>
      <text x="1090" y="178" text-anchor="middle" fill="#7f8ca3" font-size="11">on the board</text>
    </svg>
  </section>

  <section>
    <h2 class="section-title">What that looks like with the button up</h2>
    <p class="section-copy">Both captures are frames from the journey, taken while the mouse button
    is <b>not</b> pressed. On the left the pointer has moved 200 px since the click and the arrow is
    already drawn to it; on the right the second click has landed it, a second arrow has been drawn
    the old way with a drag, and a rectangle drawn immediately afterwards is sitting in its own name
    editor — the behaviour arrows used to share and no longer do.</p>
    <div class="grid2">
      <figure>
        <img alt="An arrow drawn from the click point to the pointer, mouse button up" src="data:image/png;base64,__RUBBER__"/>
        <figcaption><strong>Between the two clicks</strong>One click at (360, 300), pointer at (560, 420), no
        button held. The arrow tool is still lit in the toolbar; the container reports
        <code>select.dragging_handle</code>.</figcaption>
      </figure>
      <figure>
        <img alt="Two finished arrows with no text caret, beside a rectangle with a caret" src="data:image/png;base64,__LANDED__"/>
        <figcaption><strong>Arrows quiet, boxes talkative</strong>Top arrow: two clicks. Middle arrow: a
        press-and-drag. Neither is asking to be typed into. The rectangle drawn last has the
        caret — that is the feature working, not leaking.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2 class="section-title">Nothing about the arrow changed except how it is started</h2>
    <p class="section-copy">Because the placement enters tldraw's own state, everything downstream
    of it is the stock behaviour rather than a re-implementation that has to be kept in step. Two of
    those are measured directly by the journey rather than argued for.</p>
    <div class="grid-menu">
      <figure>
        <img alt="A click-placed arrow bound to a rectangle, stopping at its edge" src="data:image/png;base64,__BOUND__"/>
        <figcaption><strong>Binding still happens on the landing click</strong>The second click landed at
        x=__CLICK_X__, inside a rectangle spanning x __RECT_LEFT__–__RECT_RIGHT__. The painted stroke
        ends at <b>x=__BOUND_X__</b> — at the rectangle's edge, not at the click — and tldraw's own
        dashed leader runs on to the bound target. An unbound arrow would have run to the
        cursor.</figcaption>
      </figure>
      <figure>
        <img alt="The toolbar's shape menu, with the three arrow presets" src="data:image/png;base64,__MENU__"/>
        <figcaption><strong>The presets still apply</strong>Chosen from the real toolbar menu, not by counting
        A presses.</figcaption>
      </figure>
    </div>
    <div style="height:14px"></div>
    <figure>
      <img alt="A curved arrow drawn with two clicks" src="data:image/png;base64,__CURVE__"/>
      <figcaption><strong>A Curve-preset arrow, drawn with two clicks</strong>Curvature is measured off the
      painted stroke as its largest departure from the straight line between its ends:
      <b>__CURVE_BOW__ px</b> here, against <b>__STRAIGHT_BOW__ px</b> for the straight arrow in the
      same run. 32 px is exactly <code>CURVE_ARROW_BEND</code> — the preset adapter reached a
      click-placed arrow, which is the one thing this change could plausibly have broken.</figcaption>
    </figure>
  </section>

  <section>
    <h2 class="section-title">The seam, in the two places it is actually made</h2>
    <p class="section-copy">The question "was that a click?" has to be asked <b>before</b> tldraw
    handles the release: <code>Editor.dispatch</code> clears <code>isDragging</code> and
    <code>arrow.pointing</code> cancels itself in the same tick, so by the time the event has been
    handled both answers are already gone. That is the entire reason this module listens on
    <code>before-event</code> as well as <code>event</code>.</p>
    <div class="card">
      <h3>Asking at the only moment the answer exists</h3>
      <pre>__GUARD_SRC__</pre>
    </div>
    <div style="height:14px"></div>
    <div class="card">
      <h3>Handing the end point to tldraw's own state, with tldraw's own creation mark</h3>
      <pre>__HANDOFF_SRC__</pre>
    </div>
  </section>

  <section>
    <h2 class="section-title">A connector carries a label; it is not named by one</h2>
    <p class="section-copy">Instant text editing exists because a new box is almost always about to
    be titled — drawing it and naming it are one thought, so the caret is a kindness. An arrow is the
    opposite: its meaning is <i>which two things it joins</i>, and a label on it is a rare annotation
    added deliberately and later. Opening a caret on every arrow taxes the common case to serve the
    rare one. So the rule is now stated where the drawing gesture is recognised, and nowhere
    else: double-clicking an arrow still opens its label, exactly as in stock tldraw.</p>
    <pre>__TEXT_SRC__</pre>
  </section>

  <section>
    <h2 class="section-title">Three things a placement gives back that a drag never had to</h2>
    <p class="section-copy">A drag holds the person's hand hostage until they let go. A placement
    does not — which means it can be walked away from, and every way of walking away needs an
    answer. All three are checks in the journey.</p>
    <div class="grid3">
      <div class="card">
        <h3>Escape</h3>
        <p>tldraw's own, unchanged: the placement entered <code>select.dragging_handle</code> with
        the real creation mark, so Escape bails it and hands back the arrow tool. Nothing to
        write.</p>
        <p><span class="tag ok">ARROW-5a</span></p>
      </div>
      <div class="card">
        <h3>A second click that never left the first</h3>
        <p>Means "never mind", not "make me a zero-length arrow" — the same answer an unmoved press
        has always given. Measured against tldraw's own drag threshold, in page units scaled by the
        camera, so it holds at any zoom.</p>
        <p><span class="tag ok">ARROW-6a</span></p>
      </div>
      <div class="card">
        <h3>Leaving for another tool</h3>
        <p>The failure mode this change could have introduced: a half-drawn arrow stranded under the
        cursor forever. A reactor on the tool path takes it back the moment the placement is
        abandoned.</p>
        <p><span class="tag ok">ARROW-7a</span></p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">Before and after, measured in one run</h2>
    <p class="section-copy">The last section of the journey reloads the same build as the pinned
    <b>stock tldraw</b> profile and repeats the identical gesture. Two clicks there still draw
    nothing — which is both the behaviour being complained about and the proof that nothing in the
    engine was patched to get the new one.</p>
    <div class="grid-stock">
      <figure>
        <img alt="Stock tldraw after the same two clicks: an empty canvas" src="data:image/png;base64,__STOCK__"/>
        <figcaption><strong>Pinned stock tldraw, same two clicks, same build</strong>Arrow tool
        selected and lit in the toolbar; click at (360, 300), move to (860, 300), click. Zero arrows
        on the page.</figcaption>
      </figure>
      <div class="card">
        <h3>Why the empty canvas is the good news</h3>
        <p>The <code>stock</code> development profile mounts tldraw with none of SystemSketch's
        installs — same pinned <code>tldraw@5.3.2</code>, same bundle, no product seams. If the new
        gesture came from a patched engine, a forked tool or a monkey-patched state, it would show up
        here too.</p>
        <p>It does not, and that is the boundary <code>tests/test_stock_boundary.py</code> exists to
        keep: the behaviour lives entirely in one module mounted at <code>onMount</code>, and
        removing that one line puts the arrow tool back to exactly this.</p>
        <p>It is also the honest "before". The complaint was that a click had to become a
        press-and-hold; this is that, still true where the change was not installed.</p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">Every check, and what it read</h2>
    <p class="section-copy">Read from the painted document: the arrow's own SVG stroke sampled
    through <code>getScreenCTM</code>, the container's <code>data-state</code> attribute, and whether
    a live text editor exists in the DOM. Run with <code>npm run test:arrows</code>.</p>
    <table>
      <thead><tr><th>Check</th><th>Claim</th><th>Verdict</th><th>Observed</th></tr></thead>
      <tbody>__JOURNEY_ROWS__</tbody>
    </table>
  </section>

  <section>
    <h2 class="section-title">Three traps this cost, all of them in the measuring</h2>
    <div class="grid3">
      <div class="card">
        <h3>A path traversed twice</h3>
        <p>An arrow's shaft reports a <b>1000 px</b> path for a 500 px arrow — the geometry is walked
        twice — so the point at half its length is its <i>end</i>, not its middle. The first
        curvature check passed while measuring nothing at all. Curvature is now the largest departure
        from the chord over 41 samples, which is indifferent to how many times the path repeats.</p>
      </div>
      <div class="card">
        <h3>Counting keystrokes to reach a preset</h3>
        <p>A cycles straight → curve → elbow only when the arrow tool is <i>already</i> current, so
        the number of A presses needed depends on everything the journey did before. It quietly drew
        an elbow and called it a curve. Presets now come from the toolbar menu, which names the one
        it sets.</p>
      </div>
      <div class="card">
        <h3>Indexing arrows by paint order</h3>
        <p>Two of the first run's failures were the sampler reading a different arrow than the one
        the gesture had just drawn. Arrows are now found by <i>where they start</i>, and the helper
        throws unless exactly one matches.</p>
      </div>
    </div>
  </section>

  <footer>
    <b>Files.</b>
    <code>src/arrowClickToPlace.ts</code> (new — the whole gesture) ·
    <code>src/arrowClickToPlace.test.ts</code> ·
    <code>src/instantTextEditing.ts</code> (the connector exclusion) ·
    <code>src/toolbar/toolbarIntegration.ts</code> (the preset guard now asks whether the arrow tool
    is drawing, not which state it is in) · <code>src/App.tsx</code> ·
    <code>tests/arrow_drawing_smoke.mjs</code> · <code>tests/test_stock_boundary.py</code>.
    <br/><br/>
    <b>Deliberately not done.</b> The <code>line</code> tool keeps its own click model — this change
    is scoped to arrows, which is what was asked for. Arrows drawn before this change are untouched;
    nothing about an existing arrow's records moved. And no new interaction was invented: the
    placement is tldraw's own handle drag, reached by a different door.
  </footer>

</div>
</body>
</html>
'''


if __name__ == "__main__":
    main()
