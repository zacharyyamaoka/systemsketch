#!/usr/bin/env python3
"""Build five interactive async/event cable style directions.

This is a Babble + Prune design artifact, not a production implementation.  The
shared fixture keeps the same SystemSketch blocks, ports, path, colour, and
ordinary data cable while changing only the event cable's visual grammar.
"""

from __future__ import annotations

import base64
import html
import importlib.util
import json
import mimetypes
import subprocess
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
OUTPUT = REPO / "docs" / "async-edge-styles-2026-09-02.html"
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

REFERENCE_IMAGES = [
    Path("/home/bam/zach_brain/Pasted image 20260902124012.png"),
    Path("/home/bam/zach_brain/Pasted image 20260902135034.png"),
    Path("/home/bam/zach_brain/Pasted image 20260902135058.png"),
]


def load_gallery_module():
    spec = importlib.util.spec_from_file_location("babble_gallery", GALLERY_MODULE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load Babble gallery builder: {GALLERY_MODULE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def block_svg(x: int, title: str, side: str) -> str:
    if side == "source":
        rows = (
            '<text x="184" y="102" text-anchor="end">detected</text>'
            '<text class="type" x="184" y="116" text-anchor="end">Event[Item]</text>'
            '<circle cx="202" cy="108" r="5"/>'
            '<text x="184" y="139" text-anchor="end">snapshot</text>'
            '<text class="type" x="184" y="153" text-anchor="end">Pose</text>'
            '<circle cx="202" cy="145" r="5"/>'
        )
    else:
        rows = (
            '<circle cx="0" cy="108" r="5"/>'
            '<text x="18" y="102">trigger</text>'
            '<text class="type" x="18" y="116">Event[Item]</text>'
            '<circle cx="0" cy="145" r="5"/>'
            '<text x="18" y="139">pose</text>'
            '<text class="type" x="18" y="153">Pose</text>'
        )
    return f"""
      <g class="block" transform="translate({x} 0)">
        <rect x="0" y="42" width="202" height="126" rx="7"/>
        <line x1="0" y1="78" x2="202" y2="78"/>
        <text class="title" x="12" y="66">{title}</text>
        {rows}
      </g>
    """


def event_art(variant: str) -> str:
    if variant == "v1":
        return """
          <path class="event-edge cadence" d="M234 108 H466"/>
          <g class="event-one"><path class="event-hot" d="M327 108 H369"/></g>
          <g class="event-burst">
            <path class="event-hot" d="M252 108 H286"/>
            <path class="event-hot" d="M326 108 H365"/>
            <path class="event-hot" d="M405 108 H443"/>
          </g>
          <path class="event-head" d="M456 103 L466 108 L456 113 Z"/>
        """
    if variant == "v2":
        packets = [(241, 25), (278, 8), (298, 19), (335, 31), (381, 10), (407, 24), (445, 13)]
        packet_svg = "".join(
            f'<rect class="packet p{i + 1}" x="{x}" y="104" width="{w}" height="8" rx="4"/>'
            for i, (x, w) in enumerate(packets)
        )
        return f"""
          <g class="packet-train">{packet_svg}</g>
          <g class="event-one"><rect class="packet-hot" x="335" y="102" width="31" height="12" rx="6"/></g>
          <g class="event-burst">
            <rect class="packet-hot" x="278" y="102" width="39" height="12" rx="6"/>
            <rect class="packet-hot" x="381" y="102" width="50" height="12" rx="6"/>
          </g>
          <path class="event-head" d="M456 103 L466 108 L456 113 Z"/>
        """
    if variant == "v3":
        return """
          <path class="carrier" d="M234 108 H466"/>
          <g class="stations">
            <circle cx="286" cy="108" r="3.5"/><circle cx="350" cy="108" r="3.5"/><circle cx="414" cy="108" r="3.5"/>
          </g>
          <g class="event-one"><circle class="traveller t1" cx="244" cy="108" r="6"/></g>
          <g class="event-burst">
            <circle class="traveller t1" cx="244" cy="108" r="5"/>
            <circle class="traveller t2" cx="244" cy="108" r="5"/>
            <circle class="traveller t3" cx="244" cy="108" r="5"/>
          </g>
          <path class="event-head" d="M456 103 L466 108 L456 113 Z"/>
        """
    if variant == "v4":
        return """
          <path class="duty-edge" d="M234 108 H258 V96 H288 V108 H326 V96 H338 V108 H386 V96 H430 V108 H466"/>
          <g class="event-one"><path class="event-hot" d="M326 108 V96 H338 V108"/></g>
          <g class="event-burst">
            <path class="event-hot" d="M258 108 V96 H288 V108"/>
            <path class="event-hot" d="M326 108 V96 H338 V108"/>
            <path class="event-hot" d="M386 108 V96 H430 V108"/>
          </g>
          <path class="event-head" d="M456 103 L466 108 L456 113 Z"/>
        """
    return """
      <path class="queue-lead" d="M234 108 H326 M374 108 H466"/>
      <rect class="queue-pocket" x="326" y="95" width="48" height="26" rx="13"/>
      <circle class="queue-token q1" cx="338" cy="108" r="4"/>
      <circle class="queue-token q2" cx="350" cy="108" r="4"/>
      <circle class="queue-token q3" cx="362" cy="108" r="4"/>
      <g class="event-one"><circle class="queue-fill" cx="338" cy="108" r="4"/></g>
      <g class="event-burst">
        <circle class="queue-fill" cx="338" cy="108" r="4"/>
        <circle class="queue-fill" cx="350" cy="108" r="4"/>
        <circle class="queue-fill" cx="362" cy="108" r="4"/>
      </g>
      <path class="event-head" d="M456 103 L466 108 L456 113 Z"/>
    """


def preview(variant: str, name: str) -> str:
    return f"""
      <div class="edge-lab edge-lab--{variant}">
        <div class="edge-lab__bar"><span>STATIC SOURCE VIEW</span><b>{name}</b><i>same path · same ports</i></div>
        <svg viewBox="0 0 700 232" role="img" aria-label="{name} on the shared SystemSketch event cable fixture">
          <rect class="canvas" width="700" height="232"/>
          {block_svg(32, 'watch_items()', 'source')}
          {block_svg(466, 'dispatch_pick()', 'sink')}
          <path class="data-edge" d="M234 145 H466"/>
          <path class="data-head" d="M456 140 L466 145 L456 150 Z"/>
          {event_art(variant)}
          <text class="edge-note" x="350" y="188" text-anchor="middle">solid data remains the quiet baseline</text>
          <line class="edge-note-rule" x1="286" y1="198" x2="414" y2="198"/>
        </svg>
        <div class="edge-state-controls" aria-label="Illustrative event states">
          <span>try the same edge</span>
          <button type="button" data-story-to="idle">Idle</button>
          <button type="button" data-story-to="one">1 event</button>
          <button type="button" data-story-to="burst">Burst ×3</button>
        </div>
      </div>
    """


def sample_art(variant: str) -> str:
    if variant == "v1":
        return '<path class="event-edge cadence" d="M10 18 H190"/><path class="event-head" d="M184 14 L192 18 L184 22 Z"/>'
    if variant == "v2":
        pieces = [(14, 24), (47, 7), (63, 18), (93, 28), (133, 9), (151, 23), (181, 8)]
        return "".join(f'<rect class="packet" x="{x}" y="14" width="{w}" height="8" rx="4"/>' for x, w in pieces)
    if variant == "v3":
        return '<path class="carrier" d="M10 18 H190"/><g class="stations"><circle cx="55" cy="18" r="3"/><circle cx="100" cy="18" r="3"/><circle cx="145" cy="18" r="3"/></g>'
    if variant == "v4":
        return '<path class="duty-edge" d="M10 18 H34 V8 H58 V18 H86 V8 H98 V18 H132 V8 H166 V18 H190"/>'
    return '<path class="queue-lead" d="M10 18 H78 M122 18 H190"/><rect class="queue-pocket" x="78" y="7" width="44" height="22" rx="11"/><circle class="queue-token" cx="90" cy="18" r="3.5"/><circle class="queue-token" cx="100" cy="18" r="3.5"/><circle class="queue-token" cx="110" cy="18" r="3.5"/>'


def zoom_media(variant: str) -> str:
    art = sample_art(variant)
    return f"""
      <div class="zoom-proof edge-lab--{variant}">
        <div><b>100%</b><svg viewBox="0 0 200 36" aria-label="edge at full canvas scale">{art}</svg></div>
        <div class="zoom-proof__small"><b>45%</b><svg viewBox="0 0 200 36" aria-label="edge at reduced canvas scale">{art}</svg></div>
      </div>
    """


REQUIREMENTS = [
    {
        "id": "fr1",
        "name": "Intermittent at a glance",
        "weight": 30,
        "why": "The new mark exists to make a discrete event rail feel unlike a continuously present value.",
        "passCondition": "With the animation stopped and no legend, the event cable visibly contains bursts, gaps, or discrete units.",
        "anchors": {
            "1": "Looks continuous or differs only by colour.",
            "3": "Looks special, but intermittence needs explanation.",
            "5": "Unequal activity and silence read immediately from the cable itself.",
        },
    },
    {
        "id": "fr2",
        "name": "Route stays traceable",
        "weight": 20,
        "why": "SystemSketch is still a wiring surface; a styled cable must remain easy to follow across a busy board.",
        "passCondition": "The eye can follow source to sink through the complete route without reconstructing missing spans.",
        "anchors": {
            "1": "The marks read as unrelated debris.",
            "3": "Traceable on an isolated rail but fragile near crossings.",
            "5": "The full route remains one obvious connection at normal and reduced scale.",
        },
    },
    {
        "id": "fr3",
        "name": "Honest without telemetry",
        "weight": 20,
        "why": "The source view knows the delivery contract, not when real events occurred or how long they lasted.",
        "passCondition": "The resting style denotes discrete delivery without fabricating runtime timing, rate, occupancy, or duration.",
        "anchors": {
            "1": "Looks like measured runtime history the file does not possess.",
            "3": "Mostly symbolic, with a plausible timing or occupancy overread.",
            "5": "Clearly categorical; it claims no runtime facts.",
        },
    },
    {
        "id": "fr4",
        "name": "Distinct edge vocabulary",
        "weight": 15,
        "why": "Solid data and dotted z⁻¹ delay already have jobs; this mark needs its own monochrome silhouette.",
        "passCondition": "The edge remains distinguishable from solid data and dotted delayed cables without relying on purple.",
        "anchors": {
            "1": "Collides with an existing line style.",
            "3": "Distinct at full scale but merges with another kind when zoomed out.",
            "5": "Has a unique cadence or object grammar in colour and monochrome.",
        },
    },
    {
        "id": "fr5",
        "name": "Low-cost stock seam",
        "weight": 15,
        "why": "The design must ride the existing Connection shape and stock tldraw interaction rather than create a second router.",
        "passCondition": "The current path can paint the mark/export it while tldraw keeps selection, handles, routing, hit testing, and z-order.",
        "anchors": {
            "1": "Needs a second geometry or interaction system.",
            "3": "Fits the custom Connection component but needs sampled-path adornments or bespoke export work.",
            "5": "A path stroke/style change with no new authored geometry.",
        },
    },
]

HARD_GATES = [
    {
        "id": "g1",
        "name": "Readable when motion stops",
        "why": "Saved boards, screenshots, reduced-motion mode, and SVG export must retain the edge kind.",
    },
    {
        "id": "g2",
        "name": "No invented runtime facts",
        "why": "A static source projection may show Event[T], but not event times or durations it never observed.",
    },
    {
        "id": "g3",
        "name": "Existing route remains authoritative",
        "why": "Every direction must decorate the current straight, curved, or elbow path; none may fork tldraw or add a second router.",
    },
]


def score(score: int, evidence: str, confidence: str = "high") -> dict:
    return {"score": score, "evidence": evidence, "confidence": confidence}


def gates(g2: bool = True, g2_evidence: str = "The resting mark is categorical and carries no timestamp, rate, or duration.") -> dict:
    return {
        "g1": {"pass": True, "evidence": "The idle prototype and reduced-scale specimen preserve the edge kind without animation."},
        "g2": {"pass": g2, "evidence": g2_evidence},
        "g3": {"pass": True, "evidence": "The marks are painted on or sampled from the same source-to-sink path; ports and routing do not change."},
    }


STORY = {
    "title": "Read the edge at rest, then exercise it",
    "steps": [
        {
            "label": "Read the idle source view",
            "caption": "The edge kind must survive with no runtime animation at all.",
            "state": "idle",
            "target": "[data-story-to='idle']",
        },
        {
            "label": "Show one illustrative event",
            "caption": "A live lens may accent one discrete delivery without changing the stored edge style.",
            "state": "one",
            "target": "[data-story-to='one']",
        },
        {
            "label": "Show an illustrative burst",
            "caption": "Three arrivals test whether repeated activity stays readable instead of becoming a solid wire.",
            "state": "burst",
            "target": "[data-story-to='burst']",
        },
    ],
}

VARIANTS = [
    {
        "id": "v1",
        "name": "Burst Cadence",
        "thesis": "Unequal dash clusters and long silences make intermittence a property of the resting line itself—the closest rendering of your sketches.",
        "accent": "#7c3aed",
        "bestWhen": "The normal source/design view is primary and the cable should stay extremely light.",
        "losesWhen": "The literal large-silence version shown here breaks eye tracking. Keep the family, but invert it into a mostly continuous carrier with micro-gaps.",
        "decisions": [
            {"label": "Mental model", "value": "radio transmission: burst, silence, burst"},
            {"label": "Stored meaning", "value": "one event-line style; no runtime samples"},
            {"label": "Motion", "value": "optional glow only; the static cadence does the semantic work"},
        ],
        "keepParts": ["unequal cluster rhythm", "long silent gap", "optional burst glow"],
        "proof": [
            "The idle hero uses a repeating 30–4–12 cluster separated by a 34 px silence—the exact large-gap execution Zach flagged as too hard to follow.",
            "The reduced-scale specimen keeps visible long/short rhythm instead of collapsing into dots.",
            "Idle, one-event, and burst controls drive the same state machine as the guided story.",
        ],
        "scores": {
            "fr1": score(5, "The stopped line visibly alternates unequal clusters with long empty spans."),
            "fr2": score(3, "User review found the 34 px silences interrupt eye tracking; the follow-up study inverts the mark into small gaps on a continuous carrier."),
            "fr3": score(5, "Dash rhythm denotes the edge category and contains no clock, count, or queue state."),
            "fr4": score(5, "Long/short clusters remain unlike the solid data line and the evenly dotted z⁻¹ line."),
            "fr5": score(3, "It is one SVG path and keeps stock interaction, but needs a custom dash array plus matching export paint."),
        },
        "gateResults": gates(),
        "previewLabel": "interactive SystemSketch fixture",
        "story": STORY,
        "media": [{"label": "Scale check", "caption": "Unequal cadence remains the distinguishing channel when purple and motion are unavailable.", "html": zoom_media("v1")}],
        "preview": preview("v1", "burst cadence"),
    },
    {
        "id": "v2",
        "name": "Packet Capsules",
        "thesis": "Turn the rail into separated rounded packets, so the cable reads as discrete messages rather than a continuous value.",
        "accent": "#6d28d9",
        "bestWhen": "Obvious discreteness matters more than keeping the wire visually conventional.",
        "losesWhen": "The board is dense; capsules become heavier than a stroke and need sampled-path placement on curves and elbows.",
        "decisions": [
            {"label": "Mental model", "value": "messages in flight"},
            {"label": "Stored meaning", "value": "a repeated packet glyph, not a measured packet count"},
            {"label": "Motion", "value": "fills may advance in Run view; outlines survive at rest"},
        ],
        "keepParts": ["rounded message unit", "unequal packet sizes", "outline-to-fill live state"],
        "proof": [
            "The hero replaces the path stroke with seven individually legible rounded fragments.",
            "The one/burst states change fill emphasis while idle outlines keep the semantic category.",
            "The 45% specimen exposes the density limit rather than hiding it.",
        ],
        "scores": {
            "fr1": score(5, "Separated capsules are unmistakably discrete even with the state set to idle."),
            "fr2": score(4, "A regular centreline and arrow preserve direction, though large gaps weaken tracing near crossings."),
            "fr3": score(4, "The units are symbolic, but their drawn number can be overread as a packet count.", "medium"),
            "fr4": score(5, "Capsules have a unique silhouette against both ordinary dash and dot vocabularies."),
            "fr5": score(3, "The Connection component can sample and place capsules, but curves/export need more than one stroke attribute."),
        },
        "gateResults": gates(),
        "previewLabel": "interactive SystemSketch fixture",
        "story": STORY,
        "media": [{"label": "Scale check", "caption": "Capsules remain discrete, but the reduced specimen shows their higher visual weight.", "html": zoom_media("v2")}],
        "preview": preview("v2", "packet capsules"),
    },
    {
        "id": "v3",
        "name": "Pulse on Carrier",
        "thesis": "Keep a faint route for navigation and let hollow stations plus optional travelling comets express discrete delivery.",
        "accent": "#8b5cf6",
        "bestWhen": "SystemSketch gains a real Run lens and live event arrivals are available to animate honestly.",
        "losesWhen": "The design is judged mostly from static boards; the strongest part of the idea is motion.",
        "decisions": [
            {"label": "Mental model", "value": "an event pulse travelling over a quiet channel"},
            {"label": "Stored meaning", "value": "faint carrier plus hollow event stations"},
            {"label": "Motion", "value": "primary in Run view, illustrative only in this mock"},
        ],
        "keepParts": ["quiet carrier", "travelling comet", "reduced-motion hollow stations"],
        "proof": [
            "The idle state still contains three hollow stations, satisfying screenshots and export.",
            "The one/burst states visibly travel along the unchanged route in motion-capable browsers.",
            "Reduced-motion CSS stops the comets and leaves their positions legible.",
        ],
        "scores": {
            "fr1": score(5, "Moving comets make individual arrivals unmistakable; hollow stations keep a weaker static cue."),
            "fr2": score(5, "The faint full-length carrier is always traceable through crossings and empty spans."),
            "fr3": score(3, "The static style is categorical, but animated comets are only honest once wired to real Run data.", "medium"),
            "fr4": score(4, "Carrier plus rings differs from solid and dotted edges, though rings shrink at far zoom."),
            "fr5": score(3, "The carrier is trivial; sampled beads and motion/export parity add custom paint work."),
        },
        "gateResults": gates(g2_evidence="The saved idle form claims only an event-capable carrier; the prototype labels motion illustrative until real Run data exists."),
        "previewLabel": "interactive SystemSketch fixture",
        "story": STORY,
        "media": [{"label": "Scale check", "caption": "The quiet carrier protects route tracing while hollow stations carry the static meaning.", "html": zoom_media("v3")}],
        "preview": preview("v3", "pulse on carrier"),
    },
    {
        "id": "v4",
        "name": "Duty Windows",
        "thesis": "Draw the cable as high/low activity windows, borrowing the immediate temporal read of a digital timing diagram.",
        "accent": "#9333ea",
        "bestWhen": "A real trace view owns measured on/off timing and the rail is literally a time series.",
        "losesWhen": "Used in the static source view: plateau width and spacing look like measured duration and cadence that do not exist.",
        "decisions": [
            {"label": "Mental model", "value": "digital timing waveform"},
            {"label": "Stored meaning", "value": "high/low windows painted directly into the route"},
            {"label": "Motion", "value": "highlighted windows, not travelling objects"},
        ],
        "keepParts": ["high/low temporal silhouette", "window highlight", "timing-lens candidate"],
        "proof": [
            "The stepped rail reads immediately as intermittent activity.",
            "The same strength creates the hard-gate failure: drawn widths imply timing and duration.",
            "Curved or elbow paths would require tangent-normal waveform geometry rather than a dash style.",
        ],
        "scores": {
            "fr1": score(5, "High/low windows are the most literal stopped-picture representation of intermittence."),
            "fr2": score(4, "The route is continuous, but vertical steps can be mistaken for authored bends."),
            "fr3": score(1, "Window widths and gaps inevitably imply timing or duty cycle the source view does not know."),
            "fr4": score(4, "Its stepped silhouette is unique, though it competes with elbow routing geometry."),
            "fr5": score(2, "Painting a waveform along arbitrary curved and elbow routes requires bespoke sampled geometry and export logic."),
        },
        "gateResults": gates(False, "Fail: the static waveform fabricates apparent event duration and cadence. Reserve this direction for a measured Run/trace lens."),
        "previewLabel": "interactive SystemSketch fixture",
        "story": STORY,
        "media": [{"label": "Scale check", "caption": "A clear temporal silhouette, but one that looks like measured data rather than a categorical source edge.", "html": zoom_media("v4")}],
        "preview": preview("v4", "duty windows"),
    },
    {
        "id": "v5",
        "name": "Queue Pocket",
        "thesis": "Interrupt the broken rail with a tiny retained-message pocket, making the Event[T] must-not-drop contract visible.",
        "accent": "#7e22ce",
        "bestWhen": "The important distinction is reliable queued events versus latest-value-wins signals.",
        "losesWhen": "Async only means suspension or background work; the pocket would overclaim buffering semantics and add cable chrome.",
        "decisions": [
            {"label": "Mental model", "value": "a mailbox retaining discrete messages"},
            {"label": "Stored meaning", "value": "queue contract, not current occupancy"},
            {"label": "Motion", "value": "fill one or three symbolic slots; pocket remains when idle"},
        ],
        "keepParts": ["mid-edge queue pocket", "hollow retained-message slots", "must-not-drop cue"],
        "proof": [
            "The idle rail remains broken and the hollow pocket survives without motion.",
            "The state controls test one versus several messages without changing route geometry.",
            "The specimen makes the added visual chrome and semantic specificity visible.",
        ],
        "scores": {
            "fr1": score(4, "Broken leads plus separated slots read as discrete, though the pocket dominates the intermittence."),
            "fr2": score(3, "The pocket bridges the route semantically, but it is another object to navigate around at crossings."),
            "fr3": score(4, "Hollow slots denote the queue contract; live fills must not be used as occupancy without runtime evidence.", "medium"),
            "fr4": score(5, "The pocket is unmistakable beside solid data and dotted z⁻¹ delay."),
            "fr5": score(3, "It can ride a sampled point on the Connection path, but adds adornment geometry, hit/export choices, and collision cost."),
        },
        "gateResults": gates(g2_evidence="The idle pocket denotes a must-not-drop Event[T] contract, not current queue occupancy; filled examples are explicitly illustrative."),
        "previewLabel": "interactive SystemSketch fixture",
        "story": STORY,
        "media": [{"label": "Scale check", "caption": "The queue contract stays legible, while the pocket's extra chrome is easy to judge honestly.", "html": zoom_media("v5")}],
        "preview": preview("v5", "queue pocket"),
    },
]

PROJECT = {
    "schemaVersion": 3,
    "title": "Five ways to make an event cable feel intermittent",
    "kicker": "SystemSketch · async/event edge artwork · Babble 5",
    "brief": "Replace the constant-looking Aug 25 purple event rail with a quiet, unmistakably intermittent edge style. Every direction uses the same watch_items() → dispatch_pick() fixture, ordinary solid data baseline, endpoints, colour, and three illustrative states. Scope assumption: the style denotes discrete Event[T] delivery—not every function that happens to use await.",
    "count": 5,
    "defaultId": "v1",
    "defaultWhy": "Burst Cadence remains the preferred family at 86.0/100 after user review, tied with Packet Capsules but lighter to implement. Its first large-silence execution is superseded: the follow-up 10-way study keeps a continuous carrier and makes each symbolic package a small, irregular gap.",
    "decisionHinge": "The updated recommendation assumes the normal source/design board is primary and route continuity outranks dramatic silence. If a measured Run lens becomes primary and supplies real arrival timestamps, Pulse on Carrier becomes stronger; if static source view remains primary, use a gap-coded Burst Cadence refinement.",
    "invariants": [
        "The same watch_items() → dispatch_pick() event fixture and solid Pose data cable appear in every direction.",
        "Purple remains only a redundant event colour; every direction must work in monochrome.",
        "Routing, port positions, hit testing, selection, and z-order stay owned by the existing Connection shape and stock tldraw.",
        "Idle is the canonical source-board state; one-event and burst states are illustrative interaction, not observed telemetry.",
    ],
    "boundary": "Standalone interactive SVG prototypes plus a version-checked tldraw 5.3.2 implementation spike. The three states, guided stories, route/style lab, scale specimens, and prune controls are real; no Connection code, file schema, analyzer, runtime telemetry, or app behavior changed.",
    "axes": [
        {"name": "Static metaphor", "values": ["radio cadence", "packets", "carrier pulses", "timing windows", "queue"]},
        {"name": "Primary mark", "values": ["dash rhythm", "capsules", "moving beads", "path geometry", "mid-edge pocket"]},
        {"name": "Runtime dependence", "values": ["none", "optional fill", "motion-first", "measured-only", "occupancy-capable"]},
        {"name": "Visual weight", "values": ["stroke", "fragments", "hairline + beads", "waveform", "adornment"]},
    ],
    "requirements": REQUIREMENTS,
    "hardGates": HARD_GATES,
    "variants": VARIANTS,
    "checks": [
        "Exactly five distinct edge grammars",
        "Same fixture and viewport",
        "Idle / one / burst direct controls and guided story",
        "Static 100% / 45% comparison",
        "Every score carries evidence and confidence",
        "Straight, curved, and elbow paths share one switchable stroke painter",
        "Pick, shortlist, reject, splice, copy, and download",
    ],
}

CUSTOM_CSS = r"""
  .source-reference { margin: 34px 0 8px; padding: 18px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--panel); }
  .source-reference__head { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:14px; }
  .source-reference__head h2 { margin:2px 0 0; font:500 22px/1.05 var(--serif); }
  .source-reference__head p { max-width:690px; margin:0; color:var(--muted); font-size:12px; }
  .source-reference__grid { display:grid; grid-template-columns:2fr 1fr 1fr; gap:10px; }
  .source-reference figure { margin:0; overflow:hidden; border:1px solid var(--line); border-radius:5px; background:#fff; }
  .source-reference img { display:block; width:100%; height:126px; object-fit:contain; padding:10px; background:#fff; }
  .source-reference figcaption { padding:8px 10px; border-top:1px solid var(--line); color:var(--muted); font-size:10px; }
  .source-reference figcaption b { color:var(--ink); }
  .source-reference a { color:#5b45aa; }
  .ai-handoff { margin-top:12px; padding:11px 12px; border-left:3px solid #7c3aed; background:#f4f0ff; color:#514b5d; font-size:10px; line-height:1.5; }
  .ai-handoff b { color:#332a48; }
  .ai-handoff a { color:#5b21b6; }

  .implementation { margin:34px 0 124px; padding:20px; border:1px solid var(--line-strong); border-radius:7px; background:var(--panel); }
  .implementation__head { display:flex; align-items:end; justify-content:space-between; gap:22px; margin-bottom:16px; }
  .implementation__head h2 { margin:2px 0 0; font:500 25px/1.05 var(--serif); }
  .implementation__head p { max-width:660px; margin:0; color:var(--muted); font-size:12px; }
  .implementation__verdict { display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:10px; margin:0 0 16px; }
  .implementation__verdict article { min-height:116px; padding:14px; border:1px solid var(--line); border-radius:5px; background:#fff; }
  .implementation__verdict article:first-child { border-color:#8b74d6; box-shadow:inset 3px 0 #7c3aed; }
  .implementation__verdict small { display:block; margin-bottom:7px; color:#7460bb; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.07em; text-transform:uppercase; }
  .implementation__verdict b { display:block; margin-bottom:6px; font-size:12px; }
  .implementation__verdict p { margin:0; color:var(--muted); font-size:10.5px; line-height:1.48; }
  .implementation-lab { overflow:hidden; border:1px solid var(--line-strong); border-radius:6px; background:#f7f8fa; }
  .implementation-lab__bar { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); background:#fff; }
  .implementation-lab__bar span { margin-right:auto; color:#596273; font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .implementation-lab__bar button { min-height:28px; padding:6px 9px; border:1px solid #c9ced8; border-radius:4px; background:#fff; color:#4e5662; font:650 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .implementation-lab__bar button[aria-pressed="true"] { border-color:#7c3aed; background:#f2edff; color:#5b21b6; }
  .implementation-lab svg { display:block; width:100%; min-height:244px; }
  .impl-route-label { fill:#727b89; font:700 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.05em; text-transform:uppercase; }
  .impl-guide { fill:none; stroke:#d7dbe2; stroke-width:8; opacity:.55; }
  .impl-wire { fill:none; stroke:#7c3aed; stroke-width:2.2; stroke-linecap:butt; stroke-linejoin:round; transition:stroke-dasharray .18s ease; }
  .impl-port { fill:#c08520; }
  .implementation-lab__readout { display:flex; gap:12px; align-items:baseline; padding:10px 12px; border-top:1px solid var(--line); background:#fff; color:#596273; font-size:10px; }
  .implementation-lab__readout code { color:#5b21b6; font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .implementation__flow { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:16px 0; }
  .implementation__flow article { position:relative; padding:13px; border:1px solid var(--line); border-radius:5px; background:#fff; }
  .implementation__flow article:not(:last-child)::after { content:'\2192'; position:absolute; right:-9px; top:50%; z-index:2; width:18px; height:18px; margin-top:-9px; border:1px solid var(--line); border-radius:50%; background:var(--panel); color:#7c3aed; text-align:center; font:700 11px/16px ui-monospace,monospace; }
  .implementation__flow b { display:block; margin-bottom:5px; font-size:10.5px; }
  .implementation__flow p { margin:0; color:var(--muted); font-size:9.5px; line-height:1.45; }
  .implementation__grid { display:grid; grid-template-columns:1.08fr .92fr; gap:12px; }
  .implementation__card { padding:15px; border:1px solid var(--line); border-radius:5px; background:#fff; }
  .implementation__card h3 { margin:0 0 5px; font:500 18px/1.1 var(--serif); }
  .implementation__card > p { margin:0 0 11px; color:var(--muted); font-size:10.5px; line-height:1.5; }
  .implementation pre { overflow:auto; margin:0; padding:12px; border:1px solid #d8dce4; border-radius:4px; background:#f7f8fa; color:#303744; font:9.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; tab-size:2; }
  .implementation table { width:100%; border-collapse:collapse; font-size:9.5px; }
  .implementation th, .implementation td { padding:8px 7px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
  .implementation th { color:#737b87; font:700 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.05em; }
  .implementation td:first-child { font-weight:700; white-space:nowrap; }
  .implementation .fit-low { color:#187448; }
  .implementation .fit-mid { color:#9a6500; }
  .implementation .fit-high { color:#a33c32; }
  .implementation__sources { margin:14px 0 0; padding-top:12px; border-top:1px solid var(--line); color:var(--muted); font-size:9.5px; line-height:1.55; }
  .implementation__sources a { color:#5b45aa; }

  .prototype-frame, .prototype { min-height: 376px; }
  .edge-lab { min-height:376px; background:#f7f8fa; color:#20242c; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }
  .edge-lab__bar { display:flex; align-items:center; gap:10px; min-height:34px; padding:8px 10px; border-bottom:1px solid #d7dbe2; background:#fff; font-size:10px; }
  .edge-lab__bar span { color:#7c3aed; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.08em; }
  .edge-lab__bar b { font-size:11px; }
  .edge-lab__bar i { margin-left:auto; color:#77808f; font-size:9px; }
  .edge-lab svg { display:block; width:100%; height:auto; }
  .edge-lab .canvas { fill:#f7f8fa; }
  .edge-lab .block rect { fill:#fff; stroke:#c9ced8; stroke-width:1.2; }
  .edge-lab .block line { stroke:#d5d9e0; stroke-width:1; }
  .edge-lab .block circle { fill:#c08520; stroke:#c08520; }
  .edge-lab .block text { fill:#252a33; font-size:10px; }
  .edge-lab .block .type { fill:#7b8492; font-size:8.5px; }
  .edge-lab .block .title { font:500 15px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .data-edge { fill:none; stroke:#657080; stroke-width:1.8; stroke-linecap:round; }
  .data-head { fill:#657080; }
  .event-edge, .carrier, .duty-edge, .queue-lead { fill:none; stroke:#7c3aed; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
  .event-head { fill:#7c3aed; }
  .cadence { stroke-dasharray:30 7 4 8 12 34; }
  .event-hot { fill:none; stroke:#a78bfa; stroke-width:6; stroke-linecap:round; filter:drop-shadow(0 0 4px rgba(124,58,237,.45)); }
  .packet { fill:#7c3aed; }
  .packet-hot, .queue-fill, .traveller { fill:#a78bfa; filter:drop-shadow(0 0 4px rgba(124,58,237,.55)); }
  .carrier { stroke-width:1.3; opacity:.35; }
  .stations circle { fill:#f7f8fa; stroke:#7c3aed; stroke-width:1.7; }
  .traveller { transform-box:fill-box; transform-origin:center; animation:event-travel 1.45s linear infinite; }
  .traveller.t2 { animation-delay:-.48s; }
  .traveller.t3 { animation-delay:-.96s; }
  @keyframes event-travel { from { transform:translateX(0); opacity:.3; } 14% { opacity:1; } 86% { opacity:1; } to { transform:translateX(206px); opacity:.3; } }
  .duty-edge { stroke-width:2; }
  .queue-lead { stroke-dasharray:20 7 4 10; }
  .queue-pocket { fill:#fff; stroke:#7c3aed; stroke-width:1.6; }
  .queue-token { fill:#fff; stroke:#7c3aed; stroke-width:1.3; }
  .edge-note { fill:#7b8492; font-size:9px; font-style:italic; }
  .edge-note-rule { stroke:#657080; stroke-width:1.3; }
  .event-one, .event-burst { display:none; }
  .prototype[data-story-state="one"] .event-one { display:block; }
  .prototype[data-story-state="burst"] .event-burst { display:block; }
  .edge-state-controls { display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 10px 12px; border-top:1px solid #d7dbe2; background:#fff; }
  .edge-state-controls span { margin-right:5px; color:#77808f; font:650 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em; }
  .edge-state-controls button { min-height:27px; padding:6px 9px; border:1px solid #c9ced8; border-radius:4px; background:#fff; color:#4e5662; font:650 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .prototype[data-story-state="idle"] [data-story-to="idle"],
  .prototype[data-story-state="one"] [data-story-to="one"],
  .prototype[data-story-state="burst"] [data-story-to="burst"] { border-color:#7c3aed; background:#f2edff; color:#5b21b6; }

  .zoom-proof { display:grid; grid-template-columns:1fr 1fr; min-height:138px; padding:18px; gap:16px; align-items:center; background:#fbfbfc; }
  .zoom-proof > div { padding:10px; border:1px solid #dde1e7; border-radius:5px; background:#fff; }
  .zoom-proof b { display:block; margin-bottom:8px; color:#737b87; font:750 8px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .zoom-proof svg { display:block; width:100%; overflow:visible; }
  .zoom-proof__small svg { transform:scale(.55); transform-origin:center; }
  .zoom-proof .cadence { fill:none; stroke:#4b4f57; stroke-width:2.2; stroke-linecap:round; }
  .zoom-proof .event-head, .zoom-proof .packet { fill:#4b4f57; }
  .zoom-proof .carrier { stroke:#4b4f57; }
  .zoom-proof .stations circle { fill:#fff; stroke:#4b4f57; }
  .zoom-proof .duty-edge, .zoom-proof .queue-lead { stroke:#4b4f57; }
  .zoom-proof .queue-pocket, .zoom-proof .queue-token { stroke:#4b4f57; }

  @media (prefers-reduced-motion: reduce) {
    .traveller { animation:none; }
    .edge-lab--v3 .event-one .traveller { transform:translateX(90px); }
    .edge-lab--v3 .event-burst .t1 { transform:translateX(46px); }
    .edge-lab--v3 .event-burst .t2 { transform:translateX(104px); }
    .edge-lab--v3 .event-burst .t3 { transform:translateX(164px); }
  }
  @media(max-width:760px) {
    .source-reference__grid { grid-template-columns:1fr; }
    .source-reference img { height:auto; max-height:160px; }
    .implementation__head { display:block; }
    .implementation__head p { margin-top:10px; }
    .implementation__verdict, .implementation__flow, .implementation__grid { grid-template-columns:1fr; }
    .implementation__flow article::after { display:none; }
    .implementation-lab__bar { flex-wrap:wrap; }
    .implementation-lab__bar span { width:100%; }
    .edge-lab__bar i { display:none; }
    .edge-state-controls span { display:none; }
  }
"""


def source_reference_html() -> str:
    cards = []
    captions = [
        ("Existing vocabulary", "Solid data, regular dashed async/event, dotted next-iteration, teal state."),
        ("Sketch A", "An irregular sequence of short and long marks begins to read as burst traffic."),
        ("Sketch B", "Long packets separated by small ticks and wider silence make the cadence unmistakable."),
    ]
    for path, (title, caption) in zip(REFERENCE_IMAGES, captions):
        cards.append(
            f'<figure><img src="{data_uri(path)}" alt="{title}"><figcaption><b>{title}.</b> {caption}</figcaption></figure>'
        )
    return f"""
      <section class="source-reference" aria-labelledby="source-reference-heading">
        <div class="source-reference__head">
          <div><div class="eyebrow">The three supplied drawings</div><h2 id="source-reference-heading">The visual move is unequal activity + unequal silence.</h2></div>
          <p>The important change is not merely “more dashes.” A metronomic dash still looks like a continuously available wire. The two later sketches introduce clusters, packets, and silence. User review then inverted the cadence to preserve eye tracking: <a href="async-burst-gap-cadences-2026-09-02.html">compare 10 mostly-continuous, gap-coded refinements</a>. <a href="loop-edge-marks-2026-09-02.html">Open the earlier edge-language report.</a></p>
        </div>
        <div class="source-reference__grid">{''.join(cards)}</div>
        <div class="ai-handoff"><b>AI comment · 2 Sep 2026.</b> I turned the three supplied references into this five-family comparison, added a pinned-tldraw-5.3.2 happy-path implementation lab, and then incorporated Zach's route-tracing feedback in <a href="async-burst-gap-cadences-2026-09-02.html">the exact 10-way gap-coded cadence study</a>. The reproducible sources are <a href="build_async_edge_styles.py">the family builder</a> and <a href="build_async_gap_cadences.py">the gap-cadence builder</a>. These are design/implementation spikes; no product cable behavior or schema changed.</div>
      </section>
    """


HAPPY_PATH_CODE = r"""// connectionLinePaint.ts — pure, shared by canvas + export
type ConnectionVisualKind = 'data' | 'event'

const EVENT_CADENCE = '46 4 83 9 61 5 97 4' // V3 Breath Marks

export function connectionLinePaint(kind: ConnectionVisualKind) {
  return {
    strokeDasharray: kind === 'event' ? EVENT_CADENCE : 'none',
    strokeDashoffset: 0,
    // Butt caps keep 4px micro-gaps open; bound port dots cover the endpoints.
    strokeLinecap: kind === 'event' ? 'butt' : 'round',
  }
}

// ConnectionShapeUtil.tsx
const paint = connectionLinePaint(getConnectionVisualKind(editor, connection))

// Use the same attributes in both places.
<path d={path} {...paint} />                 // component()
<path d={getConnectionShapePath(...)} {...paint} /> // toSvg()

// Deliberately unchanged:
getGeometry(connection)      // pointer corridor / hit testing
getIndicatorPath(connection) // selection outline
getHandles(connection)       // stock terminal + route handles"""


STYLE_PROP_CODE = r"""// Only if people may override the inferred Event[T] meaning:
export const ConnectionDeliveryStyle = StyleProp.defineEnum(
  'systemsketch:connectionDelivery',
  { defaultValue: 'data', values: ['data', 'event'] as const },
)

// Then add `delivery` to the Connection props validator/default/migration.
// Do not add `burst` or timestamps: live arrivals are ephemeral Run-lens state."""


def implementation_html() -> str:
    return f"""
      <section class="implementation" id="implementation" aria-labelledby="implementation-heading">
        <div class="implementation__head">
          <div><div class="eyebrow">tldraw 5.3.2 · happy-path spike</div><h2 id="implementation-heading">One path; two paint sites; zero interaction forks.</h2></div>
          <p>The repository already has the right architecture. A custom <code>ConnectionShapeUtil</code> owns the cable path while tldraw owns the shape lifecycle. The async mark can change paint without changing geometry.</p>
        </div>

        <div class="implementation__verdict">
          <article><small>Recommended first slice</small><b>Infer Event[T] → apply gap-coded Breath Marks</b><p>Resolve the semantic kind from the bound port type, then spread one pure paint object into the existing canvas path and <code>toSvg()</code>. The refined mark is a 93% carrier with irregular 4/9/5/4px dropouts.</p></article>
          <article><small>Stock tldraw option</small><b><code>DefaultDashStyle</code> is usable, not automatic</b><p>Its values are <code>draw | solid | dashed | dotted | none</code>. Adding it to custom shape props gives shared-style behavior, but the custom shape must still paint the stroke.</p></article>
          <article><small>Custom cadence detail</small><b>Use native SVG dash grammar</b><p><code>getPerfectDashProps()</code> balances stock dashed/dotted lines. The gap-coded eight-beat rhythm is outside that API, so a direct <code>strokeDasharray</code> is the honest seam.</p></article>
        </div>

        <div class="implementation-lab" aria-label="Line style across the three existing connection routes">
          <div class="implementation-lab__bar">
            <span>same SVG path data · switch paint only</span>
            <button type="button" data-impl-style="solid">Solid data</button>
            <button type="button" data-impl-style="dashed">Stock dashed</button>
            <button type="button" data-impl-style="dotted">Stock dotted</button>
            <button type="button" data-impl-style="burst" aria-pressed="true">Gap-coded event</button>
          </div>
          <svg viewBox="0 0 760 246" role="img" aria-label="Solid, dashed, dotted, and burst paint tested on straight, curved, and elbow paths">
            <text class="impl-route-label" x="28" y="51">straight</text>
            <path class="impl-guide" d="M148 47 H712"/><path class="impl-wire" data-impl-wire d="M148 47 H712"/>
            <circle class="impl-port" cx="148" cy="47" r="4.5"/><circle class="impl-port" cx="712" cy="47" r="4.5"/>
            <text class="impl-route-label" x="28" y="125">curved</text>
            <path class="impl-guide" d="M148 121 C310 70 548 172 712 121"/><path class="impl-wire" data-impl-wire d="M148 121 C310 70 548 172 712 121"/>
            <circle class="impl-port" cx="148" cy="121" r="4.5"/><circle class="impl-port" cx="712" cy="121" r="4.5"/>
            <text class="impl-route-label" x="28" y="199">elbow</text>
            <path class="impl-guide" d="M148 195 H292 V169 H574 V195 H712"/><path class="impl-wire" data-impl-wire d="M148 195 H292 V169 H574 V195 H712"/>
            <circle class="impl-port" cx="148" cy="195" r="4.5"/><circle class="impl-port" cx="712" cy="195" r="4.5"/>
          </svg>
          <div class="implementation-lab__readout"><code id="impl-style-value">strokeDasharray="46 4 83 9 61 5 97 4"</code><span id="impl-style-note">93% carrier; irregular micro-gaps follow every current route.</span></div>
        </div>

        <div class="implementation__flow" aria-label="Happy path implementation flow">
          <article><b>1 · Classify</b><p>Derive <code>event</code> from the bound port's semantic <code>Event[T]</code> type. An <code>await</code> inside a Block is not enough.</p></article>
          <article><b>2 · Resolve paint</b><p>A pure helper returns stroke attributes. It knows nothing about routing, editor state, or DOM measurement.</p></article>
          <article><b>3 · Paint twice</b><p>Spread the same attributes into <code>component()</code> and <code>toSvg()</code>, preventing canvas/export drift.</p></article>
          <article><b>4 · Leave geometry alone</b><p><code>getGeometry</code>, indicator, handles, bindings, selection, routing, and z-order remain exactly as they are.</p></article>
        </div>

        <div class="implementation__grid">
          <article class="implementation__card">
            <h3>Minimal implementation shape</h3>
            <p>This is the copyable core. The only project-specific missing piece is <code>getConnectionVisualKind</code>, which should subscribe to bound Block port types inside the existing <code>useValue</code>.</p>
            <pre><code>{html.escape(HAPPY_PATH_CODE)}</code></pre>
          </article>
          <article class="implementation__card">
            <h3>Variant cost on the real Connection seam</h3>
            <p>All five can stay inside the custom shape; only V1 remains a single-stroke happy path.</p>
            <table>
              <thead><tr><th>Direction</th><th>Implementation</th><th>Risk</th></tr></thead>
              <tbody>
                <tr><td>V1 family / gap refinement</td><td>One path + dash array; same export props</td><td class="fit-low">Low</td></tr>
                <tr><td>V2 capsules</td><td>Sample route; place repeated glyphs; export group</td><td class="fit-mid">Medium</td></tr>
                <tr><td>V3 carrier</td><td>Base path + ephemeral pulse overlays; reduced motion</td><td class="fit-mid">Medium</td></tr>
                <tr><td>V4 windows</td><td>Generate tangent-normal waveform geometry</td><td class="fit-high">High / reject</td></tr>
                <tr><td>V5 pocket</td><td>Sample midpoint; mask path; add adornment</td><td class="fit-high">Medium-high</td></tr>
              </tbody>
            </table>
            <p style="margin-top:12px">If line kind must be manually authorable, use tldraw's supported custom style seam and migrate the new prop:</p>
            <pre><code>{html.escape(STYLE_PROP_CODE)}</code></pre>
          </article>
        </div>

        <div class="implementation__sources"><b>Evidence checked against the pinned install:</b> <code>package.json</code> pins <code>tldraw 5.3.2</code>; <code>ConnectionShapeUtil.tsx:248</code> owns geometry, <code>:594–612</code> owns component/export/indicator, and <code>:629–648</code> paints the current path. The vendored 5.3.2 source exposes five <code>DefaultDashStyle</code> values and the public <code>getPerfectDashProps()</code> helper. Official references: <a href="https://tldraw.dev/sdk-features/styles">Styles</a>, <a href="https://tldraw.dev/reference/editor/ShapeUtil">ShapeUtil</a>, <a href="https://tldraw.dev/sdk-features/image-export">image export</a>, and <a href="https://tldraw.dev/docs/shapes">custom shapes</a>.</div>
      </section>
    """


IMPLEMENTATION_SCRIPT = r"""
  <script>
    (() => {
      const styles = {
        solid: { dash: 'none', cap: 'round', label: 'strokeDasharray="none"', note: 'The current continuous data baseline.' },
        dashed: { dash: '4 4.35', cap: 'round', label: 'representative stock dashed cadence', note: 'getPerfectDashProps() balances dash and gap against each route length.' },
        dotted: { dash: '.02 4.08', cap: 'round', label: 'representative stock dotted cadence', note: 'Round line caps turn the near-zero dash into a dot.' },
        burst: { dash: '46 4 83 9 61 5 97 4', cap: 'butt', label: 'strokeDasharray="46 4 83 9 61 5 97 4"', note: '93% carrier; butt caps keep the irregular micro-gaps open along every route.' },
      }
      const buttons = [...document.querySelectorAll('[data-impl-style]')]
      const wires = [...document.querySelectorAll('[data-impl-wire]')]
      const value = document.getElementById('impl-style-value')
      const note = document.getElementById('impl-style-note')
      const select = (name) => {
        const selected = styles[name]
        if (!selected) return
        wires.forEach((wire) => {
          wire.setAttribute('stroke-dasharray', selected.dash)
          wire.setAttribute('stroke-linecap', selected.cap)
        })
        buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.implStyle === name)))
        if (value) value.textContent = selected.label
        if (note) note.textContent = selected.note
      }
      buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.implStyle)))
      select('burst')
    })()
  </script>
"""


def build() -> str:
    gallery = load_gallery_module()
    rendered = gallery.embed_project(SHELL.read_text(encoding="utf-8"), PROJECT)
    rendered = rendered.replace("</head>", f"<style>{CUSTOM_CSS}</style></head>", 1)
    variants_heading = '    <section aria-labelledby="variants-heading">'
    rendered = rendered.replace(variants_heading, source_reference_html() + "\n" + variants_heading, 1)
    rendered = rendered.replace(
        '    <aside class="decision-dock"',
        implementation_html() + '\n    <aside class="decision-dock"',
        1,
    )
    rendered = rendered.replace(
        "</body>",
        IMPLEMENTATION_SCRIPT + f'<!-- Built by docs/build_async_edge_styles.py at {GIT_HEAD}; prototypes and implementation spike only, no product code changed. --></body>',
        1,
    )
    return rendered


def main() -> None:
    rendered = build()
    OUTPUT.write_text(
        "\n".join(line.rstrip() for line in rendered.splitlines()) + "\n",
        encoding="utf-8",
    )
    print(OUTPUT)
    totals = {
        variant["id"]: round(
            sum(
                requirement["weight"] * variant["scores"][requirement["id"]]["score"] / 5
                for requirement in REQUIREMENTS
            ),
            1,
        )
        for variant in VARIANTS
    }
    print(json.dumps({"variants": len(VARIANTS), "totals": totals}, indent=2))


if __name__ == "__main__":
    main()
