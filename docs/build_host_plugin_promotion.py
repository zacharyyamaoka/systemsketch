#!/usr/bin/env python3
"""Build the visual report for best-effort host-plugin Stable promotion."""

from __future__ import annotations

import base64
import html
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
OUTPUT = DOCS / "host-plugin-promotion-2026-09-02.html"


def data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def esc(value: str) -> str:
    return html.escape(value)


BUILD = "2588272a20c24712"
COMMIT = "3470f275e1f062c9a58ea42d83165168d0596c0f"
VSIX_SHA = "349f3384ad81997fd2a54a3bac639073cf3db5b88803545a8e64273510110b6e"
OBSIDIAN_SHA = "63ef03d0c7bad49647f22e14f192569b28ea14cf32d9908604d644ddbd449f29"
INSTALLED_BUILD = "17d050b467a08871"


def main() -> None:
    vscode = data_uri(DOCS / "assets" / "vscode-target-block-saved.png")
    obsidian = data_uri(DOCS / "assets" / "obsidian-systemsketch-dark.png")

    output = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stable promotion keeps the app independent</title>
<style>
  :root {{ color-scheme: dark; --bg:#0d1012; --panel:#151a1e; --panel2:#1b2227;
    --ink:#f3f1e8; --muted:#a8b0ad; --line:#344047; --green:#8ee0a1;
    --orange:#ffad66; --blue:#7cc9ff; --red:#ff8a82; --radius:18px; }}
  * {{ box-sizing:border-box }}
  body {{ margin:0; background:radial-gradient(circle at 18% 0,#1c2d2b 0,transparent 35%),var(--bg);
    color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
  main {{ width:min(1160px,calc(100% - 34px)); margin:0 auto; padding:62px 0 90px; }}
  h1 {{ max-width:900px; margin:0; font-size:clamp(42px,7vw,84px); line-height:.95;
    letter-spacing:-.055em; font-weight:760; }}
  h2 {{ margin:0 0 9px; font-size:26px; letter-spacing:-.025em; }}
  h3 {{ margin:0 0 6px; font-size:16px; }}
  p {{ margin:0; color:var(--muted); }}
  code {{ color:#d9efff; font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; }}
  .eyebrow {{ color:var(--green); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:800; }}
  .lede {{ max-width:770px; margin-top:24px; font-size:20px; color:#c9cfcc; }}
  .verdict {{ display:inline-flex; align-items:center; gap:9px; margin:30px 0 58px; padding:9px 13px;
    border:1px solid #39614a; border-radius:999px; color:#d6f7de; background:#14231a; font-weight:700; }}
  .dot {{ width:8px; height:8px; border-radius:50%; background:var(--green); box-shadow:0 0 16px var(--green); }}
  section {{ margin-top:58px; }}
  .section-head {{ display:flex; align-items:end; justify-content:space-between; gap:24px; margin-bottom:19px; }}
  .section-head p {{ max-width:620px; }}
  .grid {{ display:grid; gap:14px; }}
  .pipeline {{ grid-template-columns:repeat(5,1fr); position:relative; }}
  .step {{ min-height:148px; padding:18px; border:1px solid var(--line); border-radius:var(--radius);
    background:linear-gradient(145deg,#182026,#12171a); position:relative; }}
  .step::after {{ content:'→'; position:absolute; right:-14px; top:52px; z-index:2; color:#6b777d;
    font-size:22px; }}
  .step:last-child::after {{ content:''; }}
  .step b {{ display:block; color:var(--blue); font-size:12px; letter-spacing:.1em; margin-bottom:20px; }}
  .step strong {{ display:block; font-size:17px; line-height:1.2; margin-bottom:8px; }}
  .step small {{ color:var(--muted); }}
  .gate {{ padding:24px; border:1px solid var(--line); border-radius:22px; background:var(--panel); }}
  .gate-controls {{ display:flex; gap:8px; flex-wrap:wrap; margin:18px 0; }}
  button {{ appearance:none; border:1px solid #4a5a61; border-radius:999px; padding:9px 14px;
    background:#1a2227; color:#dbe1df; font:inherit; font-weight:700; cursor:pointer; }}
  button[aria-pressed=true] {{ color:#092214; background:var(--green); border-color:var(--green); }}
  .outcome {{ display:grid; grid-template-columns:1fr auto 1fr; gap:16px; align-items:center; padding:20px;
    background:#101518; border-radius:14px; border:1px solid #2b363c; }}
  .outcome-card {{ padding:16px; border-radius:13px; background:#1b2227; border:1px solid #354148; }}
  .outcome-card strong {{ display:block; margin-top:4px; font-size:18px; }}
  .outcome .arrow {{ color:#77848a; font-size:25px; }}
  .outcome[data-state=fail] .next {{ border-color:#6a3d39; }}
  .outcome[data-state=fail] .next strong {{ color:var(--red); }}
  .outcome[data-state=pass] .next {{ border-color:#356043; }}
  .outcome[data-state=pass] .next strong {{ color:var(--green); }}
  .host-grid {{ grid-template-columns:1.35fr .65fr; align-items:start; }}
  .viewer {{ overflow:hidden; border:1px solid var(--line); border-radius:22px; background:#080a0c; }}
  .viewer-bar {{ display:flex; justify-content:space-between; align-items:center; padding:12px 14px;
    background:#171d21; border-bottom:1px solid var(--line); }}
  .viewer-tabs {{ display:flex; gap:6px; }}
  .viewer img {{ display:block; width:100%; aspect-ratio:3/2; object-fit:cover; object-position:center; }}
  .proof-list {{ display:grid; gap:10px; }}
  .proof {{ padding:16px; border:1px solid var(--line); border-radius:15px; background:var(--panel); }}
  .proof .count {{ color:var(--green); font:700 24px/1 ui-monospace,monospace; }}
  .ledger {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line);
    border-radius:16px; background:var(--panel); }}
  .ledger th,.ledger td {{ padding:14px 16px; border-bottom:1px solid #2c363b; text-align:left; vertical-align:top; }}
  .ledger tr:last-child td {{ border-bottom:0; }}
  .ledger th {{ color:#89959a; text-transform:uppercase; letter-spacing:.1em; font-size:11px; }}
  .ledger td:first-child {{ color:var(--ink); font-weight:750; }}
  .mono {{ word-break:break-all; font:12px/1.5 ui-monospace,monospace; color:#bdd1dc; }}
  .scar-grid {{ grid-template-columns:repeat(2,1fr); }}
  .scar {{ padding:21px; border-left:3px solid var(--orange); border-radius:0 15px 15px 0; background:#1b1b18; }}
  .code-map {{ grid-template-columns:repeat(3,1fr); }}
  .code-card {{ padding:19px; background:var(--panel); border:1px solid var(--line); border-radius:16px; }}
  .code-card code {{ display:block; margin-bottom:8px; color:var(--blue); }}
  footer {{ margin-top:70px; padding-top:20px; border-top:1px solid var(--line); color:#6f7a7f; font-size:13px; }}
  @media (max-width:900px) {{ .pipeline,.code-map {{ grid-template-columns:1fr 1fr; }}
    .step::after {{ display:none }} .host-grid {{ grid-template-columns:1fr; }} }}
  @media (max-width:620px) {{ .pipeline,.scar-grid,.code-map {{ grid-template-columns:1fr; }}
    .outcome {{ grid-template-columns:1fr; }} .outcome .arrow {{ transform:rotate(90deg); text-align:center; }}
    .ledger {{ display:block; overflow:auto; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · implementation report · 02 Sep 2026</div>
  <h1>The app ships first. Hosts follow <em>without holding it hostage.</em></h1>
  <p class="lede">Confirming <strong>Make Preview Stable</strong> verifies and publishes the standalone app,
  then attempts the VS Code/Cursor and Obsidian builds. A host failure is visible, but cannot undo or
  interrupt the new Stable app.</p>
  <div class="verdict"><span class="dot"></span> Decoupled promotion and reload boundary exercised in real hosts</div>

  <section>
    <div class="section-head"><div><div class="eyebrow">One source, two outcomes</div>
      <h2>The promotion path</h2></div><p>The app has a hard verification gate. Host packages consume that same accepted source afterward, as independent best-effort outputs.</p></div>
    <div class="grid pipeline">
      <article class="step"><b>01</b><strong>Preview source</strong><small>The working tree Zach just tested.</small></article>
      <article class="step"><b>02</b><strong>Check + app build</strong><small>TypeScript, Vitest, Python, Vite.</small></article>
      <article class="step"><b>03</b><strong>Advance Stable</strong><small>The standalone release is now available.</small></article>
      <article class="step"><b>04</b><strong>VS Code / Cursor</strong><small>Attempt exact-source VSIX; report failure independently.</small></article>
      <article class="step"><b>05</b><strong>Obsidian</strong><small>Attempt guarded bundle; never roll the app back.</small></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Failure semantics</div><h2>Host failure is not app failure</h2></div>
      <p><code>promote_candidate()</code> now happens before the host-build attempt. Explore the two outcomes.</p></div>
    <div class="gate">
      <div class="gate-controls">
        <button id="pass" aria-pressed="true">Host builds pass</button>
        <button id="fail" aria-pressed="false">Host build fails</button>
      </div>
      <div class="outcome" id="outcome" data-state="pass">
        <div class="outcome-card"><small>Verified standalone candidate</small><strong>Stable advances first</strong></div>
        <div class="arrow">→</div>
        <div class="outcome-card next"><small id="next-label">Host artifacts complete</small><strong id="next-value">Stable = {BUILD[:8]}</strong></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Real application proof</div><h2>The newly generated files work in disposable hosts</h2></div>
      <p>These are real VS Code and Obsidian journeys against build <code>{BUILD[:8]}</code>—not component renders or a dev iframe.</p></div>
    <div class="grid host-grid">
      <div class="viewer">
        <div class="viewer-bar"><div class="viewer-tabs">
          <button id="show-vscode" aria-pressed="true">VS Code</button>
          <button id="show-obsidian" aria-pressed="false">Obsidian</button>
        </div><span id="host-caption">Packaged VSIX · dark workbench</span></div>
        <img id="host-shot" src="{vscode}" alt="SystemSketch running inside VS Code">
      </div>
      <div class="proof-list">
        <article class="proof"><div class="count">10 / 10</div><h3>VS Code</h3><p>Open, edit, dirty state, save, reopen, `.tldr`, and external reload.</p></article>
        <article class="proof"><div class="count">8 / 8 reachable</div><h3>Cursor</h3><p>Same VSIX. The fresh-profile sign-in wall blocks the final two checks; the suite names them instead of guessing.</p></article>
        <article class="proof"><div class="count">8 / 8</div><h3>Obsidian</h3><p>Autosave, external reload, `.tldr`, embeds, and both host themes.</p></article>
        <article class="proof"><div class="count">673 + 72</div><h3>Regression suites</h3><p>Vitest and Python release tests remained green, including a forced host-build failure after Stable advanced.</p></article>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Immutable output</div><h2>Proof build {BUILD}</h2></div>
      <p>One manifest ties each accepted byte to the app build and source commit <code>{COMMIT[:12]}</code>.</p></div>
    <table class="ledger">
      <thead><tr><th>Host</th><th>Artifact</th><th>Bytes</th><th>SHA-256</th></tr></thead>
      <tbody>
        <tr><td>VS Code</td><td class="mono">vscode/systemsketch-vscode-0.1.0.vsix</td><td>2,979,484</td><td class="mono">{VSIX_SHA}</td></tr>
        <tr><td>Cursor</td><td>Shares the exact VSIX above</td><td>2,979,484</td><td class="mono">{VSIX_SHA}</td></tr>
        <tr><td>Obsidian</td><td class="mono">obsidian/main.js + styles.css + manifest.json + bundle.json</td><td>7,754,183 main.js</td><td class="mono">main.js {OBSIDIAN_SHA}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:12px">Durable location: <code>~/.local/share/systemsketch/runtime/host-releases/&lt;build&gt;/</code>. Working-tree <code>dist/</code> copies remain convenient for explicit installation.</p>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Reload test</div><h2>A rebuild is not an update mechanism</h2></div>
      <p>The installed directories were measured before launching isolated copies of those exact installations.</p></div>
    <div class="grid scar-grid">
      <article class="scar"><h3>VS Code + Cursor kept {INSTALLED_BUILD[:8]}</h3><p>After a newer host build existed, both installed extensions still contained <code>{INSTALLED_BUILD}</code>. Real clean-profile launches copied those installed directories: VS Code passed 10/10 and Cursor 8/8 reachable checks while still reporting the old build.</p></article>
      <article class="scar"><h3>Obsidian needs the new plugin installed</h3><p>The built plugin is <code>systemsketch-obsidian</code> and build <code>{BUILD[:8]}</code> passed 8/8 in an isolated vault. The enabled live-vault directory is the legacy <code>systemsketch</code> plugin, so reloading cannot discover the new bundle by itself.</p></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Ownership map</div><h2>Small seams, no second canvas</h2></div></div>
    <div class="grid code-map">
      <article class="code-card"><code>scripts/release.py</code><p>Publishes standalone Stable, then catches and reports host-build errors without reversing it.</p></article>
      <article class="code-card"><code>scripts/server.py</code><p>Reports whether the current Stable build has host artifacts, so Preview can distinguish success from follow-up attention.</p></article>
      <article class="code-card"><code>tests/*_e2e.mjs</code><p>Can now launch copies of installed host directories and record the bundle identity that actually ran.</p></article>
    </div>
  </section>

  <section class="gate">
    <div class="eyebrow">Deliberate boundary</div><h2>Build automatically; install explicitly.</h2>
    <p>Promotion never replaces a running extension or vault plugin. Reloading only reopens the files already installed. To make reload pick up a release, a separate best-effort deploy step must first run <code>code/cursor --install-extension --force</code> and copy the Obsidian bundle into an explicitly registered vault.</p>
  </section>

  <footer>Generated by <code>docs/build_host_plugin_promotion.py</code> from repository-owned evidence. The implementation and ordinary regression tests remain the living specification.</footer>
</main>
<script>
  const pass = document.querySelector('#pass'), fail = document.querySelector('#fail')
  const outcome = document.querySelector('#outcome'), nextLabel = document.querySelector('#next-label')
  const nextValue = document.querySelector('#next-value')
  function state(kind) {{
    const ok = kind === 'pass'; pass.setAttribute('aria-pressed', String(ok)); fail.setAttribute('aria-pressed', String(!ok))
    outcome.dataset.state = kind
    nextLabel.textContent = ok ? 'Host artifacts complete' : 'Host artifacts need attention'
    nextValue.textContent = 'Stable = {BUILD[:8]}'
  }}
  pass.onclick = () => state('pass'); fail.onclick = () => state('fail')
  const shots = {{
    vscode: {{ src: {vscode!r}, alt: 'SystemSketch running inside VS Code', caption: 'Packaged VSIX · dark workbench' }},
    obsidian: {{ src: {obsidian!r}, alt: 'SystemSketch running inside Obsidian', caption: 'Built plugin bundle · dark vault' }}
  }}
  for (const name of ['vscode','obsidian']) document.querySelector(`#show-${{name}}`).onclick = () => {{
    document.querySelector('#show-vscode').setAttribute('aria-pressed', String(name === 'vscode'))
    document.querySelector('#show-obsidian').setAttribute('aria-pressed', String(name === 'obsidian'))
    document.querySelector('#host-shot').src = shots[name].src
    document.querySelector('#host-shot').alt = shots[name].alt
    document.querySelector('#host-caption').textContent = shots[name].caption
  }}
</script>
</body>
</html>
"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
