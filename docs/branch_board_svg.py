"""The SystemSketch light-canvas idiom as SVG helpers, shared by the branch builders.

Blocks, frames, regions, cables and ports drawn the way the live canvas paints
them, so that a design board and a prototype board differ only in the thing
under judgement.
"""

from __future__ import annotations

import html

# --------------------------------------------------------------------------
# SVG idiom — the SystemSketch light canvas as it appears in Zach's captures
# --------------------------------------------------------------------------

INK = "#1d2230"
MUTED = "#6b7686"
BORDER = "#d3d6dd"
FRAME = "#c3c6cf"
REGION = "#a9adb8"
THICK = "#15181f"
CABLE = "#6b7280"
ANY = "#c08520"
NUMBER = "#9e9e9e"
ACCENT = "#2f6fed"
WARN = "#d9480f"
BG = "#f7f8fa"
MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace"
SANS = "Inter,ui-sans-serif,system-ui,sans-serif"


class SVG:
    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.parts: list[str] = []

    def add(self, fragment: str) -> None:
        self.parts.append(fragment)

    def render(self, title: str) -> str:
        defs = (
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,1 L9,5 L0,9 z" fill="{THICK}"/></marker>'
            '<marker id="arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,1 L9,5 L0,9 z" fill="{ACCENT}"/></marker></defs>'
        )
        body = "".join(self.parts)
        return (
            f'<svg class="board" viewBox="0 0 {self.w} {self.h}" role="img" aria-label="{html.escape(title)}" '
            f'xmlns="http://www.w3.org/2000/svg"><rect width="{self.w}" height="{self.h}" fill="{BG}"/>{defs}{body}</svg>'
        )


def text(x: float, y: float, s: str, *, size=12, color=INK, mono=False, weight=400, anchor="start", italic=False, opacity=1.0) -> str:
    family = MONO if mono else SANS
    style = f"font-family:{family};font-size:{size}px;font-weight:{weight};fill:{color};" + ("font-style:italic;" if italic else "")
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" style="{style}" opacity="{opacity}">{html.escape(s)}</text>'


def dot(x: float, y: float, color=ANY, connected=True, r=5.5, hollow_warn=False, opacity=1.0) -> str:
    if hollow_warn:
        return f'<circle cx="{x}" cy="{y}" r="{r + 1}" fill="#fff" stroke="{WARN}" stroke-width="2.4" stroke-dasharray="3 2" opacity="{opacity}"/>'
    fill = color if connected else "#fff"
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{color}" stroke-width="2" opacity="{opacity}"/>'


def yield_dot(x: float, y: float, color=ANY, opacity=1.0) -> str:
    """A region output: the phi.  Filled dot with an inner white ring so it reads as a join, not a plain port."""
    return (
        f'<circle cx="{x}" cy="{y}" r="7" fill="{color}" stroke="{color}" stroke-width="2" opacity="{opacity}"/>'
        f'<circle cx="{x}" cy="{y}" r="3" fill="none" stroke="#fff" stroke-width="1.6" opacity="{opacity}"/>'
    )


def cable(p1, p2, *, kind="data", frac=0.5, color=None, width=None, opacity=1.0, mid=None) -> str:
    x1, y1 = p1
    x2, y2 = p2
    if mid is None:
        mid = x1 + max(22, (x2 - x1) * frac)
    stroke = color or (THICK if kind == "control" else CABLE)
    w = width or (2.4 if kind == "control" else 1.6)
    marker = ' marker-end="url(#arrow)"' if kind == "control" else (' marker-end="url(#arrow-accent)"' if kind == "control-accent" else "")
    if kind == "control-accent":
        stroke = ACCENT
        w = 2.4
    d = f"M{x1},{y1} H{mid} V{y2} H{x2}"
    return f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"{marker}/>'


def polycable(points, *, color=CABLE, width=1.6, opacity=1.0, dashed=False) -> str:
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"{dash}/>'


ROW = 26
TITLE_BAND = 38
PAD_BOTTOM = 14


def block(svg: SVG, x: float, y: float, w: float, title: str, inputs, outputs, *, header=None, opacity=1.0, tone=None):
    """Draw a Block card.  Ports are dicts: name, type, color, connected, and for inputs `slots` (one-of receiver) or `branch` (half-line above)."""
    rows = max(len(inputs), len(outputs), 1)
    h = TITLE_BAND + rows * ROW + PAD_BOTTOM
    stroke = tone or BORDER
    svg.add(f'<g opacity="{opacity}">')
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="#fff" stroke="{stroke}" stroke-width="1.2" filter="url(#none)"/>')
    svg.add(f'<line x1="{x}" y1="{y + TITLE_BAND}" x2="{x + w}" y2="{y + TITLE_BAND}" stroke="{BORDER}" stroke-width="1"/>')
    svg.add(text(x + 12, y + 26, title, size=18, mono=True, color=INK))
    ports = {"in": {}, "out": {}, "rect": (x, y, w, h)}
    if header:
        hx, hy = x, y + 18
        svg.add(dot(hx, hy, header.get("color", ANY), header.get("connected", True)))
        svg.add(text(x + 12, y - 6, header["name"], size=10.5, color=MUTED))
        ports["header"] = (hx, hy)
    for i, port in enumerate(inputs):
        cy = y + TITLE_BAND + 13 + i * ROW
        if port.get("branch"):
            svg.add(f'<line x1="{x}" y1="{cy - 13}" x2="{x + w * 0.42}" y2="{cy - 13}" stroke="{THICK}" stroke-width="1.6"/>')
        slots = port.get("slots", 1)
        if isinstance(slots, int) and slots > 1:
            slots = [{"key": i, "connected": True, "group": i} for i in range(slots)]
        if isinstance(slots, list):
            # A one-of receiver: one sub-slot per producing arm, a half line
            # between slots that belong to different arms of the same region.
            n = len(slots)
            pitch = 11
            slot_positions = {}
            for i, slot in enumerate(slots):
                sy = cy + (i - (n - 1) / 2) * pitch
                svg.add(dot(x, sy, port.get("color", ANY), slot.get("connected", True), r=3.6))
                slot_positions[slot["key"]] = (x, sy)
                if i > 0 and slots[i - 1].get("group") != slot.get("group"):
                    ty = sy - pitch / 2
                    svg.add(f'<line x1="{x - 11}" y1="{ty}" x2="{x - 1}" y2="{ty}" stroke="{THICK}" stroke-width="1.6"/>')
            ports["in"][port["name"]] = slot_positions if not (n == 2 and set(slot_positions) == {0, 1}) else [slot_positions[0], slot_positions[1]]
        else:
            svg.add(dot(x, cy, port.get("color", ANY), port.get("connected", True)))
            ports["in"][port["name"]] = (x, cy)
        svg.add(text(x + 12, cy + 4, port["name"], size=11.5, color=INK))
        if port.get("type"):
            svg.add(text(x + 12 + 7 * len(port["name"]) + 6, cy + 4, port["type"], size=11, color=MUTED))
    for i, port in enumerate(outputs):
        cy = y + TITLE_BAND + 13 + i * ROW
        if port.get("branch"):
            svg.add(f'<line x1="{x + w * 0.58}" y1="{cy - 13}" x2="{x + w}" y2="{cy - 13}" stroke="{THICK}" stroke-width="1.6"/>')
        svg.add(dot(x + w, cy, port.get("color", ANY), port.get("connected", True)))
        label = port["name"] if not port.get("type") else f'{port["name"]}'
        svg.add(text(x + w - 12, cy + 4, label, size=11.5, color=INK, anchor="end"))
        ports["out"][port["name"]] = (x + w, cy)
    svg.add("</g>")
    return ports


def frame(svg: SVG, x, y, w, h, title, *, stroke=FRAME) -> None:
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="#fff" stroke="{stroke}" stroke-width="1.2"/>')
    svg.add(f'<line x1="{x}" y1="{y + 34}" x2="{x + w}" y2="{y + 34}" stroke="{stroke}" stroke-width="1"/>')
    svg.add(text(x + 14, y + 24, title, size=19, mono=True))


def boundary_in(svg: SVG, x, y, name, typ, color=ANY, connected=True, opacity=1.0) -> tuple:
    svg.add(dot(x, y, color, connected, opacity=opacity))
    svg.add(text(x + 12, y - 4, name, size=11.5, opacity=opacity))
    svg.add(text(x + 12 + 7 * len(name) + 6, y - 4, typ, size=11, color=MUTED, opacity=opacity))
    return (x, y)


def boundary_out(svg: SVG, x, y, name, typ, color=ANY, connected=True, opacity=1.0) -> tuple:
    svg.add(dot(x, y, color, connected, opacity=opacity))
    svg.add(text(x - 12, y - 4, f"{name}", size=11.5, anchor="end", opacity=opacity))
    return (x, y)


def region(svg: SVG, x, y, w, arms, *, title="Branch", nested=False, opacity=1.0, hide_border=False, yields=None):
    """A branch region: slim title band, then arms.  Each arm: label, body height, header (condition dot) flag.

    Returns arm rects, label-row header dot positions, the right edge, and divider ys."""
    stroke = REGION if not nested else "#c9ccd5"
    label_h = 24
    band = 0 if nested else 30
    total = band + sum(label_h + a["h"] for a in arms) + 8
    svg.add(f'<g opacity="{opacity}">')
    if not hide_border:
        svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{total}" rx="4" fill="none" stroke="{stroke}" stroke-width="{1.2 if not nested else 1}"/>')
        if band:
            svg.add(f'<line x1="{x}" y1="{y + band}" x2="{x + w}" y2="{y + band}" stroke="{stroke}" stroke-width="1"/>')
            svg.add(text(x + w / 2, y + 20, title, size=15, mono=True, anchor="middle", color=INK))
    out = {"arms": [], "headers": [], "right": x + w, "dividers": [], "rect": (x, y, w, total), "bottom": y + total}
    cy = y + band
    for index, arm in enumerate(arms):
        if index > 0:
            width = 2.2 if not nested else 1.1
            color = THICK if not nested else "#8d919c"
            svg.add(f'<line x1="{x}" y1="{cy}" x2="{x + w}" y2="{cy}" stroke="{color}" stroke-width="{width}"/>')
            out["dividers"].append(cy)
        label_y = cy + 16
        svg.add(text(x + 16, label_y, "⌄", size=11, color=MUTED))
        svg.add(text(x + 28, label_y, arm["label"], size=12, weight=700, color=INK if not arm.get("muted") else MUTED, italic=arm.get("muted", False)))
        if arm.get("header"):
            hx, hy = x, cy + 12
            svg.add(dot(hx, hy, ANY, True, r=5, ))
            out["headers"].append((hx, hy))
        else:
            out["headers"].append(None)
        body_top = cy + label_h
        out["arms"].append((x, body_top, w, arm["h"]))
        cy = body_top + arm["h"]
    if yields:
        for yv in yields:
            svg.add(yield_dot(x + w, yv["y"], yv.get("color", ANY)))
            svg.add(text(x + w - 12, yv["y"] - 7, yv["name"], size=11.5, anchor="end"))
    svg.add("</g>")
    return out


def note(svg: SVG, x, y, s, color=MUTED, size=11.5, italic=True, anchor="start") -> None:
    svg.add(text(x, y, s, size=size, color=color, italic=italic, anchor=anchor))


def chip(svg: SVG, x, y, s, color=WARN) -> None:
    w = 7 * len(s) + 16
    svg.add(f'<rect x="{x}" y="{y - 11}" width="{w}" height="18" rx="9" fill="#fff" stroke="{color}" stroke-width="1.2"/>')
    svg.add(text(x + 8, y + 2, s, size=10.5, color=color, weight=600))


