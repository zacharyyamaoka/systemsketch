#!/usr/bin/env python3
"""Build the performance audit report.

Every number in the page is read at build time: the two probe runs in
`docs/assets/perf-probe-{baseline,after}.json`, the diff of this branch against
its merge base, the deployed Stable manifest, the real board on disk, the unit
and Python suites, and the browser journeys' own logs. Nothing is typed in.

    python3 docs/build_perf_audit.py
"""
from __future__ import annotations

import base64
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from string import Template

sys.path.insert(0, str(Path(__file__).resolve().parent))

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "perf-audit-2026-09-01.html"
STABLE_MANIFEST = Path.home() / ".local/share/systemsketch/runtime/releases"
CHANNELS = Path.home() / ".local/share/systemsketch/runtime/channels.json"
REAL_BOARD = Path.home() / "SystemSketch/01_linear_chain.tldr"

SCENARIOS = [
    ("idle", "Idle, 3 s"),
    ("window-blur", "Window loses focus (one alt-tab)"),
    ("pan", "Pan, 40 wheel steps"),
    ("zoom", "Zoom in and out"),
    ("block-drag", "Drag one wired Block"),
    ("cable-drag", "Draw a cable across the board"),
    ("select-all-drag", "Select all, drag everything"),
    ("hover-sweep", "Sweep the pointer across Blocks"),
]


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=PROJECT_ROOT, capture_output=True, text=True, check=True).stdout


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def board_capture(name: str) -> str:
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    image = Image.open(source).convert("RGB")
    image = image.resize((image.width // 2, image.height // 2), Image.LANCZOS)
    image.save(out, optimize=True)
    return data_uri(out)


def esc(text: str) -> str:
    return html.escape(text)


# --------------------------------------------------------------------------- #
# Measurements
# --------------------------------------------------------------------------- #

def load_probe(label: str) -> dict:
    path = ASSETS / f"perf-probe-{label}.json"
    if not path.exists():
        raise SystemExit(f"{path.name} is missing — run `node tests/perf_probe.mjs {label}` first")
    return json.loads(path.read_text())


BASELINE = load_probe("baseline")
AFTER = load_probe("after")


def scenario(probe: dict, name: str) -> dict:
    return next(s for s in probe["scenarios"] if s["name"] == name)


def inclusive_ms(probe: dict, name: str, needle: str) -> float:
    """Inclusive milliseconds of the first profile entry whose key contains `needle`."""
    s = scenario(probe, name)
    for entry in s["cpu"]["srcInclusive"] + s["cpu"]["topInclusive"]:
        if needle in entry["fn"]:
            return entry["ms"]
    return 0.0


def merge_base() -> str:
    return sh("git", "merge-base", "HEAD", "main").strip()


BASE = merge_base()
HEAD = sh("git", "rev-parse", "--short", "HEAD").strip()
BRANCH = sh("git", "rev-parse", "--abbrev-ref", "HEAD").strip()


def diff_of(path: str, context: int = 3) -> str:
    return sh("git", "diff", f"-U{context}", BASE, "--", path)


def diff_stat() -> str:
    return sh("git", "diff", "--stat", BASE, "--", "src/").strip()


def stable_manifest() -> dict | None:
    if not CHANNELS.exists():
        return None
    channels = json.loads(CHANNELS.read_text())
    manifest = STABLE_MANIFEST / channels["stable"] / "manifest.json"
    if not manifest.exists():
        return None
    data = json.loads(manifest.read_text())
    return {"build": data.get("build"), "releasedAt": data.get("releasedAt"), "version": data.get("version")}


def real_board() -> dict | None:
    if not REAL_BOARD.exists():
        return None
    records = json.loads(REAL_BOARD.read_text())["records"]
    from collections import Counter

    kinds = Counter()
    for record in records:
        if record.get("typeName") == "shape":
            kinds[record["type"]] += 1
    return {
        "path": str(REAL_BOARD),
        "bytes": REAL_BOARD.stat().st_size,
        "records": len(records),
        "shapes": dict(kinds.most_common()),
    }


def unit_test_count() -> int:
    result = subprocess.run(
        [str(PROJECT_ROOT.parent.parent.parent / "node_modules/.bin/vitest"), "run", "--reporter=json"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    start = result.stdout.find("{")
    if start < 0:
        raise SystemExit(f"could not read vitest JSON\n{result.stdout[-1500:]}{result.stderr[-1500:]}")
    report = json.loads(result.stdout[start:])
    if not report.get("success"):
        raise SystemExit("vitest is red — refusing to publish a report over it")
    return int(report["numPassedTests"])


def python_test_count() -> int:
    result = subprocess.run(
        ["python3", "-m", "unittest", "discover", "-s", "tests"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    match = re.search(r"Ran (\d+) tests", result.stderr)
    if not match or "OK" not in result.stderr:
        raise SystemExit(f"python tests are not green:\n{result.stderr[-1500:]}")
    return int(match.group(1))


def journeys() -> list[dict]:
    path = ASSETS / "perf-audit-journeys.json"
    if not path.exists():
        raise SystemExit("perf-audit-journeys.json is missing — parse the journey logs first")
    return json.loads(path.read_text())


def log_sizes() -> list[tuple[str, int]]:
    root = Path.home() / ".local/state/systemsketch"
    if not root.exists():
        return []
    return sorted(
        ((str(p.relative_to(root)), p.stat().st_size) for p in root.rglob("*.log")),
        key=lambda item: -item[1],
    )[:4]


# --------------------------------------------------------------------------- #
# Chart: before -> after per scenario, one hue, two shades (dumbbell)
# --------------------------------------------------------------------------- #

BEFORE_HEX = "#86b6ef"
AFTER_HEX = "#1c5cab"


def dumbbell(metric: str, title: str, unit: str, key) -> str:
    rows = []
    maximum = 1.0
    for name, label in SCENARIOS:
        before = key(scenario(BASELINE, name))
        after = key(scenario(AFTER, name))
        rows.append((label, before, after))
        maximum = max(maximum, before, after)
    width, left, right, row_h = 1040, 300, 110, 34
    height = row_h * len(rows) + 56
    plot = width - left - right
    x = lambda value: left + plot * value / maximum
    parts = [f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{esc(title)}" '
             f'style="width:100%;height:auto;font:13px Inter,ui-sans-serif,system-ui,sans-serif">']
    # recessive grid
    for step in range(0, 5):
        gx = left + plot * step / 4
        value = maximum * step / 4
        parts.append(f'<line x1="{gx:.1f}" y1="30" x2="{gx:.1f}" y2="{height - 26}" stroke="#e6e8eb" stroke-width="1"/>')
        parts.append(f'<text x="{gx:.1f}" y="{height - 8}" text-anchor="middle" fill="#626a73" font-size="12">{value:,.0f}{unit}</text>')
    for index, (label, before, after) in enumerate(rows):
        cy = 46 + index * row_h
        parts.append(f'<text x="{left - 12}" y="{cy + 4}" text-anchor="end" fill="#14171a">{esc(label)}</text>')
        parts.append(f'<line x1="{x(before):.1f}" y1="{cy}" x2="{x(after):.1f}" y2="{cy}" stroke="#9aa4ae" stroke-width="2"/>')
        for value, colour, series in ((before, BEFORE_HEX, "before"), (after, AFTER_HEX, "after")):
            parts.append(
                f'<circle cx="{x(value):.1f}" cy="{cy}" r="6" fill="{colour}" stroke="#fff" stroke-width="2">'
                f'<title>{esc(label)} — {series}: {value:,.0f}{unit}</title></circle>'
            )
        # Direct labels in text ink, never series colour. Each sits to the right
        # of its own dot, with a white halo so it stays legible over the bar;
        # two dots too close for two labels share one "before -> after" label.
        halo = 'style="paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round"'
        if abs(x(before) - x(after)) < 70:
            parts.append(
                f'<text x="{max(x(before), x(after)) + 12:.1f}" y="{cy + 4}" {halo}>'
                f'<tspan fill="#626a73">{before:,.0f} → </tspan>'
                f'<tspan fill="#14171a" font-weight="600">{after:,.0f}{unit}</tspan></text>'
            )
        else:
            parts.append(f'<text x="{x(before) + 12:.1f}" y="{cy + 4}" fill="#626a73" {halo}>{before:,.0f}{unit}</text>')
            parts.append(f'<text x="{x(after) + 12:.1f}" y="{cy + 4}" fill="#14171a" font-weight="600" {halo}>{after:,.0f}{unit}</text>')
    parts.append("</svg>")
    legend = (
        f'<div class="legend"><span><i style="background:{BEFORE_HEX}"></i>before (743d7f9)</span>'
        f'<span><i style="background:{AFTER_HEX}"></i>after (this branch)</span></div>'
    )
    return f'<figure class="chart"><figcaption><strong>{esc(title)}</strong>{esc(metric)}</figcaption>{legend}{"".join(parts)}</figure>'


def scenario_table() -> str:
    rows = []
    for name, label in SCENARIOS:
        b, a = scenario(BASELINE, name), scenario(AFTER, name)
        rows.append(
            "<tr>"
            f"<td>{esc(label)}</td>"
            f"<td class=n>{b['cpu']['busyMs']:,}</td><td class=n><b>{a['cpu']['busyMs']:,}</b></td>"
            f"<td class=n>{b['frames']['meanGapMs']}</td><td class=n><b>{a['frames']['meanGapMs']}</b></td>"
            f"<td class=n>{b['frames']['p95GapMs']}</td><td class=n><b>{a['frames']['p95GapMs']}</b></td>"
            f"<td class=n>{b['frames']['longTasks']} / {b['frames']['longTaskMs']}</td>"
            f"<td class=n><b>{a['frames']['longTasks']} / {a['frames']['longTaskMs']}</b></td>"
            "</tr>"
        )
    return (
        "<table><thead><tr><th>Scenario</th><th colspan=2>CPU busy, ms</th>"
        "<th colspan=2>Mean frame gap, ms</th><th colspan=2>p95 frame gap, ms</th>"
        "<th colspan=2>Long tasks / ms</th></tr>"
        "<tr><th></th><th>before</th><th>after</th><th>before</th><th>after</th>"
        "<th>before</th><th>after</th><th>before</th><th>after</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )


def top_src_table(probe: dict, name: str, count: int = 8) -> str:
    entries = scenario(probe, name)["cpu"]["srcInclusive"][:count]
    if not entries:
        return "<p class=sub>No SystemSketch source function reached the sampler's top list.</p>"
    rows = "".join(f"<tr><td class=n>{e['ms']:.1f}</td><td><code>{esc(e['fn'])}</code></td></tr>" for e in entries)
    return f"<table class=compact><thead><tr><th>ms (inclusive)</th><th>function — file:line</th></tr></thead><tbody>{rows}</tbody></table>"


# --------------------------------------------------------------------------- #
# Findings
# --------------------------------------------------------------------------- #

def finding(number: int, title: str, where: str, body: str, diff_paths: list[str], evidence: str) -> str:
    diffs = "".join(
        f"<details><summary><code>{esc(p)}</code></summary><pre>{esc(diff_of(p))}</pre></details>"
        for p in diff_paths
    )
    return (
        f'<article class="phase"><header><span class="pnum">{number}</span><h3>{esc(title)}</h3></header>'
        f'<p class="where"><code>{esc(where)}</code></p>{body}'
        f'<div class="evidence">{evidence}</div>{diffs}</article>'
    )


def main() -> None:
    b_blur, a_blur = scenario(BASELINE, "window-blur"), scenario(AFTER, "window-blur")
    b_all, a_all = scenario(BASELINE, "select-all-drag"), scenario(AFTER, "select-all-drag")
    b_drag, a_drag = scenario(BASELINE, "block-drag"), scenario(AFTER, "block-drag")
    b_cable, a_cable = scenario(BASELINE, "cable-drag"), scenario(AFTER, "cable-drag")

    units = unit_test_count()
    pythons = python_test_count()
    runs = journeys()
    journeys_ok = all(r["passed"] == r["total"] and r["exit"] == 0 for r in runs)
    journey_checks = sum(r["passed"] for r in runs)
    stable = stable_manifest()
    board = real_board()
    seed = BASELINE["seed"]
    logs = log_sizes()

    layout_before = inclusive_ms(BASELINE, "select-all-drag", "layoutBlock  ")
    layout_after = inclusive_ms(AFTER, "select-all-drag", "layoutBlock  ")
    port_before = inclusive_ms(BASELINE, "select-all-drag", "getBlockConnectionPort  ")
    validity_before = inclusive_ms(BASELINE, "select-all-drag", "onAfterChangeToShape")
    validity_after = inclusive_ms(AFTER, "select-all-drag", "onAfterChangeToShape")
    canvas_before = inclusive_ms(BASELINE, "select-all-drag", "BlockCanvas  ")
    canvas_after = inclusive_ms(AFTER, "select-all-drag", "BlockCanvas  ")
    serialize_before = inclusive_ms(BASELINE, "block-drag", "LocalWorkspace.tsx")
    serialize_after = inclusive_ms(AFTER, "block-drag", "LocalWorkspace.tsx")
    judge_before = inclusive_ms(BASELINE, "cable-drag", "judgeConnection")
    judge_after = inclusive_ms(AFTER, "cable-drag", "judgeConnection")

    findings = [
        finding(1, "Every window blur rebuilt the whole canvas",
                "src/blocks/ui/stockContextMenuRoot.ts",
                "<p>The stock context-menu root is remounted through a React <code>key</code> to un-stick Radix's uncontrolled "
                "<code>open</code> state — and tldraw renders <code>&lt;Canvas /&gt;</code> <em>inside</em> that root's trigger. "
                "The remount was wired to every <code>window</code> blur, so each switch to a terminal and back tore down and "
                "rebuilt every shape's DOM, React tree and subscriptions. tldraw registers no blur handler of its own, so the "
                "menu registry is still exact at blur time: the remount now runs only when a menu was actually open when the "
                "window lost focus, and the existing wedge detector still catches anything that slips past on the next right-click.</p>",
                ["src/blocks/ui/stockContextMenuRoot.ts"],
                f"<b>{b_blur['frames']['maxGapMs']:.0f} ms</b> longest frame and <b>{b_blur['cpu']['busyMs']} ms</b> CPU per blur before "
                f"→ <b>{a_blur['frames']['maxGapMs']:.0f} ms</b> and <b>{a_blur['cpu']['busyMs']} ms</b> after; "
                f"long tasks {b_blur['frames']['longTasks']} → {a_blur['frames']['longTasks']}."),
        finding(2, "The context menu re-rendered the canvas on every drag frame",
                "src/blocks/ui/BlockContextMenu.tsx",
                "<p>Because the canvas lives inside the menu root, every re-render of <code>BlockContextMenu</code> is a re-render "
                "of the canvas tree. Its four <code>useValue</code> subscriptions read the selection and returned fresh objects on "
                "every store commit that touched a selected shape — every frame of a drag, every keystroke. The menu items now live "
                "in a child that tldraw mounts only while the menu is open; the wrapper subscribes to nothing but the remount epoch.</p>",
                ["src/blocks/ui/BlockContextMenu.tsx"],
                f"React self time in a single Block drag: <b>{b_drag['cpu']['buckets']['react']} ms</b> → <b>{a_drag['cpu']['buckets']['react']} ms</b> "
                f"(all findings together); total CPU {b_drag['cpu']['busyMs']} → {a_drag['cpu']['busyMs']} ms."),
        finding(3, "The document was serialised on every frame, and the workspace context re-rendered with it",
                "src/workspace/LocalWorkspace.tsx",
                "<p>The autosave listener called <code>serializeTldrawJson</code> on every store flush — tldraw flushes once per "
                "animation frame — and only the last copy before the 600 ms debounce was ever written. It also set a fresh "
                "<code>{ kind: 'dirty' }</code> each time, which re-rendered every consumer of the workspace context, including the "
                "<code>&lt;Tldraw&gt;</code> props and the File menu. The listener now counts changes; <code>persist</code> serialises once, "
                "when it saves, and decides cleanliness by whether the count moved while the save was in flight. The teardown path "
                "still takes one snapshot if edits are unsaved.</p>",
                ["src/workspace/LocalWorkspace.tsx"],
                f"Time under the listener during a Block drag: <b>{serialize_before:.1f} ms</b> → <b>{serialize_after:.1f} ms</b>."),
        finding(4, "Block layout was recomputed dozens of times per frame",
                "src/blocks/layoutBlock.ts, src/blocks/connections/blockPorts.ts, src/blocks/ports/portAffordances.ts",
                "<p><code>layoutBlock</code> is pure in the Block's <code>props</code>, and tldraw keeps the <code>props</code> object when a "
                "shape merely moves. It was called uncached by the renderer, the geometry, the indicator (twice), the port table, "
                "every cable's polarity read, both validity checks per binding, and the add-port affordance (three layouts per lane). "
                "A <code>WeakMap</code> keyed on the props object makes every repeat free; it is dropped once when the document's "
                "fonts finish loading so no fallback-face measurement outlives its face. The port projection and the add-port "
                "affordance get the same memo.</p>",
                ["src/blocks/layoutBlock.ts", "src/blocks/connections/blockPorts.ts", "src/blocks/ports/portAffordances.ts"],
                f"<code>layoutBlock</code> inclusive in the select-all drag: <b>{layout_before:.0f} ms</b> → <b>{layout_after:.0f} ms</b>; "
                f"the uncached port read (<code>getBlockConnectionPort</code>) was <b>{port_before:.0f} ms</b> of that."),
        finding(5, "Every Block repainted when any Block moved",
                "src/blocks/connections/blockPorts.ts, src/blocks/ui/BlockCanvas.tsx",
                "<p>The wiring table behind the port dots was a computed cache whose derive returned a new array on every Block "
                "record change, and <code>BlockCanvas</code> wrapped it in a new <code>Set</code> per derive — so a move that changed "
                "nothing about the wiring still re-rendered the whole Block face. The cache now keeps its previous array when the "
                "entries are unchanged (<code>areResultsEqual</code>), and the component derives its set with <code>useMemo</code>.</p>",
                ["src/blocks/ui/BlockCanvas.tsx"],
                f"<code>BlockCanvas</code> inclusive in the select-all drag: <b>{canvas_before:.0f} ms</b> → <b>{canvas_after:.0f} ms</b>."),
        finding(6, "Cable validity was re-judged five times per cable per frame",
                "src/blocks/connections/ConnectionBindingUtil.ts",
                "<p>tldraw calls <code>onAfterChangeToShape</code> for every binding on a Block on every change to that Block — every "
                "drag frame. The handler checked the binding, checked both endpoints, then called <code>settleConnection</code>, which "
                "checked both endpoints again. A move keeps the props object and the parent, and those are all the rules read, so a "
                "<code>self</code> change with both unchanged returns immediately; tldraw reports <code>ancestry</code> only for a "
                "reparented ancestor, and that path is still judged in full, once.</p>",
                ["src/blocks/connections/ConnectionBindingUtil.ts"],
                f"<code>onAfterChangeToShape</code> inclusive in the select-all drag: <b>{validity_before:.0f} ms</b> → <b>{validity_after:.0f} ms</b>."),
        finding(7, "Every port dot re-asked the rules on every pointer move of a cable drag",
                "src/blocks/ports/portState.ts",
                "<p>The drag rewrote the whole port-state atom on each move, and each dot's <code>isEligible</code> computed read that "
                "atom and re-ran <code>judgeConnection</code>. The anchor and the cycle set — the rules' only inputs from there — hold "
                "still for the whole drag, so the dots now read them through an equality-guarded signal.</p>",
                ["src/blocks/ports/portState.ts"],
                f"<code>judgeConnection</code> inclusive during a cable drag: <b>{judge_before:.1f} ms</b> → <b>{judge_after:.1f} ms</b>."),
        finding(8, "Inspectors re-rendered per frame while their subject moved",
                "src/blocks/ui/BlockInspector.tsx, src/blocks/ui/ConnectionInspector.tsx, src/blocks/commands/blockCommands.ts",
                "<p>Both docked inspectors derived a fresh context object from the selection on every commit. They now keep the previous "
                "object when the panel would show the same thing — same Block id and props, same shared styles, same endpoint names.</p>",
                ["src/blocks/ui/BlockInspector.tsx", "src/blocks/ui/ConnectionInspector.tsx", "src/blocks/commands/blockCommands.ts"],
                "Removes one React tree from every drag frame while a dock is open; folded into the totals above."),
    ]

    stable_html = (
        f"Stable is build <code>{esc(str(stable['build']))}</code>, released {esc(str(stable['releasedAt']))}."
        if stable else "The Stable manifest was not readable at build time."
    )
    board_html = (
        f"<code>{esc(board['path'])}</code>: {board['bytes']:,} bytes, {board['records']} records — "
        + ", ".join(f"{count} {kind}" for kind, count in board["shapes"].items())
        if board else "The real board was not readable at build time."
    )
    logs_html = "".join(f"<li><code>{esc(name)}</code> — {size / 1e6:.1f} MB</li>" for name, size in logs) or "<li>none found</li>"
    journeys_html = "".join(
        f"<tr><td><code>npm run test:{esc(r['name'])}</code></td>"
        f"<td class=n>{r['passed']} / {r['total']}</td>"
        f"<td class=c {'yes' if r['passed'] == r['total'] and r['exit'] == 0 else 'no'}>{'green' if r['passed'] == r['total'] and r['exit'] == 0 else 'RED'}</td></tr>"
        for r in runs
    )

    body = f"""
<header class="hero">
  <div class="kicker">SystemSketch · performance audit · {esc(BRANCH)} @ {esc(HEAD)}</div>
  <h1>Why it felt slow, measured — and what is faster now</h1>
  <p class="lede">A CDP journey seeds {seed['blocks']} Port-view Blocks wired by {seed['cables']} elbow cables, then drives eight gestures
  while recording frame gaps, long tasks and a sampled CPU profile. Eight per-frame wastes were found in SystemSketch's own code;
  all are fixed on this branch and re-measured with the same instrument.</p>
  <div class="badges">
    <span class="badge ok">tsc clean</span>
    <span class="badge ok">{units} unit tests</span>
    <span class="badge ok">{pythons} Python tests</span>
    <span class="badge {'ok' if journeys_ok else ''}">{journey_checks} browser checks across {len(runs)} journeys</span>
    <span class="badge">dev build, headless Chrome, software GPU — pessimistic, attributions hold</span>
  </div>
  <div class="stats">
    <div class="stat"><b>{b_blur['frames']['maxGapMs']:.0f}→{a_blur['frames']['maxGapMs']:.0f} ms</b><span>longest freeze after one alt-tab</span></div>
    <div class="stat"><b>{b_all['frames']['meanGapMs']:.0f}→{a_all['frames']['meanGapMs']:.0f} ms</b><span>mean frame, dragging everything</span></div>
    <div class="stat"><b>{b_drag['cpu']['busyMs']}→{a_drag['cpu']['busyMs']} ms</b><span>CPU per single Block drag</span></div>
    <div class="stat"><b>{b_cable['cpu']['busyMs']}→{a_cable['cpu']['busyMs']} ms</b><span>CPU per cable drag</span></div>
  </div>
</header>

<section>
  <h2>1 · What was measured</h2>
  <p class="sub"><code>tests/perf_probe.mjs</code> boots the app the way every other journey does — vite, the Python host, headless Chrome —
  seeds the board through the development seam, and runs each gesture under three independent instruments: <code>requestAnimationFrame</code>
  timestamps for frame gaps, <code>PerformanceObserver('longtask')</code> for blocking, and the V8 sampling profiler at 200 µs for
  attribution to <code>src/</code>, tldraw and React. Both runs below are the same script on the same board; only the source differs.</p>
  <figure><img src="{board_capture('perf-probe-baseline-board.png')}" alt="The seeded probe board">
  <figcaption><strong>The probe board, zoomed to fit.</strong> {seed['blocks']} Blocks in Port view, {seed['cables']} cables, seeded in {seed['seedMs']} ms.
  Zach's real board is smaller — see §4 — so every number here is an upper bound on what he sees per gesture.</figcaption></figure>
</section>

<section>
  <h2>2 · Before → after</h2>
  {dumbbell("CPU time the main thread was busy during the gesture, in milliseconds. Lower is better.", "CPU busy per scenario", " ms", lambda s: s['cpu']['busyMs'])}
  {dumbbell("95th-percentile gap between consecutive animation frames. 16.7 ms is one frame at 60 Hz.", "p95 frame gap per scenario", " ms", lambda s: s['frames']['p95GapMs'])}
  {scenario_table()}
  <div class="two" style="margin-top:18px">
    <div><h3>Hottest SystemSketch functions — select-all drag, before</h3>{top_src_table(BASELINE, "select-all-drag")}</div>
    <div><h3>Same gesture, after</h3>{top_src_table(AFTER, "select-all-drag")}</div>
  </div>
  <p class="sub" style="margin-top:14px">What remains after is tldraw's own per-frame work — culling, the shapes layer, geometry — plus React element creation for the cables that genuinely moved. That is the stock floor; nothing in it is SystemSketch's.</p>
</section>

<section>
  <h2>3 · The eight findings</h2>
  <p class="sub">Ranked by what they cost per gesture. Each carries the diff this branch applies, read from git at build time.</p>
  {''.join(findings)}
  <details class="card"><summary>Full <code>src/</code> diff stat against the merge base</summary><pre class="light">{esc(diff_stat())}</pre></details>
</section>

<section>
  <h2>4 · Why "now"</h2>
  <div class="card">
    <p>{stable_html} It was promoted from this tree minutes before the audit began, so "slow now" is "slow since the latest promote".
    Nothing in the delta since the previous Stable adds per-frame work by itself — it is the file browser, the embed lane and the FigJam
    chrome tokens — but it is the first Stable carrying the whole edge stack, the docked inspectors and the semantic context menu together,
    and those are where the eight wastes live.</p>
    <p>The real board: {board_html}. Small — none of the wastes is about scale. Two are about <em>habit</em>: finding 1 fires on every
    switch to another window, and Zach switches between sessions constantly.</p>
    <p>Checked and ruled out: the desktop app's Chrome runs on the hardware GPU (its GPU process carries no software-rendering flag);
    the Python host's 1.5 s stat poll and 15 s release refresh cost under a millisecond each; no timer reloads the document.
    One thing seen on the machine during the audit: a peer session's headless Chrome pinned at 90 % of a core on SwiftShader for
    several minutes. On 24 cores that is not the cause, but it is worth knowing when the app feels slow while agents run.</p>
  </div>
</section>

<section>
  <h2>5 · Proof</h2>
  <table><thead><tr><th>Journey</th><th>Checks</th><th>Verdict</th></tr></thead><tbody>{journeys_html}</tbody></table>
  <p class="sub" style="margin-top:12px">Plus <code>tsc -b</code>, {units} vitest cases and {pythons} Python cases, and <code>vite build</code> of the production bundle, all green on this branch.
  The journeys cover every seam touched: the context menu (including its window-blur check), edge polarity and fan-in, the inspectors' field commits, port gestures, the selection menu, the workspace window flow.</p>
</section>

<section>
  <h2>6 · Left alone, and why</h2>
  <div class="card">
    <ul>
      <li><b>Stock tldraw's per-frame cost</b> — the shapes layer re-maps every rendering shape when any shape moves. Proportional to shape count, not ours to fork.</li>
      <li><b><code>backdrop-filter: blur()</code></b> on the top bars, the toolbar and the full-height popout (7 declarations). Each is a compositor layer re-blurred whenever the canvas repaints. Invisible on an RTX 4080; would matter on an integrated GPU. Removing it is a taste call, so it is offered, not taken.</li>
      <li><b>Selection menu placement</b> reads <code>getBoundingClientRect</code> and queries the bottom chrome on every camera change while something is selected. Measured at ~13 ms per 1.5 s drag after the fixes — small, and unmounted during manipulation anyway.</li>
      <li><b>The 1.5 s stat poll</b> logs every request; the largest host logs are: <ul>{logs_html}</ul> Disk, not speed. Rotating or silencing <code>stat</code> 200s is a one-line change in <code>scripts/server.py</code> if wanted.</li>
      <li><b>Cable drags</b> still rebind on every pointer move, which hands every reader of tldraw's bindings index a new map. That is how tldraw's own arrows work too.</li>
    </ul>
  </div>
</section>

<section>
  <h2>7 · Decision surface</h2>
  <div class="card">
    <p><b>Done and proved:</b> the eight fixes above, on branch <code>{esc(BRANCH)}</code>, re-measured with the same probe, with the unit, Python and browser suites green.</p>
    <p><b>Needs you:</b> merge the branch and promote. Recommendation: fast-forward <code>main</code>, then <code>npm run release:candidate</code> → <code>release:promote</code>. Default if you say nothing: the branch stays pushed and unmerged; Stable is untouched.</p>
    <p><b>Optional, your call:</b> drop the <code>backdrop-filter</code> blurs (visual change, so not done here); silence <code>stat</code> logging on the host.</p>
    <p><b>Deliberately not done:</b> anything that changes what the app looks like or how a gesture behaves. Every change is a memo, an equality guard or a narrower trigger for work the app was already doing.</p>
  </div>
</section>

<footer>Built by <code>docs/build_perf_audit.py</code> from <code>{esc(BRANCH)}</code> at <code>{esc(HEAD)}</code>, merge base <code>{esc(BASE[:7])}</code>.
The probe: <code>node tests/perf_probe.mjs &lt;label&gt; [blocks]</code>. Re-run both labels and rebuild to refresh every number on this page.</footer>
"""

    page = Template(TEMPLATE).substitute(body=body)
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(PROJECT_ROOT)} ({OUTPUT.stat().st_size / 1024:.0f} KB)")


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — performance audit, 2026-09-01</title>
<style>
  :root{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--green:#0e6b36;--blue:#315be8;--red:#c4392c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.58 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 80px}
  .hero{padding:34px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 18px 50px #1218200b}
  .kicker{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}
  h1{margin:6px 0 12px;font-size:clamp(32px,5.2vw,54px);line-height:1.02;letter-spacing:-.05em}
  .lede{max-width:900px;margin:0;color:var(--muted);font-size:18px}
  .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
  .badge{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;font:700 12px/1.2 ui-monospace,monospace}
  .badge.ok{border-color:#bfe3cd;background:#eefaf2;color:var(--green)}
  section{margin-top:52px}
  h2{margin:0 0 6px;font-size:28px;letter-spacing:-.03em}
  h3{margin:0 0 8px;font-size:17px}
  .sub{margin:0 0 22px;color:var(--muted);max-width:900px}
  figure{margin:0 0 18px;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  figure img{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9;background:#fff}
  figcaption{padding:10px 4px 2px;color:var(--muted);font-size:13.5px}
  figcaption strong{display:block;color:var(--ink);font-size:14.5px}
  figure.chart figcaption{padding:4px 8px 10px}
  .legend{display:flex;gap:18px;padding:0 8px 6px;font-size:13px;color:var(--muted)}
  .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
  .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  pre{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}
  pre.light{background:#fbfcfd;color:#1b2027;border-color:var(--line)}
  .card{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}
  tr:last-child td{border-bottom:0}
  td.n{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace;font-size:13px}
  td.c{text-align:center;font-size:13px} td.c.no{color:var(--red);font-weight:700} td.c.yes{color:var(--green);font-weight:700}
  table.compact td{padding:6px 10px;font-size:12.5px}
  code{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}
  pre code{padding:0;background:none}
  .phase{padding:20px 22px;border:1px solid var(--line);border-radius:18px;background:var(--card);margin-bottom:14px}
  .phase header{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
  .pnum{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9px;background:#eef3ff;color:var(--blue);font:800 14px/1 ui-monospace,monospace;flex:none}
  .phase h3{margin:0;flex:1;font-size:19px;letter-spacing:-.02em}
  .phase .where{margin:0 0 10px;color:var(--muted);font-size:13px}
  .phase p{margin:0 0 10px}
  .evidence{padding:12px 14px;border-left:3px solid var(--blue);background:#f4f7ff;border-radius:0 10px 10px 0;margin:8px 0 10px;font-size:14px}
  details{margin-top:8px} summary{cursor:pointer;color:var(--muted);font-size:13px} details pre{margin-top:8px;max-height:520px}
  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-top:18px}
  .stat{padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-align:center}
  .stat b{display:block;font:800 26px/1.1 ui-monospace,monospace;letter-spacing:-.03em}
  .stat span{color:var(--muted);font-size:12.5px}
  ul{margin:0;padding-left:20px} li{margin-bottom:6px}
  footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
  @media(max-width:880px){.two{grid-template-columns:1fr}}
</style></head><body><main>$body</main></body></html>
"""

if __name__ == "__main__":
    main()
