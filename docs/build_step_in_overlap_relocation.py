#!/usr/bin/env python3
"""Build the self-contained Step In overlap-relocation evidence gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "step-in-overlap-relocation-2026-09-02.html"
RESULTS = ROOT / "docs" / "assets" / "step-in-overlap-relocation-results.json"
AFTER = ROOT / "docs" / "assets" / "step-in-overlap-relocation-2026-09-02.png"
FIXTURE = ROOT / "sketches" / "review" / "step-in-overlap-relocation.png"
PLACEMENT = ROOT / "src" / "blocks" / "avoidSiblingOcclusion.ts"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source_excerpt() -> str:
    lines = PLACEMENT.read_text(encoding="utf-8").splitlines()
    start = next(index for index, line in enumerate(lines) if "export function steppedInResizeRelocation" in line)
    return "\n".join(
        f"{number + 1:>4}  {line}" if line else ""
        for number, line in enumerate(lines[start:start + 34], start)
    )


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))["checks"]
    passing = sum(1 for check in checks if check["ok"])
    if passing != len(checks):
        raise SystemExit("refusing to build from failing browser evidence")
    check_list = "".join(
        f'<li><span>✓</span>{html.escape(check["label"])}</li>' for check in checks
    )
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Step In overlap relocation · SystemSketch</title>
<style>
:root{{--paper:#f5f3ed;--ink:#232322;--muted:#6c6962;--line:#d8d3c9;--blue:#2f7fe7;--green:#18794e;--orange:#e47b25;--card:#fff}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1200px,calc(100% - 40px));margin:auto;padding:64px 0 100px}}h1{{max-width:930px;margin:8px 0 0;font-size:clamp(44px,7vw,84px);line-height:.95;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:800 12px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}.lede{{max-width:820px;margin:26px 0 42px;color:#44413c;font-size:21px}}
.hero,.rule-grid,.shots{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}.card,.shot{{overflow:hidden;border:1px solid var(--line);border-radius:19px;background:var(--card);box-shadow:0 14px 35px #29251e0a}}
.card{{padding:25px}}.card h2,.card h3{{margin:4px 0 10px;letter-spacing:-.03em}}.big{{font-size:31px;font-weight:820;letter-spacing:-.035em}}.muted{{color:var(--muted)}}
.flow{{display:flex;align-items:center;gap:10px;margin-top:22px;flex-wrap:wrap}}.chip{{padding:8px 11px;border-radius:9px;background:#edf4fe;color:#185cae;font-weight:760}}.arrow{{color:#9c978e;font-size:22px}}
.unchanged{{display:grid;gap:9px;margin-top:18px}}.unchanged div{{display:flex;justify-content:space-between;padding-top:9px;border-top:1px solid #ece8df}}.unchanged b{{color:var(--green)}}
section{{margin-top:55px}}section>h2{{font-size:31px;letter-spacing:-.035em}}figure{{margin:0}}.shot img{{display:block;width:100%;height:auto}}figcaption{{padding:14px 18px;color:var(--muted);font-size:14px}}
ul{{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;padding:0;list-style:none}}li{{display:flex;gap:9px}}li span{{color:var(--green);font-weight:900}}
pre{{overflow:auto;padding:22px;border-radius:16px;background:#20242b;color:#e9edf2;font:13px/1.55 ui-monospace,monospace}}code{{font-family:ui-monospace,monospace}}
.meta{{margin-top:55px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}a{{color:#1e63b6}}@media(max-width:800px){{.hero,.rule-grid,.shots,ul{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · interaction evidence · 2026-09-02</div>
<h1>The active scope gives way.</h1>
<p class="lede">Stretching an Expanded Block inside Step In can no longer bury nodes that are hidden from that isolated view. On resize release, the active Block subtree moves to the nearest collision-free position; the surrounding graph remains exactly where it was.</p>
<div class="hero">
  <article class="card"><div class="eyebrow">Resize contract</div><div class="flow"><span class="chip">stock resize</span><span class="arrow">→</span><span class="chip">detect sibling overlap</span><span class="arrow">→</span><span class="chip">return x / y</span></div><p>The search evaluates exact clearance edges and chooses the smallest page-space translation. It is deterministic and leaves a 32 px visual gap.</p></article>
  <article class="card"><div class="eyebrow">Depth action</div><div class="big">Step in ↔ Step out</div><p>At Board depth, the active command says <b>Step in</b>. Once that same Block is the current scope, every Block command surface says <b>Step out</b> and returns to the parent depth.</p></article>
</div>
<section><h2>One mover; no surprise containment</h2><div class="rule-grid">
  <article class="card"><h3>Allowed to change</h3><div class="unchanged"><div><span>Expanded Block</span><b>x / y / size</b></div><div><span>Its existing descendants</span><b>travel with parent</b></div></div></article>
  <article class="card"><h3>Guaranteed unchanged</h3><div class="unchanged"><div><span>Sibling nodes</span><b>x / y fixed</b></div><div><span>Every parent chain</span><b>fixed</b></div><div><span>Connections</span><b>follow bindings</b></div></div></article>
</div></section>
<section><h2>What the real browser saw</h2><div class="shots">
  <figure class="shot"><img src="{image_uri(FIXTURE)}" alt="Review fixture before entering run scope"><figcaption>Before: <code>receive()</code> is a sibling immediately left of <code>run()</code>. The cue asks for a bottom-left resize while it is hidden by Step In.</figcaption></figure>
  <figure class="shot"><img src="{image_uri(AFTER)}" alt="Expanded run Block relocated clear of fixed receive Block"><figcaption>After Step out: <code>run()</code> is wider and clear; <code>receive()</code> stayed fixed; <code>decode()</code> travelled with its parent.</figcaption></figure>
</div></section>
<section><h2>{passing}/{len(checks)} physical browser checks pass</h2><article class="card"><ul>{check_list}</ul></article></section>
<section><h2>The supported post-resize seam</h2><pre>{html.escape(source_excerpt())}</pre></section>
<p class="meta">Built from the live source tree. The review board is <a href="../sketches/review/step-in-overlap-relocation.systemsketch">step-in-overlap-relocation.systemsketch</a>.</p>
</main></body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"Built {OUT}")


if __name__ == "__main__":
    main()
