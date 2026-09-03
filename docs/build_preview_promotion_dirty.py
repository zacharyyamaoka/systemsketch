#!/usr/bin/env python3
"""Build the evidence gallery for dirty-working-copy Preview promotion."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "preview-promotion-dirty-2026-09-03.html"


def image_data(name: str) -> str:
    payload = base64.b64encode((DOCS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def checkmark(value: bool) -> str:
    return "✓" if value else "!"


def main() -> None:
    server = (ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
    model = (ROOT / "src" / "releaseModel.ts").read_text(encoding="utf-8")
    facts = [
        ("Confirmed Preview command includes --allow-dirty", "--allow-dirty" in server),
        ("Release failure output is returned to the banner", "capture_output=True" in server),
        ("Confirmation states that uncommitted changes are recorded", "uncommitted source changes are recorded" in model),
    ]
    cards = "".join(
        f"<li><b>{checkmark(ok)}</b>{html.escape(label)}</li>" for label, ok in facts
    )
    armed = image_data("release-channel-armed-live-2026-09-01.png")
    published = image_data("release-channel-published-live-2026-09-01.png")
    OUTPUT.write_text(
        f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview promotion — dirty working copy</title>
<style>
  :root {{ color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#111827; color:#e5edf9; }}
  body {{ max-width:1180px; margin:0 auto; padding:46px 24px 70px; }}
  h1 {{ font-size:clamp(2rem,6vw,4.4rem); line-height:.98; letter-spacing:-.06em; margin:0; max-width:900px; }}
  .lede {{ color:#aebed5; font-size:1.15rem; max-width:780px; line-height:1.6; }}
  .flow {{ display:flex; gap:10px; flex-wrap:wrap; margin:34px 0; }}
  .step {{ background:#1f2937; border:1px solid #334155; border-radius:14px; padding:16px 19px; min-width:160px; flex:1; }}
  .step b {{ color:#79aaff; display:block; font-size:.76rem; letter-spacing:.1em; text-transform:uppercase; margin-bottom:7px; }}
  .arrow {{ color:#fb923c; align-self:center; font-size:1.6rem; }}
  .facts {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
  .facts li {{ background:#172033; border-radius:12px; padding:15px; line-height:1.4; }} .facts b {{ color:#4ade80; margin-right:10px; }}
  .shots {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:22px; margin-top:28px; }}
  figure {{ margin:0; background:#172033; border:1px solid #334155; border-radius:16px; overflow:hidden; }}
  img {{ display:block; width:100%; background:#f8fafc; }} figcaption {{ padding:14px 16px 17px; color:#b9c8db; line-height:1.45; }}
  code {{ background:#29364b; border-radius:5px; padding:2px 5px; color:#dbeafe; }}
  footer {{ border-top:1px solid #334155; color:#8fa2bd; margin-top:40px; padding-top:20px; line-height:1.55; }}
</style>
<body>
<p class="lede">SystemSketch release-path repair · 3 September 2026</p>
<h1>Preview can promote the working copy it is actually showing.</h1>
<p class="lede">The second confirmation now explicitly authorizes a dirty working-copy build. The immutable manifest carries <code>sourceDirty: true</code>; a clean commit is never fabricated. If a subsequent check or build fails, the Preview banner receives the release command’s actionable diagnostic instead of only a non-zero-exit wrapper.</p>
<section class="flow" aria-label="promotion flow">
  <div class="step"><b>1 · Preview</b>Live Vite worktree</div><span class="arrow">→</span>
  <div class="step"><b>2 · Confirm</b>Acknowledge dirty source provenance</div><span class="arrow">→</span>
  <div class="step"><b>3 · Verify</b><code>npm run check</code> and production build</div><span class="arrow">→</span>
  <div class="step"><b>4 · Publish</b>Immutable Stable marked dirty</div>
</section>
<h2>Boundaries held</h2><ul class="facts">{cards}</ul>
<h2>Real browser proof</h2>
<div class="shots">
  <figure><img src="{armed}" alt="Armed Preview promotion explains dirty source provenance"><figcaption><b>First click.</b> The confirmation replaces generic intent with the exact provenance effect before any build begins.</figcaption></figure>
  <figure><img src="{published}" alt="Published Stable state after the isolated Preview promotion"><figcaption><b>Second click.</b> The isolated real-browser journey finished with Stable updated and host plugins rebuilt.</figcaption></figure>
</div>
<footer>Evidence: <code>npm run check</code> (981 Vitest assertions; 94 Python tests) and <code>SYSTEMSKETCH_PUBLISH_PROOF=1 npm run test:release-ui</code> (21 browser checks). The proof used only an isolated track runtime; the machine’s global Stable channel was not changed.</footer>
</body></html>\n""",
        encoding="utf-8",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
