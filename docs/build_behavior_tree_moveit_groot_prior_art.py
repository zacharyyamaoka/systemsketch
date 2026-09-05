#!/usr/bin/env python3
"""Build the standalone MoveIt Studio Pro / BT.CPP / Groot2 prior-art atlas.

The Markdown report is the canonical research source.  This companion turns it
into a visual dictionary: a short description, a primary-source screenshot,
and an explicitly-labelled SystemSketch proposal per useful item.  PNGs are
embedded exactly once in the generated document so the review file travels
without a docs server or a network connection.
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path
from textwrap import dedent


HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "behavior-tree-moveit-groot-prior-art-2026-09-04.html"

MOVEIT_CONCEPTS = "https://docs.picknik.ai/concepts/behavior_trees/"
MOVEIT_TUTORIAL = "https://docs.picknik.ai/tutorials/quick_start_intro/"
MOVEIT_PERCEPTION = "https://docs.picknik.ai/tutorials/perception_%26_machine_learning/"
MOVEIT_UI = "https://docs.picknik.ai/how_to/custom_view_panes/about_the_user_interface/"
MOVEIT_SHORTCUTS = "https://docs.picknik.ai/how_to/behavior_tree_editing/keyboard_shortcuts/"
MOVEIT_BREAKPOINTS = "https://docs.picknik.ai/how_to/behavior_tree_editing/breakpoints/"
MOVEIT_BLACKBOARD = "https://docs.picknik.ai/how_to/behavior_tree_editing/debugging_blackboard/"
MOVEIT_RELEASE_10 = "https://docs.picknik.ai/release-notes/2026/09/01/10.0.0/"
GROOT = "https://www.behaviortree.dev/groot/"
BTCPP_BASICS = "https://behaviortree.dev/docs/learn-the-basics/BT_basics/"
BTCPP_NODES = "https://behaviortree.dev/docs/category/nodes-library/"
BTCPP_PORTS = "https://behaviortree.dev/docs/guides/ports_vs_blackboard/"
BTCPP_DECORATORS = "https://behaviortree.dev/docs/nodes-library/DecoratorNode/"
BTCPP_CONDITIONAL = "https://behaviortree.dev/docs/nodes-library/ConditionalControlNodes/"
BTCPP_SUBTREE = "https://behaviortree.dev/docs/tutorial-basics/tutorial_05_subtrees/"
BTCPP_REMAP = "https://behaviortree.dev/docs/tutorial-basics/tutorial_06_subtree_ports/"
BTCPP_GROOT = "https://behaviortree.dev/docs/tutorial-basics/tutorial_11_groot2/"
BTCPP_ASYNC = "https://behaviortree.dev/docs/guides/asynchronous_nodes/"
BTCPP_PREPOST = "https://behaviortree.dev/docs/guides/pre_post_conditions/"


def h(value: object) -> str:
    return html.escape(str(value), quote=True)


def asset_data(filename: str) -> str:
    path = ASSETS / filename
    if not path.exists():
        raise FileNotFoundError(path)
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def pill(label: str, tone: str = "neutral") -> str:
    return f'<span class="pill pill-{h(tone)}">{h(label)}</span>'


def source_image(filename: str, alt: str, source_label: str, source_url: str) -> str:
    """An actual vendor-tool capture plus the durable documentation citation."""
    return f'''<figure class="evidence-card">
      <div class="source-chip">OFFICIAL REFERENCE</div>
      <img class="reference-image" data-asset="{h(filename)}" alt="{h(alt)}" loading="lazy">
      <figcaption><strong>{h(source_label)}</strong><br><a href="{h(source_url)}">{h(source_url)}</a></figcaption>
    </figure>'''


def system_image(filename: str, alt: str, source_label: str, source_url: str) -> str:
    return f'''<figure class="evidence-card existing-card">
      <div class="source-chip source-system">CURRENT SYSTEMSKETCH</div>
      <img class="reference-image" data-asset="{h(filename)}" alt="{h(alt)}" loading="lazy">
      <figcaption><strong>{h(source_label)}</strong><br><a href="{h(source_url)}">{h(source_url)}</a></figcaption>
    </figure>'''


# SVG helpers — these are original SystemSketch proposals, never source-tool
# drawings.  Keeping them in code makes every visual claim auditable and lets
# the dictionary maintain a recognisable Block / port / cable language.
def svg(title: str, subtitle: str, body: str, width: int = 920, height: int = 340) -> str:
    return f'''<svg class="proposal-svg" viewBox="0 0 {width} {height}" role="img" aria-label="SystemSketch proposal: {h(title)}">
      <defs>
        <pattern id="grid-{h(title).replace(' ', '-')[:18]}" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M 22 0 L 0 0 0 22" fill="none" stroke="#142b3a" stroke-width="1"/></pattern>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#7ea5bf"/></marker>
      </defs>
      <rect width="{width}" height="{height}" rx="18" fill="#07121d"/>
      <rect x="12" y="12" width="{width - 24}" height="{height - 24}" rx="13" fill="url(#grid-{h(title).replace(' ', '-')[:18]})" stroke="#1f4052"/>
      <text x="32" y="42" class="svg-title">{h(title)}</text>
      <text x="32" y="64" class="svg-sub">{h(subtitle)}</text>
      {body}
    </svg>'''


PALETTE = {
    "root": ("#243c64", "#a9cbff"),
    "control": ("#4b1f3b", "#ff85bb"),
    "task": ("#1a4a48", "#74e0cb"),
    "guard": ("#554629", "#f4cc70"),
    "policy": ("#4a3264", "#d4a8ff"),
    "subtree": ("#433c25", "#ffe48a"),
    "disabled": ("#283642", "#8296a3"),
    "error": ("#5b2634", "#ff9aaa"),
}


def node(x: int, y: int, w: int, hgt: int, title: str, kind: str = "task", detail: str = "") -> str:
    fill, stroke = PALETTE[kind]
    # Compact controls still keep their detail inside the card. A fixed y+53
    # baseline made short Sequence/Parallel cards visibly overflow in visual QA.
    detail_markup = f'<text x="{x + 16}" y="{y + hgt - 8}" class="svg-detail">{h(detail)}</text>' if detail else ""
    return f'''<g>
      <rect x="{x}" y="{y}" width="{w}" height="{hgt}" rx="11" fill="{fill}" stroke="{stroke}" stroke-width="2"/>
      <text x="{x + 16}" y="{y + 31}" class="svg-node">{h(title)}</text>
      {detail_markup}
    </g>'''


def port(x: int, y: int, label: str, direction: str = "in", tag: str = "data") -> str:
    color = {"data": "#54a9ff", "event": "#f7ae58", "state": "#a783ff", "result": "#7fe3b1"}.get(tag, "#54a9ff")
    anchor = "end" if direction == "in" else "start"
    label_x = x - 9 if direction == "in" else x + 9
    return f'''<g><circle cx="{x}" cy="{y}" r="6" fill="#07121d" stroke="{color}" stroke-width="3"/>
      <text x="{label_x}" y="{y + 4}" text-anchor="{anchor}" class="svg-port">{h(label)}</text></g>'''


def control_edge(x1: int, y1: int, x2: int, y2: int) -> str:
    return f'<path d="M{x1} {y1} C{x1} {y1 + 23}, {x2} {y2 - 23}, {x2} {y2}" fill="none" stroke="#d28bff" stroke-width="3" marker-end="url(#arrow)"/>'


def data_edge(x1: int, y1: int, x2: int, y2: int, label: str = "") -> str:
    label_markup = ""
    if label:
        label_markup = f'<rect x="{(x1 + x2) / 2 - 33:.1f}" y="{(y1 + y2) / 2 - 18:.1f}" width="66" height="18" rx="9" fill="#0c2130"/><text x="{(x1 + x2) / 2:.1f}" y="{(y1 + y2) / 2 - 5:.1f}" text-anchor="middle" class="svg-wire">{h(label)}</text>'
    return f'<path d="M{x1} {y1} C{x1 + 55} {y1}, {x2 - 55} {y2}, {x2} {y2}" fill="none" stroke="#54a9ff" stroke-width="3" marker-end="url(#arrow)"/>{label_markup}'


def tag(x: int, y: int, label: str, color: str = "#54a9ff") -> str:
    width = max(52, len(label) * 7.0 + 18)
    return f'<g><rect x="{x}" y="{y}" width="{width}" height="22" rx="11" fill="#10283a" stroke="{color}"/><text x="{x + width / 2}" y="{y + 15}" text-anchor="middle" class="svg-tag">{h(label)}</text></g>'


def note(x: int, y: int, text: str, tone: str = "#9bb4c7") -> str:
    return f'<text x="{x}" y="{y}" class="svg-note" fill="{tone}">{h(text)}</text>'


def proposal(kind: str, title: str) -> str:
    """Return a distinct, original SystemSketch sketch for a dictionary entry."""
    if kind == "root":
        body = "".join([
            node(365, 88, 190, 48, "Root", "root", "one persisted entry"),
            node(365, 180, 190, 52, "Sequence", "control", "ordered children"),
            node(112, 268, 160, 48, "Sense", "task"), node(380, 268, 160, 48, "Plan", "task"), node(648, 268, 160, 48, "Act", "task"),
            control_edge(460, 136, 460, 180), control_edge(425, 232, 192, 268), control_edge(460, 232, 460, 268), control_edge(495, 232, 728, 268),
            note(664, 109, "structural tick / priority", "#dca5ff"),
        ])
        return svg(title, "PROPOSAL · structural control is not a data cable", body)
    if kind == "task":
        body = "".join([
            node(110, 125, 220, 90, "Guard: target visible?", "guard", "read-only · no RUNNING"),
            node(590, 125, 220, 90, "Task: approach", "task", "may RUN / OK / FAIL"),
            port(110, 170, "scene", "in", "data"), port(330, 170, "visible", "out", "result"),
            port(590, 170, "target", "in", "data"), port(810, 170, "pose", "out", "result"),
            data_edge(330, 170, 590, 170, "Bool"), tag(140, 244, "Condition" , "#f4cc70"), tag(620, 244, "Task", "#74e0cb"),
            note(110, 298, "Outcome status remains control semantics; values stay ordinary ports/cables."),
        ])
        return svg(title, "PROPOSAL · leaf cards expose their contract", body)
    if kind == "sequence":
        body = "".join([
            node(334, 88, 252, 52, "Sequence", "control", "policy: memory"),
            node(92, 230, 190, 52, "1  Acquire", "task"), node(365, 230, 190, 52, "2  Validate", "guard"), node(638, 230, 190, 52, "3  Commit", "task"),
            control_edge(397, 140, 187, 230), control_edge(460, 140, 460, 230), control_edge(523, 140, 733, 230),
            tag(122, 160, "first failure stops" , "#ff9aaa"), tag(686, 160, "order persists" , "#d28bff"),
        ])
        return svg(title, "PROPOSAL · one form, explicit execution policy", body)
    if kind == "fallback":
        body = "".join([
            node(333, 86, 254, 52, "Fallback", "control", "policy: priority"),
            node(88, 226, 210, 54, "1  Try preferred", "task", "FAIL → next"), node(355, 226, 210, 54, "2  Recover", "task", "SUCCESS → done"), node(622, 226, 210, 54, "3  Escalate", "task", "only if needed"),
            control_edge(395, 138, 193, 226), control_edge(460, 138, 460, 226), control_edge(525, 138, 727, 226),
            tag(151, 301, "expected failure", "#ff9aaa"), tag(415, 301, "fallback", "#7fe3b1"),
        ])
        return svg(title, "PROPOSAL · recovery is control order, not an exception rail", body)
    if kind == "parallel":
        body = "".join([
            node(319, 84, 282, 60, "Parallel", "control", "success ≥ 1 · failure ≥ 2"),
            node(90, 231, 204, 54, "Move", "task", "RUNNING"), node(358, 231, 204, 54, "Watch force", "guard", "RUNNING"), node(626, 231, 204, 54, "Timeout", "policy", "60 s"),
            control_edge(390, 144, 192, 231), control_edge(460, 144, 460, 231), control_edge(530, 144, 728, 231),
            tag(305, 165, "cancellation: halt remaining", "#d4a8ff"),
        ])
        return svg(title, "PROPOSAL · policy must be visible before runtime promises concurrency", body)
    if kind == "decorator":
        body = "".join([
            '<rect x="275" y="92" width="370" height="205" rx="18" fill="#1c1930" stroke="#d4a8ff" stroke-width="2" stroke-dasharray="8 6"/>',
            node(310, 118, 300, 50, "Retry", "policy", "max attempts: 3"),
            node(345, 207, 230, 55, "Fetch pose", "task", "FAIL / RUN / OK"),
            control_edge(460, 168, 460, 207), tag(320, 275, "exactly one child", "#d4a8ff"),
            note(115, 172, "wrapper shape", "#d4a8ff"), note(675, 172, "parameters in inspector", "#d4a8ff"),
        ])
        return svg(title, "PROPOSAL · a readable policy wrapper, not a parade of icons", body)
    if kind == "ports":
        body = "".join([
            node(105, 122, 230, 110, "Estimate pose", "task", "source-backed behavior"),
            node(585, 122, 230, 110, "Approach", "task", "source-backed behavior"),
            port(335, 157, "pose", "out", "state"), port(585, 157, "pose", "in", "state"),
            port(335, 198, "updated", "out", "event"), port(585, 198, "trigger", "in", "event"),
            data_edge(341, 157, 579, 157, "Pose"), data_edge(341, 198, 579, 198, "event"),
            tag(104, 255, "state", "#a783ff"), tag(190, 255, "event", "#f7ae58"), tag(278, 255, "data", "#54a9ff"),
            note(105, 302, "Tags live on ports and travel to ordinary cables. The tree edge remains a separate structural relation."),
        ])
        return svg(title, "PROPOSAL · semantic tags belong to the port, then inherit to the cable", body)
    if kind == "subtree":
        body = "".join([
            tag(95, 91, "System", "#a9cbff"), tag(175, 91, "Pick", "#a9cbff"), tag(242, 91, "Approach", "#a9cbff"),
            node(86, 150, 262, 82, "SubTree: Approach", "subtree", "⌄  jump to definition"),
            node(574, 150, 262, 82, "Definition: Approach", "subtree", "inputs / outputs explicit"),
            port(348, 177, "target", "out", "data"), port(574, 177, "target", "in", "data"), port(348, 208, "result", "out", "result"), port(574, 208, "result", "in", "result"),
            data_edge(354, 177, 568, 177, "binding"), data_edge(354, 208, 568, 208, "binding"),
            note(86, 285, "Caller/definition boundary and mapping are visible; matching names may be suggested, never implicit."),
        ])
        return svg(title, "PROPOSAL · reusable definition, visible boundary, clickable depth", body)
    if kind == "insert":
        body = "".join([
            node(80, 148, 190, 52, "Sequence", "control"), node(650, 148, 190, 52, "Commit", "task"),
            '<circle cx="455" cy="174" r="27" fill="#1d75d1" stroke="#8ec9ff" stroke-width="3"/><text x="455" y="184" text-anchor="middle" class="svg-plus">+</text>',
            '<rect x="318" y="238" width="274" height="66" rx="12" fill="#152a3c" stroke="#54a9ff" stroke-width="2"/>',
            '<text x="340" y="264" class="svg-node">⌕  Add behavior here…</text><text x="340" y="287" class="svg-detail">Task · Guard · SubTree · policy</text>',
            data_edge(270, 174, 428, 174), data_edge(482, 174, 650, 174), note(80, 105, "legal child slot"),
        ])
        return svg(title, "PROPOSAL · exact-slot insert first, library second", body)
    if kind == "diagnostics":
        body = "".join([
            node(91, 125, 245, 75, "Parallel", "control", "failure threshold: ?"),
            '<rect x="105" y="219" width="220" height="44" rx="9" fill="#4e2531" stroke="#ff9aaa"/><text x="122" y="246" class="svg-detail">✕ Choose 1…3 failures</text>',
            node(582, 125, 245, 75, "SubTree: Pick", "subtree", "cycle: Pick → Place → Pick"),
            '<rect x="596" y="219" width="220" height="44" rx="9" fill="#4e2531" stroke="#ff9aaa"/><text x="613" y="246" class="svg-detail">✕ Circular call path</text>',
            note(91, 302, "Local repair language beats unexplained red wires. Authoring remains editable until a real runtime needs to reject it."),
        ])
        return svg(title, "PROPOSAL · exact structural errors, exact repair", body)
    if kind == "disabled":
        body = "".join([
            node(109, 133, 230, 65, "Sense", "task", "enabled"),
            '<g opacity=".48">' + node(345, 133, 230, 65, "Slow calibration", "disabled", "skipped by adapter") + '</g>',
            '<rect x="409" y="110" width="99" height="25" rx="12" fill="#3f4d55" stroke="#a5b5bf"/><text x="458" y="127" text-anchor="middle" class="svg-tag">SKIPPED</text>',
            node(581, 133, 230, 65, "Approach", "task", "enabled"),
            data_edge(339, 166, 345, 166), data_edge(575, 166, 581, 166),
            note(109, 264, "Skip is reversible view/definition state; the node stays legible in the authored tree and visible in a trace."),
        ])
        return svg(title, "PROPOSAL · disable without deleting or pretending success", body)
    if kind == "railway":
        body = "".join([
            node(115, 121, 240, 95, "Decode payload", "task", "returns Result[Pose, DecodeError]"),
            node(585, 121, 220, 95, "Use pose", "task", "normal input"),
            port(355, 151, "value", "out", "result"), port(585, 151, "value", "in", "result"),
            port(355, 190, "error", "out", "result"), node(558, 250, 247, 48, "Report / recover", "task", "ordinary data consumer"),
            port(558, 274, "error", "in", "result"), data_edge(361, 151, 579, 151, "Result value"), data_edge(361, 190, 558, 274, "DecodeError"),
            note(115, 302, "No special top-side exception rail. BT Failure is a control result; domain errors remain normal typed data."),
        ])
        return svg(title, "PROPOSAL · railway data stays on ordinary ports and cables", body)
    if kind == "clock":
        body = "".join([
            node(83, 134, 182, 70, "Clock", "root", "10 Hz · phase 0"),
            '<path d="M109 170 h15 v-17 h16 v17 h16 v-17 h16 v17 h15" fill="none" stroke="#f7ae58" stroke-width="3"/>',
            node(632, 134, 202, 70, "Refresh state", "task", "BT task leaf"),
            port(265, 170, "tick", "out", "event"), port(632, 170, "trigger", "in", "event"), data_edge(271, 170, 626, 170, "event"),
            tag(363, 207, "event", "#f7ae58"), note(83, 273, "Add only with an actual RuntimeAdapter scheduler; an event tag uses the usual data-wire grammar."),
        ])
        return svg(title, "PROPOSAL · a clock emits ordinary event-tagged data", body)
    if kind == "palette":
        body = "".join([
            '<rect x="75" y="102" width="343" height="174" rx="14" fill="#102537" stroke="#54a9ff" stroke-width="2"/>',
            '<text x="101" y="135" class="svg-node">⌕  add after “Sense”</text>',
            tag(103, 158, "Task", "#74e0cb"), tag(171, 158, "Guard", "#f4cc70"), tag(247, 158, "SubTree", "#ffe48a"),
            '<rect x="102" y="193" width="286" height="39" rx="8" fill="#173d3b"/><text x="120" y="218" class="svg-detail">●  Estimate pose  ·  perception</text>',
            node(590, 137, 235, 72, "Sequence", "control", "exact insertion place"), note(590, 263, "Search rank: compatible kind, tag, source, favorite"),
        ])
        return svg(title, "PROPOSAL · compact, type-aware picker, not a vendor catalogue", body)
    if kind == "inspector":
        body = "".join([
            node(72, 127, 286, 102, "Approach", "task", "source: robot.py:42"), port(358, 157, "target Pose", "out", "state"), port(358, 198, "status", "out", "result"),
            '<rect x="500" y="84" width="332" height="211" rx="15" fill="#0e2434" stroke="#3a5f78" stroke-width="2"/>',
            '<text x="526" y="117" class="svg-node">Inspector · Approach</text>',
            '<text x="526" y="151" class="svg-detail">target   Pose     required</text><text x="526" y="179" class="svg-detail">tag      state    source-backed</text><text x="526" y="207" class="svg-detail">docs     Open reference ↗</text><text x="526" y="235" class="svg-detail">uses     4 callers · jump</text><text x="526" y="263" class="svg-detail">policy   cancellation: safe</text>',
        ])
        return svg(title, "PROPOSAL · inspect the contract and provenance, never a second canvas", body)
    if kind == "portdetail":
        body = "".join([
            node(88, 132, 300, 106, "Move to pose", "task", "2 visible ports"), port(388, 159, "pose", "out", "state"), port(388, 197, "speed", "out", "data"),
            '<rect x="545" y="108" width="280" height="142" rx="12" fill="#102537" stroke="#3a5f78"/><text x="570" y="140" class="svg-node">Port detail</text>',
            tag(570, 161, "Compact", "#54a9ff"), tag(671, 161, "2", "#54a9ff"), tag(709, 161, "All", "#54a9ff"),
            '<path d="M572 213 H792" stroke="#476b80" stroke-width="7" stroke-linecap="round"/><circle cx="650" cy="213" r="11" fill="#54a9ff"/>',
            note(88, 288, "This only changes disclosure. Required/default/type/tag truth remains available in the inspector."),
        ])
        return svg(title, "PROPOSAL · density control without hiding the contract", body)
    if kind == "breadcrumbs":
        body = "".join([
            tag(78, 101, "SystemSketch", "#a9cbff"), note(191, 116, "/"), tag(215, 101, "Pick", "#a9cbff"), note(278, 116, "/"), tag(300, 101, "Place", "#a9cbff"), note(369, 116, "/"), tag(390, 101, "Approach", "#a9cbff"),
            node(95, 181, 240, 58, "SubTree reference", "subtree", "click breadcrumb to jump"), node(586, 181, 240, 58, "Definition: Approach", "subtree", "depth = 3"),
            data_edge(335, 210, 586, 210, "jump / return"), note(95, 290, "Depth and back/forward history serve different questions; breadcrumbs make ancestry direct and readable."),
        ])
        return svg(title, "PROPOSAL · ancestry is visible, direct, and clickable", body)
    if kind == "editing":
        body = "".join([
            node(93, 130, 190, 60, "Task A", "task"), node(365, 130, 190, 60, "Task B", "task"), node(637, 130, 190, 60, "Task C", "task"),
            '<rect x="350" y="113" width="221" height="94" rx="14" fill="none" stroke="#54a9ff" stroke-width="3" stroke-dasharray="7 6"/>',
            '<text x="365" y="242" class="svg-note">⇧ drag moves child order</text><text x="365" y="271" class="svg-note">⌘C / ⌘V · Duplicate · Undo</text>',
            note(93, 307, "Use existing canvas conventions where possible; root/imported nodes get tree-aware safety rather than a separate gesture vocabulary."),
        ])
        return svg(title, "PROPOSAL · conventional selection with tree-aware rules", body)
    if kind == "focus":
        body = "".join([
            '<rect x="67" y="103" width="787" height="170" rx="16" fill="#0c2030" stroke="#38576b"/>',
            node(152, 147, 175, 55, "Parent", "subtree"), node(375, 147, 175, 55, "Selected", "task"), node(598, 147, 175, 55, "Child", "task"),
            '<rect x="363" y="135" width="199" height="79" rx="12" fill="none" stroke="#54a9ff" stroke-width="4"/>',
            tag(93, 294, "Fit tree", "#54a9ff"), tag(183, 294, "Focus active", "#54a9ff"), tag(306, 294, "Reveal parent", "#54a9ff"), tag(445, 294, "Relayout", "#54a9ff"),
        ])
        return svg(title, "PROPOSAL · stable layout commands change presentation, not meaning", body)
    if kind == "modes":
        body = "".join([
            '<rect x="95" y="104" width="730" height="52" rx="13" fill="#102537" stroke="#3a5f78"/>',
            '<text x="132" y="137" class="svg-node">AUTHOR</text><text x="362" y="137" class="svg-node" fill="#98a9b4">MONITOR</text><text x="608" y="137" class="svg-node" fill="#98a9b4">REPLAY</text>',
            '<rect x="111" y="149" width="182" height="7" rx="4" fill="#54a9ff"/>',
            node(130, 205, 220, 54, "Editable definition", "task"), node(350, 205, 220, 54, "Live read-only state", "disabled"), node(570, 205, 220, 54, "Immutable trace", "disabled"),
            note(95, 303, "One canonical definition; modes stop a live run or recorded evidence from quietly changing author intent."),
        ])
        return svg(title, "PROPOSAL · author, monitor, and replay are explicitly separate", body)
    if kind == "runtime":
        body = "".join([
            '<rect x="80" y="99" width="287" height="68" rx="15" fill="#103c43" stroke="#74e0cb" stroke-width="2"/><text x="104" y="129" class="svg-node">RuntimeAdapter: local sim</text><text x="104" y="151" class="svg-detail">● connected · safe to pause</text>',
            tag(82, 194, "Run", "#7fe3b1"), tag(145, 194, "Pause", "#f7ae58"), tag(225, 194, "Stop", "#ff9aaa"), tag(292, 194, "Step", "#54a9ff"),
            node(565, 109, 245, 52, "Sequence", "control", "RUNNING · tick 124"), node(610, 217, 155, 48, "Task", "task", "SUCCESS"), control_edge(687, 161, 687, 217),
            data_edge(367, 133, 565, 133, "status events"), note(80, 304, "Runtime buttons only exist when an adapter owns the lifecycle and states its connection identity."),
        ])
        return svg(title, "PROPOSAL · explicit adapter first, runtime controls second", body)
    if kind == "trace":
        dots = "".join(f'<circle cx="{144 + i * 70}" cy="202" r="10" fill="{["#7fe3b1", "#f7ae58", "#7fe3b1", "#ff9aaa", "#7fe3b1"][i % 5]}"/>' for i in range(9))
        body = "".join([
            '<rect x="81" y="96" width="747" height="196" rx="15" fill="#0d2333" stroke="#3a5f78"/>',
            '<text x="107" y="128" class="svg-node">Trace · run #42</text>', tag(647, 108, "2×", "#54a9ff"), tag(702, 108, "Filter", "#54a9ff"),
            '<path d="M128 202 H783" stroke="#395a70" stroke-width="5" stroke-linecap="round"/>' + dots,
            '<path d="M410 168 V242" stroke="#e4ecf2" stroke-width="2"/><text x="421" y="178" class="svg-detail">00:04.2</text>',
            '<text x="129" y="259" class="svg-note">status transitions · running duration · node/path/tag/time filters</text>',
        ])
        return svg(title, "PROPOSAL · trace evidence is recorded separately from the tree", body)
    if kind == "breakpoint":
        body = "".join([
            node(108, 132, 230, 56, "Await approval", "policy", "message: confirm placement"),
            node(578, 132, 230, 56, "Place", "task", "paused before tick"), data_edge(338, 160, 578, 160, "runtime pauses here"),
            '<rect x="300" y="223" width="320" height="69" rx="13" fill="#182c3a" stroke="#f7ae58" stroke-width="2"/><text x="323" y="250" class="svg-node">Paused · tick 28 · safe context</text><text x="323" y="276" class="svg-detail">Resume       Stop       Inspect values</text>',
            note(108, 319, "Persist author breakpoints as a profile; test-only forced results and fault injection never modify the definition."),
        ])
        return svg(title, "PROPOSAL · pause is visible, contextual, and runtime-owned", body)
    if kind == "probe":
        body = "".join([
            '<rect x="92" y="108" width="293" height="180" rx="14" fill="#17263b" stroke="#a783ff" stroke-width="2"/><text x="116" y="140" class="svg-node">Scope: Pick / Approach</text><text x="116" y="175" class="svg-detail">pose  Pose      13:04:21</text><text x="116" y="204" class="svg-detail">owner EstimatePose</text><text x="116" y="233" class="svg-detail">readers  Approach · Validate</text><text x="116" y="262" class="svg-detail">writer   EstimatePose</text>',
            node(565, 129, 215, 54, "Estimate pose", "task"), node(565, 226, 215, 54, "Approach", "task"), port(565, 156, "pose", "in", "state"), port(565, 253, "pose", "in", "state"),
            data_edge(385, 178, 559, 156, "state"), data_edge(385, 220, 559, 253, "state"),
            note(92, 319, "Probe a declared scope/key through actual readers/writers instead of starting with a global key/value dump."),
        ])
        return svg(title, "PROPOSAL · scoped provenance lens, not a hidden global Blackboard", body)
    if kind == "project":
        body = "".join([
            '<rect x="76" y="93" width="282" height="205" rx="14" fill="#102537" stroke="#3a5f78"/><text x="100" y="126" class="svg-node">Definitions</text><text x="105" y="160" class="svg-detail">▾  Pick</text><text x="128" y="187" class="svg-detail">▾  Approach</text><text x="152" y="214" class="svg-detail">◇  EstimatePose</text><text x="152" y="241" class="svg-detail">◇  Validate</text><text x="105" y="269" class="svg-detail">▸  Place</text>',
            '<rect x="533" y="93" width="307" height="205" rx="14" fill="#102537" stroke="#3a5f78"/><text x="557" y="126" class="svg-node">Block schema · EstimatePose</text><text x="557" y="160" class="svg-detail">inputs   scene: Scene</text><text x="557" y="188" class="svg-detail">outputs  pose: Pose</text><text x="557" y="216" class="svg-detail">tag      state</text><text x="557" y="244" class="svg-detail">source   python / package</text><text x="557" y="272" class="svg-detail">↗ open docs · 4 uses</text>',
            data_edge(358, 196, 533, 196, "select model"),
        ])
        return svg(title, "PROPOSAL · definition browser and source-backed model, not XML-first chrome", body)
    if kind == "panes":
        body = "".join([
            '<rect x="76" y="94" width="767" height="203" rx="15" fill="#102030" stroke="#3a5f78"/>',
            '<rect x="94" y="113" width="460" height="166" rx="9" fill="#0a1722" stroke="#285068"/><text x="115" y="142" class="svg-detail">canvas / selected lens</text>',
            '<rect x="572" y="113" width="252" height="75" rx="9" fill="#162a3b" stroke="#54a9ff"/><text x="594" y="144" class="svg-node">Inspector</text><text x="594" y="166" class="svg-detail">temporary / selection-linked</text>',
            '<rect x="572" y="204" width="252" height="75" rx="9" fill="#162a3b" stroke="#54a9ff"/><text x="594" y="235" class="svg-node">Trace / Probe</text><text x="594" y="257" class="svg-detail">open when useful</text>',
            note(76, 322, "Retain lens flexibility while FigJam-like UI direction remains a product choice; do not freeze a six-pane desktop shell yet."),
        ])
        return svg(title, "PROPOSAL · temporary lenses over a premature permanent workbench", body)
    raise ValueError(f"Unknown proposal kind: {kind}")


canvas_entries = [
    {
        "id": "A01", "title": "Root and ordered control children", "decision": "Copy", "effort": "M · authoring core", "kind": "root",
        "description": "A behavior tree needs one persisted root and an ordered parent→child relation. That relation means tick priority and eligibility; it is deliberately distinct from a value cable.",
        "evidence": [
            ("bt-atlas-moveit-node-taxonomy-2026-09-04.png", "MoveIt Studio Pro’s official node taxonomy", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 tree canvas with Root and Sequence", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "A02", "title": "Task and Guard leaves", "decision": "Copy", "effort": "M · authoring core", "kind": "task",
        "description": "Tasks perform a skill and may be running; Guards answer a read-only question and have a simpler outcome contract. Both should expose their typed inputs/outputs and source provenance instead of hiding behavior inside an opaque box.",
        "evidence": [
            ("bt-atlas-moveit-node-taxonomy-2026-09-04.png", "MoveIt’s Action, Control, Decorator, and Subtree classes", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 action models with visible IN/OUT rows", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "A03", "title": "Sequence with visible execution policy", "decision": "Copy / adapt", "effort": "M · authoring core", "kind": "sequence",
        "description": "Sequence is the primary “then” control: it visits children in order while they succeed. Keep one visual form and expose memory/reactive/async policy as a named property rather than splitting the palette into look-alike variants.",
        "evidence": [
            ("bt-atlas-moveit-control-2026-09-04.png", "MoveIt Studio Pro control-node examples", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP’s documented RUNNING tree state", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "A04", "title": "Fallback / Selector for expected recovery", "decision": "Copy / adapt", "effort": "M · authoring core", "kind": "fallback",
        "description": "Fallback is the primary alternative/recovery container: a normal failure of one child causes the next candidate to be tried. It should make priority and restart policy legible without turning normal failure into a top-side exception effect.",
        "evidence": [
            ("bt-atlas-moveit-control-2026-09-04.png", "MoveIt Studio Pro’s control-node examples", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP lifecycle-state example", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "A05", "title": "Parallel with explicit threshold and cancellation policy", "decision": "Later / adapt", "effort": "L · runtime-dependent", "kind": "parallel",
        "description": "Parallel is useful only when its success/failure threshold, scheduling, and remaining-child cancellation are visible. Do not imply that a tree drawing means safe concurrent execution before the RuntimeAdapter can enforce it.",
        "evidence": [
            ("bt-atlas-moveit-control-2026-09-04.png", "MoveIt Studio Pro’s Parallel control example", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP execution-state reference", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "A06", "title": "One-child decorator as a policy wrapper", "decision": "Copy / adapt", "effort": "M · authoring core", "kind": "decorator",
        "description": "A decorator owns exactly one child and changes its tick or terminal-outcome policy. Make a readable wrapper shape, start with Guard/Retry/Repeat/Run once, and defer Timeout/Delay until the adapter has an honest lifecycle.",
        "evidence": [
            ("bt-atlas-moveit-decorator-2026-09-04.png", "MoveIt Studio Pro decorator-node examples", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-btcpp-prepost-2026-09-04.png", "BehaviorTree.CPP pre/post-condition example", "BehaviorTree.CPP · pre/post conditions", BTCPP_PREPOST),
        ],
    },
    {
        "id": "A07", "title": "Typed ports whose semantic tags travel to normal wires", "decision": "Copy strongly", "effort": "M · contract model", "kind": "ports",
        "description": "Port definition owns direction, type, required/default state, documentation, provenance, and semantic tag. A port’s `data`, `event`, `state`, `configuration`, or `result/error` tag should transfer to its ordinary cable; the behavior-tree edge stays structural.",
        "evidence": [
            ("bt-atlas-moveit-subtree-port-2026-09-04.png", "MoveIt Studio Pro Subtree port inspector", "MoveIt Pro · Perception & ML tutorial", MOVEIT_PERCEPTION),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 typed model and port fields", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
            ("bt-atlas-btcpp-explicit-ports-2026-09-04.png", "BehaviorTree.CPP explicit ports/dataflow illustration", "BehaviorTree.CPP · Ports vs Blackboard", BTCPP_PORTS),
        ],
    },
    {
        "id": "A08", "title": "SubTree call, explicit mapping, and breadcrumb boundary", "decision": "Copy strongly", "effort": "L · reuse/navigation", "kind": "subtree",
        "description": "A SubTree is a reusable definition called from a parent, not merely a collapsed pile of shapes. Make its call boundary, typed mappings, source, collapse state, jump-to-definition, and clickable ancestry visible.",
        "evidence": [
            ("bt-atlas-moveit-subtree-extract-2026-09-04.png", "MoveIt Studio Pro’s Convert to Subtree dialog", "MoveIt Pro · Perception & ML tutorial", MOVEIT_PERCEPTION),
            ("bt-atlas-btcpp-subtree-2026-09-04.png", "BehaviorTree.CPP reusable SubTree", "BehaviorTree.CPP · SubTrees", BTCPP_SUBTREE),
            ("bt-atlas-btcpp-port-remapping-2026-09-04.png", "BehaviorTree.CPP explicit SubTree port remapping", "BehaviorTree.CPP · SubTree ports", BTCPP_REMAP),
        ],
    },
    {
        "id": "A09", "title": "Contextual structural insert and reorder", "decision": "Copy", "effort": "M · authoring affordance", "kind": "insert",
        "description": "A quiet plus at an exact legal child slot should open a searchable picker, then place the new child with deterministic relayout. The full library stays available, but the normal flow answers “what can I place here?” first.",
        "evidence": [
            ("bt-atlas-moveit-insert-2026-09-04.png", "MoveIt Studio Pro blue plus insertion affordance", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-moveit-search-2026-09-04.png", "MoveIt Studio Pro searchable behavior picker", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "A10", "title": "Validity and repair diagnostics", "decision": "Copy", "effort": "M · authoring core", "kind": "diagnostics",
        "description": "The editor should explain malformed root/arity/nesting, missing required bindings, type errors, unresolved behavior models, and SubTree cycles before a runtime call fails. A concrete repair sentence belongs next to the incompatible fact.",
        "evidence": [
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro’s structured tree editor", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 model-aware tree editor", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "A11", "title": "Disable / skip without deletion", "decision": "Copy / adapt", "effort": "S · authoring affordance", "kind": "disabled",
        "description": "A reversible Skip state lets a person isolate work while keeping intent and hierarchy visible. The adapter should show the skip in monitor/trace mode; it must not silently convert the node into a fake successful task.",
        "evidence": [
            ("bt-atlas-moveit-disabled-2026-09-04.png", "MoveIt Studio Pro visibly disabled behavior", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "A12", "title": "Railway outcomes are normal data; BT status is separate", "decision": "Copy the distinction", "effort": "S · semantic boundary", "kind": "railway",
        "description": "A leaf can output a normal typed result/error value through ordinary ports, while its `RUNNING/SUCCESS/FAILURE` is its control outcome. That preserves your railway-programming stance without inventing a top-side exception wire.",
        "evidence": [
            ("bt-atlas-moveit-node-taxonomy-2026-09-04.png", "MoveIt’s documented node categories", "MoveIt Pro · Behavior Trees", MOVEIT_CONCEPTS),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP RUNNING state diagram", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "A13", "title": "Clock / trigger source as ordinary event-tagged data", "decision": "Later", "effort": "M · runtime adapter", "kind": "clock",
        "description": "A stock Clock/Trigger source is useful once SystemSketch has a real scheduler: it emits typed event data at a visible rate. It does not require a second event-wire grammar or a behavior-tree-specific side channel.",
        "evidence": [
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP’s long-running execution state", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro tree authoring canvas", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "A14", "title": "Scoped data watch, not a global Blackboard default", "decision": "Adapt later", "effort": "M · runtime/provenance", "kind": "probe",
        "description": "A focused watch can show current value, type, timestamp, owner scope, declared readers, and writers. The normal authored path remains explicit port/cable mapping, which is exactly the dataflow clarity BehaviorTree.CPP itself recommends.",
        "evidence": [
            ("bt-atlas-moveit-blackboard-2026-09-04.png", "MoveIt Studio Pro Blackboard view", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-btcpp-explicit-ports-2026-09-04.png", "BehaviorTree.CPP’s explicit-port illustration", "BehaviorTree.CPP · Ports vs Blackboard", BTCPP_PORTS),
        ],
    },
]


control_entries = [
    {
        "id": "B01", "title": "Type-aware searchable behavior picker", "decision": "Copy", "effort": "M · authoring affordance", "kind": "palette",
        "description": "The picker should search by name, behavior kind, port tag, source, favorite, and description, then insert only at legal structural locations. Copy the contextual search model, not a 600-node robotics library.",
        "evidence": [
            ("bt-atlas-moveit-search-2026-09-04.png", "MoveIt Studio Pro behavior search", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2’s categories/models panel", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "B02", "title": "Inspector: parameters, tags, source docs, and uses", "decision": "Copy / adapt", "effort": "M · contract model", "kind": "inspector",
        "description": "Selection should reveal node name, parameter/default binding, type, semantic tag, policy, description, source link, provenance, and uses. This is a focused lens beside the canvas, not a parallel diagram.",
        "evidence": [
            ("bt-atlas-moveit-subtree-port-2026-09-04.png", "MoveIt Studio Pro’s selected-node port inspector", "MoveIt Pro · Perception & ML tutorial", MOVEIT_PERCEPTION),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 visible typed model fields", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "B03", "title": "Port-detail disclosure level", "decision": "Copy", "effort": "S · presentation", "kind": "portdetail",
        "description": "Tree cards should default to a compact amount of port detail, with no-port through all-port disclosure controls. This only changes what is shown; required/default/tag/provenance truth remains inspectable.",
        "evidence": [
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro tree cards and bottom editing chrome", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "B04", "title": "Definitions browser and nested breadcrumbs", "decision": "Copy strongly", "effort": "L · reuse/navigation", "kind": "breadcrumbs",
        "description": "A lightweight definitions browser makes named SubTrees and reusable behavior models findable; breadcrumbs make the current ancestry and direct return path obvious. This is the navigation counterpart to the depth/Step In work you already liked.",
        "evidence": [
            ("bt-atlas-moveit-back-parent-2026-09-04.png", "MoveIt Studio Pro return-to-parent navigation", "MoveIt Pro · Perception & ML tutorial", MOVEIT_PERCEPTION),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 project/tree navigator", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "B05", "title": "Selection, duplicate, reorder, delete, undo/redo", "decision": "Copy conventional behavior", "effort": "M · authoring affordance", "kind": "editing",
        "description": "Reuse existing tldraw conventions wherever they fit, with tree-aware guardrails for roots, imported/read-only definitions, child ordering, and structural drop validity. Users should not have to learn a miniature editor inside the editor.",
        "evidence": [
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro’s compact canvas action/undo chrome", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "B06", "title": "Fit, focus, reveal, and deterministic relayout", "decision": "Copy", "effort": "S · presentation", "kind": "focus",
        "description": "Useful compact commands are Fit tree, Focus active, Reveal parent/children, and Relayout. Relayout must change only presentation—never child order, port mapping, or runtime semantics.",
        "evidence": [
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro editor navigation controls", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 overview/tree canvas", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "B07", "title": "Separate Author, Monitor, and Replay modes", "decision": "Copy strongly", "effort": "M · product boundary", "kind": "modes",
        "description": "Editing changes the definition; Monitor observes a live execution; Replay explores recorded immutable evidence. Their explicit separation prevents a debugging session or trace from silently becoming an authoring change.",
        "evidence": [
            ("bt-atlas-moveit-panes-2026-09-04.png", "MoveIt Studio Pro’s multi-lens workspace", "MoveIt Pro · About the user interface", MOVEIT_UI),
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 editor surface", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
        ],
    },
    {
        "id": "B08", "title": "RuntimeAdapter-owned Run / Pause / Stop / Step / Loop", "decision": "Later, high priority", "effort": "L · real runtime", "kind": "runtime",
        "description": "Run controls are valuable only when an explicit RuntimeAdapter identifies what executor is connected, what it can safely pause, and what scope it controls. The toolbar is runtime evidence, not decorative chrome.",
        "evidence": [
            ("bt-atlas-moveit-breakpoint-2026-09-04.png", "MoveIt Studio Pro behavior tree with breakpoint workflow", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP running-node state", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "B09", "title": "Live status, active path, duration, and visit count", "decision": "Later, high priority", "effort": "L · runtime", "kind": "runtime",
        "description": "A live overlay should show text-plus-color status, active tick path, last transition, running duration, and visit/outcome counts. This is a read-only overlay on the canonical tree, never a separately edited runtime picture.",
        "evidence": [
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP RUNNING state reference", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
            ("bt-atlas-moveit-editor-2026-09-04.png", "MoveIt Studio Pro runtime/edit canvas vocabulary", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "B10", "title": "Record, filter, replay, and compare runtime traces", "decision": "Later, high priority", "effort": "L · runtime", "kind": "trace",
        "description": "Groot’s record/replay model is worth copying: record transitions separately, scrub at different speeds, and filter by node/path/tag/status/time. A trace must state which adapter/run/version produced it.",
        "evidence": [
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2’s actual tree editor UI", "Groot2 · product capabilities include monitor/log replay", GROOT),
            ("bt-atlas-btcpp-running-2026-09-04.png", "BehaviorTree.CPP runtime-state illustration", "BehaviorTree.CPP · asynchronous nodes", BTCPP_ASYNC),
        ],
    },
    {
        "id": "B11", "title": "Breakpoint / Await approval and safe test overrides", "decision": "Later", "effort": "M · runtime/test", "kind": "breakpoint",
        "description": "A labeled Await approval leaf can make a purposeful pause explicit, while adapter controls Resume/Stop. Store debug breakpoints and forced outcomes as separate profiles/traces, not hidden mutations of the behavior definition.",
        "evidence": [
            ("bt-atlas-moveit-breakpoint-2026-09-04.png", "MoveIt Studio Pro’s placed breakpoint", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-moveit-search-2026-09-04.png", "MoveIt Studio Pro’s breakpoint behavior picker", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
        ],
    },
    {
        "id": "B12", "title": "Scoped Data Watch / Probe", "decision": "Adapt later", "effort": "M · runtime/provenance", "kind": "probe",
        "description": "Use a focused probe to connect current state to its declared source, scope, readers, writers, and last update. It harvests the debugging benefit of MoveIt/Groot Blackboard views without making a hidden global key/value store the authored truth.",
        "evidence": [
            ("bt-atlas-moveit-blackboard-2026-09-04.png", "MoveIt Studio Pro Blackboard pane", "MoveIt Pro · Intro tutorial", MOVEIT_TUTORIAL),
            ("bt-atlas-btcpp-explicit-ports-2026-09-04.png", "BehaviorTree.CPP’s explicit dataflow alternative", "BehaviorTree.CPP · Ports vs Blackboard", BTCPP_PORTS),
        ],
    },
    {
        "id": "B13", "title": "Source-backed behavior model / schema import", "decision": "Adapt later", "effort": "M · PyBlocks/source project", "kind": "project",
        "description": "Groot’s model import demonstrates the right underlying need: a registry of behavior type, port direction/type, description, and source. SystemSketch should link a Python/project model and show an optional generated representation; XML is not the primary UI.",
        "evidence": [
            ("bt-atlas-groot-model-2026-09-04.png", "Groot2 TreeNodesModel categories and typed ports", "BehaviorTree.CPP · Groot integration", BTCPP_GROOT),
            ("bt-atlas-moveit-subtree-port-2026-09-04.png", "MoveIt Studio Pro source/port inspector", "MoveIt Pro · Perception & ML tutorial", MOVEIT_PERCEPTION),
        ],
    },
    {
        "id": "B14", "title": "Temporary lenses, not a frozen multi-pane IDE", "decision": "Defer / adapt", "effort": "S · UI direction", "kind": "panes",
        "description": "MoveIt proves that multiple lenses are useful; it does not require SystemSketch to copy its 1–6 pane workbench. Keep inspector/probe/trace portable or selection-linked until the FigJam/right-panel interaction settles through real use.",
        "evidence": [
            ("bt-atlas-moveit-panes-2026-09-04.png", "MoveIt Studio Pro configurable-pane overview", "MoveIt Pro · About the user interface", MOVEIT_UI),
        ],
    },
]


already_have = [
    {
        "id": "H01", "title": "Block / port / cable grammar", "description": "SystemSketch already has an actual editable Block with typed input/output rows and a details inspector. The BT proposal should use this grammar for local data contracts rather than inventing a visually separate data plane.",
        "image": ("port-outline-gallery-expanded-view-2026-09-03.png", "Existing SystemSketch Block port view and inspector", "SystemSketch · port-outline gallery", "port-outline-gallery-2026-09-03.html"),
    },
    {
        "id": "H02", "title": "Ordinary left-to-right data wiring inside a container", "description": "SystemSketch already demonstrates local data flow as ordinary ports and cables within a larger container. A behavior tree should add top-to-bottom control structure alongside it, not erase or imitate it with Blackboard names.",
        "image": ("block-collapse-expanded-2026-09-01.png", "Existing SystemSketch expanded container with port-connected children", "SystemSketch · Block collapse gallery", "block-collapse-2026-09-01.html"),
    },
    {
        "id": "H03", "title": "Retained behavior-tree research, not shipped product", "description": "The existing representation gallery already establishes one canonical definition plus Tree, Process, and Data Contract lenses. It is research only: the authoring/runtime capability reviewed in this atlas is still missing from `main`.",
        "image": ("port-outline-gallery-expanded-view-2026-09-03.png", "Existing SystemSketch canvas used only as baseline evidence", "SystemSketch · current canvas baseline", "behavior-tree-representations-research-2026-09-04.html"),
    },
]


not_useful = [
    ("Global invisible Blackboard as the routine authored bus", "BT.CPP’s own guidance prefers explicit ports; a hidden global store contradicts SystemSketch provenance and data-cable goals."),
    ("MoveIt’s robot teleoperation, 3D scene, camera, planner, and hardware shells", "These are excellent robot-operations features, but not behavior-tree authoring kernel features."),
    ("A copied 200+ robotics behavior palette", "Copy a source-backed registry and documentation mechanism, not a vendor-specific library."),
    ("BT.CPP XML or mini-script language as the canonical canvas representation", "A future importer/exporter is useful; XML-first authoring and an inline language create a second, hidden code surface."),
    ("Special event or error wires", "Events/state/configuration/results are port semantic tags on ordinary data cables; railway error values are normal data."),
    ("Freehand tick wires and arbitrary control graph cycles", "A tree’s structural relation needs validation and deterministic layout; only ordinary data cables remain freely routed."),
    ("A special exception rail leaving the top of a leaf", "BT status controls the tree; domain error values are normal typed data, matching Zach’s railway programming direction."),
    ("Decorative Run / Pause / Step before a runtime exists", "Runtime controls must be owned by an explicit adapter with an observable connection and safety state."),
    ("Permanent six-pane desktop layout now", "Keep the underlying lenses flexible while the FigJam/right-panel behavior remains an open UI choice."),
    ("Colour-only execution state", "Use textual state, time, count, and trace evidence; colour is supporting signal, not the sole channel."),
    ("Unbounded fault injection as normal authoring", "Forced outcomes and dummy substitution are strong test tools, but must remain conspicuous, runtime-only, and non-persistent."),
]


# This is deliberately more literal than the proposal dictionary above. It
# makes the native BT.CPP vocabulary auditably complete while avoiding the
# false promise that SystemSketch needs one palette icon per upstream variant.
NATIVE_CATALOG = [
    ("Sequence family", "Sequence · SequenceWithMemory · ReactiveSequence · AsyncSequence", "One Sequence card + named executionPolicy", "Copy / adapt"),
    ("Fallback family", "Fallback · ReactiveFallback · AsyncFallback", "One Fallback card + named executionPolicy", "Copy / adapt"),
    ("Parallel family", "Parallel · ParallelAll", "One Parallel card + success/failure/cancel policy", "Later"),
    ("Conditional controls", "IfThenElse · WhileDoElse", "Branch container + one-shot/reactive semantics", "Adapt later"),
    ("Switch family", "Switch2 … Switch6", "Variable-arity Case instead of six fixed arities", "Adapt"),
    ("Decorator outcome mapping", "Inverter · ForceSuccess · ForceFailure", "Policy wrapper with explicit terminal mapping", "Later"),
    ("Decorator retry/repeat", "Repeat · RetryUntilSuccessful · KeepRunningUntilFailure · RunOnce", "Named policy parameters; only tick-safe forms", "Adapt later"),
    ("Decorator timing", "Delay · Timeout", "Visible duration/cancellation policy, backed by RuntimeAdapter", "Later"),
    ("Pre/post conditions", "Precondition and script-backed pre/post rules", "Visible Guard/result-policy attachment; no mini script language", "Adapt"),
    ("SubTree / scope", "SubTree · port remapping · default/autoremap", "Named definition call + visible mapping; suggestions never magic", "Copy strongly"),
    ("Blackboard micro-nodes", "SetBlackboard · update/wait/sleep/loop helpers", "Normal tagged ports/cables + runtime clock/trigger when justified", "Do not literal-copy"),
    ("Try / cleanup", "TryCatch", "Railway result/error data plus an eventual cleanup policy", "Do not literal-copy"),
]


SOURCE_INDEX = [
    ("MoveIt Pro — Behavior Trees", MOVEIT_CONCEPTS, "node taxonomy; Objective/Subtree/Behavior terminology; Action/Condition/Control/Decorator status semantics"),
    ("MoveIt Pro — Tutorial 1: Intro & Basic Usage", MOVEIT_TUTORIAL, "editor, contextual plus/search, drag/reorder, parameters, port visibility, skip, run/stop/breakpoint, Blackboard"),
    ("MoveIt Pro — Perception & ML tutorial", MOVEIT_PERCEPTION, "SubTree extraction, typed subtree ports, selected-node inspector, parent return navigation"),
    ("MoveIt Pro — About the user interface", MOVEIT_UI, "configurable panes and multiple view roles"),
    ("MoveIt Pro — Keyboard shortcuts", MOVEIT_SHORTCUTS, "selection, copy/paste, deletion, undo/redo"),
    ("MoveIt Pro — Breakpoints", MOVEIT_BREAKPOINTS, "runtime pause/resume/stop behavior and breakpoint scope"),
    ("MoveIt Pro — Blackboard debugging", MOVEIT_BLACKBOARD, "scoped runtime name/type/value inspection"),
    ("MoveIt Studio Pro 10.0 release notes", MOVEIT_RELEASE_10, "current structured insertion/re-layout and runtime presentation details"),
    ("BehaviorTree.CPP — Basics", BTCPP_BASICS, "root tick, leaf/internal distinction, lifecycle status"),
    ("BehaviorTree.CPP — Nodes library", BTCPP_NODES, "Parallel, conditional controls, Switch, Decorators, Fallbacks, Sequences"),
    ("BehaviorTree.CPP — Ports vs Blackboard", BTCPP_PORTS, "explicit-port dataflow rationale and warning against direct Blackboard access"),
    ("BehaviorTree.CPP — Decorators", BTCPP_DECORATORS, "single-child decorator semantics"),
    ("BehaviorTree.CPP — Conditional control nodes", BTCPP_CONDITIONAL, "one-shot IfThenElse vs reactive WhileDoElse"),
    ("BehaviorTree.CPP — SubTrees", BTCPP_SUBTREE, "reusable tree calls"),
    ("BehaviorTree.CPP — SubTree ports", BTCPP_REMAP, "visible port remapping"),
    ("BehaviorTree.CPP — Groot integration", BTCPP_GROOT, "TreeNodesModel, typed port metadata, runtime publisher"),
    ("Groot2", GROOT, "drag/drop editor; multi-file/split view; monitor, transition log, replay, trace metrics/filtering, breakpoint/test capabilities"),
    ("BehaviorTree.CPP — Asynchronous nodes", BTCPP_ASYNC, "RUNNING lifecycle illustration and execution boundary"),
    ("BehaviorTree.CPP — Pre/post conditions", BTCPP_PREPOST, "pre/post policy concepts; source for adaptation boundary"),
]


def entry_html(entry: dict[str, object], ordinal: int) -> str:
    evidence = "\n".join(source_image(*item) for item in entry["evidence"])
    decision = str(entry["decision"])
    tone = "copy" if decision.startswith("Copy") else "adapt" if "adapt" in decision.lower() else "later"
    return f'''<article class="dictionary-entry" data-decision="{h(tone)}" id="{h(entry['id'])}">
      <header class="entry-header">
        <div><span class="entry-id">{h(entry['id'])}</span><h3>{h(entry['title'])}</h3></div>
        <div class="entry-meta">{pill(decision, tone)} {pill(str(entry['effort']), 'effort')}</div>
      </header>
      <section class="entry-copy"><span class="part-number">1</span><div><h4>Plain-language description</h4><p>{h(entry['description'])}</p></div></section>
      <section class="entry-evidence"><span class="part-number">2</span><div><h4>Official reference evidence</h4><div class="evidence-grid evidence-{len(entry['evidence'])}">{evidence}</div></div></section>
      <section class="entry-proposal"><span class="part-number">3</span><div><h4>SystemSketch proposal <span class="original-label">ORIGINAL DRAWING</span></h4>{proposal(str(entry['kind']), str(entry['title']))}</div></section>
    </article>'''


def existing_html(item: dict[str, object]) -> str:
    filename, alt, label, url = item["image"]
    return f'''<article class="existing-entry" id="{h(item['id'])}">
      <header><span class="entry-id">{h(item['id'])}</span><h3>{h(item['title'])}</h3>{pill('Already have', 'existing')}</header>
      <p>{h(item['description'])}</p>
      {system_image(filename, alt, label, url)}
    </article>'''


all_assets = {
    filename
    for collection in (canvas_entries, control_entries)
    for item in collection
    for filename, _, _, _ in item["evidence"]
}
all_assets.update(item["image"][0] for item in already_have)
IMAGE_DATA = {filename: asset_data(filename) for filename in sorted(all_assets)}


STYLE = r'''
:root {
  --ink:#eaf4fa; --muted:#9db3c1; --canvas:#06111b; --panel:#0c1c29; --panel2:#102636;
  --line:#24485c; --copy:#78e2c6; --adapt:#a9c7ff; --later:#f4c879; --existing:#b5d7ff;
  --magenta:#f28dc3; --violet:#c69cff; --blue:#57adff; --orange:#f4ae62; --green:#7fe3b1;
}
*{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:radial-gradient(ellipse 1000px 600px at 90% -10%,#183f55 0,transparent 67%),var(--canvas);color:var(--ink);font:16px/1.58 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:#9cdaff;text-underline-offset:3px} a:hover{color:#e1f3ff}.shell{width:min(1240px,calc(100% - 42px));margin:auto}.topbar{position:sticky;top:0;z-index:20;background:rgba(6,17,27,.91);backdrop-filter:blur(14px);border-bottom:1px solid #1a3c4e}.topbar-inner{display:flex;align-items:center;gap:22px;min-height:58px}.brand{font-weight:800;letter-spacing:-.025em;color:#eaf6ff;text-decoration:none}.topnav{display:flex;gap:16px;flex:1;overflow:auto}.topnav a{font-size:.82rem;color:#9ab4c6;text-decoration:none;white-space:nowrap}.topnav a:hover{color:#fff}.report-date{font:700 .74rem/1 Inter,sans-serif;color:#7fe3b1;letter-spacing:.12em;white-space:nowrap}
main{padding:54px 0 100px}.eyebrow{color:#7fe3b1;font-size:.75rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.12fr .88fr;gap:34px;align-items:end;padding:15px 0 46px}.hero h1{max-width:12ch;margin:.38rem 0 1rem;font-size:clamp(3.2rem,7vw,6.6rem);line-height:.88;letter-spacing:-.068em}.lede{max-width:59ch;margin:0;color:#b8ceda;font-size:1.14rem}.hero-aside{padding:22px;border:1px solid #2a5870;border-radius:18px;background:linear-gradient(145deg,#123044,#0d1b2a)}.hero-aside h2{margin:0 0 9px;font-size:1.08rem}.hero-aside p{margin:0;color:#bad0dc}.hero-aside strong{color:#fff}.research-lineage{margin-top:15px!important;padding-top:14px;border-top:1px solid #2d566e;font-size:.82rem}.section{margin-top:58px}.section-header{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.section h2{margin:.22rem 0 0;font-size:clamp(1.8rem,4vw,3rem);line-height:1.03;letter-spacing:-.045em}.section-intro{max-width:70ch;color:#a9bfcb}.decision-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.decision-card{border:1px solid var(--line);border-top:3px solid var(--accent);border-radius:14px;background:linear-gradient(150deg,#102536,#0b1925);padding:18px}.decision-card h3{margin:0 0 8px;font-size:1rem}.decision-card p{margin:0;color:var(--muted);font-size:.91rem}.scorecard{margin:25px 0;padding:21px;border:1px solid #2b566b;border-radius:16px;background:#0b1c2a}.scorecard h3{margin:0 0 8px}.scorecard p{margin:0;color:#b3c7d2}.criteria{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:16px}.criterion{padding:12px;border-radius:10px;background:#102536;border:1px solid #254b60}.criterion b{display:block;color:#f8fdff;font-size:.83rem}.criterion span{color:#7fe3b1;font-weight:800;font-size:.8rem}.criterion small{display:block;color:#9cb2be;font-size:.78rem;line-height:1.3;margin-top:5px}
.filterbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:22px 0 10px}.filterbar button{appearance:none;border:1px solid #365b70;background:#102535;color:#bdd1db;border-radius:999px;padding:8px 12px;font:700 .78rem Inter,sans-serif;cursor:pointer}.filterbar button[aria-pressed="true"]{border-color:#83d7ff;background:#174160;color:#fff}.dictionary-entry{margin:19px 0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:linear-gradient(130deg,#0d1d2a,#091722)}.entry-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:21px 24px 18px;border-bottom:1px solid #214355;background:linear-gradient(100deg,#11293a,#0c1d2b)}.entry-header h3,.existing-entry h3{margin:5px 0 0;font-size:1.27rem;letter-spacing:-.025em}.entry-id{display:inline-block;color:#7fe3b1;font:800 .78rem/1 Inter,sans-serif;letter-spacing:.12em}.entry-meta{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.pill{display:inline-block;border:1px solid #45677a;border-radius:999px;padding:4px 9px;font:800 .7rem/1.1 Inter,sans-serif;letter-spacing:.045em;text-transform:uppercase;color:#cfe0e9;white-space:nowrap}.pill-copy{border-color:#4fae97;color:#9af1d8;background:#123a36}.pill-adapt{border-color:#638abf;color:#c9dcff;background:#182c4a}.pill-later{border-color:#b78d49;color:#ffd98e;background:#3d321d}.pill-effort{border-color:#4d6170;color:#abc0cc;background:#18242d}.pill-existing{border-color:#65a7d4;color:#c5e7ff;background:#15344a}.entry-copy,.entry-evidence,.entry-proposal{display:grid;grid-template-columns:37px minmax(0,1fr);gap:13px;padding:20px 24px}.entry-evidence{border-top:1px solid #1d4051;background:#081722}.entry-proposal{border-top:1px solid #1d4051;background:#091b27}.part-number{display:flex;justify-content:center;align-items:flex-start;width:27px;height:27px;border-radius:50%;background:#17364a;color:#9cdaff;font:800 .78rem/27px Inter,sans-serif}.entry-copy h4,.entry-evidence h4,.entry-proposal h4{margin:1px 0 8px;font-size:.9rem;color:#d8eaf2;letter-spacing:.01em}.entry-copy p{max-width:82ch;margin:0;color:#b2c5d0}.original-label{margin-left:8px;color:#7fe3b1;font:800 .65rem/1 Inter,sans-serif;letter-spacing:.13em}.evidence-grid{display:grid;gap:12px}.evidence-1{grid-template-columns:minmax(0,760px)}.evidence-2{grid-template-columns:repeat(2,minmax(0,1fr))}.evidence-3{grid-template-columns:repeat(3,minmax(0,1fr))}.evidence-card{min-width:0;margin:0;border:1px solid #274c60;border-radius:13px;overflow:hidden;background:#091620}.source-chip{display:inline-block;position:absolute;z-index:2;margin:10px;padding:4px 7px;border-radius:5px;background:#103448;color:#9cdaff;font:800 .6rem/1 Inter,sans-serif;letter-spacing:.09em}.source-system{background:#194767;color:#c6eaff}.reference-image{display:block;width:100%;max-height:310px;object-fit:contain;object-position:center;background:#061019}.evidence-card figcaption{padding:10px 12px;color:#98afbc;font-size:.76rem;line-height:1.4;overflow-wrap:anywhere}.evidence-card figcaption strong{color:#d4e6ef}.proposal-svg{display:block;width:100%;height:auto;min-height:230px;border:1px solid #274c60;border-radius:14px;background:#07121d}.svg-title{fill:#eaf4fa;font:800 18px Inter,system-ui,sans-serif}.svg-sub{fill:#87a7ba;font:13px Inter,system-ui,sans-serif}.svg-node{fill:#f1f7fb;font:700 16px Inter,system-ui,sans-serif}.svg-detail{fill:#c0d4de;font:12px Inter,system-ui,sans-serif}.svg-port{fill:#bad0da;font:12px Inter,system-ui,sans-serif}.svg-wire{fill:#86c8ff;font:700 11px Inter,system-ui,sans-serif}.svg-tag{fill:#c5ddeb;font:700 11px Inter,system-ui,sans-serif}.svg-note{font:13px Inter,system-ui,sans-serif}.svg-plus{fill:#fff;font:800 34px Inter,system-ui,sans-serif}
.already-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.existing-entry{border:1px solid #2b5269;border-radius:16px;overflow:hidden;background:#0d1e2b}.existing-entry header{padding:18px 18px 0}.existing-entry p{min-height:111px;margin:12px 18px 18px;color:#adc2ce;font-size:.93rem}.existing-entry .evidence-card{margin:0;border-width:1px 0 0;border-radius:0}.native-catalog{margin:28px 0 0;padding:22px;border:1px solid #34566b;border-radius:17px;background:linear-gradient(130deg,#102535,#0a1924)}.native-catalog h3{margin:4px 0 7px;font-size:1.22rem}.native-catalog p{max-width:80ch;margin:0;color:#a9bfca}.catalog-scroll{overflow:auto;margin-top:18px;border:1px solid #2b4e62;border-radius:11px}.catalog-table{width:100%;min-width:800px;border-collapse:collapse;background:#0b1924;font-size:.83rem}.catalog-table th,.catalog-table td{padding:11px;text-align:left;vertical-align:top;border-bottom:1px solid #24475a}.catalog-table thead th{background:#153044;color:#d8edf6;font-size:.69rem;letter-spacing:.08em;text-transform:uppercase}.catalog-table tbody th{color:#cde2ec;width:17%;font-size:.79rem}.catalog-table td{color:#a7bdc8}.catalog-table code{color:#f1c879;font:inherit}.catalog-table tr:last-child th,.catalog-table tr:last-child td{border-bottom:0}.not-useful{columns:2;gap:15px}.not-useful article{break-inside:avoid;margin:0 0 12px;padding:15px;border:1px solid #334452;border-radius:12px;background:#111b23}.not-useful h3{margin:0 0 5px;color:#d9e2e7;font-size:.95rem}.not-useful p{margin:0;color:#9eafb8;font-size:.88rem}.roadmap{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;counter-reset:road}.roadmap article{position:relative;min-height:184px;padding:17px;border:1px solid var(--line);border-radius:14px;background:#0d1e2b}.roadmap article::before{content:counter(road);counter-increment:road;display:block;width:27px;height:27px;border-radius:50%;background:#21475b;color:#e7f5fb;text-align:center;font:800 .83rem/27px Inter,sans-serif}.roadmap h3{margin:11px 0 6px;font-size:1rem}.roadmap p{margin:0;color:#a5bac5;font-size:.87rem}.thinking{display:grid;grid-template-columns:1fr 1fr;gap:12px}.thinking article{padding:17px 18px;border-radius:13px;border-left:3px solid #7fe3b1;background:#102536}.thinking h3{margin:0 0 7px;font-size:1rem}.thinking p{margin:0;color:#b6cbd5}.surface{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #31556a;border-radius:14px;overflow:hidden;background:#0c1b28}.surface th,.surface td{padding:14px;text-align:left;vertical-align:top;border-bottom:1px solid #2a4c5e}.surface th{width:22%;background:#11293a;color:#cde4ef;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em}.surface td{color:#aac0ca}.surface tr:last-child th,.surface tr:last-child td{border-bottom:0}.source-index{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.source-item{display:grid;grid-template-columns:34px 1fr;gap:10px;padding:13px;border:1px solid #284c60;border-radius:12px;background:#0d1c29}.source-number{width:25px;height:25px;border-radius:50%;background:#1d4259;color:#ccecff;text-align:center;font:800 .74rem/25px Inter,sans-serif}.source-item a{font-weight:700}.source-item p{margin:4px 0 0;color:#9cb1bd;font-size:.8rem}.method{margin-top:20px;padding:18px;border:1px dashed #3d6174;border-radius:14px;color:#a8c0ca;background:#0c1c28}.method p{margin:0}.footnote{margin:45px 0 0;color:#718996;font-size:.83rem}.hidden{display:none!important}
@media(max-width:900px){.hero{grid-template-columns:1fr}.decision-grid,.criteria,.roadmap{grid-template-columns:repeat(2,1fr)}.evidence-3{grid-template-columns:1fr}.already-grid{grid-template-columns:1fr}.source-index{grid-template-columns:1fr}.not-useful{columns:1}}@media(max-width:650px){.shell{width:min(100% - 24px,1240px)}main{padding-top:30px}.topbar-inner{gap:11px}.topnav{display:none}.hero h1{font-size:3.2rem}.decision-grid,.criteria,.roadmap,.thinking{grid-template-columns:1fr}.entry-header{padding:18px;display:block}.entry-meta{justify-content:flex-start;margin-top:11px}.entry-copy,.entry-evidence,.entry-proposal{grid-template-columns:27px minmax(0,1fr);padding:17px}.evidence-2{grid-template-columns:1fr}.reference-image{max-height:270px}.section-header{display:block}.section-intro{margin-top:11px}.surface,.surface tbody,.surface tr,.surface th,.surface td{display:block}.surface th{width:auto}.surface td{border-bottom:1px solid #2a4c5e}.report-date{display:none}}
'''


def source_index_html() -> str:
    return "\n".join(
        f'''<article class="source-item"><div class="source-number">{index}</div><div><a href="{h(url)}">{h(label)}</a><p>{h(note)}</p></div></article>'''
        for index, (label, url, note) in enumerate(SOURCE_INDEX, start=1)
    )


def not_useful_html() -> str:
    return "\n".join(f'<article><h3>{h(title)}</h3><p>{h(reason)}</p></article>' for title, reason in not_useful)


def catalog_html() -> str:
    rows = "\n".join(
        f'<tr><th>{h(family)}</th><td><code>{h(source_names)}</code></td><td>{h(proposal_name)}</td><td>{h(decision)}</td></tr>'
        for family, source_names, proposal_name, decision in NATIVE_CATALOG
    )
    return f'''<aside class="native-catalog"><div><div class="eyebrow">Literal completeness check</div><h3>BT.CPP native node family → SystemSketch normalization</h3><p>The upstream names are enumerated here so “small starting palette” is a conscious compression, not an accidental omission. See the <a href="{BTCPP_NODES}">official Nodes Library</a> for the category source.</p></div><div class="catalog-scroll"><table class="catalog-table"><thead><tr><th>Family</th><th>Upstream native names</th><th>SystemSketch form</th><th>Decision</th></tr></thead><tbody>{rows}</tbody></table></div></aside>'''


def build() -> str:
    images_json = json.dumps(IMAGE_DATA, separators=(",", ":"))
    canvas_html = "\n".join(entry_html(entry, index) for index, entry in enumerate(canvas_entries, start=1))
    controls_html = "\n".join(entry_html(entry, index) for index, entry in enumerate(control_entries, start=1))
    existing = "\n".join(existing_html(item) for item in already_have)
    return dedent(f'''<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Behavior Trees · MoveIt Studio Pro / BT.CPP / Groot2 prior-art atlas</title><style>{STYLE}</style></head>
    <body><header class="topbar"><div class="shell topbar-inner"><a class="brand" href="#top">SystemSketch · BT atlas</a><nav class="topnav"><a href="#decision">Decision</a><a href="#baseline">Already have</a><a href="#canvas">Canvas dictionary</a><a href="#controls">Controls dictionary</a><a href="#not-useful">Deliberate non-goals</a><a href="#sources">Sources</a></nav><span class="report-date">04 SEP 2026</span></div></header>
    <main id="top" class="shell"><section class="hero"><div><div class="eyebrow">Deep research · primary-source visual dictionary</div><h1>Copy the control grammar. Keep the dataflow honest.</h1><p class="lede">MoveIt Studio Pro, BehaviorTree.CPP, and Groot2 converge on the durable parts of a behavior-tree editor: hierarchy, typed leaf contracts, local insertion, reusable SubTrees, and runtime evidence. SystemSketch should borrow those—not their hidden-blackboard-first architecture or robot-specific workbench.</p></div><aside class="hero-aside"><h2>Decision in one sentence</h2><p><strong>One canonical `BehaviorTreeDefinition`</strong> projects into top→bottom Tree View, selected left→right Data Contract View, and read-only Runtime/Trace evidence. Events, state, configuration, and railway results remain normal tagged data cables; only tick/priority is structural.</p><p class="research-lineage">Related history: <a href="behavior-tree-representations-research-2026-09-04.html">earlier representation research</a> · <a href="gap-analysis-prototype-review-hub-2026-09-04.html">retained prototype review hub</a></p></aside></section>
    <section id="decision" class="section"><div class="section-header"><div><div class="eyebrow">Reading rule</div><h2>Borrow the small semantic core—not the whole workstation.</h2></div></div><div class="decision-grid"><article class="decision-card" style="--accent:var(--copy)"><h3>Copy</h3><p>Control hierarchy, typed contracts, SubTree boundaries, exact-slot insert/search, collapse/layout, and later runtime evidence.</p></article><article class="decision-card" style="--accent:var(--adapt)"><h3>Adapt</h3><p>Blackboard into scoped provenance, library into source-backed models, XML preview into a future Python/project view.</p></article><article class="decision-card" style="--accent:var(--later)"><h3>Later</h3><p>Parallel scheduling, runtime controls, breakpoint/step, trace/replay, probes, fault injection, and clock source.</p></article><article class="decision-card" style="--accent:var(--magenta)"><h3>Reject</h3><p>Global implicit bus, special error/event cables, copied robotics palette/shell, freehand tick edges, and fake runtime chrome.</p></article></div><div class="scorecard"><h3>Decision criteria before feature enthusiasm</h3><p>Every entry was weighed against execution truth, explicit data provenance, authoring clarity, reuse/navigation, and the honesty of its runtime boundary.</p><div class="criteria"><div class="criterion"><span>30%</span><b>Execution truth</b><small>ordering, cancellation, status</small></div><div class="criterion"><span>25%</span><b>Data provenance</b><small>typed ports and visible wires</small></div><div class="criterion"><span>20%</span><b>Authoring clarity</b><small>build/reorder without a giant palette</small></div><div class="criterion"><span>15%</span><b>Reuse / navigation</b><small>SubTree boundaries and depth</small></div><div class="criterion"><span>10%</span><b>Runtime honesty</b><small>no decorative controls</small></div></div></div></section>
    <section id="baseline" class="section"><div class="section-header"><div><div class="eyebrow">Baseline · merged main</div><h2>Already have: the local data grammar—not BT authoring.</h2></div><p class="section-intro">`main` currently contains general SystemSketch Block/port/cable behavior and a behavior-tree representation research gallery. It does not contain shipped editable BT hierarchy, SubTrees, runtime, or Groot/BT.CPP integration; retained prototype tracks are deliberately not counted as product.</p></div><div class="already-grid">{existing}</div></section>
    <section id="canvas" class="section"><div class="section-header"><div><div class="eyebrow">Track A · on-canvas node and relationship dictionary</div><h2>The behavior-tree shape SystemSketch should actually author.</h2></div><p class="section-intro">Every useful item is deliberately written in the required order: a plain-language claim, one or more official source-tool captures, then an original SystemSketch rendering proposal. Screenshots are evidence; sketches are not vendor redraws.</p></div><div class="filterbar" aria-label="Filter recommendations"><button type="button" data-filter="all" aria-pressed="true">All {len(canvas_entries) + len(control_entries)}</button><button type="button" data-filter="copy" aria-pressed="false">Copy</button><button type="button" data-filter="adapt" aria-pressed="false">Adapt</button><button type="button" data-filter="later" aria-pressed="false">Later</button></div>{canvas_html}{catalog_html()}</section>
    <section id="controls" class="section"><div class="section-header"><div><div class="eyebrow">Track B · outside-canvas and runtime control dictionary</div><h2>Menus, inspectors, navigation, and execution evidence.</h2></div><p class="section-intro">This is the missing counterpart to a canvas-only comparison: it distinguishes compact authoring controls worth copying now from runtime/test controls that only make sense once a real adapter exists.</p></div>{controls_html}</section>
    <section id="not-useful" class="section"><div class="section-header"><div><div class="eyebrow">Compact exclusions</div><h2>Missing, deliberately not useful as defaults.</h2></div><p class="section-intro">No screenshots or speculative mockups here: these are explicit non-goals, not features waiting for polish.</p></div><div class="not-useful">{not_useful_html()}</div></section>
    <section id="roadmap" class="section"><div class="section-header"><div><div class="eyebrow">Order of operations</div><h2>Build the definition before the dashboard.</h2></div></div><div class="roadmap"><article><h3>Canonical tree</h3><p>Root, ordered children, Task, Guard, Sequence, Fallback, Branch, policy wrapper, SubTree, deterministic layout, validity.</p></article><article><h3>Contracts + reuse</h3><p>Typed/tagged ports, defaults, source/provenance, mappings, breadcrumbs, cycle detection.</p></article><article><h3>Authoring affordances</h3><p>Contextual add/search, legal reorder, collapse, disclosure level, tree-safe conventional editing.</p></article><article><h3>Runtime adapter</h3><p>Run/Pause/Stop, status overlay, first Clock/Trigger source, probe, recorded trace and replay.</p></article><article><h3>Advanced runtime</h3><p>Breakpoint/step, metrics, test overrides, source model import, eventual BT.CPP XML bridge.</p></article></div></section>
    <section id="thinking" class="section"><div class="section-header"><div><div class="eyebrow">Your thinking, sharpened</div><h2>The prior art reinforces your best constraints.</h2></div></div><div class="thinking"><article><h3>Events remain data.</h3><p>An `event` tag belongs to a port and inherits onto a normal cable. The BT edge answers a separate question: which child may tick next.</p></article><article><h3>Railway errors remain data.</h3><p>A `Result[T, E]` or explicit error port is ordinary dataflow. BT failure is the leaf’s control result, not an exception cable from its top.</p></article><article><h3>State/config should be explicit.</h3><p>Use typed caller-supplied state/config ports and visible remappings. A scoped value watch is for debugging/provenance, not hidden authored coupling.</p></article><article><h3>Breadcrumbs earn their place.</h3><p>A SubTree is a real named definition boundary; clickable ancestry answers where you are and jumps to any depth immediately.</p></article><article><h3>Clock is a runtime primitive.</h3><p>It becomes a stock block only when a real scheduler exists, then emits ordinary event-tagged data with visible rate/phase configuration.</p></article><article><h3>One definition, focused lenses.</h3><p>Tree View owns priority, Data Contract View owns provenance, and Trace owns evidence. None should be a manually maintained duplicate.</p></article></div></section>
    <section id="surface" class="section"><div class="section-header"><div><div class="eyebrow">Decision surface</div><h2>What this research settled—and what it did not.</h2></div></div><table class="surface"><tbody><tr><th>Done</th><td>Primary-source catalogue, 20 official captures, a full visual dictionary, normalized BT.CPP node families, and the copy/adapt/later/reject boundary.</td></tr><tr><th>Left unimplemented</th><td>All BT product features. Main currently has research only; retained authoring/projection tracks remain independently reviewable, not shipped.</td></tr><tr><th>Needs Zach</th><td>First editable form: intrinsic tldraw shape, structured container over stock Blocks, or another projection shell; Parallel’s first actual RuntimeAdapter contract; and final dock vs temporary-lens UI behavior.</td></tr><tr><th>Deliberately not done</th><td>Copied robotics workbench, XML-first authoring, implicit global Blackboard, special error/event wires, freehand structural edges, and decorative runtime buttons.</td></tr></tbody></table></section>
    <section id="sources" class="section"><div class="section-header"><div><div class="eyebrow">Primary source index</div><h2>Evidence is linked at the claim, and retained here in full.</h2></div></div><div class="source-index">{source_index_html()}</div><div class="method"><p><strong>Capture provenance.</strong> `node tools/capture_reference_screens.mjs --behavior-tree-atlas` drives disposable headless Chrome over official vendor documentation assets. The image asset is captured for legibility, while the documentation URL beneath it is the citation. This HTML embeds each capture once and loads it offline; every proposed SVG is explicitly SystemSketch-original.</p></div></section>
    <p class="footnote">Research synthesis, 04 September 2026. This report is not a claim that a behavior-tree editor has landed on `main`; it is an evidence-backed boundary for the next implementation pass. Canonical research source: <a href="behavior-tree-moveit-groot-prior-art-2026-09-04.md">Markdown report</a>.</p></main>
    <script>const IMAGE_DATA={images_json};for(const image of document.querySelectorAll('img[data-asset]')){{image.src=IMAGE_DATA[image.dataset.asset]||'';}}for(const button of document.querySelectorAll('[data-filter]')){{button.addEventListener('click',()=>{{const filter=button.dataset.filter;for(const candidate of document.querySelectorAll('[data-filter]'))candidate.setAttribute('aria-pressed',String(candidate===button));for(const entry of document.querySelectorAll('.dictionary-entry'))entry.classList.toggle('hidden',filter!=='all'&&entry.dataset.decision!==filter);}});}}</script>
    </body></html>''')


OUTPUT.write_text(build(), encoding="utf-8")
print(OUTPUT)
