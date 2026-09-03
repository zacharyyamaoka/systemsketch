#!/usr/bin/env python3
"""Build the self-contained connector-control parity implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SRC = ROOT / "src"
OUTPUT = DOCS / "connector-control-parity-2026-09-02.html"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def source_slice(path: Path, start: str, end: str) -> str:
    source = path.read_text(encoding="utf-8")
    begin = source.index(start)
    return source[begin:source.index(end, begin)].rstrip()


def checks(path: Path) -> list[dict]:
    values = json.loads(path.read_text(encoding="utf-8"))
    if not values or not all(item.get("ok") for item in values):
        raise SystemExit(f"{path.name} is missing or red; refusing to publish the gallery")
    return values


def rows(values: list[dict]) -> str:
    return "\n".join(
        "<tr><td><span class='pass'>✓</span></td>"
        f"<td><code>{html.escape(item['id'])}</code></td>"
        f"<td>{html.escape(item['label'])}</td></tr>"
        for item in values
    )


def main() -> None:
    parity = checks(ASSETS / "connector-control-parity.json")
    editor = checks(ASSETS / "edge-editor.json")
    edge_image = image_uri(ASSETS / "connector-data-edge-controls.png")
    arrow_image = image_uri(ASSETS / "connector-arrow-multi-elbow.png")
    fixture_image = image_uri(ROOT / "sketches" / "review" / "connector-control-parity.png")

    connection_handles = html.escape(source_slice(
        SRC / "blocks" / "connections" / "ConnectionShapeUtil.tsx",
        "\toverride getHandles(connection",
        "\n\t/**\n\t * Base state of an authored-rail drag",
    ))
    arrow_handles = html.escape(source_slice(
        SRC / "systemSketchArrow.tsx",
        "\toverride getHandles(shape",
        "\n\toverride onHandleDragEnd",
    ))
    shared_route_lines = len((SRC / "blocks" / "connections" / "elbowAuthoredRoute.ts").read_text().splitlines())
    removed_lines = sum(
        len((ROOT / path).read_text(encoding="utf-8").splitlines())
        for path in [
            "tests/edge_reveal_area_smoke.mjs",
            "src/systemSketchArrow.tsx",
        ]
    )

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Connector control parity</title>
<style>
  :root {{ color-scheme:light; --ink:#20242b; --muted:#69717e; --line:#dfe3e9; --paper:#f4f6f8;
    --card:#fff; --blue:#3182ed; --blue-soft:#eaf3ff; --green:#27865f; --orange:#f18a32; }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:
    radial-gradient(circle at 78% 0,#e7f0ff 0,transparent 30%),var(--paper);
    font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }}
  a {{ color:#2167bc; text-underline-offset:3px }} main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 76px }}
  .hero,section {{ border:1px solid var(--line); background:#ffffffed; box-shadow:0 16px 48px #29374c12 }}
  .hero {{ padding:42px; border-radius:28px }} .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850;
    letter-spacing:.14em; text-transform:uppercase }} h1 {{ max-width:900px; margin:10px 0 15px;
    font-size:clamp(42px,7vw,76px); line-height:.98; letter-spacing:-.055em }} .lead {{ max-width:850px; margin:0;
    color:var(--muted); font-size:19px }} .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:24px }}
  .chip {{ padding:7px 11px; border:1px solid #cdddef; border-radius:999px; background:var(--blue-soft);
    color:#265f9f; font-size:12px; font-weight:750 }} section {{ margin-top:24px; padding:29px; border-radius:22px }}
  .head {{ display:flex; justify-content:space-between; align-items:end; gap:22px; margin-bottom:18px }}
  h2 {{ margin:0; font-size:28px; letter-spacing:-.035em }} .head p {{ max-width:650px; margin:0; color:var(--muted) }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }} figure {{ margin:0; overflow:hidden;
    border:1px solid var(--line); border-radius:17px; background:#f8fafc }} figure img {{ display:block; width:100%; height:330px;
    object-fit:cover; object-position:center }} figcaption {{ padding:14px 16px; border-top:1px solid var(--line); background:white;
    color:var(--muted); font-size:12px }} figcaption strong {{ display:block; color:var(--ink); font-size:15px }}
  .diagram {{ display:grid; grid-template-columns:1fr 72px 1fr; gap:14px; align-items:stretch }} .lane {{ padding:20px;
    border:1px solid var(--line); border-radius:16px; background:#fafbfd }} .lane h3 {{ margin:0 0 8px; font-size:19px }}
  .lane p {{ margin:0; color:var(--muted) }} .lane ul {{ margin:14px 0 0; padding-left:19px }} .join {{ display:grid;
    place-items:center; color:var(--blue); font-size:36px; font-weight:900 }} .shared {{ grid-column:1/-1; display:grid;
    grid-template-columns:auto 1fr; gap:17px; align-items:center; padding:18px; border:1px solid #bcd4ef;
    border-radius:16px; background:var(--blue-soft) }} .shared b {{ color:var(--blue); font-size:30px }}
  table {{ width:100%; border-collapse:collapse }} th,td {{ padding:11px 12px; border-bottom:1px solid var(--line);
    text-align:left; vertical-align:top }} th {{ color:var(--muted); font-size:11px; letter-spacing:.08em; text-transform:uppercase }}
  .pass {{ display:grid; width:20px; height:20px; place-items:center; border-radius:50%; color:white; background:var(--green) }}
  .starter {{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px }} .starter article {{ padding:18px;
    border:1px solid var(--line); border-radius:15px; background:#fafbfd }} .starter h3 {{ margin:0 0 8px }} .starter p {{ margin:0;
    color:var(--muted); font-size:13px }} .verdict {{ border-color:#b9ddca!important; background:#f1faf5!important }}
  details {{ border:1px solid var(--line); border-radius:14px; background:#fbfcfd }} details+details {{ margin-top:10px }}
  summary {{ padding:13px 16px; cursor:pointer; font-weight:750 }} pre {{ max-height:430px; margin:0; overflow:auto;
    padding:17px; border-top:1px solid var(--line); background:#18202b; color:#e8edf3; font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  .note {{ padding:16px 18px; border-left:4px solid var(--orange); border-radius:4px 12px 12px 4px; background:#fff8f0 }}
  .fixture {{ display:grid; grid-template-columns:1.35fr .65fr; gap:17px; align-items:start }} .fixture img {{ width:100%;
    border:1px solid var(--line); border-radius:15px }} .steps {{ display:grid; gap:10px }} .steps div {{ padding:15px;
    border:1px solid var(--line); border-radius:13px; background:#fafbfd }} .steps b {{ color:var(--blue) }}
  footer {{ padding:25px 2px 0; color:var(--muted); font-size:12px }}
  @media(max-width:820px) {{ .compare,.starter,.fixture,.diagram {{ grid-template-columns:1fr }} .join {{ transform:rotate(90deg) }}
    .shared {{ grid-column:auto }} figure img {{ height:auto }} .head {{ display:block }} .head p {{ margin-top:7px }} }}
</style>
</head>
<body><main>
<header class="hero">
  <div class="eyebrow">Connector interaction · shipped</div>
  <h1>One selection pattern. More than one elbow.</h1>
  <p class="lead">Data-edge controls now appear on the first click and remain visible while selected. Normal elbow arrows use the same round segment controls and the same Excalidraw-style multi-rail editing core.</p>
  <div class="chips"><span class="chip">{len(parity)}/{len(parity)} parity checks</span><span class="chip">{len(editor)}/{len(editor)} edge-editor checks</span><span class="chip">stock tldraw 5.3.2 preserved</span><span class="chip">{shared_route_lines} shared route-core lines</span></div>
</header>

<section>
  <div class="head"><h2>The visible result</h2><p>Both captures come from the real app journey, not a component harness. The pointer is away from the selected data edge in the first image; its midpoint remains offered.</p></div>
  <div class="compare">
    <figure><img src="{edge_image}" alt="Selected data edge with endpoint and midpoint controls"><figcaption><strong>Data edge: first click is enough</strong>No proximity rectangle, hover halo, or second mousemove participates.</figcaption></figure>
    <figure><img src="{arrow_image}" alt="Normal elbow arrow with several authored elbows and round handles"><figcaption><strong>Normal arrow: repeated rail growth</strong>Two successive drags on the open endpoint segment create two more orthogonal rails.</figcaption></figure>
  </div>
</section>

<section>
  <div class="head"><h2>Why they behaved differently</h2><p>The mismatch was architectural, not a tldraw timing bug.</p></div>
  <div class="diagram">
    <article class="lane"><h3>Normal arrow</h3><p>A stock <code>arrow</code> record and <code>ArrowShapeUtil</code>. tldraw owned selection, terminal drag, styles, heads, labels and the one stock elbow midpoint.</p><ul><li>Controls came directly from <code>getHandles()</code></li><li>Selection invalidated them immediately</li><li>Stock elbow schema stores one scalar midpoint</li></ul></article>
    <div class="join">≠</div>
    <article class="lane"><h3>Semantic data edge</h3><p>A custom <code>connection</code> shape with Block-port bindings, data/delay meaning, three routings and its own authored route.</p><ul><li>Nonterminal handles were gated by <code>nearbyConnection</code></li><li>That atom updated only on pointer movement</li><li>The selecting click happened after the last move event</li></ul></article>
    <div class="shared"><b>→</b><div><strong>Now both use the selected-shape handle lifecycle.</strong><br>Removing the edge-only proximity side channel fixes the first-click lag. Both elbow editors call the same pure capture → resolve → move-segment route core.</div></div>
  </div>
</section>

<section>
  <div class="head"><h2>Should data edges just be arrows?</h2><p><strong>Interaction: yes. Record type: no.</strong></p></div>
  <div class="starter">
    <article><h3>Image Pipeline kit</h3><p>Uses custom node and connection shapes. Its connections are color-coded Bézier curves backed by bindings—not stock arrow records. <a href="https://tldraw.dev/starter-kits/image-pipeline">Official kit</a></p></article>
    <article><h3>Workflow kit</h3><p>Uses a custom connection shape, connection bindings, and a <code>PointingPort</code> select-tool state for port authoring. Again, it does not turn semantic connections into stock arrows. <a href="https://tldraw.dev/starter-kits/workflow">Official kit</a></p></article>
    <article class="verdict"><h3>SystemSketch</h3><p>Keeps <code>connection</code> for typed Block ports, polarity, delay pills and route semantics, while borrowing the stock arrow's selected-control contract. This matches the starter-kit boundary and avoids two interaction languages.</p></article>
  </div>
</section>

<section>
  <div class="head"><h2>How the multi-elbow extension stays narrow</h2><p><code>SystemSketchArrowShapeUtil extends ArrowShapeUtil</code>; it does not replace the arrow tool or fork tldraw.</p></div>
  <div class="note"><strong>Compatibility boundary.</strong> The authored route is versioned under the stock arrow's supported <code>meta</code> field because tldraw 5.3.2 validates only <code>elbowMidPoint</code>. Unauthored arrows remain entirely stock. Stock still owns terminals, bindings, labels, styles and arrowheads. A plain tldraw viewer or SVG export deliberately falls back to the valid one-midpoint elbow; the exact extra rails remain a SystemSketch document enhancement.</div>
  <p>The end segment carrying an arrowhead is left stock-owned so its tangent cannot drift. A default arrow grows repeatedly from its open start; every interior rail remains independently draggable.</p>
  <details><summary>Data edge: handles are unconditional while selected</summary><pre>{connection_handles}</pre></details>
  <details><summary>Arrow: stock terminals plus shared route editing</summary><pre>{arrow_handles}</pre></details>
</section>

<section>
  <div class="head"><h2>Executed evidence</h2><p>The parity journey covers the exact no-extra-mousemove regression and two successive rail additions.</p></div>
  <table><thead><tr><th></th><th>Check</th><th>Observed claim</th></tr></thead><tbody>{rows(parity)}</tbody></table>
  <p style="color:var(--muted);font-size:12px">The longer edge-editor journey also passes {len(editor)}/{len(editor)}, including curved, straight and elbow routing, bend drag, inspector switching, z-order and zero console errors. The report builder read {removed_lines} live implementation/test lines while assembling this page.</p>
</section>

<section>
  <div class="head"><h2>Human review board</h2><p>The disposable fixture is authored through the real editor, cold-reopened, and contains real connection bindings plus bound instructional arrows.</p></div>
  <div class="fixture"><img src="{fixture_image}" alt="Connector control parity review fixture"><div class="steps"><div><b>1</b><br>Click the data edge once and stop moving the pointer.</div><div><b>2</b><br>Select the normal elbow arrow.</div><div><b>3</b><br>Drag the open-end segment midpoint twice.</div><div><b>Pass</b><br>Controls appear immediately; each repeated drag adds one orthogonal rail.</div></div></div>
</section>

<footer>Generated from the live SystemSketch tree on 2026-09-02. Sources: official tldraw starter-kit pages and the pinned 5.3.2 implementation in this repository.</footer>
</main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
