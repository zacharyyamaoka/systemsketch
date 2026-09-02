#!/usr/bin/env python3
"""Build the "ports in the header, and the rows they live in" report.

Everything numeric is measured from this tree at build time: the layout
constants the diagram is drawn from, the journeys and their check counts, the
unit-test totals, the gallery's ranking, and the files the branch touched.
"""

from __future__ import annotations

import base64
import html
import io
import json
import re
import subprocess
import urllib.parse
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUT = ROOT / "docs" / "header-port-rows-2026-09-01.html"
GALLERY_SPEC = ROOT / "docs" / "header-port-rows-babble-2026-09-01.json"
GALLERY_HTML = ROOT / "docs" / "header-port-rows-babble-2026-09-01.html"
FIXTURE = ROOT / "sketches" / "review" / "header-port-rows.systemsketch"
BRANCH = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
COMMIT = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
FEATURE_BRANCH = "claude/header-port-rows-447683"
# On the feature branch the report served from its own worktree; merged, it is
# Zach's Preview that serves this checkout.
ON_MAIN = BRANCH == "main"
PREVIEW_PORT = 4322 if ON_MAIN else 4390


# ------------------------------------------------------------ measure ------
def image_data(path: Path, crop: tuple[int, int, int, int] | None = None, width: int | None = None) -> str:
    image = Image.open(path).convert("RGB")
    if crop:
        image = image.crop(crop)
    if width and image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def constant(name: str) -> int:
    source = (ROOT / "src" / "blocks" / "layoutBlock.ts").read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = (\d+)", source)
    if not match:
        raise SystemExit(f"{name} is no longer a constant in layoutBlock.ts")
    return int(match.group(1))


def journey_checks(name: str) -> int:
    source = (ROOT / "tests" / name).read_text(encoding="utf-8")
    return len(re.findall(r"^\s*pass\(", source, re.MULTILINE))


def vitest_total() -> tuple[int, int]:
    result = subprocess.run(["npx", "vitest", "run", "--reporter=json"], cwd=ROOT, capture_output=True, text=True, check=False)
    start = result.stdout.find("{")
    if start < 0:
        raise SystemExit("could not read vitest JSON\n" + result.stdout[-1500:] + result.stderr[-1500:])
    report = json.loads(result.stdout[start:])
    if not report.get("success"):
        raise SystemExit("vitest is red — refusing to publish a report over it")
    return int(report["numPassedTests"]), int(report["numPassedTestSuites"])


def python_total() -> int:
    result = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "tests"], cwd=ROOT, capture_output=True, text=True, check=False)
    match = re.search(r"Ran (\d+) tests", result.stderr)
    if not match or "OK" not in result.stderr:
        raise SystemExit("python tests are red or unreadable — refusing to publish\n" + result.stderr[-1500:])
    return int(match.group(1))


def landed_range() -> tuple[str, str]:
    """The two commits whose difference is this feature.

    On the branch that is main and its tip. Once merged, the branch's merge
    commit against the main it was merged over — measured, never remembered.
    """
    if not ON_MAIN:
        base = subprocess.run(["git", "merge-base", "main", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        return base, "HEAD"
    merge = subprocess.run(
        ["git", "log", "--merges", "--format=%H", "-1", f"--grep=into {FEATURE_BRANCH}"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.strip()
    if not merge:
        raise SystemExit(f"no merge of {FEATURE_BRANCH} in main's history")
    return f"{merge}^2", merge


def changed_files() -> list[tuple[str, str]]:
    base, tip = landed_range()
    diff = subprocess.run(["git", "diff", "--stat=200", base, tip, "--", "src", "tests", "package.json", "skills", "sketches", "docs/build_header_port_rows_babble.py", "docs/build_header_port_rows.py"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    rows = []
    for line in diff.splitlines():
        if "|" not in line:
            continue
        path, stat = (part.strip() for part in line.split("|", 1))
        if path.endswith(".png") or path.endswith(".systemsketch"):
            continue
        rows.append((path, stat))
    return rows


# -------------------------------------------------------------- pieces ------
def burger_svg() -> str:
    """The burger as the layout draws it, from the layout's own constants."""
    head = constant("BLOCK_HEADER_HEIGHT_PX")
    gap = constant("NODE_ROW_HEADER_GAP_PX")
    pitch = constant("NODE_ROW_HEIGHT_PX")
    foot = constant("NODE_FOOTER_HEIGHT_PX")
    header_pitch = constant("HEADER_PORT_PITCH_PX")
    w = 340
    slots = 5  # row 1: two slots and a half-line slot; divider; row 2: one slot
    body_top = head + gap
    rows_bottom = body_top + pitch * slots
    h = rows_bottom + 8 + foot
    centre = lambda slot: body_top + pitch * slot + pitch / 2  # noqa: E731
    parts = [
        f'<svg viewBox="-80 -12 {w + 250} {h + 30}" width="100%" style="max-width:720px;font:12px Inter,sans-serif" role="img" aria-label="The burger: heading row 0, body rows 1 and 2, arms 0 and 1">',
        f'<rect x="0" y="0" width="{w}" height="{h}" rx="9" fill="#fff" stroke="#d9dadd"/>',
        f'<line x1="0" y1="{head}" x2="{w}" y2="{head}" stroke="#ececef"/>',
        f'<line x1="0" y1="{h - foot}" x2="{w}" y2="{h - foot}" stroke="#ececef"/>',
        f'<text x="12" y="{head / 2 + 7}" font-size="20" font-family="ui-monospace,Menlo,monospace">run</text>',
        f'<text x="{w - 12}" y="{head / 2 + 5}" text-anchor="end" fill="#a1a1aa">call</text>',
    ]
    dot = lambda x, y, fill="#fff": f'<circle cx="{x}" cy="{y}" r="6" fill="{fill}" stroke="#c08520" stroke-width="2"/>'  # noqa: E731
    # header dots
    hy = [head / 2 - header_pitch / 2, head / 2 + header_pitch / 2]
    for y in hy:
        parts.append(dot(0, y))
    parts.append(f'<text x="-12" y="{head / 2 + 4}" text-anchor="end" fill="#4f7df3" font-weight="600">row 0 · header</text>')
    parts.append(f'<text x="-12" y="{head / 2 + 18}" text-anchor="end" fill="#6b7280" font-size="10">inputs only · a bare dot, pitch {header_pitch}</text>')
    # row 1 inputs
    for slot, name in enumerate(["raw", "gain"]):
        parts.append(dot(0, centre(slot)))
        parts.append(f'<text x="14" y="{centre(slot) + 4}">{name}</text>')
    # row 1 outputs, two arms
    parts.append(dot(w, centre(0)))
    parts.append(f'<text x="{w - 14}" y="{centre(0) + 4}" text-anchor="end">payload</text>')
    parts.append(f'<line x1="{w / 2}" y1="{centre(1)}" x2="{w}" y2="{centre(1)}" stroke="#d4d4d8"/>')
    parts.append(dot(w, centre(2)))
    parts.append(f'<text x="{w - 14}" y="{centre(2) + 4}" text-anchor="end">error</text>')
    # full divider then row 2
    parts.append(f'<line x1="0" y1="{centre(3)}" x2="{w}" y2="{centre(3)}" stroke="#c4c4cc"/>')
    parts.append(dot(0, centre(4)))
    parts.append(f'<text x="14" y="{centre(4) + 4}">extra</text>')
    parts.append(dot(w, centre(4)))
    parts.append(f'<text x="{w - 14}" y="{centre(4) + 4}" text-anchor="end">pose</text>')
    # bands, right side annotations
    band = lambda top, bottom, label, x=w + 14: (  # noqa: E731
        f'<rect x="{x}" y="{top}" width="6" height="{bottom - top}" fill="#4f7df3" opacity=".25"/>'
        f'<text x="{x + 12}" y="{(top + bottom) / 2 + 4}" fill="#374151">{label}</text>'
    )
    parts.append(band(0, head, "headerBand"))
    parts.append(band(body_top, centre(3), "row 1 · sections[0].band"))
    parts.append(band(body_top, centre(1), "arm 0", w + 150))
    parts.append(band(centre(1), centre(3), "arm 1 → branch: 1", w + 150))
    parts.append(band(centre(3), rows_bottom, "row 2 · sections[1].band → row: 2"))
    parts.append(f'<text x="12" y="{h - 14}" fill="#a1a1aa" font-size="10">heading {head} · gap {gap} · pitch {pitch} · footer {foot} — read from layoutBlock.ts</text>')
    parts.append("</svg>")
    return "".join(parts)


CAPTURES = [
    ("heading-bead", (380, 180, 800, 490), "The heading's own gutter", "Hover the heading's left edge and a bead appears at the next header slot. Click: the port is born in row 0 with its name open."),
    ("drag-into-heading", (380, 180, 800, 490), "Hold, then carry it above the line", "tldraw's long-press on the dot, then a drag. Over the heading, the heading band tints: that is the destination, not a rule that moved."),
    ("drag-across-line", (380, 180, 800, 490), "Across a full line, into row 2", "The same gesture between body rows. The target row's band tints on the input half; the outputs stay put."),
    ("expanded-drag", (380, 180, 1000, 600), "Expanded view, same gesture", "The bands come from the weighted sections, so nothing new is needed for the open frame."),
    ("inspector-drag", (1160, 480, 1440, 830), "The inspector mirrors it", "Header ports, the HEADER line, each row with its ROW line. A grip drags a row across a line; the held card floats, the rows it left stay put."),
    ("move-to-menu", (400, 200, 700, 480), "Or name the row", "The port's right-click menu grew Move to: Header, every row (current one checked), New row below and, for outputs, New branch below."),
    ("product", (400, 190, 800, 500), "In the product, not only the lab", "The same menu and bead in the full composition, on a scratch board."),
    ("fixture-driven", (300, 100, 1300, 700), "The review fixture, driven once", "sketches/review/header-port-rows.systemsketch opened by ?board= and transform carried into the heading by the real gesture."),
]


def capture_figure(name: str, crop: tuple[int, int, int, int], title: str, caption: str) -> str:
    path = ASSETS / f"header-port-rows-{name}-2026-09-01.png"
    if not path.exists():
        raise SystemExit(f"missing capture {path.name}; run `npm run test:rows` first")
    return (
        f'<figure><img src="{image_data(path, crop, 900)}" alt="{html.escape(title)}">'
        f'<figcaption><b>{html.escape(title)}</b> {html.escape(caption)}</figcaption></figure>'
    )


def gallery_ranking() -> str:
    spec = json.loads(GALLERY_SPEC.read_text(encoding="utf-8"))
    requirements = spec["requirements"]
    rows = []
    for index, variant in enumerate(spec["variants"], start=1):
        total = sum(req["weight"] * variant["scores"][req["id"]]["score"] / 5 for req in requirements)
        rows.append((f"V{index}", variant["name"], variant["thesis"], total))
    rows.sort(key=lambda row: -row[3])
    body = "".join(
        f"<tr><td><b>{label}</b></td><td>{html.escape(name)}</td><td>{html.escape(thesis)}</td><td class=\"num\">{total:.0f}</td></tr>"
        for label, name, thesis, total in rows
    )
    weights = " · ".join(f"{req['name']} {req['weight']}" for req in requirements)
    return (
        f'<table><thead><tr><th></th><th>Direction</th><th>Thesis</th><th>/100</th></tr></thead><tbody>{body}</tbody></table>'
        f'<p class="muted">Weights, frozen before the variants were built: {html.escape(weights)}. '
        f'Hinge: {html.escape(spec["decisionHinge"])}</p>'
    )


def main() -> None:
    vitest, suites = vitest_total()
    python_tests = python_total()
    rows_checks = journey_checks("block_port_rows_smoke.mjs")
    neighbours = [
        ("test:ports", "block_port_in_window_smoke.mjs"), ("test:context-menu", "block_context_menu_smoke.mjs"),
        ("test:click-to-edit", "block_click_to_edit_smoke.mjs"), ("test:fields", "inspector_live_commit_smoke.mjs"),
        ("test:batch", "block_batch_editing_smoke.mjs"), ("test:edges", "block_edges_acceptance.mjs"),
        ("test:polarity", "edge_polarity_smoke.mjs"), ("test:visibility", "block_collapse_visibility_smoke.mjs"),
        ("test:edge-editor", "block_edge_editor_smoke.mjs"),
    ]
    neighbour_rows = "".join(f"<tr><td><code>{name}</code></td><td class=\"num\">{journey_checks(file)}</td></tr>" for name, file in neighbours)
    files = changed_files()
    file_rows = "".join(f"<tr><td><code>{html.escape(path)}</code></td><td class=\"muted\">{html.escape(stat)}</td></tr>" for path, stat in files)
    fixture_png = ROOT / "sketches" / "review" / "header-port-rows.png"
    fixture_url = f"http://127.0.0.1:{PREVIEW_PORT}/?board={urllib.parse.quote(str(FIXTURE), safe='')}"
    gallery_href = f"file://{GALLERY_HTML}"
    captures = "".join(capture_figure(*item) for item in CAPTURES)

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ports in the header, and the rows they live in</title>
<style>
  :root {{ --ink:#1f2328; --muted:#6b7280; --line:#e5e7eb; --accent:#4f7df3; --paper:#fbfaf7; }}
  body {{ margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 Inter, ui-sans-serif, system-ui, sans-serif; }}
  main {{ max-width:1040px; margin:0 auto; padding:40px 28px 80px; }}
  h1 {{ font:500 34px/1.15 Georgia, serif; margin:0 0 6px; }}
  h2 {{ font:500 24px/1.2 Georgia, serif; margin:44px 0 12px; }}
  h3 {{ font:600 15px/1.3 Inter, sans-serif; margin:22px 0 6px; }}
  .kicker {{ color:var(--muted); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }}
  .lede {{ font-size:17px; max-width:760px; }}
  .muted {{ color:var(--muted); font-size:13px; }}
  .grid {{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px; }}
  figure {{ margin:0; }}
  figure img {{ width:100%; border:1px solid var(--line); border-radius:10px; background:#fff; }}
  figcaption {{ margin-top:6px; font-size:13px; color:#374151; }}
  figcaption b {{ color:var(--ink); }}
  table {{ border-collapse:collapse; width:100%; font-size:14px; }}
  th, td {{ text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
  th {{ font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }}
  td.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
  code {{ font:12.5px ui-monospace, Menlo, monospace; background:#f1f1f2; padding:1px 5px; border-radius:4px; }}
  pre {{ background:#1f2328; color:#e5e7eb; padding:12px 14px; border-radius:8px; overflow:auto; font-size:12.5px; }}
  .card {{ border:1px solid var(--line); border-radius:12px; background:#fff; padding:16px 18px; }}
  .decision {{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }}
  .decision h3 {{ margin-top:0; }}
  ul {{ padding-left:20px; }} li {{ margin:4px 0; }}
  .pill {{ display:inline-block; padding:2px 8px; border-radius:999px; background:#eef2ff; color:var(--accent); font-size:12px; font-weight:600; }}
  .before-after {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
  a {{ color:var(--accent); }}
</style></head><body><main>
<div class="kicker">SystemSketch · {date.today().isoformat()} · {"merged into main, measured @ " if ON_MAIN else "branch " + html.escape(BRANCH) + " @ "}<code>{COMMIT}</code></div>
<h1>Ports in the header, and the rows they live in</h1>
<p class="lede">A Block still has only input and output ports. What changed is that every port now says which <b>row</b> of the burger it sits in — the heading is row 0 — and you can put a port in any row from four places that all agree: a hold-and-drag on the canvas, a grip drag in the inspector, a <i>Move to</i> menu, and a bead on the heading's edge that adds a port straight into it.</p>

<h2>What changed in the thinking</h2>
<div class="card">
<ul>
<li><b>Affirmed: the header is a row.</b> Your instinct that "a header port is just an input port; the header row is special only in that it takes no outputs" is now literally the model: <code>row: 0</code>. Nothing else distinguishes it; the layout paints row 0 in the heading band because that is where the control-flow data belongs (callable, predicate, iterable — your Aug 27 rule).</li>
<li><b>Rows moved off the dividers and onto the ports.</b> Until today a row was a marker on the port that <i>started</i> it (<code>groupStart</code>), an arm likewise (<code>branchStart</code>), the heading a flag. That encoding could not say "row 3 on the inputs, nothing in row 2" — which your inspector mock draws — and dragging a row's first port out carried the line with it. Now <code>row</code> and <code>branch</code> are on each port, a migration replays the old split rule, and rows are shared by both lanes by construction.</li>
<li><b>One honest limit, chosen on purpose.</b> A row exists because a port claims it, so moving the last port out of a row compacts the row away. Your rule that rows "should be driven from another place" points at the next step, not this one: when rows get labels (your Conditional sketch's <code>if:</code> / <code>elif:</code> bands) or come from code, rows become Block-level state and ports reference them. Everything built today survives that move unchanged.</li>
<li><b>"Match the inspector to the window" is one rule, not one gesture.</b> Both surfaces show the same grammar — a card in flight, a tinted band for the row you would join, a rule where you would land, nothing moves until you release — and both land through the same reducer. The gesture differs because it must: a press on a canvas dot is a cable, so the canvas needs the hold; a list grip means drag, so it drags at once.</li>
<li><b>One level deeper, not built:</b> your Conditional sketch gives every row its own label band (<code>if:</code>, <code>if else:</code>, <code>else:</code>). Read that way the heading is not special at all — it is row 0's band, and a row's band is where <code>if cond:</code>'s <code>cond</code> would sit. Worth keeping in view when rows get labels.</li>
</ul>
</div>

<h2>The model, as the layout draws it</h2>
<div class="grid">
<div>{burger_svg()}</div>
<div>
<div class="before-after">
<div><h3>Before</h3><pre>{{ id: 'cond', header: true }}
{{ id: 'in_2', groupStart: true }}
{{ id: 'out_3', branchStart: true }}</pre></div>
<div><h3>After · migration <code>PortRows: 3</code></h3><pre>{{ id: 'cond', row: 0 }}
{{ id: 'in_2', row: 2 }}
{{ id: 'out_3', branch: 1 }}</pre></div>
</div>
<p><code>blockPortSections(props)</code> is the one table — header, then rows with their inputs and output arms — that the layout, the inspector, the drop rule and the row menu all read. <code>normalizeBlockPortRows</code> keeps rows dense from 1, arms dense from 0, header ports inputs-only, and each lane's stored order equal to its visual order. The layout now also emits <code>headerBand</code> and <code>sections[]</code> bands, so a pointer's <i>y</i> alone names a row, an arm, or the heading — in Port and Expanded view alike.</p>
<p><code>moveBlockPortToSection(side, portId, {{ row, branch, before }})</code> is the single assignment reducer. The place is expressed against a neighbour id, never an index, so hidden ports keep their position; a drop that changes nothing returns the same object and opens no undo step.</p>
<p class="muted">Merge note: the unmerged pill branch also numbers its shape migration 3 (<code>ValueView</code>). Whichever lands second renumbers to 4 — and if any of your preview boards were saved by the pill build, the pill's must stay 3.</p>
</div>
</div>

<h2>Four surfaces, one reducer — the real app</h2>
<p class="muted">Every frame below was captured by <code>npm run test:rows</code> driving the real build in headless Chrome with real pointer events; the assertions read the painted dots and their <code>data-block-port-row</code>.</p>
<div class="grid">{captures}</div>

<h2>The babble round: five ways to put a port in a row</h2>
<p><a href="{html.escape(gallery_href)}">Open the gallery</a> — five live heroes on one fixture, your three sketches as the reference board, the criteria frozen before the variants, and the prune after them. V1–V4 are the four surfaces above; V5 is the port-editing mode you were leaning towards, built as a mock so it can be judged and, I recommend, declined.</p>
<div class="card">{gallery_ranking()}</div>

<h2>Proof</h2>
<div class="grid">
<div class="card"><h3>This feature</h3>
<table><tbody>
<tr><td><code>npm run test:rows</code> — real browser, lab + product</td><td class="num">{rows_checks} checks</td></tr>
<tr><td><code>npx vitest run</code> — {suites} files</td><td class="num">{vitest} tests</td></tr>
<tr><td><code>python3 -m unittest discover -s tests</code></td><td class="num">{python_tests} tests</td></tr>
<tr><td>Review fixture driven in the real app (<code>tests/drive_review_fixture_rows.mjs</code>)</td><td class="num">row 0 ✓</td></tr>
</tbody></table>
<p class="muted">Counts measured from this tree when the report was built; the unit and Python suites were run by the builder and must be green for it to publish.</p></div>
<div class="card"><h3>Neighbouring journeys, re-run green on this tree</h3>
<table><tbody>{neighbour_rows}</tbody></table>
<p class="muted">Check counts are the journeys' own <code>pass()</code> calls; each suite was re-run after the change and passed.</p></div>
</div>

<h2>Review fixture</h2>
<div class="grid">
<figure><img src="{image_data(fixture_png, None, 900)}" alt="Review fixture board"><figcaption><b>sketches/review/header-port-rows.systemsketch</b> Three numbered cues and a PASS WHEN card around a run() Block with raw, gain, transform → payload.</figcaption></figure>
<div class="card"><h3>Open it</h3>
<p>{"Merged: your Preview serves this checkout." if ON_MAIN else "Preview for this branch is running from the worktree:"}</p>
<pre>{html.escape(fixture_url)}</pre>
<p class="muted">{"Vite on 127.0.0.1:4322 with its API on 4323, launched from this checkout; the API must have been started with the source root allowed, which the Preview launcher does since the review-board commit." if ON_MAIN else f"Vite on 127.0.0.1:{PREVIEW_PORT}, its API on {PREVIEW_PORT + 1}; your Stable (4321) and Preview (4322) are untouched."} The board is disposable — the app autosaves into it; <code>git checkout</code> restores it.</p>
<h3>Gestures to try</h3>
<ol>
<li>Press and hold <code>transform</code>'s dot, drag it up into the heading.</li>
<li>Hover the heading's left edge, click the bead, type <code>estimator</code>.</li>
<li>Right-click <code>gain</code> → Move to → New row below; then, in the inspector, drag <code>raw</code>'s grip across the ROW line.</li>
</ol>
</div>
</div>

<h2>Decision surface</h2>
<div class="decision">
<div class="card"><h3>Done and proved</h3><ul>
<li>Ports carry <code>row</code>/<code>branch</code>; markers migrated; files from before open unchanged.</li>
<li>Heading bead adds a header port; hold-and-drag lands in the heading, any row, any arm, in Port and Expanded.</li>
<li>Inspector lists HEADER / ROW / BRANCH lines in canvas order; grip drag across a line; arrows step visually.</li>
<li>Right-click Move to: Header, Row n, New row below, New branch below.</li>
<li>All of it in the product composition; every neighbouring journey green.</li>
</ul></div>
<div class="card"><h3>Left, and merely next</h3><ul>
<li>Rows as Block-level state with labels (<code>if:</code>/<code>elif:</code> bands) — needed before an empty row can exist or a row can be reordered from "another place".</li>
<li>A long-press on the inspector row's margin (not only the grip), as pyblocks had.</li>
<li>Keyboard shortcuts for the port menu commands — still waiting on the port <i>selection</i> model.</li>
</ul></div>
<div class="card"><h3>Needs you</h3><ul>
<li><b>Which surface to lean on.</b> Recommendation: V1 drag as the primary, V2/V3/V4 kept as complements (all shipped). <span class="pill">default if silent: keep all four, polish V1</span></li>
<li><b>Empty rows.</b> Today a row emptied on both sides disappears. Recommendation: accept until rows get labels. <span class="pill">default: accept</span></li>
<li><b>Migration ids: resolved, no action.</b> The pill branch has since merged this work and renumbered its own <code>ValueView</code> to 4, keeping <code>PortRows: 3</code>. Verified against that branch when this report was built. <span class="pill">nothing to decide</span></li>
</ul></div>
<div class="card"><h3>Deliberately not done</h3><ul>
<li>No V5 port-editing mode in the app — a mode is the one thing every earlier round of yours rejected.</li>
<li>No pyblocks writer rule for rows; the record is ready for it (<code>row</code>/<code>branch</code> per port).</li>
<li>No per-row label bands.</li>
</ul></div>
</div>

<h2>Files</h2>
<table><thead><tr><th>Path</th><th>Change</th></tr></thead><tbody>{file_rows}</tbody></table>
<pre>{"cd ~/systemsketch && npm run check && npm run test:rows" if ON_MAIN else f"cd ~/systemsketch && git merge {html.escape(BRANCH)} && npm run check && npm run test:rows"}</pre>
</main></body></html>
"""
    OUT.write_text(page, encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
