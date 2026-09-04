# 003 — Vault note for document draft branching

## Goal

Record the SystemSketch document-draft-branching work in Zach’s existing
project note, not a new vault file. Match that note’s voice and AI-comment
style. Do not run vault rituals, commit, or touch product code.

## Where it went

Filled the empty `### Version Control` stub in
`/home/bam/zach_brain/Sources/Notes/PROJECT - System Sketch.md`
(under `## Adding in Icepanel and other system sketch features`).

Added a short stub (question + vocabulary) and a `#### Document drafts`
heading so it sits beside the existing `#### Diffs in SystemSketch`
subsection rather than duplicating it.

Did not write under `## The Goal` (the copy-from-line-12 entry point).
That heading is the product brief; Version Control was the waiting stub.

## Options considered

- New vault note: rejected. The project file already had the heading.
- Comment under `# Branches#` or `## The Goal`: rejected. Those are
  source-repo / product-brief headings, not document drafts.
- Fake a `Prompt for AI` quote: rejected. Zach did not write one here.

## Facts recorded

- Question: switchable document draft branches. One canvas. Not tldraw pages.
- Vocabulary now: **Main** (was “Current”, rejected as overloaded), **Draft**,
  **Version**, **Merge**, **changes**. No commit/checkout/rebase in the UI.
  GitBranch icon on the Drafts chip is OK.
- Prior art: IcePanel. Review mode copies VS Code (Change N of N, ‹ ›,
  Added/Updated/Removed, Keep / Discard, hazard stripe).
- Research HTML + babble + `001-document-draft-branching-research.md`.
- Implementation is **not** on main. Three tracks from `666585b`
  (V1 drawer :4420, V2 timeline :4440, V3 merge review :4450).

## Status

Vault comment inserted. No commit. No SystemSketch `src/` edits.
