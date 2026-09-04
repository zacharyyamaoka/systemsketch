#!/usr/bin/env python3
"""Report — and on request remove — worktrees that have nothing left in them.

    python3 scripts/sweep_worktrees.py              # report only (default)
    python3 scripts/sweep_worktrees.py --remove     # remove the provably spent ones
    python3 scripts/sweep_worktrees.py --remove --name edge-arrow

A merged worktree is pure cost: a second checkout, and often its own
`node_modules`, because `tests/browser_harness.mjs` launches vite by absolute
path under the worktree root and so cannot borrow the parent's. Measured on
2026-09-01: twelve worktrees, ~1 GB, six of them already merged.

So "delete it once it is merged" is right. "Merged" is just not sufficient on
its own, and this script exists because the difference is not visible by eye.
All three of these were true at once in this repo:

  * `claude/figjam-fidelity-9dc86a` — merged, and holding 29 uncommitted files
    including live `src/appearance/*` edits.
  * `track/detach-to-primitives` — merged, and holding an untracked
    `src/blocks/detach/` directory: new source that exists nowhere else.
  * `claude/edge-arrow-type-sync-b68454` — merged, and holding only `serve.sh`
    and `.track/`, both regenerable. This one really is spent.

Only the third is safe to delete, and the gate below is what separates them.

Deliberately conservative: `--remove` refuses anything it cannot prove is
spent, never touches the main checkout or the worktree it is run from, and
leaves the branch alone (a branch is cheap; the checkout is what costs).
Only the standard library is used.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def main_checkout() -> Path:
    """The primary checkout, which is never a candidate for removal.

    Not `REPO`: this script lives in whatever tree it was copied into, so when
    it runs from a worktree `REPO` is that worktree. git always lists the main
    worktree first, so ask git rather than the filesystem.
    """
    for line in git("worktree", "list", "--porcelain").splitlines():
        if line.startswith("worktree "):
            return Path(line.split(" ", 1)[1])
    return REPO

# Untracked leftovers a worktree can be deleted over: everything here is either
# regenerated on demand or belongs to the track scaffolding, never to the work.
EXPENDABLE_UNTRACKED = {
    ".track/",
    "TRACK.md",
    "serve.sh",
    "node_modules/",
    ".vite/",
    "dist/",
}


def git(*args: str, cwd: Path = REPO) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=False
    )
    return (result.stdout + result.stderr).strip()


def git_raw(*args: str, cwd: Path = REPO) -> str:
    """Same, but keeping leading whitespace.

    `git status --porcelain` puts the status in columns 0-1 and the path at 3,
    so an unstaged change begins with a space. Stripping the output eats that
    space on the FIRST line only, which silently drops the first character of
    the first filename — the kind of bug that reads as a typo in a report.
    """
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=False
    )
    return result.stdout


def main_branch_sha() -> str:
    return git("rev-parse", "main")


def worktrees() -> list[dict]:
    """Every worktree git knows about, with the facts the gate needs."""
    found: list[dict] = []
    entry: dict = {}
    for line in git("worktree", "list", "--porcelain").splitlines() + [""]:
        if not line:
            if entry:
                found.append(entry)
            entry = {}
            continue
        key, _, value = line.partition(" ")
        if key == "worktree":
            entry = {"path": Path(value), "branch": None, "head": None}
        elif key == "HEAD":
            entry["head"] = value
        elif key == "branch":
            entry["branch"] = value.replace("refs/heads/", "")
        elif key == "detached":
            entry["branch"] = None
    return found


def is_merged(head: str) -> bool:
    """Is every commit in this worktree already reachable from main?"""
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", head, "main"],
        cwd=REPO, capture_output=True, check=False,
    )
    return result.returncode == 0


def leftovers(path: Path) -> tuple[list[str], list[str]]:
    """(things that would be lost, expendable leftovers) in a worktree."""
    lost: list[str] = []
    spent: list[str] = []
    for line in git_raw("status", "--porcelain", cwd=path).splitlines():
        status, _, name = line[:2], line[2], line[3:]
        if status == "??" and name in EXPENDABLE_UNTRACKED:
            spent.append(name)
        else:
            lost.append(name)
    return lost, spent


def live_sessions(path: Path) -> list[int]:
    """PIDs whose working directory is inside this worktree.

    `/proc/<pid>/cwd`, not a command-line match: a command that merely *names* a
    worktree (a `git -C`, a `du`) looks identical to a session running in one,
    and reading the cmdline reports agents that are not there.
    """
    inside: list[int] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cwd = os.readlink(entry / "cwd")
        except OSError:
            continue
        if cwd == str(path) or cwd.startswith(f"{path}{os.sep}"):
            inside.append(int(entry.name))
    return inside


def size_of(path: Path) -> str:
    total = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    return f"{total / 1024 / 1024:.0f}M"


def review_lease(path: Path) -> str | None:
    """A retained human review is intentionally not disposable track residue."""
    manifest = path / ".review-runtime" / "lease.json"
    if not manifest.is_file():
        return None
    try:
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        name = payload.get("name")
        return name if isinstance(name, str) else "unnamed"
    except (OSError, ValueError, TypeError):
        return "unreadable"


def verdict(tree: dict, self_path: Path) -> tuple[bool, str]:
    """May this worktree be removed, and if not, what is holding it?"""
    path = tree["path"]
    if path == main_checkout():
        return False, "the main checkout"
    if path == self_path:
        return False, "you are standing in it"
    if lease := review_lease(path):
        return False, f"retained review lease {lease!r}; retire it through review_runtime.py"
    if not is_merged(tree["head"]):
        return False, "has commits main does not"
    lost, _ = leftovers(path)
    if lost:
        shown = ", ".join(lost[:3]) + (f" +{len(lost) - 3} more" if len(lost) > 3 else "")
        return False, f"{len(lost)} uncommitted file(s): {shown}"
    pids = live_sessions(path)
    if pids:
        return False, f"a session is working in it (pid {pids[0]})"
    return True, "merged, nothing uncommitted, nobody in it"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--remove", action="store_true",
                        help="actually remove the worktrees that pass the gate")
    parser.add_argument("--name", help="only consider worktrees whose path contains this")
    args = parser.parse_args()

    self_path = Path.cwd().resolve()
    spent_trees: list[dict] = []

    print(f"main is at {main_branch_sha()[:7]}\n")
    for tree in worktrees():
        path = tree["path"]
        if args.name and args.name not in str(path):
            continue
        ok, why = verdict(tree, self_path)
        _, spent = ([], []) if path == main_checkout() else leftovers(path)
        label = tree["branch"] or "(detached)"
        mark = "SPENT " if ok else "KEEP  "
        print(f"{mark} {label:<44} {size_of(path):>6}  {why}")
        if ok and spent:
            print(f"{'':7}{'':<44} {'':>6}  discards: {', '.join(spent)}")
        if ok:
            spent_trees.append(tree)

    if not spent_trees:
        print("\nNothing is spent. Nothing to do.")
        return

    if not args.remove:
        print(f"\n{len(spent_trees)} worktree(s) could be removed. Re-run with --remove.")
        return

    print()
    for tree in spent_trees:
        path = tree["path"]
        print(git("worktree", "remove", "--force", str(path)) or f"removed {path}")
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    git("worktree", "prune")
    print(f"\nRemoved {len(spent_trees)}. Branches kept — they are free; the checkouts were not.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
