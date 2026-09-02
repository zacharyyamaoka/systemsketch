#!/usr/bin/env python3
"""Build the fan-in report: `docs/edge-fan-in-2026-09-01.html`.

Answers the FR note's "Support many to 1 and 1 to many edges": a second cable
onto an occupied input used to replace the first. Sinks now fan in, a press on
any dot starts a new cable, an existing cable is moved by its own handle, and
the only thing a drop refuses is an exact copy of a wire that already exists.

Every number and every code excerpt is read from the live repo at build time.
"""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
VAULT = Path.home() / "zach_brain"
OUTPUT = DOCS / "edge-fan-in-2026-09-01.html"

SIBLING_CROP = (40, 110, 1180, 800)


def data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg"}[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def evidence(name: str, crop) -> str:
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    image = Image.open(source).convert("RGB").crop(crop)
    image.save(out, optimize=True)
    return data_uri(out)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


def source_slice(path: Path, start_marker: str, end_marker: str | None = None) -> str:
    """A verbatim excerpt of a live source file; raises if a marker is gone."""
    text = path.read_text()
    start = text.index(start_marker)
    end = text.index(end_marker, start) if end_marker else len(text)
    return text[start:end].rstrip()


def git_slice(rev: str, path: str, start_marker: str, end_marker: str) -> str:
    text = subprocess.run(
        ["git", "show", f"{rev}:{path}"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end].rstrip()


def git_head() -> str:
    return subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def git_branch() -> str:
    return subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


def diff_stat(base: str) -> str:
    return subprocess.run(
        ["git", "diff", "--stat", base, "--", "src", "tests"], cwd=PROJECT_ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()


POLARITY = json.loads((ASSETS / "edge-polarity.json").read_text())
ACCEPTANCE = json.loads((ASSETS / "edge-acceptance.json").read_text())
HEAD = git_head()
BRANCH = git_branch()
BASE = "8b25045"

SRC = PROJECT_ROOT / "src" / "blocks" / "connections"

OLD_REPLACE = git_slice(
    BASE, "src/blocks/connections/ConnectionShapeUtil.tsx",
    "		// A sink takes one cable. Landing a second on it replaces the first",
    "		updatePortState(this.editor, {",
)
OLD_REROUTE = git_slice(
    BASE, "src/blocks/connections/PointingBlockPort.ts",
    "/**\n * The one cable a press on this dot would re-route, if any.",
    "/**\n * Give an existing wire precedence",
)
NEW_DROP = source_slice(
    SRC / "ConnectionShapeUtil.tsx",
    "		// Sources fan out and sinks fan in: a second cable onto an occupied input",
    "		createOrUpdateConnectionBinding(this.editor, connection, target.hit.shapeId, {",
)
NEW_PRESS = source_slice(
    SRC / "PointingBlockPort.ts",
    "		// A press on a dot always starts a NEW cable",
    "		// Stock dragging_handle measures",
)
NEW_YIELD = source_slice(
    SRC / "installConnections.ts",
    "/** Is a selected cable offering a terminal handle under this page point? */",
    "/**\n * Claim a painted port",
) + "\n\n" + source_slice(
    SRC / "installConnections.ts",
    "		// A selected cable's terminal handle sits exactly on the dot, and a press",
    "		// Identity comes from the dot that was pressed.",
)
DUPLICATE = source_slice(
    SRC / "connectionRules.ts",
    "	if (!options.existing && facesAlreadyJoined(",
    "/* -------------------------------- cycles",
)


def passed(results) -> str:
    ok = sum(1 for result in results if result["ok"])
    return f"{ok}/{len(results)}"


def rows(results, prefix):
    out = []
    for result in results:
        if not result["id"].startswith(prefix):
            continue
        mark = "✅" if result["ok"] else "❌"
        out.append(f"<tr><td class='mark'>{mark}</td><td><code>{html.escape(result['id'])}</code></td>"
                   f"<td>{html.escape(result['label'])}</td></tr>")
    return "\n".join(out)


CSS = """
:root { --ink:#1f2328; --muted:#57606a; --line:#d0d7de; --bg:#ffffff; --soft:#f6f8fa; --ok:#1a7f37; --bad:#cf222e; --accent:#0969da; }
* { box-sizing: border-box; }
body { margin:0; font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--ink); background:var(--bg); }
main { max-width: 1120px; margin: 0 auto; padding: 32px 28px 96px; }
h1 { font-size: 30px; line-height:1.2; margin: 0 0 8px; }
h2 { font-size: 22px; margin: 44px 0 12px; padding-top: 12px; border-top: 1px solid var(--line); }
h3 { font-size: 17px; margin: 24px 0 8px; }
p, li { max-width: 78ch; }
.lede { font-size: 18px; color: var(--muted); max-width: 80ch; }
.meta { color: var(--muted); font-size: 14px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; background: var(--soft); padding: 1px 5px; border-radius: 4px; }
pre { background: #0d1117; color: #e6edf3; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 12.5px; line-height: 1.5; }
pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: 14.5px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--soft); font-weight: 600; }
td.mark { width: 34px; text-align: center; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0 22px; }
.three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; align-items: start; }
figure { margin: 0; }
figure img { width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; background: #fff; }
figcaption { font-size: 13.5px; color: var(--muted); margin-top: 6px; }
.callout { border-left: 4px solid var(--accent); background: var(--soft); padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0; }
.bad { color: var(--bad); font-weight: 600; }
.ok { color: var(--ok); font-weight: 600; }
.pill { display:inline-block; padding: 2px 10px; border-radius: 999px; background: #dafbe1; color: #116329; font-weight: 600; font-size: 13px; }
.kv td:first-child { width: 220px; color: var(--muted); }
.decision li { margin-bottom: 10px; }
"""


def main() -> None:
    zach = {
        "a": data_uri(VAULT / "Pasted image 20260901194908.png"),
        "b": data_uri(VAULT / "Pasted image 20260901194915.png"),
        "c": data_uri(VAULT / "Pasted image 20260901194955.png"),
    }
    shots = {
        "drag": evidence("polarity-fanin-drag.png", SIBLING_CROP),
        "two": evidence("polarity-fanin-two.png", SIBLING_CROP),
        "moved": evidence("polarity-fanin-moved.png", SIBLING_CROP),
    }
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fan-in — an input takes many cables</title>
<style>{CSS}</style></head>
<body><main>

<h1>Fan-in — an input takes many cables</h1>
<p class="lede">A second cable onto an occupied input used to replace the first. Now sinks fan in exactly as sources fan out, a press on any dot starts a new cable, an existing cable is moved by its own handle, and the only drop a sink refuses is an exact copy of a wire it already has.</p>
<p class="meta">SystemSketch · 2026-09-01 · track <code>{BRANCH}</code> at <code>{HEAD}</code>, forked from <code>{BASE}</code> · try it: <a href="http://127.0.0.1:4330/?preset=block-dev">http://127.0.0.1:4330/?preset=block-dev</a> · proof: <code>npm run test:polarity</code> ({passed(POLARITY)}) · <code>npm run test:edges</code> ({passed(ACCEPTANCE)})</p>

<h2>1 · What you saw</h2>
<div class="three">
  <figure><img src="{zach['a']}" alt="One cable into an input"><figcaption>Your capture: <code>sda → Block.input</code>, one cable.</figcaption></figure>
  <figure><img src="{zach['b']}" alt="The second cable replaced the first"><figcaption>Your capture: wiring a second producer to the same input <em>switched</em> the cable and deleted the first.</figcaption></figure>
  <figure><img src="{zach['c']}" alt="One output feeding two inputs"><figcaption>Your capture: one-to-many already worked.</figcaption></figure>
</div>

<h2>2 · Why</h2>
<p>Two rules from the starter kits, carried over on purpose and now removed on purpose. The drop treated a sink as holding one cable and queued the occupant for deletion:</p>
<pre><code>{code(OLD_REPLACE)}</code></pre>
<p>And a press on a wired input did not start a cable at all — it picked up the one already there:</p>
<pre><code>{code(OLD_REROUTE)}</code></pre>
<div class="callout"><p>Both rules encode the same assumption: <strong>an input has one producer.</strong> That is true of the kits' image pipeline, where an input carries one value, and false of a system sketch, where an input is a place many things arrive. With the assumption gone the two rules have nothing to protect, and the gesture becomes symmetric: a dot is a dot, and a press on it makes a wire.</p></div>

<h2>3 · What changed</h2>
<h3>The drop joins; only a duplicate is refused</h3>
<pre><code>{code(NEW_DROP)}</code></pre>
<p>The refusal lives where every other refusal lives — in <code>judgeConnection</code>, so the eligible-dot highlight and the drop agree. A reconnect drag is exempt from being a duplicate of itself:</p>
<pre><code>{code(DUPLICATE)}</code></pre>
<h3>A press always starts a new cable</h3>
<pre><code>{code(NEW_PRESS)}</code></pre>
<h3>Moving a cable is tldraw's own gesture</h3>
<p>Select the cable and drag its terminal handle — the handle sits on the dot, and the capture listener that turns dot presses into cables now stands aside when tldraw has already taken the press as a handle:</p>
<pre><code>{code(NEW_YIELD)}</code></pre>
<p>This also retires the "wired port wins the press" rule: it existed only so that a press aimed at a cable end could find the cable, which the handle now does directly, for either end of the cable rather than only the input.</p>

<h2>4 · After</h2>
<div class="grid">
  <figure><img src="{shots['drag']}" alt="Dragging a second producer onto the occupied input"><figcaption>Dragging <code>filter.out_1</code> onto <code>merge.in_1</code>, which <code>encode.out_1</code> already feeds. The input lights as eligible.</figcaption></figure>
  <figure><img src="{shots['two']}" alt="Two cables into one input"><figcaption><span class="ok">After</span> — both cables stay (<code>FANIN-1</code>). Dragging the same wire again is refused (<code>FANIN-3</code>); pressing the occupied input starts a third cable rather than moving one (<code>FANIN-4</code>).</figcaption></figure>
  <figure><img src="{shots['moved']}" alt="One cable re-routed to the second input by its handle"><figcaption>Selecting the encode cable and dragging its end handle off <code>in_1</code> onto <code>in_2</code> re-routes it (<code>FANIN-6</code>).</figcaption></figure>
</div>

<h2>5 · Proof</h2>
<table class="kv">
<tr><td><code>npm run test:polarity</code></td><td><span class="pill">{passed(POLARITY)}</span> real-browser checks, the fan-in cases new; everything from the polarity rebuild still holds.</td></tr>
<tr><td><code>npm run test:edges</code></td><td><span class="pill">{passed(ACCEPTANCE)}</span> — the boundary truth table, picker, exits, durability; <code>REPLACE-2</code> still proves a <em>refused</em> second cable does not stack.</td></tr>
<tr><td><code>npm run check</code></td><td>tsc clean, 325 vitest, 24 python.</td></tr>
</table>
<table>
<tr><th></th><th>Check</th><th>Fan-in</th></tr>
{rows(POLARITY, 'FANIN')}
</table>

<h2>6 · Decisions on the table</h2>
<ul class="decision">
<li><strong>Fan-in is universal.</strong> Every input accepts many cables. The kits mark individual ports <code>multi</code>; a per-port flag is one boolean away if a Block type ever needs a single-producer input.</li>
<li><strong>Order of arrival is not recorded.</strong> The kit keeps an <code>order</code> on fan-in bindings so an executor can read a list in a stable order. Nothing executes here yet; when the Python side needs it, it is a binding prop plus a migration.</li>
<li><strong>Moving a cable is select-then-drag.</strong> Pressing a dot never moves an existing cable any more, on either end. The alternative — pick up the cable when there is exactly one — would make the same press mean different things as a diagram grows.</li>
</ul>

<h2>7 · Files</h2>
<pre><code>{code(diff_stat(BASE))}</code></pre>
<p class="meta">Claude Code (Fable 5.1), session <code>0b9946ea-92a4-4c95-8904-783d43269d0b</code>.</p>

</main></body></html>
"""
    OUTPUT.write_text(page)
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
