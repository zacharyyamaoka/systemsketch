# Behavior Trees in SystemSketch — MoveIt Studio Pro, BehaviorTree.CPP, and Groot2 prior-art atlas

**Research date:** 2026-09-04
**Companion:** [rendered visual dictionary](behavior-tree-moveit-groot-prior-art-2026-09-04.html) · [official-screen capture manifest](assets/behavior-tree-prior-art-captures-2026-09-04.json)
**Scope:** a concrete copy / adapt / defer / reject inventory for SystemSketch behavior-tree authoring and its surrounding editor controls. This is research, not an implementation plan or an FR artifact.

## Research lineage

- [Behavior Tree representation research gallery](behavior-tree-representations-research-2026-09-04.html) — the earlier, high-level one-definition / Tree / Process / Data Contract direction.
- [Gap-analysis prototype review hub](gap-analysis-prototype-review-hub-2026-09-04.html) — retained independent prototype history; it must not be mistaken for behavior-tree capability shipped to `main`.
- **This atlas** — the new primary-source, item-by-item MoveIt / BT.CPP / Groot2 authoring and editor-control census.

## The short answer

Copy the **small control grammar**, **typed leaf contracts**, **explicit SubTree boundary**, **contextual insert/search**, and **runtime evidence stack** shared by MoveIt Studio Pro and BehaviorTree.CPP/Groot2. Do **not** copy their implicit global Blackboard, XML-centric authoring, robotics-specific palette, or a permanent IDE-pane layout.

The high-confidence SystemSketch shape is one canonical `BehaviorTreeDefinition`, shown by default as a top-to-bottom control tree. A selected **Data Contract** lens can reveal ordinary left-to-right SystemSketch cables between typed ports; a **Runtime** lens can show tick/status/trace evidence. Those are projections of one definition, not three diagrams that drift apart.

This strengthens Zach’s existing direction rather than replacing it: data, events, configuration, state, and results remain ordinary data traveling through normal SystemSketch ports/cables. The semantic tag belongs to a port and transfers onto its cable. A behavior-tree child edge is a separate, structural *tick/priority* relationship.

## What is actually available today

`main` at the start of this research (`8d8cb5a`) has a representation-research gallery but **no merged behavior-tree product surface**. The retained `track/behavior-tree-prototype`, `track/behavior-tree-projections`, and `codex/behavior-tree-authoring` branches are useful experiments, not shipped capability. In particular, none gives users an authoring palette, editable hierarchy, typed BT port mapping, runtime adapter, breakpoint, trace, or Groot/BT.CPP interoperability.

That distinction matters: this atlas is an evidence-backed first authoring target, not a claim that those features already exist.

## Reading rule and evaluation criteria

The official vendors do not agree on product scope—MoveIt is a robot-operations environment and Groot is an IDE for BehaviorTree.CPP—but they converge on the behavior-tree substrate. Each recommendation below is judged before the conclusion, with these weighted criteria:

| Criterion | Weight | What it asks |
| --- | ---: | --- |
| Execution truth | 30 | Does it make ordering, interruption, and terminal status legible instead of pretending it is ordinary dataflow? |
| Explicit data provenance | 25 | Does it preserve SystemSketch’s typed ports, visible wire semantics, and source-of-value story? |
| Authoring clarity | 20 | Can a person build/reorder/reuse a tree without an encyclopedic palette or manual edge routing? |
| Reuse and navigation | 15 | Does it make nested behavior definitions, boundaries, and depth obvious? |
| Honest runtime boundary | 10 | Does it only promise debug/run controls when a real runtime adapter can support them? |

Labels mean:

- **Copy** — carry the semantics and a close interaction shape forward.
- **Adapt** — preserve the useful intent while changing the source tool’s implementation or visual grammar.
- **Later** — valuable, but only after the canonical authoring model or a runtime adapter exists.
- **Reject** — deliberately not a SystemSketch default.

## Canvas dictionary — behavior-tree semantics

| ID | Concept | What primary sources prove | SystemSketch decision |
| --- | --- | --- | --- |
| A01 | **One root and ordered structural children** | BT.CPP’s tick starts at the root; control nodes govern their children. MoveIt calls its top-level tree an Objective. | **Copy.** Use a dedicated top-to-bottom structural child relation, not a normal data cable. Root and child order are first-class persisted facts. |
| A02 | **Action / Task leaf** | MoveIt describes Actions as task-performing leaves that may be `RUNNING`, `SUCCESS`, or `FAILURE`; Groot shows them as typed models. | **Copy.** A Task card owns inputs, outputs, cancellation contract, provenance, and runtime state. It can point to a Python/source-backed implementation later. |
| A03 | **Condition / Guard leaf** | MoveIt and BT.CPP distinguish Conditions: a simple check that cannot return `RUNNING`. | **Copy.** Make Guard visibly read-only/decision-like, with an explicit boolean/result contract rather than a hidden script string. |
| A04 | **Sequence** | BT.CPP’s Sequence proceeds through ordered children and stops at the first failure/running child. | **Copy.** It is the ordinary “then” container. Variants should be one Sequence visual form with a visible execution-policy field (`memory`, `reactive`, `async`) rather than four nearly indistinguishable stock blocks. |
| A05 | **Fallback / Selector** | BT.CPP calls this family Selector/Priority; MoveIt uses Fallback for expected-recovery patterns. | **Copy.** It is the ordinary alternative/recovery container. Make restart/reactivity a policy chip, not a separate color language. |
| A06 | **Parallel and its thresholds** | BT.CPP exposes Parallel/ParallelAll; MoveIt makes success/failure policy explicit. BT.CPP cautions that “concurrent” ticking does not by itself mean threads. | **Later / adapt.** Keep one Parallel form with success/failure threshold and cancellation policy in the inspector. Do not imply safe parallel execution until the runtime adapter has it. |
| A07 | **Conditional control and Case** | BT.CPP has `IfThenElse`, reactive `WhileDoElse`, and fixed-arity `Switch2`–`Switch6`. | **Adapt.** Reuse SystemSketch’s familiar Branch / value-selection grammar: a named `if`/`then`/`else` container and one editable Case form. Reactive re-check and cancellation must be plain in the inspector. |
| A08 | **Decorator / policy wrapper** | BT.CPP decorators always have one child and control when/how it is ticked or transform terminal outcome. | **Copy the shape; adapt the catalogue.** Use one one-child policy wrapper. Start with readable policies (`Guard`, `Retry(max)`, `Repeat(n)`, `Run once`); add `Timeout`/`Delay` only with runtime support. |
| A09 | **Try / cleanup / exceptional outcome** | BT.CPP 4.9 adds `TryCatch`; MoveIt distinguishes ordinary `FAILURE` from an Objective crash. | **Do not copy a top-side exception rail.** Zach’s railway outcome is normal data: leaf result/error ports stay in ordinary dataflow. A later cleanup policy may attach to a control container, but it is not a special effect wire. |
| A10 | **Typed ports, defaults, and node model** | Groot’s `TreeNodesModel` supplies types and input/output port names; BT.CPP recommends explicit ports over direct Blackboard access. | **Copy strongly.** Stock/custom behavior definitions own named, typed, directional port rows, required/default state, description, semantic tag, and source provenance. A port tag automatically labels its wire as `data`, `event`, `state`, `configuration`, or `result/error`. |
| A11 | **SubTree call, boundary, and remapping** | MoveIt treats Objectives as reusable Subtrees; BT.CPP supports explicit SubTree port remapping and defaults. | **Copy strongly.** A SubTree is a named call/reference with collapse, jump-to-definition, breadcrumb depth, and visible boundary ports. Offer suggested matching bindings; never silently create invisible data coupling. |
| A12 | **Collapse and automatic layout** | MoveIt’s editor presents a structured, automatically laid-out tree; Groot retains tree/project navigation. | **Copy.** Tree layout is deterministic; collapse is persisted presentation metadata. No freehand structural edge routing. |
| A13 | **Contextual insertion and reorder** | MoveIt’s recommended blue `+` opens a search dialog at the exact child slot, then supports drag/reorder. Groot supports drag/drop editing. | **Copy.** Each legal child slot gets a quiet `+`; search is first-class and a full library remains an alternate route. Preview a legal drop and preserve child order precisely. |
| A14 | **Valid/invalid authoring state** | MoveIt creates a valid starter leaf, warns about malformed trees, and requires valid ports; Groot’s model layer makes node metadata importable. | **Copy.** Validate missing root, child arity, illegal nesting, unresolved leaf definition, missing required binding, wrong type, and SubTree cycles. Explain the repair locally; never hide invalidity behind a red wire alone. |
| A15 | **Disable/comment out** | MoveIt lets an author skip a node while preserving it, visibly marks the state, and serializes its skip property. | **Copy / adapt.** A disabled node remains visible but is ignored by the runtime adapter. It should not be deleted or converted into fake success without an explicit policy. |
| A16 | **Global Blackboard as the normal data bus** | MoveIt and Groot expose Blackboard views, but BT.CPP’s own ports-vs-Blackboard guide says direct blackboard access is discouraged. | **Reject as the default.** Retain a scoped runtime/provenance inspector, but normal authored dataflow crosses explicit ports/remappings and ordinary SystemSketch cables. |
| A17 | **Inline BT.CPP scripting / XML expression language** | BT.CPP supports scripts and pre/postconditions that read/write Blackboard variables. | **Reject literally.** Do not make a parallel mini-language inside a whiteboard. If needed later, link an explicit Python/value expression Block and keep the data contract visible. |
| A18 | **Robotics behavior palette, ROS panes, planning-scene objects** | MoveIt’s 200+ specialized Behaviors and 3D robot world solve its robotics problem. | **Reject.** Copy the *registry/provenance mechanism*, not robot-specific stock blocks or panes. |

### Exact native BT.CPP inventory, normalized for SystemSketch

BT.CPP’s native library groups Parallel, conditional controls, Switch, Decorators, Fallbacks, and Sequences. The underlying variants are useful semantic evidence, but are deliberately not a one-to-one SystemSketch palette:

| Source family / member | SystemSketch representation | Decision |
| --- | --- | --- |
| `Sequence`, `SequenceWithMemory`, `ReactiveSequence`, `AsyncSequence` | `Sequence` + `executionPolicy` | Copy/adapt |
| `Fallback`, `ReactiveFallback`, `AsyncFallback` | `Fallback` + `executionPolicy` | Copy/adapt |
| `Parallel`, `ParallelAll` | `Parallel` + success/failure/cancel policy | Later |
| `IfThenElse`, `WhileDoElse` | `Branch` with one-shot/reactive mode | Copy/adapt |
| `Switch2` … `Switch6` | Variable-arity `Case` | Copy/adapt |
| `TryCatch` | ordinary result/error data + later cleanup policy | Do not literal-copy |
| `Inverter`, `ForceSuccess`, `ForceFailure` | policy wrapper terminal mapping | Later |
| `Repeat`, `RetryUntilSuccessful`, `KeepRunningUntilFailure`, `RunOnce` | policy wrapper with named parameter | Copy/adapt |
| `Delay`, `Timeout` | policy wrapper with visible duration / cancellation contract | Later |
| `Precondition` / pre-post scripts | visible Guard / result-policy attachment | Adapt; no inline script DSL |
| `SetBlackboard`, `WasEntryUpdated`, `WaitValueUpdate`, `Sleep`, `Loop*` | normal tagged port/cable + eventual runtime trigger/clock source | Defer unless a concrete SystemSketch use case appears |

## Editor and surrounding-control dictionary

| ID | Surface | What primary sources prove | SystemSketch decision |
| --- | --- | --- | --- |
| B01 | **Contextual library and search** | MoveIt recommends `+` → searchable Behavior picker, with a left library as fallback; Groot has drag/drop and large-tree node search. | **Copy.** Search by name, kind, tag, source, and favorite; insert only where the structural contract permits. |
| B02 | **Compact port disclosure** | MoveIt can show no ports, 1–5 ports, or all, defaulting to compact nodes. | **Copy.** A local/global port-detail level lets Tree View remain scannable without changing the data contract. |
| B03 | **Inspector for node parameters** | MoveIt uses a parameter sidebar for typed port value selection and node name. | **Copy.** The inspector owns values, default/required status, semantic tags, documentation/source link, call sites, policy, and provenance—not a second canvas. |
| B04 | **Project/tree navigator** | Groot exposes a project/tree list; MoveIt has an Objective sidebar and search. | **Adapt.** A lightweight Definitions/uses browser supports named SubTrees and source-backed behavior definitions. Avoid a robotics “Objective library” shell. |
| B05 | **Breadcrumbs and jump-to-definition** | MoveIt lets an Objective act as a SubTree; Groot maintains multiple trees; BT.CPP gives nested instance paths. | **Copy strongly.** A `System / Pick / Place / Approach` breadcrumb doubles as a depth indicator and direct jump control. It complements Step In/Out rather than forcing page navigation. |
| B06 | **Selection, multi-select, copy/paste, delete, undo/redo** | MoveIt documents conventional keyboard operations and bottom-bar undo/redo; Groot supplies conventional editor controls. | **Copy the conventional behavior.** Reuse stock tldraw where it is already correct, adding tree-aware safety around root, imported/read-only definition, and child order. |
| B07 | **Focus, fit, and deterministic relayout** | MoveIt puts zoom, fit, search, undo/redo in compact canvas chrome; structured tree editors avoid manual structural edge drawing. | **Copy.** `Focus active`, `Fit tree`, `Reveal parent/children`, and `Relayout` are useful commands. Relayout changes presentation only. |
| B08 | **Persisted expansion, camera, and overview** | Groot persists SubTree expansion/camera; MoveIt presents collapsible behavior detail. | **Copy.** Keep view state separate from definition state so collaboration/file round trips preserve intent without creating semantic drift. |
| B09 | **Large pane-layout configurator** | MoveIt can split/remove panes and choose 1–6 layouts. | **Defer / do not copy directly.** SystemSketch is currently FigJam-like; selection-linked inspectors and temporary views should prove themselves before a fixed IDE chrome is chosen. |
| B10 | **Editor / monitor / replay mode separation** | Groot separates editing, real-time monitor, and log visualization; MoveIt splits edit/run operation. | **Copy strongly once runtime exists.** Make authorship editable, monitor read-only, and replay immutable. Do not let a live run silently mutate the definition. |
| B11 | **Run / pause / stop / step / loop** | MoveIt runs/stops Objectives and pauses at a breakpoint; Groot monitors an executor and supports interactive breakpoints. | **Later, behind an explicit RuntimeAdapter.** A control is honest only when it affects a connected execution engine. Include the adapter identity and connection state beside the buttons. |
| B12 | **Breakpoint and step** | MoveIt pauses at a breakpoint then offers Resume/Stop; Groot advertises interactive breakpoints. | **Later.** Store breakpoint profiles separately from the canonical tree; label each pause with path, node, reason, and safe/unsafe execution context. |
| B13 | **Runtime status overlay** | MoveIt uses `RUNNING/SUCCESS/FAILURE`; Groot visualizes executor state in real time. | **Later, high priority.** Status needs text, shape, and color; show last transition/time/visit count. Runtime evidence is not another hand-edited tree. |
| B14 | **Trace recording, filtering, replay** | Groot records transitions, replays at variable speed, exposes running duration/counts, and filters by node/time. | **Later, high priority.** Record a `RuntimeTrace` separately; provide scrub/play/speed and filters by node, path, semantic tag, status, and time. |
| B15 | **Blackboard / value probe** | MoveIt shows a scoped Blackboard pane; Groot offers Blackboard visualization. | **Adapt later.** Offer a focused source/provenance lens: declared reads/writes, current value, timestamp, type, owning scope, and callers. Do not lead with a global key/value table. |
| B16 | **Fault injection, forced result, dummy substitution** | Groot PRO supports fault injection and runtime dummy-node substitution. | **Later, developer/test mode only.** Make the override conspicuous, non-persistent in authored definition, and captured in trace metadata. |
| B17 | **Model import / live serialized preview** | Groot imports the node model and previews XML; BT.CPP XML is its interchange format. | **Adapt later.** Import/link a Python/project Block schema and show a generated SystemSketch/Python projection. XML is an interoperability adapter, not the app’s canonical UI. |
| B18 | **Alert stream and failure context** | MoveIt’s Alert Sidebar filters severity/source and preserves run history; Groot has transition logs. | **Later.** Fold relevant runtime events into Trace/Probe rather than a permanent robot-console sidebar. |

## Deliberately compact non-goals

These deserve a named decision but no padded mockup:

| Excluded item | Why it is not a SystemSketch default |
| --- | --- |
| ROS robot teleoperation, 3D planning scene, camera panes, keep-out zones, robot-runtime connection management | These solve MoveIt’s robotics operating environment, not behavior-tree authorship. |
| MoveIt’s complete Behavior Hub / hundreds of robot skills | The useful unit is a source-backed Block/behavior registry, not a vendor palette copied into SystemSketch. |
| BT.CPP XML as the primary authored representation | SystemSketch should preserve its own portable definition and Python/dataflow surfaces; XML can be a future import/export adapter. |
| A global, invisible Blackboard as ordinary data flow | It destroys the provenance and explicit-cable advantages Zach wants. |
| Blackboard setter/micro-event nodes as a second wire system | Events/state/configuration are port semantic tags on normal data, not special magic wires. |
| Special top-side exception rail / throwing conventions | Railway errors are normal typed data; execution failure is a BT status. Keep those concepts distinct. |
| A color-only status language | Accessible labels and temporal evidence are required; colors are supporting signal only. |
| Freehand tick edges, manually routed tree connectors, or arbitrary graph cycles | Tree topology must stay valid and auto-laid-out. Ordinary SystemSketch data cables retain their own grammar. |
| Full multi-window / six-pane IDE layout today | The correct FigJam-ish presentation is still a UI decision; do not fossilize it before concrete workflow evidence. |
| Runtime buttons, breakpoint, replay, fault injection without an executor | A decorative run button is worse than none. The RuntimeAdapter must be real. |
| Inline XML/BT script language as an authoring escape hatch | It creates a second codebase inside the canvas and hides changes from the normal source/data contract. |

## Recommended implementation order

1. **Canonical authored definition.** Root, ordered child IDs, Task, Guard, Sequence, Fallback, Branch, Decorator/Policy, SubTree; structural validity; deterministic top-to-bottom layout.
2. **Explicit contracts and reusable boundaries.** Typed/tagged ports; defaults/required values; inspector; source provenance; SubTree input/output mapping; breadcrumbs; cycle detection.
3. **Authoring affordances.** Contextual `+`, search, legal drop/reorder preview, collapse, port-disclosure level, tree-aware undo/copy/paste/delete, focus/relayout.
4. **First runtime adapter.** Connection identity; Run/Pause/Stop; read-only status/tick overlay; port/value probe; recorded trace and replay. Add a real clock/trigger source here, using the ordinary `event` port tag rather than a special cable class.
5. **Advanced runtime/test tools.** Breakpoints, step, durations/counters, test-time forced outcome/dummy substitution, fault injection, source/project model import, eventual BT.CPP XML adapter.

## Your thinking, sharpened

- **“Events are just data” is compatible with a behavior tree.** Keep an `event` tag on a port/wire and make delivery/clocking part of the contract. The BT child edge says *what is eligible to tick*; it is not an event wire.
- **Railway programming stays dataflow.** A Task may produce `Result[T, E]` or explicit value/error outputs. Sequence/Fallback consume BT status; they do not need an exception wire escaping from the top of a card.
- **Your state/config preference is the right response to Blackboard pressure.** Let a caller supply a typed `state` or `configuration` port, make its mapped boundary visible, and use a focused provenance inspector for scoped runtime values. That achieves debugging without a global hairball.
- **SubTrees are where breadcrumbs earn their keep.** The breadcrumb is not generic decoration: it is the fast, accurate answer to “which definition/path am I executing or editing?” and lets a person jump up any level instantly.
- **Clock/trigger is a good stock runtime primitive, but not a fake canvas feature.** Add it once the adapter has an actual scheduler. Its output is an `event`-tagged normal port/cable; its frequency and phase are visible configuration.
- **Behavior tree and dataflow can coexist without competition.** The default Tree View answers priority/order; a focused Data Contract lens answers provenance; runtime trace answers what actually happened. Each avoids making the other unreadable.

## Decision surface

| State | Decision |
| --- | --- |
| **Done by this research** | Primary-source inventory, official screenshots, a visual per-concept dictionary, normalized BT.CPP node catalogue, and an explicit copy/adapt/later/reject boundary. |
| **Left deliberately unimplemented** | All behavior-tree UI/product work; current `main` has research only. The retained prototype/projection branches remain independent review material. |
| **Needs Zach’s call before a product pass** | Whether the first editable BT form is an intrinsic tldraw shape, a structured container over stock Blocks, or an alternative projection shell; what `Parallel` means for the first RuntimeAdapter; and the final dock vs. temporary-view interaction. |
| **Deliberately not done** | A copied robotics workbench, XML-first authoring, implicit global Blackboard, special event/error cables, and decorative runtime controls. |

## Source index — primary sources

1. [MoveIt Pro — Behavior Trees](https://docs.picknik.ai/concepts/behavior_trees/) — Objective/Behavior/Subtree terminology; node categories; lifecycle status; SubTree creation.
2. [MoveIt Pro — Tutorial 1: Intro & Basic Usage](https://docs.picknik.ai/tutorials/quick_start_intro/) — edit canvas, contextual `+` search, drag/reorder, runtime run/stop/breakpoint, parameter inspector, port visibility, node disable, pane layout, Blackboard.
3. [MoveIt Pro — About the user interface](https://docs.picknik.ai/how_to/custom_view_panes/about_the_user_interface/) — configurable pane roles/layout.
4. [MoveIt Pro — Keyboard shortcuts](https://docs.picknik.ai/how_to/behavior_tree_editing/keyboard_shortcuts/) — selection, copy/paste, deletion, undo/redo behavior.
5. [MoveIt Pro — Breakpoints](https://docs.picknik.ai/how_to/behavior_tree_editing/breakpoints/) — pause/resume/stop semantics and breakpoint scope.
6. [MoveIt Pro — Blackboard debugging](https://docs.picknik.ai/how_to/behavior_tree_editing/debugging_blackboard/) — scoped runtime name/type/value inspection.
7. [MoveIt Studio Pro 10.0 release notes](https://docs.picknik.ai/release-notes/2026/09/01/10.0.0/) — current structured insertion/re-layout and runtime presentation details.
8. [MoveIt Pro — Technical specifications](https://docs.picknik.ai/technical_specifications/) — behavior-tree editing/debugging and visualization claims.
9. [BehaviorTree.CPP — Basics](https://behaviortree.dev/docs/learn-the-basics/BT_basics/) — root-to-leaf ticking, internal vs. leaf roles, lifecycle status.
10. [BehaviorTree.CPP — Native nodes library](https://behaviortree.dev/docs/category/nodes-library/) — native categories: Parallel, conditional controls, Switch, Decorators, Fallbacks, Sequences.
11. [BehaviorTree.CPP — Ports vs Blackboard](https://behaviortree.dev/docs/guides/ports_vs_blackboard/) — explicit dataflow rationale and warning against direct Blackboard access.
12. [BehaviorTree.CPP — Decorators](https://behaviortree.dev/docs/nodes-library/DecoratorNode/) — single-child policy wrapper and native decorator semantics.
13. [BehaviorTree.CPP — Conditional control nodes](https://behaviortree.dev/docs/nodes-library/ConditionalControlNodes/) — `IfThenElse` vs reactive `WhileDoElse` behavior.
14. [BehaviorTree.CPP — SubTrees](https://behaviortree.dev/docs/tutorial-basics/tutorial_05_subtrees/) and [SubTree ports](https://behaviortree.dev/docs/tutorial-basics/tutorial_06_subtree_ports/) — reuse and visible remapping boundary.
15. [BehaviorTree.CPP — Groot2 integration](https://behaviortree.dev/docs/tutorial-basics/tutorial_11_groot2/) — TreeNodesModel and runtime publisher contract.
16. [BehaviorTree.CPP — Groot2](https://www.behaviortree.dev/groot/) — drag/drop editor, monitor, trace/replay, breakpoint/fault-injection capability boundary.
17. [BehaviorTree.CPP 4.9.0 release](https://github.com/BehaviorTree/BehaviorTree.CPP/releases/tag/4.9.0) — `TryCatch` release fact; GitHub is the upstream project’s official release surface.
18. [BehaviorTree.CPP factory registry, 4.9.0](https://github.com/BehaviorTree/BehaviorTree.CPP/blob/4.9.0/src/bt_factory.cpp) — precise registered native names; upstream source, used only for catalogue completeness.

## Capture provenance

`tools/capture_reference_screens.mjs --behavior-tree-atlas` drives disposable headless Chrome over official vendor image assets and writes the PNGs plus an independent URL manifest to `docs/assets/`. The rendered companion embeds those captured PNGs, cites the primary documentation URL beneath every useful-entry image, and labels every SystemSketch diagram as an original proposal rather than source-tool evidence.
