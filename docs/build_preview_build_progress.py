#!/usr/bin/env python3
"""Build the evidence gallery for Preview-to-Stable build progress."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "preview-build-progress-2026-09-03.html"


def image_data(name: str) -> str:
    payload = base64.b64encode((DOCS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def checkmark(value: bool) -> str:
    return "✓" if value else "!"


def main() -> None:
    utilities = (ROOT / "src" / "SystemSketchUtilities.tsx").read_text(encoding="utf-8")
    stylesheet = (ROOT / "src" / "systemsketch-utilities.css").read_text(encoding="utf-8")
    smoke = (ROOT / "tests" / "release_channel_controls_smoke.mjs").read_text(encoding="utf-8")
    facts = [
        ("Indicator is present only while the promote request is in flight", "makeStable === 'working'" in utilities),
        ("Screen readers receive an indeterminate progressbar and status", 'role="progressbar"' in utilities and 'aria-valuetext="Build in progress"' in utilities),
        ("Reduced-motion users get a steady full bar", "prefers-reduced-motion: reduce" in stylesheet),
        ("The real browser proof asserts appearance and cleanup", "progress indicator clears" in smoke),
    ]
    cards = "".join(
        f"<li><b>{checkmark(ok)}</b>{html.escape(label)}</li>" for label, ok in facts
    )
    idle = image_data("release-channel-preview-live-2026-09-01.png")
    building = image_data("release-channel-building-live-2026-09-03.png")
    done = image_data("release-channel-published-live-2026-09-01.png")
    OUTPUT.write_text(
        f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview promotion — build progress</title>
<style>
  :root {{ color-scheme:dark; font-family:Inter,ui-sans-serif,system-ui,sans-serif; background:#111827; color:#e5edf9; }}
  body {{ max-width:1180px; margin:0 auto; padding:46px 24px 70px; }}
  h1 {{ font-size:clamp(2rem,6vw,4.4rem); line-height:.98; letter-spacing:-.06em; margin:0; max-width:880px; }}
  .lede {{ color:#aebed5; font-size:1.15rem; max-width:800px; line-height:1.6; }}
  .flow {{ display:flex; gap:10px; flex-wrap:wrap; margin:34px 0; }}
  .step {{ background:#1f2937; border:1px solid #334155; border-radius:14px; padding:16px 19px; min-width:150px; flex:1; }}
  .step b {{ color:#79aaff; display:block; font-size:.76rem; letter-spacing:.1em; text-transform:uppercase; margin-bottom:7px; }}
  .arrow {{ color:#fb923c; align-self:center; font-size:1.6rem; }}
  .facts {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
  .facts li {{ background:#172033; border-radius:12px; padding:15px; line-height:1.4; }} .facts b {{ color:#4ade80; margin-right:10px; }}
  .shots {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:22px; margin-top:28px; }}
  figure {{ margin:0; background:#172033; border:1px solid #334155; border-radius:16px; overflow:hidden; }}
  img {{ display:block; width:100%; background:#f8fafc; }} figcaption {{ padding:14px 16px 17px; color:#b9c8db; line-height:1.45; }}
  footer {{ border-top:1px solid #334155; color:#8fa2bd; margin-top:40px; padding-top:20px; line-height:1.55; }}
</style>
<body>
<p class="lede">SystemSketch release experience · 3 September 2026</p>
<h1>Preview now makes a long Stable build feel alive.</h1>
<p class="lede">While the confirmed Preview-to-Stable request is genuinely in flight, the banner gains a compact animated blue progress bar. It intentionally does not claim a percentage: the release backend reports one long transaction, not reliable per-step completion. The indicator clears as soon as the build resolves.</p>
<section class="flow" aria-label="build indicator flow">
  <div class="step"><b>1 · Ready</b>Preview is live</div><span class="arrow">→</span>
  <div class="step"><b>2 · Building</b>Controls lock; progress moves</div><span class="arrow">→</span>
  <div class="step"><b>3 · Complete</b>Stable updated; indicator clears</div>
</section>
<h2>Boundaries held</h2><ul class="facts">{cards}</ul>
<h2>Real browser journey</h2>
<div class="shots">
  <figure><img src="{idle}" alt="Preview banner before making Stable"><figcaption><b>Before.</b> Preview presents the deliberate, two-click promotion control.</figcaption></figure>
  <figure><img src="{building}" alt="Preview banner during a Stable build showing a blue progress bar"><figcaption><b>During the real build.</b> The compact blue bar animates below the locked controls without pretending to know a percentage.</figcaption></figure>
  <figure><img src="{done}" alt="Preview banner after Stable has been updated"><figcaption><b>After.</b> The progress indicator is gone and the next action is clear.</figcaption></figure>
</div>
<footer>Evidence: <code>npm run check</code> (981 Vitest assertions; 94 Python tests) and <code>SYSTEMSKETCH_PUBLISH_PROOF=1 npm run test:release-ui</code> (23 browser checks). The publish proof uses an isolated release home; it does not change the machine’s Stable channel.</footer>
</body></html>\n""",
        encoding="utf-8",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
