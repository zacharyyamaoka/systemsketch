#!/usr/bin/env python3
"""Build `docs/while-loop-break-2026-09-03.html`: ten ways to draw a `break`.

Zach converged on the while-loop header himself (`FR - Block, Ports & Edges
Primitive.md` §While loops, 2026-09-03): a hollow ring at the region's top-left
corner is the condition inlet, fed by a real cable from outside — "the thing that
determines the while loop should 100% come in from the outside and go to the
header." That part is now GIVEN, not under debate, and is drawn identically in
all ten boards below.

What's still open is `break`, and he named the problem precisely: "the issue is
break is not data flow... I feel like I may not actually be able to represent it,
and that is fine! My goal is to show data flow, not control flow." His own
instinct was a dedicated ring on the header band, or failing that, left-to-right
ordering plus an icon. The ten below take that seriously — several of them are
honest admissions that a break can only be APPROXIMATED, not represented, in a
pure dataflow grammar, and say so.

Everything else (the region, the settled corner ring, the back cable, the z⁻¹
chip, the seed|back receiver) is held constant. A second block (`check()`) sits
after `refine()` in the body specifically so `break` has somewhere to originate
from that ISN'T the loop's only block — proving each mark localizes (or doesn't)
an arbitrary interior point, not just "the loop" as a whole.

Run:  python3 docs/build_while_loop_break.py
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "while-loop-break-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, frame, note, polycable, text,
)

TODAY = "2026-09-03"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
BOOL = "#7c3aed"    # the Aug 25 dashed-event-rail purple, reused for anything control/event
BREAK = "#c0392b"   # break's own colour — never used for data, control, or the z⁻¹ chip elsewhere
STATE = "#0f766e"

# --------------------------------------------------------------------------
# Measured from the live repo
# --------------------------------------------------------------------------


def repo_facts() -> dict:
    model = (REPO / "src" / "loop" / "loopModel.ts").read_text(encoding="utf-8")
    has_break = "break" in model.lower()
    return {
        "hasLoopShape": (REPO / "src" / "loop" / "LoopShapeUtil.tsx").exists(),
        "loopModelMentionsBreak": has_break,
        "priorHeaderGallery": (DOCS / "while-loop-header-2026-09-03.html").exists(),
    }


FACTS = repo_facts()

# --------------------------------------------------------------------------
# Shared drawing helpers
# --------------------------------------------------------------------------


def arrowhead(svg: SVG, x, y, color=CABLE, opacity=1.0) -> None:
    svg.add(f'<path d="M{x - 8},{y - 4} L{x},{y} L{x - 8},{y + 4} z" fill="{color}" opacity="{opacity}"/>')


def path_d(points) -> str:
    return "M" + " L".join(f"{x},{y}" for x, y in points)


def lane_label_pos(points):
    best = None
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if y1 == y2 and (best is None or abs(x2 - x1) > best[0]):
            best = (abs(x2 - x1), ((x1 + x2) / 2, y1))
    return best[1]


REG = dict(x=440, y=110, w=560, h=380)


def region_shell(svg: SVG) -> dict:
    """The settled header: a hollow ring at the top-left CORNER, fed from outside.
    Drawn identically in all ten — this part is no longer a design variable."""
    x, y, w, h = REG["x"], REG["y"], REG["w"], REG["h"]
    band_h = 32
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + band_h}" x2="{x + w}" y2="{y + band_h}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(f'<circle cx="{x}" cy="{y}" r="6" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
    svg.add(text(x + w / 2, y + 20, "While Loop", size=14, weight=700, color=INK, anchor="middle"))
    return {"x": x, "y": y, "w": w, "h": h, "right": x + w, "band_bottom": y + band_h, "bottom": y + h, "corner": (x, y)}


def draw_body(svg: SVG, reg: dict) -> dict:
    """Everything held constant: frame, boundary ports, estimate(), the settled
    corner-ring condition inlet, refine() + check() in sequence, the back cable
    with its shipped z⁻¹ chip, the exit cable (plain dotted — see §3), the
    zero-iterations cable. Returns check()'s `ok` output — where every break
    variant's mark originates."""
    frame(svg, 20, 20, 1380, 600, "track()")
    fr = boundary_in(svg, 20, 175, "frame", "Frame")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    tol = boundary_in(svg, 20, 440, "tol", "float", NUMBER)
    estimate = block(svg, 150, 200, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    svg.add(cable(fr, estimate["in"]["frame"], mid=110))
    svg.add(cable(gain, estimate["in"]["gain"], mid=110))

    corner = reg["corner"]
    svg.add(cable(tol, corner, kind="control", mid=405))

    refine = block(svg, 520, 210, 190, "refine()", [{"name": "pose", "type": "Pose"}, {"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    check = block(svg, 790, 210, 170, "check()", [{"name": "pose", "type": "Pose"}], [{"name": "pose", "type": "Pose"}, {"name": "ok", "type": "Bool"}])
    pose_in = refine["in"]["pose"]
    svg.add(cable(estimate["out"]["Pose"], pose_in, mid=430))
    svg.add(polycable([fr, (110, fr[1]), (110, 330), (480, 330), (480, refine["in"]["frame"][1]), refine["in"]["frame"]]))
    svg.add(cable(refine["out"]["Pose"], check["in"]["pose"], mid=760))

    lane_y = reg["bottom"] - 30
    back_pts = [check["out"]["pose"], (1010, check["out"]["pose"][1]), (1010, lane_y), (490, lane_y), (490, pose_in[1]), pose_in]
    svg.add(polycable(back_pts))
    arrowhead(svg, pose_in[0], pose_in[1])
    mx, my = lane_label_pos(back_pts)
    w = 34
    svg.add(f'<rect x="{mx - w / 2}" y="{my - 10}" width="{w}" height="20" rx="10" fill="#fff" stroke="{INK}" stroke-width="1.3"/>')
    svg.add(text(mx, my + 4.5, "z⁻¹", size=12, weight=700, anchor="middle", mono=True))
    svg.add(text(mx + w / 2 + 8, my - 7, "seed = estimate()", size=10.5, color=MUTED, italic=True))

    pose_out = boundary_out(svg, 1360, check["out"]["pose"][1], "pose", "Pose")
    svg.add(polycable([check["out"]["pose"], (1220, check["out"]["pose"][1]), (1220, pose_out[1]), pose_out], dashed=True))
    ex, ey = estimate["out"]["Pose"]
    svg.add(polycable([(ex, ey), (400, ey), (400, 560), (1300, 560), (1300, pose_out[1]), pose_out]))
    svg.add(text(850, 554, "zero iterations: the seed is returned", size=10.5, color=MUTED, italic=True, anchor="middle"))

    return {"ok": check["out"]["ok"], "check_rect": (790, 210, 170), "refine_rect": (520, 210, 190), "lane_y": lane_y, "back_mx_my": (mx, my)}


# --------------------------------------------------------------------------
# The ten break marks
# --------------------------------------------------------------------------


def b1_dedicated_ring(svg, reg, ctx):
    """B1 · A second ring on the header band, symmetric with the settled corner inlet."""
    x, y = reg["corner"]
    rx, ry = x + 34, y
    svg.add(f'<circle cx="{rx}" cy="{ry}" r="6" fill="#fff" stroke="{BREAK}" stroke-width="1.6"/>')
    svg.add(text(rx + 10, ry + 18, "break", size=10.5, color=BREAK, weight=700))
    ox, oy = ctx["ok"]
    svg.add(polycable([(ox, oy), (ox + 30, oy), (ox + 30, ry - 30), (rx, ry - 30), (rx, ry)], color=BREAK, width=1.6))
    arrowhead(svg, rx, ry, BREAK)


def b2_or_into_condition(svg, reg, ctx):
    """B2 · No new port — fold into the SAME condition inlet, LabVIEW's actual move."""
    x, y = reg["corner"]
    ox, oy = ctx["ok"]
    svg.add(polycable([(ox, oy), (ox + 30, oy), (ox + 30, y - 34), (x, y - 34), (x, y)], color=BREAK, width=1.6, dashed=True))
    arrowhead(svg, x, y, BREAK)
    svg.add(f'<circle cx="{x - 15}" cy="{y - 17}" r="7" fill="#fff" stroke="{INK}" stroke-width="1.2"/>')
    svg.add(text(x - 15, y - 13, "∨", size=11, weight=700, anchor="middle", color=INK))
    svg.add(text(x + 10, y - 34 + 4, "or", size=9.5, color=MUTED, italic=True))


def b3_boundary_event(svg, reg, ctx):
    """B3 · BPMN's boundary event — an icon ON the wall, an escape arrow leaving it."""
    cx, cy, cw = ctx["check_rect"]
    bx, by = cx + cw, reg["bottom"]
    svg.add(f'<circle cx="{bx}" cy="{by}" r="9" fill="#fff" stroke="{BREAK}" stroke-width="2"/>')
    svg.add(f'<circle cx="{bx}" cy="{by}" r="5.5" fill="none" stroke="{BREAK}" stroke-width="1.4"/>')
    ox, oy = ctx["ok"]
    svg.add(polycable([(ox, oy), (bx, oy), (bx, by)], color=BREAK, width=1.4, dashed=True))
    ex = reg["right"] + 60
    svg.add(f'<path d="M{bx},{by} L{ex},{by}" fill="none" stroke="{BREAK}" stroke-width="1.8" stroke-dasharray="6 4" stroke-linecap="round"/>')
    arrowhead(svg, ex, by, BREAK)
    svg.add(text(bx + 8, by + 18, "after the loop", size=9.5, color=MUTED, italic=True))


def b4_escape_arrow(svg, reg, ctx):
    """B4 · A plain escape arrow through the wall — no icon at all."""
    ox, oy = ctx["ok"]
    ex = reg["right"] + 60
    svg.add(polycable([(ox, oy), (ex, oy)], color=BREAK, width=1.8, dashed=True))
    arrowhead(svg, ex, oy, BREAK)
    svg.add(text((ox + ex) / 2, oy - 8, "break", size=10, color=BREAK, weight=700, anchor="middle", italic=True))


def b5_inline_icon(svg, reg, ctx):
    """B5 · A stop icon beside the block, no wire anywhere — Zach's own 'break icon' idea."""
    cx, cy, cw = ctx["check_rect"]
    ix, iy = cx + cw + 20, cy + 18
    pts = ",".join(f"{ix + 9 * __import__('math').cos(a)},{iy + 9 * __import__('math').sin(a)}" for a in [i * 0.785398 for i in range(8)])
    svg.add(f'<polygon points="{pts}" fill="#fff" stroke="{BREAK}" stroke-width="1.8"/>')
    svg.add(text(ix, iy + 4, "!", size=11, weight=700, anchor="middle", color=BREAK))
    svg.add(text(ix + 16, iy + 4, "check() can end it — nothing wired", size=9.5, color=MUTED, italic=True))


def b6_event_rail(svg, reg, ctx):
    """B6 · Reuse the existing dashed event rail — a break IS an event, not a value."""
    ox, oy = ctx["ok"]
    ex, ey = reg["right"] + 40, reg["y"] + 60
    svg.add(f'<path d="M{ox},{oy} L{ex},{oy} L{ex},{ey}" fill="none" stroke="{BOOL}" stroke-width="1.8" stroke-dasharray="7 5" stroke-linecap="round"/>')
    bx, by = ex, ey
    svg.add(f'<path d="M{bx - 4},{by - 8} L{bx + 3},{by - 1} L{bx - 1},{by - 1} L{bx + 4},{by + 8} L{bx - 3},{by + 1} L{bx + 1},{by + 1} z" fill="{BOOL}"/>')
    svg.add(text(bx + 10, by + 4, "event: break", size=9.5, color=BOOL, italic=True))


def b7_state_inset(svg, reg, ctx):
    """B7 · A small state-machine inset — the honest admission this needs a different notation."""
    ix, iy = reg["right"] - 150, reg["y"] + 50
    svg.add(text(ix, iy - 6, "not dataflow", size=8.5, color=MUTED, italic=True))
    svg.add(f'<rect x="{ix}" y="{iy}" width="140" height="50" rx="6" fill="#fff" stroke="{BORDER}" stroke-width="1"/>')
    r1x, r2x, ry = ix + 30, ix + 108, iy + 34
    svg.add(f'<circle cx="{r1x}" cy="{ry}" r="12" fill="#fff" stroke="{INK}" stroke-width="1.3"/>')
    svg.add(text(r1x, ry + 4, "run", size=9, anchor="middle"))
    svg.add(f'<circle cx="{r2x}" cy="{ry}" r="12" fill="#fff" stroke="{BREAK}" stroke-width="1.3"/>')
    svg.add(text(r2x, ry + 4, "done", size=9, anchor="middle", color=BREAK))
    svg.add(f'<path d="M{r1x + 12},{ry - 4} Q{(r1x + r2x) / 2},{ry - 18} {r2x - 12},{ry - 4}" fill="none" stroke="{BREAK}" stroke-width="1.4"/>')
    arrowhead(svg, r2x - 12, ry - 4, BREAK)
    svg.add(text((r1x + r2x) / 2, ry - 22, "check().ok", size=8, color=BREAK, anchor="middle", italic=True))
    ox, oy = ctx["ok"]
    svg.add(polycable([(ox, oy), (r2x, oy), (r2x, iy + 50)], color=BREAK, width=1.2, dashed=True))


def b8_gutter_marker(svg, reg, ctx):
    """B8 · A gutter mark on the block itself, like an editor breakpoint dot — positional, not wired."""
    cx, cy, cw = ctx["check_rect"]
    svg.add(f'<line x1="{cx}" y1="{cy + 2}" x2="{cx}" y2="{cy + 102}" stroke="{BREAK}" stroke-width="4"/>')
    svg.add(f'<circle cx="{cx}" cy="{cy + 20}" r="5" fill="{BREAK}"/>')
    svg.add(text(cx + 4, cy + 122, "can break here — a gutter mark, not a cable", size=9.5, color=BREAK, italic=True))


def b9_poison_pill(svg, reg, ctx):
    """B9 · Overload the shipped back-cable — a poison pill riding the same lane as z⁻¹."""
    mx, my = ctx["back_mx_my"]
    cx = mx - 70
    s = 8
    svg.add(f'<path d="M{cx},{my - s} L{cx + s},{my} L{cx},{my + s} L{cx - s},{my} z" fill="{BREAK}" stroke={f"\"{INK}\""} stroke-width="1.2"/>')
    svg.add(text(cx, my - 16, "break?", size=9.5, color=BREAK, italic=True, anchor="middle"))
    ox, oy = ctx["ok"]
    svg.add(polycable([(ox, oy), (ox, my - 30), (cx, my - 30), (cx, my - s)], color=BREAK, width=1.2, dashed=True))


def b10_badge_only(svg, reg, ctx):
    """B10 · Not drawn at all — a header badge is the whole answer."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    label = "⚠ may exit early"
    cw = 6.6 * len(label) + 18
    svg.add(f'<rect x="{x + w - cw - 12}" y="{y + 8}" width="{cw}" height="18" rx="9" fill="#fff" stroke="{BREAK}" stroke-width="1.2"/>')
    svg.add(text(x + w - cw / 2 - 12, y + 20.5, label, size=10, color=BREAK, weight=600, anchor="middle"))
    svg.add(text(x + w / 2, y + 44, "see source for exactly where", size=9, color=MUTED, italic=True, anchor="middle"))


VARIANTS = [
    {"id": "b1", "name": "Dedicated ring on the header band", "fn": b1_dedicated_ring,
     "thesis": "A second hollow ring sits beside the settled condition inlet, labelled \"break\" — Zach's own first sketch, formalised. Any boolean produced inside wires straight up to it, symmetric with how the condition itself arrives.",
     "best": "Visually the most consistent with the header you've already drawn — a reader who understood the condition ring understands this one for free.",
     "loses": "It looks exactly like an ordinary data port, which is the one thing a `break` is not — a cold reader has no reason to think this ring behaves differently from the condition ring next to it, and multiple break sites all converge on one ring, losing which one actually fired."},
    {"id": "b2", "name": "OR'd into the condition inlet — LabVIEW's real move", "fn": b2_or_into_condition,
     "thesis": "No new port at all. LabVIEW has no dedicated break primitive — you wire an OR of every stop-reason into the same conditional terminal. `check().ok` lands on the identical ring `tol` already uses, with a small ∨ where they join.",
     "best": "The single most honest answer to \"is break dataflow\": it says yes, by literally treating it as one more producer of the one boolean the loop already reads. Zero new ports, zero new colour.",
     "loses": "The ring now silently does two jobs (continue-while and stop-on) and a reader has to notice the ∨ to know two cables, not one, decide the loop's fate; the visual distance from `check()` to the corner makes the escape hard to spot."},
    {"id": "b3", "name": "BPMN boundary event", "fn": b3_boundary_event,
     "thesis": "BPMN's literal answer to \"interrupt an enclosed process from partway through\": a small double-ringed icon sits ON the region's own border, and a dashed arrow leaves it for wherever control resumes.",
     "best": "The clearest possible statement of what a break IS — an interrupt that lands the reader outside the loop, drawn exactly where that landing happens, with real, cited prior art built for precisely this case.",
     "loses": "A new icon and a new arrow kind, neither of which the canvas has today; the icon sits on the wall nearest `check()` rather than at `check()` itself, so it's one visual hop removed from the block that actually decides."},
    {"id": "b4", "name": "Escape arrow through the wall, no icon", "fn": b4_escape_arrow,
     "thesis": "Classic flowchart literalism: a single dashed arrow runs straight from `check()`'s `ok` port, through the region's own boundary, to a point just past the loop. The containment rule every other mark in this grammar respects is broken exactly once, on purpose.",
     "best": "Nothing to learn beyond \"this line means the reader's eye jumps here\" — nothing on the canvas is simpler for one break site.",
     "loses": "It's a naked goto, the exact thing Zach flagged as the representability problem — and it violates the one structural promise every region in this project has kept so far (a cable never crosses a wall except at a real port)."},
    {"id": "b5", "name": "Inline stop icon, no wire", "fn": b5_inline_icon,
     "thesis": "Zach's other suggestion, taken literally: a small stop-sign sits beside `check()`. No cable anywhere. The reader learns this block can end the loop only by noticing the icon and reading left to right — an explicit admission that this part isn't dataflow.",
     "best": "Costs nothing to build, invents no new cable machinery, and is honest about the limit in the plainest possible way — this is the \"and that's fine\" answer taken at face value.",
     "loses": "There is genuinely no way to tell, from the icon alone, WHERE the loop resumes or what the exit value is; it communicates \"something can happen here\" and nothing else."},
    {"id": "b6", "name": "Event rail (reuse the async dashed-purple convention)", "fn": b6_event_rail,
     "thesis": "A break is fundamentally an event, not a value — so draw it with the mark this project already reserves for events: the same dashed purple rail proposed for async wires, run from `check()` to a small lightning-bolt marker at the region's edge.",
     "best": "Reuses a mark that already exists in the design language rather than inventing a break-specific one; \"this is control, not data\" is stated by colour alone, which is exactly how the rest of the canvas separates kinds.",
     "loses": "It borrows a colour already earmarked for something else (async/event cables), so the day this project actually ships async wiring, break and async become visually identical unless a second qualifier is added."},
    {"id": "b7", "name": "Two-state inset (Running → Done)", "fn": b7_state_inset,
     "thesis": "A small, deliberately separate state-transition diagram — Running, Done, and `check().ok` as the labelled transition between them — inset in the region's corner. An admission that break needs different notation, drawn as a different notation rather than forced into the dataflow one.",
     "best": "It's the only variant that doesn't pretend a state machine is a data graph; two nodes and one arrow are the actual right tool for \"this loop can stop early\", borrowed honestly rather than bent to fit.",
     "loses": "It's a second diagram grammar living inside the first one — the exact kind of two-mental-models cost this project has avoided everywhere else, and it says nothing about where the loop resumes."},
    {"id": "b8", "name": "Left-margin gutter marker", "fn": b8_gutter_marker,
     "thesis": "A thin colour rail runs down the body's left edge and thickens at whichever block's row can break — the same idiom as an IDE's breakpoint gutter. Positional, not wired, the cheapest possible mark.",
     "best": "Scales cleanly to several break sites (each just gets its own thickened segment) without any cable crossing anything; reads instantly to anyone who has used a code editor.",
     "loses": "It says WHICH block, not WHY or WHERE it goes — no boolean, no destination, nothing about what actually triggers it; it's closer to a table of contents than a description of behaviour."},
    {"id": "b9", "name": "Poison pill on the shipped back cable", "fn": b9_poison_pill,
     "thesis": "No new port, no new cable. A small red diamond rides the SAME lane the `z⁻¹` chip already occupies — \"and also, maybe don't come back\" riding right beside \"here's next iteration's seed.\"",
     "best": "Reuses the one piece of loop-specific machinery that already exists, in the one place a reader is already looking for iteration information.",
     "loses": "It only makes sense for a break that's entangled with the carried value the back cable represents — a break that depends on nothing carried (e.g. a fixed retry count) has no back cable to ride, so the mark has no home."},
    {"id": "b10", "name": "Not drawn — a header badge only", "fn": b10_badge_only,
     "thesis": "Break isn't wired anywhere in the body. The header carries a small \"⚠ may exit early\" chip and nothing else — an explicit statement that localising an arbitrary interior exit costs the region-containment abstraction more than it's worth.",
     "best": "Never wrong, never cluttered, never breaks containment; scales to any number of break sites, any condition, any depth, because it says nothing specific enough to be wrong.",
     "loses": "It answers \"can this loop stop early\" and refuses to answer \"where\" or \"why\" at all — for a reader trying to understand behaviour rather than just structure, it's barely more than a comment."},
]

CRITERIA = [
    ("c1", "Reads as control, not data", 25, "A break is not a value. The mark must not be mistakable for an ordinary cable or port at a glance."),
    ("c2", "Localises WHERE inside the body it can fire", 20, "Two blocks live in this loop's body. A mark that only says \"the loop\" is less useful than one that points at `check()` specifically."),
    ("c3", "Reuses machinery the canvas already has", 20, "Ports, the dashed event rail, the z⁻¹ chip, colour — versus a genuinely new glyph or cable kind the stock-boundary test would have to grow room for."),
    ("c4", "Reads without a legend", 15, "A cold reader, no caption, no prior exposure to this project's marks."),
    ("c5", "Scales past one break site", 10, "A loop can have more than one early exit. Does the mark multiply cleanly, or does it collapse into a tangle?"),
    ("c6", "Honest about the representability limit", 10, "Zach's own bar: better to admit a break can't be fully drawn than to dress up an approximation as if it were exact."),
]

SCORES = {
    "b1": {"c1": 2, "c2": 3, "c3": 4, "c4": 4, "c5": 2, "c6": 2},
    "b2": {"c1": 2, "c2": 3, "c3": 5, "c4": 3, "c5": 2, "c6": 4},
    "b3": {"c1": 5, "c2": 4, "c3": 2, "c4": 4, "c5": 3, "c6": 4},
    "b4": {"c1": 3, "c2": 5, "c3": 3, "c4": 5, "c5": 3, "c6": 2},
    "b5": {"c1": 4, "c2": 4, "c3": 5, "c4": 3, "c5": 3, "c6": 5},
    "b6": {"c1": 5, "c2": 4, "c3": 4, "c4": 3, "c5": 3, "c6": 3},
    "b7": {"c1": 5, "c2": 2, "c3": 1, "c4": 2, "c5": 1, "c6": 5},
    "b8": {"c1": 3, "c2": 5, "c3": 3, "c4": 4, "c5": 5, "c6": 3},
    "b9": {"c1": 2, "c2": 2, "c3": 5, "c4": 2, "c5": 1, "c6": 3},
    "b10": {"c1": 4, "c2": 1, "c3": 5, "c4": 5, "c5": 5, "c6": 5},
}


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["scores"] = SCORES[v["id"]]
    v["total"] = weighted(v["scores"])

PRIOR = [
    ("LabVIEW While Loop", "no dedicated break primitive; every stop reason is wired, ORed, into the one Conditional Terminal", "the condition terminal itself, now with more than one producer", "B2 draws this literally", "[1]"),
    ("Unreal Blueprints — For Each Loop with Break", "a distinct node from the plain loop, with its own `Break` exec input pin — control flow, wired separately from any data pin", "a dedicated exec pin, deliberately not a data port", "B1 (a dedicated port) takes the shape, though Unreal's is exec-typed, not data-typed", "[2]"),
    ("BPMN boundary events", "a small interrupting-event icon attached to the border of an activity/sub-process; firing it routes to an alternate outgoing flow instead of the normal one", "the icon IS the location; the escape arrow is an ordinary sequence flow", "B3 draws this directly", "[3]"),
    ("Classic flowchart goto/escape arrows", "a line leaves a step and lands anywhere else on the page, crossing whatever boxes are in between", "the arrow itself, unconstrained by containment", "B4 is this, constrained to cross exactly one wall", "[4]"),
    ("Petri nets — inhibitor/reset arcs", "a special arc that can clear or block a place's tokens from outside the net's ordinary firing rules — a one-shot override on top of the flow", "a distinct arc kind, visually different from an ordinary flow arc", "B9's poison pill borrows the idea of \"a marked, special token\" without a new arc kind", "[5]"),
]

SOURCES = [
    (1, "NI LabVIEW Help — While Loop structure (Conditional Terminal)", "https://www.ni.com/docs/en-US/bundle/labview/page/lvconcepts/while_loops.html"),
    (2, "Epic — Flow Control in Unreal Engine (ForEachLoopWithBreak)", "https://dev.epicgames.com/documentation/unreal-engine/flow-control-in-unreal-engine"),
    (3, "Wikipedia — Business Process Model and Notation (boundary events)", "https://en.wikipedia.org/wiki/Business_Process_Model_and_Notation"),
    (4, "Wikipedia — Flowchart (conventions, including inter-step jumps)", "https://en.wikipedia.org/wiki/Flowchart"),
    (5, "Wikipedia — Petri net (extensions: inhibitor arcs)", "https://en.wikipedia.org/wiki/Petri_net"),
]

# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------


def board_for(variant) -> str:
    svg = SVG(1420, 660)
    reg = region_shell(svg)
    ctx = draw_body(svg, reg)
    variant["fn"](svg, reg, ctx)
    return svg.render(variant["id"])


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1440px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(32px,5vw,52px);line-height:1.03;letter-spacing:-.04em;margin:10px 0 14px;max-width:1040px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}h3{font-size:18px;margin:26px 0 8px}
p{max-width:900px}.lede{font-size:18px;color:#39424f;max-width:960px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:20px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg{display:block;width:100%;height:auto}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.variant{margin-top:34px;padding-top:8px;border-top:2px solid var(--ink)}.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1140px}.cols p{margin:6px 0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:700}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:#eef4ff}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:940px;margin:14px 0}.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:940px}li{margin:5px 0}
.pick{display:flex;gap:8px;margin:10px 0 0}.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:940px;min-height:110px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1240px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1240px}.srcs li{break-inside:avoid}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
@media(max-width:900px){.facts,.cols,.decision{grid-template-columns:1fr}.srcs{columns:1}}
"""

JS = """
(function(){
  var key='while-loop-break-2026-09-03';var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
    var lines=Object.keys(state).map(function(id){return state[id]+': '+id});var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: b5\\nBorrow from b8: thicken the gutter at every block that can break, not just one\\nAvoid: \\nWhy: ')}}
  document.querySelectorAll('.pick button').forEach(function(b){b.addEventListener('click',function(){var id=b.parentNode.dataset.id;state[id]=(state[id]===b.dataset.v)?undefined:b.dataset.v;if(!state[id])delete state[id];try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}paint()})});
  paint();
})();
"""


def fig(svg: str, caption: str) -> str:
    return f"<figure>{svg}<figcaption>{caption}</figcaption></figure>"


def variants_html() -> str:
    out = []
    for v in VARIANTS:
        scores = " · ".join(f"{c[0]} {v['scores'][c[0]]}" for c in CRITERIA)
        out.append(
            f"<section class='variant' id='{v['id']}'><header><h3>{v['id'].upper()} · {html.escape(v['name'])}</h3><span class='score'>{v['total']}/100</span><span class='small'>{scores}</span></header>"
            f"<p>{html.escape(v['thesis'])}</p>"
            + fig(board_for(v), f"<b>{html.escape(v['name'])}.</b> Same body, same settled corner ring and back cable — only the break mark, originating from <code>check().ok</code>, changes.")
            + f"<div class='cols'><div><span class='k'>best when</span><p>{html.escape(v['best'])}</p></div><div><span class='k'>loses when</span><p>{html.escape(v['loses'])}</p></div></div>"
            f"<div class='pick' data-id='{v['id']}'><button data-v='Pick'>Pick</button><button data-v='Shortlist'>Shortlist</button><button data-v='Reject'>Reject</button></div></section>"
        )
    return "".join(out)


def scores_html() -> str:
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    winner = max(VARIANTS, key=lambda v: v["total"])["id"]
    for v in sorted(VARIANTS, key=lambda v: -v["total"]):
        cells = "".join(f"<td class='n'>{v['scores'][c[0]]}</td>" for c in CRITERIA)
        rows += f"<tr class='{'win' if v['id'] == winner else ''}'><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>{cells}<td class='n'><b>{v['total']}</b></td></tr>"
    crit = "".join(f"<li><b>{c[0]} · {html.escape(c[1])}</b> ({c[2]}) — {html.escape(c[3])}</li>" for c in CRITERIA)
    return f"<ul>{crit}</ul><table><tr><th>variant</th>{head}<th class='n'>total</th></tr>{rows}</table>"


def prior_html() -> str:
    rows = "".join(f"<tr><td><b>{html.escape(t)}</b></td><td>{html.escape(w)}</td><td>{html.escape(m)}</td><td>{html.escape(i)}</td><td class='small'>{c}</td></tr>" for t, w, m, i, c in PRIOR)
    return f"<table><tr><th>tool / theory</th><th>the mechanism</th><th>where it lives</th><th>which variant draws it</th><th>src</th></tr>{rows}</table>"


def build() -> str:
    winner = max(VARIANTS, key=lambda v: v["total"])
    facts = FACTS
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>While-loop break — ten ways to draw it, or not</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · loops · while-loop break · {TODAY}</div>
<h1>Ten ways to draw a <em>break</em> — or admit you can't.</h1>
<p class="lede">The while-loop header is settled: a hollow ring at the region's top-left corner is the condition inlet, fed by a real cable from outside. That's drawn identically in all ten boards below — it's given, not a variable. What's open is <code>break</code>, and the honest framing is Zach's own: "the issue is break is not data flow... I feel like I may not actually be able to represent it, and that is fine! My goal is to show data flow, not control flow." So several of these ten aren't attempts to represent break as data — they're different ways of being honest about the limit. Everything else (region, back cable, <code>z⁻¹</code> chip, seed|back receiver) is held exactly as shipped; a second body block, <code>check()</code>, exists purely so break has somewhere to originate that isn't the loop's only block. <b>{winner['id'].upper()} — {html.escape(winner['name'])} — scores highest at {winner['total']}/100</b>.</p>
<div class="facts">
<div class="fact"><b>{"yes" if facts['hasLoopShape'] else "no"}</b><span><code>src/loop/LoopShapeUtil.tsx</code> exists — the for-loop region ships today</span></div>
<div class="fact"><b>{"no" if not facts['loopModelMentionsBreak'] else "yes"}</b><span>the word "break" appears in <code>loopModel.ts</code> — confirms this is genuinely open, not already decided</span></div>
<div class="fact"><b>{"yes" if facts['priorHeaderGallery'] else "no"}</b><span>the prior <a href="while-loop-header-2026-09-03.html">while-loop header gallery</a> exists — this page's corner ring supersedes that gallery's W5/W2, per Zach's own sketches</span></div>
</div>

<h2>1 · What five answers to "interrupt a loop from partway through" already look like</h2>
<p>Zach named the real tension: a `while`'s condition is one value, tested once per pass, and it fits the dataflow grammar cleanly (it already shipped, as the corner ring). A `break` is different in kind — it can fire from <em>anywhere</em> inside the body, and firing it is a control transfer, not a value production. Every tool below that has to solve this drew a genuinely different kind of mark for it than the one it uses for ordinary data — none of them tried to make break look like a wire.</p>
{prior_html()}

<h2>2 · Criteria, then ten marks</h2>
<p>Weighted before any variant existed. <b>c6, honesty about the limit,</b> is deliberately in here at Zach's own request — a variant that pretends break is exactly as representable as data should score worse than one that says plainly it isn't.</p>
{scores_html()}
<div class="callout"><b>Hinge.</b> {winner['id'].upper()} wins by drawing the least — a small stop icon sitting right beside <code>check()</code>, the block that can actually end the loop, with no cable anywhere. It costs nothing to build, invents no new machinery, and never risks being mistaken for a data cable, but like every "no wire" answer here it can't say where control goes once it fires. B10's header-only badge (79) gives up even the block-level location for maximum honesty about the limit; B6's event-rail reuse (78) is the pick if you want an actual wire without inventing a new colour. If localising the exact break destination matters more than staying minimal, B4's plain escape arrow or B3's BPMN boundary event are the ones to look at instead — both score well on locating it, both cost more new machinery.</div>

{variants_html()}

<h2>3 · The two smaller open questions, answered briefly</h2>
<div class="decision">
<div><h4>The exit cable's label</h4><p class="small">You asked whether the cable leaving the loop (<code>check().pose → pose</code> boundary here) should read <code>iter = X</code> or just be plain dotted. Recommendation: <b>plain dotted, no label, no <code>z⁻¹</code> chip</b> — drawn that way in every board on this page. <code>z⁻¹</code> specifically means "one iteration late," which is true of the <em>back</em> cable but not of the exit value (it's just "whatever the body last produced," available exactly once, after the loop ends). Reusing <code>z⁻¹</code> for both would make the mark lie about the exit cable. A label becomes worth adding once the boundary port itself can host free text the way a Block's `= value` field already can — not before.</p></div>
<div><h4>The mutated-condition cable</h4><p class="small">Your third sketch shows a data cable running from something inside the body back up to a second port on the header when the condition depends on carried state. That's consistent with the settled grammar (it's the same seed|back receiver idea, just landing on the condition ring instead of a body block) and isn't drawn as a separate variable on this page — it composes with whichever break mark you pick, unchanged.</p></div>
</div>

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Ten break marks, each on the same fixture, with the settled corner-ring header and shipped back cable held constant so only the break mark differs.</li><li>Five sources of prior art read specifically for "interrupt a loop from partway through," not just "loops" in general.</li><li>Scored against six criteria fixed before any variant was drawn, including an explicit honesty-about-the-limit criterion.</li></ul></div>
<div><h4>Left</h4><ul><li><b>Next:</b> once a mark is picked, extend <code>src/loop/loopModel.ts</code> with the settled condition ring (from the prior header gallery) plus whichever break mark wins here.</li><li><b>Next:</b> decide how `continue` (the other control-flow exit a while loop can have) should read — out of scope here, but likely answered by the same mark family as break.</li></ul></div>
<div><h4>Needs you (default in brackets)</h4><ul><li>Pick a break mark [{winner['id'].upper()}, the inline stop icon — cheapest, sits right at the block that can break, no new cable machinery].</li><li>If you'd rather localise where control actually goes, B4 (plain escape arrow) or B3 (BPMN boundary event) are the two to look at instead — both cost more.</li><li>Exit cable stays plain dotted, no label, no <code>z⁻¹</code> [yes, per §3].</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No analyzer or renderer code changed; no <code>src/loop/</code> file touched. Static SVG mockups in the idiom, same as every prior loop babble.</li><li>No `continue`, nested-while, or while-inside-branch board — out of scope for a break-only question.</li></ul></div>
</div>
<h3>Reply cheaply</h3><p class="small">Pick buttons persist in this browser; the brief mirrors them. Or in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<h2>Source index</h2>
<ol class="srcs">{''.join(f"<li id='s{i}'>{html.escape(t)} — <a href='{html.escape(u)}'>{html.escape(u)}</a></li>" for i, t, u in SOURCES)}</ol>
<footer>Built by <code>docs/build_while_loop_break.py</code> at {GIT_HEAD} · boards are SVG in the SystemSketch idiom, not live tldraw shapes · relevant prior work: <a href="while-loop-header-2026-09-03.html">while-loop header, ten ways</a> · <a href="loop-regions-2026-09-02.html">loop regions L1–L5</a> · <a href="loop-edge-marks-2026-09-02.html">back-cable marks M1–M5</a> · Claude Code (Sonnet 5), {TODAY}.</footer>
</main><script>{JS}</script></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "scores": {v["id"]: v["total"] for v in VARIANTS}}))


if __name__ == "__main__":
    main()
