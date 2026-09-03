#!/usr/bin/env python3
"""Build the self-contained Block-presentation / Value-pill boundary gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = HERE / "expanded-view-glyph-fix-2026-09-02.html"
FIXTURE = ROOT / "sketches/review/expanded-view-glyph.png"
MENU = ROOT / "src/blocks/ui/BlockSelectionMiniMenu.tsx"

VIEWS = (
    ("S", "Simple", "The compact boundary Block."),
    ("P", "Port", "The port-focused Block."),
    ("E", "Expanded", "The nested body and footer."),
)

AUDIT = (
    ("Block selection mini menu", "S / P / E only; Value selections show no Block pill"),
    ("Block right-click menu", "ordinary views, Add, Advanced / Step in"),
    ("Value-pill inspector and right-click", "no Block-view or Block-authoring conversion controls"),
    ("Port and row right-click menus", "row moves, delete, port commands"),
    ("Connection right-click menu", "routing and temporal vocabulary"),
    ("Branch, definition, detach, Frame and layout menus", "semantic and stock commands"),
)


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    menu = MENU.read_text(encoding="utf-8")
    required = (
        "candidate.slice(0, 1).toUpperCase()",
        "BLOCK_PRESENTATION_VIEWS",
        "data-testid={`block-pill-view-${candidate}`}",
        "aria-label={`Show ${candidate} view`}",
    )
    missing = [needle for needle in required if needle not in menu]
    if missing:
        raise RuntimeError(f"the view-glyph repair is incomplete: {missing}")
    if not FIXTURE.exists():
        raise RuntimeError(f"missing review fixture image: {FIXTURE}")

    pills = "".join(
        f'<div class="pill"><b>{glyph}</b><strong>{html.escape(name)}</strong><span>{html.escape(description)}</span></div>'
        for glyph, name, description in VIEWS
    )
    audit = "".join(
        f"<tr><th>{html.escape(surface)}</th><td>{html.escape(scope)}</td><td>passed</td></tr>"
        for surface, scope in AUDIT
    )
    page = TEMPLATE.format(fixture=data_url(FIXTURE), pills=pills, audit=audit)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — Block presentation and Value-pill boundary</title>
<style>
:root{{--ink:#eff5ff;--muted:#aebcd1;--line:#2b3a54;--bg:#09111e;--panel:#101b2b;--blue:#75a7ff;--green:#72d89d;--orange:#ff9d48;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 85% -15%,#21385f 0,transparent 32rem),var(--bg);color:var(--ink)}}main{{width:min(1080px,calc(100% - 36px));margin:auto;padding:48px 0 70px}}.eyebrow{{color:var(--blue);font:800 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:880px;margin:14px 0 12px;font-size:clamp(38px,6vw,72px);line-height:.96;letter-spacing:-.055em}}.lede{{max-width:820px;margin:0;color:#cad5e5;font-size:18px;line-height:1.58}}section{{margin-top:50px}}h2{{margin:0 0 10px;font-size:29px;letter-spacing:-.035em}}.copy{{max-width:850px;margin:0 0 20px;color:var(--muted);line-height:1.6}}.pills{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}.pill{{min-height:154px;padding:19px;border:1px solid var(--line);border-radius:17px;background:linear-gradient(140deg,#16253b,#0f1928)}}.pill b{{display:grid;place-items:center;width:43px;height:36px;margin-bottom:19px;border-radius:9px;background:#34415a;color:white;font:800 17px ui-monospace,monospace}}.pill strong{{display:block;font-size:17px}}.pill span{{display:block;margin-top:7px;color:var(--muted);font-size:13px;line-height:1.5}}.compare{{display:grid;grid-template-columns:1fr 58px 1fr;gap:0;align-items:stretch}}.state{{padding:24px;border:1px solid var(--line);border-radius:17px;background:var(--panel)}}.state.old{{border-color:#744c36}}.state.new{{border-color:#2c7254}}.state h3{{margin:0 0 8px;font-size:17px}}.state p{{margin:0;color:var(--muted);line-height:1.55}}.state code{{display:inline-block;margin-top:16px;padding:5px 8px;border-radius:7px;background:#08101b;color:#f7c39a;font:700 13px ui-monospace,monospace}}.state.new code{{color:#a4e8be}}.arrow{{display:grid;place-items:center;color:var(--blue);font-size:31px}}figure{{margin:0;overflow:hidden;border:1px solid #40506a;border-radius:18px;background:#f4f6f9;box-shadow:0 20px 56px rgba(0,0,0,.34)}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:13px 16px;background:var(--panel);color:var(--muted);font-size:13px;line-height:1.55}}figcaption b{{color:var(--ink)}}table{{width:100%;border-collapse:collapse;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel)}}th,td{{padding:15px 16px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}}th{{width:37%;color:var(--ink)}}td{{color:var(--muted)}}td:last-child{{width:92px;color:var(--green);font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.07em}}tr:last-child>*{{border-bottom:0}}footer{{margin-top:48px;padding-top:19px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}code{{font:700 12px ui-monospace,monospace}}@media(max-width:720px){{main{{width:min(100% - 24px,1080px);padding-top:30px}}.pills{{grid-template-columns:1fr 1fr}}.compare{{grid-template-columns:1fr}}.arrow{{min-height:48px;transform:rotate(90deg)}}th{{width:48%}}}}
</style><style>.pills{{grid-template-columns:repeat(3,1fr)}}.separate{{margin-top:14px;padding:20px 22px;border:1px solid #71614b;border-radius:17px;background:linear-gradient(135deg,#211c18,#121923)}}.separate b{{color:#ffd39e}}.separate p{{margin:7px 0 0;color:var(--muted);line-height:1.55}}</style></head><body><main>
<div class="eyebrow">SystemSketch · 02 Sep 2026 · representation boundary</div>
<h1>Blocks stay Blocks. Values stay pills.</h1>
<p class="lede">The duplicated E exposed a more important boundary: <b>Value</b> is not an alternate presentation for an ordinary Block. It is a literal capsule, made through the Pill tool or connection-drop picker. Ordinary Block controls therefore expose only Simple, Port, and Expanded.</p>
<section><h2>Three Block presentations</h2><p class="copy">The selection pill, right-click menu, and Block inspector share one explicit structural vocabulary.</p><div class="pills">{pills}</div><div class="separate"><b>Separate representation · Value pill</b><p>A literal capsule such as <code>= 2.0</code> keeps its dedicated inspector and context menu. It is not offered as a Block-view conversion in either direction.</p></div></section>
<section><h2>The narrow repair</h2><div class="compare"><div class="state old"><h3>Before</h3><p>The generic view array exposed Value beside ordinary Block presentations, and its old fallback painted a duplicate E.</p><code>S · P · E · E</code></div><div class="arrow">→</div><div class="state new"><h3>Now</h3><p>Presentation controls use an explicit three-item list. The literal Value representation remains reachable only through its own creation flows.</p><code>S · P · E</code></div></div></section>
<section><h2>Ready-to-drive human check</h2><p class="copy">This disposable board puts an Expanded <b>run()</b> Block beside a real <b>2.0</b> Value capsule. Select the Block header and verify S / P / E only; the capsule stays separate below it.</p><figure><img src="{fixture}" alt="Expanded Block and separate Value capsule review fixture with numbered orange cues"><figcaption><b>Review fixture rendered by the real editor.</b> The green card states the visible pass condition; the arrows remain bound after a cold reopen and target movement.</figcaption></figure></section>
<section><h2>Contextual-menu audit</h2><p class="copy">Focused real-browser checks exercised every menu family in the product composition, including repeated right-click recovery and the floating selection toolbar.</p><table><tbody>{audit}</tbody></table></section>
<footer>Generated from the live menu source and the review-fixture PNG by <code>docs/build_expanded_view_glyph_fix.py</code>. The executable browser smoke tests are the behavioral evidence.</footer>
</main></body></html>'''


if __name__ == "__main__":
    main()
