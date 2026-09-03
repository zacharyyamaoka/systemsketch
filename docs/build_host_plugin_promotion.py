#!/usr/bin/env python3
"""Build the visual report for atomic host-plugin Stable promotion."""

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


BUILD = "d81b3e72f33e55f1"
COMMIT = "aa95f55b33cdc8ac71aded3d4b842d95e70ec1fc"
VSIX_SHA = "059e543a61b816fce4cad877f4340587f396f0c9e0532b25d83d5581dfd0d0cf"
OBSIDIAN_SHA = "3ea8d5b17328a545dfd04645f76c2941a7e78270d4f07ee0649fce0e11819c47"


def main() -> None:
    vscode = data_uri(DOCS / "assets" / "vscode-target-block-saved.png")
    obsidian = data_uri(DOCS / "assets" / "obsidian-systemsketch-dark.png")

    output = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stable promotion now builds every host</title>
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
  <h1>Stable now means the app <em>and</em> every host.</h1>
  <p class="lede">Confirming <strong>Make Preview Stable</strong> builds the browser release, VS Code/Cursor VSIX,
  and Obsidian bundle as one gated transaction. If any host fails, the Stable pointer does not move.</p>
  <div class="verdict"><span class="dot"></span> Implemented and exercised in all three desktop hosts</div>

  <section>
    <div class="section-head"><div><div class="eyebrow">One source, one acceptance point</div>
      <h2>The promotion path</h2></div><p>The host packages are not separate canvases. Both consume the same candidate source before it is permitted to become Stable.</p></div>
    <div class="grid pipeline">
      <article class="step"><b>01</b><strong>Preview source</strong><small>The working tree Zach just tested.</small></article>
      <article class="step"><b>02</b><strong>Check + app build</strong><small>TypeScript, Vitest, Python, Vite.</small></article>
      <article class="step"><b>03</b><strong>VS Code / Cursor</strong><small>Stage exact candidate, typecheck, bundle, VSIX.</small></article>
      <article class="step"><b>04</b><strong>Obsidian</strong><small>Typecheck, bundle, provenance check.</small></article>
      <article class="step"><b>05</b><strong>Advance Stable</strong><small>Only after every prior step succeeds.</small></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Failure semantics</div><h2>The old Stable is the fallback</h2></div>
      <p>The host builds happen before <code>promote_candidate()</code>. Explore the two outcomes.</p></div>
    <div class="gate">
      <div class="gate-controls">
        <button id="pass" aria-pressed="true">All host builds pass</button>
        <button id="fail" aria-pressed="false">A host build fails</button>
      </div>
      <div class="outcome" id="outcome" data-state="pass">
        <div class="outcome-card"><small>Before confirmation</small><strong>Stable = previous verified build</strong></div>
        <div class="arrow">→</div>
        <div class="outcome-card next"><small id="next-label">After verified host artifacts</small><strong id="next-value">Stable = {BUILD[:8]}</strong></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Real application proof</div><h2>The generated files were installed into disposable hosts</h2></div>
      <p>These are host journeys against the package produced by the transaction—not component renders or a dev iframe.</p></div>
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
        <article class="proof"><div class="count">671 + 72</div><h3>Regression suites</h3><p>Vitest and Python release tests remained green.</p></article>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Immutable output</div><h2>Proof build {BUILD}</h2></div>
      <p>One manifest ties each accepted byte to the app build and source commit <code>{COMMIT[:12]}</code>.</p></div>
    <table class="ledger">
      <thead><tr><th>Host</th><th>Artifact</th><th>Bytes</th><th>SHA-256</th></tr></thead>
      <tbody>
        <tr><td>VS Code</td><td class="mono">vscode/systemsketch-vscode-0.1.0.vsix</td><td>2,976,266</td><td class="mono">{VSIX_SHA}</td></tr>
        <tr><td>Cursor</td><td>Shares the exact VSIX above</td><td>2,976,266</td><td class="mono">{VSIX_SHA}</td></tr>
        <tr><td>Obsidian</td><td class="mono">obsidian/main.js + styles.css + manifest.json + bundle.json</td><td>7,995,719</td><td class="mono">main.js {OBSIDIAN_SHA}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:12px">Durable location: <code>~/.local/share/systemsketch/runtime/host-releases/&lt;build&gt;/</code>. Working-tree <code>dist/</code> copies remain convenient for explicit installation.</p>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Physical-run findings</div><h2>Two bugs only appeared when the package was real</h2></div></div>
    <div class="grid scar-grid">
      <article class="scar"><h3>Hidden interactive prompt</h3><p><code>vsce</code> paused to ask about the missing LICENSE. The automated path now passes <code>--skip-license</code>, so promotion is noninteractive.</p></article>
      <article class="scar"><h3>Correct artifact, wrong install path</h3><p>The first immutable VSIX existed but the real-host test could not find the conventional <code>dist/</code> copy. Packaging now writes there first, then copies those exact bytes into the release store.</p></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><div class="eyebrow">Ownership map</div><h2>Small seams, no second canvas</h2></div></div>
    <div class="grid code-map">
      <article class="code-card"><code>scripts/release.py</code><p>Owns the host-build gate, manifest, checksums, and ordering before Stable moves.</p></article>
      <article class="code-card"><code>scripts/release_lib.py</code><p>Adds host sources to the release identity and dirty/newer-source boundary.</p></article>
      <article class="code-card"><code>vscode-systemsketch/scripts/stage_app.mjs</code><p>Stages one named immutable candidate before it becomes the Stable pointer.</p></article>
    </div>
  </section>

  <section class="gate">
    <div class="eyebrow">Deliberate boundary</div><h2>Build automatically; install explicitly.</h2>
    <p>Promotion never replaces a running extension or reloads VS Code, Cursor, or Obsidian behind Zach’s back. The accepted artifacts are ready immediately; choosing when to install/reload them stays a user action.</p>
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
    nextLabel.textContent = ok ? 'After verified host artifacts' : 'After the build error'
    nextValue.textContent = ok ? 'Stable = {BUILD[:8]}' : 'Stable = unchanged'
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
