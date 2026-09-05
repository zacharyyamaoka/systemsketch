#!/usr/bin/env python3
"""Build the self-contained board-wide semantic-tag visibility gallery."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "docs/assets/semantic-tag-visibility-smoke-2026-09-04.png"
OUT = ROOT / "docs/semantic-tag-visibility-2026-09-04.html"


def main() -> None:
    if not PNG.exists():
        raise SystemExit(f"Capture required before build: {PNG}")
    image = base64.b64encode(PNG.read_bytes()).decode("ascii")
    OUT.write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Semantic tag visibility · SystemSketch</title><style>
:root{{color-scheme:dark;--ink:#eff5fb;--muted:#aab7c8;--line:#334257;--panel:#17212e;--accent:#72adff;--mint:#6de3b2;--canvas:#0d141e}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 88% -8%,#1b3358 0,transparent 32rem),var(--canvas);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{max-width:1240px;margin:auto;padding:56px 28px 84px}}h1{{max-width:930px;margin:0 0 18px;font-size:clamp(2.25rem,5.5vw,4.7rem);line-height:1.02;letter-spacing:-.045em}}h2{{margin:48px 0 15px;font-size:1.55rem}}p{{margin:0 0 13px}}.eyebrow{{color:var(--mint);font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}}.lede{{max-width:850px;color:var(--muted);font-size:1.22rem}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}}article,.callout{{padding:20px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(145deg,#1b2838,#141d29)}}h3{{margin:0 0 8px;color:var(--accent);font-size:1.02rem}}figure{{margin:25px 0;padding:12px;border:1px solid var(--line);border-radius:18px;background:#edf3fa;box-shadow:0 22px 70px #0005}}img{{display:block;width:100%;border-radius:10px}}figcaption{{padding:11px 5px 2px;color:#26364a;font-size:.92rem}}code{{color:#d3e6ff;font:600 .9em ui-monospace,monospace}}.callout{{border-left:4px solid var(--mint)}}@media(max-width:620px){{main{{padding:38px 17px 60px}}}}</style><main>
<p class="eyebrow">Focused implementation review · 2026-09-04</p><h1>Let semantic tags help the canvas—only when the reader wants them.</h1>
<p class="lede">The Tags tab remains the spacious place to edit role metadata. Its board-wide canvas control decides whether non-Data role cues appear on ports and inherited wire pills, without changing the underlying claims.</p>
<h2>Browser evidence</h2><figure><img src="data:image/png;base64,{image}" alt="Real SystemSketch Tags tab with canvas visibility control, semantic port cue, and inherited wire label"><figcaption>Real-app smoke capture after restoring visibility: the Tags editor says Visible, the Event port is labelled, and the Event → Control wire carries the live inherited reading.</figcaption></figure>
<h2>What the toggle means</h2><div class="grid"><article><h3>One board lens</h3><p><code>document.meta.systemsketch:semanticTagsVisible</code> persists with the board, defaulting to visible when absent so old boards retain their existing port cues.</p></article><article><h3>Presentation only</h3><p>Hidden removes semantic styling and labels from Block and Branch ports plus non-Data wire pills. It does not erase authored or derived port claims.</p></article><article><h3>Still inspectable</h3><p>The Tags editor and Connection inspector remain authoritative and readable while the canvas is quiet. Data remains unlabelled in either mode.</p></article></div>
<h2>Verified journey</h2><div class="callout">The browser test opens Tags, confirms the default visible state and inherited wire label, hides every canvas cue, confirms the Connection inspector still reports <code>Event → Control</code>, reloads to prove persistence, then restores visible presentation for this capture.</div></main></html>''', encoding="utf-8")


if __name__ == "__main__":
    main()
