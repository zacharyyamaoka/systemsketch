#!/usr/bin/env python3
"""Build the self-contained propagation-focus slider evidence gallery."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREPARED = ROOT / 'sketches/review/propagation-focus.png'
LIVE = ROOT / 'docs/assets/propagation-focus-sliders-live-2026-09-04.png'
OUT = ROOT / 'docs/propagation-focus-sliders-implementation-2026-09-04.html'


def image(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def main() -> None:
    prepared, live = image(PREPARED), image(LIVE)
    OUT.write_text(f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reachable propagation focus sliders · SystemSketch</title>
<style>
:root{{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#101827;color:#e8eef8}}
body{{max-width:1160px;margin:0 auto;padding:46px 24px 72px;line-height:1.55}}
h1{{max-width:900px;margin:.15em 0;font-size:clamp(2.25rem,6vw,4.5rem);line-height:1.03}} h2{{margin-top:2.7em}}
.eyebrow{{color:#7dd3fc;font-size:.78rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}} .lede{{max-width:760px;color:#cbd5e1;font-size:1.2rem}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}} .card{{padding:18px;border:1px solid #334155;border-radius:15px;background:#1e293b}} .card b{{color:#fff}}
.surface{{display:flex;align-items:center;justify-content:center;gap:12px;max-width:600px;margin:25px auto;padding:12px 18px;border:1px solid #475569;border-radius:14px;background:#171d28;box-shadow:0 12px 30px #0005}} .surface input{{accent-color:#3b82f6}} .surface output{{font-variant-numeric:tabular-nums}} .surface small{{color:#b5c1d2}}
img{{display:block;width:100%;border:1px solid #475569;border-radius:16px;background:#fff}} code{{color:#bae6fd}} li{{margin:.55em 0}} .quiet{{color:#94a3b8}}
</style><body>
<p class="eyebrow">Implementation gallery · 2026-09-04</p>
<h1>Reachable propagation focus sliders</h1>
<p class="lede">Focus is a temporary reading lens. Its compact local surface shows the current upstream count, an upstream range, <b>steps</b>, a downstream range, the current downstream count, and Clear—nothing else from the selection menu.</p>
<div class="surface" aria-label="Focus control anatomy"><output>1</output><input type="range" min="1" max="3" value="2" aria-label="Upstream propagation steps"><small>steps</small><input type="range" min="1" max="4" value="3" aria-label="Downstream propagation steps"><output>3</output><button>Clear</button></div>
<section class="grid"><article class="card"><b>Actual caps</b><br>Each range ends at the furthest useful graph expansion in its direction. Already-lit nodes and cables—including a selected cable's endpoints—do not create inert extra clicks.</article><article class="card"><b>Meaningful minimum</b><br>A direction with neighbours starts at <code>1</code>. A dead end is the sole <code>0</code> case: its range is disabled and announced as having no reachable steps.</article><article class="card"><b>Reading, not editing</b><br>Changing either range immediately redraws the CSS-only lens. Clear restores the normal selection menu, including Block visual modes, without serializing focus state.</article></section>
<h2>Prepared graph</h2><p>The review fixture has an upstream producer, selected join, two downstream routes, and an unrelated sentinel.</p><img alt="Prepared propagation focus review graph" src="{prepared}">
<h2>Real-browser focus proof</h2><p>The captured app shows the centered local surface in its requested order. The ordinary app chrome remains available; only the competing selection controls are absent.</p><img alt="Focused SystemSketch graph with propagation sliders" src="{live}">
<h2>Verified contract</h2><ul><li>Pure graph coverage measures deep chains and cycles, derives direction-specific limits, and clamps a reachable direction into <code>1..max</code> while preserving disabled zero-reach directions.</li><li>The browser journey verifies the exact <b>Focus</b> action, live values at the outer ends, direct keyboard slider interaction, maximum values from useful graph expansion and new evidence, local menu isolation, Clear byte stability, and a zero console-error run.</li><li>Changing a Block view after Clear and re-entering Focus proves modes remain available outside Focus and are removed only from the focused selection surface.</li></ul>
<p class="quiet">Generated from the real fixture and smoke screenshot. This branch remains uncommitted and unmerged.</p>
</body></html>''', encoding='utf-8')


if __name__ == '__main__':
    main()
