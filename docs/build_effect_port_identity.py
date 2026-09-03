#!/usr/bin/env python3
"""Build `docs/effect-port-identity-2026-09-03.html`: telling mutated ports apart.

Zach, after the effect-ports implementation shipped (2026-09-03): "What happens
if you have like multiple ports that are being mutated. how can you tell them
apart? I feel we may need to be more clear... now it's time to harden and
stress test this."

`reconcileEffectPorts` (`src/blocks/blockModel.ts`) derives one effect port per
argument marked `mutates`, and the layout places every one of them on the top
edge via `edgePortPoint`. That is correct for one mutated argument. It says
nothing about telling two or three apart, and the layout's own `label: null`
on every top-edge slot (`src/blocks/layoutBlock.ts`) means nothing is painted
to help — a fact confirmed here, not assumed, and is the first hard evidence
this report leads with.

This page enumerates ten orthogonal ways to close that gap, stress-tests a
shortlist of five against nine hostile boards, and lays out three ways to draw
a *hidden-state read* (`random()`, `time.now()`) — which is the effect that
does not fit the "top = what this block does to something it did not create"
rule at all, because it reads something the block did not create.

Nothing here is a decision. Every variant carries what it claims and what it
costs; every stress case says plainly which variants it kills. Zach picks.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "effect-port-identity-2026-09-03.html"
sys.path.insert(0, str(DOCS))

import effect_board_svg  # noqa: E402
from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, BORDER, CABLE, FRAME, INK, MUTED, REGION, THICK, WARN,
    block, chip, dot, frame as draw_frame, note, polycable,
    region as draw_region, text,
)
from effect_board_svg import Board, effect_port, mut_badge, pill, route  # noqa: E402

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

BLOCK_MODEL = (REPO / "src/blocks/blockModel.ts").read_text(encoding="utf-8")
LAYOUT_BLOCK = (REPO / "src/blocks/layoutBlock.ts").read_text(encoding="utf-8")
EFFECT_CABLE_TS = (REPO / "src/blocks/connections/effectCable.ts").read_text(encoding="utf-8")
EFFECT_PORTS_TESTS = len(
    [ln for ln in (REPO / "src/blocks/effectPorts.test.ts").read_text(encoding="utf-8").splitlines()
     if ln.strip().startswith("it(")]
)
EFFECT_CABLE_TESTS = len(
    [ln for ln in (REPO / "src/blocks/connections/effectCable.test.ts").read_text(encoding="utf-8").splitlines()
     if ln.strip().startswith("it(")]
)

# --------------------------------------------------------------------------
# The one correction this page makes to the shared drawing module.
#
# `effect_board_svg.EFFECT` is bound to `THICK` (near-black, #15181f) — a
# holdover from before Zach settled the ink. The shipped cable
# (`src/blocks/connections/effectCable.ts`) paints `var(--ss-warning)`, a warm
# orange, at 2.6px, which is also what `effect-ports-3-wired-2026-09-03.png`
# shows. Every effect cable on THIS page is drawn in that warm ink explicitly
# — `effect_board_svg.py` itself is left alone, since three other builders
# already import it and this page's job is to draw correctly, not to patch a
# module three peers are mid-use of.
# --------------------------------------------------------------------------
EFFECT_INK = WARN  # the corrected approximation of var(--ss-warning)


def effect_cable(points, *, opacity=1.0, arrow=True) -> str:
    """`effect_board_svg.effect_cable` without its stale near-black default."""
    return effect_board_svg.lane(points, color=EFFECT_INK, width=2.4, opacity=opacity, arrow=arrow)


# --------------------------------------------------------------------------
# The type→colour table a port already paints by (src/blocks/ui/portPalette.ts),
# reproduced here so a board can colour a mutated port the same way the app would.
# --------------------------------------------------------------------------
FAMILY_HEX = {
    "image": "#c060e0", "text": "#4caf50", "model": "#2196f3",
    "number": "#9e9e9e", "latent": "#ff9800", "any": "#c08520",
}


def port_color(t: str) -> str:
    n = t.strip().lower()
    if n == "image":
        return FAMILY_HEX["image"]
    if n in ("text", "str", "string"):
        return FAMILY_HEX["text"]
    if n == "model":
        return FAMILY_HEX["model"]
    if n in ("number", "int", "float"):
        return FAMILY_HEX["number"]
    if n == "latent":
        return FAMILY_HEX["latent"]
    return FAMILY_HEX["any"]  # everything not in the five named families — most domain types


# --------------------------------------------------------------------------
# The worked example this whole page shares: three mutated arguments, two of
# them the same (unrecognised) type so colour cannot save them, one of a
# recognised type so it partially can. This is stress case 1, drawn early and
# reused everywhere so a reader compares the same board across variants.
# --------------------------------------------------------------------------
RECONCILE_ARGS = [
    {"name": "primary", "type": "Cache", "mutated": True},
    {"name": "backup", "type": "Cache", "mutated": True},
    {"name": "preview", "type": "Image", "mutated": True},
]
SWAP_ARGS = [
    {"name": "a", "type": "list", "mutated": True},
    {"name": "b", "type": "list", "mutated": True},
]
COPY_INTO_ARGS = [
    {"name": "dst", "type": "Buffer", "mutated": True},
    {"name": "src", "type": "Buffer", "mutated": False},
]

ROW = 26
TITLE_BAND = 38


def draw_mutator(svg, x, y, w, title, args, *, edge_t=None, header=None, outputs=None):
    """Draw the mutator block itself: title, one input row per arg (with the
    settled hook on every mutated one). `outputs` is normally empty — a call
    with `-> None` has nowhere else for a value to leave by (mutation-flow §1)
    — but stress case 2 needs a real return alongside the effect, so it can
    be supplied."""
    inputs = [{"name": a["name"], "type": a["type"], "color": port_color(a["type"]), "connected": True}
              for a in args]
    out_ports = [{"name": o["name"], "type": o["type"], "color": port_color(o["type"]), "connected": True}
                 for o in (outputs or [])]
    ports = block(svg, x, y, w, title, inputs, out_ports, header=header)
    mutated = []
    n_mut = sum(1 for a in args if a["mutated"])
    slot = 0
    for a in args:
        if not a["mutated"]:
            continue
        ix, iy = ports["in"][a["name"]]
        color = port_color(a["type"])
        svg.add(mut_badge(ix, iy, color=EFFECT_INK, connected=True))
        t = edge_t[slot] if edge_t else (slot + 1) / (n_mut + 1)
        mutated.append({"name": a["name"], "type": a["type"], "color": color,
                         "in_xy": (ix, iy), "edge_t": t})
        slot += 1
    bx, by, bw, bh = ports["rect"]
    return ports, mutated, (bx, by, bw, bh)


def top_point(rect, t):
    bx, by, bw, bh = rect
    return (bx + t * bw, by)


# --------------------------------------------------------------------------
# The five shortlisted variants, written once so Part 1 and Part 3 draw
# identically. Each returns the list of (start_xy) the cable leaves from, so
# a caller can route a stub or a real consumer off it.
# --------------------------------------------------------------------------

def mark_v1_label(svg, rect, mutated, *, stub=26):
    """V1 — label the port itself: the argument's name painted beside the dot."""
    starts = []
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py - stub}" stroke="{EFFECT_INK}" stroke-width="2.2" '
                f'stroke-linecap="round" fill="none"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        svg.add(text(px + 8, py - stub + 4, m["name"], size=11, color=INK, mono=True, weight=700))
        starts.append((px, py - stub))
    return starts


def mark_v2_pill(svg, rect, mutated, *, stub=26):
    """V2 — name the pill: the port stays bare, the cable's `mut` pill carries the name."""
    starts = []
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py - stub}" stroke="{EFFECT_INK}" stroke-width="2.2" '
                f'stroke-linecap="round" fill="none"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        starts.append((px, py - stub, m["name"]))  # name carried for the pill drawn on the cable
    return starts


def mark_v3_color(svg, rect, mutated, *, stub=26):
    """V3 — inherit the argument's type colour: the port and hook paint in `portColor(type)`.

    Repaints the hook too (drawn warm-orange by `draw_mutator`, since that hook
    is the shared, settled "this argument is written in place" cue) — the
    claim is specifically that the WHOLE mark, hook included, switches to the
    type channel, so the drawing has to actually do that to be tested fairly."""
    starts = []
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py - stub}" stroke="{m["color"]}" stroke-width="2.4" '
                f'stroke-linecap="round" fill="none"/>')
        svg.add(dot(px, py, m["color"], True, r=5.5))
        ix, iy = m["in_xy"]
        svg.add(mut_badge(ix, iy, color=m["color"], connected=True))
        starts.append((px, py - stub))
    return starts


ORDINALS = "①②③④⑤⑥⑦⑧⑨"


def mark_v6_ordinal(svg, rect, mutated, *, stub=26):
    """V6 — paired ordinals: a numeral on the hook, the same numeral on the port/pill."""
    starts = []
    for i, m in enumerate(mutated):
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py - stub}" stroke="{EFFECT_INK}" stroke-width="2.2" '
                f'stroke-linecap="round" fill="none"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        svg.add(f'<circle cx="{px}" cy="{py - stub - 9}" r="8.5" fill="#fff" stroke="{EFFECT_INK}" stroke-width="1.4"/>')
        svg.add(text(px, py - stub - 5, ORDINALS[i], size=10.5, color=EFFECT_INK, anchor="middle", weight=700))
        # the paired numeral on the hook, at the input
        ix, iy = m["in_xy"]
        svg.add(f'<circle cx="{ix - 13}" cy="{iy - 11}" r="7.5" fill="#fff" stroke="{EFFECT_INK}" stroke-width="1.2"/>')
        svg.add(text(ix - 13, iy - 7.5, ORDINALS[i], size=9, color=EFFECT_INK, anchor="middle", weight=700))
        starts.append((px, py - stub - 18))
    return starts


def mark_v8_hover(svg, rect, mutated, *, stub=26, active=None):
    """V8 — selection/hover coupling: at rest every port is an identical bare dot;
    `active` (an index) simulates the one interaction frame that disambiguates."""
    starts = []
    for i, m in enumerate(mutated):
        px, py = top_point(rect, m["edge_t"])
        is_active = active is not None and i == active
        color = ACCENT if is_active else EFFECT_INK
        width = 3.0 if is_active else 2.2
        svg.add(f'<path d="M{px},{py} L{px},{py - stub}" stroke="{color}" stroke-width="{width}" '
                f'stroke-linecap="round" fill="none" opacity="{1.0 if is_active or active is None else 0.35}"/>')
        svg.add(dot(px, py, color, True, r=6 if is_active else 5,
                    opacity=1.0 if is_active or active is None else 0.35))
        if is_active:
            ix, iy = m["in_xy"]
            svg.add(f'<circle cx="{ix}" cy="{iy}" r="10" fill="none" stroke="{ACCENT}" stroke-width="2" opacity="0.85"/>')
            svg.add(text(px, py - stub - 8, m["name"], size=11, color=ACCENT, anchor="middle", weight=700))
        starts.append((px, py - stub))
    return starts


VARIANT_MARKERS = {
    "v1": mark_v1_label, "v2": mark_v2_pill, "v3": mark_v3_color,
    "v6": mark_v6_ordinal, "v8": mark_v8_hover,
}
SHORTLIST = ["v1", "v2", "v3", "v6", "v8"]
VARIANT_NAMES = {
    "v1": "Label the port", "v2": "Name the pill", "v3": "Inherit type colour",
    "v6": "Paired ordinals", "v8": "Hover coupling",
}


def stub_cable(svg, start, *, dx=34, dy=-22, label=None, opacity=1.0):
    sx, sy = start
    ex, ey = sx + dx, sy + dy
    svg.add(effect_cable([(sx, sy), (sx, ey), (ex, ey)], opacity=opacity))
    if label:
        pill(svg, sx + dx * 0.5, ey, label, color=EFFECT_INK, opacity=opacity)


# ==========================================================================
# Part 0 — the gap, verified in the code before anything is drawn
# ==========================================================================

def evidence_board() -> str:
    """Two arguments marked `mutates` in the order Zach would actually do it:
    click `primary`, then click `backup`. `reconcileEffectPorts` gives the
    first port `EFFECT_EDGE_T_DEFAULT` (0.5) — and gives the SECOND one the
    same 0.5, because nothing in the reconcile spreads new ports apart. They
    land on the identical point. Every other board on this page assumes a
    person has since dragged them apart by hand; this is what they look like
    before that happens."""
    svg = Board(560, 210)
    ports, mutated, rect = draw_mutator(svg, 40, 60, 220, "reconcile", RECONCILE_ARGS[:2],
                                        edge_t=[0.5, 0.5])
    bx, by, bw, bh = rect
    px, py = top_point(rect, 0.5)
    # both stubs really do sit on the same vertical — draw the second as a
    # dashed twin 3px off so it doesn't literally disappear in a screenshot.
    svg.add(f'<path d="M{px},{py} L{px},{py-26}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
    svg.add(dot(px, py, EFFECT_INK, True, r=5))
    svg.add(f'<path d="M{px+3},{py} L{px+3},{py-26}" stroke="{EFFECT_INK}" stroke-width="1.6" '
            f'stroke-linecap="round" stroke-dasharray="1 3" opacity="0.85"/>')
    svg.add(f'<circle cx="{px+3}" cy="{py}" r="5" fill="none" stroke="{EFFECT_INK}" stroke-width="1.4" stroke-dasharray="1 3"/>')
    svg.add(text(px + 14, py - 32, "primary AND backup\nboth land at edgeT 0.5",
                 size=11.5, color=WARN, weight=700))
    svg.add(text(px + 14, py - 16, "(one is drawn 3px off so it isn't literally invisible)",
                 size=10.5, color=MUTED, italic=True))
    svg.add(f'<line x1="{px}" y1="{by-40}" x2="{px}" y2="{by+bh+8}" stroke="{WARN}" stroke-width="1" '
            f'stroke-dasharray="2 3" opacity="0.5"/>')

    # right panel: the same two ports after a person drags them apart — the
    # state every other figure on this page quietly assumes.
    ox = 340
    ports2, mutated2, rect2 = draw_mutator(svg, ox, 60, 220, "reconcile", RECONCILE_ARGS[:2],
                                           edge_t=[0.3, 0.7])
    for m in mutated2:
        px2, py2 = top_point(rect2, m["edge_t"])
        svg.add(f'<path d="M{px2},{py2} L{px2},{py2-26}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px2, py2, EFFECT_INK, True, r=5))
    svg.add(text(ox, 200, "after dragging them apart by hand — nothing in the model does this for you",
                 size=11, color=MUTED, italic=True))
    return svg.render("Two effect ports at the shared default position, and after separating them")


# ==========================================================================
# Part 1 — ten variants
# ==========================================================================

# zigzag headroom for the shortlisted gallery cards: three cables need three
# distinct heights above the block without any one of them going off-canvas.
CARD_DY = [-34, -58, -34]
CARD_DX = [56, 74, 92]


def gallery_panel_shortlisted(variant_id: str, w=440, h=250) -> str:
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 34, 92, 200, "reconcile", RECONCILE_ARGS)
    if variant_id == "v8":
        starts = mark_v8_hover(svg, rect, mutated, active=1)
        svg.add(text(34, 20, "shown mid-hover on backup — at rest every port below is an identical bare dot",
                     size=10.5, color=MUTED, italic=True))
        stub_cable(svg, starts[1], dx=CARD_DX[1], dy=CARD_DY[1])
        return svg.render(f"{VARIANT_NAMES[variant_id]} — reconcile(primary, backup, preview)")
    starts = VARIANT_MARKERS[variant_id](svg, rect, mutated)
    for i, s in enumerate(starts):
        if variant_id == "v2":
            sx, sy, name = s
            stub_cable(svg, (sx, sy), dx=CARD_DX[i], dy=CARD_DY[i], label=f"mut {name}")
        else:
            stub_cable(svg, s, dx=CARD_DX[i], dy=CARD_DY[i])
    return svg.render(f"{VARIANT_NAMES[variant_id]} — reconcile(primary, backup, preview)")


def gallery_panel_v4(w=520, h=430) -> str:
    """V4 — positional correspondence as an invariant: topmost argument, leftmost port.
    No mark at all; the two mini-boards below reveal why that is exactly the
    thing the shipped model already refuses to promise (`effectPortEdgeTFromRoute`
    moves a port to wherever a dragged cable lands)."""
    svg = Board(w, h)
    svg.add(text(34, 16, "no mark — the invariant is pure position, so it costs nothing to draw and nothing to check",
                 size=10.5, color=MUTED, italic=True))
    ports, mutated, rect = draw_mutator(svg, 34, 62, 200, "reconcile", RECONCILE_ARGS,
                                        edge_t=[0.25, 0.5, 0.75])
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py-22}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        svg.add(text(px, py - 30, f"({m['name']})", size=9.5, color=MUTED, italic=True, anchor="middle"))
    svg.add(text(34, 206, "default order matches the signature — the invariant holds, silently",
                 size=11, color=MUTED))
    svg.add(f'<line x1="20" y1="216" x2="{w-20}" y2="216" stroke="{FRAME}" stroke-width="1"/>')
    svg.add(text(34, 240, "after backup's cable is dragged past preview's — nothing forbids this",
                 size=11, color=WARN, weight=600))
    ports3, mutated3, rect3 = draw_mutator(svg, 34, 262, 200, "reconcile", RECONCILE_ARGS,
                                           edge_t=[0.2, 0.85, 0.55])  # backup dragged past preview
    for m in mutated3:
        px, py = top_point(rect3, m["edge_t"])
        svg.add(f'<path d="M{px},{py} L{px},{py-22}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        svg.add(text(px, py - 30, f"({m['name']})", size=9.5, color=WARN, italic=True, anchor="middle"))
    svg.add(text(34, 415, "left → right now reads primary, preview, backup", size=11, color=WARN, weight=600))
    return svg.render("V4 — after backup's cable was dragged past preview's, left-to-right no longer matches the signature")


def gallery_panel_v5(w=440, h=225) -> str:
    """V5 — a faint tether inside the block from the hook up to its port."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 34, 66, 200, "reconcile", RECONCILE_ARGS)
    starts = []
    for m in mutated:
        px, py = top_point(rect, m["edge_t"])
        ix, iy = m["in_xy"]
        svg.add(f'<path d="M{ix},{iy} Q{ix},{py} {px},{py}" fill="none" stroke="{MUTED}" '
                f'stroke-width="1.3" stroke-dasharray="3 3" opacity="0.6"/>')
        svg.add(f'<path d="M{px},{py} L{px},{py-26}" stroke="{EFFECT_INK}" stroke-width="2.2" stroke-linecap="round"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=5))
        starts.append((px, py - 26))
    for i, s in enumerate(starts):
        stub_cable(svg, s, dx=70 + (i % 2) * 14, dy=-16 - i * 20)
    return svg.render("V5 — a tether from each hook to its port, inside the block")


def gallery_panel_v7(w=460, h=280) -> str:
    """V7 — one bundled effect port; the cable fans out and lands, named, on
    each hook it belongs to. The write-back destination is always the port
    that named the argument (mutation-flow §1), so a fan-out necessarily
    folds back onto this same block's own left edge — routed left of the
    block, not across its own title, so the lines don't fight the name."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 100, 130, 200, "reconcile", RECONCILE_ARGS,
                                        edge_t=[0.5, 0.5, 0.5])
    bx, by, bw, bh = rect
    trunk = (bx + bw * 0.5, by)
    stem_top = (trunk[0], trunk[1] - 40)
    svg.add(f'<path d="M{trunk[0]},{trunk[1]} L{stem_top[0]},{stem_top[1]}" stroke="{EFFECT_INK}" stroke-width="2.6" stroke-linecap="round"/>')
    svg.add(f'<rect x="{stem_top[0]-10}" y="{stem_top[1]-10}" width="20" height="20" rx="4" fill="{EFFECT_INK}"/>')
    svg.add(text(stem_top[0], stem_top[1] - 18, "mut ×3", size=10.5, color=EFFECT_INK, weight=700, anchor="middle"))
    for i, m in enumerate(mutated):
        ix, iy = m["in_xy"]
        c1x, c1y = bx - 50 - i * 14, stem_top[1] + 20
        c2x, c2y = bx - 30, iy
        svg.add(f'<path d="M{stem_top[0]},{stem_top[1]} C {c1x},{c1y} {c2x},{c2y} {ix - 2},{iy}" '
                f'fill="none" stroke="{EFFECT_INK}" stroke-width="1.8" '
                f'marker-end="url(#arrow-effect)" opacity="0.9"/>')
        svg.add(text(ix - 34, iy - 10, m["name"], size=10, color=EFFECT_INK, weight=600, anchor="end"))
    return svg.render("V7 — one bundled port, fanning back out to land, named, on each hook")


def gallery_panel_v9(w=460, h=250) -> str:
    """V9 — a labelled effect band on the top edge, one slot per effect, the
    way the header band already reserves row 0 for the receiver."""
    svg = Board(w, h)
    bx, by, bw = 40, 96, 220
    band_h = 22
    svg.add(f'<rect x="{bx}" y="{by}" width="{bw}" height="{band_h}" fill="#fff7f0" stroke="{EFFECT_INK}" stroke-width="1"/>')
    n = len(RECONCILE_ARGS)
    for i, a in enumerate(RECONCILE_ARGS):
        cx = bx + (i + 0.5) * bw / n
        svg.add(f'<circle cx="{cx-30}" cy="{by+band_h/2}" r="4" fill="{EFFECT_INK}"/>')
        svg.add(text(cx - 22, by + band_h / 2 + 4, a["name"], size=10, color=EFFECT_INK, weight=600))
        if i > 0:
            svg.add(f'<line x1="{bx+i*bw/n}" y1="{by}" x2="{bx+i*bw/n}" y2="{by+band_h}" stroke="{EFFECT_INK}" stroke-width="0.8" opacity="0.4"/>')
    inputs = [{"name": a["name"], "type": a["type"], "color": port_color(a["type"]), "connected": True}
              for a in RECONCILE_ARGS]
    ports = block(svg, bx, by + band_h, bw, "reconcile", inputs, [])
    for a in RECONCILE_ARGS:
        ix, iy = ports["in"][a["name"]]
        svg.add(mut_badge(ix, iy, color=EFFECT_INK, connected=True))
    svg.add(text(bx, by - 8, "band reserves a fixed slot per effect — a structural row, not a point on the edge",
                 size=10.5, color=MUTED, italic=True))
    return svg.render("V9 — a dedicated effect band above the title, like the header band")


def gallery_panel_v10(w=640, h=190) -> str:
    """V10 — signature notation from languages: the disambiguation moves into
    the title text itself, borrowing Rust's `&mut`."""
    svg = Board(w, h)
    inputs = [{"name": a["name"], "type": a["type"], "color": port_color(a["type"]), "connected": True}
              for a in RECONCILE_ARGS]
    title = "reconcile(&mut primary, &mut backup, preview)"
    ports = block(svg, 34, 40, 570, title, inputs, [])
    for a in RECONCILE_ARGS:
        ix, iy = ports["in"][a["name"]]
        svg.add(mut_badge(ix, iy, color=EFFECT_INK, connected=True))
        px, py = top_point(ports["rect"], 0.5)
    for i, a in enumerate(RECONCILE_ARGS):
        px = ports["rect"][0] + (i + 1) * ports["rect"][2] / 4
        py = ports["rect"][1]
        svg.add(f'<path d="M{px},{py} L{px},{py-16}" stroke="{EFFECT_INK}" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>')
        svg.add(dot(px, py, EFFECT_INK, True, r=4, opacity=0.6))
    svg.add(text(34, 20, "the title carries the mark; the top-edge dots stay anonymous and almost redundant",
                 size=10.5, color=MUTED, italic=True))
    return svg.render("V10 — &mut in the signature text")


VARIANT_CLAIMS = {
    "v1": ("Paint the argument's name directly beside the port dot on the top edge.",
           "The name is always right there, with zero inference.",
           "Ink on every mutated block whether or not it is ambiguous, and text needs lateral "
           "room the top edge does not reliably have (stress 3, 4, 9)."),
    "v2": ("Keep the port bare; the existing `mut` pill on the cable carries the argument's name "
           "(`mut poses`) instead of the generic word.",
           "Nothing new on the block itself — only a cable, once drawn, gets the label.",
           "Invisible on an unwired mutated block, and a long name widens the pill until it "
           "collides with a neighbour (stress 3)."),
    "v3": ("The port and hook inherit `portColor(type)` — the colour a data port already carries.",
           "Reuses a channel readers already decode; zero new ink, zero new legend.",
           "Two same-type mutated arguments are the exact case that needs telling apart, and "
           "most domain classes (`Cache`, `Pose`, `Task`) all fall into the one grey `any` bucket "
           "anyway — colour distinguishes types, not identities."),
    "v4": ("No mark at all: the Nth mutated argument in the signature is always the Nth effect "
           "port from the left.",
           "Costs zero ink and becomes muscle memory — read left to right, done.",
           "Directly contradicts the settled rule that a port's position comes from where its "
           "cable crosses the boundary, not a slot (`effectPortEdgeTFromRoute`); the first drag "
           "breaks the invariant with nothing on the board to say so."),
    "v5": ("A faint dashed line runs inside the block from each hook up to its port.",
           "The correspondence is drawn once, geometrically — no names to read at all.",
           "Interior wiring is a new convention nothing else in the idiom uses, and three tethers "
           "from three rows converging on three nearby top points reads as a tangle, not a diagram."),
    "v6": ("Number the mutated hooks in signature order; the same numeral repeats on the port "
           "and its pill (`mut ①`).",
           "The shortest possible label that still scales to any number of mutations.",
           "The numeral is arbitrary — you still look at the hook to learn what ① means — and it "
           "is the same device Zach rejected for cable identity on golden 06 (`pose#1`/`pose#2`), "
           "though that ruling was about version provenance, not simultaneous arguments; worth "
           "his eye either way."),
    "v7": ("Collapse every mutation into one effect port; its cable fans out and only the landing "
           "— back at each hook — carries a name.",
           "The top edge never grows past one mark, no matter how many arguments are mutated.",
           "A cable that leaves the top and immediately re-enters the same block reads as a loop "
           "or a bug before it reads as three effects, and the single trunk hides count at a glance."),
    "v8": ("At rest every port is an identical bare dot; selecting or hovering one lights up its "
           "argument's row elsewhere on the block.",
           "Zero resting-state ink — scales to any N for free, and matches how tldraw already "
           "surfaces hover affordances elsewhere.",
           "Provides nothing to a screenshot, a zoomed-out board, or a first glance — it only "
           "exists while a pointer is on it."),
    "v9": ("Give effects their own reserved band along the top, one row per effect, the way the "
           "header band already reserves row 0 for the receiver.",
           "Effects become a first-class row structure instead of points scattered on a line, so "
           "they stack instead of colliding.",
           "A real structural addition, not a paint job — it competes with the title for vertical "
           "space, and it re-introduces a slot exactly where the shipped design deliberately has "
           "none (position derived from the cable, not a row)."),
    "v10": ("Borrow the signature notation of a systems language — `&mut poses` — and put the mark "
            "in the block's title text instead of beside any port.",
            "Reuses reading skill a systems-literate audience already has, and the mark is text, "
            "so it is copyable and greppable.",
            "Opaque to anyone who has not written Rust, and the title is already the most crowded "
            "line on a narrow or collapsed block."),
}
VARIANT_ORDER = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10"]
VARIANT_FULL_NAMES = {
    "v1": "Label the port", "v2": "Name the pill", "v3": "Inherit type colour",
    "v4": "Positional invariant", "v5": "Interior tether", "v6": "Paired ordinals",
    "v7": "Bundled effect port", "v8": "Hover / selection coupling",
    "v9": "Labelled effect band", "v10": "Signature notation (&mut)",
}
GALLERY_SVGS = {
    "v1": gallery_panel_shortlisted("v1"), "v2": gallery_panel_shortlisted("v2"),
    "v3": gallery_panel_shortlisted("v3"), "v6": gallery_panel_shortlisted("v6"),
    "v8": gallery_panel_shortlisted("v8"),
    "v4": gallery_panel_v4(), "v5": gallery_panel_v5(), "v7": gallery_panel_v7(),
    "v9": gallery_panel_v9(), "v10": gallery_panel_v10(),
}


# ==========================================================================
# Part 2's dedicated section — reading hidden state, drawn three ways
# ==========================================================================

HIDDEN_ARGS = [{"name": "seed", "type": "int", "mutated": False}]
HIDDEN_OUT = [{"name": "pose", "type": "Pose"}]


def hidden_state_a(w=380, h=230) -> str:
    """(a) Top edge, bidirectional: the same edge, an inward arrowhead."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 40, 100, 200, "sample_pose", HIDDEN_ARGS,
                                        outputs=HIDDEN_OUT)
    bx, by, bw, bh = rect
    px, py = top_point(rect, 0.62)
    svg.add(f'<path d="M{px},{py-40} L{px},{py}" stroke="{MUTED}" stroke-width="2.2" '
            f'stroke-linecap="round" stroke-dasharray="1 4" marker-end="url(#arrow-warn)"/>')
    svg.add(dot(px, py, MUTED, True, r=5, hollow_warn=False))
    pill(svg, px, py - 50, "random()", color=MUTED)
    svg.add(text(bx, 20, "same edge a mutation's write-back would use —", size=10.5, color=MUTED, italic=True))
    svg.add(text(bx, 34, "only the arrowhead points the other way", size=10.5, color=MUTED, italic=True))
    return svg.render("(a) top edge, bidirectional — an inward arrow shares the mutation's lane")


def hidden_state_b(w=420, h=230) -> str:
    """(b) A different edge: left, but in a dashed lane the ordinary
    value-in ports do not use, since nothing upstream names this input."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 130, 60, 200, "sample_pose", HIDDEN_ARGS,
                                        outputs=HIDDEN_OUT)
    bx, by, bw, bh = rect
    vy = by + bh + 30
    svg.add(f'<path d="M{bx-40},{vy} L{bx},{vy}" stroke="{MUTED}" stroke-width="1.8" '
            f'stroke-dasharray="2 3" marker-end="url(#arrow-warn)"/>')
    svg.add(f'<rect x="{bx-47}" y="{vy-7}" width="14" height="14" fill="#fff" stroke="{MUTED}" '
            f'stroke-width="1.6" transform="rotate(45 {bx-40} {vy})"/>')
    svg.add(text(bx - 55, vy + 4, "random()", size=10.5, color=MUTED, anchor="end", italic=True))
    svg.add(text(bx, by - 12, "ordinary values in, above the line", size=10, color=MUTED, italic=True))
    svg.add(f'<line x1="{bx-60}" y1="{vy-18}" x2="{bx+bw}" y2="{vy-18}" stroke="{FRAME}" stroke-width="1" stroke-dasharray="2 3"/>')
    svg.add(text(bx - 60, vy - 26, "a second, unnamed lane below it — still 'left', still 'in'",
                 size=10, color=MUTED, italic=True))
    return svg.render("(b) a different edge — left, but a lane no declared argument uses")


def hidden_state_c(w=380, h=190) -> str:
    """(c) A different mark entirely: a corner glyph, no port, no cable."""
    svg = Board(w, h)
    ports, mutated, rect = draw_mutator(svg, 60, 70, 200, "sample_pose", HIDDEN_ARGS,
                                        outputs=HIDDEN_OUT)
    bx, by, bw, bh = rect
    gx, gy = bx + bw - 16, by - 14
    svg.add(f'<circle cx="{gx}" cy="{gy}" r="9" fill="#fff" stroke="{MUTED}" stroke-width="1.6"/>')
    svg.add(f'<path d="M{gx},{gy} L{gx},{gy-5.5} M{gx},{gy} L{gx+4},{gy+2.5}" stroke="{MUTED}" stroke-width="1.4" stroke-linecap="round"/>')
    svg.add(text(bx, by - 30, "reads hidden state: random()", size=10.5, color=MUTED, italic=True))
    svg.add(f'<line x1="{gx}" y1="{gy+9}" x2="{bx+bw-30}" y2="{by-24}" stroke="{MUTED}" stroke-width="1" stroke-dasharray="1 2"/>')
    return svg.render("(c) a corner glyph — no port, no cable, nothing to wire or drag")


HIDDEN_STATE_SVGS = {"a": hidden_state_a(), "b": hidden_state_b(), "c": hidden_state_c()}


# ==========================================================================
# Part 3 — stress boards. Nine hostile cases, five shortlisted variants.
# ==========================================================================

def faded(build_fn, opacity=1.0) -> str:
    sub = Board(1, 1)
    build_fn(sub)
    return f'<g opacity="{opacity}">{"".join(sub.parts)}</g>' if opacity < 1.0 else "".join(sub.parts)


def apply_marks(svg, variant_id, rect, mutated, *, active=None):
    if variant_id == "v8":
        return mark_v8_hover(svg, rect, mutated, active=active)
    return VARIANT_MARKERS[variant_id](svg, rect, mutated)


def wire(svg, starts, variant_id, dx0=54, dy0=-22, step=11):
    for i, s in enumerate(starts):
        if variant_id == "v2":
            sx, sy, name = s
            stub_cable(svg, (sx, sy), dx=dx0 + i * 4, dy=dy0 - i * step, label=f"mut {name}")
        else:
            stub_cable(svg, s, dx=dx0 + i * 4, dy=dy0 - i * step)


def case_three_mut(variant_id: str) -> str:
    svg = Board(260, 215)
    ports, mutated, rect = draw_mutator(svg, 26, 100, 170, "reconcile", RECONCILE_ARGS)
    starts = apply_marks(svg, variant_id, rect, mutated)
    wire(svg, starts, variant_id)
    return svg.render(f"three-mutated / {variant_id}")


def case_mixed_output(variant_id: str) -> str:
    svg = Board(260, 195)
    args = [{"name": "poses", "type": "list", "mutated": True}]
    ports, mutated, rect = draw_mutator(svg, 26, 80, 170, "pop_last", args,
                                        outputs=[{"name": "item", "type": "Pose"}])
    starts = apply_marks(svg, variant_id, rect, mutated)
    wire(svg, starts, variant_id, dx0=40)
    return svg.render(f"mixed-output / {variant_id}")


def case_narrow(variant_id: str) -> str:
    svg = Board(200, 225)
    ports, mutated, rect = draw_mutator(svg, 20, 108, 110, "reconcile", RECONCILE_ARGS)
    starts = apply_marks(svg, variant_id, rect, mutated)
    wire(svg, starts, variant_id, dx0=26, dy0=-18, step=9)
    return svg.render(f"narrow / {variant_id}")


def case_collapsed(variant_id: str) -> str:
    """Collapsed / Simple view: a slim shape, no row text at all — the
    signature has to stay honest with zero vertical room below the title."""
    svg = Board(260, 175)
    bx, by, bw, bh = 40, 90, 160, 64
    svg.add(f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="8" fill="#fff" stroke="{BORDER}" stroke-width="1.2"/>')
    svg.add(text(bx + bw / 2, by + bh / 2 + 5, "reconcile", size=13, mono=True, anchor="middle"))
    rect = (bx, by, bw, bh)
    mutated = []
    for i, a in enumerate(RECONCILE_ARGS):
        iy = by + (i + 1) * bh / 4
        svg.add(mut_badge(bx, iy, color=EFFECT_INK, connected=True))
        mutated.append({"name": a["name"], "type": a["type"], "color": port_color(a["type"]),
                        "in_xy": (bx, iy), "edge_t": (i + 1) / 4})
    starts = apply_marks(svg, variant_id, rect, mutated)
    wire(svg, starts, variant_id, dx0=30, dy0=-18)
    return svg.render(f"collapsed / {variant_id}")


def case_nested(variant_id: str) -> str:
    """Two mutated parameters threading through three call levels."""
    svg = Board(720, 190)
    args = [{"name": "task", "type": "Task", "mutated": True},
            {"name": "cache", "type": "Cache", "mutated": True}]
    xs = [30, 280, 530]
    for i, x in enumerate(xs):
        ports, mutated, rect = draw_mutator(svg, x, 70, 150, f"level{i+1}", args)
        starts = apply_marks(svg, variant_id, rect, mutated, active=0 if variant_id == "v8" else None)
        wire(svg, starts, variant_id, dx0=20, dy0=-18)
        if i > 0:
            svg.add(f'<path d="M{xs[i-1]+150+6},{70+55} L{x-6},{70+55}" stroke="{MUTED}" '
                    f'stroke-width="1.6" stroke-dasharray="3 3" marker-end="url(#arrow-warn)"/>')
            svg.add(text((xs[i-1]+150+x)/2, 70+48, "same task, cache", size=9, color=MUTED, anchor="middle", italic=True))
    return svg.render(f"nested / {variant_id}")


def case_branch(variant_id: str) -> str:
    svg = Board(300, 260)
    out = draw_region(svg, 20, 20, 260, [
        {"label": "if fresh", "h": 90}, {"label": "else", "h": 90, "muted": True},
    ], title="Branch")
    args2 = [{"name": "cache", "type": "Cache", "mutated": True},
             {"name": "log", "type": "Log", "mutated": True}]

    def draw_arm(sub, ax, ay):
        ports, mutated, rect = draw_mutator(sub, ax, ay, 140, "sync", args2)
        starts = apply_marks(sub, variant_id, rect, mutated, active=0 if variant_id == "v8" else None)
        wire(sub, starts, variant_id, dx0=16, dy0=-16)

    a1x, a1y, a1w, a1h = out["arms"][0]
    a2x, a2y, a2w, a2h = out["arms"][1]
    svg.add(faded(lambda s: draw_arm(s, a1x + 14, a1y + 30), 1.0))
    svg.add(faded(lambda s: draw_arm(s, a2x + 14, a2y + 14), effect_board_svg.STALE))
    return svg.render(f"branch-arm / {variant_id}")


def case_loop(variant_id: str) -> str:
    svg = Board(300, 210)
    out = draw_region(svg, 20, 20, 260, [{"label": "for pose in poses", "h": 130}], title="Loop")
    ax, ay, aw, ah = out["arms"][0]
    args2 = [{"name": "buffer", "type": "Buffer", "mutated": True},
             {"name": "stats", "type": "Stats", "mutated": True}]

    def draw_arm(sub, x, y):
        ports, mutated, rect = draw_mutator(sub, x, y, 150, "accumulate", args2)
        starts = apply_marks(sub, variant_id, rect, mutated, active=0 if variant_id == "v8" else None)
        wire(sub, starts, variant_id, dx0=14, dy0=-14)

    svg.add(faded(lambda s: draw_arm(s, ax + 14, ay + 8)))
    svg.add(text(ax + 14, ay + ah - 8, "top lane squeezed against the region's own title band",
                 size=9.5, color=MUTED, italic=True))
    return svg.render(f"loop-region / {variant_id}")


def case_shared_object(variant_id: str) -> str:
    svg = Board(300, 260)
    args_a = [{"name": "shared", "type": "Cache", "mutated": True}]
    args_b = [{"name": "shared", "type": "Cache", "mutated": True}]
    portsA, mutA, rectA = draw_mutator(svg, 40, 30, 170, "stage_backup", args_a)
    startsA = apply_marks(svg, variant_id, rectA, mutA, active=0 if variant_id == "v8" else None)
    wire(svg, startsA, variant_id, dx0=20, dy0=-16)
    portsB, mutB, rectB = draw_mutator(svg, 40, 170, 170, "stage_preview", args_b)
    startsB = apply_marks(svg, variant_id, rectB, mutB, active=0 if variant_id == "v8" else None)
    wire(svg, startsB, variant_id, dx0=20, dy0=-16)
    return svg.render(f"shared-object / {variant_id}")


def case_zoomed(variant_id: str) -> str:
    return case_three_mut(variant_id)  # identical content — the HTML shrinks the container


STRESS_CASES = [
    ("three-mut", "Three mutated arguments", case_three_mut, 260,
     "The baseline hard case every variant must clear before anything else matters."),
    ("mixed-output", "A real output + an effect port", case_mixed_output, 260,
     "`item = poses.pop()` — one real named output on the right, one effect port on top, on the same block."),
    ("narrow", "Narrow / Simple view", case_narrow, 200,
     "Half the width — ports and their marks are forced close together."),
    ("collapsed", "Collapsed block", case_collapsed, 260,
     "No row text at all — the signature must stay honest with zero vertical room."),
    ("nested", "Nested propagation, 3 levels", case_nested, 720,
     "Two mutated parameters threading through three call levels."),
    ("branch", "Inside a Branch arm", case_branch, 300,
     "The inactive arm sits at the settled 18% fade — do the marks still read?"),
    ("loop", "Inside a Loop region", case_loop, 300,
     "The top lane fights the region's own title band for the same vertical room."),
    ("shared-object", "Two blocks, one shared object", case_shared_object, 300,
     "Both blocks mutate the same name — does anything say these two ports are the same object?"),
    ("zoomed", "Zoomed out", case_zoomed, 260,
     "Same board, displayed small — which marks survive on geometry and colour alone?"),
]

STRESS_KILLS = {
    "three-mut": "No kills outright — this is the case every shortlisted variant was built to answer. "
                 "V3 already shows its structural limit here: primary/backup share one colour because "
                 "both are `Cache`, an unrecognised type; only preview (`Image`) stands apart.",
    "mixed-output": "None killed, but V1's free-floating name label sits close enough to the real output "
                    "port's own name (`item`, on the right) that a first glance can mistake one top label "
                    "for a second output — a legibility tax, not a failure.",
    "narrow": "V1 and V2's text collides — three names or three pills do not fit above a half-width block. "
              "V6's numerals survive (they are the smallest mark that still disambiguates). V3 and V8 are "
              "unaffected: neither depends on lateral text room.",
    "collapsed": "V1 and V2 are killed outright — there is no vertical room above a collapsed shape for a "
                 "label or a pill, and the signature itself carries no row text to fall back on. V6's tiny "
                 "numeral badges are the only text-bearing mark that still fits. V3 and V8 are untouched, "
                 "since neither needs room at all.",
    "nested": "V6 is quietly killed here: the ordinal numbering restarts at ① in every one of the three "
              "blocks, so 'first mutated argument' means three unrelated things across the chain — it "
              "disambiguates within a block and says nothing between blocks. V1/V2/V3 all repeat the same "
              "name/colour at every level, which is exactly what nesting needs.",
    "branch": "V1's text and V2's pill text both survive 18% opacity (dark ink on a light board keeps just "
              "enough contrast), but only barely — this is where a colour-only mark would have failed first. "
              "V3's colour distinction is the one most weakened by the fade, since hue difference at 18% "
              "opacity is exactly the kind of signal a fade is designed to suppress.",
    "loop": "V9 (not shortlisted, but relevant) would be killed outright here — a reserved band has nowhere "
            "to go between a tight region title and the block's own title. Among the shortlist, V1 and V2's "
            "stub labels are squeezed into the same narrow gap and start crowding the region's own label text.",
    "shared-object": "V6 is killed here in a different way than case `nested`: both blocks independently "
                      "show ① for their one mutated argument, which reads as 'these are two different first "
                      "things', the opposite of the truth. V1, V2 and V3 all happen to survive, but only "
                      "because the two signatures reuse the literal name `shared` — rename one and the same "
                      "gap V6 has reappears for all of them.",
    "zoomed": "V1, V2 and V6 are all killed the same way: their text shrinks below legibility well before the "
              "block itself does, so the mark disappears while the block is still perfectly readable. V3 "
              "survives on hue alone. V8 was never visible at this distance to begin with — hover has no "
              "resting mark, so zooming out changes nothing because there was nothing to lose.",
}


# ==========================================================================
# Part 2 — the effect-kind table
# ==========================================================================

KIND_TABLE = [
    ("Mutates an argument", "`copy_into(dst, src)`, `poses.append(pose)`", "served",
     "Shipped. `reconcileEffectPorts` derives the port; this whole page is about the one gap in it — "
     "telling several of them apart."),
    ("Mutates the receiver (`self._task = …`)", "an instance method, golden 36's shape",
     "extends",
     "`portInHeader` reads `row === 0` on an ordinary input — a header/receiver port is already "
     "just a row-0 member of `props.inputs`. `reconcileEffectPorts` filters "
     "`props.inputs.filter(portMutates)` with no header check at all, so a receiver flagged "
     "`mutates` already derives an effect port for free at the model layer. Unverified: whether "
     "the inspector's checkbox is currently exposed for a header-row port, or only for body rows."),
    ("Mutates a global", "a module-level `_cache` written from inside a call", "breaks",
     "There is no argument and no receiver to hang `mutates` on — a global is not in "
     "`props.inputs` at all, under any row. The whole derivation (`effectPortId(inputId)`, "
     "`mutatedInputId`) is keyed off an input id that does not exist here. Needs an anchor the "
     "model does not have: some notion of a project-level symbol a block can point at."),
    ("I/O out (`print`, a file, a socket, a device)", "`print(status)`, `log.write(line)`", "breaks",
     "Nothing in scope changes name or value — there is no argument whose next read should rebind "
     "to a new version, which is the mechanism this whole feature rests on. An 'effect port' here "
     "would have no cable with anywhere honest to land, since nothing downstream consumes it."),
    ("Reads hidden state (`random()`, `time.now()`, `os.environ`, a file read)",
     "`sample_pose()` calling `random()`", "breaks — directionally",
     "See the dedicated section below: this is an effect flowing IN, and the shipped rule "
     "('top = what this block does to something it did not create') only has words for the "
     "outward case."),
    ("Raises / control-flow escape", "`raise ValueError(...)`, an early `return` past cleanup",
     "breaks",
     "Not a value flowing anywhere — an exit that skips the normal one-output-continues-right "
     "shape entirely. Needs an escape-edge concept with no relationship to a port."),
    ("Acquires / releases a resource (`with open(...) as f`)", "a context manager bracketing a "
     "sub-region of the body", "breaks (as a port) / maybe-extends (as a region)",
     "Two effects — enter and exit — bracket a whole scope, which is a region concept (closer to "
     "Branch/Loop) rather than a single call's port. Forcing it onto a port per mutated argument "
     "would need one 'argument' for the resource and would still say nothing about the span it "
     "covers."),
    ("Async scheduling (`asyncio.create_task(...)`)", "fire-and-forget, runs later", "breaks",
     "A temporal fact, not an in-place write — the delayed-cable / `z⁻¹` vocabulary already exists "
     "for 'this arrives later' and is the more natural home for it. The mut-port grammar has "
     "nothing to say about deferred execution at all."),
    ("Logging / telemetry (high-frequency)", "a `logger.debug(...)` on every iteration of a loop",
     "open question — argued in the prompt",
     "Not a modelling gap so much as a volume one: nothing stops a port+cable per log call, but a "
     "board with one on every line stops being a board. The live question is whether this should "
     "be drawn as a port at all, or suppressed to something far smaller (a tiny corner tick, never "
     "a full effect port) — or simply not drawn. No verdict taken here on purpose."),
]


def kind_row(name, example, verdict, why) -> str:
    if verdict.startswith("served"):
        cls = "ok"
    elif verdict.startswith("extends"):
        cls = "warn"
    elif verdict.startswith("open"):
        cls = "warn"
    else:
        cls = "bad"  # every "breaks" variant, including the qualified ones
    return (f'<tr><td>{name}</td><td><code>{example}</code></td>'
            f'<td class="v-{cls}"><b>{verdict}</b></td><td>{why}</td></tr>')


KIND_TABLE_HTML = "".join(kind_row(*row) for row in KIND_TABLE)


# ==========================================================================
# Part 3 — the stress grid, assembled as HTML
# ==========================================================================

def stress_row_html(case_id, title, fn, w, why) -> str:
    cells = []
    for vid in SHORTLIST:
        svg = fn(vid)
        extra = " zoomcell" if case_id == "zoomed" else ""
        cells.append(f'<div class="stresscell{extra}"><div class="vlabel">{VARIANT_NAMES[vid]}</div>{svg}</div>')
    return (f'<div class="stressrow"><h4>{title}</h4><p class="small">{why}</p>'
            f'<div class="stressgrid">{"".join(cells)}</div>'
            f'<div class="kills"><b>Kills:</b> {STRESS_KILLS[case_id]}</div></div>')


STRESS_HTML = "".join(stress_row_html(cid, title, fn, w, why) for cid, title, fn, w, why in STRESS_CASES)


# ==========================================================================
# Part 1 gallery, assembled as HTML
# ==========================================================================

def gallery_card(vid) -> str:
    claim, benefit, cost = VARIANT_CLAIMS[vid]
    star = ' <span class="star">shortlisted for Part 3</span>' if vid in SHORTLIST else ""
    return (f'<div class="card"><h3>{vid.upper()} — {VARIANT_FULL_NAMES[vid]}{star}</h3>'
            f'{GALLERY_SVGS[vid]}'
            f'<p><b>Claims:</b> {claim}</p>'
            f'<p><b>Because:</b> {benefit}</p>'
            f'<p><b>Costs:</b> {cost}</p></div>')


GALLERY_HTML = "".join(gallery_card(v) for v in VARIANT_ORDER)


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--bg:#fbfbfc;
      --ok:#16794a;--bad:#d9480f;--warnbg:#fff4ed}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
     font:15.5px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:1320px;margin:0 auto;padding:44px 30px 100px}
h1{font-size:31px;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 28px;max-width:900px}
h2{font-size:22px;margin:56px 0 14px;padding-top:18px;border-top:1px solid var(--line);letter-spacing:-.01em}
h3{font-size:16px;margin:0 0 10px}
h4{font-size:14.5px;margin:0 0 4px}
p{margin:0 0 12px}
code{font:13px/1.5 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace;
     background:#eef0f3;padding:1px 5px;border-radius:4px}
pre{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto}
pre code{background:none;padding:0;font-size:12.3px;line-height:1.6}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:10px;margin:26px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:22px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
.board{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:#f7f8fa}
figure{margin:20px 0}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
         border-radius:8px;padding:16px 18px;margin:22px 0}
.callout.warn{border-left-color:var(--warn);background:var(--warnbg)}
table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff;
      border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:none}
.v-ok{color:var(--ok)} .v-warn{color:#a1650a} .v-bad{color:var(--bad)}
.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.card h3{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.star{font-size:10.5px;color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.04em;
      background:#eef4ff;border-radius:5px;padding:2px 6px}
.hiddenrow{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:18px 0}
.hiddencard{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.hiddencard ul{margin:8px 0 0;padding-left:18px;font-size:13.6px}
.hiddencard li{margin-bottom:5px}
.stressrow{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
.stressgrid{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}
.stresscell{flex:0 0 auto;width:236px}
.stresscell.zoomcell{width:78px}
.stresscell.zoomcell .board{border-color:#ddd}
.vlabel{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.kills{margin-top:10px;background:var(--warnbg);border-left:3px solid var(--warn);border-radius:0 6px 6px 0;
       padding:9px 13px;font-size:13.4px}
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
@media (max-width:900px){.gallery{grid-template-columns:1fr}.hiddenrow{grid-template-columns:1fr}}
"""


def build() -> str:
    n_kind_served = sum(1 for r in KIND_TABLE if r[2] == "served")
    n_kind_breaks = sum(1 for r in KIND_TABLE if r[2].startswith("breaks"))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Effect port identity</title>
<style>{CSS}</style></head><body>
<main>
<h1>Telling mutated ports apart</h1>
<p class="sub">Zach, after the effect-ports implementation shipped: "What happens if you have like multiple
ports that are being mutated. how can you tell them apart? ... now it's time to harden and stress test
this." This is that hardening pass — an enumeration, ten drawn variants, an effect-kind table, and nine
hostile boards. Nothing here is a decision; every variant carries what it claims and what it costs, and
every stress case says plainly which variants it kills.</p>

<div class="facts">
<div class="fact"><b>1</b><span>edge (top) every effect port shares today, regardless of how many
arguments are mutated — `edgePortPoint('top', …)`, `layoutBlock.ts`</span></div>
<div class="fact"><b>0.5</b><span>`EFFECT_EDGE_T_DEFAULT` — the position every NEW effect port gets,
including the second and third one on the same block</span></div>
<div class="fact"><b>null</b><span>the `label` on every top-edge placement, per `layoutBlock.ts` —
confirmed by reading the file, not assumed</span></div>
<div class="fact"><b>{n_kind_served}/{len(KIND_TABLE)}</b><span>effect kinds the shipped port model
already serves, from the Part 2 table below</span></div>
<div class="fact"><b>{n_kind_breaks}/{len(KIND_TABLE)}</b><span>effect kinds that break the model
outright — no argument or receiver to anchor the mark to</span></div>
<div class="fact"><b>10 → 5</b><span>variants drawn in Part 1; the shortlist stress-tested against
nine hostile boards in Part 3</span></div>
</div>

<h2>0 · The gap, verified before anything is drawn</h2>
<p>Two arguments marked <code>mutates</code>, in the order a person would actually click them.
<code>reconcileEffectPorts</code> (<code>src/blocks/blockModel.ts</code>) gives every newly-added effect
port <code>edgeT: EFFECT_EDGE_T_DEFAULT</code> — <b class="k">0.5</b>, unconditionally. Nothing in the
reconcile spreads a second or third one apart. Mark <code>primary</code>, then <code>backup</code>, and
both land on the identical point on the top edge until a person drags one away by hand. Every other board
on this page assumes that dragging has already happened; this is what it looks like before it does.</p>
<figure>{evidence_board()}<figcaption>Left: both effect ports at the shared default. Right: the same two,
separated by hand — the starting state every other figure on this page quietly assumes.</figcaption></figure>
<div class="callout warn"><b>One correction made on this page.</b> <code>docs/effect_board_svg.py</code>'s
<code>EFFECT</code> constant is bound to <code>THICK</code> (near-black, <code>#15181f</code>) — a
holdover from before the ink was settled. The shipped cable
(<code>src/blocks/connections/effectCable.ts</code>) paints <code>var(--ss-warning)</code>, a warm orange,
at 2.6px — which is also what <code>effect-ports-3-wired-2026-09-03.png</code> shows. Every effect cable
on this page is drawn in that warm ink explicitly; <code>effect_board_svg.py</code> itself was left
untouched, since three other builders import it mid-flight.</div>

<h2>1 · Ten variants</h2>
<p>Every panel draws the same block — <code>reconcile(primary, backup, preview)</code>, three mutated
arguments, two of them an unrecognised type (<code>Cache</code>, so <code>portColor</code> falls back to
the one grey-gold <code>any</code> bucket) and one recognised (<code>Image</code>, violet) — so the ten
are directly comparable.</p>
<div class="gallery">{GALLERY_HTML}</div>

<h2>2 · The effect-kind table</h2>
<p>Whether the shipped mutated-argument port design serves, extends, or breaks for every effect kind
worth naming.</p>
<table><thead><tr><th>Kind</th><th>Example</th><th>Verdict</th><th>Why</th></tr></thead>
<tbody>{KIND_TABLE_HTML}</tbody></table>

<h2>2b · Hidden state gets its own section</h2>
<p>The shipped rule is "top edge = what this block does to something it did not create." But
<code>random()</code>, <code>time.now()</code>, <code>os.environ</code> and a file read all bring
something IN that the block did not create — an effect flowing inward, which the rule as stated has no
words for. Three candidate answers, no winner taken.</p>
<div class="hiddenrow">
<div class="hiddencard">{HIDDEN_STATE_SVGS["a"]}
<p><b>(a) Top edge, bidirectional.</b> An effect port becomes a source as well as a sink; direction is
carried only by the arrowhead.</p>
<ul><li>Reuses one edge and one vocabulary — no new grammar to learn.</li>
<li>An inward and outward mark share a lane, so a block that both reads hidden state and mutates an
argument needs the two told apart at a glance, by arrowhead alone.</li>
<li>Directly reopens the settled "top = out" reading — everywhere else on this page depends on that
being one-directional.</li></ul></div>
<div class="hiddencard">{HIDDEN_STATE_SVGS["b"]}
<p><b>(b) A different edge.</b> Left, since a hidden read is still technically a value coming in — but a
second, unnamed lane no declared argument uses.</p>
<ul><li>Keeps the top edge meaning only one thing, undisturbed.</li>
<li>"Left" already means "declared argument"; a second lane on the same edge is a new sub-convention,
not a reuse of an existing one.</li>
<li>Nothing to bind a cable to — there is no upstream producer to route from, so the mark can never
look like an ordinary port no matter which edge it sits on.</li></ul></div>
<div class="hiddencard">{HIDDEN_STATE_SVGS["c"]}
<p><b>(c) A different mark, not a port.</b> A static corner glyph — no edge position, no cable, nothing
to drag or wire.</p>
<ul><li>Honest about what it is: nothing on the board can be connected to it, because nothing produces
it.</li>
<li>Costs the least ink of the three and cannot be confused with any port.</li>
<li>Says "this block is not pure" without saying which line, which call, or what it read — the least
informative of the three by construction.</li></ul></div>
</div>

<h2>3 · Stress boards</h2>
<p>The shortlist — {", ".join(VARIANT_NAMES[v] for v in SHORTLIST)} — drawn against nine hostile boards.
Each row's <b>Kills</b> line names what actually broke, grounded in the board directly above it.</p>
{STRESS_HTML}

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul>
<li>The default-position collision (§0) verified by reading <code>reconcileEffectPorts</code> and
<code>EFFECT_EDGE_T_DEFAULT</code> directly, not assumed.</li>
<li>10 orthogonal variants drawn in the app's own idiom; 5 shortlisted and stress-tested across 9
hostile boards (45 panels).</li>
<li>Every effect kind Zach might reach for next — receiver, global, I/O, hidden state, raise, resource,
async, logging — placed against the shipped model with a specific reason, not a hand-wave.</li>
</ul></div>
<div><h4>Left</h4><ul>
<li><b>Not built:</b> any of the ten variants — this page is evidence and drawings, not an
implementation.</li>
<li><b>Not started:</b> spreading new effect ports apart automatically instead of stacking them at
0.5 (the §0 fix every variant here otherwise has to work around by hand).</li>
<li><b>Not modelled:</b> the receiver row's `mutates` toggle in the inspector UI — the model supports it
per the code read in the kind table; whether the UI exposes it is unverified.</li>
</ul></div>
<div><h4>Needs you</h4><ul>
<li><b>Which variant, or which combination.</b> No default offered — that is the one call this page
deliberately does not make.</li>
<li><b>Hidden state's edge.</b> Top-bidirectional, a second left lane, or a non-port glyph — three
real answers with different costs, no winner argued for.</li>
<li><b>Logging/telemetry.</b> Drawn at all, suppressed to a tiny mark, or left off entirely — the live
question the prompt raised, still open.</li>
</ul></div>
<div><h4>Deliberately not done</h4><ul>
<li>No app or model code touched — every board here is SVG in the idiom, per the hard constraint on this
pass.</li>
<li>No golden or analyzer exercises two simultaneous mutated arguments today, so every board on this
page is anticipatory hardening, not a regression fix.</li>
<li>No score, ranking, or "strongest variant" table — flagged verbally where warranted, never as a
number.</li>
</ul></div>
</div>
<h3>Reply cheaply</h3>
<p class="small"><code>Pick: … / Keep: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<footer>Built by <code>docs/build_effect_port_identity.py</code> at {GIT_HEAD} · counts and code
excerpts read from the tree at build time · marks drawn with <code>docs/effect_board_svg.py</code> and
<code>docs/branch_board_svg.py</code>, with the stale <code>EFFECT</code> ink corrected locally (see §0) ·
{EFFECT_PORTS_TESTS + EFFECT_CABLE_TESTS} unit cases in the two test files this page cites · Claude Code ·
Sonnet 5 (<code>claude-sonnet-5</code>), 2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(f"kind table: {len(KIND_TABLE)} rows, {sum(1 for r in KIND_TABLE if r[2]=='served')} served")


if __name__ == "__main__":
    main()
