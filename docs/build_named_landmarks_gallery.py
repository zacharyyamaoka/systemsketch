#!/usr/bin/env python3
"""Build the small visual handoff for the named-camera-landmarks track."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / "docs/assets/named-landmarks-panel-2026-09-04.png"
OUTPUT = ROOT / "docs/named-landmarks-gallery-2026-09-04.html"


def image_data(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    screenshot = image_data(SCREENSHOT)
    OUTPUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Named landmarks · SystemSketch implementation gallery</title>
<style>
  :root {{ color-scheme: dark; --bg:#10151d; --surface:#18212d; --line:#314053; --ink:#ecf2fa; --muted:#a9b7ca; --blue:#60a5fa; --green:#4ade80; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:radial-gradient(circle at 15% 0,#1e2f48,transparent 36%),var(--bg); color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ max-width:1160px; margin:auto; padding:56px 28px 80px }} h1 {{ font-size:clamp(32px,6vw,60px); letter-spacing:-.055em; line-height:1; max-width:760px; margin:0 0 16px }} h2 {{ font-size:20px; margin:0 0 12px }} p {{ color:var(--muted) }} .eyebrow {{ color:var(--blue); font-size:11px; font-weight:800; letter-spacing:.15em; text-transform:uppercase }} .lede {{ max-width:720px; font-size:19px }} .grid {{ display:grid; grid-template-columns:1.1fr .9fr; gap:18px; margin-top:30px }} .card {{ padding:22px; border:1px solid var(--line); border-radius:18px; background:color-mix(in srgb,var(--surface) 92%,transparent) }} .wide {{ grid-column:1/-1 }} ul {{ margin:0; padding-left:20px; color:var(--muted) }} li+li {{ margin-top:9px }} code {{ padding:2px 5px; border-radius:5px; background:#0c1118; color:#bfdbfe }} .shot {{ width:100%; border:1px solid var(--line); border-radius:14px; box-shadow:0 18px 48px #0007 }} .flow {{ display:grid; grid-template-columns:1fr auto 1fr auto 1fr; align-items:center; gap:10px; text-align:center; color:var(--muted) }} .flow b {{ display:block; color:var(--ink); font-size:16px }} .node {{ min-height:98px; padding:17px 12px; border:1px solid var(--line); border-radius:13px; background:#111a25 }} .node:nth-child(1) {{ border-color:#356fae }} .node:nth-child(5) {{ border-color:#34764f }} .arrow {{ color:var(--blue); font-size:26px }} a {{ color:#93c5fd }} footer {{ margin-top:34px; color:var(--muted); font-size:13px }} @media(max-width:760px) {{ .grid{{grid-template-columns:1fr}} .flow{{grid-template-columns:1fr;gap:6px}} .arrow{{transform:rotate(90deg)}} }}
</style></head><body><main>
  <div class="eyebrow">Implementation gallery · 2026-09-04 · independent review track</div>
  <h1>Named landmarks are camera bookmarks, not fake pages.</h1>
  <p class="lede">The Board overview panel now lets a person name the current camera pose, return to it later, rename it, or remove it. The bookmark belongs to the board file; it does not change selection, tools, Frames, or structural depth.</p>
  <section class="grid">
    <article class="card"><h2>Persistence contract</h2><ul><li>Each one-canvas board stores versioned landmarks in its current page metadata under <code>systemSketchLandmarks</code>.</li><li>A record contains only <code>id</code>, <code>name</code>, and camera <code>x/y/z</code>. It travels with the saved board and is autosaved through the existing workspace path.</li><li>Malformed foreign entries are ignored on read. Ordinary metadata is preserved. Duplicate names and blank names are refused.</li></ul></article>
    <article class="card"><h2>Deliberate boundary</h2><ul><li>Frames, Branches, and expanded Blocks remain the live structural overview below the saved views.</li><li>Jumping a landmark calls the supported camera API only. It deliberately leaves selection, current tool, depth scope, and board content alone.</li><li>This is a light return point akin to a Miro view — not a claim that camera poses are pages, a source navigation graph, or a hierarchy.</li></ul></article>
    <article class="card wide"><h2>One interaction, three honest states</h2><div class="flow"><div class="node"><b>Save current view</b>Name the pose while reading the board.</div><div class="arrow">→</div><div class="node"><b>Board metadata</b>Persist a compact camera bookmark with the document.</div><div class="arrow">→</div><div class="node"><b>Jump back</b>Restore camera only; retain normal canvas state.</div></div></article>
    <article class="card wide"><h2>Real browser evidence</h2><p>The actual product panel after saving <em>Runtime focus</em>. The visible row exposes jump, inline rename, and delete; the structural Board overview remains separate below it.</p><img class="shot" alt="SystemSketch Board overview with one saved Runtime focus camera landmark" src="{screenshot}"></article>
    <article class="card"><h2>Proof</h2><ul><li>5 pure model regressions: parsing, durable write, validation, rename/remove, and camera-only focus.</li><li>6 real-browser checks: save, metadata pose, non-destructive jump, file reopen, rename/delete, and console cleanliness.</li><li>The review board is a focused, editable fixture with a visible return-to-view pass condition.</li></ul></article>
    <article class="card"><h2>Review limits</h2><p>There is no thumbnail capture, shared presenter's camera, URL deep-link, scope switching, or automatic retargeting when content moves. Those are materially different products and should remain explicit future decisions.</p></article>
  </section>
  <footer>Built from <a href="../src/landmarks/boardLandmarks.ts">the board landmark model</a>, <a href="../tests/named_landmarks_smoke.mjs">the real-browser journey</a>, and <a href="../sketches/review/named-landmarks.systemsketch">the review fixture</a>.</footer>
</main></body></html>""", encoding="utf-8")


if __name__ == "__main__":
    main()
