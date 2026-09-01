#!/usr/bin/env python3
"""Build the self-contained visual handoff for the SystemSketch foundation."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCREENSHOTS = PROJECT_ROOT / "docs" / "screenshots"
OUTPUT = PROJECT_ROOT / "docs" / "systemsketch-foundation-2026-08-30.html"
CHANNELS = Path.home() / ".local" / "share" / "systemsketch" / "runtime" / "channels.json"


def data_uri(path: Path) -> str:
    suffix = path.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> None:
    channels = json.loads(CHANNELS.read_text(encoding="utf-8"))
    stable = html.escape(str(channels["stable"]))
    previous = html.escape(str(channels["previous"]))
    icon = data_uri(PROJECT_ROOT / "assets" / "systemsketch.png")
    stock = data_uri(SCREENSHOTS / "stable-stock.png")
    stable_drawer = data_uri(SCREENSHOTS / "final-stable-update-pill.png")
    preview_drawer = data_uri(SCREENSHOTS / "final-preview-update-pill.png")

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · stock foundation</title>
<style>
  :root{{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--green:#149447;--amber:#e89b12;--blue:#315be8}}
  *{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
  main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 72px}}
  .hero{{display:grid;grid-template-columns:1fr 164px;gap:28px;align-items:center;padding:32px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 18px 50px #1218200b}}
  .icon{{width:154px;height:154px;border-radius:28px;object-fit:cover;box-shadow:0 12px 35px #0002}}
  .kicker{{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}}
  h1{{margin:6px 0 10px;font-size:clamp(34px,6vw,68px);line-height:.98;letter-spacing:-.05em}} .lede{{max-width:780px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}} .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;font:700 12px/1.2 ui-monospace,monospace}}
  section{{margin-top:44px}} h2{{margin:0 0 14px;font-size:28px;letter-spacing:-.03em}} .sub{{margin:-8px 0 20px;color:var(--muted)}}
  .shots{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}} figure{{margin:0;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}}
  figure.wide{{grid-column:1/-1}} figure img{{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9}} figcaption{{padding:10px 4px 2px;color:var(--muted)}} figcaption strong{{display:block;color:var(--ink)}}
  .flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:center}} .node{{min-height:142px;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}} .node b{{display:block;font-size:18px}} .node small{{display:block;margin-top:8px;color:var(--muted)}} .dot{{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:50%}} .green{{background:var(--green)}} .amber{{background:var(--amber)}} .arrow{{font-size:28px;color:#8b929a}}
  .grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}} .proof{{padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}} .proof .n{{font:800 30px/1 ui-monospace,monospace;color:var(--blue)}} .proof h3{{margin:11px 0 5px}} .proof p{{margin:0;color:var(--muted)}}
  .boundary{{display:grid;grid-template-columns:1fr 1fr;gap:18px}} .list{{padding:22px;border:1px solid var(--line);border-radius:16px;background:var(--card)}} .list h3{{margin-top:0}} .list ul{{margin-bottom:0;padding-left:20px}} code{{padding:.12em .35em;border-radius:5px;background:#eceff2}}
  footer{{margin-top:50px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}} footer a{{color:var(--ink)}}
  @media(max-width:760px){{.hero{{grid-template-columns:1fr}}.hero .icon{{order:-1;width:96px;height:96px}}.shots,.grid,.boundary{{grid-template-columns:1fr}}figure.wide{{grid-column:auto}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg);text-align:center}}}}
</style>
</head>
<body><main>
  <header class="hero">
    <div><div class="kicker">SystemSketch · foundation reset</div><h1>Start boring.<br>Grow reliably.</h1>
      <p class="lede">A stock tldraw whiteboard is now the product datum. One small pill is the only added surface: it keeps a frozen Stable build available while agents evolve a separate hot-reloading Preview.</p>
      <div class="badges"><span class="badge">tldraw 5.3.2</span><span class="badge">SystemSketch 0.1.0</span><span class="badge">Stable {stable}</span><span class="badge">Previous {previous}</span></div>
    </div><img class="icon" src="{icon}" alt="Requested black SystemSketch dock icon">
  </header>

  <section><h2>The delivered app</h2><p class="sub">These are captures of the actual installed Stable and live Preview, not a CSS mock.</p>
    <div class="shots">
      <figure class="wide"><img src="{stock}" alt="Stock tldraw canvas with a persisted rectangle and the small SystemSketch pill"><figcaption><strong>Stock means stock.</strong>Default menus, style panel, tool rail, shapes, shortcuts, page UI, and canvas behavior. The drawn rectangle survived reload through tldraw's official persistence seam.</figcaption></figure>
      <figure><img src="{stable_drawer}" alt="Stable SystemSketch update drawer"><figcaption><strong>Stable is a frozen anchor.</strong>Exact version/build, release time, changelog, Preview entry, and rollback—without replacing any tldraw component.</figcaption></figure>
      <figure><img src="{preview_drawer}" alt="Preview SystemSketch update drawer"><figcaption><strong>Preview follows the repo live.</strong>A separate local canvas, Return to Stable, and a gated Publish action.</figcaption></figure>
    </div>
  </section>

  <section><h2>The evolution seam</h2><p class="sub">One codebase, two runtime lanes, one intentional promotion transaction.</p>
    <div class="flow">
      <div class="node"><b>This GitHub repo</b><small>Agents edit React/CSS on <code>main</code>. Vite watches the checkout.</small></div><div class="arrow">→</div>
      <div class="node"><b><span class="dot amber"></span>Preview · :4322</b><small>Hot reloads immediately and uses its own browser profile/local canvas.</small></div><div class="arrow">→</div>
      <div class="node"><b><span class="dot green"></span>Stable · :4321</b><small>Content-addressed immutable build. The dock icon always enters here.</small></div>
    </div>
  </section>

  <section><h2>Executed evidence</h2><div class="grid">
    <article class="proof"><div class="n">5/5</div><h3>Regression checks</h3><p>Stock boundary, immutable promotion, rollback, release API, and launcher-owned window handoff.</p></article>
    <article class="proof"><div class="n">0</div><h3>Browser errors</h3><p>Stable and Preview were exercised in the rendered app; warning/error logs were empty.</p></article>
    <article class="proof"><div class="n">1→1</div><h3>Persistence</h3><p>A physical rectangle drag produced one shape; reload and release restart retained that same shape.</p></article>
    <article class="proof"><div class="n">HMR</div><h3>Live mutation proven</h3><p>The open Preview received a temporary source-string mutation without reload, then received its revert.</p></article>
    <article class="proof"><div class="n">SHA</div><h3>Icon exactness</h3><p>The repo and installed icon byte-match the requested black source image; exact-name legacy variants are now removed before the icon-theme cache is rebuilt.</p></article>
    <article class="proof"><div class="n">A/B</div><h3>Stable stayed still</h3><p>Publishing advanced the pointer while the running Stable process continued serving its old build until a clean restart.</p></article>
  </section>

  <section id="dock-icon-repair"><h2>Dock icon lookup repaired · September 1</h2><p class="sub">The asset was correct; the desktop theme was resolving a higher-priority stale variant.</p>
    <div class="flow">
      <div class="node"><b><span class="dot amber"></span>Legacy scalable SVG</b><small>The old purple pencil icon shared the <code>systemsketch</code> name and outranked the installed PNG.</small></div><div class="arrow">→</div>
      <div class="node"><b>Installer cleanup</b><small>Remove exact-name PNG, SVG, and XPM alternatives everywhere except the canonical 512px path, then rebuild caches.</small></div><div class="arrow">→</div>
      <div class="node"><b><span class="dot green"></span>Canonical black mark</b><small>GTK now resolves <code>systemsketch</code> to <code>512x512/apps/systemsketch.png</code>; the installed bytes match the asset above.</small></div>
    </div>
  </section>

  <section><h2>The deliberate boundary</h2><div class="boundary">
    <div class="list"><h3>Present now</h3><ul><li>Stock tldraw UI and schema</li><li>Official browser-local persistence</li><li>Stable / live Preview / rollback</li><li>Requested dock icon and launcher identity</li><li>Self-hosted tldraw assets</li></ul></div>
    <div class="list"><h3>Not smuggled into the baseline</h3><ul><li>Excalidraw-shaped chrome</li><li>Custom SystemSketch blocks or bindings</li><li>IcePanel drafts and versions</li><li>File-backed <code>.systemsketch</code> documents</li><li>Any pyblocks runtime or UI code</li></ul></div>
  </div></section>

  <footer>Code map: <a href="../src/App.tsx">stock boundary</a> · <a href="../scripts/install_desktop.py">desktop icon installer</a> · <a href="../scripts/release_lib.py">immutable releases</a> · <a href="../scripts/launch_systemsketch.py">desktop launcher</a> · <a href="../README.md">project README</a></footer>
</main></body></html>"""
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(report, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
