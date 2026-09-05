#!/usr/bin/env python3
"""Build the self-contained Semantic-port Tags-tab review gallery."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "docs/assets/semantic-role-tags-tab-smoke-2026-09-04.png"
OUT = ROOT / "docs/semantic-role-tags-tab-2026-09-04.html"


def main() -> None:
    if not PNG.exists():
        raise SystemExit(f"Capture required before build: {PNG}")
    image = base64.b64encode(PNG.read_bytes()).decode("ascii")
    OUT.write_text(
        f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Port semantic Tags tab · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#eff5fb;--muted:#aab7c8;--line:#334257;--panel:#17212e;--accent:#72adff;--mint:#6de3b2;--warm:#ffc967;--canvas:#0d141e}}
*{{box-sizing:border-box}} body{{margin:0;background:radial-gradient(circle at 88% -8%,#1b3358 0,transparent 32rem),var(--canvas);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{max-width:1240px;margin:auto;padding:56px 28px 84px}} h1{{max-width:980px;margin:0 0 18px;font-size:clamp(2.25rem,5.5vw,4.7rem);line-height:1.02;letter-spacing:-.045em}} h2{{margin:54px 0 16px;font-size:1.55rem}} h3{{margin:0 0 8px;font-size:1.02rem;color:var(--accent)}} p{{margin:0 0 13px}} a{{color:#a9d2ff}} code{{color:#d3e6ff;font:600 .9em ui-monospace,SFMono-Regular,monospace}} .eyebrow{{margin:0 0 14px;color:var(--mint);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}} .lede{{max-width:850px;color:var(--muted);font-size:1.24rem}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px}} article,.callout{{padding:20px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,#1b2838,#141d29)}} .chips{{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 30px}} .chip{{padding:5px 10px;border:1px solid #426084;border-radius:999px;background:#172b41;color:#b9d9ff;font-size:.82rem;font-weight:700}} figure{{margin:26px 0;padding:12px;border:1px solid var(--line);border-radius:18px;background:#edf3fa;box-shadow:0 22px 70px #0005}} figure img{{display:block;width:100%;border-radius:10px}} figcaption{{padding:11px 5px 2px;color:#26364a;font-size:.92rem}} .tabs{{display:flex;gap:0;align-items:end;margin:18px 0 0;font-weight:800}} .tab{{padding:9px 19px;border:1px solid var(--line);border-bottom:0;border-radius:11px 11px 0 0;background:#121b28;color:var(--muted)}} .tab.active{{position:relative;background:#2e79dc;color:white;border-color:#5b9cf1}} .tab.active::after{{content:"";position:absolute;bottom:-1px;left:0;right:0;height:2px;background:#2e79dc}} .callout{{border-left:4px solid var(--warm)}} .quiet{{color:var(--muted)}} .principle{{color:var(--mint);font-weight:750}} ul{{margin:8px 0 0;padding-left:1.2rem}} @media(max-width:620px){{main{{padding:38px 17px 60px}}}}
</style>
<main>
<p class="eyebrow">Focused implementation review · 2026-09-04</p>
<h1>Give semantic tags their own local view—without moving their ownership.</h1>
<p class="lede">The normal Inputs / Outputs port row stays concise. A neighboring <strong>Tags</strong> tab opens a roomy port-by-port editor for semantic roles, rather than trying to fit a role chip beside Name, Type, Default, multiplicity, and every other port fact.</p>
<div class="tabs" aria-label="Inspector proposal"><span class="tab">Inputs</span><span class="tab">Outputs</span><span class="tab active">Tags</span></div>
<div class="chips"><span class="chip">Port-owned</span><span class="chip">Cable inherits live</span><span class="chip">Derived roles can be overridden</span><span class="chip">Derived effect semantics lock</span><span class="chip">Data stays quiet</span></div>

<h2>The UX decision</h2>
<div class="grid">
  <article><h3>One inspector surface, more room</h3><p>Keep a compact semantic cue adjacent to the visible canvas port. Put editing in a dedicated <strong>Tags</strong> tab beside the existing port views, where every input and output can be scanned, tagged, and explained without compressing the default row.</p></article>
  <article><h3>Tags belong to ports</h3><p>A tag is still a claim on the canonical input or output record—not an attribute copied onto a cable or onto a particular linked occurrence. The tab is an editing lens, not a second store.</p></article>
  <article><h3>Ordinary wire inheritance</h3><p>Cables continue to resolve their current semantic meaning from endpoints. The Tags view makes authoring legible; it does not invent a special event/error wire class or persist duplicate wire metadata.</p></article>
</div>

<h2>Browser evidence</h2>
<figure><img src="data:image/png;base64,{image}" alt="SystemSketch inspector showing the dedicated Tags tab for port semantic roles"><figcaption>Real-app smoke capture: role editing moves behind the local Tags tab, while the visible port remains a compact canvas cue. This is the implementation evidence, not a redraw.</figcaption></figure>

<h2>What remains deliberately true</h2>
<div class="grid">
  <article><h3>Authored versus derived</h3><p><code>authored → derived → implicit Data</code> remains the resolution rule. Ordinary derived role claims show their provenance and remain overrideable with an authored role. Only analyser-derived <strong>effect-port semantics</strong> are read-only, so the tab never offers a misleading edit affordance for that separate fact.</p></article>
  <article><h3>One source of truth</h3><p>Linked Definition occurrences converge through the existing canonical port records. Changing a role in this tab updates the same definition-level truth the canvas and connection inspector already read.</p></article>
  <article><h3>Semantic, not operational</h3><p>Tags add meaning such as Event, Control, Configuration, State, or ordinary Data. They do not recolor Python types, change routing, alter async/delayed styling, or turn a legal mismatch into a disconnection.</p></article>
</div>

<h2>Review gesture</h2>
<div class="callout"><strong>Pass condition:</strong> select a Block, open <strong>Tags</strong>, and assign <code>Event</code> or <code>Configuration</code> to a specific port. Return to Inputs / Outputs: its normal row stays uncluttered. Inspect the attached cable: it still reports the live endpoint role and provenance, rather than a copied role value. A normal derived role remains overrideable; an analyser-derived effect-port semantic is explained but not editable.</div>

<p class="quiet" style="margin-top:32px">This is a focused follow-up to the <a href="semantic-role-inheritance-implementation-2026-09-04.html">semantic-role inheritance gallery</a>, which establishes the port-first data model and ordinary-wire resolution that this inspector change preserves.</p>
</main></html>''',
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
