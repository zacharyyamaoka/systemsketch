"""Build the standalone Code primitive implementation gallery from live-browser evidence."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
RESULTS = DOCS / "code-block-primitive-results-2026-09-05.json"
SCREENSHOT = ASSETS / "code-block-primitive-live-2026-09-05.png"
OUTPUT = DOCS / "code-block-primitive-implementation-2026-09-05.html"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    proof = json.loads(RESULTS.read_text(encoding="utf-8"))
    checks = proof["checks"]
    if not checks or not all(check["ok"] for check in checks):
        raise SystemExit(f"cannot publish a failing Code primitive proof: {checks}")
    rows = "".join(
        f"<tr><th scope=\"row\">{html.escape(check['id'])}</th><td>{html.escape(check['detail'])}</td><td>PASS</td></tr>"
        for check in checks
    )
    source = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code block primitive · SystemSketch</title>
<style>
:root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color:#172033; background:#f4f7fb; }}
* {{ box-sizing:border-box; }} body {{ margin:0; }} main {{ max-width:1240px; margin:auto; padding:48px 28px 72px; }}
.eyebrow {{ color:#356ae6; font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }}
h1 {{ max-width:900px; margin:9px 0 15px; font-size:clamp(38px,6vw,68px); line-height:.95; letter-spacing:-.055em; }}
h2 {{ margin:42px 0 14px; letter-spacing:-.028em; }} p, li {{ line-height:1.58; }} .lede {{ max-width:850px; color:#526174; font-size:18px; }}
.facts {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:28px 0; }} .fact {{ border:1px solid #dce4ef; border-radius:14px; padding:18px; background:#fff; }} .fact b {{ display:block; font-size:25px; }}
.flow {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:22px 0; }} .step {{ min-height:100px; padding:15px; border-radius:12px; background:#172033; color:#fff; }} .step small {{ display:block; color:#aebdd9; font-weight:750; letter-spacing:.08em; }}
.hero {{ margin:24px 0; border:1px solid #dbe3ef; border-radius:18px; overflow:hidden; background:#fff; box-shadow:0 12px 34px #15274214; }} .hero img {{ display:block; width:100%; background:#fff; }} .hero figcaption {{ padding:13px 16px; color:#526174; font-size:14px; }}
.callout {{ border-left:4px solid #356ae6; border-radius:8px; padding:16px 18px; background:#eaf0ff; }} code {{ font:600 .92em ui-monospace,SFMono-Regular,Menlo,monospace; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid #dce4ef; border-radius:14px; background:#fff; }} th,td {{ padding:13px 15px; text-align:left; border-bottom:1px solid #e7edf5; }} th {{ width:130px; }} tr:last-child>* {{ border-bottom:0; }} td:last-child {{ color:#16704b; font-weight:800; }}
.links a {{ margin-right:18px; }} footer {{ margin-top:44px; color:#66758a; font-size:14px; }}
@media(max-width:760px) {{ main{{padding:30px 16px}} .facts,.flow{{grid-template-columns:1fr}} table{{font-size:13px}} th,td{{padding:10px}} }}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Code primitive · 5 September 2026</div>
<h1>Code lives on the canvas without becoming a second programming system.</h1>
<p class="lede">The selected block follows the supplied compact ribbon reference: language, font size, and numbered lines are direct. Width is a deliberate FigJam-like decision with named character measures, a custom field, and a live reciprocal <code>ch</code> readout while the ordinary tldraw resize handle moves.</p>
<div class="facts"><div class="fact"><b>CodeMirror 6</b>real editable document and language modes</div><div class="fact"><b>32 / 48 / 64 / 80ch</b>common widths plus any custom count</div><div class="fact"><b>stock resize</b>tldraw owns selection, drag, undo, and persistence</div></div>
<h2>One small interaction grammar</h2>
<div class="flow"><div class="step"><small>1 · INSERT</small>Choose <b>Code · C</b> from System design, then use the native box-draw gesture.</div><div class="step"><small>2 · FORMAT</small>Select it for language, type size, and line-number controls in one ribbon.</div><div class="step"><small>3 · MEASURE</small>Open Width for named <code>ch</code> presets or type a custom count.</div><div class="step"><small>4 · EDIT</small>Click the selected block to enter its existing CodeMirror document; drag a stock handle freely.</div></div>
<figure class="hero"><img alt="Real SystemSketch Code block with the selected-object ribbon and custom 72 character width chooser" src="{image_uri(SCREENSHOT)}"><figcaption>Real-browser acceptance capture: JavaScript mode, line-number toggle, the custom 72-character measure, and native tldraw selection handles all coexist on one shape.</figcaption></figure>
<div class="callout"><strong>Deliberate boundary.</strong> A Code block stores an authored literal, language label, and presentation. It does not run, lint, infer, or project program semantics. The shape is portable: export lowers it in an isolated clone to editable stock text and geometry, so a bare <code>.tldr</code> never receives a CodeMirror-only record.</div>
<h2>Live acceptance</h2><table><thead><tr><th>Check</th><th>Observed through the running product</th><th>Result</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Decision record</h2><p>Five runnable visual directions were compared before implementation. <strong>V5 — Ribbon + width popover</strong> won because common adjustments remain immediate while line measure gets the focused preset-and-custom surface it needs. The other directions remain visible rather than being collapsed into an un-auditable taste decision.</p>
<p class="links"><a href="code-block-primitive-babble-2026-09-05.html">Open all five proposals</a><a href="../sketches/review/code-block-primitive.systemsketch">Open guided review board</a><a href="../tests/code_block_primitive_smoke.mjs">Open the real-browser journey</a><a href="build_code_block_primitive.py">Open this gallery builder</a><a href="../README.md">Project README</a></p>
<footer>Generated by <code>docs/build_code_block_primitive.py</code> from the passing <code>docs/code-block-primitive-results-2026-09-05.json</code>. The screenshot is embedded, so this report remains standalone.</footer>
</main></body></html>"""
    OUTPUT.write_text(source, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
