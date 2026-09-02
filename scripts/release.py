#!/usr/bin/env python3
"""Build, stage, promote, and roll back SystemSketch releases."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from release_lib import (
    MAX_REPORTED_DIRTY_PATHS,
    ReleaseError,
    default_release_home,
    install_controller,
    promote_candidate,
    read_channels,
    read_manifest,
    rollback_stable,
    source_provenance,
    stage_candidate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def refuse_dirty_source(allow_dirty: bool, project_root: Path = PROJECT_ROOT) -> None:
    """Stop a release that cannot be traced back to a commit.

    Several agent sessions edit this tree at once, so "the source at build
    time" is a moving target: a promote from a dirty tree ships a peer's
    half-written module into Stable and records a commit that never contained
    it. Only `SOURCE_PATHS` counts, so a regenerated report never blocks a
    release; `--allow-dirty` is the deliberate override, and it is recorded in
    the manifest rather than hidden.
    """
    provenance = source_provenance(project_root)
    if provenance.commit is None:
        print("warning: this tree is not a Git checkout — the release will record no commit")
        return
    if not provenance.dirty:
        return
    listed = "\n".join(f"  {path}" for path in provenance.dirty_paths[:MAX_REPORTED_DIRTY_PATHS])
    remainder = len(provenance.dirty_paths) - MAX_REPORTED_DIRTY_PATHS
    if remainder > 0:
        listed += f"\n  …and {remainder} more"
    if not allow_dirty:
        raise ReleaseError(
            "the source tree has uncommitted changes, so this build could not be traced "
            f"back to commit {provenance.commit[:12]}:\n{listed}\n"
            "Commit them, or re-run with --allow-dirty to publish anyway."
        )
    print(f"warning: publishing a dirty tree; these source files are not in {provenance.commit[:12]}:")
    print(listed)


def build_candidate(release_home: Path, *, allow_dirty: bool = False) -> tuple[str, dict]:
    npm = "npm"
    refuse_dirty_source(allow_dirty)
    subprocess.run([npm, "run", "check"], cwd=PROJECT_ROOT, check=True)
    with tempfile.TemporaryDirectory(prefix="systemsketch-release-") as temporary_directory:
        dist = Path(temporary_directory) / "dist"
        subprocess.run(
            [npm, "exec", "vite", "--", "build", "--outDir", str(dist), "--emptyOutDir"],
            cwd=PROJECT_ROOT,
            check=True,
        )
        build, manifest = stage_candidate(PROJECT_ROOT, release_home, dist)
        # A build id is a content address, so identical bytes reuse the release
        # that already exists — including its manifest. Say so rather than let
        # the commit you just built from look like the one that is recorded.
        built_from = source_provenance(PROJECT_ROOT).commit
        recorded = manifest.get("commit")
        if built_from and recorded and recorded != built_from:
            print(
                f"note: {build} already existed, built from {str(recorded)[:12]}; "
                f"these bytes are identical, so its manifest is left alone"
            )
        return build, manifest


def channel_provenance(release_home: Path, build: str | None) -> dict | None:
    """What a channel's build says about the source it came from."""
    if build is None:
        return None
    try:
        manifest = read_manifest(release_home, build)
    except ReleaseError:
        return {"build": build, "commit": None, "branch": None, "sourceDirty": None}
    return {
        "build": build,
        "commit": manifest.get("commit"),
        "branch": manifest.get("branch"),
        "sourceDirty": manifest.get("sourceDirty"),
        "releasedAt": manifest.get("releasedAt"),
    }


def print_status(release_home: Path) -> None:
    channels = read_channels(release_home)
    print(json.dumps({
        "releaseHome": str(release_home),
        **channels.__dict__,
        "source": {
            name: channel_provenance(release_home, getattr(channels, name))
            for name in ("stable", "candidate", "previous")
        },
        "workingTree": {
            key: value for key, value in source_provenance(PROJECT_ROOT).__dict__.items()
            if key != "dirty_paths"
        },
    }, indent=2))


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-home", type=Path, default=None)
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="publish even though tracked source is uncommitted (recorded in the manifest)",
    )
    parser.add_argument("command", choices=("candidate", "promote", "rollback", "status"))
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    release_home = (arguments.release_home or default_release_home()).expanduser().resolve()
    try:
        if arguments.command == "status":
            print_status(release_home)
            return 0
        if arguments.command == "rollback":
            rollback_stable(release_home)
        else:
            build, _manifest = build_candidate(release_home, allow_dirty=arguments.allow_dirty)
            print(f"Verified candidate {build}")
            if arguments.command == "promote":
                promote_candidate(release_home)
                install_controller(PROJECT_ROOT, release_home)
                print("Published for the next Stable launch.")
        print_status(release_home)
        return 0
    except (OSError, ReleaseError, subprocess.CalledProcessError) as cause:
        print(f"SystemSketch release error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
