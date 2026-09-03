#!/usr/bin/env python3
"""Build the self-contained theme/form-control UI audit gallery."""

from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
RESULTS = ASSETS / "theme-form-controls" / "theme-contrast.json"
OUTPUT = DOCS / "theme-form-controls-2026-09-02.html"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def data_uri(name: str) -> str:
    path = ASSETS / name
    mime = "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def probe(theme: dict, label: str) -> dict:
    return next(item for item in theme["probes"] if item["label"] == label)


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    themes = {theme["id"]: theme for theme in results["themes"]}
    light = themes["systemsketch:light"]
    dark = themes["systemsketch:dark"]
    light_name = probe(light, "rename field text")
    light_filter = probe(light, "workspace filter text")
    light_placeholder = probe(light, "workspace filter placeholder")
    dark_name = probe(dark, "rename field text")
    light_gear = probe(light, "Settings outline icon")
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached"

    images = {
        name: data_uri(name)
        for name in (
            "theme-form-controls-before-light.png",
            "theme-form-controls-after-light.png",
            "theme-form-controls-after-dark.png",
            "theme-form-controls-before-filter-light.png",
            "theme-form-controls-after-filter-light.png",
            "theme-form-controls-before-settings-gear.png",
            "theme-form-controls-settings-gear-dark-closeup.png",
        )
    }

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch theme-safe form controls · 2026-09-02</title>
<style>
:root{{--paper:#f5f2eb;--card:#fffdf8;--ink:#20242b;--muted:#606873;--line:#d8d4ca;--blue:#2764d8;--blue-soft:#eaf0ff;--green:#207653;--green-soft:#e9f7ef;--orange:#c56621;--shadow:0 16px 50px rgb(37 42 49 / 12%)}}
*{{box-sizing:border-box}} html{{scroll-behavior:smooth}} body{{margin:0;color:var(--ink);background:linear-gradient(180deg,#ebe7df 0,#f7f4ed 520px);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1480px,calc(100% - 36px));margin:0 auto;padding:48px 0 80px}}
a{{color:var(--blue)}} .eyebrow{{color:var(--blue);font:800 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}
h1{{max-width:1020px;margin:13px 0 16px;font-size:clamp(40px,6vw,78px);line-height:.98;letter-spacing:-.05em}} .lead{{max-width:900px;margin:0;color:#4c5560;font-size:19px}}
.summary{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:30px 0}}
.metric{{padding:16px;border:1px solid var(--line);border-radius:15px;background:rgb(255 253 248 / 82%);box-shadow:0 4px 18px rgb(37 42 49 / 5%)}}
.metric b{{display:block;font-size:25px}} .metric span{{color:var(--muted);font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.07em}}
.metric.good b{{color:var(--green)}}
.hero-grid,.pair{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}} figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow)}}
figure img{{display:block;width:100%;height:auto;background:#eef0f2}} figcaption{{padding:12px 15px;color:var(--muted);font-size:12px}} figcaption b{{display:block;color:var(--ink);font-size:13px}}
.section-head{{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:50px 0 16px}} .section-head h2{{margin:0;font-size:29px;letter-spacing:-.025em}} .section-head p{{max-width:680px;margin:0;color:var(--muted)}}
.issue{{margin:0 0 22px;padding:22px;border:1px solid var(--line);border-radius:20px;background:rgb(255 253 248 / 94%);box-shadow:var(--shadow)}}
.issue-head{{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:16px}} .issue-head h3{{margin:0 auto 0 0;font-size:22px}}
.badge{{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}} .fixed{{color:var(--green);background:var(--green-soft)}} .priority{{color:#8c491b;background:#fff0e4}} .classify{{color:#395177;background:#eaf0f8}}
.facts{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}} .fact{{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}} .fact b{{display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}} .fact p,.fact ol{{margin:0;color:var(--muted)}} .fact ol{{padding-left:18px}}
.proof{{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}} .proof code{{padding:7px 9px;border-radius:8px;background:#20242b;color:#f7f4ed;font:12px/1.2 ui-monospace,monospace}}
.review{{display:grid;grid-template-columns:auto 1fr;gap:10px 14px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}} .review label{{font-weight:750}} .review textarea{{grid-column:2;width:100%;min-height:72px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;resize:vertical}}
.review input{{width:18px;height:18px;accent-color:var(--green)}}
.audit-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}} .audit-card{{padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}} .audit-card h3{{margin:0 0 8px}} .audit-card ul{{margin:0;padding-left:19px;color:var(--muted)}}
table{{width:100%;border-collapse:collapse;border:1px solid var(--line);background:var(--card)}} th,td{{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left}} th{{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em}}
.actions{{position:sticky;z-index:2;bottom:12px;display:flex;justify-content:flex-end;gap:8px;margin-top:28px}} .actions button{{padding:10px 14px;border:1px solid #bfc5cd;border-radius:10px;color:var(--ink);background:#fff;box-shadow:var(--shadow);cursor:pointer;font-weight:750}} .actions button.primary{{color:#fff;background:var(--blue);border-color:var(--blue)}}
.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:750}}
footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}
@media(max-width:900px){{main{{width:min(100% - 20px,1480px);padding-top:28px}}.summary{{grid-template-columns:repeat(2,1fr)}}.hero-grid,.pair,.facts,.audit-grid{{grid-template-columns:1fr}}.review{{grid-template-columns:auto 1fr}}h1{{font-size:42px}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · UI audit · 2026-09-02</div>
<h1>The browser no longer chooses the ink.</h1>
<p class="lead">Light mode was painting native system text—white from a dark desktop preference—inside SystemSketch’s light fields. The fix claims text, caret, placeholder, selection, and typeface at the workspace boundary, and replaces the Settings silhouette with the requested outline gear.</p>

<div class="summary">
  <div class="metric good"><b>0</b><span>Open</span></div>
  <div class="metric good"><b>3</b><span>Fixed + verified</span></div>
  <div class="metric"><b>0</b><span>Unconfirmed</span></div>
  <div class="metric"><b>0</b><span>Tooling</span></div>
  <div class="metric good"><b>{results['passed']}/{results['passed'] + results['failed']}</b><span>Browser checks</span></div>
</div>

<section class="hero-grid" aria-label="Primary before and after evidence">
  <figure><img src="{images['theme-form-controls-before-light.png']}" alt="Light rename dialog with its existing value invisible"><figcaption><b>Before · real untouched-base capture</b>The value exists and the blue focus ring is present, but white system ink disappears into the light field.</figcaption></figure>
  <figure><img src="{images['theme-form-controls-after-light.png']}" alt="Light rename dialog with Untitled visibly selected"><figcaption><b>After · same Light journey</b>Theme ink, app typography, caret, and accent selection are explicit.</figcaption></figure>
</section>

<div class="section-head"><h2>Implemented findings</h2><p>Every finding below was reproduced in the running app, fixed, re-driven, and added to the regression surface.</p></div>

<article class="issue" data-item="rename">
  <div class="issue-head"><h3>Rename / Save As text vanished in Light</h3><span class="badge priority">P1</span><span class="badge classify">Product bug</span><span class="badge fixed">Fixed and verified</span></div>
  <div class="pair">
    <figure><img src="{images['theme-form-controls-before-light.png']}" alt="Before: blank-looking rename field"><figcaption><b>Actual before</b>The DOM value was “Untitled”; computed foreground and caret were white.</figcaption></figure>
    <figure><img src="{images['theme-form-controls-after-dark.png']}" alt="After: readable rename value in Dark"><figcaption><b>After in the neighbouring theme</b>The same semantic rule resolves to Dark’s foreground without a light/dark branch.</figcaption></figure>
  </div>
  <p><b>User impact.</b> A person cannot safely review or edit the document name in Light, even though keyboard selection and renaming continue underneath.</p>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p>Native white/Arial ink on a light field → active <code>--ss-text</code>, matching caret, Inter, and theme accent selection.</p></div>
    <div class="fact"><b>Reproduction</b><ol><li>Use Light.</li><li>Click the document title.</li><li>Type after or select the existing name.</li></ol></div>
    <div class="fact"><b>Concrete proof</b><p>Before ≈ 1.03:1. After {light_name['ratio']}:1 ({light_name['fg']} on {light_name['bg']}); Dark remains {dark_name['ratio']}:1.</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p><code>.systemsketch-workspace-name-field input</code> painted the surface but never claimed native foreground, caret, or font-family.</p></div>
  </div>
  <p><b>Acceptance check.</b> Rename, Save As, and Export show typed and selected names in every shipped theme; text and caret share theme ink; suffix remains visible.</p>
  <div class="review"><input id="keep-rename" type="checkbox" data-review-checkbox checked><label for="keep-rename">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for rename text fix" placeholder="Feedback on this fix…"></textarea></div>
</article>

<article class="issue" data-item="filter">
  <div class="issue-head"><h3>The local-file Filter had the same hidden ink</h3><span class="badge priority">P1</span><span class="badge classify">Product bug</span><span class="badge fixed">Fixed and verified</span></div>
  <div class="pair">
    <figure><img src="{images['theme-form-controls-before-filter-light.png']}" alt="Filter field looks empty while filtered result text says invisible filter"><figcaption><b>Before · untouched base</b>The empty-looking control is filtering for “invisible filter”; the result message proves the value exists.</figcaption></figure>
    <figure><img src="{images['theme-form-controls-after-filter-light.png']}" alt="Filter field visibly contains visible filter"><figcaption><b>After · same Light file browser</b>Value, caret and placeholder all resolve from the workspace theme.</figcaption></figure>
  </div>
  <p><b>User impact.</b> Filtering works but the query is invisible, making typos and zero-result states look like broken search.</p>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p>White native value and caret with an unrelated UA placeholder → theme text/caret and semantic muted placeholder.</p></div>
    <div class="fact"><b>Reproduction</b><ol><li>Use Light.</li><li>Open File → Open.</li><li>Type in Filter.</li></ol></div>
    <div class="fact"><b>Concrete proof</b><p>Before ≈ 1.03:1. After value {light_filter['ratio']}:1; placeholder {light_placeholder['ratio']}:1.</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p><code>.systemsketch-workspace-search</code> set size and surfaces only. The fix is shared with every text-bearing workspace input.</p></div>
  </div>
  <p><b>Acceptance check.</b> A typed query and its caret remain visible; an empty Filter shows the themed placeholder; the focus boundary clears 3:1.</p>
  <div class="review"><input id="keep-filter" type="checkbox" data-review-checkbox checked><label for="keep-filter">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for file filter fix" placeholder="Feedback on this fix…"></textarea></div>
</article>

<article class="issue" data-item="gear">
  <div class="issue-head"><h3>Settings was a solid gear silhouette</h3><span class="badge priority">P2</span><span class="badge classify">UI improvement</span><span class="badge fixed">Fixed and verified</span></div>
  <div class="pair">
    <figure><img src="{images['theme-form-controls-before-settings-gear.png']}" alt="User-supplied screenshot of solid Settings gear"><figcaption><b>Before · user-supplied Preview crop</b>The custom SVG inherited a black fill and no stroke.</figcaption></figure>
    <figure><img src="{images['theme-form-controls-settings-gear-dark-closeup.png']}" alt="Running app close-up of outlined Settings gear"><figcaption><b>After · real Dark app crop</b>The existing Lucide dependency supplies a standard outline that follows currentColor.</figcaption></figure>
  </div>
  <p><b>User impact.</b> The solid blot reads unlike the rest of the line-icon menu and is harder to recognize at the menu’s 15 px size.</p>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p><code>fill: black; stroke: none</code> → <code>fill: none; stroke: currentColor; stroke-width: 2px</code>.</p></div>
    <div class="fact"><b>Reproduction</b><ol><li>Open the main menu.</li><li>Inspect the Settings row in Light or Dark.</li></ol></div>
    <div class="fact"><b>Concrete proof</b><p>The live SVG paint is outline-only in all five themes; Light icon contrast is {light_gear['ratio']}:1.</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p>The bespoke <code>SettingsGearIcon</code> path had no paint attributes outside the Settings dialog’s class-scoped override.</p></div>
  </div>
  <p><b>Acceptance check.</b> Main-menu and Settings-dialog gears are hollow, stroked, theme-coloured, and remain legible in every shipped palette.</p>
  <div class="review"><input id="keep-gear" type="checkbox" data-review-checkbox checked><label for="keep-gear">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for Settings gear fix" placeholder="Feedback on this fix…"></textarea></div>
</article>

<div class="section-head"><h2>Audit reach</h2><p>The wider check separated actual failures from controls that already owned their semantic ink.</p></div>
<div class="audit-grid">
  <section class="audit-card"><h3>Source census</h3><ul><li>25 native form-control render sites in <code>src/</code>.</li><li>19 are text-bearing inputs, textareas, or selects.</li><li>Checked workspace, command palette, inspector, comments, recorder, color picker, Block and Branch inline editors, range, checkbox, and file inputs.</li><li>The only reproduced native-ink failures were the two workspace seams above.</li></ul></section>
  <section class="audit-card"><h3>Journey matrix</h3><ul><li>Untouched base <code>{base[:8]}</code>: Light Rename and Filter reproduced at desktop width.</li><li>Fixed tree: Light and Dark physical journeys, including actual typing and selection.</li><li>Automated sweep: Light, Dark, Obsidian Light, Obsidian Dark, Dark Modern; {results['passed']} checks; 0 console errors.</li><li>900 px responsive pass: Rename, Filter, menu gear, and report review controls.</li><li>Not exercised: touch-only input methods and third-party IME candidate windows.</li></ul></section>
</div>

<div class="section-head"><h2>Measured theme proof</h2><p>Foregrounds are composited against the effective live background. Text threshold is 4.5:1; focus boundaries and icons use 3:1.</p></div>
<table><thead><tr><th>Theme</th><th>Rename text</th><th>Filter text</th><th>Filter placeholder</th><th>Gear paint</th></tr></thead><tbody>
{''.join(f"<tr><td>{theme['label']}</td><td>{probe(theme, 'rename field text')['ratio']}:1</td><td>{probe(theme, 'workspace filter text')['ratio']}:1</td><td>{probe(theme, 'workspace filter placeholder')['ratio']}:1</td><td>{theme['gearPaint']['fill']} / {theme['gearPaint']['strokeWidth']} stroke</td></tr>" for theme in results['themes'])}
</tbody></table>

<div class="actions"><span class="copy-state" aria-live="polite"></span><button type="button" id="reset">Reset review</button><button type="button" class="primary" id="copy">Copy review</button></div>
<footer>Target: SystemSketch local workspace + Settings menu · branch <code>{branch}</code> · base <code>{base}</code> · isolated track ports 4350/4351 · machine-readable evidence: <a href="assets/theme-form-controls/theme-contrast.json">theme-contrast.json</a>.</footer>
</main>
<script>
const KEY='systemsketch.theme-form-controls.review.v1';
const cards=[...document.querySelectorAll('.issue')];
function read(){{try{{return JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch{{return {{}}}}}}
function save(){{const state={{}};for(const card of cards){{state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}}}}localStorage.setItem(KEY,JSON.stringify(state))}}
function restore(){{const state=read();for(const card of cards){{const item=state[card.dataset.item];if(!item)continue;card.querySelector('[data-review-checkbox]').checked=Boolean(item.keep);card.querySelector('[data-review-feedback]').value=item.feedback||''}}}}
for(const input of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))input.addEventListener('input',save);
document.getElementById('reset').addEventListener('click',()=>{{localStorage.removeItem(KEY);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}document.querySelector('.copy-state').textContent='Review reset'}});
document.getElementById('copy').addEventListener('click',async()=>{{const lines=['## UI audit review',''];for(const card of cards){{const title=card.querySelector('h3').textContent.trim();const keep=card.querySelector('[data-review-checkbox]').checked;const feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));document.querySelector('.copy-state').textContent='Copied Markdown'}});
restore();
</script></body></html>"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
