# Work order: wire break/continue icon placement into the app

**Status:** design frozen, nothing under `src/` touched yet. This is a handoff
brief for whoever picks up the implementation — everything it references
already exists and has been verified; nothing in it is speculative.

## What's already decided, and where the proof lives

1. **The icon itself.** A small inline mark, no wire, no cable. `break` is a
   red octagon with `!`; `continue` is a red rounded pill with `»` — same ink
   family (control, not data), distinct shape. Picked in
   [`while-loop-break-2026-09-03.html`](while-loop-break-2026-09-03.html)
   (B5, 81/100) and extended to `continue` in
   [`loop-control-icons-2026-09-03.html`](loop-control-icons-2026-09-03.html).

2. **The placement policy.** P2: the icon rides the header row of the region
   that owns it — right-aligned, the same slot Branch already reserves for
   its fold and make-active affordances — not inline after the code, not in
   a side gutter. Picked in
   [`loop-control-icons-2026-09-03.html`](loop-control-icons-2026-09-03.html)
   (74/100).

3. **The algorithm.** [`control_icon_placement_rule.py`](control_icon_placement_rule.py)
   is a real, tested pure function, `compute_placements(source) -> dict`,
   built on Python's `ast` module. Given a loop's source, it returns
   `{region_id: [{"kind": "break"|"continue", "line": N}, ...]}` — one entry
   per region that owns at least one icon. Three rules, in the module's own
   docstring:
   - `ast.If` is owner-changing (an `if`/`elif`/`else` chain is flattened
     into arms first; each arm gets its own region id, one level per
     nesting depth).
   - A nested `ast.For`/`ast.While` is never descended into — its own
     `break`/`continue` belongs to IT, not to this pass, because Python
     itself always binds a `break`/`continue` to the nearest enclosing loop.
   - `ast.Try` and `ast.With` are transparent: the walk descends into their
     bodies (including every `except` handler) without changing the owner.
     **This rule exists because the first draft shipped without it and
     silently missed every `break`/`continue` inside a `try`/`except`** —
     caught only by actually running the function on a case that used one.
     Treat that as a warning about this whole class of bug: a no-op that
     should have been a transparent descend fails silently, not loudly.

4. **Proof it holds up.** [`control-icon-placement-cases-2026-09-03.html`](control-icon-placement-cases-2026-09-03.html)
   runs `compute_placements` on six real source snippets and draws each
   diagram FROM the function's actual return value — not from a hand-placed
   icon that merely illustrates the intended answer. All six are the
   acceptance cases below.

## The one architectural constraint that matters most

**The whiteboard stays dumb; Python stays rigid.** (Zach's ruling, recorded
in project memory.) There is no AST parser running inside the TypeScript
app today, and this work order does not ask for one. `compute_placements`
is an offline Python pass. Its output becomes **shape metadata** — a plain
list attached to a region's existing props/meta — and the canvas renderer
does nothing more than read that list and draw badges. If you find yourself
writing anything that walks Python source inside `src/`, stop: that's the
wrong side of the boundary.

## Integration points (verified against the live tree, 2026-09-03)

| What | Where | Change |
|---|---|---|
| Branch arm's persistent state | `src/branch/branchModel.ts:41–48` (`BranchArm` type) | Add `controlIcons?: {kind: 'break' \| 'continue', line: number}[]` alongside `id`/`title`/`open`/`h` |
| Threading a new prop through | `src/branch/branchModel.ts:21–27` (`reconcileBranchProps`) | Make sure `controlIcons` survives whatever this does today for the other `BranchArm` fields |
| Arm header row (fold + active live here) | `src/branch/BranchCanvas.tsx:82–143` (`ArmHeader`) — fold chevron at 104–115, active target at 128–139 | Render break/continue badges in the same row, right-aligned, reading from the arm's `controlIcons` — reuse the fold/active row's existing layout math rather than inventing new positioning |
| Arm meta stamped across folds | `src/branch/branchModel.ts:86` (`BRANCH_ARM_META_KEY`), stamped/unstamped in `src/branch/branchArmFrames.ts:91,100,115,161` | Confirm `controlIcons` rides along wherever arm meta is stamped — it should survive a fold exactly like `title` and `open` do |
| Loop's own header (for a break/continue NOT inside any Branch) | `src/loop/LoopCanvas.tsx:60–93` (header/title/turn-chip/menu-dot) | Add a `controlIcons` field to whatever loop props type backs `loopLayout` (`src/loop/loopModel.ts:150+`) and render the same badges near the existing turn-chip slot |

Nothing here asks you to invent a new component — `break_icon`/`continue_icon`
are drawn as plain SVG in the mockups (see `docs/build_loop_control_icons.py`
for the exact paths: an octagon with `!`, a rounded rect with `»`); port
them to whatever the app's existing icon-drawing convention is (likely a
small React component, matching how the fold chevron and active target are
already built at `BranchCanvas.tsx:104–139`).

## What actually needs building

1. **A CLI or build step** that runs `compute_placements` (or its real
   equivalent, ported into wherever this project's Python tooling lives —
   `docs/control_icon_placement_rule.py` is the frozen spec, not necessarily
   the final file location) over a board's source and writes the resulting
   `controlIcons` lists onto the right `BranchArm` / Loop shape records.
   This is a batch/offline step, not a live parser — matching how the rest
   of this project's analysis (`docs/many_to_one_rule.py`,
   `docs/loop_carried_binding.py`) is spec-then-wired, not spec-then-inline.
2. **The two renderer changes** in the table above — read `controlIcons`,
   draw badges, right-aligned, on the header row.
3. **A real-browser journey** (matching this repo's `test:*` convention —
   see `tests/branch_case_view_smoke.mjs` / `npm run test:case-view` for the
   shape of an equivalent existing test) that opens a board seeded with all
   six acceptance cases below and asserts each region shows exactly the
   icons `compute_placements` says it should, and no others.

## Acceptance cases (from `control_icon_placement_rule.py`'s own `CASES` dict)

Reproduce all six from `control-icon-placement-cases-2026-09-03.html` as
real boards; each one's expected result is the literal JSON already printed
in that report (re-run `python3 docs/control_icon_placement_rule.py` to
regenerate it, don't retype it by hand):

| Case | What it proves |
|---|---|
| `c1_shared_header_via_except` | Two DIFFERENT icons (`break` + `continue`) can land on the SAME header — via `try`/`except`, not via two bare statements (which would be dead code) |
| `c2_single_arm_break` | Baseline: one arm, one icon |
| `c3_single_arm_continue` | Baseline: lands on the `elif` arm specifically, not its siblings |
| `c4_two_arms_no_bleed` | Two different arms each get exactly their own icon — no cross-contamination |
| `c5_nested_branch` | A Branch nested inside an arm — the icon stays on the INNERMOST arm, never bubbles up |
| `c6_nested_loop_excluded` | A `break` inside a nested `for` produces ZERO icons on the outer `while` — the outer loop's header must show nothing |

`c6` is the case most likely to get silently wrong in a first pass — it's
very easy to write a walker that treats "inside this loop's body" as
transitive and puts the inner loop's break on the outer loop's header. It
should not.

## Explicitly out of scope (don't guess, ask Zach first)

- `match`/`case` arms — same treatment as `if`/`elif` is very likely
  correct (flatten cases into arms, same owner-swap rule), but this project
  hasn't decided whether `match` lowers to a Branch at all yet.
- `break`/`continue` inside a loop's own `else:` clause (the `while...else:`
  / `for...else:` form) — not handled by `compute_placements`, and it's a
  genuinely ambiguous case (that clause runs OUTSIDE the loop's iteration).
- `return` and `raise` joining the same icon family — named as a likely
  next step in the `loop-control-icons` report, not designed.
- A single line that's simultaneously inside a Branch arm AND a `try` AND a
  nested loop, three deep — the three rules compose in the obvious order
  (If changes owner, Try doesn't, nested loop stops the walk), but no test
  case exercises all three stacked. Worth one before calling this done.

## How to verify you're actually done

`npm run check` staying green is necessary, not sufficient. Per this
project's own standard: drive the real board in a real browser, screenshot
it, and confirm the six acceptance cases visually match what
`control-icon-placement-cases-2026-09-03.html` already shows — that report
is the oracle, not a description of one.
