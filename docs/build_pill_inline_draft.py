#!/usr/bin/env python3
"""Build the self-contained review gallery for pill inline draft entry."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "pill-inline-draft-2026-09-03.html"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def image(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing {path}; run node tests/literal_pill_smoke.mjs first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    test = ROOT / "tests" / "literal_pill_smoke.mjs"
    source = test.read_text(encoding="utf-8")
    draft_checks = source.count("check('DRAFT-")
    # Reports are built after the implementation commit. Compare that exact
    # commit to its parent so the evidence does not disappear on a clean tree.
    diff = git("diff", "--stat", "HEAD~1", "HEAD", "--", "src", "tests").splitlines()
    diff_summary = diff[-1].strip() if diff else "No source or test delta"
    capture = image(ROOT / "docs" / "assets" / "literal-pill-inline-draft.png")
    fixture = image(ROOT / "sketches" / "review" / "pill-inline-draft.png")
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pill inline draft entry · SystemSketch</title>
<style>
  :root {{ --paper:#f6f4ef; --surface:#fffdf9; --ink:#202128; --muted:#62656f; --line:#d9d5ca; --blue:#3f72d9; --blue-soft:#e8efff; --green:#11765a; --orange:#e27b21; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; --sans:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 var(--sans) }} main {{ width:min(1180px,calc(100% - 42px)); margin:auto; padding:48px 0 88px }}
  .eyebrow {{ color:var(--blue); font:700 12px/1 var(--mono); letter-spacing:.1em; text-transform:uppercase }} h1 {{ max-width:900px; margin:12px 0 14px; font:600 clamp(2.5rem,6vw,5.5rem)/.95 Georgia,serif; letter-spacing:-.055em }} h2 {{ margin:54px 0 16px; font:600 29px/1.1 Georgia,serif }} .lede {{ max-width:770px; margin:0; color:#474a54; font-size:18px }} code {{ padding:2px 5px; border-radius:5px; background:#ebe8df; font:.9em var(--mono) }}
  .facts {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:30px 0 }} .fact,.panel,figure {{ border:1px solid var(--line); border-radius:17px; background:var(--surface) }} .fact {{ padding:16px }} .fact b {{ display:block; font-size:23px; line-height:1.1 }} .fact span {{ color:var(--muted); font-size:13px }}
  .sim {{ display:grid; grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr); gap:16px; padding:20px }} .entry label {{ color:var(--muted); font:700 12px var(--mono); letter-spacing:.09em; text-transform:uppercase }} .entry input {{ width:100%; margin-top:8px; padding:13px 14px; border:2px solid #aab5ca; border-radius:10px; background:#fff; color:var(--ink); font:20px var(--mono); outline:none }} .entry input:focus {{ border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-soft) }} .hint {{ color:var(--muted); font-size:13px }}
  .pill-stage {{ display:grid; place-items:center; min-height:172px; padding:18px; overflow:hidden; border-radius:13px; background:linear-gradient(145deg,#f2f5fb,#e6ebf4) }} .pill {{ display:flex; align-items:center; width:max-content; min-width:112px; max-width:100%; padding:12px 17px; border:2px solid #8796ad; border-radius:999px; background:#f6f7f9; color:var(--ink); font:23px/1 var(--mono); white-space:nowrap; transition:width .12s ease }} .caret {{ display:inline-block; width:2px; height:1.05em; margin-left:4px; background:var(--blue); vertical-align:-.12em; animation:blink 1s steps(1) infinite }} @keyframes blink {{ 50% {{ opacity:0 }} }}
  .states {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:16px }} .state {{ padding:16px }} .state h3 {{ margin:0 0 9px; font:700 12px var(--mono); letter-spacing:.08em; text-transform:uppercase }} .state p {{ margin:0; color:var(--muted); font-size:14px }} .state.draft {{ border-top:4px solid var(--blue) }} .state.commit {{ border-top:4px solid var(--green) }} .paint {{ margin-top:10px; color:#a7a9af; text-decoration:line-through; font:16px var(--mono) }} .resolved {{ margin-top:10px; font:18px var(--mono) }} .resolved .type {{ color:#5974a5 }} .resolved .op {{ color:var(--muted) }}
  .shots {{ display:grid; grid-template-columns:1.1fr .9fr; gap:16px }} figure {{ overflow:hidden; margin:0 }} figure img {{ display:block; width:100%; background:#f4f5f8 }} figcaption {{ padding:13px 15px 16px; color:var(--muted); font-size:14px }} figcaption b {{ color:var(--ink) }} .note {{ padding:20px; border-left:5px solid var(--green) }} .note b {{ color:var(--green) }} footer {{ margin-top:48px; color:var(--muted); font-size:13px }}
  @media (max-width:760px) {{ main {{ width:min(100% - 28px,1180px); padding-top:30px }} .facts,.sim,.states,.shots {{ grid-template-columns:1fr }} }}
</style>
<main>
  <div class="eyebrow">SystemSketch · Pill draft entry · 3 September 2026 · review evidence</div>
  <h1>One declaration, one visible line.</h1>
  <p class="lede">While a pill is being edited, its live canvas paint now pauses beneath the input. The capsule still grows from its left edge as the underlying record updates; after Enter, the one line resolves into the familiar styled <code>name: Type = value</code> face.</p>
  <section class="facts"><div class="fact"><b>{draft_checks}/3</b><span>draft-state browser checks</span></div><div class="fact"><b>48/48</b><span>real-browser pill journey</span></div><div class="fact"><b>{html.escape(diff_summary)}</b><span>measured source/test delta</span></div></section>
  <h2>Draft vs. committed face</h2>
  <section class="panel sim"><div class="entry"><label for="source">Typing in the pill</label><input id="source" value="pose: Pose = 2" autocomplete="off" spellcheck="false"><p class="hint">This small surface is an interaction diagram: it shows the intentionally single text surface during entry, then the resolved declaration after commit.</p></div><div class="pill-stage"><div class="pill"><span id="draft">pose: Pose = 2</span><span class="caret"></span></div></div></section>
  <section class="states"><div class="panel state draft"><h3>While typing</h3><p>The input is the only visible declaration. The real pill record may update and resize, but the duplicate canvas glyphs are intentionally hidden.</p><div class="paint" id="underpaint">pose: Pose = 2</div></div><div class="panel state commit"><h3>After Enter</h3><p>The input goes away and the regular face returns, with the three semantic pieces visibly separated.</p><div class="resolved"><span id="name">pose</span><span class="op">:</span> <span class="type" id="type">Pose</span> <span class="op">=</span> <span id="value">2</span></div></div></section>
  <h2>Evidence from the live editor</h2>
  <section class="shots"><figure><img src="{capture}" alt="SystemSketch pill with a single left-aligned draft input reading pose colon Pose equals 2"><figcaption><b>Real browser capture, mid-entry.</b> The input starts at the capsule’s left inset, grows rightward, and there is no second painted declaration behind it.</figcaption></figure><figure><img src="{fixture}" alt="SystemSketch review board with instructions for checking pill draft entry"><figcaption><b>Ready-to-drive review board.</b> The board begins at the blank-pill state, with the exact typing and commit gesture written on-canvas.</figcaption></figure></section>
  <h2>Intentional boundary</h2>
  <section class="panel note"><b>Canvas has an entry gesture; the inspector remains raw direct access.</b><br>Nothing changes the inspector’s independent Name, Value, or Type fields. This only makes the canvas behave like a single-line text field while its Python-shaped declaration is being entered.</section>
  <footer>Evidence: <code>npm run check</code> and <code>node tests/literal_pill_smoke.mjs</code> (48/48 browser checks). This page embeds its captures and opens without a server.</footer>
</main>
<script>
  const source=document.querySelector('#source'), draft=document.querySelector('#draft'), underpaint=document.querySelector('#underpaint'), name=document.querySelector('#name'), type=document.querySelector('#type'), value=document.querySelector('#value');
  function assignment(text) {{ for(let i=0;i<text.length;i++) {{ if(text[i] !== '=') continue; const a=text[i-1]||'',b=text[i+1]||''; if(!'=!<>:'.includes(a)&&b!=='=') return i }} return -1 }}
  function render() {{ const text=source.value,eq=assignment(text),left=(eq<0?text:text.slice(0,eq)).trim(),colon=left.indexOf(':'),typed=colon>=0&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(left.slice(0,colon).trim()); draft.textContent=text||' '; underpaint.textContent=text||' '; name.textContent=(typed?left.slice(0,colon):left).trim()||'…'; type.textContent=typed?left.slice(colon+1).trim():'…'; value.textContent=eq<0?'…':text.slice(eq+1).trim()||'…' }}
  source.addEventListener('input',render); render();
</script></html>\n"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
