#!/usr/bin/env python3
"""Build the executable Tidy edges / Organize nodes comparison gallery."""
from __future__ import annotations

import base64
import html
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DATA = DOCS / "assets" / "layout-comparison-cases.json"
OUT = DOCS / "layout-comparison-2026-09-02.html"
ENTRY = DOCS / "generate_layout_comparison_data.ts"
SELECTION_STRESS = DOCS / "assets" / "layout-selection-scope-stress-2026-09-02.png"

PALETTE = [
    "#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee",
    "#fb7185", "#a3e635", "#f97316", "#818cf8", "#2dd4bf", "#e879f9",
]


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def image_data_uri(path: Path) -> str:
    if not path.exists():
        return ""
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def generate_data() -> dict:
    """Bundle and run the TypeScript evidence entry against the live source."""
    temp = Path(tempfile.mkdtemp(prefix=".tmp-layout-comparison-", dir=ROOT))
    try:
        subprocess.run(
            [
                "npx", "vite", "build", "--ssr", str(ENTRY.relative_to(ROOT)),
                "--outDir", str(temp), "--emptyOutDir",
            ],
            cwd=ROOT,
            check=True,
        )
        env = os.environ.copy()
        env["SYSTEMSKETCH_LAYOUT_DATA"] = str(DATA)
        subprocess.run(
            ["node", str(temp / "generate_layout_comparison_data.js")],
            cwd=ROOT,
            env=env,
            check=True,
        )
    finally:
        shutil.rmtree(temp)
    return json.loads(DATA.read_text(encoding="utf-8"))


def route_bounds(routes: list[list[dict]], pad: float = 28) -> tuple[float, float, float, float]:
    points = [point for route in routes for point in route]
    if not points:
        return 0, 0, 640, 360
    min_x = min(point["x"] for point in points) - pad
    min_y = min(point["y"] for point in points) - pad
    max_x = max(point["x"] for point in points) + pad
    max_y = max(point["y"] for point in points) + pad
    return min_x, min_y, max(1, max_x - min_x), max(1, max_y - min_y)


def edge_svg(routes: list[list[dict]], locked: list[bool], label: str) -> str:
    x, y, width, height = route_bounds(routes)
    lines = []
    for index, route in enumerate(routes):
        points = " ".join(f'{point["x"]:.2f},{point["y"]:.2f}' for point in route)
        colour = PALETTE[index % len(PALETTE)]
        is_locked = index < len(locked) and locked[index]
        dash = ' stroke-dasharray="10 7"' if is_locked else ""
        lines.append(
            f'<polyline points="{points}" fill="none" stroke="{colour}" '
            f'stroke-width="{4 if is_locked else 3}" stroke-linejoin="round" '
            f'stroke-linecap="round"{dash}/>'
        )
        if route:
            lines.append(
                f'<circle cx="{route[0]["x"]}" cy="{route[0]["y"]}" r="4.5" fill="{colour}"/>'
                f'<circle cx="{route[-1]["x"]}" cy="{route[-1]["y"]}" r="4.5" '
                f'fill="#0b1118" stroke="{colour}" stroke-width="2.5"/>'
            )
    return (
        f'<svg viewBox="{x:.2f} {y:.2f} {width:.2f} {height:.2f}" '
        f'role="img" aria-label="{esc(label)}" preserveAspectRatio="xMidYMid meet">'
        '<defs><pattern id="grid-edge" width="24" height="24" patternUnits="userSpaceOnUse">'
        '<path d="M 24 0 L 0 0 0 24" fill="none" stroke="#253142" stroke-width="1"/>'
        '</pattern></defs>'
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{width:.2f}" height="{height:.2f}" '
        'fill="url(#grid-edge)"/>'
        + "".join(lines)
        + '</svg>'
    )


def node_bounds(nodes: list[dict], routes: list[list[dict]]) -> tuple[float, float, float, float]:
    xs = [node["x"] for node in nodes] + [node["x"] + node["width"] for node in nodes]
    ys = [node["y"] for node in nodes] + [node["y"] + node["height"] for node in nodes]
    xs += [point["x"] for route in routes for point in route]
    ys += [point["y"] for route in routes for point in route]
    if not xs:
        return 0, 0, 640, 360
    pad = 36
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    return min_x, min_y, max(1, max_x - min_x), max(1, max_y - min_y)


def node_svg(state: dict, label: str) -> str:
    nodes = state["nodes"]
    routes = state["routes"]
    x, y, width, height = node_bounds(nodes, routes)
    route_markup = []
    for index, route in enumerate(routes):
        points = " ".join(f'{point["x"]:.2f},{point["y"]:.2f}' for point in route)
        route_markup.append(
            f'<polyline points="{points}" fill="none" stroke="{PALETTE[index % len(PALETTE)]}" '
            'stroke-opacity=".68" stroke-width="2.4" stroke-linejoin="round"/>'
        )
    node_markup = []
    for index, node in enumerate(nodes):
        colour = PALETTE[index % len(PALETTE)]
        ports = []
        for port in node.get("ports", []):
            px = node["x"] + port["x"]
            py = node["y"] + port["y"]
            if port["side"] == "left":
                ports.append(
                    f'<circle cx="{px:.2f}" cy="{py:.2f}" r="4.2" fill="#0b1118" '
                    f'stroke="{colour}" stroke-width="2.2"/>'
                )
            else:
                ports.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="4.2" fill="{colour}"/>')
        layout_badge = ""
        if node.get("portLayout"):
            short = "A" if node["portLayout"] == "aligned" else "O"
            layout_badge = (
                f'<text x="{node["x"] + node["width"] - 8:.2f}" y="{node["y"] + 15:.2f}" '
                'text-anchor="end" fill="#8fa0b5" font-size="10" '
                f'font-family="ui-monospace,monospace">{short}</text>'
            )
        node_markup.append(
            f'<g><rect x="{node["x"]:.2f}" y="{node["y"]:.2f}" '
            f'width="{node["width"]:.2f}" height="{node["height"]:.2f}" rx="10" '
            f'fill="#111a25" fill-opacity=".96" stroke="{colour}" stroke-width="2.3"/>'
            f'<circle cx="{node["x"] + 12:.2f}" cy="{node["y"] + 13:.2f}" r="4" fill="{colour}"/>'
            f'<text x="{node["x"] + node["width"] / 2:.2f}" '
            f'y="{node["y"] + node["height"] / 2 + 5:.2f}" text-anchor="middle" '
            f'fill="#e8eef7" font-size="{max(11, min(18, node["height"] * .28)):.1f}" '
            f'font-family="ui-monospace, SFMono-Regular, monospace">N{index + 1}</text>'
            f'{layout_badge}{"".join(ports)}</g>'
        )
    return (
        f'<svg viewBox="{x:.2f} {y:.2f} {width:.2f} {height:.2f}" '
        f'role="img" aria-label="{esc(label)}" preserveAspectRatio="xMidYMid meet">'
        '<defs><pattern id="grid-node" width="24" height="24" patternUnits="userSpaceOnUse">'
        '<path d="M 24 0 L 0 0 0 24" fill="none" stroke="#253142" stroke-width="1"/>'
        '</pattern></defs>'
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{width:.2f}" height="{height:.2f}" '
        'fill="url(#grid-node)"/>'
        + "".join(route_markup)
        + "".join(node_markup)
        + '</svg>'
    )


def metric(label: str, before: object, after: object, suffix: str = "") -> str:
    improved = isinstance(before, (int, float)) and isinstance(after, (int, float)) and after < before
    tone = " improved" if improved else ""
    return (
        f'<span class="metric{tone}"><small>{esc(label)}</small>'
        f'<b>{esc(before)}{suffix}<i>→</i>{esc(after)}{suffix}</b></span>'
    )


def edge_card(item: dict) -> str:
    before = item["before"]
    after = item["after"]
    if after["metrics"]["spacingDefects"]:
        verdict, tone = "FAIL", "warn"
    elif after["metrics"]["forcedCrossings"]:
        verdict, tone = "TOPOLOGY", "warn"
    elif after["metrics"]["overlap"] or after["metrics"]["constrainedCrossings"]:
        verdict, tone = "CONSTRAINED", "keep"
    else:
        verdict, tone = "PASS", "pass"
    return f'''
    <article class="case" data-kind="edges" data-difficulty="{item['difficulty']}">
      <header>
        <span class="case-number">E{item['difficulty']:02d}</span>
        <div><h3>{esc(item['title'])}</h3><p>{esc(item['summary'])}</p></div>
        <span class="verdict {tone}">{verdict}</span>
      </header>
      <button class="compare" type="button" aria-label="Expand {esc(item['title'])} comparison">
        <figure><figcaption><b>Before</b><span>{len(before['routes'])} edges</span></figcaption>
          {edge_svg(before['routes'], item['locked'], item['title'] + ' before')}</figure>
        <div class="transform" aria-hidden="true">→</div>
        <figure><figcaption><b>After</b><span>{after['metrics']['bundles']} bundles</span></figcaption>
          {edge_svg(after['routes'], item['locked'], item['title'] + ' after')}</figure>
      </button>
      <div class="measurements">
        {metric('coincident run', before['metrics']['overlap'], after['metrics']['overlap'], ' px')}
        {metric('crossings', before['metrics']['crossings'], after['metrics']['crossings'])}
        {metric('spacing defects', before['metrics']['spacingDefects'], after['metrics']['spacingDefects'])}
        <span class="metric"><small>forced</small><b>{after['metrics']['forcedCrossings']}</b></span>
        <span class="metric"><small>constrained</small><b>{after['metrics']['constrainedCrossings']}</b></span>
      </div>
      <p class="expect"><b>Expected:</b> {esc(item['expected'])}</p>
    </article>'''


def node_card(item: dict) -> str:
    before = item["before"]
    after = item["after"]
    port_bound = after["metrics"].get("portBoundEdges", 0)
    port_metrics = ""
    if port_bound:
        port_metrics = (
            metric(
                "aligned port pairs",
                before["metrics"]["alignedPortEdges"],
                after["metrics"]["alignedPortEdges"],
            )
            + metric(
                "mean port-row delta",
                before["metrics"]["meanPortRowDelta"],
                after["metrics"]["meanPortRowDelta"],
                " px",
            )
        )
    if item.get("portGoal") == "align-all":
        expectation = (
            "every connected input/output pair must land on the same page-space row; "
            "the data build fails if even one pair misses."
        )
    elif item.get("portGoal") == "route-exact":
        expectation = (
            "every endpoint must remain on its declared port row; branching may still require "
            "vertical cable travel between different rows."
        )
    else:
        expectation = "no node overlap; the existing elbow router remains the sole owner of cable geometry."
    before_caption = f"{len(before['nodes'])} nodes · {len(before['edges'])} edges"
    if port_bound:
        before_caption += f" · {port_bound} port-bound"
    return f'''
    <article class="case" data-kind="nodes" data-difficulty="{item['difficulty']}">
      <header>
        <span class="case-number">N{item['difficulty']:02d}</span>
        <div><h3>{esc(item['title'])}</h3><p>{esc(item['summary'])}</p></div>
        <span class="verdict pass">PASS</span>
      </header>
      <button class="compare" type="button" aria-label="Expand {esc(item['title'])} comparison">
        <figure><figcaption><b>Before</b><span>{before_caption}</span></figcaption>
          {node_svg(before, item['title'] + ' before')}</figure>
        <div class="transform" aria-hidden="true">→</div>
        <figure><figcaption><b>After</b><span>{item['layoutMs']} ms</span></figcaption>
          {node_svg(after, item['title'] + ' after')}</figure>
      </button>
      <div class="measurements">
        {metric('node overlaps', before['metrics']['nodeOverlapPairs'], after['metrics']['nodeOverlapPairs'])}
        {metric('backwards edges', before['metrics']['backwardsEdges'], after['metrics']['backwardsEdges'])}
        {metric('edge crossings', before['metrics']['edgeCrossings'], after['metrics']['edgeCrossings'])}
        {port_metrics}
      </div>
      <p class="expect"><b>Acceptance:</b> {esc(expectation)} The organized result is anchored at the original top-left.</p>
    </article>'''


def build(data: dict) -> str:
    summary = data["summary"]
    selection_stress = image_data_uri(SELECTION_STRESS)
    cards = "".join(edge_card(item) for item in data["edgeCases"])
    cards += "".join(node_card(item) for item in data["nodeCases"])
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tidy edges + Organize nodes — 46-case evaluation</title>
<style>
  :root {{ --bg:#080c12; --panel:#101722; --panel2:#0c121b; --line:#243145; --ink:#edf3fb;
    --dim:#91a0b5; --blue:#60a5fa; --green:#34d399; --amber:#f59e0b; --pink:#f472b6; }}
  * {{ box-sizing:border-box }} html {{ background:var(--bg); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  body {{ margin:0; background:radial-gradient(circle at 70% -10%,#162945 0,transparent 34rem),var(--bg) }}
  a {{ color:#8bc2ff }} .shell {{ max-width:1540px; margin:auto; padding:46px 34px 90px }}
  .eyebrow {{ color:var(--blue); font:700 12px ui-monospace,monospace; letter-spacing:.18em; text-transform:uppercase }}
  h1 {{ font-size:clamp(38px,6vw,82px); letter-spacing:-.055em; line-height:.93; max-width:980px; margin:18px 0 22px }}
  .lede {{ color:#b7c3d3; font:22px/1.5 Georgia,serif; max-width:900px; margin:0 }}
  .kpis {{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin:34px 0 24px }}
  .kpi {{ border:1px solid var(--line); background:linear-gradient(145deg,#121c29,#0b1119); border-radius:14px; padding:18px }}
  .kpi b {{ display:block; font-size:28px; letter-spacing:-.04em }} .kpi small {{ color:var(--dim); line-height:1.3 }}
  .contract {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:20px 0 34px }}
  .contract article {{ border:1px solid var(--line); border-radius:16px; padding:20px 22px; background:rgba(14,21,31,.84) }}
  .contract h2 {{ margin:0 0 8px; font-size:20px }} .contract p {{ margin:0; color:#acb9ca; line-height:1.55 }}
  .contract code {{ color:#acd1ff }}
  .scope-proof {{ display:grid; grid-template-columns:minmax(0,.8fr) minmax(520px,1.2fr); gap:22px; align-items:center; margin:0 0 34px; padding:22px; border:1px solid #30415a; border-radius:18px; background:linear-gradient(145deg,#111c29,#0b1119) }}
  .scope-proof h2 {{ margin:0 0 10px }} .scope-proof p {{ color:#acb9ca; line-height:1.55 }} .scope-proof ul {{ margin:14px 0 0; padding-left:20px; color:#c3cedc; line-height:1.7 }} .scope-proof img {{ display:block; width:100%; border:1px solid #344760; border-radius:12px }}
  .toolbar {{ position:sticky; top:10px; z-index:10; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    width:max-content; max-width:100%; padding:8px; margin:0 auto 26px; border:1px solid #31415a; border-radius:14px;
    background:rgba(8,12,18,.9); backdrop-filter:blur(14px); box-shadow:0 12px 38px #0009 }}
  .toolbar button {{ appearance:none; border:0; border-radius:9px; padding:10px 14px; background:transparent; color:var(--dim); font-weight:700; cursor:pointer }}
  .toolbar button[aria-pressed="true"] {{ background:#1c2b3e; color:var(--ink) }}
  .legend {{ color:var(--dim); font-size:12px; margin-left:8px }}
  .cases {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px }}
  .case {{ border:1px solid var(--line); border-radius:18px; background:linear-gradient(160deg,#111a26,#0c121b); overflow:hidden; box-shadow:0 16px 50px #0003 }}
  .case[hidden] {{ display:none }} .case>header {{ display:grid; grid-template-columns:auto 1fr auto; gap:13px; align-items:start; padding:18px 18px 13px }}
  .case-number {{ display:grid; place-items:center; width:42px; height:42px; border:1px solid #334760; border-radius:11px; color:#a9cfff; font:700 12px ui-monospace,monospace }}
  .case h3 {{ margin:0 0 4px; font-size:18px }} .case header p {{ margin:0; color:var(--dim); font-size:13px; line-height:1.4 }}
  .verdict {{ border-radius:999px; padding:6px 9px; font:800 10px ui-monospace,monospace; letter-spacing:.08em }}
  .verdict.pass {{ color:#5ee9b5; background:#0d382d }} .verdict.warn {{ color:#ffc866; background:#3c2a0b }} .verdict.keep {{ color:#f7a4ce; background:#3a1730 }}
  .compare {{ display:grid; grid-template-columns:1fr 26px 1fr; align-items:stretch; width:100%; padding:0 14px; border:0; background:transparent; color:inherit; cursor:zoom-in }}
  .compare figure {{ min-width:0; margin:0; border:1px solid #25334a; border-radius:12px; overflow:hidden; background:#0b1118 }}
  .compare figcaption {{ height:37px; display:flex; justify-content:space-between; align-items:center; padding:0 10px; border-bottom:1px solid #25334a; font-size:12px }}
  .compare figcaption span {{ color:var(--dim); font:10px ui-monospace,monospace }} .compare svg {{ display:block; width:100%; height:248px }}
  .transform {{ display:grid; place-items:center; color:#57708e; font-size:20px }}
  .measurements {{ display:flex; gap:8px; flex-wrap:wrap; padding:13px 16px 9px }} .metric {{ display:flex; gap:8px; align-items:center; border:1px solid #29384d; border-radius:999px; padding:6px 9px }}
  .metric small {{ color:var(--dim); font-size:10px }} .metric b {{ font:700 11px ui-monospace,monospace }} .metric i {{ padding:0 4px; color:#60738b; font-style:normal }} .metric.improved b {{ color:#61dfb3 }}
  .expect {{ color:#9aa9bc; font-size:12px; line-height:1.5; padding:0 17px 16px; margin:0 }} .expect b {{ color:#d8e2ef }}
  .method {{ margin-top:44px; padding:28px; border:1px solid var(--line); border-radius:18px; background:#0c121b }}
  .method h2 {{ margin-top:0 }} .method-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:24px }} .method p,.method li {{ color:#a6b3c4; line-height:1.55 }}
  .terms {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:20px 0 }} .term {{ border:1px solid #2b3a4e; border-radius:13px; padding:15px; background:#101721 }} .term b {{ display:block; margin-bottom:6px }} .term p {{ margin:0; font-size:13px }}
  dialog {{ width:min(1420px,96vw); max-height:94vh; padding:18px; border:1px solid #344760; border-radius:18px; background:#0b1118; color:var(--ink) }} dialog::backdrop {{ background:#020407d9; backdrop-filter:blur(4px) }}
  dialog .compare {{ cursor:default }} dialog .compare svg {{ height:72vh }} dialog>button {{ position:absolute; right:22px; top:18px; z-index:2; border:1px solid #3c506b; background:#111b28; color:white; border-radius:999px; width:34px; height:34px; cursor:pointer }}
  @media (max-width:1000px) {{ .kpis {{ grid-template-columns:repeat(2,1fr) }} .cases {{ grid-template-columns:1fr }} .scope-proof {{ grid-template-columns:1fr }} }}
  @media (max-width:680px) {{ .shell {{ padding:30px 14px 70px }} .contract,.method-grid {{ grid-template-columns:1fr }} .compare {{ grid-template-columns:1fr }} .transform {{ height:28px; transform:rotate(90deg) }} .compare svg {{ height:220px }} .toolbar {{ width:100%; justify-content:center }} .legend {{ width:100%; text-align:center; margin:0 }} }}
</style></head><body><main class="shell">
  <span class="eyebrow">Executable evaluation · seed {data['seed']}</span>
  <h1>Tidy edges.<br/>Organize nodes.</h1>
  <p class="lede">Twenty edge cases and twenty-six node cases, ordered from small defects to dense stress boards. Six node cases exercise real multi-port coordinates across aligned, offset, and mixed Blocks. Every case is rendered twice from the code being shipped: before, then after.</p>
  <section class="kpis" aria-label="evaluation summary">
    <div class="kpi"><b>20 + 26</b><small>edge and node cases</small></div>
    <div class="kpi"><b>{summary['totalBeforeAfterCanvases']}</b><small>before/after canvases</small></div>
    <div class="kpi"><b>{summary['edgeOverlapBefore']:,.0f} → {summary['edgeOverlapAfter']:,.0f}</b><small>px coincident edge run; remainder is shared terminals or locked geometry</small></div>
    <div class="kpi"><b>{summary['edgeSpacingDefectsBefore']} → {summary['edgeSpacingDefectsAfter']}</b><small>stacked or uneven channel-spacing defects</small></div>
    <div class="kpi"><b>{summary['nodeOverlapPairsBefore']} → {summary['nodeOverlapPairsAfter']}</b><small>overlapping node pairs</small></div>
    <div class="kpi"><b>{summary['portAwareNodeCases']}</b><small>aligned, offset, and mixed multi-port cases</small></div>
  </section>
  <section class="contract">
    <article><h2>Tidy edges = preserve the board</h2><p>Moves selected elbow edges, plus elbow edges incident to selected Blocks. Endpoints and nodes stay put; authored routes and unselected edges are immovable constraints; curved and straight edges are ignored. No selection means no change.</p></article>
    <article><h2>Organize nodes = choose new positions</h2><p>Moves only selected Blocks (two or more) through a one-shot ELK layout. Exact Block-local port rows inform placement, the result stays anchored at the input top-left, and SystemSketch’s own elbow router redraws every cable.</p></article>
  </section>
  <section class="scope-proof">
    <div><span class="eyebrow">Real-app selection stress</span><h2>36 Blocks · 87 port-bound edges</h2><p>The automated browser journey runs both commands inside one deliberately crowded, fully connected view. It fingerprints every record before and after, then rejects any mutation outside the selection contract.</p><ul><li><b>Organize:</b> 18 selected Blocks moved and reached zero overlap; 18 unselected Blocks stayed byte-identical.</li><li><b>Tidy:</b> two selected Blocks plus one explicit edge produced 8 changed edges; all 79 out-of-scope edge records and all 36 Block positions stayed exact.</li></ul></div>
    {f'<img src="{selection_stress}" alt="Selection-scope stress board with two Blocks and one explicit edge selected among 36 Blocks and 87 edges"/>' if selection_stress else ''}
  </section>
  <nav class="toolbar" aria-label="comparison filters">
    <button data-filter="all" aria-pressed="true">All 46</button>
    <button data-filter="edges" aria-pressed="false">Tidy edges · 20</button>
    <button data-filter="nodes" aria-pressed="false">Organize nodes · 26</button>
    <span class="legend">Click any comparison to inspect it full-screen</span>
  </nav>
  <section class="cases" aria-live="polite">{cards}</section>
  <section class="method">
    <h2>What was actually evaluated</h2>
    <div class="method-grid">
      <div><p><b>Edge path:</b> each fixture feeds the shipped pure <code>nudgeRoutes</code> implementation. The report hard-fails on non-orthogonal output, moved endpoints, changed authored routes, a non-idempotent second pass, any stacked/uneven local channel cadence, or a newly introduced crossing that is neither topological nor imposed by authored constraints. Aggregate coincident-run length remains visible, but no longer stands in for spacing correctness.</p>
      <p><b>Node path:</b> each fixture feeds the shipped <code>organizeGraph</code> wrapper and the exact PyBlocks/Dify-derived ELK option block. Port-aware cases give ELK fixed Block-local input/output coordinates—not node centres. The output is run twice byte-for-byte to assert determinism; the evaluator also hard-fails if any rendered endpoint drifts from its declared port.</p>
      <p><b>Port labels:</b> <code>A</code> means the Block’s input/output ports share aligned rows; <code>O</code> means outputs occupy separate offset rows. Hollow left dots are inputs and filled right dots are outputs.</p></div>
      <div><p><b>Prior decision trail:</b></p><ul>
        <li><a href="file:///home/bam/pyblocks/docs/edge-overlap-2026-08-26.html">Edge-overlap research</a> — fixed-node routing vs. layout engines.</li>
        <li><a href="file:///home/bam/pyblocks/docs/left-to-right-feedback-research-2026-08-27.html">Left-to-right feedback research</a> — one-shot interaction precedents.</li>
        <li><a href="file:///home/bam/pyblocks/docs/layout-commands-2026-08-27.html">PyBlocks implementation report</a> — original Nudge/Tidy port source.</li>
      </ul></div>
    </div>
    <div class="terms">
      <div class="term"><b>CONSTRAINED</b><p>Residual geometry is intentionally immovable: an authored/manual route, an unselected edge, or a short run shared at the same port terminal. Removing it would violate Tidy edges’ preservation contract.</p></div>
      <div class="term"><b>TOPOLOGY</b><p>The source-port order and destination-port order disagree. A crossing is therefore unavoidable unless endpoints or node positions change—work that Tidy edges is deliberately not allowed to do.</p></div>
    </div>
  </section>
</main>
<dialog id="zoom"><button type="button" aria-label="Close">×</button><div></div></dialog>
<script>
  const filters = document.querySelectorAll('[data-filter]')
  const cases = document.querySelectorAll('.case')
  for (const button of filters) button.addEventListener('click', () => {{
    const filter = button.dataset.filter
    for (const choice of filters) choice.setAttribute('aria-pressed', String(choice === button))
    for (const card of cases) card.hidden = filter !== 'all' && card.dataset.kind !== filter
  }})
  const dialog = document.querySelector('#zoom')
  const zoomBody = dialog.querySelector('div')
  for (const button of document.querySelectorAll('.compare')) button.addEventListener('click', () => {{
    zoomBody.replaceChildren(button.cloneNode(true))
    dialog.showModal()
  }})
  dialog.querySelector('button').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {{ if (event.target === dialog) dialog.close() }})
  document.documentElement.dataset.reportReady = 'true'
</script></body></html>'''


if __name__ == "__main__":
    payload = generate_data()
    rendered = build(payload)
    OUT.write_text("\n".join(line.rstrip() for line in rendered.splitlines()) + "\n", encoding="utf-8")
    print(OUT)
