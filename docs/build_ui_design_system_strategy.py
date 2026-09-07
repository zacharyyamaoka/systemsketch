#!/usr/bin/env python3
"""Build reports/ui-design-system-strategy-2026-09-07.html — the decision doc on
adopting a real UI design system for SystemSketch's non-canvas chrome.

Zach's ask (2026-09-07): "we are dealing with dark to light mode bugs and this
type of stuff — that just means we're operating at way too low a level. I don't
want to reinvent the wheel at all here." Candidates he named: Base UI, Tailwind
CSS, shadcn/ui, Material Design 3, plus two reference apps — Foxglove (the
Lichtblick fork) and rerun.io.

Research: six parallel Sonnet legs (web, primary sources) + local evidence from
the live tree, orchestrated by a Fable scribe session. Numbers in the
current-state section are measured at build time from /home/bam/systemsketch so
the report cannot drift from the tree it describes; research-leg numbers are
dated 2026-09-07 and cited to their sources.

Output is text + inline SVG only (zero data URIs), so it lands in the tracked
half of reports/ per skills/review-hub.
"""

from __future__ import annotations

import html
import json
import re
import shlex
import shutil
import subprocess
from pathlib import Path

REPO = Path("/home/bam/systemsketch")
OUT = REPO / "reports" / "ui-design-system-strategy-2026-09-07.html"
PROBE = REPO / "docs" / "dismiss_propagation_probe.html"


# --------------------------------------------------------------------------
# Build-time measurements (fail soft: a missing file yields "?" not a crash)
# --------------------------------------------------------------------------

def sh(cmd: str) -> str:
    try:
        return subprocess.run(
            ["bash", "-c", cmd], capture_output=True, text=True, cwd=REPO, timeout=60
        ).stdout.strip()
    except Exception:
        return ""


def n(value: str) -> str:
    """Thousands-separate a measured count so prose and metric tiles agree."""
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return value or "?"


# WHY the selector SUBJECT and not a bare grep: CSS styles its subject. A rule like
# `.tl-container .ss-panel {…}` merely *scopes* an app-owned element and a utility
# class could replace it; `.tlui-rich-text__toolbar .tlui-button {…}` styles markup
# tldraw renders and nothing app-side can ever reach. Counting every selector that
# merely mentions `.tl-` conflates the two (80 rules vs 62 on 2026-09-07). The rule
# below is exact and auditable: strip comments, take each comma-separated selector's
# rightmost compound (paren-aware), count the block if any subject carries a
# tldraw-owned token.
TLDRAW_SUBJECT_COUNTER = r"""
import re, pathlib, json
TLD = re.compile(r"\.tl-|\.tlui-|\[data-tl")
def subject(sel):
    depth = 0; out = []
    for ch in reversed(sel.strip()):
        if ch in ")]": depth += 1
        elif ch in "([": depth -= 1
        if depth == 0 and ch in " \t\n>+~": break
        out.append(ch)
    return "".join(reversed(out))
rules = 0; loose = 0; files = set()
for p in sorted(pathlib.Path("src").rglob("*.css")):
    src = re.sub(r"/\*.*?\*/", "", p.read_text(), flags=re.S)
    for m in re.finditer(r"([^{}();]*)\{", src):
        sel = m.group(1).strip()
        if not sel or sel.startswith("@"): continue
        if TLD.search(sel): loose += 1
        if any(TLD.search(subject(s)) for s in re.split(r",(?![^(]*\))", sel)):
            rules += 1; files.add(str(p))
print(json.dumps({"rules": rules, "files": len(files), "loose": loose}))
"""


def measure() -> dict[str, str]:
    m: dict[str, str] = {}
    m["css_files"] = sh("find src -name '*.css' | wc -l") or "?"
    m["css_lines"] = sh("find src -name '*.css' -exec cat {} + | wc -l") or "?"
    m["tsx_files"] = sh("find src -name '*.tsx' | wc -l") or "?"
    m["src_lines"] = sh(
        "find src \\( -name '*.ts' -o -name '*.tsx' \\) -exec cat {} + | wc -l"
    ) or "?"
    m["ss_decls"] = sh(r"grep -c '^\s*--ss-' src/theme/tokens.css") or "?"
    m["tokens_lines"] = sh("wc -l < src/theme/tokens.css") or "?"
    m["ss_consumers"] = sh(
        "grep -rln 'var(--ss-' src --include='*.css' --include='*.tsx' --include='*.ts' | wc -l"
    ) or "?"
    # WHY import-anchored: DraftModeBar.tsx mentions @radix-ui/react-dropdown-menu in a
    # comment explaining why it deliberately does NOT use it; a bare grep counts it and
    # yields 7 where the true importer count is 6.
    m["radix_files"] = sh(
        "grep -rlE \"^import .*(from 'radix-ui'|@radix-ui/react)\" src --include='*.tsx' --include='*.ts' | wc -l"
    ) or "?"
    m["radix_version"] = sh(
        "grep -o '\"radix-ui\": \"[^\"]*\"' package.json | head -1"
    ) or '"radix-ui": "?"'
    m["theme_tests"] = sh("grep -c 'def test' tests/test_theme_tokens.py") or "?"

    # --- Tailwind-migration surface, now measured rather than quoted ------------
    # METHODOLOGY (className): literal `className=` occurrences in .tsx under src/.
    # Deliberately narrower than bare `className`, which also catches `className:`
    # in props objects and prop-forwarding spreads (1,519 / 109 files on
    # 2026-09-07). `className=` is exactly the set of JSX attribute sites a
    # Tailwind migration would have to rewrite, which is the quantity argued from.
    m["classname_sites"] = sh("grep -ro 'className=' src --include='*.tsx' | wc -l") or "?"
    m["classname_files"] = sh("grep -rl 'className=' src --include='*.tsx' | wc -l") or "?"

    counts = sh(f"python3 -c {shlex.quote(TLDRAW_SUBJECT_COUNTER)}")
    try:
        parsed = json.loads(counts)
        m["tldraw_rules"] = str(parsed["rules"])
        m["tldraw_rule_files"] = str(parsed["files"])
        m["tldraw_rules_loose"] = str(parsed["loose"])
    except Exception:
        m["tldraw_rules"] = m["tldraw_rule_files"] = m["tldraw_rules_loose"] = "?"

    # METHODOLOGY (panel guards): the census grep docs/bugs/0002 names for its own
    # boundary — a React pointerdown handler that stops propagation — run against
    # THIS checkout. The record's headline 60/29 is the count on
    # `claude/container-primitive-rebuild`, which carries src/uiEditor/; main does
    # not, and returns a smaller number. Measuring it here is what keeps the scope
    # label honest instead of inheriting the branch's figure under a "main" heading.
    guard = "grep -rn 'onPointerDown=.*stopPropagation' --include=*.tsx src/"
    m["guard_sites"] = sh(f"{guard} | wc -l") or "?"
    m["guard_files"] = sh(f"{guard.replace('-rn', '-rln')} | wc -l") or "?"
    return m


# --------------------------------------------------------------------------
# The dismissal probe. The first draft of this report asserted Base UI's
# starvation-immunity from a reading of useDismiss and got the mechanism wrong.
# So the claim is now *executed* at build time: docs/dismiss_propagation_probe.html
# models both architectures against seven guard shapes and is run in headless
# Chrome, and the matrix below is whatever that run returned. A claim about event
# propagation that no browser ever evaluated is exactly the class of error this
# rebuild exists to remove.
# --------------------------------------------------------------------------

PROBE_ROW = re.compile(
    r"^([A-G]\..+?)\s+radix_bubble=(\w+)\s+baseui_capture=(\w+)\s+baseui_decision=(\w+)$"
)


def run_probe() -> tuple[list[tuple[str, bool, bool]], str]:
    """Return [(scenario, radix_fired, baseui_fired)], plus a provenance line."""
    chrome = shutil.which("google-chrome") or shutil.which("google-chrome-stable")
    if not chrome or not PROBE.exists():
        return [], "not re-run at build time (no browser on this host)"
    try:
        dom = subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--virtual-time-budget=4000", "--dump-dom", PROBE.as_uri()],
            capture_output=True, text=True, timeout=120,
        ).stdout
    except Exception:
        return [], "probe run failed on this host"
    block = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not block:
        return [], "probe produced no result block"
    rows = []
    for line in html.unescape(block.group(1)).strip().splitlines():
        match = PROBE_ROW.match(line.strip())
        if match:
            rows.append((match.group(1).strip(), match.group(2) == "true",
                         match.group(4) == "true"))
    return rows, f"re-run at build time in {Path(chrome).name} (headless)"


# --------------------------------------------------------------------------
# Research-leg content. Citations use [[n]] and are post-processed into
# superscript links against the source index.
# --------------------------------------------------------------------------

VERDICT = """
  <div class="verdict"><b>Recommendation, in one breath:</b> the two axes get two different
  answers. <b>Axis 1 — converge app-authored chrome on Base UI</b>, component-by-component as
  files are touched, never big-bang: it covers every primitive the app uses <i>plus</i> the
  NumberField Radix lacks, and — measured in a browser, not inferred — its outside-press
  dismissal survives the exact guard shape that starves Radix's in
  <code>docs/bugs/0002</code>[[10,33,39]]. <b>Axis 2 — adopt nothing.</b> The
  <code>--ss-*</code> token layer already is the design system; the dark/light bugs were
  palette-derivation math inside it, and none of the four candidates sells that fix without a
  look that fights the canvas[[36,37]]. The reversible default if you do nothing: both
  libraries stay exactly where they are, <b>new</b> chrome work reaches for Base UI first,
  and nothing migrates until its file is being edited anyway.</div>
  <div class="quiet"><b>Correction, 2026-09-07 (second pass).</b> The first version of this
  page claimed Base UI registers its press listeners "capture-phase, unconditionally" and is
  therefore <i>structurally immune</i> to the <code>docs/bugs/0002</code> class. An
  adversarial review pushed back, and re-deriving it from the installed
  <code>@base-ui/react@1.8.0</code> source plus a browser probe showed the wording was wrong
  twice over: the listener group is gated on <code>outsidePress !== false</code> (a default,
  not an invariant), and the capture listener does not decide anything — it re-arms the
  decision on the event's own <b>target</b>. The conclusion survives and the mechanism is
  better than advertised, but the immunity is <b>conditional, not structural</b>, and three
  guard shapes still defeat it. The corrected argument, with the measurement, is in the Base
  UI section. Four further numbers were wrong and are fixed; they are called out where they
  appear.</div>
  <div class="quiet">Two things this doc does <b>not</b> do: touch product code (research
  only, per the brief), and re-litigate the 2026-09-07 six-domain library audit — it extends
  that audit's method (adopt where a genuine gap exists: elkjs, dnd-kit, colorjs.io) to the
  chrome layer.</div>
"""

BASE_RADIX = """
<div class="cand">
  <h3>Base UI vs Radix — the real decision <span class="tag b2">axis 1</span> <span class="tag keep">converge on Base UI, gradually</span></h3>
  <div class="what">@base-ui/react 1.8.0 · MIT · MUI's team incl. Radix co-creator Colm Tuite and Floating UI's authors[[1,5]] &nbsp;·&nbsp; radix-ui 1.6.7 · MIT · WorkOS[[8]]</div>
  <p><b>Both are headless behavior kits — the thing you were worried about hand-rolling is
  the thing the app already buys.</b> The question is only which of the two to standardize
  on, and the evidence now points one way:</p>
  <ul>
    <li><b>Coverage is no longer the blocker.</b> Base UI 1.8.0 ships every primitive this
      app uses — Popover, Dialog, <b>Context Menu</b> (verified live; blog posts claiming it's
      missing are stale), Tabs, Slider, Toolbar, Menu, Toast — plus Number Field (the
      drag-scrub already adopted in the inspector worktree), Combobox, Autocomplete, Select,
      Scroll Area[[4,5]]. <b>There is no reverse gap</b> — an earlier draft named Hover Card
      as the one thing Radix has and Base UI lacks, which was an artifact of searching by
      Radix's name: Base UI ships it as <b>Preview Card</b>, and the installed 1.8.0 tree
      carries <code>preview-card/</code> with docs describing the identical component[[4]].</li>
    <li><b>The dismissal architecture is the load-bearing difference — but the honest
      version is narrower than this page first claimed.</b> Radix's
      <code>DismissableLayer</code> decides outside-press on a <b>bubble-phase</b> document
      <code>pointerdown</code>, the listener <code>docs/bugs/0002</code> proves this app
      starves at <b>__guard_sites__ call sites across __guard_files__ files on main</b>
      (the record's headline 60/29 is its count on
      <code>claude/container-primitive-rebuild</code>, which carries
      <code>src/uiEditor/</code>)[[9,33]]. Base UI's vendored <code>useDismiss</code>
      registers its press listeners in <b>capture phase</b> — <i>gated on
      <code>outsidePress !== false</code></i>, which is the default and which
      <code>PopoverRoot</code>, <code>MenuRoot</code> and <code>useDialogRoot</code> all
      leave enabled[[10]]. The mechanism that matters, though, is not the phase: the capture
      handler decides nothing, it re-arms the decision as a one-shot listener on the event's
      own <b>target</b> (<code>addTargetEventListenerOnce</code>) — <i>below</i> every
      intervening guard, so no ancestor's <code>stopPropagation</code> can reach it[[10]].
      <b>That immunity is conditional, not structural</b>, and the measured limits are in the
      table below.</li>
    <li><b>Radix is not dying — but the momentum is real and one-directional.</b> Radix
      still releases (<code>1.6.7</code> on 2026-07-24 with a controlled ContextMenu, and
      <code>1.7.0-rc</code> prereleases through 2026-07-31)[[7,8]]; the abandonment
      narrative traces to one speculative blog post[[38]]. But Base UI has MUI's staffed
      team, monthly releases, a repo pushed the day this was researched[[2,6]] — and the
      ecosystem is voting: shadcn/ui made Base UI its <b>default</b> primitive layer in July
      2026 (new projects pick it ~2:1)[[14]], and MUI names Base UI its "long-term
      direction"[[22]]. tldraw has its own issue open on this (tldraw/tldraw#7584,
      "Investigate migrating from Radix UI to Base UI") — but read it for what it is: an
      <b>investigation opened 2026-01-04 and still open eight months later, with four
      comments and no linked branch, PR or implementation</b>. It is evidence that tldraw
      considers the question live, not evidence that the engine is moving[[12]].</li>
    <li><b>The migration is bounded but not a rename.</b> Core state props survive
      (<code>open</code>/<code>onOpenChange</code>); what changes is composition:
      <code>asChild</code> → <code>render</code> prop at every call site, a mandatory
      <code>Positioner</code> layer on popup-family components,
      <code>Overlay</code>→<code>Backdrop</code>, <code>Content</code>→<code>Popup</code>,
      Tabs <code>Trigger</code>→<code>Tab</code>[[13]]. <b>__radix_files__ files on
      main</b> import Radix. Every migration guide independently converges on strangler-fig,
      not big-bang[[13,14]].</li>
    <li><b>Mixed-library nesting: a caution, not a blocker.</b> This page previously cited
      mui/base-ui#2854 — a Base UI popup inside a Radix Dialog that renders but cannot be
      clicked — as an open live hazard. <b>That was wrong.</b> The issue was
      <b>closed as completed on 2025-10-16</b>, and its repro pinned
      <code>@base-ui-components/react@^1.0.0-beta.3</code> — a beta of the
      <i>predecessor package</i>, now deprecated at <code>1.0.0-rc.0</code> and superseded
      by <code>@base-ui/react</code>. It says nothing about 1.8.0[[11]]. The sequencing rule
      it motivated still earns its place, on general grounds rather than a tracked bug: two
      libraries running independent portal, z-index and dismissal stacks against each other
      is untested ground in <i>this</i> app, and stacking is the classic place it bites. So
      keep it as prudence with a stated expiry — <b>don't nest one library's popup inside
      the other's modal layer while both ship</b>, and if a case genuinely wants it, spike
      that one case rather than treating it as forbidden. Standalone popovers
      (<code>BtInsertMenu</code>, <code>DraftsControl</code>, <code>ContextualControls</code>)
      migrate freely; anything hosted by <code>CompareDialog</code> or
      <code>LocalWorkspace</code> migrates with or after its dialog;
      <code>ReliableContextMenu</code> last (largest surface, and Radix just shipped the
      controlled API it leans on)[[7]].</li>
  </ul>
  __PROBE__
</div>
"""

PROBE_INTRO = """
  <h4 class="probe-h">The dismissal claim, executed rather than asserted</h4>
  <p class="probe-p">Both architectures modelled against seven guard shapes in
  <code>docs/dismiss_propagation_probe.html</code>, __probe_prov__. The Base UI column
  models <code>useDismiss.mjs:458</code> (capture listener on <code>document</code>) plus
  <code>:344</code> (<code>addTargetEventListenerOnce</code>, which re-arms the decision on
  the event target). <b>Row B is SystemSketch's actual guard shape</b>: React 18/19 attaches
  synthetic handlers at the root container, so
  <code>onPointerDown={(e) =&gt; e.stopPropagation()}</code> stops the native event
  there — which is exactly the <code>capture: 1, bubble: 0</code> the bug record
  measured[[33,39]].</p>
"""

SHADCN = """
<div class="cand">
  <h3>shadcn/ui <span class="tag b1">axis 1 + styling</span> <span class="tag ref">crib from, never install</span></h3>
  <div class="what">MIT · Vercel-sponsored (creator employed there since 2023) · a CLI that copies component source into your repo — not a component library[[14,16]]</div>
  <p><b>What it actually is in 2026:</b> codegen over headless primitives + Tailwind + CVA.
  Two recent facts sharpen the picture: it made <b>Base UI the default primitive layer</b>
  (July 2026)[[14]], and its Radix track moved to the same <code>radix-ui</code> umbrella
  package this app already depends on[[15]] — so the app is accidentally compatible with
  both of shadcn's tracks. Neither helps, because:</p>
  <ul>
    <li><b>It cannot be used without Tailwind.</b> No official non-Tailwind path exists (the
      2+-year-old discussion asking for one has no maintainer commitment)[[16]]; every
      variant, state and responsive rule in every component is a Tailwind utility string
      inside a <code>cva()</code> map — including JIT-only constructs
      (<code>has-[&gt;svg]:px-3</code>, arbitrary-value brackets) with no plain-CSS
      equivalent to extract[[17]].</li>
    <li><b>The pattern minus the stack is what the app already does.</b> "Own the source,
      wrap a headless primitive, theme via CSS variables" — subtract Tailwind and that is
      literally the existing practice: thin wrappers over radix-ui, styled by hand-authored
      CSS against <code>--ss-*</code> tokens. shadcn's <code>:root</code>/<code>.dark</code>
      variable convention is a less capable version of the multi-host token layer already
      shipped[[36]].</li>
    <li><b>What survives as value:</b> a rendered reference gallery of interaction shapes
      (Combobox, Command, Sheet) built on the very primitives this app uses — worth reading
      when designing a new widget, never worth <code>npx shadcn add</code>.</li>
  </ul>
</div>
"""

TAILWIND = """
<div class="cand">
  <h3>Tailwind CSS <span class="tag b1">axis 2 (authoring only)</span> <span class="tag no">no — argued from numbers</span></h3>
  <div class="what">MIT · Tailwind Labs · a styling authoring syntax — explicitly not behavior (that's their separate Headless UI project) and not a semantic palette[[19]]</div>
  <p><b>The real cost, measured against this tree:</b></p>
  <ul>
    <li><b>Migration surface:</b> __css_files__ CSS files / __css_lines__ lines to port and
      __classname_sites__ <code>className=</code> call sites across __classname_files__ of
      __tsx_files__ <code>.tsx</code> files to rewire — against a codebase whose styling is
      already token-driven and class-organized (14:1 class-vs-inline ratio; this is not the
      inline-style sprawl Tailwind rescues)[[20]].</li>
    <li><b>__tldraw_rules__ rules across __tldraw_rule_files__ files are permanently
      unmigratable</b> — their selector <i>subject</i> is tldraw's own DOM
      (<code>.tlui-main-toolbar__tools</code>, <code>.tl-text-shape-label</code>,
      <code>.tlui-input</code>…), markup the app does not render. Tailwind cannot reach the
      part of the page that is the product[[20]].</li>
    <li><b>Preflight is a documented, open hazard against exactly this app's shape.</b>
      Tailwind's own docs warn the global base reset "is known to conflict with third-party
      libraries"; the v4 disable mechanism is all-or-nothing, and there are open issues
      (#17481, #17445, #19114) where disabling it still leaks resets — the precise failure
      mode (base-style bleed into a mounted third-party canvas) this app cannot risk[[19]].</li>
    <li><b>The one cheap true fact:</b> v4's <code>@theme inline</code> could expose the
      existing <code>--ss-*</code> tokens as utilities without rewriting
      <code>tokens.css</code>[[18]] — but that is a bridge to a second styling idiom the
      repo would then carry forever, for marginal gain on greenfield lab panels. And on the
      axis Zach actually cited: <code>dark:</code> is a selector mechanism, not palette
      semantics — it would not have prevented any of the three recorded dark/light bugs[[19,37]].</li>
  </ul>
  <p><b>Revisit only if</b> a fully canvas-detached surface someday needs one-off styling at
  a scale where per-feature CSS is genuinely the bottleneck — and even then, the
  <code>@theme inline</code> token bridge is the entire scope, not a foothold.</p>
</div>
"""

M3 = """
<div class="cand">
  <h3>Material Design 3 <span class="tag b1">axis 2 + components</span> <span class="tag no">no as a system — steal two ideas</span></h3>
  <div class="what">Spec by Google (m3.material.io) · implementations are the problem: no maintained first-party React path exists[[21,22]]</div>
  <p><b>Three concrete, falsifiable grounds — not a taste dismissal:</b></p>
  <ul>
    <li><b>There is nothing to install.</b> Google's own <code>@material/web</code> is Lit
      web components in official maintenance mode since June 2024 ("new features and
      components are no longer planned" — engineers reassigned to the internal Wiz
      framework)[[21]]. MUI implements M2, has left the M3 request open since 2021, and its
      2026 roadmap doesn't mention M3 — it names <i>Base UI</i> as the long-term
      direction[[22]]. Adopting M3 from React in 2026 means hand-implementing a spec, which
      contradicts the premise of the exercise.</li>
    <li><b>Its density and direction point away from tool chrome.</b> A 48dp touch-target
      floor against the 24–28px rows of a Figma-shaped inspector; and the 2025 "M3
      Expressive" revision moved the system <i>more</i> decorative — spring physics, shape
      morphing, "personality"[[23,24]]. The chrome of a canvas tool must recede; M3's
      trajectory is the opposite. (Honest caveats: M3 does ship a density system, its
      canonical layouts explicitly name "a design tool with an inspector panel," and no
      public evidence settles whether Google's own dense consoles run M3 — that claim is
      unverified in both directions[[23]].)</li>
    <li><b>Its token architecture is validation, not a purchase.</b>
      <code>md.ref.*</code> → <code>md.sys.*</code> → <code>md.comp.*</code> is the same
      raw-values → semantic-roles → component-bindings layering the <code>--ss-*</code>
      system already has[[23,36]].</li>
  </ul>
  <p><b>The two ideas worth taking, free of the look:</b> (1) the <b><code>on-*</code>
  role-pair vocabulary</b> — every surface color carries a paired on-color, which is
  precisely the rule whose absence produced the accent-on-accent-soft 2.6–4.3:1 bug; encode
  it in <code>tokens.css</code> naming when that file is next touched[[23,37]]. (2) the
  <b>HCT color science</b> — colorjs.io supports HCT/CAM16 natively, and the
  theme-appearance-lab already adopted colorjs.io; deriving palette ramps in HCT is the
  library-grade replacement for the hand-rolled <code>colorFromSwatch</code> math that
  wrote light-mode chrome into the dark table[[25,37]].</p>
</div>
"""

FOXGLOVE = """
<div class="cand">
  <h3>Foxglove Studio → Lichtblick <span class="tag ref">reference app</span></h3>
  <div class="what">MPL-2.0 fork by BMW (lichtblick-suite/lichtblick, v1.29.0) · Foxglove closed its open edition in 2024, repo archived[[26,28]]</div>
  <p><b>Verified from the actual manifests, not assumed:</b> MUI v7
  (<code>@mui/material@7.2.0</code>) over Emotion via <code>tss-react</code>'s
  <code>makeStyles</code>; <code>zustand</code> + <code>immer</code> for state;
  <code>react-mosaic-component</code> for panel docking (not golden-layout); <b>no Radix, no
  Floating UI</b> — MUI's own Popper/Popover throughout[[26]].</p>
  <ul>
    <li><b>The convergence finding:</b> its <code>SettingsTreeEditor</code> is a typed field
      union (<code>autocomplete · boolean · rgb · rgba · gradient · messagepath · number ·
      select · string · toggle · slider · vec2 · vec3 · legendcontrols</code>) rendered by
      one <code>switch</code>, written back through one action dispatch — 23 files, 2,927
      lines[[27]]. SystemSketch's inspector arrived at the identical schema-driven shape
      independently (51 <code>FieldSpec</code> entries with
      <code>applies</code>/<code>read</code>/<code>write</code>)[[34]]. Two mature tools
      converging on the same architecture from different substrates is strong evidence the
      <b>schema is the asset and the component substrate is fungible</b>.</li>
    <li><b>What MUI buys them, quantified:</b> their entire theme package is ~1,468 lines
      (two ~20-token palettes, 48 small per-component overrides) — MUI derives contrast
      text, hover/disabled overlays and elevation from that[[26]]. That derivation is
      exactly where SystemSketch's <code>colorFromSwatch</code> bug lived[[37]].</li>
    <li><b>Correction: the "MUI can't do multi-host theming" argument does not survive.</b>
      This page previously said MUI's JS-time <code>createTheme</code> "cannot follow live
      host CSS variables without a rebuild." <b>That is false for current MUI.</b>
      <code>cssVariables: {'{'} nativeColor: true {'}'}</code> — stable in
      <code>@mui/material</code> 9.4.0, released 2026-08-27, eleven days before this page —
      accepts an external variable as a palette value
      (<code>palette.primary.main: 'var(--colors-brand-primary)'</code>) and replaces
      <code>alpha</code>/<code>lighten</code>/<code>darken</code>/<code>getContrastText</code>
      with CSS <code>color-mix()</code> and relative color, so the derived ramp follows the
      host variable live with no JS rebuild[[40]]. The documented caveats are narrow and do
      not bite here: modern-browser-only (every host this app ships into is Chromium), and
      computed colors "may not exactly match" the JS ones. Two real things remain — Foxglove
      itself pins <code>@mui/material@7.2.0</code> (2025-06-30), <b>fourteen months before
      the feature existed</b>, so their stack is not evidence for it[[26]]; and MUI still
      arrives as a second visual language and a second component substrate beside tldraw's.
      The theming objection is withdrawn; the second-look objection is what actually rules
      MUI out[[36]].</li>
  </ul>
</div>
"""

RERUN = """
<div class="cand">
  <h3>rerun.io <span class="tag ref">reference app</span></h3>
  <div class="what">Rust + egui 0.36 + wgpu 30 — egui is written by Rerun's own CTO; the whole viewer is egui-drawn pixels[[29,30]]</div>
  <p><b>Confirmed from Cargo.toml and their own docs:</b> every panel — timeline, selection
  inspector, blueprint tree, context menus, all data views — is an egui-drawing Rust crate
  under <code>crates/viewer/*</code>. The web viewer is the <i>same</i> binary compiled to
  WASM executing inside a single <code>&lt;canvas&gt;</code>; the npm packages
  (<code>@rerun-io/web-viewer-react</code>) are lifecycle shells around that canvas with
  zero authored DOM chrome[[29,30,31]].</p>
  <ul>
    <li><b>Nothing library-shaped transfers</b> — no components, no CSS, no DOM
      accessibility tree (AccessKit bolt-on, experimental). Comparing component patterns or
      CSS architecture against it is a category error, and this doc doesn't force one[[30]].</li>
    <li><b>What does transfer is the discipline:</b> one typed design-token source
      (<code>re_ui</code>'s <code>design_tokens.ron</code> + color table) feeding one
      styling layer that owns every pixel of chrome[[32]] — the same one-owner principle as
      <code>tokens.css</code>'s "only file that may hold a chrome colour literal" rule,
      which egui gets by construction and this app holds with
      <code>tests/test_theme_tokens.py</code>[[36]]. Cite it as precedent for the rule, not
      as a stack to borrow from.</li>
  </ul>
</div>
"""

RECOMMENDATION = """
<section>
  <h2>Recommendation</h2>
  <p><b>Axis 1 — standardize on Base UI for app-authored chrome, by strangler fig.</b>
  Written as a standing rule: new chrome reaches for <code>@base-ui/react</code> first;
  existing Radix call sites migrate when their file is already being edited, never as a
  sweep; while both libraries ship, don't mount one library's popup inside the other's modal
  layer without spiking that case first[[11]]. Sequencing that falls out of the nesting
  rule: standalone popovers first (<code>ContextualControls</code>, <code>BtInsertMenu</code>,
  <code>DraftsControl</code>), the two Dialogs (<code>CompareDialog</code>,
  <code>LocalWorkspace</code>) as units, <code>ReliableContextMenu</code> last. The
  inspector worktree's NumberField is already on the right side of this rule.</p>
  <p><b>What that rule now rests on, stated plainly.</b> After the correction, the case for
  Base UI is: (1) <b>coverage</b> — every primitive this app uses plus NumberField, Combobox
  and Select, which Radix lacks[[3,4]]; (2) <b>ecosystem momentum</b> — a staffed team,
  monthly releases, shadcn/ui's default[[2,6,14,22]]; and (3) a <b>real but conditional</b>
  dismissal advantage: measured, Base UI survives the guard shape this app actually has,
  where Radix does not[[10,39]]. What it is <b>not</b> is structural immunity — three guard
  shapes still defeat Base UI, and if any of them ever lands in the tree the advantage
  evaporates for that call site. Weigh (3) as a tiebreaker that happens to point the same
  way as (1) and (2), not as the reason on its own.</p>
  <p><b>Axis 2 — keep the token layer; harden its two weak seams instead of replacing it.</b>
  (1) Adopt the <code>on-*</code> role-pair naming from M3's vocabulary next time
  <code>tokens.css</code> is touched, so "copy on a tint is ink" becomes a name the
  vocabulary enforces rather than a comment[[23,37]]. (2) Move palette <i>derivation</i>
  (the <code>colorFromSwatch</code> family) onto colorjs.io's HCT, already adopted in the
  theme-appearance-lab — that is the library-grade wheel for the one part of theming that
  was genuinely hand-rolled and genuinely broke[[25,37]].</p>
  <p><b>Independent of both, and load-bearing on its own:</b> land the
  <code>docs/bugs/0002</code> sweep (<code>stopPropagation</code> →
  <code>editor.markEventAsHandled</code>: __guard_sites__ sites across __guard_files__ files
  on main, __branch_guard__ on <code>claude/container-primitive-rebuild</code>) with its
  regression test <b>regardless of library choice</b>. tldraw ships Radix internally for its
  own menus, so its bubble-phase dismissal stays on the page forever — full app-side
  convergence on Base UI does not retire the bug class, it only removes the app's own
  popovers from it[[33,35]].</p>

  <h3>The reversible default (what happens if you say nothing)</h3>
  <p>Both libraries stay in <code>package.json</code>. Nothing migrates. The only change is
  the rule of thumb for <b>new</b> work — Base UI first — which any single future decision
  can reverse at the cost of zero migrated files. Each component migration, when it happens,
  is one file and one commit, individually revertable; <code>radix-ui</code> leaves the
  manifest only when its last importer does, if ever.</p>

  <h3>The concrete next step (if you want to act)</h3>
  <p>Spike <code>ContextualControls.tsx</code> — the property-rail popover — from
  <code>@radix-ui/react-popover</code> to Base UI Popover. It is the sharpest possible test:
  it lives against the canvas, it sits in the middle of the panel-guards bug class, and it
  already has a journey (<code>npm run test:contextual-composition</code>). Acceptance is
  the mechanism, not the symptom: with a <code>stopPropagation</code> guard deliberately in
  place, assert the popover dismisses <i>and</i> that it did so through Base UI's
  target-armed press path rather than the <code>focusin</code> side-channel that currently
  hides the Radix bug — the check <code>docs/bugs/0002</code> says no journey makes
  today[[10,33]]. The probe below tells you what a passing run should look like; the spike
  is what proves it survives contact with a real portal, a real canvas and a real tldraw
  layer stack, which no synthetic probe can. If it holds, the standing rule is validated end
  to end; if it doesn't, one file reverts and the rule flips back to Radix-first at zero
  cost.</p>
</section>
"""

NOT_RECOMMENDED = """
<section>
  <h2>Explicitly not recommended, and why</h2>
  <table>
    <thead><tr><th>Ruled out</th><th>Why — from the evidence, not presupposed</th></tr></thead>
    <tbody>
      <tr><th>Tailwind as a repo migration</th>
        <td>__css_lines__ lines / __classname_sites__ call sites of rewrite for a codebase
        already token-driven; __tldraw_rules__ rules it can never reach because tldraw
        renders that DOM; Preflight's disable path has open bugs in exactly the
        bleed-into-third-party-widget failure mode this app cannot absorb[[19,20]].</td></tr>
      <tr><th>Material Design 3 as a system</th>
        <td>No maintained React implementation exists to adopt (Google's own is Lit, in
        maintenance mode; MUI is M2 and pointing at Base UI); its density floor and 2025
        "Expressive" trajectory run opposite to recede-behind-the-canvas chrome. Its two
        good ideas — <code>on-*</code> role pairs, HCT — are taken above without the
        look[[21,22,23,24,25]].</td></tr>
      <tr><th>shadcn/ui in any installed form</th>
        <td>Foreclosed without Tailwind (no official path; utility strings with no CSS
        behind them); the pattern minus the stack reduces to what the app already does.
        Keep as a reference gallery[[16,17]].</td></tr>
      <tr><th>MUI (Foxglove's substrate)</th>
        <td>A second visual language and a second component substrate beside tldraw's. The
        thing worth having from Foxglove — the schema-driven settings tree — the app already
        independently built. <b>Note the argument that was withdrawn:</b> MUI 9.4's
        <code>nativeColor</code> mode <i>can</i> alias live host CSS variables, so "JS-time
        theming can't follow the host" is no longer a reason to rule it out[[26,27,34,36,40]].</td></tr>
      <tr><th>A big-bang Radix→Base UI sweep</th>
        <td>The transition is the risky part, not the endpoints: two libraries running
        independent portal/z-index/dismissal stacks is untested ground here, and the
        <code>asChild</code>→<code>render</code> rewrite deserves per-file review, not a
        batch diff. Strangler fig gets the same destination without the exposure. (The
        specific bug once cited for this, #2854, is closed and was filed against the
        deprecated pre-1.0 package — the caution is general, not tracked[[11,13]].)</td></tr>
      <tr><th>Porting tldraw-owned chrome to either library</th>
        <td>The toolbar spike already priced this: near-parity costs 970 lines and loses the
        digit keys and responsive overflow that tldraw's <code>OverflowingToolbar</code>
        owns; every overlay then pays the <code>editor.menus</code> registration tax
        forever. The stock boundary stays where it is[[35]].</td></tr>
    </tbody>
  </table>
</section>
"""

SOURCES = [
    'base-ui.com/react/overview/about — Base UI team: "from the creators of Radix, Material UI, and Floating UI" (Colm Tuite et al.)',
    "base-ui.com/react/overview/releases — 1.0.0 stable 2025-12-11; monthly releases to 1.8.0 (2026-09-04)",
    "github.com/radix-ui/primitives — discussion #3352, NumberField request, open and unanswered",
    "@base-ui/react@1.8.0 component directories + bundled docs/react/components/*.md, read from node_modules 2026-09-07: 37 components incl. context-menu, number-field, toast, combobox, autocomplete, select, scroll-area. No hover-card/ — Base UI names it preview-card ('a link that shows a destination preview'), i.e. Radix's Hover Card under a different name, so the 'reverse gap' in the first draft was a naming artifact. Those docs also confirm the @base-ui-components/react → @base-ui/react rename",
    "registry.npmjs.org/@base-ui/react — MIT, 1.8.0",
    "github.com/mui/base-ui — active, pushed 2026-09-07, 10,845 stars, not archived",
    "radix-ui.com/primitives/docs/overview/releases — releases through Jul 2026, incl. controlled ContextMenu (Jun 2026)",
    "registry.npmjs.org/radix-ui — 1.6.7 published 2026-07-24, MIT; 1.7.0-rc prereleases through 2026-07-31 (re-read from the registry 2026-09-07; an earlier draft dated 1.6.7 to 07-31)",
    "radix-ui/primitives dismissable-layer.tsx (raw source) — outside-press decided by bubble-phase document pointerdown listener",
    "@base-ui/react@1.8.0 floating-ui-react/hooks/useDismiss.mjs, read from node_modules (worktree tldraw-inspector-panel-cf524c): :37 outsidePress defaults true, :53 outsidePressEnabled = outsidePress !== false, :458 the press listeners (click/pointerdown/pointerup/pointercancel/mousedown/mouseup/touch*) all registered on document with capture, gated on that flag; :344 addTargetEventListenerOnce re-arms the decision on the event's own target; :358 closeOnPressOutsideCapture defers to it. PopoverRoot.mjs:111 passes no outsidePress (default on); MenuRoot.mjs:348 and useDialogRoot.mjs:34 pass functions, which also leave it enabled",
    "github.com/mui/base-ui/issues/2854 — CLOSED as completed 2025-10-16; repro pinned @base-ui-components/react@^1.0.0-beta.3 (predecessor package, now deprecated at 1.0.0-rc.0) with @radix-ui/react-dialog@^1.1.15. Re-fetched 2026-09-07; an earlier draft of this page cited it as open and current",
    "github.com/tldraw/tldraw/issues/7584 — 'Investigate migrating from Radix UI to Base UI'; opened 2026-01-04, still open 2026-09-07, 4 comments, labels sdk/keep, ~32 files in scope, no linked PR, branch or implementation",
    "basecn.dev/docs/get-started/migrating-from-radix-ui — asChild→render, Positioner layer, part renames; strangler-fig guidance",
    "ui.shadcn.com/docs/changelog/2026-07-base-ui-default + github.com/shadcn-ui/ui/discussions/9562 — Base UI default since July 2026; ~2:1 pick rate; Radix track continues",
    "ui.shadcn.com/docs/changelog/2026-02-radix-ui — Radix track moved to the unified radix-ui package",
    "github.com/shadcn-ui/ui/discussions/2832 — no non-Tailwind path, no maintainer commitment in 2+ years",
    "shadcn-ui/ui apps/v4/registry/new-york-v4/ui/button.tsx (raw source) — variants are Tailwind utility strings in cva(), incl. JIT-only constructs",
    "tailwindcss.com/docs/theme — @theme inline can wrap pre-existing CSS custom properties",
    "tailwindcss.com/docs/preflight + tailwindlabs/tailwindcss#17481, #17445, #19114 — preflight 'known to conflict with third-party libraries'; disable is all-or-nothing with open leak bugs",
    "local measurement, computed at build time from /home/bam/systemsketch — CSS rules whose selector subject carries .tl-/.tlui-/[data-tl (comments stripped), and literal className= occurrences in src/**/*.tsx. Both were hardcoded prose in the first draft (28/11 and 1,466/106); they are now derived, and the CSS figure changed because the earlier one was not reproducible under any stated rule",
    "github.com/material-components/material-web discussion #5642 + releases — maintenance mode since June 2024, engineers reassigned to Wiz; volunteer releases since",
    "mui/material-ui#29345 (M3 request, open since 2021) + mui.com/blog/2026-and-beyond — no M3 on the roadmap; Base UI named the long-term direction",
    "m3.material.io — design-tokens (md.ref/md.sys/md.comp), density, elevation, canonical layouts; 48dp touch-target floor",
    "android-developers.googleblog.com — Material 3 Expressive (2025): spring motion system, shape morphing",
    "colorjs.io/docs/spaces — native HCT and CAM16-JMh support",
    "lichtblick-suite/lichtblick package.json, packages/suite-base, packages/theme — @mui/material@7.2.0, emotion + tss-react, zustand@4.5.7, react-mosaic-component@6.2.0; theme package ~1,468 lines",
    "lichtblick packages/suite/src/index.ts + SettingsTreeEditor/ — 14-variant field union, single action dispatch; FieldEditor.tsx 506 / NodeEditor.tsx 553 lines; 23 files, 2,927 lines",
    "foxglove.dev/blog/foxglove-2-0-unifying-robotics-observability — open edition discontinued 2024; github.com/foxglove/studio archived, last push 2024-07-18",
    "rerun-io/rerun Cargo.toml — egui/eframe 0.36.1, wgpu 30.0; crates/viewer/* (re_ui, re_time_panel, re_selection_panel, …)",
    'rerun.io/docs — "uses egui (written by Rerun\'s CTO)"; embed-web: the viewer executes inside a single <canvas>',
    "registry.npmjs.org/@rerun-io/web-viewer(-react) — WASM bundle + React lifecycle shell; zero authored DOM chrome",
    "docs.rs/re_ui design_tokens.rs — RON token files (design_tokens.ron, color_table.ron) applied to egui Style",
    "docs/bugs/0002-panel-guards-starve-radix-dismissal.md (worktree pep-evidence) — stopPropagation starves Radix's bubble-phase listener; dismissal survives via an accidental focus side-channel. The record's headline census is 60 occurrences / 29 files on claude/container-primitive-rebuild, and it states its own scope: 'Run where this record lives it returns 57/26, and on main 57/26.' This page measures main at build time and labels it",
    "docs/work-order-primitive-inspector.md §5 (worktree tldraw-inspector-panel-cf524c) — the prior scrub-field survey: Radix #3352, react-aria/Blueprint/Mantine/Tweakpane no drag-scrub, Ark UI ~70 zag machines, Excalidraw DragInput.tsx pattern, Webstudio/Theatre.js AGPL read-never-copy",
    "reports/toolbar-radix-spike-2026-09-07.html (main, 8a25f263) — toolbar rebuilt on Radix: 52/52 checks, 12/12 tokens both schemes; digit keys 1–9 and responsive overflow lost; editor.menus registration is the permanent tax",
    "src/theme/tokens.css + tests/test_theme_tokens.py + tests/theme_contrast_smoke.mjs — single-owner token layer, literal ban, phantom-variable gate, 5-theme × ~25-probe WCAG journey",
    "theme-appearance-lab worktree — c51978ce (colorFromSwatch wrote five light-mode frame-chrome values into the dark table) and 224798d6 (contrast math moved onto colorjs.io); accent-on-accent-soft measured 2.60–4.29:1 across all palettes (2026-09-01)",
    "pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026 — Radix 'relatively slowed' next to Base UI's staffed team, not stopped",
    "docs/dismiss_propagation_probe.html — both dismissal architectures modelled against seven guard shapes and executed in headless Chrome at build time; the matrix in the Base UI section is that run's output, not a reading",
    "mui.com/material-ui/customization/css-theme-variables/native-color/ + registry.npmjs.org/@mui/material — cssVariables.nativeColor accepts 'var(--external-token)' as a palette value and replaces alpha/lighten/darken/getContrastText with CSS color-mix() and relative color; modern browsers only; @mui/material 9.4.0 published 2026-08-27, while Lichtblick pins 7.2.0 (2025-06-30)",
]


def cite(text: str) -> str:
    """[[1,2]] → superscript links into the source index."""
    def sub(match: re.Match[str]) -> str:
        nums = match.group(1).split(",")
        inner = ",".join(f'<a href="#s{n}">{n}</a>' for n in nums)
        return f'<sup class="c">{inner}</sup>'
    return re.sub(r"\[\[([0-9,]+)\]\]", sub, text)


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
  a { color:var(--blue); text-decoration:none } a:hover { text-decoration:underline }
  sup.c { font:600 10.5px/1 ui-monospace,monospace; color:var(--blue); letter-spacing:.02em }
  sup.c a { color:inherit }
  .hero { padding:42px; border:1px solid #d5dde8; border-radius:24px; background:#ffffffe8; box-shadow:0 22px 60px #22344c14 }
  .eyebrow { color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase }
  h1 { margin:10px 0 14px; font-size:clamp(32px,5vw,52px); line-height:1.04; letter-spacing:-.045em; max-width:24ch }
  .lead { max-width:72ch; margin:0; color:var(--muted); font-size:17.5px }
  .lead b { color:var(--ink) }
  .verdict { margin-top:22px; padding:18px 20px; border:1px solid #cfe6da; border-left:4px solid var(--green);
    border-radius:12px; background:#f1faf5; font-size:15px; line-height:1.6 }
  .verdict b { color:var(--green) }
  .quiet { margin-top:12px; padding:14px 18px; border:1px solid var(--line); border-left:4px solid var(--muted);
    border-radius:12px; background:#f7f8fb; font-size:13.5px; color:var(--muted) }
  section { margin-top:22px; padding:30px; border:1px solid var(--line); border-radius:20px; background:#fffffff2;
    box-shadow:0 12px 36px #22344c0d }
  h2 { margin:0 0 6px; font-size:24px; letter-spacing:-.03em }
  h3 { margin:22px 0 8px; font-size:16.5px; letter-spacing:-.01em }
  section > p, .prose p { margin:0 0 14px; color:#3a404a; max-width:78ch }
  table { width:100%; border-collapse:collapse; font-size:13.5px }
  th, td { padding:10px 12px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line) }
  thead th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
  tbody th { font-weight:650; min-width:130px }
  td small, th small { display:block; margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.45; font-weight:400 }
  .tag { display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:.03em }
  .tag.b1 { background:var(--blue-soft); color:var(--blue) }
  .tag.b2 { background:#f0eafd; color:var(--violet) }
  .tag.keep { background:#e9f7f0; color:var(--green) }
  .tag.no { background:#fdeeec; color:var(--red) }
  .tag.ref { background:#fdf3e4; color:var(--amber) }
  .cand { margin-top:18px; padding:22px; border:1px solid var(--line); border-radius:14px; background:#fafbfd }
  .cand h3 { margin:0 0 2px; font-size:18px; display:flex; align-items:center; gap:10px; flex-wrap:wrap }
  .cand .what { margin:2px 0 12px; font-size:12.5px; color:var(--muted) }
  .cand p { margin:0 0 10px; font-size:14px; color:#3a404a; max-width:80ch }
  .cand ul { margin:0 0 10px; padding-left:20px; font-size:13.5px; color:#3a404a }
  .cand li { margin:5px 0; max-width:78ch }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px }
  @media (max-width:840px){ .cols { grid-template-columns:1fr } }
  .box { padding:18px; border:1px solid var(--line); border-radius:13px; background:#fff }
  .box h4 { margin:0 0 8px; font-size:13.5px }
  .box.free h4 { color:var(--green) } .box.cost h4 { color:var(--red) }
  .box ul { margin:0; padding-left:18px; color:#4a5057; font-size:13px }
  .box li { margin:5px 0 }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:14px 0 6px }
  @media (max-width:840px){ .metrics { grid-template-columns:repeat(2,1fr) } }
  .metric { padding:15px; border:1px solid var(--line); border-radius:12px; background:#fafbfd }
  .metric strong { display:block; font-size:24px; letter-spacing:-.04em }
  .metric span { color:var(--muted); font-size:11px; line-height:1.4; display:block; margin-top:2px }
  .axes-svg { width:100%; height:auto; display:block; margin:16px 0 4px }
  .probe { margin:14px 0 4px; padding:16px 18px; border:1px solid #cfd9ea; border-radius:12px; background:#f6f9ff }
  .probe-h { margin:0 0 6px; font-size:13.5px; color:var(--blue) }
  .probe-p { margin:0 0 10px; font-size:12.5px; line-height:1.55; color:#3a404a; max-width:82ch }
  .probe-t { font-size:12.5px; margin:0 0 10px }
  .probe-t th, .probe-t td { padding:7px 10px; border-bottom:1px solid #dde5f2 }
  .probe-t td.ok { color:var(--green); font-weight:650 }
  .probe-t td.bad { color:var(--red); font-weight:650 }
  .probe-t td.warn { color:var(--amber); font-weight:650 }
  ol.srcs { margin:8px 0 0; padding-left:26px; font-size:12.5px; color:var(--muted); columns:2; column-gap:28px }
  ol.srcs li { margin:4px 0; break-inside:avoid }
  footer { margin-top:26px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
    display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px }
"""


def render_probe(rows: list[tuple[str, bool, bool]], provenance: str) -> str:
    """The dismissal matrix. Rendered from the run, so it cannot outlive its evidence."""
    if not rows:
        return (
            '<div class="probe"><p class="probe-p"><b>The dismissal probe did not run on this'
            f' host</b> ({html.escape(provenance)}). Re-run <code>docs/dismiss_propagation_probe.html</code>'
            " in any Chromium-based browser and read the block it prints; the claims in this"
            " section stand on that output, not on this page.</p></div>"
        )
    body = []
    for scenario, radix, base in rows:
        verdict = ("survives" if base else "starved") if not radix else "n/a — both fire"
        cls = "ok" if base else ("warn" if not radix else "")
        body.append(
            f'<tr><td>{html.escape(scenario)}</td>'
            f'<td class="{"ok" if radix else "bad"}">{"fires" if radix else "starved"}</td>'
            f'<td class="{"ok" if base else "bad"}">{"fires" if base else "starved"}</td>'
            f'<td class="{cls}">{verdict}</td></tr>'
        )
    return (
        '<div class="probe">'
        + cite(PROBE_INTRO).replace("__probe_prov__", html.escape(provenance))
        + '<table class="probe-t"><thead><tr><th>Guard shape on the press</th>'
        "<th>Radix (document, bubble)</th><th>Base UI (target, re-armed from capture)</th>"
        "<th>Outcome</th></tr></thead><tbody>"
        + "".join(body)
        + "</tbody></table>"
        + '<p class="probe-p"><b>Read the last three rows.</b> A capture-phase guard on an '
        "intervening ancestor (D), <code>stopImmediatePropagation</code> on the target (F), "
        "and a <code>document</code>-capture guard registered before the popup mounts (G) "
        "all defeat Base UI too. Base UI's advantage is that it survives shapes B, C and E "
        "— and B is the one this codebase actually writes. Counted on main today: <b>zero</b> "
        "capture-phase <code>pointerdown</code> guards that call <code>stopPropagation</code>, "
        "and two <code>stopImmediatePropagation</code> call sites, neither on a popup path "
        "(<code>canvasCamera.ts:101</code>, <code>PrimitiveSearch.tsx:101</code>). So the "
        "advantage is real <i>for the tree as it stands</i>, and a future capture-phase guard "
        "would silently remove it. That is a discipline the "
        "<code>markEventAsHandled</code> sweep buys and a library does not.</p>"
        '<p class="probe-p"><b>One caveat the probe cannot settle:</b> Base UI\'s Popover '
        "defaults to <code>outsidePressEvent: 'intentional'</code> for mouse when not "
        "trapping focus, which moves the decision from <code>pointerdown</code> to "
        "<code>click</code>. The listeners are capture-registered and target-armed either "
        "way, so the shape of the result is unchanged — but a guard on "
        "<code>onClick</code> rather than <code>onPointerDown</code> is the one to watch "
        "under that mode. Main has 6 such <code>onClick</code> guards across 6 files today; "
        "none is on a popup path, and the spike below is where that gets confirmed against "
        "real markup.</p></div>"
    )


def build() -> None:
    m = measure()
    probe_rows, probe_prov = run_probe()

    # ---- inline-SVG: the two axes, with every candidate placed on the axis it
    # actually addresses. Drawn to scale of the argument, not of any UI.
    axes_svg = """
<svg class="axes-svg" viewBox="0 0 980 380" role="img" aria-label="The two axes: behavior primitives versus visual system, and where each candidate sits">
  <defs>
    <style>
      .lane { fill:#fafbfd; stroke:#d9dee6 }
      .lane-title { font:700 14px Inter,sans-serif; fill:#1c2027 }
      .lane-sub { font:400 11px Inter,sans-serif; fill:#5c636e }
      .pill { rx:9 }
      .pl { font:600 12px Inter,sans-serif; fill:#fff; text-anchor:middle }
      .pn { font:400 10.5px Inter,sans-serif; fill:#5c636e; text-anchor:middle }
      .here { font:700 10px Inter,sans-serif; fill:#1f8a5a; letter-spacing:.08em }
    </style>
  </defs>

  <!-- Axis 1 lane -->
  <rect class="lane" x="10" y="14" width="960" height="160" rx="14"/>
  <text class="lane-title" x="30" y="44">Axis 1 — behavior primitives (headless)</text>
  <text class="lane-sub" x="30" y="62">focus traps · outside-press dismissal · roving tabindex · ARIA wiring · positioning — no pixels, no opinion about looks</text>

  <rect class="pill" x="30" y="86" width="150" height="30" fill="#3061e6"/>
  <text class="pl" x="105" y="105">Radix (in use ×__radix_files__)</text>
  <rect class="pill" x="192" y="86" width="170" height="30" fill="#3061e6"/>
  <text class="pl" x="277" y="105">Base UI (in use ×1, lab)</text>
  <rect class="pill" x="374" y="86" width="188" height="30" fill="#8a93a3"/>
  <text class="pl" x="468" y="105">shadcn/ui (wraps these)</text>
  <rect class="pill" x="574" y="86" width="200" height="30" fill="#8a93a3"/>
  <text class="pl" x="674" y="105">MUI (Foxglove's substrate)</text>
  <text class="pn" x="105" y="132">already yours</text>
  <text class="pn" x="277" y="132">already yours (worktree)</text>
  <text class="pn" x="468" y="132">codegen, needs Tailwind</text>
  <text class="pn" x="674" y="132">behavior + a whole look, fused</text>
  <text class="here" x="30" y="160">TODAY: BOTH LIBRARIES, NO RULE SAYING WHICH — THAT IS THE ACTUAL GAP</text>

  <!-- Axis 2 lane -->
  <rect class="lane" x="10" y="196" width="960" height="160" rx="14"/>
  <text class="lane-title" x="30" y="226">Axis 2 — visual system (tokens, palettes, dark/light)</text>
  <text class="lane-sub" x="30" y="244">semantic color roles · scheme invariance · spacing/type scale — where every cited dark/light bug actually lives</text>

  <rect class="pill" x="30" y="268" width="212" height="30" fill="#1f8a5a"/>
  <text class="pl" x="136" y="287">--ss-* tokens (yours, shipped)</text>
  <rect class="pill" x="254" y="268" width="176" height="30" fill="#8a93a3"/>
  <text class="pl" x="342" y="287">Tailwind (authoring only)</text>
  <rect class="pill" x="442" y="268" width="204" height="30" fill="#8a93a3"/>
  <text class="pl" x="544" y="287">Material 3 (roles + a look)</text>
  <rect class="pill" x="658" y="268" width="196" height="30" fill="#8a93a3"/>
  <text class="pl" x="756" y="287">rerun/egui (not comparable)</text>
  <text class="pn" x="136" y="314">derived live from --tl-* / host</text>
  <text class="pn" x="342" y="314">no semantics, just syntax</text>
  <text class="pn" x="544" y="314">steal the role vocabulary only</text>
  <text class="pn" x="756" y="314">cite the discipline, not the stack</text>
  <text class="here" x="30" y="342">TODAY: A REAL TOKEN LAYER WITH BUILD GATES — THE BUGS WERE DERIVATION MATH, NOT MISSING LIBRARY</text>
</svg>
"""

    # Sections assembled below; citations are bare numbers into the source
    # index, per the house citation rule.
    def c(*ns: int) -> str:
        inner = ",".join(f'<a href="#s{n}">{n}</a>' for n in ns)
        return f'<sup class="c">{inner}</sup>'

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · UI design system strategy</title>
<style>{CSS}</style>
</head>
<body>
<main>

<div class="hero">
  <div class="eyebrow">Decision doc · research, no code changed · 2026-09-07</div>
  <h1>A real design system for the chrome — what to adopt, what you already have</h1>
  <p class="lead">Your framing was one question — <i>"we're operating at way too low a level,
  I don't want to reinvent the wheel"</i> — but it is <b>two separate problems wearing one
  coat</b>, and every candidate you named solves at most one of them. This doc separates
  them, measures where the app actually stands on each, and puts all six candidates against
  the widgets you actually build: the property rail, the inspector, contextual menus,
  tablists, dialogs.</p>
  __VERDICT__
</div>

<section>
  <h2>The two axes</h2>
  <p><b>Axis 1 — headless behavior primitives.</b> Focus traps, dismiss-on-outside-press,
  roving tabindex, keyboard navigation, ARIA wiring, popup positioning. This is what Radix
  and Base UI <i>are</i> — behavior with zero pixels. SystemSketch already has real, partial
  adoption of <b>both</b>. The open question on this axis is not "adopt a library" — it is
  <b>standardize on one of the two you already ship, and write the rule down</b>.</p>
  <p><b>Axis 2 — the visual system.</b> Semantic color roles, scheme invariance, spacing and
  type scale. This is where every dark/light bug you cited actually lives — and it is a
  CSS-token-and-palette-math problem, <b>orthogonal to which headless kit you use</b>. Radix
  and Base UI are both unstyled; adopting either fixes no scheme-invariance bug. Material 3
  is the one candidate that bundles an opinionated visual system with components — which is
  exactly what makes it wrong here (argued in its section, not presupposed). Tailwind is a
  styling <i>authoring</i> syntax on this axis, not a semantic system: it gives you
  <code>dark:</code> as a mechanism and leaves the palette semantics — the part that broke —
  entirely to you{c(20)}.</p>
  {axes_svg}
  <p style="margin-top:10px"><small style="color:var(--muted)">Grey pills are candidates
  researched and not recommended for adoption on that axis; blue are the two live headless
  kits; green is the shipped token layer. Placement is what each thing <i>is</i>, not a
  quality ranking.</small></p>
</section>

<section>
  <h2>Current state — measured, not remembered</h2>
  <p>Every count in this section is computed at build time by
  <code>docs/build_ui_design_system_strategy.py</code> against the live tree at
  <code>/home/bam/systemsketch</code> (main checkout), so it cannot drift from the code it
  describes; each measurement's exact query is a comment beside it in that file, and
  branch/worktree facts are labeled with their tree. <b>That was not true of the first
  draft</b> — the Tailwind migration surface and the tldraw-DOM rule count were prose
  literals sitting inside a table that claimed to be derived. They are derived now, which is
  how the rule count moved. Figures from the six research legs (release dates, upstream issue
  states, Foxglove's line counts) are external and carry their 2026-09-07 read date in the
  source index instead.</p>

  <div class="metrics">
    <div class="metric"><strong>{n(m["radix_files"])}</strong><span>files import Radix on main
      (<code>{html.escape(m["radix_version"].strip('"').replace('"',''))}</code>, MIT) — an
      import-anchored count, so the WHY comment in <code>DraftModeBar.tsx</code> explaining why it
      does <i>not</i> use Radix is correctly excluded</span></div>
    <div class="metric"><strong>{n(m["ss_decls"])}</strong><span><code>--ss-*</code> declarations in
      <code>src/theme/tokens.css</code> ({n(m["tokens_lines"])} lines, the only file allowed chrome color literals)</span></div>
    <div class="metric"><strong>{n(m["ss_consumers"])}</strong><span>files consume
      <code>var(--ss-…)</code> — the token layer is load-bearing, not aspirational</span></div>
    <div class="metric"><strong>{n(m["css_files"])} / {n(m["css_lines"])}</strong><span>hand-authored CSS
      files / lines under <code>src/</code> (beside {n(m["src_lines"])} lines of TS/TSX)</span></div>
  </div>

  <h3>Axis 1 today — two headless kits, no rule</h3>
  <table>
    <thead><tr><th>Where</th><th>What</th><th>Evidence</th></tr></thead>
    <tbody>
      <tr><th>main</th>
        <td><span class="tag b1">Radix</span> ContextMenu, Popover ×3, Dialog ×2</td>
        <td><code>ReliableContextMenu.tsx:14</code>, <code>BtInsertMenu.tsx:23</code>,
            <code>ContextualControls.tsx:1</code>, <code>DraftsControl.tsx:13</code>,
            <code>CompareDialog.tsx:24</code>, <code>LocalWorkspace.tsx:23</code></td></tr>
      <tr><th>branch <code>claude/tablist-keyboard</code></th>
        <td><span class="tag b1">Radix</span> Tabs.Root over the eight hand-rolled tablists (unmerged)</td>
        <td><code>BlockInspector.tsx:1761</code> and 7 siblings; the WHY comment at :1749
            records why Tabs.Content couldn't be used (panels render their own
            <code>role="tabpanel"</code>)</td></tr>
      <tr><th>lab worktree <code>rail-widgets</code></th>
        <td><span class="tag b1">Radix</span> Slider as the property rail's range widget</td>
        <td><code>systemPrimitivesTab.tsx:41,450</code>; the rail's widget vocabulary is
            toggle / select / range with a typed <code>mixed</code> wrapper
            (<code>systemPrimitivesModel.ts:347–356,391</code>)</td></tr>
      <tr><th>worktree <code>tldraw-inspector-panel-cf524c</code></th>
        <td><span class="tag b2">Base UI</span> <code>@base-ui/react@1.8.0</code> NumberField —
            the Figma drag-scrub field Radix cannot provide (no NumberField; discussion #3352
            unanswered{c(3)})</td>
        <td><code>src/inspector/ScrubNumber.tsx</code>; the worktree carries its own
            <code>node_modules</code> for it (work-order §5)</td></tr>
      <tr><th>engine</th>
        <td><span class="tag b1">Radix</span> tldraw ships Radix internally for its own menus —
            one shared dismissable-layer stack whether you like it or not</td>
        <td>toolbar-radix-spike report: "one shared <code>@radix-ui/react-dismissable-layer</code>
            stack (tldraw ships Radix internally)"</td></tr>
      <tr><th>still hand-rolled</th>
        <td>DraftModeBar's one-item overflow menu (deliberate — WHY at
            <code>DraftModeBar.tsx:56</code>), LibrarySearchModal, RecorderControls portal,
            26 files with their own Escape handlers, 5 native <code>&lt;select&gt;</code>,
            9 native checkboxes</td>
        <td>grep census, 2026-09-07</td></tr>
      <tr><th>the live bug on this axis</th>
        <td><code>docs/bugs/0002</code>: panel <code>stopPropagation</code> guards starve Radix's
            bubble-phase outside-press listener — <b>{n(m["guard_sites"])} occurrences /
            {n(m["guard_files"])} files on main</b> (measured here at build time; the record's
            headline <b>60 / 29</b> is its count on <code>claude/container-primitive-rebuild</code>,
            which carries <code>src/uiEditor/</code> where the guidance spread fastest — the
            record names the tree, and this row does too). Dismissal currently works through an
            accidental focus side-channel. This is an integration-discipline bug (the fix realigns
            to tldraw's <code>markEventAsHandled</code>), not a component-library gap.</td>
        <td><code>docs/bugs/0002-panel-guards-starve-radix-dismissal.md</code>
            (worktree <code>pep-evidence</code>){c(33)}</td></tr>
    </tbody>
  </table>

  <h3>Axis 2 today — you already have a design system; the bugs were in its math</h3>
  <table>
    <thead><tr><th>Piece</th><th>State</th><th>Evidence</th></tr></thead>
    <tbody>
      <tr><th>Token layer</th>
        <td>One semantic vocabulary ({m["ss_decls"]} <code>--ss-*</code> declarations), single-owner
            rule ("the only file in src/ that may hold a chrome colour literal"), themes keyed on
            <code>data-ss-theme</code> (systemsketch / vscode / obsidian) +
            <code>data-ss-color-scheme</code>, default theme <b>derived live from tldraw's
            <code>--tl-*</code></b> so the chrome cannot disagree with the board</td>
        <td><code>src/theme/tokens.css:1–30,109,148,181</code></td></tr>
      <tr><th>Gates</th>
        <td>{m["theme_tests"]} Python tests ban stray color literals and phantom
            <code>--tl-*</code> reads; <code>npm run test:theme</code> probes ~25 surfaces ×
            5 themes against WCAG ratios read off the live element</td>
        <td><code>tests/test_theme_tokens.py</code>; <code>tests/theme_contrast_smoke.mjs</code></td></tr>
      <tr><th>The actual dark/light bugs</th>
        <td>(a) <code>colorFromSwatch</code> derived five light-mode frame-chrome values and wrote
            them into the <b>dark</b> table — white card on a dark board; (b) accent-colored text
            on accent-soft measures 2.6–4.3:1 in <i>every</i> palette — a role-semantics error
            (copy on a tint must be ink, not accent); (c) phantom variables silently resolving to
            fallbacks — now gated. <b>All three are palette-derivation and role-semantics bugs in
            the app's own math. No headless library prevents any of them; a bundled visual system
            would prevent (a) and (b) by construction — at the price of its look.</b></td>
        <td>theme-appearance-lab <code>c51978ce</code>; contrast measurements 2026-09-01;
            <code>tests/test_theme_tokens.py</code></td></tr>
      <tr><th>The hard constraint</th>
        <td>{n(m["tldraw_rules"])} CSS rules across {n(m["tldraw_rule_files"])} files style
            tldraw's own DOM (<code>.tlui-main-toolbar__tools</code>,
            <code>.tl-text-shape-label</code>, <code>.tlui-input</code>…) — DOM the app does not
            render. No utility framework or component library can ever reach these; they stay
            hand-written CSS under any strategy{c(20)}.</td>
        <td>computed at build time: comments stripped, a rule counted when the
            <b>subject</b> (rightmost compound) of any of its selectors carries
            <code>.tl-</code>, <code>.tlui-</code> or <code>[data-tl</code>. A bare grep for
            <code>.tl-</code> anywhere in the selector returns {n(m["tldraw_rules_loose"])};
            that over-counts rules merely <i>scoped</i> inside the canvas container, which a
            utility class could replace</td></tr>
      <tr><th>Multi-host requirement</th>
        <td>The IDE plugins re-theme the same chrome from <b>host</b> variables (VS Code, Obsidian)
            at runtime, via CSS custom properties, and the CSS-variable layer re-themes for free.
            <b>This is a reason to keep what exists, not a reason no library could do it</b> — an
            earlier draft of this page claimed a JS-time theme object could not follow live host
            variables, and that is false: MUI 9.4's
            <code>cssVariables: {'{'} nativeColor: true {'}'}</code> accepts
            <code>'var(--host-token)'</code> as a palette value and derives from it in CSS{c(40)}.
            The honest form of the argument is cost, not capability: the token layer already
            works, is gated by tests, and owes nothing to a vendor's theming model.</td>
        <td><code>src/theme/tokens.css:148–210</code>; <code>vscode-systemsketch/</code></td></tr>
    </tbody>
  </table>

  <h3>Adoption precedent — the repo is not library-averse, and this ground was already swept</h3>
  <p>elkjs + d3-hierarchy (layout, since 2026-09-02), dnd-kit (PEPs 0006–0013), lucide-react,
  colorjs.io for contrast math (theme-appearance-lab <code>224798d6</code>), match-sorter and
  jsdiff approved by the 2026-09-07 six-domain sweep. That sweep's own verdict: <i>"dnd-kit was
  a specific miss, not a systemic pattern"</i> — five of six domains came back
  <b>keep ours</b>, with the second-scene-graph objection and license as the recurring killers.
  This doc extends that audit to the chrome; it does not re-litigate it.</p>
</section>

<section>
  <h2>The candidates</h2>
  <p>Each judged against this app's actual widgets — property rail, primitive inspector,
  contextual menus, tablists, dialogs — from primary sources read on 2026-09-07, not landing
  pages.</p>

__BASE_RADIX__

__SHADCN__

__TAILWIND__

__M3__

__FOXGLOVE__

__RERUN__

</section>

__RECOMMENDATION__

__NOT_RECOMMENDED__

<section>
  <h2>Source index</h2>
  <ol class="srcs">
__SOURCES__
  </ol>
</section>

<footer>
  <div>Built by <code>docs/build_ui_design_system_strategy.py</code> · current-state numbers
    measured from the live tree at build time</div>
  <div>Research: Claude Code scribe (Fable 5, <code>claude-fable-5</code>) + six Sonnet 5
    research legs · 2026-09-07</div>
</footer>

</main>
</body>
</html>
"""
    sources_html = "\n".join(
        f'    <li id="s{i}">{html.escape(s, quote=False).replace("&lt;canvas&gt;", "&lt;canvas&gt;")}</li>'
        for i, s in enumerate(SOURCES, start=1)
    )
    # Measured values reach the prose blocks as __key__ tokens rather than f-string
    # fields: several blocks (and the SVG) contain literal braces, which an f-string
    # would swallow. Every token must resolve — an unresolved one is a build failure,
    # not a silently rendered "__foo__" in a document Zach acts on.
    def fill(text: str) -> str:
        for key, value in m.items():
            text = text.replace(f"__{key}__", n(value) if value.isdigit() else value)
        text = text.replace("__branch_guard__", "60 / 29")
        leftover = re.findall(r"__[a-z_]+__", text)
        assert not leftover, f"unresolved measurement tokens: {sorted(set(leftover))}"
        return text

    for placeholder, content in [
        ("__VERDICT__", VERDICT),
        ("__BASE_RADIX__", BASE_RADIX.replace("__PROBE__", render_probe(probe_rows, probe_prov))),
        ("__SHADCN__", SHADCN),
        ("__TAILWIND__", TAILWIND),
        ("__M3__", M3),
        ("__FOXGLOVE__", FOXGLOVE),
        ("__RERUN__", RERUN),
        ("__RECOMMENDATION__", RECOMMENDATION),
        ("__NOT_RECOMMENDED__", NOT_RECOMMENDED),
        ("__SOURCES__", sources_html),
    ]:
        page = page.replace(placeholder, cite(content) if placeholder != "__SOURCES__" else content)

    page = fill(page)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)

    # Self-check: the citation mechanics an adversarial review confirmed once and that a
    # rewrite is the likeliest thing to break.
    ids = set(re.findall(r'id="(s\d+)"', page))
    refs = set(re.findall(r'href="#(s\d+)"', page))
    assert not refs - ids, f"dangling citations: {sorted(refs - ids)}"
    assert not ids - refs, f"uncited sources: {sorted(ids - refs, key=lambda s: int(s[1:]))}"
    assert "data:" not in page, "report must stay in the tracked half of reports/"

    size = OUT.stat().st_size
    print(f"wrote {OUT} ({size:,} bytes, 0 data: URIs, {len(ids)} sources, "
          f"{len(re.findall(r'href=.#s[0-9]+.', page))} anchors)")
    print(f"  dismissal probe: {probe_prov} — {len(probe_rows)} scenarios")
    print("  measured: " + ", ".join(f"{k}={v}" for k, v in sorted(m.items())
                                     if k != "radix_version"))


if __name__ == "__main__":
    build()
