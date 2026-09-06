#!/usr/bin/env python3
"""Build the self-contained Block inset-background implementation gallery."""

from __future__ import annotations

import base64
from pathlib import Path


HERE = Path(__file__).resolve().parent
SCREENSHOT = HERE / "assets" / "block-inset-background-live-2026-09-05.png"
OUTPUT = HERE / "block-inset-background-2026-09-05.html"


def main() -> None:
    screenshot = base64.b64encode(SCREENSHOT.read_bytes()).decode("ascii")
    OUTPUT.write_text(TEMPLATE.replace("__SCREENSHOT__", screenshot), encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch · Block inset background</title>
<style>
  :root{color-scheme:dark;--bg:#080b10;--panel:#111722;--line:#293243;--ink:#f5f7fa;--muted:#a4afc0;--blue:#4f8cff;--green:#69d18e;--white:#fbfbfc;--well:#edf1f4;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}body{margin:0;color:var(--ink);background:radial-gradient(circle at 82% 0,rgba(79,140,255,.19),transparent 32rem),var(--bg)}
  main{width:min(1160px,calc(100% - 32px));margin:auto;padding:48px 0 72px}.eyebrow{color:#82adff;font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}
  h1{max-width:900px;margin:14px 0 12px;font-size:clamp(42px,7vw,76px);line-height:.98;letter-spacing:-.055em}.lede{max-width:820px;margin:0;color:#c8d0dc;font-size:18px;line-height:1.58}
  .facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0 44px}.fact{padding:16px;border:1px solid var(--line);border-radius:14px;background:rgba(17,23,34,.9)}.fact b{display:block;font-size:24px}.fact span{color:var(--muted);font-size:12px}
  section{margin-top:48px}h2{margin:0 0 10px;font-size:30px;letter-spacing:-.035em}.copy{max-width:820px;margin:0 0 22px;color:var(--muted);line-height:1.65}
  .demo{display:grid;grid-template-columns:320px 1fr;gap:26px;align-items:start;padding:26px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(145deg,#151c29,#0e141e)}
  .controls{display:grid;gap:12px}.label{color:var(--muted);font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px}button{padding:11px;border:1px solid #445067;border-radius:9px;background:#192231;color:var(--ink);font:750 13px inherit;cursor:pointer}button[aria-pressed=true]{border-color:var(--blue);background:var(--blue)}
  .block{overflow:hidden;border:1px solid #d9dde3;border-radius:11px;background:var(--white);box-shadow:0 20px 46px rgba(0,0,0,.28);color:#222}.block.gray{background:var(--well)}.header,.footer{background:var(--white)}.header{display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e2e5e9;font:600 19px ui-monospace,monospace}.header small{color:#747b86;font:500 12px Inter,sans-serif}.members{display:grid;gap:10px;padding:10px}.member{height:98px;padding:12px;border:1px solid #dde1e6;border-radius:8px;background:var(--white);box-shadow:0 1px 2px rgba(0,0,0,.08)}.member b{display:block;font:600 16px ui-monospace,monospace}.member span{display:block;margin-top:28px;color:#777f8a;font-size:11px}.footer{height:34px;border-top:1px solid #e2e5e9}
  .rule{margin-top:16px;padding:14px 16px;border-left:3px solid var(--green);background:rgba(105,209,142,.08);color:#d8e0ea;line-height:1.55}
  figure{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:#edf0f3;box-shadow:0 28px 70px rgba(0,0,0,.33)}figure img{display:block;width:100%;height:auto}figcaption{padding:13px 16px;background:var(--panel);color:var(--muted);font-size:12px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{padding:18px;border:1px solid var(--line);border-radius:15px;background:var(--panel)}.card b{display:block;margin-bottom:8px}.card p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.check:before{content:'✓';margin-right:8px;color:var(--green)}
  code{color:#91b8ff}footer{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  @media(max-width:800px){.facts,.grid{grid-template-columns:repeat(2,1fr)}.demo{grid-template-columns:1fr}.controls{order:2}}@media(max-width:520px){main{width:min(100% - 20px,1160px)}.facts,.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · implemented surface choice · 2026-09-05</div>
  <h1>Inset cards, with just enough contrast.</h1>
  <p class="lede">Expanded Blocks now keep white as the fast default and offer one deliberate alternative: <b>Soft gray</b>. It colors only the exposed well behind inset member cards, preserving the white header, footer, and children.</p>
  <div class="facts"><div class="fact"><b>2</b><span>clear choices</span></div><div class="fact"><b>white</b><span>default remains unchanged</span></div><div class="fact"><b>theme-aware</b><span>existing sunken-surface token</span></div><div class="fact"><b>8 / 8</b><span>real-browser checks</span></div></div>

  <section>
    <h2>Try the actual visual rule</h2>
    <p class="copy">This miniature uses the same separation: the selected background belongs to the parent’s inset well, never to the member cards. Edge-to-edge ignores the choice because there is no exposed well to paint.</p>
    <div class="demo">
      <div class="controls"><div class="label">Inset background</div><div class="buttons"><button id="white" aria-pressed="true">White</button><button id="gray" aria-pressed="false">Soft gray</button></div><div class="rule">The choice is presentation only. It adds containment contrast without claiming warning, status, type, or flow semantics.</div></div>
      <div class="block" id="block"><div class="header">Class <small>Definition</small></div><div class="members"><div class="member"><b>__init__()</b><span>Initialize the instance</span></div><div class="member"><b>__call__()</b><span>Run the instance</span></div></div><div class="footer"></div></div>
    </div>
  </section>

  <section id="proof">
    <h2>Proven in the real editor</h2>
    <p class="copy">The browser journey loads the generated review fixture, selects the parent Block, presses Soft gray, crosses through Edge-to-edge and back, restores White, and undoes the last choice. Geometry and stock parent membership remain unchanged.</p>
    <figure><img alt="SystemSketch showing an Expanded Class Block with a soft-gray inset member well and the White and Soft gray inspector buttons" src="data:image/png;base64,__SCREENSHOT__" /><figcaption>Live headless-Chrome capture: the gray is visible around and below the white child cards; the inspector shows Soft gray selected.</figcaption></figure>
  </section>

  <section>
    <h2>Guardrails carried by the implementation</h2>
    <div class="grid"><div class="card check"><b>Default-safe migration</b><p>Existing boards migrate to <code>white</code>, so opening a document never changes its appearance.</p></div><div class="card check"><b>Mode-scoped paint</b><p>The data attribute and CSS apply only when the Block is Expanded and its member layout is Inset.</p></div><div class="card check"><b>Choice is remembered</b><p>Switching to Edge-to-edge temporarily hides the treatment; returning to Inset restores it.</p></div><div class="card check"><b>Theme-native gray</b><p>The well uses <code>--ss-surface-sunken</code>, so light, dark, VS Code, and Obsidian palettes remain coherent.</p></div><div class="card check"><b>Export parity</b><p>SVG export paints the same body interval while leaving header and footer white.</p></div><div class="card check"><b>One undo step</b><p>Each background press is one ordinary Block detail mutation with normal tldraw history behavior.</p></div></div>
  </section>
  <footer>SystemSketch · Block inset-background implementation · generated from measured browser evidence</footer>
</main>
<script>
  const block=document.querySelector('#block'),white=document.querySelector('#white'),gray=document.querySelector('#gray');
  function choose(value){block.classList.toggle('gray',value==='gray');white.setAttribute('aria-pressed',String(value==='white'));gray.setAttribute('aria-pressed',String(value==='gray'))}
  white.addEventListener('click',()=>choose('white'));gray.addEventListener('click',()=>choose('gray'));
</script>
</body>
</html>'''


if __name__ == "__main__":
    main()
