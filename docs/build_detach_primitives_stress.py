"""Build the standalone fifty-case detach regression gallery."""
from __future__ import annotations

import base64
import html
import json
from collections import defaultdict
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
PROOF = ASSETS / "detach-primitives-stress-acceptance.json"
OUTPUT = DOCS / "detach-primitives-stress-2026-09-03.html"


def image_uri(name: str) -> str:
    source = ASSETS / name
    if not source.is_file():
        raise SystemExit(f"missing captured evidence: {source}")
    return "data:image/png;base64," + base64.b64encode(source.read_bytes()).decode("ascii")


def main() -> None:
    proof = json.loads(PROOF.read_text(encoding="utf-8"))
    if not all(proof["checks"].values()):
        raise SystemExit(f"cannot publish failing proof: {proof['checks']}")

    grouped: dict[str, list[dict]] = defaultdict(list)
    for case in proof["cases"]:
        grouped[case["category"]].append(case)
    ordered_categories = ["blocks", "branches", "loops", "multi-elbows", "nested"]
    cases = proof["cases"]
    scores = [case["score"]["score"] for case in cases]

    category_html: list[str] = []
    for category in ordered_categories:
        cards = []
        for case in grouped[category]:
            score = case["score"]
            cards.append(f"""
              <article class=\"case\">
                <header><span class=\"number\">{case['ordinal']:02d}</span><h3>{html.escape(case['title'])}</h3></header>
                <p class=\"score\">visual continuity <b>{score['score']:.3f}</b> · foreground {score['foregroundSimilarity']:.3f}</p>
                <div class=\"triptych\">
                  <figure><img alt=\"{html.escape(case['title'])} before detach\" src=\"{image_uri(case['before'])}\"><figcaption>Authored</figcaption></figure>
                  <figure><img alt=\"{html.escape(case['title'])} after detach\" src=\"{image_uri(case['after'])}\"><figcaption>Stock primitives</figcaption></figure>
                  <figure><img alt=\"{html.escape(case['title'])} pixel difference heat map\" src=\"{image_uri(case['diff'])}\"><figcaption>Heat map</figcaption></figure>
                </div>
              </article>""")
        category_html.append(f"""
          <section class=\"family\" id=\"{category}\">
            <div class=\"family-title\"><p class=\"eyebrow\">10 cases · easy → hard</p><h2>{html.escape(category.replace('-', ' ').title())}</h2></div>
            <div class=\"cases\">{''.join(cards)}</div>
          </section>""")

    stock_viewer_file = proof["stockViewer"]
    source = f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>50-case detach stress gallery · SystemSketch</title>
<style>
 :root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color:#172033; background:#f5f7fb; }}
 * {{ box-sizing:border-box }} body {{ margin:0 }} main {{ max-width:1600px; margin:0 auto; padding:48px 28px 76px }}
 .eyebrow {{ margin:0; color:#356ae6; font-size:12px; letter-spacing:.1em; font-weight:780; text-transform:uppercase }}
 h1 {{ max-width:1040px; margin:9px 0 15px; letter-spacing:-.052em; line-height:.94; font-size:clamp(38px,6vw,74px) }} h2 {{ margin:4px 0 20px; letter-spacing:-.032em; font-size:34px }} h3 {{ margin:0; font-size:15px; line-height:1.23 }} p {{ line-height:1.55 }}
 .lede {{ max-width:970px; color:#526174; font-size:18px }} .note {{ max-width:1080px; border-left:4px solid #356ae6; background:#eaf0ff; padding:16px 19px; border-radius:8px; margin:26px 0 }}
 .facts {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin:26px 0 38px }} .fact {{ background:white; border:1px solid #dce3ef; border-radius:13px; padding:17px }} .fact b {{ display:block; font-size:26px; letter-spacing:-.035em }} .fact span {{ color:#596a81; font-size:13px }}
 .stock {{ background:#172033; color:#fff; border-radius:18px; overflow:hidden; margin:42px 0 54px }} .stock .copy {{ padding:26px 28px 4px }} .stock h2 {{ font-size:29px }} .stock p {{ color:#d2dced; max-width:900px }} .stock img {{ width:100%; display:block; background:white; margin-top:18px; border-top:1px solid #40506a }} .stock a {{ color:#a9c5ff; font-weight:700 }}
 .family {{ margin:52px 0 }} .family-title {{ display:flex; gap:16px; align-items:baseline; border-bottom:1px solid #dce3ef; margin-bottom:18px }} .family-title h2 {{ margin-bottom:16px }}
 .cases {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px }} .case {{ min-width:0; padding:15px; background:white; border:1px solid #dce3ef; border-radius:14px; box-shadow:0 4px 16px #16305508 }} .case header {{ min-height:40px; display:flex; gap:10px; align-items:flex-start }} .number {{ flex:none; font:700 12px ui-monospace,SFMono-Regular,monospace; color:#356ae6; padding-top:2px }} .score {{ margin:6px 0 11px; color:#66758a; font-size:12px }} .score b {{ color:#273d63; font-variant-numeric:tabular-nums }}
 .triptych {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px }} figure {{ margin:0; overflow:hidden; border:1px solid #e2e8f1; border-radius:8px; background:#fff }} figure img {{ display:block; width:100%; aspect-ratio:1.43; object-fit:contain }} figcaption {{ padding:6px 8px; color:#61728a; font-size:11px }} footer {{ color:#66758a; font-size:13px; margin-top:50px }} code {{ font-family:ui-monospace,SFMono-Regular,monospace }}
 @media(max-width:900px) {{ main {{ padding:30px 16px }} .facts,.cases {{ grid-template-columns:1fr }} .family-title {{ display:block }} }}
</style></head><body><main>
<p class=\"eyebrow\">SystemSketch · 3 September 2026 · regression evidence</p>
<h1>50 detach workflows, from friendly cards to authored multi-elbows</h1>
<p class=\"lede\">This is one generated, browser-driven regression matrix: ten Blocks across Simple, Port, and Expanded views; ten Branch states; ten Loop states; ten authored multi-elbow routes; and ten nested container/Expanded-Block combinations. Each card is the same camera crop captured immediately before and after its own live context-menu command.</p>
<div class=\"note\"><strong>“Stock” is measured as renderability.</strong> After all 50 commands, the exported <code>.tldr</code> is opened by the bare <code>?stock-viewer=</code> route: default tldraw schema, default shape utilities, default binding utilities, and no SystemSketch registrations. The mounted viewer has zero error boundaries and sees only arrow, geo, group, line, and text records. An authored multi-elbow becomes one native stock <code>line</code> with its full point list—not a one-midpoint Arrow reroute.</div>
<section class=\"facts\"><div class=\"fact\"><b>50 / 50</b><span>live detach commands</span></div><div class=\"fact\"><b>5 × 10</b><span>primitive families</span></div><div class=\"fact\"><b>{min(scores):.3f}–{max(scores):.3f}</b><span>same-camera visual continuity</span></div><div class=\"fact\"><b>0</b><span>custom shapes or stock viewer errors</span></div></section>
<section class=\"stock\"><div class=\"copy\"><p class=\"eyebrow\">Bare stock tldraw viewer</p><h2>One full exported document, opened without SystemSketch code</h2><p>The screenshot below was taken after the 50-case exported file mounted in the default viewer. It contains 113 native stock Lines, including all ten frozen authored routes. <a href=\"/?stock-viewer=/docs/assets/{html.escape(proof['stockFile'])}\">Open the same `.tldr` in the bare stock viewer →</a></p></div><img alt=\"50-case exported document mounted in the bare stock tldraw viewer\" src=\"{image_uri(stock_viewer_file)}\"></section>
{''.join(category_html)}
<footer>Generated from <code>tests/detach_primitives_stress_smoke.mjs</code> and <code>docs/assets/detach-primitives-stress-acceptance.json</code>. Every image is embedded so this file is standalone; the linked viewer loads the separately generated stock <code>.tldr</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(source, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
