#!/usr/bin/env python3
"""Build reports/contextual-toolbar-prior-art-2026-09-07.html — prior art for
SystemSketch's floating selection toolbar (the "popup menu" that appears above a
selected shape/Block), requested so the current hand-rolled implementation can be
redone on top of real primitives instead of reinvented from scratch.

Zach's ask (chat, 2026-09-07): "the first time I tried to implement it as it
currently is in system sketch was very much a handheld system... I want to redo
it based on prior art... AFFiNE... I think is a great reference... Onlook has a
top toolbar... can you please do some research online to see if there's any
other relevant prior art... look at the current systemsketch implementation to
understand the functional requirements... we are planning to use either base ui
or radix and then shadcn and tldraw so implementations that play nicely with
that ecosystem would be helpful."

Research: one Explore agent mapped the current implementation (file:line cited
below); direct web reads of tldraw's own contextual-toolbar example, Radix's and
Base UI's Toolbar primitives, Plate's floating-toolbar shadcn registry item,
React Flow's NodeToolbar, Excalidraw's Island/LayerUI docs, and the Onlook/
Quickdraw repos; plus two artifacts already sitting in this repo from the same
day's work (the toolbar-radix-spike report and the Base-UI-migration work
order) that materially change the recommendation and must not be re-litigated.

Output is text + inline SVG only — no screenshots, so no reports/media/ split.
"""

from __future__ import annotations

import html
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "reports" / "contextual-toolbar-prior-art-2026-09-07.html"


def sh(cmd: str) -> str:
    try:
        return subprocess.run(
            ["bash", "-c", cmd], capture_output=True, text=True, cwd=ROOT, timeout=30
        ).stdout.strip()
    except Exception:
        return "?"


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def measure() -> dict[str, str]:
    m: dict[str, str] = {}
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    m["tldraw"] = deps.get("tldraw", "?")
    m["radix"] = deps.get("radix-ui", "?")
    m["react"] = deps.get("react", "?")
    m["baseui"] = deps.get("@base-ui/react") or deps.get("@base-ui-components/react") or "not installed"
    m["head"] = sh("git rev-parse --short HEAD")
    return m


CSS = """
  :root { color-scheme:light; --ink:#1c2027; --muted:#5c636e; --line:#d9dee6; --paper:#f2f4f8;
    --card:#fff; --blue:#3061e6; --blue-soft:#e9f0fe; --green:#1f8a5a; --red:#c8453a; --amber:#c47b1b;
    --violet:#7048c8; }
  * { box-sizing:border-box }
  body { margin:0; color:var(--ink); background:radial-gradient(circle at 82% -4%,#e5edfb 0,transparent 40%),var(--paper);
    font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }
  main { width:min(1120px,calc(100% - 32px)); margin:auto; padding:40px 0 72px }
  code { font:0.86em ui-monospace,SFMono-Regular,Menlo,monospace; background:#eef1f6; padding:1px 5px; border-radius:5px }
  a { color:var(--blue); text-decoration:none } a:hover { text-decoration:underline }
  sup.c { font:600 10.5px/1 ui-monospace,monospace; color:var(--blue); letter-spacing:.02em }
  sup.c a { color:inherit }
  .hero { padding:42px; border:1px solid #d5dde8; border-radius:24px; background:#ffffffe8; box-shadow:0 22px 60px #22344c14 }
  .eyebrow { color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase }
  h1 { margin:10px 0 14px; font-size:clamp(30px,4.6vw,48px); line-height:1.06; letter-spacing:-.045em; max-width:26ch }
  .lead { max-width:76ch; margin:0; color:var(--muted); font-size:17px }
  .lead b { color:var(--ink) }
  .verdict { margin-top:22px; padding:18px 20px; border:1px solid #cfe6da; border-left:4px solid var(--green);
    border-radius:12px; background:#f1faf5; font-size:15px; line-height:1.6 }
  .verdict b { color:var(--green) }
  .verdict ul { margin:6px 0 0; padding-left:20px }
  .verdict li { margin:4px 0 }
  .quiet { margin-top:12px; padding:14px 18px; border:1px solid var(--line); border-left:4px solid var(--muted);
    border-radius:12px; background:#f7f8fb; font-size:13.5px; color:var(--muted) }
  section { margin-top:22px; padding:30px; border:1px solid var(--line); border-radius:20px; background:#fffffff2;
    box-shadow:0 12px 36px #22344c0d }
  h2 { margin:0 0 6px; font-size:23px; letter-spacing:-.03em }
  h3 { margin:22px 0 8px; font-size:16px; letter-spacing:-.01em }
  section > p, .prose p { margin:0 0 14px; color:#3a404a; max-width:80ch }
  section > ul, .prose ul, section > ol { margin:0 0 14px; padding-left:22px; color:#3a404a; max-width:80ch }
  section li { margin:5px 0 }
  table { width:100%; border-collapse:collapse; font-size:13.5px }
  th, td { padding:9px 11px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line) }
  thead th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
  tbody th { font-weight:650; min-width:150px }
  td small, th small { display:block; margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.45; font-weight:400 }
  td.num { text-align:right; font-variant-numeric:tabular-nums }
  .tag { display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:.03em }
  .tag.keep { background:#e9f7f0; color:var(--green) }
  .tag.no { background:#fdeeec; color:var(--red) }
  .tag.ref { background:#fdf3e4; color:var(--amber) }
  .tag.core { background:var(--blue-soft); color:var(--blue) }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:14px 0 6px }
  @media (max-width:840px){ .metrics { grid-template-columns:repeat(2,1fr) } }
  .metric { padding:15px; border:1px solid var(--line); border-radius:12px; background:#fafbfd }
  .metric strong { display:block; font-size:22px; letter-spacing:-.04em }
  .metric span { color:var(--muted); font-size:11px; line-height:1.4; display:block; margin-top:2px }
  .box { padding:18px; border:1px solid var(--line); border-radius:13px; background:#fff }
  .box h4 { margin:0 0 8px; font-size:13.5px }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px }
  @media (max-width:840px){ .cols { grid-template-columns:1fr } }
  .box.free h4 { color:var(--green) } .box.cost h4 { color:var(--red) } .box.warn h4 { color:var(--amber) }
  .box ul { margin:0; padding-left:18px; color:#4a5057; font-size:13px }
  .box li { margin:5px 0 }
  .diagram { width:100%; height:auto; display:block; margin:12px 0 4px }
  .crit td.s { width:52px; text-align:center }
  .score { font-weight:700 } .score.win { color:var(--green) }
  .fr { counter-reset:fr }
  .fr li { counter-increment:fr; margin:7px 0 }
  ol.srcs { margin:8px 0 0; padding-left:26px; font-size:12.5px; color:var(--muted); columns:2; column-gap:28px }
  ol.srcs li { margin:4px 0; break-inside:avoid }
  footer { margin-top:26px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
    display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px }
"""

SOURCES = [
    "Chat request, 2026-09-07 — Zach: current impl “very much a handheld system”, wants a redo on prior art; names AFFiNE and Onlook; targets Base UI/Radix + shadcn + tldraw",
    "Explore agent, 2026-09-07 (this session, read-only) — full functional-requirements map of the current implementation, file:line cited throughout §2",
    "src/chrome/SelectionContextualMenu.tsx L52-68 (this repo) — the WHY comment: tldraw's own <code>TldrawUiContextualToolbar</code> “clamps the toolbar down onto a selection near the top of the viewport instead of flipping below it, and its gap and margin constants are not configurable”",
    "src/chrome/selectionMenuPlacement.ts (this repo) — the hand-rolled FigJam-flip placement math replacing it",
    "src/blocks/ui/BlockContextMenu.tsx, ReliableContextMenu.tsx (this repo) — the second, independently hand-rolled floating surface (right-click menu); ReliableContextMenu imports <code>radix-ui</code> directly to patch a tldraw bug",
    "src/contextualMenus/contextualSurfaceRegistry.ts (this repo) — the existing partial config-driven layer (surface → ordered slot list), not yet shared with the right-click menu",
    "reports/toolbar-radix-spike-2026-09-07.html (this repo, tracked, commit 8c974f7a) — the bottom tool-belt rebuilt on raw Radix <code>Toolbar.Root</code>: parity reached on theme/dismissal/roving-focus/tooltips/icons; digit keys 1–9 and responsive overflow LOST (owned by tldraw's <code>OverflowingToolbar</code>)",
    "docs/work-order-chrome-on-base-ui-shadcn.md on branch claude/primitive-rebuild-ui-lab-67f93c, commit a52dd20e (this repo, git show) — the Base UI migration plan: 5 of 6 direct radix-ui importers already moved and PASS; two hard exceptions named (ReliableContextMenu, the tool belt); the Tailwind-bridge decision (§2) blocks everything; 6 traps already paid for",
    "tldraw.dev/examples/contextual-toolbar — the SDK's own <code>TldrawUiContextualToolbar</code> primitive: <code>getSelectionBounds</code> prop, <code>track()</code>-wrapped, gated on <code>editor.isIn('select.idle')</code>, mounted via the <code>InFrontOfTheCanvas</code> component slot",
    "github.com/tldraw/tldraw apps/docs/content/docs/user-interface.mdx — <code>TldrawUiContextProvider</code>/component-override architecture; built-in floating toolbars for rich text, image and video selections",
    "radix-ui.com/primitives/docs/components/toolbar — Root/Button/Link/ToggleGroup/ToggleItem/Separator, roving-tabindex keyboard model; positioning is explicitly out of scope — composed with Popover/DropdownMenu via <code>asChild</code>",
    "radix-ui.com/primitives/docs/components/popover, jinghuangsu.com/til/radix-ui-popper — <code>@radix-ui/react-popper</code> wraps Floating UI's imperative API for Tooltip/Popover/DropdownMenu/ContextMenu/Select",
    "base-ui.com/react/components (component index, read 2026-09-07) — confirms a first-class <code>Toolbar</code> component plus <code>Popover.Positioner</code> (side/align/sideOffset, collision handling) as the anchor-positioning primitive",
    "ui.shadcn.com/docs/changelog/2026-07-base-ui-default — Base UI made the shadcn default in July 2026; Radix still shipped, not deprecated",
    "platejs.org/docs/components/floating-toolbar + platejs.org/r/floating-toolbar (registry JSON, fetched directly) — installs via <code>npx shadcn add https://platejs.org/r/floating-toolbar</code>; depends on <code>@platejs/floating</code> (a Floating UI wrapper) and a shared <code>toolbar.json</code>; positions with <code>offset(12)</code> + <code>flip()</code> across top/bottom-start/end with 12px padding; hides on competing UI (link picker, AI chat)",
    "reactflow.dev/api-reference/components/node-toolbar — <code>NodeToolbar</code>: position/align/offset/isVisible props, auto-hidden on multi-select, content does not scale with zoom",
    "raw NodeToolbar.tsx, xyflow/xyflow (github, fetched directly) — positions with a hand-written <code>getNodeToolbarTransform()</code> CSS-transform helper from <code>@xyflow/system</code>, not Floating UI — the one major example here that does NOT use a positioning library",
    "deepwiki.com/excalidraw/excalidraw (UI Components and Widgets; Actions and Toolbars, read 2026-09-07) — <code>Island</code> is the shared floating-surface container; <code>LayerUI</code> is the single top-level layout orchestrator; tool-selection and shape-properties are architecturally split, not one context-menu-per-selection",
    "github.com/onlook-dev/onlook + reports/tldraw-styling-lab-plan-2026-09-07.html §sources (this repo, already measured 2026-09-07) — Onlook's styling surface is a fixed top <code>editor-bar</code> (56 files, 5,800 lines), not a per-selection floating popup; its old right-side floating panel was deleted 2025-05-14",
    "github.com/quickdrawjs/quickdraw — MIT tldraw-alternative whiteboard SDK; ships “a responsive floating toolbar that sheds tools gracefully”, hand-built with zero runtime dependencies (no Radix/Base UI/floating-ui)",
    "AFFiNE / BlockSuite source, read directly at /home/bam/AFFiNE 2026-09-07 (this session, prior turn) — <code>AffineToolbarWidget</code> (blocksuite/affine/widgets/toolbar/src/toolbar.ts) + <code>ToolbarModuleConfig</code>/<code>ToolbarModuleExtension</code> per-flavour action registry (blocksuite/affine/gfx/shape/src/toolbar/config.ts); floating-ui-based positioning with a per-flavour <code>sideMap</code> offset",
    "package.json (this repo, read at build time) — current dependency versions",
]


def cite(*nums: int) -> str:
    return "<sup class='c'>" + ",".join(f"<a href='#s{n}'>{n}</a>" for n in nums) + "</sup>"


def source_index() -> str:
    items = "".join(f"<li id='s{i}'>{s}</li>" for i, s in enumerate(SOURCES, 1))
    return f"<ol class='srcs'>{items}</ol>"


def architecture_svg() -> str:
    return """
<svg class="diagram" viewBox="0 0 1060 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Recommended composition: three independent layers, each borrowed from a different reference">
  <style>
    .lane{fill:#fafbfd;stroke:#d9dee6}
    .t{font:700 13.5px Inter,sans-serif;fill:#1c2027}
    .s{font:400 11px Inter,sans-serif;fill:#5c636e}
    .box{fill:#fff;rx:10}
    .k{font:600 10.5px Inter,sans-serif;letter-spacing:.06em}
    .m{font:400 11px Inter,sans-serif;fill:#3a404a}
    .arrow{stroke:#5c636e;stroke-width:1.6;fill:none;marker-end:url(#a)}
  </style>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#5c636e"/></marker></defs>
  <rect class="box" x="10" y="14" width="330" height="270" rx="14" stroke="#3061e6" stroke-width="2"/>
  <text class="k" x="26" y="38" fill="#3061e6">1 &middot; POSITIONING</text>
  <text class="t" x="26" y="60">Floating UI, direct or via Base UI</text>
  <text class="m" x="26" y="86">offset + flip + shift + hide middleware</text>
  <text class="m" x="26" y="104">replaces the hand-rolled FigJam-flip</text>
  <text class="m" x="26" y="122">math in selectionMenuPlacement.ts</text>
  <text class="m" x="26" y="150">Solves the EXACT complaint that got</text>
  <text class="m" x="26" y="168">tldraw's own primitive rejected:</text>
  <text class="m" x="26" y="186">configurable gap/margin, real flip</text>
  <text class="m" x="26" y="214" font-weight="600">Base UI's Popover.Positioner already</text>
  <text class="m" x="26" y="232" font-weight="600">wraps this &mdash; no new dependency if</text>
  <text class="m" x="26" y="250" font-weight="600">Phase 0's Tailwind bridge has landed</text>
  <rect class="box" x="365" y="14" width="330" height="270" rx="14" stroke="#7048c8" stroke-width="2"/>
  <text class="k" x="381" y="38" fill="#7048c8">2 &middot; ACTION ASSEMBLY</text>
  <text class="t" x="381" y="60">Declarative per-selection modules</text>
  <text class="m" x="381" y="86">id + when(ctx) + content(ctx)/run(ctx)</text>
  <text class="m" x="381" y="104">&mdash; BlockSuite's ToolbarModuleConfig</text>
  <text class="m" x="381" y="122">grammar, not its code</text>
  <text class="m" x="381" y="150">Unifies the two hand-rolled, non-</text>
  <text class="m" x="381" y="168">sharing surfaces found in &sect;1: the</text>
  <text class="m" x="381" y="186">selection pill and BlockContextMenu</text>
  <text class="m" x="381" y="214" font-weight="600">Extends contextualSurfaceRegistry.ts</text>
  <text class="m" x="381" y="232" font-weight="600">&mdash; already a partial version of this</text>
  <text class="m" x="381" y="250" font-weight="600">idea &mdash; rather than replacing it</text>
  <rect class="box" x="720" y="14" width="330" height="270" rx="14" stroke="#1f8a5a" stroke-width="2"/>
  <text class="k" x="736" y="38" fill="#1f8a5a">3 &middot; TOOLBAR SEMANTICS</text>
  <text class="t" x="736" y="60">Base UI Toolbar (unchanged decision)</text>
  <text class="m" x="736" y="86">Roving tabindex, arrow-key nav,</text>
  <text class="m" x="736" y="104">grouping &mdash; already the target stack</text>
  <text class="m" x="736" y="122">tldraw's own TldrawUiToolbar already</text>
  <text class="m" x="736" y="150">gives this for free today; not the</text>
  <text class="m" x="736" y="168">pain point, so no change forced here</text>
  <text class="m" x="736" y="196" font-weight="600">Hard exceptions from the work order</text>
  <text class="m" x="736" y="214" font-weight="600">still apply: ReliableContextMenu stays</text>
  <text class="m" x="736" y="232" font-weight="600">on Radix; the BOTTOM tool belt is a</text>
  <text class="m" x="736" y="250" font-weight="600">separate, already-priced decision</text>
  <path class="arrow" d="M340 150 L365 150"/>
  <path class="arrow" d="M695 150 L720 150"/>
</svg>
"""


def build() -> str:
    m = measure()

    fr_items = [
        "Anchor to <code>editor.getSelectionRotatedScreenBounds()</code> and reposition live during pan/zoom/resize &mdash; a per-frame reactor, not compute-on-mount.",
        "Hide during active manipulation (translate/resize/rotate/handle-drag/brush/crop, plus a claimed drag-and-drop reorder) without unmounting, so the subscription survives the gesture.",
        "Flip above/below the selection, clamp within the viewport minus the bottom tool-belt and side margins, and center on the visible slice when the selection exceeds the viewport.",
        "Re-measure on content-driven size changes (a color picker opening changes the menu's own width) and on interface-scale changes (a CSS transform, not a layout resize).",
        "Suppress entirely when nothing is selected, a shape is being text-edited, or the active tool isn't <code>select</code>; support a distinct sub-mode for editing a title.",
        "Assemble a different action set per selection kind &mdash; shape, Block (single/multi), Branch, Behavior Tree, Code block, connection/edge &mdash; as pluggable modules, not one monolith.",
        "Support batch/shared-style editing across a multi-selection (color, stroke, port layout, routing) with a “shared vs. mixed” indication.",
        "Provide a color/appearance sub-panel and layout actions (tidy edges, reset routing) gated on selection contents.",
        "Keep wheel-pass-through (scrolling over the menu still pans the canvas) and correct pointer-events toggling when hidden.",
        "Preserve the right-click menu's separate, deep conditional command tree and its Radix compatibility with tldraw's own <code>DefaultContextMenuContent</code> &mdash; a hard boundary, not a target for unification.",
        "Full light/dark theming through the existing <code>--ss-*</code> tokens; no separate per-component theme logic.",
    ]
    fr_html = "".join(f"<li>{x}</li>" for x in fr_items)

    criteria = [
        ("Positioning fitness", 30, "does it solve the flip/margin/viewport-clamp problem that got tldraw's own primitive rejected here?"),
        ("Action-assembly fitness", 25, "declarative per-selection-kind action list, or one hardcoded component?"),
        ("Stack proximity", 25, "Base UI / Radix / shadcn / tldraw &mdash; how much composes as-is"),
        ("Source is public & alive", 10, "readable, checked-out code, recent commits"),
        ("Directly reusable", 10, "copy real code, vs. borrow the idea only"),
    ]
    weights = [c[1] for c in criteria]
    crit_head = "".join(f"<th>{esc(c[0])}<small>{c[1]}%</small></th>" for c in criteria)

    candidates = {
        "tldraw <code>TldrawUiContextualToolbar</code>": ([2, 2, 5, 5, 5], "built-in, already tried and rejected here", "no", 9),
        "SystemSketch today (baseline)": ([3, 2, 1, 5, 5], "the thing being replaced", "no", 3),
        "AFFiNE / BlockSuite toolbar widget": ([4, 5, 2, 5, 3], "grammar donor: per-flavour action modules", "ref", 20),
        "Radix Toolbar + Popper/Popover": ([4, 1, 4, 5, 5], "official primitive, positioning is a separate composed piece", "ref", 10),
        "Base UI Toolbar + Popover.Positioner": ([4, 1, 5, 5, 5], "the actual target stack; ships both halves already", "keep", 12),
        "Plate / Plate UI floating-toolbar": ([5, 2, 5, 5, 5], "closest already-assembled match: shadcn registry item, Floating UI inside", "keep", 14),
        "React Flow <code>NodeToolbar</code>": ([2, 1, 2, 5, 3], "contrast case &mdash; hand-written transform math, not Floating UI", "no", 16),
        "Excalidraw Island / LayerUI": ([1, 2, 1, 5, 2], "different shape entirely: fixed panel, not per-selection popup", "no", 17),
        "Onlook editor-bar": ([1, 1, 3, 5, 2], "static top bar, not a floating popup at all &mdash; named but not this pattern", "no", 18),
        "Quickdraw (whiteboard SDK)": ([2, 1, 1, 4, 1], "validates the UX expectation only; zero-dependency, hand-rolled, no ecosystem fit", "no", 19),
    }
    crit_rows = ""
    scored = []
    for name, (scores, role, tag, _src) in candidates.items():
        total = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
        scored.append((total, name))
    best = max(scored)[1]
    for name, (scores, role, tag, src) in candidates.items():
        total = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
        cells = "".join(f"<td class='s'>{s}</td>" for s in scores)
        crit_rows += (
            f"<tr><th>{name}<small><span class='tag {tag}'>{esc(role)}</span></small></th>{cells}"
            f"<td class='num score {'win' if name == best else ''}'>{total:.1f}</td>"
            f"<td class='num'>{cite(src)}</td></tr>"
        )

    free_cost = """
<div class="cols">
  <div class="box free">
    <h4>What tldraw already gives for free (bottom tool belt spike)</h4>
    <ul>
      <li>Theme &mdash; <code>--ss-*</code> tokens resolve inside <code>.tl-container</code> with no re-declaration</li>
      <li>Dismissal &mdash; one shared Radix dismissable-layer stack, one Escape</li>
      <li>Roving focus &mdash; <code>Toolbar.Root</code> is one Tab stop with arrow-key nav</li>
      <li>Tooltips &mdash; joins tldraw's existing provider</li>
      <li>Icons &mdash; same <code>@tldraw/assets</code> sprite map</li>
    </ul>
  </div>
  <div class="box cost">
    <h4>What it cost to leave tldraw's own toolbar</h4>
    <ul>
      <li>Digit keys 1&ndash;9 &mdash; <b>lost</b>, owned by <code>OverflowingToolbar</code>, not <code>Toolbar.Root</code></li>
      <li>Responsive overflow &mdash; <b>lost</b>, a raw flex row doesn't collapse at narrow widths</li>
      <li>Shortcut suppression &mdash; hand-written, one <code>editor.menus.addOpenMenu</code> call per overlay</li>
      <li>Tool-select overrides &mdash; still borrowed via <code>useTools()</code>; severing it is the single largest non-linear cost</li>
    </ul>
  </div>
</div>
<p class="quiet">This is the <b>bottom tool belt</b>, a different component from the selection pill this report is
about &mdash; but the cost table is the load-bearing precedent: leaving a tldraw-owned surface for a raw headless
primitive has a real, specific, already-measured price. The selection pill has no such free-ride today (it
already left <code>TldrawUiContextualToolbar</code>), so this cost table does not block it &mdash; it is
context for judging how much is at stake if a redo later touches the tool belt too.""" + cite(7) + """</p>
"""

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contextual toolbar prior art &middot; SystemSketch</title>
<style>{CSS}</style></head><body><main>

<div class="hero">
  <div class="eyebrow">SystemSketch &middot; contextual toolbar &middot; prior-art survey &middot; 7 September 2026</div>
  <h1>The popup menu isn't one problem. It's a positioning problem wearing an action-list problem.</h1>
  <p class="lead">You called the current selection toolbar “a handheld system” and want it redone on prior
  art, aimed at Base UI/Radix + shadcn + tldraw. It already left tldraw's own built-in primitive for a specific,
  documented reason<sup class='c'><a href='#s3'>3</a></sup> &mdash; so the right question isn't “which app's
  toolbar do we copy,” it's which library actually fixes that specific complaint, and which pattern fixes the
  second problem nobody named yet: two independently hand-rolled surfaces duplicating the same selection logic.</p>
  <div class="verdict">
    <b>Two separable adoptions, not one rebuild:</b>
    <ul>
      <li><b>Positioning</b> &mdash; Floating UI (directly, or via Base UI's <code>Popover.Positioner</code>, which
      already wraps it) replaces the hand-rolled flip/margin math and solves the exact configurability complaint
      that got tldraw's own toolbar rejected here.</li>
      <li><b>Action assembly</b> &mdash; AFFiNE/BlockSuite's declarative per-selection-kind module grammar
      (<code>id</code> + <code>when(ctx)</code> + <code>content</code>/<code>run</code>) is the closest real
      answer to the duplication between the selection pill and the right-click menu &mdash; borrow the grammar,
      extend <code>contextualSurfaceRegistry.ts</code>, don't replace it.</li>
    </ul>
    Neither requires touching the two things already ruled off-limits by this repo's own Base UI work order:
    <code>ReliableContextMenu</code> stays on Radix, and the bottom tool belt is a separate, already-priced
    decision.
  </div>
</div>

<section>
  <h2>1 &middot; What "handheld" actually means here</h2>
  <p>An Explore agent mapped the live implementation end to end<sup class='c'><a href='#s2'>2</a></sup>. The
  positioning is entirely hand-rolled: a per-frame reactor reads the selection's screen bounds and calls a pure
  FigJam-style flip function that writes raw CSS transform values &mdash; no Floating UI, no Popper, no Base UI
  Positioner<sup class='c'><a href='#s4'>4</a></sup>. That wasn't an oversight. The code says exactly why, in its
  own words:</p>
  <div class="quiet">"This deliberately replaces tldraw's <code>TldrawUiContextualToolbar</code>: that primitive
  clamps the toolbar down onto a selection near the top of the viewport instead of flipping below it, and its
  gap and margin constants are not configurable."<sup class='c'><a href='#s3'>3</a></sup></div>
  <p>Separately, a <em>second</em> floating surface &mdash; the right-click context menu
  (<code>BlockContextMenu.tsx</code>) &mdash; re-derives an overlapping set of selection predicates on its own,
  sharing no code with the selection pill<sup class='c'><a href='#s5'>5</a></sup>. That's the actual duplication
  cost of "handheld": not bad positioning math, but the same selection logic written twice with no shared
  registry. <code>contextualSurfaceRegistry.ts</code> already gestures at fixing this for the pill alone
  <sup class='c'><a href='#s6'>6</a></sup>.</p>
  <h3>Functional requirements any redo must keep</h3>
  <ol class="fr">{fr_html}</ol>
</section>

<section>
  <h2>2 &middot; Two things this repo already learned today &mdash; don't re-litigate them</h2>
  <p>Before comparing outside references: two artifacts already exist in this tree from earlier the same day and
  change what "redo the toolbar" can mean.</p>
  {free_cost}
  <p>The <b>Base UI work order</b><sup class='c'><a href='#s7'>7</a></sup> already priced a full chrome migration
  (~30,000 lines, 13 directories) and named exactly two hard exceptions: <code>ReliableContextMenu</code> (its
  contents are tldraw's own <code>DefaultContextMenuContent</code>, which emits Radix <code>ContextMenu.Item</code>
  nodes reading a Radix root &mdash; swapping the root strands every stock item) and the bottom tool belt (priced
  above). <b>The selection pill is not one of the two exceptions</b> &mdash; it's fair game, and the work order's
  Phase 0 (a Tailwind-v4-bridged-to-<code>--ss-*</code> decision, not yet made) is the actual blocker before any
  shadcn-styled component lands, not the toolbar redesign itself.</p>
</section>

<section>
  <h2>3 &middot; Prior art, scored against what this repo actually needs</h2>
  <p>Weighted toward the two real problems from &sect;1: does it fix positioning, does it fix action-assembly
  duplication, and does it sit in the chosen stack.</p>
  <table class="crit"><thead><tr><th>Reference</th>{crit_head}<th>Score</th><th>Src</th></tr></thead>
  <tbody>{crit_rows}</tbody></table>
  <h3>tldraw's own contextual toolbar &mdash; why it's the baseline, not the answer</h3>
  <p><code>TldrawUiContextualToolbar</code> is a real SDK primitive: a <code>getSelectionBounds</code> prop, a
  <code>track()</code>-reactive wrapper, gated on <code>editor.isIn('select.idle')</code>, mounted through the
  <code>InFrontOfTheCanvas</code> component slot<sup class='c'><a href='#s8'>8</a></sup>. It is exactly the seam
  SystemSketch's own <code>InFrontOfTheCanvas</code> mount point already uses<sup class='c'><a href='#s3'>3</a></sup>
  &mdash; it just clamps instead of flipping, with constants the SDK doesn't expose. Nothing here says "avoid
  tldraw's UI system"; it says the one specific primitive under discussion has one specific, narrow gap.</p>
  <h3>AFFiNE / BlockSuite &mdash; the action-assembly grammar to steal</h3>
  <p>Read directly this session<sup class='c'><a href='#s20'>20</a></sup>: one shared floating host subscribes to
  every selection type, resolves a "flavour" string, and defers all button content to a
  <code>ToolbarModuleConfig</code> registered per flavour &mdash; a sorted list of actions, each with a
  <code>when(ctx)</code> visibility predicate and either a <code>run(ctx)</code> handler or a
  <code>content(ctx)</code> template. That is a clean, general answer to functional requirement 6 (different
  action sets per selection kind) and the duplication in &sect;1 &mdash; the same shape
  <code>contextualSurfaceRegistry.ts</code> is already reaching for, just not yet covering the right-click menu
  too. Positioning is Floating UI underneath, same conclusion as the Radix/Base UI and Plate
  entries below.</p>
  <h3>Radix Toolbar + Popper, and Base UI Toolbar + Popover.Positioner</h3>
  <p>Radix's <code>Toolbar</code> is explicit that positioning is <em>not</em> its job &mdash; it's a grouping and
  roving-tabindex primitive, meant to be composed with a Popover/DropdownMenu for anything that floats
  <sup class='c'><a href='#s10'>10</a></sup>. Base UI ships the same split, but confirmed as of this session's
  read<sup class='c'><a href='#s12'>12</a></sup> to have <em>both</em> halves as first-class components: a
  <code>Toolbar</code> and a <code>Popover.Positioner</code> with side/align/collision handling &mdash; i.e. the
  target stack already contains the pieces this rebuild needs, no third library required. This also matches the
  work order's own guidance that Base UI's Positioner is the thing that "owns the z-index" and must anchor any
  floating surface<sup class='c'><a href='#s7'>7</a></sup>.</p>
  <h3>Plate's <code>floating-toolbar</code> &mdash; the closest pre-assembled match</h3>
  <p>Installed via <code>npx shadcn add https://platejs.org/r/floating-toolbar</code> &mdash; a real shadcn
  registry item, not a screenshot to reverse-engineer<sup class='c'><a href='#s14'>14</a>,<a href='#s15'>15</a></sup>.
  Its registry JSON declares <code>@platejs/floating</code> (a Floating UI wrapper) as a dependency and positions
  with <code>offset(12)</code> + <code>flip()</code> across four corner placements with 12px padding &mdash;
  functionally identical to what &sect;1's requirement 3 (flip, clamp, margin) is asking for, and it hides
  itself when a competing popover (their link picker, their AI chat) is open, the same pattern this app would
  need for "don't show the pill while the color picker sub-panel is open." It's built for text selection in a
  rich-text editor, not a whiteboard canvas, so the code doesn't drop in &mdash; but the shape (Toolbar primitive
  + Floating UI + a visibility-state hook) is a direct, current, ecosystem-native template.</p>
  <h3>React Flow's <code>NodeToolbar</code> &mdash; the instructive miss</h3>
  <p>Notable precisely because it's the odd one out: xyflow's own toolbar does <em>not</em> use Floating UI at
  all &mdash; it computes a CSS transform by hand from the node's internal position and the viewport's pan/zoom
  state<sup class='c'><a href='#s16'>16</a>,<a href='#s17'>17</a></sup>. That's the same category of hand-rolled
  math SystemSketch's own placement file uses, just for a node-graph instead of a whiteboard. Worth knowing
  because Langflow &mdash; already an adopted reference architecture for SystemSketch's property-panel work
  &mdash; is built on xyflow, so this is the toolbar pattern that comes bundled with that other reference stack.
  It's evidence that hand-rolled transform math is a common, working choice, not evidence that it's the best one
  available now that Floating UI is a one-dependency add.</p>
  <h3>Excalidraw, Onlook, Quickdraw &mdash; named, checked, ruled out for this specific problem</h3>
  <p>Excalidraw splits tool-selection and shape-properties into a fixed <code>Island</code>/<code>LayerUI</code>
  layout, not a per-selection floating popup<sup class='c'><a href='#s18'>18</a></sup> &mdash; a different UI
  shape entirely. Onlook's editing surface, confirmed by this repo's own earlier measurement, is a static top
  <code>editor-bar</code>, not a floating popup at all<sup class='c'><a href='#s19'>19</a></sup> &mdash; worth
  naming because you raised it, but its "logic" isn't actually the same problem: nothing in it decides where to
  float or flips at a viewport edge, because it never moves. Quickdraw validates that a "responsive floating
  toolbar" is a genre expectation for whiteboard SDKs, but it's hand-built with zero dependencies and no Radix/
  Base UI/shadcn footprint<sup class='c'><a href='#s21'>21</a></sup> &mdash; a UX data point, not a code donor.</p>
</section>

<section>
  <h2>4 &middot; Recommended composition</h2>
  {architecture_svg()}
  <p>Three independently adoptable layers, matched to what's actually broken:</p>
  <ol>
    <li><b>Positioning</b> &mdash; adopt Floating UI's <code>offset</code>/<code>flip</code>/<code>shift</code>/
    <code>hide</code> middleware (directly, or through Base UI's <code>Popover.Positioner</code> once Phase 0
    lands) in place of <code>selectionMenuPlacement.ts</code>'s hand-rolled math. This is a like-for-like
    replacement of one file's algorithm, not a rewrite of the component tree, and it's the fix for the exact
    "not configurable" complaint that already ruled out tldraw's own primitive.</li>
    <li><b>Action assembly</b> &mdash; adopt BlockSuite's grammar (id, <code>when(ctx)</code>,
    <code>content</code>/<code>run</code>) as the shape for extending <code>contextualSurfaceRegistry.ts</code>
    to also drive <code>BlockContextMenu.tsx</code>'s item tree, so the two currently-duplicated predicate sets
    (block/branch/behaviorTree/code/wrap/layout eligibility) live in one place.</li>
    <li><b>Toolbar semantics</b> &mdash; no change forced. Base UI's <code>Toolbar</code> (roving tabindex,
    grouping) is already the target stack and tldraw's own <code>TldrawUiToolbar</code> already gives this for
    free today; this was never the pain point.</li>
  </ol>
  <p>Both hard exceptions from the work order still hold and this doesn't touch either:
  <code>ReliableContextMenu</code> stays on Radix because it feeds tldraw's own stock menu items, and the bottom
  tool belt remains a separate, already-priced decision (digit keys, responsive overflow) that this report does
  not reopen.</p>
  <p class="quiet">Not done: no code written, no branch created, no library installed. This is a reading-and-
  scoring pass only, per the ask.</p>
</section>

<footer>
  <span>SystemSketch &middot; contextual toolbar prior art &middot; built at <code>{esc(m['head'])}</code> &middot;
  tldraw {esc(m['tldraw'])} &middot; radix-ui {esc(m['radix'])} &middot; react {esc(m['react'])} &middot;
  @base-ui/react {esc(m['baseui'])}</span>
</footer>

<section>
  <h2>Source index</h2>
  {source_index()}
</section>

</main></body></html>"""
    return page


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
