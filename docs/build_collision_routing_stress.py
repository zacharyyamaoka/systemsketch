#!/usr/bin/env python3
"""Build the self-contained collision-routing stress-test report."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "collision-routing-stress-2026-09-02.html"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def esc(value: object) -> str:
    return html.escape(str(value))


def main() -> None:
    evidence = json.loads((ASSETS / "collision-routing-stress-results.json").read_text())
    results = evidence["results"]
    assert len(results) == 50
    assert all(item["status"] == "PASS" for item in results)

    table_rows = []
    for item in results:
        family = "branch" if item["kind"] == "branch" else (
            "dongle" if "dongle squeeze" in item["name"].lower() else "block"
        )
        table_rows.append(f"""
          <tr data-family="{family}">
            <td class="num">{item['number']:02d}</td><td>{esc(item['name'])}</td>
            <td>{item['obstacleCount']}</td><td>{item['collisionCountBefore']}</td>
            <td class="zero">{item['collisionCountAfter']}</td><td>{item['cornerCount']}</td>
            <td>{'yes' if item['changed'] else 'already clear'}</td><td class="pass">PASS</td>
          </tr>""")

    comparisons = []
    for number, title, detail in [
        (1, "Single Block · displaced target", "The first horizontal leg is blocked; Tidy selects a clear upper corridor."),
        (20, "Five-Block field", "A dense field forces a long outside corridor without moving any Block."),
        (40, "Target dongle squeeze", "The obstacle enters the normal 24px endpoint stub, so the entry leg shortens safely."),
        (46, "Branch · first arm target", "The cable may enter the intended arm but cannot cross the band, either header, or the sibling arm."),
    ]:
        before = image_uri(ASSETS / f"collision-routing-stress-{number:02d}-before.png")
        after = image_uri(ASSETS / f"collision-routing-stress-{number:02d}-after.png")
        comparisons.append(f"""
          <article class="comparison" data-state="after">
            <header><div><h3>{esc(title)}</h3><p>{esc(detail)}</p></div>
              <div class="switch"><button data-show="before">Before</button><button class="active" data-show="after">After Tidy</button></div>
            </header>
            <div class="frame"><img alt="{esc(title)} stress-test result" src="{after}" data-before="{before}" data-after="{after}"></div>
          </article>""")

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collision-aware routing · 50-case stress test</title>
<style>
  :root {{ color-scheme: dark; --bg:#0d1013; --panel:#151a1f; --panel2:#1b2228; --ink:#f6f2e8;
    --muted:#aab3b8; --line:#34414a; --blue:#70a8ff; --green:#7de09a; --orange:#ff9c54; }}
  * {{ box-sizing:border-box }} body {{ margin:0;background:radial-gradient(circle at 18% -10%,#24344a 0,transparent 35%),var(--bg);
    color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ width:min(1420px,calc(100% - 40px));margin:0 auto;padding:52px 0 80px }}
  .eyebrow {{ color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase }}
  h1 {{ max-width:980px;margin:10px 0 14px;font-size:clamp(42px,7vw,84px);line-height:.95;letter-spacing:-.055em }}
  h1 em {{ color:var(--green);font-style:normal }} .lede {{ max-width:850px;color:#cbd2d5;font-size:20px }}
  .verdict {{ display:inline-flex;gap:10px;align-items:center;margin:18px 0 34px;padding:10px 15px;border:1px solid #326244;
    border-radius:999px;background:#12261a;color:#bdf4cb;font-weight:750 }} .dot {{ width:9px;height:9px;border-radius:50%;background:var(--green) }}
  .metrics {{ display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 42px }}
  .metric,section,.comparison {{ border:1px solid var(--line);background:linear-gradient(145deg,var(--panel),#11161a);border-radius:18px }}
  .metric {{ padding:20px }} .metric strong {{ display:block;font-size:34px;line-height:1;color:var(--green) }} .metric span {{ color:var(--muted) }}
  section {{ padding:26px;margin:16px 0 }} h2 {{ margin:3px 0 8px;font-size:28px;letter-spacing:-.025em }} h3 {{ margin:0 0 4px;font-size:20px }} p {{ margin:0;color:var(--muted) }}
  .pipeline {{ display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:20px }} .stage {{ padding:16px;border:1px solid var(--line);border-radius:13px;background:var(--panel2) }}
  .stage b {{ display:block;color:var(--orange);font-size:11px;letter-spacing:.12em }} .stage strong {{ display:block;margin:6px 0 }} .stage small {{ color:var(--muted) }}
  .finding {{ display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px }} .scar {{ padding:18px;border-left:3px solid var(--orange);background:#1c1a18;border-radius:10px }}
  .gallery {{ display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px }} .comparison {{ overflow:hidden }} .comparison header {{ display:flex;justify-content:space-between;gap:18px;padding:18px }}
  .switch {{ display:flex;align-items:center;white-space:nowrap }} button {{ border:1px solid var(--line);background:#222a31;color:var(--ink);padding:8px 12px;cursor:pointer }}
  button:first-child {{ border-radius:9px 0 0 9px }} button:last-child {{ border-radius:0 9px 9px 0 }} button.active {{ background:#286fd5;border-color:#5a9cff }}
  .frame {{ aspect-ratio:15/9;background:#f7f7f7;border-top:1px solid var(--line) }} .frame img {{ width:100%;height:100%;object-fit:cover;object-position:left top }}
  .filters {{ display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 14px }} .filters button {{ border-radius:999px }} .filters button.active {{ background:#286fd5;border-color:#5a9cff }}
  .table-wrap {{ overflow:auto;border:1px solid var(--line);border-radius:13px }} table {{ width:100%;border-collapse:collapse;min-width:900px }}
  th,td {{ padding:10px 12px;text-align:left;border-bottom:1px solid #2a343b }} th {{ position:sticky;top:0;background:#20282f;color:#bfc8cd;font-size:12px;text-transform:uppercase;letter-spacing:.07em }}
  td.num {{ color:var(--muted);font-variant-numeric:tabular-nums }} td.zero,td.pass {{ color:var(--green);font-weight:800 }} tr[hidden] {{ display:none }}
  .boundary {{ border-color:#62533b;background:#1d1913 }} code {{ color:#b9d4ff }} footer {{ margin-top:26px;color:#77838a }}
  @media(max-width:900px) {{ .metrics,.pipeline,.gallery,.finding {{ grid-template-columns:1fr }} .comparison header {{ display:block }} .switch {{ margin-top:12px }} }}
</style></head><body><main>
  <div class="eyebrow">SystemSketch · deterministic stress test · 02 Sep 2026</div>
  <h1>Fifty routes. <em>Zero forbidden crossings.</em></h1>
  <p class="lede">The command was driven twice in the real application for every scene. Painted SVG paths were sampled at 801 points, all fixed shapes were compared before and after, and the second Tidy had to be byte-for-byte idempotent.</p>
  <div class="verdict"><span class="dot"></span>50 / 50 rendered scenarios pass on the unmerged stress-test branch</div>
  <div class="metrics">
    <div class="metric"><strong>50</strong><span>real-app scenes</span></div><div class="metric"><strong>50</strong><span>pure planner geometries</span></div>
    <div class="metric"><strong>0</strong><span>post-Tidy collisions</span></div><div class="metric"><strong>100%</strong><span>second-run stability</span></div>
  </div>

  <section><div class="eyebrow">Separation of concerns</div><h2>Each behavior still fails independently</h2>
    <p>The broad rendered sweep complements—not replaces—the narrow unit suites.</p>
    <div class="pipeline">
      <div class="stage"><b>01</b><strong>Collect obstacles</strong><small>Blocks and Branch semantics only.</small></div>
      <div class="stage"><b>02</b><strong>Plan one route</strong><small>Pure deterministic A*.</small></div>
      <div class="stage"><b>03</b><strong>Stabilize</strong><small>Keep a valid prior corridor.</small></div>
      <div class="stage"><b>04</b><strong>Nudge bundles</strong><small>Separate channels without re-collision.</small></div>
      <div class="stage"><b>05</b><strong>Apply command</strong><small>Ownership, selection, one undo.</small></div>
    </div>
  </section>

  <section><div class="eyebrow">Stress-test findings</div><h2>Two root causes were exposed and fixed locally</h2>
    <div class="finding">
      <div class="scar"><h3>Padding was checked too late</h3><p>A route running on an obstacle's raw boundary could be accepted even though it entered the required 24px keep-out. Candidate acceptance now checks the inflated bounds.</p></div>
      <div class="scar"><h3>A nearby Block could swallow a dongle</h3><p>When an obstacle occupied the normal endpoint stub, the router dropped that obstacle. It now shortens the dongle to the obstacle boundary while preventing any later re-entry into the actual endpoint card.</p></div>
    </div>
  </section>

  <section><div class="eyebrow">Painted evidence</div><h2>Representative before / after scenes</h2>
    <p>These frames come from the same assertions that produced the ledger below.</p><div class="gallery">{''.join(comparisons)}</div>
  </section>

  <section><div class="eyebrow">Complete ledger</div><h2>Every scenario is named and inspectable</h2>
    <div class="filters"><button class="active" data-filter="all">All 50</button><button data-filter="block">Block fields</button><button data-filter="dongle">Endpoint squeezes</button><button data-filter="branch">Branch arms</button></div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Scenario</th><th>Forbidden regions</th><th>Before hits</th><th>After hits</th><th>Corners</th><th>Route write</th><th>Status</th></tr></thead>
      <tbody>{''.join(table_rows)}</tbody></table></div>
  </section>

  <section class="boundary"><div class="eyebrow">Review boundary</div><h2>Nothing here has been merged.</h2>
    <p>The stress harness, regression fixes, evidence, and report remain on <code>track/collision-routing-stress</code>. The current <code>main</code> integration is unchanged until Zach explicitly asks to merge.</p>
  </section>
  <footer>Generated by <code>docs/build_collision_routing_stress.py</code>. Executable tests and product code remain the living specification.</footer>
</main><script>
  for (const card of document.querySelectorAll('.comparison')) {{
    for (const button of card.querySelectorAll('[data-show]')) button.addEventListener('click', () => {{
      const state = button.dataset.show; card.dataset.state = state
      card.querySelector('img').src = card.querySelector('img').dataset[state]
      for (const peer of card.querySelectorAll('[data-show]')) peer.classList.toggle('active', peer === button)
    }})
  }}
  for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {{
    const filter = button.dataset.filter
    for (const peer of document.querySelectorAll('[data-filter]')) peer.classList.toggle('active', peer === button)
    for (const row of document.querySelectorAll('tbody tr')) row.hidden = filter !== 'all' && row.dataset.family !== filter
  }})
</script></body></html>"""
    OUTPUT.write_text(document)
    print(OUTPUT)


if __name__ == "__main__":
    main()
