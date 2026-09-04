#!/usr/bin/env python3
"""Build the self-contained review hub for the gap-analysis implementation tracks."""

from __future__ import annotations

import base64
import html
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/gap-analysis-prototype-review-hub-2026-09-04.html"
RESEARCH_COMMIT = "363792db43f0bf31c74ba7968759776aa3807401"
RESEARCH_PATH = "docs/labview-blueprint-simulink-vocabulary-controls-gap-analysis-2026-09-03.md"


def git_blob(commit: str, path: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"{commit}:{path}"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    return result.stdout


def image_data(commit: str, path: str) -> str:
    return "data:image/png;base64," + base64.b64encode(git_blob(commit, path)).decode("ascii")


def e(value: object) -> str:
    return html.escape(str(value), quote=True)


# Every record is pinned to a committed, independently reviewable branch. The
# builder reads its evidence with `git show`, so rebuilding this merged report
# never depends on a mutable worktree or whichever Preview happens to be open.
TRACKS = [
    {
        "group": "vocabulary",
        "title": "Semantic stock Blocks",
        "branch": "track/semantic-stock-blocks",
        "commit": "300a45697be5763983388764476f2cf9b01aabb4",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Three repair rounds closed schema, truthfulness, description/export fidelity, malformed-V7 import, Select predicate visibility, linked-definition, and picker-journey gaps; final independent re-audit found no material remainder.",
        "summary": "Ships Set attributes, Select, and Clock / Trigger through the existing semantic Block picker. Set attributes keeps stable member-row identities; Select remains a value operation; Clock records intent without pretending a scheduler exists.",
        "proof": [
            "The three presets use ordinary Block records, ports, and cables.",
            "Set attributes can add and rename batched member rows without detaching their cables.",
            "Clock declares source/rate intent without adding scheduler or runtime state.",
        ],
        "limits": "No Python analyzer installs these automatically. If combined with the later quick-insert branch, Bundle supersedes the report-era Set attributes name while Select and Clock remain; semantic port roles stay a separate concern.",
        "tests": "70 focused tests, full check (1,164 Vitest + 115 Python), stock-boundary checks, and the 12-assertion real-picker browser journey passed on the audited head.",
        "shot": "sketches/review/semantic-stock-blocks.png",
        "gallery": "http://127.0.0.1:4662/docs/semantic-stock-blocks-gallery-2026-09-04.html",
        "board": "http://127.0.0.1:4662/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fsemantic-stock-blocks-audit-r3-20260904-300a45697be5%2Fsketches%2Freview%2Fsemantic-stock-blocks.systemsketch",
    },
    {
        "group": "vocabulary",
        "title": "Port-owned semantic roles",
        "branch": "track/semantic-role-inheritance",
        "commit": "601334a6b878f2e7a30849095a9a811355b89ecf",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Independent audit/repair closed stale provenance, Pill normalization, malformed-endpoint, Branch-cue, and accessibility gaps; re-audit found no material remainder.",
        "summary": "Tags Data, Event, Configuration, State, Control, and Error at the port that owns the meaning. Connected wires derive the role live; no second role fact is persisted on a cable, and endpoint disagreements remain legal but visible.",
        "proof": [
            "Authored claims override retained analyzer-derived claims; clearing reveals analysis again.",
            "Source role wins, sink role is a fallback, and explicit disagreement gets a warning.",
            "The ordinary data plane remains the transport for events, errors, state, and configuration.",
        ],
        "limits": "This branch supplies the role vocabulary and live inheritance, not an analyzer that discovers claims from Python. Source and sink can disagree without making the exploratory cable illegal.",
        "tests": "53 focused tests, semantic-role browser journey, build, and full check (1,158 Vitest + 115 Python) passed; smoke is idempotent.",
        "shot": "docs/assets/semantic-role-inheritance-smoke-2026-09-04.png",
        "gallery": "http://127.0.0.1:4638/docs/semantic-role-inheritance-implementation-2026-09-04.html",
        "board": "http://127.0.0.1:4638/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fsemantic-role-inheritance-audit-20260904-601334a6b878%2Fsketches%2Freview%2Fsemantic-role-inheritance.systemsketch",
    },
    {
        "group": "navigation",
        "title": "Depth breadcrumbs + visit history",
        "branch": "track/depth-breadcrumb-navigation",
        "commit": "ac007d060b7b30e3593de2572aa987c66d4245f6",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Repair closed camera, ancestry, Overview, page, history, smoke, and list-semantics gaps. Final re-audit found no material remainder in function or accessibility.",
        "summary": "Composes structural navigation with chronology: Step In still isolates a real Expanded Block; Up and selectable crumbs move through ancestry; Back and Forward replay safe session visits with camera and selection snapshots.",
        "proof": [
            "Board Overview routes through the same navigation transaction.",
            "Deleted targets are skipped and a divergent visit clears Forward history.",
            "Navigation state stays session-local rather than becoming board semantics.",
        ],
        "limits": "This branch does not include named landmarks. It keeps structural ancestry distinct from chronological visits and intentionally stores neither in board records.",
        "tests": "Full check (1,158 Vitest + 115 Python), depth browser suite twice, Step In browser suite twice, and clean/idempotent screenshot proof passed.",
        "shot": "docs/assets/depth-breadcrumb-navigation-2026-09-04.png",
        "gallery": "http://127.0.0.1:4650/docs/depth-breadcrumb-navigation-2026-09-04.html",
        "board": "http://127.0.0.1:4650/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fdepth-breadcrumb-navigation-aria-ac007d060b7b%2Fsketches%2Freview%2Fdepth-breadcrumb-navigation.systemsketch",
    },
    {
        "group": "navigation",
        "title": "Named board landmarks",
        "branch": "track/named-landmarks",
        "commit": "d8ea2bba9c482b9a50d621df391946396255361f",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Two repair rounds closed future-version overwrite, multi-page loss, undo/read-only, zoom-coordinate, bounded-name, locale, and smoke-idempotence findings; final re-audit found no material remainder.",
        "summary": "Adds camera bookmarks beside Board Overview: save the current view, jump, rename, and delete. A jump changes camera only, leaving selection, tool, board structure, and source meaning alone.",
        "proof": [
            "Landmarks travel with the board instead of browser-local storage.",
            "Camera-only jump is intentionally distinct from pages, Frames, and depth isolation.",
            "The existing structural overview remains present below the saved views.",
        ],
        "limits": "Landmarks remain camera bookmarks, not pages or depth claims. Secondary-page imports merge readable views and retain the original page metadata on their imported Frame.",
        "tests": "10/10 focused model checks, 9/9 browser checks twice cleanly, 28/28 physical migration checks at 0.5× and 2×, full check (1,159 Vitest + 115 Python).",
        "shot": "docs/assets/named-landmarks-panel-2026-09-04.png",
        "gallery": "http://127.0.0.1:4640/docs/named-landmarks-gallery-2026-09-04.html",
        "board": "http://127.0.0.1:4640/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fnamed-landmarks-camera-fix-20260904-d8ea2bba9c48%2Fsketches%2Freview%2Fnamed-landmarks.systemsketch",
    },
    {
        "group": "observation",
        "title": "Bounded propagation focus",
        "branch": "track/propagation-focus",
        "commit": "22ab25fff32410daa479a16378946a3702fd0ff2",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Two repair rounds closed shortcuts, admission, invalid seeds, layer composition, bounds, evidence, remounted hosts, and page-wide reactive cost; final re-audit found no material remainder.",
        "summary": "Select a Block or settled cable, then highlight a chosen number of upstream and downstream graph steps. The lens follows real bindings with fan-in, fan-out, and cycle protection while unrelated shapes fade.",
        "proof": [
            "The highlighted set contains existing shape and cable identities only.",
            "Upstream and downstream bounds are independent and capped.",
            "Clear, Escape, selection change, or seed deletion removes the nonpersistent lens.",
        ],
        "limits": "It is a nonpersistent reading lens, not simulation or a board-wide semantic table. Malformed and in-progress cables remain drawable but are deliberately excluded from traversal.",
        "tests": "Full check (1,158 Vitest + 115 Python) and the 8-check propagation browser suite twice passed with a clean tree.",
        "shot": "docs/assets/propagation-focus-live-2026-09-04.png",
        "gallery": "http://127.0.0.1:4654/docs/propagation-focus-implementation-2026-09-04.html",
        "board": "http://127.0.0.1:4654/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fpropagation-focus-index-repair-20260904-22ab25fff324%2Fsketches%2Freview%2Fpropagation-focus.systemsketch",
    },
    {
        "group": "observation",
        "title": "Runtime adapter evidence",
        "branch": "track/runtime-adapter-evidence",
        "commit": "af633dbc26d31b0146461c48f9e7b5124c330c4f",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Two audit/repair rounds closed adapter lifecycle, stale callback, host bootstrap, capability, snapshot immutability, and smoke-fixture hygiene findings.",
        "summary": "Shows Run / Pause / Stop only when a concrete adapter is installed, records opt-in trace evidence, replays captured values, and keeps probes read-only. The review adapter is a safe in-memory recorded demo, never arbitrary execution.",
        "proof": [
            "Adapter-reported capabilities gate both visible state and command dispatch.",
            "Replacing or uninstalling an adapter unsubscribes and disposes it exactly once; stale events are ignored.",
            "Snapshots and trace evidence are copied/frozen and never persisted into the board.",
        ],
        "limits": "No process, network, Python execution, source-revision mapping, or persistent trace store. A real adapter remains a separate high-authority integration.",
        "tests": "9/9 focused model checks, 8/8 browser checks twice, full check (1,158 Vitest + 115 Python), clean worktree.",
        "shot": "docs/assets/runtime-adapter-evidence-live-2026-09-04.png",
        "gallery": "http://127.0.0.1:4632/docs/runtime-adapter-evidence-2026-09-04.html",
        "board": "http://127.0.0.1:4632/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fruntime-adapter-evidence-r3-20260904-af633dbc26d3%2Fsketches%2Freview%2Fruntime-adapter-evidence.systemsketch&runtime=recorded-demo",
    },
    {
        "group": "behavior",
        "title": "Python behavior-tree projections",
        "branch": "track/behavior-tree-projections",
        "commit": "ddfcdb255bb79d6106b7e09442e2ff06cafa5062",
        "base": "8169d4b107e6813a369af94bf91347d35a4fccbe",
        "status": "audited",
        "audit": "Five adversarial repair rounds closed py_trees count semantics, IR strictness, Process readability, cold dependency bootstrap, all-directory atomic promotion, caller-profile isolation, stale-artifact retention, and partial-allocation cleanup. Final independent re-audit found no material remainder.",
        "summary": "Builds one versioned IR from a real py_trees 2.5.0 object graph, then generates three cold-reopened SystemSketch boards: classic Tree, process-shaped reading, and explicit dataflow overlay.",
        "proof": [
            "Ordered child identity comes from executable Python constructors.",
            "All projectors consume the same canonical IR rather than tracing screenshots.",
            "Generated boards and recipes make every projection independently inspectable.",
        ],
        "limits": "This is an offline Python projection laboratory. It does not register a live tldraw shape, toolbar command, node editor, evaluator, or runtime trace.",
        "tests": "Bootstrap/stale/rollback suites, two fresh detached cold bootstraps, three board cold reopens, stable canonical hashes, and full check (1,150 Vitest + 117 Python) passed on the independently audited head.",
        "shot": "prototypes/behavior_trees/tree_view/generated/sample-tree-view.png",
        "gallery": "http://127.0.0.1:4608/docs/behavior-tree-projections-prototype-2026-09-04.html",
        "board": "http://127.0.0.1:4608/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fbehavior-tree-projections-repair5-ddfcdb2-ddfcdb255bb7%2Fsketches%2Freview%2Fbehavior-tree-projections-v2.systemsketch",
    },
    {
        "group": "behavior",
        "title": "Live Behavior Tree canvas",
        "branch": "track/behavior-tree-prototype",
        "commit": "9a66ad52982e2fd027c3254be9a6fa812e8b08fd",
        "base": "363792db43f0bf31c74ba7968759776aa3807401",
        "status": "audited",
        "audit": "Two repair rounds closed portability, graph/version invariants, keyboard/resize, evidence, embedded-host registration, and empty-composite gaps; final independent re-audit found no material remainder.",
        "summary": "Adds one persisted Behavior Tree shape with root identity, typed nodes, ordered children, and declared read/write contracts. Three tabs derive a top-to-bottom Tree, cautious Process reading, and focused Data Contract reading from that same body.",
        "proof": [
            "The System-family tool uses tldraw's stock box creation/resize/history seams.",
            "Switching views changes a persisted presentation choice, never the canonical tree.",
            "No fake tick status, evaluator, runtime trace, or inferred global data wire appears.",
        ],
        "limits": "No node authoring/reorder UI, occurrence-reference DAG semantics, subtree/source projection, evaluator, runtime status/trace, or adapter yet. The live slice and offline py_trees projector remain separate review choices.",
        "tests": "Full check (1,159 Vitest + 115 Python), standalone and embedded-host browser journeys, and portable-export smoke twice passed; tracked evidence stayed byte-identical.",
        "shot": "sketches/review/behavior-tree-prototype.png",
        "gallery": "http://127.0.0.1:4646/docs/behavior-tree-canvas-prototype-2026-09-04.html",
        "board": "http://127.0.0.1:4646/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fbehavior-tree-prototype-embed-audit-20260904-9a66ad52982e%2Fsketches%2Freview%2Fbehavior-tree-prototype.systemsketch",
    },
    {
        "group": "vocabulary",
        "title": "Bundle / Unbundle / Copy quick insert",
        "branch": "track/bundle-unbundle-copy-quick-insert",
        "commit": "7e8673b1265521b6922dd77406ff7e88565d3596",
        "base": "363792db43f0bf31c74ba7968759776aa3807401",
        "status": "audited",
        "audit": "Independent audit found the completed track clean; focused browser coverage (33/33), legacy unknown/projection browser coverage (33/33), and the full check all passed.",
        "summary": "Adds canonical Bundle (a retained record with stable .field member-update rows), Unbundle (a projection with accessors), and shallow Copy. All three lead the loose-terminal drop picker while remaining ordinary Blocks and cables.",
        "proof": [
            "Exact port IDs and direction, undo/cancel/read-only/reload, keyboard use, and edge clamping are proven.",
            "Bundle preserves its named update record and stable member rows instead of mutating or generically joining a tuple.",
            "Only proven V6 projection upgrades to unbundle; authored split, merge, and set-attributes stay literal.",
        ],
        "limits": "Quick insertion is for an existing loose-terminal drop, not a settled-edge midpoint +. Copy is shallow rather than deep or runtime-aware. Inherited autosave can briefly serialize an open one-ended cable; reopen cleanup removes it.",
        "tests": "Focused browser 33/33; legacy unknown/projection browser 33/33; full check (1,157 Vitest + 115 Python); independent audit clean.",
        "shot": "docs/assets/bundle-unbundle-copy-quick-insert-picker.png",
        "gallery": "http://127.0.0.1:4610/docs/bundle-unbundle-copy-quick-insert-2026-09-04.html",
        "board": "http://127.0.0.1:4610/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fbundle-quick-insert-7e8673b-7e8673b12655%2Fsketches%2Freview%2Fbundle-unbundle-copy-quick-insert.systemsketch",
    },
]


def track_card(track: dict[str, object], index: int) -> str:
    image = image_data(str(track["commit"]), str(track["shot"]))
    proof = "".join(f"<li>{e(item)}</li>" for item in track["proof"])
    card_id = str(track.get("id") or re.sub(r"[^a-z0-9]+", "-", str(track["title"]).lower()).strip("-"))
    return f"""
      <article class="track" id="track-{e(card_id)}" data-group="{e(track['group'])}" data-status="{e(track['status'])}">
        <div class="track__number">{index:02d}</div>
        <figure><img src="{image}" alt="Committed SystemSketch evidence for {e(track['title'])}" loading="eager" decoding="async"></figure>
        <div class="track__body">
          <div class="track__topline"><span class="group">{e(track['group'])}</span><span class="status status--{e(track['status'])}">{e(track['status'])}</span></div>
          <h3>{e(track['title'])}</h3>
          <p class="summary">{e(track['summary'])}</p>
          <ul>{proof}</ul>
          <div class="audit"><b>Audit state</b><span>{e(track['audit'])}</span></div>
          <div class="limit"><b>Intentional boundary</b><span>{e(track['limits'])}</span></div>
          <p class="tests">{e(track['tests'])}</p>
          <dl><div><dt>branch</dt><dd>{e(track['branch'])}</dd></div><div><dt>commit</dt><dd>{e(str(track['commit'])[:12])}</dd></div><div><dt>base</dt><dd>{e(str(track['base'])[:12])}</dd></div></dl>
          <div class="actions"><a href="{e(track['gallery'])}" aria-label="Open {e(track['title'])} gallery">Open gallery ↗</a><a class="primary" href="{e(track['board'])}" aria-label="Drive {e(track['title'])} review board">Drive review board ↗</a></div>
        </div>
      </article>"""


def main() -> None:
    research = git_blob(RESEARCH_COMMIT, RESEARCH_PATH).decode("utf-8")
    concepts = sum(line.startswith("### ") for line in research.splitlines())
    screenshot_refs = len(set(re.findall(r"docs/assets/gap-[A-Za-z0-9._-]+\.png", research)))
    sources = sum(line.startswith("[") and "]: http" in line for line in research.splitlines())
    cards = "".join(track_card(track, index) for index, track in enumerate(TRACKS, 1))
    OUTPUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gap analysis · independent prototype review hub</title>
<style>
  :root {{ color-scheme:dark; --bg:#071018; --panel:#0e1a24; --panel2:#132331; --ink:#edf5fb; --muted:#9fb0bd; --line:#29404e; --cyan:#55d6be; --blue:#78aefb; --amber:#f5be62; --red:#ff7d83; --green:#71df95; }}
  * {{ box-sizing:border-box }} html {{ scroll-behavior:smooth }} body {{ margin:0; background:radial-gradient(circle at 8% -8%,#173f4a 0,transparent 34rem),radial-gradient(circle at 95% 14%,#1c2e58 0,transparent 38rem),var(--bg); color:var(--ink); font:15px/1.58 Inter,ui-sans-serif,system-ui,sans-serif }}
  a {{ color:#9dc4ff }} main {{ max-width:1480px; margin:auto; padding:52px 28px 100px }} .eyebrow {{ color:var(--cyan); font-size:11px; font-weight:850; letter-spacing:.15em; text-transform:uppercase }}
  h1 {{ max-width:950px; margin:10px 0 18px; font-size:clamp(42px,7vw,88px); line-height:.91; letter-spacing:-.065em }} h2 {{ margin:0 0 9px; font-size:26px; letter-spacing:-.035em }} h3 {{ margin:7px 0 9px; font-size:30px; line-height:1.02; letter-spacing:-.045em }} p {{ color:var(--muted) }} .lede {{ max-width:850px; font-size:19px }}
  .stats {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:32px 0 }} .stat {{ padding:17px 18px; border:1px solid var(--line); border-radius:14px; background:#0a1720cc }} .stat b {{ display:block; color:white; font-size:30px; line-height:1 }} .stat span {{ color:var(--muted); font-size:12px }}
  .banner {{ display:grid; grid-template-columns:1fr auto; gap:20px; align-items:center; margin:26px 0; padding:20px 22px; border:1px solid #2e625a; border-radius:16px; background:linear-gradient(120deg,#0e2a2a,#101f2c) }} .banner p {{ margin:3px 0 0 }} .banner strong {{ color:#baf7db }} .banner a {{ white-space:nowrap; padding:9px 13px; border:1px solid #477c76; border-radius:999px; text-decoration:none }}
  .history {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:9px; margin:20px 0 34px }} .history a {{ min-height:82px; padding:13px; border:1px solid var(--line); border-radius:12px; background:#0d1923; text-decoration:none }} .history b {{ display:block; color:white }} .history small {{ color:var(--muted) }}
  .flow {{ display:grid; grid-template-columns:1fr auto 1fr auto 1fr; gap:12px; align-items:center; margin:18px 0 34px }} .flow__node {{ padding:18px; border:1px solid var(--line); border-radius:14px; background:var(--panel) }} .flow__node b {{ display:block; color:white; margin-bottom:4px }} .flow__node span {{ color:var(--muted); font-size:13px }} .flow__arrow {{ color:var(--cyan); font-size:26px }}
  .scope {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:0 0 18px }} .scope article {{ padding:17px 18px; border:1px solid var(--line); border-radius:14px; background:#0b1720 }} .scope b {{ display:block; margin-bottom:5px; color:white }} .scope span {{ color:var(--muted); font-size:13px }}
  .addendum {{ margin:0 0 34px; padding:17px 18px; border:1px solid #6f5b30; border-radius:14px; background:linear-gradient(120deg,#282111,#151d25) }} .addendum b {{ color:#ffe0a3 }} .addendum p {{ margin:4px 0 0 }}
  .filters {{ position:sticky; top:8px; z-index:20; display:flex; flex-wrap:wrap; gap:7px; margin:30px 0 18px; padding:8px; width:max-content; max-width:100%; border:1px solid var(--line); border-radius:999px; background:#071018e8; backdrop-filter:blur(14px) }} .filters button {{ border:0; border-radius:999px; padding:8px 13px; background:transparent; color:var(--muted); cursor:pointer; font:750 12px/1 inherit }} .filters button[aria-pressed="true"] {{ background:#dffcf6; color:#09241f }}
  .tracks {{ display:grid; gap:22px }} .track {{ position:relative; scroll-margin-top:82px; display:grid; grid-template-columns:minmax(300px,.92fr) minmax(440px,1.08fr); overflow:hidden; border:1px solid var(--line); border-radius:20px; background:linear-gradient(135deg,#101e29,#0a151e); box-shadow:0 24px 70px #0004 }} .track[hidden] {{ display:none }} .track__number {{ position:absolute; top:12px; left:13px; z-index:2; padding:4px 7px; border-radius:6px; background:#071018dd; color:#bdd0dc; font:800 11px/1 ui-monospace,monospace }} figure {{ min-height:420px; margin:0; padding:18px; display:grid; place-items:center; background:#070d12 }} figure img {{ display:block; width:100%; max-height:610px; object-fit:contain; border-radius:11px; box-shadow:0 14px 44px #0008 }} .track__body {{ padding:24px 26px 25px }} .track__topline {{ display:flex; justify-content:space-between; gap:12px; align-items:center }} .group,.status {{ font-size:10px; font-weight:850; letter-spacing:.12em; text-transform:uppercase }} .group {{ color:var(--blue) }} .status {{ padding:5px 8px; border:1px solid var(--line); border-radius:999px; color:var(--muted) }} .status--audited {{ color:var(--green); border-color:#376f49 }} .status--repairing,.status--auditing {{ color:var(--amber); border-color:#715c31 }} .status--research-prototype {{ color:#c6a6ff; border-color:#594778 }}
  .summary {{ margin:0 0 13px; font-size:16px }} ul {{ margin:0 0 15px; padding-left:21px; color:#c0cfda }} li+li {{ margin-top:5px }} .audit,.limit {{ display:grid; grid-template-columns:128px 1fr; gap:10px; margin-top:8px; padding:10px 12px; border-left:3px solid var(--green); background:#0b1920 }} .limit {{ border-color:var(--amber) }} .audit b,.limit b {{ color:white; font-size:12px }} .audit span,.limit span {{ color:var(--muted); font-size:12px }} .tests {{ margin:12px 0; font-size:12px }} dl {{ margin:0; padding:9px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line) }} dl div {{ display:grid; grid-template-columns:58px 1fr; gap:8px }} dt {{ color:#6f8493; font-size:10px; font-weight:800; text-transform:uppercase }} dd {{ margin:0; color:#b9cad7; font:11px/1.5 ui-monospace,SFMono-Regular,monospace; overflow-wrap:anywhere }} .actions {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:15px }} .actions a {{ padding:9px 12px; border:1px solid var(--line); border-radius:9px; text-decoration:none; font-weight:750; font-size:12px }} .actions .primary {{ background:#1b5f55; border-color:#347d70; color:white }}
  .matrix {{ overflow:auto; margin:24px 0 38px; border:1px solid var(--line); border-radius:16px }} .matrix:focus-visible {{ outline:3px solid var(--cyan); outline-offset:3px }} table {{ width:100%; border-collapse:collapse; min-width:850px; background:#0c1821 }} caption {{ padding:12px 14px; color:#b8cad6; text-align:left; font-weight:750 }} th,td {{ padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top }} th {{ color:#8fa4b3; font-size:10px; letter-spacing:.11em; text-transform:uppercase }} td {{ color:#c0cdd6 }} td:first-child {{ color:white; font-weight:800 }} tr:last-child td {{ border-bottom:0 }}
  .final {{ margin-top:38px; padding:24px; border:1px solid #355568; border-radius:18px; background:linear-gradient(135deg,#102635,#111b29) }} .final ol {{ color:#c5d2db }} footer {{ margin-top:34px; color:#728996; font-size:12px }}
  @media(max-width:900px) {{ main {{ padding:35px 15px 70px }} .stats,.history,.scope {{ grid-template-columns:repeat(2,1fr) }} .track {{ grid-template-columns:1fr }} figure {{ min-height:0 }} .flow {{ grid-template-columns:1fr }} .flow__arrow {{ transform:rotate(90deg); text-align:center }} .banner {{ grid-template-columns:1fr }} }}
  @media(max-width:560px) {{ .stats,.history,.scope {{ grid-template-columns:1fr }} }}
</style></head><body><main>
  <div class="eyebrow">Implementation review hub · 2026-09-04 · branch-isolated</div>
  <h1>The research is merged. The product choices are not.</h1>
  <p class="lede">This page is the switchboard for the vocabulary and editor-chrome ideas Zach accepted after reviewing LabVIEW, Unreal Blueprint, and Simulink, plus the later terminology correction recorded below. Each implementation is pinned to its own commit and retained Preview, so it can be judged—and later merged or discarded—without coupling it to the others.</p>
  <section class="stats" aria-label="Research and implementation totals"><div class="stat"><b>{concepts}</b><span>dictionary concepts</span></div><div class="stat"><b>{screenshot_refs}</b><span>unique official captures</span></div><div class="stat"><b>{sources}</b><span>primary sources indexed</span></div><div class="stat"><b>{len(TRACKS)}</b><span>independent prototype tracks</span></div></section>
  <section class="banner"><div><strong>Research lives on main at 363792d.</strong><p>The dictionary, frozen R1–R3 plus the current incorporated report, NI/Epic/MathWorks captures, feedback record, behavior-tree research, and annotation research are merged. Independent compliance audit found all 16 useful entries complete and no material gap. No product prototype below has been merged.</p></div><a href="labview-blueprint-simulink-vocabulary-controls-gap-analysis-2026-09-03.html">Open current dictionary →</a></section>
  <nav class="history" aria-label="Gap-analysis revision history"><a href="history/labview-blueprint-simulink-gap-analysis/r1-original-01f2f30.html"><b>R1 · Original</b><small>The first report, preserved rather than rewritten away.</small></a><a href="history/labview-blueprint-simulink-gap-analysis/r2-dictionary-acc1663.html"><b>R2 · Dictionary</b><small>The first concept-per-entry rewrite with reference evidence.</small></a><a href="history/labview-blueprint-simulink-gap-analysis/r3-editor-chrome-3caa496.html"><b>R3 · Editor chrome</b><small>The expanded outside-the-canvas pass.</small></a><a href="history/labview-blueprint-simulink-gap-analysis/feedback-2026-09-04.md"><b>Zach’s feedback</b><small>The verbatim decision record and attached crops.</small></a><a href="history/labview-blueprint-simulink-gap-analysis/post-report-vocabulary-addendum-2026-09-04.md"><b>Vocabulary addendum</b><small>The later Bundle / Unbundle / Copy correction and review links.</small></a><a href="history/labview-blueprint-simulink-gap-analysis/index.html"><b>Full history</b><small>Every frozen revision and provenance link.</small></a><a href="behavior-tree-moveit-groot-prior-art-2026-09-04.html"><b>BT prior-art atlas</b><small>New MoveIt Studio Pro · BT.CPP · Groot2 canvas and editor-control census.</small></a></nav>
  <div class="flow" aria-label="Integration model"><div class="flow__node"><b>1 · Read the evidence</b><span>The merged dictionary explains why each idea exists and what is deliberately excluded.</span></div><div class="flow__arrow">→</div><div class="flow__node"><b>2 · Drive one branch</b><span>Each board is pinned to that branch’s exact commit, not a shared mutable Preview.</span></div><div class="flow__arrow">→</div><div class="flow__node"><b>3 · Choose explicitly</b><span>Merge only the branches whose behavior earns a place; reconciliation happens after selection.</span></div></div>
  <section class="scope" aria-label="Implementation scope"><article><b>Already present · at report time</b><span>The incorporated dictionary recorded Split projection, default/override cues, Port-view interface reading, and the direct dashed async arrow as shipped grammar. That historical judgement is preserved.</span></article><article><b>Staged for real pyblocks facts</b><span>Source provenance/docs/uses, project and definition navigation, semantic Find, Problems actions, and analyzer-derived async/source claims wait for a trustworthy source index.</span></article><article><b>Deliberately not built</b><span>No event dispatcher or second wire system, exception rail, statechart overlay, board-wide semantic table, pretend scheduler, or mandatory dock-tab shell.</span></article></section>
  <section class="addendum" aria-label="Post-report vocabulary addendum"><b>Post-report addendum · 2026-09-04</b><p>Zach subsequently chose <strong>Bundle</strong> and <strong>Unbundle</strong> as the clearer data-wire vocabulary and added a shallow <strong>Copy</strong> operation for explicit copy-on-write intent. The original and incorporated reports remain linked above instead of being silently rewritten; read the <a href="history/labview-blueprint-simulink-gap-analysis/post-report-vocabulary-addendum-2026-09-04.md">durable addendum</a>, then <a href="#track-bundle-unbundle-copy-quick-insert">drive track 09</a>.</p></section>
  <h2>Independent review tracks</h2><p>Use the filter as a reading aid only. Status is an audit state, not a merge recommendation.</p>
  <nav class="filters" aria-label="Filter tracks"><button type="button" data-filter="all" aria-pressed="true">All {len(TRACKS)}</button><button type="button" data-filter="vocabulary" aria-pressed="false">Vocabulary</button><button type="button" data-filter="navigation" aria-pressed="false">Navigation</button><button type="button" data-filter="observation" aria-pressed="false">Observation</button><button type="button" data-filter="behavior" aria-pressed="false">Behavior trees</button></nav>
  <section class="tracks">{cards}</section>
  <section class="final"><div class="eyebrow">Before combining branches</div><h2>The seams that need a deliberate splice</h2><div class="matrix" tabindex="0" role="region" aria-label="Branch splice decisions"><table><caption>Independent branches that overlap in production seams</caption><thead><tr><th>Combination</th><th>Shared seam</th><th>Required decision</th></tr></thead><tbody>
    <tr><td>All three vocabulary branches</td><td>Block schema and migrations; stock factories; picker; Inspector</td><td>Three-way collision warning: semantic roles, semantic stock, and Bundle / Unbundle / Copy each independently claim Block migration V7. Make Bundle / Unbundle / Copy the naming and quick-insert authority; retain Select / Clock plus stable Bundle member editing from Semantic stock Blocks; retain port-owned roles; expose one preset registry and exactly one Unbundle row. Compose one ordered, round-trippable migration sequence and prove no role, config, row, or field loss with fixtures from every branch.</td></tr>
    <tr><td>Breadcrumbs + landmarks</td><td>Camera, Board Overview, navigation intent</td><td>Keep camera-only landmarks distinct unless Zach explicitly chooses scope-aware landmarks; route any future composed jump through one history transaction.</td></tr>
    <tr><td>Propagation + runtime evidence</td><td>Temporary canvas emphasis and outside-canvas controls</td><td>Define layer priority so propagation dimming, execution highlight, probe callouts, selection, and diff states remain simultaneously legible.</td></tr>
    <tr><td>Behavior tree + source projection</td><td>Canonical identity and declared data contracts</td><td>Choose whether the live shape becomes a view of py_trees IR or remains an authorable definition; do not allow two editable semantic bodies.</td></tr>
  </tbody></table></div>
  <ol><li>Open a gallery for intent, known limits, and test evidence.</li><li>Open its guided board and perform the numbered gesture.</li><li>Record the branches you want to keep. Nothing on this page implies approval or integration.</li><li>Only then reconcile selected branches against current main and rerun the combined corpus.</li></ol></section>
  <footer>Generated by <code>docs/build_gap_analysis_prototype_review_hub.py</code>. Images are embedded from exact Git commits; local review links are retained by <code>scripts/review_runtime.py</code>. Main research provenance: <code>d6d2c24</code> merge + <code>363792d</code> pinned footer. Product prototypes: zero merged.</footer>
</main><script>
  const buttons=[...document.querySelectorAll('[data-filter]')]; const tracks=[...document.querySelectorAll('.track')];
  buttons.forEach(button=>button.addEventListener('click',()=>{{ const filter=button.dataset.filter; buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button))); tracks.forEach(track=>track.hidden=filter!=='all'&&track.dataset.group!==filter); }}));
</script></body></html>""", encoding="utf-8")


if __name__ == "__main__":
    main()
