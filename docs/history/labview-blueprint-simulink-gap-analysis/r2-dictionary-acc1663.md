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

SystemSketch should borrow mature tools' reading grammar, not their editable node
palettes. The strongest gaps are source-recognized outcome paths, named
record-field access and update, narrowly proven async/event relations, explicit
state/mode regions, and a read-only Python call contract. Everything else is
either already represented by the current renderer or belongs to an environment
that authors a program graph rather than projects Python.

This is an evidence-first dictionary. It replaces a research narrative with one
concept per entry. The rendered HTML companion is the visual reading surface; this
Markdown is its canonical source and source-index record. It stays in this
repository because this implementation worktree is allowed to write here, while
the Obsidian vault is a read-only knowledge source from this context.

## How to read the dictionary

The two tracks are intentionally independent:

- **Track A — vocabulary** asks whether a source-recognizable Python semantic
  deserves a block, region, port family, or relation grammar.
- **Track B — controls** asks how an existing or future projection should expose,
  collapse, annotate, or inspect facts without making the canvas authoritative.

Each entry belongs to one bucket:

- **Already have** contains a short description and a real current SystemSketch
  capture with its code seam. It has no hypothetical drawing.
- **Missing, would be useful** always follows one order: text description,
  official-documentation screenshot evidence, original SystemSketch projection,
  and honest lift.
- **Missing, would not be useful** is text only. These ideas are excluded because
  screenshots or invented art would falsely signal product interest.

The original drawing requested by the work order is deliberately not an icon
redraw. It answers, “if this were rendered by SystemSketch, how would its
Block/port/cable grammar communicate the Python fact?” The HTML companion embeds
the real official image and cites its source URL directly below it.

## Current SystemSketch baseline

| Current reading primitive | Real current-editor capture | Primary seam |
| --- | --- | --- |
| Exclusive paths and a join | docs/assets/branch-region-3-wired.png | src/branch/branchModel.ts |
| Loop-carried previous value | docs/assets/loop-region-acceptance.png | src/loop/loopModel.ts |
| Mutating input and top-edge effect exit | docs/assets/effect-ports-3-wired-2026-09-03.png | src/blocks/blockModel.ts |
| Simple / Port / Expanded density | docs/assets/block-collapse-simple-2026-09-01.png, block-collapse-port-2026-09-01.png, block-collapse-expanded-2026-09-01.png | src/blocks/blockVisibility.ts |
| Port placement and explicit visibility | docs/assets/header-port-rows-product-2026-09-01.png | src/blocks/blockModel.ts and src/blocks/ui/BlockInspector.tsx |
| Unwired literal/default pill | docs/assets/literal-pill-product.png | src/blocks/blockModel.ts |
| Temporal/async edge treatment | docs/assets/async-edge-style-acceptance.png | src/blocks/connections/connectionModel.ts |
| Anchored comment with source reference | docs/assets/repo-improvements-local-comments.png | src/comments/commentModel.ts |

The audit corrects an important premise from the work order: SystemSketch already
has an effect exit derived from a mutated input. It is a top-edge port, not yet a
general exception/outcome grammar or a portless mutation endpoint.

---

# Track A — vocabulary dictionary

## Already have

### Branch, case, and source-visible join

**Text description.** LabVIEW Case Structures, Blueprint Branch/Switch nodes, and
Simulink If/Action plus Merge all make mutually exclusive paths readable. A Python
if or match has the same reader need, and SystemSketch's Branch region already
shows the exclusive scope and reconvergence without pretending the user authored
an execution graph.

**Current SystemSketch evidence.** The companion uses
docs/assets/branch-region-3-wired.png from the real editor and names
src/branch/branchModel.ts as the seam. Reference calibration is NI's [Case
Structure documentation](https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html),
Epic's [Flow Control reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine),
and MathWorks' [If block reference](https://www.mathworks.com/help/simulink/slref/if.html).

### Loop-carried value and previous-iteration read

**Text description.** LabVIEW's Feedback Node and Simulink's Unit Delay make the
previous value visibly different from an ordinary same-iteration wire. The
existing loop region and z⁻¹ treatment already carry that distinction; they
remain a semantic delay, not decorative loop wiring.

**Current SystemSketch evidence.** The companion uses
docs/assets/loop-region-acceptance.png from the real editor and names
src/loop/loopModel.ts as the seam. The official calibration sources are NI's
[Feedback Node](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html)
and MathWorks' [Unit Delay](https://www.mathworks.com/help/simulink/slref/unitdelay.html).

### Ordinary value flow versus an in-place-looking effect

**Text description.** A normal return value and a source-recognized mutation
should not visually imply the same thing. SystemSketch already derives a top-edge
effect exit for a mutating input while retaining ordinary data ports, which is the
useful part of structured-update precedent without adopting a library-sized node
palette.

**Current SystemSketch evidence.** The companion uses
docs/assets/effect-ports-3-wired-2026-09-03.png from the real editor and names
src/blocks/blockModel.ts as the seam. LabVIEW's [Bundle By
Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html)
and Blueprint's [Struct Variables guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27)
are calibration for the reader need, not proof of feature parity.

### Generic block ports for source expressions and calls

**Text description.** Python arithmetic, collection operations, construction, and
calls are already represented as source-derived blocks and ports. That generic
grammar is the right starting point; it keeps a reader close to the expression
rather than replacing every familiar Python operation with a branded reference
tool glyph.

**Current SystemSketch evidence.** The companion uses
docs/assets/header-port-rows-product-2026-09-01.png from the real editor and
names src/blocks/blockModel.ts as the seam. NI's [Formula
Node](https://www.ni.com/docs/en-US/bundle/labview/page/formula-node.html) and
MathWorks' [MATLAB Function block](https://www.mathworks.com/help/simulink/slref/matlabfunction.html)
are negative evidence: authoring tools need a text escape hatch, while
SystemSketch begins with Python source.

### Presentation-only temporal and async cable styling

**Text description.** SystemSketch can already style a data edge as temporal,
asynchronous, or delayed. That is a useful presentation primitive, but it does
not yet mean the analyzer has proved an async contract; the semantic relation is a
separate missing vocabulary entry below.

**Current SystemSketch evidence.** The companion uses
docs/assets/async-edge-style-acceptance.png from the real editor and names
src/blocks/connections/connectionModel.ts as the seam. NI's [wire
reference](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html)
is visual calibration only.

## Missing, would be useful

### Named record-field projection

**Text description.** A reader should be able to recognize a source-derived
record boundary and see the named members that are actually projected: a
dataclass attribute, TypedDict key, named tuple field, or a well-resolved
destructuring operation. The semantic is name-stable field access, not a generic
“struct node.”

**Official screenshot evidence.** The companion places three real captures
side-by-side: docs/assets/gap-labview-unbundle-by-name-2026-09-03.png from NI's
[Unbundle By Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html);
docs/assets/gap-blueprint-split-struct-2026-09-03.png from Epic's [Struct
Variables](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27);
and docs/assets/gap-simulink-bus-selector-2026-09-03.png from MathWorks' [Bus
Selector](https://www.mathworks.com/help/simulink/slref/busselector.html). NI
explicitly says Unbundle By Name selects cluster elements by name rather than
element order; Blueprint's split pin and Simulink's selected bus elements provide
independent visual convergence.

**Original SystemSketch projection.** Draw the resolved record as a normal
source-backed block or boundary with named field ports on the relevant side.
Connected fields are solid data ports; source-known but collapsed fields remain
inside a labelled field group. The canvas must not invent fields, reorder a source
contract, or turn an unresolved arbitrary mapping lookup into a false record
schema.

**Lift.** Medium-to-high. It needs analyzer facts for record identity and field
resolution, a compact group/port treatment, and conservative fallbacks for
dynamic attributes. It is a strong candidate because all three tools make named
aggregate boundaries legible.

### Named partial record update

**Text description.** A partial update such as setting one dataclass attribute,
returning a changed immutable record, or applying a resolved field assignment
should make both the preserved aggregate and the changed named member legible.
This is more specific than generic mutation: the reader needs to see which field
changed without mistaking it for a newly authored data schema.

**Official screenshot evidence.** The companion pairs
docs/assets/gap-labview-bundle-by-name-2026-09-03.png from NI's [Bundle By
Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html);
docs/assets/gap-blueprint-set-members-2026-09-03.png from Epic's [Struct
Variables](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27);
and docs/assets/gap-simulink-bus-assignment-2026-09-03.png from MathWorks' [Bus
Assignment](https://www.mathworks.com/help/simulink/slref/busassignment.html).
The tools converge on a retained aggregate plus explicitly chosen member updates,
even though their execution models differ.

**Original SystemSketch projection.** Keep the aggregate on a normal data route,
place the changed field name beside the source-derived update row, and retain the
existing top-edge effect exit only when the analyzer proves an in-place write.
For immutable replacement, show a new aggregate value instead. The diagram must
not collapse Python assignment, property setter behavior, and arbitrary helper
calls into one misleading mutation icon.

**Lift.** High. The renderer needs a reliable distinction among attribute
assignment, map update, dataclass replacement, setter calls, and unresolvable
side effects. Start with direct syntax and explicit immutable helpers rather than
guessing at library behavior.

### Conditional value selection

**Text description.** A conditional expression chooses one value without being an
effectful branch. Python conditional expressions are compact,
source-identifiable topology that can be rendered as a three-input Select form
when that reads more clearly than an expression block.

**Official screenshot evidence.** The companion shows
docs/assets/gap-labview-select-2026-09-03.png from NI's [Select
function](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/select.html)
beside docs/assets/gap-simulink-switch-2026-09-03.png from MathWorks' [Switch
block](https://www.mathworks.com/help/simulink/slref/switch.html). Epic's [Flow
Control reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine)
is the Blueprint source for the related Select/branch vocabulary. The useful
convergence is value choice, not an execution wire.

**Original SystemSketch projection.** Use one compact block with two value inputs
and one condition input, a single value output, and a source label preserving the
conditional expression. Do not add execution pins, join regions, or a new
authoring control.

**Lift.** Low-to-medium. It is already a V4 Select candidate and is easier than
the region proposals, but it has lower explanatory urgency. It should not
leapfrog exception or interface evidence merely because the icon is simple.

### Explicit exception and outcome region

**Text description.** A Python try/except/else/finally or raise is a real
alternative outcome path. A region should show normal value continuation and an
exceptional route into a named handler without inserting an artificial error port
on every ordinary call.

**Official screenshot evidence.** The companion places
docs/assets/gap-labview-error-wire-2026-09-03.png from NI's [Handling
Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html)
beside docs/assets/gap-blueprint-cast-failure-2026-09-03.png from Epic's
[Blueprint Communications](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine).
LabVIEW's error cluster carries status, code, and source through dataflow; the
Blueprint cast has an explicit success path and Cast Failed path. Their shared
reader need is visible non-normal outcome, not a shared failure mechanism.

**Original SystemSketch projection.** Draw the try body as a bounded source
region. Its ordinary result remains a normal cable; a labelled exception rail
reaches the matching handler and a re-raise leaves the region through an explicit
outcome endpoint. Handler names and exception types come from source. There is no
red error terminal on calls outside an explicit source boundary.

**Lift.** Medium-to-high. It needs analyzer facts, nesting and re-raise rules,
tests for else/finally, and a layout that does not obscure ordinary dataflow. This
is the first proposed semantic experiment, not an already-approved feature.

### Proven asynchronous handoff

**Text description.** A queue handoff or await boundary can be a meaningful
relationship when the analyzer recognizes the producer, transport, consumer, and
continuation from source. It should communicate a specific contract such as an
asyncio Queue put/get pair, not claim to visualize all concurrency or a global
timeline.

**Official screenshot evidence.** The companion shows
docs/assets/gap-labview-async-channel-2026-09-03.png from NI's [Using Wires to
Link Block Diagram Objects](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html)
beside docs/assets/gap-simulink-function-call-2026-09-03.png from MathWorks'
[Trigger reference](https://www.mathworks.com/help/simulink/slref/trigger.html).
NI distinguishes asynchronous channel wires; Simulink's function-call event is a
comparison for a non-value trigger relationship, not evidence that the runtimes
are equivalent.

**Original SystemSketch projection.** Use a visibly secondary named relation:
producer → source-recognized queue/await boundary → consumer/continuation. A
dashed packet-like cable can reuse current edge styling only after it carries the
source relation's actual name and kind. It must never imply ordering beyond what
the recognized source contract guarantees.

**Lift.** High. Cross-function identity, event-loop ownership, cancellation,
exceptions, and layout constraints are semantic design work. Begin with one idiom
such as a direct asyncio Queue pair rather than broad thread, task, or callback
inference.

### Named event publication and subscription

**Text description.** A named event relationship is distinct from a queued value:
it identifies a publisher, the event name, and one or more source-visible
subscribers or handlers. It is useful only when registration and dispatch are
explicit enough that a reader can trace both ends back to Python.

**Official screenshot evidence.** The companion places
docs/assets/gap-labview-event-structure-2026-09-03.png from NI's [Event
Structure](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/structures/event-structure.html);
docs/assets/gap-blueprint-bind-dispatcher-2026-09-03.png from Epic's [Binding
and Unbinding Events](https://dev.epicgames.com/documentation/en-us/unreal-engine/binding-and-unbinding-events-in-unreal-engine?lang=en-US);
and docs/assets/gap-stateflow-event-2026-09-03.png from MathWorks' [Control
State Execution by Using Events](https://www.mathworks.com/help/stateflow/ug/control-state-execution-by-using-events.html).
All three show named event/control relationships instead of ordinary value wires,
while exposing radically different authoring and runtime rules.

**Original SystemSketch projection.** Use a labelled relation that leaves a
source-visible publish or dispatch block and terminates at labelled handlers. The
event name is the diagram label; subscription can be a small anchor or badge
rather than an invented control-flow cable. Hidden framework registration,
reflection, and wildcard routing remain ordinary calls.

**Lift.** High. It needs source recognition for a deliberately small callback or
event API, identity across definitions, and a clear policy for multiple
subscribers. It should follow the queue experiment, not be combined with it.

### Explicit state and mode region

**Text description.** A state/mode region can make exclusive named modes,
event/guard transitions, and state-local behavior legible when Python source
explicitly encodes a state-machine protocol. It is not a decoration for an enum,
a boolean flag, or an ordinary if-chain.

**Official screenshot evidence.** The companion shows
docs/assets/gap-stateflow-modes-2026-09-03.png from MathWorks' [States
reference](https://www.mathworks.com/help/stateflow/ug/states.html) and
docs/assets/gap-stateflow-state-transition-2026-09-03.png from [Get Started with
Stateflow](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html).
Stateflow is intentionally treated as a single-tool visual lead, not cross-tool
proof.

**Original SystemSketch projection.** Draw a bounded region containing named mode
cells. Source-derived event or guard labels decorate arrows between cells; entry,
during, and exit behavior stays tied to source blocks inside the relevant mode.
The region appears only after a narrow analyzer rule, an explicit framework
adapter, or a source annotation chosen by Zach.

**Lift.** High and deliberately deferred. A false-positive statechart would
misstate Python more severely than no statechart at all. It needs a source-level
contract before any UI work starts.

## Missing, would not be useful

### Arithmetic, Boolean, comparison, and numeric palettes

Python operators, comparisons, comprehensions, and numeric calls are already
source expressions. Special LabVIEW/Blueprint/Simulink math glyphs would create
an authoring palette without adding a stable semantic boundary.

### Collection-operation and signal-routing palettes

Index, build, replace, map, set, mux, demux, and routing utilities are ordinary
Python expression or collection semantics. Preserve generic value flow and loop
grammar rather than adding a distinct block for each library operation.

### Sequence chains and generic execution wires

LabVIEW Flat Sequence and Blueprint Sequence make order explicit in tools whose
graph is the program. Python source order plus data and effect analysis are the
truth here; a generic sequence node would overstate a new dependency.

### Runtime latches, gates, and multi-fire nodes

Blueprint DoOnce, DoN, FlipFlop, Gate, and MultiGate encode hidden mutable runtime
state. If a Python protocol has explicit state, it belongs behind a future
source-proven state region, not a palette of opaque execution gadgets.

### Timers, waits, tick rates, and simulator scheduling

Timed Loops, Delay nodes, sample time, Rate Transition, solver settings, and
integrators describe runtime or simulation policy. A static Python renderer should
not claim scheduler semantics without separate live-execution evidence.

### Property, Invoke, Variant, hardware, actor-spawn, and framework palettes

These are host API surfaces. Attribute access, construction, reflection, and
framework calls should stay named Python calls rather than be recast as a foreign
glyph library.

### Visual macro, subgraph, and interface authoring

Blueprint macros, authored interfaces, and visual subVIs solve reuse in a graph
authoring language. Python definitions, decorators, Protocols, ABCs, and existing
definition linking remain the one canonical definition surface.

---

# Track B — UI controls dictionary

## Already have

### Three density levels without deleting relationships

**Text description.** Compact reading should hide detail without destroying a
source-derived interface. Simple, Port, and Expanded views already provide that
continuum and preserve the ability to recover ports and internal context.

**Current SystemSketch evidence.** The companion shows
docs/assets/block-collapse-simple-2026-09-01.png,
docs/assets/block-collapse-port-2026-09-01.png, and
docs/assets/block-collapse-expanded-2026-09-01.png from the real editor. The
seam is src/blocks/blockVisibility.ts. NI's [View As Icon
reference](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html)
is a visual precedent, not a reason to copy VI authoring.

### Explicit port visibility and row placement

**Text description.** A block can already place a port in header, body, or hidden
presentation and can toggle its visibility. This is a presentation choice over a
source-derived port; it does not change a Python callable signature.

**Current SystemSketch evidence.** The companion uses
docs/assets/header-port-rows-product-2026-09-01.png and
docs/assets/inspector-field-guidance-2026-09-03.png from the real editor. The
seams are src/blocks/blockModel.ts and src/blocks/ui/BlockInspector.tsx.
Blueprint's [Struct Variables guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27)
is calibration for exposed versus hidden member pins.

### Literal/default value pill

**Text description.** An unwired value is meaningful information rather than a
broken edge. SystemSketch already shows a literal/default pill on an unconnected
port, preserving the distinction between a source/default value and a connected
override.

**Current SystemSketch evidence.** The companion uses
docs/assets/literal-pill-product.png from the real editor and names
src/blocks/blockModel.ts as the seam. NI's [Creating and Editing User-Defined
Constants](https://www.ni.com/docs/en-AS/bundle/labview/page/creating-and-editing-user-defined-constants.html)
is reference calibration only.

### Inspector-backed generic presentation settings

**Text description.** The inspector already owns generic presentation settings
such as port visibility, defaults, and mutation metadata. That is the right place
for a renderer setting because it does not pretend to be a LabVIEW Property Node,
Blueprint Details panel, or Simulink mask program.

**Current SystemSketch evidence.** The companion uses
docs/assets/inspector-field-guidance-2026-09-03.png from the real editor and
names src/blocks/ui/BlockInspector.tsx as the seam. The reference tools'
property and details surfaces are context, not a feature checklist.

### Anchored comments and source references

**Text description.** Comments can follow a shape, point, region, or page and can
retain an optional Python source reference. That identity model is already more
durable than a loose visual grouping comment and should remain separate from
semantic vocabulary.

**Current SystemSketch evidence.** The companion uses
docs/assets/repo-improvements-local-comments.png from the real editor and names
src/comments/commentModel.ts as the seam. Epic's [Comments
reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/comments-in-unreal-engine?lang=en-US)
is calibration for the reader need, not a model to clone.

### Edge type is already visually distinguishable

**Text description.** A reader can distinguish a temporal or async-styled edge
from ordinary value flow today. The shipped control is presentation-only, which
is appropriate until the analyzer can attach a real relation contract.

**Current SystemSketch evidence.** The companion uses
docs/assets/async-edge-style-acceptance.png from the real editor and names
src/blocks/connections/connectionModel.ts as the seam. A semantic async badge or
relation inspector belongs in the useful bucket only after Track A recognition
exists.

## Missing, would be useful

### Source-derived Python call contract

**Text description.** A rendered function definition or call should let a reader
scan which arguments are required, which have source defaults, which are
keyword-only, and which are variadic when analysis is reliable. This is an
information display, not a wire-validity rule or a canvas editor for the
signature.

**Official screenshot evidence.** The companion puts
docs/assets/gap-labview-connector-contract-2026-09-03.png from NI's [Required,
Recommended, and Optional Inputs and Outputs](https://www.ni.com/docs/en-US/bundle/labview/page/setting-required-recommended-and-optional-inputs-and-outputs.html)
beside docs/assets/gap-blueprint-function-call-2026-09-03.png from Epic's
[Functions documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27)
and docs/assets/gap-simulink-function-caller-2026-09-03.png from MathWorks'
[Function Caller](https://www.mathworks.com/help/simulink/slref/functioncaller.html).
The convergence is visible call interface; only LabVIEW's connector pane adds a
required/recommended/optional wiring policy.

**Original SystemSketch projection.** Render small, source-derived row badges or
groups: required, defaulted, keyword-only, positional-only when useful, and
variadic. Keep the source spelling nearby and leave all values/cables optional as
Python permits. There is intentionally no recommended class, because Python has
no corresponding semantic fact.

**Lift.** Medium. It needs analyzer signature facts and density testing, but no
new program semantics. A first prototype can target resolved local definitions
before imports, overloads, decorators, and dynamically generated callables.

### Source-derived variadic parameter summary

**Text description.** A Python function that declares variadic positional or
keyword capture parameters already states that fact in source. A compact,
expandable summary can make the open-ended portion of the interface legible
without giving the canvas a plus-pin command or implying that an occurrence may
change the function signature.

**Official screenshot evidence.** The companion uses the existing official
capture docs/assets/gap-blueprint-function-call-2026-09-03.png from Epic's
[Functions documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27).
Epic's [Add Pin interface reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Editor/BlueprintGraph/IK2Node_AddPinInterface?lang=en-US)
explains why an authoring graph exposes a pin-add control; the SystemSketch
translation must be read-only because Python has already declared the variadic
boundary.

**Original SystemSketch projection.** Keep named fixed parameters as ordinary
rows, then show one grouped variadic row with the source spelling and an expand
affordance. Expansion reveals a source fact or call-site summary; it never adds,
removes, or rewrites a port. The group remains visibly distinct from a list of
ordinary optional parameters.

**Lift.** Low-to-medium after call-contract facts exist. The analyzer must publish
reliable variadic metadata and the UI must preserve row identity across
collapse/expand, but no new semantic relation or editable node interface is
needed.

### Source-derived field exposure control

**Text description.** A reader should be able to collapse or expand named,
source-known fields without losing the truth that a record has a broader
interface. This is a control over the record projection from Track A, not a way
to create or remove fields on the canvas.

**Official screenshot evidence.** The companion places
docs/assets/gap-labview-unbundle-by-name-2026-09-03.png from NI's [Unbundle By
Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html);
docs/assets/gap-blueprint-hidden-pins-2026-09-03.png from Epic's [Struct
Variables](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27);
and docs/assets/gap-simulink-bus-selector-2026-09-03.png from MathWorks' [Bus
Selector](https://www.mathworks.com/help/simulink/slref/busselector.html). The
references show selective interface exposure, but SystemSketch must derive field
identity from source rather than treat wire connection as authority.

**Original SystemSketch projection.** Add a compact field-group affordance:
expanded named rows, a summary count when collapsed, and an inspector list that
can only choose among analyzer-known fields. A required function parameter cannot
be hidden in a way that makes the callable look smaller; collapsed means
summarized, not absent.

**Lift.** Medium-to-high. It depends on Track A field resolution, stable identity
across source changes, and layout behavior when different occurrences choose
different exposure levels.

### Default provenance and override visibility

**Text description.** A call site needs to distinguish a source signature default
from a literal supplied at the call and from a connected upstream value. The
current pill covers the local visual primitive; source-derived provenance makes
the reading contract explicit for resolved calls.

**Official screenshot evidence.** The companion uses NI's
docs/assets/gap-labview-connector-contract-2026-09-03.png from [Required,
Recommended, and Optional Inputs and Outputs](https://www.ni.com/docs/en-US/bundle/labview/page/setting-required-recommended-and-optional-inputs-and-outputs.html)
and Epic's docs/assets/gap-blueprint-function-call-2026-09-03.png from
[Functions documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27).
They are evidence that interface/default status is worth showing, not permission
to copy editor-specific default-setting controls.

**Original SystemSketch projection.** Keep the existing value pill but add a
small provenance label on a resolved input: signature default, call literal, or
wired override. Tooltip/source navigation can reveal the definition location.
Never let a board control mutate the canonical default.

**Lift.** Medium. It relies on the same call-resolution facts as the contract
display and should be designed with it, but it can be deferred if visual density
becomes too high.

### Generated, source-linked configuration lens

**Text description.** Readers sometimes need an interface-oriented view of a
constructor or function: resolved annotations, source defaults, and the
definition location. The useful residue of mask and Details-panel precedent is a
generated, read-only source lens beside the existing inspector—not a dialog that
becomes another program.

**Official screenshot evidence.** The companion pairs the existing official
capture docs/assets/gap-simulink-mask-dialog-2026-09-03.png from MathWorks'
[Create Dynamic Mask Dialog Boxes](https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html)
with docs/assets/gap-blueprint-function-call-2026-09-03.png from Epic's
[Functions documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27).
The first makes the boundary clear: Simulink masks can be authored and can run
callbacks, while SystemSketch may only explain a Python-owned configuration
contract.

**Original SystemSketch projection.** Selecting a resolved call or constructor
opens a compact Source lens card with a source path, annotations, default
provenance, and a navigation link to Python. Its controls are inspection and
presentation only. It has no user-authored fields, callbacks, dynamic visibility
rules, or save action that would mutate source outside the normal source editor.

**Lift.** Medium-to-high. It becomes useful only after robust definition links,
annotation/default resolution, and a clear read-only contract exist. It belongs
beside the inspector and should be prototyped after the call-contract display,
not as a generalized mask system.

### Semantic relation inspection

**Text description.** When a future outcome, queue, event, or state relation is
recognized, visual style alone will not explain its proof boundary. The reader
needs a read-only inspector summary of the source pattern, participants, and
known limitations.

**Official screenshot evidence.** The companion reuses the official event and
outcome captures from Track A: NI Event Structure, Epic Bind Event, Stateflow
event, NI error handling, and Blueprint Cast Failed. Their tool-specific controls
are intentionally not copied; they establish that non-value relations benefit
from explicit labels and inspectable identity.

**Original SystemSketch projection.** Select a relation to reveal a terse,
source-linked inspector: relation kind, source expression(s), endpoints, and
what is deliberately unknown such as ordering or cancellation. The board stays a
view; no dropdown can change a callback graph or exception behavior.

**Lift.** Medium after, and only after, the corresponding Track A grammar exists.
It is not a standalone UI project.

## Missing, would not be useful

### Simulink masks and dynamic parameter-dialog authoring

Masked subsystems let an author program a separate dialog that can show, hide,
enable, or disable controls. That is a second user-authored language surface and
conflicts with Python as the canonical definition.

### LabVIEW recommended-terminal policy

Python can state required/defaulted/keyword-only facts but has no semantic
equivalent of a recommended wire. A synthetic middle tier would make the renderer
assert a validation rule the source language does not own.

### Automatic hide-unconnected behavior

Hiding an interface solely because a cable is absent makes accidental board layout
look like callable truth. Keep explicit presentation choices and source-derived
summaries; do not let a wire's current presence redefine a signature.

### Per-library Property, Invoke, Details, and hardware configuration panels

These controls belong to their reference tools' runtimes and frameworks. Generic
inspection is already available; library-specific configuration widgets would
recreate a foreign palette inside a Python renderer.

### Canvas-based signature, field-schema, or default editing

The canvas may reveal Python-derived contracts but must not become a second way to
change them. Editing a signature, adding a field, or changing a default belongs in
Python source and should flow back through analysis.

### Runtime playback, scheduler, solver, and simulation controls

Playback, execution rate, numerical solver, and live hardware controls require
runtime authority. They are out of scope for a static source renderer even when a
future live-execution view may expose measured state.

---

# Convergence map

| Reader question | Independent reference answer | Translation that survives Python source authority |
| --- | --- | --- |
| How do mutually exclusive paths and a join read? | LabVIEW Case; Blueprint Branch/Switch; Simulink If/Action + Merge | Existing Branch region and source-derived join |
| How does a previous iteration read? | LabVIEW Feedback; Simulink Unit Delay | Existing loop z⁻¹ treatment |
| How do named aggregate members read? | LabVIEW Unbundle/Bundle By Name; Blueprint split/set members; Simulink Bus Selector/Assignment | Source-derived field projection and partial update, not an editable struct palette |
| How does a conditional value differ from a branch? | LabVIEW Select; Blueprint Select; Simulink Switch | Compact source-derived Select candidate |
| How does a non-normal outcome read? | LabVIEW error wires; Blueprint Cast Failed | Explicit Python exception/outcome region, never universal error plumbing |
| How does an asynchronous or event relation read? | LabVIEW channel/Event Structure; Blueprint dispatcher; Simulink function-call/Stateflow event | Named, analyzer-proven relation with stated limits |
| How does explicit mode behavior read? | Stateflow states and transitions | High-bar source-recognized state region only |
| How does a callable interface scan? | LabVIEW connector pane; Blueprint function pins; Simulink Function Caller | Read-only required/defaulted/keyword-only contract |
| How should an interface get dense? | Blueprint pin exposure; LabVIEW compact icon; Simulink port/mask conventions | Existing views plus source-derived field summary, not wire-driven hiding |

# Your thinking, sharpened

1. **Convergence identifies a reader constraint, not a permission to clone an
   authoring UI.** Case joins, previous values, field names, and call contracts
   recur because readers need those facts; palettes and runtime widgets recur
   because their hosts author programs visually.
2. **The Unbundle By Name lesson is stable field identity.** NI's order-independent
   named selection is stronger precedent than a generic cluster icon. It points
   to source-resolved dataclass/TypedDict/destructuring facts, not a user-authored
   record schema.
3. **The Bundle By Name lesson is retained aggregate plus named change.** It is a
   useful reading aid only when Python analysis can distinguish direct field
   mutation from immutable replacement and opaque side effects.
4. **An error wire is not the answer to Python exceptions.** The transferable
   insight is visible abnormal outcome. Python's try/except/raise grammar provides
   a more honest boundary than red pins everywhere.
5. **Async is the pressure test for the DAG claim.** A good first step is a
   narrow source-recognized queue, await, or event relation with known endpoints,
   not a fabricated global execution timeline.
6. **State is a semantic commitment, not a prettier if-chain.** Stateflow offers
   excellent visual grammar, but a false-positive statechart would be worse than
   no statechart. It needs an explicit source contract.
7. **A control is safe when it exposes a source fact.** Required/defaulted/
   keyword-only badges, field summaries, and provenance labels preserve source
   truth. Recommended wiring, masks, and canvas-first editing create a second
   authority.
8. **Current SystemSketch is farther along than the work order assumed.** Branch,
   loop feedback, effect exit, density, visibility, literals, styled edges, and
   anchored comments are useful primitives. The next work is semantic recognition
   and narrower projection, not wholesale UI replacement.

# Decision surface

## Done

- Rebuilt the research source as an evidence-first Track A/Track B dictionary,
  one concept per heading.
- Audited current SystemSketch grammar against live code seams and attached a real
  current-editor capture to every already-have concept.
- Captured and indexed official NI, Epic, and MathWorks evidence for positive
  gaps, including the requested NI Unbundle By Name reference.
- Kept every positive proposal in description → official screenshot(s) → original
  SystemSketch projection → lift order for the rendered companion.
- Separated field projection, partial update, Select, exception outcome, async
  handoff, events, state modes, call contract, field exposure, provenance, and
  relation inspection rather than hiding them in a broad nodes category.

## Left

- Build no product feature from this research until one candidate is selected.
- Prototype the exception/outcome region with only explicit Python syntax first;
  do not infer failures from ordinary calls.
- Choose one async idiom and one event idiom independently if either is pursued;
  do not ship a broad async cable whose meaning cannot be stated.
- Resolve analyzer facts for records, dataclasses, TypedDicts, destructuring, and
  direct updates before designing field groups.
- Run density studies on call-contract badges, field summaries, and default
  provenance before treating any one as default-visible.

## Needs Zach

- Which concrete Python exception patterns belong in a first outcome experiment:
  syntax only, or one explicit result-like protocol as well?
- Which source idiom is valuable enough to earn the first async relation: direct
  asyncio Queue, an await continuation, or a named callback pair?
- Is there an existing source-level state-machine convention or annotation that
  makes a high-confidence state region legitimate?
- At what density should a normal call show signature detail: always, on hover,
  in Port/Expanded only, or inspector-first?
- Which record families are worth supporting first: dataclasses, TypedDicts,
  named tuples, explicit pattern matching, or a narrower subset?

## Deliberately not done

- No draggable LabVIEW, Blueprint, or Simulink palette.
- No code, schema, analyzer, or canvas behavior change; this is research only.
- No universal error port, no global async timeline, no inferred statechart, and
  no library-specific node glyph collection.
- No Simulink mask authoring, LabVIEW recommended-terminal enforcement, automatic
  hide-unconnected semantics, or canvas editing of Python contracts.
- No vault write from this repository worktree.

# Primary-source index

## NI LabVIEW

1. NI, [Unbundle By Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html) — selects named cluster elements without tracking their order; primary evidence for source-derived named field projection.
2. NI, [Bundle By Name](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html) — updates selected named cluster elements; primary evidence for named partial record update.
3. NI, [Select function](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/select.html) — conditional value selection.
4. NI, [Handling Errors](https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html) — error cluster and propagation behavior.
5. NI, [Using Wires to Link Block Diagram Objects](https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html) — normal wires and asynchronous channel-wire grammar.
6. NI, [Event Structure](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/structures/event-structure.html) — event cases and event-driven control.
7. NI, [Case Structures: Executing a Section of Code Based on Input Values](https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html) — selected case execution.
8. NI, [Feedback Node](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/feedback-node.html) — previous-iteration dataflow precedent.
9. NI, [Required, Recommended, and Optional Inputs and Outputs](https://www.ni.com/docs/en-US/bundle/labview/page/setting-required-recommended-and-optional-inputs-and-outputs.html) — connector-pane terminal categories.
10. NI, [Formula Node](https://www.ni.com/docs/en-US/bundle/labview/page/formula-node.html) — text escape hatch inside an authoring graph.
11. NI, [View As Icon](https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/properties-and-methods/vi-server/generic/gobject/node/subvi/viewasicon.html) — compact node display.
12. NI, [Creating and Editing User-Defined Constants](https://www.ni.com/docs/en-AS/bundle/labview/page/creating-and-editing-user-defined-constants.html) — readable constant/default precedent.
13. NI, [LabVIEW Arrays and Clusters Explained](https://www.ni.com/en/support/documentation/supplemental/08/labview-arrays-and-clusters-explained.html) — cluster vocabulary and background context.

## Epic Unreal Blueprint

14. Epic Games, [Struct Variables in Blueprints](https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27) — Split Struct Pin, Set Members, As Pin, and Hide Unconnected Pins.
15. Epic Games, [Flow Control in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine) — Branch, Select/Switch, Sequence, Gate, DoOnce, and related execution vocabulary.
16. Epic Games, [Blueprint Communications](https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine) — cast example with a distinct Cast Failed execution path.
17. Epic Games, [Binding and Unbinding Events](https://dev.epicgames.com/documentation/en-us/unreal-engine/binding-and-unbinding-events-in-unreal-engine?lang=en-US) — dispatcher binding relationship.
18. Epic Games, [Creating Dispatcher Events](https://dev.epicgames.com/documentation/en-us/unreal-engine/creating-dispatcher-events-in-unreal-engine) — dispatcher/event behavior.
19. Epic Games, [Custom Events](https://dev.epicgames.com/documentation/en-us/unreal-engine/custom-events-in-unreal-engine) — named events and parameters.
20. Epic Games, [Functions](https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27) — function-call pins and interface reading.
21. Epic Games, [Macros](https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine?lang=en-US) — graph-authoring reuse mechanism that does not transfer.
22. Epic Games, [Implementing Blueprint Interfaces](https://dev.epicgames.com/documentation/en-us/unreal-engine/implementing-blueprint-interfaces-in-unreal-engine?lang=en-US) — visual-interface authoring precedent that does not transfer.
23. Epic Games, [Comments](https://dev.epicgames.com/documentation/en-us/unreal-engine/comments-in-unreal-engine?lang=en-US) — comments and visual grouping context.
24. Epic Games, [Nodes](https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine) — collapsed-graph boundary/tunnel context.

## MathWorks Simulink and Stateflow

25. MathWorks, [If](https://www.mathworks.com/help/simulink/slref/if.html) — conditional subsystem activation.
26. MathWorks, [Unit Delay](https://www.mathworks.com/help/simulink/slref/unitdelay.html) — delayed/previous-value precedent.
27. MathWorks, [Bus Selector](https://www.mathworks.com/help/simulink/slref/busselector.html) — selected named bus elements.
28. MathWorks, [Bus Assignment](https://www.mathworks.com/help/simulink/slref/busassignment.html) — partial bus-element update.
29. MathWorks, [Switch](https://www.mathworks.com/help/simulink/slref/switch.html) — conditional value selection.
30. MathWorks, [Function Caller](https://www.mathworks.com/help/simulink/slref/functioncaller.html) — function interface visualization.
31. MathWorks, [Trigger](https://www.mathworks.com/help/simulink/slref/trigger.html) — function-call/triggered relationship comparison.
32. MathWorks, [MATLAB Function](https://www.mathworks.com/help/simulink/slref/matlabfunction.html) — ports generated from function source.
33. MathWorks, [Get Started with Stateflow](https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html) — statechart, event, and transition overview.
34. MathWorks, [States](https://www.mathworks.com/help/stateflow/ug/states.html) — named state hierarchy and behavior.
35. MathWorks, [Control State Execution by Using Events](https://www.mathworks.com/help/stateflow/ug/control-state-execution-by-using-events.html) — event-triggered state transitions.
36. MathWorks, [Create Dynamic Mask Dialog Boxes](https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html) — dynamic mask authoring, deliberately excluded.
37. Epic Games, [Add Pin Interface](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Editor/BlueprintGraph/IK2Node_AddPinInterface?lang=en-US) — authoring-side pin addition, used as contrast for a read-only Python variadic summary.

# Research limits

Reference documentation is evidence for each source tool's own model. A proposed
SystemSketch translation is an inference filtered through Python source authority
and the current renderer audit; it is not a specification or an implementation
commitment. Vendor screenshots make the visual claim inspectable, but only a
future source-level decision can authorize a product change.
