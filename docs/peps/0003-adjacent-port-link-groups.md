# 0003: Adjacent input ports may share a presentation without becoming a new port kind

- **Status:** Proposed
- **Date:** 2026-09-04
- **Merge:** merge-ready candidate (pending integration)

## Context

SystemSketch needed to explain Python `*args` and `**kwargs` on a Block without
collapsing their call expressions into one synthetic socket. Every expression still
needs its own cableable port, and authors should still be able to write the DEF
signature as ordinary port names. The design question was therefore not only how a
variadic run should look, but where the fact that several ordinary ports are visually
one run should live.

The V5 implementation stored Python-specific variadic metadata on every member and
painted labels, brackets, and collars. The V6 comparison refined that into a normal
port label plus inward socket teeth and a rail. V7 tested neutral containment because
the rail looked like data flow and the per-kind colours introduced another legend.
V8 centred five slot treatments directly through the ordinary port dots. The chosen
direction was an outlined sleeve, then tightened until its 22 px outside diameter sat
just around the ports' existing 18 px painted footprint.

That visual iteration exposed the architectural fork: make variadic ports a special
semantic kind, infer a group from names beginning with stars, or model only the small
relationship that the canvas actually needs. The Inspector also needed an escape hatch
for this uncommon operation without adding a canvas gesture or expanding every port row
with permanent controls.

## Decision

An ordinary body input may carry an optional `link: { groupId }`. The relation has no
label, Python kind, direction, or renderer choice. Port ids, names, types, defaults,
visibility, and cable bindings are unchanged. `*args` and `**kwargs` remain ordinary
text as far as linking is concerned; the pre-existing `variadic` metadata remains a
separate description of imported or signature-derived Python semantics.

A link is valid only for a contiguous run of at least two body inputs in authored
order. Join, split, insert, delete, and reorder commands canonicalize each run to
`link:<first-stable-port-id>`, remove singleton fragments, and strip links from header
inputs. Hiding a member does not destroy the stored relation, but the Inspector never
offers a seam across that hidden row. Output linking is deliberately unavailable until
a concrete output use case establishes its own visual and interaction contract.

The selected authoring UI is the V2 Inspector treatment: a quiet **Link** mode beside
the existing **visible** and **state** controls reveals a small **Link next** toggle at
each eligible seam. There is no board gesture. The first renderer consumes the generic
relation as a neutral, centred outline sleeve behind the normal input ports: 22 px wide
outside, 2 px border, leaving an 18 px inside diameter equal to the ordinary port's
painted footprint. It adds no arrow, label, colour family, or replacement endpoint.

## Alternatives considered

- **One synthetic collector or bundle port** — this made the group compact, but each
  call expression stopped being independently cableable and the visible DEF signature
  changed substantially.
- **A special variadic port kind, or inference from `*` / `**` spelling** — this tied a
  reusable visual relationship to Python semantics and made hand-authored names behave
  magically. It also prevented the same primitive from supporting another grouped-port
  presentation later.
- **Directional teeth, connective rails, and per-kind colours** — these made the run
  legible, but arrows and lines read as data flow while teal/orange introduced another
  colour code to remember. The V6 and V7 comparisons rejected that extra semantics.
- **A broad filled tray or a naked centre rail** — the tray consumed label space and
  visually overpowered the ports; the rail did not communicate containment. A tight
  outlined sleeve retained the slot metaphor while leaving the existing port and label
  grammar dominant.
- **A canvas linking gesture or permanently expanded Inspector editor** — linking is too
  uncommon to claim a whiteboard gesture or repeated row-level chrome. The temporary
  Inspector mode keeps the base component hackable without making routine port editing
  noisier.

## Consequences

- A future renderer can present the same adjacency relation differently without a data
  migration, and non-Python grouped ports do not need a new model.
- The relation deliberately carries no execution meaning. Consumers must not infer
  packing, argument order semantics, or Python variadic behavior from `link.groupId`.
- Mutation paths that change input order or section membership must preserve the
  contiguous-run invariant. The shared command canonicalizer is the seam for that rule;
  bypassing it can leave misleading persisted metadata.
- Hidden members preserve a group for round-tripping, so its sleeve may contract to the
  remaining visible members until the hidden member is shown again. The Inspector does
  not offer a new seam across a hidden row.
- Output groups, non-contiguous groups, named group labels, and canvas authoring gestures
  remain explicit future decisions rather than accidental capabilities of this model.

## References

- Code: `src/blocks/blockModel.ts` — `BlockPortLink` and the `WHY:` comment that points back here
- Code: `src/blocks/commands/blockCommands.ts` — adjacent join/split and canonicalization commands
- Code: `src/blocks/ui/BlockCanvas.tsx` — the first tight-sleeve renderer
- Code: `src/blocks/ui/BlockInspector.tsx` — the selected V2 seam editor
- Tests: `src/blocks/commands/blockCommands.test.ts` — adjacency, split/join, deletion, and reorder invariants
- Tests: `src/blocks/ui/BlockInspector.test.tsx` and `tests/port_linking_smoke.mjs` — Inspector and real-browser proof
- Evidence: `docs/variadic-port-v6-babble-2026-09-03.html` — arrows, socket teeth, labels, and rails
- Evidence: `docs/variadic-port-v7-grouping-babble-2026-09-04.html` — five neutral containment treatments
- Evidence: `docs/variadic-port-v8-centered-slot-babble-2026-09-04.html` — five port-centred slots
- Evidence: `docs/port-linking-babble-2026-09-04.html` — three Inspector workflows and the selected implementation
- Review: `sketches/review/port-linking-tight-slot.systemsketch` — the accepted real-node fixture
