#!/usr/bin/env python3
"""Build the self-contained Block folding and auto-fit implementation gallery."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "block-fold-autosize-2026-09-04.html"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def image_data(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Missing {path}; run npm run test:block-fold-autosize first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    head = git("rev-parse", "--short", "HEAD")
    branch = git("branch", "--show-current")
    changed = git("diff", "--stat", "HEAD", "--", "src", "tests").splitlines()
    delta = changed[-1] if changed else "No source/test delta detected"
    expanded = image_data("block-fold-autosize-expanded-2026-09-04.png")
    folded = image_data("block-fold-autosize-folded-2026-09-04.png")
    rapid_drag = image_data("block-fold-autosize-rapid-drag-2026-09-04.png")
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Block folding &amp; auto-fit · SystemSketch</title>
<style>
:root {{ --paper:#f5f4ef; --surface:#fffefa; --ink:#25252a; --muted:#646572; --line:#d9d8d1; --blue:#416fbe; --blue-soft:#e5edfc; --green:#196d54; --green-soft:#e2f2eb; --orange:#bd651d; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; --sans:Inter,ui-sans-serif,system-ui,sans-serif; }}
* {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper); font:16px/1.55 var(--sans) }} main {{ max-width:1260px; margin:auto; padding:48px 24px 92px }}
.eyebrow {{ color:var(--blue); font:700 12px/1 var(--mono); letter-spacing:.12em; text-transform:uppercase }} h1 {{ max-width:980px; margin:12px 0; font:600 clamp(2.7rem,7vw,5.8rem)/.93 Georgia,serif; letter-spacing:-.06em }} h2 {{ margin:52px 0 14px; font:600 30px/1.1 Georgia,serif; letter-spacing:-.025em }} .lede {{ max-width:850px; color:#484955; font-size:19px }} code {{ border-radius:5px; padding:2px 5px; background:#eceae3; font:.9em var(--mono) }}
.facts,.shots,.flow {{ display:grid; gap:16px }} .facts {{ grid-template-columns:repeat(3,1fr); margin:28px 0 }} .fact,.card,figure {{ border:1px solid var(--line); border-radius:16px; background:var(--surface) }} .fact {{ padding:17px }} .fact b {{ display:block; font-size:25px }} .fact span {{ color:var(--muted); font-size:13px }}
.policy {{ border-left:5px solid var(--green); padding:19px 21px }} .policy strong {{ color:var(--green) }} .flow {{ grid-template-columns:repeat(3,1fr); counter-reset:step }} .step {{ position:relative; min-height:184px; padding:20px 20px 18px 64px }} .step::before {{ counter-increment:step; content:counter(step); position:absolute; left:19px; top:18px; display:grid; place-items:center; width:30px; height:30px; color:var(--blue); border-radius:50%; background:var(--blue-soft); font:700 14px var(--mono) }} .step h3 {{ margin:0 0 8px; font-size:18px }} .step p {{ margin:0; color:var(--muted); font-size:14px }}
.shots {{ grid-template-columns:repeat(3,minmax(0,1fr)) }} figure {{ overflow:hidden; margin:0 }} figure img {{ width:100%; display:block; background:#f6f7f8 }} figcaption {{ padding:14px 16px 17px; color:var(--muted); font-size:14px }} figcaption b {{ color:var(--ink) }}
.mini {{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:14px; padding:14px 16px; border:1px solid #c6d3ec; border-radius:13px; background:#f7faff }} .mini p {{ margin:0; font-size:14px }} button {{ cursor:pointer; border:1px solid #9ab3df; border-radius:9px; padding:8px 11px; color:#234d91; background:white; font:700 12px var(--sans) }} button[aria-pressed="true"] {{ color:#fff; border-color:#416fbe; background:#416fbe }}
.detail {{ display:none; margin-top:14px; padding:15px 17px; color:#39506e; border-radius:12px; background:var(--blue-soft); font-size:14px }} .detail.show {{ display:block }} .evidence {{ padding:19px 21px }} .evidence ul {{ margin:9px 0 0; padding-left:22px }} .evidence li {{ margin:6px 0 }} footer {{ margin-top:50px; color:var(--muted); font-size:13px }}
@media(max-width:760px) {{ main {{ padding:32px 16px 70px }} h1 {{ font-size:3.1rem }} .facts,.flow,.shots {{ grid-template-columns:1fr }} }}
</style>
<main>
  <div class="eyebrow">SystemSketch · implementation gallery · 04 September 2026</div>
  <h1>Blocks can now fold—and grow around the work they contain.</h1>
  <p class="lede">Both behaviours are opt-in presentation choices. A headed Port or Expanded Block can become a 48px header without severing its external port semantics. An Expanded Block can also fit its actual children after edits, drops, reparenting, and deletes—while keeping a grabbed child a member even if the fitting boundary races beneath the pointer.</p>
  <section class="facts"><div class="fact"><b>3 flags</b><span>folding enabled · folded · auto-fit children</span></div><div class="fact"><b>7 / 7</b><span>real-browser journey checks</span></div><div class="fact"><b>24 samples</b><span>rapid edge-crossing drag proof</span></div></section>
  <section class="card policy"><strong>Membership needs an explicit exit, not a brittle drag race.</strong><br>A grabbed child stays in an auto-fit Block for the whole drag, even while its boundary refits. Right-click it and choose <b>Remove from container</b> for the deliberate exit: the command reparents it to the Block’s parent while preserving its page position, then the source Block refits.</section>
  <h2>Three stock-friendly seams</h2>
  <section class="flow"><article class="card step"><h3>Fold the current face</h3><p>The leftmost chevron is visible only on foldable Port and Expanded faces. Folding parks the full dimensions for that view, shows the compact header, and hides descendants from the active frame scope.</p></article><article class="card step"><h3>Fit the real children</h3><p>Expanded Blocks call tldraw’s stock <code>fitFrameToContent</code> after document mutations. Empty Blocks keep their manually chosen starting size.</p></article><article class="card step"><h3>Drag freely; exit deliberately</h3><p>Auto-fit Blocks decline tldraw’s drag-out gate, so their child stays put through an edge-crossing grab. The context command uses stock <code>reparentShapes</code> to make a named, position-preserving exit.</p></article></section>
  <h2>Observed canvas states</h2>
  <section class="shots"><figure><img src="{expanded}" alt="Expanded SystemSketch Block with folding and auto-fit enabled in its Behaviour inspector"><figcaption><b>Open and auto-fit.</b> The chevron takes the furthest-left header slot. The expanded parent has tightened to its one child, while the Behaviour panel confirms both settings are enabled.</figcaption></figure><figure><img src="{folded}" alt="Folded SystemSketch Block as a compact header with its hidden child"><figcaption><b>Folded.</b> The same Block collapses to its header, its child is hidden, and unfolding restores the parked full box rather than inventing a new size.</figcaption></figure><figure><img src="{rapid_drag}" alt="SystemSketch auto-fitting Block after an edge-crossing child drag"><figcaption><b>Rapid drag.</b> After three high-speed, edge-crossing cycles, <code>parse()</code> remains a child and <code>pipeline()</code> still fits it.</figcaption></figure></section>
  <div class="mini"><p><b>Why not use a separate custom drag model?</b> The feature keeps tldraw’s stock frame membership and uses the narrow hooks around it. The one novel behavior is an explicit escape hatch plus a narrow stock drag-out eligibility rule.</p><button id="prior-art" type="button" aria-pressed="false">Show prior-art boundary</button></div>
  <div class="detail" id="prior-art-detail">tldraw already exposes frame fitting, drag-out eligibility, and reparenting primitives. SystemSketch composes those supported mechanisms rather than forking frame drag, resize, or membership behavior; the 56px fit padding simply reserves room for its existing Block header.</div>
  <h2>Proof and review</h2>
  <section class="card evidence"><b>Automated proof</b><ul><li><code>npm run test:block-fold-autosize</code>: creates real stock membership, enables both inspector choices, checks exact fold/unfold restore, moves the child through 24 rapid boundary crossings, and invokes the actual context menu.</li><li>Focused model, migration, visibility, auto-fit, and inspector tests cover persisted state and command predicates.</li><li><code>npm run check</code>: TypeScript plus the full Vitest and Python corpus passed after the capture.</li></ul></section>
  <footer>Built by <code>docs/build_block_fold_autosize.py</code> from <code>{html.escape(branch)}</code> at <code>{html.escape(head)}</code>. Both screenshots are base64 embedded, so this review file remains self-contained.</footer>
</main>
<script>
  const button = document.querySelector('#prior-art'); const detail = document.querySelector('#prior-art-detail');
  button.addEventListener('click', () => {{ const open = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(open)); button.textContent = open ? 'Hide prior-art boundary' : 'Show prior-art boundary'; detail.classList.toggle('show', open); }});
</script></html>\n"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
