#!/usr/bin/env python3
"""Build the five-direction "literal argument as a pill" Babble + Prune gallery.

Emits docs/literal-pill-babble-2026-09-01.json (the frozen comparison data) and
docs/literal-pill-babble-2026-09-01.html (self-contained; captures inlined).

The question it answers, from FR - Block, Ports & Edges Primitive, section
"Support a literal decleration":  `pose = estimate(frame, 2.0)` — the 2.0 is
not a default, it is a source. Assuming a pill carries it, what goes on the pill
and how could it look?

Every prototype is drawn in the app's own idiom (Inter + monospace, the 9px
Block radius, the gold wired dot, the grey definition-default chip) on ONE
shared fixture, and every hero regenerates the Python for its current state so
the round-trip is judged from the picture, not from prose. Numbers about the
current renderer are read from the live tree at build time.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GALLERY = Path("/home/bam/.claude/skills/babble/scripts/gallery.py")
SPEC_PATH = ROOT / "docs" / "literal-pill-babble-2026-09-01.json"
HTML_PATH = ROOT / "docs" / "literal-pill-babble-2026-09-01.html"
ASSETS = ROOT / "docs" / "assets"
VAULT = Path("/home/bam/zach_brain")


# ---------------------------------------------------------------------------
# Measured from the live tree, so the reference board cannot drift from it.
# ---------------------------------------------------------------------------

def measure() -> dict[str, str]:
    css = (ROOT / "src" / "blocks" / "ui" / "block-canvas.css").read_text(encoding="utf-8")
    model = (ROOT / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")

    def rule(selector: str) -> str:
        match = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, re.S)
        if not match:
            raise SystemExit(f"Cannot find {selector} in block-canvas.css")
        return match.group(1)

    def prop(block: str, name: str) -> str:
        match = re.search(rf"\b{name}:\s*([^;]+);", block)
        if not match:
            raise SystemExit(f"Cannot find {name}")
        return match.group(1).strip()

    chip = rule(".systemsketch-block-canvas .BlockNode-portDefault")
    port_name = rule(".systemsketch-block-canvas .BlockNode-portName")
    port_view = re.search(r"port:\s*\{\s*w:\s*(\d+)", model)
    default_field = re.search(r"defaultValue:\s*T\.string\.optional\(\)", model)
    if not port_view or not default_field:
        raise SystemExit("blockModel.ts no longer carries the port-view width or defaultValue")
    return {
        "chip_max_width": prop(chip, "max-width"),
        "chip_font": prop(chip, "font-size"),
        "port_font": prop(port_name, "font-size"),
        "port_view_width": port_view.group(1),
    }


def image_data(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing capture: {path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


# ---------------------------------------------------------------------------
# The shared fixture, drawn once as a compact canvas in the app's idiom.
# ---------------------------------------------------------------------------

FIXTURE_CODE = [
    "def run(raw: bytes) -> bytes:",
    "    frame = decode(raw)",
    "    pose = estimate(frame, 2.0)",
    '    payload = encode(pose, {"quat": True, "units": "m", "frame_id": "base_link"})',
    "    return payload",
]

DICT_LINES = ['{"quat": True,', '"units": "m",', '"frame_id": "base_link"}']

# Canvas geometry (px). One coordinate system for blocks, dots and cables.
# Authored at 600×384 and shown at zoom .9 so the rows have the room the
# app's own inline layout needs (name + type on both sides of one row).
CANVAS_W, CANVAS_H = 600, 384
FRAME = dict(x=10, y=44, w=580, h=236)
CODE_TOP = 292
DECODE = dict(x=36, y=90, w=140)
ESTIMATE = dict(x=226, y=90, w=142)
ENCODE = dict(x=418, y=90, w=158)
INLET = (10, 200)
OUTLET = (590, 200)
GAP_1 = 200   # the elbow column between decode and estimate
GAP_2 = 392   # the elbow column between estimate and encode
PILL_Y = 220  # top of a free pill; its dot sits at PILL_Y + 12
PILL_DOT = PILL_Y + 12


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def chip(text: str, *, dim: bool = False, when: str = "", lp: str = "", to: str = "") -> str:
    classes = "lp-chip" + (" is-dim" if dim else "")
    attrs = ""
    if when:
        attrs += f' data-when="{when}"'
    if lp:
        attrs += f' data-lp="{lp}"'
    if to:
        attrs += f' data-story-to="{to}"'
    return f'<span class="{classes}"{attrs}>{esc(text)}</span>'


class Mini:
    """A Port-view Block at gallery scale: heading, paired rows, footer."""

    HEAD = 26
    PAD = 6
    ROW = 18
    FOOT = 14

    def __init__(self, key: str, x: int, y: int, w: int, title: str, kind: str,
                 rows: list[tuple[tuple | None, tuple | None]], *, when: str = "", extra: str = ""):
        self.key, self.x, self.y, self.w = key, x, y, w
        self.title, self.kind, self.rows, self.when, self.extra = title, kind, rows, when, extra

    @property
    def h(self) -> int:
        return self.HEAD + self.PAD + self.ROW * len(self.rows) + self.PAD + self.FOOT

    def row_y(self, i: int) -> int:
        return self.y + self.HEAD + self.PAD + self.ROW * i + self.ROW // 2

    def in_dot(self, i: int) -> tuple[int, int]:
        return (self.x, self.row_y(i))

    def out_dot(self, i: int) -> tuple[int, int]:
        return (self.x + self.w, self.row_y(i))

    def html(self) -> str:
        rows = []
        for inp, out in self.rows:
            left = ""
            if inp is not None:
                name, typ, *rest = inp
                extra_html = rest[0] if rest else ""
                left = (f'<span class="lp-in"><span class="lp-name">{esc(name)}</span>'
                        f'<span class="lp-type">{esc(typ)}</span>{extra_html}</span>')
            right = ""
            if out is not None:
                name, typ = out
                right = (f'<span class="lp-out"><span class="lp-type">{esc(typ)}</span>'
                         f'<span class="lp-name">{esc(name)}</span></span>')
            rows.append(f'<div class="lp-row">{left}{right}</div>')
        when = f' data-when="{self.when}"' if self.when else ""
        return (f'<div class="lp-block" data-lp="{self.key}"{when} '
                f'style="left:{self.x}px;top:{self.y}px;width:{self.w}px;height:{self.h}px">'
                f'<div class="lp-block-head"><span class="lp-title">{esc(self.title)}</span>'
                f'<span class="lp-kind">{self.kind}</span></div>'
                f'<div class="lp-rows">{"".join(rows)}</div>'
                f'<div class="lp-foot">⋮</div>{self.extra}</div>')


def dot(xy: tuple[int, int], state: str = "", *, when: str = "", lp: str = "") -> str:
    attrs = f' data-when="{when}"' if when else ""
    if lp:
        attrs += f' data-lp="{lp}"'
    return f'<i class="lp-dot {state}"{attrs} style="left:{xy[0]}px;top:{xy[1]}px"></i>'


def elbow(a: tuple[int, int], b: tuple[int, int], via_x: int | None = None) -> str:
    if a[1] == b[1]:
        return f"M{a[0]},{a[1]} H{b[0]}"
    mid = via_x if via_x is not None else (a[0] + b[0]) // 2
    return f"M{a[0]},{a[1]} H{mid} V{b[1]} H{b[0]}"


def cable(d: str, *, when: str = "", cls: str = "") -> str:
    attrs = f' data-when="{when}"' if when else ""
    cls = f' class="{cls}"' if cls else ""
    return f'<path d="{d}"{attrs}{cls}/>'


def wires(paths: list[str]) -> str:
    return (f'<svg class="lp-wires" viewBox="0 0 {CANVAS_W} {CANVAS_H}" aria-hidden="true">'
            f'{"".join(paths)}</svg>')


def frame_html(inner: str, *, head_extra: str = "", when: str = "") -> str:
    attrs = f' data-when="{when}"' if when else ""
    return (f'<div class="lp-expanded"{attrs}>'
            f'<div class="lp-frame" style="left:{FRAME["x"]}px;top:{FRAME["y"]}px;width:{FRAME["w"]}px;height:{FRAME["h"]}px">'
            f'<div class="lp-frame-head"><span class="lp-title">run()</span>'
            f'<span class="lp-kind">{head_extra}def</span></div></div>'
            f'<span class="lp-frame-port" style="left:18px;top:{INLET[1] + 8}px">raw <em>bytes</em></span>'
            f'<span class="lp-frame-port is-right" style="right:18px;top:{OUTLET[1] + 8}px"><em>bytes</em> payload</span>'
            f'{inner}</div>')


def code_strip(lines: list[tuple[str, str, bool]]) -> str:
    """lines: (text, when, hot). `hot` draws the accent bar for the changed line."""
    out = []
    for text, when, hot in lines:
        attrs = f' data-when="{when}"' if when else ""
        cls = "lp-line is-hot" if hot else "lp-line"
        out.append(f'<div class="{cls}"{attrs}>{esc(text)}</div>')
    return f'<div class="lp-code" style="top:{CODE_TOP}px">{"".join(out)}</div>'


def reset_button(state: str) -> str:
    return f'<button type="button" class="lp-reset" data-story-to="{state}">↺ reset</button>'


def blocks(*, gain_extra: str, opts_extra: str) -> tuple[Mini, Mini, Mini]:
    decode = Mini("decode", DECODE["x"], DECODE["y"], DECODE["w"], "decode()", "call",
                  [(("raw", "bytes"), ("frame", "Frame"))])
    estimate = Mini("estimate", ESTIMATE["x"], ESTIMATE["y"], ESTIMATE["w"], "estimate()", "call",
                    [(("frame", "Frame"), ("pose", "Pose")), (("gain", "float", gain_extra), None)])
    encode = Mini("encode", ENCODE["x"], ENCODE["y"], ENCODE["w"], "encode()", "call",
                  [(("pose", "Pose"), ("payload", "bytes")), (("opts", "dict", opts_extra), None)])
    return decode, estimate, encode


def pipeline_wires(decode: Mini, estimate: Mini, encode: Mini) -> list[str]:
    return [
        cable(elbow(INLET, decode.in_dot(0), via_x=22)),
        cable(elbow(decode.out_dot(0), estimate.in_dot(0))),
        cable(elbow(estimate.out_dot(0), encode.in_dot(0))),
        cable(elbow(encode.out_dot(0), OUTLET, via_x=583)),
    ]


def pipeline_dots(decode: Mini, estimate: Mini, encode: Mini) -> str:
    return "".join([
        dot(INLET, "is-wired"), dot(OUTLET, "is-wired"),
        dot(decode.in_dot(0), "is-wired"), dot(decode.out_dot(0), "is-wired"),
        dot(estimate.in_dot(0), "is-wired"), dot(estimate.out_dot(0), "is-wired"),
        dot(encode.in_dot(0), "is-wired"), dot(encode.out_dot(0), "is-wired"),
    ])


def code_inline(hot_state: str = "base") -> list[tuple[str, str, bool]]:
    return [(FIXTURE_CODE[2], hot_state, True)]


def code_hoisted(states: str) -> list[tuple[str, str, bool]]:
    return [("    gain = 2.0", states, True), ("    pose = estimate(frame, gain)", states, True)]


def code_lines(middle: list[tuple[str, str, bool]], *, long_hot: str = "") -> list[tuple[str, str, bool]]:
    return ([(FIXTURE_CODE[0], "", False), (FIXTURE_CODE[1], "", False)] + middle
            + [(FIXTURE_CODE[3], "", False) if not long_hot else (FIXTURE_CODE[3], "", False)]
            + [(FIXTURE_CODE[4], "", False)])


def pill(text_spans: str, *, cls: str, lp: str, left: int, top: int, width: int,
         with_dot: str = "", when: str = "") -> str:
    attrs = f' data-when="{when}"' if when else ""
    return (f'<div class="lp-pill {cls}" data-lp="{lp}"{attrs} '
            f'style="left:{left}px;top:{top}px;width:{width}px">{text_spans}{with_dot}</div>')


def preview_card(left: int, top: int, *, when: str, caret: int, below: bool = False) -> str:
    lines = "".join(f"<div>{esc(line)}</div>" for line in DICT_LINES)
    cls = "lp-card is-below" if below else "lp-card"
    return (f'<div class="{cls}" data-when="{when}" style="left:{left}px;top:{top}px;--caret:{caret}px">'
            f'<div class="lp-card-head">dict · 3 keys</div>{lines}</div>')


def canvas(vid: str, body: str) -> str:
    return f'<div class="lp" data-v="{vid}">{body}</div>'


# ---------------------------------------------------------------------------
# V1 · Capsule — the sketch, formalised: a stock oval with `= 2.0`, one outlet.
# ---------------------------------------------------------------------------

def preview_v1() -> str:
    decode, estimate, encode = blocks(
        gain_extra=chip("= 1.0", dim=True), opts_extra=chip("= None", dim=True))
    gain_dot_xy = (170, PILL_DOT)
    opts_dot_xy = (360, PILL_DOT)
    body = frame_html(
        "".join(m.html() for m in (decode, estimate, encode))
        + wires(pipeline_wires(decode, estimate, encode) + [
            cable(elbow(gain_dot_xy, estimate.in_dot(1), via_x=GAP_1)),
            cable(elbow(opts_dot_xy, encode.in_dot(1), via_x=GAP_2)),
        ])
        + pipeline_dots(decode, estimate, encode)
        + dot(estimate.in_dot(1), "is-wired") + dot(encode.in_dot(1), "is-wired")
        + pill('<span data-when="base preview" data-story-to="named">= 2.0</span>'
               '<span data-when="named">gain = 2.0</span>',
               cls="gain", lp="pill-gain", left=106, top=PILL_Y, width=64,
               with_dot='<i class="lp-dot is-wired lp-pill-dot"></i>')
        + pill('<span data-story-to="preview">= …</span>',
               cls="opts", lp="pill-opts", left=314, top=PILL_Y, width=46,
               with_dot='<i class="lp-dot is-wired lp-pill-dot"></i>')
        + preview_card(262, 148, when="preview", caret=70)
    )
    code = code_strip(code_lines(
        [(FIXTURE_CODE[2], "base preview", True)] + code_hoisted("named")))
    return canvas("v1", body + code + reset_button("base"))


# ---------------------------------------------------------------------------
# V2 · Value Block — a Block in a fourth view; the body already exists.
# ---------------------------------------------------------------------------

def vcard(*, lp: str, left: int, top: int, width: int, heading: str, tag: str,
          body_lines: list[str] | None, when: str = "", to: str = "", open_: bool = False) -> str:
    attrs = f' data-when="{when}"' if when else ""
    attrs += f' data-story-to="{to}"' if to else ""
    body = ""
    if body_lines:
        body = '<div class="lp-vbody">' + "".join(f"<div>{esc(l)}</div>" for l in body_lines) + "</div>"
    cls = "lp-vcard" + (" is-open" if open_ else "")
    return (f'<div class="{cls}" data-lp="{lp}"{attrs} style="left:{left}px;top:{top}px;width:{width}px">'
            f'<div class="lp-vhead"><span class="lp-vtitle">{esc(heading)}</span><span class="lp-kind">{esc(tag)}</span>'
            f'<i class="lp-dot is-wired lp-vdot"></i></div>{body}</div>')


def preview_v2() -> str:
    decode, estimate, encode = blocks(
        gain_extra=chip("= 1.0", dim=True), opts_extra=chip("= None", dim=True))
    gain_dot_xy = (170, PILL_Y + 13)
    opts_dot_xy = (360, 219)
    body = frame_html(
        "".join(m.html() for m in (decode, estimate, encode))
        + wires(pipeline_wires(decode, estimate, encode) + [
            cable(elbow(gain_dot_xy, estimate.in_dot(1), via_x=GAP_1)),
            cable(elbow(opts_dot_xy, encode.in_dot(1), via_x=GAP_2)),
        ])
        + pipeline_dots(decode, estimate, encode)
        + dot(estimate.in_dot(1), "is-wired") + dot(encode.in_dot(1), "is-wired")
        + vcard(lp="card-gain", left=86, top=PILL_Y, width=84, heading="2.0", tag="float",
                body_lines=None, when="base open", to="named")
        + vcard(lp="card-gain-named", left=86, top=PILL_Y, width=84, heading="gain", tag="float",
                body_lines=["2.0"], when="named")
        + vcard(lp="card-opts", left=270, top=206, width=90, heading="{…}", tag="dict",
                body_lines=['"quat": True,', '"units": "m", …'], when="base named", to="open")
        + vcard(lp="card-opts-open", left=270, top=206, width=90, heading="{…}", tag="dict",
                body_lines=DICT_LINES, when="open", open_=True)
    )
    code = code_strip(code_lines(
        [(FIXTURE_CODE[2], "base open", True)] + code_hoisted("named")))
    return canvas("v2", body + code + reset_button("base"))


# ---------------------------------------------------------------------------
# V3 · Docked plug — the pill plugs straight into its port; no cable until
# you pull it off, and pulling it off names it after the parameter.
# ---------------------------------------------------------------------------

def preview_v3() -> str:
    decode, estimate, encode = blocks(
        gain_extra=chip("= 1.0", dim=True), opts_extra=chip("= None", dim=True))
    free_dot_xy = (170, PILL_DOT)
    docked_top = estimate.row_y(1) - 11
    body = frame_html(
        "".join(m.html() for m in (decode, estimate, encode))
        + wires(pipeline_wires(decode, estimate, encode) + [
            cable(elbow(free_dot_xy, estimate.in_dot(1), via_x=GAP_1), when="unplugged"),
        ])
        + pipeline_dots(decode, estimate, encode)
        + dot(estimate.in_dot(1), "is-plugged", when="docked preview")
        + dot(estimate.in_dot(1), "is-wired", when="unplugged")
        + dot(encode.in_dot(1), "is-plugged")
        + pill('<span data-when="docked preview" data-story-to="unplugged">2.0</span>'
               '<span data-when="unplugged" data-story-to="docked">gain = 2.0</span>',
               cls="gain is-docked", lp="plug-gain", left=ESTIMATE["x"] + 4 - 44, top=docked_top, width=44,
               with_dot='<i class="lp-dot is-wired lp-pill-dot" data-when="unplugged"></i>')
        + pill('<span data-story-to="preview">{…}</span>',
               cls="opts is-docked", lp="plug-opts", left=ENCODE["x"] + 4 - 44, top=docked_top, width=44)
        + preview_card(330, 172, when="preview", caret=66, below=True)
    )
    code = code_strip(code_lines(
        [(FIXTURE_CODE[2], "docked preview", True)] + code_hoisted("unplugged")))
    return canvas("v3", body + code + reset_button("docked"))


# ---------------------------------------------------------------------------
# V4 · Inline literal — the kit's NodeInputRow: no shape until you extract.
# ---------------------------------------------------------------------------

def field(text: str, *, lp: str = "", when: str = "", controls: str = "") -> str:
    attrs = f' data-when="{when}"' if when else ""
    if lp:
        attrs += f' data-lp="{lp}"'
    return f'<span class="lp-field"{attrs}>{esc(text)}{controls}</span>'


def preview_v4() -> str:
    gain_extra = (
        field("2.0", lp="field-gain", when="base",
              controls='<b class="lp-fx" data-story-to="cleared" title="Clear the literal">×</b>'
                       '<b class="lp-fx" data-story-to="extracted" title="Extract to variable">⤴</b>')
        + chip("= 1.0", when="cleared", lp="chip-gain", to="base")
        + chip("= 1.0", dim=True, when="extracted")
    )
    opts_extra = field("{…}", lp="field-opts")
    decode, estimate, encode = blocks(gain_extra=gain_extra, opts_extra=opts_extra)
    gain_dot_xy = (170, PILL_DOT)
    body = frame_html(
        "".join(m.html() for m in (decode, estimate, encode))
        + wires(pipeline_wires(decode, estimate, encode) + [
            cable(elbow(gain_dot_xy, estimate.in_dot(1), via_x=GAP_1), when="extracted"),
        ])
        + pipeline_dots(decode, estimate, encode)
        + dot(estimate.in_dot(1), "is-literal", when="base")
        + dot(estimate.in_dot(1), "is-default", when="cleared")
        + dot(estimate.in_dot(1), "is-wired", when="extracted")
        + dot(encode.in_dot(1), "is-literal")
        + pill('<span>gain = 2.0</span>', cls="gain", lp="pill-gain", left=70, top=PILL_Y, width=100,
               when="extracted", with_dot='<i class="lp-dot is-wired lp-pill-dot"></i>')
    )
    code = code_strip(code_lines(
        [(FIXTURE_CODE[2], "base", True),
         ("    pose = estimate(frame)          # gain falls back to 1.0", "cleared", True)]
        + code_hoisted("extracted")))
    return canvas("v4", body + code + reset_button("base"))


# ---------------------------------------------------------------------------
# V5 · Locals rail — the enclosing run() owns its literals as rows.
# ---------------------------------------------------------------------------

def preview_v5() -> str:
    decode, estimate, encode = blocks(
        gain_extra=chip("= 1.0", dim=True), opts_extra=chip("= None", dim=True))
    locals_top = 222
    gain_row_dot = (146, locals_top + 23)
    opts_row_dot = (146, locals_top + 41)
    locals_panel = (
        f'<div class="lp-locals" data-lp="locals" style="left:18px;top:{locals_top}px;width:128px">'
        '<div class="lp-locals-head">locals</div>'
        '<div class="lp-lrow" data-lp="local-gain" data-story-to="named">'
        '<span data-when="base collapsed">= 2.0</span><span data-when="named">gain = 2.0</span></div>'
        '<div class="lp-lrow"><span>= {…}</span></div>'
        '</div>'
    )
    collapsed = Mini("run-collapsed", DECODE["x"], DECODE["y"], 168, "run()",
                     '<span class="lp-collapse" data-lp="expand" data-story-to="base" title="Expand">▸</span>def',
                     [(("raw", "bytes"), ("payload", "bytes"))], when="collapsed")
    body = frame_html(
        "".join(m.html() for m in (decode, estimate, encode))
        + wires(pipeline_wires(decode, estimate, encode) + [
            cable(elbow(gain_row_dot, estimate.in_dot(1), via_x=GAP_1)),
            cable(elbow(opts_row_dot, encode.in_dot(1), via_x=GAP_2)),
        ])
        + pipeline_dots(decode, estimate, encode)
        + dot(estimate.in_dot(1), "is-wired") + dot(encode.in_dot(1), "is-wired")
        + locals_panel
        + dot(gain_row_dot, "is-wired") + dot(opts_row_dot, "is-wired"),
        head_extra='<span class="lp-collapse" data-lp="collapse" data-story-to="collapsed" title="Collapse to Port view">▾</span>',
        when="base named",
    )
    body += collapsed.html()
    body += dot(collapsed.in_dot(0), "", when="collapsed") + dot(collapsed.out_dot(0), "", when="collapsed")
    code = code_strip(code_lines(
        [(FIXTURE_CODE[2], "base collapsed", True)] + code_hoisted("named")))
    return canvas("v5", body + code + reset_button("base"))


# ---------------------------------------------------------------------------
# Anatomy sheets — the 2×2 (unnamed/named × short/long) from the sketch, in
# each direction's own grammar, at a larger scale than the hero.
# ---------------------------------------------------------------------------

SHEET_LABELS = ["short · no name", "short · named", "long · no name", "long · named"]


def sheet(cells: list[str], note: str = "") -> str:
    items = "".join(
        f'<div class="lp-cell"><small>{esc(label)}</small><div class="lp-cell-body">{cell}</div></div>'
        for label, cell in zip(SHEET_LABELS, cells))
    note_html = f'<p class="lp-sheet-note">{note}</p>' if note else ""
    return f'<div class="lp-sheet">{items}</div>{note_html}'


def inline_pill(text: str, *, docked: bool = False) -> str:
    cls = "lp-pill lp-pill--inline" + (" is-docked" if docked else "")
    dot_html = "" if docked else '<i class="lp-dot is-wired lp-pill-dot"></i>'
    return f'<span class="{cls}">{esc(text)}{dot_html}</span>'


def socket_stub(name: str, typ: str, dot_state: str = "is-plugged") -> str:
    return (f'<span class="lp-stub"><i class="lp-dot {dot_state} lp-stub-dot"></i>'
            f'<span class="lp-name">{esc(name)}</span><span class="lp-type">{esc(typ)}</span></span>')


def inline_vcard(heading: str, tag: str, body_lines: list[str] | None, width: int = 96) -> str:
    body = ""
    if body_lines:
        body = '<div class="lp-vbody">' + "".join(f"<div>{esc(l)}</div>" for l in body_lines) + "</div>"
    return (f'<span class="lp-vcard lp-vcard--inline" style="width:{width}px">'
            f'<div class="lp-vhead"><span class="lp-vtitle">{esc(heading)}</span><span class="lp-kind">{esc(tag)}</span>'
            f'<i class="lp-dot is-wired lp-vdot"></i></div>{body}</span>')


def inline_row(name: str, typ: str, extra: str, dot_state: str) -> str:
    return (f'<span class="lp-stub lp-stub--row"><i class="lp-dot {dot_state} lp-stub-dot"></i>'
            f'<span class="lp-name">{esc(name)}</span><span class="lp-type">{esc(typ)}</span>{extra}</span>')


def inline_local(text: str) -> str:
    return (f'<span class="lp-locals lp-locals--inline"><span class="lp-lrow">{esc(text)}</span>'
            f'<i class="lp-dot is-wired lp-local-dot"></i></span>')


def media_v1() -> list[dict[str, str]]:
    return [{
        "label": "Anatomy · the 2×2 from the sketch",
        "caption": "One object with an optional name. `= …` folds a long value; the outlet is the same 12px dot every port has.",
        "html": sheet([inline_pill("= 2.0"), inline_pill("gain = 2.0"), inline_pill("= …"), inline_pill("opts = …")]),
    }]


def media_v2() -> list[dict[str, str]]:
    return [{
        "label": "Anatomy · a Block wearing its value",
        "caption": "Heading = value or name, tag = inferred type, body = the value once named or long. Nothing here is new chrome.",
        "html": sheet([
            inline_vcard("2.0", "float", None, 84),
            inline_vcard("gain", "float", ["2.0"], 84),
            inline_vcard("{…}", "dict", ['"quat": True,', '"units": "m", …'], 110),
            inline_vcard("opts", "dict", ['"quat": True,', '"units": "m", …'], 110),
        ]),
    }]


def media_v3() -> list[dict[str, str]]:
    return [{
        "label": "Anatomy · docked is unnamed by definition",
        "caption": "A docked pill is the argument itself. Pulling it off the socket is what names it (after the parameter), so the named cells are free pills.",
        "html": sheet([
            inline_pill("2.0", docked=True) + socket_stub("gain", "float"),
            inline_pill("gain = 2.0") + '<span class="lp-arrow">⟶</span>' + socket_stub("gain", "float", "is-wired"),
            inline_pill("{…}", docked=True) + socket_stub("opts", "dict"),
            inline_pill("opts = {…}") + '<span class="lp-arrow">⟶</span>' + socket_stub("opts", "dict", "is-wired"),
        ]),
    }]


def media_v4() -> list[dict[str, str]]:
    return [{
        "label": "Anatomy · the row carries it",
        "caption": "Solid field = supplied literal; grey chip = definition default. A name has nowhere to live on a row, so the named cells become a pill by extraction.",
        "html": sheet([
            inline_row("gain", "float", field("2.0"), "is-literal"),
            inline_row("gain", "float", "", "is-wired") + '<span class="lp-arrow">⟵</span>' + inline_pill("gain = 2.0"),
            inline_row("opts", "dict", field("{…}"), "is-literal"),
            inline_row("opts", "dict", "", "is-wired") + '<span class="lp-arrow">⟵</span>' + inline_pill("opts = …"),
        ]),
    }]


def media_v5() -> list[dict[str, str]]:
    return [{
        "label": "Anatomy · rows in the scope that owns them",
        "caption": "Each local is a row with an outlet, like a port row. Unnamed rows exist only while a literal has one consumer; naming is typing in the row.",
        "html": sheet([inline_local("= 2.0"), inline_local("gain = 2.0"), inline_local("= {…}"), inline_local("opts = {…}")]),
    }]


# ---------------------------------------------------------------------------
# The frozen comparison contract.
# ---------------------------------------------------------------------------

REQUIREMENTS = [
    {
        "id": "fr1", "name": "The picture regenerates one Python program", "weight": 30,
        "why": "SystemSketch is a lens over source (the goldens go source.py ↔ target.systemsketch). A drawing that could mean estimate(frame, 2.0), gain = 2.0 + estimate(frame, gain), or estimate(frame) with the default is a bug, not a style.",
        "passCondition": "From the canvas alone, a reader can say which of the three programs the literal regenerates to, without opening an inspector.",
        "anchors": {
            "1": "A supplied literal and the definition default look the same, or a name changes nothing visible.",
            "3": "Literal and default are distinct, but whether the value is hoisted (named) is ambiguous or lives in two places.",
            "5": "All three states are visibly distinct and the name sits exactly where Python puts it.",
        },
    },
    {
        "id": "fr2", "name": "No new whiteboard vocabulary", "weight": 25,
        "why": "The design rests on tldraw staying stock and on composing from things a whiteboard user already knows (Block, port dot, cable, click-to-edit). Every new gesture is a relearning cost Zach has ruled out.",
        "passCondition": "Every gesture in the direction already exists in the app or in tldraw; only a style value or a command is new.",
        "anchors": {
            "1": "A new primitive with its own drag, snap, or edit behaviour.",
            "3": "Existing primitives, but one new gesture (a new binding, a dock, a rail) to learn.",
            "5": "Only existing primitives and existing gestures; the new thing is a value of an existing style or one menu command.",
        },
    },
    {
        "id": "fr3", "name": "Literals do not bury the pipeline", "weight": 20,
        "why": "Real calls carry several scalar parameters. If each costs a shape and a cable, decode → estimate → encode disappears under its own arguments — the reason the workflow kit keeps a single-use literal on the row.",
        "passCondition": "Three literal arguments on one Block add at most one row each and no cable that crosses the pipeline.",
        "anchors": {
            "1": "Every literal always costs a free shape plus a cable.",
            "3": "A shape plus a cable, but compact, or avoidable for the common case.",
            "5": "A single-use literal costs a row or less; shapes appear only when a value is shared or named.",
        },
    },
    {
        "id": "fr4", "name": "Long values stay legible", "weight": 10,
        "why": "A dict or a long string as an argument is common; the sketch already folds it to `= …`. It must never widen a Block or a row, and the whole value must be one gesture away.",
        "passCondition": "A dict literal renders folded and can be read in full without leaving the canvas.",
        "anchors": {
            "1": "The long value pushes the layout or is simply cut off with no way to read it.",
            "3": "Folded, with the full value only in a tooltip or an inspector.",
            "5": "Folded, with the full value readable in place on demand.",
        },
    },
    {
        "id": "fr5", "name": "Promotes to a named, shared value in one move", "weight": 15,
        "why": "`var = 2.0; estimate(frame, var)` is the refactor in the brief (extract variable). Naming, and then feeding two calls from one source, should be one gesture each and land the name where Python puts it.",
        "passCondition": "A literal can be named in place and its outlet can feed a second consumer without duplicating the value.",
        "anchors": {
            "1": "No way to name or share without redrawing.",
            "3": "Naming works; sharing requires duplicating the literal or a second step.",
            "5": "Name in place, fan out from the same outlet the port model already has.",
        },
    },
]

HARD_GATES = [
    {"id": "g1", "name": "Source ≠ definition default",
     "why": "The grey `= 1.0` chip on estimate's row is a fact about estimate; the 2.0 is a fact about this call. If they render identically, estimate(frame) and estimate(frame, 1.0) become one picture."},
    {"id": "g2", "name": "tldraw stays stock",
     "why": "Composed only through the Block shape, port, cable/binding, geo and text seams. No forked drag, snap or z-order logic."},
    {"id": "g3", "name": "Same fixture, same fidelity",
     "why": "run() → decode → estimate(frame, 2.0) → encode(pose, {…}) on every hero, with estimate's own default 1.0 present so the gate above is testable."},
]

AXES = [
    {"name": "Where the literal lives", "values": ["free capsule on canvas", "free Block on canvas", "docked on its port", "on the port row", "in run()'s locals zone"]},
    {"name": "What owns it", "values": ["the page", "the page", "the consuming Block", "the consuming Block", "the enclosing Expanded Block"]},
    {"name": "How it becomes a variable", "values": ["edit the text", "edit the heading", "pull it off the socket", "Extract to variable", "type in the row"]},
    {"name": "Long value", "values": ["= … + hover card", "preview in the body", "= … + hover card", "{…} field + hover", "= {…} row + hover"]},
]

INVARIANTS = [
    "The literal is a source: data flows out of it into an input port, and which end is the source is judged at the landing (the app's existing rule).",
    "Python grammar on the object: `name = value`, `= value` when unnamed, `= …` when long.",
    "estimate's definition default (`= 1.0`, grey chip) stays on the row; a wired or supplied port dims it.",
    "Prototype-only: HTML/CSS in the app's idiom, nothing in the renderer, no .systemsketch schema change.",
]


def score(value: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def gate_results(g1: str, g2: str, g3: str = "The hero draws run(), decode, estimate with its 1.0 default, encode with the dict, at the same scale as every other variant.") -> dict[str, object]:
    return {
        "g1": {"pass": True, "evidence": g1},
        "g2": {"pass": True, "evidence": g2},
        "g3": {"pass": True, "evidence": g3},
    }


def story(title: str, steps: list[tuple[str, str, str, str]]) -> dict[str, object]:
    return {"title": title, "steps": [
        {"label": label, "caption": caption, "state": state, "target": target}
        for label, caption, state, target in steps]}


VARIANTS = [
    {
        "id": "v1", "name": "Capsule", "accent": "#c08520",
        "thesis": "The sketch, formalised: a stock oval reading `= 2.0`, one outlet on its rim, wired into the port like anything else.",
        "previewLabel": "run() · click the pills",
        "preview": preview_v1(),
        "story": story("A capsule is a source", [
            ("The literal is its own shape", "2.0 sits in a capsule wired into gain. The grey `= 1.0` on the row is estimate's definition default, dimmed because this call overrides it.", "base", '[data-lp="pill-gain"]'),
            ("Name it", "Click the text and type a name, like a Block title. The name is the only thing that changes the Python: `gain = 2.0` is hoisted above the call.", "named", '[data-lp="pill-gain"]'),
            ("A long value folds", "The dict wired into encode.opts reads `= …`; hovering it (here, a click) shows the whole literal in a card.", "preview", '[data-lp="pill-opts"]'),
        ]),
        "media": media_v1(),
        "decisions": [
            {"label": "The object", "value": "tldraw's own `oval` geo silhouette with a single outlet dot; text edits like any tldraw text."},
            {"label": "Name is the semantics", "value": "An unnamed capsule regenerates inline; a named one hoists `name = value` immediately before its first consumer."},
            {"label": "Long value", "value": "`= …` on the capsule, the full literal in a hover card (touch: tap)."},
        ],
        "bestWhen": "A value is a thing you want to see and point at — a tunable, a constant with a name — and calls have one or two such arguments.",
        "losesWhen": "A call has four scalar parameters: four capsules and four cables hide the pipeline the diagram exists to show.",
        "keepParts": ["capsule silhouette from the sketch", "name-is-the-semantics rule", "`= …` fold with hover card"],
        "proof": [
            "The hero is the shared fixture with the definition default and the supplied literal both visible.",
            "Naming and the long-value card are live states; the code strip regenerates three distinct programs from three distinct pictures.",
        ],
        "scores": {
            "fr1": score(5, "Capsule vs grey chip separates supplied from default; the named state is a different label and a different code line. Three pictures, three programs."),
            "fr2": score(4, "Oval, text and cable all exist in stock tldraw and the app; the outlet on a non-Block shape is the one new thing (a port on a geo, or a Block in a capsule view)."),
            "fr3": score(2, "Every literal is a shape and a cable, always. Compact, but the hero already shows two capsules and two extra cables for two arguments."),
            "fr4": score(5, "`= …` keeps the capsule 46px wide; the card shows all three lines of the dict in place."),
            "fr5": score(5, "Name by editing the text; the outlet fans out exactly like a Block output already does (fan-out merged 2026-09-01)."),
        },
        "gateResults": gate_results(
            "The supplied 2.0 is a separate shape; the definition default stays the grey row chip, dimmed when overridden.",
            "Oval geo + text + one outlet + the existing cable/binding seam; no new drag or snap logic."),
    },
    {
        "id": "v2", "name": "Value Block", "accent": "#3f6fa8",
        "thesis": "A Block in a fourth view: heading holds the value or its name, the outlet carries the inferred type, and the body already exists for long values.",
        "previewLabel": "run() · click the cards",
        "preview": preview_v2(),
        "story": story("The value is a Block", [
            ("Same primitive, new view", "The literal is a Block whose view is `value`. Its heading holds 2.0, its tag the inferred type, its outlet is an ordinary port — so click-to-edit, the inspector, batch styles and fan-out come free.", "base", '[data-lp="card-gain"]'),
            ("Name it", "Naming moves the value into the body and puts the name in the heading, where a Block's title already lives.", "named", '[data-lp="card-gain-named"]'),
            ("A long value has a body", "The dict shows a two-line preview without hovering. Click to open the whole literal in place.", "open", '[data-lp="card-opts-open"]'),
        ]),
        "media": media_v2(),
        "decisions": [
            {"label": "The object", "value": "The existing Block shape with `view: 'value'` — one more value of the view style, no new shape util."},
            {"label": "Type on the outlet", "value": "The inferred type (`float`, `dict`) shows where a Block shows its kind, so cables can be type-checked by the same judge."},
            {"label": "Long value", "value": "Preview lines in the body by default; open expands the card, no hover needed."},
        ],
        "bestWhen": "You want zero new machinery: every Block behaviour (edit, inspect, batch, wire, fan out, save) applies to values the day it ships.",
        "losesWhen": "The card is heavier than a capsule; a page of small constants looks like a page of tiny Blocks.",
        "keepParts": ["Block view `value` (no new shape)", "type tag on the outlet", "preview-in-body for long values"],
        "proof": [
            "Three live states on the shared fixture; the open dict card shows all three lines in place.",
            "The code strip hoists `gain = 2.0` only in the named state.",
        ],
        "scores": {
            "fr1": score(5, "Card vs grey chip; named state changes heading and body and the code line. Three pictures, three programs."),
            "fr2": score(5, "No new shape, gesture or binding: a Block view value. Everything shown is the Block's existing chrome."),
            "fr3": score(1, "A card plus a cable per literal, and the card is larger than a capsule; two arguments already fill the strip under the pipeline."),
            "fr4": score(5, "Preview visible with no hover; open state shows the full dict in the body without a floating card."),
            "fr5": score(5, "Title edit names it; a Block output already fans out."),
        },
        "gateResults": gate_results(
            "The value card is a separate shape; the definition default stays the grey row chip.",
            "Adds a value to the existing view style prop; the Block util already renders headings, bodies and ports."),
    },
    {
        "id": "v3", "name": "Docked plug", "accent": "#2f7f62",
        "thesis": "The pill plugs straight into its port — no cable. Pull it off the socket and it becomes a free source named after the parameter.",
        "previewLabel": "run() · click the plug",
        "preview": preview_v3(),
        "story": story("Position is the refactor", [
            ("Docked = literal argument", "The pill sits on the socket: 2.0 is the argument, nothing else is drawn. A dark dot means 'a plug is in'.", "docked", '[data-lp="plug-gain"]'),
            ("Pull it off", "Drag it away and it is a free pill with a cable — and it takes the parameter's name, so the code hoists `gain = 2.0`. Drag it back to inline it.", "unplugged", '[data-lp="plug-gain"]'),
            ("Long value, docked", "A docked `= …` still folds; a click shows the whole literal.", "preview", '[data-lp="plug-opts"]'),
        ]),
        "media": media_v3(),
        "decisions": [
            {"label": "Docked", "value": "A pill↔port binding (a new binding type through the BindingUtil seam) keeps the pill flush on the socket; no cable is drawn, and the pill shows only the value (`2.0`, `{…}`) because nothing is being assigned."},
            {"label": "Unplug = extract variable", "value": "Detaching creates the cable and proposes the parameter's name, so the position of the pill is the inline/hoisted decision."},
            {"label": "Sockets", "value": "A plugged port dot is dark; a wired one is gold; a default-only one is grey — three dot states."},
        ],
        "bestWhen": "You want the economy of a row for single-use literals but the same object for shared ones — one pill, two positions.",
        "losesWhen": "Docking is a new snap behaviour to learn and to build; a docked pill in the gap between two Blocks is cramped at the current Block spacing.",
        "keepParts": ["dock/undock as the inline/extract gesture", "parameter name proposed on extract", "plugged-dot state"],
        "proof": [
            "The docked, unplugged and preview states are live; the pill animates off the socket and the cable appears.",
            "The code strip switches from inline to hoisted only when the pill is off the socket.",
        ],
        "scores": {
            "fr1": score(4, "Docked/unplugged map to inline/hoisted and the default chip stays distinct; but a docked pill that is later renamed has two positions for one program, and the auto-name is a proposal the reader cannot see was accepted.", "medium"),
            "fr2": score(2, "Docking is a new binding and a new drag-off gesture; nothing in the app or in stock tldraw plugs a shape onto a port today."),
            "fr3": score(4, "A docked literal costs no cable and no free shape; it still costs a pill-width in the gap before the Block."),
            "fr4": score(4, "`= …` folds; the card floats over the neighbouring Block because the docked pill has no room of its own."),
            "fr5": score(4, "Naming is the unplug itself; sharing then fans out from the free pill — two gestures rather than one."),
        },
        "gateResults": gate_results(
            "A docked pill is a shape on the socket; the definition default remains the grey chip on the row.",
            "A new binding type is a supported seam; snapping reuses tldraw's own snap. No engine change, but the gate is passed on the seam, not on zero new code."),
    },
    {
        "id": "v4", "name": "Inline literal", "accent": "#7667c6",
        "thesis": "No shape at all: the unconnected row carries its literal in an editable field, exactly as the workflow kit's NodeInputRow does. A pill appears only when you extract.",
        "previewLabel": "run() · click × or ⤴",
        "preview": preview_v4(),
        "story": story("The row carries it", [
            ("The argument lives on the row", "`gain float 2.0`: the solid field is the supplied literal (a dark dot says so); the grey chip would be the definition default. Nothing new is drawn on the canvas.", "base", '[data-lp="field-gain"]'),
            ("Clear it", "Clear the field and estimate's own default shows as the grey chip; the code drops the argument.", "cleared", '[data-lp="chip-gain"]'),
            ("Extract to variable", "⤴ hoists it into a pill with a cable — the Capsule appears only when a name is wanted.", "extracted", '[data-lp="pill-gain"]'),
        ]),
        "media": media_v4(),
        "decisions": [
            {"label": "The object", "value": "None. The port row gains an editable value field, in the spot the definition-default chip already occupies."},
            {"label": "Supplied vs default", "value": "Solid field + dark dot = supplied; grey chip + grey dot = default. Wiring a cable hides the field (the kit's rule)."},
            {"label": "Extract", "value": "A context-menu command creates the pill and the cable, proposing the parameter name."},
        ],
        "bestWhen": "Calls carry many scalar parameters and the pipeline's silhouette matters more than any one value — the common case in an image pipeline.",
        "losesWhen": "The row is already tight: at the current Block width the chip alone crowds the name to `g…` (see the reference capture). Shared values need the extract step.",
        "keepParts": ["field-on-the-row for single-use literals", "solid-vs-ghost supplied/default rule", "Extract to variable command"],
        "proof": [
            "Base, cleared and extracted are live; the dot changes dark → grey → gold with the state.",
            "The code strip shows inline, defaulted and hoisted programs for the three states.",
        ],
        "scores": {
            "fr1": score(4, "Inline, defaulted and hoisted are three pictures and three programs; but supplied-1.0 vs default-1.0 rests on field weight alone on the same row.", "medium"),
            "fr2": score(4, "The kit's own NodeInputRow, in the slot the app's default chip already uses; the only new thing is the Extract command."),
            "fr3": score(5, "A literal costs nothing beyond the row it already has; the pipeline strip stays empty."),
            "fr4": score(3, "`{…}` fits, but the row has the least room of any direction — the real app already ellipsises `g… fl…` at 340px — and the full value is hover-only."),
            "fr5": score(3, "Naming means extracting first; sharing is impossible inline."),
        },
        "gateResults": gate_results(
            "Solid field with a dark dot vs grey chip with a grey dot — distinct, though it is the subtlest pair in the set.",
            "A field on a row the Block util already lays out; the Extract command composes existing create-shape and connect operations."),
    },
    {
        "id": "v5", "name": "Locals rail", "accent": "#b84939",
        "thesis": "run() owns its literals: they are rows in a locals zone inside the Expanded Block, each with an outlet, wired to whichever call uses them.",
        "previewLabel": "run() · click a row or ▾",
        "preview": preview_v5(),
        "story": story("Literals belong to the scope", [
            ("A zone, not a shape", "Inside run() a small locals zone lists every literal as a row with an outlet. The rows are the same grammar as port rows.", "base", '[data-lp="locals"]'),
            ("Name it in the row", "Typing a name in the row hoists it; the row reads `gain = 2.0` and the code follows.", "named", '[data-lp="local-gain"]'),
            ("Collapse the scope", "Collapse run() to its Port view and the locals go with it — literals are private to the function, exactly like Python.", "collapsed", '[data-lp="expand"]'),
        ]),
        "media": media_v5(),
        "decisions": [
            {"label": "Owner", "value": "The enclosing Expanded Block, not the page: the zone is part of run()'s layout, so it moves, collapses and saves with run()."},
            {"label": "Rows", "value": "Each literal is a row with an outlet, sharing the port row's typography and dot; a row feeds any number of consumers."},
            {"label": "Long value", "value": "`= {…}` on the row, full value on hover; the zone never widens."},
        ],
        "bestWhen": "You think of a function's constants as its state — the class-family sketch with a state zone on top — and want every literal findable in one place.",
        "losesWhen": "Every literal is now far from its consumer, so each needs a cable across the frame; an unnamed row in a zone called locals reads as a variable.",
        "keepParts": ["locals zone as part of the Expanded layout", "row-with-outlet grammar", "collapse-hides-locals scope rule"],
        "proof": [
            "Base, named and collapsed are live; collapsing swaps the frame for a Port-view run() with the same two ports.",
            "The code strip hoists `gain = 2.0` only in the named state; collapse is presentational and changes nothing.",
        ],
        "scores": {
            "fr1": score(5, "Row vs grey chip; named row changes the code line; collapse leaves the program untouched. The zone additionally states the scope the literal belongs to.", "medium"),
            "fr2": score(3, "A new region inside the Block's layout with its own rows and outlets — the rows reuse port typography, but the zone itself is a new part of the Block to learn."),
            "fr3": score(3, "A literal costs a row (good) plus a cable across the frame to its consumer (the hero shows two cables spanning the strip)."),
            "fr4": score(4, "`= {…}` keeps the row narrow; the full value is hover-only."),
            "fr5": score(5, "Type the name in the row; a row's outlet fans out to as many calls as use it."),
        },
        "gateResults": gate_results(
            "The literal is a row in run()'s zone; the definition default remains the grey chip on estimate's row.",
            "A layout region inside the existing Block util; outlets use the existing port and cable seams."),
    },
]


def weighted(variant: dict) -> float:
    total = 0.0
    for req in REQUIREMENTS:
        total += req["weight"] * variant["scores"][req["id"]]["score"] / 5
    return round(total, 1)


SPEC = {
    "schemaVersion": 3,
    "title": "Five ways to draw a literal argument",
    "kicker": "SystemSketch · /babble 5 · 2026-09-01",
    "brief": "`pose = estimate(frame, 2.0)` — the 2.0 is not estimate's default, it is a value fed in from outside, like `gain = 2.0; estimate(frame, gain)`. Assuming a pill carries such a source, what goes on it and how could it look? Every direction is drawn on the same run() fixture, with estimate's own default (1.0) present so the two never get confused.",
    "count": 5,
    "invariants": INVARIANTS,
    "boundary": "HTML/CSS specimens in the app's idiom — nothing is implemented in the renderer and no .systemsketch schema changed. The state changes, the regenerated code strip and the prune controls are real; editing text, dragging, tooltips and persistence are simulated. The reference board at the top is the real app, driven headlessly.",
    "axes": AXES,
    "requirements": REQUIREMENTS,
    "hardGates": HARD_GATES,
    "variants": VARIANTS,
    "checks": [
        "Exactly five structural directions on the where-it-lives / who-owns-it axes",
        "Same run() fixture, same definition default, same scale on every hero",
        "Visual atlas before the score audit; no winner cue in the atlas",
        "Every hero has a three-step story with live direct controls on the same states",
        "Five weighted FRs and three gates frozen before the previews were built; weights sum to 100",
        "Every score carries evidence and a confidence",
        "Reference board is the real app driven headlessly, plus the sketches from the brief",
    ],
}


# ---------------------------------------------------------------------------
# Gallery chrome: the fixture CSS and the reference board.
# ---------------------------------------------------------------------------

CUSTOM_STYLE = r"""
<style id="literal-pill-babble-style">
  .reference-board { margin: 0 0 38px; padding: 18px; border: 1px solid var(--line); background: rgb(255 253 249 / 74%); }
  .reference-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
  .reference-head h2 { margin: 6px 0 0; font: 500 25px/1.15 var(--serif); }
  .reference-head p { max-width: 720px; margin: 0; color: var(--muted); font-size: 12px; }
  .reference-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 12px; }
  .reference-card { display: grid; grid-template-rows: 1fr auto; overflow: hidden; border: 1px solid #dedfe3; border-radius: 13px; background: #f8f8f9; }
  .reference-card img { width: 100%; height: 190px; object-fit: contain; background: #f1f1f2; }
  .reference-card span { padding: 9px 11px; border-top: 1px solid #e5e5e7; color: #5d6269; background: #fff; font-size: 11px; }
  .prior-art { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
  .prior-art div { padding: 10px 12px; border: 1px solid #e3ddd2; border-radius: 9px; background: #fff; font-size: 11.5px; color: #3d3a35; }
  .prior-art b { display: block; margin-bottom: 4px; font: 700 10px/1.2 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .prior-art code { font: 11px var(--mono); }
  .measured { margin-top: 10px; color: var(--muted); font: 11px/1.5 var(--mono); }

  .prototype { container-type: inline-size; }
  .prototype-frame { background: #f3f4f6; }

  /* ---- the fixture canvas, in the app's idiom at gallery scale ---- */
  .lp { position: relative; width: 600px; height: 384px; zoom: .9; margin: 0 auto; overflow: hidden; color: #27272a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: linear-gradient(#eceef2 1px, transparent 1px) 0 0 / 20px 20px,
                    linear-gradient(90deg, #eceef2 1px, transparent 1px) 0 0 / 20px 20px, #f4f5f7;
        user-select: none; }
  .lp * { box-sizing: border-box; }
  .lp-expanded { position: absolute; inset: 0; }
  .lp-frame { position: absolute; border-radius: 9px; background: #fff;
              box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .lp-frame-head { display: flex; align-items: center; justify-content: space-between; height: 24px; padding: 0 10px;
                   border-bottom: 1px solid rgba(0,0,0,.1); }
  .lp-title { font: 500 13px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: -.02em; color: #27272a; }
  .lp-kind { display: inline-flex; align-items: center; gap: 6px; font: 500 9px/1 Inter, sans-serif; color: #71717a; }
  .lp-frame-port { position: absolute; z-index: 5; font-size: 9.5px; color: #3f3f46; white-space: nowrap; }
  .lp-frame-port em { font-style: normal; font-family: ui-monospace, Menlo, monospace; color: #a1a1aa; }
  .lp-block { position: absolute; z-index: 2; border-radius: 6px; background: #fff;
              box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 2px 5px rgba(0,0,0,.08); }
  .lp-block-head { display: flex; align-items: center; justify-content: space-between; height: 26px; padding: 0 8px;
                   border-bottom: 1px solid #e8e8ec; }
  .lp-rows { padding: 6px 0; }
  .lp-row { position: relative; display: flex; align-items: center; height: 18px; padding: 0 7px; gap: 4px; font-size: 10.5px; }
  .lp-in, .lp-out { display: inline-flex; align-items: center; gap: 4px; min-width: 0; white-space: nowrap; }
  .lp-out { margin-left: auto; }
  .lp-name { color: #3f3f46; }
  .lp-type { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #a1a1aa; }
  .lp-foot { display: flex; align-items: center; justify-content: flex-end; height: 14px; padding: 0 6px;
             border-top: 1px solid #e8e8ec; color: #a1a1aa; font-size: 8px; }
  .lp-chip { display: inline-block; padding: 0 5px; border: 1px solid #e4e4e7; border-radius: 999px; background: #f4f4f5;
             color: #71717a; font: 8.5px/12px ui-monospace, Menlo, monospace; white-space: nowrap; }
  .lp-chip.is-dim { opacity: .5; }
  .lp-dot { position: absolute; z-index: 4; width: 9px; height: 9px; border-radius: 50%; background: #fff;
            box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0,0,0,.18); transform: translate(-50%, -50%); }
  .lp-dot.is-default { background: #a1a1aa; box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px #a1a1aa; }
  .lp-dot.is-wired { background: #c08520; box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px #c08520; }
  .lp-dot.is-literal, .lp-dot.is-plugged { background: #3f3f46; box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px #3f3f46; }
  .lp-wires { position: absolute; inset: 0; z-index: 1; width: 600px; height: 384px; }
  .lp-wires path { fill: none; stroke: #8b8f98; stroke-width: 1.5; stroke-linejoin: round; }

  .lp-pill { position: absolute; z-index: 3; display: flex; align-items: center; justify-content: center; height: 24px;
             border: 1.5px solid #9ca3af; border-radius: 999px; background: #f4f4f5; color: #27272a;
             font: 500 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; white-space: nowrap;
             transition: left .28s ease, top .28s ease, width .28s ease; }
  .lp-pill > span { display: inline-flex; align-items: center; height: 100%; width: 100%; justify-content: center; }
  .lp-pill-dot { right: -1px; top: 50%; left: auto; transform: translate(50%, -50%); }
  .lp-card { position: absolute; z-index: 10; padding: 6px 9px; border: 1px solid #d4d4d8; border-radius: 7px; background: #fff;
             box-shadow: 0 8px 22px rgba(15, 23, 42, .16); font: 9.5px/14px ui-monospace, Menlo, monospace; color: #27272a; }
  .lp-card-head { margin-bottom: 3px; font: 600 8px/1.2 Inter, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #71717a; }
  .lp-card::after { content: ""; position: absolute; left: var(--caret, 40px); bottom: -6px; width: 10px; height: 10px; background: #fff;
                    border-right: 1px solid #d4d4d8; border-bottom: 1px solid #d4d4d8; transform: rotate(45deg); }
  .lp-card.is-below::after { bottom: auto; top: -6px; border: 0; border-left: 1px solid #d4d4d8; border-top: 1px solid #d4d4d8; }
  .lp-code { position: absolute; left: 0; right: 0; bottom: 0; padding: 5px 12px 4px; border-top: 1px solid #dcdfe4; background: #fbfbfc;
             font: 10px/12px ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #52525b; white-space: pre; }
  .lp-line { position: relative; padding-left: 8px; }
  .lp-line.is-hot { color: #18181b; }
  .lp-line.is-hot::before { content: ""; position: absolute; left: 0; top: 1px; bottom: 1px; width: 3px; border-radius: 2px; background: var(--accent, #222); }
  .lp-reset { position: absolute; z-index: 6; right: 8px; top: 8px; padding: 2px 7px; border: 1px solid #d1d5db; border-radius: 6px;
              background: rgb(255 255 255 / 85%); color: #6b7280; font: 600 9px/1.4 Inter, sans-serif; cursor: pointer; }
  .lp-reset:hover { color: var(--accent); border-color: var(--accent); }

  .lp [data-story-to] { cursor: pointer; }
  .lp [data-story-to]:hover { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: 2px; border-radius: 6px; }
  .lp .lp-reset:hover, .lp .lp-collapse:hover { outline: none; }

  /* V2 value cards */
  .lp-vcard { position: absolute; z-index: 3; border-radius: 6px; background: #fff;
              box-shadow: 0 0 0 1px rgba(0,0,0,.07), 0 2px 5px rgba(0,0,0,.08); transition: width .28s ease; }
  .lp-vhead { position: relative; display: flex; align-items: center; justify-content: space-between; height: 26px; padding: 0 8px; gap: 6px; }
  .lp-vtitle { font: 500 12px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #27272a; }
  .lp-vdot { right: 0; top: 50%; left: auto; transform: translate(50%, -50%); }
  .lp-vbody { padding: 4px 8px 6px; border-top: 1px solid #e8e8ec; font: 9.5px/12px ui-monospace, Menlo, monospace; color: #3f3f46; white-space: nowrap; }
  .lp-vcard.is-open { width: 150px !important; }

  /* V1 · a named capsule is wider; keep its outlet where the cable starts */
  .variant-card[data-variant="v1"] .prototype[data-story-state="named"] .lp-pill.gain { left: 70px !important; width: 100px !important; }

  /* V3 docked pills */
  .lp-pill.is-docked { border-radius: 999px 4px 4px 999px; }
  .variant-card[data-variant="v3"] .prototype[data-story-state="unplugged"] .lp-pill.gain { left: 70px !important; top: 220px !important; width: 100px !important; border-radius: 999px; }
  .variant-card[data-variant="v3"] .prototype[data-story-state="unplugged"] .lp-pill.gain .lp-pill-dot { display: block; }

  /* V4 inline field */
  .lp-field { position: relative; display: inline-flex; align-items: center; gap: 3px; height: 14px; padding: 0 4px; border: 1px solid #8a8f98; border-radius: 4px;
              background: #fff; color: #18181b; font: 9px/1 ui-monospace, Menlo, monospace; white-space: nowrap; }
  .lp-fx { display: inline-grid; place-items: center; width: 11px; height: 11px; border-radius: 3px; color: #71717a; font: 700 9px/1 Inter, sans-serif; cursor: pointer; }
  .lp-fx:hover { background: #ede9fe; color: #5b4fc4; }

  /* V5 locals zone */
  .lp-locals { position: absolute; z-index: 3; padding: 3px 0 4px; border: 1px dashed #c7ccd4; border-radius: 6px; background: rgb(255 255 255 / 70%); }
  .lp-locals-head { padding: 0 8px 2px; font: 700 7.5px/1.4 Inter, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #9ca3af; }
  .lp-lrow { display: flex; align-items: center; height: 18px; padding: 0 8px; font: 500 10.5px/1 ui-monospace, Menlo, monospace; color: #27272a; }
  .lp-collapse { display: inline-grid; place-items: center; width: 14px; height: 14px; border-radius: 4px; color: #71717a; font-size: 10px; cursor: pointer; }
  .lp-collapse:hover { background: #f4f4f5; color: var(--accent); }

  /* Anatomy sheets in the media story */
  .lp-sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; background: #f4f5f7; border-radius: 8px; }
  .lp-cell { display: grid; grid-template-rows: auto 1fr; gap: 6px; min-height: 74px; padding: 8px 10px; border: 1px solid #e4e6ea; border-radius: 7px; background: #fff; }
  .lp-cell small { font: 700 8.5px/1.2 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: #9ca3af; }
  .lp-cell-body { display: flex; align-items: center; gap: 10px; zoom: 1.35; min-width: 0; overflow: visible; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  .lp-cell-body .lp-dot { z-index: 1; }
  .lp-pill--inline { position: relative; height: 24px; padding: 0 12px; }
  .lp-pill--inline .lp-pill-dot { position: absolute; }
  .lp-vcard--inline { position: relative; display: inline-block; }
  .lp-stub { position: relative; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 8px 0 10px; font-size: 10.5px; border-radius: 6px 0 0 6px;
             background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.07); }
  .lp-stub--row { border-radius: 6px; padding-right: 8px; }
  .lp-stub-dot { position: absolute; left: 0; top: 50%; }
  .lp-arrow { color: #8b8f98; font-size: 11px; }
  .lp-locals--inline { position: relative; display: inline-flex; align-items: center; padding: 0 12px 0 0; }
  .lp-local-dot { position: absolute; right: 0; top: 50%; left: auto; transform: translate(50%, -50%); }
  .lp-sheet-note { margin: 8px 0 0; color: var(--muted); font-size: 11px; }

  @container (min-width: 900px) { .lp { zoom: 1.5; } }
</style>
"""


def state_css() -> str:
    """Each variant's states: elements with data-when are visible only in the
    listed states; the first story state is what shows before the driver runs."""
    rules = []
    for variant in VARIANTS:
        vid = variant["id"]
        states = [step["state"] for step in variant["story"]["steps"]]
        first = states[0]
        card = f'.variant-card[data-variant="{vid}"]'
        rules.append(f'{card} .prototype:not([data-story-state]) .lp [data-when]:not([data-when~="{first}"]) {{ display: none; }}')
        for state in states:
            rules.append(f'{card} .prototype[data-story-state="{state}"] .lp [data-when]:not([data-when~="{state}"]) {{ display: none; }}')
    return "<style id=\"literal-pill-states\">\n" + "\n".join(rules) + "\n</style>"


def reference_html(numbers: dict[str, str]) -> str:
    sources = [
        (ASSETS / "literal-pill-ref-app-board.png",
         "The real app today (Preview · Block Dev, driven headlessly): run() with decode → estimate → encode wired by real drags. estimate's gain carries a definition default (`= 1.0`), encode's opts `= None`.",
         "Real SystemSketch board with the fixture"),
        (ASSETS / "literal-pill-ref-app-estimate.png",
         "Close-up of the existing chip: at the Port view's width the row already ellipsises to `g… fl… = 1.0`. This is the room a row has today.",
         "Close-up of estimate() in the real app"),
        (VAULT / "Pasted image 20260901204656.png",
         "Your grid from the brief: short/long × named/unnamed, and the question whether name and value are two things or one.",
         "Zach's 2×2 sketch"),
        (VAULT / "Pasted image 20260901204728.png",
         "Your in-situ sketch: a `= 2.0` capsule inside run(), wired into estimate's gain.",
         "Zach's in-situ sketch"),
    ]
    cards = "".join(
        f'<figure class="reference-card"><img src="{image_data(path)}" alt="{esc(alt)}"><span>{caption}</span></figure>'
        for path, caption, alt in sources
    )
    prior = """
      <div class="prior-art">
        <div><b>tldraw workflow kit · the reference you named</b>
          <code>NodeInputRow</code>: “If the port is connected, the input is disabled and the value is taken from the port. Otherwise, the input is editable.” And <code>SliderNode</code>: “a single output port and no inputs.” The kit has <em>both</em> — a value on the row, and a value that is a node.</div>
        <div><b>Blender · Unreal · Houdini</b>
          An unlinked socket shows its literal inline; linking hides it. A separate Value / Make Literal node exists for values you want to see, name or share. The same pair, converged on independently.</div>
        <div><b>Python's own grammar</b>
          <code>ast.Constant</code> is an argument: it belongs to the call. <code>ast.Name</code> is a binding: it belongs to the scope. The pill's name is the difference between the two, and the definition default belongs to neither — it is a fact about <code>estimate</code>.</div>
      </div>
    """.strip()
    measured = (f'<p class="measured">Measured at build time from the tree: the default chip is capped at '
                f'{esc(numbers["chip_max_width"])} at {esc(numbers["chip_font"])} monospace beside {esc(numbers["port_font"])} port names, '
                f'on a Port view {esc(numbers["port_view_width"])}px wide — which is why the real row above reads `g… fl…`.</p>')
    return f"""
      <section class="reference-board" aria-labelledby="reference-heading">
        <div class="reference-head">
          <div><div class="eyebrow">Actual references inspected</div><h2 id="reference-heading">What exists today, and what the brief drew</h2></div>
          <p>The prototypes keep the app's Block, row, dot and cable exactly as they render today and add only the literal. The captures are the real app; the sketches are yours.</p>
        </div>
        <div class="reference-grid">{cards}</div>
        {prior}
        {measured}
      </section>
    """.strip()


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f"Babble gallery builder not found: {GALLERY}")
    numbers = measure()

    ranked = sorted(VARIANTS, key=weighted, reverse=True)
    totals = {variant["id"]: weighted(variant) for variant in VARIANTS}
    leader, runner = ranked[0], ranked[1]
    SPEC["defaultId"] = leader["id"]
    fragile = totals[leader["id"]] - totals[runner["id"]] <= 3
    SPEC["defaultWhy"] = (
        f"{leader['name']} leads at {totals[leader['id']]:g}/100"
        + (f", a fragile margin over {runner['name']} at {totals[runner['id']]:g}: " if fragile else ": ")
        + "it is the same Block primitive wearing a fourth view, so click-to-edit, the inspector, batch styles, "
          "fan-out and the file format apply to values the day it ships, and a long value has a body to live in. "
          "The Capsule silhouette from your sketch can simply be what that view looks like."
    )
    SPEC["decisionHinge"] = (
        "The order is decided by how much weight 'literals do not bury the pipeline' carries. At 20% the two free-shape "
        "directions lead; raise it to 30% (taking 10 from vocabulary) and Inline literal (V4) moves to the top at ~83 "
        "while Value Block drops to ~80 — which is the workflow kit's own answer. The strongest splice is therefore V2's "
        "model with V4's row as the docked, single-use form: a value is a Block, but an unnamed literal with one consumer "
        "is allowed to live on the row until you name or share it."
    )
    SPEC["totals"] = totals

    SPEC_PATH.write_text(json.dumps(SPEC, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    HTML_PATH.unlink(missing_ok=True)  # gallery.py refuses to overwrite; the builder is the source
    subprocess.run(
        ["python3", str(GALLERY), "build", "--spec", str(SPEC_PATH), "--output", str(HTML_PATH), "--strict"],
        check=True,
    )

    html_text = HTML_PATH.read_text(encoding="utf-8")
    html_text = html_text.replace("</head>", f"{CUSTOM_STYLE}\n{state_css()}\n</head>", 1)
    html_text = html_text.replace(
        '<section aria-labelledby="variants-heading">',
        f'{reference_html(numbers)}\n    <section aria-labelledby="variants-heading">',
        1,
    )
    HTML_PATH.write_text(html_text, encoding="utf-8")

    subprocess.run(["python3", str(GALLERY), "check", "--input", str(HTML_PATH), "--strict"], check=True)
    for variant in ranked:
        print(f"{variant['id']}  {totals[variant['id']]:5.1f}  {variant['name']}")
    print(f"wrote {HTML_PATH}")


if __name__ == "__main__":
    main()
