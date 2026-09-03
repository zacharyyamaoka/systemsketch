#!/usr/bin/env python3
"""Build the self-contained detached-connection presentation gallery."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUT = ROOT / "docs" / "detached-connection-presentation-2026-09-02.html"
ACCEPTANCE = ASSETS / "detached-connection-presentation-acceptance.json"


def image_uri(name: str) -> str:
    path = ASSETS / name
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    data = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
    crops = data["crops"]
    minimum_edge = min(item["score"]["edgeSimilarity"] for item in crops)
    checks = data["checks"]
    check_rows = "".join(
        f"<li><span>{'✓' if ok else '×'}</span>{html.escape(label.replace('_', ' '))}</li>"
        for label, ok in checks.items()
    )
    crop_cards = "".join(
        f"""
        <article class="crop-card">
          <h3>{html.escape(item['key'].replace('-', ' ').title())}</h3>
          <div class="crop-pair">
            <figure><img src="{image_uri(f"detached-connection-{item['key']}-before.png")}" alt="{item['key']} before detach"><figcaption>Semantic cable</figcaption></figure>
            <figure><img src="{image_uri(f"detached-connection-{item['key']}-after.png")}" alt="{item['key']} after detach"><figcaption>Stock arrow primitive</figcaption></figure>
          </div>
          <p><strong>{item['score']['edgeSimilarity'] * 100:.4f}%</strong> edge-map similarity</p>
        </article>
        """
        for item in crops
    )
    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Detached connection presentation · SystemSketch</title>
<style>
:root{{--ink:#17202b;--muted:#647182;--paper:#f7f8fa;--card:#fff;--blue:#2f7ff7;--green:#19a76f;--line:#dfe4ea}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1220px,calc(100% - 40px));margin:0 auto;padding:64px 0 90px}} h1{{font-size:clamp(38px,6vw,72px);line-height:1.02;letter-spacing:-.045em;margin:14px 0 18px;max-width:950px}}
h2{{font-size:30px;letter-spacing:-.025em;margin:0 0 18px}} h3{{margin:0 0 14px}} p{{color:var(--muted)}} .eyebrow{{color:var(--blue);font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}}
.lede{{font-size:20px;max-width:820px}} .metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:34px 0 58px}} .metric,.panel,.crop-card{{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 35px rgba(31,42,55,.06)}}
.metric{{padding:22px}} .metric strong{{display:block;font-size:32px;letter-spacing:-.04em}} .metric span{{color:var(--muted)}} section{{margin:62px 0}} .compare{{display:grid;grid-template-columns:1fr 1fr;gap:18px}} figure{{margin:0}} figure img{{display:block;width:100%;border-radius:14px;border:1px solid var(--line);background:white}} figcaption{{padding:10px 2px;color:var(--muted);font-size:13px}}
.crop-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}} .crop-card{{padding:18px}} .crop-pair{{display:grid;gap:10px}} .crop-card p{{margin:12px 0 0}} .crop-card strong{{color:var(--green)}}
.panel{{padding:28px}} ul{{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(2,1fr);gap:10px 24px}} li{{display:flex;gap:10px;color:#394554}} li span{{color:var(--green);font-weight:900}}
.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center}} .flow div{{background:white;border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center}} .arrow{{color:var(--blue);font-size:24px}}
code{{background:#eef3fa;border-radius:6px;padding:2px 6px;color:#31526f}} footer{{margin-top:70px;color:var(--muted);font-size:13px}}
@media(max-width:820px){{.metrics,.compare,.crop-grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}ul{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · verified 2026-09-02</div>
<h1>Detach the arrow, not its visual language.</h1>
<p class="lede">A connection can now become a stock tldraw arrow on its own. Async cadence, the delayed cable's solid-before/dotted-after split, pill position, and <code>z⁻¹ = value</code> survive the transfer—and continue to follow stock routing when endpoints move.</p>
<div class="metrics">
  <div class="metric"><strong>{minimum_edge * 100:.2f}%</strong><span>worst edge-map similarity</span></div>
  <div class="metric"><strong>3 / 3</strong><span>direct + Block-triggered visual cases</span></div>
  <div class="metric"><strong>{sum(checks.values())} / {len(checks)}</strong><span>real-browser acceptance gates</span></div>
</div>
<section><h2>Before and immediately after</h2><div class="compare">
<figure><img src="{image_uri('detached-connection-presentation-before.png')}" alt="Async and delayed semantic connections before detach"><figcaption>Before · semantic connections</figcaption></figure>
<figure><img src="{image_uri('detached-connection-presentation-after.png')}" alt="Matching stock arrows after detach"><figcaption>After · detached stock arrows, same camera</figcaption></figure>
</div></section>
<section><h2>Measured cable corridors</h2><p>The score ignores the mostly-empty canvas and compares each painted edge corridor directly.</p><div class="crop-grid">{crop_cards}</div></section>
<section><h2>Movement hands geometry back to tldraw</h2><div class="compare">
<figure><img src="{image_uri('detached-connection-presentation-moved.png')}" alt="Detached arrows reflowing after endpoint movement"><figcaption>After real pointer drags · stock curve/elbow geometry, retained edge presentation</figcaption></figure>
<div class="panel"><div class="flow"><div>Exact detach snapshot</div><span class="arrow">→</span><div>Endpoint moves</div><span class="arrow">→</span><div>Stock arrow reflow + frozen presentation</div></div><p>The snapshot is only a zero-error bridge. Binding, endpoint movement, route calculation, handles, and selection remain stock tldraw behavior.</p></div>
</div></section>
<section><h2>Acceptance</h2><div class="panel"><ul>{check_rows}</ul></div></section>
<footer>Built from <code>tests/detached_connection_presentation_smoke.mjs</code> and its measured assets. Builder: <code>docs/build_detached_connection_presentation.py</code>.</footer>
</main></body></html>"""
    document = "\n".join(line.rstrip() for line in document.splitlines()) + "\n"
    OUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
