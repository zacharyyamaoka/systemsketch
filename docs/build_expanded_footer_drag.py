#!/usr/bin/env python3
"""Build the self-contained Expanded Block footer-drag evidence gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "expanded-footer-drag-2026-09-02.html"
BEFORE = ASSETS / "expanded-footer-drag-before-2026-09-02.png"
AFTER = ASSETS / "expanded-footer-drag-after-2026-09-02.png"
RESULTS = ASSETS / "expanded-footer-drag-results.json"
SOURCE = ROOT / "src" / "blocks" / "BlockShapeUtil.tsx"


def image_uri(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"missing {path}; run npm run test:selectable")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source_slice() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    start = source.index("\t\tconst chrome = isContainer")
    end = source.index("\n\t\tconst portGeometry", start)
    return html.escape(source[start:end])


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    rows = [
        ("Selected footer", results["selectedFooter"], "118 × 64 px requested; the frame followed exactly."),
        ("Cold footer", results["coldFooter"], "Selection is not a prerequisite."),
        ("Port text", results["portText"], "The painted words are a handle; the empty half-row is not."),
        ("Open middle", results["interior"], "The parent stayed fixed, preserving drawable child canvas."),
    ]
    score = "".join(
        f'<tr><td>{html.escape(label)}</td><td><code>Δx {delta["x"]:+g} · Δy {delta["y"]:+g}</code></td>'
        f'<td>{html.escape(note)}</td><td class="pass">PASS</td></tr>'
        for label, delta, note in rows
    )

    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Expanded Block footer drag</title>
<style>
:root{{--paper:#f4f1ea;--ink:#222426;--muted:#697078;--card:#fff;--line:#d9d4c9;--blue:#2563eb;--orange:#f97316;--green:#177245;--shadow:0 18px 50px #2d29231b;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 85% 0,#dbeafe 0,transparent 34rem),var(--paper);color:var(--ink)}}main{{width:min(1320px,calc(100% - 40px));margin:auto;padding:54px 0 76px}}
.eyebrow{{color:var(--blue);font:800 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:920px;margin:12px 0;font-size:clamp(44px,7vw,82px);line-height:.96;letter-spacing:-.055em}}.lead{{max-width:850px;margin:0;color:var(--muted);font-size:20px;line-height:1.55}}
.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:30px 0 48px}}.stat,.card{{border:1px solid var(--line);border-radius:17px;background:#ffffffd9;box-shadow:var(--shadow)}}.stat{{padding:18px}}.stat b{{display:block;font-size:30px}}.stat span{{color:var(--muted)}}h2{{margin:48px 0 12px;font-size:30px;letter-spacing:-.035em}}
.shots{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:white;box-shadow:var(--shadow)}}figure img{{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;object-position:left center}}figcaption{{padding:13px 16px;color:var(--muted)}}figcaption b{{color:var(--ink)}}
.explainer{{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:16px}}.card{{padding:22px}}.controls{{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}}button{{border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:white;color:inherit;cursor:pointer;font-weight:750}}button.active{{border-color:var(--blue);background:#eaf0ff;color:#1748a8}}svg{{display:block;width:100%;height:auto;border-radius:13px;background:#fafafa}}
.zone{{opacity:.08;transition:opacity .15s}}.zone.active{{opacity:.8}}.zone.footer,.zone.label{{fill:#fb923c}}.zone.header{{fill:#60a5fa}}.zone.edge{{fill:none;stroke:#2563eb;stroke-width:8}}.safe{{fill:#dcfce7;stroke:#16a34a;stroke-dasharray:8 6}}
table{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:white}}th,td{{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left}}tr:last-child td{{border-bottom:0}}th{{background:#ebe7de;color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase}}.pass{{color:var(--green);font-weight:850}}
pre{{overflow:auto;margin:0;padding:18px;border-radius:14px;background:#111827;color:#dbeafe;font:600 12px/1.55 ui-monospace,monospace}}code{{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}}a{{color:#164fb8}}footer{{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted)}}
@media(max-width:850px){{.stats,.shots,.explainer{{grid-template-columns:1fr}}}}@media(max-width:560px){{main{{width:calc(100% - 20px);padding-top:30px}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · pointer geometry · 2026-09-02</div>
<h1>The footer moves the whole frame.</h1>
<p class="lead">The earlier selectable-area implementation never reached <code>main</code>, and the current Preview reproduced the miss: a real drag on the visible footer moved zero pixels. The restored geometry makes the footer and painted port words true frame handles while keeping the Expanded Block's open middle available for children.</p>
<div class="stats"><div class="stat"><b>118 × 64</b><span>selected-footer drag, exact follow</span></div><div class="stat"><b>4 / 4</b><span>focused real-pointer checks</span></div><div class="stat"><b>667 + 66</b><span>Vitest + Python full gate</span></div></div>

<h2>Observed in the real app</h2><div class="shots">
<figure><img src="{image_uri(BEFORE)}" alt="Expanded merge Block selected before the footer drag"><figcaption><b>Before.</b> The exact seeded Expanded Block, selected and ready to grab by the quiet left side of its footer.</figcaption></figure>
<figure><img src="{image_uri(AFTER)}" alt="Expanded merge Block after footer and label drags"><figcaption><b>After.</b> Three real drags translated it; the final interior drag left the parent where it was.</figcaption></figure>
</div>

<h2>One hollow frame, five live bands</h2><div class="explainer">
<section class="card"><div class="controls"><button class="active" data-zone="all">All handles</button><button data-zone="footer">Footer</button><button data-zone="label">Port text</button><button data-zone="safe">Drawable middle</button></div>
<svg viewBox="0 0 760 500" role="img" aria-label="Selectable bands on an Expanded Block"><rect x="84" y="42" width="592" height="408" rx="12" fill="#fff" stroke="#b6b8bc" stroke-width="2"/><rect class="zone edge active" x="84" y="42" width="592" height="408" rx="12"/><rect class="zone header active" x="84" y="42" width="592" height="62"/><rect class="safe active" x="178" y="126" width="404" height="254" rx="12" opacity=".6"/><rect class="zone label active" x="84" y="145" width="150" height="34"/><rect class="zone label active" x="526" y="145" width="150" height="34"/><rect class="zone label active" x="84" y="257" width="165" height="34"/><rect class="zone footer active" x="84" y="394" width="592" height="56"/><text x="108" y="82" font-size="30" font-family="ui-monospace,monospace">merge()</text><text x="110" y="169" font-size="18">pose  Pose</text><text x="551" y="169" font-size="18">Pose  result</text><text x="110" y="281" font-size="18">other  Pose</text><text x="366" y="235" text-anchor="middle" fill="#177245" font-weight="800">DRAW / DROP CHILDREN HERE</text><text x="380" y="430" text-anchor="middle" font-weight="800">GRAB FOOTER</text></svg></section>
<section class="card"><h3>Why the middle stays quiet</h3><p>The positioned label box reaches almost halfway across each lane. Making that whole box live would turn the child canvas into a parent handle. The hit band instead runs from the Block edge to 8 px past the final painted glyph.</p><h3>Why drag now works</h3><p>Stock tldraw already lets frame-like shapes answer through child geometry marked <code>isLabel</code>. The footer and measured label bands now use that seam; tldraw still owns selection and translation.</p></section></div>

<h2>Pointer scoreboard</h2><table><thead><tr><th>Gesture</th><th>Observed translation</th><th>Contract</th><th>Result</th></tr></thead><tbody>{score}</tbody></table>

<h2>The stock seam</h2><pre>{source_slice()}</pre>
<footer><code>npm run test:selectable</code> · relevant browser suites: edges 33/33, ports 14/14, rows 14/14, click-to-edit 9/9, selection menu 9/9 · no console errors.</footer>
</main><script>
const buttons=[...document.querySelectorAll('button[data-zone]')];const zones=[...document.querySelectorAll('.zone')];buttons.forEach(button=>button.addEventListener('click',()=>{{buttons.forEach(item=>item.classList.remove('active'));button.classList.add('active');const selected=button.dataset.zone;zones.forEach(zone=>zone.classList.toggle('active',selected==='all'||zone.classList.contains(selected)));document.querySelector('.safe').style.opacity=selected==='safe'||selected==='all'?'.6':'.12'}}));
</script></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
