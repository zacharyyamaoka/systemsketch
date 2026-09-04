# 001 — Document draft branching: research and current direction

## Question

SystemSketch should support named, switchable **draft branches of one document** for
private prototyping. This is not a request to restore tldraw pages: one document
continues to have one canvas.

## Generated report

The self-contained, dated report is
[`document-draft-branching-2026-09-03.html`](../document-draft-branching-2026-09-03.html).
Its builder, `docs/build_document_draft_branching.py`, reads the source study and the
current one-canvas/digest-fencing seams at build time. It was headlessly rendered and
visually inspected after generation.

The feedback-driven five-way interaction proposal gallery is
[`draft-branching-babble-2026-09-03.html`](../draft-branching-babble-2026-09-03.html).
It uses realistic SystemSketch-style top-right chrome around one shared Current →
Draft → review/merge scenario. That gallery still says **Current** (later rejected).
It tests Branch Switcher, History Graph, State Deck, Changes Navigator, and Merge
Workbench without changing product code.

The **integrated journey** gallery — the one Zach asked for after the three live
tracks felt buggy and piecemeal — is
[`draft-journey-babble-2026-09-03.html`](../draft-journey-babble-2026-09-03.html)
(`file:///home/bam/systemsketch/docs/draft-journey-babble-2026-09-03.html`).
Builder: `docs/build_draft_journey_babble.py`. Five self-contained HTML
prototypes under `docs/assets/draft-journey/` walk the same seven beats with
real rendered chrome (tokens, top-left shell, GitBranch Drafts chip, Main not
Current). 35 headless captures. AI prune is fragile: Workspace column 88.8 and
Page-stack 88.0 co-lead; Minimal bar 85.6 is the cleanliness pick.

## What was already explored in PyBlocks

The old PyBlocks repository contains a five-direction study,
`docs/systemsketch-version-control-babble-2026-08-30.{html,json}`. Its provisional
winner was **Draft + Version** (94.6/100):

- **Current** stays the directly openable, editable `.systemsketch` file.
- A **draft** is a named editable fork of an exact Current-file digest. It autosaves
  privately, can be left and resumed, and never edits Current.
- A **version** is an immutable, read-only snapshot. Restore makes a new head/fork;
  it never rewrites history.
- Promotion starts with a record-aware comparison and must stop on a stale base or
  an unresolved conflict. A successful merge first preserves an immutable version.
- A persistent amber `DRAFT` bar names the draft, base, and exit route, so the user
  cannot mistake it for Current.

The alternatives clarify the boundary:

| Direction | Kept insight | Why it is not the center |
| --- | --- | --- |
| Continuous timeline | Checkpoints and non-destructive restore | It is recovery history, not several long-lived editable alternatives. |
| Pages as board states | Fast switching in one file | Duplicated records have no shared branch identity, promotion is coarse, and “page” becomes overloaded as both spatial view and version. |
| Review patch | Per-change accept/reject and ghosts | Strong later complement for small reviewed changes; awkward for a freely edited exploratory redesign. |
| Git-native | Real ancestry and collaboration | Right for code-backed projections; too much repository machinery for a standalone sketch. |

The PyBlocks study proposed a later splice: Draft + Version as the durable backbone,
with Review Patches inside a draft when selective review matters. It was a prototype
and design record only; it did **not** ship document-draft persistence or merge code.

The weighted ordering was V1 Draft + Version (94.6), V4 Review Patch (89.0),
V2 Continuous Timeline (84.0), V5 Git-Native (78.4), then V3 Pages as Board
States (72.2). That makes the “no pages” conclusion a previous, explicit decision,
not a new constraint invented for this request.

There is one separate meaning of “draft” in the PyBlocks project note: a **draft
definition** is a visual Block with no Python yet, a provisional alias, and stable
identity before `MaterializeDefinition`. That lifecycle must not be conflated with a
draft branch of the whole SystemSketch document.

## Names that must stay separate

- **Document draft:** the requested editable fork of a SystemSketch board.
- **Version:** an immutable accepted/recovery snapshot of that board.
- **Review patch:** a revision-linked, individually accept/rejectable change proposal.
- **tldraw page:** a canvas section in legacy files; not an alternative document state.
- **Depth navigation:** an ephemeral camera/focus view through nested Blocks; not
  document history.
- **Git branch / Preview / development profile:** respectively source-control
  topology, release channel, and a development composition. None is a document draft.
- **Control-flow Branch:** an `if`/case region in the visual program; unrelated to
  document branching.
- **Block `Draft N`:** a same-name, different-body definition identity; unrelated to
  a board draft.

## What the current SystemSketch changes

The direction is stronger now, not weaker:

- `src/App.tsx` fixes SystemSketch to `maxPages: 1`.
- `src/singlePageDocument.ts` migrates an imported multi-page tldraw file into named
  Frames on its single root canvas. Pages are therefore deliberately spatial
  structure/migration input, not an alternate-state mechanism.
- The local-workspace layer already saves complete serialized board documents and
  guards writes with a content digest. A clean external edit reloads; a competing
  local edit shows the existing Current-versus-disk conflict state. This supplies
  the primitive needed for a draft's recorded base, but does not yet store branches,
  immutable snapshots, a draft list, or a document merge.
- Current Block `Draft N` badges (`draftOrdinal`) distinguish same-name,
  different-body **definitions**. They do not represent a document draft and should
  retain that narrower meaning.

The previous file-management proposal also marked the early endpoint as “one current
document” and treated a Preview duplicate as an independent untitled copy. That was
safe file-session behavior, not user-facing document version control.

The dedicated `Version Control` heading in the main System Sketch project note is
still only a stub. The developed design record therefore remains the PyBlocks Babble;
neither source claims that document drafts have been shipped.

## IcePanel: the useful prior art

IcePanel's published model matches the user need closely:

- A draft isolates all edits—including model, diagram, connection, and layout
  changes—from the live model.
- Multiple drafts can fork the same live diagram; they do not interact.
- A draft has an explicit lifecycle (`In-progress`, `Merged`, `Archived`), change
  review, and a conflict gate.
- Merging a draft automatically creates a new version; versions are immutable,
  read-only snapshots with non-destructive reversion.

Two limits matter when borrowing it:

1. IcePanel drafts can span many diagrams because they sit above a shared
   architecture model. SystemSketch currently has a single document/canvas and no
   comparable project model, so the first implementation should be document-local.
2. IcePanel’s links to Git branches are links from model objects to external source
   control. They are not a reason to make a SystemSketch sketch draft depend on Git.

## One diff engine, two uses

The PyBlocks note distinguishes a **revision diff** (a draft derived from a known
base) from a **conformance diff** (an independently authored golden versus a generated
projection). The later refinement was to use one record-aware diff engine with two
profiles after identity alignment—not to force goldens or document drafts through the
same lifecycle. Document promotion needs the revision profile: base digest first,
explicit conflicts second.

## Recommended product slice

Adopt the intent of IcePanel's Draft + Version model, but stage it.

### First usable draft workflow

1. The document title exposes `Current` and a small **Drafts** entry.
2. `New draft…` asks only for a name, captures Current's serialized digest/snapshot,
   and opens that draft on the same one canvas.
3. While active, an always-visible amber bar says `DRAFT · <name> · based on
   <current label/digest>` and offers `Back to Current`.
4. Draft autosave writes only the draft head. Discard deletes only draft state after
   confirmation.
5. `Promote to Current` is initially conservative: it succeeds only when Current
   still equals the draft base. If it changed, promotion stops and asks the user to
   compare or keep the draft; no hidden last-writer-wins behavior.
6. A promotion creates an immutable named version before advancing Current.

This delivers the requested “prototype a few directions, switch between them, and
keep the real design safe” without needing pages, a second canvas, or an early
three-way merge engine.

### Deliberate deferrals

- Record/field-level three-way merge and visual conflict resolution.
- Google-Docs-style per-operation suggestions and ghost overlays.
- Cross-document/project drafts, collaboration, access control, and Git checkout.
- Automatic checkpoint timelines beyond the promotion-created versions.

The existing **Save As** remains the manual escape hatch. It makes a disconnected
copy today; document drafts add the missing relationship: name, base, lifecycle,
safe switching, and guarded promotion.

## Evidence consulted

- `../pyblocks/docs/systemsketch-version-control-babble-2026-08-30.json`
- `../pyblocks/docs/icepanel-feature-proposal.html`
- `../pyblocks/src/pipeline/fileBackedBoard.tsx`
- `../pyblocks/src/tldraw/boardSync.ts`
- `~/zach_brain/Projects/pyblocks/PROJECT - pyblocks.md`
- `~/zach_brain/Sources/Notes/PROJECT - System Sketch.md`
- `~/zach_brain/Sources/Notes/IcePanel (SOFTWARE).md`
- `src/App.tsx`, `src/singlePageDocument.ts`, `src/workspace/LocalWorkspace.tsx`,
  `src/workspace/workspaceClient.ts`, and
  `src/blocks/definitions/definitionLinking.ts`
- IcePanel: <https://docs.icepanel.io/future-state-design/drafts.md>,
  <https://docs.icepanel.io/future-state-design/versioning.md>, and
  <https://docs.icepanel.io/integrations/linking-to-reality.md>

## Status — 2026-09-03 live variants

Research HTML and the five-variant Babble gallery are done. Product code is **not**
on `main`. Three isolated tracks were forked from committed `main` `666585b` so
Zach can click through them. Uncommitted source lives only in those worktrees.

Shared chrome (all three): Drafts chip in the top-left shell, IcePanel-style
full-width `DRAFT` header with hazard stripe / Exit / `N changes` / Merge,
inspector History tab, localStorage snapshots, autosave hold so a draft cannot
write the real `.systemsketch`. User-facing words are now **Main** / Draft /
Version / Merge / changes (Zach rejected “Current” as overloaded — it collided
with “current board / selected / blue highlight”). **Main** is the primary
document head. Internal identifiers (`activeDraftId: null` for the head slot)
stay as they are.

### Review mode (2026-09-03)

Zach asked to copy the VS Code / Cursor change-review UX completely:

- Light bar, **Change X of N**, prev/next chevrons (disabled at the ends),
  a kind word (`Added` / `Updated` / `Removed`), **Keep** (accent-soft
  primary) and **Discard** (outlined secondary), hazard stripe underneath.
- The review chrome is a `position: fixed` portal at z-index 10000 so it
  paints above tldraw Share / avatar — the same overlay lesson as the V1
  changes drawer.
- V1: **Merge** enters this stepped review instead of silently applying.
  The `N changes` list drawer stays available.
- V3: the existing Keep/Discard review is restyled to that bar and portaled
  the same way. Apply merge remains for finishing a pass with defaults.

Drafts popover: uppercase **DRAFTS CONTAINING THIS BOARD** eyebrow, Main
(bullseye) as the selected primary with a version subtitle, drafts connected
by a lineage rule and fork glyph (`based on v0.x`), solid-blue **New draft**
footer. The Drafts chip keeps Lucide `GitBranch`. Never show
commit/checkout/rebase (the chip icon is the exception).

The empty `### Version Control` stub in
`~/zach_brain/Sources/Notes/PROJECT - System Sketch.md` is now filled
(`#### Document drafts` + AI comment). See
`003-vault-note-document-draft-branching.md`.

| Variant | Worktree | Ports | Distinct surface |
| --- | --- | --- | --- |
| V1 changes drawer | `/home/bam/systemsketch-track-draft-changes-drawer` (`track/draft-changes-drawer`) | 4420 / 4421 | `N changes` list drawer; Merge opens VS Code Keep/Discard review |
| V2 timeline panel | `/home/bam/systemsketch-track-draft-timeline-panel` (`track/draft-timeline-panel`) | 4440 / 4441 | Left DOCUMENT Timeline; pin versions; nested draft changes |
| V3 merge review | `/home/bam/systemsketch-track-draft-merge-review` (`track/draft-merge-review`) | 4450 / 4451 | Stepped Keep / Discard review; Apply merge |

### V1 changes drawer overlay (this pass)

The drawer used to be `position: absolute` inside the 44px draft bar. That
stacking context loses to tldraw's Share / avatar chrome, so the panel looked
like it collided with the canvas buttons. It is now `position: fixed`, portaled
onto `.systemsketch-app`, z-index 10000, so it paints over the normal viewport
the way IcePanel's Changes panel does. Header is `Changes` plus a count badge;
rows use tinted kind glyphs and `[Block]` / `[Connection]` suffixes.

The Drafts chip now uses Lucide `GitBranch` (the IcePanel line-art fork) instead
of the earlier two-node SVG / `⑂` character.

Review boards (generated through the real editor helper):

- V1 http://127.0.0.1:4420/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-changes-drawer%2Fsketches%2Freview%2Fdraft-branching.systemsketch
- V2 http://127.0.0.1:4440/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-timeline-panel%2Fsketches%2Freview%2Fdraft-branching.systemsketch
- V3 http://127.0.0.1:4450/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-merge-review%2Fsketches%2Freview%2Fdraft-branching.systemsketch

Known gaps as of this status:

- `npm run check` has not been re-run on the combined trees after this review-bar pass.
- Review fixtures are instructional boards on Main; they do not start already in a draft. Instruction cards on those boards still say “Current” in PASS WHEN copy.
- V3 still shows Exit review + Apply merge on the review bar (needed to finish a pass with defaults); the VS Code screenshot is Keep/Discard only.
- V1 had a collapsed-canvas bug (Tldraw wrapped in an unstyled div when not in draft mode). Fixed so the canvas wrapper always fills the app.
- Some early smoke-test PNGs were blank (timing); later draft-mode captures look correct.
- Nothing is merged to `main`. Do not implement in `/home/bam/systemsketch` — it is dirty with peer work.

## Track servers (2026-09-03)

Three isolated worktree servers for the draft-branching variants. Use each
worktree's `./serve.sh`, never `npm run dev`. Leave Stable/Preview
(4321/4322/4323) alone.

| Variant | Worktree | Dev | API |
|---|---|---|---|
| V1 drawer | `/home/bam/systemsketch-track-draft-changes-drawer` | 4420 | 4421 |
| V2 timeline | `/home/bam/systemsketch-track-draft-timeline-panel` | 4440 | 4441 |
| V3 merge review | `/home/bam/systemsketch-track-draft-merge-review` | 4450 | 4451 |

Restarted 2026-09-03: all three were down; `./serve.sh` brought each back.
Vite confirmed `Local: http://127.0.0.1:<port>/`. Stable/Preview untouched.

- V1: http://127.0.0.1:4420/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-changes-drawer%2Fsketches%2Freview%2Fdraft-branching.systemsketch
- V2: http://127.0.0.1:4440/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-timeline-panel%2Fsketches%2Freview%2Fdraft-branching.systemsketch
- V3: http://127.0.0.1:4450/?board=%2Fhome%2Fbam%2Fsystemsketch-track-draft-merge-review%2Fsketches%2Freview%2Fdraft-branching.systemsketch

## Journey babble — 2026-09-03

Zach asked to step back from the three partial tracks (drawer / timeline /
merge review). Those UIs feel buggy and not seamless. He wants the **entire
integrated journey** as five orthogonal visual systems, higher fidelity,
minimalist and clean. Clicks later.

Not tldraw pages. One canvas forever. Words: **Main**, **Draft**, **Version**,
**Merge**, **changes**.

### Shared story (every variant)

1. On Main of robot-arm (Planner → Controller).
2. Create Draft 1 “try a second planner”.
3. Edit: Planner → Planner v2, add Safety check.
4. Leave to Main — Main unchanged.
5. Switch back into Draft 1 — edits still there.
6. Review the change list.
7. Keep / Merge. Main shows Planner v2; draft gone; Version v0.8 exists.

### Five variants (orthogonal chrome, not five skins)

| Id | Name | Thesis |
| --- | --- | --- |
| V1 | Minimal bar | Chip + 3px hazard hairline. Review strip only when merging. |
| V2 | IcePanel header | Full-width inverse DRAFT bar. Closest to the live tracks. |
| V3 | Page-stack | Named sheets. Switching replaces the document. |
| V4 | Filmstrip | Thumbnail frames of Main + drafts along the bottom. |
| V5 | Workspace column | Persistent left rail: Main, drafts, changes, versions. |

Clickable prototypes:
`docs/assets/draft-journey/v1-minimal-bar.html` … `v5-workspace-column.html`
(`?beat=main|create|edit|return|resume|review|merged`).

### Frozen prune (before scoring)

- FR1 Integrated journey 24%
- FR2 Minimalist cleanliness 28% (Zach’s stated job)
- FR3 Main vs Draft unmistakable 20%
- FR4 State inventory 16%
- FR5 Review without ceremony 12%

Gates: one canvas; Main/Draft vocabulary; shared seven-beat story; no product
implementation in the dirty checkout.

### AI prune

V5 Workspace column **88.8** and V3 Page-stack **88.0** are co-leaders.
V1 Minimal bar **85.6** wins cleanliness. V2 and V4 tie at **75.2**.
Hinge: move 8 points from inventory to cleanliness and V3 or V1 overtakes
the rail.

### Options considered

- Five more product worktrees: rejected. The checkout is dirty; the existing
  tracks already explore pieces and feel unfinished. HTML journeys can be
  finished and screenshot.
- Rehash drawer vs timeline vs merge bar: rejected. Zach asked for the
  *integrated* visual system.
- Wireframes: rejected. “Get the UIs right. Higher fidelity.”

### Status

Report is the deliverable. No extra servers. Stable/Preview (4321/4322/4323)
untouched. The three live tracks were left running as reference only.
