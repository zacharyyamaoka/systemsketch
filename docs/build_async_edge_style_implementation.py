#!/usr/bin/env python3
"""Build the self-contained implementation gallery for the V1 async edge."""

from __future__ import annotations

import base64
import html
import json
import re
import struct
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "async-edge-style-implementation-2026-09-02.html"
ACCEPTANCE = ROOT / "docs" / "assets" / "async-edge-style-acceptance.json"
SOURCE = ROOT / "src" / "blocks" / "connections" / "connectionPresentation.ts"
SMOKE = ROOT / "tests" / "async_edge_style_smoke.mjs"
IMAGES = {
    "selector": ROOT / "docs" / "assets" / "async-edge-style-selector.png",
    "short": ROOT / "docs" / "assets" / "async-edge-style-acceptance.png",
    "dense": ROOT / "sketches" / "review" / "async-edge-style.png",
}


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def png_data(path: Path) -> tuple[str, int, int]:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"not a PNG: {path}")
    width, height = struct.unpack(">II", raw[16:24])
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii"), width, height


def main() -> None:
    required = [ACCEPTANCE, SOURCE, SMOKE, *IMAGES.values()]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("missing report inputs: " + ", ".join(missing))

    newest_source = max(SOURCE.stat().st_mtime, SMOKE.stat().st_mtime)
    if ACCEPTANCE.stat().st_mtime < newest_source:
        raise SystemExit("focused browser evidence is stale; rerun npm run test:async-edge-style")

    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"ASYNC_PACKET_DASHARRAY = `\$\{ASYNC_CARRIER_PX\} \$\{ASYNC_PACKET_GAP_PX\} \$\{ASYNC_PACKET_PX\} \$\{ASYNC_PACKET_GAP_PX\}`", source)
    if not match:
        raise SystemExit("async cadence source no longer matches the documented V1 composition")

    results = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
    passed = sum(bool(item.get("ok")) for item in results)
    if passed != len(results):
        raise SystemExit(f"focused journey is not green: {passed}/{len(results)}")

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    head = git("rev-parse", "--short", "HEAD")
    branch = git("branch", "--show-current") or "detached"
    encoded = {name: png_data(path) for name, path in IMAGES.items()}
    checks = "".join(
        f'<li><span>{html.escape(item["id"])}</span><b>{html.escape(item["label"])}</b><i>PASS</i></li>'
        for item in results
    )

    page = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Async edge type · V1 implementation</title>
<style>
:root{--ink:#172033;--muted:#667085;--line:#d7deea;--paper:#f4f7fb;--card:#fff;--blue:#2563eb;--blue2:#dbeafe;--green:#087a55;--orange:#f59e0b;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 82% -10%,#dbeafe 0,transparent 38%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:54px 0 80px}.eyebrow{font:700 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}h1{max-width:820px;margin:15px 0 12px;font-size:clamp(42px,7vw,76px);line-height:.94;letter-spacing:-.055em}h1 em{color:var(--blue);font-style:normal}.lede{max-width:780px;color:#465268;font-size:19px}.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:22px;align-items:end}.cadence{padding:22px;border:1px solid var(--line);border-radius:18px;background:#101827;color:#fff;box-shadow:0 16px 42px #25314918}.cadence svg{width:100%;height:auto}.cadence path{fill:none;stroke:#e8eefb;stroke-width:3;stroke-linecap:butt;stroke-dasharray:56 4 10 4}.cadence code{font-family:var(--mono);color:#93c5fd}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:28px 0}.stat,.card{background:color-mix(in srgb,var(--card) 94%,transparent);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #2531490b}.stat{padding:16px}.stat b{display:block;font:750 26px/1 var(--mono)}.stat span{color:var(--muted);font-size:12px}.section{margin-top:54px}.section h2{font-size:30px;letter-spacing:-.025em;margin:0 0 8px}.section>p{max-width:820px;color:var(--muted);margin:0 0 20px}.switcher{display:flex;gap:8px;margin:18px 0}.switcher button{border:1px solid var(--line);border-radius:999px;background:#fff;padding:8px 13px;color:var(--ink);cursor:pointer}.switcher button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}.frame{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 16px 44px #25314914}.frame img{display:block;width:100%;height:auto}.frame figcaption{padding:13px 16px;border-top:1px solid var(--line);color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{padding:20px}.card h3{margin:0 0 8px}.card p{color:var(--muted);margin:0}.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:20px}.flow div{position:relative;padding:16px 12px;min-height:100px;border:1px solid var(--line);border-radius:13px;background:#fff}.flow div:not(:last-child):after{content:'→';position:absolute;right:-14px;top:37px;z-index:2;color:var(--blue);font-size:20px}.flow b{display:block}.flow span{color:var(--muted);font-size:12px}.checks{list-style:none;padding:0;margin:18px 0 0}.checks li{display:grid;grid-template-columns:56px 1fr auto;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:center}.checks span{font:700 12px var(--mono);color:var(--blue)}.checks i{font:700 11px var(--mono);color:var(--green)}.ai{margin-top:48px;padding:18px 20px;border-left:4px solid var(--blue);background:var(--blue2);border-radius:0 12px 12px 0}.links a{color:var(--blue);font-weight:650;text-decoration:none}.links a:hover{text-decoration:underline}footer{margin-top:34px;color:var(--muted);font:12px var(--mono)}@media(max-width:800px){.hero,.grid{grid-template-columns:1fr}.flow{grid-template-columns:1fr}.flow div:not(:last-child):after{content:'↓';right:auto;left:20px;top:auto;bottom:-19px}.stats{grid-template-columns:1fr 1fr}main{width:min(100% - 24px,1180px)}}
</style></head><body><main>
<div class="hero"><header><div class="eyebrow">SystemSketch · shipped implementation · 2 Sep 2026</div><h1>Async is now an <em>edge type.</em></h1><p class="lede">V1’s mostly-continuous packet cadence is live on real SystemSketch connections: selected from the inspector or context menu, saved with the board, and rendered identically in SVG export.</p></header><div class="cadence"><svg viewBox="0 0 420 70" aria-label="V1 async cadence"><path d="M12 35H408"/></svg><code>56 carrier · 4 gap · 10 packet · 4 gap</code></div></div>
<div class="stats"><div class="stat"><b>56 4 10 4</b><span>unchanged V1 cadence</span></div><div class="stat"><b>89.2%</b><span>painted carrier</span></div><div class="stat"><b>__PASSED__/__TOTAL__</b><span>focused browser checks</span></div><div class="stat"><b>3</b><span>Data · Async · Delayed</span></div><div class="stat"><b>35</b><span>phase on a 60-unit short run</span></div><div class="stat"><b>5 + 3</b><span>async + data cables in review</span></div></div>

<section class="section"><h2>The selector is semantic</h2><p>“Temporal” became “Edge type.” Async is not a generic tldraw dash preset: it is the app-owned connection style beside Data and Delayed (z⁻¹), so multi-selection, history, context-menu state, validation, and persistence all share one supported tldraw seam.</p><figure class="frame"><img src="__SELECTOR__" width="__SELECTOR_W__" height="__SELECTOR_H__" alt="Real browser showing Data, Async, and Delayed edge type buttons"><figcaption>Real inspector state after choosing Async. The Delayed pill controls remain exclusive to Delayed.</figcaption></figure></section>

<section class="section"><h2>Short runs still say “async”</h2><p>At 74 units and above, V1 starts at phase zero exactly as selected. Below one full cadence, only the phase changes: one complete 4–10–4 packet mark is centered, avoiding a cable that accidentally reads as solid. The dash array remains identical.</p><div class="grid"><figure class="frame"><img src="__SHORT__" width="__SHORT_W__" height="__SHORT_H__" alt="Deselected 60-unit async cable with a centered packet mark"><figcaption>60-unit real cable: a complete micro-gap / packet / micro-gap mark remains visible.</figcaption></figure><div class="card"><h3>One rule, one short-run safeguard</h3><p><code>offset = 0</code> for normal runs. For shorter runs, the 18-unit packet mark is centered. Butt caps preserve both 4-unit gaps; round caps would visually close them.</p><svg viewBox="0 0 420 120" style="width:100%;margin-top:20px"><text x="10" y="22" fill="#667085" font-family="ui-monospace" font-size="12">60 UNIT RUN · OFFSET 35</text><path d="M20 65H400" stroke="#d7deea" stroke-width="5"/><path d="M20 65H400" fill="none" stroke="#172033" stroke-width="3" stroke-linecap="butt" stroke-dasharray="56 4 10 4" stroke-dashoffset="35"/><circle cx="20" cy="65" r="7" fill="#fff" stroke="#f59e0b"/><circle cx="400" cy="65" r="7" fill="#fff" stroke="#f59e0b"/></svg></div></div></section>

<section class="section"><h2>Judged in a real cable field</h2><p>The review board carries four pre-seeded async cables, three data cables, crossings, long diagonals, elbows, a curve, and an opposing return. The short target becomes async cable five through the new selector.</p><div class="switcher" role="group" aria-label="Evidence frame"><button aria-pressed="true" data-frame="dense">Dense board</button><button aria-pressed="false" data-frame="selector">Selector</button><button aria-pressed="false" data-frame="short">Short run</button></div><figure class="frame"><img id="evidence" src="__DENSE__" width="__DENSE_W__" height="__DENSE_H__" alt="Async review board with crossing and overlapping data cables"><figcaption id="caption">The generated .systemsketch fixture: long, short, crossing, elbow, curved, and opposing-direction routes.</figcaption></figure></section>

<section class="section"><h2>Happy-path implementation</h2><div class="flow"><div><b>Edge type UI</b><span>Inspector and right-click submenu</span></div><div><b>StyleProp</b><span><code>data | async | delayed</code></span></div><div><b>Style command</b><span>One batch write and history mark</span></div><div><b>ShapeUtil path</b><span>Canvas and <code>toSvg</code> share paint</span></div><div><b>Board storage</b><span>Ordinary autosave and reload</span></div></div><ul class="checks">__CHECKS__</ul></section>

<section class="section grid"><div class="card"><h3>Boundary kept</h3><p>tldraw remains pinned at <code>__TLDRAW__</code>. The implementation uses its supported style, ShapeUtil, component, export, menu, and editor-command seams; no engine fork and no parallel line primitive.</p></div><div class="card links"><h3>Review it</h3><p><a href="../sketches/review/async-edge-style.systemsketch">Review fixture</a> · <a href="../sketches/review/async-edge-style.png">Fixture PNG</a> · <a href="build_async_edge_style_implementation.py">Reproducible builder</a> · <a href="http://127.0.0.1:4410/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Fasync-edge-style.systemsketch">Open live review board</a></p></div></section>

<div class="ai"><b>AI comment · 2 Sep 2026.</b> Implemented Zach’s chosen V1 as the Async value in the semantic Edge type selector. The normal cadence is exactly <code>56 4 10 4</code>; sub-cadence runs center one complete packet mark. Verified the real inspector and context menu, live paint, SVG export, autosave/reload, dense cable field, and the generated review fixture.</div>
<footer>Built by docs/build_async_edge_style_implementation.py at __HEAD__ on __BRANCH__ · tldraw __TLDRAW__ · all media embedded · focused evidence read from docs/assets/async-edge-style-acceptance.json.</footer>
</main><script>
const frames={dense:{src:'__DENSE__',w:__DENSE_W__,h:__DENSE_H__,alt:'Dense async and data cable review board',caption:'The generated .systemsketch fixture: long, short, crossing, elbow, curved, and opposing-direction routes.'},selector:{src:'__SELECTOR__',w:__SELECTOR_W__,h:__SELECTOR_H__,alt:'Edge type selector with Async active',caption:'The real selected-connection inspector exposes Data, Async, and Delayed (z⁻¹).'},short:{src:'__SHORT__',w:__SHORT_W__,h:__SHORT_H__,alt:'Short async cable proof',caption:'A deselected 60-unit cable still shows a complete packet mark.'}};document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-frame]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));const frame=frames[button.dataset.frame],image=document.querySelector('#evidence');image.src=frame.src;image.width=frame.w;image.height=frame.h;image.alt=frame.alt;document.querySelector('#caption').textContent=frame.caption}))
</script></body></html>'''

    replacements = {
        "__PASSED__": str(passed),
        "__TOTAL__": str(len(results)),
        "__CHECKS__": checks,
        "__TLDRAW__": html.escape(package["dependencies"]["tldraw"]),
        "__HEAD__": html.escape(head),
        "__BRANCH__": html.escape(branch),
    }
    for name, (uri, width, height) in encoded.items():
        upper = name.upper()
        replacements[f"__{upper}__"] = uri
        replacements[f"__{upper}_W__"] = str(width)
        replacements[f"__{upper}_H__"] = str(height)
    for token, value in replacements.items():
        page = page.replace(token, value)
    if re.search(r"__[A-Z_]+__", page):
        raise SystemExit("unresolved template token")
    OUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes) · {passed}/{len(results)} focused checks")


if __name__ == "__main__":
    main()
