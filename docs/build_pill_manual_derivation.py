#!/usr/bin/env python3
"""Build the self-contained manual-pill-derivation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "pill-manual-derivation-2026-09-03.html"


def data_url(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Missing {path}; run npm run test:pill first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def checks() -> tuple[int, int]:
    rows = json.loads((ASSETS / "literal-pill.json").read_text(encoding="utf-8"))
    focused = [row for row in rows if row["id"].startswith("FEED-")]
    return sum(row["ok"] for row in focused), len(focused)


def build() -> str:
    passed, total = checks()
    head = git("rev-parse", "--short", "HEAD")
    source_delta = git("diff", "--stat", "HEAD", "--", "src", "tests").splitlines()
    delta = source_delta[-1] if source_delta else "No source/test delta measured"
    inspector = data_url("literal-pill-fed-inspector.png")
    canvas = data_url("literal-pill-fed.png")
    return """<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manual pill derivation · SystemSketch</title>
<style>
  :root{{--paper:#f5f3ee;--card:#fffdfa;--ink:#282726;--muted:#6d6b68;--line:#dad6cd;--green:#16775b;--blue:#396eb8;--amber:#bb7514;--sans:Inter,ui-sans-serif,system-ui,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}}main{{max-width:1180px;margin:auto;padding:52px 24px 88px}}.kicker{{color:var(--blue);font:700 12px var(--mono);letter-spacing:.1em;text-transform:uppercase}}h1{{max-width:900px;margin:12px 0 14px;font:600 clamp(2.8rem,6vw,5.5rem)/.95 Georgia,serif;letter-spacing:-.06em}}h2{{margin:54px 0 16px;font:600 29px/1.05 Georgia,serif}}.lede{{max-width:830px;color:#4d4b48;font-size:19px}}.facts,.path,.shots{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:30px 0}}.fact,.card,figure{{border:1px solid var(--line);border-radius:17px;background:var(--card)}}.fact{{padding:17px}}.fact b{{display:block;font:700 24px var(--mono)}}.fact span{{color:var(--muted);font-size:13px}}.path{{grid-template-columns:1fr 36px 1fr 36px 1fr;align-items:stretch}}.card{{padding:20px}}.card h3{{margin:0 0 9px;font:600 18px/1.15 Georgia,serif}}.card p{{margin:0;color:var(--muted)}}.arrow{{display:grid;place-items:center;color:var(--amber);font:32px/1 var(--mono)}}.pill{{display:inline-flex;align-items:center;gap:7px;margin:14px 0 0;padding:9px 13px;border:2px solid #a3a7ac;border-radius:999px;background:#f6f6f5;font:18px var(--mono)}}.wire{{height:2px;margin:25px -20px 0;background:linear-gradient(90deg,#8a9cba 0 47%,transparent 47% 52%,#8a9cba 52% 100%)}}.manual{{border-left:5px solid var(--green);padding:20px 22px}}.manual b{{color:var(--green)}}.manual code{{background:#edf3ef;color:#265c4a}}code{{padding:2px 5px;border-radius:5px;background:#ece8e0;font:.9em var(--mono)}figure{{overflow:hidden;margin:0}}figure img{{display:block;width:100%;background:#f5f7f9}}figcaption{{padding:12px 15px 16px;color:var(--muted);font-size:14px}}figcaption b{{color:var(--ink)}}.shots{{grid-template-columns:repeat(2,minmax(0,1fr))}}footer{{margin-top:52px;color:var(--muted);font-size:13px}}@media(max-width:760px){{.facts,.path,.shots{{grid-template-columns:1fr}}.arrow{{min-height:25px;transform:rotate(90deg)}}h1{{font-size:3rem}}}}
</style><main>
<div class="kicker">SystemSketch · Preference implemented · 3 September 2026 · __HEAD__</div>
<h1>Wires connect ideas.<br>Pills keep their own words.</h1>
<p class="lede">A cable reaching a Value pill is now structural information, not an instruction to replace its literal or type. The author can leave an intentionally contradictory sketch intact, edit every pill field, and selectively ask for the connected type when that is useful.</p>
<section class="facts"><div class="fact"><b>__PASSED__/__TOTAL__</b><span>focused real-browser wired-pill checks</span></div><div class="fact"><b>Manual</b><span>default literal and type behavior</span></div><div class="fact"><b>__DELTA__</b><span>measured source/test delta</span></div></section>
<h2>One relationship, two intentional moves</h2>
<section class="path"><article class="card"><h3>1 · Draw the cable</h3><p>The pill remains a normal whiteboard object. The connection is visible and live, but the pill still shows and accepts its authored value.</p><div class="pill">quality = 0.8</div><div class="wire"></div></article><div class="arrow" aria-hidden="true">→</div><article class="card"><h3>2 · Stay manual</h3><p>The canvas and inspector preserve the literal and type—even if they disagree with a nearby source. This makes an incomplete or deliberately non-programmatic sketch legal.</p><div class="pill">quality = 0.8</div></article><div class="arrow" aria-hidden="true">→</div><article class="card"><h3>3 · Ask for the type</h3><p><b>Adopt cable type</b> is an explicit, undoable calculation. It changes the inspector’s Type field only when asked, and is searchable in the command palette.</p><div class="pill">quality = 0.8</div></article></section>
<h2>The preference behind it</h2><section class="card manual"><b>Whiteboard hackability</b><br>Prefer editable, literal board records over automatic derivation. Helpful calculations should be explicit commands, never a silent side effect of drawing a cable. The board may intentionally be incomplete, inconsistent, or ahead of the rules.</section>
<h2>Proof from the running editor</h2><section class="shots"><figure><img src="__INSPECTOR__" alt="A selected connected pill with editable Value and Type fields plus an Adopt cable type button"><figcaption><b>Connected inspector.</b> Value remains editable; the available button makes the one optional derivation clear.</figcaption></figure><figure><img src="__CANVAS__" alt="A wired SystemSketch Value pill whose authored text remains visible"><figcaption><b>Connected canvas.</b> The pill’s own text stays painted rather than changing to a derived placeholder.</figcaption></figure></section>
<footer>Evidence: <code>npm run test:pill</code> (__PASSED__/__TOTAL__ focused wired-pill checks), focused Vitest coverage, and the exported-pill regression. This document embeds its browser captures and opens without a server.</footer>
</main></html>""".replace("__HEAD__", html.escape(head)).replace("__PASSED__", str(passed)).replace("__TOTAL__", str(total)).replace("__DELTA__", html.escape(delta)).replace("__INSPECTOR__", inspector).replace("__CANVAS__", canvas).replace("{{", "{").replace("}}", "}")


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
