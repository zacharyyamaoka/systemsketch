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
    ReleaseError,
    default_release_home,
    install_controller,
    promote_candidate,
    read_channels,
    rollback_stable,
    stage_candidate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def build_candidate(release_home: Path) -> tuple[str, dict]:
    npm = "npm"
    subprocess.run([npm, "run", "check"], cwd=PROJECT_ROOT, check=True)
    with tempfile.TemporaryDirectory(prefix="systemsketch-release-") as temporary_directory:
        dist = Path(temporary_directory) / "dist"
        subprocess.run(
            [npm, "exec", "vite", "--", "build", "--outDir", str(dist), "--emptyOutDir"],
            cwd=PROJECT_ROOT,
            check=True,
        )
        return stage_candidate(PROJECT_ROOT, release_home, dist)


def print_status(release_home: Path) -> None:
    print(json.dumps({"releaseHome": str(release_home), **read_channels(release_home).__dict__}, indent=2))


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-home", type=Path, default=None)
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
            build, _manifest = build_candidate(release_home)
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
