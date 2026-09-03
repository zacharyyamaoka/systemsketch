# 002 — Route Block self-loops outside the card

## Goal

Make a connection from a Block's output to its own input leave both ports and
wrap around the Block instead of crossing its body.

## Decision

Treat a same-Block connection as an outer-face self-loop in the Block's parent
scope. This makes the existing elbow router receive the Block's bounds as both
endpoint obstacles, so it creates the expected external loop without new drag
or routing interaction.

The ordinary outer-face cycle guard continues to apply between different
Blocks, but explicitly permits this intentional same-Block loop.

The two equal endpoint boxes gave the router an unconstrained above-or-below
choice. A same-Block output-to-input loop now takes a deterministic route below
the card, unless another obstacle blocks that route.

## Options considered

- Keep `inner` faces and alter only the router: rejected because the connection
  would still belong to the Block's interior scope despite being drawn outside.
- Make same-Block connections outer-face loops: selected because geometry,
  connection parentage, and port semantics all agree.
- Leave the above/below loop to A* tie-breaking: rejected because the desired
  lower route must remain stable as ports move.

## Evidence

- Unit tests cover outer-face pairing, cycle exemption, and the pure elbow
  route avoiding a shared endpoint Block.
- The real-browser polarity journey and the saved-fixture journey draw the
  loop and sample the painted SVG path to confirm it does not enter the Block
  card. Both undo their interaction, preserving the review fixture's bytes.
- `sketches/review/self-loop-routing.systemsketch` provides a focused manual
  check with a numbered gesture and a visible pass condition.
