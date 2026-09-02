#!/usr/bin/env python3
"""Build `docs/branch-regions-2026-09-02.html`: five ways to draw an `if`.

Everything numeric is measured at build time: the analyzer's current lowering
of the 09_branch golden, the per-arm binding tables from
`docs/branch_arm_binding.py`, the grammar hooks that exist in the live block
model, and the fan-in rule.  The five boards are drawn from one shared fixture
so that what differs between them is only the thing under judgement: where the
merge lives.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
PYBLOCKS = Path("/home/bam/pyblocks")
GOLDENS = PYBLOCKS / "examples" / "systemsketch_goldens"
OUTPUT = DOCS / "branch-regions-2026-09-02.html"
sys.path.insert(0, str(DOCS))
sys.path.insert(0, str(PYBLOCKS))

from branch_arm_binding import arm_tables  # noqa: E402
from branch_case_view import PROTO_CSS, PROTO_JS, section_html as case_view_section  # noqa: E402

TODAY = date(2026, 9, 2).isoformat()

# --------------------------------------------------------------------------
# Measured facts
# --------------------------------------------------------------------------

SOURCE_09 = (GOLDENS / "09_branch" / "source.py").read_text(encoding="utf-8")
BODY_09 = SOURCE_09[SOURCE_09.index("def run("):].rstrip() + "\n"

NESTED_SOURCE = '''def run(raw: bytes, gain: float, mode: str) -> bytes:
    frame = decode(raw)
    if mode == "fast":
        pose = estimate(frame, gain)
    elif mode == "safe":
        pose = fallback(frame)
        if gain > 1.0:
            pose = refine(pose)
    else:
        pose = identity(frame)
    payload = encode(pose)
    return payload
'''

RETURNS_SOURCE = '''def run(raw: bytes, gain: float, fast: bool) -> bytes | Pose:
    frame = decode(raw)
    if fast:
        pose = estimate(frame, gain)
        return encode(pose)
    else:
        return fallback(frame)
'''

UNBOUND_SOURCE = '''def run(raw: bytes, fast: bool) -> bytes:
    frame = decode(raw)
    if fast:
        pose = estimate(frame)
    payload = encode(pose)
    return payload
'''


def analyzer_region_facts() -> dict:
    from pyblocks.analyzer import analyze_source

    content = analyze_source(SOURCE_09, filename="09_branch/source.py", function_id="run").to_dict()
    region = next(n for n in content["nodes"] if n["kind"] == "region")
    inputs = sorted(e["label"] for e in content["edges"] if e["target"] == region["id"])
    outputs = sorted(e["label"] for e in content["edges"] if e["source"] == region["id"])
    calls = [n["label"] for n in content["nodes"] if n["kind"] == "transform"]
    hidden = [n["label"] for n in content["nodes"] if n["kind"] == "data" and n["role"] == "free"]
    info = next((d["message"] for d in content["diagnostics"] if d["severity"] == "info"), "")
    return {
        "label": region["label"],
        "inputs": inputs,
        "outputs": outputs,
        "callsDrawn": calls,
        "calleesAsTunnels": hidden,
        "diagnostic": info,
        "nodeCount": len(content["nodes"]),
        "edgeCount": len(content["edges"]),
    }


def grammar_hooks() -> dict:
    model = (REPO / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")
    rules = (REPO / "src" / "blocks" / "connections" / "ConnectionShapeUtil.tsx").read_text(encoding="utf-8")
    hooks = {}
    for name in ("groupStart", "branchStart", "header", "expandedWeights"):
        match = re.search(rf"/\*\*\s*([^*]+?)\s*\*/\s*{name}", model)
        hooks[name] = match.group(1).strip() if match else ("present" if name in model else "absent")
    fanin = re.search(r"//\s*(Sources fan out and sinks fan in[^\n]*)", rules)
    hooks["fanIn"] = fanin.group(1).strip() if fanin else "not found"
    return hooks


def golden_ladder() -> dict:
    cases = json.loads((GOLDENS / "cases.json").read_text(encoding="utf-8"))
    cases = cases if isinstance(cases, list) else cases.get("cases", [])
    readme = (GOLDENS / "README.md").read_text(encoding="utf-8")
    next_axes = re.search(r"13 · early return / multiple exits", readme) is not None
    return {"count": len(cases), "earlyReturnPlanned": next_axes}


FACTS = analyzer_region_facts()
HOOKS = grammar_hooks()
LADDER = golden_ladder()
TABLE_09 = arm_tables(SOURCE_09)
TABLE_NESTED = arm_tables(NESTED_SOURCE)
TABLE_RETURNS = arm_tables(RETURNS_SOURCE)
TABLE_UNBOUND = arm_tables(UNBOUND_SOURCE)
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BG, BORDER, CABLE, FRAME, INK, MONO, MUTED, NUMBER, PAD_BOTTOM, REGION, ROW, SANS, SVG, THICK, TITLE_BAND, WARN,
    block, boundary_in, boundary_out, cable, chip, dot, frame, note, polycable, region, text, yield_dot,
)

# --------------------------------------------------------------------------
# Fixture A — the 09_branch golden, five merges
# --------------------------------------------------------------------------


def fixture_a_common(svg: SVG, *, with_region=True, arms_opacity=(1.0, 1.0)):
    frame(svg, 20, 20, 1340, 560, "run()")
    raws = boundary_in(svg, 20, 175, "raws", "bytes")
    gain = boundary_in(svg, 20, 310, "gain", "float", NUMBER)
    fast = boundary_in(svg, 20, 450, "fast", "bool")
    decode = block(svg, 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    svg.add(cable(raws, decode["in"]["raw"]))
    return {"raws": raws, "gain": gain, "fast": fast, "decode": decode}


def arms_a(svg: SVG, base, *, region_x=440, opacity=(1.0, 1.0)):
    estimate = block(svg, 560, 205, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}], opacity=opacity[0])
    fallback = block(svg, 560, 385, 230, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}], opacity=opacity[1])
    d = base["decode"]["out"]["Frame"]
    svg.add(cable(d, estimate["in"]["frame"], mid=410, opacity=opacity[0]))
    svg.add(cable(d, fallback["in"]["frame"], mid=410, opacity=opacity[1]))
    svg.add(cable(base["gain"], estimate["in"]["gain"], mid=380, opacity=opacity[0]))
    return estimate, fallback


def board_v1() -> str:
    svg = SVG(1380, 600)
    base = fixture_a_common(svg)
    reg = region(svg, 440, 130, 460, [{"label": "if fast:", "h": 144, "header": True}, {"label": "else:", "h": 166}])
    est, fb = arms_a(svg, base)
    svg.add(cable(base["fast"], reg["headers"][0], kind="control", mid=400))
    encode = block(svg, 1030, 290, 200, "encode()", [{"name": "pose", "type": "Pose", "slots": 2}], [{"name": "bytes"}])
    top, bottom = encode["in"]["pose"]
    svg.add(cable(est["out"]["Pose"], top, mid=960))
    svg.add(cable(fb["out"]["Pose"], bottom, mid=960))
    out = boundary_out(svg, 1360, 341, "bytes", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1300))
    note(svg, 1030, 400, "one-of receiver: the two cables land on")
    note(svg, 1030, 416, "sub-slots of one port, a half-line between them")
    return svg.render("V1 fan-in at the consumer")


def board_v2(*, lens=False) -> str:
    svg = SVG(1380, 600)
    dim = 0.22 if lens else 1.0
    base = fixture_a_common(svg)
    reg = region(svg, 440, 130, 460, [{"label": "if fast:", "h": 144, "header": True}, {"label": "else:", "h": 166}], yields=[{"name": "pose", "y": 330}])
    est, fb = arms_a(svg, base, opacity=(1.0, dim))
    svg.add(cable(base["fast"], reg["headers"][0], kind="control-accent" if lens else "control", mid=400))
    y = (reg["right"], 330)
    svg.add(cable(est["out"]["Pose"], y, mid=850, color=ACCENT if lens else None, width=2.2 if lens else None))
    svg.add(cable(fb["out"]["Pose"], y, mid=850, opacity=dim))
    encode = block(svg, 1030, 290, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(y, encode["in"]["pose"], mid=960, color=ACCENT if lens else None, width=2.2 if lens else None))
    out = boundary_out(svg, 1360, 341, "bytes", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1300, color=ACCENT if lens else None, width=2.2 if lens else None))
    if lens:
        chip(svg, 470, 560, "lens: fast = True — the else arm and its cable dim; nothing is duplicated", ACCENT)
    else:
        note(svg, 905, 356, "← yield: the region's only port,")
        note(svg, 905, 372, "one per name any arm writes (φ)")
    return svg.render("V2 yield on the region border" + (" — path lens" if lens else ""))


def board_v3() -> str:
    svg = SVG(1380, 600)
    base = fixture_a_common(svg)
    reg = region(svg, 440, 130, 420, [{"label": "if fast:", "h": 144, "header": True}, {"label": "else:", "h": 166}])
    est, fb = arms_a(svg, base)
    svg.add(cable(base["fast"], reg["headers"][0], kind="control", mid=400))
    merge = block(svg, 930, 300, 120, "φ pose", [{"name": "if"}, {"name": "else"}], [{"name": "Pose"}])
    svg.add(cable(est["out"]["Pose"], merge["in"]["if"], mid=880))
    svg.add(cable(fb["out"]["Pose"], merge["in"]["else"], mid=880))
    encode = block(svg, 1110, 290, 190, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(merge["out"]["Pose"], encode["in"]["pose"], mid=1080))
    out = boundary_out(svg, 1360, 341, "bytes", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1330))
    note(svg, 930, 420, "a free-standing merge node, movable;")
    note(svg, 930, 436, "the region is a bare container")
    return svg.render("V3 merge node after the region")


def board_v4() -> str:
    svg = SVG(1380, 600)
    base = fixture_a_common(svg)
    est = block(svg, 560, 200, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    fb = block(svg, 560, 400, 230, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    d = base["decode"]["out"]["Frame"]
    svg.add(cable(d, est["in"]["frame"], mid=410))
    svg.add(cable(d, fb["in"]["frame"], mid=410))
    svg.add(cable(base["gain"], est["in"]["gain"], mid=380))
    sel = block(svg, 880, 280, 170, "select()", [{"name": "if", "type": "Pose"}, {"name": "else", "type": "Pose", "branch": True}], [{"name": "Pose"}], header={"name": "fast"})
    svg.add(cable(base["fast"], sel["header"], kind="control", mid=400))
    svg.add(cable(est["out"]["Pose"], sel["in"]["if"], mid=830))
    svg.add(cable(fb["out"]["Pose"], sel["in"]["else"], mid=830))
    encode = block(svg, 1130, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(sel["out"]["Pose"], encode["in"]["pose"], mid=1090))
    out = boundary_out(svg, 1360, 341, "bytes", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1330))
    chip(svg, 560, 540, "both estimate() and fallback() run — not what the statement says")
    note(svg, 880, 420, "right for `a if c else b`; wrong for an if statement")
    return svg.render("V4 select block, no region")


def board_v5() -> str:
    svg = SVG(1380, 600)
    base = fixture_a_common(svg)
    fork = (440, 330)
    join = (900, 330)
    svg.add(f'<line x1="{fork[0]}" y1="{fork[1]}" x2="{join[0]}" y2="{join[1]}" stroke="{THICK}" stroke-width="2.4"/>')
    svg.add(f'<line x1="{fork[0]}" y1="{fork[1] - 14}" x2="{fork[0]}" y2="{fork[1] + 14}" stroke="{THICK}" stroke-width="2.4"/>')
    svg.add(dot(fork[0], fork[1], ANY, True, r=5))
    svg.add(yield_dot(join[0], join[1]))
    svg.add(text(456, 318, "if fast:", size=12, weight=700))
    svg.add(text(456, 350, "else:", size=12, weight=700))
    svg.add(text(912, 318, "pose", size=11.5))
    est, fb = arms_a(svg, base)
    svg.add(cable(base["fast"], fork, kind="control", mid=400))
    svg.add(cable(est["out"]["Pose"], join, mid=850))
    svg.add(cable(fb["out"]["Pose"], join, mid=850))
    encode = block(svg, 1030, 290, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(join, encode["in"]["pose"], mid=960))
    out = boundary_out(svg, 1360, 341, "bytes", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1300))
    note(svg, 440, 560, "no frame: the branch is one thick divider from the fork to the join; nesting is a thinner divider")
    return svg.render("V5 divider bands, no frame")


# --------------------------------------------------------------------------
# Fixture B — conditional returns: two output rows on the def
# --------------------------------------------------------------------------


def board_returns() -> str:
    svg = SVG(1380, 560)
    frame(svg, 20, 20, 1340, 520, "run()")
    raws = boundary_in(svg, 20, 175, "raws", "bytes")
    gain = boundary_in(svg, 20, 300, "gain", "float", NUMBER)
    fast = boundary_in(svg, 20, 440, "fast", "bool")
    decode = block(svg, 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    svg.add(cable(raws, decode["in"]["raw"]))
    reg = region(svg, 440, 130, 620, [{"label": "if fast:", "h": 144, "header": True}, {"label": "else:", "h": 166}])
    svg.add(cable(fast, reg["headers"][0], kind="control", mid=400))
    est = block(svg, 500, 205, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    enc = block(svg, 800, 205, 190, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    fb = block(svg, 500, 385, 220, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    d = decode["out"]["Frame"]
    svg.add(cable(d, est["in"]["frame"], mid=410))
    svg.add(cable(d, fb["in"]["frame"], mid=410))
    svg.add(cable(gain, est["in"]["gain"], mid=380))
    svg.add(cable(est["out"]["Pose"], enc["in"]["pose"], mid=760))
    # boundary outputs: two groups split by a half line on the frame's right edge
    svg.add(f'<line x1="{1360 - 46}" y1="330" x2="1360" y2="330" stroke="{THICK}" stroke-width="1.8"/>')
    o1 = boundary_out(svg, 1360, 256, "bytes", "bytes")
    o2 = boundary_out(svg, 1360, 436, "Pose", "Pose")
    svg.add(cable(enc["out"]["bytes"], o1, mid=1200))
    svg.add(cable(fb["out"]["Pose"], o2, mid=1200))
    note(svg, 1090, 300, "each return is an output row;")
    note(svg, 1090, 316, "the half line says one of them fires")
    return svg.render("Conditional returns become output rows")


def board_caller() -> str:
    svg = SVG(520, 230)
    run = block(svg, 150, 40, 240, "run()", [{"name": "raw", "type": "bytes", "connected": False}, {"name": "gain", "type": "float", "color": NUMBER, "connected": False}, {"name": "fast", "type": "bool", "connected": False}], [{"name": "bytes", "connected": False}, {"name": "Pose", "branch": True, "connected": False}])
    note(svg, 150, 190, "what a caller sees: the settled half-line output group", size=11)
    return svg.render("Caller-side port view")


# --------------------------------------------------------------------------
# Fixture C — nested elif with a pass-through, V2
# --------------------------------------------------------------------------


def board_nested() -> str:
    svg = SVG(1380, 730)
    frame(svg, 20, 20, 1340, 690, "run()")
    raws = boundary_in(svg, 20, 175, "raws", "bytes")
    gain = boundary_in(svg, 20, 330, "gain", "float", NUMBER)
    mode = boundary_in(svg, 20, 540, "mode", "str", "#4caf50")
    decode = block(svg, 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    svg.add(cable(raws, decode["in"]["raw"]))
    reg = region(
        svg, 430, 120, 530,
        [{"label": 'if mode == "fast":', "h": 130, "header": True}, {"label": 'elif mode == "safe":', "h": 236, "header": True}, {"label": "else:", "h": 92}],
        yields=[{"name": "pose", "y": 470}],
    )
    svg.add(cable(mode, reg["headers"][0], kind="control", mid=395))
    svg.add(cable(mode, reg["headers"][1], kind="control", mid=395))
    est = block(svg, 540, 190, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    fb = block(svg, 470, 380, 170, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    inner = region(svg, 657, 352, 245, [{"label": "if gain > 1.0:", "h": 96, "header": True}, {"label": "(unchanged)", "h": 40, "muted": True}], nested=True, yields=[{"name": "pose", "y": 500}])
    refine = block(svg, 705, 392, 170, "refine()", [{"name": "pose", "type": "Pose"}], [{"name": "Pose"}])
    ident = block(svg, 540, 608, 190, "identity()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    d = decode["out"]["Frame"]
    svg.add(cable(d, est["in"]["frame"], mid=400))
    svg.add(cable(d, fb["in"]["frame"], mid=400))
    svg.add(cable(d, ident["in"]["frame"], mid=400))
    svg.add(cable(gain, est["in"]["gain"], mid=380))
    svg.add(cable(gain, inner["headers"][0], kind="control", mid=380))
    svg.add(cable(fb["out"]["Pose"], refine["in"]["pose"], mid=655))
    # the pass-through: fallback's pose runs along the unchanged lane straight into the inner yield
    fx, fy = fb["out"]["Pose"]
    inner_yield = (inner["right"], 500)
    svg.add(polycable([(fx, fy), (652, fy), (652, 500), inner_yield]))
    svg.add(cable(refine["out"]["Pose"], inner_yield, mid=892))
    outer_yield = (reg["right"], 470)
    svg.add(cable(est["out"]["Pose"], outer_yield, mid=915))
    svg.add(cable(inner_yield, outer_yield, mid=925))
    svg.add(cable(ident["out"]["Pose"], outer_yield, mid=945))
    encode = block(svg, 1060, 420, 190, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(outer_yield, encode["in"]["pose"], mid=1010))
    out = boundary_out(svg, 1360, 471, "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1310))
    note(svg, 675, 540, "pass-through: the arm that did not write pose still yields it", size=10.5)
    note(svg, 430, 700, "elif is a third arm of the same region, not a region inside the else; a real nested if is the thin frame", size=11)
    return svg.render("Nested elif with a pass-through, drawn as V2")


def board_unbound() -> str:
    svg = SVG(1000, 380)
    frame(svg, 20, 20, 960, 340, "run()")
    raws = boundary_in(svg, 20, 150, "raws", "bytes")
    fast = boundary_in(svg, 20, 290, "fast", "bool")
    decode = block(svg, 120, 100, 180, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    svg.add(cable(raws, decode["in"]["raw"]))
    reg = region(svg, 380, 110, 300, [{"label": "if fast:", "h": 120, "header": True}], )
    svg.add(cable(fast, reg["headers"][0], kind="control", mid=350))
    est = block(svg, 430, 175, 190, "estimate()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])
    svg.add(cable(decode["out"]["Frame"], est["in"]["frame"], mid=350))
    yx, yy = reg["right"], 220
    svg.add(cable(est["out"]["Pose"], (yx, yy), mid=650))
    svg.add(dot(yx, yy, WARN, False, r=6, hollow_warn=True))
    svg.add(text(yx - 12, yy + 4, "pose", size=11.5, anchor="end", color=WARN))
    encode = block(svg, 760, 180, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable((yx, yy), encode["in"]["pose"], mid=720, color=WARN, width=1.6))
    chip(svg, 690, 300, "pose may be unbound: no else arm writes it")
    return svg.render("A yield with a missing arm")


# --------------------------------------------------------------------------
# Seam diagram
# --------------------------------------------------------------------------


def board_seam() -> str:
    svg = SVG(1380, 250)
    boxes = [
        ("source.py", "stdlib ast", "the if statement"),
        ("binding table", "one dict per arm", "copy on entry, φ on exit"),
        ("BlockContent", "region · arms · yields", "pyblocks schema"),
        ("SystemSketch", "frame + children", "yield = boundary port"),
        ("board", "cables land on blocks", "never on the region"),
    ]
    x = 30
    for i, (title, sub, hint) in enumerate(boxes):
        svg.add(f'<rect x="{x}" y="60" width="230" height="120" rx="8" fill="#fff" stroke="{BORDER}" stroke-width="1.2"/>')
        svg.add(text(x + 16, 92, title, size=17, mono=True))
        svg.add(text(x + 16, 118, sub, size=12, color=INK))
        svg.add(text(x + 16, 140, hint, size=11, color=MUTED, italic=True))
        if i < len(boxes) - 1:
            svg.add(f'<path d="M{x + 230},120 H{x + 272}" stroke="{THICK}" stroke-width="2" marker-end="url(#arrow)"/>')
        x += 272
    svg.add(text(30, 225, "What changes is one function in analyzer.py and one region kind in the block model; the cable, port and frame seams already exist.", size=12, color=MUTED))
    return svg.render("The seam")


# --------------------------------------------------------------------------
# Variants, criteria, scores
# --------------------------------------------------------------------------

CRITERIA = [
    ("c1", "Dataflow evident at the join", 25, "Tracing a downstream port backwards, the reader sees exactly-one-of without a legend. Zach's stated top rule."),
    ("c2", "Says what the code says", 20, "One block per call, the structure of the AST, no parallel universes. Authoring the board is editing the code."),
    ("c3", "Scales", 20, "N consumers of the merged name, a return straight after the if, elif chains, a nested if, a pass-through arm."),
    ("c4", "Derivable, diagnostic has a home", 15, "Every mark comes from the binding table; the may-be-unbound case has a place to be red."),
    ("c5", "Reuses the settled grammar", 10, "Edge-to-edge rows, dividing lines, half lines, header dots, the expanded frame. No new vocabulary to teach."),
    ("c6", "Buildable on stock tldraw", 10, "Frame, children, boundary port, fan-in, binding. No engine fork."),
]

VARIANTS = [
    {
        "id": "v1", "name": "Fan-in at the consumer", "board": board_v1,
        "thesis": "The region has no ports at all. Each arm's producer cables straight to the downstream input, which grows a one-of receiver: two sub-slots and a half line between them, the output-side half-line grammar mirrored onto an input.",
        "best": "One consumer, shallow nesting, and when the board must look exactly like the code's cables.",
        "loses": "N consumers of the merged name cost 2N cables; a return straight after the if lands the fan-in on the frame's boundary output; the reader must inspect a port to learn that only one cable is live.",
        "scores": {"c1": 4, "c2": 5, "c3": 2, "c4": 4, "c5": 4, "c6": 5},
        "exists": "Fan-in onto an input is already legal on the canvas (rule below). What is missing is the one-of mark and the analyzer lowering the arms.",
    },
    {
        "id": "v2", "name": "Yield on the region border", "board": board_v2,
        "thesis": "Inputs need no tunnels because an arm can see everything defined before the region. Outputs are different: every name any arm writes is a real join, so it gets one yield dot on the region's right edge, cabled from each arm, and downstream reads one cable.",
        "best": "Everything the ladder has coming: N consumers, return-after-if, elif chains, nested regions, pass-through arms, and the unbound diagnostic (a hollow yield).",
        "loses": "The region gains a port. If 'a container has no ports' is a hard rule rather than a reaction to input tunnels, this is gated out and V1 is the fallback.",
        "scores": {"c1": 5, "c2": 4, "c3": 5, "c4": 5, "c5": 3, "c6": 4},
        "exists": "The expanded frame already draws boundary ports on its edge with inner faces; a yield is that port with a computed name. The grammar hooks exist: groupStart, branchStart, header.",
    },
    {
        "id": "v3", "name": "Merge node after the region", "board": board_v3,
        "thesis": "Simulink's answer: the region is a bare container and the join is a free-standing φ node placed in the flow, movable like any block. The same node would later carry a loop's back-edge.",
        "best": "When the merge deserves to be a first-class thing you can name, move, and comment.",
        "loses": "It adds a node the code does not have, floats away from the region that owns it, and doubles the node count of every branch.",
        "scores": {"c1": 4, "c2": 3, "c3": 4, "c4": 4, "c5": 3, "c6": 4},
        "exists": "A Block with two inputs and one output is all it is; nothing new in the renderer, one new node kind in the analyzer.",
    },
    {
        "id": "v4", "name": "Select block, no region", "board": board_v4,
        "thesis": "Blender, Houdini and Grasshopper's answer: no region, both producers in the main flow, and a select block whose header takes the condition. Pure dataflow.",
        "best": "A conditional expression, `a if c else b`, where both operands are cheap and pure. The analyzer already lowers IfExp as its own region kind.",
        "loses": "For an if statement it says the wrong thing: both calls appear to run. Side effects and cost vanish from the picture.",
        "scores": {"c1": 3, "c2": 1, "c3": 2, "c4": 3, "c5": 4, "c6": 5},
        "exists": "A Block with a header dot and a half line between its inputs; every mark exists today.",
    },
    {
        "id": "v5", "name": "Divider bands, no frame", "board": board_v5,
        "thesis": "The branch is not a container but a thick divider that starts at a fork dot (the condition lands there) and ends at a join dot (the φ). Arms are the bands above and below it. Nesting is a thinner divider. 'It's all just dividing lines' taken literally.",
        "best": "Shallow branches in a wide flow, and readers who want the least chrome on the canvas.",
        "loses": "A band has no left edge, so nothing tells the reader where an arm begins; a band is not a tldraw shape, so there is no drop target or fold handle without an invisible frame, at which point it is V2 with the border hidden.",
        "scores": {"c1": 4, "c2": 4, "c3": 3, "c4": 4, "c5": 5, "c6": 2},
        "exists": "Nothing draws a divider that is not inside a shape; this needs a frame underneath it anyway.",
    },
]


def weighted(scores: dict) -> float:
    total = sum(scores[c[0]] * c[2] for c in CRITERIA)
    return round(total / 5, 1)


for v in VARIANTS:
    v["total"] = weighted(v["scores"])

# --------------------------------------------------------------------------
# Prior art — filled from the research pass; every row carries its source id
# --------------------------------------------------------------------------

PRIOR_ART_PATH = DOCS / "branch_prior_art.json"
PRIOR = json.loads(PRIOR_ART_PATH.read_text(encoding="utf-8")) if PRIOR_ART_PATH.exists() else {"rows": [], "sources": []}

# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--warn:#d9480f;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1400px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(34px,5vw,56px);line-height:1.02;letter-spacing:-.04em;margin:10px 0 14px;max-width:1000px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}
h3{font-size:18px;margin:26px 0 8px}
p{max-width:880px}
.lede{font-size:18px;color:#39424f;max-width:920px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}
.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:24px;letter-spacing:-.02em}
.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
figure svg{display:block;width:100%;height:auto}
figure.narrow{max-width:560px}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
figcaption b{color:var(--ink)}
.variant{margin-top:34px;padding-top:8px;border-top:2px solid var(--ink)}
.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1100px}
.cols p{margin:6px 0}
.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}
th{background:var(--soft);font-weight:700}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr.win td{background:#eef4ff}
pre{background:#0f1420;color:#dfe6f2;padding:16px 18px;border-radius:12px;overflow:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
pre code{background:none;padding:0;color:inherit}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:900px;margin:14px 0}
.callout.warn{border-color:var(--warn);background:#fff4ec}
.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:900px}
li{margin:5px 0}
.pick{display:flex;gap:8px;margin:10px 0 0}
.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}
.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:900px;min-height:120px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}
.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}
.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1200px}
.srcs li{break-inside:avoid}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:900px){.facts,.cols,.decision{grid-template-columns:1fr}.srcs{columns:1}}
"""

JS = """
(function(){
  var key='branch-regions-2026-09-02';
  var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
  function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
    var lines=Object.keys(state).map(function(id){return state[id]+': '+id});
    var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: v2\\nBorrow from v1: fan-in is the authoring gesture\\nAvoid: v4 for statements\\nWhy: ')}}
  document.querySelectorAll('.pick button').forEach(function(b){b.addEventListener('click',function(){var id=b.parentNode.dataset.id;state[id]=(state[id]===b.dataset.v)?undefined:b.dataset.v;if(!state[id])delete state[id];try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}paint()})});
  paint();
})();
"""


def fig(svg: str, caption: str, cls: str = "") -> str:
    return f"<figure class='{cls}'>{svg}<figcaption>{caption}</figcaption></figure>"


def code_block(s: str) -> str:
    return f"<pre><code>{html.escape(s)}</code></pre>"


def binding_table_html(table: dict, title: str) -> str:
    rows = []

    def walk(region: dict, depth: int) -> None:
        pad = "&nbsp;" * (depth * 4)
        rows.append(f'<tr><th colspan="4">{pad}{html.escape(region["label"])} <span class="small">line {region["line"]}</span></th></tr>')
        for arm in region["arms"]:
            reads = ", ".join(f'{r["name"]} ← {r["producer"]} <span class="small">({r["origin"]})</span>' for r in arm["reads"]) or "—"
            writes = ", ".join(f"{k} = {v}" for k, v in arm["writes"].items()) or ("return " + ", ".join(arm["returns"]) if arm["returns"] else "—")
            cond = ", ".join(arm["conditionReads"]) or "—"
            rows.append(f'<tr><td>{pad}&nbsp;&nbsp;<b>{html.escape(arm["label"])}</b></td><td>{cond}</td><td>{reads}</td><td>{html.escape(writes)}</td></tr>')
            for nested in arm["nested"]:
                walk(nested, depth + 1)
        for name, per_arm in region["phi"].items():
            cells = "; ".join(f"{html.escape(k)} → {html.escape(v)}" for k, v in per_arm.items())
            rows.append(f'<tr><td>{pad}&nbsp;&nbsp;<span style="color:{ACCENT};font-weight:700">φ {name}</span></td><td colspan="3">{cells}</td></tr>')

    for region in table["regions"]:
        walk(region, 0)
    c = table["counts"]
    summary = (
        f'{c["regions"]} region(s) · {c["arms"]} arms · {c["outsideReads"]} reads resolve outside their region · '
        f'{c["insideReads"]} resolve inside their own arm · <b>{c["siblingArmReads"]} resolve to a sibling arm</b> · {c["phiNames"]} φ name(s)'
    )
    return (
        f"<h3>{html.escape(title)}</h3><p class='small'>{summary}</p>"
        f"<table><tr><th>arm</th><th>header reads</th><th>body reads (name ← producer)</th><th>writes / returns</th></tr>{''.join(rows)}</table>"
    )


def prior_art_html() -> str:
    if not PRIOR["rows"]:
        return "<p class='small'>Prior-art table not built: docs/branch_prior_art.json is missing.</p>"
    rows = "".join(
        f"<tr><td><b>{html.escape(r['tool'])}</b></td><td>{html.escape(r['mechanism'])}</td><td>{html.escape(r['evaluation'])}</td>"
        f"<td>{html.escape(r['visible'])}</td><td>{html.escape(r['merge'])}</td><td>{html.escape(r['lesson'])} <span class='small'>{r['cite']}</span></td></tr>"
        for r in PRIOR["rows"]
    )
    return (
        "<table><tr><th>tool / theory</th><th>mechanism</th><th>evaluates</th><th>both arms visible</th><th>merge</th><th>what it teaches this design</th></tr>"
        + rows + "</table>"
    )


def sources_html() -> str:
    return "<ol class='srcs'>" + "".join(
        f"<li id='s{s['id']}'>{html.escape(s['title'])} — <a href='{html.escape(s['url'])}'>{html.escape(s['url'])}</a></li>" for s in PRIOR["sources"]
    ) + "</ol>"


def variants_html() -> str:
    out = []
    for v in VARIANTS:
        win = " win" if v["id"] == "v2" else ""
        scores = " · ".join(f"{c[0]} {v['scores'][c[0]]}" for c in CRITERIA)
        out.append(
            f"<section class='variant' id='{v['id']}'><header><h3>{v['id'].upper()} · {html.escape(v['name'])}</h3>"
            f"<span class='score'>{v['total']}/100</span><span class='small'>{scores}</span></header>"
            f"<p>{html.escape(v['thesis'])}</p>"
            + fig(v["board"](), f"<b>{html.escape(v['name'])}.</b> The 09_branch golden; only the merge differs between boards.")
            + f"<div class='cols'><div><span class='k'>best when</span><p>{html.escape(v['best'])}</p></div>"
            f"<div><span class='k'>loses when</span><p>{html.escape(v['loses'])}</p></div>"
            f"<div><span class='k'>what exists today</span><p>{html.escape(v['exists'])}</p></div></div>"
            f"<div class='pick' data-id='{v['id']}'><button data-v='Pick'>Pick</button><button data-v='Shortlist'>Shortlist</button><button data-v='Reject'>Reject</button></div></section>"
        )
    return "".join(out)


def scores_html() -> str:
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    for v in sorted(VARIANTS, key=lambda v: -v["total"]):
        cells = "".join(f"<td class='n'>{v['scores'][c[0]]}</td>" for c in CRITERIA)
        rows += f"<tr class='{'win' if v['id'] == 'v2' else ''}'><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>{cells}<td class='n'><b>{v['total']}</b></td></tr>"
    crit = "".join(f"<li><b>{c[0]} · {html.escape(c[1])}</b> ({c[2]}) — {html.escape(c[3])}</li>" for c in CRITERIA)
    return f"<ul>{crit}</ul><table><tr><th>variant</th>{head}<th class='n'>total</th></tr>{rows}</table>"


def build() -> str:
    hooks = "".join(f"<li><code>{k}</code> — {html.escape(v)}</li>" for k, v in HOOKS.items())
    facts = FACTS
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Branch regions — five ways to draw an if</title><style>{CSS}{PROTO_CSS}</style></head>
<body><main>
<div class="eyebrow">SystemSketch · pyblocks · 09_branch · {TODAY}</div>
<h1>A branch is a region. Its inputs need no ports. Its outputs are joins.</h1>
<div class="callout ok"><b>Update, 2026-09-02 08:47.</b> You read this and picked <b>V1</b>: wires always, no ports on the region, exclusivity carried by the wires and read through two views. The hinge below fired exactly as written ("a container has no ports" is a gate). §0 prototypes what you asked for; its second pass (09:30) folds your six points in: transparency is the branch's only control, Case view is Expanded with one arm open, a make-active target on every header, the condition on the band, folding to the header; the third (10:51) drops the one-of sub-slots for one plain port with ordinary fan-in, and Case view now draws only the open case's wires. The rest of the page is unchanged as the record of how the pick was made.</div>
<p class="lede">You asked whether an <code>if</code> is a block or a region, whether cables may wire straight to the calls inside, and whether the arms may recombine afterwards. The prior art (LabVIEW, Simulink, MLIR, the sea-of-nodes IR, the program dependence graph) agrees with your instinct on the first two and answers the third with one idea: the merge is a real thing in the program, a φ, and it lives on the region's exit. Five boards below make that judgeable; the recommendation is V2, with V1 as the gesture that authors it.</p>

<div class="facts">
<div class="fact"><b>{len(facts['inputs'])} in · {len(facts['outputs'])} out</b><span>tunnels the analyzer gives the 09 region today (<code>{html.escape(', '.join(facts['inputs']))}</code> → <code>{html.escape(', '.join(facts['outputs']))}</code>)</span></div>
<div class="fact"><b>{len(facts['callsDrawn'])} of 4</b><span>calls drawn on today's 09 board; <code>estimate</code> and <code>fallback</code> arrive as free-value tunnels, not blocks</span></div>
<div class="fact"><b>{TABLE_NESTED['counts']['siblingArmReads']}</b><span>reads that resolve to a sibling arm across the 09 golden and the nested elif fixture (structurally impossible, measured anyway)</span></div>
<div class="fact"><b>{TABLE_09['counts']['phiNames']} · {TABLE_NESTED['counts']['phiNames']} · {TABLE_UNBOUND['counts']['phiNames']}</b><span>φ names per fixture: 09, nested elif, and the missing-else case, which yields <code>UNBOUND</code></span></div>
</div>

{case_view_section()}

<h2>1 · Your thinking, sharpened</h2>
<p><b>Region, not block: agreed, and it is not a taste call.</b> Every representation that has to be correct rather than pretty already does this. The program dependence graph makes an <code>if</code> a control-dependence region whose children are the statements it governs [23]; the sea-of-nodes IR has a Region node with φ nodes hanging off it [20]; MLIR's <code>scf.if</code> is an operation with two regions and a <code>yield</code> [24]; LabVIEW's Case Structure is a region on the diagram [1]. Two ecosystems that began with switch/merge token routing, TensorFlow and V8, moved to the region form [27][22]. None of them makes the branch a callable with a signature, because it has none. Definitions are reused; branches are not, which is exactly your "branches are not like defs" line.</p>
<p><b>The asymmetry that resolves "fake ports".</b> LabVIEW gives its region tunnels on both sides. MLIR gives its region tunnels on only one: "operations inside a region can reference values defined outside of the region", so there are no input tunnels, but "a value defined in a region can never be used outside of the region": every result leaves through <code>scf.yield</code>, and both arms must yield the same number and types [24][25]. Every system that lets a value be defined on both arms and used after has exactly one join construct per leaving value: Dennis's merge, the φ, the Merge block, the output tunnel [15][19][29][3]. That asymmetry is the whole design. Input tunnels are fake because they only restate visibility; the binding table below shows every arm input resolving to something defined before the region. Output tunnels are not fake, because the name after the <code>if</code> is a genuine join: <code>pose</code> means "whichever arm ran". In SSA that join is a φ. Your "fake ports" reaction is correct about inputs and wrong about outputs, and V2 is what you get when you keep exactly the real half.</p>
<p><b>LabVIEW could not show both arms because of tunnels, which is the strongest argument for dropping them.</b> NI's help is definitive that only one case of a Case Structure is visible at a time [1][2], and the Idea Exchange request to show a True/False structure's two cases stacked was declined by NI staff with two reasons: "I don't like the wires that point nowhere. Imagine you have 20 cases!", and that the LEGO Mindstorms NXT editor, which does stack its cases, "works because there's almost always only one wire" and becomes "a pain to work with when you start adding additional tunnels" [5]. Green and Petre's cognitive-dimensions study measured the cost of the "invisible arms": every subject did worse on LabVIEW conditionals than on text [6]. Those objections are objections to <i>tunnels</i>, not to side-by-side arms. A cable that runs to a real inner port points somewhere; there is nothing to duplicate per case. Your "wire directly to the functions inside" is what makes side-by-side arms viable at all.</p>
<p><b>The one shipped precedent is Blender's zones, and it has exactly this asymmetry.</b> Across eighteen node editors, none draws a conditional as a region without border ports. But Blender's Repeat, Simulation and Closure zones are semantic regions whose input side is portless: "nodes inside the zone can also take inputs from nodes outside the zone… however, nodes inside the zone can't send their outputs to nodes outside the zone", and everything leaves through the zone's Output node [46][47][48]. That is scopes-see-in, yields-come-out, shipped for loops. Blender never built a conditional zone, so its <code>if</code> stays a Switch node; the region grammar here fills that gap rather than contradicting anything Blender learned.</p>
<p><b>A select node's laziness is a property of the engine, not the node, which is why V4 cannot carry a statement.</b> The same "Switch" is lazy in Blender, Houdini SOPs, Nuke and TouchDesigner because those graphs pull, and evaluates both sides in Unreal's Select, Unity's Shader Graph, Grasshopper and Dynamo because those push [42][49][51][57][59][69][71]. Houdini ships both behaviours under one name (the VOP Switch says "all inputs are evaluated"). A board that means "only one of these calls runs" cannot delegate that meaning to whichever runtime happens to read it; the region says it structurally.</p>
<p><b>Arm order is a layout law, not a preference.</b> DRAKON's rules for exactly this problem: the main route lies on the skewer, "the further to the right, the worse", and no line may cross [81]. Read top-to-bottom instead of left-to-right, that is: arms in source order, the happy path first, and cables that enter an arm only from the shared area to its left.</p>
<p><b>"Cables cannot cross rows" is derived, not styled.</b> Your Aug 27 red circle (a cable from the if arm dropping into the else arm) is not a layout rule to enforce; it is unrepresentable. An arm starts from a copy of the binding table as it was before the region, so a name read inside the else arm can only resolve to something defined before the region or inside the else arm itself. The probe below runs that lowering over the 09 golden and a nested elif and counts sibling-arm reads: zero. The green circle (a cable entering the else arm from the shared area on the left) is the only other kind there is.</p>
<p><b>No parallel universes, because the board is the program, not a trace.</b> The "future paths" drawing (two <code>encode()</code>s) is a trace tree: it draws every execution rather than the one text. A CFG draws the text once and lets a path be selected; the φ's definition is exactly that "each execution of a φ-function uses only one of the operands" [19]. That reconciles your two instincts: draw one static board, and make "highlight only certain branches" a lens over it (fixture D). Same call count as the code, always.</p>
<p><b>Conditional returns are already solved, and they are the next golden.</b> "Different returns represent different output rows" is the half-line output group you ratified on Aug 25 and shipped as <code>branchStart</code>. Inside the expanded def, each return cables to its own boundary output row; the caller sees the split port. Nothing new is needed except the analyzer producing the rows from return sites, and the ladder's case 13 (early return / multiple exits) is precisely that fixture. Forbidding it would forbid <code>return None</code> guards, so don't.</p>
<p><b>Fold is the one place computed tunnels come back, and that answers "how do you find the names".</b> Always-expanded is right: a branch has no port view because it has no signature. But if an arm folds, the cables into its blocks need somewhere to land, and that somewhere is a tunnel: one stub per distinct incoming cable, named by the inner port it was headed for, ordered by the inner block's position. The names are read off the cables, never authored. Fold reintroduces LabVIEW's tunnels for exactly as long as the arm is folded, and only on that arm.</p>
<p><b>LabVIEW's unwired-tunnel error is Python's may-be-unbound.</b> In G, an output tunnel that some case leaves unwired is a broken wire unless you tick "Use Default If Unwired", which the style guides warn against because a silent default hides a missing case [3][11]. In Python, <code>pose</code> written only in the if arm and read after the region raises <code>UnboundLocalError</code> on the other path. The probe marks that φ arm <code>UNBOUND</code>; V2 draws it as a hollow red yield (fixture E). That is a diagnostic the collapsed-region lowering cannot express today.</p>

<h2>2 · What the tree does today, measured</h2>
<p>The analyzer's <code>_lower_region</code> collapses every <code>if</code> into one opaque node and recovers its boundary from a read/write sweep. On the 09 golden that gives the region <b>{len(facts['inputs'])} inputs</b> ({html.escape(', '.join(facts['inputs']))}) and <b>{len(facts['outputs'])} output</b> ({html.escape(', '.join(facts['outputs']))}), with the diagnostic <i>"{html.escape(facts['diagnostic'])}"</i>. The two calls inside the arms are not blocks; they arrive as free values. This is the "port view with named ports" you rejected, generated automatically.</p>
{code_block(BODY_09)}
<p>The grammar hooks the boards rely on exist in the live block model (read from <code>src/blocks/blockModel.ts</code> and <code>src/blocks/connections/ConnectionShapeUtil.tsx</code> at build time):</p>
<ul>{hooks}</ul>

<h2>3 · The binding table, per arm</h2>
<p>This is the happy-path lowering in <code>docs/branch_arm_binding.py</code>, stdlib <code>ast</code> only. One dictionary, copied on entry to each arm, joined on exit. It is the same table <code>analyzer.py</code> already keeps for straight-line code; the only addition is the copy and the φ.</p>
{binding_table_html(TABLE_09, "09_branch")}
{binding_table_html(TABLE_NESTED, "nested elif with a pass-through")}
{binding_table_html(TABLE_UNBOUND, "if without else, name read afterwards")}
{binding_table_html(TABLE_RETURNS, "conditional returns")}

<h2>4 · Prior art, in one table</h2>
<p>Three research passes (LabVIEW from NI's own documentation; dataflow theory and compiler IRs from the papers; a survey of eighteen node editors from their manuals). Cited inline by source number; the index is at the end. The survey's headline: no tool draws a conditional as a region without border ports, and the nearest thing, Blender's zones, keeps the output tunnel and drops the input one.</p>
{prior_art_html()}

<h2>5 · Criteria, then five boards</h2>
{scores_html()}
<div class="callout"><b>Hinge.</b> V2's only weak criterion is c5, because the region gains a port. If "a container has no ports" is a hard gate rather than a reaction to input tunnels, V2 is out and V1 wins at {next(v['total'] for v in VARIANTS if v['id']=='v1')}. But V1 authored on the canvas <i>is</i> V2's input: two cables from sibling arms landing on one port are the app's cue to derive a yield. And V5 is V2 with the border hidden, which can be an appearance toggle rather than a variant.</div>
{variants_html()}

<h2>6 · The recommended board under load</h2>
{fig(board_returns(), "<b>Fixture B — conditional returns.</b> Each return cables to its own boundary output row; the half line on the frame's right edge is the settled branchStart mark. The caller sees the same split.")}
{fig(board_caller(), "<b>What the caller sees.</b> One run() block, outputs bytes | Pose split by a half line. This is the Aug 25 c1 grammar unchanged.", "narrow")}
{fig(board_nested(), "<b>Fixture C — elif chain, nested if, pass-through.</b> elif is a third arm of the same region. The nested if is a thin frame inside the safe arm; its unchanged lane carries fallback's pose straight to the inner yield, which is what MLIR yields and what LabVIEW would route through the case by hand.")}
{fig(board_v2(lens=True), "<b>Fixture D — the path lens.</b> Selecting the if arm dims the else arm and its cable and tints the live path. Nothing is duplicated; the board is the same one.")}
{fig(board_unbound(), "<b>Fixture E — a yield with a missing arm.</b> The φ for pose has no else producer, so it is hollow and red: LabVIEW's unwired tunnel and Python's UnboundLocalError are the same fact.")}

<h2>7 · The seam</h2>
{fig(board_seam(), "One function in analyzer.py changes (arms become sub-scopes with a copied table; φ per written name); the region becomes a frame kind whose only ports are yields; blocks inside are frame children; cables land on blocks or yields, never on the region.")}
<h3>Analyzer contract, in five rules</h3>
<ol>
<li><b>An <code>if</code> lowers to one region with N arms</b>: the if, every elif in the chain, and the else. A single <code>If</code> in an <code>orelse</code> is an elif, not a nested region. <code>match</code> is the same shape with a subject on the header.</li>
<li><b>Each arm is lowered with a copy of the binding table</b>; its calls are ordinary blocks parented to the arm; its reads resolve to outside values or its own definitions. No arm sees a sibling.</li>
<li><b>Every name written by any arm becomes one yield</b> on the region, with one producer per arm: the arm's last write, a pass-through of the outer value, or UNBOUND (a warning diagnostic). The table after the region maps the name to the yield.</li>
<li><b>Header reads are the condition's names.</b> They cable to the arm's label-row dot, thick, as your Aug 27 sketch already draws callables and conditions.</li>
<li><b>A conditional expression (<code>a if c else b</code>) is V4</b>, a select block, because both operands are expressions in one statement; a statement-level <code>if</code> never is.</li>
</ol>

<h2>8 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Per-arm binding lowering written and run over the 09 golden and three fixtures: 0 sibling-arm reads, φ per written name, pass-through and UNBOUND both surface.</li><li>Five boards on one fixture, drawn in the SystemSketch idiom, plus four load fixtures for the recommended one.</li><li>Prior art gathered from primary sources and reduced to one table.</li></ul></div>
<div><h4>Left, and what kind of left</h4><ul><li><b>Next:</b> implement the arm lowering in <code>analyzer.py</code> (elif = sibling arm, copy the table per arm, header reads = condition names); V1 needs no yield node, only one cable per (arm producer → consumer) pair.</li><li><b>Next:</b> a region frame kind in SystemSketch with <code>view: expanded | case</code>, an active-arm state, and the one-of receiver mark on inputs; fold with computed stubs.</li><li><b>Blocked on nothing.</b></li></ul></div>
<div><h4>Needs you (after the third pass)</h4><ul><li><b>Expanded keeps a folded arm's wires at its header edge; Case drops them.</b> Default if silent: yes.</li><li><b>Two affordances per arm header, fold and make-active, nothing else.</b> Default if silent: yes.</li><li><b>Fade level for the non-active arms</b>: 18% here. Default if silent: 18%, one token in the theme.</li><li><b>Does a folded header show a count</b> (blocks, cables) or stay bare like Simple view? Default if silent: bare.</li><li><b>Case view remembers which arm is open per region across reloads.</b> Default if silent: yes, like collapsed state.</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No analyzer or renderer code changed; boards are drawn marks, not live shapes, and say so.</li><li>No golden target rewritten; the bootstrap's <code>--force</code> rewrites all twelve.</li><li>No loop design; the same region idiom applies and a back-edge is the next question, not this one.</li></ul></div>
</div>

<h3>Reply cheaply</h3>
<p class="small">Pick buttons persist in this browser; the brief below mirrors them. Or answer in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<h2>Source index</h2>
{sources_html()}

<footer>Built by <code>docs/build_branch_regions.py</code> at {GIT_HEAD} · numbers measured from the tree at build time · boards are SVG drawn in the SystemSketch idiom, not live tldraw shapes · Claude Code (Fable 5.1), 2026-09-02.</footer>
</main><script>{JS}</script><script>{PROTO_JS}</script></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "hooks": HOOKS, "counts09": TABLE_09["counts"], "countsNested": TABLE_NESTED["counts"], "scores": {v["id"]: v["total"] for v in VARIANTS}}, indent=1))


if __name__ == "__main__":
    main()
