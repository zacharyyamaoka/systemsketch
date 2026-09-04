"""Keeps docs/peps/ in sync with the code that points at it.

A PEP is a decision record living in a separate file from the code it explains, which is
exactly the kind of link that rots silently: a file gets renamed, a number collides across
two worktrees, nobody notices until someone follows a WHY comment into a 404. This test is
the guardrail — see docs/peps/README.md.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PEPS_DIR = PROJECT_ROOT / "docs" / "peps"
NON_ENTRY_FILES = {"TEMPLATE.md", "README.md"}
REQUIRED_SECTIONS = [
    "## Context",
    "## Decision",
    "## Alternatives considered",
    "## Consequences",
]

# Matches the reference form the README asks WHY comments to use: a four-digit PEP
# number, a dash, a slug, and the .md extension.
PEP_REFERENCE = re.compile(r"docs/peps/(\d{4}-[A-Za-z0-9_-]+\.md)")
PEP_FILENAME = re.compile(r"^(\d{4})-[A-Za-z0-9_-]+\.md$")

SOURCE_GLOBS = (
    "src/**/*.ts",
    "src/**/*.tsx",
    "**/*.py",
    "scripts/**/*.mjs",
    "vscode-systemsketch/src/**/*.ts",
)
EXCLUDED_DIR_PARTS = {"node_modules", ".git", "dist", "build", "docs"}


def _iter_source_files():
    seen = set()
    for pattern in SOURCE_GLOBS:
        for path in PROJECT_ROOT.glob(pattern):
            if path in seen or not path.is_file():
                continue
            if EXCLUDED_DIR_PARTS & set(path.relative_to(PROJECT_ROOT).parts):
                continue
            seen.add(path)
            yield path


def _pep_entries():
    if not PEPS_DIR.exists():
        return []
    return sorted(p for p in PEPS_DIR.glob("*.md") if p.name not in NON_ENTRY_FILES)


class PepLinkSyncTests(unittest.TestCase):
    def test_every_pep_reference_in_source_points_at_a_real_file(self) -> None:
        broken = []
        for path in _iter_source_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            for match in PEP_REFERENCE.finditer(text):
                referenced = PEPS_DIR / match.group(1)
                if not referenced.exists():
                    rel = path.relative_to(PROJECT_ROOT)
                    broken.append(f"{rel} -> docs/peps/{match.group(1)}")
        self.assertEqual(
            [],
            broken,
            "WHY comments point at PEPs that don't exist (renamed, deleted, or typo'd): "
            + ", ".join(broken),
        )

    def test_pep_numbers_are_unique(self) -> None:
        numbers: dict[str, str] = {}
        duplicates = []
        for path in _pep_entries():
            match = PEP_FILENAME.match(path.name)
            if not match:
                continue
            number = match.group(1)
            if number in numbers:
                duplicates.append(f"{numbers[number]} and {path.name} both claim {number}")
            else:
                numbers[number] = path.name
        self.assertEqual(
            [],
            duplicates,
            "Colliding PEP numbers (rename one at merge time): " + ", ".join(duplicates),
        )

    def test_pep_entries_follow_the_template_shape(self) -> None:
        missing = []
        for path in _pep_entries():
            text = path.read_text(encoding="utf-8")
            for section in REQUIRED_SECTIONS:
                if section not in text:
                    missing.append(f"{path.name} missing '{section}'")
        self.assertEqual([], missing)


if __name__ == "__main__":
    unittest.main()
