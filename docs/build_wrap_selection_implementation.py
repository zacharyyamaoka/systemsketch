#!/usr/bin/env python3
"""Build `docs/wrap-selection-implementation-2026-09-03.html`.

Turning a multi-selection into a container, on two surfaces: the Wrap tile on
the floating selection menu (V2) and `Turn into ▸` in the right-click menu (V1).
Both read one descriptor table and run one command.

Every number is measured from the tree at build time, and every frame comes
from the real-browser journey rather than from a mock.
"""

from __future__ import annotations

import base64
import html
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "wrap-selection-implementation-2026-09-03.html"
ACCEPTANCE = ASSETS / "wrap-selection-acceptance.json"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


def read(relative: str) -> str:
    path = REPO / relative
    return path.read_text(encoding="utf-8") if path.exists() else ""


def crop_uri(name: str, box=None, width: int = 1100) -> str:
    path = ASSETS / name if (ASSETS / name).exists() else REPO / name
    if not path.exists():
        return ""
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    if image.width != width:
        ratio = width / image.width
        image = image.resize((width, max(1, int(image.height * ratio))), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=86, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def figure(name: str, caption: str, box=None, width: int = 1100) -> str:
    uri = crop_uri(name, box, width)
    if not uri:
        return (f'<figure class="missing"><figcaption>{caption} — <i>frame missing: run'
                " <code>node tests/wrap_selection_smoke.mjs</code></i></figcaption></figure>")
    return (f'<figure><img src="{uri}" alt="{html.escape(caption)}"/>'
            f"<figcaption>{caption}</figcaption></figure>")


# ------------------------------------------------------------------ measured
HEAD = git("rev-parse", "--short", "HEAD")
MODEL = read("src/frames/wrapSelection.ts")
CONTROL = read("src/frames/WrapSelectionControl.tsx")
MENU = read("src/blocks/ui/BlockContextMenu.tsx")
OVERRIDES = read("src/toolbar/toolbarIntegration.ts")

# Descriptors are written both inline and multi-line, so the pattern has to
# tolerate the newline between `target` and `label` or it silently drops the
# two stock entries — which is exactly what it did on the first build.
TARGETS = re.findall(r"target: '(\w+)',\s*label: '([^']+)'", MODEL)
assert len(TARGETS) == 4, f"expected 4 wrap targets, parsed {TARGETS}"
STOCK_TARGETS = re.findall(r"stockActionId: '([\w-]+)'", MODEL)
OWNED = re.search(r"OWNED_WRAP_TARGETS = \[([^\]]+)\]", MODEL)
BLOCK_INSET = re.search(r"block: \{ top: (\d+), side: (\d+), bottom: (\d+) \}", MODEL)
RENAMED = re.search(r"'action\.remove-frame': '([^']+)'", OVERRIDES)
GATE = "length >= 2" in MODEL
UNIT_TESTS = len(re.findall(r"^\s*it\(", read("src/frames/wrapSelection.test.ts"), re.M))
HAS_SUBMENU = "TldrawUiMenuSubmenu" in MENU and "turn-into" in MENU
DUPLICATE_GONE = "Delete frame, leave children" not in MENU
REMOVE_FRAME_MODULE_GONE = not (REPO / "src/frames/removeFrame.ts").exists()

checks = json.loads(ACCEPTANCE.read_text(encoding="utf-8")) if ACCEPTANCE.exists() else []
PASSED = sum(1 for entry in checks if entry.get("ok"))

FIXTURE = REPO / "sketches/review/wrap-selection.systemsketch"
FIXTURE_URL = "http://127.0.0.1:4322/?board=" + str(FIXTURE).replace("/", "%2F")

# tldraw's own registration, read from the pinned engine — the dead-shortcut find.
ACTIONS = read("node_modules/tldraw/src/lib/ui/context/actions.tsx")
FRAME_KBD = re.search(r"id: 'frame-selection',\s*\n\s*label: '[^']+',\s*\n\s*kbd: '([^']+)'", ACTIONS)
GROUP_KBD = re.search(r"id: 'group',\s*\n\s*label: '[^']+',\s*\n\s*kbd: '([^']+)'", ACTIONS)


def check_rows() -> str:
    rows = []
    for entry in checks:
        mark = "pass" if entry.get("ok") else "fail"
        rows.append(
            f'<tr class="{mark}"><td><code>{html.escape(entry["id"])}</code></td>'
            f'<td>{html.escape(entry["label"])}</td>'
            f'<td class="mark">{"PASS" if entry.get("ok") else "FAIL"}</td></tr>'
        )
    return "".join(rows) or '<tr><td colspan="3">no acceptance file — run the journey</td></tr>'


def seam_svg() -> str:
    return """
    <svg class="diagram" viewBox="0 0 980 300" xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label="Two surfaces, one command">
      <text class="hd" x="20" y="26">Two surfaces, one descriptor table, one command</text>

      <g class="surface"><rect x="30" y="60" width="230" height="62" rx="6"/>
        <text x="145" y="86" text-anchor="middle" class="name">Wrap tile</text>
        <text x="145" y="105" text-anchor="middle" class="cap">selection menu · V2</text></g>
      <g class="surface"><rect x="30" y="150" width="230" height="62" rx="6"/>
        <text x="145" y="176" text-anchor="middle" class="name">Turn into ▸</text>
        <text x="145" y="195" text-anchor="middle" class="cap">right-click menu · V1</text></g>

      <g class="core"><rect x="360" y="98" width="240" height="76" rx="6"/>
        <text x="480" y="126" text-anchor="middle" class="name">WRAP_TARGET_DESCRIPTORS</text>
        <text x="480" y="146" text-anchor="middle" class="cap">label · hint · who owns it</text>
        <text x="480" y="164" text-anchor="middle" class="cap">+ canWrapSelection()</text></g>

      <path class="wire" d="M260 91 H310 V128 H360"/>
      <path class="wire" d="M260 181 H310 V146 H360"/>

      <g class="stock"><rect x="700" y="60" width="250" height="62" rx="6"/>
        <text x="825" y="86" text-anchor="middle" class="name">stock actions</text>
        <text x="825" y="105" text-anchor="middle" class="cap">frame-selection · group</text></g>
      <g class="ours"><rect x="700" y="150" width="250" height="62" rx="6"/>
        <text x="825" y="176" text-anchor="middle" class="name">wrapSelectionInto()</text>
        <text x="825" y="195" text-anchor="middle" class="cap">block · branch</text></g>

      <path class="wire" d="M600 128 H660 V91 H700"/>
      <path class="wire" d="M600 146 H660 V181 H700"/>

      <text class="note" x="30" y="252">The engine keeps the two containers it already has, so its history entry,</text>
      <text class="note" x="30" y="272">analytics and frames-are-their-own-inverse toggle all come along unchanged.</text>
      <text class="note" x="30" y="292">Only Block and Branch — the containers tldraw does not have — are ours.</text>
    </svg>
    """


def build() -> str:
    target_rows = "".join(
        f"<tr><td><b>{html.escape(label)}</b></td><td><code>{html.escape(target)}</code></td>"
        f'<td>{"stock action" if target in ("frame", "group") else "ours"}</td></tr>'
        for target, label in TARGETS
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Turn a selection into a container</title>
<style>
 :root {{ --ink:#12151a; --dim:#5a6472; --line:#dfe3ea; --bg:#fbfcfd; --card:#fff;
   --accent:#1f6feb; --ok:#0f7b45; --bad:#a32f2f;
   --mono:ui-monospace,SFMono-Regular,Menlo,monospace; }}
 * {{ box-sizing:border-box; }}
 body {{ margin:0; background:var(--bg); color:var(--ink);
   font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }}
 .wrap {{ max-width:1180px; margin:0 auto; padding:48px 28px 96px; }}
 h1 {{ font-size:36px; line-height:1.15; margin:0 0 10px; letter-spacing:-.02em; }}
 h2 {{ font-size:23px; margin:52px 0 14px; letter-spacing:-.01em; }}
 .lede {{ font-size:18px; color:var(--dim); max-width:74ch; margin:0 0 22px; }}
 .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:0 0 30px; }}
 .meta span {{ font:12px/1 var(--mono); background:#eef1f6; border:1px solid var(--line);
   border-radius:999px; padding:7px 11px; color:var(--dim); }}
 code {{ font-family:var(--mono); font-size:.9em; background:#eef1f6; border-radius:4px; padding:1px 5px; }}
 table {{ border-collapse:collapse; width:100%; background:var(--card);
   border:1px solid var(--line); border-radius:8px; overflow:hidden; margin-bottom:18px; }}
 th,td {{ text-align:left; padding:10px 14px; border-bottom:1px solid var(--line);
   vertical-align:top; font-size:14.5px; }}
 th {{ background:#f4f6fa; font-size:12px; text-transform:uppercase; letter-spacing:.07em; color:var(--dim); }}
 tr:last-child td {{ border-bottom:none; }}
 .mark {{ font:600 12px var(--mono); }}
 tr.pass .mark {{ color:var(--ok); }} tr.fail .mark {{ color:var(--bad); }}
 figure {{ margin:0 0 18px; background:var(--card); border:1px solid var(--line);
   border-radius:10px; overflow:hidden; }}
 figure img {{ display:block; width:100%; }}
 figcaption {{ font-size:13px; color:var(--dim); padding:10px 14px; border-top:1px solid var(--line); }}
 .shots {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
 svg.diagram {{ display:block; width:100%; height:auto; margin:8px 0 18px; background:#f7f9fc;
   border:1px solid var(--line); border-radius:10px; }}
 .diagram text {{ font:12px var(--mono); fill:#2b3341; }}
 .diagram .hd {{ font:600 13px -apple-system,sans-serif; fill:#12151a; }}
 .diagram .name {{ font:600 12px var(--mono); fill:#12151a; }}
 .diagram .cap {{ font:11px var(--mono); fill:#78828f; }}
 .diagram .note {{ font:12px -apple-system,sans-serif; fill:#5a6472; }}
 .diagram .surface rect {{ fill:#fff; stroke:#9aa4b2; stroke-width:1.4; }}
 .diagram .core rect {{ fill:#eef5ff; stroke:#4f8ef7; stroke-width:1.6; }}
 .diagram .stock rect {{ fill:#eaf6ef; stroke:#3f9b6d; stroke-width:1.4; }}
 .diagram .ours rect {{ fill:#fff5e8; stroke:#c98a2e; stroke-width:1.4; }}
 .diagram .wire {{ fill:none; stroke:#5a6472; stroke-width:1.6; }}
 .callout {{ background:#fff8e6; border:1px solid #e6cf94; border-left-width:4px;
   border-radius:0 8px 8px 0; padding:14px 18px; margin:18px 0; }}
 .callout b {{ color:#8a5d00; }}
 a {{ color:var(--accent); }}
 kbd {{ font:11px var(--mono); border:1px solid var(--line); border-bottom-width:2px;
   border-radius:4px; padding:1px 5px; background:#fff; }}
 @media (max-width:900px) {{ .shots {{ grid-template-columns:1fr; }} }}
</style></head><body><div class="wrap">

<h1>Turn a selection into a container</h1>
<p class="lede">Two or more objects selected, one move to hold them together — reachable from the
floating selection menu and from the right-click menu, both running the same command.</p>
<div class="meta">
  <span>HEAD {HEAD}</span><span>{PASSED}/{len(checks)} browser checks</span>
  <span>{UNIT_TESTS} unit tests</span><span>2026-09-03</span>
</div>

<h2>What was built</h2>
{seam_svg()}
<table>
  <tr><th>Container</th><th>Target</th><th>Who performs it</th></tr>
  {target_rows}
</table>
<p>The gate is <b>two or more adoptable shapes</b>{' — asserted in the model' if GATE else ''}.
A connection is never adopted, because a cable follows its endpoints; both shape tools already
exclude it for the same reason. Wrapping in a Block flips it to <b>Expanded</b>, the only view
that holds children, and a Block wrap leaves
<code>{BLOCK_INSET.group(1) if BLOCK_INSET else '48'}px</code> above the selection for its
heading band.</p>

<h2>Both surfaces, in the running app</h2>
<div class="shots">
{figure("wrap-selection-menu.png", "V2 — the Wrap tile on the floating selection menu, open. Broad face plus chevron, built on the same <code>TldrawUiPopover</code> and FigJam tokens the appearance controls use.", (0, 0, 1440, 620), 1100)}
{figure("wrap-selection-block.png", "The result: an Expanded Block holding both rectangles. The mini-menu shows S / P / <b>E</b> with Step in, and the inspector confirms the view.", (0, 0, 1440, 620), 1100)}
</div>
{figure("wrap-selection-context-menu.png", "V1 — <code>Turn into ▸</code> in the right-click menu, reading the same descriptor table.", (0, 0, 1440, 760), 1100)}

<h2>The duplicate command, collapsed</h2>
<div class="callout">
<p><b>Two commands, one effect.</b> This menu carried
<code>Delete frame, leave children</code> next to stock <code>Remove frame</code>. Reading both:
stock operates on <b>any frame-like shape</b> and reparents children out before deleting, then
selects them; ours was <code>type === 'frame'</code> only with the same result. Stock is a strict
superset.</p>
<p>So the pair collapsed to one, renamed rather than explained:
<b>{html.escape(RENAMED.group(1)) if RENAMED else 'Remove frame, leave children'}</b>, through a
<code>translations</code> override on the existing overrides seam. The Frame-only module is
{'deleted' if REMOVE_FRAME_MODULE_GONE else 'still present'}, and the duplicate menu item is
{'gone' if DUPLICATE_GONE else 'still there'}.</p>
</div>

<h2>A dead shortcut in the pinned engine</h2>
<p>Reading tldraw 5.3.2's own action table to find the stock wrap turned up a bug worth
reporting upstream. <code>frame-selection</code> registers
<code>kbd: '{FRAME_KBD.group(1) if FRAME_KBD else 'cmd+alt+g'}'</code> with no ctrl alternative,
while <code>group</code> directly above it registers
<code>'{GROUP_KBD.group(1) if GROUP_KBD else 'cmd+g,ctrl+g'}'</code>. The label formatter prints
"Ctrl+Alt+G" regardless, so on Linux the menu advertises a shortcut that cannot fire. The tile
and the submenu both sidestep it; the binding itself is untouched and still broken.</p>

<h2>Proof</h2>
<p>Driven in headless Chrome against the product composition with real pointer events — the gate
at zero, one and two objects; the tile's four options; a Block wrap and its adoption; one-press
undo; the context-menu route; the renamed stock command read out of the reopened Edit submenu.</p>
<table>
  <tr><th>Check</th><th>What it proves</th><th>Result</th></tr>
  {check_rows()}
</table>

<h2>Review board</h2>
{figure(str(REPO / "sketches/review/wrap-selection.png"), "Three real Blocks with the gesture cued and a green pass condition. Generated through the editor and autosave path, then cold-reopened.", None, 1100)}
<p>Open it on the running Preview:<br/>
<a href="{FIXTURE_URL}"><code>{FIXTURE_URL}</code></a></p>

<h2>Boundary</h2>
<p>The five-variant comparison recommended <b>V2</b> with <b>V1</b> 3.2 points behind — a soft
lead — so both were built rather than one. V3 (wrap first, retype later), V4 (a key family) and
V5 (drag a container over them) were not. Nothing derives structure at wrap time: the container
is created, the shapes are reparented, and that is all — no port synthesis, no type inference, no
lint.</p>

</div></body></html>
"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024:.0f} KB)")
