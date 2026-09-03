# 002 — Input count badge wire clearance

## Goal

Move the many-to-one input count badge slightly above its incoming wire. It
should visually align with the expanded port-name row rather than cover the
wire.

## Decision

Offset `.Port-count` upward by 10 px while retaining its existing horizontal
placement, colour, semantics, and pointer behavior. The 16 px pill now clears
the wire by 2 px at normal zoom.

## Evidence

`tests/branch_region_smoke.mjs` now proves that a rendered count badge's lower
edge is above its input port's wire centreline.

`sketches/review/input-count-badge.systemsketch` provides an expanded
`pose()` Block with two real incoming cables and a visible count badge.

## Follow-up: malformed board links

A link whose equals sign is encoded (`?board%3D…`) previously looked like an
unknown query and silently opened Untitled. The workspace now stops on an
explicit “Board link is invalid” screen that explains the correct `?board=…`
form and that `=` must remain unescaped, with browser coverage for that exact
case.
