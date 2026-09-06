#!/usr/bin/env python3
"""Build the self-contained gallery for the combined generic-Block candidate."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "generic-block-integrated-2026-09-05.html"


def data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    board = data_uri(ROOT / "sketches" / "review" / "generic-block-integrated.png")
    journey = data_uri(DOCS / "assets" / "generic-block-integrated-live-2026-09-05.png")
    OUTPUT.write_text(
        TEMPLATE.replace("__BOARD__", board).replace("__JOURNEY__", journey),
        encoding="utf-8",
    )
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Integrated generic Block candidate</title>
<style>
:root{color-scheme:dark;--bg:#080b10;--panel:#111722;--panel2:#171e2a;--line:#2b3545;--ink:#f5f7fa;--muted:#a7b1c1;--blue:#4f8cff;--green:#65d68a;--orange:#ff9838;--well:#e9edf0;--card:#fff;--dark:#172033;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:radial-gradient(circle at 82% -10%,#1c315e 0,transparent 34rem),var(--bg)}main{width:min(1260px,calc(100% - 32px));margin:auto;padding:54px 0 82px}.eyebrow{color:#86b0ff;font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}h1{max-width:1040px;margin:15px 0 16px;font-size:clamp(46px,7vw,84px);line-height:.94;letter-spacing:-.06em}.lede{max-width:900px;margin:0;color:#c6ceda;font-size:19px;line-height:1.62}.status{display:flex;flex-wrap:wrap;gap:9px;margin:25px 0 46px}.pill{padding:8px 11px;border:1px solid var(--line);border-radius:99px;background:#101620;color:var(--muted);font:700 12px/1 ui-monospace,monospace}.pill.ok{border-color:#275d3c;background:#10291c;color:#82e3a3}section{margin-top:52px}h2{margin:0 0 10px;font-size:31px;letter-spacing:-.04em}.copy{max-width:850px;margin:0 0 22px;color:var(--muted);line-height:1.65}.demo{display:grid;grid-template-columns:330px 1fr;gap:24px;align-items:start;padding:24px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(145deg,#141b27,#0e141d)}.controls{display:grid;gap:17px}.control b{display:block;margin-bottom:8px;color:#dbe1e9;font-size:12px;letter-spacing:.05em;text-transform:uppercase}.buttons{display:flex;gap:7px}.buttons button{flex:1;padding:9px;border:1px solid #3a4659;border-radius:8px;background:#182130;color:#bdc7d6;font:700 12px inherit;cursor:pointer}.buttons button[aria-pressed=true]{border-color:var(--blue);background:var(--blue);color:#fff}.mini{overflow:hidden;border:1px solid #ccd2da;border-radius:10px;background:var(--card);color:#222;box-shadow:0 28px 70px #0006}.miniHeader{position:relative;display:flex;min-height:54px;align-items:center;padding:0 18px;border-bottom:1px solid #dce0e5;background:#fff}.identity{display:flex;align-items:center;gap:8px;font:650 22px ui-monospace,monospace}.identity small{font:500 12px Inter,sans-serif;color:#707986}.mini.center .identity{position:absolute;left:50%;transform:translateX(-50%)}.fold{margin-left:auto;border:0;background:transparent;color:#68717e;font-size:23px}.mini.leftFold .fold{order:-1;margin:0 9px 0 0}.body{display:grid;gap:10px;padding:10px;background:#fff}.mini.gray .body{background:var(--well)}.member{height:100px;padding:13px;border:1px solid #d8dde3;border-radius:8px;background:#fff;font:600 18px ui-monospace,monospace;box-shadow:0 1px 2px #0001}.mini.edge .body{gap:0;padding:0}.mini.edge .member{border-radius:0;border-width:0 0 1px}.footer{height:34px;border-top:1px solid #dce0e5;background:#fff}.mini.noFooter .footer{display:none}.mini.noDivider .miniHeader{border-bottom-color:transparent}.mini.folded .body,.mini.folded .footer{display:none}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.fact{padding:17px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.fact strong{display:block;font-size:24px}.fact span{display:block;margin-top:4px;color:var(--muted);font-size:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{padding:18px;border:1px solid var(--line);border-radius:15px;background:var(--panel)}.card b{display:block;margin-bottom:8px}.card p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.card b:before{content:'✓';margin-right:8px;color:var(--green)}figure{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:19px;background:#eef1f4;box-shadow:0 26px 64px #0006}figure img{display:block;width:100%;height:auto}figcaption{padding:13px 16px;background:var(--panel);color:var(--muted);font-size:12px}.proofs{display:grid;grid-template-columns:1fr 1fr;gap:18px}.boundary{margin-top:48px;padding:20px 22px;border:1px solid #745029;border-radius:15px;background:#251b11;color:#e9c89f;line-height:1.6}.boundary strong{color:#ffb66e}code{color:#95baff}footer{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:900px){.demo,.proofs{grid-template-columns:1fr}.facts,.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){main{width:min(100% - 20px,1260px)}.facts,.grid{grid-template-columns:1fr}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · combined candidate · 05 September 2026</div>
<h1>One Block. All the useful choices, composed.</h1>
<p class="lede">The previously separate Block and Port tracks now run together in one candidate build and one real board. The result keeps the fast generic Block underneath every preset: coherent defaults first, a small set of meaningful switches, and deeper text editing only where the reliable stock surface already exists.</p>
<div class="status"><span class="pill ok">8 / 8 integrated browser checks</span><span class="pill ok">1,399 unit checks</span><span class="pill">stock tldraw 5.3.2 seams</span><span class="pill">not merged into main</span></div>

<section><h2>The control model, in miniature</h2><p class="copy">This interactive diagram mirrors the decisions on the real Block. It is intentionally a finite composition of useful policies rather than a general styling engine.</p><div class="demo"><div class="controls">
<div class="control"><b>Header</b><div class="buttons"><button data-group="align" data-value="left">Left</button><button data-group="align" data-value="center" aria-pressed="true">Centered</button></div></div>
<div class="control"><b>Fold control</b><div class="buttons"><button data-group="foldSide" data-value="left">Left</button><button data-group="foldSide" data-value="right" aria-pressed="true">Right</button><button data-action="fold">Fold</button></div></div>
<div class="control"><b>Members</b><div class="buttons"><button data-group="layout" data-value="inset" aria-pressed="true">Inset</button><button data-group="layout" data-value="edge">Edge-to-edge</button></div></div>
<div class="control"><b>Inset background</b><div class="buttons"><button data-group="background" data-value="white">White</button><button data-group="background" data-value="gray" aria-pressed="true">Soft gray</button></div></div>
<div class="control"><b>Chrome</b><div class="buttons"><button data-action="divider" aria-pressed="true">Divider</button><button data-action="footer" aria-pressed="true">Footer</button></div></div>
</div><div class="mini center gray" id="mini"><div class="miniHeader"><div class="identity"><span>▣</span><span>CardGame</span><small>Type</small></div><button class="fold" aria-label="Fold preview">›</button></div><div class="body"><div class="member">parse_frame</div><div class="member">render_turn</div></div><div class="footer"></div></div></div></section>

<section><h2>What is integrated</h2><div class="facts"><div class="fact"><strong>1 record</strong><span>ordinary Block props, not new preset objects</span></div><div class="fact"><strong>2 layouts</strong><span>Inset or Edge-to-edge members</span></div><div class="fact"><strong>2 surfaces</strong><span>whole-header alignment and selected-text editing</span></div><div class="fact"><strong>1 stock fit</strong><span>paint-only live preview, stock settle on release</span></div></div></section>

<section><div class="grid"><div class="card"><b>Header composition</b><p>Left or true-center identity; icon, title, and Draft badge move together. A right-side fold keeps Type beside the title.</p></div><div class="card"><b>Independent folding</b><p>Enable folding and choose its left or right corner. The disclosure control never becomes part of centered identity.</p></div><div class="card"><b>Continuous auto-fit</b><p>Held movement previews the fit without document writes; release delegates the final bounds to stock tldraw.</p></div><div class="card"><b>Stable child selection</b><p>A selected parent followed by an immediate child drag transfers ownership to the child only and preserves membership.</p></div><div class="card"><b>Composable menus</b><p>One item registry plus ordered recipes serves Text, Geo, connectors, and Block titles; stock range editing receives matching dark chrome.</p></div><div class="card"><b>Ports and chrome</b><p>Floating Ports move on the first press, keep their wires, and coexist with footer, divider, member-layout, and gray-inset choices.</p></div></div></section>

<section><h2>Review evidence</h2><p class="copy">The fixture was generated through the real editor, cold-reopened, visually inspected, then driven in Chromium. The live journey deliberately combines the old failure modes rather than checking each feature in isolation.</p><div class="proofs"><figure><img alt="Guided SystemSketch board showing the integrated generic Block, its children, floating Port, live cable, and numbered review cues" src="__BOARD__"><figcaption>Guided review fixture: one parent, two real child Blocks, one free Port, one live cable, five gestures, and a visible PASS condition.</figcaption></figure><figure><img alt="Real Chromium capture after the integrated generic Block journey" src="__JOURNEY__"><figcaption>Real-app capture after child-first drag, continuous fit, title-menu activation, connected-Port movement, and fold/unfold.</figcaption></figure></div></section>

<aside class="boundary"><strong>Integration boundary:</strong> this is a single reconciled candidate branch based on main at <code>1d0313b</code>. It has not been merged into <code>main</code>; the review board exists so that landing remains a separate, informed decision.</aside>
<footer>SystemSketch · generic Block integrated candidate · generated from the committed fixture and browser evidence</footer>
</main><script>
const mini=document.querySelector('#mini');const groups={align:'center',foldSide:'right',layout:'inset',background:'gray'};
function render(){mini.classList.toggle('center',groups.align==='center');mini.classList.toggle('leftFold',groups.foldSide==='left');mini.classList.toggle('edge',groups.layout==='edge');mini.classList.toggle('gray',groups.background==='gray'&&groups.layout==='inset');for(const b of document.querySelectorAll('[data-group]'))b.setAttribute('aria-pressed',String(groups[b.dataset.group]===b.dataset.value))}
for(const b of document.querySelectorAll('[data-group]'))b.addEventListener('click',()=>{groups[b.dataset.group]=b.dataset.value;render()});
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',()=>{const a=b.dataset.action;if(a==='fold'){mini.classList.toggle('folded');b.textContent=mini.classList.contains('folded')?'Open':'Fold';return}const cls=a==='footer'?'noFooter':'noDivider';mini.classList.toggle(cls);b.setAttribute('aria-pressed',String(!mini.classList.contains(cls)))});render();
</script></body></html>'''


if __name__ == "__main__":
    main()
