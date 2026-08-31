#!/usr/bin/env python3
"""Serve one immutable SystemSketch release or the Preview control API."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from release_lib import (
    PRODUCT,
    ReleaseError,
    default_release_home,
    installed_launcher_path,
    project_metadata,
    read_channels,
    read_manifest,
    rollback_stable,
    source_mtime,
)


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
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(self.app.health_payload())
            return
        if path == "/api/release":
            try:
                self._json(self.app.release_payload())
            except ReleaseError as cause:
                self._json({"error": str(cause)}, HTTPStatus.CONFLICT)
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/release":
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 16_384:
                raise ReleaseError("request is too large")
            payload = json.loads(self.rfile.read(length) or b"{}")
            action = payload.get("action") if isinstance(payload, dict) else None
            if action not in {"preview", "stable", "promote", "rollback"}:
                raise ReleaseError("unknown release action")
            self._json(self.app.run_action(action))
        except (OSError, ValueError, ReleaseError, subprocess.SubprocessError) as cause:
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
    ):
        self.dist = dist.resolve()
        self.channel = channel
        self.build = build
        self.release_home = release_home.resolve()
        self.source_root = source_root.resolve()
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
        }

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

    def _ensure_channel(self, channel: str, *, open_window: bool = False) -> str:
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
        completed = subprocess.run(command, check=True, capture_output=True, text=True, timeout=45)
        for line in reversed(completed.stdout.splitlines()):
            if line.startswith("http://"):
                return line.strip()
        return "http://127.0.0.1:4322/" if channel == "preview" else "http://127.0.0.1:4321/"

    def run_action(self, action: str) -> dict:
        if action == "preview":
            url = self._ensure_channel("preview", open_window=True)
            return self.release_payload(message="Live Preview is ready in a separate local canvas.", launch_url=url)
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
