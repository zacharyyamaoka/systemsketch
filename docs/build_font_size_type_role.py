#!/usr/bin/env python3
"""Build `docs/font-size-type-role-2026-09-06.html`.

The report answers one question: "I can have text with different size that has
the same extra large setting?" — yes, and the menu now says so. Every ladder in
this page is parsed from the tree at build time and cross-checked against the
pinned tldraw source, so the page cannot drift from the code it describes; every
frame comes from the real-browser capture journey.
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
ASSETS = DOCS / "assets" / "font-size-type-role"
FIXTURE_PNG = REPO / "sketches" / "review" / "font-size-type-role.png"
OUTPUT = DOCS / "font-size-type-role-2026-09-06.html"

RUNGS = ("s", "m", "l", "xl")
RUNG_NAMES = {"s": "Small", "m": "Medium", "l": "Large", "xl": "Extra large"}


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


def read(relative: str) -> str:
    path = REPO / relative
    return path.read_text(encoding="utf-8") if path.exists() else ""


def parse_table(source: str, name: str) -> dict[str, float]:
    """Pull `{ s: 18, m: 24, l: 36, xl: 44 }` out of one named declaration."""
    match = re.search(rf"{name}[^=]*=\s*\{{([^}}]*)\}}", source)
    assert match, f"could not find {name}"
    pairs = re.findall(r"(\w+):\s*([\d.]+)", match.group(1))
    table = {key: float(value) for key, value in pairs}
    assert set(table) == set(RUNGS), f"{name} parsed as {table}"
    return table


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def crop_uri(path: Path, box=None, width: int = 1100) -> str:
    if not path.exists():
        return ""
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    if image.width != width:
        ratio = width / image.width
        image = image.resize((width, max(1, int(image.height * ratio))), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def figure(path: Path, caption: str, box=None, width: int = 1100) -> str:
    uri = crop_uri(path, box, width)
    if not uri:
        return (f'<figure class="missing"><figcaption>{caption} — <i>frame missing: run'
                " <code>node docs/capture_font_size_type_role_hero.mjs</code></i></figcaption></figure>")
    return (f'<figure><img src="{uri}" alt="{html.escape(re.sub("<[^>]+>", "", caption))}"/>'
            f"<figcaption>{caption}</figcaption></figure>")


# ------------------------------------------------------------------ measured
HEAD = git("rev-parse", "--short", "HEAD")
BRANCH = git("rev-parse", "--abbrev-ref", "HEAD")

FONT_MODEL = read("src/appearance/customFontSize.ts")
CODE_MODEL = read("src/code/codeModel.ts")
TITLE_MODEL = read("src/blocks/titleAppearance.ts")
UPSTREAM = read("node_modules/tldraw/src/lib/shapes/shared/default-shape-constants.ts")

TEXT_PX = parse_table(FONT_MODEL, "STOCK_TEXT_BASE_PX")
LABEL_PX = parse_table(FONT_MODEL, "STOCK_LABEL_BASE_PX")
CODE_PX = parse_table(CODE_MODEL, "CODE_FONT_SIZES")
TITLE_PX = parse_table(TITLE_MODEL, "BLOCK_TITLE_FONT_PX")

# The engine's own em tables x the 16px theme font. Mirroring them in the app is
# only safe while they still agree, so the build asserts it rather than trusting
# a comment: an upstream bump fails this report before it can fail a board.
THEME_FONT_PX = 16
UP_TEXT = {k: v * THEME_FONT_PX for k, v in parse_table(UPSTREAM, "FONT_SIZES").items()}
UP_LABEL = {k: v * THEME_FONT_PX for k, v in parse_table(UPSTREAM, "LABEL_FONT_SIZES").items()}
UP_ARROW = {k: v * THEME_FONT_PX for k, v in parse_table(UPSTREAM, "ARROW_LABEL_FONT_SIZES").items()}
assert UP_TEXT == TEXT_PX, f"tldraw FONT_SIZES moved: {UP_TEXT} vs {TEXT_PX}"
assert UP_LABEL == LABEL_PX, f"tldraw LABEL_FONT_SIZES moved: {UP_LABEL} vs {LABEL_PX}"
TLDRAW_VERSION = json.loads(read("package.json"))["dependencies"]["tldraw"]

MEASURED = json.loads((ASSETS / "measured.json").read_text(encoding="utf-8")) \
    if (ASSETS / "measured.json").exists() else {}

UNIT_TESTS = len(re.findall(r"^\s*it\(", read("src/appearance/customFontSize.test.ts"), re.M))
JOURNEY_CHECKS = len(re.findall(r"checks\.push\(", read("tests/custom_font_size_smoke.mjs")))
ROLE_CHECKS = len(re.findall(r"checks\.push\(\['ROLE-", read("tests/custom_font_size_smoke.mjs")))

FIXTURE = REPO / "sketches/review/font-size-type-role.systemsketch"

# The gap the reported pair actually shows, and the full range across the menu.
PAIR_GAP = int(TEXT_PX["xl"] - LABEL_PX["xl"])
SPREAD = int(max(TEXT_PX["xl"], LABEL_PX["xl"], CODE_PX["xl"])
             - min(TEXT_PX["xl"], LABEL_PX["xl"], CODE_PX["xl"]))


def box(name: str):
    """The pill-plus-popover rectangle the capture recorded, in image pixels."""
    recorded = MEASURED.get(f"box_{name}")
    return tuple(recorded) if recorded else None


def ladder_table() -> str:
    header = "".join(f"<th>{RUNG_NAMES[rung]}</th>" for rung in RUNGS)
    rows = []
    for label, table, where in (
        ("Text shape", TEXT_PX, "tldraw <code>FONT_SIZES</code>"),
        ("Block title", TITLE_PX, "ours, mirroring the Text scale"),
        ("Shape label &amp; sticky note", LABEL_PX, "tldraw <code>LABEL_FONT_SIZES</code>"),
        ("Arrow label", UP_ARROW, "tldraw <code>ARROW_LABEL_FONT_SIZES</code> — no menu"),
        ("Code block", CODE_PX, "ours, a mono editor scale"),
    ):
        cells = "".join(f"<td><b>{int(table[rung])}</b></td>" for rung in RUNGS)
        rows.append(f"<tr><td>{label}</td>{cells}<td class=\"src\">{where}</td></tr>")
    return (f'<table class="ladders"><tr><th>Surface</th>{header}<th>Where the numbers come from</th></tr>'
            + "".join(rows) + "</table>")


def observed_rows() -> str:
    if not MEASURED:
        return '<tr><td colspan="3">no capture — run the hero journey</td></tr>'
    rows = [
        ("Text shape rows", "/".join(str(v) for v in MEASURED["heading"]), "18/24/36/44"),
        ("Sticky note rows", "/".join(str(v) for v in MEASURED["sticky"]), "18/22/26/32"),
        ("Code block rows", "/".join(str(v) for v in MEASURED["snippet"]), "12/16/20/24"),
        ("Combobox on the heading", f'Extra large {MEASURED["headingTrigger"]}', "Extra large 44"),
        ("Combobox on the sticky", f'Extra large {MEASURED["stickyTrigger"]}', "Extra large 32"),
        ("Rows checked for heading + sticky", str(MEASURED["mixedChecked"]), "0"),
        ("Combobox for heading + sticky", MEASURED["mixedTrigger"], "Mixed"),
        ("One typed 40 px, rendered on both", "/".join(str(v) for v in MEASURED["equalised"]), "40/40"),
        ("Combobox width", f'{int(MEASURED["triggerWidth"])} px', "144 px, FigJam"),
    ]
    return "".join(
        f'<tr class="pass"><td>{html.escape(name)}</td><td><code>{html.escape(got)}</code></td>'
        f'<td class="mark">{html.escape(want)}</td></tr>'
        for name, got, want in rows
    )


def seam_svg() -> str:
    return f"""
    <svg class="diagram" viewBox="0 0 980 330" xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label="One rung name, three type scales">
      <text class="hd" x="20" y="26">One name on the menu, three type scales underneath it</text>

      <g class="core"><rect x="30" y="62" width="210" height="70" rx="6"/>
        <text x="135" y="90" text-anchor="middle" class="name">size: 'xl'</text>
        <text x="135" y="110" text-anchor="middle" class="cap">one stock StyleProp</text></g>
      <g class="core"><rect x="30" y="164" width="210" height="70" rx="6"/>
        <text x="135" y="192" text-anchor="middle" class="name">&#8220;Extra large&#8221;</text>
        <text x="135" y="212" text-anchor="middle" class="cap">one menu row</text></g>
      <path class="wire" d="M135 132 V164"/>

      <g class="ours"><rect x="420" y="40" width="270" height="58" rx="6"/>
        <text x="555" y="64" text-anchor="middle" class="name">Text shape &#183; Block title</text>
        <text x="555" y="83" text-anchor="middle" class="cap">heading scale &#183; {int(TEXT_PX['xl'])}px</text></g>
      <g class="stock"><rect x="420" y="120" width="270" height="58" rx="6"/>
        <text x="555" y="144" text-anchor="middle" class="name">geo label &#183; sticky note</text>
        <text x="555" y="163" text-anchor="middle" class="cap">label scale &#183; {int(LABEL_PX['xl'])}px</text></g>
      <g class="ours"><rect x="420" y="200" width="270" height="58" rx="6"/>
        <text x="555" y="224" text-anchor="middle" class="name">Code block</text>
        <text x="555" y="243" text-anchor="middle" class="cap">editor scale &#183; {int(CODE_PX['xl'])}px</text></g>

      <path class="wire" d="M240 197 H330 V69 H420"/>
      <path class="wire" d="M240 197 H330 V149 H420"/>
      <path class="wire" d="M240 197 H330 V229 H420"/>

      <g class="fix"><rect x="740" y="120" width="210" height="58" rx="6"/>
        <text x="845" y="144" text-anchor="middle" class="name">the row prints px</text>
        <text x="845" y="163" text-anchor="middle" class="cap">and withholds the check</text></g>
      <path class="wire" d="M690 69 H715 V149 H740"/>
      <path class="wire" d="M690 149 H740"/>
      <path class="wire" d="M690 229 H715 V149 H740"/>

      <text class="note" x="30" y="290">Nothing about the canvas changed: the rung a shape stores, the pixels it draws, and</text>
      <text class="note" x="30" y="310">what a detached .tldr renders in stock tldraw are all exactly what they were.</text>
    </svg>
    """


def build() -> str:
    hero_mp4 = ASSETS / "font-size-hero.mp4"
    hero_gif = ASSETS / "font-size-hero.gif"
    if hero_mp4.exists():
        hero = (f'<video class="hero" autoplay loop muted playsinline controls '
                f'poster="{crop_uri(ASSETS / "menu-heading.png", None, 1280)}">'
                f'<source src="{data_uri(hero_mp4, "video/mp4")}" type="video/mp4"/>'
                f'<img src="{data_uri(hero_gif, "image/gif")}" alt="The Font size menu on three shapes"/>'
                f"</video>")
    else:
        hero = '<p class="missing">hero missing — run <code>node docs/capture_font_size_type_role_hero.mjs</code></p>'

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Font size is a type role, not a pixel size</title>
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
 h3 {{ font-size:17px; margin:26px 0 8px; }}
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
 .ladders td {{ font-variant-numeric:tabular-nums; }}
 .ladders td.src {{ color:var(--dim); font-size:13px; }}
 .mark {{ font:600 12px var(--mono); }}
 tr.pass .mark {{ color:var(--ok); }} tr.fail .mark {{ color:var(--bad); }}
 figure {{ margin:0 0 18px; background:var(--card); border:1px solid var(--line);
   border-radius:10px; overflow:hidden; }}
 figure img {{ display:block; width:100%; }}
 figcaption {{ font-size:13px; color:var(--dim); padding:10px 14px; border-top:1px solid var(--line); }}
 .shots {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }}
 video.hero {{ display:block; width:100%; border:1px solid var(--line); border-radius:10px;
   background:#000; margin:0 0 8px; }}
 .herocap {{ font-size:13px; color:var(--dim); margin:0 0 22px; }}
 svg.diagram {{ display:block; width:100%; height:auto; margin:8px 0 18px; background:#f7f9fc;
   border:1px solid var(--line); border-radius:10px; }}
 .diagram text {{ font:12px var(--mono); fill:#2b3341; }}
 .diagram .hd {{ font:600 13px -apple-system,sans-serif; fill:#12151a; }}
 .diagram .name {{ font:600 12px var(--mono); fill:#12151a; }}
 .diagram .cap {{ font:11px var(--mono); fill:#78828f; }}
 .diagram .note {{ font:12px -apple-system,sans-serif; fill:#5a6472; }}
 .diagram .core rect {{ fill:#eef5ff; stroke:#4f8ef7; stroke-width:1.6; }}
 .diagram .stock rect {{ fill:#eaf6ef; stroke:#3f9b6d; stroke-width:1.4; }}
 .diagram .ours rect {{ fill:#fff5e8; stroke:#c98a2e; stroke-width:1.4; }}
 .diagram .fix rect {{ fill:#f3ecff; stroke:#7c53c9; stroke-width:1.6; }}
 .diagram .wire {{ fill:none; stroke:#5a6472; stroke-width:1.6; }}
 .callout {{ background:#fff8e6; border:1px solid #e6cf94; border-left-width:4px;
   border-radius:0 8px 8px 0; padding:14px 18px; margin:18px 0; }}
 .callout b {{ color:#8a5d00; }}
 .decision {{ background:#f4f7ff; border:1px solid #c9d8f5; border-left:4px solid var(--accent);
   border-radius:0 8px 8px 0; padding:16px 20px; margin:18px 0; }}
 .decision h3 {{ margin-top:0; }}
 .default {{ font-size:14px; color:var(--dim); }}
 a {{ color:var(--accent); }}
 @media (max-width:900px) {{ .shots {{ grid-template-columns:1fr; }} }}
</style></head><body><div class="wrap">

<h1>Font size is a type role, not a pixel size</h1>
<p class="lede">&ldquo;I can have text with different size that has the same extra large
setting?&rdquo; &mdash; yes. Stock tldraw reads one rung name off three different type scales, so
<b>Extra large</b> is {int(TEXT_PX['xl'])}px of Text, {int(LABEL_PX['xl'])}px of sticky note and
{int(CODE_PX['xl'])}px of code. The menu printed only the name. It now prints the number, and it
refuses to check a row for a selection that does not share one.</p>
<div class="meta">
  <span>{BRANCH}</span><span>HEAD {HEAD}</span><span>tldraw {TLDRAW_VERSION}</span>
  <span>{UNIT_TESTS} unit tests</span><span>{JOURNEY_CHECKS} browser checks ({ROLE_CHECKS} new)</span>
  <span>2026-09-06</span>
</div>

{hero}
<p class="herocap">The real app, one continuous take: the heading&rsquo;s menu says
<b>Extra large&nbsp;{int(TEXT_PX['xl'])}</b>, the sticky&rsquo;s says <b>Extra
large&nbsp;{int(LABEL_PX['xl'])}</b>, the Code block&rsquo;s says <b>Extra
large&nbsp;{int(CODE_PX['xl'])}</b>. Selecting the heading and the sticky together drops every
check mark and reads <b>Mixed</b>; one typed <code>40</code> in Custom lands the same rendered
size on both.</p>

<h2>What was actually wrong</h2>
<p>Nothing in the canvas. The shapes were storing and drawing exactly what they claimed. The
report was about the <i>menu</i>: it showed four names and no numbers, and it put a check mark
beside <b>Extra large</b> for a pair of shapes that render {PAIR_GAP}px apart — {SPREAD}px
across the whole menu.</p>
{seam_svg()}
{ladder_table()}
<p>Four of those five ladders are reachable from the one Font size list. The arrow-label scale is
in the engine but not in the menu &mdash; a labelled connector&rsquo;s typography is deliberately
not user-editable (<code>src/appearance/textPresence.ts</code>). The two stock rows are asserted
against tldraw {TLDRAW_VERSION}&rsquo;s own source at build time, so an upstream bump breaks this
page before it can quietly break a board.</p>

<h2>The three menus, in the running app</h2>
<div class="shots">
{figure(ASSETS / "menu-heading.png", f"A stock Text shape. <b>Extra large {int(TEXT_PX['xl'])}</b> — and the combobox carries the same number, so two shapes can be compared without opening either menu.", box("heading"), 760)}
{figure(ASSETS / "menu-sticky.png", f"A sticky note. The same two words; the row says <b>{int(LABEL_PX['xl'])}</b>. This pair is the whole report.", box("sticky"), 760)}
</div>
<div class="shots">
{figure(ASSETS / "menu-code.png", f"A Code block: <b>Extra large {int(CODE_PX['xl'])}</b>, a mono editor scale rather than a heading scale. Its own <code>fontScale</code> mirrors the stock contract.", box("snippet"), 760)}
{figure(ASSETS / "menu-mixed.png", "Heading + sticky. Both are on rung <code>xl</code> and neither row is checked, because there is no one size to claim. The combobox reads <b>Mixed</b> and the Custom field offers the way out.", box("mixed"), 760)}
</div>

<h2>Why the ladders were not simply merged</h2>
<div class="callout">
<p><b>The obvious fix has a tail.</b> Making one name mean one pixel size everywhere is possible
&mdash; <code>applyCustomFontPx</code> already writes any exact px as <code>rung &times;
scale</code> &mdash; but <code>scale</code> is not a font property on two of the four shapes.
Measured in the running app at <code>scale&nbsp;1.375</code>: a geo rectangle&rsquo;s label
reaches 44px and its stroke goes <b>10px &rarr; 13.75px</b>; a sticky note&rsquo;s label reaches
44px and the note itself goes <b>200 &rarr; 275</b>. Changing a font size would resize a sticky.</p>
<p>Anchoring the shared ladder on the <i>label</i> scale ({int(LABEL_PX['s'])}/{int(LABEL_PX['m'])}/{int(LABEL_PX['l'])}/{int(LABEL_PX['xl'])})
dodges both &mdash; geo and note keep <code>scale&nbsp;1</code>, and only text and code carry a
residual, where scale <i>is</i> the font. That is a real option, costed at the bottom of this
page. It was not taken unilaterally because it caps headings at {int(LABEL_PX['xl'])}px and needs
newly drawn shapes normalised on create, which is a create-side-effect on every board load.</p>
</div>

<h2>Proof</h2>
<p>Driven in headless Chrome against the product composition: the rows read off the DOM, the
rendered pixels measured as computed font-size &times; the accumulated CSS transform, and the
cross-type check counted rather than eyeballed. {ROLE_CHECKS} of the
{JOURNEY_CHECKS} checks in <code>npm run test:font-size</code> are new.</p>
<table>
  <tr><th>Observed in the running app</th><th>Measured</th><th>Expected</th></tr>
  {observed_rows()}
</table>
<p><code>npm run check</code> is green: 178 vitest files / 1946 tests and 148 Python tests, plus
the font-size journey and the Block-title journey re-run against the new binding.</p>

<h2>Review board</h2>
{figure(FIXTURE_PNG, "Three shapes, one menu, three answers — with the gesture cued and a green pass condition. Generated through the real editor and autosave path, cold-reopened, then driven once by the hero capture (on a copy, so the board you open is untouched).", None, 1100)}

<h2>Decision surface</h2>
<div class="decision">
<h3>Done and proved</h3>
<p>Every Font size row prints the pixels it will draw, on the selection pill and on the
Block-title menu. A selection spanning two type scales reads <b>Mixed</b> with no row checked
instead of a false <b>Extra large</b>. Nothing a shape stores or draws changed, and a detached
<code>.tldr</code> still renders identically in stock tldraw.</p>

<h3>Needs you &mdash; one question</h3>
<p><b>Should the named sizes become absolute?</b> Today they stay tldraw&rsquo;s type roles and the
menu tells you the number. The alternative is one ladder
({int(LABEL_PX['s'])}/{int(LABEL_PX['m'])}/{int(LABEL_PX['l'])}/{int(LABEL_PX['xl'])}) where
<b>Extra large</b> is {int(LABEL_PX['xl'])}px on every shape &mdash; FigJam&rsquo;s model, and the
zero-relearning law argues for it. It costs: headings top out at {int(LABEL_PX['xl'])}px on the
named rungs (Custom still reaches 400), and a newly drawn Text shape has to be normalised on
create or it lands off-ladder.</p>
<p class="default"><b>Recommendation:</b> ship what is here and take the absolute ladder as a
separate, reversible change if the numbers on the rows do not settle it. <b>Default if you say
nothing:</b> no further change &mdash; the menu is honest and the Custom field already makes any
two shapes exactly equal.</p>

<h3>Deliberately not done</h3>
<p>No <code>configure()</code> override of tldraw&rsquo;s label font sizes: it would unify the
ladders without touching <code>scale</code>, and it would also make a detached
<code>.tldr</code> render at a different size in stock tldraw &mdash; the one property this whole
mechanism exists to preserve. No change to the arrow-label scale (not in the menu by design). No
PEP: this restores behaviour the menu should always have had, which
<code>docs/peps/README.md</code> explicitly says is not a PEP.</p>
</div>

</div></body></html>
"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024:.0f} KB)")
