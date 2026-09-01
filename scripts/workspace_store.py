"""Safe local-file storage for SystemSketch ``.tldr`` workspaces.

The browser remains the tldraw schema authority. This module only validates the
portable file envelope, confines paths to one configured root, and provides
atomic digest-fenced file operations.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


TLDRAW_SUFFIX = ".tldr"
DEFAULT_WORKSPACE_DIRNAME = "SystemSketch"
DEFAULT_DOCUMENT_NAME = f"Untitled{TLDRAW_SUFFIX}"
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024


class WorkspacePathError(ValueError):
    """A requested path escaped the workspace root or was not usable."""


class WorkspaceFormatError(ValueError):
    """The supplied text was not a portable tldraw document."""


class WorkspaceConflictError(RuntimeError):
    """The disk document no longer matches the revision the client loaded."""

    def __init__(self, message: str, disk_mtime: float | None, disk_digest: str | None):
        super().__init__(message)
        self.disk_mtime = disk_mtime
        self.disk_digest = disk_digest


def default_workspace_dir(files_root: Path) -> Path:
    return files_root.resolve() / DEFAULT_WORKSPACE_DIRNAME


def default_document_path(files_root: Path) -> Path:
    return default_workspace_dir(files_root) / DEFAULT_DOCUMENT_NAME


def _resolve_inside_root(raw_path: object, files_root: Path) -> Path:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise WorkspacePathError("path must be a non-empty string")
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        raise WorkspacePathError("path must be absolute")
    resolved = candidate.resolve()
    root = files_root.resolve()
    if resolved != root and root not in resolved.parents:
        raise WorkspacePathError(f"path must stay under {root}")
    return resolved


def resolve_directory(raw_path: object, files_root: Path) -> Path:
    return _resolve_inside_root(raw_path, files_root)


def resolve_document_path(raw_path: object, files_root: Path) -> Path:
    resolved = _resolve_inside_root(raw_path, files_root)
    if not resolved.name.lower().endswith(TLDRAW_SUFFIX) or resolved.name == TLDRAW_SUFFIX:
        raise WorkspacePathError(f"a SystemSketch document must end with {TLDRAW_SUFFIX}")
    return resolved


def pick_document_path(mode: object, raw_current_path: object, files_root: Path) -> dict[str, object]:
    """Ask the desktop file chooser for one user-authorized workspace path."""
    if mode not in {"open", "save"}:
        raise WorkspacePathError("file chooser mode must be open or save")
    chooser = shutil.which("zenity")
    if chooser is None:
        return {"available": False, "cancelled": False, "path": None}

    root = files_root.resolve()
    workspace = default_workspace_dir(files_root)
    try:
        workspace.mkdir(parents=True, exist_ok=True)
    except OSError:
        # The chooser can still use the allowed root if the preferred folder
        # cannot be created (for example, on a read-only files root).
        pass
    current: Path | None = None
    if raw_current_path is not None:
        try:
            current = resolve_document_path(raw_current_path, files_root)
        except WorkspacePathError:
            current = None
    initial_directory = current.parent if current is not None and current.parent != root else workspace
    if not initial_directory.is_dir():
        initial_directory = workspace if workspace.is_dir() else root
    initial = (
        initial_directory / current.name
        if mode == "save" and current is not None
        else initial_directory
    )
    initial_value = str(initial) if mode == "save" else f"{initial}{os.sep}"

    title = "Open a SystemSketch document" if mode == "open" else "Save SystemSketch document as"
    command = [
        chooser,
        "--file-selection",
        f"--title={title}",
        f"--filename={initial_value}",
        "--file-filter=SystemSketch files | *.tldr",
        "--file-filter=All files | *",
    ]
    if mode == "save":
        command.extend(["--save", "--confirm-overwrite"])
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode == 1:
        return {"available": True, "cancelled": True, "path": None}
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "the system file chooser failed"
        raise WorkspacePathError(message)

    selected = completed.stdout.strip()
    if not selected:
        return {"available": True, "cancelled": True, "path": None}
    if mode == "save" and not selected.lower().endswith(TLDRAW_SUFFIX):
        selected = f"{selected}{TLDRAW_SUFFIX}"
    path = resolve_document_path(selected, files_root)
    if mode == "open" and not path.is_file():
        raise WorkspacePathError("choose an existing .tldr document")
    return {
        "available": True,
        "cancelled": False,
        "path": str(path),
        "replaceExisting": mode == "save" and path.is_file(),
    }


def document_title(path: Path) -> str:
    return path.name[: -len(TLDRAW_SUFFIX)]


def document_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def normalize_document_source(source: object) -> str:
    if not isinstance(source, str) or not source.strip():
        raise WorkspaceFormatError("document source must be a non-empty string")
    if len(source.encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise WorkspaceFormatError("document is too large")
    try:
        document = json.loads(source)
    except json.JSONDecodeError as error:
        raise WorkspaceFormatError(f"document is not valid JSON: {error}") from error
    if not isinstance(document, dict):
        raise WorkspaceFormatError("document JSON root must be an object")
    if not isinstance(document.get("tldrawFileFormatVersion"), int):
        raise WorkspaceFormatError("document is missing an integer tldrawFileFormatVersion")
    if not isinstance(document.get("records"), list):
        raise WorkspaceFormatError("document is missing a records list")
    if not isinstance(document.get("schema"), dict):
        raise WorkspaceFormatError("document is missing a schema object")
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def _metadata(path: Path, source: str, stat: os.stat_result | None = None) -> dict[str, Any]:
    current_stat = stat or path.stat()
    return {
        "path": str(path),
        "title": document_title(path),
        "digest": document_digest(source),
        "mtime": current_stat.st_mtime,
        "size": current_stat.st_size,
    }


def list_documents(raw_dir: object, files_root: Path) -> dict[str, Any]:
    root = files_root.resolve()
    directory = (
        resolve_directory(raw_dir, files_root)
        if raw_dir is not None
        else default_workspace_dir(files_root)
    )
    directories: list[dict[str, str]] = []
    documents: list[dict[str, Any]] = []
    if directory.is_dir():
        try:
            entries = sorted(directory.iterdir(), key=lambda entry: entry.name.casefold())
        except OSError as error:
            raise WorkspacePathError(f"could not list {directory}: {error}") from error
        for entry in entries:
            if entry.name.startswith("."):
                continue
            try:
                if entry.is_dir():
                    directories.append({"name": entry.name, "path": str(entry.resolve())})
                elif entry.is_file() and entry.name.lower().endswith(TLDRAW_SUFFIX):
                    stat = entry.stat()
                    documents.append(
                        {
                            "name": entry.name,
                            "title": document_title(entry),
                            "path": str(entry.resolve()),
                            "mtime": stat.st_mtime,
                            "size": stat.st_size,
                        }
                    )
            except OSError:
                continue
    elif directory.exists():
        raise WorkspacePathError(f"not a directory: {directory}")

    return {
        "dir": str(directory),
        "exists": directory.is_dir(),
        "parent": str(directory.parent) if directory != root else None,
        "root": str(root),
        "defaultDocument": str(default_document_path(files_root)),
        "directories": directories,
        "documents": documents,
    }


def load_document(raw_path: object, files_root: Path) -> dict[str, Any]:
    path = resolve_document_path(raw_path, files_root)
    try:
        stat = path.stat()
        if stat.st_size > MAX_DOCUMENT_BYTES:
            raise WorkspacePathError(f"{path.name} is too large to open")
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise
    except (OSError, UnicodeDecodeError) as error:
        raise WorkspacePathError(f"could not read {path}: {error}") from error
    normalize_document_source(source)
    return {**_metadata(path, source, stat), "source": source}


def stat_document(raw_path: object, files_root: Path) -> dict[str, Any]:
    path = resolve_document_path(raw_path, files_root)
    try:
        stat = path.stat()
    except FileNotFoundError:
        raise
    except OSError as error:
        raise WorkspacePathError(f"could not inspect {path}: {error}") from error
    return {
        "path": str(path),
        "title": document_title(path),
        "mtime": stat.st_mtime,
        "size": stat.st_size,
    }


def _read_identity(path: Path) -> tuple[str, os.stat_result]:
    try:
        source = path.read_text(encoding="utf-8")
        stat = path.stat()
    except FileNotFoundError:
        raise
    except (OSError, UnicodeDecodeError) as error:
        raise WorkspacePathError(f"could not read {path}: {error}") from error
    return source, stat


def save_document(
    raw_path: object,
    source: object,
    files_root: Path,
    *,
    base_digest: str | None = None,
    force: bool = False,
) -> dict[str, Any]:
    path = resolve_document_path(raw_path, files_root)
    rendered = normalize_document_source(source)

    if path.exists() and not force:
        disk_source, disk_stat = _read_identity(path)
        disk_digest = document_digest(disk_source)
        if base_digest is None:
            raise WorkspaceConflictError(f"{path.name} already exists", disk_stat.st_mtime, disk_digest)
        if disk_digest != base_digest:
            raise WorkspaceConflictError(
                f"{path.name} changed on disk since it was opened",
                disk_stat.st_mtime,
                disk_digest,
            )
    elif not path.exists() and base_digest is not None and not force:
        raise WorkspaceConflictError(f"{path.name} was removed from disk", None, None)

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise WorkspacePathError(f"could not create {path.parent}: {error}") from error

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(rendered)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise
    return _metadata(path, rendered)


def rename_document(
    raw_path: object,
    raw_destination: object,
    files_root: Path,
    *,
    base_digest: str,
) -> dict[str, Any]:
    path = resolve_document_path(raw_path, files_root)
    destination = resolve_document_path(raw_destination, files_root)
    if path.parent != destination.parent:
        raise WorkspacePathError("rename must keep the document in its current folder")
    source, stat = _read_identity(path)
    digest = document_digest(source)
    if digest != base_digest:
        raise WorkspaceConflictError(
            f"{path.name} changed on disk since it was opened", stat.st_mtime, digest
        )
    if destination == path:
        return _metadata(path, source, stat)
    if destination.exists():
        destination_source, destination_stat = _read_identity(destination)
        raise WorkspaceConflictError(
            f"{destination.name} already exists",
            destination_stat.st_mtime,
            document_digest(destination_source),
        )

    try:
        os.link(path, destination)
    except FileExistsError:
        destination_source, destination_stat = _read_identity(destination)
        raise WorkspaceConflictError(
            f"{destination.name} already exists",
            destination_stat.st_mtime,
            document_digest(destination_source),
        )
    except OSError as error:
        raise WorkspacePathError(f"could not create {destination}: {error}") from error
    try:
        path.unlink()
    except OSError as error:
        raise WorkspacePathError(
            f"the new name was created, but the old one could not be removed: {error}"
        ) from error
    return _metadata(destination, source)


def trash_document(
    raw_path: object,
    files_root: Path,
    *,
    base_digest: str,
) -> dict[str, object]:
    """Move a document to the desktop trash after checking its exact revision."""
    path = resolve_document_path(raw_path, files_root)
    source, stat = _read_identity(path)
    digest = document_digest(source)
    if digest != base_digest:
        raise WorkspaceConflictError(
            f"{path.name} changed on disk since it was opened", stat.st_mtime, digest
        )
    gio = shutil.which("gio")
    if gio is None:
        raise WorkspacePathError("the desktop trash service is unavailable")
    completed = subprocess.run(
        [gio, "trash", str(path)], check=False, capture_output=True, text=True, timeout=30
    )
    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "could not move the document to Trash"
        raise WorkspacePathError(message)
    return {"path": str(path), "trashed": True}
