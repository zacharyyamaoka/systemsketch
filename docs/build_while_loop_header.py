#!/usr/bin/env python3
"""Build `docs/while-loop-header-2026-09-03.html`: ten ways to draw a `while`'s condition.

The gap this closes: `for` shipped (`src/loop/`) with its header settled as an
OPERATOR — a real `Iterable` inlet, a real `Iter` outlet, both on the header wall,
both native ports. `while` never got that pass. The one prior fixture that draws a
`while` at all (`docs/loop-edge-marks-2026-09-02.html`'s `board_while`) predates the
operator-header decision by a day: it just writes the whole condition as the
region's title and drops a single unlabeled control dot for whichever operand it
mentions. Nobody has asked, for `while` specifically, the same question `for`'s
header-item-connection babble asked and answered: what does the ONE thing a while
loop does every single pass — test something, then maybe not loop again — actually
look like on the header?

Everything else about the loop stays exactly what shipped or what the loop-carried-
state and edge-marks babbles already settled: the region, the back cable, the M2
`z⁻¹` chip with the seed named beside it, the seed|back receiver as one plain port
with ordinary fan-in, "go to the end first, then loop back." Only the header — the
one open connection for `while` the way the item outlet was the one open connection
for `for` — varies across the ten.

Run:  python3 docs/build_while_loop_header.py
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "while-loop-header-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, frame, note, polycable, text,
)

TODAY = "2026-09-03"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
BOOL = "#7c3aed"   # reuse the Aug 25 dashed-event-rail purple for anything boolean/control
STATE = "#0f766e"

# --------------------------------------------------------------------------
# What's measured from the live repo, so this page can't drift from it
# --------------------------------------------------------------------------


def repo_facts() -> dict:
    model = (REPO / "src" / "loop" / "loopModel.ts").read_text(encoding="utf-8")
    has_loop_shape = (REPO / "src" / "loop" / "LoopShapeUtil.tsx").exists()
    has_while = "while" in model.lower()
    default_title = None
    for line in model.splitlines():
        if "title:" in line and "'" in line:
            default_title = line.split("'")[1]
            break
    return {
        "hasLoopShape": has_loop_shape,
        "loopModelMentionsWhile": has_while,
        "defaultLoopTitle": default_title or "unknown",
        "iterablePort": "iterable" in model and "LoopPort" in model,
    }


FACTS = repo_facts()

# --------------------------------------------------------------------------
# The body every variant shares: frame, boundary ports, estimate(), refine(),
# the back cable with its shipped M2 z⁻¹ chip, the zero-iterations cable.
# Copied from build_loop_edge_marks.py's board_while, which already rendered
# clean — only the header band (the region's title/band row) is now a hole
# each variant fills in differently.
# --------------------------------------------------------------------------

REG = dict(x=440, y=130, w=520)
BAND_H = 30


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


def backcable_chip(svg: SVG, points, seed: str, port, *, label="z⁻¹", extra=None) -> None:
    """M2, shipped: the back cable, drawn once, with its z⁻¹ pill."""
    svg.add(polycable(points))
    arrowhead(svg, port[0], port[1])
    mx, my = lane_label_pos(points)
    w = 34
    svg.add(f'<rect x="{mx - w / 2}" y="{my - 10}" width="{w}" height="20" rx="10" fill="#fff" stroke="{INK}" stroke-width="1.3"/>')
    svg.add(text(mx, my + 4.5, label, size=12, weight=700, anchor="middle", mono=True))
    svg.add(text(mx + w / 2 + 8, my - 7, f"seed = {seed}", size=10.5, color=MUTED, italic=True))
    if extra:
        extra(svg, mx, my, w)


def region_shell(svg: SVG, band_h=BAND_H, extra_h=0, band_line=True) -> dict:
    x, y, w = REG["x"], REG["y"], REG["w"]
    h = 330 + extra_h
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    if band_line:
        svg.add(f'<line x1="{x}" y1="{y + band_h}" x2="{x + w}" y2="{y + band_h}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(text(x + w - 12, y + 20, "Loop", size=12, mono=True, anchor="end", color=MUTED))
    return {"x": x, "y": y, "w": w, "h": h, "right": x + w, "band_bottom": y + band_h, "bottom": y + h}


def draw_body(svg: SVG, reg: dict, *, backcable_extra=None):
    """Everything held constant across all ten. Returns the points a header
    variant needs: the tol boundary, refine's pose inlet, refine's own Pose
    outlet (the thing that carries `error` back out for a condition to read)."""
    frame(svg, 20, 20, 1340, 560, "track()")
    fr = boundary_in(svg, 20, 175, "frame", "Frame")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    tol = boundary_in(svg, 20, 440, "tol", "float", NUMBER)
    estimate = block(svg, 150, 200, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    svg.add(cable(fr, estimate["in"]["frame"], mid=110))
    svg.add(cable(gain, estimate["in"]["gain"], mid=110))
    refine = block(svg, 520, 220, 220, "refine()", [{"name": "pose", "type": "Pose"}, {"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    port = refine["in"]["pose"]
    svg.add(cable(estimate["out"]["Pose"], port, mid=430))
    svg.add(polycable([fr, (110, fr[1]), (110, 330), (480, 330), (480, refine["in"]["frame"][1]), refine["in"]["frame"]]))
    px, py = refine["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    backcable_chip(svg, [(px, py), (860, py), (860, lane_y), (490, lane_y), (490, port[1]), port], "estimate()", port, extra=backcable_extra)
    pose_out = boundary_out(svg, 1360, 341, "pose", "Pose")
    svg.add(cable((px, py), pose_out, mid=1200))
    ex, ey = estimate["out"]["Pose"]
    svg.add(polycable([(ex, ey), (400, ey), (400, 520), (1300, 520), (1300, pose_out[1]), pose_out]))
    svg.add(text(850, 514, "zero iterations: the seed is returned", size=10.5, color=MUTED, italic=True, anchor="middle"))
    return {"tol": tol, "refine_in_pose": port, "refine_out_pose": (px, py), "refine_top": 220}


# --------------------------------------------------------------------------
# The ten headers.  Each owns the region's band (y 130–160/190) and, where its
# thesis needs it, one small addition elsewhere (the back-cable lane, an
# outside corner) — never the shared body drawn above.
# --------------------------------------------------------------------------


def w1_text_condition(svg, reg, ctx):
    """W1 · Text condition, one control dot — today's fixture, unrevised."""
    svg.add(text(reg["x"] + reg["w"] / 2, reg["y"] + 20, "while pose.error > tol:", size=13, weight=700, color=INK, anchor="middle"))
    hx, hy = reg["x"], reg["y"] + 15
    svg.add(dot(hx, hy, ANY, True, r=5))
    svg.add(text(hx + 12, hy + 4, "tol", size=10.5, color=MUTED))
    svg.add(cable(ctx["tol"], (hx, hy), kind="control", mid=405))


def w2_bool_inlet(svg, reg, ctx):
    """W2 · Operator header, one real Bool inlet — for's Iterable, typed differently."""
    svg.add(text(reg["x"] + reg["w"] / 2, reg["y"] + 20, "While", size=14, weight=700, color=INK, anchor="middle"))
    hx, hy = reg["x"], reg["y"] + 15
    svg.add(dot(hx, hy, BOOL, True, r=6))
    svg.add(text(hx + 12, hy + 4, "test", size=11, color=INK))
    svg.add(text(hx + 12 + 32, hy + 4, "Bool", size=10.5, color=MUTED))
    ry, rx = ctx["refine_top"] - 6, reg["x"] + 60
    svg.add(polycable([(rx, ry), (rx, hy - 22), (hx, hy - 22), (hx, hy)], color=BOOL, width=1.8))
    arrowhead(svg, hx, hy, BOOL)
    svg.add(text(rx + 8, ry - 8, "pose.error > tol", size=10, color=BOOL, italic=True))


def w3_bool_and_carry(svg, reg, ctx):
    """W3 · Bool inlet + Pose outlet — the full for-loop mirror (test-in, carry-out)."""
    svg.add(text(reg["x"] + reg["w"] / 2, reg["y"] + 20, "While", size=14, weight=700, color=INK, anchor="middle"))
    hx, hy = reg["x"], reg["y"] + 15
    svg.add(dot(hx, hy, BOOL, True, r=6))
    svg.add(text(hx + 12, hy + 4, "test", size=11, color=INK))
    svg.add(text(hx + 12 + 32, hy + 4, "Bool", size=10.5, color=MUTED))
    ry, rx = ctx["refine_top"] - 6, reg["x"] + 60
    svg.add(polycable([(rx, ry), (rx, hy - 22), (hx, hy - 22), (hx, hy)], color=BOOL, width=1.8))
    arrowhead(svg, hx, hy, BOOL)
    ox = reg["x"] + 40
    oy = reg["band_bottom"]
    svg.add(dot(ox, oy, ANY, True, r=6))
    svg.add(text(ox + 10, oy + 14, "pose · Pose", size=10.5, color=MUTED, italic=True))
    svg.add(text(reg["x"] + reg["w"] - 12, reg["y"] + 20, "carried on the wall, not the block", size=9.5, color=MUTED, italic=True, anchor="end"))


def w4_before_after(svg, reg, ctx):
    """W4 · Two-band header — MLIR scf.while's before/after, drawn literally."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    svg.add(text(x + 10, y + 9, "before · test", size=8.5, color=MUTED, weight=700))
    hx, hy = x, y + 27
    svg.add(dot(hx, hy, BOOL, True, r=5.5))
    svg.add(text(hx + 12, hy + 4, "pose.error > tol", size=10.5, color=INK, mono=True))
    svg.add(cable(ctx["tol"], (hx, hy), kind="control", mid=405))
    divider_y = y + 40
    svg.add(f'<line x1="{x}" y1="{divider_y}" x2="{x + w}" y2="{divider_y}" stroke="{REGION}" stroke-width="1" stroke-dasharray="2 3"/>')
    svg.add(text(x + 10, y + 52, "after · commit", size=8.5, color=MUTED, weight=700))
    svg.add(text(x + w / 2, y + 62, "While", size=13, weight=700, color=INK, anchor="middle"))


def w5_corner_ring(svg, reg, ctx):
    """W5 · Corner trigger ring — Zach's own 2026-09-02 sketch, drawn as-is."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    svg.add(f'<circle cx="{x}" cy="{y}" r="5" fill="none" stroke="{ANY}" stroke-width="2"/>')
    svg.add(polycable([(x - 60, y - 20), (x - 60, y), (x, y)]))
    svg.add(text(x - 60, y - 28, "things that impact the iteration", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + w / 2, y + 20, "While", size=14, weight=700, color=INK, anchor="middle"))
    svg.add(cable(ctx["tol"], (x, y), kind="control", mid=405))


def w6_chained_pill(svg, mx, my, w):
    """The second pill W6 chains onto the shipped z⁻¹ chip's own lane."""
    cx = mx + 150
    w2 = 92
    svg.add(f'<rect x="{cx - w2 / 2}" y="{my - 10}" width="{w2}" height="20" rx="10" fill="#fff" stroke="{BOOL}" stroke-width="1.3"/>')
    svg.add(text(cx, my + 4.5, "error > tol", size=10, color=BOOL, weight=600, anchor="middle", mono=True))


def w6_header(svg, reg):
    """W6 · No header mark at all — the test rides the back cable, chained to z⁻¹."""
    svg.add(text(reg["x"] + reg["w"] / 2, reg["y"] + 20, "While", size=14, weight=700, color=INK, anchor="middle"))


def w7_wall_comparator(svg, reg, ctx):
    """W7 · Split-face wall comparator — the `>` drawn where two operands meet."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    svg.add(text(x + w / 2, y + 20, "While", size=14, weight=700, color=INK, anchor="middle"))
    cx, cy = x, y + 15
    svg.add(f'<path d="M{cx - 9},{cy - 8} L{cx + 5},{cy} L{cx - 9},{cy + 8}" fill="none" stroke="{BOOL}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')
    svg.add(polycable([(cx - 9, cy - 8), (cx - 40, cy - 8)], color=CABLE, width=1.4))
    svg.add(text(cx - 44, cy - 5, "tol", size=10, color=MUTED, anchor="end"))
    ry, rx = ctx["refine_top"] - 6, reg["x"] + 60
    svg.add(polycable([(rx, ry), (rx, cy + 8), (cx - 9, cy + 8)], color=STATE, width=1.4))
    svg.add(text(rx + 6, ry - 8, "error", size=9.5, color=STATE, italic=True))
    svg.add(cable(ctx["tol"], (cx - 40, cy - 8), kind="control", mid=405))


def w8_inline_code(svg, reg, ctx):
    """W8 · Inline code condition with reference chips — no geometric port."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    px = x + 14
    svg.add(text(px, y + 20, "while", size=13, mono=True, color=MUTED))
    px2 = px + 44

    def chip_ref(cx, cy, s, color):
        cw = 6.4 * len(s) + 14
        svg.add(f'<rect x="{cx}" y="{cy - 12}" width="{cw}" height="18" rx="9" fill="#fff" stroke="{color}" stroke-width="1.1"/>')
        svg.add(text(cx + cw / 2, cy + 1.5, s, size=10, weight=600, color=color, anchor="middle", mono=True))
        return cw
    cw1 = chip_ref(px2, y + 15, "pose.error", STATE)
    svg.add(text(px2 + cw1 + 6, y + 20, ">", size=13, mono=True, color=INK))
    cw2 = chip_ref(px2 + cw1 + 18, y + 15, "tol", ANY)
    svg.add(text(px2 + cw1 + 18 + cw2 + 4, y + 20, ":", size=13, mono=True, color=MUTED))
    svg.add(cable(ctx["tol"], (x, y + 15), kind="control", mid=405, opacity=0.0))
    svg.add(text(x + w - 12, y + 20, "no wall port — names resolve by reference", size=9, color=MUTED, italic=True, anchor="end"))


def w9_dashed_stop_badge(svg, reg, ctx):
    """W9 · Dashed control-edge to an outside stop-badge — Unreal's Condition pin, as control flow."""
    x, y, w, bottom = reg["x"], reg["y"], reg["w"], reg["bottom"]
    svg.add(text(x + w / 2, y + 20, "While", size=14, weight=700, color=INK, anchor="middle"))
    bx, by = x + w + 26, bottom - 8
    svg.add(f'<path d="M{bx},{by - 11} L{bx + 10},{by - 11} L{bx + 16},{by} L{bx + 10},{by + 11} L{bx},{by + 11} L{bx - 6},{by} z" fill="#fff" stroke="{BOOL}" stroke-width="1.6"/>')
    svg.add(text(bx + 5, by + 3.5, "?", size=10, weight=700, color=BOOL, anchor="middle"))
    ry, rx = ctx["refine_top"] - 6, reg["x"] + 60
    svg.add(f'<path d="M{rx},{ry} L{rx},{by} L{bx - 6},{by}" fill="none" stroke="{BOOL}" stroke-width="1.8" stroke-dasharray="6 4" stroke-linecap="round"/>')
    svg.add(text(bx + 22, by + 3.5, "loop while true", size=9.5, color=MUTED, italic=True))
    svg.add(cable(ctx["tol"], (x, y + 15), kind="control", mid=405))
    svg.add(dot(x, y + 15, ANY, True, r=5))
    svg.add(text(x + 12, y + 19, "tol", size=10.5, color=MUTED))


def w10_unified_port(svg, reg, ctx):
    """W10 · One shape, one generalized port — `for` and `while` share the exact same header."""
    x, y, w = reg["x"], reg["y"], reg["w"]
    svg.add(text(x + w / 2, y + 20, "Loop", size=14, weight=700, color=INK, anchor="middle"))
    hx, hy = x, y + 15
    svg.add(dot(hx, hy, ANY, True, r=6))
    svg.add(text(hx + 12, hy + 4, "test", size=11, color=INK))
    svg.add(text(hx + 12 + 32, hy + 4, "Iterable | Bool", size=10, color=MUTED))
    ry, rx = ctx["refine_top"] - 6, reg["x"] + 60
    svg.add(polycable([(rx, ry), (rx, hy - 22), (hx, hy - 22), (hx, hy)], color=CABLE, width=1.6))
    arrowhead(svg, hx, hy, CABLE)
    svg.add(text(x + w - 12, y + 20, "same dot the for-loop uses; only the type differs", size=9, color=MUTED, italic=True, anchor="end"))


VARIANTS = [
    {"id": "w1", "name": "Text condition, one control dot", "fn": w1_text_condition, "extra_h": 0,
     "thesis": "Unrevised: the title IS the condition (`while pose.error > tol:`) and one thin control cable lands for whichever operand it mentions. No new machinery — this is what shipped in the edge-marks fixture before the for-loop's operator header was even decided.",
     "best": "Cheapest to keep; a reader who can read Python reads the header like a code comment.",
     "loses": "Predates the for-loop's own header decision, so the two regions no longer read as siblings; only ONE operand gets a port (`tol`), so `pose.error` is invisible wiring, and a while that carries no separate `tol`-like input has nothing to hang the label on at all."},
    {"id": "w2", "name": "Operator header, real Bool inlet", "fn": w2_bool_inlet, "extra_h": 0,
     "thesis": "The header stops narrating and gets a real, typed `Bool` port on the wall — exactly where `for`'s `Iterable` sits. Whatever produces the boolean (a comparison, wherever it lives) wires into it like any other cable.",
     "best": "For and while are now literally the same move, just typed differently; the port is wirable and hackable, matching \"100% I want a port myself.\"",
     "loses": "A boolean cable crossing the wall from inside the body back to the header reads oddly on first look — it's visually a mini back-cable of its own, and needs its own explanation."},
    {"id": "w3", "name": "Bool inlet + carried-item outlet", "fn": w3_bool_and_carry, "extra_h": 0,
     "thesis": "W2 plus a second header port: the carried value (`pose`) also lands on the wall as an outlet, fully mirroring for's inlet/outlet pair instead of leaving the carry on refine()'s own plain port.",
     "best": "Total symmetry with `for` — one header shape, two dots, works for both constructs identically.",
     "loses": "Moves the carried-state cable off the already-shipped seed|back receiver and onto a new wall port, which no other loop in the app does yet — two header ports is more surface than a while, which often carries nothing new, actually needs."},
    {"id": "w4", "name": "Before/after two-band header", "fn": w4_before_after, "extra_h": 0, "band_h": 70,
     "thesis": "MLIR's `scf.while` splits into a before-region (test) and after-region (body) that \"communicate by means of region arguments.\" Drawn literally: the header itself becomes two stacked bands, test then commit.",
     "best": "The one grammar that visually distinguishes *checking* from *proceeding*, which is genuinely what a while loop does that a for loop doesn't.",
     "loses": "A taller, two-part header is a new container shape next to every other region's one-line band; it grows the frame for information the title text already carried in W1, at the cost of Zach's \"not a lot of gutters\" preference."},
    {"id": "w5", "name": "Corner trigger ring", "fn": w5_corner_ring, "extra_h": 0,
     "thesis": "Drawn straight from Zach's own four sketches: a small ring at the region's top-left corner, outside the header row, labelled by whatever cables into it as \"things that impact the iteration.\"",
     "best": "It's literally his own hand, so zero relearning for him specifically; visually calm — one ring, no new row.",
     "loses": "A corner ring is a new port location nothing else in the app uses (every other port lives on a wall or a row); a second reader has no prior art to lean on the way a wall dot does."},
    {"id": "w6", "name": "Test rides the back cable, not the header", "fn": None, "extra_h": 0,
     "thesis": "The header carries nothing new at all. The boolean test shows up as a second pill chained to the shipped `z⁻¹` chip on the SAME back-cable lane — \"next iteration\" and \"keep going\" become one visual family instead of two mechanisms in two places.",
     "best": "Zero new header machinery; reuses the one mark the loop-edge-marks babble already spent five variants choosing, so \"keep going\" and \"do it again\" sit on the one wire that already carries per-iteration information.",
     "loses": "A while whose condition doesn't depend on the carried value (rare, but real) has nothing to chain the second pill onto; and two pills on one lane is more reading than a single mark, right where the eye is already busy with the seed name."},
    {"id": "w7", "name": "Split-face wall comparator", "fn": w7_wall_comparator, "extra_h": 0,
     "thesis": "The `>` itself is drawn on the wall, at the point where the outside operand (`tol`) and the inside operand (`error`, tapped from the body) visually converge — the comparison made graphical, the way W1's title only states it in words.",
     "best": "The single most explicit variant about what the test actually compares; two thin cables converging on one glyph reads as \"this meets that\" without a caption.",
     "loses": "A new glyph (the chevron) is new geometry nothing else on the canvas draws; it only works for a two-operand comparison — `while queue:` or `while not done:` have nothing to converge."},
    {"id": "w8", "name": "Inline code condition, reference chips", "fn": w8_inline_code, "extra_h": 0,
     "thesis": "The Branch-authoring babble's V4 (\"the arm label is the code\"), applied to a while's header: the condition is live, syntax-highlighted text with each name as a small reference chip. No geometric port — wiring is implicit from the names.",
     "best": "The most literal reading of the source; nothing to keep in sync because the header IS the code.",
     "loses": "This is the exact move Zach rejected for Branch arm titles — \"the only issue is I want to keep that whiteboard feel… I am fine having it more hackable\" — and for the same reason a derived port \"would change if you change the titles,\" a derived condition has the identical problem one level up."},
    {"id": "w9", "name": "Dashed control-edge to an outside stop-badge", "fn": w9_dashed_stop_badge, "extra_h": 0,
     "thesis": "Unreal's WhileLoop treats its Condition as control flow, not data — a separate exec pin. Drawn here as a small hexagonal badge OUTSIDE the region, fed by a dashed cable in the same purple already reserved for the async/event rail.",
     "best": "Cleanly separates \"this is control, not a value\" using a mark the canvas already owns; the header itself stays completely bare.",
     "loses": "Borrows the dashed-purple rail for a second meaning (event vs. loop-control) in the same visual language the edge-marks report was careful to keep collision-free; a badge outside the region is one more place to look, off the region's own frame."},
    {"id": "w10", "name": "One shape, one generalized port", "fn": w10_unified_port, "extra_h": 0,
     "thesis": "Takes \"I feel this is essentially just the same while loop\" at face value: `for` and `while` are one shape, one tool, one header port — labelled `Iterable | Bool` — and whichever kind of cable lands on it decides which reading applies. No new grammar at all.",
     "best": "The smallest possible answer — nothing to build beyond a type union on a port that already exists and already renders; for and while are provably siblings because they're the same shape.",
     "loses": "A single dot silently doing two jobs is exactly the kind of overload the many-to-one report was written to avoid elsewhere; and it erases the one real semantic difference (consumed-once vs. rechecked-every-pass) that a reader might actually want signalled."},
]

CRITERIA = [
    ("c1", "Reads as a re-check, not a one-time inlet", 25, "A `for`'s iterable is consumed once; a `while`'s test re-fires every pass. A cold reader should be able to tell those apart without a caption."),
    ("c2", "Coexists with loop-carried state", 20, "Most real while loops also carry a value (here, `pose`). The condition mark must not collide with or duplicate the shipped seed|back receiver."),
    ("c3", "Reuses machinery the canvas already has", 20, "Ports, control cables, the dashed event rail, the z⁻¹ chip — no new shape or glyph the stock-boundary test would have to grow room for."),
    ("c4", "Reads as a sibling of the shipped For loop", 15, "The for-loop's header is now a settled operator pattern. A while that looks unrelated forks the grammar; readers pay for two mental models instead of one."),
    ("c5", "Stays whiteboard-hackable", 10, "Zach's own rule for Branch: authoring stays free-text and forgiving, not derived or rigid, even when a derivation is technically possible."),
    ("c6", "Smallest new surface to build", 10, "New port type, new glyph, new container band, new badge — each is real implementation and test surface beyond what for-loop already paid for."),
]

SCORES = {
    "w1": {"c1": 2, "c2": 3, "c3": 5, "c4": 2, "c5": 5, "c6": 5},
    "w2": {"c1": 4, "c2": 4, "c3": 4, "c4": 5, "c5": 4, "c6": 3},
    "w3": {"c1": 4, "c2": 2, "c3": 3, "c4": 5, "c5": 3, "c6": 2},
    "w4": {"c1": 5, "c2": 3, "c3": 2, "c4": 2, "c5": 3, "c6": 2},
    "w5": {"c1": 3, "c2": 3, "c3": 2, "c4": 2, "c5": 4, "c6": 3},
    "w6": {"c1": 3, "c2": 5, "c3": 5, "c4": 3, "c5": 4, "c6": 4},
    "w7": {"c1": 5, "c2": 3, "c3": 2, "c4": 2, "c5": 3, "c6": 2},
    "w8": {"c1": 3, "c2": 3, "c3": 3, "c4": 3, "c5": 1, "c6": 3},
    "w9": {"c1": 4, "c2": 3, "c3": 4, "c4": 2, "c5": 4, "c6": 3},
    "w10": {"c1": 2, "c2": 4, "c3": 5, "c4": 5, "c5": 5, "c6": 5},
}


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["scores"] = SCORES[v["id"]]
    v["total"] = weighted(v["scores"])

PRIOR = [
    ("MLIR scf.for / scf.while", "region; loop-carried values are region arguments; scf.while has separate before/after regions that \"communicate by means of region arguments\"", "the before region's terminator (scf.condition) yields the boolean AND the values carried into after", "W4 draws the before/after split literally; W2/W3/W10 draw the region-argument idea as a real port", "[1]"),
    ("LabVIEW While Loop", "region; a red hexagonal Conditional Terminal wired with a boolean decides stop/continue, separate from the shift-register pair that carries state", "the wired boolean, evaluated after every iteration", "W9's stop-badge is this terminal, redrawn as an outside control pin rather than a header dot", "[2][3]"),
    ("Simulink While Iterator Subsystem", "a region \"repeatedly executes the contents of the subsystem during the current time step while the value of the input condition is true\"", "a wired boolean input port on the subsystem, re-read every pass within the step", "W2/W3's Bool inlet on the wall is this input port, drawn as an operator", "[4]"),
    ("Unreal Blueprints WhileLoop", "an exec macro: Loop Body / Completed pins fire on a Condition boolean input; \"no data join\" — anything that must survive an iteration is a variable", "the Condition exec pin, control not data", "W9 borrows this split (control-flow pin, not a value port) directly", "[5]"),
    ("Dennis / Arvind loop schema", "the conditional schema: a merge feeding a predicate test, which routes either into the body or out", "the predicate test node, drawn inline in the dataflow graph itself", "W7's wall comparator is this test node relocated onto the region's own wall", "[6]"),
]

SOURCES = [
    (1, "MLIR — 'scf' Dialect: scf.for with iter_args, scf.while with before/after regions", "https://mlir.llvm.org/docs/Dialects/SCFDialect/"),
    (2, "NI LabVIEW Help — While Loop structure (Conditional Terminal)", "https://www.ni.com/docs/en-US/bundle/labview/page/lvconcepts/while_loops.html"),
    (3, "NI LabVIEW Help — Feedback Node (rajsite mirror of NI's help)", "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/Block_Diagram_Feedback.html"),
    (4, "MathWorks — While Iterator block", "https://www.mathworks.com/help/simulink/slref/whileiterator.html"),
    (5, "Epic — Flow Control in Unreal Engine (ForLoop, WhileLoop)", "https://dev.epicgames.com/documentation/unreal-engine/flow-control-in-unreal-engine"),
    (6, "Arvind & Culler — Dataflow Architectures (the conditional/loop schema with predicate-routed merges)", "https://dl.acm.org/doi/10.1146/annurev.cs.01.060186.001521"),
]

# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------


def board_for(variant) -> str:
    svg = SVG(1380, 620)
    reg = region_shell(svg, band_h=variant.get("band_h", BAND_H), extra_h=variant.get("extra_h", 0))
    if variant["id"] == "w6":
        draw_body(svg, reg, backcable_extra=w6_chained_pill)
        w6_header(svg, reg)
    else:
        ctx = draw_body(svg, reg)
        variant["fn"](svg, reg, ctx)
    return svg.render(variant["id"])


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1400px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(32px,5vw,52px);line-height:1.03;letter-spacing:-.04em;margin:10px 0 14px;max-width:1000px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}h3{font-size:18px;margin:26px 0 8px}
p{max-width:880px}.lede{font-size:18px;color:#39424f;max-width:920px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:20px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg{display:block;width:100%;height:auto}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.variant{margin-top:34px;padding-top:8px;border-top:2px solid var(--ink)}.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1100px}.cols p{margin:6px 0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:700}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:#eef4ff}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:900px;margin:14px 0}.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:900px}li{margin:5px 0}
.pick{display:flex;gap:8px;margin:10px 0 0}.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:900px;min-height:110px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1200px}.srcs li{break-inside:avoid}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
@media(max-width:900px){.facts,.cols,.decision{grid-template-columns:1fr}.srcs{columns:1}}
"""

JS = """
(function(){
  var key='while-loop-header-2026-09-03';var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
    var lines=Object.keys(state).map(function(id){return state[id]+': '+id});var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: w2\\nBorrow from w6: chain the boolean onto the z\\u207b\\u00b9 lane when the two are related\\nAvoid: \\nWhy: ')}}
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
            + fig(board_for(v), f"<b>{html.escape(v['name'])}.</b> The tracker fixture — same body, same shipped back cable and z⁻¹ chip, only the header changes.")
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
    return f"<table><tr><th>tool / theory</th><th>region shape</th><th>the test itself</th><th>which variant draws it</th><th>src</th></tr>{rows}</table>"


def build() -> str:
    winner = max(VARIANTS, key=lambda v: v["total"])
    facts = FACTS
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>While-loop header — ten ways to draw the condition</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · loops · while-loop header · {TODAY}</div>
<h1>Ten ways to draw a <em>while</em>'s condition.</h1>
<p class="lede">The <code>for</code> loop shipped with its header settled as an operator: a real <code>Iterable</code> inlet, a real <code>Iter</code> outlet, both on the wall. Nobody has asked the same question for <code>while</code> — what does "test something, every single pass" actually look like on the header — because the one fixture that draws a while loop at all predates that decision by a day and just writes the whole condition as the region's title. Everything else about the loop (the region, the back cable, the <code>z⁻¹</code> chip, the seed|back receiver, "go to the end first, then loop back") is held exactly as shipped in all ten; only the header changes. <b>{winner['id'].upper()} — {html.escape(winner['name'])} — scores highest at {winner['total']}/100</b>, for reusing the machinery already on the canvas rather than adding a new one.</p>
<div class="facts">
<div class="fact"><b>{"yes" if facts['hasLoopShape'] else "no"}</b><span><code>src/loop/LoopShapeUtil.tsx</code> exists — the for-loop region is real, merged, shipping</span></div>
<div class="fact"><b>"{facts['defaultLoopTitle']}"</b><span>the shape's own default title today — there is no while-loop title or tool yet</span></div>
<div class="fact"><b>{"yes" if facts['iterablePort'] else "no"}</b><span><code>loopModel.ts</code> defines a real, typed <code>iterable</code> header port — the operator pattern this page mirrors</span></div>
<div class="fact"><b>{"no" if not facts['loopModelMentionsWhile'] else "yes"}</b><span>the word "while" appears in <code>loopModel.ts</code> today — confirms the gap this page is closing</span></div>
</div>

<h2>1 · What five prior tools do at the one moment a while loop is different from a for loop</h2>
<p>A <code>for</code>'s iterable is a value the header consumes once, at entry. A <code>while</code>'s condition is re-read every single pass, and — critically for this project's own carried-state grammar — the value it tests is usually <em>produced inside the loop it's gating</em> (here, <code>pose.error</code> comes out of <code>refine()</code>, the very block the condition controls). Every mature tool below drew that fact somewhere; none of them draw it as plain title text the way this repo's one existing <code>while</code> fixture does.</p>
{prior_html()}

<h2>2 · Criteria, then ten headers</h2>
<p>Weighted before any variant existed, from what the for-loop's own header babble already settled and what the loop-carried-state and edge-marks babbles already proved out.</p>
{scores_html()}
<div class="callout"><b>Hinge.</b> {winner['id'].upper()} and W6 both score well by refusing to invent anything: {winner['id'].upper()} generalises the port `for` already has, W6 reuses the cable mark `z⁻¹` already won. They are not mutually exclusive — a while whose condition depends on the carried value could show both. W1, today's fixture, is the safe do-nothing default and scores lowest specifically because it no longer matches its own sibling construct.</div>

{variants_html()}

<h2>3 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Ten header treatments, each on the same fixture, same shared back cable and z⁻¹ chip so only the header differs.</li><li>Five sources of prior art read for the one moment `for` and `while` genuinely diverge: re-checking, not consuming-once.</li><li>Scored against six criteria fixed before any variant was drawn.</li></ul></div>
<div><h4>Left</h4><ul><li><b>Next:</b> once a header direction is picked, extend <code>src/loop/loopModel.ts</code> with a <code>while</code> variant (or a generalized port, per W10) and a <code>while</code> entry in the loop tool/menu.</li><li><b>Next:</b> lower <code>ast.While</code> in the analyzer the same two-pass way <code>ast.For</code> already is (the loop-carried-state report's four rules apply unchanged).</li></ul></div>
<div><h4>Needs you (default in brackets)</h4><ul><li>Pick a header [{winner['id'].upper()}, the generalized port].</li><li>Does a while ever need its own tool/icon, or does <code>for</code>/<code>while</code> stay one Loop tool with two headers [one tool, per W10's thesis]?</li><li>When the condition depends on carried state (the common case), chain W6's second pill onto the back cable, or leave the header to say it alone [chain it — cheapest and reuses the shipped mark]?</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No analyzer or renderer code changed; no <code>src/loop/</code> file touched. These are static SVG mockups in the idiom, exactly like every prior loop babble in this repo.</li><li>No <code>break</code>/<code>continue</code>, nested-while, or while-inside-branch board — out of scope for a header-only question.</li></ul></div>
</div>
<h3>Reply cheaply</h3><p class="small">Pick buttons persist in this browser; the brief mirrors them. Or in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<h2>Source index</h2>
<ol class="srcs">{''.join(f"<li id='s{i}'>{html.escape(t)} — <a href='{html.escape(u)}'>{html.escape(u)}</a></li>" for i, t, u in SOURCES)}</ol>
<footer>Built by <code>docs/build_while_loop_header.py</code> at {GIT_HEAD} · boards are SVG in the SystemSketch idiom, not live tldraw shapes · relevant prior work: <a href="loop-regions-2026-09-02.html">loop regions L1–L5</a> · <a href="loop-edge-marks-2026-09-02.html">back-cable marks M1–M5</a> · <a href="loop-header-item-connection-2026-09-03.html">for-loop header/item connection</a> · <a href="loop-region-implementation-2026-09-03.html">shipped for-loop implementation</a> · Claude Code (Sonnet 5), {TODAY}.</footer>
</main><script>{JS}</script></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "scores": {v["id"]: v["total"] for v in VARIANTS}}))


if __name__ == "__main__":
    main()
