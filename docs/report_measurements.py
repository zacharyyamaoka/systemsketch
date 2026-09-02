"""Measure a report's own numbers from the live repo, at build time.

CLAUDE.md's rule for `docs/build_<name>.py`: measure at build time from the live
repo rather than hardcoding, so a report cannot drift from the tree it describes.
A count frozen into a regenerated page is the same silent-drift bug as a stale
figure quoted in chat, just slower — it looks freshly measured every rebuild.

These helpers raise rather than return a wrong number: a report that cannot
measure itself should fail loudly instead of publishing a guess.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def line_count(relative_path: str) -> int:
    """Lines in a source file, for the "what the change is" table."""
    return len((REPO / relative_path).read_text(encoding="utf-8").splitlines())


def unit_test_count(relative_test_path: str) -> int:
    """How many vitest cases that one test file actually runs."""
    result = subprocess.run(
        ["npx", "vitest", "run", relative_test_path, "--reporter=json"],
        cwd=REPO, capture_output=True, text=True, check=False,
    )
    # vitest prints progress on stderr and the JSON document on stdout, but a
    # warning can still land ahead of it, so start at the first brace.
    start = result.stdout.find("{")
    if start < 0:
        raise SystemExit(
            f"could not read vitest JSON for {relative_test_path}\n"
            f"{result.stdout[-2000:]}{result.stderr[-2000:]}"
        )
    report = json.loads(result.stdout[start:])
    if not report.get("success"):
        raise SystemExit(f"{relative_test_path} is red — refusing to publish a report over it")
    return int(report["numPassedTests"])


# `pass('…')` is how every tests/*_smoke.mjs records a completed check.
_CHECK = re.compile(r"""\bpass\(\s*(['"])(?P<label>(?:\\.|(?!\1).)*)\1\s*\)""")


def browser_checks(relative_smoke_path: str) -> list[str]:
    """The check labels a smoke test declares, read from its source.

    Taken from the file rather than from a run: the labels are what the report
    lists, and reading them here means a renamed or added check shows up on the
    page without anyone remembering to copy it across.
    """
    source = (REPO / relative_smoke_path).read_text(encoding="utf-8")
    labels = [match.group("label") for match in _CHECK.finditer(source)]
    if not labels:
        raise SystemExit(f"no pass(...) checks found in {relative_smoke_path}")
    # Undo the escaping the JavaScript source needs, e.g. shape\'s -> shape's.
    return [re.sub(r"\\(.)", r"\1", label) for label in labels]
