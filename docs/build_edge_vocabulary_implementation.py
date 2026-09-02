#!/usr/bin/env python3
"""Build `docs/edge-vocabulary-implementation-2026-09-02.html`.

The delayed-cable vocabulary shipped on `track/edge-vocabulary`: a cable marked
`delayed` draws dotted and carries a z⁻¹ pill that slides along it and can name
its initial value; a Dev Hub switch draws the run after the pill dashed. Every
number here is measured from the tree at build time; the frames come from the
real-browser journey.
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
OUTPUT = DOCS / "edge-vocabulary-implementation-2026-09-02.html"
ACCEPTANCE = ASSETS / "edge-vocabulary-acceptance.json"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


def crop_uri(name: str, box: tuple[int, int, int, int], width: int = 1100) -> str:
    path = ASSETS / name
    if not path.exists():
        return ""
    image = Image.open(path).convert("RGB").crop(box)
    ratio = width / image.width
    image = image.resize((width, int(image.height * ratio)), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def figure(name: str, box: tuple[int, int, int, int], caption: str, width: int = 1100) -> str:
    uri = crop_uri(name, box, width)
    if not uri:
        return f"<figure><figcaption>{caption} — <i>frame missing: run <code>npm run test:edge-vocabulary</code></i></figcaption></figure>"
    return f'<figure><img src="{uri}" alt="{html.escape(caption)}" /><figcaption>{caption}</figcaption></figure>'


# ---------------------------------------------------------------- measured
HEAD = git("rev-parse", "--short", "HEAD")
BRANCH = git("rev-parse", "--abbrev-ref", "HEAD")
COMMITS = [line for line in git("log", "--oneline", "main..HEAD").splitlines() if line]
EDGE_COMMITS = [line for line in git("log", "--oneline", "track/branch-region..HEAD").splitlines() if line]
STAT = git("diff", "--stat", "track/branch-region..HEAD", "--", "src", "tests", "package.json")
MODEL = (REPO / "src/blocks/connections/connectionModel.ts").read_text(encoding="utf-8")
SHAPE = (REPO / "src/blocks/connections/ConnectionShapeUtil.tsx").read_text(encoding="utf-8")
PRESENTATION = (REPO / "src/blocks/connections/connectionPresentation.ts").read_text(encoding="utf-8")
UNIT_TESTS = len(re.findall(r"^\s*it\(", (REPO / "src/blocks/connections/connectionPresentation.test.ts").read_text(encoding="utf-8"), re.M))
MIGRATION = re.search(r"AddTemporalQualifier: (\d+)", SHAPE).group(1)
PILL_MIN = re.search(r"PILL_POSITION_MIN = ([\d.]+)", MODEL).group(1)
PILL_MAX = re.search(r"PILL_POSITION_MAX = ([\d.]+)", MODEL).group(1)
DOT = re.search(r"DELAY_DOT_GAP_PX = (\d+)", PRESENTATION).group(1)
DASH = re.search(r"DELAY_DASH_PX = (\d+)", PRESENTATION).group(1)
STORAGE_KEY = re.search(r"CABLE_PRESENTATION_KEY = '([^']+)'", PRESENTATION).group(1)
checks = json.loads(ACCEPTANCE.read_text(encoding="utf-8")) if ACCEPTANCE.exists() else []
PASSED = sum(1 for c in checks if c.get("ok"))
TRACK_PORT = "4350"
FIXTURE = REPO / "sketches/review/edge-vocabulary.systemsketch"
FIXTURE_URL = f"http://127.0.0.1:{TRACK_PORT}/?board=" + str(FIXTURE).replace("/", "%2F")


def seam_svg() -> str:
    boxes = [
        ("connection record", "temporal · delayValue · pillPosition", "StyleProp + two props, migration v" + MIGRATION),
        ("shared styles", "inspector · right-click · batch", "one write per selection"),
        ("ConnectionShapeUtil", "dotted path · pill · handle", "arc length on the routed polyline"),
        ("Dev Hub switch", "dash after the pill", "an atom, remembered per browser"),
    ]
    parts = ['<svg viewBox="0 0 1100 200" class="seam" role="img" aria-label="The seam">']
    x = 20
    for i, (title, sub, hint) in enumerate(boxes):
        parts.append(f'<rect x="{x}" y="40" width="240" height="120" rx="10" fill="#fff" stroke="#d3d6dd" stroke-width="1.2"/>')
        parts.append(f'<text x="{x + 16}" y="72" font-size="16" font-family="ui-monospace,Menlo,monospace" fill="#1d2230">{html.escape(title)}</text>')
        parts.append(f'<text x="{x + 16}" y="98" font-size="12" font-family="Inter,system-ui,sans-serif" fill="#1d2230">{html.escape(sub)}</text>')
        parts.append(f'<text x="{x + 16}" y="122" font-size="11" font-family="Inter,system-ui,sans-serif" font-style="italic" fill="#6b7686">{html.escape(hint)}</text>')
        if i < len(boxes) - 1:
            parts.append(f'<path d="M{x + 240},100 H{x + 268}" stroke="#15181f" stroke-width="2"/><path d="M{x + 262},94 L{x + 270},100 L{x + 262},106" fill="none" stroke="#15181f" stroke-width="2"/>')
        x += 270
    parts.append("</svg>")
    return "".join(parts)


CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1200px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(32px,5vw,52px);line-height:1.04;letter-spacing:-.04em;margin:10px 0 14px;max-width:960px}
h2{font-size:24px;letter-spacing:-.02em;margin:48px 0 10px}p{max-width:880px}.lede{font-size:17px;color:#39424f;max-width:900px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.fact{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.fact b{display:block;font-size:22px;letter-spacing:-.02em}.fact span{color:var(--muted);font-size:13px}
figure{margin:18px 0;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure img{display:block;width:100%}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}figcaption b{color:var(--ink)}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}.seam{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:14px}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:var(--soft)}
pre{background:#0f1420;color:#dfe6f2;padding:16px 18px;border-radius:12px;overflow:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}pre code{background:none;padding:0;color:inherit}
ul.checks{list-style:none;padding:0;columns:2;column-gap:28px}ul.checks li{break-inside:avoid;padding:4px 0;font-size:13.5px}.tick{color:var(--ok);font-weight:900;margin-right:8px}.cross{color:#d9480f;font-weight:900;margin-right:8px}
.decision{display:grid;grid-template-columns:1fr 1fr;gap:14px}.decision div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.callout{border-left:4px solid var(--accent);background:#eef4ff;padding:12px 16px;border-radius:0 12px 12px 0;max-width:900px;margin:14px 0}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
@media(max-width:900px){.facts,.pair,.decision{grid-template-columns:1fr}ul.checks{columns:1}}
"""


def build() -> str:
    items = "".join(
        f"<li><span class='{'tick' if c.get('ok') else 'cross'}'>{'✓' if c.get('ok') else '✗'}</span> <b>{html.escape(c['id'])}</b> {html.escape(c['label'])}</li>"
        for c in checks
    )
    commits = "".join(f"<li><code>{html.escape(line)}</code></li>" for line in EDGE_COMMITS)
    canvas = (60, 100, 1500, 720)
    wide = (60, 100, 1800, 960)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delayed cable: the z⁻¹ pill</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · track/edge-vocabulary · {HEAD}</div>
<h1>A cable can now be read one iteration late.</h1>
<p class="lede">Mark a cable <b>delayed</b> and it draws dotted with a <b>z⁻¹ pill</b> riding it: centred by default, slid along the cable by its own handle, and naming the initial value in the port-default grammar (<code>z⁻¹ = 1.0</code>). Solid stays the plain data cable; dashed stays reserved for the async rail. A switch in the Dev Hub draws the run after the pill dashed instead, so you can judge the two line styles on a real board. Built on top of the Branch track, proven in a real browser, not merged.</p>
<div class="facts">
<div class="fact"><b>{PASSED}/{len(checks)}</b><span>real-browser checks (<code>npm run test:edge-vocabulary</code>)</span></div>
<div class="fact"><b>{UNIT_TESTS}</b><span>new unit tests on the pure geometry, dash arrays, pill label and the stored switch</span></div>
<div class="fact"><b>v{MIGRATION}</b><span>connection migration: every saved cable becomes <code>data</code>, pill centred, no value</span></div>
<div class="fact"><b>{PILL_MIN}–{PILL_MAX}</b><span>the pill's range along the cable, clear of both ports</span></div>
</div>

<h2>1 · What shipped, in the app</h2>
{figure('edge-vocabulary-2-delayed.png', canvas, '<b>Delayed.</b> The inspector\'s Temporal section marked the cable delayed: dotted end to end, z⁻¹ pill centred on the routed path.')}
<div class="pair">
{figure('edge-vocabulary-3-value.png', canvas, '<b>Initial value.</b> <code>= value</code> in the inspector reads on the pill as <code>z⁻¹ = 1.0</code>.', 560)}
{figure('edge-vocabulary-4-dragged.png', canvas, '<b>Slid along the cable.</b> The pill has its own handle; dragging it stores a new fraction of the arc length. "Centre the pill" puts it back.', 560)}
</div>
{figure('edge-vocabulary-5-dash-after.png', wide, '<b>The Dev Hub switch.</b> "Dash after the z⁻¹ pill": dotted up to the pill, dashed after it. Remembered per browser, off by default.')}
{figure('edge-vocabulary-6-branch-fade.png', canvas, '<b>With the Branch.</b> A delayed cable into a Branch arm keeps its pill and still fades to 18% when another arm is made active.')}

<h2>2 · Dotted, or dash after the pill</h2>
<p>Zach was not sure which reads better once a delayed cable merges with others. Both are one switch apart on the same board, so the question can be settled by drawing rather than arguing. The dots are {DOT}px apart; the dashes {DASH}px long. On a short cable the pill covers most of the run either way; the difference shows on a long back edge.</p>
<div class="pair">
{figure('edge-vocabulary-2-delayed.png', (400, 300, 1100, 460), '<b>Dotted whole cable</b> (default).', 560)}
{figure('edge-vocabulary-5-dash-after.png', (400, 300, 1100, 460), '<b>Dotted before, dashed after the pill</b> (Dev Hub switch).', 560)}
</div>

<h2>3 · The record and the seam</h2>
{seam_svg()}
<p>Three props on the connection: <code>temporal: 'data' | 'delayed'</code> is a tldraw <code>StyleProp</code>, so the inspector, the right-click menu and a batch selection share one write and one shared-or-mixed report, exactly as routing does; <code>delayValue</code> is the text after <code>=</code>; <code>pillPosition</code> is a fraction of the routed arc length. The shape util samples the routed path (exact for elbow and straight, 64 samples for a curve), places the pill by arc length, offers a <code>pill</code> handle that projects the pointer back onto the path, and paints either one dotted path or two copies of the same smooth path with complementary dash arrays normalised to <code>pathLength</code>. The switch is an atom read by every delayed cable and remembered under <code>{STORAGE_KEY}</code>.</p>
<pre><code>{html.escape(STAT)}</code></pre>

<h2>4 · Browser proof</h2>
<p>The journey drives the product composition with real mouse events and reads the record and the painted DOM after each gesture.</p>
<ul class="checks">{items}</ul>

<h2>5 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul><li>Delayed mark, dotted line, z⁻¹ pill with initial value, pill handle drag, centre command, right-click toggle, inspector section, Dev Hub switch, migration, persistence.</li><li>{PASSED}/{len(checks)} browser checks; <code>npm run check</code> green (tsc, vitest, Python incl. the stock-boundary test).</li><li>Review fixture on the track server: <a href="{html.escape(FIXTURE_URL)}">{html.escape(FIXTURE_URL)}</a></li></ul></div>
<div><h4>Left</h4><ul><li>The appearance pill (FigJam-style) does not yet carry a z⁻¹ toggle; the selection pill's Inspect and the right-click menu do.</li><li>Inline double-click editing of the value on the pill; the inspector field is the editor today.</li><li>No Loop region yet: the fixture draws the back edge between two Blocks by hand and says so.</li><li>Export (<code>toSvg</code>) draws the pill and dots, but was not driven.</li></ul></div>
<div><h4>Needs you</h4><ul><li><b>Merge <code>track/edge-vocabulary</code></b> (it contains the Branch track). Default if silent: stays on the track, server up on {TRACK_PORT}.</li><li><b>Which line style</b> after a few real diagrams: dotted whole cable, or dotted-then-dashed. Default if silent: dotted whole cable; the switch stays in the Dev Hub.</li><li><b>Pill text</b>: <code>z⁻¹</code> as shipped, or the word <code>next</code>? Default: <code>z⁻¹</code>.</li></ul></div>
<div><h4>Deliberately not done</h4><ul><li>No landing glyph (M4 was rejected). No colour schemes for wires (noted for later). No async rail.</li><li>No new shape: the pill is part of the cable, so nothing else has to know it exists.</li></ul></div>
</div>

<h2>6 · Commits on this track</h2>
<ul>{commits}</ul>
<footer>Built by <code>docs/build_edge_vocabulary_implementation.py</code> at {HEAD} on {BRANCH} · numbers measured from the tree · frames from the real browser · Claude Code (Fable 5.1), 2026-09-02.</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"head": HEAD, "checks": f"{PASSED}/{len(checks)}", "units": UNIT_TESTS, "commits": len(EDGE_COMMITS)}))
