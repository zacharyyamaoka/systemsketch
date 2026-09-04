"""Build a self-contained, test-backed stock-tldr capability report."""
from __future__ import annotations

from pathlib import Path


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "stock-tldr-capabilities-2026-09-03.html"


def main() -> None:
    OUTPUT.write_text("""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>What stock tldraw can represent · SystemSketch</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#152033;background:#f4f7fb;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:46px 28px 72px}.eyebrow{font-size:12px;font-weight:800;color:#3869d8;letter-spacing:.09em;text-transform:uppercase}h1{font-size:clamp(34px,6vw,62px);line-height:.96;letter-spacing:-.052em;margin:10px 0 16px}h2{margin:42px 0 12px;letter-spacing:-.025em}p,li{line-height:1.58}.lede{max-width:850px;font-size:18px;color:#536275}.callout{border-left:4px solid #316ae8;background:#eaf0ff;padding:16px 18px;border-radius:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{background:#fff;border:1px solid #dce4ef;border-radius:15px;padding:20px}.yes{border-top:4px solid #20a06d}.limit{border-top:4px solid #d98125}.chip{display:inline-block;padding:4px 8px;border-radius:999px;background:#ecf8f1;color:#16704b;font:700 11px ui-monospace,monospace}.no{background:#fff4e9;color:#a85712}table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #dce4ef;border-radius:14px;overflow:hidden}th,td{padding:14px 16px;text-align:left;vertical-align:top;border-bottom:1px solid #e7edf5}tr:last-child>*{border-bottom:0}thead{background:#f0f4fa}code{font:600 .92em ui-monospace,SFMono-Regular,Menlo,monospace}.diagram{display:block;width:100%;height:auto;margin:14px 0;border-radius:12px;background:#111a2c}.small{color:#617187;font-size:14px}.links a{margin-right:16px}@media(max-width:720px){main{padding:30px 16px}.grid{grid-template-columns:1fr}table{font-size:13px}th,td{padding:10px}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · stock portability audit · 3 September 2026</div>
<h1>“Stock only” is not “only four font sizes.”</h1>
<p class="lede">For detach, stock only means the saved result contains ordinary tldraw records—<code>arrow</code>, <code>frame</code>, <code>geo</code>, <code>group</code>, <code>line</code>, and <code>text</code>—with their documented properties. No SystemSketch shape utility or custom paint layer is required to read it. It does <em>not</em> forbid using stock text scale, rich text, or curved stock arrows.</p>
<div class="callout"><strong>Verified in the running app, not inferred from a screenshot.</strong> <code>npm run test:stock-tldr-primitives</code> performs a real detach, serializes it, renders that result through the isolated stock renderer, and asserts a 36px heading, a 18px Branch title, an 11px active label, an arc with a non-zero bend, and an elbow arrow.</div>

<svg class="diagram" viewBox="0 0 1060 280" role="img" aria-label="Stock text scaling and arrow kinds diagram"><style>.t{font:600 17px ui-monospace,monospace;fill:#e9efff}.m{font:14px Inter,sans-serif;fill:#aebdd9}.l{stroke:#7994bf;stroke-width:2;fill:none}.a{stroke:#72d3a1;stroke-width:3;fill:none}.p{fill:#6fa5ff}.b{fill:#f2aa55}</style><text class="t" x="40" y="42">text = base size × stock scale</text><text class="m" x="40" y="68">s=18px · m=24px · l=36px · xl=44px</text><text class="t" x="40" y="122" style="font-size:36px">normalize()</text><text class="m" x="40" y="153">l × 1 = 36px heading</text><text class="t" x="40" y="195" style="font-size:13px">is valid</text><text class="m" x="40" y="218">s × 13/18 = 13px control label</text><text class="t" x="40" y="252" style="font-size:11px">active</text><text class="m" x="116" y="252">s × 11/18</text><path class="l" d="M620 68 H960"/><circle class="p" cx="620" cy="68" r="7"/><circle class="p" cx="960" cy="68" r="7"/><text class="t" x="620" y="42">elbow / straight segments</text><path class="a" d="M620 158 C725 76 840 240 960 158"/><circle class="b" cx="620" cy="158" r="7"/><circle class="b" cx="960" cy="158" r="7"/><text class="t" x="620" y="218">arc + non-zero bend = curve</text></svg>

<h2>What the pinned stock model can do</h2>
<div class="grid">
<section class="card yes"><span class="chip">SUPPORTED</span><h3>Exact effective text sizes</h3><p>Text has the stock size presets <code>s/m/l/xl</code>, and every text record also has non-zero numeric <code>scale</code>. We now emit <code>l × 1</code> for Block headings (36px), <code>s × 13/18</code> for Branch controls, <code>s × 12.5/18</code> for Loop labels, and <code>s × 11/18</code> for active/turn labels.</p></section>
<section class="card yes"><span class="chip">SUPPORTED</span><h3>Curves and elbows</h3><p>Stock <code>arrow</code> has <code>kind: 'arc'</code> and a numeric <code>bend</code>; it also has <code>kind: 'elbow'</code>. Detached curved connections become an arc with bend 32, while elbow connections remain elbow arrows. Both were asserted and rendered in the isolated stock pass.</p></section>
<section class="card yes"><span class="chip">SUPPORTED</span><h3>Bold signal and basic typography</h3><p>Stock rich text supports marks, including bold. Detached active arm names, <code>active</code>, and Loop turn labels carry that ordinary rich-text mark. The stock font choices include draw, sans, serif, and mono.</p></section>
<section class="card yes"><span class="chip">SUPPORTED</span><h3>Port and target geometry</h3><p>Stock <code>geo: 'ellipse'</code> represents the 18px port rim, a 12px wired core, and the active target’s 11px blue disk plus 3.6px raised-surface disk. Header-edge dots are materialised as normal stock geo siblings so a Frame cannot clip half of the circle.</p></section>
</div>

<h2>Real limits of a plain stock file</h2>
<table><thead><tr><th>Authored feature</th><th>Why it cannot be literal in bare stock tldraw</th><th>Detach treatment</th></tr></thead><tbody>
<tr><th>Exact Inter / JetBrains Mono face, CSS 500/600, tracking and line-height</th><td>A bare stock text record chooses a named stock font family and rich-text marks; it has no per-record arbitrary CSS family, numeric weight, letter-spacing, or line-height property.</td><td>Use stock sans/mono, actual effective font sizes, and bold where it carries meaning. The remaining glyph/spacing residual is visible in the heat maps rather than hidden behind custom paint.</td></tr>
<tr><th>Arbitrary hex port colours</th><td>Stock <code>color</code> is a palette style, not a per-shape CSS hex. The authored <code>#c08520</code> “any” port has no identical default stock palette value.</td><td>Nearest named stock palette colour; preserve geometry and connection state exactly.</td></tr>
<tr><th>One Frame child that crosses the Frame wall</th><td>Stock Frames clip their direct children. A live Region port deliberately straddles the wall.</td><td>The ring and optional core become editable sibling stock geo records, rather than being covered by a custom clipping exception. This is the smallest honest stock composition; a port can be independently repositioned after detach.</td></tr>
<tr><th>SystemSketch semantic routing and port identity</th><td>A stock arrow knows endpoints, bend/elbow geometry, dash, heads, and bindings—not a port id, temporal semantics, or the custom router’s future reroute policy.</td><td>Preserve a readable stock arc/elbow and dash convention; keep optional ignored metadata solely for SystemSketch’s rebuild path.</td></tr>
<tr><th>Custom rounded card, shadow, and background blend</th><td>Stock geo has its own shapes, palette, fills, and stroke-size vocabulary rather than arbitrary CSS radius/shadow/filter values.</td><td>Use stock rectangle/oval/ellipse/line primitives. The composite heat maps disclose the residual.</td></tr>
</tbody></table>

<h2>Evidence and measured visual residual</h2>
<p>The companion comparison uses the same camera before and after an actual right-click command for Block, Branch, Loop, and connection. It publishes every before/after/difference heat map and does not call the result pixel-identical. The requested <code>/llm-judge</code> command is not installed in this repository or this session; the test-backed stock renderer plus pixel heat maps are the available evidence.</p>
<p class="links"><a href="detach-composite-fidelity-2026-09-03.html">Open composite heat-map gallery</a><a href="../tests/stock_tldr_primitives_smoke.mjs">Open live stock proof</a><a href="../node_modules/@tldraw/tlschema/src/shapes/TLTextShape.ts">Text schema</a><a href="../node_modules/@tldraw/tlschema/src/shapes/TLArrowShape.ts">Arrow schema</a></p>
<p class="small">Built by <code>docs/build_stock_tldr_capabilities.py</code>. Sources checked: pinned tldraw text and arrow schemas, stock size constants, and the real-browser proof above.</p>
</main></body></html>""", encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
