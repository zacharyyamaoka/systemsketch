#!/usr/bin/env python3
"""Build the self-contained connector hover-controls implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "connector-hover-controls-2026-09-02.html"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def passing_checks(path: Path) -> list[dict]:
    values = json.loads(path.read_text(encoding="utf-8"))
    if not values or not all(item.get("ok") for item in values):
        raise SystemExit(f"{path.name} is missing or red")
    return values


def main() -> None:
    controls = passing_checks(ASSETS / "connector-control-parity.json")
    appearance = passing_checks(DOCS / "appearance-menu-results.json")
    straight_check = next(
        item for item in appearance
        if "switching preserves" in item["label"]
    )
    images = {
        "edge_out": image_uri(ASSETS / "connector-data-edge-terminals-only.png"),
        "edge_in": image_uri(ASSETS / "connector-data-edge-controls.png"),
        "arrow_out": image_uri(ASSETS / "connector-arrow-terminals-only.png"),
        "arrow_in": image_uri(ASSETS / "connector-arrow-multi-elbow.png"),
        "routing": image_uri(ASSETS / "arrow-routing-three-options.png"),
        "routing_switched": image_uri(ASSETS / "arrow-routing-switched-control.png"),
        "fixture": image_uri(ROOT / "sketches" / "review" / "connector-hover-straight.png"),
    }
    rows = "\n".join(
        "<tr><td><span class='ok'>✓</span></td>"
        f"<td><code>{html.escape(item['id'])}</code></td>"
        f"<td>{html.escape(item['label'])}</td></tr>"
        for item in controls
    )

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Connector hover controls</title>
<style>
:root{{--ink:#20242b;--muted:#687080;--paper:#f4f6f8;--card:#fff;--line:#dfe4ea;--blue:#3182ed;--blue2:#e9f3ff;--green:#23835b;--orange:#f08b36}}
*{{box-sizing:border-box}} body{{margin:0;color:var(--ink);background:radial-gradient(circle at 80% 0,#e5efff 0,transparent 30%),var(--paper);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1160px,calc(100% - 32px));margin:auto;padding:38px 0 72px}} .hero,section{{background:#fffffff2;border:1px solid var(--line);box-shadow:0 18px 52px #29374c12}}
.hero{{padding:42px;border-radius:28px}} .eyebrow{{color:var(--blue);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}
h1{{max-width:900px;margin:9px 0 15px;font-size:clamp(42px,7vw,76px);line-height:.98;letter-spacing:-.055em}} .lead{{max-width:820px;margin:0;color:var(--muted);font-size:19px}}
.chips{{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}} .chip{{padding:7px 11px;border:1px solid #c9dced;border-radius:999px;background:var(--blue2);color:#255f9e;font-size:12px;font-weight:760}}
section{{margin-top:24px;padding:29px;border-radius:22px}} .head{{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:18px}} h2{{margin:0;font-size:28px;letter-spacing:-.035em}} .head p{{max-width:630px;margin:0;color:var(--muted)}}
.switcher{{display:flex;gap:8px;margin:0 0 14px}} button{{border:1px solid #bfd2e7;border-radius:10px;background:white;padding:9px 13px;color:#315f91;font:inherit;font-weight:730;cursor:pointer}} button[aria-pressed="true"]{{background:var(--blue);border-color:var(--blue);color:white}}
.compare{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:#f8fafc}} figure img{{display:block;width:100%;height:310px;object-fit:cover;object-position:center}} figcaption{{padding:14px 16px;border-top:1px solid var(--line);background:white;color:var(--muted);font-size:12px}} figcaption strong{{display:block;color:var(--ink);font-size:15px}}
.flow{{display:grid;grid-template-columns:1fr 58px 1fr 58px 1fr;gap:10px;align-items:center}} .step{{min-height:150px;padding:18px;border:1px solid var(--line);border-radius:15px;background:#fafbfd}} .step b{{display:block;margin-bottom:7px;font-size:18px}} .step p{{margin:0;color:var(--muted);font-size:13px}} .arrow{{text-align:center;color:var(--blue);font-size:28px;font-weight:900}}
.rule{{margin-top:16px;padding:16px 18px;border-left:4px solid var(--orange);border-radius:4px 12px 12px 4px;background:#fff7ef}} .rule code{{font-weight:760}}
.straight{{display:grid;grid-template-columns:1.35fr .65fr;gap:18px;align-items:center}} .straight img,.fixture img{{display:block;width:100%;border:1px solid var(--line);border-radius:16px}} .straight .stack{{display:grid;gap:10px}} .straight small{{color:var(--muted)}} .straight ul{{padding-left:20px;color:var(--muted)}}
table{{width:100%;border-collapse:collapse}} th,td{{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}} th{{color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}} .ok{{display:grid;width:20px;height:20px;place-items:center;border-radius:50%;color:white;background:var(--green)}}
.fixture{{display:grid;grid-template-columns:1.4fr .6fr;gap:18px;align-items:start}} .instructions{{display:grid;gap:10px}} .instructions div{{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fafbfd}} .instructions b{{color:var(--blue)}}
footer{{padding:24px 2px 0;color:var(--muted);font-size:12px}} code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
@media(max-width:820px){{.compare,.straight,.fixture,.flow{{grid-template-columns:1fr}} .arrow{{transform:rotate(90deg)}} figure img{{height:auto}} .head{{display:block}} .head p{{margin-top:6px}}}}
</style></head><body><main>
<header class="hero"><div class="eyebrow">Connector interaction · implemented</div><h1>Endpoints stay. Interior controls breathe.</h1>
<p class="lead">Arrows and semantic data edges now use one FigJam-style rule: selection always exposes both terminals, while bend and rail controls appear only inside the connector's padded outer rectangle.</p>
<div class="chips"><span class="chip">{len(controls)}/{len(controls)} connector checks</span><span class="chip">3 routing choices</span><span class="chip">1 shared transient signal</span><span class="chip">stock tldraw drag states</span></div></header>

<section><div class="head"><h2>Cross the rectangle</h2><p>Use the buttons to compare the real-browser captures. Selection does not change; only the pointer crosses the route bounds.</p></div>
<div class="switcher"><button data-state="out" aria-pressed="true">Pointer outside</button><button data-state="in" aria-pressed="false">Pointer inside</button></div>
<div class="compare">
<figure><img id="edge" src="{images['edge_out']}" data-out="{images['edge_out']}" data-in="{images['edge_in']}" alt="Selected data edge"><figcaption><strong>Semantic data edge</strong>Outside: its two port terminals remain. Inside: every editable elbow rail returns.</figcaption></figure>
<figure><img id="arrow" src="{images['arrow_out']}" data-out="{images['arrow_out']}" data-in="{images['arrow_in']}" alt="Selected normal arrow"><figcaption><strong>Normal arrow</strong>The same gate wraps stock terminals and SystemSketch's authored multi-elbow rails.</figcaption></figure>
</div></section>

<section><div class="head"><h2>The narrow stock seam</h2><p>No custom handle renderer and no copied drag state.</p></div>
<div class="flow"><article class="step"><b>Pointer observer</b><p>Measures selected arrow/edge bounds and writes only when the pointer crosses the threshold.</p></article><div class="arrow">→</div><article class="step"><b>Editor-scoped atom</b><p>Transient, unsaved, outside undo. It invalidates cached handle lists only on enter/leave.</p></article><div class="arrow">→</div><article class="step"><b>ShapeUtil.getHandles</b><p>Always returns terminals; conditionally adds interiors. tldraw paints, hits, and drags every returned handle.</p></article></div>
<div class="rule"><strong>The contract:</strong> <code>start + end</code> are unconditional. Delay pills stay unconditional because they are visible semantic objects. Only <code>bend / segment / grow / route</code> handles read the shared proximity signal.</div></section>

<section><div class="head"><h2>Straight is stock, too</h2><p>The missing menu choice was a representation mismatch, not a missing renderer.</p></div>
<div class="straight"><div class="stack"><img src="{images['routing']}" alt="Arrow routing popover with elbowed curved and straight options"><img src="{images['routing_switched']}" alt="A curved arrow showing its middle control while the routing menu remains open"><small>Regression proof: after switching the selected arrow, moving into its rectangle reveals the middle control even while tldraw's transparent menu-dismiss layer is active.</small></div><div><p>tldraw stores both curved and straight arrows as <code>kind: arc</code>. Bend distinguishes them:</p><ul><li><strong>Elbowed</strong> → <code>kind: elbow</code></li><li><strong>Curved</strong> → <code>kind: arc</code>, nonzero bend</li><li><strong>Straight</strong> → <code>kind: arc</code>, <code>bend: 0</code></li></ul><p>The proximity observer now asks whether pointer coordinates are inside the canvas viewport—not which transient overlay is the topmost DOM node.</p><p><span class="ok" style="display:inline-grid">✓</span> {html.escape(straight_check['label'])}</p></div></div></section>

<section><div class="head"><h2>Executed evidence</h2><p>The browser journey selects each connector, crosses its rectangle in both directions, then exercises repeated elbow growth.</p></div>
<table><thead><tr><th></th><th>Check</th><th>Observed behavior</th></tr></thead><tbody>{rows}</tbody></table></section>

<section><div class="head"><h2>Human review board</h2><p>Generated through the real editor, cold-reopened, and verified with real semantic connection bindings.</p></div>
<div class="fixture"><img src="{images['fixture']}" alt="Connector hover and arrow routing review fixture"><div class="instructions"><div><b>1</b><br>Select the data edge; move outside and back inside its outer rectangle.</div><div><b>2</b><br>Repeat on the normal arrow. Endpoints must never disappear.</div><div><b>3</b><br>Open Line shape, choose Curved, then move onto the arrow without closing the menu.</div><div><b>Pass</b><br>The curved arrow's middle control appears under the pointer without another click.</div></div></div></section>
<footer>Generated from the live SystemSketch tree on 2026-09-02. The gallery is self-contained; all images and interaction code are embedded.</footer>
</main><script>
const buttons=[...document.querySelectorAll('[data-state]')];
for(const button of buttons)button.addEventListener('click',()=>{{
  const state=button.dataset.state;
  for(const candidate of buttons)candidate.setAttribute('aria-pressed',String(candidate===button));
  for(const id of ['edge','arrow']){{const image=document.getElementById(id);image.src=image.dataset[state];}}
}});
</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
