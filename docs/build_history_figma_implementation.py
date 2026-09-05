#!/usr/bin/env python3
"""Build the self-contained Figma-style history implementation gallery."""

from __future__ import annotations

import base64
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "history-figma-implementation-2026-09-04.html"
CAPTURES = (
    ("Top-right entry", "Compare is where sharing and review already live—not a floating canvas control.", "history-figma-trigger-in-shell.png"),
    ("One board-history language", "Measured revisions stay in a Figma-like rail: current is fixed as after; an older revision is before.", "history-figma-board-rail.png"),
    ("Details remain optional", "The disclosure keeps a short scanning label while offering the longer diff-derived explanation when it earns space.", "history-figma-element-tab.png"),
    ("A reversible dock", "Properties and Code can move as one panel to the bottom without losing the selected version or active tab.", "history-figma-dock-bottom.png"),
    ("Code has equal standing", "The bottom-docked panel preserves the Code tab, not just a properties-only fallback.", "history-figma-dock-bottom-code.png"),
)


def image(filename: str) -> str:
    return "data:image/png;base64," + base64.b64encode((DOCS / "assets" / filename).read_bytes()).decode("ascii")


def card(title: str, detail: str, filename: str) -> str:
    return f'''<article class="capture"><img src="{image(filename)}" alt="{escape(title)} — real browser capture"><div><span class="kicker">REAL BROWSER EVIDENCE</span><h3>{escape(title)}</h3><p>{escape(detail)}</p></div></article>'''


def build() -> str:
    cards = "".join(card(*capture) for capture in CAPTURES)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Figma-style history implementation · SystemSketch</title>
<style>
:root{{--ink:#172034;--muted:#586477;--paper:#f3f5f8;--card:#fff;--line:#d9e0e9;--blue:#2f80ed;--navy:#12223b;--mint:#43c59e;--orange:#ef9b45}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 20% 0,#dcecff,transparent 35%),var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:58px 0 82px}}.eyebrow,.kicker{{font:800 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;color:#2671d4}}.hero{{display:grid;grid-template-columns:1.4fr .8fr;gap:40px;align-items:end;margin:18px 0 48px}}h1{{font:800 clamp(42px,7vw,78px)/.91 Georgia,serif;letter-spacing:-.055em;margin:0;max-width:800px}}h2{{font:750 clamp(27px,4vw,42px)/1 Georgia,serif;letter-spacing:-.035em;margin:62px 0 14px}}h3{{font-size:20px;line-height:1.1;margin:7px 0}}p{{margin:0;color:var(--muted)}}.lede{{font-size:20px;max-width:750px;margin-top:22px}}.outcome{{border-radius:18px;padding:22px;background:var(--navy);color:white;box-shadow:0 19px 40px #1720342d}}.outcome b{{display:block;color:var(--mint);font-size:12px;letter-spacing:.12em}}.outcome p{{color:#dce8f7;margin-top:8px}}.facts{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}.fact{{border:1px solid var(--line);background:var(--card);border-radius:14px;padding:18px}}.fact b{{display:block;font:800 31px/1 Georgia,serif}}.fact span{{font-size:13px;color:var(--muted)}}.flow{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}}.step{{min-height:183px;border:1px solid var(--line);background:var(--card);border-radius:15px;padding:18px}}.step i{{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--blue);color:white;font:700 13px ui-monospace,monospace;font-style:normal}}.step h3{{margin-top:19px}}.step p{{font-size:13px}}.captures{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}.capture{{overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--card);box-shadow:0 8px 24px #1720340c}}.capture:first-child{{grid-column:span 2}}.capture img{{display:block;width:100%;background:#e9eef5}}.capture>div{{padding:17px 19px 20px}}.capture p{{font-size:14px}}.truth{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.truth article{{border-radius:16px;padding:22px;border:1px solid var(--line);background:var(--card)}}.truth .honest{{border-top:5px solid var(--orange)}}.truth .shared{{border-top:5px solid var(--mint)}}.seams{{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}}.seams code{{padding:7px 10px;border-radius:99px;background:#e4efff;color:#245caa;font-size:12px}}.test{{margin-top:18px;padding:18px 20px;border-radius:14px;background:#182840;color:#e4efff;font:13px/1.6 ui-monospace,SFMono-Regular,monospace;overflow:auto}}a{{color:#1768ca}}footer{{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}}@media(max-width:800px){{main{{width:min(100% - 24px,1180px);padding-top:38px}}.hero,.truth{{grid-template-columns:1fr}}.facts{{grid-template-columns:repeat(2,1fr)}}.flow{{grid-template-columns:1fr 1fr}}.captures{{grid-template-columns:1fr}}.capture:first-child{{grid-column:auto}}}}
</style></head><body><main>
<div class="eyebrow">SYSTEMSKETCH · IMPLEMENTATION GALLERY · 04 SEPTEMBER 2026</div>
<section class="hero"><div><h1>History that reads once, in two places.</h1><p class="lede">The selected Figma direction gives board comparison and an individual Block the same compact revision language, then lets the diff detail move from the right edge to a Figma-like bottom dock.</p></div><aside class="outcome"><b>SHIPPED ON MAIN</b><p>Top-right Compare entry · shared history component · per-Block History tab · right/bottom dock with state preservation · honest local-file history.</p></aside></section>
<section class="facts"><div class="fact"><b>2</b><span>surfaces using one history language</span></div><div class="fact"><b>3</b><span>measured revision entries in the guided fixture</span></div><div class="fact"><b>18/18</b><span>Figma browser-journey checks green</span></div><div class="fact"><b>1298</b><span>Vitest checks green in the merged tree</span></div></section>
<h2>One reading loop</h2><section class="flow"><article class="step"><i>1</i><h3>Enter</h3><p>Open Compare in the top-right review/share shell.</p></article><article class="step"><i>2</i><h3>Choose</h3><p>Pick an earlier, diff-measured version as <em>before</em>.</p></article><article class="step"><i>3</i><h3>Scan</h3><p>Read short titles and relative times in the compact rail.</p></article><article class="step"><i>4</i><h3>Inspect</h3><p>Select an edited element for Properties or Code evidence.</p></article><article class="step"><i>5</i><h3>Reframe</h3><p>Dock the same panel at the bottom and continue without resetting context.</p></article></section>
<h2>Rendered proof</h2><p>These five captures are embedded in this page: it remains useful even when a development server is gone.</p><section class="captures">{cards}</section>
<h2>Truthful by construction</h2><section class="truth"><article class="honest"><span class="kicker">WHAT EXISTS TODAY</span><h3>Local snapshots, file times, and an actual diff</h3><p>SystemSketch has no persisted author identity or commit-message ledger. The history UI therefore never invents people or prose: its short labels are derived from file differences, timestamps are from the real local files, and the current board stays explicitly marked as <em>after</em>.</p></article><article class="shared"><span class="kicker">THE REUSABLE SEAM</span><h3>One component, board and Block</h3><p>The board-level Compare rail and the Block inspector's History tab consume the same history model and visual component. A Block with no earlier state can say so honestly rather than imitating a project timeline it does not possess.</p></article></section>
<div class="seams"><code>src/history/HistoryList.tsx</code><code>src/history/boardHistory.ts</code><code>src/history/ElementHistoryPanel.tsx</code><code>src/compare/CompareDialog.tsx</code><code>src/blocks/ui/BlockInspector.tsx</code></div>
<pre class="test">npm run check                              ✓ 131 test files · 1298 tests<br>node tests/compare_history_figma_smoke.mjs  ✓ 18/18 real-browser checks<br>main                                         ✓ Figma implementation + retained-review cache isolation</pre>
<footer>Source: <a href="build_history_figma_implementation.py">gallery builder</a> · guided board: <a href="../sketches/review/history-figma.systemsketch">history-figma.systemsketch</a> · <a href="../README.md">project README</a></footer>
</main></body></html>'''


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
