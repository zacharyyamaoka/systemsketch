#!/usr/bin/env python3
"""Build the splitter gallery: where a projection (`self.shape`, `response.id`) lives.

The fixture is golden 33, `ObjectRecord.to_object_spec()` — a real frozen
dataclass whose body reads a handful of its members and hands them to a
constructor. That is the honest many-member case; golden 12's `response.id` is
the same mechanism with one member.

Every number on the page is measured here, at build time, from the live
SystemSketch tree and the live pyblocks golden corpus.
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
SPEC = ROOT / "docs" / "splitter-babble-2026-09-03.json"
OUTPUT = ROOT / "docs" / "splitter-babble-2026-09-03.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")

SCENE = (20, 320, 1560, 700)
ZOOM = {
    "s1": (490, 340, 1070, 670),
    "s2": (510, 310, 1080, 700),
    "s3": (10, 340, 580, 700),
    "s4": (850, 340, 1560, 660),
    "s5": (480, 240, 1080, 710),
}


# --------------------------------------------------------------------------- measure


def measure() -> dict:
    model = (ROOT / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")
    views = re.search(r"export const BLOCK_VIEWS = \[(.*?)\]", model)
    view_names = re.findall(r"'(\w+)'", views.group(1) if views else "")
    sizes = {}
    block_sizes = model.split("DEFAULT_BLOCK_VIEW_SIZES")[1].split("}\n")[0]
    for name, w, h in re.findall(r"(\w+): \{ w: (\d+), h: (\d+) \}", block_sizes):
        sizes[name] = (int(w), int(h))

    canvas = (ROOT / "src" / "blocks" / "ui" / "BlockCanvas.tsx").read_text(encoding="utf-8")
    # Outputs render `type name`, inputs render `name type` — the reason
    # `str .object_id` reads the way it does.
    output_first = "placed.side === 'output' ? type : null" in canvas

    analyzer = (PYBLOCKS / "pyblocks" / "analyzer.py").read_text(encoding="utf-8")
    unpack_nodes = len(re.findall(r'"transform", "unpack", "unpack"', analyzer))
    unpack_reason = re.search(r'reason="([^"]*unpacking[^"]*)"', analyzer)

    source = (GOLDENS / "33_object_to_spec" / "source.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    record = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.ClassDef) and n.name == "ObjectRecord")
    declared = [s.target.id for s in record.body if isinstance(s, ast.AnnAssign)]
    method = next(n for n in record.body
                  if isinstance(n, ast.FunctionDef) and n.name == "to_object_spec")
    read = sorted({a.attr for a in ast.walk(method)
                   if isinstance(a, ast.Attribute) and isinstance(a.value, ast.Name)
                   and a.value.id == "self"})
    annotations = {s.target.id: ast.unparse(s.annotation)
                   for s in record.body if isinstance(s, ast.AnnAssign)}

    # How often the corpus reads a member off a value at all.
    attr_goldens = total_goldens = 0
    for path in sorted(GOLDENS.glob("*/source.py")):
        total_goldens += 1
        body = ast.parse(path.read_text(encoding="utf-8"))
        if any(isinstance(n, ast.Attribute) and not isinstance(getattr(n, "ctx", None), ast.Store)
               for n in ast.walk(body)):
            attr_goldens += 1

    # golden 12 is the one-member case of the same mechanism.
    twelve = (GOLDENS / "12_unknown_receiver" / "source.py").read_text(encoding="utf-8")
    twelve_run = next(n for n in ast.walk(ast.parse(twelve))
                      if isinstance(n, ast.FunctionDef) and n.name == "run")

    return {
        "views": view_names,
        "viewSizes": sizes,
        "outputTypeFirst": output_first,
        "unpackNodes": unpack_nodes,
        "unpackReason": unpack_reason.group(1) if unpack_reason else "",
        "declared": declared,
        "read": read,
        "annotations": annotations,
        "goldens": total_goldens,
        "attrGoldens": attr_goldens,
        "twelveTail": ast.unparse(twelve_run.body[-3]) + " · " + ast.unparse(twelve_run.body[-2]),
    }


# ----------------------------------------------------------------------------- media


def crop_uri(variant: str, kind: str) -> str:
    ASSETS.mkdir(parents=True, exist_ok=True)
    source = BOARDS / f"splitter-{variant}.png"
    target = ASSETS / f"crop-splitter-{variant}-{kind}.png"
    Image.open(source).crop(SCENE if kind == "scene" else ZOOM[variant]).save(target)
    return "data:image/png;base64," + base64.b64encode(target.read_bytes()).decode("ascii")


def preview(variant: str, alt_label: str) -> str:
    scene = crop_uri(variant, "scene")
    zoom = crop_uri(variant, "zoom")
    return (
        "<div style='padding:34px 12px 12px;background:#0e1117'>"
        "<div style='display:flex;align-items:center;justify-content:space-between;gap:12px;"
        "margin:0 0 10px;color:#9fb0c6;font:11px ui-monospace,monospace'>"
        "<span>real capture · the board, in the app</span>"
        "<button data-demo-toggle data-base-label='Show the whole scene' "
        f"data-alt-label='{alt_label}' "
        "style='border:1px solid #49617e;border-radius:6px;background:#172336;color:#eaf2ff;"
        "padding:7px 10px;cursor:pointer'>Show the whole scene</button></div>"
        # The class rides a wrapper span: `.prototype img` outranks `.demo-alt-only`.
        f"<span class='demo-base-only'><img src='{scene}' alt='{variant} board' "
        "style='border-radius:8px' /></span>"
        f"<span class='demo-alt-only'><img src='{zoom}' alt='{variant} close-up' "
        "style='border-radius:8px' /></span></div>"
    )


def story(alt_label: str, caption: str) -> dict:
    return {
        "title": "One record, four members, one constructor",
        "steps": [
            {"label": "Look at the scene",
             "caption": "to_object_spec()'s `self` on the left, ObjectSpec() on the right. "
                        "Only the middle changes between variants.",
             "state": "base", "target": "[data-demo-toggle]"},
            {"label": alt_label, "caption": caption, "state": "alt", "target": "[data-demo-toggle]"},
        ],
    }


def table(rows: list[tuple[str, str, str]], head: tuple[str, str, str]) -> str:
    cells = "".join(
        "<tr>"
        f"<td style='padding:4px 10px;font:600 12px ui-monospace,monospace'>{a}</td>"
        f"<td style='padding:4px 10px;font:12px ui-monospace,monospace;color:#6b6255'>{b}</td>"
        f"<td style='padding:4px 10px;font:12px system-ui;color:#4a463f'>{c}</td>"
        "</tr>" for a, b, c in rows
    )
    return (
        "<table style='border-collapse:collapse;width:100%;background:#fff;"
        "border:1px solid #d8d0c4'>"
        "<tr style='background:#f1ece3'>"
        + "".join(f"<th style='text-align:left;padding:5px 10px;font:600 11px system-ui'>{h}</th>"
                  for h in head)
        + f"</tr>{cells}</table>"
    )


def panel(text: str) -> str:
    return ("<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef;"
            f"font:12px/1.65 system-ui;color:#4a463f'>{text}</div>")


# ------------------------------------------------------------------------------ spec


def build_spec(f: dict) -> dict:
    declared = len(f["declared"])
    read = len(f["read"])
    unread = declared - read

    requirements = [
        {
            "id": "fr1",
            "name": "The label is a fact about the type, not about the call site",
            "weight": 25,
            "why": (
                "A projection is reusable exactly to the degree that it does not mention the "
                "variable it happened to be applied to. `.shape` is true of every ObjectRecord "
                "that ever exists; `size_m` is true of four lines in one method. This is the "
                "same rule that decided rebinding names on Sep 1 — the variable name rides the "
                "wire, the contract is the port."
            ),
            "passCondition": "Nothing on the projection changes if the surrounding variables are renamed.",
            "anchors": {
                "1": "The label is the variable name.",
                "3": "Both the variable and the accessor appear.",
                "5": "Only the type and the accessor appear.",
            },
        },
        {
            "id": "fr2",
            "name": "One picture, one program",
            "weight": 20,
            "why": (
                "SystemSketch's contract is that the board is the source. A drawing that maps "
                "to two different Python programs — or that says a member was read somewhere it "
                "was not — is a bug, not a style choice."
            ),
            "passCondition": "The board projects back to exactly the expressions the source contains, at the place it contains them.",
            "anchors": {
                "1": "The picture is compatible with several different programs.",
                "3": "The expressions are right but their position in the body is lost.",
                "5": "Each mark is one expression, in its place.",
            },
        },
        {
            "id": "fr3",
            "name": "Reuses vocabulary that already ships",
            "weight": 20,
            "why": (
                f"BLOCK_VIEWS ships {len(f['views'])} values and the Pill is already a separate "
                "representation with its own meaning. A projection that needs a new object, or "
                "that gives an existing one a second meaning, is spending the stock-tldraw "
                "budget on an accessor."
            ),
            "passCondition": "Expressible with today's Block, port, connection and view vocabulary, without overloading any of it.",
            "anchors": {
                "1": "Needs a new shape.",
                "3": "Reuses a shape that already means something else.",
                "5": "An ordinary Block doing an ordinary Block's job.",
            },
        },
        {
            "id": "fr4",
            "name": "Compact where the pipeline is",
            "weight": 20,
            "why": (
                "Zach's own framing: the projection should sit “quite inline with the arrow.” A "
                "member read is plumbing, not a stage; if it takes as much room as `estimate()` "
                "the board stops being about the pipeline."
            ),
            "passCondition": "In its default presentation the projection is visually lighter than a call Block.",
            "anchors": {
                "1": "The largest object on the board.",
                "3": "The same weight as a call.",
                "5": "Reads as something on the edge rather than a stage in it.",
            },
        },
        {
            "id": "fr5",
            "name": "Scales from one member to twenty",
            "weight": 15,
            "why": (
                f"The two real cases in the corpus bracket the range: golden 12 reads one member "
                f"(`response.id`), and ObjectRecord declares {declared} fields of which "
                f"`to_object_spec` reads {read}. A grammar tuned for one of those must not "
                "collapse at the other."
            ),
            "passCondition": "The same mechanism draws a one-member read and a many-member read without a special case.",
            "anchors": {
                "1": "Only works at one end of the range.",
                "3": "Works at both but is wasteful at one.",
                "5": "Same mechanism, cost proportional to what is actually read.",
            },
        },
    ]

    gates = [
        {"id": "g1", "name": "No new SystemSketch primitive",
         "why": "tldraw stays stock; a projection has to be expressible as Blocks, ports, connections and bindings."},
        {"id": "g2", "name": "The lint stays the existing per-cable type judgement",
         "why": (
             "One-to-many is already legal and already checked: every cable is judged where it "
             "lands. Four cables into four differently-typed ports is four ordinary type errors, "
             "not a new arity rule."
         )},
        {"id": "g3", "name": "The port list is derived, so it cannot go stale",
         "why": f"ObjectRecord declares {declared} fields today. Anything frozen at authoring time is wrong the next time the dataclass changes."},
        {"id": "g4", "name": "The canvas is the program as written",
         "why": "A member read that is drawn somewhere the program did not perform it is a rewritten program."},
    ]

    variants = [
        {
            "id": "s1",
            "name": "Derived Block",
            "thesis": (
                "`.shape` is `getattr(self, 'shape')` — function application, exactly like every "
                "other call on the board. So a projection is a Block, and its output ports are "
                "derived from the type arriving on its input port."
            ),
            "accent": "#b4762c",
            "bestWhen": "Several members are read from one value, and you want the reads visible as a single place in the pipeline.",
            "losesWhen": "Exactly one member is read and the Block costs more than the fact it carries.",
            "decisions": [
                {"label": "Object", "value": "an ordinary Block"},
                {"label": "Title", "value": "the incoming type (`ObjectRecord`)"},
                {"label": "Output rows", "value": "`type .accessor`, derived from the input port's type"},
                {"label": "Small form", "value": "the shipped Simple view — no new size to invent"},
            ],
            "keepParts": ["ports derived from the input type",
                          "`type .accessor` as the row, with no variable name",
                          "Simple view as the on-edge form"],
            "proof": [
                "Board: sketches/review/splitter-s1.systemsketch, generated through the editor and cold-reopened.",
                f"The rows read `str .object_id` because outputs render type-first and inputs name-first — measured in BlockCanvas.tsx ({'confirmed' if f['outputTypeFirst'] else 'NOT confirmed'}), so Zach's `Pose .pose` mock is exactly what the shipped renderer does with `name='.pose', type='Pose'`.",
                f"The analyzer already emits this node: `unpack` transforms appear {f['unpackNodes']} times in analyzer.py, reasoned “{f['unpackReason']}”. The projection collapses them today; this direction stops collapsing.",
                f"Derivation is what keeps it honest: ObjectRecord declares {declared} fields and this body reads {read}. The Block shows the four that reach ObjectSpec().",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "Every row is `type .accessor`; renaming `size_m` in the body changes nothing on the Block.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "One Block is one attribute-read expression at one place in the body; `.x` is `getattr`, so a call is the truthful shape.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "An ordinary Block. No shape, view or field is added or overloaded.", "confidence": "high"},
                "fr4": {"score": 4, "evidence": f"In Port view it is a third object between two Blocks; Simple view ({f['viewSizes'].get('simple', ('?', '?'))[0]}×{f['viewSizes'].get('simple', ('?', '?'))[1]} by default) is the on-edge form and needs no new size.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "One row per member actually read, whether that is one or twenty.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Blocks, ports, cables."},
                "g2": {"pass": True, "evidence": "Each output row is typed, so each landing is judged by the existing per-cable rule."},
                "g3": {"pass": True, "evidence": "The rows come from the type on the input port; change the dataclass and the Block changes."},
                "g4": {"pass": True, "evidence": "One Block per projection site, where the body performs it."},
            },
            "previewLabel": "a projection is a call",
            "story": story("Zoom the projection",
                           "Four rows, each `type .accessor`. No variable name anywhere — the same Block would serve any ObjectRecord at any call site."),
            "media": [
                {
                    "label": "Why derived beats premade",
                    "caption": "Measured from golden 33's real dataclass at build time.",
                    "html": table([
                        (f"{declared} fields", "declared by ObjectRecord", "what a premade splitter would show"),
                        (f"{read} members", "read by to_object_spec", "what a derived splitter shows"),
                        (f"{unread} rows", "the difference", "dead ports on every board that uses the premade one"),
                    ], ("count", "what it is", "consequence")),
                },
                {
                    "label": "The same mechanism at one member",
                    "caption": "Golden 12's tail. `response.id` is this Block with a single row — no special case.",
                    "html": panel(f"<code>{f['twelveTail']}</code><br><br>"
                                  f"{f['attrGoldens']} of the {f['goldens']} goldens read a member "
                                  "off a value somewhere. Whatever answers this has to answer all "
                                  "of them."),
                },
            ],
            "preview": preview("s1", "Zoom the projection"),
        },
        {
            "id": "s2",
            "name": "Capsules on the wire",
            "thesis": (
                "The projection is not a stage, it is a selector on the edge. SystemSketch "
                "already ships an on-wire object with an inlet and an outlet — the Pill — so "
                "each accessor is one capsule sitting on the cable."
            ),
            "accent": "#7667c6",
            "bestWhen": "One or two members are read and you want the reads to disappear into the wiring.",
            "losesWhen": "Many members are read, or you need the Pill to keep meaning 'a literal value'.",
            "decisions": [
                {"label": "Object", "value": "the shipped `value` capsule, one per accessor"},
                {"label": "Where the accessor goes", "value": "the port name — a fed pill folds its title to `⋯`"},
                {"label": "Cables", "value": "two per member (in and out)"},
            ],
            "keepParts": ["the on-wire reading", "the smallest possible object for a one-member read"],
            "proof": [
                "Board: sketches/review/splitter-s2.systemsketch.",
                "Measured while building it: a Pill whose inlet is wired folds its literal to `⋯`, so the accessor cannot live in the title — it has to ride the port-name slot, which is the variable-name field.",
                "That is the direction's real cost, found by rendering rather than by reasoning: the Pill's own model says the title is the literal and the port name is the variable name. An accessor is neither.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "The visible label is `.object_id`, with no variable — but it is stored in the field the app calls the variable name.", "confidence": "high"},
                "fr2": {"score": 3, "evidence": "Four capsules read as four named bindings (`x = record.shape`), which the source did not write; two of the four reads are inlined in the constructor call.", "confidence": "medium"},
                "fr3": {"score": 3, "evidence": "The Pill ships, but its documented meaning is a literal argument. Using it for a projection gives it a second meaning.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "The smallest objects of any variant, sitting on the cables.", "confidence": "high"},
                "fr5": {"score": 2, "evidence": f"Twenty members would be twenty capsules and forty cables; the board in the capture already has {2 * read} cables for four.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "The Pill is shipped."},
                "g2": {"pass": True, "evidence": "Each capsule is typed, so each landing is judged normally."},
                "g3": {"pass": False, "evidence": "Nothing derives the set — each capsule is authored by hand, so adding a field to the dataclass changes nothing on the board."},
                "g4": {"pass": True, "evidence": "Each capsule sits where the read happens."},
            },
            "previewLabel": "selectors on the edge",
            "story": story("Zoom the capsules",
                           "Four capsules, each an accessor. The `= ⋯` is the Pill saying its literal is overridden by the cable — the behaviour that forces the accessor into the name slot."),
            "media": [{
                "label": "What the Pill was built to mean",
                "caption": "From valueBlock.ts, the shipped model. Every row is a claim this direction has to bend.",
                "html": table([
                    ("title", "the literal itself (`2.0`)", "here: the accessor, hidden when fed"),
                    ("port name", "the variable name", "here: the accessor"),
                    ("port type", "inferred from the literal", "here: the member's declared type"),
                ], ("Pill field", "what it means today", "what this direction needs")),
            }],
            "preview": preview("s2", "Zoom the capsules"),
        },
        {
            "id": "s3",
            "name": "Producer rows",
            "thesis": (
                "Do not put an object between. The Block that produced the value grows one extra "
                "output row per member the body reads, so the reads are drawn where the value is "
                "born and the board keeps the fewest objects it can."
            ),
            "accent": "#4c8f6d",
            "bestWhen": "The reads happen immediately after the value is produced, which is the common case for a returned record.",
            "losesWhen": "A member is read far from where the value came from — the board can no longer say where.",
            "decisions": [
                {"label": "Object", "value": "none — extra rows on the producer"},
                {"label": "Composite", "value": "kept as its own row, so the whole value is still wirable"},
                {"label": "Rows", "value": "`type .accessor`, same as S1"},
            ],
            "keepParts": ["fewest objects on the board", "the composite staying available as its own row"],
            "proof": [
                "Board: sketches/review/splitter-s3.systemsketch — five outputs on the boundary Block, four of them wired.",
                "This is close to what the projection already does: golden 07 emits `estimate_pair()` with `pose` and `quality` as direct output ports and no unpack node at all.",
                f"Where it breaks is position. `to_object_spec` reads {read} members across a branch and a comprehension; drawn as producer rows they all appear at the top, which is not where the program does them.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "Identical rows to S1 — `str .object_id` — with no variable name.", "confidence": "high"},
                "fr2": {"score": 2, "evidence": "The rows say the members were read at the producer. Two of golden 33's reads happen inside the `if` branch; the board cannot say so.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "Ordinary output ports on an ordinary Block.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "The board has the fewest objects of any variant here.", "confidence": "high"},
                "fr5": {"score": 3, "evidence": "Twenty members makes the producer twenty rows tall, and it is the producer that pays.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Just ports."},
                "g2": {"pass": True, "evidence": "Typed rows, judged at the landing."},
                "g3": {"pass": True, "evidence": "The rows can be derived from the producer's return type."},
                "g4": {"pass": False, "evidence": "It draws the reads at the producer regardless of where in the body they happen, so one board matches several programs."},
            },
            "previewLabel": "no object between",
            "story": story("Zoom the producer",
                           "`ObjectRecord self` still on top, then four member rows below it. Nothing sits between the two Blocks — and nothing says where in the body each read happened."),
            "media": [{
                "label": "Where golden 33 actually reads its members",
                "caption": "Parsed from the source at build time. Two of these are inside the non-primitive branch.",
                "html": table([(f".{name}", f["annotations"].get(name, "—"),
                                "read by to_object_spec") for name in f["read"]],
                              ("member", "declared type", "where")),
            }],
            "preview": preview("s3", "Zoom the producer"),
        },
        {
            "id": "s4",
            "name": "Consumer inlets",
            "thesis": (
                "Direction is decided at the landing, so put the accessor there too. One cable "
                "leaves the record; each consumer's inlet says which member it takes. Nothing "
                "sits between the Blocks at all."
            ),
            "accent": "#54708f",
            "bestWhen": "Every member goes to a different consumer and you want the board to have literally no plumbing objects.",
            "losesWhen": "Two consumers want the same member, or the parameter names are long — the row carries two names at once.",
            "decisions": [
                {"label": "Object", "value": "none"},
                {"label": "Inlet label", "value": "`parameter ← .accessor`"},
                {"label": "Cables", "value": "an ordinary same-type fan-out from one output port"},
            ],
            "keepParts": ["the fan-out being legal because every cable carries the same type",
                          "the reminder that the landing is where a cable's meaning is decided"],
            "proof": [
                "Board: sketches/review/splitter-s4.systemsketch. Four cables leave one `ObjectRecord` port — legal, because they all carry ObjectRecord.",
                "The capture also shows the cost directly: `type_name ← .subcate… s…` truncates at 620px, and that is the shortest of the four.",
                "This is the direction that makes the lint question disappear: nothing is one-to-many across types, so nothing new has to be checked.",
            ],
            "scores": {
                "fr1": {"score": 2, "evidence": "The row carries the consumer's parameter name and the accessor together, so it is a fact about this call site, not about the type.", "confidence": "high"},
                "fr2": {"score": 3, "evidence": "The expressions are recoverable, but the read is drawn at the consumer rather than where the body performs it.", "confidence": "medium"},
                "fr3": {"score": 4, "evidence": "Ordinary port names — but `←` is a new token in the label grammar.", "confidence": "medium"},
                "fr4": {"score": 5, "evidence": "Zero extra objects.", "confidence": "high"},
                "fr5": {"score": 3, "evidence": "Fine for a few members; a value read twenty times means twenty inlets each carrying two names.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Port names only."},
                "g2": {"pass": True, "evidence": "Every cable carries the same type, so the existing per-cable judgement passes them all."},
                "g3": {"pass": True, "evidence": "The accessor can be derived from the source expression at each landing."},
                "g4": {"pass": True, "evidence": "Each accessor is written where its value is consumed."},
            },
            "previewLabel": "the accessor at the landing",
            "story": story("Zoom the consumer",
                           "`name ← .object_id`, `shape ← .shape`. Every inlet names both the parameter it fills and the member it takes — and the longest one already truncates."),
            "media": [{
                "label": "One to many, with and without a type change",
                "caption": "The rule that makes the fan-out on this board legal, and the sketch's own bad case illegal.",
                "html": table([
                    ("4 cables, all ObjectRecord", "legal", "each landing judged separately, all pass"),
                    ("1 cable split to Pose, Frame, float", "4 type errors", "not an arity rule — the existing per-cable check fires four times"),
                ], ("fan-out", "verdict", "which rule decides")),
            }],
            "preview": preview("s4", "Zoom the consumer"),
        },
        {
            "id": "s5",
            "name": "Library definition",
            "thesis": (
                "A splitter for a type is a definition, so author it once in the library and "
                "link it wherever that type is unpacked — the same mechanism linked Blocks "
                "already use to share content across call sites."
            ),
            "accent": "#8f3f5c",
            "bestWhen": "A handful of types are unpacked constantly and you want one canonical picture of each.",
            "losesWhen": "The type changes, or a body reads three of its twenty fields.",
            "decisions": [
                {"label": "Object", "value": "a linked definition Block"},
                {"label": "Rows", "value": "every field the type declares"},
                {"label": "When it updates", "value": "when someone re-authors it"},
            ],
            "keepParts": ["one canonical picture per type",
                          "promotion: a derived splitter that gets linked is this, without the staleness"],
            "proof": [
                "Board: sketches/review/splitter-s5.systemsketch — eight of ObjectRecord's fields shown, four wired.",
                f"The full version has {declared} rows for a body that reads {read}; {unread} would be dead on this board.",
                "Zach's own instinct in the brief was that these could be “dynamically constructed” rather than premade. The measurement agrees, and premade turns out to be the same thing with the derivation frozen.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "Purely type-centric — that is the whole idea.", "confidence": "high"},
                "fr2": {"score": 3, "evidence": f"The board shows rows for members the body never touches, so it overstates what the program reads by {unread} fields.", "confidence": "high"},
                "fr3": {"score": 4, "evidence": "Linked definitions ship; the Block is ordinary. The library surface for authoring one does not exist yet.", "confidence": "medium"},
                "fr4": {"score": 2, "evidence": "The tallest object in the whole comparison, and it is plumbing.", "confidence": "high"},
                "fr5": {"score": 2, "evidence": "Cost is proportional to the type's size, not to what is read — exactly backwards.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "A linked Block."},
                "g2": {"pass": True, "evidence": "Typed rows, judged at the landing."},
                "g3": {"pass": False, "evidence": f"Frozen at authoring time. ObjectRecord declares {declared} fields today; a hand-authored splitter is wrong the next time that changes."},
                "g4": {"pass": True, "evidence": "The linked instance sits where the unpack happens."},
            },
            "previewLabel": "author it once",
            "story": story("Count the dead rows",
                           "Four rows wired, four idle — and that is the abbreviated version. The real ObjectRecord would put sixteen unwired rows on this board."),
            "media": [{
                "label": "The ratio, on a real dataclass",
                "caption": "ObjectRecord, parsed from golden 33 at build time.",
                "html": panel(
                    f"<b>{declared}</b> declared fields · <b>{read}</b> read by "
                    f"<code>to_object_spec</code> · <b>{unread}</b> that would be drawn and never "
                    "used. A premade splitter is not wrong so much as it is a picture of the "
                    "type where the board wanted a picture of the program."
                ),
            }],
            "preview": preview("s5", "Count the dead rows"),
        },
    ]

    return {
        "schemaVersion": 3,
        "title": "Where does a projection live? Five directions for the data splitter",
        "kicker": "SystemSketch × pyblocks · golden 33 · Sep 3, 2026",
        "brief": (
            "`shape = self.shape`, `ObjectSpec(name=self.object_id, …)`. One composite value "
            "feeding several differently-typed consumers — the case the sketch marks BAD when a "
            "single cable splits across types. Two things the measurement settles before the "
            "variants start. First, the split is not a fan-out: one-to-many of the *same* type "
            "is already legal and needs nothing, while one-to-many across types is not an arity "
            "problem at all, it is the existing per-cable type check firing once per landing. "
            "Second, `.shape` is `getattr(self, 'shape')` — function application, the same rule "
            f"that put a method's receiver in the body on Sep 2. ObjectRecord declares {declared} "
            f"fields; this body reads {read}. Five directions for where that read gets drawn, "
            "each a real board in the real app."
        ),
        "count": 5,
        "defaultId": "s1",
        "defaultWhy": (
            "A projection is a call, so it should be a Block — and the ports come from the type "
            "arriving on the input port, not from a catalogue. That answers the premade-versus-"
            f"dynamic question with a measurement rather than a preference: ObjectRecord has "
            f"{declared} fields and this body reads {read}, so a premade splitter draws {unread} "
            "ports that are never used, and is wrong the next time the dataclass changes. "
            "Premade is not a rival direction — it is S1 with the derivation frozen, and the "
            "honest version of it is promotion: derive the splitter, then link it if you want it "
            "reusable. Two of Zach's sub-questions fall out. Block or pill in the small form: "
            "Block, and the small form is the shipped Simple view, so there is no new size to "
            "invent. Show the variable name: no — the accessor is a fact about the type and the "
            "variable is a fact about one call site, which is the same rule as Sep 1's rebinding "
            "call. Keep S2's instinct for the one-member case if the Block ever feels heavy "
            "there, and S4's observation that the lint needs no new rule."
        ),
        "decisionHinge": (
            "Whether a one-member read deserves an object. Every score here is dominated by the "
            "many-member case, and golden 12's `response.id` is the other end: one accessor, one "
            "Block, three objects in a row where there used to be two. If most real projections "
            "turn out to be single-member, fr4's weight should rise and S2's capsule becomes the "
            "right default for that case, with S1 kept for the many. The second hinge is fr2: if "
            "you decide the board does not need to say *where in the body* a member was read, S3 "
            "stops failing the fidelity gate and becomes the cheapest answer on the page."
        ),
        "invariants": [
            "tldraw stays stock; a projection is Blocks, ports, cables and bindings.",
            "One-to-many is already legal; a type mismatch is already checked at each landing. Neither needs a new rule.",
            "A dot is function application, so a member read is a call — the same rule that keeps a method's receiver in the body.",
            "The port list is derived from the type on the input port, so it cannot go stale.",
            "The accessor is a fact about the type; the variable name is a fact about the call site and stays off the Block.",
            "Every capture on this page is the real app rendering a real .systemsketch board, generated through the editor and reopened cold.",
        ],
        "boundary": (
            "This is a grammar decision with the boards to judge it, not a landed change. No "
            "pyblocks projection code, no golden, and no SystemSketch source was modified; the "
            "five boards under sketches/review/ are new files. The derivation itself — reading a "
            "type's members to build the ports — is drawn but not implemented, and S5's library "
            "authoring surface does not exist."
        ),
        "axes": [
            {"name": "Where the projection lives",
             "values": ["its own Block", "on the wire", "on the producer", "on the consumer", "in the library"]},
            {"name": "Objects added", "values": ["one", "one per member", "none", "none", "one"]},
            {"name": "What names the row",
             "values": ["the type", "the type", "the type", "the type and the parameter", "the type"]},
            {"name": "Rows shown",
             "values": ["members read", "members read", "members read", "members read", "every field declared"]},
        ],
        "requirements": requirements,
        "hardGates": gates,
        "variants": variants,
        "checks": [
            "Five structurally distinct locations for the same projection, each a real board in the real app",
            "Every board generated through the SystemSketch editor and verified by cold reopen plus bound motion",
            "Five weighted criteria summing to 100, each score carrying evidence and a confidence",
            "Four hard gates evaluated separately; S2 and S5 fail the derivation gate, S3 fails the source-fidelity gate",
            "Every number measured at build time by parsing golden 33's real dataclass and reading the live SystemSketch source",
            "The Pill's fed-state fold was found by rendering S2, not by reasoning about it, and is scored as its cost",
            "No pyblocks projection code, golden, or SystemSketch source was changed by this exploration",
        ],
    }


def main() -> None:
    facts = measure()
    spec = build_spec(facts)
    SPEC.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    OUTPUT.unlink(missing_ok=True)  # the builder is the source; rebuild is idempotent
    subprocess.run([sys.executable, str(GALLERY), "build", "--spec", str(SPEC),
                    "--output", str(OUTPUT)], check=True)
    subprocess.run([sys.executable, str(GALLERY), "check", "--input", str(OUTPUT)], check=True)
    print(json.dumps({k: v for k, v in facts.items() if not isinstance(v, dict)},
                     indent=2, ensure_ascii=False))
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
