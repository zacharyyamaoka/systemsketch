---
title: LabVIEW, Blueprint & Simulink — Vocabulary and Controls Gap Analysis
date: 2026-09-03
status: research-only
canonical_artifact: SystemSketch repository source report
scope: Python-source renderer, not an authoring-first node palette
---

# LabVIEW, Blueprint & Simulink — Vocabulary and Controls Gap Analysis

## Bottom line

The useful result is deliberately narrow: **do not add a draggable palette.** Most
of the mature tools' blocks are authoring affordances for expressions which Python
already states directly. SystemSketch should instead borrow their hard-won visual
grammar when its analyzer recognizes a Python semantic shape which needs an honest
dataflow presentation.

Three gaps survive that filter:

1. An analyzer-owned **outcome / exception region** for `try`, `except`, `else`,
   `finally`, and `raise`, rather than a LabVIEW-style error pin on every call.
2. A deliberately narrow **async / event relation** grammar for source forms the
   analyzer can prove, such as an `asyncio.Queue` handoff or a named callback
   registration—not a claim to visualize arbitrary concurrent execution.
3. A high-bar **state / mode region** for recognizable Python state-machine
   patterns, informed by Stateflow but not inferred merely from an enum or an
   ordinary `if` chain.

On the controls axis, the concrete next candidate is a **source-derived call
contract display**: required, defaulted, and keyword-only parameters can be
presented as distinct facts about the Python signature. It should not import
LabVIEW's “recommended” wiring rule, which has no matching Python semantic.

This is a research artifact only. It proposes staged decisions; it does not change
SystemSketch code, its schema, or the analyzer.

## Framing and method

SystemSketch renders authoritative Python source through pyblocks' analyzer. The
canvas is a presentation of that source, not an alternate place to construct,
validate, or lint a program. LabVIEW, Unreal Blueprint, and Simulink instead let a
person assemble a program by placing nodes. Therefore a reference-tool block is
only a SystemSketch gap when the analyzer can recognize an equivalent *Python
semantic shape* and the current renderer has no adequate block or region for it.

This report uses two independent dictionaries:

- **Track A — node/block vocabulary:** semantic shapes a Python analyzer might
  render.
- **Track B — UI controls:** presentation choices for an already-rendered block,
  port, or annotation.

“Convergent” means two or more reference tools independently expose the same
underlying reading aid. It is strong visual evidence, not automatic permission to
copy their authoring model. “Single-tool lead” means useful prior art that needs a
particularly high source-language proof before it becomes a renderer feature.

The implementation comparison below is an audit of the current SystemSketch tree:
`BlockPort.visible`, `row`, and `branch` live in
[`src/blocks/blockModel.ts`](../src/blocks/blockModel.ts); the three presentation
views are `simple`, `port`, and `expanded`; an input marked as mutating derives a
top-edge effect output; and local comments have source-aware anchors in
[`src/comments/commentModel.ts`](../src/comments/commentModel.ts). This corrects
one stale premise in the work order: SystemSketch *does* ship an effect exit.
It is a derived top-edge port, not yet a truly portless endpoint or a general
exception/outcome grammar.

The rendered companion embeds official-documentation screenshots for the useful
entries and labels every proposed diagram as an original SystemSketch projection.
This Markdown is its canonical, reviewable research source; the vault remains
read-only from this repository checkout.

## Rendered evidence checklist

The HTML companion must show the actual reference image before its original
SystemSketch projection. The screenshot is evidence, not a replacement for the
source link. Existing-capability entries instead show a current SystemSketch UI
capture and identify the relevant code seam.

| Dictionary entry | Official screenshot(s) to retain in the companion | Original projection |
| --- | --- | --- |
| Outcome / exception | NI’s error-wire diagram from [Handling Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html); Epic’s Cast node with its **Cast Failed** output from [Cast To GameInstance](https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance). | A `try` body with normal data continuation and a separately labelled exception rail into `except`. |
| Async / event relation | NI’s asynchronous channel-wire illustration from [Using Wires](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html); an Epic dispatcher/bind example from [Creating Dispatcher Events](https://dev.epicgames.com/documentation/unreal-engine/creating-dispatcher-events-in-unreal-engine); MathWorks’ Stateflow event/state visual from [Get Started with Stateflow](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html). | A named, visually secondary relation between a proven source publisher and subscriber/continuation. |
| State / mode region | MathWorks’ Stateflow chart/state visual from [Get Started with Stateflow](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html). | Mutually exclusive named mode cells, guard-labelled transitions, and no inferred statechart outside an explicit source contract. |
| Source-derived call contract | NI connector-pane terminal-state reference from [Required, Recommended, and Optional Terminals](https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YK4VCAW); Epic’s **As Pin** / Hide Unconnected screenshot from [Struct Variables](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27). | A Python-call block whose required/defaulted/keyword-only facts are legible but whose canvas cannot change the signature. |
| Already-have controls | Current SystemSketch captures for Simple/Port/Expanded, literal pills, visible/hidden rows, effect ports, and source-aware comments. | None—show the real current UI rather than a hypothetical replacement. |

## Coverage ledger

The ledger accounts for every in-scope family named in the work order. “Already”
means the current renderer has the relevant reading primitive; it does **not** mean
the reference tool's authoring behavior should be replicated. “Useful” is a phased
candidate, not an implementation commitment.

### Track A — node/block vocabulary

| Reference family | Python-renderer reading | Disposition | Evidence strength |
| --- | --- | --- | --- |
| LabVIEW Case; Blueprint Branch/Switch; Simulink If Action + Merge | Source `if` / `match` produces exclusive paths and a join. | **Already** — Branch region; do not re-litigate. | Convergent across all three. |
| LabVIEW Sequence; Blueprint Sequence | Source order is normally already implied by Python and data dependencies; an arbitrary execution chain is not a new dataflow semantic. | **Missing, not useful** as a generic node. | Two-tool authoring convention, poor Python fit. |
| LabVIEW Feedback Node; Simulink Unit Delay/Memory | Loop-carried value needs an explicit previous-iteration read. | **Already** — loop `z⁻¹` pill; settled. | Convergent. |
| LabVIEW Timed Loop/Sequence; Wait/Tick Count | Scheduler rate and wall-clock control are runtime policy, not ordinary static Python flow. | **Missing, not useful** now. | LabVIEW-specific runtime model. |
| LabVIEW Formula Node; Simulink MATLAB Function | A textual escape hatch inside a visual authoring language validates Python as the canonical source. | **Already** — no extra node. | Convergent. |
| LabVIEW Cluster Bundle/Unbundle/Array-to-Cluster; Blueprint Make/Break Struct/Set Members | Field access, aggregate construction, and explicit value threading are ordinary Python expressions/assignments. | **Already** — splitter, `self` boundary, and derived mutation effect output; retain ordinary expressions as ordinary blocks. | Convergent LabVIEW/Blueprint. |
| LabVIEW Index/Build/Replace Subset/auto-indexing tunnels; Blueprint Array/Map/Set utilities; Simulink Mux/Demux | Collection operations and pack/unpack are source expressions; loop collection movement belongs to the existing loop grammar when it is semantically material. | **Already / no palette gap.** | Convergent authoring palettes, negative evidence for a palette. |
| LabVIEW Comparison/Boolean/Numeric; Blueprint math; Simulink arithmetic/Gain | `a and b`, comparisons, arithmetic, and transforms are ordinary Python AST expressions. | **Missing, not useful** as special primitives. | Convergent authoring convenience only. |
| Blueprint Select; Simulink Switch/Multiport Switch | Conditional expression `a if condition else b` has a compact, source-identifiable value-selection form. | **Useful, left as the existing V4 Select candidate.** | Convergent Blueprint/Simulink; lower urgency than regions. |
| LabVIEW Error I/O; Blueprint `Cast To <Class>` failure and latent completion paths | Failure should be visible where Python explicitly handles or raises it. | **Useful, phase 1** — outcome / exception region, not ubiquitous error ports. | Convergent outcome visibility; different mechanisms. |
| LabVIEW Queue/Notifier/Semaphore/Rendezvous/Occurrence; Blueprint Event Dispatcher/Custom Event; Stateflow events | These expose handoff, notification, waiting, and event-driven changes of control. | **Useful, phase 2** — only analyzer-recognized async/event relations. | Three-tool convergence at the problem level. |
| Blueprint DoOnce/DoN/FlipFlop/Gate/MultiGate | These are mutable runtime latches or schedulers, not a generic Python language construct. | **Missing, not useful** as a family of nodes. | Blueprint-specific execution model. |
| Blueprint Delay/RetriggerableDelay | Wall-clock scheduling is a runtime policy; an `await` is only useful when the analyzer can state its continuation contract. | **Missing, not useful** as a standalone delay node; covered narrowly by phase-2 async relations when proven. | Blueprint-specific runtime convention. |
| Blueprint Macros/Functions; Blueprint Interfaces | Python functions, decorators, `Protocol`, and ABCs are source-level definitions/contracts, not a need for a second graph-authoring language. | **Already / no new primitive.** Existing definition linking is the nearest presentation seam. | Blueprint-specific authoring mechanism. |
| Blueprint Construct Object From Class/Spawn | Python construction is `ClassName(...)` / `__init__`; actor spawning is outside scope. | **Already / out of scope.** | Python fit settles it. |
| Simulink Stateflow charts/states/transitions | Explicit mode, transition guards, entry/during/exit behavior, and events can be a distinct semantic topology. | **Useful, phase 3** — source-recognized state/mode region only. | Single-tool visual lead, very high semantic bar. |
| Simulink Signal Routing: Merge/Mux/Demux/Switch/Multiport Switch | A branch join or aggregate expression is already readable; its Simulink signal-routing palette is not a Python node vocabulary. | **Already / no palette gap.** | Simulink-specific authoring surface. |
| Simulink Signal Attributes: Data Type Conversion/Rate Transition; Model-Wide Utilities; Discrete sample-and-hold/integrators | Simulation time, sample rate, numeric execution policy, and model configuration are not static Python dataflow shapes. | **Missing, not useful** now. | Simulink-specific runtime semantics. |
| LabVIEW Application Control, Variant/Type, Property/Invoke nodes | Framework API calls should remain named Python calls; a special renderer would encode a library palette. | **Missing, not useful.** | LabVIEW-specific APIs. |

### Track B — UI controls and settings surface

| Reference control family | Current SystemSketch reading | Disposition | Evidence strength |
| --- | --- | --- | --- |
| Blueprint per-member **As Pin**; Blueprint **Hide Unconnected Pins** | `BlockPort.visible` plus header/body/hidden row assignment already controls exposure. | **Already, partial.** Visibility is binary and editor-owned today. | Direct Blueprint/SystemSketch convergence. |
| LabVIEW required/recommended/optional connector terminals | Python has required, defaulted, and keyword-only signature facts, but no semantic equivalent of “recommended wiring.” | **Useful, phase 1** — source-derived call-contract badges; do not enforce or invent a recommended tier. | Strong LabVIEW lead; Python constrains the translation. |
| Simulink masked-subsystem port visibility/bus expansion | Presentation can be derived from a known source contract, but masks are authored UI programs in Simulink. | **Already for visibility; missing, not useful for mask authoring.** | Simulink-specific authoring model. |
| LabVIEW View As Icon; Blueprint compact/collapsed nodes; Simulink subsystems | Blocks can be reduced without deleting their internal wires. | **Already** — Simple / Port / Expanded views. | Cross-tool convergence. |
| Blueprint Details panel; Simulink mask dialog; LabVIEW property/invoke adjacency | SystemSketch's inspector edits presentation/schema data; Python remains canonical. | **Already for generic inspection; missing, not useful for author-defined parameter dialogs.** A future source-linked read-only configuration projection needs a separate decision. | Three-tool surface resemblance, poor source-canonical fit. |
| Comments, labels, and annotations on nodes/wires | Local comments anchor to shape, point, region/page, and Python source references. | **Already, partial.** Wire-label conventions are not a reason to create a new semantic node. | Cross-tool convergence. |
| Unwired default values on terminals/pins | Literal/default information is already displayed as a value pill on an unconnected port. | **Already.** | Cross-tool confirming convention. |

## Dictionary A — semantic vocabulary

### Already have

#### Branch / exclusive paths / merge

LabVIEW Case Structures choose a case from an input value; Simulink If Action
Subsystems feed a Merge; Blueprint Flow Control exposes the same need for visible
exclusive execution. Those are three authoring dialects of a source-level Python
branch and join. SystemSketch's Branch region is the settled rendering answer, so
this entry is evidence, not a new feature request. See NI's [Case Structure
documentation](https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html),
Epic's [Flow Control reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine),
and MathWorks' [If block reference](https://www.mathworks.com/help/simulink/slref/if.html).

#### Loop-carried state / previous value

LabVIEW's Feedback Node and Simulink's Unit Delay make the prior value visually
explicit. This is already represented by SystemSketch's loop-carried `z⁻¹` pill.
It is a high-confidence convergent convention and should remain separate from
ordinary same-iteration data wires. See NI's [Feedback Node
reference](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html)
and MathWorks' [Unit Delay reference](https://www.mathworks.com/help/simulink/slref/unitdelay.html).

#### Structured values and in-place-looking updates

LabVIEW's Bundle/Unbundle family and Blueprint's Make/Break Struct and Set Members
make an aggregate boundary readable. SystemSketch already has the relevant
presentation ingredients: a splitter, explicit `self` boundary, and a derived
top-edge effect output for an input marked as mutated. The important caveat is
that this is an effect *port*, rather than the proposed future portless effect
endpoint; the report does not treat the latter as shipped. Blueprint's official
[Struct Variables guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27)
documents splitting pins, Break/Make Struct, and choosing members for Set Members.
NI's [arrays and clusters overview](https://www.ni.com/en/support/documentation/supplemental/08/labview-arrays-and-clusters-explained.html)
provides the analogous LabVIEW vocabulary.

#### Text is the escape hatch — and Python is the source of truth

LabVIEW Formula Nodes and Simulink MATLAB Function blocks admit that a visual
authoring canvas cannot efficiently express every computation. SystemSketch goes
further: it projects real Python rather than embedding a second text island inside
the graph. This validates the architectural boundary; it does not justify a
Formula/MATLAB-function-like special block. See NI's [Formula Node
documentation](https://www.ni.com/docs/en-US/bundle/labview/page/formula-node.html)
and MathWorks' [MATLAB Function block reference](https://www.mathworks.com/help/simulink/slref/matlabfunction.html).

### Missing, would be useful

#### Outcome / exception region — phase 1

**What it is.** A source-owned region for code that explicitly handles an outcome:
`try`/`except`/`else`/`finally`, `raise`, and possibly a narrow recognizable
result-like protocol. Success data should continue as normal dataflow; a named
exception outcome should leave via a visibly separate rail or endpoint and enter
the handler region.

**Why it survives the filter.** LabVIEW makes error propagation visible by
threading a status/code/source cluster and by skipping downstream work when an
incoming error is set. Blueprint's `Cast To GameInstance`, for example, has a
typed success output and an explicit **Cast Failed** execution output. That
establishes the same reader need even though it is not Python's exception system.
The useful convergence is **visible outcome**, not the mechanism of LabVIEW's
universal error wire. NI describes the error cluster and propagation rule in
[Handling Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html),
and Epic documents the cast contract in [Cast To
GameInstance](https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance).

**SystemSketch translation.** The analyzer must own the boundary. It should render
only syntactically explicit Python exception semantics, preserve the data route,
and make the handler/raise path legible. It should **not** synthesize an `error`
terminal for every function call, speculate that every return value can fail, or
infer exception behavior from a library name.

**Lift and decision.** Medium-to-high: it needs analyzer facts, a region grammar,
and testable rules for nesting and re-raise. It is the first proposed semantic
experiment because it is source-authentic and addresses an existing blind spot.

#### Recognized async / event relation — phase 2

**What it is.** A small relationship grammar for a source form the analyzer can
prove: queue put/get, a named callback registration/dispatch pair, or an `async`
await boundary with an explicit continuation. It should indicate ownership,
handoff, or wait—not draw a fabricated global timeline.

**Why it survives the filter.** LabVIEW distinguishes ordinary and asynchronous
channel wires and offers Queue, Notifier, Semaphore, Rendezvous, and Occurrence
primitives. Blueprint Event Dispatchers expose a named publisher/subscriber
relationship; its async-task base node explicitly supplies completion execution
pins. Stateflow charts are expressly event-driven. These tools converge on the
fact that async control cannot be honestly represented as a normal value wire, but
they offer different runtime contracts. There is no evidence for a universal
Blueprint Success/Failure/Timeout convention, so SystemSketch must not invent one.
See NI's [wire documentation](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html),
NI's [Queue comparison](https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z000000P7OfSAK&l=en-US),
Epic's [Creating Dispatcher Events](https://dev.epicgames.com/documentation/unreal-engine/creating-dispatcher-events-in-unreal-engine),
[Base Async Task node](https://dev.epicgames.com/documentation/unreal-engine/API/Editor/BlueprintGraph/UK2Node_BaseAsyncTask?lang=en-US),
and MathWorks' [Stateflow introduction](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html).

**SystemSketch translation.** Use a visually secondary, named relation only when
the analyzer recognizes a contract it can explain. An `asyncio.Queue` handoff, for
example, may be meaningful; arbitrary threads, callbacks hidden inside a framework,
or a guessed temporal ordering are not. The label must name the source relation so
the reader can return to Python.

**Lift and decision.** High: source recognition, cross-function identity, and an
honest non-DAG visual contract all need design work. Do this after the exception
region, with one narrowly selected Python idiom and no claim of general concurrency
visualization.

#### State / mode region — phase 3, high bar

**What it is.** A bounded region showing exclusive named modes, event/guard
transitions, and state-local behavior when Python source explicitly encodes a
state-machine protocol.

**Why it survives the filter.** Stateflow is a graphical finite-state-machine
environment whose chart contains states, transitions, events, and entry/during/exit
actions. It is strong visual prior art for a real mode model, but it is **single-tool
evidence**, not proof that every enum or branch deserves a statechart. See
MathWorks' [Stateflow overview](https://www.mathworks.com/help/stateflow/index.html),
[Chart](https://www.mathworks.com/help/stateflow/ref/chart.html), and
[States](https://www.mathworks.com/help/stateflow/ug/states.html) references.

**SystemSketch translation.** Require a recognizable source contract—perhaps an
explicit transition table, an analyzer-supported state-machine framework, or an
annotated protocol chosen by Zach. Never infer a statechart merely because a class
has an enum field or several `if` statements.

**Lift and decision.** High and intentionally deferred. It is semantically
interesting precisely because it is not yet cross-tool convergence; a false
positive statechart would be worse than no statechart.

#### Select / conditional value — existing V4 candidate

Blueprint Select and Simulink Switch make a value choice without pretending it is
an effectful branch. The source equivalent, `left if condition else right`, is
compact and analyzer-identifiable. Retain it as the existing V4 Select candidate;
do not let this report elevate it above the outcome/async gaps. See Epic's [Flow
Control reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine)
and MathWorks' [Switch block reference](https://www.mathworks.com/help/simulink/slref/switch.html).

### Missing, would not be useful

- **Arithmetic, Boolean, comparison, numeric, Gain, Array/Map/Set utility
  palettes:** render Python expressions and collection calls as ordinary source
  blocks rather than introduce palette-specific glyphs.
- **Sequence, DoOnce, DoN, FlipFlop, Gate, MultiGate:** these encode a specific
  authoring/runtime latch model. A Python analyzer should depict explicit state if
  and when it can prove it, not decorate all control flow with Blueprint exec
  nodes.
- **Timed Loop, Wait, Tick, Rate Transition, discrete integration, and model-wide
  simulation utilities:** they describe a scheduler or simulator, not static
  Python dataflow. A future live-execution view could revisit this with runtime
  evidence.
- **Application Control, Property/Invoke, Variant conversion, actor spawning,
  gameplay/world nodes:** these are framework/library palettes. Their ordinary
  Python calls deserve ordinary call rendering.
- **Blueprint macro authoring and interface assets:** Python functions,
  decorators, `Protocol`, and ABCs remain canonical definitions. Existing
  definition linking is the presentation seam; no second subgraph authoring
  language is warranted.

## Dictionary B — presentation controls

### Already have

#### Port visibility and structural placement

Blueprint's Details panel can expose individual struct members as pins and hide
unconnected pins. SystemSketch already has an explicit per-port visibility field
and header/body/hidden placement, so the convergence is real. The renderer should
continue to distinguish this **presentation setting** from a change to Python's
callable signature. Epic documents the exact `As Pin` and Hide Unconnected Pins
behavior in its [Struct Variables guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27).

#### Collapse without deletion

LabVIEW's compact icon view, Blueprint's compact node presentations, and Simulink
subsystems all make density manageable by changing what is visible rather than
destroying relationships. SystemSketch already offers Simple, Port, and Expanded
views, with its internal presentation and wires returning when expanded. NI exposes
the relevant compacting control as [View As
Icon](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html).

#### Default values and annotations

An unconnected parameter's literal is information, not a missing wire. The current
literal pill already makes that fact readable; its agreement with default-value
conventions in the reference tools is confirmation rather than a new feature.
Similarly, local comments already support source-aware anchors. NI describes
user-defined constants in [Creating and Editing User-Defined
Constants](https://www.ni.com/docs/en-AS/bundle/labview/page/creating-and-editing-user-defined-constants.html);
Blueprint and Simulink node comments are comparable presentation conventions, not
new semantics.

### Missing, would be useful

#### Source-derived call contract display — phase 1

**What it is.** A legible, non-authoring distinction on a rendered Python call or
definition for:

- required parameters (no default),
- defaulted parameters (with the source literal or expression still inspectable),
- keyword-only parameters, and
- variadic `*args` / `**kwargs` where analyzer support makes their boundary clear.

**Why it survives the filter.** LabVIEW connector panes visually distinguish
required, recommended, and optional terminals; Blueprint exposes individual
members only when their pin is meaningful to the chosen node presentation. Both
make a call's interface readable, though only LabVIEW supplies a three-tier wiring
policy. See NI's [connector-pane terminal
guidance](https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YK4VCAW)
and Epic's [Struct Variables guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27).

**SystemSketch translation.** Derive badges/rows from the Python signature; do
not let the canvas declare a parameter required, recommended, or optional. Map
LabVIEW “required” to required Python arguments and “optional” to a Python default;
there is **no Python analogue of “recommended,”** so omit it. Keep raw per-port
visibility as a presentation override, but never hide a source-required argument in
a way that makes the rendered contract false.

**Lift and decision.** Medium: it needs signature facts from the analyzer and a
compact visual hierarchy, but no new source semantics. Prototype after a Zach
decision on how much signature detail belongs on the board.

### Missing, would not be useful

- **Author-defined Simulink masks and dynamic dialog callbacks:** MathWorks masks
  let a block author program a parameter dialog whose controls can show, hide, or
  enable dynamically. That is a second authoring surface and conflicts with
  Python-as-source. A future *read-only, source-linked* configuration projection
  is a distinct question, not a mask port. See MathWorks' [dynamic mask dialog
  guide](https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html).
- **LabVIEW “recommended” terminal enforcement:** a visual hint without a Python
  language counterpart would create a false semantic contract.
- **Automatic hiding based solely on whether a wire happens to be connected:** it
  makes current board layout, rather than source intent, determine a callable's
  visible interface. Preserve explicit visibility and explore source-derived
  optionality instead.
- **Property/invoke-specific configuration UIs and framework Details panels:**
  generic inspection is already available; library-specific settings widgets would
  recreate reference-tool palettes in SystemSketch.

## Convergence map

| Question | Independent reference answers | What actually transfers |
| --- | --- | --- |
| How should a mutually exclusive path read? | LabVIEW Case; Blueprint Branch/Switch; Simulink If/Merge. | Branch region and explicit join — already settled. |
| How should a prior iteration value read? | LabVIEW Feedback; Simulink Unit Delay. | Loop-carried `z⁻¹` state — already settled. |
| How should structured data be opened or partially changed? | LabVIEW Bundle/Unbundle; Blueprint Make/Break/Set Members. | Explicit field boundary and value/effect threading — already present. |
| How should a call interface be scanned? | LabVIEW terminal tiers; Blueprint per-member pin exposure; Simulink exposed subsystem ports. | Source-derived signature/optional-display facts, not reference-tool validation. |
| How should a non-normal outcome read? | LabVIEW error wire; Blueprint distinct outcome paths. | An explicit Python exception/outcome region, not error plumbing. |
| How should eventful or async control read? | LabVIEW synchronization; Blueprint dispatchers/events; Stateflow events. | A narrow analyzer-recognized named relation; do not infer a scheduler. |
| How should mode behavior read? | Stateflow statecharts. | A future, opt-in/source-provable mode region only; single-tool lead. |

## Your thinking, sharpened

1. **Convergence is evidence about constraints, not a license to clone controls.**
   Mature tools agree when the underlying dataflow truth leaves little room for a
   misleading drawing—branch joins, prior values, field boundaries, and exposed
   interfaces are examples. Their surrounding authoring UX is not automatically
   part of that truth.
2. **The error wire's lesson is visible failure, not error parameters.** Python
   already has an explicit exception grammar. A renderer can make that grammar
   visible without asking every call to pretend it returns a LabVIEW error cluster.
3. **Async is the pressure test for the DAG claim.** The correct first move is not
   a general concurrency diagram; it is a small source-recognized relation whose
   identity and boundary the reader can verify in Python.
4. **State is a semantic commitment.** Stateflow is excellent drawing prior art,
   but a decorative statechart inferred from enum-shaped code would actively lie.
5. **Controls must preserve source truth.** The best next UI refinement is to
   reveal signature facts Python already owns. Mask authoring and a synthetic
   “recommended” port class would make the canvas an authority it is not.

## Decision surface

### Done

- Audited both axes against the current Block/Port/Edge and comment primitives.
- Confirmed the Branch region, loop `z⁻¹`, structured value/mutation seam,
  literal/default pill, visibility/row controls, three view levels, inspector, and
  source-aware comments as existing foundations.
- Corrected the work-order inventory: a derived top-edge effect output is already
  implemented; a portless mutation endpoint is not.
- Separated cross-tool convergence from single-tool leads and excluded authoring
  palettes that do not survive the Python-source filter.

### Left

- Capture and retain the official screenshots named by the rendered companion,
  alongside original SystemSketch projection diagrams.
- Turn the proposed exception/outcome region into a small analyzer and visual
  grammar experiment only after a decision; it is not specified here.
- Keep Select as its existing V4 candidate rather than silently promoting it.
- Investigate exactly one async idiom only after its source identity and failure
  behavior can be stated precisely.

### Needs Zach

- Which concrete Python exception/outcome patterns deserve phase-1 support:
  only syntax (`try`/`except`/`raise`), or one explicit result-like protocol too?
- Which single async idiom is valuable enough to make visible first (queue,
  callback/dispatcher, task/await), and what promise can its rendered relation
  honestly make?
- Is a compact signature contract worth board density, and which details should be
  default-visible versus inspector-only?
- What source-level contract, if any, should permit a future state/mode region?

### Deliberately not done

- No draggable LabVIEW, Blueprint, or Simulink palette.
- No SystemSketch code, schema, analyzer, or canvas mutation.
- No generic error port, global async timeline, inferred statechart, or framework
  API glyph library.
- No Simulink-style mask authoring or LabVIEW-style “recommended” wiring rule.

## Primary-source index

1. NI, [Handling Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html) — error cluster and propagation behavior.
2. NI, [Using Wires to Link Block Diagram Objects](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html) — wire and channel conventions.
3. NI, [Case Structures: Executing a Section of Code Based on Input Values](https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html).
4. NI, [Feedback Node](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html).
5. NI, [LabVIEW Arrays and Clusters Explained](https://www.ni.com/en/support/documentation/supplemental/08/labview-arrays-and-clusters-explained.html).
6. NI, [Formula Node](https://www.ni.com/docs/en-US/bundle/labview/page/formula-node.html).
7. NI, [View As Icon](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html).
8. NI, [Connector Pane: Required, Recommended, and Optional Terminals](https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YK4VCAW).
9. Epic Games, [Flow Control in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine).
10. Epic Games, [Struct Variables in Blueprints](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27).
11. Epic Games, [Cast To GameInstance](https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance) — typed success and Cast Failed outputs.
12. Epic Games, [Creating Dispatcher Events](https://dev.epicgames.com/documentation/unreal-engine/creating-dispatcher-events-in-unreal-engine) and [Base Async Task node](https://dev.epicgames.com/documentation/unreal-engine/API/Editor/BlueprintGraph/UK2Node_BaseAsyncTask?lang=en-US).
13. Epic Games, [Macros](https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine?lang=en-US), [Implementing Blueprint Interfaces](https://dev.epicgames.com/documentation/unreal-engine/implementing-blueprint-interfaces-in-unreal-engine?lang=en-US), and [Nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine).
14. Epic Games, [Comments](https://dev.epicgames.com/documentation/unreal-engine/comments-in-unreal-engine?lang=en-US) and [Blueprint Editor Details Panel](https://dev.epicgames.com/documentation/en-us/unreal-engine/details-panel-in-the-blueprints-visual-scriting-editor-for-unreal-engine).
15. MathWorks, [If](https://www.mathworks.com/help/simulink/slref/if.html), [Switch](https://www.mathworks.com/help/simulink/slref/switch.html), and [Unit Delay](https://www.mathworks.com/help/simulink/slref/unitdelay.html).
16. MathWorks, [MATLAB Function](https://www.mathworks.com/help/simulink/slref/matlabfunction.html).
17. MathWorks, [Stateflow overview](https://www.mathworks.com/help/stateflow/index.html), [Get Started with Stateflow](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html), [Chart](https://www.mathworks.com/help/stateflow/ref/chart.html), and [States](https://www.mathworks.com/help/stateflow/ug/states.html).
18. MathWorks, [Create Dynamic Mask Dialog Boxes](https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html).

## Limits of this research

The reference documentation is evidence for each tool's own model, not evidence
that SystemSketch should reproduce it. The proposed translations are explicitly
inferences filtered through Python source authority and the current renderer audit.
They need a fresh, source-level design decision before any implementation work
begins.
