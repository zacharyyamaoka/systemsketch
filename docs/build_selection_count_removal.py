#!/usr/bin/env python3
"""Build the self-contained review gallery for the count-free selection menu."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
OUTPUT = DOCS / 'selection-count-removal-2026-09-02.html'
RESULTS = DOCS / 'selection-count-removal-results.json'


def inline_png(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode('ascii')
    return f'data:image/png;base64,{encoded}'


def source_has(path: str, token: str) -> bool:
    return token in (ROOT / path).read_text()


def main() -> None:
    results = json.loads(RESULTS.read_text())
    checks = results['checks']
    source_guards = {
        'ordinary menu renders a selected-count chip': source_has(
            'src/chrome/SystemSketchChrome.tsx', 'systemsketch-selection-count'),
        'Block mini menu accepts a count label': source_has(
            'src/blocks/ui/BlockSelectionMiniMenu.tsx', 'selectionLabel'),
        'mixed Block scope renders a count': source_has(
            'src/blocks/ui/BlockSelectionMiniMenu.tsx', 'scopeLabel'),
        'context-menu batch labels append a count': source_has(
            'src/blocks/ui/BlockContextMenu.tsx', 'batchSuffix'),
        'batch inspector uses “Batch edit”': source_has(
            'src/blocks/ui/BlockBatchInspector.tsx', '>Batch edit<'),
        'selection identity refreshes the Block controls': source_has(
            'src/chrome/SystemSketchChrome.tsx', 'systemsketch selection identity'),
    }
    assert not source_guards['ordinary menu renders a selected-count chip']
    assert not source_guards['Block mini menu accepts a count label']
    assert not source_guards['mixed Block scope renders a count']
    assert not source_guards['context-menu batch labels append a count']
    assert source_guards['batch inspector uses “Batch edit”']
    assert source_guards['selection identity refreshes the Block controls']

    check_rows = ''.join(
        f'<li><span class="pass">PASS</span>{html.escape(check)}</li>' for check in checks
    )
    guard_rows = ''.join(
        f'<li><b>{html.escape(label)}</b><span class="value">'
        f'{"yes" if value else "no"}</span></li>'
        for label, value in source_guards.items()
    )
    menu_image = inline_png(DOCS / 'selection-count-removal-live-2026-09-02.png')
    bound_image = inline_png(DOCS / 'selection-count-removal-bound-2026-09-02.png')
    fixture = html.escape(results['board'])

    OUTPUT.write_text(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Count-free selection menu · SystemSketch</title>
<style>
:root {{ color-scheme: dark; --ink:#f5f7fb; --muted:#a8b2c4; --line:#2a3548; --panel:#141b27; --bg:#080d16; --blue:#4796ff; --green:#52d49a; --orange:#ff9d42; }}
*{{box-sizing:border-box}} body{{margin:0;background:radial-gradient(circle at 25% -20%,#173358 0,transparent 40%),var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.45}} main{{max-width:1360px;margin:auto;padding:52px 28px 70px}} .eyebrow{{color:var(--blue);font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;font-weight:750}} h1{{font-size:clamp(2rem,5vw,4.7rem);line-height:.98;letter-spacing:-.06em;max-width:900px;margin:.3rem 0 1.1rem}} .lead{{font-size:1.2rem;color:var(--muted);max-width:760px}} .hero{{display:grid;grid-template-columns:1.65fr .95fr;gap:18px;margin:38px 0}} .card{{border:1px solid var(--line);background:color-mix(in srgb,var(--panel) 94%,transparent);border-radius:18px;overflow:hidden}} .frame{{padding:12px;background:#f8f9fc}} .frame img{{display:block;width:100%;border-radius:10px}} .caption{{padding:16px 18px;color:var(--muted);font-size:.9rem}} .caption b{{color:var(--ink)}} .result{{padding:25px}} .result h2{{font-size:1.4rem;margin:0 0 12px}} .big{{color:var(--green);font-size:3.2rem;font-weight:800;line-height:1;margin:4px 0 12px}} .compare{{display:grid;grid-template-columns:1fr 34px 1fr;gap:12px;align-items:stretch;margin:24px 0}} .side{{border:1px solid var(--line);border-radius:14px;padding:18px;background:var(--panel)}} .side h3{{margin:0 0 8px}} .before h3{{color:var(--orange)}} .after h3{{color:var(--green)}} .arrow{{align-self:center;text-align:center;color:var(--blue);font-size:1.7rem}} code{{font: .9em ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b111c;padding:.15em .3em;border-radius:4px}} .proof{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}} .proof .card{{padding:22px}} ul{{padding:0;margin:0;list-style:none}} li{{padding:9px 0;border-bottom:1px solid var(--line)}} li:last-child{{border:0}} .pass{{display:inline-block;color:#04160f;background:var(--green);font-size:.7rem;font-weight:800;border-radius:99px;padding:2px 6px;margin-right:9px}} .value{{float:right;color:var(--green);font-weight:700}} .note{{margin-top:22px;padding:17px 20px;border-left:3px solid var(--blue);color:var(--muted);background:#101a2b;border-radius:0 12px 12px 0}} a{{color:#86b9ff}} @media(max-width:850px){{main{{padding:36px 16px}}.hero,.proof{{grid-template-columns:1fr}}.compare{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}} }}
</style></head><body><main>
<div class="eyebrow">SystemSketch · implementation evidence · 2026-09-02</div>
<h1>Selection tells you <em>what</em> you can do, not how many things you selected.</h1>
<p class="lead">The floating menu now begins with its actual controls. It follows FigJam’s quiet contextual-chrome convention while preserving every multi-edit action.</p>
<section class="hero"><figure class="card"><div class="frame"><img src="{menu_image}" alt="Three Blocks selected in SystemSketch with a count-free floating menu"></div><figcaption class="caption"><b>Real saved-fixture journey.</b> Three Blocks are selected; the black menu starts with S / P / E and retains Inspect, with no <code>3 selected</code> or <code>3 Blocks</code> chip.</figcaption></figure><aside class="card result"><h2>Browser result</h2><div class="big">{len(checks)}/{len(checks)}</div><p>Real-browser checks passed on the saved review board, including a bound-cue move and the Inspector state.</p><p><b>Inspector heading:</b> {html.escape(results['inspectorHeading'])}</p><p><b>Fixture:</b> <code>{fixture}</code></p></aside></section>
<section class="compare"><article class="side before"><h3>Before</h3><p>The September 1 batch-edit pass used <code>N selected</code>, and for mixed Block selections also showed <code>N Blocks</code>, to explain which subset the S / P / E controls affected.</p></article><div class="arrow">→</div><article class="side after"><h3>After</h3><p>The contextual menu is control-first. Its selected-ID identity still refreshes a Block menu when the batch changes, but the count is no longer visible. The dock says <b>Batch edit</b>.</p></article></section>
<section class="proof"><article class="card"><h2>Observed behavior</h2><ul>{check_rows}</ul></article><article class="card"><h2>Live-tree guardrails</h2><ul>{guard_rows}</ul></article></section>
<figure class="card" style="margin-top:18px"><div class="frame"><img src="{bound_image}" alt="Review-block move retaining its bound orange instruction arrow"></div><figcaption class="caption"><b>Fixture integrity.</b> The first Block was physically moved in the real app; its orange instruction arrow remained attached before the selection check ran.</figcaption></figure>
<p class="note"><b>Why the count existed:</b> it was added as batch-scope feedback during the FigJam appearance-menu implementation, especially to disambiguate a selection mixing Blocks and ordinary shapes. It also accidentally became the reactive value that refreshed a Block pill as the selection changed. The replacement is the explicit selection-identity key, so the behavior stays correct without the visual chrome.</p>
</main></body></html>''')
    print(OUTPUT)


if __name__ == '__main__':
    main()
