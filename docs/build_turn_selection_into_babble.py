#!/usr/bin/env python3
"""Build the five-direction gallery for turning a selection into a container.

Every number the page states is measured here, at build time, from the live
tree: the pinned engine's own action table in `node_modules/`, the frame-like
shape utils in `src/`, the size of the two menu surfaces a variant would touch,
and a recorded real-browser probe of the running product
(`docs/assets/turn-into-ground-truth-2026-09-03.json`).

Nothing under `src/` is changed by this exploration.
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SPEC = DOCS / "turn-selection-into-babble-2026-09-03.json"
OUTPUT = DOCS / "turn-selection-into-babble-2026-09-03.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")
GROUND_TRUTH = ASSETS / "turn-into-ground-truth-2026-09-03.json"


# ----------------------------------------------------------------------------
# Build-time measurement
# ----------------------------------------------------------------------------


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def tldraw_version() -> str:
    package = json.loads(read(ROOT / "package.json"))
    pinned = package.get("dependencies", {}).get("tldraw") or package.get(
        "devDependencies", {}
    ).get("tldraw")
    installed = json.loads(read(ROOT / "node_modules" / "tldraw" / "package.json"))["version"]
    if pinned != installed:  # pragma: no cover - a mismatch is a build-stopping fact
        raise SystemExit(f"tldraw pinned {pinned!r} but installed {installed!r}")
    return installed


def engine_actions() -> dict[str, str | None]:
    """Read the shipped `kbd` strings straight out of the installed engine."""
    source = read(ROOT / "node_modules" / "tldraw" / "dist-cjs" / "lib" / "ui" / "context" / "actions.js")
    out: dict[str, str | None] = {}
    for action in ("group", "ungroup", "frame-selection", "remove-frame", "fit-frame-to-content"):
        index = source.find(f'id: "{action}"')
        if index == -1:
            out[action] = None
            continue
        window = source[index : index + 260]
        match = re.search(r'kbd:\s*"([^"]*)"', window)
        out[action] = match.group(1) if match else None
    return out


def engine_labels() -> dict[str, str]:
    source = read(
        ROOT
        / "node_modules"
        / "tldraw"
        / "dist-cjs"
        / "lib"
        / "ui"
        / "hooks"
        / "useTranslation"
        / "defaultTranslation.js"
    )
    return {
        key: value
        for key, value in re.findall(r'"action\.([a-z-]+)":\s*"([^"]*)"', source)
        if key in {"group", "ungroup", "frame-selection", "remove-frame", "fit-frame-to-content"}
    }


def frame_like_utils() -> list[str]:
    """Which SystemSketch shape utils derive from tldraw's frame-like base."""
    found: list[str] = []
    for path in sorted((ROOT / "src").rglob("*.tsx")):
        text = read(path)
        for name in re.findall(r"class\s+(\w+)\s+extends\s+BaseFrameLikeShapeUtil", text):
            found.append(name)
    return sorted(found)


def block_views() -> list[str]:
    text = read(ROOT / "src" / "blocks" / "blockModel.ts")
    match = re.search(r"export const BLOCK_VIEWS = \[([^\]]+)\]", text)
    return re.findall(r"'([a-z]+)'", match.group(1)) if match else []


def surface_sizes() -> dict[str, int]:
    menu = read(ROOT / "src" / "blocks" / "ui" / "BlockContextMenu.tsx")
    actions = read(ROOT / "src" / "chrome" / "SelectionLayoutActions.tsx")
    return {
        "contextMenuLines": len(menu.splitlines()),
        "contextMenuItems": menu.count("<TldrawUiMenuItem"),
        "contextMenuSubmenus": menu.count("<TldrawUiMenuSubmenu"),
        "contextMenuGroups": menu.count("<TldrawUiMenuGroup"),
        "selectionActionLines": len(actions.splitlines()),
        "selectionActionButtons": actions.count("<button"),
    }


def section_hits() -> dict[str, int]:
    """Is FigJam's `Wrap in new section` anywhere in the engine or the product?"""

    def count(root: Path, patterns: tuple[str, ...]) -> int:
        total = 0
        for pattern in patterns:
            result = subprocess.run(
                ["grep", "-ril", "--include=*.ts", "--include=*.tsx", "--include=*.js", pattern, str(root)],
                capture_output=True,
                text=True,
            )
            total += len([line for line in result.stdout.splitlines() if line.strip()])
        return total

    return {
        "srcWrapInNewSection": count(ROOT / "src", ("wrap in new section",)),
        "engineWrapInNewSection": count(ROOT / "node_modules" / "tldraw", ("wrap in new section",)),
        "engineSectionShape": count(ROOT / "node_modules" / "tldraw", ('"section"',)),
    }


def inverse_commands() -> list[tuple[str, str]]:
    """Every reachable un-wrap, read out of the product's own menu source."""
    menu = read(ROOT / "src" / "blocks" / "ui" / "BlockContextMenu.tsx")
    labels = re.findall(r'id="([a-z-]+)"\s*\n\s*label=(?:"([^"]*)"|\{[^}]*\})', menu)
    known = {
        "block-detach-to-primitives": "Detach to primitives",
        "block-rebuild-from-primitives": "Rebuild from primitives",
        "connection-detach-to-arrow": "Detach arrow / Detach arrows",
        "frame-remove-keep-contents": "Delete frame, leave children",
        "block-unlink-definition": "Unlink",
    }
    present = [(key, value) for key, value in known.items() if f'id="{key}"' in menu]
    assert present, "the product context menu no longer carries any inverse command"
    return present + [
        ("action.ungroup", "Ungroup (stock, Ctrl+Shift+G)"),
        ("action.remove-frame", "Remove frame (stock, any frame-like shape)"),
    ]


M = {
    "tldraw": tldraw_version(),
    "actions": engine_actions(),
    "labels": engine_labels(),
    "frameLikeUtils": frame_like_utils(),
    "blockViews": block_views(),
    "surfaces": surface_sizes(),
    "sections": section_hits(),
    "inverses": inverse_commands(),
    "probe": json.loads(read(GROUND_TRUTH)),
}


# ----------------------------------------------------------------------------
# Captures: real chrome from the probe run, cropped at build time
# ----------------------------------------------------------------------------


def crop(name: str, box: tuple[int, int, int, int], scale: float = 1.0) -> str:
    """Crop one probe capture and return it as a data URI."""
    source = ASSETS / f"turn-into-{name}-2026-09-03.png"
    image = Image.open(source).convert("RGB").crop(box)
    if scale != 1.0:
        image = image.resize(
            (round(image.width * scale), round(image.height * scale)), Image.LANCZOS
        )
    target = ASSETS / f"crop-turn-into-{name}.png"
    image.save(target)
    return "data:image/png;base64," + base64.b64encode(target.read_bytes()).decode("ascii")


PLATE_EDIT_MENU = crop("edit-submenu", (700, 265, 1090, 435))
PLATE_FRAME_MENU = crop("frame-menu", (700, 252, 1075, 445))
PLATE_SELECTION = crop("selection", (420, 178, 1020, 240))
PLATE_TOOLBELT = crop("selection", (570, 900, 870, 955))
PLATE_WRAPPED = crop("after-wrap", (20, 190, 1420, 760), scale=0.5)


def figure(src: str, caption: str) -> str:
    return (
        "<figure style='margin:0'>"
        f"<img src='{src}' alt='{caption}' style='display:block;width:100%;border:1px solid #d8dbe2;border-radius:7px'/>"
        "</figure>"
    )


# ----------------------------------------------------------------------------
# The drawn heroes: one shared board, five command surfaces
# ----------------------------------------------------------------------------

INK = "#1d1d1d"
MUTED = "#8b8f98"
LINE = "#c9ccd4"
SELECT = "#4f80ff"
ACCENT = "#7667c6"
MONO = "ui-monospace,SFMono-Regular,Menlo,monospace"
SANS = "Inter,system-ui,-apple-system,Segoe UI,sans-serif"

# The frame is split in two on purpose: the board never moves between
# directions, and every command surface is drawn in the band below it, so the
# same four objects stay legible in all five heroes.
W, H = 820, 500
BOARD_BOTTOM = 292
BAND_TOP = 320

NODES = [
    ("read_frame()", 46, 146, 150, 62),
    ("detect()", 262, 110, 150, 62),
    ("annotate()", 262, 220, 150, 62),
    ("publish()", 478, 164, 150, 62),
]
CABLES = [
    "M196 177 H230 V141 H262",
    "M196 177 H230 V251 H262",
    "M412 141 H446 V195 H478",
    "M412 251 H446 V195 H478",
]
SEL = (46, 110, 582, 172)  # the exact bounds of the four objects


def text(x: int, y: int, body: str, size: int = 12, fill: str = INK,
         family: str = SANS, weight: str = "400", anchor: str = "start") -> str:
    return (
        f"<text x='{x}' y='{y}' fill='{fill}' font-size='{size}' font-family='{family}'"
        f" font-weight='{weight}' text-anchor='{anchor}'>{body}</text>"
    )


def board_shape(name: str, x: int, y: int, w: int, h: int, dim: bool = False) -> str:
    stroke = "#b9bdc6" if dim else INK
    return (
        f"<g><rect x='{x}' y='{y}' width='{w}' height='{h}' rx='13' fill='#ffffff'"
        f" stroke='{stroke}' stroke-width='2.6'/>"
        + text(x + w // 2, y + h // 2 + 5, name, 14, MUTED if dim else INK, MONO, anchor="middle")
        + "</g>"
    )


def cables(dim: bool = False) -> str:
    stroke = "#d3d6dd" if dim else "#9aa0aa"
    return "".join(
        f"<path d='{d}' fill='none' stroke='{stroke}' stroke-width='2' stroke-linejoin='round'/>"
        for d in CABLES
    )


def selection_box(x: int, y: int, w: int, h: int) -> str:
    handles = "".join(
        f"<rect x='{cx - 3.5}' y='{cy - 3.5}' width='7' height='7' fill='#ffffff'"
        f" stroke='{SELECT}' stroke-width='1.5'/>"
        for cx, cy in ((x, y), (x + w, y), (x, y + h), (x + w, y + h))
    )
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' fill='none' stroke='{SELECT}'"
        f" stroke-width='1.5'/>{handles}"
    )


def board(dim: bool = False, selected: bool = True) -> str:
    parts = [cables(dim)]
    parts += [board_shape(*node, dim=dim) for node in NODES]
    if selected:
        parts.append(selection_box(*SEL))
    return "".join(parts)


def shell(body: str, suffix: str, label: str) -> str:
    return f"""
<svg viewBox='0 0 {W} {H}' role='img' aria-label='{label}'
     style='display:block;width:100%;height:auto;background:#fbfbfc;border:1px solid #dcdfe6;border-radius:9px'>
  <defs>
    <pattern id='dot-{suffix}' width='26' height='26' patternUnits='userSpaceOnUse'>
      <circle cx='1' cy='1' r='1' fill='#e7e9ee'/>
    </pattern>
    <filter id='pop-{suffix}' x='-30%' y='-30%' width='170%' height='170%'>
      <feDropShadow dx='0' dy='3' stdDeviation='5' flood-color='#0b1020' flood-opacity='0.17'/>
    </filter>
  </defs>
  <rect width='{W}' height='{H}' fill='url(#dot-{suffix})'/>
  {body}
</svg>"""


def menu_panel(x: int, y: int, w: int, rows: list[tuple[str, str, bool]], suffix: str,
               title: str | None = None) -> str:
    """A tldraw-shaped menu: 30px rows, 13px label, right-aligned shortcut."""
    row_h = 30
    pad = 6
    head = 22 if title else 0
    h = head + pad * 2 + row_h * len(rows)
    parts = [
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='9' fill='#ffffff'"
        f" stroke='#e2e4ea' filter='url(#pop-{suffix})'/>"
    ]
    if title:
        parts.append(text(x + 13, y + 16, title, 10, MUTED, SANS, "600"))
    for index, (label, kbd, highlight) in enumerate(rows):
        top = y + head + pad + index * row_h
        if highlight:
            parts.append(
                f"<rect x='{x + 4}' y='{top}' width='{w - 8}' height='{row_h}' rx='6' fill='#eef0fb'/>"
            )
        parts.append(text(x + 13, top + 19, label, 13, INK, SANS))
        if kbd:
            parts.append(text(x + w - 13, top + 19, kbd, 11, MUTED, SANS, anchor="end"))
    return "".join(parts)


def ring(x: int, y: int, w: int, h: int, rx: int = 10) -> str:
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='{rx}' fill='none'"
        f" stroke='{ACCENT}' stroke-width='2' stroke-dasharray='5 4'/>"
    )


def caption(x: int, y: int, body: str, fill: str = ACCENT) -> str:
    return text(x, y, body, 11, fill, MONO, "600")


# --- the four container results ---------------------------------------------


BOX = (18, 58, 676, 234)  # the container drawn around the untouched fixture


def result_frame() -> str:
    x, y, w, h = BOX
    return (
        text(x, y - 8, "Frame 1", 12, MUTED, SANS)
        + f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='4' fill='#ffffff'"
        f" fill-opacity='0.55' stroke='#b6bac3' stroke-width='1.5'/>"
    )


def result_block() -> str:
    x, y, w, h = BOX
    ports = "".join(
        f"<circle cx='{x}' cy='{y + 92 + i * 52}' r='5.5' fill='#ffffff' stroke='#d4a72c' stroke-width='2'/>"
        for i in range(2)
    )
    ports += (
        f"<circle cx='{x + w}' cy='{y + 118}' r='5.5' fill='#ffffff' stroke='#d4a72c' stroke-width='2'/>"
    )
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='11' fill='#ffffff'"
        f" fill-opacity='0.6' stroke='{INK}' stroke-width='2.4'/>"
        f"<rect x='{x}' y='{y}' width='{w}' height='32' rx='11' fill='#f1f2f6'/>"
        f"<rect x='{x}' y='{y + 21}' width='{w}' height='11' fill='#f1f2f6'/>"
        f"<line x1='{x}' y1='{y + 32}' x2='{x + w}' y2='{y + 32}' stroke='#dfe1e7'/>"
        + text(x + 14, y + 22, "block_1", 14, INK, MONO, "600")
        + ports
    )


def result_branch() -> str:
    x, y, w, h = BOX
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='11' fill='#ffffff'"
        f" fill-opacity='0.6' stroke='#5a7bd4' stroke-width='2.4'/>"
        f"<rect x='{x}' y='{y}' width='{w}' height='30' rx='11' fill='#eaf0ff'/>"
        f"<rect x='{x}' y='{y + 19}' width='{w}' height='11' fill='#eaf0ff'/>"
        + text(x + 14, y + 21, "branch  ·  arm 0", 12, "#3d5aa8", MONO, "600")
    )


def result_group() -> str:
    x, y, w, h = BOX
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='4' fill='none'"
        f" stroke={SELECT!r} stroke-width='1.5' stroke-dasharray='4 4'/>"
        + text(x, y - 8, "group", 12, MUTED, SANS)
    )


RESULTS = {
    "frame": result_frame,
    "block": result_block,
    "branch": result_branch,
    "group": result_group,
}


def wrapped_board(kind: str, band: str = "") -> str:
    """The same four objects, untouched, now held by one container of `kind`."""
    x, y, w, h = BOX
    return (
        RESULTS[kind]()
        + cables()
        + "".join(board_shape(*node) for node in NODES)
        + selection_box(x - 2, y - 2, w + 4, h + 4)
        + band
    )


def hero(suffix: str, base_overlay: str, alt_body: str, base_label: str, alt_label: str,
         base_selected: bool = True) -> str:
    """One judgeable hero: shared board + this variant's surface, two states."""
    base = (
        "<g class='demo-base-only'>"
        + board(selected=base_selected)
        + base_overlay
        + "</g>"
    )
    alt = "<g class='demo-alt-only'>" + alt_body + "</g>"
    style = (
        "<style>"
        ".prototype svg .demo-alt-only{display:none}"
        ".prototype.is-alt svg .demo-alt-only{display:inline}"
        ".prototype.is-alt svg .demo-base-only{display:none}"
        "</style>"
    )
    return (
        style
        + "<div style='padding:0 18px 12px'>"
        + shell(base + alt, suffix, f"{suffix} command surface")
        + "<div style='display:flex;gap:10px;align-items:center;margin-top:11px'>"
        + f"<button type='button' class='demo-button' data-demo-toggle"
        f" data-base-label='{base_label}' data-alt-label='{alt_label}'>{base_label}</button>"
        + "<span style='font:11px/1.4 ui-monospace,monospace;color:#7b7f88'>"
        "same four objects, same multi-selection, in every direction</span>"
        + "</div></div>"
    )


def band_label(body: str, fill: str = ACCENT) -> str:
    return caption(26, BAND_TOP - 12, body, fill)


# --- V1: Turn into ▸ submenu -------------------------------------------------

V1_BASE = (
    band_label("right-click the selection · one new top-level submenu, beside Detach")
    + menu_panel(
        150,
        BAND_TOP,
        246,
        [
            ("Turn into", "▸", True),
            ("Detach to primitives", "", False),
            ("Delete frame, leave children", "", False),
        ],
        "v1",
    )
    + menu_panel(
        392,
        BAND_TOP - 6,
        196,
        [("Frame", "", False), ("Block", "", True), ("Branch", "", False), ("Group", "Ctrl+G", False)],
        "v1",
        title="TURN INTO",
    )
    + ring(146, BAND_TOP - 4, 254, 38)
    + text(600, BAND_TOP + 46, "the inverse is", 11, MUTED, MONO)
    + text(600, BAND_TOP + 62, "already in this", 11, MUTED, MONO)
    + text(600, BAND_TOP + 78, "same menu", 11, MUTED, MONO)
)

# --- V2: wrap tile on the selection menu ------------------------------------


def selection_bar(suffix: str, wrap_label: str = "Wrap", chevron: bool = True,
                  highlight: bool = True) -> str:
    """The product's own floating menu, with one extra split control on it."""
    x, y, w, h = 214, 22, 372, 40
    parts = [
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='9' fill='#232529'"
        f" filter='url(#pop-{suffix})'/>"
    ]
    for glyph, dx in (("◻", 26), ("●", 64), ("≡", 102), ("Aa", 142)):
        parts.append(text(x + dx, y + 26, glyph, 13, "#e6e8ee", SANS, anchor="middle"))
    parts.append(f"<line x1='{x + 172}' y1='{y + 9}' x2='{x + 172}' y2='{y + 31}' stroke='#3d4149'/>")
    tile_w = 108 if chevron else 90
    if highlight:
        parts.append(
            f"<rect x='{x + 182}' y='{y + 5}' width='{tile_w}' height='30' rx='7' fill='#3f4553'/>"
        )
    parts.append(text(x + 196, y + 25, f"▣  {wrap_label}", 13, "#ffffff", SANS, "600"))
    if chevron:
        parts.append(text(x + 276, y + 25, "▾", 11, "#aeb3bd", SANS, anchor="middle"))
    parts.append(
        f"<line x1='{x + 182 + tile_w + 8}' y1='{y + 9}' x2='{x + 182 + tile_w + 8}' y2='{y + 31}'"
        " stroke='#3d4149'/>"
    )
    parts.append(text(x + 182 + tile_w + 42, y + 25, "Inspect", 12, "#c8ccd4", SANS, anchor="middle"))
    return "".join(parts)


V2_BASE = (
    selection_bar("v2")
    + ring(392, 24, 116, 36, 9)
    + caption(214, 16, "mounted only while two or more objects are selected")
    + band_label("the chevron's list — the container vocabulary, four rows")
    + menu_panel(
        204,
        BAND_TOP,
        200,
        [("Frame", "", False), ("Block", "", True), ("Branch", "", False), ("Group", "", False)],
        "v2",
    )
    + text(432, BAND_TOP + 40, "broad face  →  the container used last time", 11, MUTED, MONO)
    + text(432, BAND_TOP + 60, "chevron     →  pick a different one", 11, MUTED, MONO)
    + text(432, BAND_TOP + 88, "on a container the same tile reads  Unwrap", 11, "#2f9e6b", MONO, "600")
)

V2_ALT = wrapped_board(
    "block",
    band=selection_bar("v2", "Unwrap", chevron=False)
    + ring(392, 24, 98, 36, 9)
    + band_label("the way back is the control you just pressed", "#2f9e6b"),
)

# --- V3: wrap neutral, retype from the container's own header ----------------

V3_BASE = (
    selection_bar("v3", chevron=False)
    + ring(392, 24, 98, 36, 9)
    + caption(214, 16, "one unconditional move · nothing is chosen here")
    + band_label("no picker exists in the command at all", "#c2762a")
    + text(26, BAND_TOP + 24, "wrap    →  always a plain Frame", 12, INK, MONO)
    + text(26, BAND_TOP + 48, "retype  →  later, off the object, if ever", 12, MUTED, MONO)
    + text(26, BAND_TOP + 80, "the container's own header carries Turn into ▸", 11, "#c2762a", MONO, "600")
)

V3_ALT = wrapped_board(
    "frame",
    band=band_label("step two, on a different object, at a different time", "#c2762a")
    + menu_panel(
        150,
        BAND_TOP,
        228,
        [("Rename", "", False), ("Turn into", "▸", True), ("Remove frame", "", False)],
        "v3",
        title="FRAME 1",
    )
    + menu_panel(
        374,
        BAND_TOP + 8,
        176,
        [("Block", "", True), ("Branch", "", False), ("Group", "", False)],
        "v3",
    )
    + ring(146, BAND_TOP + 56, 236, 34),
)

# --- V4: extend the stock frame-selection action -----------------------------


def keycap(x: int, y: int, label: str, state: str) -> str:
    """state: live | dead | new"""
    fill = {"live": "#ffffff", "dead": "#fdecea", "new": "#f3eefd"}[state]
    stroke = {"live": "#c9ccd4", "dead": "#e0a29a", "new": "#c3b4ea"}[state]
    ink = {"live": INK, "dead": "#c0392b", "new": "#6d4fbd"}[state]
    w = 8 * len(label) + 26
    parts = [
        f"<rect x='{x}' y='{y}' width='{w}' height='34' rx='7' fill='{fill}' stroke='{stroke}'"
        " stroke-width='1.4'/>",
        text(x + w // 2, y + 22, label, 12, ink, MONO, "600", anchor="middle"),
    ]
    if state == "dead":
        parts.append(
            f"<line x1='{x + 8}' y1='{y + 17}' x2='{x + w - 8}' y2='{y + 17}' stroke='#c0392b'"
            " stroke-width='1.6'/>"
        )
    return "".join(parts), w


def keycap_row(x: int, y: int, caps: list[tuple[str, str]]) -> str:
    out, cursor = [], x
    for label, state in caps:
        markup, width = keycap(cursor, y, label, state)
        out.append(markup)
        cursor += width + 10
    return "".join(out)


V4_BASE = (
    band_label("no menu, no tile — the container type is the key you press")
    + keycap_row(
        26,
        BAND_TOP,
        [("Ctrl+G", "live"), ("Ctrl+Shift+G", "live"), ("Ctrl+Alt+G", "dead")],
    )
    + text(26, BAND_TOP + 54, "group", 11, MUTED, MONO)
    + text(112, BAND_TOP + 54, "ungroup", 11, MUTED, MONO)
    + text(232, BAND_TOP + 54, "frame — printed in the menu, measured not to fire", 11, "#c0392b", MONO, "600")
    + keycap_row(26, BAND_TOP + 74, [("Ctrl+Alt+B", "new"), ("Ctrl+Alt+R", "new")])
    + text(26, BAND_TOP + 128, "block · branch — two new members of a family the user already half-owns",
           11, "#6d4fbd", MONO, "600")
    + ring(22, BAND_TOP - 4, 336, 42)
)

V4_ALT = wrapped_board(
    "frame",
    band=band_label("the identical keystroke is the inverse — stock behaviour")
    + keycap_row(26, BAND_TOP, [("Ctrl+Alt+G", "live")])
    + text(150, BAND_TOP + 22, "→  frame-selection routes an all-frames selection to removeFrame",
           11, MUTED, MONO)
    + text(26, BAND_TOP + 62, "measured: Meta+Alt+G wrapped, then the second press unwrapped",
           11, "#2f9e6b", MONO, "600"),
)

# --- V5: draw the container over them ---------------------------------------


def tool_belt(suffix: str, active: int) -> str:
    """Where it really is: centred at the bottom of the canvas."""
    x, y, w = 268, BAND_TOP + 46, 284
    parts = [
        f"<rect x='{x}' y='{y}' width='{w}' height='44' rx='11' fill='#ffffff'"
        f" stroke='#e2e4ea' filter='url(#pop-{suffix})'/>"
    ]
    for index, glyph in enumerate(["↖", "⛶", "◻", "✎", "T", "◧"]):
        cx = x + 26 + index * 44
        if index == active:
            parts.append(
                f"<rect x='{cx - 17}' y='{y + 6}' width='34' height='32' rx='8' fill='{SELECT}'/>"
            )
        parts.append(
            text(cx, y + 28, glyph, 15, "#ffffff" if index == active else "#5b6069", SANS, anchor="middle")
        )
    return "".join(parts)


def V5_BASE() -> str:
    x, y, w, h = BOX
    return (
        f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='11' fill='none' stroke='{SELECT}'"
        " stroke-width='2' stroke-dasharray='7 5'/>"
        + f"<circle cx='{x + w}' cy='{y + h}' r='6' fill='{SELECT}'/>"
        + caption(x, y - 8, "the box you drag is the command")
        + tool_belt("v5", 5)
        + ring(496, BAND_TOP + 52, 44, 32, 9)
        + band_label("the container tools are already here — nothing reads the selection", "#c0392b")
    )


def vocabulary_table() -> str:
    """What can hold children today, each cell read off the probe of the live editor."""
    probe = {row["type"]: row for row in M["probe"]["frameLike"] if "type" in row}
    views = {row["view"]: row for row in M["probe"]["blockViews"]}
    rows = [
        ("frame", "stock tldraw", probe["frame"]),
        ("branch", "the region, with arms", probe["branch"]),
        ("block · expanded", "the only Block view that holds children", views["expanded"]),
        ("block · simple, port, value", "the other three views decline", views["simple"]),
        ("group", "made by groupShapes, not by parenting", probe["group"]),
        ("geo", "an ordinary shape, for contrast", probe["geo"]),
    ]
    cells = "".join(
        "<div style='border:1px solid #d8dbe2;border-radius:7px;padding:9px 11px;"
        + ("background:#f2f7ff;border-color:#b9cdf0" if row["frameLike"] else "")
        + f"'><b>{name}</b><br/><span style='color:#7b7f88'>frame-like "
        f"{str(row['frameLike']).lower()} · accepts child {str(row['acceptsGeoChild']).lower()}"
        f"<br/>{note}</span></div>"
        for name, note, row in rows
    )
    return (
        "<div style='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;"
        f"font:12px/1.45 ui-monospace,monospace'>{cells}</div>"
    )


# ----------------------------------------------------------------------------
# The prune contract, frozen before the directions were scored
# ----------------------------------------------------------------------------

requirements = [
    {
        "id": "fr1",
        "name": "Converting stays cheap, dumb and reversible",
        "weight": 25,
        "why": (
            "The board is a hackable drawing surface, not a language front end. Wrapping must "
            "move records and nothing else — no inference, no validation, no synthesised ports — "
            "and the un-wrap must be one obvious move away."
        ),
        "passCondition": (
            "The command's whole effect is create-container + reparent, and a single named "
            "command puts the objects back where they were."
        ),
        "anchors": {
            "1": "Conversion reads the selection's contents to decide structure, or the inverse is a different destructive command.",
            "3": "Conversion is mechanical, but the inverse is reached somewhere unrelated to the thing that was made.",
            "5": "Conversion is create + reparent only, and the inverse sits on the container itself.",
        },
    },
    {
        "id": "fr2",
        "name": "Borrowed muscle memory, not a new interaction",
        "weight": 20,
        "why": (
            "The standing rule is to compose from gestures a whiteboard user already owns. "
            "FigJam and tldraw are the two oracles, and both already answer this question."
        ),
        "passCondition": "Every gesture in the direction can be pointed at in FigJam or in stock tldraw.",
        "anchors": {
            "1": "Introduces a gesture neither oracle has.",
            "3": "Uses a familiar surface but changes what a familiar control does.",
            "5": "Every step is a control or keystroke that already exists in one of the two oracles.",
        },
    },
    {
        "id": "fr3",
        "name": "Findable at the moment of intent",
        "weight": 18,
        "why": (
            "The trigger is 'I have just selected these and want them held together'. A command "
            "that only rewards prior knowledge will not be used, however cheap it is to build."
        ),
        "passCondition": "With a fresh multi-selection, a user who has never seen the feature can reach it.",
        "anchors": {
            "1": "Invisible: keyboard-only, or requires knowing a menu path in advance.",
            "3": "One deliberate click away, inside a menu the user already opens.",
            "5": "Visible on the selection itself, with no click spent looking.",
        },
    },
    {
        "id": "fr4",
        "name": "Rides a stock seam already used here",
        "weight": 20,
        "why": (
            "tldraw stays stock and pinned. The cheapest safe direction is one built from a "
            "component / action / override seam this repository already composes with."
        ),
        "passCondition": (
            "The direction is expressible in tldraw's menu, action-override, or shape seams, with "
            "no new tool, no new gesture engine, and no fork."
        ),
        "anchors": {
            "1": "Needs engine behaviour tldraw does not expose.",
            "3": "Fits a supported seam but adds a new subsystem beside it.",
            "5": "Is a further use of a seam already present in this tree.",
        },
    },
    {
        "id": "fr5",
        "name": "Extends what ships instead of rivalling it",
        "weight": 17,
        "why": (
            "The engine already wraps a selection and already un-wraps it. This tree has already "
            "grown one duplicate of an engine command; a second one is a real cost, not a "
            "theoretical one."
        ),
        "passCondition": "The frame case routes through the engine's own action rather than a parallel command.",
        "anchors": {
            "1": "Adds a second command with the same effect as a stock one, in the same menu.",
            "3": "Sits beside the stock command without contradicting it.",
            "5": "Re-registers or wraps the stock command so there is exactly one code path.",
        },
    },
]

gates = [
    {
        "id": "g1",
        "name": "Nothing is derived at conversion time",
        "why": (
            "No linting, no type inference, no boundary ports synthesised from the cables that "
            "cross the new edge. Cables simply cross, which the renderer already permits."
        ),
    },
    {
        "id": "g2",
        "name": f"Stock tldraw {M['tldraw']} through supported seams",
        "why": "No engine fork and no reimplemented primitive; the stock-boundary test must stay green.",
    },
    {
        "id": "g3",
        "name": "Reversible by an obviously related move",
        "why": "Whatever wraps must un-wrap from the container itself, not from an unrelated command.",
    },
    {
        "id": "g4",
        "name": "No invented whiteboard gesture",
        "why": "Every gesture must already exist in FigJam or in stock tldraw.",
    },
    {
        "id": "g5",
        "name": "Acts on the selection the user already made",
        "why": (
            "The brief is 'select several things, then convert them'. A direction that discards "
            "the selection answers a different question."
        ),
    },
]


def score(value: int, evidence: str, confidence: str = "high") -> dict:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def gate(passed: bool, evidence: str) -> dict:
    return {"pass": passed, "evidence": evidence}


A = M["actions"]
P = M["probe"]
S = M["surfaces"]
FRAME_LIKE = ", ".join(M["frameLikeUtils"])
CONTAINERS = "frame, branch, branch-arm, and a Block whose view is expanded"

variants = [
    {
        "id": "v1",
        "name": "Turn Into ▸",
        "thesis": (
            "Put one top-level “Turn into ▸” submenu in the context menu the product already "
            "owns, listing the four container types, beside the detach commands that are its inverse."
        ),
        "accent": "#4f80ff",
        "bestWhen": (
            "The container type genuinely varies shot to shot and the user wants to read the "
            "options before committing to one."
        ),
        "losesWhen": (
            "The common case is one container type used over and over — then a right-click plus a "
            "hover plus a click is three moves for a decision the user had already made."
        ),
        "decisions": [
            {"label": "Surface", "value": "A new top-level TldrawUiMenuSubmenu in BlockContextMenu.tsx."},
            {"label": "Type choice", "value": "Chosen before the wrap, from a flat four-item list."},
            {"label": "Frame path", "value": "Routes to the stock frame-selection action; it is not a second implementation."},
            {"label": "Inverse", "value": "The existing Detach / Delete frame, leave children group, one menu away."},
        ],
        "keepParts": [
            "the four-item container vocabulary",
            "placing the wrap next to its inverse in one menu",
            "routing the Frame case through the stock action",
        ],
        "proof": [
            f"The file it would live in already composes {S['contextMenuSubmenus']} submenus and "
            f"{S['contextMenuItems']} items across {S['contextMenuGroups']} groups in "
            f"{S['contextMenuLines']} lines — this is a further use of a seam, not a new one.",
            "Driven in the running product: the stock wrap is real but two levels down — right-click "
            "shows Edit ▸, and Frame selection lives inside it.",
            f"Clicking that item produced one frame of {P['afterWrap']['frameW']}×{P['afterWrap']['frameH']} "
            f"holding all {P['afterWrap']['children']} objects, with the frame left selected.",
        ],
        "scores": {
            "fr1": score(5, "The submenu only chooses which container to create; the wrap is create + reparent, and the inverse group is already in the same menu."),
            "fr2": score(5, "FigJam answers a multi-select right-click with a wrap control, and tldraw already parks Frame selection in this exact menu."),
            "fr3": score(3, "One deliberate right-click into a menu the user already opens, but nothing on the selection advertises it."),
            "fr4": score(5, f"TldrawUiMenuSubmenu is used {S['contextMenuSubmenus']} times in the same file already."),
            "fr5": score(4, "The Frame row can call the stock action, but Block/Branch/Group rows are new commands sitting beside it.", "medium"),
        },
        "gateResults": {
            "g1": gate(True, "The menu chooses a type; it never reads the selection's contents to pick one."),
            "g2": gate(True, "Menu composition only — no new shape, tool, or binding."),
            "g3": gate(True, "Detach to primitives and Delete frame, leave children are already in this menu."),
            "g4": gate(True, "Right-click into a submenu is the oldest gesture on the board."),
            "g5": gate(True, "The command reads editor.getSelectedShapeIds()."),
        },
        "previewLabel": "wrap the selection into a Block",
        "story": {
            "title": "Choose the container from the menu you already open",
            "steps": [
                {"label": "Right-click the multi-selection", "caption": "Turn into ▸ sits at the top level, beside Detach — one hover shows the four container types.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Pick Block", "caption": "The four objects become children of one Expanded Block; the cables keep crossing the new edge untouched.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Where the command lives today",
                "caption": "Captured from the running product: the wrap already exists as “Frame selection”, but only inside the stock Edit ▸ submenu, and it names an engine primitive rather than any of this app's containers.",
                "html": figure(PLATE_EDIT_MENU, "Edit submenu showing Group, Flatten, Frame selection, Toggle locked"),
            },
            {
                "label": "The container vocabulary this would list",
                "caption": f"Measured from the running editor: {CONTAINERS} report isShapeFrameLike true and accept a geo child. Groups are real but are made by groupShapes, not by parenting.",
                "html": vocabulary_table(),
            },
        ],
        "preview": hero(
            "v1",
            V1_BASE,
            wrapped_board(
                "block",
                band=band_label("Detach to primitives, one menu away, is the way back", "#4f80ff"),
            ),
            "Open Turn into ▸",
            "Undo the wrap",
        ),
    },
    {
        "id": "v2",
        "name": "Wrap Tile",
        "thesis": (
            "Put a split Wrap control on the floating selection menu that only exists while two or "
            "more objects are selected — broad face wraps into the last container used, chevron "
            "picks a different one."
        ),
        "accent": "#2f9e6b",
        "bestWhen": (
            "Wrapping is a frequent, low-ceremony act and the user usually wants the same container "
            "they used last time."
        ),
        "losesWhen": (
            "The selection menu is already crowded, or the remembered default is wrong often enough "
            "that the broad face becomes a trap the user has to undo."
        ),
        "decisions": [
            {"label": "Surface", "value": "One tile in the product's own SelectionContextualMenu, beside Tidy edges and Organize nodes."},
            {"label": "Type choice", "value": "Broad face = last used; chevron opens the same four-item list."},
            {"label": "Visibility", "value": "Mounted only when the selection holds two or more shapes — the FigJam rule."},
            {"label": "Inverse", "value": "The tile becomes Unwrap when the selection is a single container."},
        ],
        "keepParts": [
            "appearing only on multi-select",
            "the split broad-face / chevron control",
            "the tile flipping to Unwrap on a container",
        ],
        "proof": [
            "This is FigJam's own answer, and it is already measured in this repository: the FigJam "
            "contextual menu gains “Wrap in new section” exactly when the selection holds more than "
            "one object (two sticky notes → 523 px; sticky + shape → 96 px).",
            f"The host component already exists and already carries one-shot selection commands — "
            f"SelectionLayoutActions.tsx is {S['selectionActionLines']} lines with "
            f"{S['selectionActionButtons']} buttons.",
            "Driven in the running product: on a four-object multi-selection the menu today offers "
            "only style controls and Inspect — there is no wrap tile of any kind.",
        ],
        "scores": {
            "fr1": score(5, "The tile issues create + reparent; the same tile flipped to Unwrap issues the inverse on the container it made."),
            "fr2": score(5, "Direct FigJam parity, measured against the live FigJam editor by this repository's own contextual-menu spec."),
            "fr3": score(5, "It is on the selection the moment the selection exists, which is exactly the moment of intent."),
            "fr4": score(4, "SelectionLayoutActions and the placement policy already exist, but the split control and its popover are new product code rather than a stock menu item.", "medium"),
            "fr5": score(4, "The default face can call frame-selection, but the popover's other rows are new commands.", "medium"),
        },
        "gateResults": {
            "g1": gate(True, "Nothing about the selection's contents changes which container is offered; only the remembered last choice does."),
            "g2": gate(True, "The menu is already a mounted InFrontOfTheCanvas component, a supported seam."),
            "g3": gate(True, "The same tile is the un-wrap when a container is selected."),
            "g4": gate(True, "A contextual toolbar tile with a chevron is FigJam's control and is already used by the recorder here."),
            "g5": gate(True, "The tile is mounted from the selection itself."),
        },
        "previewLabel": "wrap the selection into a Block",
        "story": {
            "title": "The control arrives with the selection",
            "steps": [
                {"label": "Select two or more objects", "caption": "A Wrap tile appears on the floating menu, exactly where FigJam puts “Wrap in new section”. The chevron lists the four container types.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Wrap", "caption": "One click on the broad face uses the container you used last; the tile now reads Unwrap, so the way back is the control you just pressed.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "What the selection menu offers today",
                "caption": "Captured from the running product with four objects selected: shape, colour, line style, typeface, size, alignment, Inspect. Nothing about holding them together.",
                "html": figure(PLATE_SELECTION, "The product's floating selection menu on a multi-selection"),
            },
            {
                "label": "The FigJam control this copies",
                "caption": "From this repository's measured FigJam contextual-menu spec — the wrap control is the thing FigJam adds when the selection stops being a single object.",
                "html": (
                    "<div style='font:12px/1.6 ui-monospace,monospace'>"
                    "<div style='border:1px solid #d8dbe2;border-radius:7px;padding:10px 12px;margin-bottom:7px'>"
                    "<b>Two sticky notes</b> · 523 px · <span style='color:#7b7f88'>the sticky set, plus Alignment and "
                    "<span style='color:#2f9e6b;font-weight:700'>Wrap in new section</span></span></div>"
                    "<div style='border:1px solid #d8dbe2;border-radius:7px;padding:10px 12px'>"
                    "<b>Sticky + shape</b> · 96 px · <span style='color:#7b7f88'>Alignment · "
                    "<span style='color:#2f9e6b;font-weight:700'>Wrap in new section</span></span></div>"
                    "</div>"
                ),
            },
        ],
        "preview": hero("v2", V2_BASE, V2_ALT, "Click Wrap", "Click Unwrap"),
    },
    {
        "id": "v3",
        "name": "Wrap Now, Name It Later",
        "thesis": (
            "Take the type choice out of the command entirely: one move always makes a plain Frame, "
            "and the container is retyped afterwards from its own header — the way a Block's view is "
            "already changed."
        ),
        "accent": "#c2762a",
        "bestWhen": (
            "The user does not yet know what the thing is. Wrapping is the cheap act of saying "
            "“these belong together”; the semantics arrive later, if ever."
        ),
        "losesWhen": (
            "The user always knows the type up front — then every wrap costs a second, separate "
            "retyping step, and the board briefly fills with frames nobody meant."
        ),
        "decisions": [
            {"label": "Surface", "value": "One unconditional wrap; no picker anywhere in the command."},
            {"label": "Type choice", "value": "Deferred to a Turn into ▸ on the container's own menu, read off the visible object."},
            {"label": "Lowering", "value": "Frame → Block/Branch reparents the same children and carries the name across."},
            {"label": "Inverse", "value": "Remove frame, which the engine already offers for every frame-like shape."},
        ],
        "keepParts": [
            "wrapping with no decision attached",
            "retyping from the object rather than from the command",
            "the container's name surviving the retype",
        ],
        "proof": [
            "Retyping-from-the-object is an idiom this product already has: a Block's view is changed "
            f"from its own context menu across {len(M['blockViews'])} values ({', '.join(M['blockViews'])}).",
            "The un-wrap is already engine-provided for whatever it becomes: Remove frame is offered "
            f"for any frame-like shape, and in this tree that means {FRAME_LIKE}.",
            "Driven in the running product: clicking Remove frame on the wrapped frame left all four "
            f"objects loose and selected ({P['afterUnwrap']['loose']} of 4, "
            f"{P['afterUnwrap']['frameCount']} frames remaining).",
        ],
        "scores": {
            "fr1": score(5, "This is the dumbest possible conversion — one act, no branch, and the engine's own Remove frame is the inverse."),
            "fr2": score(4, "Retyping off an object's header is a familiar move here, but 'wrap first, decide later' is not something either oracle does; both pick the container up front.", "medium"),
            "fr3": score(4, "The wrap itself is a single visible move, but the retype is a second thing to discover on a second object."),
            "fr4": score(3, "The wrap is stock, but lowering an existing frame into a Block or Branch while keeping children and name is new machinery with no stock equivalent.", "medium"),
            "fr5": score(5, "The wrap is literally the stock frame-selection action, unmodified."),
        },
        "gateResults": {
            "g1": gate(True, "The wrap cannot infer anything because it has nothing to choose."),
            "g2": gate(True, "The wrap is a stock action; the retype is a shape-level command in a registered shape util."),
            "g3": gate(True, "Remove frame sits on the container and works for every frame-like shape in this tree."),
            "g4": gate(True, "No gesture at all — a menu item and a keystroke."),
            "g5": gate(True, "frame-selection operates on the current selection."),
        },
        "previewLabel": "wrap, then retype from the header",
        "story": {
            "title": "Separate holding-together from deciding-what-it-is",
            "steps": [
                {"label": "Wrap with no decision", "caption": "One move, always a plain Frame. Nothing is chosen, so nothing can be chosen wrong.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Retype it later, off the object", "caption": "The container's own menu carries Turn into ▸. The children and the name survive; Remove frame is still the way out.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Both inverses are already in one menu",
                "caption": "Captured from the running product on the wrapped frame: this tree carries its own “Delete frame, leave children” at the top level and the engine's “Remove frame” inside Edit ▸ — two commands, one effect. Whatever direction wins should collapse that, not add a third.",
                "html": figure(PLATE_FRAME_MENU, "Context menu on a frame showing two separate remove-frame commands"),
            },
            {
                "label": "The retype this borrows from",
                "caption": f"A Block already changes what it is from its own menu, across {len(M['blockViews'])} views — and only the expanded one is a container. Retyping a Frame into a Block is the same move one level up.",
                "html": (
                    "<div style='display:flex;gap:7px;flex-wrap:wrap;font:12px/1 ui-monospace,monospace'>"
                    + "".join(
                        "<span style='border:1px solid #d8dbe2;border-radius:999px;padding:7px 13px;"
                        + ("background:#fff3e2;border-color:#e2b477;font-weight:700" if row["frameLike"] else "color:#7b7f88")
                        + f"'>{row['view']}{' · container' if row['frameLike'] else ''}</span>"
                        for row in P["blockViews"]
                    )
                    + "</div>"
                ),
            },
        ],
        "preview": hero("v3", V3_BASE, V3_ALT, "Wrap it", "Retype the Frame"),
    },
    {
        "id": "v4",
        "name": "Same Key Family",
        "thesis": (
            "Add no surface at all: repair the stock frame-selection shortcut, which this build "
            "advertises and does not fire, and give it two siblings so the container type is the key "
            "you press."
        ),
        "accent": "#8c5bd6",
        "bestWhen": (
            "The user already lives in Ctrl+G / Ctrl+Shift+G and wants the fourth and fifth members "
            "of a family they can feel rather than read."
        ),
        "losesWhen": (
            "Anyone has to be told the feature exists — which, on a board whose menu currently lies "
            "about the binding, is everyone."
        ),
        "decisions": [
            {"label": "Surface", "value": "None. TLUiOverrides.actions only."},
            {"label": "Type choice", "value": "The key: G frame, B block, R branch — no picker exists."},
            {"label": "Repair", "value": f"frame-selection ships kbd {A['frame-selection']!r} with no ctrl alternative, unlike group's {A['group']!r}."},
            {"label": "Inverse", "value": "The same keystroke again — frame-selection already routes an all-frames selection to removeFrame."},
        ],
        "keepParts": [
            "fixing the dead ctrl binding regardless of which direction wins",
            "the key-again-to-unwrap symmetry",
            "keeping the frame case on the engine's own action",
        ],
        "proof": [
            "Measured in the running product with the canvas focused by a real click "
            "(docs/turn_into_probe.mjs): "
            f"Ctrl+G grouped ({P['shortcuts']['ctrl+g']['observed']}), "
            f"Ctrl+Shift+G ungrouped ({P['shortcuts']['ctrl+shift+g']['observed']}), and "
            f"Ctrl+Alt+G — the binding the menu prints — did nothing ({P['shortcuts']['ctrl+alt+g']['observed']}).",
            f"Meta+Alt+G, the literal kbd string the engine registers, did fire: "
            f"{P['shortcuts']['meta+alt+g']['observed']}, and pressing it again put the objects back "
            f"({P['shortcuts']['inverse']['observed']}). So the label is right and the binding is not.",
            f"The cause is in the pinned engine's action table: frame-selection carries "
            f"kbd {A['frame-selection']!r} while group carries {A['group']!r} and ungroup "
            f"{A['ungroup']!r} — the ctrl alternative is simply missing.",
        ],
        "scores": {
            "fr1": score(5, "A keystroke that runs the stock action is the least ceremony possible, and the same keystroke is the documented inverse."),
            "fr2": score(4, "Ctrl+G / Ctrl+Shift+G is deep muscle memory, but Ctrl+Alt+B and Ctrl+Alt+R are invented members of the family.", "medium"),
            "fr3": score(1, "Nothing appears anywhere. Worse than invisible today, because the one label that does exist prints a binding that was measured not to fire."),
            "fr4": score(5, f"TLUiOverrides is already how this tree reshapes the toolbar; re-registering an action id is the same seam."),
            "fr5": score(5, "It is the stock command, re-registered with a working binding — one code path, not two."),
        },
        "gateResults": {
            "g1": gate(True, "A keystroke carries no inference."),
            "g2": gate(True, "Action overrides are a documented tldraw seam already used in toolbarIntegration.ts."),
            "g3": gate(True, f"Measured: the second press of the same chord took the frame back off ({P['shortcuts']['inverse']['observed']})."),
            "g4": gate(True, "No gesture; keystrokes only."),
            "g5": gate(True, "canApplySelectionAction gates the stock action on the live selection."),
        },
        "previewLabel": "press the family key",
        "story": {
            "title": "Finish a family the user already half-owns",
            "steps": [
                {"label": "Three keys, one dead", "caption": "Ctrl+G and Ctrl+Shift+G fire. Ctrl+Alt+G is printed in the menu and does nothing on this platform — measured, twice.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Press it and mean it", "caption": "With the binding repaired the selection becomes a container, and the identical keystroke takes it back off again — measured, both directions.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "The shortcut table, driven",
                "caption": "Each row is an observed document change in the running product, not a reading of the source. The third row is the defect: the menu prints this binding beside the command.",
                "html": (
                    "<table style='width:100%;border-collapse:collapse;font:12px/1.5 ui-monospace,monospace'>"
                    "<tr style='text-align:left;color:#7b7f88'><th style='padding:6px 8px'>Keystroke</th>"
                    "<th style='padding:6px 8px'>Observed</th><th style='padding:6px 8px'>Fires</th></tr>"
                    + "".join(
                        "<tr style='border-top:1px solid #e2e4ea'>"
                        f"<td style='padding:6px 8px'><b>{row['label']}</b></td>"
                        f"<td style='padding:6px 8px;color:#5b6069'>{row['observed']}</td>"
                        f"<td style='padding:6px 8px;font-weight:700;color:{'#2f9e6b' if row['fires'] else '#c0392b'}'>"
                        f"{'yes' if row['fires'] else 'no'}</td></tr>"
                        for name, row in P["shortcuts"].items()
                        if isinstance(row, dict)
                    )
                    + "</table>"
                ),
            },
            {
                "label": "Why, from the pinned engine",
                "caption": "Read at build time out of node_modules/tldraw/dist-cjs/lib/ui/context/actions.js. Two of these register a ctrl alternative; one does not, and the label formatter prints Ctrl anyway.",
                "html": (
                    "<div style='font:12px/1.8 ui-monospace,monospace'>"
                    + "".join(
                        f"<div><span style='color:#7b7f88'>{key}</span> → "
                        f"<b style='color:{'#c0392b' if value and 'ctrl' not in value else '#1d1d1d'}'>"
                        f"{value or '(no shortcut)'}</b></div>"
                        for key, value in A.items()
                    )
                    + "</div>"
                ),
            },
        ],
        "preview": hero("v4", V4_BASE, V4_ALT, "Press the family key", "Press it again"),
    },
    {
        "id": "v5",
        "name": "Draw It Over Them",
        "thesis": (
            "Do not put a command on the selection at all: pick the container on the tool belt where "
            "it already lives, drag a box around the objects, and the box adopts what it encloses."
        ),
        "accent": "#c0392b",
        "bestWhen": (
            "The user is composing rather than reorganising — the boundary is the thing they want to "
            "place, and the contents follow from where they drew it."
        ),
        "losesWhen": (
            "They have already made the selection. Every marquee, shift-click and lasso is thrown "
            "away, and an awkward or non-rectangular selection cannot be re-enclosed at all."
        ),
        "decisions": [
            {"label": "Surface", "value": "The existing tool belt — Frame tile, and the Block/Branch family flyout."},
            {"label": "Type choice", "value": "Made before the gesture, by which tool is armed."},
            {"label": "Adoption", "value": "Enclosed shapes become children, which the stock frame tool already does."},
            {"label": "Inverse", "value": "Remove frame on the drawn container."},
        ],
        "keepParts": [
            "the tool belt staying the way an empty container is created",
            "adoption-by-enclosure for the frame tool",
            "no picker anywhere in the flow",
        ],
        "proof": [
            "The container tools are already on the belt: the toolbar exposes a Frame tile plus a "
            "system family of block, branch and pill.",
            "tldraw's frame tool already adopts the shapes it is drawn over, so the frame case needs "
            "no product code at all.",
            "It cannot answer the brief as asked: the probe's four-object selection is discarded, and "
            "the user must draw a rectangle that happens to enclose exactly those four.",
        ],
        "scores": {
            "fr1": score(4, "Mechanical, but 'enclosed' is an implicit rule the user has to learn, and a near-miss silently leaves an object out.", "medium"),
            "fr2": score(5, "Drawing a frame over shapes is stock tldraw, and drawing a FigJam section over objects behaves the same way."),
            "fr3": score(3, "The tool belt is permanently visible, but nothing about a live selection suggests this is the way to hold it together."),
            "fr4": score(3, "Free for frames; extending adoption to Block and Branch changes the create behaviour of two registered tools.", "medium"),
            "fr5": score(3, "It is a parallel route to the same outcome that neither uses nor replaces the stock selection action.", "medium"),
        },
        "gateResults": {
            "g1": gate(True, "Membership comes from geometry the user drew, not from anything read off the contents."),
            "g2": gate(True, "The frame case is entirely stock; the others are shape-util create seams."),
            "g3": gate(True, "Remove frame works on the drawn container, as on any frame-like shape."),
            "g4": gate(True, "Drag-to-create is the most stock gesture there is."),
            "g5": gate(False, "It discards the selection entirely. The user's marquee, shift-clicks and lasso are thrown away and the boundary must be re-drawn by hand, which a non-rectangular selection cannot express at all."),
        },
        "previewLabel": "drag a container around them",
        "story": {
            "title": "The box you drag is the command",
            "steps": [
                {"label": "Arm a container tool", "caption": "The Frame tile and the Block/Branch flyout are already on the belt; the armed tool is the type choice.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Drag it over them", "caption": "Whatever the box encloses becomes a child. Nothing consulted the selection — which is exactly why this fails the brief's own constraint.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "The belt these tools already sit on",
                "caption": "Captured from the running product: cursor, frame, system family, shape, draw, text. Two of the four container types are one click away here already — which is the reason to keep this route for creating empty containers, not for converting a selection.",
                "html": figure(PLATE_TOOLBELT, "The product tool belt"),
            },
            {
                "label": "What the gate refusal costs",
                "caption": "The same four objects, wrapped. Reaching this by drawing means the rectangle has to enclose exactly these and nothing else — trivial here, and impossible for the interleaved selections the command is actually for.",
                "html": figure(PLATE_WRAPPED, "The four objects wrapped into a frame in the running product"),
            },
        ],
        "preview": hero(
            "v5",
            V5_BASE(),
            wrapped_board(
                "frame",
                band=tool_belt("v5", 5)
                + band_label("the four objects are children of the box, not of a command", "#c0392b"),
            ),
            "Drag the box",
            "Start over",
            base_selected=False,
        ),
    },
]


project = {
    "schemaVersion": 3,
    "title": "Five ways to turn a selection into a container",
    "kicker": "SystemSketch · interaction exploration · Sep 3, 2026",
    "brief": (
        "Several objects are selected; one move should hold them together as a container. The same "
        "fixture is used throughout — read_frame(), detect(), annotate() and publish(), wired and "
        "multi-selected. Ground truth first, all of it driven in the running product: the containers "
        f"that exist are {CONTAINERS}, plus stock groups. FigJam's “Wrap in new section” is not in "
        f"tldraw {M['tldraw']} and not in this repository "
        f"({M['sections']['engineWrapInNewSection']} hits in the engine, "
        f"{M['sections']['srcWrapInNewSection']} in src/) — but the engine's own equivalent already "
        "ships as “Frame selection”, two levels down inside the stock Edit submenu, and it is its own "
        "inverse. Its advertised Ctrl+Alt+G was measured not to fire on this platform. Two directions "
        "were gated out during generation and are not shown: one that picked the container type by "
        "inspecting what was selected, and one that synthesised boundary ports from the cables "
        "crossing the new edge — both derive structure at conversion time, which this board does not do."
    ),
    "count": 5,
    "defaultId": "v2",
    "defaultWhy": (
        "Wrap Tile is the provisional choice at 92.6/100. It is the only direction that is present at "
        "the moment of intent — the control arrives with the selection rather than waiting behind a "
        "right-click or a keystroke — and it is a direct copy of the FigJam control this repository "
        "has already measured against the live FigJam editor, placed on a selection menu that already "
        f"exists and already carries one-shot commands ({S['selectionActionLines']} lines, "
        f"{S['selectionActionButtons']} buttons). Its broad face can call the stock frame-selection "
        "action, so the frame case stays on one code path, and the same tile flipping to Unwrap keeps "
        "the way back on the control the user just pressed."
    ),
    "decisionHinge": (
        "Wrap Tile leads Turn Into ▸ by 3.2 points, a hair outside co-leader range — treat it as a "
        "soft lead. The hinge is the weight on being findable at the moment of intent: move six points "
        "from that criterion into stock-seam cost and Turn Into ▸ wins 91.8 to 91.4, because a "
        f"TldrawUiMenuSubmenu is a seam the same file already uses {S['contextMenuSubmenus']} times "
        "while a split control with a popover is new product code. The contested assumption is that "
        "the remembered last-used container will usually be right; if it is wrong often, the broad "
        "face becomes a trap and the menu direction is safer. Two findings apply whichever wins: the "
        "dead Ctrl+Alt+G binding should be repaired, and the duplicate pair of remove-frame commands "
        "in one context menu should collapse to one rather than gain a third."
    ),
    "invariants": [
        "Converting is create-container + reparent. Nothing is inferred, validated, or linted at conversion time.",
        "Cables crossing the new boundary are left crossing it; no boundary ports are synthesised. The renderer already permits this — an Expanded Block declines to clip a connection child.",
        f"Only tldraw {M['tldraw']} through supported seams: menus, action overrides, registered shape utils. No engine fork.",
        "Whatever wraps must un-wrap from the container itself.",
        "The command reads the selection the user already made.",
        f"The container vocabulary is fixed: {CONTAINERS}, plus a stock group.",
    ],
    "boundary": (
        "Exploration only — nothing under src/ was changed, and no direction is implemented. The "
        "ground truth is real: the container inventory, the menu contents, the wrap, the un-wrap and "
        "the shortcut table were all driven in the running product over CDP and are recorded in "
        "docs/assets/turn-into-ground-truth-2026-09-03.json, with the screenshots on this page taken "
        "from that same run. The five command surfaces themselves are drawn mocks over that fixture; "
        "no variant has been built, and the cost estimates are readings of the existing source rather "
        "than measured implementations."
    ),
    "axes": [
        {"name": "Command surface", "values": ["context submenu", "selection toolbar tile", "one unconditional move", "keystroke family", "tool belt + drag"]},
        {"name": "When the type is chosen", "values": ["before, from a list", "before, from a remembered default", "after, off the object", "before, by which key", "before, by which tool"]},
        {"name": "Relationship to the stock command", "values": ["routes the frame case to it", "routes the default face to it", "is it, unmodified", "re-registers it", "ignores it"]},
        {"name": "What the inverse is", "values": ["a neighbouring menu group", "the same tile", "stock Remove frame", "the same keystroke", "stock Remove frame"]},
    ],
    "requirements": requirements,
    "hardGates": gates,
    "variants": variants,
    "checks": [
        "Five structurally distinct command surfaces, not five skins of one menu",
        "The same four-object selection and the same fixture in every hero",
        "Ground truth driven in the running product before any direction was drawn",
        "Five frozen weighted criteria summing to 100, every cell carrying evidence and confidence",
        "Five hard gates evaluated separately; one direction visibly fails the brief's own constraint",
        "Every hero has a direct state toggle and a two-step walkthrough over those same states",
        "Real captures of the current surfaces embedded beside every claim about them",
        "Nothing under src/ changed by this exploration",
    ],
}


def main() -> None:
    SPEC.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # The gallery script refuses to clobber; a report builder must be re-runnable.
    OUTPUT.unlink(missing_ok=True)
    subprocess.run(
        [sys.executable, str(GALLERY), "build", "--spec", str(SPEC), "--output", str(OUTPUT), "--strict"],
        check=True,
    )
    subprocess.run(
        [sys.executable, str(GALLERY), "check", "--input", str(OUTPUT), "--strict"],
        check=True,
    )
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
