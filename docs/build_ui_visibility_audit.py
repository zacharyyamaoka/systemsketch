#!/usr/bin/env python3
"""Build the self-contained 2026-09-03 light/dark UI visibility audit."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
AUDIT = DOCS / "assets" / "ui-visibility-audit-2026-09-03"
RESULTS = AUDIT / "theme-contrast.json"
OUTPUT = DOCS / "ui-visibility-audit-2026-09-03.html"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def data_uri(name: str) -> str:
    raw = (AUDIT / name).read_bytes()
    return f"data:image/png;base64,{base64.b64encode(raw).decode('ascii')}"


def probe(theme: dict, label: str) -> dict:
    return next(item for item in theme["probes"] if item["label"] == label)


def ratio(theme: dict, label: str) -> str:
    value = probe(theme, label).get("ratio")
    return "—" if value is None else f"{value:.2f}:1"


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    themes = results["themes"]
    passed = results["passed"]
    failed = results["failed"]
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached"
    images = {
        name: data_uri(name)
        for name in (
            "theme-systemsketch-light-rename.png",
            "theme-systemsketch-light-workspace-filter.png",
            "theme-systemsketch-dark-rename.png",
            "theme-systemsketch-dark-settings.png",
        )
    }
    theme_rows = "".join(
        "<tr>"
        f"<td>{html.escape(theme['label'])}</td>"
        f"<td>{ratio(theme, 'file title, top-left shell')}</td>"
        f"<td>{ratio(theme, 'settings body copy')}</td>"
        f"<td>{ratio(theme, 'command-palette search text')}</td>"
        f"<td>18 failed workspace probes</td>"
        "</tr>"
        for theme in themes
    )

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch UI visibility audit · 2026-09-03</title>
<style>
:root{{--paper:#f2f1ed;--card:#fffefa;--ink:#1f252d;--muted:#59636e;--line:#d5d8dc;--blue:#2168dc;--blue-soft:#e8f0ff;--red:#b42318;--red-soft:#ffebe8;--green:#137653;--green-soft:#e6f6ee;--amber:#9a4f12;--amber-soft:#fff0df;--shadow:0 18px 48px rgb(21 30 43 / 12%)}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:linear-gradient(180deg,#e7e9ed 0,#f7f5f0 520px);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1480px,calc(100% - 36px));margin:auto;padding:50px 0 80px}}a{{color:var(--blue)}}code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}}.eyebrow{{color:var(--blue);font:800 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:1100px;margin:14px 0 16px;font-size:clamp(42px,6vw,76px);line-height:.96;letter-spacing:-.052em}}.lead{{max-width:950px;margin:0;color:#485460;font-size:19px}}.summary{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:32px 0}}.metric{{min-height:100px;padding:16px;border:1px solid var(--line);border-radius:16px;background:rgb(255 254 250 / 88%);box-shadow:0 4px 18px rgb(21 30 43 / 5%)}}.metric b{{display:block;font-size:27px;letter-spacing:-.04em}}.metric span{{display:block;color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}}.metric.open b{{color:var(--red)}}.metric.good b{{color:var(--green)}}.section-head{{display:flex;align-items:end;justify-content:space-between;gap:24px;margin:50px 0 16px}}.section-head h2{{margin:0;font-size:30px;letter-spacing:-.03em}}.section-head p{{max-width:720px;margin:0;color:var(--muted)}}.pair,.evidence-grid,.facts,.coverage{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}figure{{position:relative;margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow)}}figure img{{display:block;width:100%;height:auto;background:#eef1f4}}figure.focus{{height:405px}}figure.focus img{{width:150%;max-width:none;transform:translate(-18%,-24%)}}.audit-outline{{position:absolute;z-index:1;top:67px;right:7%;left:7%;height:253px;border:2px dashed var(--red);border-radius:12px;box-shadow:0 0 0 3px rgb(255 255 255 / 55%);pointer-events:none}}figcaption{{position:relative;z-index:2;padding:12px 15px;color:var(--muted);font-size:12px;background:#fff}}figcaption b{{display:block;color:var(--ink);font-size:13px}}.issue{{margin-bottom:22px;padding:22px;border:1px solid var(--line);border-radius:20px;background:rgb(255 254 250 / 96%);box-shadow:var(--shadow)}}.issue-head{{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:16px}}.issue-head h3{{margin:0 auto 0 0;font-size:22px}}.badge{{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}}.priority{{color:var(--red);background:var(--red-soft)}}.classify{{color:#365276;background:#e7eef8}}.open{{color:var(--amber);background:var(--amber-soft)}}.facts{{margin:18px 0}}.fact,.coverage section{{padding:14px;border:1px solid var(--line);border-radius:13px;background:#fff}}.fact b,.coverage h3{{display:block;margin:0 0 5px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}}.fact p,.fact ol,.coverage p,.coverage ul{{margin:0;color:var(--muted)}}.fact ol,.coverage ul{{padding-left:18px}}.note{{margin:18px 0;padding:14px 16px;border-left:4px solid var(--red);border-radius:0 12px 12px 0;background:var(--red-soft);color:#6e1b13}}.review{{display:grid;grid-template-columns:auto 1fr;gap:10px 14px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}}.review label{{font-weight:750}}.review textarea{{grid-column:2;width:100%;min-height:72px;padding:10px;border:1px solid var(--line);border-radius:10px;font:inherit;resize:vertical}}.review input{{width:18px;height:18px;accent-color:var(--blue)}}table{{width:100%;border-collapse:collapse;border:1px solid var(--line);background:var(--card)}}th,td{{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left}}th{{color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}}.actions{{position:sticky;z-index:2;bottom:12px;display:flex;justify-content:flex-end;gap:8px;margin-top:28px}}.actions button{{padding:10px 14px;border:1px solid #bdc6d1;border-radius:10px;background:#fff;color:var(--ink);box-shadow:var(--shadow);cursor:pointer;font-weight:750}}.actions .primary{{border-color:var(--blue);background:var(--blue);color:#fff}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:750}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}@media(max-width:900px){{main{{width:min(100% - 20px,1480px);padding-top:28px}}.summary{{grid-template-columns:repeat(2,1fr)}}.pair,.evidence-grid,.facts,.coverage{{grid-template-columns:1fr}}figure.focus{{height:330px}}.audit-outline{{top:48px;height:210px}}h1{{font-size:42px}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · screenshot-first UI audit · 2026-09-03</div>
<h1>One portal severs the file workspace from every theme.</h1>
<p class="lead">The Light rename failure is real, but not isolated: the same unscoped Radix portal makes Open, Save As, Export, filtering, places, breadcrumbs, and workspace actions lose their semantic colours. The rest of the measured standalone shell is legible in Light and Dark.</p>

<div class="summary">
  <div class="metric open"><b>1</b><span>Open product bug</span></div>
  <div class="metric good"><b>0</b><span>Implemented</span></div>
  <div class="metric"><b>0</b><span>Unconfirmed</span></div>
  <div class="metric"><b>{passed}</b><span>Contrast checks passed</span></div>
  <div class="metric open"><b>{failed}</b><span>Repeated failing probes</span></div>
</div>

<section class="pair" aria-label="Primary failure evidence">
  <figure class="focus"><img src="{images['theme-systemsketch-light-rename.png']}" alt="Running Light SystemSketch rename dialog with almost invisible white text on a pale canvas"><span class="audit-outline" aria-hidden="true"></span><figcaption><b>Light · Rename · red outline is audit-only</b>The outline locates the intended dialog frame; the raw capture has no own surface, border, or readable ink.</figcaption></figure>
  <figure class="focus"><img src="{images['theme-systemsketch-light-workspace-filter.png']}" alt="Running Light SystemSketch Open dialog with nearly invisible places, breadcrumbs, filter, and actions"><span class="audit-outline" aria-hidden="true"></span><figcaption><b>Light · Open and filter · red outline is audit-only</b>The same root cause affects the whole file-browser workflow, so removing Rename alone would leave the defect.</figcaption></figure>
</section>

<div class="section-head"><h2>Open finding</h2><p>One causal defect is counted once. Its 90 failed measurements are 18 affected workspace probes repeated across five themes—not 90 separate bugs.</p></div>
<article class="issue" data-item="workspace-portal-theme-scope">
  <div class="issue-head"><h3>Workspace dialogs escape the theme-token subtree</h3><span class="badge priority">P0</span><span class="badge classify">Accessibility / product bug</span><span class="badge open">Open</span></div>
  <div class="evidence-grid">
    <figure class="focus"><img src="{images['theme-systemsketch-dark-rename.png']}" alt="Running Dark SystemSketch rename dialog whose text is visible but whose intended dialog surface is transparent"><figcaption><b>Dark · accidental partial legibility</b>Copy happens to be white over the canvas, but the dialog still has no raised surface, border, input boundary, or backdrop. It is not receiving Dark theme tokens.</figcaption></figure>
    <figure><img src="{images['theme-systemsketch-dark-settings.png']}" alt="Running Dark SystemSketch Settings dialog with clear dark surfaces and readable controls"><figcaption><b>Dark · control comparison</b>Settings stays inside the tldraw container and correctly receives the same theme tokens.</figcaption></figure>
  </div>
  <p><b>User impact.</b> In Light and Obsidian Light, people cannot reliably read, orient within, or complete file operations. In dark themes the invisible shell is masked by the underlying canvas, leaving important boundaries and input states undefined.</p>
  <div class="facts">
    <div class="fact"><b>Actual → expected</b><p><code>Dialog.Portal</code> mounts the workspace overlay under <code>document.body</code>, outside <code>.systemsketch-theme-root</code>, so every <code>--ss-*</code> value is unresolved. The portal should inherit the active theme root’s attributes and token values like every other overlay.</p></div>
    <div class="fact"><b>Reproduction</b><ol><li>Select Light in Settings → Appearance.</li><li>Click the document title (Rename) or press Ctrl/Cmd+O (Open).</li><li>Observe white text, transparent dialog chrome, and missing field boundaries.</li><li>Repeat at 900 px; the defect persists.</li></ol></div>
    <div class="fact"><b>Concrete proof</b><p>The real-browser scanner recorded <b>165 pass / 90 fail</b>. All 90 failures are the five Rename and thirteen Open-workspace probes in each of Light, Dark, Obsidian Light, Obsidian Dark, and Dark Modern. In Light, each failed probe resolves to white over the portal fallback white (<b>1.00:1</b>).</p></div>
    <div class="fact"><b>Likely seam · confirmed</b><p><code>src/workspace/LocalWorkspace.tsx</code> uses <code>&lt;Dialog.Portal&gt;</code>, while <code>src/App.tsx</code> scopes theme values to <code>ThemeRoot</code>. Radix moves portal children to the body; CSS custom properties do not cross that DOM boundary.</p></div>
  </div>
  <div class="note"><b>Suggested direction.</b> Give the Radix portal a container inside <code>.systemsketch-theme-root</code> (or deliberately mirror the same theme attributes and resolved token properties onto its portal host). Preserve Radix focus management; do not replace it with a second dialog primitive.</div>
  <p><b>Acceptance check.</b> In all five shipped themes and at 900 px, Open, Save As, Export, and Rename have an opaque raised surface, visible border and focus ring; text is at least 4.5:1 and icon/input boundaries at least 3:1. The theme sweep should return 255/255 passed checks with no console errors.</p>
  <div class="review"><input id="implement-workspace-portal-theme-scope" type="checkbox" data-review-checkbox><label for="implement-workspace-portal-theme-scope">Implement this fix</label><textarea data-review-feedback aria-label="Feedback for workspace dialog theme scope" placeholder="Feedback on this finding…"></textarea></div>
</article>

<div class="section-head"><h2>What passed</h2><p>These values are computed from live painted foregrounds and their composited effective backgrounds. Text uses a 4.5:1 threshold; icons and input boundaries use 3:1.</p></div>
<table><thead><tr><th>Theme</th><th>Top-left file title</th><th>Settings body</th><th>Command search</th><th>Workspace result</th></tr></thead><tbody>{theme_rows}</tbody></table>

<div class="section-head"><h2>Journey reach and limits</h2><p>The audit combined the app’s real-browser contrast runner with a separate interactive pass in an isolated local workspace.</p></div>
<div class="coverage">
  <section><h3>Measured across five themes</h3><ul><li>Main shell, file title, toolbar, tool-family and utility controls.</li><li>Block inspector, selection pill, block canvas heading, main menu, Settings and Appearance controls.</li><li>Workspace Rename plus 13 Open-browser surfaces and command-palette search.</li><li>Theme switch, pre-paint handoff, and VS Code theme import; no console errors.</li></ul></section>
  <section><h3>Manual visual pass at 900 × 800</h3><ul><li>Dark shell, Settings, command palette, comments, Share &amp; export, Board overview, and Problems panel were visible and unclipped.</li><li>Light Rename was re-driven at the same viewport and remained unreadable.</li><li>Not exercised: installed VS Code/Cursor and Obsidian host windows, touch-only input, platform IME candidate UI, or an external native file chooser.</li></ul></section>
</div>

<div class="actions"><span class="copy-state" aria-live="polite"></span><button type="button" id="reset">Reset review</button><button type="button" class="primary" id="copy">Copy review</button></div>
<footer>Target: SystemSketch standalone product UI · worktree <code>{html.escape(str(ROOT))}</code> · branch <code>{html.escape(branch)}</code> · base <code>{base}</code> · isolated API/Vite ports 4431/4430 · machine-readable evidence: <a href="assets/ui-visibility-audit-2026-09-03/theme-contrast.json">theme-contrast.json</a>.</footer>
</main>
<script>
const KEY='systemsketch.ui-visibility-audit-2026-09-03.review.v1';
const cards=[...document.querySelectorAll('.issue')];
function read(){{try{{return JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch{{return {{}}}}}}
function save(){{const state={{}};for(const card of cards){{state[card.dataset.item]={{implement:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}}}}localStorage.setItem(KEY,JSON.stringify(state))}}
function restore(){{const state=read();for(const card of cards){{const item=state[card.dataset.item];if(!item)continue;card.querySelector('[data-review-checkbox]').checked=Boolean(item.implement);card.querySelector('[data-review-feedback]').value=item.feedback||''}}}}
for(const input of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))input.addEventListener('input',save);
document.getElementById('reset').addEventListener('click',()=>{{localStorage.removeItem(KEY);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=false;card.querySelector('[data-review-feedback]').value=''}}document.querySelector('.copy-state').textContent='Review reset'}});
document.getElementById('copy').addEventListener('click',async()=>{{const lines=['## UI audit review',''];for(const card of cards){{const title=card.querySelector('h3').textContent.trim();const implement=card.querySelector('[data-review-checkbox]').checked;const feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{implement?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));document.querySelector('.copy-state').textContent='Copied Markdown'}});
restore();
</script></body></html>"""
    OUTPUT.write_text(report, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
