# 008 — Babble gallery chrome: native-size heroes

## Goal

Keep the shared Babble gallery readable so future reports and the existing
ones already on `main` show prototype stills at native size. Discard the
Behavior Tree Process/Dataflow visual proposals from this lane; they are
not landing.

## What was wrong

Every Babble-shell gallery used a two-column card grid, clipped
`.prototype-frame` overflow, and `img/svg { width: 100% }`. Wide stills
(often 2560px with 12px labels) shrank until the labels were unreadable.
That was chrome, not content.

## Options considered

- Rebuild each report's diagrams larger — rejected as the product fix.
  The same shell would shrink them again.
- Two-column grid plus zoom-on-hover — rejected. The failure is
  shrinking, not missing a magnifier.
- Focus layout, one full-width column, scrollable frame, native-size
  media — chosen.

## What landed

Source of truth for **new** galleries is the user-level skill
`~/.agents/skills/babble/assets/gallery-shell.html` (Claude/Codex paths
are the same file). It now defaults to Focus, one column, a scrollable
prototype frame (`min-height: 520px`, `max-height: min(78vh, 920px)`),
and `width: auto` on hero img/video/canvas/iframe/svg.

On `main`, the same chrome is patched into every existing
`docs/*.html` that still used the old `.prototype-frame` shell, including
the `*babble*` reports and the older proposal galleries. A later report
(`primitive-search-variants-2026-09-04.html`) was already built from the
patched shell.

## Discarded from this lane

Behavior Tree Process/Dataflow wireframes, V2 diagram packs, and their
README links. They were a taste pass Zach rejected; they are not in this
merge.

## Still open

Old `localStorage` keys `babble-prune:<pathname>:<title>` may restore
`layout: "grid"`. Grid is now one column, so it stays readable. Hard-refresh
or click Focus if the toolbar looks wrong.
