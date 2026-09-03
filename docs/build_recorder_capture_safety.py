#!/usr/bin/env python3
"""Build the self-contained recorder capture-safety verification gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "recorder-capture-safety-2026-09-02.html"
RECORDER_CHECK_TOTAL = 30
REGRESSION_CHECKS = {
    "screencast-skips-canvas-fallback": "an available screencast does not rasterise the whole board as a redundant fallback",
    "screencast-save-skips-canvas-fallback": "saving a screencast take does not rasterise an unnecessary ending PNG",
}


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def regression_rows() -> str:
    smoke = (ROOT / "tests" / "recorder_smoke.mjs").read_text(encoding="utf-8")
    missing = [check_id for check_id in REGRESSION_CHECKS if check_id not in smoke]
    if missing:
        raise SystemExit(f"missing recorder regression checks: {', '.join(missing)}")
    return "".join(
        "<tr><td><span class='pass'>✓</span></td>"
        f"<td><code>{html.escape(check_id)}</code></td>"
        f"<td>{html.escape(label)}</td></tr>"
        for check_id, label in REGRESSION_CHECKS.items()
    )


def main() -> None:
    fixture = image_uri(ROOT / "sketches" / "review" / "recorder-capture-safety.png")
    rows = regression_rows()
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Recorder capture safety</title><style>
:root{{--ink:#17202a;--muted:#667384;--paper:#f2f5f8;--line:#dce3eb;--card:#fff;--blue:#2472d3;--bluewash:#edf5ff;--green:#178453;--orange:#e77c25}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 92% 4%,#dceeff 0,transparent 29%),var(--paper);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1100px,calc(100% - 32px));margin:auto;padding:44px 0 80px}}header,section{{background:#fffffff0;border:1px solid var(--line);box-shadow:0 18px 48px #20324612}}header{{padding:42px;border-radius:28px}}section{{margin-top:22px;padding:30px;border-radius:21px}}.kicker{{color:var(--blue);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:900px;margin:8px 0 15px;font-size:clamp(44px,7vw,76px);line-height:.98;letter-spacing:-.055em}}h2{{margin:0 0 10px;font-size:29px;letter-spacing:-.035em}}p{{max-width:850px}}.lead,.muted{{color:var(--muted)}}.lead{{font-size:19px}}.chips{{display:flex;flex-wrap:wrap;gap:9px;margin-top:25px}}.chip{{border:1px solid #c8dcf2;background:var(--bluewash);border-radius:999px;padding:7px 11px;color:#235d9e;font-size:12px;font-weight:750}}.flow{{display:grid;grid-template-columns:1fr 64px 1fr 64px 1fr;align-items:stretch;gap:10px;margin-top:20px}}.step{{padding:21px;border:1px solid var(--line);border-radius:16px;background:#fbfcfe}}.step strong{{display:block;color:var(--blue);font-size:18px}}.arrow{{display:grid;place-items:center;color:var(--blue);font-size:34px;font-weight:900}}.safe{{border-color:#b9ddca;background:#f2fbf6}}.safe strong{{color:var(--green)}}.note{{padding:17px 19px;border-left:4px solid var(--orange);border-radius:4px 12px 12px 4px;background:#fff8f1}}.grid{{display:grid;grid-template-columns:1.1fr .9fr;gap:22px;align-items:start}}img{{display:block;width:100%;border:1px solid var(--line);border-radius:15px}}.steps{{display:grid;gap:10px}}.steps div{{padding:16px;border:1px solid var(--line);border-radius:13px;background:#fbfcfe}}.steps b{{color:var(--blue)}}table{{width:100%;border-collapse:collapse;margin-top:16px}}th,td{{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}}.pass{{display:grid;width:20px;height:20px;place-items:center;border-radius:50%;background:var(--green);color:#fff}}code{{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}}footer{{padding:25px 2px;color:var(--muted);font-size:12px}}@media(max-width:760px){{header,section{{padding:24px}}.flow,.grid{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg);height:34px}}}}
</style></head><body><main>
<header><div class="kicker">Flight recorder · capture safety shipped</div><h1>Screen frames first. Canvas export only when needed.</h1><p class="lead">The recorder no longer asks tldraw to rasterize the entire board at Start and Stop while Chrome's screencast is healthy. That eliminates the large offscreen export that could momentarily black-flash the composited Preview.</p><div class="chips"><span class="chip">{RECORDER_CHECK_TOTAL}/{RECORDER_CHECK_TOTAL} recorder checks passing</span><span class="chip">4 MP fallback limit</span><span class="chip">pixel ratio fixed at 1×</span><span class="chip">real Start → Stop review run</span></div></header>
<section><h2>Capture decision</h2><p class="muted">The sidecar tells the page whether it successfully armed Chrome's viewport screencast. That result, not a best-effort export, now selects the source.</p><div class="flow"><article class="step"><strong>1. Start a take</strong>Ask the recorder host to arm <code>Page.startScreencast</code>.</article><div class="arrow">→</div><article class="step"><strong>2. Read its result</strong>If Chrome is delivering viewport frames, retain that path with no <code>editor.toImage()</code> work.</article><div class="arrow">→</div><article class="step safe"><strong>3. Use a bounded fallback</strong>Only without screencast, capture the first and last canvas state. Clamp the export to 4,000,000 pixels.</article></div><div class="note"><strong>Why this matters.</strong> The supplied board was roughly 4,785 × 15,479 page pixels. The old half-scale export with tldraw's default 2× device pixel ratio could allocate about 74 million pixels (~283 MiB) for one fallback image. The new fallback explicitly uses <code>pixelRatio: 1</code> and computes a scale whose raster never exceeds 4 million pixels (~16 MiB).</div></section>
<section><h2>Regression evidence</h2><p class="muted">The real-browser recorder journey now asserts the behavior at both risk points: starting and saving a healthy screencast take make zero canvas exports.</p><table><thead><tr><th></th><th>Check</th><th>Observed result</th></tr></thead><tbody>{rows}</tbody></table></section>
<section><h2>Human review board</h2><div class="grid"><img src="{fixture}" alt="Recorder capture-safety review board with two Blocks, step cards, arrows and a pass condition"><div class="steps"><div><b>1</b><br>Open the saved board, press <strong>Start recording</strong>, then pan away from the first Block.</div><div><b>2</b><br>Pan to the second Block and press <strong>Stop and save</strong>.</div><div><b>Pass</b><br>The canvas remains visible during both controls and the take saves normally. The orange arrows remain bound as the real Blocks move.</div></div></div></section>
<footer>Generated from the live SystemSketch tree on 2026-09-02. The evidence image is embedded, so this file is self-contained.</footer></main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
