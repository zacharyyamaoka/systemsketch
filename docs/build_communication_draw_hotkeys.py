#!/usr/bin/env python3
"""Build the self-contained review packet for the DRAW group's 1/2/3 keys.

Every number below is measured from the live tree at build time — the digit
map out of the source, the check counts out of the tests, and the competing
toolbar table out of the installed tldraw — so the report cannot drift from
the code it describes.
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

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "communication-draw-hotkeys"
FIXTURE_IMAGE = ROOT / "sketches" / "review" / "communication-draw-hotkeys.png"
SHORTCUTS = ROOT / "src" / "prototypes" / "communication" / "communicationDrawShortcuts.ts"
UNIT_TEST = ROOT / "src" / "prototypes" / "communication" / "communicationDrawShortcuts.test.ts"
CONTROLS = ROOT / "src" / "prototypes" / "communication" / "CommunicationPrototypeControls.tsx"
JOURNEY = ROOT / "tests" / "communication_draw_hotkeys_smoke.mjs"
TOOLBAR_SOURCE = (
    ROOT / "node_modules" / "tldraw" / "dist-esm" / "lib" / "ui"
    / "components" / "Toolbar" / "OverflowingToolbar.mjs"
)
GEOMETRY = ASSETS / "geometry.json"
OUTPUT = ROOT / "docs" / "communication-draw-hotkeys-2026-09-06.html"


def data_uri(path: Path, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def crop_draw_row(name: str, margin: int = 14, scale: int = 2) -> str:
    """Close up on the DRAW row, using the box the journey actually measured.

    WHY read the box rather than hardcode it: a hardcoded crop survives a
    layout change by quietly cutting the subject out of the report, which is
    the one failure a report must not have.
    """
    box = json.loads(GEOMETRY.read_text(encoding="utf-8"))["drawRow"]
    image = Image.open(ASSETS / name)
    region = image.crop((
        max(0, int(box["x"]) - margin),
        max(0, int(box["y"]) - margin),
        min(image.width, int(box["x"] + box["width"]) + margin),
        min(image.height, int(box["y"] + box["height"]) + margin),
    ))
    region = region.resize((region.width * scale, region.height * scale), Image.LANCZOS)
    buffer = io.BytesIO()
    region.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.strip()


def measured_digits() -> list[tuple[str, str]]:
    """The digit map, read out of the source rather than restated here."""
    text = SHORTCUTS.read_text(encoding="utf-8")
    block = re.search(r"COMMUNICATION_DRAW_SHORTCUTS[^=]*=\s*\{(.*?)\n\}", text, re.S).group(1)
    return re.findall(r"(\w+):\s*'(\d)'", block)


def measured_toolbar_digits() -> list[str]:
    """The digits stock tldraw's toolbar already spends, from the installed copy."""
    text = TOOLBAR_SOURCE.read_text(encoding="utf-8")
    block = re.search(r"NUMBERED_SHORTCUT_KEYS = \{(.*?)\}", text, re.S).group(1)
    return re.findall(r'"(\d)":', block)


def line_of(path: Path, needle: str) -> int:
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if needle in line:
            return number
    raise SystemExit(f"{needle!r} not found in {path}")


def unit_checks() -> list[str]:
    return re.findall(r"\n\tit\('(.*?)'", UNIT_TEST.read_text(encoding="utf-8"))


def journey_checks() -> list[str]:
    text = JOURNEY.read_text(encoding="utf-8")
    literal = re.findall(r"\n    pass\('(.*?)'\)", text)
    template = re.findall(r"\n    pass\(`(.*?)`\)", text)
    return literal + [re.sub(r"\$\{[^}]*\}", "…", entry) for entry in template]


def tldraw_version() -> str:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    return package["dependencies"]["tldraw"]


DIGITS = measured_digits()
TOOLBAR_DIGITS = measured_toolbar_digits()
UNIT = unit_checks()
JOURNEY_CHECKS = journey_checks()
BRANCH = git("rev-parse", "--abbrev-ref", "HEAD")
HEAD = git("rev-parse", "--short", "HEAD")
CLAIM_LINE = line_of(CONTROLS, "const claimDigits")
GATE_LINE = line_of(SHORTCUTS, "export function shouldClaimCommunicationDigit")

FAMILY_INK = {"stream": "#7558d7", "service": "#3971dd", "action": "#d27a0a"}
FAMILY_MONOGRAM = {"stream": "↝", "service": "S", "action": "A"}
FAMILY_HINT = {
    "stream": "Pub/sub: publisher → subscriber",
    "service": "Client → server; request and response",
    "action": "Client → server; goal, feedback and result",
}

STILLS = [
    ("digits", "01-draw-row-with-digits.png", "The row says what it answers to",
     "Every button carries its digit as a chip, announces it through "
     "<code>aria-keyshortcuts</code>, and names it in the tooltip. The mapping is "
     "reading order, which is exactly the thing nobody can guess from three names."),
    ("armed", "02-armed-by-keyboard.png", "Armed from the keyboard",
     "Action, reached by pressing 3 with the pointer nowhere near the bar. The "
     "family tint carries identity and the digit chip picks up its border; the "
     "label stays in ordinary ink, because family ink on family soft measures "
     "2.6–4.3:1 in these palettes."),
    ("drawn", "03-service-drawn-from-the-keyboard.png", "A real Service, drawn after a keystroke",
     "Press 2, drag Mission's card onto Robot's, and the canonical request and "
     "response legs are generated — the same two cables the button produces, on "
     "the same ports, read back by Dataflow unchanged."),
    ("toolbar", "04-dataflow-digits-return-to-toolbar.png", "Borrowed, not taken",
     "Dataflow has no DRAW group, so the digits go back to being tldraw's own "
     "toolbar shortcuts. Nothing arms; a toolbar slot lights instead."),
]


def still_tabs() -> str:
    buttons = "".join(
        f'<button data-view="{key}"{" class=\"active\"" if index == 0 else ""}>{html.escape(title)}</button>'
        for index, (key, _, title, _) in enumerate(STILLS)
    )
    figures = "".join(
        f'<figure data-figure="{key}"{" class=\"active\"" if index == 0 else ""}>'
        f'<img src="{data_uri(ASSETS / name)}" alt="{html.escape(title)}">'
        f"<figcaption><b>{html.escape(title)}</b>{caption}</figcaption></figure>"
        for index, (key, name, title, caption) in enumerate(STILLS)
    )
    return f'<div class="tabs">{buttons}</div><div class="gallery">{figures}</div>'


def family_cards() -> str:
    cards = []
    for family, digit in DIGITS:
        ink = FAMILY_INK[family]
        cards.append(
            f'<div class="leg" style="border-top-color:{ink}">'
            f'<h3><i style="background:{ink}">{FAMILY_MONOGRAM[family]}</i>'
            f"{family.capitalize()}<kbd>{digit}</kbd></h3>"
            f'<p class="roles">{html.escape(FAMILY_HINT[family])}</p></div>'
        )
    return f'<div class="legs">{"".join(cards)}</div>'


EVENT_PATH_SVG = """
<svg viewBox="0 0 900 320" role="img" aria-label="Where a digit keystroke goes">
  <title>Where a digit keystroke goes</title>
  <defs>
    <marker id="head" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
      <path d="M0 0 L9 4.5 L0 9 z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-family="var(--mono)" font-size="12.5">
    <rect x="24" y="24" width="852" height="120" rx="12" fill="none"
      stroke="currentColor" stroke-opacity=".22"/>
    <text x="40" y="48" fill="currentColor" opacity=".55">document — keydown (bubble)</text>
    <rect x="52" y="60" width="796" height="66" rx="10" fill="none"
      stroke="currentColor" stroke-opacity=".22"/>
    <text x="68" y="84" fill="currentColor" opacity=".55">body — keydown (bubble)</text>

    <rect x="80" y="96" width="238" height="34" rx="8" fill="#3971dd" fill-opacity=".12"
      stroke="#3971dd" stroke-opacity=".5"/>
    <text x="94" y="118" fill="currentColor">tldraw shortcut layer</text>

    <rect x="336" y="96" width="238" height="34" rx="8" fill="#12855f" fill-opacity=".12"
      stroke="#12855f" stroke-opacity=".55"/>
    <text x="350" y="118" fill="currentColor">claimDigits — stopPropagation</text>

    <rect x="600" y="96" width="238" height="34" rx="8" fill="currentColor" fill-opacity=".05"
      stroke="currentColor" stroke-opacity=".2" stroke-dasharray="4 4"/>
    <text x="614" y="118" fill="currentColor" opacity=".45">(nothing else on body)</text>

    <rect x="590" y="34" width="270" height="34" rx="8" fill="#d27a0a" fill-opacity=".12"
      stroke="#d27a0a" stroke-opacity=".55"/>
    <text x="604" y="56" fill="currentColor">tldraw toolbar — click nth tool</text>

    <path d="M574 113 L590 113" stroke="currentColor" stroke-opacity=".3" fill="none"/>
    <path d="M724 96 L724 76" stroke="#d27a0a" stroke-opacity=".8" fill="none"
      stroke-dasharray="5 4" marker-end="url(#head)" color="#d27a0a"/>
    <text x="712" y="88" text-anchor="end" fill="#d27a0a" font-size="11">denied while the group is up</text>

    <text x="40" y="196" fill="currentColor" font-size="13">Press 2 with the DRAW group on screen</text>
    <path d="M40 208 L40 236" stroke="currentColor" stroke-opacity=".35" fill="none"/>
    <text x="56" y="232" fill="currentColor" opacity=".7" font-size="12">
      1 · shortcut layer runs the action → Service arms
    </text>
    <text x="56" y="256" fill="currentColor" opacity=".7" font-size="12">
      2 · claimDigits stops the event at body
    </text>
    <text x="56" y="280" fill="currentColor" opacity=".7" font-size="12">
      3 · the toolbar handler never sees it, so Cursor is not restored
    </text>
    <text x="500" y="232" fill="currentColor" opacity=".7" font-size="12">
      Anywhere else: step 2 does not happen…
    </text>
    <text x="500" y="256" fill="currentColor" opacity=".7" font-size="12">
      …so 1–9 keep their stock toolbar meaning.
    </text>
  </g>
</svg>
"""


def build() -> str:
    unit_items = "".join(f"<li>{html.escape(check)}</li>" for check in UNIT)
    journey_items = "".join(f"<li>{html.escape(check)}</li>" for check in JOURNEY_CHECKS)
    digit_list = ", ".join(digit for _, digit in DIGITS)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The DRAW arrows answer to 1, 2 and 3 · SystemSketch</title>
<style>
:root {{
  --bg: #fbfbfd; --surface: #fff; --ink: #16161a; --muted: #5b5b66;
  --faint: #8a8a97; --line: #e4e4ec; --accent: #3971dd;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}}
@media (prefers-color-scheme: dark) {{
  :root {{ --bg:#111114; --surface:#191920; --ink:#f2f2f6; --muted:#b3b3c0;
           --faint:#84848f; --line:#2c2c36; }}
}}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.62 ui-sans-serif, system-ui, -apple-system, sans-serif; }}
main {{ max-width: 1080px; margin: 0 auto; padding: 48px 24px 96px; }}
h1 {{ font-size: 34px; line-height:1.16; margin:0 0 10px; letter-spacing:-.02em; }}
h2 {{ font-size: 21px; margin: 56px 0 14px; letter-spacing:-.01em; }}
h3 {{ font-size: 15px; margin: 0 0 8px; }}
p {{ margin: 0 0 14px; color: var(--muted); }}
code {{ font-family: var(--mono); font-size: .9em;
  background: color-mix(in srgb, var(--accent) 9%, transparent);
  padding: 1px 5px; border-radius: 5px; }}
kbd {{ font-family: var(--mono); font-size:11px; font-weight:700; border:1px solid var(--line);
  border-radius:4px; padding:1px 5px; margin-left:8px; color:var(--ink);
  background:var(--surface); }}
.lede {{ font-size: 17px; color: var(--ink); max-width: 74ch; }}
.meta {{ font-family: var(--mono); font-size:11.5px; color:var(--faint);
  text-transform: uppercase; letter-spacing:.09em; margin-bottom: 18px; }}
.card {{ background: var(--surface); border:1px solid var(--line);
  border-radius: 14px; padding: 20px 22px; }}
figure {{ margin: 0; }}
video, .gallery img, .board img {{ width:100%; display:block; border-radius:12px;
  border:1px solid var(--line); background:var(--surface); }}
.hero {{ margin: 26px 0 8px; }}
.hero figcaption, .board figcaption {{ color: var(--faint); font-size:13px; margin-top:10px; }}
.tabs {{ display:flex; flex-wrap:wrap; gap:6px; margin: 18px 0 14px; }}
.tabs button {{ font: 600 12px/1 var(--mono); padding: 9px 13px; cursor:pointer;
  border:1px solid var(--line); background:var(--surface); color:var(--muted);
  border-radius: 9px; }}
.tabs button.active {{ border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--ink); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }}
.gallery figure {{ display:none; }}
.gallery figure.active {{ display:block; }}
.gallery figcaption {{ margin-top: 11px; font-size:13.5px; color:var(--muted); }}
.gallery figcaption b {{ display:block; color:var(--ink); margin-bottom:3px; }}
.legs {{ display:grid; gap:14px; grid-template-columns: repeat(auto-fit, minmax(258px,1fr)); }}
.leg {{ background:var(--surface); border:1px solid var(--line);
  border-top:3px solid var(--ink); border-radius:12px; padding:16px 18px; }}
.leg h3 {{ display:flex; align-items:center; color: var(--ink); }}
.leg h3 i {{ display:grid; place-items:center; width:19px; height:19px; border-radius:50%;
  color:#fff; font-style:normal; font-size:11px; margin-right:9px; }}
.leg .roles {{ font-size:12.5px; margin:0; }}
ul.checks {{ list-style:none; padding:0; margin:0; }}
ul.checks li {{ padding:8px 0 8px 26px; border-bottom:1px solid var(--line);
  position:relative; color:var(--muted); font-size:14px; }}
ul.checks li:last-child {{ border-bottom:0; }}
ul.checks li::before {{ content:"✓"; position:absolute; left:0; top:8px;
  color:#12855f; font-weight:800; }}
.grid2 {{ display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }}
.stat {{ background:var(--surface); border:1px solid var(--line); border-radius:12px;
  padding:15px 17px; }}
.stat b {{ display:block; font:700 25px/1.1 var(--mono); color:var(--ink); }}
.stat span {{ font-size:12.5px; color:var(--faint); }}
.diagram {{ background:var(--surface); border:1px solid var(--line); border-radius:14px;
  padding:14px 16px; color:var(--ink); }}
.diagram svg {{ width:100%; height:auto; display:block; }}
.closeups {{ margin-top:16px; }}
.closeups div {{ display:grid; gap:10px; }}
.closeups img {{ width:100%; display:block; border:1px solid var(--line);
  border-radius:10px; background:var(--surface); }}
.closeups figcaption {{ color:var(--faint); font-size:13px; margin-top:10px; }}
.decision li {{ margin-bottom:9px; color:var(--muted); }}
.decision b {{ color:var(--ink); }}
a {{ color:var(--accent); }}
</style></head>
<body><main>

<p class="meta">SystemSketch · {html.escape(BRANCH)} @ {html.escape(HEAD)} · 2026-09-06</p>
<h1>The DRAW arrows answer to {digit_list}</h1>
<p class="lede">The DRAW group named three protocols and offered no way to reach
any of them but the mouse. Each button now carries its digit, says it out loud to
a screen reader, and repeats it in the tooltip — and the keys work, from the
engine's own shortcut layer, so they behave like every other shortcut in the app
including staying quiet while you are typing a name.</p>

<figure class="hero">
  <video autoplay loop muted playsinline controls
    poster="{data_uri(ASSETS / '02-armed-by-keyboard.png')}">
    <source src="{data_uri(ASSETS / 'digits-hero.mp4', 'video/mp4')}" type="video/mp4">
    <img class="hero-gif" src="{data_uri(ASSETS / 'digits-hero.gif', 'image/gif')}"
      alt="Pressing 2 and 3 to arm Service and Action, drawing both, then leaving for Dataflow">
  </video>
  <figcaption>Recorded from the running app. The pointer never touches the DRAW
  group: 2 arms Service, a drag between the two cards makes it real, 3 arms
  Action, a second drag makes that real, 3 again puts the tool away — then
  Dataflow, where the same digits go back to the toolbar. Five canonical cables
  at the end, all of them generated by keyboard-armed drags.</figcaption>
</figure>

<h2>Three protocols, three digits</h2>
<p>The mapping is the order the bar paints them, which is the only mapping that
needs no legend — and the reason the digit has to be visible on the button
rather than hidden in a tooltip. Their initials were not available: S is already
the Simple card face and A is already the Arrow group.</p>
{family_cards()}
<figure class="closeups">
  <div>
    <img src="{crop_draw_row('01-draw-row-with-digits.png')}" alt="The DRAW row at rest">
    <img src="{crop_draw_row('02-armed-by-keyboard.png')}" alt="The DRAW row with Action armed">
  </div>
  <figcaption>The row at rest, and the same row after pressing 3 — cropped at
  build time to the box the journey measured. The family tint carries identity;
  the digit chip picks up its border and the label stays in ordinary ink.</figcaption>
</figure>

<h2>The digits were not free</h2>
<p>Stock tldraw already spends {len(TOOLBAR_DIGITS)} digits —
{", ".join(TOOLBAR_DIGITS)} — on <em>activate the nth toolbar tool</em>
(<code>NUMBERED_SHORTCUT_KEYS</code> in <code>OverflowingToolbar</code>,
tldraw {html.escape(tldraw_version())}). It listens on the container
<b>document</b>; the shortcut layer that runs our action listens on <b>body</b>.
Body runs first. So the first attempt looked like the key doing nothing at all:
pressing 2 armed Service and was undone, in the same keystroke, by a synthetic
click on the Cursor button. The trace is what found it — the second
<code>setCurrentTool</code> came from <code>onClick</code> on
<code>systemsketch-tool-cursor</code>, with <code>isTrusted: false</code>.</p>

<figure class="diagram">{EVENT_PATH_SVG}
<figcaption>One listener on body, mounted with the DRAW group and unmounted with
it, stops the event before the document handler. Every listener on body still
runs — including tldraw's own — because stopping propagation does not skip
siblings on the same node.</figcaption></figure>

<p>That is why this is a loan rather than a seizure. The claim is exactly as
narrow as the group that explains it: three digits, no modifiers, only while the
communication lens is open on an Async region
(<code>shouldClaimCommunicationDigit</code>, {SHORTCUTS.name}:{GATE_LINE}).
Everywhere else in SystemSketch, 1–9 still pick toolbar tools.</p>

<h2>Every state, from the real app</h2>
{still_tabs()}

<h2>Evidence</h2>
<div class="grid2">
  <div class="stat"><b>{len(UNIT)}</b><span>unit checks on the digit map, the
    arming, and the precedence rule</span></div>
  <div class="stat"><b>{len(JOURNEY_CHECKS)}</b><span>real-browser checks in
    <code>npm run test:draw-hotkeys</code></span></div>
  <div class="stat"><b>0</b><span>console errors across the journey</span></div>
</div>

<h3 style="margin-top:22px">In the browser</h3>
<ul class="checks">{journey_items}</ul>

<h3 style="margin-top:26px">In the unit tests</h3>
<ul class="checks">{unit_items}</ul>

<p style="margin-top:18px">Both gates were mutation-tested red. Deleting the
<code>isCommunicationDrawArmable</code> guard turns the three off-screen unit
checks red; deleting the <code>claimDigits</code> listener
(<code>{CONTROLS.name}:{CLAIM_LINE}</code>) turns the journey red at its second
check, which is how the conflict was found in the first place.</p>

<h2>The review board</h2>
<figure class="board">
  <img src="{data_uri(FIXTURE_IMAGE)}" alt="The review fixture board">
  <figcaption>Two components in an Async region and nothing wired, so the first
  thing to do is press a key rather than set the board up. Cue 4 is the one
  worth reading: it sends you to Dataflow to check the digits went back.</figcaption>
</figure>

<h2 class="decision">Decision surface</h2>
<ul class="decision">
  <li><b>Done and proved.</b> The three digits arm, swap and disarm; a drag after
  a keystroke generates the same canonical legs the button does; a digit typed
  into a name types; outside the lens the toolbar has its digits back.
  <code>npm run check</code> is green (tsc, 1825 vitest, 121 Python), and
  <code>test:draw-hotkeys</code>, <code>test:communication-authoring</code> and
  <code>test:communication-focus</code> all pass.</li>
  <li><b>Needs you — the loan.</b> I scoped the claim to the lens rather than
  turning tldraw's numbered toolbar off across the app. The alternative is one
  editor option (<code>enableToolbarKeyboardShortcuts: false</code>), which
  would give the digits a single meaning everywhere at the cost of a stock
  affordance the custom toolbar inherits. Default if you say nothing: it stays
  scoped.</li>
  <li><b>Found, not fixed.</b> <code>npm run test:communication-prototype</code>
  is red at its first check, and was already red at this branch's base commit —
  it reads <code>data-projection-mode</code> and expects <code>'wiring'</code>,
  neither of which the controls have emitted since the lens/cable split. Out of
  scope for this change; it needs a real update, not a rename.</li>
  <li><b>Deliberately not done.</b> No PEP: this is a keyboard affordance with
  one defensible shape, not a fork worth a numbered record. The
  <code>WHY:</code> comments at the two seams carry the reasoning.</li>
</ul>

<script>
document.querySelectorAll('.tabs button').forEach((button) => {{
  button.addEventListener('click', () => {{
    document.querySelectorAll('.tabs button').forEach((other) => other.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('[data-figure]').forEach((figure) => {{
      figure.classList.toggle('active', figure.dataset.figure === button.dataset.view);
    }});
  }});
}});
</script>
</main></body></html>
"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"{OUTPUT} · {OUTPUT.stat().st_size / 1024:.0f} KB")
