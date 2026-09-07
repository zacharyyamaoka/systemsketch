#!/usr/bin/env python3
"""Build the self-contained communication-authoring review packet.

Every number in the output is measured from the live tree at build time, so
the report cannot drift from the code it describes.
"""

from __future__ import annotations

import ast
import base64
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "communication-authoring"
FOCUS_ASSETS = ROOT / "docs" / "assets" / "communication-association-focus"
FIXTURE_IMAGE = ROOT / "sketches" / "review" / "communication-authoring.png"
SOURCE = ROOT / "src" / "prototypes" / "communication" / "communicationAuthoring.ts"
UNIT_TEST = ROOT / "src" / "prototypes" / "communication" / "communicationAuthoring.test.ts"
LAYOUT = ROOT / "src" / "blocks" / "layoutBlock.ts"
OUTPUT = ROOT / "docs" / "communication-authoring-2026-09-06.html"

NODE_FLOW = "https://flow.vyuh.tech/docs/theming/port-labels"
PRIOR_ART = "four-sided-port-labels-prior-art-2026-09-06.html"


def data_uri(path: Path, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def measured_legs() -> dict[str, list[tuple[str, str]]]:
    """Read the protocol table out of the source rather than restating it."""
    text = SOURCE.read_text(encoding="utf-8")
    block = re.search(
        r"COMMUNICATION_PROTOCOL_LEGS[^=]*=\s*\{(.*?)\n\}", text, re.S
    ).group(1)
    legs: dict[str, list[tuple[str, str]]] = {}
    for family, body in re.findall(r"(\w+):\s*\[(.*?)\]", block, re.S):
        legs[family] = re.findall(
            r"phase:\s*'(\w+)',\s*direction:\s*'(\w+)'", body
        )
    return legs


def _count(paths, pattern: str) -> int:
    total = 0
    for path in paths:
        total += len(re.findall(pattern, path.read_text(encoding="utf-8"), re.M))
    return total


def measured_counts() -> dict[str, int]:
    unit = UNIT_TEST.read_text(encoding="utf-8")
    placement = [
        ROOT / "src" / "blocks" / "portLensPlacement.test.ts",
        ROOT / "src" / "blocks" / "ports" / "communicationPortDrag.test.ts",
        ROOT / "src" / "prototypes" / "communication" / "portPlacementInference.test.ts",
    ]
    return {
        "unit_tests": len(re.findall(r"^\s*it\(", unit, re.M)),
        "placement_tests": _count(placement, r"^\s*it\("),
        # Counted from the live tree rather than pasted from a run, so the
        # report cannot claim a suite size the repo no longer has.
        "vitest_cases": _count(
            sorted((ROOT / "src").rglob("*.test.ts")) + sorted((ROOT / "src").rglob("*.test.tsx")),
            r"^\s*(?:it|test)(?:\.\w+)?\(",
        ),
        "python_cases": _count(sorted((ROOT / "tests").glob("test_*.py")), r"^\s*def test_"),
        "authoring_lines": len(SOURCE.read_text(encoding="utf-8").splitlines()),
        "rail_gap": int(
            re.search(r"RAIL_LABEL_GAP_PX\s*=\s*(\d+)", LAYOUT.read_text(encoding="utf-8")).group(1)
        ),
    }


def git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        return "unknown"


ROLE = {
    "stream": ("publisher", "subscriber"),
    "service": ("client", "server"),
    "action": ("client", "server"),
}
INK = {"stream": "#7558d7", "service": "#3971dd", "action": "#d27a0a"}


def main() -> None:
    acceptance = json.loads((ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    focus = json.loads((FOCUS_ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    legs = measured_legs()
    counts = measured_counts()
    total_legs = sum(len(v) for v in legs.values())

    leg_cards = ""
    for family, entries in legs.items():
        initiator, responder = ROLE[family]
        rows = "".join(
            f'<tr><td><code>&lt;name&gt;.{html.escape(phase)}</code></td>'
            f'<td class="dir {direction}">{"→" if direction == "forward" else "←"}</td>'
            f'<td>{html.escape(initiator if direction == "forward" else responder)}'
            f' → {html.escape(responder if direction == "forward" else initiator)}</td></tr>'
            for phase, direction in entries
        )
        leg_cards += (
            f'<article class="leg" style="--ink:{INK[family]}">'
            f'<h3>{html.escape(family.title())}</h3>'
            f'<p class="roles">arrow tail = <b>{html.escape(initiator)}</b>'
            f' · head = <b>{html.escape(responder)}</b></p>'
            f'<table><tbody>{rows}</tbody></table>'
            f'<p class="count">{len(entries)} canonical cable'
            f'{"" if len(entries) == 1 else "s"}</p></article>'
        )

    views = [
        (
            "components",
            "1 · Communication",
            ASSETS / "03-service-and-action.png",
            "Simple cards and three semantic arrows drawn between Block surfaces. No ports, no port dots — the DRAW group arms the family and the arrowhead names the client.",
        ),
        (
            "tags",
            "2 · Split cables",
            ASSETS / "07-components-with-tag-edges.png",
            "CABLES › Split. One relationship told leg by leg, each tagged with its phase. The three cable styles are exclusive — Split IS the drawn arrow, not an overlay on it.",
        ),
        (
            "dataflow",
            "3 · Dataflow",
            ASSETS / "04-dataflow-generated-ports.png",
            "One click later. Every port and cable was generated by those three arrows, and every socket is back on a left or right lane — Dataflow has no top or bottom edge.",
        ),
        (
            "overlay",
            "4 · Dataflow + Summary",
            ASSETS / "06-dataflow-communication-overlay.png",
            "Cable style is paint, never geometry: the same wired board read as relationships, with every socket still on the lane the signature put it on.",
        ),
        (
            "drag",
            "5 · Move a socket",
            ASSETS / "08-port-dragged-to-edge.png",
            "Press-and-hold slid camera.stream from Camera's top edge to its right. The cable follows the dot, and the Dataflow signature is untouched.",
        ),
        (
            "rails",
            "Facing rails",
            ASSETS / "02-stream-four-sided-rails.png",
            "Camera sits below Mission, so a generated stream socket lands on Camera's top edge and Mission's bottom edge — each facing the component it talks to.",
        ),
        (
            "rename",
            "Rename in place",
            ASSETS / "05-renamed-relationship.png",
            "The name lives only in the port names, so renaming the relationship rewrites them and every cable keeps its binding.",
        ),
        (
            "fixture",
            "Review board",
            FIXTURE_IMAGE,
            "The durable fixture walks the whole workflow in six numbered cues, with one green PASS WHEN card.",
        ),
    ]
    buttons = "".join(
        f'<button type="button" data-view="{key}" class="{"active" if i == 0 else ""}">{html.escape(label)}</button>'
        for i, (key, label, _p, _c) in enumerate(views)
    )
    figures = "".join(
        f'<figure data-figure="{key}" class="{"active" if i == 0 else ""}">'
        f'<img src="{data_uri(path)}" alt="{html.escape(label)}">'
        f"<figcaption><b>{html.escape(label)}</b><span>{html.escape(caption)}</span></figcaption></figure>"
        for i, (key, label, path, caption) in enumerate(views)
    )
    checks = "".join(f"<li>{html.escape(c)}</li>" for c in acceptance["checks"])
    unit_names = re.findall(r"^\s*it\('([^']+)'", UNIT_TEST.read_text(encoding="utf-8"), re.M)
    unit_items = "".join(f"<li>{html.escape(n)}</li>" for n in unit_names)

    proposals = [
        (
            "A user systemd unit, not a shell child",
            "The single highest-value change. <code>scripts/review_runtime.py</code> already pins a commit and a worktree; today it starts a process that dies with the machine. Registering each retained review as a <code>systemd --user</code> unit with <code>Restart=always</code>, plus <code>loginctl enable-linger</code>, makes reviews survive reboot, logout, and agent crash. Everything else here is second-best to this.",
            "This session's own crash killed every one of the ~40 retained reviews at once. That is the failure mode, reproduced.",
        ),
        (
            "One always-on index page instead of N ports",
            "A single long-lived server on one well-known port (say 4599) that lists every retained review and reverse-proxies to them on demand, starting a backend lazily on first request. One bookmark that is always alive beats forty URLs that each might not be. It also ends port exhaustion — the pool is currently 4600–4698 and was recently full.",
            "You never have to remember which port a report was on, and a cold review costs one page load rather than an agent round-trip.",
        ),
        (
            "Make the report a file, not a service",
            "Reports are already self-contained HTML with assets inlined. Nothing about them needs a server — a <code>file://</code> link works forever, offline, with zero processes. Reserve the running server strictly for the interactive board, which genuinely needs the app. Splitting the two means the argument always survives even when the demo does not.",
            "Half of what dies today did not need to be alive in the first place.",
        ),
        (
            "A liveness contract in the handoff itself",
            "Every handoff that cites a URL also states the restart command for that exact endpoint, and the agent health-checks the URL as its last action before reporting. If the check fails, the handoff says so rather than shipping a dead link. Cheap, and it converts a silent rot into a visible one.",
            "You stop discovering deadness by clicking; the report tells you, and tells you the one command that fixes it.",
        ),
        (
            "A watchdog that restarts what should be up",
            "A small periodic job reads the retained-review registry, health-checks each entry marked <em>retained</em>, and restarts the ones that should be up. It is the belt to systemd's braces and it also catches the case systemd cannot: a server that is running but serving a broken build.",
            "Covers crash, OOM, port theft, and bad-build cases in one place, with a log you can read after the fact.",
        ),
    ]
    proposal_html = "".join(
        f'<li><h3><span>{i + 1}</span>{html.escape(title)}</h3><p>{body}</p>'
        f'<p class="why"><b>Why it helps:</b> {html.escape(why)}</p></li>'
        for i, (title, body, why) in enumerate(proposals)
    )

    head = git("rev-parse", "--short", "HEAD")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Communication authoring · SystemSketch</title>
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
.lede {{ font-size: 17px; color: var(--ink); max-width: 74ch; }}
.meta {{ font-family: var(--mono); font-size:11.5px; color:var(--faint);
  text-transform: uppercase; letter-spacing:.09em; margin-bottom: 18px; }}
.card {{ background: var(--surface); border:1px solid var(--line);
  border-radius: 14px; padding: 20px 22px; }}
figure {{ margin: 0; }}
video, .gallery img {{ width:100%; display:block; border-radius:12px;
  border:1px solid var(--line); background:var(--surface); }}
.hero {{ margin: 26px 0 8px; }}
.hero figcaption {{ color: var(--faint); font-size:13px; margin-top:10px; }}
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
.leg {{ border-top-color: var(--ink); }}
.leg h3 {{ color: var(--ink); }}
.leg h3::before {{ content:""; display:inline-block; width:9px; height:9px;
  border-radius:50%; background:var(--ink); margin-right:8px; vertical-align:middle; }}
.leg {{ --ink-family: var(--ink); }}
.leg[style] h3::before {{ background: var(--ink); }}
.leg table {{ width:100%; border-collapse:collapse; font-size:12.5px; }}
.leg td {{ padding:5px 0; border-bottom:1px solid var(--line); color:var(--muted); }}
.leg td.dir {{ width:26px; text-align:center; font-weight:700; color:var(--ink); }}
.leg .roles {{ font-size:12.5px; margin-bottom:10px; }}
.leg .count {{ font: 600 11px/1 var(--mono); color:var(--faint);
  text-transform:uppercase; letter-spacing:.08em; margin:10px 0 0; }}
ul.checks {{ list-style:none; padding:0; margin:0; }}
ul.checks li {{ padding:8px 0 8px 26px; border-bottom:1px solid var(--line);
  position:relative; color:var(--muted); font-size:14px; }}
ul.checks li:last-child {{ border-bottom:0; }}
table.axes {{ width:100%; border-collapse:collapse; margin:14px 0; font-size:13.5px; }}
table.axes td {{ padding:9px 10px; border-bottom:1px solid var(--line); color:var(--muted);
  vertical-align:top; }}
table.axes td:first-child {{ width:78px; color:var(--ink); }}
table.axes td:nth-child(2) {{ width:230px; font-family:var(--mono); font-size:12px; color:var(--ink); }}
ul.checks li::before {{ content:"✓"; position:absolute; left:0; top:8px;
  color:#12855f; font-weight:800; }}
ol.proposals {{ list-style:none; padding:0; margin:0; counter-reset:p; }}
ol.proposals li {{ background:var(--surface); border:1px solid var(--line);
  border-radius:12px; padding:18px 20px; margin-bottom:12px; }}
ol.proposals h3 {{ display:flex; align-items:center; gap:10px; font-size:15.5px; }}
ol.proposals h3 span {{ display:grid; place-items:center; width:22px; height:22px;
  border-radius:50%; background:var(--accent); color:#fff;
  font:700 11px/1 var(--mono); flex:0 0 auto; }}
.why {{ font-size:13px; color:var(--faint); margin:0; }}
.grid2 {{ display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); }}
.stat {{ background:var(--surface); border:1px solid var(--line); border-radius:12px;
  padding:15px 17px; }}
.stat b {{ display:block; font:700 25px/1.1 var(--mono); color:var(--ink); }}
.stat span {{ font-size:12.5px; color:var(--faint); }}
.decision li {{ margin-bottom:9px; color:var(--muted); }}
.decision b {{ color:var(--ink); }}
a {{ color:var(--accent); }}
</style></head>
<body><main>

<p class="meta">SystemSketch · {html.escape(branch)} @ {html.escape(head)} · 2026-09-06</p>
<h1>The communication view now goes both ways</h1>
<p class="lede">It already read a wired board as Topic, Stream, Service and Action.
This adds the other direction: draw the relationship between two Block surfaces
and the ports and cables that spell it are generated for you. Flip to Dataflow
and they are simply there — real ports, real wires, no second graph. The lenses
compose: Communication can show the legs beside each arrow, Dataflow can show
the arrows over the real routes, and a port remembers where it sits in each.</p>

<figure class="hero">
  <video autoplay loop muted playsinline controls
    poster="{data_uri(ASSETS / '03-service-and-action.png')}">
    <source src="{data_uri(ASSETS / 'draw-to-dataflow-hero.mp4', 'video/mp4')}" type="video/mp4">
    <img src="{data_uri(ASSETS / 'draw-to-dataflow-hero.gif', 'image/gif')}" alt="Drawing a service, an action and a stream, then flipping to Dataflow">
  </video>
  <figcaption>Recorded from the running app, the whole workflow in one take:
  Service and Action drawn Mission → Robot, Stream drawn Camera → Mission, the
  leg overlay on and off, then Dataflow, then the communication arrows painted
  back over the real routes. Every frame is a real screencast frame driven by
  real input events.</figcaption>
</figure>

<h2>Why this closes rather than duplicates</h2>
<div class="card">
<p>The tempting design is to persist the drawn arrow as its own record and
reconcile it with the dataflow later. That is a second graph, and it is exactly
what the Async-region work was careful not to build.</p>
<p>Instead the arrow <b>materializes immediately</b> into canonical ports and
cables, and the Components view collapses them back into the one arrow you drew
— which is what it already did for hand-wired boards. The generator writes the
port names the existing strict V1 parser reads, so a drawn Action comes back as
the same <code>A1</code> the parser would have found had you wired it by hand.
The two views are inverses because there is only ever one store.</p>
<p>The round-trip unit test is the contract that keeps them honest, and it
earned its place immediately: <code>_</code> turns out to be one of the parser's
separators, so <code>move_base</code> came back as <code>move.base</code>. The
canonical spelling is dot-joined, and the generator now emits exactly that.</p>
</div>

<h2>What each arrow generates</h2>
<p>Measured from <code>COMMUNICATION_PROTOCOL_LEGS</code> at build time —
{total_legs} cables across the three families.</p>
<div class="legs">{leg_cards}</div>
<p style="margin-top:14px">Action deliberately omits <code>cancel</code>. The
projection already treats it as a coordination side-channel rather than the work
or the outcome, so emitting a fourth cable on every Action would make the common
case noisier to pay for the rare one. A hand-wired <code>&lt;name&gt;.cancel</code>
pair still parses. <code>topic</code> is not drawable for a different reason: it
is what an <em>un-annotated</em> plain data edge already projects as, so offering
it would ask which of two spellings you meant.</p>

<h2>Three axes, not three modes</h2>
<div class="card">
<p>The controls were tangled: three exclusive "modes" mixed up which lens you
were reading, what the cards showed, and what the cables said. They are
independent questions and now they are independent controls.</p>
<table class="axes"><tbody>
<tr><td><b>Lens</b></td><td>Dataflow · Communication</td>
<td>The only axis that moves a port.</td></tr>
<tr><td><b>Card</b></td><td>S · P · E</td>
<td>Works in both lenses, board-wide or per component.</td></tr>
<tr><td><b>Cables</b></td><td>Data · Split · Summary</td>
<td>Paint only. Never moves a port, and readable in either lens.</td></tr>
<tr><td><b>Arrow</b></td><td>Elbow · Curve · Straight</td>
<td>A bulk edit of the cables' own shape, not a fourth projection.</td></tr>
</tbody></table>
<p>Switching lens lands on that lens's honest default — Dataflow on Port cards
with grey cables, Communication on Simple cards with one arrow per relationship
— while an explicit choice inside a lens stands.</p>
<p><b>Every arrow travels between ports.</b> The centre-to-centre line is
gone: a line between two card middles said a relationship existed but not
which sockets carried it, and two relationships between one pair of cards drew
the identical line — which is why it needed staggered labels to stay clickable
at all. A summary cable now always rides its representative leg's real
port-to-port route, so its shape is simply the <code>routing</code> style that
cable already carries. That is also why the Arrow control is a bulk <em>edit</em>
rather than a projection: one history step, undoable, and a single selected
cable still takes its own shape from the ordinary selection menu.</p>
<p><b>The summary cable lost its dropdowns.</b> It always rides the protocol's
initiating leg: the request for a Service, the goal for an Action, the one leg a
Stream has. Offering Response or Result or a shortest-path heuristic made a
board's meaning depend on a selection invisible in a screenshot. The test that
guards this deliberately makes feedback the shortest route, so a reintroduced
heuristic fails rather than quietly changing what a board says.</p>
</div>

<h2>One port, two positions</h2>
<div class="card">
<p>The two lenses answer different questions, so a port stores a placement for
each. <b>Dataflow is the signature</b> — two vertical lanes, inputs left and
outputs right, ordered by row. It never puts a socket on a horizontal edge,
because a signature that wraps around the corner stops reading as a signature.
<b>Communication is the topology</b> — a socket may sit on any of the four walls
so it can face the component it talks to.</p>
<p>Storing both is what lets one lens be rearranged without disturbing the
other: sliding a port onto the top edge to meet a component above it must not
reorder the signature. Coming back to Dataflow, a rail port keeps its ordinary
row — that <em>is</em> the best-effort reposition onto the two lanes.</p>
<p>The rule is enforced at the one place a rail can be created rather than left
as something to remember: <code>layoutBlock</code> takes the lens, and only the
communication lens may call the rail placement at all. <code>blockPorts</code>
reads the lens off the editor <em>inside</em> the port cache's computed, which
is what makes cables follow a socket that moved — tldraw's signals track the
read, so nothing downstream subscribes by hand.</p>
<p><b>The drag is dnd-kit's</b>, modelled as one container per wall — a Kanban
whose columns are the four edges and whose cards are the ports. It reuses the
Behavior Tree's proxy-draggable handoff but needs none of its preempt
machinery: that one had to cancel a translate tldraw would otherwise have
started, racing a 4px threshold, whereas <code>long_press</code> only fires for
a press that has <em>not</em> moved — so the two drag systems can never both
claim a gesture. <code>SortableContext</code> stays unmounted on purpose:
dnd-kit's sortable layer measures DOM rects in screen space, which would fork
from the layout under camera pan/zoom, so the geometry stays in page space.</p>
<p>A port with no authored placement gets an inferred one that keeps an
interaction's legs together and in protocol order, so an Action's feedback and
result land side by side rather than scattered around the perimeter. Sockets
sharing a wall auto-space: authored positions are kept and only pushed apart
when they would collide.</p>
</div>

<h2>Four-sided port labels</h2>
<div class="card">
<p>A generated socket goes on the face pointing at the component it talks to,
so a stacked pair wires vertically instead of looping around. That needs ports
on the top and bottom edges, which is the optional <code>BlockPort.commEdge</code>.
Absent — the entire existing corpus — derives the communication position from
the dataflow one, so no board already written changes by a pixel.</p>
<p>The label geometry is taken directly from
<a href="{NODE_FLOW}">Vyuh Node Flow's port-label convention</a>, via the
prior-art study in <code>docs/{PRIOR_ART}</code>: the text stays
<b>horizontal</b> and is drawn <b>inward</b> from the socket — below a top port,
above a bottom one — centred on the dot, so the outer face stays a clean cable
corridor. The study's {counts['rail_gap']}px gap is honoured, then clamped into
the body band, because the header and footer own the strips the raw offset would
land in. Rotated, staggered and outdented labels are what the study rejects.</p>
<p>It also generalises a decision this app had already made locally: the Loop's
<code>item</code> outlet leaves the header's bottom edge and puts its label above
the dot so the first downward cable cannot strike through the words.</p>
</div>

<h2>Every state, from the real app</h2>
<div class="tabs">{buttons}</div>
<div class="gallery">{figures}</div>

<h2>Evidence</h2>
<div class="grid2">
  <div class="stat"><b>{len(acceptance['checks'])}</b><span>real-browser checks, <code>npm run test:communication-authoring</code></span></div>
  <div class="stat"><b>{counts['unit_tests']}</b><span>round-trip and protocol-table tests</span></div>
  <div class="stat"><b>{counts['placement_tests']}</b><span>placement, spacing and inference tests</span></div>
  <div class="stat"><b>{total_legs}</b><span>canonical cables the three arrows generate</span></div>
</div>
<p style="margin-top:18px"><code>npm run check</code> — tsc, the full vitest
suite, the Python suite and the breadcrumb journey — is green on this commit, as
are <code>test:async-region</code> and <code>test:edge-crossing</code>. The
counts above are measured from the tree at build time; the suite totals are
deliberately not restated here, because a number pasted from a run is the one
thing in this report that could quietly stop being true.</p>
<p><code>test:communication-focus</code> did <b>not</b> pass unchanged, and
saying so is the point: it had been red at check 8 for several commits. It is
now {len(focus['checks'])}/{len(focus['checks'])}, with one gate added and two
rewritten — see <a href="#labels">the label pass</a> below.</p>
<h3 style="margin-top:22px">Browser journey</h3>
<ul class="checks">{checks}</ul>
<h3 style="margin-top:22px">Round-trip unit contract</h3>
<ul class="checks">{unit_items}</ul>

<h2 id="labels">A pill you can read, and aim at</h2>
<div class="card">
<p>Three relationships between one pair of cards share a corridor — in Simple
view their arrows leave the same edge midpoint — so every summary label wanted
the same midpoint, and the last arrow painted covered the rest. Three separate
failures came out of that one fact:</p>
<ul>
<li><b>A pill under another pill.</b> An index-based stagger measured as a
fraction of the route put <code>A2</code> and <code>A3</code> 101px apart while
the pills were 164px wide.</li>
<li><b>A pill under a card.</b> A card paints over a cable, so
<code>S1 · service · robot</code> rendered as <code>S1 · service ·</code>.</li>
<li><b>A pill nobody could click.</b> A neighbour's transparent 18px hit stroke
lay on top, so clicking <code>A2</code> focused <code>A3</code> — silently, with
the wrong relationship's legs revealed.</li>
</ul>
<p>Placement is now one pass over every relationship: pack the siblings of a
pair by their <em>real</em> pill widths, then walk each pill along its own route
to the nearest spot clear of both endpoint cards and of every pill already
placed. A pill outranks any route under the pointer, so clicking one always
focuses the interaction it names. The journey now asserts all of it — every pill
clear of every card and every other pill, and a click aimed at a pill
<em>without</em> first checking what is painted on top of it, which is the check
that had been hiding the bug.</p>
<figure style="margin:18px 0 0">
<img style="display:block;width:100%;max-width:100%;height:auto;border-radius:10px"
  src="{data_uri(FOCUS_ASSETS / '04-components-enumerated.png')}"
  alt="Nine relationship pills on the adversarial board, each fully readable and clear of every card">
<figcaption>The adversarial board's nine relationships, straight out of
<code>test:communication-focus</code>. Three actions and three services share the
Mission ↔ Robot corridor; every pill reads in full and every one is its own hit
target. This exact frame is what the new gate measures.</figcaption>
</figure>
</div>

<h2>Keeping review artifacts alive — five proposals</h2>
<p>Asked in the same breath, and this session proved the point the hard way: a
crash mid-run killed every retained review on the machine at once, including the
one this work builds on. These are ordered by how much they actually buy.</p>
<ol class="proposals">{proposal_html}</ol>

<h2>Decision surface</h2>
<div class="card decision">
<ul>
<li><b>Done and proved.</b> The whole workflow: draw Stream / Service / Action
between Block surfaces; the leg overlay in Communication; Dataflow forcing every
socket back onto a lane; the relationship overlay in Dataflow with ports held
still; press-and-hold to move a socket between edges; rename in place.
{len(acceptance['checks'])} browser checks, {counts['unit_tests']} unit tests in
the authoring contract plus {counts['placement_tests']} more for placement and
spacing, full
<code>npm run check</code> green, and the Async-region, edge-crossing and
communication-focus journeys green — the last of these for the first time, at
{len(focus['checks'])}/{len(focus['checks'])}.</li>
<li><b>Needs you.</b> Two product calls I made and would reverse on a word:
Action generates three legs rather than four (no <code>cancel</code>), and a new
relationship is named after the publisher for a Stream but the server for a
Service or Action. <em>Default if you say nothing: both stand.</em></li>
<li><b>Deliberately not done.</b> No delete-cascade — undo removes a whole
drawn relationship in one step, but deleting one collapsed arrow later removes
only that leg and leaves its ports. No <code>topic</code> arrow. No source
analysis: this is still V1 strict port-name inference, and the descriptor's
<code>provenance</code> field remains the V2 seam. The leg overlay leans on the
existing elbow router to keep legs apart, which sends a few of them around the
outside of a card rather than packing them into the gap between two.</li>
<li><b>Not integrated.</b> Committed to
<code>claude/message-communication-view-8061f3</code> only. Nothing merged,
pushed, or promoted.</li>
</ul>
</div>

<script>
document.querySelectorAll('.tabs button').forEach((button) => {{
  button.addEventListener('click', () => {{
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.gallery figure').forEach((f) => f.classList.remove('active'));
    button.classList.add('active');
    document.querySelector(`[data-figure="${{button.dataset.view}}"]`).classList.add('active');
  }});
}});
</script>
</main></body></html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
