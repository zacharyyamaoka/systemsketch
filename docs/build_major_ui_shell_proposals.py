#!/usr/bin/env python3
"""Build the SystemSketch major UI shell Babble & Prune gallery."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SPEC_PATH = ROOT / "major-ui-shell-proposals-2026-08-31.json"
HTML_PATH = ROOT / "major-ui-shell-proposals-2026-08-31.html"
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")


COMMON_STYLE = r"""
<style>
.shell-mock{position:relative;min-height:420px;overflow:hidden;color:#202124;background-color:#fafaf8;background-image:radial-gradient(#d7d9d5 1px,transparent 1px);background-size:18px 18px;font:11px/1.35 Inter,ui-sans-serif,system-ui,sans-serif}
.shell-mock *{box-sizing:border-box}.shell-mock button,.shell-mock input,.shell-mock label{font:inherit}.shell-mock button,.shell-mock label{cursor:pointer;color:inherit}.shell-check{position:absolute;opacity:0;pointer-events:none}
.chrome-card{border:1px solid #dedfe3;background:#fff;box-shadow:0 5px 16px #20242b1b}.top-left-shell{position:absolute;z-index:8;top:12px;left:12px;display:flex;height:39px;align-items:center;overflow:hidden;border-radius:13px}.top-left-shell>*{display:grid;height:100%;place-items:center;padding:0 10px;border-right:1px solid #ececef}.top-left-shell>*:last-child{border-right:0}.top-left-shell b{display:flex;gap:6px;align-items:center}.free-chip{padding:2px 5px;border-radius:4px;background:#f2ecff;color:#7c3aed;font-size:8px}.top-right-shell{position:absolute;z-index:8;top:12px;right:12px;display:flex;height:39px;align-items:center;gap:3px;padding:4px;border-radius:13px}.top-right-shell>*{display:grid;min-width:31px;height:30px;place-items:center;border:0;border-radius:8px;background:transparent}.avatar{width:27px;min-width:27px!important;height:27px!important;border-radius:50%!important;background:#cf5c34!important;color:#fff!important;font-weight:800}.timer{padding:0 8px!important;border:1px solid #e7e8eb!important;background:#f8f8f7!important;font-family:ui-monospace,monospace}.share{padding:0 11px!important;background:#8654f6!important;color:#fff!important;font-weight:800}
.left-popout,.right-popout{position:absolute;z-index:6;top:61px;bottom:55px;overflow:hidden;border:1px solid #dedfe3;border-radius:14px;background:#fff;box-shadow:0 12px 30px #20242b1c;transition:opacity 150ms ease,transform 150ms ease}.left-popout{left:16px;width:184px}.right-popout{right:16px;width:190px}.left-check:not(:checked)~.left-popout{opacity:0;pointer-events:none;transform:translateX(-110%)}.right-check:not(:checked)~.right-popout{opacity:0;pointer-events:none;transform:translateX(110%)}
.popout-head{display:flex;height:42px;align-items:center;justify-content:space-between;padding:0 11px;border-bottom:1px solid #ececef;font-weight:800}.popout-head label{font-size:18px;font-weight:400}.search{margin:8px;padding:7px 8px;border-radius:7px;background:#f2f3f4;color:#9a9da3}.library{padding:2px 11px 12px}.library h5{display:flex;align-items:center;justify-content:space-between;margin:10px 0 7px}.shape-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 9px}.shape-icon{display:grid;width:24px;height:24px;place-items:center;margin:auto;border:1px solid #74777d;border-radius:4px;background:#fff}.shape-icon.round{border-radius:50%}.shape-icon.diamond{transform:rotate(45deg);border-radius:2px}.connection-row{display:flex;gap:17px;padding:4px 2px 7px;font-size:19px}.right-copy{display:flex;gap:9px;padding:13px 11px;color:#44484f}.right-copy i{font-size:18px}.right-copy p{margin:0;font-size:9px}.panel-actions{display:flex;gap:5px;padding:7px 8px;border-bottom:1px solid #ececef}.panel-actions span{display:grid;width:25px;height:25px;place-items:center;border-radius:6px;background:#f2f3f4}.right-empty{display:grid;height:200px;place-content:center;color:#a0a4aa;text-align:center}
.selected-shape{position:absolute;left:40%;top:45%;width:122px;height:78px;border:2px solid #4f8ff7;background:#fff}.selected-shape:before,.selected-shape:after{content:'';position:absolute;width:8px;height:8px;border:2px solid #4f8ff7;border-radius:2px;background:#fff}.selected-shape:before{top:-6px;left:-6px}.selected-shape:after{right:-6px;bottom:-6px}.selected-shape span{display:grid;height:100%;place-items:center;color:#8b9097;font-size:9px}
.selection-menu{position:absolute;z-index:7;left:50%;top:34%;display:flex;height:37px;align-items:center;overflow:hidden;border-radius:10px;background:#202020;color:#fff;box-shadow:0 8px 22px #20242b2d;transform:translateX(-50%)}.selection-menu span{display:grid;min-width:39px;height:100%;place-items:center;padding:0 8px;border-right:1px solid #3d3d3d}.selection-menu span:last-child{border-right:0}.selection-menu .wide{min-width:66px}.selection-menu .label{min-width:74px;color:#dfe1e5;font-size:9px}
.bottom-toolbar{position:absolute;z-index:8;left:46%;bottom:11px;display:flex;height:39px;align-items:center;gap:2px;padding:4px;border:1px solid #dedfe3;border-radius:13px;background:#fff;box-shadow:0 5px 16px #20242b20;transform:translateX(-50%)}.bottom-toolbar>*{display:grid;min-width:27px;height:30px;place-items:center;border:0;border-radius:7px;background:transparent}.bottom-toolbar .active{background:#5f84ed;color:#fff}.bottom-toolbar .palette-trigger{position:relative;margin:0;background:#ebe6ff;color:#6d3fdc}.bottom-toolbar .palette-trigger input{position:absolute;opacity:0;pointer-events:none}.utility-strip{position:absolute;z-index:8;right:12px;bottom:11px;display:flex;height:39px;align-items:center;padding:4px;border:1px solid #dedfe3;border-radius:13px;background:#fff;box-shadow:0 5px 16px #20242b1b}.utility-strip span{display:grid;min-width:31px;height:30px;place-items:center}.utility-strip b{min-width:38px;text-align:center}
.above-menu{position:absolute;z-index:7;left:50%;bottom:57px;width:298px;min-height:106px;padding:9px;border:1px solid #dedfe3;border-radius:13px;background:#fff;box-shadow:0 12px 30px #20242b24;transform:translateX(-50%);transition:opacity 150ms ease,transform 150ms ease}.shell-mock:has(.palette-check:not(:checked)) .above-menu{opacity:0;pointer-events:none;transform:translate(-50%,12px)}.above-menu .search{margin:0 0 7px}.command-row{display:flex;align-items:center;justify-content:space-between;padding:5px 7px;border-radius:6px}.command-row.active{background:#f0f0f1}.command-row small{color:#a0a3a8}.color-row{display:flex;gap:8px;align-items:center;padding:5px}.swatch{width:18px;height:18px;border:1px solid #dedfe3;border-radius:50%;background:#fff}.swatch.purple{background:#7c4dff}.swatch.orange{background:#ed6b3f}.swatch.yellow{background:#f5c84b}.swatch.green{background:#75c776}
.architecture-note{position:absolute;z-index:9;left:211px;top:62px;max-width:220px;padding:7px 9px;border:1px solid #d9dce2;border-radius:9px;background:#ffffffed;color:#5f6570;font-size:8px;box-shadow:0 4px 12px #20242b12}.architecture-note b{display:block;margin-bottom:3px;color:#343840}.seam-pill{display:inline-block;margin:2px 2px 0 0;padding:2px 5px;border-radius:99px;background:#e9edff;color:#3e55c7;font-size:7px;font-weight:800}.surface-boundary{position:absolute;z-index:2;inset:7px;border:2px dashed #148578;border-radius:18px;pointer-events:none}.registry-map{position:absolute;z-index:5;left:211px;top:105px;width:132px;padding:7px;border:1px solid #b9a7ef;border-radius:9px;background:#f5f1ffed;color:#6040a7;font:7px/1.45 ui-monospace,monospace;box-shadow:0 4px 12px #20242b12}.registry-map b{display:block;margin-bottom:3px;font-family:Inter,sans-serif}.shell-app-frame{box-shadow:inset 0 0 0 7px #25272b}.shell-app-frame .top-left-shell,.shell-app-frame .top-right-shell{top:18px}.shell-app-frame .left-popout,.shell-app-frame .right-popout{top:67px;bottom:61px}.shell-app-frame .architecture-note{top:68px}.shell-stock .left-popout{bottom:174px;width:166px}.shell-stock .right-popout{bottom:126px;width:174px}.shell-stock .selection-menu{height:33px}.shell-stock .above-menu{width:256px;min-height:88px}.stock-arrow{position:absolute;z-index:7;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:7px solid #fff}.left-arrow{top:54px;left:54px}.right-arrow{top:54px;right:56px}.fixture-caption{position:absolute;left:211px;bottom:60px;color:#858a92;font-size:8px}
@media(max-width:760px){.left-popout{width:165px}.right-popout{width:170px}.architecture-note{left:185px}.registry-map{display:none}}
</style>
"""


def shell_preview(variant: str, *, style: bool = False) -> str:
    left_id = f"{variant}-left"
    right_id = f"{variant}-right"
    palette_id = f"{variant}-palette"
    variant_class = {
        "v1": "shell-slots",
        "v2": "shell-host",
        "v3": "shell-registry",
        "v4": "shell-app-frame",
        "v5": "shell-stock",
    }[variant]
    architecture = {
        "v1": "<b>Public slot map</b><i class='seam-pill'>MenuPanel</i><i class='seam-pill'>SharePanel</i><i class='seam-pill'>Toolbar</i><i class='seam-pill'>ContextualToolbar</i><i class='seam-pill'>InFrontOfTheCanvas</i>",
        "v2": "<b>One SurfaceHost</b>Every region is positioned and coordinated by one overlay component; tldraw supplies editor state and commands.",
        "v3": "<b>Registry + slot adapters</b>Descriptors declare anchor, exclusivity, focus policy, and body; adapters place them into public slots.",
        "v4": "<b>Outer app frame</b>Persistent bars and side popouts live beside the editor; only selection-local UI enters tldraw.",
        "v5": "<b>Stock popover composition</b>Keep stock panels and contextual toolbar; attach lightweight placeholder content to existing triggers.",
    }[variant]
    extra = ""
    if variant == "v2":
        extra = "<div class='surface-boundary'></div>"
    elif variant == "v3":
        extra = "<div class='registry-map'><b>surface registry</b>library → left<br>comments → right<br>selection → object<br>tool-family → toolbar</div>"
    arrows = "<i class='stock-arrow left-arrow'></i><i class='stock-arrow right-arrow'></i>" if variant == "v5" else ""
    prefix = COMMON_STYLE if style else ""
    return prefix + f"""
<div class='shell-mock {variant_class}'>
  <input class='shell-check left-check' id='{left_id}' type='checkbox' checked>
  <input class='shell-check right-check' id='{right_id}' type='checkbox' checked>
  {extra}{arrows}
  <nav class='chrome-card top-left-shell' aria-label='Board and pages'>
    <label for='{left_id}' title='Toggle shape library'>☰⌄</label>
    <b>Untitled <i class='free-chip'>Free</i></b>
    <span>▣ pages</span>
  </nav>
  <nav class='chrome-card top-right-shell' aria-label='Collaboration and sharing'>
    <span class='avatar'>Z</span><span>⌄</span>
    <label for='{right_id}' title='Toggle right popout'>▦</label>
    <span class='timer'>◉ 03:00</span><button class='share'>Share</button>
  </nav>
  <aside class='left-popout' aria-label='Shape library'>
    <header class='popout-head'><span>Shapes</span><label for='{left_id}'>×</label></header>
    <div class='search'>⌕ &nbsp; Search shapes</div>
    <div class='library'>
      <h5><span>Recents</span><span>⌃</span></h5>
      <div class='shape-grid'><i class='shape-icon'></i></div>
      <h5><span>Connections</span><span>⌃</span></h5>
      <div class='connection-row'><span>↱</span><span>⤴</span><span>↗</span><span>⌘</span></div>
      <h5><span>Basic</span><span>⌃</span></h5>
      <div class='shape-grid'><i class='shape-icon'></i><i class='shape-icon round'></i><i class='shape-icon diamond'></i><i class='shape-icon'></i><i class='shape-icon diamond'></i><i class='shape-icon round'></i><i class='shape-icon'></i><i class='shape-icon round'></i><i class='shape-icon'>＋</i><i class='shape-icon'>←</i><i class='shape-icon'>→</i><i class='shape-icon'>☆</i></div>
      <h5><span>Flowchart</span><span>⌃</span></h5>
      <div class='shape-grid'><i class='shape-icon'>▱</i><i class='shape-icon'>▰</i><i class='shape-icon'>▱</i><i class='shape-icon'>▤</i></div>
    </div>
  </aside>
  <aside class='right-popout' aria-label='Comments and inspector'>
    <div class='panel-actions'><span>⌕</span><span>☷</span><span>•••</span><label for='{right_id}'>×</label></div>
    <div class='right-copy'><i>◯</i><p>Give feedback, ask a question, or leave a note. Click anywhere in the file to leave a comment.</p></div>
    <div class='right-empty'>Right-side reusable surface</div>
  </aside>
  <div class='selected-shape'><span>Selected Block</span></div>
  <div class='selection-menu' aria-label='Selection mini menu'><span>◩⌄</span><span>●⌄</span><span>☰⌄</span><span class='label'>Aa &nbsp; Small</span><span>B</span><span>↗</span></div>
  <section class='above-menu' aria-label='Above-toolbar menu'>
    <div class='search'>⌕ &nbsp; Search</div>
    <div class='command-row active'><span>◎ &nbsp; Find and replace…</span><small>Ctrl+F</small></div>
    <div class='command-row'><span>◉ &nbsp; Select all</span><small>Ctrl+A</small></div>
    <div class='color-row'><i class='swatch purple'></i><i class='swatch orange'></i><i class='swatch yellow'></i><i class='swatch green'></i><i class='swatch'></i></div>
  </section>
  <nav class='bottom-toolbar' aria-label='Drawing toolbar'><button class='active'>↖</button><button>☝</button><button>✎</button><button>◇</button><button>↗</button><button>T</button><button>□</button><label class='palette-trigger'><input class='palette-check' id='{palette_id}' type='checkbox' checked aria-label='Toggle above-toolbar menu'><span>⌘＋</span></label></nav>
  <nav class='utility-strip' aria-label='Zoom and help'><span>▣</span><span>−</span><b>32%</b><span>＋</span><span>?</span></nav>
  <div class='architecture-note'>{architecture}</div>
  <div class='fixture-caption'>Click ☰, ▦, or ⌘＋ to toggle the three reusable surfaces.</div>
</div>
"""


def score(score: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": score, "evidence": evidence, "confidence": confidence}


SPEC = {
    "schemaVersion": 2,
    "title": "Five implementation architectures for the SystemSketch UI shell",
    "kicker": "SystemSketch major UI sections · Babble & Prune · 31 Aug 2026",
    "brief": "Plan a reusable placeholder-first UI shell matching the supplied FigJam composition: a persistent top-left board capsule, an always-visible top-right collaboration capsule, inset left and right popouts, a selection mini-menu above board objects, a menu above the bottom toolbar, the bottom toolbar itself, and the existing bottom-right utilities. Keep the tldraw editor and its public interaction seams authoritative.",
    "count": 5,
    "defaultId": "v1",
    "defaultWhy": "Slot-Mapped Shell is the provisional default at 94/100. It maps every region with a first-class tldraw seam onto that seam, uses the public contextual-toolbar primitive for object-local controls, and limits custom overlay ownership to the two inset popouts. It is concrete enough to ship incrementally without inventing a general window manager first.",
    "decisionHinge": "The recommendation hinges on immediate happy-path delivery versus building a generalized menu platform now. Moving 20 weight points from tldraw happy-path fit to reusable-surface infrastructure makes Registry + Slot Adapters lead 92 to 90; otherwise Slot-Mapped Shell leads because it owns less abstraction before the menu bodies are known.",
    "invariants": [
        "The top-left board/pages capsule and top-right collaboration/share capsule are persistent global chrome; the top-right capsule never depends on selection or an open inspector.",
        "Left and right panels are inset rounded popouts beneath the persistent top bars and above the bottom chrome.",
        "A selection mini-menu follows the selected object's screen bounds; a separate surface opens above the bottom toolbar.",
        "The same 720 × 420 dotted board, selected Block, open left/right popouts, open above-toolbar menu, toolbar, and utilities appear in every proposal.",
        "Canvas records, tools, camera, selection, history, and clipboard remain owned by tldraw; menu open state is ephemeral React UI state."
    ],
    "boundary": "These are interactive implementation-architecture sketches, not production integration. The three major popout toggles work in the gallery; tldraw selection tracking, keyboard/focus behavior, responsive breakpoints, collaboration data, file management, shape catalog content, and real commands remain simulated. No product UI code is changed by this proposal round.",
    "axes": [
        {"name": "Chrome ownership", "values": ["named tldraw slots", "single overlay host", "declarative registry with adapters", "outer React app frame", "stock popover composition"]},
        {"name": "Anchor authority", "values": ["tldraw layout zones", "one inset coordinate system", "surface descriptors", "host layout", "trigger-local popovers"]},
        {"name": "State coordination", "values": ["small shared reducer", "central SurfaceHost reducer", "registry state machine", "app-shell context", "local component state"]},
        {"name": "Growth posture", "values": ["concrete first", "one chrome owner", "platform first", "application frame first", "placeholder speed first"]}
    ],
    "requirements": [
        {"id": "fr1", "name": "tldraw happy-path fit", "weight": 30, "why": "The user explicitly wants to reuse mature tldraw UI and interaction seams before owning new canvas behavior.", "passCondition": "The architecture composes public component slots, UI primitives, editor state, and event helpers without forking the editor or targeting private DOM.", "anchors": {"1": "Depends on private DOM, a fork, or parallel canvas behavior.", "3": "Uses public editor APIs but owns most chrome placement and lifecycle.", "5": "Maps regions directly to supported TLComponents/editor components and public UI primitives."}},
        {"id": "fr2", "name": "Reference fidelity", "weight": 20, "why": "The complete FigJam-like shell is now specified and should not be reinterpreted as generic edge-to-edge panels.", "passCondition": "Persistent capsules, inset side popouts, object-local mini-menu, above-toolbar surface, toolbar, and utilities can coexist in the supplied spatial relationship.", "anchors": {"1": "Several regions are missing or structurally different.", "3": "All regions exist but one or more are docked, modal, or poorly anchored.", "5": "The complete composition and its persistent/transient distinction are preserved."}},
        {"id": "fr3", "name": "Reusable surface contracts", "weight": 20, "why": "The near-term goal is to establish reliable placeholder shells that later Block, library, comments, files, and style features can reuse.", "passCondition": "Left, right, selection-local, and toolbar-local surfaces share explicit frame, trigger, dismissal, and body contracts without sharing domain content.", "anchors": {"1": "Every menu is bespoke and cannot be reused.", "3": "Some shell styling is shared, but behavior remains duplicated.", "5": "A clear reusable contract covers anchors, focus, exclusivity, sizing, and bodies."}},
        {"id": "fr4", "name": "Interaction correctness", "weight": 20, "why": "Floating chrome must not accidentally draw, pan, lose keyboard focus, or become detached from the current selection.", "passCondition": "Pointer/wheel handling, Escape/click-away, focus return, selection following, camera movement, collision, and breakpoint behavior have one testable policy.", "anchors": {"1": "UI leaks events or has contradictory dismissal/focus rules.", "3": "Core toggles work but complex coexistence or selection movement is custom and lightly specified.", "5": "The design reuses tldraw event/positioning helpers and defines deterministic lifecycle rules."}},
        {"id": "fr5", "name": "Incremental delivery", "weight": 10, "why": "Placeholders should establish the shell quickly without delaying the Block and file-management vertical slices.", "passCondition": "The regions can land one at a time behind ordinary tests while stock tools and existing utilities stay operational.", "anchors": {"1": "Requires a broad rewrite before any region can ship.", "3": "A meaningful foundation must land before the first visible region.", "5": "Each region is an independent slot override or small component with isolated proof."}}
    ],
    "hardGates": [
        {"id": "g1", "name": "Persistent top-right capsule", "why": "The user explicitly corrected the earlier contextual interpretation; this bar is global chrome."},
        {"id": "g2", "name": "Complete region set", "why": "Top bars, both side popouts, object mini-menu, above-toolbar menu, toolbar, and utilities must all have a home."},
        {"id": "g3", "name": "Stock canvas semantics", "why": "UI architecture may not replace tldraw's document, selection, tool, camera, history, or clipboard model."},
        {"id": "g4", "name": "Ephemeral chrome state", "why": "Open panels and active menu sections are session UI state, not document records."},
        {"id": "g5", "name": "No event leakage", "why": "Clicking, typing, or scrolling in a popout must not draw, select, or pan the board underneath."}
    ],
    "variants": [
        {
            "id": "v1", "name": "Slot-Mapped Shell", "thesis": "Use a named tldraw component slot wherever one exists and one small in-front-of-canvas host only for the inset panels and object-local menu.", "accent": "#526FE4",
            "bestWhen": "You want the closest happy path, visible progress by region, and enough reuse for the known shell without building a framework first.",
            "losesWhen": "Dozens of future surfaces with dynamic placement rules are already certain and justify a registry before their content exists.",
            "decisions": [
                {"label": "Persistent bars", "value": "MenuPanel owns the top-left board/page capsule; an always-supplied SharePanel owns the top-right collaboration capsule."},
                {"label": "Transient canvas chrome", "value": "InFrontOfTheCanvas hosts reusable left/right PopoutFrame components; TldrawUiContextualToolbar owns selection-following placement."},
                {"label": "Toolbar family menus", "value": "A Toolbar override wraps public toolbar items and TldrawUiPopover content above the trigger."},
                {"label": "State", "value": "One small ChromeProvider stores open surface IDs and LIFO dismissal; shape/tool/selection data stay in Editor."}
            ],
            "keepParts": ["public TLComponents slot map", "TldrawUiContextualToolbar", "shared PopoutFrame", "small ephemeral ChromeProvider"],
            "proof": ["The hero shows the entire supplied shell and labels the public tldraw seams that own it.", "Click the top-left, top-right, and purple toolbar triggers to independently close and reopen the two popouts and above-toolbar menu."],
            "scores": {"fr1": score(5, "Every first-class region maps to MenuPanel, SharePanel, Toolbar, NavigationPanel, InFrontOfTheCanvas, or a public tldraw UI primitive."), "fr2": score(5, "All persistent and transient regions coexist with the supplied inset spacing and anchoring."), "fr3": score(4, "PopoutFrame and ChromeProvider are reusable, while each named slot remains deliberately concrete."), "fr4": score(5, "It reuses contextual-toolbar positioning, tldraw event handling, popover focus behavior, and one deterministic dismissal reducer.", "medium"), "fr5": score(4, "Each slot can ship independently, though the shared ChromeProvider and inset tokens should land first.")},
            "gateResults": {"g1": {"pass": True, "evidence": "SharePanel is supplied unconditionally and never derived from selection."}, "g2": {"pass": True, "evidence": "Every region is assigned to a visible supported seam."}, "g3": {"pass": True, "evidence": "The full Tldraw editor remains mounted and authoritative."}, "g4": {"pass": True, "evidence": "ChromeProvider stores UI state outside records and snapshots."}, "g5": {"pass": True, "evidence": "Public UI primitives plus editor.markEventAsHandled/pass-through-wheel helpers define the event boundary."}},
            "preview": shell_preview("v1", style=True)
        },
        {
            "id": "v2", "name": "Unified SurfaceHost", "thesis": "Render the entire persistent and transient chrome system from one InFrontOfTheCanvas surface host with one coordinate and collision model.", "accent": "#118675",
            "bestWhen": "Exact cross-surface alignment and a single owner for collision, layering, dismissal, and responsive changes matter more than slot-native composition.",
            "losesWhen": "You want tldraw upgrades and built-in responsive behavior to carry as much of the shell as possible.",
            "decisions": [
                {"label": "Ownership", "value": "One SurfaceHost renders top bars, side popouts, mini-menu, toolbar menu, toolbar, and utilities over the stock canvas."},
                {"label": "Positioning", "value": "One inset/collision solver lays out every region in editor-container coordinates."},
                {"label": "Commands", "value": "Controls still call public editor actions/tools; only layout and menu lifecycle are centralized."},
                {"label": "State", "value": "A reducer owns every surface, trigger, focus return target, and z-order."}
            ],
            "keepParts": ["single collision model", "central LIFO dismissal", "one responsive coordinate system", "shared chrome tokens"],
            "proof": ["The dashed boundary shows one host owning every visible region.", "The same three toggles demonstrate coordinated state without changing the canvas fixture."],
            "scores": {"fr1": score(3, "It uses the public InFrontOfTheCanvas seam and editor actions but bypasses most specialized TLComponents layout behavior."), "fr2": score(5, "A single coordinate owner can reproduce the supplied composition precisely."), "fr3": score(5, "Every surface shares one descriptor, frame, layering, focus, and collision contract."), "fr4": score(4, "Central policy is coherent, but selection placement, breakpoints, and menu focus are reimplemented rather than inherited.", "medium"), "fr5": score(4, "One host foundation is required, after which placeholder regions are cheap to add.")},
            "gateResults": {"g1": {"pass": True, "evidence": "The host always renders the top-right bar."}, "g2": {"pass": True, "evidence": "The host descriptor list includes every region."}, "g3": {"pass": True, "evidence": "Only chrome is overlaid; editor semantics remain stock."}, "g4": {"pass": True, "evidence": "The SurfaceHost reducer is ordinary React state."}, "g5": {"pass": True, "evidence": "The host defines one event boundary for all child surfaces."}},
            "preview": shell_preview("v2")
        },
        {
            "id": "v3", "name": "Registry + Slot Adapters", "thesis": "Declare reusable surfaces as data, then let adapters place each descriptor into a tldraw slot, contextual toolbar, or inset overlay anchor.", "accent": "#7B4BC4",
            "bestWhen": "Left/right panels, inspectors, libraries, files, comments, and future domain menus will proliferate and need policy-driven reuse.",
            "losesWhen": "The shell is still exploratory and a descriptor platform would be more code than the first four placeholder bodies.",
            "decisions": [
                {"label": "Surface schema", "value": "Each descriptor declares anchor, trigger, body, size, exclusivity group, focus policy, and availability predicate."},
                {"label": "Adapters", "value": "MenuPanel, SharePanel, Toolbar, ContextualToolbar, and overlay adapters render descriptors through public seams."},
                {"label": "Commands", "value": "Bodies receive typed UI commands and editor selectors rather than raw store mutation."},
                {"label": "Testing", "value": "Contract tests run every descriptor through open, Escape, click-away, focus-return, and narrow-screen journeys."}
            ],
            "keepParts": ["surface descriptor schema", "slot adapters", "availability predicates", "contract-test matrix"],
            "proof": ["The hero numbers the same regions and exposes a small registry map beside them.", "All three triggers still exercise the rendered descriptors in the shared fixture."],
            "scores": {"fr1": score(4, "Adapters use public tldraw slots and primitives, but a custom indirection layer sits between product components and those seams."), "fr2": score(5, "Descriptors and per-anchor adapters preserve the full supplied composition."), "fr3": score(5, "This is the strongest explicit reuse model for future menu bodies and policies."), "fr4": score(4, "Central contract tests are strong, though adapter edge cases add another lifecycle layer.", "medium"), "fr5": score(4, "The registry and adapters are an upfront rung, but each later placeholder becomes a small descriptor/body pair.")},
            "gateResults": {"g1": {"pass": True, "evidence": "The top-right descriptor is persistent and has no availability predicate."}, "g2": {"pass": True, "evidence": "Every region has an anchor descriptor and adapter."}, "g3": {"pass": True, "evidence": "Adapters consume public Editor selectors/commands only."}, "g4": {"pass": True, "evidence": "Registry activation is ephemeral UI state."}, "g5": {"pass": True, "evidence": "The surface contract requires an event boundary and focus policy."}},
            "preview": shell_preview("v3")
        },
        {
            "id": "v4", "name": "Outer App Frame", "thesis": "Place persistent bars and side popouts in a React application frame around Tldraw, using tldraw UI seams only for the toolbar and object-local menu.", "accent": "#B85D18",
            "bestWhen": "SystemSketch is becoming a multi-pane application whose file browser, collaboration, and project chrome should outlive or swap the canvas.",
            "losesWhen": "The whiteboard remains the product center and app-frame layout should not compete with tldraw's responsive panel system.",
            "decisions": [
                {"label": "Ownership", "value": "The host app owns top bars and left/right popouts as siblings of Tldraw."},
                {"label": "Canvas", "value": "Tldraw fills one app-frame cell; viewport and resize observers respond when the frame changes."},
                {"label": "Local UI", "value": "Selection mini-menu and above-toolbar surfaces remain inside tldraw through public primitives."},
                {"label": "State", "value": "App navigation state and editor state meet through typed commands/selectors at the canvas boundary."}
            ],
            "keepParts": ["clear app/editor boundary", "persistent project chrome", "typed canvas bridge", "future multi-pane readiness"],
            "proof": ["The dark inset frame makes the host-owned application boundary visible.", "Panel toggles change host siblings while the selected object and local menu remain inside the canvas fixture."],
            "scores": {"fr1": score(3, "The editor remains stock, but host layout replaces several first-class tldraw UI zones and must coordinate resize/focus itself."), "fr2": score(5, "A host frame can reproduce the visual shell exactly."), "fr3": score(4, "Host panels share app-shell contracts, while canvas-local surfaces use a second contract."), "fr4": score(3, "Cross-boundary focus, resize, keyboard routing, and overlay collisions need custom integration.", "medium"), "fr5": score(3, "The app frame and editor bridge should land before its regions, making the first placeholder less incremental.")},
            "gateResults": {"g1": {"pass": True, "evidence": "The host app always mounts the top-right bar."}, "g2": {"pass": True, "evidence": "Host and canvas-local regions cover the complete set."}, "g3": {"pass": True, "evidence": "The embedded Tldraw component remains the only canvas."}, "g4": {"pass": True, "evidence": "App-frame UI state is kept outside the document."}, "g5": {"pass": True, "evidence": "Host siblings naturally intercept their own events; the bridge still requires tests."}},
            "preview": shell_preview("v4")
        },
        {
            "id": "v5", "name": "Stock Popover Composition", "thesis": "Keep tldraw's stock zones and disclosure mechanics, adding placeholder content through its existing popovers, style panel, actions, and contextual-toolbar primitives.", "accent": "#3C6D8C",
            "bestWhen": "The fastest low-risk placeholder shell matters more than matching the tall inset panels exactly on the first pass.",
            "losesWhen": "The supplied FigJam composition is already a firm visual contract rather than a rough direction.",
            "decisions": [
                {"label": "Persistent bars", "value": "Small MenuPanel and SharePanel wrappers add board and collaboration controls while preserving stock content."},
                {"label": "Side content", "value": "Library and inspector bodies use stock popovers/StylePanel disclosure rather than a new large panel host."},
                {"label": "Local controls", "value": "TldrawUiContextualToolbar and toolbar ActionsMenu carry the object and above-toolbar surfaces."},
                {"label": "State", "value": "Each public popover owns its local open/focus lifecycle; very little shared state exists."}
            ],
            "keepParts": ["stock popover focus behavior", "minimal shared state", "contextual toolbar reuse", "fast placeholder delivery"],
            "proof": ["The shorter side surfaces and popover arrows show the deliberate stock-disclosure compromise.", "The same triggers exercise local popover state with the least custom coordination."],
            "scores": {"fr1": score(5, "It relies almost entirely on stock TLComponents and public popover/contextual-toolbar primitives."), "fr2": score(3, "All regions exist, but tall inset left/right panels are approximated by shorter stock disclosure surfaces."), "fr3": score(3, "Shared tldraw primitives are reused, while product-level sizing, exclusivity, and cross-surface policy remain implicit."), "fr4": score(4, "Stock focus and dismissal are reliable, but independent popovers do not coordinate every coexistence case.", "medium"), "fr5": score(5, "Each placeholder can be added as a narrow wrapper or child of an existing surface.")},
            "gateResults": {"g1": {"pass": True, "evidence": "A custom SharePanel wrapper remains mounted."}, "g2": {"pass": True, "evidence": "Every region is represented, even where its dimensions differ."}, "g3": {"pass": True, "evidence": "Only public stock UI composition changes."}, "g4": {"pass": True, "evidence": "Popover state stays local and ephemeral."}, "g5": {"pass": True, "evidence": "Stock popovers and contextual toolbar already isolate pointer/focus behavior."}},
            "preview": shell_preview("v5")
        }
    ],
    "checks": [
        "Exactly five implementation architectures with different ownership and state boundaries",
        "The same complete shell, selected Block, viewport, content, and fidelity class appear in every proposal",
        "Every proposal exposes working left, right, and above-toolbar toggles",
        "Five weighted criteria were frozen before scoring and sum to 100%",
        "Every score includes observable evidence and confidence",
        "Five hard gates are evaluated separately from weighted judgment",
        "Pick, shortlist, reject, note, splice, copy, and download controls remain available",
        "Production integration, real collaboration/file data, responsive QA, and final menu bodies are explicitly outside the prototypes"
    ]
}


def main() -> None:
    SPEC_PATH.write_text(json.dumps(SPEC, indent=2) + "\n", encoding="utf-8")
    if HTML_PATH.exists():
        HTML_PATH.unlink()
    subprocess.run(
        ["python3", str(GALLERY), "build", "--spec", str(SPEC_PATH), "--output", str(HTML_PATH), "--strict"],
        check=True,
    )


if __name__ == "__main__":
    main()
