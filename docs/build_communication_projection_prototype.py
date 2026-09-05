#!/usr/bin/env python3
"""Build the self-contained communication-projection Babble gallery."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "communication-projection"
OUTPUT = ROOT / "docs" / "communication-projection-prototype-2026-09-04.html"
GALLERY = Path("/home/bam/.codex/skills/babble/scripts/gallery.py")


def data_uri(name: str) -> str:
    payload = base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


DATAFLOW = data_uri("01-dataflow.png")
TAGGED = data_uri("02-tagged-edges.png")


def preview(component_image: str, route: str) -> str:
    images = {
        "wiring": DATAFLOW,
        "tagged": TAGGED,
        "components": data_uri(component_image),
    }
    buttons = "".join(
        f'<button type="button" data-view-button="{state}" '
        f'onclick="this.closest(\'.variant-card\').querySelector(\'[data-story-index=&quot;{index}&quot;]\').click()">{label}</button>'
        for index, (state, label) in enumerate(
            (("wiring", "Dataflow"), ("tagged", "Tag edges"), ("components", "Components"))
        )
    )
    pictures = "".join(
        f'<img data-view-image="{state}" src="{uri}" alt="{state} state of the SystemSketch communication prototype">'
        for state, uri in images.items()
    )
    return (
        f'<div class="comm-demo" data-route="{route}">'
        f'<div class="comm-demo-controls" aria-label="Prototype view">{buttons}</div>'
        f'<div class="comm-demo-screen">{pictures}</div>'
        f'<div class="comm-demo-caption"><b>Same board</b><span>13 data edges · 11 protocol legs · 7 relationships · {route} overview</span></div>'
        "</div>"
    )


ARCHITECTURE = """
<div class="projection-diagram" role="img" aria-label="One canonical graph feeding two communication projections">
  <span class="projection-source"><b>13 data edges</b><small>ports + value nodes</small></span>
  <span class="projection-arrow">→</span>
  <span class="projection-parser"><b>name parser</b><small>Dora-style phases</small></span>
  <span class="projection-arrow split">↗<br>↘</span>
  <span class="projection-output"><b>11 tagged legs</b><small>audit the parse</small></span>
  <span class="projection-output"><b>7 relationships</b><small>read components</small></span>
</div>
"""


def score(score: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": score, "evidence": evidence, "confidence": confidence}


def gate_results(route: str) -> dict[str, dict[str, object]]:
    return {
        "g1": {"pass": True, "evidence": "The browser returned from Components to the original 13 stored connections with all Block centres unchanged."},
        "g2": {"pass": True, "evidence": "Tagged mode rendered one arrow per directed port edge; no bidirectional relationship was drawn on a port."},
        "g3": {"pass": True, "evidence": f"The {route} Components state showed six Simple component cards, hid both value pills, and rendered seven centre-derived relationships."},
        "g4": {"pass": True, "evidence": "The prototype is query-gated and stores no communication-family field or second graph in the document."},
    }


shared_story = {
    "title": "Walk the same graph through both projections",
    "steps": [
        {
            "label": "Inspect canonical dataflow",
            "caption": "Ports, two literal value nodes, and all 13 directed value edges are visible.",
            "state": "wiring",
            "target": '[data-view-button="wiring"]',
        },
        {
            "label": "Audit the semantic parse",
            "caption": "Eleven real port edges gain Topic, Stream, Service-phase, or Action-phase paint; local values stay neutral.",
            "state": "tagged",
            "target": '[data-view-button="tagged"]',
        },
        {
            "label": "Read component communication",
            "caption": "The same components switch to Simple, literal values disappear, and protocol legs collapse to seven relationships.",
            "state": "components",
            "target": '[data-view-button="components"]',
        },
    ],
}


project = {
    "schemaVersion": 3,
    "title": "Communication projection routes",
    "kicker": "SystemSketch · high-fidelity prototype",
    "brief": "Split communication into two honest layers: tags on canonical data edges for parse verification, then a simplified component map that hides ports and values and draws aggregate relationships independently of port geometry.",
    "count": 3,
    "defaultId": "v1",
    "defaultWhy": "Curved lanes are the only treatment here that keeps Service and Action independently traceable between the same component pair without adding the visual dominance of an animated beam.",
    "decisionHinge": "If the overview is primarily a live-runtime tracer rather than a static architecture map, raise path tracking above visual restraint and the Signal beams direction becomes competitive. If layout can guarantee no co-linear relations, Straight rails becomes the quieter option.",
    "invariants": [
        "One stored SystemSketch graph; no parallel service/action document model.",
        "Tagged mode stays on directed port-to-port data edges.",
        "Components mode keeps Block centres, switches components to Simple, and hides literal value nodes.",
        "Service and Action collapse multiple protocol legs into one bidirectional relationship only after ports disappear.",
    ],
    "boundary": "Query-gated prototype in the real app. Name-based parsing, projection paint, and view transitions are exercised; durable metadata, editing semantics, runtime telemetry, export, and large-graph layout remain intentionally unimplemented.",
    "axes": [
        {"name": "Relationship route", "values": ["curved lanes", "parallel straight rails", "pulsed signal beams"]},
        {"name": "Crossing behavior", "values": ["separate by bend", "accept line crossings", "emphasize trace over calmness"]},
        {"name": "Attention cost", "values": ["moderate", "lowest", "highest"]},
    ],
    "requirements": [
        {
            "id": "fr1", "name": "Semantic fidelity", "weight": 30,
            "why": "The overview must be a loss-aware projection of the dataflow, not a separately editable architecture diagram.",
            "passCondition": "Returning to Dataflow restores the same 13 edges, ports, value nodes, and component centres.",
            "anchors": {"1": "Requires a second graph or loses identity.", "3": "Shares names but not a provable source graph.", "5": "Projects and reverses from the same stored records."},
        },
        {
            "id": "fr2", "name": "Parse auditability", "weight": 24,
            "why": "The tagged wiring view exists chiefly to prove that request/reply and action phases were recognized correctly.",
            "passCondition": "Every recognized protocol leg is labeled on its original one-way port edge while local values remain neutral.",
            "anchors": {"1": "Only aggregate relationships are visible.", "3": "Families show, but phases or original wires are ambiguous.", "5": "Family, phase, direction, and original port wire are simultaneously visible."},
        },
        {
            "id": "fr3", "name": "Overview legibility", "weight": 24,
            "why": "The component projection should make who communicates with whom easier to read than the port view.",
            "passCondition": "Topic, Stream, Service, and Action relationships can be followed without inspecting ports or decoding overlaps.",
            "anchors": {"1": "Relationships merge or disappear.", "3": "The common path reads, but crossings need effort.", "5": "Multiple families remain distinct at a glance."},
        },
        {
            "id": "fr4", "name": "Spatial continuity", "weight": 14,
            "why": "Switching views should preserve the reader's spatial memory of the board.",
            "passCondition": "Every component centre is unchanged across Dataflow and Components.",
            "anchors": {"1": "The map relayouts completely.", "3": "Regions persist but cards noticeably shift.", "5": "All occurrence centres are byte-for-byte unchanged."},
        },
        {
            "id": "fr5", "name": "Visual restraint", "weight": 8,
            "why": "Communication semantics should clarify the board without becoming the board's loudest object.",
            "passCondition": "Labels and paths remain readable while component identity stays visually primary.",
            "anchors": {"1": "Edge treatment dominates the cards.", "3": "Readable but conspicuous.", "5": "Quiet until inspected, clear when followed."},
        },
    ],
    "hardGates": [
        {"id": "g1", "name": "Same stored graph", "why": "A second architecture model would drift from the dataflow it claims to explain."},
        {"id": "g2", "name": "No bidirectional port arrows", "why": "A port edge represents one value direction; protocol reciprocity belongs only in the simplified projection."},
        {"id": "g3", "name": "True component simplification", "why": "The overview must remove ports and value nodes, not merely recolor the dense wiring view."},
        {"id": "g4", "name": "Prototype stays non-semantic", "why": "A taste test must not silently commit an unchosen persistent schema."},
    ],
    "variants": [
        {
            "id": "v1", "name": "Arc lanes", "accent": "#118b6d",
            "thesis": "Curved, labelled relationships use bend as a lane, keeping Service and Action separate between the same two component centres.",
            "bestWhen": "Several communication families share a component pair or long edges cross the board.",
            "losesWhen": "A rigid grid makes every relationship already orthogonal and one route per pair is guaranteed.",
            "decisions": [
                {"label": "Route grammar", "value": "Quadratic centre-derived arcs with separate lanes per family."},
                {"label": "Reciprocity", "value": "Service and Action receive arrowheads at both card boundaries; Topics and Streams stay one-way."},
                {"label": "Density rule", "value": "One labelled relationship replaces every recognized protocol family group."},
            ],
            "keepParts": ["centre-preserving Simple transition", "family-coloured phase tags", "curve lane per shared pair"],
            "proof": ["Real-browser journey produced seven aggregate relationships from eleven tagged protocol legs.", "Action and Service remained separately readable between Mission BT and Motion Controller.", "Return to Dataflow restored the original graph and both literal nodes."],
            "previewLabel": "real SystemSketch states · curved overview",
            "story": shared_story,
            "scores": {
                "fr1": score(5, "Thirteen stored connections and all centres were restored after the projection round-trip."),
                "fr2": score(5, "The tagged screenshot shows all eleven protocol legs on their original port routes."),
                "fr3": score(5, "Opposed arc lanes keep Action and Service distinct between the shared pair."),
                "fr4": score(5, "The smoke journey compared all six component centres before and after and found exact equality."),
                "fr5": score(4, "Solid 2.8 px arcs are calm, though long cross-board relations remain prominent."),
            },
            "gateResults": gate_results("curved"),
            "preview": preview("03-components-curved.png", "curved"),
            "media": [{"label": "One graph, two projections", "caption": "The parse-audit lens and the component map consume the same connection records; only the latter collapses protocol legs.", "html": ARCHITECTURE}],
        },
        {
            "id": "v2", "name": "Straight rails", "accent": "#3971dd",
            "thesis": "Straight centre-derived arrows minimize ornament and make path length honest, accepting crossings as a layout problem.",
            "bestWhen": "The component layout already separates relationships and the quietest static architecture map is the goal.",
            "losesWhen": "Two families share a pair or unrelated diagonals intersect near their labels.",
            "decisions": [
                {"label": "Route grammar", "value": "Parallel straight rails offset only when a pair carries multiple families."},
                {"label": "Crossings", "value": "No automatic detour; node placement is expected to solve them."},
                {"label": "Attention", "value": "The thinnest, least animated presentation in the set."},
            ],
            "keepParts": ["straight path option", "parallel family offsets", "quiet static paint"],
            "proof": ["Every relation switched to the straight treatment through the live control.", "Service and Action remained distinct as parallel rails.", "Plan and Preview labels visibly compete at a central crossing."],
            "previewLabel": "real SystemSketch states · straight overview",
            "story": shared_story,
            "scores": {
                "fr1": score(5, "Uses the identical stored graph and the same reversible view command."),
                "fr2": score(5, "The shared tagged state remains phase-complete and port-anchored."),
                "fr3": score(3, "The central Plan/Preview crossing and near-overlapping labels require interpretation."),
                "fr4": score(5, "Route changes never move component centres."),
                "fr5": score(5, "Straight solid rails are the quietest treatment and add no motion or glow."),
            },
            "gateResults": gate_results("straight"),
            "preview": preview("04-components-straight.png", "straight"),
            "media": [{"label": "Crossing is explicit", "caption": "This option treats crossings as evidence that layout needs work rather than bending around them automatically.", "html": ARCHITECTURE}],
        },
        {
            "id": "v3", "name": "Signal beams", "accent": "#7558d7",
            "thesis": "A glow and travelling dash turn aggregate relationships into live-looking channels that are easy to trace across distance.",
            "bestWhen": "The view will soon carry runtime activity and the primary task is following a changing path.",
            "losesWhen": "The board is a calm architecture overview or many channels are active at once.",
            "decisions": [
                {"label": "Route grammar", "value": "Curved lanes retain separation, then add a glow and directional pulse."},
                {"label": "Runtime affordance", "value": "Motion implies a future place for feedback and active-message state."},
                {"label": "Cost", "value": "Animation and bloom intentionally spend more attention."},
            ],
            "keepParts": ["optional active-path pulse", "soft channel glow", "curved lane geometry"],
            "proof": ["The browser switched all seven relationships to the laser treatment.", "Long Camera → Telemetry and Planner → Mission paths are easy to trace.", "The same glow visibly competes with component titles in a still frame."],
            "previewLabel": "real SystemSketch states · signal overview",
            "story": shared_story,
            "scores": {
                "fr1": score(5, "Uses the same stored graph and reversible projection command."),
                "fr2": score(5, "The shared tagged state retains every phase on its actual port edge."),
                "fr3": score(4, "Pulse and glow aid tracing, while crossings still remain."),
                "fr4": score(5, "The effect changes paint only; component centres remain identical."),
                "fr5": score(2, "Glow plus perpetual motion makes edges one of the loudest objects on the board."),
            },
            "gateResults": gate_results("laser"),
            "preview": preview("04-components-laser.png", "laser"),
            "media": [{"label": "Runtime-shaped affordance", "caption": "The beam is useful only if future runtime activity is important enough to justify persistent motion.", "html": ARCHITECTURE}],
        },
    ],
    "checks": [
        "Three equally framed route treatments",
        "One real SystemSketch board across every state",
        "Weighted criteria frozen before scoring",
        "Every score carries browser evidence and confidence",
        "Pick, shortlist, reject, and splice export",
    ],
}


CUSTOM_CSS = r"""
    .comm-demo { display:grid; gap:10px; background:#f7f8fa; }
    .comm-demo-controls { position:absolute; z-index:2; top:12px; left:50%; display:flex; gap:3px; padding:4px; transform:translateX(-50%); border:1px solid #d7dce4; border-radius:11px; background:rgba(255,255,255,.94); box-shadow:0 5px 18px rgba(15,23,42,.12); }
    .comm-demo-controls button { padding:7px 10px; border:0; border-radius:7px; background:transparent; color:#5f6776; cursor:pointer; font:700 10px/1 ui-monospace,monospace; }
    .prototype[data-story-state="wiring"] [data-view-button="wiring"], .prototype[data-story-state="tagged"] [data-view-button="tagged"], .prototype[data-story-state="components"] [data-view-button="components"] { background:#e9f2ff; color:#2167c7; outline:2px solid rgba(47,116,225,.2); }
    .comm-demo-screen { aspect-ratio:5/3; overflow:hidden; border-bottom:1px solid #dfe3e9; background:#fff; }
    .comm-demo-screen img { display:none; width:100%; height:100%; object-fit:cover; object-position:center top; }
    .prototype[data-story-state="wiring"] [data-view-image="wiring"], .prototype[data-story-state="tagged"] [data-view-image="tagged"], .prototype[data-story-state="components"] [data-view-image="components"] { display:block; }
    .comm-demo-caption { display:flex; justify-content:space-between; gap:18px; padding:0 14px 12px; color:#5f6776; font:600 10px/1.4 ui-monospace,monospace; }
    .comm-demo-caption b { color:#202632; }
    .projection-diagram { display:grid; grid-template-columns:1.15fr auto 1fr auto 1fr; align-items:center; gap:12px; min-height:170px; padding:24px; background:linear-gradient(135deg,#f8fafc,#eff5f4); }
    .projection-source, .projection-parser, .projection-output { display:grid; gap:5px; padding:16px; border:1px solid #ced6de; border-radius:12px; background:white; box-shadow:0 4px 14px rgba(15,23,42,.06); }
    .projection-source b, .projection-parser b, .projection-output b { font:750 12px/1.2 ui-monospace,monospace; }
    .projection-source small, .projection-parser small, .projection-output small { color:#6a7280; font-size:11px; }
    .projection-arrow { color:#788497; font-size:22px; text-align:center; }
    .projection-arrow.split { line-height:1.1; }
    @media (max-width:760px) { .projection-diagram { grid-template-columns:1fr; } .projection-arrow { transform:rotate(90deg); } .comm-demo-caption { flex-direction:column; } }
"""


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="communication-projection-gallery-") as folder:
        spec_path = Path(folder) / "spec.json"
        spec_path.write_text(json.dumps(project, indent=2), encoding="utf-8")
        subprocess.run(
            ["python3", str(GALLERY), "build", "--spec", str(spec_path), "--output", str(OUTPUT)],
            check=True,
        )
    html = OUTPUT.read_text(encoding="utf-8")
    html = html.replace("</style>", f"{CUSTOM_CSS.strip()}\n  </style>", 1)
    # Let the first scan compare all three outcomes before focus mode or the AI
    # ranking narrows attention to one. The gallery shell defaults to focus for
    # larger rounds; three equal-fidelity variants fit comfortably as a grid.
    html = html.replace(
        '<button class="tool-button" type="button" data-layout="grid">Grid</button>',
        '<button class="tool-button active" type="button" data-layout="grid">Grid</button>',
    ).replace(
        '<button class="tool-button active" type="button" data-layout="focus">Focus</button>',
        '<button class="tool-button" type="button" data-layout="focus">Focus</button>',
    ).replace('layout: "focus"', 'layout: "grid"')
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
