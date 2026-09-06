#!/usr/bin/env python3
"""
Node-primitive survey: Groot2, MoveIt Pro, Intrinsic Flowstate, and SystemSketch.

Answers one question for each tool: when you build a Behavior Tree / Process in
its editor, what are the structural node primitives you can click to insert —
not user-authored skills, the built-in vocabulary the editor itself ships?

SystemSketch's own list is read live from `src/behaviorTree/btcppXml.py`'s
sibling TS source at build time (regex-extracted from `BT_BUILTIN_MODELS` in
btcppXml.ts) so this report can't drift from the parser it describes. Groot2
and MoveIt Pro sections are backed by real screenshots in
docs/assets/behavior-tree-node-survey/ (a decoded frame of Groot2's own demo
video, and PickNik's own docs diagrams). Flowstate has no public docs — its
section is built from firsthand screenshots (recreated as an HTML mockup,
captioned as such) cross-checked against Intrinsic's public open-source SDK
(github.com/intrinsic-ai/sdk), which a research pass confirmed is the actual
schema behind the graphical Process editor.

Run:  python3 docs/build_behavior_tree_node_survey.py
"""
from __future__ import annotations

import base64
import re
import subprocess
from datetime import date
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "behavior-tree-node-survey"
STAMP = "2026-09-05"
OUT = DOCS / f"behavior-tree-node-survey-{STAMP}.html"


def esc(text: object) -> str:
    return escape(str(text), quote=True)


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


# --------------------------------------------------------------------------- measure


def systemsketch_models() -> list[dict]:
    """Parse BT_BUILTIN_MODELS straight out of the live TS source."""
    src = (REPO / "src" / "behaviorTree" / "btcppXml.ts").read_text()
    block = src[src.index("export const BT_BUILTIN_MODELS"):]
    block = block[: block.index("\n]")]
    rows = []
    for line in block.splitlines():
        m = re.match(r"\s*model\('(\w+)',\s*'(\w+)',.*?description:\s*'([^']*)'", line)
        if m:
            rows.append({"id": m.group(1), "kind": m.group(2), "description": m.group(3)})
            continue
        m = re.match(r"\s*model\('(\w+)',\s*'(\w+)',", line)
        if m:
            rows.append({"id": m.group(1), "kind": m.group(2), "description": ""})
    return rows


def measure() -> dict:
    models = systemsketch_models()
    by_kind: dict[str, list[str]] = {}
    for row in models:
        by_kind.setdefault(row["kind"], []).append(row["id"])
    return {
        "models": models,
        "by_kind": by_kind,
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--", "src/behaviorTree")),
    }


# ----------------------------------------------------------------------------- tables


def rows_html(rows: list[tuple[str, ...]], klass: str = "") -> str:
    return "\n".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows)


GROOT2_ROWS = [
    ("Sequence", "Control", "Tick children left-to-right in one tick; abort to FAILURE on the first failure; SUCCESS once all succeed.", "family"),
    ("AsyncSequence", "Control", "Same as Sequence, but yields (RUNNING + wake signal) after each child's SUCCESS so a reactive ancestor can re-check conditions between children.", "v4.8 addition"),
    ("SequenceWithMemory", "Control", "Skips re-ticking children that already returned SUCCESS.", "family"),
    ("ReactiveSequence", "Control", "Restarts from child 1 every tick, continuously re-checking earlier Condition children.", "family"),
    ("Fallback", "Control", "“Selector” / “Priority” in other frameworks. Tries children in order; next on FAILURE, stops at first SUCCESS.", "family"),
    ("AsyncFallback", "Control", "Same as Fallback, but yields after each FAILURE for a reactive parent to re-check conditions.", "v4.8 addition, seen in Groot2's own palette"),
    ("ReactiveFallback", "Control", "Restarts every tick; interrupts a RUNNING async child the moment an earlier condition flips to SUCCESS.", "family"),
    ("Parallel", "Control", "Ticks all children in one tick; several may be RUNNING at once; completes early on a success/failure threshold.", "family"),
    ("ParallelAll", "Control", "Like Parallel, but always runs every child to completion.", "family"),
    ("IfThenElse", "Control", "2–3 children: condition ticked once, then “then” on SUCCESS, optional “else” on FAILURE.", "conditional"),
    ("WhileDoElse", "Control", "Reactive twin of IfThenElse — re-evaluates the condition every tick.", "conditional"),
    ("Switch2–Switch6", "Control", "Blackboard-driven switch statement; N case branches plus a trailing default.", "5 arities"),
    ("ManualSelector", "Control", "In SystemSketch's model; not observed in the captured Groot2 palette frame (view was cut off one row early).", "unconfirmed in UI"),
    ("Inverter / ForceSuccess / ForceFailure", "Decorator", "Flip or clamp the child's SUCCESS/FAILURE result; RUNNING always passes through.", ""),
    ("Repeat / RetryUntilSuccessful / KeepRunningUntilFailure", "Decorator", "Bounded-iteration family: repeat while SUCCESS, retry while FAILURE, or run until FAILURE.", ""),
    ("Delay / Timeout", "Decorator", "Wait before ticking the child, or halt a child that runs too long.", ""),
    ("RunOnce", "Decorator", "Tick the child once, then skip it forever (or keep returning its result).", ""),
    ("Precondition", "Decorator", "Evaluate a scripting-language condition before ticking the child; else return a configured status.", ""),
    ("SubTree", "Structural", "Splice a separately-defined tree in for hierarchy/reuse. Confirmed on-canvas expand/collapse exists (Groot2 changelog v1.8.0 bugfix).", ""),
    ("LoopDouble / LoopString / LoopInt / LoopBool", "Decorator", "Typed pop-from-queue loop decorators, in SystemSketch's model as concrete aliases of BT.CPP's generic “ConsumeQueue&lt;T&gt;” pattern.", "not documented on the current Nodes Library pages; not observed in the captured palette frame"),
    ("AlwaysSuccess / AlwaysFailure / Script / SetBlackboard / Sleep", "Action (generic)", "Stub/testing leaves and blackboard-scripting primitives. All five confirmed directly in Groot2's own “Action” palette group.", "confirmed in Groot2 UI"),
    ("ScriptCondition / WasEntryUpdated", "Condition (generic)", "The Condition palette group was present but collapsed in every captured frame — contents not directly observed on canvas.", "unconfirmed in UI"),
]

MOVEITPRO_ROWS = [
    ("Sequence", "Control Node", "Ticks children in order; 287 examples in PickNik's own shipped catalog — by far the most-used control node.", "287 examples"),
    ("Fallback", "Control Node", "Tries children in order until one succeeds.", "25 examples"),
    ("Parallel", "Control Node", "Executes all children concurrently each tick until a success/failure threshold; only node where several children can be RUNNING at once.", "17 examples"),
    ("IfThenElse", "Control Node", "2–3 children, non-reactive if/then/else.", "6 examples"),
    ("ReactiveSequence / ReactiveFallback", "Control Node", "Reactive twins that re-evaluate every tick.", ""),
    ("WhileDoElse", "Control Node", "Reactive if/then/else.", ""),
    ("SequenceStar", "Control Node", "Deprecated legacy memory-sequence variant.", "deprecated, still shipping"),
    ("Inverter / ForceSuccess / ForceFailure", "Decorator", "Flip or clamp the child's result.", "4 / 19 / 5 examples"),
    ("Timeout / Delay", "Decorator", "Halt a child that runs too long, or wait before ticking it.", "9 / 5 examples"),
    ("Precondition", "Decorator", "Run the child only if a condition holds.", "9 examples"),
    ("RepeatUnlessFailureEachTick / …WithinTick", "Decorator", "9.3+ replacements for Repeat: one iteration per <em>parent</em> tick, so an infinite count can't deadlock the tree.", "current, replaces deprecated Repeat/RetryUntilSuccessful/KeepRunningUntilFailure"),
    ("Repeat / RetryUntilSuccessful / KeepRunningUntilFailure", "Decorator", "Legacy within-tick loop family. Docs say “removed in 10.0”; still present and merely flagged deprecated in the live 10.0.0 catalog.", "deprecated"),
    ("ForEach / ForEachUntilSuccess", "Decorator", "Iterate a blackboard vector, ticking the child once per element.", "33 / 4 examples — PickNik-specific, not in BT.CPP"),
    ("SuppressChildErrors", "Decorator", "Drops the child's log messages by severity without changing its BT status — for an expected Fallback-branch failure that shouldn't alarm an operator.", "PickNik-specific, not in BT.CPP"),
    ("Script / AlwaysSuccess / AlwaysFailure", "Behavior (not a separate Condition type)", "BT.CPP's generic leaves, but PickNik's own Node Type filter has no “Condition” value — these are simply tagged “Behavior.”", "23 examples (Script)"),
    ("Action Node (630 shipped)", "Behavior", "The leaf building blocks that execute a robotic skill.", "teal, lightning-bolt icon"),
    ("Subtree / Objective (185 shipped)", "Subtree", "Any Objective can be reused as a Subtree inside another; mark ‘Subtree-only’ to hide it from standalone Run.", "yellow, branching-fork icon"),
]

TS_KIND_LABEL = {"control": "Control", "decorator": "Decorator", "action": "Action (generic)", "condition": "Condition (generic)", "subtree": "Structural"}


def systemsketch_rows(models: list[dict]) -> list[tuple[str, ...]]:
    order = {"control": 0, "decorator": 1, "action": 2, "condition": 3, "subtree": 4}
    rows = []
    for row in sorted(models, key=lambda r: (order.get(r["kind"], 9), r["id"])):
        rows.append((row["id"], TS_KIND_LABEL.get(row["kind"], row["kind"]), row["description"] or "—", ""))
    return rows


COMPARISON_ROWS = [
    ("Sequence (AND, ordered)", "✓ + Async/Memory/Reactive variants", "✓ (+ deprecated SequenceStar)", "backend <code>Sequence</code> exists; not in top-level menu", "✓ Sequence, SequenceWithMemory, ReactiveSequence, SequenceStar"),
    ("Fallback / Selector (OR, ordered)", "✓ — docs literally call it “Selector or Priority in other frameworks”", "✓", "<strong>Selector</strong> in Transition menu; backend also has a separate <code>Fallback</code> type", "✓ Fallback, ReactiveFallback"),
    ("Parallel (concurrent, threshold)", "✓ Parallel, ParallelAll", "✓", "<strong>Parallel</strong> in Transition menu", "✓ Parallel, ParallelAll"),
    ("Branch / If-Then-Else (binary conditional)", "✓ IfThenElse, WhileDoElse", "✓", "<strong>Branch</strong> — real if/then/else, confirmed in the public SDK schema", "✓ IfThenElse, WhileDoElse"),
    ("Switch / multi-way case", "✓ Switch2–Switch6", "not seen in the shipped catalog", "not confirmed", "✓ Switch2–Switch6"),
    ("Named group / scope wrapper with no logic of its own", "no dedicated type — SubTree serves this role", "<strong>Ctrl+G “Group Under Sequence”</strong>, added in the Sept 2026 10.0.0 release — wraps a selection in a real Sequence", "<strong>Group</strong> — label only; backend candidate is <code>SubTree</code> (“used to group components into a subtree”) or plain <code>Sequence</code>", "no equivalent — Behaviors library inserts raw node types, no “wrap selection” action yet"),
    ("Loop / bounded iteration", "✓ Repeat decorator", "✓ Repeat (deprecated) / RepeatUnlessFailure… (current)", "<strong>Loop</strong> — <code>while</code> condition or <code>max_times</code>, wraps a <code>do</code> child", "✓ Repeat decorator + typed LoopDouble/String/Int/Bool queue loops"),
    ("Retry until success", "✓ RetryUntilSuccessful", "✓ (deprecated, still shipping)", "<strong>Retry</strong> — real <code>max_tries</code> count <em>plus an optional recovery subtree run before re-trying</em>", "✓ RetryUntilSuccessful (count only, no built-in recovery slot)"),
    ("Deliberate forced-failure leaf", "✓ AlwaysFailure", "✓ AlwaysFailure", "<strong>Fail</strong> — dedicated node, exists specifically so a Fallback/Retry/Branch above it has something to react to", "✓ AlwaysFailure"),
    ("Force success / force failure decorators", "✓", "✓", "not confirmed as separate nodes", "✓"),
    ("Inverter", "✓", "✓", "not confirmed", "✓"),
    ("Timeout / Delay", "✓ / ✓", "✓ / ✓", "not confirmed as separate nodes", "✓ / ✓"),
    ("Precondition (gate before child)", "✓", "✓", "structurally similar per-node <code>condition</code> field on every node's Decorators message, not a distinct node type", "✓"),
    ("SubTree / reusable nested tree", "✓", "✓ (Objective used as Subtree)", "backend <code>SubTree</code>; likely what the UI calls “Group” (unconfirmed)", "✓ (rebuild directive renames it “BehaviourTree”)"),
    ("Skill / parameterized leaf action", "generic placeholders + your own C++-registered nodes", "630 shipped “Behaviors”", "“Skills” category — installed catalog, e.g. <code>command_multi_axis_gripper</code>", "“Skills” section — the document's own declared actions"),
    ("Condition leaf, as its own UI category", "yes — separate Condition palette group (contents unconfirmed, collapsed in capture)", "no — folded into “Behavior,” no Condition filter value exists", "not surfaced separately in the menus seen", "yes — separate “Conditions” section"),
    ("Blackboard write as its own node", "✓ SetBlackboard / UnsetBlackboard", "via the <code>Script</code> behavior", "backend <code>Data</code> node — not seen in top-level menu", "✓ SetBlackboard / UnsetBlackboard"),
    ("Debug / breakpoint tooling", "PRO tier: interactive breakpoints, fault injection, live node substitution", "no breakpoints; 10.0.0 instead auto-outlines a failed branch in red after a Run", "<strong>Debugging</strong> menu category (unexpanded); backend has a real <code>Debug</code> node + <code>Breakpoint</code> (BEFORE/AFTER, <code>fail_on_resume</code>)", "none — no live executor/monitor mode exists yet"),
    ("Disable a node without deleting it", "not confirmed", "✓ “Comment out” in the floating selection toolbar", "not confirmed", "not present"),
    ("Icon differentiation across control/decorator types", "per-family colour + glyph (Control = pink, others unconfirmed on canvas)", "per-type colour, consistent across the whole catalog (red/purple/teal/yellow)", "<strong>one generic crossing-arrows glyph for all five Control-flow items</strong> — no per-type differentiation", "per-primitive distinct glyph — the richest differentiation of the four"),
]


# ------------------------------------------------------------------------------ menus


def flowstate_mockup() -> str:
    """A faithful HTML/CSS recreation of the 'Add Process' menu from firsthand
    screenshots — not a screenshot itself, since the source images only exist
    pasted into chat with no exportable file. Captioned as a recreation."""

    def item(icon: str, label: str) -> str:
        return f'<div class="fs-item"><span class="fs-icon">{icon}</span><span>{esc(label)}</span><span class="fs-chev">›</span></div>'

    top = "".join(item(i, l) for i, l in [("✦", "Skills"), ("⨯", "Control flow"), ("•••", "Transition"), ("\U0001f527", "Debugging")])
    control = "".join(item("⨯", l) for l in ["Group", "Branch", "Loop", "Retry", "Fail"])
    transition = "".join(item("•••", l) for l in ["Parallel", "Selector"])
    return f"""
    <div class="fs-menus">
      <div class="fs-menu"><div class="fs-header">+ Add Process</div>{top}</div>
      <div class="fs-menu"><div class="fs-back">← Back</div>{control}<div class="fs-label">Control flow</div></div>
      <div class="fs-menu"><div class="fs-back">← Back</div>{transition}<div class="fs-label">Transition</div></div>
    </div>
    """


# --------------------------------------------------------------------------- render


def render(measured: dict) -> str:
    models = measured["models"]
    total = len(models)
    by_kind = measured["by_kind"]

    groot2_table = rows_html(GROOT2_ROWS)
    moveitpro_table = rows_html(MOVEITPRO_ROWS)
    systemsketch_table = rows_html(systemsketch_rows(models))
    comparison_table = rows_html(COMPARISON_ROWS)

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Node primitives across Groot2, MoveIt Pro, Flowstate &amp; SystemSketch · {STAMP}</title>
<style>
body{{margin:0;padding:32px 40px 80px;font:15px/1.6 Inter,ui-sans-serif,system-ui;color:#27272a;background:#fafafa;max-width:1480px}}
h1{{font-size:28px;margin:0 0 6px}} h2{{font-size:20px;margin:44px 0 12px;padding-top:16px;border-top:1px solid #e4e4e7}} h3{{font-size:16px;margin:22px 0 8px}}
.lede{{color:#52525b;max-width:960px}} code{{font:13px ui-monospace,Menlo,monospace;background:#f4f4f5;padding:1px 5px;border-radius:4px}}
figure{{margin:16px 0;padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px}} figure img{{width:100%;height:auto;display:block;border-radius:6px;background:#1e1e2a}}
figcaption{{margin-top:10px;color:#52525b;font-size:13px}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}}
table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;font-size:13.5px}}
th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid #f0f0f2;vertical-align:top}} th{{background:#f4f4f5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.02em;color:#52525b}}
tr:last-child td{{border-bottom:none}} .note{{color:#52525b;max-width:960px}}
.kpis{{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0}} .kpi{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:10px 16px;min-width:150px}} .kpi b{{display:block;font-size:22px}} .kpi span{{color:#71717a;font-size:13px}}
.tag{{display:inline-block;background:#f4f4f5;color:#52525b;border-radius:5px;padding:1px 7px;font-size:11px;white-space:nowrap}}
.decision{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;max-width:1000px}} .decision h3{{margin-top:14px}}
.fs-menus{{display:flex;gap:14px;flex-wrap:wrap;font-family:Inter,ui-sans-serif;margin:14px 0}}
.fs-menu{{background:#fff;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.10);min-width:210px;overflow:hidden;border:1px solid #ececf3}}
.fs-header{{background:#7c5cff;color:#fff;font-weight:700;padding:12px 14px;font-size:14px}}
.fs-back{{padding:10px 14px;font-weight:700;color:#27272a;font-size:13px;border-bottom:1px solid #f0f0f4}}
.fs-label{{padding:8px 14px;color:#a1a1aa;font-size:11px;text-transform:uppercase;letter-spacing:.04em}}
.fs-item{{display:flex;align-items:center;gap:10px;padding:11px 14px;font-size:13.5px;border-bottom:1px solid #f5f5f8;color:#27272a}}
.fs-item:last-of-type{{border-bottom:none}} .fs-icon{{width:18px;text-align:center;color:#52525b}} .fs-chev{{margin-left:auto;color:#c4c4cc}}
.unknown{{color:#b45309;font-weight:600}} .confirmed{{color:#15803d;font-weight:600}}
</style></head><body>

<h1>Node primitives: Groot2, MoveIt Pro, Intrinsic Flowstate &amp; SystemSketch</h1>
<p class="lede">Not the skills you author yourself &mdash; the built-in structural vocabulary each editor ships to click-and-insert: control nodes, decorators, and the leaf/subtree scaffolding around them. Built for the Behavior Tree rebuild's Process view, whose own directive says to copy Flowstate's grammar &mdash; this is the reference material for that call. SystemSketch's column is read live from <code>src/behaviorTree/btcppXml.ts</code> at <code>{esc(measured['branch'])}</code> / <code>{esc(measured['head'])}</code>{' (uncommitted edits present)' if measured['dirty'] else ''}, {STAMP}.</p>
<p class="note">Two reports already cover adjacent ground and aren't superseded by this one: the <a href="behavior-tree-moveit-groot-prior-art-2026-09-04.html">MoveIt Studio Pro · BehaviorTree.CPP · Groot2 prior-art atlas</a> (28 entries, Copy/Adapt/Defer decisions across the whole editor &mdash; palette, inspector, runtime, replay, testing, not just node types) and the <a href="behavior-tree-representations-research-2026-09-04.html">behavior tree representations research</a> gallery (AICA + MoveIt Studio Pro + Flowstate &rarr; the Tree/Process/Data-Contract lens grammar the current rebuild implements). Neither had an exhaustive Flowstate node catalog &mdash; <code>Flowstate</code> and <code>Selector</code> don't appear in the atlas at all, and Flowstate's own docs didn't exist to atlas from until today's firsthand screenshots of its actual &ldquo;Add Process&rdquo; menu. This report is narrower and more current: just the insertable node vocabulary, cross-checked against the Behaviors library as it stands <em>after</em> the 2026-09-05 rebuild (<code>6e55e90</code>), plus two things neither prior report had: Intrinsic's own open-source SDK (found during this research) and MoveIt Pro's Sept 2026 10.0.0 editor changes.</p>

<div class="kpis">
  <div class="kpi"><b>{total}</b><span>SystemSketch built-in models</span></div>
  <div class="kpi"><b>{len(by_kind.get('control', []))}</b><span>Control kinds</span></div>
  <div class="kpi"><b>{len(by_kind.get('decorator', []))}</b><span>Decorator kinds</span></div>
  <div class="kpi"><b>3</b><span>reference tools researched</span></div>
</div>

<h2>Groot2 &mdash; the official BehaviorTree.CPP editor</h2>
<p class="note">Groot2 is not a curated subset of a smaller vocabulary &mdash; its palette mirrors the live BT.CPP node registry, read at runtime from a <code>TreeNodesModel</code> your C++ program emits, and it is <em>larger</em> than what BT.CPP's own tutorial docs enumerate. Its own docs describe Fallback as &ldquo;known as Selector or Priority in other frameworks&rdquo; &mdash; language Flowstate's own UI echoes almost exactly with its &ldquo;Selector&rdquo; menu item. The frame below is a real decoded still from Groot2's own product-demo video (behaviortree.dev/assets/medias/groot2_editor&hellip;mp4, t=8s): built-in nodes render as plain black text with no icon; the project's own custom nodes (<code>ApproachObject</code>, <code>CloseGripper</code>, <code>GoTo</code>, <code>OpenGripper</code>) get a small pencil glyph and blue-purple text, interleaved alphabetically in the same category list rather than split into their own section.</p>
<figure><img src="{data_uri(ASSETS / 'groot2-editor.png')}" alt="Groot2 editor, a decoded frame from its own demo video"><figcaption><strong>Groot2's real editor</strong> &mdash; Models palette (Action / Condition / Control groups) at bottom-left, canvas mid drag-and-drop at right. Frame extracted directly from Groot2's own marketing demo video.</figcaption></figure>
<table><tr><th>Name</th><th>Category</th><th>What it does</th><th>Note</th></tr>{groot2_table}</table>

<h2>MoveIt Pro &mdash; PickNik's Objective / Behavior Tree editor</h2>
<p class="note">PickNik states this outright, not something to infer: <em>&ldquo;MoveIt Pro is built on top of the standard BehaviorTree.CPP library, though we have our own tightly integrated Behavior Tree editor and debugging environment.&rdquo;</em> It layers its own 4-way, colour-coded taxonomy on top of BT.CPP's registry (diagrams below, pulled directly from PickNik's own docs), adds a handful of its own decorators (<code>SuppressChildErrors</code>, <code>ForEach</code>/<code>ForEachUntilSuccess</code>, the 9.3+ deadlock-safe <code>RepeatUnlessFailure&hellip;</code> family), and folds BT.CPP's Condition concept into a plain &ldquo;Behavior&rdquo; tag rather than exposing it as its own filterable type. Its Sept 2026 (10.0.0) release added <strong>Ctrl+G &ldquo;Group Under Sequence&rdquo;</strong> &mdash; wrap a multi-node selection in a new Sequence in one keystroke &mdash; and a live red outline that highlights the failed branch when a Run fails and you switch back to Edit.</p>
<div class="grid">
<figure><img src="{data_uri(ASSETS / 'moveitpro-node-types.png')}" alt="MoveIt Pro's 4-way node taxonomy"><figcaption>The 4-way taxonomy: Actions/teal, Subtrees/yellow, Control Nodes/red, Decorators/purple.</figcaption></figure>
<figure><img src="{data_uri(ASSETS / 'moveitpro-control-nodes.png')}" alt="MoveIt Pro Sequence, Fallback, Parallel icons"><figcaption>Sequence, Fallback, Parallel &mdash; real icons from PickNik's own docs.</figcaption></figure>
<figure><img src="{data_uri(ASSETS / 'moveitpro-decorator-nodes.png')}" alt="MoveIt Pro Inverter, Repeat, KeepRunningUntilFailure icons"><figcaption>Inverter, Repeat, KeepRunningUntilFailure &mdash; the Decorator family's paintbrush icon.</figcaption></figure>
<figure><img src="{data_uri(ASSETS / 'moveitpro-objective-terminology.png')}" alt="Objective / Subtree / Behavior terminology diagram"><figcaption>Objective &rarr; Subtree Objective &rarr; Behavior nesting, plus MTC Task as a specialised nested Behavior.</figcaption></figure>
</div>
<table><tr><th>Name</th><th>Category</th><th>What it does</th><th>Note</th></tr>{moveitpro_table}</table>

<h2>Intrinsic Flowstate &mdash; the reference the Process view is meant to copy</h2>
<p class="note">Flowstate has been in a gated beta since May 2023 with no public docs site &mdash; <code>docs.intrinsic.ai</code> and <code>developers.intrinsic.ai</code> don't resolve. This section is built from firsthand screenshots of the &ldquo;Add Process&rdquo; menu, recreated below as a faithful HTML mockup (not an original screenshot &mdash; the source images have no exportable file), cross-checked against a genuine primary source found during research: Intrinsic publishes an Apache-2.0 open-source SDK on GitHub (<code>intrinsic-ai/sdk</code>) whose README states it exists to write code for Flowstate, and whose <code>behavior_tree.proto</code> is confirmed by an in-repo comment to be exactly what &ldquo;the graphical Flowstate Process editor&rdquo; edits. That gave real operational semantics for five of the menu's items &mdash; but not the exact UI-label-to-backend-type mapping, and not what &ldquo;Transitions&rdquo; contains beyond the two items now confirmed by screenshot.</p>
{flowstate_mockup()}
<table>
<tr><th>Name</th><th>Category</th><th>What it does</th><th>Status</th></tr>
<tr><td>Skills</td><td>Add Process</td><td>Searchable &ldquo;Installed skills&rdquo; leaf-action library &mdash; <code>attach_object_to_robot</code>, <code>calibrate_hand_eye</code>, <code>command_multi_axis_gripper</code>, etc. Backend: a <code>Task</code> node calling a catalog skill by ID, parameters bound via CEL expressions off a shared &ldquo;blackboard.&rdquo;</td><td class="confirmed">firsthand + SDK</td></tr>
<tr><td>Group</td><td>Control flow</td><td>UI label only &mdash; no backend node literally called &ldquo;Group.&rdquo; Best-supported candidate: <code>SubTree</code>, whose own SDK docstring reads &ldquo;usually used to group components into a subtree.&rdquo; A named/collapsible wrapper, not a bare AND-container.</td><td class="unknown">inferred</td></tr>
<tr><td>Branch</td><td>Control flow</td><td>Backend <code>BranchNode</code>: one <code>if</code> condition, one <code>then</code> child, one <code>else</code> child &mdash; binary if/then/else, not a fallback chain. The canvas-node tooltip reading &ldquo;Fallback&rdquo; (separate screenshot) is not explained by this node alone &mdash; see note below.</td><td class="confirmed">SDK (node); tooltip mechanism unconfirmed</td></tr>
<tr><td>Loop</td><td>Control flow</td><td>Backend <code>LoopNode</code>: repeats a <code>do</code> child until a <code>while</code> condition goes false, the child fails, or <code>max_times</code> is hit.</td><td class="confirmed">SDK</td></tr>
<tr><td>Retry</td><td>Control flow</td><td>Backend <code>RetryNode</code>: a real <code>max_tries</code> count, plus an <em>optional recovery subtree</em> run before re-trying &mdash; not merely a boolean retry-on-fail toggle.</td><td class="confirmed">SDK</td></tr>
<tr><td>Fail</td><td>Control flow</td><td>Backend <code>FailNode</code>: a childless leaf whose sole purpose is to force FAILURE on purpose, so a Fallback/Retry/Branch above it reacts &mdash; a deliberate control-flow primitive, not a stand-in for a crash.</td><td class="confirmed">SDK</td></tr>
<tr><td>Parallel</td><td>Transition</td><td>All children run concurrently; succeeds once all succeed, fails if any fails.</td><td class="confirmed">firsthand + SDK</td></tr>
<tr><td>Selector</td><td>Transition</td><td>Ordered <code>(condition, child)</code> list. Intrinsic's own <code>.proto</code> comment and its Python docstring describe this two different ways (condition-dispatch vs. try-until-success) &mdash; an inconsistency in Intrinsic's own source, not resolved here.</td><td class="confirmed">firsthand; semantics ambiguous in the SDK itself</td></tr>
<tr><td>Debugging</td><td>Add Process</td><td>Unexpanded in every screenshot seen so far. Backend has a real <code>Debug</code> node (suspends execution, <code>fail_on_resume</code> to force a paused point to resume as failure) plus a separate <code>Breakpoint</code> concept (BEFORE/AFTER a node id) &mdash; a strong match for Zach's own guess.</td><td class="unknown">unconfirmed contents, plausible backend match</td></tr>
</table>
<p class="note"><strong>Not in the top-level menu, but present in the backend schema:</strong> plain <code>Sequence</code>, plain <code>Fallback</code> (classic BT.CPP-style ordered-tries OR, distinct from Selector), and a <code>Data</code> node (create/update/delete a blackboard value). Their absence from the palette lines up with press coverage describing an &ldquo;expert mode&rdquo; for hand-editing beyond what the graphical palette exposes &mdash; the five-item Control-flow submenu reads as a simplified, renamed subset of a larger vocabulary, not the complete node set.</p>
<p class="note">Execution model, confirmed from the SDK: proprietary protobuf tree + CEL expressions + a blackboard, evaluated by &ldquo;the executive&rdquo; &mdash; <strong>not</strong> BehaviorTree.CPP, and node states are custom (<code>ACCEPTED</code>, <code>SELECTED</code>, <code>EVALUATING_CONDITION</code>, <code>READY</code>, <code>RUNNING</code>, <code>SUCCEEDED</code>, <code>FAILED</code>, <code>SUSPENDED</code>, <code>CANCELING</code>, <code>CANCELED</code>) rather than BT.CPP's four-state model. Flowstate is the odd one out of the three references on this specific point &mdash; Groot2 and MoveIt Pro are both literally BT.CPP.</p>

<h2>SystemSketch today</h2>
<p class="note">Everything below comes straight out of <code>BT_BUILTIN_MODELS</code> in <code>src/behaviorTree/btcppXml.ts</code> &mdash; the Behaviors library panel (Recents / Skills / Conditions / Behavior Trees / Controls / Decorators) unions this list with whatever the open document declares, so this table cannot silently drift from what a user can actually click to insert.</p>
<table><tr><th>Name</th><th>Category</th><th>Description</th><th></th></tr>{systemsketch_table}</table>

<h2>Cross-tool comparison</h2>
<table><tr><th>Primitive</th><th>Groot2 / BT.CPP</th><th>MoveIt Pro</th><th>Intrinsic Flowstate</th><th>SystemSketch (today)</th></tr>{comparison_table}</table>

<h2>What this means for the rebuild</h2>
<div class="decision">
<h3>Gaps worth closing</h3>
<ul>
<li><strong>No &ldquo;wrap selection in a named group&rdquo; convenience.</strong> Both reference tools converged on this independently &mdash; Flowstate's <code>Group</code> and MoveIt Pro's brand-new (Sept 2026) Ctrl+G &ldquo;Group Under Sequence.&rdquo; SystemSketch's Behaviors library inserts raw node types only; there's no one-click way to name and collapse a run of existing nodes into a Sequence. Directly relevant to the Process view, whose own directive names a &ldquo;titled group frame&rdquo; as the visual for a named Sequence.</li>
<li><strong>AsyncSequence and AsyncFallback are missing.</strong> Both are current BT.CPP v4.8 registry members (confirmed live from behaviortree.dev's own docs, and AsyncFallback was directly observed in Groot2's own palette) with real reactive-parent semantics distinct from the existing Reactive* variants. SystemSketch's model instead carries the legacy v3 <code>SequenceStar</code> alias, suggesting the pinned reference version predates this split.</li>
<li><strong>Retry has no built-in recovery slot.</strong> Flowstate's <code>RetryNode</code> takes an optional recovery subtree run before each re-try; SystemSketch's (and BT.CPP's) <code>RetryUntilSuccessful</code> is count-only. Composable today via a Fallback wrapping a recovery Sequence, but not a single node &mdash; worth a call on whether the Process view should offer the composed pattern as one insertable unit.</li>
<li><strong>No disable-without-delete.</strong> MoveIt Pro's floating selection toolbar has a &ldquo;Comment out&rdquo; action (disables a node in place, distinct from Delete). No SystemSketch equivalent &mdash; this corroborates the prior-art atlas's own A11 (&ldquo;Disable / skip without deletion&rdquo;), already decided Copy/adapt there; nothing new to decide, just a second independent source agreeing.</li>
</ul>
<h3>Validated by comparison</h3>
<ul>
<li><strong>Per-primitive icon differentiation is the majority pattern.</strong> Groot2 and MoveIt Pro both give every control/decorator kind its own glyph and colour family; Flowstate is the outlier, using one generic crossing-arrows icon for all five Control-flow items. SystemSketch already differentiates per node (<code>btGlyphFor</code> in <code>behaviorTreeModel.ts</code>) &mdash; no change indicated here.</li>
<li><strong>Fail as a dedicated forced-failure leaf is already covered.</strong> Flowstate's <code>Fail</code> and SystemSketch's existing <code>AlwaysFailure</code> are the same primitive under different names &mdash; a naming/copy decision for the Process view, not a missing capability.</li>
<li><strong>&ldquo;Selector&rdquo; as Flowstate's word for Fallback matches BT.CPP's own docs</strong> (&ldquo;known as Selector or Priority in other frameworks&rdquo;), which strengthens the case for using that word in the Process view specifically, while keeping <code>Fallback</code> as the underlying XML/Tree-view name &mdash; the naming split the rebuild directive already implies by having two views on one canonical document.</li>
</ul>
<h3>Open questions &mdash; needs more evidence</h3>
<ul>
<li><strong>Flowstate's &ldquo;Debugging&rdquo; menu contents</strong> are still unexpanded in every screenshot seen. The backend <code>Debug</code>/<code>Breakpoint</code> concept is a strong candidate match (Zach's own guess going in), but nothing confirms the UI actually exposes it there rather than elsewhere.</li>
<li><strong>The &ldquo;Fallback&rdquo; tooltip on a Branch-shaped canvas node</strong> is still unexplained &mdash; the SDK has three textually distinct dispatch node types (Branch, Selector, Fallback) and nothing in the public source describes a single node with a switchable mode.</li>
<li><strong>Two step-by-step videos</strong> were mentioned as available for cross-reference but weren't located in a vault sweep (Sources/Voice Notes, Notion Import, Apple Notes, video files by name/date) &mdash; point me at them directly if you want their content folded in.</li>
</ul>
</div>

<h2>Sources &amp; method</h2>
<ul class="note">
<li>Groot2: <a href="https://www.behaviortree.dev/docs/nodes-library/">live Nodes Library docs (v4.8)</a>, driven in a real browser; the palette frame is decoded directly from Groot2's own demo video.</li>
<li>MoveIt Pro: <a href="https://docs.picknik.ai/concepts/behavior_trees/">docs.picknik.ai</a> and the live, filterable <a href="https://picknik.ai/behaviors/">Behaviors Hub</a> catalog (630 Behaviors / 185 Objectives / 44 Categories, MoveIt Pro 10.0.0, Aug 2026), plus dated release notes for the 9.3.0 and 10.0.0 editor changes.</li>
<li>Flowstate: firsthand screenshots of the live &ldquo;Add Process&rdquo; menu, cross-checked against <a href="https://github.com/intrinsic-ai/sdk">github.com/intrinsic-ai/sdk</a> (<code>behavior_tree.proto</code>, <code>behavior_tree.py</code>, <code>process_asset.proto</code>).</li>
<li>SystemSketch: <code>src/behaviorTree/btcppXml.ts</code> (<code>BT_BUILTIN_MODELS</code>) and <code>behaviorLibraryModel.ts</code>, read live at build time.</li>
</ul>

</body></html>
"""


def main() -> None:
    measured = measure()
    OUT.write_text(render(measured))
    print(OUT)


if __name__ == "__main__":
    main()
