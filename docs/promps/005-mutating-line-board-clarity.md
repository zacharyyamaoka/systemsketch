# 005 — Mutating-line review board: information-design loop

**Goal.** Zach called `sketches/review/mutating-line-examples.systemsketch` an unreadable mess. The mutation grammar itself is already verified; this work is visual clarity only. Loop: critique → fix → critique until an independent auditor says ship it.

**Standing constraints.** tldraw stays stock. Do not touch app source for board-clarity. Do not re-attempt cold-boot camera/zoom-to-fit (session-scoped camera). Do not fix dark-theme frame contrast here (filed separately). Do not merge without Zach’s go-ahead.

**Round 3 (this session) — landed in the generator, geometry-verified.**

Root cause for `mut` pill bisection (item 2): **cross-cable collision**, not a same-cable paint bug. Measured on the round-2 board: `wire-13a` pill ∩ `wire-13b` path (and vice versa), plus `wire-legend-a` pill ∩ `wire-legend-b`. Fixture-level: companions fan (first to the right, second below the primary) so the two effect cables get distinct corridors; legend delayed consumer sits under the source so its cable leaves down while the solid cable leaves right. No app-source change.

Must-fix after regenerate + CDP:

1. cable-vs-text overlaps: **0** (was wire-9a through caption 9; cables through chips 01/09/13).
2. DOM `mut` pills crossed by another cable: **0**.
3. chips 1/9/13 clear (ordinals in an 88px left slot, off the 24px elbow padding).
4. note-18 vs nest blocks: **0**.
5. elementFromPoint on `run_outer` / `nest_outer` / `nest_mid` `poses` + `list[Pose]`: **not buried**.
6. `z⁻¹` phrases use NBSP; rendered text does not split `z⁻¹` from `1.0`.
7. Intro says “Legend frame on the right”; legend is top-right of the board.
8. Caption 13 says “tethers”; legend caption 1 names the tether.

Would-help done in the same pass: unpadded 1–20 chips, captions no longer repeat the number, companion sublabels (1b/9b/9c/13b/13c/17b/19b/20b), example 20 chip above Simple/Port labels, legend delayed cable un-stacked, Simple-view note in the legend. Board is still wide (aspect ~2.7, fit-zoom ~36%) — empty-area tightening is the main leftover.

**Round 4 audit.** Independent auditor launches (Opus, Sonnet, GPT, then inherit) all died at spawn: “Other Models usage limit reached.” Zero findings from those jobs. Builder re-measured the live board on 4780 with the same CDP geometry/DOM checks; all 8 must-fixes still pass (0 cable-vs-text, 0 pill-vs-other-cable, nested labels hittable, copy/location agree). Loop is **not** closed: the work order forbids treating a builder self-report as ship-it. Re-run a fresh no-edit auditor when the other-model quota resets.

**Would-help (same pass if cheap).** Tighten empty bands; common ordinal top; one numbering style; legend covers mutation vocabulary including tether; un-stack legend cables; sub-label companions; example 20 chip above its view labels.

**Options considered.**

- Companions stacked under captions (round 2) vs companions to the right of the primary, captions below the whole unit. Right-of-primary wins: effect/output cables no longer have to tunnel through the note.
- Extra top-inset vs extra left-inset for Expanded children. Expanded ports are vertically centred in the body, so more top-inset just moves the port down with the child. Left-inset past the label column is the one that actually un-buries `poses` / `list[Pose]`.
- Ordinals above the block (in the effect-cable stub corridor, padding ~24px) vs in a reserved column to the left. Left column keeps chips off the stub and on a shared top once rows are top-aligned.

**Out of scope.** App-level “plain Frame hosts cables”; dark-theme frame text; `?camera=` / zoom-to-fit on reopen.

**Handoff rule.** After round 3 lands, a fresh auditor (not the builder) grades it. Loop continues until that auditor’s verdict is ship-it.
