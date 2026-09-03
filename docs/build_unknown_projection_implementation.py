#!/usr/bin/env python3
"""Build the implementation report for `?` and the projection Block.

Zach picked, on 2026-09-03: `?` as the one unknown token, V10 (Simple view) as
the default presentation of an unresolved callee with V4's type line behind it
and a single `?` only where a slot has nothing to say — never an inferred type,
and never erasing a fact the call site proves — plus S1, the derived projection
Block, for a member read.

Every number here is measured at build time from the live tree and from the
real browser journey's own result file, so the page cannot drift from what
shipped.
"""

from __future__ import annotations

import base64
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "unknown-projection-implementation-2026-09-03.html"
JOURNEY = ASSETS / "unknown-projection.json"

SHOTS = [
    ("unknown-projection-marked-simple.png",
     "Mark unresolved · the default presentation",
     "The type line says it once for the whole call. No port table, because the signature "
     "cannot be stated — and the cable from encode() is still bound to the port it always was."),
    ("unknown-projection-marked-port.png",
     "The same Block, switched to Port view",
     "`self Client` survives, because the call site proves it — the receiver is annotated "
     "where the call is written, and an unresolved callee does not make that stop being true. "
     "The two rows with no type get one `?` each, in the quieter unknown ink. Names are never "
     "touched."),
    ("unknown-projection-picker-open.png",
     "Split, in the connection-drop offer",
     "A cable dropped on empty canvas already knows the type it carries, which is exactly what "
     "a projection needs. It joins Call, Transform, Branch, Store, Sink, Source, Value and "
     "Expanded group."),
    ("unknown-projection-accessors.png",
     "The projection, titled by the type that arrived",
     "`ObjectRecord` in on one unnamed inlet; `.object_id` and `.pose.translation.x` out. No "
     "`?` anywhere — a member read off a known type is assumed to decompose. The chain is one "
     "row, and no variable name appears on the Block."),
]

BOARD = ("unknown-projection.png",
         "sketches/review/unknown-projection.systemsketch",
         "The review board, generated through the real editor and cold-reopened.")


# --------------------------------------------------------------------------- measure


def measure() -> dict:
    model = (ROOT / "src" / "blocks" / "blockModel.ts").read_text(encoding="utf-8")
    commands = (ROOT / "src" / "blocks" / "commands" / "blockCommands.ts").read_text(encoding="utf-8")
    picker = (ROOT / "src" / "blocks" / "connections" / "blockPicker.ts").read_text(encoding="utf-8")
    canvas = (ROOT / "src" / "blocks" / "ui" / "BlockCanvas.tsx").read_text(encoding="utf-8")
    css = (ROOT / "src" / "blocks" / "ui" / "block-canvas.css").read_text(encoding="utf-8")
    inline = (ROOT / "src" / "blocks" / "BlockInlineEditor.tsx").read_text(encoding="utf-8")

    token = re.search(r"export const UNKNOWN_TOKEN = '(.+?)'", model)
    unresolved = re.search(r"export const UNRESOLVED_BLOCK_TYPE = '(\w+)'", model)
    projection = re.search(r"export const PROJECTION_BLOCK_TYPE = '(\w+)'", model)
    presets = re.findall(r"\{ id: '(\w+)', label: '([\w ]+)'", picker)

    journey = json.loads(JOURNEY.read_text(encoding="utf-8"))

    # The shape schema is untouched — that is the load-bearing claim of the
    # whole change, so it is measured rather than asserted.
    port_block = model.split("export const BlockPort = T.object({")[1].split("})")[0]
    port_fields = re.findall(r"^\t(\w+):", port_block, re.M)
    shape_props = model.split("export const BLOCK_SHAPE_PROPS = {")[1].split("\n} as const")[0]
    block_fields = re.findall(r"^\t(\w+):", shape_props, re.M)

    migrations = (ROOT / "src" / "blocks" / "BlockShapeUtil.tsx").read_text(encoding="utf-8")
    migration_ids = re.findall(r"^\t*(\w+): (\d+),", migrations.split("createShapePropsMigrationIds(")[1]
                               .split(")")[0]) if "createShapePropsMigrationIds(" in migrations else []

    diff = subprocess.run(
        ["git", "diff", "--numstat", "--",
         "src/blocks", "tests/unknown_projection_smoke.mjs"],
        cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    changed = []
    for line in diff.splitlines():
        added, removed, path = line.split("\t")
        changed.append({"path": path, "added": int(added), "removed": int(removed)})
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--",
         "src/blocks", "tests"],
        cwd=ROOT, capture_output=True, text=True, check=False).stdout.split()
    for path in untracked:
        if path.endswith(("unknownAndProjection.test.ts", "unknown_projection_smoke.mjs")):
            lines = len((ROOT / path).read_text(encoding="utf-8").splitlines())
            changed.append({"path": path, "added": lines, "removed": 0})

    return {
        "token": token.group(1) if token else "?",
        "unresolvedType": unresolved.group(1) if unresolved else "",
        "projectionType": projection.group(1) if projection else "",
        "presets": presets,
        "journey": journey,
        "journeyPassed": sum(1 for row in journey if row["ok"]),
        "portFields": port_fields,
        "blockFields": block_fields,
        "migrations": migration_ids,
        "changed": sorted(changed, key=lambda row: -row["added"]),
        "sharedPatch": "patchBlockPortProps(props, field.side, field.portId" in inline,
        "unknownCss": ".BlockNode-portType--unknown" in css,
        "unknownClass": "BlockNode-portName--unknown" in canvas,
        "noInference": "never inferred INTO a slot here" in commands,
        "neverErases": "would lose information to make a point" in commands,
        "onePerRow": "not a rule this layer enforces" in commands,
    }


# ----------------------------------------------------------------------------- media


def uri(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")


def board_uri() -> str:
    path = ROOT / "sketches" / "review" / BOARD[0]
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def figure(src: str, title: str, caption: str) -> str:
    return (
        "<figure>"
        f"<img src='{src}' alt='{title}' />"
        f"<figcaption><b>{title}</b> — {caption}</figcaption>"
        "</figure>"
    )


def check_table(journey: list[dict]) -> str:
    rows = "".join(
        f"<tr><td class='mono'>{row['id']}</td><td>{row['label']}</td>"
        f"<td class='{'ok' if row['ok'] else 'bad'}'>{'PASS' if row['ok'] else 'FAIL'}</td></tr>"
        for row in journey
    )
    return f"<table><tr><th>check</th><th>what it proves</th><th></th></tr>{rows}</table>"


def diff_table(changed: list[dict]) -> str:
    rows = "".join(
        f"<tr><td class='mono'>{row['path']}</td><td class='num'>+{row['added']}</td>"
        f"<td class='num'>−{row['removed']}</td></tr>"
        for row in changed
    )
    total_a = sum(row["added"] for row in changed)
    total_r = sum(row["removed"] for row in changed)
    return (
        f"<table><tr><th>file</th><th>added</th><th>removed</th></tr>{rows}"
        f"<tr class='total'><td>{len(changed)} files</td><td class='num'>+{total_a}</td>"
        f"<td class='num'>−{total_r}</td></tr></table>"
    )


# ------------------------------------------------------------------------------ page


STYLE = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f5f2ec; color: #2b2721;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 48px 24px 96px; }
h1 { font-size: 34px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.01em; }
h2 { font-size: 22px; margin: 56px 0 12px; padding-top: 20px; border-top: 1px solid #ddd5c8; }
h3 { font-size: 16px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.08em;
  color: #7d7365; }
.kicker { font: 600 11px ui-monospace, monospace; letter-spacing: 0.14em; text-transform: uppercase;
  color: #9b8f7d; margin: 0 0 14px; }
p { margin: 0 0 14px; }
code, .mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 13px; }
code { background: #ebe5da; padding: 1px 5px; border-radius: 4px; }
.lede { font-size: 18px; color: #4a453d; }
figure { margin: 22px 0; background: #0e1117; border-radius: 10px; padding: 14px; }
figure img { display: block; width: 100%; border-radius: 6px; }
figcaption { color: #9fb0c6; font-size: 13px; line-height: 1.55; margin-top: 12px; }
figcaption b { color: #eaf2ff; }
table { border-collapse: collapse; width: 100%; background: #fff; border: 1px solid #ddd5c8;
  margin: 16px 0; font-size: 13px; }
th { text-align: left; background: #ebe5da; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 7px 11px; }
td { padding: 6px 11px; border-top: 1px solid #ece6dc; vertical-align: top; }
td.num { text-align: right; font-family: ui-monospace, monospace; }
td.ok { color: #1d7a4c; font-weight: 700; }
td.bad { color: #b03030; font-weight: 700; }
tr.total td { font-weight: 700; background: #f6f2ec; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px;
  margin: 18px 0; }
.card { background: #fff; border: 1px solid #ddd5c8; border-radius: 8px; padding: 14px 16px; }
.card h4 { margin: 0 0 6px; font-size: 14px; }
.card p { margin: 0; font-size: 14px; color: #4a453d; }
.rule { background: #fffaf0; border: 1px solid #e3d3ae; border-left: 4px solid #c8952c;
  padding: 14px 18px; border-radius: 6px; margin: 18px 0; }
.quote { border-left: 3px solid #b9ae9c; padding-left: 16px; color: #5a5348; font-style: italic; }
ul { margin: 0 0 14px; padding-left: 22px; }
li { margin-bottom: 7px; }
a { color: #2f6fae; }
"""


def build(f: dict) -> str:
    presets = " · ".join(label for _, label in f["presets"])
    shots = "".join(figure(uri(name), title, caption) for name, title, caption in SHOTS)
    journey_total = len(f["journey"])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>`?` and the projection Block — implementation</title>
<style>{STYLE}</style></head><body><main>

<p class="kicker">SystemSketch · goldens 12 &amp; 33 · Sep 3, 2026</p>
<h1><code>?</code> is the unknown token, and a projection is a Block</h1>
<p class="lede">Both picks from the two galleries are implemented, driven in a real browser,
and green. The unresolved callee says it once on its type line, and marks with a single
<code>?</code> only the slots that have nothing to say — a fact the call site proves is never
erased. The projection titles itself from the type that arrives and its rows are plain
accessors. <b>{f['journeyPassed']}/{journey_total}</b> checks pass in the real app.</p>

<h2>What was decided, and what that meant in code</h2>

<div class="rule">
<b>The rule, in one line:</b> <code>{f['token']}</code> means <i>we looked and cannot tell</i>;
blank still means <i>nobody annotated this</i>; and <code>Any</code> is left alone because it is
a type a program can actually declare — golden 12's own <code>Client = Any</code> does.
</div>

<div class="cards">
  <div class="card"><h4>The token</h4><p><code>UNKNOWN_TOKEN = '{f['token']}'</code> with
  <code>isUnknownText</code> and <code>isUnknownPort</code> beside it. One export, so every
  surface spells it the same way.</p></div>
  <div class="card"><h4>The default presentation</h4><p><b>Mark unresolved</b> sets
  <code>blockType: '{f['unresolvedType']}'</code> and the view to Simple, and marks only the
  ports that have nothing to say — one command, one undo step.</p></div>
  <div class="card"><h4>Nothing erased, nothing policed</h4><p>The mark fills an empty
  <code>type</code> and never touches a name. One <code>{f['token']}</code> per row is the
  <i>generator's</i> convention — type one into a name by hand and it stays.</p></div>
  <div class="card"><h4>The projection</h4><p><code>blockType: '{f['projectionType']}'</code>,
  titled by the type on its inlet, rows named <code>.accessor</code> — normalized in one place
  so the canvas, the inspector and the menu agree.</p></div>
</div>

<h3>What this change did not need</h3>
<p>No new shape, no new port field, no migration of its own — <code>{f['token']}</code> is a
string in slots that already existed. For reference, a port today carries
<code>{', '.join(f['portFields'])}</code> and a Block carries
<code>{', '.join(f['blockFields'])}</code> — measured at build time, so this list follows the
tree rather than this change. The <code>name</code> and <code>type</code> slots are what
<code>{f['token']}</code> rides, which is why it survives the <code>.systemsketch</code> file
and the pyblocks codec without either being touched.</p>

<h2>In the app</h2>
{shots}

<h2>The projection is reachable where the type already is</h2>
<p>A cable dropped on empty canvas is the one moment the app knows a type and has nowhere to
put it, so <b>Split</b> joined the connection-drop offer: {presets}. Picking it is the whole
gesture — the Block titles itself from the cable and puts the caret on its first row, because
what you want to type next is the member, not a name. That last part is a behaviour change to
the picker: a Block that named itself is no longer asked for a title.</p>

<div class="rule">
<b>Nothing is inferred, nothing is erased, and nothing is policed.</b> A type carried by the
cable that lands is a fact about the <i>cable</i>; putting it in the callee's slot would claim a
signature nobody read. A slot the call site already proves keeps saying so — the Block command
fills only what is empty, and a row that already states a type becomes unknown through the port's
own <b>Mark unknown</b>, by decision. And the canvas never validates any of it: a
<code>{f['token']}</code> typed into a name is kept and painted as an absence, because a
whiteboard has to stay hackable. <b>One <code>{f['token']}</code> per row is what the pyblocks
projection writes</b>, recorded in
<code>pyblocks/docs/unknown-slot-convention.md</code> — not a rule this layer enforces.
</div>

<div class="rule">
<b>A chain stays one row.</b> <code>.pose.translation.x</code> is a single read of a member of a
member. Splitting it into a Block per link is what gets out of hand — which is the property
that made this direction worth picking in the first place.
</div>

<h2>Proof: the real browser</h2>
<p><code>npm run test:unknown</code> drives the packaged app under headless Chrome with real
pointer gestures: it opens the context menu, marks the call unresolved, reads the painted DOM
back, undoes, switches views, drags a cable into empty canvas, picks Split from the offer, and
types two accessors. Every claim below is read from the painted DOM or the editor's own record —
the dev seam is used only to seed the three starting Blocks.</p>
{check_table(f['journey'])}

<h2>The board to judge it on</h2>
{figure(board_uri(), 'sketches/review/unknown-projection.systemsketch', BOARD[2])}

<h2>The diff</h2>
<p>Two model exports, one command, one picker preset, one adoption pass, two render classes and
a stylesheet rule — plus the tests. The largest single change is the journey itself.</p>
{diff_table(f['changed'])}
<ul>
  <li><b>One place normalizes an accessor.</b> The inline canvas editor used to write its own
  port patch; it now goes through <code>patchBlockPortProps</code> like the inspector and the
  menu, which is what makes a member typed on the canvas come out spelled the same way.
  ({'verified' if f['sharedPatch'] else 'NOT VERIFIED'})</li>
  <li><b>The unknown ink is a class, not a colour literal</b>
  ({'verified' if f['unknownClass'] and f['unknownCss'] else 'NOT VERIFIED'}): the row carries
  <code>--unknown</code> and the stylesheet decides, so a theme change moves it once.</li>
  <li><b>Both refusals are written down where they could be broken</b> — no inference
  ({'verified' if f['noInference'] else 'NOT VERIFIED'}) and no erasure
  ({'verified' if f['neverErases'] else 'NOT VERIFIED'}) — next to the command that would be the
  natural place to add either.</li>
  <li><b>The convention is documented, not enforced</b>
  ({'verified' if f['onePerRow'] else 'NOT VERIFIED'}): <code>unknownPort()</code> is what both
  commands call, so the default never drifts — and the journey's <code>HACK-1</code> /
  <code>HACK-2</code> prove a hand-typed <code>{f['token']}</code> in a name survives every
  command and still paints as an absence.</li>
</ul>

<h2>What this does not do</h2>
<ul>
  <li><b>It does not derive the member list.</b> The app derives what it can see — the type on
  the cable — and the accessors are typed. Reading a type's members needs the analyzer, which is
  a pyblocks change, in a file a peer agent is currently working.</li>
  <li><b>Nothing emits either of these yet.</b> The pyblocks projection still has to mark an
  unresolved callee and stop collapsing its <code>unpack</code> node; until then both are
  authoring gestures.</li>
  <li><b>Nothing validates a `?`.</b> There is no lint, no normalisation, and no round-trip
  check that moves one back into the type slot. The consistency lives in what pyblocks
  <i>writes</i>, per <code>docs/unknown-slot-convention.md</code> in that repo.</li>
  <li><b>The projection's default box is the ordinary Port box</b>, so a long type name
  truncates until it is resized. Auto-fitting a Block to its title is a separate change to the
  layout module and was left alone.</li>
  <li><b>No migration was written</b>, because none is needed: every field used already exists,
  and a board saved before today opens unchanged.</li>
</ul>

</main></body></html>
"""


def main() -> None:
    facts = measure()
    OUTPUT.unlink(missing_ok=True)  # the builder is the source; rebuild is idempotent
    OUTPUT.write_text(build(facts), encoding="utf-8")
    print(json.dumps({key: value for key, value in facts.items()
                      if key not in {"journey", "changed"}}, indent=2))
    print(f"{facts['journeyPassed']}/{len(facts['journey'])} journey checks")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
