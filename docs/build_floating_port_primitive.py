"""Build the self-contained review gallery for the free Port primitive."""
from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
LIVE = DOCS / "assets" / "floating-port-live-2026-09-04.png"
FIXTURE = ROOT / "sketches" / "review" / "floating-port.png"
OUTPUT = DOCS / "floating-port-primitive-2026-09-04.html"


def data_image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    live = data_image(LIVE)
    fixture = data_image(FIXTURE)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Floating Port primitive</title>
<style>
  :root {{ color-scheme:light; --ink:#142034; --muted:#627087; --paper:#f4f7fb; --card:#fff; --line:#d8e0ec; --blue:#347eef; --orange:#f09b32; --green:#16824a; --bluewash:#edf5ff; --greenwash:#ecfaf1; font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink) }} main {{ width:min(1160px,calc(100% - 36px)); margin:auto; padding:56px 0 86px }}
  .eyebrow {{ color:#2365c4; font:750 12px/1 ui-monospace,SFMono-Regular,monospace; letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:900px; margin:14px 0 16px; font-size:clamp(42px,7vw,74px); line-height:.94; letter-spacing:-.06em }} .lede {{ max-width:800px; margin:0; color:var(--muted); font-size:20px; line-height:1.6 }}
  .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:26px }} .chip {{ border:1px solid var(--line); border-radius:999px; background:#fff; padding:8px 11px; color:var(--muted); font:650 12px/1 ui-monospace,SFMono-Regular,monospace }} .chip.ok {{ border-color:#b9e0c8; background:var(--greenwash); color:var(--green) }}
  section {{ margin-top:58px }} h2 {{ margin:0 0 11px; font-size:30px; letter-spacing:-.04em }} .sub {{ max-width:810px; margin:0 0 23px; color:var(--muted); line-height:1.65 }} figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:20px; background:#fff; box-shadow:0 16px 40px rgba(26,48,82,.08) }} figure img {{ display:block; width:100%; height:auto }} figcaption {{ border-top:1px solid var(--line); padding:15px 19px 17px; color:var(--muted); font-size:14px; line-height:1.55 }}
  .anatomy {{ display:grid; grid-template-columns:1.2fr 1fr; gap:18px; align-items:stretch }} .dot-card,.details,.boundary {{ border:1px solid var(--line); border-radius:18px; background:var(--card) }} .dot-card {{ display:flex; align-items:center; gap:22px; padding:27px }} .port-dot {{ width:32px; height:32px; flex:0 0 auto; border:3px solid var(--orange); border-radius:50%; background:#fff }} .port-copy b {{ display:block; font-size:19px }} .port-copy span {{ color:var(--muted); line-height:1.5 }} .details {{ display:grid; grid-template-columns:1fr 1fr; gap:0; overflow:hidden }} .detail {{ min-height:96px; padding:18px; border-bottom:1px solid var(--line) }} .detail:nth-child(odd) {{ border-right:1px solid var(--line) }} .detail:nth-last-child(-n+2) {{ border-bottom:0 }} .detail b {{ display:block; margin-bottom:7px; font-size:14px }} .detail small {{ color:var(--muted); line-height:1.45 }}
  .flow {{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; align-items:stretch }} .step {{ min-height:135px; padding:18px; border:1px solid var(--line); border-radius:17px; background:#fff }} .step b {{ display:block; margin-bottom:9px; font-size:15px }} .step small {{ color:var(--muted); line-height:1.5 }} .arrow {{ align-self:center; color:#98a6b9; font-size:25px; text-align:center }}
  table {{ width:100%; border:1px solid var(--line); border-spacing:0; border-radius:18px; overflow:hidden; background:#fff }} th,td {{ padding:14px 16px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; line-height:1.5 }} th {{ background:#f8faff; color:#69778c; font-size:11px; letter-spacing:.09em; text-transform:uppercase }} tr:last-child td {{ border-bottom:0 }} code {{ padding:2px 5px; border-radius:5px; background:#edf1f6; font:600 12px/1.4 ui-monospace,SFMono-Regular,monospace }} .boundary {{ padding:23px 25px; background:var(--bluewash); border-color:#cfe1fb; line-height:1.68 }} footer {{ margin-top:56px; color:var(--muted); font-size:13px; line-height:1.6 }}
  @media(max-width:780px) {{ .anatomy {{ grid-template-columns:1fr }} .flow {{ grid-template-columns:1fr }} .arrow {{ transform:rotate(90deg) }} .detail:nth-child(odd) {{ border-right:0 }} .details {{ grid-template-columns:1fr }} .detail:nth-last-child(2) {{ border-bottom:1px solid var(--line) }} }}
</style></head><body><main>
<p class="eyebrow">SystemSketch · implementation review · 2026-09-04</p>
<h1>A Port is now its own primitive.</h1>
<p class="lede">A tiny circular endpoint can sit anywhere on the canvas, carry a typed value, and wire directly into or out of a Block. It keeps the useful semantics of a Block port without requiring a containing card.</p>
<div class="chips"><span class="chip ok">6/6 live browser checks</span><span class="chip">Port → Block → Port</span><span class="chip">derived or explicit fill</span><span class="chip">stock tldraw seams</span></div>
<section><h2>Live proof</h2><p class="sub">This real product capture shows a free output Port wired into <code>integrate()</code>, a Block output wired back to a free input Port, and the selected source’s compact inspector. Its label is raised so the wire can pass cleanly beneath it.</p><figure><img src="{live}" alt="SystemSketch canvas with two free Ports wired through a Block and a Port inspector"><figcaption><b>Actual browser canvas.</b> The source Port is set to <code>speed · float = 7.2</code>, Output, Offset, and Auto. Its fill is currently derived from the cable, not painted as a one-off status.</figcaption></figure></section>
<section><h2>Four visible parts, one stable endpoint</h2><div class="anatomy"><div class="dot-card"><span class="port-dot"></span><div class="port-copy"><b>One circular Port</b><span>The dot is the one durable connection endpoint (<code>port</code>). A rename never silently retargets its cables.</span></div></div><div class="details"><div class="detail"><b>1 · Dot</b><small>Socket paint is shared with existing Block ports.</small></div><div class="detail"><b>2 · Name</b><small>The semantic label, editable in the Port panel.</small></div><div class="detail"><b>3 · Type</b><small>Typed alongside the name, and used by cable compatibility.</small></div><div class="detail"><b>4 · Value</b><small>Optional, concise <code>= value</code> readout on the canvas.</small></div></div></div></section>
<section><h2>Interaction contract</h2><div class="flow"><div class="step"><b>1 · Add Port</b><small>Choose <b>Port</b> from the existing System family menu, then click the canvas.</small></div><div class="arrow">→</div><div class="step"><b>2 · Configure</b><small>Name, Type, Value, input/output direction, and inline/offset text all live in its own inspector.</small></div><div class="arrow">→</div><div class="step"><b>3 · Wire or move</b><small>Drag from the dot like any existing port; drag the label to reposition the entire primitive.</small></div></div></section>
<section><h2>State and presentation</h2><table><thead><tr><th>Choice</th><th>Canvas result</th><th>Why it exists</th></tr></thead><tbody><tr><td><b>Input / Output</b></td><td>Label faces left or right; the same dot becomes a cable sink or source.</td><td>It can bridge a Block boundary in either direction.</td></tr><tr><td><b>Inline / Offset</b></td><td>Text stays with the dot or lifts above it with a short leader.</td><td>Offset keeps a busy cable legible without introducing a special wire route.</td></tr><tr><td><b>Auto / Filled / Empty</b></td><td>Auto reacts to actual bindings; Filled and Empty temporarily force the visual state.</td><td>Derived behavior remains the default, while sketches can make an intentional exception visible.</td></tr></tbody></table></section>
<section><h2>Review board</h2><p class="sub">The disposable board already has two real cables and three numbered gestures: edit the source, override then restore Auto fill, and move the independent input Port. Its orange cues remain attached while the target moves.</p><figure><img src="{fixture}" alt="Floating Port review board with numbered orange instructions and green pass card"><figcaption><b>Human review fixture.</b> It opens as an ordinary <code>.systemsketch</code> board, not a hand-drawn mockup.</figcaption></figure></section>
<section><h2>Deliberate boundary</h2><div class="boundary"><b>Free placement wins for now.</b> The original idea considered snapping a Port to primitive edges, then correctly withdrew it: a Port is the compositional atom, so it stays exactly where its author drops it until the app has one shared edge-snapping grammar. The implementation deliberately uses stock selection and drag behavior rather than recreating a movement system, and lowers Port shapes to ordinary primitives for portable export.</div></section>
<footer>Evidence: <code>npm run test:floating-port</code> (6 live checks), <code>npm run test:export</code> (11 portable-export checks), the cold-reopened review-fixture generation, and a real saved-fixture drive. Source: <code>src/floatingPort/</code>, <code>src/blocks/connections/blockPorts.ts</code>, and <code>sketches/review/floating-port.systemsketch</code>.</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
