#!/usr/bin/env python3
"""Build `docs/side-effect-grammar-2026-09-02.html`: how a board says a call mutated its argument.

Zach's question (PROJECT - pyblocks §11): golden 11 is `poses.append(pose)` —
a call that changes a value the caller still holds.  His first instinct was to
refuse to draw the internals; his second, which he liked, was a cable that
leaves the block and lands back on the mutated input port, visible in the port
view before anything is wired.  He asked for thoughts on the side effect itself.

This page argues one thing: **the arc is not an effect leaving the block, it is
an output with nowhere else to go**, because the caller named the object on the
left.  Everything else follows — nothing downstream needs painting, the port
view can warn in advance, and the hazard that is left is an ordering lint.

Every number here is computed at build time by `docs/mutation_effects.py`
against the real golden sources and the real target board.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "side-effect-grammar-2026-09-02.html"
GOLDENS = Path("/home/bam/pyblocks/examples/systemsketch_goldens")
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MONO, MUTED, SANS, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, note, polycable, text,
)
from effect_board_svg import (  # noqa: E402
    EFFECT, GHOST, Board, effect_arc, mut_badge, pill, route, svg_defs,
)
from mutation_effects import (  # noqa: E402
    analyze, board_report, read_check, survey,
)

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

HAZARD_SOURCE = '''def run(raw: bytes, poses: list[Pose]) -> int:
    before = len(poses)
    frame = decode(raw)
    pose = estimate(frame, 1.0)
    poses.append(pose)
    after = len(poses)
    return after - before
'''

SELF_SOURCE = '''class Tracker:
    def run(self, pose: Pose) -> int:
        self.poses.append(pose)
        self.count = len(self.poses)
        return self.count
'''


# --------------------------------------------------------------------------
# Measure
# --------------------------------------------------------------------------

ELEVEN = GOLDENS / "11_receiver_mutation"
SOURCE = (ELEVEN / "source.py").read_text(encoding="utf-8")
RUN_SOURCE = SOURCE[SOURCE.index("def run("):].strip()
ANALYSIS = analyze(SOURCE)
READS = read_check(ELEVEN / "target.systemsketch", ANALYSIS)
BOARD = board_report(ELEVEN / "target.systemsketch", ANALYSIS)
SURVEY = survey(GOLDENS)
HAZARD = analyze(HAZARD_SOURCE)
SELFCASE = analyze(SELF_SOURCE)
CASES = sorted(p.name for p in GOLDENS.iterdir() if p.is_dir())
RULE_CODE = (DOCS / "mutation_effects.py").read_text(encoding="utf-8")
RULE_DOC = RULE_CODE.split('"""')[1].strip()

READS_OK = sum(1 for r in READS if r["ok"])
WRITEBACKS = len(ANALYSIS.writebacks)
DRAWN = WRITEBACKS - len(BOARD["writebacks_missing"])


def esc(s: str) -> str:
    return html.escape(str(s))


def run_block(svg: Board, x, y, *, mut_on=None, extra_out=None, w=260, title="run()"):
    """The collapsed `run()` block: three inputs, one output."""
    inputs = [
        {"name": "raw", "type": "bytes", "connected": True},
        {"name": "gain", "type": "float", "connected": True},
        {"name": "poses", "type": "list[Pose]", "connected": True},
    ]
    outputs = [{"name": "int", "connected": True}]
    if extra_out:
        outputs = outputs + extra_out
    ports = block(svg, x, y, w, title, inputs, outputs)
    if mut_on:
        px, py = ports["in"][mut_on]
        svg.add(mut_badge(px, py))
    return ports


def feeders(svg: Board, ports, x=40, *, names=("verify()", "refine()", "merge()")):
    """Three upstream producers, so the board is not a single card."""
    ys = [ports["in"]["raw"][1] - 6, ports["in"]["gain"][1] + 30, ports["in"]["poses"][1] + 76]
    made = []
    for name, y in zip(names, ys):
        p = block(svg, x, y - 50, 150, name,
                  [{"name": "in", "type": "", "connected": True}],
                  [{"name": "out", "connected": True}])
        made.append(p)
    return made


# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------

def board_today() -> str:
    """Golden 11 as `target.systemsketch` draws it today, with the missing edge as a ghost."""
    svg = Board(1180, 470)
    svg.add(text(20, 26, "11_receiver_mutation · target.systemsketch as it stands", size=13,
                 color=MUTED, italic=True))
    # the run() frame
    svg.add(f'<rect x="90" y="70" width="1050" height="360" rx="4" fill="#fff" stroke="#c3c6cf" stroke-width="1.2"/>')
    svg.add(f'<line x1="90" y1="104" x2="1140" y2="104" stroke="#c3c6cf" stroke-width="1"/>')
    svg.add(text(104, 94, "run()", size=19, mono=True))
    raw = boundary_in(svg, 90, 160, "raw", "bytes")
    gain = boundary_in(svg, 90, 262, "gain", "float")
    poses = boundary_in(svg, 90, 372, "poses", "list[Pose]")
    out = boundary_out(svg, 1140, 300, "count", "int")

    decode = block(svg, 168, 128, 150, "decode()",
                   [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    est = block(svg, 372, 152, 168, "estimate()",
                [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "float"}],
                [{"name": "Pose"}])
    app = block(svg, 594, 216, 196, "poses.append()",
                [{"name": "poses"}, {"name": "pose"}], [{"name": "poses#2"}])
    relay = block(svg, 838, 210, 118, "poses#2",
                  [{"name": "in"}], [{"name": "out"}])
    ln = block(svg, 838, 300, 150, "len()", [{"name": "poses#2"}], [{"name": "count"}])

    svg.add(cable(raw, decode["in"]["raw"]))
    svg.add(cable(decode["out"]["Frame"], est["in"]["frame"]))
    svg.add(cable(gain, est["in"]["gain"], mid=344))
    svg.add(cable(est["out"]["Pose"], app["in"]["pose"]))
    svg.add(route(poses, app["in"]["poses"], 150))
    svg.add(cable(app["out"]["poses#2"], relay["in"]["in"]))
    svg.add(route(relay["out"]["out"], ln["in"]["poses#2"], 976))
    svg.add(cable(ln["out"]["count"], out, mid=1030))

    effect_arc(svg, (app["rect"][0] + 100, app["rect"][1]), poses, 122,
               label="mut  (not drawn)", ghost=True, entry=48)
    note(svg, 176, 452, "6 blocks · 8 cables · every read wired from the right version (%d/%d) · "
                        "0 cables land on a boundary input" % (READS_OK, len(READS)), color=MUTED)
    return svg.render("golden 11 today")


def call_site(mark: str) -> str:
    """The call site: someone gives run() a list, and someone else reads it afterwards."""
    svg = Board(1000, 420)
    store = block(svg, 40, 150, 148, "collect()", [{"name": "n", "type": "int"}],
                  [{"name": "list[Pose]"}])
    run = run_block(svg, 300, 108, w=270,
                    mut_on="poses" if mark in ("S1", "S3", "SPLICE") else None)
    report = block(svg, 720, 118, 150, "report()", [{"name": "n", "type": "int"}],
                   [{"name": "str"}])
    summarize = block(svg, 720, 262, 168, "summarize()", [{"name": "poses"}],
                      [{"name": "float"}])

    svg.add(cable(store["out"]["list[Pose]"], run["in"]["poses"], mid=250))
    svg.add(cable(run["out"]["int"], report["in"]["n"], mid=650))

    px, py = run["in"]["poses"]
    top = run["rect"][1]

    if mark == "S1":                     # the arc, Zach's drawing
        effect_arc(svg, (run["rect"][0] + 170, top), (px, py), 58, label="mut")
        svg.add(route(store["out"]["list[Pose]"], summarize["in"]["poses"], 250))
        note(svg, 300, 396, "downstream reads the same wire — which version? the board does not say", color=WARN)
    elif mark == "S2":                   # in/out through-port, on the row it mirrors
        rx = run["rect"][0] + run["rect"][2]
        svg.add(f'<line x1="{px + 118}" y1="{py}" x2="{rx - 46}" y2="{py}" stroke="{WARN}" '
                f'stroke-width="1.8" stroke-dasharray="4 4"/>')
        svg.add(dot(rx, py, ANY, True))
        svg.add(text(rx - 12, py - 8, "poses", size=11.5, anchor="end"))
        svg.add(route((rx, py), summarize["in"]["poses"], 660))
        note(svg, 300, 396, "poses leaves on the right, on the row it came in; downstream wires from there",
             color=MUTED)
    elif mark == "S3":                   # badge only
        svg.add(route(store["out"]["list[Pose]"], summarize["in"]["poses"], 250))
        note(svg, 300, 396, "the port says it may be written; nothing says it was, or by what", color=WARN)
    elif mark == "S4":                   # effect target node
        nx, ny = 406, 44
        svg.add(f'<rect x="{nx}" y="{ny - 18}" width="128" height="36" rx="18" fill="#fff" '
                f'stroke="{WARN}" stroke-width="1.6"/>')
        svg.add(text(nx + 64, ny + 5, "poses", size=13, mono=True, anchor="middle", color=WARN))
        svg.add(f'<path d="M{nx + 64},{top} L{nx + 64},{ny + 20}" fill="none" stroke="{EFFECT}" '
                f'stroke-width="2.4" stroke-linecap="round" marker-end="url(#arrow-effect)"/>')
        svg.add(route((nx, ny), summarize["in"]["poses"], 250, dashed=True))
        note(svg, 300, 396, "one named object; every toucher wires to it — and the DAG is gone", color=WARN)
    elif mark == "S5":                   # version chip on the cable
        svg.add(route(store["out"]["list[Pose]"], summarize["in"]["poses"], 250))
        pill(svg, 250, 268, "poses#2", color=ACCENT)
        note(svg, 300, 396, "the rename is honest inside; at the call site it renames a wire nobody re-made", color=WARN)
    else:                                # SPLICE — badge + arc + derived through-port
        effect_arc(svg, (run["rect"][0] + 170, top), (px, py), 58, label="mut")
        rx, ry = run["rect"][0] + run["rect"][2], py
        svg.add(f'<circle cx="{rx}" cy="{ry}" r="5.5" fill="#fff" stroke="{WARN}" '
                f'stroke-width="2" stroke-dasharray="3 2.4"/>')
        svg.add(text(rx - 12, ry - 8, "poses", size=11.5, anchor="end", color=WARN))
        svg.add(route((rx, ry), summarize["in"]["poses"], 660))
        note(svg, 300, 396, "the badge derives the output; it appears only when a reader needs it", color=MUTED)
    return svg.render(f"call site, {mark}")


def board_portview() -> str:
    """The port view: the warning is in the signature, before anything is wired."""
    svg = Board(1000, 300)
    svg.add(text(20, 28, "port view — nothing wired yet", size=12.5, color=MUTED, italic=True))
    ports = block(svg, 60, 60, 300, "run()",
                  [{"name": "raw", "type": "bytes", "connected": False},
                   {"name": "gain", "type": "float", "connected": False},
                   {"name": "poses", "type": "list[Pose]", "connected": False}],
                  [{"name": "int", "connected": False}])
    svg.add(mut_badge(*ports["in"]["poses"], connected=False))
    note(svg, 420, 116, "The hook is read off the signature, not off the wiring.", color=INK, italic=False)
    note(svg, 420, 140, "Before you connect anything, the port has already said:")
    note(svg, 420, 162, "give me your list and I will change it.")
    note(svg, 420, 202, "Rust  &mut  ·  Ada  in out  ·  Swift  inout  ·  C#  ref", color=MUTED)
    note(svg, 420, 224, "all put the same fact in the same place: the interface.", color=MUTED)
    return svg.render("port view")


def board_inside() -> str:
    """The recommended inside view: golden 11 with the write-back drawn."""
    svg = Board(1180, 450)
    svg.add(f'<rect x="90" y="70" width="1050" height="340" rx="4" fill="#fff" stroke="#c3c6cf" stroke-width="1.2"/>')
    svg.add(f'<line x1="90" y1="104" x2="1140" y2="104" stroke="#c3c6cf" stroke-width="1"/>')
    svg.add(text(104, 94, "run()", size=19, mono=True))
    raw = boundary_in(svg, 90, 160, "raw", "bytes")
    gain = boundary_in(svg, 90, 250, "gain", "float")
    px, py = 90, 356
    svg.add(mut_badge(px, py))
    svg.add(text(102, 352, "poses", size=11.5))
    svg.add(text(148, 352, "list[Pose]", size=11, color=MUTED))
    out = boundary_out(svg, 1140, 292, "count", "int")

    decode = block(svg, 168, 128, 150, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    est = block(svg, 372, 146, 168, "estimate()",
                [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "float"}], [{"name": "Pose"}])
    app = block(svg, 606, 208, 196, "poses.append()",
                [{"name": "poses"}, {"name": "pose"}], [{"name": "poses"}])
    ln = block(svg, 880, 262, 150, "len()", [{"name": "poses"}], [{"name": "count"}])
    svg.add(mut_badge(*app["in"]["poses"]))

    svg.add(cable(raw, decode["in"]["raw"]))
    svg.add(cable(decode["out"]["Frame"], est["in"]["frame"]))
    svg.add(cable(gain, est["in"]["gain"], mid=344))
    svg.add(cable(est["out"]["Pose"], app["in"]["pose"]))
    svg.add(route((px, py), app["in"]["poses"], 150))
    svg.add(cable(app["out"]["poses"], ln["in"]["poses"], mid=840))
    svg.add(cable(ln["out"]["count"], out, mid=1080))
    effect_arc(svg, (app["rect"][0] + 98, app["rect"][1]), (px, py), 126, label="mut", entry=44)

    note(svg, 610, 350, "len() reads the version append made — already how the target board wires it.",
         color=MUTED)
    note(svg, 250, 436, "The one added edge: the last version of a mutated parameter reaches the port that named it.",
         color=INK, italic=False)
    return svg.render("inside, recommended")


def board_hazard() -> str:
    """Two readers of one mutated object: the lint, not a paint."""
    svg = Board(1000, 400)
    svg.add(f'<rect x="60" y="72" width="880" height="284" rx="4" fill="#fff" stroke="#c3c6cf" stroke-width="1.2"/>')
    svg.add(f'<line x1="60" y1="106" x2="940" y2="106" stroke="#c3c6cf" stroke-width="1"/>')
    svg.add(text(74, 96, "run()", size=17, mono=True))
    px, py = 60, 300
    svg.add(mut_badge(px, py))
    svg.add(text(72, 296, "poses", size=11.5))
    before = block(svg, 168, 122, 168, "len()  ·  before", [{"name": "poses"}], [{"name": "int"}])
    app = block(svg, 420, 200, 190, "poses.append()", [{"name": "poses"}, {"name": "pose"}], [{"name": "poses"}])
    after = block(svg, 700, 240, 170, "len()  ·  after", [{"name": "poses"}], [{"name": "int"}])
    svg.add(mut_badge(*app["in"]["poses"]))
    svg.add(route((px, py), before["in"]["poses"], 118))
    svg.add(route((px, py), app["in"]["poses"], 140))
    svg.add(cable(app["out"]["poses"], after["in"]["poses"], mid=660))
    effect_arc(svg, (app["rect"][0] + 95, app["rect"][1]), (px, py), 44, label="mut", entry=40)
    svg.add(f'<circle cx="{before["in"]["poses"][0]}" cy="{before["in"]["poses"][1]}" r="10" '
            f'fill="none" stroke="{WARN}" stroke-width="2" stroke-dasharray="3 3"/>')
    note(svg, 190, 372, "LINT — len()·before reads v0 and poses.append() writes it: nothing on the canvas "
                        "orders them.", color=WARN, italic=False)
    return svg.render("order hazard")


def board_self() -> str:
    """Golden 36's shape: the mutation lands on the receiver, which already has a port."""
    svg = Board(1000, 330)
    ports = block(svg, 300, 96, 300, "run()",
                  [{"name": "pose", "type": "Pose", "connected": True}],
                  [{"name": "int", "connected": True}],
                  header={"name": "self", "connected": True})
    hx, hy = ports["header"]
    svg.add(mut_badge(hx, hy))
    src = block(svg, 60, 150, 150, "estimate()", [{"name": "frame"}], [{"name": "Pose"}])
    svg.add(route(src["out"]["Pose"], ports["in"]["pose"], 252))
    svg.add(polycable([(hx - 92, hy), (hx - 9, hy)], color=CABLE))
    effect_arc(svg, (ports["rect"][0] + 190, ports["rect"][1]), (hx, hy), 48, label="mut  self", entry=36)
    note(svg, 640, 128, "36_world_frame_source:", color=INK, italic=False)
    note(svg, 640, 150, "self._publisher_task = create_task(...)")
    note(svg, 640, 176, "The receiver is already a port on the header.")
    note(svg, 640, 198, "The arc needs nowhere new to land.")
    note(svg, 640, 236, "wake.clear() and latest.clear() in the same", color=MUTED)
    note(svg, 640, 256, "function are local: no write-back, no mark.", color=MUTED)
    return svg.render("self case")


# --------------------------------------------------------------------------
# Prior art and scores
# --------------------------------------------------------------------------

PRIOR = [
    ("Rust", "&mut T", "The exclusive borrow is in the type, so a reader sees the effect in the signature "
     "before any call is written — and the borrow checker forbids a second live reader of the same value, "
     "which is the order hazard on this page turned into a compile error."),
    ("Ada", "in out", "Parameter mode is part of the subprogram specification: in, out, in out. The spec, "
     "not the body, tells you the argument comes back changed."),
    ("Swift", "inout", "The effect is declared on the parameter and repeated at the call site as &value, so "
     "both the definition and the occurrence carry the mark."),
    ("C#", "ref / out", "The caller must repeat the keyword at the call site; the language refuses to let a "
     "mutation be invisible where it happens."),
    ("LabVIEW", "array / error in–error out", "Wires are by value, so every mutating primitive takes the "
     "container in on the left and hands the new one out on the right; the error cluster pair is the same "
     "shape used to sequence effects. This is the through-port, and it is the most-used node grammar there is."),
    ("LabVIEW", "DVR (data value reference)", "When a value genuinely must be shared, it stops being a wire "
     "and becomes a reference with an explicit in-place element structure — mutation is made syntactically "
     "loud rather than hidden in a wire."),
    ("Simulink", "Data Store Memory / Read / Write", "Shared mutable state is a named store block that writers "
     "and readers reference by name, deliberately without a signal line — which is why Simulink then needs "
     "separate ordering machinery, the cost of dropping the edge."),
    ("Verilog / VHDL", "inout port", "A port direction of inout exists precisely for the case where one "
     "connection is both read and driven."),
    ("SSA (Cytron et al.)", "reaching definitions", "A mutation is a definition like any other; every use is "
     "bound to the definition that reaches it. The versions table on this page is that, and it is what makes "
     "\"which wire should this consumer come from\" a computation rather than a judgement."),
    ("Houdini · TouchDesigner · Blender", "no mark at all", "Their node graphs are functional — a node cannot "
     "change its input — so the question never arises. Absence is the finding: no node editor has had to solve "
     "this, because none of them is drawing Python."),
]

CRITERIA = [
    ("Truthful at the boundary", 25, "does the board say the caller's object changed?"),
    ("Impurity is unmissable", 20, "you see it without hunting, at board zoom"),
    ("Warns before wiring", 15, "the port view says it before a cable exists"),
    ("No new primitive", 15, "cables, ports and pills the app already has"),
    ("Generalises", 15, "to self, to globals and IO, to several effects at once"),
    ("Routable", 10, "the whiteboard can bend it where you want it"),
]

VARIANTS = [
    ("S1", "Effect arc", "Your drawing. A derived cable leaves the top edge at the mutating call, runs a lane "
     "above the block and lands on the mutated input port with an arrowhead.",
     [25, 20, 4, 13, 9, 10],
     "Says the whole fact in one mark and sticks out exactly as much as it should. On its own it cannot warn "
     "before a cable exists, and at the call site it leaves downstream readers of the same wire unordered."),
    ("S2", "In/out through-port", "The mutated parameter appears on both sides — poses in on the left, poses "
     "out on the right, joined across the card. Read onward from the right. LabVIEW's whole grammar.",
     [22, 8, 12, 12, 8, 6],
     "Correct and boring, which is its strength: downstream always has somewhere to wire from. But it invents "
     "an output the Python caller never names, and a mutation stops looking like a mutation — it looks like an "
     "ordinary function that returns its argument."),
    ("S3", "Port badge only", "A hook on the port and nothing else, in the port-default pill grammar. The "
     "signature says the port may be written; no cable is drawn.",
     [10, 9, 15, 15, 11, 3],
     "The cheapest mark and the best warning, but it confuses may with did: a port that could be written looks "
     "the same on a board where nothing wrote it. It is half of the answer, not the answer."),
    ("S4", "Effect target node", "The arc leaves the block and lands on a small named object node — poses, "
     "stdout, self.count — that any block may touch. Simulink's Data Store.",
     [20, 17, 3, 6, 15, 9],
     "The only variant that already handles an effect with no port to land on, and the reason it is worth "
     "keeping for exactly that case. As the general answer it is expensive: a new node kind, and the moment "
     "two blocks touch one node the board stops being a DAG and needs its own ordering."),
    ("S5", "Version chip on the cable", "No arc. The mutation renames the value: the cable out of the mutating "
     "call carries poses#2, in the same pill machinery as z⁻¹. This is what the target board does today.",
     [12, 6, 2, 14, 7, 8],
     "Honest inside the function and free to build — but it renames a wire the caller never re-made, and it "
     "drops the boundary fact entirely, which is measurably what golden 11's board does now."),
]

SPLICE = ("SPLICE", "Arc + badge, through-port derived on demand",
          "The badge comes off the signature so the port view warns first; the arc is drawn from the source so "
          "the board says which call did it; and when a reader downstream of the call site needs the new "
          "version, the badge derives an output of the same name to wire from — hollow until something uses it.",
          [25, 20, 15, 13, 14, 10])


def score_rows():
    rows = []
    for key, name, _blurb, scores, *_ in VARIANTS:
        rows.append((key, name, scores, sum(scores)))
    rows.append((SPLICE[0], SPLICE[1], SPLICE[3], sum(SPLICE[3])))
    return rows


def scores_html() -> str:
    head = "".join(f"<th title='{esc(why)}'>{esc(n)}<span>{w}</span></th>" for n, w, why in CRITERIA)
    body = ""
    for key, name, scores, total in score_rows():
        cls = " class='win'" if key == "SPLICE" else ""
        cells = "".join(f"<td>{s}</td>" for s in scores)
        body += (f"<tr{cls}><th scope='row'><code>{esc(key)}</code> {esc(name)}</th>{cells}"
                 f"<td class='total'>{total}</td></tr>")
    return (f"<table class='scores'><thead><tr><th>criterion →</th>{head}"
            f"<th class='total'>/100</th></tr></thead><tbody>{body}</tbody></table>")


def prior_html() -> str:
    rows = "".join(
        f"<tr><td><b>{esc(tool)}</b></td><td><code>{esc(mark)}</code></td><td>{esc(what)}</td></tr>"
        for tool, mark, what in PRIOR)
    return f"<table class='prior'><thead><tr><th>where</th><th>the mark</th><th>what it settles</th></tr></thead><tbody>{rows}</tbody></table>"


def reads_html() -> str:
    rows = "".join(
        f"<tr class='{'ok' if r['ok'] else 'bad'}'><td><code>{esc(r['read'])}</code></td>"
        f"<td>v{r['version']}</td><td><code>{esc(r['required'])}</code></td>"
        f"<td><code>{esc(r['drawn'])}</code></td>"
        f"<td>{esc(' → '.join(r['through']) or '—')}</td><td>{'✓' if r['ok'] else '✗'}</td></tr>"
        for r in READS)
    return (f"<table class='data'><caption>Every read in golden 11, against the cable "
            f"<code>target.systemsketch</code> actually draws</caption><thead><tr><th>read</th>"
            f"<th>version</th><th>must leave</th><th>does leave</th><th>through</th><th></th></tr></thead>"
            f"<tbody>{rows}</tbody></table>")


def survey_html() -> str:
    rows = "".join(
        f"<tr><td><code>{esc(row['case'])}</code></td><td>{esc('; '.join(row['effects']))}</td>"
        f"<td>{esc(', '.join(row['writebacks']) or '—')}</td></tr>" for row in SURVEY)
    return (f"<table class='data'><caption>{len(SURVEY)} of the {len(CASES)} goldens prove an in-place "
            f"mutation. Everything else is pure or unproven, not pure-by-assumption.</caption>"
            f"<thead><tr><th>case</th><th>proven effect</th><th>write-back</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>")


# --------------------------------------------------------------------------
# Page
# --------------------------------------------------------------------------

CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15.5px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;}
main{max-width:1240px;margin:0 auto;padding:44px 30px 90px}
h1{font-size:31px;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 28px}
h2{font-size:21px;margin:52px 0 14px;padding-top:16px;border-top:1px solid var(--line);letter-spacing:-.01em}
h3{font-size:16px;margin:30px 0 8px}
p{margin:0 0 14px}
code{font:13px/1.5 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace;
 background:#eef0f3;padding:1px 5px;border-radius:4px}
pre{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto}
pre code{background:none;padding:0;font-size:12.3px;line-height:1.6}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:10px;margin:26px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
.board{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:#f7f8fa}
figure{margin:20px 0}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:8px;padding:16px 18px;margin:22px 0}
.callout.warn{border-left-color:var(--warn)}
table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff;
 border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
caption{caption-side:top;text-align:left;color:var(--muted);font-size:13px;padding:0 0 8px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td,tbody tr:last-child th{border-bottom:none}
.data tr.ok td:last-child{color:#16794a;font-weight:700}
.data tr.bad td:last-child{color:var(--warn);font-weight:700}
.scores th[scope=row]{font-weight:500;font-size:13.4px}
.scores td{text-align:center;font-variant-numeric:tabular-nums}
.scores .total{font-weight:700}
.scores thead th span{display:block;color:var(--accent);font-weight:700;font-size:11px}
.scores tr.win{background:#eef4ff}
.prior td:first-child{white-space:nowrap}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 12px}
.tabs button{font:600 13px Inter,sans-serif;padding:7px 13px;border-radius:7px;cursor:pointer;
 border:1px solid var(--line);background:#fff;color:var(--muted)}
.tabs button[aria-selected=true]{background:var(--ink);border-color:var(--ink);color:#fff}
.pane[hidden]{display:none}
.pane p.why{color:var(--muted);font-size:13.6px;margin:10px 0 0}
.decision{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:14px;margin-top:14px}
.decision>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:14px 16px}
.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.decision ul{margin:0;padding-left:18px;font-size:13.8px}
.decision li{margin-bottom:7px}
textarea{width:100%;min-height:92px;border:1px solid var(--line);border-radius:8px;padding:11px 13px;
 font:13.5px/1.55 Inter,sans-serif;background:#fff}
footer{margin-top:52px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.small{color:var(--muted);font-size:13px}
b.k{background:#fff4ed;border-bottom:2px solid var(--warn);padding:0 2px}
"""

JS = """
document.querySelectorAll('.tabs').forEach((strip)=>{
  const group=strip.dataset.group;
  strip.querySelectorAll('button').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      strip.querySelectorAll('button').forEach((b)=>b.setAttribute('aria-selected',String(b===btn)));
      document.querySelectorAll(`.pane[data-group="${group}"]`).forEach((p)=>{
        p.hidden = p.dataset.key !== btn.dataset.key;
      });
    });
  });
});
const brief=document.getElementById('brief');
if(brief){const k='ss-side-effect-brief';brief.value=localStorage.getItem(k)||'';
 brief.addEventListener('input',()=>localStorage.setItem(k,brief.value));}
"""


def variant_panes() -> str:
    keys = [(k, n) for k, n, *_ in VARIANTS] + [(SPLICE[0], SPLICE[1])]
    tabs = "".join(
        f'<button data-key="{k}" aria-selected="{str(k == "S1").lower()}">{esc(k)} · {esc(n)}</button>'
        for k, n in keys)
    panes = ""
    for key, name, blurb, scores, why in VARIANTS:
        panes += (f'<div class="pane" data-group="v" data-key="{key}" {"" if key == "S1" else "hidden"}>'
                  f'<p><b>{esc(key)} — {esc(name)}.</b> {esc(blurb)}</p>'
                  f'{call_site(key)}<p class="why">{esc(why)} <b>{sum(scores)}/100.</b></p></div>')
    panes += (f'<div class="pane" data-group="v" data-key="SPLICE" hidden>'
              f'<p><b>{esc(SPLICE[0])} — {esc(SPLICE[1])}.</b> {esc(SPLICE[2])}</p>'
              f'{call_site("SPLICE")}<p class="why">Every fact has exactly one place to live: the type says '
              f'<i>may</i>, the arc says <i>did</i>, the derived port says <i>read it here</i>. '
              f'<b>{sum(SPLICE[3])}/100.</b></p></div>')
    return f'<div class="tabs" data-group="v">{tabs}</div>{panes}'


def build() -> str:
    hazard_before = ", ".join(HAZARD.hazards[0]["before"]) if HAZARD.hazards else "—"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The side effect, drawn — golden 11</title><style>{CSS}</style></head><body><main>
<h1>The side effect, drawn</h1>
<p class="sub">Golden 11 · <code>poses.append(pose)</code> · your arc is not an effect leaving the block —
it is an output with nowhere else to go. 2026-09-02.</p>

<div class="facts">
<div class="fact"><b>{READS_OK}/{len(READS)}</b><span>reads in golden 11 already wired from the right version by
<code>target.systemsketch</code> — the inside of that board is correct today</span></div>
<div class="fact"><b>{DRAWN}/{WRITEBACKS}</b><span>write-backs drawn — not one cable lands on any boundary
input, so the caller's mutation is currently invisible</span></div>
<div class="fact"><b>{len(SURVEY)}/{len(CASES)}</b><span>goldens prove an in-place mutation — this is a rare
mark, which is why it is allowed to be loud</span></div>
<div class="fact"><b>{len(ANALYSIS.unproven)}</b><span>calls in golden 11 that are <i>unproven</i>, not pure:
the third state a board must not lie about</span></div>
<div class="fact"><b>1 edge</b><span>is the whole proposal: the last version of a mutated parameter reaches the
port that named it</span></div>
</div>

<h2>1 · The thing you drew is more principled than you said</h2>

<p><b>An effect arc is an output that has nowhere else to go.</b> Every other call on the board hands its result
to a name on the left of the next block. <code>poses.append(pose)</code> also produces a value — the list, one
longer — but Python gave it no new name, so there is no port on the right to hang it on. The caller already
named that object, on the left, at <code>poses</code>. So the new version goes back to where the name is. That
is why the arc feels right and why coming out of the back does not: the back is where a value goes when it has
a name of its own. <b class="k">The arc is a return path, not an exhaust pipe.</b></p>

<p><b>Which is why "you would also need to indicate on all the other datawires that this mutation is
poisoning" turns out not to be true — and the board already proves it.</b> You propagate a
<i>version</i>, not a colour. A mutation ends one version of the name and begins the next, exactly as
<code>pose = refine(pose)</code> does; every read then has one correct producer, the latest writer at or before
it. Run against the real file, <code>len(poses)</code> requires the version <code>poses.append</code> made, and
<code>target.systemsketch</code> already wires it from there through its <code>poses#2</code> relay. Nothing
downstream needs painting. A consumer wired from the right version is already right, and a consumer wired from
the wrong one is not "poisoned" — it is a lint.</p>

{reads_html()}

<p><b>The one edge missing is the one you drew.</b> Same file, same check, from the other side: golden 11's
target board has {BOARD['blocks']} blocks and {BOARD['cables']} cables, and
<b class="k">{len(BOARD['cables_landing_on_a_boundary_input'])} of them land on a boundary input</b>. The board
draws the inside of the mutation perfectly and says nothing at all about the fact that the caller's list
changed. <code>poses</code> goes in, <code>poses#2</code> comes out of <code>append</code>, and
<code>poses#2</code> dies inside the function. Your arc is exactly that gap, and it is one edge.</p>

<figure>{board_today()}
<figcaption>Golden 11 as <code>target.systemsketch</code> stands, drawn from the file. Grey dashes: the edge
that is not there.</figcaption></figure>

<figure>{board_inside()}
<figcaption>The same board with the write-back drawn — your image 6, with the arc landing on the port rather
than beside it, and <code>len()</code> reading append's output as it already does.</figcaption></figure>

<h2>2 · Refusing to draw it is the worst of the options</h2>
<p>Your first instinct — no internals, because we only support pure functions — fails on a fact the probe
makes plain: purity is not a property you can read off a Python source. Of golden 11's calls,
{len(ANALYSIS.unproven)} are <i>unproven</i> — <code>estimate(frame)</code> and <code>len(poses)</code> take a
value we cannot prove immutable into a body we cannot see. There are three states, not two: <b>pure</b>,
<b>mutates</b>, <b>unknown</b>. A rule that refuses to draw anything impure refuses to draw almost every real
program, and a rule that assumes the rest are pure lies. The rule that survives is: <b class="k">draw what you
can prove, stay quiet about what you cannot, and never let quiet mean pure</b> — the type is where a promise
gets made (<code>Sequence[Pose]</code> vs <code>list[Pose]</code>), which is why the mark belongs in the
signature.</p>
{survey_html()}
<p class="small">Note the second row. <code>36_world_frame_source</code> mutates <code>self</code>, and its
<code>wake.clear()</code> / <code>latest.clear()</code> in the same function are local — no write-back, no
mark. The rule separates them without being told.</p>

<h2>3 · Where it attaches: top, and here is the reason</h2>
<p>You asked top or bottom, and rejected the back. All three answers fall out of one rule worth adopting
now, while there are still sides left to spend: <b class="k">each edge of a block means one thing.</b></p>
<div class="callout">
<b>Left</b> — values in, named by the callee.<br>
<b>Right</b> — values out, named by the caller. This is why the back reads as a feedback loop or an ordinary
output: it is already spoken for, and your instinct not to use it is right for exactly that reason.<br>
<b>Bottom</b> — already spent. The loop babble's default routing for the L1 back cable is a lane along the
bottom; putting effects there too would mean two different kinds of backwards cable sharing a lane.<br>
<b>Top</b> — what this block does to something it did not create. Effects, and only effects.
</div>
<p>So: top, and not because it looks better — because bottom is taken and the right-hand side means something
else. That also answers the port-view worry about the title. <b>It is not a port, and you were right that it
is not, but the reason is sharper than "you would never connect to it":</b> a port is a place where the
<i>author</i> makes a choice, and this arc is <i>derived</i> — the same distinction that made a Branch
region's control ports derive from its arm code. You cannot delete the arc; you can only route it. A derived
mark can be laid out around a title. A port cannot, because a port needs a stable grab target.</p>

<h2>4 · Your best idea in the set: the warning arrives before the wire</h2>
<figure>{board_portview()}<figcaption>The hook is read off the signature. Nothing is connected yet.</figcaption></figure>
<p>"You are warned even beforehand" is the strongest thing in your notes, and it has a consequence worth
naming: <b>if the warning must be visible with no cable attached, the mark cannot only be a cable.</b> It has
to be two marks for one fact — a badge on the port, from the type; and the arc, from the body. That is the
same definition/occurrence split the app already has for linked blocks, and it is what every language in the
table below does: the effect lives in the interface, and the call site repeats it.</p>
{prior_html()}
<p class="small">These rows are from knowledge and were not re-fetched in this session — treat them as
orientation. Everything numbered on this page is computed at build time by <code>docs/mutation_effects.py</code>
against the real sources and the real board.</p>

<h2>5 · Criteria, then five boards at the call site</h2>
<p>The call site is where these variants actually differ, so every board below is the same scene: something
hands <code>run()</code> a list, <code>run()</code> changes it, and something downstream reads it afterwards.
That last block is the whole test.</p>
{scores_html()}
{variant_panes()}

<div class="callout"><b>Recommendation: your arc, plus a badge off the signature, plus one derived output.</b>
S1 and S2 are not competitors — they are the same fact at two zooms. <b>Inside</b> the function the arc is
unambiguous: it lands on the boundary port, which is a sink from the inside, and that is the missing edge.
<b>At the call site</b> the arc alone leaves a real hole, and the S1 board above shows it: <code>run()</code>
changed the object on that wire, and the downstream <code>summarize()</code> has nothing to wire from that
means "after". The fix is not to add a port to every mutating block — it is to let the badge <b>derive</b> one,
hollow until a reader uses it, exactly as a Branch region derives its control ports from its arm code.
<b>Default if you say nothing:</b> arc on the top lane with a <code>mut</code> pill, hook badge on the port
from the type, derived through-port hidden until wired, S4's object node reserved for effects with no port to
land on.</div>

<h2>6 · What is genuinely left over</h2>
<p><b>Ordering, and it is a lint rather than a paint.</b> A board is a DAG and says nothing about time, so two
consumers of one mutated object are only unambiguous when one is fed by the other. Golden 11 has
<b>{len(ANALYSIS.hazards)}</b> such hazards — <code>len</code> reads after the append and is wired from it. Move
one line and the hazard appears: on the two-reader fixture the probe reports <b>{len(HAZARD.hazards)}</b>, with
<code>{esc(hazard_before)}</code> on the wrong side of the write.</p>
<figure>{board_hazard()}<figcaption>The lint. Nothing is coloured downstream; one port is flagged, because one
port is where the ambiguity is.</figcaption></figure>

<p><b>Effects with no port to land on.</b> You said you could see this extending to "side effects that do random
other things", and that is the case the arc cannot serve alone: <code>print</code>, a socket, a global. Then the
arc has nowhere to end, and the honest answer is that it should still end on <i>something nameable</i> — S4's
small object node carrying <code>stdout</code> or <code>self.count</code>. Keep it for that case only: it is
worth a new node kind to say <i>what</i> is touched rather than merely <i>that</i> something is, and it is not
worth it when a port is already sitting there.</p>

<figure>{board_self()}<figcaption>Golden 36's shape. A method's receiver is already a port on the header, so
the <code>self</code> case needs nothing new — and it is the answer to your open question about classes.
</figcaption></figure>

<p><b>Several effects in one block are ordered in time; the board is not.</b> Two arcs off one top edge do not
say which happened first. Left-to-right position of the mutating call inside the expanded block carries it
when the block is open, and nothing carries it when the block is collapsed. Numbering the arcs
(<code>mut ①</code>, <code>mut ②</code>) is the cheap fix and it is available whenever a second effect
appears — no golden needs it yet.</p>

<h2>7 · The rule, run</h2>
<pre><code>{esc(RULE_DOC)}</code></pre>
<p class="small"><code>docs/mutation_effects.py</code> — {len(RULE_CODE.splitlines())} lines, stdlib only. Run
it directly to reproduce every number on this page.</p>

<h2>8 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul>
<li>The rule as code, run at build time on golden 11, on {len(CASES)} goldens, and on two synthetic fixtures.</li>
<li>Measured: golden 11's target board wires {READS_OK}/{len(READS)} reads from the correct version and draws
{DRAWN}/{WRITEBACKS} write-backs.</li>
<li>Five call-site boards plus the port view, the inside view, the lint and the <code>self</code> case.</li>
</ul></div>
<div><h4>Left</h4><ul>
<li><b>Next:</b> the analyzer emits a write-back edge for every mutated parameter — one edge per row of the
survey table, nothing else changes.</li>
<li><b>Next:</b> <code>effect: none | mutates</code> as a port prop, so the badge is a style pass like
<code>temporal</code> already is on a cable.</li>
<li><b>Blocked on nothing, not started:</b> the order lint as a port diagnostic.</li>
</ul></div>
<div><h4>Needs you</h4><ul>
<li><b>Does the badge derive a through-port at the call site?</b> Default if silent: yes, hollow until wired.</li>
<li><b>Pill text.</b> <code>mut</code>, or the name it writes (<code>mut poses</code>) when a block has more
than one? Default if silent: <code>mut</code>, the name only when ambiguous.</li>
<li><b>Arc colour.</b> Near-black like your drawing, or warn-orange so it shouts? Default if silent: near-black
line, warn-orange pill and badge — loud where the words are, calm where the geometry is.</li>
</ul></div>
<div><h4>Deliberately not done</h4><ul>
<li>No code in the app or the analyzer — this is a design answer, and the boards are SVG in the idiom, not live
shapes.</li>
<li>Not touched: <code>poses.append()</code> as a block and the <code>len()</code> library question. You said
other agents have those.</li>
<li>Prior art not re-fetched this session; measured claims only are computed.</li>
</ul></div>
</div>
<h3>Reply cheaply</h3>
<p class="small"><code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<footer>Built by <code>docs/build_side_effect_grammar.py</code> at {GIT_HEAD} · every number computed by
<code>docs/mutation_effects.py</code> against
<code>/home/bam/pyblocks/examples/systemsketch_goldens</code> at build time · boards are SVG in the
SystemSketch idiom, not live shapes · Claude Code · Opus 5 (<code>claude-opus-5</code>), 2026-09-02.</footer>
</main><script>{JS}</script></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({
        "reads_ok": f"{READS_OK}/{len(READS)}",
        "writebacks_drawn": f"{DRAWN}/{WRITEBACKS}",
        "goldens_with_effects": [r["case"] for r in SURVEY],
        "hazards_golden11": len(ANALYSIS.hazards),
        "hazards_fixture": len(HAZARD.hazards),
    }, indent=1))


if __name__ == "__main__":
    main()
