#!/usr/bin/env python3
"""Build the self-contained bounded-propagation-focus implementation gallery."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / 'sketches/review/propagation-focus.png'
LIVE = ROOT / 'docs/assets/propagation-focus-live-2026-09-04.png'
OUT = ROOT / 'docs/propagation-focus-implementation-2026-09-04.html'


def main() -> None:
    screenshot = 'data:image/png;base64,' + base64.b64encode(PNG.read_bytes()).decode('ascii')
    live = 'data:image/png;base64,' + base64.b64encode(LIVE.read_bytes()).decode('ascii')
    html = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bounded propagation focus · SystemSketch</title><style>:root{{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#111827;color:#edf2f7}}body{{max-width:1160px;margin:0 auto;padding:48px 24px 72px;line-height:1.55}}h1{{font-size:clamp(2.2rem,6vw,4.6rem);max-width:900px;line-height:1.02;margin:.2em 0}}h2{{margin-top:2.7em}}.eyebrow{{color:#7dd3fc;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:.78rem}}.lede{{max-width:760px;font-size:1.22rem;color:#cbd5e1}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}}.card{{background:#1e293b;border:1px solid #334155;border-radius:15px;padding:18px}}.card b{{color:#f8fafc}}.path{{overflow:auto;border-radius:18px;background:#0f172a;border:1px solid #334155;padding:18px}}img{{width:100%;display:block;border-radius:16px;border:1px solid #475569;background:#fff}}code{{color:#bae6fd}}li{{margin:.55em 0}}.quiet{{color:#94a3b8}}</style><body><p class="eyebrow">Implementation gallery · 2026-09-04</p><h1>Bounded propagation focus</h1><p class="lede">A temporary reading lens for the existing dataflow graph: select a Block/value or real cable, then independently inspect bounded upstream and downstream steps. It changes no shape, binding, selection, ordering, source semantics, or saved bytes.</p><section class="grid"><article class="card"><b>One seed, two bounds</b><br>Start at the selected host or cable. <code>← N</code> follows producers; <code>N →</code> follows consumers. Each range is capped at five whole graph steps.</article><article class="card"><b>Real graph evidence only</b><br>Each bright route has exactly one valid binding per terminal and passes the canonical scope, face, and polarity check. Half-bound, duplicate, invalid, deleted, and unresolved relations are skipped.</article><article class="card"><b>Transient by design</b><br>Only included canvas hosts receive a marker. CSS filters preserve authored opacity and stock roles; Clear, a selection change, or seed deletion removes the lens without a document write.</article></section><h2>Prepared review board</h2><p>The fixture has a producer, a selected join, two downstream fan-out routes (one async), and one unrelated Block. Orange cards give the literal gesture; the green card states the pass condition.</p><img alt="Prepared SystemSketch board for bounded propagation focus" src="{screenshot}"><h2>Live browser proof</h2><p>Focus flow leaves the selected path bright while unrelated canvas shapes visibly fade. The compact control keeps separate bounds on either side of <code>steps</code>; stock Frame and Escape keys remain untouched.</p><img alt="Live browser propagation-focus lens with unrelated shapes faded" src="{live}"><h2>Graph contract</h2><div class="path"><pre>source ── cable ── join ── cable ── render
                         └── cable ── archive

select join → Focus flow → ← 1 step · 1 step →
bright: source, join, render, archive + the three actual cables
faded: unrelated() and every unrelated canvas shape
clear: exactly the original board, byte-for-byte</pre></div><h2>Verification</h2><ul><li>Pure coverage proves asymmetric bounds, fan-in/fan-out, cycles, numeric normalization, canonical outer/inner, scope, polarity, duplicate, half-bound, effect, delayed, and async admission, plus rejection of malformed selected cables.</li><li>Real browser proof verifies stock <code>F</code> selects Frame, <code>Escape</code> is not cancelled by the lens, a selected half-bound cable has no focus control, remounted included hosts regain their marker, and unrelated updates cause neither a page scan nor a lens publish.</li><li>The fixture is authored through the real editor, cold-reopened, containment-checked, and stays byte-stable through focus interaction. The smoke is disposable and writes no repository artifact.</li></ul><p class="quiet">Review artifact: <code>sketches/review/propagation-focus.systemsketch</code>. This branch intentionally does not merge itself.</p></body></html>'''
    OUT.write_text(html, encoding='utf-8')


if __name__ == '__main__':
    main()
