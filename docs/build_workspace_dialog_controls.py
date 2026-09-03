#!/usr/bin/env python3
"""Build the self-contained workspace-dialog controls audit gallery."""

from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
RESULTS = ASSETS / "workspace-dialog-controls" / "theme-contrast.json"
OUTPUT = DOCS / "workspace-dialog-controls-2026-09-02.html"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def data_uri(name: str) -> str:
    raw = (ASSETS / name).read_bytes()
    return f"data:image/png;base64,{base64.b64encode(raw).decode('ascii')}"


def probe(theme: dict, label: str) -> dict:
    return next(item for item in theme["probes"] if item["label"] == label)


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    themes = {theme["id"]: theme for theme in results["themes"]}
    light = themes["systemsketch:light"]
    dark_modern = themes["dark-modern"]
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached"
    images = {
        name: data_uri(name)
        for name in (
            "workspace-open-light-before.png",
            "workspace-open-light-after.png",
            "workspace-open-dark-after.png",
            "workspace-open-light-after-900px.png",
        )
    }

    rows = []
    for theme in results["themes"]:
        rows.append(
            "<tr>"
            f"<td>{theme['label']}</td>"
            f"<td>{probe(theme, 'workspace place label')['ratio']}:1</td>"
            f"<td>{probe(theme, 'workspace place path')['ratio']}:1</td>"
            f"<td>{probe(theme, 'workspace recent label')['ratio']}:1</td>"
            f"<td>{probe(theme, 'workspace parent-folder icon')['ratio']}:1</td>"
            "</tr>"
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch workspace dialog controls · 2026-09-02</title>
<style>
:root{{--paper:#f1eee7;--card:#fffdf9;--ink:#20242b;--muted:#5d6671;--line:#d5d1c7;--blue:#2869db;--green:#1f7652;--green-soft:#e7f6ed;--orange:#a95517;--orange-soft:#fff0e3;--shadow:0 16px 48px rgb(34 39 46 / 12%)}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;color:var(--ink);background:linear-gradient(180deg,#e8e4dc 0,#f7f4ed 560px);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}a{{color:var(--blue)}}
main{{width:min(1480px,calc(100% - 36px));margin:auto;padding:48px 0 80px}}.eyebrow{{color:var(--blue);font:800 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}
h1{{max-width:1050px;margin:14px 0 16px;font-size:clamp(42px,6vw,76px);line-height:.98;letter-spacing:-.05em}}.lead{{max-width:940px;margin:0;color:#4d5661;font-size:19px}}
.summary{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:30px 0}}.metric{{padding:16px;border:1px solid var(--line);border-radius:15px;background:rgb(255 253 249 / 86%);box-shadow:0 4px 18px rgb(34 39 46 / 5%)}}.metric b{{display:block;font-size:25px}}.metric span{{color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}}.metric.good b{{color:var(--green)}}
.pair,.evidence-grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow)}}figure img{{display:block;width:100%;height:auto;background:#eef0f2}}figcaption{{padding:12px 15px;color:var(--muted);font-size:12px}}figcaption b{{display:block;color:var(--ink);font-size:13px}}
.section-head{{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:50px 0 16px}}.section-head h2{{margin:0;font-size:29px;letter-spacing:-.025em}}.section-head p{{max-width:690px;margin:0;color:var(--muted)}}
.issue{{margin-bottom:22px;padding:22px;border:1px solid var(--line);border-radius:20px;background:rgb(255 253 249 / 95%);box-shadow:var(--shadow)}}.issue-head{{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:16px}}.issue-head h3{{margin:0 auto 0 0;font-size:22px}}.badge{{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}}.fixed{{color:var(--green);background:var(--green-soft)}}.priority{{color:var(--orange);background:var(--orange-soft)}}.classify{{color:#395177;background:#e8eff8}}
.facts{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}}.fact{{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}}.fact b{{display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}}.fact p,.fact ol{{margin:0;color:var(--muted)}}.fact ol{{padding-left:18px}}code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}}
.review{{display:grid;grid-template-columns:auto 1fr;gap:10px 14px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}}.review label{{font-weight:750}}.review textarea{{grid-column:2;width:100%;min-height:72px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;resize:vertical}}.review input{{width:18px;height:18px;accent-color:var(--green)}}
.audit-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.audit-card{{padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}}.audit-card h3{{margin:0 0 8px}}.audit-card ul{{margin:0;padding-left:19px;color:var(--muted)}}table{{width:100%;border-collapse:collapse;border:1px solid var(--line);background:var(--card)}}th,td{{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left}}th{{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}}
.actions{{position:sticky;z-index:2;bottom:12px;display:flex;justify-content:flex-end;gap:8px;margin-top:28px}}.actions button{{padding:10px 14px;border:1px solid #bfc5cd;border-radius:10px;color:var(--ink);background:#fff;box-shadow:var(--shadow);cursor:pointer;font-weight:750}}.actions button.primary{{color:#fff;background:var(--blue);border-color:var(--blue)}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:750}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}
@media(max-width:900px){{main{{width:min(100% - 20px,1480px);padding-top:28px}}.summary{{grid-template-columns:repeat(2,1fr)}}.pair,.evidence-grid,.facts,.audit-grid{{grid-template-columns:1fr}}h1{{font-size:42px}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · UI audit · 2026-09-02</div>
<h1>Every workspace control now owns its ink.</h1>
<p class="lead">The in-app Open dialog inherited white native-button text from the desktop while its Light surfaces stayed pale. SystemSketch now establishes themed text and typography once at the workspace-dialog boundary, then deliberately strengthens the selected location’s secondary path.</p>

<div class="summary">
  <div class="metric good"><b>0</b><span>Open</span></div>
  <div class="metric good"><b>2</b><span>Fixed + verified</span></div>
  <div class="metric"><b>0</b><span>Unconfirmed</span></div>
  <div class="metric"><b>13 × 5</b><span>Dialog probes</span></div>
  <div class="metric good"><b>{results['passed']}/{results['passed'] + results['failed']}</b><span>Full theme checks</span></div>
</div>

<section class="pair" aria-label="Primary before and after evidence">
  <figure><img src="{images['workspace-open-light-before.png']}" alt="Light Open dialog with nearly invisible white sidebar labels"><figcaption><b>Before · reproduced in the untouched UI</b>Places, Recent names, and the parent-folder arrow were native white controls on pale surfaces.</figcaption></figure>
  <figure><img src="{images['workspace-open-light-after.png']}" alt="Light Open dialog with readable dark sidebar labels"><figcaption><b>After · the same Light journey</b>Primary labels, secondary paths, breadcrumbs, Filter, empty state, and actions now have an intentional hierarchy.</figcaption></figure>
</section>

<div class="section-head"><h2>Implemented findings</h2><p>Both findings were discovered in the running app, fixed at the shared theme seam, and added to the browser regression matrix.</p></div>

<article class="issue" data-item="native-buttons">
  <div class="issue-head"><h3>Open-dialog navigation vanished in Light</h3><span class="badge priority">P1</span><span class="badge classify">Product bug</span><span class="badge fixed">Fixed and verified</span></div>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p>White desktop-native button ink on Light’s pale sidebar and path bar → the active theme’s <code>--ss-text</code> with the app typeface.</p></div>
    <div class="fact"><b>Reproduction</b><ol><li>Choose Light.</li><li>Open File → Open.</li><li>Inspect Places, Recent, and the parent-folder arrow.</li></ol></div>
    <div class="fact"><b>Concrete proof</b><p>Light now measures {probe(light, 'workspace place label')['ratio']}:1 for the selected Place and {probe(light, 'workspace parent-folder icon')['ratio']}:1 for the parent arrow; all five themes pass.</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p><code>.systemsketch-workspace-dialog button</code> styled shape and spacing but did not claim native <code>color</code>. One boundary rule now covers navigation, breadcrumbs, icons, and actions while specific states still override it.</p></div>
  </div>
  <p><b>Acceptance check.</b> Every Open-dialog label and icon is readable in each shipped theme, without introducing Light/Dark branches; Rename remains readable from the earlier form-control repair.</p>
  <div class="review"><input id="keep-native-buttons" type="checkbox" data-review-checkbox checked><label for="keep-native-buttons">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for themed workspace buttons" placeholder="Feedback on this fix…"></textarea></div>
</article>

<article class="issue" data-item="selected-path">
  <div class="issue-head"><h3>The selected location path missed text contrast</h3><span class="badge priority">P1</span><span class="badge classify">Accessibility bug</span><span class="badge fixed">Fixed and verified</span></div>
  <div class="evidence-grid">
    <figure><img src="{images['workspace-open-dark-after.png']}" alt="Dark Open dialog with readable selected path and recent path"><figcaption><b>Dark sibling theme</b>The selected path uses strong ink; unselected secondary paths remain muted but clear.</figcaption></figure>
    <figure><img src="{images['workspace-open-light-after-900px.png']}" alt="Light Open dialog fitting inside a 900 pixel viewport"><figcaption><b>900 px responsive pass</b>The 762 × 623 dialog stays inside the viewport with zero horizontal overflow.</figcaption></figure>
  </div>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p>The selected row’s muted path composited to 3.71:1 in Light and 3.74:1 in Dark Modern → selected primary and secondary text both clear the 4.5:1 body-text threshold.</p></div>
    <div class="fact"><b>Discovery</b><p>Expanding the old three-probe Open-dialog check to 13 surfaces immediately caught two failures that screenshot-only review could miss.</p></div>
    <div class="fact"><b>Concrete proof</b><p>Selected Place path: Light {probe(light, 'workspace place path')['ratio']}:1; Dark Modern {probe(dark_modern, 'workspace place path')['ratio']}:1. The complete suite finishes {results['passed']} passed, 0 failed.</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p>The generic muted <code>small</code> rule remained active inside <code>.is-current</code>. The selected path now follows selected primary ink, preserving hierarchy through background and weight.</p></div>
  </div>
  <p><b>Acceptance check.</b> The current Place’s label and path both clear 4.5:1; unselected paths stay semantically muted and readable; layout remains sound at 900 px.</p>
  <div class="review"><input id="keep-selected-path" type="checkbox" data-review-checkbox checked><label for="keep-selected-path">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for selected location contrast" placeholder="Feedback on this fix…"></textarea></div>
</article>

<div class="section-head"><h2>Audit reach</h2><p>The check now treats the complete workspace browser as one visual contract rather than assuming that fixing the Filter fixed neighbouring native buttons.</p></div>
<div class="audit-grid">
  <section class="audit-card"><h3>13 Open-dialog surfaces</h3><ul><li>Sidebar headings, Place label/path, Recent label/path.</li><li>Parent-folder icon, breadcrumb link/current segment.</li><li>Filter value, placeholder, and focus boundary.</li><li>Empty-state text and footer action.</li><li>Dedicated DOM selectors include Recent rows to prevent silent coverage loss.</li></ul></section>
  <section class="audit-card"><h3>Real-browser proof</h3><ul><li>Light and Dark desktop journeys visually inspected.</li><li>Light re-driven at 900 × 760: no clipping or horizontal overflow.</li><li>Five-theme automated sweep: Light, Dark, Obsidian Light/Dark, Dark Modern.</li><li>{results['passed']} checks pass across the full shell; no browser-console warnings or errors.</li><li>Not exercised: touch-only input methods and platform-native external file choosers.</li></ul></section>
</div>

<div class="section-head"><h2>Measured theme proof</h2><p>Foregrounds are composited against the live effective background. Text must clear 4.5:1; icons use 3:1.</p></div>
<table><thead><tr><th>Theme</th><th>Place label</th><th>Selected path</th><th>Recent label</th><th>Parent icon</th></tr></thead><tbody>{''.join(rows)}</tbody></table>

<div class="actions"><span class="copy-state" aria-live="polite"></span><button type="button" id="reset">Reset review</button><button type="button" class="primary" id="copy">Copy review</button></div>
<footer>Target: SystemSketch in-app workspace browser · branch <code>{branch}</code> · base <code>{base}</code> · isolated track ports 4390/4391 · machine-readable evidence: <a href="assets/workspace-dialog-controls/theme-contrast.json">theme-contrast.json</a>.</footer>
</main>
<script>
const KEY='systemsketch.workspace-dialog-controls.review.v1';
const cards=[...document.querySelectorAll('.issue')];
function read(){{try{{return JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch{{return {{}}}}}}
function save(){{const state={{}};for(const card of cards){{state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}}}}localStorage.setItem(KEY,JSON.stringify(state))}}
function restore(){{const state=read();for(const card of cards){{const item=state[card.dataset.item];if(!item)continue;card.querySelector('[data-review-checkbox]').checked=Boolean(item.keep);card.querySelector('[data-review-feedback]').value=item.feedback||''}}}}
for(const input of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))input.addEventListener('input',save);
document.getElementById('reset').addEventListener('click',()=>{{localStorage.removeItem(KEY);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}document.querySelector('.copy-state').textContent='Review reset'}});
document.getElementById('copy').addEventListener('click',async()=>{{const lines=['## Workspace dialog review',''];for(const card of cards){{const title=card.querySelector('h3').textContent.trim();const keep=card.querySelector('[data-review-checkbox]').checked;const feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));document.querySelector('.copy-state').textContent='Copied Markdown'}});
restore();
</script></body></html>"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
