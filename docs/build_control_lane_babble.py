#!/usr/bin/env python3
"""Build the five-way control-lanes visual exploration.

This deliberately stays outside the editor.  The point of the study is to judge
whether the existing behavior-tree control graph can become a background layer
once the same nodes are viewed through their Port interfaces.
"""

from __future__ import annotations

import json
import subprocess
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = Path("/home/bam/.codex/skills/babble")
SPEC = ROOT / "docs/control-lanes-babble-2026-09-06.json"
OUTPUT = ROOT / "docs/control-lanes-babble-2026-09-06.html"


def node(x: int, y: int, name: str, left: str, right: str, *, h: int = 66) -> str:
    """A compact, port-view Block with a real left/right interface reading."""
    w = 145
    mid = y + h // 2
    return f'''<g class="port-block">
      <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" class="block-face"/>
      <text x="{x + 13}" y="{y + 22}" class="block-name">{escape(name)}</text>
      <line x1="{x + 12}" y1="{y + 31}" x2="{x + w - 12}" y2="{y + 31}" class="block-rule"/>
      <circle cx="{x}" cy="{mid - 10}" r="4.3" class="port input-port"/>
      <text x="{x + 12}" y="{mid - 7}" class="port-text">{escape(left)}</text>
      <circle cx="{x + w}" cy="{mid + 11}" r="4.3" class="port output-port"/>
      <text x="{x + w - 12}" y="{mid + 15}" text-anchor="end" class="port-text">{escape(right)}</text>
    </g>'''


def report_node() -> str:
    return '''<g class="port-block">
      <rect x="1000" y="218" width="116" height="76" rx="10" class="block-face"/>
      <text x="1013" y="240" class="block-name">Report</text>
      <line x1="1012" y1="250" x2="1104" y2="250" class="block-rule"/>
      <circle cx="1000" cy="260" r="4.3" class="port input-port"/>
      <text x="1012" y="264" class="port-text">feedback</text>
      <circle cx="1000" cy="280" r="4.3" class="port input-port"/>
      <text x="1012" y="284" class="port-text">home</text>
      <circle cx="1116" cy="272" r="4.3" class="port output-port"/>
      <text x="1104" y="276" text-anchor="end" class="port-text">result</text>
    </g>'''


def defs(prefix: str) -> str:
    return f'''<defs>
      <filter id="{prefix}-shadow" x="-12%" y="-20%" width="124%" height="145%">
        <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#112743" flood-opacity=".16"/>
      </filter>
      <marker id="{prefix}-data-arrow" markerWidth="8" markerHeight="8" refX="6.7" refY="4" orient="auto">
        <path d="M0,0 L7,4 L0,8Z" fill="#1976d2"/>
      </marker>
      <marker id="{prefix}-control-arrow" markerWidth="8" markerHeight="8" refX="6.7" refY="4" orient="auto">
        <path d="M0,0 L7,4 L0,8Z" fill="#12bfa3"/>
      </marker>
      <linearGradient id="{prefix}-lane-gradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#25d0b4" stop-opacity=".11"/>
        <stop offset=".48" stop-color="#32d8c3" stop-opacity=".30"/>
        <stop offset="1" stop-color="#22bda8" stop-opacity=".12"/>
      </linearGradient>
      <pattern id="{prefix}-chevrons" width="24" height="18" patternUnits="userSpaceOnUse">
        <path d="M4 3 L10 9 L4 15 M13 3 L19 9 L13 15" fill="none" stroke="#10ad95" stroke-width="1.25" opacity=".58"/>
      </pattern>
    </defs>'''


COMMON_STYLE = '''<style>
  .lane-stage { width: 1140px; padding: 20px; background: #f7fafc; color: #12253d; }
  .lane-stage .stage-title { display:flex; align-items:baseline; justify-content:space-between; gap:18px; margin:0 0 10px; }
  .lane-stage h4 { margin:0; font:750 15px/1.2 ui-sans-serif,system-ui,sans-serif; letter-spacing:-.02em; }
  .lane-stage p { margin:3px 0 0; color:#63778d; font:500 11px/1.4 ui-sans-serif,system-ui,sans-serif; }
  .lane-stage .stage-kicker { color:#0c8976; font:800 9px/1 ui-monospace,SFMono-Regular,monospace; letter-spacing:.11em; text-transform:uppercase; white-space:nowrap; }
  .lane-canvas { display:block; width:1140px; height:476px; overflow:visible; border:1px solid #d8e1e8; border-radius:14px; background:#fbfdff; }
  .canvas-grid { stroke:#dce7ec; stroke-width:1; opacity:.58; }
  .canvas-title { fill:#4e6679; font:800 9px/1 ui-monospace,SFMono-Regular,monospace; letter-spacing:.11em; }
  .control-key { fill:#0c8e7a; font:700 10px/1.25 ui-sans-serif,system-ui,sans-serif; }
  .data-key { fill:#2367ad; font:700 10px/1.25 ui-sans-serif,system-ui,sans-serif; }
  .block-face { fill:#ffffff; stroke:#b9c8d4; stroke-width:1.2; filter:url(#block-shadow); }
  .block-name { fill:#142a44; font:750 12px/1 ui-monospace,SFMono-Regular,monospace; }
  .block-rule { stroke:#e7eef2; stroke-width:1; }
  .port { stroke-width:1.35; }
  .input-port { fill:#e8f4ff; stroke:#1976d2; }
  .output-port { fill:#1976d2; stroke:#12599e; }
  .port-text { fill:#5b7082; font:600 8.5px/1 ui-monospace,SFMono-Regular,monospace; }
  .data-wire { fill:none; stroke:#1976d2; stroke-width:2.35; stroke-linecap:round; stroke-linejoin:round; marker-end:url(#data-arrow); }
  .data-wire.secondary { stroke:#5f9bd8; stroke-width:1.75; }
  .wire-label-back { fill:#fbfdff; stroke:#c8ddec; stroke-width:.8; }
  .wire-label { fill:#2367ad; font:700 8.2px/1 ui-monospace,SFMono-Regular,monospace; }
  .lane-center { fill:none; stroke:#0fb79f; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; opacity:.78; marker-end:url(#control-arrow); }
  .lane-seam { fill:none; stroke:#0aa78f; stroke-width:.9; stroke-dasharray:2.8 4.8; opacity:.73; }
  /* Open SVG routes default to a black fill. Control strokes must stay open;
     only the explicitly fill-only territory shapes below are allowed to paint. */
  .control-grammar path[stroke] { fill:none; }
  .lane-label { fill:#087663; font:800 8px/1 ui-monospace,SFMono-Regular,monospace; letter-spacing:.08em; }
  .merge-dot { fill:#10b69e; stroke:#fff; stroke-width:1.5; }
  .lane-button { margin-top:11px; padding:8px 11px; border:1px solid #86cfc3; border-radius:7px; background:#f1fffb; color:#087663; font:800 10px/1 ui-monospace,SFMono-Regular,monospace; }
  .lane-button:hover { background:#ddfff6; }
  .lane-stage .alt-note { display:none; color:#087663; }
  .prototype.is-alt .lane-stage .base-note { display:none; }
  .prototype.is-alt .lane-stage .alt-note { display:block; }
  .prototype.is-alt .lane-stage .lane-center { stroke-width:2.3; opacity:1; }
  .prototype.is-alt .lane-stage .lane-seam { stroke-width:1.3; opacity:1; }
  .prototype.is-alt .lane-stage .data-wire { stroke-width:2.65; }
  .prototype.is-alt .lane-stage .lane-fill { opacity:1; }
  .prototype.is-alt .lane-stage .lane-quiet { opacity:.28; }
  .prototype.is-alt .lane-stage .lane-focus { opacity:1; }
  .prototype.is-alt .lane-stage .field-mark { opacity:.92; }
  .prototype.is-alt .lane-stage .region-outline { opacity:1; }
</style>'''


def wire_label(x: int, y: int, text: str, width: int) -> str:
    return f'''<g><rect x="{x}" y="{y - 10}" width="{width}" height="15" rx="4" class="wire-label-back"/>
      <text x="{x + 6}" y="{y}" class="wire-label">{escape(text)}</text></g>'''


def control_paths(kind: str) -> str:
    """Draw the same control graph five structurally different ways.

    WHY: blue is reserved for port-to-port data in every specimen.  Letting a
    control ribbon turn blue would make the key distinction observationally
    ambiguous at exactly the dense scale this experiment is trying to repair.
    """
    main = "M28 253 H1116"
    recover = "M460 253 C477 253 469 108 480 108 H625 C642 108 643 253 660 253"
    upper = "M805 253 C823 253 814 108 825 108 H970 C987 108 984 253 1000 253"
    lower = "M805 253 C823 253 814 398 825 398 H970 C987 398 984 276 1000 276"
    if kind == "ghost":
        return f'''<g class="control-grammar">
          <path class="lane-fill" d="{main}" stroke="url(#lane-gradient)" stroke-width="43" stroke-linecap="round"/>
          <path class="lane-fill" d="{recover}" stroke="url(#lane-gradient)" stroke-width="38" stroke-linecap="round"/>
          <path class="lane-fill" d="{upper}" stroke="url(#lane-gradient)" stroke-width="38" stroke-linecap="round"/>
          <path class="lane-fill" d="{lower}" stroke="url(#lane-gradient)" stroke-width="38" stroke-linecap="round"/>
          <path class="lane-center" d="{main}"/><path class="lane-center" d="{recover}"/><path class="lane-center" d="{upper}"/><path class="lane-center" d="{lower}"/>
          <path class="lane-seam" d="{main}"/><path class="lane-seam" d="{recover}"/><path class="lane-seam" d="{upper}"/><path class="lane-seam" d="{lower}"/>
          <text x="486" y="132" class="lane-label">FALLBACK · INVALID ONLY</text><text x="842" y="132" class="lane-label">PARALLEL</text>
        </g>'''
    if kind == "banks":
        def banks(path: str, width: int) -> str:
            return f'''<path class="lane-fill" d="{path}" stroke="#7ce3d1" stroke-opacity=".13" stroke-width="{width}" stroke-linecap="round"/>
              <path class="lane-bank" d="{path}" stroke="#12ad97" stroke-opacity=".58" stroke-width="{width - 12}" stroke-linecap="round" fill="none"/>
              <path class="lane-center" d="{path}"/>'''
        return f'''<g class="control-grammar banks">{banks(main, 34)}{banks(recover, 30)}{banks(upper, 30)}{banks(lower, 30)}
          <path class="lane-seam" d="{main}"/><path class="lane-seam" d="{recover}"/><path class="lane-seam" d="{upper}"/><path class="lane-seam" d="{lower}"/>
          <text x="484" y="132" class="lane-label">FALLBACK · BETWEEN THE BANKS</text><text x="838" y="132" class="lane-label">PARALLEL · TWO CHANNELS</text>
        </g>'''
    if kind == "field":
        return f'''<g class="control-grammar fielded">
          <path class="lane-fill" d="{main}" stroke="#5edcc9" stroke-opacity=".19" stroke-width="62" stroke-linecap="round"/>
          <path class="lane-fill" d="{recover}" stroke="#5edcc9" stroke-opacity=".19" stroke-width="58" stroke-linecap="round"/>
          <path class="lane-fill" d="{upper}" stroke="#5edcc9" stroke-opacity=".19" stroke-width="58" stroke-linecap="round"/>
          <path class="lane-fill" d="{lower}" stroke="#5edcc9" stroke-opacity=".19" stroke-width="58" stroke-linecap="round"/>
          <path class="field-mark" d="{main}" stroke="url(#chevrons)" stroke-width="42" stroke-linecap="round" opacity=".58"/>
          <path class="field-mark" d="{recover}" stroke="url(#chevrons)" stroke-width="38" stroke-linecap="round" opacity=".58"/>
          <path class="field-mark" d="{upper}" stroke="url(#chevrons)" stroke-width="38" stroke-linecap="round" opacity=".58"/>
          <path class="field-mark" d="{lower}" stroke="url(#chevrons)" stroke-width="38" stroke-linecap="round" opacity=".58"/>
          <path class="lane-center" d="{main}" opacity=".42"/><path class="lane-center" d="{recover}" opacity=".42"/><path class="lane-center" d="{upper}" opacity=".42"/><path class="lane-center" d="{lower}" opacity=".42"/>
          <text x="482" y="132" class="lane-label">INVALID CURRENT · FLOW FIELD</text><text x="846" y="132" class="lane-label">FAN-OUT</text>
        </g>'''
    if kind == "regions":
        return f'''<g class="control-grammar regions">
          <path class="lane-fill" d="M438 49 H647 Q678 49 678 79 V282 Q678 312 647 312 H438 Q407 312 407 282 V79 Q407 49 438 49Z" fill="#46d7c2" opacity=".16"/>
          <path class="lane-fill" d="M788 49 H986 Q1019 49 1019 82 V424 Q1019 451 986 451 H788 Q756 451 756 424 V82 Q756 49 788 49Z" fill="#46d7c2" opacity=".16"/>
          <path class="region-outline" d="M438 49 H647 Q678 49 678 79 V282 Q678 312 647 312 H438 Q407 312 407 282 V79 Q407 49 438 49Z" fill="none" stroke="#11ad95" stroke-width="1.2" stroke-dasharray="5 4" opacity=".42"/>
          <path class="region-outline" d="M788 49 H986 Q1019 49 1019 82 V424 Q1019 451 986 451 H788 Q756 451 756 424 V82 Q756 49 788 49Z" fill="none" stroke="#11ad95" stroke-width="1.2" stroke-dasharray="5 4" opacity=".42"/>
          <path class="lane-center" d="{main}"/><path class="lane-seam" d="{recover}"/><path class="lane-seam" d="{upper}"/><path class="lane-seam" d="{lower}"/>
          <text x="426" y="67" class="lane-label">FALLBACK REGION</text><text x="775" y="67" class="lane-label">PARALLEL REGION</text>
        </g>'''
    if kind == "focus":
        return f'''<g class="control-grammar focus-lanes">
          <path class="lane-fill lane-quiet" d="{main}" stroke="#48ddc8" stroke-width="35" stroke-linecap="round" opacity=".25"/>
          <path class="lane-fill lane-focus" d="{recover}" stroke="#36d2ba" stroke-width="44" stroke-linecap="round" opacity=".16"/>
          <path class="lane-fill lane-quiet" d="{upper}" stroke="#48ddc8" stroke-width="35" stroke-linecap="round" opacity=".25"/>
          <path class="lane-fill lane-quiet" d="{lower}" stroke="#48ddc8" stroke-width="35" stroke-linecap="round" opacity=".25"/>
          <path class="lane-center lane-quiet" d="{main}" opacity=".35"/><path class="lane-center lane-focus" d="{recover}" opacity=".42"/><path class="lane-center lane-quiet" d="{upper}" opacity=".35"/><path class="lane-center lane-quiet" d="{lower}" opacity=".35"/>
          <text x="484" y="132" class="lane-label">HOVER / SELECT TO INSPECT</text><text x="844" y="132" class="lane-label">QUIET AT REST</text>
        </g>'''
    raise ValueError(kind)


def data_wires(prefix: str) -> str:
    return f'''<g class="data-grammar">
      <path class="data-wire" d="M250 252 H315" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(264, 237, "approach", 57)}
      <path class="data-wire secondary" d="M460 264 C472 264 468 118 480 118" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(467, 174, "candidate", 63)}
      <path class="data-wire" d="M460 264 C506 264 599 264 660 242" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(532, 249, "valid_grip", 64)}
      <path class="data-wire" d="M625 118 C643 118 637 277 660 264" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(640, 193, "corrected", 63)}
      <path class="data-wire" d="M805 264 C816 264 813 118 825 118" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(807, 177, "state", 39)}
      <path class="data-wire" d="M805 264 C816 264 813 408 825 408" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(807, 345, "state", 39)}
      <path class="data-wire secondary" d="M970 118 C990 118 984 260 1000 260" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(975, 179, "feedback", 57)}
      <path class="data-wire secondary" d="M970 408 C990 408 984 280 1000 280" marker-end="url(#{prefix}-data-arrow)"/>{wire_label(975, 346, "at_home", 57)}
    </g>'''


def block_stack(prefix: str) -> str:
    return f'''<g filter="url(#{prefix}-shadow)">
      {node(105, 218, "MoveToObj", "target", "approach")}
      {node(315, 218, "GraspValid", "approach", "candidate")}
      {node(480, 75, "CorrectGrip", "candidate", "corrected")}
      {node(660, 218, "CloseGrip", "grip φ", "state")}
      {node(825, 75, "Publish", "state", "feedback")}
      {node(825, 365, "MoveHome", "state", "at_home")}
      {report_node()}
    </g>'''


def legend() -> str:
    return '''<g transform="translate(28 28)">
      <rect width="324" height="42" rx="9" fill="#ffffff" stroke="#d8e3e9"/>
      <path d="M15 15 H52" stroke="#35d6bd" stroke-width="15" stroke-linecap="round" opacity=".40"/>
      <path d="M15 15 H52" stroke="#0ab094" stroke-width="1.4" stroke-linecap="round"/>
      <text x="64" y="19" class="control-key">CONTROL · translucent route</text>
      <path d="M15 31 H52" stroke="#1976d2" stroke-width="2.5" stroke-linecap="round"/>
      <text x="64" y="35" class="data-key">DATA · typed port cable</text>
    </g>'''


def hero(kind: str, title: str, base_note: str, alt_note: str, action_base: str, action_alt: str) -> str:
    prefix = f"lane-{kind}"
    return f'''{COMMON_STYLE}<div class="lane-stage lane-{kind}">
      <div class="stage-title"><div><h4>{escape(title)}</h4><p class="base-note">{escape(base_note)}</p><p class="alt-note">{escape(alt_note)}</p></div><span class="stage-kicker">shared fixture · Port view</span></div>
      <svg class="lane-canvas" viewBox="0 0 1140 476" role="img" aria-label="{escape(title)}. The same behavior tree is shown as translucent cyan control grammar under blue data wires connecting port-view Blocks.">
        {defs(prefix)}
        <g opacity=".48"><path class="canvas-grid" d="M0 110 H1140 M0 180 H1140 M0 326 H1140 M0 396 H1140"/></g>
        <text x="28" y="455" class="canvas-title">START</text><text x="438" y="455" class="canvas-title">FALLBACK · INVALID ROUTE</text><text x="808" y="455" class="canvas-title">PARALLEL · BOTH CHILDREN</text>
        {legend()}{control_paths(kind)}{data_wires(prefix)}{block_stack(prefix)}
        <circle cx="28" cy="253" r="6" class="merge-dot"/><circle cx="460" cy="253" r="5" class="merge-dot"/><circle cx="660" cy="253" r="5" class="merge-dot"/><circle cx="805" cy="253" r="5" class="merge-dot"/><circle cx="1000" cy="253" r="5" class="merge-dot"/>
      </svg>
      <button class="lane-button" type="button" data-demo-toggle data-base-label="{escape(action_base)}" data-alt-label="{escape(action_alt)}">{escape(action_base)}</button>
    </div>'''


def supporting(kind: str, caption: str) -> str:
    paths = {
        "ghost": ("filled corridor + center seam", "The safest default: enough body to read as a route, little enough ink that the blue port edge owns the foreground."),
        "banks": ("two route banks", "The route reads as infrastructure. It makes forks explicit, but competing outlines create a denser field around short cables."),
        "field": ("directional field", "The car-path metaphor is strongest here; repeated chevrons make motion salient, so it risks claiming runtime activity in a static source view."),
        "regions": ("branch containers", "A fallback and parallel become calm spatial territories. The weak point is that long ordered sequences no longer feel like one path."),
        "focus": ("focus-dependent route", "Port view stays exceptionally quiet until selection. It is excellent for editing but less self-explanatory in a screenshot or an overview."),
    }
    name, note = paths[kind]
    return f'''<div style="width:1140px;padding:18px 20px;background:#fbfdff"><svg width="1100" height="110" viewBox="0 0 1100 110" role="img" aria-label="Encoding note for {escape(name)}">
      <rect x="1" y="1" width="1098" height="108" rx="12" fill="#f6fbfc" stroke="#d9e6eb"/>
      <path d="M34 56 H278" stroke="#36d6be" stroke-width="30" stroke-linecap="round" opacity=".23"/>
      <path d="M34 56 H278" stroke="#0ba98f" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M76 56 C141 56 160 29 219 29" fill="none" stroke="#1976d2" stroke-width="2.6"/>
      <circle cx="76" cy="56" r="5" fill="#1976d2"/><circle cx="219" cy="29" r="5" fill="#e8f4ff" stroke="#1976d2" stroke-width="2"/>
      <text x="322" y="43" style="font:800 10px ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;fill:#087663">{escape(name).upper()}</text>
      <text x="322" y="69" style="font:600 13px ui-sans-serif,system-ui,sans-serif;fill:#304a60">{escape(caption)}</text>
      <text x="322" y="91" style="font:500 11px ui-sans-serif,system-ui,sans-serif;fill:#60778a">{escape(note)}</text>
    </svg></div>'''


REQUIREMENTS = [
    {
        "id": "control",
        "name": "Control remains reconstructable",
        "weight": 30,
        "why": "The background must still make order, fallback, fan-out, and rejoin recoverable; it cannot be a decorative underlay.",
        "passCondition": "In the shared fixture, a reader identifies the invalid-only correction arm and the two-child parallel fan-out without treating a blue data cable as control.",
        "anchors": {"1": "Branches read as decoration or as extra data wires.", "3": "A reader can recover the common route but needs a legend for special cases.", "5": "The control shape is readable behind port cards without foregrounding it over data."},
    },
    {
        "id": "data",
        "name": "Port-to-port values stay traceable",
        "weight": 28,
        "why": "The primary working lens is Port view. Typed values need to remain the clearest foreground relationship.",
        "passCondition": "Every blue link can be followed from a labelled output to a labelled input at normal canvas scale, even where it rides within a control corridor.",
        "anchors": {"1": "Data and control are visually interchangeable.", "3": "Most local values are readable, but forks make labels work too hard.", "5": "A blue cable and its labelled ports remain unambiguous across every branch."},
    },
    {
        "id": "layers",
        "name": "The two grammars separate without splitting the canvas",
        "weight": 24,
        "why": "The promise is one coherent projection: data in front, control behind, rather than two competing diagrams or a forced mode switch.",
        "passCondition": "Control uses a distinct low-contrast area/route grammar while data uses one thin, saturated cable grammar in the identical topology.",
        "anchors": {"1": "The two systems need separate canvases to be understood.", "3": "They coexist but compete at dense intersections.", "5": "Foreground data and background control can be read together without a second key."},
    },
    {
        "id": "quiet",
        "name": "Default Port view stays calm at scale",
        "weight": 18,
        "why": "This lens will often be used for editing a working board, not only explaining an execution trace.",
        "passCondition": "The default state makes room for dense port cards and cable labels; stronger control emphasis is intentional rather than always-on noise.",
        "anchors": {"1": "Control texture dominates ordinary editing.", "3": "The shared fixture is workable but becomes busy with more leaves.", "5": "The control layer supplies orientation yet yields visual priority to values and cards."},
    },
]


GATES = [
    {"id": "meaning", "name": "No blue control wire", "why": "Blue remains a declared typed port relationship; control must never borrow that semantic channel."},
    {"id": "source", "name": "One behavior tree, two reversible lenses", "why": "A lane is derived from the canonical control graph, not a separately editable graph that can drift from the tree."},
]


def score(control: int, data: int, layers: int, quiet: int, *, confidence: str = "medium") -> dict[str, dict[str, object]]:
    evidence = {
        "control": "The hero holds a labelled fallback/rejoin and a parallel fan-out in the same fixed topology.",
        "data": "Blue labelled links terminate at visible Port-view sockets, including two paths that share a control corridor.",
        "layers": "The exercised alternate state keeps the blue data geometry fixed while changing only the cyan control treatment.",
        "quiet": "The base state is the actual at-rest specimen; the alternate state exercises the variant's strongest available emphasis.",
    }
    return {key: {"score": value, "evidence": evidence[key], "confidence": confidence} for key, value in {"control": control, "data": data, "layers": layers, "quiet": quiet}.items()}


def variant(
    ident: str,
    name: str,
    thesis: str,
    kind: str,
    base_note: str,
    alt_note: str,
    action_base: str,
    action_alt: str,
    best: str,
    loses: str,
    decisions: list[tuple[str, str]],
    keep: list[str],
    scores: dict[str, dict[str, object]],
) -> dict[str, object]:
    return {
        "id": ident,
        "name": name,
        "thesis": thesis,
        "accent": {"v1": "#0b9d88", "v2": "#2e7a93", "v3": "#609f7d", "v4": "#7667c6", "v5": "#c46b43"}[ident],
        "bestWhen": best,
        "losesWhen": loses,
        "decisions": [{"label": label, "value": value} for label, value in decisions],
        "keepParts": keep,
        "proof": [
            "The direct control changes only the control-layer treatment; cards and every data cable remain in exactly the same place.",
            "The manual walkthrough drives that same visible state instead of a prerecorded tour.",
        ],
        "previewLabel": "interactive shared control/data fixture",
        "story": {
            "title": "Inspect the relationship between the layers",
            "steps": [
                {"label": "Read Port view at rest", "caption": base_note, "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Reveal this treatment's strongest cue", "caption": alt_note, "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "scores": scores,
        "gateResults": {
            "meaning": {"pass": True, "evidence": "Every blue stroke in the fixture starts and ends at a named port. Cyan remains the only control carrier."},
            "source": {"pass": True, "evidence": "The exact same fallback and parallel topology is used for the tree lens and every control-lane rendering."},
        },
        "preview": hero(kind, name, base_note, alt_note, action_base, action_alt),
        "media": [{"label": "What this encoding asserts", "caption": "A compact legend for the choice of control carrier. The data cable stays blue in all variants.", "html": supporting(kind, thesis)}],
    }


def project() -> dict[str, object]:
    variants = [
        variant(
            "v1", "01 · Ghost roads", "Translucent cyan corridors with one fine center seam make the control tree visible as terrain, while thin blue cables continue to read as port-to-port values.", "ghost",
            "At rest, the control tree is a soft map under the Port view; data labels keep the foreground.",
            "The same corridors gain a crisp center trace for deliberate control inspection—without moving or recoloring any data cable.",
            "Trace control routes", "Return to quiet lanes",
            "The shared canvas must explain both branching control and real values at the same time.",
            "Runtime status needs to be the primary object; a trace or playback lens would be stronger.",
            [("Control carrier", "wide route + thin center seam"), ("Foreground contract", "blue, typed port-to-port cables"), ("Emphasis", "quiet by default; trace on demand")],
            ["the translucent route body", "one precise center seam", "control/data colour contract"], score(5, 5, 5, 4, confidence="high"),
        ),
        variant(
            "v2", "02 · Two-bank ribbon", "Control becomes a pair of subtle route banks: it reads as infrastructure or a track, leaving a low-ink middle lane for the actual data cable.", "banks",
            "The cyan banks frame the route instead of filling it; this is closest to a rail without returning to line-only control wires.",
            "Filling the banks confirms their shared corridor, but shows how much extra outline density this grammar creates around short links.",
            "Fill route banks", "Hide route fill",
            "A team already reads rails intuitively and wants the route boundary more explicit than a soft wash.",
            "The board carries many short adjacent cables; the paired outlines can begin to crowd their labels.",
            [("Control carrier", "two banks around a data-capable corridor"), ("Spatial claim", "control owns the route boundary, not its center"), ("Trade-off", "stronger structure, more line density")],
            ["track-like bank grammar", "center space reserved for data", "fork boundary cue"], score(4, 5, 4, 4),
        ),
        variant(
            "v3", "03 · Flow field", "A wider transparent vector field makes the self-driving-car metaphor unmistakable: control feels like permitted motion through a branching space.", "field",
            "Repeating chevrons make the cyan background feel directional, while blue cables stay attached to ports rather than to the field.",
            "The center trace raises the execution cue. It is compelling, but could falsely imply a live runtime when this is only a source projection.",
            "Show route traces", "Return to field only",
            "The presentation is explaining a behavior-tree plan to a new reader and movement intuition is useful.",
            "The canvas is primarily an editor or an offline document; moving-looking texture risks overselling runtime evidence.",
            [("Control carrier", "wide directional field"), ("Metaphor", "drivable/allowed path"), ("Risk posture", "expressive explanation over neutral editing")],
            ["permitted-motion metaphor", "chevrons only inside control", "separate port cable colour"], score(4, 4, 4, 3),
        ),
        variant(
            "v4", "04 · Branch territories", "Fallback and parallel become softly bounded territories behind their member cards, while the trunk stays a minimal center route.", "regions",
            "This treats control scope as spatial terrain: the reader sees where an invalid-only alternative starts and where a parallel policy applies.",
            "Dashed region edges reveal the scope boundary precisely. They also make this the least path-like of the five directions.",
            "Outline control territories", "Return to soft territories",
            "The important question is which scope a block belongs to, especially around nested fallback and parallel groups.",
            "Ordered run order is the primary question; a continuous corridor carries sequence more honestly.",
            [("Control carrier", "scoped branch territory"), ("Strongest reading", "membership / policy"), ("Trade-off", "scope wins over continuous path")],
            ["soft policy territory", "precise scope outline on demand", "minimal trunk route"], score(3, 5, 4, 5),
        ),
        variant(
            "v5", "05 · Selective wash", "Port view stays almost entirely data-first until a branch is selected or hovered; then only that branch blooms into a high-clarity control corridor.", "focus",
            "At rest, faint control gives just enough orientation to preserve the overall tree without taxing an editing view.",
            "The correction route blooms when selected, making a dense branch inspectable while all unrelated control stays muted.",
            "Focus correction branch", "Clear branch focus",
            "The normal workflow is local wire editing or inspection, with occasional need to recover one control policy.",
            "A static share, screenshot, or classroom explanation must communicate the whole control tree without interaction.",
            [("Control carrier", "selection-amplified corridor"), ("Default priority", "data and ports"), ("Interaction", "inspect one control route on demand")],
            ["low-noise idle state", "branch bloom interaction", "unrelated routes fade away"], score(4, 3, 5, 5),
        ),
    ]
    return {
        "schemaVersion": 3,
        "title": "Control lanes behind Port view",
        "kicker": "Babble & Prune · behavior-tree / dataflow layering",
        "brief": "Use the already-derived behavior-tree rail topology as a low-contrast, branching control layer behind Port-view Blocks. Keep blue port-to-port values in the foreground, so one canvas can show both structure and data without making either impersonate the other.",
        "count": 5,
        "defaultId": "v1",
        "defaultWhy": "Ghost roads is the clearest layering contract: a filled-but-translucent route says more than a rail alone, a fine seam retains ordered branching, and blue cables keep their established dataflow priority. It communicates the user's autonomous-path intuition without falsely presenting the canvas as runtime playback.",
        "decisionHinge": "If ordinary work is dominated by editing one local branch at a time, move 8–10% of the weight from control reconstructability to default quietness: Selective wash becomes competitive. If the primary use is explaining a behavior tree in a static export, retain Ghost roads and consider borrowing Flow field's directional texture only for presentation mode.",
        "invariants": [
            "One canonical behavior-tree graph produces Tree, Process, and Port/dataflow lenses; the cyan layer is derived presentation, never an independent control model.",
            "The shared fixture keeps the same fallback, rejoin, and parallel topology in every variant: MoveToObj → GraspValid, CorrectGrip on invalid, then CloseGrip and a two-child parallel outcome.",
            "Blue strokes always mean declared typed port-to-port values; cyan/teal area or path treatment always means control topology.",
            "Port cards, labels, dimensions, and every data cable remain fixed across variants and their interactive states.",
        ],
        "boundary": "Concept-only HTML prototype. The hero validates visual layering and a single emphasis interaction; it does not yet mount SystemSketch, generate lanes from live layout data, support editing, or assert execution/runtime status.",
        "axes": [
            {"name": "Control carrier", "values": ["continuous translucent corridor", "paired banks", "directional field", "branch territory", "selection-amplified wash"]},
            {"name": "At-rest priority", "values": ["always legible structure", "balanced route/data coexistence", "nearly pure Port view until a branch is focused"]},
            {"name": "Structural claim", "values": ["ordered path", "route boundary", "permitted movement", "scope membership", "local inspection"]},
        ],
        "requirements": REQUIREMENTS,
        "hardGates": GATES,
        "variants": variants,
        "checks": [
            "Exactly five structurally distinct treatments share one behavior-tree topology and one Port-view data fixture.",
            "Every live hero has a manual two-step walkthrough synchronized with its direct control.",
            "Blue data geometry never changes when the cyan control emphasis changes.",
            "All directions preserve the control/data semantic colour contract.",
        ],
    }


def main() -> None:
    SPEC.write_text(json.dumps(project(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if OUTPUT.exists():
        OUTPUT.unlink()
    subprocess.run(
        ["python3", str(SKILL / "scripts/gallery.py"), "build", "--spec", str(SPEC), "--output", str(OUTPUT), "--strict"],
        check=True,
    )
    print(f"Built {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
