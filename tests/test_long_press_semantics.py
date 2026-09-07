"""tldraw's `long_press` does NOT mean "the press did not move".

This guards a specific belief that has now been written into this repo by two
separate sessions and half-corrected once — the kind of error a comment
propagates precisely because it reads as authoritative.

The truth, from `@tldraw/editor` 5.3.2 `Editor.ts`: `long_press` is a 500ms
timer started on `pointer_down`, and `_longPressTimeout` is cleared in exactly
six places — pinch, middle-mouse, right-mouse, `pointer_up`, spacebar-pan, and
the `pointer_move` branch that fires only once

    Vec.Dist2(getOriginPagePoint(), getCurrentPagePoint()) * getZoomLevel()
        > (isCoarsePointer ? coarseDragDistanceSquared : dragDistanceSquared) / cz

exceeds the threshold (`dragDistanceSquared: 16`, i.e. 4px; 36 for a coarse
pointer). `editor.cancel()` is NOT one of them.

So `long_press` means "has not crossed the drag threshold", which is a strictly
weaker claim: a press that moves 1-3px and dwells fires it. Any gesture lane
that treats `long_press` as proof of a stationary press is reasoning from a
premise the engine does not provide — see
docs/peps/0013-two-scoped-canvas-drag-owners.md.

Correcting the belief is allowed and encouraged; ASSERTING it is not. A phrase
preceded by "does not mean" / "never means" reads as a correction and passes.
"""
import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# The belief, in the shapes it has actually been written in this repo.
BELIEF = re.compile(
    r"stayed put"
    r"|has\s*n[o']?t\s+moved"
    r"|did\s*n[o']?t\s+move"
    r"|without\s+moving"
    r"|never\s+moved",
    re.I,
)
# A correction names the belief in order to deny it.
CORRECTION = re.compile(r"(?:not|never)\s+means?|not\s+the\s+same\s+as", re.I)
MENTIONS_LONG_PRESS = re.compile(r"long[_-]press", re.I)

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT_RUN = re.compile(r"(?:^[ \t]*//.*(?:\n|$))+", re.M)


def _comments(source: str) -> list[str]:
    """Every comment in the file, block comments and runs of // lines."""
    found = [m.group(0) for m in BLOCK_COMMENT.finditer(source)]
    without_blocks = BLOCK_COMMENT.sub("", source)
    found.extend(m.group(0) for m in LINE_COMMENT_RUN.finditer(without_blocks))
    return found


class LongPressSemanticsTests(unittest.TestCase):
    def test_no_source_comment_claims_long_press_excludes_movement(self) -> None:
        """A lane may rely on long_press; it may not claim the press stood still."""
        offenders: list[str] = []
        for path in sorted((PROJECT_ROOT / "src").rglob("*.ts*")):
            source = path.read_text(encoding="utf-8")
            if not MENTIONS_LONG_PRESS.search(source):
                continue
            for comment in _comments(source):
                if not MENTIONS_LONG_PRESS.search(comment):
                    continue
                for hit in BELIEF.finditer(comment):
                    window = comment[max(0, hit.start() - 80) : hit.start()]
                    if CORRECTION.search(window):
                        continue  # a correction, not a claim
                    line = source[: source.index(comment)].count("\n") + 1
                    quoted = " ".join(
                        comment[max(0, hit.start() - 90) : hit.end() + 40].split()
                    )
                    offenders.append(
                        f"{path.relative_to(PROJECT_ROOT)} (comment near line {line}): ...{quoted}..."
                    )
        self.assertEqual(
            offenders,
            [],
            "A comment claims tldraw's `long_press` implies the press did not move.\n"
            "It does not. `Editor.ts` clears `_longPressTimeout` on `pointer_move`\n"
            "ONLY inside the branch guarded by\n"
            "  Vec.Dist2(origin, current) * zoom > dragDistanceSquared / cz\n"
            "(`dragDistanceSquared: 16` = 4px; 36 coarse) — and never in `cancel()`.\n"
            "So a press that moves 1-3px and dwells still fires `long_press`.\n"
            "Say 'has not crossed the drag threshold' instead, or state the belief\n"
            "only to deny it. See docs/peps/0013-two-scoped-canvas-drag-owners.md.\n"
            "Offending comments:\n  " + "\n  ".join(offenders),
        )


if __name__ == "__main__":
    unittest.main()
