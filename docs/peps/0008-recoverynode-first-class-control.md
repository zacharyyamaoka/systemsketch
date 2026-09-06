# 0008: RecoveryNode is a first-class control kind with a loop-back edge, not a Fallback costume

- **Status:** Accepted
- **Date:** 2026-09-06
- **Merge:** landed on `main` with the 2026-09-06 Behavior Tree merge (RecoveryNode commit `9d2e46fa`)

## Context

`RecoveryNode` is not core BT.CPP — it is Nav2's own extension
(`nav2_behavior_tree/plugins/control/recovery_node.cpp`): exactly two children, primary then
recovery. A primary FAILURE ticks the recovery child once and then **re-ticks the primary
from the top**, up to `number_of_retries`; recovery SUCCESS never succeeds the node — only
the primary's own SUCCESS does. Nav2's shipped
`navigate_to_pose_w_replanning_and_recovery.xml` nests it at three granularities
(`number_of_retries="6"` around the whole pipeline, `"1"` around ComputePathToPose, `"1"`
around FollowPath), so real trees meet it constantly. This app rendered it as a generic
"control with children" box that said nothing about any of that.

The vocabulary question was the fork: this app's control kinds were core-BT.CPP-only, and
the app already had a `recovery` lane split for Fallback arms — the tempting move was to
reuse it. Admitting a vendor extension as a first-class kind, with its own Process-view
semantics, is a decision a future rewrite could easily "simplify" away.

## Decision

`RecoveryNode` is a distinct `recoveryLoop` control kind in `btcppXml.ts`, deliberately kept
apart from a Fallback's `recovery` split, with its own glyph, its own insert-menu row
("Recovery — Loop · one-step fix, then retry"), a `recoveryLoopItem` lane in
`processLayout.ts`, and a `retryLoop` edge kind whose Process-view arrow points **back
against the reading direction** — the first edge in this app that does — because the tick
contract genuinely loops back. `sceneSvg.ts` treats `retryLoop` as a control-style wire for
opacity. The semantics were verified straight from the Nav2 source (`main` branch,
2026-09-06) and recorded in the `WHY` block at the model definition so nobody has to
re-derive the tick contract.

## Alternatives considered

- **Keep the generic control-with-children fallback rendering** (status quo) — lost because
  a node this common in real Nav2 trees deserves to be recognizable, and the generic box
  hid the one thing that matters about it (the retry loop and its budget).
- **Draw it as a Fallback recovery split** (reuse the existing `recovery` lane) — lost
  because it lies about semantics: a Fallback succeeds when its recovery arm succeeds;
  RecoveryNode does not — recovery SUCCESS only buys another attempt at the primary. Same
  picture, different contract, and the picture would have taught the wrong contract.

## Consequences

- The control-kind vocabulary now admits non-core extensions when real trees use them; the
  bar set here is "shipped, load-bearing in a major stack, semantics verified from source" —
  not "someone's plugin exists."
- Process view gained a backward edge as a legitimate shape of the language (precedent for
  future loop-shaped controls).
- Cost accepted: `recoveryLoop` vs `recovery` is a subtle pair of names one letter of intent
  apart; the model comment and this record are the guardrail.

## References

- Code: `src/behaviorTree/btcppXml.ts` — the `WHY` block at the `RecoveryNode` model
  definition points back here
- Evidence: `docs/assets/behavior-tree-recovery-node/` journey captures;
  `sketches/review/recovery-node.systemsketch`; `tests/behavior_tree_recovery_node_smoke.mjs`
- Related: `docs/peps/0004-projected-child-ownership-by-containment.md` (the projection
  architecture these nodes render through)
