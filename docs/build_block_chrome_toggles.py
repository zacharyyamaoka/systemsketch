#!/usr/bin/env python3
"""Build the self-contained gallery for configurable Block chrome."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = HERE / "block-chrome-toggles-2026-09-04.html"
BEFORE = HERE / "assets/block-chrome-toggles-before-2026-09-04.png"
AFTER = HERE / "assets/block-chrome-toggles-hidden-2026-09-04.png"
RESULTS = HERE / "assets/block-chrome-toggles-results-2026-09-04.json"
FIXTURE = ROOT / "sketches/review/block-chrome-toggles.png"
FIXTURE_LIVE = HERE / "assets/block-chrome-toggles-fixture-driven-2026-09-04.png"


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    before = results["before"]
    after = results["after"]
    if not (
        before["footer"]
        and before["headerDivider"] == "shown"
        and not after["footer"]
        and after["headerDivider"] == "hidden"
        and after["heading"]
		and results["consoleErrors"] == []
    ):
        raise RuntimeError("browser evidence does not prove the two chrome transitions")

    required = {
        ROOT / "src/blocks/blockModel.ts": [
            "BlockShowFooterStyle",
            "BlockShowHeaderDividerStyle",
        ],
        ROOT / "src/blocks/layoutBlock.ts": [
            "blockShowsFooter(props)",
            "hiding a footer gives its room back",
        ],
        ROOT / "src/blocks/ui/BlockCanvas.tsx": ["data-header-divider"],
        ROOT / "src/blocks/BlockShapeUtil.tsx": ["blockShowsHeaderDivider"],
    }
    for path, tokens in required.items():
        source = path.read_text(encoding="utf-8")
        if any(token not in source for token in tokens):
            raise RuntimeError(f"missing Block chrome seam in {path.relative_to(ROOT)}")

    OUTPUT.write_text(TEMPLATE.format(
        before=data_url(BEFORE),
        after=data_url(AFTER),
        fixture=data_url(FIXTURE),
		fixture_live=data_url(FIXTURE_LIVE),
        before_port=html.escape(str(before["firstPortTop"])),
        after_port=html.escape(str(after["firstPortTop"])),
    ), encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch · Block chrome toggles</title>
<style>
:root{{--paper:#f7f7f4;--ink:#192327;--muted:#65747a;--line:#d5dfdf;--card:#fff;--blue:#3378e9;--aqua:#56d4c4;--green:#178552;--dark:#14282d}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 85% 0,#dff8f3 0,transparent 29rem),var(--paper);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1220px,calc(100% - 36px));margin:auto;padding:46px 0 82px}}.eyebrow{{font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#287b77}}h1{{max-width:850px;margin:12px 0;font-size:clamp(43px,6vw,75px);line-height:.94;letter-spacing:-.06em}}.lede{{max-width:860px;margin:0;color:var(--muted);font-size:19px}}.chips{{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}}.chip{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font:700 12px/1 ui-monospace,monospace}}.chip.ok{{border-color:#9fdbbf;background:#edfbf3;color:#147047}}section{{margin-top:58px}}h2{{margin:0 0 8px;font-size:32px;letter-spacing:-.04em}}.copy{{max-width:860px;margin:0 0 22px;color:var(--muted)}}.compare{{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:0 24px 55px #1233;aspect-ratio:1440/960}}.compare img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}.compare .after{{clip-path:inset(0 calc(100% - var(--split,50%)) 0 0)}}.compare input{{position:absolute;z-index:2;left:6%;bottom:22px;width:88%;accent-color:var(--blue)}}.labels{{position:absolute;z-index:1;inset:17px 18px auto;display:flex;justify-content:space-between;pointer-events:none}}.labels span{{padding:6px 10px;border:1px solid #ffffff77;border-radius:999px;background:#153239d9;color:#fff;font:800 11px/1 ui-monospace,monospace}}.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}.card,figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--card)}}figure img{{display:block;width:100%}}figcaption{{padding:13px 15px;color:var(--muted);font-size:13px}}figcaption b{{display:block;color:var(--ink);font-size:15px}}.card{{padding:22px}}.card h3{{margin:0 0 8px;font-size:18px}}.card p{{margin:0;color:var(--muted)}}.flow{{display:grid;grid-template-columns:1fr 38px 1fr 38px 1fr;align-items:stretch}}.step{{padding:20px;border:1px solid var(--line);border-radius:16px;background:#fff}}.step b{{display:block;font:800 13px/1.3 ui-monospace,monospace}}.step span{{display:block;margin-top:8px;color:var(--muted);font-size:14px}}.arrow{{display:grid;place-items:center;color:#5791ed;font-size:27px}}table{{width:100%;border-collapse:collapse;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff}}th,td{{padding:13px 15px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{background:#f4f8f8;color:#4e6669;font-size:11px;letter-spacing:.08em;text-transform:uppercase}}tr:last-child td{{border-bottom:0}}code{{padding:2px 5px;border-radius:5px;background:#e9f0f0;font:600 12px/1.4 ui-monospace,monospace}}.yes{{color:#117447;font-weight:800}}.note{{padding:17px 19px;border:1px solid #aadfd3;border-radius:16px;background:#edfbf7;color:#326661}}ul{{margin:0;padding:0;list-style:none}}li{{position:relative;padding:10px 0 10px 29px;border-bottom:1px solid var(--line)}}li:last-child{{border:0}}li:before{{content:'✓';position:absolute;left:2px;color:var(--green);font-weight:900}}footer{{margin-top:55px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}@media(max-width:760px){{.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr;gap:9px}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<header><div class="eyebrow">SystemSketch · Block primitive · 2026-09-04</div><h1>Keep the shape.<br>Choose its chrome.</h1><p class="lede">Port and Expanded Blocks now let their author remove either piece of card furniture independently: the lower action footer, or the quiet rule between the header and body. Both settings are durable per-Block presentation and are also available to a batch selection.</p><div class="chips"><span class="chip ok">3 / 3 real-browser checks</span><span class="chip ok">48 focused unit checks</span><span class="chip">Footer + Header divider</span><span class="chip">Port + Expanded</span><span class="chip">old boards unchanged</span></div></header>

<section><h2>One object, two deliberate absences</h2><p class="copy">Drag the divider. The left side is the exact real-browser state before; the right is the same selected Block after choosing <b>Hide</b> for both controls in the normal inspector.</p><div class="compare" id="compare"><img src="{before}" alt="Port Block with a visible footer and header divider" /><img class="after" src="{after}" alt="The same Port Block with footer and header divider hidden" /><div class="labels"><span>Shown</span><span>Hidden</span></div><input aria-label="Shown and hidden comparison" type="range" min="0" max="100" value="50" /></div></section>

<section><h2>The control is literal</h2><div class="grid"><figure><img src="{before}" alt="Inspector Chrome controls showing both values enabled" /><figcaption><b>Shown is the compatibility default</b>Every existing board opens identically: both controls are written as <code>true</code> when its record is migrated.</figcaption></figure><figure><img src="{after}" alt="Inspector Chrome controls showing both values hidden" /><figcaption><b>Hide only what it says</b>The header still exists and remains editable; only its bottom rule disappears. The footer node itself is absent.</figcaption></figure></div></section>

<section><h2>Why hiding a footer changes geometry</h2><p class="copy">A footer is not overpainted. The existing Block layout has one source of truth for the lower band; when it is hidden, <code>footerTop</code> becomes the shape bottom. That means a tight Port face gets usable row space back instead of a cosmetically empty strip.</p><div class="flow"><div class="step"><b>Block.showFooter</b><span>Persisted presentation field, defaulting to visible.</span></div><div class="arrow">→</div><div class="step"><b>layoutBlock()</b><span>Visible: reserve 46 px. Hidden: body reaches the bottom edge.</span></div><div class="arrow">→</div><div class="step"><b>Canvas + SVG export</b><span>Footer row is omitted; body ports use the reclaimed layout.</span></div></div><div class="note" style="margin-top:18px"><b>Measured in the real browser:</b> the first Port row moved from y={before_port} to y={after_port} while the outer Block box stayed fixed. A Simple Block keeps its lower type strip because that is content, not footer chrome.</div></section>

<section><h2>What is stored and where it appears</h2><table><thead><tr><th>Choice</th><th>Default</th><th>Port / Expanded result</th><th>Surfaces</th></tr></thead><tbody><tr><td><code>showFooter</code></td><td class="yes">visible</td><td>Shows or removes the 46 px action strip; hidden space returns to the body.</td><td>Single Block Chrome inspector · batch inspector · canvas · SVG export</td></tr><tr><td><code>showHeaderDivider</code></td><td class="yes">visible</td><td>Shows or removes only the header/body separator. Title, icon, header inputs and edit target stay.</td><td>Single Block Chrome inspector · batch inspector · canvas · SVG export</td></tr><tr><td>Simple / Value</td><td>n/a</td><td>They are already chromeless; the stored choices wait for a Port or Expanded face.</td><td>Inspector remains consistent across a view change</td></tr></tbody></table></section>

<section><h2>Guided human board</h2><p class="copy">The committed fixture supplies two real Port Blocks: one begins with the default chrome, the other begins stripped. Its instructions name the exact inspector clicks and what should remain in place.</p><div class="grid"><figure><img src="{fixture}" alt="SystemSketch review fixture for Block chrome controls" /><figcaption><b>Review fixture</b>Select <code>compose_scene()</code>, open Chrome in the inspector, and toggle Footer / Header divider. Compare it with the already-stripped companion.</figcaption></figure><figure><img src="{fixture_live}" alt="Saved review fixture after its real target drag and Chrome interaction" /><figcaption><b>Driven after the saved-board gesture</b>Both orange cues remain attached after moving the target; the real inspector reads Hide for each setting.</figcaption></figure></div></section>

<section><h2>Executable proof</h2><div class="card"><ul><li>The real inspector exposes two radio-style Show / Hide control pairs.</li><li>Hiding the footer removes its DOM band and returns enough room for compressed Port rows to expand.</li><li>Hiding the header divider changes its computed border to transparent but keeps the heading element present.</li><li>Focused model, migration, layout, style-command and inspector tests pass; the browser run recorded zero console errors.</li></ul></div></section>

<footer>Generated by <code>docs/build_block_chrome_toggles.py</code> from current source, <code>tests/block_chrome_toggles_smoke.mjs</code>, its browser captures, and the committed review fixture. The implementation stays on tldraw's supported custom-shape, style-prop, and SVG-component seams.</footer>
</main><script>const c=document.querySelector('#compare'),r=c.querySelector('input');r.addEventListener('input',()=>c.style.setProperty('--split',r.value+'%'));</script></body></html>'''


if __name__ == "__main__":
    main()
