#!/usr/bin/env python3
"""Build the self-contained soft-clearance evidence gallery."""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "tidy-soft-clearance-2026-09-03.html"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def constants() -> dict[str, str]:
    source = (ROOT / "src" / "blocks" / "elbow" / "softClearance.ts").read_text()
    values = dict(re.findall(r"\n\s*(clearance|nearMissWeight|crossingWeight):\s*([0-9.]+),", source))
    if set(values) != {"clearance", "nearMissWeight", "crossingWeight"}:
        raise RuntimeError("could not read soft-clearance defaults from the live source")
    return values


def main() -> None:
    before = image(ASSETS / "tidy-soft-clearance-before-2026-09-03.png")
    after = image(ASSETS / "tidy-soft-clearance-after-2026-09-03.png")
    evidence = json.loads((ASSETS / "tidy-soft-clearance-results-2026-09-03.json").read_text())
    policy = constants()
    checks = "".join(f"<li>{html.escape(check.removeprefix('the '))}</li>" for check in evidence["checks"])

    document = f"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tidy soft-clearance · SystemSketch</title>
<style>
  :root {{ color-scheme: dark; --bg:#0d1219; --surface:#161e28; --line:#334356; --ink:#edf3f8; --muted:#9bb0c5; --blue:#7ab7ff; --orange:#ffad66; --green:#76d69f; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:radial-gradient(circle at 20% 0,#172437 0,#0d1219 47%); color:var(--ink); font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ max-width:1260px; margin:auto; padding:48px 28px 72px }} h1 {{ font-size:clamp(2.25rem,5vw,4.8rem); line-height:.98; letter-spacing:-.055em; max-width:960px; margin:.2em 0 }} h2 {{ font-size:1.55rem; margin:0 0 .45rem }} h3 {{ margin:.1rem 0 .35rem; font-size:1rem }} p {{ color:var(--muted); margin:.3rem 0 1rem }} a {{ color:var(--blue) }} code {{ color:#d8ecff; background:#26384d; padding:.1em .35em; border-radius:5px }} .eyebrow {{ color:var(--orange); font:700 .76rem/1 ui-monospace,SFMono-Regular,monospace; letter-spacing:.13em; text-transform:uppercase }}
  .lede {{ font-size:1.17rem; max-width:860px }} section {{ margin:32px 0; padding:26px; border:1px solid var(--line); border-radius:19px; background:color-mix(in srgb,var(--surface) 88%,transparent) }}
  .metrics,.cards,.route {{ display:grid; gap:14px }} .metrics {{ grid-template-columns:repeat(4,1fr); margin-top:25px }} .metric,.card {{ border:1px solid var(--line); border-radius:13px; padding:16px; background:#111925 }} .metric strong {{ display:block; color:var(--blue); font-size:1.5rem }} .metric span {{ color:var(--muted); font-size:.85rem }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:start }} .proof {{ border:1px solid var(--line); border-radius:13px; overflow:hidden; background:#fff }} .proof img {{ width:100%; display:block }} .caption {{ padding:12px 14px; background:#111925; color:var(--muted); font-size:.9rem }}
  .cards {{ grid-template-columns:repeat(3,1fr) }} .card b {{ color:var(--orange) }} .flow {{ display:grid; grid-template-columns:repeat(5,1fr); gap:0; margin-top:14px }} .flow div {{ padding:14px 10px; border:1px solid var(--line); background:#111925; min-height:140px }} .flow div:not(:last-child)::after {{ content:'→'; float:right; color:var(--orange); font-size:1.4rem; margin:-7px -20px 0 0 }} .flow strong {{ display:block; color:var(--blue); font-size:.94rem }} .flow small {{ color:var(--muted) }}
  table {{ width:100%; border-collapse:collapse; margin-top:14px }} th,td {{ text-align:left; vertical-align:top; padding:12px; border-bottom:1px solid var(--line) }} th {{ color:var(--blue); font-size:.85rem }} .pass {{ border-left:4px solid var(--green); padding:9px 13px; background:#132820; color:#ccefdc }} ul {{ color:var(--muted) }} @media(max-width:780px) {{ .metrics,.cards,.compare,.flow {{ grid-template-columns:1fr }} .flow div:not(:last-child)::after {{ content:'↓'; float:none; display:block; margin:4px 0 -22px; text-align:center }} }}
</style><main>
<div class="eyebrow">Tidy edges · local routing policy</div><h1>Hard safety. Soft cable clearance.</h1>
<p class="lede">Tidy still never routes through Blocks, Branch regions, or painted labels. It now gives an automatic cable a local, weighted reason to leave breathing room around an earlier cable—without moving <code>add()</code> or treating another cable as an impossible wall.</p>
<div class="metrics"><div class="metric"><strong>{policy['clearance']} px</strong><span>desired soft gap</span></div><div class="metric"><strong>{policy['nearMissWeight']}</strong><span>near-miss bend-equivalents</span></div><div class="metric"><strong>{policy['crossingWeight']}</strong><span>crossing bend-equivalents</span></div><div class="metric"><strong>{evidence['beforeGap']:.1f} → {evidence['afterGap']:.1f}px</strong><span>painted frame/gain gap</span></div></div>

<section><div class="eyebrow">The supplied failure mode</div><h2>Lowering <code>add()</code> creates an ambiguous crossing; Tidy chooses room instead of moving a node</h2><p>The exact corrected port mapping is retained: <code>gain → add.in_2</code> and <code>frame → adjust.in_2</code>. Both frames are a real browser journey on a throwaway board. Node coordinates are byte-for-byte unchanged.</p><div class="compare"><figure class="proof"><img src="{before}" alt="Before Tidy, frame and gain cables cross near lowered add block"><figcaption class="caption"><b>Before</b> · legal existing routes, but the two data lines intersect.</figcaption></figure><figure class="proof"><img src="{after}" alt="After Tidy, frame and gain cables are separated"><figcaption class="caption"><b>After</b> · the later route takes a longer clear corridor; <code>add()</code> stays put.</figcaption></figure></div><p class="pass"><b>PASS WHEN</b> the frame/gain intersection is gone and the lowered <code>add()</code> Block has not moved. The replay measured <code>{str(evidence['beforeCrossing']).lower()} → {str(evidence['afterCrossing']).lower()}</code> for a strict painted-path crossing.</p></section>

<section><div class="eyebrow">Policy surface</div><h2>Every soft lever is explicit and zeroable</h2><table><thead><tr><th>Layer</th><th>Knob</th><th>Default</th><th>Meaning</th><th>Set to zero</th></tr></thead><tbody>
<tr><td>Hard</td><td>Block / Branch clearance</td><td>24 px</td><td>Structural forbidden geometry from the existing elbow router.</td><td>Not softened by this feature.</td></tr>
<tr><td>Hard</td><td>Port-label clearance</td><td>4 px; terminal label 0 px</td><td>Painted text remains non-negotiable geometry.</td><td>Not changed here.</td></tr>
<tr><td>Soft</td><td><code>clearance</code></td><td>{policy['clearance']} px</td><td>The preferred cable-to-cable gap.</td><td>Removes the near-miss radius.</td></tr>
<tr><td>Soft</td><td><code>nearMissWeight</code></td><td>{policy['nearMissWeight']}</td><td>Linear cost inside the desired gap, measured in bend-equivalents.</td><td>Allows close, non-crossing rails.</td></tr>
<tr><td>Soft</td><td><code>crossingWeight</code></td><td>{policy['crossingWeight']}</td><td>Cost for an interior perpendicular intersection, also in bend-equivalents.</td><td>Does not prefer uncrossing.</td></tr>
<tr><td>Channel cleanup</td><td><code>spacing</code></td><td>14 px</td><td>Existing parallel-rail nudge; it remains collision-guarded.</td><td>Can be passed as <code>tidyEdges(..., {{ spacing: 0 }})</code>.</td></tr>
</tbody></table><p>Callers use <code>tidyEdges(editor, {{ softClearance: {{ clearance: 0, nearMissWeight: 0, crossingWeight: 0 }} }})</code> for the exact prior hard-obstacle-only objective. The resolver preserves an explicit zero rather than falling back to a default.</p></section>

<section><div class="eyebrow">What runs on one click</div><h2>One hard route, then a local soft preference</h2><div class="flow"><div><strong>1 · Collect hard geometry</strong><small>Blocks, Branch regions, and port-label boxes are forbidden.</small></div><div><strong>2 · Establish baseline</strong><small>The existing one-edge A* keeps its obstacle and endpoint rules.</small></div><div><strong>3 · Offer soft rails</strong><small>Nearby predecessor routes donate optional guide lines, never walls.</small></div><div><strong>4 · Score candidates</strong><small>Length + bends remain; near misses and crossings add weighted bend-equivalents.</small></div><div><strong>5 · Safe nudge + persist</strong><small>Parallel channel spreading cannot undo a soft-clearance win.</small></div></div><p>The order is deterministic: hand-routed or unselected cables anchor the local solve, then selected automatic cables yield in stable page order. This is a local tie-break, not a global layout guarantee.</p></section>

<section><div class="eyebrow">Evidence</div><h2>Executable proof</h2><ul>{checks}</ul><p>Unit coverage proves a clear equivalent rail wins, shared terminals do not count as crossings, and both zero weights reproduce the legacy route. The browser proof uses the real command palette and samples the painted SVG paths, rather than inspecting only stored route models.</p></section>

<section><div class="eyebrow">Prior art, used selectively</div><h2>Borrow the objective, preserve the product boundary</h2><div class="cards"><div class="card"><b>yFiles</b><p>Its OrthogonalEdgeRouter distinguishes center/space routing and offers local crossing minimization, crossing costs, and rerouting. This change borrows the local “prefer less visual conflict” idea—not a global graph layout rewrite.</p><a href="https://docs.yworks.com/yfiles/doc/developers-guide/orthogonal_edge_router.html">OrthogonalEdgeRouter guide</a></div><div class="card"><b>ELK</b><p>The layered algorithm reorders layers and nodes to reduce crossings globally. That is valuable for Organize nodes, but it would overwrite the author’s deliberate lowered <code>add()</code> placement, so it is intentionally outside Tidy edges.</p><a href="https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html">ELK layered reference</a></div><div class="card"><b>libavoid / MSAGL lineage</b><p>Obstacle-aware routing and channel nudging are separate concerns. SystemSketch keeps that split, adds a small pure cost function, and avoids introducing an external routing engine or a new persistence model.</p><a href="https://www.adaptagrams.org/documentation/libavoid.html">libavoid documentation</a></div></div></section>

<p class="eyebrow">Built from the live tree · self-contained report · generated by <code>docs/build_tidy_soft_clearance.py</code></p></main>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
