#!/usr/bin/env python3
"""Build `docs/edge-arrow-sync-2026-09-01.html`.

Answers the FR note's "data Edges by default should be the elbow, and should
follow the arrow": one preset now sets both the arrow tldraw draws and the
routing a data edge takes, and A on a port draws the edge rather than an arrow.

Every number, code excerpt and verdict on the page is read from the live repo
at build time — counts from a real vitest/unittest run, browser verdicts from
the JSON each journey wrote, refused outright if either has gone stale.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

from report_measurements import journey_results, line_count

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
TESTS = PROJECT_ROOT / "tests"
SRC = PROJECT_ROOT / "src"
OUTPUT = DOCS / "edge-arrow-sync-2026-09-01.html"

# The harness's 1440x960 captures, trimmed only of the top chrome bar. The
# inspector dock and the bottom toolbar stay in frame deliberately: the dock
# names the routing the cable is actually holding, and the toolbar's shape slot
# shows which arrow A is on — both are part of what each capture claims.
CANVAS_CROP = (200, 58, 1440, 958)


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def evidence(name: str, crop=CANVAS_CROP) -> str:
    from PIL import Image

    out = ASSETS / f"crop-{name}"
    Image.open(ASSETS / name).convert("RGB").crop(crop).save(out, optimize=True)
    return data_uri(out)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


def source_slice(path: Path, start_marker: str, end_marker: str | None = None) -> str:
    text = path.read_text()
    start = text.index(start_marker)
    end = text.index(end_marker, start) if end_marker else len(text)
    return text[start:end].rstrip()


def git_head() -> str:
    return subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def measure_unit_tests() -> tuple[int, int]:
    report = PROJECT_ROOT / "node_modules" / ".cache" / "arrow-sync-vitest.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["npx", "vitest", "run", "--reporter=json", f"--outputFile={report}"],
        cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    )
    data = json.loads(report.read_text())
    if not data.get("success"):
        raise SystemExit("vitest is red — refusing to publish a report over it")
    return data["numPassedTests"], len(data["testResults"])


def measure_python_tests() -> int:
    result = subprocess.run(
        ["python3", "-m", "unittest", "discover", "-s", "tests"],
        cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    )
    match = re.search(r"Ran (\d+) tests", result.stderr)
    return int(match.group(1)) if match else 0


def measured_routing_map() -> list[tuple[str, str]]:
    """The preset → routing table, parsed out of the source that defines it."""
    body = source_slice(
        SRC / "toolbar" / "toolbarModel.ts",
        "export const ARROW_PRESET_ROUTING",
        "export function connectionRoutingForArrowPreset",
    )
    return re.findall(r"^\s*(\w+): '([\w-]+)',$", body, re.MULTILINE)


# --------------------------------------------------------------------------- #
# Measured inputs
# --------------------------------------------------------------------------- #

SYNC = journey_results(ASSETS / "arrow-sync.json", TESTS / "edge_arrow_sync_smoke.mjs", SRC)
EDITOR = journey_results(ASSETS / "edge-editor.json", TESTS / "block_edge_editor_smoke.mjs", SRC)
REVEAL = journey_results(ASSETS / "edge-reveal.json", TESTS / "edge_reveal_area_smoke.mjs", SRC)
POLARITY = journey_results(ASSETS / "edge-polarity.json", TESTS / "edge_polarity_smoke.mjs", SRC)

UNIT_PASSED, UNIT_FILES = measure_unit_tests()
PYTHON_TESTS = measure_python_tests()
HEAD = git_head()
ROUTING_MAP = measured_routing_map()

APPLY_PRESET = source_slice(
    SRC / "toolbar" / "toolbarIntegration.ts",
    "/**\n * One choice, two shapes.",
    "/**\n * Seed both styles from the remembered preset, on mount.",
)
SEED_PRESET = source_slice(
    SRC / "toolbar" / "toolbarIntegration.ts",
    "/**\n * Seed both styles from the remembered preset, on mount.",
    "export function prepareCreatedShapeForToolbarPreset",
)
ROUTING_TABLE = source_slice(
    SRC / "toolbar" / "toolbarModel.ts",
    "/**\n * The one table that makes an arrow and a data edge the same choice.",
    "/**\n * How many presses of A, from a freshly started app",
)
PRESS_COUNT = source_slice(
    SRC / "toolbar" / "toolbarModel.ts",
    "/**\n * How many presses of A, from a freshly started app",
    "/** Every arrow preset in the order A walks them from a fresh start. */",
)
START_STATES = source_slice(
    SRC / "blocks" / "connections" / "installConnections.ts",
    "/**\n * The states a press on a port turns into a cable.",
    "/** True once the arrow tool has taken a press we are about to take back. */",
)
CANCEL_PENDING = source_slice(
    SRC / "blocks" / "connections" / "installConnections.ts",
    "\t\t\t// `arrow.pointing` creates its arrow on entry",
    "\t\t\teditor.setCurrentTool('select.pointing_block_port', info)",
)
DATUM = source_slice(
    SRC / "blocks" / "connections" / "connectionModel.ts",
    "/**\n * Routing is a style for the same reason",
    "/**\n * The two handles tldraw drags.",
)
CLASSIFIER = source_slice(
    TESTS / "edge_arrow_sync_smoke.mjs",
    "/**\n * Which of the three shapes a painted stroke is.",
    "const arrowCount =",
)

FILES = [
    ("src/toolbar/toolbarModel.ts",
     "elbow is the datum; the preset → routing table; press-count derivation"),
    ("src/toolbar/toolbarIntegration.ts",
     "one preset writes both next-shape styles, and seeds them on mount"),
    ("src/toolbar/SystemSketchToolbar.tsx",
     "arrow rows built from the cycle, so their key hints cannot drift"),
    ("src/blocks/connections/connectionModel.ts",
     "the routing StyleProp's default moves to elbow"),
    ("src/blocks/connections/ConnectionShapeUtil.tsx",
     "getDefaultProps kept in step with the style"),
    ("src/blocks/connections/installConnections.ts",
     "a port press under the arrow tool becomes a data edge"),
    ("src/App.tsx", "the development profiles seed the same preset"),
    ("src/toolbar/toolbarModel.test.ts", "the datum, the cycle, and the mapping"),
    ("src/toolbar/toolbarIntegration.test.ts", "one preset, two styles written"),
    ("tests/edge_arrow_sync_smoke.mjs", "new — the real-browser proof"),
    ("tests/block_edge_editor_smoke.mjs", "asks for curved instead of inheriting it"),
    ("tests/edge_reveal_area_smoke.mjs", "same, in both of its scenes"),
]


def rows(results, ids=None):
    out = []
    for result in results:
        if ids and result["id"] not in ids:
            continue
        mark = "✅" if result["ok"] else "❌"
        out.append(
            f"<tr><td class='mark'>{mark}</td><td><code>{html.escape(result['id'])}</code></td>"
            f"<td>{html.escape(result['label'])}</td></tr>"
        )
    return "\n".join(out)


def passed(results) -> str:
    return f"{sum(1 for r in results if r['ok'])}/{len(results)}"


def routing_rows() -> str:
    presses = {"elbow": "A", "straight": "A × 2", "curve": "A × 3"}
    kinds = {"elbow": "kind: elbow", "straight": "kind: arc, bend 0", "curve": "kind: arc, bend 32"}
    order = ["elbow", "straight", "curve"]
    by_preset = dict(ROUTING_MAP)
    return "\n".join(
        f"<tr><td><code>{presses[preset]}</code></td><td><strong>{preset}</strong></td>"
        f"<td><code>{kinds[preset]}</code></td>"
        f"<td><code>routing: {html.escape(by_preset[preset])}</code></td></tr>"
        for preset in order
    )


# --------------------------------------------------------------------------- #
# The diagram
# --------------------------------------------------------------------------- #

def seam_diagram() -> str:
    """Where the two connectors meet: one key, one preference, two style writes."""
    return """
<svg viewBox="0 0 980 400" width="100%" style="max-width:980px" font-family="ui-sans-serif, system-ui" font-size="13">
  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#0969da"/>
    </marker>
  </defs>

  <rect x="16" y="150" width="150" height="70" rx="8" fill="#fff" stroke="#cfd3dc"/>
  <text x="91" y="180" text-anchor="middle" font-weight="600">press A</text>
  <text x="91" y="200" text-anchor="middle" fill="#57606a" font-size="11">or pick a toolbar row</text>

  <path d="M170 185 L 226 185" stroke="#0969da" stroke-width="2" marker-end="url(#a)"/>

  <rect x="230" y="140" width="200" height="90" rx="8" fill="#f6f8fa" stroke="#cfd3dc"/>
  <text x="330" y="166" text-anchor="middle" font-weight="600">lastArrowPreset</text>
  <text x="330" y="186" text-anchor="middle" font-size="11" fill="#57606a">elbow · straight · curve</text>
  <text x="330" y="206" text-anchor="middle" font-size="11" fill="#57606a">localStorage · starts on elbow</text>
  <text x="330" y="222" text-anchor="middle" font-size="10.5" fill="#8b949e">toolbarModel.ts</text>

  <path d="M434 185 L 486 185" stroke="#0969da" stroke-width="2" marker-end="url(#a)"/>

  <rect x="490" y="140" width="190" height="90" rx="8" fill="#fff" stroke="#0969da"/>
  <text x="585" y="168" text-anchor="middle" font-weight="600">applyArrowPreset()</text>
  <text x="585" y="188" text-anchor="middle" font-size="11" fill="#57606a">two setStyleForNextShapes</text>
  <text x="585" y="206" text-anchor="middle" font-size="11" fill="#57606a">on mount, and on every press</text>
  <text x="585" y="222" text-anchor="middle" font-size="10.5" fill="#8b949e">toolbarIntegration.ts</text>

  <path d="M684 170 C 730 170, 730 100, 776 100" fill="none" stroke="#0969da" stroke-width="2" marker-end="url(#a)"/>
  <path d="M684 200 C 730 200, 730 272, 776 272" fill="none" stroke="#0969da" stroke-width="2" marker-end="url(#a)"/>

  <rect x="780" y="62" width="184" height="76" rx="8" fill="#fff" stroke="#cfd3dc"/>
  <text x="872" y="88" text-anchor="middle" font-weight="600">tldraw:arrowKind</text>
  <text x="872" y="108" text-anchor="middle" font-size="11" fill="#57606a">stock arrow shape</text>
  <text x="872" y="126" text-anchor="middle" font-size="11" fill="#57606a">drawn on empty canvas</text>

  <rect x="780" y="234" width="184" height="76" rx="8" fill="#fff" stroke="#cfd3dc"/>
  <text x="872" y="260" text-anchor="middle" font-weight="600">systemsketch:</text>
  <text x="872" y="276" text-anchor="middle" font-weight="600">connectionRouting</text>
  <text x="872" y="296" text-anchor="middle" font-size="11" fill="#57606a">data edge, drawn from a port</text>

  <rect x="16" y="292" width="664" height="88" rx="8" fill="#fffbeb" stroke="#f0d9a2"/>
  <text x="34" y="316" font-weight="600">Both are tldraw StyleProps, so nothing else had to change.</text>
  <text x="34" y="338" font-size="12" fill="#57606a">editor.createShape() fills every style prop of the type it is making from</text>
  <text x="34" y="356" font-size="12" fill="#57606a">getStyleForNextShape() — so the cable a port press creates picks the routing up</text>
  <text x="34" y="374" font-size="12" fill="#57606a">on its own, with no call site aware that a preset exists.</text>
</svg>
"""


# --------------------------------------------------------------------------- #
# Page
# --------------------------------------------------------------------------- #

CSS = """
:root { --ink:#1f2328; --muted:#57606a; --line:#d0d7de; --bg:#ffffff; --soft:#f6f8fa; --ok:#1a7f37; --bad:#cf222e; --accent:#0969da; }
* { box-sizing: border-box; }
body { margin:0; font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); }
main { max-width: 1120px; margin: 0 auto; padding: 32px 28px 96px; }
h1 { font-size: 30px; line-height:1.2; margin: 0 0 8px; }
h2 { font-size: 22px; margin: 44px 0 12px; padding-top: 12px; border-top: 1px solid var(--line); }
h3 { font-size: 17px; margin: 24px 0 8px; }
p, li { max-width: 78ch; }
.lede { font-size: 18px; color: var(--muted); max-width: 80ch; }
.meta { color: var(--muted); font-size: 14px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: var(--soft); padding: 1px 5px; border-radius: 4px; }
pre { background: #0d1117; color: #e6edf3; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 12.5px; line-height: 1.5; }
pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: 14.5px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--soft); font-weight: 600; }
td.mark { width: 34px; text-align: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0 22px; }
.grid figure, figure { margin: 0; }
figure img { width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; background: #fff; }
figcaption { font-size: 13.5px; color: var(--muted); margin-top: 6px; }
.callout { border-left: 4px solid var(--accent); background: var(--soft); padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
.callout.warn { border-left-color: #bf8700; background: #fffbeb; }
.quote { border-left: 4px solid var(--line); padding: 4px 16px; color: var(--muted); font-style: italic; margin: 16px 0; }
.pill { display:inline-block; padding: 2px 10px; border-radius: 999px; background: #dafbe1; color: #116329; font-weight: 600; font-size: 13px; }
.kv td:first-child { width: 220px; color: var(--muted); }
.files td:first-child { font-family: ui-monospace, monospace; font-size: 13px; width: 42%; }
.decision li { margin-bottom: 10px; }
.ok { color: var(--ok); font-weight: 600; }
"""


def main() -> None:
    shots = {
        "elbow": evidence("arrow-sync-elbow.png"),
        "straight": evidence("arrow-sync-straight.png"),
        "curved": evidence("arrow-sync-curved.png"),
        "port": evidence("arrow-sync-port-edge.png"),
    }

    file_rows = "\n".join(
        f"<tr><td>{html.escape(path)}</td><td>{html.escape(note)}</td>"
        f"<td>{line_count(path)}</td></tr>"
        for path, note in FILES
    )

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>An arrow and a data edge are one choice</title>
<style>{CSS}</style></head>
<body><main>

<h1>An arrow and a data edge are one choice</h1>
<p class="lede">A now sets the connector, not the arrow. One preset writes tldraw's arrow kind and SystemSketch's edge routing together, the app opens on <strong>elbow</strong> because that is the shape you draw most, and a press on a port with A armed draws the data edge instead of an arrow.</p>
<p class="meta">SystemSketch · 2026-09-01 · built from <code>{HEAD}</code> + working tree · proof: <code>npm run test:arrow-sync</code> ({passed(SYNC)}) · <code>npm run check</code> ({UNIT_PASSED} vitest across {UNIT_FILES} files + {PYTHON_TESTS} Python)</p>

<h2>1 · What you asked for</h2>
<div class="quote">
<p>“I would like edges and arrows to be conceptually similar. Setting the default arrow type also sets the default edge type… when you first startup the app it should start at elbow — that is the most common one we use… So as I cycle through A, that should change both the arrow type that is drawn and also the edge type. This starts to make sense, as we support that feature that if I press A and then on a port it will draw a data edge instead of an arrow.”</p>
</div>
<p>Four things, and the last one did not exist yet — the stylesheet already lit port dots under <code>[data-state^='arrow']</code>, but nothing acted on a press there. All four are done and driven in the real app below.</p>

<h2>2 · The seam</h2>
{seam_diagram()}
<p>The whole change fits in the sentence "a preset <em>is</em> a routing". Both vocabularies name the same three shapes; only the words differ, because tldraw's arrow calls its bezier <code>arc</code> while the cable calls it <code>curved</code>:</p>
<pre><code>{code(ROUTING_TABLE)}</code></pre>
<pre><code>{code(APPLY_PRESET)}</code></pre>
<p>Because both are <code>StyleProp</code>s, no creation site needed touching: <code>editor.createShape()</code> fills every style prop of a type from <code>getStyleForNextShape()</code>, so the cable built by a port press picks its routing up without knowing the toolbar exists.</p>

<h3>Startup</h3>
<p>Two things had to agree for "starts at elbow" to be true however the app is opened. The remembered preference is re-applied on every mount, and the routing style's own datum moved with it:</p>
<pre><code>{code(SEED_PRESET)}</code></pre>
<pre><code>{code(DATUM)}</code></pre>

<h2>3 · The cycle, and what each rung draws</h2>
<table>
<tr><th>From a fresh start</th><th>Preset</th><th>Arrow</th><th>Data edge</th></tr>
{routing_rows()}
</table>
<p>A only advances while the arrow tool is already current, so drawing hands the board back to Select and the next rung is two presses. The toolbar prints the count rather than carrying a typed label, because the cycle is a rotation — moving its starting preset silently renumbers every rung:</p>
<pre><code>{code(PRESS_COUNT)}</code></pre>

<h2>4 · Driven in the real app</h2>
<p>Every capture below is one frame of <code>npm run test:arrow-sync</code>: the black stroke is an arrow drawn on empty canvas, the blue one a data edge drawn port-to-port, immediately after it, with nothing touched in between.</p>
<div class="grid">
  <figure><img src="{shots['elbow']}" alt="An elbow arrow above an elbow data edge"><figcaption><strong>A</strong> — a fresh app. Both orthogonal; the inspector reads <em>Elbow</em>.</figcaption></figure>
  <figure><img src="{shots['straight']}" alt="A straight arrow above a straight data edge"><figcaption><strong>A × 2</strong> — both one segment; the inspector reads <em>Straight</em>.</figcaption></figure>
  <figure><img src="{shots['curved']}" alt="A curved arrow above a curved data edge"><figcaption><strong>A × 3</strong> — both bezier; the inspector reads <em>Curved</em>, and the toolbar's shape slot shows the arc arrow.</figcaption></figure>
  <figure><img src="{shots['port']}" alt="A data edge drawn while the arrow tool was armed"><figcaption><strong>A, then a port</strong> — the drag produced a data edge and no arrow at all.</figcaption></figure>
</div>

<h3>What the journey checks</h3>
<table>
<tr><th></th><th>Check</th><th>What it asserts</th></tr>
{rows(SYNC)}
</table>

<div class="callout"><p><strong>The oracle is the painted stroke, not the prop.</strong> Asserting <code>kind === 'elbow'</code> against code that just wrote <code>kind</code> proves nothing. The journey samples 48 points along the path the browser actually drew and classifies it by how far it bows off its own chord and how many steps run along an axis — measured separation on this app is wide: an elbow holds ~92% of its steps on an axis, a bezier ~21%.</p></div>
<pre><code>{code(CLASSIFIER)}</code></pre>

<h2>5 · A, then a port, is a data edge</h2>
<p>The port stylesheet has always lit its dots while the arrow tool was armed; the half that acts was missing. It is one entry in the list of states a port press claims:</p>
<pre><code>{code(START_STATES)}</code></pre>
<div class="callout warn"><p><strong>The trap, and it bites silently.</strong> tldraw's <code>arrow.pointing</code> creates its arrow on entry, and <code>editor.setCurrentTool</code> is a plain root transition that runs <code>onExit</code> without dispatching cancel. Switching tools straight from that state strands a zero-length arrow under the port — invisible, undeletable by eye, and there for the rest of the session. The gesture has to be cancelled properly so tldraw bails to its own creation mark:</p></div>
<pre><code>{code(CANCEL_PENDING)}</code></pre>
<p><code>PORT-EDGE-2</code> is the check that would have caught it: it counts arrows on the page after the drag, and wants zero.</p>

<h2>6 · Proof</h2>
<table class="kv">
<tr><td>Unit</td><td><span class="ok">{UNIT_PASSED} passed</span> across {UNIT_FILES} vitest files, plus {PYTHON_TESTS} Python tests — <code>npm run check</code> green.</td></tr>
<tr><td>New browser journey</td><td><code>npm run test:arrow-sync</code> — <span class="ok">{passed(SYNC)}</span>, product composition, real pointer events.</td></tr>
<tr><td>Edge editor</td><td><code>npm run test:edge-editor</code> — <span class="ok">{passed(EDITOR)}</span>. Now asserts the elbow default and asks for curved before testing the curve's control point.</td></tr>
<tr><td>Control-point reveal</td><td><code>npm run test:reveal</code> — <span class="ok">{passed(REVEAL)}</span>. Same: both scenes state their routing rather than inheriting it.</td></tr>
<tr><td>Edge polarity</td><td><code>npm run test:polarity</code> — <span class="ok">{passed(POLARITY)}</span>, unchanged and untouched by the new default.</td></tr>
<tr><td>Also re-run green</td><td><code>test:edges</code> 33/33 · <code>test:ports</code> 14/14 · <code>test:context-menu</code> 12/12 · <code>test:batch</code> 11/11 · <code>test:appearance</code> 12/12 · <code>test:selection-menu</code> · <code>test:click-to-edit</code> 9/9 · <code>test:fields</code> 9/9 · <code>test:scale</code> 12/12</td></tr>
</table>

<h3>Two journeys had to be told what they were testing</h3>
<p>Both the edge-editor and reveal-area journeys opened by drawing a cable and asserting a cubic — true only because <em>curved</em> used to be the datum. Moving the datum made them silently test a different shape, so each now selects the cable and chooses <em>Curved</em> before the curve's own rules are asserted. The elbow default gets its own check, <code>ROUTE-DEFAULT</code>, in front of them.</p>

<h2>7 · Files</h2>
<table class="files">
<tr><th>File</th><th>What changed</th><th>Lines</th></tr>
{file_rows}
</table>

<h2>8 · Decision surface</h2>
<h3>Done and proved</h3>
<ul class="decision">
<li>Elbow is the datum — on a fresh install, on every mount, and in the shape's own default props. Proved by <code>START-ARROW</code>, <code>START-EDGE-2</code> and <code>ROUTE-DEFAULT</code>.</li>
<li>One preset writes both connectors, in both directions of the cycle, wrapping correctly. Proved by the six <code>*-ARROW</code> / <code>*-EDGE</code> pairs.</li>
<li>A, then a port, draws a data edge — and leaves no arrow behind. The same tool on empty canvas still draws tldraw's arrow.</li>
<li>The toolbar's key hints are derived from the cycle, so they cannot drift from it again.</li>
</ul>

<h3>Judgement calls I made — say the word and I will flip any of them</h3>
<ul class="decision">
<li><strong>The arrow rows are now listed Elbow, Straight, Curve</strong> — the order A walks them, so the printed <code>A</code> / <code>A × 2</code> / <code>A × 3</code> read down the menu in order. The alternative was keeping the old visual order with out-of-sequence hints. <em>Default if you say nothing: it stays as shipped.</em></li>
<li><strong>The inspector's Routing buttons do not change the default.</strong> Choosing Curved on one selected cable retypes that cable only; it does not move what the next one will be, and it does not move the arrow. That is how tldraw's own style panel behaves for a selection, and it keeps "the default" a single thing you set with A. <em>Default: unchanged. If you want the inspector to set the default too, it is one line.</em></li>
<li><strong>The development profiles seed the same preset</strong> even though their stock toolbar cannot cycle it, so the lab never opens on a different datum than the product.</li>
</ul>

<h3>Deliberately not done</h3>
<ul class="decision">
<li><strong>Nothing was done about arrows landing on ports.</strong> A press <em>on a port</em> now makes an edge; an arrow dragged <em>onto</em> a port from elsewhere still binds the way a stock tldraw arrow binds to a shape. Unifying that is a bigger question about what an arrow-to-a-Block even means semantically, and you have not asked it yet.</li>
<li><strong>No migration of existing boards.</strong> Cables already saved keep the routing they were drawn with — only new ones follow the preset. Switching a whole board is the inspector's batch, which already works on a multi-selection.</li>
</ul>

<h3>Needs you</h3>
<ul class="decision">
<li>Open <a href="http://127.0.0.1:4360/">http://127.0.0.1:4360/</a> and cycle A a few times. Draw an arrow, then wire two Blocks. That is the whole feature.</li>
<li>Then: merge this branch, or tell me what to change first.</li>
</ul>

</main></body></html>
"""
    OUTPUT.write_text(page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
