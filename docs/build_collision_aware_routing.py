#!/usr/bin/env python3
"""Build the self-contained collision-aware Tidy implementation gallery."""
from __future__ import annotations

import base64
import html
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUT = DOCS / "collision-aware-routing-2026-09-02.html"


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def image_data_uri(name: str) -> str:
    path = ASSETS / name
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def test_count(path: Path) -> int:
    source = path.read_text(encoding="utf-8")
    return len(re.findall(r"\b(?:it|test)\s*\(", source))


def build() -> str:
    sha = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True
    ).strip()
    unit_files = [
        ROOT / "src/blocks/connections/routingObstacles.test.ts",
        ROOT / "src/blocks/connections/collisionAwareRouting.test.ts",
        ROOT / "src/blocks/connections/tidyEdges.test.ts",
    ]
    focused_tests = sum(test_count(path) for path in unit_files)
    images = {
        "block_before": image_data_uri("collision-aware-routing-block-before-2026-09-02.png"),
        "block_after": image_data_uri("collision-aware-routing-block-after-2026-09-02.png"),
        "branch_before": image_data_uri("collision-aware-routing-branch-before-2026-09-02.png"),
        "branch_after": image_data_uri("collision-aware-routing-branch-after-2026-09-02.png"),
        "fixture": "data:image/png;base64," + base64.b64encode(
            (ROOT / "sketches/review/collision-aware-routing.png").read_bytes()
        ).decode("ascii"),
    }
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Collision-aware Tidy routing · SystemSketch</title>
<style>
  :root {{ --ink:#eef4fb; --dim:#9aa9ba; --line:#27384a; --panel:#111a24; --panel2:#0b121a;
    --blue:#5fa8ff; --orange:#ff8b3d; --green:#50d890; --red:#ff6b6b; --paper:#081019; }}
  * {{ box-sizing:border-box }}
  html {{ background:var(--paper); color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  body {{ margin:0; background:radial-gradient(circle at 78% -10%,#16365a 0,transparent 36rem),var(--paper) }}
  a {{ color:#91c7ff }} code {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace }}
  .shell {{ width:min(1480px,calc(100% - 44px)); margin:auto; padding:58px 0 90px }}
  .eyebrow {{ color:var(--blue); font:750 12px ui-monospace,monospace; letter-spacing:.18em; text-transform:uppercase }}
  h1 {{ font-size:clamp(46px,7.2vw,104px); line-height:.9; letter-spacing:-.065em; max-width:1120px; margin:20px 0 26px }}
  .lede {{ color:#c1ccda; font:24px/1.48 Georgia,serif; max-width:940px; margin:0 }}
  .facts {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:34px 0 54px }}
  .fact {{ padding:18px; border:1px solid var(--line); border-radius:14px; background:linear-gradient(145deg,#142233,#0c141d) }}
  .fact b {{ display:block; font-size:26px }} .fact small {{ color:var(--dim) }}
  section {{ margin-top:64px }} h2 {{ margin:0 0 12px; font-size:clamp(30px,4vw,50px); letter-spacing:-.04em }}
  .section-lede {{ color:var(--dim); font-size:18px; line-height:1.55; max-width:900px; margin:0 0 26px }}
  .cases {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }}
  .case {{ border:1px solid var(--line); border-radius:18px; overflow:hidden; background:var(--panel) }}
  .case header {{ display:flex; gap:14px; align-items:start; padding:20px 22px 16px }}
  .case h3 {{ margin:0 0 5px; font-size:22px }} .case p {{ margin:0; color:var(--dim); line-height:1.45 }}
  .badge {{ margin-left:auto; padding:6px 9px; border-radius:99px; background:#143626; color:#8af0b3; font:750 11px ui-monospace,monospace }}
  .switch {{ display:flex; gap:8px; padding:0 22px 16px }}
  .switch button {{ color:#b9c7d7; background:#0b121a; border:1px solid var(--line); border-radius:8px; padding:8px 14px; cursor:pointer }}
  .switch button[aria-pressed="true"] {{ background:#1f68b7; color:white; border-color:#4b9ff4 }}
  .frame {{ background:#eef0f3; aspect-ratio:1.53; overflow:hidden; border-top:1px solid var(--line) }}
  .frame img {{ width:100%; height:100%; object-fit:cover; object-position:left center; display:block }}
  .pipeline {{ display:grid; grid-template-columns:repeat(5,1fr); gap:12px }}
  .stage {{ position:relative; min-height:178px; padding:20px; border:1px solid var(--line); border-radius:14px; background:var(--panel) }}
  .stage:not(:last-child)::after {{ content:'→'; position:absolute; right:-18px; top:74px; z-index:2; color:var(--orange); font-size:24px }}
  .stage small {{ color:var(--orange); font:700 11px ui-monospace,monospace }}
  .stage code {{ display:block; margin:12px 0 9px; color:#b9dcff; font-size:13px; word-break:break-word }}
  .stage p {{ color:var(--dim); margin:0; font-size:14px; line-height:1.45 }}
  .ownership {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }}
  .rule {{ border:1px solid var(--line); border-radius:16px; padding:24px; background:var(--panel) }}
  .rule.auto {{ box-shadow:inset 4px 0 var(--blue) }} .rule.manual {{ box-shadow:inset 4px 0 var(--orange) }}
  .rule h3 {{ margin:0 0 8px }} .rule p {{ color:var(--dim); line-height:1.55; margin:0 }}
  table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--panel) }}
  th,td {{ text-align:left; padding:14px 16px; border-bottom:1px solid var(--line); vertical-align:top }}
  tr:last-child td {{ border-bottom:0 }} th {{ color:#9ed0ff; background:#0d1722; font-size:12px; letter-spacing:.08em; text-transform:uppercase }}
  td {{ color:#c2cedb; line-height:1.45 }} td:first-child {{ color:var(--ink); font-weight:700 }}
  .fixture {{ display:grid; grid-template-columns:1.15fr .85fr; border:1px solid var(--line); border-radius:18px; overflow:hidden; background:var(--panel) }}
  .fixture img {{ width:100%; display:block; background:#fff }} .fixture-copy {{ padding:30px }}
  .fixture-copy ol {{ color:#c5d0dc; line-height:1.65; padding-left:22px }}
  .pass {{ border-left:4px solid var(--green); padding:12px 14px; color:#bdf4d1; background:#0e251a }}
  .prior {{ display:grid; grid-template-columns:1.25fr .75fr; gap:18px }}
  .prior > div {{ border:1px solid var(--line); border-radius:16px; padding:24px; background:var(--panel) }}
  .prior h3 {{ margin-top:0 }} .prior p,.prior li {{ color:var(--dim); line-height:1.55 }}
  .limits {{ border-color:#654329!important; background:#1b1510!important }}
  footer {{ margin-top:72px; padding-top:24px; border-top:1px solid var(--line); color:#7f91a5; font:13px ui-monospace,monospace }}
  @media (max-width:1000px) {{ .facts,.pipeline {{ grid-template-columns:1fr 1fr }} .stage::after {{ display:none }} .cases,.fixture,.prior {{ grid-template-columns:1fr }} }}
  @media (max-width:650px) {{ .shell {{ width:min(100% - 24px,1480px); padding-top:34px }} .facts,.pipeline,.ownership {{ grid-template-columns:1fr }} h1 {{ font-size:50px }} }}
</style></head><body><main class="shell">
  <div class="eyebrow">SystemSketch · implementation evidence · 2026-09-02</div>
  <h1>Elbows now know where they don’t belong.</h1>
  <p class="lede">The selection-local <b>Tidy edges</b> command now plans automatic orthogonal routes around Blocks and through only the legal region of a Branch. Freehand placement remains available: authored bends are a separate ownership mode and Tidy leaves them byte-for-byte alone.</p>
  <div class="facts">
    <div class="fact"><b>0</b><small>Blocks moved by Tidy</small></div>
    <div class="fact"><b>2</b><small>painted collision scenarios</small></div>
    <div class="fact"><b>{focused_tests}</b><small>focused unit cases across 3 suites</small></div>
    <div class="fact"><b>1 undo</b><small>for the complete command</small></div>
  </div>

  <section><h2>Two collisions, removed</h2>
    <p class="section-lede">These are captures from the real application. Use each switch to compare the stock elbow before Tidy with the automatic route persisted by the command.</p>
    <div class="cases">
      <article class="case" data-case="block"><header><div><h3>Intervening Block</h3><p>The original datawire ran directly behind <code>decode()</code>. The new route clears its padded outside bounds.</p></div><span class="badge">PASS</span></header>
        <div class="switch"><button aria-pressed="true" data-show="before">Before</button><button aria-pressed="false" data-show="after">After Tidy</button></div>
        <div class="frame"><img alt="Block collision before Tidy" data-before="{images['block_before']}" data-after="{images['block_after']}" src="{images['block_before']}"/></div></article>
      <article class="case" data-case="branch"><header><div><h3>Branch interior</h3><p>The route may enter the target <code>else</code> arm, but not the Branch band, arm headers, or sibling <code>if</code> body.</p></div><span class="badge">PASS</span></header>
        <div class="switch"><button aria-pressed="true" data-show="before">Before</button><button aria-pressed="false" data-show="after">After Tidy</button></div>
        <div class="frame"><img alt="Branch collision before Tidy" data-before="{images['branch_before']}" data-after="{images['branch_after']}" src="{images['branch_before']}"/></div></article>
    </div>
  </section>

  <section><h2>Five seams, five bug classes</h2>
    <p class="section-lede">The implementation deliberately keeps geometry policy, path search, stability, channel spacing, and editor mutation separate. A failure in one layer can be reproduced without quietly exercising all the others.</p>
    <div class="pipeline">
      <div class="stage"><small>01 · SCENE</small><code>collectRoutingObstacles()</code><p>Turns Blocks and semantic Branch regions into page-space forbidden rectangles.</p></div>
      <div class="stage"><small>02 · PLAN</small><code>planOrthogonalRoute()</code><p>Runs the existing pure TypeScript A* for one edge. No editor writes and no bundle knowledge.</p></div>
      <div class="stage"><small>03 · STABILIZE</small><code>stabilizeOrthogonalRoute()</code><p>Keeps the previous automatic corridor when it still clears the current obstacles.</p></div>
      <div class="stage"><small>04 · NUDGE</small><code>nudgeRoutesWithoutObstacleCollisions()</code><p>Separates automatic channels, reverting only a proposed nudge that would hit geometry.</p></div>
      <div class="stage"><small>05 · APPLY</small><code>automaticRouteModel()</code><p>Persists changed automatic routes in one undoable editor transaction.</p></div>
    </div>
  </section>

  <section><h2>Flexibility is an ownership rule</h2>
    <div class="ownership">
      <div class="rule auto"><h3>Automatic route</h3><p>Tidy may replace the route, stabilize it, or nudge it. Its resolved polyline is saved so the chosen collision-free path remains visible between runs.</p></div>
      <div class="rule manual"><h3>Authored route</h3><p>Dragging a bend, dragging an interior segment, or using route/grow transfers ownership to the person. Tidy treats that cable as a locked constraint. <b>Reset to automatic</b> is the explicit transfer back.</p></div>
    </div>
  </section>

  <section><h2>Behaviors are tested independently</h2>
    <p class="section-lede">This is the separation note made executable. The browser journey then composes the layers and samples the actually painted SVG path—not merely the route model.</p>
    <table><thead><tr><th>Behavior</th><th>Independent proof</th><th>Failure stays local</th></tr></thead><tbody>
      <tr><td>Obstacle collection</td><td>Unrelated Blocks; endpoint exclusion; Branch band, headers, sibling bodies, and target arm.</td><td>Scene-policy bugs do not implicate A*.</td></tr>
      <tr><td>One-edge planner</td><td>Orthogonality, obstacle clearance, and a known blocked direct corridor.</td><td>Pathfinding runs without an editor or bundling.</td></tr>
      <tr><td>Stability</td><td>A still-valid prior route is retained; a newly blocked prior route is rejected.</td><td>Corridor jumping is distinct from routing correctness.</td></tr>
      <tr><td>Safe nudge</td><td>A proposed parallel-channel move that hits a Block is reverted per route.</td><td>Spacing cannot disguise a collision regression.</td></tr>
      <tr><td>Ownership</td><td>Authored geometry remains byte-for-byte unchanged; automatic geometry stays eligible.</td><td>Manual flexibility is not inferred from route shape.</td></tr>
      <tr><td>Command</td><td>Selection scope, fixed Blocks/endpoints, single undo, unresolved safe no-op, and real painted-path checks.</td><td>Orchestration never becomes another router.</td></tr>
    </tbody></table>
  </section>

  <section><h2>Ready-to-drive review board</h2>
    <div class="fixture"><img alt="Collision-aware Tidy review fixture" src="{images['fixture']}"/>
      <div class="fixture-copy"><h3>One visible gesture</h3><ol><li>Click <code>source()</code>.</li><li>Press <code>Ctrl+P</code>, choose <b>Tidy edges</b>, and press Enter.</li></ol>
      <p class="pass"><b>PASS WHEN</b> the data edge bends fully around <code>decode()</code> while all Blocks and endpoints remain fixed.</p>
      <p>The fixture was generated and cold-reopened through the real editor/autosave path. Its cue binding was also exercised after moving the target Block.</p></div></div>
  </section>

  <section><h2>Prior art, used selectively</h2>
    <div class="prior"><div><h3>Keep the local A*; borrow the architecture</h3>
      <p><a href="https://www.adaptagrams.org/documentation/libavoid.html">libavoid</a> is the strongest quality reference: obstacle-aware orthogonal search and shared-path nudging are distinct stages. Its <a href="https://people.eng.unimelb.edu.au/pstuckey/papers/gd09.pdf">original routing paper</a> supports the same split. SystemSketch keeps its existing pure TypeScript, Excalidraw-derived planner and ports only the useful behavioral ideas.</p>
      <p><a href="https://github.com/tisoap/react-flow-smart-edge">react-flow-smart-edge</a> is a useful MIT grid-search reference. React Flow’s built-in <a href="https://reactflow.dev/api-reference/utils/get-smooth-step-path">smooth-step path</a> constructs elbows but does not solve intervening-node avoidance.</p>
    </div><div class="limits"><h3>Deliberate first boundary</h3><ul><li>Command-driven, not continuous while dragging.</li><li>Axis-aligned rectangular obstacle model.</li><li>No global crossing minimizer yet.</li><li>An unresolved route is left unchanged and reported.</li><li>Legacy saved geometry migrates conservatively to authored.</li></ul>
      <p>libavoid remains a benchmark, not a dependency: its browser/WASM distribution brings LGPL obligations.</p></div></div>
  </section>

  <footer>Built from live tree {esc(sha)} · self-contained HTML · screenshots produced by <code>npm run test:collision-routing</code></footer>
</main><script>
  for (const card of document.querySelectorAll('[data-case]')) {{
    const image = card.querySelector('img');
    for (const button of card.querySelectorAll('[data-show]')) button.addEventListener('click', () => {{
      const state = button.dataset.show;
      image.src = image.dataset[state];
      image.alt = `${{card.querySelector('h3').textContent}} ${{state === 'before' ? 'before Tidy' : 'after Tidy'}}`;
      for (const peer of card.querySelectorAll('[data-show]')) peer.setAttribute('aria-pressed', String(peer === button));
    }});
  }}
</script></body></html>'''


def main() -> None:
    OUT.write_text(build(), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
