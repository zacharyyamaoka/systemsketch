#!/usr/bin/env python3
"""Build the self-contained continuous Block auto-fit review gallery."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "block-autofit-continuous-2026-09-05.html"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def png(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing {path}; run the browser proof first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    branch = html.escape(git("branch", "--show-current"))
    main_base = html.escape(git("merge-base", "main", "HEAD")[:12])
    fixture = png(ROOT / "sketches" / "review" / "block-autofit-continuous.png")
    held = png(ROOT / "docs" / "assets" / "block-autofit-continuous-held-2026-09-05.png")
    settled = png(ROOT / "docs" / "assets" / "block-autofit-continuous-live-2026-09-05.png")
    fold = png(ROOT / "sketches" / "review" / "block-fold-control-side.png")
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Continuous Block auto-fit · SystemSketch</title>
<style>
:root{{--paper:#f4f6fa;--ink:#172033;--muted:#647087;--line:#d9e1ed;--card:#fff;--blue:#2878e8;--orange:#ed7a2d;--green:#23865f;--purple:#7857c4;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;--sans:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}}main{{max-width:1260px;margin:auto;padding:54px 28px 86px}}.eyebrow{{font:750 12px var(--mono);letter-spacing:.13em;color:var(--blue);text-transform:uppercase}}h1{{max-width:1080px;margin:12px 0 18px;font-size:clamp(3.2rem,7.4vw,6.6rem);line-height:.92;letter-spacing:-.066em}}h2{{margin:58px 0 15px;font-size:31px;letter-spacing:-.035em}}p{{margin:0}}.lede{{max-width:940px;color:#46536a;font-size:21px}}code{{padding:2px 6px;border-radius:5px;background:#edf1f7;font:14px var(--mono)}}.cards,.shots,.proofs{{display:grid;gap:16px}}.cards{{grid-template-columns:repeat(3,1fr);margin-top:30px}}.card,.panel,figure{{border:1px solid var(--line);border-radius:17px;background:var(--card);box-shadow:0 9px 30px #21314a0a}}.card{{padding:22px}}.card b{{display:block;margin-bottom:7px;font-size:24px}}.card span{{color:var(--muted);font-size:14px}}.card:nth-child(2){{border-color:#afd8c8}}.flow{{display:grid;grid-template-columns:1fr 52px 1fr 52px 1fr;align-items:stretch}}.phase{{padding:22px;border:1px solid var(--line);border-radius:15px;background:white}}.phase small{{font:750 11px var(--mono);letter-spacing:.1em;color:var(--blue)}}.phase b{{display:block;margin:7px 0}}.arrow{{display:grid;place-items:center;color:var(--orange);font-size:32px}}.compare{{position:relative;overflow:hidden;border:1px solid #adc8ef;border-radius:18px;background:#eaf2ff;box-shadow:0 10px 32px #275ca314}}.compare img{{display:block;width:100%;transition:opacity .2s}}.compare img.release{{position:absolute;inset:0;opacity:0}}.compare[data-state='release'] img.held{{opacity:0}}.compare[data-state='release'] img.release{{opacity:1}}.toggle{{display:flex;gap:4px;width:max-content;margin:14px auto 0;padding:4px;border:1px solid var(--line);border-radius:11px;background:white}}button{{padding:9px 15px;border:0;border-radius:8px;background:transparent;color:#4b5870;font-weight:750;cursor:pointer}}button[aria-pressed='true']{{background:var(--blue);color:white}}.micro{{max-width:780px;margin:12px auto 0;text-align:center;color:var(--muted);font-size:14px}}.shots{{grid-template-columns:1fr 1fr}}figure{{overflow:hidden;margin:0}}figure img{{display:block;width:100%;background:#f8fafc}}figcaption{{padding:16px 18px;color:var(--muted);font-size:14px}}.proofs{{grid-template-columns:1.1fr .9fr}}.panel{{padding:23px}}.panel h3{{margin:0 0 10px}}.panel ul{{margin:8px 0 0;padding-left:21px}}.panel li{{margin:7px 0}}.numbers{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}}.metric{{padding:15px;border-radius:12px;background:#f2f6fb}}.metric b{{font:750 24px var(--mono)}}.metric span{{display:block;color:var(--muted);font-size:12px}}.why{{border-color:#b8addd;background:#fbf9ff}}footer{{margin-top:46px;color:var(--muted);font-size:13px}}@media(max-width:820px){{main{{padding:34px 16px 64px}}.cards,.shots,.proofs,.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style>
<main><div class="eyebrow">SystemSketch · interaction architecture · 05 September 2026</div><h1>Continuous feedback, one stable commit.</h1><p class="lede">The Expanded Block now follows its children on every held pointer sample without rewriting its document geometry. Release delegates the actual fit to tldraw’s public <code>fitFrameToContent</code> primitive, so the continuous feel and the stable gesture no longer fight each other.</p>
<section class="cards"><article class="card"><b>Stock gesture</b><span>Translation remains the sole persisted geometry writer while the pointer is held.</span></article><article class="card"><b>Derived surface</b><span>Block paint, clipping, hit geometry, and selection geometry project the current padded child bounds.</span></article><article class="card"><b>Stock fit</b><span>Pointer-up commits the identical projected box once, preserving page pose and membership.</span></article></section>
<h2>The supported-seam pipeline</h2><section class="flow"><article class="phase"><small>01 · MOVE</small><b>tldraw updates the child</b><span>Every pointer sample is still calculated from the engine’s original transform snapshot.</span></article><div class="arrow">→</div><article class="phase"><small>02 · PROJECT</small><b>SystemSketch reads geometry</b><span>A group-like <code>ShapeUtil.getGeometry</code> projection paints the padded container; no records change.</span></article><div class="arrow">→</div><article class="phase"><small>03 · RELEASE</small><b>tldraw fits once</b><span>The public frame helper replaces the projection with persisted frame and child-local coordinates.</span></article></section>
<h2>Scrub the exact visual handoff</h2><div id="compare" class="compare" data-state="held"><img class="held" src="{held}" alt="Block boundary following a nested child while the pointer is held"><img class="release" src="{settled}" alt="The same Block after release persisted the projected boundary"></div><div class="toggle" role="group" aria-label="Auto-fit phase"><button type="button" data-phase="held" aria-pressed="true">Pointer held</button><button type="button" data-phase="release" aria-pressed="false">Released</button></div><p class="micro">The held image is captured before <code>mouseReleased</code>. The release image is captured only after the live projection disappears and the persisted frame equals its last projected box.</p>
<h2>Review surfaces</h2><section class="shots"><figure><img src="{fixture}" alt="Continuous Block auto-fit fixture with numbered instructions"><figcaption><b>Continuous auto-fit board.</b> The nested <code>parse()</code> Block is ready for rapid edge-crossing drags. The orange steps and green pass card describe only visible behavior.</figcaption></figure><figure><img src="{fold}" alt="Fold-control review board showing left and right placements"><figcaption><b>Header composition update.</b> Left remains the fold default. With the chevron at far right, the type label joins the title on the left instead of competing for the corner.</figcaption></figure></section>
<h2>Evidence</h2><section class="proofs"><article class="panel"><h3>Real-browser gates</h3><ul><li><code>test:block-autofit-continuous-fixture</code>: 32 held edge crossings, zero held frame mutations, live box equality, membership and page-pose invariance.</li><li><code>test:block-fold-autosize</code>: fold, unfold, stable drag, and explicit Remove from container behavior.</li><li><code>test:block-fold-control-side-fixture</code>: Left/Right persistence, both view modes, and title-to-type adjacency.</li><li><code>test:rows</code>: 14/14 checks from latest main, including heading rows, branch rows, menus, and inspector drag.</li></ul><div class="numbers"><div class="metric"><b>32</b><span>held samples</span></div><div class="metric"><b>0</b><span>held frame writes</span></div><div class="metric"><b>0</b><span>detachments/errors</span></div></div></article><article class="panel why"><h3>Why not continuously call stock fit?</h3><p><code>fitFrameToContent</code> is a correct one-shot operation. It shifts the frame and every child-local coordinate together. Calling it between stock translation samples invalidates the gesture’s initial snapshot and creates the runaway feedback loop seen in the recording. The projection preserves the continuous UX without violating that invariant.</p><p style="margin-top:15px"><b>Latest-main reconciliation.</b> This work is based on <code>{main_base}</code> and retains the newer row/heading model plus Block schema migration v8.</p></article></section>
<footer>Built by <code>docs/build_block_autofit_continuous.py</code> from <code>{branch}</code>. Images are embedded; this report is self-contained. The review runtime pins the exact committed artifact rather than this development checkout.</footer></main>
<script>const c=document.querySelector('#compare');document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>{{c.dataset.state=b.dataset.phase;document.querySelectorAll('[data-phase]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))}}))</script></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
