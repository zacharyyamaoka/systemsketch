"""Immutable local releases and Stable/Preview pointers for SystemSketch.

Only the Python standard library is used so the installed controller can run
without the development checkout's Python environment.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


PRODUCT = "systemsketch"
CHANNELS_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
CONTROLLER_RUNTIME_FILES = (
    "recorder_frames.mjs",
    "recording_store.py",
    "release_lib.py",
    "server.py",
    "workspace_store.py",
)
# What this project calls "source": the inputs that can change the built app.
# One definition, used by both `source_mtime` (is there newer local work?) and
# `source_provenance` (was this build made from a clean tree?) — so a report,
# a capture or a docs page a peer regenerated can never make a build dirty.
SOURCE_PATHS = (
    "src",
    "scripts",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "index.html",
)
MAX_REPORTED_DIRTY_PATHS = 12


class ReleaseError(RuntimeError):
    """A release or channel transition is unavailable or invalid."""


@dataclass(frozen=True)
class ReleaseChannels:
    stable: str | None = None
    candidate: str | None = None
    previous: str | None = None


@dataclass(frozen=True)
class SourceProvenance:
    """Which source a build came from.

    A build id is a content address over the shipped bytes, which makes the
    artifact immutable but says nothing about the tree that produced it — and
    that tree keeps moving. Every field is ``None`` when the project root is
    not a readable Git checkout: an honest "unknown" beats a fabricated clean.
    """

    commit: str | None = None
    branch: str | None = None
    dirty: bool | None = None
    dirty_paths: tuple[str, ...] = ()

    def manifest_fields(self) -> dict[str, object]:
        """The subset a release records. The dirty file list is for the
        refusal message, not for the manifest — it is about the moment of the
        build, not about the artifact."""
        return {"commit": self.commit, "branch": self.branch, "sourceDirty": self.dirty}


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def default_release_home() -> Path:
    configured = os.environ.get("SYSTEMSKETCH_RELEASE_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    data_home = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return (data_home / "systemsketch" / "runtime").resolve()


def releases_dir(release_home: Path) -> Path:
    return release_home / "releases"


def release_root(release_home: Path, build: str) -> Path:
    return releases_dir(release_home) / build


def channels_path(release_home: Path) -> Path:
    return release_home / "channels.json"


def controller_dir(release_home: Path) -> Path:
    return release_home / "bin"


def installed_launcher_path(release_home: Path) -> Path:
    return controller_dir(release_home) / "launch_systemsketch.py"


def _atomic_write(path: Path, content: bytes, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        temporary.chmod(mode)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _atomic_json(path: Path, payload: dict) -> None:
    content = (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()
    _atomic_write(path, content)


def read_channels(release_home: Path) -> ReleaseChannels:
    try:
        payload = json.loads(channels_path(release_home).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return ReleaseChannels()
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"could not read release channels: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != PRODUCT
        or payload.get("schemaVersion") != CHANNELS_SCHEMA_VERSION
    ):
        raise ReleaseError("release channels belong to an unsupported product or schema")
    values: dict[str, str | None] = {}
    for name in ("stable", "candidate", "previous"):
        value = payload.get(name)
        if value is not None and (not isinstance(value, str) or not value):
            raise ReleaseError(f"release channel {name!r} is invalid")
        values[name] = value
    return ReleaseChannels(**values)


def write_channels(release_home: Path, channels: ReleaseChannels) -> None:
    _atomic_json(
        channels_path(release_home),
        {"product": PRODUCT, "schemaVersion": CHANNELS_SCHEMA_VERSION, **asdict(channels)},
    )


def read_manifest(release_home: Path, build: str) -> dict:
    path = release_root(release_home, build) / "manifest.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as cause:
        raise ReleaseError(f"release {build} has no readable manifest: {cause}") from cause
    if (
        not isinstance(payload, dict)
        or payload.get("product") != PRODUCT
        or payload.get("schemaVersion") != MANIFEST_SCHEMA_VERSION
        or payload.get("build") != build
    ):
        raise ReleaseError(f"release {build} has an invalid manifest")
    return payload


def project_metadata(project_root: Path) -> tuple[str, list[str]]:
    try:
        package = json.loads((project_root / "package.json").read_text(encoding="utf-8"))
        version = package["version"]
    except (OSError, ValueError, KeyError) as cause:
        raise ReleaseError(f"could not read package version: {cause}") from cause
    if not isinstance(version, str) or not version:
        raise ReleaseError("package.json version must be a non-empty string")

    changes: list[str] = []
    changelog = project_root / "SYSTEMSKETCH_CHANGELOG.md"
    if changelog.is_file():
        inside_version = False
        for line in changelog.read_text(encoding="utf-8").splitlines():
            if line.startswith("## "):
                if inside_version:
                    break
                inside_version = line[3:].strip().strip("[]") == version
            elif inside_version and line.startswith("- "):
                changes.append(line[2:].strip())
    return version, changes


def source_mtime(project_root: Path) -> float:
    latest = 0.0
    candidates = [project_root / relative for relative in SOURCE_PATHS]
    for candidate in candidates:
        paths = candidate.rglob("*") if candidate.is_dir() else (candidate,)
        for path in paths:
            if path.is_file() and "__pycache__" not in path.parts:
                try:
                    latest = max(latest, path.stat().st_mtime)
                except OSError:
                    pass
    return latest


def _git(project_root: Path, *arguments: str) -> str | None:
    """One git command's raw stdout, or None if git cannot answer.

    A missing git, a directory that is not a checkout, and a command that fails
    are the same answer here — the caller has no provenance to record — so the
    release path never fails because of the reporting layer.

    Deliberately unstripped: `git status --porcelain` encodes a file's state in
    two leading columns, so trimming the output would shift the first line by
    one character and report a path that does not exist.
    """
    try:
        completed = subprocess.run(
            ["git", "-C", str(project_root), *arguments],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return completed.stdout if completed.returncode == 0 else None


def source_provenance(project_root: Path) -> SourceProvenance:
    """The commit, branch, and source cleanliness of `project_root`.

    Dirtiness is judged over `SOURCE_PATHS` only, and untracked files count:
    an untracked module under `src/` is an input the build can pick up, while a
    regenerated report under `docs/` is not an input at all.
    """
    commit = _git(project_root, "rev-parse", "HEAD")
    if commit is None:
        return SourceProvenance()
    commit = commit.strip()
    branch = (_git(project_root, "rev-parse", "--abbrev-ref", "HEAD") or "").strip() or None
    status = _git(project_root, "status", "--porcelain", "--", *SOURCE_PATHS)
    if status is None:
        return SourceProvenance(commit=commit, branch=branch)
    paths: list[str] = []
    for line in status.splitlines():
        # Porcelain v1: two status columns, a space, then the path.
        entry = line[3:].strip()
        # A rename reads "old -> new"; the new name is the one on disk.
        if " -> " in entry:
            entry = entry.split(" -> ", 1)[1]
        if entry:
            paths.append(entry.strip('"'))
    ordered = tuple(sorted(set(paths)))
    return SourceProvenance(
        commit=commit,
        branch=branch if branch != "HEAD" else None,
        dirty=bool(ordered),
        dirty_paths=ordered,
    )


def _hash_file(digest: "hashlib._Hash", root: Path, path: Path) -> None:
    digest.update(path.relative_to(root).as_posix().encode())
    digest.update(b"\0")
    digest.update(path.read_bytes())
    digest.update(b"\0")


def controller_fingerprint(scripts_dir: Path) -> str:
    """Identify the Python API code loaded by one controller process."""
    digest = hashlib.sha256()
    for name in CONTROLLER_RUNTIME_FILES:
        path = scripts_dir / name
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def release_build_id(project_root: Path, dist: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(path for path in dist.rglob("*") if path.is_file()):
        _hash_file(digest, dist, path)
    for relative in (
        "scripts/launch_systemsketch.py",
        "scripts/release.py",
        "scripts/release_lib.py",
        "scripts/server.py",
        "scripts/workspace_store.py",
    ):
        path = project_root / relative
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def build_release(project_root: Path, release_home: Path, dist: Path) -> tuple[str, dict]:
    project_root = project_root.resolve()
    release_home = release_home.resolve()
    dist = dist.resolve()
    if not (dist / "index.html").is_file():
        raise ReleaseError(f"{dist / 'index.html'} is missing")
    for relative in ("scripts/server.py", "scripts/release_lib.py", "scripts/workspace_store.py"):
        if not (project_root / relative).is_file():
            raise ReleaseError(f"{project_root / relative} is missing")

    version, changes = project_metadata(project_root)
    build = release_build_id(project_root, dist)
    destination = release_root(release_home, build)
    if destination.is_dir():
        return build, read_manifest(release_home, build)

    releases_dir(release_home).mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{build}.", dir=releases_dir(release_home)))
    try:
        shutil.copytree(dist, staging / "dist")
        runtime = staging / "runtime"
        runtime.mkdir()
        shutil.copy2(project_root / "scripts" / "server.py", runtime / "server.py")
        shutil.copy2(project_root / "scripts" / "release_lib.py", runtime / "release_lib.py")
        shutil.copy2(project_root / "scripts" / "workspace_store.py", runtime / "workspace_store.py")
        shutil.copy2(project_root / "scripts" / "recording_store.py", runtime / "recording_store.py")
        shutil.copy2(project_root / "scripts" / "recorder_frames.mjs", runtime / "recorder_frames.mjs")
        manifest = {
            "product": PRODUCT,
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "build": build,
            "version": version,
            "releasedAt": utc_now(),
            "sourceRoot": str(project_root),
            "sourceTime": source_mtime(project_root),
            **source_provenance(project_root).manifest_fields(),
            "changes": changes,
        }
        _atomic_json(staging / "manifest.json", manifest)
        os.replace(staging, destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return build, read_manifest(release_home, build)


def stage_candidate(project_root: Path, release_home: Path, dist: Path) -> tuple[str, dict]:
    build, manifest = build_release(project_root, release_home, dist)
    channels = read_channels(release_home)
    write_channels(
        release_home,
        ReleaseChannels(stable=channels.stable, candidate=build, previous=channels.previous),
    )
    return build, manifest


def promote_candidate(release_home: Path) -> ReleaseChannels:
    channels = read_channels(release_home)
    if channels.candidate is None:
        raise ReleaseError("no verified Preview candidate is available")
    read_manifest(release_home, channels.candidate)
    previous = channels.previous if channels.stable == channels.candidate else channels.stable
    promoted = ReleaseChannels(
        stable=channels.candidate,
        candidate=channels.candidate,
        previous=previous,
    )
    write_channels(release_home, promoted)
    return promoted


def rollback_stable(release_home: Path) -> ReleaseChannels:
    channels = read_channels(release_home)
    if channels.previous is None:
        raise ReleaseError("no previous verified Stable release is available")
    read_manifest(release_home, channels.previous)
    rolled_back = ReleaseChannels(
        stable=channels.previous,
        candidate=channels.candidate,
        previous=channels.stable,
    )
    write_channels(release_home, rolled_back)
    return rolled_back


def source_root_from_channels(release_home: Path) -> Path:
    channels = read_channels(release_home)
    for build in (channels.candidate, channels.stable, channels.previous):
        if not build:
            continue
        source = read_manifest(release_home, build).get("sourceRoot")
        if isinstance(source, str):
            root = Path(source).expanduser().resolve()
            if (root / "package.json").is_file() and (root / "vite.config.ts").is_file():
                return root
    raise ReleaseError("the SystemSketch development checkout could not be found")


def install_controller(project_root: Path, release_home: Path) -> Path:
    destination = controller_dir(release_home)
    destination.mkdir(parents=True, exist_ok=True)
    mapping = {
        "launch_systemsketch.py": "launch_systemsketch.py",
        "release.py": "release.py",
        "release_lib.py": "release_lib.py",
        "server.py": "server.py",
        "workspace_store.py": "workspace_store.py",
        "recording_store.py": "recording_store.py",
        "recorder_frames.mjs": "recorder_frames.mjs",
    }
    for source_name, destination_name in mapping.items():
        source = project_root / "scripts" / source_name
        if not source.is_file():
            raise ReleaseError(f"controller source is missing: {source}")
        mode = 0o755 if destination_name in {"launch_systemsketch.py", "release.py"} else 0o644
        _atomic_write(destination / destination_name, source.read_bytes(), mode)
    return destination / "launch_systemsketch.py"
