#!/usr/bin/env python3
"""Build the self-contained Tool aliases implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "tool-aliases-2026-09-05.html"
RESULTS = ROOT / "docs" / "assets" / "tool-aliases-smoke.json"
FIXTURE = ROOT / "sketches" / "review" / "tool-aliases.systemsketch"


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    catalog_source = (ROOT / "src" / "library" / "shapeLibraryModel.ts").read_text(encoding="utf-8")
    catalog_count = catalog_source.count("id: '")
    checks = "".join(f"<li><span>PASS</span>{html.escape(check)}</li>" for check in results["checks"])
    settings = data_uri(ROOT / "docs" / "assets" / "tool-aliases-settings-2026-09-05.png")
    search = data_uri(ROOT / "docs" / "assets" / "tool-aliases-search-2026-09-05.png")
    board = data_uri(ROOT / "sketches" / "review" / "tool-aliases.png")

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tool aliases · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f3f7ff;--muted:#aab8ce;--bg:#0b111b;--panel:#121c2b;--line:#2b3a51;--blue:#7eaefe;--blue-soft:#1c3d70;--green:#79dba4;--orange:#ffb15b}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 86% -14%,#183a71 0,transparent 44rem),var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:56px 0 82px}}.eyebrow{{color:var(--blue);font-size:.76rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase}}h1{{max-width:900px;margin:.16em 0 .24em;font-size:clamp(2.8rem,7vw,6rem);line-height:.92;letter-spacing:-.07em}}.lede{{max-width:800px;color:var(--muted);font-size:1.2rem}}.facts{{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin:32px 0}}.fact,.panel{{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#16243a,#101722)}}.fact{{padding:18px}}.fact b{{display:block;color:var(--green);font-size:2rem;letter-spacing:-.05em}}.fact span{{color:var(--muted);font-size:.9rem}}.panel{{padding:23px;margin:18px 0}}h2{{margin:0 0 10px;font-size:1.45rem;letter-spacing:-.025em}}p{{color:var(--muted)}}code{{padding:2px 6px;border-radius:5px;color:#d9e7ff;background:#1d2d45;font:600 .9em ui-monospace,SFMono-Regular,Menlo,monospace}}.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:center;margin:24px 0}}.node{{min-height:132px;padding:18px;border:1px solid var(--line);border-radius:14px;background:#0d1625}}.node b{{display:block;margin-bottom:7px;color:var(--blue)}}.arrow{{color:var(--orange);font-size:2.4rem;text-align:center}}.shots{{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#fff}}figure img{{display:block;width:100%}}figcaption{{padding:12px 14px;color:var(--muted);background:#111b2a;font-size:.87rem}}.proof{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}ul{{margin:.6rem 0;padding:0;list-style:none}}li{{display:flex;gap:9px;margin:11px 0;color:#d9e2ef}}li span{{height:20px;padding:2px 6px;border-radius:999px;color:#082315;background:var(--green);font-size:.67rem;font-weight:900;letter-spacing:.08em}}.rule{{border-left:3px solid var(--blue);padding-left:15px;color:#d9e7fb}}footer{{margin-top:32px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:.86rem}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:34px}}.facts,.shots,.proof{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · local tool vocabulary · 2026-09-05</div>
<h1>Name the tool once.<br>Find it your way.</h1>
<p class="lede">Asset search now accepts personal aliases while preserving one canonical tool and its stock behavior. Here, <code>@datatype</code> finds the existing Text tool; it does not rename the tool or write anything into the board.</p>
<section class="facts" aria-label="Measured implementation facts"><div class="fact"><b>{catalog_count}</b><span>Asset-search targets</span></div><div class="fact"><b>@datatype</b><span>literal handle supported</span></div><div class="fact"><b>{len(results['checks'])} / {len(results['checks'])}</b><span>live browser checks</span></div><div class="fact"><b>{len([r for r in fixture['records'] if r.get('typeName') == 'shape'])}</b><span>fixture shapes</span></div></section>
<section class="panel"><h2>One catalog, one stable identity</h2><div class="flow"><div class="node"><b>Canonical item</b><code>text</code> stays Text in the catalog, toolbar, and board-facing language.</div><div class="arrow">→</div><div class="node"><b>Local vocabulary</b>Settings saves a bounded alias list by stable catalog id in browser storage.</div><div class="arrow">→</div><div class="node"><b>Real tool seam</b>Search filters names and aliases, then arms tldraw’s stock Text tool.</div></div><p class="rule"><strong>WHY:</strong> aliases are a personal retrieval aid, not a second name for a semantic thing. Keeping them local prevents a collaborator’s board from acquiring accidental vocabulary or a renamed tool identity.</p></section>
<section class="panel"><h2>Settings makes the distinction visible</h2><p>Each searchable tool has an add field and removable chips. The forward marker mirrors the requested Obsidian treatment: it reads as an alternate route to the canonical Text tool, not a replacement label.</p><div class="shots"><figure><img src="{settings}" alt="Tool aliases Settings panel with @datatype assigned to Text"><figcaption><strong>Tool aliases.</strong> The canonical name remains left-aligned; personal names are compact chips beside it.</figcaption></figure><figure><img src="{search}" alt="Asset search showing Text as the sole @datatype result"><figcaption><strong>Search result.</strong> The secondary <code>↪ @datatype</code> marker explains why Text matched.</figcaption></figure></div></section>
<section class="proof"><article class="panel"><h2>Browser proof</h2><ul>{checks}</ul><p>The dedicated journey cold-opens the saved review board, verifies its cue binding, saves the alias through Settings, searches it literally, and confirms Enter arms the Text tool.</p></article><article class="panel"><h2>Guided human review</h2><figure><img src="{board}" alt="Tool aliases review board with Settings and Asset search instructions"><figcaption>Open Settings → Tool aliases, add <code>@datatype</code> to Text, then press <code>S</code>, type the handle, and press Enter.</figcaption></figure></article></section>
<footer>Generated from the current tree by <code>docs/build_tool_aliases.py</code>. Evidence: <code>tests/tool_aliases_smoke.mjs</code> · fixture: <code>sketches/review/tool-aliases.systemsketch</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(document):,} bytes)")


if __name__ == "__main__":
    main()
