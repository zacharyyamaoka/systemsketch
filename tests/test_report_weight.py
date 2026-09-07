"""Keeps historical report pages light and their served captures out of Git.

`reports/` has two halves and the split is the whole point:

  reports/*.html                 tracked   — report prose, CSS and small diagrams
  reports/media/<review-name>/   ignored   — captures, video, GIFs and raw evidence

WHY a report is now server-owned: the retained review runtime serves the board and report
from one pinned worktree, so a normal relative `<img src="media/x.png">` resolves over
HTTP. The native `file://` preview turns HTML into a `data:` URL and cannot do that, which
is precisely why handoffs now offer one relaunch command instead of separate report and
board links. At first publish `review_runtime.py` copies ignored media into the retained
worktree, so later restarts do not depend on the implementation track that captured it.

WHY the rule measures inlined payload and not total bytes: reports are bimodal. Measured
across all ten published on 2026-09-07, a report is either 0% base64 or 97-99% base64 —
nothing sits in between. A total-size threshold therefore admits media by accident: at a
1 MB cap, two reports that were 98.2% and 98.9% inlined captures landed on the tracked
side purely because they were 890 KB and 955 KB. Measuring the payload puts them where
they belong and needs no arbitrary line.

Without this test the rule is a comment in `.gitignore` that nobody re-reads, and the
first media-carrying report written to `reports/` with a base64 payload lands in history
permanently — `.git` is already 1.4 GB, and 282 tracked `docs/*.html` account for 209 MB
of it, 194 MB of that being inlined base64. That is the mistake this guardrail exists to
stop repeating.
"""

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
MEDIA_DIR = REPORTS_DIR / "media"

# WHY case-insensitive and `\s`-tolerant: `data:IMAGE/PNG;base64,` and the 76-column
# wrapping that `base64.encodebytes` produces both slipped ~880 KB of captures past a
# stricter version of this pattern. Over-counting a little trailing whitespace is the
# safe direction for a gate; under-counting is how media reaches git.
DATA_URI = re.compile(
    rb"data:[a-z]+/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+", re.IGNORECASE
)

# Only top-level HTML/SVG files are reports. Media is intentionally nested under
# `reports/media/<review-name>/` and is never opened as a `file://` report.
PREVIEWED_SUFFIXES = ("*.html", "*.svg")

# A tracked report may carry a little inlined payload — a favicon, one small diagram —
# but not captures. Real reports cluster at 0% or ~98%, so this is generous, not tuned.
TRACKED_MAX_INLINED_BYTES = 256 * 1024

def _inlined_bytes(path: Path) -> int:
    return sum(len(m.group(0)) for m in DATA_URI.finditer(path.read_bytes()))


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=PROJECT_ROOT, capture_output=True, text=True, check=False
    )


def _path_is_ignored(path: Path) -> bool:
    """True when .gitignore excludes this path. Raises if git itself fails."""
    result = _git("check-ignore", "-q", "--", str(path.relative_to(PROJECT_ROOT)))
    # check-ignore: 0 = ignored, 1 = not ignored, anything else = git could not answer.
    if result.returncode not in (0, 1):
        raise RuntimeError(
            f"git check-ignore failed (rc={result.returncode}): {result.stderr.strip()}"
        )
    return result.returncode == 0


class ReportSplitTests(unittest.TestCase):
    """The two halves exist and git treats them differently."""

    def test_reports_directory_is_a_real_directory(self):
        self.assertTrue(REPORTS_DIR.is_dir(), "reports/ must be a directory")
        self.assertFalse(
            REPORTS_DIR.is_symlink(),
            "reports/ must be a real directory. A symlink out of the repo fails the "
            "desktop preview: the Electron main process realpaths a path before its "
            "containment check, so the link resolves outside the session's granted roots.",
        )

    def test_media_folder_is_ignored_by_git(self):
        self.assertTrue(
            _path_is_ignored(MEDIA_DIR / "weight-test-probe.html"),
            "reports/media/ must be gitignored — that is the whole point of the split. "
            "Restore the `reports/media/` line in .gitignore.",
        )

    def test_reports_folder_itself_is_not_ignored(self):
        self.assertFalse(
            _path_is_ignored(REPORTS_DIR / "weight-test-probe.html"),
            "reports/ itself must stay tracked — lightweight reports live in git so a "
            "clone still carries them. Only reports/media/ is excluded.",
        )


class TrackedReportTests(unittest.TestCase):
    """Tracked report pages carry the durable account, not media blobs."""

    def setUp(self):
        self.tracked_side = sorted(
            path for pattern in PREVIEWED_SUFFIXES for path in REPORTS_DIR.glob(pattern)
        )

    def test_no_tracked_report_inlines_captures(self):
        heavy = []
        for path in self.tracked_side:
            payload = _inlined_bytes(path)
            if payload > TRACKED_MAX_INLINED_BYTES:
                total = path.stat().st_size
                heavy.append(
                    f"{path.name} ({payload / 1024:.0f} KB inlined, "
                    f"{payload / max(total, 1):.0%} of the file)"
                )
        self.assertEqual(
            [],
            heavy,
            "these pages inline captures. Put the capture under reports/media/<review-name>/ "
            "and reference it relatively; review_runtime retains it beside the pinned report: "
            + ", ".join(heavy),
        )


class MediaStaysOutOfGitTests(unittest.TestCase):
    def test_no_media_report_is_in_the_index(self):
        result = _git("ls-files", "-z", "--", "reports/media")
        self.assertEqual(
            0, result.returncode, f"git ls-files failed: {result.stderr.strip()}"
        )
        leaked = sorted(name for name in result.stdout.split("\0") if name)
        self.assertEqual(
            [],
            leaked,
            "reports/media/ paths are in the git index — probably added with "
            "`git add -f`. Run `git rm --cached` on them: " + ", ".join(leaked),
        )

    def test_no_media_report_ever_reached_history(self):
        # WHY separately from the index check: `git add -f` then `git rm --cached`
        # leaves the index clean while the blob is in history forever. The index test
        # cannot see that, and its message must not claim otherwise.
        result = _git("log", "--all", "--oneline", "--", "reports/media")
        self.assertEqual(
            0, result.returncode, f"git log failed: {result.stderr.strip()}"
        )
        commits = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(
            [],
            commits,
            "reports/media/ bytes are committed somewhere in history and cannot be "
            "removed by .gitignore — they need history surgery: " + "; ".join(commits),
        )


if __name__ == "__main__":
    unittest.main()
