#!/usr/bin/env python3
"""Build five Packet Punctuation (V5) cadence refinements on a dense board."""

from __future__ import annotations

import html
import importlib.util
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
OUTPUT = REPO / "docs" / "async-v5-packet-variants-2026-09-02.html"
BABBLE = Path("/home/bam/.agents/skills/babble")
SHELL = BABBLE / "assets" / "gallery-shell.html"
GALLERY_MODULE = BABBLE / "scripts" / "gallery.py"
GIT_HEAD = subprocess.run(
    ["git", "rev-parse", "--short", "HEAD"],
    cwd=REPO,
    capture_output=True,
    text=True,
    check=False,
).stdout.strip()


def load_gallery_module():
    spec = importlib.util.spec_from_file_location("babble_gallery", GALLERY_MODULE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load Babble gallery builder: {GALLERY_MODULE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def cadence_stats(pattern: str) -> tuple[float, int, int]:
    values = [int(value) for value in pattern.split()]
    carrier = sum(values[::2])
    gaps = values[1::2]
    return round(100 * carrier / sum(values), 1), min(gaps), max(gaps)


def block_svg(x: int, y: int, title: str, data_type: str) -> str:
    return f"""
      <g class="block" transform="translate({x} {y})">
        <rect width="150" height="90" rx="3"/>
        <line x1="0" y1="30" x2="150" y2="30"/>
        <text class="title" x="10" y="20">{title}</text>
        <circle class="event-port" cx="0" cy="42" r="4"/><circle class="event-port" cx="150" cy="42" r="4"/>
        <text x="10" y="46">event</text><text class="type" x="140" y="46" text-anchor="end">Event[T]</text>
        <circle class="data-port" cx="0" cy="68" r="4"/><circle class="data-port" cx="150" cy="68" r="4"/>
        <text x="10" y="72">data</text><text class="type" x="140" y="72" text-anchor="end">{data_type}</text>
      </g>
    """


def preview(variant_id: str, name: str, pattern: str) -> str:
    duty, gap_min, gap_max = cadence_stats(pattern)
    async_paths = [
        ("route-a", "M180 74 H250 V154 H900 V256 H1020", 0, "A →", 264, 145),
        ("route-b", "M180 256 H320 V130 H880 V74 H1020", -21, "B ↗", 330, 120),
        ("route-c", "M180 438 H300 V340 H930 V438 H1020", -43, "C →", 316, 330),
        ("route-d", "M675 438 H780 V310 H470 V74 H525", -67, "D ↑", 788, 300),
        ("route-e", "M1170 256 H950 V340 H300 V164 H80 V74 H30", -91, "E ←", 940, 330),
    ]
    routes = "".join(
        f'<path class="async-route {route_class}" d="{path}" stroke-dasharray="{pattern}" '
        f'stroke-dashoffset="{offset}" marker-end="url(#async-arrow-{variant_id})"/>'
        f'<g class="route-tag {route_class}-tag" transform="translate({tag_x} {tag_y})">'
        f'<rect x="-16" y="-10" width="32" height="18" rx="9"/><text text-anchor="middle" y="3">{tag}</text></g>'
        for route_class, path, offset, tag, tag_x, tag_y in async_paths
    )
    return f"""
      <div class="packet-fixture packet-fixture--{variant_id}">
        <div class="packet-fixture__bar">
          <span>V5 · PACKET PUNCTUATION</span><b>{name}</b>
          <i>5 async + 8 data · {duty}% carrier · gaps {gap_min}–{gap_max}px</i>
        </div>
        <svg viewBox="0 0 1200 520" role="img" aria-label="{name} on five async cables embedded in a dense orthogonal dataflow board">
          <defs>
            <marker id="async-arrow-{variant_id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#6d28d9"/></marker>
            <marker id="data-arrow-{variant_id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#4b5563"/></marker>
          </defs>
          <rect class="canvas" width="1200" height="520"/>
          <g class="packet-fixture__scene">
            <g class="data-layer">
              <path class="data-wire" d="M180 100 H525" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire" d="M675 100 H1020" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire" d="M675 100 H900 V282 H1020" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire" d="M180 282 H390 V464 H525" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire" d="M675 464 H1020" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire" d="M180 464 H245 V372 H900 V438 H1020" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire trunk" d="M30 186 H1170" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="data-wire trunk delayed" d="M840 16 V504" marker-end="url(#data-arrow-{variant_id})"/>
              <circle class="junction" cx="900" cy="100" r="3.5"/><circle class="junction" cx="390" cy="282" r="3.5"/>
              <circle class="junction" cx="245" cy="372" r="3.5"/><circle class="junction" cx="900" cy="372" r="3.5"/>
              <text class="layer-label" x="1145" y="176" text-anchor="end">DATA TRUNK</text>
            </g>

            <g class="overlap-proof">
              <path class="overlap-band" d="M300 340 H930"/>
              <path class="overlap-bracket" d="M300 353 V363 H930 V353"/>
              <text x="615" y="377" text-anchor="middle">C → and E ← occupy the same 630-unit trunk</text>
            </g>

            <g class="async-layer">{routes}</g>

            {block_svg(30, 32, 'sample()', 'Frame')}
            {block_svg(30, 214, 'detect()', 'Pose')}
            {block_svg(30, 396, 'record()', 'Clip')}
            {block_svg(525, 32, 'normalize()', 'Tensor')}
            {block_svg(525, 396, 'aggregate()', 'Summary')}
            {block_svg(1020, 32, 'display()', 'View')}
            {block_svg(1020, 214, 'notify()', 'Message')}
            {block_svg(1020, 396, 'archive()', 'Record')}
          </g>
          <text class="zoom-label" x="600" y="505" text-anchor="middle">45% board-scale proof · five async routes + eight data routes</text>
        </svg>
        <div class="packet-state-controls" aria-label="Dense-board checks">
          <span>same packet cadence on all five rails</span>
          <button type="button" data-story-to="full">Real board</button>
          <button type="button" data-story-to="async">Five async only</button>
          <button type="button" data-story-to="overlap">Opposed overlap</button>
          <button type="button" data-story-to="zoom">45% board</button>
        </div>
      </div>
    """


def fingerprint(pattern: str, grouping: str, short_phase: int) -> str:
    duty, gap_min, gap_max = cadence_stats(pattern)
    return f"""
      <div class="fingerprint">
        <svg viewBox="0 0 560 108" role="img" aria-label="Monochrome long and short-run packet grouping fingerprint">
          <text class="fingerprint-label" x="18" y="18">LONG RUN</text>
          <path class="fingerprint-base" d="M18 34 H542"/><path class="fingerprint-wire" d="M18 34 H542" stroke-dasharray="{pattern}"/>
          <text class="fingerprint-label" x="18" y="68">96-UNIT SHORT RUN · SAME STROKE, ROUTE PHASE SHOWN</text>
          <path class="fingerprint-base" d="M18 84 H114"/><path class="fingerprint-wire" d="M18 84 H114" stroke-dasharray="{pattern}" stroke-dashoffset="{short_phase}"/>
          <circle class="fingerprint-port" cx="18" cy="84" r="4"/><circle class="fingerprint-port" cx="114" cy="84" r="4"/>
        </svg>
        <div><b>{grouping}</b><span>{duty}% carrier · gaps {gap_min}–{gap_max}px</span><code>{pattern}</code></div>
      </div>
    """


REQUIREMENTS = [
    {
        "id": "fr1", "name": "Short-run signal", "weight": 30,
        "why": "An async edge still needs to announce itself when two nearby blocks leave only a short cable run.",
        "passCondition": "A 96-unit specimen contains at least one legible short painted packet enclosed by two micro-gaps.",
        "anchors": {"1": "The short run looks solid.", "3": "A mark appears, but it reads as damage or a gap.", "5": "One clean packet dash is immediately visible."},
    },
    {
        "id": "fr2", "name": "Frequency balance", "weight": 25,
        "why": "Too frequent becomes dotted; too sparse becomes straight.",
        "passCondition": "Across short and long runs, packets are frequent enough to establish the mark but sparse enough that the carrier stays dominant.",
        "anchors": {"1": "Reads as dotted or solid.", "3": "Balanced on one scale but fails another.", "5": "Clearly packetized at both scales without perforation."},
    },
    {
        "id": "fr3", "name": "Async character", "weight": 20,
        "why": "Uneven space between packet dashes should statically suggest data being sent without claiming measured timing.",
        "passCondition": "Packet-to-packet rests are visibly uneven and the cadence reads as asynchronous rather than clocked.",
        "anchors": {"1": "Looks clocked or like ordinary dashing.", "3": "Some async texture, but a beat dominates.", "5": "Clearly non-metric while still categorical."},
    },
    {
        "id": "fr4", "name": "Dense-board tidiness", "weight": 15,
        "why": "The mark must stay calm when five async rails and eight data rails share one board.",
        "passCondition": "A–E remain individually traceable through orthogonal bends, crossings, data trunks, and the opposed overlap.",
        "anchors": {"1": "The board becomes visual static.", "3": "Traceable, but crossings or overlap are noisy.", "5": "Five rails stay distinct without looking decorated."},
    },
    {
        "id": "fr5", "name": "Single-stroke seam", "weight": 10,
        "why": "A viable V5 remains one paint rule on the existing tldraw Connection path.",
        "passCondition": "One strokeDasharray renders every route; geometry, handles, bindings, hit testing, and export remain unchanged.",
        "anchors": {"1": "Needs extra shapes or route geometry.", "3": "One connection plus masks or adornments.", "5": "One shared paint resolver and one path."},
    },
]


HARD_GATES = [
    {"id": "g1", "name": "Mostly continuous", "why": "At least 88% of every repeating pattern is painted carrier."},
    {"id": "g2", "name": "Micro-gaps only", "why": "No gap exceeds 9 SVG/user units."},
    {"id": "g3", "name": "Short-run visible", "why": "A 96-unit cable must contain at least one complete short-dash packet."},
    {"id": "g4", "name": "Five real async rails", "why": "Every candidate must show five simultaneous async routes, not one hero cable."},
    {"id": "g5", "name": "No geometry fork", "why": "The proposal changes paint only and stays on tldraw's supported custom-shape seam."},
]


STORY = {
    "title": "Read the cadence in a real schematic",
    "steps": [
        {"label": "See the complete board", "caption": "Five async rails and eight data rails use long, orthogonal, fan-out-heavy routing.", "state": "full", "target": "[data-story-to='full']"},
        {"label": "Trace all five async rails", "caption": "Data fades, exposing A–E and their different directions.", "state": "async", "target": "[data-story-to='async']"},
        {"label": "Inspect the opposed overlap", "caption": "C and E share 630 units while travelling in opposite directions.", "state": "overlap", "target": "[data-story-to='overlap']"},
        {"label": "Reduce the complete schematic", "caption": "At 45%, judge separation from data and survival of packet groups.", "state": "zoom", "target": "[data-story-to='zoom']"},
    ],
}


CADENCES = [
    {
        "id": "v1", "name": "Even Packet Spacing", "pattern": "56 4 10 4 56 4 10 4 56 4 10 4", "short_phase": 0,
        "grouping": "three identical packets · equal 56-unit rests",
        "thesis": "Identical 10-unit packet dashes sit between paired micro-gaps at perfectly even intervals—the requested spacing control.",
        "best": "When a highly regular packet train is more important than irregular async character.",
        "loses": "The equal rests feel clocked and start to resemble a repeating dash-dot construction line.",
        "short_visible": True, "scores": [5, 5, 2, 4, 5],
    },
    {
        "id": "v2", "name": "Uneven Packets Only", "pattern": "72 4 10 4 96 5 12 5 82 4 9 4", "short_phase": 0,
        "grouping": "three packet dashes · uneven 72/96/82-unit rests · zero singleton gaps",
        "thesis": "Every mark is a short painted packet enclosed by two gaps, and the unequal rests make the static rail read asynchronous.",
        "best": "The direct expression of the emerging rule: clean packets, no lone gaps, visibly uneven delivery.",
        "loses": "The packet lengths vary slightly, which may imply different payload sizes if read too literally.",
        "short_visible": True, "scores": [5, 5, 5, 4, 5],
    },
    {
        "id": "v3", "name": "Original Hybrid", "pattern": "88 4 10 4 64 5 12 4 106 5", "short_phase": 24,
        "grouping": "two packet dashes · one singleton gap",
        "thesis": "The original V5 keeps two small packet dashes but adds one isolated gap for extra rhythmic irregularity.",
        "best": "When organic async rhythm matters more than a strict packet-only vocabulary.",
        "loses": "The singleton reads as damage rather than a packet and weakens the visual rule.",
        "short_visible": True, "scores": [5, 4, 5, 4, 5],
    },
    {
        "id": "v4", "name": "Packet Bursts", "pattern": "88 4 10 4 18 4 10 4 112 5 11 5 20 5 9 5", "short_phase": 34,
        "grouping": "two close packet pairs · uneven long rests",
        "thesis": "Short packet dashes arrive in close pairs, making async unmistakable even when only a small route fragment is visible.",
        "best": "When short-run recognition dominates and a stronger burst signal is welcome.",
        "loses": "Five simultaneous rails become busy and the repeated punctuation approaches a dotted texture.",
        "short_visible": True, "scores": [5, 3, 5, 2, 5],
    },
    {
        "id": "v5", "name": "Sparse Packets", "pattern": "128 4 10 4 172 5 12 5", "short_phase": 0,
        "grouping": "two packet dashes · very long uneven rests",
        "thesis": "Only two packets interrupt a 95% carrier, testing the clean but too-infrequent edge of the design space.",
        "best": "Very long routes where calmness matters more than immediate recognition.",
        "loses": "A short run can be completely solid, so it fails the explicit short-cable requirement.",
        "short_visible": False, "scores": [2, 2, 4, 5, 5],
    },
]


def scored(value: int, evidence: str, confidence: str = "high") -> dict:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def make_variant(item: dict) -> dict:
    pattern = item["pattern"]
    duty, gap_min, gap_max = cadence_stats(pattern)
    raw = item["scores"]
    evidence = [
        "The supporting fingerprint includes the exact cadence on a 96-unit port-to-port run; the sparse control visibly fails it.",
        f"The long fingerprint and all five routes expose the balance produced by {item['grouping']}.",
        "The full-board state makes even versus uneven packet-to-packet rests directly visible across five differently phased routes.",
        "The hero renders five labeled async routes through eight data rails, orthogonal bends, junctions, crossings, and opposed overlap.",
        "All five rails are plain SVG paths sharing one strokeDasharray; no geometry or interaction object is added.",
    ]
    gates = {
        "g1": {"pass": duty >= 88, "evidence": f"Measured duty cycle is {duty}% carrier."},
        "g2": {"pass": gap_max <= 9, "evidence": f"Gaps span {gap_min}–{gap_max}px."},
        "g3": {"pass": item["short_visible"], "evidence": "The 96-unit proof contains a complete packet dash." if item["short_visible"] else "The 96-unit proof can remain solid before the first packet."},
        "g4": {"pass": True, "evidence": "The shared fixture contains five labeled async paths A–E."},
        "g5": {"pass": True, "evidence": "The prototype changes strokeDasharray and dash offset only."},
    }
    return {
        "id": item["id"], "name": item["name"], "thesis": item["thesis"], "accent": "#6d28d9",
        "bestWhen": item["best"], "losesWhen": item["loses"],
        "decisions": [
            {"label": "Grouping", "value": item["grouping"]},
            {"label": "Pattern", "value": pattern},
            {"label": "Short-run phase", "value": f"{item['short_phase']} unit dash offset"},
            {"label": "Measured carrier", "value": f"{duty}% painted; gaps {gap_min}–{gap_max}px"},
        ],
        "keepParts": [item["grouping"], f"{duty}% carrier", "five-route schematic fixture"],
        "proof": [
            "Real board, async-only, opposed-overlap, and 45% controls drive the guided story states.",
            "Every state keeps five async paths; only contextual emphasis changes.",
            f"The monochrome long/short fingerprint exposes the exact array: {pattern}.",
        ],
        "scores": {requirement["id"]: scored(raw[index], evidence[index]) for index, requirement in enumerate(REQUIREMENTS)},
        "gateResults": gates,
        "previewLabel": "five-async-cable schematic",
        "story": STORY,
        "media": [{"label": "Long + short-run proof", "caption": "Exact array on a long carrier and a 96-unit cable between ports.", "html": fingerprint(pattern, item["grouping"], item["short_phase"])}],
        "preview": preview(item["id"], item["name"], pattern),
    }


VARIANTS = [make_variant(item) for item in CADENCES]


PROJECT = {
    "schemaVersion": 3,
    "title": "Five Packet Punctuation refinements",
    "kicker": "SystemSketch · V5 second pass · Babble 5",
    "brief": "Treat each package as a short painted dash enclosed by two micro-gaps, then vary the rest between packages. The comparison brackets the balance between dotted, straight, messy, and unmistakably async on both a 96-unit cable and five simultaneous rails inside a dense reference-calibrated schematic.",
    "count": 5,
    "defaultId": "v2",
    "defaultWhy": "Uneven Packets Only leads at 97/100. Every mark is a short painted packet between paired gaps, the 72/96/82-unit rests look asynchronous, the 91.5% carrier stays easy to trace, and a packet survives the 96-unit proof. It is the cleanest expression of the rule Zach described.",
    "decisionHinge": "The hinge is how much rhythmic variety is needed. V2 is the clean packet-only rule. If one singleton gap is acceptable, V3 adds more organic rhythm at the cost of a less coherent symbol. V1 proves that even spacing looks clocked; V4 and V5 expose the messy and straight-line failure edges.",
    "invariants": [
        "Every card uses the same eight blocks, five labeled async paths, eight data paths, crossings, junctions, and 630-unit opposed overlap.",
        "All five async paths in a card use the same cadence with different phase offsets caused by route length.",
        "The source-to-sink geometry never changes between variants; only strokeDasharray changes.",
        "A packet is the short painted dash enclosed by two gaps; the longer painted run between packets is the carrier/rest.",
        "Uneven spacing is categorical Event[T] artwork, not measured packet timing.",
    ],
    "boundary": "Standalone interactive SVG paint prototypes based on the supplied Simulink-style topology references. They prove that five-cable comparison is judgeable; SystemSketch Connection code and tldraw behavior remain unchanged.",
    "axes": [
        {"name": "Packet spacing", "values": ["even", "uneven", "very sparse"]},
        {"name": "Packet frequency", "values": ["sparse", "balanced", "bursty"]},
        {"name": "Mark vocabulary", "values": ["packet dashes only", "packet + singleton gap"]},
        {"name": "Board character", "values": ["straight", "clean async", "dotted/messy"]},
    ],
    "requirements": REQUIREMENTS,
    "hardGates": HARD_GATES,
    "variants": VARIANTS,
    "checks": [
        "Exactly five V5 derivatives",
        "Five async paths and eight data paths in every hero",
        "Orthogonal trunks, fan-outs, junctions, crossings, and opposed overlap",
        "Real board / async only / opposed overlap / 45% synchronized states",
        "Exact dash array, 96-unit proof, and measured duty cycle for every option",
        "Pick, shortlist, reject, splice, copy, and download",
    ],
}


CUSTOM_CSS = r"""
  .correction { margin:32px 0 8px; padding:18px; border:1px solid var(--line-strong); border-radius:7px; background:var(--panel); }
  .correction__head { display:flex; align-items:end; justify-content:space-between; gap:22px; }
  .correction h2 { margin:3px 0 0; font:500 23px/1.05 var(--serif); }
  .correction p { max-width:720px; margin:0; color:var(--muted); font-size:11px; line-height:1.55; }
  .correction a { color:#5b45aa; }
  .grammar-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
  .grammar-strip div { padding:11px; border:1px solid var(--line); background:#fff; }
  .grammar-strip b { display:block; color:#27232d; font:750 9px/1 var(--mono); text-transform:uppercase; letter-spacing:.06em; }
  .grammar-strip span { display:block; margin-top:5px; color:#716b64; font-size:10px; line-height:1.35; }

  .variant-grid { grid-template-columns:1fr; }
  .decision-dock { position:relative; bottom:auto; }
  .prototype-frame, .prototype { min-height:566px; }
  .packet-fixture { min-height:566px; overflow:hidden; background:#fff; color:#1f2937; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
  .packet-fixture__bar { display:flex; align-items:center; gap:11px; min-height:35px; padding:8px 11px; border-bottom:1px solid #d1d5db; background:#fafafa; font-size:10px; }
  .packet-fixture__bar span { color:#6d28d9; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.08em; }
  .packet-fixture__bar b { font-size:11px; }
  .packet-fixture__bar i { margin-left:auto; color:#6b7280; font-size:9px; }
  .packet-fixture svg { display:block; width:100%; }
  .packet-fixture .canvas { fill:#fff; }
  .packet-fixture__scene { transform-origin:600px 260px; transition:transform .18s ease; }
  .packet-fixture .block rect { fill:#fff; stroke:#4b5563; stroke-width:1.15; }
  .packet-fixture .block line { stroke:#c4c9d0; stroke-width:1; }
  .packet-fixture .block text { fill:#2f3743; font-size:9px; }
  .packet-fixture .block .type { fill:#7b8492; font-size:8px; }
  .packet-fixture .block .title { font:650 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .packet-fixture .event-port { fill:#6d28d9; }
  .packet-fixture .data-port, .junction { fill:#4b5563; }
  .data-layer { transition:opacity .16s ease; }
  .data-wire { fill:none; stroke:#4b5563; stroke-width:1.55; stroke-linecap:square; }
  .data-wire.trunk { stroke-width:1.35; }
  .data-wire.delayed { stroke-dasharray:2 6; stroke-linecap:round; }
  .layer-label { fill:#6b7280; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.08em; }
  .async-route { fill:none; stroke:#6d28d9; stroke-width:2.35; stroke-linecap:butt; transition:opacity .16s ease; }
  .route-tag { transition:opacity .16s ease; }
  .route-tag rect { fill:#f3efff; stroke:#9275df; stroke-width:1; }
  .route-tag text { fill:#5b21b6; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .overlap-proof { opacity:0; transition:opacity .16s ease; }
  .overlap-band { fill:none; stroke:#f59e0b; stroke-width:8; opacity:.42; }
  .overlap-bracket { fill:none; stroke:#b45309; stroke-width:1; }
  .overlap-proof text { fill:#92400e; font-size:9px; font-style:italic; }
  .zoom-label { opacity:0; fill:#6b7280; font-size:9px; font-style:italic; transition:opacity .16s ease; }
  .prototype[data-story-state="async"] .data-layer { opacity:.09; }
  .prototype[data-story-state="overlap"] .data-layer { opacity:.35; }
  .prototype[data-story-state="overlap"] .route-a,
  .prototype[data-story-state="overlap"] .route-b,
  .prototype[data-story-state="overlap"] .route-d,
  .prototype[data-story-state="overlap"] .route-a-tag,
  .prototype[data-story-state="overlap"] .route-b-tag,
  .prototype[data-story-state="overlap"] .route-d-tag { opacity:.14; }
  .prototype[data-story-state="overlap"] .overlap-proof { opacity:1; }
  .prototype[data-story-state="zoom"] .packet-fixture__scene { transform:scale(.45); }
  .prototype[data-story-state="zoom"] .zoom-label { opacity:1; }
  .packet-state-controls { display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 10px 12px; border-top:1px solid #d1d5db; background:#fafafa; }
  .packet-state-controls span { margin-right:5px; color:#6b7280; font:650 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em; }
  .packet-state-controls button { min-height:28px; padding:6px 10px; border:1px solid #c5cad1; border-radius:4px; background:#fff; color:#4b5563; font:650 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .prototype[data-story-state="full"] [data-story-to="full"],
  .prototype[data-story-state="async"] [data-story-to="async"],
  .prototype[data-story-state="overlap"] [data-story-to="overlap"],
  .prototype[data-story-state="zoom"] [data-story-to="zoom"] { border-color:#6d28d9; background:#f3efff; color:#5b21b6; }

  .fingerprint { min-height:176px; padding:16px; background:#fafafa; }
  .fingerprint svg { display:block; width:100%; border:1px solid #d9dde3; border-radius:4px; background:#fff; }
  .fingerprint-base { fill:none; stroke:#e2e5e9; stroke-width:7; }
  .fingerprint-wire { fill:none; stroke:#414750; stroke-width:2.35; stroke-linecap:butt; }
  .fingerprint-label { fill:#777f8a; font:750 7.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.07em; }
  .fingerprint-port { fill:#414750; }
  .fingerprint > div { display:flex; gap:12px; align-items:baseline; padding-top:9px; color:#717985; font-size:9px; }
  .fingerprint b { color:#303642; }
  .fingerprint code { margin-left:auto; color:#5b21b6; font:700 8.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  @media(max-width:760px) {
    .correction__head { display:block; }
    .correction__head p { margin-top:10px; }
    .grammar-strip { grid-template-columns:1fr 1fr; }
    .packet-fixture__bar i, .packet-state-controls span { display:none; }
  }
"""


def correction_html() -> str:
    return """
      <section class="correction" aria-labelledby="correction-heading">
        <div class="correction__head">
          <div><div class="eyebrow">Reference-calibrated correction</div><h2 id="correction-heading">A schematic, not a cable showroom.</h2></div>
          <p>The supplied examples establish the fixture grammar: thin orthogonal trunks, repeated parallel lanes, short taps, fan-outs, junction dots, and anonymous crossings. This second pass puts five equal-status async rails inside that topology. <a href="async-burst-gap-cadences-2026-09-02.html">Return to the ten-cadence parent study.</a></p>
        </div>
        <div class="grammar-strip">
          <div><b>Packet = short dash</b><span>Two micro-gaps isolate one small painted package on the carrier.</span></div>
          <div><b>8 data rails</b><span>Thin solid trunks, fan-outs, junctions, and one delayed dotted rail.</span></div>
          <div><b>630-unit overlap</b><span>C and E occupy one trunk in opposite directions.</span></div>
          <div><b>Short-run proof</b><span>Every card exposes the same cadence on a 96-unit port-to-port cable.</span></div>
        </div>
      </section>
    """


def build() -> str:
    gallery = load_gallery_module()
    rendered = gallery.embed_project(SHELL.read_text(encoding="utf-8"), PROJECT)
    rendered = rendered.replace("</head>", f"<style>{CUSTOM_CSS}</style></head>", 1)
    variants_heading = '    <section aria-labelledby="variants-heading">'
    rendered = rendered.replace(variants_heading, correction_html() + "\n" + variants_heading, 1)
    rendered = rendered.replace(
        "</body>",
        f'<!-- Built by docs/build_async_v5_packet_variants.py at {html.escape(GIT_HEAD)}; paint prototypes only, no product code changed. --></body>',
        1,
    )
    return rendered


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    totals = {
        variant["id"]: round(sum(
            requirement["weight"] * variant["scores"][requirement["id"]]["score"] / 5
            for requirement in REQUIREMENTS
        ), 1)
        for variant in VARIANTS
    }
    print(OUTPUT)
    print(json.dumps({"variants": len(VARIANTS), "totals": totals}, indent=2))


if __name__ == "__main__":
    main()
