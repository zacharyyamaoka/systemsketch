#!/usr/bin/env python3
"""Build, stage, promote, and roll back SystemSketch releases."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
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
    source_mtime,
    source_provenance,
    stage_candidate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HOST_ARTIFACT_SCHEMA_VERSION = 1
OBSIDIAN_ARTIFACT_FILES = ("main.js", "styles.css", "manifest.json", "bundle.json")


def host_artifact_root(release_home: Path, build: str) -> Path:
    return release_home / "host-releases" / build


def read_host_artifact_manifest(release_home: Path, build: str) -> dict:
    path = host_artifact_root(release_home, build) / "manifest.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"host artifacts for {build} have no readable manifest: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != "systemsketch-hosts"
        or payload.get("schemaVersion") != HOST_ARTIFACT_SCHEMA_VERSION
        or payload.get("build") != build
    ):
        raise ReleaseError(f"host artifacts for {build} have an invalid manifest")
    return payload


def _artifact_record(root: Path, path: Path) -> dict[str, object]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "path": path.relative_to(root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": digest,
    }


def build_host_artifacts(
    release_home: Path,
    build: str,
    *,
    project_root: Path = PROJECT_ROOT,
) -> dict:
    """Build both host plugins before ``build`` is allowed to become Stable.

    The working directories are disposable build output. The durable result is
    one atomic, immutable directory under ``host-releases/<build>``. VS Code
    and Cursor intentionally share the VSIX; Obsidian carries its guarded
    same-document bundle from the same recorded source.
    """
    release_home = release_home.resolve()
    project_root = project_root.resolve()
    release = read_manifest(release_home, build)
    destination = host_artifact_root(release_home, build)
    if destination.is_dir():
        return read_host_artifact_manifest(release_home, build)

    vscode_root = project_root / "vscode-systemsketch"
    obsidian_root = project_root / "obsidian-systemsketch"
    for required in (
        vscode_root / "package.json",
        vscode_root / "scripts" / "stage_app.mjs",
        obsidian_root / "package.json",
        obsidian_root / "esbuild.config.mjs",
    ):
        if not required.is_file():
            raise ReleaseError(f"host plugin source is missing: {required}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{build}.", dir=destination.parent))
    environment = os.environ.copy()
    environment["SYSTEMSKETCH_RELEASE_HOME"] = str(release_home)
    try:
        for host_root in (vscode_root, obsidian_root):
            subprocess.run(
                ["npm", "ci", "--no-audit", "--no-fund"],
                cwd=host_root,
                check=True,
                env=environment,
            )

        subprocess.run(["npm", "run", "typecheck"], cwd=vscode_root, check=True, env=environment)
        subprocess.run(
            ["node", "scripts/stage_app.mjs", "--require-release", build],
            cwd=vscode_root,
            check=True,
            env=environment,
        )
        subprocess.run(["node", "esbuild.config.mjs"], cwd=vscode_root, check=True, env=environment)

        try:
            vscode_package = json.loads((vscode_root / "package.json").read_text(encoding="utf-8"))
            vscode_version = vscode_package["version"]
        except (OSError, ValueError, KeyError) as cause:
            raise ReleaseError(f"could not read the VS Code plugin version: {cause}") from cause
        vscode_dist_output = (
            vscode_root / "dist" / f"systemsketch-vscode-{vscode_version}.vsix"
        )
        subprocess.run(
            [
                str(vscode_root / "node_modules" / ".bin" / "vsce"),
                "package",
                "--allow-missing-repository",
                "--skip-license",
                "--out",
                str(vscode_dist_output),
            ],
            cwd=vscode_root,
            check=True,
            env=environment,
        )
        if not vscode_dist_output.is_file():
            raise ReleaseError("VS Code packaging produced no VSIX")
        vscode_output = staging / "vscode" / vscode_dist_output.name
        vscode_output.parent.mkdir()
        shutil.copy2(vscode_dist_output, vscode_output)

        subprocess.run(["npm", "run", "typecheck"], cwd=obsidian_root, check=True, env=environment)
        subprocess.run(["node", "esbuild.config.mjs"], cwd=obsidian_root, check=True, env=environment)
        subprocess.run(
            ["node", "tests/provenance.mjs"],
            cwd=obsidian_root,
            check=True,
            env=environment,
        )
        obsidian_output = staging / "obsidian"
        obsidian_output.mkdir()
        for name in OBSIDIAN_ARTIFACT_FILES:
            source = obsidian_root / "dist" / name
            if not source.is_file():
                raise ReleaseError(f"Obsidian packaging produced no {name}")
            shutil.copy2(source, obsidian_output / name)

        released_source_time = release.get("sourceTime")
        if not isinstance(released_source_time, (int, float)):
            raise ReleaseError(f"release {build} records no source time")
        if source_mtime(project_root) > released_source_time:
            raise ReleaseError(
                "source changed while the host plugins were building; Stable was not advanced"
            )

        obsidian_records = {
            name: _artifact_record(staging, obsidian_output / name)
            for name in OBSIDIAN_ARTIFACT_FILES
        }
        vscode_record = _artifact_record(staging, vscode_output)
        payload = {
            "product": "systemsketch-hosts",
            "schemaVersion": HOST_ARTIFACT_SCHEMA_VERSION,
            "build": build,
            "version": release.get("version"),
            "sourceCommit": release.get("commit"),
            "sourceDirty": release.get("sourceDirty"),
            "builtAt": datetime.now(UTC).isoformat(),
            "artifacts": {
                "vscode": vscode_record,
                "cursor": {**vscode_record, "sharedWith": "vscode"},
                "obsidian": {"files": obsidian_records},
            },
        }
        (staging / "manifest.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(staging, destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return read_host_artifact_manifest(release_home, build)


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


def promote_release(release_home: Path, *, allow_dirty: bool = False) -> tuple[str, dict]:
    """Verify one candidate and its host plugins, then atomically select it."""
    build, _manifest = build_candidate(release_home, allow_dirty=allow_dirty)
    print(f"Verified candidate {build}")
    host_manifest = build_host_artifacts(release_home, build)
    promote_candidate(release_home)
    install_controller(PROJECT_ROOT, release_home)
    print(f"Built VS Code, Cursor, and Obsidian plugins for Stable {build}.")
    print(f"Host artifacts: {host_artifact_root(release_home, build)}")
    print("Published for the next Stable launch; host installation remains explicit.")
    return build, host_manifest


def channel_provenance(release_home: Path, build: str | None) -> dict | None:
    """What a channel's build says about the source it came from."""
    if build is None:
        return None
    try:
        manifest = read_manifest(release_home, build)
    except ReleaseError:
        return {"build": build, "commit": None, "branch": None, "sourceDirty": None}
    host_manifest = host_artifact_root(release_home, build) / "manifest.json"
    return {
        "build": build,
        "commit": manifest.get("commit"),
        "branch": manifest.get("branch"),
        "sourceDirty": manifest.get("sourceDirty"),
        "releasedAt": manifest.get("releasedAt"),
        "hostArtifacts": str(host_artifact_root(release_home, build)) if host_manifest.is_file() else None,
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
        elif arguments.command == "promote":
            promote_release(release_home, allow_dirty=arguments.allow_dirty)
        else:
            build, _manifest = build_candidate(release_home, allow_dirty=arguments.allow_dirty)
            print(f"Verified candidate {build}")
        print_status(release_home)
        return 0
    except (OSError, ReleaseError, subprocess.CalledProcessError) as cause:
        print(f"SystemSketch release error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
