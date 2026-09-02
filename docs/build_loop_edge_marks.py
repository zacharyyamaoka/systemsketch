#!/usr/bin/env python3
"""Build `docs/loop-edge-marks-2026-09-02.html`: five ways to say "next iteration" on a cable.

Zach's brief (2026-09-02, PROJECT - pyblocks §While and for loops): take L1, cycle as a
cable, and explore five ways to indicate on the back edge that it is read on the next
iteration — the unit delay is key; the edges carry little information today; even a
dotted line would do; and the same language should stretch to async wires.

Both L1 fixtures (the 10 golden's `for`, the `while` tracker) are drawn once per
variant with the same helpers the loops report uses, so only the mark differs.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "loop-edge-marks-2026-09-02.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, frame, note, polycable, text,
)

TODAY = "2026-09-02"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
EVENT = "#7c3aed"      # the Aug 25 dashed event rail's redundant colour
STATE = "#0f766e"

# --------------------------------------------------------------------------
# Measured: what a SystemSketch cable can carry today
# --------------------------------------------------------------------------


def cable_facts() -> dict:
    util = (REPO / "src" / "blocks" / "connections" / "ConnectionShapeUtil.tsx").read_text(encoding="utf-8")
    model = (REPO / "src" / "blocks" / "connections" / "connectionModel.ts").read_text(encoding="utf-8")
    appearance = (DOCS / "build_appearance_menu_implementation.py").read_text(encoding="utf-8")
    dash_row = [line for line in appearance.splitlines() if "tldraw:dash" in line]
    heads_row = [line for line in appearance.splitlines() if "arrowheadStart" in line]
    return {
        "cableReadsDash": "dash" in util.lower(),
        "cableHasLabel": "label" in util.lower() or "text" in model.lower(),
        "routingIsStyle": "systemsketch:connectionRouting" in appearance,
        "dashValues": "draw, solid, dashed, dotted, none" if dash_row else "unknown",
        "arrowheads": "9" if heads_row else "unknown",
    }


FACTS = cable_facts()

# --------------------------------------------------------------------------
# Shared pieces (copied from build_loop_regions.py so that file stays untouched)
# --------------------------------------------------------------------------


def loop_region(svg: SVG, x, y, w, h, label, *, band_h=30, headers=(), item=None):
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + band_h}" x2="{x + w}" y2="{y + band_h}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(text(x + w - 12, y + 20, "Loop", size=12, mono=True, anchor="end", color=MUTED))
    svg.add(text(x + w / 2 - 10, y + 20, label, size=12.5, weight=700, color=INK, anchor="middle"))
    out = {"right": x + w, "band_bottom": y + band_h, "bottom": y + h, "x": x}
    n = len(headers)
    for i, name in enumerate(headers):
        hy = y + band_h * (i + 1) / (n + 1)
        svg.add(dot(x, hy, ANY, True, r=5))
        svg.add(text(x + 12, hy + 4, name, size=10.5, color=MUTED))
        out[f"hdr:{name}"] = (x, hy)
    if item:
        ix = x + 40
        svg.add(dot(ix, y + band_h, ANY, True, r=5))
        svg.add(text(ix + 10, y + band_h + 14, item, size=10.5, color=MUTED, italic=True))
        out["item"] = (ix, y + band_h)
    return out


def arrowhead(svg: SVG, x, y, color=CABLE, opacity=1.0):
    svg.add(f'<path d="M{x - 8},{y - 4} L{x},{y} L{x - 8},{y + 4} z" fill="{color}" opacity="{opacity}"/>')


def common_for(svg: SVG):
    frame(svg, 20, 20, 1340, 560, "run()")
    raws = boundary_in(svg, 20, 175, "raws", "bytes")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    others = boundary_in(svg, 20, 440, "others", "Poses")
    decode = block(svg, 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    estimate = block(svg, 410, 200, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    svg.add(cable(raws, decode["in"]["raw"]))
    svg.add(cable(decode["out"]["Frame"], estimate["in"]["frame"], mid=380))
    svg.add(cable(gain, estimate["in"]["gain"], mid=380))
    return {"raws": raws, "gain": gain, "others": others, "decode": decode, "estimate": estimate}


# --------------------------------------------------------------------------
# The marks.  Each takes the back cable's polyline (from the producer to the
# consumer's port), the seed's producer name, and draws the cable + its mark.
# --------------------------------------------------------------------------


def path_d(points) -> str:
    return "M" + " L".join(f"{x},{y}" for x, y in points)


def lane_label_pos(points):
    """Midpoint of the longest horizontal segment (the bottom lane)."""
    best = None
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if y1 == y2 and (best is None or abs(x2 - x1) > best[0]):
            best = (abs(x2 - x1), ((x1 + x2) / 2, y1))
    return best[1]


def mark_dotted(svg: SVG, points, seed: str, port) -> None:
    svg.add(f'<path d="{path_d(points)}" fill="none" stroke="{CABLE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0.1 6"/>')
    arrowhead(svg, port[0], port[1])


def mark_chip(svg: SVG, points, seed: str, port) -> None:
    svg.add(polycable(points))
    arrowhead(svg, port[0], port[1])
    mx, my = lane_label_pos(points)
    label = "z⁻¹"
    w = 34
    svg.add(f'<rect x="{mx - w / 2}" y="{my - 10}" width="{w}" height="20" rx="10" fill="#fff" stroke="{INK}" stroke-width="1.3"/>')
    svg.add(text(mx, my + 4.5, label, size=12, weight=700, anchor="middle", mono=True))
    svg.add(text(mx + w / 2 + 8, my - 7, f"seed = {seed}", size=10.5, color=MUTED, italic=True))


def mark_node(svg: SVG, points, seed: str, port) -> None:
    # the last vertical rise before the port carries the Unit Delay block
    svg.add(polycable(points))
    arrowhead(svg, port[0], port[1])
    (x1, y1), (x2, y2) = points[-3], points[-2]
    cx, cy = x1, (y1 + y2) / 2
    w, h = 40, 28
    svg.add(f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="4" fill="#fff" stroke="{INK}" stroke-width="1.4"/>')
    svg.add(text(cx, cy + 5, "z⁻¹", size=13, weight=700, anchor="middle", mono=True))
    svg.add(text(cx + w / 2 + 8, cy + 4, f"x₀ = {seed}", size=10.5, color=MUTED, italic=True))


def mark_landing(svg: SVG, points, seed: str, port) -> None:
    trimmed = points[:-1] + [(port[0] - 18, port[1])]
    svg.add(polycable(trimmed))
    x, y = port
    for dx in (18, 10):
        svg.add(f'<path d="M{x - dx - 6},{y - 5} L{x - dx},{y} L{x - dx - 6},{y + 5}" fill="none" stroke="{CABLE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')
    mx, my = lane_label_pos(points)
    svg.add(text(mx, my - 6, "next iteration", size=10.5, color=MUTED, italic=True, anchor="middle"))


def mark_token(svg: SVG, points, seed: str, port) -> None:
    svg.add(polycable(points))
    arrowhead(svg, port[0], port[1])
    mx, my = lane_label_pos(points)
    s = 8
    svg.add(f'<path d="M{mx},{my - s} L{mx + s},{my} L{mx},{my + s} L{mx - s},{my} z" fill="{ANY}" stroke="{INK}" stroke-width="1.2"/>')
    svg.add(text(mx, my + 3.5, "1", size=9, weight=700, anchor="middle", color="#fff"))
    svg.add(text(mx + s + 8, my - 7, f"◆ {seed}", size=10.5, color=INK, italic=True))


MARKS = {
    "m1": mark_dotted,
    "m2": mark_chip,
    "m3": mark_node,
    "m4": mark_landing,
    "m5": mark_token,
}


# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------


def board_for(mark) -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    reg = loop_region(svg, 700, 130, 400, 330, "for other in others:", headers=["others"], item="other")
    svg.add(cable(base["others"], reg["hdr:others"], kind="control", mid=660))
    merge = block(svg, 760, 220, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    port = merge["in"]["pose"]
    svg.add(cable(base["estimate"]["out"]["Pose"], port, mid=680))
    ix, iy = reg["item"]
    svg.add(polycable([(ix, iy), (ix, merge["in"]["other"][1]), merge["in"]["other"]]))
    px, py = merge["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    mark(svg, [(px, py), (1060, py), (1060, lane_y), (730, lane_y), (730, port[1]), port], "estimate()", port)
    encode = block(svg, 1140, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable((px, py), encode["in"]["pose"], mid=1110))
    ex, ey = base["estimate"]["out"]["Pose"]
    svg.add(polycable([(ex, ey), (680, ey), (680, 520), (1115, 520), (1115, encode["in"]["pose"][1]), encode["in"]["pose"]]))
    svg.add(text(905, 514, "zero iterations: the seed reaches encode untouched", size=10.5, color=MUTED, italic=True, anchor="middle"))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    return svg.render("for")


def board_while(mark) -> str:
    svg = SVG(1380, 600)
    frame(svg, 20, 20, 1340, 560, "track()")
    fr = boundary_in(svg, 20, 175, "frame", "Frame")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    tol = boundary_in(svg, 20, 440, "tol", "float", NUMBER)
    estimate = block(svg, 150, 200, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    svg.add(cable(fr, estimate["in"]["frame"], mid=110))
    svg.add(cable(gain, estimate["in"]["gain"], mid=110))
    reg = loop_region(svg, 440, 130, 520, 330, "while pose.error > tol:", headers=["tol"])
    svg.add(cable(tol, reg["hdr:tol"], kind="control", mid=405))
    refine = block(svg, 520, 220, 220, "refine()", [{"name": "pose", "type": "Pose"}, {"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    port = refine["in"]["pose"]
    svg.add(cable(estimate["out"]["Pose"], port, mid=430))
    svg.add(polycable([fr, (110, fr[1]), (110, 330), (480, 330), (480, refine["in"]["frame"][1]), refine["in"]["frame"]]))
    px, py = refine["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    mark(svg, [(px, py), (860, py), (860, lane_y), (490, lane_y), (490, port[1]), port], "estimate()", port)
    pose_out = boundary_out(svg, 1360, 341, "pose", "Pose")
    svg.add(cable((px, py), pose_out, mid=1200))
    ex, ey = estimate["out"]["Pose"]
    svg.add(polycable([(ex, ey), (400, ey), (400, 520), (1300, 520), (1300, pose_out[1]), pose_out]))
    svg.add(text(850, 514, "zero iterations: the seed is returned", size=10.5, color=MUTED, italic=True, anchor="middle"))
    return svg.render("while")


def strip(variant: str) -> str:
    """The design language as a system: four edge kinds drawn with this variant's family of marks."""
    svg = SVG(1380, 150)
    rows = [("data (now)", "data"), ("event / async (Aug 25 rail)", "async"), ("next iteration", "delay"), ("state (golden 11)", "state")]
    for i, (label, kind) in enumerate(rows):
        x0, x1, y = 40 + i * 335, 40 + i * 335 + 250, 78
        svg.add(text(x0, 40, label, size=11.5, weight=700))
        svg.add(dot(x0, y, ANY, True))
        svg.add(dot(x1, y, ANY, True))
        pts = [(x0, y), (x1, y)]
        color = CABLE
        if kind == "data":
            svg.add(polycable(pts))
            arrowhead(svg, x1, y)
            svg.add(text(x0, 112, "solid, the value of this pass", size=10.5, color=MUTED, italic=True))
            continue
        if kind == "async":
            # the Aug 25 proposal: a dashed event rail with a redundant colour; every variant keeps it
            svg.add(f'<path d="{path_d(pts)}" fill="none" stroke="{EVENT}" stroke-width="1.8" stroke-dasharray="7 5" stroke-linecap="round"/>')
            arrowhead(svg, x1, y, EVENT)
            extra = {"m2": "+ chip “await”", "m3": "+ queue node", "m4": "+ open arrowhead (UML)", "m5": "+ ○ token (BPMN)", "m1": "dashed, purple"}[variant]
            svg.add(text(x0, 112, extra, size=10.5, color=MUTED, italic=True))
            continue
        if kind == "delay":
            MARKS[variant](svg, [(x0, y), (x0 + 100, y), (x0 + 100, y), (x1, y)], "x₀", (x1, y)) if variant != "m3" else None
            if variant == "m3":
                svg.add(polycable(pts))
                arrowhead(svg, x1, y)
                cx = (x0 + x1) / 2
                svg.add(f'<rect x="{cx - 20}" y="{y - 14}" width="40" height="28" rx="4" fill="#fff" stroke="{INK}" stroke-width="1.4"/>')
                svg.add(text(cx, y + 5, "z⁻¹", size=13, weight=700, anchor="middle", mono=True))
            caption = {"m1": "dotted", "m2": "solid + z⁻¹ chip", "m3": "solid through a z⁻¹ block", "m4": "solid, ≫ at the landing", "m5": "solid + ◆ initial token"}[variant]
            svg.add(text(x0, 112, caption, size=10.5, color=MUTED, italic=True))
            continue
        if kind == "state":
            svg.add(f'<path d="{path_d(pts)}" fill="none" stroke="{STATE}" stroke-width="1.8" stroke-linecap="round"/>')
            arrowhead(svg, x1, y, STATE)
            extra = {"m1": "solid, teal (colour only)", "m2": "+ chip “state”", "m3": "+ state node (the golden's oval)", "m4": "+ bar arrowhead", "m5": "+ ● token"}[variant]
            svg.add(text(x0, 112, extra, size=10.5, color=MUTED, italic=True))
    return svg.render(f"{variant} strip")


# --------------------------------------------------------------------------
# Variants, criteria, scores
# --------------------------------------------------------------------------

CRITERIA = [
    ("c1", "Read at a glance, no legend", 25, "A reader who has never seen the board knows this cable is read one iteration late."),
    ("c2", "Derivable from the code", 15, "A back edge inside a loop region is always one iteration late and the seed is always known; the mark must need no authoring."),
    ("c3", "Carries the initial value", 15, "The seed (what the consumer gets on iteration 0) is the second fact of every delay; Simulink, LabVIEW, Lustre and SDF all name it."),
    ("c4", "One language for data / async / delay / state", 20, "The mark must belong to a family that also says event/async (the Aug 25 dashed rail) and state without collisions."),
    ("c5", "Native in stock tldraw", 15, "Dash pattern, arrowhead kind and mid-arrow label are things tldraw's arrow already has; a new shape is not."),
    ("c6", "Scales to three carried names", 10, "Three back cables must still read; per-cable chrome multiplies."),
]

VARIANTS = [
    {"id": "m1", "name": "Dotted line", "family": "line style",
     "thesis": "The back cable is dotted, nothing else. Solid means this pass, dotted means next pass; dashed stays the Aug 25 event rail. tldraw's arrow has all three dash styles already.",
     "best": "Boards with many loops; zero text on the canvas; the cheapest possible implementation once the cable honours tldraw:dash.",
     "loses": "Dotted does not say 'later', it says 'different'; at small zoom dotted and dashed blur into one; the seed is not named anywhere.",
     "scores": {"c1": 3, "c2": 5, "c3": 1, "c4": 3, "c5": 5, "c6": 5}},
    {"id": "m2", "name": "z⁻¹ chip mid-cable", "family": "chip on the cable",
     "thesis": "A small z⁻¹ pill rides the bottom lane where 'next iteration' sat, with the seed named beside it. Control theory's own glyph, as a mid-arrow label.",
     "best": "Readers who know a block diagram; three carried names read as three chips on three lanes.",
     "loses": "A reader who has never seen z⁻¹ needs one sentence once; a chip is text on a cable, which the canvas has kept clean so far.",
     "scores": {"c1": 4, "c2": 5, "c3": 3, "c4": 4, "c5": 4, "c6": 4}},
    {"id": "m3", "name": "Unit Delay block at the merge", "family": "node on the edge",
     "thesis": "Simulink's answer, literally: a z⁻¹ block sits on the back cable just before the consumer, and its initial condition is the seed. The node is the delay and the state in one place.",
     "best": "Anyone who has opened Simulink or LabVIEW's z-transform view reads it instantly; the block can hold the initial condition as a parameter.",
     "loses": "A node the code does not have; three carried names are three blocks; async would want a queue node to match, which gets heavy.",
     "scores": {"c1": 5, "c2": 4, "c3": 4, "c4": 3, "c5": 3, "c6": 3}},
    {"id": "m4", "name": "≫ at the landing", "family": "arrowhead",
     "thesis": "The information lives at the consumer: the back cable ends in a double chevron, AADL's delayed connection made graphical, and the lane keeps its label. Solid line, ordinary run.",
     "best": "When the arrowhead family is adopted across the board: filled = data, open = async (UML), ≫ = delayed, bar = state.",
     "loses": "An arrowhead is the smallest mark on the canvas; tldraw has nine heads and none is a double chevron, so it is the one non-native glyph; the seed is not named.",
     "scores": {"c1": 3, "c2": 5, "c3": 1, "c4": 4, "c5": 3, "c6": 5}},
    {"id": "m5", "name": "◆ initial token", "family": "token on the arc",
     "thesis": "SDF's own mark: a diamond on the arc carrying the number of initial tokens, here 1, with the seed's producer named beside it. One mark says delayed and says what arrives first.",
     "best": "When naming the seed matters more than the glyph; loops whose seed is not obvious from the wiring.",
     "loses": "A diamond means nothing to a reader outside DSP; tokens generalise badly to async (a queue is not one token); mid-cable label plus a glyph is partly native.",
     "scores": {"c1": 4, "c2": 5, "c3": 5, "c4": 3, "c5": 3, "c6": 4}},
]


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["total"] = weighted(v["scores"])

PRIOR = [
    ("Simulink Unit Delay", "a block on the feedback path labelled z⁻¹", "one sample period late", "yes: the Initial condition parameter, default 0", "[1]"),
    ("Simulink algebraic loops", "a loop of direct-feedthrough blocks is an error class", "the delay is what makes the loop legal", "—", "[2]"),
    ("LabVIEW Feedback Node", "a node auto-inserted on the wire when an output is wired to its own input; an arrow glyph; z-transform view available", "holds the last execution's value for the next", "yes: the initializer terminal", "[3]"),
    ("Synchronous dataflow (Lee & Messerschmitt)", "a property of the arc: n initial tokens, drawn on the arc", "n samples", "yes: the initial tokens are the value", "[4]"),
    ("Ptolemy II SampleDelay", "an actor on the arc", "outputs initialOutputs before passing input through", "yes: initialOutputs, default one zero", "[5]"),
    ("Lustre pre / -> / fby", "operators in the text: pre delays, -> initialises, fby is both", "one instant", "yes: x fby y", "[6]"),
    ("Max/MSP tapin~ / tapout~", "feedback only through a delay line; delay~ refuses feedback", "one signal vector minimum", "no", "[7][8]"),
    ("TouchDesigner Feedback TOP", "a node that sources from a downstream Target TOP", "the previous cook", "no", "[9]"),
    ("Blender Simulation zone", "a zone: state items pass from one frame to the next; no link may leave the zone", "one frame", "yes: the first evaluation of the inputs", "[10]"),
    ("UML sequence diagram", "arrowhead: filled = synchronous, open = asynchronous; dashed = reply", "—", "—", "[11]"),
    ("BPMN", "line style: solid sequence flow, dashed message flow with an open circle, dotted association", "—", "—", "[12]"),
    ("AADL", "a solid connection line, 'sometimes adorned with double cross hatching' for delayed communication; textual ->> vs ->", "phase-delayed to the sender's deadline", "—", "[13]"),
]

SOURCES = [
    (1, "MathWorks — Unit Delay block ('Delay signal one sample period'; Initial condition)", "https://www.mathworks.com/help/simulink/slref/unitdelay.html"),
    (2, "MathWorks — Algebraic Loop Concepts", "https://www.mathworks.com/help/simulink/ug/algebraic-loops.html"),
    (3, "NI LabVIEW Help — Feedback Node (rajsite mirror of NI's help)", "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/Block_Diagram_Feedback.html"),
    (4, "Evans, EE382C lecture — Introduction to Synchronous Dataflow (quoting Lee & Messerschmitt 1987; the Berkeley PDF refused connections during this run)", "https://users.ece.utexas.edu/~bevans/courses/ee382c/lectures/08_sdf/sdf.html"),
    (5, "Ptolemy II — ptolemy.domains.sdf.lib.SampleDelay source", "https://github.com/icyphy/ptII/blob/master/ptolemy/domains/sdf/lib/SampleDelay.java"),
    (6, "Zélus manual — the core synchronous language (pre, ->, fby)", "https://zelus.di.ens.fr/man/manual004.html"),
    (7, "Cycling '74 — delay~ reference ('you cannot feed the output of delay~ back to its input')", "https://docs.cycling74.com/reference/delay~/"),
    (8, "Cycling '74 — MSP Delay Tutorial 2: Delay Lines with Feedback", "https://docs.cycling74.com/max8/tutorials/15_delaychapter02"),
    (9, "Derivative — Feedback TOP", "https://docs.derivative.ca/Feedback_TOP"),
    (10, "Blender Manual — Simulation Zone", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/simulation/simulation_zone.html"),
    (11, "Wikipedia — Sequence diagram (message arrow notation)", "https://en.wikipedia.org/wiki/Sequence_diagram"),
    (12, "Wikipedia — Business Process Model and Notation (connecting objects)", "https://en.wikipedia.org/wiki/Business_Process_Model_and_Notation"),
    (13, "Feiler, Gluch, Hudak (2006) — The Architecture Analysis & Design Language (AADL): An Introduction, CMU/SEI-2006-TN-011, §8.1.5", "https://people.computing.clemson.edu/~johnmc/courses/cpsc875/resources/06tn011.pdf"),
]

# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1400px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(34px,5vw,56px);line-height:1.02;letter-spacing:-.04em;margin:10px 0 14px;max-width:1000px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}h3{font-size:18px;margin:26px 0 8px}
p{max-width:880px}.lede{font-size:18px;color:#39424f;max-width:920px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:24px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
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
  var key='loop-edge-marks-2026-09-02';var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
    var lines=Object.keys(state).map(function(id){return state[id]+': '+id});var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: m2\\nBorrow from m5: name the seed beside the chip\\nAvoid: \\nWhy: ')}}
  document.querySelectorAll('.pick button').forEach(function(b){b.addEventListener('click',function(){var id=b.parentNode.dataset.id;state[id]=(state[id]===b.dataset.v)?undefined:b.dataset.v;if(!state[id])delete state[id];try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}paint()})});
  paint();
})();
"""


def fig(svg: str, caption: str) -> str:
    return f"<figure>{svg}<figcaption>{caption}</figcaption></figure>"


def variants_html() -> str:
    out = []
    for v in VARIANTS:
        mark = MARKS[v["id"]]
        scores = " · ".join(f"{c[0]} {v['scores'][c[0]]}" for c in CRITERIA)
        out.append(
            f"<section class='variant' id='{v['id']}'><header><h3>{v['id'].upper()} · {html.escape(v['name'])}</h3><span class='score'>{v['total']}/100</span><span class='small'>{scores} · family: {html.escape(v['family'])}</span></header>"
            f"<p>{html.escape(v['thesis'])}</p>"
            + fig(board_for(mark), f"<b>{html.escape(v['name'])}, for.</b> The 10 golden; the seed cable and the back cable both land on merge.pose, one plain port.")
            + fig(board_while(mark), f"<b>{html.escape(v['name'])}, while.</b> The tracker; same mark, same lane.")
            + fig(strip(v["id"]), "<b>As a system.</b> The four edge kinds Zach named, drawn with this variant's family of marks. The dashed purple event rail is the Aug 25 proposal and is kept in every row.")
            + f"<div class='cols'><div><span class='k'>best when</span><p>{html.escape(v['best'])}</p></div><div><span class='k'>loses when</span><p>{html.escape(v['loses'])}</p></div></div>"
            f"<div class='pick' data-id='{v['id']}'><button data-v='Pick'>Pick</button><button data-v='Shortlist'>Shortlist</button><button data-v='Reject'>Reject</button></div></section>"
        )
    return "".join(out)


def scores_html() -> str:
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    for v in sorted(VARIANTS, key=lambda v: -v["total"]):
        cells = "".join(f"<td class='n'>{v['scores'][c[0]]}</td>" for c in CRITERIA)
        rows += f"<tr class='{'win' if v['id'] == 'm2' else ''}'><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>{cells}<td class='n'><b>{v['total']}</b></td></tr>"
    crit = "".join(f"<li><b>{c[0]} · {html.escape(c[1])}</b> ({c[2]}) — {html.escape(c[3])}</li>" for c in CRITERIA)
    return f"<ul>{crit}</ul><table><tr><th>variant</th>{head}<th class='n'>total</th></tr>{rows}</table>"


def prior_html() -> str:
    rows = "".join(f"<tr><td><b>{html.escape(t)}</b></td><td>{html.escape(w)}</td><td>{html.escape(m)}</td><td>{html.escape(i)}</td><td class='small'>{c}</td></tr>" for t, w, m, i, c in PRIOR)
    return f"<table><tr><th>tool / theory</th><th>where the mark sits</th><th>what it means</th><th>carries the initial value</th><th>src</th></tr>{rows}</table>"


def language_html() -> str:
    rows = [
        ("M1 line style", "solid", "dashed (purple)", "dotted", "solid teal", "dotted and dashed blur at small zoom; a fourth kind has no style left (tldraw: draw · solid · dashed · dotted)"),
        ("M2 chip", "no chip", "chip “await” on a dashed rail", "chip z⁻¹ (+ seed)", "chip “state”", "chips are text; every qualified cable costs a label, but the family is open-ended"),
        ("M3 node", "—", "queue node", "z⁻¹ block", "state oval (golden 11's own target)", "every qualifier becomes a node; three delays are three blocks; heaviest, most literal"),
        ("M4 arrowhead", "filled", "open (UML async)", "≫ (AADL ->>)", "bar", "the smallest mark; tldraw ships nine heads, no ≫; open vs filled needs zoom"),
        ("M5 token", "—", "○ (BPMN message start)", "◆ n initial tokens + seed", "● ", "tokens say ‘what is on the arc first’; async has no token count, so the family bends"),
    ]
    body = "".join(f"<tr><td><b>{html.escape(a)}</b></td><td>{html.escape(b)}</td><td>{html.escape(c)}</td><td>{html.escape(d)}</td><td>{html.escape(e)}</td><td class='small'>{html.escape(f)}</td></tr>" for a, b, c, d, e, f in rows)
    return f"<table><tr><th>family</th><th>data (now)</th><th>event / async</th><th>next iteration</th><th>state</th><th>collisions and cost</th></tr>{body}</table>"


def build() -> str:
    win = next(v for v in VARIANTS if v["id"] == "m2")
    facts = FACTS
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loop edge marks — five ways to say next iteration</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · pyblocks · loops · edge marks · {TODAY}</div>
<h1>Five ways to say "next iteration" on a cable.</h1>
<p class="lede">L1 draws a loop's carried value as an ordinary cable that comes back. You asked what that cable should carry so a reader knows it is read one iteration late: the unit delay is the key, the control people solved it, the edges carry little today, even a dotted line would do, and whatever it is should stretch to async wires. Five marks below, each on both L1 fixtures and each extended to the four edge kinds you named, so they are judged as a language rather than a glyph. <b>M2, a z⁻¹ chip on the lane with the seed named beside it, is recommended</b>; M5's diamond is the same idea in SDF's dialect and is the splice.</p>
<div class="facts">
<div class="fact"><b>{facts['dashValues']}</b><span>stroke styles tldraw's arrow already has (the appearance pill exposes them); the SystemSketch cable {"reads" if facts['cableReadsDash'] else "does not yet read"} <code>tldraw:dash</code></span></div>
<div class="fact"><b>{facts['arrowheads']}</b><span>arrowhead kinds tldraw ships (arrow, triangle, square, dot, pipe, diamond, inverted, bar, none); no double chevron</span></div>
<div class="fact"><b>z⁻¹</b><span>the one glyph Simulink, LabVIEW's z-transform view and every control textbook share for "previous sample"</span></div>
<div class="fact"><b>2 facts</b><span>every delay in the prior art states two things: one step late, and what arrives first (the initial value)</span></div>
</div>

<h2>1 · What the prior art agrees on</h2>
<p><b>A delay is two facts, and the tools that got it right name both.</b> Simulink's Unit Delay is "Delay signal one sample period" with an <i>Initial condition</i> "for the first sampling period, during which the output of the Unit Delay block is otherwise undefined" [1]; LabVIEW's Feedback Node "receives a value from the initializer terminal and transfers the value to the next input terminal" and is "analogous to a z⁻¹ block in feedback control theory" [3]; SDF makes it a property of the arc, "a delay of n samples means that n tokens are initially in the queue of that arc" [4]; Ptolemy's SampleDelay "outputs a set of initial tokens during the initialize() method" and "is used to break dependency cycles in directed loops" [5]; Lustre spells the pair as <code>pre</code> and <code>-&gt;</code>, or <code>fby</code> for both [6]. Your L1 already draws the second fact as a cable (the seed), so the mark only has to say the first, and can afford to point at the seed.</p>
<p><b>Where the mark sits is the whole design choice.</b> Simulink and LabVIEW put it in a node on the path [1][3]; SDF puts it on the arc [4]; Blender puts it on the zone ("passed to the next simulation state", "it is not possible to have any link going towards outside") [10]; Max puts it in the object you are allowed to feed back through ("you cannot feed the output of delay~ back to its input") [7]. For asynchrony the diagram languages use the arrowhead (UML: "solid arrow heads represent synchronous calls, open arrow heads represent asynchronous messages") [11], the line style (BPMN: dashed message flow, dotted association) [12], or an adornment on the line (AADL: connections "sometimes adorned with double cross hatching" for delayed communication) [13]. Those three, arrowhead, line style, adornment, plus node and token, are the five families below.</p>
<p><b>Why L1 can afford a light mark.</b> The Simulink rule is that a loop of direct-feedthrough blocks is an algebraic loop, "a circular dependency of block output and input values in the same time step" [2]; the delay is what makes the loop legal. Inside a loop <i>region</i> that legality is already stated by the region: everything inside runs per iteration, so a backwards cable can only mean next time. The mark is for the reader, not the scheduler, which is why a chip or a dotted line is enough where Simulink needs a block.</p>
{prior_html()}

<h2>2 · The language, as a system</h2>
<p>Each family extended to the four edge kinds you named. The dashed purple event rail is the Aug 25 behaviour-tree proposal and is kept in every row; anything that collides with it is marked.</p>
{language_html()}
<div class="callout"><b>The one rule that falls out.</b> Line style is taken: solid is a value of this pass, dashed is an event (Aug 25). Keep it that way and put <i>temporal qualifiers</i> on the cable as chips (z⁻¹, await, state), which scale to any number of kinds and stay readable at any zoom because they are text. Use dotted only if you decide the event rail should move to colour alone; then M1 is free and is the cheapest mark on the page.</div>

<h2>3 · Criteria, then five marks</h2>
{scores_html()}
<div class="callout"><b>Hinge.</b> M2 wins on the system criterion and native support; M5 wins on naming the seed; they are one mark apart, so the recommendation is M2 with M5's seed name beside the chip (already drawn). If you want <i>zero text on cables</i>, M1 wins outright at the cost of the seed being unnamed and dotted-vs-dashed at small zoom. If you want the control-theory block literally, M3 is the most legible single mark on the page and the heaviest to scale.</div>
{variants_html()}

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Five marks drawn on both L1 fixtures with the loops report's own helpers, so only the mark differs.</li><li>Each family extended to data / async / delay / state and checked for collisions with the Aug 25 event rail.</li><li>Prior art from 13 primary sources, reduced to one table.</li></ul></div>
<div><h4>Left</h4><ul><li><b>Next:</b> the cable honours <code>tldraw:dash</code> and a mid-cable label (both native tldraw arrow features) so M1 and M2 cost nothing new; the analyzer marks a back edge as <code>delayed</code> with its seed producer.</li><li><b>Next:</b> decide the event rail's redundancy (dash + colour, or colour only).</li></ul></div>
<div><h4>Needs you (default in brackets)</h4><ul><li>Pick a mark [M2, seed named beside the chip].</li><li>Chip text: <code>z⁻¹</code> or the word <code>next</code>? [z⁻¹; the word on hover].</li><li>Does the zero-iterations cable get any mark? [no; it is a value of this pass].</li><li>Event rail stays dashed + purple? [yes; dotted then stays free].</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No cable code changed; the SystemSketch cable does not read dash or carry a label today, and that is the implementation step, not this page.</li><li>No async grammar redesigned; the Aug 25 rail is held as the constraint and only its redundancy is questioned.</li></ul></div>
</div>
<h3>Reply cheaply</h3><p class="small">Pick buttons persist in this browser; the brief mirrors them. Or in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<h2>Source index</h2>
<ol class="srcs">{''.join(f"<li id='s{i}'>{html.escape(t)} — <a href='{html.escape(u)}'>{html.escape(u)}</a></li>" for i, t, u in SOURCES)}</ol>
<footer>Built by <code>docs/build_loop_edge_marks.py</code> at {GIT_HEAD} · boards are SVG in the SystemSketch idiom, not live tldraw shapes · Claude Code (Fable 5.1), {TODAY}.</footer>
</main><script>{JS}</script></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "scores": {v["id"]: v["total"] for v in VARIANTS}}))


if __name__ == "__main__":
    main()
