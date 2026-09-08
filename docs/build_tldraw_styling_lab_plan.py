#!/usr/bin/env python3
"""Build reports/tldraw-styling-lab-plan-2026-09-07.html — the implementation plan
for `tldraw_styling_lab`: stock tldraw plus one Figma-shaped right inspector that
exposes everything the tldraw canvas can render, built on Base UI + shadcn/ui.

Zach's ask (Daily Note - Sep 7 2026): "Start with the stock tldraw editor, add
just 1 thing, a right inspector panel inspired by figma … the goal here is to
expose all of those [stylings]"; "Which of these two repos [open-pencil, onlook]
… better starting reference?"; "Instead of hand rolling we want to use base UI
or radix … shadcn … kibo-ui"; "make a plan where you go through shadcn and
kibo-ui and see how you can do what you want with prebuilt components";
"What do you think of this plan? help me improve my thinking".

Research: five scouts (open-pencil clone, onlook partial clone, shadcn/Kibo/Base UI
web facts, Tailwind-issue and registry facts, vault + repo prior thinking), one
census of the existing inspector worktree, and one builder that MEASURED
Tailwind v4's effect on a stock tldraw board in a scratch project. Those probe
numbers are read from docs/tldraw-styling-lab-probe-2026-09-07.json (written from
the probe's RESULT.md); this builder refuses to run without it so the page can
never carry a remembered number in place of a measured one.

Output is text + inline SVG; reference stills are referenced relatively from the
ignored reports/media/tldraw-styling-lab-plan/ directory, per reports/README.md.
"""

from __future__ import annotations

import html
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_OUTPUT",
        ROOT / "reports" / "tldraw-styling-lab-plan-2026-09-07.html",
    )
)
MEDIA_DIR = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_MEDIA_DIR",
        ROOT / "reports" / "media" / "tldraw-styling-lab-plan",
    )
)
PROBE = ROOT / "docs" / "tldraw-styling-lab-probe-2026-09-07.json"
WORKTREE = ROOT / ".claude" / "worktrees" / "tldraw-inspector-panel-cf524c"
# The donor branch's head when this plan was written (claude/tldraw-inspector-panel-cf524c).
DONOR_SHA = "77907974"
MEDIA_REL = "media/tldraw-styling-lab-plan"
# WHY: the retained review runtime reruns this builder inside a pinned worktree that may
# carry no node_modules of its own; the pinned tldraw is the same version, so reading the
# main checkout's copy keeps the measured numbers real instead of degrading them to "?".
NODE_MODULES = (
    ROOT / "node_modules" if (ROOT / "node_modules" / "tldraw").exists()
    else Path("/home/bam/systemsketch") / "node_modules"
)


# --------------------------------------------------------------------------
# Build-time measurements
# --------------------------------------------------------------------------

def sh(cmd: str, cwd: Path = ROOT) -> str:
    try:
        return subprocess.run(
            ["bash", "-c", cmd], capture_output=True, text=True, cwd=cwd, timeout=60
        ).stdout.strip()
    except Exception:
        return ""


def count_lines(path: Path) -> str:
    try:
        return f"{sum(1 for _ in path.open(encoding='utf-8')):,}"
    except OSError:
        return "?"


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def measure() -> dict[str, str]:
    m: dict[str, str] = {}
    pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    m["tldraw"] = deps.get("tldraw", "?")
    m["react"] = deps.get("react", "?")
    m["radix"] = deps.get("radix-ui", "?")
    m["has_tailwind"] = "yes" if any(k.startswith("tailwindcss") for k in deps) else "no"

    css = NODE_MODULES / "tldraw" / "tldraw.css"
    try:
        text = css.read_text(encoding="utf-8")
        names = set(re.findall(r"--[a-z][a-z0-9-]*", text))
        tl = sorted(n for n in names if n.startswith("--tl-"))
        other = sorted(n for n in names if not n.startswith("--tl-"))
        m["tl_vars"] = f"{len(tl):,}"
        m["non_tl_vars"] = ", ".join(other) or "none"
        m["non_tl_count"] = str(len(other))
    except OSError:
        m["tl_vars"] = "?"
        m["non_tl_vars"] = "?"
        m["non_tl_count"] = "?"

    panel = (
        NODE_MODULES / "tldraw" / "src" / "lib" / "ui" / "components"
        / "StylePanel" / "DefaultStylePanelContent.tsx"
    )
    try:
        styles = re.findall(r"style=\{([A-Za-z]+Style)\}", panel.read_text(encoding="utf-8"))
        m["stock_pickers"] = str(len(set(styles)))
        m["stock_picker_names"] = ", ".join(sorted(set(styles)))
    except OSError:
        m["stock_pickers"] = "?"
        m["stock_picker_names"] = "?"

    # WHY a pinned commit and not the worktree path: the retained review runtime reruns
    # this builder inside its own pinned checkout, where .claude/worktrees/ does not exist,
    # and the donor worktree itself is slated to be swept once the lab lands its port. The
    # branch's commits live in the shared object store, so `git show <sha>:<path>` measures
    # the same bytes from any checkout, forever.
    def branch_file(path: str) -> str:
        return sh(f"git show {DONOR_SHA}:{path}")

    src = branch_file("src/inspector/primitiveInspectorModel.ts")
    if src:
        paint = len(re.findall(r"^\s*paintField\(", src, re.M))
        style = len(re.findall(r"^\s*styleField\(", src, re.M))
        prop = len(re.findall(r"^\s*propField\(", src, re.M))
        inline = len(re.findall(r"^\s+id: '[A-Za-z]+',", src, re.M))
        m["fields_paint"] = str(paint)
        m["fields_style"] = str(style)
        m["fields_prop"] = str(prop)
        m["fields_inline"] = str(inline)
        m["fields_total"] = str(paint + style + prop + inline)
        m["model_ss_imports"] = str(
            len(re.findall(r"from '\.\./(contextualMenus|systemSketchArrow)", src))
        )
    else:
        for k in ("fields_paint", "fields_style", "fields_prop", "fields_inline", "fields_total", "model_ss_imports"):
            m[k] = "?"

    def branch_lines(path: str) -> str:
        text = branch_file(path)
        return f"{text.count(chr(10)) + 1:,}" if text else "?"

    m["lines_model"] = branch_lines("src/inspector/primitiveInspectorModel.ts")
    m["lines_overrides"] = branch_lines("src/inspector/primitiveOverrides.ts")
    m["lines_view"] = branch_lines("src/inspector/PrimitiveInspector.tsx")
    m["lines_css"] = branch_lines("src/inspector/primitive-inspector.css")
    m["lines_scrub"] = branch_lines("src/inspector/ScrubNumber.tsx")
    test_total = 0
    for t in (
        "src/inspector/primitiveInspectorModel.test.ts",
        "src/inspector/primitiveOverrides.test.ts",
        "src/inspector/ScrubNumber.test.ts",
    ):
        text = branch_file(t)
        test_total += text.count(chr(10)) + 1 if text else 0
    m["lines_tests"] = f"{test_total:,}" if test_total else "?"
    m["wt_head"] = DONOR_SHA
    m["wt_ahead"] = sh(f"git rev-list --count main..{DONOR_SHA}") or "?"
    m["wt_stat"] = sh(f"git diff --shortstat main...{DONOR_SHA}") or "?"
    m["wt_merged"] = "yes" if sh(f"git merge-base --is-ancestor {DONOR_SHA} main && echo yes") else "no"
    pkg_text = branch_file("package.json")
    base_match = re.search(r'"@base-ui/react":\s*"([^"]+)"', pkg_text)
    m["baseui"] = base_match.group(1).lstrip("^~") if base_match else "?"
    m["ss_tokens"] = sh("grep -oE -- '--ss-[a-z0-9-]+' src/theme/tokens.css | sort -u | wc -l") or "?"
    m["main_head"] = sh("git rev-parse --short HEAD") or "?"
    return m


def load_probe() -> dict:
    if not PROBE.exists():
        raise SystemExit(
            f"missing {PROBE.relative_to(ROOT)} — write it from the probe's RESULT.md first; "
            "this report never carries a remembered measurement"
        )
    return json.loads(PROBE.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# Page
# --------------------------------------------------------------------------

CSS = """
  :root { color-scheme:light; --ink:#1c2027; --muted:#5c636e; --line:#d9dee6; --paper:#f2f4f8;
    --card:#fff; --blue:#3061e6; --blue-soft:#e9f0fe; --green:#1f8a5a; --red:#c8453a; --amber:#c47b1b;
    --violet:#7048c8; }
  * { box-sizing:border-box }
  body { margin:0; color:var(--ink); background:radial-gradient(circle at 82% -4%,#e5edfb 0,transparent 40%),var(--paper);
    font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }
  main { width:min(1120px,calc(100% - 32px)); margin:auto; padding:40px 0 72px }
  code { font:0.86em ui-monospace,SFMono-Regular,Menlo,monospace; background:#eef1f6; padding:1px 5px; border-radius:5px }
  pre { font:12.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; background:#141a24; color:#e6edf7; padding:14px 16px;
    border-radius:10px; overflow:auto; margin:10px 0 }
  pre code { background:none; padding:0; color:inherit; font-size:inherit }
  a { color:var(--blue); text-decoration:none } a:hover { text-decoration:underline }
  sup.c { font:600 10.5px/1 ui-monospace,monospace; color:var(--blue); letter-spacing:.02em }
  sup.c a { color:inherit }
  .hero { padding:42px; border:1px solid #d5dde8; border-radius:24px; background:#ffffffe8; box-shadow:0 22px 60px #22344c14 }
  .eyebrow { color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase }
  h1 { margin:10px 0 14px; font-size:clamp(32px,5vw,52px); line-height:1.04; letter-spacing:-.045em; max-width:24ch }
  .lead { max-width:74ch; margin:0; color:var(--muted); font-size:17.5px }
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
  h2 { margin:0 0 6px; font-size:24px; letter-spacing:-.03em }
  h3 { margin:22px 0 8px; font-size:16.5px; letter-spacing:-.01em }
  section > p, .prose p { margin:0 0 14px; color:#3a404a; max-width:80ch }
  section > ul, .prose ul { margin:0 0 14px; padding-left:22px; color:#3a404a; max-width:80ch }
  section li { margin:5px 0 }
  table { width:100%; border-collapse:collapse; font-size:13.5px }
  th, td { padding:10px 12px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line) }
  thead th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
  tbody th { font-weight:650; min-width:130px }
  td small, th small { display:block; margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.45; font-weight:400 }
  td.num { text-align:right; font-variant-numeric:tabular-nums }
  .tag { display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:.03em }
  .tag.b1 { background:var(--blue-soft); color:var(--blue) }
  .tag.b2 { background:#f0eafd; color:var(--violet) }
  .tag.keep { background:#e9f7f0; color:var(--green) }
  .tag.no { background:#fdeeec; color:var(--red) }
  .tag.ref { background:#fdf3e4; color:var(--amber) }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:14px 0 6px }
  @media (max-width:840px){ .metrics { grid-template-columns:repeat(2,1fr) } }
  .metric { padding:15px; border:1px solid var(--line); border-radius:12px; background:#fafbfd }
  .metric strong { display:block; font-size:24px; letter-spacing:-.04em }
  .metric span { color:var(--muted); font-size:11px; line-height:1.4; display:block; margin-top:2px }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px }
  @media (max-width:840px){ .cols { grid-template-columns:1fr } }
  .box { padding:18px; border:1px solid var(--line); border-radius:13px; background:#fff }
  .box h4 { margin:0 0 8px; font-size:13.5px }
  .box.free h4 { color:var(--green) } .box.cost h4 { color:var(--red) } .box.warn h4 { color:var(--amber) }
  .box ul { margin:0; padding-left:18px; color:#4a5057; font-size:13px }
  .box li { margin:5px 0 }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin:14px 0 6px }
  figure { margin:0; border:1px solid var(--line); border-radius:12px; background:#fafbfd; padding:10px; display:flex; flex-direction:column }
  figure img { width:100%; height:auto; display:block; border-radius:8px; border:1px solid #e3e8ef; background:#fff }
  figure.tall img { max-height:420px; object-fit:cover; object-position:top }
  figcaption { font-size:12px; color:var(--muted); margin-top:8px; line-height:1.45 }
  figcaption b { color:var(--ink) }
  .diagram { width:100%; height:auto; display:block; margin:12px 0 4px }
  .crit td.w { width:64px } .crit td.s { width:56px; text-align:center }
  .score { font-weight:700 } .score.win { color:var(--green) }
  .step { margin-top:16px; padding:18px 20px; border:1px solid var(--line); border-radius:13px; background:#fafbfd }
  .step h3 { margin:0 0 4px; display:flex; gap:10px; align-items:center; flex-wrap:wrap }
  .step .gate { margin:8px 0 0; padding:10px 12px; border-left:3px solid var(--green); background:#f1faf5; font-size:13px; border-radius:6px }
  .step .gate b { color:var(--green) }
  .step p, .step ul { font-size:14px; color:#3a404a; max-width:82ch }
  .q { margin-top:14px; padding:16px 18px; border:1px solid #cfd9ea; border-radius:12px; background:#f6f9ff }
  .q h4 { margin:0 0 6px; font-size:14.5px }
  .q p { margin:4px 0; font-size:13.5px; color:#3a404a }
  .q .dflt { color:var(--green); font-weight:650 }
  ol.srcs { margin:8px 0 0; padding-left:26px; font-size:12.5px; color:var(--muted); columns:2; column-gap:28px }
  ol.srcs li { margin:4px 0; break-inside:avoid }
  footer { margin-top:26px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
    display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px }
"""

SOURCES = [
    "Daily Note - Sep 7 2026 (vault, Created by Me) — the ask, the two candidate repos, the stack table, and the earlier same-day realisation: “instead of starting with screenshots I want to start with open source code”",
    "github.com/open-pencil/open-pencil — MIT, 8,210 stars, last commit 2026-09-07; shallow clone read 2026-09-07: package.json (vue 3.5.41, reka-ui 2.10.3, tailwindcss 4.3.3, tailwind-variants 3.3.1, nanostores 1.5.0, canvaskit-wasm 0.41.1, yoga-layout, vite 8.1.4, bun workspaces); src/components/DesignPanel.vue, src/components/properties/ (4,927 lines), ui/panel/PanelSection.vue, PanelGrid.vue, PanelFieldGroup.vue, PropertyListRoot.vue, inputs/NumberField.vue (sensitivity drag-scrub), src/app.css @theme",
    "github.com/onlook-dev/onlook — Apache-2.0, partial clone read 2026-09-07, last public commit 423e2e92 (2026-07-21): apps/web/client/src/app/project/[id]/_components/main.tsx mounts the top `editor-bar` (48 files, 9,732 lines); right-panel/ holds only chat-tab/; git -S finds no right-side styles panel in any commit; stack Next.js 16, React 19.2, @radix-ui/* (~40), Tailwind 4.0/4.1, mobx, Bun; InputRange (169 lines, hand-rolled scrub), ColorPickerContent (795 lines, hand-rolled)",
    "Zach's own screenshot of the hosted Onlook app (Pasted image 20260907170607.png) shows a Chat | Styles tab pair in the right panel — that Styles tab does not exist in the public repository as of its last commit",
    "ui.shadcn.com/docs/changelog/2026-07-base-ui-default — Base UI is the default primitive library for `npx shadcn init` since July 2026; Radix remains supported; shadcn CLI version measured by the probe",
    "ui.shadcn.com/docs/registry, /docs/registry/registry-item-json, /docs/registry/getting-started — item types registry:ui / block / component / hook / lib / page / file / style / theme / font / item / base; items carry dependencies, devDependencies, registryDependencies, cssVars, css; `shadcn build` emits registry.json + per-item JSON; consumed with `npx shadcn add <url>` or a namespaced registry in components.json; no local-path or git-URL install documented — the registry must be HTTP-served",
    "registry.npmjs.org/@base-ui/react — MIT; base-ui.com/react/overview/releases — 1.0.0 stable 2025-12-11, package renamed from @base-ui-components/react; base-ui.com/react/components/number-field — ScrubArea with Pointer Lock and edge teleport, pixelSensitivity default 2",
    "github.com/haydenbleasel/kibo (also published under shadcnblocks) — MIT, ~41 components; shallow clone grep 2026-09-07: theme-switcher, banner, combobox, code-block, relative-time, dialog-stack, mini-calendar, reel import @radix-ui/react-use-controllable-state or radix-ui directly; no Base UI registry variant; the probe records what `npx shadcn add` of its color-picker did in a Base UI project",
    "tailwindcss.com/docs/preflight — “To disable Preflight, simply omit its import while keeping everything else: @layer theme, base, components, utilities; @import \"tailwindcss/theme.css\" layer(theme); @import \"tailwindcss/utilities.css\" layer(utilities);”",
    "tailwindlabs/tailwindcss issues #17481 (open), #17445 (closed), #19114 (closed) — re-read 2026-09-07: all three concern builds that include preflight.css (or a v3 preflight meeting v4); none applies when preflight.css is never imported",
    "Scratch build with tailwindcss@4.3.3 + @tailwindcss/cli, theme+utilities layers only, 2026-09-07: output holds an empty `@layer properties;`, `@layer theme { :root, :host { --font-*, --color-* … } }` and `@layer utilities { … }` — no `*, ::before, ::after` rule, no @property registrations",
    "node_modules/tldraw/tldraw.css at the pinned version, read at build time — every tldraw custom property is namespaced `--tl-*`; the only non-`--tl-` names are Radix's own popper/toast variables and two private helpers (listed in §3)",
    "node_modules/tldraw/src/lib/ui/components/StylePanel/DefaultStylePanel.tsx — `TLUiStylePanelProps { isMobile, styles, children }`, `useRelevantStyles()`, `usePassThroughWheelEvents`, pointermove → `editor.markEventAsHandled`, Escape returns focus to the container; components.tsx registers `StylePanel` as an overridable component",
    "docs/work-order-primitive-inspector.md on branch claude/tldraw-inspector-panel-cf524c (this repo) — the 51-field census, the paintReaches gate, the 73/42/31 display-value count, §3 the stock-compatibility button Zach asked for and nobody has built, §4 the meta-merge trap",
    "reports/ui-design-system-strategy-2026-09-07.html (this repo) — Axis 1: converge app-authored chrome on Base UI (Zach: “100%, no questions asked”); Axis 2: keep the --ss-* token layer; ruled out: Tailwind *as a repo migration* and “shadcn/ui in any installed form … foreclosed without Tailwind”",
    "Auto-memory (this repo): figma-scrub-field, picker-is-not-the-engine, base-ui-positioner-owns-the-z-index, theme-tokens-live-on-the-container, tldraw-file-parser-resets-colour-enum, tldraw-shortcuts-off-while-menu-open, journey-suite-is-not-a-gate, golden-board-not-golden-pixels",
    "github.com/excalidraw/excalidraw packages/excalidraw/components/Stats/DragInput.tsx (MIT) — the whiteboard-native drag-input pattern: label carries the drag, `value: number | 'Mixed'`, sensitivity in px per step",
    "tweakcn.com (jnsahaj/tweakcn, MIT) — visual theme editor for shadcn tokens; exports CSS, not a registry:theme item",
    "docs/tldraw-styling-lab-probe-2026-09-07.json (this repo) — the scratch-project measurements rendered in §3; written from the probe's RESULT.md, see the file for the exact commands",
]


def source_index() -> str:
    items = "".join(f"<li id='s{i}'>{esc(s)}</li>" for i, s in enumerate(SOURCES, 1))
    return f"<ol class='srcs'>{items}</ol>"


def cite(*nums: int) -> str:
    return "<sup class='c'>" + ",".join(f"<a href='#s{n}'>{n}</a>" for n in nums) + "</sup>"


def img(name: str, caption: str, tall: bool = False) -> str:
    return (
        f"<figure class='{'tall' if tall else ''}'><img src='{MEDIA_REL}/{name}' alt='{esc(caption)}'>"
        f"<figcaption>{caption}</figcaption></figure>"
    )


def architecture_svg() -> str:
    return """
<svg class="diagram" viewBox="0 0 1060 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The lab repo, its registry, and SystemSketch consuming it">
  <style>
    .lane{fill:#fafbfd;stroke:#d9dee6}
    .t{font:700 14px Inter,sans-serif;fill:#1c2027}
    .s{font:400 11.5px Inter,sans-serif;fill:#5c636e}
    .box{fill:#fff;stroke:#c9d2df;rx:10}
    .box.stock{stroke:#1f8a5a;stroke-width:2}
    .box.ui{stroke:#3061e6;stroke-width:2}
    .box.model{stroke:#7048c8;stroke-width:2}
    .box.reg{stroke:#c47b1b;stroke-width:2}
    .l{font:600 12.5px Inter,sans-serif;fill:#1c2027}
    .m{font:400 11px Inter,sans-serif;fill:#5c636e}
    .arrow{stroke:#5c636e;stroke-width:1.6;fill:none;marker-end:url(#a)}
    .arrow.thick{stroke:#c47b1b;stroke-width:2.2}
  </style>
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#5c636e"/></marker></defs>
  <rect class="lane" x="10" y="10" width="560" height="380" rx="16"/>
  <text class="t" x="28" y="36">tldraw_styling_lab (new repo)</text>
  <text class="s" x="28" y="54">react · tldraw 5.3.2 · @base-ui/react · tailwind v4 (layers only) · shadcn-generated ui/</text>
  <rect class="box stock" x="28" y="78" width="250" height="118"/>
  <text class="l" x="42" y="100">&lt;Tldraw components={{ StylePanel }} /&gt;</text>
  <text class="m" x="42" y="120">stock editor, stock record, stock .tldr</text>
  <text class="m" x="42" y="138">configured utils only for the paint seam</text>
  <text class="m" x="42" y="156">(getCustomDisplayValues, customGeoTypes)</text>
  <text class="m" x="42" y="180">the ONE thing added: the panel →</text>
  <rect class="box ui" x="310" y="78" width="240" height="118"/>
  <text class="l" x="324" y="100">Inspector view (shadcn + Base UI)</text>
  <text class="m" x="324" y="120">Sidebar · Collapsible sections · Field rows</text>
  <text class="m" x="324" y="138">NumberField.ScrubArea · ToggleGroup · Select</text>
  <text class="m" x="324" y="156">Popover + colour picker · Switch · Input</text>
  <text class="m" x="324" y="176">draws a row; decides nothing</text>
  <rect class="box model" x="310" y="222" width="240" height="96"/>
  <text class="l" x="324" y="244">Inspector model (React-free .ts)</text>
  <text class="m" x="324" y="264">FieldSpec { applies · read · write }</text>
  <text class="m" x="324" y="282">51 fields today, ported from the worktree</text>
  <text class="m" x="324" y="300">+ meta override contract, + tests</text>
  <path class="arrow" d="M430 196 L430 222"/>
  <path class="arrow" d="M310 270 C 240 270, 200 200, 180 196"/>
  <text class="m" x="150" y="290">reads the editor · writes shapes</text>
  <rect class="box reg" x="28" y="340" width="522" height="38"/>
  <text class="l" x="42" y="364">registry.json  →  `shadcn build`  →  public/r/tldraw-inspector.json (ui + lib + css items)</text>
  <path class="arrow" d="M430 318 L430 340"/>
  <rect class="lane" x="600" y="10" width="450" height="380" rx="16"/>
  <text class="t" x="618" y="36">SystemSketch (this repo)</text>
  <text class="s" x="618" y="54">consumes, never forks: `npx shadcn add http://…/r/tldraw-inspector.json`</text>
  <rect class="box" x="618" y="78" width="412" height="96"/>
  <text class="l" x="632" y="100">src/inspector/ (copied by the registry)</text>
  <text class="m" x="632" y="120">same model, same view, same tests; a sync test compares the</text>
  <text class="m" x="632" y="138">copy's hash to the registry item so drift fails `npm run check`</text>
  <text class="m" x="632" y="156">+ the SystemSketch-only fields (slanted arrow, Block…) layered on top</text>
  <rect class="box" x="618" y="198" width="412" height="80"/>
  <text class="l" x="632" y="220">Tailwind bridge, additive</text>
  <text class="m" x="632" y="240">theme + utilities layers only (no preflight) ·</text>
  <text class="m" x="632" y="258">@theme inline { --color-background: var(--ss-surface-raised) … }</text>
  <rect class="box" x="618" y="302" width="412" height="76"/>
  <text class="l" x="632" y="324">Right dock `shape` lens · `?stock-inspector` route</text>
  <text class="m" x="632" y="344">the panel replaces ShapeFactsPanel; tests/test_stock_boundary.py</text>
  <text class="m" x="632" y="362">gains one line: the StylePanel seam</text>
  <path class="arrow thick" d="M550 359 C 585 359, 585 126, 618 126"/>
</svg>
"""


def layers_svg() -> str:
    return """
<svg class="diagram" viewBox="0 0 1060 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three styling layers: record, renderer, theme">
  <style>
    .t{font:700 14px Inter,sans-serif;fill:#1c2027}
    .m{font:400 11.5px Inter,sans-serif;fill:#3a404a}
    .k{font:600 11px Inter,sans-serif;letter-spacing:.06em}
    .box{fill:#fff;rx:12}
  </style>
  <rect class="box" x="10" y="14" width="330" height="222" stroke="#1f8a5a" stroke-width="2"/>
  <text class="k" x="26" y="38" fill="#1f8a5a">1 · RECORD</text>
  <text class="t" x="26" y="60">Style props + shape props</text>
  <text class="m" x="26" y="84">13 StyleProps (colour, fill, dash, size, font, align…)</text>
  <text class="m" x="26" y="102">+ per-shape props (geo, scale, flip, bend, autoSize…)</text>
  <text class="m" x="26" y="120">+ x, y, w, h, rotation, opacity, isLocked</text>
  <text class="m" x="26" y="148">Travels in the .tldr. Stock tldraw paints it identically.</text>
  <text class="m" x="26" y="166">tldraw's own picker shows 11 of these.</text>
  <text class="m" x="26" y="196" font-weight="600">Inspector: always on, any host.</text>
  <rect class="box" x="365" y="14" width="330" height="222" stroke="#3061e6" stroke-width="2"/>
  <text class="k" x="381" y="38" fill="#3061e6">2 · RENDERER</text>
  <text class="t" x="381" y="60">Display values + CSS vars</text>
  <text class="m" x="381" y="84">getCustomDisplayValues: exact colours, stroke px,</text>
  <text class="m" x="381" y="102">font size/weight/line-height, note size, halo… (73)</text>
  <text class="m" x="381" y="120">customGeoTypes: corner radius as a real geometry</text>
  <text class="m" x="381" y="148">Lives in app config + shape.meta. Stock tldraw</text>
  <text class="m" x="381" y="166">shows the defaults — the stock-compat diff makes</text>
  <text class="m" x="381" y="184">that floor visible and ranked.</text>
  <text class="m" x="381" y="210" font-weight="600">Inspector: only where paintReaches() is true.</text>
  <rect class="box" x="720" y="14" width="330" height="222" stroke="#7048c8" stroke-width="2"/>
  <text class="k" x="736" y="38" fill="#7048c8">3 · THEME</text>
  <text class="t" x="736" y="60">Palette + tokens</text>
  <text class="m" x="736" y="84">DefaultColorThemePalette: what “blue” resolves to,</text>
  <text class="m" x="736" y="102">light and dark, per role (solid, semi, pattern,</text>
  <text class="m" x="736" y="120">fill, highlight, note, frame)</text>
  <text class="m" x="736" y="148">App-global, not per shape. Custom names must also</text>
  <text class="m" x="736" y="166">be written into DEFAULT_THEME or the file parser</text>
  <text class="m" x="736" y="184">unregisters them on reopen.</text>
  <text class="m" x="736" y="210" font-weight="600">A Theme tab, not the inspector.</text>
</svg>
"""


def probe_section(p: dict) -> str:
    v = p.get("versions", {})
    rows = "".join(
        f"<tr><th>{esc(r['pair'])}</th><td>{esc(r['what'])}</td>"
        f"<td class='num'>{esc(str(r['changed_px']))}</td><td class='num'>{esc(str(r['pct']))}</td>"
        f"<td>{esc(str(r.get('bbox', '')))}</td>"
        f"<td class='{'ok' if str(r['changed_px']) == '0' else 'warn'}'>{esc(r.get('note', ''))}</td></tr>"
        for r in p.get("pixels", [])
    )
    deltas = p.get("style_deltas", {})
    delta_rows = "".join(
        f"<tr><th>{esc(mode)}</th><td>{esc(text) if text else '<span class=\"tag keep\">no differences from none</span>'}</td></tr>"
        for mode, text in deltas.items()
    )
    console = p.get("console", {})
    console_txt = ", ".join(f"{esc(k)}: {esc(str(c))}" for k, c in console.items()) or "not recorded"
    sh_ = p.get("shadcn", {})
    adds = sh_.get("added", {})
    add_rows = "".join(
        f"<tr><th>{esc(name)}</th><td>{esc(str(res))}</td></tr>" for name, res in adds.items()
    )
    kibo = p.get("kibo", {})
    shots = p.get("screenshots", [])
    shot_html = ""
    if shots:
        figs = "".join(
            img(s["file"], s["caption"]) for s in shots if (MEDIA_DIR / s["file"]).exists()
        )
        if figs:
            shot_html = f"<div class='gallery'>{figs}</div>"
    return f"""
<h3>Measured, not remembered: Tailwind v4 against a stock tldraw board</h3>
<p>The design-system report's Tailwind objection was about a <em>repo migration</em> and about
preflight bleeding into third-party widgets{cite(15, 10)}. A greenfield lab pays no migration, and
the layer-only import never loads preflight at all{cite(9, 11)}. What nobody had measured is whether
Tailwind v4 changes a single pixel of what tldraw paints. A scratch Vite project mounted
<code>tldraw@{esc(v.get('tldraw', '?'))}</code> with a seeded board (rectangle, ellipse, arrow, text,
note, draw, line, frame, highlight) in three CSS modes and screenshotted each headlessly at the same
camera, then diffed with PIL{cite(19)}.</p>
<div class='metrics'>
  <div class='metric'><strong>{esc(v.get('tailwindcss', '?'))}</strong><span>tailwindcss resolved</span></div>
  <div class='metric'><strong>{esc(v.get('shadcn', '?'))}</strong><span>shadcn CLI resolved</span></div>
  <div class='metric'><strong>{esc(v.get('base_ui', '?'))}</strong><span>@base-ui/react landed by shadcn init</span></div>
  <div class='metric'><strong>{esc(v.get('react', '?'))}</strong><span>react</span></div>
</div>
<table class='probe-t'><thead><tr><th>pair</th><th>capture</th><th>px changed</th><th>%</th><th>diff bbox</th><th>reading</th></tr></thead>
<tbody>{rows}</tbody></table>
<h3>Computed-style deltas inside tldraw's DOM</h3>
<table><tbody>{delta_rows}</tbody></table>
<p class='quiet'>Console errors per mode: {console_txt}.</p>
{shot_html}
<h3>Does shadcn on Base UI actually initialise today?</h3>
<p>Init command that worked: <code>{esc(sh_.get('init_command', '?'))}</code>. The
<code>components.json</code> it wrote:</p>
<pre><code>{esc(sh_.get('components_json', '?'))}</code></pre>
<p>Primitive package landed: <b>{esc(sh_.get('primitive_landed', '?'))}</b> · imports in
<code>src/components/ui/</code>: {esc(sh_.get('import_census', '?'))} · <code>tsc</code>:
<b>{esc(sh_.get('tsc', '?'))}</b> · <code>vite build</code>: <b>{esc(sh_.get('build', '?'))}</b>.</p>
<table><thead><tr><th>component</th><th>result</th></tr></thead><tbody>{add_rows}</tbody></table>
<h3>And Kibo UI beside it</h3>
<p>{esc(kibo.get('summary', 'not measured'))}</p>
"""


def build() -> str:
    m = measure()
    p = load_probe()

    stock_pickers = m["stock_pickers"]
    fields_total = m["fields_total"]

    # ---- reference criteria table ----
    criteria = [
        ("Same problem shape", 30, "a closed prop set on a canvas selection, mixed values, undo — not arbitrary CSS"),
        ("Legible grammar", 25, "section / row / field primitives you can infer and rebuild"),
        ("Stack proximity", 20, "React · Base UI · shadcn · Tailwind v4 — how much lifts as-is"),
        ("Panel is public code", 15, "the right panel must be readable source, not a screenshot of a hosted app"),
        ("Alive + licence", 10, "commits this quarter, MIT/Apache"),
    ]
    candidates = {
        "open-pencil": ([5, 5, 2, 5, 5], "grammar donor", "b1"),
        "Onlook (public repo)": ([2, 3, 4, 1, 4], "top-bar donor only", "ref"),
        "Excalidraw Stats": ([5, 3, 2, 5, 5], "whiteboard semantics", "b2"),
        "Penpot": ([4, 2, 1, 5, 4], "IA reference", "ref"),
        "Webstudio": ([2, 4, 3, 5, 4], "CSS-shaped", "ref"),
        "tldraw DefaultStylePanel": ([5, 2, 2, 5, 5], "the seam itself", "b2"),
        "The worktree prototype": ([5, 4, 3, 5, 5], "model donor", "keep"),
    }
    weights = [c[1] for c in criteria]
    crit_head = "".join(f"<th>{esc(c[0])}<small>{c[1]}%</small></th>" for c in criteria)
    crit_rows = ""
    scored = []
    for name, (scores, role, tag) in candidates.items():
        total = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
        scored.append((total, name))
    best = max(scored)[1]
    for name, (scores, role, tag) in candidates.items():
        total = sum(s * w for s, w in zip(scores, weights)) / sum(weights)
        cells = "".join(f"<td class='s'>{s}</td>" for s in scores)
        crit_rows += (
            f"<tr><th>{esc(name)}<small><span class='tag {tag}'>{esc(role)}</span></small></th>{cells}"
            f"<td class='num score {'win' if name == best else ''}'>{total:.1f}</td></tr>"
        )
    crit_note = "".join(f"<li><b>{esc(c[0])}</b> — {esc(c[2])}</li>" for c in criteria)

    # ---- stack table ----
    stack_rows = [
        ("Canvas", "tldraw " + m["tldraw"] + ", stock, pinned", "The record stays stock; the lab adds one component through <code>components.StylePanel</code>" + cite(13) + ". Configured utils exist only to open the paint seam (the same <code>getCustomDisplayValues</code> options the worktree already proved)" + cite(14) + ".", "keep"),
        ("UI framework", "React " + m["react"], "Both repos already sit here; open-pencil is Vue, which is why its code cannot lift and its grammar can.", "keep"),
        ("Headless primitives", "@base-ui/react " + m["baseui"], "Decided today already (“100%, no questions asked”)" + cite(15) + " and the shadcn default since July 2026" + cite(5) + ". It is also the only library shipping a scrubbable NumberField" + cite(7) + ". <code>radix-ui</code> stays transitively via tldraw; never mount one library's popup inside the other's modal layer without a spike.", "keep"),
        ("Styled layer", "shadcn/ui (Base UI track), generated into <code>src/components/ui/</code>", "You own the files. The inspector itself becomes a shadcn <em>registry</em> — the “our own shadcn block” you described — so SystemSketch installs it with <code>npx shadcn add &lt;url&gt;</code>" + cite(6) + ".", "keep"),
        ("Styling", "Tailwind v4, <b>theme + utilities layers only</b>, never preflight", "The cell you left blank. Preflight is what the design-system report feared; omitting its import is the documented path and emits no global rule" + cite(9, 11) + ". The pixel probe below measures what is left. Tokens: <code>@theme inline</code> maps shadcn's semantic names onto <code>--tl-*</code> in the lab and onto <code>--ss-*</code> in SystemSketch, so the panel follows the canvas theme for free.", "keep"),
        ("Ecosystem", "Kibo UI — reference gallery, not a dependency", "Radix-only today; eight of its components import Radix directly and it has no Base UI registry" + cite(8) + ". The one piece an inspector wants from it is the colour picker, and the probe settled that: it installs, pulls <code>radix-ui@1.6.7</code> in beside Base UI, and fails <code>tsc</code> on Base UI's <code>Select</code> signature. Take the <code>color</code> library it wraps, or <code>react-colorful</code>, directly.", "ref"),
        ("Forms / validation", "none in V1", "Each field commits on its own to the editor; tldraw validates the record on <code>updateShapes</code> and owns undo via history marks. <code>react-hook-form</code> + <code>zod</code> answer a question the inspector never asks. Adopt them the day a real form appears.", "no"),
        ("State", "tldraw's store via <code>useValue</code>", "The inspector model reads the editor and writes shapes; there is no second store to keep in sync. <code>zustand</code> is Langflow's answer to a problem tldraw already solved.", "no"),
        ("Build", "Vite", "Same as here.", "keep"),
        ("Testing", "vitest + CDP journeys (cdp_kit) + a PIL pixel gate", "The stock-pixel gate from the probe becomes the lab's first test; journeys read the record and the painted canvas, never the DOM alone.", "keep"),
    ]
    stack_html = "".join(
        f"<tr><th>{esc(layer)}</th><td>{what}</td><td>{why}</td><td><span class='tag {tag}'>{ {'keep': 'adopt', 'ref': 'reference', 'no': 'leave out'}[tag] }</span></td></tr>"
        for layer, what, why, tag in stack_rows
    )

    # ---- control mapping ----
    controls = [
        ("number (x, y, w, h, rotate, opacity, stroke px, font px, radius…)", "Base UI <code>NumberField</code> with <code>ScrubArea</code>, wrapped in shadcn <code>Input Group</code> so the glyph is the scrub handle and the unit is an addon", "The worktree's <code>ScrubNumber.tsx</code> already does this; keep its expression parser (no <code>eval</code>) and its “auto → scrub from the engine's value” rule" + cite(16, 7)),
        ("segments (fill style, dash, size rung, font, align, spline, route)", "shadcn <code>Toggle Group</code> (single, required)", "Base UI ToggleGroup underneath; render tldraw's own icons for dash/size so the rungs read the way the stock picker reads"),
        ("tiles (geometry ×20, arrowheads)", "shadcn <code>Toggle Group</code> in a grid, icon items with <code>Tooltip</code>", "Filter the geo enum to tldraw's 20 — <code>customGeoTypes</code> grows it globally" + cite(14)),
        ("swatches (13 named colours, label colour)", "hand-rolled 7×2 grid of <code>Toggle</code> buttons", "There is no shadcn swatch grid and it is 30 lines; painting the swatch from the live theme is the point"),
        ("colour (exact stroke / fill / ink)", "shadcn <code>Popover</code> + a picker library + hex <code>Input</code>", "Kibo's picker installs but imports <code>radix-ui</code> and mis-types Base UI's Select (measured in §3); wrap the <code>color</code> library it uses, or <code>react-colorful</code>, in the same Popover"),
        ("toggle (locked, flip, closed, halo, auto width)", "shadcn <code>Switch</code>", "—"),
        ("text (frame name, typeface)", "shadcn <code>Input</code> inside <code>Field</code>", "Typeface as a <code>Combobox</code> once the font list is real"),
        ("section", "shadcn <code>Collapsible</code> + a header row with the section's actions", "open-pencil's PanelSection: label, open, empty, actions slot" + cite(2)),
        ("row / pair", "shadcn <code>Field</code> (label + control + description) and a two-up grid", "open-pencil's PanelGrid / PanelFieldGroup; Figma's caption-over-two-fields rhythm"),
        ("mixed values", "the model's <code>sharedValueAcross</code> → control renders <code>Mixed</code>, no item checked", "Excalidraw's <code>value: number | 'Mixed'</code>" + cite(17)),
        ("dock", "shadcn <code>Sidebar</code> (right, non-collapsible) with <code>Scroll Area</code>", "Mounted through <code>components.StylePanel</code>, so it sits inside <code>.tl-container</code> and <code>--tl-*</code> resolves" + cite(13)),
    ]
    controls_html = "".join(
        f"<tr><th>{kind}</th><td>{comp}</td><td>{note}</td></tr>" for kind, comp, note in controls
    )

    # ---- traps ----
    traps = [
        ("<code>updateShapes</code> merges <code>meta</code>", "clear an override by writing <code>null</code>, never by omitting the key; every reader treats null as absent" + cite(14)),
        ("Base UI's Positioner owns the z-index", "a z-index on the Popup does nothing; <code>--radix-*</code> vars are never set — read <code>--available-height</code> on the positioner" + cite(16)),
        ("<code>--tl-*</code> exists only under <code>.tl-container</code>", "declare derived tokens where they resolve, or use <code>@theme inline</code> so the utility carries <code>var(--tl-…)</code> itself" + cite(16)),
        ("<code>stopPropagation</code> on a panel wrapper", "use <code>editor.markEventAsHandled</code>, exactly as <code>DefaultStylePanel</code> does on pointermove" + cite(13)),
        ("Shortcuts are off while a menu is open", "a popover that wants Ctrl+Z calls <code>editor.undo()</code> itself; a scrub surface must take focus" + cite(16)),
        ("The file parser resets the colour enum", "any colour the lab can store also goes into <code>DEFAULT_THEME</code>, or the board will not reopen" + cite(16)),
        ("A control that does nothing is a lie", "gate paint rows on <code>paintReaches(shape, editor)</code>; on a bare canvas they must not appear" + cite(14)),
        ("Fence writes to the shapes the panel showed", "never <code>…ForSelectedShapes</code> on blur; pass <code>shapeIds</code> — three judges found this class three times" + cite(14)),
    ]
    traps_html = "".join(f"<tr><th>{t}</th><td>{d}</td></tr>" for t, d in traps)

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>tldraw styling lab — the plan · SystemSketch</title>
<style>{CSS}</style></head><body><main>

<div class="hero">
  <div class="eyebrow">SystemSketch · tldraw_styling_lab · plan · 7 September 2026</div>
  <h1>Stock tldraw, one Figma-shaped inspector, standard parts.</h1>
  <p class="lead">You asked which of open-pencil and Onlook to copy, whether Base UI + shadcn + Kibo is
  the right chrome stack, and for a plan that walks shadcn and Kibo for prebuilt parts. The short
  answer is that <b>you are already about 60% built</b>: the branch
  <code>claude/tldraw-inspector-panel-cf524c</code> holds a React-free inspector model with
  {esc(fields_total)} field specs and a <code>?stock-inspector</code> route on a bare canvas. What was
  fragile is the hand-rolled view and its CSS — which is exactly the part shadcn replaces.</p>
  <div class="verdict"><b>Recommendation.</b>
    <ul>
      <li><b>Reference: open-pencil's grammar, not its code.</b> It is Vue + Reka UI + Tailwind v4{cite(2)}; Reka is Radix's Vue port, so its PanelSection / PanelGrid / PanelFieldGroup / NumberField map onto Base UI one for one. Onlook's public repo has no right styles panel at all — its styling lives in a 9,732-line top editor-bar, and the Styles tab in your screenshot is the hosted app, not code you can read{cite(3, 4)}.</li>
      <li><b>Stack: Base UI + shadcn (Base UI track) + Tailwind v4 layers-only.</b> Base UI is already your decision and shadcn's default{cite(5, 15)}; the layer-only import never loads preflight and emits no global rule{cite(9, 11)}; the probe below measures the pixels. Kibo is Radix-only today — a gallery, not a dependency{cite(8)}.</li>
      <li><b>Keep the model, rebuild the view.</b> Port <code>primitiveInspectorModel.ts</code>, <code>primitiveOverrides.ts</code> and their tests into the new repo; draw every row with shadcn parts; ship the whole thing as a shadcn <em>registry</em> so SystemSketch installs it with one command{cite(6)}.</li>
      <li><b>Location: a new repo at <code>/home/bam/tldraw_styling_lab</code></b>, whose <code>package.json</code> is the proof of “stock tldraw + one thing”. Default if you say nothing.</li>
    </ul>
  </div>
  <div class="quiet">What this page does not do: scaffold the lab, touch the worktree, install anything into
  SystemSketch, or rewrite the design-system report. Every number below is measured at build time
  from this tree and from <code>docs/tldraw-styling-lab-probe-2026-09-07.json</code>; every claim about
  a third party carries a source.</div>
</div>

<section>
  <h2>1 · What you asked, and what the tree already holds</h2>
  <p>Your note frames a fresh start: “forget about any design language, we just want a really nice
  set of primitives … a new app called tldraw_styling_lab”. The earlier realisation on the same page
  is the one that matters — “I'm building them off screenshots … completely missing that underlying
  level of structure … instead of starting with screenshots I want to start with open source code”{cite(1)}.
  That diagnosis is right, and it is narrower than “start over”. Measured from the branch:</p>
  <div class="metrics">
    <div class="metric"><strong>{esc(fields_total)}</strong><span>FieldSpecs in the model: {esc(m['fields_inline'])} inline · {esc(m['fields_paint'])} paint · {esc(m['fields_style'])} style · {esc(m['fields_prop'])} prop</span></div>
    <div class="metric"><strong>{esc(stock_pickers)}</strong><span>StyleProps tldraw's own picker exposes ({esc(m['stock_picker_names'])})</span></div>
    <div class="metric"><strong>{esc(m['lines_model'])}</strong><span>lines of React-free model (<code>primitiveInspectorModel.ts</code>) + {esc(m['lines_overrides'])} in the override contract</span></div>
    <div class="metric"><strong>{esc(m['lines_view'])} + {esc(m['lines_css'])}</strong><span>lines of hand-rolled view + CSS — the part that gets replaced</span></div>
  </div>
  <p>The model imports nothing from React or the DOM; its only SystemSketch-specific imports are
  {esc(m['model_ss_imports'])} (the shared-value helper and the slanted-arrow routing, both trivially
  replaced). <code>ScrubNumber.tsx</code> ({esc(m['lines_scrub'])} lines) is already on Base UI's
  NumberField. {esc(m['lines_tests'])} lines of unit tests travel with the model. The branch is
  {esc(m['wt_ahead'])} commits ahead of <code>main</code> at <code>{esc(m['wt_head'])}</code>
  ({esc(m['wt_stat'])}), merged: {esc(m['wt_merged'])}{cite(14)}.</p>
  <div class="gallery">
    {img('prototype-inspector-crop.png', '<b>What exists.</b> The worktree inspector on a stock rectangle: 30 rows where tldraw shows five. Every row is a FieldSpec; the CSS around it is what was hand-rolled.', True)}
    {img('tldraw-default-style-panel.png', '<b>What tldraw ships.</b> The stock style panel — the “small customization menu” you want to replace. Its restriction is in the picker, not the renderer.')}
    {img('figma-rectangle-inspector.png', '<b>The target idiom.</b> Figma on a rectangle: Position / Layout / Appearance / Fill / Stroke / Effects / Export. Most of these sections do not exist in tldraw; the rhythm does.', True)}
  </div>
  <p>So the reframe: the census, the paint seam, the meta contract and the tests are the structure you
  said was missing — they came from reading tldraw's source, not screenshots. Throw away the view.
  Keep the model. The lab is where the view gets rebuilt on parts you did not write.</p>
</section>

<section>
  <h2>2 · Criteria, then the reference decision</h2>
  <p>What good looks like for a “reference we can copy exactly”, weighted for this job:</p>
  <ul>{crit_note}</ul>
  <table class="crit"><thead><tr><th>candidate</th>{crit_head}<th>score</th></tr></thead><tbody>{crit_rows}</tbody></table>
  <div class="cols">
    <div class="box free"><h4>open-pencil — copy its grammar</h4><ul>
      <li>Twelve sections in one orchestrator (<code>DesignPanel.vue</code>) that shows sections by selected node type — the same shape as the model's <code>applies()</code>{cite(2)}.</li>
      <li>Reusable primitives with clean props: <code>PanelSection {{label, open, defaultOpen, empty, actions}}</code>, <code>PanelGrid {{columns 1–3, distribution equal|wide-first}}</code>, <code>PanelFieldGroup</code>, and <code>PropertyListRoot</code> exposing <code>isMixed</code> for fills/strokes/effects lists.</li>
      <li><code>NumberField</code> with a <code>sensitivity</code> drag — Base UI's ScrubArea gives you the same with pointer lock.</li>
      <li>Tokens in a Tailwind v4 <code>@theme</code> block plus <code>tailwind-variants</code> — literally your target styling layer, minus the Vue.</li>
      <li>Alive today (last commit 2026-09-07), MIT, 8.2k stars.</li>
    </ul></div>
    <div class="box warn"><h4>Onlook — a different problem, and the panel is not public</h4><ul>
      <li>It styles arbitrary DOM with the whole CSS surface (padding, margin, display, typography). tldraw has a closed prop set — none of its schema logic transfers.</li>
      <li>The public repo's right panel holds only the chat tab; the styling UI is the top <code>editor-bar</code> (48 files). Git history finds no move to the side{cite(3)}. Your screenshot's <em>Styles</em> tab is the hosted product{cite(4)}.</li>
      <li>Both of its hard inputs are hand-rolled: a 169-line range scrub and a 795-line colour picker — the opposite of what you want.</li>
      <li>Useful later, for one thing: the contextual top bar. SystemSketch already has a Figma-toolbar spike; Onlook's editor-bar is the right donor when that returns.</li>
    </ul></div>
  </div>
  <div class="gallery">
    {img('open-pencil-panel-crop.png', '<b>open-pencil</b>, from its own README screenshot: Instance / Position / Layout / Auto layout / Alignment / Appearance. Light theme, 2-up fields, glyph-in-field. This is the rhythm to rebuild in shadcn.', True)}
    {img('open-pencil-panel-zach-paste.png', '<b>Your paste of the same panel</b> — kept for the record.', True)}
    {img('penpot-design-panel.png', '<b>Penpot</b> — same IA, ClojureScript, AGPL: read it, never lift it.', True)}
    {img('onlook-right-panel-hosted.png', '<b>Onlook hosted app</b> — the Chat | Styles tabs you saw. Not in the public repository.', True)}
    {img('dify-node-settings.jpg', '<b>Dify</b>, your counter-example: a node editor\'s settings panel is a form, not an inspector. You were right to exclude the node editors.')}
  </div>
  <p>Excalidraw's Stats panel scores nearly as high as open-pencil and is the one reference that
  shares tldraw's problem exactly — a React whiteboard, a closed prop set, mixed values across a
  selection, drag on the label{cite(17)}. Read both: open-pencil for how the panel is organised,
  Excalidraw for what a whiteboard field must mean.</p>
</section>

<section>
  <h2>3 · The stack, cell by cell</h2>
  <p>Your table with the blank filled and two rows removed:</p>
  <table><thead><tr><th>layer</th><th>what</th><th>why, and what it rests on</th><th></th></tr></thead><tbody>{stack_html}</tbody></table>
  <h3>Why the earlier “no Tailwind” ruling does not bind the lab</h3>
  <p>The design-system report ruled out Tailwind <em>as a repo migration</em> — rewriting an
  already token-driven codebase, rules it can never reach because tldraw renders that DOM, and
  preflight's leak bugs{cite(15)}. Re-read today, all three cited issues concern builds that include
  <code>preflight.css</code>; none applies when it is never imported{cite(10)}. The lab is greenfield,
  and the SystemSketch side is additive: theme + utilities layers and an <code>@theme inline</code>
  bridge, no rewrite of a single existing stylesheet. The <code>--ss-*</code> vocabulary
  ({esc(m['ss_tokens'])} names) stays the semantic layer; Tailwind becomes the authoring layer for
  <em>new</em> chrome only. That is a scoped reversal, and it should get a PEP at merge time, not now.</p>
  <p>One fact that makes the bridge safe: tldraw namespaces everything. <code>tldraw.css</code> at the
  pinned version declares {esc(m['tl_vars'])} custom properties, all <code>--tl-*</code>; the only
  other names in the file are {esc(m['non_tl_vars'])}{cite(12)}. shadcn's <code>--background</code>,
  <code>--primary</code>, <code>--radius</code> and Tailwind's <code>--color-*</code> cannot collide
  with it. Write the bridge as <code>@theme inline</code> so each utility carries
  <code>var(--tl-color-panel)</code> itself and resolves on the element inside
  <code>.tl-container</code> — declaring the alias on <code>:root</code> would be guaranteed-invalid
  there, the trap the token layer already documents{cite(16)}.</p>
  {probe_section(p)}
</section>

<section>
  <h2>4 · Architecture: what the lab is, and how it comes back</h2>
  {architecture_svg()}
  <p>Three rules hold it together, each with a test behind it:</p>
  <ul>
    <li><b>The record stays stock.</b> The lab's <code>package.json</code> pins <code>tldraw@{esc(m['tldraw'])}</code>; a stock-boundary test asserts the only tldraw seams used are <code>components.StylePanel</code>, <code>ShapeUtil.configure</code> (display values, customGeoTypes) and <code>themes</code>. Everything else is a bug.</li>
    <li><b>The model decides, the view draws.</b> <code>FieldSpec {{ applies, read, write }}</code> is the contract; a row with no field is not rendered, and a field on a bare canvas whose paint seam is not installed is withheld (<code>paintReaches</code>). The same predicate serves both routes, so the two apps can never grow two field lists.</li>
    <li><b>One source, consumed by copy, with a drift alarm.</b> shadcn's model is that you own the files, so SystemSketch installs the registry item and then owns its copy; a sync test hashes the copy against the registry so a silent fork fails <code>npm run check</code> — the same shape as <code>stage_app.mjs</code> stamping which release it staged.</li>
  </ul>
  <h3>Three styling layers, and which one “expose everything” means</h3>
  {layers_svg()}
  <p>“Expose all the stylings tldraw's canvas supports” is three different jobs, and conflating them
  is what makes a panel lie. Layer 1 is schema: {esc(fields_total)} fields already, all portable.
  Layer 2 is the renderer: 73 display values, 42 reached, 31 not — the frame set needs
  <code>FrameShapeUtil.configure({{ showColors }})</code>, geo's label margins and
  <code>patternFillFallbackColor</code> are plain to add, and <code>url</code>, <code>altText</code>,
  <code>crop</code>, <code>growY</code>, <code>isPen</code>, <code>scaleX/Y</code> are ordinary props
  nobody wired{cite(14)}. Layer 3 is the theme, which is a document/app setting, not a shape's — it
  gets its own tab. The stock-compatibility button you asked for (export → bare tldraw → pixel
  diff, ranked) is the instrument that keeps layer 2 honest, and it is still unbuilt{cite(14)}.</p>
</section>

<section>
  <h2>5 · Prebuilt parts, control by control</h2>
  <p>The walk through shadcn and Kibo you asked for, mapped onto the model's seven control kinds plus
  the three structural pieces. Every shadcn component named exists on the Base UI track today; the
  probe's <code>add</code> results in §3 say which ones actually landed.</p>
  <table><thead><tr><th>control kind (model)</th><th>prebuilt part</th><th>note</th></tr></thead><tbody>{controls_html}</tbody></table>
  <p>Two things stay hand-rolled on purpose: the swatch grid (thirty lines, and painting it from the
  live theme is the feature) and the numeric expression parser (already written and tested; a board
  is a document other people send you, so never <code>eval</code>). Everything else — the scrub, the
  popover, the select, the toggle group, the sidebar, the collapsible — comes from a package.</p>
</section>

<section>
  <h2>6 · Milestones, each with the proof that closes it</h2>
  <div class="step"><h3><span class="tag b1">M1</span> Scaffold, and prove “stock + nothing”</h3>
    <p><code>npm create vite</code> → React 19 + <code>tldraw@{esc(m['tldraw'])}</code> + Tailwind v4 layers-only + <code>npx shadcn init</code> (Base UI track). Seed the probe's nine-shape board. Copy the probe's screenshot-and-diff script in as <code>tests/stock_pixels.mjs</code> using this repo's <code>cdp_kit.mjs</code> pattern — the probe's sources are preserved under <code>docs/assets/tldraw-styling-lab-probe/</code>. Alias <code>@/*</code> with <code>paths</code> and no <code>baseUrl</code>: TypeScript 6 flags <code>baseUrl</code> as deprecated (TS5101) and the alias shadcn's docs show breaks <code>tsc -b</code>.</p>
    <div class="gate"><b>Gate:</b> the stock-pixel test passes at zero changed pixels between “no Tailwind” and “layers-only”, and is mutation-tested red by importing preflight.</div></div>
  <div class="step"><h3><span class="tag b1">M2</span> The panel on the seam, with the ported model</h3>
    <p>Mount through <code>components={{{{ StylePanel: Inspector }}}}</code>. Port <code>primitiveInspectorModel.ts</code>, <code>primitiveOverrides.ts</code>, <code>ScrubNumber.tsx</code> and the three test files; delete the slanted-arrow field and inline the shared-value helper. Rebuild every row with the §5 parts. Sections come from the model's <code>group</code>, in Figma's order: Layer · Shape · Fill · Stroke · Label · Arrow · Note · Highlight · Frame.</p>
    <div class="gate"><b>Gate:</b> the worktree's journey (<code>primitive_inspector_smoke.mjs</code>, 13 checks) ported and green against the new view, every assertion read from the record or the painted canvas; <code>tsc</code> green; the bare-canvas route withholds every paint row.</div></div>
  <div class="step"><h3><span class="tag b1">M3</span> Expose the rest of layer 2, and add the Theme tab</h3>
    <p>Reach the 31 unreached display values or record per value why not (frame via <code>showColors</code>; geo label margins; pattern fallback; the seven ordinary props). Add a Theme tab editing <code>DefaultColorThemePalette</code> per named colour, light and dark, writing custom names into <code>DEFAULT_THEME</code> as well.</p>
    <div class="gate"><b>Gate:</b> a census test asserts reached + documented-unreached = 73 against the pinned schema, so a tldraw bump fails it first; a theme round-trip test reopens a board painted in a custom colour through <code>parseTldrawJsonFile</code>.</div></div>
  <div class="step"><h3><span class="tag b1">M4</span> The stock-compatibility button</h3>
    <p>Your outstanding request, unchanged: export the board to <code>.tldr</code>, mount it in a hidden bare <code>&lt;Tldraw&gt;</code>, <code>toImage</code> both sides with explicit bounds, diff on a canvas, rank by divergence, whole board first, unpaired shapes reported, a rejected parse as row one.</p>
    <div class="gate"><b>Gate:</b> the floor is non-zero by construction (every layer-2 override is invisible to stock) and the report shows it ranked; a board with only layer-1 edits diffs at zero.</div></div>
  <div class="step"><h3><span class="tag b1">M5</span> Registry out, SystemSketch in</h3>
    <p><code>registry.json</code> with <code>registry:ui</code> (the view), <code>registry:lib</code> (the model + overrides), <code>registry:file</code> (tests) and <code>css</code>/<code>cssVars</code> for the bridge; <code>shadcn build</code>; serve <code>public/r/</code> from the lab's dev server. In SystemSketch: layers-only Tailwind + the <code>@theme inline</code> bridge onto <code>--ss-*</code>, <code>npx shadcn add</code>, swap the right dock's <code>shape</code> lens, extend <code>tests/test_stock_boundary.py</code> by one seam, add the hash-sync test. Write the PEP then.</p>
    <div class="gate"><b>Gate:</b> the same journey green inside SystemSketch; <code>npm run check</code> green; the retained review board shows the panel on a real Block scene.</div></div>
  <p>M1 and M2 are one builder-day each and are the tracer bullet; M3–M5 are independent of each other
  after M2 and can run as three lanes. Nothing here needs hardware, a licence or a human in the loop
  before M5's review.</p>
</section>

<section>
  <h2>7 · Traps this repo already paid for</h2>
  <table><tbody>{traps_html}</tbody></table>
</section>

<section>
  <h2>8 · What needs you</h2>
  <div class="q"><h4>Q1 · Where does the lab live?</h4>
    <p><b>Recommend</b> a new repo, <code>/home/bam/tldraw_styling_lab</code>. Its manifest is the proof of “stock + one thing”, it keeps Tailwind out of SystemSketch until the bridge is measured, and it does not share a git index with thirteen peer sessions. The alternative is <code>labs/</code> inside this repo with npm workspaces — cheaper to share <code>node_modules</code>, but it converts this repo into a workspace root and every peer inherits that change.</p>
    <p class="dflt">Default if you say nothing: new repo.</p></div>
  <div class="q"><h4>Q2 · How does the panel come back into SystemSketch?</h4>
    <p><b>Recommend</b> the shadcn registry (copy-and-own, with a hash-sync test). The alternative is a git-URL npm dependency with peer deps — one source, no copy, but the panel's Tailwind classes then need SystemSketch's build to scan <code>node_modules</code> via <code>@source</code>, and shadcn's own idiom is copy.</p>
    <p class="dflt">Default: registry.</p></div>
  <div class="q"><h4>Q3 · Tailwind in SystemSketch at all?</h4>
    <p><b>Recommend</b> yes, layers-only, additive, bridged onto <code>--ss-*</code>, decided by the probe's pixel number and recorded as a PEP that scopes the earlier ruling rather than reversing it. The alternative keeps SystemSketch Tailwind-free and has the lab compile the panel's CSS to a plain stylesheet — workable, but it forks the styling of the very component you want shared.</p>
    <p class="dflt">Default: yes, at M5, never before the pixel gate is green here too.</p></div>
  <div class="q"><h4>Q4 · Kibo UI?</h4>
    <p><b>Recommend</b> treat it as a gallery until it ships a Base UI track. The probe settled the composability question: its colour picker installs via <code>shadcn add</code>, drags <code>radix-ui</code> into a Base UI project, and produces one real type error against Base UI's Select. Use the picker library underneath it directly.</p>
    <p class="dflt">Default: not a dependency.</p></div>
  <div class="q"><h4>Q5 · The worktree <code>claude/tldraw-inspector-panel-cf524c</code>?</h4>
    <p><b>Recommend</b> keep it as the donor, do not merge it; delete it once M2 lands the ported model and tests in the lab. Its §2 fixes are done; its §3 (the button) becomes M4; its §6 hero/report/review items are moot.</p>
    <p class="dflt">Default: keep until M2, then sweep.</p></div>
  <div class="q"><h4>Q6 · Scope of V1?</h4>
    <p><b>Recommend</b> V1 = M1 + M2 (inspector on layer 1 + the paint rows the configured utils reach). Theme tab, the census to 73, and the button are M3/M4.</p>
    <p class="dflt">Default: V1 = M1 + M2.</p></div>
</section>

<section>
  <h2>9 · Deliberately not done</h2>
  <ul>
    <li><b>Not scaffolded.</b> The ask was a plan and a judgement; the scaffold is M1 and one builder-day. The exact opening move is at the end of this page.</li>
    <li><b>Not merged, not moved.</b> The worktree stays where it is; nothing was installed into this repo; the design-system report was not edited — a scoped reversal gets a superseding PEP at merge, per <code>docs/peps/README.md</code>.</li>
    <li><b>Not a second canvas.</b> No shape types beyond the corner-radius geo; no re-implemented drag, resize or z-order; the lab's only tldraw seams are the three named in §4.</li>
    <li><b>Onlook's editor-bar not mined.</b> It is the right donor for a contextual top bar, which is a different feature with its own spike already in this repo.</li>
  </ul>
  <h3>The opening move</h3>
  <pre><code>mkdir -p /home/bam/tldraw_styling_lab &amp;&amp; cd /home/bam/tldraw_styling_lab &amp;&amp; git init &amp;&amp; npm create vite@latest . -- --template react-ts</code></pre>
  <p>then <code>{esc(p.get('shadcn', {}).get('init_command', 'npx shadcn@latest init'))}</code> — the command the probe proved — and copy <code>tests/stock_pixels.mjs</code> from the probe as the first test.</p>
</section>

<section>
  <h2>Source index</h2>
  {source_index()}
</section>

<footer>
  <span>Built by <code>docs/build_tldraw_styling_lab_plan.py</code> at <code>{esc(m['main_head'])}</code>; branch measurements from <code>claude/tldraw-inspector-panel-cf524c</code> at <code>{esc(m['wt_head'])}</code> via <code>git show</code>; probe numbers from <code>docs/tldraw-styling-lab-probe-2026-09-07.json</code>.</span>
  <span>Reference stills live in ignored <code>reports/media/tldraw-styling-lab-plan/</code>, served by the retained review runtime.</span>
</footer>
</main></body></html>
"""
    return page


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
