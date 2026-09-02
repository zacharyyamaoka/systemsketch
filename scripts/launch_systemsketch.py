#!/usr/bin/env python3
"""Launch immutable Stable or hot-reloading Preview without sharing a writer."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode, urlparse, urlunparse

from release_lib import (
    PRODUCT,
    ReleaseError,
    controller_fingerprint,
    default_release_home,
    read_channels,
    read_manifest,
    release_root,
    source_root_from_channels,
)


STABLE_PORT = int(os.environ.get("SYSTEMSKETCH_STABLE_PORT", "4321"))
PREVIEW_PORT = int(os.environ.get("SYSTEMSKETCH_PREVIEW_PORT", "4322"))
PREVIEW_API_PORT = int(os.environ.get("SYSTEMSKETCH_PREVIEW_API_PORT", "4323"))
# Each channel's Chrome opens a DevTools port so the flight recorder's sidecar
# can screencast the window. Loopback only; Chrome refuses any browser origin.
PREVIEW_CDP_PORT = int(os.environ.get("SYSTEMSKETCH_PREVIEW_CDP_PORT", "4324"))
STABLE_CDP_PORT = int(os.environ.get("SYSTEMSKETCH_STABLE_CDP_PORT", "4325"))
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def cdp_port_for_channel(channel: str) -> int:
    return PREVIEW_CDP_PORT if channel == "preview" else STABLE_CDP_PORT


def default_state_home() -> Path:
    configured = os.environ.get("SYSTEMSKETCH_STATE_HOME")
    if configured:
        return Path(configured).expanduser().resolve()
    state_home = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return (state_home / "systemsketch" / "desktop-v2").resolve()


def health(port: int, timeout: float = 1.2) -> dict | None:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("product") != PRODUCT:
        return None
    return payload


def wait_for_health(port: int, channel: str, timeout: float = 35.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        payload = health(port)
        if payload and payload.get("channel") == channel:
            return payload
        time.sleep(0.2)
    raise ReleaseError(f"SystemSketch {channel} did not become healthy on port {port}")


def process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def read_pid(path: Path) -> int | None:
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None
    return pid if process_alive(pid) else None


def write_pid(path: Path, pid: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{pid}\n", encoding="utf-8")


def stop_pid(path: Path) -> bool:
    pid = read_pid(path)
    if pid is None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return False
    try:
        os.killpg(pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        try:
            os.kill(pid, signal.SIGTERM)
        except (OSError, ProcessLookupError):
            pass
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline and process_alive(pid):
        time.sleep(0.1)
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    return True


def log_path(state_home: Path, channel: str, name: str) -> Path:
    path = state_home / channel / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def spawn_logged(command: list[str], *, cwd: Path, log: Path, environment: dict[str, str] | None = None) -> int:
    output = log.open("ab", buffering=0)
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=output,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    output.close()
    return process.pid


def ensure_stable(release_home: Path, state_home: Path) -> tuple[str, dict]:
    channels = read_channels(release_home)
    if channels.stable is None:
        raise ReleaseError("no verified Stable release is installed")
    manifest = read_manifest(release_home, channels.stable)
    current = health(STABLE_PORT)
    if current:
        if current.get("channel") != "stable":
            raise ReleaseError(f"port {STABLE_PORT} is occupied by another SystemSketch channel")
        if current.get("build") == channels.stable:
            return f"http://127.0.0.1:{STABLE_PORT}/", current
        pid_path = state_home / "stable" / "server.pid"
        if read_pid(pid_path) is None:
            raise ReleaseError(
                f"Stable build {current.get('build')} is outdated but its server is not owned by this launcher"
            )
        stop_pid(pid_path)
        if health(STABLE_PORT, timeout=0.4) is not None:
            raise ReleaseError(f"outdated Stable server on port {STABLE_PORT} did not stop")
    if health(STABLE_PORT, timeout=0.2) is not None:
        raise ReleaseError(f"port {STABLE_PORT} is already occupied")

    root = release_root(release_home, channels.stable)
    server = root / "runtime" / "server.py"
    source_root = Path(str(manifest["sourceRoot"])).resolve()
    pid_path = state_home / "stable" / "server.pid"
    stale = read_pid(pid_path)
    if stale is not None:
        stop_pid(pid_path)
    pid = spawn_logged(
        [
            sys.executable,
            str(server),
            "--port",
            str(STABLE_PORT),
            "--dist",
            str(root / "dist"),
            "--channel",
            "stable",
            "--build",
            channels.stable,
            "--release-home",
            str(release_home),
            "--source-root",
            str(source_root),
            "--cdp-port",
            str(STABLE_CDP_PORT),
        ],
        cwd=root,
        log=log_path(state_home, "stable", "server.log"),
    )
    write_pid(pid_path, pid)
    return f"http://127.0.0.1:{STABLE_PORT}/", wait_for_health(STABLE_PORT, "stable")


def ensure_preview(release_home: Path, state_home: Path) -> tuple[str, dict]:
    source_root = source_root_from_channels(release_home)
    expected_controller = controller_fingerprint(source_root / "scripts")
    preview_state = state_home / "preview"
    api_pid_path = preview_state / "api.pid"
    vite_pid_path = preview_state / "vite.pid"

    current = health(PREVIEW_PORT)
    if current:
        if current.get("channel") != "preview":
            raise ReleaseError(f"port {PREVIEW_PORT} is occupied by another SystemSketch channel")
        if current.get("controllerFingerprint") == expected_controller:
            return f"http://127.0.0.1:{PREVIEW_PORT}/", current
        if read_pid(api_pid_path) is None or read_pid(vite_pid_path) is None:
            raise ReleaseError(
                "Preview is outdated but its API and Vite processes are not owned by this launcher"
            )
        stop_pid(vite_pid_path)
        stop_pid(api_pid_path)
        if health(PREVIEW_PORT, timeout=0.4) is not None:
            raise ReleaseError(f"outdated Preview server on port {PREVIEW_PORT} did not stop")
    else:
        stop_pid(vite_pid_path)
        stop_pid(api_pid_path)

    if health(PREVIEW_PORT, timeout=0.2) is not None:
        raise ReleaseError(f"port {PREVIEW_PORT} is already occupied")

    vite = source_root / "node_modules" / ".bin" / "vite"
    if not vite.is_file():
        raise ReleaseError(f"Preview requires `npm install` in {source_root}")
    channels = read_channels(release_home)
    fallback_build = channels.stable or channels.candidate
    if fallback_build is None:
        raise ReleaseError("Preview requires at least one verified release")
    dist = release_root(release_home, fallback_build) / "dist"

    api_pid = spawn_logged(
        [
            sys.executable,
            str(source_root / "scripts" / "server.py"),
            "--port",
            str(PREVIEW_API_PORT),
            "--dist",
            str(dist),
            "--channel",
            "preview",
            "--build",
            "working-tree",
            "--release-home",
            str(release_home),
            "--source-root",
            str(source_root),
            "--cdp-port",
            str(PREVIEW_CDP_PORT),
        ],
        cwd=source_root,
        log=log_path(state_home, "preview", "api.log"),
    )
    write_pid(api_pid_path, api_pid)
    environment = os.environ.copy()
    environment["SYSTEMSKETCH_API_PORT"] = str(PREVIEW_API_PORT)
    vite_pid = spawn_logged(
        [str(vite), "--host", "127.0.0.1", "--port", str(PREVIEW_PORT), "--strictPort"],
        cwd=source_root,
        log=log_path(state_home, "preview", "vite.log"),
        environment=environment,
    )
    write_pid(vite_pid_path, vite_pid)
    try:
        payload = wait_for_health(PREVIEW_PORT, "preview")
    except Exception:
        stop_pid(vite_pid_path)
        stop_pid(api_pid_path)
        raise
    return f"http://127.0.0.1:{PREVIEW_PORT}/", payload


def chrome_executable() -> str | None:
    for candidate in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        executable = shutil.which(candidate)
        if executable:
            return executable
    return None


def focus_existing(app_id: str) -> bool:
    xdotool = shutil.which("xdotool")
    if not xdotool or not os.environ.get("DISPLAY"):
        return False
    result = subprocess.run(
        [xdotool, "search", "--onlyvisible", "--class", f"^{re.escape(app_id)}$"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False
    for window_id in reversed(result.stdout.split()):
        subprocess.run([xdotool, "windowactivate", window_id], check=False)
        return True
    return False


def app_id_for_channel(channel: str) -> str:
    return "systemsketch-preview" if channel == "preview" else "systemsketch"


def open_app(url: str, state_home: Path, channel: str, *, new_window: bool = False) -> None:
    app_id = app_id_for_channel(channel)
    if not new_window and focus_existing(app_id):
        return
    chrome = chrome_executable()
    if chrome is None:
        raise ReleaseError("Google Chrome or Chromium is required for the desktop window")
    profile = state_home / channel / "browser-profile"
    profile.mkdir(parents=True, exist_ok=True)
    command = [
            chrome,
            f"--app={url}",
            f"--class={app_id}",
            f"--name={app_id}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            f"--remote-debugging-port={cdp_port_for_channel(channel)}",
        ]
    if new_window:
        command.append("--new-window")
    subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        close_fds=True,
    )


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release-home", type=Path, default=None)
    parser.add_argument("--state-home", type=Path, default=None)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--launch-url")
    parser.add_argument(
        "file",
        nargs="?",
        type=Path,
        help="Open one local .systemsketch or .tldr document",
    )
    parser.add_argument("--new-window", action="store_true")
    parser.add_argument("--open", dest="open_window", action="store_true")
    parser.add_argument("--no-open", dest="open_window", action="store_false")
    parser.set_defaults(open_window=False)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--all", action="store_true")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    release_home = (arguments.release_home or default_release_home()).expanduser().resolve()
    state_home = (arguments.state_home or default_state_home()).expanduser().resolve()
    try:
        if arguments.stop:
            stopped: list[str] = []
            if arguments.all or not arguments.preview:
                if stop_pid(state_home / "stable" / "server.pid"):
                    stopped.append("Stable")
            if arguments.all or arguments.preview:
                preview_stopped = False
                for name in ("vite.pid", "api.pid"):
                    preview_stopped = stop_pid(state_home / "preview" / name) or preview_stopped
                if preview_stopped:
                    stopped.append("Preview")
            print("Stopped " + " and ".join(stopped) if stopped else "No owned SystemSketch server was running.")
            return 0

        if arguments.status:
            for channel, port in (("Stable", STABLE_PORT), ("Preview", PREVIEW_PORT)):
                payload = health(port)
                if payload:
                    print(f"{channel}: healthy on {port}, build {payload.get('build')}")
                else:
                    print(f"{channel}: stopped")
            return 0

        channel = "preview" if arguments.preview else "stable"
        channel_port = PREVIEW_PORT if arguments.preview else STABLE_PORT
        if arguments.open_window and not arguments.new_window and arguments.file is None:
            current = health(channel_port)
            if current and current.get("channel") == channel and focus_existing(app_id_for_channel(channel)):
                print(f"SystemSketch {channel.title()}: {current.get('build')}")
                print(f"http://127.0.0.1:{channel_port}/")
                return 0
        url, payload = ensure_preview(release_home, state_home) if arguments.preview else ensure_stable(release_home, state_home)
        requested_file_url = None
        if arguments.file is not None:
            requested_file = arguments.file.expanduser().resolve()
            if not requested_file.name.lower().endswith((".systemsketch", ".tldr")):
                raise ReleaseError(
                    "SystemSketch can only open .systemsketch or .tldr documents"
                )
            requested_file_url = urlunparse(
                urlparse(url)._replace(query=urlencode({"board": str(requested_file)}))
            )
        launch_url = arguments.launch_url or requested_file_url or url
        if urlparse(launch_url).netloc != urlparse(url).netloc or urlparse(launch_url).scheme != urlparse(url).scheme:
            raise ReleaseError("launch URL must use the selected local SystemSketch channel")
        print(f"SystemSketch {channel.title()}: {payload.get('build')}")
        print(launch_url)
        if arguments.open_window:
            open_app(
                launch_url,
                state_home,
                channel,
                new_window=arguments.new_window or arguments.file is not None,
            )
        return 0
    except (OSError, ReleaseError, subprocess.SubprocessError) as cause:
        print(f"SystemSketch launch error: {cause}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
