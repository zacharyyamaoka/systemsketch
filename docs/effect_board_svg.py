"""The marks a side effect adds to the SystemSketch idiom, shared by the effect builders.

`branch_board_svg` draws blocks, ports and cables the way the live canvas paints
them.  This adds the four marks the mutation grammar needs and nothing else:

  * `mut_badge`  — a hook opening to the left of a port, read off the signature,
    so a port view warns before any cable exists.
  * `effect_arc` — the write-back: up out of the top edge, along a lane, down
    into the port that named the object.
  * `pill`       — the same chip machinery a delayed cable already uses.
  * `route`      — an elbow computed from the real endpoints, so a board cannot
    accidentally draw a diagonal where the app would draw a corner.
"""

from __future__ import annotations

import html

from branch_board_svg import ANY, CABLE, INK, MONO, MUTED, SVG, THICK, WARN, polycable, text

EFFECT = THICK
GHOST = "#c3c6cf"
STALE = 0.18          # the fade the many-to-one rule already uses for a wire that is not live


def mut_badge(x: float, y: float, *, color=WARN, connected=True, opacity=1.0) -> str:
    """A port a call writes back to: the port dot with a hook opening to its left."""
    return (
        f'<g opacity="{opacity}">'
        f'<circle cx="{x}" cy="{y}" r="5.5" fill="{ANY if connected else "#fff"}" stroke="{ANY}" stroke-width="2"/>'
        f'<path d="M{x - 5},{y - 9.5} a 10 10 0 0 0 0 19" fill="none" stroke="{color}" '
        f'stroke-width="2.2" stroke-linecap="round"/></g>'
    )


def pill(svg: SVG, x: float, y: float, label: str, *, color=WARN, mono=True, opacity=1.0) -> None:
    w = (7.2 if mono else 6.6) * len(label) + 18
    svg.add(f'<g opacity="{opacity}"><rect x="{x - w / 2}" y="{y - 10}" width="{w}" height="20" rx="10" '
            f'fill="#fff" stroke="{color}" stroke-width="1.4"/>'
            f'{text(x, y + 4, label, size=11, color=color, mono=mono, weight=600, anchor="middle")}</g>')


def route(a, b, x, *, color=CABLE, width=1.6, dashed=False, opacity=1.0) -> str:
    """An elbow from a to b turning on a vertical at x, built from the real port positions."""
    return polycable([a, (x, a[1]), (x, b[1]), b], color=color, width=width,
                     dashed=dashed, opacity=opacity)


def lane(points, *, color=EFFECT, width=2.4, dashed=False, opacity=1.0, arrow=True) -> str:
    """A polyline in the effect ink, optionally arrowed at the far end."""
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    marker = ' marker-end="url(#arrow-effect)"' if arrow else ""
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" '
            f'stroke-linejoin="round" stroke-linecap="round" opacity="{opacity}"{dash}{marker}/>')


def effect_arc(svg: SVG, start, end, lane_y, *, label="mut", color=EFFECT, ghost=False,
               entry=34, width=2.4, label_color=WARN, opacity=1.0):
    """The write-back: up out of the top edge, left along a lane, down into the port."""
    sx, sy = start
    ex, ey = end
    turn = ex - entry
    points = [(sx, sy), (sx, lane_y), (turn, lane_y), (turn, ey), (ex, ey)]
    d = "M" + " L".join(f"{x},{y}" for x, y in points)
    dash = ' stroke-dasharray="6 5"' if ghost else ""
    marker = "arrow-ghost" if ghost else "arrow-effect"
    svg.add(f'<path d="{d}" fill="none" stroke="{GHOST if ghost else color}" '
            f'stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round" '
            f'opacity="{opacity}"{dash} marker-end="url(#{marker})"/>')
    if label:
        pill(svg, (sx + turn) / 2, lane_y, label,
             color=GHOST if ghost else label_color, opacity=opacity)


def svg_defs() -> str:
    return (
        f'<marker id="arrow-effect" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
        f'markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{EFFECT}"/></marker>'
        f'<marker id="arrow-ghost" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
        f'markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{GHOST}"/></marker>'
        f'<marker id="arrow-data" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
        f'markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{CABLE}"/></marker>'
        f'<marker id="arrow-warn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" '
        f'markerHeight="6.5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="{WARN}"/></marker>'
    )


class Board(SVG):
    """An SVG that carries the effect markers as well as the branch idiom."""

    def render(self, title: str) -> str:  # noqa: D102
        body = "".join(self.parts)
        return (
            f'<svg class="board" viewBox="0 0 {self.w} {self.h}" role="img" '
            f'aria-label="{html.escape(title)}" xmlns="http://www.w3.org/2000/svg">'
            f'<rect width="{self.w}" height="{self.h}" fill="#f7f8fa"/>'
            f'<defs>{svg_defs()}</defs>{body}</svg>'
        )


def effect_port(svg, x: float, y: float, *, label="mut", stub=22, color=WARN) -> tuple:
    """A mutating call has no return port — `append(...) -> None`.

    So the only place a value can leave is the effect itself: a derived port on
    the top edge, with the mark riding its stub.  Returns the point cables leave
    from, which is the top of the stub, not the block edge."""
    svg.add(f'<path d="M{x},{y} L{x},{y - stub}" fill="none" stroke="{EFFECT}" '
            f'stroke-width="2.4" stroke-linecap="round"/>')
    svg.add(f'<circle cx="{x}" cy="{y}" r="5" fill="#fff" stroke="{color}" stroke-width="2.2"/>')
    if label:
        pill(svg, x, y - stub - 12, label, color=color)
        return (x, y - stub - 22)
    return (x, y - stub)


# Every effect cable this module draws records which edge it left by, so a page
# can state — rather than assert — that its own boards obey the top-exit rule.
EXIT_LOG: list[str] = []


def exit_edge(points) -> str:
    """Which edge of a block an effect cable leaves by.

    Read from the first segment that actually has length: a path may repeat a
    point where a stub meets a cable, and a zero-length hop leaves by no edge."""
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if abs(x2 - x1) < 0.5 and abs(y2 - y1) < 0.5:
            continue
        if abs(x2 - x1) < 0.5:
            return "top" if y2 < y1 else "bottom"
        return "side"
    return "none"


def effect_cable(points, *, opacity=1.0, arrow=True, count=True) -> str:
    """An edge that only exists because of a mutation.  Load-bearing: erase it and
    the consumer downstream has no input at all.

    Zach's rule (2026-09-03): the whiteboard may route it anywhere, but the linter
    prefers an effect leaving the *top* edge and travelling right, so a board still
    reads left to right."""
    if count:
        EXIT_LOG.append(exit_edge(points))
    return lane(points, color=EFFECT, width=2.4, opacity=opacity, arrow=arrow)
