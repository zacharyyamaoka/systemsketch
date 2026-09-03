#!/usr/bin/env python3
"""Build the self-contained Delete frame, leave children evidence gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "remove-frame-keep-contents-2026-09-02.html"
RESULTS = ROOT / "docs" / "assets" / "remove-frame-keep-contents-results.json"
AFTER = ROOT / "docs" / "assets" / "remove-frame-keep-contents-2026-09-02.png"
FIXTURE = ROOT / "sketches" / "review" / "remove-frame-keep-contents.png"
COMMAND = ROOT / "src" / "frames" / "removeFrame.ts"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source_excerpt() -> str:
    lines = COMMAND.read_text(encoding="utf-8").splitlines()
    start = next(index for index, line in enumerate(lines) if "export function removeFrameKeepContents" in line)
    return "\n".join(
        f"{number + 1:>4}  {line}" if line else ""
        for number, line in enumerate(lines[start:start + 22], start)
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
<title>Delete frame, leave children · SystemSketch</title>
<style>
:root{{--paper:#f4f1ea;--ink:#242320;--muted:#6d6961;--line:#d6d0c5;--blue:#2f7fe7;--green:#18794e;--orange:#ed8a31;--card:#fff}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1200px,calc(100% - 40px));margin:auto;padding:64px 0 100px}}h1{{max-width:980px;margin:8px 0 0;font-size:clamp(44px,7vw,82px);line-height:.96;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:800 12px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}.lede{{max-width:850px;margin:26px 0 42px;color:#44413c;font-size:21px}}
.hero,.rules,.shots{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}.card,.shot{{overflow:hidden;border:1px solid var(--line);border-radius:19px;background:var(--card);box-shadow:0 14px 35px #29251e0a}}
.card{{padding:25px}}.card h2,.card h3{{margin:4px 0 10px;letter-spacing:-.03em}}.command{{font-size:35px;font-weight:830;letter-spacing:-.04em}}.muted{{color:var(--muted)}}
.flow{{display:flex;align-items:center;gap:9px;margin-top:18px;flex-wrap:wrap}}.chip{{padding:8px 11px;border-radius:9px;background:#edf4fe;color:#185cae;font-weight:760}}.arrow{{color:#9c978e;font-size:22px}}
.invariant{{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-top:1px solid #ece8df}}.invariant b{{color:var(--green)}}section{{margin-top:55px}}section>h2{{font-size:31px;letter-spacing:-.035em}}
figure{{margin:0}}.shot img{{display:block;width:100%;height:auto}}figcaption{{padding:14px 18px;color:var(--muted);font-size:14px}}ul{{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;padding:0;list-style:none}}li{{display:flex;gap:9px}}li span{{color:var(--green);font-weight:900}}
pre{{overflow:auto;padding:22px;border-radius:16px;background:#20242b;color:#e9edf2;font:13px/1.55 ui-monospace,monospace}}code{{font-family:ui-monospace,monospace}}.meta{{margin-top:55px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}a{{color:#1e63b6}}@media(max-width:800px){{.hero,.rules,.shots,ul{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · interaction evidence · 2026-09-02</div>
<h1>Remove the boundary.<br>Keep the system.</h1>
<p class="lede">A stock Frame now has a dedicated right-click command that removes only the boundary. Its contents keep their exact page positions, nested Frames remain nested, and one Undo restores the whole containment relationship.</p>
<div class="hero">
  <article class="card"><div class="eyebrow">Right-click command</div><div class="command">Delete frame, leave children</div><p>Visible only for one selected, unlocked stock Frame. Its label states the preservation rule directly and distinguishes it from stock destructive Delete.</p></article>
  <article class="card"><div class="eyebrow">One transaction</div><div class="flow"><span class="chip">lift children</span><span class="arrow">→</span><span class="chip">delete empty frame</span><span class="arrow">→</span><span class="chip">select survivors</span></div><p>tldraw’s supported reparent primitive preserves page-space geometry and keeps nested subtrees intact.</p></article>
</div>
<section><h2>The invariant is visible</h2><div class="rules">
  <article class="card"><h3>Removed</h3><div class="invariant"><span>Selected outer Frame</span><b>gone</b></div><div class="invariant"><span>Its containment edge</span><b>gone</b></div></article>
  <article class="card"><h3>Preserved</h3><div class="invariant"><span>Direct contents</span><b>same pixels</b></div><div class="invariant"><span>Nested descendants</span><b>same parents</b></div><div class="invariant"><span>Undo</span><b>one step</b></div></article>
</div></section>
<section><h2>Before and after in the real editor</h2><div class="shots">
  <figure class="shot"><img src="{image_uri(FIXTURE)}" alt="Outer review Frame containing a Block and nested Frame"><figcaption>Before: <code>api()</code> and <code>Nested boundary</code> are direct children of the outer Frame; <code>job()</code> belongs to the nested Frame.</figcaption></figure>
  <figure class="shot"><img src="{image_uri(AFTER)}" alt="Outer Frame removed while its Block and nested Frame remain"><figcaption>After: only the outer boundary is gone. Both surviving subjects remain exactly positioned, including the inner Frame hierarchy.</figcaption></figure>
</div></section>
<section><h2>{passing}/{len(checks)} physical browser checks pass</h2><article class="card"><ul>{check_list}</ul></article></section>
<section><h2>The supported frame-removal seam</h2><pre>{html.escape(source_excerpt())}</pre></section>
<p class="meta">Built from the live source tree. The review board is <a href="../sketches/review/remove-frame-keep-contents.systemsketch">remove-frame-keep-contents.systemsketch</a>.</p>
</main></body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"Built {OUT}")


if __name__ == "__main__":
    main()
