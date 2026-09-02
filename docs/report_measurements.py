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


def journey_results(
    results: Path,
    journey: Path,
    source_root: Path,
) -> list[dict]:
    """A browser journey's own results, refused if anything has moved since.

    Two halves, and each covers the other's blind spot. Reading the run's own
    output rather than the journey's source means the labels AND the verdicts
    are things that actually happened — source extraction gives current labels
    but cannot show a check ever executed. Reading a file, though, says nothing
    about when: edit the journey, or edit the app, do not re-run, and stale
    verdicts keep looking freshly measured on every rebuild.

    So both are compared. The source-root check is the one that matters most in
    a shared checkout: a peer refactoring the product invalidates every browser
    verdict on disk, and a report is exactly where that would go unnoticed.
    """
    if not results.exists():
        raise SystemExit(f"{results.name} is missing — run `node {journey}` first")

    measured = results.stat().st_mtime
    if measured < journey.stat().st_mtime:
        raise SystemExit(
            f"{results.name} predates {journey.name}: these verdicts came from an "
            f"older version of the journey. Re-run `node {journey}`."
        )

    newest = max(
        (path for path in source_root.rglob("*")
         if path.is_file() and path.suffix in {".ts", ".tsx", ".css"}),
        key=lambda path: path.stat().st_mtime,
        default=None,
    )
    if newest is not None and measured < newest.stat().st_mtime:
        raise SystemExit(
            f"{results.name} predates {newest.relative_to(source_root.parent)}: these "
            f"verdicts were measured against different source. Re-run `node {journey}`."
        )

    return json.loads(results.read_text())

def source_slice(path: Path, start_marker: str, end_marker: str) -> str:
    """Quote real source, so a snippet cannot outlive the code it describes.

    Measured numbers were only half the drift problem. A report's prose and its
    code snippets describe a *mechanism*, and a mechanism can be replaced while
    every number on the page stays true — which is worse than a stale count,
    because the page then reads as freshly measured and explains something that
    no longer exists. Quoting the file turns that into a build failure: delete
    the function and the report refuses rather than publishing fiction.
    """
    if not path.exists():
        raise SystemExit(
            f"{path.name} is gone, so the snippet quoting it cannot be built. "
            f"The report describes a mechanism that no longer exists — rewrite that section."
        )
    text = path.read_text()
    try:
        begin = text.index(start_marker)
        return text[begin:text.index(end_marker, begin)].rstrip()
    except ValueError:
        raise SystemExit(
            f"{path.name} no longer contains {start_marker.strip()[:60]!r}. "
            f"The report is describing a mechanism that has been replaced — "
            f"rewrite that section rather than re-pointing the marker at something similar."
        ) from None
