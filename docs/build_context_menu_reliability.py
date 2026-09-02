#!/usr/bin/env python3
"""Build the self-contained context-menu reliability report from live proof."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = HERE / "context-menu-reliability-2026-09-02.html"
PROOF = HERE / "context-menu-reliability-live-2026-09-02.png"
FIXTURE = ROOT / "sketches/review/context-menu-always-available.png"
RESULTS = HERE / "assets/context-menu-reliability.json"
BASE_REVISION = "0568132b18a86a9aa8aeb3c2d83d22c36949507c"
BLOCK_CANVAS = ROOT / "src/blocks/ui/BlockCanvas.tsx"
BLOCK_CONTEXT_MENU = ROOT / "src/blocks/ui/BlockContextMenu.tsx"
RELIABLE_CONTEXT_MENU = ROOT / "src/blocks/ui/ReliableContextMenu.tsx"
REMOVED_ROOT_RECOVERY = ROOT / "src/blocks/ui/stockContextMenuRoot.ts"


def data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def excerpt(source: str, needle: str, before: int, after: int) -> str:
    lines = [line.rstrip() for line in source.splitlines()]
    index = next(i for i, line in enumerate(lines) if needle in line)
    start = max(0, index - before)
    end = min(len(lines), index + after + 1)
    return "\n".join(
        f"{line_no + 1:>4}  {lines[line_no]}".rstrip()
        for line_no in range(start, end)
    )


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, text=True, capture_output=True
    ).stdout.strip()


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    if not checks or not all(item.get("ok") for item in checks):
        raise RuntimeError("context-menu browser evidence is missing or not fully green")

    base = BASE_REVISION
    before_canvas = git("show", f"{base}:src/blocks/ui/BlockCanvas.tsx")
    after_canvas = BLOCK_CANVAS.read_text(encoding="utf-8")
    before_menu = git("show", f"{base}:src/blocks/ui/BlockContextMenu.tsx")
    after_menu = BLOCK_CONTEXT_MENU.read_text(encoding="utf-8")
    reliable_menu = RELIABLE_CONTEXT_MENU.read_text(encoding="utf-8")

    if "closest('input, textarea, select')" in after_canvas:
        raise RuntimeError("the inline-editor context-menu blocker is still present")
    if "useStockContextMenuRootEpoch" in after_menu or REMOVED_ROOT_RECOVERY.exists():
        raise RuntimeError("the custom context-menu root remount still exists")
    if "<ReliableContextMenu {...props}>" not in after_menu:
        raise RuntimeError("the reliable context-menu seam is not mounted")
    if "open={isOpen}" not in reliable_menu or "{Canvas ? <Canvas /> : null}" not in reliable_menu:
        raise RuntimeError("the controlled context-menu root is not preserving Canvas")

    check_list = "".join(
        f"<li>{html.escape(item['label'])}</li>" for item in checks
    )
    page = TEMPLATE.format(
        base=html.escape(base[:10]),
        proof=data_url(PROOF),
        fixture=data_url(FIXTURE),
        checks=len(checks),
        check_list=check_list,
        blocker=html.escape(excerpt(before_canvas, "onContextMenu={(event)", 3, 8)),
        remount=html.escape(excerpt(before_menu, "const stockRootEpoch", 6, 8)),
        reliable=html.escape(excerpt(reliable_menu, "const [registeredOpen", 4, 24)),
    )
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — context menu reliability</title>
<style>
  :root{{--bg:#080b12;--panel:#111724;--panel2:#182133;--ink:#f6f8fc;--muted:#9ca9bd;--line:#2d3749;--blue:#6d8dff;--green:#72d59b;--orange:#ff9b43;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:dark}}
  *{{box-sizing:border-box}}body{{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,141,255,.22),transparent 34rem),radial-gradient(circle at 2% 54%,rgba(255,155,67,.08),transparent 30rem),var(--bg)}}
  .shell{{width:min(1160px,calc(100% - 36px));margin:auto;padding:44px 0 72px}}.eyebrow{{color:#a9baff;font:800 11px ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}
  h1{{max-width:930px;margin:15px 0 13px;font-size:clamp(40px,6vw,70px);line-height:.98;letter-spacing:-.055em}}.lede{{max-width:870px;margin:0;color:#c7d0de;font-size:18px;line-height:1.58}}
  .stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:28px 0 0}}.stat,.card{{border:1px solid var(--line);border-radius:16px;background:rgba(17,23,36,.9)}}.stat{{padding:17px 19px}}.stat b{{display:block;font-size:27px}}.stat span{{color:var(--muted);font-size:13px}}
  section{{margin-top:52px}}h2{{margin:0 0 8px;font-size:30px;letter-spacing:-.035em}}.copy{{max-width:880px;margin:0 0 22px;color:var(--muted);line-height:1.62}}
  figure{{margin:0;overflow:hidden;border:1px solid #3a465e;border-radius:17px;background:#edf0f4;box-shadow:0 18px 48px rgba(0,0,0,.34)}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:12px 15px;background:var(--panel);color:var(--muted);font-size:13px;line-height:1.5}}figcaption b{{display:block;color:var(--ink);margin-bottom:3px}}
  .grid2{{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}}.card{{padding:20px 22px}}.card h3{{margin:0 0 8px;font-size:17px}}.card p{{margin:0;color:var(--muted);line-height:1.6}}code{{padding:2px 5px;border-radius:5px;background:#202b3d;color:#d8e0ed;font:600 12px ui-monospace,monospace}}
  .flow{{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;align-items:center;gap:0}}.node{{min-height:130px;padding:18px;border:1px solid var(--line);border-radius:15px;background:var(--panel)}}.node b{{display:block;margin-bottom:8px}}.node span{{color:var(--muted);font-size:14px;line-height:1.5}}.arrow{{text-align:center;color:var(--blue);font-size:30px}}
  .node.bad{{border-color:rgba(255,155,67,.55)}}.node.good{{border-color:rgba(114,213,155,.55)}}
  .codegrid{{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}}.codegrid>div{{min-width:0}}pre{{margin:0;min-height:100%;padding:16px;overflow:auto;border:1px solid var(--line);border-radius:14px;background:#0d1320;color:#ced8e6;font:600 12px/1.55 ui-monospace,monospace}}.label{{display:inline-block;margin-bottom:9px;color:var(--muted);font:800 11px ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}}
  ul{{margin:0;padding:0;list-style:none}}li{{position:relative;margin:0 0 10px;padding-left:25px;color:#cbd4e1;line-height:1.5}}li:before{{content:'✓';position:absolute;left:0;color:var(--green);font-weight:900}}
  footer{{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}
  @media(max-width:850px){{.stats,.grid2,.codegrid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style>
</head>
<body><main class="shell">
  <div class="eyebrow">SystemSketch · reliability fix · base {base}</div>
  <h1>Right-click means menu. Every time.</h1>
  <p class="lede">The first repair removed SystemSketch's event blocker and root re-key, but exposed the deeper failure: tldraw 5.3.2 tracks context-menu state twice. A normal outside click can clear tldraw's registry before its uncontrolled Radix root closes, leaving that root permanently “open” and every later right-click inert. SystemSketch now controls that one root through tldraw's supported <code>ContextMenu</code> component seam while continuing to use stock menu content and canvas behavior.</p>
  <div class="stats"><div class="stat"><b>{checks}/{checks}</b><span>focused physical browser checks</span></div><div class="stat"><b>1 gesture</b><span>no retry, including swallowed events</span></div><div class="stat"><b>0</b><span>browser console errors or warnings</span></div></div>

  <section><h2>The observed result</h2><p class="copy">One physical right-click over stock rich text opens the stock menu while the same Canvas remains mounted. The same journey also covers active Block fields, swallowed descendant events, three repeated opens with the floating selection toolbar visible, and a click directly on that toolbar.</p>
    <figure><img src="{proof}" alt="Live SystemSketch with the stock context menu open over a selected rich-text rectangle" /><figcaption><b>Real app, real pointer event</b>The rectangle began in active Tiptap editing. The menu opens without a retry, without replacing Canvas, and without <code>editor.view</code> warnings.</figcaption></figure>
  </section>

  <section><h2>What was actually broken</h2><div class="flow"><div class="node bad"><b>Two open states</b><span>tldraw's global registry says closed while the stock uncontrolled Radix root still says open.</span></div><div class="arrow">→</div><div class="node bad"><b>Every retry ignored</b><span>Radix receives another request for <code>open=true</code>, sees no state change, and mounts no menu.</span></div><div class="arrow">→</div><div class="node bad"><b>Old recovery crashed</b><span>Re-keying the root reset Radix by rebuilding Canvas, invalidating Tiptap's active <code>EditorView</code>.</span></div></div></section>

  <section><h2>The narrow fix</h2><p class="copy">Remove the input event blocker and the Canvas-remount recovery. The replacement mirrors tldraw's stock wrapper but makes Radix controlled: when the editor registry closes out of band, local <code>isOpen</code> closes too. The root itself stays mounted, so the Canvas and any active Tiptap view keep their identity. Stock <code>DefaultContextMenuContent</code>, pointer targeting, shapes, tools, and editor behavior remain unchanged.</p>
    <div class="codegrid"><div><span class="label">Removed · Block event blocker</span><pre>{blocker}</pre></div><div><span class="label">Removed · root re-key / Canvas rebuild</span><pre>{remount}</pre></div></div>
    <div style="margin-top:14px"><span class="label">Now · controlled root, stable Canvas</span><pre>{reliable}</pre></div>
  </section>

  <section><h2>Evidence, not expectation</h2><div class="grid2"><div class="card"><h3>Focused acceptance</h3><ul>{check_list}</ul></div><figure><img src="{fixture}" alt="Context-menu reliability review fixture with two orange instruction arrows and a green pass card" /><figcaption><b>Disposable human review board</b>Double-click the title, then right-click directly on the active field. The green card names the visible pass condition.</figcaption></figure></div></section>

  <footer>Generated by <code>docs/build_context_menu_reliability.py</code> from the pinned pre-fix commit, the live working tree, browser results JSON, and screenshots captured by the real app journey.</footer>
</main></body></html>'''


if __name__ == "__main__":
    main()
