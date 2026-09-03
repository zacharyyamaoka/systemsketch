#!/usr/bin/env python3
"""Build `docs/effect-ports-implementation-2026-09-03.html`: the mutation grammar, in the app.

Zach approved the design on 2026-09-03 and asked for it built. This is what
landed: an argument can be marked as written in place, which derives an *effect
port* on the Block's top edge — because `list.append(self, object, /) -> None`
gives the new value no name and no right-hand port to leave by — and cables off
that port draw as effect cables with a `mut` pill.

Every number is measured from the tree at build time.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "effect-ports-implementation-2026-09-03.html"

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

SOURCES = {
    "model": REPO / "src/blocks/blockModel.ts",
    "layout": REPO / "src/blocks/layoutBlock.ts",
    "cable": REPO / "src/blocks/connections/effectCable.ts",
    "crossing": REPO / "src/blocks/elbow/boundaryCrossing.ts",
    "canvas": REPO / "src/blocks/ui/BlockCanvas.tsx",
    "inspector": REPO / "src/blocks/ui/BlockInspector.tsx",
}
TESTS = {
    "model + layout": REPO / "src/blocks/effectPorts.test.ts",
    "cable + lint": REPO / "src/blocks/connections/effectCable.test.ts",
    "crossing geometry": REPO / "src/blocks/elbow/boundaryCrossing.test.ts",
}
JOURNEY = REPO / "tests/effect_ports_smoke.mjs"


def case_count(path: Path) -> int:
    return len(re.findall(r"^\s*it\(", path.read_text(encoding="utf-8"), re.M))


def journey_checks() -> list[str]:
    text = JOURNEY.read_text(encoding="utf-8")
    return re.findall(r"add\(\s*'((?:EP-\d+)[^']*)'", text)


def api_of(path: Path) -> list[str]:
    return re.findall(r"^export (?:function|const) (\w+)", path.read_text(encoding="utf-8"), re.M)


def excerpt(path: Path, symbol: str) -> str:
    """The doc comment and body of one exported function, by name."""
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"(/\*\*(?:[^*]|\*(?!/))*\*/\n)?export function {symbol}\b", text)
    if not match:
        raise ValueError(f"no exported {symbol} in {path.name}")
    start = match.start()
    end = text.index("\n}\n", match.end()) + 3
    return text[start:end].rstrip()


def data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


MEASURED = {
    "test_cases": {name: case_count(path) for name, path in TESTS.items()},
    "journey_checks": journey_checks(),
    "cable_api": api_of(SOURCES["cable"]),
    "crossing_api": api_of(SOURCES["crossing"]),
}
TOTAL_CASES = sum(MEASURED["test_cases"].values())


def esc(value) -> str:
    return html.escape(str(value))


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15.5px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;}
main{max-width:1200px;margin:0 auto;padding:44px 30px 90px}
h1{font-size:31px;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 28px}
h2{font-size:21px;margin:52px 0 14px;padding-top:16px;border-top:1px solid var(--line)}
p{margin:0 0 14px}
code{font:13px/1.5 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace;
 background:#eef0f3;padding:1px 5px;border-radius:4px}
pre{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto}
pre code{background:none;padding:0;font-size:12.4px;line-height:1.6}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:26px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
figure{margin:20px 0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:8px;padding:16px 18px;margin:22px 0}
.callout.warn{border-left-color:var(--warn)}
table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff;
 border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:none}
ol.checks{margin:0;padding-left:20px;font-size:13.8px;columns:2;column-gap:28px}
ol.checks li{margin-bottom:5px;break-inside:avoid}
.decision{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:14px}
.decision>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:14px 16px}
.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.decision ul{margin:0;padding-left:18px;font-size:13.8px}
.decision li{margin-bottom:7px}
footer{margin-top:52px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.small{color:var(--muted);font-size:13px}
b.k{background:#fff4ed;border-bottom:2px solid var(--warn);padding:0 2px}
"""


def shots_html() -> str:
    captions = [
        ("1-before", "Before. A call with two arguments and no port on the top edge."),
        ("2-marked", "One click on <code>mut</code> in the inspector: the hook appears on the argument and "
                     "the effect port appears on the top edge. Nothing in the right-hand lane moved."),
        ("3-wired", "A cable dragged off the effect port — heavier, warm, and carrying the "
                    "<code>mut</code> pill, because it is not a return."),
        ("4-cleared", "Unmarked again: the port and the hook both go."),
    ]
    blocks = []
    for name, caption in captions:
        uri = data_uri(ASSETS / f"effect-ports-{name}-2026-09-03.png")
        if not uri:
            continue
        blocks.append(f'<figure><img src="{uri}" alt="{esc(caption)}"><figcaption>{caption}</figcaption></figure>')
    return "".join(blocks) or (
        '<div class="callout warn"><b>No captures.</b> The journey had not written its screenshots when this '
        'page was built. Re-run <code>npm run test:effect-ports</code> and rebuild.</div>')


def tests_table() -> str:
    rows = "".join(
        f"<tr><td>{esc(name)}</td><td><code>{esc(path.relative_to(REPO))}</code></td>"
        f"<td>{MEASURED['test_cases'][name]}</td></tr>"
        for name, path in TESTS.items())
    return (f"<table><thead><tr><th>what</th><th>file</th><th>cases</th></tr></thead>"
            f"<tbody>{rows}</tbody></table>")


def journey_html() -> str:
    items = "".join(f"<li>{esc(check)}</li>" for check in MEASURED["journey_checks"])
    return f'<ol class="checks">{items}</ol>'


def build() -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Effect ports, built</title><style>{CSS}</style></head><body><main>
<h1>Effect ports, built</h1>
<p class="sub">An argument marked as written in place derives a port on the Block's top edge, and cables off it
draw as what they are. 2026-09-03.</p>

<div class="facts">
<div class="fact"><b>{TOTAL_CASES}</b><span>unit cases across three new modules</span></div>
<div class="fact"><b>{len(MEASURED['journey_checks'])}</b><span>checks driven in a real browser with real
pointer events</span></div>
<div class="fact"><b>1 click</b><span>from an ordinary argument to a mutated one — the port is derived, never
added by hand</span></div>
<div class="fact"><b>0</b><span>new persisted props on the cable: an effect cable derives its look from the
port it leaves</span></div>
</div>

<h2>1 · What landed</h2>
<p><b>The model.</b> Three optional fields on a port, so every older board still loads unchanged:
<code>mutates</code> on an input (the call writes this argument in place), <code>effect</code> on an output
(this value leaves by the top edge), and <code>edgeT</code> (where along that edge it sits). The port is
<i>derived</i>: <code>reconcileEffectPorts</code> creates one for every marked argument and removes it when the
mark goes, and it runs inside <code>patchBlockPortProps</code> so the inspector, the context menu and a tool
draft all get it from one place.</p>
<pre><code>{esc(excerpt(SOURCES['cable'], 'effectPortEdgeTFromRoute'))}</code></pre>

<p><b>The layout.</b> An effect output is pulled out of the right-hand lane before the body is planned — it must
not take a row slot, or the rows would space around a port that is not there — and placed along the top edge
afterwards. The placement goes through <code>edgePortPoint</code>, which is deliberately generic: a group
boundary port, a region tunnel entry and a collapsed-group badge all need the same thing, and this is the seam
they should share rather than each inventing one.</p>

<p><b>The cable.</b> Nothing is persisted. A connection asks the port it leaves whether it is an effect port,
and draws itself accordingly — warm, a shade heavier than a data cable, with a <code>mut</code> pill, and
never in the near-black that control cables own. That keeps one fact in one place: mark the argument and every
cable off it changes with it.</p>

<h2>2 · Driven in the real app</h2>
{shots_html()}
<p>The journey builds the app, boots the Python host and Vite, drives headless Chrome with real
<code>Input.dispatchMouseEvent</code> gestures, and reads every claim back out of the painted document — a
port is "on the top edge" because its dot is painted there.</p>
{journey_html()}

<h2>3 · Unit coverage</h2>
{tests_table()}
<p class="small">The geometry module is the one Zach asked to be general purpose. It knows nothing about
mutations: <code>{esc(', '.join(MEASURED['crossing_api']))}</code> take a rectangle and a polyline and answer
where they meet, which is what lets a derived port be placed by the cable instead of by a slot.</p>

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul>
<li>Mark an argument → the hook and the effect port appear; unmark → both go. Driven in the browser, both ways,
and across a reload.</li>
<li>Cables off the port draw as effect cables with the <code>mut</code> pill.</li>
<li>{TOTAL_CASES} unit cases; the whole suite green.</li>
</ul></div>
<div><h4>Left</h4><ul>
<li><b>Next:</b> nothing calls <code>effectPortEdgeTFromRoute</code> yet — the port does not <i>follow</i> a
dragged cable in the app, though the function and its tests are there. That wiring is a side effect on the
connection's route, and it is the obvious next commit.</li>
<li><b>Next:</b> <code>effectExitLint</code> is written and tested but not surfaced anywhere in the UI.</li>
<li><b>Not started:</b> the analyzer emitting effect ports from real Python; the auto-fade of displaced cables.</li>
</ul></div>
<div><h4>Needs you</h4><ul>
<li><b>The ink.</b> Warm orange at 2.6px is what shipped; say the word if you want it nearer black.</li>
<li><b>Where the toggle lives.</b> It is an inspector chip today; the port's right-click menu is the other
natural home.</li>
</ul></div>
<div><h4>Deliberately not done</h4><ul>
<li>No new connection prop — the look is derived, so it cannot drift from the block.</li>
<li>No migration: the three port fields are optional, so every older board loads untouched.</li>
<li>No change to how named outputs lay out.</li>
</ul></div>
</div>
<footer>Built by <code>docs/build_effect_ports_implementation.py</code> at {GIT_HEAD} · counts read from the
tree at build time · Claude Code · Opus 5 (<code>claude-opus-5</code>), 2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"cases": TOTAL_CASES, "journey": len(MEASURED["journey_checks"])}, indent=1))


if __name__ == "__main__":
    main()
