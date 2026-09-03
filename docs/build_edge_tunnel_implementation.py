#!/usr/bin/env python3
"""Build the self-contained implementation gallery for edge tunnels."""

from __future__ import annotations

import base64
import html
import json
import re
import struct
import subprocess
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "edge-tunnel-implementation-2026-09-02.html"
RESULTS = ROOT / "docs" / "assets" / "edge-tunnel-results-2026-09-02.json"
SOURCE = ROOT / "src" / "blocks" / "connections" / "tunnelEdge.ts"
SMOKE = ROOT / "tests" / "edge_tunnel_smoke.mjs"
FIXTURE = ROOT / "sketches" / "review" / "edge-tunnel.systemsketch"
IMAGES = {
    "hidden": ROOT / "docs" / "assets" / "edge-tunnel-hidden-live-2026-09-02.png",
    "hover": ROOT / "docs" / "assets" / "edge-tunnel-hover-live-2026-09-02.png",
    "focused": ROOT / "docs" / "assets" / "edge-tunnel-layer-focus-live-2026-09-02.png",
    "inspector": ROOT / "docs" / "assets" / "edge-tunnel-inspector-live-2026-09-02.png",
    "review": ROOT / "sketches" / "review" / "edge-tunnel.png",
}


def git(*arguments: str) -> str:
    return subprocess.check_output(["git", *arguments], cwd=ROOT, text=True).strip()


def png_data(path: Path) -> tuple[str, int, int]:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"not a PNG: {path}")
    width, height = struct.unpack(">II", raw[16:24])
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:image/png;base64,{encoded}", width, height


def required_integer(source: str, name: str) -> int:
    match = re.search(rf"export const {name} = (\d+)", source)
    if not match:
        raise SystemExit(f"cannot measure {name} from {SOURCE}")
    return int(match.group(1))


def main() -> None:
    required = [RESULTS, SOURCE, SMOKE, FIXTURE, *IMAGES.values()]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("missing report inputs: " + ", ".join(missing))

    newest_implementation = max(SOURCE.stat().st_mtime, SMOKE.stat().st_mtime)
    if RESULTS.stat().st_mtime < newest_implementation:
        raise SystemExit("browser evidence is stale; rerun npm run test:tunnel")

    source = SOURCE.read_text(encoding="utf-8")
    stub_length = required_integer(source, "TUNNEL_STUB_LENGTH")
    minimum_match = re.search(
        r"export const TUNNEL_MIN_PATH_LENGTH = TUNNEL_STUB_LENGTH \* 2 \+ (\d+)",
        source,
    )
    if not minimum_match:
        raise SystemExit("cannot measure the minimum hidden middle from tunnelEdge.ts")
    minimum_hidden_middle = int(minimum_match.group(1))
    minimum_tunnel_length = stub_length * 2 + minimum_hidden_middle

    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    passed = sum(bool(item.get("ok")) for item in results)
    if passed != len(results):
        raise SystemExit(f"focused browser journey is not green: {passed}/{len(results)}")

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    record_count = len(fixture.get("records", []))
    encoded_images = {name: png_data(path) for name, path in IMAGES.items()}
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    branch = git("branch", "--show-current") or "detached"
    head = git("rev-parse", "--short", "HEAD")
    board_query = quote(str(FIXTURE), safe="")
    live_review_url = f"http://127.0.0.1:4490/?board={board_query}"
    check_items = "".join(
        f'<li><span>{index:02d}</span><b>{html.escape(item["label"])}</b><i>PASS</i></li>'
        for index, item in enumerate(results, 1)
    )

    page = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edge tunnels · SystemSketch implementation</title>
<style>
:root{--ink:#172033;--muted:#667085;--line:#d7deea;--paper:#f5f7fb;--card:#fff;--blue:#2563eb;--blue-soft:#dbeafe;--green:#087a55;--orange:#ea7a17;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 84% -8%,#dbeafe 0,transparent 34%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1180px,calc(100% - 40px));margin:auto;padding:54px 0 80px}.eyebrow{font:750 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}h1{max-width:900px;margin:14px 0 13px;font-size:clamp(44px,7vw,76px);line-height:.94;letter-spacing:-.055em}h1 em{font-style:normal;color:var(--blue)}.lede{max-width:820px;margin:0;color:#465268;font-size:19px}.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:26px;align-items:end}.hero-diagram{padding:20px;border:1px solid #253149;border-radius:18px;background:#111827;color:white;box-shadow:0 18px 46px #25314920}.hero-diagram svg{display:block;width:100%;height:auto}.hero-diagram code{display:block;margin-top:10px;color:#93c5fd;font:12px var(--mono)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:30px 0}.stat,.card{background:#ffffffeb;border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #2531490b}.stat{padding:16px}.stat b{display:block;font:750 27px/1 var(--mono)}.stat span{color:var(--muted);font-size:12px}.section{margin-top:54px}.section h2{margin:0 0 8px;font-size:31px;letter-spacing:-.028em}.section>p{max-width:850px;margin:0 0 20px;color:var(--muted)}.switcher{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.switcher button{cursor:pointer;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);padding:8px 14px;font:650 13px inherit}.switcher button[aria-pressed=true]{border-color:var(--ink);background:var(--ink);color:#fff}.frame{overflow:hidden;margin:0;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 16px 44px #25314914}.frame img{display:block;width:100%;height:auto}.frame figcaption{padding:13px 16px;border-top:1px solid var(--line);color:var(--muted)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{padding:21px}.card h3{margin:0 0 8px}.card p{margin:0;color:var(--muted)}.flow{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:20px}.flow div{position:relative;min-height:112px;padding:16px 12px;border:1px solid var(--line);border-radius:13px;background:#fff}.flow div:not(:last-child):after{content:'→';position:absolute;z-index:2;right:-15px;top:40px;color:var(--blue);font-size:21px}.flow b{display:block}.flow span{color:var(--muted);font-size:12px}.checks{list-style:none;padding:0;margin:18px 0 0}.checks li{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}.checks span{font:700 12px var(--mono);color:var(--blue)}.checks i{font:700 11px var(--mono);color:var(--green)}.links a{color:var(--blue);font-weight:700;text-decoration:none}.links a:hover{text-decoration:underline}.note{margin-top:46px;padding:19px 21px;border-left:4px solid var(--orange);border-radius:0 12px 12px 0;background:#fff7ed}.note b{color:#9a3412}footer{margin-top:34px;color:var(--muted);font:12px var(--mono)}code{font-family:var(--mono)}@media(max-width:820px){main{width:min(100% - 24px,1180px)}.hero,.grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.flow{grid-template-columns:1fr}.flow div:not(:last-child):after{content:'↓';right:auto;left:18px;top:auto;bottom:-20px}}
</style></head><body><main>
<div class="hero"><header><div class="eyebrow">SystemSketch · shipped implementation · 2 Sep 2026</div><h1>Long cables can go <em>underground.</em></h1><p class="lede">The PyBlocks edge-tunnel behavior is now native to SystemSketch: one semantic connection remains intact while its idle middle run disappears. Hover previews the complete run without removing its outlined mouths; layer focus alone removes its members’ mouths and tunnels every other edge.</p></header><div class="hero-diagram"><svg viewBox="0 0 460 120" role="img" aria-label="Tunnel route with two visible endpoint stubs and a hidden middle"><path d="M26 60H126" stroke="#dbeafe" stroke-width="4"/><path d="M334 60H434" stroke="#dbeafe" stroke-width="4"/><path d="M126 60H334" stroke="#64748b" stroke-width="2" stroke-dasharray="5 9" opacity=".55"/><circle cx="126" cy="60" r="9" fill="#111827" stroke="#f59e0b" stroke-width="3"/><circle cx="334" cy="60" r="9" fill="#111827" stroke="#f59e0b" stroke-width="3"/><text x="164" y="36" fill="#94a3b8" font-family="ui-monospace" font-size="12">hidden, still semantic</text></svg><code>port — __STUB__px — ◯ ··· ◯ — __STUB__px — port</code></div></div>
<div class="stats"><div class="stat"><b>__STUB__</b><span>units per visible stub</span></div><div class="stat"><b>__MINIMUM__</b><span>minimum tunneled route length</span></div><div class="stat"><b>__PASSED__/__TOTAL__</b><span>real-browser checks</span></div><div class="stat"><b>__RECORDS__</b><span>records in review fixture</span></div></div>

<section class="section"><h2>One edge, four paint states</h2><p>Tunnel is presentation state, not a second line primitive. Idle hides the middle. Hover or selection previews the whole route with both mouths still drawn. The active layer fully reveals its members and temporarily sends every other long edge underground.</p><div class="switcher" role="group" aria-label="Tunnel evidence frame"><button aria-pressed="true" data-frame="hidden">Idle tunnel</button><button aria-pressed="false" data-frame="hover">Hover preview</button><button aria-pressed="false" data-frame="focused">Layer isolation</button><button aria-pressed="false" data-frame="inspector">Inspector</button><button aria-pressed="false" data-frame="review">Review board</button></div><figure class="frame"><img id="evidence" src="__HIDDEN__" width="__HIDDEN_W__" height="__HIDDEN_H__" alt="Idle edge tunnel with two short stubs and outlined mouths"><figcaption id="caption">Idle: the middle run is visually underground while the real edge remains available to hit testing.</figcaption></figure></section>

<section class="section"><h2>The reveal contract</h2><div class="flow"><div><b>Tunnel toggle</b><span>Stored on the ordinary connection</span></div><div><b>Hover preview</b><span>Whole route plus both mouths</span></div><div><b>Named layer</b><span>Reusable names derived from tunneled edges</span></div><div><b>Layer isolation</b><span>Members revealed; every other edge tunneled</span></div><div><b>One routed path</b><span>Canvas, export, hit target, and autosave agree</span></div></div></section>

<section class="section grid"><div class="card"><h3>Short cables remain legible</h3><p>A route at or below <code>__MINIMUM__</code> units stays complete. Above it, both <code>__STUB__</code>-unit stubs and a real hidden middle fit without collapsing into an accidental gap.</p></div><div class="card"><h3>Delayed edges keep their meaning</h3><p>The <code>z⁻¹</code> pill is hidden only while the run is underground. Any reveal context restores the route, delay dots, and pill together.</p></div></section>

<section class="section"><h2>Focused browser proof</h2><p>The acceptance journey creates a real connection, drives the inspector, hover target, endpoints, layer chip, delayed state, autosave, cold reload, and the checked-in review fixture.</p><ul class="checks">__CHECKS__</ul></section>

<section class="section grid"><div class="card"><h3>Stock boundary kept</h3><p>tldraw remains pinned at <code>__TLDRAW__</code>. The feature uses the existing custom connection ShapeUtil and supported component mount; stock selection, routing, bindings, hit testing, and z-order stay stock-owned.</p></div><div class="card links"><h3>Review it directly</h3><p><a href="../sketches/review/edge-tunnel.systemsketch">Saved fixture</a> · <a href="../sketches/review/edge-tunnel.png">Fixture PNG</a> · <a href="build_edge_tunnel_implementation.py">Reproducible builder</a> · <a href="__LIVE_URL__">Open the live review board</a></p></div></section>

<div class="note"><b>Porting choice.</b> The old PyBlocks tag lens was not copied wholesale because SystemSketch does not yet have the corresponding tag subsystem. This port keeps the edge-tunnel behavior complete and adds a narrow, persistent layer-focus chip whose names come from tunneled connections themselves.</div>
<footer>Built by docs/build_edge_tunnel_implementation.py at __HEAD__ on __BRANCH__ · tldraw __TLDRAW__ · all visual evidence embedded.</footer>
</main><script>
const frames={hidden:{src:'__HIDDEN__',w:__HIDDEN_W__,h:__HIDDEN_H__,alt:'Idle edge tunnel with two short stubs and outlined mouths',caption:'Idle: the middle run is visually underground while the real edge remains available to hit testing.'},hover:{src:'__HOVER__',w:__HOVER_W__,h:__HOVER_H__,alt:'Hovered tunnel with its complete cable and both outlined mouths',caption:'Hover preview: the complete cable returns while both tunnel mouths remain visible.'},focused:{src:'__FOCUSED__',w:__FOCUSED_W__,h:__FOCUSED_H__,alt:'Diagnostics edge revealed while another edge becomes tunneled',caption:'Layer isolation: Diagnostics loses its mouths; every edge outside the layer becomes tunneled.'},inspector:{src:'__INSPECTOR__',w:__INSPECTOR_W__,h:__INSPECTOR_H__,alt:'Visibility inspector with Tunnel toggle and layer chooser',caption:'The selected-connection inspector stores the tunnel switch and a reusable layer name.'},review:{src:'__REVIEW__',w:__REVIEW_W__,h:__REVIEW_H__,alt:'Numbered edge tunnel review board',caption:'The generated fixture exercises hover preview and layer isolation on two real connections.'}};document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-frame]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));const frame=frames[button.dataset.frame],image=document.querySelector('#evidence');image.src=frame.src;image.width=frame.w;image.height=frame.h;image.alt=frame.alt;document.querySelector('#caption').textContent=frame.caption}))
</script></body></html>'''

    replacements = {
        "__STUB__": str(stub_length),
        "__MINIMUM__": str(minimum_tunnel_length),
        "__PASSED__": str(passed),
        "__TOTAL__": str(len(results)),
        "__RECORDS__": str(record_count),
        "__CHECKS__": check_items,
        "__TLDRAW__": html.escape(package["dependencies"]["tldraw"]),
        "__HEAD__": html.escape(head),
        "__BRANCH__": html.escape(branch),
        "__LIVE_URL__": html.escape(live_review_url, quote=True),
    }
    for name, (uri, width, height) in encoded_images.items():
        upper = name.upper()
        replacements[f"__{upper}__"] = uri
        replacements[f"__{upper}_W__"] = str(width)
        replacements[f"__{upper}_H__"] = str(height)
    for token, value in replacements.items():
        page = page.replace(token, value)
    if re.search(r"__[A-Z_]+__", page):
        raise SystemExit("unresolved template token")
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes) · {passed}/{len(results)} checks")


if __name__ == "__main__":
    main()
