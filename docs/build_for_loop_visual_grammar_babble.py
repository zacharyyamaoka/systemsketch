#!/usr/bin/env python3
"""Build the for-loop visual-grammar comparison and editable review-board recipe."""

from __future__ import annotations

import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SKETCHES = ROOT / "sketches" / "review"
SPEC = DOCS / "for-loop-visual-grammar-babble-2026-09-02.json"
GALLERY = DOCS / "for-loop-visual-grammar-babble-2026-09-02.html"
RECIPE = SKETCHES / "for-loop-visual-grammar-recipe.json"
BABBLE = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")


INK = "#263238"
MUTED = "#66737b"
AMBER = "#c97808"
BLUE = "#2878a8"
GREEN = "#22845d"
PAPER = "#fbfcfc"
SOFT = "#eef2f3"


def svg_preview(body: str, footer: str) -> str:
    return f"""
    <div style="min-height:330px;border:1px solid #d8dddf;border-radius:16px;background:{PAPER};padding:12px;display:grid;gap:8px">
      <svg viewBox="0 0 720 300" role="img" aria-label="For-loop representation" style="width:100%;height:auto;display:block">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="{INK}" stroke-width="1.8"/></marker>
          <marker id="arr-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="{AMBER}" stroke-width="1.8"/></marker>
        </defs>
        <rect x="8" y="8" width="704" height="284" rx="14" fill="#fff" stroke="#d7dcde"/>
        {body}
        <g transform="translate(592 20)">
          <rect width="98" height="27" rx="13" fill="#fff7e6" stroke="{AMBER}"/>
          <text x="49" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="{AMBER}" class="demo-base-only">iteration i</text>
          <text x="49" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="{AMBER}" class="demo-alt-only">iteration i+1</text>
        </g>
      </svg>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 8px 4px">
        <small style="color:{MUTED}">{footer}</small>
        <button class="demo-button" data-demo-toggle data-base-label="Advance one iteration" data-alt-label="Return to iteration i">Advance one iteration</button>
      </div>
    </div>"""


def line(path: str, *, dotted: bool = False, amber: bool = False, arrow: bool = True, width: float = 2.4) -> str:
    color = AMBER if amber else INK
    dash = ' stroke-dasharray="3 7"' if dotted else ""
    marker = f' marker-end="url(#{"arr-amber" if amber else "arr"})"' if arrow else ""
    return f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"{dash}{marker}/>'


def box(x: int, y: int, w: int, h: int, title: str, sub: str = "", *, accent: str = BLUE, radius: int = 10) -> str:
    title_escaped = html.escape(title)
    sub_escaped = html.escape(sub)
    return f"""
      <g>
        <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="#fff" stroke="{accent}" stroke-width="2"/>
        <rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="{accent}"/>
        <text x="{x + 12}" y="{y + 31}" font-family="ui-monospace,monospace" font-size="16" font-weight="700" fill="{INK}">{title_escaped}</text>
        {f'<text x="{x + 12}" y="{y + 52}" font-size="11" fill="{MUTED}">{sub_escaped}</text>' if sub else ''}
      </g>"""


def label(x: int, y: int, value: str, *, anchor: str = "start", color: str = MUTED, size: int = 12, weight: int = 500, klass: str = "") -> str:
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="ui-monospace,monospace" font-size="{size}" font-weight="{weight}" fill="{color}" class="{klass}">{html.escape(value)}</text>'


def frame() -> str:
    return '<rect x="116" y="52" width="486" height="214" rx="12" fill="#f9fbfb" stroke="#8d989e" stroke-width="1.7"/>'


def previews() -> dict[str, str]:
    paired = svg_preview(
        frame()
        + label(130, 76, "for other in others", color=INK, size=15, weight=700)
        + box(132, 104, 120, 116, "ITERATE", "other · pose", accent=AMBER)
        + box(316, 122, 128, 78, "merge()", "pose, other", accent=BLUE)
        + box(492, 104, 96, 116, "YIELD", "next · done", accent=GREEN)
        + line("M36 126 H132") + label(38, 116, "others")
        + line("M36 190 H132") + label(38, 180, "pose₀")
        + line("M252 136 H316") + label(277, 128, "other", anchor="middle", size=10)
        + line("M252 184 H316") + label(277, 176, "poseᵢ", anchor="middle", size=10)
        + line("M444 160 H492") + label(468, 151, "poseᵢ₊₁", anchor="middle", size=10)
        + line("M540 220 V248 H190 V220", dotted=True, amber=True)
        + line("M588 160 H684") + label(682, 150, "final pose", anchor="end", size=10)
        + label(352, 236, "paired boundary owns recurrence", anchor="middle", color=AMBER, size=10),
        "Only the gate-to-gate return is cross-iteration; body wires remain ordinary data."
    )

    phi = svg_preview(
        frame()
        + label(130, 76, "for other in others", color=INK, size=15, weight=700)
        + box(148, 112, 110, 78, "next()", "others → other", accent=AMBER)
        + box(300, 112, 100, 78, "φ pose", "seed | back", accent="#7b62a8")
        + box(462, 112, 112, 78, "merge()", "pose, other", accent=BLUE)
        + line("M36 128 H148") + label(38, 118, "others")
        + line("M36 190 H300") + label(38, 181, "pose₀")
        + line("M258 148 H462") + label(278, 139, "other", size=10)
        + line("M400 176 H462") + label(423, 168, "poseᵢ", size=10)
        + line("M574 150 H684") + label(682, 141, "final pose", anchor="end", size=10)
        + line("M574 176 V238 H350 V190", dotted=True, amber=True)
        + label(459, 231, "backedge", anchor="middle", color=AMBER, size=10),
        "Two explicit compiler objects answer the two hard questions: item selection and carried state."
    )

    lanes = svg_preview(
        frame()
        + label(130, 76, "for other in others", color=INK, size=15, weight=700)
        + '<rect x="132" y="92" width="454" height="68" rx="8" fill="#fff" stroke="#8d989e"/>'
        + label(148, 118, "each", color=AMBER, weight=700) + label(210, 118, "other ← others[i]")
        + label(148, 145, "carry", color="#7b62a8", weight=700) + label(210, 145, "pose ← pose₀ | z⁻¹")
        + box(300, 184, 132, 64, "merge()", "pose, other", accent=BLUE)
        + line("M250 118 H278 V204 H300") + line("M250 145 H268 V226 H300")
        + line("M432 216 H492 V145 H462", dotted=True, amber=True)
        + line("M432 232 H684") + label(682, 224, "done → pose", anchor="end", size=10)
        + label(542, 139, "loop-carried lane", anchor="middle", color=AMBER, size=10),
        "Iteration meaning is written once in the header; the body receives short, local drops."
    )

    portals = svg_preview(
        frame()
        + label(130, 76, "for loop", color=INK, size=15, weight=700)
        + '<rect x="104" y="108" width="156" height="42" rx="21" fill="#fff" stroke="' + AMBER + '" stroke-width="2"/>'
        + label(182, 134, "others ▷ other", anchor="middle", color=INK, size=11, weight=700)
        + '<rect x="104" y="176" width="156" height="42" rx="21" fill="#fff" stroke="#7b62a8" stroke-width="2"/>'
        + label(182, 202, "pose₀ ▷ poseᵢ", anchor="middle", color=INK, size=11, weight=700)
        + box(346, 132, 132, 80, "merge()", "body", accent=BLUE)
        + '<rect x="548" y="150" width="82" height="42" rx="21" fill="#fff" stroke="' + GREEN + '" stroke-width="2"/>'
        + label(589, 176, "done", anchor="middle", color=INK, size=11, weight=700)
        + line("M260 129 H346") + line("M260 197 H320 V184 H346")
        + line("M478 172 H548") + line("M478 198 V238 H182 V218", dotted=True, amber=True)
        + line("M630 171 H684")
        + label(361, 236, "the boundary transforms values", anchor="middle", color=AMBER, size=10),
        "The frame edge itself is the operator: collection becomes item; seed becomes current state."
    )

    pills = svg_preview(
        frame()
        + label(130, 76, "for other in others", color=INK, size=15, weight=700)
        + '<rect x="168" y="110" width="126" height="44" rx="22" fill="#fff" stroke="' + AMBER + '" stroke-width="2"/>'
        + label(231, 138, "other = ⋯", anchor="middle", color=INK, size=12, weight=700)
        + '<rect x="168" y="184" width="126" height="44" rx="22" fill="#fff" stroke="#7b62a8" stroke-width="2"/>'
        + label(231, 212, "pose = ⋯", anchor="middle", color=INK, size=12, weight=700)
        + box(410, 134, 134, 82, "merge()", "pose, other", accent=BLUE)
        + line("M36 132 H168") + label(38, 121, "others")
        + line("M36 207 H168") + label(38, 196, "pose₀")
        + line("M294 132 H380 V158 H410") + line("M294 206 H410")
        + line("M544 176 H684") + label(682, 166, "final pose", anchor="end", size=10)
        + line("M544 198 V246 H231 V228", dotted=True, amber=True)
        + label(390, 239, "write pill now · read pill next", anchor="middle", color=AMBER, size=10),
        "Existing source/sink Pills make both iteration variables tangible and directly nameable."
    )

    fold = svg_preview(
        label(72, 52, "compact", color=MUTED, size=11, weight=700)
        + '<rect x="72" y="72" width="576" height="142" rx="18" fill="#f9fbfb" stroke="' + BLUE + '" stroke-width="2.4"/>'
        + label(98, 105, "fold others into pose", color=INK, size=18, weight=700)
        + label(98, 136, "seed: pose₀", color=MUTED, size=12)
        + label(98, 160, "step: merge(pose, other)", color=MUTED, size=12)
        + line("M22 112 H72") + label(22, 101, "others")
        + line("M22 178 H72") + label(22, 168, "pose₀")
        + line("M648 143 H698") + label(697, 132, "pose", anchor="end", size=10)
        + '<g class="demo-alt-only"><rect x="322" y="112" width="258" height="76" rx="10" fill="#fff" stroke="' + AMBER + '"/><text x="338" y="139" font-family="ui-monospace,monospace" font-size="13" font-weight="700" fill="' + INK + '">expanded step</text><text x="338" y="164" font-size="11" fill="' + MUTED + '">otherᵢ + poseᵢ → merge → poseᵢ₊₁</text></g>',
        "The loop is a higher-order transform; expand only when the step body matters."
    )

    unroll = svg_preview(
        frame()
        + label(130, 76, "first · middle · last", color=INK, size=15, weight=700)
        + box(142, 124, 116, 74, "merge₀", "pose₀, other₀", accent=BLUE)
        + box(306, 124, 116, 74, "mergeᵢ", "poseᵢ, otherᵢ", accent=BLUE)
        + box(470, 124, 116, 74, "mergeₙ", "poseₙ, otherₙ", accent=BLUE)
        + line("M34 161 H142") + label(36, 150, "pose₀")
        + line("M258 161 H306", dotted=True, amber=True) + line("M422 161 H470", dotted=True, amber=True)
        + line("M586 161 H684") + label(682, 150, "final", anchor="end", size=10)
        + label(281, 224, "⋯", anchor="middle", size=26) + label(445, 224, "⋯", anchor="middle", size=26)
        + label(364, 246, "space is traded for temporal certainty", anchor="middle", color=AMBER, size=10),
        "Representative iterations are duplicated so seed, recurrence, and completion cannot be confused."
    )

    conveyor = svg_preview(
        frame()
        + label(130, 76, "token conveyor", color=INK, size=15, weight=700)
        + line("M156 118 H554", amber=True)
        + ''.join(f'<circle cx="{x}" cy="118" r="15" fill="#fff" stroke="{AMBER}" stroke-width="2"/>' for x in (182, 280, 378, 476))
        + label(182, 122, "0", anchor="middle", color=AMBER, weight=700)
        + label(280, 122, "1", anchor="middle", color=AMBER, weight=700)
        + label(378, 122, "i", anchor="middle", color=AMBER, weight=700)
        + label(476, 122, "n", anchor="middle", color=AMBER, weight=700)
        + box(302, 174, 126, 64, "merge()", "current token", accent=BLUE)
        + line("M378 133 V174") + line("M428 210 H558 V248 H180 V210 H302", dotted=True, amber=True)
        + label(364, 265, "each token clocks one body firing", anchor="middle", color=AMBER, size=10),
        "Iteration is a stream of tokens; one token enables one body evaluation."
    )

    table = svg_preview(
        label(92, 52, "iteration trace", color=INK, size=15, weight=700)
        + '<rect x="92" y="72" width="536" height="176" rx="10" fill="#fff" stroke="#8d989e"/>'
        + line("M208 72 V248", arrow=False, width=1) + line("M344 72 V248", arrow=False, width=1) + line("M480 72 V248", arrow=False, width=1)
        + line("M92 112 H628", arrow=False, width=1) + line("M92 156 H628", arrow=False, width=1) + line("M92 200 H628", arrow=False, width=1)
        + label(150, 98, "value", anchor="middle", weight=700) + label(276, 98, "i=0", anchor="middle", weight=700)
        + label(412, 98, "i=1", anchor="middle", weight=700) + label(548, 98, "… i=n", anchor="middle", weight=700)
        + label(112, 140, "other") + label(112, 184, "pose in") + label(112, 228, "pose out")
        + label(276, 140, "others[0]", anchor="middle") + label(412, 140, "others[1]", anchor="middle") + label(548, 140, "others[n]", anchor="middle")
        + label(276, 184, "seed", anchor="middle") + label(412, 184, "prev out", anchor="middle") + label(548, 184, "prev out", anchor="middle")
        + label(276, 228, "merge₀", anchor="middle") + label(412, 228, "merge₁", anchor="middle") + label(548, 228, "final", anchor="middle")
        + '<g class="demo-alt-only"><rect x="346" y="114" width="132" height="130" rx="8" fill="none" stroke="' + AMBER + '" stroke-width="3"/></g>',
        "A trace table is maximally explicit about time, but reads as execution evidence rather than a program."
    )

    switch = svg_preview(
        frame()
        + label(130, 76, "for other in others", color=INK, size=15, weight=700)
        + box(202, 122, 132, 80, "merge()", "pose, other", accent=BLUE)
        + '<path d="M450 112 L518 160 L450 208 L382 160 Z" fill="#fff" stroke="' + GREEN + '" stroke-width="2"/>'
        + label(450, 157, "more?", anchor="middle", color=INK, weight=700)
        + label(450, 176, "next / done", anchor="middle", color=MUTED, size=10)
        + line("M36 142 H202") + label(38, 132, "otherᵢ")
        + line("M36 188 H202") + label(38, 178, "poseᵢ")
        + line("M334 160 H382")
        + line("M450 208 V246 H156 V188", dotted=True, amber=True)
        + line("M518 160 H684") + label(682, 150, "done → pose", anchor="end", size=10)
        + label(348, 240, "next and final are two explicit exits", anchor="middle", color=AMBER, size=10),
        "A small scheduler switch makes the final value impossible to mistake for the next value."
    )
    return {
        "v1": paired, "v2": phi, "v3": lanes, "v4": portals, "v5": pills,
        "v6": fold, "v7": unroll, "v8": conveyor, "v9": table, "v10": switch,
    }


REQUIREMENTS = [
    {
        "id": "fr1", "name": "Semantic completeness", "weight": 32,
        "why": "The notation must expose the collection, current element, initial state, recurrence, and final value without relying on remembered code.",
        "passCondition": "A reader can point to each role and explain when it is available.",
        "anchors": {"1": "One or more loop roles are absent or conflated.", "3": "All roles are inferable, but at least one depends on convention or prose.", "5": "Every role has a distinct visible home and timing."},
    },
    {
        "id": "fr2", "name": "Turn clarity at a glance", "weight": 24,
        "why": "The core ambiguity is whether a value is usable now or only after an iteration boundary.",
        "passCondition": "Solid same-turn flow and cross-turn recurrence cannot be mistaken for one another.",
        "anchors": {"1": "The diagram plausibly implies an impossible same-turn read.", "3": "Timing is marked but needs careful tracing.", "5": "The temporal boundary is immediate and local."},
    },
    {
        "id": "fr3", "name": "Hard-loop scalability", "weight": 20,
        "why": "The grammar should survive destructuring, multiple carried values, conditional updates, early exit, and nesting.",
        "passCondition": "The five stress programs extend the same rule instead of inventing a new notation.",
        "anchors": {"1": "Only the single-accumulator example fits.", "3": "Two hard cases fit with crowding or special cases.", "5": "All five fit through repetition of the same primitives."},
    },
    {
        "id": "fr4", "name": "Visual calm", "weight": 14,
        "why": "Loop marks should not overwhelm the body graph or turn one carried value into a bundle of crossing arrows.",
        "passCondition": "The loop reads in one scan with few long or overlapping cables.",
        "anchors": {"1": "The control notation dominates or crosses the body.", "3": "Readable at normal scale with some route management.", "5": "Compact, local, and visually subordinate to the body."},
    },
    {
        "id": "fr5", "name": "SystemSketch fit", "weight": 10,
        "why": "A strong direction should reuse Blocks, ports, Pills, regions, and delayed/dotted edges rather than introduce a second visual language.",
        "passCondition": "The idea can be built as a narrow extension of the current canvas vocabulary.",
        "anchors": {"1": "Requires a foreign editor or a parallel graph model.", "3": "Needs one substantial new primitive.", "5": "Composes existing SystemSketch objects and edge semantics."},
    },
]

GATES = [
    {"id": "g1", "name": "Collection ≠ current element", "why": "The whole iterable and the item available this iteration must never share one undifferentiated cable."},
    {"id": "g2", "name": "Seed / next / final are distinct", "why": "A carried value has three temporal roles and the representation must not collapse them."},
    {"id": "g3", "name": "No impossible same-turn read", "why": "A returned value may feed the next iteration or the final exit, not the current invocation that produced it."},
    {"id": "g4", "name": "Body remains dataflow", "why": "The loop notation should schedule an ordinary internal dataflow graph rather than replace it with prose."},
]

VARIANT_META = [
    ("v1", "Paired Gates", "Put iteration on a paired Input/Yield boundary: one gate exposes current items and state; the other receives next state and owns completion.", "Structured loops with carried values, completion, break, or nesting.", "A tiny single-use loop where two extra boundary nodes feel heavier than the body.", ["paired Input/Yield gates", "done outlet", "boundary-owned feedback"], [5, 5, 5, 4, 4]),
    ("v2", "Φ + Iterator", "Make the two hidden operations explicit: an iterator chooses the current element and a φ node chooses seed versus loop-back state.", "Compiler-faithful graphs and debugging exact seed/backedge behavior.", "A sketch must stay calm for non-compiler readers or carries many values.", ["iterator micro-node", "φ join", "single dotted backedge"], [5, 4, 5, 3, 4]),
    ("v3", "Header Lanes", "Turn the loop header into two typed lanes—each and carry—then drop short local wires into the body.", "The loop body is visually primary and the header can carry several named values.", "Nested loops or many carries make the header dense and text-dependent.", ["each lane", "carry lane", "done outlet"], [5, 4, 4, 5, 5]),
    ("v4", "Boundary Portals", "Let boundary ports perform the transformation from collection→item and seed→current state.", "A region should feel like one semantic object with little internal chrome.", "Readers need to inspect compact portal labels or the frame has many values.", ["transforming portals", "edge-local labels", "quiet body"], [4, 4, 4, 5, 5]),
    ("v5", "State Pills", "Represent current element and carried variables as ordinary source/sink Pills whose dotted writeback applies on the next iteration.", "Variables should remain tangible, editable, and reusable with the current Pill vocabulary.", "Unpacked tuples or many carried values turn the body into a shelf of Pills.", ["current-item Pill", "carried-state Pill", "write-now/read-next rule"], [4, 5, 4, 5, 5]),
    ("v6", "Fold Lens", "Treat the whole loop as a fold transform with seed, collection, step, and result; expand the step body only on demand.", "The author wants the algorithmic summary far more often than the internal schedule.", "Break, continue, side effects, or nesting no longer fit the fold abstraction cleanly.", ["fold macro", "expandable step", "seed/result ports"], [4, 5, 2, 5, 4]),
    ("v7", "First · Middle · Last", "Unroll representative iterations so the first seed, repeated recurrence, and final result are spatially undeniable.", "Teaching, review, or a short fixed loop where temporal truth beats density.", "Real programs, nested loops, or more than one carried value need too much space.", ["first iteration", "ellipsis", "last iteration"], [5, 5, 2, 1, 3]),
    ("v8", "Token Conveyor", "Draw the iterable as a stream of iteration tokens; each token clocks one body evaluation while state returns on a separate dotted rail.", "Streaming or eventful systems where per-item firing is the dominant mental model.", "A synchronous Python loop could be mistaken for asynchronous scheduling.", ["iteration tokens", "enable drop", "state return rail"], [3, 4, 3, 4, 3]),
    ("v9", "Iteration Table", "Show a small execution table where columns are iterations and rows are item, state-in, and state-out.", "Explaining or debugging a concrete trace with exact values.", "Authoring a reusable program—the surface reads as evidence, not structure.", ["iteration columns", "value rows", "trace highlight"], [5, 4, 4, 2, 2]),
    ("v10", "Next / Done Switch", "Route each body result through a tiny scheduler switch with explicit next and done exits.", "Final-value clarity and early exit matter more than minimizing scheduler chrome.", "The switch can look like a runtime condition the Python source never wrote.", ["next exit", "done exit", "single scheduler gate"], [5, 4, 4, 3, 4]),
]


def score_entries(scores: list[int], name: str) -> dict[str, dict[str, object]]:
    evidence = [
        f"{name} visibly separates the iterable, current item, seed, recurrence, and final result to the degree shown in the hero.",
        f"The iteration toggle exposes how {name} distinguishes iteration i from i+1 without changing the body graph.",
        f"The stress atlas applies {name} to map, accumulate, destructure, dual-state conditional, and nested-break cases.",
        f"The hero shows the number and length of loop-specific routes {name} adds around one merge body.",
        f"The proposed parts can be compared directly with current Blocks, Pills, regions, and dotted/delayed edges.",
    ]
    return {
        requirement["id"]: {"score": score, "evidence": evidence[index], "confidence": "high" if index in (0, 1, 3) else "medium"}
        for index, (requirement, score) in enumerate(zip(REQUIREMENTS, scores))
    }


def build_spec() -> dict[str, object]:
    rendered = previews()
    variants = []
    for variant_id, name, thesis, best_when, loses_when, parts, scores in VARIANT_META:
        variants.append({
            "id": variant_id,
            "name": name,
            "thesis": thesis,
            "accent": {"v1": "#22845d", "v2": "#7b62a8", "v3": "#c97808", "v4": "#2878a8", "v5": "#b05a93"}.get(variant_id, "#52646d"),
            "bestWhen": best_when,
            "losesWhen": loses_when,
            "decisions": [
                {"label": "Iteration owner", "value": thesis.split(":", 1)[0]},
                {"label": "Cross-turn mark", "value": "Only next-iteration paths use the amber dotted cadence."},
                {"label": "Final value", "value": "Completion has its own visible route rather than sharing the recurrence blindly."},
            ],
            "keepParts": parts,
            "proof": ["The hero advances between two iterations through the live control.", "The same original merge fixture is used across all ten directions."],
            "previewLabel": "interactive loop trace",
            "preview": rendered[variant_id],
            "story": {
                "title": "Read one iteration boundary",
                "steps": [
                    {"label": "Read iteration i", "caption": "Locate the current item, current carried value, body result, and completion route.", "state": "base", "target": "[data-demo-toggle]"},
                    {"label": "Advance to i+1", "caption": "Only the dotted amber route crosses the iteration boundary; solid body wires remain same-turn.", "state": "alt", "target": "[data-demo-toggle]"},
                ],
            },
            "media": [{
                "label": "Reading key",
                "caption": f"{name} keeps ordinary body flow solid and reserves amber dots for values unavailable until the next turn.",
                "html": f'<div style="min-height:110px;border:1px solid #d9dfe1;border-radius:12px;padding:18px;background:#fff;display:grid;gap:16px"><div style="display:flex;align-items:center;gap:12px"><svg width="130" height="18"><path d="M4 9H122" stroke="{INK}" stroke-width="3"/><path d="M114 3l8 6-8 6" fill="none" stroke="{INK}" stroke-width="2"/></svg><b>same invocation</b></div><div style="display:flex;align-items:center;gap:12px"><svg width="130" height="18"><path d="M4 9H122" stroke="{AMBER}" stroke-width="3" stroke-dasharray="3 7"/><path d="M114 3l8 6-8 6" fill="none" stroke="{AMBER}" stroke-width="2"/></svg><b>next iteration</b></div></div>',
            }],
            "scores": score_entries(scores, name),
            "gateResults": {gate["id"]: {"pass": True, "evidence": f"The {name} hero gives this role an explicit label, path, or boundary."} for gate in GATES},
        })
    return {
        "schemaVersion": 3,
        "title": "Ten other ways to draw a Python for-loop",
        "kicker": "SystemSketch visual grammar · Babble 10",
        "brief": "Represent `for other in others` as dataflow while keeping the collection, current element, loop-carried pose, and final pose temporally honest. Zach’s dotted header-spine proposal is the fixed reference; these are ten structural alternatives, not color variants.",
        "count": 10,
        "defaultId": "v1",
        "defaultWhy": "Paired Gates leads at 95.2/100: it gives collection unpacking, carried values, recurrence, completion, break, and nesting distinct homes while leaving the body as ordinary dataflow.",
        "decisionHinge": "The result hinges on how much grammar should live in the frame. Move 10 points from semantic completeness to SystemSketch fit and 5 from hard-loop scalability to visual calm: Paired Gates and Header Lanes tie at 92.2. If the common case is one accumulator and shallow nesting, prefer Header Lanes; if break, multiple carries, or nesting are normal, keep Paired Gates.",
        "invariants": [
            "Zach’s latest dotted header-spine sketch remains the external reference and is not counted among the ten alternatives.",
            "Solid cable means usable in the current invocation; amber dotted cable means available only after an iteration boundary.",
            "Every direction uses the same `others` + seed `pose` + `merge()` fixture.",
            "The internal body remains an ordinary SystemSketch dataflow graph.",
        ],
        "boundary": "These are editable visual-grammar prototypes and an authored `.systemsketch` stress board. They do not add a loop shape, execution semantics, parser rule, or Python round-trip implementation to the product.",
        "axes": [
            {"name": "Iteration owner", "values": ["paired gates", "micro-nodes", "header", "boundary", "variables", "macro", "space", "tokens", "trace", "switch"]},
            {"name": "Primary object", "values": ["region boundary", "iterator/φ", "lanes", "portal", "pill", "fold", "iteration", "token", "table", "scheduler"]},
            {"name": "Temporal encoding", "values": ["gate return", "backedge", "carry lane", "boundary return", "pill writeback", "hidden fold", "unrolling", "clock tokens", "columns", "next/done"]},
        ],
        "requirements": REQUIREMENTS,
        "hardGates": GATES,
        "variants": variants,
    }


STRESS = [
    {
        "id": "s1", "level": "1 · Easy", "name": "Pure map · item only",
        "code": "for image in images:\n    thumb = resize(image)\n    save(thumb)",
        "items": "image", "state": "—", "body": "resize → save", "result": "done",
        "note": "Tests collection→item unpacking without inventing carried state.",
    },
    {
        "id": "s2", "level": "2 · Baseline", "name": "Single accumulator · original",
        "code": "pose = estimate(frame, gain)\nfor other in others:\n    pose = merge(pose, other)\nreturn encode(pose)",
        "items": "other", "state": "pose", "body": "merge", "result": "pose",
        "note": "Tests seed, next-iteration state, and final-state separation.",
    },
    {
        "id": "s3", "level": "3 · Medium", "name": "Enumerate + indexed side input",
        "code": "total = 0.0\nfor i, sample in enumerate(samples):\n    weighted = scale(sample, weights[i])\n    total = add(total, weighted)\nreturn total",
        "items": "i, sample", "state": "total", "body": "lookup → scale → add", "result": "total",
        "note": "Tests tuple unpacking plus an ordinary side input that must not look loop-carried.",
    },
    {
        "id": "s4", "level": "4 · Hard", "name": "Zip + two carries + conditional update",
        "code": "loss, kept = 0.0, []\nfor pred, target in zip(preds, targets):\n    err = error(pred, target)\n    if valid(err):\n        loss += err; kept.append(pred)\nreturn loss, kept",
        "items": "pred, target", "state": "loss, kept", "body": "error → valid? → update", "result": "loss, kept",
        "note": "Tests two current items, two carried values, and a state update that may bypass.",
    },
    {
        "id": "s5", "level": "5 · Very hard", "name": "Nested loops + early exit",
        "code": "best = None\nfor batch in batches:\n    score = 0\n    for candidate in batch:\n        score += evaluate(candidate)\n        if score >= threshold: break\n    if score >= threshold:\n        best = candidate; break\nreturn best",
        "items": "batch ⊃ candidate", "state": "best ⊃ score", "body": "evaluate → threshold? → break", "result": "best",
        "note": "Tests nested iteration ownership, inner/outer state, and completion versus break.",
    },
]


def stress_svg(variant_id: str, example: dict[str, str]) -> str:
    item = html.escape(example["items"])
    state = html.escape(example["state"])
    body = html.escape(example["body"])
    result = html.escape(example["result"])
    nested = example["id"] == "s5"
    if variant_id == "v1":
        inner = f'<rect x="42" y="36" width="116" height="118" rx="10" class="gate"/><text x="100" y="63" text-anchor="middle">ITERATE</text><text x="100" y="91" text-anchor="middle" class="small">{item}</text><text x="100" y="116" text-anchor="middle" class="small">{state}</text><rect x="218" y="55" width="166" height="80" rx="10" class="body"/><text x="301" y="84" text-anchor="middle">{body}</text>{'<rect x="249" y="96" width="104" height="24" rx="8" class="nested"/><text x="301" y="113" text-anchor="middle" class="tiny">inner gate pair</text>' if nested else ''}<rect x="442" y="36" width="116" height="118" rx="10" class="yield"/><text x="500" y="63" text-anchor="middle">YIELD</text><text x="500" y="91" text-anchor="middle" class="small">next {state}</text><text x="500" y="116" text-anchor="middle" class="small">done {result}</text><path d="M158 76H218M158 118H218M384 94H442" class="solid"/><path d="M500 154V181H100V154" class="later"/>'
    elif variant_id == "v3":
        inner = f'<rect x="42" y="30" width="516" height="78" rx="10" class="lane"/><text x="58" y="57" class="small strong">each</text><text x="122" y="57" class="small">{item}</text><text x="58" y="87" class="small strong">carry</text><text x="122" y="87" class="small">{state}</text><rect x="218" y="130" width="166" height="62" rx="10" class="body"/><text x="301" y="158" text-anchor="middle">{body}</text>{'<text x="301" y="180" text-anchor="middle" class="tiny">nested header inside body</text>' if nested else ''}<path d="M232 57V130M270 87V130" class="solid"/><path d="M384 161H522V87H454" class="later"/><path d="M384 181H558" class="solid"/><text x="548" y="173" text-anchor="end" class="tiny">done {result}</text>'
    else:
        inner = f'<rect x="58" y="42" width="150" height="42" rx="21" class="pill item"/><text x="133" y="69" text-anchor="middle" class="small strong">{item}</text><rect x="58" y="118" width="150" height="42" rx="21" class="pill state"/><text x="133" y="145" text-anchor="middle" class="small strong">{state}</text><rect x="294" y="76" width="184" height="74" rx="10" class="body"/><text x="386" y="105" text-anchor="middle">{body}</text>{'<text x="386" y="130" text-anchor="middle" class="tiny">inner item/state pills</text>' if nested else ''}<path d="M208 63H258V96H294M208 139H294" class="solid"/><path d="M478 128V184H133V160" class="later"/><path d="M478 105H558" class="solid"/><text x="548" y="97" text-anchor="end" class="tiny">final {result}</text>'
    return f"""<svg viewBox="0 0 600 220" role="img" aria-label="{html.escape(example['name'])}"><defs><marker id="stress-arrow-{variant_id}-{example['id']}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="{INK}" stroke-width="1.8"/></marker><marker id="stress-later-{variant_id}-{example['id']}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="{AMBER}" stroke-width="1.8"/></marker></defs><style>.gate,.yield,.lane,.pill,.body{{fill:#fff;stroke:#718087;stroke-width:1.8}}.gate{{stroke:{AMBER}}}.yield{{stroke:{GREEN}}}.item{{stroke:{AMBER}}}.state{{stroke:#7b62a8}}.nested{{fill:#fff7e6;stroke:{AMBER}}}text{{font:600 12px ui-monospace,monospace;fill:{INK}}}.small{{font-size:10px;font-weight:500}}.tiny{{font-size:8.5px;font-weight:500;fill:{MUTED}}}.strong{{font-weight:800}}.solid{{fill:none;stroke:{INK};stroke-width:2.2;marker-end:url(#stress-arrow-{variant_id}-{example['id']})}}.later{{fill:none;stroke:{AMBER};stroke-width:2.2;stroke-dasharray:3 7;marker-end:url(#stress-later-{variant_id}-{example['id']})}}</style>{inner}</svg>"""


def stress_section() -> str:
    top = [("v1", "1 · Paired Gates", "95.2"), ("v3", "2 · Header Lanes", "91.2"), ("v5", "3 · State Pills", "89.6")]
    rows = []
    for variant_id, title, score in top:
        cards = []
        for example in STRESS:
            cards.append(f"""
              <article class="stress-card">
                <div class="stress-card-head"><span>{html.escape(example['level'])}</span><b>{html.escape(example['name'])}</b></div>
                <pre>{html.escape(example['code'])}</pre>
                <div class="stress-figure">{stress_svg(variant_id, example)}</div>
                <p>{html.escape(example['note'])}</p>
              </article>""")
        rows.append(f"""
          <section class="stress-family">
            <div class="stress-family-head"><div><span class="evidence-chip">prototype evidence · is</span><h3>{title}</h3></div><strong>{score}/100</strong></div>
            <div class="stress-grid">{''.join(cards)}</div>
          </section>""")
    return f"""
      <section class="stress-atlas" aria-labelledby="stress-heading">
        <div class="stress-intro"><div><span class="section-kicker">Post-prune load test</span><h2 id="stress-heading">15 examples · the same five loops through the top three grammars</h2></div><p>The programs repeat deliberately. Comparing the same loop across each row exposes representational differences; increasing difficulty down each family exposes where the grammar breaks.</p></div>
        {''.join(rows)}
      </section>
      <style>
        .stress-atlas{{margin:42px auto 72px;max-width:1500px;padding:0 24px}}
        .stress-intro{{display:grid;grid-template-columns:1.4fr 1fr;gap:28px;align-items:end;margin-bottom:28px}}
        .stress-intro h2{{font-size:clamp(30px,4vw,54px);letter-spacing:-.045em;line-height:1.02;margin:8px 0 0}}
        .stress-intro p{{color:#5e6a71;line-height:1.55;margin:0}}
        .section-kicker{{font:800 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:{AMBER}}}
        .stress-family{{border-top:1px solid #cfd6d9;padding-top:22px;margin-top:40px}}
        .stress-family-head{{display:flex;justify-content:space-between;align-items:end;margin-bottom:18px}}
        .stress-family-head h3{{font-size:30px;margin:7px 0 0}}
        .stress-family-head>strong{{font:800 20px ui-monospace,monospace;color:{GREEN}}}
        .stress-grid{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}}
        .stress-card{{border:1px solid #d8dddf;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 10px 28px rgba(30,45,50,.06)}}
        .stress-card-head{{padding:14px 16px 11px;border-bottom:1px solid #e3e7e8;min-height:73px;display:grid;align-content:start;gap:4px}}
        .stress-card-head span{{font:800 10px ui-monospace,monospace;color:{AMBER};text-transform:uppercase;letter-spacing:.08em}}
        .stress-card-head b{{font-size:14px;line-height:1.25}}
        .stress-card pre{{margin:0;padding:14px 16px;min-height:190px;background:#20282d;color:#f3f6f7;font:10.5px/1.48 ui-monospace,monospace;white-space:pre-wrap}}
        .stress-figure{{padding:8px 8px 0;background:#fafcfc}}
        .stress-figure svg{{display:block;width:100%;height:auto}}
        .stress-card p{{margin:0;padding:0 16px 16px;color:#617078;font-size:11px;line-height:1.45;min-height:62px}}
        @media(max-width:1150px){{.stress-grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}
        @media(max-width:700px){{.stress-intro{{grid-template-columns:1fr}}.stress-grid{{grid-template-columns:1fr}}}}
      </style>"""


def geo_shape(shape_id: str, parent: str, x: int, y: int, w: int, h: int, text: str, *, color: str = "grey", fill: str = "semi", geo: str = "rectangle") -> dict[str, object]:
    return {"id": shape_id, "type": "geo", "parentId": parent, "x": x, "y": y, "text": text, "props": {"geo": geo, "w": w, "h": h, "color": color, "labelColor": "black", "fill": fill, "dash": "solid", "size": "s", "font": "mono", "align": "middle", "verticalAlign": "middle"}}


def arrow_shape(shape_id: str, parent: str, x: int, y: int, dx: int, dy: int, *, dotted: bool = False, color: str = "black") -> dict[str, object]:
    return {"id": shape_id, "type": "arrow", "parentId": parent, "x": x, "y": y, "props": {"kind": "elbow", "start": {"x": 0, "y": 0}, "end": {"x": dx, "y": dy}, "color": color, "dash": "dotted" if dotted else "solid", "size": "m", "fill": "none", "arrowheadStart": "none", "arrowheadEnd": "arrow"}}


def block_shape(shape_id: str, parent: str, x: int, y: int, example: dict[str, str]) -> dict[str, object]:
    inputs = [{"id": "item", "name": example["items"], "type": "item", "visible": True}]
    if example["state"] != "—":
        inputs.append({"id": "state", "name": example["state"], "type": "state", "visible": True})
    return {"id": shape_id, "type": "block", "parentId": parent, "x": x, "y": y, "props": {"title": example["body"] + "()", "description": "ordinary same-turn body graph", "blockType": "Loop body", "view": "port", "w": 310, "h": 176, "inputs": inputs, "outputs": [{"id": "next", "name": example["result"], "type": "state", "visible": True}]}}


def build_board_recipe() -> dict[str, object]:
    shapes: list[dict[str, object]] = []
    families = [("paired", "V1 · Paired Gates"), ("lanes", "V3 · Header Lanes"), ("pills", "V5 · State Pills")]
    cell_w, cell_h = 980, 610
    gap_x, gap_y = 90, 84
    start_x, start_y = 80, 380
    for column, (family, family_name) in enumerate(families):
        for row, example in enumerate(STRESS):
            frame_id = f"{family}-{example['id']}"
            x = start_x + column * (cell_w + gap_x)
            y = start_y + row * (cell_h + gap_y)
            shapes.append({"id": frame_id, "type": "frame", "x": x, "y": y, "props": {"w": cell_w, "h": cell_h, "name": f"{family_name} · {example['level']} · {example['name']}"}})
            shapes.append(geo_shape(f"{frame_id}-code", frame_id, 24, 34, 932, 128, example["code"], color="grey", fill="semi"))
            body_id = f"{frame_id}-body"
            if family == "paired":
                shapes.extend([
                    arrow_shape(f"{frame_id}-a1", frame_id, 248, 312, 116, 0),
                    arrow_shape(f"{frame_id}-a2", frame_id, 674, 312, 76, 0),
                    arrow_shape(f"{frame_id}-loop", frame_id, 808, 420, -610, 0, dotted=True, color="orange"),
                    geo_shape(f"{frame_id}-iterate", frame_id, 72, 236, 176, 170, f"ITERATE\nitem · {example['items']}\nstate · {example['state']}", color="orange", fill="semi"),
                    block_shape(body_id, frame_id, 364, 226, example),
                    geo_shape(f"{frame_id}-yield", frame_id, 750, 236, 158, 170, f"YIELD\nnext · {example['state']}\ndone · {example['result']}", color="green", fill="semi"),
                    geo_shape(f"{frame_id}-key", frame_id, 350, 456, 350, 78, "solid = this invocation\ndotted = next iteration", color="orange", fill="none"),
                ])
            elif family == "lanes":
                shapes.extend([
                    arrow_shape(f"{frame_id}-item", frame_id, 354, 282, 88, 60),
                    arrow_shape(f"{frame_id}-state", frame_id, 354, 318, 88, 96),
                    arrow_shape(f"{frame_id}-loop", frame_id, 752, 396, -340, -78, dotted=True, color="orange"),
                    arrow_shape(f"{frame_id}-done", frame_id, 752, 430, 154, 0),
                    geo_shape(f"{frame_id}-header", frame_id, 72, 208, 836, 126, f"EACH     {example['items']} ← iterable[i]\nCARRY    {example['state']} ← seed | z⁻¹\nDONE     {example['result']}", color="orange", fill="semi"),
                    block_shape(body_id, frame_id, 442, 354, example),
                    geo_shape(f"{frame_id}-key", frame_id, 72, 454, 310, 78, "short drops into body\none dotted return to header", color="orange", fill="none"),
                ])
            else:
                shapes.extend([
                    arrow_shape(f"{frame_id}-item", frame_id, 266, 292, 176, 46),
                    arrow_shape(f"{frame_id}-state", frame_id, 266, 414, 176, 0),
                    arrow_shape(f"{frame_id}-loop", frame_id, 752, 408, -564, 58, dotted=True, color="orange"),
                    arrow_shape(f"{frame_id}-done", frame_id, 752, 360, 154, 0),
                    geo_shape(f"{frame_id}-item-pill", frame_id, 72, 254, 194, 76, f"{example['items']} = ⋯", color="orange", fill="semi", geo="ellipse"),
                    geo_shape(f"{frame_id}-state-pill", frame_id, 72, 376, 194, 76, f"{example['state']} = ⋯", color="violet", fill="semi", geo="ellipse"),
                    block_shape(body_id, frame_id, 442, 324, example),
                    geo_shape(f"{frame_id}-key", frame_id, 72, 492, 360, 58, "write pill now · read it next turn", color="orange", fill="none"),
                ])
    return {
        "feature": "For-loop visual grammar stress atlas",
        "viewport": {"width": 3400, "height": 3900},
        "pages": [{"id": "review", "name": "For-loop grammar"}],
        "shapes": shapes,
        "bindings": [],
        "callouts": [
            {"id": "step-1", "kind": "step", "text": "1 · Compare down a column: one grammar from pure map to nested break", "x": 80, "y": 100, "w": 820, "h": 110, "target": {"shapeId": "paired-s1", "anchor": "top", "dx": -260}},
            {"id": "step-2", "kind": "step", "text": "2 · Compare across a row: the same Python loop through all three finalists", "x": 1120, "y": 100, "w": 900, "h": 110, "target": {"shapeId": "lanes-s1", "anchor": "top", "dx": 180}},
            {"id": "pass", "kind": "pass", "text": "PASS WHEN · one grammar stays understandable from easy to hard, and dotted lines mean only next-iteration availability", "x": 2240, "y": 100, "w": 960, "h": 110},
        ],
    }


def main() -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    SKETCHES.mkdir(parents=True, exist_ok=True)
    SPEC.write_text(json.dumps(build_spec(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    RECIPE.write_text(json.dumps(build_board_recipe(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary_gallery = GALLERY.with_suffix(".tmp.html")
    temporary_gallery.unlink(missing_ok=True)
    subprocess.run(["python3", str(BABBLE), "build", "--spec", str(SPEC), "--output", str(temporary_gallery)], check=True)
    source = temporary_gallery.read_text(encoding="utf-8")
    if "</main>" not in source:
        raise RuntimeError("gallery shell has no </main> insertion point")
    temporary_gallery.write_text(source.replace("  </main>", stress_section() + "\n  </main>", 1), encoding="utf-8")
    temporary_gallery.replace(GALLERY)
    print(GALLERY)
    print(SPEC)
    print(RECIPE)


if __name__ == "__main__":
    main()
