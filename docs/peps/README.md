# PEPs — decision records that travel with the code

An ADR-style record ([Nygard, 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions))
of one non-obvious engineering decision: the context that forced it, what got chosen, the
alternatives that lost and why, and the consequences accepted. "PEP" is the name Zach reached
for first (after Python Enhancement Proposals); the format underneath is ADR's, not PEP's —
there's no proposal-and-consensus process here, just a dated record of what already shipped.

This is not a requirements/spec corpus. It doesn't describe current behavior (the code does
that), so it can't drift out of sync with it — it describes why a past decision was made, and
it is never edited to match later code. A decision that gets reversed gets a *new* entry; the
old one is marked superseded.

## When to write one

This is for **architecture**, not bugs. A PEP records a genuine fork — more than one
defensible approach existed, and one was picked for reasons a future rewrite must not
silently re-litigate. It does not record fixing a mistake, restoring behavior that should
have worked all along, or anything with one obviously correct answer — however many files it
touched, or however satisfying the fix.

Most decisions don't clear that bar. They get an inline `WHY:` comment where they live (see
`src/workspace/*`) and nothing more. Promote to a numbered PEP only when the fork was real
**and** either it's cross-cutting (the reasoning doesn't belong to any single line or file)
or it's visual/comparative enough to deserve the rich-media treatment below.

**Write it at merge time to `main`, never before — and stay sparing.** A PEP describes what
shipped, not what's still being argued about in a branch or worktree. A PEP nobody will ever
need to re-read because the call was obvious is noise, not signal.

## How

1. Pick the next number: `ls docs/peps | sort | tail`. Don't reserve a number in advance —
   several worktrees write here concurrently, so a collision is possible. If one happens at
   merge, renaming one file is the fix; `tests/test_pep_links.py` fails loudly if you miss it.
2. Copy `TEMPLATE.md` to `NNNN-slug.md` and fill it in.
3. In the code, leave (or extend) the `WHY:` comment at the decision site with one clause
   pointing at the record:

   ```ts
   // WHY: draw.io 31.4.2 bounds a continuously postponed local save at 30s so a slow
   // network can't stall recovery indefinitely — see docs/peps/0001-workspace-persistence.md
   ```

   ```python
   # WHY: the arm-membership stamp survives a fold because tldraw's own frame children
   # array doesn't — see docs/peps/0002-branch-region-port-host.md
   ```

4. If a rendered comparison already exists for this decision (this repo generates a lot of
   dated `docs/<name>-<date>.html` galleries via `docs/build_<name>.py` — see the repo
   README), link it from the PEP's References section as evidence. The gallery stays what
   the README already calls it, a **temporary review surface**; the PEP is the part meant to
   outlive it. Don't duplicate the gallery's content into the PEP — link it.
5. Say so in your handoff. One line is enough: "Per `docs/peps/README.md`, also wrote
   `docs/peps/NNNN-slug.md` and linked it at `file:line`." This is the one part of the
   workflow nothing else enforces — `tests/test_pep_links.py` catches a broken link, but
   nothing catches a PEP that quietly never got mentioned to Zach.

## Status lifecycle

`Proposed` (rare — only if written ahead of a merge that hasn't landed yet) → `Accepted` (the
normal end state for a merged decision) → `Superseded by NNNN` (a later PEP reversed this one
— leave the old file in place, just update its Status line) → `Deprecated` (the decision no
longer applies and nothing replaced it).

## Staying in sync

`tests/test_pep_links.py` runs as part of `npm run check` and fails if:

- a `WHY:` comment points at a `docs/peps/NNNN-slug.md` file that doesn't exist (renamed,
  deleted, or typo'd), or
- two PEPs claim the same number (a merge collision that needs a rename), or
- a PEP file is missing one of the template's required sections.

That's the mechanism that keeps a record living in a separate file from going stale silently
— the thing a plain comment-only convention can't catch on its own.
