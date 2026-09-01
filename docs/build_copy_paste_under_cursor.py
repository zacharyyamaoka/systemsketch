from __future__ import annotations

import base64
from pathlib import Path


DOCS_DIR = Path(__file__).resolve().parent
SCREENSHOT_PATH = DOCS_DIR / "copy-paste-under-cursor-live-2026-09-01.png"
OUTPUT_PATH = DOCS_DIR / "copy-paste-under-cursor-2026-09-01.html"


def build_gallery() -> str:
    screenshot_data = base64.b64encode(SCREENSHOT_PATH.read_bytes()).decode("ascii")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch · Paste under cursor</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a;
      --muted: #626975;
      --line: #dfe3e9;
      --paper: #f7f8fa;
      --card: #ffffff;
      --accent: #5b5ee5;
      --accent-soft: #eeefff;
      --green: #177245;
      --green-soft: #e9f8ef;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 72px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 820px; margin: 0; font-size: clamp(42px, 6vw, 78px); line-height: .96; letter-spacing: -.055em; }}
    .lede {{ max-width: 760px; margin: 24px 0 0; color: var(--muted); font-size: 20px; line-height: 1.55; }}
    .status {{ display: inline-flex; align-items: center; gap: 9px; margin-top: 24px; padding: 9px 12px; border: 1px solid #b9e3c9; border-radius: 999px; color: var(--green); background: var(--green-soft); font-weight: 720; }}
    .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #28a461; box-shadow: 0 0 0 4px #ccefd9; }}
    .grid {{ display: grid; grid-template-columns: 1.06fr .94fr; gap: 18px; margin-top: 42px; }}
    .card {{ overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--card); box-shadow: 0 12px 40px rgba(28, 34, 48, .06); }}
    .card-copy {{ padding: 24px 25px 26px; }}
    .kicker {{ margin: 0 0 8px; color: var(--muted); font-size: 12px; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }}
    h2 {{ margin: 0; font-size: 24px; letter-spacing: -.025em; }}
    p {{ line-height: 1.6; }}
    .stage {{ position: relative; min-height: 430px; overflow: hidden; cursor: crosshair; background-color: #f7f8fb; background-image: radial-gradient(#d9dde5 1px, transparent 1px); background-size: 20px 20px; border-top: 1px solid var(--line); user-select: none; }}
    .shape {{ position: absolute; width: 144px; height: 92px; display: grid; place-items: center; border: 3px solid #262931; border-radius: 8px; background: rgba(255,255,255,.92); font-size: 13px; font-weight: 700; transition: left .2s ease, top .2s ease, opacity .2s ease, transform .2s ease; }}
    .shape.source {{ left: 54px; top: 58px; color: #686f7c; border-style: dashed; }}
    .shape.paste {{ left: calc(72% - 72px); top: calc(64% - 46px); box-shadow: 0 0 0 3px #b9baff; }}
    .cursor {{ position: absolute; left: 72%; top: 64%; width: 22px; height: 22px; pointer-events: none; transform: translate(-2px, -2px); filter: drop-shadow(0 2px 2px rgba(0,0,0,.18)); }}
    .cursor svg {{ display: block; }}
    .paste-label {{ position: absolute; left: 14px; bottom: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); background: rgba(255,255,255,.9); font: 650 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .controls {{ display: flex; gap: 9px; flex-wrap: wrap; padding: 14px; border-top: 1px solid var(--line); background: #fff; }}
    button {{ appearance: none; border: 1px solid #cfd4dc; border-radius: 10px; padding: 9px 12px; color: #242832; background: white; font: 700 13px/1 system-ui, sans-serif; cursor: pointer; }}
    button.primary {{ color: white; border-color: var(--accent); background: var(--accent); }}
    button:hover {{ transform: translateY(-1px); box-shadow: 0 5px 16px rgba(34,38,51,.1); }}
    .metric-list {{ display: grid; gap: 12px; margin-top: 20px; }}
    .metric {{ display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 14px 15px; border: 1px solid var(--line); border-radius: 14px; }}
    .metric-index {{ width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: var(--accent); background: var(--accent-soft); font-weight: 800; }}
    .metric strong, .metric span {{ display: block; }}
    .metric span {{ margin-top: 3px; color: var(--muted); font-size: 13px; }}
    .delta {{ color: var(--green); font: 760 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .proof {{ margin-top: 18px; }}
    .proof img {{ width: 100%; display: block; border-top: 1px solid var(--line); background: #f8f9fb; }}
    .section {{ margin-top: 18px; padding: 26px; }}
    .flow {{ display: grid; grid-template-columns: repeat(4, 1fr); align-items: stretch; gap: 30px; margin-top: 24px; }}
    .flow-node {{ position: relative; padding: 17px; border: 1px solid var(--line); border-radius: 15px; background: #fbfbfc; }}
    .flow-node:not(:last-child)::after {{ content: "→"; position: absolute; right: -23px; top: calc(50% - 12px); color: #969daa; font-size: 22px; }}
    .flow-node code {{ color: var(--accent); font-size: 12px; }}
    .flow-node strong {{ display: block; margin-top: 8px; font-size: 14px; }}
    .code {{ margin: 22px 0 0; padding: 18px; overflow: auto; border-radius: 15px; color: #d9e0ec; background: #181b22; font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .code .plus {{ color: #7ee0a8; }}
    .evidence {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 22px; }}
    .evidence > div {{ padding: 16px; border: 1px solid var(--line); border-radius: 14px; }}
    .evidence strong {{ display: block; margin-bottom: 5px; }}
    .evidence span {{ color: var(--muted); font-size: 13px; line-height: 1.5; }}
    .links {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 20px; }}
    .links a {{ padding: 9px 11px; border-radius: 10px; color: #383b9d; background: var(--accent-soft); text-decoration: none; font-size: 13px; font-weight: 720; }}
    footer {{ margin-top: 24px; color: var(--muted); font-size: 13px; text-align: center; }}
    @media (max-width: 820px) {{
      main {{ width: min(100% - 24px, 700px); padding-top: 32px; }}
      .grid, .flow, .evidence {{ grid-template-columns: 1fr; }}
      .flow-node:not(:last-child)::after {{ content: "↓"; right: auto; left: 22px; top: auto; bottom: -28px; }}
    }}
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">SystemSketch · Canvas UX</p>
    <h1>Paste now lands underneath the cursor.</h1>
    <p class="lede">The pyblocks behavior was ported through tldraw’s supported preference. SystemSketch does not parse, move, or recreate clipboard content itself; it asks tldraw to use the live page point.</p>
    <div class="status"><span class="dot"></span> Implemented and measured in the real app</div>

    <section class="grid">
      <article class="card">
        <div class="card-copy">
          <p class="kicker">Try the contract</p>
          <h2>Move, then paste</h2>
          <p>Move anywhere in the dotted canvas. The paste target follows the pointer and the block stays centered on it.</p>
        </div>
        <div class="stage" id="stage" aria-label="Interactive paste placement demonstration">
          <div class="shape source">copied shape</div>
          <div class="shape paste" id="paste-shape">pasted shape</div>
          <div class="cursor" id="cursor" aria-hidden="true">
            <svg width="24" height="28" viewBox="0 0 24 28"><path d="M3 2v20l5-5 4 8 4-2-4-8h7z" fill="#fff" stroke="#222733" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </div>
          <div class="paste-label" id="paste-label">center Δ 0 px</div>
        </div>
        <div class="controls">
          <button class="primary" id="paste-button">Ctrl / ⌘ + V</button>
          <button data-target="72,64">Target A</button>
          <button data-target="48,78">Target B</button>
        </div>
      </article>

      <article class="card card-copy">
        <p class="kicker">Physical browser measurement</p>
        <h2>Two targets, the same result</h2>
        <p>A real rectangle was copied through tldraw’s document handler, the physical pointer moved, and ordinary Ctrl+V fired the real paste handler.</p>
        <div class="metric-list">
          <div class="metric"><span class="metric-index">A</span><div><strong>Pointer 830, 460</strong><span>Pasted center 830.125, 460.125</span></div><span class="delta">0.18 px</span></div>
          <div class="metric"><span class="metric-index">B</span><div><strong>Pointer 610, 560</strong><span>Pasted center 610.125, 560.125</span></div><span class="delta">0.18 px</span></div>
          <div class="metric"><span class="metric-index">✓</span><div><strong>Native preference visible</strong><span>Preferences → Paste at cursor was checked</span></div><span class="delta">enabled</span></div>
        </div>
        <p style="color:var(--muted);font-size:13px">The 0.125 px per-axis remainder is tldraw’s rendered half-pixel/stroke alignment; the content is centered on the requested page point.</p>
      </article>
    </section>

    <section class="card proof">
      <div class="card-copy">
        <p class="kicker">Real Preview · Stock tldraw composition</p>
        <h2>Source plus two cursor-targeted pastes</h2>
        <p>The selected lower rectangle is the second paste. The screenshot is embedded here, so this report remains self-contained.</p>
      </div>
      <img src="data:image/png;base64,{screenshot_data}" alt="Live SystemSketch stock development canvas with one source rectangle and two pasted rectangles">
    </section>

    <section class="card section">
      <p class="kicker">Happy-path seam</p>
      <h2>One preference; tldraw keeps the machinery</h2>
      <div class="flow">
        <div class="flow-node"><code>Ctrl / ⌘ + V</code><strong>Stock clipboard event</strong></div>
        <div class="flow-node"><code>isPasteAtCursorMode</code><strong>Supported user preference</strong></div>
        <div class="flow-node"><code>getCurrentPagePoint()</code><strong>Live pointer → page space</strong></div>
        <div class="flow-node"><code>putContent…</code><strong>Native placement + selection</strong></div>
      </div>
      <pre class="code"><span class="plus">+ enablePasteAtCursor(editor)</span>

export function enablePasteAtCursor(editor) {{
  editor.user.updateUserPreferences({{
    isPasteAtCursorMode: true,
  }})
}}</pre>
      <div class="evidence">
        <div><strong>No custom paste handler</strong><span>tldraw retains MIME parsing, assets, text, shapes, bindings, selection, and history.</span></div>
        <div><strong>Every canvas profile</strong><span>The product, Block Dev, and Stock development mounts all opt into the same interaction.</span></div>
        <div><strong>Escape hatch retained</strong><span>tldraw’s alternate paste shortcut inverts the preference for a one-off paste in place.</span></div>
      </div>
      <div class="links">
        <a href="../src/pasteAtCursor.ts">Preference adapter</a>
        <a href="../src/pasteAtCursor.test.ts">Focused regression</a>
        <a href="../src/App.tsx">Canvas mounts</a>
        <a href="../tests/test_stock_boundary.py">Composition boundary test</a>
      </div>
    </section>

    <footer>Verification: 98 frontend tests · 24 Python tests · production build · two live paste targets · zero browser warnings/errors</footer>
  </main>
  <script>
    const stage = document.querySelector('#stage')
    const cursor = document.querySelector('#cursor')
    const pastedShape = document.querySelector('#paste-shape')
    const pasteButton = document.querySelector('#paste-button')
    let target = {{ x: 72, y: 64 }}

    function renderTarget() {{
      cursor.style.left = target.x + '%'
      cursor.style.top = target.y + '%'
    }}

    function paste() {{
      pastedShape.style.left = `calc(${{target.x}}% - 72px)`
      pastedShape.style.top = `calc(${{target.y}}% - 46px)`
      pastedShape.animate(
        [{{ opacity: .15, transform: 'scale(.82)' }}, {{ opacity: 1, transform: 'scale(1)' }}],
        {{ duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }}
      )
    }}

    stage.addEventListener('pointermove', (event) => {{
      const bounds = stage.getBoundingClientRect()
      target = {{
        x: Math.max(12, Math.min(88, ((event.clientX - bounds.left) / bounds.width) * 100)),
        y: Math.max(14, Math.min(86, ((event.clientY - bounds.top) / bounds.height) * 100)),
      }}
      renderTarget()
    }})
    stage.addEventListener('click', paste)
    pasteButton.addEventListener('click', paste)
    document.querySelectorAll('[data-target]').forEach((button) => {{
      button.addEventListener('click', () => {{
        const [x, y] = button.dataset.target.split(',').map(Number)
        target = {{ x, y }}
        renderTarget()
        paste()
      }})
    }})
  </script>
</body>
</html>
"""


def main() -> None:
    OUTPUT_PATH.write_text(build_gallery(), encoding="utf-8")
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
