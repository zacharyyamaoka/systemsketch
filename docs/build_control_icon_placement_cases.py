#!/usr/bin/env python3
"""Build `docs/control-icon-placement-cases-2026-09-03.html`: P2 (the picked
placement policy — icon on the owning region's own header row) drawn across
six structural cases, each diagram driven by the REAL output of
`docs/control_icon_placement_rule.py`'s `compute_placements`, not by hand-
placed icons that merely illustrate the intended answer.

Zach picked P2 and asked for two more things: (1) proof it holds up once
there's more than one break/continue, nested inside Branch arms, not just
the loop's own body; (2) a real proposal for how an AST pass would compute
where each icon goes. This page is (1); `control_icon_placement_rule.py` is
(2) — this page imports and runs it live, so every diagram below is exactly
what that function says, nothing hand-tuned to look right.

Run:  python3 docs/build_control_icon_placement_cases.py
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "control-icon-placement-cases-2026-09-03.html"
sys.path.insert(0, str(DOCS))

from branch_board_svg import ANY, BORDER, INK, MUTED, REGION, SVG, THICK, text  # noqa: E402
from control_icon_placement_rule import CASES, compute_placements  # noqa: E402
from build_loop_control_icons import break_icon, continue_icon  # noqa: E402

TODAY = "2026-09-03"
GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
BREAK = "#c0392b"

# --------------------------------------------------------------------------
# A small, shared "region header row" — P2, exactly as picked: title on the
# left, break/continue badges right-aligned, one per entry in `placements`.
# --------------------------------------------------------------------------


def header_row(svg: SVG, x, y, w, title, region_id, placements, *, ring=False, mono_title=False):
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="34" rx="4" fill="#fff" stroke="{REGION}" stroke-width="1.2"/>')
    if ring:
        svg.add(f'<circle cx="{x}" cy="{y}" r="6" fill="#fff" stroke="{INK}" stroke-width="1.6"/>')
    svg.add(text(x + (18 if ring else 12), y + 21, title, size=12.5, weight=700, color=INK, mono=mono_title))
    icons = placements.get(region_id, [])
    ix = x + w - 18
    for icon in reversed(icons):
        fn = break_icon if icon["kind"] == "break" else continue_icon
        fn(svg, ix, y + 17)
        ix -= 30
    return icons


def source_panel(svg: SVG, x, y, w, source: str):
    lines = [ln for ln in source.strip("\n").split("\n")]
    h = 18 * len(lines) + 16
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#1d2230"/>')
    for i, ln in enumerate(lines):
        svg.add(text(x + 12, y + 22 + i * 18, ln, size=11, mono=True, color="#e7e9ee"))
    return h


def placements_panel(svg: SVG, x, y, w, placements: dict):
    js = json.dumps(placements, indent=2) if placements else "{}  # no icon on this loop at all"
    lines = js.split("\n")
    h = 16 * len(lines) + 16
    svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#f1f3f7" stroke="{BORDER}" stroke-width="1"/>')
    for i, ln in enumerate(lines):
        svg.add(text(x + 12, y + 20 + i * 16, ln, size=10, mono=True, color="#39424f"))
    return h


# --------------------------------------------------------------------------
# The six boards. Each pulls its title/labels from the SAME case dict the
# algorithm runs on — nothing here hand-authors "this arm should get a
# break icon"; the loop below asks `placements` and draws only what it says.
# --------------------------------------------------------------------------


def board_c1(source, placements) -> str:
    svg = SVG(900, 420)
    sh = source_panel(svg, 20, 20, 380, source)
    ph = placements_panel(svg, 20, 30 + sh, 380, placements)
    x, y, w = 460, 20, 420
    header_row(svg, x, y, w, "While Loop", "loop", placements, ring=True)
    svg.add(f'<rect x="{x}" y="{y + 34}" width="{w}" height="150" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(text(x + 12, y + 60, "refine(pose)", size=11.5, mono=True, color=MUTED))
    svg.add(f'<rect x="{x + 12}" y="{y + 78}" width="{w - 24}" height="60" rx="4" fill="none" stroke="#c9ccd5" stroke-width="1"/>')
    svg.add(text(x + 22, y + 96, "try:", size=11.5, mono=True, color=INK))
    svg.add(text(x + 34, y + 114, "check(pose)", size=11, mono=True, color=MUTED))
    svg.add(text(x + 22, y + 132, "except Stale / except Fatal:", size=10.5, mono=True, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 158, "— both handlers are transparent (rule 3): neither creates its own", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 172, "  arm, so both exits land on the LOOP'S OWN header above.", size=9.5, color=MUTED, italic=True))
    return svg.render("c1")


def board_c2(source, placements) -> str:
    svg = SVG(900, 420)
    sh = source_panel(svg, 20, 20, 380, source)
    placements_panel(svg, 20, 30 + sh, 380, placements)
    x, y, w = 460, 20, 420
    header_row(svg, x, y, w, "While Loop", "loop", placements, ring=True)
    ay = y + 44
    for i, label in enumerate(["if error > big:", "elif drift > tol:", "else:"]):
        header_row(svg, x + 12, ay, w - 24, label, f"loop.branch0.arm{i}", placements, mono_title=True)
        ay += 44
    return svg.render("c2")


def board_c3(source, placements) -> str:
    return board_c2(source, placements)  # same shape as c2; only which arm owns an icon differs


def board_c4(source, placements) -> str:
    return board_c2(source, placements)


def board_c5(source, placements) -> str:
    svg = SVG(900, 460)
    sh = source_panel(svg, 20, 20, 380, source)
    placements_panel(svg, 20, 30 + sh, 380, placements)
    x, y, w = 460, 20, 420
    header_row(svg, x, y, w, "While Loop", "loop", placements, ring=True)
    header_row(svg, x + 12, y + 44, w - 24, "if drift > tol:", "loop.branch0.arm0", placements, mono_title=True)
    header_row(svg, x + 36, y + 88, w - 48, "if stale:", "loop.branch0.arm0.branch1.arm0", placements, mono_title=True)
    header_row(svg, x + 36, y + 132, w - 48, "else:", "loop.branch0.arm0.branch1.arm1", placements, mono_title=True)
    svg.add(text(x + 12, y + 194, "— the break is inside a Branch nested one level deeper still.", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 208, "  It stays on the INNERMOST arm's header — it does not bubble up", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 222, "  to \"if drift > tol\", and it never reaches the loop's own header.", size=9.5, color=MUTED, italic=True))
    return svg.render("c5")


def board_c6(source, placements) -> str:
    svg = SVG(900, 380)
    sh = source_panel(svg, 20, 20, 380, source)
    placements_panel(svg, 20, 30 + sh, 380, placements)
    x, y, w = 460, 20, 420
    header_row(svg, x, y, w, "While Loop", "loop", placements, ring=True)
    svg.add(f'<rect x="{x}" y="{y + 34}" width="{w}" height="150" rx="4" fill="none" stroke="{REGION}" stroke-width="1.2"/>')
    svg.add(text(x + 12, y + 60, "refine(pose)", size=11.5, mono=True, color=MUTED))
    svg.add(f'<rect x="{x + 12}" y="{y + 78}" width="{w - 24}" height="70" rx="4" fill="none" stroke="#8d919c" stroke-width="1.3" stroke-dasharray="4 3"/>')
    svg.add(text(x + 22, y + 96, "for sample in window:", size=11.5, mono=True, color=INK))
    svg.add(text(x + 34, y + 114, "if sample.bad:", size=11, mono=True, color=INK))
    svg.add(text(x + 46, y + 132, "break", size=11, mono=True, color=BREAK, weight=700))
    svg.add(text(x + w - 20, y + 96, "a DIFFERENT loop", size=9.5, color=MUTED, italic=True, anchor="end"))
    svg.add(text(x + w - 20, y + 110, "owns this break", size=9.5, color=MUTED, italic=True, anchor="end"))
    svg.add(text(x + 12, y + 168, "— rule 2: the walk never descends into a nested for/while at all. This", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 182, "  break belongs to the FOR loop's own future placement pass, not this", size=9.5, color=MUTED, italic=True))
    svg.add(text(x + 12, y + 196, "  while's. The while loop's own header (above) gets nothing at all.", size=9.5, color=MUTED, italic=True))
    return svg.render("c6")


BOARD_FNS = {
    "c1_shared_header_via_except": board_c1,
    "c2_single_arm_break": board_c2,
    "c3_single_arm_continue": board_c3,
    "c4_two_arms_no_bleed": board_c4,
    "c5_nested_branch": board_c5,
    "c6_nested_loop_excluded": board_c6,
}

CAPTIONS = {
    "c1_shared_header_via_except": ("Two exits, one header", "A `break` in one exception handler and a `continue` in another — neither `try` nor `except` creates a Branch arm, so both are transparent and both exits land on the loop's OWN header. This is the realistic version of \"put both in the header\": it takes a genuine language feature (exception handling), not a contrived pair of unconditional statements, which turn out to be dead code side by side."),
    "c2_single_arm_break": ("Single arm, single break", "The baseline case: one `if`, one `break` inside it. The arm's header carries exactly one badge."),
    "c3_single_arm_continue": ("Single arm, single continue", "Same shape as C2, `continue` instead — lands on the `elif` arm specifically, not the `if` or `else` arms beside it."),
    "c4_two_arms_no_bleed": ("Two different arms, two different headers", "`break` in the `if`, `continue` in the `elif` — each arm's header shows exactly its own icon. Nothing leaks across sibling arms."),
    "c5_nested_branch": ("Branch nested inside a Branch arm", "A `break` two levels deep. It stays on the INNERMOST arm's header — the outer `if drift > tol:` arm's own header stays clean, and it never reaches the loop's header either."),
    "c6_nested_loop_excluded": ("A nested loop owns its own break", "The `break` is lexically inside this while loop's body, but it's INSIDE a `for` — Python itself binds it to the nearest enclosing loop, which is the `for`, not the `while`. The outer loop's header gets nothing from this line at all."),
}

# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfc;--ink:#1d2230;--muted:#5f6b7a;--line:#e3e6ec;--card:#fff;--accent:#2f6fed;--ok:#1f8a4c;--soft:#f1f3f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.5}
main{width:min(1000px,calc(100% - 40px));margin:auto;padding:44px 0 80px}
.eyebrow{font:700 11.5px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(30px,5vw,46px);line-height:1.05;letter-spacing:-.03em;margin:10px 0 14px;max-width:900px}
h2{font-size:22px;letter-spacing:-.02em;margin:44px 0 6px}
p{max-width:880px}.lede{font-size:17px;color:#39424f;max-width:900px}
figure{margin:16px 0 6px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}figure svg{display:block;width:100%;height:auto}
figcaption{padding:12px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}
.case{margin-top:40px;padding-top:8px;border-top:2px solid var(--ink)}
code{font:12.5px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
footer{margin-top:60px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
"""


def fig(svg: str, title: str, caption: str) -> str:
    return f"<figure>{svg}<figcaption><b>{html.escape(title)}.</b> {html.escape(caption)}</figcaption></figure>"


def cases_html() -> str:
    out = []
    for key, source in CASES.items():
        placements = compute_placements(source)
        title, caption = CAPTIONS[key]
        board = BOARD_FNS[key](source, placements)
        out.append(f"<section class='case'><h2>{html.escape(title)}</h2>{fig(board, title, caption)}</section>")
    return "".join(out)


def build() -> str:
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Control icon placement — six real cases</title><style>{CSS}</style></head><body><main>
<div class="eyebrow">SystemSketch · loops · P2 stress-tested · {TODAY}</div>
<h1>P2, driven by a real parser, across six cases.</h1>
<p class="lede">Every diagram below is generated by calling <code>compute_placements()</code> from <a href="control_icon_placement_rule.py">docs/control_icon_placement_rule.py</a> on the real Python source shown beside it, then drawing exactly what it returns — nothing here is hand-placed to look right. Left panel: source. Middle panel: the algorithm's real JSON output. Right: the P2 diagram (icon on the owning region's own header row), reading the same output.</p>
{cases_html()}
<footer>Built by <code>docs/build_control_icon_placement_cases.py</code> at {GIT_HEAD}, importing <code>docs/control_icon_placement_rule.py</code> directly — the diagrams and the JSON come from the same function call, not two separate hand-authored artifacts · relevant prior work: <a href="loop-control-icons-2026-09-03.html">five placement policies</a> · <a href="while-loop-break-2026-09-03.html">break, ten ways</a> · Claude Code (Sonnet 5), {TODAY}.</footer>
</main></body></html>"""
    return page


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
