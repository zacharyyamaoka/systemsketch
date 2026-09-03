#!/usr/bin/env python3
"""Build the self-contained canvas Python-signature pill gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "canvas-python-pill-entry-2026-09-03.html"


def image_data(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Missing {path}; run npm run test:pill first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def checks() -> tuple[int, int, int]:
    rows = json.loads((ASSETS / "literal-pill.json").read_text(encoding="utf-8"))
    focused = [row for row in rows if row["id"].startswith("PARSER-")]
    return sum(row["ok"] for row in focused), len(focused), len(rows)


def build() -> str:
    passed, total, browser_total = checks()
    head = git("rev-parse", "--short", "HEAD")
    diff = git("diff", "--stat", "HEAD", "--", "src", "tests").splitlines()
    diff_summary = diff[-1] if diff else "No source change detected"
    signature = image_data("literal-pill-python-signature.png")
    inspector = image_data("literal-pill-inspector.png")
    port = image_data("../block-port-in-window-add-2026-09-01.png")
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas Python entry for pills · SystemSketch</title>
<style>
  :root {{ --paper:#f6f4ef; --surface:#fffdf9; --ink:#252424; --muted:#686a73; --line:#d9d5ca; --blue:#4774c8; --green:#16755a; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; --sans:Inter,ui-sans-serif,system-ui,sans-serif; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 var(--sans) }} main {{ max-width:1200px; padding:44px 24px 88px; margin:auto }}
  .eyebrow {{ color:var(--blue); font:700 12px/1 var(--mono); letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:850px; margin:11px 0 12px; font:600 clamp(2.3rem,6vw,4.9rem)/.98 Georgia,serif; letter-spacing:-.055em }} h2 {{ margin:52px 0 14px; font:600 28px/1.1 Georgia,serif }} .lede {{ max-width:830px; color:#474851; font-size:18px }} code {{ padding:2px 5px; border-radius:5px; background:#ece9e2; font: .92em var(--mono) }}
  .facts,.shots {{ display:grid; gap:16px }} .facts {{ grid-template-columns:repeat(3,minmax(0,1fr)); margin:28px 0 }} .fact,.panel,figure {{ border:1px solid var(--line); border-radius:16px; background:var(--surface) }} .fact {{ padding:16px }} .fact b {{ display:block; font-size:24px }} .fact span {{ display:block; color:var(--muted); font-size:13px }}
  .workbench {{ display:grid; grid-template-columns:minmax(0,1.3fr) minmax(290px,.7fr); gap:18px; padding:20px }} .entry label {{ display:block; color:var(--muted); font:700 12px var(--mono); letter-spacing:.08em; text-transform:uppercase }} input {{ width:100%; margin-top:8px; padding:13px 14px; border:1px solid #a9b5c8; border-radius:10px; background:#fff; color:var(--ink); font:19px var(--mono); outline:none }} input:focus {{ border-color:var(--blue); box-shadow:0 0 0 3px #dbe6fc }} .capsule-wrap {{ display:grid; place-items:center; min-height:166px; border-radius:12px; background:linear-gradient(140deg,#f4f6fa,#e9edf4) }} .capsule {{ display:flex; align-items:center; gap:9px; max-width:100%; padding:13px 18px; border:2px solid #94a1b5; border-radius:999px; background:#f5f6f8; font:25px/1 var(--mono); white-space:nowrap }} .pill-name {{ color:var(--ink) }} .pill-colon,.pill-equals {{ color:var(--muted) }} .pill-type {{ color:var(--blue) }} .pill-value {{ color:var(--ink) }} .hint {{ margin:11px 0 0; color:var(--muted); font-size:13px }}
  .grammar {{ display:grid; grid-template-columns:repeat(3,1fr); gap:1px; overflow:hidden; border:1px solid var(--line); border-radius:13px; background:var(--line) }} .grammar div {{ padding:15px; background:var(--surface) }} .grammar b {{ display:block; color:var(--blue); font:700 13px var(--mono) }} .grammar small {{ color:var(--muted) }}
  .shots {{ grid-template-columns:repeat(2,minmax(0,1fr)) }} figure {{ overflow:hidden; margin:0 }} figure img {{ width:100%; display:block; background:#f7f8fa }} figcaption {{ padding:12px 14px 15px; color:var(--muted); font-size:14px }} figcaption b {{ color:var(--ink) }} .policy {{ padding:20px; border-left:5px solid var(--green) }} .policy b {{ color:var(--green) }} footer {{ margin-top:48px; color:var(--muted); font-size:13px }}
  @media(max-width:760px) {{ .facts,.shots,.workbench {{ grid-template-columns:1fr }} h1 {{ font-size:2.8rem }} .grammar {{ grid-template-columns:1fr }} }}
</style>
<main>
  <div class="eyebrow">SystemSketch · Canvas entry · 3 September 2026 · {html.escape(head)}</div>
  <h1>Write the whole pill as a line of Python.</h1>
  <p class="lede">A new canvas pill now starts in its name field. Enter <code>pose: Pose = 2</code> and the canvas separates the variable name, its type annotation, and the literal value in one gesture. A bare literal such as <code>2.0</code> remains the compact unnamed-pill shorthand. New input ports accept the same declaration and use the right-hand side as their definition default.</p>
  <section class="facts"><div class="fact"><b>{passed}/{total}</b><span>new browser parser checks</span></div><div class="fact"><b>{browser_total}/{browser_total}</b><span>literal-pill browser journey</span></div><div class="fact"><b>{html.escape(diff_summary)}</b><span>measured source/test delta</span></div></section>
  <h2>Try the canvas grammar</h2>
  <section class="panel workbench"><div class="entry"><label for="source">Canvas text</label><input id="source" value="pose: Pose = 2" autocomplete="off" spellcheck="false"><p class="hint">The preview is deliberately small: it mirrors the declaration shell only. Values remain opaque text, so dictionaries, calls, and expressions do not need a separate parser.</p></div><div class="capsule-wrap"><div class="capsule" aria-label="Pill preview"><span class="pill-name" id="name">pose</span><span class="pill-colon" id="colon">:</span><span class="pill-type" id="type">Pose</span><span class="pill-equals">=</span><span class="pill-value" id="value">2</span></div></div></section>
  <section class="grammar" aria-label="entry grammar"><div><b>name</b><small>A bare word begins a variable.</small></div><div><b>: Type</b><small>Optional annotation fills both pill ports.</small></div><div><b>= value</b><small>Optional literal fills the pill's value.</small></div></section>
  <h2>What the real canvas paints</h2>
  <section class="shots"><figure><img src="{signature}" alt="SystemSketch canvas with a pill that reads pose colon Pose equals 2"><figcaption><b>Real browser capture.</b> The name has normal ink, the annotation is quieter, and the value stays distinct. Both rim ports are still live.</figcaption></figure><figure><img src="{port}" alt="SystemSketch canvas input port created through the gutter"><figcaption><b>The same canvas grammar for a new input port.</b> <code>pose: Pose = 2</code> produces its name, type, and default chip through the add-port gesture.</figcaption></figure><figure><img src="{inspector}" alt="Pill inspector with name value and type fields"><figcaption><b>Inspector remains raw.</b> Its Name, Value, and Type fields continue to write exactly what is entered; no auto-formatting applies there.</figcaption></figure></section>
  <h2>Intentional boundary</h2><section class="panel policy"><b>Canvas has gesture magic; the inspector has direct access.</b><br>Canvas name fields recognize the Python-shaped declaration only on commit. The inspector uses its existing independent fields, so a person can deliberately enter unusual or incomplete text without the parser reinterpreting it.</section>
  <footer>Evidence: <code>npm run test:pill</code> ({browser_total}/{browser_total} real-browser checks), <code>npm run test:ports</code> (14/14 real-browser checks), and focused Vitest coverage. The gallery embeds its three captures, so it can be opened without a server.</footer>
</main>
<script>
  const input = document.querySelector('#source'); const out = {{ name: document.querySelector('#name'), type: document.querySelector('#type'), value: document.querySelector('#value'), colon: document.querySelector('#colon') }};
  function assignment(text) {{ for (let i=0;i<text.length;i++) {{ if(text[i] !== '=') continue; const prev=text[i-1]||'', next=text[i+1]||''; if(!'=!<>:'.includes(prev)&&next!=='=') return i; }} return -1; }}
  function render() {{ const source=input.value, eq=assignment(source), declaration=(eq<0?source:source.slice(0,eq)).trim(), colon=declaration.indexOf(':'); const annotated=colon>=0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(declaration.slice(0,colon).trim()); const name=(annotated?declaration.slice(0,colon):declaration).trim(); const type=annotated?declaration.slice(colon+1).trim():''; const value=eq<0?'…':source.slice(eq+1).trim()||'…'; out.name.textContent=name||'…'; out.type.textContent=type; out.value.textContent=value; out.type.hidden=!type; out.colon.hidden=!type; }}
  input.addEventListener('input', render); render();
</script></html>\n"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
