#!/usr/bin/env python3
"""
    Build the dated implementation report for document draft branching.

    The 2026-09-03 research report (document-draft-branching-2026-09-03.html)
    argued for the IcePanel Draft+Version model; this report records that model
    landing as a real, tested product surface — and then records what a real
    user session and two independent review passes found wrong with the first
    "finished" version, and how each break was closed. Structural numbers —
    module sizes, autosave guard points, journey check counts, the rename-guard
    window, the review-board callout texts — are measured from the live tree at
    build time so the report cannot drift from the code it describes. Test-run
    results are the dated outcomes of actual runs and say so.
"""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "draft-branching-2026-09-05.html"


def image_uri(path: Path) -> str:
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def esc(value: object) -> str:
    return html.escape(str(value))


def measure() -> dict:
    """Every structural claim in the report, read from the tree right now."""
    drafts_dir = ROOT / "src" / "drafts"
    drafts_files = sorted(p for p in drafts_dir.iterdir() if p.is_file())
    drafts_lines = sum(len(p.read_text(encoding="utf-8").splitlines()) for p in drafts_files)

    workspace_text = (ROOT / "src" / "workspace" / "LocalWorkspace.tsx").read_text(encoding="utf-8")
    # Guard points = reads of the hold flag; the single write is `= active`.
    hold_guards = workspace_text.count("draftHoldRef.current") - workspace_text.count(
        "draftHoldRef.current = "
    )

    chrome_text = (ROOT / "src" / "chrome" / "SystemSketchChrome.tsx").read_text(encoding="utf-8")
    chip_index = chrome_text.index("<DraftsControl />")
    breadcrumb_index = chrome_text.index("<DepthStackNavigator placement=\"menu\"")
    if chip_index >= breadcrumb_index:
        raise SystemExit("Drafts chip no longer renders left of the breadcrumb.")

    dialog_text = (ROOT / "src" / "compare" / "CompareDialog.tsx").read_text(encoding="utf-8")
    if "source?: CompareExplicitSource" not in dialog_text:
        raise SystemExit("CompareDialog's optional explicit source is gone.")
    # The review-and-apply pass rides the SAME dialog through a second optional
    # prop. If either the prop or the "no action = no bottom bar" branch goes,
    # the report's central claim (one dialog, not two) is stale.
    for required in ("action?: CompareAction", "action && !fullscreen"):
        if required not in dialog_text:
            raise SystemExit(f"CompareDialog no longer carries `{required}` — the action-mode story is stale.")
    dialog_lines = len(dialog_text.splitlines())

    table_text = (ROOT / "src" / "compare" / "PropertyTable.tsx").read_text(encoding="utf-8")
    if "review?: ElementReview" not in table_text:
        raise SystemExit("PropertyTable lost its optional per-element review prop.")

    # The correctness fixes this report describes must actually be in the tree.
    rebase_text = (ROOT / "src" / "drafts" / "draftRebase.ts").read_text(encoding="utf-8")
    for required in (
        "computeRebase", "danglingReferenceCount", "conflictCount",
        "fieldViewOf", "mergeRecordFields",  # the field-level three-way merge
    ):
        if required not in rebase_text:
            raise SystemExit(f"draftRebase.ts no longer defines {required}.")

    provider_text = (ROOT / "src" / "drafts" / "DraftProvider.tsx").read_text(encoding="utf-8")
    for required in ("readMainDrift", "'unreadable'", "hasUnpromotedEdits", "previewRebase"):
        if required not in provider_text:
            raise SystemExit(f"DraftProvider.tsx lost its {required} — the Merge guard story is stale.")

    bar_text = (ROOT / "src" / "drafts" / "DraftModeBar.tsx").read_text(encoding="utf-8")
    control_text = (ROOT / "src" / "drafts" / "DraftsControl.tsx").read_text(encoding="utf-8")
    if "disabled={!hasUnpromotedEdits}" not in bar_text:
        raise SystemExit("Merge/Rebase are no longer gated on hasUnpromotedEdits.")
    # The two-step confirm this report once celebrated has been superseded by
    # the review dialog. If an arming state comes back, the section below is a
    # lie about the current build.
    if "into Main?" in bar_text:
        raise SystemExit("DraftModeBar has an arming Merge label again — the review-flow section is stale.")
    guard_matches = {
        name: re.search(r"RENAME_MOUSEDOWN_GUARD_MS = (\d+)", text)
        for name, text in {"DraftModeBar.tsx": bar_text, "DraftsControl.tsx": control_text}.items()
    }
    for name, match in guard_matches.items():
        if not match:
            raise SystemExit(f"{name} lost its rename mousedown guard.")
    guard_values = {m.group(1) for m in guard_matches.values()}
    if len(guard_values) != 1:
        raise SystemExit("The two rename guards drifted apart.")
    guard_ms = int(guard_values.pop())

    projection_text = (ROOT / "src" / "behaviorTree" / "behaviorTreeProjection.ts").read_text(encoding="utf-8")
    if "projectedBlockDefaults" not in projection_text:
        raise SystemExit("behaviorTreeProjection.ts no longer strips the minted definitionId.")

    def journey_checks(name: str) -> int:
        return len(re.findall(r"\bpass\(", (ROOT / "tests" / name).read_text(encoding="utf-8")))

    rebase_unit_cases = len(re.findall(
        r"\bit\(", (ROOT / "src" / "drafts" / "draftRebase.test.ts").read_text(encoding="utf-8")
    ))

    recipe = json.loads(
        (ROOT / "skills" / "systemsketch-review-fixture" / "assets" / "draft-branching-recipe.json")
        .read_text(encoding="utf-8")
    )
    steps = [c["text"] for c in recipe["callouts"] if c["kind"] == "step"]
    pass_when = next(c["text"] for c in recipe["callouts"] if c["kind"] == "pass")

    return {
        "drafts_file_count": len(drafts_files),
        "drafts_lines": drafts_lines,
        "hold_guards": hold_guards,
        "dialog_lines": dialog_lines,
        "guard_ms": guard_ms,
        "rebase_unit_cases": rebase_unit_cases,
        "adhoc_checks": journey_checks("draft_branching_adhoc_check.mjs"),
        "rebase_checks": journey_checks("draft_rebase_smoke.mjs"),
        "merge_guard_checks": journey_checks("draft_merge_guard_smoke.mjs"),
        "ux_polish_checks": journey_checks("draft_ux_polish_smoke.mjs"),
        "merge_review_checks": journey_checks("draft_merge_review_smoke.mjs"),
        "steps": steps,
        "pass_when": pass_when,
    }


CSS = """
:root { --ink:#20252b; --muted:#66707b; --line:#dce1e7; --paper:#f4f5f7; --card:#fff;
  --blue:#3478df; --blue-soft:#ebf3ff; --green:#20845c; --green-soft:#eaf8f1;
  --amber:#b97009; --amber-soft:#fff5df; --red:#a5433c; --red-soft:#fdefee; }
* { box-sizing:border-box; }
body { margin:0; background:radial-gradient(circle at 85% 0,#dfeaff 0,transparent 32%),var(--paper);
  color:var(--ink); font:15.5px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }
a { color:#1f63b5; text-underline-offset:3px; }
code { font:600 .92em ui-monospace,monospace; background:#eef1f5; padding:1px 5px; border-radius:5px; }
main { width:min(1220px,calc(100% - 32px)); margin:auto; padding:38px 0 68px; }
header,section { margin-top:20px; border:1px solid var(--line); border-radius:20px;
  background:#ffffffed; box-shadow:0 18px 55px #25334712; }
header { position:relative; overflow:hidden; padding:42px; }
header:after { content:'⎇'; position:absolute; right:30px; bottom:-45px; color:#3478df0b;
  font:900 200px/1 ui-monospace,monospace; }
.eyebrow { color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; }
h1 { max-width:900px; margin:8px 0 15px; font-size:clamp(38px,6vw,62px); line-height:1.02; letter-spacing:-.05em; }
.lead { max-width:880px; margin:0; color:var(--muted); font-size:18px; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; }
.chip { padding:7px 11px; border-radius:999px; background:var(--blue-soft); color:#285f9f;
  font-size:12px; font-weight:800; }
.chip.red { background:var(--red-soft); color:var(--red); }
section { padding:28px; }
.head { display:flex; justify-content:space-between; gap:28px; align-items:end; margin-bottom:18px; }
h2 { margin:0; font-size:27px; letter-spacing:-.035em; }
.head p { max-width:700px; margin:0; color:var(--muted); }
.facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.fact { padding:16px; border:1px solid var(--line); border-radius:12px; background:#fafbfd; }
.fact b { display:block; margin-bottom:3px; font-size:27px; line-height:1; letter-spacing:-.04em; }
.fact span { color:var(--muted); font-size:12.5px; line-height:1.4; }
figure { margin:0; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#f8fafc; }
figure + figure { margin-top:16px; }
/* Two figures that are read against each other — the honest-refusal state beside
 * the drifted-Main refusal. Collapses to one column under 900px. */
.grid-2 { display:grid; gap:16px; grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:16px; }
.grid-2 > figure + figure, .grid-2 + figure { margin-top:0; }
.grid-2 + figure { margin-top:16px; }
@media (max-width:900px) { .grid-2 { grid-template-columns:1fr; } }
img { display:block; width:100%; }
figcaption { padding:13px 15px; border-top:1px solid var(--line); background:#fff;
  color:var(--muted); font-size:12.5px; }
figcaption strong { display:block; color:var(--ink); font-size:14px; }
.built { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.built article { padding:19px; border:1px solid var(--line); border-radius:15px; background:#fafbfd; }
.built article > b { display:block; color:var(--blue); font-size:12px; text-transform:uppercase; letter-spacing:.09em; }
.built article > strong { display:block; margin:5px 0; font-size:18px; }
.built p { margin:0 0 8px; color:var(--muted); font-size:13px; }
.built p:last-child { margin-bottom:0; }
.findings { display:grid; gap:14px; }
.finding { border:1px solid var(--line); border-radius:15px; overflow:hidden; background:var(--card); }
.finding > h3 { margin:0; padding:14px 18px 12px; font-size:17px; letter-spacing:-.02em;
  border-bottom:1px solid var(--line); background:#fafbfd; }
.finding > h3 small { display:block; margin-top:2px; color:var(--muted); font-size:12px; font-weight:600; }
.finding .halves { display:grid; grid-template-columns:1fr 1fr; }
.finding .half { padding:15px 18px; font-size:13px; color:#4a5361; }
.finding .half p { margin:0 0 8px; }
.finding .half p:last-child { margin-bottom:0; }
.finding .half b.tag { display:block; margin-bottom:6px; font-size:11px; letter-spacing:.09em; text-transform:uppercase; }
.finding .half.break { border-right:1px solid var(--line); background:var(--red-soft); }
.finding .half.break b.tag { color:var(--red); }
.finding .half.fix { background:var(--green-soft); }
.finding .half.fix b.tag { color:var(--green); }
.tradeoffs { display:grid; gap:10px; }
.tradeoff { padding:15px 17px; border:1px solid #e9ca8e; border-left:4px solid var(--amber);
  border-radius:10px; background:var(--amber-soft); }
/* Direct child only: the heading. An inline <b> inside a tradeoff's own
 * paragraph must stay inline — display:block on it once broke a sentence
 * into three lines, caught on the headless render pass. */
.tradeoff > b { display:block; margin-bottom:2px; }
.tradeoff p { margin:0; color:#6b5a33; font-size:13px; }
table { width:100%; border-collapse:collapse; overflow:hidden; border:1px solid var(--line);
  border-radius:10px; background:var(--card); font-size:13.5px; }
th,td { padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
th { color:var(--muted); background:#f8fafb; font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
tr:last-child td { border-bottom:0; }
td.result { font-variant-numeric:tabular-nums; font-weight:750; white-space:nowrap; }
td.result.green { color:var(--green); }
td.result.amber { color:var(--amber); }
.audit-table td:first-child { font-weight:650; color:var(--ink); }
.try { display:grid; grid-template-columns:1.35fr .65fr; gap:16px; align-items:start; }
.steps { display:grid; gap:8px; }
.step { padding:12px 14px; border:1px solid #efb27a; border-radius:11px; background:var(--card);
  font-size:13px; }
.pass-when { padding:14px 16px; border:1px solid #9fd4b8; border-left:4px solid var(--green);
  border-radius:11px; background:var(--green-soft); font-size:13px; }
.pass-when b { color:var(--green); }
.board-path { margin-top:10px; padding:10px 12px; border:1px solid var(--line); border-radius:9px;
  background:#f2f4f7; font:600 12px ui-monospace,monospace; overflow-x:auto; white-space:nowrap; }
footer { display:flex; flex-wrap:wrap; justify-content:space-between; gap:14px;
  padding:23px 5px 0; color:var(--muted); font-size:12px; }
@media (max-width:860px) { .facts,.built { grid-template-columns:1fr 1fr; } .try { grid-template-columns:1fr; }
  .finding .halves { grid-template-columns:1fr; } .finding .half.break { border-right:0; border-bottom:1px solid var(--line); } }
@media (max-width:580px) { main { width:calc(100% - 18px); padding-top:8px; }
  header,section { padding:21px; border-radius:16px; } .facts,.built { grid-template-columns:1fr; }
  .head { display:block; } .head p { margin-top:7px; } footer { display:block; } }
"""


def main() -> None:
    facts = measure()
    # WHY the "fixture-" names: draft_branching_adhoc_check.mjs rewrites
    # draft-branching-bar-live.png / -compare-live.png on every run against its
    # own scratch board. The report's context captures are taken on the review
    # fixture instead, so they get names no journey owns — otherwise the next
    # journey run silently swaps the report's figures (which is exactly how the
    # first build of this section ended up showing a scratch "Untitled" board).
    bar_shot = image_uri(DOCS / "assets" / "draft-branching-fixture-bar-live.png")
    move_only_shot = image_uri(DOCS / "assets" / "draft-branching-move-only-live.png")
    # The two-step-confirm capture this section used to carry is gone from the
    # product: Merge now opens a review. These four are that review's states,
    # written by tests/draft_merge_review_smoke.mjs on every run.
    merge_review_shot = image_uri(DOCS / "assets" / "draft-merge-review-live.png")
    merge_partial_shot = image_uri(DOCS / "assets" / "draft-merge-review-partial-live.png")
    merge_refused_shot = image_uri(DOCS / "assets" / "draft-merge-review-refused-live.png")
    rebase_review_shot = image_uri(DOCS / "assets" / "draft-rebase-review-live.png")
    rebase_blocked_shot = image_uri(DOCS / "assets" / "draft-rebase-review-blocked-live.png")
    compare_shot = image_uri(DOCS / "assets" / "draft-branching-fixture-compare-live.png")
    fixture_shot = image_uri(ROOT / "sketches" / "review" / "draft-branching.png")

    step_items = "".join(f'<div class="step">{esc(text)}</div>' for text in facts["steps"])
    journey_total = (
        facts["adhoc_checks"] + facts["rebase_checks"]
        + facts["merge_guard_checks"] + facts["ux_polish_checks"]
        + facts["merge_review_checks"]
    )

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Document draft branching — shipped, broken, fixed</title>
<style>{CSS}</style></head><body><main>

<header>
<div class="eyebrow">Shipped, stress-broken, then hardened · 5 September 2026</div>
<h1>Fork the board, edit privately, Compare, then Merge — or Rebase.</h1>
<p class="lead">The Draft+Version model the <a href="document-draft-branching-2026-09-03.html">2026-09-03
research report</a> selected is a working product surface, rebuilt from scratch against current
main. A <b>Drafts</b> chip sits in the top-left shell, deliberately left of the breadcrumb; opening a
draft adds a bar that pushes the canvas down; <b>Compare</b> reuses the existing Figma-style diff engine
scoped to Draft&nbsp;vs&nbsp;Main; and a GitHub-style <b>Merge&nbsp;▾</b> split button's chevron reveals
<b>Rebase</b> — pulling Main's current edits into the draft, the inverse of Merge. An earlier build of
this page called that finished. Then a recorded user session and two independent review passes — a
correctness stress test and a UX audit, both driving the running app — found a broken rename, <b>two
real data-loss bugs</b>, and a dozen smaller gaps. All of it is fixed, and this page now tells the
whole story: what shipped, what broke, how each break was closed, and what proves it stays closed.</p>
<div class="chips">
<span class="chip red">2 data-loss bugs found by stress-testing</span>
<span class="chip red">the reported rename bug, root-caused twice</span>
<span class="chip">Merge is fail-closed now</span>
<span class="chip">Rebase merges fields, not whole records</span>
<span class="chip">Compare engine reused, not forked</span>
<span class="chip">Main's file never touched by a draft</span>
</div>
</header>

<section>
<div class="head"><h2>Measured from the tree at build time</h2>
<p>Structural numbers below are read from the live repository by this report's builder — it fails
the build if the chip stops rendering left of the breadcrumb, the field-level merge or the
fail-closed Merge guard disappears, or either rename guard goes missing.</p></div>
<div class="facts">
<div class="fact"><b>{facts["drafts_file_count"]} files · {facts["drafts_lines"]:,} lines</b>
<span>the new <code>src/drafts/</code> module — model, snapshot helper, rebase, provider, chip, bar, css, and four test files</span></div>
<div class="fact"><b>{facts["hold_guards"]} write paths held</b>
<span>one <code>draftHoldRef</code> boolean gates persist, final flush, the autosave listener, the idle disk-poll, and the unsaved-changes warning</span></div>
<div class="fact"><b>{journey_total} CDP checks</b>
<span>five real-browser journeys: create→Compare→Merge▾ ({facts["adhoc_checks"]}), Rebase success/blocked ({facts["rebase_checks"]}), both data-loss repros ({facts["merge_guard_checks"]}), rename + move-only + confirm ({facts["ux_polish_checks"]}), review-before-apply ({facts["merge_review_checks"]})</span></div>
<div class="fact"><b>{facts["dialog_lines"]:,} lines reused</b>
<span><code>CompareDialog.tsx</code> serves draft review through one optional <code>source?</code> prop — the history path is byte-identical</span></div>
</div>
</section>

<section>
<div class="head"><h2>What it looks like</h2>
<p>All four captures are the running app in a real browser on 2026-09-05, taken <b>after</b> the fix
pass — the draft bar is a real chrome row, and the two thin strips show behavior the first version
got wrong.</p></div>
<figure><img src="{bar_shot}" alt="SystemSketch with an open draft: the draft-mode bar on top, the Drafts chip left of the Board breadcrumb, a moved and retitled Controller Block, and the review fixture's numbered cue cards">
<figcaption><strong>The chip and the bar, in context</strong>
Top row, left to right: Exit, the draft's name (<i>Draft 1</i>), the ⋯ overflow, then — right-aligned —
<b>Compare 2 Changes</b> with its live count and the blue <b>Merge ▾</b> split button. Below it the
normal shell: menu, document title, then the <b>Drafts</b> chip sitting left of the <b>‹ Board</b>
breadcrumb, which stays rightmost. On the canvas: the review fixture's cue cards, plus this draft's
edits — the Controller Block moved and retitled <i>Controller&nbsp;v2</i>. Main's file on disk contains
none of it.</figcaption></figure>
<figure><img src="{move_only_shot}" alt="The draft bar with the badge reading Compare 0 Changes while the Merge split button is enabled">
<figcaption><strong>A move-only draft: the badge is truthfully 0, and Merge is enabled anyway</strong>
The draft has only <i>moved</i> a Block. <code>compareBoards</code> — the display diff — deliberately
never reads <code>x</code>/<code>y</code>, so the badge honestly says nothing changed <i>visibly</i>;
before the fix pass that same number also gated the buttons, leaving a move-only draft permanently
stuck. Merge and Rebase now gate on <code>hasUnpromotedEdits</code>, a raw digest of the draft's stored
content, and the journey asserts <code>disabled === false</code> at exactly this moment.</figcaption></figure>
<figure><img src="{merge_review_shot}" alt="The Compare dialog opened by Merge: titled Merge changes, a ticked checkbox on the one changed element, and a blue Merge 1 change confirm at the bottom right">
<figcaption><strong>Merge opens the review it is about to act on</strong>
One click on <b>Merge</b> — no arming — opens the <i>same</i> dialog, retitled <b>Merge changes</b>, on
the same Main-vs-draft diff the Compare button shows. Every changed element carries a ticked box, and
IcePanel's <code>› Merge 1 change</code> sits at the bottom right. The two-step confirm this replaced was
a button that changed its own label; a review that shows exactly what is about to be overwritten is the
stronger guard, and it is where the <i>next</i> feature — accepting changes individually — has to live
anyway.</figcaption></figure>
<figure><img src="{compare_shot}" alt="The generalized Compare changes dialog: Main vs Draft 1 side by side, a by-element list with type icons and inline ADDED/EDITED badges, and the selected Block's title diff in the properties rail">
<figcaption><strong>The existing Compare engine, scoped to Draft vs Main — with the element-list polish</strong>
The same Figma-style dialog Shift+D opens for history — badges (<i>1 Added · 0 Removed · 1 Modified</i>),
side-by-side boards, the Properties/Code rail — but the History list is replaced by a static
<i>COMPARING: Main compared with Draft 1</i> header. The by-element list now carries a type glyph per
row (a box for a Block, a square for a stock rectangle — the audit found they all read as identical
anonymous rows) plus inline ADDED/EDITED badges, and the selected Block shows its title diff
(<i>Controller → Controller v2</i>). No second diff implementation exists anywhere in the
feature.</figcaption></figure>
</section>

<section>
<div class="head"><h2>What a real test session found</h2>
<p>A 10.2-second recorded session (<code>recordings/2026-09-05_16-21-02-take/</code>) produced one
user-reported bug: <i>“I tried to double-click the text to rename it there, but wasn't able to.”</i>
Two independent passes followed — a correctness stress test over complex board content (Branch
regions, Loops, Behavior Trees, Definition-linked Blocks) and a UX audit driving the live app — and
both converged on the same root causes. None of this was found by re-reading the code.</p></div>
<div class="findings">

<div class="finding"><h3>Merge silently destroyed concurrent edits to Main
<small>Found by the stress test · a real data-loss bug in the version this report first called finished</small></h3>
<div class="halves">
<div class="half break"><b class="tag">The break</b>
<p>Merge wrote the draft's snapshot over Main <b>wholesale, with no check at all</b>. An edit made to
Main while the draft was open — a peer session, another window, an edit from before the draft was
resumed — was destroyed with no diff, no undo entry on the other side, and a success report.</p></div>
<div class="half fix"><b class="tag">The fix</b>
<p>Merge is <b>fast-forward only</b> and fail-closed: at the instant of the click it re-reads Main
fresh from disk (<code>readMainDrift</code>, never the cached flag or fork-point slot) and refuses if
Main has drifted at all, pointing at Rebase one click away. An <i>unreadable</i> Main also refuses —
“check failed” never falls through to “overwrite”.</p>
<p><code>draft_merge_guard_smoke.mjs</code> replays the exact repro: an unrelated on-disk edit to Main
survives the refused merge (<code>beta w=654</code> still on disk), and Rebase-then-Merge lands both
sides' work.</p></div>
</div></div>

<div class="finding"><h3>Rebase could report success while reverting Main's edit
<small>Found by the stress test · the second data-loss bug, and the deeper design flaw</small></h3>
<div class="halves">
<div class="half break"><b class="tag">The break</b>
<p>Rebase asked “what changed” <b>twice, at two different granularities</b>. Conflict detection ran
through <code>compareBoards</code> — the display diff behind the badge, which deliberately ignores
position — while the merge overlay ran on a raw whole-record diff, which sees it. A draft that only
<i>moved</i> a shape Main had independently renamed was invisible to the conflict check but visible to
the overlay: the draft's entire stale record was copied over Main's rename, and the rebase reported
success. A display diff was deciding what was safe to overwrite.</p></div>
<div class="half fix"><b class="tag">The fix</b>
<p>The merge logic was rewritten, not patched: <b>one complete, field-by-field comparison</b>
(<code>fieldViewOf</code> — every top-level key plus one level into <code>props</code>, the unit this
app actually writes) drives both halves of the decision. Two edits to <i>different</i> fields of one
record — a move and a rename, a retitle and a port addition — now merge, keeping both; two edits to
the <i>same</i> field still block; delete-vs-edit stays a whole-record refusal.
<code>compareBoards</code> keeps its job of describing changes to a human and has no say in what gets
written — the whole point of <code>draftRebase.ts</code>'s module header.</p>
<p>{facts["rebase_unit_cases"]} unit cases in <code>draftRebase.test.ts</code> pin it down — the
same-record-different-fields cases are merges the shipped version refused by construction, so
reverting the fix fails them outright — and the journey proves the literal repro closed:
<code>x=640, y=480, props.w=777</code> all surviving on one record.</p></div>
</div></div>

<div class="finding"><h3>Behavior Tree boards could never have rebased
<small>Found in the same pass · an unrelated latent bug the two-diff gap had been hiding</small></h3>
<div class="halves">
<div class="half break"><b class="tag">The break</b>
<p>The Behavior Tree projection minted a <b>fresh random <code>definitionId</code></b> for every
projected Block on every reconcile — every load, every XML edit — via
<code>getDefaultBlockProps()</code>. Its documented idempotency (“a second call with nothing changed
writes nothing”) was quietly false, and under the new raw field-level diff, draft and Main each roll
their own ids: every leaf reads as a same-field conflict, so any board containing a Behavior Tree
would have been permanently unable to Rebase.</p></div>
<div class="half fix"><b class="tag">The fix</b>
<p><code>projectedBlockDefaults()</code> simply <b>omits the field</b>: an existing leaf keeps
whatever id it was persisted with (a spread cannot overwrite a key it does not carry), and a
brand-new leaf is stamped once by <code>installDefinitionLinking</code>'s beforeCreate handler — the
same one-time mint every hand-drawn Block gets. Not a path-derived id, which would silently link two
regions showing the same tree into one Definition.
<code>behaviorTreeProjectionIdentity.test.ts</code> asserts byte-identical re-projection under both
lenses.</p></div>
</div></div>

<div class="finding"><h3>Double-clicking a draft's name corrupted it
<small>The user-reported bug — independently root-caused by both reviews to the same cause</small></h3>
<div class="halves">
<div class="half break"><b class="tag">The break</b>
<p>A single click already swaps the name into an editable, auto-selected input — by design, matching
the file-title rename. A habitual double-click's <i>second</i> click lands ~100–200ms later on the
now-different, freshly-mounted input: an ordinary click inside a focused text field, which collapses
the just-made selection to a bare caret. Typing then inserts mid-word (“Draft 1” →
“DraNew&nbsp;nameft&nbsp;1”), committing silently on blur. No native <code>dblclick</code> ever fires —
the two clicks hit different elements.</p></div>
<div class="half fix"><b class="tag">The fix</b>
<p>The input records when it mounted and <b>swallows a stray <code>mousedown</code> within
{facts["guard_ms"]}ms</b> — a rapid second click leaves the selection intact so typing replaces the
name, while a deliberate slow click still places a caret normally. Fixed at <b>both</b> sites the
pattern exists (the bar's name and the popover's per-row rename), per the house rule of fixing the
sibling paths, and <code>draft_ux_polish_smoke.mjs</code> drives real timed rapid clicks at each,
asserting the committed name is exactly what was typed.</p></div>
</div></div>

</div>
</section>

<section>
<div class="head"><h2>Twelve more findings from the UX audit</h2>
<p>The audit drove the live app and filed 15 findings in all; the three above were the deep ones.
The twelve below were fixed in the same pass — each fix verifiable in the diff or a journey.</p></div>
<table class="audit-table">
<thead><tr><th>Finding</th><th>Fix</th></tr></thead>
<tbody>
<tr><td>A move-only draft was permanently stuck — the change count that gated Merge <i>and</i> Rebase is
structurally blind to position, so both buttons disabled forever (same root-cause class as the Rebase bug).</td>
<td>Enablement gates on <code>hasUnpromotedEdits</code> — a raw digest of the draft's stored content —
never on <code>changes.total</code>. Proven in the move-only journey step above.</td></tr>
<tr><td>Merge fired on one unconfirmed click with no way back — asymmetric with Discard's two-step confirm.</td>
<td>First a two-step confirm on the button; <b>now superseded</b> by the review dialog below, which shows
the diff being applied instead of restating it in a label.</td></tr>
<tr><td>A refused Merge produced no feedback at all.</td>
<td>A status line distinguishes “Main has N changes… Rebase first” from “could not check Main” —
only one of them points at an action.</td></tr>
<tr><td>The “Main changed since this draft” banner was computed once at draft-entry and never refreshed —
it could claim either calm or conflict long after reality changed.</td>
<td>Re-settled at every moment the answer matters: entering/resuming a draft, opening Compare, both
Rebase outcomes, and a refused Merge. Still advisory only — <code>merge()</code> never trusts it.</td></tr>
<tr><td>The Compare button's badge and the dialog it opened answered two different questions
(confirmed live: button “1 Change”, dialog “0 Added · 2 Removed · 1 Modified”).</td>
<td>Both now computed from the same two snapshots — fresh Main vs the live head — so they cannot
disagree.</td></tr>
<tr><td>Entering a draft snapped the canvas down with a hard layout jump.</td>
<td>The canvas wrapper animates its height (180ms), with a <code>prefers-reduced-motion</code> opt-out.</td></tr>
<tr><td>Every draft claimed “based on v0.1” even though no version has ever been pinned — a fabricated label.</td>
<td>Truthful “based on Main · 2m ago” until a version actually exists; the real label once one does.</td></tr>
<tr><td>Escape inside the popover's rename input closed the whole popover instead of canceling the rename.</td>
<td>The rename's Escape stops propagation past Radix's dismissable layer; cancel and close are separate.</td></tr>
<tr><td>Draft rows read as one run-on accessible name (“Draft 1based on v0.1”), and icon-only buttons had no names.</td>
<td>Explicit <code>aria-label</code>s throughout; the rename inputs gained <code>aria-describedby</code> help text.</td></tr>
<tr><td>Committing an empty rename silently reverted to the old name.</td>
<td>“Give this draft a name.” shown inline, focus kept in the field — both rename sites.</td></tr>
<tr><td>Row action buttons were 22×22px, under the 24px minimum target size, with contrast gaps beside them.</td>
<td>Targets enlarged and tokens adjusted in <code>drafts.css</code> (the 22×22 case is called out in the file).</td></tr>
<tr><td>Compare's changed-element rows were anonymous — a Block, a cable and a rectangle all looked the same.</td>
<td>Per-kind glyphs and inline ADDED/EDITED badges in the element list (visible in the capture above).</td></tr>
</tbody>
</table>
</section>

<section>
<div class="head"><h2>Then Merge and Rebase became reviews</h2>
<p class="sub">Zach, watching the two-step confirm: <i>“instead of doing a double click confirmation,
whenever you click that, then it will again open essentially the compare view — however in maybe a
slightly altered state, where maybe you can accept or not accept for now each modification.”</i>
The reference was IcePanel's own <b>Merge changes</b> modal.</p></div>

<p>Both entry points keep their exact position and label. What changed is what the click <i>does</i>:
it opens the Compare dialog the app already has, through <b>one more optional prop</b> on the same
component — the identical move that let drafts reuse it for Draft-vs-Main in the first place. With no
<code>action</code> the dialog renders byte-for-byte as it always has, which is what keeps the Shift+D
history path unchanged (proved below, by re-running its three journeys).</p>

<div class="grid-2">
<figure><img src="{merge_partial_shot}" alt="The Merge review with one element unticked: the confirm is greyed out and a red-ruled line reads Applying only some changes isn't supported yet">
<figcaption><strong>The checkbox is real, and it refuses rather than lying</strong>
Unticking an element genuinely unticks it, and the confirm goes dead with a line saying why. This is
the honest half of a placeholder: <code>merge()</code> and <code>rebaseDraftAction()</code> apply
everything atomically — there is no per-change apply path in this build — so a box that quietly
applied the change anyway would be worse than no box. The UI shape the real feature needs is here; the
promise it cannot keep is stated out loud.</figcaption></figure>
<figure><img src="{merge_refused_shot}" alt="The Merge review after a refused confirm: Merge blocked — Main has 1 change this draft doesn't have yet. Rebase first.">
<figcaption><strong>A drifted Main refuses in the review, not before it</strong>
The dialog opens regardless; the fail-closed check stays inside <code>merge()</code> and runs fresh at
the instant of the <i>confirm</i>. Deliberately not re-checked at open time: a second check would be a
second authority that could disagree with the one that actually decides. A refusal keeps the review
open with the reason, and the on-disk values on both sides are asserted unchanged.</figcaption></figure>
</div>

<figure><img src="{rebase_review_shot}" alt="The Rebase review: the left board captioned Draft 1 and the right board captioned Draft 1 (after Rebase), with a Rebase 1 change confirm">
<figcaption><strong>Rebase reviews the draft it would produce — not Main</strong>
This is the new part. A rebase does not make the draft look like Main; it folds Main's work
<i>into</i> the draft, so showing the two inputs would leave the reviewer to imagine the output.
<code>computeRebase</code> was already a pure function returning the merged snapshot without applying
it — a dry run sitting there unused — so the <code>after</code> board is that proposal, rendered by the
real renderer, captioned <i>“(after Rebase)”</i>. The journey asserts that the live draft is still
untouched while this is on screen. Confirming then re-runs the real <code>rebaseDraftAction</code>,
which re-reads all three inputs itself: the preview never decides what gets written.</figcaption></figure>

<figure><img src="{rebase_blocked_shot}" alt="A conflicted Rebase: the review opens with a red-ruled Rebase blocked banner and a disabled confirm">
<figcaption><strong>A conflicted Rebase opens blocked, showing the two sides that collided</strong>
When <code>computeRebase</code> reports conflicts there is no proposal to preview, so the review falls
back to Main-vs-draft — which is exactly what collided — with the count in a banner and no usable
confirm. The per-element boxes are dropped in this state on purpose: nothing can be applied, so a
control for choosing what to apply would be furniture.</figcaption></figure>
</section>

<section>
<div class="head"><h2>How it's built</h2>
<p>Three seams carry the whole feature. Everything else — the diff engine, the board renderer,
autosave, the chrome — was already there.</p></div>
<div class="built">
<article><b>Autosave hold</b><strong>One boolean, {facts["hold_guards"]} guards</strong>
<p><code>draftHoldRef</code> in <code>LocalWorkspace.tsx</code> mirrors the existing
<code>protectedRef</code> quarantine pattern: while a draft is open it gates every path that could
write Main's <code>.systemsketch</code> file. Draft edits autosave to localStorage instead, via the
provider's own debounced listener.</p>
<p>The Rebase journey proves the seal: it diffs Main's file bytes on disk before and after draft
edits and after the Rebase click — identical every time.</p></article>
<article><b>Compare</b><strong>Generalized, not forked</strong>
<p>One optional <code>source?: CompareExplicitSource</code> — two labeled snapshots — threads through
<code>useCompare().open()</code> into the {facts["dialog_lines"]:,}-line dialog. With a source it seeds
both sides directly, skips version discovery, and swaps the History rail for a two-line header. Without
one, nothing changed: <code>compareModel.ts</code>, <code>BoardRender</code>, <code>PropertyTable</code>
and <code>CodeView</code> are untouched, and the three pre-existing Compare smoke journeys still pass
on the Shift+D history path.</p></article>
<article><b>Rebase</b><strong>One question, one granularity</strong>
<p><code>computeRebase</code> is pure: raw record-level diffs (fork-point→Main, fork-point→draft)
decide what each side touched, and a record both sides touched gets a <b>field-level three-way
merge</b> — only a field both sides moved <i>differently</i> is a conflict. The candidate result must
then survive a referential-integrity sweep: every binding's <code>fromId</code>/<code>toId</code> and
every shape's non-page <code>parentId</code> must resolve, so Main deleting a Block the draft wired a
cable to still blocks.</p>
<p>Any conflict blocks with a message pointing at Compare. No resolution UI — a conflict is a
refusal, in both directions, and the display diff has no say in what gets written.</p></article>
</div>
</section>

<section>
<div class="head"><h2>Known trade-offs, kept deliberately</h2>
<p>Named in the plan before building, re-checked after the fix pass. None of these is hidden behind
the green numbers below.</p></div>
<div class="tradeoffs">
<div class="tradeoff"><b>Main's external-change polling is suspended while a draft is open.</b>
<p>The idle-poll guard that must ignore draft-local edits cannot also watch Main's file. Acceptable for
a single-user local app — and after the fix pass this is compensated everywhere it matters: Compare,
Rebase and now <b>Merge itself</b> re-read Main fresh from disk at the moment of the action, never from
a cached fork-point slot, which is exactly what turned the blind overwrite into a refusal.</p></div>
<div class="tradeoff"><b>A few hundred milliseconds of draft edits can be lost on an abrupt tab close.</b>
<p>The draft's localStorage autosave is debounced, and the browser's unsaved-changes warning is
intentionally suppressed while the hold is active. The same window the prototype had — not widened,
and deliberately not closed now.</p></div>
<div class="tradeoff"><b>Versions stay metadata-only.</b>
<p>Merging pins a <code>VersionRecord</code> — label, name, timestamp — with no retained content and no
non-destructive restore. The fuller IcePanel versioning model from the research report was not requested
for this pass. What did change: the UI no longer <i>pretends</i> otherwise — the fabricated
“based on v0.1” row label is gone until a version is actually pinned.</p></div>
</div>
</section>

<section>
<div class="head"><h2>Test evidence</h2>
<p>All runs re-executed on 2026-09-05 in this worktree, <b>after</b> the fix pass — none of these
numbers is carried over from the pre-fix build of this page. The one amber row is an honest asterisk,
verified unrelated to this feature.</p></div>
<table>
<thead><tr><th>Command</th><th>Result</th><th>What it proves</th></tr></thead>
<tbody>
<tr><td><code>npx tsc -b</code></td><td class="result green">clean</td><td>The whole tree typechecks.</td></tr>
<tr><td><code>npx vitest run</code></td><td class="result green">147 files · 1,505 tests</td>
<td>Full unit suite, including the new {facts["rebase_unit_cases"]}-case <code>draftRebase.test.ts</code>
(field-level merge, same-field conflicts, delete-vs-edit, dangling references) and
<code>behaviorTreeProjectionIdentity.test.ts</code> (byte-identical re-projection under both lenses,
no minted <code>definitionId</code>).</td></tr>
<tr><td><code>python3 -m pytest tests/ -q</code></td><td class="result green">119 passed</td>
<td>The Python suite, including the stock-tldraw boundary test — the feature adds no new engine seams.</td></tr>
<tr><td><code>node tests/draft_branching_adhoc_check.mjs</code></td><td class="result green">{facts["adhoc_checks"]}/{facts["adhoc_checks"]}</td>
<td>Real-browser journey: chip renders left of the breadcrumb, popover lists Main, New draft raises the
bar, the bar pushes the canvas down, an edit updates the Compare count, Compare opens the generalized
dialog with a real diff, Merge ▾ enables once there are changes, the chevron lists Rebase.</td></tr>
<tr><td><code>node tests/draft_rebase_smoke.mjs</code></td><td class="result green">{facts["rebase_checks"]}/{facts["rebase_checks"]}</td>
<td>A successful rebase (a draft edit and a disjoint on-disk Main edit both survive; Main's file is
byte-identical before and after the click) and a blocked one (the same field edited on both sides is
refused with a message, nothing corrupted).</td></tr>
<tr><td><code>node tests/draft_merge_guard_smoke.mjs</code></td><td class="result green">{facts["merge_guard_checks"]}/{facts["merge_guard_checks"]}</td>
<td><b>Both data-loss repros, closed</b>: Merge refuses while Main has drifted (the on-disk edit
survives, with literal before/after values), Rebase-then-Merge lands both sides' work, and a
move-plus-prop-edit on one record keeps both (<code>x=640, y=480, props.w=777</code>).</td></tr>
<tr><td><code>node tests/draft_ux_polish_smoke.mjs</code></td><td class="result green">{facts["ux_polish_checks"]}/{facts["ux_polish_checks"]}</td>
<td><b>The reported rename bug, closed at both sites</b> with actual timed rapid clicks; a move-only
draft keeps a truthful 0-change badge while Merge and Rebase stay enabled; one click on Merge opens
the review without merging, and that review's confirm — reading <i>“Merge this draft into Main”</i>,
words rather than a count, because a move-only draft has zero display-diff rows — merges for real.</td></tr>
<tr><td><code>node tests/draft_merge_review_smoke.mjs</code></td><td class="result green">{facts["merge_review_checks"]}/{facts["merge_review_checks"]}</td>
<td><b>Review-before-apply, end to end</b>: Merge opens the review all-ticked and its confirm merges;
unticking one element disables the confirm and re-ticking restores it; a drifted Main still opens but
is refused at the confirm with both sides' on-disk values intact; Rebase previews the proposed
post-rebase draft (asserting the live draft is untouched while it shows) and its confirm lands both
sides' work; a genuine conflict opens blocked with no usable confirm and writes nothing.</td></tr>
<tr><td><code>node tests/compare_modal_smoke.mjs</code> · <code>compare_history_figma_smoke.mjs</code></td>
<td class="result green">21/21 · 18/18</td>
<td>The Shift+D history-comparison path is behaviorally unchanged by the generalization.</td></tr>
<tr><td><code>node tests/compare_converged_smoke.mjs</code></td><td class="result amber">23/24</td>
<td>The one failure is the same pre-existing pixel measurement about the Block inspector's own
tab-strip width (231px of 279px, reproduced identically twice today) that the pre-fix build of this
report already diagnosed as failing on unmodified <code>main</code>. Not caused by, and not masking,
anything in this feature.</td></tr>
</tbody>
</table>
</section>

<section>
<div class="head"><h2>Try it</h2>
<p>The review board below was generated through the real editor and driven once in the app. Its
callout texts are read verbatim from the fixture recipe at build time.</p></div>
<div class="try">
<figure><img src="{fixture_shot}" alt="The draft-branching review board: Planner and Controller Blocks, four numbered orange instruction cards, and a green PASS WHEN card">
<figcaption><strong>sketches/review/draft-branching.systemsketch</strong>
Planner and Controller Blocks to edit, four numbered cues placed outside the interaction area, and the
green PASS WHEN card spelling out the visible success conditions.</figcaption></figure>
<div>
<div class="steps">{step_items}</div>
<div class="pass-when"><b>PASS WHEN</b> · {esc(facts["pass_when"].removeprefix("PASS WHEN · "))}</div>
<div class="board-path">sketches/review/draft-branching.systemsketch</div>
</div>
</div>
</section>

<footer>
<span>SystemSketch · document draft branching · 5 Sep 2026 · rebuilt after the fix pass</span>
<span><a href="build_draft_branching.py">Report builder</a> ·
<a href="file:///home/bam/.claude/plans/misty-soaring-tower.md">Approved plan</a> ·
<a href="document-draft-branching-2026-09-03.html">Research report</a> ·
<a href="draft-journey-babble-2026-09-03.html">Journey babble</a> ·
<a href="../README.md">README</a></span>
</footer>

</main></body></html>
"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
