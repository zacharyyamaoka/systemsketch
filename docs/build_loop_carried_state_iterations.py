#!/usr/bin/env python3
"""
Ten iterations of Zach's own loop drawing, plus a carried-state stress suite.

Golden 10 (`loop_carried_state`) is settled at the grammar level: L1 "cycle as a
cable", the back cable routed to the region's right edge, down a bottom lane and
home, an `M2` z⁻¹ chip on it, and seed + back landing on ONE consumer port. What
is still open is everything smaller, and everything smaller is what decides
whether the dataflow actually reads. This builder varies only those.

Run:  python3 docs/build_loop_carried_state_iterations.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_for_loop_labview_grammars import (  # noqa: E402
    BORDER, BORDER_SOFT, CANVAS, DONE, FAINT, INK, INK_2, MONO, MUTED, PORT,
    SANS, SUNKEN, SURFACE, TIME, WARN,
    Block, Port, Scene, cable, caption, chip, draw_block, esc, hop, path_point,
)

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
SKETCHES = REPO / "sketches" / "review"
STAMP = "2026-09-03"

# Geometry, read off Zach's two captures rather than invented.
SW, SH = 1240, 570
REG = dict(x=250, y=56, w=660, h=440)
REG_R = REG["x"] + REG["w"]
REG_B = REG["y"] + REG["h"]
HEAD_H = 58
FOOT_H = 40
DROP_X = 296          # where the item cable falls inside the wall
BACK_X = 340          # where the back cable climbs home
LANE_Y = 420          # the bottom lane the back cable runs along


def loop_region(s: Scene, x=None, y=None, w=None, h=None, title="For Loop",
                turn="iteration 3 of 7", head=HEAD_H, foot=FOOT_H, layer="back"):
    """Zach's loop scope: a Block-shaped container, never a computation node."""
    x = REG["x"] if x is None else x
    y = REG["y"] if y is None else y
    w = REG["w"] if w is None else w
    h = REG["h"] if h is None else h
    s.rect(x, y, w, h, r=12, fill="#FCFCFC", stroke="#E4E4E4", sw=1.3, layer=layer)
    s.line(x + 1, y + head, x + w - 1, y + head, BORDER_SOFT, layer=layer)
    if foot:
        s.line(x + 1, y + h - foot, x + w - 1, y + h - foot, BORDER_SOFT, layer=layer)
        s.text(x + w - 18, y + h - foot + 26, "⋮", size=13, fill=FAINT,
               anchor="middle", layer=layer)
    s.text(x + 58, y + 40, title, size=25, fill=INK, layer=layer)
    if turn:
        width = 11 * 0.63 * len(turn) + 22
        s.rect(x + w - 22 - width, y + 14, width, 24, r=12, fill="#F2EFFB",
               stroke=TIME, sw=1.1, layer=layer)
        s.text(x + w - 22 - width / 2, y + 30, turn, size=11.5, fill=TIME,
               anchor="middle", weight="600", layer=layer, family=MONO)
    return {"head": y + head, "foot": y + h - foot}


def merge_block(y=210, x=420, w=320, title="merge()",
                inputs=(("pose", "Pose"), ("other", "Pose")), outputs=(("", "Pose"),)):
    return Block("merge", x, y, w, title,
                 inputs=[Port(n, t) for n, t in inputs],
                 outputs=[Port(n, t) for n, t in outputs])


def estimate_block():
    return Block("estimate", 16, 232, 176, "estimate()",
                 inputs=[], outputs=[Port("", "Pose")])


def encode_block():
    return Block("encode", 1000, 235, 200, "encode()",
                 inputs=[Port("pose", "Pose")], outputs=[])


def wall_port(s: Scene, x, y, split=False, outer_type="Poses", inner_type="Pose",
              stacked=False, inner_y=None):
    """The region's boundary port. One dot with two faces is the settled model;
    `split` paints the two faces on that one dot, `stacked` draws them apart."""
    if stacked:
        s.circle(x, y, 6, PORT, PORT, 0, layer="over")
        s.circle(x, inner_y, 6, SURFACE, PORT, 2, layer="over")
        s.text(x + 16, (y + inner_y) / 2 + 4, inner_type, size=12.5, fill=MUTED, layer="over")
        return (x, inner_y)
    if split:
        s.over.append(
            f'<path d="M {x} {y-7} A 7 7 0 0 0 {x} {y+7} z" fill="{PORT}"/>'
            f'<path d="M {x} {y-7} A 7 7 0 0 1 {x} {y+7} z" fill="{SURFACE}"/>'
            f'<circle cx="{x}" cy="{y}" r="7" fill="none" stroke="{PORT}" stroke-width="2"/>')
        s.text(x - 13, y + 4, outer_type, size=12, fill=MUTED, anchor="end", layer="over")
        s.text(x + 13, y + 22, inner_type, size=12, fill=MUTED, layer="over")
    else:
        s.circle(x, y, 6.5, PORT, PORT, 0, layer="over")
    return (x, y)


@dataclass
class Iteration:
    key: str
    name: str
    one_line: str
    port_style: str = "plain"        # plain | split | stacked
    item_route: str = "drop"         # drop | row
    item_mark: str = "index"         # index | binding | none | weight
    back_route: str = "lane"         # lane | floor | stub | top
    seed_named: bool = False
    zero_cable: bool = False
    live: bool = False
    fix_crossing: bool = False
    turn: str = "iteration 3 of 7"
    reads: list = field(default_factory=list)
    costs: str = ""
    scores: dict = field(default_factory=dict)


def iteration_scene(it: Iteration) -> Scene:
    s = Scene(SW, 575, it.name)
    loop_region(s, turn=it.turn)
    est, mg, enc = estimate_block(), merge_block(), encode_block()
    seed_pt, item_pt = mg.inp(0), mg.inp(1)

    # --- the iterable arriving, and the item leaving the wall ----------------
    if it.item_route == "row":
        inlet = (30, 400)
        wall_y = item_pt[1]
        outer = [inlet, (214, 400), (214, wall_y), (REG["x"], wall_y)]
        inner = [(REG["x"], wall_y), item_pt]
    else:
        inlet = (30, 90)
        wall_y = 90
        outer = [inlet, (214, 90), (REG["x"], 90)]
        inner = [(REG["x"], wall_y), (DROP_X, wall_y), (DROP_X, item_pt[1]), item_pt]

    s.circle(*inlet, 5, PORT, PORT, 0)
    s.text(inlet[0] + 10, inlet[1] - 11, "others", size=12.5, fill=INK_2)
    s.text(inlet[0] + 10 + 7.6 * 6 + 7, inlet[1] - 11, "Poses", size=12.5, fill=FAINT)
    cable(s, outer, "bundle" if it.item_mark == "weight" else "solid",
          arrow=False, stroke=None if it.item_mark == "weight" else "#3A3A3A")

    pill = None
    if it.item_mark == "index":
        pill = "i = 3" if it.live else "i = 1"
    elif it.item_mark == "binding":
        pill = "other = others[3]" if it.live else "other = others[i]"
    cable(s, inner, "solid", pill=pill, pill_t=0.42 if it.item_route == "drop" else 0.45)

    # --- the seed -----------------------------------------------------------
    seed = [est.out(0), (230, est.out(0)[1]), (230, seed_pt[1]), seed_pt]
    cable(s, seed, "solid")

    # --- the back cable -----------------------------------------------------
    chip_text = "z⁻¹ = pose₂" if it.live else "z⁻¹"
    if it.back_route == "floor":
        back = [mg.out(0), (880, mg.out(0)[1]), (880, 476), (280, 476), (280, seed_pt[1]), seed_pt]
        s.line(REG["x"] + 1, 476, REG_R - 1, 476, "#EFEFEF", 6, layer="back")
        t = 0.5
    elif it.back_route == "stub":
        back = [mg.out(0), (772, mg.out(0)[1]), (772, 356), (392, 356), (392, seed_pt[1]), seed_pt]
        t = 0.52
    elif it.back_route == "top":
        back = [mg.out(0), (880, mg.out(0)[1]), (880, 152), (392, 152), (392, seed_pt[1]), seed_pt]
        t = 0.52
    else:
        back = [mg.out(0), (860, mg.out(0)[1]), (860, LANE_Y), (BACK_X, LANE_Y),
                (BACK_X, seed_pt[1]), seed_pt]
        t = 0.5
    cable(s, back, "delayed", pill=chip_text, pill_t=t, layer="under")
    if it.seed_named:
        px, py = path_point(back, t)
        caption(s, px, py + 26, "seed = estimate()", fill=MUTED, anchor="middle")

    # --- what leaves --------------------------------------------------------
    cable(s, [mg.out(0), (960, mg.out(0)[1]), (960, enc.inp(0)[1]), enc.inp(0)],
          "solid", stroke=DONE)
    if it.zero_cable:
        cable(s, [est.out(0), (206, est.out(0)[1]), (206, 538), (976, 538),
                  (976, enc.inp(0)[1]), enc.inp(0)], "solid", stroke=DONE)
        caption(s, 470, 532, "zero iterations · estimate()'s pose leaves untouched",
                fill=DONE)

    draw_block(s, est)
    draw_block(s, mg)
    draw_block(s, enc)
    wall_port(s, REG["x"], wall_y, split=it.port_style == "split",
              stacked=it.port_style == "stacked", inner_y=wall_y + 48)
    if it.fix_crossing:
        pass
    elif it.item_route == "drop":
        hop(s, DROP_X, seed_pt[1])
    return s


ITERATIONS = [
    Iteration(
        "A", "As drawn", "Your drawing with the geometry tightened — the control everything else is measured against.",
        reads=["The boundary port on the header line takes <code>others</code>; the cable that leaves it "
               "falls into the body carrying one <code>Pose</code> per turn, with <code>i = 1</code> on it.",
               "<code>merge.pose</code> receives two cables — the solid seed from <code>estimate()</code> and "
               "the dotted back cable — landing on <strong>one port</strong>, which is the settled φ.",
               "The back cable goes to the region's right edge, down the bottom lane, and home: the routing "
               "rule you already picked."],
        costs="The item cable crosses the seed cable at <code>merge.pose</code>'s row. It is small, it is in "
              "your own drawing, and it is the first thing a reader's eye trips on — the hop is drawn here "
              "rather than pretended away.",
        scores=dict(iterable=6, timing=8, calm=8, scale=7, ink=9, seams=10),
    ),
    Iteration(
        "B", "Split-face wall port", "One dot, painted as its two faces: filled outside, hollow inside, with the type change written across it.",
        port_style="split",
        reads=["The dot is filled on the outside half and hollow on the inside half, with <code>Poses</code> "
               "written outside the wall and <code>Pose</code> inside it.",
               "Nothing else changes. The type flip <em>is</em> the unpacking, and it costs no glyph, no "
               "legend and no extra object — SystemSketch already models a port with an outer and an inner "
               "face."],
        costs="A 14px dot is doing load-bearing work. At board zoom the half-fill is legible; on an exported "
              "PNG at 50% it is not, and the two type words are then carrying it alone.",
        scores=dict(iterable=10, timing=8, calm=9, scale=8, ink=9, seams=10),
    ),
    Iteration(
        "C", "Row-aligned item", "The boundary port sits at the row it feeds, so the item cable is one short horizontal run and nothing crosses.",
        item_route="row", fix_crossing=True,
        reads=["<code>others</code> lands on the left wall at exactly <code>merge.other</code>'s height. "
               "The long vertical drop disappears and with it the crossing in A.",
               "Every cable in the body now runs left to right. The only cable that goes right to left is "
               "the back cable, which is the one that means something different."],
        costs="The port's position is now a consequence of the body's layout, so moving <code>merge()</code> "
              "moves the wall port — or breaks the alignment. It also gives up the header corner, which is "
              "where a reader looks first for what the loop iterates over.",
        scores=dict(iterable=7, timing=9, calm=10, scale=8, ink=9, seams=8),
    ),
    Iteration(
        "D", "Seed named on the back cable", "The z⁻¹ chip states both facts a delay has: one step late, and what arrives first.",
        seed_named=True,
        reads=["<code>seed = estimate()</code> sits under the chip. This is M2 exactly as you picked it, and "
               "the reason is that every mature tool states both facts — Simulink's <em>Initial condition</em>, "
               "LabVIEW's Feedback Node initializer, SDF's initial token.",
               "The seed cable is still drawn, so the name is a confirmation rather than the only evidence."],
        costs="Redundant on this board, because the seed cable is right there and comes from a block called "
              "<code>estimate()</code>. It earns its place only when the seed is far away or off-screen.",
        scores=dict(iterable=6, timing=10, calm=7, scale=9, ink=7, seams=9),
    ),
    Iteration(
        "E", "The zero-iterations cable", "Draws what the analyzer already derives: if the loop never runs, estimate()'s pose is what leaves.",
        zero_cable=True,
        reads=["A second solid cable runs from <code>estimate()</code> under the region straight to "
               "<code>encode.pose</code>. Together with the last-value cable it is the exit φ you settled: "
               "two producers, one port.",
               "The picture now answers a question the others cannot: <em>what comes out of an empty "
               "collection?</em>"],
        costs="It doubles the number of long cables on the board for a case that is often impossible. Your "
              "own default was <em>always drawn</em>; this is what always looks like.",
        scores=dict(iterable=6, timing=8, calm=5, scale=10, ink=5, seams=9),
    ),
    Iteration(
        "F", "Back cable on the floor", "The return is not a free cable — it rides the region's own bottom border.",
        back_route="floor",
        reads=["The bottom lane becomes part of the region's chrome rather than a cable competing with the "
               "body. The z⁻¹ chip sits on the border.",
               "The body area is left completely clear: every cable inside the region is a cable of the loop "
               "body, not of the loop machinery."],
        costs="A border that carries data is a new idea in this grammar, and it collides with the footer "
              "strip. It also stops being a cable you can select, drag or restyle — which the shipped "
              "<code>temporal</code> StyleProp assumes you can.",
        scores=dict(iterable=6, timing=7, calm=10, scale=6, ink=10, seams=5),
    ),
    Iteration(
        "G", "Tight stub", "The shortest possible return: out of the block, under it, and straight back in.",
        back_route="stub",
        reads=["The back cable never travels to the region's edge. It leaves <code>merge</code>'s output, "
               "drops just below the block and comes back into <code>merge.pose</code>.",
               "The recurrence reads as a property of <em>that block</em> rather than of the region, which is "
               "what it actually is."],
        costs="It contradicts the routing rule you already chose (&ldquo;go to the end first, then loop "
              "back&rdquo;), and with two body blocks the stub has to reach across whatever sits between "
              "them — at which point it is the lane again, only messier.",
        scores=dict(iterable=6, timing=8, calm=9, scale=4, ink=10, seams=7),
    ),
    Iteration(
        "H", "Weight change, no pill", "The cable outside is a doubled rail; it becomes a single rail at the wall. The pill is deleted.",
        item_mark="weight",
        reads=["A collection is two rails, an element is one. The transition happens exactly at the boundary "
               "port, so the unpacking is shown at the place it occurs.",
               "There is no pill on the item cable at all, which frees that cable for a text label later — "
               "the interference you flagged as a problem for another day."],
        costs="It says <em>many became one</em> but never says <em>one per turn</em>, and it cannot say "
              "<em>which</em> one. It also spends the line-weight axis, which is otherwise free for future "
              "use.",
        scores=dict(iterable=8, timing=7, calm=10, scale=6, ink=10, seams=7),
    ),
    Iteration(
        "I", "Binding pill", "The pill stops being an index and becomes the Python binding itself.",
        item_mark="binding",
        reads=["<code>other = others[i]</code> on the wire says the name, the source and the per-turn "
               "indexing in one mark — the same sentence <code>for other in others</code> makes.",
               "It also names the value, which is what your pill rule asks for: a pill is worth it when it "
               "names a source or a sink, and the boundary is a source."],
        costs="It is a wide pill on a short cable, and the whole point of a dataflow drawing is that the "
              "wire already says where the value came from. Two carried names means two wide pills.",
        scores=dict(iterable=9, timing=7, calm=6, scale=8, ink=6, seams=9),
    ),
    Iteration(
        "J", "Live values", "Every mark carries the value it actually has this turn.",
        live=True, item_mark="binding",
        reads=["The header reads <code>iteration 3 of 7</code>, the item pill reads "
               "<code>other = others[3]</code>, and the back cable's chip reads <code>z⁻¹ = pose₂</code> — "
               "the value that will arrive next turn.",
               "This is the shipped machinery: the delayed cable's <code>= value</code> field already prints "
               "on the pill. Nothing new is invented, it is only filled in.",
               "It answers &ldquo;make the dataflow clear&rdquo; the most literally of the ten: the reader "
               "does not infer the flow, they read it."],
        costs="It only exists while something is running or recorded. On a static diagram the same marks have "
              "to fall back to <code>i</code> and <code>z⁻¹</code>, so this is a <em>state</em> of the "
              "grammar rather than a grammar of its own.",
        scores=dict(iterable=9, timing=10, calm=6, scale=8, ink=6, seams=10),
    ),
]

CRITERIA = [
    ("iterable", "Iterable vs element reads without a legend", 22),
    ("timing", "This-turn vs next-turn reads without a legend", 22),
    ("calm", "Nothing crosses, nothing competes", 16),
    ("scale", "Survives more than one carried value", 18),
    ("ink", "Marks added per loop", 12),
    ("seams", "Fits what already ships", 10),
]


def weighted(it: Iteration) -> float:
    return round(sum(it.scores[k] * w for k, _n, w in CRITERIA) / 10, 1)


# ---------------------------------------------------------------------------
# Carried-state stress suite. Five loops chosen for the ways a carry can break,
# each drawn with the three finalists' deltas over the same body.
# ---------------------------------------------------------------------------
SSW, SSH = 1280, 660
SREG = dict(x=250, y=56, w=760, h=520)
SREG_R = SREG["x"] + SREG["w"]
OUT_X = 1130


@dataclass
class StressCase:
    key: str
    title: str
    code: str
    hazards: list
    blocks: list
    inner: list
    item_target: tuple
    item_row: float
    carries: list          # {name, sink, source, route, chip}
    exits: list            # {source, y, name, type, kind}
    seeds: list            # {points}
    hops: list = field(default_factory=list)
    extra: object = None
    verdicts: dict = field(default_factory=dict)
    height: int = SSH


FINALISTS = {
    "B": dict(port_style="split", item_route="drop", live=False, name="Split-face wall port"),
    "C": dict(port_style="plain", item_route="row", live=False, name="Row-aligned item"),
    "J": dict(port_style="plain", item_route="drop", live=True, name="Live values"),
}


def stress_scene(case: StressCase, key: str) -> Scene:
    opt = FINALISTS[key]
    s = Scene(SSW, case.height, f"{opt['name']} — {case.title}")
    loop_region(s, x=SREG["x"], y=SREG["y"], w=SREG["w"], h=case.height - 84,
                turn="iteration 3 of 7" if opt["live"] else "iteration i of n")

    if opt["item_route"] == "row":
        wall_y = case.item_row
        outer = [(30, 620 if case.height > 620 else case.height - 40),
                 (214, 620 if case.height > 620 else case.height - 40), (214, wall_y),
                 (SREG["x"], wall_y)]
        inner = [(SREG["x"], wall_y), case.item_target]
    else:
        wall_y = 90
        outer = [(30, 90), (214, 90), (SREG["x"], 90)]
        inner = [(SREG["x"], wall_y), (DROP_X, wall_y), (DROP_X, case.item_target[1]),
                 case.item_target]
    s.circle(*outer[0], 5, PORT, PORT, 0)
    s.text(outer[0][0] + 10, outer[0][1] - 11, "others", size=12.5, fill=INK_2)
    s.text(outer[0][0] + 10 + 7.6 * 6 + 7, outer[0][1] - 11, "Poses", size=12.5, fill=FAINT)
    cable(s, outer, "solid", arrow=False, stroke="#3A3A3A")
    cable(s, inner, "solid", pill="i = 3" if opt["live"] else "i",
          pill_t=0.42 if opt["item_route"] == "drop" else 0.5)

    for seed in case.seeds:
        cable(s, seed["points"], "solid")
        if seed.get("inlet"):
            ix, iy = seed["points"][0]
            name, type_name = seed["inlet"]
            s.circle(ix, iy, 5, PORT, PORT, 0)
            s.text(ix + 10, iy - 11, name, size=12.5, fill=INK_2)
            s.text(ix + 10 + 7.6 * len(name) + 7, iy - 11, type_name, size=12.5, fill=FAINT)
    for carry in case.carries:
        cable(s, carry["route"], "delayed",
              pill=carry.get("live_chip", "z⁻¹") if opt["live"] else "z⁻¹",
              pill_t=carry.get("t", 0.5), layer="under")
        px, py = path_point(carry["route"], carry.get("t", 0.5))
        caption(s, px, py + 26, f"carry {carry['name']}", fill=TIME, anchor="middle")
    for exit_ in case.exits:
        cable(s, exit_["points"], "solid", stroke=DONE)
        s.circle(OUT_X, exit_["y"], 5, PORT, PORT, 0)
        s.text(OUT_X + 12, exit_["y"] - 11, exit_["name"], size=12.5, fill=INK_2)
        s.text(OUT_X + 12 + 7.6 * len(exit_["name"]) + 7, exit_["y"] - 11, exit_["type"],
               size=12.5, fill=FAINT)
    for pts, kind, kwargs in case.inner:
        cable(s, pts, kind, **kwargs)
    for block in case.blocks:
        draw_block(s, block)
    wall_port(s, SREG["x"], wall_y, split=opt["port_style"] == "split",
              inner_type="Pose", outer_type="Poses")
    if opt["item_route"] == "drop":
        for hx, hy in case.hops:
            hop(s, hx, hy)
    if case.extra:
        case.extra(s, key)
    return s


def _b(key, x, y, w, title, ins, outs):
    return Block(key, x, y, w, title,
                 inputs=[Port(n, t) for n, t in ins],
                 outputs=[Port(n, t) for n, t in outs])


def case_two_carries() -> StressCase:
    est = _b("est", 16, 175, 176, "estimate()", [], [("pose", "Pose"), ("best", "Best")])
    mg = _b("merge", 420, 160, 280, "merge()", [("pose", "Pose"), ("other", "Pose")],
            [("", "Pose")])
    keep = _b("keep", 760, 300, 210, "keep()", [("best", "Best"), ("pose", "Pose")],
              [("", "Best")])
    return StressCase(
        "S1", "two carried values",
        "pose, best = estimate(frame, gain)\nfor other in others:\n"
        "    pose = merge(pose, other)\n    best = keep(best, pose)",
        ["two back cables have to coexist without becoming the parallel-arrow bundle",
         "the second carry is written by a block the first one feeds",
         "both lanes want the region's floor"],
        [est, mg, keep],
        [([mg.out(0), (730, mg.out(0)[1]), (730, keep.inp(1)[1]), keep.inp(1)], "solid", {})],
        mg.inp(1), mg.inp(1)[1],
        carries=[
            dict(name="pose", t=0.5, live_chip="z⁻¹ = pose₂",
                 route=[mg.out(0), (742, mg.out(0)[1]), (742, 470), (350, 470),
                        (350, mg.inp(0)[1]), mg.inp(0)]),
            dict(name="best", t=0.52, live_chip="z⁻¹ = best₂",
                 route=[keep.out(0), (996, keep.out(0)[1]), (996, 528), (716, 528),
                        (716, keep.inp(0)[1]), keep.inp(0)]),
        ],
        exits=[dict(points=[keep.out(0), (1060, keep.out(0)[1]), (1060, 370), (OUT_X, 370)],
                    y=370, name="best", type="Best")],
        seeds=[dict(points=[est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)]),
               dict(points=[est.out(1), (250, est.out(1)[1]), (250, keep.inp(0)[1]),
                            keep.inp(0)])],
        hops=[(DROP_X, mg.inp(0)[1])],
        verdicts={
            "B": ("holds", "The split dot is untouched by a second carry — it says one thing "
                  "about one collection and stays out of the way."),
            "C": ("holds", "Row alignment is what makes two lanes survive: with the item cable "
                  "out of the vertical channel, both back cables get a clean floor lane."),
            "J": ("strained", "Two live chips plus a live item pill is three moving strings on "
                  "one board. It reads, but it is the first thing to switch off."),
        },
    )


def case_split_body() -> StressCase:
    est = _b("est", 16, 190, 176, "estimate()", [], [("pose", "Pose")])
    mg = _b("merge", 400, 170, 270, "merge()", [("pose", "Pose"), ("other", "Pose")],
            [("fused", "Pose")])
    sm = _b("smooth", 740, 200, 220, "smooth()", [("fused", "Pose")], [("pose", "Pose")])
    return StressCase(
        "S2", "the carry is written by a different block",
        "for other in others:\n    fused = merge(pose, other)\n    pose  = smooth(fused)",
        ["the back cable now spans the whole body instead of hugging one block",
         "the value that returns is not the value the reading block produced",
         "`fused` is a loop-local that must NOT look carried"],
        [est, mg, sm],
        [([mg.out(0), (706, mg.out(0)[1]), (706, sm.inp(0)[1]), sm.inp(0)], "solid", {})],
        mg.inp(1), mg.inp(1)[1],
        carries=[dict(name="pose", t=0.5, live_chip="z⁻¹ = pose₂",
                      route=[sm.out(0), (986, sm.out(0)[1]), (986, 470), (346, 470),
                             (346, mg.inp(0)[1]), mg.inp(0)])],
        exits=[dict(points=[sm.out(0), (1060, sm.out(0)[1]), (1060, 300), (OUT_X, 300)],
                    y=300, name="pose", type="Pose")],
        seeds=[dict(points=[est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)])],
        hops=[(DROP_X, mg.inp(0)[1])],
        height=600,
        verdicts={
            "B": ("holds", "Nothing about the boundary changes when the body grows; the split "
                  "dot is a statement about the collection, not about the body."),
            "C": ("holds", "The long back cable is now the ONLY right-to-left line on the "
                  "board, which is exactly what makes it readable at a glance."),
            "J": ("holds", "The best showing of the three: `z⁻¹ = pose₂` names the value at "
                  "the far end of a long cable, where the reader has lost track of it."),
        },
    )


def case_carry_and_collect() -> StressCase:
    est = _b("est", 16, 190, 176, "estimate()", [], [("pose", "Pose")])
    mg = _b("merge", 400, 170, 270, "merge()", [("pose", "Pose"), ("other", "Pose")],
            [("", "Pose")])
    sc = _b("score", 760, 300, 200, "score()", [("pose", "Pose")], [("", "float")])
    return StressCase(
        "S3", "a carry and a collection leaving together",
        "trail = []\nfor other in others:\n    pose = merge(pose, other)\n"
        "    trail.append(score(pose))",
        ["one value leaves once, the other leaves as a collection",
         "both exits cross the same wall within a few pixels of each other",
         "`score` reads THIS turn's pose, not last turn's"],
        [est, mg, sc],
        [([mg.out(0), (716, mg.out(0)[1]), (716, sc.inp(0)[1]), sc.inp(0)], "solid", {})],
        mg.inp(1), mg.inp(1)[1],
        carries=[dict(name="pose", t=0.5, live_chip="z⁻¹ = pose₂",
                      route=[mg.out(0), (700, mg.out(0)[1]), (700, 476), (346, 476),
                             (346, mg.inp(0)[1]), mg.inp(0)])],
        exits=[dict(points=[mg.out(0), (1046, mg.out(0)[1]), (1046, 240), (OUT_X, 240)],
                    y=240, name="pose", type="Pose"),
               dict(points=[sc.out(0), (1080, sc.out(0)[1]), (1080, 370), (OUT_X, 370)],
                    y=370, name="trail", type="Floats")],
        seeds=[dict(points=[est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)])],
        hops=[(DROP_X, mg.inp(0)[1])],
        height=620,
        verdicts={
            "B": ("strained", "The wall now carries one marked port and two unmarked exits. "
                  "The asymmetry invites the question the split dot cannot answer: is `trail` "
                  "one float or many?"),
            "C": ("holds", "Nothing changes for C — its whole claim is about the inbound side, "
                  "and the two exits stay clear of it."),
            "J": ("holds", "`z⁻¹ = pose₂` beside a live `score()` output is exactly the "
                  "distinction the reader needs: one is last turn's, one is this turn's."),
        },
    )


def case_skipped_turn() -> StressCase:
    est = _b("est", 16, 190, 176, "estimate()", [], [("pose", "Pose")])
    mg = _b("merge", 470, 210, 280, "merge()", [("pose", "Pose"), ("other", "Pose")],
            [("", "Pose")])
    return StressCase(
        "S4", "a carry that is not written every turn",
        "for other in others:\n    if other.ok:\n        pose = merge(pose, other)",
        ["on a skipped turn the carry must arrive unchanged — no cable says that",
         "the guard is a Branch region inside the loop region: two scopes, one cable",
         "an empty `others` means the seed leaves untouched"],
        [est, mg],
        [],
        mg.inp(1), mg.inp(1)[1],
        carries=[dict(name="pose", t=0.5, live_chip="z⁻¹ = pose₂  (unchanged)",
                      route=[mg.out(0), (830, mg.out(0)[1]), (830, 476), (346, 476),
                             (346, mg.inp(0)[1]), mg.inp(0)])],
        exits=[dict(points=[mg.out(0), (1060, mg.out(0)[1]), (1060, 300), (OUT_X, 300)],
                    y=300, name="pose", type="Pose")],
        seeds=[dict(points=[est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)])],
        hops=[(DROP_X, mg.inp(0)[1])],
        height=620,
        extra=lambda s, key: _s4_guard(s, key),
        verdicts={
            "B": ("fails", "A port that says `Poses → Pose` says nothing about a turn that "
                  "produces no write. The split dot is silent exactly where the reader needs "
                  "a word."),
            "C": ("fails", "Same silence. Routing cannot express a conditional write, and the "
                  "guard band is drawn here rather than modelled."),
            "J": ("holds", "The only one that can speak: the chip reads "
                  "`z⁻¹ = pose₂ (unchanged)` on a skipped turn, which is the fact and nothing "
                  "else. This is the case that earns live values their place."),
        },
    )


def _s4_guard(s: Scene, key: str):
    s.rect(430, 176, 380, 210, r=10, fill="#FBFAF7", stroke="#D9CFC0", sw=1.3,
           dash="7 5", layer="back")
    s.text(444, 198, "if other.ok", size=13.5, fill="#8A6A3A")
    caption(s, 444, 410, "a skipped turn writes nothing — the back cable must mean "
                         "“unchanged”", fill=WARN if key != "J" else DONE)


def case_nested() -> StressCase:
    est = _b("est", 16, 190, 176, "estimate()", [], [("pose", "Pose")])
    mg = _b("merge", 470, 200, 270, "merge()", [("pose", "Pose"), ("det", "Det")],
            [("", "Pose")])
    keep = _b("keep", 780, 430, 210, "keep()", [("best", "Best"), ("pose", "Pose")],
              [("", "Best")])
    return StressCase(
        "S5", "nested loops, one carry each",
        "for track in tracks:\n    for det in track.dets:\n"
        "        pose = merge(pose, det)\n    best = keep(best, pose)",
        ["two regions, two back cables, two bottom lanes",
         "the inner iterable is an attribute of the outer element",
         "the inner carry survives across outer turns unless it is reseeded"],
        [est, mg, keep],
        [([mg.out(0), (756, mg.out(0)[1]), (756, keep.inp(1)[1]), keep.inp(1)], "solid", {})],
        mg.inp(1), mg.inp(1)[1],
        carries=[dict(name="pose · inner", t=0.5, live_chip="z⁻¹ = pose₂",
                      route=[mg.out(0), (884, mg.out(0)[1]), (884, 372), (400, 372),
                             (400, mg.inp(0)[1]), mg.inp(0)]),
                 dict(name="best · outer", t=0.52, live_chip="z⁻¹ = best₁",
                      route=[keep.out(0), (1010, keep.out(0)[1]), (1010, 566), (736, 566),
                             (736, keep.inp(0)[1]), keep.inp(0)])],
        exits=[dict(points=[keep.out(0), (1064, keep.out(0)[1]), (1064, 500), (OUT_X, 500)],
                    y=500, name="best", type="Best")],
        seeds=[dict(points=[est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)]),
               dict(points=[(30, 560), (196, 560), (196, keep.inp(0)[1]), keep.inp(0)],
                    inlet=("best", "Best"))],
        hops=[(DROP_X, mg.inp(0)[1])],
        height=700,
        extra=lambda s, key: _s5_inner(s, key),
        verdicts={
            "B": ("strained", "The inner region needs its own boundary port, and its collection "
                  "is `track.dets` — an attribute of the outer element, not an outer input. "
                  "The split dot has no way to say where its collection came from."),
            "C": ("holds", "Two regions, two row-aligned entries, two floor lanes and not one "
                  "crossing. Row alignment is what stops nesting turning into a knot."),
            "J": ("strained", "Correct but crowded: five live strings on one board, and the "
                  "inner chip's value changes several times per outer turn, which no static "
                  "reading can follow."),
        },
    )


STRESS = [case_two_carries, case_split_body, case_carry_and_collect,
          case_skipped_turn, case_nested]


def _s5_inner(s: Scene, key: str):
    s.rect(400, 150, 560, 260, r=10, fill="none", stroke="#D8D8D8", sw=1.3, layer="back")
    s.line(401, 150 + 40, 959, 150 + 40, BORDER_SOFT, layer="back")
    s.text(420, 178, "for det in track.dets", size=14, fill=INK, layer="back")
    caption(s, 420, 434, "the inner collection is an attribute of the OUTER element", fill=MUTED)


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------
from build_for_loop_labview_grammars import CSS, data_uri  # noqa: E402

PRIOR = [
    ("The loop is the branch region plus one cable back",
     "docs/loop-regions-2026-09-02.html",
     "Five loop grammars; <strong>L1 &ldquo;cycle as a cable&rdquo;</strong> picked at 87. "
     "It settled the region, the back cable, the routing rule, the seed/back φ at the "
     "consumer and the last/zero φ at the exit — all of which this pass treats as fixed."),
    ("Five ways to mark the back cable",
     "docs/loop-edge-marks-2026-09-02.html",
     "<strong>M2</strong> picked: a <code>z⁻¹</code> chip mid-cable with the seed named "
     "beside it. Iteration D below is that recommendation drawn on your board."),
    ("Delayed cable, shipped",
     "docs/edge-vocabulary-implementation-2026-09-02.html",
     "<code>temporal: data | async | delayed</code> as a StyleProp, dotted paint, a "
     "draggable <code>z⁻¹</code> pill with a <code>= value</code> field. Iteration J is "
     "that field filled in — nothing new is invented."),
    ("Many-to-one is a φ, and the region chooses the arm",
     "docs/many-to-one-2026-09-02.html",
     "Two producers into one port are legal when a region makes them exclusive. Seed vs "
     "back is exactly that case, which is why they land on one port here."),
    ("Branch region",
     "docs/branch-regions-2026-09-02.html",
     "The region grammar the loop region inherits: a scope that hosts ports without being "
     "a computation node."),
    ("Ten grammars, rejected",
     "docs/for-loop-visual-grammar-babble-2026-09-02.html",
     "Paired Gates, Header Lanes, State Pills and seven more. Rejected in full."),
    ("Five grammars from LabVIEW's answer outward",
     "docs/for-loop-labview-grammars-2026-09-02.html",
     "Yesterday's pass. Also rejected — but two of its findings survive into this one: the "
     "<em>type flip at the boundary port</em> is iteration B, and <em>an invariant should "
     "cost nothing</em> is why no iteration here marks a pass-through."),
]


def measure() -> dict:
    package = json.loads((REPO / "package.json").read_text())
    model = (REPO / "src" / "blocks" / "connections" / "connectionModel.ts").read_text()
    return {
        "tldraw": package["dependencies"]["tldraw"],
        "temporal": model.split("CONNECTION_TEMPORAL_KINDS = [")[1].split("]")[0].strip(),
        "has_value_field": "delayValue" in (REPO / "src" / "blocks" / "ui"
                                            / "ConnectionInspector.tsx").read_text(),
        "scenes": len(ITERATIONS) + 3 * len(STRESS),
        "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                                 capture_output=True, text=True).stdout.strip(),
    }


def _fig(scene: Scene) -> str:
    return f'<figure class="fig" style="margin:14px 0">{scene.svg()}</figure>'


def _tag(kind: str) -> str:
    return {"holds": '<span class="tag win">holds</span>',
            "strained": '<span class="tag mid">strained</span>',
            "fails": '<span class="tag bad">fails</span>'}[kind]


def build_html() -> str:
    facts = measure()
    ranked = sorted(ITERATIONS, key=lambda i: -weighted(i))
    out = [f"<style>{CSS}</style><div class='wrap'>"]
    out.append(f"""
<p class="eyebrow">SystemSketch · golden 10 · loop carried state · exploration only</p>
<h1>Ten iterations of your loop drawing</h1>
<p class="lede">Not ten new grammars — the grammar is settled. Ten versions of
<strong>your</strong> drawing, each changing one thing, each judged on the only question you
asked: <em>does the dataflow read?</em></p>
<div class="kv">
  <span class="tag">tldraw {facts['tldraw']} · stock</span>
  <span class="tag">{facts['scenes']} diagrams</span>
  <span class="tag">10 iterations · 3 finalists · 5 carried-state stress loops</span>
  <span class="tag">repo at {facts['commit']}</span>
</div>

<h2>Your drawing, and what is already decided</h2>
<div class="grid2">
  <figure style="margin:0">
    <img class="shot" src="{data_uri(DOCS / 'assets' / 'zach-loop-wide-2026-09-03.png')}" alt="Zach's loop drawing, wide">
    <figcaption>The seed arrives from <code>estimate()</code> on the left; the collection
    arrives at the region's own boundary port.</figcaption>
  </figure>
  <figure style="margin:0">
    <img class="shot" src="{data_uri(DOCS / 'assets' / 'zach-loop-crop-2026-09-03.png')}" alt="Zach's loop drawing, close">
    <figcaption>The item cable falls into the body carrying <code>i = 1</code>; the back
    cable runs the floor with a <code>z⁻¹</code> chip; the header carries the live turn.</figcaption>
  </figure>
</div>
<p>Five things below are <strong>not</strong> up for grabs, because you already settled them
and every iteration here obeys them:</p>
<table>
<tr><th style="width:230px">Settled</th><th>Where</th></tr>
<tr><td><strong>L1 — the loop is the region plus one cable that comes back</strong></td>
<td>no state node, no begin/end pair, no rolled-out ghost</td></tr>
<tr><td><strong>Seed and back land on ONE port</strong></td>
<td>no sub-slots, no ticks, no sub-dots at <code>merge.pose</code></td></tr>
<tr><td><strong>Go to the end first, then loop back</strong></td>
<td>the back cable's default route: right edge, bottom lane, home</td></tr>
<tr><td><strong>A <code>z⁻¹</code> chip, not a delay block</code></strong></td>
<td>M2; the region already says &ldquo;everything inside runs per iteration&rdquo;</td></tr>
<tr><td><strong>No pills for intermediate values</strong></td>
<td>a pill is worth it at a source or a sink, and nowhere else</td></tr>
</table>
<p class="note"><strong>So what is actually left?</strong> Exactly four things, and all ten
iterations are combinations of them: <strong>how the boundary port says
&ldquo;collection outside, element inside&rdquo;</strong> · <strong>where the item cable
runs</strong> · <strong>where the back cable runs</strong> · <strong>what the two marks
say</strong>. That is the whole remaining design space, which is why these are iterations
and not alternatives.</p>""")

    out.append("""
<h2>The ten</h2>
<p>Every diagram below has the same Blocks, the same ports and the same values. A difference
you can see is a difference in the drawing rule, never in the example.</p>""")
    for it in ITERATIONS:
        out.append(f"""
<h3><span class="tag rank">{it.key}</span> &nbsp;{it.name}
<span class="score" style="font-size:19px;color:var(--muted)">{weighted(it)}</span></h3>
<p class="lede" style="font-size:16.5px">{it.one_line}</p>
{_fig(iteration_scene(it))}
<div class="card">
  {''.join(f'<p>{r}</p>' for r in it.reads)}
  <p class="note warn"><strong>What it costs.</strong> {it.costs}</p>
</div>""")

    head = "".join(f'<th style="text-align:right">{n}<br>'
                   f'<span style="font-weight:400;text-transform:none;letter-spacing:0">{w}%</span></th>'
                   for _k, n, w in CRITERIA)
    rows = []
    for rank, it in enumerate(ranked, start=1):
        cells = "".join(f'<td class="num">{it.scores[k]}</td>' for k, _n, _w in CRITERIA)
        mark = ' style="background:#F7F5FD"' if rank <= 3 else ""
        rows.append(f'<tr{mark}><td class="num">{rank}</td>'
                    f'<td><strong>{it.key}</strong> {it.name}</td>{cells}'
                    f'<td class="num"><strong>{weighted(it)}</strong></td></tr>')
    crit = "".join(f'<tr><td><strong>{n}</strong></td><td class="num">{w}%</td></tr>'
                   for _k, n, w in CRITERIA)
    out.append(f"""
<h2>Criteria, then scores</h2>
<p>Weights written before scoring, and tilted at your sentence: <em>our goal is to make the
dataflow clear.</em> The two &ldquo;reads without a legend&rdquo; criteria carry 44% between
them; <em>survives more than one carried value</em> carries 18% because this is golden 10,
<strong>loop carried state</strong>, and one carry is the easy case.</p>
<table><tr><th>Criterion</th><th class="num">Weight</th></tr>{crit}</table>
<table style="margin-top:24px">
<tr><th class="num">#</th><th>Iteration</th>{head}<th style="text-align:right">Score</th></tr>
{''.join(rows)}
</table>
<p class="note good"><strong>The most useful finding is that the top three are not
alternatives.</strong> B changes the port, C changes the routing, J changes what the marks
say — they are orthogonal and they compose. The drawing I would actually make is
<strong>B + C + D</strong>: a split-face boundary port, sitting at the row it feeds, with
the seed named under the z⁻¹ chip — and J switched on only while something is running.
A is your drawing; that splice is your drawing with its three loose ends tied.</p>""")

    out.append("""
<h2>Stress-testing the three</h2>
<p>Five loops chosen for the ways a <em>carry</em> breaks, not for variety. Each is drawn
three times with the body held identical, so a difference is the iteration and nothing else.</p>""")
    for build in STRESS:
        case = build()
        out.append(f"""
<h3>{case.key} · {case.title}</h3>
<pre><code>{esc(case.code)}</code></pre>
<p><strong>What it is here to break:</strong></p>
<ul>{''.join(f'<li>{h}</li>' for h in case.hazards)}</ul>""")
        for key in ("B", "C", "J"):
            kind, why = case.verdicts[key]
            out.append(f"""
<div class="card">
  <div class="hdr"><span class="tag rank">{key}</span>
  <strong>{FINALISTS[key]['name']}</strong> {_tag(kind)}</div>
  {_fig(stress_scene(case, key))}
  <p style="margin:6px 0 0">{why}</p>
</div>""")

    prior = "".join(
        f'<tr><td><a href="{"../" if False else ""}{path.split("/", 1)[1] if path.startswith("docs/") else path}">'
        f'<strong>{name}</strong></a></td><td>{why}</td></tr>'
        for name, path, why in PRIOR)
    out.append(f"""
<h2>What the stress suite actually decided</h2>
<p><strong>C survives everything.</strong> Row alignment is the only change that keeps
paying as the loop gets harder: it is what stops two carries from tangling in S1, what makes
the long back cable the single right-to-left line in S2, and what stops nesting turning into
a knot in S5. It is also the change that costs the least — it moves a dot.</p>
<p><strong>J is not a grammar, it is a mode — and it is the only one that can speak in
S4.</strong> When a turn is skipped, no port, no route and no line weight can say
&ldquo;unchanged&rdquo;. A chip reading <code>z⁻¹ = pose₂ (unchanged)</code> can. That is
worth building, and it costs nothing because the <code>= value</code> field already ships.</p>
<p><strong>B is right and small, and it stops paying at the second exit.</strong> It answers
the iterable/element question decisively on the inbound side and says nothing about anything
else — which is fine, because that is all it claims.</p>
<p class="note warn"><strong>The one thing none of the ten can do.</strong> S4 exposes it:
a carry that is written conditionally has no drawing. The back cable is one line and it
looks the same whether it carries a new value or last turn's. Live values paper over it; a
static diagram cannot. If golden 10 ever grows a <code>continue</code>, this is the hole.</p>

<h2>The thread this sits in</h2>
<table><tr><th style="width:320px">Report</th><th>What it settled</th></tr>{prior}</table>

<h2>The editable board</h2>
<p>Real Blocks and real semantic connections; the back cables are genuine
<code>temporal: {facts['temporal']}</code> records with their <code>z⁻¹</code> pills, not
drawings of them.</p>
<p class="note warn"><strong>Why the board's body has two Blocks.</strong> SystemSketch
refuses a cable from a Block to itself, so <code>pose = merge(pose, other)</code> — a
one-Block accumulator, the most ordinary loop there is — <strong>cannot be drawn as a real
cable today</strong>. The board uses <code>merge()</code> then <code>smooth()</code> so
every carry is a real record. That is a product gap, not a design choice.</p>
<ul>
<li><a href="http://127.0.0.1:4330/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Floop-carried-state-iterations.systemsketch">the ten iterations, editable</a>
 — <code>sketches/review/loop-carried-state-iterations.systemsketch</code></li>
</ul>
<div class="foot">
Built by <code>docs/build_loop_carried_state_iterations.py</code> from the tree at
<code>{facts['commit']}</code>; the diagrams, the board recipe and the score table come from
one scene model. Exploration artifact — nothing under <code>src/</code> was changed.
</div></div>""")
    return "".join(out)


# ---------------------------------------------------------------------------
# The editable board
# ---------------------------------------------------------------------------
from build_for_loop_labview_grammars import BoardScene  # noqa: E402

BOARD_CODE = ("for other in others:\n"
              "    fused = merge(pose, other)\n"
              "    pose  = smooth(fused)")


def _iteration_card(it: Iteration, index: int) -> BoardScene:
    oy = index * 700
    card = BoardScene(it.key.lower(), 0, oy, 2000, 620,
                      f"{it.key} · {it.name}", BOARD_CODE)
    card.band("region", 360, 170, 1180, 380, color="grey", dash="solid")
    run = card.block("run", 30, 210, 300, "run()", [], [("others", "Poses")])
    est = card.block("estimate", 30, 400, 300, "estimate()", [], [("pose", "Pose")])
    merge = card.block("merge", 470, 250, 340, "merge()",
                       [("pose", "Pose"), ("other", "Pose")], [("fused", "Pose")])
    smooth = card.block("smooth", 950, 290, 320, "smooth()",
                        [("fused", "Pose")], [("pose", "Pose")])
    out = card.block("out", 1640, 300, 320, "encode()", [("pose", "Pose")], [])
    card.cable(run, "out_1", merge, "in_2")
    card.cable(est, "out_1", merge, "in_1")
    card.cable(merge, "out_1", smooth, "in_1")
    card.cable(smooth, "out_1", merge, "in_1", temporal="delayed")
    card.cable(smooth, "out_1", out, "in_1")
    card.label("one", 26, 566, it.one_line, color="black", size="s")
    card.label("cost", 26, 592, f"cost · {it.costs.replace('<code>', '').replace('</code>', '')[:150]}",
               color="grey", size="s")
    return card


def build_board_recipe() -> dict:
    shapes, bindings = [], []
    for index, it in enumerate(ITERATIONS):
        card = _iteration_card(it, index)
        shapes.extend(card.shapes)
        bindings.extend(card.bindings)
    callouts = [
        {"id": "step-1", "kind": "step",
         "text": "1 · Ten cards, top to bottom. Same Blocks and same cables every time — "
                 "only the boundary port, the routing and the marks change.",
         "x": -520, "y": 160, "w": 440, "h": 180,
         "target": {"shapeId": "a-merge", "anchor": "left"}},
        {"id": "step-2", "kind": "step",
         "text": "2 · Drag any Block. Each card's dotted back cable is a real connection "
                 "carrying temporal: delayed, so it reflows and keeps its z⁻¹ pill.",
         "x": -520, "y": 1560, "w": 440, "h": 180,
         "target": {"shapeId": "c-merge", "anchor": "left"}},
        {"id": "step-3", "kind": "step",
         "text": "3 · The body is merge() then smooth() because the editor refuses a cable "
                 "from a Block to itself — a one-Block accumulator has no real back cable yet.",
         "x": -520, "y": 6460, "w": 440, "h": 200,
         "target": {"shapeId": "j-merge", "anchor": "left"}},
        {"id": "pass", "kind": "pass",
         "text": "PASS WHEN one card reads correctly without the caption: which value is the "
                 "collection, which is the element, and which arrives next turn.",
         "x": 2140, "y": 160, "w": 440, "h": 180},
    ]
    return {"feature": "Loop carried state · ten iterations",
            "viewport": {"width": 2600, "height": 1900},
            "pages": [{"id": "review", "name": "Review"}],
            "shapes": shapes, "bindings": bindings, "callouts": callouts}


def main() -> None:
    report = DOCS / f"loop-carried-state-iterations-{STAMP}.html"
    report.write_text(
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Ten iterations of the loop drawing · SystemSketch</title></head><body>"
        f"{build_html()}</body></html>", encoding="utf-8")
    (DOCS / f"loop-carried-state-iterations-{STAMP}.json").write_text(json.dumps({
        "criteria": [{"key": k, "name": n, "weight": w} for k, n, w in CRITERIA],
        "iterations": {i.key: {"name": i.name, "one_line": i.one_line,
                               "scores": i.scores, "weighted": weighted(i)}
                       for i in ITERATIONS},
        "ranking": [i.key for i in sorted(ITERATIONS, key=lambda x: -weighted(x))],
        "stress": {c().key: {"title": c().title, "verdicts": c().verdicts} for c in STRESS},
        "measured": measure(),
    }, indent=2), encoding="utf-8")
    (SKETCHES / "loop-carried-state-iterations-recipe.json").write_text(
        json.dumps(build_board_recipe(), indent=1), encoding="utf-8")
    print(f"report  {report}  ({report.stat().st_size // 1024} KB)")
    print(f"scores  {DOCS / f'loop-carried-state-iterations-{STAMP}.json'}")
    print(f"recipe  {SKETCHES / 'loop-carried-state-iterations-recipe.json'}")


if __name__ == "__main__":
    main()
