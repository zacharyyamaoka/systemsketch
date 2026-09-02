#!/usr/bin/env python3
"""Build the five-direction "put a port in a row" Babble + Prune gallery.

Five ways to move a port into the heading or another row of the burger, each
a live state machine in the gallery, four of them also shipped in the real app
on this branch and shown beside their real-browser captures.
"""

from __future__ import annotations

import base64
import io
import json
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GALLERY = Path("/home/bam/.claude/skills/babble/scripts/gallery.py")
SPEC_PATH = ROOT / "docs" / "header-port-rows-babble-2026-09-01.json"
HTML_PATH = ROOT / "docs" / "header-port-rows-babble-2026-09-01.html"
ASSETS = ROOT / "docs" / "assets"
VAULT = Path("/home/bam/zach_brain")


def image_data(path: Path, crop: tuple[int, int, int, int] | None = None, width: int | None = None) -> str:
    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(crop)
    if width and image.width > width:
        ratio = width / image.width
        image = image.resize((width, round(image.height * ratio)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def capture(name: str, crop: tuple[int, int, int, int], width: int = 720) -> str:
    return image_data(ASSETS / f"header-port-rows-{name}-2026-09-01.png", crop, width)


# ---------------------------------------------------------------- fixture ---
# One Block, every variant: run(raw, gain, transform) -> payload, with the
# question "get `transform` (a callable) into the heading" as the scenario.

W, H = 300, 236
HEAD_H = 44
PITCH = 36
BODY_TOP = HEAD_H + 8
FOOT_TOP = H - 34


def row_y(index: int) -> int:
    return BODY_TOP + PITCH * index + PITCH // 2


def dot(side: str, y: float, extra_class: str = "", attrs: str = "", title: str = "") -> str:
    x = 0 if side == "in" else W
    title_attr = f' title="{title}"' if title else ""
    return (
        f'<i class="mb-dot mb-dot--{side} {extra_class}" style="left:{x}px;top:{y}px"{title_attr} {attrs}></i>'
    )


def label(side: str, y: float, text: str, extra_class: str = "", attrs: str = "") -> str:
    style = f"top:{y - 11}px;" + ("left:14px;" if side == "in" else f"right:14px;text-align:right;")
    return f'<span class="mb-label mb-label--{side} {extra_class}" style="{style}" {attrs}>{text}</span>'


def block_shell(inner: str, extra_class: str = "", head_extra: str = "") -> str:
    return (
        f'<div class="mb {extra_class}" style="width:{W}px;height:{H}px">'
        f'<div class="mb-head" style="height:{HEAD_H}px"><span class="mb-title">run</span>'
        f'<span class="mb-type">call</span>{head_extra}</div>'
        f'<div class="mb-foot" style="top:{FOOT_TOP}px">⋮</div>'
        f"{inner}</div>"
    )


def full_line(y: float, extra_class: str = "") -> str:
    return f'<i class="mb-line {extra_class}" style="top:{y}px;left:0;width:{W}px"></i>'


def band(top: float, bottom: float, side: str, extra_class: str) -> str:
    left = 0 if side == "in" else W / 2
    return (
        f'<i class="mb-band {extra_class}" style="left:{left}px;top:{top}px;'
        f'width:{W / 2}px;height:{bottom - top}px"></i>'
    )


def rule(y: float, side: str, extra_class: str) -> str:
    left = 0 if side == "in" else W / 2
    return f'<i class="mb-rule {extra_class}" style="left:{left}px;top:{y}px;width:{W / 2}px"></i>'


BASE_PORTS = (
    dot("in", row_y(0)) + label("in", row_y(0), "raw")
    + dot("in", row_y(1)) + label("in", row_y(1), "gain")
    + dot("out", row_y(0)) + label("out", row_y(0), "payload")
)

CHIPS_NOTE = '<div class="mb-chips">'


def chips(*items: tuple[str, str]) -> str:
    return CHIPS_NOTE + "".join(
        f'<button type="button" class="mb-chip" data-story-to="{state}">{text}</button>'
        for text, state in items
    ) + "</div>"


# ---------------------------------------------------------------- V1 ---------
def v1_preview() -> str:
    y_transform = row_y(2)
    inner = (
        BASE_PORTS
        # transform in its row (base, held), lifted card while dragging, in heading when done
        + dot("in", y_transform, "v1-transform-row", 'data-drag="v1"')
        + label("in", y_transform, "transform", "v1-transform-row-label")
        + band(BODY_TOP, BODY_TOP + PITCH * 3, "in", "v1-band-row")
        + band(0, HEAD_H, "in", "v1-band-head")
        + rule(y_transform + PITCH / 2, "in", "v1-rule-row")
        + rule(HEAD_H / 2 + 8, "in", "v1-rule-head")
        + f'<span class="mb-card v1-card"><i class="mb-grip">⠿</i>transform</span>'
        + dot("in", HEAD_H / 2, "v1-transform-head", "", "transform")
        + '<span class="mb-cursor v1-cursor" aria-hidden="true"></span>'
    )
    return (
        '<div class="port-proto v1" data-drag-proto="v1">'
        '<div class="canvas-caption">Canvas · Port view</div>'
        + block_shell(inner)
        + chips(("Press & hold transform", "held"), ("Drag over the heading", "over"), ("Release", "lifted"), ("Reset", "base"))
        + '<p class="mb-note">Hold the dot 400 ms (tldraw’s own long-press), then drag it. The band shows the row it would join; the heading is a row too.</p>'
        + "</div>"
    )


# ---------------------------------------------------------------- V2 ---------
def v2_preview() -> str:
    def irow(name: str, row: int, extra: str = "", attrs: str = "") -> str:
        return (
            f'<li class="ins-row {extra}" data-row="{row}" {attrs}><i class="ins-grip" data-drag-grip="{name}">⠿</i>'
            f'<span class="ins-name">{name}</span><span class="ins-type">type</span><span class="ins-def">=</span>'
            f'<span class="ins-x">×</span></li>'
        )

    def line(kind: str, extra: str = "") -> str:
        return f'<li class="ins-line ins-line--{kind} {extra}"><i></i><b>{kind}</b></li>'

    inner = (
        '<div class="ins"><div class="ins-head"><span>INPUTS</span><span class="ins-pill">3 visible</span><span class="ins-plus">+</span></div>'
        '<ul class="ins-list">'
        '<li class="ins-empty v2-empty" data-row="0">drop in header</li>'
        + irow("gain", 0, "v2-gain-header")
        + line("header")
        + irow("raw", 1)
        + irow("gain", 1, "v2-gain-row", 'data-drag="v2"')
        + irow("transform", 1)
        + line("row")
        + '<li class="ins-empty v2-empty-two" data-row="2">drop here</li>'
        + '<i class="ins-band v2-band-row"></i><i class="ins-band v2-band-head"></i>'
        + '<i class="ins-bar v2-bar-row"></i><i class="ins-bar v2-bar-head"></i>'
        + '<li class="ins-row ins-row--card v2-card"><i class="ins-grip">⠿</i><span class="ins-name">gain</span><span class="ins-type">type</span><span class="ins-def">=</span><span class="ins-x">×</span></li>'
        + "</ul></div>"
    )
    return (
        '<div class="port-proto v2" data-drag-proto="v2">'
        '<div class="canvas-caption">Inspector · Inputs</div>'
        + inner
        + chips(("Grab gain’s grip", "held"), ("Drag above the HEADER line", "over"), ("Release", "lifted"), ("Reset", "base"))
        + '<p class="mb-note">The list is the Block read top to bottom: header ports, the HEADER line, then each row with its ROW line. Nothing moves until you release.</p>'
        + "</div>"
    )


# ---------------------------------------------------------------- V3 ---------
def v3_preview() -> str:
    y_gain = row_y(1)
    inner = (
        dot("in", row_y(0)) + label("in", row_y(0), "raw")
        + dot("in", row_y(2)) + label("in", row_y(2), "transform")
        + dot("out", row_y(0)) + label("out", row_y(0), "payload")
        + dot("in", y_gain, "v3-gain-row", 'data-story-to="menu" role="button" aria-label="Right-click gain"')
        + label("in", y_gain, "gain", "v3-gain-row-label")
        + dot("in", HEAD_H / 2, "v3-gain-head", "", "gain")
        + '<div class="mb-menu v3-menu">'
        '<span>Add port above</span><span>Add port below</span><span>Move up</span><span>Move down</span>'
        '<span class="mb-menu-sub" data-story-to="submenu">Move to<b>›</b></span><span>Delete port</span>'
        '<hr><span>Block view<b>›</b></span><span>Add<b>›</b></span><span>Ports<b>›</b></span></div>'
        '<div class="mb-menu mb-menu--sub v3-submenu">'
        '<span class="mb-menu-check" data-story-to="moved">Header</span>'
        '<span class="mb-menu-check is-checked">Row 1</span><hr><span>New row below</span></div>'
    )
    return (
        '<div class="port-proto v3">'
        '<div class="canvas-caption">Canvas · right-click a port</div>'
        + block_shell(inner)
        + chips(("Right-click gain", "menu"), ("Open Move to", "submenu"), ("Choose Header", "moved"), ("Reset", "base"))
        + '<p class="mb-note">The same right-click menu, re-aimed at the port. Move to lists Header and every row; New row below opens one.</p>'
        + "</div>"
    )


# ---------------------------------------------------------------- V4 ---------
def v4_preview() -> str:
    inner = (
        BASE_PORTS
        + dot("in", row_y(2)) + label("in", row_y(2), "transform")
        + f'<i class="mb-zone v4-zone" data-hover-to="hover" style="left:-20px;top:0;width:30px;height:{HEAD_H}px"></i>'
        + f'<i class="mb-bead v4-bead" data-story-to="editing" role="button" aria-label="Add header port" style="left:0;top:{HEAD_H / 2}px">+</i>'
        + dot("in", HEAD_H / 2, "v4-new-dot", "", "estimator")
        + f'<span class="mb-editor v4-editor" style="left:14px;top:{HEAD_H / 2 - 12}px">estimator<i></i></span>'
        + f'<span class="mb-tip v4-tip" style="left:12px;top:{HEAD_H + 2}px">estimator</span>'
    )
    return (
        '<div class="port-proto v4" data-hover-proto="v4">'
        '<div class="canvas-caption">Canvas · hover the heading’s edge</div>'
        + block_shell(inner)
        + chips(("Hover the heading edge", "hover"), ("Click the bead", "editing"), ("Enter", "added"), ("Reset", "base"))
        + '<p class="mb-note">The table gutter you already use for a new row, on the heading: the port is born in the header with its name open for typing.</p>'
        + "</div>"
    )


# ---------------------------------------------------------------- V5 ---------
def v5_preview() -> str:
    def brow(name: str, kind: str, extra: str = "") -> str:
        return (
            f'<li class="be-row {extra}"><i class="ins-grip">⠿</i><span class="be-name">{name}</span>'
            f'<span class="be-kind">{kind}</span><span class="ins-x">×</span></li>'
        )

    def boundary(text: str, extra: str = "", attrs: str = "") -> str:
        return f'<li class="be-boundary {extra}" {attrs}><b>+</b>{text}</li>'

    face = (
        BASE_PORTS
        + dot("in", row_y(2)) + label("in", row_y(2), "transform")
        + dot("in", HEAD_H / 2, "v5-new-dot", "", "estimator")
        + f'<button type="button" class="mb-menu-chip v5-enter" data-story-to="mode" style="left:{W - 118}px;top:{FOOT_TOP - 30}px">Edit ports…</button>'
    )
    editor = (
        '<div class="be v5-editor">'
        '<div class="be-head">run <span>port editing</span><button type="button" class="mb-chip mb-chip--primary" data-story-to="done">Done</button></div>'
        '<ul class="be-list">'
        + boundary("Add header port", "be-boundary--header", 'data-story-to="added" role="button"')
        + brow("estimator", "header", "v5-new-row")
        + '<li class="be-line"><i></i><b>header</b></li>'
        + brow("raw", "input") + boundary("Add at this boundary") + brow("gain", "input")
        + boundary("Add at this boundary") + brow("transform", "input")
        + '<li class="be-line be-line--row"><i></i><b>row · click to split</b></li>'
        + brow("payload", "output")
        + "</ul></div>"
    )
    return (
        '<div class="port-proto v5">'
        '<div class="canvas-caption">Canvas · a port-editing mode</div>'
        + block_shell(face, "v5-face")
        + editor
        + chips(("Edit ports…", "mode"), ("Add header port", "added"), ("Done", "done"), ("Reset", "base"))
        + '<p class="mb-note">The direction you were leaning towards: a button on the menu turns the face into a boundary list. Every boundary offers an add; the lines cycle row/branch.</p>'
        + "</div>"
    )


# ---------------------------------------------------------------- spec -------
def step(label: str, caption: str, state: str, target: str) -> dict:
    return {"label": label, "caption": caption, "state": state, "target": target}


def media(label: str, caption: str, html: str) -> dict:
    return {"label": label, "caption": caption, "html": html}


def capture_media(label: str, caption: str, name: str, crop: tuple[int, int, int, int]) -> dict:
    return media(
        label,
        caption,
        f'<figure class="capture"><img src="{capture(name, crop)}" alt="{label}"><figcaption>real app · headless Chrome · <code>npm run test:rows</code></figcaption></figure>',
    )


SPEC = {
    "schemaVersion": 3,
    "title": "Five ways to put a port in a row",
    "kicker": "Babble & Prune · /babble 5 · SystemSketch Block ports",
    "brief": (
        "A Block is a burger: heading, body rows, footer. The heading is the row for control-flow "
        "inputs (a callable, a predicate, an iterable) and the body splits into parallel rows with "
        "conditional arms on the output side. Zach wants only input and output ports — what changes is "
        "the row a port sits in — and he wants the inspector's reorder UX to match the canvas. The "
        "scenario in every variant: get `transform`, a callable argument of run(), into the heading."
    ),
    "count": 5,
    "defaultId": "v1",
    "defaultWhy": (
        "Drag across the line leads at 93/100: it is the hold-and-drag Zach already has, the band names the row "
        "before release, it works in Port and Expanded view, and one gesture does one reassignment. "
        "V2, V3 and V4 are not rivals but the same rule on other surfaces, and all four are live on the branch."
    ),
    "decisionHinge": (
        "If most row assignment will happen while the inspector is open, raise 'works wherever rows are visible' "
        "from 15 to 25 and 'header discoverable' to 15 at the expense of throughput: V2 Mirror list closes to "
        "within three points of V1 and the two become co-leaders. Nothing plausible lifts V5's mode above them."
    ),
    "invariants": [
        "Only input and output ports exist; a port's identity (its id) never changes when it moves.",
        "The heading is row 0 and takes inputs only; body rows are shared by both lanes; arms are output-only.",
        "Rows are assigned from the inspector, never reordered there — rows come from another place.",
        "tldraw stays stock: every gesture rides a component, tool or state seam it already has.",
        "One fixture: run(raw, gain, transform) → payload, and the task is to lift `transform` into the heading.",
    ],
    "boundary": (
        "V1–V4 are implemented on branch claude/header-port-rows-447683 and proven by npm run test:rows (14/14 in "
        "headless Chrome); their heroes here are HTML state machines in the app's idiom, with the real captures "
        "beside them. V5 is a mock only — NOT VERIFIED IN-APP — built to judge the mode Zach was leaning towards."
    ),
    "axes": [
        {"name": "Where you act", "values": ["canvas dot", "inspector list", "context menu", "heading edge", "editing mode"]},
        {"name": "Primary object", "values": ["the port in flight", "the list order", "a named row", "the heading", "boundaries"]},
        {"name": "How the row is shown", "values": ["tinted band", "lines in the list", "row names", "the bead's place", "boundary buttons"]},
        {"name": "State model", "values": ["one gesture", "one gesture", "menu path", "hover + click", "enter mode / leave mode"]},
    ],
    "requirements": [
        {
            "id": "fr1",
            "name": "One place, one meaning",
            "weight": 30,
            "why": "A port that lands in a row other than the one the gesture showed is a silent semantic edit: the row is control flow, not decoration.",
            "passCondition": "The row (or arm, or heading) the port will join is visible before release, and canvas and inspector resolve the same drop to the same place.",
            "anchors": {"1": "You learn where it went after the fact.", "3": "The destination is shown but ambiguous at a line.", "5": "The destination band is visible and both surfaces share one reducer."},
        },
        {
            "id": "fr2",
            "name": "No new state to learn",
            "weight": 25,
            "why": "Zach rejected ten new port gestures for the table UX and said even Expanded can use the same drag because 'you don't need another state'.",
            "passCondition": "No new mode, tool or exit ceremony; the gesture is one the app already teaches.",
            "anchors": {"1": "A mode with its own entry and exit.", "3": "A new control in a familiar place.", "5": "An existing gesture, extended."},
        },
        {
            "id": "fr3",
            "name": "Burst throughput",
            "weight": 20,
            "why": "Reassigning ports happens in runs — three or four at a time while shaping a Block.",
            "passCondition": "Moving three ports to three rows takes three gestures.",
            "anchors": {"1": "More than three actions per port.", "3": "Two actions per port.", "5": "One gesture per port."},
        },
        {
            "id": "fr4",
            "name": "Works wherever rows are visible",
            "weight": 15,
            "why": "Rows are painted in Port view, Expanded view and the inspector; the assignment should be at hand in each.",
            "passCondition": "Available in Port and Expanded on the canvas and in the inspector.",
            "anchors": {"1": "One surface only.", "3": "The canvas, or only the inspector.", "5": "Both canvas views and the inspector."},
        },
        {
            "id": "fr5",
            "name": "Header discoverable",
            "weight": 10,
            "why": "The immediate need is a port in the heading; a first-time user should find how without reading.",
            "passCondition": "Something visible says the heading can hold a port.",
            "anchors": {"1": "Nothing hints at it.", "3": "Named in a menu.", "5": "A visible affordance on the heading itself."},
        },
    ],
    "hardGates": [
        {"id": "g1", "name": "tldraw stays stock", "why": "The one rule the design rests on: seams, never a fork."},
        {"id": "g2", "name": "Port identity survives", "why": "A move must never rewrite a port id, so cables never rebind."},
        {"id": "g3", "name": "Rows are not reordered from the inspector", "why": "Zach's call: the inspector assigns ports to rows; rows are driven from elsewhere."},
        {"id": "g4", "name": "Same fixture", "why": "run(raw, gain, transform) → payload in every variant, so content cannot masquerade as design."},
    ],
    "variants": [
        {
            "id": "v1",
            "name": "Drag across the line",
            "thesis": "The row is where the port is; hold a dot and carry it across a line — or above it, into the heading.",
            "accent": "#4f7df3",
            "bestWhen": "You are looking at the Block and can see the rows; one motion per port.",
            "losesWhen": "The Block is tiny on screen, or the port is hidden and only the inspector can reach it.",
            "decisions": [
                {"label": "Gesture", "value": "tldraw's own long_press on a port dot, then a select-tool child state; a press that moves first is still a cable."},
                {"label": "Target", "value": "The band under the pointer: a row, an arm, or the heading — tinted while the drop is offered."},
                {"label": "Commit", "value": "One reducer, one undo step; nothing is written until release."},
            ],
            "keepParts": ["tinted target band", "heading as a drop band", "hold-then-drag entry"],
            "proof": [
                "The hero holds, tints the current row, tints the heading when over it, and lands the dot in the heading.",
                "Real app: test:rows drags transform into the heading in Port view and raw across a line in Expanded view.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "The band names the row before release, and the canvas and inspector drops call the same moveBlockPortToSection reducer.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "It is the shipped press-and-hold reorder with the drop rule extended to rows and the heading; no new state.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "One hold-and-drag per port; three ports, three gestures.", "confidence": "high"},
                "fr4": {"score": 4, "evidence": "Proven in Port and Expanded on the canvas; the inspector needs its own surface (V2).", "confidence": "high"},
                "fr5": {"score": 3, "evidence": "The heading tints only once a drag is under way; nothing at rest says it can hold a port.", "confidence": "medium"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "long_press and a StateNode child of select; no engine change."},
                "g2": {"pass": True, "evidence": "The reducer moves the port object; ids are untouched, cables never rebind."},
                "g3": {"pass": True, "evidence": "Ports move between rows; rows themselves are not reordered."},
                "g4": {"pass": True, "evidence": "The hero and the capture both show run(raw, gain, transform)."},
            },
            "previewLabel": "interactive canvas drag",
            "story": {
                "title": "Lift transform into the heading",
                "steps": [
                    step("At rest", "transform is an input in row 1 of run(); it belongs in the heading, with the control-flow data.", "base", "[data-drag='v1']"),
                    step("Hold the dot", "Press transform's dot and hold: the grip appears and its row tints.", "held", "[data-drag='v1']"),
                    step("Cross the line", "Over the heading the heading band tints instead — the destination, not a rule that moved.", "over", ".v1-band-head"),
                    step("Release", "transform rides the heading band as a bare dot; its name is on the tooltip.", "lifted", ".v1-transform-head"),
                ],
            },
            "media": [
                capture_media("Real app · over the heading", "The heading band tints under the held row while the cables stay put.", "drag-into-heading", (380, 180, 800, 490)),
                capture_media("Real app · Expanded view", "The same hold-and-drag, the same band, in the open frame.", "expanded-drag", (380, 180, 1000, 600)),
            ],
            "preview": v1_preview(),
        },
        {
            "id": "v2",
            "name": "Mirror list",
            "thesis": "The inspector is the Block read top to bottom — header ports, the HEADER line, each row with its line — and a row is dragged across those lines.",
            "accent": "#7667c6",
            "bestWhen": "The inspector is already open, ports are hidden, or you want to see every row at once.",
            "losesWhen": "You are working on the canvas and the panel is closed.",
            "decisions": [
                {"label": "Structure", "value": "One list per lane, with HEADER / ROW / BRANCH lines exactly where the canvas draws them; empty rows keep a slim slot."},
                {"label": "Gesture", "value": "Drag the grip; the row you left stays put, the bar and band say where you would land."},
                {"label": "Commit", "value": "The same section reducer as the canvas; a drop that changes nothing offers no bar."},
            ],
            "keepParts": ["HEADER line at the top of inputs", "lines mirror the canvas", "grip drag with band + bar"],
            "proof": [
                "The hero lifts gain's row and lands it above the HEADER line.",
                "Real app: test:rows drags gain above the line in the docked inspector and the canvas dot moves into the heading.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "Band and bar show the target section; the drop goes through the same reducer as the canvas.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "A grip on a list row is a universal gesture, but the grip itself is new to this inspector.", "confidence": "high"},
                "fr3": {"score": 4, "evidence": "One drag per port once the panel is open; opening it is a cost paid once.", "confidence": "medium"},
                "fr4": {"score": 3, "evidence": "The inspector only; the canvas needs V1.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "The HEADER line is always there at the top of the inputs, with the empty slot above it.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Plain pointer events in a React panel; tldraw untouched."},
                "g2": {"pass": True, "evidence": "The reducer moves the port record; ids are untouched."},
                "g3": {"pass": True, "evidence": "The lines cannot be dragged; only rows move between them."},
                "g4": {"pass": True, "evidence": "The same run() ports."},
            },
            "previewLabel": "interactive inspector drag",
            "story": {
                "title": "Drag a row above the HEADER line",
                "steps": [
                    step("At rest", "The list reads: header slot, HEADER line, then row 1 — raw, gain, transform.", "base", ".ins-line--header"),
                    step("Grab the grip", "gain's row lifts as a card; the rows it left stay exactly where they were.", "held", "[data-drag='v2']"),
                    step("Cross the HEADER line", "The header slot opens and tints; the bar says gain would land there.", "over", ".v2-empty"),
                    step("Release", "gain sits above the line — and on the canvas its dot is in the heading.", "lifted", ".v2-gain-header"),
                ],
            },
            "media": [
                capture_media("Real app · the docked inspector", "The held row rides the pointer over the tinted header slot; the canvas shows the rows it mirrors.", "inspector-drag", (1160, 480, 1440, 830)),
            ],
            "preview": v2_preview(),
        },
        {
            "id": "v3",
            "name": "Row menu",
            "thesis": "Name the row: right-click a port and choose Header, Row n, or open a new row or arm below it.",
            "accent": "#2f7f74",
            "bestWhen": "Precision matters, the row is far away, or you want to create a row that does not exist yet.",
            "losesWhen": "You have several ports to move; three clicks each adds up.",
            "decisions": [
                {"label": "Surface", "value": "The same right-click menu, re-aimed at the port — Zach's rule: one menu whose subject changes."},
                {"label": "Vocabulary", "value": "Header · Row 1…n as checkboxes, then New row below and New branch below."},
                {"label": "Step", "value": "Move up / Move down became visual steps: the first body input stepping up lifts into the heading."},
            ],
            "keepParts": ["Header as a named row", "New row / New branch below", "visual-step Move up/down"],
            "proof": [
                "The hero opens the menu on gain, the Move to submenu, and lands gain in the heading.",
                "Real app: test:rows chooses Move to › Header, New branch below and New row below and reads the lines it paints.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "The row is named, not shown; unambiguous but you do not see the band until it lands.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "The existing port menu group grew a submenu; nothing new to learn.", "confidence": "high"},
                "fr3": {"score": 2, "evidence": "Right-click, open Move to, choose: three actions per port.", "confidence": "high"},
                "fr4": {"score": 4, "evidence": "Any canvas view where a dot can be right-clicked; not the inspector.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "'Move to › Header' is written down where a first-time user will look.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "TldrawUiMenuSubmenu inside the stock context menu."},
                "g2": {"pass": True, "evidence": "Same reducer; ids untouched."},
                "g3": {"pass": True, "evidence": "It creates rows below a port; it never reorders rows."},
                "g4": {"pass": True, "evidence": "The same run() ports."},
            },
            "previewLabel": "interactive menu",
            "story": {
                "title": "Move to › Header",
                "steps": [
                    step("At rest", "gain sits in row 1; the port menu is one right-click away.", "base", ".v3-gain-row"),
                    step("Right-click gain", "The port menu opens on the dot; the commands at the top are about gain.", "menu", ".v3-gain-row"),
                    step("Open Move to", "Header, Row 1 (checked), then New row below.", "submenu", ".v3-menu .mb-menu-sub"),
                    step("Choose Header", "gain's dot moves into the heading; one undo step.", "moved", ".v3-gain-head"),
                ],
            },
            "media": [
                capture_media("Real app · the submenu", "Move to lists Header and the checked current row, then New row below.", "move-to-menu", (400, 200, 700, 480)),
            ],
            "preview": v3_preview(),
        },
        {
            "id": "v4",
            "name": "Heading gutter",
            "thesis": "Header ports are born there: the table gutter you use for a new row, on the heading's edge, adds a port straight into the heading.",
            "accent": "#b7791f",
            "bestWhen": "You are adding the callable or predicate for the first time and know it belongs in the heading.",
            "losesWhen": "The port already exists in a row and needs moving — the gutter creates, it does not move.",
            "decisions": [
                {"label": "Affordance", "value": "A strip on the heading's left edge beside the header dots; hover reveals a bead at the next header slot."},
                {"label": "Result", "value": "insertBlockPortForInlineEditing with section row 0; the name opens for typing."},
                {"label": "Growth", "value": "The heading grows into the body to fit its dots, never the box."},
            ],
            "keepParts": ["bead at the next header slot", "name opens on creation", "strip stops short of the title"],
            "proof": [
                "The hero reveals the bead on hover, opens the inline name on click, and shows the named dot with its tooltip.",
                "Real app: test:rows hovers the heading gutter, adds estimator, and reads its dot inside the heading band.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "The bead sits exactly where the dot will appear; it never lands elsewhere — but it only knows the heading.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "It is the shipped lane gutter, on the heading.", "confidence": "high"},
                "fr3": {"score": 3, "evidence": "Fast for new header ports; an existing port still needs V1–V3 to move.", "confidence": "high"},
                "fr4": {"score": 3, "evidence": "Canvas only, heading only.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "The heading itself offers the bead on hover.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "HTML inside the shape's own container; no engine change."},
                "g2": {"pass": True, "evidence": "Creates a new id; moves nothing."},
                "g3": {"pass": True, "evidence": "Adds a port; touches no row order."},
                "g4": {"pass": True, "evidence": "The same run() ports."},
            },
            "previewLabel": "interactive gutter",
            "story": {
                "title": "Add a port into the heading",
                "steps": [
                    step("At rest", "Nothing on the heading yet; the strip on its edge is invisible until hovered.", "base", ".mb-head"),
                    step("Hover the heading edge", "The strip on the heading's edge reveals a bead at the next header slot.", "hover", ".v4-bead"),
                    step("Click the bead", "A new header dot appears with its name open for typing.", "editing", ".v4-editor"),
                    step("Enter", "estimator rides the heading band; hovering the dot shows its name.", "added", ".v4-new-dot"),
                ],
            },
            "media": [
                capture_media("Real app · the bead on the heading", "The + sits on the heading's edge at the title line, in the column the dots occupy.", "heading-bead", (380, 180, 800, 490)),
            ],
            "preview": v4_preview(),
        },
        {
            "id": "v5",
            "name": "Boundary editor",
            "thesis": "A port-editing mode: the face becomes a list of ports and the boundaries between them, and every boundary — the header's first — offers an add.",
            "accent": "#c2410c",
            "bestWhen": "You are shaping a Block from scratch and want to add and split in a burst without the canvas in the way.",
            "losesWhen": "You wanted one port moved; entering and leaving a mode costs more than the move.",
            "decisions": [
                {"label": "Entry", "value": "A menu command turns the Block's face into the editor; Done returns it."},
                {"label": "Object", "value": "Boundaries: each gap between ports is a button, and the lines cycle none → row → branch."},
                {"label": "Cost", "value": "A second state for the Block, with its own keyboard and exit rules."},
            ],
            "keepParts": ["'add at this boundary' wording", "boundary-first list", "Done as the only exit"],
            "proof": [
                "The hero enters the mode, adds a header port at the top boundary, and returns to the face with the new dot.",
                "Mock only — NOT VERIFIED IN-APP; nothing of this exists on the branch.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "A boundary is exact, but it is a list position, not the painted row; the mapping is one step removed.", "confidence": "medium"},
                "fr2": {"score": 1, "evidence": "A mode with entry and exit, on a primitive that already has three views.", "confidence": "high"},
                "fr3": {"score": 4, "evidence": "Inside the mode, adds and splits are one click each; entering and leaving is paid per burst.", "confidence": "medium"},
                "fr4": {"score": 3, "evidence": "Canvas only, and only while in the mode.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "'Add header port' is the first boundary in the list.", "confidence": "medium"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Would be a fourth face of the shape's HTML; no engine change needed."},
                "g2": {"pass": True, "evidence": "Adds and moves would go through the same reducers."},
                "g3": {"pass": True, "evidence": "Lines cycle kind; rows are not reordered."},
                "g4": {"pass": True, "evidence": "The same run() ports."},
            },
            "previewLabel": "interactive mode (mock)",
            "story": {
                "title": "Enter, add, leave",
                "steps": [
                    step("At rest", "The ordinary face, with an Edit ports… command on its menu.", "base", ".v5-enter"),
                    step("Edit ports…", "The face gives way to the boundary list.", "mode", ".v5-enter"),
                    step("Add header port", "The top boundary is the heading's; a header row appears.", "added", ".be-boundary--header"),
                    step("Done", "Back to the face, with the new dot on the heading.", "done", ".v5-new-dot"),
                ],
            },
            "media": [],
            "preview": v5_preview(),
        },
    ],
    "validation": [
        "Same run() Block, same ports, same viewport and scenario in every hero",
        "Five weighted criteria frozen before generation, summing to 100%",
        "Four hard gates scored separately from the weighted objective",
        "Every hero supports a synchronized guided story and direct controls",
        "V1–V4 are implemented and proven in the real app; V5 is a mock and says so",
    ],
}


CUSTOM_STYLE = r"""
<style id="header-port-rows-babble-style">
  .reference-board { margin: 0 0 38px; padding: 18px; border: 1px solid var(--line); background: rgb(255 253 249 / 74%); }
  .reference-head { display: flex; align-items: end; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
  .reference-head h2 { margin: 6px 0 0; font: 500 25px/1.15 var(--serif); }
  .reference-head p { max-width: 690px; margin: 0; color: var(--muted); font-size: 12px; }
  .reference-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .reference-card { display: grid; grid-template-rows: 1fr auto; overflow: hidden; border: 1px solid #dedfe3; border-radius: 13px; background: #f8f8f9; }
  .reference-card img { width: 100%; height: 210px; object-fit: contain; background: #f1f1f2; }
  .reference-card span { padding: 9px 11px; border-top: 1px solid #e5e5e7; color: #5d6269; background: #fff; font-size: 11px; }
  .variant-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .prototype-frame { background: #f5f6f8; }
  .capture { margin: 0; }
  .capture img { display: block; width: 100%; border: 1px solid #e2e3e7; border-radius: 10px; background: #fff; }
  .capture figcaption { margin-top: 6px; color: #6b7280; font-size: 11px; }
  .capture code { font-size: 10px; }

  .port-proto { position: relative; min-height: 400px; padding: 52px 0 0; overflow: hidden; color: #262a31;
    background: linear-gradient(#f7f8fa 1px, transparent 1px), linear-gradient(90deg, #f7f8fa 1px, transparent 1px), #eef0f3;
    background-size: 18px 18px, 18px 18px, auto; font-family: Inter, ui-sans-serif, system-ui, sans-serif; user-select: none; }
  .canvas-caption { position: absolute; top: 13px; right: 15px; padding: 5px 8px; border: 1px solid #dfe1e5; border-radius: 7px;
    color: #777d86; background: rgb(255 255 255 / 82%); font-size: 9px; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }
  .mb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 16px 0; }
  .mb-chip { padding: 5px 9px; border: 1px solid #d5d7dc; border-radius: 999px; background: #fff; color: #374151; font: 600 11px/1 Inter, sans-serif; cursor: pointer; }
  .mb-chip:hover { border-color: #4f7df3; color: #4f7df3; }
  .mb-chip--primary { border-color: #4f7df3; background: #4f7df3; color: #fff; }
  .mb-note { margin: 10px 16px 14px; color: #6b7280; font-size: 11px; line-height: 1.45; }

  /* Mini Block in the app's idiom */
  .mb { position: relative; margin: 0 auto; border: 1px solid #d9dadd; border-radius: 10px; background: #fff; box-shadow: 0 2px 4px rgb(36 39 45 / 7%); }
  .mb-head { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid #ececef; border-radius: 10px 10px 0 0; }
  .mb-title { font: 500 22px/1 ui-monospace, 'SF Mono', Menlo, monospace; color: #27272a; }
  .mb-type { margin-left: auto; color: #a1a1aa; font-size: 12px; }
  .mb-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 12px; border-top: 1px solid #ececef; color: #a1a1aa; font-size: 12px; }
  .mb-dot { position: absolute; z-index: 4; width: 12px; height: 12px; box-sizing: border-box; border: 2px solid #c08520; border-radius: 50%; background: #fff; transform: translate(-50%, -50%); }
  .mb-dot[data-drag], .mb-dot[data-story-to] { cursor: pointer; }
  .mb-dot[data-drag]:hover, .mb-dot[data-story-to]:hover { box-shadow: 0 0 0 5px rgb(192 133 32 / 22%); }
  .mb-label { position: absolute; z-index: 3; font: 400 15px/22px Inter, sans-serif; color: #27272a; }
  .mb-line { position: absolute; z-index: 2; height: 0; border-top: 1px solid #e4e4e7; }
  .mb-band { position: absolute; z-index: 1; display: none; background: rgb(79 125 243 / 9%); box-shadow: inset 0 0 0 1px rgb(79 125 243 / 22%); }
  .mb-rule { position: absolute; z-index: 5; display: none; height: 0; border-top: 2px solid #4f7df3; }
  .mb-card { position: absolute; z-index: 7; display: none; align-items: center; gap: 6px; padding: 2px 8px 2px 4px; border-radius: 6px; background: #fff; color: #4f7df3; font: 400 15px/22px Inter, sans-serif; box-shadow: 0 3px 10px rgb(15 23 42 / 22%); }
  .mb-grip { display: inline-grid; place-items: center; width: 14px; color: #a1a1aa; font-size: 12px; font-style: normal; }
  .mb-cursor { position: absolute; z-index: 9; display: none; width: 14px; height: 14px; border-radius: 50%; background: rgb(79 125 243 / 35%); transform: translate(-50%, -50%); pointer-events: none; }
  .mb-zone { position: absolute; z-index: 3; cursor: copy; }
  .mb-bead { position: absolute; z-index: 6; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #fff; color: #4f7df3; font: 700 14px/1 Inter, sans-serif; font-style: normal; box-shadow: 0 0 0 2px #4f7df3, 0 0 0 5px rgb(79 125 243 / 22%); transform: translate(-50%, -50%); opacity: 0; pointer-events: none; transition: opacity 90ms; cursor: pointer; }
  .mb-editor { position: absolute; z-index: 8; display: none; padding: 2px 6px; border: 2px solid #4f7df3; border-radius: 6px; background: #fff; font: 400 15px/22px Inter, sans-serif; }
  .mb-editor i { display: inline-block; width: 1px; height: 16px; margin-left: 1px; background: #27272a; vertical-align: -3px; animation: caret 1s steps(1) infinite; }
  @keyframes caret { 50% { opacity: 0; } }
  .mb-tip { position: absolute; z-index: 8; display: none; padding: 3px 7px; border-radius: 5px; background: #27272a; color: #fff; font-size: 11px; }
  .mb-menu { position: absolute; z-index: 10; display: none; flex-direction: column; min-width: 150px; padding: 5px; border: 1px solid #e0e0e4; border-radius: 9px; background: #fff; box-shadow: 0 6px 20px rgb(15 23 42 / 16%); font-size: 12px; }
  .mb-menu span { display: flex; justify-content: space-between; padding: 5px 9px; border-radius: 5px; color: #27272a; }
  .mb-menu span b { color: #9ca3af; font-weight: 400; }
  .mb-menu span[data-story-to] { cursor: pointer; }
  .mb-menu span[data-story-to]:hover { background: #eef2ff; color: #4f7df3; }
  .mb-menu hr { margin: 4px 2px; border: 0; border-top: 1px solid #ececef; }
  .mb-menu-check::before { content: ''; display: inline-block; width: 14px; }
  .mb-menu-check.is-checked::before { content: '✓'; }
  .mb-menu-chip { position: absolute; z-index: 6; padding: 4px 9px; border: 1px solid #d5d7dc; border-radius: 6px; background: #fff; color: #374151; font: 600 11px/1 Inter, sans-serif; cursor: pointer; }

  /* Mini inspector */
  .ins { width: 268px; margin: 0 auto; padding: 10px 12px 12px; border: 1px solid #dedfe3; border-radius: 10px; background: #fff; }
  .ins-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: #6b7280; font: 700 10px/1 Inter, sans-serif; letter-spacing: .08em; }
  .ins-pill { margin-left: auto; padding: 3px 7px; border-radius: 999px; background: #eef0f3; font-weight: 600; letter-spacing: 0; }
  .ins-plus { color: #6b7280; font-size: 14px; }
  .ins-list { position: relative; display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
  .ins-row { position: relative; z-index: 2; display: grid; grid-template-columns: 14px minmax(0, 1fr) 46px 30px 16px; gap: 5px; align-items: center; }
  .ins-row > span { box-sizing: border-box; height: 26px; padding: 0 7px; border: 1px solid #e0e0e4; border-radius: 6px; background: #fff; font: 400 12px/24px Inter, sans-serif; color: #27272a; }
  .ins-type, .ins-def { color: #9ca3af !important; font-family: ui-monospace, Menlo, monospace !important; font-size: 11px !important; }
  .ins-x { border: 0 !important; text-align: center; color: #6b7280 !important; }
  .ins-grip { display: grid; place-items: center; width: 14px; height: 24px; color: #a1a1aa; font-size: 12px; font-style: normal; opacity: .55; cursor: grab; }
  .ins-row:hover .ins-grip { opacity: 1; }
  .ins-line { display: flex; align-items: center; gap: 6px; height: 12px; margin: -1px 0; }
  .ins-line i { flex: 1; height: 1px; background: #e4e4e7; }
  .ins-line--header i { height: 2px; background: #c4c4cc; }
  .ins-line--branch i { margin-left: 50%; }
  .ins-line b { font: 600 9px/1 Inter, sans-serif; letter-spacing: .09em; color: #a1a1aa; text-transform: uppercase; }
  .ins-empty { display: flex; align-items: center; justify-content: center; height: 8px; margin: -3px 0; border-radius: 6px; color: #a1a1aa; font-size: 10px; transition: height 90ms; }
  .ins-empty.is-open { height: 22px; margin: 0; border: 1px dashed #d5d7dc; }
  .ins-band { position: absolute; z-index: 1; left: -4px; right: -4px; display: none; border-radius: 6px; background: rgb(79 125 243 / 9%); box-shadow: inset 0 0 0 1px rgb(79 125 243 / 22%); }
  .ins-bar { position: absolute; z-index: 3; left: 0; right: 0; display: none; height: 0; border-top: 2px solid #4f7df3; }
  .ins-row--card { position: absolute; z-index: 5; left: 0; right: 0; display: none; padding: 2px 0; border-radius: 6px; background: #fff; box-shadow: 0 3px 10px rgb(15 23 42 / 22%); }

  /* Boundary editor (V5) */
  .be { position: absolute; left: 50%; top: 52px; z-index: 6; display: none; width: 300px; box-sizing: border-box; border: 1px solid #d9dadd; border-radius: 10px; background: #fff; box-shadow: 0 2px 4px rgb(36 39 45 / 7%); transform: translateX(-50%); }
  .be-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-bottom: 1px solid #ececef; font: 500 20px/1 ui-monospace, Menlo, monospace; }
  .be-head span { color: #a1a1aa; font: 500 11px/1 Inter, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
  .be-head .mb-chip { margin-left: auto; }
  .be-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 8px 10px 10px; list-style: none; }
  .be-row { display: grid; grid-template-columns: 14px minmax(0, 1fr) 52px 16px; gap: 6px; align-items: center; height: 26px; }
  .be-name { font: 500 13px/1 Inter, sans-serif; }
  .be-kind { color: #9ca3af; font: 400 11px/1 Inter, sans-serif; }
  .be-boundary { display: flex; align-items: center; gap: 6px; height: 18px; padding: 0 4px; border: 1px dashed transparent; border-radius: 6px; color: transparent; font: 500 11px/1 Inter, sans-serif; cursor: pointer; }
  .be-boundary b { display: grid; place-items: center; width: 14px; height: 14px; border: 1px solid transparent; border-radius: 4px; font-weight: 700; }
  .be-boundary:hover, .be-boundary--header { border-color: #d5d7dc; color: #6b7280; }
  .be-boundary:hover b, .be-boundary--header b { border-color: #4f7df3; color: #4f7df3; }
  .be-line { display: flex; align-items: center; gap: 6px; height: 12px; }
  .be-line i { flex: 1; height: 1px; background: #e4e4e7; }
  .be-line b { font: 600 9px/1 Inter, sans-serif; letter-spacing: .09em; color: #a1a1aa; text-transform: uppercase; }
  .be-line--row i { height: 1px; background: #c4c4cc; }

  /* ---- V1 states */
  .v1-transform-head, .v1-card, .v1-band-row, .v1-band-head, .v1-rule-row, .v1-rule-head, .v1-cursor { display: none; }
  .prototype[data-story-state="held"] .v1-band-row, .prototype[data-story-state="held"] .v1-rule-row,
  .prototype[data-story-state="over"] .v1-band-head, .prototype[data-story-state="over"] .v1-rule-head { display: block; }
  .prototype[data-story-state="held"] .v1-card, .prototype[data-story-state="over"] .v1-card { display: inline-flex; }
  .prototype[data-story-state="held"] .v1-transform-row-label, .prototype[data-story-state="over"] .v1-transform-row-label,
  .prototype[data-story-state="lifted"] .v1-transform-row-label, .prototype[data-story-state="lifted"] .v1-transform-row { display: none; }
  .prototype[data-story-state="held"] .v1-transform-row, .prototype[data-story-state="over"] .v1-transform-row { box-shadow: 0 0 0 2px #fff, 0 0 0 3px #c08520, 0 0 0 7px rgb(79 125 243 / 30%); }
  .prototype[data-story-state="held"] .v1-card { left: 12px; top: 137px; }
  .prototype[data-story-state="over"] .v1-card { left: 12px; top: 14px; }
  .prototype[data-story-state="over"] .v1-transform-row { top: 22px !important; }
  .prototype[data-story-state="lifted"] .v1-transform-head { display: block; }
  .prototype[data-story-state="lifted"] .v1-transform-head::after { content: 'transform'; position: absolute; left: 14px; top: -6px; padding: 2px 6px; border-radius: 4px; background: #27272a; color: #fff; font: 400 10px/1.3 Inter, sans-serif; white-space: nowrap; }

  /* ---- V2 states */
  .v2-gain-header, .v2-card { display: none; }
  .prototype[data-story-state="held"] .v2-gain-row, .prototype[data-story-state="over"] .v2-gain-row { visibility: hidden; }
  .prototype[data-story-state="held"] .v2-card, .prototype[data-story-state="over"] .v2-card { display: grid; }
  .prototype[data-story-state="held"] .v2-card { top: 96px; }
  .prototype[data-story-state="over"] .v2-card { top: -6px; }
  .prototype[data-story-state="held"] .v2-empty, .prototype[data-story-state="over"] .v2-empty,
  .prototype[data-story-state="held"] .v2-empty-two, .prototype[data-story-state="over"] .v2-empty-two { height: 22px; margin: 0; border: 1px dashed #d5d7dc; }
  .prototype[data-story-state="held"] .v2-band-row { display: block; top: 36px; height: 100px; }
  .prototype[data-story-state="held"] .v2-bar-row { display: block; top: 121px; }
  .prototype[data-story-state="over"] .v2-band-head { display: block; top: -2px; height: 26px; }
  .prototype[data-story-state="over"] .v2-bar-head { display: block; top: 11px; }
  .prototype[data-story-state="lifted"] .v2-gain-header { display: grid; }
  .prototype[data-story-state="lifted"] .v2-gain-row { display: none; }

  /* ---- V3 states */
  .v3-menu, .v3-submenu, .v3-gain-head { display: none; }
  .v3-menu { left: 6px; top: 96px; }
  .v3-submenu { left: 160px; top: 232px; }
  .prototype[data-story-state="menu"] .v3-menu, .prototype[data-story-state="submenu"] .v3-menu, .prototype[data-story-state="submenu"] .v3-submenu { display: flex; }
  .prototype[data-story-state="moved"] .v3-gain-head { display: block; }
  .prototype[data-story-state="moved"] .v3-gain-row, .prototype[data-story-state="moved"] .v3-gain-row-label { display: none; }

  /* ---- V4 states */
  .v4-new-dot, .v4-editor, .v4-tip { display: none; }
  .prototype[data-story-state="hover"] .v4-bead, .prototype[data-story-state="editing"] .v4-bead { opacity: 1; pointer-events: all; }
  .prototype[data-story-state="editing"] .v4-bead { opacity: 0; pointer-events: none; }
  .prototype[data-story-state="editing"] .v4-new-dot, .prototype[data-story-state="added"] .v4-new-dot { display: block; }
  .prototype[data-story-state="editing"] .v4-editor { display: inline-block; }
  .prototype[data-story-state="added"] .v4-tip { display: block; }

  /* ---- V5 states */
  .v5-editor, .v5-new-dot, .v5-new-row { display: none; }
  .prototype[data-story-state="mode"] .v5-face, .prototype[data-story-state="added"] .v5-face { visibility: hidden; }
  .prototype[data-story-state="mode"] .v5-editor, .prototype[data-story-state="added"] .v5-editor { display: block; }
  .prototype[data-story-state="added"] .v5-new-row { display: grid; }
  .prototype[data-story-state="added"] .be-boundary--header, .prototype[data-story-state="mode"] .be-boundary--header { display: flex; }
  .prototype[data-story-state="done"] .v5-new-dot { display: block; }
  .prototype[data-story-state="done"] .v5-enter, .prototype[data-story-state="mode"] .v5-enter, .prototype[data-story-state="added"] .v5-enter { display: none; }
</style>
"""

CUSTOM_SCRIPT = r"""
<script id="header-port-rows-babble-script">
(() => {
  // Real pointer drags in the V1 and V2 heroes. A drop lands by clicking the
  // matching guided-story control, so the story driver and the prototype can
  // never disagree about the state.
  const go = (proto, state) => proto.closest('.variant-card')?.querySelector(`[data-story-to="${state}"]`)?.click();
  const stateOf = (proto) => proto.closest('.prototype')?.dataset.storyState || 'base';

  document.querySelectorAll('[data-drag-proto]').forEach((proto) => {
    const which = proto.dataset.dragProto;
    const handle = proto.querySelector('[data-drag]');
    if (!handle) return;
    let holdTimer = null;
    let dragging = false;
    let startY = 0;
    const headingBottom = () => {
      const head = which === 'v1' ? proto.querySelector('.mb-head') : proto.querySelector('.ins-line--header');
      return head ? head.getBoundingClientRect().bottom : 0;
    };
    const move = (event) => {
      if (!dragging) return;
      event.preventDefault();
      const above = event.clientY < headingBottom() - (which === 'v1' ? 0 : 6);
      const current = stateOf(proto);
      if (above && current !== 'over') go(proto, 'over');
      if (!above && current !== 'held' && Math.abs(event.clientY - startY) > 4) go(proto, 'held');
    };
    const up = () => {
      clearTimeout(holdTimer);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      if (!dragging) return;
      dragging = false;
      go(proto, stateOf(proto) === 'over' ? 'lifted' : 'base');
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      startY = event.clientY;
      const arm = () => { dragging = true; go(proto, 'held'); };
      // V1 is tldraw's long-press: hold 400 ms without moving. V2's grip means drag at once.
      if (which === 'v1') holdTimer = setTimeout(arm, 400); else arm();
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  });

  // V4: hovering the heading's edge reveals the bead, like the real gutter.
  document.querySelectorAll('[data-hover-proto]').forEach((proto) => {
    const zone = proto.querySelector('[data-hover-to]');
    if (!zone) return;
    zone.addEventListener('pointerenter', () => { if (stateOf(proto) === 'base') go(proto, zone.dataset.hoverTo); });
  });
})();
</script>
"""


def reference_html() -> str:
    sources = [
        (VAULT / "Pasted image 20260901224512.png", None, "Zach's inspector mock: a HEADER line at the top of the inputs, ROW lines between rows — including rows with nothing in them.", "Inspector mock with HEADER and ROW lines"),
        (VAULT / "Pasted image 20260901224727.png", None, "Zach's canvas mock: 'I like the idea of being able to reorder the ports here' — the rows are where the ports are.", "Canvas mock with ports stacked in rows"),
        (VAULT / "Pasted image 20260901223838.png", None, "The pyblocks-style port-editing view Zach was leaning towards: 'Add at this boundary'. Babbled here as V5.", "Boundary editor mock"),
    ]
    cards = "".join(
        f'<figure class="reference-card"><img src="{image_data(path, crop, 720)}" alt="{alt}"><span>{caption}</span></figure>'
        for path, crop, caption, alt in sources
    )
    return f"""
      <section class="reference-board" aria-labelledby="reference-heading">
        <div class="reference-head">
          <div><div class="eyebrow">Zach's sketches, as inspected</div><h2 id="reference-heading">One Block, one question: which row is this port in?</h2></div>
          <p>Every variant keeps the current Block silhouette and the burger grammar already shipped — full line for a row, right-half line for an arm, bare dots on the heading — and answers only how a port gets from one to another.</p>
        </div>
        <div class="reference-grid">{cards}</div>
      </section>
    """


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f"Babble gallery builder not found: {GALLERY}")
    SPEC_PATH.write_text(json.dumps(SPEC, indent=2) + "\n", encoding="utf-8")
    if HTML_PATH.exists():
        HTML_PATH.unlink()
    subprocess.run(
        ["python3", str(GALLERY), "build", "--spec", str(SPEC_PATH), "--output", str(HTML_PATH), "--strict"],
        check=True,
    )
    html = HTML_PATH.read_text(encoding="utf-8")
    html = html.replace("</head>", f"{CUSTOM_STYLE}\n</head>", 1)
    html = html.replace(
        '<section aria-labelledby="variants-heading">',
        f'{reference_html()}\n    <section aria-labelledby="variants-heading">',
        1,
    )
    html = html.replace("</body>", f"{CUSTOM_SCRIPT}\n</body>", 1)
    HTML_PATH.write_text(html, encoding="utf-8")
    subprocess.run(["python3", str(GALLERY), "check", "--input", str(HTML_PATH), "--strict"], check=True)
    print(HTML_PATH)


if __name__ == "__main__":
    main()
