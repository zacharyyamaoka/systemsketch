---
title: LabVIEW, Unreal Blueprint & Simulink — Vocabulary and UI Controls Gap Analysis
subtitle: Deep-research dictionary
date: 2026-09-04
work_order_date: 2026-09-03
status: research-only
canonical_artifact: SystemSketch repository source report
scope: Python-source renderer, not an authoring-first node palette
---

# LabVIEW, Unreal Blueprint & Simulink — Vocabulary and UI Controls Gap Analysis

## Bottom line

SystemSketch should borrow the mature tools' *reading constraints*, never their
graph-authoring authority. The stock Split block already covers named record
projection. Zach has approved three further stock directions: a batched named
partial-record update, a three-input conditional Select, and a visible
Clock/Trigger source. The positive vocabulary work is deliberately narrow:
port-owned semantic roles inherited by ordinary arrows, plus a source-proven
dashed async arrow. The positive editor-chrome work is similarly narrow:
composable depth breadcrumbs and visit history, bounded propagation focus,
source-aware inspection/navigation once pyblocks supplies real facts, and—only
after a real adapter—run and trace lenses.

Errors, events, state, configuration, control, and ordinary data do **not**
need different transport systems. They are values moving on the same ordinary
arrow/data-wire grammar. `Data` is the default semantic role; `Event`,
`Configuration`, `State`, `Control`, and `Error` are accepted preset roles. A
role is authored or derived once on its port and every connected wire inherits
it live; the wire does not store a duplicate setting.
An Error value may travel through an ordinary tunnel or common bus. An Event is
ordinary emitted data, not a dispatcher relation. Async is a direct dashed
ordinary data arrow—not a queue diamond, junction, ownership hub, or
invented execution topology.

This is an evidence-first dictionary, not prose arranged around open questions.
Every useful entry is ordered as: text description, real official-tool
screenshot(s), original SystemSketch drawing description, then lift. The HTML
companion embeds the actual official captures alongside its original SVG
projections. This Markdown is the canonical source report here because this
repository is the permitted scope for the work.

## Research lineage

The report history is intentionally durable. The [original narrative report](history/labview-blueprint-simulink-gap-analysis/r1-original-01f2f30.html),
the [first dictionary](history/labview-blueprint-simulink-gap-analysis/r2-dictionary-acc1663.html),
the [editor-chrome revision Zach reviewed](history/labview-blueprint-simulink-gap-analysis/r3-editor-chrome-3caa496.html),
and [Zach's feedback and supplied crops](history/labview-blueprint-simulink-gap-analysis/feedback-2026-09-04.md)
remain available unchanged. The [history hub](history/labview-blueprint-simulink-gap-analysis/index.html)
links the complete sequence and this current incorporated revision.

## Reading key

The dictionaries intentionally split two decisions:

- **Track A — vocabulary** asks whether a source-recognisable Python fact needs
  a Block, region, source, port, or cable treatment.
- **Track B — controls and chrome** asks whether a surrounding UI surface helps
  reveal source truth without turning the canvas into an IDE, simulator, or
  second program.

Within each track, the buckets have a strict meaning:

- **Already have**: a brief description plus a real current-SystemSketch
  capture and a code seam. No hypothetical drawing is needed.
- **Missing, would be useful**: the complete four-part evidence row, in the
  fixed order above.
- **Missing, would not be useful**: text only. These are deliberate exclusions,
  so a vendor screenshot or an attractive proposal drawing would be misleading.

## Current SystemSketch baseline

| Existing reading primitive or chrome surface | Current SystemSketch capture | Primary seam |
| --- | --- | --- |
| Exclusive paths and visible join | `docs/assets/branch-region-3-wired.png` | `src/branch/branchModel.ts` |
| Loop-carried previous value | `docs/assets/loop-region-acceptance.png` | `src/loop/loopModel.ts` |
| Stock Split projection/accessor rows | `docs/assets/unknown-projection-picker-open.png`, `docs/assets/unknown-projection-accessors.png` | `src/blocks/connections/blockPicker.ts`, `src/blocks/unknownAndProjection.test.ts` |
| Ordinary edges and tunnels | `docs/assets/edge-tunnel-inspector-live-2026-09-02.png` | `src/blocks/connections/connectionModel.ts` |
| Derived mutation-effect exit | `docs/assets/effect-ports-3-wired-2026-09-03.png` | `src/blocks/effectPorts.ts` |
| Reversible Simple/Port/Expanded density, focused interface, and port placement | `docs/assets/block-collapse-port-2026-09-01.png`, `docs/assets/block-collapse-expanded-2026-09-01.png`, `docs/assets/header-port-rows-product-2026-09-01.png` | `src/blocks/blockVisibility.ts`, `src/blocks/blockModel.ts` |
| Default pill and wired override | `docs/assets/literal-pill-product.png`, `docs/assets/literal-pill-wired.png` | `src/blocks/blockModel.ts`, `src/blocks/connections/connectionModel.ts` |
| Variadic groups | `docs/assets/variadic-port-v5-inspector-live.png` | `src/blocks/variadicPorts.ts` |
| Menu, file lifecycle, and share | `docs/assets/workspace-file-menu.png` | `src/workspace/LocalWorkspace.tsx` |
| Semantic toolbar and layout actions | `docs/assets/toolbar-family-menu-open.png`, `docs/assets/layout-commands-live-organized-2026-09-02.png` | `src/toolbar/SystemSketchToolbar.tsx`, `src/chrome/SelectionLayoutActions.tsx` |
| Command palette and text Find/Replace | `docs/assets/command-palette-commands-2026-09-02.png`, `docs/assets/command-palette-find-replace-2026-09-02.png` | `src/commands/SystemSketchCommandPalette.tsx`, `src/commands/boardSearch.ts` |
| Searchable library and semantic Block picker | `docs/assets/library-overview-library-2026-09-02.png`, `docs/assets/unknown-projection-picker-open.png` | `src/library/ShapeLibraryBrowser.tsx`, `src/blocks/connections/blockPicker.ts` |
| Inspector, Problems, comments, overview, depth, zoom | `docs/assets/inspector-field-guidance-2026-09-03.png`, `docs/assets/board-diagnostics-problems-2026-09-02.png`, `docs/assets/library-overview-panel-2026-09-02.png`, `docs/assets/zoom-controls-shown.png` | `src/blocks/ui/BlockInspector.tsx`, `src/diagnostics/BoardDiagnosticsPanel.tsx`, `src/chrome/BoardOverview.tsx`, `src/SystemSketchUtilities.tsx` |
| Preview diff states and inline value changes | `docs/assets/diff-states-marked.png` | `src/blocks/diffState.ts` |

The audit corrects two prior overstatements. Split is already a shipped stock
preset, with source/type propagation coverage. Likewise, required input, visible
default, wired override, and resolved variadic parameter groups already have
working UI. The useful work is not to recreate those controls, but to make their
semantic facts more inspectable where a real source index supports it.

---

# Track A — vocabulary dictionary

## Already have

### Exclusive branch / case / φ join

**Text description.** Python `if` and `match` already read as an exclusive
Branch region with a join. LabVIEW Case, Blueprint Branch/Switch, and Simulink
If/Merge confirm the reading need; they do not justify a new palette node or an
execution-wire language.

**Current SystemSketch evidence.** `docs/assets/branch-region-3-wired.png`
shows the live Branch region and `src/branch/branchModel.ts` owns the seam.
Calibration sources: [NI Case Structures][1], [Epic Flow Control][19], and
[MathWorks If][41].

### Loop-carried previous value / delayed edge

**Text description.** A loop-carried value already has a distinct `z⁻¹`
treatment, so a prior iteration does not read like same-iteration data.
LabVIEW Feedback and Simulink Unit Delay corroborate the reader constraint while
their simulation-time behavior stays outside ordinary Python.

**Current SystemSketch evidence.** `docs/assets/loop-region-acceptance.png`
shows the live loop treatment; `src/loop/loopModel.ts` is the seam. Calibration:
[NI Feedback Node][2] and [MathWorks Unit Delay][60].

### Named record-field projection / Split

**Text description.** The stock **Split** preset already projects a resolved
record into name-stable accessor rows. This is the existing SystemSketch
equivalent of Unbundle By Name, Split Struct Pin, and Bus Selector; the earlier
report incorrectly called it a draft direction.

**Current SystemSketch evidence.** `docs/assets/unknown-projection-picker-open.png`
shows the stock Split preset and
`docs/assets/unknown-projection-accessors.png` shows named accessor rows with
propagated types. The preset is in `src/blocks/connections/blockPicker.ts`; the
accessor/type behavior is covered in `src/blocks/unknownAndProjection.test.ts`.
Calibration: [NI Unbundle By Name][3], [Epic Struct Variables][18], and
[MathWorks Bus Selector][58].

### Ordinary data paths for Event, Error, State, and Configuration values

**Text description.** These meanings do not require another transport. A typed
value already travels through an ordinary arrow or tunnel to a handler, bus, or
component. What remains useful is a small semantic role label on that same
path—not a bespoke event dispatcher, state wire, or exception rail.

**Current SystemSketch evidence.** `docs/assets/edge-tunnel-inspector-live-2026-09-02.png`
shows the existing ordinary edge/tunnel grammar; the seam is
`src/blocks/connections/connectionModel.ts`. Reference calibration: [NI
Handling Errors][5] and [MathWorks Signal Types][40].

### Normal return versus derived mutation effect

**Text description.** A port declared mutating already derives a top-edge effect
exit, keeping an in-place-looking write from reading like an ordinary returned
value. This is a mutation reading aid only: it must not be repurposed as an
exception, outcome, event, or Error transport.

**Current SystemSketch evidence.** `docs/assets/effect-ports-3-wired-2026-09-03.png`
shows the live top-edge effect exit; `src/blocks/effectPorts.ts` is the seam.
The useful precedent is Blueprint's pure/impure distinction in [Epic
Functions][20], not an execution-cable import.

## Missing, would be useful

### Named partial record update / Set attributes

**Text description.** Bundle By Name, Set Members in Struct, and Bus Assignment
converge on one readable operation: update selected named members while retaining
the rest. Zach approved shipping the already-designed batched `setattr` form as a
stock Block with ordinary record data in and out; it must distinguish a direct
update, an immutable replacement, and an opaque helper call rather than pretend
they are one operation.

**Real screenshot(s).** `docs/assets/gap-labview-bundle-by-name-2026-09-03.png`
is captured from [NI Bundle By Name][4];
`docs/assets/gap-blueprint-set-members-2026-09-03.png` is from [Epic Struct
Variables][18]; and `docs/assets/gap-simulink-bus-assignment-2026-09-03.png` is
from [MathWorks Bus Assignment][59]. The three official tools all retain an
aggregate while exposing exactly which named members are changed.

**Original SystemSketch drawing description.** A stock `Set attributes` Block
has one normal record input and one normal record output. Its body lists only
source-proven named writes such as `.quota = 9`; a small mutation cue may explain
a known in-place write, but every record value remains on the ordinary data
plane. It is a source projection, not an editable struct schema.

**Lift.** **Medium.** The visual design and product direction exist; shipping
needs a stock preset, named-row rendering, conservative direct-syntax and helper
recognition, and regression coverage for batched writes and preserved members.

### Conditional value selection / Select

**Text description.** LabVIEW Select and Simulink Switch make a value choice
read differently from an effectful branch. Zach approved a stock Select Block
for Python `true_value if condition else false_value`: exactly two value inputs,
one control input, and one ordinary value output.

**Real screenshot(s).** `docs/assets/gap-labview-select-2026-09-03.png` is from
[NI Select][6], and `docs/assets/gap-simulink-switch-2026-09-03.png` is from
[MathWorks Switch][37]. [Epic Make Select][64] documents the same `Condition`,
`If True`, and `If False` contract, but that official API page does not publish
a graph screenshot; this entry does not substitute a documentation table for
actual tool UI. The evidence supports compact value selection, not a second
execution wire.

**Original SystemSketch drawing description.** A compact `Select` Block shows
`true`, `false`, and `condition` rows on the left, one normal result port on the
right, and a small Control tag on the condition port. The source spelling stays
visible under the title. It has no execution pins, join region, or authorable
switch cases.

**Lift.** **Low to medium.** Add the stock preset and source projection, test
that it remains distinct from a Branch region, and fall back honestly for
conditional expressions that cannot be resolved.

### Analyzer-recognised asynchronous data path

**Text description.** An async queue handoff or `await` boundary can deserve a
redundant cable cue only when source proves it. SystemSketch should use the
existing dashed treatment on a direct ordinary data arrow, with no queue
box, junction, ownership topology, buffering claim, or global timeline.

**Real screenshot(s).** `docs/assets/gap-labview-async-channel-2026-09-03.png`
is captured from [NI Using Wires][7].
`docs/assets/gap-simulink-function-call-2026-09-03.png` is captured from
[MathWorks Model Reference Function-Call][38]. In that MathWorks example, E1 and
E2 are periodic function-call control signals and E3 is driven by an
asynchronous interrupt; it is not evidence that every async payload is a
function-call cable.

**Original SystemSketch drawing description.** Keep the same source Blocks and
ordinary endpoint ports. Draw one direct dashed normal arrow between them and
apply `Data` unless a separately proven semantic role says `Event` or `Control`.
The Inspector can say which source pattern earned the cue and explicitly leave
ordering, cancellation, and ownership unknown.

**Lift.** **Medium to high.** The rendering already exists. The hard part is a
conservative analyzer fact for one initial idiom—such as a direct `asyncio.Queue`
pair or explicit await—and truthful inspection rather than broad thread or
callback inference.

### Clock / Trigger stock source

**Text description.** A visible Clock or Trigger source makes a real periodic or
external activation legible without hiding scheduling inside a downstream Block.
It emits an ordinary typed value: time remains `Data`; an activation can be
`Control` or `Event`. A visual source alone must not imply a scheduler, solver,
or runtime exists.

**Real screenshot(s).** `docs/assets/gap-labview-timed-loop-2026-09-04.png` is
from [NI Timing and Synchronization][8].
`docs/assets/gap-simulink-function-call-2026-09-03.png` is from [MathWorks Model
Reference Function-Call][38], with [MathWorks Function-Call Generator][39] as
the dedicated source reference. The screenshots calibrate visible source/timing
intent; their host schedulers do not transfer.

**Original SystemSketch drawing description.** A source Block labeled `Clock`,
`Tick`, or a resolved external trigger has one ordinary output. A Clock uses the
default `Data` tag and an explicit time/rate label; a trigger gets `Control` or
`Event`. Any dashed edge remains a direct source-proven async path, never a
timer-junction or periodic execution timeline.

**Lift.** **Medium.** Define stock source fields and an explicit runtime-adapter
contract, then recognise only clear source forms. Do not claim that drawing
`10 Hz` creates a scheduler.

## Missing, would not be useful

### Explicit exception / Cast Failed / railway outcome rail

Exceptions, narrowing failures such as Blueprint `Cast Failed`, and
railway-style outcomes are ordinary data in SystemSketch. Route an Error-tagged
value through ordinary arrows or tunnels to a handler or common bus; do not
reuse the mutation-effect exit or add a special failure pin to every call. See
[NI Handling Errors][5], [Epic Blueprint Communications][23], and [Epic Cast To
GameInstance][66].

### Bespoke event-dispatch relation

An Event is a value—often carrying type, time, payload, or timeout—and follows
ordinary dataflow. A preset Event tag explains that meaning without dispatcher
nodes, registration cables, or a second execution model. The excluded
tool-specific mechanisms are documented by [NI Event Structure][65], [Epic Bind
and Unbind Events][67], and [MathWorks Stateflow Events][72].

### Derived state-machine or statechart overlay

State/configuration values and their actual dataflow already express the useful
model. Do not infer a Stateflow-style chart from enum-and-conditional code;
statechart overlay research is explicitly out of scope now ([MathWorks Stateflow
States][71]).

### Arithmetic, comparisons, collections, and signal-routing palettes

LabVIEW numeric/Boolean, Blueprint Array/Map/Set, and Simulink routing palettes
are authoring conveniences. Python already states operators, calls, indexing,
unpacking, and construction; special glyph libraries would add a second language.
See [NI Block Diagram Explained][11], [Epic Blueprint Palette][26], and
[MathWorks Library Browser][46].

### Implicit Sequence, Gate, DoOnce, Delay, and scheduler controls

These encode tool-specific pulses, latches, wall-clock policy, or simulator
scheduling without a source-owned value. Preserve explicit Python order; this
exclusion does not apply to the visible source-proven Clock/Trigger above. See
[Epic Flow Control][19].

### Formula/MATLAB Function, macros, and authorable interface subgraphs

These are text escape hatches or reusable graph-authoring systems. Python and
linked definitions are already the canonical source and presentation seam. See
[MathWorks MATLAB Function][74], [Epic Blueprint Macros][75], and [MathWorks
Subsystem][42].

### Property/Invoke, variants, construction/spawn, hardware, and runtime palettes

Framework APIs, Unreal lifecycle nodes, LabVIEW hardware controls, and Simulink
time/sample-rate configuration belong to their hosts. They are ordinary Python
calls or deliberately outside a static Python renderer. The host surfaces are
visible in [NI Block Diagram Explained][11], [Epic Blueprint Class Editor User
Interface][22], and [MathWorks Simulink Editor][44].

### State history junctions and visual variant pickers

History restoration and variant activation have specialised runtime contracts but
no dependable generic Python syntax. Do not infer hidden statechart memory or add
a canvas-side configuration picker. See [MathWorks History Junctions][76] and
[MathWorks Variant Manager][77].

---

# Track B — UI controls and editor-chrome dictionary

## Already have

### Simple / Port / Expanded presentation

**Text description.** Compactness is already reversible presentation: Simple,
Port, and Expanded views change density without deleting source-derived
relationships. Vendor icon/collapse/subsystem treatments are convergence
evidence, not a license for new nested graph semantics.

**Current SystemSketch evidence.** `docs/assets/block-collapse-simple-2026-09-01.png`,
`docs/assets/block-collapse-port-2026-09-01.png`, and
`docs/assets/block-collapse-expanded-2026-09-01.png` show the current views.
The seam is `src/blocks/blockVisibility.ts`; calibration: [NI View As Icon][10],
[Epic Collapsing Graphs][21], and [MathWorks Subsystem][42].

### Manual port visibility and row placement

**Text description.** A port can already live in a header row, body row, or
hidden state. This changes readability without changing Python's callable
interface—the useful analogue of source-derived pin exposure, not visual
signature authoring.

**Current SystemSketch evidence.** `docs/assets/header-port-rows-product-2026-09-01.png`
shows the current treatment; `src/blocks/blockModel.ts` owns it. The associated
Inspector UI is in `src/blocks/ui/BlockInspector.tsx`. Calibration: [Epic Struct
Variables][18] and [MathWorks Connect Subsystems][43].

### Required input, visible default, and wired override

**Text description.** An empty input already reads as required, a literal/default
pill shows the value that will be used, and a connected cable visibly overrides
it. A standalone keyword-only or recommended-terminal badge would add little to
this existing contract.

**Current SystemSketch evidence.** `docs/assets/literal-pill-product.png` shows
the unwired pill and `docs/assets/literal-pill-wired.png` shows the cable
override. Seams: `src/blocks/blockModel.ts` and
`src/blocks/connections/connectionModel.ts`. [NI terminal categories][9] and
[Epic Functions][20] are calibration, not a new policy.

### Variadic parameter groups

**Text description.** Resolved `*args` and `**kwargs` already ship as real,
cableable parameter groups with Inspector support. The earlier variadic proposal
is obsolete; SystemSketch does not need Blueprint's authoring-time Add Pin
control.

**Current SystemSketch evidence.** `docs/assets/variadic-port-v5-inspector-live.png`
shows the live UI and `src/blocks/variadicPorts.ts` owns the seam. [Epic
Functions][20] is interface calibration only.

### Main menu, local files, autosave, and share

**Text description.** SystemSketch already has the ordinary application commands
that editor chrome needs: new/open/open recent/save-copy, local workspace
lifecycle, autosave, portable share, and stock undo/redo. A second File/Edit/View
menu bar would duplicate the existing surface.

**Current SystemSketch evidence.** `docs/assets/workspace-file-menu.png` shows
the current menu; `src/workspace/LocalWorkspace.tsx` is the seam. Reference
calibration: [Epic Blueprint Editor Menu][22] and [MathWorks Simulink
Editor][44].

### Semantic toolbar and contextual layout actions

**Text description.** The bottom toolbar groups stock drawing tools with Block,
Branch, Loop, and Pill creation. Selection-scoped menus already expose
appearance, port/view controls, Tidy edges, Organize nodes, wrapping, alignment,
and distribution behavior; a permanent LabVIEW/Simulink formatting ribbon is not
a gap.

**Current SystemSketch evidence.** `docs/assets/toolbar-family-menu-open.png`
and `docs/assets/layout-commands-live-organized-2026-09-02.png` show the live
surfaces. Seams: `src/toolbar/SystemSketchToolbar.tsx` and
`src/chrome/SelectionLayoutActions.tsx`. Calibration: [NI Block Diagram
Explained][11] and [MathWorks Simulink Editor][44].

### Command palette and board Find / Replace

**Text description.** Ctrl+P already searches commands and Ctrl+F already finds
and replaces editable board text. This covers the useful core of LabVIEW Quick
Drop and generic action search; identity-aware references are a separate gap.

**Current SystemSketch evidence.** `docs/assets/command-palette-commands-2026-09-02.png`
and `docs/assets/command-palette-find-replace-2026-09-02.png` show the current
surfaces. Seams: `src/commands/SystemSketchCommandPalette.tsx` and
`src/commands/boardSearch.ts`. Calibration: [NI Quick Drop][13], [Epic Blueprint
Search][25], and [MathWorks action search][45].

### Searchable shapes and insertion library

**Text description.** The Shapes library is categorised, searchable, and
recent-aware; the on-canvas picker supplies semantic stock Block presets.
SystemSketch does not need a duplicate Functions, Blueprint Palette, or Simulink
Library Browser catalog.

**Current SystemSketch evidence.** `docs/assets/library-overview-library-2026-09-02.png`
and `docs/assets/unknown-projection-picker-open.png` show the live library and
picker. Seams: `src/library/ShapeLibraryBrowser.tsx` and
`src/blocks/connections/blockPicker.ts`. Calibration: [NI Block Diagram
Explained][11], [Epic Blueprint Palette][26], and [MathWorks Library Browser][46].

### Selection-following Inspector with Details / Notes

**Text description.** The right Inspector already follows Blocks, Branches,
Loops, connections, ordinary shapes, and batch selections. Block inspection
already has Details and Notes; the useful delta is source provenance and clearer
sibling dock tabs, not a second property system.

**Current SystemSketch evidence.** `docs/assets/inspector-field-guidance-2026-09-03.png`
shows the live Inspector; `src/blocks/ui/BlockInspector.tsx` is the seam.
Calibration: [Epic Details Panel][27] and [MathWorks Property Inspector][47].

### Problems panel with severity, codes, and canvas focus

**Text description.** The Problems dock already counts and filters errors and
warnings, gives each finding a stable code, and focuses the affected board
object. Source-span navigation is the narrow missing delta—not a clone of
Compiler Results or Diagnostic Viewer.

**Current SystemSketch evidence.** `docs/assets/board-diagnostics-problems-2026-09-02.png`
shows the current dock; `src/diagnostics/BoardDiagnosticsPanel.tsx` is the seam.
Calibration: [Epic Compiler Results][28] and [MathWorks Diagnostic Viewer][48].

### Board Overview, depth navigation, and zoom

**Text description.** Board Overview lists Frames, Branches, and Expanded Blocks
and can focus them; the depth stack jumps to ancestors and steps out; stock
zoom/fit/minimap controls cover camera navigation. This already answers the
generic Model Browser or Navigation Window need for the current board.

**Current SystemSketch evidence.** `docs/assets/library-overview-panel-2026-09-02.png`
and `docs/assets/zoom-controls-shown.png` show the relevant UI. Seams:
`src/chrome/BoardOverview.tsx`, `src/depth/DepthStackNavigator.tsx`, and
`src/SystemSketchUtilities.tsx`. Calibration: [Epic Graph Editor][30] and
[MathWorks Simulink Editor][44].

### Anchored comments and source references

**Text description.** Local comments already anchor to a block, point, region, or
page and can retain a source reference. They preserve durable identity beyond a
loose visual comment box without inventing a semantic node.

**Current SystemSketch evidence.** `docs/assets/repo-improvements-local-comments.png`
shows the current surface; `src/comments/commentModel.ts` owns it. Calibration:
[Epic Comments][31] and [MathWorks Block Comments][49].

### Preview diff states and intra-value changes

**Text description.** SystemSketch already marks added, removed, and changed
Block/port/cable facts and can show inline before→after value changes under the
Preview/Stable review controls. Simulink Model Comparison confirms the reader
need; selecting arbitrary saved versions is a separate workflow question, not a
missing visual vocabulary.

**Current SystemSketch evidence.** `docs/assets/diff-states-marked.png` shows
the live review state and inline value change; `src/blocks/diffState.ts` is the
seam. Calibration: [MathWorks Model Comparison][61].

### Async edge styling as presentation vocabulary

**Text description.** The current async edge treatment is a useful visual
distinction but is presentation-only today. Track A identifies the missing
analyzer fact needed before a dashed edge truthfully carries semantic meaning.

**Current SystemSketch evidence.** `docs/assets/async-edge-style-acceptance.png`
shows the current styling; `src/blocks/connections/connectionModel.ts` is the
seam. Calibration: [NI Using Wires][7].

### Focused component-interface lens

**Text description.** SystemSketch's existing Port view already hides Block
internals while preserving its input/output boundary, and Expanded view reveals
the underlying dataflow when needed. That reversible presentation is the useful
component-interface lens; a second canonical-interface panel would duplicate it.

**Current SystemSketch evidence.** `docs/assets/block-collapse-port-2026-09-01.png`
shows Port view retaining the public boundary while hiding internals;
`src/blocks/blockVisibility.ts` is the seam. Calibration: [MathWorks Component
Interface View][53], [NI Icon and Connector Panes][63], and [Epic Functions][20].

## Missing, would be useful

### Preset semantic role tags on ordinary ports and wires

**Text description.** Author a role once on a port and let every connected wire
inherit it live. The accepted set is `Data` (implicit default), `Event`,
`Configuration`, `State`, `Control`, and `Error`. These labels explain the same
ordinary dataflow; they never create an exception rail, event dispatcher, state
machine, or second transport.

**Real screenshot(s).** `docs/assets/gap-labview-error-wire-2026-09-03.png` is
from [NI Handling Errors][5]; `docs/assets/gap-blueprint-cast-failure-2026-09-03.png`
is from [Epic Blueprint Communications][23]; and
`docs/assets/gap-simulink-function-call-2026-09-03.png` is from [MathWorks Model
Reference Function-Call][38]. They establish why visible outcome and control
meaning help readers. SystemSketch takes only the shared semantic-label idea,
not their special wire shapes or dispatcher mechanisms.

**Original SystemSketch drawing description.** Each Inspector port row owns an
optional role claim; Data stays quiet while non-Data roles receive a redundant
text chip and accessible name. A connected wire derives that effective role and
its Inspector says, for example, `Inherited from publisher.saved`. An authored
claim may override a source/analyzer claim without deleting its provenance. If
explicit endpoints disagree, the cable remains legal and shows the mismatch.

**Lift.** **Medium.** Add per-port authored and derived claims with retained
provenance; derive wire presentation rather than copying it. Source wins over
sink when both are explicit, but a mismatch becomes a warning. Role remains
orthogonal to type colour, async/delayed style, mutation, routing, and execution.

### Contextual source / provenance lens

**Text description.** LabVIEW Context Help, Blueprint Details, and Simulink
Property Inspector keep explanation near the current selection. Zach approved a
nearby, read-only Source section: projection kind, declaration/span, canonical
definition, occurrences/uses, documentation, default provenance, and the
meaning/proof of any semantic role.

**Real screenshot(s).** `docs/assets/gap-ui-labview-context-help-2026-09-04.png`
is from [NI Context Help guidance][14];
`docs/assets/gap-ui-blueprint-details-2026-09-04.png` is from [Epic Details
Panel][27]; and `docs/assets/gap-ui-simulink-property-inspector-2026-09-04.png`
is from [MathWorks Property Inspector][47]. All are official examples of
selection-following explanation; none author Python source.

**Original SystemSketch drawing description.** Add a `Source` tab beside Details
and Notes. Its compact card lists the projection name, source file/span,
definition identity, docstring, tag evidence, and navigation actions. It is
read-only explanatory chrome over an existing selection, never a Simulink mask
or property-editor program.

**Lift.** **Medium, pyblocks phase.** The panel reuses shipped Inspector chrome,
but trustworthy analyzer provenance, definition linking, source-open plumbing,
and safe unknown/stale-span states must arrive with real Python integration.

### Source project, definition, and occurrence navigator

**Text description.** LabVIEW Project Explorer, My Blueprint, and Model Browser
converge on a searchable hierarchy outside the canvas. Board Overview already
covers board structure; the missing sibling becomes useful when pyblocks is
connected to a real Python project: a Python-owned, read-only tree from
files/modules to definitions, callers/occurrences, and current projections.

**Real screenshot(s).** `docs/assets/gap-ui-labview-project-explorer-2026-09-04.png`
is from [NI Project Explorer guidance][15];
`docs/assets/gap-ui-blueprint-my-blueprint-2026-09-04.png` is from [Epic My
Blueprint Panel][29]; and `docs/assets/gap-ui-simulink-model-browser-2026-09-04.png`
is from [MathWorks Model Browser][50]. The common insight is navigation through
named identity; the host tools' mutable project/deployment semantics do not
transfer.

**Original SystemSketch drawing description.** A right-dock `Source` tree groups
workspace → module → definition → occurrence. Selecting an occurrence focuses
the existing Block or source span; selecting a definition reveals linked
occurrences. The tree cannot create files, definitions, targets, or source
control changes.

**Lift.** **Medium to high, pyblocks phase.** Requires a stable source/symbol
index and durable occurrence identity, plus sensible scope and stale-index
behavior. It must remain read-only and not become a parallel project model.

### Semantic symbol and Find References search

**Text description.** Shipped Ctrl+F finds editable board text. This adds
identity-aware filters/results for definitions, linked occurrences, ports,
types, defaults, roles, and references. Zach considers it reasonable but not
urgent. Same spelling is not enough: the result must name the semantic object
and let a reader select/fit an occurrence or reveal its source span.

**Real screenshot(s).** `docs/assets/gap-ui-labview-quick-drop-2026-09-04.png`
is from [NI Quick Drop][13]; `docs/assets/gap-ui-blueprint-find-results-2026-09-04.png`
is from [Epic Find Result Panel][24]; and `docs/assets/gap-ui-simulink-finder-2026-09-04.png`
is from [MathWorks Finder][51]. The vendor UI demonstrates rapid named search;
SystemSketch's added constraint is a Python-owned symbol identity.

**Original SystemSketch drawing description.** Reuse the command-palette shell
with a `References` result mode. Each row identifies kind, definition path,
source span, and board occurrence count, with compact scope pills for current
depth, board, and workspace. Choosing a row focuses an existing object instead
of manufacturing a new graph tab.

**Lift.** **Medium to high, pyblocks phase.** The result UI can reuse Ctrl+P,
but reliable semantic/projection indexing and scope rules are prerequisite.

### Source-linked Problems actions

**Text description.** SystemSketch already models optional source path, symbol,
and line spans in diagnostics but does not surface them. Zach approved Canvas
and Source destinations once pyblocks supplies real spans. Missing or stale
facts must hide the source action rather than manufacture a link.

**Real screenshot(s).** `docs/assets/gap-ui-labview-error-list-2026-09-04.png`
is from [NI Debugging Techniques][16];
`docs/assets/gap-ui-blueprint-compiler-results-2026-09-04.png` is from [Epic
Compiler Results][28]; and `docs/assets/gap-ui-simulink-diagnostic-viewer-2026-09-04.png`
is from [MathWorks Diagnostic Viewer][48]. These demonstrate a diagnostic's
useful destinations, not their host compilers.

**Original SystemSketch drawing description.** Each Problems row retains the
existing severity and stable code, then exposes two honest actions: `Canvas` to
focus the projected object and `Source` to open the supplied source span. A
missing or stale span hides the source action rather than creating a false link.

**Lift.** **Small to medium, pyblocks phase.**
`src/diagnostics/diagnosticsModel.ts` already reserves source path/symbol/span
fields. Add guarded rendering, source-open behavior, and tests for missing,
stale, and valid spans.

### Stable right-dock tabs

**Text description.** SystemSketch owns Inspector, Problems, Comments, and Board
Overview surfaces. Blueprint and Simulink show why sibling panes can be
discoverable, but Zach is comfortable with the current FigJam-inspired
transient presentation for now. A compact tab row is later UI experimentation,
not a semantic prerequisite.

**Real screenshot(s).** `docs/assets/gap-ui-blueprint-graph-editor-2026-09-04.png`
is from [Epic Graph Editor][30], and
`docs/assets/gap-ui-simulink-property-inspector-2026-09-04.png` is from
[MathWorks Property Inspector][47]. They are evidence for discoverable sibling
surfaces, not for reproducing an entire host layout manager.

**Original SystemSketch drawing description.** One right dock has a restrained
tab strip—`Inspect`, `Problems`, `Comments`, `Overview`, then future
source-oriented tabs. The current Inspector continues to follow selection; the
rest retain their existing content and collapse responsively.

**Lift.** **Medium, deferred UI.** If prototyped, consolidate current surfaces
behind one tab model while preserving keyboard order, dismiss semantics,
responsive behavior, and selection-following Inspector behavior.

### Named local review landmarks / saved views

**Text description.** Blueprint bookmarks and Simulink viewmarks preserve a
graph/hierarchy location, camera position, and zoom. Named personal review points
near Board Overview would help a large board be revisited without abusing
comments or duplicating boards.

**Real screenshot(s).** `docs/assets/gap-ui-blueprint-bookmarks-2026-09-04.png`
is from [Epic Blueprint Bookmarks][32], and
`docs/assets/gap-ui-simulink-viewmarks-2026-09-04.png` is from [MathWorks
Bookmark Your Place][52]. Both establish the navigation idea, not a source
semantic.

**Original SystemSketch drawing description.** A small `Landmarks` list names
camera/depth targets such as “Retry loop” or “Output adapters.” Activating one
fits the existing target without changing selection; a `Save current view` action
stores presentation state only.

**Lift.** **Low to medium.** Persist board identity, depth scope, camera, and an
optional target shape locally; define stale-target fallback and keep landmarks out
of shared source truth.

### Back / Forward navigation history and scope breadcrumb

**Text description.** Zach strongly approved prototyping an always-legible
depth breadcrumb with selectable ancestors and the top-level system name. It
composes with existing Step In/Out rather than replacing isolation: crumbs and
Up navigate structural ancestry, while session-local Back/Forward replay
chronological visits after depth, overview, search, source, or landmark jumps.

**Real screenshot(s).** `docs/assets/gap-ui-blueprint-graph-editor-2026-09-04.png`
is from [Epic Graph Editor][30], and
`docs/assets/gap-ui-simulink-editor-2026-09-04.png` is from [MathWorks Simulink
Editor][44]. These distinguish transient navigation history from a document model.

**Original SystemSketch drawing description.** One compact row reads
`← → ↑  top-level system › ancestor › current`. Root and current remain visible;
only middle crumbs collapse into overflow at narrow widths. Step In still owns
isolation. Up/crumb buttons choose structure; Back/Forward replay visits and
restore a safe camera/selection snapshot.

**Lift.** **Small to medium; approved prototype.** Replace only the collapsed
Depth Stack presentation, preserve shared Step In behavior, route Board Overview
through the same depth-aware history transaction, and skip deleted targets. The
Simulink **SIMULATE** Step Back/Forward controls are runtime evidence, not editor
navigation precedent.

### Bounded forward / backward propagation focus

**Text description.** A reader can select a cable, port, or value and ask
SystemSketch to emphasize its real upstream or downstream propagation for a
chosen number of graph steps. Simulink source/destination tracing is useful
precedent, but this is a temporary focus mode over existing edges—not a compiled
signal browser, data table, or simulation.

**Real screenshot(s).** `docs/assets/gap-ui-simulink-signal-hierarchy-2026-09-04.png`
is from [MathWorks Signal Hierarchy Viewer][54]. Its structural reader need
converges with SystemSketch Split; Simulink's simulation analysis does not.

**Original SystemSketch drawing description.** A compact focus shelf appears
for the selected subject with `← 2 steps` and `3 steps →`. The real paths inside
that bound remain vivid while unrelated shapes fade. Clearing focus restores the
untouched board; no highlighted line is authored or persisted.

**Lift.** **Medium; approved prototype.** Reuse resolved connection identity,
walk the real graph in either direction with cycle protection and a visible step
bound, and keep unknown dynamic relations outside the highlight.

### Run / Pause / Stop strip for an explicit runtime adapter

**Text description.** Zach approved the mature-tools pattern: name a run target,
expose state-dependent Run/Pause/Stop controls, and report state outside the
canvas. SystemSketch should adopt it only when an explicit Python/test/ROS
adapter exists; drawing alone must never execute code.

**Real screenshot(s).** `docs/assets/gap-ui-labview-toolbar-2026-09-04.png` is
from [NI Block Diagram Explained][11];
`docs/assets/gap-ui-blueprint-toolbar-2026-09-04.png` is from [Epic Blueprint
Toolbar][33]; and `docs/assets/gap-ui-simulink-editor-2026-09-04.png` is
from [MathWorks Simulink Editor][44]. The captures prove this is editor
chrome, not a static Python fact.

**Original SystemSketch drawing description.** A restrained strip shows the
named adapter/target, revision identity, current state, and Run/Pause/Stop only
when a concrete adapter reports capability. It lives outside the board and
renders no fake execution cables or controls when no adapter is connected.

**Lift.** **Very high and conditional; approved direction.** First define sandboxing, target
discovery, lifecycle, cancellation, stdout/errors, and board/source revision
identity. Do not ship inert play chrome.

### Recorded-trace playback and execution highlighting

**Text description.** Zach approved record/trace/playback as a useful execution
lens. Step and highlight controls are defensible without making the board a
simulator when they replay an explicit recorded trace. The active Block/cable is
temporary and playback acts on evidence, never on source or layout.

**Real screenshot(s).** `docs/assets/gap-ui-labview-debug-window-2026-09-04.png`
is from [NI Debugging Techniques][16];
`docs/assets/gap-ui-blueprint-debugger-2026-09-04.png` is from [Epic Blueprint
Debugger][34]; and `docs/assets/gap-ui-simulink-breakpoints-2026-09-04.png` is
from [MathWorks Breakpoints List][56]. They show why execution context can be
useful, but their live debugger authority does not transfer.

**Original SystemSketch drawing description.** A trace shelf exposes trace name,
event number, play/step controls, and a temporary highlight on mapped existing
Blocks/cables. The highlight disappears with the trace session and is visually
separate from source-derived semantic roles.

**Lift.** **High.** Specify trace-event schema, source-revision matching,
occurrence mapping, temporal controls, and a nonpersistent highlight layer.
Live stepping remains later runtime-adapter work.

### Read-only live or recorded value probes

**Text description.** Zach approved read-only live or recorded probes. LabVIEW
Probe Watch, Blueprint watched pins, and Simulink Data Inspector expose values
produced during a run. A SystemSketch probe may decorate an existing port/cable
only when an explicit run or imported trace supplies it; it is never an editable
literal or canonical board state.

**Real screenshot(s).** `docs/assets/gap-ui-labview-probe-watch-2026-09-04.png`
is from [NI Debugging Techniques][16];
`docs/assets/gap-ui-blueprint-watch-2026-09-04.png` is from [Epic Blueprint
Debugger][34]; and `docs/assets/gap-ui-simulink-data-inspector-2026-09-04.png`
is from [MathWorks Create a Simple Model][55]. They establish the reader benefit of
observed values, not a mandate for a full analysis workbench.

**Original SystemSketch drawing description.** A small non-editable callout on
an existing port/cable shows a captured value, frame/time, and `pin probe` action.
History opens only as trace evidence and is plainly distinct from the existing
literal/default pill.

**Lift.** **High after trace/run work.** Needs value capture, safe
serialization/redaction, source-revision mapping, history limits, and strict
separation from authorable values.

## Missing, would not be useful

### Board-wide semantic data table

A global table of every Block, port, cable, type, default, and semantic role
would create a parallel inventory and is likely to be more confusing than
contextual inspection and bounded propagation focus. Skip it for now; a concrete
batch-update need can reopen the question later. See [MathWorks Model Data
Editor][62].

### Standalone keyword-only or recommended-terminal badges

Empty versus defaulted/wired inputs are already readable, and keyword-only is
not valuable as an isolated UI tier. Python has no LabVIEW recommended-wiring
legality; retain source spelling in the Inspector instead of adding badges. See
[NI terminal categories][9] and [Epic Functions][20].

### Authorable masks, callbacks, class defaults, or GUI type/schema editors

Simulink masks and Type Editor, Blueprint Class Defaults, and LabVIEW property
systems are parallel programming/configuration authorities. SystemSketch may
explain source facts but must not author them in a second UI. See [MathWorks
Dynamic Mask Dialog][73], [MathWorks Type Editor][78], [Epic Blueprint
Defaults][79], and [NI VI Properties][80].

### Wire-driven hiding or canvas-created signature ports

Blueprint can hide unconnected pins and Simulink can add/reposition subsystem
ports because their graphs own the program. Current wiring must not redefine a
Python signature, field schema, or default. See [Epic Struct Variables][18] and
[MathWorks Connect Subsystems][43].

### Second node/function palette

LabVIEW Functions, Blueprint Palette, and Simulink Library Browser are authoring
catalogs. SystemSketch already has a Shapes library and semantic stock Block
picker; Python calls/operators stay source-derived rather than draggable nodes.
See [NI Block Diagram Explained][11], [Epic Blueprint Palette][26], and
[MathWorks Library Browser][46].

### Mutable project, asset, deployment, and source-control manager

LabVIEW targets/build specifications, Unreal Content Browser/source control, and
Simulink project/dependency controls belong to host ecosystems. The useful source
navigator is intentionally read-only. See [NI Project Explorer guidance][15],
[Epic Blueprint Editor Menu][36], and [MathWorks Referenced Files Pane][81].

### Large workflow ribbon, arbitrary docking, and layout reset system

Simulink's broad toolstrip and Unreal's freely dockable shell serve large host
suites. SystemSketch should expose compact contextual commands and a stable dock,
not recreate an IDE shell. See [Epic Blueprint Class Editor User Interface][22]
and [MathWorks Simulink Editor][44].

### Solver, pacing, simulation modes, hardware targets, and deployment

These controls configure numerical simulators or target hardware. Even if an
explicit Run adapter arrives, SystemSketch should not imply solver semantics,
hardware execution, or Blueprint play modes for ordinary Python. See [MathWorks
Simulation Execution][82], [NI Block Diagram Explained][11], and [Epic Blueprint
Toolbar][33].

### Compile / Update Diagram button without a real compiler contract

Blueprint Compile, LabVIEW Broken Run, and Simulink Update Diagram report
tool-owned compilation states. The existing Problems panel should remain
analyzer-driven; an inert Compile button would claim authority it does not have.
See [Epic Blueprint Toolbar][33], [NI Block Diagram Explained][11], and
[MathWorks Simulink Editor][44].

### Full live-instance debugger, breakpoint manager, and debug-object picker

The recorded-trace lens above is intentionally narrower. Per-instance stacks,
breakpoint mutation, possess/eject, scheduler control, and debug-target discovery
require an execution host and should not be imitated as decorative chrome. See
[NI Debugging Techniques][16], [Epic Blueprint Debugger][34], and [MathWorks
Breakpoints List][56].

### Unreal Components, Viewport, Construction Script, and Class modes

These panels author Actor composition, 3D transforms, and lifecycle scripts.
They do not expose generic Python/dataflow facts; Board Overview and Inspector
already supply the transferable hierarchy/selection patterns ([Epic Blueprint
Class Editor User Interface][22]).

### Full time-series analysis and signal-logging workbench

Simulink Data Inspector plots, compares, aligns, and exports simulator runs. A
small read-only probe may be useful, but a numerical analysis suite is a separate
product surface ([MathWorks Simulation Data Inspector][83]).

### Diagnostic suppression, auto-fix, runtime-stage comparison, and global logs

The focused Problems dock is the correct boundary. Toolchain fix buttons,
suppression policies, baseline comparison, compile logs, and runtime consoles
require authority outside the board. See [NI Debugging Techniques][16], [Epic
Compiler Results][28], and [MathWorks Diagnostic Viewer][48].

### Permanent arbitrary graph tabs

Blueprint and Simulink tabs reflect documents owned by those editors. Session
Back/Forward plus source/depth breadcrumbs solve the navigation problem without
introducing a second document model inside a board. See [Epic Graph Editor][30]
and [MathWorks Simulink Editor][44].

---

# Convergence cross-check

| Reader question | Converging reference pattern | SystemSketch translation that preserves Python authority |
| --- | --- | --- |
| How do exclusive paths and a join read? | Case, Branch/Switch, If/Merge | Existing Branch region and source-derived join |
| How does a previous iteration read? | Feedback Node, Unit Delay | Existing loop `z⁻¹` treatment |
| How do named aggregate members read? | Unbundle/Bundle, Struct Split/Set, Bus Selector/Assignment | Shipped Split plus approved stock Set attributes; never an editable struct palette |
| How does a conditional value differ from a branch? | Select, Switch | Approved stock Select with two values and one control input |
| How do errors/events/state/configuration read? | Error dataflow, function-call/event/control contexts | Ordinary arrows/ports with semantic role tags; no rail or dispatcher relation |
| How does asynchronous delivery read? | Channel wire; dash-dot function-call controls | Direct dashed ordinary arrow, never queue topology |
| How do time/trigger sources read? | Timed Loop, Function-Call Generator | Source-proven normal Data/Control/Event output, never scheduler UI |
| How should surrounding editor chrome work? | Context Help/Details/Property Inspector; Explorer/Outline/Browser; Find/Diagnostics | Read-only source/provenance/navigation/search extensions over shipped Inspector, Overview, palette, and Problems seams |
| When can runtime UI transfer? | LabVIEW/Blueprint/Simulink run/debug/probe chrome | Only an explicit adapter and recorded trace earn a narrow non-authoring lens |

# Your thinking, sharpened

1. **Convergence identifies a reader constraint, not permission to clone an
   authoring UI.** Named fields, joins, prior values, source navigation, and
   visible diagnostics recur because readers need them; palette, compile, and
   deployment controls recur because those hosts own a program graph.
2. **Unbundle By Name lands on a shipped Split block.** Its order-independent
   named access is already represented by Split's source-derived accessor rows
   and type propagation—not by a new schema editor.
3. **Bundle By Name supports the approved Set attributes stock block.** The
   valuable reader fact is retained aggregate plus named change; the renderer
   must remain honest about direct update, immutable replacement, and opaque
   helpers.
4. **Select is a compact value primitive, not a branch.** Its settled shape is
   two value inputs plus one control input and one ordinary output.
5. **Tag once at the semantic owner.** Data/Event/Configuration/State/Control/
   Error are port meanings and connected wires inherit them live. An authored
   claim can override a retained derived claim. Errors remain railway data and
   events remain ordinary emitted data; no copied wire setting, special rail,
   top-edge exception effect, or dispatcher relation is warranted.
6. **Async gets no invented topology.** A source-proven dashed direct
   arrow can communicate a handoff or await boundary, but it says nothing about
   queues, ownership, ordering, or a global timeline.
7. **Clock/Trigger is a source concept, not a scheduler UI.** It can show an
   explicit time/control/event value, while rates, solvers, playback, and
   hardware policies stay outside static source rendering.
8. **Structure and visit history are two axes.** Step In remains the isolation
   operation; crumbs and Up navigate ancestry, while Back/Forward replay where
   the reader travelled. Board Overview remains a flat index and participates
   in the same history.
9. **Bounded propagation focus beats a parallel inventory.** Highlighting a
   selected value upstream or downstream for N steps helps answer how data
   flows. A global semantic table duplicates the board and is skipped for now.
10. **External chrome should deepen source truth, not mimic an IDE.** The rich
   vendor surfaces make the best case for read-only provenance, definition
   navigation, semantic Find, source-linked diagnostics, and landmarks once
   pyblocks supplies real identities—not mutable projects or palettes.
11. **Runtime visuals need a real evidence contract.** Run/Pause/Stop, execution
   highlight, and probes are useful only after an explicit adapter or recorded
   trace can name their target, revision, lifecycle, and values.
12. **Statecharts and behavior trees remain separate research.** Current state
    configuration/dataflow is sufficient; no derived state overlay or tree
    renderer belongs in this work order.

# Decision surface

## Done

- Rebuilt the research as extensive Track A and Track B dictionaries with one
  concept per heading and a strict evidence-first useful-entry order.
- Corrected the baseline: Split is shipped; required/default/override and
  variadic groups are shipped; current SystemSketch already has broad menu,
  toolbar, palette/search, Inspector, Problems, overview, depth, zoom, layout,
  comments, and async-style coverage.
- Added official NI, Epic, and MathWorks capture/source evidence for the external
  editor chrome: run/debug/probe surfaces, project/navigation panels, context
  help/property inspectors, search, diagnostics, tabs, bookmarks, interfaces,
  signal hierarchy, and toolbars.
- Recorded Zach's settled vocabulary decisions: stock Set attributes, stock
  Select, semantic roles on ordinary wires, direct dashed async arrow,
  Clock/Trigger source, no event dispatcher relation, no bespoke exception rail,
  and no derived statechart overlay.
- Froze the exact original, first dictionary, and editor-chrome revisions, then
  linked this incorporated report to Zach's complete feedback record and crops.
- Reclassified the component-interface lens as already covered by Port view and
  the board-wide semantic table as skipped for now.

## Left

- Implement analyzer facts and renderer tests for approved Set attributes and
  Select, preserving shipped Split as the named-projection baseline.
- Activate port-owned semantic roles with accessible cues, retained provenance,
  live wire inheritance, and visible endpoint conflicts; unresolved cases remain
  implicit Data.
- Define narrow source predicates for async and Clock/Trigger without fabricating
  queues, ownership, dispatch, scheduler, or simulation semantics.
- Implement selectable depth breadcrumbs with composable session history and a
  bounded upstream/downstream propagation focus.
- Stage source/provenance/navigation/search/Problems improvements behind a
  trustworthy pyblocks source-symbol index.
- Treat runtime strip, trace playback, and probes as a later adapter/trace
  program with explicit target, sandbox, revision, and redaction contracts.

## Needs Zach

Review each isolated implementation track and choose whether to integrate it.
After the navigation prototypes, decide whether named landmarks still add value
beside breadcrumbs and Board Overview. Later, decide whether stable right tabs
improve on the current FigJam-inspired transient surfaces, and whether imported
trace playback or a live adapter should become the first runtime evidence source.

## Deliberately not done

- No draggable LabVIEW, Blueprint, or Simulink palette.
- No product code change on this research branch; implementations live on
  independently reviewable branches.
- No universal Error port, special outcome rail, top-edge exception effect,
  event-dispatch relation, queue junction, ownership hub, or global async
  timeline.
- No derived statechart overlay or behavior-tree renderer.
- No board-wide semantic data table in this phase.
- No masks, callbacks, class-default editors, GUI type/schema editors, mutable
  project/deployment manager, recommended-terminal enforcement, or canvas-side
  Python contract editing.
- No inert Compile, Run, Pause, Stop, breakpoint, or probe chrome without an
  explicit execution/trace contract.

# Numbered primary-source index

## NI LabVIEW

1. NI, [Case Structures: Executing a Section of Code Based on Input Values](https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html) — selected case execution.
2. NI, [Feedback Node](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html) — previous-iteration dataflow.
3. NI, [Unbundle By Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html) — selects labelled cluster members without field-order dependence.
4. NI, [Bundle By Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html) — selectively replaces named cluster elements.
5. NI, [Handling Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html) — error-cluster dataflow and propagation.
6. NI, [Select](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/select.html) — conditional value selection.
7. NI, [Using Wires to Link Block Diagram Objects](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html) — ordinary and asynchronous channel-wire grammar.
8. NI, [Timing and Synchronization in NI LabVIEW](https://www.ni.com/en/shop/labview/timing-and-synchronization-in-ni-labview.html) — timing source and Timed Loop context.
9. NI, [Setting Required, Recommended, and Optional Inputs and Outputs](https://www.ni.com/docs/en-US/bundle/labview/page/setting-required-recommended-and-optional-inputs-and-outputs.html) — connector-pane categories.
10. NI, [View As Icon](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html) — compact node display.
11. NI, [LabVIEW Block Diagram Explained](https://www.ni.com/en/support/documentation/supplemental/08/labview-block-diagram-explained.html) — functions palette, run/abort/pause/highlight/step controls, tools, alignment, and diagram chrome.
12. NI, [LabVIEW Front Panel Explained](https://www.ni.com/en/support/documentation/supplemental/08/labview-front-panel-explained.html) — front-panel and formatting controls.
13. NI, [Boost LabVIEW Productivity with Quick Drop](https://www.ni.com/en/support/documentation/supplemental/08/boost-labview-productivity-with-quick-drop.html) — Quick Drop search and insertion.
14. NI, [Driver and VI Library Development Guidelines](https://www.ni.com/en/support/documentation/supplemental/21/driver-and-vi-library-development-guidelines.html) — Context Help guidance and screenshot.
15. NI, [Best Practices for Managing NI LabVIEW Applications Using the Project Explorer](https://www.ni.com/en/support/documentation/supplemental/08/best-practices-for-managing-ni-labview-applications-using-the-pr.html) — Project Explorer hierarchy.
16. NI, [Debugging Techniques in LabVIEW](https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html) — Error List, probes, breakpoints, and Debug Window.
17. NI, [LabVIEW Keyboard Shortcuts](https://www.ni.com/docs/en-US/bundle/labview/page/keyboard-shortcuts.html) — Find, Quick Drop, Context Help, and layout/navigation shortcuts.

## Epic Unreal Blueprint

18. Epic Games, [Struct Variables in Blueprints](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27) — Split Struct Pin, Set Members in Struct, and pin exposure.
19. Epic Games, [Flow Control in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine) — Branch, Select/Switch, Sequence, Gate, and related execution vocabulary.
20. Epic Games, [Functions](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27) — generated function-call interfaces and pure/impure context.
21. Epic Games, [Collapsing Graphs](https://dev.epicgames.com/documentation/en-us/unreal-engine/collapsing-graphs-in-unreal-engine) — compact graph presentation.
22. Epic Games, [Blueprint Class Editor User Interface](https://dev.epicgames.com/documentation/unreal-engine/blueprints-visual-scripting-user-interface-for-blueprint-classes-in-unreal-engine) — panels, tabs, toolbar, and class-editor chrome.
23. Epic Games, [Blueprint Communications](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine) — explicit cast failure path.
24. Epic Games, [Find Result Panel](https://dev.epicgames.com/documentation/unreal-engine/find-result-panel?application_version=4.27) — identity-aware Blueprint find results.
25. Epic Games, [Blueprint Search](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-search?application_version=4.27) — searchable Blueprint surface.
26. Epic Games, [Palette in the Blueprints Visual Scripting Editor](https://dev.epicgames.com/documentation/unreal-engine/palette-in-the-bleprints-visual-scripting-editor-for-unreal-engine?lang=en-US) — authoring node catalog, used as contrast.
27. Epic Games, [Details Panel](https://dev.epicgames.com/documentation/en-us/unreal-engine/details-panel-in-the-blueprints-visual-scriting-editor-for-unreal-engine) — context-sensitive inspector.
28. Epic Games, [Compiler Results](https://dev.epicgames.com/documentation/unreal-engine/compiler-results?application_version=4.27) — diagnostic results surface.
29. Epic Games, [My Blueprint Panel](https://dev.epicgames.com/documentation/unreal-engine/my-blueprint-panel-in-the-blueprints-visual-scripting-editor-for-unreal-engine?lang=en-US) — semantic outline/navigation.
30. Epic Games, [Graph Editor](https://dev.epicgames.com/documentation/en-us/unreal-engine/graph-editor-for-the-blueprints-visual-scripting-editor-in-unreal-engine) — tabs, history, and breadcrumbs.
31. Epic Games, [Comments](https://dev.epicgames.com/documentation/en-us/unreal-engine/comments-in-unreal-engine?lang=en-US) — comments and visual grouping.
32. Epic Games, [Working with Bookmarks for Blueprint Graphs](https://dev.epicgames.com/documentation/en-us/unreal-engine/working-with-bookmarks-for-blueprint-graphs-in-unreal-engine) — named navigation landmarks.
33. Epic Games, [Blueprint Toolbar](https://dev.epicgames.com/documentation/en-us/unreal-engine/toolbar-in-the-blueprints-visual-scripting-editor-for-unreal-engine) — compile/search/play/debug toolbar.
34. Epic Games, [Blueprint Debugger](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugger-in-unreal-engine) — debugger controls and execution context.
35. Epic Games, [Blueprint Debugging Example](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugging-example-in-unreal-engine) — worked debugging flow and runtime observations.
36. Epic Games, [Blueprint Editor Menu](https://dev.epicgames.com/documentation/unreal-engine/menu-for-the-blueprints-visual-scripting-editor-in-unreal-engine?lang=en-US) — editor menu surface.

## MathWorks Simulink and Stateflow

37. MathWorks, [Switch](https://www.mathworks.com/help/simulink/slref/switch.html) — conditional value selection.
38. MathWorks, [Model Reference Function-Call](https://www.mathworks.com/help/simulink/slref/model-reference-function-call.html) — dash-dot function-call controls; E1/E2 periodic and E3 interrupt-driven in the captured example.
39. MathWorks, [Function-Call Generator](https://www.mathworks.com/help/simulink/slref/functioncallgenerator.html) — function-call source.
40. MathWorks, [Signal Types](https://www.mathworks.com/help/simulink/ug/signal-types.html) — signal/control semantics.
41. MathWorks, [If](https://www.mathworks.com/help/simulink/slref/if.html) — conditional subsystem activation.
42. MathWorks, [Subsystem](https://www.mathworks.com/help/simulink/slref/subsystem.html) — subsystem presentation.
43. MathWorks, [Connect Subsystems](https://www.mathworks.com/help/simulink/ug/connect-subsystems.html) — interface/port connection context.
44. MathWorks, [Simulink Editor](https://www.mathworks.com/help/simulink/slref/simulinkeditor.html) — editor menus, navigation, and toolstrip context.
45. MathWorks, [Keyword Search for Actions](https://www.mathworks.com/help/simulink/ug/keyword-search-for-actions.html) — action search.
46. MathWorks, [Library Browser](https://www.mathworks.com/help/simulink/slref/librarybrowser.html) — authoring library catalog, used as contrast.
47. MathWorks, [Property Inspector](https://www.mathworks.com/help/simulink/slref/propertyinspector.html) — selection-following property UI.
48. MathWorks, [Diagnostic Viewer](https://www.mathworks.com/help/simulink/slref/diagnosticviewer.html) — diagnostics surface.
49. MathWorks, [Collaborate by Adding Comments to Blocks](https://www.mathworks.com/help/simulink/ug/collaborate-by-adding-comments-to-blocks.html) — attached comments.
50. MathWorks, [Model Browser](https://www.mathworks.com/help/simulink/ug/model-browser.html) — hierarchy navigation.
51. MathWorks, [Finder](https://www.mathworks.com/help/simulink/slref/finder.html) — semantic search/find interface.
52. MathWorks, [Bookmark Your Place in Models](https://www.mathworks.com/help/simulink/ug/bookmark-your-place-in-models.html) — saved viewmarks.
53. MathWorks, [Component Interface View](https://www.mathworks.com/help/simulink/slref/componentinterfaceview.html) — compact component boundary lens.
54. MathWorks, [Signal Hierarchy Viewer](https://www.mathworks.com/help/simulink/slref/signalhierarchyviewer.html) — structured signal member inspection and trace.
55. MathWorks, [Create a Simple Model](https://www.mathworks.com/help/simulink/gs/create-a-simple-model.html) — run/pause/stop editor controls.
56. MathWorks, [Breakpoints List](https://www.mathworks.com/help/simulink/slref/breakpointslist.html) — debug/breakpoint surface.
57. MathWorks, [Simulink Data Inspector](https://www.mathworks.com/help/simulink/ug/signal-logging-and-data-inspector.html) — recorded signal/value inspection.
58. MathWorks, [Bus Selector](https://www.mathworks.com/help/simulink/slref/busselector.html) — selected named bus members.
59. MathWorks, [Bus Assignment](https://www.mathworks.com/help/simulink/slref/busassignment.html) — selective bus-member update.
60. MathWorks, [Unit Delay](https://www.mathworks.com/help/simulink/slref/unitdelay.html) — prior-iteration/delay precedent.
61. MathWorks, [Understand Model Comparison Results](https://www.mathworks.com/help/simulink/ug/understand-model-comparison-results.html) — compare-state and inline-difference navigation precedent.
62. MathWorks, [Model Data Editor](https://www.mathworks.com/help/simulink/slref/modeldataeditor.html) — filterable model-wide data table.
63. NI, [Icon and Connector Panes](https://www.ni.com/en/support/downloads/instrument-drivers/tools-resources/instrument-driver-guidelines/icon-and-connector-panes.html) — aligned connector-pane boundary.
64. Epic Games, [Make Select](https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Struct/MakeSelect) — Condition, If True, and If False value-selection contract; the page has no graph screenshot.
65. NI, [Event Structure](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/structures/event-structure.html) — event-case and timeout handling.
66. Epic Games, [Cast To GameInstance](https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance) — typed success and Cast Failed outputs.
67. Epic Games, [Binding and Unbinding Events](https://dev.epicgames.com/documentation/en-us/unreal-engine/binding-and-unbinding-events-in-unreal-engine?lang=en-US) — dispatcher registration mechanics used as an exclusion boundary.
68. Epic Games, [IK2Node Add Pin Interface](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Editor/BlueprintGraph/IK2Node_AddPinInterface?lang=en-US) — authoring-time Add Pin contract.
69. MathWorks, [Trigger](https://www.mathworks.com/help/simulink/slref/trigger.html) — trigger-port semantics.
70. MathWorks, [Function Caller](https://www.mathworks.com/help/simulink/slref/functioncaller.html) — callable-function control interface.
71. MathWorks, [Stateflow States](https://www.mathworks.com/help/stateflow/ug/states.html) — explicit state-chart semantics.
72. MathWorks, [Control State Execution by Using Events](https://www.mathworks.com/help/stateflow/ug/control-state-execution-by-using-events.html) — Stateflow event semantics.
73. MathWorks, [Create Dynamic Mask Dialog Boxes](https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html) — authorable parameter-dialog logic.
74. MathWorks, [MATLAB Function](https://www.mathworks.com/help/simulink/slref/matlabfunction.html) — text function embedded in a model.
75. Epic Games, [Blueprint Macros](https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine) — reusable graph-authoring surface.
76. MathWorks, [History Junctions](https://www.mathworks.com/help/stateflow/ug/history-junctions.html) — state-history restoration.
77. MathWorks, [Variant Manager](https://www.mathworks.com/help/simulink/gui/variant-manager-overview.html) — authorable variant activation and configuration.
78. MathWorks, [Type Editor](https://www.mathworks.com/help/simulink/slref/typeeditor.html) — GUI-managed type definitions.
79. Epic Games, [Blueprint Editor Defaults](https://dev.epicgames.com/documentation/unreal-engine/blueprint-editor-defaults-tab) — class-default authoring surface.
80. NI, [Execution Page: VI Properties](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/dialog-boxes/execution-page-vi-properties-dialog-box.html) — VI execution-property authoring.
81. MathWorks, [Referenced Files Pane](https://www.mathworks.com/help/simulink/slref/referencedfilespane.html) — model/project dependency surface.
82. MathWorks, [Control Simulation Execution](https://www.mathworks.com/help/simulink/ug/controlling-execution-of-a-simulation.html) — simulation pacing and execution controls.
83. MathWorks, [Simulation Data Inspector](https://www.mathworks.com/help/simulink/slref/simulationdatainspector.html) — full time-series inspection workbench.

# Research limits

Reference documentation is evidence for each vendor tool's own execution and
authoring model. Every SystemSketch translation above is an inference filtered
through Python-source authority and the current renderer audit; it is not a
product specification or implementation commitment. The vendor captures make a
visual claim inspectable. Only a later source/analyzer decision can authorise a
product change.

[1]: https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html
[2]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html
[3]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html
[4]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html
[5]: https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html
[6]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/select.html
[7]: https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html
[8]: https://www.ni.com/en/shop/labview/timing-and-synchronization-in-ni-labview.html
[9]: https://www.ni.com/docs/en-US/bundle/labview/page/setting-required-recommended-and-optional-inputs-and-outputs.html
[10]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html
[11]: https://www.ni.com/en/support/documentation/supplemental/08/labview-block-diagram-explained.html
[12]: https://www.ni.com/en/support/documentation/supplemental/08/labview-front-panel-explained.html
[13]: https://www.ni.com/en/support/documentation/supplemental/08/boost-labview-productivity-with-quick-drop.html
[14]: https://www.ni.com/en/support/documentation/supplemental/21/driver-and-vi-library-development-guidelines.html
[15]: https://www.ni.com/en/support/documentation/supplemental/08/best-practices-for-managing-ni-labview-applications-using-the-pr.html
[16]: https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html
[17]: https://www.ni.com/docs/en-US/bundle/labview/page/keyboard-shortcuts.html
[18]: https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27
[19]: https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine
[20]: https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27
[21]: https://dev.epicgames.com/documentation/en-us/unreal-engine/collapsing-graphs-in-unreal-engine
[22]: https://dev.epicgames.com/documentation/unreal-engine/blueprints-visual-scripting-user-interface-for-blueprint-classes-in-unreal-engine
[23]: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine
[24]: https://dev.epicgames.com/documentation/unreal-engine/find-result-panel?application_version=4.27
[25]: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-search?application_version=4.27
[26]: https://dev.epicgames.com/documentation/unreal-engine/palette-in-the-bleprints-visual-scripting-editor-for-unreal-engine?lang=en-US
[27]: https://dev.epicgames.com/documentation/en-us/unreal-engine/details-panel-in-the-blueprints-visual-scriting-editor-for-unreal-engine
[28]: https://dev.epicgames.com/documentation/unreal-engine/compiler-results?application_version=4.27
[29]: https://dev.epicgames.com/documentation/unreal-engine/my-blueprint-panel-in-the-blueprints-visual-scripting-editor-for-unreal-engine?lang=en-US
[30]: https://dev.epicgames.com/documentation/en-us/unreal-engine/graph-editor-for-the-blueprints-visual-scripting-editor-in-unreal-engine
[31]: https://dev.epicgames.com/documentation/en-us/unreal-engine/comments-in-unreal-engine?lang=en-US
[32]: https://dev.epicgames.com/documentation/en-us/unreal-engine/working-with-bookmarks-for-blueprint-graphs-in-unreal-engine
[33]: https://dev.epicgames.com/documentation/en-us/unreal-engine/toolbar-in-the-blueprints-visual-scripting-editor-for-unreal-engine
[34]: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugger-in-unreal-engine
[35]: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugging-example-in-unreal-engine
[36]: https://dev.epicgames.com/documentation/unreal-engine/menu-for-the-blueprints-visual-scripting-editor-in-unreal-engine?lang=en-US
[37]: https://www.mathworks.com/help/simulink/slref/switch.html
[38]: https://www.mathworks.com/help/simulink/slref/model-reference-function-call.html
[39]: https://www.mathworks.com/help/simulink/slref/functioncallgenerator.html
[40]: https://www.mathworks.com/help/simulink/ug/signal-types.html
[41]: https://www.mathworks.com/help/simulink/slref/if.html
[42]: https://www.mathworks.com/help/simulink/slref/subsystem.html
[43]: https://www.mathworks.com/help/simulink/ug/connect-subsystems.html
[44]: https://www.mathworks.com/help/simulink/slref/simulinkeditor.html
[45]: https://www.mathworks.com/help/simulink/ug/keyword-search-for-actions.html
[46]: https://www.mathworks.com/help/simulink/slref/librarybrowser.html
[47]: https://www.mathworks.com/help/simulink/slref/propertyinspector.html
[48]: https://www.mathworks.com/help/simulink/slref/diagnosticviewer.html
[49]: https://www.mathworks.com/help/simulink/ug/collaborate-by-adding-comments-to-blocks.html
[50]: https://www.mathworks.com/help/simulink/ug/model-browser.html
[51]: https://www.mathworks.com/help/simulink/slref/finder.html
[52]: https://www.mathworks.com/help/simulink/ug/bookmark-your-place-in-models.html
[53]: https://www.mathworks.com/help/simulink/slref/componentinterfaceview.html
[54]: https://www.mathworks.com/help/simulink/slref/signalhierarchyviewer.html
[55]: https://www.mathworks.com/help/simulink/gs/create-a-simple-model.html
[56]: https://www.mathworks.com/help/simulink/slref/breakpointslist.html
[57]: https://www.mathworks.com/help/simulink/ug/signal-logging-and-data-inspector.html
[58]: https://www.mathworks.com/help/simulink/slref/busselector.html
[59]: https://www.mathworks.com/help/simulink/slref/busassignment.html
[60]: https://www.mathworks.com/help/simulink/slref/unitdelay.html
[61]: https://www.mathworks.com/help/simulink/ug/understand-model-comparison-results.html
[62]: https://www.mathworks.com/help/simulink/slref/modeldataeditor.html
[63]: https://www.ni.com/en/support/downloads/instrument-drivers/tools-resources/instrument-driver-guidelines/icon-and-connector-panes.html
[64]: https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Struct/MakeSelect
[65]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/structures/event-structure.html
[66]: https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance
[67]: https://dev.epicgames.com/documentation/en-us/unreal-engine/binding-and-unbinding-events-in-unreal-engine?lang=en-US
[68]: https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Editor/BlueprintGraph/IK2Node_AddPinInterface?lang=en-US
[69]: https://www.mathworks.com/help/simulink/slref/trigger.html
[70]: https://www.mathworks.com/help/simulink/slref/functioncaller.html
[71]: https://www.mathworks.com/help/stateflow/ug/states.html
[72]: https://www.mathworks.com/help/stateflow/ug/control-state-execution-by-using-events.html
[73]: https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html
[74]: https://www.mathworks.com/help/simulink/slref/matlabfunction.html
[75]: https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine
[76]: https://www.mathworks.com/help/stateflow/ug/history-junctions.html
[77]: https://www.mathworks.com/help/simulink/gui/variant-manager-overview.html
[78]: https://www.mathworks.com/help/simulink/slref/typeeditor.html
[79]: https://dev.epicgames.com/documentation/unreal-engine/blueprint-editor-defaults-tab
[80]: https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/dialog-boxes/execution-page-vi-properties-dialog-box.html
[81]: https://www.mathworks.com/help/simulink/slref/referencedfilespane.html
[82]: https://www.mathworks.com/help/simulink/ug/controlling-execution-of-a-simulation.html
[83]: https://www.mathworks.com/help/simulink/slref/simulationdatainspector.html
