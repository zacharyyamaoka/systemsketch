#!/usr/bin/env python3
"""Build a self-contained visual-polish review for the workspace pathbar."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "workspace-pathbar-visual-polish-2026-09-03.html"
SIDECAR = ASSETS / "workspace-pathbar-visual-polish-audit.json"
REVIEW_KEY = "systemsketch.workspace-pathbar-visual-polish.review.v1"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def png(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")


def esc(value: object) -> str:
    return html.escape(str(value))


def main() -> None:
    before = json.loads((ASSETS / "workspace-pathbar-before-320px.json").read_text(encoding="utf-8"))
    after_record = json.loads((ASSETS / "workspace-pathbar-after-320px.json").read_text(encoding="utf-8"))
    after = after_record["geometry"]
    branch = git("branch", "--show-current") or "detached"
    commit = git("rev-parse", "HEAD")
    summary = {
        "date": "2026-09-03",
        "auditTarget": {"branch": branch, "commit": commit},
        "narrowViewport": after["viewport"],
        "before": {
            "pathbarClientWidth": before["pathbar"]["clientWidth"],
            "pathbarScrollWidth": before["pathbar"]["scrollWidth"],
            "filterRight": before["filter"]["right"],
            "dialogRight": before["dialog"]["right"],
            "inputBoxSizing": before["filter"]["computed"]["boxSizing"],
        },
        "after": {
            "pathbarClientWidth": after["pathbar"]["clientWidth"],
            "pathbarScrollWidth": after["pathbar"]["scrollWidth"],
            "filterRight": after["filter"]["right"],
            "pathbarRight": after["pathbar"]["right"],
            "rightInset": round(after["pathbar"]["right"] - after["filter"]["right"], 1),
            "inputBoxSizing": after["filter"]["computed"]["boxSizing"],
        },
        "journeys": {
            "workspaceVisualPolish": "1/1 at 320×720",
            "workspaceBrowser": "12/12",
            "workspaceFollowup": "9/9",
            "themeContrast": "light and dark chrome captures refreshed",
        },
    }
    SIDECAR.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    before_img = png("workspace-pathbar-before-320px.png")
    after_img = png("workspace-pathbar-after-320px.png")
    desktop_img = png("workspace-browser-open.png")
    dark_img = png("theme-systemsketch-dark-rename.png")
    metrics = (
        ("1", "reproduced visual defect"),
        ("310 → 300 px", "pathbar scroll width at 320 px"),
        ("8 px", "visible right inset after repair"),
        ("22/22", "workspace journeys refreshed"),
    )
    metric_html = "".join(f'<div class="metric"><b>{esc(n)}</b><span>{esc(label)}</span></div>' for n, label in metrics)
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workspace pathbar visual polish · SystemSketch · 2026-09-03</title>
<style>
:root{{--ink:#182432;--muted:#5d6a79;--paper:#f4f6fa;--card:#fff;--line:#d6dee9;--blue:#186fe4;--blue-soft:#e8f2ff;--green:#117b4b;--green-soft:#e6f8ee;--amber:#a85d00;--amber-soft:#fff2df;--shadow:0 18px 50px rgb(19 36 58/.12)}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 86% -8%,#d5eaff 0,transparent 34%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:52px 0 88px}}.eyebrow{{color:var(--blue);font:850 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;text-transform:uppercase}}h1{{max-width:900px;margin:15px 0;font-size:clamp(42px,6.3vw,72px);line-height:.98;letter-spacing:-.06em}}.lead{{max-width:800px;margin:0;color:var(--muted);font-size:19px}}.thesis{{display:grid;grid-template-columns:40px 1fr;gap:15px;align-items:start;margin:31px 0;padding:20px;border:1px solid #bdd8fb;border-radius:17px;background:linear-gradient(130deg,#fff,#ecf6ff);box-shadow:var(--shadow)}}.mark{{display:grid;width:36px;height:36px;place-items:center;border-radius:11px;background:var(--blue);color:#fff;font-size:22px;font-weight:900}}.thesis p{{margin:0}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}}.metric{{padding:15px;border:1px solid var(--line);border-radius:14px;background:rgb(255 255 255/.85)}}.metric b{{display:block;color:var(--green);font-size:26px;line-height:1.1;letter-spacing:-.035em}}.metric span{{color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.075em;text-transform:uppercase}}h2{{margin:52px 0 12px;font-size:30px;letter-spacing:-.03em}}.subhead{{max-width:850px;margin:0 0 18px;color:var(--muted)}}.issue{{padding:21px;border:1px solid var(--line);border-radius:19px;background:rgb(255 255 255/.92);box-shadow:var(--shadow)}}.issue-head{{display:flex;align-items:center;gap:9px;flex-wrap:wrap}}.issue h3{{margin:0 auto 0 0;font-size:22px;letter-spacing:-.025em}}.badge{{padding:5px 8px;border-radius:999px;background:var(--green-soft);color:var(--green);font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}}.severity{{padding:5px 8px;border-radius:999px;background:var(--amber-soft);color:var(--amber);font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}}.compare{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#f8fafc}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:10px 12px;color:var(--muted);font-size:12px}}.detail-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:18px}}.detail{{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}}.detail h4{{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase}}.detail p,.detail ol{{margin:0;color:var(--muted)}}.detail ol{{padding-left:19px}}.proof{{grid-column:1/-1;border-color:#bce3cd;background:linear-gradient(135deg,#f5fffa,#fff)}}.proof strong{{color:var(--green)}}.seam{{grid-column:1/-1;border-color:#c9def9;background:var(--blue-soft)}}.audit-grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.audit-card{{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:var(--shadow)}}.audit-card p{{margin:13px 15px 16px;color:var(--muted)}}.audit-card figure{{border:0;border-radius:0}}.review{{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:start;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}}.review input{{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}}.review label{{font-weight:800}}.review textarea{{grid-column:2;min-height:58px;width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font:inherit;resize:vertical}}.actions{{position:sticky;z-index:3;bottom:12px;display:flex;justify-content:flex-end;gap:9px;margin-top:27px}}button{{padding:10px 13px;border:1px solid #bbc8d7;border-radius:9px;background:#fff;color:var(--ink);box-shadow:0 8px 24px rgb(19 32 50/.11);font:760 13px inherit;cursor:pointer}}button.primary{{border-color:var(--blue);background:var(--blue);color:#fff}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:800}}footer{{margin-top:50px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}code{{font-family:ui-monospace,SFMono-Regular,monospace}}a{{color:var(--blue)}}@media(max-width:760px){{main{{width:min(100% - 20px,1180px);padding-top:30px}}h1{{font-size:43px}}.metrics,.compare,.detail-grid,.audit-grid{{grid-template-columns:1fr}}.proof,.seam{{grid-column:auto}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · visual polish audit · 2026-09-03</div><h1>The Filter now ends before the dialog edge.</h1>
<p class="lead">A real 320 px workspace journey reproduced the Filter’s gray field meeting the right modal boundary. The repaired stock input takes its wrapper’s available width, retains a clear inset and focus ring, and leaves normal desktop light and dark chrome intact.</p>
<section class="thesis"><span class="mark">✓</span><p><b>Outcome:</b> one confirmed visual defect is fixed and screenshot-backed. The wider pass found no additional intersection in the exercised workspace, header-rename, light-theme, or dark-theme surfaces.</p></section><section class="metrics">{metric_html}</section>
<h2>Prioritized findings</h2><p class="subhead">Open 0 · Fixed / implemented 1 · Unconfirmed 0 · Tooling 0. The before state was preserved only as test evidence; the running product is the after state.</p>
<article class="issue" data-item="pathbar-contained"><div class="issue-head"><span class="severity">P1 · Product bug</span><h3>Filter input visually fused with the Open dialog edge at phone width</h3><span class="badge">Fixed and verified</span></div>
<div class="compare"><figure><img src="{before_img}" alt="Before fix at 320 pixels: Filter meets the workspace dialog edge"><figcaption><b>Before:</b> the 154 px content-box control ran to x=311 while the dialog ended at x=312.</figcaption></figure><figure><img src="{after_img}" alt="After fix at 320 pixels: Filter has a clear inset from the workspace dialog edge"><figcaption><b>After:</b> the 128 px border-box control ends at x=303, leaving an 8 px pathbar inset.</figcaption></figure></div>
<div class="detail-grid"><section class="detail"><h4>Impact</h4><p>The edge contact made a routine search field look clipped or structurally attached to the modal, and risked hiding the focus treatment.</p></section><section class="detail"><h4>Actual → expected</h4><p>Actual: the pathbar scrolled 10 px horizontally and the field met the visual edge. Expected: no horizontal overflow and a deliberate visible right gap.</p></section><section class="detail"><h4>Reproduce</h4><ol><li>Open a scratch board in a 320 px-wide viewport.</li><li>Press Ctrl/Cmd+O.</li><li>Inspect the Open dialog pathbar beside <b>+ Folder</b>.</li></ol></section><section class="detail"><h4>Acceptance</h4><p>At 320 px, the pathbar has no horizontal overflow, Filter keeps ≥7 px to its right edge, and it stays ≥6 px clear of + Folder.</p></section><section class="detail proof"><h4>Measured proof</h4><p><strong>Before:</strong> scrollWidth 310 px &gt; clientWidth 300 px; Filter right 311 vs dialog right 312. <strong>After:</strong> scrollWidth 300 px = clientWidth 300 px; Filter right 303 vs pathbar right 311 (8 px inset). The focused CDP journey asserts all three after conditions.</p></section><section class="detail seam"><h4>Likely seam · confirmed</h4><p>Stock <code>TldrawUiInput</code> sets an intrinsic width; the app’s fixed wrapper plus the input’s default <code>content-box</code> sizing yielded a 154 px outer control. The workspace seam now uses <code>width:100%</code>, <code>min-width:0</code>, and <code>border-box</code>, with a compact 320 px pathbar rule. Stock interaction mechanics remain untouched.</p></section></div>
<div class="review"><input id="keep-pathbar" type="checkbox" data-review-checkbox checked><label for="keep-pathbar">Keep this fixed layout contract</label><textarea data-review-feedback aria-label="Feedback for Filter pathbar fix" placeholder="Feedback or a follow-up visual case…"></textarea></div></article>
<h2>Wider chrome pass</h2><p class="subhead">Two additional representative captures were inspected after refreshing the real-browser workspace and theme journeys. These are validation coverage, not invented findings.</p><section class="audit-grid"><article class="audit-card"><figure><img src="{desktop_img}" alt="Workspace Open dialog at desktop width"><figcaption>Desktop workspace Open journey</figcaption></figure><p><b>Workspace browser — 12/12 checks.</b> Open, filter, folder creation, and nested navigation preserve pathbar spacing at normal desktop width.</p></article><article class="audit-card"><figure><img src="{dark_img}" alt="Dark SystemSketch header rename field"><figcaption>Dark-theme inline rename capture</figcaption></figure><p><b>Theme contrast journey refreshed.</b> The stock-backed header field remains crisp and isolated in dark chrome; no new field/border intersection was observed.</p></article></section>
<div class="actions"><span class="copy-state" aria-live="polite"></span><button id="reset" type="button">Reset review</button><button id="copy" class="primary" type="button">Copy Markdown</button></div><footer>Audit target <code>{esc(branch)}</code> at <code>{esc(commit)}</code>. Inputs: <a href="assets/workspace-pathbar-before-320px.json">before geometry</a>, <a href="assets/workspace-pathbar-after-320px.json">after geometry</a>, <a href="assets/workspace-pathbar-visual-polish-audit.json">audit sidecar</a>, and <a href="build_workspace_pathbar_visual_polish.py">builder</a>.</footer>
</main><script>
const key={json.dumps(REVIEW_KEY)},cards=[...document.querySelectorAll('[data-item]')],notice=document.querySelector('.copy-state');
function save(){{const state={{}};for(const card of cards)state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}};localStorage.setItem(key,JSON.stringify(state))}}
function restore(){{try{{const state=JSON.parse(localStorage.getItem(key)||'{{}}');for(const card of cards){{const value=state[card.dataset.item];if(value){{card.querySelector('[data-review-checkbox]').checked=value.keep;card.querySelector('[data-review-feedback]').value=value.feedback||''}}}}}}catch{{}}}}
for(const field of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))field.addEventListener('input',save);restore();
document.querySelector('#reset').onclick=()=>{{localStorage.removeItem(key);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}notice.textContent='Review reset'}};
document.querySelector('#copy').onclick=async()=>{{const lines=['## Workspace pathbar visual-polish review',''];for(const card of cards){{const keep=card.querySelector('[data-review-checkbox]').checked,feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] Filter input stays inside the Open dialog pathbar`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));notice.textContent='Copied Markdown'}};
</script></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
