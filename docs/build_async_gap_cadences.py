#!/usr/bin/env python3
"""Build ten mostly-continuous, gap-coded async cable cadences."""

from __future__ import annotations

import html
import importlib.util
import json
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
OUTPUT = REPO / "docs" / "async-burst-gap-cadences-2026-09-02.html"
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


def block_svg(x: int, y: int, width: int, title: str, role: str) -> str:
    """A compact shared block for the long-route topology fixture."""
    return f"""
      <g class="block" transform="translate({x} {y})">
        <rect x="0" y="0" width="{width}" height="102" rx="7"/>
        <line x1="0" y1="32" x2="{width}" y2="32"/>
        <text class="title" x="11" y="21">{title}</text>
        <circle cx="0" cy="52" r="4.5"/><circle cx="{width}" cy="52" r="4.5"/>
        <text x="12" y="55">event</text><text class="type" x="{width - 12}" y="55" text-anchor="end">Event[Item]</text>
        <circle class="data-port" cx="0" cy="78" r="4.5"/><circle class="data-port" cx="{width}" cy="78" r="4.5"/>
        <text x="12" y="81">data</text><text class="type" x="{width - 12}" y="81" text-anchor="end">{role}</text>
      </g>
    """


def preview(variant_id: str, name: str, pattern: str) -> str:
    duty, gap_min, gap_max = cadence_stats(pattern)
    return f"""
      <div class="gap-fixture gap-fixture--{variant_id}">
        <div class="gap-fixture__bar"><span>GAP-CODED EVENT RAIL</span><b>{name}</b><i>{duty}% carrier · gaps {gap_min}–{gap_max}px</i></div>
        <svg viewBox="0 0 1100 390" role="img" aria-label="{name} cadence on a long SystemSketch route with bundles, crossings, and a shared run">
          <defs>
            <marker id="event-arrow-{variant_id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#7c3aed"/></marker>
            <marker id="data-arrow-{variant_id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#657080"/></marker>
            <marker id="overlap-arrow-{variant_id}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#d97706"/></marker>
          </defs>
          <rect class="canvas" width="1100" height="390"/>
          <g class="gap-fixture__scene">
            <path class="lane-guide" d="M18 190 H1082"/>
            <path class="lane-guide" d="M18 226 H1082"/>

            <g class="bundle-cable">
              <path class="context-wire data-wire" d="M196 110 H228 V226 H842 V110 H904" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire data-wire" d="M420 100 C480 100 450 306 500 306 H688" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire data-wire" d="M652 332 H688" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire data-wire" d="M860 332 H904" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire crossing-wire" d="M450 8 V366" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire crossing-wire dotted" d="M762 8 V366" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire data-wire" d="M30 226 H1064" marker-end="url(#data-arrow-{variant_id})"/>
              <path class="context-wire secondary-event" d="M420 74 C522 74 486 352 610 352 H904" stroke-dasharray="{pattern}" marker-end="url(#event-arrow-{variant_id})"/>
              <text class="topology-note bundle-note" x="550" y="375" text-anchor="middle">8 neighbouring cables · straight, elbow, curved, and vertical routes</text>
            </g>

            <g class="overlap-only">
              <path class="overlap-halo" d="M342 190 H682"/>
              <path class="overlap-wire" d="M196 110 H232 V232 H296 C324 232 318 190 342 190 H682 C734 190 734 302 786 302 H904" marker-end="url(#overlap-arrow-{variant_id})"/>
              <path class="overlap-bracket" d="M342 204 V213 H682 V204"/>
              <text class="topology-note overlap-note" x="512" y="224" text-anchor="middle">340-unit shared run · orange cable beneath purple</text>
              <circle class="cross-mark" cx="450" cy="190" r="9"/><circle class="cross-mark" cx="762" cy="94" r="9"/>
            </g>

            <path class="event-wire target-wire" d="M196 84 H220 V190 H682 C732 190 724 84 778 84 H904" stroke-dasharray="{pattern}" marker-end="url(#event-arrow-{variant_id})"/>

            {block_svg(24, 32, 172, 'watch_items()', 'Pose')}
            {block_svg(248, 22, 172, 'decode()', 'Frame')}
            {block_svg(480, 254, 172, 'classify()', 'Label')}
            {block_svg(688, 254, 172, 'cache()', 'Record')}
            {block_svg(904, 32, 172, 'dispatch_pick()', 'Choice')}
            {block_svg(904, 250, 172, 'archive()', 'Record')}

            <g class="route-callout">
              <path d="M205 60 H892"/>
              <text x="548" y="51" text-anchor="middle">708-unit board span · elbow + curve</text>
            </g>
          </g>
          <text class="zoom-label" x="550" y="376" text-anchor="middle">45% board-scale proof · all routes remain in view</text>
        </svg>
        <div class="gap-state-controls" aria-label="Route legibility checks">
          <span>stress the same long cadence</span>
          <button type="button" data-story-to="long">Long route</button>
          <button type="button" data-story-to="bundle">Cable bundle</button>
          <button type="button" data-story-to="overlap">Cross + overlap</button>
          <button type="button" data-story-to="zoom">45% board</button>
        </div>
      </div>
    """


def fingerprint(pattern: str) -> str:
    duty, gap_min, gap_max = cadence_stats(pattern)
    return f"""
      <div class="fingerprint">
        <svg viewBox="0 0 420 66" role="img" aria-label="Monochrome cadence fingerprint">
          <path class="fingerprint-base" d="M18 31 H402"/>
          <path class="fingerprint-wire" d="M18 31 H402" stroke-dasharray="{pattern}"/>
        </svg>
        <div><b>{duty}% carrier</b><span>{gap_min}–{gap_max}px gaps</span><code>{pattern}</code></div>
      </div>
    """


REQUIREMENTS = [
    {
        "id": "fr1", "name": "Eye keeps the route", "weight": 35,
        "why": "The first cadence used silences large enough to make a long wire difficult to follow through a real board.",
        "passCondition": "Across a 700+ unit route, a dense bundle, crossings, a shared run, and 45% scale, the cable still reads as one source-to-sink route.",
        "anchors": {"1": "The eye jumps between fragments or changes cable.", "3": "Traceable alone, fragile in the bundle or overlap.", "5": "The carrier keeps ownership in all four topology states."},
    },
    {
        "id": "fr2", "name": "Async rhythm", "weight": 25,
        "why": "The tiny gaps must still feel irregular and packet-like rather than accidental damage.",
        "passCondition": "Unequal gap spacing, and preferably unequal gap widths, create a Morse-like but non-periodic fingerprint.",
        "anchors": {"1": "A regular perforation or a nearly invisible accident.", "3": "Some syncopation, but the pattern settles into a beat.", "5": "Distinct single/double/triplet interruptions and uneven rests."},
    },
    {
        "id": "fr3", "name": "Small-gap legibility", "weight": 15,
        "why": "A gap that vanishes under round caps or zoom is no semantic channel at all.",
        "passCondition": "At 45% route scale the interruptions remain visible without becoming large silences.",
        "anchors": {"1": "Most gaps disappear.", "3": "The largest gaps survive; small ones blur.", "5": "The full gap vocabulary stays visible and the route stays whole."},
    },
    {
        "id": "fr4", "name": "Honest categorical mark", "weight": 15,
        "why": "Source view can denote Event[T], but it has no measured arrival timestamps.",
        "passCondition": "The cadence reads as a type-level fingerprint, not a literal packet count or trace.",
        "anchors": {"1": "Looks like measured telemetry.", "3": "A plausible count or grouping overread remains.", "5": "Clearly symbolic and stable; no timing claim."},
    },
    {
        "id": "fr5", "name": "Single-stroke seam", "weight": 10,
        "why": "The result should be one paint change on the existing tldraw Connection path.",
        "passCondition": "One SVG dash array works unchanged for straight, curved, elbow, canvas, and export.",
        "anchors": {"1": "Requires sampled glyphs or new interaction geometry.", "3": "One shape, but extra masks or adornments.", "5": "One strokeDasharray; geometry and interaction stay untouched."},
    },
]

HARD_GATES = [
    {"id": "g1", "name": "Mostly continuous", "why": "At least 88% of the repeating pattern is painted carrier, not gap."},
    {"id": "g2", "name": "Micro-gaps only", "why": "No individual gap exceeds 9 SVG/user units in the design-scale specimen."},
    {"id": "g3", "name": "Colour-independent", "why": "The cadence must remain identifiable in the monochrome fingerprint."},
]

STORY = {
    "title": "Stress the carrier on a real board",
    "steps": [
        {"label": "Trace the long route", "caption": "Follow a 708-unit board span through an elbow and a curve.", "state": "long", "target": "[data-story-to='long']"},
        {"label": "Add the cable bundle", "caption": "Compare it against eight straight, elbow, curved, and vertical neighbours.", "state": "bundle", "target": "[data-story-to='bundle']"},
        {"label": "Cross and share a run", "caption": "Two cables cross it and an orange route sits directly beneath it for 340 units.", "state": "overlap", "target": "[data-story-to='overlap']"},
        {"label": "Reduce the whole board", "caption": "At 45%, check that the gaps survive without breaking route ownership.", "state": "zoom", "target": "[data-story-to='zoom']"},
    ],
}


CADENCES = [
    {
        "id": "v1", "name": "Quiet Scatter", "pattern": "56 5 92 4 38 6 110 4",
        "thesis": "Four restrained dropouts sit far apart on a 94% carrier—the calmest literal reading of ‘packages as gaps.’",
        "best": "Dense boards where route ownership matters more than shouting async.",
        "loses": "The single gaps can look like rendering nicks before the reader learns the vocabulary.",
        "model": "isolated pinholes", "rhythm": "single · single · single · single", "scores": [5, 4, 4, 5, 5],
    },
    {
        "id": "v2", "name": "Double-Tap", "pattern": "74 5 8 4 102 5 44 4",
        "thesis": "A close pair of micro-gaps becomes the memorable async signature while long runs preserve the route.",
        "best": "A minimal vocabulary that needs one unmistakable Morse-like motif.",
        "loses": "The doublet can be overread as exactly two queued messages.",
        "model": "one syncopated doublet", "rhythm": "single · double · single", "scores": [5, 5, 4, 4, 5],
    },
    {
        "id": "v3", "name": "Breath Marks", "pattern": "46 4 83 9 61 5 97 4",
        "thesis": "Unequal spacing and 4/9/5/4 gap widths create a clearly asynchronous breath without removing the carrier.",
        "best": "The closest fit to the request: unequal packets, unequal waits, still easy to trace.",
        "loses": "The 9 px breath is the upper limit; thicker future strokes may make it feel larger.",
        "model": "short and long breaths", "rhythm": "tick · breath · tick · tick", "scores": [5, 5, 4, 5, 5],
    },
    {
        "id": "v4", "name": "Syncopated Singles", "pattern": "28 5 96 4 42 7 118 4",
        "thesis": "The gap widths stay quiet while radically unequal run lengths create the asynchronous timing.",
        "best": "Far zoom, because every gap remains a legible 4–7 px interruption.",
        "loses": "Most of the irregularity lives in spacing, so it is subtler than mixed clusters.",
        "model": "uneven rests", "rhythm": "near · far · medium · very far", "scores": [5, 4, 5, 5, 5],
    },
    {
        "id": "v5", "name": "Packet Punctuation", "pattern": "88 4 10 4 64 5 12 4 106 5",
        "thesis": "Two separated double-gaps punctuate long carrier phrases, like commas on a wire.",
        "best": "When the gap must read intentionally designed on first encounter.",
        "loses": "Repeated pairs imply grouping and can invite a packet-count interpretation.",
        "model": "paired punctuation", "rhythm": "double · double · single", "scores": [5, 5, 4, 4, 5],
    },
    {
        "id": "v6", "name": "Sparse Dropout", "pattern": "132 5 78 4 156 6",
        "thesis": "Only three tiny interruptions preserve a near-solid 96% carrier for maximum traceability.",
        "best": "Extremely busy boards or very long cables.",
        "loses": "On short cables a single gap may be all that appears, weakening the async read.",
        "model": "rare dropout", "rhythm": "far · medium · farther", "scores": [5, 3, 3, 5, 5],
    },
    {
        "id": "v7", "name": "Telegraph Grain", "pattern": "34 4 48 5 27 4 58 6 39 4",
        "thesis": "Frequent unequal micro-gaps make the Morse analogy strongest while retaining a 90% carrier.",
        "best": "Short connections that need enough samples to establish the pattern.",
        "loses": "At board scale it approaches a conventional dashed line and becomes visually busier.",
        "model": "dense telegraph", "rhythm": "five quick irregular taps", "scores": [4, 5, 5, 4, 5],
    },
    {
        "id": "v8", "name": "Triplet Signature", "pattern": "52 4 16 4 18 4 104 6 74 4",
        "thesis": "A three-gap burst followed by a long recovery makes ‘bursty async’ legible without a broken rail.",
        "best": "When the semantic emphasis is burst arrival rather than merely non-continuous delivery.",
        "loses": "The triplet is so specific that readers may interpret it as a protocol symbol.",
        "model": "burst then recover", "rhythm": "triplet · long silence · single", "scores": [5, 5, 4, 4, 5],
    },
    {
        "id": "v9", "name": "Uneven Morse", "pattern": "41 4 70 6 24 4 112 7 58 4",
        "thesis": "Every rest changes: uneven runs and 4/6/4/7/4 gaps give the most organic Morse-like fingerprint.",
        "best": "When unmistakable irregularity matters and a little extra texture is acceptable.",
        "loses": "The 7 px gaps and frequent changes make it slightly less quiet than the top recommendation.",
        "model": "unmetered Morse", "rhythm": "no repeated interval", "scores": [4, 5, 5, 5, 5],
    },
    {
        "id": "v10", "name": "Burst Interrupts", "pattern": "62 5 9 4 14 4 76 5 11 4 124 6",
        "thesis": "Two compact interruption bursts sit inside long continuous phrases—the most energetic version of the inversion.",
        "best": "Async-heavy diagrams where each event rail must announce itself quickly.",
        "loses": "The two clusters approach perforation and carry more visual noise through crossings.",
        "model": "two gap bursts", "rhythm": "triplet · doublet · long recovery", "scores": [4, 5, 5, 4, 5],
    },
]


def scored(value: int, evidence: str, confidence: str = "high") -> dict:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def make_variant(item: dict) -> dict:
    pattern = item["pattern"]
    duty, gap_min, gap_max = cadence_stats(pattern)
    raw = item["scores"]
    evidence = [
        f"{duty}% of the repeating pattern remains painted; the 708-unit board span, bundle, overlap, and 45% states expose route loss directly.",
        f"The {item['rhythm']} rhythm uses unequal run spacing; visible gaps span {gap_min}–{gap_max}px.",
        f"The reduced state scales the exact same dash array; {gap_max}px is the strongest surviving interruption.",
        "The pattern is presented as a stable Event[T] type mark, not as observed arrivals or queue occupancy.",
        "It is one SVG strokeDasharray on the existing route, shared by canvas and export paint.",
    ]
    gates = {
        "g1": {"pass": duty >= 88, "evidence": f"Measured pattern duty cycle is {duty}% carrier."},
        "g2": {"pass": gap_max <= 9, "evidence": f"Largest gap is {gap_max}px; the cap is 9px."},
        "g3": {"pass": True, "evidence": "The media specimen renders the same cadence in monochrome."},
    }
    return {
        "id": item["id"], "name": item["name"], "thesis": item["thesis"], "accent": "#7c3aed",
        "bestWhen": item["best"], "losesWhen": item["loses"],
        "decisions": [
            {"label": "Gap model", "value": item["model"]},
            {"label": "Cadence", "value": item["rhythm"]},
            {"label": "Measured carrier", "value": f"{duty}% painted; gaps {gap_min}–{gap_max}px"},
        ],
        "keepParts": [item["model"], item["rhythm"], f"{duty}% carrier"],
        "proof": [
            "Long-route, bundle, overlap, and 45% buttons drive the same states as the guided story.",
            f"The monochrome fingerprint exposes the exact array: {pattern}.",
            "The underlying source-to-sink path never changes; only its stroke paint changes.",
        ],
        "scores": {requirement["id"]: scored(raw[index], evidence[index]) for index, requirement in enumerate(REQUIREMENTS)},
        "gateResults": gates, "previewLabel": "interactive route stress test", "story": STORY,
        "media": [{"label": "Cadence fingerprint", "caption": "Exact monochrome array and measured carrier/gap ratio.", "html": fingerprint(pattern)}],
        "preview": preview(item["id"], item["name"], pattern),
    }


VARIANTS = [make_variant(item) for item in CADENCES]

PROJECT = {
    "schemaVersion": 3,
    "title": "Ten gap-coded burst cadences",
    "kicker": "SystemSketch · async edge micro-study · Babble 10",
    "brief": "Invert the first Burst Cadence: keep a mostly continuous event rail, then let each symbolic package appear as a small dropout. Every candidate now runs through the same long, busy topology—bundles, crossings, partial overlap, and a 45% overview—so the eye-tracking judgment reflects a real board rather than a short specimen.",
    "count": 10,
    "defaultId": "v3",
    "defaultWhy": "Breath Marks is the provisional default at 97.0/100. Its runs are clearly unmetered, its 4/9/5/4 px gaps make the package marks deliberately unequal, and 93.0% of the route remains painted. It answers the eye-tracking criticism without sliding back into a regular dashed line.",
    "decisionHinge": "The main trade is recognition versus quietness. If far-zoom legibility dominates, choose V4 Syncopated Singles; if the board is extremely dense, choose V1 Quiet Scatter; if ‘burst’ must be unmistakable on short cables, splice V8’s triplet into V3’s mixed gap widths.",
    "invariants": [
        "Every candidate uses the same six-block, 708-unit-span watch_items() → dispatch_pick() Event[Item] fixture.",
        "Every state uses the same eight neighbouring cables, two crossings, and 340-unit shared run.",
        "The source-to-sink geometry is unchanged; only strokeDasharray differs.",
        "Every repeating cadence keeps at least 88% painted carrier and no gap exceeds 9px.",
        "Gaps are a categorical Event[T] fingerprint, not a literal count or measured arrival trace.",
    ],
    "boundary": "Standalone, interactive SVG paint prototypes plus measured dash-array stats. The controls and route stress states are real; SystemSketch Connection code, schema, type inference, runtime telemetry, and tldraw behavior are unchanged.",
    "axes": [
        {"name": "Gap grouping", "values": ["singles", "doublet", "mixed widths", "paired", "triplet", "bursts"]},
        {"name": "Gap density", "values": ["sparse", "quiet", "medium", "telegraph"]},
        {"name": "Irregularity source", "values": ["spacing", "width", "clustering", "all three"]},
        {"name": "Carrier ratio", "values": ["90–92%", "93–94%", "96%"]},
    ],
    "requirements": REQUIREMENTS,
    "hardGates": HARD_GATES,
    "variants": VARIANTS,
    "checks": [
        "Exactly ten distinct gap cadences",
        "Same blocks, ports, 708-unit board span, event colour, and topology",
        "Long route / cable bundle / cross + overlap / 45% direct controls and guided story",
        "Exact dash array and measured duty cycle shown for every option",
        "All candidates pass carrier and max-gap hard gates",
        "Pick, shortlist, reject, splice, copy, and download",
    ],
}


CUSTOM_CSS = r"""
  .feedback-lock { margin:32px 0 8px; padding:18px; border:1px solid var(--line-strong); border-radius:7px; background:var(--panel); }
  .feedback-lock__head { display:flex; align-items:end; justify-content:space-between; gap:20px; }
  .feedback-lock h2 { margin:2px 0 0; font:500 23px/1.05 var(--serif); }
  .feedback-lock p { max-width:690px; margin:0; color:var(--muted); font-size:11px; line-height:1.55; }
  .feedback-lock a { color:#5b45aa; }
  .feedback-lock__compare { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
  .feedback-lock figure { margin:0; padding:14px; border:1px solid var(--line); border-radius:5px; background:#fff; }
  .feedback-lock figcaption { margin-top:9px; color:var(--muted); font-size:9.5px; }
  .feedback-lock svg { display:block; width:100%; }
  .feedback-lock path { fill:none; stroke:#7c3aed; stroke-width:2.2; }
  .feedback-lock .before { stroke-dasharray:30 7 4 8 12 34; stroke-linecap:round; }
  .feedback-lock .after { stroke-dasharray:46 4 83 9 61 5 97 4; stroke-linecap:butt; }

  .variant-grid { grid-template-columns:1fr; }
  .decision-dock { position:relative; bottom:auto; }
  .prototype-frame, .prototype { min-height:476px; }
  .gap-fixture { min-height:476px; overflow:hidden; background:#f7f8fa; color:#20242c; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
  .gap-fixture__bar { display:flex; align-items:center; gap:10px; min-height:34px; padding:8px 10px; border-bottom:1px solid #d7dbe2; background:#fff; font-size:10px; }
  .gap-fixture__bar span { color:#7c3aed; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.08em; }
  .gap-fixture__bar b { font-size:11px; }
  .gap-fixture__bar i { margin-left:auto; color:#77808f; font-size:9px; }
  .gap-fixture svg { display:block; width:100%; }
  .gap-fixture .canvas { fill:#f7f8fa; }
  .gap-fixture__scene { transform-origin:550px 195px; transition:transform .18s ease; }
  .gap-fixture .block rect { fill:#fff; stroke:#c9ced8; stroke-width:1.2; }
  .gap-fixture .block line { stroke:#d5d9e0; stroke-width:1; }
  .gap-fixture .block circle { fill:#c08520; }
  .gap-fixture .block .data-port { fill:#64748b; }
  .gap-fixture .block text { fill:#252a33; font-size:10px; }
  .gap-fixture .block .type { fill:#7b8492; font-size:8.5px; }
  .gap-fixture .block .title { font:600 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .lane-guide { fill:none; stroke:#e3e6eb; stroke-width:1; stroke-dasharray:2 7; }
  .event-wire, .secondary-event { fill:none; stroke:#7c3aed; stroke-width:2.4; stroke-linecap:butt; }
  .target-wire { filter:drop-shadow(0 0 1.5px rgba(124,58,237,.3)); }
  .data-wire { fill:none; stroke:#657080; stroke-width:1.8; stroke-linecap:round; }
  .context-wire { fill:none; stroke:#657080; stroke-width:1.8; stroke-linecap:round; }
  .secondary-event { opacity:.62; }
  .crossing-wire { stroke:#334155; }
  .crossing-wire.dotted { stroke-dasharray:2 7; stroke-linecap:round; }
  .bundle-cable, .overlap-only { opacity:0; transition:opacity .16s ease; }
  .overlap-halo { fill:none; stroke:#fbbf24; stroke-width:7; opacity:.58; }
  .overlap-wire { fill:none; stroke:#d97706; stroke-width:2.4; }
  .overlap-bracket { fill:none; stroke:#b45309; stroke-width:1; }
  .cross-mark { fill:none; stroke:#ef4444; stroke-width:1.5; stroke-dasharray:2 3; }
  .topology-note, .zoom-label, .route-callout text { fill:#697383; font-size:9px; font-style:italic; }
  .route-callout path { fill:none; stroke:#a7afbb; stroke-width:1; stroke-dasharray:3 4; }
  .route-callout { opacity:.82; }
  .zoom-label { opacity:0; transition:opacity .14s ease; }
  .prototype[data-story-state="bundle"] .bundle-cable { opacity:.82; }
  .prototype[data-story-state="overlap"] .bundle-cable { opacity:.55; }
  .prototype[data-story-state="overlap"] .overlap-only { opacity:1; }
  .prototype[data-story-state="zoom"] .bundle-cable { opacity:.72; }
  .prototype[data-story-state="zoom"] .overlap-only { opacity:.9; }
  .prototype[data-story-state="zoom"] .gap-fixture__scene { transform:scale(.45); }
  .prototype[data-story-state="zoom"] .zoom-label { opacity:1; }
  .gap-state-controls { display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 10px 12px; border-top:1px solid #d7dbe2; background:#fff; }
  .gap-state-controls span { margin-right:5px; color:#77808f; font:650 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em; }
  .gap-state-controls button { min-height:27px; padding:6px 9px; border:1px solid #c9ced8; border-radius:4px; background:#fff; color:#4e5662; font:650 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .prototype[data-story-state="long"] [data-story-to="long"],
  .prototype[data-story-state="bundle"] [data-story-to="bundle"],
  .prototype[data-story-state="overlap"] [data-story-to="overlap"],
  .prototype[data-story-state="zoom"] [data-story-to="zoom"] { border-color:#7c3aed; background:#f2edff; color:#5b21b6; }

  .fingerprint { min-height:134px; padding:16px; background:#fbfbfc; }
  .fingerprint svg { display:block; width:100%; border:1px solid #dde1e7; border-radius:4px; background:#fff; }
  .fingerprint-base { fill:none; stroke:#e6e8ed; stroke-width:7; }
  .fingerprint-wire { fill:none; stroke:#474d57; stroke-width:2.2; stroke-linecap:butt; }
  .fingerprint > div { display:flex; gap:10px; align-items:baseline; padding-top:9px; color:#737b87; font-size:9px; }
  .fingerprint b { color:#303642; }
  .fingerprint code { margin-left:auto; color:#5b21b6; font:700 8.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  @media(max-width:760px) {
    .feedback-lock__head { display:block; }
    .feedback-lock__head p { margin-top:10px; }
    .feedback-lock__compare { grid-template-columns:1fr; }
    .gap-fixture__bar i, .gap-state-controls span { display:none; }
  }
"""


def feedback_html() -> str:
    return """
      <section class="feedback-lock" aria-labelledby="feedback-heading">
        <div class="feedback-lock__head">
          <div><div class="eyebrow">Feedback incorporated</div><h2 id="feedback-heading">Invert the mark: gaps are the packets.</h2></div>
          <p>The first Burst Cadence made silence the dominant shape. That signalled intermittence, but the route fragmented. This pass holds a continuous carrier and cuts tiny, irregular Morse-like gaps into it. Every card now includes the requested long route, eight-cable bundle, two crossings, partial overlap, and 45% board view. <a href="async-edge-styles-2026-09-02.html">Return to the five-family study and tldraw implementation path.</a></p>
        </div>
        <div class="feedback-lock__compare">
          <figure><svg viewBox="0 0 420 44"><path class="before" d="M14 22 H406"/></svg><figcaption><b>Before.</b> Large 34px silence; strong intermittence, weak eye tracking.</figcaption></figure>
          <figure><svg viewBox="0 0 420 44"><path class="after" d="M14 22 H406"/></svg><figcaption><b>Now.</b> 93% carrier; 4–9px gaps are the symbolic packages.</figcaption></figure>
        </div>
      </section>
    """


def build() -> str:
    gallery = load_gallery_module()
    rendered = gallery.embed_project(SHELL.read_text(encoding="utf-8"), PROJECT)
    rendered = rendered.replace("</head>", f"<style>{CUSTOM_CSS}</style></head>", 1)
    variants_heading = '    <section aria-labelledby="variants-heading">'
    rendered = rendered.replace(variants_heading, feedback_html() + "\n" + variants_heading, 1)
    rendered = rendered.replace(
        "</body>",
        f'<!-- Built by docs/build_async_gap_cadences.py at {html.escape(GIT_HEAD)}; paint prototypes only, no product code changed. --></body>',
        1,
    )
    return rendered


def main() -> None:
    rendered = build()
    OUTPUT.write_text(
        "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n",
        encoding="utf-8",
    )
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
