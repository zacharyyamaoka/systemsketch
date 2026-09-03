#!/usr/bin/env python3
"""Build `docs/reference-learnings-2026-09-02.html`.

What Enso, Nevalang and unit each already decided about the questions currently
open on SystemSketch's bench — the loop grammar, many-to-one, the delayed
cable, the literal pill, Branch authoring, and how a region gets made.

Every number describing SystemSketch is read out of the tree at build time, so
this report cannot drift from the code it argues about. Every claim about a
reference is anchored to a primary source (the project's own docs or source),
and every reference screenshot in `docs/assets/ref-*.png` was captured by
`tools/capture_reference_screens.mjs` driving real headless Chrome over the
public sites — not pulled from a search summary.
"""

from __future__ import annotations

import base64
import html
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "reference-learnings-2026-09-02.html"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


def read(relative: str) -> str:
    path = REPO / relative
    return path.read_text(encoding="utf-8") if path.exists() else ""


def grab(pattern: str, text: str, default: str = "?") -> str:
    match = re.search(pattern, text)
    return match.group(1) if match else default


def crop_uri(name: str, box: tuple[int, int, int, int] | None = None, width: int = 1100) -> str:
    path = ASSETS / name
    if not path.exists():
        return ""
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    if image.width != width:
        ratio = width / image.width
        image = image.resize((width, max(1, int(image.height * ratio))), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=86, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def figure(name: str, caption: str, box=None, width: int = 1100, cls: str = "") -> str:
    uri = crop_uri(name, box, width)
    if not uri:
        return (
            f'<figure class="{cls} missing"><figcaption>{caption} — <i>capture missing: run'
            " <code>node tools/capture_reference_screens.mjs</code></i></figcaption></figure>"
        )
    return (
        f'<figure class="{cls}"><img src="{uri}" alt="{html.escape(caption)}"/>'
        f"<figcaption>{caption}</figcaption></figure>"
    )


# ------------------------------------------------------------------ measured
HEAD = git("rev-parse", "--short", "HEAD")
BRANCH_NAME = git("rev-parse", "--abbrev-ref", "HEAD")

CONNECTION_MODEL = read("src/blocks/connections/connectionModel.ts")
BRANCH_MODEL = read("src/branch/branchModel.ts")
BLOCK_MODEL = read("src/blocks/blockModel.ts")
SHAPE_UTIL = read("src/blocks/connections/ConnectionShapeUtil.tsx")

TEMPORAL_KINDS = grab(r"CONNECTION_TEMPORAL_KINDS = \[([^\]]+)\]", CONNECTION_MODEL)
ROUTING_KINDS = grab(r"CONNECTION_ROUTING_KINDS = \[([^\]]+)\]", CONNECTION_MODEL)
PILL_DEFAULT = grab(r"PILL_POSITION_DEFAULT = ([\d.]+)", CONNECTION_MODEL)
PILL_MIN = grab(r"PILL_POSITION_MIN = ([\d.]+)", CONNECTION_MODEL)
PILL_MAX = grab(r"PILL_POSITION_MAX = ([\d.]+)", CONNECTION_MODEL)
BRANCH_VIEWS = grab(r"BRANCH_VIEWS = \[([^\]]+)\]", BRANCH_MODEL)
BRANCH_FADE = grab(r"BRANCH_FADE_OPACITY = ([\d.]+)", BRANCH_MODEL)
CONTROL_PORT_RULE = "Authored, never derived from a title." in BRANCH_MODEL
PORT_SECTION_FIELDS = "row" in BLOCK_MODEL and "branch" in BLOCK_MODEL
MANY_TO_ONE_RULE = "many-to-one design" in SHAPE_UTIL

# `PILL_POSITION_DEFAULT` is doing two jobs: where a new pill starts, and what
# "centred" means. Count the second kind of use, because it is what turns
# suggestion 3 from a one-constant change into a split.
CENTRED_SENTINEL_SITES = [
    (path, line.strip())
    for path in ("src/blocks/connections/connectionCommands.ts", "src/blocks/ui/ConnectionInspector.tsx")
    for line in read(path).splitlines()
    if "=== PILL_POSITION_DEFAULT" in line or "pillPosition: PILL_POSITION_DEFAULT" in line
]
CENTRE_BUTTON = "Centre the pill" in read("src/blocks/ui/ConnectionInspector.tsx")

SRC_MODULES = len(list((REPO / "src").rglob("*.ts"))) + len(list((REPO / "src").rglob("*.tsx")))
JOURNEYS = len(list((REPO / "tests").glob("*_smoke.mjs")))
CONNECTION_FILES = len([p for p in (REPO / "src/blocks/connections").glob("*.ts*") if ".test." not in p.name])

BABBLE = DOCS / "for-loop-visual-grammar-babble-2026-09-02.json"
loop_babble = json.loads(BABBLE.read_text(encoding="utf-8")) if BABBLE.exists() else {}
LOOP_COUNT = loop_babble.get("count", "?")
LOOP_DEFAULT = loop_babble.get("defaultId", "?")
LOOP_DEFAULT_WHY = loop_babble.get("defaultWhy", "")
LOOP_TITLE = loop_babble.get("title", "")

# A peer session is running the loop question right now, anchored on LabVIEW.
# Detect it rather than describing a pass that has already been superseded.
LABVIEW_BUILDER = read("docs/build_for_loop_labview_grammars.py")
LABVIEW_LIVE = bool(LABVIEW_BUILDER)
LABVIEW_VARIANTS = re.findall(r'Scene\(SCENE_W, SCENE_H, "([^"]+)"\)', LABVIEW_BUILDER)
LOOP_TEN_REJECTED = "replaces the rejected ten-variant pass" in read("README.md")

CAPTURE_MANIFEST = ASSETS / "reference-capture-manifest.json"
captures = json.loads(CAPTURE_MANIFEST.read_text(encoding="utf-8")) if CAPTURE_MANIFEST.exists() else {}
CAPTURE_COUNT = len(captures.get("shots", []))

SOURCES = [
    ("Neva — Networks (connections, fan-in/fan-out, deferred, switch, array bypass)",
     "https://github.com/nevalang/neva/blob/main/docs/user/book/networks.md"),
    ("Neva — Components (IO nodes, interface nodes / DI)",
     "https://github.com/nevalang/neva/blob/main/docs/user/book/components.md"),
    ("Neva — Q&A (why New is an infinite loop; streams vs classical FBP)",
     "https://github.com/nevalang/neva/blob/main/docs/user/qna.md"),
    ("Neva — issue #935, “Revisit language features in context of visual editor”",
     "https://github.com/nevalang/neva/issues/935"),
    ("Enso — GraphEditor widget registry (matcher / priority / score)",
     "https://github.com/enso-org/enso/blob/develop/app/gui/src/project-view/components/GraphEditor/widgets/CLAUDE.md"),
    ("Enso — collapsing.ts (derive an extracted component's signature)",
     "https://github.com/enso-org/enso/blob/develop/app/gui/src/project-view/components/GraphEditor/collapsing.ts"),
    ("Enso — detaching.ts (`analyzeConnectAround`)",
     "https://github.com/enso-org/enso/blob/develop/app/gui/src/project-view/components/GraphEditor/detaching.ts"),
    ("Enso — syntax README (“Both are first-class, and are truly equivalent”)",
     "https://github.com/enso-org/enso/blob/develop/docs/syntax/README.md"),
    ("unit — Getting Started (the documented gesture vocabulary)",
     "https://github.com/samuelmtimbo/unit/blob/main/src/docs/start/README.md"),
    ("unit — Concept (composition / decomposition symmetry)",
     "https://github.com/samuelmtimbo/unit/blob/main/src/docs/concept/README.md"),
]


# ------------------------------------------------------------------ diagrams
def svg_frame(body: str, width: int, height: int, title: str) -> str:
    return (
        f'<svg class="diagram" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="{html.escape(title)}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'
    )


def fan_in_diagram() -> str:
    """Three operators wear the name "many-to-one"; only two of them are nodes."""
    def block(x, y, label, w=94, h=36, cls="blk"):
        return (
            f'<g class="{cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4"/>'
            f'<text x="{x + w / 2}" y="{y + h / 2 + 5}" text-anchor="middle">{label}</text></g>'
        )

    def panel(x0, title, subtitle, body, verdict, tone):
        return (
            f'<text class="hd" x="{x0}" y="26">{title}</text>'
            f'<text class="cap" x="{x0}" y="44">{subtitle}</text>' + body +
            f'<text class="verdictlbl {tone}" x="{x0}" y="296">{verdict}</text>'
        )

    # merge — every sender live, order = arrival
    merge = panel(20, "merge", "Neva FanIn · all senders live", "".join([
        block(20, 70, "warm"), block(20, 130, "cold"), block(20, 190, "late"),
        '<g class="fan"><rect x="150" y="72" width="66" height="152" rx="4"/>'
        '<text x="183" y="96" text-anchor="middle">[0]</text>'
        '<text x="183" y="152" text-anchor="middle">[1]</text>'
        '<text x="183" y="208" text-anchor="middle">[2]</text></g>',
        block(248, 130, "route", 78),
        '<path class="wire" d="M114 88 H150"/><path class="wire" d="M114 148 H150"/>',
        '<path class="wire" d="M114 208 H150"/><path class="wire" d="M216 148 H248"/>',
        '<text class="note" x="20" y="252">Order = send order. A real</text>',
        '<text class="note" x="20" y="270">operator, so: draw the node.</text>',
    ]), "NODE", "take")

    # gather — every sender live, wait for one from each
    gather = panel(370, "gather", "FR-LK-DETERMINISTIC-GATHER · all live", "".join([
        block(370, 70, "warm"), block(370, 130, "cold"), block(370, 190, "late"),
        '<g class="fan gate"><rect x="500" y="72" width="66" height="152" rx="4"/>'
        '<text x="533" y="140" text-anchor="middle">∧</text>'
        '<text x="533" y="166" text-anchor="middle" class="cap">all</text></g>',
        block(598, 130, "route", 78),
        '<path class="wire" d="M464 88 H500"/><path class="wire" d="M464 148 H500"/>',
        '<path class="wire" d="M464 208 H500"/><path class="wire" d="M566 148 H598"/>',
        '<text class="note" x="370" y="252">Waits for one fresh value from</text>',
        '<text class="note" x="370" y="270">every source. Also: draw the node.</text>',
    ]), "NODE", "take")

    # phi — mutually exclusive, decided upstream
    phi = panel(720, "φ", "branch arms · exactly one live", "".join([
        '<g class="blk"><rect x="720" y="106" width="70" height="36" rx="4"/>'
        '<text x="755" y="130" text-anchor="middle">switch</text></g>',
        '<text class="upstream" x="755" y="98" text-anchor="middle">↑ decided HERE</text>',
        block(830, 70, "arm A", 78), block(830, 150, "arm B", 78),
        '<path class="wire" d="M790 118 H812 V88 H830"/>',
        '<path class="wire faded" d="M790 130 H812 V168 H830"/>',
        block(960, 110, "route", 78),
        '<path class="wire" d="M908 88 H936 V128 H960"/>',
        '<path class="wire faded" d="M908 168 H936 V132 H960"/>',
        '<circle class="port" cx="960" cy="128" r="5"/>',
        '<text class="note" x="720" y="252">Nothing happens where they meet. A node</text>',
        '<text class="note" x="720" y="270">would <tspan class="em">relocate the decision</tspan>.</text>',
    ]), "NO NODE — fade", "rejected")

    return svg_frame(
        merge + gather + phi
        + '<line class="split" x1="340" y1="10" x2="340" y2="300"/>'
        + '<line class="split" x1="690" y1="10" x2="690" y2="300"/>',
        1060, 320, "Three operators called many-to-one; only two are nodes")


def loop_diagram() -> str:
    """A drawn loop region versus a stream that ends."""
    def blk(x, y, label, w=104, h=40, cls="blk"):
        return (f'<g class="{cls}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4"/>'
                f'<text x="{x + w / 2}" y="{y + h / 2 + 5}" text-anchor="middle">{label}</text></g>')

    left = "".join([
        '<text class="hd" x="20" y="26">A loop drawn as a region — the shape must carry six roles</text>',
        '<rect class="region" x="30" y="52" width="380" height="180" rx="6"/>',
        '<text class="cap" x="44" y="76">for other in others</text>',
        blk(60, 100, "grasp"), blk(230, 100, "score"),
        '<path class="wire" d="M164 120 H230"/>',
        # The carried value leaves score, runs under the body and re-enters grasp
        # one iteration later — the arrowhead is the whole point of the drawing.
        '<path class="wire delayed" d="M334 140 V190 H52 V126" marker-end="url(#backarrow)"/>',
        '<circle class="port" cx="60" cy="120" r="4"/>',
        '<circle class="port" cx="334" cy="120" r="4"/>',
        '<text class="pill" x="176" y="184">z⁻¹  carried pose</text>',
        '<text class="note" x="20" y="262">collection · current item · seed · carried · final · exit —</text>',
        '<text class="note" x="20" y="280">all six need a home on one border.</text>',
    ])

    right = "".join([
        '<text class="hd" x="470" y="26">Neva — no loop exists; a stream ends, and a stage folds it</text>',
        blk(470, 90, "Range", 104, 40, "blk src"),
        '<text class="cap mono" x="470" y="76">stream&lt;int&gt;</text>',
        blk(640, 90, "grasp"),
        blk(800, 90, "Reduce", 110),
        '<path class="wire" d="M574 110 H640"/>',
        '<path class="wire" d="M744 110 H800"/>',
        '<path class="wire" d="M910 110 H960"/>',
        '<text class="cap mono" x="800" y="76">seed · fold</text>',
        '<text class="note" x="470" y="176">The recurrence lives inside <tspan class="mono">Reduce</tspan>, which is an</text>',
        '<text class="note" x="470" y="194">ordinary Block. The canvas draws a straight line.</text>',
        '<text class="note" x="470" y="220">Termination is a property of the stream, not of the</text>',
        '<text class="note" x="470" y="238">drawing — so no border has to say “done”.</text>',
    ])
    defs = ('<defs><marker id="backarrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7"'
            ' markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0 0 L8 4 L0 8 z" fill="#c05621"/></marker></defs>')
    return svg_frame(defs + left + right + '<line class="split" x1="440" y1="10" x2="440" y2="300"/>',
                     990, 310, "A drawn loop region versus a stream")


def pill_diagram() -> str:
    """Where the z-1 pill sits: mid-arc today, at the consumer under Neva's rule."""
    rows = []
    for index, (label, position, tone) in enumerate(
        [(f"today — PILL_POSITION_DEFAULT = {PILL_DEFAULT}", 0.5, "now"),
         ("Neva's rule — the delay is at the receiver", 0.85, "next")]
    ):
        y = 70 + index * 110
        x0, x1 = 150, 700
        x = x0 + (x1 - x0) * position
        rows.append(
            f'<text class="hd" x="20" y="{y - 24}">{label}</text>'
            f'<g class="blk"><rect x="40" y="{y - 20}" width="104" height="40" rx="4"/>'
            f'<text x="92" y="{y + 5}" text-anchor="middle">pose</text></g>'
            f'<g class="blk"><rect x="700" y="{y - 20}" width="104" height="40" rx="4"/>'
            f'<text x="752" y="{y + 5}" text-anchor="middle">refine</text></g>'
            f'<path class="wire delayed" d="M144 {y} H700"/>'
            f'<g class="pillbox {tone}"><rect x="{x - 26}" y="{y - 15}" width="52" height="30" rx="15"/>'
            f'<text x="{x}" y="{y + 5}" text-anchor="middle">z⁻¹</text></g>'
        )
    rows.append('<text class="note" x="20" y="292">“Deferred connections defer <tspan class="em">receiving</tspan>, '
                'not sending.” — Neva, <tspan class="mono">networks.md</tspan></text>')
    rows.append(f'<text class="note" x="20" y="312">Clamp is already {PILL_MIN}–{PILL_MAX}, '
                'so the move is a default, not a new mechanism.</text>')
    return svg_frame("".join(rows), 860, 330, "Where the delay pill sits on a cable")


def widget_diagram() -> str:
    """One pill decision versus a scored widget registry."""
    left = "".join([
        '<text class="hd" x="20" y="26">One decision: what does a literal look like?</text>',
        '<g class="blk"><rect x="40" y="60" width="330" height="130" rx="5"/>'
        '<line x1="40" y1="94" x2="370" y2="94"/>'
        '<text x="56" y="84">grasp</text>'
        '<text x="56" y="122">width</text><g class="chip"><rect x="250" y="106" width="100" height="22" rx="11"/>'
        '<text x="300" y="122" text-anchor="middle">0.08</text></g>'
        '<text x="56" y="160">policy</text><g class="chip"><rect x="250" y="144" width="100" height="22" rx="11"/>'
        '<text x="300" y="160" text-anchor="middle">"top"</text></g></g>',
        '<text class="note" x="20" y="232">Every argument gets the same grey chip, so the</text>',
        '<text class="note" x="20" y="250">chip has to be right for numbers, enums and files at once.</text>',
    ])
    right = "".join([
        '<text class="hd" x="470" y="26">Enso: the registry picks a widget per argument</text>',
        '<g class="blk"><rect x="490" y="60" width="380" height="130" rx="5"/>'
        '<line x1="490" y1="94" x2="870" y2="94"/>'
        '<text x="506" y="84">grasp</text>'
        '<text x="506" y="122">width</text>'
        '<g class="chip num"><rect x="640" y="104" width="210" height="26" rx="4"/>'
        '<rect x="640" y="104" width="86" height="26" rx="4" class="fill"/>'
        '<text x="745" y="122" text-anchor="middle">0.08 ── slider</text></g>'
        '<text x="506" y="162">policy</text>'
        '<g class="chip sel"><rect x="640" y="145" width="210" height="26" rx="4"/>'
        '<text x="745" y="163" text-anchor="middle">top ▾</text></g></g>',
        '<text class="note" x="470" y="232">matcher → priority (smaller wins) → score</text>',
        '<text class="note mono" x="470" y="252">Mismatch | Weak | Good | Perfect</text>',
        '<text class="note" x="470" y="274">A number gets a slider, an enum a dropdown, a path a file</text>',
        '<text class="note" x="470" y="292">picker — without the Block knowing any of them exist.</text>',
    ])
    return svg_frame(left + right + '<line class="split" x1="440" y1="10" x2="440" y2="300"/>',
                     900, 312, "A single literal chip versus a scored widget registry")


def compose_diagram() -> str:
    """unit's contour gesture, in tldraw terms."""
    return svg_frame("".join([
        '<text class="hd" x="20" y="26">unit — draw a contour around nodes, and they become one</text>',
        '<g class="blk"><rect x="60" y="70" width="92" height="38" rx="4"/><text x="106" y="94" text-anchor="middle">grasp</text></g>',
        '<g class="blk"><rect x="200" y="130" width="92" height="38" rx="4"/><text x="246" y="154" text-anchor="middle">score</text></g>',
        '<g class="blk"><rect x="80" y="190" width="92" height="38" rx="4"/><text x="126" y="214" text-anchor="middle">pick</text></g>',
        '<path class="wire" d="M152 89 H200 V149"/>',
        '<path class="wire" d="M172 209 H246 V168"/>',
        '<path class="scribble" d="M40 120 C 20 40, 200 30, 300 60 C 360 82, 350 200, 290 235 '
        'C 220 276, 60 268, 40 210 C 28 176, 34 146, 40 120"/>',
        '<text class="arrowlbl" x="352" y="266">one closed stroke</text>',
        '<text class="eq" x="430" y="160">⇒</text>',
        '<g class="blk composed"><rect x="500" y="120" width="150" height="60" rx="5"/>'
        '<line x1="500" y1="150" x2="650" y2="150"/>'
        '<text x="575" y="142" text-anchor="middle">untitled</text>'
        '<text x="575" y="170" text-anchor="middle" class="cap">3 blocks inside</text></g>',
        '<circle class="port" cx="500" cy="165" r="5"/><circle class="port" cx="650" cy="165" r="5"/>',
        '<text class="note" x="20" y="286">tldraw already ships the stroke (draw tool) and the hit test '
        '(<tspan class="mono">getShapesAtPoint</tspan>).</text>',
        '<text class="note" x="20" y="306">The new part is only: a closed scribble that encloses Blocks '
        'becomes a Branch region.</text>',
    ]), 720, 326, "Composing by drawing a contour")


def port_kind_diagram() -> str:
    """unit's three input kinds and the save rule that follows."""
    kinds = [
        ("constant", "#4f8ef7", "value lives on the port · persisted on save · not consumed",
         "a literal the author typed"),
        ("functional", "#b06ad9", "all must arrive before any flows · invalidated together",
         "configuration"),
        ("iterative", "#3f9b6d", "each arrives on its own · no interlock",
         "stream data"),
    ]
    parts = ['<text class="hd" x="20" y="26">unit — three kinds of input, and the save rule falls out of them</text>']
    for index, (name, colour, rule, use) in enumerate(kinds):
        y = 60 + index * 78
        parts.append(
            f'<g class="kind"><rect x="30" y="{y}" width="640" height="58" rx="5"/>'
            f'<circle cx="66" cy="{y + 29}" r="9" fill="{colour}"/>'
            f'<text class="kindname" x="96" y="{y + 25}">{name}</text>'
            f'<text class="note" x="96" y="{y + 45}">{rule}</text>'
            f'<text class="cap" x="656" y="{y + 34}" text-anchor="end">{use}</text></g>'
        )
    parts.append('<text class="note" x="20" y="{}">“When saving the current graph, <tspan class="em">only data in '
                 'constant inputs will be persisted</tspan>.”</text>'.format(60 + 3 * 78 + 24))
    return svg_frame("".join(parts), 700, 60 + 3 * 78 + 44, "unit's three input kinds")


# ------------------------------------------------------------------ content
def suggestion(number: int, title: str, source: str, finding: str, today: str,
               proposal: str, cost: str, verdict: str, verdict_tone: str,
               diagram: str = "", shots: str = "") -> str:
    return f"""
    <section class="sug">
      <header><span class="num">{number}</span>
        <div><h3>{title}</h3><p class="src">{source}</p></div>
        <span class="verdict {verdict_tone}">{verdict}</span>
      </header>
      {shots}
      <div class="grid3">
        <div><h4>What they do</h4>{finding}</div>
        <div><h4>SystemSketch today</h4>{today}</div>
        <div><h4>What I'd change</h4>{proposal}</div>
      </div>
      {diagram}
      <p class="cost"><b>Cost &amp; risk</b> — {cost}</p>
    </section>
    """


def build() -> str:
    source_list = "".join(
        f'<li><a href="{url}">{html.escape(name)}</a></li>' for name, url in SOURCES
    )

    bench = f"""
    <table class="bench">
      <tr><th>On the bench</th><th>State in the tree at <code>{HEAD}</code></th></tr>
      <tr><td>Cable delivery kinds</td><td><code>{html.escape(TEMPORAL_KINDS.strip())}</code> —
          a <code>StyleProp</code> on the connection</td></tr>
      <tr><td>Cable routing kinds</td><td><code>{html.escape(ROUTING_KINDS.strip())}</code></td></tr>
      <tr><td>z⁻¹ pill placement</td><td>default <code>{PILL_DEFAULT}</code> of arc length,
          clamped <code>{PILL_MIN}</code>–<code>{PILL_MAX}</code></td></tr>
      <tr><td>Branch region</td><td>views <code>{html.escape(BRANCH_VIEWS.strip())}</code>,
          inactive arms fade to <code>{BRANCH_FADE}</code>;
          control ports are <b>{'authored, never derived' if CONTROL_PORT_RULE else 'derived'}</b></td></tr>
      <tr><td>Port rows</td><td>{'<code>row</code> + <code>branch</code> per port' if PORT_SECTION_FIELDS
                                 else 'not found'}</td></tr>
      <tr><td>Many-to-one</td><td>{'an active-path rule in <code>ConnectionShapeUtil</code> + a sink count on the port'
                                   if MANY_TO_ONE_RULE else 'not found'} — no merge object</td></tr>
      <tr><td>Loop grammar</td><td>{LOOP_COUNT} variants babbled, default <code>{LOOP_DEFAULT}</code>;
          <b>no <code>src/loop</code> module exists</b></td></tr>
      <tr><td>Scale</td><td>{SRC_MODULES} source modules, {CONNECTION_FILES} of them in
          <code>src/blocks/connections/</code>, {JOURNEYS} real-browser journeys</td></tr>
    </table>
    """

    s1 = suggestion(
        1, "Make many-to-one a node, not a rendering rule",
        "Neva — <code>networks.md</code> · issue #935",
        """<p>In Neva, <code class="mono">[warm, cold] -&gt; route</code> is <b>syntactic sugar</b>. It
        desugars to a real <code>FanIn</code> component with numbered slots:
        <code class="mono">warm -&gt; fanIn[0]</code>, <code class="mono">cold -&gt; fanIn[1]</code>,
        <code class="mono">fanIn -&gt; route</code>. The semantics come with it: messages
        “merged and received in the order they were sent”, randomized when simultaneous.</p>
        <p>Neva's own visual-editor audit ranks this: fan-in and fan-out
        “<i>desugared into fan_in/fan_out nodes and connections, visualizes without any
        problems</i>”, while deferred connections are “<i>generally an ambiguous feature</i>”.</p>""",
        f"""<p>Three cables land on one dot. The port shows a
        {'sink count' if MANY_TO_ONE_RULE else 'count'}, and which cable is live is decided by an
        <i>active-path rule</i> plus a lint. Order is not represented at all — there is nowhere
        to put it.</p>
        <p>The Sept 2 babble landed on transparency + a badge, i.e. it stayed a
        <b>rendering</b> answer to a <b>structural</b> question.</p>""",
        """<p class="rev"><b>Superseded — Zach rejected this, correctly.</b> A node here would
        <i>lie about where the decision is made</i>. In his words: the switching logic is
        determined upstream, so “putting a switch here makes you think it's determined at this
        point, which is just not the case… to read the dataflow DAG properly only one of those
        branches will ever be active.”</p>
        <p>The reading error was mine: I treated one word as one operator. There are
        <b>three</b>, and only two of them are nodes.</p>
        <ul>
          <li><b>merge</b> — every sender live, order = arrival. Neva's <code>FanIn</code>.
          A real operator, so it deserves a shape.</li>
          <li><b>gather</b> — every sender live, wait for one fresh value from each, preserve
          order. Zach's own <code>FR-LK-DETERMINISTIC-GATHER</code>, implemented in
          <code>lk_dora_rs</code>. Also a real operator, also deserves a shape.</li>
          <li><b>φ</b> — senders mutually <i>exclusive</i>, exactly one live, and the choice
          was already made upstream by the branch. <b>Nothing happens at the convergence
          point</b>, which is exactly why it must not be drawn as a thing that acts.</li>
        </ul>
        <p>So the fade + active-path rendering rule is not a rendering answer standing in for
        missing structure. For φ it <i>is</i> the honest structure: the convergence is a place
        where cables meet, not an operator. Neva's <code>FanIn</code> earns its node because in
        Neva every sender really is live; branch arms are not.</p>""",
        """none — nothing to build. The residual work is naming: SystemSketch's many-to-one port
        should know which of the three it is, and today it has one presentation for all of them.
        Only merge and gather would ever want a shape.""",
        "Rejected — and right", "rejected", fan_in_diagram())

    s2 = suggestion(
        2, "Consider not drawing the for-loop at all",
        "Neva — <code>qna.md</code>, <code>networks.md</code>",
        """<p>Neva has <b>no loop construct</b>. A collection becomes a
        <code class="mono">stream&lt;T&gt;</code>; <code>Range</code> is an ordinary component with
        the signature <code class="mono">pub def Range(from int, to int) (res stream&lt;int&gt;)</code>.
        You consume it with <code>Map</code>, <code>Filter</code>, <code>Reduce</code> and
        <code>ForEach</code>.</p>
        <p>The reason streams exist at all is termination: they give a dataflow graph a way “to
        know when a collection ends, crucial for implementing patterns like map/filter/reduce”.
        The end of iteration is carried <b>in the data</b>, not in the border of a drawing.</p>""",
        f"""<p>The {LOOP_COUNT}-variant region pass
        ({html.escape(LOOP_TITLE)}, default <code>{LOOP_DEFAULT}</code>) is
        {'<b>rejected</b>' if LOOP_TEN_REJECTED else 'on the shelf'}. The live pass, running in a
        peer session as this was written, derives
        {len(LABVIEW_VARIANTS) or 'five'} grammars from LabVIEW's auto-indexing tunnel and shift
        register — {html.escape(', '.join(LABVIEW_VARIANTS)) if LABVIEW_VARIANTS else 'Wall Tunnels … Bare Cycle'} —
        each of which deliberately <i>adds no Block, gate, pill node or state node</i>.</p>
        <p>So the direction of travel is already <b>away</b> from putting grammar in the frame.
        Still no <code>src/loop</code> module exists; nothing is sunk.</p>""",
        f"""<p>Neva is the limit case of the direction that pass is already walking — one step
        past Bare Cycle. If the goal is “add nothing”, the strongest version is
        <b>add no loop</b>: <code class="mono">others</code> is a cable carrying a
        <code class="mono">stream&lt;T&gt;</code>, and <code>Reduce</code> is an ordinary Block
        with <code>seed</code> and <code>fold</code> ports whose recurrence lives inside it,
        where step-in already goes.</p>
        <p>Worth naming explicitly, because the three references converge here:
        LabVIEW's <b>shift register</b>, Neva's <b>Lock</b> and SystemSketch's <b>z⁻¹</b> are the
        same object arrived at independently. That is strong evidence the one-turn delay is the
        real primitive — and that whatever else a loop grammar adds is decoration on top of it.</p>
        <p>This is <i>not</i> a rejection of regions in general. Branch earns its region because
        arms are genuinely <b>spatial</b> — Blocks live inside an arm. A loop body's Blocks don't
        belong to the iteration that way; they belong to a function the iteration calls.</p>""",
        f"""nothing new to build to evaluate it — a sixth column on the comparison the peer
        session is already producing. The cost of <i>skipping</i> it is the one worth naming: a
        loop region is a second frame-like shape with its own layout, fold state, port host and
        migrations, i.e. the same order of work as Branch.""",
        "Add it as the sixth column", "ask", loop_diagram())

    s3 = suggestion(
        3, "Move the delay to the receiving end of the cable",
        "Neva — <code>networks.md</code>, deferred connections",
        """<p>Neva's deferred connection is written as a brace region <i>on the wire</i>:
        <code class="mono">:start -&gt; { 42 -&gt; println -&gt; :stop }</code>, sugar for a
        <code>Lock</code> node. The rule it states in bold is the useful part:</p>
        <blockquote>Deferred connections defer <b>receiving</b>, not sending. In
        <code class="mono">foo -&gt; { bar -&gt; baz }</code>, <code>bar</code> sends immediately,
        but <code>baz</code> receives the message only after <code>foo</code> unlocks it.</blockquote>
        <p>The reason the mechanism exists is also instructive: constant nodes “are implemented
        as infinite loops that constantly send messages”, so <i>something</i> has to gate arrival.</p>""",
        f"""<p>The delayed cable is a first-class <code>StyleProp</code>
        (<code>{html.escape(TEMPORAL_KINDS.strip())}</code>) with a z⁻¹ pill placed by arc length.
        The default is <code>{PILL_DEFAULT}</code> — the midpoint — clamped to
        <code>{PILL_MIN}</code>–<code>{PILL_MAX}</code>.</p>
        <p>Mid-arc reads as “this cable is delayed”, which is true but weaker than what the
        reader needs to know: <b>which end waits</b>.</p>""",
        f"""<p>Default the pill to about <code>0.85</code> so it sits against the consumer. The
        clamp already permits it and the handle already lets an author drag it back.</p>
        <p><b>But not by editing that constant.</b> Reading the call sites shows
        <code>PILL_POSITION_DEFAULT</code> is doing two jobs at once — it is also the sentinel
        for <i>“is the pill centred?”</i> in {len(CENTRED_SENTINEL_SITES)} places, including the
        one behind the inspector's
        {'<code>Centre the pill</code> button' if CENTRE_BUTTON else 'centre control'}
        (<code>centreConnectionPill</code> returns early when the position already equals it).
        Moving it would make a button labelled “Centre” put the pill at 85%.</p>
        <p>So the change is a <b>split</b>: keep <code>PILL_POSITION_CENTRED = {PILL_DEFAULT}</code>
        for the reset and the disabled-state check, and introduce a separate
        <code>PILL_POSITION_DEFAULT = 0.85</code> for where a new pill is born.</p>
        <p>Second, smaller: when a delayed cable is selected, that is the moment to name the
        seed. Neva's <code>Lock</code> has a <code>sig</code> and a <code>data</code> port; the
        seed is <code>data</code>. The pill is already the place a label can hang.</p>""",
        f"""low, but not the "one constant" it looks like from the model file — the split touches
        {len(CENTRED_SENTINEL_SITES)} call sites plus the inspector's disabled state, and the
        existing test asserts <code>clampPillPosition(NaN)</code> falls back to the default,
        which after the split should fall back to <i>centred</i>. The other judgement call is
        whether 0.85 crowds the arrowhead on short cables; worth eyeballing on the existing
        edge-vocabulary fixture first. <b>I have not made this change</b> — you asked for a
        report, and this one turned out to touch user-visible button semantics.""",
        "Take it — as a split", "take", pill_diagram())

    s4 = suggestion(
        4, "Make the literal chip a widget registry, not a chip decision",
        "Enso — <code>widgets/CLAUDE.md</code>, <code>WidgetNumber</code> … <code>WidgetTableEditor</code>",
        """<p>Enso has no separate literal node for an argument. A node <i>is</i> one line of
        code, and each argument renders as a <b>widget chosen by a registry</b> that walks the
        AST. A widget definition declares a <b>matcher</b>, a <b>priority</b> (“smaller wins”)
        and a <b>score</b> — <code class="mono">Mismatch | Weak | Good | Perfect</code>, where
        Perfect short-circuits the scan.</p>
        <p>The shipped set is not decorative: number, checkbox, selection, vector,
        file browser, table editor, type cast, AI prompt. In the capture below,
        <code class="mono">condition Equal 2026-09-03</code> opens a real calendar, and
        <code class="mono">rules [ Group_By "Shop" , Sum "value" , Max "time" ]</code> is a list
        editor — both inside the node pill.</p>""",
        f"""<p>The literal-argument question was babbled on Sept 1 as a
        <i>single</i> choice: name-is-the-semantics vs a grey row chip vs an off-row node.
        Value Blocks exist ({'<code>valueBlock.ts</code>' if read('src/blocks/valueBlock.ts') else '—'},
        with <code>inferLiteralType</code> and a fold length), and the row chip is the
        current default. The pick is still open.</p>""",
        """<p>Reframe the pick. The question is not “which chip” but “<b>who decides</b> what a
        port's inline editor is”. Adopt Enso's shape: a small registry keyed on the port's
        inferred type, each entry with a matcher and a score, with the grey chip as the
        <code>Weak</code>-scoring fallback that always matches.</p>
        <p>Then the Sept 1 babble stops being a fork and becomes the registry's first three
        entries. A bool gets a checkbox, an enum a dropdown, a path a file chip — and adding
        the fourth never reopens the decision.</p>""",
        """medium, and mostly upfront. <code>inferLiteralType</code> already exists, so the
        matcher has something to match on. The real cost is that inline editors inside a Block
        row must not fight tldraw for the pointer — this repo has already paid that lesson once
        (which layer owns the event), so each widget needs the same treatment click-to-edit got.""",
        "Take the pattern", "take", widget_diagram())

    s5 = suggestion(
        5, "Derive the Branch's control ports from what crosses the boundary",
        "Enso — <code>collapsing.ts</code>, <code>detaching.ts</code>",
        """<p>When Enso collapses a selection into a component, it does not ask for a signature.
        <code>prepareCollapsedInfo</code> computes it: the inputs are the identifiers the
        selection reads from outside, the output is the node no one inside consumes
        (“<i>leaves are the nodes that have no outgoing connection</i>”).</p>
        <p>Its mirror is <code>analyzeConnectAround</code>: when a group is removed, connections
        leaving it are re-pointed at each node's own self-port source, and it returns
        <code>Err</code> rather than silently dropping an edge if any port would lose its
        source.</p>""",
        f"""<p><code>branchModel.ts</code> states the current rule in the source itself: a control
        port is “<b>{'Authored, never derived from a title' if CONTROL_PORT_RULE else 'derived'}</b>”.
        The Sept 2 authoring babble recommends inspector lists <i>plus</i> derivation from arm
        code — so this is already half-recognised.</p>
        <p>Separately, “remove frame, keep contents” already exists in
        <code>src/frames/removeFrame.ts</code>.</p>""",
        """<p>Two concrete moves. First, keep authoring as the <i>override</i> but derive the
        default: a Branch's control ports should be proposed from the cables that already cross
        its band, the way Enso proposes a collapsed signature. Authored wins where it disagrees.</p>
        <p>Second, borrow the <code>Err</code>: “remove frame, keep contents” should refuse
        loudly when a cable would be left without a source, rather than healing to something
        plausible. That is a test assertion more than a feature.</p>""",
        """low for the failure mode (an error path and a journey), medium for derivation
        (it needs a definition of “crosses the band” that survives folds — and arm membership
        is already a meta stamp kept across folds, so the hard half is done).""",
        "Take the error rule; pilot derivation", "take")

    s6 = suggestion(
        6, "Compose a region by drawing a ring around things",
        "unit — <code>Getting Started</code>: Drawing, Composition",
        """<p>unit's gesture vocabulary is tiny and reused. Drawing is entered with click-and-hold
        (or Alt), and then the <b>shape of the stroke is the command</b>: a line out of the centre
        makes an output plug, a line inward makes an input, a circle makes a unit, a rectangle
        makes a component, and — the one that matters here —
        <b>“drawing a contour around a group of nodes will compose those nodes”</b>.</p>
        <p>Composition and its inverse are the <i>same</i> gesture: long press on the background
        composes the selection; long press again explodes it.</p>""",
        f"""<p>A Branch region is created with the Branch tool and then Blocks are dropped into
        it. Detach and “remove frame, keep contents” exist as the inverse, but they are reached
        from menus, not from the gesture that made the region.</p>
        <p>The house rule here is “don't invent new whiteboard interactions” — which is exactly
        the argument <i>for</i> this one: drawing a ring around things is the oldest whiteboard
        gesture there is, and tldraw already ships both halves (the draw tool and hit testing).</p>""",
        """<p>Add one composition path: a closed scribble that encloses two or more Blocks offers
        to wrap them in a Branch region. Not a new tool — the existing draw tool, plus a
        post-stroke check.</p>
        <p>And make the inverse reachable from the same place. Today explode lives in a menu;
        it should also be the thing that happens when you erase a region's outline.</p>""",
        """medium. The stroke→enclosure test is straightforward, but the interaction has to lose
        gracefully: an open stroke, or one enclosing nothing, must stay an ordinary drawing.
        This is also the suggestion most likely to be wrong for Zach's taste, because it adds a
        <i>mode-free</i> meaning to a stroke that currently just draws.""",
        "Prototype, don't commit", "ask", compose_diagram())

    s7 = suggestion(
        7, "Name three kinds of input — and let the save rule fall out",
        "unit — <code>Getting Started</code>: Constant / Functional inputs",
        """<p>unit distinguishes three kinds of input on a graph, and each is a real behaviour,
        not a label:</p>
        <ul><li><b>constant</b> — the value is not consumed; “<i>when saving the current graph,
        only data in constant inputs will be persisted</i>”.</li>
        <li><b>functional</b> — all must be activated before data can move in, all are
        invalidated together, all are consumed internally before externally.</li>
        <li><b>iterative</b> (the default) — no interlock at all.</li></ul>
        <p>Its guidance is one line: “<i>use functional inputs for configuration, and iterative
        inputs for stream data</i>”.</p>""",
        f"""<p>SystemSketch already splits the <i>cable</i> three ways
        (<code>{html.escape(TEMPORAL_KINDS.strip())}</code>) but the <i>port</i> only one way.
        A literal on a port and a stream into a port are the same kind of thing today.</p>""",
        """<p>Adopt the distinction on ports, and take the persistence rule with it: a port
        holding an authored literal is a <b>constant</b>, and constants are what a
        <code>.systemsketch</code> file stores. That gives the literal-pill question (4) a
        semantics rather than a styling, and it answers “what does saving a board actually
        capture” without a new mechanism.</p>
        <p>I would <b>not</b> take <i>functional</i> inputs yet — the interlock is real
        semantics, and SystemSketch has no runtime that could honour it.</p>""",
        """low if scoped to constant-vs-stream, because it names something the file format
        already does implicitly. High if taken whole — the functional-input interlock implies an
        execution model this repo has deliberately not built.""",
        "Take half", "half", port_kind_diagram())

    not_taking = """
    <section class="reject">
      <h2>What I would not copy</h2>
      <ul>
        <li><b>unit's five colour modes</b> (Add/Info/Data/Remove/Change on
        <kbd>S</kbd><kbd>Q</kbd><kbd>A</kbd><kbd>D</kbd><kbd>F</kbd>). It is a beautiful
        compression — one gesture, five meanings — but it is a second modal system beside
        tldraw's tools, and it is precisely the “new whiteboard interaction” the house rule
        exists to prevent. The <i>principle</i> (reuse a gesture under a modifier rather than
        add a gesture) is worth keeping; the mode ring is not.</li>
        <li><b>Enso's full text ⇄ graph round-trip.</b> Enso's synchronisation is genuinely the
        best-engineered version of this — composed edits, an exact-equality gate, inverse-edit
        rollback, a persisted ID map. It is also, as the vault already records, the tar pit that
        consumed MPS, Enso and Intentional Software. SystemSketch is not a source editor and
        should not acquire one by accident.</li>
        <li><b>Neva's array-port index discipline</b> (“there must be no holes; always start at
        <code>[0]</code>”). Correct for a compiler, hostile on a canvas where a user deletes the
        middle cable of three. If merge slots arrive (1), they should compact — the way port
        rows already do.</li>
        <li><b>unit's live values on the wire</b> — the <code>0</code> drawn at the pin in the
        first unit capture above. It is lovely, and it depends on a running program. The flight
        recorder is the honest local version of this, and it already exists.</li>
      </ul>
    </section>
    """

    seam = """
    <section class="seam">
      <h2>The reframe that outranks all seven</h2>
      <blockquote class="zach">I don't want to do any deriving logic within the whiteboard.
      The whiteboard should remain like this hackable thing for drawing things —
      <b>no linting by default</b>. And then when we use it for rendering the Python code, I
      think it's the Python that is really driving a lot of it. We are <b>NOT</b> making a
      programming language like LabVIEW. We are trying to combine the flexibility and ease of use
      of the whiteboard with an existing mature programming language, Python.
      <cite>— Zach, 2026-09-03</cite></blockquote>
      <p>This invalidates the frame the seven suggestions were written in, and it is worth being
      explicit about why. <b>All three references are languages.</b> Enso, Neva and unit each own
      their semantics end to end, so it is coherent for them to derive a signature, reject a
      malformed graph, or refuse a connection. SystemSketch does not own its semantics — Python
      does — and it is a <i>whiteboard</i> on the other side.</p>
      <p>So the useful question is not “should SystemSketch adopt X” but <b>which side of the seam
      X belongs on</b>:</p>
      <table>
        <tr><th>Whiteboard side — stays dumb</th><th>Python side — may be rigid</th></tr>
        <tr>
          <td>Drawing, wrapping, grouping, moving, naming. Cheap, reversible, permissive.
              A half-finished sketch must stay legal.</td>
          <td>Types, arity, derivation, validation. Anything that can be <i>wrong</i>.</td>
        </tr>
        <tr>
          <td>No lint. No inference at draw time. No refusal to connect two things.</td>
          <td>Signatures derived from code; diagnostics that come back from a real parse.</td>
        </tr>
      </table>
      <p>Re-sorted against that seam, the seven land differently. Suggestion 5 (derive a Branch's
      control ports) was the clearest violation — it puts inference in the drawing layer, and
      Zach rejected it outright. Suggestion 4's widget registry is only legitimate as a
      <i>rendering</i> of what Python already said, never as type inference performed by the
      canvas. Suggestion 1 turns out to have been wrong for an unrelated and better reason
      (below). Suggestion 6 survives cleanly, because wrapping a selection is a pure drawing move
      that derives nothing — which is presumably why it is the one that got a build order.</p>
      <p>Enso is the interesting counter-example rather than a refutation: its own answer to
      “where do semantics live” is that the graph <b>is</b> the source text. That is the tar pit
      the vault already flags. SystemSketch's answer — keep them separate, let Python drive the
      rigid half — is the cheaper bet, and it is the reason most of what these three do well is
      not transferable wholesale.</p>
    </section>
    """

    decisions = """
    <section class="decide">
      <h2>Verdicts — 2026-09-03</h2>
      <p class="lede" style="font-size:15px">All seven answered. Two survive, one was rejected
      for a reason better than the suggestion, and the rest were already solved or against the
      grain.</p>
      <table>
        <tr><th>#</th><th>Verdict</th><th>What actually happens</th></tr>
        <tr>
          <td><b>1</b> many-to-one as a node</td>
          <td class="v-rejected">Rejected — and right</td>
          <td>A node would relocate the decision: the switch is upstream, and only one arm is
              ever live. Three operators wear the name — <b>merge</b> and <b>gather</b> are real
              and deserve shapes; <b>φ</b> is not an operator and must stay a fade. Nothing to
              build.</td>
        </tr>
        <tr>
          <td><b>2</b> no loop, just a stream</td>
          <td class="v-open">Noted, live</td>
          <td>Resonated while getting the for-loop working. Leaning read-only body, with
              step-in retained for loops that hold a lot of function code. Stays a column in the
              LabVIEW comparison rather than a build order.</td>
        </tr>
        <tr>
          <td><b>3</b> move the z⁻¹ pill to the consumer</td>
          <td class="v-rejected">Rejected</td>
          <td>0.5 is fine — it is draggable, and the middle is a reasonable place to start.
              The <code>PILL_POSITION_DEFAULT</code> overloading is therefore moot; no split
              needed.</td>
        </tr>
        <tr>
          <td><b>4</b> literal chip as a widget registry</td>
          <td class="v-half">Half — explicitness wins</td>
          <td>“I like making data source explicit. Yes it's more verbose but that is the point.”
              So explicit value nodes stay; Enso's compression of an argument into an inline
              widget is <i>not</i> wanted for data sources. A registry may still decide how a
              value renders once it is there — but only as a rendering of what Python said.</td>
        </tr>
        <tr>
          <td><b>5</b> derive Branch control ports</td>
          <td class="v-rejected">Rejected — see the reframe above</td>
          <td>No deriving logic in the whiteboard. This is the boundary principle, not a
              one-off no.</td>
        </tr>
        <tr>
          <td><b>6</b> turn a selection into a container</td>
          <td class="v-take">Approved — prototype 5 variants</td>
          <td>Reframed from a drawn contour to <b>a command</b>: right-click → turn group into
              frame / Block / visual group, the way FigJam already does. Five variants are being
              babbled; the existing <code>Wrap in new section</code> (Ctrl+S) is the affordance
              to extend.</td>
        </tr>
        <tr>
          <td><b>7</b> three kinds of input</td>
          <td class="v-done">Already built</td>
          <td>Constants already show default values, and the functional/iterative split is
              already carried by port <b>rows</b>. Zach's framing: each iterative arrival is
              really its own function with its own callback handler.</td>
        </tr>
      </table>
    </section>
    """

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Enso · Neva · unit → SystemSketch</title>
<style>
 :root {{
   --ink:#12151a; --dim:#5a6472; --line:#dfe3ea; --bg:#fbfcfd; --card:#fff;
   --accent:#1f6feb; --take:#0f7b45; --ask:#a5691a; --half:#5b4bb5;
   --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
 }}
 * {{ box-sizing:border-box; }}
 body {{ margin:0; background:var(--bg); color:var(--ink);
   font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
 .wrap {{ max-width:1180px; margin:0 auto; padding:48px 28px 96px; }}
 h1 {{ font-size:38px; line-height:1.15; margin:0 0 10px; letter-spacing:-.02em; }}
 h2 {{ font-size:24px; margin:56px 0 16px; letter-spacing:-.01em; }}
 h3 {{ font-size:20px; margin:0; letter-spacing:-.01em; }}
 h4 {{ font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim);
       margin:0 0 8px; }}
 .lede {{ font-size:18px; color:var(--dim); max-width:74ch; margin:0 0 22px; }}
 .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:0 0 34px; }}
 .meta span {{ font:12px/1 var(--mono); background:#eef1f6; border:1px solid var(--line);
   border-radius:999px; padding:7px 11px; color:var(--dim); }}
 code, .mono {{ font-family:var(--mono); font-size:.9em; }}
 code {{ background:#eef1f6; border-radius:4px; padding:1px 5px; }}
 blockquote {{ margin:12px 0; padding:10px 16px; border-left:3px solid var(--accent);
   background:#f2f6fd; color:#1e2a3a; }}
 table {{ border-collapse:collapse; width:100%; background:var(--card);
   border:1px solid var(--line); border-radius:8px; overflow:hidden; }}
 th, td {{ text-align:left; padding:11px 14px; border-bottom:1px solid var(--line);
   vertical-align:top; font-size:14.5px; }}
 th {{ background:#f4f6fa; font-size:12px; text-transform:uppercase; letter-spacing:.07em;
   color:var(--dim); }}
 tr:last-child td {{ border-bottom:none; }}
 .bench td:first-child {{ width:210px; font-weight:600; }}
 figure {{ margin:0 0 18px; background:var(--card); border:1px solid var(--line);
   border-radius:10px; overflow:hidden; }}
 figure img {{ display:block; width:100%; }}
 figcaption {{ font-size:13px; color:var(--dim); padding:10px 14px; border-top:1px solid var(--line); }}
 .missing figcaption {{ border-top:none; }}
 .shots {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:8px 0 22px; }}
 .shots.one {{ grid-template-columns:1fr; }}
 .sug {{ background:var(--card); border:1px solid var(--line); border-radius:12px;
   padding:24px 26px 20px; margin:0 0 26px; }}
 .sug > header {{ display:flex; gap:16px; align-items:flex-start; margin-bottom:18px; }}
 .num {{ flex:0 0 auto; width:34px; height:34px; border-radius:50%; background:var(--ink);
   color:#fff; font:600 15px/34px var(--mono); text-align:center; }}
 .sug > header > div {{ flex:1 1 auto; }}
 .src {{ margin:4px 0 0; font-size:13px; color:var(--dim); }}
 .verdict {{ flex:0 0 auto; font:600 12px/1 -apple-system,sans-serif; text-transform:uppercase;
   letter-spacing:.06em; padding:8px 12px; border-radius:6px; white-space:nowrap; }}
 .verdict.take {{ background:#e4f5ec; color:var(--take); }}
 .verdict.ask  {{ background:#fdf1dd; color:var(--ask); }}
 .verdict.half {{ background:#eeebfa; color:var(--half); }}
 .verdict.rejected {{ background:#fae7e7; color:#a32f2f; }}
 .rev {{ background:#fdf3f3; border-left:3px solid #a32f2f; padding:10px 14px;
   border-radius:0 6px 6px 0; }}
 .rev + ul {{ margin-top:10px; }}
 .diagram .verdictlbl {{ font:700 12px -apple-system,sans-serif; letter-spacing:.06em; }}
 .diagram .verdictlbl.take {{ fill:var(--take); }}
 .diagram .verdictlbl.rejected {{ fill:#a32f2f; }}
 .diagram .upstream {{ font:10px var(--mono); fill:#a32f2f; }}
 .diagram .wire.faded {{ stroke:#c9ced6; }}
 .diagram .fan.gate rect {{ fill:#eef5ff; stroke:#4f8ef7; }}
 .seam {{ background:var(--card); border:1px solid var(--line); border-radius:12px;
   padding:8px 26px 22px; margin-top:46px; }}
 .seam h2 {{ margin-top:24px; }}
 blockquote.zach {{ border-left:4px solid var(--ink); background:#f4f6fa; color:var(--ink);
   font-size:17px; line-height:1.55; padding:16px 20px; border-radius:0 8px 8px 0; }}
 blockquote.zach cite {{ display:block; margin-top:10px; font:13px -apple-system,sans-serif;
   font-style:normal; color:var(--dim); }}
 .decide td:nth-child(2) {{ width:20%; font-weight:600; }}
 .decide td:first-child {{ width:20%; }}
 .v-take {{ color:var(--take); }} .v-rejected {{ color:#a32f2f; }}
 .v-open {{ color:var(--ask); }} .v-half {{ color:var(--half); }}
 .v-done {{ color:var(--dim); }}
 .grid3 {{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; }}
 .grid3 p:first-of-type {{ margin-top:0; }}
 .grid3 > div > :last-child {{ margin-bottom:0; }}
 .grid3 ul {{ margin:0; padding-left:18px; }}
 .cost {{ margin:18px 0 0; padding-top:14px; border-top:1px solid var(--line);
   font-size:14px; color:var(--dim); }}
 .cost b {{ color:var(--ink); }}
 svg.diagram {{ display:block; width:100%; height:auto; margin:22px 0 4px;
   background:#f7f9fc; border:1px solid var(--line); border-radius:10px; }}
 .diagram text {{ font:12px var(--mono); fill:#2b3341; }}
 .diagram .hd {{ font:600 13px -apple-system,sans-serif; fill:#12151a; }}
 .diagram .note {{ font:12px -apple-system,sans-serif; fill:#5a6472; }}
 .diagram .cap {{ font:11px var(--mono); fill:#78828f; }}
 .diagram .em {{ font-weight:700; fill:#12151a; }}
 .diagram .blk rect {{ fill:#fff; stroke:#9aa4b2; stroke-width:1.4; }}
 .diagram .blk line {{ stroke:#9aa4b2; stroke-width:1.2; }}
 .diagram .blk.src rect {{ fill:#eef5ff; }}
 .diagram .blk.composed rect {{ fill:#eaf6ef; stroke:#3f9b6d; }}
 .diagram .fan rect {{ fill:#fff5e8; stroke:#c98a2e; stroke-width:1.4; }}
 .diagram .region {{ fill:#f2eefc; stroke:#8a72c9; stroke-width:1.4; stroke-dasharray:none; }}
 .diagram .wire {{ fill:none; stroke:#5a6472; stroke-width:1.8; }}
 .diagram .wire.delayed {{ stroke:#c05621; stroke-dasharray:3 4; }}
 .diagram .scribble {{ fill:none; stroke:#e07a3f; stroke-width:2.4; stroke-linecap:round;
   stroke-dasharray:1 7; }}
 .diagram .port {{ fill:#fff; stroke:#5a6472; stroke-width:1.6; }}
 .diagram .split {{ stroke:var(--line); stroke-width:1; }}
 .diagram .badge {{ font:600 12px var(--mono); fill:#c05621; }}
 .diagram .pill {{ font:11px var(--mono); fill:#c05621; }}
 .diagram .pillbox rect {{ fill:#fff; stroke:#c05621; stroke-width:1.5; }}
 .diagram .pillbox.next rect {{ fill:#fff3ea; }}
 .diagram .pillbox text {{ fill:#c05621; }}
 .diagram .chip rect {{ fill:#eef1f6; stroke:#b9c1cc; stroke-width:1; }}
 .diagram .chip.num rect {{ fill:#fff; stroke:#4f8ef7; }}
 .diagram .chip.num .fill {{ fill:#dce9ff; stroke:none; }}
 .diagram .chip.sel rect {{ fill:#fff; stroke:#b06ad9; }}
 .diagram .kind rect {{ fill:#fff; stroke:var(--line); stroke-width:1.2; }}
 .diagram .kindname {{ font:600 13px -apple-system,sans-serif; fill:#12151a; }}
 .diagram .eq {{ font:26px var(--mono); fill:#9aa4b2; }}
 .diagram .arrowlbl {{ font:11px -apple-system,sans-serif; fill:#e07a3f; }}
 .reject ul, .decide ul {{ padding-left:20px; }}
 .reject li {{ margin-bottom:12px; }}
 .decide td:first-child {{ width:26%; }}
 .decide .def {{ color:var(--dim); font-style:italic; }}
 kbd {{ font:11px var(--mono); border:1px solid var(--line); border-bottom-width:2px;
   border-radius:4px; padding:1px 5px; background:#fff; }}
 .sources li {{ margin-bottom:5px; font-size:14px; }}
 a {{ color:var(--accent); }}
 @media (max-width:900px) {{ .grid3, .shots {{ grid-template-columns:1fr; }} }}
</style></head>
<body><div class="wrap">

<h1>Enso, Neva and unit — what to take</h1>
<p class="lede">Three visual/dataflow systems, read from their own sources and driven in a
real browser, against the questions actually open on SystemSketch's bench right now: the
loop grammar, many-to-one, the delayed cable, the literal chip, and how a region gets made. <b>Answered 2026-09-03</b> — the verdicts are at the foot, and the reframe they turn on is one section above them.</p>
<div class="meta">
  <span>HEAD {HEAD}</span><span>branch {BRANCH_NAME}</span>
  <span>{CAPTURE_COUNT} reference captures</span>
  <span>{len(SOURCES)} primary sources</span>
  <span>2026-09-02</span>
</div>

<h2>What is on the bench</h2>
<p>Read from the tree at build time, so this cannot describe a version of the code that
no longer exists.</p>
{bench}

<h2>The three, seen</h2>

<h3>Enso — a node is one line of code, and its arguments are widgets</h3>
<div class="shots">
{figure("ref-enso-live.png", "Enso: <b>parse</b>, <b>filter</b>, <b>aggregate</b> as horizontal pills. Every argument is an inline widget — <code>columns</code> takes a vector editor, <code>condition Equal 2026-09-03</code> opens a calendar. There are no visible input ports; the arguments are the ports.", (1360, 0, 2880, 900), 1100)}
{figure("ref-enso-custom.png", "A visualization hangs under the node with its own type picker (eye · expand · table · chart · list) and a row count. Below: “create and share custom components effortlessly by <b>collapsing graphs</b>”.", (1360, 40, 2880, 1500), 1100)}
</div>
<div class="shots one">
{figure("ref-enso-dual.png", "The same workflow as text: <code>node5 = Data.read … format JSON</code>, and <code>node6</code> is a raw Python block. “One workflow, two equally first-class interfaces.” The gutter names are the bindings — the graph <i>is</i> the source.", (1200, 0, 2880, 1400), 1100)}
</div>

<h3>Neva — the grammar of connections is the whole product</h3>
<div class="shots one">
{figure("ref-neva-0.png", "Neva's own front page is a chained connection: <code>:start -&gt; 'Hello, World!' -&gt; println -&gt; :stop</code>. Its visual editor is still WIP, which is exactly why it is useful here — the <b>rules</b> are written down before the pixels are.", (700, 130, 2180, 1180), 1100)}
</div>

<h3>unit — a live canvas where the gesture is the command</h3>
<div class="shots">
{figure("ref-unit-17.png", "unit's anatomy. Units are circles (<code>pow</code>) with labelled pins (<code>a</code>, <code>b</code>); <b>components render as live UI inside the graph</b> — that slider and number field are real controls. The value <code>0</code> is drawn at the pin, and the green dashed rings are compatible drop targets lighting up mid-gesture.", None, 1100)}
{figure("ref-unit-33.png", "The stroke's shape is the command: a circle made the round <code>untitled</code> unit, a rectangle made the square <code>untitled</code> component. Same gesture, two primitives.", None, 1100)}
</div>
<div class="shots">
{figure("ref-unit-42.png", "“Drawing a contour around a group of nodes will compose those nodes.” The stroke is the command; the result is one unit.", None, 1100)}
{figure("ref-unit-31.png", "Draw outward from the centre to make an output plug; inward to make an input. The direction of the stroke is the polarity.", None, 1100)}
</div>
<div class="shots">
{figure("ref-unit-34.png", "Compose: long press on the background wraps the selection.", None, 1100)}
{figure("ref-unit-35.png", "Explode: the same gesture unwraps it. Composition and decomposition are one motion, not two menu items.", None, 1100)}
</div>
<div class="shots one">
{figure("ref-unit-26.png", "Enter a graph with a long click; leave by long-clicking the background. Editing happens in place, from inside — the same move SystemSketch's step-in makes.", None, 1100)}
</div>

<h2>Seven things to take</h2>
{s1}{s2}{s3}{s4}{s5}{s6}{s7}

{seam}

{not_taking}

{decisions}

<h2>Sources</h2>
<p class="lede" style="font-size:15px">Primary only — project docs and source, plus screenshots
captured by <code>tools/capture_reference_screens.mjs</code> driving headless Chrome over the
live sites. The vault was swept first: Enso was already recorded there for text⇄graph
synchronisation; Neva and unit had no coverage at all.</p>
<ul class="sources">{source_list}</ul>

</div></body></html>
"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024:.0f} KB)")
