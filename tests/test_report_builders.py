"""A report may quote history, but only from a commit that cannot move."""

from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]

# A commit id, optionally walked back with `^` or `~n`. Anything else — `HEAD`,
# `main`, `origin/main` — names wherever the tree happens to be standing today.
PINNED_REVISION = re.compile(r"^[0-9a-f]{7,40}(\^|~\d+)*$")


def resolve_string(node: ast.AST, constants: dict[str, str]) -> str | None:
    """The string this expression denotes, if that is knowable without running it."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        return constants.get(node.id)
    if isinstance(node, ast.JoinedStr):
        parts = [resolve_string(piece, constants) for piece in node.values]
        pieces = [
            resolve_string(piece.value, constants) if isinstance(piece, ast.FormattedValue) else part
            for piece, part in zip(node.values, parts)
        ]
        return "".join(pieces) if all(piece is not None for piece in pieces) else None
    return None


def module_constants(tree: ast.Module) -> dict[str, str]:
    """Module-level `NAME = "..."` bindings, in the order they are written."""
    constants: dict[str, str] = {}
    for statement in tree.body:
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if not isinstance(target, ast.Name):
            continue
        value = resolve_string(statement.value, constants)
        if value is not None:
            constants[target.id] = value
    return constants


class ReportBuilderTests(unittest.TestCase):
    def test_builders_read_history_from_a_pinned_commit_not_a_moving_ref(self) -> None:
        """The excerpt a report calls "before" must stay the code that was replaced.

        `git_slice("HEAD", ...)` reads right on the day it is written, because HEAD
        is then still the commit before the fix. Every commit after that is a step
        away from the code the report is describing, and the build dies with
        `ValueError: substring not found` once the markers are gone.
        """
        offences = []
        for builder in sorted((PROJECT_ROOT / "docs").glob("build_*.py")):
            tree = ast.parse(builder.read_text(encoding="utf-8"))
            constants = module_constants(tree)
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not node.args:
                    continue
                # `git_slice` is the one helper that reads a file *at a revision*.
                # Wrappers like `git("diff", ...)` measure the live branch and are
                # supposed to move with it.
                name = getattr(node.func, "id", "")
                if name != "git_slice":
                    continue
                revision = resolve_string(node.args[0], constants)
                if revision is None or PINNED_REVISION.match(revision):
                    continue
                offences.append(f"{builder.name}:{node.lineno} {name}({revision!r}, ...)")

        self.assertEqual(
            offences,
            [],
            "these read file content through a ref that moves; pin the commit instead:\n  "
            + "\n  ".join(offences),
        )


if __name__ == "__main__":
    unittest.main()
