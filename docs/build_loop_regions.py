#!/usr/bin/env python3
"""Build `docs/loop-regions-2026-09-02.html`: five ways to draw a loop.

The branch grammar is the constraint (a region, no input ports, cables to the
calls inside, control data on the band, wires always).  A loop adds two things
a branch does not have: a value that comes back around, and a header that
produces something (the item).  Every number is measured at build time: the
analyzer's current lowering of the 10_loop_carried_state golden, and the
loop-carried tables from `docs/loop_carried_binding.py`.
"""

from __future__ import annotations

import base64
import html
import json
import mimetypes
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
PYBLOCKS = Path("/home/bam/pyblocks")
GOLDENS = PYBLOCKS / "examples" / "systemsketch_goldens"
OUTPUT = DOCS / "loop-regions-2026-09-02.html"
VISUALS = DOCS / "assets" / "loop-prior-art"
sys.path.insert(0, str(DOCS))
sys.path.insert(0, str(PYBLOCKS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, chip, dot, frame, note, polycable, text,
)
from loop_carried_binding import loop_tables  # noqa: E402

TODAY = "2026-09-02"
SOURCE_10 = (GOLDENS / "10_loop_carried_state" / "source.py").read_text(encoding="utf-8")
BODY_10 = SOURCE_10[SOURCE_10.index("def run("):].rstrip() + "\n"
TRACK_SOURCE = '''def track(frame: Frame, gain: float, tol: float) -> Pose:
    pose = estimate(frame, gain)
    while pose.error > tol:
        pose = refine(pose, frame)
    return pose
'''


def analyzer_facts() -> dict:
    from pyblocks.analyzer import analyze_source

    content = analyze_source(SOURCE_10, filename="10_loop_carried_state/source.py", function_id="run").to_dict()
    region = next(n for n in content["nodes"] if n["kind"] == "region")
    inputs = [(e["label"], e["kind"]) for e in content["edges"] if e["target"] == region["id"]]
    outputs = [(e["label"], e["kind"]) for e in content["edges"] if e["source"] == region["id"]]
    back = [e for e in content["edges"] if e["source"] != region["id"] and e["target"] == region["id"] and e["kind"] == "state"]
    info = next((d["message"] for d in content["diagnostics"] if d["severity"] == "info"), "")
    calls = [n["label"] for n in content["nodes"] if n["kind"] == "transform"]
    return {"label": region["label"], "inputs": inputs, "outputs": outputs, "stateIn": len(back), "calls": calls, "diagnostic": info,
            "cycle": any(e["source"] == region["id"] and e["target"] == region["id"] for e in content["edges"])}


def golden_target_facts() -> dict:
    target = json.loads((GOLDENS / "10_loop_carried_state" / "target.systemsketch").read_text(encoding="utf-8"))
    ids = [n["id"] for n in target["nodes"]]
    edges = [(e["source"], e["target"], e.get("data", {}).get("label")) for e in target.get("edges", [])]
    state_node = next((i for i in ids if i.startswith("value:")), None)
    back = [e for e in edges if e[0] == state_node and e[1] == "region:for"]
    return {"stateNode": state_node, "backEdgeLabel": back[0][2] if back else None, "edgeCount": len(edges)}


def readme_q4() -> str:
    readme = (GOLDENS / "README.md").read_text(encoding="utf-8")
    start = readme.index("- **Q4")
    end = readme.index("- **Q5")
    return " ".join(readme[start:end].split())


FACTS = analyzer_facts()
TARGET = golden_target_facts()
Q4 = readme_q4()
TABLE_10 = loop_tables(SOURCE_10, "run")
TABLE_TRACK = loop_tables(TRACK_SOURCE, "track")
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()


# --------------------------------------------------------------------------
# Shared pieces
# --------------------------------------------------------------------------


def receiver(svg: SVG, x: float, cy: float, keys: list, groups: list) -> dict:
    """A single port drawn free-standing (for boundary outputs)."""
    n = len(keys)
    pitch = 11
    out = {}
    for i, k in enumerate(keys):
        sy = cy + (i - (n - 1) / 2) * pitch
        svg.add(dot(x, sy, ANY, True, r=3.6))
        out[k] = (x, sy)
        if i > 0 and groups[i - 1] != groups[i]:
            svg.add(f'<line x1="{x - 11}" y1="{sy - pitch / 2}" x2="{x - 1}" y2="{sy - pitch / 2}" stroke="{THICK}" stroke-width="1.6"/>')
    return out


def loop_region(svg: SVG, x, y, w, h, label, *, band_h=30, headers=(), item=None, state_row=None):
    """A loop region: band with the header text, control dots on the band's left edge, an item dot on the band's bottom edge."""
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + band_h}" x2="{x + w}" y2="{y + band_h}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(text(x + w - 12, y + 20, "Loop", size=12, mono=True, anchor="end", color=MUTED))
    svg.add(text(x + w / 2 - 10, y + 20, label, size=12.5, weight=700, color=INK, anchor="middle"))
    out = {"right": x + w, "band_bottom": y + band_h, "bottom": y + h}
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
    if state_row:
        ry = y + band_h + 14
        svg.add(f'<line x1="{x}" y1="{y + band_h + 28}" x2="{x + w}" y2="{y + band_h + 28}" stroke="{REGION}" stroke-width="1"/>')
        for name in state_row:
            svg.add(dot(x, ry, ANY, True, r=5))
            svg.add(text(x + 12, ry + 4, f"{name} · this iteration", size=10.5, color=MUTED))
            svg.add(dot(x + w, ry, ANY, True, r=5))
            svg.add(text(x + w - 12, ry + 4, f"{name} · next / after", size=10.5, color=MUTED, anchor="end"))
            svg.add(text(x + w / 2, ry + 4, "↻ carried", size=10.5, color=ACCENT, anchor="middle", weight=600))
            out[f"state:{name}:in"] = (x, ry)
            out[f"state:{name}:out"] = (x + w, ry)
        out["band_bottom"] = y + band_h + 28
    return out


def lane_back(points, opacity=1.0):
    return polycable(points, color=CABLE, width=1.6, opacity=opacity)


def arrowhead(svg: SVG, x, y, color=CABLE, opacity=1.0):
    svg.add(f'<path d="M{x - 8},{y - 4} L{x},{y} L{x - 8},{y + 4} z" fill="{color}" opacity="{opacity}"/>')


def data_uri(path: Path) -> str:
    """Inline a captured vendor-doc image so the report stays self-contained."""
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


# --------------------------------------------------------------------------
# Boards — fixture: the 10 golden
# --------------------------------------------------------------------------


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


def board_l1_for() -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    reg = loop_region(svg, 700, 130, 400, 330, "for other in others:", headers=["others"], item="other")
    svg.add(cable(base["others"], reg["hdr:others"], kind="control", mid=660))
    merge = block(svg, 760, 220, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    seed_slot = back_slot = merge["in"]["pose"]  # one plain port; the seed and the back cable fan in
    svg.add(cable(base["estimate"]["out"]["Pose"], seed_slot, mid=680))
    ix, iy = reg["item"]
    svg.add(polycable([(ix, iy), (ix, merge["in"]["other"][1]), merge["in"]["other"]]))
    px, py = merge["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    svg.add(lane_back([(px, py), (1060, py), (1060, lane_y), (730, lane_y), (730, back_slot[1]), back_slot]))
    arrowhead(svg, back_slot[0], back_slot[1])
    svg.add(text(895, lane_y - 6, "next iteration", size=10.5, color=MUTED, italic=True, anchor="middle"))
    encode = block(svg, 1140, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    last_slot = zero_slot = encode["in"]["pose"]
    svg.add(cable((px, py), last_slot, mid=1110))
    ex, ey = base["estimate"]["out"]["Pose"]
    svg.add(polycable([(ex, ey), (680, ey), (680, 520), (1115, 520), (1115, zero_slot[1]), zero_slot]))
    svg.add(text(905, 514, "zero iterations: the seed reaches encode untouched", size=10.5, color=MUTED, italic=True, anchor="middle"))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    return svg.render("L1 cycle as cable, for")


def board_l1_while() -> str:
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
    seed_slot = back_slot = refine["in"]["pose"]
    svg.add(cable(estimate["out"]["Pose"], seed_slot, mid=430))
    svg.add(polycable([fr, (110, fr[1]), (110, 330), (480, 330), (480, refine["in"]["frame"][1]), refine["in"]["frame"]]))
    px, py = refine["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    svg.add(lane_back([(px, py), (860, py), (860, lane_y), (490, lane_y), (490, back_slot[1]), back_slot]))
    arrowhead(svg, back_slot[0], back_slot[1])
    svg.add(text(675, lane_y - 6, "next iteration", size=10.5, color=MUTED, italic=True, anchor="middle"))
    pose_out = boundary_out(svg, 1360, 341, "pose", "Pose")
    slots = {"last": pose_out, "zero": pose_out}
    svg.add(cable((px, py), slots["last"], mid=1200))
    ex, ey = estimate["out"]["Pose"]
    svg.add(polycable([(ex, ey), (400, ey), (400, 520), (1300, 520), (1300, slots["zero"][1]), slots["zero"]]))
    svg.add(text(850, 514, "zero iterations: the seed is returned", size=10.5, color=MUTED, italic=True, anchor="middle"))
    note(svg, 440, 480, "the condition reads pose, which is inside, and tol, which lands on the band", size=10.5)
    return svg.render("L1 cycle as cable, while")


def board_l2() -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    reg = loop_region(svg, 700, 130, 400, 340, "for other in others:", headers=["others"], item=None, state_row=["pose"])
    svg.add(cable(base["others"], reg["hdr:others"], kind="control", mid=660))
    ix = 740
    svg.add(dot(ix, reg["band_bottom"], ANY, True, r=5))
    svg.add(text(ix + 10, reg["band_bottom"] + 14, "other", size=10.5, color=MUTED, italic=True))
    merge = block(svg, 790, 250, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    sin, sout = reg["state:pose:in"], reg["state:pose:out"]
    svg.add(cable(base["estimate"]["out"]["Pose"], sin, mid=665))
    svg.add(polycable([sin, (720, sin[1]), (720, merge["in"]["pose"][1]), merge["in"]["pose"]]))
    svg.add(polycable([(ix, reg["band_bottom"]), (ix, merge["in"]["other"][1]), merge["in"]["other"]]))
    px, py = merge["out"]["Pose"]
    svg.add(polycable([(px, py), (1060, py), (1060, sout[1]), sout]))
    encode = block(svg, 1140, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(cable(sout, encode["in"]["pose"], mid=1120))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    note(svg, 700, 490, "the state row is the shift register / iter_args: left = this iteration, right = next; after the loop the right dot is the last value, or the seed", size=10.5)
    return svg.render("L2 state row on the band")


def board_l3() -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    reg = loop_region(svg, 700, 130, 400, 330, "for other in others:", headers=["others"], item="other")
    svg.add(cable(base["others"], reg["hdr:others"], kind="control", mid=660))
    ox, oy, ow, oh = 715, 255, 80, 32
    svg.add(f'<rect x="{ox}" y="{oy}" width="{ow}" height="{oh}" rx="16" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
    svg.add(text(ox + ow / 2, oy + 21, "pose", size=12, weight=700, anchor="middle"))
    oval_l, oval_r = (ox, oy + oh / 2), (ox + ow, oy + oh / 2)
    merge = block(svg, 830, 220, 200, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    svg.add(cable(base["estimate"]["out"]["Pose"], oval_l, mid=670))
    svg.add(cable(oval_r, merge["in"]["pose"], mid=810))
    ix, iy = reg["item"]
    svg.add(polycable([(ix, iy), (ix, 205), (805, 205), (805, merge["in"]["other"][1]), merge["in"]["other"]]))
    px, py = merge["out"]["Pose"]
    lane_y = reg["bottom"] - 26
    svg.add(lane_back([(px, py), (1060, py), (1060, lane_y), (690, lane_y), (690, oval_l[1] + 8), (ox, oval_l[1] + 8)]))
    arrowhead(svg, ox, oval_l[1] + 8)
    encode = block(svg, 1140, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    svg.add(polycable([(ox + ow / 2, oy + oh), (ox + ow / 2, 530), (1115, 530), (1115, encode["in"]["pose"][1]), encode["in"]["pose"]]))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    note(svg, 700, 490, "the oval is the golden's own target board (value:pose-2): a state node that is seeded, written back, and read after", size=10.5)
    return svg.render("L3 state node")


def board_l4() -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    reg = loop_region(svg, 700, 130, 400, 400, "for other in others:", headers=["others"], item="other")
    svg.add(cable(base["others"], reg["hdr:others"], kind="control", mid=660))
    merge = block(svg, 760, 200, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    svg.add(cable(base["estimate"]["out"]["Pose"], merge["in"]["pose"], mid=680))
    ix, iy = reg["item"]
    svg.add(polycable([(ix, iy), (ix, merge["in"]["other"][1]), merge["in"]["other"]]))
    ghost = block(svg, 760, 340, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}], opacity=0.35)
    px, py = merge["out"]["Pose"]
    svg.add(polycable([(px, py), (1060, py), (1060, 320), (730, 320), (730, ghost["in"]["pose"][1]), ghost["in"]["pose"]], opacity=0.5))
    svg.add(polycable([(ix, iy), (ix, ghost["in"]["other"][1] - 30), (745, ghost["in"]["other"][1] - 30), (745, ghost["in"]["other"][1]), ghost["in"]["other"]], opacity=0.35))
    svg.add(text(870, 438, "iteration k+1 (lens)", size=11, color=MUTED, italic=True, anchor="middle"))
    encode = block(svg, 1140, 290, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    gx, gy = ghost["out"]["Pose"]
    svg.add(polycable([(gx, gy), (1115, gy), (1115, encode["in"]["pose"][1]), encode["in"]["pose"]], opacity=0.5))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    chip(svg, 700, 560, "a lens over L1, never a structure: the ghost is the Aug 25 l4 that failed the gutter gate")
    return svg.render("L4 rolled-out ghost lens")


def board_l5() -> str:
    svg = SVG(1380, 600)
    base = common_for(svg)
    begin = block(svg, 690, 200, 170, "loop begin", [{"name": "others", "type": "Poses"}, {"name": "pose", "type": "Pose"}], [{"name": "pose"}, {"name": "other"}])
    merge = block(svg, 900, 200, 190, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}])
    end = block(svg, 1130, 200, 120, "loop end", [{"name": "pose", "type": "Pose"}], [{"name": "pose"}])
    svg.add(cable(base["others"], begin["in"]["others"], mid=660))
    svg.add(cable(base["estimate"]["out"]["Pose"], begin["in"]["pose"], mid=660))
    svg.add(cable(begin["out"]["pose"], merge["in"]["pose"], mid=880))
    svg.add(cable(begin["out"]["other"], merge["in"]["other"], mid=880))
    svg.add(cable(merge["out"]["Pose"], end["in"]["pose"], mid=1110))
    encode = block(svg, 1140, 380, 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    ex, ey = end["out"]["pose"]
    svg.add(polycable([(ex, ey), (1300, ey), (1300, 340), (1120, 340), (1120, encode["in"]["pose"][1]), encode["in"]["pose"]]))
    svg.add(polycable([(ex, ey), (1300, ey), (1300, 150), (670, 150), (670, begin["in"]["pose"][1]), begin["in"]["pose"]], dashed=True, opacity=0.5))
    svg.add(text(985, 143, "implied: end feeds begin on the next iteration (Houdini Block Begin/End, Anemone Loop Start/End)", size=10.5, color=MUTED, italic=True, anchor="middle"))
    out = boundary_out(svg, 1360, encode["out"]["bytes"][1], "payload", "bytes")
    svg.add(cable(encode["out"]["bytes"], out, mid=1335))
    chip(svg, 690, 560, "no region: the loop is a pair of blocks, and the body is whatever sits between them")
    return svg.render("L5 begin / end pair")


def board_seam() -> str:
    svg = SVG(1380, 250)
    boxes = [
        ("source.py", "stdlib ast", "for · while"),
        ("loop table", "two passes over the body", "seed · back · exit φ"),
        ("BlockContent", "region · item · carried", "pyblocks schema"),
        ("SystemSketch", "frame + children", "same region kind as a branch"),
        ("board", "cycle as a cable", "seed and back cables into one port"),
    ]
    x = 30
    for i, (title, sub, hint) in enumerate(boxes):
        svg.add(f'<rect x="{x}" y="60" width="230" height="120" rx="8" fill="#fff" stroke="#d3d6dd" stroke-width="1.2"/>')
        svg.add(text(x + 16, 92, title, size=17, mono=True))
        svg.add(text(x + 16, 118, sub, size=12, color=INK))
        svg.add(text(x + 16, 140, hint, size=11, color=MUTED, italic=True))
        if i < len(boxes) - 1:
            svg.add(f'<path d="M{x + 230},120 H{x + 272}" stroke="{THICK}" stroke-width="2" marker-end="url(#arrow)"/>')
        x += 272
    svg.add(text(30, 225, "One region kind carries branch and loop; the only new fact a loop adds to the binding table is the second pass.", size=12, color=MUTED))
    return svg.render("The seam")


# --------------------------------------------------------------------------
# Criteria, variants, prior art
# --------------------------------------------------------------------------

CRITERIA = [
    ("c1", "Dataflow evident, iteration included", 25, "A reader follows one pass left to right and sees where the value comes back, and what leaves after the last pass."),
    ("c2", "Says what the code says", 20, "One block per call; no node the text lacks; the seed, the write-back and the read-after are the code's three uses of the name."),
    ("c3", "Scales", 20, "Several carried names, a nested loop, break/continue, zero iterations, a for item and an iterable."),
    ("c4", "Derivable", 15, "Every mark from the two-pass table; nothing authored."),
    ("c5", "Reuses the branch grammar", 10, "Region, band dots, ordinary fan-in, fold and active; no new vocabulary."),
    ("c6", "Buildable on stock tldraw", 10, "Frame, children, cables, bindings; a cable may already close a cycle."),
]

VARIANTS = [
    {"id": "l1", "name": "Cycle as a cable", "boards": [board_l1_for, board_l1_while],
     "thesis": "Your lean, made exact. The write-back is an ordinary cable from the body's last producer back to the body's first consumer, routed to the region's right edge, down into a reserved bottom lane and back — read one pass left to right, then around. The consumer's port is ordinary fan-in, the same as the branch: a seed cable and a back cable into one port. After the loop the reader's one port takes a last-value cable and a zero-iterations cable, because the seed reaches it untouched when the loop never runs.",
     "best": "Any loop a reader wants to trace once; nested loops as nested regions with their own lanes.",
     "loses": "Every carried name is one more cycle and one more zero-iteration cable; three carried names make three lanes.",
     "scores": {"c1": 4, "c2": 5, "c3": 3, "c4": 5, "c5": 5, "c6": 5},
     "exists": "Cables, fan-in (branch grammar), band dots: all drawn already. The lane is a format rule for the routing, not a shape."},
    {"id": "l2", "name": "State row on the band", "boards": [board_l2],
     "thesis": "LabVIEW's shift register and MLIR's iter_args: each carried name is a pair of dots on a state row under the band — left is this iteration's value, right is the next one's — and after the loop the right dot is what the outside reads. The back-edge is implied by the pair, not drawn.",
     "best": "Many carried names; the reader wants a table of what changes per iteration.",
     "loses": "Adds a mark the code does not have and a convention to learn (the pair means a cycle); the body's first consumer no longer shows where its value comes from.",
     "scores": {"c1": 4, "c2": 3, "c3": 5, "c4": 5, "c5": 3, "c6": 4},
     "exists": "Band dots exist; a second band row and paired dots are new."},
    {"id": "l3", "name": "State node", "boards": [board_l3],
     "thesis": "The 10 golden's own target board: a small state node inside the region that is seeded from outside, written back by the body, read by the body and read after the loop. The node is the φ and the unit delay in one oval.",
     "best": "When you want the carried value to have a place to hover, name and probe.",
     "loses": "A node the code lacks, one per carried name; the oval looks like the class-state ovals but means something else.",
     "scores": {"c1": 4, "c2": 3, "c3": 4, "c4": 5, "c5": 3, "c6": 4},
     "exists": "The bootstrap already emits value:pose-2 with seed / after iteration / next iteration cables (measured below)."},
    {"id": "l4", "name": "Rolled-out ghost lens", "boards": [board_l4],
     "thesis": "Iteration k solid, iteration k+1 as a 35% ghost, so time flows strictly left to right and the hand-off cable is the carried value. Kept as a lens over L1, never as a structure.",
     "best": "Explaining a loop to someone once, on demand.",
     "loses": "Doubles the body, cannot contain its own nesting, and is the Aug 25 l4 that failed the gutter gate.",
     "scores": {"c1": 3, "c2": 2, "c3": 1, "c4": 5, "c5": 2, "c6": 3},
     "exists": "Nothing; a lens would be a render mode over L1."},
    {"id": "l5", "name": "Begin / end pair", "boards": [board_l5],
     "thesis": "Houdini's Block Begin/End and Anemone's Loop Start/End: no region, two blocks, and the body is whatever sits between them; the end feeds the begin by convention.",
     "best": "Editors without containers.",
     "loses": "Breaks the region grammar; the body's extent is a convention; the back-edge is invisible.",
     "scores": {"c1": 3, "c2": 2, "c3": 3, "c4": 4, "c5": 1, "c6": 5},
     "exists": "Two ordinary Blocks; nothing else."},
]


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["total"] = weighted(v["scores"])

HARD_GATES = [
    ("g1", "Stock tldraw boundary", "The direction can be expressed with supported frames, child shapes, ports, bindings, and cables; no engine fork."),
    ("g2", "Source-derived", "Every semantic mark follows from the AST loop table; no hand-authored execution metadata."),
    ("g3", "Same honest loop", "The comparison shows the same seed, body write, possible zero iterations, and read-after on every board."),
]

CRITERION_ANCHORS = {
    "c1": "1: the cycle is hidden · 3: iteration is visible but one transition is implicit · 5: seed, next iteration, and exit trace directly",
    "c2": "1: several invented nodes · 3: one explicit helper convention · 5: the marks correspond directly to calls and value uses",
    "c3": "1: one carried value already crowds the board · 3: a few values work with lane pressure · 5: many values and nesting stay compact",
    "c4": "1: requires authoring · 3: partly inferred · 5: emitted mechanically from the loop table",
    "c5": "1: replaces the region grammar · 3: extends it with one new convention · 5: only existing region, dot, receiver, and cable marks",
    "c6": "1: engine work · 3: custom rendering layer · 5: existing stock shapes and bindings",
}

VARIANT_STORIES = {
    "l1": [
        ("Seed", "The pre-loop estimate enters merge.pose as the seed cable.", (29, 28, 29, 27)),
        ("Back", "merge()'s output goes to the region end, down the bottom lane, then home to merge.pose as the back cable.", (52, 32, 30, 46)),
        ("Exit", "encode.pose joins the last body result with the untouched seed for zero iterations.", (47, 38, 49, 53)),
    ],
    "l2": [
        ("Seed", "The seed lands on the left state terminal in the band row.", (43, 30, 14, 29)),
        ("Carry", "The paired right terminal means next iteration; the return is compact but implicit.", (54, 28, 28, 31)),
        ("Exit", "The right terminal is also the loop's final value, including the seed when no iteration runs.", (76, 36, 19, 29)),
    ],
    "l3": [
        ("Seed", "The estimate seeds a named state oval inside the loop region.", (45, 35, 17, 26)),
        ("Back", "The body output returns along the bottom lane to that state object.", (48, 38, 32, 41)),
        ("Exit", "The same state object is read after the loop by encode().", (49, 46, 46, 45)),
    ],
    "l4": [
        ("Iteration k", "The first copy is the ordinary body for the current iteration.", (53, 29, 22, 27)),
        ("Hand-off", "Its output flows down into the translucent k+1 copy.", (53, 40, 25, 34)),
        ("Lens", "The ghost is a teaching overlay; it is not another structure in the saved board.", (52, 54, 25, 30)),
    ],
    "l5": [
        ("Begin", "Loop Begin emits the current carried value and the current item.", (48, 31, 17, 27)),
        ("Body", "The ordinary node chain between the pair is the body.", (64, 32, 16, 27)),
        ("End", "Loop End returns its result to Begin by convention and exposes the final value.", (80, 28, 15, 47)),
    ],
}

VARIANT_PARTS = {
    "l1": ["seed and back cables into one port", "bottom return lane", "last and zero-iterations cables into one port"],
    "l2": ["state row", "paired border terminals", "compact many-value layout"],
    "l3": ["named state probe", "state oval", "explicit stored-value affordance"],
    "l4": ["ghost iteration lens", "k → k+1 teaching view", "temporal fade"],
    "l5": ["begin/end pair", "body by span", "explicit Completed-style exit"],
}

VARIANT_TAGLINES = {
    "l1": "The loop is a region; its only new semantic is an ordinary cable that leaves the last producer and returns to the first consumer.",
    "l2": "Each carried name becomes a paired state terminal on the region band: current value on the left, next/final value on the right.",
    "l3": "A small named state object inside the region is seeded before the loop, updated by the body, and read afterward.",
    "l4": "A translucent second copy of the body shows the hand-off from iteration k to iteration k+1 as a left-to-right teaching view.",
    "l5": "Loop Begin and Loop End define the repeated span; the end result feeds the begin node by their paired relationship.",
}

SCORE_EVIDENCE = {
    "l1": {
        "c1": ("The main specimen visibly closes the value path and labels next iteration; exit paths are separate.", "high"),
        "c2": ("Every solid block is a source call; the two cables into one port are the two reaching definitions.", "high"),
        "c3": ("One value fits; each extra carried value adds a return lane and a zero path.", "medium"),
        "c4": ("The two-pass probe yields the seed, back producer, consumer, and exit φ used by the drawing.", "high"),
        "c5": ("Uses the existing region, band dot, fan-in receiver, and cable vocabulary only.", "high"),
        "c6": ("All marks map to stock frame/child/binding shapes; only an elbow routing preset is new.", "high"),
    },
    "l2": {
        "c1": ("Left/right state terminals make iteration visible, but the return itself is a learned convention.", "high"),
        "c2": ("The border row names state that the source expresses only as repeated value definitions.", "high"),
        "c3": ("Rows stack compactly and mirror mature many-state systems such as LabVIEW and Blender.", "medium"),
        "c4": ("Each row follows mechanically from one carried name in the loop table.", "high"),
        "c5": ("Keeps the region but adds a dedicated state row and terminal-pair convention.", "high"),
        "c6": ("Buildable from stock dots and children, with a small custom band-row renderer.", "high"),
    },
    "l3": {
        "c1": ("Seed, feedback, and read-after converge on one obvious named object.", "high"),
        "c2": ("The state oval is not a source call and reifies a value name as an extra node.", "high"),
        "c3": ("Several names remain readable but require one object each inside the body.", "medium"),
        "c4": ("The existing golden proves the state node can be derived from the carried-name table.", "high"),
        "c5": ("It preserves the region but introduces a state-node meaning distinct from existing class-state ovals.", "high"),
        "c6": ("The saved target already expresses the idea with supported shapes and edges.", "high"),
    },
    "l4": {
        "c1": ("k → k+1 reads left-to-right, but the real return and zero-iteration path disappear behind the lens.", "high"),
        "c2": ("A duplicated merge() appears even though the source contains one call.", "high"),
        "c3": ("The body doubles before nesting or multiple iterations are considered.", "high"),
        "c4": ("The ghost copy and hand-off can be generated from the same loop table.", "medium"),
        "c5": ("Uses normal blocks but adds a temporal ghost mode outside the settled region grammar.", "high"),
        "c6": ("Possible as a render lens, but not as ordinary persistent board content.", "medium"),
    },
    "l5": {
        "c1": ("Begin/body/end order is visible; feedback and the zero case are conventions rather than wires.", "high"),
        "c2": ("Two control blocks are introduced that have no call-site counterpart.", "high"),
        "c3": ("Pairs nest and support many values, but body extent and pairing become layout-dependent.", "medium"),
        "c4": ("The pair and carried ports are mechanically inferable from the AST.", "high"),
        "c5": ("It discards the chosen region grammar in favor of paired nodes.", "high"),
        "c6": ("Two ordinary Blocks and cables fit stock tldraw directly.", "high"),
    },
}

GATE_RESULTS = {
    "l1": {"g1": True, "g2": True, "g3": True},
    "l2": {"g1": True, "g2": True, "g3": True},
    "l3": {"g1": True, "g2": True, "g3": True},
    "l4": {"g1": True, "g2": True, "g3": False},
    "l5": {"g1": True, "g2": True, "g3": False},
}

EDITOR_VISUALS = [
    {
        "id": "labview", "name": "LabVIEW", "idiom": "Region + shift-register pair",
        "image": VISUALS / "labview-shift-registers.gif", "source": "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/shift_registers_concepts.html",
        "credit": "NI LabVIEW Help mirror", "license": "Documentation screenshot",
        "summary": "The loop is the rectangular region. Each left/right terminal pair is one carried value: seed enters at left, the body writes right, and right becomes both next iteration and the final outside value.",
        "hotspots": [("1", 6, 10, "N=10 controls how many times the region executes."), ("2", 16, 40, "Left terminals deliver the seed first, then the previous iteration's value."), ("3", 78, 40, "Right terminals accept this iteration's write and expose the last value outside.")],
    },
    {
        "id": "blender", "name": "Blender Geometry Nodes", "idiom": "Repeat zone + repeat items",
        "image": VISUALS / "blender-repeat-zone.png", "source": "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/utilities/repeat_zone.html",
        "credit": "Blender Manual", "license": "CC BY-SA 4.0",
        "summary": "The orange zone is the loop. The left Repeat node initializes named items; the right Repeat node writes their next value and is also the zone's final result. The top socket emits the iteration index.",
        "hotspots": [("1", 21, 52, "Iterations sets the count; Iteration emits the current index."), ("2", 32, 73, "Geometry enters the zone as the initial carried item."), ("3", 74, 46, "Repeat Output supplies the next iteration and the result after the last.")],
    },
    {
        "id": "houdini", "name": "Houdini SOPs", "idiom": "Block Begin / End + reference",
        "image": VISUALS / "houdini-loop-network.jpg", "source": "https://www.sidefx.com/docs/houdini/model/looping.html",
        "credit": "SideFX Houdini docs", "license": "Documentation screenshot",
        "summary": "The orange outline is the loop body. Block Begin uses the input on iteration one, then fetches Block End's previous result by reference. The graph stays visually acyclic; the named relationship carries the cycle.",
        "hotspots": [("1", 51, 31, "Fetch Feedback returns the input on pass one and the end result thereafter."), ("2", 51, 55, "Every node inside the orange block runs once per iteration."), ("3", 56, 80, "Block End pairs with Begin and emits the final geometry.")],
    },
    {
        "id": "simulink", "name": "Simulink", "idiom": "Iterator subsystem + Memory",
        "image": VISUALS / "simulink-for-iterator.png", "source": "https://www.mathworks.com/help/simulink/ug/iterate-subsystem-execution.html",
        "credit": "MathWorks documentation", "license": "Documentation screenshot",
        "summary": "The subsystem supplies a For Iterator block. State is a separate Memory/Delay block: the sum writes it, and on the next iteration Memory feeds that stored result back into the sum. The delayed initial condition defines iteration zero.",
        "hotspots": [("1", 33, 49, "The For Iterator consumes N and emits the current 1:N index."), ("2", 52, 49, "The body combines this index with the carried running total."), ("3", 65, 72, "Memory makes the return edge one iteration late and supplies the initial value.")],
    },
    {
        "id": "unreal", "name": "Unreal Blueprints", "idiom": "Control-flow macro",
        "image": VISUALS / "unreal-for-loop.png", "source": "https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine",
        "credit": "Epic Developer Community", "license": "Documentation screenshot",
        "summary": "ForLoop is a control node, not a data region. It emits Loop Body once per index and Completed once at the end. Any value carried between passes lives in an explicit Blueprint variable, outside the loop node's visual grammar.",
        "hotspots": [("1", 37, 34, "First/Last Index configure the loop on the macro itself."), ("2", 47, 30, "Loop Body emits one execution pulse per iteration."), ("3", 47, 50, "Index is ordinary data that feeds the body graph."), ("4", 47, 67, "Completed is the separate after-loop execution path.")],
    },
]

PRIOR = [
    ("MLIR scf.for / scf.while", "region; loop-carried values are region arguments (iter_args), initialised from operands, advanced by scf.yield; the induction variable is a region argument", "the results of the op: 'the number and types of the scf.for results must match the initial values in the iter_args binding and the yield operands'; scf.while's before/after regions 'communicate by means of region arguments'", "L2 is iter_args drawn; L1's two cables into one port are the same two facts (init, yield) at the consumer", "[1]"),
    ("LabVIEW For / While Loop", "region; shift register = 'a pair of terminals… directly opposite each other on the vertical sides of the loop border'; the right one 'stores data on the completion of an iteration', the left returns it next iteration; 'after the loop executes, the terminal on the right side… returns the last value'; auto-indexing tunnels feed one element per iteration", "the shift register pair; a Feedback Node ('stores data when the loop completes an iteration and then sends the stored data to the next loop iteration') that LabVIEW inserts on its own when an output is wired back to an input inside a loop, with an option to turn that off", "L2 exactly; the last-value rule is L2's right dot; auto-indexing is the item dot on the band", "[2][3][4][5][20]"),
    ("Simulink For Iterator / While Iterator Subsystem; Unit Delay", "region executed N times per time step; the While Iterator 'repeatedly executes the contents of the subsystem during the current time step while the value of the input condition is true'; iteration number output; 'States when starting' held or reset", "Unit Delay: 'Delay signal one sample period', with an Initial condition parameter", "the delay glyph is a node the code lacks; its initial condition is the seed", "[6][7][8]"),
    ("Houdini Block Begin / Block End; Solver SOP", "a pair of nodes, not a container; Fetch Feedback: 'each subsequent loop will start with the output of the previous loop'; Extract Piece for for-each; a meta import node for the iteration count", "Block End's output is the next Block Begin's input; the Solver's Prev_Frame node holds 'the geometry from the previous frame'", "L5; the pair convention hides the extent of the body", "[9][10]"),
    ("Blender Repeat zone; Simulation zone", "region: 'an input node on the left, an output node on the right, and an orange area in the middle'; inner nodes 'write to the output node for providing inputs to the next iteration, and for providing the result of the zone after the last iteration'; the Iteration socket gives the index; outside inputs are 'the same in every iteration'", "the zone's Output node (state items); Simulation: 'the result of one frame to influence the next one', accessible only via the Simulation Output node", "the asymmetry again, with the carried value as an explicit zone item (L2/L3)", "[11][12]"),
    ("TouchDesigner Feedback TOP", "no cycle in the network: the Feedback TOP 'outputs an image stream sourced from its Target TOP' downstream", "previous frame of a downstream node; Reset / Reset Pulse", "a feedback that hides its cycle behind a target reference; the opposite of wires-always", "[13]"),
    ("Grasshopper + Anemone", "Grasshopper has no loops; Anemone adds a Loop Start ('Start the loop with this one') and Loop End pair with a Counter and D0.. data that goes around", "Loop End feeds Loop Start; a timeout per loop mode", "L5", "[14][15]"),
    ("Unreal Blueprints ForLoop / WhileLoop", "exec macros: 'firing off an execution pulse for each index between a start and end'; pins Loop Body, Index, Completed", "no data join: a value that must survive an iteration is written to a variable", "control without data; the variable is L3 by another name", "[16]"),
    ("Dennis / Arvind loop schema", "the conditional schema with a loop-back arc: one switch per value entering, one merge per value leaving, driven by the loop predicate", "the merge at the top of the loop is the φ; the loop-back arc is the back-edge", "L1's cycle is the classic dataflow drawing; the fan-in are the merge", "[17]"),
    ("Synchronous dataflow (Lee & Parks)", "feedback edges carry initial tokens (delays); a graph is well-formed when every cycle passes through a delay", "the initial token is the seed; the delay is what makes the cycle a DAG in time", "the region already says a backwards cable is one iteration late; the delay mark adds only the initial value, which the seed slot already draws", "[18]"),
    ("Kodosky, LabVIEW (HOPL IV)", "'A box could encapsulate the semantics of the iterative behavior… its boundary could hold iteration state information'", "the boundary", "why the region, and why L2 puts the state on the border", "[19]"),
]

SOURCES = [
    (1, "MLIR — 'scf' Dialect: scf.for with iter_args, scf.while with before/after regions", "https://mlir.llvm.org/docs/Dialects/SCFDialect/"),
    (2, "NI LabVIEW Help — Shift Registers: Passing Values between Loop Iterations (rajsite mirror)", "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/shift_registers_concepts.html"),
    (3, "NI LabVIEW Help — Feedback Node (rajsite mirror)", "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/feedback_node_concepts.html"),
    (4, "NI LabVIEW Help — Processing Individual Elements in an Array or a Collection with a Loop (auto-indexing)", "https://www.ni.com/docs/en-US/bundle/labview/page/processing-individual-elements-in-an-array-or-a-collection-with-a-loop.html"),
    (5, "NI Knowledge Base — Remove Automatic Feedback Node in LabVIEW or LabVIEW FPGA", "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019VwSSAU"),
    (6, "MathWorks — For Iterator Subsystem", "https://www.mathworks.com/help/simulink/slref/foriteratorsubsystem.html"),
    (7, "MathWorks — While Iterator block", "https://www.mathworks.com/help/simulink/slref/whileiterator.html"),
    (8, "MathWorks — Unit Delay block", "https://www.mathworks.com/help/simulink/slref/unitdelay.html"),
    (9, "SideFX — Looping (Block Begin / Block End, Fetch Feedback, Extract Piece)", "https://www.sidefx.com/docs/houdini/model/looping.html"),
    (10, "SideFX — Solver SOP (Prev_Frame)", "https://www.sidefx.com/docs/houdini/nodes/sop/solver.html"),
    (11, "Blender Manual — Repeat Zone", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/utilities/repeat_zone.html"),
    (12, "Blender Manual — Simulation Zone", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/simulation/simulation_zone.html"),
    (13, "Derivative — Feedback TOP", "https://docs.derivative.ca/Feedback_TOP"),
    (14, "Grasshopper Docs — Anemone: Loop Start", "https://grasshopperdocs.com/components/anemone/loopStart.html"),
    (15, "Grasshopper Docs — Anemone add-on", "https://grasshopperdocs.com/addons/anemone.html"),
    (16, "Epic — Flow Control in Unreal Engine (ForLoop, WhileLoop)", "https://dev.epicgames.com/documentation/unreal-engine/flow-control-in-unreal-engine"),
    (17, "Arvind & Culler (1986) — Dataflow Architectures (conditional and loop schemas)", "https://dspace.mit.edu/bitstream/handle/1721.1/149103/MIT-LCS-TM-294.pdf?sequence=1&isAllowed=y"),
    (18, "Lee & Parks (1995) — Dataflow Process Networks (delays as initial tokens)", "https://bears.ece.ucsb.edu/class/ece253/papers/lee_parks_ieee95.pdf"),
    (19, "Kodosky (2020) — LabVIEW, HOPL IV", "https://dl.acm.org/doi/10.1145/3386328"),
    (20, "NI Forum — VI of the Day (9/25/2009): Feedback Node ('wired an output to input and wound up with a feedback node'; 'turn off the autowiring of the feedback node')", "https://forums.ni.com/t5/LabVIEW/VI-of-the-Day-9-25-2009-Feedback-Node/td-p/991607"),
]

# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--warn:#d9480f;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1400px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(34px,5vw,56px);line-height:1.02;letter-spacing:-.04em;margin:10px 0 14px;max-width:1000px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}h3{font-size:18px;margin:26px 0 8px}p{max-width:880px}
.lede{font-size:18px;color:#39424f;max-width:920px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.fact b{display:block;font-size:24px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg,figure img{display:block;width:100%;height:auto}figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.objective{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin:24px 0}.objective>div{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px}.objective h3{margin:0 0 8px}.gate-list{display:grid;gap:8px}.gate{display:flex;gap:10px;align-items:flex-start}.gate b{font:700 12px ui-monospace,monospace;color:var(--accent)}
.atlas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:20px 0 34px}.editor-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}.editor-card.wide{grid-column:1/-1}.editor-card header{padding:16px 18px 8px}.editor-card h3{margin:0}.idiom{color:var(--accent);font:700 12px ui-monospace,monospace}.shot{position:relative;margin:8px 18px;background:#181a1f;border-radius:12px;min-height:270px;display:grid;place-items:center;overflow:hidden}.shot img{display:block;max-width:100%;max-height:360px;width:auto;height:auto;object-fit:contain}.hotspot{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border:2px solid #fff;border-radius:50%;background:#ff7a1a;color:#fff;box-shadow:0 2px 8px #0008;font:800 13px/24px ui-monospace,monospace;text-align:center}.editor-card .explain{padding:8px 18px 18px}.editor-card .summary{margin:4px 0 12px;max-width:none}.steps{display:grid;gap:7px}.step{display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start;color:#39424f;font-size:13px}.step b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#ffeadb;color:#b84d00;font:800 11px ui-monospace,monospace}.credit{margin:12px 0 0;font-size:12px;color:var(--muted)}
.variant{margin-top:28px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}.variant>header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding:18px 20px 8px}.variant>header h3{margin:0}.variant>.thesis{margin:0;padding:0 20px 12px;max-width:1050px}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.hero{position:relative;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#fafbfc}.hero svg{display:block;width:100%;height:auto}.focus{position:absolute;border:3px solid #ff7a1a;background:#ff7a1a16;border-radius:14px;box-shadow:0 0 0 9999px #10131a16;pointer-events:none;transition:all .25s ease}.story{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:12px 16px;background:#111827;color:#fff}.story-nav,.direct{display:flex;gap:6px;flex-wrap:wrap}.story button,.decision-action,.part{border:1px solid #d6dae2;border-radius:999px;background:#fff;color:#1d2230;padding:7px 11px;font:700 12px ui-sans-serif,system-ui;cursor:pointer}.story button:hover,.story button.active{background:#ff7a1a;color:#fff;border-color:#ff7a1a}.story-copy b{display:block}.story-copy span{color:#cbd5e1;font-size:13px}.variant details{margin:0 20px 14px}.variant details summary{cursor:pointer;font-weight:700;color:var(--muted)}.variant .cols{padding:0 20px 8px}.parts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 20px 18px}.part.selected{background:#eaf1ff;color:#1757c2;border-color:#8eb3f8}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 20px 20px}.decision-action[data-state='pick'].active{background:#dff7e8;color:#116b38;border-color:#76c995}.decision-action[data-state='shortlist'].active{background:#eaf1ff;color:#1757c2;border-color:#8eb3f8}.decision-action[data-state='reject'].active{background:#fff0ec;color:#a43112;border-color:#f0a28d}.note-field{width:min(420px,100%);border:1px solid #d6dae2;border-radius:9px;padding:8px 10px;font:13px system-ui}
.prune{margin-top:28px;border-top:3px solid var(--ink);padding-top:10px}.rank{display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line)}.rank:first-child{background:#eef4ff}.rank .place{font:800 20px ui-monospace,monospace;color:var(--muted)}.rank .total{font:800 18px ui-monospace,monospace}.matrix td small{display:block;color:var(--muted);line-height:1.35;margin-top:3px}.pass{color:var(--ok);font-weight:800}.fail{color:var(--warn);font-weight:800}.synthesis{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:20px 0}.synthesis textarea{display:block;width:100%;min-height:100px;margin:10px 0;border:1px solid #cdd3dd;border-radius:10px;padding:12px;font:14px/1.45 system-ui;resize:vertical}.export-row{display:flex;gap:10px;align-items:center}.export-row button{border:0;border-radius:9px;background:var(--ink);color:#fff;padding:9px 13px;font-weight:700;cursor:pointer}.toast{color:var(--ok);font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1100px}.cols p{margin:6px 0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:700}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:#eef4ff}
pre{background:#0f1420;color:#dfe6f2;padding:16px 18px;border-radius:12px;overflow:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}pre code{background:none;padding:0;color:inherit}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:900px;margin:14px 0}.callout.warn{border-color:var(--warn);background:#fff4ec}.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:900px}li{margin:5px 0}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1200px}.srcs li{break-inside:avoid}.boundary{font-size:13px;color:var(--muted);margin:10px 0 0}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:900px){.facts,.cols,.decision,.objective,.atlas{grid-template-columns:1fr}.editor-card.wide{grid-column:auto}.story{grid-template-columns:1fr}.srcs{columns:1}.shot{min-height:220px}.matrix{display:block;overflow-x:auto}}
"""

INTERACTION_JS = r"""
const STORAGE_KEY = 'systemsketch-loop-babble-v2';
const variants = [...document.querySelectorAll('[data-variant]')];
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { saved = {}; }

function persist() {
  const state = {variants: {}, synthesis: document.querySelector('#global-synthesis').value};
  variants.forEach((section) => {
    state.variants[section.dataset.variant] = {
      decision: section.dataset.decision || '',
      note: section.querySelector('.note-field').value,
      parts: [...section.querySelectorAll('.part.selected')].map((b) => b.dataset.part),
    };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

variants.forEach((section) => {
  const hero = section.querySelector('.hero');
  const story = JSON.parse(hero.dataset.story);
  const focus = hero.querySelector('.focus');
  const title = section.querySelector('.story-copy b');
  const copy = section.querySelector('.story-copy span');
  const play = section.querySelector('[data-play]');
  const directs = [...section.querySelectorAll('[data-direct]')];
  let step = 0;
  let timer = null;

  const stop = () => { if (timer) clearInterval(timer); timer = null; play.textContent = step === story.length - 1 ? 'Replay' : 'Play'; };
  const show = (next) => {
    step = (next + story.length) % story.length;
    const [label, description, box] = story[step];
    title.textContent = label;
    copy.textContent = description;
    [focus.style.left, focus.style.top, focus.style.width, focus.style.height] = box.map((n) => `${n}%`);
    directs.forEach((b, i) => b.classList.toggle('active', i === step));
    play.textContent = step === story.length - 1 && !timer ? 'Replay' : (timer ? 'Pause' : 'Play');
  };
  directs.forEach((b, i) => b.addEventListener('click', () => { stop(); show(i); }));
  section.querySelector('[data-prev]').addEventListener('click', () => { stop(); show(step - 1); });
  section.querySelector('[data-next]').addEventListener('click', () => { stop(); show(step + 1); });
  play.addEventListener('click', () => {
    if (timer) { stop(); return; }
    if (step === story.length - 1) show(0);
    play.textContent = 'Pause';
    timer = setInterval(() => {
      if (step === story.length - 1) { stop(); return; }
      show(step + 1);
    }, 1600);
  });
  section.addEventListener('keydown', (event) => {
    if (event.target.matches('input,textarea,button')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); stop(); show(step - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stop(); show(step + 1); }
  });
  show(0);

  const previous = saved.variants?.[section.dataset.variant] || {};
  section.dataset.decision = previous.decision || '';
  section.querySelector('.note-field').value = previous.note || '';
  section.querySelectorAll('.decision-action').forEach((button) => {
    button.classList.toggle('active', button.dataset.state === section.dataset.decision);
    button.addEventListener('click', () => {
      const next = section.dataset.decision === button.dataset.state ? '' : button.dataset.state;
      if (next === 'pick') variants.forEach((other) => {
        if (other !== section) {
          other.dataset.decision = '';
          other.querySelectorAll('.decision-action').forEach((b) => b.classList.remove('active'));
        }
      });
      section.dataset.decision = next;
      section.querySelectorAll('.decision-action').forEach((b) => b.classList.toggle('active', b.dataset.state === next));
      persist();
    });
  });
  section.querySelectorAll('.part').forEach((button) => {
    button.classList.toggle('selected', (previous.parts || []).includes(button.dataset.part));
    button.addEventListener('click', () => { button.classList.toggle('selected'); persist(); });
  });
  section.querySelector('.note-field').addEventListener('input', persist);
});

const synthesis = document.querySelector('#global-synthesis');
synthesis.value = saved.synthesis || '';
synthesis.addEventListener('input', persist);

function brief() {
  const lines = ['# Loop-region prune', ''];
  variants.forEach((section) => {
    const decision = section.dataset.decision;
    const parts = [...section.querySelectorAll('.part.selected')].map((b) => b.dataset.part);
    const note = section.querySelector('.note-field').value.trim();
    if (decision || parts.length || note) {
      lines.push(`- ${section.dataset.variant.toUpperCase()}: ${decision || 'unmarked'}`);
      if (parts.length) lines.push(`  - Keep: ${parts.join(', ')}`);
      if (note) lines.push(`  - Note: ${note}`);
    }
  });
  if (synthesis.value.trim()) lines.push('', '## Splice', '', synthesis.value.trim());
  return lines.join('\n');
}

document.querySelector('#copy-prune').addEventListener('click', async () => {
  await navigator.clipboard.writeText(brief());
  const toast = document.querySelector('.toast'); toast.textContent = 'Copied'; setTimeout(() => toast.textContent = '', 1600);
});
document.querySelector('#download-prune').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([brief()], {type: 'text/markdown'}));
  const link = document.createElement('a'); link.href = url; link.download = 'loop-region-prune.md'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
"""


def fig(svg: str, caption: str) -> str:
    return f"<figure>{svg}<figcaption>{caption}</figcaption></figure>"


def code_block(s: str) -> str:
    return f"<pre><code>{html.escape(s)}</code></pre>"


def table_html(table: dict, title: str) -> str:
    rows = []
    for loop in table["loops"]:
        if "return" in loop:
            rows.append(f"<tr><td><b>return {html.escape(loop['return'])}</b></td><td colspan='3'>{html.escape(', '.join(f'{k} ← {v}' for k, v in loop['resolves'].items()))}</td></tr>")
            continue
        h = loop["header"]
        rows.append(f"<tr><th colspan='4'>{html.escape(h['label'])} <span class='small'>line {h['line']}</span></th></tr>")
        rows.append(f"<tr><td>band consumes</td><td colspan='3'>{html.escape(', '.join(h['consumes']) or '—')}</td></tr>")
        if h.get("item"):
            rows.append(f"<tr><td>band produces (item)</td><td colspan='3'>{html.escape(', '.join(h['item']))} → {html.escape(', '.join(r['consumer'] for r in loop['itemReads']))}</td></tr>")
        for name, c in loop["carried"].items():
            rows.append(f"<tr><td><span style='color:{ACCENT};font-weight:700'>carried {html.escape(name)}</span></td><td>seed ← {html.escape(c['seed'])}</td><td>back ← {html.escape(c['back'])}</td><td>read by {html.escape(c['consumer'])}</td></tr>")
        rows.append(f"<tr><td>body reads from outside</td><td colspan='3'>{html.escape(', '.join(loop['bodyReadsFromOutside']) or '—')}</td></tr>")
        for name, p in loop["exitPhi"].items():
            rows.append(f"<tr><td><span style='color:{ACCENT};font-weight:700'>φ {html.escape(name)} after the loop</span></td><td colspan='3'>{html.escape('; '.join(f'{k} → {v}' for k, v in p.items()))}</td></tr>")
    return f"<h3>{html.escape(title)}</h3><table><tr><th>fact</th><th></th><th></th><th></th></tr>{''.join(rows)}</table>"


def criteria_html() -> str:
    criteria = "".join(
        f"<li><b>{c[0]} · {html.escape(c[1])}</b> ({c[2]}%) — {html.escape(c[3])} "
        f"<details><summary>1 / 3 / 5 anchors</summary>{html.escape(CRITERION_ANCHORS[c[0]])}</details></li>"
        for c in CRITERIA
    )
    gates = "".join(
        f"<div class='gate'><b>{gid.upper()}</b><span><strong>{html.escape(name)}</strong><br><span class='small'>{html.escape(desc)}</span></span></div>"
        for gid, name, desc in HARD_GATES
    )
    return (
        '<div class="objective"><div id="criteria-strip"><h3>Weighted objective · fixed before the boards</h3>'
        f'<ol id="requirement-table">{criteria}</ol></div><div id="constraint-strip"><h3>Hard gates · pass / fail, never averaged</h3>'
        f"<div class='gate-list'>{gates}</div>"
        "<p class='boundary'><b>Prototype boundary:</b> self-contained visual explanations and runnable comparison controls; no analyzer or production renderer changes.</p></div></div>"
    )


def visual_atlas_html() -> str:
    cards = []
    for i, item in enumerate(EDITOR_VISUALS):
        spots = "".join(
            f"<span class='hotspot' style='left:{x}%;top:{y}%' aria-label='{html.escape(label)}'>{html.escape(num)}</span>"
            for num, x, y, label in item["hotspots"]
        )
        steps = "".join(
            f"<div class='step'><b>{html.escape(num)}</b><span>{html.escape(label)}</span></div>"
            for num, _x, _y, label in item["hotspots"]
        )
        cards.append(
            f"<article class='editor-card {'wide' if i == len(EDITOR_VISUALS) - 1 else ''}' id='editor-{item['id']}'>"
            f"<header><div class='idiom'>{html.escape(item['idiom'])}</div><h3>{html.escape(item['name'])}</h3></header>"
            f"<div class='shot'><img src='{data_uri(item['image'])}' alt='{html.escape(item['name'])} loop screenshot'>{spots}</div>"
            f"<div class='explain'><p class='summary'>{html.escape(item['summary'])}</p><div class='steps'>{steps}</div>"
            f"<p class='credit'>Screenshot: <a href='{html.escape(item['source'])}'>{html.escape(item['credit'])}</a> · {html.escape(item['license'])}</p></div></article>"
        )
    return "<div class='atlas'>" + "".join(cards) + "</div>"


def variants_html() -> str:
    out = []
    for v in VARIANTS:
        main = v["boards"][0]()
        story = VARIANT_STORIES[v["id"]]
        direct = "".join(f"<button type='button' data-direct='{i}'>{html.escape(s[0])}</button>" for i, s in enumerate(story))
        focus = story[0][2]
        supporting = "".join(
            fig(b(), f"<b>{html.escape(v['name'])}.</b> The while fixture uses the same seed / next / exit reading.")
            for b in v["boards"][1:]
        )
        parts = "".join(f"<button class='part' type='button' data-part='{html.escape(p)}'>{html.escape(p)}</button>" for p in VARIANT_PARTS[v["id"]])
        out.append(
            f"<section class='variant' id='{v['id']}' data-variant='{v['id']}' tabindex='0'><header><h3>{v['id'].upper()} · {html.escape(v['name'])}</h3></header>"
            f"<p class='thesis'>{html.escape(VARIANT_TAGLINES[v['id']])}</p>"
            f"<div class='hero' data-story='{html.escape(json.dumps(story))}'>{main}<span class='focus' style='left:{focus[0]}%;top:{focus[1]}%;width:{focus[2]}%;height:{focus[3]}%'></span></div>"
            f"<div class='story'><div class='story-nav'><button type='button' data-prev>← Back</button><button type='button' data-play>Play</button><button type='button' data-next>Next →</button></div>"
            f"<div class='story-copy'><b>{html.escape(story[0][0])}</b><span>{html.escape(story[0][1])}</span></div><div class='direct'>{direct}</div></div>"
            f"{supporting}<details><summary>Decisions, fit, and trade-off</summary><p>{html.escape(v['thesis'])}</p>"
            f"<div class='cols'><div><span class='k'>best when</span><p>{html.escape(v['best'])}</p></div><div><span class='k'>loses when</span><p>{html.escape(v['loses'])}</p></div><div><span class='k'>what exists today</span><p>{html.escape(v['exists'])}</p></div></div></details>"
            f"<div class='parts' aria-label='Parts to keep'>{parts}</div>"
            f"<div class='actions'><button class='decision-action' type='button' data-state='pick'>Pick</button><button class='decision-action' type='button' data-state='shortlist'>Shortlist</button><button class='decision-action' type='button' data-state='reject'>Reject</button><input class='note-field' aria-label='Note for {v['id'].upper()}' placeholder='Optional note for {v['id'].upper()}'></div></section>"
        )
    return '<div id="variant-grid">' + "".join(out) + "</div>"


def prune_html() -> str:
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    for v in sorted(VARIANTS, key=lambda v: -v["total"]):
        cells = "".join(
            f"<td class='n'><b>{v['scores'][c[0]]}/5</b><small>{html.escape(SCORE_EVIDENCE[v['id']][c[0]][0])}<br>confidence: {SCORE_EVIDENCE[v['id']][c[0]][1]}</small></td>"
            for c in CRITERIA
        )
        rows += f"<tr class='{'win' if v['id'] == 'l1' else ''}'><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>{cells}<td class='n'><b>{v['total']}</b></td></tr>"
    ranked = "".join(
        f"<div class='rank'><span class='place'>#{i}</span><span><b>{v['id'].upper()} · {html.escape(v['name'])}</b>{' · provisional default' if v['id'] == 'l1' else ''}</span><span class='total'>{v['total']}/100</span></div>"
        for i, v in enumerate(sorted(VARIANTS, key=lambda v: -v["total"]), 1)
    )
    gate_head = "".join(f"<th>{g[0].upper()}<br><span class='small'>{html.escape(g[1])}</span></th>" for g in HARD_GATES)
    gate_rows = "".join(
        f"<tr><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>" +
        "".join(f"<td class='{'pass' if GATE_RESULTS[v['id']][g[0]] else 'fail'}'>{'PASS' if GATE_RESULTS[v['id']][g[0]] else 'FAIL'}</td>" for g in HARD_GATES) + "</tr>"
        for v in VARIANTS
    )
    return (
        '<section class="prune" id="ai-prune"><h2>AI prune · evidence first, judgment second</h2>'
        '<div class="callout ok" id="ai-recommendation"><b>Provisional default: L1 · Cycle as a cable (87/100).</b> It is the only direction that keeps the chosen region grammar, makes the cycle a literal cable, and maps seed/back/exit directly to the two-pass table. L2 (81) is the fallback when several carried names make the return lanes noisy.</div>'
        f'<div id="ranking-strip">{ranked}</div>'
        "<h3>Hard-gate results</h3>"
        f"<table><tr><th>variant</th>{gate_head}</tr>{gate_rows}</table>"
        "<p class='small'>L4 and L5 remain useful references, but they fail G3 in the hero specimen: neither visibly carries the possible zero-iteration result.</p>"
        "<h3>Auditable weighted matrix</h3>"
        f'<table class="matrix" id="score-matrix"><tr><th>variant</th>{head}<th class="n">total</th></tr>{rows}</table>'
        "<div class='callout'><b>Decision hinge.</b> L1 loses mainly on scale: each carried name adds a cycle and a zero-iteration cable. If the three-carried-name fixture reads badly, move the receiver pair onto the band and use L2; the rest of the grammar stays put.</div></section>"
    )


def prior_html() -> str:
    rows = "".join(f"<tr><td><b>{html.escape(t)}</b></td><td>{html.escape(m)}</td><td>{html.escape(c)}</td><td>{html.escape(l)} <span class='small'>{cite}</span></td></tr>" for t, m, c, l, cite in PRIOR)
    return f"<table><tr><th>tool / theory</th><th>the loop is…</th><th>the carried value is…</th><th>what it teaches this design</th></tr>{rows}</table>"


def sources_html() -> str:
    return "<ol class='srcs'>" + "".join(f"<li>{html.escape(t)} — <a href='{html.escape(u)}'>{html.escape(u)}</a></li>" for _, t, u in SOURCES) + "</ol>"


def babble_data() -> str:
    requirement_pass = {
        "c1": "The seed, transition to the next iteration, and after-loop value can be traced from the hero without prose reconstruction.",
        "c2": "The visual objects correspond to source calls and reaching definitions without disguising invented helper state as source code.",
        "c3": "The same grammar remains legible with several carried names, nesting, a for item, and a possible zero-iteration result.",
        "c4": "Every semantic mark can be emitted from the two-pass AST table.",
        "c5": "The direction composes the settled region, band-dot, receiver, fold, and cable grammar.",
        "c6": "The direction can be built through supported tldraw frames, child shapes, ports, bindings, and routes.",
    }
    requirements = []
    for cid, name, weight, why in CRITERIA:
        anchor_text = CRITERION_ANCHORS[cid].split(" · ")
        requirements.append({
            "id": cid, "name": name, "weight": weight, "why": why,
            "passCondition": requirement_pass[cid],
            "anchors": {"1": anchor_text[0].removeprefix("1: "), "3": anchor_text[1].removeprefix("3: "), "5": anchor_text[2].removeprefix("5: ")},
        })
    gate_evidence = {
        "g1": "The specimen uses only frame-like regions, ordinary child shapes, ports, bindings, and cables supported by the stock boundary.",
        "g2": "The loop form, item, carried names, producers, consumers, and exit definitions come from the AST probe.",
        "g3": "The hero shows the same seed, body write, possible zero-iteration result, and after-loop read.",
    }
    variants = []
    for v in VARIANTS:
        story = VARIANT_STORIES[v["id"]]
        variants.append({
            "id": v["id"], "name": v["name"], "thesis": VARIANT_TAGLINES[v["id"]],
            "bestWhen": v["best"], "losesWhen": v["loses"],
            "decisions": [
                {"label": "Cycle location", "value": story[1][1]},
                {"label": "Exit reading", "value": story[2][1]},
            ],
            "keepParts": VARIANT_PARTS[v["id"]],
            "proof": ["Rendered against the shared 10_loop_carried_state fixture.", "Seed / transition / exit walkthrough exercised in the self-contained report."],
            "scores": {
                cid: {"score": v["scores"][cid], "evidence": SCORE_EVIDENCE[v["id"]][cid][0], "confidence": SCORE_EVIDENCE[v["id"]][cid][1]}
                for cid, *_rest in CRITERIA
            },
            "gateResults": {
                gid: {
                    "pass": GATE_RESULTS[v["id"]][gid],
                    "evidence": gate_evidence[gid] if GATE_RESULTS[v["id"]][gid] else (
                        "The hero omits the possible zero-iteration exit, so it does not depict the full shared semantic fixture."
                    ),
                }
                for gid, *_rest in HARD_GATES
            },
            "previewLabel": "interactive seed / transition / exit trace",
            "story": {
                "title": "Trace one loop value",
                "steps": [
                    {"label": label, "caption": caption, "state": f"step-{i}", "target": f"[data-direct='{i}']"}
                    for i, (label, caption, _box) in enumerate(story)
                ],
            },
            "preview": v["boards"][0](),
        })
    project = {
        "schemaVersion": 3,
        "title": "How node editors draw do this again",
        "kicker": "SystemSketch · AI research + /babble 5 · 2026-09-02",
        "brief": "Use real node-editor screenshots and five comparable SystemSketch prototypes to decide how a source loop should show iteration, carried values, and the after-loop result.",
        "count": 5,
        "defaultId": "l1",
        "defaultWhy": "L1 Cycle as a cable is the highest-scoring eligible direction at 87/100 because it reuses the settled region and receiver grammar while making the next-iteration transition a literal cable.",
        "decisionHinge": "If a three-carried-name fixture makes L1's independent return lanes unreadable, prefer L2's compact band row even though it makes the cycle conventional instead of literal.",
        "invariants": [
            "Use the same 10_loop_carried_state source and board viewport.",
            "Show the seed, body write, possible zero iterations, and read-after honestly.",
            "Keep tldraw 5.3.2 stock and use supported composition seams.",
            "Prototype only; do not change the analyzer or production renderer in this report.",
        ],
        "boundary": "The screenshots, SVG boards, guided traces, direct controls, prune state, and export are real. Analyzer lowering, saved-board rendering, nested loops, break, continue, and production integration remain outside this prototype.",
        "axes": [
            {"name": "Where the cycle lives", "values": ["literal cable", "border terminal pair", "state object", "ghost hand-off", "begin/end reference"]},
            {"name": "What the primary object is", "values": ["region and cable", "state row", "carried name", "iteration pair", "control-node pair"]},
            {"name": "How the final value exits", "values": ["last/zero receiver", "right terminal", "state read", "ghost output", "end output"]},
        ],
        "requirements": requirements,
        "hardGates": [{"id": gid, "name": name, "why": why} for gid, name, why in HARD_GATES],
        "variants": variants,
        "checks": [
            "Exactly five structural directions at a common fidelity and viewport.",
            "Five credited native-editor screenshots precede the SystemSketch boards.",
            "Every variant exposes a guided and directly manipulable three-step story.",
            "Every score includes evidence and confidence; gate results remain separate.",
            "Pick, shortlist, reject, notes, splice selection, persistence, copy, and download work locally.",
        ],
    }
    return json.dumps(project, ensure_ascii=False).replace("</", "<\\/")


def build() -> str:
    f = FACTS
    ins = ", ".join(f"{n} ({k})" for n, k in f["inputs"])
    outs = ", ".join(f"{n} ({k})" for n, k in f["outputs"])
    carried = TABLE_10["loops"][0]["carried"]["pose"]
    exit_phi = TABLE_10["loops"][0]["exitPhi"]["pose"]
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loop regions — visual research and five ways to draw a loop</title><style>{CSS}</style></head>
<body><main>
<div class="eyebrow">SystemSketch · visual AI research + five-variant babble · {TODAY}</div>
<h1>How node editors draw “do this again.”</h1>
<p class="lede">Five real node-editor screenshots first, then the same Python loop drawn five ways in SystemSketch. The visual question is narrow: where does the loop live, where does the current item come from, how does a value reach the next iteration, and what leaves after the loop runs zero or more times?</p>

<div class="facts">
<div class="fact"><b>{len(f['inputs'])} in · {len(f['outputs'])} out</b><span>the analyzer's current opaque region for the 10 golden: {html.escape(ins)} → {html.escape(outs)}</span></div>
<div class="fact"><b>{'cycle' if f['cycle'] else 'no cycle'}</b><span>in today's lowering; the authored target instead uses <code>{html.escape(str(TARGET['stateNode']))}</code> and one “{html.escape(str(TARGET['backEdgeLabel']))}” edge</span></div>
<div class="fact"><b>seed · back</b><span>inside the loop, <code>{html.escape(carried['consumer'])}</code> can read {html.escape(carried['seed'])} first or {html.escape(carried['back'])} next</span></div>
<div class="fact"><b>last · zero</b><span>after the loop, <code>pose</code> is {html.escape(exit_phi['after ≥1 iteration'])} or {html.escape(exit_phi['after 0 iterations'])}</span></div>
</div>

<h2>1 · Comparison contract</h2>
<p>The criteria and gates below were frozen before the five alternatives were scored. The common fixture is <code>10_loop_carried_state</code>; every candidate must explain the same seed, one body write, one next-iteration hand-off, and one after-loop read.</p>
{criteria_html()}

<h2>2 · Five editors, visually</h2>
<p>These are vendor-documentation captures, not redraws. Orange numbered markers isolate the mechanics that matter; the surrounding UI remains visible so each convention can be judged in its native visual language.</p>
{visual_atlas_html()}
<details><summary><b>Open the complete research matrix: ten tools and theories</b></summary>{prior_html()}</details>

<h2>3 · Five SystemSketch directions · unranked</h2>
<p>Each hero uses the same source and viewport. Click the three semantic steps directly, or press Play to trace the same state machine. Rankings and the AI recommendation deliberately appear only after all five.</p>
{variants_html()}

{prune_html()}

<section class="synthesis" id="decision-dock"><h2>Pick, shortlist, or splice</h2>
<p>Select parts on the cards above, then say what you want in plain language. Nothing is preselected by the AI recommendation.</p>
<textarea id="global-synthesis" placeholder="Use L1's literal back cable, borrow L2's compact state row when there are 3+ carried values, always draw the zero path, keep the lane on the bottom…"></textarea>
<div class="export-row"><button id="copy-prune" type="button">Copy prune brief</button><button id="download-prune" type="button">Download .md</button><span class="toast" aria-live="polite"></span></div></section>

<h2>4 · Why the visual evidence points where it does</h2>
<p><b>“No variables, just flow” is what the rigorous representations do underneath.</b> MLIR carries loop state as region arguments and <code>scf.yield</code> hands the next value around [1]. Dennis's dataflow loop schema is a merge fed by the entry value and the loop-back arc [17]. The shared fact is not a variable; it is two possible producers reaching one consumer.</p>
<p><b>The zero-iteration path is not optional semantics.</b> After <code>for other in others</code>, <code>pose</code> is <code>merge()</code>'s last result if there was an iteration and <code>estimate()</code>'s seed if there was none. LabVIEW's right shift-register terminal similarly exposes the last stored value [2]. Any visual grammar that hides this case is compact, but incomplete.</p>
<p><b>Mature tools mark carried state explicitly because an arbitrary backwards wire is ambiguous.</b> LabVIEW uses a terminal pair, Blender uses Repeat items, Houdini references a paired Block End, and Simulink inserts Memory/Delay. A backwards cable becomes unambiguous only when it is inside a region whose contract already says “this runs once per iteration.”</p>
<p><b>The header produces the item.</b> <code>for other in others</code> consumes <code>others</code> and produces <code>other</code>. LabVIEW's auto-indexing tunnel [4], Blender's Iteration socket [11], and Unreal's Index pin [16] are three native examples of the same distinction.</p>
<p><b>Routing is formatting.</b> “Go to the end first, then loop back” means right edge → bottom lane → home by default. Tidy can reapply it; the whiteboard can still bend it.</p>

<h2>5 · The exact code and the two-pass proof</h2>
<p>The analyzer currently collapses the <code>for</code> into one opaque region with {len(f['inputs'])} inputs and {len(f['outputs'])} outputs, marks <code>pose</code> in and out as state edges, and emits no edge back. Its diagnostic reads <i>“{html.escape(f['diagnostic'])}”</i>. The authored target disagrees: {html.escape(Q4)}</p>
{code_block(BODY_10)}
<p><code>docs/loop_carried_binding.py</code> walks the body twice. A name read before the body writes it resolves to the pre-loop value on pass one and to the body's own write on pass two; that difference is the carried set. After the loop, every written name is a φ of the body's last write and the pre-loop value.</p>
{table_html(TABLE_10, "10_loop_carried_state")}
{table_html(TABLE_TRACK, "while fixture")}

<h2>6 · Implementation seam, if L1 is accepted</h2>
{fig(board_seam(), "One region kind for branch and loop. The loop table is the branch table walked twice.")}
<ol>
<li><b>Lower <code>for</code> and <code>while</code> to one region with one arm.</b> The band carries the iterable or test; a <code>for</code> also emits the item.</li>
<li><b>Lower the body twice with a copied table.</b> A read-before-write whose two resolutions differ is carried; feed its consumer through <i>seed</i> and <i>back</i> fan-in.</li>
<li><b>Create an exit φ for every body-written name read afterward.</b> Its reader takes the <i>last</i> and <i>zero</i> cables into one port.</li>
<li><b>Format the back cable to the right edge and bottom lane.</b> Keep that as an overridable routing preset, not a constraint.</li>
</ol>

<h2>7 · Scope and next decision</h2>
<div class="decision">
<div><h4>Done and exercised</h4><ul><li>Five native loop screenshots captured and annotated: LabVIEW, Blender, Houdini, Simulink, Unreal.</li><li>Five equal-fidelity SystemSketch heroes with working Seed / Back / Exit stories, direct controls, persistence, and export.</li><li>Two-pass probe run over the 10 golden and a <code>while</code> fixture.</li></ul></div>
<div><h4>Needs you</h4><ul><li>Pick, shortlist, or splice a direction; provisional AI default is L1, with L2 the scale fallback.</li><li>Confirm whether the zero cable is always drawn (default: yes).</li><li>Confirm bottom return lane (default: bottom).</li></ul></div>
<div><h4>Prototype boundary</h4><ul><li>No analyzer or renderer code changed.</li><li>No <code>break</code>/<code>continue</code>, nested-loop, or loop-in-branch board.</li><li>The screenshots prove the comparison is judgeable, not that any candidate is integrated.</li></ul></div>
<div><h4>Research caveat</h4><ul><li>The NI Knowledge Base had a certificate error in the controlled browser, so the LabVIEW image is from the mirrored NI Help page already cited by the original report.</li><li>All screenshots are locally inlined; this file remains self-contained.</li></ul></div>
</div>

<h2>Source index</h2>
{sources_html()}
<footer>Built by <code>docs/build_loop_regions.py</code> at {GIT_HEAD} · facts measured from the tree at build time · vendor screenshots are credited at each image · SystemSketch boards are SVG prototypes, not live tldraw shapes · OpenAI Codex, {TODAY}.</footer>
</main><script type="application/json" id="babble-data">{babble_data()}</script><script>{INTERACTION_JS}</script></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"facts": FACTS, "target": TARGET, "scores": {v["id"]: v["total"] for v in VARIANTS}}, indent=1))


if __name__ == "__main__":
    main()
