#!/usr/bin/env python3
"""Build the self-contained interface-scale implementation gallery."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "interface-scale-implementation-2026-08-31.html"


def png_data(name: str) -> str:
    encoded = base64.b64encode((DOCS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch · Settings and interface scale</title>
  <style>
    :root { color-scheme: light; --ink:#20242b; --muted:#68707c; --line:#dfe2e8; --violet:#7253df; --green:#25845e; --paper:#fff; --wash:#f4f5f8; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; color:var(--ink); background:linear-gradient(150deg,#f8f8fb 0,#f1f2f7 44%,#eceef5 100%); }
    a { color:#5236bd; text-underline-offset:3px; }
    .page { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:42px 0 72px; }
    .hero { position:relative; overflow:hidden; padding:42px; border:1px solid rgb(49 43 83 / 12%); border-radius:28px; background:rgb(255 255 255 / 90%); box-shadow:0 24px 80px rgb(33 37 51 / 10%); }
    .hero::after { content:"⚙"; position:absolute; right:-22px; top:-64px; color:rgb(114 83 223 / 7%); font-size:240px; line-height:1; }
    .eyebrow { color:var(--violet); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
    h1 { max-width:800px; margin:12px 0 14px; font-size:clamp(38px,6vw,68px); line-height:.98; letter-spacing:-.055em; }
    .lede { max-width:760px; margin:0; color:var(--muted); font-size:18px; line-height:1.55; }
    .chips { display:flex; flex-wrap:wrap; gap:9px; margin-top:25px; }
    .chip { padding:8px 11px; border:1px solid #ded9f5; border-radius:999px; color:#4c368f; background:#f4f1ff; font-size:12px; font-weight:760; }
    section { margin-top:24px; padding:30px; border:1px solid rgb(38 43 55 / 11%); border-radius:22px; background:rgb(255 255 255 / 92%); box-shadow:0 14px 45px rgb(33 37 51 / 7%); }
    .section-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:20px; }
    h2 { margin:0; font-size:27px; letter-spacing:-.025em; }
    .section-head p { max-width:590px; margin:0; color:var(--muted); line-height:1.5; }
    .media-grid { display:grid; grid-template-columns:.72fr 1.5fr; gap:18px; align-items:start; }
    figure { margin:0; overflow:hidden; border:1px solid #d9dce3; border-radius:16px; background:#f7f8fa; box-shadow:0 10px 28px rgb(32 38 50 / 10%); }
    figure img { display:block; width:100%; height:auto; }
    figcaption { padding:12px 14px; border-top:1px solid #e1e3e8; color:#646c77; background:#fff; font-size:12px; line-height:1.45; }
    .proof-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    .proof { min-height:170px; padding:18px; border:1px solid var(--line); border-radius:14px; background:linear-gradient(155deg,#fff,#f7f8fa); }
    .proof b { display:block; margin-bottom:14px; color:var(--green); font-size:11px; letter-spacing:.09em; text-transform:uppercase; }
    .proof strong { display:block; font-size:22px; line-height:1.08; }
    .proof p { margin:11px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
    .compare { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; }
    .metric { padding:20px; border:1px solid var(--line); border-radius:15px; text-align:center; background:#fafafe; }
    .metric span { display:block; color:var(--muted); font-size:11px; font-weight:700; }
    .metric strong { display:block; margin-top:8px; font-size:30px; }
    .arrow { color:#9a8ed0; font-size:26px; }
    .invariant { margin-top:16px; padding:16px 18px; border:1px solid #d9ebdf; border-radius:13px; color:#276448; background:#f2faf5; font-size:13px; line-height:1.5; }
    .map { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .map article { padding:17px; border:1px solid var(--line); border-radius:14px; background:#fafbfc; }
    .map code { display:block; overflow-wrap:anywhere; color:#5035b2; font-size:12px; font-weight:760; }
    .map p { margin:9px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
    .tests { display:flex; flex-wrap:wrap; gap:10px; }
    .test { display:flex; align-items:center; gap:9px; padding:11px 13px; border:1px solid #cfe7d8; border-radius:11px; color:#285f47; background:#f3faf6; font-size:12px; font-weight:760; }
    .test::before { content:"✓"; display:grid; width:20px; height:20px; place-items:center; border-radius:50%; color:white; background:#2d9467; }
    footer { display:flex; justify-content:space-between; gap:20px; padding:26px 5px 0; color:#68707c; font-size:12px; }
    @media (max-width:850px) { .media-grid,.proof-grid,.map { grid-template-columns:1fr 1fr; } .hero { padding:30px; } }
    @media (max-width:590px) { .page { width:min(100% - 18px,1180px); padding-top:10px; } .hero,section { padding:22px; border-radius:17px; } .media-grid,.proof-grid,.map { grid-template-columns:1fr; } .section-head { display:block; } .section-head p { margin-top:9px; } .compare { gap:8px; } .metric { padding:13px 8px; } footer { display:block; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div class="eyebrow">Selected V1 · implemented and browser-verified</div>
      <h1>Settings, with a gear—and a UI that finally fits the display.</h1>
      <p class="lede">The SystemSketch main menu now opens a centered Settings window. Its Interface scale enlarges menus, panels, dialogs, the toolbar, and app chrome while leaving tldraw canvas zoom and board geometry alone. The choice is remembered locally across reloads.</p>
      <div class="chips"><span class="chip">⚙ Settings</span><span class="chip">80–160%</span><span class="chip">90 / 100 / 110 / 125 / 150 presets</span><span class="chip">local-only preference</span><span class="chip">canvas invariant</span></div>
    </header>

    <section>
      <div class="section-head"><h2>The shipped flow</h2><p>The first image proves the requested gear-led entry point. The second is the real Preview app at 125%, with the icon-cued settings rail and dimmed canvas behind it.</p></div>
      <div class="media-grid">
        <figure><img src="__MENU_IMAGE__" alt="SystemSketch main menu showing a gear icon beside Settings at 125 percent interface scale"><figcaption>Main menu → <strong>⚙ Settings</strong>. It is a top-level app destination, separate from File’s document operations.</figcaption></figure>
        <figure><img src="__SETTINGS_IMAGE__" alt="Centered SystemSketch Settings window showing Interface scale set to 125 percent"><figcaption>The selected Interface panel at <strong>125%</strong>. General, Appearance, Shortcuts, and About remain visible as icon-cued future categories.</figcaption></figure>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Observable proof</h2><p>Evidence below comes from the actual Preview app at 1280×720, not the proposal prototype.</p></div>
      <div class="proof-grid">
        <article class="proof"><b>Persistence</b><strong>125% after reload</strong><p>The app’s scale marker rehydrated to 125 after a full page reload.</p></article>
        <article class="proof"><b>Canvas zoom</b><strong>100% throughout</strong><p>The existing bottom-right canvas zoom readout never changed.</p></article>
        <article class="proof"><b>Board geometry</b><strong>Exact match</strong><p>Two visible shape rectangles had identical x, y, width, and height at UI 100% and 125%.</p></article>
        <article class="proof"><b>Preference boundary</b><strong>Browser-local</strong><p>Stored under <code>systemsketch.interface-scale.v1</code>, never serialized into a <code>.tldr</code> file.</p></article>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>The UI grows; the board does not</h2><p>CSS zoom is applied only to tldraw’s interface layer, the SystemSketch popout host, and portaled UI surfaces.</p></div>
      <div class="compare">
        <div class="metric"><span>Top-left shell at 100%</span><strong>46 px</strong></div><div class="arrow">→</div><div class="metric"><span>Top-left shell at 125%</span><strong>57.5 px</strong></div>
      </div>
      <div class="compare" style="margin-top:10px">
        <div class="metric"><span>Toolbar at 100%</span><strong>48 px</strong></div><div class="arrow">→</div><div class="metric"><span>Toolbar at 125%</span><strong>59.5 px</strong></div>
      </div>
      <div class="invariant"><strong>Invariant:</strong> the first measured shape remained <code>200 × 199.99997</code> at <code>x −41.3573, y 471.5071</code> in both states; the second remained <code>348 × 228</code> at <code>x 778.125, y 693.125</code>.</div>
    </section>

    <section>
      <div class="section-head"><h2>Implementation boundary</h2><p>The feature is deliberately small: a pure preference model, one settings surface, and a narrow rendering token on the app shell.</p></div>
      <div class="map">
        <article><code>src/settings/interfaceScale.ts</code><p>Bounds, five-percent normalization, resilient localStorage read/write, and the reactive preference store.</p></article>
        <article><code>src/settings/InterfaceSettings.tsx</code><p>Gear icon, centered Settings dialog, icon rail, live slider, presets, saved-state explanation, and reset.</p></article>
        <article><code>src/settings/interface-settings.css</code><p>Dialog styling and UI-only zoom selectors for layout, popouts, menus, dialogs, tooltips, and toasts.</p></article>
        <article><code>src/workspace/LocalWorkspace.tsx</code><p>Adds the top-level Settings menu item through the existing public tldraw menu seam.</p></article>
        <article><code>src/App.tsx</code><p>Hydrates the local preference and exposes the current scale as a CSS token and inspectable data marker.</p></article>
        <article><code>src/settings/interfaceScale.test.ts</code><p>Covers bounds, snapping, malformed storage, persistence format, and the normalized CSS value.</p></article>
      </div>
    </section>

    <section>
      <div class="section-head"><h2>Verification</h2><p>The full TypeScript, Vitest, Python, production build, and real-browser paths were exercised.</p></div>
      <div class="tests"><span class="test">TypeScript passed</span><span class="test">51 Vitest tests passed</span><span class="test">22 Python tests passed</span><span class="test">Production build passed</span><span class="test">Menu + dialog exercised</span><span class="test">Reload persistence passed</span><span class="test">No console warnings or errors</span></div>
    </section>

    <footer><span>SystemSketch · interface scale implementation · 31 Aug 2026</span><span><a href="ui-scale-proposals-2026-08-31.html">Open the five-direction proposal</a> · <a href="../README.md">README</a></span></footer>
  </main>
</body>
</html>
"""


def main() -> None:
    rendered = HTML.replace("__MENU_IMAGE__", png_data("interface-scale-settings-menu.png"))
    rendered = rendered.replace("__SETTINGS_IMAGE__", png_data("interface-scale-settings-125.png"))
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"Built {OUTPUT}")


if __name__ == "__main__":
    main()
