#!/usr/bin/env python3
"""Build the self-contained Type primitive implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "type-primitive-implementation-2026-09-05.html"
SMOKE = DOCS / "assets" / "type-primitive-smoke-2026-09-05.png"
FIXTURE = ROOT / "sketches" / "review" / "type-primitive.png"
BOARD = ROOT / "sketches" / "review" / "type-primitive.systemsketch"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def need(path: Path, *tokens: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in source]
    if missing:
        raise RuntimeError(f"{path.relative_to(ROOT)} is missing {missing!r}")


def main() -> None:
    for path in (SMOKE, FIXTURE, BOARD):
        if not path.exists():
            raise RuntimeError(f"missing proof artifact: {path.relative_to(ROOT)}")
    need(ROOT / "src/blocks/typeAttributes.ts", "attributeSource", "parseTypeAttributeSource", "createTypeProps")
    need(ROOT / "src/blocks/ui/TypeAttributeRegion.tsx", "source is deliberately a normal multiline text transaction", "type-attribute-source", "markHistoryStoppingPoint")
    need(ROOT / "src/blocks/ui/type-attribute-region.css", "open branches hide their chrome", "TypeAttributeRegion--gutter")
    need(ROOT / "src/SystemSketchUtilities.tsx", "systemsketch-dev-type-chevron-gutter", "Chevrons in code gutter")
    need(ROOT / "tests/type_primitive_smoke.mjs", "Type primitive real-browser journey", "Collapse pose", "gutter placement")

    board = json.loads(BOARD.read_text(encoding="utf-8"))
    records = board.get("records", [])
    shapes = [record for record in records if record.get("typeName") == "shape"]
    bindings = [record for record in records if record.get("typeName") == "binding"]
    source = "pose: Pose\n  position: Position\n    x: float\n    y: float\nquality: float"
    source_code = html.escape(source)

    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Type primitive</title>
<style>
:root{{--ink:#132238;--muted:#607087;--line:#d8e1eb;--paper:#f4f7fb;--card:#fff;--blue:#2f7ee6;--cyan:#137d95;--green:#17834f;--orange:#ed8a26}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 94% 0,#dbeaff 0,transparent 28rem),var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1260px,calc(100% - 36px));margin:auto;padding:52px 0 76px}}.eyebrow{{color:var(--blue);font:800 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:850px;margin:13px 0;font-size:clamp(42px,6vw,72px);line-height:.98;letter-spacing:-.06em}}h2{{margin:0 0 8px;font-size:28px;letter-spacing:-.04em}}p{{margin:0}}.lede{{max-width:900px;color:#41536a;font-size:20px;line-height:1.55}}.facts{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0 46px}}.fact,.card,figure,table{{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 22px #15253a0b}}.fact{{padding:17px}}.fact b{{display:block;font-size:27px;line-height:1.1}}.fact span{{color:var(--muted);font-size:13px}}section{{margin-top:48px}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.card{{padding:22px}}.contract{{display:grid;grid-template-columns:1fr 42px 1fr 42px 1fr;align-items:stretch;margin-top:18px}}.node{{padding:20px;border:1px solid var(--line);border-top:5px solid var(--cyan);border-radius:14px;background:#fff}}.node:nth-child(3){{border-top-color:var(--blue)}}.node:nth-child(5){{border-top-color:var(--green)}}.node b{{display:block;margin-bottom:5px;font-size:17px}}.node span{{color:var(--muted);font-size:14px}}.arrow{{display:grid;place-items:center;color:#8a99ac;font-size:28px}}pre{{margin:14px 0 0;padding:17px;overflow:auto;border-radius:12px;background:#102032;color:#dceafb;font:14px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}}.keyword{{color:#86d6ff}}.tradeoffs{{width:100%;border-collapse:collapse;overflow:hidden}}th,td{{padding:13px 15px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}}th{{background:#f8fbff;color:#516178;font-size:12px;text-transform:uppercase;letter-spacing:.06em}}tr:last-child td{{border-bottom:0}}.ship{{font-weight:800;color:var(--green)}}.gallery-controls{{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}}button{{border:1px solid #c7d6e8;border-radius:999px;padding:8px 13px;background:#fff;color:var(--ink);font:700 13px inherit;cursor:pointer}}button[aria-pressed=true]{{border-color:var(--blue);background:var(--blue);color:#fff}}figure{{margin:0;padding:12px}}figure img{{display:none;width:100%;border-radius:10px}}figure img.active{{display:block}}figcaption{{padding:11px 4px 2px;color:var(--muted);font-size:14px}}ul{{margin:0;padding-left:20px}}li{{margin:8px 0}}a{{color:#135dbb;font-weight:700}}.note{{margin-top:16px;border-left:4px solid var(--orange);border-radius:0 10px 10px 0;background:#fff7ed;padding:12px 15px;color:#69421d}}footer{{margin-top:50px;padding-top:19px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}code{{border-radius:4px;background:#e8eef6;padding:2px 5px;font:12px ui-monospace,monospace}}@media(max-width:820px){{.facts,.grid{{grid-template-columns:1fr 1fr}}.contract{{grid-template-columns:1fr;gap:8px}}.arrow{{height:22px;transform:rotate(90deg)}}}}@media(max-width:500px){{main{{width:min(100% - 24px,1260px);padding-top:30px}}.facts,.grid{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · implementation gallery · 5 September 2026</div>
<h1>One editable source.<br>One compact Type face.</h1>
<p class="lede">Type is a Block-shaped domain definition, not a second canvas engine. Its attributes stay as exact multiline text for normal cursor, Enter, and paste ergonomics; the Port face reads that same text as a collapsible nested projection.</p>
<section class="facts"><div class="fact"><b>1</b><span>canonical source body</span></div><div class="fact"><b>2</b><span>chevron placements</span></div><div class="fact"><b>5</b><span>implementation proposals compared</span></div><div class="fact"><b>{len(shapes)} / {len(bindings)}</b><span>fixture shapes / real bindings</span></div></section>
<section><h2>The deliberately small data model</h2><div class="contract"><div class="node"><b>Type Block</b><span>Uses the existing Block shape, title, views, selection, history, persistence, and toolbar seams.</span></div><div class="arrow">→</div><div class="node"><b>attributeSource</b><span>One opaque string. It is never prettified, split into row records, or made dependent on a parser success.</span></div><div class="arrow">→</div><div class="node"><b>Read projection</b><span>The parser supplies only a dense tree. Fold state and the chevron placement are local presentation state.</span></div></div><pre><span class="keyword"># exact authored source</span>\n{source_code}</pre><p class="note"><b>Why source-first:</b> a parsed row editor seems compact until a person pastes a class, inserts a line in the middle, or retains a partially written annotation. The projection is allowed to be helpful; it is not allowed to become a competing document model.</p></section>
<section><h2>Five attribute-region proposals</h2><p class="lede" style="font-size:16px">The comparison exercised five distinct implementation directions before committing. The detailed, interactive evaluation is preserved in the <a href="type-attribute-region-babble-2026-09-05.html">five-proposal comparison gallery</a>.</p><table class="tradeoffs"><thead><tr><th>Direction</th><th>Editing contract</th><th>Why it landed here</th></tr></thead><tbody><tr><td class="ship">1 · Source-first tree — shipped</td><td>One multiline text field; tree is a read view.</td><td>Preserves native code editing and keeps exactly one canonical body.</td></tr><tr><td>2 · Foldable code cell</td><td>Code editor with a separate compact summary.</td><td>Strong editor, but the compact face becomes an extra representation to maintain.</td></tr><tr><td>3 · Structured table</td><td>One editable row per field.</td><td>Direct scanning, but nesting and paste become awkward grid operations.</td></tr><tr><td>4 · Direct outline</td><td>Contenteditable tree rows.</td><td>Looks elegant until selection, IME, and structural Enter rules become a custom editor.</td></tr><tr><td>5 · Card + inspector</td><td>Canvas summary; details elsewhere.</td><td>Safest implementation, but hides the type system exactly where the user is modelling.</td></tr></tbody></table></section>
<section><h2>Live browser and saved-board evidence</h2><div class="gallery-controls"><button type="button" data-view="smoke" aria-pressed="true">Real product journey</button><button type="button" data-view="fixture" aria-pressed="false">Seeded human review board</button></div><figure><img class="active" data-view="smoke" src="{image(SMOKE)}" alt="Real SystemSketch product canvas showing a selected Type and the open Dev gutter setting"><img data-view="fixture" src="{image(FIXTURE)}" alt="Type primitive review board with numbered instructions and bound orange arrows"><figcaption id="caption">The real-browser journey creates a Type through its toolbar, edits the source field, folds a nested branch, and toggles the Dev gutter control.</figcaption></figure></section>
<section class="grid"><article class="card"><h2>Interaction contract</h2><ul><li>The Type tool creates a Port-view Block with no input or output ports.</li><li>The top <strong>attributes</strong> chevron is always visible.</li><li>Nested chevrons appear on hover; folded branches remain discoverable.</li><li>Clicking a row opens the normal textarea. Blur commits; Escape cancels.</li><li>Dev switches fold controls from inline-by-text to a fixed code gutter.</li></ul></article><article class="card"><h2>Executable proof</h2><ul><li><code>npm run check</code>: 1,326 TypeScript/Vitest checks plus 118 Python checks passed.</li><li><code>tests/type_primitive_smoke.mjs</code>: real pointer tool creation, source editing, fold/reopen, gutter toggle, and console cleanliness passed.</li><li>The fixture was cold-reopened through the real editor; its Type was physically moved and all 3 bound cue arrows followed, then <code>pose</code> was folded.</li><li>Block schema migration V8 removes <code>attributeSource</code> only when saving back to V7.</li></ul></article></section>
<footer>Built by <code>docs/build_type_primitive.py</code> from the current source, real-browser capture, and generated fixture. The source text and ordinary regression tests remain the living specification.</footer>
</main><script>const captions={{smoke:'The real-browser journey creates a Type through its toolbar, edits the source field, folds a nested branch, and toggles the Dev gutter control.',fixture:'The generated board begins at the review gesture. Its orange leaders are stock bound arrows; moving the Type proved each stays attached.'}};document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{{const view=button.dataset.view;document.querySelectorAll('img[data-view]').forEach(image=>image.classList.toggle('active',image.dataset.view===view));document.querySelectorAll('button[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.view===view)));document.querySelector('#caption').textContent=captions[view]}}));</script></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
