#!/usr/bin/env python3
"""Build `docs/effect-spec-conformance-2026-09-03.html`: the spec, and what meets it.

Every row is one thing Zach decided during 2026-09-02/03, quoted in his own
words, against the code and the proof that satisfies it — or an honest "no".

The numbers are counted from the tree at build time, so a row cannot go on
claiming a test that was deleted.
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
OUTPUT = DOCS / "effect-spec-conformance-2026-09-03.html"

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()


def exists(path: str) -> bool:
    return (REPO / path).exists()


def unit_cases(path: str) -> int:
    file = REPO / path
    if not file.exists():
        return 0
    return len(re.findall(r"^\s*it\(", file.read_text(encoding="utf-8"), re.M))


def journey_checks(path: str) -> list[str]:
    file = REPO / path
    if not file.exists():
        return []
    return re.findall(r"add\(\s*'((?:EP|FOLLOW)-[^']*)'", file.read_text(encoding="utf-8"))


def contains(path: str, needle: str) -> bool:
    file = REPO / path
    return file.exists() and needle in file.read_text(encoding="utf-8")


UNITS = {
    "effect ports (model + layout)": "src/blocks/effectPorts.test.ts",
    "the tether": "src/blocks/effectTether.test.ts",
    "boundary crossing (geometry)": "src/blocks/elbow/boundaryCrossing.test.ts",
    "effect cable + exit lint": "src/blocks/connections/effectCable.test.ts",
    "the follow rule": "src/blocks/connections/effectPortFollow.test.ts",
}
EP = journey_checks("tests/effect_ports_smoke.mjs")
FOLLOW = journey_checks("tests/effect_port_follow_smoke.mjs")
TOTAL_UNITS = sum(unit_cases(p) for p in UNITS.values())

MET, PARTIAL, NOT = "met", "partial", "not met"

# (Zach's words, what it means, verdict, the evidence)
SPEC = [
    ("I kinda like the idea though of graphically showing the side effect. It sticks out like a sore thumb which I kinda like",
     "A mutation is drawn, not hidden. Refusing to render an impure call was the first instinct and the worst option.",
     MET,
     "An argument marked <code>mutates</code> grows a hook on its input and an effect port on the block's top edge. "
     f"Driven end to end in the browser: <b>{len(EP)}</b> checks in <code>tests/effect_ports_smoke.mjs</code>."),

    ("list.append(self, object: _T, /) -> None is the correct signature. the only way for the data to flow is via mutation!!!",
     "There is no return channel, so the effect is the only way out — not a second drawing of a data edge.",
     MET,
     "A mutating call is given <b>no right-hand port</b>; the effect port is the only source. "
     "<code>effectCable.ts</code> derives the cable's look from that port, so the fact lives in one place. "
     "The <code>pop</code> family — which returns a value <i>and</i> mutates — keeps both, asserted in "
     "<code>effectPorts.test.ts</code>."),

    ("for side effect ... the wire though actually feels much clearer / it should be an elbow joint",
     "Right-angle routing, not a curve.",
     MET,
     "Every tether segment is axis-aligned, asserted in the unit test and again from the rendered "
     "<code>&lt;path d&gt;</code> in the browser (<code>EP-6c</code>)."),

    ("It would just be render only. you couldn't click it so it wouldn't interrupt with any of the interactions with the block",
     "The tether takes no pointer events.",
     MET,
     "<code>pointer-events: none</code> on the whole layer, not just the path. The browser check reads the "
     "<i>computed</i> style rather than trusting the stylesheet (<code>EP-6c</code>)."),

    ("it should be hidden in expanded view just showing on the port view",
     "Port view only.",
     MET,
     "<code>effectTethers()</code> returns nothing for <code>expanded</code>, <code>simple</code> and "
     "<code>value</code> — asserted per view — and the journey checks the tether disappears when the argument "
     "is unmarked (<code>EP-13b</code>)."),

    ("its not certain that they won't cross as you don't control the output port location ... but thats fine if they cross",
     "Crossings are allowed, not prevented.",
     MET,
     "A unit test swaps two ports past each other and asserts the routes swap over rather than being "
     "straightened. The review board seeds <code>swap()</code> with its ports deliberately reversed."),

    ("each edge means one thing — top is the only one left",
     "Left values in, right named values out, bottom the loop lane, top effects.",
     MET,
     "Effect outputs are pulled out of the right-hand lane <i>before</i> the body is planned, so they take no "
     "row slot and nothing below them moves — asserted by comparing a marked block against an unmarked one."),

    ("a cable off a top-edge port should leave perpendicular",
     "Out of the top first, then turn.",
     MET,
     "The router used to hardcode <code>side: 'right'</code> for every terminal. It is now told the port's real "
     "edge. The journey parses the rendered path and requires the first run to be vertical over ≥8px "
     "(<code>EP-9b</code>)."),

    ("the positioning of the mutating port ... perhaps it can just appear wherever we end up drawing the mutating arrow? you see where it intersects the boundary and drag the port there",
     "The port's position is derived from the drawing, not from a slot.",
     PARTIAL,
     "The rule and its geometry are written and tested — <code>effectPortFollow</code> (9 cases) on top of "
     "<code>boundaryCrossing</code> (13 cases) — and it is installed as an editor side effect. <b>But it cannot "
     "fire.</b> See the finding below: this app refuses a cable between two scopes, so no cable ever crosses a "
     "frame edge to be measured. Position today comes from the spread default and from dragging."),

    ("please make it a general purpose one so that it can be reused for other groups, etc.",
     "The crossing algorithm must not be about mutations.",
     MET,
     "<code>src/blocks/elbow/boundaryCrossing.ts</code> takes a rectangle and a polyline and reports side, "
     "point, segment, t and arc length; <code>firstExitPerBox</code> does a nested stack in one pass. It sits "
     "with the pure routing geometry, imports nothing from the app, and names a group boundary port, a region "
     "tunnel entry and a clip marker as equal callers."),

    ("What happens if you have like multiple ports that are being mutated. how can you tell them apart?",
     "Two mutated arguments must be distinguishable.",
     PARTIAL,
     "The collision is fixed — ports used to be born at 0.5 <i>every time</i>, so two landed on the same point. "
     "They now spread as (i+1)/(N+1) in argument order, and the tether says which hook each belongs to. The "
     "ten-variant study of stronger marks (label, pill, colour, ordinal) is drawn but nothing from it is "
     "chosen or built."),

    ("if you add a mutating call and you don't want to delete the existing cables, then they should default just become greyed out",
     "Displaced cables fade automatically.",
     NOT,
     "Recorded as future work only. It is the many-to-one active-path rule with \"which arm is running\" "
     "swapped for \"which version reaches this read\", so it needs no new mechanism — but none of it is built."),
]

VERDICT_COUNTS = {v: sum(1 for row in SPEC if row[2] == v) for v in (MET, PARTIAL, NOT)}


def esc(value) -> str:
    return html.escape(str(value))


def data_uri(path: str) -> str | None:
    import base64
    file = REPO / path
    if not file.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(file.read_bytes()).decode("ascii")


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--ok:#16794a;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.62 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:42px 30px 80px}
h1{font-size:30px;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 26px}
h2{font-size:20px;margin:46px 0 12px;padding-top:14px;border-top:1px solid var(--line)}
p{margin:0 0 13px}
code{font:12.8px/1.5 'JetBrains Mono',ui-monospace,Menlo,monospace;background:#eef0f3;padding:1px 5px;border-radius:4px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:24px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
.row{background:#fff;border:1px solid var(--line);border-left-width:3px;border-radius:9px;padding:15px 17px;margin:12px 0}
.row.met{border-left-color:var(--ok)}
.row.partial{border-left-color:var(--warn)}
.row.notmet{border-left-color:#9aa1ad}
.said{font-size:15px;font-style:italic;color:var(--ink);margin:0 0 6px}
.said::before{content:'“'} .said::after{content:'”'}
.means{color:var(--muted);font-size:13.4px;margin:0 0 9px}
.verdict{display:inline-block;font:700 10.5px/1 Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;
 padding:4px 8px;border-radius:5px;margin-bottom:8px}
.met .verdict{background:#e6f4ec;color:var(--ok)}
.partial .verdict{background:#fdece3;color:var(--warn)}
.notmet .verdict{background:#eef0f3;color:#5c6470}
.evidence{font-size:13.8px;margin:0}
table{border-collapse:collapse;width:100%;margin:14px 0;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line)}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:none}
td.n{text-align:right;font-variant-numeric:tabular-nums}
figure{margin:18px 0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px;padding:15px 17px;margin:20px 0}
ol{font-size:13.8px;columns:2;column-gap:26px}
ol li{margin-bottom:5px;break-inside:avoid}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
b.k{background:#fff4ed;border-bottom:2px solid var(--warn);padding:0 2px}
"""


def rows_html() -> str:
    css = {MET: 'met', PARTIAL: 'partial', NOT: 'notmet'}
    out = []
    for said, means, verdict, evidence in SPEC:
        out.append(
            f'<div class="row {css[verdict]}"><span class="verdict">{esc(verdict)}</span>'
            f'<p class="said">{esc(said)}</p>'
            f'<p class="means">{esc(means)}</p>'
            f'<p class="evidence">{evidence}</p></div>')
    return "".join(out)


def units_html() -> str:
    rows = "".join(
        f'<tr><td>{esc(name)}</td><td><code>{esc(path)}</code></td>'
        f'<td class="n">{unit_cases(path)}</td></tr>' for name, path in UNITS.items())
    return (f'<table><thead><tr><th>what</th><th>file</th><th class="n">cases</th></tr></thead>'
            f'<tbody>{rows}</tbody></table>')


def build() -> str:
    board = data_uri("sketches/review/effect-port-tether.png")
    figure = (f'<figure><img src="{board}" alt="the review board"><figcaption>The review board on the '
              f'server, seeded through the real editor and cold-reopen verified.</figcaption></figure>'
              if board else '')
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Effect ports against the spec</title><style>{CSS}</style></head><body><main>
<h1>Effect ports, against the spec</h1>
<p class="sub">Every decision you made on 2 – 3 September, quoted, with the code and the proof that meets it —
or an honest no. {GIT_HEAD}.</p>

<div class="facts">
<div class="fact"><b>{VERDICT_COUNTS[MET]} / {len(SPEC)}</b><span>spec points met outright</span></div>
<div class="fact"><b>{VERDICT_COUNTS[PARTIAL]}</b><span>partial, and both say exactly what is missing</span></div>
<div class="fact"><b>{VERDICT_COUNTS[NOT]}</b><span>not built — recorded as future work</span></div>
<div class="fact"><b>{TOTAL_UNITS} + {len(EP)}</b><span>unit cases, plus real-browser checks driven with
pointer events</span></div>
</div>

<h2>1 · The spec, line by line</h2>
{rows_html()}

<h2>2 · The one finding that changed the picture</h2>
<div class="callout"><b>This app does not let a cable cross a frame, so there is no crossing to measure.</b>
<code>connectionRules.ts</code> carries an explicit refusal, <code>'no-shared-scope'</code>: the two Blocks must
share a scope, and the interior of an expanded Block <i>is</i> a scope. A boundary is crossed by binding to the
frame's own port — inner face on one side, outer face on the other — which is exactly what golden 11's target
board does. So the follow rule, written to measure a geometric crossing, is <b class="k">installed but
inert</b>. The journey that was meant to prove it gets four checks in and then legitimately cannot draw the
cable, which is how the finding surfaced. An earlier version of that test <i>passed</i> this step, because it
dropped the cable on empty canvas, made nothing, and my assertion was satisfied by the frame resizing — the
tightened version measures where the painted path actually crosses and the false pass disappeared.
<b>The fix is small and not a rethink:</b> drive <code>edgeT</code> from the inner-face binding's endpoint
rather than from a crossing. Still calculated from the arrow you draw, measured at the port instead of the
frame edge.</div>

<h2>3 · What is proved, and how</h2>
{units_html()}
<p>The browser journey drives the real build — Vite, the Python host, headless Chrome, real
<code>Input.dispatchMouseEvent</code> gestures — and reads every claim back out of the painted document. A port
is on the top edge because its dot is painted there; a tether is right-angled because its rendered
<code>d</code> attribute parses that way; it is render-only because the <i>computed</i> style says so.</p>
<ol>{''.join(f'<li>{esc(check)}</li>' for check in EP)}</ol>
<p class="means">The follow journey's {len(FOLLOW)} checks are written and the first four pass; it stops at the
cable, for the reason in §2. It is left in the tree failing rather than deleted or weakened, because it is the
thing that will pass when the binding-based version lands.</p>

{figure}

<h2>4 · What I would do next, in order</h2>
<ol style="columns:1">
<li><b>Re-point the follow rule</b> at the inner-face binding, so the outer port is positioned by the cable
again. Removes the one inert piece.</li>
<li><b>Pick a mark for multiple mutations</b> from the ten-variant study, so three mutated arguments are
distinguishable by more than order and a tether.</li>
<li><b>The auto-fade</b>, which needs no new mechanism.</li>
<li><b>The analyzer</b>: emit effect ports from real Python instead of a hand toggle.</li>
</ol>

<footer>Built by <code>docs/build_effect_spec_conformance.py</code> at {GIT_HEAD} · counts read from the tree at
build time · Claude Code · Opus 5, 2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps(VERDICT_COUNTS, indent=1))


if __name__ == "__main__":
    main()
