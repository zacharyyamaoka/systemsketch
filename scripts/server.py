#!/usr/bin/env python3
"""Serve one immutable SystemSketch release or the Preview control API."""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from release_lib import (
    PRODUCT,
    ReleaseError,
    controller_fingerprint,
    default_release_home,
    installed_launcher_path,
    project_metadata,
    read_channels,
    read_manifest,
    rollback_stable,
    source_mtime,
)
from workspace_store import (
    WorkspaceConflictError,
    WorkspaceFormatError,
    WorkspacePathError,
    list_documents,
    load_document,
    rename_document,
    resolve_document_path,
    save_document,
    stat_document,
    trash_document,
)


MAX_API_REQUEST_BYTES = 64 * 1024 * 1024
PREVIEW_CLONE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{24,128}$")
PREVIEW_PRESETS = {
    "product": "Latest Preview",
    "block-dev": "Block Dev",
    "stock": "Stock tldraw",
}


class SystemSketchHandler(SimpleHTTPRequestHandler):
    server_version = "SystemSketch/0.1"

    def __init__(self, *args, app: "SystemSketchServer", **kwargs):
        self.app = app
        super().__init__(*args, directory=str(app.dist), **kwargs)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)

    def end_headers(self) -> None:
        if self.path.startswith("/api/") or self.path in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = (json.dumps(payload, ensure_ascii=False) + "\n").encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self._json(self.app.health_payload())
            return
        if path == "/api/release":
            try:
                self._json(self.app.release_payload())
            except ReleaseError as cause:
                self._json({"error": str(cause)}, HTTPStatus.CONFLICT)
            return
        if path == "/api/preview-clone":
            try:
                token = parse_qs(parsed.query).get("token", [""])[0]
                self._json({"snapshot": self.app.consume_preview_clone(token)})
            except ReleaseError as cause:
                self._json({"error": str(cause)}, HTTPStatus.NOT_FOUND)
            return
        if path == "/api/workspace/list":
            try:
                values = parse_qs(parsed.query).get("dir", [])
                requested = values[0] if len(values) == 1 else None
                self._json(list_documents(requested, self.app.files_root))
            except WorkspacePathError as cause:
                self._json({"error": str(cause)}, HTTPStatus.BAD_REQUEST)
            return
        if path == "/api/workspace/file":
            values = parse_qs(parsed.query).get("path", [])
            try:
                if len(values) != 1:
                    raise WorkspacePathError("exactly one path query parameter is required")
                self._json(
                    load_document(
                        values[0],
                        self.app.files_root,
                        additional_roots=self.app.additional_document_roots,
                    )
                )
            except FileNotFoundError:
                self._json({"path": values[0], "source": None})
            except (WorkspacePathError, WorkspaceFormatError) as cause:
                self._json({"error": str(cause)}, HTTPStatus.BAD_REQUEST)
            return
        if path == "/api/workspace/stat":
            values = parse_qs(parsed.query).get("path", [])
            try:
                if len(values) != 1:
                    raise WorkspacePathError("exactly one path query parameter is required")
                self._json(
                    stat_document(
                        values[0],
                        self.app.files_root,
                        additional_roots=self.app.additional_document_roots,
                    )
                )
            except FileNotFoundError:
                self._json({"path": values[0], "mtime": None})
            except WorkspacePathError as cause:
                self._json({"error": str(cause)}, HTTPStatus.BAD_REQUEST)
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {
            "/api/release",
            "/api/workspace/file",
            "/api/workspace/rename",
            "/api/workspace/trash",
            "/api/workspace/reveal",
        }:
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > MAX_API_REQUEST_BYTES:
                raise ReleaseError("request is too large")
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError("payload must be an object")
            if path == "/api/release":
                action = payload.get("action")
                if action not in {"preview", "stable", "promote", "rollback"}:
                    raise ReleaseError("unknown release action")
                snapshot = payload.get("snapshot") if action == "preview" else None
                preset = payload.get("preset", "product") if action == "preview" else "product"
                self._json(self.app.run_action(action, snapshot=snapshot, preset=preset))
                return
            if path == "/api/workspace/file":
                base_digest = payload.get("baseDigest")
                if base_digest is not None and not isinstance(base_digest, str):
                    raise ValueError("baseDigest must be a string when present")
                self._json(
                    save_document(
                        payload.get("path"),
                        payload.get("source"),
                        self.app.files_root,
                        additional_roots=self.app.additional_document_roots,
                        base_digest=base_digest,
                        force=payload.get("force") is True,
                    )
                )
                return
            base_digest = payload.get("baseDigest")
            if path in {"/api/workspace/rename", "/api/workspace/trash"} and (
                not isinstance(base_digest, str) or not base_digest
            ):
                raise ValueError("baseDigest must be a non-empty string")
            if path == "/api/workspace/rename":
                self._json(
                    rename_document(
                        payload.get("path"),
                        payload.get("destination"),
                        self.app.files_root,
                        additional_roots=self.app.additional_document_roots,
                        base_digest=base_digest,
                    )
                )
                return
            if path == "/api/workspace/trash":
                self._json(
                    trash_document(
                        payload.get("path"),
                        self.app.files_root,
                        additional_roots=self.app.additional_document_roots,
                        base_digest=base_digest,
                    )
                )
                return
            self._json(self.app.reveal_document(payload.get("path")))
        except WorkspaceConflictError as cause:
            self._json(
                {
                    "error": str(cause),
                    "conflict": True,
                    "mtime": cause.disk_mtime,
                    "digest": cause.disk_digest,
                },
                HTTPStatus.CONFLICT,
            )
        except FileNotFoundError:
            self._json({"error": "the document no longer exists"}, HTTPStatus.NOT_FOUND)
        except (
            OSError,
            ValueError,
            ReleaseError,
            WorkspacePathError,
            WorkspaceFormatError,
            subprocess.SubprocessError,
        ) as cause:
            self._json({"error": str(cause)}, HTTPStatus.CONFLICT)


class SystemSketchServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        address: tuple[str, int],
        *,
        dist: Path,
        channel: str,
        build: str,
        release_home: Path,
        source_root: Path,
        files_root: Path | None = None,
        allow_source_root: bool = False,
    ):
        self.dist = dist.resolve()
        self.channel = channel
        self.build = build
        self.release_home = release_home.resolve()
        self.source_root = source_root.resolve()
        self.files_root = (files_root or Path.home()).expanduser().resolve()
        if allow_source_root and channel != "preview":
            raise ReleaseError("the source worktree can only be authorized in Preview")
        self.additional_document_roots = (
            (self.source_root,)
            if allow_source_root and self.source_root != self.files_root
            else ()
        )
        self.controller_fingerprint = controller_fingerprint(Path(__file__).resolve().parent)
        super().__init__(address, partial(SystemSketchHandler, app=self))

    def health_payload(self) -> dict:
        version, _changes = project_metadata(self.source_root)
        if self.channel == "stable":
            version = str(read_manifest(self.release_home, self.build).get("version", version))
        return {
            "product": PRODUCT,
            "channel": self.channel,
            "build": self.build,
            "version": version,
            "workspaceRoot": str(self.files_root),
            "documentRoots": [
                str(self.files_root),
                *(str(root) for root in self.additional_document_roots),
            ],
            "controllerFingerprint": self.controller_fingerprint,
        }

    def reveal_document(self, raw_path: object) -> dict:
        path = resolve_document_path(
            raw_path,
            self.files_root,
            additional_roots=self.additional_document_roots,
        )
        target = path.parent
        opener = next((value for value in ("xdg-open", "gio") if shutil.which(value)), None)
        if opener is None:
            raise ReleaseError("the desktop file browser is unavailable")
        command = [opener, str(target)] if opener == "xdg-open" else [opener, "open", str(target)]
        subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            close_fds=True,
        )
        return {"path": str(path), "revealed": True}

    def release_payload(self, *, message: str | None = None, launch_url: str | None = None) -> dict:
        channels = read_channels(self.release_home)
        version, changes = project_metadata(self.source_root)
        released_at: str | None = None
        changed = False
        if self.channel == "stable":
            manifest = read_manifest(self.release_home, self.build)
            version = str(manifest.get("version", version))
            changes = list(manifest.get("changes", changes))
            released_at = manifest.get("releasedAt") if isinstance(manifest.get("releasedAt"), str) else None
            recorded_source_time = float(manifest.get("sourceTime", 0.0))
            changed = source_mtime(self.source_root) > recorded_source_time + 0.000_001
        payload = {
            "product": PRODUCT,
            "channel": self.channel,
            "build": self.build,
            "stable": channels.stable,
            "candidate": channels.candidate,
            "previous": channels.previous,
            "version": version,
            "releasedAt": released_at,
            "changes": changes,
            "isCurrent": self.channel == "stable" and self.build == channels.stable,
            "sourceChanged": changed,
            "canPreview": (self.source_root / "node_modules" / ".bin" / "vite").is_file(),
            "canPromote": self.channel == "preview",
            "canRollback": channels.previous is not None,
        }
        if message:
            payload["message"] = message
        if launch_url:
            payload["launchUrl"] = launch_url
        return payload

    def preview_clones_dir(self) -> Path:
        return self.release_home / "preview-clones"

    def create_preview_clone(self, snapshot: object) -> str:
        if not isinstance(snapshot, dict):
            raise ReleaseError("Open Live Preview requires a board snapshot")
        encoded = (json.dumps({"snapshot": snapshot}, ensure_ascii=False) + "\n").encode()
        if len(encoded) > MAX_API_REQUEST_BYTES:
            raise ReleaseError("this board is too large to duplicate into Preview")
        token = secrets.token_urlsafe(24)
        directory = self.preview_clones_dir()
        directory.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(prefix=".preview-clone.", dir=directory)
        temporary = Path(temporary_name)
        destination = directory / f"{token}.json"
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(encoded)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary.exists():
                temporary.unlink()
        return token

    def consume_preview_clone(self, token: str) -> object:
        if not PREVIEW_CLONE_TOKEN.fullmatch(token):
            raise ReleaseError("this Preview duplicate link is invalid")
        path = self.preview_clones_dir() / f"{token}.json"
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            path.unlink()
        except FileNotFoundError as cause:
            raise ReleaseError("this Preview duplicate was already opened or has expired") from cause
        except (OSError, ValueError) as cause:
            raise ReleaseError(f"could not read this Preview duplicate: {cause}") from cause
        snapshot = payload.get("snapshot") if isinstance(payload, dict) else None
        if not isinstance(snapshot, dict):
            raise ReleaseError("this Preview duplicate is invalid")
        return snapshot

    def _ensure_channel(
        self,
        channel: str,
        *,
        open_window: bool = False,
        launch_url: str | None = None,
        new_window: bool = False,
    ) -> str:
        launcher = installed_launcher_path(self.release_home)
        if not launcher.is_file():
            launcher = self.source_root / "scripts" / "launch_systemsketch.py"
        command = [
            sys.executable,
            str(launcher),
            "--release-home",
            str(self.release_home),
        ]
        command.append("--open" if open_window else "--no-open")
        if channel == "preview":
            command.append("--preview")
        if launch_url:
            command.extend(["--launch-url", launch_url])
        if new_window:
            command.append("--new-window")
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=45)
        for line in reversed(completed.stdout.splitlines()):
            if line.startswith("http://"):
                return line.strip()
        return "http://127.0.0.1:4322/" if channel == "preview" else "http://127.0.0.1:4321/"

    def run_action(
        self,
        action: str,
        *,
        snapshot: object | None = None,
        preset: object = "product",
    ) -> dict:
        if action == "preview":
            if not isinstance(preset, str) or preset not in PREVIEW_PRESETS:
                raise ReleaseError("unknown Preview preset")
            parsed = urlparse("http://127.0.0.1:4322/")
            token: str | None = None
            if preset == "product":
                token = self.create_preview_clone(snapshot)
                query = {"previewClone": token}
            else:
                query = {"preset": preset}
            launch_url = urlunparse(parsed._replace(query=urlencode(query)))
            try:
                url = self._ensure_channel(
                    "preview",
                    open_window=True,
                    launch_url=launch_url,
                    new_window=True,
                )
            except Exception:
                if token is not None:
                    try:
                        (self.preview_clones_dir() / f"{token}.json").unlink()
                    except FileNotFoundError:
                        pass
                raise
            if preset != "product":
                return self.release_payload(
                    message=f"Opened {PREVIEW_PRESETS[preset]} on its independent Preview board.",
                    launch_url=url,
                )
            return self.release_payload(
                message="Opened an independent Preview duplicate of this board.",
                launch_url=url,
            )
        if action == "stable":
            url = self._ensure_channel("stable")
            return self.release_payload(message="Stable is ready.", launch_url=url)
        if action == "promote":
            if self.channel != "preview":
                raise ReleaseError("publishing is only available from live Preview")
            subprocess.run(
                [
                    sys.executable,
                    str(self.source_root / "scripts" / "release.py"),
                    "--release-home",
                    str(self.release_home),
                    "promote",
                ],
                cwd=self.source_root,
                check=True,
                timeout=300,
            )
            return self.release_payload(message="Verified Preview published for the next Stable launch.")
        rollback_stable(self.release_home)
        return self.release_payload(message="Previous verified build selected for the next Stable launch.")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--dist", type=Path, required=True)
    parser.add_argument("--channel", choices=("stable", "preview"), required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--release-home", type=Path, default=None)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--files-root", type=Path, default=None)
    parser.add_argument(
        "--allow-source-root",
        action="store_true",
        help="allow direct document URLs under the Preview source worktree",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    release_home = (arguments.release_home or default_release_home()).expanduser().resolve()
    server = SystemSketchServer(
        (arguments.host, arguments.port),
        dist=arguments.dist,
        channel=arguments.channel,
        build=arguments.build,
        release_home=release_home,
        source_root=arguments.source_root,
        files_root=arguments.files_root,
        allow_source_root=arguments.allow_source_root,
    )
    print(f"SystemSketch {arguments.channel} controller on http://{arguments.host}:{arguments.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
