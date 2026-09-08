# Bugs — corrections to an existing decision

This is the companion to `docs/peps/`. Keep the distinction simple:

- A PEP says, “We chose X over Y because…”.
- A bug record says, “It was supposed to do X and did Y”.

A bug is not a new design debate. The intended behaviour already existed in code, a `WHY:`
comment, a PEP, or an agreed product direction; the implementation drifted away from it.

## When to write one

Do not document every typo or straightforward one-line fix. Write a bug record when it leaves a
lesson worth carrying forward: it escaped a check that should have caught it, has likely sibling
cases, contradicts an existing decision, or exposed a repeated false belief.

The useful parts are not a long retelling of the failure. They are:

1. **Intended vs actual** — what promise was broken?
2. **How it escaped** — why did ordinary review or tests miss it?
3. **Boundary swept** — where else could the same mistake exist?
4. **Proof** — what regression check or observed journey now protects the correction?

If the fix needs a new choice between defensible approaches, make that choice in a PEP and link
to it. Otherwise, keep the bug record focused on returning to the existing intent.

## How

1. Copy `TEMPLATE.md` to `NNNN-slug.md` when the correction has earned a record.
2. Link the decision, code seam, or observed behaviour it realigns to.
3. Add the smallest relevant regression check when practical. A check should exercise the
   failure, not merely assert that a nearby file changed.
4. Sweep the sibling paths before calling the class fixed.

The code and the running app remain the source of truth. A bug record is a durable explanation
of a correction, not a substitute for reproducing it.
