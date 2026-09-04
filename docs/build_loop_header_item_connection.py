#!/usr/bin/env python3
"""
Ten ways to draw the one connection still open in golden 10.

Everything else about the loop is now settled by Zach's own calls:

  * the header is an OPERATOR — the iterable feeds INTO it, exactly as the
    controlling value feeds a Branch header; it does not pass through;
  * the header therefore has a real `Iterable` inlet port and a real item
    outlet port, because the drawing has to stay hackable and wirable;
  * the title is CENTRED;
  * the zero-iterations cable is always drawn and TRANSPARENT, because it and
    the last-value cable are a φ and only one can be live;
  * the back cable is dotted, `z⁻¹` on the bottom lane.

The one open question: what does the run from that item port to `merge.other`
actually look like? That is the only thing that varies below.

Run:  python3 docs/build_loop_header_item_connection.py
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
    SANS, SUNKEN, SURFACE, TIME, WARN, CSS, data_uri,
    Block, Port, Scene, cable, caption, chip, draw_block, esc, hop, path_point,
    BoardScene,
)

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
SKETCHES = REPO / "sketches" / "review"
STAMP = "2026-09-03"

SW, SH = 1260, 560
REG = dict(x=250, y=48, w=680, h=430)
REG_R = REG["x"] + REG["w"]
REG_B = REG["y"] + REG["h"]
HEAD_H = 62
FOOT_H = 38
LANE_Y = 404
GHOST = 0.28          # the faded φ arm: drawn always, live only sometimes


def header_region(s: Scene, title="For Loop", turn="iteration 3 of 7",
                  x=None, y=None, w=None, h=None, head=HEAD_H, foot=FOOT_H):
    """The loop scope. Title CENTRED, because the header is an operator and an
    operator's name belongs over the middle of it, not tucked in a corner."""
    x = REG["x"] if x is None else x
    y = REG["y"] if y is None else y
    w = REG["w"] if w is None else w
    h = REG["h"] if h is None else h
    s.rect(x, y, w, h, r=12, fill="#FCFCFC", stroke="#E4E4E4", sw=1.3, layer="back")
    s.line(x + 1, y + head, x + w - 1, y + head, BORDER_SOFT, layer="back")
    if foot:
        s.line(x + 1, y + h - foot, x + w - 1, y + h - foot, BORDER_SOFT, layer="back")
        s.text(x + w - 18, y + h - foot + 25, "⋮", size=13, fill=FAINT,
               anchor="middle", layer="back")
    s.text(x + w / 2, y + 38, title, size=25, fill=INK, anchor="middle", layer="back")
    if turn:
        width = 11 * 0.63 * len(turn) + 22
        s.rect(x + w - 20 - width, y + 12, width, 24, r=12, fill="#F2EFFB",
               stroke=TIME, sw=1.1, layer="back")
        s.text(x + w - 20 - width / 2, y + 28, turn, size=11.5, fill=TIME,
               anchor="middle", weight="600", family=MONO, layer="back")
    return dict(head=y + head, foot=y + h - foot)


def iterable_inlet(s: Scene, x, y, label="Iterable"):
    """The collection lands ON the header — the Branch move, applied to a loop."""
    s.circle(x, y, 6.5, PORT, PORT, 0, layer="over")
    s.text(x + 15, y + 4.5, label, size=12.5, fill=INK_2, layer="over")
    return (x, y)


def item_outlet(s: Scene, x, y, label="Iter", hollow=True, anchor="start"):
    """The port the header emits the current element from. A real port, because
    the drawing has to stay wirable — never something purely derived."""
    if hollow:
        s.circle(x, y, 6.5, SURFACE, PORT, 2, layer="over")
    else:
        s.circle(x, y, 6.5, PORT, PORT, 0, layer="over")
    if label:
        dx = 15 if anchor == "start" else -15
        s.text(x + dx, y + 4.5, label, size=12, fill=MUTED, anchor=anchor, layer="over")
    return (x, y)


@dataclass
class Variant:
    key: str
    name: str
    one_line: str
    reads: list = field(default_factory=list)
    costs: str = ""
    scores: dict = field(default_factory=dict)


def _blocks():
    est = Block("estimate", 16, 210, 176, "estimate()", inputs=[], outputs=[Port("", "Pose")])
    mg = Block("merge", 450, 200, 330, "merge()",
               inputs=[Port("pose", "Pose"), Port("other", "Pose")],
               outputs=[Port("", "Pose")])
    enc = Block("encode", 1010, 240, 200, "encode()",
                inputs=[Port("pose", "Pose")], outputs=[])
    return est, mg, enc


def _frame(s: Scene, turn="iteration 3 of 7"):
    """Everything that is settled, drawn identically in all ten."""
    header_region(s, turn=turn)
    est, mg, enc = _blocks()
    s.circle(30, 76, 5, PORT, PORT, 0)
    s.text(40, 65, "others", size=12.5, fill=INK_2)
    s.text(40 + 7.6 * 6 + 7, 65, "Poses", size=12.5, fill=FAINT)
    cable(s, [(30, 76), (REG["x"], 76)], "solid", arrow=False, stroke="#3A3A3A")
    cable(s, [est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)], "solid")
    back = [mg.out(0), (880, mg.out(0)[1]), (880, LANE_Y), (356, LANE_Y),
            (356, mg.inp(0)[1]), mg.inp(0)]
    cable(s, back, "delayed", pill="z⁻¹", pill_t=0.5, layer="under")
    cable(s, [mg.out(0), (960, mg.out(0)[1]), (960, enc.inp(0)[1]), enc.inp(0)],
          "solid", stroke=DONE)
    zero = [est.out(0), (206, est.out(0)[1]), (206, 512), (980, 512),
            (980, enc.inp(0)[1]), enc.inp(0)]
    cable(s, zero, "solid", stroke=DONE, layer="under", opacity=GHOST)
    caption(s, 420, 506, "zero iterations · always drawn, faded — only one arm of the φ is live",
            fill=DONE)
    iterable_inlet(s, REG["x"], 76)
    return est, mg, enc


def _finish(s: Scene, est, mg, enc, drop_x=None):
    if drop_x is not None:
        hop(s, drop_x, mg.inp(0)[1])
    draw_block(s, est)
    draw_block(s, mg)
    draw_block(s, enc)


HEAD_Y = REG["y"] + HEAD_H          # the header's bottom edge — where the item leaves


def scene_a() -> Scene:
    """A — the drop as you drew it: dotted, with an `i =` pill."""
    s = Scene(SW, SH, "Dotted drop")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y)
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "delayed", pill="i = 3",
          pill_t=0.3, stroke=INK, pill_ink=INK_2)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_b() -> Scene:
    """B — the same run, solid. Dotted already means one turn late."""
    s = Scene(SW, SH, "Solid drop")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y)
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "solid", pill="i = 3", pill_t=0.3)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_c() -> Scene:
    """C — a source pill at the port, then an ordinary cable."""
    s = Scene(SW, SH, "Source pill at the port")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y, label="")
    cable(s, [port, (286, 152)], "solid", arrow=False)
    width = chip(s, 286 - 62, 152, "other · Pose", fill=SUNKEN, ink=INK, size=12)
    cable(s, [(286, 173), (286, mg.inp(1)[1]), mg.inp(1)], "solid")
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_d() -> Scene:
    """D — solid with a cadence tick every 26px: one element per turn."""
    s = Scene(SW, SH, "Cadence ticks")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y)
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "solid", ticks=True)
    caption(s, 302, 200, "one tick, one turn", fill=MUTED)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_e() -> Scene:
    """E — half-weight line. A rate mark, not a time mark."""
    s = Scene(SW, SH, "Half-weight line")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y)
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "solid", width=1.0)
    caption(s, 302, 200, "thinner than a data cable · one value, not a collection", fill=MUTED)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_f() -> Scene:
    """F — ghost fan: the same cable, faded, twice behind itself."""
    s = Scene(SW, SH, "Ghost fan")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y)
    for offset, alpha in ((22, 0.22), (11, 0.34)):
        cable(s, [(port[0] + offset, port[1]), (286 + offset, mg.inp(1)[1] + offset),
                  (mg.inp(1)[0], mg.inp(1)[1] + offset)], "solid", layer="under",
              opacity=alpha, arrow=False)
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "solid")
    caption(s, 320, 348, "N of these, one at a time", fill=MUTED)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_g() -> Scene:
    """G — a stub and a named cap at each end. No long cable at all."""
    s = Scene(SW, SH, "Named cap stub")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y, label="")
    cable(s, [port, (286, 146)], "solid", arrow=False)
    chip(s, 286 - 34, 146, "other", fill=SURFACE, stroke=INK, ink=INK, size=12)
    chip(s, mg.inp(1)[0] - 96, mg.inp(1)[1] - 10, "other", fill=SURFACE, stroke=INK,
         ink=INK, size=12)
    cable(s, [(mg.inp(1)[0] - 26, mg.inp(1)[1]), mg.inp(1)], "solid")
    _finish(s, est, mg, enc)
    return s


def scene_h() -> Scene:
    """H — the port slides along the header to sit above its consumer."""
    s = Scene(SW, SH, "Port above the consumer")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 426, HEAD_Y, label="Iter", anchor="end")
    cable(s, [port, (426, mg.inp(1)[1]), mg.inp(1)], "solid", pill="i = 3", pill_t=0.34)
    _finish(s, est, mg, enc, drop_x=426)
    return s


def scene_i() -> Scene:
    """I — the port carries the TYPE, the cable carries the NAME."""
    s = Scene(SW, SH, "Type on the port, name on the cable")
    est, mg, enc = _frame(s)
    port = item_outlet(s, 286, HEAD_Y, label="Pose")
    cable(s, [port, (286, mg.inp(1)[1]), mg.inp(1)], "solid")
    caption(s, 302, 196, "other", fill=INK_2)
    caption(s, 302, 212, "the header's port says the type; the cable says the binding",
            fill=MUTED)
    _finish(s, est, mg, enc, drop_x=286)
    return s


def scene_j() -> Scene:
    """J — the header read as one operator row: Iterable ▸ Iter."""
    s = Scene(SW, SH, "Operator row")
    est, mg, enc = _frame(s)
    s.text(REG["x"] + 116, 81, "▸", size=15, fill=FAINT)
    port = item_outlet(s, REG["x"] + 146, 76, label="Iter")
    cable(s, [port, (REG["x"] + 146, mg.inp(1)[1]), mg.inp(1)], "solid",
          pill="i = 3", pill_t=0.3)
    _finish(s, est, mg, enc, drop_x=REG["x"] + 146)
    return s


VARIANTS = [
    Variant("A", "Dotted drop", "Your drawing: the item falls from the header on a dotted line carrying `i =`.",
            reads=["The dotted line matches what you already drew, and it does read as "
                   "&ldquo;this is not an ordinary cable&rdquo;.",
                   "The <code>i =</code> pill sits where the eye lands first, at the top of "
                   "the drop."],
            costs="Dotted is already spoken for. It means <strong>one turn late</strong> — the "
                  "back cable on the same board is dotted. Here it means <em>one per turn</em>, "
                  "which is a different fact, and the reader has two dotted lines meaning two "
                  "things.",
            scores=dict(distinct=4, honest=6, calm=8, scale=7, wirable=9, seams=9)),
    Variant("B", "Solid drop", "The same run, drawn solid. The item is this turn's value, so it is ordinary data.",
            reads=["The item genuinely <em>is</em> ordinary data inside the region: it is "
                   "available now, in this turn, like anything else in the body.",
                   "It frees dotted to mean exactly one thing on the whole board, which is "
                   "what makes the back cable legible."],
            costs="Nothing distinguishes the item cable from the seed cable, so the reader "
                  "learns the difference from the <em>port</em> it comes from rather than from "
                  "the cable. Which may be correct — but it is a decision, not an accident.",
            scores=dict(distinct=5, honest=10, calm=10, scale=9, wirable=10, seams=10)),
    Variant("C", "Source pill at the port", "A source pill `other · Pose` right at the header, then an ordinary cable.",
            reads=["This is <em>your own pill rule</em> applied: a pill is worth it at a source "
                   "or a sink, and the header's item port is a source.",
                   "It names the binding once, at the place it is created, and the cable stays "
                   "an ordinary cable all the way down."],
            costs="It is a second object on a board that is already dense at the top-left, and "
                  "it re-opens the &ldquo;text on a cable interferes&rdquo; question one row "
                  "lower down.",
            scores=dict(distinct=8, honest=9, calm=7, scale=8, wirable=9, seams=8)),
    Variant("D", "Cadence ticks", "Solid, with a short cross-tick every few pixels: one tick, one turn.",
            reads=["A tick is a <em>rate</em> mark, and rate is exactly what is different about "
                   "this cable. It cannot be confused with the delay's dots because dots are "
                   "absence of line and ticks are extra line.",
                   "It survives a short run — one or two ticks still read — which was your own "
                   "gate on the async rail."],
            costs="It is a new line decoration in a grammar that already has solid, dashed "
                  "(async) and dotted (delayed). A fourth is a real cost, and at low zoom ticks "
                  "and dashes converge.",
            scores=dict(distinct=9, honest=9, calm=7, scale=8, wirable=10, seams=6)),
    Variant("E", "Half-weight line", "The item cable is drawn at half the weight of a data cable. Nothing else changes.",
            reads=["Weight is free — nothing else in the grammar uses it — and it reads "
                   "instantly at any zoom without a legend.",
                   "It says &ldquo;one value&rdquo; against the thick cable's &ldquo;a whole "
                   "collection&rdquo; arriving at the header just above it, which is the "
                   "comparison the reader is already making."],
            costs="Line weight is the one axis a whiteboard user will change by hand for "
                  "emphasis, so it is the least stable channel to put meaning in.",
            scores=dict(distinct=7, honest=8, calm=10, scale=8, wirable=10, seams=7)),
    Variant("F", "Ghost fan", "The cable is solid, with two faded copies fanning behind it into the same port.",
            reads=["It draws the actual fact — there are N of these and they arrive one at a "
                   "time — instead of encoding it in a line style.",
                   "It reuses the transparency you just chose for the zero-iterations arm, so "
                   "faded already means &ldquo;real but not live right now&rdquo; on this board."],
            costs="Three lines where there is one value is exactly the parallel-arrow bundle "
                  "you rejected at the start of this whole thread. It is here because it is the "
                  "honest opposite of a line style, not because I would ship it.",
            scores=dict(distinct=9, honest=7, calm=3, scale=4, wirable=6, seams=6)),
    Variant("G", "Named cap stub", "A stub off the header ending in a labelled cap, and a matching cap at the consumer. No long cable.",
            reads=["The top-left of the region stops being a junction. Two small caps replace a "
                   "run that has to cross the whole body.",
                   "It scales: five consumers of the item cost five caps, not five cables."],
            costs="It breaks the one thing you said you wanted — <em>wire and show it</em>. A "
                  "named net is not a cable you can drag, and the eye has to match two words "
                  "instead of following a line.",
            scores=dict(distinct=7, honest=5, calm=9, scale=9, wirable=2, seams=5)),
    Variant("H", "Port above the consumer", "The item port slides along the header to sit directly above the port it feeds.",
            reads=["The drop becomes short and almost vertical, so the connection reads as "
                   "&ldquo;this port feeds that port&rdquo; with no travel in between.",
                   "It leaves the header's top-left clear for the <code>Iterable</code> inlet, "
                   "which is the thing a reader should meet first."],
            costs="The port's x is now a consequence of the body's layout: move "
                  "<code>merge()</code> and either the port follows or the alignment is lost. "
                  "It also implies an ordering on the header that does not exist.",
            scores=dict(distinct=6, honest=9, calm=10, scale=6, wirable=10, seams=8)),
    Variant("I", "Type on the port, name on the cable", "The port says `Pose`; the cable says `other`. Your question, answered.",
            reads=["You asked whether the port name should be drawn differently, and whether we "
                   "are just showing types. This splits them: the <strong>port</strong> is a "
                   "typed socket, the <strong>cable</strong> is the binding that flows through it.",
                   "It matches how every other port on the board already reads — "
                   "<code>pose Pose</code> is name-then-type — with the two halves separated by "
                   "the wall instead of by a space."],
            costs="Text on a cable is the interference you already flagged as a problem for "
                  "another day, and this makes that day today.",
            scores=dict(distinct=7, honest=10, calm=7, scale=7, wirable=10, seams=8)),
    Variant("J", "Operator row", "`Iterable ▸ Iter` side by side on one header line: the header read as an operator with an in and an out.",
            reads=["This is your own sentence made literal — <em>I consider the for-loop header "
                   "as kind of an operator</em>. An operator has an input and an output, and "
                   "here they sit on one line with the arrow between them.",
                   "It also puts the two ports where a Branch puts its control input, so the "
                   "two regions read the same way."],
            costs="The header line now carries the title, the turn chip and two ports. With a "
                  "second iterable (<code>zip</code>) or a tuple unpack it needs a second row, "
                  "and the header starts becoming a layout language.",
            scores=dict(distinct=8, honest=10, calm=8, scale=7, wirable=10, seams=9)),
]

SCENES = {"A": scene_a, "B": scene_b, "C": scene_c, "D": scene_d, "E": scene_e,
          "F": scene_f, "G": scene_g, "H": scene_h, "I": scene_i, "J": scene_j}

CRITERIA = [
    ("distinct", "Tells the item cable apart from every other cable", 24),
    ("honest", "Says the true fact — one per turn, not one turn late", 22),
    ("calm", "Adds nothing the board has to carry twice", 16),
    ("scale", "Survives two consumers, zip, and nesting", 16),
    ("wirable", "Stays a real port on a real cable you can drag", 12),
    ("seams", "Fits what already ships", 10),
]


def weighted(v: Variant) -> float:
    return round(sum(v.scores[k] * w for k, _n, w in CRITERIA) / 10, 1)


# ---------------------------------------------------------------------------
# The item run, factored out so the hard cases can reuse it verbatim.
# ---------------------------------------------------------------------------
def draw_item(s: Scene, port, target, key, drop_x=None, pill="i = 3"):
    x = drop_x if drop_x is not None else port[0]
    run = [port, (x, target[1]), target]
    if key == "A":
        cable(s, run, "delayed", pill=pill, pill_t=0.3, stroke=INK, pill_ink=INK_2)
    elif key == "D":
        cable(s, run, "solid", ticks=True)
    elif key == "E":
        cable(s, run, "solid", width=1.0)
    elif key == "C":
        cable(s, [port, (x, port[1] + 42)], "solid", arrow=False)
        chip(s, x - 62, port[1] + 42, "other · Pose", fill=SUNKEN, ink=INK, size=12)
        cable(s, [(x, port[1] + 63), (x, target[1]), target], "solid")
    else:
        cable(s, run, "solid", pill=pill, pill_t=0.3)
    return x


def hard_two_consumers(key: str) -> Scene:
    """The same element feeds two Blocks. Does the connection fan out or knot?"""
    s = Scene(SW, 620, f"two consumers — {key}")
    header_region(s, h=490)
    est = Block("estimate", 16, 210, 176, "estimate()", inputs=[], outputs=[Port("", "Pose")])
    mg = Block("merge", 450, 200, 330, "merge()",
               inputs=[Port("pose", "Pose"), Port("other", "Pose")], outputs=[Port("", "Pose")])
    log = Block("log", 450, 372, 260, "log()", inputs=[Port("item", "Pose")], outputs=[])
    s.circle(30, 76, 5, PORT, PORT, 0)
    s.text(40, 65, "others", size=12.5, fill=INK_2)
    s.text(40 + 7.6 * 6 + 7, 65, "Poses", size=12.5, fill=FAINT)
    cable(s, [(30, 76), (REG["x"], 76)], "solid", arrow=False, stroke="#3A3A3A")
    cable(s, [est.out(0), (222, est.out(0)[1]), (222, mg.inp(0)[1]), mg.inp(0)], "solid")
    cable(s, [mg.out(0), (880, mg.out(0)[1]), (880, 452), (356, 452),
              (356, mg.inp(0)[1]), mg.inp(0)], "delayed", pill="z⁻¹", pill_t=0.5, layer="under")
    iterable_inlet(s, REG["x"], 76)
    port = item_outlet(s, 286, HEAD_Y)
    x = draw_item(s, port, mg.inp(1), key)
    draw_item(s, (x, mg.inp(1)[1]), log.inp(0), key, drop_x=x, pill="")
    s.circle(x, mg.inp(1)[1], 3.6, INK, None, 0, layer="over")
    hop(s, x, mg.inp(0)[1])
    for b in (est, mg, log):
        draw_block(s, b)
    return s


def hard_zip(key: str) -> Scene:
    """`for a, b in zip(xs, ys)` — two collections in, two elements out."""
    s = Scene(SW, 600, f"zip — {key}")
    header_region(s, h=470, head=104)
    mg = Block("pair", 470, 210, 330, "pair()",
               inputs=[Port("a", "Pose"), Port("b", "Box")], outputs=[Port("", "Hit")])
    for index, (name, type_name, y) in enumerate((("xs", "Poses", 62), ("ys", "Boxes", 108))):
        s.circle(30, y, 5, PORT, PORT, 0)
        s.text(40, y - 11, name, size=12.5, fill=INK_2)
        s.text(40 + 7.6 * len(name) + 7, y - 11, type_name, size=12.5, fill=FAINT)
        cable(s, [(30, y), (REG["x"], y)], "solid", arrow=False, stroke="#3A3A3A")
        iterable_inlet(s, REG["x"], y, label="Iterable" if index == 0 else "Iterable")
    s.text(REG["x"] + 96, 66, "zip", size=13, fill=FAINT, family=MONO)
    for index, (label, target, dx) in enumerate(
            ((("a"), mg.inp(0), 286), (("b"), mg.inp(1), 330))):
        port = item_outlet(s, dx, REG["y"] + 104, label=label)
        draw_item(s, port, target, key, drop_x=dx, pill="i = 3" if index == 0 else "")
    caption(s, 470, 470, "no carry in this one — the point is the two item ports", fill=MUTED)
    draw_block(s, mg)
    return s


HARD = [("Two consumers of the same element", hard_two_consumers),
        ("`for a, b in zip(xs, ys)` — two Iterable inlets, two item ports", hard_zip)]


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------
PRIOR = [
    ("Ten iterations of your loop drawing", "loop-carried-state-iterations-2026-09-03.html",
     "Yesterday's pass on the same golden. It is where the centred title, the faded "
     "zero-iterations arm and the row-alignment idea come from."),
    ("Five grammars from LabVIEW's answer outward", "for-loop-labview-grammars-2026-09-02.html",
     "Rejected, but its finding that <em>an invariant should cost nothing</em> is why the "
     "seed cable here carries no mark at all."),
    ("Ten grammars, rejected", "for-loop-visual-grammar-babble-2026-09-02.html",
     "Paired Gates, Header Lanes, State Pills and seven more."),
    ("The loop is the branch region plus one cable back", "loop-regions-2026-09-02.html",
     "L1 at 87 — the region, the back cable, the routing rule, and the last/zero φ that "
     "the faded arm below draws."),
    ("Five ways to mark the back cable", "loop-edge-marks-2026-09-02.html",
     "M2: a <code>z⁻¹</code> chip mid-cable. Which is exactly why variant A's dotted item "
     "line is a problem — dotted is taken."),
    ("Many-to-one is a φ", "many-to-one-2026-09-02.html",
     "Two producers into one port are legal when a region makes them exclusive, and the "
     "inactive arm fades. That is the rule the zero-iterations cable obeys here."),
    ("Delayed cable, shipped", "edge-vocabulary-implementation-2026-09-02.html",
     "<code>temporal: data | async | delayed</code>, dotted paint, a draggable "
     "<code>z⁻¹</code> pill. Solid / dashed / dotted are all spoken for — which is the "
     "whole constraint on the ten below."),
    ("Branch region", "branch-regions-2026-09-02.html",
     "The region whose header takes the controlling value. The loop header copying that "
     "move is your call, and every variant here obeys it."),
]


def measure() -> dict:
    package = json.loads((REPO / "package.json").read_text())
    model = (REPO / "src" / "blocks" / "connections" / "connectionModel.ts").read_text()
    return {"tldraw": package["dependencies"]["tldraw"],
            "temporal": model.split("CONNECTION_TEMPORAL_KINDS = [")[1].split("]")[0].strip(),
            "scenes": len(VARIANTS) + 3 * len(HARD),
            "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                                     capture_output=True, text=True).stdout.strip()}


def build_html() -> str:
    facts = measure()
    ranked = sorted(VARIANTS, key=lambda v: -weighted(v))
    out = [f"<style>{CSS}</style><div class='wrap'>"]
    out.append(f"""
<p class="eyebrow">SystemSketch · golden 10 · the item connection · exploration only</p>
<h1>Ten ways to draw the one connection still open</h1>
<p class="lede">Everything else is decided. The header is an <strong>operator</strong>: the
iterable feeds <em>into</em> it, it has a real port, the title is centred, and the
zero-iterations arm is always drawn and faded. The only question left is what the run from
that port to <code>merge.other</code> looks like.</p>
<div class="kv">
  <span class="tag">tldraw {facts['tldraw']} · stock</span>
  <span class="tag">{facts['scenes']} diagrams</span>
  <span class="tag">10 variants · 3 finalists · 2 hard cases</span>
  <span class="tag">repo at {facts['commit']}</span>
</div>

<h2>What is now fixed</h2>
<table>
<tr><th style="width:280px">Settled, this round</th><th>Why it changes the drawing</th></tr>
<tr><td><strong>The header is an operator</strong></td>
<td>The collection does not pass through the region on its way to a Block. It lands
<em>on the header</em>, the same way a Branch's controlling value does, and the header emits
the element. The two regions now read the same way.</td></tr>
<tr><td><strong>A real port, not a derived one</strong></td>
<td>&ldquo;100% I want a port myself so I can wire and show the type of iteration&rdquo; —
so the item outlet is an ordinary port on an ordinary cable. It stays hackable; nothing here
is computed-only.</td></tr>
<tr><td><strong>Centred title</strong></td>
<td>An operator's name belongs over the middle of it. Left-aligned reads as a label on a
container; centred reads as the thing itself.</td></tr>
<tr><td><strong>Zero-iterations arm: always drawn, transparent</strong></td>
<td>It and the last-value cable are the exit φ, and for valid dataflow only one is live —
so the same fade the Branch uses for an inactive arm applies here.</td></tr>
</table>
<p class="note warn"><strong>The constraint that decides this.</strong> Solid means data,
dashed means the async rail, dotted means <strong>one turn late</strong> — that is the
shipped <code>temporal</code> StyleProp, and the back cable on every board below is dotted.
So the item cable cannot also be dotted without two lines meaning two different things on
one picture. That single fact is most of the scoring.</p>

<h2>The ten</h2>
<p>Same region, same Blocks, same seed, same back cable, same faded zero arm. The only
difference in each picture is the run from the header's item port.</p>""")
    for v in VARIANTS:
        out.append(f"""
<h3><span class="tag rank">{v.key}</span> &nbsp;{v.name}
<span class="score" style="font-size:19px;color:var(--muted)">{weighted(v)}</span></h3>
<p class="lede" style="font-size:16.5px">{v.one_line}</p>
<figure class="fig" style="margin:14px 0">{SCENES[v.key]().svg()}</figure>
<div class="card">
  {''.join(f'<p>{r}</p>' for r in v.reads)}
  <p class="note warn"><strong>What it costs.</strong> {v.costs}</p>
</div>""")

    head = "".join(f'<th style="text-align:right">{n}<br><span style="font-weight:400;'
                   f'text-transform:none;letter-spacing:0">{w}%</span></th>'
                   for _k, n, w in CRITERIA)
    rows = "".join(
        f'<tr{" style=\"background:#F7F5FD\"" if rank <= 3 else ""}>'
        f'<td class="num">{rank}</td><td><strong>{v.key}</strong> {v.name}</td>'
        + "".join(f'<td class="num">{v.scores[k]}</td>' for k, _n, _w in CRITERIA)
        + f'<td class="num"><strong>{weighted(v)}</strong></td></tr>'
        for rank, v in enumerate(ranked, start=1))
    out.append(f"""
<h2>Scores</h2>
<table><tr><th class="num">#</th><th>Variant</th>{head}
<th style="text-align:right">Score</th></tr>{rows}</table>
<p class="note good"><strong>B and J are the same drawing seen twice.</strong> J is B with
the two ports written on one header line — the operator made literal. Take J's header and
B's cable and you have one answer, not two. <strong>That is my recommendation:</strong> the
header row reads <code>Iterable ▸ Iter</code>, and the run below it is an ordinary
<strong>solid</strong> cable with the <code>i =</code> pill on it. Dotted stays reserved for
<code>z⁻¹</code>, which is what makes the back cable mean something.</p>
<p class="note"><strong>If solid turns out to be too quiet</strong> — and it might, because
the item cable and the seed cable then look identical — <strong>D (cadence ticks)</strong> is
the cheapest upgrade: a tick is extra line where a dot is missing line, so it can never be
confused with the delay, and it survives a short run, which was your own gate on the async
rail. <strong>E (half-weight)</strong> is the alternative and reads at any zoom, but line
weight is the one channel a whiteboard user will grab by hand.</p>
<p class="note warn"><strong>A, your drawing, scores last of the serious options at
66.6</strong> — not because the geometry is wrong, it is the geometry all ten share, but
because the line style collides with <code>z⁻¹</code>. Change nothing but the dots and it
becomes B.</p>""")

    out.append("""
<h2>The three under load</h2>
<p>Two cases that specifically hit the item connection rather than the loop.</p>""")
    for title, fn in HARD:
        out.append(f"<h3>{title}</h3>")
        for key in ("B", "J", "D"):
            v = next(x for x in VARIANTS if x.key == key)
            out.append(f"""
<div class="card">
  <div class="hdr"><span class="tag rank">{key}</span><strong>{v.name}</strong></div>
  <figure class="fig" style="margin:14px 0">{fn(key).svg()}</figure>
</div>""")
    out.append("""
<p><strong>Two consumers.</strong> All three fan out from one junction on the item cable and
none of them tangles — which is the argument for keeping the item on a real cable rather than
a named cap. D's ticks do get busy on the second branch; B stays quietest.</p>
<p><strong><code>zip</code>.</strong> Two <code>Iterable</code> inlets and two item ports sit
on the header without a new idea, and the header stays one line high. This is the case that
makes J's explicit <code>Iterable ▸ Iter</code> row look expensive — with two of each, the
arrow stops helping and the ports carry it alone.</p>""")

    prior = "".join(f'<tr><td><a href="{path}"><strong>{name}</strong></a></td>'
                    f'<td>{why}</td></tr>' for name, path, why in PRIOR)
    out.append(f"""
<h2>The thread this sits in</h2>
<table><tr><th style="width:330px">Report</th><th>What it settled</th></tr>{prior}</table>

<h2>The editable board</h2>
<p>Ten cards, real Blocks, real cables. The back cables are genuine
<code>temporal: {facts['temporal']}</code> records.</p>
<ul><li><a href="http://127.0.0.1:4330/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Floop-header-item-connection.systemsketch">the ten variants, editable</a>
 — <code>sketches/review/loop-header-item-connection.systemsketch</code></li></ul>
<div class="foot">
Built by <code>docs/build_loop_header_item_connection.py</code> from the tree at
<code>{facts['commit']}</code>. Exploration artifact — nothing under <code>src/</code> was
changed.
</div></div>""")
    return "".join(out)


BOARD_CODE = ("for other in others:\n"
              "    fused = merge(pose, other)\n"
              "    pose  = smooth(fused)")


def _card(v: Variant, index: int) -> BoardScene:
    card = BoardScene(v.key.lower(), 0, index * 700, 2000, 620,
                      f"{v.key} · {v.name}", BOARD_CODE)
    card.band("region", 360, 170, 1180, 380, color="grey", dash="solid")
    card.label("loopname", 880, 186, "For  Loop", color="black", size="m", font="mono")
    run = card.block("run", 30, 210, 300, "run()", [], [("others", "Poses")])
    est = card.block("estimate", 30, 400, 300, "estimate()", [], [("pose", "Pose")])
    merge = card.block("merge", 520, 260, 340, "merge()",
                       [("pose", "Pose"), ("other", "Pose")], [("fused", "Pose")])
    smooth = card.block("smooth", 990, 300, 320, "smooth()",
                        [("fused", "Pose")], [("pose", "Pose")])
    out = card.block("out", 1640, 310, 320, "encode()", [("pose", "Pose")], [])
    card.cable(run, "out_1", merge, "in_2")
    card.cable(est, "out_1", merge, "in_1")
    card.cable(merge, "out_1", smooth, "in_1")
    card.cable(smooth, "out_1", merge, "in_1", temporal="delayed")
    card.cable(smooth, "out_1", out, "in_1")
    card.label("hdr", 380, 200, "Iterable  ▸  Iter   — the header is an operator; the "
                                "iterable lands ON it", color="grey", size="s")
    card.label("one", 26, 566, v.one_line, color="black", size="s")
    card.label("cost", 26, 592, f"cost · {v.costs.replace('<strong>','').replace('</strong>','').replace('<em>','').replace('</em>','').replace('<code>','').replace('</code>','')[:150]}",
               color="grey", size="s")
    return card


def build_board_recipe() -> dict:
    shapes, bindings = [], []
    for index, v in enumerate(VARIANTS):
        card = _card(v, index)
        shapes.extend(card.shapes)
        bindings.extend(card.bindings)
    return {"feature": "Loop header · the item connection",
            "viewport": {"width": 2600, "height": 1900},
            "pages": [{"id": "review", "name": "Review"}],
            "shapes": shapes, "bindings": bindings,
            "callouts": [
                {"id": "step-1", "kind": "step",
                 "text": "1 · Ten cards. Every one has the same Blocks and the same cables — "
                         "only the run from the header's item port to merge.other changes.",
                 "x": -520, "y": 170, "w": 440, "h": 180,
                 "target": {"shapeId": "a-merge", "anchor": "left"}},
                {"id": "step-2", "kind": "step",
                 "text": "2 · Drag any Block: the dotted back cable is a real connection with "
                         "temporal: delayed, so it reflows and keeps its z⁻¹ pill.",
                 "x": -520, "y": 1570, "w": 440, "h": 180,
                 "target": {"shapeId": "c-merge", "anchor": "left"}},
                {"id": "pass", "kind": "pass",
                 "text": "PASS WHEN one card's item cable is unmistakably not the back cable, "
                         "at a glance, with no legend.",
                 "x": 2140, "y": 170, "w": 440, "h": 160}]}


def main() -> None:
    report = DOCS / f"loop-header-item-connection-{STAMP}.html"
    report.write_text(
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>The item connection · SystemSketch</title></head><body>"
        f"{build_html()}</body></html>", encoding="utf-8")
    (DOCS / f"loop-header-item-connection-{STAMP}.json").write_text(json.dumps({
        "settled": ["header is an operator: the iterable feeds into it",
                    "a real item port, wirable, never purely derived",
                    "centred title",
                    "zero-iterations arm always drawn and transparent"],
        "criteria": [{"key": k, "name": n, "weight": w} for k, n, w in CRITERIA],
        "variants": {v.key: {"name": v.name, "one_line": v.one_line, "scores": v.scores,
                             "weighted": weighted(v)} for v in VARIANTS},
        "ranking": [v.key for v in sorted(VARIANTS, key=lambda x: -weighted(x))],
        "measured": measure()}, indent=2), encoding="utf-8")
    (SKETCHES / "loop-header-item-connection-recipe.json").write_text(
        json.dumps(build_board_recipe(), indent=1), encoding="utf-8")
    print(f"report  {report}  ({report.stat().st_size // 1024} KB)")
    print(f"recipe  {SKETCHES / 'loop-header-item-connection-recipe.json'}")


if __name__ == "__main__":
    main()
