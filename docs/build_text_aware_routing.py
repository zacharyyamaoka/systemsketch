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
    assert evidence["storedStartLeg"] is None
    assert evidence["effectiveStartLeg"] == 20
    assert evidence["persistedCorners"] >= 4

    stress = json.loads((ASSETS / "collision-routing-stress-results.json").read_text())
    stress_by_number = {item["number"]: item for item in stress["results"]}
    atlas_groups = [
        ("Easy", [1, 2, 3, 4, 5]),
        ("Medium", [7, 10, 15, 20, 25]),
        ("Hard", [30, 31, 33, 35, 36]),
        ("Very hard", [38, 40, 41, 46, 50]),
    ]
    atlas_cards = []
    for difficulty, numbers in atlas_groups:
        for number in numbers:
            item = stress_by_number[number]
            assert item["status"] == "PASS"
            screenshot = image_uri(
                ASSETS / f"collision-routing-stress-{number:02d}-after.png"
            )
            atlas_cards.append(f"""
              <article class="atlas-card">
                <div class="atlas-head"><span>{esc(difficulty)} · {number:02d}</span><b>{esc(item['name'])}</b></div>
                <img alt="{esc(item['name'])} after Tidy" src="{screenshot}">
                <div class="atlas-facts"><span>{item['obstacleCount']} forbidden regions</span><span>{item['cornerCount']} corners</span><span>PASS</span></div>
              </article>""")
    assert len(atlas_cards) == 20

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
  .why-grid {{ display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px }} .why {{ padding:19px;border:1px solid var(--line);border-radius:13px;background:var(--panel2) }}
  .why b {{ display:block;margin-bottom:7px;color:var(--orange) }} .why strong {{ color:var(--green) }}
  .atlas {{ display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:20px }} .atlas-card {{ overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--panel2) }}
  .atlas-head {{ display:flex;gap:12px;align-items:baseline;padding:14px 16px }} .atlas-head span {{ flex:none;color:var(--orange);font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase }}
  .atlas-card img {{ display:block;width:100%;aspect-ratio:15/9;object-fit:cover;object-position:left top;background:#f7f7f7;border-block:1px solid var(--line) }}
  .atlas-facts {{ display:flex;gap:14px;padding:10px 16px;color:var(--muted);font-size:12px }} .atlas-facts span:last-child {{ margin-left:auto;color:var(--green);font-weight:900 }}
  .boundary {{ border-color:#66533c;background:#1e1913 }} footer {{ margin-top:25px;color:#7e8b93 }}
  @media(max-width:900px) {{ .metrics,.callouts,.pipeline,.route,ul,.why-grid,.atlas {{ grid-template-columns:1fr }} .compare-head {{ display:block }} .switch {{ margin-top:13px }} }}
</style></head><body><main>
  <div class="eyebrow">SystemSketch · implementation evidence · 03 Sep 2026</div>
  <h1>Elbows now make room for <em>the words.</em></h1>
  <p class="lede">The supplied case is now reproduced with all three boundary ports: <code>raws bytes</code>, <code>gain float</code>, and <code>poses list[Pose]</code>. Tidy leaves the source dot on a straight line, avoids painted text, then takes a four-elbow route into <code>len()</code>.</p>
  <div class="verdict"><span class="dot"></span>Own terminal text stays forbidden without the extra halo; every other label retains 4px</div>
  <div class="metrics">
    <div class="metric"><strong>0 / 4 px</strong><span>own terminal / other label halo</span></div>
    <div class="metric"><strong>{evidence['persistedCorners']}</strong><span>persisted elbows</span></div>
    <div class="metric"><strong>20</strong><span>rendered examples below</span></div>
    <div class="metric"><strong>50 / 50</strong><span>stress cases still pass</span></div>
  </div>

  <section><div class="compare-head"><div><div class="eyebrow">Real canvas</div><h2>The shorter open corridor wins</h2><p>Toggle the exact browser frames produced by the acceptance test.</p></div>
    <div class="switch"><button class="active" data-show="after">After Tidy</button><button data-show="before">Before</button></div></div>
    <div class="frame"><img id="proof" alt="SystemSketch text-aware routing proof" src="{after}" data-before="{before}" data-after="{after}"></div>
    <div class="callouts"><div class="callout"><b>1 · Straight terminal</b><p>The cable's own label uses its painted box with zero extra halo. The line can leave <code>poses</code> straight and postpones its first bend until the next Block.</p></div>
      <div class="callout"><b>2 · Open channel</b><p>Equal-bend candidates are compared by length, avoiding the old detour around the top of the frame.</p></div>
      <div class="callout"><b>3 · Multiple elbows</b><p>The H–V–H–V–H route persists as one automatic route and repaints without reversal.</p></div></div>
  </section>

  <section><div class="eyebrow">Why it hugs the upper Block</div><h2>Safety chooses the rails; length chooses one side</h2>
    <p>The placement is decided in the planner, before SVG rendering or corner rounding. In this exact fixture, <code>poses.append()</code> ends at y=300 and <code>random_func</code> begins at y=390. Their visual midpoint is y=345, but the shortest legal grid rail is the upper Block's 24px keep-out boundary at <strong>y=324</strong>.</p>
    <div class="why-grid"><div class="why"><b>Implemented ordering</b><p><strong>1.</strong> Minimize bends with A*'s bend penalty. <strong>2.</strong> Among equal-bend candidates, minimize Manhattan length. Candidate rows come from obstacle keep-out edges and endpoint/midpoint rails. The result is safe and short, but it can hug a wall.</p></div>
      <div class="why"><b>Separate possible policy</b><p>Add free-corridor center rails, then use distance balance as a tertiary score after bend count and before or alongside path length. That would move this segment toward y=345 without weakening the 24px collision guarantee. This centering policy is <strong>not silently enabled</strong> in this track.</p></div></div>
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
    <div class="stage"><i>05</i><strong>Persist</strong><small>The normal terminal leg and arbitrary corner list repaint without reversal.</small></div>
  </div></section>

  <section><div class="eyebrow">20 real-app examples · easy → hard</div><h2>See where the current objective succeeds—and where it hugs</h2>
    <p>Every card is an actual post-Tidy canvas from the deterministic 50-case browser run. The set progresses from one-Block fields to dense fields, squeezed endpoint legs, and Branch-aware routes; all were tidied twice and remained collision-free and byte-stable.</p>
    <div class="atlas">{''.join(atlas_cards)}</div>
  </section>

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
