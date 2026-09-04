#!/usr/bin/env python3
"""Build `docs/loop-control-icons-2026-09-03.html`: five ways to PLACE `break` /
`continue` icons when there is more than one, nested inside a Branch's arms.

Zach picked B5 from the break gallery (`while-loop-break-2026-09-03.html`): a
small inline icon, no wire, sitting right at the block that can exit. He then
generalised it himself (2026-09-03): "break really is not data flow at all...
nothing flows into them, they just are, like, things that you put in it," and
asked for `continue` to join the same family. The open question isn't the icon
anymore — it's the POLICY for where multiple icons go when they're scattered
across different arms of a Branch: "if it was a branch and you had these breaks
in there, then I think you can, in each of those kind of branches, try to
intelligently put the continue or break icons... one per kind of control branch
of flow." He also named the reading-order rule that's shared by all five below,
not a variable: data reads left to right; a reader following code top to bottom
should meet each break/continue exactly where it fires in that order.

The fixture: the same `While Loop` / `refine()` / `check()` skeleton as the
break gallery, with a nested 3-arm Branch between them — `if error > big: break`,
`elif drift > tol: continue`, `else:` (falls through to `check()`) — so a reader
sees two DIFFERENT icons, in two DIFFERENT arms, in one board.

Run:  python3 docs/build_loop_control_icons.py
"""

from __future__ import annotations

import html
import math
import subprocess
import sys
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "loop-control-icons-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, frame, note, polycable, text,
)

TODAY = "2026-09-03"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
BREAK = "#c0392b"
ARM0_HUE = "#b45309"   # P5 only: the "if" arm's own accent
ARM1_HUE = "#2563eb"   # P5 only: the "elif" arm's own accent

# --------------------------------------------------------------------------
# Icon family — one language for "control, not data": red ink, distinct shape
# per kind, never wired.
# --------------------------------------------------------------------------


def break_icon(svg: SVG, x, y, r=9, color=BREAK):
    pts = ",".join(f"{x + r * math.cos(a)},{y + r * math.sin(a)}" for a in [i * 0.785398 for i in range(8)])
    svg.add(f'<polygon points="{pts}" fill="#fff" stroke="{color}" stroke-width="1.8"/>')
    svg.add(text(x, y + 4, "!", size=10, weight=700, anchor="middle", color=color))


def continue_icon(svg: SVG, x, y, w=24, h=17, color=BREAK):
    svg.add(f'<rect x="{x - w / 2}" y="{y - h / 2}" width="{w}" height="{h}" rx="{h / 2}" fill="#fff" stroke="{color}" stroke-width="1.6"/>')
    svg.add(text(x, y + 4, "»", size=11, weight=700, anchor="middle", color=color))


def repo_facts() -> dict:
    model = (REPO / "src" / "loop" / "loopModel.ts").read_text(encoding="utf-8")
    return {
        "hasLoopShape": (REPO / "src" / "loop" / "LoopShapeUtil.tsx").exists(),
        "loopModelMentionsContinue": "continue" in model.lower(),
        "priorBreakGallery": (DOCS / "while-loop-break-2026-09-03.html").exists(),
    }


FACTS = repo_facts()

# --------------------------------------------------------------------------
# Shared fixture
# --------------------------------------------------------------------------

REG = dict(x=440, y=100, w=1080, h=680)
BRANCH = dict(x=520, y=320, w=680)
ARM_LABELS = ["if error > big:", "elif drift > tol:", "else:"]
ARM_H = 60
ARM_KIND = ["break", "continue", None]


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


def region_shell(svg: SVG) -> dict:
    x, y, w, h = REG["x"], REG["y"], REG["w"], REG["h"]
    band_h = 32
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + band_h}" x2="{x + w}" y2="{y + band_h}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(f'<circle cx="{x}" cy="{y}" r="6" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
    svg.add(text(x + w / 2, y + 20, "While Loop", size=14, weight=700, color=INK, anchor="middle"))
    return {"x": x, "y": y, "w": w, "h": h, "right": x + w, "band_bottom": y + band_h, "bottom": y + h, "corner": (x, y)}


def draw_arms(svg: SVG, x, y, w, label_color=None):
    """The nested Branch, drawn with full control over each arm's label row —
    what a break/continue policy actually needs to hang its icon on."""
    out = []
    cy = y
    for i, label in enumerate(ARM_LABELS):
        if i > 0:
            svg.add(f'<line x1="{x}" y1="{cy}" x2="{x + w}" y2="{cy}" stroke="{THICK}" stroke-width="1.6"/>')
        label_y = cy + 16
        color = label_color(i) if label_color else INK
        svg.add(text(x + 16, label_y, label, size=12.5, weight=700, color=color, mono=True))
        body_top = cy + 24
        out.append({"i": i, "label_y": label_y, "row_top": cy, "body_top": body_top, "h": ARM_H, "rect": (x, cy, w, 24 + ARM_H), "kind": ARM_KIND[i]})
        cy = body_top + ARM_H
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{cy - y}" rx="4" fill="none" stroke="#c9ccd5" stroke-width="1"/>')
    return out, cy


def draw_body(svg: SVG, reg: dict, *, arm_icons, label_color=None, extra=None) -> dict:
    """Everything shared: frame, boundary ports, estimate(), the settled corner
    ring, refine(), the nested branch (arms drawn, icons placed by the caller
    via `arm_icons(svg, arm)`), check(), the back cable + z⁻¹ chip, the exit
    cable, the zero-iterations cable."""
    frame(svg, 20, 20, 1560, 850, "track()")
    fr = boundary_in(svg, 20, 175, "frame", "Frame")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    tol = boundary_in(svg, 20, 440, "tol", "float", NUMBER)
    estimate = block(svg, 150, 200, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    svg.add(cable(fr, estimate["in"]["frame"], mid=110))
    svg.add(cable(gain, estimate["in"]["gain"], mid=110))

    corner = reg["corner"]
    svg.add(cable(tol, corner, kind="control", mid=405))

    refine = block(svg, 520, 180, 190, "refine()", [{"name": "pose", "type": "Pose"}, {"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    pose_in = refine["in"]["pose"]
    svg.add(cable(estimate["out"]["Pose"], pose_in, mid=430))
    svg.add(polycable([fr, (110, fr[1]), (110, 330), (480, 330), (480, refine["in"]["frame"][1]), refine["in"]["frame"]]))

    bx, by, bw = BRANCH["x"], BRANCH["y"], BRANCH["w"]
    svg.add(cable(refine["out"]["Pose"], (bx, by), kind="control", mid=780))
    arms, branch_bottom = draw_arms(svg, bx, by, bw, label_color)
    for arm in arms:
        if arm["kind"] and arm_icons:
            arm_icons(svg, arm)
    fallthrough = arms[2]
    fy = fallthrough["body_top"] + 15
    svg.add(f'<circle cx="{bx + bw}" cy="{fy}" r="7" fill="{ANY}" stroke="{ANY}" stroke-width="2"/><circle cx="{bx + bw}" cy="{fy}" r="3" fill="none" stroke="#fff" stroke-width="1.6"/>')
    svg.add(text(bx + bw - 12, fy - 8, "pose (else only)", size=9.5, color=MUTED, italic=True, anchor="end"))

    check = block(svg, 1280, 380, 190, "check()", [{"name": "pose", "type": "Pose"}], [{"name": "pose", "type": "Pose"}, {"name": "ok", "type": "Bool"}])
    svg.add(cable((bx + bw, fy), check["in"]["pose"], mid=1240))

    lane_y = reg["bottom"] - 30
    back_pts = [check["out"]["pose"], (1500, check["out"]["pose"][1]), (1500, lane_y), (490, lane_y), (490, pose_in[1]), pose_in]
    svg.add(polycable(back_pts))
    arrowhead(svg, pose_in[0], pose_in[1])
    mx, my = lane_label_pos(back_pts)
    w = 34
    svg.add(f'<rect x="{mx - w / 2}" y="{my - 10}" width="{w}" height="20" rx="10" fill="#fff" stroke="{INK}" stroke-width="1.3"/>')
    svg.add(text(mx, my + 4.5, "z⁻¹", size=12, weight=700, anchor="middle", mono=True))
    svg.add(text(mx + w / 2 + 8, my - 7, "seed = estimate()", size=10.5, color=MUTED, italic=True))

    pose_out = boundary_out(svg, 1540, check["out"]["pose"][1], "pose", "Pose")
    svg.add(polycable([check["out"]["pose"], (1470, check["out"]["pose"][1]), (1470, pose_out[1]), pose_out], dashed=True))
    ex, ey = estimate["out"]["Pose"]
    svg.add(polycable([(ex, ey), (400, ey), (400, 810), (1480, 810), (1480, pose_out[1]), pose_out]))
    svg.add(text(950, 804, "zero iterations: the seed is returned", size=10.5, color=MUTED, italic=True, anchor="middle"))

    if extra:
        extra(svg, arms, reg)

    return {"arms": arms, "branch_rect": (bx, by, bw, branch_bottom - by)}


# --------------------------------------------------------------------------
# The five placement policies
# --------------------------------------------------------------------------


def icon_for(arm):
    return break_icon if arm["kind"] == "break" else continue_icon


def p1_inline_after_label(svg, arm):
    """P1 · Fully local — the icon sits right after the arm's own label text, same row."""
    x, y, w, h = arm["rect"]
    approx_w = 7.6 * len(ARM_LABELS[arm["i"]])
    icon_for(arm)(svg, x + 16 + approx_w + 20, arm["label_y"] - 4)
    svg.add(text(x + 16 + approx_w + 40, arm["label_y"], arm["kind"], size=10, color=BREAK, italic=True))


def p2_header_badge(svg, arm):
    """P2 · Promoted to the arm's header — right-aligned, like Branch's own fold/active affordances."""
    x, y, w, h = arm["rect"]
    icon_for(arm)(svg, x + w - 20, arm["label_y"] - 4)
    svg.add(text(x + w - 40, arm["label_y"], arm["kind"], size=10, color=BREAK, italic=True, anchor="end"))


def p3_numbered_legend(svg, arm):
    """P3 · A numbered dot in the gutter; the legend carries the detail."""
    x, y, w, h = arm["rect"]
    n = 1 if arm["i"] == 0 else 2
    cx, cy = x - 16, arm["label_y"] - 4
    svg.add(f'<circle cx="{cx}" cy="{cy}" r="9" fill="#fff" stroke="{BREAK}" stroke-width="1.6"/>')
    svg.add(text(cx, cy + 4, str(n), size=10, weight=700, anchor="middle", color=BREAK))


def p3_legend(svg, arms, reg):
    x, y = reg["x"] + 20, reg["bottom"] - 96
    svg.add(f'<rect x="{x}" y="{y}" width="420" height="60" rx="8" fill="#fff" stroke="{BORDER}" stroke-width="1"/>')
    svg.add(text(x + 12, y + 20, "① break — error too big to keep going", size=10.5, color=INK))
    svg.add(text(x + 12, y + 40, "② continue — drift only, retry same frame", size=10.5, color=INK))


def p4_spine(svg, arm):
    """P4 · Icons sit in a left gutter, threaded by a dotted spine in execution order."""
    x, y, w, h = arm["rect"]
    gx = x - 24
    icon_for(arm)(svg, gx, arm["label_y"] - 4)


def p4_spine_line(svg, arms, reg):
    gx = arms[0]["rect"][0] - 24
    y0 = arms[0]["label_y"] - 4
    y1 = arms[1]["label_y"] - 4
    # the spine: a short dotted link between consecutive exits, in execution order —
    # stays entirely in the empty gutter column, never crosses an arm's own text
    svg.add(f'<line x1="{gx}" y1="{y0 + 10}" x2="{gx}" y2="{y1 - 10}" stroke="{BREAK}" stroke-width="1.2" stroke-dasharray="3 3"/>')
    # break: a longer escape straight up the region's own margin, out past its top
    top_y = reg["y"] + 6
    svg.add(f'<line x1="{gx}" y1="{y0 - 10}" x2="{gx}" y2="{top_y}" stroke="{BREAK}" stroke-width="1.4" stroke-dasharray="6 4"/>')
    svg.add(f'<path d="M{gx - 5},{top_y + 7} L{gx},{top_y} L{gx + 5},{top_y + 7}" fill="none" stroke="{BREAK}" stroke-width="1.4"/>')
    svg.add(text(gx - 8, top_y + 20, "exits the loop", size=9, color=MUTED, italic=True, anchor="end"))
    # continue: a small local loop-back glyph BELOW the icon, entirely in the
    # gutter column — not a long line, because it re-enters right here
    lx, ly = gx, y1 + 30
    svg.add(f'<path d="M{lx - 6},{ly - 6} A6,6 0 1 1 {lx + 6},{ly - 6}" fill="none" stroke="{BREAK}" stroke-width="1.4"/>')
    svg.add(f'<path d="M{lx + 1},{ly - 12} L{lx + 6},{ly - 6} L{lx - 2},{ly - 2}" fill="none" stroke="{BREAK}" stroke-width="1.4"/>')
    svg.add(text(lx, ly + 8, "back to", size=8.5, color=MUTED, italic=True, anchor="middle"))
    svg.add(text(lx, ly + 19, "the top", size=8.5, color=MUTED, italic=True, anchor="middle"))


def label_color_p5(i):
    return {0: ARM0_HUE, 1: ARM1_HUE}.get(i, INK)


def p5_arm_accent(svg, arm):
    """P5 · Each arm owns a colour; its icon (and a left tick) carry that same colour."""
    x, y, w, h = arm["rect"]
    hue = {0: ARM0_HUE, 1: ARM1_HUE}[arm["i"]]
    svg.add(f'<line x1="{x - 4}" y1="{y + 4}" x2="{x - 4}" y2="{y + h - 4}" stroke="{hue}" stroke-width="3"/>')
    icon_for(arm)(svg, x + w - 20, arm["label_y"] - 4, color=hue)


VARIANTS = [
    {"id": "p1", "name": "Inline, right after the code", "arm_icons": p1_inline_after_label, "label_color": None, "extra": None,
     "thesis": "The icon sits on the arm's own row, immediately after the label that triggers it — `if error > big:` then the stop icon, right there, reading exactly like an inline statement.",
     "best": "Zero indirection — the icon IS the next token after the condition that causes it, which is the most literal reading of \"top to bottom, meet it where it fires.\"",
     "loses": "As arm labels get longer or more numerous, the icon's horizontal position keeps moving, so a scanning eye can't build a habit of \"look here\" — each row has to be read in full before the icon is even found."},
    {"id": "p2", "name": "Promoted to the arm header", "arm_icons": p2_header_badge, "label_color": None, "extra": None,
     "thesis": "The icon rides the arm's header row at a fixed right-aligned position — the same slot Branch already reserves for fold/make-active — so \"this arm exits\" reads at a glance without parsing the label text at all.",
     "best": "One fixed column to scan for every arm, regardless of label length; reuses the exact affordance-slot convention the Branch region already established for fold and active.",
     "loses": "Right-aligning severs the icon from the specific word or sub-expression that triggers it — for an arm with several statements, a header badge says \"this arm can exit\" but not which line."},
    {"id": "p3", "name": "Numbered dot, detail in a legend", "arm_icons": p3_numbered_legend, "label_color": None, "extra": p3_legend,
     "thesis": "Each exit gets a small numbered dot in the gutter — minimal ink at the source — and a compact legend beneath the loop spells out what each number actually does.",
     "best": "The lowest-ink option that still marks every site; scales cleanly to many exits since the legend, not the diagram, absorbs the growing detail.",
     "loses": "A number alone doesn't say break vs. continue — the reader has no idea which kind of exit ① is without leaving the arm to go read the legend, which is exactly the indirection Zach's \"I'd want to see those in those places\" was against."},
    {"id": "p4", "name": "A control-flow spine", "arm_icons": p4_spine, "label_color": None, "extra": p4_spine_line,
     "thesis": "Icons sit in a left gutter, threaded by a faint dotted line in the order they'd actually be reached — a separate visual channel from the data cables, tracing the control path the way a debugger's stepper would.",
     "best": "The only variant that shows ORDER as well as location — which exit a reader would hit first if several arms could fire in the same pass — and it says where each one actually goes (out of the loop; back to the top).",
     "loses": "A second thread running through the same board risks reading as a second, competing dataflow graph — exactly the \"two mental models\" cost this project has avoided everywhere else — and it only helps when arms genuinely execute in a fixed order."},
    {"id": "p5", "name": "Per-arm accent colour", "arm_icons": p5_arm_accent, "label_color": label_color_p5, "extra": None,
     "thesis": "Each arm earns its own thin accent (a left tick, its label's ink); the arm's break/continue icon is tinted to match, so which arm owns which exit is readable by colour alone, even across a large loop.",
     "best": "Scales best to a big loop where arms are far apart on screen — colour groups an exit with its arm without any line connecting them, and works even after scrolling one out of view.",
     "loses": "Colour is already spoken for elsewhere in this project's language (data / event-rail / delayed cable); adding a third meaning (arm identity) risks a fourth collision the moment arm count exceeds a small, easily-distinguished palette."},
]

CRITERIA = [
    ("c1", "Locates the exact triggering line, not just the arm", 25, "Zach: \"I'd wanna see those continues and breaks in those places\" — the mark should sit where the behaviour actually is."),
    ("c2", "Distinguishes break from continue without reading the legend", 20, "Two different consequences (stop vs. skip) need to be tellable apart at the icon itself, in place."),
    ("c3", "Scales past two exits in two arms", 20, "A real loop can have several breaks and continues across several arms — does the mark stay legible or degrade?"),
    ("c4", "Reuses machinery this project already has", 15, "Branch's own header-affordance slot, the shipped icon family, the gutter idiom — versus inventing a new visual channel."),
    ("c5", "Reads without following a second thread", 10, "A control-flow-specific line or numbering system asks the eye to do extra work beyond just reading top to bottom."),
    ("c6", "Says WHERE each exit actually goes", 10, "Out of the loop entirely (break) is a different destination than back to the top (continue) — does the mark say so?"),
]

SCORES = {
    "p1": {"c1": 5, "c2": 4, "c3": 2, "c4": 3, "c5": 5, "c6": 1},
    "p2": {"c1": 3, "c2": 4, "c3": 4, "c4": 5, "c5": 5, "c6": 1},
    "p3": {"c1": 3, "c2": 1, "c3": 5, "c4": 3, "c5": 2, "c6": 3},
    "p4": {"c1": 4, "c2": 4, "c3": 2, "c4": 2, "c5": 2, "c6": 5},
    "p5": {"c1": 4, "c2": 4, "c3": 4, "c4": 2, "c5": 4, "c6": 1},
}


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["scores"] = SCORES[v["id"]]
    v["total"] = weighted(v["scores"])

PRIOR = [
    ("Scratch — `stop [this script]`", "a literal C-block statement, dropped inside whichever branch of an if/else needs it — not a wire, a block in sequence", "wherever it's dropped, read top to bottom exactly like any other block", "P1 is this move exactly: the icon in the row it fires from", "[1]"),
    ("UML activity diagrams — flow final / activity final", "a small circled glyph placed inline within a swimlane or branch, ending that one token of control without a line leaving the page", "inline, at the point of termination, inside whichever branch reaches it", "P1/P2 both draw this; P2 additionally fixes its column", "[2]"),
    ("VS Code / IDE gutters", "a coloured dot or icon in the margin beside a specific line, independent of the code's own horizontal layout", "the left gutter, one per line, never inline with the text", "P3 and P4 both use a gutter; P4 adds the connecting thread", "[3]"),
    ("BPMN terminate end event", "a filled-circle icon placed inside a sub-process at the exact activity that ends it, distinct from the sub-process's normal end event", "inline within whichever branch/lane contains it", "P1/P2's per-arm placement mirrors this directly", "[4]"),
]

SOURCES = [
    (1, "MIT Scratch Wiki — Stop block (placed inside C-blocks including if/else)", "https://en.scratch-wiki.info/wiki/Stop_()"),
    (2, "Wikipedia — UML Activity diagram (final nodes)", "https://en.wikipedia.org/wiki/Activity_diagram"),
    (3, "VS Code docs — Debugging (breakpoints in the gutter)", "https://code.visualstudio.com/docs/editor/debugging"),
    (4, "Wikipedia — Business Process Model and Notation (terminate end event)", "https://en.wikipedia.org/wiki/Business_Process_Model_and_Notation"),
]

# --------------------------------------------------------------------------
# Boards
# --------------------------------------------------------------------------


def board_for(variant) -> str:
    svg = SVG(1600, 900)
    reg = region_shell(svg)
    draw_body(svg, reg, arm_icons=variant["arm_icons"], label_color=variant["label_color"], extra=variant["extra"])
    return svg.render(variant["id"])


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1520px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(32px,5vw,52px);line-height:1.03;letter-spacing:-.04em;margin:10px 0 14px;max-width:1080px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}h3{font-size:18px;margin:26px 0 8px}
p{max-width:920px}.lede{font-size:18px;color:#39424f;max-width:980px}
.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:20px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg{display:block;width:100%;height:auto}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.variant{margin-top:34px;padding-top:8px;border-top:2px solid var(--ink)}.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1160px}.cols p{margin:6px 0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:700}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:#eef4ff}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:960px;margin:14px 0}.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:960px}li{margin:5px 0}
.pick{display:flex;gap:8px;margin:10px 0 0}.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:960px;min-height:110px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1260px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1260px}.srcs li{break-inside:avoid}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
@media(max-width:900px){.facts,.cols,.decision{grid-template-columns:1fr}.srcs{columns:1}}
"""

JS = """
(function(){
  var key='loop-control-icons-2026-09-03';var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
    var lines=Object.keys(state).map(function(id){return state[id]+': '+id});var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: p2\\nBorrow from p1: keep the icon close to its trigger even in the header slot\\nAvoid: \\nWhy: ')}}
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
            + fig(board_for(v), f"<b>{html.escape(v['name'])}.</b> Same skeleton as the break gallery, now with a nested Branch: the <code>if</code> arm breaks, the <code>elif</code> arm continues, <code>else</code> falls through to <code>check()</code>.")
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
    return f"<table><tr><th>tool / theory</th><th>the mechanism</th><th>where it lands</th><th>which variant draws it</th><th>src</th></tr>{rows}</table>"


def build() -> str:
    winner = max(VARIANTS, key=lambda v: v["total"])
    facts = FACTS
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loop control icons — five placement policies</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · loops · break &amp; continue placement · {TODAY}</div>
<h1>Five ways to place <em>break</em> and <em>continue</em> when there's more than one.</h1>
<p class="lede">The icon itself is settled — B5 from the break gallery, a small inline mark with no wire, now joined by a matching <em>continue</em> glyph in the same red, un-wired family. What's still open is the POLICY: when several of these live inside different arms of a Branch, where exactly do they go? Zach named the rule that's shared by all five below, not a variable — data still reads left to right; a reader following code top to bottom should meet each break/continue exactly where it fires. The fixture nests a 3-arm Branch inside the settled <code>While Loop</code> header: <code>if error &gt; big: break</code>, <code>elif drift &gt; tol: continue</code>, <code>else:</code> falls through to <code>check()</code>. <b>{winner['id'].upper()} — {html.escape(winner['name'])} — scores highest at {winner['total']}/100</b>.</p>
<div class="facts">
<div class="fact"><b>{"yes" if facts['hasLoopShape'] else "no"}</b><span><code>src/loop/LoopShapeUtil.tsx</code> exists — the for-loop region ships today</span></div>
<div class="fact"><b>{"no" if not facts['loopModelMentionsContinue'] else "yes"}</b><span>the word "continue" appears in <code>loopModel.ts</code> — confirms this is genuinely open</span></div>
<div class="fact"><b>{"yes" if facts['priorBreakGallery'] else "no"}</b><span>the prior <a href="while-loop-break-2026-09-03.html">break gallery</a> exists — B5's icon is inherited unchanged, only its placement policy is new</span></div>
</div>

<h2>1 · Four places that already solve "place a control marker inside a specific branch"</h2>
<p>Every tool below had to answer the same question this page asks: several control-flow exits, several branches, one diagram. None of them invented a new wire for it — they either dropped a marker exactly where the exit fires, or moved it to a fixed, scannable column beside the code.</p>
{prior_html()}

<h2>2 · Criteria, then five policies</h2>
<p>Weighted before any variant existed. <b>c1</b> and <b>c6</b> are Zach's own bar, stated directly: the mark has to sit where the behaviour is, and has to say where control actually goes.</p>
{scores_html()}
<div class="callout"><b>Hinge.</b> {winner['id'].upper()} wins because it's the header-badge move Branch already uses for fold and make-active — nothing new to learn, one fixed column to scan regardless of how long an arm's label gets. Its real cost is precision: a badge on the header says "this arm can exit," not "this exact line does." P1 (inline, right after the label) answers that trade the other way — it's the most literal placement, one point behind on locating things but the cheapest to read without any legend. P4's spine is the only one that also says which DIRECTION each exit goes (out vs. back-to-top), at the cost of a second visual channel running through the board.</div>

{variants_html()}

<h2>3 · What this settles going forward</h2>
<div class="decision">
<div><h4>The icon family (unchanged from the break gallery)</h4><p class="small">Break stays the red octagon with <code>!</code>; continue is a new red rounded pill with <code>»</code> — same ink (control, not data), different shape (stop vs. skip-ahead). Return-early and raise/exception are the natural next members of this family, not explored here, but should inherit the same "no wire, inline, one shape each" rule.</p></div>
<div><h4>The shared reading-order rule</h4><p class="small">Regardless of which placement policy wins: data cables keep reading left to right, exactly as shipped. Control icons are read by following the CODE's order — top to bottom within an arm, arm to arm in source order — which is why none of the five ever reroutes a data cable to make room for an icon.</p></div>
</div>

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Five placement policies, each on the same fixture: a Branch nested in the settled Loop header, one break arm, one continue arm, one fall-through arm.</li><li>A matching <code>continue</code> glyph designed alongside the shipped break icon, same family, distinct shape.</li><li>Four sources of prior art read specifically for "place a control marker inside a branch," not control-flow diagrams in general.</li></ul></div>
<div><h4>Left</h4><ul><li><b>Next:</b> once a policy is picked, decide whether <code>return</code> and <code>raise</code> join the same family — likely yes, per §3.</li><li><b>Next:</b> a loop with break/continue nested two Branches deep (an <code>if</code> inside an <code>if</code>) — not drawn here; P2's header-badge and P5's colour both degrade gracefully, P1 and P4 need a second look.</li></ul></div>
<div><h4>Needs you (default in brackets)</h4><ul><li>Pick a placement policy [{winner['id'].upper()}, the header badge — reuses Branch's own affordance slot, one column to scan].</li><li>If exact-line precision matters more than a fixed scanning column, P1 (inline after the label) is the one to look at instead.</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No analyzer or renderer code changed; no <code>src/loop/</code> or Branch file touched. Static SVG mockups, same idiom as every prior loop babble.</li><li>No nested-branch-in-branch, no loop-in-loop, no board where a single arm has more than one exit.</li></ul></div>
</div>
<h3>Reply cheaply</h3><p class="small">Pick buttons persist in this browser; the brief mirrors them. Or in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<h2>Source index</h2>
<ol class="srcs">{''.join(f"<li id='s{i}'>{html.escape(t)} — <a href='{html.escape(u)}'>{html.escape(u)}</a></li>" for i, t, u in SOURCES)}</ol>
<footer>Built by <code>docs/build_loop_control_icons.py</code> at {GIT_HEAD} · boards are SVG in the SystemSketch idiom, not live tldraw shapes · relevant prior work: <a href="while-loop-break-2026-09-03.html">while-loop break, ten ways</a> · <a href="while-loop-header-2026-09-03.html">while-loop header, ten ways</a> · <a href="branch-regions-2026-09-02.html">branch regions</a> · Claude Code (Sonnet 5), {TODAY}.</footer>
</main><script>{JS}</script></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "scores": {v["id"]: v["total"] for v in VARIANTS}}))


if __name__ == "__main__":
    main()
