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


def preview(component_port_image: str, component_simple_image: str, route: str) -> str:
    images = {
        "wiring": DATAFLOW,
        "tagged": TAGGED,
        "component_port": data_uri(component_port_image),
        "component_simple": data_uri(component_simple_image),
    }
    buttons = "".join(
        f'<button type="button" data-view-button="{state}" data-view-index="{index}">{label}</button>'
        for index, (state, label) in enumerate(
            (("wiring", "Dataflow"), ("tagged", "Tag edges"), ("component_port", "Port"), ("component_simple", "Simple"))
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
        "g1": {"pass": True, "evidence": "The browser compared serialized shape records before and after every toggle; the stored graph remained byte-identical."},
        "g2": {"pass": True, "evidence": "All six Simple DOM boxes exactly matched their Port x, y, width, and height."},
        "g3": {"pass": True, "evidence": "Action selected goal, Service selected request, and one-way Topic/Stream relationships retained their data tracks."},
        "g4": {"pass": True, "evidence": f"The {route} treatment is query-gated paint with no new schema, family field, or second graph."},
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
            "label": "Check the Port overlay",
            "caption": "Protocol legs collapse to seven relationships while the real Port boxes expose exactly which tracks carry them.",
            "state": "component_port",
            "target": '[data-view-button="component_port"]',
        },
        {
            "label": "Hide detail, keep geometry",
            "caption": "Simple replaces the Port face without moving or resizing any component; the relationship geometry remains fixed.",
            "state": "component_simple",
            "target": '[data-view-button="component_simple"]',
        },
    ],
}


project = {
    "schemaVersion": 3,
    "title": "Communication projection · track or centreline",
    "kicker": "SystemSketch · same-geometry prototype",
    "brief": "Keep the component layout fixed while toggling Port or same-size Simple cards. Compare semantic arrows that reuse one canonical protocol track with straight arrows derived from component centres.",
    "count": 2,
    "defaultId": "v1",
    "defaultWhy": "Track overlay is the only treatment that visibly proves the aggregate came from the existing dataflow: Action rides goal, Service rides request, and Topic/Stream ride their data cable.",
    "decisionHinge": "Choose Centreline when the primary job is an abstract architecture overview and route provenance no longer matters. Choose Track overlay when the view must remain visibly accountable to the wiring beneath it.",
    "invariants": [
        "One stored SystemSketch graph; every control changes paint only.",
        "Port and Simple use identical x, y, width, and height.",
        "Action chooses goal; Service chooses request; Topic and Stream choose their data track.",
        "Values disappear only in Components; the source dataflow remains intact.",
    ],
    "boundary": "Query-gated prototype in the real app. Name-based parsing, Port/Simple paint projection, exact track reuse, and centreline routing are exercised; durable communication metadata, editing semantics, export, runtime telemetry, and large-graph layout remain intentionally unimplemented.",
    "axes": [
        {"name": "Route authority", "values": ["representative data edge", "component centres"]},
        {"name": "Evidence shown", "values": ["where protocol came from", "who relates to whom"]},
        {"name": "Layout dependence", "values": ["inherits authored routing", "requires clear sight-lines"]},
    ],
    "requirements": [
        {
            "id": "fr1", "name": "Track fidelity", "weight": 32,
            "why": "The semantic overlay should explain the dataflow rather than quietly inventing unrelated geometry.",
            "passCondition": "Elbow's visible d-path equals the selected canonical data edge path.",
            "anchors": {"1": "Unrelated route.", "3": "Roughly follows the same corridor.", "5": "Reuses the exact path string."},
        },
        {
            "id": "fr2", "name": "Box continuity", "weight": 28,
            "why": "Hiding details must not make the graph breathe, drift, or relayout.",
            "passCondition": "Every Simple DOM box exactly equals its Port x, y, width, and height.",
            "anchors": {"1": "Relayouts the graph.", "3": "Keeps centres but changes size.", "5": "All four box measurements are exact."},
        },
        {
            "id": "fr3", "name": "Protocol carrier", "weight": 22,
            "why": "Choosing the wrong leg would make a faithful-looking route semantically false.",
            "passCondition": "Action uses goal, Service uses request, and Topic/Stream retain a data track.",
            "anchors": {"1": "Arbitrary response/result leg.", "3": "Correct family but choice is implicit.", "5": "Correct phase is deterministic and browser-asserted."},
        },
        {
            "id": "fr4", "name": "Overview legibility", "weight": 12,
            "why": "The relationship view still has to be easier to read than all protocol legs at once.",
            "passCondition": "Seven family-labelled relationships remain followable in both card presentations.",
            "anchors": {"1": "Relationships disappear.", "3": "Visible but crossings merge.", "5": "All relationships are distinct and traceable."},
        },
        {
            "id": "fr5", "name": "Projection honesty", "weight": 6,
            "why": "A prototype lens should not dirty the board or add a speculative schema.",
            "passCondition": "Serialized shapes are byte-identical after every view and route toggle.",
            "anchors": {"1": "Writes a second model.", "3": "Restores most presentation state.", "5": "Never mutates the records."},
        },
    ],
    "hardGates": [
        {"id": "g1", "name": "Same stored graph", "why": "A projection cannot be allowed to drift from its source."},
        {"id": "g2", "name": "Simple equals Port box", "why": "Any size change breaks the visual overlay test."},
        {"id": "g3", "name": "Deterministic carrier phase", "why": "Action and Service need one truthful initiating track."},
        {"id": "g4", "name": "No new semantic schema", "why": "This remains a judgeable prototype, not a hidden production decision."},
    ],
    "variants": [
        {
            "id": "v1", "name": "Track overlay", "accent": "#118b6d",
            "thesis": "Elbow preserves the exact initiating data route, so the Simple face can be overlaid on the Port graph without losing provenance.",
            "bestWhen": "The reader must verify how the semantic relationship was derived from real wiring.",
            "losesWhen": "Authored data routes are already visually poor or the map should intentionally ignore wiring detail.",
            "decisions": [
                {"label": "Action carrier", "value": "The goal edge's canonical d-path."},
                {"label": "Service carrier", "value": "The request edge's canonical d-path."},
                {"label": "Card projection", "value": "Simple paint inside the untouched Port box."},
            ],
            "keepParts": ["same-size Simple face", "goal/request carrier policy", "exact-path overlay"],
            "proof": ["The browser compared four representative d-paths before and after; all were equal.", "Six Simple and Port DOM boxes matched exactly.", "Serialized shapes stayed byte-identical through the whole journey."],
            "previewLabel": "real SystemSketch states · canonical track overlay",
            "story": shared_story,
            "scores": {
                "fr1": score(5, "Frame, Preview, Service request, and Action goal reused their exact canonical d-paths."),
                "fr2": score(5, "All six Port/Simple x, y, width, and height measurements were exactly equal."),
                "fr3": score(5, "The rendered representatives were edge_move_goal and edge_pose_request."),
                "fr4": score(4, "Seven relationships remain labelled; two central elbow labels share a busy corridor."),
                "fr5": score(5, "A serialized before/after comparison found no shape-record change."),
            },
            "gateResults": gate_results("Elbow"),
            "preview": preview("04-components-port-elbow.png", "03-components-simple-elbow.png", "elbow"),
            "media": [{"label": "One graph, one chosen carrier", "caption": "The semantic edge is a view of one initiating data edge, not a freshly routed architecture connector.", "html": ARCHITECTURE}],
        },
        {
            "id": "v2", "name": "Centreline map", "accent": "#3971dd",
            "thesis": "Straight derives a clean axis from component centres and clips it at card boundaries, deliberately discarding the authored data route.",
            "bestWhen": "The primary task is reading a compact architecture overview rather than auditing route provenance.",
            "losesWhen": "Several families share a component pair or centreline crossings occupy the same corridor.",
            "decisions": [
                {"label": "Route grammar", "value": "One straight axis derived from the two component centres."},
                {"label": "Visible endpoints", "value": "Clipped to card boundaries so arrowheads do not cover titles."},
                {"label": "Tradeoff", "value": "Authored bends are intentionally ignored."},
            ],
            "keepParts": ["same-size Simple face", "centre-derived axis", "boundary-clipped heads"],
            "proof": ["All seven relationships switched through the live Straight control.", "Port and Simple boxes remained exact while routes changed.", "Service and Action overlap on the same pair, making the abstraction cost visible."],
            "previewLabel": "real SystemSketch states · centreline overview",
            "story": shared_story,
            "scores": {
                "fr1": score(1, "Straight intentionally ignores the authored route; only endpoints share component identity."),
                "fr2": score(5, "The presentation toggle uses the same untouched boxes as Elbow."),
                "fr3": score(5, "Carrier selection is still deterministic even though its path is replaced."),
                "fr4": score(3, "Long diagonals cross centrally and Service/Action coincide between one pair."),
                "fr5": score(5, "Route style remains transient paint and serialized shapes stay unchanged."),
            },
            "gateResults": gate_results("Straight"),
            "preview": preview("06-components-port-straight.png", "05-components-simple-straight.png", "straight"),
            "media": [{"label": "Abstraction is explicit", "caption": "The straight option answers who communicates with whom, while visibly giving up the original path.", "html": ARCHITECTURE}],
        },
    ],
    "checks": [
        "Two equally framed route authorities",
        "Port and Simple screenshots for each",
        "Exact path, box, and serialized-record assertions",
        "Every score carries browser evidence and confidence",
        "Pick, shortlist, reject, and splice export",
    ],
}


CUSTOM_CSS = r"""
    .comm-demo { display:grid; gap:10px; background:#f7f8fa; }
    .comm-demo-controls { position:absolute; z-index:2; top:12px; left:50%; display:flex; gap:3px; padding:4px; transform:translateX(-50%); border:1px solid #d7dce4; border-radius:11px; background:rgba(255,255,255,.94); box-shadow:0 5px 18px rgba(15,23,42,.12); }
    .comm-demo-controls button { padding:7px 10px; border:0; border-radius:7px; background:transparent; color:#5f6776; cursor:pointer; font:700 10px/1 ui-monospace,monospace; }
    .prototype[data-story-state="wiring"] [data-view-button="wiring"], .prototype[data-story-state="tagged"] [data-view-button="tagged"], .prototype[data-story-state="component_port"] [data-view-button="component_port"], .prototype[data-story-state="component_simple"] [data-view-button="component_simple"] { background:#e9f2ff; color:#2167c7; outline:2px solid rgba(47,116,225,.2); }
    .comm-demo-screen { aspect-ratio:5/3; overflow:hidden; border-bottom:1px solid #dfe3e9; background:#fff; }
    .comm-demo-screen img { display:none; width:100%; height:100%; object-fit:cover; object-position:center top; }
    .prototype[data-story-state="wiring"] [data-view-image="wiring"], .prototype[data-story-state="tagged"] [data-view-image="tagged"], .prototype[data-story-state="component_port"] [data-view-image="component_port"], .prototype[data-story-state="component_simple"] [data-view-image="component_simple"] { display:block; }
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

CUSTOM_JS = r"""
  <script>
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view-index]');
      if (!button) return;
      const card = button.closest('.variant-card');
      const index = Number(button.dataset.viewIndex);
      card?.querySelector(`[data-story-action="jump"][data-story-index="${index}"]`)?.click();
    });
  </script>
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
    # Let the first scan compare both outcomes before focus mode or the AI
    # ranking narrows attention to one. The gallery shell defaults to focus for
    # larger rounds; two equal-fidelity variants fit comfortably as a grid.
    html = html.replace(
        '<button class="tool-button" type="button" data-layout="grid">Grid</button>',
        '<button class="tool-button active" type="button" data-layout="grid">Grid</button>',
    ).replace(
        '<button class="tool-button active" type="button" data-layout="focus">Focus</button>',
        '<button class="tool-button" type="button" data-layout="focus">Focus</button>',
    ).replace('layout: "focus"', 'layout: "grid"')
    html = html.replace("</body>", f"{CUSTOM_JS.strip()}\n</body>", 1)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
