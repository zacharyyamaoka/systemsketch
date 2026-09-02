#!/usr/bin/env python3
"""Build the hit-area proposal report.

Answers the request in `FR - Block, Ports & Edges Primitive` § "Selection areas
not working as intended": show, in red, where every invisible region that
answers a pointer actually is — for all three routings, for a Block with ports
and one without — and propose the rule each region follows.

Screenshots come from `docs/capture_hit_areas.mjs`, which drives the real app
with the `HitAreaOverlay` on. Every rectangle in them is painted from the same
function the hit test calls.
"""

from __future__ import annotations

import base64
import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import journey_results  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
VAULT = Path.home() / "zach_brain"
OUTPUT = DOCS / "hit-areas-2026-09-01.html"

CANVAS_CROP = (100, 60, 1180, 860)


def data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg"}[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def shot(name: str, crop=CANVAS_CROP) -> str:
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    image = Image.open(source).convert("RGB").crop(crop)
    image.save(out, optimize=True)
    return data_uri(out)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


REVEAL = journey_results(ASSETS / "edge-reveal.json", PROJECT_ROOT / "tests" / "edge_reveal_area_smoke.mjs", PROJECT_ROOT / "src")


REVEAL_CODE = """
// connectionRevealArea.ts — the region that reveals a cable's control points.
//
// Figma's model: a rectangle that fits the arrow's own outer extents, padded
// generously, recomputed as the arrow bends.
//
// This replaces a distance-to-the-curve test, which fails exactly where an
// elbow needs it most. A U-shaped route encloses a large empty area: the
// pointer can be squarely inside the arrow's footprint — reading as "on" the
// arrow to anyone looking at it — while being hundreds of pixels from the
// nearest stroke. Distance says no; the picture says yes.

export const REVEAL_PAD_SCREEN_PX = 24   // 2x tldraw's handle radius
export const REVEAL_MIN_SCREEN_PX = 64   // a floor, so a short cable is reachable

const bounds = Box.FromPoints(route)     // the cable's own rendered polyline
bounds.expandBy(REVEAL_PAD_SCREEN_PX / zoom)
"""

CHROME_CODE = """
// connectionProximity.ts — and one rule for every piece of chrome.
//
// The contextual menu sits above the cable it belongs to and frequently
// overlaps its reveal region; reaching for the menu would otherwise light up
// the very control points the menu is offering an alternative to. Rather than
// subtract each piece of chrome from the region, ask the only question that
// actually matters — is the thing under the pointer part of the canvas?
//
// Shapes render inside `.tl-canvas`; every panel, toolbar, menu and on-canvas
// offer renders in sibling layers. One rule, and it covers chrome that does not
// exist yet.
function isOverTheCanvas(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.tl-canvas') !== null
}
"""

REGIONS = [
    ("control-point reveal", "#dc2626", "dashed",
     "the cable's own extents + 24px",
     "reveals the control points on a <b>selected</b> cable, and nothing else. "
     "Recomputed from the live route, so it grows and shrinks as the arrow bends."),
    ("port drop snap", "#ea580c", "solid",
     "18 page units around each port anchor",
     "where a dropped cable end binds. React Flow's per-port model — never binds "
     "to a port you were nowhere near, unlike \"nearest port on the card\"."),
    ("reconnect radius", "#be185d", "solid",
     "10 page units around a <em>wired</em> port",
     "pressing here moves the cable that is already there instead of starting a "
     "second one. Only wired ports have it."),
    ("add-port gutter", "#9333ea", "solid",
     "the empty end of a lane, on the Block's edge",
     "hover reveals the <b>+</b> that creates the next port. Only on a selected "
     "Block, and only where a port could actually go."),
]

DECISIONS = [
    ("A rectangle, not a corridor",
     "For curved and straight a corridor would do. For an elbow it is simply wrong: measured "
     "in the running app, the point inside a wrapping elbow's box that is farthest from any "
     "stroke sits <b>151&nbsp;px</b> away. No tolerance anyone would accept on a straight line "
     "reaches that, and the pointer is unambiguously \"on\" the arrow. One rule for all three "
     "routings, and the elbow is the one that decides it."),
    ("24px of padding, and a 64px floor",
     "The padding is twice tldraw's handle radius — the box reaches exactly as far as a control "
     "point you could already grab if one sat on the boundary, so the reveal can never be "
     "tighter than the thing it reveals. The floor exists because a cable between two touching "
     "ports has a nearly degenerate box, and a sliver you cannot land on would make its one "
     "gesture unreachable."),
    ("Selected <b>and</b> near, not near alone",
     "Kept from Figma. Proximity alone would light up every cable you swept past; selection "
     "alone would sprinkle grabbable dots along a cable that crosses the whole board."),
    ("Chrome is not the board",
     "You noticed that Figma's menu sits outside the rectangle. Rather than subtract each panel "
     "from the region, the rule is that a pointer over anything outside <code>.tl-canvas</code> "
     "is not over the board at all. That covers the contextual menu, the toolbar, the docks, the "
     "Block offer, and whatever gets added next."),
    ("A halo under the handle, not a forked renderer",
     "tldraw paints its handles at a hard-coded 4px radius. Making them bigger properly would "
     "mean copying its renderer into this repo, and the SDK here is a dependency rather than a "
     "template to own. An extra overlay paints a 9px halo <em>underneath</em> each revealed "
     "control point instead: same result, no fork to rot at the next upgrade."),
    ("The <b>+</b> on an edge is gone",
     "As asked. An existing edge now offers exactly its control points; splicing a Block into a "
     "cable went with it, since that handle was its only entry point."),
]

OPEN = [
    ("Should the region also cover the Blocks at each end?",
     "Right now it is the cable's extents only, so a cable that ends deep inside a big Expanded "
     "Block has a box that stops at the port. Figma has no equivalent case. Easy to change — "
     "say the word."),
    ("Should hovering an unselected cable pre-reveal anything?",
     "Figma shows nothing until you select. An alternative is a faint hover state on the cable "
     "itself so you know it is grabbable before you commit a click. Not built."),
    ("Edge text",
     "You listed \"add text\" as one of the two things an existing edge should offer. The "
     "control points are done; labels are not built yet."),
]


def rows(results):
    return "\n".join(
        f'<tr><td><code>{html.escape(r["id"])}</code></td><td>{html.escape(r["label"])}</td>'
        f'<td><span class="pill {"ok" if r["ok"] else "bad"}">{"PASS" if r["ok"] else "FAIL"}</span></td></tr>'
        for r in results
    )


def main() -> None:
    curved = shot("hitarea-curved.png")
    straight = shot("hitarea-straight.png")
    elbow = shot("hitarea-elbow.png")
    ports = shot("hitarea-ports.png")
    no_ports = shot("hitarea-no-ports.png")
    reported_points = data_uri(VAULT / "Pasted image 20260901165841.png")
    reported_add = data_uri(VAULT / "Pasted image 20260901170045.png")
    figma_box = data_uri(VAULT / "Pasted image 20260901170538.png")
    figma_points = data_uri(VAULT / "Pasted image 20260901170742.png")

    legend = "\n".join(
        f'<tr><td><i style="border-color:{colour};border-style:{style};'
        f'background:{colour}2b"></i> <b>{name}</b></td>'
        f'<td><code>{extent}</code></td><td>{detail}</td></tr>'
        for name, colour, style, extent, detail in REGIONS
    )
    decisions = "\n".join(f"<tr><td><b>{q}</b></td><td>{a}</td></tr>" for q, a in DECISIONS)
    open_questions = "\n".join(f"<tr><td><b>{q}</b></td><td>{a}</td></tr>" for q, a in OPEN)
    passed = sum(1 for r in REVEAL if r["ok"])

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Hit areas</title>
<style>
  :root{{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;
        --green:#0e6b36;--red:#c4392c;--blue:#315be8}}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--paper);color:var(--ink);
        font:15px/1.58 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
  main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 80px}}
  .hero{{padding:34px;border:1px solid var(--line);border-radius:24px;background:var(--card);
         box-shadow:0 18px 50px #1218200b}}
  .kicker{{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}}
  h1{{margin:6px 0 12px;font-size:clamp(32px,5.2vw,58px);line-height:1.02;letter-spacing:-.05em}}
  .lede{{max-width:880px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}}
  .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;
          font:700 12px/1.2 ui-monospace,monospace}}
  .badge.ok{{border-color:#bfe3cd;background:#eefaf2;color:var(--green)}}
  section{{margin-top:52px}}
  h2{{margin:0 0 6px;font-size:28px;letter-spacing:-.03em}}
  h3{{margin:0 0 8px;font-size:17px}}
  .sub{{margin:0 0 22px;color:var(--muted);max-width:880px}}
  figure{{margin:0;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  figure img{{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9;background:#fff}}
  figcaption{{padding:10px 4px 2px;color:var(--muted);font-size:13.5px}}
  figcaption strong{{display:block;color:var(--ink);font-size:14.5px}}
  .two{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}
  pre{{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;
       color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}}
  table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
         border-radius:16px;overflow:hidden}}
  th,td{{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}}
  th{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}}
  tr:last-child td{{border-bottom:0}}
  td i{{display:inline-block;width:12px;height:12px;border:1.5px solid;vertical-align:-1px;margin-right:5px}}
  .pill{{display:inline-block;padding:3px 9px;border-radius:999px;
         font:700 11.5px/1.5 ui-monospace,monospace}}
  .pill.ok{{background:#eefaf2;color:var(--green)}}
  .pill.bad{{background:#fdf1ef;color:var(--red)}}
  code{{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}}
  .note{{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}}
  .note.good{{border-color:#bfe3cd;background:#eefaf2}}
  kbd{{padding:2px 6px;border:1px solid #c9ced4;border-bottom-width:2px;border-radius:5px;
       background:#fff;font:600 12px/1 ui-monospace,monospace}}
  footer{{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}}
  @media(max-width:880px){{.two{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>

  <header class="hero">
    <div class="kicker">SystemSketch · Hit areas · 1 Sep 2026</div>
    <h1>Where the<br>invisible parts are.</h1>
    <p class="lede">You asked to see the regions that answer a pointer, drawn in red. They are drawn
      in red — not in a mockup, but by the running app, from the same functions the hit tests call,
      so a rectangle here that disagreed with the behaviour would be impossible. Turn them on for
      any board with <code>?hitareas=1</code> or toggle them live with <kbd>⇧H</kbd>.</p>
    <div class="badges">
      <span class="badge ok">{passed}/{len(REVEAL)} reveal checks</span>
      <span class="badge ok">the edge <b>+</b> is gone</span>
      <span class="badge">Figma's rectangle model</span>
      <span class="badge">live overlay, not a mockup</span>
    </div>
  </header>

  <!-- ------------------------------------------------------------------ 1 -->
  <section>
    <h2>1 · What was wrong</h2>
    <div class="two">
      <figure><img src="{reported_points}" alt="Control points not appearing">
        <figcaption><strong>Your report</strong>“The cursor is near the arrow but the control points
          are not appearing.” The old rule measured distance to the stroke — 36 page units — which
          an elbow's open middle blows straight past.</figcaption></figure>
      <figure><img src="{reported_add}" alt="Add-port hover in the wrong place">
        <figcaption><strong>And the <b>+</b></strong>Floating inside the card instead of on the edge
          where the ports live, with a hover zone that did not agree with what it
          drew.</figcaption></figure>
    </div>
  </section>

  <!-- ------------------------------------------------------------------ 2 -->
  <section>
    <h2>2 · The rule, copied from Figma</h2>
    <p class="sub">You proposed it: “for the elbow it would propose just copying what figma does. it
      seems to have this dynamically resizing box based out the outer extents of the arrow.” That is
      now the rule for all three routings, not just the elbow.</p>
    <div class="two">
      <figure><img src="{figma_box}" alt="Figma's bounding box around an elbow">
        <figcaption><strong>Figma</strong>The box fits the arrow's outer extents and follows it as
          it bends.</figcaption></figure>
      <figure><img src="{figma_points}" alt="Figma's revealed control points">
        <figcaption><strong>And the points are big</strong>Once revealed, easy to see and to
          grab.</figcaption></figure>
    </div>
    <pre style="margin-top:18px">{code(REVEAL_CODE)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 3 -->
  <section>
    <h2>3 · The regions, in red</h2>
    <p class="sub">Every rectangle below is painted by the live overlay from the hit test's own
      answer. The dashed red box is the reveal region; the pointer is parked inside it and off the
      stroke in each shot.</p>
    <table style="margin-bottom:20px">
      <thead><tr><th style="width:26%">Region</th><th style="width:26%">Extent</th><th>What it decides</th></tr></thead>
      <tbody>{legend}</tbody>
    </table>
    <div class="two">
      <figure><img src="{curved}" alt="Curved cable hit areas">
        <figcaption><strong>Curved</strong>The box hugs the bezier's extents. A corridor would do
          here — which is exactly why the curved case never showed the
          problem.</figcaption></figure>
      <figure><img src="{straight}" alt="Straight cable hit areas">
        <figcaption><strong>Straight</strong>Same rule, thinner box. The 64px floor is what keeps a
          near-horizontal cable's box landable.</figcaption></figure>
    </div>
    <figure style="margin-top:18px"><img src="{elbow}" alt="Elbow cable hit areas">
      <figcaption><strong>Elbow — the case that decides the rule</strong>The box wraps the whole
        route. Measured in the running app, the point inside it that is farthest from any stroke is
        <b>151&nbsp;px</b> away: no corridor reaches that, and standing there the pointer is
        unambiguously on the arrow.</figcaption></figure>
  </section>

  <!-- ------------------------------------------------------------------ 4 -->
  <section>
    <h2>4 · Ports, and the case with none</h2>
    <p class="sub">The port regions are the numbers you picked on 2026‑08‑27, now visible. The
      add-port gutter has moved onto the Block's edge, in line with the port dots.</p>
    <div class="two">
      <figure><img src="{ports}" alt="Port hit areas">
        <figcaption><strong>With ports</strong>Orange: where a dropped cable end binds. Pink: where a
          press moves the cable already there. Purple: the add gutter, on the edge, below the last
          port.</figcaption></figure>
      <figure><img src="{no_ports}" alt="Add-port hit area with no ports yet">
        <figcaption><strong>With none yet</strong>The case you called out. The gutter still lands on
          the edge, at the row the first port would occupy.</figcaption></figure>
    </div>
  </section>

  <!-- ------------------------------------------------------------------ 5 -->
  <section>
    <h2>5 · Chrome is not the board</h2>
    <p class="sub">You noticed the menu sits outside Figma's rectangle. Rather than subtract each
      panel from the region, there is one rule.</p>
    <pre>{code(CHROME_CODE)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 6 -->
  <section>
    <h2>6 · Calls I made</h2>
    <table><tbody>{decisions}</tbody></table>
    <h3 style="margin-top:28px">Still open — your call</h3>
    <table><tbody>{open_questions}</tbody></table>
  </section>

  <!-- ------------------------------------------------------------------ 7 -->
  <section>
    <h2>7 · Proof</h2>
    <p class="sub">Driven through the real product build with real pointer events, and read from the
      renderer's own overlay list — tldraw v5 paints handles to a <code>&lt;canvas&gt;</code>, so
      there is no DOM for this one claim.</p>
    <table><tbody>{rows(REVEAL)}</tbody></table>
    <div class="note good" style="margin-top:16px"><b>See it yourself:</b> append
      <code>?hitareas=1</code> to any board's URL, or press <kbd>⇧H</kbd> on the canvas. The overlay
      is development-only and cannot exist in a released Stable build.</div>
  </section>

  <footer>
    Reveal geometry <code>src/blocks/connections/connectionRevealArea.ts</code> ·
    the rule <code>src/blocks/connections/connectionProximity.ts</code> ·
    the overlay <code>src/blocks/ui/HitAreaOverlay.tsx</code> ·
    journey <code>tests/edge_reveal_area_smoke.mjs</code> ·
    captures <code>docs/capture_hit_areas.mjs</code> · tldraw 5.3.2.
  </footer>

</main></body>
</html>
"""

    OUTPUT.write_text(report, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
