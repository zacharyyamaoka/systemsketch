#!/usr/bin/env python3
"""Build `docs/tether-elbow-2026-09-03.html`: V5's interior tether, drawn with elbows.

Zach's question: what does the interior tether look like as an elbow line rather
than the dashed curve the gallery drew? Plus his two constraints — it is
**render only** (no pointer events, so it cannot interfere with anything on the
Block) and it shows in **Port view only**, hidden when the Block is expanded.

Both matter for the cost the gallery charged V5: "interior wiring is a new
convention nothing else in the idiom uses, and three tethers converging reads as
a tangle". An elbow is not a new convention — every cable in this app is already
elbow-routed — and the tangle turns out to be an artefact of the curve.
"""

from __future__ import annotations

import html
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "tether-elbow-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from build_effect_port_identity import (  # noqa: E402
    EFFECT_INK, RECONCILE_ARGS, Board, MUTED, WARN, dot, draw_mutator,
    stub_cable, text, top_point,
)

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()
TETHER = "#c9ccd5"


def esc(s) -> str:
    return html.escape(str(s))


def elbow(svg, points, *, dashed=True, colour=TETHER, width=1.4, opacity=0.9):
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="3 3"' if dashed else ""
    svg.add(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"{dash}/>')


def scene(kind: str, w=440, h=235) -> str:
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 34, 66, 200, "reconcile", RECONCILE_ARGS)
    bx, by, bw, bh = rect
    starts = []
    for index, m in enumerate(mutated):
        px, py = top_point(rect, m["edge_t"])
        ix, iy = m["in_xy"]
        if kind == "curve":
            svg.add(f'<path d="M{ix},{iy} Q{ix},{py} {px},{py}" fill="none" stroke="{MUTED}" '
                    f'stroke-width="1.3" stroke-dasharray="3 3" opacity="0.6"/>')
        elif kind == "elbow":
            # Along the row, then straight up the port's own column. Rows run
            # top-to-bottom in the same order the ports run left-to-right, so
            # every horizontal stops short of the next tether's column and no
            # two tethers ever cross.
            elbow(svg, [(ix, iy), (px, iy), (px, py)])
        elif kind == "gap":
            # Interior, but dropped into the gap under the row so it never
            # strikes the name or the type. The strike-through, not the elbow,
            # is what made the through-route feel like an overload.
            lane = iy + 13
            elbow(svg, [(ix, iy), (ix + 10, iy), (ix + 10, lane), (px, lane), (px, py)])
        elif kind == "lane":
            # Outside, with the horizontal in its own lane above the card rather
            # than on the border, so the correspondence is actually visible.
            gutter = bx - 10 - index * 7
            top = by - 13 - index * 7
            elbow(svg, [(ix, iy), (gutter, iy), (gutter, top), (px - 9, top), (px - 9, py)])
        elif kind == "around":
            # Outside the card entirely: out of the row, down the left gutter,
            # then along the top border to the port. Nothing crosses the body,
            # so the interior stays exactly as legible as it is today.
            gutter = bx - 12 - index * 8
            elbow(svg, [(ix, iy), (gutter, iy), (gutter, by), (px, by)])
        elif kind == "trunk":
            gutter = bx + 16 + index * 7
            elbow(svg, [(ix, iy), (gutter, iy), (gutter, by + 12), (px, by + 12), (px, py)])
        svg.add(f'<path d="M{px},{py} L{px},{py-26}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        starts.append((px, py - 26))
    for i, s in enumerate(starts):
        stub_cable(svg, s, dx=70 + (i % 2) * 14, dy=-16 - i * 20)
    return svg.render(f"interior tether — {kind}")


def expanded(w=440, h=235) -> str:
    """Port view is where it shows; expanded is where it must not."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 34, 66, 200, "reconcile", RECONCILE_ARGS)
    bx, by, bw, bh = rect
    svg.add(f'<rect x="{bx+14}" y="{by+52}" width="{bw-28}" height="{bh-70}" rx="4" '
            f'fill="none" stroke="#d9dce3" stroke-width="1.1" stroke-dasharray="4 4"/>')
    svg.add(text(bx + bw / 2, by + 52 + (bh - 70) / 2, "the body, and its own cables",
                 size=10.5, color=MUTED, italic=True, anchor="middle"))
    starts = []
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py-26}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        starts.append((px, py - 26))
    for i, s in enumerate(starts):
        stub_cable(svg, s, dx=70 + (i % 2) * 14, dy=-16 - i * 20)
    return svg.render("expanded — no tether")


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.62 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:40px 30px 80px}
h1{font-size:29px;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 26px}
h2{font-size:20px;margin:44px 0 12px;padding-top:14px;border-top:1px solid var(--line)}
p{margin:0 0 13px}
code{font:13px/1.5 'JetBrains Mono',ui-monospace,Menlo,monospace;background:#eef0f3;padding:1px 5px;border-radius:4px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin:18px 0}
figure{margin:0}
.board{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:#f7f8fa}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
figcaption b{color:var(--ink)}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:15px 17px;margin:20px 0}
.callout.warn{border-left-color:var(--warn)}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
b.k{background:#fff4ed;border-bottom:2px solid var(--warn);padding:0 2px}
"""


def build() -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The interior tether, as an elbow</title><style>{CSS}</style></head><body><main>
<h1>The interior tether, as an elbow</h1>
<p class="sub">Render only, Port view only — and the tangle turns out to be the curve's fault, not the
tether's. 2026-09-03.</p>

<div class="grid">
<figure id="fig-curve">{scene('curve')}<figcaption><b>As drawn in the gallery.</b> A quadratic curve from each hook to its
port. The three bow toward one another and cross in the middle third.</figcaption></figure>
<figure id="fig-elbow">{scene('elbow')}<figcaption><b>Elbow, along the row then up the port's column.</b> Same three
tethers, <b class="k">no crossings at all</b>.</figcaption></figure>
</div>

<div class="callout"><b>Why the crossings disappear, and when they would come back.</b> The rows run
top-to-bottom in the same order the ports run left-to-right. So each tether's horizontal segment stops at its
own port's column — short of every later tether's column — and each vertical rises in a column no other
tether's horizontal reaches. The routes are monotone in both axes, so they cannot cross. That is a property of
<i>the default order</i>, not of elbows: drag one port past another (the V4 stress board) and the two tethers
that now disagree with their rows will cross exactly once — which is arguably the right behaviour, since the
crossing is the board telling you the reading order no longer matches the signature.</div>

<h2>The two constraints you added</h2>
<p><b>Render only.</b> It takes no pointer events, so it cannot swallow a click meant for the block, a port or
a cable. That is already the idiom here — <code>.Port</code> itself is <code>pointer-events: none</code> until
a cable is in flight — so the tether is a paint pass, not an affordance. It also means the tether never needs a
hit area, which is what would otherwise have made three of them genuinely crowded.</p>
<p><b>Port view only.</b> The expanded body is full of real blocks and real cables; a faint dashed line
threading through it would compete with them and read as wiring. Hidden there, the tether costs nothing.</p>
<div class="grid">
<figure>{scene('elbow')}<figcaption><b>Port view</b> — the tether is the only thing inside the card, so it has
the space to be read.</figcaption></figure>
<figure id="fig-expanded">{expanded()}<figcaption><b>Expanded</b> — no tether. The ports still say what they are; the
correspondence is a Port-view affordance.</figcaption></figure>
</div>

<h2>Routing around, instead of through</h2>
<p>You are right that three tethers inside the card is an overload — the interior is the one place a Block has
no spare room. Taken outside it costs the interior nothing: out of the row, down the left gutter, along the top
border to the port. It is longer, and it spends the left margin, which is otherwise free.</p>
<div class="grid">
<figure id="fig-around">{scene('around')}<figcaption><b>Around the outside.</b> The card's interior is untouched; the
correspondence rides the gutter and the top border.</figcaption></figure>
<figure>{scene('elbow')}<figcaption><b>Through the interior.</b> Shorter and more direct, but it is ink inside
the one region that has no room to spare.</figcaption></figure>
</div>

<h2>The two that actually work</h2>
<p>Rendered, the first two both have a flaw the sketch hid. The direct interior route runs its horizontal
along the row's own baseline, so it <b class="k">strikes through the name and the type</b>. And hugging the
border outside makes the tether so quiet you cannot follow it. Both are fixed by moving the horizontal off the
thing it collides with.</p>
<div class="grid">
<figure id="fig-gap">{scene('gap')}<figcaption><b>Interior, in the gap under each row.</b> Direct, still
crossing-free, and it touches no text.</figcaption></figure>
<figure id="fig-lane">{scene('lane')}<figcaption><b>Outside, in its own lane.</b> The interior stays empty
and the correspondence is visible, at the cost of the margin above the card.</figcaption></figure>
</div>

<div class="callout"><b>Where I land: interior, in the row gap.</b> The elbow is the clearer wire, as you
said — but the reason to keep it <i>inside</i> is that the space outside is not free. <b class="k">Every effect
cable already leaves the top edge and travels right</b>, so the margin above the card is that lane. A tether
routed around it would run in the same band as the cables it exists to explain, and at three arguments the
nested brackets above the card become their own clutter. Inside, dropped into the gap under each row, it
touches no text, crosses nothing, and spends a region that is otherwise empty in Port view. Your overload
point still stands at the top end: at three tethers even this is busy, and the tether is at its best when one
or two arguments mutate — beyond that the port label or the type colour is doing the work and the tether is
along for the ride.</div>

<h2>The shared-trunk variant, for contrast</h2>
<div class="grid">
<figure id="fig-trunk">{scene('trunk')}<figcaption><b>Down a gutter, then across.</b> Three verticals stacked in the left
margin and three horizontals under the top edge — more ink, more parallel runs, and the correspondence is
harder to follow than the direct route.</figcaption></figure>
<figure>{scene('elbow')}<figcaption><b>Direct, again.</b> One corner per tether is the fewest a right-angle
route can have between a left edge and a top edge.</figcaption></figure>
</div>

<div class="callout warn"><b>What this does to V5's stated costs.</b> The gallery charged it two things.
<i>"Interior wiring is a new convention nothing else in the idiom uses"</i> — an elbow is not new; it is the
routing every cable already uses, and the dashed weight separates it from a real cable the same way the
non-live 18% fade does. <i>"Three tethers converging reads as a tangle"</i> — measured above, they do not
converge and do not cross; the curve was doing that. What remains chargeable is subtler: a dashed line inside
a card still reads faintly as <i>structure</i>, and on a Block with many rows the verticals get long.</div>

<footer>Built by <code>docs/build_tether_elbow.py</code> at {GIT_HEAD} · scene helpers shared with
<code>docs/build_effect_port_identity.py</code> so the blocks are drawn identically · Claude Code · Opus 5,
2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
