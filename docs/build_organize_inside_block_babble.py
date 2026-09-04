#!/usr/bin/env python3
"""Build the five-direction gallery for organizing children inside an Expanded Block."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "docs" / "organize-inside-block-babble-2026-09-02.json"
OUTPUT = ROOT / "docs" / "organize-inside-block-babble-2026-09-02.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")


def cable(path: str, color: str = "#91a0b5", width: int = 2, dash: str = "") -> str:
    dash_attr = f" stroke-dasharray='{dash}'" if dash else ""
    return (
        f"<path d='{path}' fill='none' stroke='{color}' stroke-width='{width}'"
        f" stroke-linejoin='round' stroke-linecap='round'{dash_attr}/>"
    )


def port(x: int, y: int, color: str = "#d4a72c") -> str:
    return (
        f"<circle cx='{x}' cy='{y}' r='5' fill='#111925' stroke='{color}' stroke-width='2'/>"
    )


def node(x: int, y: int, width: int, height: int, name: str, inputs: list[int], outputs: list[int]) -> str:
    input_ports = "".join(port(x, y + offset) for offset in inputs)
    output_ports = "".join(port(x + width, y + offset) for offset in outputs)
    return (
        f"<g><rect x='{x}' y='{y}' width='{width}' height='{height}' rx='9' fill='#151f2d'"
        " stroke='#73859e' stroke-width='1.5'/>"
        f"<line x1='{x}' y1='{y + 31}' x2='{x + width}' y2='{y + 31}' stroke='#314055'/>"
        f"<text x='{x + 12}' y='{y + 22}' fill='#f4f7fb' font-size='16' font-family='ui-monospace,monospace'>{name}</text>"
        f"{input_ports}{output_ports}</g>"
    )


def frame(ghost: bool = False, x: int = 20, y: int = 20, width: int = 740, height: int = 340) -> str:
    stroke = "#d45f6a" if ghost else "#728199"
    dash = " stroke-dasharray='7 6'" if ghost else ""
    opacity = " opacity='0.5'" if ghost else ""
    return (
        f"<g{opacity}><rect x='{x}' y='{y}' width='{width}' height='{height}' rx='10' fill='none'"
        f" stroke='{stroke}' stroke-width='1.5'{dash}/>"
        f"<line x1='{x}' y1='{y + 42}' x2='{x + width}' y2='{y + 42}' stroke='{stroke}'/>"
        f"<text x='{x + 14}' y='{y + 28}' fill='#eef3f9' font-size='19' font-family='ui-monospace,monospace'>run()</text></g>"
    )


def boundary_ports(x_left: int = 20, x_right: int = 760) -> str:
    labels = (
        "<text x='31' y='106' fill='#aebbd0' font-size='10' font-family='ui-monospace,monospace'>raw bytes</text>"
        "<text x='31' y='226' fill='#aebbd0' font-size='10' font-family='ui-monospace,monospace'>gain float</text>"
        "<text x='31' y='309' fill='#aebbd0' font-size='10' font-family='ui-monospace,monospace'>transform Estimator</text>"
        "<text x='700' y='176' fill='#aebbd0' font-size='10' font-family='ui-monospace,monospace'>bytes</text>"
    )
    return (
        labels
        + port(x_left, 112)
        + port(x_left, 232)
        + port(x_left, 315)
        + port(x_right, 182)
    )


def svg_shell(body: str, label: str, suffix: str) -> str:
    return f"""
<svg viewBox='0 0 780 390' role='img' aria-label='{label}' style='display:block;width:100%;height:auto;background:#0d141f;border:1px solid #26344a;border-radius:8px'>
  <defs>
    <pattern id='grid-{suffix}' width='20' height='20' patternUnits='userSpaceOnUse'>
      <path d='M 20 0 L 0 0 0 20' fill='none' stroke='#1d2a3b' stroke-width='1'/>
    </pattern>
  </defs>
  <rect width='780' height='390' fill='url(#grid-{suffix})'/>
  {body}
</svg>"""


def before_svg(suffix: str) -> str:
    body = [frame(), boundary_ports()]
    body += [
        cable("M20 112 H290 V271 H318"),
        cable("M20 232 H150 V123 H197"),
        cable("M20 315 H275 V291 H318"),
        cable("M347 123 H510 V276 H542"),
        cable("M488 271 H520 V276 H542"),
        cable("M712 276 H735 V182 H760"),
        node(197, 91, 150, 72, "decode()", [32], [32]),
        node(318, 237, 170, 108, "transform()", [34, 54, 74], [34]),
        node(542, 244, 170, 72, "encode()", [32], [32]),
        "<text x='42' y='348' fill='#e7a64b' font-size='11' font-family='ui-monospace,monospace'>same fixture · selected children only</text>",
    ]
    return svg_shell("".join(body), "Scrambled child Blocks before organize", f"before-{suffix}")


def after_svg(kind: str) -> str:
    body: list[str] = []
    if kind == "compound":
        body += [frame(ghost=True)]
        body += [
            "<rect x='105' y='84' width='570' height='222' rx='10' fill='#101925' stroke='#74a7ff' stroke-width='2'/>",
            "<line x1='105' y1='121' x2='675' y2='121' stroke='#3a5270'/>",
            "<text x='119' y='108' fill='#eef3f9' font-size='17' font-family='ui-monospace,monospace'>run() · ELK output</text>",
            "<text x='475' y='105' fill='#ff9ca5' font-size='10' font-family='ui-monospace,monospace'>1120×460 → 784×194</text>",
            cable("M105 164 H135"),
            cable("M275 164 H315"),
            cable("M475 164 H515"),
            cable("M655 164 H675"),
            node(135, 132, 140, 64, "decode()", [32], [32]),
            node(315, 132, 160, 86, "transform()", [32, 52, 70], [32]),
            node(515, 132, 140, 64, "encode()", [32], [32]),
            port(105, 164, "#74a7ff"),
            port(675, 164, "#74a7ff"),
            "<text x='214' y='286' fill='#ff9ca5' font-size='11' font-family='ui-monospace,monospace'>original frame and port rows were not preserved</text>",
        ]
        return svg_shell("".join(body), "Literal compound parent result", "compound")

    body += [frame(), boundary_ports()]
    if kind == "rails":
        body += [
            "<line x1='34' y1='66' x2='34' y2='350' stroke='#54d7d0' stroke-width='2' stroke-dasharray='5 5'/>",
            "<line x1='746' y1='66' x2='746' y2='350' stroke='#54d7d0' stroke-width='2' stroke-dasharray='5 5'/>",
            "<text x='43' y='79' fill='#54d7d0' font-size='10' font-family='ui-monospace,monospace'>layout-only rails</text>",
            cable("M20 112 H100", "#94a4b9"),
            cable("M250 114 H286 V184 H310"),
            cable("M20 232 H280 V204 H310"),
            cable("M20 315 H292 V224 H310"),
            cable("M480 184 H505 V164 H535"),
            cable("M705 164 H728 V182 H760"),
            node(100, 82, 150, 72, "decode()", [30], [32]),
            node(310, 150, 170, 108, "transform()", [34, 54, 74], [34]),
            node(535, 132, 170, 72, "encode()", [32], [32]),
            "<text x='43' y='348' fill='#54d7d0' font-size='10' font-family='ui-monospace,monospace'>cyan objects are discarded before editor.updateShapes()</text>",
        ]
    elif kind == "satellites":
        body += [
            cable("M38 112 V315", "#54d7d0", 1, "4 5"),
            cable("M742 182 V315", "#54d7d0", 1, "4 5"),
            "".join(
                f"<rect x='{x-5}' y='{y-5}' width='10' height='10' transform='rotate(45 {x} {y})' fill='#163338' stroke='#54d7d0'/>"
                for x, y in [(38, 112), (38, 232), (38, 315), (742, 182)]
            ),
            cable("M20 112 H100"),
            cable("M250 112 H290 V176 H315"),
            cable("M20 232 H276 V196 H315"),
            cable("M20 315 H295 V216 H315"),
            cable("M485 176 H530 V166 H545"),
            cable("M715 166 H735 V182 H760"),
            node(100, 82, 150, 72, "decode()", [30], [30]),
            node(315, 142, 170, 108, "transform()", [34, 54, 74], [34]),
            node(545, 134, 170, 72, "encode()", [32], [32]),
            "<text x='49' y='343' fill='#54d7d0' font-size='10' font-family='ui-monospace,monospace'>one proxy per port · ordering spine prevents permutation</text>",
        ]
    elif kind == "reconciler":
        body += [
            "<rect x='112' y='120' width='150' height='72' rx='9' fill='none' stroke='#5d6879' stroke-dasharray='5 5'/>",
            "<rect x='300' y='113' width='170' height='108' rx='9' fill='none' stroke='#5d6879' stroke-dasharray='5 5'/>",
            "<rect x='530' y='120' width='170' height='72' rx='9' fill='none' stroke='#5d6879' stroke-dasharray='5 5'/>",
            cable("M188 120 V82", "#e7a64b", 2, "4 4"),
            cable("M385 113 V178", "#e7a64b", 2, "4 4"),
            cable("M615 120 V150", "#e7a64b", 2, "4 4"),
            cable("M20 112 H112"),
            cable("M262 112 H300 V212 H315"),
            cable("M20 232 H315"),
            cable("M20 315 H286 V252 H315"),
            cable("M485 212 H520 V182 H530"),
            cable("M700 182 H760"),
            node(112, 82, 150, 72, "decode()", [30], [30]),
            node(315, 178, 170, 108, "transform()", [34, 54, 74], [34]),
            node(530, 150, 170, 72, "encode()", [32], [32]),
            "<text x='43' y='347' fill='#e7a64b' font-size='10' font-family='ui-monospace,monospace'>dashed boxes = ELK proposal · amber vectors = constraint pass</text>",
        ]
    elif kind == "lanes":
        body += [
            "<rect x='38' y='91' width='704' height='43' fill='#24465a' opacity='0.28'/>",
            "<rect x='38' y='211' width='704' height='43' fill='#4d3f68' opacity='0.28'/>",
            "<rect x='38' y='294' width='704' height='43' fill='#68463c' opacity='0.25'/>",
            "<text x='47' y='102' fill='#7bd4ee' font-size='9' font-family='ui-monospace,monospace'>raw lane</text>",
            "<text x='47' y='222' fill='#c6a7ff' font-size='9' font-family='ui-monospace,monospace'>gain lane</text>",
            "<text x='47' y='305' fill='#f1b38d' font-size='9' font-family='ui-monospace,monospace'>estimator lane</text>",
            cable("M20 112 H100"),
            cable("M250 112 H310 V198 H325"),
            cable("M20 232 H325"),
            cable("M20 315 H298 V238 H325"),
            cable("M495 198 H525 V182 H545"),
            cable("M715 182 H760"),
            node(100, 82, 150, 72, "decode()", [30], [30]),
            node(325, 164, 170, 108, "transform()", [34, 54, 74], [34]),
            node(545, 150, 170, 72, "encode()", [32], [32]),
            "<text x='410' y='343' fill='#f0bd74' font-size='10' font-family='ui-monospace,monospace'>ports own lanes; topology packs within them</text>",
        ]
    else:
        raise ValueError(kind)
    return svg_shell("".join(body), f"Organized result for {kind}", kind)


def preview(kind: str, label: str) -> str:
    return f"""
<div style='padding:12px;background:#0a1019'>
  <div style='display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px;color:#aebbd0;font:11px ui-monospace,monospace'>
    <span>{label}</span>
    <button data-demo-toggle data-base-label='Show solver result' data-alt-label='Show messy input' style='border:1px solid #49617e;border-radius:6px;background:#172336;color:#eaf2ff;padding:7px 10px;cursor:pointer'>Show solver result</button>
  </div>
  <div class='demo-base-only'>{before_svg(kind)}</div>
  <div class='demo-alt-only'>{after_svg(kind)}</div>
</div>"""


def architecture(*parts: str, note: str) -> str:
    boxes = []
    for index, part in enumerate(parts):
        if index:
            boxes.append("<b style='color:#8b8174;font-size:18px'>→</b>")
        boxes.append(
            "<span style='display:inline-flex;align-items:center;min-height:42px;padding:8px 10px;border:1px solid #cfc6b9;border-radius:6px;background:#fff;font:600 11px ui-monospace,monospace'>"
            + part
            + "</span>"
        )
    return (
        "<div style='padding:14px;border:1px solid #d8d0c4;background:#f8f5ef'>"
        "<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap'>"
        + "".join(boxes)
        + "</div><p style='margin:10px 0 0;color:#6e6a63;font-size:12px'>"
        + note
        + "</p></div>"
    )


requirements = [
    {
        "id": "fr1",
        "name": "Boundary-port legibility",
        "weight": 30,
        "why": "The parent boundary is the stable interface. Its input/output identities and row order should visibly influence the interior arrangement.",
        "passCondition": "The run() fixture produces short, ordered boundary runs and never permutes raw, gain, Estimator, or bytes.",
        "anchors": {
            "1": "Parent ports are ignored or reordered.",
            "3": "The boundary influences broad direction, but several avoidable doglegs remain.",
            "5": "Port order is exact and the solver minimizes row error wherever the geometry permits.",
        },
    },
    {
        "id": "fr2",
        "name": "Interior topology readability",
        "weight": 25,
        "why": "Boundary alignment is not useful if decode → transform → encode becomes longer, crossed, or overlapping.",
        "passCondition": "The selected child graph remains left-to-right, non-overlapping, and no more crossed than the current ELK result.",
        "anchors": {
            "1": "Boundary placement dominates and damages the child graph.",
            "3": "The main path reads, with visible detours or weak packing.",
            "5": "The full child topology and its port offsets remain first-class solver inputs.",
        },
    },
    {
        "id": "fr3",
        "name": "Semantic fidelity",
        "weight": 20,
        "why": "A virtual parent is useful only as a layout device; SystemSketch's real parentId, Block IDs, binding faces, and routing authority must remain canonical.",
        "passCondition": "The solve persists only positions for selected child Blocks; no proxy shape, proxy binding, or ELK route enters the document.",
        "anchors": {
            "1": "The proposal adds persisted fake Blocks or competes with tldraw containment/routing.",
            "3": "It is mostly transient but duplicates meaningful document semantics.",
            "5": "Every virtual object is a disposable adapter over existing canonical records.",
        },
    },
    {
        "id": "fr4",
        "name": "Fixed-frame safety",
        "weight": 15,
        "why": "Expanded is a free frame: organizing its contents must not silently resize the Block or clip children beyond frameInterior.",
        "passCondition": "All moved child bounds fit the existing drawable interior; an infeasible solve is a no-op with a clear capacity result.",
        "anchors": {
            "1": "The parent resizes or children silently overflow.",
            "3": "Common cases fit, but overflow behavior is heuristic.",
            "5": "Fit is validated as a hard postcondition with a deterministic failure path.",
        },
    },
    {
        "id": "fr5",
        "name": "Implementation fit",
        "weight": 10,
        "why": "The safest port should extend organizeGraph and reuse ELK 0.12.0, not introduce a second persistent graph or general constraint engine.",
        "passCondition": "The design is a narrow adapter around collectOrganizeEdges, organizeGraph, layoutBlock.frameInterior, and editor.updateShapes.",
        "anchors": {
            "1": "Requires a broad new solver or changes the canvas model.",
            "3": "Adds a bounded but substantial placement subsystem.",
            "5": "Extends the existing graph adapter and validation seam with small, isolated types.",
        },
    },
]


gates = [
    {"id": "g1", "name": "Selection and frame stay fixed", "why": "Only selected child Blocks move; parent geometry and unselected shapes are immutable."},
    {"id": "g2", "name": "Virtual means ephemeral", "why": "No rail, satellite, or parent surrogate may become a tldraw record or serialized ID."},
    {"id": "g3", "name": "Ports and routing stay canonical", "why": "Bindings retain exact portId/inner-face semantics and SystemSketch remains the sole cable router."},
    {"id": "g4", "name": "No silent overflow", "why": "Every real child must fit frameInterior after the solve, otherwise the command must leave the scope unchanged."},
    {"id": "g5", "name": "One containment scope per solve", "why": "Only the immediate expanded parent and connections whose scopeId equals that parent participate; nested scopes solve independently."},
]


def score(score_value: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": score_value, "evidence": evidence, "confidence": confidence}


def pass_gate(evidence: str) -> dict[str, object]:
    return {"pass": True, "evidence": evidence}


variants = [
    {
        "id": "v1",
        "name": "Paired Boundary Rails",
        "thesis": "Represent the parent as two tall, layout-only nodes—one input rail and one output rail—whose fixed-position ports mirror the parent’s inner-face rows.",
        "accent": "#2f7f74",
        "bestWhen": "The parent frame is fixed, several boundary ports should influence one child graph, and the existing ELK adapter should remain the only layout engine.",
        "losesWhen": "Exact straight-through alignment is mandatory for every boundary cable, even when parent-row spacing and child-port spacing are geometrically incompatible.",
        "decisions": [
            {"label": "Virtual object", "value": "Two zero-thickness rail nodes, with exact parent-local port coordinates and fixed order."},
            {"label": "Solve", "value": "Run one flat ELK graph containing selected children, internal edges, rails, and parent-boundary edges."},
            {"label": "Commit", "value": "Discard rails and ELK routes, translate real children into frameInterior, validate fit, then update only selected Blocks."},
        ],
        "keepParts": ["two ephemeral rails", "exact parent port IDs and row order", "scope-local fit validator", "discard-all-virtuals commit rule"],
        "proof": [
            "An executable elkjs 0.12.0 probe on this fixture returned 1042×393 with zero graph padding; every real child fit a 1120×390 interior and the input rail stayed at (0,0).",
            "The same probe preserved each supplied rail port coordinate and placed decode → transform → encode left-to-right without overlap.",
            "The output rail drifted 3 px vertically, which is harmless only because the rail is discarded and confirms that boundary straightness must be an objective, not an exact global-position promise.",
        ],
        "scores": {
            "fr1": score(4, "The live probe keeps exact rail-port order and lets all four parent edges influence the solve; not every cable becomes straight because one child translation cannot satisfy incompatible row gaps."),
            "fr2": score(5, "Boundary and child edges share one layered solve, preserving the complete decode → transform → encode topology and fixed child-port offsets."),
            "fr3": score(5, "Rails exist only in the ELK input/output adapter; only real child x/y values survive."),
            "fr4": score(4, "The measured fixture fits, and a required post-solve validator makes overflow safe; ELK itself does not enforce the exact frame rectangle."),
            "fr5": score(5, "This is a bounded extension of OrganizeGraphNode and collectOrganizeEdges using the already installed ELK engine."),
        },
        "gateResults": {
            "g1": pass_gate("Rails are fixed context; the commit list contains selected child IDs only."),
            "g2": pass_gate("Synthetic IDs are namespaced inside the call and discarded before editor.updateShapes()."),
            "g3": pass_gate("Each rail port projects an existing parent portId/inner binding; returned ELK sections are ignored."),
            "g4": pass_gate("The direction includes a hard frameInterior bounds check and no-op result for infeasible layouts."),
            "g5": pass_gate("One rail pair is synthesized per immediate expanded-parent scope; nested scopes are separate calls."),
        },
        "previewLabel": "toggle the shared run() fixture",
        "story": {
            "title": "Let the boundary participate without moving it",
            "steps": [
                {"label": "Inspect the tangled children", "caption": "The parent already owns stable inner-face ports, but today's selected-child graph drops those four boundary edges.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Add disposable rails", "caption": "Cyan rails carry those exact rows into the same ELK solve; they vanish before the selected child positions are committed.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Adapter seam and measured trace",
                "caption": "This is the narrowest production-shaped boundary: canonical records in, disposable ELK objects in the middle, selected child positions out.",
                "html": architecture("selected children + parent inner ports", "2 virtual rails + ELK 0.12.0", "discard rails/routes", "fit 1042×393", "update selected x/y", note="The parent, unselected descendants, bindings, and routed cables are never in the write set."),
            }
        ],
        "preview": preview("rails", "cyan = solve anatomy, not painted document content"),
    },
    {
        "id": "v2",
        "name": "Literal Compound Parent",
        "thesis": "Mirror the Expanded Block directly as an ELK compound node, place selected children beneath it, and attach cross-hierarchy edges to its real boundary ports.",
        "accent": "#4f76c9",
        "bestWhen": "The layout engine is allowed to own container size and port redistribution, as in an auto-sizing diagram rather than a user-sized whiteboard frame.",
        "losesWhen": "The existing parent rectangle and port rows are authored geometry that must remain byte-identical.",
        "decisions": [
            {"label": "Virtual object", "value": "One compound ELK node with real selected children and parent ports."},
            {"label": "Solve", "value": "Set hierarchyHandling=INCLUDE_CHILDREN and let ELK Layered process cross-hierarchy edges."},
            {"label": "Commit", "value": "Accept the compound result, including the container geometry ELK believes is required."},
        ],
        "keepParts": ["cross-hierarchy edge vocabulary", "parent-port to child-port mapping", "single graph ownership"],
        "proof": [
            "elkjs 0.12.0 successfully routed parent-port → child-port edges with hierarchyHandling=INCLUDE_CHILDREN.",
            "In the executable probe, ELK rewrote the supplied parent from 1120×460 to 784×194 and moved the parent ports from y=108/205 to y=66.",
            "That is valid ELK compound behavior but violates SystemSketch's expanded-frame contract, so this direction is ineligible as stated.",
        ],
        "scores": {
            "fr1": score(3, "Cross-hierarchy edges are understood, but ELK moved the authored parent rows to suit its computed compound size."),
            "fr2": score(5, "The compound graph gives ELK complete topology and produces a clean left-to-right child chain."),
            "fr3": score(4, "The compound is still a projection, but accepting its output would duplicate and overwrite meaningful frame geometry."),
            "fr4": score(1, "The measured probe shrank 1120×460 to 784×194 despite supplied dimensions, directly failing the fixed-frame contract."),
            "fr5": score(3, "ELK supports the feature, but reconciling its compound size/ports with stock tldraw frames would require custom post-processing."),
        },
        "gateResults": {
            "g1": {"pass": False, "evidence": "The executable probe changed parent width, height, and port rows."},
            "g2": pass_gate("The compound surrogate can remain in-memory only."),
            "g3": pass_gate("The test used exact parent and child port IDs and ignored ELK routes at commit."),
            "g4": {"pass": False, "evidence": "ELK solved by resizing the compound boundary rather than proving the children fit the authored frame."},
            "g5": pass_gate("INCLUDE_CHILDREN can be limited to one immediate parent scope."),
        },
        "previewLabel": "toggle the shared run() fixture",
        "story": {
            "title": "Watch the literal model solve the wrong ownership problem",
            "steps": [
                {"label": "Start from the authored frame", "caption": "run() is a user-sized free frame with stable boundary rows.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Run compound ELK", "caption": "The child chain is clean, but the blue ELK parent replaces the dashed authored frame and collapses its rows.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Executable failure trace",
                "caption": "The technical support is real; the mismatch is ownership, not capability.",
                "html": architecture("run compound 1120×460", "INCLUDE_CHILDREN", "clean cross-hierarchy layout", "run becomes 784×194", note="ELK treats the compound as layout-owned geometry. SystemSketch treats Expanded as user-owned geometry."),
            }
        ],
        "preview": preview("compound", "red dashed = authored parent; blue = measured ELK ownership"),
    },
    {
        "id": "v3",
        "name": "Port Satellites",
        "thesis": "Create one tiny virtual terminal for every connected parent port and tie the terminals together with an ordering spine, rather than representing the whole boundary.",
        "accent": "#7667c6",
        "bestWhen": "Only a sparse subset of parent ports is connected and each terminal should exert independent pressure on the child topology.",
        "losesWhen": "Many ports turn the hidden ordering spine into another graph whose spacing and crossing behavior must be tuned and tested.",
        "decisions": [
            {"label": "Virtual object", "value": "One disposable zero-area node per used boundary port."},
            {"label": "Ordering", "value": "A hidden north-to-south spine or model-order constraint prevents ELK from permuting satellites."},
            {"label": "Commit", "value": "Discard satellites/spine, fit-check children, and update selected IDs only."},
        ],
        "keepParts": ["sparse proxy synthesis", "one-to-one evidence per boundary port", "explicit ordering constraint"],
        "proof": [
            "Every used parent port becomes a separate, inspectable force in the layout graph.",
            "Unlike a rail, the satellites have no intrinsic common height, so preserving parent row gaps requires an additional invisible ordering/spacing structure.",
            "The proxy count grows linearly with connected parent ports and remains fully ephemeral.",
        ],
        "scores": {
            "fr1": score(4, "Each boundary port has a distinct proxy and exact identity, but an auxiliary spine is required to preserve authored ordering and approximate gaps.", "medium"),
            "fr2": score(4, "All topology remains in ELK, though extra proxy edges can influence layering and crossing minimization more than the semantic graph warrants.", "medium"),
            "fr3": score(5, "Satellites and their spine are disposable adapter records with no persisted counterpart."),
            "fr4": score(4, "A post-solve frame check makes the result safe; the proxies themselves do not encode the full rectangular capacity."),
            "fr5": score(4, "The adapter is local, but order-spine generation and its tuning add more graph machinery than two rails."),
        },
        "gateResults": {
            "g1": pass_gate("Only selected child IDs reach the update list."),
            "g2": pass_gate("Every satellite/spine ID is synthetic and discarded."),
            "g3": pass_gate("Each satellite maps one existing parent portId and never supplies persisted routing."),
            "g4": pass_gate("The direction adopts the same hard frameInterior postcondition as V1."),
            "g5": pass_gate("Satellites are synthesized only from edges scoped to the immediate parent."),
        },
        "previewLabel": "toggle the shared run() fixture",
        "story": {
            "title": "Give each parent port its own virtual terminal",
            "steps": [
                {"label": "See dropped boundary evidence", "caption": "The messy selected children have four important edges that the current flat collector excludes.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Expose sparse satellites", "caption": "Each cyan diamond is a distinct ELK terminal; the dotted spine preserves their parent-row order.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Sparse graph expansion",
                "caption": "The model is precise per port but pays for that precision with a second hidden topology.",
                "html": architecture("4 used parent ports", "4 satellites", "ordering spine", "ELK child graph", "discard 5 virtual records", note="A 40-port parent with 18 connected rows generates 18 satellites plus the order relation; rails stay constant-sized."),
            }
        ],
        "preview": preview("satellites", "diamonds = virtual terminals; dotted line = virtual order"),
    },
    {
        "id": "v4",
        "name": "ELK + Vertical Reconciler",
        "thesis": "Let the current child-only ELK solve topology first, then run a bounded vertical optimization that minimizes parent-port row error while enforcing non-overlap and frame bounds.",
        "accent": "#b7791f",
        "bestWhen": "Boundary-row quality is worth a dedicated numerical objective and the team accepts a small second solver with explicit priorities.",
        "losesWhen": "A single understandable layout engine and predictable debugging matter more than squeezing the last dogleg out of a boundary-heavy graph.",
        "decisions": [
            {"label": "Virtual object", "value": "No fake node; parent-port rows become weighted equations over each connected child's y translation."},
            {"label": "Solve", "value": "ELK topology first, then constrained 1-D projection for row error, separation, and frame bounds."},
            {"label": "Conflict", "value": "When exact rows disagree, minimize weighted error without changing child port spacing."},
        ],
        "keepParts": ["explicit row-error metric", "hard bounds/non-overlap projection", "diagnosable impossible-alignment residual"],
        "proof": [
            "The model can state the actual impossibility: one child translation cannot simultaneously match two parent row gaps that differ from its own port gap.",
            "The preview separates the ELK proposal (dashed) from the reconciled positions (solid), making the second solver's ownership visible.",
            "No existing dependency provides this exact bounded objective, so the critical algorithm remains a prototype rather than executed production evidence.",
        ],
        "scores": {
            "fr1": score(5, "Every parent edge contributes a measurable row-residual term, and incompatible targets degrade explicitly rather than being silently ignored.", "medium"),
            "fr2": score(4, "ELK chooses topology first, but the reconciliation pass can bend its carefully optimized vertical alignment and must recheck crossings.", "medium"),
            "fr3": score(5, "The second pass consumes canonical geometry and returns child positions only; no proxy semantics exist."),
            "fr4": score(5, "Interior bounds and non-overlap are direct hard constraints rather than an after-the-fact heuristic.", "medium"),
            "fr5": score(2, "It introduces and must validate a new constrained optimizer, priority policy, and infeasibility diagnostics beside ELK."),
        },
        "gateResults": {
            "g1": pass_gate("The variables are y translations for selected children only."),
            "g2": pass_gate("There are no virtual document or layout nodes."),
            "g3": pass_gate("The equations reference canonical port coordinates; cable geometry still comes from SystemSketch."),
            "g4": pass_gate("Bounds and non-overlap are hard constraints in the proposed optimization."),
            "g5": pass_gate("Each optimization is built from one immediate scope and its parent-inner bindings."),
        },
        "previewLabel": "toggle the shared run() fixture",
        "story": {
            "title": "Separate topology from boundary reconciliation",
            "steps": [
                {"label": "Start with tangled children", "caption": "All selected children and their authored parent rows stay fixed as inputs.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Inspect the two passes", "caption": "Dashed boxes are the ELK proposal; amber vectors show the bounded row-error correction before commit.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Two-stage ownership",
                "caption": "This direction is the strongest if boundary straightness becomes the primary criterion, but it owns the most new algorithmic surface.",
                "html": architecture("child-only ELK x/y", "row residuals Σw·|portY−targetY|", "non-overlap + frame bounds", "recheck crossings", "update selected x/y", note="The solver must report residuals so an apparently bent cable is explainable rather than treated as a bug."),
            }
        ],
        "preview": preview("reconciler", "ghost boxes = first pass; amber = second-pass movement"),
    },
    {
        "id": "v5",
        "name": "Boundary-First Lanes",
        "thesis": "Treat parent input rows as horizontal lanes, seed boundary-connected children into those lanes, then pack the remaining topology between the seeded islands.",
        "accent": "#a94f78",
        "bestWhen": "The drawing is read primarily from the parent API inward and stable visual lanes matter more than globally compact graph layout.",
        "losesWhen": "One child consumes several parent inputs, components cross lanes, or deep interior topology should determine the vertical order instead.",
        "decisions": [
            {"label": "Virtual object", "value": "Horizontal lane bands derived from parent port rows, not graph nodes."},
            {"label": "Solve", "value": "Anchor boundary-connected components first; run packing/layout inside and between their allocated bands."},
            {"label": "Conflict", "value": "A multi-input child joins the dominant lane and other inputs bend into it."},
        ],
        "keepParts": ["boundary-owned visual lanes", "stable row labels", "outside-in placement order"],
        "proof": [
            "The preview makes the parent's public interface dominant and gives raw, gain, and Estimator stable horizontal territories.",
            "The transform Block spans several inputs, exposing the arbitrary dominant-lane decision rather than hiding it.",
            "This is a custom packing policy, not a configuration of the current flat ELK adapter.",
        ],
        "scores": {
            "fr1": score(5, "Parent rows are the explicit organizing structure and remain visibly ordered.", "medium"),
            "fr2": score(3, "Simple pipelines read well, but multi-lane children and cross-lane edges can fragment the semantic graph.", "medium"),
            "fr3": score(5, "Lanes are calculated presentation guides and never become canvas records."),
            "fr4": score(4, "Lane allocation can respect the fixed interior, but dense graphs need an explicit infeasible/no-op policy."),
            "fr5": score(3, "The concept is bounded but requires a new lane allocator and component packer rather than a small ELK input adapter."),
        },
        "gateResults": {
            "g1": pass_gate("Only selected children are assigned lanes or moved."),
            "g2": pass_gate("Lane bands are transient calculations/overlays only."),
            "g3": pass_gate("Lane membership derives from exact parent port IDs; SystemSketch still routes the edges."),
            "g4": pass_gate("The proposal includes capacity calculation and no-op on dense infeasible scopes."),
            "g5": pass_gate("Lanes are created from one immediate expanded parent at a time."),
        },
        "previewLabel": "toggle the shared run() fixture",
        "story": {
            "title": "Lay out from the public boundary inward",
            "steps": [
                {"label": "Find the parent API", "caption": "The boundary rows already state the external reading order, but the tangled children do not respect it.", "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Seed port-owned lanes", "caption": "The colored bands reserve that order; topology is packed within them and bends resolve multi-lane conflicts.", "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "media": [
            {
                "label": "Outside-in packing trace",
                "caption": "The boundary becomes visually primary, but the dominant-lane rule is a new policy users may have to learn.",
                "html": architecture("parent rows", "lane bands", "seed connected children", "pack remaining components", "validate capacity", note="A child attached to two or more lanes cannot live in all of them; one lane wins and the remaining edges bend."),
            }
        ],
        "preview": preview("lanes", "translucent bands = proposed layout territories"),
    },
]


project = {
    "schemaVersion": 3,
    "title": "Five ways to organize nodes inside an Expanded Block",
    "kicker": "SystemSketch · architecture exploration · Sep 2, 2026",
    "brief": "Make a selected set of child Blocks organize coherently inside a fixed Expanded parent, while allowing the parent’s input/output ports to influence placement. The same run() fixture is used throughout: raw, gain, and Estimator enter from the parent boundary; decode → transform → encode carries the interior flow; bytes exits through the parent boundary.",
    "count": 5,
    "defaultId": "v1",
    "defaultWhy": "Paired Boundary Rails is the provisional choice at 91/100. It captures the user's virtual-parent instinct at the right abstraction: not a persisted fake Block and not an ELK-owned compound, but two disposable boundary representatives inside the existing flat solve. The installed elkjs 0.12.0 probe accepts fixed rail-port positions, lays out the child graph cleanly, and fits the representative frame; a post-solve bounds guard closes the remaining safety gap.",
    "decisionHinge": "The hinge is whether exact boundary-row residuals deserve their own solver. Move five weight points from Implementation fit to Boundary-port legibility and V4 ELK + Vertical Reconciler leads 92 to 90. Keep V1 unless repeated evaluation shows that the rail model leaves visibly avoidable doglegs; then splice V4's row-residual pass and diagnostics onto V1 rather than adopting a compound parent.",
    "invariants": [
        "Expanded is a free tldraw frame: organizing children never moves or resizes the parent and never resizes descendants.",
        "Geometry is not parenthood. The real parentId chain and connection scopeId decide which parent boundary participates.",
        "The parent boundary is the invariant; Simple, Port, and Expanded are projections of the same stable port identities.",
        "Only selected child Blocks move. Unselected siblings, nested descendants, parent ports, and cables remain document-identical.",
        "ELK chooses positions only. SystemSketch's existing connection router remains the sole owner of painted cable geometry.",
        "Exact simultaneous alignment is impossible when a child's port-to-port spacing differs from the corresponding parent-row spacing; ordering is hard, row straightness is optimized.",
    ],
    "boundary": "Architecture prototype, not a production behavior change. The data-contract inspection and two elkjs 0.12.0 probes are executable against the current repository; the five visual outcomes, selection grouping, overflow message, and any second-stage optimization remain proposed. Prior decisions were recovered from the PyBlocks recursive-boundary, expanded-membership, and layout-command reports plus the current SystemSketch parentId/inner-face/organizeGraph implementation.",
    "axes": [
        {"name": "Parent representation", "values": ["paired rails", "compound node", "port satellites", "constraint equations", "horizontal lanes"]},
        {"name": "Solver ownership", "values": ["one flat ELK", "compound ELK", "expanded flat ELK", "ELK + 1-D optimizer", "custom outside-in packer"]},
        {"name": "Boundary fidelity", "values": ["exact order + soft rows", "engine-owned rows", "per-port proxies", "measured row residual", "row-owned territories"]},
        {"name": "Capacity policy", "values": ["post-solve fit guard", "auto-resize", "post-solve fit guard", "hard bound", "preallocated lanes"]},
    ],
    "requirements": requirements,
    "hardGates": gates,
    "variants": variants,
    "checks": [
        "Exactly five structurally distinct virtual-parent/layout models",
        "Same run() frame, boundary ports, child Blocks, and messy starting geometry in every hero",
        "Five frozen weighted criteria sum to 100; every score includes evidence and confidence",
        "Five hard gates are evaluated separately; the literal compound direction visibly fails two",
        "Every hero has a direct before/result toggle and a manual two-step walkthrough over those same states",
        "Every direction includes an architecture trace, concrete commit boundary, and failure policy",
        "The recommended direction is supported by an isolated live elkjs 0.12.0 probe, not only a drawing",
        "Pick, shortlist, reject, note, splice, copy, and download remain available in the gallery",
        "No production SystemSketch behavior or document record was changed by this exploration",
    ],
}


def main() -> None:
    SPEC.write_text(json.dumps(project, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    subprocess.run(
        [sys.executable, str(GALLERY), "build", "--spec", str(SPEC), "--output", str(OUTPUT), "--strict"],
        check=True,
    )
    subprocess.run(
        [sys.executable, str(GALLERY), "check", "--input", str(OUTPUT), "--strict"],
        check=True,
    )


if __name__ == "__main__":
    main()
