# PEP 0001 — Reverse-compatible portable copies

_Status: accepted · 3 September 2026_

## Decision

SystemSketch protects a document written by a newer build. It never silently
rewrites that document through an older build.

When an older build can still parse a newer `.systemsketch` document, it opens
the source **read-only** and offers **Make compatible copy…**. That action
creates and opens a separate stock `.tldr`: every feature the running build
can read is lowered to editable tldraw primitives. The source file remains
byte-for-byte untouched.

The first—and deliberately conservative—reverse-compatibility target is stock
tldraw. A stock `.tldr` is the shared floor between SystemSketch releases and
the upstream editor. This is a conversion, not a downgrade in place.

## Safety contract

| Situation | What the app may do | What it must not do |
| --- | --- | --- |
| Older document opens in a newer build | Apply known forward migrations and save normally. | Discard data during migration. |
| Newer document parses in an older build | Show it read-only; make a separate primitive `.tldr` copy on request. | Autosave or overwrite the source. |
| Newer document does not parse in an older build | Preserve the original and explain that no board data loaded. Offer a different file to open. | Show a misleading “Save recovery” action or manufacture a blank replacement. |
| Compatible copy already exists | Ask before replacing that copy. | Replace either file without an explicit decision. |

The compatible export runs against a clone of the loaded editor state. It uses
the existing detach-to-primitives projection for Blocks, regions, and semantic
connections, then writes the target as a plain `.tldr`. The copy is editable
in the older build; it deliberately does not claim to retain SystemSketch-only
meaning that the target cannot understand.

## What reverse compatibility means here

Forward compatibility is migration: a newer build knows how to interpret an
older schema. Reverse compatibility cannot be assumed, because an older build
does not know the semantics a future build introduced.

This PEP defines a useful safe subset:

1. If the older build can load the board, it can project the parts it
   understands to stock primitives.
2. If it cannot load the board, it has nothing trustworthy to project. The
   only correct route is to reopen the file in a build that can read it and
   make the portable copy there.
3. The original remains the authoritative, high-fidelity document. The `.tldr`
   is an independent compatibility artifact.

Operationally, when rolling back Preview or Stable, make compatible copies of
important recently edited boards while a build that can read them is still
available. An older build can make the same copy later only if it opens the
source for inspection.

## Deliberate non-goals

- No automatic in-place “downgrade”.
- No promise that an unknown future shape can be reconstructed by an older
  build.
- No empty-board file described as a recovery.
- No release-by-release target selector yet. A slider such as “make this work
  in version N” requires a versioned capability and loss table for every
  feature; stock `.tldr` is the deterministic common denominator now.

## User-facing wording

A parseable future document says **This board is newer than this app** and
offers **Open another…** plus **Make compatible copy…**. The dialog names the
resulting `.tldr`, says that it contains stock editable primitives, and states
that unreadable data cannot be recovered or converted in that build.

An unparseable document says **This file could not be opened safely** and
states that no board content loaded. It has no “Save recovery as…” action.

## Evidence and implementation

- [Compatibility gallery](./reverse-compatibility-2026-09-03.html): rendered
  future, conversion, and unparseable states.
- [Real-browser future-format journey](../tests/workspace_followup_smoke.mjs):
  creates the `.tldr`, confirms stock primitives, edits it, and proves the
  original remains unchanged.
- [Unreadable-file journey](../tests/workspace_safety_smoke.mjs): proves there
  is no false recovery action or source mutation.
- [Implementation](../src/workspace/LocalWorkspace.tsx): guards future and
  quarantined documents and performs the cloned primitive export.

Any future version-targeted compatibility feature must update this PEP with its
capability table, declared losses, target selection behavior, and executable
proof. Until then, this stock `.tldr` route is the supported rollback exit.
