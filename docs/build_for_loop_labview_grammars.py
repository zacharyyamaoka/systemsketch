#!/usr/bin/env python3
"""
Five loop grammars derived from an explicit ownership + timing model.

Builder for `docs/for-loop-labview-grammars-<date>.html`. Every number in the
report is measured from this repository at build time; every diagram is drawn
from the same scene model that emits the `.systemsketch` recipes, so the board
and the gallery cannot drift apart.

Run:  python3 docs/build_for_loop_labview_grammars.py
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from datetime import date
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
SKETCHES = REPO / "sketches" / "review"
STAMP = "2026-09-02"

# ---------------------------------------------------------------------------
# Palette, sampled from Zach's own SystemSketch captures rather than invented.
# `tools`: python3 -c "Counter(Image.open(shot).getdata())" over
# `Pasted image 20260902213552.png`.
# ---------------------------------------------------------------------------
CANVAS = "#FCFCFC"
SURFACE = "#FCFCFC"
SUNKEN = "#F7F7F7"
BORDER = "#E8E8E8"
BORDER_SOFT = "#EDEDED"
INK = "#1E1E1E"
INK_2 = "#2E2E2E"
MUTED = "#757575"
FAINT = "#A6A6A6"
PORT = "#C08520"          # the orange port ring, measured (192,133,32)
TIME = "#6B4FBF"          # cross-iteration / next-turn machinery
DONE = "#2E7D5B"          # completion / after-the-loop
WARN = "#B4531F"          # a hazard callout inside a diagram

MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace'
SANS = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

HEADER_H = 40
ROW_H = 30
FOOTER_H = 22


def esc(text: str) -> str:
    return escape(str(text), quote=True)


# ---------------------------------------------------------------------------
# A tiny SVG scene
# ---------------------------------------------------------------------------
class Scene:
    def __init__(self, w: int, h: int, label: str = "", top: float = 0):
        self.w = w
        self.h = h
        self.top = top
        self.label = label
        self.back: list[str] = []    # scopes and tints
        self.under: list[str] = []   # cable rails that pass beneath a Block
        self.body: list[str] = []
        self.over: list[str] = []    # painted above everything (pills, marks)

    # -- primitives ---------------------------------------------------------
    def rect(self, x, y, w, h, r=10, fill=SURFACE, stroke=BORDER, sw=1.0,
             dash=None, layer="body", opacity=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        getattr(self, layer).append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}{o}/>'
        )

    def line(self, x1, y1, x2, y2, stroke=BORDER_SOFT, sw=1.0, dash=None, layer="body"):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        getattr(self, layer).append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{stroke}" stroke-width="{sw}"{d}/>'
        )

    def text(self, x, y, s, size=13, fill=INK, family=MONO, anchor="start",
             weight="400", layer="body", opacity=None, style=""):
        o = f' opacity="{opacity}"' if opacity is not None else ""
        getattr(self, layer).append(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family=\'{family}\' font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}"{o} '
            f'style="{style}">{esc(s)}</text>'
        )

    def path(self, d, stroke=INK, sw=1.6, fill="none", dash=None, cap="round",
             layer="body", marker=None, opacity=None):
        da = f' stroke-dasharray="{dash}"' if dash else ""
        mk = f' marker-end="url(#{marker})"' if marker else ""
        o = f' opacity="{opacity}"' if opacity is not None else ""
        getattr(self, layer).append(
            f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"{da}{mk}{o}/>'
        )

    def circle(self, cx, cy, r, fill, stroke=None, sw=1.6, layer="body"):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        getattr(self, layer).append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}"{st}/>'
        )

    # -- render -------------------------------------------------------------
    def svg(self) -> str:
        defs = f"""<defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
          orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="{INK}"/></marker>
  <marker id="ah-time" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
          orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="{TIME}"/></marker>
  <marker id="ah-done" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
          orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="{DONE}"/></marker>
  <marker id="ah-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7"
          orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="{WARN}"/></marker>
</defs>"""
        return (
            f'<svg viewBox="0 {self.top} {self.w} {self.h - self.top}" width="100%" '
            f'preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" '
            f'role="img" aria-label="{esc(self.label)}">'
            f'{defs}<rect x="0" y="{self.top}" width="{self.w}" '
            f'height="{self.h - self.top}" fill="{CANVAS}"/>'
            + "".join(self.back) + "".join(self.under) + "".join(self.body)
            + "".join(self.over)
            + "</svg>"
        )


# ---------------------------------------------------------------------------
# Elbow routing with rounded corners
# ---------------------------------------------------------------------------
def elbow(points: list[tuple[float, float]], radius: float = 9.0) -> str:
    """An orthogonal polyline with rounded corners, as SystemSketch draws cables."""
    pts = [points[0]]
    for p in points[1:]:
        if p != pts[-1]:
            pts.append(p)
    if len(pts) < 2:
        return ""
    d = [f"M {pts[0][0]:.1f} {pts[0][1]:.1f}"]
    for i in range(1, len(pts) - 1):
        prev, cur, nxt = pts[i - 1], pts[i], pts[i + 1]
        r = min(radius,
                abs(cur[0] - prev[0]) / 2 or radius, abs(cur[1] - prev[1]) / 2 or radius,
                abs(nxt[0] - cur[0]) / 2 or radius, abs(nxt[1] - cur[1]) / 2 or radius)
        r = max(0.0, r)

        def step(a, b, amount):
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = (dx * dx + dy * dy) ** 0.5 or 1.0
            return (a[0] + dx / length * amount, a[1] + dy / length * amount)

        before = step(cur, prev, r)
        after = step(cur, nxt, r)
        d.append(f"L {before[0]:.1f} {before[1]:.1f}")
        d.append(f"Q {cur[0]:.1f} {cur[1]:.1f} {after[0]:.1f} {after[1]:.1f}")
    d.append(f"L {pts[-1][0]:.1f} {pts[-1][1]:.1f}")
    return " ".join(d)


def polyline_length(points) -> float:
    return sum(((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
               for a, b in zip(points, points[1:]))


def path_point(points: list[tuple[float, float]], t: float) -> tuple[float, float]:
    """Point at fraction `t` of the polyline's length — where a pill sits."""
    segs = []
    total = 0.0
    for a, b in zip(points, points[1:]):
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        segs.append((a, b, length))
        total += length
    target = total * t
    run = 0.0
    for a, b, length in segs:
        if run + length >= target and length:
            k = (target - run) / length
            return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
        run += length
    return points[-1]


# ---------------------------------------------------------------------------
# SystemSketch objects
# ---------------------------------------------------------------------------
@dataclass
class Port:
    name: str
    type: str = ""
    badge: str = ""            # a small mark drawn before the name
    badge_fill: str = INK
    dim: bool = False


@dataclass
class Block:
    key: str
    x: float
    y: float
    w: float
    title: str
    inputs: list[Port] = field(default_factory=list)
    outputs: list[Port] = field(default_factory=list)

    @property
    def rows(self) -> int:
        return max(len(self.inputs), len(self.outputs), 1)

    @property
    def h(self) -> float:
        return HEADER_H + self.rows * ROW_H + FOOTER_H

    def _col_y(self, count: int, index: int) -> float:
        body_top = self.y + HEADER_H
        body_h = self.rows * ROW_H
        block_h = count * ROW_H
        top = body_top + (body_h - block_h) / 2
        return top + index * ROW_H + ROW_H / 2

    def inp(self, i: int) -> tuple[float, float]:
        return (self.x, self._col_y(len(self.inputs), i))

    def out(self, i: int = 0) -> tuple[float, float]:
        return (self.x + self.w, self._col_y(len(self.outputs), i))


def draw_block(scene: Scene, b: Block, accent: str | None = None) -> None:
    scene.rect(b.x, b.y, b.w, b.h, r=10, fill=SURFACE, stroke=accent or BORDER,
               sw=1.6 if accent else 1.0)
    scene.line(b.x + 1, b.y + HEADER_H, b.x + b.w - 1, b.y + HEADER_H, BORDER_SOFT)
    scene.line(b.x + 1, b.y + b.h - FOOTER_H, b.x + b.w - 1, b.y + b.h - FOOTER_H, BORDER_SOFT)
    scene.text(b.x + 14, b.y + 27, b.title, size=17, fill=INK)
    scene.text(b.x + b.w - 12, b.y + b.h - 8, "⋮", size=12, fill=FAINT, anchor="middle")

    for i, p in enumerate(b.inputs):
        cx, cy = b.inp(i)
        scene.circle(cx, cy, 5, SURFACE, PORT, 1.6)
        tx = b.x + 15
        if p.badge:
            scene.text(tx, cy + 4.5, p.badge, size=12, fill=p.badge_fill, weight="600")
            tx += 8 * len(p.badge) + 5
        ink = FAINT if p.dim else INK_2
        scene.text(tx, cy + 4.5, p.name, size=12.5, fill=ink)
        if p.type:
            scene.text(tx + 7.6 * len(p.name) + 7, cy + 4.5, p.type, size=12.5, fill=FAINT)

    for i, p in enumerate(b.outputs):
        cx, cy = b.out(i)
        scene.circle(cx, cy, 5, SURFACE, PORT, 1.6)
        tx = b.x + b.w - 15
        label = f"{p.name} {p.type}".strip() if p.name else p.type
        scene.text(tx, cy + 4.5, label, size=12.5, fill=FAINT if p.dim else INK_2,
                   anchor="end")
        if p.badge:
            scene.text(tx - 7.6 * len(label) - 7, cy + 4.5, p.badge, size=12,
                       fill=p.badge_fill, weight="600", anchor="end")


def draw_region(scene: Scene, x, y, w, h, title=None, rows=None, accent=BORDER,
                fill="#FAFAFA", dash=None, layer="back"):
    """A loop scope. A container, never a computation node."""
    scene.rect(x, y, w, h, r=12, fill=fill, stroke=accent, sw=1.4, dash=dash, layer=layer)
    if title is not None:
        scene.text(x + 16, y + 27, title, size=17, fill=INK, layer=layer)
        scene.line(x + 1, y + HEADER_H, x + w - 1, y + HEADER_H, BORDER_SOFT, layer=layer)
    return y + HEADER_H


def boundary_inlet(scene: Scene, x, y, name, type_name):
    """A `run()` parameter arriving from outside the picture. The label sits
    above its own dot so the cable leaving it never crosses its own name."""
    scene.circle(x, y, 5, PORT, PORT, 0)
    scene.text(x + 10, y - 11, name, size=12.5, fill=INK_2)
    if type_name:
        scene.text(x + 10 + 7.6 * len(name) + 7, y - 11, type_name, size=12.5, fill=FAINT)
    return (x, y)


# -- cables -----------------------------------------------------------------
def cable(scene: Scene, points, kind="solid", pill=None, pill_t=0.5, crow=False,
          layer="body", label=None, label_side="above", stroke=None, arrow=True,
          opacity=None, width=None, ticks=False, pill_ink=None):
    """One SystemSketch connection.

    `solid`   ordinary data, same invocation
    `delayed` the shipped `temporal: delayed` paint — dotted, with a z-1 pill
    `bundle`  a collection: one cable drawn as two rails
    `ghost`   a path that exists but is not taken this turn
    """
    d = elbow(points)
    if kind == "delayed":
        col = stroke or TIME
        scene.path(d, stroke=col, sw=width or 2.3, dash="0.1 5.2", cap="round", layer=layer,
                   marker="ah-time" if arrow else None, opacity=opacity)
    elif kind == "bundle":
        col = stroke or INK
        scene.path(d, stroke=col, sw=5.0, cap="butt", layer=layer)
        scene.path(d, stroke=CANVAS, sw=1.8, cap="butt", layer=layer)
        # a solid head so the arrow reads
        head = points[-2:]
        scene.path(elbow(head), stroke=col, sw=1.7, layer=layer,
                   marker="ah" if arrow else None)
    elif kind == "ghost":
        col = stroke or FAINT
        scene.path(d, stroke=col, sw=1.5, dash="5 5", layer=layer,
                   marker=None, opacity=0.85)
    else:
        col = stroke or INK
        mk = None
        if arrow:
            mk = {INK: "ah", TIME: "ah-time", DONE: "ah-done", WARN: "ah-warn"}.get(col, "ah")
        scene.path(d, stroke=col, sw=width or 1.7, layer=layer, marker=mk, opacity=opacity)
        if ticks:
            total = polyline_length(points)
            step = 26.0
            walked = step / 2
            while walked < total - 12:
                cx, cy = path_point(points, walked / total)
                nx, ny = path_point(points, min(1.0, (walked + 1.2) / total))
                dx, dy = nx - cx, ny - cy
                length = (dx * dx + dy * dy) ** 0.5 or 1
                px, py = -dy / length * 4.6, dx / length * 4.6
                scene.path(f"M {cx-px:.1f} {cy-py:.1f} L {cx+px:.1f} {cy+py:.1f}",
                           stroke=col, sw=1.5, layer=layer, opacity=opacity)
                walked += step

    if crow:
        # cardinality: this cable delivers its elements one per turn
        tipx, tipy = points[-1]
        prevx, prevy = points[-2]
        dx, dy = tipx - prevx, tipy - prevy
        length = (dx * dx + dy * dy) ** 0.5 or 1
        ux, uy = dx / length, dy / length
        bx, by = tipx - ux * 40, tipy - uy * 40
        px, py = -uy, ux
        for k in (-1, 0, 1):
            ex, ey = bx - ux * 16 + px * 9.5 * k, by - uy * 16 + py * 9.5 * k
            scene.path(f"M {bx:.1f} {by:.1f} L {ex:.1f} {ey:.1f}",
                       stroke=stroke or INK, sw=1.6, layer="over")

    if pill:
        px, py = path_point(points, pill_t)
        wpx = 9.2 * len(pill) + 16
        ring = pill_ink or (TIME if kind == "delayed" else BORDER)
        ink = pill_ink or (TIME if kind == "delayed" else INK_2)
        scene.rect(px - wpx / 2, py - 11, wpx, 22, r=11, fill=SURFACE,
                   stroke=ring, sw=1.2, layer="over")
        scene.text(px, py + 4.5, pill, size=12, fill=ink,
                   anchor="middle", weight="600", layer="over")

    if label:
        lx, ly = path_point(points, 0.5)
        dy = -12 if label_side == "above" else 18
        scene.text(lx, ly + dy, label, size=11.5, fill=MUTED, anchor="middle", layer="over")
    return points


def chip(scene: Scene, x, y, text, fill=SURFACE, stroke=BORDER, ink=INK_2, size=11.5,
         layer="over", pad=10, weight="500"):
    w = size * 0.63 * len(text) + pad * 2
    scene.rect(x, y, w, 21, r=10, fill=fill, stroke=stroke, sw=1.1, layer=layer)
    scene.text(x + w / 2, y + 14.5, text, size=size, fill=ink, anchor="middle",
               weight=weight, layer=layer)
    return w


def caption(scene: Scene, x, y, text, fill=MUTED, size=11.5, anchor="start"):
    scene.text(x, y, text, size=size, fill=fill, anchor=anchor, family=SANS, layer="over")


# ---------------------------------------------------------------------------
# Wall machinery — the LabVIEW pole
# ---------------------------------------------------------------------------
WALL = 9.0


def draw_wall_region(scene: Scene, x, y, w, h, tint="#EEECE8", edge="#D6D3CD"):
    """A loop scope whose border is a visible band, so a crossing has somewhere to live."""
    scene.rect(x, y, w, h, r=12, fill=tint, stroke=edge, sw=1.2, layer="back")
    scene.rect(x + WALL, y + WALL, w - 2 * WALL, h - 2 * WALL, r=7,
               fill="#FCFCFC", stroke=BORDER, sw=1.0, layer="back")
    return {"left": x + WALL / 2, "right": x + w - WALL / 2,
            "top": y + WALL / 2, "bottom": y + h - WALL / 2,
            "inner_left": x + WALL, "inner_right": x + w - WALL,
            "outer_left": x, "outer_right": x + w}


def mouth(scene: Scene, cx, cy, kind, name=None, side="left", dim=False):
    """A marked crossing point on the wall. Never a node — it has no body."""
    size = 21
    col = TIME if kind in ("carry-in", "carry-out") else INK
    if dim:
        col = FAINT
    scene.rect(cx - size / 2, cy - size / 2, size, size, r=4, fill=SURFACE,
               stroke=col, sw=1.5, layer="over")
    if kind == "index":
        scene.text(cx, cy + 4.6, "[ ]", size=12, fill=col, anchor="middle",
                   weight="700", layer="over")
    elif kind == "pass":
        scene.rect(cx - 4, cy - 4, 8, 8, r=1.5, fill=col, stroke=None, sw=0, layer="over")
    elif kind == "carry-in":
        scene.over.append(f'<path d="M {cx-6} {cy-5} L {cx+6} {cy-5} L {cx} {cy+6} z" fill="{col}"/>')
    elif kind == "carry-out":
        scene.over.append(f'<path d="M {cx-6} {cy+5} L {cx+6} {cy+5} L {cx} {cy-6} z" fill="{col}"/>')
    elif kind == "counter":
        scene.text(cx, cy + 4.6, "i", size=13, fill=col, anchor="middle",
                   weight="700", family=MONO, layer="over")
    elif kind == "count":
        scene.text(cx, cy + 4.6, "N", size=12, fill=col, anchor="middle",
                   weight="700", family=MONO, layer="over")
    if name:
        dx = -16 if side == "left" else 16
        scene.text(cx + dx, cy - 15, name, size=11.5, fill=col, weight="600",
                   anchor="end" if side == "left" else "start", layer="over")
    return (cx, cy)


# The motivating example, drawn five ways from one shared geometry.
#
#   def run(raw, gain, others):
#       frame = decode(raw); pose = estimate(frame, gain)
#       for other in others: pose = merge(pose, other)
#       return encode(pose)
#
SCENE_W, SCENE_H = 1164, 404
REG = dict(x=252, y=112, w=596, h=248)          # plain scope: V1, V2, V3
REG_HEAD = dict(x=252, y=54, w=596, h=306)      # the scope V4 gives a header to
IN_SEED = (46, 124)
IN_OTHERS = (46, 344)


def _merge(badge_other="", badge_pose="", badge_out=""):
    return Block("merge", 448, 186, 268, "merge()",
                 inputs=[Port("pose", "Pose", badge_pose, TIME),
                         Port("other", "Pose", badge_other, INK)],
                 outputs=[Port("", "Pose", badge_out, TIME)])


def _encode():
    return Block("encode", 940, 201, 190, "encode()",
                 inputs=[Port("pose", "Pose")], outputs=[Port("", "bytes")])


def hop(scene: Scene, x, y, r=7.0):
    """A crossing that is not a junction — SystemSketch's own tunnel idiom."""
    scene.circle(x, y, r - 0.4, CANVAS, None, 0, layer="body")
    scene.path(f"M {x:.1f} {y-r:.1f} A {r} {r} 0 0 1 {x:.1f} {y+r:.1f}",
               stroke=INK, sw=1.7, layer="body")


def scene_v1() -> Scene:
    """V1 Wall Tunnels — the boundary owns BOTH the unpacking and the delay."""
    s = Scene(SCENE_W, SCENE_H, "Wall Tunnels")
    wall = draw_wall_region(s, **REG)
    mg, ec = _merge(), _encode()
    seed = boundary_inlet(s, *IN_SEED, "pose", "Pose")
    others = boundary_inlet(s, *IN_OTHERS, "others", "Poses")
    cin = (wall["left"], mg.inp(0)[1])
    idx = (wall["left"], mg.inp(1)[1])
    cout = (wall["right"], mg.out(0)[1])

    cable(s, [others, (150, others[1]), (150, idx[1]), (idx[0] - 12, idx[1])],
          "bundle", arrow=False)
    cable(s, [(idx[0] + 12, idx[1]), mg.inp(1)], "solid")
    cable(s, [seed, (180, seed[1]), (180, cin[1]), (cin[0] - 12, cin[1])], "solid", arrow=False)
    cable(s, [(cin[0] + 12, cin[1]), mg.inp(0)], "solid", stroke=TIME)
    cable(s, [mg.out(0), (cout[0] - 12, cout[1])], "solid", stroke=TIME, arrow=False)
    cable(s, [(cout[0] + 12, cout[1]), (900, cout[1]), (900, ec.inp(0)[1]), ec.inp(0)],
          "solid", stroke=DONE)

    mouth(s, *idx, "index")
    mouth(s, *cin, "carry-in", "pose")
    mouth(s, *cout, "carry-out", "pose", side="right")
    mouth(s, REG["x"] + 168, wall["bottom"], "counter", dim=True)
    mouth(s, REG["x"] + 168, wall["top"], "count", dim=True)
    draw_block(s, mg)
    draw_block(s, ec)
    chip(s, REG["x"] + 22, REG["y"] + 20, "for", fill=SUNKEN, ink=INK, weight="700")
    caption(s, REG["x"] + 192, wall["top"] + 4, "count", fill=FAINT)
    caption(s, REG["x"] + 192, wall["bottom"] + 4, "iteration counter", fill=FAINT)
    return s


def scene_v2() -> Scene:
    """V2 Cardinality Cable — the cable carries rate; the wall is unmarked."""
    s = Scene(SCENE_W, SCENE_H, "Cardinality Cable")
    r = REG
    draw_region(s, r["x"], r["y"], r["w"], r["h"], accent="#E0E0E0")
    mg, ec = _merge(), _encode()
    seed = boundary_inlet(s, *IN_SEED, "pose", "Pose")
    others = boundary_inlet(s, *IN_OTHERS, "others", "Poses")
    cy = mg.inp(1)[1]

    cable(s, [others, (150, others[1]), (150, cy), (r["x"], cy)], "bundle", arrow=False)
    cable(s, [(r["x"], cy), mg.inp(1)], "solid")
    s.line(r["x"], cy - 16, r["x"], cy + 16, INK, 1.6, layer="over")
    caption(s, r["x"] + 10, cy + 32, "two rails become one", fill=INK_2)
    cable(s, [seed, (180, seed[1]), (180, mg.inp(0)[1]), mg.inp(0)], "solid")
    rail = [mg.out(0), (768, mg.out(0)[1]), (768, r["y"] + r["h"] - 40),
            (426, r["y"] + r["h"] - 40), (426, mg.inp(0)[1]), mg.inp(0)]
    cable(s, rail, "delayed", pill="z⁻¹", pill_t=0.52, layer="under")
    draw_block(s, mg)
    cable(s, [mg.out(0), (900, mg.out(0)[1]), (900, ec.inp(0)[1]), ec.inp(0)],
          "solid", stroke=DONE)
    draw_block(s, ec)
    s.circle(426, mg.inp(0)[1], 3.6, TIME, None, 0, layer="over")
    return s


def scene_v3() -> Scene:
    """V3 Binding Ports — Python's own ownership: the target name makes the element."""
    s = Scene(SCENE_W, SCENE_H, "Binding Ports")
    r = REG
    draw_region(s, r["x"], r["y"], r["w"], r["h"], accent="#E0E0E0")
    mg = _merge(badge_other="[·]", badge_pose="↺", badge_out="↺")
    ec = _encode()
    seed = boundary_inlet(s, *IN_SEED, "pose", "Pose")
    others = boundary_inlet(s, *IN_OTHERS, "others", "Poses")
    cable(s, [others, (150, others[1]), (150, mg.inp(1)[1]), mg.inp(1)], "solid")
    cable(s, [seed, (180, seed[1]), (180, mg.inp(0)[1]), mg.inp(0)], "solid")
    draw_block(s, mg)
    cable(s, [mg.out(0), (900, mg.out(0)[1]), (900, ec.inp(0)[1]), ec.inp(0)],
          "solid", stroke=DONE)
    draw_block(s, ec)
    chip(s, r["x"] + 22, r["y"] + 20, "for  ·  others", fill=SUNKEN, ink=INK)
    caption(s, mg.x, mg.y + mg.h + 28, "[·]  one element per turn", fill=INK_2)
    caption(s, mg.x, mg.y + mg.h + 44, "↺   pairs with the ↺ output by name — no path is drawn",
            fill=TIME)
    return s


def scene_v4() -> Scene:
    """V4 Header Contract — each binding of the `for` is a named row owning wall ports."""
    s = Scene(SCENE_W, SCENE_H, "Header Contract")
    r = REG_HEAD
    mg, ec = _merge(), _encode()
    head_h = 20 + 46 * 2
    s.rect(r["x"], r["y"], r["w"], head_h, r=12, fill=SUNKEN, stroke="none", sw=0, layer="back")
    s.rect(r["x"], r["y"], r["w"], r["h"], r=12, fill="none", stroke="#E0E0E0", sw=1.4, layer="back")
    s.line(r["x"] + 1, r["y"] + head_h, r["x"] + r["w"] - 1, r["y"] + head_h, BORDER, layer="back")
    y_iter = r["y"] + 20 + 34
    y_carry = r["y"] + 66 + 34
    s.text(r["x"] + 22, r["y"] + 38, "for other in others", size=15, fill=INK)
    s.text(r["x"] + 22 + 9.1 * 19 + 16, r["y"] + 38, "one element per turn",
           size=11.5, fill=FAINT, family=SANS)
    s.text(r["x"] + 22, r["y"] + 84, "carry pose", size=15, fill=INK)
    s.text(r["x"] + 22 + 9.1 * 10 + 16, r["y"] + 84, "seeded outside · rewritten each turn",
           size=11.5, fill=FAINT, family=SANS)

    others = boundary_inlet(s, IN_SEED[0], IN_SEED[1], "others", "Poses")
    seed = boundary_inlet(s, IN_OTHERS[0], IN_OTHERS[1], "pose", "Pose")
    cable(s, [others, (150, others[1]), (150, y_iter), (r["x"] - 7, y_iter)],
          "bundle", arrow=False)
    cable(s, [(r["x"], y_iter), (296, y_iter), (296, mg.inp(1)[1]), mg.inp(1)], "solid")
    cable(s, [seed, (188, seed[1]), (188, y_carry), (r["x"] - 7, y_carry)], "solid", arrow=False)
    cable(s, [mg.out(0), (790, mg.out(0)[1]), (790, y_carry), (r["x"] + r["w"] - 8, y_carry)],
          "solid", arrow=False)
    cable(s, [(778, y_carry), (r["x"] + 10, y_carry)], "delayed", pill="z⁻¹", pill_t=0.5)
    cable(s, [(340, y_carry), (340, mg.inp(0)[1]), mg.inp(0)], "solid")
    cable(s, [(r["x"] + r["w"] + 7, y_carry), (900, y_carry), (900, ec.inp(0)[1]), ec.inp(0)],
          "solid", stroke=DONE)
    hop(s, 296, y_carry)
    s.circle(340, y_carry, 3.6, TIME, None, 0, layer="over")
    for dot in ((r["x"], y_iter), (r["x"], y_carry), (r["x"] + r["w"], y_carry)):
        s.circle(dot[0], dot[1], 6, PORT, PORT, 0, layer="over")
    draw_block(s, mg)
    draw_block(s, ec)
    caption(s, r["x"] + r["w"] + 12, y_carry - 14, "final pose", fill=DONE)
    return s


def scene_v5() -> Scene:
    """V5 Bare Cycle — no scope is drawn; the cycle in the graph IS the loop."""
    s = Scene(SCENE_W, SCENE_H, "Bare Cycle")
    mg, ec = _merge(), _encode()
    s.rect(mg.x - 58, mg.y - 34, mg.w + 116, mg.h + 106, r=28, fill="#F6F3FC",
           stroke="none", sw=0, layer="back")
    seed = boundary_inlet(s, *IN_SEED, "pose", "Pose")
    others = boundary_inlet(s, *IN_OTHERS, "others", "Poses")
    cable(s, [others, (150, others[1]), (150, mg.inp(1)[1]), mg.inp(1)], "solid", crow=True)
    cable(s, [seed, (180, seed[1]), (180, mg.inp(0)[1]), mg.inp(0)], "solid")
    rail = [mg.out(0), (mg.x + mg.w + 38, mg.out(0)[1]),
            (mg.x + mg.w + 38, mg.y + mg.h + 40),
            (mg.x - 38, mg.y + mg.h + 40), (mg.x - 38, mg.inp(0)[1]), mg.inp(0)]
    cable(s, rail, "delayed", pill="z⁻¹", pill_t=0.52, layer="under")
    draw_block(s, mg)
    cable(s, [mg.out(0), (900, mg.out(0)[1]), (900, ec.inp(0)[1]), ec.inp(0)],
          "solid", stroke=DONE)
    draw_block(s, ec)
    chip(s, mg.x + mg.w - 128, mg.y - 62, "iteration 3 of 7", fill="#EDE8FA",
         stroke=TIME, ink=TIME, weight="600")
    caption(s, 232, mg.inp(1)[1] + 32, "one element per turn", fill=INK_2)
    return s


MOTIVATING = [
    ("v1", "Wall Tunnels", scene_v1),
    ("v2", "Cardinality Cable", scene_v2),
    ("v3", "Binding Ports", scene_v3),
    ("v4", "Header Contract", scene_v4),
    ("v5", "Bare Cycle", scene_v5),
]


# ---------------------------------------------------------------------------
# Stress suite
#
# One body per loop, drawn identically for every finalist. Only the boundary
# machinery and the return path change, so a difference on screen is a
# difference in the grammar and never a difference in the drawing.
# ---------------------------------------------------------------------------
SW = 1240
IN_X = 46
OUT_X = 1122
REG_X = 300
REG_W = 690
REG_R = REG_X + REG_W


@dataclass
class Element:
    """An outer collection that becomes one value per turn inside."""
    name: str
    outer_type: str
    inner_type: str
    target: tuple            # the inner port this element lands on
    lane: float              # the wall y this crossing owns
    inlet_y: float
    mid: float | None = None # where the inside run turns toward its port


@dataclass
class Invariant:
    name: str
    type: str
    target: tuple
    lane: float
    inlet_y: float
    mid: float | None = None


@dataclass
class Carry:
    name: str
    type: str
    sink: tuple              # the inner port that READS the carried value
    source: tuple            # the inner port that WRITES it
    lane: float
    inlet_y: float
    rail_y: float            # V2 only: where the return rail runs
    branch_x: float          # V2/V4: where the feed leaves the rail/row
    mid: float | None = None
    exit_y: float | None = None
    exit_label: str = ""


@dataclass
class Result:
    name: str
    type: str
    source: tuple
    kind: str                # 'pack' (a collection leaves) | 'last'
    lane: float
    outlet_y: float


@dataclass
class LoopSpec:
    key: str
    title: str
    code: str
    hazards: list[str]
    body_top: float
    body_bottom: float
    height: float
    blocks: list = field(default_factory=list)
    inner: list = field(default_factory=list)     # (points, kind, kwargs)
    elements: list = field(default_factory=list)
    invariants: list = field(default_factory=list)
    carries: list = field(default_factory=list)
    results: list = field(default_factory=list)
    v4_rows: list = field(default_factory=list)
    extra: object = None                          # per-variant body ornament
    verdicts: dict = field(default_factory=dict)


def _draw_body(s: Scene, spec: LoopSpec):
    for pts, kind, kwargs in spec.inner:
        cable(s, pts, kind, **kwargs)
    for b in spec.blocks:
        draw_block(s, b)


def _inlets(s: Scene, spec: LoopSpec):
    for e in spec.elements:
        boundary_inlet(s, IN_X, e.inlet_y, e.name, e.outer_type)
    for v in spec.invariants:
        boundary_inlet(s, IN_X, v.inlet_y, v.name, v.type)
    for c in spec.carries:
        boundary_inlet(s, IN_X, c.inlet_y, c.name, c.type)


def _outlet(s: Scene, y, name, type_name, kind="last"):
    s.circle(OUT_X, y, 5, PORT, PORT, 0)
    s.text(OUT_X + 12, y - 11, name, size=12.5, fill=INK_2)
    if type_name:
        s.text(OUT_X + 12 + 7.6 * len(name) + 7, y - 11, type_name, size=12.5, fill=FAINT)
    return (OUT_X, y)


def _lane_in(x_from_y, lane, wall_x, feed_x):
    """Left margin route: out of the inlet, across at the lane, into the wall."""
    return [(IN_X, x_from_y), (feed_x, x_from_y), (feed_x, lane), (wall_x, lane)]


FEED_BASE, FEED_STEP = 192, 24
DRAIN_BASE, DRAIN_STEP = 1058, -24


def _feeds(items):
    """Left-margin verticals. The topmost inlet takes the rightmost lane, which
    is what keeps a fan of inbound cables crossing-free in both orderings."""
    order = sorted(range(len(items)), key=lambda i: items[i][0])
    lanes = {}
    for rank, index in enumerate(order):
        lanes[index] = FEED_BASE + (len(items) - 1 - rank) * FEED_STEP
    return lanes


def _drains(items):
    order = sorted(range(len(items)), key=lambda i: items[i][0])
    lanes = {}
    for rank, index in enumerate(order):
        lanes[index] = DRAIN_BASE + (len(items) - 1 - rank) * DRAIN_STEP
    return lanes


def _inbound(spec: LoopSpec):
    """(inlet_y, lane_y, name) for everything that arrives from the left."""
    rows = []
    for e in spec.elements:
        rows.append((e.inlet_y, e.lane, e.name, e.outer_type, "bundle"))
    for v in spec.invariants:
        rows.append((v.inlet_y, v.lane, v.name, v.type, "solid"))
    for c in spec.carries:
        rows.append((c.inlet_y, c.lane, c.name, c.type, "solid"))
    return rows


def _outbound(spec: LoopSpec):
    rows = []
    for c in spec.carries:
        if c.exit_y is not None:
            rows.append((c.exit_y, c.exit_label, "solid"))
    for r in spec.results:
        rows.append((r.outlet_y, f"{r.name} {r.type}", "bundle" if r.kind == "pack" else "solid"))
    return rows


def _inner_run(s, start, target, mid_x, stroke=None):
    """From a wall crossing to the port that consumes it."""
    if abs(start[1] - target[1]) < 0.5:
        cable(s, [start, target], "solid", stroke=stroke)
    else:
        cable(s, [start, (mid_x, start[1]), (mid_x, target[1]), target], "solid", stroke=stroke)


def _outbound(spec: LoopSpec):
    """(wall y the value leaves at, outlet y, name, type, cable style)."""
    rows = []
    for c in spec.carries:
        if c.exit_y is not None:
            rows.append((c.source[1], c.exit_y, c.name, c.type, "solid"))
    for r in spec.results:
        rows.append((r.lane, r.outlet_y, r.name, r.type,
                     "bundle" if r.kind == "pack" else "solid"))
    return rows


def _drain_out(s: Scene, rows, wall_x, gap=12):
    lanes = _drains([(r[1], 0) for r in rows])
    for i, (wy, oy, name, type_name, style) in enumerate(rows):
        dot = _outlet(s, oy, name, type_name)
        cable(s, [(wall_x + gap, wy), (lanes[i], wy), (lanes[i], oy), dot], style,
              stroke=DONE if style == "solid" else None, arrow=False)


def render_v1(spec: LoopSpec) -> Scene:
    """The wall owns the unpacking AND the delay. Nothing crosses the body."""
    top = spec.body_top - 52
    s = Scene(SW, spec.height, f"Wall Tunnels — {spec.title}", top=max(0, top - 76))
    wall = draw_wall_region(s, REG_X, top, REG_W, spec.body_bottom + 52 - top)
    _inlets(s, spec)
    rows = _inbound(spec)
    lanes = _feeds([(r[0], r[1]) for r in rows])
    for i, (iy, lane, _n, _t, style) in enumerate(rows):
        cable(s, [(IN_X, iy), (lanes[i], iy), (lanes[i], lane), (wall["left"] - 12, lane)],
              style, arrow=False)
    seq = 0
    for e in spec.elements:
        mouth(s, wall["left"], e.lane, "index")
        _inner_run(s, (wall["left"] + 12, e.lane), e.target, e.mid or REG_X + 46 + 20 * seq)
        seq += 1
    for v in spec.invariants:
        mouth(s, wall["left"], v.lane, "pass")
        _inner_run(s, (wall["left"] + 12, v.lane), v.target, v.mid or REG_X + 46 + 20 * seq)
        seq += 1
    for c in spec.carries:
        mouth(s, wall["left"], c.lane, "carry-in", c.name)
        _inner_run(s, (wall["left"] + 12, c.lane), c.sink,
                   c.mid or REG_X + 46 + 20 * seq, stroke=TIME)
        seq += 1
        cable(s, [c.source, (wall["right"] - 12, c.source[1])], "solid", stroke=TIME, arrow=False)
        mouth(s, wall["right"], c.source[1], "carry-out", c.name, side="right")
    for r in spec.results:
        mouth(s, wall["right"], r.lane, "index" if r.kind == "pack" else "pass")
        if abs(r.source[1] - r.lane) < 0.5:
            cable(s, [r.source, (wall["right"] - 12, r.lane)], "solid", arrow=False)
        else:
            cable(s, [r.source, (REG_R - 50, r.source[1]), (REG_R - 50, r.lane),
                      (wall["right"] - 12, r.lane)], "solid", arrow=False)
    _draw_body(s, spec)
    _drain_out(s, _outbound(spec), wall["right"])
    if spec.extra:
        spec.extra(s, spec, "v1")
    chip(s, REG_X + 22, top + 18, "for", fill=SUNKEN, ink=INK, weight="700")
    return s


def render_v2(spec: LoopSpec) -> Scene:
    """The cable carries rate. The wall is unmarked; the return rail runs under
    the body and carries the shipped dotted paint plus its z-1 pill."""
    top = spec.body_top - 52
    s = Scene(SW, spec.height, f"Cardinality Cable — {spec.title}", top=max(0, top - 76))
    bottom = spec.body_bottom + 52
    draw_region(s, REG_X, top, REG_W, bottom - top, accent="#E0E0E0")
    _inlets(s, spec)
    rows = _inbound(spec)
    lanes = _feeds([(r[0], r[1]) for r in rows])
    for i, (iy, lane, _n, _t, style) in enumerate(rows):
        cable(s, [(IN_X, iy), (lanes[i], iy), (lanes[i], lane), (REG_X, lane)],
              style, arrow=False)
    seq = 0
    for e in spec.elements:
        s.line(REG_X, e.lane - 14, REG_X, e.lane + 14, INK, 1.6, layer="over")
        _inner_run(s, (REG_X, e.lane), e.target, e.mid or REG_X + 46 + 20 * seq)
        seq += 1
    for v in spec.invariants:
        _inner_run(s, (REG_X, v.lane), v.target, v.mid or REG_X + 46 + 20 * seq)
        seq += 1
    for c in spec.carries:
        _inner_run(s, (REG_X, c.lane), c.sink, c.branch_x)
        rail = [c.source, (REG_R - 34, c.source[1]), (REG_R - 34, c.rail_y),
                (c.branch_x, c.rail_y), (c.branch_x, c.sink[1]), c.sink]
        cable(s, rail, "delayed", pill="z⁻¹", pill_t=0.52, layer="under")
        s.circle(c.branch_x, c.sink[1], 3.6, TIME, None, 0, layer="over")
    for r in spec.results:
        if abs(r.source[1] - r.lane) < 0.5:
            cable(s, [r.source, (REG_R, r.lane)], "solid", arrow=False)
        else:
            cable(s, [r.source, (REG_R - 50, r.source[1]), (REG_R - 50, r.lane),
                      (REG_R, r.lane)], "solid", arrow=False)
        if r.kind == "pack":
            s.line(REG_R, r.lane - 14, REG_R, r.lane + 14, INK, 1.6, layer="over")
    _draw_body(s, spec)
    for c in spec.carries:
        if c.exit_y is not None:
            cable(s, [c.source, (REG_R, c.source[1])], "solid", arrow=False, stroke=DONE)
    _drain_out(s, _outbound(spec), REG_R, gap=0)
    if spec.extra:
        spec.extra(s, spec, "v2")
    chip(s, REG_X + 22, top + 18, "for", fill=SUNKEN, ink=INK, weight="700")
    return s


@dataclass
class V4Row:
    """One binding of the `for`, written as a line that owns wall ports.

    `iter`    the collection arrives, the element leaves into the body
    `carry`   seeded outside, rewritten each turn, read again next turn
    `collect` one value per turn is appended, and a collection leaves
    """
    text: str
    note: str
    kind: str
    inbound: list = field(default_factory=list)   # inlet y values landing here
    taps: list = field(default_factory=list)      # (branch_x, target port)
    source: tuple | None = None
    exit_y: float | None = None
    exit_name: str = ""
    exit_type: str = ""


def render_v4(spec: LoopSpec) -> Scene:
    """Every binding the `for` introduces is one named row on the region header,
    and that row owns the wall ports for it. A carry's row IS its return path."""
    rows: list[V4Row] = list(spec.v4_rows)
    head_h = 20 + 46 * len(rows)
    top = spec.body_top - 30 - head_h
    s = Scene(SW, spec.height, f"Header Contract — {spec.title}", top=max(0, top - 76))
    bottom = spec.body_bottom + 52
    s.rect(REG_X, top, REG_W, head_h, r=12, fill=SUNKEN, stroke="none", sw=0, layer="back")
    s.rect(REG_X, top, REG_W, bottom - top, r=12, fill="none", stroke="#E0E0E0",
           sw=1.4, layer="back")
    s.line(REG_X + 1, top + head_h, REG_R - 1, top + head_h, BORDER, layer="back")
    _inlets(s, spec)

    line_y = []
    for i, row in enumerate(rows):
        base = top + 20 + 46 * i
        s.text(REG_X + 54, base + 18, row.text, size=15, fill=INK)
        s.text(REG_X + 54 + 9.1 * len(row.text) + 16, base + 18, row.note,
               size=11.5, fill=FAINT, family=SANS)
        line_y.append(base + 34)

    inbound = []
    for i, row in enumerate(rows):
        for iy in row.inbound:
            kind = "bundle" if row.kind == "iter" else "solid"
            inbound.append((iy, line_y[i], kind))
    for v in spec.invariants:
        inbound.append((v.inlet_y, v.lane, "solid"))
    lanes = _feeds([(a, b) for a, b, _ in inbound])
    for i, (iy, ly, style) in enumerate(inbound):
        cable(s, [(IN_X, iy), (lanes[i], iy), (lanes[i], ly), (REG_X - 7, ly)],
              style, arrow=False)
    for v in spec.invariants:
        _inner_run(s, (REG_X, v.lane), v.target, v.mid or REG_X + 40)

    span = []
    for i, row in enumerate(rows):
        if row.kind == "iter":
            x1 = max([t[0] for t in row.taps], default=REG_X + 40)
            span.append((REG_X, x1))
        elif row.kind == "carry":
            span.append((REG_X, REG_R))
        else:
            span.append((REG_R - 150, REG_R))

    for i, row in enumerate(rows):
        ly = line_y[i]
        if row.kind in ("iter", "carry"):
            s.circle(REG_X, ly, 6, PORT, PORT, 0, layer="over")
        if row.kind in ("carry", "collect"):
            s.circle(REG_R, ly, 6, PORT, PORT, 0, layer="over")
        for tap in row.taps:
            bx, target = tap[0], tap[1]
            lane = tap[2] if len(tap) > 2 else None
            approach = tap[3] if len(tap) > 3 else None
            if lane is None:
                pts = [(bx, ly), (bx, target[1]), target]
            else:
                ax = approach if approach is not None else bx
                pts = [(bx, ly), (bx, lane), (ax, lane), (ax, target[1]), target]
            cable(s, pts, "solid")
            s.circle(bx, ly, 3.6, TIME if row.kind == "carry" else INK, None, 0, layer="over")
            for j in range(i + 1, len(rows)):
                if span[j][0] - 2 <= bx <= span[j][1] + 2:
                    hop(s, bx, line_y[j])
        for tap in row.taps:
            pass
        if row.kind == "iter" and row.taps:
            cable(s, [(REG_X, ly), (max(t[0] for t in row.taps), ly)], "solid", arrow=False)
        if row.kind == "carry":
            cable(s, [row.source, (REG_R - 56, row.source[1]), (REG_R - 56, ly),
                      (REG_R - 8, ly)], "solid", arrow=False)
            cable(s, [(REG_R - 68, ly), (REG_X + 10, ly)], "delayed", pill="z⁻¹", pill_t=0.5)
        if row.kind == "collect":
            cable(s, [row.source, (REG_R - 56, row.source[1]), (REG_R - 56, ly),
                      (REG_R - 8, ly)], "solid", arrow=False)

    _draw_body(s, spec)
    outs = [(line_y[i], row.exit_y, row.exit_name, row.exit_type,
             "bundle" if row.kind == "collect" else "solid")
            for i, row in enumerate(rows) if row.exit_y is not None]
    _drain_out(s, outs, REG_R, gap=7)
    if spec.extra:
        spec.extra(s, spec, "v4")
    return s


# ---------------------------------------------------------------------------
# The five stress loops, easy to hard. Each one is chosen for a specific way a
# loop grammar can fail, not for variety's sake.
# ---------------------------------------------------------------------------
def loop_1() -> LoopSpec:
    """Map with a loop-invariant input and a collection leaving. No carry at all."""
    shrink = Block("shrink", 520, 200, 280, "shrink()",
                   inputs=[Port("f", "Frame"), Port("size", "int")],
                   outputs=[Port("", "Thumb")])
    return LoopSpec(
        key="L1", title="map · invariant · packed result", height=470,
        code="thumbs = []\nfor f in frames:\n    thumbs.append(shrink(f, size))",
        hazards=["no carried state — the delay machinery must fall completely silent",
                 "`size` is loop-invariant and must NOT be unpacked",
                 "the result leaving is a collection, not a last value"],
        body_top=200, body_bottom=322, blocks=[shrink],
        elements=[Element("frames", "Frames", "Frame", shrink.inp(0), 255, 150)],
        invariants=[Invariant("size", "int", shrink.inp(1), 285, 392)],
        results=[Result("thumbs", "Thumbs", shrink.out(0), "pack", 270, 270)],
        v4_rows=[
            V4Row("for f in frames", "one frame per turn", "iter",
                  inbound=[150], taps=[(REG_X + 12, shrink.inp(0), 255, 520)]),
            V4Row("collect thumbs", "one appended per turn", "collect",
                  source=shrink.out(0), exit_y=270, exit_name="thumbs", exit_type="Thumbs"),
        ],
        verdicts={
            "v1": ("clean", "Four distinct glyphs already: index in, plain in, index out. "
                   "Correct, but a two-line loop has spent most of the vocabulary."),
            "v2": ("clean", "The strongest showing. The doubled rail thins at the wall and "
                   "thickens on the way out; `size` crosses with no mark at all; and because "
                   "nothing is carried there is simply no rail. Silence is free."),
            "v4": ("clean", "Two rows, and the invariant costs nothing — V4 only spends a row "
                   "on a name the `for` actually binds. Reads aloud correctly."),
        },
    )


def loop_2() -> LoopSpec:
    """One carry AND a collection, from the same body, at the same time."""
    merge = Block("merge", 470, 210, 250, "merge()",
                  inputs=[Port("pose", "Pose"), Port("other", "Pose")],
                  outputs=[Port("", "Pose")])
    score = Block("score", 790, 270, 190, "score()",
                  inputs=[Port("pose", "Pose")], outputs=[Port("", "float")])
    return LoopSpec(
        key="L2", title="reduce + collect from one body", height=520,
        code=("pose = estimate(frame, gain)\ntrail = []\nfor other in others:\n"
              "    pose = merge(pose, other)\n    trail.append(score(pose))"),
        hazards=["a carry and a packed result leave the same turn",
                 "the value `score` reads is THIS turn's, not last turn's",
                 "the carry's final value and the collection exit side by side"],
        body_top=210, body_bottom=362, blocks=[merge, score],
        inner=[([merge.out(0), (755, merge.out(0)[1]), (755, score.inp(0)[1]), score.inp(0)],
                "solid", {})],
        elements=[Element("others", "Poses", "Pose", merge.inp(1), 295, 400)],
        carries=[Carry("pose", "Pose", merge.inp(0), merge.out(0), 265, 150,
                       rail_y=406, branch_x=438, exit_y=246, exit_label="pose")],
        results=[Result("trail", "Floats", score.out(0), "pack", 325, 344)],
        v4_rows=[
            V4Row("for other in others", "one Pose per turn", "iter",
                  inbound=[400], taps=[(REG_X + 12, merge.inp(1))]),
            V4Row("carry pose", "seeded outside · rewritten each turn", "carry",
                  inbound=[150], taps=[(REG_X + 32, merge.inp(0))],
                  source=merge.out(0), exit_y=246, exit_name="pose", exit_type="Pose"),
            V4Row("collect trail", "one float appended per turn", "collect",
                  source=score.out(0), exit_y=344, exit_name="trail", exit_type="Floats"),
        ],
        verdicts={
            "v1": ("clean", "The ▼/▲ pair and the indexed exit sit on different walls and do "
                   "not compete. Nothing crosses the body — still the calmest interior."),
            "v2": ("strained", "The return rail now shares the region floor with the packed "
                   "exit, and the reader has to check whether `score` reads the pre- or "
                   "post-merge value. It reads correctly, but only after tracing."),
            "v4": ("clean", "Three rows, three sentences. `carry` and `collect` are visibly "
                   "different verbs, which is exactly the distinction the reader needs."),
        },
    )


def loop_3() -> LoopSpec:
    """Tuple unpacking, two zipped iterables, an index, an invariant, a loop-local."""
    rate = Block("rate", 430, 250, 230, "rate()",
                 inputs=[Port("box", "Box"), Port("gain", "float")],
                 outputs=[Port("", "float")])
    pick = Block("pick", 730, 210, 250, "pick()",
                 inputs=[Port("best", "Best"), Port("score", "float"),
                         Port("name", "str"), Port("i", "int")],
                 outputs=[Port("", "Best")])
    return LoopSpec(
        key="L3", title="enumerate · zip · tuple unpack", height=580,
        code=("best = None\nfor i, (name, box) in enumerate(zip(names, boxes)):\n"
              "    score = rate(box, gain)\n    best = pick(best, score, name, i)"),
        hazards=["four names bound by ONE `for`, from two collections plus a counter",
                 "`score` is a loop-local: written and read in the same turn, never carried",
                 "`gain` is invariant and `i` has no outer source at all"],
        body_top=210, body_bottom=410, blocks=[rate, pick],
        inner=[([rate.out(0), (695, rate.out(0)[1]), (695, pick.inp(1)[1]), pick.inp(1)],
                "solid", {})],
        elements=[
            Element("boxes", "Boxes", "Box", rate.inp(0), 305, 150),
            Element("names", "Names", "str", pick.inp(2), 416, 470, mid=706),
        ],
        invariants=[Invariant("gain", "float", rate.inp(1), 335, 388)],
        carries=[Carry("best", "Best", pick.inp(0), pick.out(0), 232, 96,
                       rail_y=442, branch_x=690, mid=690, exit_y=232, exit_label="best")],
        extra=lambda s, spec, v: _l3_counter(s, spec, v),
        v4_rows=[
            V4Row("for i, (name, box) in enumerate(zip(names, boxes))",
                  "three names, one binding", "iter", inbound=[150, 470],
                  taps=[(REG_X + 12, rate.inp(0)),
                        (REG_X + 12, pick.inp(2), 416, 706),
                        (REG_X + 12, pick.inp(3), 430, 674)]),
            V4Row("carry best", "seeded None · rewritten each turn", "carry",
                  inbound=[96], taps=[(REG_X + 36, pick.inp(0), 232, 690)],
                  source=pick.out(0), exit_y=232, exit_name="best", exit_type="Best"),
        ],
        verdicts={
            "v1": ("strained", "Two index mouths, one plain mouth, one carry pair and the "
                   "counter terminal — five marks on one wall, and NOTHING says the two "
                   "index mouths were zipped rather than iterated independently."),
            "v2": ("fails", "Nothing on a cable can express `zip`, and the counter `i` has no "
                   "source: with no marked boundary there is no object to ask for it. "
                   "Drawn here as an unexplained chip, which is the honest depiction."),
            "v4": ("clean", "The decisive case. One row carries the whole Python binding and "
                   "hands out three taps, so zip, the tuple unpack and the counter are one "
                   "statement instead of five unrelated marks."),
        },
    )


def _l3_counter(s: Scene, spec: LoopSpec, variant: str):
    """`i` comes from the loop itself. Where it can come FROM is the question."""
    pick = spec.blocks[1]
    target = pick.inp(3)
    if variant == "v1":
        bottom = spec.body_bottom + 52 - WALL / 2
        m = mouth(s, REG_X + 300, bottom, "counter")
        cable(s, [(m[0], m[1] - 12), (m[0], 474), (674, 474), (674, target[1]), target],
              "solid")
        caption(s, m[0] + 20, m[1] + 4, "the wall owns the counter", fill=MUTED)
    elif variant == "v2":
        chip(s, REG_X + 250, 456, "i = ?", fill="#FBF0EA", stroke=WARN, ink=WARN, weight="700")
        cable(s, [(REG_X + 316, 466), (674, 466), (674, target[1]), target],
              "ghost", stroke=WARN)
        caption(s, REG_X + 340, 452, "no marked boundary — nothing to ask for the counter",
                fill=WARN)


def loop_4() -> LoopSpec:
    """A guard that skips the rest of the turn, and an iterable that may be empty."""
    weight = Block("weight", 470, 286, 200, "weight()",
                   inputs=[Port("d", "Det")], outputs=[Port("", "float")])
    add = Block("add", 740, 286, 210, "add()",
                inputs=[Port("total", "float"), Port("w", "float")],
                outputs=[Port("", "float")])
    return LoopSpec(
        key="L4", title="continue · conditional collect · empty", height=600,
        code=("total = 0.0\nkept = []\nfor d in detections:\n"
              "    if d.score < thresh:\n        continue\n"
              "    total = total + weight(d)\n    kept.append(d)"),
        hazards=["a skipped turn writes NOTHING — the carry must survive untouched",
                 "the collection gets an element on some turns and not others",
                 "`detections == []` must leave total at 0.0 and kept empty"],
        body_top=232, body_bottom=452, blocks=[weight, add],
        inner=[([weight.out(0), (705, weight.out(0)[1]), (705, add.inp(1)[1]), add.inp(1)],
                "solid", {})],
        elements=[Element("detections", "Dets", "Det", weight.inp(0), 341, 176)],
        invariants=[Invariant("thresh", "float", (420, 258), 258, 120, mid=418)],
        carries=[Carry("total", "float", add.inp(0), add.out(0), 300, 500,
                       rail_y=484, branch_x=712, mid=712, exit_y=300, exit_label="total")],
        results=[Result("kept", "Dets", (430, 418), "pack", 418, 418)],
        v4_rows=[
            V4Row("for d in detections", "one Det per turn", "iter",
                  inbound=[176], taps=[(REG_X + 12, weight.inp(0), 341, 448)]),
            V4Row("carry total", "unchanged on a skipped turn", "carry",
                  inbound=[500], taps=[(REG_X + 34, add.inp(0), 300, 712)],
                  source=add.out(0), exit_y=300, exit_name="total", exit_type="float"),
            V4Row("collect kept", "appended only when the guard passes", "collect",
                  source=(430, 418), exit_y=418, exit_name="kept", exit_type="Dets"),
        ],
        extra=lambda s, spec, v: _l4_guard(s, spec, v),
        verdicts={
            "v1": ("strained", "LabVIEW's own answer is a conditional tunnel with an "
                   "\"if empty\" default, and it works — but the default value for an empty "
                   "run lives in a property dialog, not on the canvas. The picture cannot "
                   "tell you what `kept` is when nothing matched."),
            "v2": ("fails", "The rail is drawn as if it always carries a value. On a skipped "
                   "turn the same rail must silently mean \"unchanged\", and no line weight "
                   "or dash can say that. The empty case is invisible."),
            "v4": ("clean", "The two notes are the answer: `unchanged on a skipped turn` and "
                   "`appended only when the guard passes` are properties of the BINDING, and "
                   "the binding is the thing V4 draws. Nothing else has a place to put them."),
        },
    )


def _l4_guard(s: Scene, spec: LoopSpec, variant: str):
    """The guard is SystemSketch's shipped Branch region, not a new Block."""
    x0, y0, x1, y1 = 420, 258, 970, 452
    s.rect(x0, y0, x1 - x0, y1 - y0, r=10, fill="#FBFAF7", stroke="#D9CFC0",
           sw=1.3, dash="7 5", layer="back")
    s.text(x0 + 14, y0 + 22, "if d.score ≥ thresh", size=13.5, fill="#8A6A3A")
    s.circle(420, 258, 4, PORT, PORT, 0, layer="over")
    s.circle(430, 418, 4, PORT, PORT, 0, layer="over")
    caption(s, 444, 408, "kept ← d, only on a passing turn", fill=MUTED)
    if variant == "v4":
        caption(s, x0 + 14, y1 + 22,
                "empty `detections` · total leaves as its seed, kept leaves empty — both stated on the rows",
                fill=DONE)
    elif variant == "v1":
        caption(s, x0 + 14, y1 + 22,
                "empty `detections` · the tunnel's default is real, but it is set in a dialog, not drawn",
                fill=WARN)
    else:
        caption(s, x0 + 14, y1 + 22,
                "empty `detections` · nothing on the canvas says what leaves",
                fill=WARN)


# ---------------------------------------------------------------------------
# L5 — nesting, `break`, and `for … else`. Drawn by hand for each finalist,
# because nesting is exactly where the three grammars stop agreeing.
# ---------------------------------------------------------------------------
L5_CODE = ("misses = 0\nfor track in tracks:\n    for det in track.dets:\n"
           "        if match(det, query):\n            hit = det\n            break\n"
           "    else:\n        misses = misses + 1")
L5_HAZARDS = [
    "an inner iterable that is an ATTRIBUTE of the outer element",
    "`query` is invariant across BOTH boundaries",
    "`break` leaves the inner scope early; `for … else` runs only when it did not",
    "`hit` is written inside the inner loop and read outside both",
]
L5_H = 700


def _l5_body():
    match = Block("match", 540, 286, 240, "match()",
                  inputs=[Port("det", "Det"), Port("query", "Query")],
                  outputs=[Port("", "bool")])
    bump = Block("bump", 560, 500, 220, "bump()",
                 inputs=[Port("misses", "int")], outputs=[Port("", "int")])
    return match, bump


def _l5_inlets(s):
    q = boundary_inlet(s, IN_X, 120, "query", "Query")
    tr = boundary_inlet(s, IN_X, 196, "tracks", "Tracks")
    ms = boundary_inlet(s, IN_X, 636, "misses", "int")
    return q, tr, ms


def _l5_else(s, y, text, tone):
    s.rect(520, 466, 300, 126, r=10, fill="#FBFAF7", stroke="#D9CFC0", sw=1.3,
           dash="7 5", layer="back")
    s.text(534, 488, "else · no break happened", size=13, fill="#8A6A3A")
    caption(s, 534, y, text, fill=tone)


def scene_l5_v1() -> Scene:
    s = Scene(SW, L5_H, "Wall Tunnels — nested, break, else")
    outer = draw_wall_region(s, 300, 168, 690, 472)
    inner = draw_wall_region(s, 460, 240, 460, 200, tint="#E7E4DE", edge="#CFCBC3")
    match, bump = _l5_body()
    q, tr, ms = _l5_inlets(s)
    cable(s, [tr, (150, 196), (150, 300), (outer["left"] - 12, 300)], "bundle", arrow=False)
    cable(s, [q, (124, 120), (124, 210), (outer["left"] - 12, 210)], "solid", arrow=False)
    cable(s, [ms, (176, 636), (176, 555), (outer["left"] - 12, 555)], "solid", arrow=False)
    mouth(s, outer["left"], 300, "index")
    mouth(s, outer["left"], 210, "pass")
    mouth(s, outer["left"], 555, "carry-in", "misses")
    cable(s, [(outer["left"] + 12, 300), (372, 300), (372, 341),
              (inner["left"] - 12, 341)], "bundle", arrow=False)
    chip(s, 386, 289, ".dets", fill=SURFACE, ink=INK_2)
    cable(s, [(outer["left"] + 12, 210), (410, 210), (410, 371),
              (inner["left"] - 12, 371)], "solid", arrow=False)
    mouth(s, inner["left"], 341, "index")
    mouth(s, inner["left"], 371, "pass")
    cable(s, [(inner["left"] + 12, 341), match.inp(0)], "solid")
    cable(s, [(inner["left"] + 12, 371), match.inp(1)], "solid")
    cable(s, [match.out(0), (inner["right"] - 12, match.out(0)[1])], "solid", arrow=False)
    mouth(s, inner["right"], match.out(0)[1], "counter")
    s.text(inner["right"], match.out(0)[1] + 4.6, "⊘", size=13, fill=INK,
           anchor="middle", weight="700", layer="over")
    caption(s, inner["right"] + 18, match.out(0)[1] - 12, "conditional terminal · stop if true",
            fill=INK_2)
    cable(s, [(500, 341), (500, 412), (inner["right"] - 12, 412)], "solid", arrow=False)
    s.circle(500, 341, 3.6, INK, None, 0, layer="over")
    mouth(s, inner["right"], 412, "carry-out", "hit", side="right")
    cable(s, [(inner["right"] + 12, 412), (952, 412), (952, 300),
              (outer["right"] - 12, 300)], "solid", arrow=False)
    mouth(s, outer["right"], 300, "pass")
    cable(s, [(outer["left"] + 12, 555), bump.inp(0)], "solid", stroke=TIME)
    cable(s, [bump.out(0), (outer["right"] - 12, 555)], "solid", stroke=TIME, arrow=False)
    mouth(s, outer["right"], 555, "carry-out", "misses", side="right")
    _l5_else(s, 610, "no wall marks the `else` path — the band above is drawn, not modelled",
             WARN)
    draw_block(s, match)
    draw_block(s, bump)
    for wy, oy, name, type_name in ((300, 300, "hit", "Det"), (555, 596, "misses", "int")):
        dot = _outlet(s, oy, name, type_name)
        cable(s, [(outer["right"] + 12, wy), (1050, wy), (1050, oy), dot], "solid",
              stroke=DONE, arrow=False)
    chip(s, 316, 186, "for", fill=SUNKEN, ink=INK, weight="700")
    chip(s, 476, 256, "for", fill="#F2EFE9", ink=INK, weight="700")
    return s


def scene_l5_v2() -> Scene:
    s = Scene(SW, L5_H, "Cardinality Cable — nested, break, else")
    draw_region(s, 300, 168, 690, 472, accent="#E0E0E0")
    draw_region(s, 460, 240, 460, 200, accent="#D8D8D8", fill="#F5F5F5")
    match, bump = _l5_body()
    q, tr, ms = _l5_inlets(s)
    cable(s, [tr, (150, 196), (150, 300), (300, 300)], "bundle", arrow=False)
    s.line(300, 286, 300, 314, INK, 1.6, layer="over")
    cable(s, [(300, 300), (372, 300)], "solid", arrow=False)
    chip(s, 372, 289, ".dets", fill=SURFACE, ink=INK_2)
    cable(s, [(432, 300), (446, 300), (446, 341), (460, 341)], "bundle", arrow=False)
    s.line(460, 327, 460, 355, INK, 1.6, layer="over")
    cable(s, [(460, 341), match.inp(0)], "solid")
    cable(s, [q, (124, 120), (124, 371), (460, 371)], "solid", arrow=False)
    cable(s, [(460, 371), match.inp(1)], "solid")
    cable(s, [ms, (176, 636), (176, 555), (300, 555)], "solid", arrow=False)
    cable(s, [(300, 555), bump.inp(0)], "solid")
    rail = [bump.out(0), (952, 555), (952, 612), (542, 612), (542, 555), bump.inp(0)]
    cable(s, rail, "delayed", pill="z⁻¹", pill_t=0.5, layer="under")
    s.circle(542, 555, 3.6, TIME, None, 0, layer="over")
    cable(s, [(500, 341), (500, 412), (952, 412), (952, 300), (990, 300)], "solid",
          arrow=False)
    s.circle(500, 341, 3.6, INK, None, 0, layer="over")
    chip(s, 806, 344, "break ?", fill="#FBF0EA", stroke=WARN, ink=WARN, weight="700")
    cable(s, [match.out(0), (806, match.out(0)[1])], "ghost", stroke=WARN)
    caption(s, 806, 336, "a bool with nowhere to land", fill=WARN)
    _l5_else(s, 610, "no scope object exists to hold `else` either", WARN)
    draw_block(s, match)
    draw_block(s, bump)
    cable(s, [bump.out(0), (990, 555)], "solid", stroke=DONE, arrow=False)
    for wy, oy, name, type_name in ((300, 300, "hit", "Det"), (555, 596, "misses", "int")):
        dot = _outlet(s, oy, name, type_name)
        cable(s, [(990, wy), (1050, wy), (1050, oy), dot], "solid", stroke=DONE, arrow=False)
    chip(s, 316, 186, "for", fill=SUNKEN, ink=INK, weight="700")
    return s


def scene_l5_v4() -> Scene:
    """Six rows, six sentences. `break` and `else` are simply two more of them."""
    s = Scene(SW, 800, "Header Contract — nested, break, else")
    o_x, o_y, o_w, o_h = 300, 60, 690, 700
    i_x, i_y, i_w, i_h = 460, 250, 460, 310
    head = 20 + 46 * 3
    s.rect(o_x, o_y, o_w, head, r=12, fill=SUNKEN, stroke="none", sw=0, layer="back")
    s.rect(o_x, o_y, o_w, o_h, r=12, fill="none", stroke="#E0E0E0", sw=1.4, layer="back")
    s.line(o_x + 1, o_y + head, o_x + o_w - 1, o_y + head, BORDER, layer="back")
    s.rect(i_x, i_y, i_w, head, r=10, fill="#F1F1F1", stroke="none", sw=0, layer="back")
    s.rect(i_x, i_y, i_w, i_h, r=10, fill="none", stroke="#D6D6D6", sw=1.3, layer="back")
    s.line(i_x + 1, i_y + head, i_x + i_w - 1, i_y + head, BORDER, layer="back")

    match = Block("match", 540, 424, 240, "match()",
                  inputs=[Port("det", "Det"), Port("query", "Query")],
                  outputs=[Port("", "bool")])
    bump = Block("bump", 340, 600, 200, "bump()",
                 inputs=[Port("misses", "int")], outputs=[Port("", "int")])
    q = boundary_inlet(s, IN_X, 700, "query", "Query")
    tr = boundary_inlet(s, IN_X, 196, "tracks", "Tracks")
    ms = boundary_inlet(s, IN_X, 130, "misses", "int")

    ro = [("for track in tracks", "one Track per turn", o_y + 54),
          ("carry misses", "unchanged unless the else row fires", o_y + 100),
          ("else misses = misses + 1", "runs only when no break happened", o_y + 146)]
    ri = [("for det in track.dets", "the outer element's own attribute", i_y + 54),
          ("break when match(det, query)", "leaves this scope early", i_y + 100),
          ("bind hit = det", "the turn that broke", i_y + 146)]
    for text, note, ly in ro:
        s.text(o_x + 22, ly - 16, text, size=15, fill=INK)
        s.text(o_x + 22 + 9.1 * len(text) + 16, ly - 16, note, size=11.5, fill=FAINT, family=SANS)
    for text, note, ly in ri:
        s.text(i_x + 20, ly - 16, text, size=14, fill=INK)
        s.text(i_x + 20 + 8.5 * len(text) + 14, ly - 16, note, size=11, fill=FAINT, family=SANS)
    y_track, y_carry, y_else = ro[0][2], ro[1][2], ro[2][2]
    y_det, y_break, y_hit = ri[0][2], ri[1][2], ri[2][2]

    cable(s, [tr, (150, 196), (150, y_track), (o_x - 7, y_track)], "bundle", arrow=False)
    cable(s, [ms, (176, 130), (176, y_carry), (o_x - 7, y_carry)], "solid", arrow=False)
    cable(s, [(o_x, y_track), (416, y_track), (416, y_det), (i_x - 7, y_det)],
          "bundle", arrow=False)
    cable(s, [(i_x, y_det), (508, y_det), (508, match.inp(0)[1]), match.inp(0)], "solid")
    cable(s, [match.out(0), (868, match.out(0)[1]), (868, y_break), (i_x + i_w - 8, y_break)],
          "solid", arrow=False)
    cable(s, [(508, y_det), (508, y_hit), (i_x + i_w - 8, y_hit)], "solid", arrow=False)
    s.circle(508, y_det, 3.6, INK, None, 0, layer="over")
    cable(s, [(i_x + i_w + 7, y_hit), (952, y_hit), (952, y_track), (o_x + o_w - 8, y_track)],
          "solid", arrow=False)
    hop(s, 952, y_carry)
    cable(s, [q, (150, 700), (150, match.inp(1)[1]), match.inp(1)], "solid")
    hop(s, 316, match.inp(1)[1])
    cable(s, [(o_x + 16, y_else), (316, y_else), (316, bump.inp(0)[1]), bump.inp(0)], "solid")
    s.circle(o_x + 16, y_else, 3.6, TIME, None, 0, layer="over")
    cable(s, [bump.out(0), (912, bump.out(0)[1]), (912, y_carry), (o_x + o_w - 8, y_carry)],
          "solid", arrow=False)
    cable(s, [(o_x + o_w - 68, y_carry), (o_x + 10, y_carry)], "delayed", pill="z⁻¹", pill_t=0.5)
    for dot in ((o_x, y_track), (o_x, y_carry), (o_x + o_w, y_track), (o_x + o_w, y_carry)):
        s.circle(dot[0], dot[1], 6, PORT, PORT, 0, layer="over")
    for dot in ((i_x, y_det), (i_x + i_w, y_break), (i_x + i_w, y_hit)):
        s.circle(dot[0], dot[1], 5.4, PORT, PORT, 0, layer="over")
    draw_block(s, match)
    draw_block(s, bump)
    for wy, oy, name, type_name in ((y_track, y_track, "hit", "Det"),
                                    (y_carry, 740, "misses", "int")):
        dot = _outlet(s, oy, name, type_name)
        cable(s, [(o_x + o_w + 7, wy), (1050, wy), (1050, oy), dot], "solid",
              stroke=DONE, arrow=False)
    caption(s, 340, 720, "`query` crosses both scopes unmarked — an invariant binds nothing",
            fill=MUTED)
    return s


L5_VERDICTS = {
    "v1": ("strained", "Nesting is LabVIEW's home ground and it holds: two walls, two sets of "
           "mouths, a real conditional terminal for `break`. The costs are that `query` pays a "
           "mark at every wall it crosses for changing nothing, and that `for … else` has no "
           "terminal at all — the band around bump() is drawn here, not modelled."),
    "v2": ("fails", "Two rate changes on one path (`Tracks → Track → Dets → Det`) are legible, "
           "and an invariant crossing two scopes costs nothing — genuinely V2's best trait. But "
           "`break` produces a bool with nowhere to land and `else` has no object to attach to. "
           "Both are drawn in warning colour because that is the truth."),
    "v4": ("clean", "Six rows, six sentences, and `break` and `else` are simply two more of "
           "them. The inner header names `track.dets` — the outer element's own attribute — "
           "which no mark on a wall or a cable can say. `query` crosses both scopes unmarked "
           "because it binds nothing."),
}


LOOPS = [loop_1, loop_2, loop_3, loop_4]
FINALIST_RENDER = {"v1": render_v1, "v2": render_v2, "v4": render_v4}
L5_RENDER = {"v1": scene_l5_v1, "v2": scene_l5_v2, "v4": scene_l5_v4}


def stress_scene(variant: str, loop_index: int) -> tuple[Scene, LoopSpec | None]:
    if loop_index == 4:
        return L5_RENDER[variant](), None
    spec = LOOPS[loop_index]()
    return FINALIST_RENDER[variant](spec), spec


# ---------------------------------------------------------------------------
# Criteria, fixed BEFORE any variant was scored.
# ---------------------------------------------------------------------------
CRITERIA = [
    ("iterable", "Iterable vs element is unmistakable", 18,
     "Can a reader see that `others` is a collection and `other` is one element, "
     "without being told the convention first?"),
    ("timing", "Cross-iteration timing is unmistakable", 18,
     "Does the picture say \"available next turn, not this one\" — the single thing "
     "the source code says with a re-assignment and nothing else?"),
    ("scale", "Survives the hard semantics", 15,
     "Tuple unpacking, several loop variables, filter/continue, an empty iterable, "
     "nesting, break and for…else."),
    ("calm", "Ink economy — a simple loop stays simple", 15,
     "Marks added per loop, and whether the return path becomes the bundle of "
     "parallel arrows Zach already rejected."),
    ("dataflow", "The dataflow reading survives", 12,
     "Every value still travels a visible path. Nothing teleports between two "
     "marks the reader has to pair up by name."),
    ("seams", "Fits SystemSketch's shipped seams", 12,
     "Block ports with inner/outer faces, the `temporal` StyleProp and its z⁻¹ "
     "pill, Branch's region-as-port-host, stock tldraw. Invention cost."),
    ("noblock", "Adds no node", 10,
     "Hard constraint. Anything that introduces a Block, gate, pill node or state "
     "node scores zero and is out."),
]

SCORES = {
    "v1": {"iterable": 8, "timing": 7, "scale": 9, "calm": 10, "dataflow": 5,
           "seams": 7, "noblock": 10},
    "v2": {"iterable": 7, "timing": 9, "scale": 6, "calm": 7, "dataflow": 10,
           "seams": 10, "noblock": 10},
    "v3": {"iterable": 8, "timing": 5, "scale": 5, "calm": 10, "dataflow": 3,
           "seams": 8, "noblock": 10},
    "v4": {"iterable": 10, "timing": 8, "scale": 8, "calm": 8, "dataflow": 9,
           "seams": 9, "noblock": 10},
    "v5": {"iterable": 6, "timing": 9, "scale": 3, "calm": 10, "dataflow": 10,
           "seams": 9, "noblock": 10},
}


def weighted(key: str) -> float:
    return round(sum(SCORES[key][c] * w for c, _n, w, _d in CRITERIA) / 10, 1)


VARIANTS = {
    "v1": dict(
        name="Wall Tunnels",
        one_line="The boundary owns both the unpacking and the delay. Nothing crosses the body.",
        owner_unpack="the wall", owner_delay="the wall",
        prior="LabVIEW auto-indexing tunnels and shift registers; Houdini's Block Begin/End; "
              "Blender's Repeat Zone.",
        body=[
            "A cable does not simply pass through the loop's border — it goes through a "
            "<em>mouth</em> on it, and the mouth says what the crossing does. "
            "<code>[ ]</code> means the collection outside arrives as one element inside. "
            "A plain filled square means the value is the same every turn.",
            "The carry is a matched <strong>pair</strong> of mouths — ▼ on the left wall, "
            "▲ on the right, at the same height, wearing the same name. The right one "
            "swallows the body's value at the end of a turn; the left one hands it back at "
            "the start of the next. <strong>No cable is drawn between them</strong>, which "
            "is why the interior stays completely clean, and why the loop's final value "
            "leaves through that same right mouth once the loop is over.",
            "The iteration counter is a terminal on the bottom wall — Zach's \"iterator "
            "port that emits the iterator value\", exactly where LabVIEW puts <code>i</code>.",
        ],
        costs="The carry has no visible path. Two marks have to be paired up by name and "
              "alignment, which is the one thing Zach's own note argues against — he wrote "
              "that he prefers <em>the z⁻¹ line that goes straight into the port</em>.",
    ),
    "v2": dict(
        name="Cardinality Cable",
        one_line="The cable carries the rate. The wall is unmarked; a collection is a doubled rail that thins where it enters.",
        owner_unpack="the cable", owner_delay="the cable",
        prior="LabVIEW draws array wires thicker than scalar wires; Grasshopper's data trees; "
              "Blender field wires; ER-diagram crow's-foot cardinality.",
        body=[
            "A cable carrying a collection is drawn as two rails. Where it enters the loop "
            "it becomes a single rail. <strong>That transition is the unpacking</strong> — "
            "no glyph, no mouth, nothing to learn beyond \"thick means many\". "
            "On the way out, single→double is a collection being built; single→single is a "
            "last value.",
            "The carry is an ordinary SystemSketch cable with <code>temporal: delayed</code> "
            "— the dotted paint and the <code>z⁻¹</code> pill that already ship — routed "
            "beneath the body so it reads as a return rail rather than a competing arrow.",
            "Nothing else is added. This is the only variant that needs no new object at "
            "all: one line weight, and machinery the app already has.",
        ],
        costs="Nothing here can express <code>zip</code>, tuple unpacking, or where the "
              "iteration counter comes from — with an unmarked boundary there is no object "
              "to ask. A second carried value is a second rail across the floor.",
    ),
    "v3": dict(
        name="Binding Ports",
        one_line="Python's own ownership: the target name makes the element, so the consuming port carries the mark.",
        owner_unpack="the consuming port", owner_delay="the port pair",
        prior="Python's own semantics (`for X in Y` binds X); n8n's run-once-per-item; "
              "Verilog's implicit `always` sensitivity.",
        body=[
            "Nothing is added to the wall and nothing is added to a cable. The body block's "
            "own port row says what it is: <code>[·] other</code> means this port takes one "
            "element per turn from whatever collection feeds it, and <code>↺ pose</code> "
            "pairs an input with the output that rewrites it.",
            "This is the least ink of all five. The diagram of a loop body is the diagram of "
            "a straight-line body plus two small badges.",
        ],
        costs="The recurrence has no path at all — the reader must pair two badges by name. "
              "That is a bigger version of V1's problem and it fails outright once a carried "
              "value spans two blocks. Scored honestly, it is last.",
    ),
    "v4": dict(
        name="Header Contract",
        one_line="Every name the `for` binds is one row on the region header, and that row owns the wall ports for it.",
        owner_unpack="the wall, named on a header row",
        owner_delay="the row itself — the return line runs along it",
        prior="LabVIEW's tunnel, given a name; Houdini's Block Begin parameters; MLIR's "
              "`scf.for` iter_args; Zach's own Branch-authoring lean toward inspector lists "
              "with control ports derived from the arm code.",
        body=[
            "The header is not a title and not decorative source. It is a list of the "
            "loop's <em>bindings</em>, one per line, and each line owns a real port on the "
            "wall. <code>for other in others</code> gets a port whose outer face is the "
            "collection and whose inner face is the element — <strong>which is exactly "
            "SystemSketch's shipped inner-face model: one dot on screen, two identities</strong>.",
            "A <code>carry</code> row is drawn as one horizontal line running the width of "
            "the header: solid where it leaves the body, dotted with the <code>z⁻¹</code> "
            "pill through the middle, solid again into the port. Zach's preferred "
            "solid-before / dotted-after treatment, and the recurrence never enters the "
            "body area at all.",
            "Because the row is a sentence, it can carry things no mark can: "
            "<code>for i, (name, box) in enumerate(zip(names, boxes))</code> is one row "
            "handing out three taps. <code>break when …</code> and <code>else …</code> are "
            "simply two more rows.",
        ],
        costs="The header grows a small layout language, and a loop with four bindings has "
              "a four-line header. An invariant costs nothing — it binds no name, so it "
              "gets no row and crosses unmarked.",
    ),
    "v5": dict(
        name="Bare Cycle",
        one_line="No scope is drawn at all. A dataflow graph that contains a cycle already IS a loop.",
        owner_unpack="the cable", owner_delay="the cable",
        prior="Synchronous dataflow (Lustre, Signal); Simulink's unit-delay feedback; "
              "LabVIEW's Feedback Node, which is the shift register with the loop border "
              "taken away.",
        body=[
            "One solid cable from <code>others</code> to <code>merge.other</code> with a "
            "cardinality tick near its head. One <code>temporal: delayed</code> cable from "
            "the output back to the input, closing the cycle. That is the entire notation.",
            "The tint is <em>derived</em> — the app finds the strongly-connected component "
            "and washes it — so the loop's extent is a consequence of the wiring rather than "
            "something the author drew. The live iteration counter rides on that tint, which "
            "answers Zach's \"show the iteration number\" idea for while-loops too.",
        ],
        costs="With no scope object there is nowhere to put `break`, `for…else`, or an empty "
              "iterable's default, and two loops sharing a block collapse into one blob. It "
              "is the right answer for simple loops and the wrong one for the hard suite — "
              "which is precisely why it is in the set rather than the finalists.",
    ),
}


# ---------------------------------------------------------------------------
# Prior art. LabVIEW is the anchor Zach pointed at; the rest place it.
# ---------------------------------------------------------------------------
PRIOR_ART = [
    ("LabVIEW", "For Loop / While Loop structure",
     "The border IS the loop — no node is added. A wire crossing it passes through a "
     "<em>tunnel</em>; an auto-indexing tunnel turns an array into one element per "
     "iteration. A <em>shift register</em> is a matched pair of border terminals that "
     "hands a value from one iteration to the next. <code>N</code> sets the count, "
     "<code>i</code> emits the current index.",
     "V1, and the wall half of V4"),
    ("Simulink", "Unit Delay (1/z) and feedback",
     "Iteration is implicit in the graph: a cycle plus a <code>1/z</code> block is a loop. "
     "The delay is a NODE, which is the part SystemSketch should not copy.",
     "V5 — but with the delay moved onto the cable instead of into a block"),
    ("Houdini", "For-Each Block Begin / Block End",
     "A pair of markers scopes the iteration and the Begin node's parameters name what "
     "is iterated over. Closest existing thing to a named binding on a boundary.",
     "V4"),
    ("Blender Geometry Nodes", "Repeat Zone / For Each Element Zone",
     "A zone with an input and an output frame; state carried between iterations is "
     "declared as named zone items rather than wired around.",
     "V4"),
    ("MLIR", "<code>scf.for</code> with <code>iter_args</code>",
     "The carried values are written as named arguments of the loop and yielded at its "
     "end. The textual form of exactly the contract V4 draws.",
     "V4"),
    ("Grasshopper", "Implicit list iteration and data trees",
     "No loop region at all. A component receiving a list simply runs once per item, and "
     "wire thickness/tree structure carries the cardinality.",
     "V2, V5"),
    ("n8n", "Runs once per item",
     "The consuming node's own semantics decide that it processes items one at a time.",
     "V3"),
]


def measure() -> dict:
    package = json.loads((REPO / "package.json").read_text())
    model = (REPO / "src" / "blocks" / "connections" / "connectionModel.ts").read_text()
    branch = list((REPO / "src" / "branch").glob("*.ts*"))
    scenes = len(MOTIVATING) + 3 * 5
    return {
        "tldraw": package["dependencies"]["tldraw"],
        "temporal_kinds": model.split("CONNECTION_TEMPORAL_KINDS = [")[1].split("]")[0].strip(),
        "has_pill": "PILL_POSITION_DEFAULT" in model,
        "has_inner_face": "PortFace = 'outer' | 'inner'" in model,
        "branch_modules": len(branch),
        "scenes": scenes,
        "commit": subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                                 capture_output=True, text=True).stdout.strip(),
    }


# ---------------------------------------------------------------------------
# The report
# ---------------------------------------------------------------------------
def data_uri(path: Path) -> str:
    import base64
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


CSS = """
:root{--bg:#FCFCFC;--panel:#fff;--ink:#1B1B1B;--muted:#5E5E5E;--faint:#8C8C8C;
--line:#E6E6E6;--soft:#F5F5F4;--accent:#6B4FBF;--good:#2E7D5B;--warn:#B4531F;
--code:#F6F6F4;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15.5px/1.62 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:56px 28px 120px}
h1{font-size:34px;line-height:1.16;letter-spacing:-.02em;margin:0 0 10px;font-weight:650}
h2{font-size:23px;letter-spacing:-.015em;margin:64px 0 12px;font-weight:640;
padding-top:22px;border-top:1px solid var(--line)}
h3{font-size:17.5px;margin:34px 0 8px;font-weight:640;letter-spacing:-.01em}
p{margin:0 0 13px;max-width:78ch}
.lede{font-size:18px;color:var(--muted);max-width:76ch}
.eyebrow{font:600 11.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.13em;
text-transform:uppercase;color:var(--faint);margin:0 0 14px}
code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.90em;
background:var(--code);padding:1px 5px;border-radius:4px}
pre{background:var(--code);border:1px solid var(--line);border-radius:9px;
padding:14px 16px;overflow-x:auto;margin:0 0 16px;
font:13px/1.62 ui-monospace,"SF Mono",Menlo,Consolas,monospace}
pre code{background:none;padding:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;
padding:22px 24px;margin:0 0 22px}
.fig{background:var(--panel);border:1px solid var(--line);border-radius:12px;
padding:6px;margin:14px 0;overflow:hidden}
.fig svg{display:block;width:100%;height:auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:900px){.grid2,.grid3{grid-template-columns:1fr}}
table{border-collapse:collapse;width:100%;font-size:14px;margin:0 0 18px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);
font-weight:600}
td.num{text-align:right;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
.tag{display:inline-block;font:600 11px/1 ui-monospace,Menlo,monospace;
padding:5px 9px;border-radius:20px;border:1px solid var(--line);color:var(--muted);
background:var(--soft);white-space:nowrap}
.tag.win{color:var(--good);border-color:#BFE0CE;background:#F1F8F4}
.tag.mid{color:#8A6A00;border-color:#E7DBB2;background:#FBF7EC}
.tag.bad{color:var(--warn);border-color:#E9CDBC;background:#FBF2EC}
.tag.rank{color:var(--accent);border-color:#D6CCF0;background:#F4F1FB}
.kv{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px}
.rule{color:var(--muted);font-size:14.5px}
.note{border-left:3px solid var(--accent);padding:2px 0 2px 15px;color:var(--muted);
margin:16px 0;max-width:74ch}
.note.warn{border-color:var(--warn)}
.note.good{border-color:var(--good)}
img.shot{width:100%;border:1px solid var(--line);border-radius:9px;display:block}
figcaption{font-size:12.5px;color:var(--faint);margin-top:7px}
ul{margin:0 0 14px;padding-left:20px;max-width:76ch}
li{margin:0 0 6px}
.foot{margin-top:70px;padding-top:20px;border-top:1px solid var(--line);
font-size:13px;color:var(--faint)}
.score{font:650 26px/1 ui-monospace,Menlo,monospace;letter-spacing:-.02em}
.hdr{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:2px}
"""


def _fig(scene: Scene, caption_text: str = "") -> str:
    cap = f'<figcaption>{caption_text}</figcaption>' if caption_text else ""
    return f'<figure class="fig" style="margin:14px 0">{scene.svg()}</figure>{cap}'


def _verdict_tag(kind: str) -> str:
    return {"clean": '<span class="tag win">holds</span>',
            "strained": '<span class="tag mid">strained</span>',
            "fails": '<span class="tag bad">fails</span>'}[kind]


def _html_intro(facts: dict) -> str:
    out = [f"<style>{CSS}</style><div class='wrap'>"]
    out.append(f"""
<p class="eyebrow">SystemSketch · loop grammar · exploration only</p>
<h1>Five loop grammars, from LabVIEW's answer outward</h1>
<p class="lede">The previous ten were rejected in full. This pass throws them away and
starts from the question underneath: <strong>who owns the unpacking, and who owns the
delay?</strong> Every variant here answers that differently, and
<strong>not one of them adds a Block, a gate, a state pill or any other node.</strong>
Nothing in <code>src/</code> was changed.</p>
<div class="kv">
  <span class="tag">tldraw {facts['tldraw']} · stock</span>
  <span class="tag">{facts['scenes']} diagrams</span>
  <span class="tag">5 variants · 3 finalists · 5 stress loops</span>
  <span class="tag">repo at {facts['commit']}</span>
</div>""")

    out.append("""
<h2>The model, before any picture</h2>
<p>A <code>for</code> statement puts exactly four new facts into a dataflow graph. Naming
them first is what stops a grammar from being decoration.</p>
<table>
<tr><th style="width:56px">#</th><th>Fact</th><th>What it forces the drawing to say</th></tr>
<tr><td class="num">F1</td><td><strong>A scope with a repeat count</strong></td>
<td>Some sub-graph runs N times while everything around it runs once.</td></tr>
<tr><td class="num">F2</td><td><strong>A rate change on the way in</strong></td>
<td>Outside, <code>others</code> is one value of type <code>Poses</code>. Inside, <code>other</code>
is one <code>Pose</code> <em>per turn</em>. Something distributes one collection over time.</td></tr>
<tr><td class="num">F3</td><td><strong>A rate change on the way out</strong></td>
<td>Per-turn becomes once again — either the last turn's value survives, or every turn's
value is collected.</td></tr>
<tr><td class="num">F4</td><td><strong>A one-turn delay on anything read and written</strong></td>
<td><code>pose = merge(pose, other)</code>. Turn <em>i</em>'s write is turn <em>i+1</em>'s read.
Turn 0 reads the seed from outside. This is the only genuinely temporal fact, and it is
exactly <code>z⁻¹</code>.</td></tr>
</table>
<p>Two ownership questions fall straight out of F2 and F4, and prior art has already
answered them in every possible way:</p>
<table>
<tr><th>Question</th><th>Answer A</th><th>Answer B</th><th>Answer C</th></tr>
<tr><td><strong>Who owns the unpacking?</strong></td>
<td><strong>The wall.</strong> The cable is ordinary on both sides; the boundary transforms
it. <span class="rule">LabVIEW auto-indexing tunnel, Houdini Block Begin.</span></td>
<td><strong>The cable.</strong> The wire itself carries cardinality; the boundary is dumb.
<span class="rule">Grasshopper trees, LabVIEW's thicker array wires.</span></td>
<td><strong>The consuming port.</strong> The target name creates the element.
<span class="rule">Python itself; n8n's run-once-per-item.</span></td></tr>
<tr><td><strong>Who owns the delay?</strong></td>
<td><strong>The wall.</strong> A matched pair of terminals, and no cable at all.
<span class="rule">LabVIEW shift register.</span></td>
<td><strong>The cable.</strong> A dotted line with a <code>z⁻¹</code> mark.
<span class="rule">Already shipping in SystemSketch.</span></td>
<td><strong>A node.</strong> <span class="rule">Simulink's <code>1/z</code> block —
ruled out here, because it adds a block.</span></td></tr>
</table>
<p>Cross the two surviving columns and you get four honest variants, plus one degenerate
corner where the scope is not drawn at all. That is the set below — it is a spanning set,
not a list of ideas.</p>""")

    out.append(f"""
<h2>The prior art Zach pointed at</h2>
<div class="grid2">
  <figure style="margin:0">
    <img class="shot" src="{data_uri(DOCS / 'assets' / 'labview-for-loop.png')}" alt="LabVIEW For Loop palette help">
    <figcaption>LabVIEW's For Loop. The border is the whole construct — <code>N</code> on the
    top-left sets the count, <code>i</code> emits the current index. No node is introduced.</figcaption>
  </figure>
  <figure style="margin:0">
    <img class="shot" src="{data_uri(DOCS / 'assets' / 'labview-while-loop.png')}" alt="LabVIEW While Loop palette help">
    <figcaption>The While Loop is the same object with a conditional terminal instead of a
    count — which is why <code>break</code> has somewhere to live in V1 and V4.</figcaption>
  </figure>
</div>
<p>The two things LabVIEW gets right, and which the rejected set never used, are both
<strong>properties of the border rather than objects beside it</strong>: the auto-indexing
tunnel (a collection outside, one element inside) and the shift register (a matched pair
of terminals that hands a value to the next iteration). Neither is a node.</p>
<table>
<tr><th>System</th><th>Its loop construct</th><th>What it actually does</th><th>Anchors</th></tr>
{''.join(f'<tr><td><strong>{n}</strong></td><td>{c}</td><td>{d}</td><td><span class="tag">{a}</span></td></tr>' for n, c, d, a in PRIOR_ART)}
</table>
<figure style="margin:22px 0 0">
  <img class="shot" src="{data_uri(DOCS / 'assets' / 'zach-loop-reference.png')}" alt="Zach's own loop sketch">
  <figcaption>Zach's own reference drawing, held as a reference and not as a constraint. Two
  of its judgements are carried through every variant here: the <code>z⁻¹</code> line goes
  straight into the port, and intermediate values do not become pills.</figcaption>
</figure>""")
    return "".join(out)


def _html_variants() -> str:
    out = ["""
<h2>The five</h2>
<p>All five draw the same loop — the one from the note. The blocks, the ports and the
outer values are identical in every picture, so a difference below is a difference in
the grammar and never a difference in the drawing.</p>
<pre><code>def run(raw: bytes, gain: float, others: Poses) -> bytes:
    frame = decode(raw)
    pose = estimate(frame, gain)
    for other in others:
        pose = merge(pose, other)
    payload = encode(pose)
    return payload</code></pre>"""]
    for key, _label, fn in MOTIVATING:
        v = VARIANTS[key]
        out.append(f"""
<h3><span class="tag rank">{key.upper()}</span> &nbsp;{v['name']}</h3>
<p class="lede" style="font-size:16.5px">{v['one_line']}</p>
{_fig(fn())}
<div class="card">
  <table style="margin:0 0 14px">
    <tr><th style="width:190px">Owns the unpacking</th><td>{v['owner_unpack']}</td></tr>
    <tr><th>Owns the delay</th><td>{v['owner_delay']}</td></tr>
    <tr><th>Prior art</th><td>{v['prior']}</td></tr>
  </table>
  {''.join(f'<p>{b}</p>' for b in v['body'])}
  <p class="note warn"><strong>What it costs.</strong> {v['costs']}</p>
</div>""")
    return "".join(out)


def _html_scores(ranked: list) -> str:
    head = "".join(f'<th style="text-align:right">{n}<br><span style="font-weight:400;'
                   f'text-transform:none;letter-spacing:0">{w}%</span></th>'
                   for _k, n, w, _d in CRITERIA)
    rows = []
    for rank, key in enumerate(ranked, start=1):
        v = VARIANTS[key]
        cells = "".join(f'<td class="num">{SCORES[key][c]}</td>' for c, _n, _w, _d in CRITERIA)
        mark = ' style="background:#F7F5FD"' if rank <= 3 else ""
        rows.append(f'<tr{mark}><td class="num">{rank}</td><td><strong>{key.upper()}</strong> '
                    f'{v["name"]}</td>{cells}<td class="num"><strong>{weighted(key)}</strong></td></tr>')
    crit = "".join(f'<tr><td><strong>{n}</strong></td><td class="num">{w}%</td>'
                   f'<td>{d}</td></tr>' for _k, n, w, d in CRITERIA)
    return f"""
<h2>Criteria, then scores</h2>
<p>The criteria and their weights were written down before any variant was scored, and
they are tilted the way Zach's own note is: the two things he says the drawing must make
obvious are worth 18% each, and &ldquo;adds no node&rdquo; is a hard gate rather than a
tie-breaker.</p>
<table><tr><th>Criterion</th><th class="num">Weight</th><th>What it asks</th></tr>{crit}</table>
<table style="margin-top:26px">
<tr><th class="num">#</th><th>Variant</th>{head}<th style="text-align:right">Score</th></tr>
{''.join(rows)}
</table>
<p class="note"><strong>All three recommendations are provisional.</strong> The gap between
V2 (82.3) and V5 (79.3) is inside the noise of my own weighting — move &ldquo;survives the
hard semantics&rdquo; by five points and the order changes. What is <em>not</em> inside the
noise is V4, which wins on the two criteria that carry the most weight and does not lose
badly anywhere.</p>"""


def _html_finalists(ranked: list) -> str:
    picks = ranked[:3]
    cards = []
    for key in picks:
        v = VARIANTS[key]
        cards.append(f"""<div class="card" style="margin:0">
<div class="hdr"><span class="tag rank">{key.upper()}</span><span class="score">{weighted(key)}</span></div>
<h3 style="margin:6px 0 6px">{v['name']}</h3>
<p style="font-size:14.5px;color:var(--muted);margin:0">{v['one_line']}</p></div>""")
    return f"""
<h2>The three taken forward</h2>
<p>They are not three flavours of one idea — they put the loop's meaning in three
genuinely different places, which is what makes the fifteen examples below worth
comparing: <strong>on the header</strong>, <strong>on the cable</strong>, and
<strong>on the wall</strong>.</p>
<div class="grid3">{''.join(cards)}</div>
<p class="note good"><strong>Why V4 leads, in one sentence.</strong> Every other variant
invents a mark and then has to teach it; V4 writes the binding the way Python already
writes it and hangs the ports off that sentence, so the only thing a reader has to learn
is that <em>the header line is where the loop's names live</em> — and the header row is
also the one place that can hold <code>zip</code>, a tuple unpack, <code>break</code>,
<code>else</code>, and what happens when the collection is empty.</p>
<p class="note warn"><strong>The tension I want your call on.</strong> LabVIEW's shift
register is the calmest thing in this entire document — the recurrence costs
<em>zero</em> cable. But it works by making the value teleport between two paired marks,
and your note says the opposite: <em>&ldquo;I prefer the z⁻¹ line that goes straight into
the port.&rdquo;</em> V4 is my attempt to have both — LabVIEW's tunnel for the unpacking,
your z⁻¹ line for the delay, drawn along the header row so it still never crosses the
body. If you would rather have the pure LabVIEW answer, that is V1, and it is a
defensible pick.</p>"""


def _html_stress() -> str:
    loops = [loop_1(), loop_2(), loop_3(), loop_4()]
    out = ["""
<h2>Fifteen stress examples</h2>
<p>Five loops, easy to hard, each chosen for a specific way a loop grammar can break —
not for variety. Every one is drawn three times, with the body held identical.</p>"""]
    for index in range(5):
        if index < 4:
            spec = loops[index]
            title, code, hazards = spec.title, spec.code, spec.hazards
            verdicts = spec.verdicts
        else:
            title, code, hazards = "nested · break · for…else", L5_CODE, L5_HAZARDS
            verdicts = L5_VERDICTS
        out.append(f"""
<h3>L{index + 1} · {title}</h3>
<pre><code>{esc(code)}</code></pre>
<p><strong>What it is here to break:</strong></p>
<ul>{''.join(f'<li>{h}</li>' for h in hazards)}</ul>""")
        for key in ("v4", "v2", "v1"):
            scene, _ = stress_scene(key, index)
            kind, why = verdicts[key]
            out.append(f"""
<div class="card">
  <div class="hdr"><span class="tag rank">{key.upper()}</span>
  <strong>{VARIANTS[key]['name']}</strong> {_verdict_tag(kind)}</div>
  {_fig(scene)}
  <p style="margin:6px 0 0">{why}</p>
</div>""")
    return "".join(out)


def _html_close(facts: dict, board: str, stress_board: str) -> str:
    return f"""
<h2>Where this leaves the design</h2>
<p>Two findings are worth more than the ranking.</p>
<p><strong>The type already carries the unpacking.</strong> A boundary port whose outer
face reads <code>Poses</code> and whose inner face reads <code>Pose</code> has said the
whole thing without a single new glyph — and SystemSketch already models a port with two
faces (<code>PortFace = 'outer' | 'inner'</code> in
<code>src/blocks/connections/connectionModel.ts</code>, present in this tree: {facts['has_inner_face']}).
That is the cheapest true statement available and every variant here should probably use it.</p>
<p><strong>An invariant should cost nothing.</strong> <code>gain</code> and <code>thresh</code>
and <code>query</code> bind no name and change no rate. V1 makes each of them pay a mark at
every wall they cross — twice over, in the nested case. V2 and V4 charge them nothing.
That is a small thing that shows up on every real diagram.</p>
<p class="note"><strong>Held out deliberately.</strong> No product feature was implemented,
no file under <code>src/</code> was touched, and nothing here is wired to the toolbar. The
<code>temporal</code> StyleProp used for every dotted cable is the one that already ships
(<code>{facts['temporal_kinds']}</code>, with the <code>z⁻¹</code> pill), so a real
implementation of V2 or V4 would start by reusing it rather than adding paint. `while`
loops, `zip` of unequal lengths, generators and `itertools` are all out of scope for this
pass.</p>
<p class="note warn"><strong>A product finding that fell out of building the boards.</strong>
SystemSketch refuses a cable from a Block to itself, so the motivating loop's own
recurrence — <code>pose = merge(pose, other)</code>, a single Block — <strong>cannot be
drawn as a real cable today</strong>. The five-variant board therefore uses a two-step body
(<code>merge</code> then <code>smooth</code>) so that every carry is a genuine
<code>temporal: delayed</code> record; the stress board says on each card where a carry had
to be drawn rather than wired. Whatever grammar wins, a one-Block accumulator is the most
ordinary loop there is, and the editor cannot express its recurrence.</p>
<h2>The editable boards</h2>
<p>Both are real SystemSketch documents with real Blocks and real semantic connections.
Verified by driving them in the running app: the five-variant board loads 25 Blocks, 25
cables, 5 of them <code>temporal: delayed</code>, 0 orphaned bindings, and dragging a Block
leaves all of that unchanged while the dotted cable reflows and keeps its pill.</p>
<ul>
<li><a href="http://127.0.0.1:4330/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Ffor-loop-grammars-labview.systemsketch">the five variants on the motivating loop</a>
 — <code>{board}</code></li>
<li><a href="http://127.0.0.1:4330/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Ffor-loop-grammars-labview-stress.systemsketch">the fifteen stress examples</a>
 — <code>{stress_board}</code></li>
</ul>
<p class="rule">Served on port 4330 (API 4331) so Stable on 4321 and the Preview on 4322
are untouched.</p>
<div class="foot">
Built by <code>docs/build_for_loop_labview_grammars.py</code> from the tree at
<code>{facts['commit']}</code>. Every diagram, both board recipes and the score table come
from one scene model, so the report and the boards cannot drift.
Exploration artifact — not an implementation.
</div></div>"""


def build_html() -> str:
    facts = measure()
    ranked = sorted(VARIANTS, key=lambda k: -weighted(k))
    return (
        "<!-- generated by docs/build_for_loop_labview_grammars.py -->"
        + _html_intro(facts) + _html_variants() + _html_scores(ranked)
        + _html_finalists(ranked) + _html_stress()
        + _html_close(facts, "sketches/review/for-loop-grammars-labview.systemsketch",
                      "sketches/review/for-loop-grammars-labview-stress.systemsketch")
    )


# ---------------------------------------------------------------------------
# Editable boards
#
# Product-real where the product is real: every Block is a `block` record and
# every cable is a `connection` record with its two `connection` bindings, so
# the recurrence really does carry `temporal: 'delayed'`. The marks the product
# does NOT have yet — wall mouths, header rows, doubled rails — are stock geo
# and text, which is also what makes them safe for Zach to move or delete.
# ---------------------------------------------------------------------------
# Measured from src/blocks/layoutBlock.ts rather than guessed:
# header 48 + row-header gap 8 + rows*44 + bottom padding 8 + footer 46.
BLOCK_CHROME, BLOCK_ROW = 110, 44


class BoardScene:
    """One card on a review board."""

    def __init__(self, prefix: str, ox: float, oy: float, w: float, h: float,
                 title: str, code: str, tint: str = "grey"):
        self.p = prefix
        self.ox, self.oy = ox, oy
        self.shapes: list[dict] = []
        self.bindings: list[dict] = []
        self.n = 0
        self.shapes.append({
            "id": f"{prefix}-card", "type": "geo", "x": ox, "y": oy,
            "props": {"geo": "rectangle", "w": w, "h": h, "fill": "none",
                      "color": "grey", "dash": "solid", "size": "s"},
        })
        self.shapes.append({
            "id": f"{prefix}-title", "type": "text", "x": ox + 26, "y": oy + 18,
            "text": title, "props": {"color": "black", "size": "m", "font": "sans"},
        })
        self.shapes.append({
            "id": f"{prefix}-code", "type": "text", "x": ox + 26, "y": oy + 58,
            "text": code, "props": {"color": "grey", "size": "s", "font": "mono"},
        })

    def block(self, key, x, y, w, title, inputs, outputs, block_type="Function"):
        rows = max(len(inputs), len(outputs), 1)
        height = BLOCK_CHROME + rows * BLOCK_ROW
        self.shapes.append({
            "id": f"{self.p}-{key}", "type": "block", "x": self.ox + x, "y": self.oy + y,
            "props": {
                "title": title, "description": "", "blockType": block_type, "view": "port",
                "w": w, "h": height,
                "inputs": [{"id": f"in_{i + 1}", "name": n, "type": t, "visible": True}
                           for i, (n, t) in enumerate(inputs)],
                "outputs": [{"id": f"out_{i + 1}", "name": n, "type": t, "visible": True}
                            for i, (n, t) in enumerate(outputs)],
            },
        })
        return f"{self.p}-{key}"

    def cable(self, source, source_port, sink, sink_port, temporal="data", delay=""):
        self.n += 1
        cid = f"{self.p}-c{self.n}"
        self.shapes.append({
            "id": cid, "type": "connection", "x": 0, "y": 0,
            "props": {"start": {"x": 0, "y": 0}, "end": {"x": 0, "y": 0},
                      "routing": "elbow", "curve": None, "pins": [], "elbowRoute": None,
                      "routeMode": "automatic", "temporal": temporal,
                      "delayValue": delay, "pillPosition": 0.5},
        })
        self.bindings.append({"type": "connection", "fromId": cid, "toId": source,
                              "props": {"portId": source_port, "terminal": "start",
                                        "face": "outer"}})
        self.bindings.append({"type": "connection", "fromId": cid, "toId": sink,
                              "props": {"portId": sink_port, "terminal": "end",
                                        "face": "outer"}})
        return cid

    def label(self, key, x, y, text, color="grey", size="s", font="sans"):
        self.shapes.append({
            "id": f"{self.p}-{key}", "type": "text", "x": self.ox + x, "y": self.oy + y,
            "text": text, "props": {"color": color, "size": size, "font": font},
        })

    def arrow(self, key, x1, y1, x2, y2, bend=-60, color="violet", dash="dotted"):
        """A drawn annotation, never a semantic cable. Used only where the editor
        refuses the real thing — a Block may not cable to itself."""
        self.shapes.append({
            "id": f"{self.p}-{key}", "type": "arrow",
            "x": self.ox + x1, "y": self.oy + y1,
            "props": {"start": {"x": 0, "y": 0}, "end": {"x": x2 - x1, "y": y2 - y1},
                      "bend": bend, "color": color, "dash": dash, "size": "s",
                      "arrowheadStart": "none", "arrowheadEnd": "arrow"},
        })

    def band(self, key, x, y, w, h, color="grey", dash="dashed", fill="none"):
        self.shapes.append({
            "id": f"{self.p}-{key}", "type": "geo", "x": self.ox + x, "y": self.oy + y,
            "props": {"geo": "rectangle", "w": w, "h": h, "fill": fill, "color": color,
                      "dash": dash, "size": "s"},
        })


# A Block may not cable to itself in SystemSketch today, so a one-Block
# accumulator's recurrence cannot be a real cable. The boards therefore use a
# two-step body wherever the carry must be a genuine `temporal: delayed`
# record, and say so on the canvas.
BOARD_CODE = ("for other in others:\n"
              "    fused = merge(pose, other)\n"
              "    pose  = smooth(fused)")

VARIANT_BOARD_NOTE = {
    "v1": "V1 · WALL TUNNELS — the crossing marks are the grammar. [ ] unpacks the "
          "collection; the ▼/▲ pair IS the delay and draws no cable at all.",
    "v2": "V2 · CARDINALITY CABLE — nothing on the wall. A collection is a doubled rail "
          "that thins where it enters; the carry is the dotted z⁻¹ cable below the body.",
    "v3": "V3 · BINDING PORTS — nothing on the wall or the cable. [·] on a port means one "
          "element per turn; ↺ pairs an input with the output that rewrites it.",
    "v4": "V4 · HEADER CONTRACT — each name the `for` binds is one header row that owns a "
          "wall port. The carry row IS the return path: solid, z⁻¹, solid.",
    "v5": "V5 · BARE CYCLE — no region at all. The cycle in the graph is the loop and the "
          "tint is derived from it, never authored.",
}


def _variant_card(key: str, index: int) -> BoardScene:
    oy = index * 760
    card = BoardScene(f"{key}", 0, oy, 2000, 660,
                      f"{key.upper()} · {VARIANTS[key]['name']}", BOARD_CODE)
    if key != "v5":
        card.band("region", 360, 170, 1180, 400, color="grey", dash="solid")
    else:
        card.band("region", 430, 220, 1040, 300, color="violet", dash="dotted")
    run = card.block("run", 30, 210, 300, "run()", [], [("others", "Poses")])
    est = card.block("estimate", 30, 400, 300, "estimate()", [], [("pose", "Pose")])
    merge = card.block("merge", 470, 250, 340, "merge()",
                       [("pose", "Pose"), ("other", "Pose")], [("fused", "Pose")])
    smooth = card.block("smooth", 950, 290, 320, "smooth()",
                        [("fused", "Pose")], [("pose", "Pose")])
    encode = card.block("encode", 1640, 300, 320, "encode()",
                        [("pose", "Pose")], [("bytes", "bytes")])
    card.cable(run, "out_1", merge, "in_2")
    card.cable(est, "out_1", merge, "in_1")
    card.cable(merge, "out_1", smooth, "in_1")
    card.cable(smooth, "out_1", merge, "in_1", temporal="delayed")
    card.cable(smooth, "out_1", encode, "in_1")
    card.label("note", 26, 606, VARIANT_BOARD_NOTE[key], color="black", size="s")

    if key == "v1":
        card.band("m-cin", 347, 300, 26, 26, color="black", dash="solid")
        card.band("m-idx", 347, 380, 26, 26, color="black", dash="solid")
        card.band("m-cout", 1527, 340, 26, 26, color="black", dash="solid")
        card.band("m-i", 940, 557, 26, 26, color="grey", dash="solid")
        card.label("l-marks", 30, 576, "▼ carry pose in   ·   [ ] others → other   ·   "
                                       "▲ carry pose out   ·   i counter — every mark is ON "
                                       "the wall, and the ▼/▲ pair draws no cable")
    elif key == "v2":
        card.label("thin", 380, 500, "⟂ at the wall: two rails become one — a collection "
                                     "becomes an element")
        card.label("rail", 380, 530, "· · · z⁻¹ · · ·  one return rail, drawn under the body")
    elif key == "v3":
        card.label("badge", 380, 510, "[·] other   ·   ↺ pose ↔ ↺ pose   — the recurrence "
                                      "has no drawn path at all")
    elif key == "v4":
        card.band("header", 360, 170, 1180, 120, color="grey", dash="solid")
        card.label("r1", 384, 188, "for other in others", size="s", font="mono")
        card.label("r2", 384, 232, "carry pose   ·······  z⁻¹  ·······", size="s", font="mono")
    else:
        card.label("cycle", 440, 186, "iteration 3 of 7 · tint derived from the cycle")
    return card


# Each stress card carries the loop's OWN Blocks and ports. Every cable is real
# except the self-recurrence, which the editor refuses today — that one is a
# drawn annotation and the card says so.
STRESS_BODIES = {
    0: dict(
        title="L1 · map · invariant · packed result",
        run=[("frames", "Frames"), ("size", "int")],
        blocks=[("a", "shrink()", [("f", "Frame"), ("size", "int")], [("thumb", "Thumb")])],
        wires=[("run", "out_1", "a", "in_1"), ("run", "out_2", "a", "in_2"),
               ("a", "out_1", "res", "in_1")],
        result=[("thumbs", "Thumbs")], carry=None,
    ),
    1: dict(
        title="L2 · reduce + collect from one body",
        run=[("others", "Poses"), ("pose", "Pose")],
        blocks=[("a", "merge()", [("pose", "Pose"), ("other", "Pose")], [("fused", "Pose")]),
                ("b", "score()", [("pose", "Pose")], [("s", "float")])],
        wires=[("run", "out_1", "a", "in_2"), ("run", "out_2", "a", "in_1"),
               ("a", "out_1", "b", "in_1"), ("b", "out_1", "res", "in_1")],
        result=[("trail", "Floats")], carry=("a", "pose"),
    ),
    2: dict(
        title="L3 · enumerate · zip · tuple unpack",
        run=[("boxes", "Boxes"), ("names", "Names"), ("gain", "float"), ("best", "Best")],
        blocks=[("a", "rate()", [("box", "Box"), ("gain", "float")], [("score", "float")]),
                ("b", "pick()", [("best", "Best"), ("score", "float"), ("name", "str"),
                                 ("i", "int")], [("best", "Best")])],
        wires=[("run", "out_1", "a", "in_1"), ("run", "out_3", "a", "in_2"),
               ("a", "out_1", "b", "in_2"), ("run", "out_2", "b", "in_3"),
               ("run", "out_4", "b", "in_1"), ("b", "out_1", "res", "in_1")],
        result=[("best", "Best")], carry=("b", "best"),
    ),
    3: dict(
        title="L4 · continue · conditional collect · empty",
        run=[("detections", "Dets"), ("thresh", "float"), ("total", "float")],
        blocks=[("a", "weight()", [("d", "Det")], [("w", "float")]),
                ("b", "add()", [("total", "float"), ("w", "float")], [("total", "float")])],
        wires=[("run", "out_1", "a", "in_1"), ("a", "out_1", "b", "in_2"),
               ("run", "out_3", "b", "in_1"), ("b", "out_1", "res", "in_1")],
        result=[("total", "float")], carry=("b", "total"),
    ),
    4: dict(
        title="L5 · nested · break · for…else",
        run=[("tracks", "Tracks"), ("query", "Query"), ("misses", "int")],
        blocks=[("a", "match()", [("det", "Det"), ("query", "Query")], [("hit", "bool")]),
                ("b", "bump()", [("misses", "int")], [("misses", "int")])],
        wires=[("run", "out_1", "a", "in_1"), ("run", "out_2", "a", "in_2"),
               ("run", "out_3", "b", "in_1"), ("a", "out_1", "res", "in_1")],
        result=[("hit", "bool")], carry=("b", "misses"),
    ),
}


def _stress_card(key: str, loop_index: int, ox: float, oy: float) -> BoardScene:
    body = STRESS_BODIES[loop_index]
    code = LOOPS[loop_index]().code if loop_index < 4 else L5_CODE
    lines = code.count("\n") + 1
    top = 150 + lines * 26
    card = BoardScene(f"s{loop_index}{key}", ox, oy, 2000, top + 520,
                      f"{key.upper()} · {VARIANTS[key]['name']} — {body['title']}", code)
    card.band("region", 360, top, 1180, 420, color="grey", dash="solid")
    ids = {"run": card.block("run", 20, top + 40, 320, "run()", [], body["run"]),
           "res": card.block("res", 1640, top + 120, 330, "result()", body["result"], [])}
    for index, (bkey, title, inputs, outputs) in enumerate(body["blocks"]):
        ids[bkey] = card.block(bkey, 430 + index * 500, top + 50 + index * 60, 400,
                               title, inputs, outputs)
    for source, sport, sink, kport in body["wires"]:
        card.cable(ids[source], sport, ids[sink], kport)
    if body["carry"]:
        bkey, name = body["carry"]
        block = next(b for b in card.shapes if b["id"] == ids[bkey])
        left, right = block["x"] - card.ox, block["x"] - card.ox + block["props"]["w"]
        cy = block["y"] - card.oy + 70
        card.arrow("carry", right + 30, cy, left - 30, cy, bend=-90)
        card.label("carrylab", (left + right) / 2 - 90, cy - 130,
                   f"z⁻¹  carry {name}", color="violet", size="s", font="mono")
        card.label("carrynote", 380, top + 386,
                   "drawn, not wired — SystemSketch refuses a cable from a Block to itself, "
                   "so a one-Block accumulator's recurrence has no real cable today")
    card.label("note", 26, top + 462, VARIANT_BOARD_NOTE[key], color="black", size="s")
    return card


def build_variant_recipe() -> dict:
    shapes, bindings = [], []
    for index, (key, _label, _fn) in enumerate(MOTIVATING):
        card = _variant_card(key, index)
        shapes.extend(card.shapes)
        bindings.extend(card.bindings)
    callouts = [
        {"id": "step-1", "kind": "step",
         "text": "1 · Read the five cards top to bottom. Each draws the SAME loop with the "
                 "same Blocks — only the boundary machinery differs.",
         "x": -500, "y": 120, "w": 440, "h": 180,
         "target": {"shapeId": "v1-merge", "anchor": "left"}},
        {"id": "step-2", "kind": "step",
         "text": "2 · Drag any Block. The dotted z⁻¹ cable is a real connection with "
                 "temporal: delayed — it reflows and keeps its pill.",
         "x": -500, "y": 1620, "w": 440, "h": 180,
         "target": {"shapeId": "v3-merge", "anchor": "left"}},
        {"id": "step-3", "kind": "step",
         "text": "3 · On V4 the header band and its two rows are stock shapes. Move them "
                 "or delete them — that is the part the product does not have yet.",
         "x": -500, "y": 2380, "w": 440, "h": 200,
         "target": {"shapeId": "v4-merge", "anchor": "left"}},
        {"id": "pass", "kind": "pass",
         "text": "PASS WHEN one of the five cards reads correctly to you without the "
                 "legend — iterable vs element, and this-turn vs next-turn.",
         "x": 2120, "y": 120, "w": 440, "h": 180},
    ]
    return {"feature": "For-loop grammars · five variants",
            "viewport": {"width": 2600, "height": 1900},
            "pages": [{"id": "review", "name": "Review"}],
            "shapes": shapes, "bindings": bindings, "callouts": callouts}


def build_stress_recipe() -> dict:
    shapes, bindings = [], []
    for loop_index in range(5):
        for column, key in enumerate(("v4", "v2", "v1")):
            card = _stress_card(key, loop_index, column * 2200, loop_index * 860)
            shapes.extend(card.shapes)
            bindings.extend(card.bindings)
    callouts = [
        {"id": "step-1", "kind": "step",
         "text": "1 · Columns are the three finalists (V4, V2, V1); rows are the five "
                 "stress loops. Every card carries real Blocks and real cables.",
         "x": -520, "y": 60, "w": 460, "h": 180,
         "target": {"shapeId": "s0v4-a", "anchor": "left"}},
        {"id": "step-2", "kind": "step",
         "text": "2 · Rewire anything. The fully drawn version of each of these fifteen "
                 "lives in the HTML gallery; this board is for editing, not for reading.",
         "x": -580, "y": 3500, "w": 460, "h": 200,
         "target": {"shapeId": "s4v4-a", "anchor": "left"}},
        {"id": "pass", "kind": "pass",
         "text": "PASS WHEN a card you edit still reads as the loop it names.",
         "x": 6700, "y": 60, "w": 420, "h": 130},
    ]
    return {"feature": "For-loop grammars · stress suite",
            "viewport": {"width": 2600, "height": 1900},
            "pages": [{"id": "review", "name": "Review"}],
            "shapes": shapes, "bindings": bindings, "callouts": callouts}


def main() -> None:
    html = build_html()
    report = DOCS / f"for-loop-labview-grammars-{STAMP}.html"
    report.write_text(f"<!doctype html><html lang='en'><head><meta charset='utf-8'>"
                      f"<meta name='viewport' content='width=device-width,initial-scale=1'>"
                      f"<title>Five loop grammars · SystemSketch</title></head><body>"
                      f"{html}</body></html>", encoding="utf-8")
    scores = {
        "criteria": [{"key": k, "name": n, "weight": w, "asks": d} for k, n, w, d in CRITERIA],
        "variants": {k: {"name": VARIANTS[k]["name"], "scores": SCORES[k],
                         "weighted": weighted(k),
                         "owner_unpack": VARIANTS[k]["owner_unpack"],
                         "owner_delay": VARIANTS[k]["owner_delay"]} for k in VARIANTS},
        "ranking": sorted(VARIANTS, key=lambda k: -weighted(k)),
        "measured": measure(),
    }
    (DOCS / f"for-loop-labview-grammars-{STAMP}.json").write_text(
        json.dumps(scores, indent=2), encoding="utf-8")
    (SKETCHES / "for-loop-grammars-labview-recipe.json").write_text(
        json.dumps(build_variant_recipe(), indent=1), encoding="utf-8")
    (SKETCHES / "for-loop-grammars-labview-stress-recipe.json").write_text(
        json.dumps(build_stress_recipe(), indent=1), encoding="utf-8")
    print(f"report  {report}  ({report.stat().st_size // 1024} KB)")
    print(f"scores  {DOCS / f'for-loop-labview-grammars-{STAMP}.json'}")
    print(f"recipes {SKETCHES / 'for-loop-grammars-labview-recipe.json'}")
    print(f"        {SKETCHES / 'for-loop-grammars-labview-stress-recipe.json'}")


if __name__ == "__main__":
    main()
