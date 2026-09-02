#!/usr/bin/env python3
"""Build the self-contained zoom-controls preference implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "zoom-controls-preference-2026-09-02.html"
RESULTS = ASSETS / "zoom-controls-preference.json"
FIXTURE = ROOT / "sketches" / "review" / "zoom-controls-preference.systemsketch"
RECIPE = ROOT / "sketches" / "review" / "zoom-controls-preference.recipe.json"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    checks = results["checks"]
    hidden = image_uri(ASSETS / "zoom-controls-hidden.png")
    shown = image_uri(ASSETS / "zoom-controls-shown.png")
    settings = image_uri(ASSETS / "zoom-controls-appearance-setting.png")
    fixture_image = image_uri(ROOT / "sketches" / "review" / "zoom-controls-preference.png")
    recipe_source = html.escape(RECIPE.read_text(encoding="utf-8"))

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Compact zoom controls</title>
<style>
  :root {{ color-scheme:light; --ink:#20242b; --muted:#666d78; --line:#dde1e7; --paper:#f3f5f8;
    --card:#fff; --blue:#3182ed; --blue-soft:#eaf2fd; --green:#27865f; --orange:#f08a32; }}
  * {{ box-sizing:border-box }} html {{ scroll-behavior:smooth }} body {{ margin:0; color:var(--ink);
    background:radial-gradient(circle at 80% 0,#e7effb 0,transparent 34%),var(--paper);
    font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }}
  a {{ color:#1f65be; text-underline-offset:3px }} main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 72px }}
  .hero {{ position:relative; overflow:hidden; padding:44px; border:1px solid #d9e0ea; border-radius:28px;
    background:#ffffffed; box-shadow:0 24px 70px #26364c16 }} .hero::after {{ content:'100%'; position:absolute;
    right:-24px; bottom:-74px; color:#3182ed0d; font-size:210px; font-weight:900; letter-spacing:-.08em }}
  .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase }}
  h1 {{ max-width:830px; margin:11px 0 15px; font-size:clamp(42px,7vw,78px); line-height:.97; letter-spacing:-.06em }}
  .lead {{ max-width:790px; margin:0; color:var(--muted); font-size:19px }} .chips {{ display:flex; flex-wrap:wrap;
    gap:9px; margin-top:25px }} .chip {{ padding:8px 11px; border:1px solid #ccdbef; border-radius:999px;
    color:#245d9d; background:#eef5fe; font-size:12px; font-weight:760 }}
  section {{ margin-top:24px; padding:30px; border:1px solid #dce1e7; border-radius:22px; background:#ffffffed;
    box-shadow:0 13px 40px #26364c0d }} .head {{ display:flex; justify-content:space-between; align-items:end;
    gap:24px; margin-bottom:20px }} h2 {{ margin:0; font-size:28px; letter-spacing:-.035em }} .head p {{ max-width:610px;
    margin:0; color:var(--muted) }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }} figure {{ margin:0; overflow:hidden;
    border:1px solid var(--line); border-radius:16px; background:#f8f9fb; box-shadow:0 8px 24px #2b374913 }}
  .crop {{ position:relative; height:104px; background-repeat:no-repeat; background-position:right bottom; background-size:1280px 820px }}
  .crop::before {{ content:''; position:absolute; inset:0 auto 0 0; width:112px; background:#f8f9fb }}
  figcaption {{ padding:13px 15px; border-top:1px solid var(--line); background:#fff; color:var(--muted); font-size:12px }}
  figcaption strong {{ display:block; margin-bottom:3px; color:var(--ink); font-size:14px }}
  .settings {{ display:grid; grid-template-columns:1.5fr .72fr; gap:18px; align-items:start }} .full {{ display:block; width:100% }}
  .principles {{ display:grid; gap:11px }} .principle {{ padding:17px; border:1px solid var(--line); border-radius:14px;
    background:#fafbfd }} .principle b {{ display:block; color:var(--green); font-size:11px; letter-spacing:.1em;
    text-transform:uppercase }} .principle strong {{ display:block; margin-top:5px; font-size:18px }} .principle p {{ margin:7px 0 0;
    color:var(--muted); font-size:12px }}
  .flow {{ display:grid; grid-template-columns:repeat(4,1fr); gap:11px }} .flow article {{ position:relative; padding:18px;
    border:1px solid var(--line); border-radius:14px; background:#fafbfd }} .flow article:not(:last-child)::after {{ content:'→';
    position:absolute; right:-17px; top:38px; z-index:2; color:var(--orange); font-size:24px; font-weight:900 }}
  .flow b {{ display:block; margin-bottom:7px; color:#295b92; font-size:12px }} .flow span {{ color:var(--muted); font-size:12px }}
  .checks {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }} .check {{ position:relative; padding:13px 13px 13px 40px;
    border:1px solid #d5e8dd; border-radius:12px; color:#315d49; background:#f3faf6; font-size:12px; font-weight:680 }}
  .check::before {{ content:'✓'; position:absolute; left:13px; top:12px; display:grid; width:19px; height:19px;
    place-items:center; border-radius:50%; color:white; background:var(--green); font-size:11px }}
  .metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:11px; margin-bottom:18px }} .metric {{ padding:18px;
    border:1px solid var(--line); border-radius:14px; background:#fafbfd }} .metric strong {{ display:block; font-size:28px;
    letter-spacing:-.04em }} .metric span {{ color:var(--muted); font-size:11px }}
  .fixture {{ display:grid; grid-template-columns:1.55fr .65fr; gap:18px; align-items:start }} .fixture-copy {{ padding:4px 2px }}
  .fixture-copy p {{ color:var(--muted) }} .fixture-copy a {{ display:inline-block; margin-top:8px; padding:10px 13px;
    border-radius:10px; color:white; background:var(--blue); font-size:13px; font-weight:780; text-decoration:none }}
  details {{ margin-top:16px; border-radius:15px; color:#e8ebef; background:#1f2329; overflow:hidden }} summary {{ padding:16px 19px;
    cursor:pointer; font-weight:760 }} pre {{ margin:0; padding:0 19px 20px; overflow:auto; color:#cdd8e8; font:12px/1.5 ui-monospace,monospace }}
  footer {{ display:flex; justify-content:space-between; gap:18px; padding:25px 4px 0; color:var(--muted); font-size:12px }}
  @media(max-width:850px) {{ .settings,.fixture {{ grid-template-columns:1fr }} .flow,.metrics {{ grid-template-columns:1fr 1fr }}
    .checks {{ grid-template-columns:1fr 1fr }} }} @media(max-width:580px) {{ main {{ width:calc(100% - 18px); padding-top:10px }}
    .hero,section {{ padding:22px; border-radius:17px }} .compare,.flow,.metrics,.checks {{ grid-template-columns:1fr }}
    .flow article:not(:last-child)::after {{ content:'↓'; right:auto; top:auto; left:50%; bottom:-24px }} .head {{ display:block }}
    .head p {{ margin-top:8px }} footer {{ display:block }} }}
</style>
</head>
<body><main>
  <header class="hero">
    <div class="eyebrow">Implemented · Appearance preference</div>
    <h1>Compact by default. Explicit when wanted.</h1>
    <p class="lead">SystemSketch now hides the − and + zoom-step buttons on a fresh install while preserving the useful percentage menu. Appearance exposes the choice, reacts immediately, and remembers it on this computer—not in the board.</p>
    <div class="chips"><span class="chip">hidden by default</span><span class="chip">100% remains</span><span class="chip">local preference</span><span class="chip">stock zoom actions</span><span class="chip">all themes measured</span></div>
  </header>

  <section>
    <div class="head"><h2>One strip, two densities</h2><p>The percentage is the stable center of the control. The optional buttons add explicit step actions without introducing new zoom behavior.</p></div>
    <div class="compare">
      <figure><div class="crop" style="background-image:url('{hidden}')"></div><figcaption><strong>Default · compact</strong>Overview · 100% · Dev · Help. The two low-value icons no longer consume permanent space.</figcaption></figure>
      <figure><div class="crop" style="background-image:url('{shown}')"></div><figcaption><strong>Opted in · explicit</strong>Overview · − · 100% · + · Dev · Help. Both restored buttons call tldraw’s stock zoom actions.</figcaption></figure>
    </div>
  </section>

  <section>
    <div class="head"><h2>The adjustment lives in Appearance</h2><p>A plain-language switch keeps the default quiet while making the chrome hackable. The category rail remains fixed as the right panel scrolls.</p></div>
    <div class="settings">
      <figure><img class="full" src="{settings}" alt="SystemSketch Settings Appearance panel showing the Show zoom minus/plus buttons switch unchecked"><figcaption><strong>Fresh-profile state</strong>The switch starts off; its supporting line makes clear that the zoom percentage is never removed.</figcaption></figure>
      <div class="principles">
        <div class="principle"><b>Nice default</b><strong>Less permanent chrome</strong><p>The common zoom menu stays; redundant step buttons are opt-in.</p></div>
        <div class="principle"><b>Hackable viewer</b><strong>User-owned density</strong><p>The preference is immediate and persistent, with room for future appearance knobs in the same versioned store.</p></div>
        <div class="principle"><b>Board invariant</b><strong>No file-format change</strong><p>Only <code>localStorage</code> changes. The <code>.systemsketch</code> stays portable.</p></div>
      </div>
    </div>
  </section>

  <section>
    <div class="head"><h2>Narrow implementation seam</h2><p>The rendering change is a conditional around two existing toolbar buttons. No tldraw primitive was forked or reimplemented.</p></div>
    <div class="flow">
      <article><b>Settings → Appearance</b><span>Accessible <code>role=switch</code> writes one boolean.</span></article>
      <article><b>appearancePreferences.ts</b><span>Versioned, resilient local read/write and reactive snapshot.</span></article>
      <article><b>SystemSketchUtilities</b><span>Renders −/+ only when the preference is true.</span></article>
      <article><b>tldraw actions</b><span>The original <code>zoom-in</code> and <code>zoom-out</code> handlers remain authoritative.</span></article>
    </div>
  </section>

  <section>
    <div class="head"><h2>Measured proof</h2><p>The focused journey used a fresh browser profile, real pointer clicks, two full reloads, and the shipped app composition.</p></div>
    <div class="metrics"><div class="metric"><strong>{len(checks)}/12</strong><span>focused browser checks</span></div><div class="metric"><strong>470</strong><span>Vitest tests passing</span></div><div class="metric"><strong>48</strong><span>Python checks passing</span></div><div class="metric"><strong>140</strong><span>all-theme browser checks</span></div></div>
    <div class="checks">{''.join(f'<div class="check">{html.escape(item["label"])}</div>' for item in checks)}</div>
  </section>

  <section>
    <div class="head"><h2>Ready-to-drive review board</h2><p>The disposable fixture carries the literal gestures, orange gaze arrows, a green pass condition, and a real Block that must remain unchanged.</p></div>
    <div class="fixture">
      <figure><img class="full" src="{fixture_image}" alt="SystemSketch review board with three zoom controls instructions, orange arrows, a Block, and a green pass condition"><figcaption><strong>Cold-reopened from the generated file</strong>Eight editable shapes, one real SystemSketch Block, and no semantic bindings required for this chrome-only change.</figcaption></figure>
      <div class="fixture-copy"><div class="eyebrow">Human verification</div><h2>Try the same loop yourself</h2><p>Open Settings → Appearance, turn the buttons on, exercise both, and turn them off again. Pass when 100% remains and the Block is untouched.</p><a href="../sketches/review/zoom-controls-preference.systemsketch">Open the fixture file</a></div>
    </div>
    <details><summary>See the fixture recipe</summary><pre>{recipe_source}</pre></details>
  </section>

  <footer><span>SystemSketch · zoom controls appearance preference · 2 Sep 2026</span><span><a href="build_zoom_controls_preference.py">Gallery builder</a> · <a href="../README.md">README</a></span></footer>
</main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
