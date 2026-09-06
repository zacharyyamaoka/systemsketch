#!/usr/bin/env python3
"""Build the self-contained stock-settled Block auto-fit repair gallery."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "block-autofit-stock-settle-2026-09-05.html"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def png(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing {path}; run the fixture and browser smoke first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    branch = git("branch", "--show-current")
    fixture = png(ROOT / "sketches" / "review" / "block-autofit-stock-settle.png")
    live = png(ROOT / "docs" / "assets" / "block-autofit-stock-settle-live-2026-09-05.png")
    fold = png(ROOT / "docs" / "assets" / "block-fold-control-side-live-2026-09-05.png")
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stock-settled Block auto-fit · SystemSketch</title>
<style>
:root{{--paper:#f4f6fa;--ink:#172033;--muted:#637087;--line:#d9e0eb;--card:#fff;--blue:#2878e8;--orange:#eb7b2d;--green:#23865f;--red:#c84949;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--sans:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}}main{{max-width:1240px;margin:auto;padding:52px 28px 86px}}.eyebrow{{font:700 12px var(--mono);letter-spacing:.13em;color:var(--blue);text-transform:uppercase}}h1{{max-width:1030px;margin:12px 0 18px;font-size:clamp(3rem,7vw,6rem);line-height:.95;letter-spacing:-.065em}}h2{{margin:52px 0 14px;font-size:30px;letter-spacing:-.03em}}p{{margin:0}}.lede{{max-width:900px;color:#46526a;font-size:20px}}.answers,.trace,.shots{{display:grid;gap:16px}}.answers{{grid-template-columns:repeat(4,1fr);margin:30px 0}}.answer,.panel,figure{{border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 8px 30px #21314a0b}}.answer{{padding:20px}}.answer b{{display:block;margin-bottom:6px;font-size:25px}}.answer span{{color:var(--muted);font-size:14px}}.answer:nth-child(3){{border-color:#efc1c1}}.answer:nth-child(4){{border-color:#acd9c6}}.trace{{grid-template-columns:1fr auto 1fr;align-items:stretch}}.trace .panel{{padding:22px}}.trace h3{{margin:0 0 8px}}.bad h3{{color:var(--red)}}.good h3{{color:var(--green)}}.arrow{{display:grid;place-items:center;color:var(--blue);font-size:34px}}code{{padding:2px 6px;border-radius:5px;background:#eef1f6;font:14px var(--mono)}}.numbers{{display:flex;gap:18px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}}.numbers b{{display:block;font:700 22px var(--mono)}}.numbers span{{color:var(--muted);font-size:12px}}.sequence{{display:grid;grid-template-columns:1fr 54px 1fr;align-items:center;margin-top:16px;padding:22px;border:1px solid #a9c9f4;border-radius:16px;background:#f8fbff}}.phase{{padding:18px;border-radius:12px;background:white}}.phase b{{display:block;margin-bottom:5px;color:var(--blue)}}.shots{{grid-template-columns:repeat(3,1fr)}}figure{{overflow:hidden;margin:0}}figure img{{display:block;width:100%;background:#f8fafc}}figcaption{{padding:15px 18px;color:var(--muted);font-size:14px}}.proof{{padding:22px}}.proof ul{{margin:10px 0 0;padding-left:22px}}.proof li{{margin:7px 0}}button{{margin-top:14px;padding:9px 12px;border:1px solid #9db9e1;border-radius:8px;background:white;color:#235ca8;font-weight:700;cursor:pointer}}#detail{{display:none;margin-top:14px;padding:16px;border-radius:10px;background:#eef5ff;color:#38506f}}#detail.show{{display:block}}footer{{margin-top:48px;color:var(--muted);font-size:13px}}@media(max-width:800px){{main{{padding:34px 16px 64px}}.answers,.shots,.trace,.sequence{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style>
<main><div class="eyebrow">SystemSketch · stability repair · 05 September 2026</div><h1>Auto-fit now waits for stock tldraw to finish the gesture.</h1><p class="lede">The bug was not missing stock functionality; it was calling a correct one-shot stock helper at the wrong time. Translation now owns every pointer sample. On release, one public <code>fitFrameToContent</code> call fits the Expanded Block while preserving the child’s page pose and membership.</p>
<section class="answers"><article class="answer"><b>Yes, partly</b><span>tldraw 5.3.2 provides public one-shot frame fitting—not a live auto-fit policy.</span></article><article class="answer"><b>Yes</b><span>Expanded Blocks are frame-like, so the public helper applies directly.</span></article><article class="answer"><b>Previously: yes, badly</b><span>We invoked it after every store operation, including every drag sample.</span></article><article class="answer"><b>Now: yes, once</b><span>Transforms settle first; the stock helper runs at the gesture boundary.</span></article></section>
<h2>The feedback loop in the supplied recording</h2><section class="trace"><article class="panel bad"><h3>Before</h3><p>Pointer sample uses tldraw’s initial child snapshot. Our observer then shifts the frame and child-local coordinates. The next pointer sample still references the old snapshot, adding the shift again.</p><div class="numbers"><div><b>129</b><span>frame updates</span></div><div><b>12,462</b><span>largest traced x</span></div><div><b>−13,184</b><span>smallest traced y</span></div></div></article><div class="arrow">→</div><article class="panel good"><h3>After</h3><p>While the pointer is held, the container record stays byte-for-byte unchanged. The release event occurs after tldraw returns to idle, so a single stock fit can safely shift the frame and local coordinates together.</p><div class="numbers"><div><b>0</b><span>frame changes while held</span></div><div><b>4×8</b><span>fixture stress samples</span></div><div><b>0</b><span>detachments/errors</span></div></div></article></section>
<section class="sequence"><article class="phase"><b>1 · Pointer held</b><span>Stock <code>select.translating</code> is the only geometry writer. The child remains a member even beyond the current boundary.</span></article><div class="arrow">→</div><article class="phase"><b>2 · Pointer released</b><span>SystemSketch invokes stock <code>fitFrameToContent</code> once. Child page position is invariant; only frame origin, size, and child-local offset settle.</span></article></section>
<h2>Real review surfaces</h2><section class="shots"><figure><img src="{fixture}" alt="Prepared SystemSketch stock-settled auto-fit review board"><figcaption><b>Prepared board.</b> Numbered arrows point at the real nested Block and its frame. The pass card names the visible no-jump/no-detach outcome.</figcaption></figure><figure><img src="{live}" alt="SystemSketch auto-fit fixture after rapid browser drag stress"><figcaption><b>Browser-driven stress.</b> Four rapid edge-crossing cycles complete with the child still nested, followed by one settled fit and no console errors.</figcaption></figure><figure><img src="{fold}" alt="SystemSketch Blocks with left and right fold controls"><figcaption><b>Fold placement.</b> Existing Blocks default Left. The inspector can place the independent disclosure control on the Right without moving the title/icon identity.</figcaption></figure></section>
<h2>Proof</h2><section class="panel proof"><b>Regression gates</b><ul><li><code>npm run test:block-fold-autosize</code>: eight end-to-end checks, including both fold corners, container immutability during every drag sample, and page-pose invariance after release.</li><li><code>npm run test:block-autofit-stock-settle-fixture</code>: drives the cold-opened generated board through 32 rapid edge crossings.</li><li><code>npm run test:block-fold-control-side-fixture</code>: verifies Left default, Right persistence, and fold/unfold in both headed views.</li><li>Focused unit coverage guards tldraw’s pointing, translating, resizing, rotating, and handle-drag state boundaries.</li></ul><button id="why" type="button" aria-expanded="false">Show exact stock boundary</button><div id="detail">Stock tldraw’s own Frame uses <code>fitFrameToContent</code> on a double-click corner. It does not continuously refit during translation. SystemSketch adds only the opt-in scheduling policy, sticky drag-out eligibility, and the explicit <b>Remove from container</b> command; geometry, translation, reparenting, and fitting remain stock.</div></section>
<footer>Built by <code>docs/build_block_autofit_stock_settle.py</code> from <code>{html.escape(branch)}</code>. The retained review URL pins the exact commit; images are embedded and this file is self-contained.</footer></main>
<script>const b=document.querySelector('#why'),d=document.querySelector('#detail');b.addEventListener('click',()=>{{const o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(o));b.textContent=o?'Hide exact stock boundary':'Show exact stock boundary';d.classList.toggle('show',o)}})</script></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
