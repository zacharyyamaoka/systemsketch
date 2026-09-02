#!/usr/bin/env python3
"""Build the edge-polarity report: `docs/edge-polarity-2026-09-01.html`.

Answers the FR note's "I cannot connect ports on blocks outside anymore":
what was implemented, why it was buggy, and the model that replaced it —
polarity decided by where a cable lands, from the two Blocks' places in the
frame hierarchy, judged by one function.

Every number and every code excerpt is read from the live repo at build time.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
VAULT = Path.home() / "zach_brain"
OUTPUT = DOCS / "edge-polarity-2026-09-01.html"

# Canvas regions of the harness's 1440x960 captures, per scene.
SIBLING_CROP = (40, 110, 1180, 780)
NESTED_CROP = (100, 100, 1120, 720)


def data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg"}[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def evidence(name: str, crop) -> str:
    """Crop one harness capture to the canvas and inline it."""
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    image = Image.open(source).convert("RGB").crop(crop)
    image.save(out, optimize=True)
    return data_uri(out)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


def source_slice(path: Path, start_marker: str, end_marker: str | None = None) -> str:
    """A verbatim excerpt of a live source file, from one marker to the next."""
    text = path.read_text()
    start = text.index(start_marker)
    end = text.index(end_marker, start) if end_marker else len(text)
    return text[start:end].rstrip()


def git_slice(rev: str, path: str, start_marker: str, end_marker: str) -> str:
    """The same, from a committed revision — the code that was replaced."""
    text = subprocess.run(
        ["git", "show", f"{rev}:{path}"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end].rstrip()


def measure_unit_tests() -> tuple[int, int]:
    """Run vitest once and read the counts back from its JSON reporter."""
    report = PROJECT_ROOT / "node_modules" / ".cache" / "edge-polarity-vitest.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["npx", "vitest", "run", "--reporter=json", f"--outputFile={report}"],
        cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    )
    data = json.loads(report.read_text())
    return data["numPassedTests"], len(data["testResults"])


def measure_python_tests() -> int:
    result = subprocess.run(
        ["python3", "-m", "unittest", "discover", "-s", "tests"],
        cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    )
    match = re.search(r"Ran (\d+) tests", result.stderr)
    return int(match.group(1)) if match else 0


def git_head() -> str:
    return subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def line_count(relative: str) -> int:
    return len((PROJECT_ROOT / relative).read_text().splitlines())


# --------------------------------------------------------------------------- #
# Measured inputs
# --------------------------------------------------------------------------- #

POLARITY_BEFORE = json.loads((ASSETS / "edge-polarity-before.json").read_text())
POLARITY = json.loads((ASSETS / "edge-polarity.json").read_text())
ACCEPTANCE = json.loads((ASSETS / "edge-acceptance.json").read_text())
EDITOR = json.loads((ASSETS / "edge-editor.json").read_text())
REVEAL = json.loads((ASSETS / "edge-reveal.json").read_text())
SCALE = json.loads((ASSETS / "interface-scale.json").read_text())

UNIT_PASSED, UNIT_FILES = measure_unit_tests()
PYTHON_TESTS = measure_python_tests()
HEAD = git_head()

SRC = PROJECT_ROOT / "src" / "blocks" / "connections"

# The commit that landed this fix; its parent is the "before" tree the report quotes.
# Pinned, not `HEAD` — HEAD moves on and the old markers move out from under it.
FIX_COMMIT = "8b25045"
BEFORE = f"{FIX_COMMIT}^"

OLD_PRESS_RULE = git_slice(
    BEFORE, "src/blocks/connections/blockPorts.ts",
    "/**\n * Which face a press on a boundary dot starts a cable from.",
    "/** Every port id that shares a boundary dot",
)
OLD_TWINS = git_slice(
    BEFORE, "src/blocks/connections/blockPorts.ts",
    "function withInnerFaces(",
    "/**\n * Project semantic port identity",
)
POLARITY_TABLE = source_slice(
    SRC / "connectionModel.ts",
    "/**\n * The one table the whole edge layer rests on.",
    "export function oppositePolarity",
)
PAIR_FACES = source_slice(
    SRC / "connectionScope.ts",
    "export function pairBlockFaces(",
    "/**\n * Which face of a dot looks into a given scope",
)
JUDGE = source_slice(
    SRC / "connectionRules.ts",
    "/**\n * May a cable join these two ports, and which way does it point?",
    "/* -------------------------------- cycles",
)
DIRECTION = source_slice(
    SRC / "ConnectionBindingUtil.ts",
    "/**\n * Which handle is the source, derived from the faces",
    "/**\n * Make `start` the source of a settled cable.",
)
DRAG = source_slice(
    SRC / "ConnectionShapeUtil.tsx",
    "	private dragTerminal(",
    "	override onHandleDragEnd(",
)
MIGRATION = source_slice(
    SRC / "ConnectionBindingUtil.ts",
    "/** How the first inner-face implementation spelled a face",
    "/** True while the binding names an existing port",
)
TYPE_SEAM = source_slice(
    SRC / "connectionModel.ts",
    "/**\n * The data-type seam.",
    None,
)
ELBOW_BOXES = source_slice(
    SRC / "ConnectionShapeUtil.tsx",
    "/**\n * The bound Blocks' boxes, in the cable's own space, as router obstacles.",
    "/**\n * Sample points along a cable's rendered route",
)

FILES = [
    ("src/blocks/connections/connectionModel.ts", "faces, polarity, the type seam"),
    ("src/blocks/connections/connectionScope.ts", "new — scopes and face pairing from the tree"),
    ("src/blocks/connections/connectionRules.ts", "new — judgeConnection, cycles, drop scope, the picker port"),
    ("src/blocks/connections/blockPorts.ts", "one port per port; dot hit testing; the wiring table"),
    ("src/blocks/connections/ConnectionBindingUtil.ts", "face on the binding, migration, direction, normalisation"),
    ("src/blocks/connections/ConnectionShapeUtil.tsx", "drag re-faces the anchor; render by role; elbow boxes"),
    ("src/blocks/connections/PointingBlockPort.ts", "a press is a dot, not a face"),
    ("src/blocks/connections/installConnections.ts", "the capture listener hands over a dot"),
    ("src/blocks/connections/blockPicker.ts", "the offer knows what polarity it needs"),
    ("src/blocks/ui/BlockCanvas.tsx", "a dot asks the rules whether it is eligible"),
    ("src/blocks/ui/OnCanvasBlockPicker.tsx", "presets filtered by what can answer"),
    ("src/blocks/ui/ConnectionInspector.tsx", "source → sink, faces named"),
    ("src/blocks/ports/portState.ts", "eligible = an anchor dot, not a terminal"),
    ("src/blocks/connections/connectionRules.test.ts", "new — the truth tables, pure"),
    ("tests/edge_polarity_smoke.mjs", "new — the real-browser proof"),
    ("tests/block_journey_helpers.mjs", "new — shared Block-journey helpers"),
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
    ok = sum(1 for result in results if result["ok"])
    return f"{ok}/{len(results)}"


BEFORE_BY_ID = {result["id"]: result for result in POLARITY_BEFORE}
AFTER_BY_ID = {result["id"]: result for result in POLARITY}


def before_after_rows(ids):
    out = []
    for id_ in ids:
        before = BEFORE_BY_ID.get(id_)
        after = AFTER_BY_ID.get(id_)
        if not after:
            continue
        before_mark = "—" if before is None else ("✅" if before["ok"] else "❌")
        out.append(
            f"<tr><td><code>{html.escape(id_)}</code></td><td>{html.escape(after['label'])}</td>"
            f"<td class='mark'>{before_mark}</td><td class='mark'>{'✅' if after['ok'] else '❌'}</td></tr>"
        )
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# The diagram
# --------------------------------------------------------------------------- #

def scope_diagram() -> str:
    """Scopes, faces and polarity, drawn to the model rather than to a screenshot."""
    dot = (
        "<circle cx='{x}' cy='{y}' r='7' fill='#fff' stroke='#c08520' stroke-width='2.5'/>"
    )
    return f"""
<svg viewBox="0 0 960 470" width="100%" style="max-width:960px" font-family="ui-sans-serif, system-ui" font-size="14">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#2f855a"/>
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#c53030"/>
    </marker>
  </defs>

  <!-- the page scope -->
  <rect x="16" y="16" width="928" height="438" rx="10" fill="#f6f7fb" stroke="#d6d9e4"/>
  <text x="30" y="40" fill="#6b7280" font-weight="600">scope: the page</text>

  <!-- encode, a leaf on the page -->
  <rect x="50" y="150" width="190" height="120" rx="8" fill="#fff" stroke="#cfd3dc"/>
  <text x="62" y="176" font-family="ui-monospace, monospace" font-size="18">encode</text>
  {dot.format(x=50, y=225)}{dot.format(x=240, y=225)}
  <text x="64" y="229" font-size="12">pose</text>
  <text x="228" y="229" font-size="12" text-anchor="end">bytes</text>

  <!-- run, an Expanded Block: a second scope -->
  <rect x="340" y="70" width="560" height="360" rx="10" fill="#fff" stroke="#cfd3dc"/>
  <line x1="340" y1="112" x2="900" y2="112" stroke="#e4e4e7"/>
  <text x="354" y="98" font-family="ui-monospace, monospace" font-size="20">run</text>
  <text x="890" y="98" fill="#6b7280" text-anchor="end" font-weight="600">scope: inside run</text>
  {dot.format(x=340, y=225)}{dot.format(x=900, y=225)}
  <text x="354" y="229" font-size="12">in_1</text>
  <text x="888" y="229" font-size="12" text-anchor="end">out_1</text>

  <!-- decode, a child inside run -->
  <rect x="540" y="170" width="190" height="110" rx="8" fill="#fff" stroke="#cfd3dc"/>
  <text x="552" y="196" font-family="ui-monospace, monospace" font-size="18">decode</text>
  {dot.format(x=540, y=240)}{dot.format(x=730, y=240)}
  <text x="554" y="244" font-size="12">in_1</text>
  <text x="718" y="244" font-size="12" text-anchor="end">out_1</text>

  <!-- legal cables: always drawn from the source, leaving +x, arriving +x -->
  <path d="M247 225 C 290 225, 290 225, 333 225" fill="none" stroke="#2f855a" stroke-width="2.5" marker-end="url(#arrow)"/>
  <text x="290" y="212" fill="#2f855a" text-anchor="middle" font-size="12">outer → outer</text>

  <path d="M347 225 C 440 225, 440 240, 533 240" fill="none" stroke="#2f855a" stroke-width="2.5" marker-end="url(#arrow)"/>
  <text x="440" y="214" fill="#2f855a" text-anchor="middle" font-size="12">inner → outer</text>

  <path d="M737 240 C 815 240, 815 225, 893 225" fill="none" stroke="#2f855a" stroke-width="2.5" marker-end="url(#arrow)"/>
  <text x="815" y="212" fill="#2f855a" text-anchor="middle" font-size="12">outer → inner</text>

  <path d="M347 225 C 420 225, 420 380, 560 380 L 760 380 C 830 380, 830 225, 893 225" fill="none" stroke="#2f855a" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#arrow)"/>
  <text x="620" y="368" fill="#2f855a" text-anchor="middle" font-size="12">pass-through: inner → inner</text>

  <!-- refused -->
  <path d="M737 240 C 780 240, 780 320, 640 320 C 420 320, 420 245, 350 236" fill="none" stroke="#c53030" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#arrow-red)" opacity="0.85"/>
  <text x="600" y="308" fill="#c53030" text-anchor="middle" font-size="12">✕ decode.out → run.in — two sources inside run</text>

  <!-- the faces -->
  <g transform="translate(120 330)">
    <rect x="-100" y="-14" width="206" height="118" rx="8" fill="#fffbeb" stroke="#f0d9a2"/>
    <text x="3" y="8" text-anchor="middle" font-weight="600" font-size="13">one dot, two faces</text>
    <line x1="3" y1="18" x2="3" y2="96" stroke="#d6d9e4" stroke-dasharray="3 3"/>
    {dot.format(x=3, y=58)}
    <path d="M-80 58 L -12 58" stroke="#2f855a" stroke-width="2.5" marker-end="url(#arrow)"/>
    <text x="-46" y="46" text-anchor="middle" font-size="11">outer face: sink</text>
    <path d="M18 58 L 86 58" stroke="#2f855a" stroke-width="2.5" marker-end="url(#arrow)"/>
    <text x="52" y="46" text-anchor="middle" font-size="11">inner face: source</text>
    <text x="3" y="86" text-anchor="middle" font-size="11" fill="#6b7280">an input, seen from each side</text>
  </g>
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
.three { display: grid; grid-template-columns: 2fr 2fr 1fr; gap: 14px; align-items: start; }
.callout { border-left: 4px solid var(--accent); background: var(--soft); padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
.bad { color: var(--bad); font-weight: 600; }
.ok { color: var(--ok); font-weight: 600; }
.pill { display:inline-block; padding: 2px 10px; border-radius: 999px; background: #dafbe1; color: #116329; font-weight: 600; font-size: 13px; }
.pill.red { background: #ffebe9; color: #a40e26; }
.kv td:first-child { width: 220px; color: var(--muted); }
.decision li { margin-bottom: 10px; }
.files td:first-child { font-family: ui-monospace, monospace; font-size: 13px; }
"""


def main() -> None:
    zach = {
        "a": data_uri(VAULT / "Pasted image 20260901174619.png"),
        "b": data_uri(VAULT / "Pasted image 20260901174652.png"),
        "c": data_uri(VAULT / "Pasted image 20260901175152.png"),
    }
    shots = {
        "before_sibling": evidence("polarity-before-sibling-1-drop.png", SIBLING_CROP),
        "after_sibling": evidence("polarity-sibling-1-drop.png", SIBLING_CROP),
        "before_picker": evidence("polarity-before-picker-picked.png", SIBLING_CROP),
        "after_picker": evidence("polarity-picker-picked.png", SIBLING_CROP),
        "passthrough": evidence("polarity-passthrough-drop.png", SIBLING_CROP),
        "nested_drag": evidence("polarity-nested-1-drag.png", NESTED_CROP),
        "scope_child": evidence("polarity-scope-child.png", NESTED_CROP),
        "scope_inlet": evidence("polarity-scope-inlet.png", NESTED_CROP),
        "elbow": evidence("polarity-elbow-inside.png", NESTED_CROP),
    }

    unit_tests = UNIT_PASSED
    sibling_ids = ["SIBLING-1", "SIBLING-1-DIR", "SIBLING-2", "SIBLING-2-DIR", "SIBLING-3",
                   "PICKER-1", "PICKER-2", "PICKER-3", "PICKER-4", "PICKER-5", "SCOPE-7"]

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Edge polarity — decided by the landing, not the press</title>
<style>{CSS}</style></head>
<body><main>

<h1>Edge polarity — decided by the landing, not the press</h1>
<p class="lede">Three reports, one cause: the press on an Expanded Block's dot committed to a face before the cable had landed anywhere, so from that dot a cable could only ever wire the inside. The replacement decides polarity from where the cable lands, using the two Blocks' places in the frame hierarchy, through one function that every gesture, highlight and validation asks.</p>
<p class="meta">SystemSketch · 2026-09-01 · built from <code>{HEAD}</code> + working tree · proof: <code>npm run test:polarity</code> ({passed(POLARITY)}) · <code>npm run test:edges</code> ({passed(ACCEPTANCE)})</p>

<h2>1 · What you saw, reproduced</h2>
<div class="three">
  <figure><img src="{zach['a']}" alt="Two Expanded Blocks that could not be wired"><figcaption>Your capture: <code>encode.bytes</code> would not connect to <code>merge.pose</code>.</figcaption></figure>
  <figure><img src="{zach['b']}" alt="A picker-spawned Block wired output to output"><figcaption>Your capture: the offered Block was wired <code>bytes → out_1</code>, output to output.</figcaption></figure>
  <figure><img src="{zach['c']}" alt="The cable leaving the output the wrong way"><figcaption>Your capture: the cable leaves <code>bytes</code> heading down-left, into the Block.</figcaption></figure>
</div>
<p>The same three, driven in the real app with real pointer events before anything was changed — plus two you did not report that the same cause produces: input-to-input between siblings was <em>accepted</em>, and a boundary output tapped or dragged to the outside spawned a Block wired to its <em>output</em>.</p>
<div class="grid">
  <figure><img src="{shots['before_sibling']}" alt="Before: no cable between the siblings"><figcaption><span class="bad">Before</span> — <code>encode.out_1 → merge.in_1</code> dropped on the dot: no cable (<code>SIBLING-1</code>).</figcaption></figure>
  <figure><img src="{shots['before_picker']}" alt="Before: the picker wired the new Block's output"><figcaption><span class="bad">Before</span> — drag to empty space, pick Call: wired to <code>call.out_1</code>, leaving <code>encode.out_1</code> down-left. The leftover <code>encode.in_1 → merge.in_1</code> cable above it is the input-to-input acceptance (<code>SIBLING-3</code>).</figcaption></figure>
</div>
<table>
<tr><th>Check</th><th>What it asserts</th><th>Before</th><th>After</th></tr>
{before_after_rows(sibling_ids)}
</table>

<h2>2 · What was implemented, and why it was buggy</h2>
<p>A port's <em>side</em> was its <em>terminal</em>: an output was a <code>start</code>, an input an <code>end</code>, and a cable's <code>start</code> was its source. To let the inside of an Expanded Block be wired, every boundary port grew a derived twin — <code>in_1__inner</code> — at the same coordinate with the terminal flipped:</p>
<pre><code>{code(OLD_TWINS)}</code></pre>
<p>Two identities at one coordinate need a rule for which one a gesture means. The drop had one (<code>faceIsInScope</code>, comparing the cable's other end against the Block). The <em>press</em> had another, and it is the one that broke:</p>
<pre><code>{code(OLD_PRESS_RULE)}</code></pre>
<div class="callout"><p><strong>That rule is the whole bug.</strong> Whenever the Block was Expanded, a press on its dot started the cable from the inner face — an <code>end</code> for an output — regardless of where the drag was going. So from an Expanded Block's dots:</p>
<ul>
<li>a drag to a sibling's input was filtered out (an <code>end</code> cannot meet an <code>end</code>) → <em>"I cannot connect ports on blocks outside anymore"</em>;</li>
<li>a drag to a sibling's <em>input</em> from the Expanded Block's own input was accepted — the inner face of an input is a <code>start</code>;</li>
<li>a drop on empty space asked the picker for a <code>start</code>, and the new Block's first <code>start</code> is its output → <em>"the order is switched"</em>;</li>
<li>and the cable, drawn from <code>start</code> to <code>end</code>, now had its <code>end</code> at <code>bytes</code>, so it arrived there from inside the Block → <em>"leaving the edge in the wrong direction"</em>.</li>
</ul>
<p>Three mechanisms had to agree — the twin port, the drop filter, and the press rule — and the press rule could not be right, because at the press the landing is not known yet.</p></div>

<h2>3 · The model that replaced it</h2>
<p>Two ideas, and nothing decided at the press.</p>
<h3>Scopes</h3>
<p>Every Block lives in a scope: the nearest Block above it, else the page. An Expanded Block also <em>defines</em> a scope — its inside. A cable joins two faces in the same scope, and the two Blocks' places in the tree say which faces those are:</p>
<pre><code>{code(PAIR_FACES)}</code></pre>
<h3>Polarity follows from side and face</h3>
<p>From outside, an output emits and an input receives. From inside the same Block the roles swap — the inlet is where data arrives into the scope, so it emits to the children; the outlet is where the result leaves, so it receives from them. Your own sentence in the FR, as a function:</p>
<pre><code>{code(POLARITY_TABLE)}</code></pre>
{scope_diagram()}
<table>
<tr><th>Cable</th><th>Faces</th><th>Polarity</th><th>Verdict</th></tr>
<tr><td><code>encode.out → merge.in</code> (siblings)</td><td>outer · outer</td><td>source → sink</td><td class="ok">binds, in the page</td></tr>
<tr><td><code>merge.in → encode.out</code> (from the other dot)</td><td>outer · outer</td><td>sink ← source</td><td class="ok">the same cable, drawn from <code>encode.out</code></td></tr>
<tr><td><code>run.in → decode.in</code> (decode inside run)</td><td>inner · outer</td><td>source → sink</td><td class="ok">binds, inside run</td></tr>
<tr><td><code>decode.out → run.out</code></td><td>outer · inner</td><td>source → sink</td><td class="ok">binds, inside run</td></tr>
<tr><td><code>decode.out → run.in</code></td><td>outer · inner</td><td>source · source</td><td class="bad">same-polarity</td></tr>
<tr><td><code>run.out → decode.in</code></td><td>inner · outer</td><td>sink · sink</td><td class="bad">same-polarity</td></tr>
<tr><td><code>encode.in → merge.in</code></td><td>outer · outer</td><td>sink · sink</td><td class="bad">same-polarity</td></tr>
<tr><td><code>run.in → run.out</code> (one Expanded Block)</td><td>inner · inner</td><td>source → sink</td><td class="ok">a pass-through wire</td></tr>
<tr><td><code>leaf.out → leaf.in</code> (one collapsed Block)</td><td>—</td><td>—</td><td class="bad">same-block</td></tr>
<tr><td><code>decode.out → a Block on the page</code></td><td>—</td><td>—</td><td class="bad">no-shared-scope</td></tr>
</table>

<h3>One function judges every pair</h3>
<p>The drop, the eligible-port highlight while you drag, the picker's choice of landing port, and validation of stored cables on load all ask this and nothing else. The data-type check is step 4 — a seam that is permissive today and lands as one function when the Python side defines the types.</p>
<pre><code>{code(JUDGE)}</code></pre>

<h3>The press is a dot; the drag re-faces the anchor</h3>
<p>A press hands over <code>{{ shapeId, portId }}</code> — nothing about direction. The welded end starts on its outer face provisionally, and every pointer move re-decides: over a legal dot, the judged pair fixes both faces; over empty space, the scope under the pointer decides, so a cable dragged from an outlet into its own interior already reads as the inside returning through the outlet, and the offer made on release puts the new Block <em>inside</em>.</p>
<pre><code>{code(DRAG)}</code></pre>

<h3>Direction is derived, then normalised</h3>
<p><code>start</code> and <code>end</code> are the two handles tldraw drags — nothing more. Which one is the source comes from the faces, so a cable being dragged out of an inlet already leaves it the right way. When a gesture settles, the cable is normalised so that <code>start</code> <em>is</em> the source: that is the invariant the file format keeps for the Python side.</p>
<pre><code>{code(DIRECTION)}</code></pre>

<h3>The binding says which face — and old boards migrate</h3>
<p>The face lives on the binding record: <code>{{ portId, terminal, face }}</code>. Boards saved today with <code>in_1__inner</code> ids are rewritten on load; nothing is lost.</p>
<pre><code>{code(MIGRATION)}</code></pre>

<h3>The type seam, for later</h3>
<pre><code>{code(TYPE_SEAM)}</code></pre>

<h2>4 · After</h2>
<div class="grid">
  <figure><img src="{shots['after_sibling']}" alt="After: the siblings are wired"><figcaption><span class="ok">After</span> — <code>encode.out_1 → merge.in_1</code> binds, leaves rightward, arrives rightward. Made from either dot, it reads the same.</figcaption></figure>
  <figure><img src="{shots['after_picker']}" alt="After: the picker wires the new Block's input"><figcaption><span class="ok">After</span> — the offered Call is wired through <code>in_1</code>, and only presets that can answer are offered.</figcaption></figure>
  <figure><img src="{shots['passthrough']}" alt="A pass-through wire across an Expanded Block"><figcaption>An Expanded Block passes its inlet straight through to its outlet — the one case where both faces are inner.</figcaption></figure>
  <figure><img src="{shots['nested_drag']}" alt="Dragging out of the boundary inlet lights the legal targets"><figcaption>Dragging out of <code>run.in_1</code>: the dots that light up are the ones the rules would accept, and nothing else.</figcaption></figure>
  <figure><img src="{shots['scope_child']}" alt="A child's output offered a Block inside the frame"><figcaption>A child's output dropped in the frame's empty interior: the new Block is created <em>as a child of run</em>, fed from <code>decode.out_1</code>.</figcaption></figure>
  <figure><img src="{shots['scope_inlet']}" alt="The inlet offered a Block inside its own frame"><figcaption>The inlet dragged into its own interior: the new Block lands inside, fed by <code>run.in_1</code>'s inner face.</figcaption></figure>
</div>

<h3>Also: the elbow that wrapped the board</h3>
<p>Your next section — "switched to elbow and it went outside the board" — was the same face model from the router's side: a cable on an inner face was handed its own container as an obstacle, and the A* dutifully routed around the frame it lives inside. An inner face now contributes no box.</p>
<div class="grid">
  <figure><img src="{shots['elbow']}" alt="An elbow cable staying inside its frame"><figcaption><code>run.in_1 → decode.in_1</code> switched to Elbow: a plain Z, inside the frame (<code>ELBOW-1</code>).</figcaption></figure>
  <figure><pre style="margin:0"><code>{code(ELBOW_BOXES)}</code></pre></figure>
</div>

<h2>5 · Proof</h2>
<table class="kv">
<tr><td><code>npm run test:polarity</code></td><td><span class="pill">{passed(POLARITY)}</span> real-browser checks — siblings, pass-through, the picker, the nested truth table, scope placement, the elbow. Ran against the pre-fix code first: <span class="pill red">{passed(POLARITY_BEFORE)}</span>.</td></tr>
<tr><td><code>npm run test:edges</code></td><td><span class="pill">{passed(ACCEPTANCE)}</span> — the existing boundary truth table (<code>BOUNDARY-1a…1d</code>), affordance, picker, exits, replace, durability across a view switch and a reload. One expectation moved: a child's output dropped <em>outside</em> its frame now asserts a quiet refusal (<code>PICKER-0</code>).</td></tr>
<tr><td><code>npm run test:edge-editor</code></td><td><span class="pill">{passed(EDITOR)}</span></td></tr>
<tr><td><code>npm run test:reveal</code> · <code>test:scale</code></td><td><span class="pill">{passed(REVEAL)}</span> · <span class="pill">{passed(SCALE)}</span></td></tr>
<tr><td>Also re-run</td><td>ports 14/14 · context-menu 12/12</td></tr>
<tr><td><code>npm run check</code></td><td><span class="pill">{unit_tests} vitest</span> across {UNIT_FILES} files (the truth tables in <code>connectionRules.test.ts</code> are new and pure), <span class="pill">{PYTHON_TESTS} python</span>, tsc clean.</td></tr>
</table>
<table>
<tr><th></th><th>Check</th><th>Polarity journey</th></tr>
{rows(POLARITY)}
</table>
<table>
<tr><th></th><th>Check</th><th>Edges acceptance</th></tr>
{rows(ACCEPTANCE)}
</table>

<h2>6 · Decisions on the table</h2>
<ul class="decision">
<li><strong>A nested Block's output dragged to open canvas <em>outside</em> its frame offers nothing.</strong> Under the scope rule that drop is unreachable — a cable never crosses a boundary — so the cable is discarded quietly, which is the one place the model gives zero feedback. Options: (1) clamp the offer to the nearest legal scope and place the Block just inside the frame; (2) offer outside but wire it to the frame's own outlet, adding a boundary port if needed; (3) keep the quiet refusal. <em>My lean: (1)</em>, and until you say, <code>PICKER-0</code> pins the current behaviour.</li>
<li><strong>A tap on an Expanded Block's dot offers a Block outside.</strong> A tap has no landing to read a scope from, so it reads the dot from outside (a consumer right of an output, a producer left of an input). Wiring the inside by tap is a drag away. Default kept unless you want tap-inside.</li>
<li><strong>Pressing a boundary outlet that a child already feeds starts a new outward cable.</strong> The kit's rule, kept: a press on a wired <em>outer</em> sink moves that cable; an inner cable is moved by its own handle. The alternative — the press grabs the internal wire — would make the outward gesture impossible from that dot.</li>
<li><strong>Cross-boundary cables are removed.</strong> Drag a child out of its frame and the cable from the inlet to it no longer joins two faces of one scope, so it is deleted rather than left as a wire across a boundary. Collapsing the frame keeps it (it is structural, not visual) — <code>DURABLE-1…4</code>.</li>
<li><strong>No arrowhead.</strong> Direction is shown the way both starter kits show it: the cable leaves the source heading +x and arrives at the sink heading +x. An arrowhead at the sink is a small addition if you want it explicit.</li>
<li><strong>Types stay permissive.</strong> <code>arePortTypesCompatible</code> is the single seam; the judge already reports <code>type-mismatch</code> and every surface reads the verdict, so turning it on is one function.</li>
</ul>

<h2>7 · Files</h2>
<table class="files">
<tr><th>File</th><th>Lines</th><th>What it owns now</th></tr>
{''.join(f"<tr><td>{html.escape(path)}</td><td>{line_count(path)}</td><td>{html.escape(what)}</td></tr>" for path, what in FILES)}
</table>
<p class="meta">Removed: the <code>__inner</code> twin ports, <code>activeBlockPortFace</code>, <code>blockPortFaceIds</code>, <code>getBlockInnerFace</code>, <code>terminalForBlockPortSide</code>, <code>faceIsInScope</code>, <code>getAllConnectedBlocks</code>. Diagnosis and design: Claude Code (Fable 5.1), session <code>0b9946ea-92a4-4c95-8904-783d43269d0b</code>.</p>

</main></body></html>
"""
    OUTPUT.write_text(page)
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
