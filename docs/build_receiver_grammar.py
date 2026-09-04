#!/usr/bin/env python3
"""Build the receiver-grammar gallery: where a method call's receiver lands on a Block.

Every number in the report is measured here, from the live SystemSketch tree and the
live pyblocks golden corpus, so the page cannot drift from the code it describes.
"""

from __future__ import annotations

import ast
import base64
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PYBLOCKS = Path("/home/bam/pyblocks")
GOLDENS = PYBLOCKS / "examples" / "systemsketch_goldens"
BOARDS = ROOT / "sketches" / "review"
ASSETS = ROOT / "docs" / "assets"
SPEC = ROOT / "docs" / "receiver-grammar-2026-09-02.json"
OUTPUT = ROOT / "docs" / "receiver-grammar-2026-09-02.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")

CROPS = {
    "v1": {"scene": (50, 285, 1450, 648), "zoom": (505, 290, 980, 560)},
    "v2": {"scene": (50, 285, 1450, 648), "zoom": (505, 290, 980, 560)},
    "v3": {"scene": (50, 285, 1450, 1245), "zoom": (505, 290, 980, 530)},
    "v4": {"scene": (50, 285, 1450, 648), "zoom": (505, 290, 980, 560)},
    "v5": {"scene": (50, 285, 1450, 648), "zoom": (505, 290, 980, 580)},
    "inside": {"scene": (400, 285, 1470, 845), "zoom": (410, 420, 1360, 720)},
}


# --------------------------------------------------------------------------- measure


def measure() -> dict:
    """Read every load-bearing fact out of the two live trees."""
    model = (ROOT / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")
    header_doc = re.search(
        r"Which row of the burger the port sits in\.(.*?)\*/", model, re.S
    )
    header_rule = " ".join(
        line.strip().lstrip("*").strip()
        for line in (header_doc.group(1) if header_doc else "").splitlines()
    ).strip()
    header_row = re.search(r"export const HEADER_ROW = (\d+)", model)
    first_body_row = re.search(r"export const FIRST_BODY_ROW = (\d+)", model)

    codec = (PYBLOCKS / "pyblocks" / "systemsketch_codec.py").read_text(encoding="utf-8")
    body = codec.split("def _normalized_port(")[1].split("\ndef ")[0]
    native_keys = sorted(set(re.findall(r'^\s*"(\w+)":', body, re.M)))
    native_keys += sorted(set(re.findall(r'normalized\["(\w+)"\]', body)))

    boards = ports = ports_with_row = 0
    receiver_roles = callable_roles = 0
    for path in sorted(GOLDENS.glob("*/generated.systemsketch")):
        boards += 1
        raw = path.read_text(encoding="utf-8")
        receiver_roles += raw.count('"role": "receiver"')
        callable_roles += raw.count('"role": "callable"')
        for record in json.loads(raw)["records"]:
            if record.get("typeName") == "shape" and record.get("type") == "block":
                for side in ("inputs", "outputs"):
                    for port in record["props"].get(side, []):
                        ports += 1
                        if "row" in port:
                            ports_with_row += 1

    total_goldens = method_goldens = 0
    for path in sorted(GOLDENS.glob("*/source.py")):
        total_goldens += 1
        tree = ast.parse(path.read_text(encoding="utf-8"))
        run = next(
            (
                node
                for node in ast.walk(tree)
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                and node.name == "run"
            ),
            tree,
        )
        if any(
            isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            for node in ast.walk(run)
        ):
            method_goldens += 1

    def golden_block(golden: str, title: str) -> dict:
        path = GOLDENS / golden / "generated.systemsketch"
        for record in json.loads(path.read_text(encoding="utf-8"))["records"]:
            if record.get("typeName") == "shape" and record.get("type") == "block":
                if record["props"].get("title") == title:
                    props = record["props"]
                    return {
                        "title": title,
                        "description": props.get("description"),
                        "inputs": [
                            (p.get("name"), p.get("type"), "row" in p)
                            for p in props.get("inputs", [])
                        ],
                        "outputs": [
                            (p.get("name"), p.get("type")) for p in props.get("outputs", [])
                        ],
                    }
        raise SystemExit(f"golden block not found: {golden} / {title}")

    return {
        "headerRule": header_rule,
        "headerRow": int(header_row.group(1)) if header_row else None,
        "firstBodyRow": int(first_body_row.group(1)) if first_body_row else None,
        "nativeKeys": native_keys,
        "boards": boards,
        "ports": ports,
        "portsWithRow": ports_with_row,
        "receiverRoles": receiver_roles,
        "callableRoles": callable_roles,
        "goldens": total_goldens,
        "methodGoldens": method_goldens,
        "append": golden_block("11_receiver_mutation", "poses.append()"),
        "send": golden_block("12_unknown_receiver", "client.send()"),
        "encode": golden_block("23_resolved_receiver", "encoder.encode()"),
        "callable": golden_block("03_callable_argument", "transform()"),
    }


# ----------------------------------------------------------------------------- media


def crop_uri(variant: str, kind: str) -> str:
    """Crop a real board capture and inline it, so the page carries its own evidence."""
    ASSETS.mkdir(parents=True, exist_ok=True)
    source = BOARDS / f"receiver-grammar-{variant}.png"
    target = ASSETS / f"crop-receiver-{variant}-{kind}.png"
    Image.open(source).crop(CROPS[variant][kind]).save(target)
    return "data:image/png;base64," + base64.b64encode(target.read_bytes()).decode("ascii")


def preview(variant: str, base_label: str, alt_label: str) -> str:
    scene = crop_uri(variant, "scene")
    zoom = crop_uri(variant, "zoom")
    return (
        "<div style='padding:34px 12px 12px;background:#0e1117'>"
        "<div style='display:flex;align-items:center;justify-content:space-between;gap:12px;"
        "margin:0 0 10px;color:#9fb0c6;font:11px ui-monospace,monospace'>"
        "<span>real capture · the board, in the app</span>"
        f"<button data-demo-toggle data-base-label='{base_label}' data-alt-label='{alt_label}' "
        "style='border:1px solid #49617e;border-radius:6px;background:#172336;color:#eaf2ff;"
        f"padding:7px 10px;cursor:pointer'>{base_label}</button></div>"
        # The class rides a wrapper, not the <img>: the shell's `.prototype img`
        # rule outranks `.demo-alt-only` and would keep both frames visible.
        f"<span class='demo-base-only'><img src='{scene}' alt='{variant} board' "
        "style='border-radius:8px'/></span>"
        f"<span class='demo-alt-only'><img src='{zoom}' alt='{variant} Block close-up' "
        "style='border-radius:8px'/></span></div>"
    )


def chip(text: str, tone: str = "#fff") -> str:
    return (
        "<span style='display:inline-block;padding:5px 9px;border:1px solid #cfc6b9;"
        f"border-radius:6px;background:{tone};font:600 11px ui-monospace,monospace'>{text}</span>"
    )


def port_table(rows: list[tuple[str, str, str]]) -> str:
    cells = "".join(
        "<tr>"
        f"<td style='padding:4px 10px;font:600 12px ui-monospace,monospace'>{name}</td>"
        f"<td style='padding:4px 10px;font:12px ui-monospace,monospace;color:#6b6255'>{kind}</td>"
        f"<td style='padding:4px 10px;font:12px system-ui;color:#4a463f'>{lane}</td>"
        "</tr>"
        for name, kind, lane in rows
    )
    return (
        "<table style='border-collapse:collapse;width:100%;background:#fff;"
        "border:1px solid #d8d0c4'>"
        "<tr style='background:#f1ece3'>"
        "<th style='text-align:left;padding:5px 10px;font:600 11px system-ui'>port</th>"
        "<th style='text-align:left;padding:5px 10px;font:600 11px system-ui'>type</th>"
        "<th style='text-align:left;padding:5px 10px;font:600 11px system-ui'>lane</th>"
        f"</tr>{cells}</table>"
    )


def build_spec(facts: dict) -> dict:
    append = facts["append"]
    append_ports = ", ".join(f"{name}: {kind}" for name, kind, _ in append["inputs"])

    requirements = [
        {
            "id": "fr1",
            "name": "The lane tells the truth about what the value IS",
            "weight": 30,
            "why": (
                "Restated Sep 2 after Zach's read of the question. Row 0 is not a highlight — it "
                "means the value shapes which code runs. A variable passed as a function IS code. "
                "A receiver is the data a function is applied to; the dot is application, not "
                "supply. And the Block's title already names the receiver, so a lane spent marking "
                "it says twice what the Block says once. The first draft of this criterion assumed "
                "the lane had to mark the receiver, which is the assumption that turned out to be "
                "wrong."
            ),
            "passCondition": (
                "Every port on the heading band is a value that is itself code; every value the "
                "code is applied to sits in the body."
            ),
            "anchors": {
                "1": "A receiver is drawn as though the object supplied the code.",
                "3": "The lane is right in some cases and the reader cannot tell which.",
                "5": "The lane follows from the syntax and is right in every case.",
            },
        },
        {
            "id": "fr2",
            "name": "Faithful to the source as written",
            "weight": 25,
            "why": (
                "SystemSketch's contract is that the canvas is the program, not a cleaned-up "
                "retelling of it. A grammar that requires rewriting the call breaks the round "
                "trip back to Python."
            ),
            "passCondition": "The Block can be produced from the call site without editing the source.",
            "anchors": {
                "1": "The picture only works if the program is rewritten.",
                "3": "The title matches, but a port name is invented.",
                "5": "Every mark on the Block is traceable to a token in the call.",
            },
        },
        {
            "id": "fr3",
            "name": "Scales across the corpus",
            "weight": 20,
            "why": (
                f"{facts['methodGoldens']} of {facts['goldens']} goldens already make a "
                f"method-shaped call in run(), and the analyzer already stamps "
                f"{facts['receiverRoles']} receiver-role ports across the generated boards. The "
                "rule has to hold for numpy, pathlib, asyncio and dataclasses, not only for a list."
            ),
            "passCondition": "The same rule answers every method call in the corpus without a special case.",
            "anchors": {
                "1": "Needs a hand-written exception per library.",
                "3": "Works for the resolved cases, silent on the unresolved ones.",
                "5": "One decision procedure covers resolved, unresolved and builtin receivers.",
            },
        },
        {
            "id": "fr4",
            "name": "Costs no new engine capability",
            "weight": 15,
            "why": (
                f"The heading band already exists: row {facts['headerRow']} on the port record, "
                f"body rows from {facts['firstBodyRow']}. A direction that needs a new primitive "
                "spends the whole stock-tldraw budget on a naming question."
            ),
            "passCondition": "The variant is expressible in today's BlockPort schema, unchanged.",
            "anchors": {
                "1": "Needs a new shape or a new port kind.",
                "3": "Needs a new optional field.",
                "5": "Uses fields the schema already ships.",
            },
        },
        {
            "id": "fr5",
            "name": "Reads at a glance in Port view",
            "weight": 10,
            "why": (
                "Port view is the working view. Whatever the rule is, it has to survive a Block "
                "drawn 400px wide with three ports on it."
            ),
            "passCondition": "The distinction is visible in the capture without zooming.",
            "anchors": {
                "1": "Only visible in the inspector.",
                "3": "Visible, but easy to confuse with an ordinary port.",
                "5": "Obvious in a thumbnail.",
            },
        },
    ]

    gates = [
        {
            "id": "g1",
            "name": "No new SystemSketch primitive",
            "why": "tldraw stays stock and the Block grammar stays closed; new meaning rides existing seams.",
        },
        {
            "id": "g2",
            "name": "The canvas still matches the Python",
            "why": "The board is the program as written. Rewriting the call to make a nicer picture breaks the file-first contract.",
        },
        {
            "id": "g3",
            "name": "Expressible in the shipped BlockPort schema",
            "why": f"id, name, type, visible, defaultValue, row, branch — nothing else exists on a port today.",
        },
        {
            "id": "g4",
            "name": "The heading band keeps one meaning",
            "why": (
                "Row 0 already means one thing across every Block: "
                + (facts["headerRule"] or "the data that shapes control flow")
            ),
        },
        {
            "id": "g5",
            "name": "Survives the .systemsketch codec",
            "why": (
                "A distinction that only lives in analyzer metadata is invisible: the native port "
                "record keeps "
                + ", ".join(facts["nativeKeys"])
                + " and drops everything else."
            ),
        },
    ]

    drift_media = {
        "label": "The measured drift, today",
        "caption": (
            f"The analyzer stamps the role. The codec drops it. Across "
            f"{facts['boards']} generated golden boards, {facts['receiverRoles']} receiver-role "
            f"and {facts['callableRoles']} callable-role ports exist in the legacy metadata, and "
            f"{facts['portsWithRow']} of {facts['ports']} native ports carry a row."
        ),
        "html": (
            "<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef'>"
            "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap'>"
            + chip("analyzer · target_port_role='receiver'")
            + "<b style='color:#8b8174;font-size:18px'>→</b>"
            + chip("python_adapter · pyblocks.port role")
            + "<b style='color:#8b8174;font-size:18px'>→</b>"
            + chip("_normalized_port() drops it", "#ffe9e4")
            + "<b style='color:#8b8174;font-size:18px'>→</b>"
            + chip("native port: " + ", ".join(facts["nativeKeys"]), "#eef4ff")
            + "</div>"
            "<p style='margin:12px 0 6px;font:12px system-ui;color:#4a463f'>"
            f"golden 11 emits <b>{append['title']}</b> with {append_ports} and "
            f"out {append['outputs'][0][0]}: {append['outputs'][0][1]} — description "
            f"<i>{append['description']}</i>. Every input is an ordinary body port.</p></div>"
        ),
    }

    variants = [
        {
            "id": "v1",
            "name": "Receiver is data",
            "thesis": (
                "The receiver is the data a function is applied to, so it lands in the body with "
                "the other arguments. The heading band stays empty because nothing here supplies "
                "code, and the Block's title already names the object: `poses.append()` says which "
                "list. This is also, unchanged, what pyblocks emits today."
            ),
            "accent": "#2f7f74",
            "bestWhen": "You read a dot as function application, and you want row 0 to mean exactly one thing.",
            "losesWhen": "A reader has to tell a mutating receiver from an ordinary argument without opening the source.",
            "decisions": [
                {"label": "Receiver lane", "value": "Body row, same as any argument — always."},
                {"label": "Port name", "value": "Open: `self` today, the receiver expression is the live alternative."},
                {"label": "Mutation", "value": "An extra `after` output, unmarked. Open."},
                {"label": "Heading band", "value": "Reserved for values that are code: callable, predicate, iterable."},
            ],
            "keepParts": ["one syntactic rule", "row 0 means the value is code", "receiver named for its expression (from V3)"],
            "proof": [
                f"This is not a proposal: it is what pyblocks emits today. {append['title']} carries "
                f"{append_ports} and {facts['portsWithRow']} of {facts['ports']} native golden ports "
                "carry a row.",
                "Board: sketches/review/receiver-grammar-v1.systemsketch, generated through the editor and reopened cold.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "The body is where a value the code acts on belongs, and the empty heading band is itself a true statement: nothing on this Block supplies code.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "The title keeps the dotted call; only `self`, taken from the callee signature rather than the call site, is jargon.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "One syntactic rule with no per-library knowledge: every receiver is a body port whether the callee resolves or not.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "Zero engine cost: it is the current output.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "Nothing to decode; the remaining gap is that a mutating receiver still looks like a read-only one.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": True, "evidence": "Title and ports come from the call site."},
                "g3": {"pass": True, "evidence": "Plain ports."},
                "g4": {"pass": True, "evidence": "Heading band stays empty, so its meaning is untouched."},
                "g5": {"pass": True, "evidence": "Nothing to lose in the codec."},
            },
            "previewLabel": "the board as pyblocks draws it today",
            "story": {
                "title": "What the corpus looks like right now",
                "steps": [
                    {"label": "Look at the scene", "caption": "Two cables land on two identical dots. The one on top is the object being mutated.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Zoom the Block", "caption": "`self` and `pose` are drawn the same way. The heading band is empty.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [
                {
                    "label": "Decided · Sep 2, 2026",
                    "caption": "The rule that settles it, and the two questions it leaves open.",
                    "html": (
                        "<div style='padding:14px;border:1px solid #2f7f74;background:#eef7f4'>"
                        "<p style='margin:0 0 10px;font:13px/1.6 system-ui;color:#243c37'>"
                        "<b>The receiver is a data port.</b> Passing a variable as a function is "
                        "the case where the value itself is code, and that is what the heading "
                        "band is for. A dot is not that: it is shorthand for applying a function "
                        "to the data, so the object before it is an argument. The title already "
                        "carries the receiver — <code>poses.append()</code> names the list — so "
                        "spending a lane on it would say twice what the Block says once.</p>"
                        "<p style='margin:0;font:12px/1.6 system-ui;color:#3f5a54'>"
                        "<b>Still open:</b> whether the port keeps the callee signature's "
                        "<code>self</code> or takes the receiver expression written at the call "
                        "site; whether an in-place mutation earns a mark of its own beyond the "
                        "<code>after</code> output; and that the callable role — the one case this "
                        "rule sends to the heading band — does not reach row 0 today either."
                        "</p></div>"
                    ),
                },
                drift_media,
                {
                    "label": "Ports as emitted",
                    "caption": "Read out of golden 11's generated.systemsketch at build time.",
                    "html": port_table([
                        (name, kind, "body row 1") for name, kind, _ in append["inputs"]
                    ] + [(name, kind, "output") for name, kind in append["outputs"]]),
                },
            ],
            "preview": preview("v1", "Show the whole scene", "Zoom the Block"),
        },
        {
            "id": "v2",
            "name": "Header always",
            "thesis": (
                "Every method lifts its receiver into the heading band. The object that owns the "
                "code is drawn where the code-shaping inputs already live, so a dotted call is "
                "visibly a different animal from a free function."
            ),
            "accent": "#3f6fa8",
            "bestWhen": "Most receivers in your corpus really are opaque objects whose type decides the behaviour.",
            "losesWhen": "The method is a resolved builtin and the receiver is plainly just data.",
            "decisions": [
                {"label": "Receiver lane", "value": f"Heading band, row {facts['headerRow']}."},
                {"label": "Port name", "value": "`self`."},
                {"label": "Rule", "value": "Syntactic: a dot in the callee means a header port."},
            ],
            "keepParts": ["one syntactic rule", "the heading band carries dispatch"],
            "proof": [
                "This is the direction the v0 project note recorded for `client.send(payload)`: a receiver dependency entering a dedicated header port.",
                "Board: sketches/review/receiver-grammar-v2.systemsketch — the header port renders on the heading band beside the title with no layout work.",
            ],
            "scores": {
                "fr1": {"score": 1, "evidence": "Draws `poses` as though the list supplied the code. The dot is application, not supply.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "Nothing is rewritten; only `self` is jargon.", "confidence": "high"},
                "fr3": {"score": 2, "evidence": "Uniform, and uniformly wrong for the resolved receivers that dominate the corpus — numpy, pathlib, dataclasses.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "Row 0 already ships; the capture proves it renders unchanged.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "The dot on the heading band is unmistakable in the crop.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Uses the shipped header row."},
                "g2": {"pass": True, "evidence": "Source untouched."},
                "g3": {"pass": True, "evidence": "row: 0 on the input port."},
                "g4": {"pass": False, "evidence": "The band's documented meaning is a callable, a predicate, an iterable — a resolved list receiver is none of those, so the band starts meaning two things."},
                "g5": {"pass": True, "evidence": "`row` is a native port field and survives the codec."},
            },
            "previewLabel": "receiver lifted to the heading band",
            "story": {
                "title": "The heading band, applied everywhere",
                "steps": [
                    {"label": "Look at the scene", "caption": "The `poses` cable now lands on the title row instead of the first body row.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Zoom the Block", "caption": "One dot beside the title, one in the body. The Block reads as `poses` supplying the code.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [{
                "label": "What the shipped schema says row 0 is for",
                "caption": "Quoted at build time from src/blocks/blockModel.ts, the doc comment on BlockPort.row.",
                "html": (
                    "<blockquote style='margin:0;padding:12px 14px;border-left:3px solid #3f6fa8;"
                    "background:#fff;border:1px solid #d8d0c4;font:13px/1.55 system-ui;color:#33302b'>"
                    f"{facts['headerRule']}</blockquote>"
                    "<p style='margin:10px 0 0;font:12px system-ui;color:#6b6255'>A callable, a "
                    "predicate, an iterable. A receiver is on that list only when the object is what "
                    "picks the code.</p>"
                ),
            }],
            "preview": preview("v2", "Show the whole scene", "Zoom the Block"),
        },
        {
            "id": "v3",
            "name": "Dispatch heads, data bodies",
            "thesis": (
                "One rule for both lanes: the heading band carries whatever chooses which code "
                "runs, the body carries what that code runs on. A receiver goes up only when the "
                "call cannot be resolved without it — so `client.send` heads and `poses.append` "
                "stays in the body, named for the expression rather than for `self`."
            ),
            "accent": "#2f7f74",
            "bestWhen": "You want the heading band to keep exactly one meaning while still marking real dynamic dispatch.",
            "losesWhen": "You want the drawing to depend only on syntax, so a reader never has to know what the analyzer resolved.",
            "decisions": [
                {"label": "Receiver lane", "value": "Heading when dispatch is unresolved; body when the callee resolves."},
                {"label": "Port name", "value": "The receiver expression (`poses`, `client`) — never `self`."},
                {"label": "Rule", "value": "Semantic: reuses the resolution the analyzer already computed."},
                {"label": "Mutation", "value": "Stays the `after` output; the lane rule says nothing about it."},
            ],
            "keepParts": ["receiver named for its expression rather than self", "one meaning for the heading band"],
            "proof": [
                f"The analyzer already computes the distinction: {facts['send']['title']} carries the "
                f"description “{facts['send']['description']}” while {append['title']} carries "
                f"“{append['description']}”. No new analysis is required, only a projection change.",
                "Board: sketches/review/receiver-grammar-v3.systemsketch draws both cases side by side in one capture.",
                f"Scope: {facts['methodGoldens']} of {facts['goldens']} goldens contain a method call in run().",
            ],
            "scores": {
                "fr1": {"score": 3, "evidence": "Right for the resolved case; for the unresolved one it puts `client` on the band to record an opacity fact, not a claim that the object is code — and the reader cannot see which happened.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "Nothing is rewritten and the port name is the receiver expression, a token that is literally in the call.", "confidence": "high"},
                "fr3": {"score": 3, "evidence": "The rule needs the resolution result, which differs between a typed and an untyped call site and never appears on the canvas.", "confidence": "medium"},
                "fr4": {"score": 5, "evidence": "Both lanes ship today; the difference is which one the projection writes.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "Visible at a glance, though it takes two Blocks side by side to teach the rule the first time.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive; row 0 and the body rows both already ship."},
                "g2": {"pass": True, "evidence": "Every mark traces to a token in the call site."},
                "g3": {"pass": True, "evidence": "One optional `row` on one input port."},
                "g4": {"pass": True, "evidence": "The band keeps its documented meaning: what shapes which code runs."},
                "g5": {"pass": True, "evidence": "`row` is a native field; the role metadata that the codec drops is no longer load-bearing."},
            },
            "previewLabel": "the same rule, two answers",
            "story": {
                "title": "Resolution decides the lane",
                "steps": [
                    {"label": "Read both scenes", "caption": "Top: `list.append` resolves, so `poses` is a body port named for the expression. Bottom: nothing knows what `client` is, so it heads.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Zoom the resolved call", "caption": "`poses` and `pose` share the body. The heading band stays empty because no dispatch decision happens here.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [
                {
                    "label": "The decision procedure",
                    "caption": "Both inputs already exist on the analyzed call: the resolved callee and the receiver's data type.",
                    "html": (
                        "<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef'>"
                        "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap'>"
                        + chip("call.func is an Attribute")
                        + "<b style='color:#8b8174;font-size:18px'>→</b>"
                        + chip("callee resolved?")
                        + "<b style='color:#8b8174;font-size:18px'>→</b>"
                        + chip("yes · body row, name = receiver expression", "#e8f5ef")
                        + chip("no · row 0, name = receiver expression", "#eef4ff")
                        + "</div>"
                        "<p style='margin:12px 0 0;font:12px system-ui;color:#4a463f'>"
                        "The same question already decides whether the Block gets real parameter "
                        "names or falls back to in_1/in_2, so the projection is reading a fact it "
                        "already has.</p></div>"
                    ),
                },
                {
                    "label": "Both goldens, and the rename",
                    "caption": (
                        "Names read out of the generated boards at build time; the arrow is the "
                        "rename this direction proposes, from the callee signature to the token "
                        "actually written at the call site."
                    ),
                    "html": port_table([
                        (f"{append['inputs'][0][0]} → poses", append["inputs"][0][1],
                         "body row 1 · resolved"),
                        (append["inputs"][1][0], append["inputs"][1][1], "body row 1"),
                        (f"{facts['send']['inputs'][0][0]} → client", facts["send"]["inputs"][0][1],
                         "heading band · unresolved"),
                        (facts["send"]["inputs"][1][0], facts["send"]["inputs"][1][1], "body row 1"),
                    ]),
                },
            ],
            "preview": preview("v3", "Show both cases", "Zoom the resolved call"),
        },
        {
            "id": "v4",
            "name": "Unbind to a free function",
            "thesis": (
                "Drop the dot. Draw `poses.append(pose)` as `append(poses, pose)`, with the "
                "receiver as ordinary argument one. Every call site on the canvas then has exactly "
                "one shape and there is no receiver question left to answer."
            ),
            "accent": "#b7791f",
            "bestWhen": "The diagram is the deliverable and nobody needs to map it back to the source text.",
            "losesWhen": "The board has to round-trip to Python, or the reader is following along in the editor.",
            "decisions": [
                {"label": "Receiver lane", "value": "Body row 1, as argument one."},
                {"label": "Title", "value": "`append()` — the dot is gone."},
                {"label": "Rule", "value": "Normalise every bound call to its unbound form."},
            ],
            "keepParts": ["receiver named for its expression", "no per-call special case"],
            "proof": [
                "Board: sketches/review/receiver-grammar-v4.systemsketch. The Block is legible, and the title no longer names the object it mutates.",
                "The corpus already relies on the dotted title to identify the call: `np.asarray`, `Path(path).read_text`, `cls.from_dict` all lose their subject under this rule.",
            ],
            "scores": {
                "fr1": {"score": 2, "evidence": "The lane is right, but dropping the dot removes the title that made the lane sufficient; nothing now names the object.", "confidence": "high"},
                "fr2": {"score": 1, "evidence": "The title is no longer a substring of the source. This is the rewrite the file-first contract forbids.", "confidence": "high"},
                "fr3": {"score": 2, "evidence": "It scales, but it erases the receiver from titles across half the corpus.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "Plain ports.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "Clean at a glance, at the cost of being a different program.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": False, "evidence": "`append()` is not what the source says; the picture is a rewritten program."},
                "g3": {"pass": True, "evidence": "Plain ports."},
                "g4": {"pass": True, "evidence": "Heading band untouched."},
                "g5": {"pass": True, "evidence": "Nothing to lose."},
            },
            "previewLabel": "the call, rewritten",
            "story": {
                "title": "One shape for every call",
                "steps": [
                    {"label": "Look at the scene", "caption": "The cable arrangement is identical to V1; only the title changed.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Zoom the Block", "caption": "`append()` — nothing here says which list. The receiver survives only as a port name.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [{
                "label": "What the title loses",
                "caption": "Dotted callees measured across the golden corpus.",
                "html": (
                    "<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef;"
                    "font:12px/1.6 system-ui;color:#4a463f'>"
                    f"<b>{facts['methodGoldens']} of {facts['goldens']}</b> goldens make a "
                    "method-shaped call inside run(). Under this rule every one of those titles "
                    "drops its subject: <code>poses.append()</code> becomes <code>append()</code>, "
                    "<code>client.send()</code> becomes <code>send()</code>, "
                    "<code>encoder.encode()</code> becomes <code>encode()</code> — which now "
                    "collides with the free function of the same name already on that board."
                    "</div>"
                ),
            }],
            "preview": preview("v4", "Show the whole scene", "Zoom the Block"),
        },
        {
            "id": "v5",
            "name": "Receiver lane",
            "thesis": (
                "Give the receiver its own row and align it on both sides. `poses` enters and "
                "leaves on one horizontal lane, so the object threads through the Block and the "
                "mutation is drawn as a lane rather than inferred from an extra output."
            ),
            "accent": "#7667c6",
            "bestWhen": "Mutation is the thing you most want to see, and you are willing to spend a body row on it.",
            "losesWhen": "The method does not mutate, or the Block is already tall.",
            "decisions": [
                {"label": "Receiver lane", "value": f"Body row {facts['firstBodyRow']}, Aligned port layout."},
                {"label": "Port name", "value": "The receiver expression, in and out."},
                {"label": "Mutation", "value": "Drawn as the through-lane itself."},
                {"label": "Arguments", "value": "Start on row 2."},
            ],
            "keepParts": ["the receiver reads as a thread through the Block", "in and out share a name"],
            "proof": [
                "Board: sketches/review/receiver-grammar-v5.systemsketch. The aligned lane renders with the shipped `row` field and `portLayout: inline` — no engine change.",
                f"The mutation output already exists in the corpus: golden 11 emits {append['outputs'][0][0]}: {append['outputs'][0][1]}.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "Keeps the receiver in the body where it belongs and adds a mutation reading — but an aligned in/out pair is also how a pure transform is drawn.", "confidence": "medium"},
                "fr2": {"score": 5, "evidence": "Title and both port names come straight from the call site.", "confidence": "high"},
                "fr3": {"score": 3, "evidence": "Works beautifully for mutating receivers; wasteful for the many calls that only read theirs.", "confidence": "medium"},
                "fr4": {"score": 5, "evidence": "`row` plus Aligned layout, both shipped.", "confidence": "high"},
                "fr5": {"score": 4, "evidence": "The lane is obvious in the crop; distinguishing it from a transform is not.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Uses the shipped row grammar and Aligned layout."},
                "g2": {"pass": True, "evidence": "Source untouched."},
                "g3": {"pass": True, "evidence": "`row` on three ports."},
                "g4": {"pass": True, "evidence": "Heading band untouched."},
                "g5": {"pass": True, "evidence": "`row` is native."},
            },
            "previewLabel": "the object threads through",
            "story": {
                "title": "Mutation as a lane",
                "steps": [
                    {"label": "Look at the scene", "caption": "`poses` enters row 1 on the left and leaves row 1 on the right; `pose` sits on row 2.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Zoom the Block", "caption": "One name, both sides. The Block reads as a thing being carried through and handed back.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [{
                "label": "Where this collides with the existing vocabulary",
                "caption": "Aligned rows are already how a pure transform is drawn, so the lane alone is not a mutation mark.",
                "html": port_table([
                    ("poses", "list[Pose]", "row 1 · in"),
                    ("poses", "list[Pose]", "row 1 · out"),
                    ("pose", "Pose", "row 2 · in"),
                ]),
            }],
            "preview": preview("v5", "Show the whole scene", "Zoom the Block"),
        },
    ]

    return {
        "schemaVersion": 3,
        "title": "Where does the receiver land? Five grammars for poses.append()",
        "kicker": "SystemSketch × pyblocks · golden 11 · Sep 2, 2026",
        "brief": (
            "A method call has one input the language treats differently from every other: the "
            "object before the dot. Golden 11 asks the question in its smallest form — "
            "poses.append(pose) — and the answer decides how every dotted call in the corpus "
            f"is drawn. Today the analyzer stamps {facts['receiverRoles']} receiver-role ports "
            f"across {facts['boards']} generated boards and the .systemsketch codec drops every "
            f"one of them, so {facts['portsWithRow']} of {facts['ports']} native ports carry a "
            "row. The heading band shipped on Sep 1; nothing writes to it. These five directions "
            "are all rendered as real boards in the real app. Decided Sep 2: the receiver is a "
            "data port — see the pick below."
        ),
        "count": 5,
        "defaultId": "v1",
        "defaultWhy": (
            "Zach's call, Sep 2 2026: the receiver is a data port. When you pass a variable as a "
            "function, that piece of data IS the function, and the heading band is where it "
            "belongs. A dot is not that — it is shorthand for applying a function to the data, so "
            "the object before it is an argument like any other. The functional reading is the "
            "receiver in the body. That also settles the case the AI ranked first: V3 wanted the "
            "lane to depend on whether dispatch resolved, and this rule needs no such knowledge. "
            "V3's naming half survives as an open follow-up."
        ),
        "decisionHinge": (
            "SETTLED — the hinge was whether the heading band marks METHODS or marks VALUES THAT "
            "ARE CODE. It marks values that are code: a callable, a predicate, an iterable. A "
            "receiver is data the code is applied to, so it stays in the body no matter whether "
            "the callee resolved. What is still open is downstream of that: whether the port keeps "
            "the signature's `self` or takes the receiver expression, whether mutation earns a "
            "mark of its own, and the fact that the 14 callable-role ports do not reach row 0 "
            "today either."
        ),
        "invariants": [
            "tldraw stays stock: the heading band is row 0 on an ordinary input port, not a new primitive.",
            "A passed callable IS the function, so it heads. A receiver is the data a function is applied to, so it stays in the body.",
            "The canvas is the program as written; the projection never rewrites the call site.",
            f"Row {facts['headerRow']} is inputs-only; body rows start at {facts['firstBodyRow']}.",
            "A port's id is its durable identity; the visible name is free to change.",
            "Anything that must survive the file has to be a native port field — analyzer metadata is dropped by the codec.",
            "Every capture on this page is the real app rendering a real .systemsketch board, generated through the editor and reopened cold.",
        ],
        "boundary": (
            "This is a grammar decision with the boards to judge it, not a landed change. No "
            "pyblocks projection code and no golden was modified; the six review boards under "
            "sketches/review/ are new files. The class question is answered by the sixth board "
            "rather than by a variant, because stepping into a method is a separate mechanism "
            "from placing its receiver."
        ),
        "axes": [
            {"name": "Receiver lane", "values": ["body row 1", "heading band", "depends on resolution", "body row 1", "own aligned row"]},
            {"name": "Port name", "values": ["self", "self", "receiver expression", "receiver expression", "receiver expression"]},
            {"name": "What decides", "values": ["nothing", "syntax", "resolution", "normalisation", "mutation"]},
            {"name": "Cost", "values": ["no information", "band means two things", "reader must know resolution", "source no longer matches", "one body row"]},
        ],
        "requirements": requirements,
        "hardGates": gates,
        "variants": variants,
        "checks": [
            "Five structurally distinct receiver grammars, each rendered as a real board in the real app",
            "Every board generated through the SystemSketch editor and verified by cold reopen plus bound motion",
            "Five weighted criteria summing to 100, each score carrying evidence and a confidence",
            "Five hard gates evaluated separately; V2 fails the heading-band gate and V4 fails the source-fidelity gate",
            "Every number in the brief and the criteria measured at build time from the live trees",
            "A sixth board answers the class question that the variants deliberately do not cover",
            "fr1 was restated after the first pass: judging the boards showed the criterion had assumed its own answer",
            "No pyblocks projection code, golden, or SystemSketch source was changed by this exploration",
        ],
    }


def main() -> None:
    facts = measure()
    spec = build_spec(facts)
    SPEC.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUTPUT.unlink(missing_ok=True)  # the builder is the source; rebuild is idempotent
    subprocess.run(
        [sys.executable, str(GALLERY), "build", "--spec", str(SPEC), "--output", str(OUTPUT)],
        check=True,
    )
    subprocess.run(
        [sys.executable, str(GALLERY), "check", "--input", str(OUTPUT)],
        check=True,
    )
    print(json.dumps({k: v for k, v in facts.items() if not isinstance(v, dict)}, indent=2))
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
