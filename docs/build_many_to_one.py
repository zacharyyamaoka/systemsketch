#!/usr/bin/env python3
"""Build `docs/many-to-one-2026-09-02.html`: the pass-through case, five ways.

Zach's question (PROJECT - pyblocks §Dealing with the pass through case): when
two or more cables land on one port — a branch's arms, a loop's seed and back
cable, a pass-through that skips a region — how should the board say which one
is live?  His plan: wire many-to-one directly, keep the region self-contained,
show the switch with transparency, and let a linter complain when nothing
makes the producers exclusive.  This page writes his rule out as an algorithm
(`docs/many_to_one_rule.py`), runs it on three fixtures, gathers what the node
editors do for bypass and active paths, and draws five variants.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "many-to-one-2026-09-02.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, INK, MUTED, NUMBER, REGION, SVG, THICK, WARN,
    block, boundary_in, boundary_out, cable, chip, dot, frame, note, polycable, text,
)
from many_to_one_rule import Cable, Region, fades, lint, live_counts, opacity  # noqa: E402

DIM = 0.18
BYPASS = "#d97706"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()

# --------------------------------------------------------------------------
# Region drawing (band with control dots, arm rows, dividers)
# --------------------------------------------------------------------------

LABEL_H = 24


def branch_region(svg: SVG, x, y, w, arms, *, headers=(), title="Branch", nested=False, arm_opacity=None, band=None):
    """arms: list of (key, label, h, muted).  Returns band dot positions, arm rects, right, bottom."""
    band = band if band is not None else (22 if nested else 30)
    stroke = "#c9ccd5" if nested else REGION
    total = band + sum(LABEL_H + h for _, _, h, _ in arms) + 8
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{total}" rx="4" fill="none" stroke="{stroke}" stroke-width="{1 if nested else 1.2}"/>')
    svg.add(f'<line x1="{x}" y1="{y + band}" x2="{x + w}" y2="{y + band}" stroke="{stroke}" stroke-width="1"/>')
    svg.add(text(x + w / 2, y + (15 if nested else 20), title, size=11 if nested else 15, mono=True, anchor="middle", color=MUTED if nested else INK))
    out = {"arms": {}, "right": x + w, "bottom": y + total, "x": x, "y": y}
    n = len(headers)
    for i, name in enumerate(headers):
        hy = y + band * (i + 1) / (n + 1)
        svg.add(dot(x, hy, ANY, True, r=5))
        svg.add(text(x + 12, hy + 4, name, size=10.5, color=MUTED))
        out[f"band:{name}"] = (x, hy)
    cy = y + band
    for index, (key, label, h, muted) in enumerate(arms):
        op = (arm_opacity or {}).get(key, 1.0)
        if index:
            svg.add(f'<line x1="{x}" y1="{cy}" x2="{x + w}" y2="{cy}" stroke="{THICK if not nested else "#8d919c"}" stroke-width="{2.2 if not nested else 1.1}"/>')
        svg.add(f'<g opacity="{op}">')
        svg.add(text(x + 16, cy + 16, "⌄", size=12, color=MUTED))
        svg.add(text(x + 28, cy + 16, label, size=12, weight=700, color=MUTED if muted else INK, italic=muted))
        svg.add("</g>")
        out["arms"][key] = (x, cy + LABEL_H, w, h)
        cy += LABEL_H + h
    return out


def loop_region(svg: SVG, x, y, w, h, label, *, header, item, arm_opacity=1.0):
    band = 30
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + band}" x2="{x + w}" y2="{y + band}" stroke="{REGION}" stroke-width="1"/>')
    svg.add(text(x + w / 2, y + 20, label, size=12.5, weight=700, anchor="middle", color=INK))
    svg.add(text(x + w - 12, y + 20, "Loop", size=11, mono=True, anchor="end", color=MUTED))
    svg.add(dot(x, y + band / 2, ANY, True, r=5))
    svg.add(text(x + 12, y + band / 2 + 4, header, size=10.5, color=MUTED))
    ix, iy = x + 40, y + band + 12
    svg.add(f'<g opacity="{arm_opacity}">')
    svg.add(dot(ix, iy, ANY, True, r=4.5))
    svg.add(text(ix + 12, iy + 4, item, size=10.5, color=MUTED, italic=True))
    svg.add("</g>")
    return {"band": (x, y + band / 2), "item": (ix, iy), "right": x + w, "bottom": y + h, "x": x, "y": y, "body_top": y + band}


# --------------------------------------------------------------------------
# Fixture A — the elif chain with a nested if and a pass-through (09 family)
# --------------------------------------------------------------------------

REGIONS_A = {
    "outer": Region("outer", "branch", ("fast", "safe", "else"), None),
    "inner": Region("inner", "branch", ("if",), "unchanged", path=(("outer", "safe"),)),
}
P_FAST = (("outer", "fast"),)
P_SAFE = (("outer", "safe"),)
P_ELSE = (("outer", "else"),)
P_SAFE_IF = (("outer", "safe"), ("inner", "if"))
P_SAFE_UNCH = (("outer", "safe"), ("inner", "unchanged"))

CABLES_A = [
    Cable("raws→decode", "in:raws", "decode.raw"),
    Cable("mode→band", "in:mode", "band:outer", control=True),
    Cable("Frame→estimate", "decode.Frame", "estimate.frame", path=P_FAST, dst_path=P_FAST),
    Cable("Frame→fallback", "decode.Frame", "fallback.frame", path=P_SAFE, dst_path=P_SAFE),
    Cable("Frame→identity", "decode.Frame", "identity.frame", path=P_ELSE, dst_path=P_ELSE),
    Cable("gain→estimate", "in:gain", "estimate.gain", path=P_FAST, dst_path=P_FAST),
    Cable("gain→inner band", "in:gain", "band:inner", path=P_SAFE, control=True),
    Cable("fallback→refine", "fallback.Pose", "refine.pose", path=P_SAFE_IF, src_path=P_SAFE, dst_path=P_SAFE_IF),
    Cable("refine→encode", "refine.Pose", "encode.pose", path=P_SAFE_IF, src_path=P_SAFE_IF),
    Cable("fallback⇢encode (pass-through)", "fallback.Pose", "encode.pose", path=P_SAFE_UNCH, src_path=P_SAFE_UNCH),
    Cable("estimate→encode", "estimate.Pose", "encode.pose", path=P_FAST, src_path=P_FAST),
    Cable("identity→encode", "identity.Pose", "encode.pose", path=P_ELSE, src_path=P_ELSE),
    Cable("encode→payload", "encode.bytes", "out:payload"),
]
# the pass-through's *source* is fallback, which sits in safe; its arm identity is safe/unchanged.
# src_path carries the arm the value is credited to, which is what phi-resolution needs.


def draw_fixture_a(selection: dict, style, marks=None, w=1380, h=730, merge_node=False) -> str:
    svg = SVG(w, h)
    frame(svg, 20, 20, 1340, 690, "run()")
    ports = {}
    ports["in:raws"] = boundary_in(svg, 20, 175, "raws", "bytes")
    ports["in:gain"] = boundary_in(svg, 20, 330, "gain", "float", NUMBER)
    ports["in:mode"] = boundary_in(svg, 20, 540, "mode", "str", "#4caf50")
    ports["out:payload"] = boundary_out(svg, 1360, 451, "payload", "bytes")

    def arm_op(path):
        return DIM if any(chosen and dict(path).get(r) not in (None, chosen) for r, chosen in selection.items()) else 1.0

    reg = branch_region(svg, 430, 120, 530, [("fast", 'if mode == "fast":', 130, False), ("safe", 'elif mode == "safe":', 236, False), ("else", "else:", 92, False)],
                        headers=["mode"], arm_opacity={"fast": arm_op(P_FAST), "safe": arm_op(P_SAFE), "else": arm_op(P_ELSE)})
    ports["band:outer"] = reg["band:mode"]
    inner = branch_region(svg, 657, 336, 245, [("if", "if gain > 1.0:", 96, False), ("unchanged", "(unchanged)", 40, True)], headers=["gain"], nested=True,
                          arm_opacity={"if": arm_op(P_SAFE_IF), "unchanged": arm_op(P_SAFE_UNCH)})
    ports["band:inner"] = inner["band:gain"]
    lane_y = inner["arms"]["unchanged"][1] + 20

    def blk(key, x, y, w_, title, ins, outs, path):
        p = block(svg, x, y, w_, title, ins, outs, opacity=arm_op(path))
        for n, pos in p["in"].items():
            ports[f"{key}.{n}"] = pos
        for n, pos in p["out"].items():
            ports[f"{key}.{n}"] = pos

    blk("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}], ())
    blk("estimate", 540, 188, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}], P_FAST)
    blk("fallback", 470, 354, 170, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}], P_SAFE)
    blk("refine", 697, 402, 170, "refine()", [{"name": "pose", "type": "Pose"}], [{"name": "Pose"}], P_SAFE_IF)
    blk("identity", 540, 612, 190, "identity()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}], P_ELSE)
    blk("encode", 1060, 400, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}], ())

    mids = {"raws→decode": None, "Frame→estimate": 400, "Frame→fallback": 400, "Frame→identity": 400, "gain→estimate": 380, "gain→inner band": 380,
            "fallback→refine": 660, "refine→encode": 995, "estimate→encode": 975, "identity→encode": 1035, "encode→payload": 1310, "mode→band": 395}
    merge_in = {}
    if merge_node:
        m = block(svg, 968, 372, 82, "Merge", [{"name": "fast"}, {"name": "if"}, {"name": "unch"}, {"name": "else"}], [{"name": ""}])
        merge_in = {"estimate→encode": m["in"]["fast"], "refine→encode": m["in"]["if"], "fallback⇢encode (pass-through)": m["in"]["unch"], "identity→encode": m["in"]["else"]}
        mids.update({"estimate→encode": 940, "refine→encode": 930, "identity→encode": 950})
        svg.add(cable(m["out"][""], ports["encode.pose"], mid=1054))
        note(svg, 1009, 562, "Merge: one node per contested port", size=10, anchor="middle")
    for c in CABLES_A:
        st = style(c, selection, CABLES_A)
        src, dst = ports[c.src], merge_in.get(c.key, ports[c.dst])
        if c.key.startswith("fallback⇢"):
            pts = [src, (src[0] + 12, src[1]), (src[0] + 12, lane_y), (945 if merge_node else 1015, lane_y), (945 if merge_node else 1015, dst[1]), dst]
            svg.add(polycable(pts, color=st.get("color", CABLE), width=st.get("width", 1.6), opacity=st["opacity"], dashed=st.get("dashed", False)))
        else:
            svg.add(cable(src, dst, kind="control" if c.control else "data", mid=mids.get(c.key), color=st.get("color"), width=st.get("width"), opacity=st["opacity"]))
    if marks:
        marks(svg, ports, selection, CABLES_A, {"outer": reg, "inner": inner, "lane_y": lane_y})
    return svg.render("fixture A")


# --------------------------------------------------------------------------
# Fixture B — the L1 loop with the zero-iterations cable
# --------------------------------------------------------------------------

REGIONS_B = {"loop": Region("loop", "loop", ("body",), "skip")}
P_BODY = (("loop", "body"),)
P_SKIP = (("loop", "skip"),)

CABLES_B = [
    Cable("raws→decode", "in:raws", "decode.raw"),
    Cable("others→band", "in:others", "band:loop", control=True),
    Cable("Frame→estimate", "decode.Frame", "estimate.frame"),
    Cable("gain→estimate", "in:gain", "estimate.gain"),
    Cable("seed: estimate→merge", "estimate.Pose", "merge.pose", dst_path=P_BODY),
    Cable("item→merge", "item:loop", "merge.other", path=P_BODY, src_path=P_BODY, dst_path=P_BODY),
    Cable("back: merge⟲merge", "merge.Pose", "merge.pose", path=P_BODY, src_path=P_BODY, dst_path=P_BODY),
    Cable("last: merge→encode", "merge.Pose", "encode.pose", path=P_BODY, src_path=P_BODY),
    Cable("zero iterations: estimate⇢encode", "estimate.Pose", "encode.pose", path=P_SKIP, src_path=P_SKIP),
    Cable("encode→payload", "encode.bytes", "out:payload"),
]


def draw_fixture_b(selection: dict, style, marks=None, w=1380, h=600, merge_node=False) -> str:
    svg = SVG(w, h)
    frame(svg, 20, 20, 1340, 560, "run()")
    ports = {}
    ports["in:raws"] = boundary_in(svg, 20, 175, "raws", "bytes")
    ports["in:gain"] = boundary_in(svg, 20, 310, "gain", "float", NUMBER)
    ports["in:others"] = boundary_in(svg, 20, 450, "others", "Poses")
    ports["out:payload"] = boundary_out(svg, 1360, 341, "payload", "bytes")
    chosen = selection.get("loop")
    body_op = DIM if chosen == "skip" else 1.0
    reg = loop_region(svg, 700, 130, 400, 330, "for other in others:", header="others", item="other", arm_opacity=body_op)
    ports["band:loop"] = reg["band"]
    ports["item:loop"] = reg["item"]

    def blk(key, x, y, w_, title, ins, outs, op=1.0):
        p = block(svg, x, y, w_, title, ins, outs, opacity=op)
        for n, pos in p["in"].items():
            ports[f"{key}.{n}"] = pos
        for n, pos in p["out"].items():
            ports[f"{key}.{n}"] = pos

    blk("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
    blk("estimate", 430, 240, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])
    blk("merge", 760, 220, 220, "merge()", [{"name": "pose", "type": "Pose"}, {"name": "other", "type": "Pose"}], [{"name": "Pose"}], body_op)
    blk("encode", 1220 if merge_node else 1140, 290, 130 if merge_node else 170, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])
    lane_y = reg["bottom"] - 26
    svg.add(text(900, lane_y - 6, "next iteration", size=10.5, color=MUTED, italic=True, anchor="middle", opacity=body_op))
    svg.add(text(905, 514, "zero iterations", size=10.5, color=MUTED, italic=True, anchor="middle"))
    merge_in = {}
    if merge_node:
        m = block(svg, 1108, 300, 78, "Merge", [{"name": "last"}, {"name": "zero"}], [{"name": ""}])
        merge_in = {"last: merge→encode": m["in"]["last"], "zero iterations: estimate⇢encode": m["in"]["zero"]}
        svg.add(cable(m["out"][""], ports["encode.pose"], mid=1203))
        note(svg, 1147, 430, "a second Merge would sit before merge.pose", size=10, anchor="middle")
    for c in CABLES_B:
        st = style(c, selection, CABLES_B)
        src, dst = ports[c.src], merge_in.get(c.key, ports[c.dst])
        col, wd, op, dashed = st.get("color", CABLE), st.get("width", 1.6), st["opacity"], st.get("dashed", False)
        if c.key.startswith("back"):
            pts = [src, (1060, src[1]), (1060, lane_y), (730, lane_y), (730, dst[1]), dst]
            svg.add(polycable(pts, color=col, width=wd, opacity=op, dashed=dashed))
        elif c.key.startswith("zero"):
            if st.get("bypass_through"):
                pts = [src, (680, src[1]), (680, 330), (reg["x"], 330), (reg["right"], 330), (1115, 330), (1115, dst[1]), dst]
            else:
                xx = 1085 if merge_node else 1115
                pts = [src, (680, src[1]), (680, 520), (xx, 520), (xx, dst[1]), dst]
            svg.add(polycable(pts, color=col, width=wd, opacity=op, dashed=dashed))
        elif c.key.startswith("item"):
            svg.add(polycable([src, (src[0], dst[1]), dst], color=col, width=wd, opacity=op))
        elif c.key.startswith("seed"):
            svg.add(cable(src, dst, mid=680, color=col, width=wd, opacity=op))
        elif c.key.startswith("last"):
            svg.add(cable(src, dst, mid=1040 if merge_node else 1110, color=col, width=wd, opacity=op))
        elif c.key == "others→band":
            svg.add(cable(src, dst, kind="control", mid=660, opacity=op))
        else:
            svg.add(cable(src, dst, mid={"Frame→estimate": 400, "gain→estimate": 380, "encode→payload": 1355 if merge_node else 1335}.get(c.key), color=col, width=wd, opacity=op))
    if marks:
        marks(svg, ports, selection, CABLES_B, {"loop": reg, "lane_y": lane_y})
    return svg.render("fixture B")


# --------------------------------------------------------------------------
# Fixture C — Zach's "hackable" board: two producers, no region (must lint)
# --------------------------------------------------------------------------

REGIONS_C: dict = {}
CABLES_C = [
    Cable("pair.pose→estimateA.frame", "pair.pose", "estimateA.frame"),
    Cable("estimateA.Pose→estimateB.frame", "estimateA.Pose", "estimateB.frame"),
    Cable("pair.quality→estimateB.frame", "pair.quality", "estimateB.frame"),
]


def draw_fixture_c(marks=None, w=1380, h=420) -> str:
    svg = SVG(w, h)
    ports = {}

    def blk(key, x, y, w_, title, ins, outs):
        p = block(svg, x, y, w_, title, ins, outs)
        for n, pos in p["in"].items():
            ports[f"{key}.{n}"] = pos
        for n, pos in p["out"].items():
            ports[f"{key}.{n}"] = pos

    blk("pair", 80, 150, 280, "estimate_pair()", [{"name": "frame", "type": "Frame", "connected": False}, {"name": "gain", "type": "Float", "color": NUMBER, "connected": False}], [{"name": "pose"}, {"name": "quality", "color": NUMBER}])
    blk("estimateA", 560, 60, 300, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER, "connected": False}], [{"name": "Pose"}])
    blk("estimateB", 1000, 210, 300, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER, "connected": False}], [{"name": "Pose", "connected": False}])
    svg.add(cable(ports["pair.pose"], ports["estimateA.frame"], mid=470))
    svg.add(cable(ports["estimateA.Pose"], ports["estimateB.frame"], mid=930))
    svg.add(cable(ports["pair.quality"], ports["estimateB.frame"], mid=900))
    if marks:
        marks(svg, ports, {}, CABLES_C, {})
    return svg.render("fixture C")


# --------------------------------------------------------------------------
# Variant styles and marks
# --------------------------------------------------------------------------


def contested_ports(cables):
    counts: dict[str, int] = {}
    for c in cables:
        if not c.control:
            counts[c.dst] = counts.get(c.dst, 0) + 1
    return {p for p, n in counts.items() if n > 1}


def style_v1(c, sel, cables):
    return {"opacity": opacity(c, sel, cables, DIM)}


def style_v2(c, sel, cables):
    op = opacity(c, sel, cables, DIM)
    if op == 1.0 and not c.control and c.dst in contested_ports(cables) and any(v for v in sel.values()):
        return {"opacity": 1.0, "color": ACCENT, "width": 2.4}
    return {"opacity": op}


def style_v3(c, sel, cables):
    op = opacity(c, sel, cables, DIM)
    if c.key.startswith("zero") or c.key.startswith("fallback⇢"):
        implicit_chosen = sel.get("loop") == "skip" or sel.get("inner") == "unchanged"
        if implicit_chosen:
            return {"opacity": 1.0, "color": BYPASS, "width": 2.2, "bypass_through": True}
    return {"opacity": op}


def style_v4(c, sel, cables):
    return {"opacity": opacity(c, sel, cables, DIM)}


def style_v5(c, sel, cables):
    return {"opacity": 1.0}


def badge(svg, x, y, n, warn=False):
    col = WARN if warn else MUTED
    svg.add(f'<circle cx="{x}" cy="{y}" r="8" fill="#fff" stroke="{col}" stroke-width="1.4"/>')
    svg.add(text(x, y + 3.5, str(n), size=9.5, color=col, anchor="middle", weight=700))


def marks_v3(svg, ports, sel, cables, geo):
    if "loop" in geo and sel.get("loop") == "skip":
        reg = geo["loop"]
        note(svg, reg["x"] + 200, reg["y"] + 60, "bypassed: zero iterations, the seed passes straight through", size=10.5, anchor="middle")
    if "inner" in geo and sel.get("inner") == "unchanged":
        inner = geo["inner"]
        note(svg, inner["x"] + 8, inner["bottom"] - 2, "bypassed: (unchanged) passes fallback through", size=10)


def marks_v5(svg, ports, sel, cables, geo):
    regions = REGIONS_A if "outer" in geo else (REGIONS_B if "loop" in geo else REGIONS_C)
    rows = {r["port"]: r for r in lint(cables, regions)}
    for port, row in rows.items():
        x, y = ports[port]
        badge(svg, x - 16, y - 13, len(row["producers"]), warn=not row["ok"])
        if not row["ok"]:
            chip(svg, x - 250, y + 72, f"{len(row['producers'])} producers · no branch makes them exclusive", WARN)


def marks_v4_a(svg, ports, sel, cables, geo):
    pass


VARIANTS = [
    {"id": "v1", "name": "Transparency only", "style": style_v1, "marks": None,
     "thesis": "Zach's plan as an algorithm: choose an arm (or a loop's zero-iterations arm), and every cable the choice rules out drops to 18%. The pass-through reads at full opacity because it is the chosen arm, not because it was exempted.",
     "best": "The whiteboard reading he described: one live wire into every port, everything else present but quiet.",
     "loses": "With no arm chosen a many-to-one port stays ambiguous, and at small zoom a 100% wire beside 18% wires is the only cue.",
     "scores": {"c1": 4, "c2": 5, "c3": 5, "c4": 5, "c5": 5, "c6": 4}},
    {"id": "v2", "name": "Transparency + live-wire emphasis", "style": style_v2, "marks": None,
     "thesis": "V1, and the wire that won at a contested port is drawn heavier in the accent colour, LabVIEW's execution-highlighting idiom applied statically. The reader sees which of the many is live even when the faded ones are barely there.",
     "best": "Boards with several contested ports, small zoom, screenshots in a report.",
     "loses": "Adds a second mark for one fact; if the accent is also the selection colour, a selected cable and a live cable look the same.",
     "scores": {"c1": 5, "c2": 4, "c3": 5, "c4": 5, "c5": 4, "c6": 4}},
    {"id": "v3", "name": "Bypass drawn through", "style": style_v3, "marks": marks_v3,
     "thesis": "Blender's mute and Nuke's disable: when a region's implicit arm is chosen, the value is drawn passing straight through the region's body in the bypass colour, and everything inside dims. Zero iterations and 'branch not taken' read as one straight line.",
     "best": "Explaining a single skipped region to someone new; matches what every node editor does to a muted node.",
     "loses": "Draws a wire the code does not have, re-routes the pass-through cable per state, and does nothing for the common case where an explicit arm is chosen.",
     "scores": {"c1": 4, "c2": 2, "c3": 4, "c4": 3, "c5": 3, "c6": 3}},
    {"id": "v4", "name": "Explicit merge node", "style": style_v4, "marks": None,
     "thesis": "Simulink's answer, which Zach drew as a Switch block: a small merge node in front of every contested port, one input per producer, one output. The transparency rule still fades the inputs; the node just makes the join a thing you can point at.",
     "best": "When someone insists on seeing the join as a node, or wants to attach a comment or a default to it.",
     "loses": "A node the code does not have, one per contested port (two on the loop board alone), and the fade still has to do the real work.",
     "scores": {"c1": 4, "c2": 2, "c3": 3, "c4": 2, "c5": 3, "c6": 4}},
    {"id": "v5", "name": "Port-side disambiguation", "style": style_v5, "marks": marks_v5,
     "thesis": "No fade unless asked: a contested port carries a small count badge, and the badge turns red with a lint chip when nothing makes the producers exclusive. The inspector lists the producers with the region that makes them exclusive; hovering the badge previews V1's fade.",
     "best": "The neutral view, and the linter's home: Zach's two-estimate() board fails here and nowhere else.",
     "loses": "On its own the board does not show which wire is live; the badge is one more mark on the port row.",
     "scores": {"c1": 3, "c2": 5, "c3": 5, "c4": 4, "c5": 4, "c6": 4}},
]

CRITERIA = [
    ("c1", "Reads as a DAG at a glance", 25, "Under a chosen arm, exactly one wire into each port reads as live without a legend."),
    ("c2", "Says what the code says", 15, "No node or wire the source lacks; a pass-through is the name reaching its reader untouched."),
    ("c3", "Derivable from the binding table", 20, "Every mark, fade and lint comes from the arm paths the analyzer already has."),
    ("c4", "No new primitives", 15, "Cables, ports, regions, opacity. Badges and chips are cheap; nodes and through-wires are not."),
    ("c5", "Consistent with the branch and loop grammar", 15, "The 18% fade, the region as the switch, single plain ports, Expanded and Case views."),
    ("c6", "Cheap in stock tldraw", 10, "An opacity per cable computed from state is a style pass; a new shape kind is not."),
]


def weighted(scores):
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


for v in VARIANTS:
    v["total"] = weighted(v["scores"])

# --------------------------------------------------------------------------
# Prior art
# --------------------------------------------------------------------------

PRIOR = [
    ("Houdini bypass flag", "flag on the node", "\"Bypass disables the node, making it pass its input geometry through to the output unchanged\"; the flag lights yellow", "pass-through is implicit: the wire is unchanged, the node is marked", "inputs are single-producer by construction", "[1]"),
    ("TouchDesigner bypass flag", "flag on the node", "\"Regardless of how many inputs an operator has, the first input is passed through\"; a large red arrow over the viewer; bypassing a component bypasses everything inside", "pass-through by rule: first input wins", "single-producer inputs", "[2]"),
    ("Blender node mute (M)", "node state", "\"Muting a node removes its contribution to the node tree, and makes all links pass through it without change. Links will appear red as an indicator of passing through the muted node.\"; a muted link \"acts as though it's no longer there\"", "the through-link is DRAWN, in red — V3's idiom", "single-producer sockets", "[3]"),
    ("Nuke disable (D)", "node state", "\"disables the node's effect on the data stream\"; the node is crossed out; with A/B inputs \"the data stream keeps flowing because, by default, it uses the B input\"", "pass-through picks the B input; drawn as a crossed-out node", "single-producer inputs", "[4]"),
    ("Simulink comment through", "block state", "\"Comment Through excludes the selected block from simulation, and the signals are passed through. To comment through, a block must have the same number of input and output ports\"", "pass-through only when arity matches", "Merge: \"ensure that at most one of the driving conditionally executed subsystems executes at any time step\" — the rule Zach stated", "[5][8]"),
    ("LabVIEW Diagram Disable", "structure", "only the Enabled subdiagram executes; disabled subdiagrams are drawn but not compiled; tunnels default to Use Default If Unwired", "pass-through must be wired by hand through the enabled case", "tunnels, one value per case", "[9]"),
    ("LabVIEW execution highlighting", "debug mode", "\"shows the movement of data on the block diagram from one node to another using bubbles that move along the wires\"; \"greatly reduces the speed at which the VI runs\"", "the live path is shown by motion, at runtime", "—", "[6]"),
    ("Simulink signal highlighting", "command", "Highlight Signal to Source / to Destination: \"all branches of the signal anywhere in the model\", the virtual blocks it passes, the nonvirtual writers or readers; \"crosses subsystem and model reference boundaries\"; Ctrl+Shift+H clears", "the live path is a colour on a static board — V2's idiom", "—", "[7]"),
    ("Unreal Blueprint debugging", "PIE mode", "\"you should see the pulsating 'Active Wires' as your script executes\"; watches show pin values", "the live path is shown by animation, at runtime", "exec pins are one-in; data pins are one-producer", "[10]"),
    ("SSA φ", "IR", "\"each execution of a φ-function uses only one of the operands, but which one depends on the flow of control just before entering X\"", "a many-to-one port IS a φ; choosing an arm chooses the operand", "the operand count equals the number of predecessors", "[11]"),
]

SOURCES = [
    (1, "SideFX — Network editor: node flags (Bypass)", "https://www.sidefx.com/docs/houdini/network/flags.html"),
    (2, "Derivative — TouchDesigner Bypass Flag", "https://docs.derivative.ca/Bypass_Flag"),
    (3, "Blender Manual — Node editing: Mute, Mute Links", "https://docs.blender.org/manual/en/latest/interface/controls/nodes/editing.html"),
    (4, "Foundry — Nuke: Working with Nodes (Disable)", "https://learn.foundry.com/nuke/content/getting_started/using_interface/working_nodes.html"),
    (5, "MathWorks — Terminate Unconnected Block Outputs and Usage of Commenting Blocks (Comment Through)", "https://www.mathworks.com/help/hdlcoder/ug/guidelines-for-terminating-and-commenting-out-blocks.html"),
    (6, "NI — LabVIEW Debugging Techniques (Execution Highlighting, Probes)", "https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html"),
    (7, "MathWorks — Highlight Signal Sources and Destinations", "https://de.mathworks.com/help/simulink/ug/displaying-signal-sources-and-destinations.html"),
    (8, "MathWorks — Simulink Merge block", "https://www.mathworks.com/help/simulink/slref/merge.html"),
    (9, "NI LabVIEW Help — Disable Structures: Preventing Code from Executing (rajsite mirror)", "https://rajsite.github.io/unofficial-lvdocs/lvconcepts/Cond_Diagram_Disable.html"),
    (10, "Epic — Blueprint Debugging Example in Unreal Engine", "https://dev.epicgames.com/documentation/unreal-engine/blueprint-debugging-example-in-unreal-engine"),
    (11, "Cytron et al. (1991) — Efficiently Computing SSA Form and the Control Dependence Graph", "https://www.cs.utexas.edu/~pingali/CS380C/2010/papers/ssaCytron.pdf"),
]

# --------------------------------------------------------------------------
# Measured: the rule and the lint on the fixtures
# --------------------------------------------------------------------------

SEL_A = {"outer": "safe", "inner": "unchanged"}
SEL_A_IF = {"outer": "safe", "inner": "if"}
SEL_B_BODY = {"loop": "body"}
SEL_B_SKIP = {"loop": "skip"}


def fade_table(cables, selection):
    rows = []
    for c in cables:
        f, why = fades(c, selection, cables)
        rows.append((c.key, "fades" if f else "live", why))
    return rows


MEASURED = {
    "lintA": lint(CABLES_A, REGIONS_A),
    "lintB": lint(CABLES_B, REGIONS_B),
    "lintC": lint(CABLES_C, REGIONS_C),
    "liveA": live_counts(CABLES_A, SEL_A),
    "liveA_if": live_counts(CABLES_A, SEL_A_IF),
    "liveB_body": live_counts(CABLES_B, SEL_B_BODY),
    "liveB_skip": live_counts(CABLES_B, SEL_B_SKIP),
    "fadeA": fade_table(CABLES_A, SEL_A),
    "fadeB_body": fade_table(CABLES_B, SEL_B_BODY),
    "fadeB_skip": fade_table(CABLES_B, SEL_B_SKIP),
}

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
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg{display:block;width:100%;height:auto}figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.trio{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.trio figure{margin:0}
.variant{margin-top:34px;padding-top:8px;border-top:2px solid var(--ink)}.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--soft);padding:3px 10px;border-radius:999px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;max-width:1100px}.cols p{margin:6px 0}.k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:700}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:#eef4ff}
pre{background:#0f1420;color:#dfe6f2;padding:16px 18px;border-radius:12px;overflow:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}pre code{background:none;padding:0;color:inherit}
.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:900px;margin:14px 0}.callout.warn{border-color:var(--warn);background:#fff4ec}.callout.ok{border-color:var(--ok);background:#ecfaf1}
ul{max-width:900px}li{margin:5px 0}
.pick{display:flex;gap:8px;margin:10px 0 0}.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:900px;min-height:120px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.small{font-size:13px;color:var(--muted)}.srcs{font-size:13px;columns:2;column-gap:28px;max-width:1200px}.srcs li{break-inside:avoid}
.ok{color:var(--ok);font-weight:700}.bad{color:var(--warn);font-weight:700}
.insp{display:grid;grid-template-columns:1fr 300px;gap:14px}.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13px}.panel h5{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.panel .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)}.panel .row:last-child{border:0}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:900px){.facts,.cols,.decision,.trio,.insp{grid-template-columns:1fr}.srcs{columns:1}}
"""

JS = """
(function(){var key='many-to-one-2026-09-02';var state={};try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
function paint(){document.querySelectorAll('.pick').forEach(function(p){var id=p.dataset.id;p.querySelectorAll('button').forEach(function(b){b.classList.toggle('on',state[id]===b.dataset.v)})});
var lines=Object.keys(state).map(function(id){return state[id]+': '+id});var brief=document.getElementById('brief');if(brief){brief.value=(lines.length?lines.join('\\n'):'Pick: v1\\nBorrow from v5: the lint badge and the producers list\\nBorrow from v2: emphasis as a toggle\\nAvoid: v4\\nWhy: ')}}
document.querySelectorAll('.pick button').forEach(function(b){b.addEventListener('click',function(){var id=b.parentNode.dataset.id;state[id]=(state[id]===b.dataset.v)?undefined:b.dataset.v;if(!state[id])delete state[id];try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}paint()})});paint();})();
"""


def fig(svg, caption, cls=""):
    return f"<figure class='{cls}'>{svg}<figcaption>{caption}</figcaption></figure>"


def esc(s):
    return html.escape(str(s))


def lint_html(rows, title):
    body = "".join(
        f"<tr><td><code>{esc(r['port'])}</code></td><td>{esc(', '.join(r['producers']))}</td><td class='{'ok' if r['ok'] else 'bad'}'>{'exclusive' if r['ok'] else 'LINT'}</td><td class='small'>{'<br>'.join(esc(x) for x in r['reasons'])}</td></tr>"
        for r in rows
    ) or "<tr><td colspan='4' class='small'>no many-to-one ports</td></tr>"
    return f"<h3>{esc(title)}</h3><table><tr><th>port</th><th>producers</th><th>verdict</th><th>why</th></tr>{body}</table>"


def live_html(rows, title):
    body = "".join(f"<tr><td><code>{esc(r['port'])}</code></td><td>{esc(', '.join(r['live']) or '—')}</td><td class='{'ok' if r['state']=='one live' else ('small' if r.get('dormant') else 'bad')}'>{esc(r['state'])}</td></tr>" for r in rows)
    return f"<h3>{esc(title)}</h3><table><tr><th>port</th><th>live producer(s)</th><th>state</th></tr>{body}</table>"


def fade_html(rows, title):
    body = "".join(f"<tr><td>{esc(k)}</td><td class='{'bad' if s=='fades' else 'ok'}'>{s}</td><td class='small'>{esc(w)}</td></tr>" for k, s, w in rows)
    return f"<h3>{esc(title)}</h3><table><tr><th>cable</th><th>under the selection</th><th>clause</th></tr>{body}</table>"


def prior_html():
    rows = "".join(f"<tr><td><b>{esc(t)}</b></td><td>{esc(kind)}</td><td>{esc(what)}</td><td>{esc(pt)}</td><td>{esc(m2o)}</td><td class='small'>{cite}</td></tr>" for t, kind, what, pt, m2o, cite in PRIOR)
    return f"<table><tr><th>tool</th><th>where the state lives</th><th>what it says</th><th>how the pass-through / live path is shown</th><th>many-to-one rule</th><th></th></tr>{rows}</table>"


def sources_html():
    return "<ol class='srcs'>" + "".join(f"<li>{esc(t)} — <a href='{esc(u)}'>{esc(u)}</a></li>" for _, t, u in SOURCES) + "</ol>"


def scores_html():
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    for v in sorted(VARIANTS, key=lambda v: -v["total"]):
        cells = "".join(f"<td class='n'>{v['scores'][c[0]]}</td>" for c in CRITERIA)
        rows += f"<tr class='{'win' if v['id']=='v1' else ''}'><td><b>{v['id'].upper()}</b> {esc(v['name'])}</td>{cells}<td class='n'><b>{v['total']}</b></td></tr>"
    crit = "".join(f"<li><b>{c[0]} · {esc(c[1])}</b> ({c[2]}) — {esc(c[3])}</li>" for c in CRITERIA)
    return f"<ul>{crit}</ul><table><tr><th>variant</th>{head}<th class='n'>total</th></tr>{rows}</table>"


def variants_html():
    out = []
    for v in VARIANTS:
        st, mk = v["style"], v["marks"]
        opts = {"merge_node": v["id"] == "v4"}
        a = draw_fixture_a(SEL_A, st, mk, **opts)
        b = draw_fixture_b(SEL_B_SKIP, st, mk, **opts)
        extra = ""
        if v["id"] == "v5":
            c = draw_fixture_c(mk)
            panel = ("<div class='panel'><h5>encode.pose · 4 producers</h5>"
                     "<div class='row'><span>estimate()</span><span class='small'>arm fast</span></div>"
                     "<div class='row'><span>refine()</span><span class='small'>arm safe › if</span></div>"
                     "<div class='row'><span>fallback() pass-through</span><span class='small'>arm safe › (unchanged)</span></div>"
                     "<div class='row'><span>identity()</span><span class='small'>arm else</span></div>"
                     "<p class='small' style='margin:8px 0 0'>exclusive by Branch <b>outer</b> and Branch <b>inner</b>. Hover the badge to preview the active path.</p></div>")
            extra = f"<div class='insp'>{fig(c, '<b>Fixture C — no region.</b> Zach’s hackable board: two producers into estimate().frame with nothing making them exclusive. The badge goes red and the lint chip names the problem; the board still draws.')}{panel}</div>"
        scores = " · ".join(f"{c[0]} {v['scores'][c[0]]}" for c in CRITERIA)
        cap_a = "<b>Fixture A, safe › (unchanged) chosen.</b> The pass-through is the live wire into encode.pose; fast, else and refine fade."
        cap_b = "<b>Fixture B, zero iterations chosen.</b> The seed reaches encode untouched; the body and its back cable fade."
        if v["id"] == "v3":
            cap_b = "<b>Fixture B, zero iterations chosen.</b> The seed is drawn straight through the loop body in the bypass colour instead of under the region."
        if v["id"] == "v5":
            cap_a = "<b>Fixture A, neutral.</b> No fade; encode.pose carries a 4 badge because four producers are exclusive by construction."
            cap_b = "<b>Fixture B, neutral.</b> merge.pose and encode.pose carry a 2 badge: the loop's implicit zero-iterations arm makes each pair exclusive."
        out.append(
            f"<section class='variant' id='{v['id']}'><header><h3>{v['id'].upper()} · {esc(v['name'])}</h3><span class='score'>{v['total']}/100</span><span class='small'>{scores}</span></header>"
            f"<p>{esc(v['thesis'])}</p>{fig(a, cap_a)}{fig(b, cap_b)}{extra}"
            f"<div class='cols'><div><span class='k'>best when</span><p>{esc(v['best'])}</p></div><div><span class='k'>loses when</span><p>{esc(v['loses'])}</p></div></div>"
            f"<div class='pick' data-id='{v['id']}'><button data-v='Pick'>Pick</button><button data-v='Shortlist'>Shortlist</button><button data-v='Reject'>Reject</button></div></section>"
        )
    return "".join(out)


RULE_CODE = '''selection: region -> chosen arm | None      # "inactive loop" = its implicit arm "skip"
                                             # "inactive if-without-else" = its implicit arm "unchanged"
cable fades iff for some region R with chosen arm a:
  (i)   cable's arm path passes through R via an arm != a
  (ii)  cable's source or destination block sits inside an arm of R != a   (not for control cables)
  (iii) phi-resolution: another cable from inside (R, a) lands on the same port, and this one does not
port lint: for every pair of producers into one port, some region must make them exclusive:
  sibling arms of one region, or inside-vs-outside of a region that has an implicit arm
under a selection every port must have exactly one live producer, or a default'''


def build() -> str:
    a_strip = "".join([
        fig(draw_fixture_b({}, style_v1), "<b>neutral.</b> No arm chosen: everything full; merge.pose and encode.pose each show two wires."),
        fig(draw_fixture_b(SEL_B_BODY, style_v1), "<b>loop active (body).</b> The back cable wins merge.pose, the last value wins encode.pose; the seed and the zero-iterations cable fade."),
        fig(draw_fixture_b(SEL_B_SKIP, style_v1), "<b>zero iterations (implicit arm).</b> The seed wins both ports; everything inside the loop fades. Nothing was special-cased."),
    ])
    nest_strip = "".join([
        fig(draw_fixture_a(SEL_A_IF, style_v1), "<b>safe › if.</b> refine wins encode.pose; the pass-through fades along with fast and else."),
        fig(draw_fixture_a(SEL_A, style_v1), "<b>safe › (unchanged).</b> The pass-through wins; refine fades. Same rule, the inner region's implicit arm."),
        fig(draw_fixture_a({"outer": "safe"}, style_v1), "<b>safe, inner neutral.</b> Two live wires into encode.pose: the inner join is unresolved and the board says so."),
    ])
    lintA_ok = all(r["ok"] for r in MEASURED["lintA"])
    lintB_ok = all(r["ok"] for r in MEASURED["lintB"])
    lintC_ok = all(r["ok"] for r in MEASURED["lintC"])
    liveA_one = sum(1 for r in MEASURED["liveA"] if r["state"] == "one live")
    liveA_awake = sum(1 for r in MEASURED["liveA"] if not r.get("dormant"))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Many-to-one — the pass-through case, five ways</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · pyblocks · pass-through · {GIT_HEAD} · 2026-09-02</div>
<h1>A many-to-one port is a φ. Choosing an arm reads it.</h1>
<p class="lede">You asked how to show the pass-through and the zero-iteration case, and answered yourself: wire many-to-one directly, keep the region self-contained, and show the switch with transparency — "if you have an active branch, see the ports at which things inside of it terminate, then make all the other wires into that port transparent." Written out, that is φ-resolution under a chosen arm. It needs no state a region does not already have, it composes with nesting and with loops, and the same table that computes the fade computes the lint you want. Five boards below; V1 is your plan and it wins, with V5's badge and lint as the splice.</p>
<div class="facts">
<div class="fact"><b>3 clauses</b><span>the whole rule: not-the-chosen-arm, an end inside a non-chosen arm, φ-resolution at the port</span></div>
<div class="fact"><b>{'pass' if lintA_ok else 'LINT'} · {'pass' if lintB_ok else 'LINT'} · {'LINT' if not lintC_ok else 'pass'}</b><span>the lint on fixtures A (nested branch), B (loop), C (your two-estimate() board)</span></div>
<div class="fact"><b>{liveA_one} of {liveA_awake}</b><span>awake ports with exactly one live producer on fixture A under safe › (unchanged); the other {len(MEASURED['liveA']) - liveA_awake} ports sit on blocks that do not run</span></div>
<div class="fact"><b>0 new primitives</b><span>in V1: cables, ports, regions and an opacity token the branch prototype already has</span></div>
</div>

<h2>1 · Your thinking, sharpened</h2>
<p><b>Your transparency rule is φ-resolution under a chosen arm, and it is already computable.</b> The name after a region is a φ with one operand per arm; Cytron's definition is that "each execution of a φ-function uses only one of the operands" [11]. Choosing an arm chooses the operand. Your algorithm — from the active arm, find the ports its wires reach, fade every other wire into those ports — is exactly that, and the binding table the analyzer keeps (<code>docs/branch_arm_binding.py</code>) already knows which arm every producer sits in. The three clauses below are the whole rule; <code>docs/many_to_one_rule.py</code> is 90 lines and runs on the fixtures at build time.</p>
<pre><code>{esc(RULE_CODE)}</code></pre>
<p><b>"If the branch is inactive, don't touch the other wires" is half the rule, and the other half is what makes the pass-through free.</b> Inactive is not a fourth state: a loop that does not run has chosen its implicit <i>zero-iterations</i> arm, an <code>if</code> without <code>else</code> that does not fire has chosen its implicit <i>(unchanged)</i> arm, and a region with an explicit <code>else</code> has no inactive state because one arm always runs. Choosing the implicit arm fades everything inside the region by clause (ii) — the body's wires "do not fire" — and leaves the pass-through at full opacity by construction, with no special case. The strip below is the loop under all three states with one rule.</p>
<div class="trio">{a_strip}</div>
<p><b>It composes with nesting.</b> A choice is a path of arms. With <i>safe</i> chosen outside and <i>(unchanged)</i> chosen inside, refine's wire fades and the pass-through wins encode.pose; with <i>if</i> chosen inside, the reverse; with the inner region neutral, two wires stay live and the board honestly says the inner join is unresolved.</p>
<div class="trio">{nest_strip}</div>
<p><b>The DAG rule you stated is the linter, and it is derivable.</b> "Only one active wire into a port at a time, and every port needs an active wire or a default" is two checks. The static one: two producers into one port are legal only when some region makes them exclusive — sibling arms of one region, or an inside-vs-outside pair of a region that has an implicit arm (the loop's seed against its back cable, its last value against its zero-iterations seed, a pass-through against the arm it skips). Two producers outside every region are never exclusive: that is your two-estimate() board, and it lints. The dynamic one, under a selection: exactly one live producer per port. Both run on the binding table; nothing is authored.</p>
{lint_html(MEASURED['lintC'], 'Fixture C — your hackable board: lint')}
{lint_html(MEASURED['lintA'], 'Fixture A — the nested branch: every pair exclusive')}
{lint_html(MEASURED['lintB'], 'Fixture B — the loop: the implicit arm makes both pairs exclusive')}
{live_html(MEASURED['liveA'], 'Fixture A under safe › (unchanged): one live producer per port')}
{live_html(MEASURED['liveB_skip'], 'Fixture B under zero iterations')}
{fade_html(MEASURED['fadeB_body'], 'Fixture B under loop active: which clause fades what')}
<p><b>"There is really no switch block" is right for control flow, and the block still exists for data.</b> When the choice is control flow, the region is the switch and the port is the φ. When the choice is a value — <code>pose = a if fast else b</code> — the select is an ordinary call, the V4 select block from the branch babble, and it is what someone reaches for who wants Simulink's Switch. Simulink itself keeps both: the Switch block computes both inputs and picks one, while the Merge block after conditionally executed subsystems demands that "at most one of the driving conditionally executed subsystems executes at any time step" [8]. That second sentence is your DAG rule.</p>
<p><b>Not showing reassignment is consistent with all of this.</b> <code>pose</code> written in three arms and read once is one port with three wires; the name is the join, the fan-in is its drawing, and the fade is how it is read. The prior art agrees with you on the direction, by the way: every node editor that mutes or bypasses a node keeps the wire and changes its presentation — Blender draws the through-link red [3], Nuke crosses the node out [4], Houdini lights a flag [1] — and every debugger that shows the live path does it by colour, weight or motion over the same static board [6][7][10]. None of them adds a node.</p>

<h2>2 · Prior art: bypass, and showing the live path</h2>
{prior_html()}

<h2>3 · Criteria, then five boards</h2>
{scores_html()}
<div class="callout"><b>Recommendation: V1, with V5's badge and lint, and V2's emphasis as a toggle.</b> V1 is your plan and needs nothing the branch prototype does not already have; the 18% fade and the per-region choice are the same state as make-active. V5 adds what V1 cannot say on its own: how many wires a port takes, and whether that is legal — and it is where the linter lives. V2's accent is worth having behind a toggle for screenshots and small zoom, and it is the same idiom Simulink and LabVIEW use for a live signal. <b>Default if you say nothing:</b> V1's three clauses as written, badge and lint on contested ports, no emphasis. <b>Hinge:</b> if the live wire must be legible at small zoom without hovering, V2 becomes the default; if you ever want the join to carry a default value, V4's node is the one place to hang it.</div>
{variants_html()}

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>The rule as three clauses, run on three fixtures at build time: {liveA_one}/{liveA_awake} awake ports have exactly one live producer under the pass-through choice; the lint passes A and B and fails C.</li><li>Five boards on two fixtures, plus the three-state strips.</li><li>Bypass and live-path prior art from primary sources, ten rows.</li></ul></div>
<div><h4>Left</h4><ul><li><b>Next:</b> the implementation fork adopts clause (i)–(iii) as the cable style pass (opacity from region state) and the lint as a port diagnostic. The rule is written for it; nothing in the worktree was touched.</li><li><b>Next:</b> golden 11 (receiver mutation) is the one many-to-one the lint does not cover: two writes to one object are not producers of one port.</li></ul></div>
<div><h4>Needs you</h4><ul><li><b>Pick a variant.</b> Recommendation V1 + V5; default if silent: as above.</li><li><b>Is the neutral state allowed to show two live wires</b> (inner join unresolved), or should choosing an outer arm imply its first inner arm? Default if silent: allowed, it is honest.</li><li><b>Emphasis toggle on or off by default?</b> Default if silent: off.</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No code in the worktree or the analyzer; boards are SVG in the idiom.</li><li>No interaction here (no hover preview): the rule is the deliverable, and the branch prototype already shows the fade live.</li></ul></div>
</div>
<h3>Reply cheaply</h3><p class="small">Pick buttons persist in this browser. Or: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p><textarea id="brief"></textarea>
<h2>Source index</h2>{sources_html()}
<footer>Built by <code>docs/build_many_to_one.py</code> at {GIT_HEAD} · the rule and the lint are computed by <code>docs/many_to_one_rule.py</code> at build time · boards are SVG in the SystemSketch idiom, not live shapes · Claude Code (Fable 5.1), 2026-09-02.</footer>
</main><script>{JS}</script></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({k: v for k, v in MEASURED.items() if k.startswith("lint")}, indent=1)[:2000])


if __name__ == "__main__":
    main()
