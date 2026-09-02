"""Safe local-file storage for SystemSketch workspaces.

SystemSketch owns two document extensions and treats the extension as the
contract for what is inside:

``.systemsketch``
    A tldraw file plus one extra top-level ``systemSketch`` envelope. This is
    what every new document is written as.
``.tldr``
    A plain tldraw file, with no envelope. Opened, edited and saved in place so
    existing boards keep working; never silently converted.

The browser remains the tldraw schema authority — it authors the envelope in
``src/workspace/systemSketchFile.ts``. This module only validates the portable
file envelope, holds the two types apart, confines paths to one configured
root, and provides atomic digest-fenced file operations.
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


SYSTEMSKETCH_SUFFIX = ".systemsketch"
TLDRAW_SUFFIX = ".tldr"
DOCUMENT_SUFFIXES = (SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX)
DOCUMENT_KINDS = {SYSTEMSKETCH_SUFFIX: "systemsketch", TLDRAW_SUFFIX: "tldraw"}
SYSTEMSKETCH_ENVELOPE_KEY = "systemSketch"
SYSTEMSKETCH_FORMAT_VERSION = 1
DEFAULT_WORKSPACE_DIRNAME = "SystemSketch"
DEFAULT_DOCUMENT_STEM = "Untitled"
DEFAULT_DOCUMENT_NAME = f"{DEFAULT_DOCUMENT_STEM}{SYSTEMSKETCH_SUFFIX}"
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


def document_suffix(name: object) -> str | None:
    """The SystemSketch extension ``name`` uses, or ``None`` if it uses neither."""
    lowered = str(name).lower()
    for suffix in DOCUMENT_SUFFIXES:
        if len(lowered) > len(suffix) and lowered.endswith(suffix):
            return suffix
    return None


def document_kind(path: Path) -> str:
    return DOCUMENT_KINDS.get(document_suffix(path.name) or "", "tldraw")


def default_workspace_dir(files_root: Path) -> Path:
    return files_root.resolve() / DEFAULT_WORKSPACE_DIRNAME


def default_document_path(files_root: Path) -> Path:
    """The document a clean launch opens.

    New workspaces get ``Untitled.systemsketch``, but a workspace that already
    holds an ``Untitled.tldr`` from before this file type existed keeps opening
    that one. Changing the default extension must not orphan someone's board.
    """
    workspace = default_workspace_dir(files_root)
    for suffix in DOCUMENT_SUFFIXES:
        candidate = workspace / f"{DEFAULT_DOCUMENT_STEM}{suffix}"
        if candidate.is_file():
            return candidate
    return workspace / DEFAULT_DOCUMENT_NAME


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
    if document_suffix(resolved.name) is None:
        raise WorkspacePathError(
            "a SystemSketch document must end with "
            + " or ".join(DOCUMENT_SUFFIXES)
        )
    return resolved


def document_title(path: Path) -> str:
    suffix = document_suffix(path.name)
    return path.name[: -len(suffix)] if suffix else path.name


def document_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _parse_document(source: object, *, allow_future: bool = False) -> dict[str, Any]:
    """Validate the portable tldraw envelope both document types share."""
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

    envelope = document.get(SYSTEMSKETCH_ENVELOPE_KEY)
    if envelope is not None:
        if not isinstance(envelope, dict):
            raise WorkspaceFormatError(f"{SYSTEMSKETCH_ENVELOPE_KEY} must be an object")
        version = envelope.get("formatVersion")
        if not isinstance(version, int):
            raise WorkspaceFormatError(
                f"{SYSTEMSKETCH_ENVELOPE_KEY} is missing an integer formatVersion"
            )
        if version > SYSTEMSKETCH_FORMAT_VERSION and not allow_future:
            raise WorkspaceFormatError(
                f"this document was written by a newer SystemSketch "
                f"(.systemsketch format {version}, this build reads {SYSTEMSKETCH_FORMAT_VERSION})"
            )
    return document


def create_directory(raw_parent: object, raw_name: object, files_root: Path) -> dict[str, str]:
    """Create one visible workspace folder without guessing at the requested name."""
    parent = resolve_directory(raw_parent, files_root)
    if not parent.exists():
        raise WorkspacePathError(f"parent folder does not exist: {parent}")
    if not parent.is_dir():
        raise WorkspacePathError(f"not a directory: {parent}")
    if not isinstance(raw_name, str):
        raise WorkspacePathError("folder name must be a string")
    name = raw_name.strip()
    if not name or name in {".", ".."}:
        raise WorkspacePathError("folder name must not be empty, . or ..")
    if name.startswith("."):
        raise WorkspacePathError("folder name must not start with .")
    if any(character in name for character in ("/", "\\", "\0")):
        raise WorkspacePathError("folder name must not contain a path separator")
    if any(ord(character) < 32 or ord(character) == 127 for character in name):
        raise WorkspacePathError("folder name must not contain control characters")

    destination = parent / name
    # Resolve before mkdir so a symlinked parent cannot lead the operation out
    # of the configured workspace root between path composition and creation.
    resolved = _resolve_inside_root(str(destination), files_root)
    try:
        resolved.mkdir(exist_ok=False)
    except FileExistsError as error:
        raise WorkspacePathError(f"{name} already exists") from error
    except OSError as error:
        raise WorkspacePathError(f"could not create {name}: {error}") from error
    return {"name": name, "path": str(resolved)}


def normalize_document_source(source: object, *, suffix: str | None = None) -> str:
    """Render a document for disk, optionally holding it to one extension's contract.

    Reading passes no ``suffix``: anything openable should open, including a
    ``.tldr`` hand-renamed to ``.systemsketch``. Writing passes the destination
    suffix, and then the rule is exact — a ``.systemsketch`` must carry the
    envelope and a ``.tldr`` must not. That is what stops the two types from
    quietly becoming one type with two names.
    """
    document = _parse_document(source)
    has_envelope = document.get(SYSTEMSKETCH_ENVELOPE_KEY) is not None
    if suffix == SYSTEMSKETCH_SUFFIX and not has_envelope:
        raise WorkspaceFormatError(
            f"a {SYSTEMSKETCH_SUFFIX} document must carry a {SYSTEMSKETCH_ENVELOPE_KEY} envelope"
        )
    if suffix == TLDRAW_SUFFIX and has_envelope:
        raise WorkspaceFormatError(
            f"a {TLDRAW_SUFFIX} document must stay a plain tldraw file "
            f"(it carries a {SYSTEMSKETCH_ENVELOPE_KEY} envelope)"
        )
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
                elif entry.is_file() and document_suffix(entry.name) is not None:
                    stat = entry.stat()
                    documents.append(
                        {
                            "name": entry.name,
                            "title": document_title(entry),
                            "path": str(entry.resolve()),
                            "kind": document_kind(entry),
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
    # IDE hosts seed a new custom-editor target as a zero-byte file. Standalone
    # must give that exact representation the same meaning: an intentional
    # blank canvas whose first user edit becomes a normal encoded document.
    # Non-blank bytes keep the existing host validation before reaching tldraw.
    if source.strip():
        # Reads may return a structurally valid future envelope byte-for-byte so
        # the browser can offer an explicit compatibility copy. Every write path
        # still calls normalize_document_source(), which refuses a downgrade.
        _parse_document(source, allow_future=True)
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
    rendered = normalize_document_source(source, suffix=document_suffix(path.name))

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
    if document_suffix(path.name) != document_suffix(destination.name):
        raise WorkspacePathError(
            "rename cannot change a document's type; use Save As to write the other format"
        )
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
