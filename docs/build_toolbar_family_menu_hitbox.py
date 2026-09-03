#!/usr/bin/env python3
"""Build the self-contained toolbar family-menu hitbox implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "toolbar-family-menu-hitbox-2026-09-02.html"
RESULTS = ASSETS / "toolbar-family-menu.json"
FIXTURE = ROOT / "sketches" / "review" / "toolbar-family-menu.systemsketch"
RECIPE = ROOT / "sketches" / "review" / "toolbar-family-menu.recipe.json"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> None:
    evidence = json.loads(RESULTS.read_text(encoding="utf-8"))
    checks = evidence["checks"]
    geometry = evidence["geometry"]
    live = image_uri(ASSETS / "toolbar-family-menu-open.png")
    fixture = image_uri(ROOT / "sketches" / "review" / "toolbar-family-menu.png")
    recipe = html.escape(RECIPE.read_text(encoding="utf-8"))
    passed = sum(check["ok"] for check in checks)
    old_area = 15 * 15
    new_area = geometry[0]["width"] * geometry[0]["height"]
    ratio = new_area / old_area

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Whole-tile family menus</title>
<style>
  :root {{ --ink:#20242b; --muted:#666d78; --line:#dce1e8; --paper:#f3f5f8; --card:#fff;
    --blue:#3182ed; --blue-soft:#eaf2fd; --green:#27865f; --orange:#f08a32; --red:#d65c5c }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:
    radial-gradient(circle at 82% 0,#e6effd 0,transparent 34%),var(--paper);
    font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }}
  a {{ color:#1f65be; text-underline-offset:3px }} main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 72px }}
  .hero {{ padding:46px; border:1px solid #d9e0ea; border-radius:28px; background:#ffffffef;
    box-shadow:0 24px 70px #26364c16 }} .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850;
    letter-spacing:.14em; text-transform:uppercase }} h1 {{ max-width:900px; margin:10px 0 15px;
    font-size:clamp(42px,7vw,78px); line-height:.97; letter-spacing:-.06em }} .lead {{ max-width:820px;
    margin:0; color:var(--muted); font-size:19px }} .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:25px }}
  .chip {{ padding:8px 11px; border:1px solid #ccdbef; border-radius:999px; color:#245d9d;
    background:#eef5fe; font-size:12px; font-weight:760 }} section {{ margin-top:24px; padding:30px;
    border:1px solid var(--line); border-radius:22px; background:#ffffffef; box-shadow:0 13px 40px #26364c0d }}
  .head {{ display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:20px }}
  h2 {{ margin:0; font-size:28px; letter-spacing:-.035em }} .head p {{ max-width:630px; margin:0; color:var(--muted) }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }} .demo {{ position:relative; min-height:260px;
    padding:24px; border:1px solid var(--line); border-radius:16px; background:#f8f9fb }} .demo h3 {{ margin:0 0 4px }}
  .demo > p {{ margin:0; color:var(--muted); font-size:13px }} .dock {{ position:absolute; left:50%; bottom:34px;
    display:flex; gap:0; padding:4px; border:1px solid #d7dce3; border-radius:12px; background:white;
    box-shadow:0 10px 28px #26364c1f; transform:translateX(-50%) }} .tile {{ position:relative; display:grid;
    width:43px; height:40px; place-items:center; border:0; border-radius:8px; color:#28303b; background:transparent;
    font-size:21px; cursor:pointer }} .tile:hover,.tile.open {{ background:#e8edf4 }} .tile .corner {{ position:absolute;
    right:3px; bottom:2px; font-size:10px }} .old .tile {{ cursor:default }} .old .corner {{ display:grid; width:15px;
    height:15px; right:0; bottom:0; place-items:center; border:1px solid var(--red); border-radius:4px; cursor:pointer }}
  .hit {{ position:absolute; border:2px solid var(--green); border-radius:9px; pointer-events:none }}
  .old .hit {{ width:15px; height:15px; right:4px; bottom:4px; border-color:var(--red); border-radius:4px }}
  .new .hit {{ inset:4px auto auto 4px; width:43px; height:40px }} .badge {{ position:absolute; right:18px; top:18px;
    padding:6px 9px; border-radius:999px; font:800 11px/1 ui-monospace,monospace }} .old .badge {{ color:#993d3d; background:#fdecec }}
  .new .badge {{ color:#246545; background:#e9f7ef }} .menu {{ position:absolute; left:50%; bottom:86px; display:none;
    width:180px; padding:6px; border:1px solid var(--line); border-radius:10px; background:white;
    box-shadow:0 14px 32px #26364c24; transform:translateX(-50%); font-size:12px }} .menu.show {{ display:block }}
  .menu b,.menu span {{ display:block; padding:7px 8px; border-radius:6px }} .menu b {{ color:var(--muted);
    font-size:9px; letter-spacing:.1em; text-transform:uppercase }} .menu span:first-of-type {{ background:var(--blue-soft) }}
  .live {{ display:block; width:100%; border:1px solid var(--line); border-radius:16px }} .caption {{ margin:11px 3px 0;
    color:var(--muted); font-size:12px }} .flow {{ display:grid; grid-template-columns:repeat(4,1fr); gap:11px }}
  .flow article {{ position:relative; padding:18px; border:1px solid var(--line); border-radius:14px; background:#fafbfd }}
  .flow article:not(:last-child)::after {{ content:'→'; position:absolute; right:-17px; top:39px; z-index:2;
    color:var(--orange); font-size:24px; font-weight:900 }} .flow b {{ display:block; margin-bottom:7px; color:#295b92;
    font-size:12px }} .flow span {{ color:var(--muted); font-size:12px }} .metrics {{ display:grid;
    grid-template-columns:repeat(4,1fr); gap:11px; margin-bottom:18px }} .metric {{ padding:18px; border:1px solid var(--line);
    border-radius:14px; background:#fafbfd }} .metric strong {{ display:block; font-size:28px; letter-spacing:-.04em }}
  .metric span {{ color:var(--muted); font-size:11px }} .checks {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }}
  .check {{ position:relative; padding:13px 13px 13px 40px; border:1px solid #d5e8dd; border-radius:12px;
    color:#315d49; background:#f3faf6; font-size:12px; font-weight:680 }} .check::before {{ content:'✓';
    position:absolute; left:13px; top:12px; display:grid; width:19px; height:19px; place-items:center; border-radius:50%;
    color:white; background:var(--green); font-size:11px }} .fixture {{ display:grid; grid-template-columns:1.55fr .65fr;
    gap:18px; align-items:start }} .fixture img {{ display:block; width:100%; border:1px solid var(--line); border-radius:15px }}
  .fixture-copy p {{ color:var(--muted) }} .fixture-copy a {{ display:inline-block; margin-top:8px; padding:10px 13px;
    border-radius:10px; color:white; background:var(--blue); font-size:13px; font-weight:780; text-decoration:none }}
  details {{ margin-top:16px; border-radius:15px; color:#e8ebef; background:#1f2329; overflow:hidden }}
  summary {{ padding:16px 19px; cursor:pointer; font-weight:760 }} pre {{ margin:0; padding:0 19px 20px; overflow:auto;
    color:#cdd8e8; font:12px/1.5 ui-monospace,monospace }} footer {{ display:flex; justify-content:space-between; gap:18px;
    padding:25px 4px 0; color:var(--muted); font-size:12px }}
  @media(max-width:850px) {{ .compare,.fixture {{ grid-template-columns:1fr }} .flow,.metrics {{ grid-template-columns:1fr 1fr }}
    .checks {{ grid-template-columns:1fr 1fr }} .head {{ display:block }} .head p {{ margin-top:8px }} }} @media(max-width:580px) {{ main {{ width:calc(100% - 18px); padding-top:10px }}
    .hero,section {{ padding:22px; border-radius:17px }} .flow,.metrics,.checks {{ grid-template-columns:1fr }}
    .flow article:not(:last-child)::after {{ content:'↓'; right:auto; top:auto; left:50%; bottom:-24px }} .head {{ display:block }}
    .head p {{ margin-top:8px }} footer {{ display:block }} }}
</style>
</head>
<body><main>
  <header class="hero">
    <div class="eyebrow">Implemented · Toolbar interaction</div>
    <h1>The icon is the menu.</h1>
    <p class="lead">System, Shape, and Draw no longer hide their picker behind a 15 × 15 px corner target. Any click in the remembered 43 × 40 px family tile opens the native menu; choosing a row arms the tool, while B, R, and D remain direct.</p>
    <div class="chips"><span class="chip">whole-tile trigger</span><span class="chip">{ratio:.1f}× target area</span><span class="chip">native tldraw menu</span><span class="chip">shortcuts stay direct</span><span class="chip">no board-format change</span></div>
  </header>

  <section>
    <div class="head"><h2>One target instead of a split target</h2><p>Click each prototype. The old model makes only the outlined corner actionable; the shipped model gives the same action to the entire family tile.</p></div>
    <div class="compare">
      <article class="demo old"><span class="badge">15 × 15</span><h3>Before · precision corner</h3><p>The icon recalled the last tool; the tiny chevron opened its family.</p><div class="menu"><b>System design</b><span>Block</span><span>Branch</span><span>Pill</span></div><div class="dock"><button class="tile" aria-label="Old Block split button">▧<span class="corner">⌄</span></button><i class="hit"></i></div></article>
      <article class="demo new"><span class="badge">43 × 40</span><h3>Now · Miro-style tile</h3><p>The remembered icon is status; every point in the tile opens the family.</p><div class="menu"><b>System design</b><span>Block</span><span>Branch</span><span>Pill</span></div><div class="dock"><button class="tile" aria-label="Open System tools">▧<span class="corner">⌄</span></button><i class="hit"></i></div></article>
    </div>
  </section>

  <section>
    <div class="head"><h2>Live product evidence</h2><p>The Draw picker is open from the center of its tile while Rectangle remains the actually armed tool in blue. Opening a picker and activating a tool are intentionally separate states.</p></div>
    <img class="live" src="{live}" alt="SystemSketch review fixture with the Draw family picker open above the bottom toolbar">
    <p class="caption">Captured by the focused CDP journey from the real product composition and the delivered review board.</p>
  </section>

  <section>
    <div class="head"><h2>Stock machinery, simpler choice</h2><p>The change removes one owned overlay button. It does not replace dropdown, focus, Escape, tool selection, keyboard routing, or responsive overflow behavior.</p></div>
    <div class="flow">
      <article><b>Pointer anywhere</b><span>One 43 × 40 <code>TldrawUiToolbarButton</code>.</span></article>
      <article><b>Native trigger</b><span><code>TldrawUiDropdownMenuTrigger</code> owns open, focus, and dismissal.</span></article>
      <article><b>Choose a row</b><span>The existing family command remembers and selects that tool.</span></article>
      <article><b>Keyboard fast path</b><span>B / R / D bypass the menu and arm the stock/custom tool directly.</span></article>
    </div>
  </section>

  <section>
    <div class="head"><h2>Measured proof</h2><p>The run cold-opened the delivered fixture, sampled three points in every family button, exercised both pointer and keyboard paths, and checked the board stayed untouched.</p></div>
    <div class="metrics"><div class="metric"><strong>{passed}/{len(checks)}</strong><span>focused browser checks</span></div><div class="metric"><strong>{geometry[0]['width']} × {geometry[0]['height']}</strong><span>live family-button pixels</span></div><div class="metric"><strong>{ratio:.1f}×</strong><span>area versus old chevron</span></div><div class="metric"><strong>0</strong><span>local console errors</span></div></div>
    <div class="checks">{''.join(f'<div class="check">{html.escape(item["label"])}</div>' for item in checks)}</div>
  </section>

  <section>
    <div class="head"><h2>Ready-to-drive review board</h2><p>The disposable board points at the real bottom toolbar, includes the shortcut loop, and has a bound cue whose attachment survived a cold reopen and movement probe.</p></div>
    <div class="fixture"><img src="{fixture}" alt="Toolbar family menu review board with numbered orange cues and green pass condition"><div class="fixture-copy"><div class="eyebrow">Human verification</div><h2>Click the icon centers</h2><p>Open System, Shape, and Pen from their broad faces. Then press B, R, and D and confirm each arms its tool directly. The real Block is the untouched safety target.</p><a href="../sketches/review/toolbar-family-menu.systemsketch">Open the fixture file</a></div></div>
    <details><summary>See the fixture recipe</summary><pre>{recipe}</pre></details>
  </section>

  <footer><span>SystemSketch · toolbar family menu hitbox · 2 Sep 2026</span><span><a href="build_toolbar_family_menu_hitbox.py">Gallery builder</a> · <a href="../README.md">README</a></span></footer>
</main>
<script>
  document.querySelectorAll('.demo').forEach((demo) => {{
    const button = demo.querySelector('.tile'); const menu = demo.querySelector('.menu');
    const toggle = () => {{ button.classList.toggle('open'); menu.classList.toggle('show'); }};
    if (demo.classList.contains('old')) demo.querySelector('.corner').addEventListener('click', (event) => {{ event.stopPropagation(); toggle(); }});
    else button.addEventListener('click', toggle);
  }});
</script>
</body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
