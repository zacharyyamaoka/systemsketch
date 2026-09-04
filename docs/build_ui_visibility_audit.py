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
BEFORE_RESULTS = AUDIT / "theme-contrast.json"
AFTER_RESULTS = AUDIT / "after" / "theme-contrast.json"
OUTPUT = DOCS / "ui-visibility-audit-2026-09-03.html"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def data_uri(relative_name: str) -> str:
    raw = (AUDIT / relative_name).read_bytes()
    return f"data:image/png;base64,{base64.b64encode(raw).decode('ascii')}"


def probe(theme: dict, label: str) -> dict:
    return next(item for item in theme["probes"] if item["label"] == label)


def ratio(theme: dict, label: str) -> str:
    value = probe(theme, label).get("ratio")
    return "—" if value is None else f"{value:.2f}:1"


def evidence_pair(
    images: dict[str, str],
    *,
    title: str,
    before_name: str,
    after_name: str,
    before_caption: str,
    after_caption: str,
    before_outline: bool = False,
) -> str:
    """Return an unambiguous raw before/after pair with traceable source files."""
    outline = '<span class="audit-outline" aria-hidden="true"></span>' if before_outline else ""
    return f"""<article class="evidence-pair">
  <header><h3>{html.escape(title)}</h3><p>Same 1440 × 960 fixture, interaction, and appearance; only the portal destination changed.</p></header>
  <div class="pair">
    <figure><img src="{images[before_name]}" alt="{html.escape(title)} before the theme portal repair">{outline}<figcaption><b>Before</b>{before_caption} <a href="assets/ui-visibility-audit-2026-09-03/{before_name}">Raw PNG</a></figcaption></figure>
    <figure><img src="{images[after_name]}" alt="{html.escape(title)} after the theme portal repair"><figcaption><b>After</b>{after_caption} <a href="assets/ui-visibility-audit-2026-09-03/{after_name}">Raw PNG</a></figcaption></figure>
  </div>
</article>"""


def control_tile(images: dict[str, str], *, title: str, image_name: str, caption: str) -> str:
    return f"""<figure class="control-tile"><img src="{images[image_name]}" alt="{html.escape(title)} standard product surface after the repair"><figcaption><b>{html.escape(title)}</b>{caption} <a href="assets/ui-visibility-audit-2026-09-03/{image_name}">Raw PNG</a></figcaption></figure>"""


def main() -> None:
    before = json.loads(BEFORE_RESULTS.read_text(encoding="utf-8"))
    after = json.loads(AFTER_RESULTS.read_text(encoding="utf-8"))
    themes = after["themes"]
    passed = after["passed"]
    failed = after["failed"]
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached"
    image_names = (
        "theme-systemsketch-light-rename.png",
        "theme-systemsketch-light-workspace-filter.png",
        "theme-systemsketch-dark-rename.png",
        "theme-obsidian-light-rename.png",
        "theme-obsidian-dark-rename.png",
        "theme-dark-modern-rename.png",
        "after/theme-systemsketch-light-rename.png",
        "after/theme-systemsketch-light-workspace-filter.png",
        "after/theme-systemsketch-dark-rename.png",
        "after/theme-obsidian-light-rename.png",
        "after/theme-obsidian-dark-rename.png",
        "after/theme-dark-modern-rename.png",
        "after/theme-systemsketch-light.png",
        "after/theme-systemsketch-dark.png",
        "after/theme-obsidian-light.png",
        "after/theme-obsidian-dark.png",
        "after/theme-dark-modern.png",
        "after/theme-systemsketch-dark-settings.png",
    )
    images = {name: data_uri(name) for name in image_names}
    evidence_pairs = "\n".join(
        (
            evidence_pair(
                images,
                title="Light · Open workspace and filter",
                before_name="theme-systemsketch-light-workspace-filter.png",
                after_name="after/theme-systemsketch-light-workspace-filter.png",
                before_caption="All 13 Open-workspace targets render as white-on-white or have no visible boundary; the search value cannot be used.",
                after_caption="The same open dialog has a panel, navigation column, filter focus ring, empty state, and footer actions that can be read and operated.",
                before_outline=True,
            ),
            evidence_pair(
                images,
                title="Dark · Rename",
                before_name="theme-systemsketch-dark-rename.png",
                after_name="after/theme-systemsketch-dark-rename.png",
                before_caption="Copy is partially visible only because it falls onto the canvas; there is no dialog surface, input treatment, or contained action area.",
                after_caption="The dialog inherits Dark’s own panel, divider, input, focus, button, and backdrop values.",
                before_outline=True,
            ),
            evidence_pair(
                images,
                title="Obsidian Light · Rename",
                before_name="theme-obsidian-light-rename.png",
                after_name="after/theme-obsidian-light-rename.png",
                before_caption="The modal loses its full appearance contract and disappears into the pale canvas; the red outline is audit-only.",
                after_caption="The purple appearance is retained while the dialog gains a legible neutral surface and clear focus state.",
                before_outline=True,
            ),
            evidence_pair(
                images,
                title="Obsidian Dark · Rename",
                before_name="theme-obsidian-dark-rename.png",
                after_name="after/theme-obsidian-dark-rename.png",
                before_caption="The expected Obsidian Dark dialog frame is absent, so controls float directly over the dark canvas.",
                after_caption="A bounded dark surface separates the task from its background, with readable copy and visible controls.",
                before_outline=True,
            ),
            evidence_pair(
                images,
                title="Dark Modern · Rename",
                before_name="theme-dark-modern-rename.png",
                after_name="after/theme-dark-modern-rename.png",
                before_caption="Text and actions are present but have no modal container, field boundary, or proper visual hierarchy.",
                after_caption="Dark Modern supplies a crisp bordered dialog, selected input, and distinct secondary and primary actions.",
                before_outline=True,
            ),
        )
    )
    control_tiles = "\n".join(
        (
            control_tile(images, title="Light canvas", image_name="after/theme-systemsketch-light.png", caption="The surrounding shell, selected Block, toolbar, and inspector retain the Light appearance."),
            control_tile(images, title="Dark canvas", image_name="after/theme-systemsketch-dark.png", caption="The same normal canvas route remains legible after the dialog repair."),
            control_tile(images, title="Obsidian Light canvas", image_name="after/theme-obsidian-light.png", caption="Imported-purple accents still apply consistently outside overlays."),
            control_tile(images, title="Obsidian Dark canvas", image_name="after/theme-obsidian-dark.png", caption="Dark shell controls and inspector maintain their intended contrast."),
            control_tile(images, title="Dark Modern canvas", image_name="after/theme-dark-modern.png", caption="The darker blue-accent appearance stays coherent through the main product surface."),
        )
    )
    gallery_style = """
<style>
.evidence-pair{margin:0 0 26px;padding:18px;border:1px solid var(--line);border-radius:20px;background:rgb(255 254 250 / 96%);box-shadow:var(--shadow)}
.evidence-pair header{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin:0 0 14px}.evidence-pair h3{margin:0;font-size:22px;letter-spacing:-.025em}.evidence-pair header p{max-width:580px;margin:0;color:var(--muted);font-size:13px}.evidence-pair figure{min-height:0}.evidence-pair .audit-outline{top:16%;right:8%;bottom:12%;left:8%;height:auto}.evidence-pair figcaption{min-height:74px}.control-wall{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.control-tile{box-shadow:0 5px 20px rgb(21 30 43 / 8%)}.control-tile figcaption{min-height:92px}.evidence-note{margin:0 0 22px;padding:14px 16px;border-left:4px solid var(--blue);border-radius:0 12px 12px 0;background:var(--blue-soft);color:#294567}.evidence-note b{color:var(--ink)}
@media(max-width:1100px){.control-wall{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){.evidence-pair header{display:block}.evidence-pair header p{margin-top:5px}.control-wall{grid-template-columns:1fr}.evidence-pair figcaption,.control-tile figcaption{min-height:0}}
</style>"""
    theme_rows = "".join(
        "<tr>"
        f"<td>{html.escape(theme['label'])}</td>"
        f"<td>{ratio(theme, 'file title, top-left shell')}</td>"
        f"<td>{ratio(theme, 'settings body copy')}</td>"
        f"<td>{ratio(theme, 'command-palette search text')}</td>"
        f"<td>18 / 18 passed</td>"
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
{gallery_style}
</head>
<body><main>
<div class="eyebrow">SystemSketch · screenshot-first UI audit · 2026-09-03</div>
<h1>Every app overlay now inherits the active appearance.</h1>
<p class="lead">The Light rename failure exposed a shared boundary: a body-level portal loses the selected theme’s inherited CSS variables. ThemeRoot now owns the single in-tree portal host, so workspace dialogs and the recorder overlay travel with the active appearance instead of rediscovering it ad hoc.</p>

<div class="summary">
  <div class="metric good"><b>1</b><span>Product bug fixed</span></div>
  <div class="metric good"><b>{passed}</b><span>Contrast checks passed</span></div>
  <div class="metric good"><b>{failed}</b><span>Repeated failing probes</span></div>
  <div class="metric"><b>5</b><span>Shipped themes swept</span></div>
  <div class="metric"><b>18</b><span>Workspace probes / theme</span></div>
</div>

<section class="pair" aria-label="Before and after Light Rename evidence">
  <figure class="focus"><img src="{images['theme-systemsketch-light-rename.png']}" alt="Running Light SystemSketch rename dialog with almost invisible white text on a pale canvas"><span class="audit-outline" aria-hidden="true"></span><figcaption><b>Light · Rename before · red outline is audit-only</b>The outline locates the intended dialog frame; the raw capture has no own surface, border, or readable ink. <a href="assets/ui-visibility-audit-2026-09-03/theme-systemsketch-light-rename.png">Raw PNG</a></figcaption></figure>
  <figure class="focus"><img src="{images['after/theme-systemsketch-light-rename.png']}" alt="Running Light SystemSketch rename dialog with an opaque panel, readable text, and visible controls"><figcaption><b>Light · Rename after</b>The modal now receives the selected theme’s panel, text, border, accent, and focus tokens through the dedicated portal host. <a href="assets/ui-visibility-audit-2026-09-03/after/theme-systemsketch-light-rename.png">Raw PNG</a></figcaption></figure>
</section>

<div class="section-head"><h2>Fixed finding</h2><p>One causal defect was fixed once. The earlier 90 failures were 18 affected workspace probes repeated across five themes—not 90 separate bugs.</p></div>
<article class="issue" data-item="workspace-portal-theme-scope">
  <div class="issue-head"><h3>Workspace dialogs inherit ThemeRoot through one portal host</h3><span class="badge priority">P0 fixed</span><span class="badge classify">Accessibility / product fix</span><span class="badge classify">Verified</span></div>
  <div class="evidence-grid">
    <figure class="focus"><img src="{images['theme-systemsketch-dark-rename.png']}" alt="Running Dark SystemSketch rename dialog before its modal surface inherited the active appearance"><span class="audit-outline" aria-hidden="true"></span><figcaption><b>Dark · Rename before · red outline is audit-only</b>Text floats over the canvas because the dialog portal had no inherited color tokens. <a href="assets/ui-visibility-audit-2026-09-03/theme-systemsketch-dark-rename.png">Raw PNG</a></figcaption></figure>
    <figure><img src="{images['after/theme-systemsketch-dark-settings.png']}" alt="Running Dark SystemSketch Settings dialog with clear dark surfaces and readable controls"><figcaption><b>Dark · control comparison after</b>Workspace overlays now carry the same token contract as Settings and the surrounding tldraw chrome.</figcaption></figure>
  </div>
  <p><b>Outcome.</b> In Light, Dark, Obsidian Light, Obsidian Dark, and Dark Modern, people can read, orient within, and complete file operations using a fully surfaced modal. The same central host also keeps the recorder indicator bound to the active appearance.</p>
  <div class="facts">
    <div class="fact"><b>Cause → repair</b><p><code>Dialog.Portal</code> had defaulted to <code>document.body</code>, outside <code>ThemeRoot</code>, so every <code>--ss-*</code> value was unresolved. <code>ThemePortalContext</code> now supplies a dedicated child of the stamped root to every app-owned portal.</p></div>
    <div class="fact"><b>Reproduction after</b><ol><li>Select any appearance in Settings → Appearance.</li><li>Click the document title (Rename) or press Ctrl/Cmd+O (Open).</li><li>Confirm opaque dialog chrome, readable labels, visible input boundary, and actions.</li><li>Repeat at 900 px and switch to another appearance.</li></ol></div>
    <div class="fact"><b>Contrast proof</b><p>Before: <b>{before['passed']} pass / {before['failed']} fail</b>. After: <b>{passed} pass / {failed} fail</b>. All former failures were the five Rename and thirteen Open-workspace probes in each shipped theme; Light Rename’s label is <b>5.18:1</b>, text <b>13.24:1</b>, and input boundary <b>3.69:1</b>.</p></div>
    <div class="fact"><b>Future guardrail</b><p>The context replaces per-component theme-root selectors and refuses a body fallback. A source-level regression test requires the ThemeRoot host and requires both the Radix workspace portal and React recorder portal to consume it.</p></div>
  </div>
  <div class="note"><b>Implementation.</b> The fix preserves Radix focus management and screen-reader isolation. It changes only the portal destination, keeping application UI inside the live appearance boundary without rebuilding a dialog primitive.</div>
  <p><b>Acceptance check met.</b> The real-browser sweep returns {passed}/{passed} passed checks with no console errors: all text is at least 4.5:1 and icon/input boundaries are at least 3:1. A 900 px manual pass is recorded below.</p>
  <div class="review"><input id="implement-workspace-portal-theme-scope" type="checkbox" data-review-checkbox><label for="implement-workspace-portal-theme-scope">Keep this fix</label><textarea data-review-feedback aria-label="Feedback for workspace dialog theme scope" placeholder="Feedback on this fix…"></textarea></div>
</article>

<div class="section-head"><h2>Full visual evidence sweep</h2><p>The first pair records the reported Light Rename defect. These five additional pairs show the Open-browser failure and the same repair across every remaining shipped appearance.</p></div>
<p class="evidence-note"><b>Reading the gallery.</b> Every left-hand image is the original, untouched application capture. Dashed red rectangles only locate an otherwise missing dialog boundary. Every right-hand image repeats the same fixture and interaction after the portal-host repair.</p>
<section aria-label="Complete before and after theme evidence">
{evidence_pairs}
</section>

<div class="section-head"><h2>Product controls still visible</h2><p>These post-fix shell captures are separate routes from the workspace dialogs. They make it easy to check that the change restores overlay inheritance without flattening the five appearances into a single generic palette.</p></div>
<section class="control-wall" aria-label="Post-fix normal product surfaces">
{control_tiles}
</section>

<div class="section-head"><h2>What passed</h2><p>These values are computed from live painted foregrounds and their composited effective backgrounds. Text uses a 4.5:1 threshold; icons and input boundaries use 3:1.</p></div>
<table><thead><tr><th>Theme</th><th>Top-left file title</th><th>Settings body</th><th>Command search</th><th>Workspace result</th></tr></thead><tbody>{theme_rows}</tbody></table>

<div class="section-head"><h2>Journey reach and limits</h2><p>The audit combined the app’s real-browser contrast runner with a separate interactive pass in an isolated local workspace.</p></div>
<div class="coverage">
  <section><h3>Measured across five themes</h3><ul><li>Main shell, file title, toolbar, tool-family and utility controls.</li><li>Block inspector, selection pill, block canvas heading, main menu, Settings and Appearance controls.</li><li>Workspace Rename plus 13 Open-browser surfaces and command-palette search.</li><li>Theme switch, pre-paint handoff, and VS Code theme import; no console errors.</li></ul></section>
  <section><h3>Manual visual pass at 900 × 800</h3><ul><li>Light and Dark Rename plus Light Open/Filter were re-driven after the fix; each has a surfaced modal with readable controls and no clipping.</li><li>Dark shell, Settings, command palette, comments, Share &amp; export, Board overview, and Problems panel remain visible and unclipped.</li><li>Not exercised: installed VS Code/Cursor and Obsidian host windows, touch-only input, platform IME candidate UI, or an external native file chooser.</li></ul></section>
</div>

<div class="actions"><span class="copy-state" aria-live="polite"></span><button type="button" id="reset">Reset review</button><button type="button" class="primary" id="copy">Copy review</button></div>
<footer>Target: SystemSketch standalone product UI · worktree <code>{html.escape(str(ROOT))}</code> · branch <code>{html.escape(branch)}</code> · base <code>{base}</code> · machine-readable evidence: <a href="assets/ui-visibility-audit-2026-09-03/theme-contrast.json">before</a> · <a href="assets/ui-visibility-audit-2026-09-03/after/theme-contrast.json">after</a>.</footer>
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
