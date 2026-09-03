#!/usr/bin/env python3
"""Build `docs/mutation-flow-2026-09-03.html`: the poison lens, and why it is a lens.

Zach's 2026-09-03 pass (PROJECT - pyblocks §11): a mutation should keep leaving
the side at every level it has effect; it should not be a halo but a cable that
traces along the wires it poisons; stale wires should fade; and with two
mutations the second should run beside the first.  He asks how to draw those
cables, and flags that the DAG has to be solved so a reader *before* the write
is not infected.

The argument here is that his two cables are one cable drawn twice.  Re-point
each consumer at its reaching definition and the "mutation flow" becomes the
data flow — which makes his picture a *diff* between the board a reader assumes
and the board that runs, not a rendering mode.  Every hard question he hit
(halo colours, side-by-side lanes, which mutation wins) lives only in the diff.

Numbers are computed at build time by `docs/mutation_effects.py`.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "mutation-flow-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import (  # noqa: E402
    ACCENT, ANY, CABLE, INK, MUTED, THICK, WARN,
    block, boundary_in, boundary_out, cable, dot, note, polycable, text,
)
from effect_board_svg import (  # noqa: E402
    EFFECT, EXIT_LOG, GHOST, STALE, Board, effect_arc, effect_cable, effect_port,
    exit_edge, lane, mut_badge, pill, route,
)
from mutation_effects import (  # noqa: E402
    analyze, chain, effect_edges, exit_lint, fictional_outputs, method_channel_table,
    propagate,
)

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

CROSSING = REPO / "src/blocks/elbow/boundaryCrossing.ts"
CROSSING_TEST = REPO / "src/blocks/elbow/boundaryCrossing.test.ts"
CROSSING_API = re.findall(r"^export function (\w+)", CROSSING.read_text(encoding="utf-8"), re.M)
CROSSING_CASES = len(re.findall(r"^  it\(", CROSSING_TEST.read_text(encoding="utf-8"), re.M))

# --------------------------------------------------------------------------
# The three sources this page is measured against
# --------------------------------------------------------------------------

ZACH_SOURCE = '''def run(raw: bytes, gain: float, poses: list[Pose]) -> int:
    frame = decode(raw)
    pose = estimate(frame, gain)
    random_func_before(poses)
    poses.append(pose)
    random_func(poses)
    count = len(poses)
    return count
'''

NESTED_SOURCE = '''def add_pose(poses: list[Pose], pose: Pose) -> None:
    poses.append(pose)

def run(raw: bytes, gain: float, poses: list[Pose]) -> int:
    frame = decode(raw)
    pose = estimate(frame, gain)
    add_pose(poses, pose)
    count = len(poses)
    return count

def outer(raw: bytes, gain: float, poses: list[Pose]) -> int:
    return run(raw, gain, poses)

def collect(n: int) -> list[Pose]:
    poses = []
    add_pose(poses, make())
    return poses
'''

TWICE_SOURCE = '''def run(raw: bytes, gain: float, poses: list[Pose]) -> int:
    pose = estimate(decode(raw), gain)
    poses.append(pose)
    random_mut_func(poses)
    poses.sort()
    count = len(poses)
    return count
'''

PURE_SOURCE = '''def run(raw: bytes, gain: float, poses: list[Pose]) -> int:
    frame = decode(raw)
    pose = estimate(frame, gain)
    random_func_before(poses)
    poses = [*poses, pose]
    random_func(poses)
    count = len(poses)
    return count
'''

ZACH = analyze(ZACH_SOURCE)
TWICE = analyze(TWICE_SOURCE)
PURE = analyze(PURE_SOURCE)
TABLE = propagate(NESTED_SOURCE)
ROUNDS = TABLE.pop("__rounds__")
CHAIN = chain(NESTED_SOURCE, "outer", "poses")

EFFECT_EDGES = effect_edges(ZACH)
CHANNELS = method_channel_table()
EFFECT_ONLY = [c for c in CHANNELS if c["channel"] == "effect only"]
BOTH_CHANNELS = [c for c in CHANNELS if c["channel"] == "effect and return"]
GOLDEN11 = Path("/home/bam/pyblocks/examples/systemsketch_goldens/11_receiver_mutation")
FICTIONAL = fictional_outputs(GOLDEN11 / "target.systemsketch",
                              analyze((GOLDEN11 / "source.py").read_text(encoding="utf-8")))
POSES_READS = [r for r in ZACH.reads if r.name == "poses"]
STALE_READS = [r for r in POSES_READS if r.version == 0]
LIVE_READS = [r for r in POSES_READS if r.version > 0]
PURE_WRITEBACKS = len(PURE.writebacks)


def esc(s) -> str:
    return html.escape(str(s))


# --------------------------------------------------------------------------
# One scene, three modes — identical geometry so the diff actually reads
# --------------------------------------------------------------------------

def scene(mode: str) -> str:
    """mode: 'naive' | 'lens' | 'straight'.  Zach's random_func_before program.

    `poses.append()` has no output port, because `append` has no return value.
    Every edge that carries the new list leaves the effect port on its top edge."""
    svg = Board(1200, 470)
    svg.add('<rect x="80" y="60" width="1070" height="356" rx="4" fill="#fff" '
            'stroke="#c3c6cf" stroke-width="1.2"/>')
    svg.add('<line x1="80" y1="94" x2="1150" y2="94" stroke="#c3c6cf" stroke-width="1"/>')
    svg.add(text(94, 84, "run()", size=18, mono=True))

    raw = boundary_in(svg, 80, 140, "raw", "bytes")
    gain = boundary_in(svg, 80, 200, "gain", "float")
    px, py = 80, 376
    out = boundary_out(svg, 1150, 340, "count", "int")

    decode = block(svg, 150, 112, 134, "decode()", [{"name": "raw"}], [{"name": "Frame"}])
    est = block(svg, 316, 130, 150, "estimate()",
                [{"name": "frame"}, {"name": "gain"}], [{"name": "Pose"}])
    before = block(svg, 150, 290, 232, "random_func_before()", [{"name": "poses"}], [])
    app = block(svg, 500, 196, 180, "poses.append()",
                [{"name": "poses"}, {"name": "pose"}], [])
    after = block(svg, 724, 250, 170, "random_func()", [{"name": "poses"}], [])
    ln = block(svg, 940, 316, 130, "len()", [{"name": "poses"}], [{"name": "count"}])

    svg.add(cable(raw, decode["in"]["raw"]))
    svg.add(cable(decode["out"]["Frame"], est["in"]["frame"]))
    svg.add(cable(gain, est["in"]["gain"], mid=300))
    svg.add(cable(est["out"]["Pose"], app["in"]["pose"], mid=484))
    svg.add(route((px, py), before["in"]["poses"], 118))     # v0 — reads before the write
    svg.add(route((px, py), app["in"]["poses"], 134))        # v0 — the receiver
    svg.add(cable(ln["out"]["count"], out, mid=1110))

    if mode in ("naive", "lens"):
        op = 1.0 if mode == "naive" else STALE
        svg.add(route((px, py), after["in"]["poses"], 424, opacity=op))
        svg.add(route((px, py), ln["in"]["poses"], 446, opacity=op))
    if mode in ("lens", "straight"):
        svg.add(mut_badge(px, py))
        svg.add(mut_badge(*app["in"]["poses"]))
        ex, ey = app["rect"][0] + 90, app["rect"][1]
        effect_port(svg, ex, ey, label=None, stub=30)
        svg.add(effect_cable([(ex, ey), (ex, 148), (702, 148),
                              (702, after["in"]["poses"][1]), after["in"]["poses"]]))
        svg.add(effect_cable([(ex, ey), (ex, 132), (716, 132),
                              (716, ln["in"]["poses"][1]), ln["in"]["poses"]]))
        svg.add(effect_cable([(ex, ey), (ex, 116), (860, 116), (860, 60)]))
        pill(svg, ex, ey - 30, "mut")
        effect_port(svg, 860, 60, label=None, stub=24)
        pill(svg, 812, 36, "mut")
        svg.add(effect_cable([(860, 60), (860, 30), (1170, 30)]))
        svg.add(text(1166, 22, "to run()'s caller", size=11, color=MUTED, italic=True, anchor="end"))
    else:
        svg.add(dot(px, py, ANY, True))

    svg.add(text(92, 372, "poses", size=11.5))
    svg.add(text(140, 372, "list[Pose]", size=11, color=MUTED))

    captions = {
        "naive": "How a reader assumes it works: one object, one port, four consumers off the same wire.",
        "lens": "The lens: the stale wires left in at 18%, and the real ones leaving the effect port on the "
                "top edge \u2014 because append() has no other way to hand the list on.",
        "straight": "Only the true edges. Every one of them leaves a top edge and travels right, so the "
                    "board still reads left to right \u2014 and run()'s own effect port carries it on out.",
    }
    note(svg, 300, 448, captions[mode], color=INK if mode == "straight" else MUTED, italic=False)
    return svg.render(f"scene {mode}")


# --------------------------------------------------------------------------
# Nesting
# --------------------------------------------------------------------------

def board_nesting() -> str:
    """Three nested frames.  The value goes in on the left; the effect leaves by the top.

    Each level's effect port feeds the next one out, stepping up and to the right, so
    the whole chain still reads left to right."""
    svg = Board(1180, 470)
    frames = [("outer()", 40, 132, 660, 290, 600),
              ("run()", 96, 172, 548, 230, 520),
              ("add_pose()", 152, 212, 436, 170, 440)]
    ports, effects = [], []
    for title, x, y, w, h, ex in frames:
        svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="#fff" '
                f'stroke="#c3c6cf" stroke-width="1.2"/>')
        svg.add(f'<line x1="{x}" y1="{y + 30}" x2="{x + w}" y2="{y + 30}" stroke="#c3c6cf" stroke-width="1"/>')
        svg.add(text(x + 14, y + 21, title, size=14, mono=True))
        ports.append((x, y + h - 36))
        effects.append((ex, y))

    app = block(svg, 230, 262, 190, "poses.append()",
                [{"name": "poses"}, {"name": "pose"}], [])
    svg.add(mut_badge(*app["in"]["poses"]))
    for point in ports:
        svg.add(mut_badge(*point))
        svg.add(text(point[0] + 12, point[1] - 8, "poses", size=10.5, color=MUTED))

    # the value goes IN on the left, level by level, as an ordinary data cable
    svg.add(route(ports[0], ports[1], 68))
    svg.add(route(ports[1], ports[2], 124))
    svg.add(route(ports[2], app["in"]["poses"], 190))

    # the new value comes OUT of the top, level by level, stepping right
    app_effect = (360, 262)
    effect_port(svg, *app_effect, label=None, stub=24)
    pill(svg, app_effect[0] - 34, app_effect[1] - 24, "mut")
    chain = [app_effect] + [(x, y) for x, y in reversed(effects)]
    for index in range(len(chain) - 1):
        (fx, fy), (tx, ty) = chain[index], chain[index + 1]
        svg.add(effect_cable([(fx, fy), (fx, fy - 26), (tx, fy - 26), (tx, ty)]))
        if index:
            pill(svg, fx - 34, fy - 24, "mut")
    for point in list(reversed(effects))[:-1]:
        effect_port(svg, *point, label=None, stub=24)
    top = effects[0]
    effect_port(svg, *top, label=None, stub=24)
    pill(svg, top[0] - 34, top[1] - 24, "mut")
    svg.add(effect_cable([top, (top[0], 84), (740, 84)]))
    svg.add(text(748, 88, "whoever called outer()", size=11.5, color=MUTED, italic=True))

    svg.add(text(790, 150, "In on the left, out of the top.", size=13.5, color=INK))
    svg.add(text(790, 178, "add_pose() writes poses in place, so its", size=12, color=MUTED))
    svg.add(text(790, 196, "effect port carries the new list out.", size=12, color=MUTED))
    svg.add(text(790, 222, "run() handed its poses to add_pose(),", size=12, color=MUTED))
    svg.add(text(790, 240, "so run() has an effect port too \u2014 fed by", size=12, color=MUTED))
    svg.add(text(790, 258, "the one inside it. Same again for outer().", size=12, color=MUTED))
    svg.add(text(790, 296, "Each port is real: you can wire from it", size=12, color=ACCENT))
    svg.add(text(790, 314, "by hand, to anything, anywhere.", size=12, color=ACCENT))
    svg.add(text(790, 352, "collect() creates its own list, so nothing", size=12, color=WARN))
    svg.add(text(790, 370, "propagates \u2014 a local is on nobody's", size=12, color=WARN))
    svg.add(text(790, 388, "interface, and the chain stops.", size=12, color=WARN))
    svg.add(text(790, 424, f"Fixpoint in {ROUNDS} rounds, at build time.", size=12, color=MUTED, italic=True))
    return svg.render("nesting")


def board_derived_port() -> str:
    """The port has no slot: it appears where the cable crosses the boundary."""
    svg = Board(1180, 320)
    panels = [
        ("top, then right", "preferred: the value keeps travelling the way you read", ACCENT),
        ("top, then left", "allowed: the port moves with the cable, but now you read backwards", MUTED),
        ("out of the right edge", "flagged: the right edge already means a returned value", WARN),
    ]
    for index, (title, why, colour) in enumerate(panels):
        x0 = 20 + index * 386
        svg.add(f'<rect x="{x0}" y="60" width="340" height="170" rx="4" fill="#fff" '
                f'stroke="#c3c6cf" stroke-width="1.2"/>')
        svg.add(f'<line x1="{x0}" y1="90" x2="{x0 + 340}" y2="90" stroke="#c3c6cf" stroke-width="1"/>')
        svg.add(text(x0 + 12, 82, "run()", size=13, mono=True))
        blk = block(svg, x0 + 60, 128, 190, "poses.append()",
                    [{"name": "poses"}, {"name": "pose"}], [])
        svg.add(mut_badge(*blk["in"]["poses"]))
        ex = x0 + 150
        if index == 0:
            crossing = (x0 + 268, 60)
            svg.add(effect_cable([(ex, 128), (ex, 110), (crossing[0], 110), crossing]))
            svg.add(effect_cable([crossing, (crossing[0], 34), (x0 + 332, 34)], count=False))
        elif index == 1:
            crossing = (x0 + 104, 60)
            svg.add(effect_cable([(ex, 128), (ex, 110), (crossing[0], 110), crossing]))
            svg.add(effect_cable([crossing, (crossing[0], 34), (x0 + 8, 34)], count=False))
        else:
            crossing = (x0 + 340, 110)
            svg.add(effect_cable([(ex, 128), (ex, 110), crossing]))
            svg.add(effect_cable([crossing, (x0 + 372, 110)], count=False))
        svg.add(f'<circle cx="{crossing[0]}" cy="{crossing[1]}" r="5.5" fill="#fff" '
                f'stroke="{colour}" stroke-width="2.4"/>')
        svg.add(text(x0, 262, title, size=13, color=colour, weight=700))
        svg.add(text(x0, 284, why, size=11.5, color=MUTED))
    svg.add(text(20, 28, "the derived port is placed by the cable, not by a slot \u2014 "
                         "drag the cable and the port follows", size=12.5, color=INK))
    return svg.render("derived port")


def board_twice(mode: str) -> str:
    """Three writers, none of which returns anything.  Only the write-backs differ."""
    svg = Board(1000, 400)
    svg.add('<rect x="40" y="52" width="790" height="300" rx="4" fill="#fff" '
            'stroke="#c3c6cf" stroke-width="1.2"/>')
    svg.add('<line x1="40" y1="86" x2="830" y2="86" stroke="#c3c6cf" stroke-width="1"/>')
    svg.add(text(54, 76, "run()", size=16, mono=True))
    px, py = 40, 300

    est = block(svg, 60, 152, 124, "estimate()", [{"name": "frame"}], [{"name": "Pose"}])
    one = block(svg, 208, 152, 172, "poses.append()",
                [{"name": "poses"}, {"name": "pose"}], [])
    two = block(svg, 404, 152, 202, "random_mut_func()", [{"name": "poses"}], [])
    three = block(svg, 630, 152, 148, "poses.sort()", [{"name": "poses"}], [])

    svg.add(mut_badge(px, py))
    svg.add(text(52, 296, "poses", size=11))
    for blk in (one, two, three):
        svg.add(mut_badge(*blk["in"]["poses"]))
    svg.add(cable(est["out"]["Pose"], one["in"]["pose"], mid=192))
    svg.add(route((px, py), one["in"]["poses"], 198))

    tops = [(blk["rect"][0] + 72, blk["rect"][1]) for blk in (one, two, three)]
    for point in tops:
        effect_port(svg, *point, label=None, stub=24)
    # each writer hands the list to the next one, through its effect: up out of the
    # top edge first, then right, which is the shape the linter prefers
    svg.add(effect_cable([tops[0], (tops[0][0], 128),
                          (392, 128), (392, two["in"]["poses"][1]), two["in"]["poses"]]))
    svg.add(effect_cable([tops[1], (tops[1][0], 128),
                          (618, 128), (618, three["in"]["poses"][1]), three["in"]["poses"]]))

    exit_point = (770, 52)
    if mode == "lanes":
        for index, point in enumerate(tops):
            lane_y = 104 - index * 12
            svg.add(effect_cable([point, (point[0], lane_y),
                                  (exit_point[0], lane_y), exit_point]))
            pill(svg, point[0] - 52, lane_y, f"mut {'\u2460\u2461\u2462'[index]}")
        note(svg, 120, 376, "three writers, three cables onto one exit \u2014 which is the list that leaves run()?",
             color=WARN)
    else:
        for point in tops[:2]:
            pill(svg, point[0], point[1] - 24, "mut")
        svg.add(effect_cable([tops[2], (tops[2][0], 104),
                              (exit_point[0], 104), exit_point]))
        pill(svg, tops[2][0], tops[2][1] - 24, "mut")
        note(svg, 120, 376, "the writers hand the list on through their effects; one exit, from the last",
             color=MUTED)
    effect_port(svg, *exit_point, label=None, stub=24)
    pill(svg, exit_point[0] - 46, exit_point[1] - 24, "mut")
    svg.add(effect_cable([exit_point, (exit_point[0], 22), (900, 22)]))
    svg.add(text(908, 26, "to the caller", size=11, color=MUTED, italic=True))
    return svg.render(f"twice {mode}")


def board_channels() -> str:
    """The distinction Zach drew the line under: rebinding versus mutation."""
    svg = Board(1180, 330)
    svg.add(text(30, 28, "poses = extend(poses, pose)", size=13.5, mono=True, color=INK))
    svg.add(text(30, 48, "a rebinding \u2014 the call returns the new list", size=12, color=MUTED))
    a = block(svg, 40, 96, 190, "extend()",
              [{"name": "poses"}, {"name": "pose"}], [{"name": "poses"}])
    a_sink = block(svg, 330, 128, 130, "len()", [{"name": "poses"}], [{"name": "int"}])
    svg.add(cable(a["out"]["poses"], a_sink["in"]["poses"], mid=290))
    note(svg, 40, 252, "One channel. The value leaves by the output port, the link to the", color=MUTED)
    note(svg, 40, 272, "input is broken, and it is an ordinary data cable \u2014 your drawing.", color=MUTED)

    svg.add('<line x1="580" y1="16" x2="580" y2="310" stroke="#d3d6dd" stroke-width="1"/>')
    svg.add(text(620, 28, "poses.append(pose)", size=13.5, mono=True, color=INK))
    svg.add(text(620, 48, "a mutation \u2014 the call returns None", size=12, color=MUTED))
    b = block(svg, 630, 118, 190, "poses.append()",
              [{"name": "poses"}, {"name": "pose"}], [])
    b_sink = block(svg, 950, 168, 130, "len()", [{"name": "poses"}], [{"name": "int"}])
    svg.add(mut_badge(*b["in"]["poses"]))
    ex, ey = 720, 118
    effect_port(svg, ex, ey, label=None, stub=38)
    pill(svg, ex, ey - 20, "mut")
    svg.add(effect_cable([(ex, ey), (ex, 74), (900, 74),
                          (900, b_sink["in"]["poses"][1]), b_sink["in"]["poses"]]))
    note(svg, 620, 252, "No output port to break the link to \u2014 there is none. The only", color=WARN)
    note(svg, 620, 272, "channel is the effect, and that cable is load-bearing.", color=WARN)
    return svg.render("channels")


# --------------------------------------------------------------------------
# The five cable treatments for the lens
# --------------------------------------------------------------------------

def treatment(key: str) -> str:
    svg = Board(560, 220)
    src = block(svg, 24, 40, 132, "append()", [{"name": "poses"}], [])
    src_effect = effect_port(svg, 90, 40, label=None, stub=18)
    port = (24, 176)
    svg.add(mut_badge(*port))
    svg.add(text(36, 172, "poses", size=11, color=MUTED))
    sink = block(svg, 348, 96, 168, "random_func()", [{"name": "poses"}], [])
    stale_route = [port, (250, 176), (250, sink["in"]["poses"][1]), sink["in"]["poses"]]
    live_route = [src_effect, (90, 18), (300, 18),
                  (300, sink["in"]["poses"][1]), sink["in"]["poses"]]

    if key == "L1":
        svg.add(polycable(stale_route, color=CABLE))
        svg.add(polycable(stale_route, color=EFFECT, width=2.4))
        svg.add(polycable(live_route, color=EFFECT, width=2.4))
        note(svg, 24, 208, "L1 \u00b7 effect ink laid exactly over the wire it replaces", color=WARN)
    elif key == "L2":
        svg.add(polycable(stale_route, color=CABLE, opacity=STALE))
        svg.add(effect_cable(live_route, arrow=False))
        note(svg, 24, 208, "L2 \u00b7 dead wire at 18%, the effect edge at full weight", color=INK)
    elif key == "L3":
        svg.add(polycable(stale_route, color=CABLE))
        offset = [(x, y + 5) for x, y in stale_route]
        svg.add(polycable(offset, color=EFFECT, width=2.2))
        note(svg, 24, 208, "L3 \u00b7 effect ink offset 5px, tracing the same route", color=MUTED)
    elif key == "L4":
        svg.add(polycable(stale_route, color="#f0a58a", width=7))
        svg.add(polycable(stale_route, color=CABLE))
        note(svg, 24, 208, "L4 \u00b7 halo behind the poisoned wire", color=MUTED)
    else:  # L5
        svg.add(polycable(stale_route, color=CABLE, opacity=STALE))
        svg.add(effect_cable(live_route, arrow=False))
        pill(svg, 300, 60, "mut ①")
        offset = [(x, y + 6) for x, y in live_route]
        svg.add(effect_cable(offset, arrow=False))
        pill(svg, 300, 140, "mut ②")
        note(svg, 24, 208, "L5 · a second mutation beside the first, each pill ordinalled", color=MUTED)
    return svg.render(key)


# --------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------

def reads_table() -> str:
    rows = "".join(
        f"<tr class='{'stale' if r.version == 0 else 'live'}'><td>{r.statement}</td>"
        f"<td><code>{esc(r.by)}(poses)</code></td><td>v{r.version}</td>"
        f"<td><code>{esc(r.producer)}</code></td>"
        f"<td>{'not touched by the write' if r.version == 0 else 'reads what append made'}</td></tr>"
        for r in POSES_READS)
    return (f"<table class='data'><caption>Your <code>random_func_before</code> program, run: which version "
            f"each consumer of <code>poses</code> gets</caption><thead><tr><th>stmt</th><th>read</th>"
            f"<th>version</th><th>wire from</th><th></th></tr></thead><tbody>{rows}</tbody></table>")


def nesting_table() -> str:
    rows = "".join(
        f"<tr><td><code>{esc(name)}({esc(', '.join(row['params']))})</code></td>"
        f"<td>{esc(', '.join(row['mutates']) or '—')}</td>"
        f"<td>{esc('; '.join(row['why'].values()) or 'nothing on its interface changes')}</td></tr>"
        for name, row in TABLE.items())
    return (f"<table class='data'><caption>The call graph, to a fixpoint in {ROUNDS} rounds — "
            f"<code>collect()</code> is where it stops</caption><thead><tr><th>function</th>"
            f"<th>mutates</th><th>why</th></tr></thead><tbody>{rows}</tbody></table>")


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
pre code{background:none;padding:0;font-size:12.6px;line-height:1.6}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:26px 0 6px}
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
tbody tr:last-child td{border-bottom:none}
.data tr.stale td{color:var(--muted)}
.data tr.live td:nth-child(3){color:var(--warn);font-weight:700}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 12px}
.tabs button{font:600 13px Inter,sans-serif;padding:7px 13px;border-radius:7px;cursor:pointer;
 border:1px solid var(--line);background:#fff;color:var(--muted)}
.tabs button[aria-selected=true]{background:var(--ink);border-color:var(--ink);color:#fff}
.pane[hidden]{display:none}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid2 .board{border-radius:8px}
.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin:16px 0}
.strip figcaption{font-size:12.4px}
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
if(brief){const k='ss-mutation-flow-brief';brief.value=localStorage.getItem(k)||'';
 brief.addEventListener('input',()=>localStorage.setItem(k,brief.value));}
"""

MODES = [
    ("naive", "1 · How you think it works", "Everything comes off the one port. This board is wrong, and "
     "nothing on it says so."),
    ("lens", "2 · The lens — your picture", "The same geometry, the stale wires left in at 18%, the live "
     "wires drawn from the call that made them. This is the diff."),
    ("straight", "3 · How it actually works", "Only the true edges are left — and they leave the effect "
     "port, because append() has no other way to hand the list on."),
]

TREATMENTS = [
    ("L1", "Effect ink over the data route", "Your simplicity pick. Two strokes on one path are one stroke "
     "to the eye at any zoom — the thing you noticed when you said you could no longer follow it."),
    ("L2", "Stale faded, live in effect ink", "The dead wire drops to the 18% the many-to-one rule already "
     "uses; the live one stays heavy, because it is not an ordinary data cable — it is the only channel the "
     "call has. Recommended."),
    ("L3", "Offset, tracing the route", "Legible, and it keeps your 'travels along the wires we already drew' "
     "reading. Costs a routing rule of its own, and two offsets collide at a corner."),
    ("L4", "Halo behind the poisoned wire", "You rejected this and you were right: with two mutations it needs "
     "two hues, and hue is already spoken for by the random per-wire colouring you wanted for tracing."),
    ("L5", "Second mutation beside the first", "Your stacking rule, with the pills ordinalled so the lanes are "
     "distinguishable. It works — and §5 argues you do not need it."),
]


def mode_panes() -> str:
    tabs = "".join(f'<button data-key="{k}" aria-selected="{str(k == "naive").lower()}">{esc(t)}</button>'
                   for k, t, _ in MODES)
    panes = "".join(
        f'<div class="pane" data-group="m" data-key="{k}" {"" if k == "naive" else "hidden"}>'
        f'{scene(k)}<p class="why small">{esc(why)}</p></div>' for k, _t, why in MODES)
    return f'<div class="tabs" data-group="m">{tabs}</div>{panes}'


def treatment_strip() -> str:
    return "".join(
        f'<figure>{treatment(k)}<figcaption><b>{esc(k)} — {esc(name)}.</b> {esc(why)}</figcaption></figure>'
        for k, name, why in TREATMENTS)


def channel_table() -> str:
    rows = "".join(
        f"<tr class='{'both' if c['channel'] == 'effect and return' else ''}'>"
        f"<td><code>{esc(c['method'])}</code></td><td><code>{esc(c['returns'])}</code></td>"
        f"<td>{esc(c['channel'])}</td></tr>" for c in CHANNELS)
    return (f"<table class='data'><caption>Every in-place method the probe knows, measured by calling it: "
            f"{len(EFFECT_ONLY)} of {len(CHANNELS)} hand back nothing at all</caption><thead><tr>"
            f"<th>method</th><th>returns</th><th>channels a board can wire from</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>")


def edges_table() -> str:
    rows = "".join(
        f"<tr><td><code>{esc(e['from'])}</code></td><td><code>{esc(e['to'])}</code></td>"
        f"<td>{esc(e['carries'])}</td><td>{esc(e['channel'])}</td>"
        f"<td>{'structural' if e['load_bearing'] else 'decorative'}</td></tr>"
        for e in EFFECT_EDGES)
    return (f"<table class='data'><caption>The edges in your program that exist only because of the mutation "
            f"— all {len(EFFECT_EDGES)} of them load-bearing</caption><thead><tr><th>from</th><th>to</th>"
            f"<th>carries</th><th>channel</th><th></th></tr></thead><tbody>{rows}</tbody></table>")


def build() -> str:
    EXIT_LOG.clear()
    panes = mode_panes()
    channels = board_channels()
    nesting = board_nesting()
    lanes = board_twice("lanes")
    straight_chain = board_twice("straight")
    strip = treatment_strip()
    derived = board_derived_port()
    lint = exit_lint(EXIT_LOG)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The poison lens</title><style>{CSS}</style></head><body><main>
<h1>The poison lens</h1>
<p class="sub"><code>list.append(self, object, /) -&gt; None</code>. There is no output port to wire from, so the
effect is not a second drawing of a data edge — it is the only channel there is. Revised 2026-09-03.</p>

<div class="callout warn"><b>Correction.</b> The first version of this page argued that your two cables were one
cable drawn twice: delete the stale one, re-point the consumer at <code>append</code>'s output, and the mutation
flow becomes ordinary dataflow. <b class="k">That was wrong, and you caught the reason.</b> It assumed
<code>poses.append()</code> had an output to re-point to. It does not — the call returns <code>None</code>, and
the only way the new list reaches <code>len()</code> is through the mutation. Three things I said follow from
that mistake and are now withdrawn: that the live wire should be drawn as an ordinary grey data cable
(it is not one); that the effect edges could be a lens you toggle off (they are structural — erase them and
<code>len()</code> has no input); and that the write-back is "not a port" (cables leave it and you route them,
so it is a port — a derived one). What survives is the binding rule, the nesting fixpoint, the ordering answer,
and the argument against stacked lanes. Everything below is the corrected version, and your last board is what
the page now draws.</div>

<div class="facts">
<div class="fact"><b>{len(EFFECT_ONLY)}/{len(CHANNELS)}</b><span>in-place methods that return nothing at all —
measured by calling them, not read off a doc</span></div>
<div class="fact"><b>{len(BOTH_CHANNELS)}</b><span>that return a value <i>and</i> mutate
(<code>pop</code>, <code>popitem</code>, <code>setdefault</code>): one call, two different edges</span></div>
<div class="fact"><b>{len(EFFECT_EDGES)}</b><span>edges in your program that exist only because of the write —
every one of them load-bearing</span></div>
<div class="fact"><b>{len(FICTIONAL)}</b><span>output port on golden 11's board that Python does not have:
<code>{esc(FICTIONAL[0]['port']) if FICTIONAL else '—'}</code></span></div>
</div>

<h2>1 · Rebinding and mutation are two different pictures</h2>
<p>You put it exactly right: <i>if we were reassigning the variables then it would look like that, but we are
not.</i> The two cases differ in one fact, and everything else follows from it.</p>
<figure>{channels}<figcaption>Left: a call that returns the new list. Right: a call that returns
<code>None</code>.</figcaption></figure>
<p><b>Rebinding</b> — <code>poses = extend(poses, pose)</code> — produces a value with a name, so it leaves by
an output port, the link to the input is broken, and downstream is an ordinary data cable. That is the board I
drew, and for that case it is right. <b>Mutation</b> — <code>poses.append(pose)</code> — produces a value with
no name and <b class="k">no return channel</b>. There is no output port to break the link to, because there is
no output port. The list reaches <code>len()</code> only because the object it already had was changed.</p>
<p>So the heavy cable in your drawing is not a redundant second rendering of a data edge. <b>It is the edge.</b>
Delete it and the board is disconnected.</p>
{edges_table()}
<p><b>And the board we have been measuring quietly invents the port.</b> Golden 11's
<code>target.systemsketch</code> gives <code>poses.append()</code> an output called
<code>{esc(FICTIONAL[0]['port']) if FICTIONAL else 'poses#2'}</code>. Its <i>binding</i> is right —
<code>len()</code> does read the version <code>append</code> made — but the <i>channel</i> it draws is the
analyzer's, not Python's. That is the same fiction as reassignment, drawn on a call that reassigns nothing.</p>
{channel_table()}
<p class="small"><b>The five that do both are why an effect edge cannot just be an output port renamed.</b>
<code>item = poses.pop()</code> hands back the element <i>and</i> shortens the list. One call, two edges,
carrying different things: the item leaves by a real output port, the shortened list by the effect. A grammar
with one channel per block cannot draw it.</p>

<h2>2 · The same scene, three ways</h2>
<p>The geometry is identical in all three; only the cables change.</p>
{panes}
<p><b>What is a toggle and what is not.</b> The <i>stale</i> wires — the ones a reader assumes, from the port
straight to every consumer — are the lens, and they should default off. The <i>effect</i> edges are structural
and always drawn. My earlier framing had that backwards: I called the whole picture a diff you could turn off.
You cannot turn off half a graph.</p>

<h2>3 · The DAG, solved — <code>random_func_before</code> is not infected</h2>
<p>This part stands. A read takes the latest writer at or before it, so statement order decides and the canvas
never has to. Run on your exact program:</p>
<pre><code>{esc(ZACH_SOURCE)}</code></pre>
{reads_table()}
<p class="small"><b>One honest limit.</b> <code>random_func_before</code> is itself an <i>unproven</i> call — it
takes a list into a body the analyzer cannot see. The ordering is right; the claim that it does not also mutate
is not proven, and the board should not pretend. Pure, mutates, unknown — still three states.</p>

<h2>4 · Nesting: the same rule at each level, and it terminates</h2>
<p>Also unchanged, and it is the answer to "how do you keep propagating outwards". A function mutates a
parameter when it writes it in place <b>or</b> hands it to a callee that mutates the parameter in that position.
Iterate over the call graph; the sets only grow and the parameter list is finite, so it converges. It stops
where the object was <i>created</i>: a local is on nobody's interface, so there is no port for the arc to land
on and nothing to carry outward.</p>
{nesting_table()}
<figure>{nesting}<figcaption>Three levels, one rule. The chain measured at build time:
{esc(" → ".join(f"{s['function']}.{s['port']}" for s in CHAIN))}.</figcaption></figure>
<p><b>Always all the way through, collapsed or not.</b> The badge is read off the <i>signature</i>, and a
signature is exactly what a collapsed block shows. A collapsed <code>run()</code> that hid the hook would be
lying about its own interface — and now more than before, because with no return port the effect edge is the
only thing connecting it to what comes next.</p>

<h2>5 · Two mutations: still no second lane</h2>
<p>Your stacking rule works, and the reason it feels bad is right: at three writes it is three lanes converging
on one port and you cannot eyeball which value leaves. The conclusion survives the correction, though the
drawing changes — none of these three calls returns anything, so every edge below is an effect edge.</p>
<figure>{lanes}<figcaption>Your lanes: one write-back per writer.</figcaption></figure>
<figure>{straight_chain}<figcaption>The writers hand the list on through their effects; one write-back
leaves, from the last of them.</figcaption></figure>
<p><b>The stacking only exists because every lane is trying to reach the same port.</b> Let each writer feed the
next through its own effect port and the board is a chain again, read left to right, with exactly one write-back
at the end — which is the plain answer you already gave for which value leaves <code>run()</code>. You keep
what you wanted (trace back along the cable to where it came from) and lose what you did not (N lanes). If you
do keep lanes in the lens, ordinal the pills — <code>mut ①</code>, <code>mut ②</code> — rather than telling
them apart by geometry.</p>

<h2>6 · Effects leave the top, and travel right</h2>
<p>Once the effect port turned out to be a real port — one you can grab and wire by hand — the question of
<i>which edge</i> stops being decoration. Your rule: the whiteboard may route a cable anywhere, but the linter
should prefer an effect that leaves the <b>top</b> and goes <b>right</b>. It is the right rule, and the reason
is that the other three edges are already spoken for.</p>
<div class="callout">
<b>Left</b> — values in.<br>
<b>Right</b> — named values out, by an output port. A mutation has no name to leave by, which is the whole of
§1.<br>
<b>Bottom</b> — the loop lane, from the L1 back-cable default.<br>
<b>Top</b> — the only edge left, and now the one that matters most: a value that leaves it and travels right
keeps the board readable in one direction.
</div>
<p><b>What changed on this page because of that.</b> Earlier boards here drew the write-back looping back
<i>left</i>, into the input port that named the object. That is gone. An input port that was also a source was
always the odd part — now the input port keeps the hook (the signature saying <i>I will change this</i>) and
the new value leaves by the top, level by level, stepping up and to the right. The nesting board above is the
same rule three times: <code>{esc(" → ".join(f"{s['function']}.{s['port']}" for s in CHAIN))}</code>, each
inner effect port feeding the next one out.</p>
<p><b>The port has no slot — it is placed by the cable.</b> You are right that it should not sit at a fixed
spot on the edge: the effect port is derived twice over, its <i>existence</i> from the signature and its
<i>position</i> from wherever the cable you drew crosses the boundary. Drag the cable and the port follows;
route it out of a different edge and the port moves to that edge. That is looser than the Branch region's
control ports, which are derived but slotted, and it is the right kind of loose for a whiteboard — the linter
has an opinion about which crossing it prefers, and no power to stop you.</p>
<figure>{derived}<figcaption>One mutation, three routes. The hollow ring is the port, and it is wherever the
cable meets the boundary.</figcaption></figure>
<div class="callout"><b>The algorithm is written, and it is not about mutations.</b> You asked for it to be
general purpose, so it takes a rectangle and a polyline and answers where they meet — nothing about effects,
ports or Python. <code>src/blocks/elbow/boundaryCrossing.ts</code> ({len(CROSSING_API)} exported functions,
{CROSSING_CASES} test cases, all green) lives with the rest of the pure routing geometry: no tldraw, no React,
no DOM, no runtime deps. It clips each segment against the box (Liang–Barsky, so a diagonal or a flattened
curve works as well as an orthogonal route) and returns, for every crossing, <i>which side</i>, <i>exactly
where</i>, <i>which segment and how far along it</i>, and <i>the arc length from the start</i> — that last one
so a caller can place a thing by distance the way a delayed cable's <code>z⁻¹</code> pill already is.
<code>firstExitPerBox</code> does a nested stack in one pass, which is the block-inside-region-inside-frame
case. The same call serves a group boundary port, a Branch-region tunnel, a collapsed-group crossing badge, or
a clip marker; a mutation's effect port is just the first caller. Two conventions worth knowing: a point
exactly on the boundary counts as <i>on</i>, so a stub starting on a block's top edge exits at its own first
point; and a cable drawn to <i>land</i> on an edge exits there rather than being ignored, because that is the
authored case. <code>prefersSide</code> reports the linter's opinion and never rewrites a route.</div>

<p><b>And chaining is the case that makes it earn its keep.</b> In-place APIs exist precisely so a large object
does not have to be copied, so a run of mutators over one buffer is idiomatic Python, not a smell. Drawn as a
left-to-right chain of effect ports it is concise and it reads in the direction the code was written; drawn as
N write-backs converging on one place it is neither. The two boards in §5 are that comparison.</p>
<p class="small">Two crossings, not one, and only the first is measured below: an effect leaves the
<i>block</i> by its top edge (the rule), and then crosses the enclosing <i>frame</i> somewhere (the derived
port's position). The panels above vary the second; the tally counts the first.</p>
<div class="callout"><b>The lint, run on this page's own boards.</b> Every effect cable drawn here records the
edge it leaves by. <b class="k">{lint['preferred']} of {lint['total']}</b> leave the top —
{"no offenders" if lint['clean'] else "offenders: " + ", ".join(lint['offenders'])}. The rule as the linter
would state it: <i>{esc(lint['rule'])}</i>. It is a preference, not an error: a board that routes one by hand
is not wrong, it is a board.</div>

<h2>7 · Your three questions about the cable</h2>
<div class="strip">{strip}</div>
<div class="callout"><b>Answers, corrected.</b> <b>Colour:</b> I said make it an ordinary grey data cable
"because it is one". It is not one, so that answer goes. An effect edge carries a value that has no return
channel, and a board that draws it identically to a return has thrown away the distinction you just made.
<b>Keep it heavy and distinct</b> — your instinct — with the <code>mut</code> pill naming it. What I would still
avoid is pure black: the region divider and control cables already own that ink. A dark warm ink, or the
existing near-black at a lighter weight than a control line, keeps the two apart.
<b>Over the top vs offset:</b> unchanged, and now it barely arises — the effect edge starts at the top of the
mutating block, not at the port, so it does not naturally lie on top of the stale wire at all. Where they do
converge at a consumer, take <b>L2</b>: the dead wire at 18%, the live one at full weight.
<b>Transparency:</b> yes, at the 18% you already settled for a non-live cable, so a board has one fade.</div>

<div class="callout"><b>Future — the fade should happen on its own, and it needs no new rule.</b> Your note,
recorded here so it is not lost: when you add a mutating call and do <i>not</i> delete the cables that were
already there, those cables should <b>grey themselves out</b> rather than sit on the board as lies. That is the
<a href="many-to-one-2026-09-02.html">many-to-one active-path rule</a> with one word changed. There, several
cables land on one port and the live one is chosen by <i>which arm is running</i>; here, several cables carry
one name and the live one is chosen by <i>which version reaches this read</i>. Same φ, same 18% token, same
lint shape — a port with more than one producer is legal only when something makes them exclusive, and a
version boundary is exactly that something. So the behaviour is: drop a mutating call onto a wired board, and
every read downstream of it re-binds to the new version while the old cables fade. Nothing is deleted, nothing
is moved, and undo puts it back. <b>Not built</b> — this is a note for later, and it is the natural next step
after the analyzer emits effect ports at all.</div>

<h2>8 · The refactor argument gets better, not worse</h2>
<p>I claimed that swapping in <code>poses = [*poses, pose]</code> moves no cables. That was true only under the
fiction. What actually happens is more useful: <b class="k">the refactor converts effect edges into data
edges.</b> The probe reports <b>{PURE_WRITEBACKS}</b> write-backs afterwards — the effect port disappears, a
real output port appears in its place, the hook comes off the input, and <code>run()</code>'s signature stops
carrying the effect. The consumers stay bound to the same versions; only the channel they arrive by changes.</p>
<pre><code>{esc(PURE_SOURCE)}</code></pre>
<p>Which makes the two boards in §1 the before and after of one action: <i>right-click the effect port → make
this pure</i>, with the diff shown before you accept. The left-hand board is what you get. That is still the
feature underneath all of this, and the correction sharpens it rather than weakening it.</p>
<p><b>One free cue worth taking.</b> <code>-&gt; None</code> is Python's own way of saying "this exists for its
effect" — the same thing Rust says with <code>()</code> and Haskell with <code>IO ()</code>. A block with inputs
and <i>no output port at all</i> is therefore already legible as a mutator or a sink, before any badge or pill
is drawn. It costs no ink, and it falls out of drawing the signature honestly.</p>

<h2>9 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul>
<li>{len(CHANNELS)} in-place methods measured by calling them: {len(EFFECT_ONLY)} return nothing,
{len(BOTH_CHANNELS)} return a value as well as mutating.</li>
<li>{len(EFFECT_EDGES)} load-bearing effect edges in your program; {len(FICTIONAL)} invented output port found
on golden 11's target board.</li>
<li>Ordering ({len(STALE_READS)} readers before the write, {len(LIVE_READS)} after) and the nesting fixpoint
({ROUNDS} rounds) re-run unchanged.</li>
</ul></div>
<div><h4>Left</h4><ul>
<li><b>Next:</b> the analyzer stops giving a <code>-&gt; None</code> call an output port and emits an effect
port instead — that one change makes golden 11's board honest.</li>
<li><b>Next:</b> <code>pop</code>-family calls need both a real output and an effect port on the same block.</li>
<li><b>Not started:</b> the stale-wire lens as an opacity pass; <i>make this pure</i> on the effect port.</li>
<li><b>Noted for later (your call, 2026-09-03):</b> adding a mutating call to a wired board should re-bind the
downstream reads and fade the cables it displaced automatically — the many-to-one rule with "which arm" swapped
for "which version". No new mechanism.</li>
</ul></div>
<div><h4>Needs you</h4><ul>
<li><b>Effect ink.</b> Keep your heavy near-black, or a dark warm ink to separate it from control cables?
Default if silent: heavy, warm, one weight below a control line.</li>
<li><b>Effect port position.</b> Top edge, as you draw it. Default if silent: yes, one per mutated name.</li>
<li><b>Lanes for N mutations?</b> Default if silent: no — writers chain through their effect ports.</li>
</ul></div>
<div><h4>Deliberately not done</h4><ul>
<li>No app or analyzer code; boards are SVG in the idiom.</li>
<li>Aliasing beyond a parameter name (an element of another list, a field two levels down) is not modelled.</li>
<li>The <code>pop</code> two-channel case is measured and argued but not drawn.</li>
</ul></div>
</div>
<h3>Reply cheaply</h3>
<p class="small"><code>Pick: … / Keep: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<footer>Built by <code>docs/build_mutation_flow.py</code> at {GIT_HEAD} · channels, versions, propagation and the
chain computed by <code>docs/mutation_effects.py</code> at build time · marks shared with the
<a href="side-effect-grammar-2026-09-02.html">2026-09-02 report</a> via
<code>docs/effect_board_svg.py</code> · Claude Code · Opus 5 (<code>claude-opus-5</code>), revised
2026-09-03 after Zach's correction on <code>append() -&gt; None</code>.</footer>
</main><script>{JS}</script></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({
        "stale_readers": [r.by for r in STALE_READS],
        "live_readers": [r.by for r in LIVE_READS],
        "rounds": ROUNDS,
        "chain": [f"{s['function']}.{s['port']}" for s in CHAIN],
        "writebacks_after_refactor": PURE_WRITEBACKS,
    }, indent=1))


if __name__ == "__main__":
    main()
