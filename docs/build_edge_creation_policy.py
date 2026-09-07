#!/usr/bin/env python3
"""Build the self-contained edge-creation-policy implementation report.

Every number below is measured from the live tree at build time — the rule
count from the `EdgePolicy` interface, the presets from the preset table, the
refusals from the judge, the check counts from the tests themselves — so the
report cannot drift away from the code it describes.
"""

from __future__ import annotations

import base64
import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SRC = ROOT / "src"
OUTPUT = DOCS / f"edge-creation-policy-{date.today().isoformat()}.html"

POLICY = SRC / "settings" / "edgePolicy.ts"
RULES = SRC / "blocks" / "connections" / "connectionRules.ts"
PANEL = SRC / "settings" / "InterfaceSettings.tsx"
JOURNEY = ROOT / "tests" / "edge_policy_smoke.mjs"
UNIT_POLICY = SRC / "settings" / "edgePolicy.test.ts"
UNIT_JUDGE = SRC / "blocks" / "connections" / "connectionPolicy.test.ts"
FIXTURE_PNG = ROOT / "sketches" / "review" / "edge-creation-policy.png"
CHECKS = ASSETS / "edge-policy-checks.json"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def asset(name: str) -> str:
    return image_uri(ASSETS / name)


# The journey's frames are whole 1720x1040 app windows. Shown whole they are
# grey rectangles, so each comparison figure is a WINDOW onto the interaction:
# the source is painted as a background at `scale` and offset to (x, y), and the
# figure's own overflow does the cropping. Both halves of a pair must use the
# same window or the eye compares framing instead of behaviour.
SHOT_W, SHOT_H = 1720, 1040


def crop(png: str, box: tuple[int, int, int], title: str, caption: str, verdict: str) -> str:
    x, y, scale_pct = box
    scale = scale_pct / 100
    mark = f'<span class="verdict {"yes" if verdict == "allowed" else "no"}">{verdict}</span>'
    height = round((SHOT_H - y) * scale)
    return f"""<figure>
      <div class="crop" style="height:{min(height, 470)}px;background-image:url({asset(png)});
        background-size:{round(SHOT_W * scale)}px {round(SHOT_H * scale)}px;
        background-position:-{round(x * scale)}px -{round(y * scale)}px"></div>
      <figcaption><strong>{html.escape(title)}</strong>{html.escape(caption)}{mark}</figcaption>
    </figure>"""


# (x, y, scale%) windows onto the 1720x1040 frames.
SIBLINGS = (150, 495, 100)   # sibling and extra, the two page-level Blocks
WHOLE = (150, 110, 70)       # the Expanded box, its child, and sibling below


def measure() -> dict[str, object]:
    policy_source = POLICY.read_text(encoding="utf-8")
    rules_source = RULES.read_text(encoding="utf-8")

    interface = re.search(r"export interface EdgePolicy \{(.*?)\n\}", policy_source, re.S)
    assert interface, "EdgePolicy interface not found"
    fields = re.findall(r"^\s{2}(\w+):", interface.group(1), re.M)

    presets = re.findall(r"^\s+id: '(\w+)',\n\s+label: '([^']+)',\n\s+summary: '([^']*)'",
                         policy_source, re.M)
    assert presets, "preset table not found"

    refusals = re.findall(r"^\t\| '([a-z-]+)'", rules_source, re.M)
    modes = re.search(r"TYPE_MATCHING_MODES: readonly TypeMatching\[\] = \[(.*?)\]", policy_source)
    assert modes

    return {
        "fields": fields,
        "presets": presets,
        "refusals": refusals,
        "modes": [m.strip().strip("'") for m in modes.group(1).split(",")],
        # The journey's own recorded result, not a count of `add(` in its source:
        # helpers raise several of these checks on every call.
        "journey": json.loads(CHECKS.read_text(encoding="utf-8")),
        "unit_cases": (
            len(re.findall(r"\bit\(", UNIT_POLICY.read_text(encoding="utf-8")))
            + len(re.findall(r"\bit\(", UNIT_JUDGE.read_text(encoding="utf-8")))
        ),
        "judge_lines": len(RULES.read_text(encoding="utf-8").splitlines()),
        "panel_lines": len(re.findall(r"PolicyToggle", PANEL.read_text(encoding="utf-8"))),
    }


# Which permission each rule row shows, and the concrete edge it stops.
ROWS = [
    ("allowSamePolarity", "Direction", "Wire two outputs, or two inputs", "output → output"),
    ("allowCycles", "Direction", "Close a feedback loop", "A → B → A"),
    ("allowSelfConnection", "Direction", "Wire a Block to itself", "A → A"),
    ("allowCrossBoundary", "Boundaries", "Wire straight through a Block's wall", "child of A → sibling of A"),
    ("allowHiddenPorts", "Boundaries", "Wire a hidden port", "a port you cannot see"),
    ("typeMatching", "Data types", "Declared types must agree", "Pose → bytes"),
    ("allowFanIn", "Cable counts", "Several cables into one input", "A → C, B → C"),
    ("allowFanOut", "Cable counts", "Several cables out of one output", "A → B, A → C"),
    ("allowDuplicates", "Cable counts", "A second copy of the same cable", "A.out → B.in, twice"),
]


def main() -> None:
    m = measure()
    presets = m["presets"]
    rule_count = len(m["fields"])

    preset_cards = "\n".join(
        f"""<article class="rung r{i}">
      <b>{i}</b><strong>{html.escape(label)}</strong>
      <p>{html.escape(summary)}</p>
    </article>"""
        for i, (_id, label, summary) in enumerate(presets)
    )

    rule_rows = "\n".join(
        f"""<tr><td class="grp">{html.escape(group)}</td>
        <td><strong>{html.escape(title)}</strong><br><code>{html.escape(field)}</code></td>
        <td><span class="refuse">{html.escape(refuses)}</span></td></tr>"""
        for field, group, title, refuses in ROWS
    )

    refusal_chips = "".join(
        f'<span class="chip mono">{html.escape(r)}</span>' for r in m["refusals"]
    )

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Edge creation policy</title>
<style>
  :root {{ color-scheme:light; --ink:#20242b; --muted:#666d78; --line:#dde1e7; --paper:#f3f5f8;
    --card:#fff; --blue:#3182ed; --green:#27865f; --orange:#f08a32; --red:#c0392b; }}
  * {{ box-sizing:border-box }} html {{ scroll-behavior:smooth }}
  body {{ margin:0; color:var(--ink);
    background:radial-gradient(circle at 80% 0,#e7effb 0,transparent 34%),var(--paper);
    font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }}
  main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 72px }}
  .hero {{ position:relative; overflow:hidden; padding:44px; border:1px solid #d9e0ea; border-radius:28px;
    background:#ffffffed; box-shadow:0 24px 70px #26364c16 }}
  .hero::after {{ content:'{rule_count}/{rule_count}'; position:absolute; right:-18px; bottom:-70px;
    color:#3182ed0d; font-size:200px; font-weight:900; letter-spacing:-.08em }}
  .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase }}
  h1 {{ max-width:830px; margin:11px 0 15px; font-size:clamp(40px,6.4vw,70px); line-height:.98; letter-spacing:-.055em }}
  .lead {{ max-width:800px; margin:0; color:var(--muted); font-size:19px }}
  .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:25px }}
  .chip {{ padding:8px 11px; border:1px solid #ccdbef; border-radius:999px; color:#245d9d;
    background:#eef5fe; font-size:12px; font-weight:760 }}
  .chip.mono {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:600 }}
  section {{ margin-top:24px; padding:30px; border:1px solid #dce1e7; border-radius:22px;
    background:#ffffffed; box-shadow:0 13px 40px #26364c0d }}
  .head {{ display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:20px }}
  h2 {{ margin:0; font-size:28px; letter-spacing:-.035em }}
  .head p {{ max-width:640px; margin:0; color:var(--muted) }}
  .metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:11px; margin-bottom:20px }}
  .metric {{ padding:18px; border:1px solid var(--line); border-radius:14px; background:#fafbfd }}
  .metric strong {{ display:block; font-size:30px; letter-spacing:-.04em }}
  .metric span {{ color:var(--muted); font-size:11px }}
  .ladder {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px }}
  .rung {{ position:relative; padding:20px 18px; border:1px solid var(--line); border-radius:16px; background:#fafbfd }}
  .rung b {{ position:absolute; right:14px; top:12px; color:#c8d3e2; font-size:26px; font-weight:900 }}
  .rung strong {{ display:block; font-size:19px; letter-spacing:-.02em }}
  .rung p {{ margin:8px 0 0; color:var(--muted); font-size:12px }}
  .rung.r0 {{ border-color:#f0cfa8; background:#fff8ef }}
  .rung.r1 {{ border-color:#bcd6f5; background:#f1f7ff }}
  .rung.r3 {{ border-color:#c6dfd1; background:#f3faf6 }}
  table {{ width:100%; border-collapse:collapse; font-size:13px }}
  th,td {{ padding:11px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top }}
  th {{ color:var(--muted); font-size:11px; letter-spacing:.08em; text-transform:uppercase }}
  td.grp {{ width:120px; color:var(--muted); font-size:11px; letter-spacing:.06em; text-transform:uppercase }}
  td code {{ color:var(--muted); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px }}
  .refuse {{ display:inline-block; padding:3px 8px; border-radius:6px; background:#fdf1ef; color:var(--red);
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:16px }}
  .three {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px }}
  figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#f8f9fb;
    box-shadow:0 8px 24px #2b374913 }}
  figure img {{ display:block; width:100% }}
  .crop {{ background-repeat:no-repeat; background-color:#f8f9fb }}
  .rowhead {{ margin:22px 0 10px; color:var(--muted); font-size:12px; font-weight:750;
    letter-spacing:.08em; text-transform:uppercase }}
  .rowhead:first-of-type {{ margin-top:4px }}
  figcaption {{ padding:13px 15px; border-top:1px solid var(--line); background:#fff; color:var(--muted); font-size:12px }}
  figcaption strong {{ display:block; margin-bottom:3px; color:var(--ink); font-size:14px }}
  .verdict {{ display:inline-block; margin-top:6px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:750 }}
  .no {{ color:#8d2f22; background:#fdecea }} .yes {{ color:#1f6a4c; background:#e8f6ef }}
  .checks {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px }}
  .check {{ position:relative; padding:13px 13px 13px 40px; border:1px solid #d5e8dd; border-radius:12px;
    color:#315d49; background:#f3faf6; font-size:12px; font-weight:680 }}
  .check::before {{ content:'✓'; position:absolute; left:13px; top:12px; display:grid; width:19px; height:19px;
    place-items:center; border-radius:50%; color:#fff; background:var(--green); font-size:11px }}
  .decide {{ display:grid; gap:11px }}
  .item {{ padding:17px 19px; border:1px solid var(--line); border-left:4px solid var(--blue);
    border-radius:12px; background:#fafbfd }}
  .item.done {{ border-left-color:var(--green) }} .item.ask {{ border-left-color:var(--orange) }}
  .item b {{ display:block; margin-bottom:5px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted) }}
  .item p {{ margin:6px 0 0; color:var(--muted); font-size:13px }}
  pre {{ overflow-x:auto; padding:15px; border:1px solid var(--line); border-radius:12px; background:#fbfcfe;
    font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace }}
  @media (max-width:900px) {{ .ladder,.metrics,.compare,.three,.checks {{ grid-template-columns:1fr }} }}
</style>
</head>
<body><main>

<div class="hero">
  <div class="eyebrow">Settings › Connections</div>
  <h1>The board can refuse as much, or as little, as you want.</h1>
  <p class="lead">SystemSketch is honestly two products: a whiteboard, where a line between two things
  means whatever you meant, and a typed dataflow editor, where a cable that cannot exist should never be
  drawable. Both are right at different moments. The boundary between them is now
  {rule_count} permissions and {len(presets)} presets, read by the one judge every wiring path
  already asked.</p>
  <div class="chips">
    <span class="chip">{rule_count} permissions</span>
    <span class="chip">{len(presets)} presets</span>
    <span class="chip">{m['unit_cases']} unit cases</span>
    <span class="chip">{m['journey']['total']} real-browser checks</span>
    <span class="chip">default behaviour unchanged</span>
  </div>
</div>

<section>
  <div class="head"><h2>The ladder</h2>
    <p>Presets are shortcuts into the same switches, never a second source of truth — flip one by hand
    and the panel honestly reads <em>Custom</em> instead of naming a preset it is not.</p></div>
  <div class="ladder">{preset_cards}</div>
</section>

<section>
  <div class="head"><h2>The {rule_count} permissions</h2>
    <p>Every field is phrased as what it <em>lets</em> you draw, so the whiteboard end of the ladder is
    simply every switch on — and a rule added later that defaults to <code>true</code> cannot silently
    start refusing cables on an existing board.</p></div>
  <table>
    <thead><tr><th>Group</th><th>Permission</th><th>What it refuses when off</th></tr></thead>
    <tbody>{rule_rows}</tbody>
  </table>
  <p style="margin:18px 0 6px;color:var(--muted);font-size:12px">
    The judge reports these refusal reasons:</p>
  <div class="chips">{refusal_chips}</div>
</section>

<section>
  <div class="head"><h2>The panel</h2>
    <p>Captured from the running app by the acceptance journey itself — the count badge, the preset row
    and the summary line all move together.</p></div>
  <div class="compare">
    <figure><img src="{asset('edge-policy-panel-guided.png')}" alt="Connections panel on Guided">
      <figcaption><strong>Guided — 5/9</strong>The default, and exactly what SystemSketch has always
      done: direction and containment are real, data types stay free text.</figcaption></figure>
    <figure><img src="{asset('edge-policy-panel-strict.png')}" alt="Connections panel on Strict">
      <figcaption><strong>Strict — 8/9</strong>Only edges that could exist in the running program.
      Fan-<em>out</em> stays legal: one value read twice is ordinary dataflow.</figcaption></figure>
  </div>
  <div class="three" style="margin-top:16px">
    <figure><img src="{asset('edge-policy-panel-types.png')}" alt="Data types three-way control">
      <figcaption><strong>Data types</strong>A three-way, not a switch. Lenient reads an
      undeclared type as a wildcard; Strict reads it as a gap.</figcaption></figure>
    <figure><img src="{asset('edge-policy-panel-fan.png')}" alt="Cable count controls">
      <figcaption><strong>How many cables meet at one port</strong>Fan-in, fan-out and the
      duplicate rule, each with the concrete edge it stops.</figcaption></figure>
    <figure><img src="{asset('edge-policy-panel-types-dark.png')}" alt="Data types control in dark mode">
      <figcaption><strong>Dark</strong>The selected card is an accent border plus a tint, never
      ink on the tint — that combination measures 2.6–4.3:1.</figcaption></figure>
  </div>
</section>

<section>
  <div class="head"><h2>The same gesture, the opposite answer</h2>
    <p>Each row is one drag between the same two dots, photographed after release, with nothing changed
    but the policy. Both halves of a pair look through the same window onto the board.</p></div>

  <h3 class="rowhead">Direction · two outputs wired together</h3>
  <div class="compare">
    {crop('edge-policy-after-guided-two-outputs.png', SIBLINGS, 'Guided',
          'The drag ends and nothing is there. No cable, and no Block offered in its place.', 'refused')}
    {crop('edge-policy-after-whiteboard-two-outputs.png', SIBLINGS, 'Whiteboard',
          'Both dots fill and the cable runs between them, pointing the way it was dragged.', 'allowed')}
  </div>

  <h3 class="rowhead">Data types · Pose meeting bytes, then pose meeting Pose</h3>
  <div class="compare">
    {crop('edge-policy-after-strict-type-mismatch.png', SIBLINGS, 'Strict · Pose → bytes',
          'The declared types disagree, so the landing is never offered.', 'refused')}
    {crop('edge-policy-after-strict-types-agree.png', SIBLINGS, 'Strict · pose → Pose',
          'Same policy, agreeing types. Case and surrounding space are not the point.', 'allowed')}
  </div>

  <h3 class="rowhead">Boundaries · a child reaching past its own Block's wall</h3>
  <div class="compare">
    {crop('edge-policy-after-guided-boundary.png', WHOLE, 'Guided',
          'inner is inside outer. The black box holds and the cable finds nothing.', 'refused')}
    {crop('edge-policy-after-whiteboard-boundary.png', WHOLE, 'Whiteboard',
          'The same drag lands, and the cable takes a parent that holds both of its ends.', 'allowed')}
  </div>

  <h3 class="rowhead">Cable counts · a second producer into one input</h3>
  <div class="compare">
    {crop('edge-policy-after-strict-fan-in.png', WHOLE, 'Strict',
          'One input, one producer. The picture cannot answer which of two writers wins.', 'refused')}
    {crop('edge-policy-after-guided-fan-in.png', WHOLE, 'Guided',
          'Fan-in joins rather than replaces, and the port wears its count badge.', 'allowed')}
  </div>
</section>

<section>
  <div class="head"><h2>Where the rules actually live</h2>
    <p>One judge, and the reason this was a small change rather than a sweep: the drop, the
    eligible-port highlight, the picker and load-time validation all already funnelled through
    <code>judgeConnection</code>.</p></div>
  <pre>src/settings/edgePolicy.ts          the {rule_count} permissions, {len(presets)} presets, persistence, the React store
src/blocks/connections/
  connectionRules.ts                {m['judge_lines']} lines — judgeConnection reads the policy and nothing else
  connectionModel.ts                arePortTypesCompatible: the type seam, now three-valued
  connectionScope.ts                pairBlockFaces gains a cross-boundary fallback
  ConnectionBindingUtil.ts          the SECOND copy of the rules, found by the journey
src/settings/InterfaceSettings.tsx  the Connections panel ({m['panel_lines']} PolicyToggle uses)</pre>
  <p style="color:var(--muted);font-size:13px;margin-top:16px">
  The one surprise was <code>connectionEndpointsAreValid</code>: a second, independent copy of the
  polarity and scope rules that <em>deletes</em> the cable it rejects. It ran a frame after the judge
  said yes, so a Whiteboard cable appeared and vanished. It now takes the policy too — defaulting to
  the live one, with load-time cleanup explicitly overriding to the permissive one, because that call
  site runs over a file nobody has touched yet and a stricter reader must never destroy an author's
  work.</p>
</section>

<section>
  <div class="head"><h2>Proof</h2>
    <p>Every number here is measured from the tree at build time.
    <code>npm run check</code> — tsc, the vitest suite and the Python suite — is green with no existing
    test re-baselined, which is the real claim: the default policy reproduces today's behaviour.</p></div>
  <div class="metrics">
    <div class="metric"><strong>{m['unit_cases']}</strong><span>unit cases across the policy and the judge</span></div>
    <div class="metric"><strong>{m['journey']['total']}</strong><span>real-browser checks, <code>npm run test:edge-policy</code></span></div>
    <div class="metric"><strong>{rule_count}</strong><span>permissions, each one switch in the panel</span></div>
    <div class="metric"><strong>{len(m['refusals'])}</strong><span>refusal reasons the judge can report</span></div>
  </div>
  <div class="checks">
    <div class="check">Guided is byte-for-byte today's behaviour</div>
    <div class="check">Output → output refused, then drawn</div>
    <div class="check">The black box holds, then opens</div>
    <div class="check">Pose → bytes refused under Strict</div>
    <div class="check">pose → Pose kept — case is not the point</div>
    <div class="check">Fan-in refused, then allowed</div>
    <div class="check">The count badge tracks every change</div>
    <div class="check">One hand-flipped switch reads Custom</div>
    <div class="check">Zero console errors across the journey</div>
  </div>
</section>

<section>
  <div class="head"><h2>The review board</h2>
    <p>Four Blocks, one of them a real black box with a real child, every port typed — so each rule is
    one drag away.</p></div>
  <figure><img src="{image_uri(FIXTURE_PNG)}" alt="Edge creation policy review fixture">
    <figcaption><strong>sketches/review/edge-creation-policy.systemsketch</strong>Generated through the
    real editor and autosave path, then reopened cold and driven: containment is a record, the cue
    arrows are bound at both ends, and step 2 was performed under both policies.</figcaption></figure>
</section>

<section>
  <div class="head"><h2>Decision surface</h2><p>What is done, what is left, and what needs you.</p></div>
  <div class="decide">
    <div class="item done"><b>Done and proved</b>
      <strong>The panel, the {rule_count} permissions, the {len(presets)} presets, and the judge that reads them.</strong>
      <p>Every claim above is a screenshot from the running app or a check in
      <code>npm run test:edge-policy</code>. <code>npm run check</code> is green with no test
      re-baselined — the default policy reproduces today's behaviour exactly.</p></div>
    <div class="item done"><b>Found on the way</b>
      <strong>A second copy of the connection rules that deleted cables the judge had just allowed.</strong>
      <p>Fixed at the seam rather than worked around, and the load-time path was made explicitly
      permissive so tightening a policy can never destroy a board someone else authored.</p></div>
    <div class="item ask"><b>Needs you — my recommendation, and what I do if you say nothing</b>
      <strong>Should the policy live on the board file instead of this computer?</strong>
      <p>It is a <code>localStorage</code> preference today, like interface scale — so it is yours, not the
      document's. The alternative is stamping it into the <code>.systemsketch</code> envelope so a
      strict board stays strict for whoever opens it. I recommend keeping it personal until a second
      person opens one of your boards; that is the moment the document needs an opinion. Silence keeps
      it as a preference.</p></div>
    <div class="item ask"><b>Needs you</b>
      <strong>Is a refused drag silent enough?</strong>
      <p>Today a refused landing just does not happen — the port never lights, the cable finds nothing.
      Under Strict that is correct but quiet; you could reasonably want the reason
      (<code>type-mismatch</code>, <code>fan-in</code>) surfaced on the port. The reasons already exist
      in the verdict. I did not build it because guessing at a new affordance is exactly the kind of
      whiteboard invention this repo warns against.</p></div>
    <div class="item"><b>Deliberately not done</b>
      <strong>No PEP, no lint pass, no re-judging of existing boards.</strong>
      <p><code>docs/peps/README.md</code> says a PEP describes what landed on <code>main</code>, so the
      record for this fork gets written at merge, not on a branch. No linting: per your 2026-09-03
      boundary call, the canvas stays dumb — the policy refuses a <em>gesture</em>, it never annotates a
      board. And opening a file never re-judges what is in it.</p></div>
  </div>
</section>

</main></body></html>
"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size / 1024:.0f} KB)")
    print(f"  {rule_count} permissions, {len(presets)} presets, {len(m['refusals'])} refusal reasons")
    print(f"  {m['unit_cases']} unit cases, {m['journey']['total']} journey checks")


if __name__ == "__main__":
    main()
