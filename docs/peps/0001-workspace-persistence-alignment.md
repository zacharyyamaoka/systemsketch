# 0001: Align workspace persistence with draw.io's proven save/recover/conflict model

- **Status:** Accepted
- **Date:** 2026-09-03
- **Merge:** 235a549 ("Align workspace persistence with draw.io safeguards")

## Context

`src/workspace/{workspaceClient.ts,workspaceModel.ts,LocalWorkspace.tsx}` plus
`scripts/workspace_store.py` own local-file save, autosave scheduling, external-change
detection, and conflict recovery for `.systemsketch`/`.tldr` documents on real disk — a
multi-writer POSIX file, not a database row. Two independent processes (the Stable and
Preview release channels) can hold the same path open at once, an editor session can lose
its HTTP response without losing the underlying write, and a slow filesystem can turn a
debounced autosave into a long-running commit. Preceding commits (`777fa78` "make async
file flows recoverable", `0e9e58d` "explain safeguards and reuse Radix modal") had already
grown ad hoc handling for these cases, but nothing proved the handled failure modes were
the right ones or drew a line between "adopt this because it's proven elsewhere" and
"SystemSketch's own transaction is already stronger here."

draw.io Desktop 31.4.2 was picked as the reference oracle: a mature, shipping, multi-year
desktop whiteboard with a real local-file watcher, save conflicts, backups, synchronous
writes, read-back verification, and explicit Copy/Merge/Overwrite/Cancel recovery choices.
Two review passes were run against it before this landed — an earlier four-way comparison
against draw.io, tldraw's own local-sync client, a supplied pre-internal tldraw-offline
branch, and Excalidraw (`bd6e0e6`), followed by a 13-item adopt/keep/defer decision review
scored specifically against draw.io (`235a549`).

## Decision

**Adopted from draw.io:** bound a continuously-deferred autosave at a 30-second ceiling on
top of the existing 600ms debounce (`workspaceModel.ts` `autosaveSchedule`, `LocalWorkspace.tsx`
`scheduleSave`); verify every write by a full reread with up to three fresh-candidate retries
before it may publish; treat an exact-byte replay of a previously-attempted write as success
rather than a conflict, so a lost HTTP response can't manufacture a false conflict against
SystemSketch's own successful save; put "Save my version as…" (Make Copy) directly in the
conflict alert as the visually primary, named recovery path, defaulting away from the
contested filename so pressing Enter can't overwrite it; and route transient OS/storage
failures to the retryable-503 lane while semantic failures (bad revision, path, payload)
stay non-retrying 409s.

**Kept as SystemSketch's own, deliberately not replaced by draw.io's weaker equivalent:**
atomic publication via temp-file write + rename + directory fsync, guarded by a
cross-process advisory lock and an exact SHA-256 digest compare-and-swap, instead of
draw.io's direct in-place `O_TRUNC` write gated only by mtime — required because Stable and
Preview are independent writers to the same path, a case draw.io's single-process model
never has to arbitrate; exact-digest single-flight polling for external-change detection
instead of draw.io's `fs.watchFile` + mtime + semantic page-checksum watcher, because the
digest already catches same-size/same-mtime rewrites, formatting-only changes, and
delete/replace that mtime-watching misses; and GID-first mode preservation with setuid/
setgid/sticky bits always stripped, which has no draw.io analogue.

A sibling `.$name.bkp`-style backup and a Merge option in the conflict alert were both
seriously weighed and explicitly deferred, not adopted and not rejected outright (see
Alternatives).

## Alternatives considered

- **draw.io's literal write path** (direct canonical open + `O_TRUNC` + mtime precondition,
  no lock) — rejected. SystemSketch has two independent writer processes that draw.io never
  has to handle; adopting this verbatim would reintroduce partial canonical files and the
  check-then-write race the existing transaction already closes.
- **draw.io's `fs.watchFile` + mtime + semantic checksum watcher**, as a replacement for the
  existing exact-digest single-flight polling — rejected. Switching would narrow the set of
  detected changes (mtime-only polling misses same-size/same-mtime rewrites) without adding
  robustness the digest approach doesn't already have.
- **A sibling `.bkp` backup file**, matching draw.io — deferred, not shipped now. Atomic
  publication already removes its main "interrupted write" justification; a prior-version
  safety net still has value, but only as one complete bounded backup + detection +
  recover-as-copy + cleanup slice, not an invisible file the product can't discover or retire.
- **An XML/mxGraph-style Merge option** beside Use-disk/Save-as/Overwrite — deferred. draw.io's
  merge is coupled to its own page/XML model; a same-named generic JSON merge over tldraw
  shapes, bindings, pages, and deletions could produce a schema-valid but visually wrong board
  without SystemSketch-specific record-level merge rules first.

## Consequences

This buys an externally-anchored bound on how long unsaved work can live only in memory
(30s, not indefinite), an idempotent-replay path that removes a whole class of false
"someone else changed this" conflicts caused by nothing more than a lost network response,
and a conflict UI where the safe "keep both" action is the path of least resistance rather
than a capability a person has to remember exists.

It costs real complexity growth: `scripts/workspace_store.py` grew by 193 lines and
`src/workspace/LocalWorkspace.tsx` by 223 lines in the landing commit, alongside 280 new
lines of Python transaction tests, a 302-line real-browser CDP journey
(`tests/drawio_persistence_alignment_smoke.mjs`), and 34 lines of server fault-classification
tests — all now part of the surface any future save/recovery change must keep green.

A future reader should not assume backup/recovery or record-level merge are covered because
"the draw.io alignment work happened" — both were explicitly deferred, not shipped. The
draw.io/tldraw/tldraw-offline/Excalidraw comparisons are pinned to specific immutable
upstream commits recorded in the two HTML galleries below; a later draw.io release changing
its own behavior does not retroactively change what was decided here.

## References

- Code: `src/workspace/LocalWorkspace.tsx:396` — the draw.io 31.4.2 bounded-autosave-deferral
  `WHY:` comment this PEP extends.
- Code: `src/workspace/workspaceModel.ts:193` — `autosaveSchedule`'s `WHY:` citing draw.io
  31.4.2 `DrawioFile.js` L2216-L2238 for the idle-delay-plus-ceiling shape.
- Code: `src/workspace/LocalWorkspace.tsx:993` — `WHY:` on treating an exact replay as the
  safe arbiter so external-change polling can't manufacture a conflict with SystemSketch's
  own successful write.
- Code: `src/workspace/LocalWorkspace.tsx:701` — `WHY:` on Make Copy changing live file
  identity without reloading the mounted editor.
- Code: `src/workspace/workspaceModel.ts:174` — `WHY:` on exact-byte digest over mtime/size
  for a rapid same-length rewrite.
- Evidence: `docs/drawio-persistence-alignment-2026-09-03.html` (built by
  `docs/build_drawio_persistence_alignment.py`) — the 13-item adopt/keep/defer decision review.
- Evidence: `docs/workspace-robustness-reference-review-2026-09-03.html` (built by
  `docs/build_workspace_robustness_reference_review.py`) — the earlier four-way comparison
  against draw.io Desktop 31.4.2, tldraw's local-sync client, the supplied tldraw-offline
  branch, and Excalidraw.
- Related: commit `235a549` "Align workspace persistence with draw.io safeguards"
  (2026-09-03) — the merge that landed this decision.
