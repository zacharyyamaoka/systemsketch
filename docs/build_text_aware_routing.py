#!/usr/bin/env python3
"""Build the self-contained text-aware multi-elbow routing gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "text-aware-routing-2026-09-03.html"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def esc(value: object) -> str:
    return html.escape(str(value))


def main() -> None:
    evidence = json.loads((ASSETS / "text-aware-routing-results-2026-09-03.json").read_text())
    assert len(evidence["checks"]) == 8
    assert evidence["startLeg"] == 8
    assert evidence["persistedCorners"] >= 4

    before = image_uri(ASSETS / "text-aware-routing-before-2026-09-03.png")
    after = image_uri(ASSETS / "text-aware-routing-after-2026-09-03.png")
    checks = "".join(f"<li><span>✓</span>{esc(check)}</li>" for check in evidence["checks"])

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Text-aware multi-elbow routing · SystemSketch</title>
<style>
  :root {{ color-scheme:dark;--bg:#0c1014;--panel:#151b21;--panel2:#1b232b;--line:#33414c;
    --ink:#f7f3e9;--muted:#adb8c0;--blue:#76aaff;--orange:#ff9d55;--green:#7de29b }}
  * {{ box-sizing:border-box }} body {{ margin:0;background:radial-gradient(circle at 24% -8%,#20395a 0,transparent 38%),var(--bg);
    color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ width:min(1540px,calc(100% - 38px));margin:auto;padding:52px 0 82px }}
  .eyebrow {{ color:var(--blue);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase }}
  h1 {{ max-width:1050px;margin:9px 0 16px;font-size:clamp(44px,7vw,88px);line-height:.94;letter-spacing:-.055em }}
  h1 em {{ color:var(--green);font-style:normal }} .lede {{ max-width:940px;margin:0;color:#ccd4d9;font-size:20px }}
  .verdict {{ display:inline-flex;gap:10px;align-items:center;margin:22px 0 36px;padding:10px 16px;border:1px solid #326345;
    border-radius:999px;background:#11271a;color:#bff4cc;font-weight:800 }} .dot {{ width:9px;height:9px;border-radius:50%;background:var(--green) }}
  .metrics {{ display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px }}
  .metric,section {{ border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,var(--panel),#11161b) }}
  .metric {{ padding:20px }} .metric strong {{ display:block;color:var(--green);font-size:36px;line-height:1 }} .metric span {{ color:var(--muted) }}
  section {{ margin:16px 0;padding:26px }} h2 {{ margin:4px 0 8px;font-size:29px;letter-spacing:-.025em }} p {{ margin:0;color:var(--muted) }}
  .compare-head {{ display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:18px }}
  .switch {{ display:flex;white-space:nowrap }} button {{ border:1px solid var(--line);padding:9px 13px;background:#222b33;color:var(--ink);cursor:pointer }}
  button:first-child {{ border-radius:9px 0 0 9px }} button:last-child {{ border-radius:0 9px 9px 0 }} button.active {{ background:#286ed2;border-color:#72aaff }}
  .frame {{ overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#f7f7f7 }} .frame img {{ display:block;width:100%;height:auto }}
  .callouts {{ display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px }} .callout {{ padding:17px;border:1px solid var(--line);border-radius:13px;background:var(--panel2) }}
  .callout b {{ display:block;margin-bottom:5px;color:var(--orange) }}
  .pipeline {{ display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:19px }} .stage {{ min-height:136px;padding:16px;border:1px solid var(--line);border-radius:13px;background:var(--panel2) }}
  .stage i {{ display:block;color:var(--orange);font-style:normal;font-size:11px;font-weight:900;letter-spacing:.12em }} .stage strong {{ display:block;margin:7px 0 }} .stage small {{ color:var(--muted) }}
  .route {{ display:grid;grid-template-columns:1fr 1.1fr;gap:20px;align-items:center }} .route svg {{ width:100%;height:auto;border:1px solid var(--line);border-radius:13px;background:#10161b }}
  code {{ color:#bcd6ff }} ul {{ display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;padding:0;margin:18px 0 0;list-style:none }} li {{ color:#d7dee2 }} li span {{ margin-right:9px;color:var(--green);font-weight:900 }}
  .boundary {{ border-color:#66533c;background:#1e1913 }} footer {{ margin-top:25px;color:#7e8b93 }}
  @media(max-width:900px) {{ .metrics,.callouts,.pipeline,.route,ul {{ grid-template-columns:1fr }} .compare-head {{ display:block }} .switch {{ margin-top:13px }} }}
</style></head><body><main>
  <div class="eyebrow">SystemSketch · implementation evidence · 03 Sep 2026</div>
  <h1>Elbows now make room for <em>the words.</em></h1>
  <p class="lede">Tidy edges treats painted port names, types, and default chips as first-class keep-outs. In the supplied shape, the route makes a tiny escape beside <code>poses list[Pose]</code>, takes the short channel between Blocks, and rises into <code>len()</code> with four elbows.</p>
  <div class="verdict"><span class="dot"></span>Rendered path clears every glyph halo and every Block; the track remains unmerged</div>
  <div class="metrics">
    <div class="metric"><strong>4 px</strong><span>port-text clearance</span></div>
    <div class="metric"><strong>{evidence['persistedCorners']}</strong><span>persisted elbows</span></div>
    <div class="metric"><strong>50 / 50</strong><span>prior stress cases still pass</span></div>
    <div class="metric"><strong>0</strong><span>painted collisions after Tidy</span></div>
  </div>

  <section><div class="compare-head"><div><div class="eyebrow">Real canvas</div><h2>The shorter open corridor wins</h2><p>Toggle the exact browser frames produced by the acceptance test.</p></div>
    <div class="switch"><button class="active" data-show="after">After Tidy</button><button data-show="before">Before</button></div></div>
    <div class="frame"><img id="proof" alt="SystemSketch text-aware routing proof" src="{after}" data-before="{before}" data-after="{after}"></div>
    <div class="callouts"><div class="callout"><b>1 · Text escape</b><p>The first leg is shortened to 8px, so the turn happens before the port words and their 4px halo.</p></div>
      <div class="callout"><b>2 · Open channel</b><p>Equal-bend candidates are compared by length, avoiding the old detour around the top of the frame.</p></div>
      <div class="callout"><b>3 · Multiple elbows</b><p>The H–V–H–V–H route persists as one automatic route and repaints without reversal.</p></div></div>
  </section>

  <section><div class="route"><div><div class="eyebrow">Route grammar</div><h2>Five segments, four bends</h2><p>The shape is not a special case. The existing non-uniform-grid A* already supports arbitrary orthogonal paths; this change supplies accurate text keep-outs and chooses the shorter candidate when bend count ties.</p></div>
    <svg viewBox="0 0 720 240" role="img" aria-label="H V H V H route diagram"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L9 3L0 6Z" fill="#76aaff"/></marker></defs>
      <rect x="18" y="86" width="180" height="38" rx="8" fill="#27313a" stroke="#52616c"/><text x="34" y="112" fill="#f7f3e9" font-family="monospace" font-size="18">poses list[Pose]</text>
      <rect x="270" y="45" width="220" height="105" rx="12" fill="#202830" stroke="#52616c"/><text x="292" y="80" fill="#f7f3e9" font-family="monospace" font-size="22">poses.append()</text>
      <path d="M18 134H220V178H550V76H690" fill="none" stroke="#76aaff" stroke-width="5" stroke-linejoin="round" marker-end="url(#arrow)"/>
      <g fill="#ff9d55" font-family="ui-monospace,monospace" font-size="14"><text x="95" y="155">H</text><text x="228" y="160">V</text><text x="376" y="199">H</text><text x="558" y="135">V</text><text x="618" y="65">H</text></g>
    </svg></div>
  </section>

  <section><div class="eyebrow">Separation stays explicit</div><h2>Each behavior remains independently testable</h2><div class="pipeline">
    <div class="stage"><i>01</i><strong>Measure labels</strong><small><code>layoutBlock</code> supplies deterministic content rectangles—no DOM dependency.</small></div>
    <div class="stage"><i>02</i><strong>Collect obstacles</strong><small>Structural and text collectors remain separate and return page-space geometry.</small></div>
    <div class="stage"><i>03</i><strong>Plan + choose</strong><small>A* finds both regimes; bend count then path length select the route.</small></div>
    <div class="stage"><i>04</i><strong>Stabilize + nudge</strong><small>Existing independent guards reject any collision reintroduced later.</small></div>
    <div class="stage"><i>05</i><strong>Persist</strong><small>Short terminal legs are stored so repaint cannot double back through a label.</small></div>
  </div></section>

  <section><div class="eyebrow">Executable evidence</div><h2>Browser and unit oracles agree</h2><ul>{checks}</ul></section>
  <section class="boundary"><div class="eyebrow">Review boundary</div><h2>New worktree; no merge.</h2><p>Implementation and evidence are on <code>track/text-aware-routing</code>, based on <code>main@cf86800</code>. Main remains unchanged until Zach explicitly asks to merge.</p></section>
  <footer>Generated by <code>docs/build_text_aware_routing.py</code>. Product code and ordinary regression tests remain the living specification.</footer>
</main><script>
  const image = document.querySelector('#proof')
  for (const button of document.querySelectorAll('[data-show]')) button.addEventListener('click', () => {{
    image.src = image.dataset[button.dataset.show]
    for (const peer of document.querySelectorAll('[data-show]')) peer.classList.toggle('active', peer === button)
  }})
</script></body></html>"""
    OUTPUT.write_text(document)
    print(OUTPUT)


if __name__ == "__main__":
    main()
