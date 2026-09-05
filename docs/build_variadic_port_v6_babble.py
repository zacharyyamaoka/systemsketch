#!/usr/bin/env python3
"""Build the self-contained V6 Babble comparison from real browser captures."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'variadic-port-v6-babble-2026-09-03.html'
BOARD = ROOT / 'sketches' / 'review' / 'variadic-port-v5.systemsketch'


def image_data(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def score(value: int) -> str:
    return '<span class="score" aria-label="%d out of 5">%s</span>' % (value, '●' * value + '○' * (5 - value))


VARIANTS = [
    {
        'id': 1,
        'name': 'Continuous inward rail',
        'thesis': 'A one-pixel spine links the existing ports; a tiny arrowhead at each port points into the Block and the one label occupies the middle ordinary-port slot.',
        'canvas': 'The least new language: it reads as a connection between independently cableable sockets.',
        'inspector': 'Quiet disclosure. The exceptional setting stays out of the ordinary name/type rhythm until it is needed.',
        'best': 'Best when a compact call face must keep its ordinary-port cadence.',
        'lose': 'The group boundary is intentionally subtle at a distance.',
        'scores': (5, 5, 4, 5, 4),
    },
    {
        'id': 2,
        'name': 'Capped socket family',
        'thesis': 'Terminal caps make the rail look like a single contained family, while every arrow still points inward and the label keeps a normal baseline.',
        'canvas': 'Most explicit group outline without inventing a collector port.',
        'inspector': 'Visible signature card. Role, label, and bundle are open together when creating the uncommon slot.',
        'best': 'Best when rapid scanning of dense, adjacent groups beats visual quietness.',
        'lose': 'The cap and inspector card bring the most extra chrome.',
        'scores': (5, 5, 5, 3, 3),
    },
    {
        'id': 3,
        'name': 'Dotted continuity',
        'thesis': 'A dashed spine supplies the lightest possible grouping punctuation; solid inward arrows preserve the direction at the sockets themselves.',
        'canvas': 'The most recessive rail; it does not compete with cable paths.',
        'inspector': 'Role-led strip. The grammar choice reads before the group spelling.',
        'best': 'Best when an already-busy board needs the grouping to recede.',
        'lose': 'At low zoom the dotted spine may under-signal the family.',
        'scores': (5, 4, 3, 5, 4),
    },
    {
        'id': 4,
        'name': 'DEF-rooted rail',
        'thesis': 'The group label takes the first ordinary-port box and the rail descends from it, prioritising source-order signature reading over vertical centring.',
        'canvas': 'Most literal translation of a Python definition signature.',
        'inspector': 'Formal-parameter mini-form. It clearly separates grammar selection from naming the formal.',
        'best': 'Best when the UI should foreground definition order.',
        'lose': 'The label is no longer optically centred across a multi-slot run.',
        'scores': (4, 5, 4, 4, 3),
    },
    {
        'id': 5,
        'name': 'Yoke ladder',
        'thesis': 'A stronger bracket-and-ladder frame makes the run unmistakable while keeping the centre label in the exact normal-port position.',
        'canvas': 'Strongest family recognition without adding a synthetic endpoint.',
        'inspector': 'Tucked inline editor. The rare escape hatch stays compact, but all role, label, and bundle controls remain live.',
        'best': 'Best when runs appear beside many normal ports and must read in one glance.',
        'lose': 'The canvas frame has more visual weight than the continuous rail.',
        'scores': (5, 5, 5, 3, 5),
    },
]


def card(variant: dict) -> str:
    variant_id = variant['id']
    canvas = image_data(ROOT / 'docs' / 'assets' / f'variadic-port-v6-canvas-v{variant_id}.png')
    inspector = image_data(ROOT / 'docs' / 'assets' / f'variadic-port-v6-inspector-v{variant_id}.png')
    live = f'http://127.0.0.1:4930/?board={BOARD.as_posix()}&variadicPrototype={variant_id}'
    return f'''
      <article class="variant" id="v{variant_id}" data-variant="v{variant_id}">
        <header>
          <span class="index">V{variant_id}</span>
          <div><h3>{html.escape(variant['name'])}</h3><p>{html.escape(variant['thesis'])}</p></div>
          <button class="pick" type="button" data-pick="v{variant_id}">Pick / splice</button>
        </header>
        <div class="screens">
          <figure><figcaption><b>Actual canvas</b><span>{html.escape(variant['canvas'])}</span></figcaption><img src="{canvas}" alt="Actual SystemSketch canvas, V{variant_id}" loading="lazy"></figure>
          <figure><figcaption><b>Actual inspector</b><span>{html.escape(variant['inspector'])}</span></figcaption><img src="{inspector}" alt="Actual SystemSketch inspector, V{variant_id}" loading="lazy"></figure>
        </div>
        <div class="tradeoffs"><p><b>Favors</b> {html.escape(variant['best'])}</p><p><b>Costs</b> {html.escape(variant['lose'])}</p><a href="{html.escape(live, quote=True)}">Open V{variant_id} live on the review board ↗</a></div>
      </article>'''


def matrix_row(variant: dict) -> str:
    total = sum(weight * value / 5 for weight, value in zip((35, 25, 20, 15, 5), variant['scores']))
    cells = ''.join(f'<td>{score(value)} <small>{value}/5</small></td>' for value in variant['scores'])
    return f'<tr><th>V{variant["id"]} · {html.escape(variant["name"])}</th>{cells}<td><b>{total:.0f}</b>/100</td></tr>'


def main() -> None:
    cards = ''.join(card(variant) for variant in VARIANTS)
    rows = ''.join(matrix_row(variant) for variant in VARIANTS)
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>V6 variadic port cadence — Babble &amp; Prune</title>
<style>
:root{{--ink:#1d1e22;--muted:#646978;--paper:#f5f6f8;--panel:#fff;--line:#d9dde5;--accent:#1976d2;--green:#1c8a5b;--orange:#d86d1f;--serif:Georgia,serif;--sans:Inter,ui-sans-serif,system-ui,sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 var(--sans)}}.wrap{{max-width:1540px;margin:auto;padding:28px 24px 96px}}.hero{{padding:24px 0 34px;border-bottom:1px solid var(--line)}}.eyebrow{{color:var(--accent);font:700 11px/1 var(--mono);letter-spacing:.11em;text-transform:uppercase}}h1{{max-width:1100px;margin:10px 0;font:500 clamp(36px,5vw,66px)/.96 var(--serif);letter-spacing:-.045em}}.lede{{max-width:980px;margin:0;color:#4a5060;font-size:18px}}.chips{{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}}.chip{{padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font:700 11px/1.1 var(--mono)}}section{{margin-top:36px}}h2{{margin:0 0 8px;font:500 32px/1.1 var(--serif)}}.intro{{margin:0 0 16px;color:var(--muted)}}.contract{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}.box{{padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}}.box h3{{margin:0 0 8px;font-size:13px}}.box ul{{margin:0;padding-left:18px;color:#414754;font-size:13px}}.criteria{{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}}.criterion{{padding:12px;border:1px solid var(--line);border-radius:8px;background:#fafbfc;font-size:12px}}.criterion b{{display:block;color:var(--accent);font:800 18px/1 var(--mono)}}.variant{{margin:22px 0;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 8px 26px #26334d0b}}.variant header{{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:18px 18px 14px;border-bottom:1px solid var(--line)}}.index{{display:grid;width:39px;height:39px;place-items:center;border-radius:50%;background:#eaf3ff;color:#166ac0;font:800 13px/1 var(--mono)}}.variant h3{{margin:0 0 4px;font-size:18px}}.variant header p{{max-width:900px;margin:0;color:var(--muted);font-size:13px}}button,.tradeoffs a{{border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);cursor:pointer;font:650 12px/1 var(--sans);text-decoration:none}}.pick{{padding:8px 10px}}.variant.is-picked{{border-color:var(--accent);box-shadow:0 0 0 3px #1976d226,0 10px 30px #26334d12}}.variant.is-picked .pick{{border-color:var(--accent);background:var(--accent);color:#fff}}.screens{{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}}figure{{min-width:0;margin:0;background:#f7f8fa}}figcaption{{min-height:70px;padding:12px 14px;background:#fff;color:var(--muted);font-size:12px}}figcaption b{{display:block;margin-bottom:3px;color:var(--ink);font-size:13px}}figure img{{display:block;width:100%;height:auto}}.tradeoffs{{display:grid;grid-template-columns:1fr 1fr auto;gap:16px;align-items:center;padding:13px 18px;color:#59606c;font-size:12px}}.tradeoffs p{{margin:0}}.tradeoffs b{{color:var(--ink)}}.tradeoffs a{{padding:8px 10px;white-space:nowrap}}.matrix{{overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff}}table{{width:100%;min-width:1000px;border-collapse:collapse}}th,td{{padding:11px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;font-size:12px;vertical-align:middle}}th{{background:#f9fafb}}tr:last-child>*{{border-bottom:0}}th:last-child,td:last-child{{border-right:0}}td small{{color:var(--muted);font:10px var(--mono)}}.score{{color:var(--orange);letter-spacing:1px;white-space:nowrap}}.recommend{{display:grid;grid-template-columns:auto 1fr;gap:15px;padding:20px;border:1px solid #a8cce9;border-radius:10px;background:#edf7ff}}.recommend strong{{font:800 18px/1.2 var(--serif)}}.recommend p{{margin:4px 0 0;color:#485261;font-size:13px}}.notice{{padding:14px 16px;border-left:3px solid var(--orange);background:#fff9f4;color:#5e5349;font-size:13px}}.dock{{position:fixed;right:18px;bottom:18px;max-width:420px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#fffffff2;box-shadow:0 12px 34px #26334d22;font-size:12px}}.dock b{{display:block}}.dock span{{color:var(--muted)}}@media(max-width:900px){{.contract,.screens,.tradeoffs{{grid-template-columns:1fr}}.criteria{{grid-template-columns:repeat(2,1fr)}}.variant header{{grid-template-columns:auto 1fr}}.pick{{grid-column:2}}.dock{{left:12px;right:12px;max-width:none}}}}
</style></head><body><main class="wrap">
<header class="hero"><div class="eyebrow">Babble &amp; Prune · live renderer proof</div><h1>Variadic ports should still feel like ports.</h1><p class="lede">Five actual SystemSketch paint states for the same saved <code>*args</code>/<code>**kwargs</code> board. Each keeps the single DEF-owned label, physical cable endpoints, normal 18px port typography, and inward-facing socket arrows. Only the surrounding connective grammar and the rare inspector surface vary.</p><div class="chips"><span class="chip">same board</span><span class="chip">single label only</span><span class="chip">no file-format change</span><span class="chip">10 real-browser captures</span><span class="chip">prototype branch only</span></div></header>
<section><h2>Fixed before comparison</h2><p class="intro">These are gates, not options to trade away.</p><div class="contract"><div class="box"><h3>Invariant contract</h3><ul><li>One group spelling only: <code>*overlays</code> or <code>**options</code>.</li><li>Each source expression remains a normal, independently cableable input port.</li><li>The socket cue points inward; it never implies an outbound cable.</li><li>No board schema or authoring gesture changes in this review.</li></ul></div><div class="box"><h3>Evidence</h3><ul><li>Each card embeds actual headless-Chrome captures of the identical review board.</li><li>Browser proof checked two group labels, six socket teeth, unchanged controls, and no duplicated type token in every mode.</li><li>The live link opens the actual renderer on this isolated review track.</li></ul></div></div></section>
<section><h2>What to judge</h2><div class="criteria"><div class="criterion"><b>35%</b>Normal port cadence</div><div class="criterion"><b>25%</b>Inward socket semantics</div><div class="criterion"><b>20%</b>Dense-run legibility</div><div class="criterion"><b>15%</b>Visual quietness</div><div class="criterion"><b>5%</b>Rare inspector authoring</div></div></section>
<section><h2>Unranked live atlas</h2><p class="intro">The five are deliberately shown in prototype order. Click “Pick / splice” as you inspect; no app state is changed.</p>{cards}</section>
<section><h2>Prune after looking</h2><p class="intro">Weighted only after the visual comparison. Scores are an explicit design read, not a substitute for your judgment.</p><div class="matrix"><table><thead><tr><th>Direction</th><th>Cadence<br><small>35%</small></th><th>Inward semantics<br><small>25%</small></th><th>Run legibility<br><small>20%</small></th><th>Quietness<br><small>15%</small></th><th>Inspector<br><small>5%</small></th><th>Total</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><div class="recommend"><span class="index">↳</span><div><strong>AI splice: V1 canvas rail + V5 tucked inspector.</strong><p>V1 most faithfully fulfils the “looks exactly like a port” request: the label uses the middle normal port box and the rail is only a connection. V5’s inspector is the best companion because this metadata is rare and still fully authorable. Keep V2’s terminal cap in reserve if dense boards prove the V1 rail too quiet.</p></div></div></section>
<section><div class="notice"><b>Decision hinge.</b> The one useful question is whether a dense call face needs an explicit bounded family at a glance. If yes, take V2’s cap; if not, V1 is the most disciplined expression of the chosen model.</div></section>
</main><aside class="dock"><b id="picked">No direction picked</b><span id="picked-detail">Pick a card to record the direction you want to splice.</span></aside><script>for(const b of document.querySelectorAll('[data-pick]'))b.onclick=()=>{{for(const c of document.querySelectorAll('.variant'))c.classList.remove('is-picked');const c=b.closest('.variant');c.classList.add('is-picked');document.getElementById('picked').textContent=c.querySelector('h3').textContent+' selected';document.getElementById('picked-detail').textContent='Tell me what to splice—e.g. “V1 rail, V5 inspector.”';c.scrollIntoView({{behavior:'smooth',block:'center'}})}};</script></body></html>'''
    OUT.write_text(page, encoding='utf-8')
    print(OUT)


if __name__ == '__main__':
    main()
