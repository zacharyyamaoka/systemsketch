#!/usr/bin/env python3
"""Build `docs/branch-authoring-babble-2026-09-02.html`: five ways to create and edit a Branch.

Zach's baseline is inspector-driven (a Branch section with two lists: control
ports on the band, named arms).  The other four are orthogonal on the
authoring-surface axis: on-canvas only, gesture-first, code-first, and
tool + selection pill.  All five author the same fixture (the 09_branch) into
the same settled model, and every board is rendered by the branch prototype's
own engine so the result of authoring looks exactly like the thing being
authored.  The panels are mocks in the real inspector's idiom; they are not
the app.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "branch-authoring-babble-2026-09-02.html"
ACCEPTANCE = DOCS / "assets" / "branch-authoring-acceptance.json"
sys.path.insert(0, str(DOCS))

from branch_board_svg import ANY, NUMBER  # noqa: E402
from branch_case_view import ArmSpec, BlockSpec, CableSpec, RegionSpec, Renderer, Scene  # noqa: E402

TODAY = date(2026, 9, 2).isoformat()
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()

# --------------------------------------------------------------------------
# Measured: what the real inspector and pill are made of
# --------------------------------------------------------------------------

INSPECTOR_TSX = (REPO / "src" / "blocks" / "ui" / "BlockInspector.tsx").read_text(encoding="utf-8")
INSPECTOR_CSS = (REPO / "src" / "blocks" / "ui" / "block-inspector.css").read_text(encoding="utf-8")
PILL_TSX = (REPO / "src" / "blocks" / "ui" / "BlockSelectionMiniMenu.tsx").read_text(encoding="utf-8")
MENU_TSX = (REPO / "src" / "blocks" / "ui" / "BlockContextMenu.tsx").read_text(encoding="utf-8")
INSPECTOR_SECTIONS = INSPECTOR_TSX.count('className="block-inspector__section"')
INSPECTOR_WIDTH = "280px" if "width: min(280px, 100vw)" in INSPECTOR_CSS else "?"
PILL_BUTTONS = PILL_TSX.count("<button")
MENU_PORT_ITEMS = sum(MENU_TSX.count(f'label="{label}"') for label in ("Add port above", "Add port below", "Move up", "Move down", "Delete port"))
CLICK_TO_EDIT = (REPO / "src" / "blocks" / "blockClickToEdit.ts").exists()

# --------------------------------------------------------------------------
# Boards — one model, rendered by the branch prototype's engine
# --------------------------------------------------------------------------

ESTIMATE = lambda x, y: BlockSpec("estimate", x, y, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])  # noqa: E731
FALLBACK = lambda x, y: BlockSpec("fallback", x, y, 230, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])  # noqa: E731
DECODE = BlockSpec("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])
ENCODE = BlockSpec("encode", 1030, 290, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}])


def arm(key: str, label: str, h: float, blocks: list, muted: bool = False) -> ArmSpec:
    return ArmSpec(key, label, h, muted=muted, blocks=blocks)


def cables(names: list, arm_of: dict) -> list:
    """Cable specs by short name; `arm_of` maps a block key to its arm key (or None)."""
    def arms_for(block: str) -> tuple:
        a = arm_of.get(block)
        return (a,) if a else ()
    catalogue = {
        "raw": CableSpec("in:raws", "blk:decode.raw"),
        "d_est": CableSpec("blk:decode.Frame", "blk:estimate.frame", mid=410, arms=arms_for("estimate")),
        "d_fb": CableSpec("blk:decode.Frame", "blk:fallback.frame", mid=410, arms=arms_for("fallback")),
        "g_est": CableSpec("in:gain", "blk:estimate.gain", mid=380, arms=arms_for("estimate")),
        "fast": CableSpec("in:fast", "hdr:br/fast", kind="control", mid=400),
        "gain_hdr": CableSpec("in:gain", "hdr:br/gain", kind="control", mid=372),
        "est_enc": CableSpec("blk:estimate.Pose", "blk:encode.pose", mid=960, arms=arms_for("estimate")),
        "fb_enc": CableSpec("blk:fallback.Pose", "blk:encode.pose", mid=960, arms=arms_for("fallback")),
        "enc_out": CableSpec("blk:encode.bytes", "out:bytes", mid=1300),
    }
    return [catalogue[n] for n in names]


def board(key: str, *, arms: list | None, headers: list, cable_names: list, open_arms: set | None = None, active: str | None = None, view: str = "expanded") -> str:
    """Render one model state.  `arms=None` means no region yet: the blocks sit free on the canvas."""
    arm_of: dict = {}
    if arms is None:
        blocks = [DECODE, ESTIMATE(560, 205), FALLBACK(560, 385), ENCODE]
        regions = []
    else:
        blocks = [DECODE, ENCODE]
        for a in arms:
            for b in a.blocks:
                arm_of[b.key] = a.key
        regions = [RegionSpec("br", 440, 130, 460, headers=headers, arms=arms)]
    scene = Scene(
        key=key, w=1380, h=600, frame=(20, 20, 1340, 560),
        inputs=[("raws", 175, "bytes", ANY), ("gain", 310, "float", NUMBER), ("fast", 450, "bool", ANY)],
        outputs=[("bytes", 341, "bytes", ())],
        blocks=blocks, regions=regions, cables=cables(cable_names, arm_of),
    )
    open_map = {"br": set(a.key for a in arms) if open_arms is None else set(open_arms)} if arms else {}
    return Renderer(scene, open_map, active, key, view=view).draw()


ONE_ARM = lambda label, muted=False: [arm("a1", label, 330, [ESTIMATE(120, 20), FALLBACK(120, 200)], muted)]  # noqa: E731
TWO_ARMS = lambda l1, l2: [arm("a1", l1, 144, [ESTIMATE(120, 20)]), arm("a2", l2, 166, [FALLBACK(120, 30)])]  # noqa: E731
THREE_ARMS = lambda l1, l2, l3: [arm("a1", l1, 144, [ESTIMATE(120, 20)]), arm("a2", l2, 56, []), arm("a3", l3, 166, [FALLBACK(120, 30)])]  # noqa: E731

BASE = ["raw"]
WIRED_IN = ["raw", "d_est", "d_fb", "g_est"]
FULL = ["raw", "d_est", "d_fb", "g_est", "fast", "est_enc", "fb_enc", "enc_out"]

BOARDS = {
    "b0": board("b0", arms=None, headers=[], cable_names=BASE),
    "b0g": board("b0g", arms=None, headers=[], cable_names=WIRED_IN),
    "b1": board("b1", arms=ONE_ARM("arm"), headers=[], cable_names=BASE),
    "b1g": board("b1g", arms=ONE_ARM("arm"), headers=[], cable_names=WIRED_IN),
    "b2": board("b2", arms=ONE_ARM("arm"), headers=["fast"], cable_names=BASE),
    "b2g": board("b2g", arms=ONE_ARM("arm"), headers=["fast"], cable_names=WIRED_IN + ["fast"]),
    "b3": board("b3", arms=TWO_ARMS("arm", "arm 2"), headers=["fast"], cable_names=BASE),
    "b3g": board("b3g", arms=TWO_ARMS("arm", "arm 2"), headers=["fast"], cable_names=WIRED_IN + ["fast"]),
    "b3a": board("b3a", arms=TWO_ARMS("if fast:", "arm 2"), headers=["fast"], cable_names=BASE),
    "b3ag": board("b3ag", arms=TWO_ARMS("if fast:", "arm 2"), headers=["fast"], cable_names=WIRED_IN + ["fast"]),
    "b4": board("b4", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=BASE),
    "b4g": board("b4g", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=WIRED_IN + ["fast"]),
    "b4case": board("b4case", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=BASE, open_arms={"a1"}, view="case"),
    "b5": board("b5", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=FULL),
    "b6": board("b6", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=FULL, open_arms={"a1"}),
    "b8": board("b8", arms=TWO_ARMS("if fast:", "else:"), headers=["fast"], cable_names=FULL, open_arms={"a1"}, active="a1"),
    "c1": board("c1", arms=ONE_ARM("if …:", muted=True), headers=[], cable_names=BASE),
    "c2": board("c2", arms=ONE_ARM("if fast:"), headers=["fast"], cable_names=BASE),
    "c3b": board("c3b", arms=TWO_ARMS("if fast:", "elif gain > 1:"), headers=["fast", "gain"], cable_names=BASE),
    "c4": board("c4", arms=THREE_ARMS("if fast:", "elif gain > 1:", "else:"), headers=["fast", "gain"], cable_names=BASE),
    "c5": board("c5", arms=THREE_ARMS("if fast:", "elif gain > 1:", "else:"), headers=["fast", "gain"], cable_names=FULL + ["gain_hdr"]),
    "t1": board("t1", arms=ONE_ARM("if:"), headers=[], cable_names=BASE),
    "t2": board("t2", arms=ONE_ARM("if:"), headers=["fast"], cable_names=BASE),
    "t3": board("t3", arms=TWO_ARMS("if:", "else:"), headers=["fast"], cable_names=BASE),
}

# --------------------------------------------------------------------------
# Panel mocks, in the real inspector's idiom
# --------------------------------------------------------------------------


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def section(title: str, body: str, *, chip: str = "", plus_act: str = "", hint: str = "") -> str:
    tools = ""
    if chip:
        tools += f'<span class="mi-chip">{esc(chip)}</span>'
    if plus_act:
        tools += f'<button type="button" class="mi-plus" data-act="{plus_act}" title="Add">+</button>'
    hint_html = f'<p class="mi-hint">{hint}</p>' if hint else ""
    return f'<section class="mi-section"><div class="mi-title"><span>{esc(title)}</span><span class="mi-tools">{tools}</span></div>{body}{hint_html}</section>'


def port_row(name: str, typ: str, *, wired: bool | None = None, act: str = "", placeholder: str = "", derived: str = "") -> str:
    if act:
        name_html = f'<input class="mi-in" data-act="{act}" placeholder="{esc(placeholder)}" value="{esc(name)}" aria-label="control port name">'
    else:
        name_html = f'<input class="mi-in" value="{esc(name)}" readonly>'
    status = ""
    if wired is True:
        status = '<span class="mi-dot mi-dot--on" title="wired"></span>'
    elif wired is False:
        status = '<span class="mi-dot" title="not wired yet"></span>'
    if derived:
        return f'<div class="mi-row mi-row--derived">{name_html}<span class="mi-derived">{esc(derived)}</span>{status}</div>'
    return f'<div class="mi-row">{name_html}<input class="mi-in mi-in--type" value="{esc(typ)}" placeholder="type" readonly>{status}<button class="mi-x" type="button" title="Delete">×</button></div>'


def arm_row(label: str, *, act: str = "", placeholder: str = "", open_: bool = True, active: bool = False, fold_act: str = "", active_act: str = "", index: int = 1) -> str:
    if act:
        name_html = f'<input class="mi-in" data-act="{act}" placeholder="{esc(placeholder)}" value="{esc(label)}" aria-label="arm name">'
    else:
        name_html = f'<input class="mi-in" value="{esc(label)}" readonly>'
    fold = f'<button class="mi-ib{" mi-ib--on" if not open_ else ""}" type="button" data-act="{fold_act}" title="{"open" if not open_ else "fold"}">{"›" if not open_ else "⌄"}</button>' if fold_act else f'<button class="mi-ib" type="button" title="fold">{"›" if not open_ else "⌄"}</button>'
    target = f'<button class="mi-ib mi-target{" mi-target--on" if active else ""}" type="button" data-act="{active_act}" title="make active">◎</button>' if active_act else f'<button class="mi-ib mi-target{" mi-target--on" if active else ""}" type="button" title="make active">◎</button>'
    return f'<div class="mi-arm"><span class="mi-grip" title="drag to reorder">⋮⋮</span>{name_html}{fold}{target}<button class="mi-x" type="button" title="Delete">×</button></div>'


def inspector(*sections: str, title: str = "Branch", empty: bool = False) -> str:
    head = f'<div class="mi-head"><span>{esc(title)}</span><span class="mi-tabs"><b>Details</b><span>Notes</span></span></div>'
    if empty:
        return f'<div class="mi">{head}<div class="mi-empty">Nothing selected.<br><span>Select a Block or a Branch to edit it here.</span></div></div>'
    return f'<div class="mi">{head}{"".join(sections)}</div>'


def view_section(view: str = "expanded") -> str:
    return section("View", f'<div class="mi-seg"><button type="button">Simple</button><button type="button">Port</button><button type="button" class="{"on" if view == "expanded" else ""}">Expanded</button><button type="button" class="{"on" if view == "case" else ""}">Case</button></div>', hint="Branch has no Simple or Port view; Case is Expanded with one arm open.")


def v1_panel(ports: list, arms: list, *, port_act: str = "", port_placeholder: str = "", arm_acts: dict | None = None, fold_act: str = "", active_act: str = "", plus_port: str = "v1-add-port", plus_arm: str = "v1-add-arm") -> str:
    arm_acts = arm_acts or {}
    port_rows = "".join(port_row(n, t, wired=w, act=(port_act if i == len(ports) - 1 and port_act else ""), placeholder=port_placeholder) for i, (n, t, w) in enumerate(ports)) or '<p class="mi-none">No control ports yet.</p>'
    arm_rows = "".join(arm_row(label, act=arm_acts.get(i, ""), placeholder=("if …:" if i == 0 else "else:"), open_=open_, active=active, fold_act=(fold_act if i == 1 else ""), active_act=(active_act if i == 0 else ""), index=i + 1) for i, (label, open_, active) in enumerate(arms))
    return inspector(
        section("Block", '<div class="mi-field"><label>Title</label><input class="mi-in" value="Branch" readonly></div><div class="mi-field"><label>Type</label><input class="mi-in mi-in--type" value="branch" readonly></div>'),
        view_section(),
        section("Control ports", f'<div class="mi-ports">{port_rows}</div>', chip=f"{len(ports)} on band", plus_act=plus_port, hint="A control port is a value the branch decides on. It lands on the band, never on an arm."),
        section("Arms", f'<div class="mi-arms">{arm_rows}</div>', chip=f"{len(arms)}", plus_act=plus_arm, hint="One row per case, in source order. ⌄ folds, ◎ makes active; drag ⋮⋮ to reorder."),
    )


def v4_panel(lines: list, derived: list, *, line_act: str = "", line_placeholder: str = "", wired: set | None = None) -> str:
    wired = wired or set()
    rows = ""
    for i, line in enumerate(lines):
        if line_act and i == len(lines) - 1:
            rows += f'<div class="mi-code-row"><span class="mi-ln">{i + 1}</span><input class="mi-in mi-in--code" data-act="{line_act}" placeholder="{esc(line_placeholder)}" value="{esc(line)}" aria-label="arm code"></div>'
        else:
            rows += f'<div class="mi-code-row"><span class="mi-ln">{i + 1}</span><input class="mi-in mi-in--code" value="{esc(line)}" readonly></div>'
    if not lines:
        rows = f'<div class="mi-code-row"><span class="mi-ln">1</span><input class="mi-in mi-in--code" data-act="{line_act}" placeholder="{esc(line_placeholder)}" aria-label="arm code"></div>'
    derived_rows = "".join(port_row(name, "", wired=(name in wired), derived=f"read by {who}") for name, who in derived) or '<p class="mi-none">Nothing derived yet — type a condition.</p>'
    return inspector(
        section("Block", '<div class="mi-field"><label>Title</label><input class="mi-in" value="Branch" readonly></div><div class="mi-field"><label>Type</label><input class="mi-in mi-in--type" value="branch" readonly></div>'),
        view_section(),
        section("Arms · code", f'<div class="mi-code">{rows}</div>', chip=f"{len(lines)}", hint="One line per arm, as you would write it. <code>if</code>, <code>elif</code>, <code>else</code>; ⏎ adds the next line."),
        section("Control ports · derived", f'<div class="mi-ports">{derived_rows}</div>', chip=f"{len(derived)} on band", hint="Every name a condition reads becomes a dot on the band. Nothing to add by hand; a port with no arm reading it cannot exist."),
    )


def note_panel(title: str, body: str) -> str:
    return f'<div class="mi mi--note"><div class="mi-head"><span>{esc(title)}</span></div><div class="mi-notebody">{body}</div></div>'


def stock_inspector_note() -> str:
    return note_panel("Inspector", "<p><b>Unchanged.</b> This variant adds nothing to the right panel; the Branch is edited on the canvas.</p><p class='small'>The stock Block sections (Block, Tags, View, Inputs, Outputs, Ports) stay as they are today.</p>")


# --------------------------------------------------------------------------
# Overlays on the canvas (positioned in board units, 1380 × 600)
# --------------------------------------------------------------------------


def ov(step: str, x: float, y: float, inner: str, *, w: float | None = None, cls: str = "") -> str:
    style = f"left:{x / 1380 * 100:.3f}%;top:{y / 600 * 100:.3f}%;" + (f"width:{w / 1380 * 100:.3f}%;" if w else "")
    return f'<div class="ov {cls}" data-step="{step}" style="{style}" hidden>{inner}</div>'


def context_menu(act: str) -> str:
    return (
        '<div class="cm"><div class="cm-row">Add port above</div><div class="cm-row">Add port below</div><div class="cm-sep"></div>'
        '<div class="cm-row">Block view <span>›</span></div><div class="cm-row cm-row--open">Add <span>›</span></div>'
        f'<div class="cm-sub"><div class="cm-row">Input port</div><div class="cm-row">Output port</div><div class="cm-sep"></div><div class="cm-row cm-row--new" data-act="{act}">Branch region</div></div></div>'
    )


def pill(items: list) -> str:
    parts = []
    for item in items:
        if item == "|":
            parts.append('<span class="pill-sep"></span>')
        else:
            label, act, on = item
            parts.append(f'<button type="button"{f" data-act={chr(34)}{act}{chr(34)}" if act else ""} class="{"on" if on else ""}">{label}</button>')
    return f'<div class="pill">{"".join(parts)}</div>'


def toolbar(act: str) -> str:
    tools = ["↖", "✋", "✎", "◇", "↗", "T", "▢", "⌗"]
    buttons = "".join(f'<button type="button">{t}</button>' for t in tools)
    return f'<div class="tb">{buttons}<button type="button" class="tb-new" data-act="{act}" title="Branch tool">⑂</button><span class="tb-label">Branch</span></div>'


def inline_input(act: str, placeholder: str) -> str:
    return f'<input class="inl" data-act="{act}" placeholder="{esc(placeholder)}" aria-label="{esc(placeholder)}">'


def hotspot(act: str, label: str, *, cls: str = "") -> str:
    return f'<button type="button" class="hot {cls}" data-act="{act}"><span class="hot-dot"></span><span class="hot-label">{label}</span></button>'


# --------------------------------------------------------------------------
# Variants
# --------------------------------------------------------------------------

V1_ARMS_0 = [("arm", True, False)]
V1_ARMS_2 = [("arm", True, False), ("arm 2", True, False)]

VARIANTS = [
    {
        "id": "v1", "name": "Inspector lists", "kicker": "your baseline",
        "thesis": "A Branch section in the right inspector, in the same idiom as INPUTS and OUTPUTS: a Control ports list (+, name, type; each appears as a dot on the band) and an Arms list (+, editable name, ⋮⋮ reorder, ⌄ fold, ◎ make active). Creation is the existing right-click Add menu.",
        "gestures": 5, "gesture_note": "Add › Branch (2) · + control port (1) · name it (1) · name the arm (1)",
        "start": {"board": "b0", "panel": "v1-p0"},
        "done": "Done: the region, one control port on the band, two named arms, wired, else folded, if active. Everything came from two lists that look like the ones already there.",
        "strip": ["create", "+ port", "name", "+ arm", "name", "name", "wire", "fold", "active"],
        "steps": [
            {"id": "v1-s1", "act": "v1-menu-branch", "kind": "click", "hint": "Right-click the canvas → Add → Branch region. The menu is the existing one with one new row.", "board": "b1", "panel": "v1-p1"},
            {"id": "v1-s2", "act": "v1-add-port", "kind": "click", "hint": "Control ports → +. A row appears with its name field focused.", "board": "b1", "panel": "v1-p2"},
            {"id": "v1-s3", "act": "v1-port-name", "kind": "type", "expect": "fast", "hint": "Type fast and press ⏎. A dot appears on the band; it is not wired yet.", "board": "b2", "panel": "v1-p3"},
            {"id": "v1-s4", "act": "v1-add-arm", "kind": "click", "hint": "Arms → +. The region grows a second arm; the blocks fall into the arms by position.", "board": "b3", "panel": "v1-p4"},
            {"id": "v1-s5", "act": "v1-arm1-name", "kind": "type", "expect": "if fast:", "hint": "Name arm 1: if fast: ⏎", "board": "b3a", "panel": "v1-p5"},
            {"id": "v1-s6", "act": "v1-arm2-name", "kind": "type", "expect": "else:", "hint": "Name arm 2: else: ⏎", "board": "b4", "panel": "v1-p6"},
            {"id": "v1-s7", "act": "v1-wire", "kind": "click", "hint": "Wire as always: drag from decode.Frame onto estimate.frame, and so on. One click here stands in for the six cable drags; the gesture is unchanged.", "board": "b5", "panel": "v1-p7"},
            {"id": "v1-s8", "act": "v1-fold-a2", "kind": "click", "hint": "Fold else from its row (⌄). The same fold as on the canvas header.", "board": "b6", "panel": "v1-p8"},
            {"id": "v1-s9", "act": "v1-active-a1", "kind": "click", "hint": "Make if active from its row (◎). The other arm fades.", "board": "b8", "panel": "v1-p9"},
        ],
        "panels": {
            "v1-p0": inspector(empty=True),
            "v1-p1": v1_panel([], V1_ARMS_0),
            "v1-p2": v1_panel([("", "bool", None)], V1_ARMS_0, port_act="v1-port-name", port_placeholder="fast"),
            "v1-p3": v1_panel([("fast", "bool", False)], V1_ARMS_0),
            "v1-p4": v1_panel([("fast", "bool", False)], V1_ARMS_2, arm_acts={0: "v1-arm1-name"}),
            "v1-p5": v1_panel([("fast", "bool", False)], [("if fast:", True, False), ("arm 2", True, False)], arm_acts={1: "v1-arm2-name"}),
            "v1-p6": v1_panel([("fast", "bool", False)], [("if fast:", True, False), ("else:", True, False)]),
            "v1-p7": v1_panel([("fast", "bool", True)], [("if fast:", True, False), ("else:", True, False)], fold_act="v1-fold-a2"),
            "v1-p8": v1_panel([("fast", "bool", True)], [("if fast:", True, False), ("else:", False, False)], active_act="v1-active-a1"),
            "v1-p9": v1_panel([("fast", "bool", True)], [("if fast:", True, True), ("else:", False, False)]),
        },
        "overlays": [
            ov("v1-s1", 300, 250, context_menu("v1-menu-branch")),
            ov("v1-s7", 350, 171, hotspot("v1-wire", "drag decode.Frame → estimate.frame …")),
        ],
    },
    {
        "id": "v2", "name": "On-canvas only", "kicker": "no inspector",
        "thesis": "Every affordance lives on the region itself: a + at the band's left edge adds a control port, a + arm row at the bottom adds an arm, the label is click-to-edit like a Block title, the divider drags to reorder, and the chevron and target already exist. The right panel is untouched.",
        "gestures": 5, "gesture_note": "Add › Branch (2) · + on the band (1) · name (1) · click label, name (1)",
        "start": {"board": "b0", "panel": "v2-note"},
        "done": "Done, with the inspector never opened. Rename, fold and active are on the header; adding is a + in the place the thing will appear.",
        "strip": ["create", "+ port", "name", "+ arm", "name", "name", "wire", "fold", "active"],
        "steps": [
            {"id": "v2-s1", "act": "v2-menu-branch", "kind": "click", "hint": "Right-click the canvas → Add → Branch region.", "board": "b1", "panel": "v2-note"},
            {"id": "v2-s2", "act": "v2-plus-port", "kind": "click", "hint": "Click the + on the band's left edge: a new dot with its name field open.", "board": "b1", "panel": "v2-note"},
            {"id": "v2-s3", "act": "v2-port-name", "kind": "type", "expect": "fast", "hint": "Type fast ⏎ next to the dot.", "board": "b2", "panel": "v2-note"},
            {"id": "v2-s4", "act": "v2-plus-arm", "kind": "click", "hint": "Click the + arm row at the bottom of the region.", "board": "b3", "panel": "v2-note"},
            {"id": "v2-s5", "act": "v2-arm1-name", "kind": "type", "expect": "if fast:", "hint": "Click the label of arm 1 and type if fast: ⏎ — the Block title's click-to-edit, on an arm.", "board": "b3a", "panel": "v2-note"},
            {"id": "v2-s6", "act": "v2-arm2-name", "kind": "type", "expect": "else:", "hint": "Same on arm 2: else: ⏎", "board": "b4", "panel": "v2-note"},
            {"id": "v2-s7", "act": "v2-wire", "kind": "click", "hint": "Wire as always (one click stands in for the cable drags).", "board": "b5", "panel": "v2-note"},
            {"id": "v2-s8", "act": "hit:fold:a2", "kind": "click", "hint": "Click the else header to fold it.", "board": "b6", "panel": "v2-note"},
            {"id": "v2-s9", "act": "hit:active:a1", "kind": "click", "hint": "Click the target on the if header to make it active.", "board": "b8", "panel": "v2-note"},
        ],
        "panels": {"v2-note": stock_inspector_note()},
        "overlays": [
            ov("v2-s1", 300, 250, context_menu("v2-menu-branch")),
            ov("v2-s2", 428, 133, '<button type="button" class="plus-band" data-act="v2-plus-port" title="add control port">+</button>'),
            ov("v2-s3", 452, 134, inline_input("v2-port-name", "fast")),
            ov("v2-s4", 452, 496, '<button type="button" class="plus-arm" data-act="v2-plus-arm">+ arm</button>', w=440),
            ov("v2-s5", 466, 160, inline_input("v2-arm1-name", "if fast:")),
            ov("v2-s6", 466, 328, inline_input("v2-arm2-name", "else:")),
            ov("v2-s7", 350, 171, hotspot("v2-wire", "drag decode.Frame → estimate.frame …")),
        ],
    },
    {
        "id": "v3", "name": "Gesture-first", "kicker": "wrap, drop, split",
        "thesis": "No lists and no + buttons. Select blocks and choose Wrap in Branch from the selection pill: a region with one arm around them, wires kept. Drop a cable onto the band: a control port named after its source. Draw a divider through an arm: two arms. Names are click-to-edit.",
        "gestures": 3, "gesture_note": "select + Wrap (2) · drop the fast cable on the band (1); the first arm exists and the port is named by the wire",
        "start": {"board": "b0g", "panel": "v3-note"},
        "done": "Done. Three gestures made the region, its control port and its second arm; the port was never typed because the wire that decides the branch is the port.",
        "strip": ["wrap", "drop cable", "split", "name", "name", "wire"],
        "steps": [
            {"id": "v3-s1", "act": "v3-wrap", "kind": "click", "hint": "estimate and fallback are selected and already wired. The pill offers Wrap in Branch.", "board": "b1g", "panel": "v3-note"},
            {"id": "v3-s2", "act": "v3-drop", "kind": "click", "hint": "Drag the fast cable from the boundary and drop it on the band: the control port is created and named fast, after its source.", "board": "b2g", "panel": "v3-note"},
            {"id": "v3-s3", "act": "v3-split", "kind": "click", "hint": "Draw a horizontal divider through the arm between the two blocks: it becomes two arms.", "board": "b3g", "panel": "v3-note"},
            {"id": "v3-s4", "act": "v3-arm1-name", "kind": "type", "expect": "if fast:", "hint": "Click the label of arm 1: if fast: ⏎", "board": "b3ag", "panel": "v3-note"},
            {"id": "v3-s5", "act": "v3-arm2-name", "kind": "type", "expect": "else:", "hint": "Arm 2: else: ⏎", "board": "b4g", "panel": "v3-note"},
            {"id": "v3-s6", "act": "v3-wire", "kind": "click", "hint": "Wire the outputs to encode as always.", "board": "b5", "panel": "v3-note"},
        ],
        "panels": {"v3-note": note_panel("Inspector", "<p><b>Unchanged.</b> The three authoring moves are gestures on the canvas: a pill command, a cable drop, a divider stroke.</p><p class='small'>The only new pill item is <i>Wrap in Branch</i>; the cable drop is the same landing gesture ports use today, with the band as one more landing.</p>")},
        "overlays": [
            ov("v3-s1", 555, 190, '<div class="marquee"></div>' + pill([("2 Blocks", "", False), "|", ("S", "", False), ("P", "", False), ("E", "", True), "|", ("Wrap in Branch", "v3-wrap", False), ("Inspect", "", False)]), w=250),
            ov("v3-s2", 440, 145, hotspot("v3-drop", "drop the fast cable here", cls="hot--band")),
            ov("v3-s3", 452, 345, '<button type="button" class="split" data-act="v3-split"><span></span>draw a divider here</button>', w=436),
            ov("v3-s4", 466, 160, inline_input("v3-arm1-name", "if fast:")),
            ov("v3-s5", 466, 328, inline_input("v3-arm2-name", "else:")),
            ov("v3-s6", 790, 256, hotspot("v3-wire", "drag estimate.Pose → encode.pose …")),
        ],
    },
    {
        "id": "v4", "name": "Code-first", "kicker": "the label is the code",
        "thesis": "The arm labels are typed as code, one line per arm — if fast: / elif gain > 1: / else: — and the control ports are derived from the names those conditions read. There is no port list to maintain: a port exists exactly when an arm reads it, and the derivation is shown live.",
        "gestures": 3, "gesture_note": "Add › Branch (2) · type the first line (1); the port and the arm's name come from the line",
        "start": {"board": "b0", "panel": "v4-p0"},
        "done": "Done. Three lines of code became three arms and two control ports; nothing on the band was added by hand, and nothing on the band can be wrong.",
        "strip": ["create", "line 1", "line 2", "line 3", "wire"],
        "steps": [
            {"id": "v4-s1", "act": "v4-menu-branch", "kind": "click", "hint": "Right-click the canvas → Add → Branch region. The inspector opens on an empty first line.", "board": "c1", "panel": "v4-p1"},
            {"id": "v4-s2", "act": "v4-line1", "kind": "type", "expect": "if fast:", "hint": "Type if fast: ⏎. The arm takes that label, and fast appears on the band because the condition reads it.", "board": "c2", "panel": "v4-p2"},
            {"id": "v4-s3", "act": "v4-line2", "kind": "type", "expect": "elif gain > 1:", "hint": "Type elif gain > 1: ⏎ on line 2. A second arm, and gain joins the band: derived, not added.", "board": "c3b", "panel": "v4-p3"},
            {"id": "v4-s4", "act": "v4-line3", "kind": "type", "expect": "else:", "hint": "Type else: ⏎. A third arm; it reads nothing, so the band does not change.", "board": "c4", "panel": "v4-p4"},
            {"id": "v4-s5", "act": "v4-wire", "kind": "click", "hint": "Wire as always; the derived list shows which control ports are wired.", "board": "c5", "panel": "v4-p5"},
        ],
        "panels": {
            "v4-p0": inspector(empty=True),
            "v4-p1": v4_panel([], [], line_act="v4-line1", line_placeholder="if fast:"),
            "v4-p2": v4_panel(["if fast:", ""], [("fast", "arm 1")], line_act="v4-line2", line_placeholder="elif gain > 1:"),
            "v4-p3": v4_panel(["if fast:", "elif gain > 1:", ""], [("fast", "arm 1"), ("gain", "arm 2")], line_act="v4-line3", line_placeholder="else:"),
            "v4-p4": v4_panel(["if fast:", "elif gain > 1:", "else:"], [("fast", "arm 1"), ("gain", "arm 2")]),
            "v4-p5": v4_panel(["if fast:", "elif gain > 1:", "else:"], [("fast", "arm 1"), ("gain", "arm 2")], wired={"fast", "gain"}),
        },
        "overlays": [
            ov("v4-s1", 300, 250, context_menu("v4-menu-branch")),
            ov("v4-s5", 350, 171, hotspot("v4-wire", "drag decode.Frame → estimate.frame …")),
        ],
    },
    {
        "id": "v5", "name": "Tool + selection pill", "kicker": "draw it, then the pill",
        "thesis": "A Branch tool in the toolbar, beside the Block tool: drag on the canvas and a region appears with an if: arm. The selection pill for a Branch carries + port, + arm, the E/C view toggle and the active target. Names are click-to-edit on the canvas.",
        "gestures": 4, "gesture_note": "tool (1) · drag (1) · + port (1) · name (1); the first arm comes with the tool",
        "start": {"board": "b0", "panel": "v5-note"},
        "done": "Done. The tool made the region, the pill did the rest; the inspector was never needed, and the pill is the one SystemSketch already shows for a selection.",
        "strip": ["tool", "draw", "+ port", "name", "+ arm", "name", "Case", "Expanded", "wire"],
        "steps": [
            {"id": "v5-s1", "act": "v5-tool", "kind": "click", "hint": "Pick the Branch tool (⑂) in the toolbar.", "board": "b0", "panel": "v5-note"},
            {"id": "v5-s2", "act": "v5-draw", "kind": "click", "hint": "Drag on the canvas where the region should be. It comes with one arm, if:.", "board": "t1", "panel": "v5-note"},
            {"id": "v5-s3", "act": "v5-pill-port", "kind": "click", "hint": "The pill for a selected Branch: + port.", "board": "t1", "panel": "v5-note"},
            {"id": "v5-s4", "act": "v5-port-name", "kind": "type", "expect": "fast", "hint": "Name it on the band: fast ⏎", "board": "t2", "panel": "v5-note"},
            {"id": "v5-s5", "act": "v5-pill-arm", "kind": "click", "hint": "+ arm on the pill: the tool's second default is else:.", "board": "t3", "panel": "v5-note"},
            {"id": "v5-s6", "act": "v5-arm1-name", "kind": "type", "expect": "if fast:", "hint": "Click the if: label and complete it: if fast: ⏎", "board": "b4", "panel": "v5-note"},
            {"id": "v5-s7", "act": "v5-pill-case", "kind": "click", "hint": "C on the pill: Case view, one arm open.", "board": "b4case", "panel": "v5-note"},
            {"id": "v5-s8", "act": "v5-pill-exp", "kind": "click", "hint": "E: back to Expanded.", "board": "b4", "panel": "v5-note"},
            {"id": "v5-s9", "act": "v5-wire", "kind": "click", "hint": "Wire as always.", "board": "b5", "panel": "v5-note"},
        ],
        "panels": {"v5-note": note_panel("Inspector", "<p><b>Unchanged.</b> A tool creates, the selection pill edits.</p><p class='small'>The pill is the existing Block mini menu (S · P · E · Inspect) with a Branch variant: + port · + arm · E · C · ◎.</p>")},
        "overlays": [
            ov("v5-s1", 470, 548, toolbar("v5-tool"), w=440),
            ov("v5-s2", 440, 130, '<button type="button" class="draw" data-act="v5-draw"><span>drag here</span></button>', w=460),
            ov("v5-s3", 470, 92, pill([("Branch", "", False), "|", ("+ port", "v5-pill-port", False), ("+ arm", "", False), "|", ("E", "", True), ("C", "", False), "|", ("◎", "", False), ("Inspect", "", False)]), w=400),
            ov("v5-s4", 452, 134, inline_input("v5-port-name", "fast")),
            ov("v5-s5", 470, 92, pill([("Branch", "", False), "|", ("+ port", "", False), ("+ arm", "v5-pill-arm", False), "|", ("E", "", True), ("C", "", False), "|", ("◎", "", False), ("Inspect", "", False)]), w=400),
            ov("v5-s6", 466, 160, inline_input("v5-arm1-name", "if fast:")),
            ov("v5-s7", 470, 92, pill([("Branch", "", False), "|", ("+ port", "", False), ("+ arm", "", False), "|", ("E", "", True), ("C", "v5-pill-case", False), "|", ("◎", "", False), ("Inspect", "", False)]), w=400),
            ov("v5-s8", 470, 92, pill([("Branch", "", False), "|", ("+ port", "", False), ("+ arm", "", False), "|", ("E", "v5-pill-exp", False), ("C", "", True), "|", ("◎", "", False), ("Inspect", "", False)]), w=400),
            ov("v5-s9", 350, 171, hotspot("v5-wire", "drag decode.Frame → estimate.frame …")),
        ],
    },
]

# --------------------------------------------------------------------------
# Criteria and scores
# --------------------------------------------------------------------------

CRITERIA = [
    ("c1", "Zero relearning", 25, "Against the Block inspector and the port gestures that exist today: the same lists, the same +, the same click-to-edit, the same cable landing."),
    ("c2", "Every mark derivable", 20, "A control port must be a name a condition reads; an arm label must be the case. The variant either makes that automatic or validates it."),
    ("c3", "Fewest new UI elements", 15, "New sections, buttons, tools, gestures the user has to discover, counted."),
    ("c4", "Reachability", 15, "Gestures from nothing to a region with its first named arm and its first control port (counted per variant)."),
    ("c5", "Stock tldraw seams", 15, "Inspector panel, selection pill, context menu, tool, frame drop, cable binding. No engine fork."),
    ("c6", "Editing at scale", 10, "Rename, reorder, fold, activate across five arms without hunting."),
]

SCORES = {
    "v1": {"c1": 5, "c2": 3, "c3": 4, "c4": 3, "c5": 5, "c6": 4},
    "v2": {"c1": 4, "c2": 3, "c3": 3, "c4": 3, "c5": 4, "c6": 3},
    "v3": {"c1": 3, "c2": 4, "c3": 4, "c4": 5, "c5": 3, "c6": 2},
    "v4": {"c1": 4, "c2": 5, "c3": 5, "c4": 5, "c5": 4, "c6": 4},
    "v5": {"c1": 4, "c2": 3, "c3": 3, "c4": 4, "c5": 5, "c6": 3},
}
BEST = {
    "v1": "You already know it; five arms are a list you can scan; reorder and fold are one row away.",
    "v2": "Small branches sketched fast; the reader never leaves the canvas.",
    "v3": "Retrofitting a branch around blocks that already exist and are already wired.",
    "v4": "Whenever the label is code, which in pyblocks it always is; the band can never disagree with the arms.",
    "v5": "Creating from nothing, quickly, with the pill you already use for view switching.",
}
LOSES = {
    "v1": "A control port that no arm reads is one click away; the panel has to validate what the code would have derived.",
    "v2": "Six new on-canvas affordances to discover; reordering by divider drag has no precedent here.",
    "v3": "Three new gestures (wrap, band drop, divider stroke); rename still needs click-to-edit; no way to add an empty arm without a divider.",
    "v4": "A sketch that is not code yet (a control port with no condition written) has nowhere to go; needs a small parser in the app.",
    "v5": "Two new surfaces (a tool and a pill variant) for what the inspector could do; the pill has no room for names.",
}


def weighted(scores: dict) -> float:
    return round(sum(scores[c[0]] * c[2] for c in CRITERIA) / 5, 1)


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = r"""
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--faint:#98a2b3;--line:#e3e6ec;--strong:#cfd4dd;--card:#fff;--accent:#2f6fed;--soft:#eef4ff;--sunken:#f5f6f8;--ok:#1f8a4c;--warn:#d9480f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1500px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(34px,5vw,54px);line-height:1.02;letter-spacing:-.04em;margin:10px 0 14px;max-width:1000px}
h2{font-size:26px;letter-spacing:-.02em;margin:56px 0 10px}
h3{font-size:18px;margin:26px 0 8px}
p{max-width:900px}
.lede{font-size:18px;color:#39424f;max-width:940px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}
.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:24px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
.callout{border-left:4px solid var(--accent);background:var(--soft);padding:12px 16px;border-radius:0 12px 12px 0;max-width:940px;margin:14px 0}
.callout.ok{border-color:var(--ok);background:#ecfaf1}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--sunken);font-weight:700}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.win td{background:var(--soft)}
ul{max-width:920px}li{margin:5px 0}code{font:12.5px ui-monospace,Menlo,monospace;background:var(--sunken);padding:1px 5px;border-radius:5px}
.small{font-size:13px;color:var(--muted)}
.refs{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}
.refs figure{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card)}
.refs img{display:block;width:100%}.refs figcaption{padding:10px 14px;font-size:13px;color:var(--muted)}
/* variant */
.variant{margin-top:36px;padding-top:8px;border-top:2px solid var(--ink)}
.variant header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.variant header h3{margin:8px 0}
.score{font:700 15px ui-monospace,monospace;background:var(--sunken);padding:3px 10px;border-radius:999px}
.kicker{color:var(--muted);font-size:13px}
.auth{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);margin:14px 0}
.auth .left{min-width:0}
.strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);background:var(--sunken)}
.strip .chip{font:600 12px Inter,system-ui,sans-serif;padding:3px 9px;border-radius:999px;border:1px solid var(--strong);background:#fff;color:var(--muted)}
.strip .chip.now{background:var(--accent);border-color:var(--accent);color:#fff}.strip .chip.done{color:var(--ok);border-color:#b7e2c6;background:#ecfaf1}
.strip .nav{margin-left:auto;display:flex;gap:6px}
.strip .reset,.strip .back,.strip .next{font:600 12px Inter,system-ui,sans-serif;border:1px solid var(--strong);background:#fff;border-radius:8px;padding:3px 10px;cursor:pointer}
.strip .next{background:var(--accent);border-color:var(--accent);color:#fff}
.strip .chip{cursor:pointer}
.hint{padding:8px 14px;font-size:13.5px;color:var(--ink);border-bottom:1px solid var(--line);min-height:38px}
.canvas{position:relative}
.canvas .layer[hidden]{display:none}.canvas svg{display:block;width:100%;height:auto}
.ov{position:absolute;z-index:3}.ov[hidden]{display:none}
.right{border-left:1px solid var(--line);background:#fff;min-height:100%}
.panel[hidden]{display:none}
/* inspector mock (idiom of src/blocks/ui/block-inspector.css) */
.mi{font-size:13px;color:var(--ink);width:280px}
.mi-head{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);font-weight:700}
.mi-tabs{display:flex;gap:10px;font-weight:500;font-size:12px;color:var(--muted)}.mi-tabs b{color:var(--ink);border:1px solid var(--strong);border-radius:8px;padding:2px 10px}
.mi-empty{padding:26px 16px;color:var(--muted)}.mi-empty span{font-size:12px;color:var(--faint)}
.mi-section{padding:14px 16px;border-bottom:1px solid var(--line)}
.mi-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:var(--muted);font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.mi-tools{display:flex;gap:6px;align-items:center}
.mi-chip{font:600 10px Inter,system-ui,sans-serif;letter-spacing:0;text-transform:none;background:var(--sunken);border-radius:999px;padding:2px 8px;color:var(--muted)}
.mi-plus{width:24px;height:24px;border:1px solid var(--strong);border-radius:6px;background:#fff;color:var(--muted);font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer}
.mi-field{display:grid;grid-template-columns:70px 1fr;align-items:center;gap:8px;margin:6px 0}.mi-field label{color:var(--muted);font-size:12px}
.mi-in{height:30px;border:1px solid var(--strong);border-radius:6px;padding:0 8px;font:13px Inter,system-ui,sans-serif;background:var(--sunken);color:var(--ink);min-width:0;width:100%}
.mi-in:read-only{background:#fff}.mi-in:focus{outline:2px solid var(--accent);outline-offset:-1px;background:#fff}
.mi-in--type,.mi-in--code{font:12px ui-monospace,Menlo,monospace}.mi-in--type{color:var(--muted)}
.mi-row{display:grid;grid-template-columns:minmax(0,1fr) 56px 12px 22px;gap:5px;align-items:center;margin:5px 0}
.mi-row--derived{grid-template-columns:minmax(0,1fr) auto 12px}
.mi-derived{font-size:11px;color:var(--muted);white-space:nowrap}
.mi-dot{width:10px;height:10px;border-radius:50%;border:2px solid #c08520;background:#fff;display:inline-block}.mi-dot--on{background:#c08520}
.mi-x,.mi-ib{width:22px;height:22px;border:none;background:none;color:var(--muted);cursor:pointer;font:16px/1 Inter,system-ui,sans-serif;border-radius:6px}
.mi-ib{border:1px solid var(--strong);font-size:13px;width:24px;height:24px;background:#fff}.mi-ib--on{background:var(--sunken)}
.mi-target--on{color:var(--accent);border-color:var(--accent);background:var(--soft)}
.mi-arm{display:grid;grid-template-columns:14px minmax(0,1fr) 24px 24px 22px;gap:5px;align-items:center;margin:5px 0}
.mi-grip{color:var(--faint);font-size:11px;cursor:grab;letter-spacing:-2px}
.mi-none{margin:0;color:var(--faint);font-size:12px}
.mi-hint{margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.45}
.mi-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}.mi-seg button{height:28px;border:1px solid var(--strong);border-radius:6px;background:#fff;font:12px Inter,system-ui,sans-serif;color:var(--ink)}.mi-seg button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.mi-code-row{display:grid;grid-template-columns:18px 1fr;gap:6px;align-items:center;margin:4px 0}.mi-ln{color:var(--faint);font:11px ui-monospace,monospace;text-align:right}
.mi--note .mi-notebody{padding:14px 16px;font-size:13px}.mi--note p{margin:0 0 8px}
/* canvas mocks */
.cm{background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px #0002;width:150px;font-size:13px;position:relative}
.cm-row{padding:6px 12px;display:flex;justify-content:space-between}.cm-row span{color:var(--muted)}.cm-sep{height:1px;background:var(--line);margin:4px 0}
.cm-row--open{background:var(--sunken)}
.cm-sub{position:absolute;left:150px;top:78px;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px #0002;width:140px}
.cm-row--new{color:var(--accent);font-weight:600;cursor:pointer}
.pill{display:inline-flex;align-items:center;gap:2px;background:#1d2230;border-radius:8px;padding:4px;box-shadow:0 8px 24px #0004;white-space:nowrap}
.pill button{background:none;border:none;color:#fff;font:600 12px Inter,system-ui,sans-serif;padding:6px 9px;border-radius:6px;cursor:pointer}.pill button.on{background:#3a4152}.pill-sep{width:1px;height:18px;background:#3a4152;margin:0 3px}
.marquee{position:absolute;left:-6px;top:-4px;width:calc(100% + 120px);height:0;pointer-events:none}
.tb{display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:5px;box-shadow:0 8px 24px #0002}
.tb button{width:34px;height:34px;border:none;background:none;border-radius:8px;font-size:15px;color:var(--ink);cursor:pointer}.tb .tb-new{background:var(--soft);color:var(--accent);font-weight:700}.tb-label{font-size:11px;color:var(--accent);padding:0 8px 0 2px;font-weight:600}
.inl{height:22px;border:1px solid var(--accent);border-radius:5px;padding:0 6px;font:700 12px Inter,system-ui,sans-serif;background:#fff;width:120px;outline:none;box-shadow:0 0 0 3px #2f6fed33}
.plus-band{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--accent);background:#fff;color:var(--accent);font:700 14px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px #0002}
.plus-arm{width:100%;height:22px;border:1px dashed var(--strong);border-radius:6px;background:#fff9;color:var(--muted);font:600 12px Inter,system-ui,sans-serif;cursor:pointer}
.hot{display:inline-flex;align-items:center;gap:8px;background:none;border:none;cursor:pointer;padding:0;transform:translate(-9px,-9px)}
.hot-dot{width:18px;height:18px;border-radius:50%;background:#2f6fed33;border:2px solid var(--accent)}.hot-label{font:600 11px Inter,system-ui,sans-serif;color:var(--accent);background:#fff;padding:2px 8px;border-radius:999px;box-shadow:0 2px 8px #0002;white-space:nowrap}
.hot--band .hot-label{margin-left:2px}
.split{width:100%;height:16px;border:none;background:none;cursor:row-resize;display:flex;align-items:center;gap:10px;color:var(--accent);font:600 11px Inter,system-ui,sans-serif;padding:0}.split span{flex:1;height:0;border-top:2px dashed var(--accent)}
.draw{width:100%;height:60px;border:2px dashed var(--accent);border-radius:6px;background:#2f6fed14;color:var(--accent);font:600 12px Inter,system-ui,sans-serif;cursor:crosshair}
.pulse{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 #2f6fed66}50%{box-shadow:0 0 0 8px #2f6fed00}}
rect.hit.pulse{fill:#2f6fed22!important;stroke:#2f6fed;stroke-width:1.5;animation:none}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:1200px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.pick{display:flex;gap:8px;margin:10px 0 0}.pick button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;font:600 12.5px Inter,system-ui,sans-serif;cursor:pointer}.pick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
textarea{width:100%;max-width:900px;min-height:110px;border:1px solid var(--line);border-radius:10px;padding:10px;font:12.5px ui-monospace,monospace}
ul.checks{list-style:none;padding:0;columns:2;column-gap:28px;max-width:1200px;font-size:13.5px}ul.checks li{break-inside:avoid;padding:4px 0}ul.checks .tick{color:var(--ok);font-weight:900;margin-right:8px}
.splice{display:grid;grid-template-columns:280px 1fr;gap:18px;align-items:start;max-width:1100px}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:1000px){.auth{grid-template-columns:1fr}.right{border-left:0;border-top:1px solid var(--line)}.facts,.decision,.refs,.splice{grid-template-columns:1fr}}
"""

JS = r"""
(function(){
  var DEF = JSON.parse(document.getElementById('auth-data').textContent);
  document.querySelectorAll('.auth').forEach(function(root){
    var key = root.dataset.variant, def = DEF[key], i = 0;
    function showOne(sel, id){ root.querySelectorAll(sel).forEach(function(el){ el.hidden = (el.dataset.id !== id) }) }
    function current(){ return i < def.steps.length ? def.steps[i] : null }
    function paint(){
      var st = current();
      var boardId = i === 0 ? def.start.board : def.steps[i-1].board;
      var panelId = i === 0 ? def.start.panel : def.steps[i-1].panel;
      showOne('.layer', boardId); showOne('.panel', panelId);
      root.querySelectorAll('.ov').forEach(function(o){ o.hidden = !(st && o.dataset.step === st.id) });
      root.querySelectorAll('[data-act]').forEach(function(el){ el.classList.toggle('pulse', !!st && el.dataset.act === st.act) });
      root.querySelectorAll('.hit').forEach(function(h){ h.classList.remove('pulse') });
      if (st && st.act.indexOf('hit:') === 0) {
        var p = st.act.split(':');
        root.querySelectorAll('.layer:not([hidden]) .hit[data-action="'+p[1]+'"][data-arm="'+p[2]+'"]').forEach(function(h){ h.classList.add('pulse') });
      }
      root.querySelectorAll('.strip .chip').forEach(function(c,k){ c.classList.toggle('now', k === i); c.classList.toggle('done', k < i) });
      root.querySelector('.hint').textContent = st ? ((i+1) + ' · ' + st.hint) : def.done;
      root.dataset.step = String(i); root.dataset.board = boardId;
      if (st && st.kind === 'type') {
        var inputs = root.querySelectorAll('[data-act="'+st.act+'"]');
        inputs.forEach(function(inp){ if (inp.offsetParent !== null) { try { inp.focus(); } catch(e){} } });
      }
    }
    function advance(){ if (i < def.steps.length) { i += 1; paint(); } }
    function back(){ if (i > 0) { i -= 1; paint(); } }
    root.addEventListener('click', function(e){
      var st = current(); if (!st) return;
      if (st.act.indexOf('hit:') === 0) {
        var h = e.target.closest('.hit'); if (!h) return;
        var p = st.act.split(':');
        if (h.dataset.action === p[1] && h.dataset.arm === p[2]) advance();
        return;
      }
      var el = e.target.closest('[data-act]'); if (!el) return;
      if (st.kind === 'click' && el.dataset.act === st.act) advance();
    });
    root.addEventListener('keydown', function(e){
      var st = current(); if (!st || st.kind !== 'type') return;
      var el = e.target.closest('[data-act]'); if (!el || el.dataset.act !== st.act) return;
      if (e.key === 'Enter') { el.value = st.expect; e.preventDefault(); advance(); }
    });
    root.querySelector('.reset').addEventListener('click', function(){ i = 0; paint(); });
    root.querySelector('.back').addEventListener('click', function(){ back(); });
    root.querySelector('.next').addEventListener('click', function(){ if (i < def.steps.length) { var st = current(); if (st && st.kind === 'type') { var inp = root.querySelector('[data-act="'+st.act+'"]'); if (inp && 'value' in inp) inp.value = st.expect; } advance(); } });
    root.querySelectorAll('.strip .chip').forEach(function(c,k){ c.addEventListener('click', function(){ i = k; paint(); }); });
    paint();
  });
  var key='branch-authoring-2026-09-02', state={};
  try { state = JSON.parse(localStorage.getItem(key) || '{}') } catch(e) {}
  function paintPicks(){
    document.querySelectorAll('.pick').forEach(function(p){ var id=p.dataset.id; p.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', state[id] === b.dataset.v) }) });
    var brief=document.getElementById('brief'); if (brief) { var lines=Object.keys(state).map(function(id){ return state[id]+': '+id }); brief.value = lines.length ? lines.join('\n') : 'Pick: v4-in-v1 (derive the ports, keep the lists)\nKeep: \nBorrow from v2: click-to-edit labels, + arm row\nAvoid: \nWhy: '; }
  }
  document.querySelectorAll('.pick button').forEach(function(b){ b.addEventListener('click', function(){ var id=b.parentNode.dataset.id; state[id] = (state[id] === b.dataset.v) ? undefined : b.dataset.v; if (!state[id]) delete state[id]; try { localStorage.setItem(key, JSON.stringify(state)) } catch(e) {} paintPicks(); }) });
  paintPicks();
})();
"""


def image_uri(path: Path) -> str:
    import base64
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def references_html() -> str:
    shots = [
        (DOCS / "inspector-live-commit-live-2026-09-01.png", "The real inspector on a Block: BLOCK · TAGS · VIEW · INPUTS (n visible, +) · OUTPUTS · PORTS. The Branch section in V1 and V4 is drawn in this idiom."),
        (DOCS / "block-port-in-window-menu-2026-09-01.png", "The real right-click menu on a port: Add port above / below, Move up / down, Delete port, then Block view › and Add ›. Creation in V1, V2 and V4 is one more row under Add."),
        (DOCS / "block-batch-inspector-live-2026-09-01.png", "The real selection pill (2 Blocks · S · P · E · Inspect) above a selection. V3 adds Wrap in Branch to it; V5 gives a selected Branch its own pill."),
    ]
    figs = []
    for path, cap in shots:
        if path.exists():
            figs.append(f'<figure><img src="{image_uri(path)}" alt=""><figcaption>{cap}</figcaption></figure>')
    return f"<div class='refs'>{''.join(figs)}</div>"


def acceptance_html() -> str:
    if not ACCEPTANCE.exists():
        return "<p class='small'>Browser journey not yet run: <code>npm run test:authoring</code>.</p>"
    checks = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
    passed = sum(1 for c in checks if c.get("ok"))
    items = "".join(f"<li><span class='tick'>{'✓' if c.get('ok') else '✗'}</span> {html.escape(c['label'])}</li>" for c in checks)
    return f"<p><b>{passed}/{len(checks)} real-browser checks</b> — <code>tests/branch_authoring_smoke.mjs</code> drives V1 end to end, V4's derivation and V2's on-canvas + and rename over CDP with real clicks and typed text, reading the board and panel after each gesture.</p><ul class='checks'>{items}</ul>"


def variant_html(v: dict) -> str:
    layers = "".join(f'<div class="layer" data-id="{bid}" hidden>{BOARDS[bid]}</div>' for bid in sorted({v["start"]["board"], *[s["board"] for s in v["steps"]]}))
    panels = "".join(f'<div class="panel" data-id="{pid}" hidden>{p}</div>' for pid, p in v["panels"].items())
    chips = "".join(f'<span class="chip">{i + 1} {html.escape(c)}</span>' for i, c in enumerate(v["strip"]))
    total = weighted(SCORES[v["id"]])
    scores = " · ".join(f"{c[0]} {SCORES[v['id']][c[0]]}" for c in CRITERIA)
    return f'''<section class="variant" id="{v['id']}">
<header><h3>{v['id'].upper()} · {html.escape(v['name'])}</h3><span class="score">{total}/100</span><span class="kicker">{html.escape(v['kicker'])} · {scores}</span></header>
<p>{html.escape(v['thesis'])}</p>
<div class="auth" data-variant="{v['id']}">
<div class="left">
<div class="strip">{chips}<span class="nav"><button type="button" class="back" title="previous step">◀ back</button><button type="button" class="next" title="next step">next ▶</button><button type="button" class="reset">↺ restart</button></span></div>
<div class="hint"></div>
<div class="canvas">{layers}{"".join(v['overlays'])}</div>
</div>
<div class="right">{panels}</div>
</div>
<div class="cols" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px 28px;max-width:1200px">
<div><span class="small" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">gestures to a named arm + a control port</span><p style="margin:6px 0"><b>{v['gestures']}</b> — {html.escape(v['gesture_note'])}</p></div>
<div><span class="small" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">best when</span><p style="margin:6px 0">{html.escape(BEST[v['id']])}</p></div>
<div><span class="small" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700">loses when</span><p style="margin:6px 0">{html.escape(LOSES[v['id']])}</p></div>
</div>
<div class="pick" data-id="{v['id']}"><button data-v="Pick">Pick</button><button data-v="Shortlist">Shortlist</button><button data-v="Reject">Reject</button></div>
</section>'''


def scores_html() -> str:
    head = "".join(f"<th class='n'>{c[0]}<br><span class='small'>{c[2]}</span></th>" for c in CRITERIA)
    rows = ""
    for v in sorted(VARIANTS, key=lambda v: -weighted(SCORES[v["id"]])):
        cells = "".join(f"<td class='n'>{SCORES[v['id']][c[0]]}</td>" for c in CRITERIA)
        rows += f"<tr class='{'win' if v['id'] == 'v4' else ''}'><td><b>{v['id'].upper()}</b> {html.escape(v['name'])}</td>{cells}<td class='n'>{v['gestures']}</td><td class='n'><b>{weighted(SCORES[v['id']])}</b></td></tr>"
    crit = "".join(f"<li><b>{c[0]} · {html.escape(c[1])}</b> ({c[2]}) — {html.escape(c[3])}</li>" for c in CRITERIA)
    return f"<ul>{crit}</ul><table><tr><th>variant</th>{head}<th class='n'>gestures</th><th class='n'>total</th></tr>{rows}</table>"


def splice_html() -> str:
    panel = inspector(
        section("Block", '<div class="mi-field"><label>Title</label><input class="mi-in" value="Branch" readonly></div><div class="mi-field"><label>Type</label><input class="mi-in mi-in--type" value="branch" readonly></div>'),
        view_section(),
        section("Arms", '<div class="mi-arms">' + arm_row("if fast:", active=True) + arm_row("elif gain > 1:") + arm_row("else:") + '</div>', chip="3", plus_act="", hint="One row per case, in source order; the name is the code. ⌄ folds, ◎ makes active, ⋮⋮ reorders."),
        section("Control ports", '<div class="mi-ports">' + port_row("fast", "", wired=True, derived="read by arm 1") + port_row("gain", "", wired=False, derived="read by arm 2") + port_row("mode", "", wired=False, derived="read by no arm ⚠") + '</div>', chip="3 on band", plus_act="splice-plus", hint="Derived from the arm names; + still adds one by hand while sketching, and a port no arm reads is flagged, not forbidden."),
    )
    return f'''<div class="splice"><div>{panel}</div><div>
<p><b>The splice, drawn.</b> V1's two lists, in V1's place, with V4's rule inside them: the arm name is the code, and the Control ports list is <i>derived</i> from those names, with a wired/unwired dot per port. The + on Control ports stays for sketching, and a hand-added port that no arm reads is flagged with ⚠ rather than refused. On the canvas, V2's fast path: click a label to rename it (the Block title's click-to-edit), a + arm row at the bottom, the chevron and target already prototyped. Creation stays Add › Branch region in the existing menu; V5's tool can come later without changing any of this.</p>
<p><b>Why this and not pure V4.</b> A sketch is allowed to be ahead of its code. Zach draws a branch before the condition exists; pure V4 has nowhere to put a control port until a line is written. The splice keeps the list, so the sketch can hold a port with no reader, and keeps the derivation, so the moment a name is written the band is right without anyone touching it.</p>
<p><b>Why this and not pure V1.</b> V1's port list can drift from the arms (a port nobody reads, an arm that reads a name with no port). Derivation is one binding table over the labels, the same table the analyzer already keeps; the inspector just runs it on every keystroke.</p>
</div></div>'''


def build() -> str:
    data = {v["id"]: {"start": v["start"], "steps": v["steps"], "done": v["done"]} for v in VARIANTS}
    variants = "".join(variant_html(v) for v in VARIANTS)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Branch authoring — five ways to create and edit a Branch</title><style>{CSS}</style></head>
<body><main>
<div class="eyebrow">SystemSketch · pyblocks · Branch authoring · {TODAY}</div>
<h1>Five ways to make a Branch.</h1>
<p class="lede">You asked for the creation and editing UX: in the inspector, the option to add control ports (which appear on the band) and to add arms with names of your choosing. That is V1 below, drawn in the real inspector's idiom. The other four move the same edits to a different surface: onto the canvas, into gestures, into code, onto a tool and the selection pill. All five are click-through prototypes on the same fixture, the 09_branch, and every board they produce is rendered by the same engine as the Case-view prototype, so the thing you author looks exactly like the thing you reviewed this morning. <b>They are mocks, not the app</b>: the panels imitate <code>block-inspector.css</code>, the boards are SVG, the steps are guided.</p>

<div class="facts">
<div class="fact"><b>{INSPECTOR_SECTIONS}</b><span>sections in the real Block inspector today (<code>BlockInspector.tsx</code>); V1 adds two, V4 replaces them with one code list and one derived list</span></div>
<div class="fact"><b>{INSPECTOR_WIDTH}</b><span>the inspector's width (<code>block-inspector.css</code>); every panel below is drawn at it</span></div>
<div class="fact"><b>{MENU_PORT_ITEMS} + {PILL_BUTTONS}</b><span>port items in the right-click menu and buttons in the selection pill: the two surfaces V2, V3 and V5 extend</span></div>
<div class="fact"><b>{'yes' if CLICK_TO_EDIT else 'no'}</b><span>click-to-edit exists for Block text (<code>blockClickToEdit.ts</code>): the arm label rename in V2, V3 and V5 is that behaviour on an arm</span></div>
</div>

<h2>0 · The real chrome these are drawn against</h2>
{references_html()}

<h2>1 · Criteria, then five prototypes</h2>
{scores_html()}
<div class="callout"><b>Recommendation: V4's rule inside V1's surface, with V2's fast path on the canvas.</b> V4 scores highest because a derived control port cannot be wrong and a code line is the least UI possible; V1 is the surface you already know and the only one that lets a sketch hold a port before its condition exists. The splice below keeps V1's two lists, derives the Control ports list from the arm names (with + kept for sketching and a warning for a port no arm reads), and puts rename, + arm, fold and active on the canvas as V2 draws them. Default if you say nothing: ship V1's lists first with derivation as validation; the tool (V5) and the wrap gesture (V3) are additive later. <b>Hinge:</b> if arm names must stay free text rather than code, derivation is impossible and V1 stands alone at {weighted(SCORES['v1'])}; if they are always code, pure V4 at {weighted(SCORES['v4'])} is the smallest thing to build.</div>

{variants}

<h2>2 · The splice</h2>
{splice_html()}

<h2>3 · Browser proof</h2>
{acceptance_html()}

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Five click-through prototypes on one fixture, each producing the settled model, every board rendered by the branch engine.</li><li>Panels drawn at the real inspector's width and idiom, anchored to real captures.</li><li>The recommended surface (V1) driven end to end over CDP, plus V4's derivation and V2's on-canvas + and rename.</li></ul></div>
<div><h4>Left, and what kind of left</h4><ul><li><b>Next:</b> the Branch shape in SystemSketch (region frame kind with headers, arms, view/open/active) and its inspector section: two lists, derivation on label change.</li><li><b>Next:</b> Add › Branch region in the context menu; click-to-edit on arm labels; the + arm row.</li><li><b>Later, additive:</b> the Branch tool and the pill variant (V5); Wrap in Branch and the band as a cable landing (V3).</li></ul></div>
<div><h4>Needs you</h4><ul><li><b>Are arm names code?</b> Recommendation yes (they are what the analyzer emits); default if silent: yes, with free text tolerated and simply deriving nothing.</li><li><b>Keep + on Control ports for sketching?</b> Recommendation yes, with the ⚠ for an unread port; default: yes.</li><li><b>Creation entry point first:</b> context menu (V1/V2/V4) or tool (V5)? Recommendation context menu now, tool later; default: context menu.</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No app code: the Branch shape does not exist yet, so nothing here runs in SystemSketch.</li><li>Reorder by drag (⋮⋮ and the divider) is shown, not simulated.</li><li>Typing accepts ⏎ and commits the expected text, so the boards stay pre-rendered; the real field would take any text.</li></ul></div>
</div>

<h3>Reply cheaply</h3>
<p class="small">Pick buttons persist in this browser; the brief below mirrors them. Or answer in the note: <code>Pick: … / Keep: … / Borrow from …: … / Avoid: … / Why: …</code></p>
<textarea id="brief"></textarea>

<footer>Built by <code>docs/build_branch_authoring.py</code> at {GIT_HEAD} · boards by <code>docs/branch_case_view.py</code> + <code>docs/branch_board_svg.py</code> · panels are mocks in the idiom of <code>src/blocks/ui/block-inspector.css</code>, not the app · Claude Code (Fable 5.1), {TODAY}.</footer>
</main>
<script type="application/json" id="auth-data">{json.dumps(data)}</script>
<script>{JS}</script></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"boards": len(BOARDS), "sections": INSPECTOR_SECTIONS, "scores": {v["id"]: weighted(SCORES[v["id"]]) for v in VARIANTS}}))


if __name__ == "__main__":
    main()
