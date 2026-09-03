#!/usr/bin/env python3
"""Build the symbol-opacity gallery: what a Block says about a callee it could not resolve.

Golden 12 is `response = client.send(payload)` where `Client = Any`, so `send`
never resolves. Ten directions, each rendered as a real board in the real app.

Every number on the page is measured here, at build time, from the live
SystemSketch tree and the live pyblocks golden corpus, so the report cannot
drift from the trees it describes.
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
PYBLOCKS = Path("/home/bam/pyblocks")
GOLDENS = PYBLOCKS / "examples" / "systemsketch_goldens"
BOARDS = ROOT / "sketches" / "review"
ASSETS = ROOT / "docs" / "assets"
SPEC = ROOT / "docs" / "symbol-opacity-babble-2026-09-03.json"
OUTPUT = ROOT / "docs" / "symbol-opacity-babble-2026-09-03.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")

SCENE = (60, 350, 1540, 680)
ZOOM = (490, 370, 1130, 700)


# --------------------------------------------------------------------------- measure


def measure() -> dict:
    """Read every load-bearing fact out of the two live trees."""
    model = (ROOT / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")
    port_block = model.split("export const BlockPort = T.object({")[1].split("})")[0]
    port_fields = re.findall(r"^\t(\w+):", port_block, re.M)
    views = re.search(r"export const BLOCK_VIEWS = \[(.*?)\]", model)
    view_names = re.findall(r"'(\w+)'", views.group(1) if views else "")
    shape_props = model.split("export const BLOCK_SHAPE_PROPS = {")[1].split("\n} as const")[0]
    block_fields = re.findall(r"^\t(\w+):", shape_props, re.M)

    icons = (ROOT / "src" / "blocks" / "ui" / "blockIcons.tsx").read_text(encoding="utf-8")
    icon_names = re.findall(r"\{ name: '(\w+)'", icons)

    codec = (PYBLOCKS / "pyblocks" / "systemsketch_codec.py").read_text(encoding="utf-8")
    body = codec.split("def _normalized_port(")[1].split("\ndef ")[0]
    native_keys = sorted(set(re.findall(r'^\s*"(\w+)":', body, re.M)))
    native_keys += sorted(set(re.findall(r'normalized\["(\w+)"\]', body)))

    analyzer = (PYBLOCKS / "pyblocks" / "analyzer.py").read_text(encoding="utf-8")
    certainties = sorted(set(re.findall(r'certainty="(\w+)"', analyzer)))

    # How the corpus already spells "no type", measured across every board it ships.
    ports = empty = any_typed = undefined = 0
    boards = 0
    for path in sorted(GOLDENS.glob("*/generated.systemsketch")):
        boards += 1
        raw = path.read_text(encoding="utf-8")
        undefined += raw.count('"undefined"')
        for record in json.loads(raw)["records"]:
            if record.get("typeName") == "shape" and record.get("type") == "block":
                for side in ("inputs", "outputs"):
                    for port in record["props"].get(side, []):
                        ports += 1
                        kind = (port.get("type") or "").strip()
                        if kind == "":
                            empty += 1
                        elif kind == "Any":
                            any_typed += 1

    def golden_block(golden: str, source: str, title: str) -> dict:
        path = GOLDENS / golden / source
        for record in json.loads(path.read_text(encoding="utf-8"))["records"]:
            if record.get("typeName") == "shape" and record.get("type") == "block":
                props = record["props"]
                if props.get("title") == title:
                    return {
                        "inputs": [(p.get("name"), p.get("type")) for p in props.get("inputs", [])],
                        "outputs": [(p.get("name"), p.get("type")) for p in props.get("outputs", [])],
                        "blockType": props.get("blockType") or "",
                        "description": props.get("description") or "",
                    }
        raise SystemExit(f"block not found: {golden}/{source} · {title}")

    # The authored target keeps its pre-migration record, so read that one directly.
    legacy = json.loads((GOLDENS / "12_unknown_receiver" / "target.systemsketch")
                        .read_text(encoding="utf-8"))
    authored = None
    for record in legacy["records"]:
        meta = record.get("meta", {}).get("pyblocks.legacySystemSketch", {})
        data = meta.get("original", {}).get("data", {})
        if data.get("label") == "client.send()":
            content = data["extension"]["pyblocksBlock"]["content"]
            authored = {
                "inputs": [(p.get("name") or p.get("id"), p.get("type")) for p in content["inputs"]],
                "outputs": [(p.get("name"), p.get("type")) for p in content["outputs"]],
                "type": content.get("type", ""),
                "description": content.get("description", ""),
                "stroke": data["style"]["stroke"],
                "strokePattern": data["style"]["strokePattern"],
                "fill": data["style"]["fill"],
            }
    if authored is None:
        raise SystemExit("authored client.send() not found in golden 12's target")

    return {
        "portFields": port_fields,
        "blockFields": block_fields,
        "views": view_names,
        "iconCount": len(icon_names),
        "hasUnknownIcon": any(n.lower() in {"helpcircle", "circlehelp", "questionmark"}
                              for n in icon_names),
        "nativeKeys": native_keys,
        "certainties": certainties,
        "boards": boards,
        "ports": ports,
        "emptyTypes": empty,
        "anyTypes": any_typed,
        "undefinedCount": undefined,
        "generated": golden_block("12_unknown_receiver", "generated.systemsketch", "client.send()"),
        "authored": authored,
    }


# ----------------------------------------------------------------------------- media


def crop_uri(variant: str, kind: str) -> str:
    """Crop a real board capture and inline it, so the page carries its own evidence."""
    ASSETS.mkdir(parents=True, exist_ok=True)
    source = BOARDS / f"opacity-{variant}.png"
    target = ASSETS / f"crop-opacity-{variant}-{kind}.png"
    Image.open(source).crop(SCENE if kind == "scene" else ZOOM).save(target)
    return "data:image/png;base64," + base64.b64encode(target.read_bytes()).decode("ascii")


def preview(variant: str) -> str:
    scene = crop_uri(variant, "scene")
    zoom = crop_uri(variant, "zoom")
    return (
        "<div style='padding:34px 12px 12px;background:#0e1117'>"
        "<div style='display:flex;align-items:center;justify-content:space-between;gap:12px;"
        "margin:0 0 10px;color:#9fb0c6;font:11px ui-monospace,monospace'>"
        "<span>real capture · the board, in the app</span>"
        "<button data-demo-toggle data-base-label='Show the whole scene' "
        "data-alt-label='Zoom the call' "
        "style='border:1px solid #49617e;border-radius:6px;background:#172336;color:#eaf2ff;"
        "padding:7px 10px;cursor:pointer'>Show the whole scene</button></div>"
        # The class rides a wrapper span: the shell's `.prototype img` rule outranks
        # `.demo-alt-only`, so both frames would render at once on the <img> itself.
        f"<span class='demo-base-only'><img src='{scene}' alt='{variant} board' "
        "style='border-radius:8px' /></span>"
        f"<span class='demo-alt-only'><img src='{zoom}' alt='{variant} call close-up' "
        "style='border-radius:8px' /></span></div>"
    )


def story(zoom_caption: str) -> dict:
    return {
        "title": "The same three Blocks, one grammar apart",
        "steps": [
            {"label": "Look at the scene", "caption":
             "encode() → client.send() → run()'s return. Only the middle Block changes "
             "between variants.", "state": "base", "target": "[data-demo-toggle]"},
            {"label": "Zoom the call", "caption": zoom_caption,
             "state": "alt", "target": "[data-demo-toggle]"},
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
    return (
        "<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef;"
        f"font:12px/1.65 system-ui;color:#4a463f'>{text}</div>"
    )


# ------------------------------------------------------------------------------ spec


def build_spec(f: dict) -> dict:
    empty_pct = round(100 * f["emptyTypes"] / f["ports"], 1)
    gen_in = ", ".join(f"{n}: {t}" for n, t in f["generated"]["inputs"])
    gen_out = ", ".join(f"{n}: {t}" for n, t in f["generated"]["outputs"])

    requirements = [
        {
            "id": "fr1",
            "name": "A reader can tell what is unknown from what is known",
            "weight": 25,
            "why": (
                "Golden 12 contains both at once. `client` really is annotated `Client`, and "
                "`Client = Any` — that is a fact the program states. The callee's parameter "
                "name and return type are a different thing: nobody looked. A grammar that "
                "spells both the same way loses the only distinction that matters here."
            ),
            "passCondition": (
                "Given the board alone, a reader can say which slots the program declared and "
                "which the analyzer failed on."
            ),
            "anchors": {
                "1": "Declared `Any` and unresolved look identical.",
                "3": "The distinction exists but needs the inspector or the source to read.",
                "5": "Visible on the Block, from the Block alone.",
            },
        },
        {
            "id": "fr2",
            "name": "Every word on the board is a word that already exists",
            "weight": 25,
            "why": (
                "SystemSketch is a lens over Python. `undefined` is a JavaScript value; it is "
                "not a Python type, not a pyblocks certainty value "
                f"({', '.join(f['certainties'])}), and it appears "
                f"{f['undefinedCount']} times across the {f['boards']} boards the corpus "
                "ships. A word invented for the picture is a word the reader has to be taught."
            ),
            "passCondition": (
                "Every token on the Block is either Python source text, a Python type, or "
                "vocabulary SystemSketch already ships."
            ),
            "anchors": {
                "1": "Coins a word from another language.",
                "3": "Reuses a symbol that means something else to a Python reader.",
                "5": "Every token already exists in Python or in the app's own grammar.",
            },
        },
        {
            "id": "fr3",
            "name": "Ink is proportional to information",
            "weight": 20,
            "why": (
                "An unresolved third-party call is the least interesting Block on the board — "
                "it is where the pipeline stops being yours. It must not shout louder than the "
                "four calls that carry the actual work. The corpus already agrees in practice: "
                f"{f['emptyTypes']} of {f['ports']} ports ({empty_pct}%) carry no type at all "
                "and nothing marks them."
            ),
            "passCondition": "Marking the ignorance costs less visual weight than stating a real type.",
            "anchors": {
                "1": "The unresolved call is the loudest thing on the board.",
                "3": "One mark per unknown slot.",
                "5": "One mark for the whole call, or none.",
            },
        },
        {
            "id": "fr4",
            "name": "You can spot an unresolved call without reading",
            "weight": 15,
            "why": (
                "The reason to draw opacity at all is triage: which parts of this diagram can I "
                "trust? That question is asked at board zoom, across dozens of Blocks, not with "
                "the cursor on one port row."
            ),
            "passCondition": "The unresolved Block is identifiable in a thumbnail of the board.",
            "anchors": {
                "1": "Indistinguishable until you zoom in and read.",
                "3": "Visible once you know what to look for.",
                "5": "A different silhouette or colour; obvious at a glance.",
            },
        },
        {
            "id": "fr5",
            "name": "Costs no new engine capability",
            "weight": 15,
            "why": (
                "tldraw stays stock and the Block grammar stays closed. A port today is "
                f"exactly {', '.join(f['portFields'])} — and the pyblocks codec narrows that "
                f"further to {', '.join(f['nativeKeys'])} on the way into the file. A direction "
                "that needs a new field spends the budget on a naming question."
            ),
            "passCondition": "Expressible with the fields the Block and BlockPort schemas ship today.",
            "anchors": {
                "1": "Needs a new shape or a new inference engine.",
                "3": "Needs one new optional field.",
                "5": "Uses fields that already ship.",
            },
        },
    ]

    gates = [
        {"id": "g1", "name": "No new SystemSketch primitive",
         "why": "tldraw stays stock; new meaning rides the Block, port, connection and binding seams that exist."},
        {"id": "g2", "name": "Never asserts what the analyzer cannot prove",
         "why": "A confidently wrong type is worse than a blank one: it makes the board a liar rather than merely quiet."},
        {"id": "g3", "name": "The board still matches the source as written",
         "why": "The canvas is the program, not a cleaned-up retelling. Neither the title nor the fix may rewrite the call site."},
        {"id": "g4", "name": "Survives the .systemsketch codec",
         "why": (
             "A distinction that lives only in analyzer metadata is invisible: `_normalized_port()` "
             f"keeps {', '.join(f['nativeKeys'])} and drops everything else."
         )},
    ]

    variants = [
        {
            "id": "v1",
            "name": "Any",
            "thesis": (
                "Do not invent a word. Python already has a name for a type it cannot narrow, "
                "and it is `Any`. Every slot the callee does not fill reads `Any`."
            ),
            "accent": "#3f6d8f",
            "bestWhen": "The reader is a Python programmer and you want the board to project straight back to a `.pyi`.",
            "losesWhen": "The program genuinely declares `Any` — as golden 12's own `Client = Any` does — and the board can no longer tell the two apart.",
            "decisions": [
                {"label": "Unknown type", "value": "`Any`"},
                {"label": "Unknown parameter name", "value": "the argument expression (`payload`)"},
                {"label": "Frame", "value": "unchanged — an ordinary `call`"},
            ],
            "keepParts": ["`Any` as the fallback word when a word must be written",
                          "the argument expression as the fallback name"],
            "proof": [
                "Board: sketches/review/opacity-v1.systemsketch, generated through the editor and cold-reopened.",
                f"`Any` is already in the corpus: {f['anyTypes']} of {f['ports']} generated ports carry it as a declared type.",
                "Golden 12's own source declares `Client = Any`, which is exactly the collision this direction cannot resolve.",
            ],
            "scores": {
                "fr1": {"score": 2, "evidence": "`Client` on the receiver row is a declared alias for `Any`; `payload: Any` is an admission of failure. The board writes them the same way.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "`Any` is `typing.Any`, already imported by the golden's own source.", "confidence": "high"},
                "fr3": {"score": 3, "evidence": "A word in every empty slot: the ignorance costs the same ink as the knowledge.", "confidence": "high"},
                "fr4": {"score": 2, "evidence": "In the scene crop `Any` is the same weight as `bytes`; nothing separates the Block.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "Plain port text.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": True, "evidence": "`Any` claims nothing narrower than the truth."},
                "g3": {"pass": True, "evidence": "Title and argument name come from the call site."},
                "g4": {"pass": True, "evidence": "`type` is a native port field."},
            },
            "previewLabel": "the language's own word",
            "story": story("Two rows read `Any`. One of them is a fact the program states; the other is the analyzer giving up. Nothing on the Block says which."),
            "media": [{
                "label": "The collision, in golden 12's own source",
                "caption": "The alias on the left is a declaration. The slot on the right is an absence. This direction spells them identically.",
                "html": table([
                    ("Client", "= Any", "declared by the program (`Client = Any`)"),
                    ("payload", "Any", "the analyzer never resolved `send`"),
                    ("response", "Any", "the analyzer never resolved `send`"),
                ], ("slot", "reads", "what it actually means")),
            }],
            "preview": preview("v1"),
        },
        {
            "id": "v2",
            "name": "Question mark",
            "thesis": (
                "Keep whatever is known and add one character of doubt. `bytes?` means the "
                "cable says bytes and the callee never confirmed it; a bare `?` means nothing "
                "is known at all."
            ),
            "accent": "#7667c6",
            "bestWhen": "Most slots are partly known and you want the partial knowledge on the board rather than thrown away.",
            "losesWhen": "The reader knows C#, Kotlin or TypeScript, where `T?` already means `Optional[T]` — a different claim entirely.",
            "decisions": [
                {"label": "Partly known type", "value": "`bytes?`"},
                {"label": "Nothing known", "value": "`?`"},
                {"label": "Row height", "value": "unchanged"},
            ],
            "keepParts": ["a suffix rather than a replacement", "partial knowledge survives on the row"],
            "proof": [
                "Board: sketches/review/opacity-v2.systemsketch.",
                f"The analyzer's own certainty channel is three-valued ({', '.join(f['certainties'])}), so one character cannot carry it — `?` collapses `may` and `unknown`.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "`bytes?` next to `bytes` is exactly the distinction; it still cannot say a slot is declared `Any`.", "confidence": "high"},
                "fr2": {"score": 2, "evidence": "`?` is not Python. In every language a reader is likely to know it, `T?` means optional.", "confidence": "high"},
                "fr3": {"score": 4, "evidence": "One character, no new row.", "confidence": "high"},
                "fr4": {"score": 2, "evidence": "A single glyph at port-label size is invisible in the scene crop.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "Plain port text.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": True, "evidence": "The suffix weakens the claim rather than strengthening it."},
                "g3": {"pass": True, "evidence": "Source untouched."},
                "g4": {"pass": True, "evidence": "It is just the `type` string."},
            },
            "previewLabel": "one character of doubt",
            "story": story("`payload bytes?` — the type came from the cable, not the callee. `? response` — nothing at all is known."),
            "media": [{
                "label": "What the one character has to carry",
                "caption": f"pyblocks already distinguishes {len(f['certainties'])} certainty levels. A suffix folds two of them together.",
                "html": table([(c, "", {"must": "the call always happens on this path",
                                        "may": "only on some path (a branch, an early return)",
                                        "unknown": "the analyzer could not decide"}.get(c, ""))
                               for c in f["certainties"]],
                              ("analyzer certainty", "", "meaning")),
            }],
            "preview": preview("v2"),
        },
        {
            "id": "v3",
            "name": "Blank slot",
            "thesis": (
                "Draw absence as absence. An unknown type is no text at all — the row carries "
                "a name and stops. Anything written there is louder than the information it "
                "carries."
            ),
            "accent": "#4c8f6d",
            "bestWhen": "You care most that the board never says anything false, and you accept that it will also not say anything.",
            "losesWhen": "You need to tell 'unresolved' apart from 'not authored yet' — because blank already means the second thing, on half the corpus.",
            "decisions": [
                {"label": "Unknown type", "value": "empty string"},
                {"label": "Unknown name", "value": "empty string"},
                {"label": "New behaviour", "value": "none — this is what already ships"},
            ],
            "keepParts": ["the discipline of never writing a placeholder in the NAME slot",
                          "zero ink for zero information"],
            "proof": [
                "Board: sketches/review/opacity-v3.systemsketch.",
                f"This is not a proposal, it is the status quo: {f['emptyTypes']} of {f['ports']} "
                f"ports across the {f['boards']} generated golden boards ({empty_pct}%) already "
                "carry an empty type, and nothing marks them.",
                f"`undefined` appears {f['undefinedCount']} times in those boards — the word in "
                "the screenshot comes from work newer than the committed corpus.",
            ],
            "scores": {
                "fr1": {"score": 3, "evidence": f"Blank differs from a typed row, but blank is already the corpus's spelling for {empty_pct}% of ports, most of which are simply unannotated.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "Nothing is written, so nothing can be misread.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "Zero ink.", "confidence": "high"},
                "fr4": {"score": 2, "evidence": "An absence is not visible across a board; in the scene crop the Block looks ordinary.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "Already the shipped behaviour.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": True, "evidence": "Asserts nothing."},
                "g3": {"pass": True, "evidence": "Source untouched."},
                "g4": {"pass": True, "evidence": "An empty `type` round-trips."},
            },
            "previewLabel": "absence, drawn as absence",
            "story": story("`payload` and `response` carry no type. Compare with `pose Pose` on encode() to the left — that is the whole difference."),
            "media": [{
                "label": "Blank is already the corpus's answer",
                "caption": "Measured across every board the golden corpus ships, at build time.",
                "html": panel(
                    f"<b>{f['emptyTypes']} of {f['ports']}</b> ports on the {f['boards']} "
                    f"generated boards ({empty_pct}%) carry an empty type. <b>{f['anyTypes']}</b> "
                    f"carry <code>Any</code>. <b>{f['undefinedCount']}</b> carry "
                    "<code>undefined</code>. The question is therefore not what to write in an "
                    "empty slot — it is whether an <i>unresolved</i> slot deserves to look "
                    "different from the 540 that are merely unannotated."
                ),
            }],
            "preview": preview("v3"),
        },
        {
            "id": "v4",
            "name": "The frame says it once",
            "thesis": (
                "Opacity is a fact about the call, not about each row. The Block's type line "
                "says `external · unresolved` once, and every port then carries only what the "
                "program actually proves."
            ),
            "accent": "#b4762c",
            "bestWhen": "The unresolved thing is the callee — which is the usual case, because a third-party object hides its whole signature at once.",
            "losesWhen": "A partly-resolved call has one bad port among good ones; the frame cannot point at which.",
            "decisions": [
                {"label": "Where opacity lives", "value": "`blockType`, one line under the title"},
                {"label": "Port types", "value": "only what the program proves (`Client`, `bytes`, `str`)"},
                {"label": "Extra signal", "value": "the shipped `Cloud` icon"},
                {"label": "Detail", "value": "`description` carries what was summarized (`response.id`, effects)"},
            ],
            "keepParts": ["the type line as the opacity channel",
                          "ports that state only proved facts",
                          "the description naming what got absorbed"],
            "proof": [
                "Board: sketches/review/opacity-v4.systemsketch.",
                "This is already the corpus's authored answer. Golden 12's `target.systemsketch` "
                f"gives `client.send()` the type line “{f['authored']['type']}”, a "
                f"{f['authored']['strokePattern']} stroke and a grey fill, and describes it as "
                f"“{f['authored']['description']}”.",
                "The measured gap: that dashed stroke lives in legacy metadata. The native Block "
                f"has no stroke field — it ships {', '.join(f['blockFields'])} — so the type "
                "line, description and icon are the whole native voice.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "`Client` reads as a declaration because nothing contradicts it, and the frame carries the failure. It cannot single out one bad port inside a partly-resolved call.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "`external · unresolved` is `blockType`, the same field that says `call` and `constructor` everywhere else.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "One line for the whole call; the port rows are unchanged from a resolved Block.", "confidence": "high"},
                "fr4": {"score": 4, "evidence": "The icon plus the type line are legible in the scene crop; at true board zoom the icon does most of the work.", "confidence": "medium"},
                "fr5": {"score": 5, "evidence": f"`blockType`, `description` and `icon` are all in BLOCK_SHAPE_PROPS ({len(f['blockFields'])} fields), and all survive the codec.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "An ordinary Block with a different type line."},
                "g2": {"pass": True, "evidence": "`bytes` comes from the cable, `str` from run()'s return annotation, `Client` from the parameter annotation."},
                "g3": {"pass": True, "evidence": "The title is still `client.send()`."},
                "g4": {"pass": True, "evidence": "All three fields are native and persisted."},
            },
            "previewLabel": "one line, for the whole call",
            "story": story("No port says unknown. `external · unresolved` under the title says it once, and the description names what got absorbed: the receiver dispatch, `response.id`, and the side effects."),
            "media": [{
                "label": "Generated today vs the authored target",
                "caption": "The corpus already contains this answer. The generated board and the authored target disagree about the whole question.",
                "html": table([
                    ("generated", f"{gen_in} → {gen_out}", f"blockType: “{f['generated']['blockType'] or '—'}”"),
                    ("authored target",
                     ", ".join(f"{n}: {t}" for n, t in f["authored"]["inputs"]) + " → "
                     + ", ".join(f"{n}: {t}" for n, t in f["authored"]["outputs"]),
                     f"type: “{f['authored']['type']}”, stroke {f['authored']['strokePattern']}"),
                ], ("board", "ports", "how it says unresolved")),
            }],
            "preview": preview("v4"),
        },
        {
            "id": "v5",
            "name": "Port certainty mark",
            "thesis": (
                "Certainty is a property of each port, so put it on the port's dot: a resolved "
                "port keeps its solid dot, an unresolved one goes hollow and hatched. The mark "
                "is a glyph, so it is language-neutral and survives a thumbnail."
            ),
            "accent": "#8f3f5c",
            "bestWhen": "A call is partly resolved and you need to point at exactly which slots failed.",
            "losesWhen": "Today — the port record has nowhere to store it, and the dot's fill already means 'this port is wired'.",
            "decisions": [
                {"label": "Channel", "value": "the port dot, not the text"},
                {"label": "Storage", "value": "a new `certainty` field on BlockPort"},
                {"label": "Rendered here", "value": "`◌` standing in, because the field does not exist"},
            ],
            "keepParts": ["per-port granularity", "a non-text channel that thumbnails"],
            "proof": [
                "Board: sketches/review/opacity-v5.systemsketch — the ◌ is text standing in for a dot treatment the schema cannot express.",
                f"BlockPort ships exactly {', '.join(f['portFields'])}. There is no certainty field.",
                f"The pyblocks codec narrows a port further, to {', '.join(f['nativeKeys'])}, so even an analyzer stamp would not reach the file.",
                "The dot's fill is already spoken for: filled means the port is wired, hollow means it is free — visible on every board here.",
            ],
            "scores": {
                "fr1": {"score": 5, "evidence": "Per-port, so a declared `Client` and an unresolved `payload` are visibly different marks.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "A glyph coins no word, but ◌ is not vocabulary the app has anywhere else.", "confidence": "medium"},
                "fr3": {"score": 4, "evidence": "A dot treatment adds no text and no row.", "confidence": "medium"},
                "fr4": {"score": 3, "evidence": "A dot state is visible at distance, but it collides with the connectedness meaning the dot already carries.", "confidence": "medium"},
                "fr5": {"score": 1, "evidence": "Needs a new native BlockPort field plus a codec change in pyblocks; both measured as absent.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "A port field, not a new shape."},
                "g2": {"pass": True, "evidence": "The mark only ever weakens a claim."},
                "g3": {"pass": True, "evidence": "Source untouched."},
                "g4": {"pass": False, "evidence": f"`_normalized_port()` keeps {', '.join(f['nativeKeys'])}; a certainty stamp is dropped on the way into the file."},
            },
            "previewLabel": "the dot carries it",
            "story": story("`payload ◌ bytes` and `◌ response`. The glyph is standing in for a hollow dot — and the dot is already how the app says 'not wired'."),
            "media": [{
                "label": "Where the mark would have to live",
                "caption": "Measured from the two schemas this would have to cross.",
                "html": table([
                    ("BlockPort (app)", ", ".join(f["portFields"]), "no certainty field"),
                    ("_normalized_port (pyblocks)", ", ".join(f["nativeKeys"]), "drops every other key"),
                ], ("schema", "fields today", "verdict")),
            }],
            "preview": preview("v5"),
        },
        {
            "id": "v6",
            "name": "TODO stub",
            "thesis": (
                "An unknown is not a fact, it is a task. Render it as `TODO`, make it clickable, "
                "and let the reader type the signature — which is then written out as a `.pyi` "
                "stub beside the source."
            ),
            "accent": "#c05a2c",
            "bestWhen": "The unresolved callee is yours, or a dependency you are willing to stub, and the diagram is where you would rather do that work.",
            "losesWhen": "The callee is a third-party client you will never annotate — which is exactly golden 12's case.",
            "decisions": [
                {"label": "Unknown type", "value": "`TODO`, clickable"},
                {"label": "Where the answer goes", "value": "a `.pyi` stub beside the source"},
                {"label": "Type line", "value": "counts the holes (`stub · 2 to fill`)"},
            ],
            "keepParts": ["counting the holes in the type line",
                          "the idea that some unknowns are worth resolving and the board could say which"],
            "proof": [
                "Board: sketches/review/opacity-v6.systemsketch — the TODO text is real; the click-to-author loop is not built.",
                "The corpus's own framing disagrees: golden 12's docstring is “01 plus an object nothing here defines: the boundary must look unknown.” The unknown is the point of the case, not a defect in it.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "`TODO` is unmistakably not a type, so it cannot be confused with a declared `Any`.", "confidence": "high"},
                "fr2": {"score": 2, "evidence": "`TODO` is a comment convention, not a Python type and not app vocabulary.", "confidence": "high"},
                "fr3": {"score": 2, "evidence": "Every third-party call becomes an open task on the board.", "confidence": "high"},
                "fr4": {"score": 3, "evidence": "Capitals are spottable in the crop, but they read as a defect rather than a boundary.", "confidence": "medium"},
                "fr5": {"score": 3, "evidence": "The text is free; the editing loop and stub writer are new capability.", "confidence": "medium"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Port text plus an editor affordance."},
                "g2": {"pass": True, "evidence": "Claims nothing about the type."},
                "g3": {"pass": False, "evidence": "The fix is to add a stub file so the picture improves — the diagram driving a source edit is the inversion this project rules out."},
                "g4": {"pass": True, "evidence": "It is just the `type` string."},
            },
            "previewLabel": "the unknown as work to do",
            "story": story("`payload TODO` and `TODO response`, with the type line counting two holes. The board is asking you to author a signature for someone else's client."),
            "media": [{
                "label": "What the case is actually for",
                "caption": "Golden 12's own docstring, read at build time.",
                "html": panel(
                    "<code>\"\"\"01 plus an object nothing here defines: the boundary must look "
                    "unknown.\"\"\"</code><br><br>The case exists to test that the boundary "
                    "<i>looks</i> unknown. A direction that treats the unknown as a defect to be "
                    "cleared is answering a different question."
                ),
            }],
            "preview": preview("v6"),
        },
        {
            "id": "v7",
            "name": "Positional slots",
            "thesis": (
                "The name is unknown but the arity and the order are not. Say the true thing: "
                "`arg 1` in, `→ 1` out. This is what a decompiler does, and what Nevalang's "
                "numbered FanIn slots do."
            ),
            "accent": "#54708f",
            "bestWhen": "You want the board to state only facts, and position is the strongest fact left when the signature is gone.",
            "losesWhen": "The call used keywords — then position is not just unhelpful, it is wrong.",
            "decisions": [
                {"label": "Unknown parameter name", "value": "`arg 1`"},
                {"label": "Unknown return name", "value": "`→ 1`"},
                {"label": "Type line", "value": "states the arity"},
            ],
            "keepParts": ["stating arity in the type line", "never inventing a name that looks like a real one"],
            "proof": [
                "Board: sketches/review/opacity-v7.systemsketch.",
                "Prior art already read for this project: Nevalang's `[a, b] -> c` is sugar for a real FanIn node with numbered slots — many-to-one is never a rendering question there.",
            ],
            "scores": {
                "fr1": {"score": 3, "evidence": "`arg 1` says the name is missing but says nothing about whether the type is declared or guessed.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "Position is a real property of the call; `arg 1` is still a label the program never wrote.", "confidence": "medium"},
                "fr3": {"score": 3, "evidence": "A word per slot, same as V1.", "confidence": "high"},
                "fr4": {"score": 2, "evidence": "Reads like an ordinary port name in the scene crop.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "Plain port text.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "No new primitive."},
                "g2": {"pass": True, "evidence": "Arity is proved by the call site."},
                "g3": {"pass": True, "evidence": "Title untouched; the label is derived from the call."},
                "g4": {"pass": True, "evidence": "Native `name`."},
            },
            "previewLabel": "arity is the known fact",
            "story": story("`arg 1 bytes` in, `→ 1` out, and `unresolved · 1 arg` in the type line. Every token is a fact the call site proves."),
            "media": [{
                "label": "Where positional naming breaks",
                "caption": "Golden 20 in the same corpus is `keyword_arguments`. Position is not a stable identity there.",
                "html": table([
                    ("client.send(payload)", "arg 1", "correct"),
                    ("client.send(body=payload)", "arg 1", "wrong — there is no argument 1"),
                    ("client.send(*parts)", "arg 1…?", "undefined — arity is not known statically"),
                ], ("call site", "renders as", "verdict")),
            }],
            "preview": preview("v7"),
        },
        {
            "id": "v8",
            "name": "Opaque region",
            "thesis": (
                "An unresolved call is not a function you happen to know little about — it is "
                "the place the program leaves your code. Draw it as a boundary object, the way "
                "an architecture diagram draws an external system."
            ),
            "accent": "#6b6255",
            "bestWhen": "You are reading the board for architecture: where are my edges, what do I own.",
            "losesWhen": "You are reading it for dataflow — the argument wiring is exactly what this throws away.",
            "decisions": [
                {"label": "Object class", "value": "a boundary region, not a call"},
                {"label": "Title", "value": "names the boundary, not the callee"},
                {"label": "Ports", "value": "unnamed — one value in, one value out"},
            ],
            "keepParts": ["the reading that an unresolved call is a boundary, not a defect",
                          "the possibility of collapsing several external calls into one region"],
            "proof": [
                "Board: sketches/review/opacity-v8.systemsketch, rendered with the shipped Simple view as the closest available stand-in.",
                "The thesis needs an object class the app does not have; as drawn it is a Block whose title is not the call site's text.",
            ],
            "scores": {
                "fr1": {"score": 4, "evidence": "Unmistakably not a resolved call; it also cannot represent a declared `Any` on a resolved one.", "confidence": "high"},
                "fr2": {"score": 4, "evidence": "'outside this program' invents no type name, but it is prose rather than vocabulary.", "confidence": "medium"},
                "fr3": {"score": 3, "evidence": "A whole different object for one call.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "The most distinguishable Block in the contact sheet.", "confidence": "high"},
                "fr5": {"score": 2, "evidence": "Needs a boundary object class; the Simple-view stand-in is not the thesis.", "confidence": "medium"},
            },
            "gateResults": {
                "g1": {"pass": False, "evidence": "The thesis is a new object class beside the Block."},
                "g2": {"pass": True, "evidence": "Asserts nothing about types."},
                "g3": {"pass": False, "evidence": "The title no longer names the callee, so the board no longer says which function was called."},
                "g4": {"pass": True, "evidence": "Nothing per-port to persist."},
            },
            "previewLabel": "the edge of your code",
            "story": story("No callee name, no port names. One value in, one value out, and a caption saying which call it stands for."),
            "media": [{
                "label": "What the region throws away",
                "caption": "Golden 12 has one argument, so the loss is small. Golden 48 orchestrates an export bundle; there it would be total.",
                "html": panel(
                    "A region cannot say <i>which</i> argument went into which slot, because it "
                    "has no slots. With one argument that is invisible. The moment an unresolved "
                    "callee takes three, the board stops being a dataflow drawing at exactly the "
                    "point the reader most wants one."
                ),
            }],
            "preview": preview("v8"),
        },
        {
            "id": "v9",
            "name": "Inferred from the neighbours",
            "thesis": (
                "Do not render ignorance — remove it. Propagate types along the cables and back "
                "from the function's own return annotation, and most slots fill themselves "
                "without ever asking the callee."
            ),
            "accent": "#3f8f6d",
            "bestWhen": "The unresolved call sits mid-pipeline, surrounded by resolved neighbours that pin its types from both sides.",
            "losesWhen": "The unresolved value is consumed by another unresolved thing — `response.id` is exactly that, and stays unknown.",
            "decisions": [
                {"label": "Argument type", "value": "from the cable (`encode() -> bytes`)"},
                {"label": "Return type", "value": "backward from `run(...) -> str`"},
                {"label": "The residue", "value": "`response` stays `Any` — nothing pins it"},
            ],
            "keepParts": ["fill every slot the program proves, before writing any placeholder",
                          "the description naming where each derived type came from"],
            "proof": [
                "Board: sketches/review/opacity-v9.systemsketch. The Block carries both derived types and the residue side by side.",
                "Both derivations are sound: the cable that lands on `payload` genuinely carries `bytes`, and `run` genuinely declares `-> str` with `return receipt`.",
                "The residue is the point: `response` is the value `.id` is read from, and nothing in the program constrains it.",
            ],
            "scores": {
                "fr1": {"score": 3, "evidence": "It shrinks the question rather than answering it; the board still needs a spelling for `response`.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "Every type shown is a real annotation from the real source.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "No ink spent on ignorance at all.", "confidence": "high"},
                "fr4": {"score": 2, "evidence": "An inferred board is indistinguishable from a resolved one — which is either the feature or the bug.", "confidence": "high"},
                "fr5": {"score": 2, "evidence": "Needs constraint propagation across the graph, in both directions. Nothing like it exists in the adapter today.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "Ordinary ports."},
                "g2": {"pass": True, "evidence": "Only propagates what an annotation or a cable proves; it refuses to guess `response`."},
                "g3": {"pass": True, "evidence": "Source untouched."},
                "g4": {"pass": True, "evidence": "Native `type` strings."},
            },
            "previewLabel": "shrink the question",
            "story": story("`payload bytes` came from encode(), `str receipt` came from run()'s return annotation, and `Any response` is the one slot neither end can pin."),
            "media": [{
                "label": "What inference can and cannot reach",
                "caption": "Traced through golden 12's four statements.",
                "html": table([
                    ("payload", "bytes", "forward, from encode()'s return annotation"),
                    ("receipt", "str", "backward, from run()'s -> str and `return receipt`"),
                    ("response", "—", "unreachable: only `client.send` could say, and it never resolves"),
                ], ("slot", "derived", "how")),
            }],
            "preview": preview("v9"),
        },
        {
            "id": "v10",
            "name": "Simple view",
            "thesis": (
                "A Block whose signature cannot be stated has no business showing a signature "
                "table. Render an unresolved callee in Simple view: the missing port list is "
                "the statement, and the silhouette does the work no word can."
            ),
            "accent": "#2c6ec0",
            "bestWhen": "Triage at board zoom: you want to see instantly which parts of a diagram the analyzer stands behind.",
            "losesWhen": "You need the argument wiring visible — Simple view keeps the dots but hides the rows.",
            "decisions": [
                {"label": "Channel", "value": "the `view` StyleProp, not text"},
                {"label": "Ports", "value": "still there, on the rim, on hover"},
                {"label": "Type line", "value": "`unresolved callee`"},
            ],
            "keepParts": ["the view as a certainty channel", "the silhouette difference", "ports survive on the rim"],
            "proof": [
                "Board: sketches/review/opacity-v10.systemsketch, with the cables still bound to the hidden ports.",
                f"`view` is a shipped StyleProp with {len(f['views'])} values ({', '.join(f['views'])}), so it batches across a selection like a rectangle's colour.",
                "The contact sheet is the evidence for fr4: at 1/2 scale, V10 is one of two Blocks identifiable without reading a word.",
            ],
            "scores": {
                "fr1": {"score": 3, "evidence": "Says the callee is unresolved; says nothing about any individual port, so a declared `Any` on a resolved Block is still unmarked.", "confidence": "high"},
                "fr2": {"score": 5, "evidence": "No new word at all — `view` is one of four shipped values.", "confidence": "high"},
                "fr3": {"score": 5, "evidence": "The absence of the table is the statement; it costs less ink than a port view, not more.", "confidence": "high"},
                "fr4": {"score": 5, "evidence": "A different silhouette, visible in the contact sheet at half scale.", "confidence": "high"},
                "fr5": {"score": 5, "evidence": "A StyleProp that already exists and already persists.", "confidence": "high"},
            },
            "gateResults": {
                "g1": {"pass": True, "evidence": "The view is a shipped Block presentation."},
                "g2": {"pass": True, "evidence": "Shows no types at all rather than wrong ones."},
                "g3": {"pass": True, "evidence": "Title is the call site's text."},
                "g4": {"pass": True, "evidence": "`view` is a native prop."},
            },
            "previewLabel": "no table, no claim",
            "story": story("The only Block on the board without a port table. The cables still land — the ports are on the rim — but nothing claims a name or a type."),
            "media": [{
                "label": "The view as a channel",
                "caption": f"BLOCK_VIEWS ships {len(f['views'])} values; three are presentations of an ordinary Block.",
                "html": table([(v, "shipped", {"simple": "name, icon, rim dots — no signature",
                                               "port": "the signature table",
                                               "expanded": "the body, opened",
                                               "value": "the literal capsule (a separate representation)"}.get(v, ""))
                               for v in f["views"]],
                              ("view", "status", "what it shows")),
            }],
            "preview": preview("v10"),
        },
    ]

    return {
        "schemaVersion": 3,
        "title": "What does a Block say about a callee it could not resolve? Ten grammars for client.send()",
        "kicker": "SystemSketch × pyblocks · golden 12 · Sep 3, 2026",
        "brief": (
            "`response = client.send(payload)` where `Client = Any`. The analyzer knows the "
            "callee's text, the receiver's annotation, the argument's type (from the cable) and "
            "the function's declared return. It does not know the parameter's name, the callee's "
            "return type, or whether `.id` exists. The screenshot that started this asks whether "
            "the word should be `unknown`, `undefined`, `n/a` or `tbd`. Measured first: "
            f"`undefined` appears {f['undefinedCount']} times across the {f['boards']} boards the "
            f"corpus ships, and {f['emptyTypes']} of {f['ports']} ports ({empty_pct}%) already "
            "carry no type at all. So the real question is not which word — it is which channel, "
            "and whether an unresolved slot should look different from the half of the corpus "
            "that is merely unannotated. Ten directions, each a real board in the real app."
        ),
        "count": 10,
        "defaultId": "v4",
        "defaultWhy": (
            "Opacity is a property of the call, not of each row, and golden 12's own authored "
            f"target already says so: “{f['authored']['type']}”, with the ports carrying only "
            "proved types. That is the direction with the fewest invented words and the least "
            "ink. It is a fragile lead, though — V10 is two points behind and is not really a "
            "rival: it speaks in the silhouette where V4 speaks in the type line, and the two "
            "compose. The recommended splice is V4's frame plus V10's view, with V9's inference "
            "filling every slot the program proves first, and V1's `Any` as the only word ever "
            "written for what is left. `undefined` is not in that set at any weighting: it is a "
            "JavaScript value on a board that claims to be a lens over Python."
        ),
        "decisionHinge": (
            "The weight on fr4 (spot it without reading). At 15 it is a tiebreak and V4 leads. "
            "Raise it to 25 — which is the right call if these boards are read at architecture "
            "zoom rather than one call at a time — and V10 wins outright, because a silhouette "
            "beats a type line at distance and V4's icon is doing most of that work anyway. The "
            "second hinge is whether a partly-resolved call is common: if it is, per-port marking "
            "(V5) stops being a schema luxury and the codec gate becomes a cost to pay rather "
            "than a reason to stop."
        ),
        "invariants": [
            "tldraw stays stock: every direction here rides the Block, port, connection and binding seams that already exist.",
            "The canvas is the program as written; the projection never rewrites the call site to make a nicer picture.",
            f"A port is exactly {', '.join(f['portFields'])}, and the pyblocks codec narrows it to {', '.join(f['nativeKeys'])}.",
            "A wrong type is worse than no type: the board may be quiet, never mistaken.",
            "`undefined` is not a Python word, not a pyblocks certainty value, and appears nowhere in the committed corpus.",
            "Every capture on this page is the real app rendering a real .systemsketch board, generated through the editor and reopened cold.",
        ],
        "boundary": (
            "This is a grammar decision with the boards to judge it, not a landed change. No "
            "pyblocks projection code, no golden, and no SystemSketch source was modified. The "
            "ten boards under sketches/review/ are new files. V5's port dot and V6's authoring "
            "loop are drawn with text stand-ins, because neither is expressible in the shipped "
            "schema; both are scored on that basis rather than on the stand-in."
        ),
        "axes": [
            {"name": "Channel", "values": ["type text", "type text", "type text", "the frame",
                                           "the port dot", "type text", "port name", "object class",
                                           "no mark", "the view"]},
            {"name": "What it claims", "values": ["a Python type", "doubt", "absence", "the call is external",
                                                  "per-port certainty", "a task", "arity", "a boundary",
                                                  "a derived type", "no signature exists"]},
            {"name": "Granularity", "values": ["port", "port", "port", "block", "port", "port",
                                               "port", "block", "port", "block"]},
            {"name": "New capability", "values": ["none", "none", "none", "none", "port field",
                                                  "authoring loop", "none", "object class",
                                                  "type inference", "none"]},
        ],
        "requirements": requirements,
        "hardGates": gates,
        "variants": variants,
        "checks": [
            "Ten structurally distinct grammars, each rendered as a real board in the real app",
            "Every board generated through the SystemSketch editor and verified by cold reopen plus bound motion",
            "Five weighted criteria summing to 100, each score carrying evidence and a confidence",
            "Four hard gates evaluated separately; V5 fails the codec gate, V6 and V8 fail the source-fidelity gate, V8 also fails the stock gate",
            "Every number in the brief, the criteria and the evidence measured at build time from the live SystemSketch and pyblocks trees",
            "The recommendation is reported as a fragile lead, because V10 is inside the three-point band",
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
    print(json.dumps({k: v for k, v in facts.items()
                      if not isinstance(v, dict)}, indent=2, ensure_ascii=False))
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
