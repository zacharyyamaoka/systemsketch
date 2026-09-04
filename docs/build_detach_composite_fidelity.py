"""Build the self-contained real-browser detach evidence gallery."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
ACCEPTANCE = ASSETS / "detach-composite-fidelity-acceptance.json"
OUTPUT = DOCS / "detach-composite-fidelity-2026-09-03.html"


def image_uri(filename: str) -> str:
    path = ASSETS / filename
    if not path.is_file():
        raise SystemExit(f"missing captured evidence: {path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    proof = json.loads(ACCEPTANCE.read_text(encoding="utf-8"))
    checks = proof["checks"]
    if not all(checks.values()):
        raise SystemExit(f"cannot publish a failing proof: {checks}")

    rows = []
    figures = []
    for result in proof["results"]:
        name = str(result["name"])
        score = result["score"]
        rows.append(f"""
          <tr><th scope=\"row\">{html.escape(name.title())}</th>
            <td>{score['score']:.6f}</td><td>{score['wholeSimilarity']:.6f}</td>
            <td>{score['foregroundSimilarity']:.6f}</td><td>{score['edgeSimilarity']:.6f}</td></tr>""")
        figures.append(f"""
          <section class=\"workflow\" id=\"{html.escape(name)}\">
            <header><h3>{html.escape(name.title())}</h3><p>Same camera · real context-menu command · score {score['score']:.6f}</p></header>
            <div class=\"triptych\">
              <figure><img alt=\"{html.escape(name)} before detach\" src=\"{image_uri(result['before'])}\"><figcaption>Before</figcaption></figure>
              <figure><img alt=\"{html.escape(name)} after detach\" src=\"{image_uri(result['after'])}\"><figcaption>After — stock primitives</figcaption></figure>
              <figure><img alt=\"{html.escape(name)} pixel-difference heat map\" src=\"{image_uri(result['diff'])}\"><figcaption>Pixel difference heat map</figcaption></figure>
            </div>
          </section>""")

    source = """<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>Detach to stock primitives · SystemSketch</title>
<style>
  :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #182230; background: #f5f7fb; }
  * { box-sizing: border-box; } body { margin: 0; } main { max-width: 1440px; margin: 0 auto; padding: 46px 28px 68px; }
  .eyebrow { color: #356ae6; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
  h1 { margin: 8px 0 12px; font-size: clamp(32px, 5vw, 58px); letter-spacing: -.045em; line-height: .98; }
  h2 { margin: 36px 0 12px; letter-spacing: -.025em; } h3 { margin: 0; font-size: 22px; }
  p { line-height: 1.55; } .lede { max-width: 880px; color: #526174; font-size: 18px; }
  .note { border-left: 4px solid #356ae6; background: #eaf0ff; padding: 16px 18px; border-radius: 8px; max-width: 960px; }
  .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 26px 0; }
  .fact { padding: 18px; border: 1px solid #dce3ef; border-radius: 12px; background: white; } .fact b { display: block; font-size: 25px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; background: white; border: 1px solid #dce3ef; border-radius: 12px; overflow: hidden; }
  th, td { padding: 13px 16px; text-align: left; border-bottom: 1px solid #e8edf5; font-variant-numeric: tabular-nums; } tr:last-child > * { border-bottom: 0; } thead { background: #f1f5fb; }
  .workflow { margin: 32px 0; padding: 22px; background: white; border: 1px solid #dce3ef; border-radius: 16px; box-shadow: 0 5px 20px #1b315508; }
  .workflow header { display: flex; align-items: baseline; gap: 16px; justify-content: space-between; } .workflow header p { margin: 5px 0 16px; color: #66758a; }
  .triptych { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; } figure { margin: 0; border: 1px solid #e2e8f1; border-radius: 10px; overflow: hidden; background: #fafcff; }
  img { width: 100%; display: block; aspect-ratio: 1.5; object-fit: contain; background: #fff; } figcaption { padding: 9px 11px; font-size: 14px; color: #526174; }
  footer { color: #66758a; font-size: 14px; margin-top: 42px; } code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  @media (max-width: 760px) { main { padding: 28px 16px; } .facts, .triptych { grid-template-columns: 1fr; } .workflow header { display: block; } table { font-size: 13px; } th, td { padding: 10px; } }
</style></head><body><main>
<div class=\"eyebrow\">SystemSketch · 3 September 2026</div>
<h1>Detach every authored composite to stock primitives</h1>
<p class=\"lede\">A real right-click journey covers an ordinary Block, a Branch, a For Loop, and a semantic connection. The Loop now offers the same command as the other authored containers; Branch and Loop become fresh stock Frames so their children and bound arrows survive without custom renderers. This pass uses the authored effective text sizes (including the 36px Block heading and 11px active/turn labels), 18px port rings, aligned rules, and the active target’s two stock ellipses.</p>
<div class=\"note\"><strong>How to read these pixels.</strong> The browser captured the same canvas rectangle immediately before and after the actual context-menu action. The deterministic heat map measures visual continuity; it is evidence, not a claim that a stock Frame is pixel-identical to a custom authored surface. See <a href=\"stock-tldr-capabilities-2026-09-03.html\">the stock capability audit</a> for the tested boundary. The requested <code>/llm-judge</code> command was not available in this workspace.</div>
<div class=\"facts\"><div class=\"fact\"><b>4 / 4</b>live menu workflows completed</div><div class=\"fact\"><b>0</b>shape Error fallbacks or console errors</div><div class=\"fact\"><b>stock only</b>arrow · frame · group · geo · line · text</div></div>
<h2>Measured same-camera comparison</h2>
<table><thead><tr><th>Workflow</th><th>Composite</th><th>Whole</th><th>Foreground</th><th>Edges</th></tr></thead><tbody>""" + "".join(rows) + """</tbody></table>
<p>The composite metric weights whole-crop continuity, subject foreground, and edge detail. Structural assertions additionally require every original semantic subject to be gone, replacement Branch/Loop stock Frames to exist, and the live page to report no console errors.</p>
<h2>Captured workflows</h2>""" + "".join(figures) + """
<footer>Generated from <code>docs/assets/detach-composite-fidelity-acceptance.json</code> by <code>docs/build_detach_composite_fidelity.py</code>. All images are embedded in this standalone file.</footer>
</main></body></html>"""
    OUTPUT.write_text(source, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
