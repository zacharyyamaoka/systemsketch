# SystemSketch: tldraw customization happy path

_Decision note · 31 August 2026_

## Recommendation in one sentence

Keep the full stock `<Tldraw>` editor as the interaction substrate, add one semantic Block through tldraw's supported shape/store/binding seams, and close **Block → link → reload → edit** before owning more tools, chrome, agents, or collaboration.

The governing split is:

> **tldraw owns canvas mechanics; SystemSketch owns domain meaning.**

That means selection, movement, resize, camera, clipboard, history, and generic arrows stay upstream wherever possible. SystemSketch owns the Block schema, port identity, semantic commands, projections to/from durable truth, and the deliberate conversion from a Block to ordinary primitives.

## The happy path

### 1. Preserve the known-good substrate

Continue mounting the complete `<Tldraw>` component. Do not begin from the lower-level `<TldrawEditor>` and do not fork tldraw. Keep stock behavior until a real SystemSketch workflow exposes a specific friction.

**Proof:** ordinary rectangles, arrows, text, pan/zoom, copy/paste, undo/redo, and persistence continue to behave exactly as they do in stock tldraw.

### 2. Add one semantic Block record

Represent the normal Block as one custom shape with validated, JSON-serializable props and migrations. Give ports stable IDs; do not make their visible labels their identity.

Start with the smallest useful schema:

- title;
- one input and one output with stable IDs;
- width and height;
- current view: Simple, Port, or Expanded;
- remembered size per view.

Use `meta` only for auxiliary application data. Information required to render or reconstruct the Block belongs in typed props or in a canonical external model.

### 3. Let a concrete `BlockShapeUtil` bridge into tldraw

Use `ShapeUtil`, `BaseBoxShapeUtil`, or the frame-like base according to the behavior tldraw is meant to own. Keep one pure `layoutBlock()` result as the geometric authority for rendering, hit geometry, editing overlays, selection outline, port anchors, SVG export, and detach.

Do not invent a universal `CompositeShapeUtil` yet. Share product capabilities through a small registry of field descriptors, inspector sections, typed commands, and detach plans. Extract another base class only after a second semantic shape reveals actual duplicated hooks.

### 4. Create the Block with an ordinary command first

Add a React button that calls the `Editor` API to create a Block. Prove creation, selection, movement, resize, copy/paste, delete, and undo before implementing a custom canvas tool.

This keeps shape failures separate from pointer-state-machine failures.

### 5. Make every editing surface call the same typed command

Inline double-click editing and an optional Details inspector should both call the same domain command, such as `setBlockField(shapeId, field, value)`. The tldraw store remains the single live record; do not introduce a second draft model that must be synchronized.

The editor continues to own focus, Escape, click-away, drag suppression while editing, and history boundaries.

### 6. Add semantic bindings only after Block identity is sound

Initially, use stock arrows to prove the user journey. Then add a small semantic port binding keyed by stable port ID. Keep the visible connector and the domain relationship conceptually separate: tldraw owns spatial attachment; SystemSketch owns what the connection means.

### 7. Prove persistence and migrations before expanding scope

The first product gate is not “the Block renders.” It is:

1. create three Blocks;
2. connect them;
3. reload;
4. edit a title and a port;
5. undo and redo;
6. reopen and continue working.

Define shape migrations before real documents depend on the schema. Session state such as the active editor field should not become document data.

### 8. Add a placement tool only when the command path works

Once programmatic creation is solid, add the smallest `StateNode` tool: select tool, click or drag to place, create through the same command, return to Select. Multi-stage previews, snapping, cancellation, and child tool states are later work because they make SystemSketch responsible for more interaction behavior.

### 9. Customize chrome in response to workflow friction

Use tldraw's supported `components` and `overrides` seams. Replace one slot at a time. A toolbar can expose the Block tool without replacing menus, shortcuts, style panels, and contextual UI that still work.

Visual familiarity from FigJam, Figma, Excalidraw, or Miro is valuable, but chrome is not the first vertical product slice. Prefer CSS or a small slot override when it achieves the behavior; own the whole toolbar only when the interaction contract truly differs.

### 10. Add external control and collaboration through domain boundaries

Expose typed operations—`createBlock`, `connectPorts`, `focusBlock`, `setBlockField`—rather than allowing an agent or API consumer to push arbitrary tldraw records. For AI, bundle the current selection and relevant upstream/downstream context explicitly.

Add multiplayer after the document schema and migrations are stable. Spatial records, live content streams, and external canonical data do not all need to travel through shape props.

## What the other whiteboards teach us

| Reference | What it demonstrates | SystemSketch lesson |
| --- | --- | --- |
| [DDD Toolbox](https://github.com/poulainpi/ddd-toolbox) | Custom actors, work objects, activity arrows, guided placement, domain panels, and story playback on top of tldraw | Change the **semantic vocabulary**, not the canvas fundamentals. One domain model can support authoring and a later presentation/play mode. |
| [biliboss/canvas](https://github.com/biliboss/canvas) | Markdown, tasks, diagrams, and A3 sheets projected onto a canvas; file changes refresh shapes; canvas gestures write domain events | The canvas can be an editable projection while files remain canonical. Round-trip through explicit domain events rather than hidden synchronization. |
| [EnsembleWorks](https://github.com/lean-software-production/ensembleworks) | Terminals, browsers, streams, collaboration, and agent control in spatial shapes | Separate tldraw's spatial state from live content channels. A shape may locate and frame a live surface without serializing every byte into the document. |
| [Cutting Board](https://github.com/utensils/cutting-board) | Global-hotkey invocation, screenshot paste, durable scratch board, one-step PNG export, and local MCP control | Entry and exit can improve a whiteboard more than another drawing tool. Optimize capture, reopen, and share paths. |
| [OpenCanvas](https://github.com/ashark-ai-05/opencanvas) | Typed Markdown, chart, Mermaid, Kanban, code, and HTML widgets controlled through AI/API surfaces | Give agents a small typed object protocol, not unrestricted access to internal tldraw records. |
| [BigBlueButton](https://github.com/bigbluebutton/bigbluebutton) | A tldraw-derived board embedded in roles, presentations, recordings, playback, and conferencing lifecycle | Deep host integration eventually creates compatibility costs. Forking or replacing upstream behavior is a late, evidence-driven move. |
| [Tolaria](https://github.com/refactoringhq/tolaria) | Durable tldraw blocks inside Markdown with stable IDs and embedded/fullscreen views | Give a sketch stable identity independent of where it is shown. Treat persistence as a codec, not a screenshot. |
| [Open AI Canvas](https://github.com/ddcat-ai/open-ai-canvas) | Selection and upstream nodes become explicit agent context; generated results return to the spatial workflow | Agent actions should be contextual, typed, inspectable, and inserted into the same human-editable workspace. |
| [Thought Partners](https://github.com/human-bee/thought-partners) | Speech becomes attributed, time-grouped notes on the shared canvas | Collaboration should leave useful spatial residue rather than a disconnected transcript. |
| [Revezone](https://github.com/revezone/revezone) | Boards composed beside notes, folders, and split views | Workspace composition is useful, but it can overwhelm the core sketching loop. Add it only after the central artifact works. |
| [Official starter kits](https://tldraw.dev/starter-kits/overview) | Current workflow, image-pipeline, agent, chat, and multiplayer implementation patterns | Mine the kits as maintained reference applications. They are patterns to splice deliberately, not switches to enable together. |

## Borrow now, later, and not yet

### Borrow now

- DDD Toolbox's semantic vocabulary over stock interaction mechanics.
- The Workflow/Image Pipeline pattern: one shape utility plus a registry of domain variants.
- biliboss/canvas's explicit projection and round-trip boundary.
- A stable, migrated document schema.
- Cutting Board's attention to fast capture, reopening, and export.
- One vertical proof: **Block → link → reload → edit**.

### Borrow after the first vertical slice

- DDD Toolbox-style guided placement and playback.
- A custom Block placement tool and compact toolbar entry.
- Semantic port bindings.
- A typed canvas API for agents.
- Selection plus graph-neighborhood context for AI.
- Embedded/fullscreen identity and durable file codecs.
- Multiplayer and roles.

### Do not borrow yet

- A wholesale starter-kit transplant into the existing app.
- A permanent composite made from many primitive child records.
- A universal custom-shape inheritance hierarchy before two shapes need it.
- A public API that exposes raw tldraw records as the domain model.
- A complete UI rewrite before the Block workflow exists.
- A tldraw fork.
- Many fonts, line weights, variants, and tools that weaken the visual grammar.

## The practical ownership boundary

| Keep upstream in tldraw | Own in SystemSketch |
| --- | --- |
| Selection, transform handles, camera, clipboard, history, generic shapes, generic arrows | Block schema, port identity, view modes, semantic connection meaning |
| Store reactivity, shape lifecycle, editing-shape lifecycle, UI slots | Typed domain commands, inspector descriptors, canonical-file projection |
| Pointer/tool state-machine framework, snapshots, schema hooks, sync transport | Custom placement policy, migrations, detach recipe, agent/API contract |

## The stop rule

If a proposed change does not help the current vertical journey—**make a Block, connect it, persist it, reopen it, and keep editing**—defer it or test it as an isolated prototype. This keeps tldraw's mature happy path wide and SystemSketch's custom ownership narrow.

## Source trail

- [tldraw Editor](https://tldraw.dev/docs/editor)
- [tldraw shapes and ShapeUtils](https://tldraw.dev/docs/shapes)
- [tldraw tools and StateNodes](https://tldraw.dev/docs/tools)
- [tldraw UI customization](https://tldraw.dev/docs/user-interface)
- [tldraw persistence](https://tldraw.dev/docs/persistence)
- [tldraw starter kits](https://tldraw.dev/starter-kits/overview)
- [Open-source tldraw whiteboard scan](./tldraw-open-source-whiteboards-2026-08-31.html)
- [Composite-element implementation proposal](./composite-elements-proposal-2026-08-31.html)

