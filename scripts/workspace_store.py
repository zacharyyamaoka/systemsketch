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
file envelope, holds the two types apart, confines paths to explicitly allowed
roots, and provides atomic digest-fenced file operations.
"""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import shutil
import stat as stat_module
import subprocess
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any


SYSTEMSKETCH_SUFFIX = ".systemsketch"
TLDRAW_SUFFIX = ".tldr"
DOCUMENT_SUFFIXES = (SYSTEMSKETCH_SUFFIX, TLDRAW_SUFFIX)
DOCUMENT_KINDS = {SYSTEMSKETCH_SUFFIX: "systemsketch", TLDRAW_SUFFIX: "tldraw"}
SYSTEMSKETCH_ENVELOPE_KEY = "systemSketch"
SYSTEMSKETCH_FORMAT_VERSION = 2
DEFAULT_WORKSPACE_DIRNAME = "SystemSketch"
DEFAULT_DOCUMENT_STEM = "Untitled"
DEFAULT_DOCUMENT_NAME = f"{DEFAULT_DOCUMENT_STEM}{SYSTEMSKETCH_SUFFIX}"
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
SAVE_VERIFY_ATTEMPTS = 3


class WorkspacePathError(ValueError):
    """A requested path escaped the workspace root or was not usable."""


class WorkspaceFormatError(ValueError):
    """The supplied text was not a portable tldraw document."""


class WorkspaceStorageError(RuntimeError):
    """A valid workspace operation could not complete because storage failed."""


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


def _resolve_inside_root(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
) -> Path:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise WorkspacePathError("path must be a non-empty string")
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        raise WorkspacePathError("path must be absolute")
    resolved = candidate.resolve()
    roots = (files_root.resolve(), *(root.resolve() for root in additional_roots))
    if not any(resolved == root or root in resolved.parents for root in roots):
        allowed = ", ".join(str(root) for root in roots)
        raise WorkspacePathError(f"path must stay under an allowed root: {allowed}")
    return resolved


def resolve_directory(raw_path: object, files_root: Path) -> Path:
    return _resolve_inside_root(raw_path, files_root)


def resolve_document_path(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
) -> Path:
    resolved = _resolve_inside_root(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
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


def _document_bytes_digest(source: bytes) -> str:
    """Revision identity for the exact bytes on disk, before text translation."""
    return hashlib.sha256(source).hexdigest()


def _document_lock_path(lock_root: Path, path: Path) -> Path:
    """The private runtime lock representing one canonical document path."""
    identity = hashlib.sha256(os.fsencode(str(path.resolve()))).hexdigest()
    return lock_root / f"{identity}.lock"


@contextmanager
def document_locks(lock_root: Path, *paths: Path) -> Iterator[None]:
    """Hold process-wide advisory locks for canonical paths in deadlock-safe order.

    WHY: Stable and Preview are independent ``ThreadingHTTPServer`` processes, so a
    Python ``threading.Lock`` cannot make the digest check and replacement one
    transaction. The controller gives both processes the same runtime lock
    root. Hashing canonical paths keeps persistent lock files out of the user's
    workspace and avoids exposing board names in runtime state.

    Lock files deliberately remain after use. Removing one while another
    process is waiting on its inode could split future callers across two lock
    identities and defeat the exclusion this function provides.
    """
    canonical = sorted({path.resolve() for path in paths}, key=lambda path: str(path))
    directory = lock_root.expanduser().resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptors: list[int] = []
    try:
        for path in canonical:
            flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_CLOEXEC", 0)
            descriptor = os.open(_document_lock_path(directory, path), flags, 0o600)
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX)
            except BaseException:
                os.close(descriptor)
                raise
            descriptors.append(descriptor)
        yield
    finally:
        for descriptor in reversed(descriptors):
            try:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            finally:
                os.close(descriptor)


def _fsync_directory(directory: Path) -> None:
    """Make a completed directory-entry mutation durable before reporting success."""
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(directory, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


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


def _is_legacy_pyblocks_document(source: str) -> bool:
    """Whether ``source`` is the retired PyBlocks nodes/edges envelope.

    This is a read-only compatibility gate. Every save still passes through
    :func:`normalize_document_source` and therefore must be a current tldraw
    document with the suffix-appropriate envelope.
    """
    try:
        document = json.loads(source)
    except json.JSONDecodeError:
        return False
    return (
        isinstance(document, dict)
        and isinstance(document.get("nodes"), list)
        and isinstance(document.get("edges"), list)
    )


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


def _metadata(
    path: Path,
    source: str,
    stat: os.stat_result | None = None,
    *,
    digest: str | None = None,
) -> dict[str, Any]:
    current_stat = stat or path.stat()
    return {
        "path": str(path),
        "title": document_title(path),
        "digest": digest if digest is not None else document_digest(source),
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


def load_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
) -> dict[str, Any]:
    path = resolve_document_path(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
    source, stat, digest = _read_identity(path)
    # IDE hosts seed a new custom-editor target as a zero-byte file. Standalone
    # must give that exact representation the same meaning: an intentional
    # blank canvas whose first user edit becomes a normal encoded document.
    # Non-blank bytes keep the existing host validation before reaching tldraw.
    if source.strip() and not (
        document_suffix(path.name) == SYSTEMSKETCH_SUFFIX
        and _is_legacy_pyblocks_document(source)
    ):
        # Reads may return a structurally valid future envelope byte-for-byte so
        # the browser can offer an explicit compatibility copy. Every write path
        # still calls normalize_document_source(), which refuses a downgrade.
        _parse_document(source, allow_future=True)
    return {**_metadata(path, source, stat, digest=digest), "source": source}


def stat_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
) -> dict[str, Any]:
    path = resolve_document_path(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
    source, stat, digest = _read_identity(path)
    return _metadata(path, source, stat, digest=digest)


def _read_identity(path: Path) -> tuple[str, os.stat_result, str]:
    try:
        # Read bounded raw bytes and metadata through one open file description.
        # An atomic external replacement may move the pathname while this is
        # running, but digest, text, and stat still describe the same inode.
        # Decoding only after hashing keeps CRLF/CR/LF rewrites distinct.
        with path.open("rb") as source_file:
            stat = os.fstat(source_file.fileno())
            if stat.st_size > MAX_DOCUMENT_BYTES:
                raise WorkspacePathError(f"{path.name} is too large to open")
            raw_source = source_file.read(MAX_DOCUMENT_BYTES + 1)
            if len(raw_source) > MAX_DOCUMENT_BYTES:
                raise WorkspacePathError(f"{path.name} is too large to open")
        source = raw_source.decode("utf-8")
    except FileNotFoundError:
        raise
    except (OSError, UnicodeDecodeError) as error:
        raise WorkspacePathError(f"could not read {path}: {error}") from error
    return source, stat, _document_bytes_digest(raw_source)


def _read_staged_bytes(path: Path) -> bytes:
    """Read one staged candidate back through the filesystem for verification."""
    with path.open("rb") as staged_file:
        return staged_file.read(MAX_DOCUMENT_BYTES + 1)


def _stage_verified_document(path: Path, rendered_bytes: bytes) -> Path:
    """Durably stage and verify exact document bytes before they can become canonical.

    WHY/SOURCE: draw.io Desktop v31.4.2's ``saveFile`` reads the completed
    canonical file back and retries at most three times when the bytes differ
    (``src/main/electron.js``). SystemSketch ports that proven invariant at its
    atomic staging seam instead: retrying ``O_TRUNC`` writes to the canonical
    path would discard our stronger no-partial-write guarantee and could
    overwrite a non-locking external editor.
    """
    last_error: OSError | None = None
    for _attempt in range(SAVE_VERIFY_ATTEMPTS):
        temporary_path: Path | None = None
        verified = False
        try:
            descriptor, temporary_name = tempfile.mkstemp(
                prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent
            )
            temporary_path = Path(temporary_name)
            with os.fdopen(descriptor, "wb") as output:
                output.write(rendered_bytes)
                output.flush()
                os.fsync(output.fileno())
            if _read_staged_bytes(temporary_path) == rendered_bytes:
                verified = True
                return temporary_path
        except OSError as error:
            last_error = error
        finally:
            if temporary_path is not None and not verified:
                try:
                    temporary_path.unlink()
                except FileNotFoundError:
                    pass
                except OSError as error:
                    last_error = error

    detail = f": {last_error}" if last_error is not None else ""
    raise WorkspaceStorageError(
        f"could not verify an exact staged write for {path.name} "
        f"after {SAVE_VERIFY_ATTEMPTS} attempts{detail}"
    )


def _preserve_existing_mode(temporary_path: Path, disk_stat: os.stat_result) -> None:
    """Carry safe POSIX group ownership and mode across an inode-replacing save."""
    try:
        with temporary_path.open("rb") as staged_file:
            descriptor = staged_file.fileno()
            desired_mode = stat_module.S_IMODE(disk_stat.st_mode) & 0o777
            staged_gid = os.fstat(descriptor).st_gid
            if staged_gid != disk_stat.st_gid:
                try:
                    os.fchown(descriptor, -1, disk_stat.st_gid)
                except OSError:
                    # An unprivileged writer may legitimately be unable to
                    # reproduce a file's group. The confirmed gid below, not
                    # the syscall outcome, decides whether group access is safe.
                    pass
                staged_gid = os.fstat(descriptor).st_gid
                if staged_gid != disk_stat.st_gid:
                    # WHY: ``mkstemp`` inherits the process/directory group. If
                    # that differs from a shared 0660 document, copying its
                    # group bits would expose the replacement to the wrong
                    # principals. Keep the save available, but fail closed by
                    # stripping group access when the original gid cannot be
                    # established. Apply gid before mode because chown may clear
                    # permission bits on POSIX systems.
                    desired_mode &= ~stat_module.S_IRWXG

            # ``mkstemp`` correctly makes new documents private (0600), but an
            # atomic replace must not silently privatize an existing shared
            # document. Preserve ordinary rwx bits only: a content rewrite must
            # not restore setuid/setgid/sticky privileges onto the new inode.
            os.fchmod(descriptor, desired_mode)
            os.fsync(descriptor)
    except OSError as error:
        raise WorkspaceStorageError(
            f"could not preserve permissions for {temporary_path.name}: {error}"
        ) from error


def _read_save_identity(path: Path, action: str) -> tuple[str, os.stat_result, str]:
    """Read a save revision while keeping path/format faults distinct from I/O."""
    try:
        return _read_identity(path)
    except WorkspacePathError as error:
        if isinstance(error.__cause__, OSError):
            raise WorkspaceStorageError(f"could not {action} {path.name}: {error}") from error
        raise


def save_document(
    raw_path: object,
    source: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str | None = None,
    force: bool = False,
    lock_root: Path,
) -> dict[str, Any]:
    path = resolve_document_path(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
    rendered = normalize_document_source(source, suffix=document_suffix(path.name))
    rendered_bytes = rendered.encode("utf-8")
    rendered_digest = _document_bytes_digest(rendered_bytes)

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise WorkspaceStorageError(f"could not create {path.parent}: {error}") from error

    temporary_path = _stage_verified_document(path, rendered_bytes)
    try:
        # Staging before the lock keeps unrelated preparation out of the
        # transaction and narrows the window in which an external, non-locking
        # writer could race the final compare-and-replace.
        with document_locks(lock_root, path):
            disk_stat: os.stat_result | None = None
            if force:
                try:
                    disk_stat = path.stat()
                except FileNotFoundError:
                    pass
            else:
                try:
                    disk_source, disk_stat, disk_digest = _read_save_identity(
                        path, "read the current revision of"
                    )
                except FileNotFoundError:
                    if base_digest is not None:
                        raise WorkspaceConflictError(
                            f"{path.name} was removed from disk", None, None
                        )
                else:
                    # A null base is the create-only Save As/export contract;
                    # identical bytes cannot prove this request created them.
                    if base_digest is not None and disk_digest != base_digest and (
                        disk_digest == rendered_digest and disk_source == rendered
                    ):
                        # WHY: a bounded browser HTTP request can time out after
                        # the replace commits but before its response arrives.
                        # draw.io's Electron IPC callback has no equivalent HTTP
                        # response deadline. Exact desired bytes therefore prove
                        # this is an idempotent replay, not a new conflict. Retry
                        # the directory sync too: the missing response may have
                        # followed a replace whose first durability sync failed.
                        _fsync_directory(path.parent)
                        replay_source, replay_stat, replay_digest = _read_save_identity(
                            path, "confirm the replayed revision of"
                        )
                        if (
                            replay_digest != rendered_digest
                            or replay_source != rendered
                        ):
                            raise WorkspaceConflictError(
                                f"{path.name} changed before the replay could be confirmed",
                                replay_stat.st_mtime,
                                replay_digest,
                            )
                        return _metadata(
                            path,
                            replay_source,
                            replay_stat,
                            digest=replay_digest,
                        )
                    if base_digest is None:
                        raise WorkspaceConflictError(
                            f"{path.name} already exists", disk_stat.st_mtime, disk_digest
                        )
                    if disk_digest != base_digest:
                        raise WorkspaceConflictError(
                            f"{path.name} changed on disk since it was opened",
                            disk_stat.st_mtime,
                            disk_digest,
                        )
            if disk_stat is not None:
                _preserve_existing_mode(temporary_path, disk_stat)
            os.replace(temporary_path, path)
            _fsync_directory(path.parent)
            try:
                canonical_source, canonical_stat, canonical_digest = _read_save_identity(
                    path, "confirm the saved revision of"
                )
            except FileNotFoundError as error:
                raise WorkspaceConflictError(
                    f"{path.name} disappeared before the save could be confirmed",
                    None,
                    None,
                ) from error
            if canonical_digest != rendered_digest or canonical_source != rendered:
                # A process that does not honor our advisory lock may replace
                # the path after publication. Report its revision; blindly
                # retrying here would clobber a legitimate external edit.
                raise WorkspaceConflictError(
                    f"{path.name} changed before the save could be confirmed",
                    canonical_stat.st_mtime,
                    canonical_digest,
                )
            return _metadata(
                path,
                canonical_source,
                canonical_stat,
                digest=canonical_digest,
            )
    except OSError as error:
        raise WorkspaceStorageError(f"could not save {path.name}: {error}") from error
    finally:
        try:
            temporary_path.unlink()
        except OSError:
            pass


def rename_document(
    raw_path: object,
    raw_destination: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str,
    lock_root: Path,
) -> dict[str, Any]:
    path = resolve_document_path(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
    destination = resolve_document_path(
        raw_destination,
        files_root,
        additional_roots=additional_roots,
    )
    if path.parent != destination.parent:
        raise WorkspacePathError("rename must keep the document in its current folder")
    if document_suffix(path.name) != document_suffix(destination.name):
        raise WorkspacePathError(
            "rename cannot change a document's type; use Save As to write the other format"
        )
    with document_locks(lock_root, path, destination):
        source, stat, digest = _read_identity(path)
        if digest != base_digest:
            raise WorkspaceConflictError(
                f"{path.name} changed on disk since it was opened", stat.st_mtime, digest
            )
        if destination == path:
            return _metadata(path, source, stat)
        if destination.exists():
            _destination_source, destination_stat, destination_digest = _read_identity(destination)
            raise WorkspaceConflictError(
                f"{destination.name} already exists",
                destination_stat.st_mtime,
                destination_digest,
            )

        try:
            os.link(path, destination)
        except FileExistsError:
            _destination_source, destination_stat, destination_digest = _read_identity(destination)
            raise WorkspaceConflictError(
                f"{destination.name} already exists",
                destination_stat.st_mtime,
                destination_digest,
            )
        except OSError as error:
            raise WorkspacePathError(f"could not create {destination}: {error}") from error
        try:
            path.unlink()
        except OSError as error:
            raise WorkspacePathError(
                f"the new name was created, but the old one could not be removed: {error}"
            ) from error
        # The link and unlink mutate two entries in the same directory. Persist
        # that directory before reporting the rename as complete.
        _fsync_directory(path.parent)
        return _metadata(destination, source)


def trash_document(
    raw_path: object,
    files_root: Path,
    *,
    additional_roots: tuple[Path, ...] = (),
    base_digest: str,
    lock_root: Path,
) -> dict[str, object]:
    """Move a document to the desktop trash after checking its exact revision."""
    path = resolve_document_path(
        raw_path,
        files_root,
        additional_roots=additional_roots,
    )
    with document_locks(lock_root, path):
        _source, stat, digest = _read_identity(path)
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
        _fsync_directory(path.parent)
        return {"path": str(path), "trashed": True}
