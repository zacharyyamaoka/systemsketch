#!/usr/bin/env python3
"""Publish a committed SystemSketch review independently of an agent shell.

    python3 scripts/review_runtime.py up loop-ports --ref HEAD \
      --board sketches/review/loop-ports.systemsketch \
      --report docs/loop-ports-2026-09-03.html
    python3 scripts/review_runtime.py list
    python3 scripts/review_runtime.py down loop-ports
    python3 scripts/review_runtime.py down --all
    python3 scripts/review_runtime.py remove loop-ports

``serve.sh`` is a disposable development process. This command is for the URL
promised in a handoff: it pins one committed source tree, starts Vite and the
API in a detached process session, and retains that review until ``down`` or
``remove`` is explicitly requested. It does not infer that an idle chat means
the review is unwanted.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote


REPO = Path(__file__).resolve().parents[1]
NAME = re.compile(r"^[a-z][a-z0-9-]{0,47}$")
PORT_MIN = 4600
PORT_MAX = 4698
START_TIMEOUT_SECONDS = 35.0
STOP_TIMEOUT_SECONDS = 5.0


class ReviewRuntimeError(RuntimeError):
    """A requested review cannot safely be launched or retired."""


@dataclass
class Review:
    name: str
    commit: str
    ref: str
    worktree: str
    port: int
    api_port: int
    board: str | None = None
    report: str | None = None
    pid: int | None = None
    started_at: float | None = None


def git(*args: str, cwd: Path = REPO, check: bool = True) -> str:
    completed = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=False,
    )
    if check and completed.returncode:
        raise ReviewRuntimeError(
            f"git {' '.join(args)} failed:\n{completed.stdout}{completed.stderr}".strip(),
        )
    return completed.stdout.strip()


def review_name(value: str) -> str:
    if not NAME.fullmatch(value):
        raise ReviewRuntimeError("review name must be lowercase letters, digits, and hyphens")
    return value


def primary_checkout(repo: Path = REPO) -> Path:
    """Return the stable main checkout even when an agent runs inside a track."""
    for line in git("worktree", "list", "--porcelain", cwd=repo).splitlines():
        if line.startswith("worktree "):
            return Path(line.split(" ", 1)[1]).resolve()
    raise ReviewRuntimeError("git did not report a primary SystemSketch checkout")


def shared_git_dir(repo: Path = REPO) -> Path:
    directory = Path(git("rev-parse", "--git-common-dir", cwd=repo))
    return (repo / directory).resolve() if not directory.is_absolute() else directory


def registry_path(repo: Path = REPO) -> Path:
    return shared_git_dir(repo) / "systemsketch-reviews.json"


@contextmanager
def registry_lock(repo: Path = REPO) -> Iterator[None]:
    """Serialize concurrent agents publishing into the shared Git metadata."""
    lock_path = registry_path(repo).with_suffix(".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def load_reviews(repo: Path = REPO) -> dict[str, Review]:
    registry = registry_path(repo)
    if not registry.exists():
        return {}
    try:
        payload = json.loads(registry.read_text(encoding="utf-8"))
        records = payload.get("reviews") if isinstance(payload, dict) else None
        if not isinstance(records, dict):
            raise ValueError("missing reviews object")
        restored: dict[str, Review] = {}
        for name, record in records.items():
            if not isinstance(name, str) or not isinstance(record, dict):
                raise ValueError("review records must be named objects")
            restored[review_name(name)] = Review(**record)
        return restored
    except (OSError, TypeError, ValueError) as error:
        raise ReviewRuntimeError(f"cannot read review registry {registry}: {error}") from error


def write_reviews(reviews: dict[str, Review], repo: Path = REPO) -> None:
    """Atomically replace the shared registry after a serialized transition."""
    registry = registry_path(repo)
    registry.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{registry.name}.", dir=registry.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(
                {"version": 2, "reviews": {name: asdict(review) for name, review in reviews.items()}},
                output,
                indent=2,
                sort_keys=True,
            )
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(registry)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


def review_worktree(repo: Path, name: str, commit: str) -> Path:
    # WHY: a published URL should outlive its implementation worktree. Keeping
    # it alongside the primary checkout gives every agent one predictable home,
    # rather than scattering retained reviews underneath temporary tracks.
    return primary_checkout(repo).parent / ".systemsketch-reviews" / f"{name}-{commit[:12]}"


def relative_artifact(worktree: Path, value: str | None, label: str) -> str | None:
    """Keep published URLs confined to the immutable review checkout."""
    if value is None:
        return None
    candidate = Path(value)
    if candidate.is_absolute():
        raise ReviewRuntimeError(f"{label} must be relative to the reviewed worktree")
    resolved_root = worktree.resolve()
    resolved = (resolved_root / candidate).resolve()
    if resolved != resolved_root and resolved_root not in resolved.parents:
        raise ReviewRuntimeError(f"{label} escapes the reviewed worktree")
    return str(candidate)


def port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def allocate_port_pair(
    requested: int | None = None,
    *,
    reserved_ports: frozenset[int] = frozenset(),
) -> tuple[int, int]:
    """Pick a public/API pair that no published review can later reclaim.

    A review can be temporarily down without being retired. Its URL still owns
    its port pair, because restarting that review must never make a newer
    review serve a different board at the old URL.
    """
    candidates = [requested] if requested is not None else range(PORT_MIN, PORT_MAX + 1, 2)
    for port in candidates:
        if (
            port is not None
            and port not in reserved_ports
            and port + 1 not in reserved_ports
            and port_is_free(port)
            and port_is_free(port + 1)
        ):
            return port, port + 1
    if requested is not None:
        raise ReviewRuntimeError(
            f"review port pair {requested}/{requested + 1} is already occupied or reserved"
        )
    raise ReviewRuntimeError(f"no free review port pair in {PORT_MIN}–{PORT_MAX + 1}")


def process_in_worktree(pid: int | None, worktree: Path) -> bool:
    if pid is None or pid <= 0:
        return False
    try:
        cwd = Path(os.readlink(Path("/proc") / str(pid) / "cwd")).resolve()
    except OSError:
        return False
    return cwd == worktree.resolve()


def expected_build(review: Review) -> str:
    return f"review-{review.name}-{review.commit[:12]}"


def review_health(review: Review, timeout: float = 0.8) -> dict | None:
    """Probe the public Vite endpoint, which also proves the API proxy works."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{review.port}/api/health", timeout=timeout) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get("product") != "systemsketch" or payload.get("channel") != "preview":
        return None
    return payload if payload.get("build") == expected_build(review) else None


def review_state(review: Review) -> str:
    root = Path(review.worktree)
    if not process_in_worktree(review.pid, root):
        return "down"
    return "up" if review_health(review) else "unhealthy"


def ensure_worktree(review: Review, repo: Path = REPO) -> Path:
    root = Path(review.worktree)
    if not root.exists():
        root.parent.mkdir(parents=True, exist_ok=True)
        git("worktree", "add", "--detach", str(root), review.commit, cwd=repo)
    if not (root / ".git").exists():
        raise ReviewRuntimeError(f"review path exists but is not a Git worktree: {root}")
    modules = root / "node_modules"
    if not modules.exists():
        source_modules = primary_checkout(repo) / "node_modules"
        if not source_modules.exists():
            raise ReviewRuntimeError(f"review runtime needs dependencies at {source_modules}")
        modules.symlink_to(source_modules)
    lease = root / ".review-runtime"
    for child in ("runtime", "state", "boards"):
        (lease / child).mkdir(parents=True, exist_ok=True)
    # The supervisor is copied into the immutable checkout so its own agent
    # worktree may be merged, removed, or reused without changing the review.
    shutil.copy2(Path(__file__).resolve(), lease / "review_runtime.py")
    return root


def validate_artifacts(review: Review, root: Path) -> None:
    for label, relative in (("board", review.board), ("report", review.report)):
        if relative and not (root / relative).is_file():
            raise ReviewRuntimeError(
                f"{label} {relative!r} is not in pinned review commit {review.commit[:12]}; commit it before publishing",
            )


def write_lease(review: Review, root: Path) -> None:
    (root / ".review-runtime" / "lease.json").write_text(
        json.dumps(asdict(review), indent=2, sort_keys=True) + "\n", encoding="utf-8",
    )


def board_url(review: Review) -> str | None:
    if not review.board:
        return None
    path = (Path(review.worktree) / review.board).resolve()
    return f"http://127.0.0.1:{review.port}/?board={quote(str(path), safe='')}"


def report_url(review: Review) -> str | None:
    return f"http://127.0.0.1:{review.port}/{review.report.lstrip('/')}" if review.report else None


def wait_for_health(review: Review, timeout: float = START_TIMEOUT_SECONDS) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if payload := review_health(review):
            return payload
        if not process_in_worktree(review.pid, Path(review.worktree)):
            break
        time.sleep(0.2)
    raise ReviewRuntimeError(
        f"{review.name} did not become healthy on {review.port}; inspect "
        f"{Path(review.worktree) / '.review-runtime' / 'server.log'}",
    )


def start(review: Review, repo: Path = REPO) -> Review:
    root = ensure_worktree(review, repo)
    validate_artifacts(review, root)
    if process_in_worktree(review.pid, root):
        if review_health(review):
            return review
        review = stop(review)
    if not port_is_free(review.port) or not port_is_free(review.api_port):
        raise ReviewRuntimeError(
            f"cannot start {review.name}: its ports {review.port}/{review.api_port} are in use",
        )
    runner = root / ".review-runtime" / "review_runtime.py"
    log = root / ".review-runtime" / "server.log"
    with log.open("ab", buffering=0) as output:
        process = subprocess.Popen(
            [
                sys.executable, str(runner), "_serve", "--root", str(root),
                "--port", str(review.port), "--api-port", str(review.api_port),
                "--name", review.name, "--commit", review.commit,
            ],
            cwd=root,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    review.pid = process.pid
    review.started_at = time.time()
    write_lease(review, root)
    try:
        wait_for_health(review)
    except ReviewRuntimeError:
        stop(review)
        raise
    return review


def stop(review: Review) -> Review:
    root = Path(review.worktree)
    if process_in_worktree(review.pid, root):
        with contextlib.suppress(ProcessLookupError):
            os.killpg(int(review.pid), signal.SIGTERM)
        deadline = time.monotonic() + STOP_TIMEOUT_SECONDS
        while process_in_worktree(review.pid, root) and time.monotonic() < deadline:
            time.sleep(0.05)
        if process_in_worktree(review.pid, root):
            with contextlib.suppress(ProcessLookupError):
                os.killpg(int(review.pid), signal.SIGKILL)
    review.pid = None
    review.started_at = None
    if root.exists():
        write_lease(review, root)
    return review


def stop_child(process: subprocess.Popen[bytes] | subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=STOP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=STOP_TIMEOUT_SECONDS)


def review_vite_config(root: Path) -> Path:
    """Write the review-local Vite cache override beside its retained lease.

    A review worktree deliberately shares the primary checkout's dependencies
    through a ``node_modules`` symlink. Vite's default optimizer cache lives
    *inside* that symlink, though, which lets one retained review invalidate the
    dependency URLs being served by another. The visible symptom is a blank
    page with ``504 Outdated Optimize Dep`` before React mounts.

    Keep the packages shared but make only Vite's generated dependency cache
    local to this review. The wrapper imports the pinned tree's ordinary config
    first, so a review retains its own plugins, proxy, and build behavior; it
    overrides just the runtime-owned cache location.
    """
    lease = root / ".review-runtime"
    config = lease / "vite.review.config.mjs"
    source_config = root / "vite.config.ts"
    cache_dir = lease / "vite-cache"
    config.write_text(
        "// Generated by review_runtime.py; do not add review-specific app settings here.\n"
        f"import baseConfig from {json.dumps(str(source_config))};\n"
        f"export default {{ ...baseConfig, cacheDir: {json.dumps(str(cache_dir))} }};\n",
        encoding="utf-8",
    )
    return config


def launch_children(root: Path, port: int, api_port: int, name: str, commit: str) -> tuple[subprocess.Popen, subprocess.Popen]:
    lease = root / ".review-runtime"
    environment = {
        **os.environ,
        "SYSTEMSKETCH_RELEASE_HOME": str(lease / "runtime"),
        "SYSTEMSKETCH_STATE_HOME": str(lease / "state"),
        "SYSTEMSKETCH_API_PORT": str(api_port),
    }
    vite_config = review_vite_config(root)
    api = subprocess.Popen([
        sys.executable, "scripts/server.py", "--port", str(api_port),
        "--files-root", str(lease / "boards"), "--allow-source-root", "--dist", "dist",
        "--channel", "preview", "--build", f"review-{name}-{commit[:12]}",
        "--source-root", str(root),
    ], cwd=root, env=environment)
    try:
        vite = subprocess.Popen([
            str(root / "node_modules" / ".bin" / "vite"), "--host", "127.0.0.1",
            "--port", str(port), "--strictPort", "--config", str(vite_config),
        ], cwd=root, env=environment)
    except OSError:
        stop_child(api)
        raise
    return api, vite


def serve(root: Path, port: int, api_port: int, name: str, commit: str) -> int:
    """Supervise the public/API pair until an explicit process-group stop.

    A child can fail independently (for example after a transient filesystem or
    Vite error). Restarting the pair keeps a published URL useful, while the
    bounded backoff prevents a bad review from becoming a hot loop.
    """
    stop_requested = False
    children: tuple[subprocess.Popen, subprocess.Popen] | None = None

    def request_stop(_signum: int, _frame: Any) -> None:
        nonlocal stop_requested
        stop_requested = True
        if children:
            for child in children:
                stop_child(child)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    restarts = 0
    while not stop_requested:
        try:
            children = launch_children(root, port, api_port, name, commit)
        except OSError as error:
            print(f"review {name}: launch failed: {error}", flush=True)
            children = None
        if children:
            api, vite = children
            print(f"review {name}: serving on {port}/{api_port}", flush=True)
            while not stop_requested and api.poll() is None and vite.poll() is None:
                time.sleep(0.2)
            failed = [label for label, child in (("API", api), ("Vite", vite)) if child.poll() is not None]
            for child in children:
                stop_child(child)
            children = None
            if stop_requested:
                return 0
            print(f"review {name}: {' and '.join(failed)} exited; restarting", flush=True)
        if stop_requested:
            return 0
        restarts += 1
        delay = min(10.0, 0.25 * 2 ** min(restarts, 6))
        deadline = time.monotonic() + delay
        while not stop_requested and time.monotonic() < deadline:
            time.sleep(0.1)
    return 0


def show(review: Review) -> str:
    state = review_state(review)
    lines = [
        f"{review.name}: {state}",
        f"  commit  {review.commit}",
        f"  worktree {review.worktree}",
        f"  ports   {review.port}/{review.api_port}",
    ]
    if url := board_url(review):
        lines.append(f"  board   {url}")
    if url := report_url(review):
        lines.append(f"  report  {url}")
    lines.append(f"  stop    python3 scripts/review_runtime.py down {review.name}")
    return "\n".join(lines)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subcommands = parser.add_subparsers(dest="command", required=True)
    up = subcommands.add_parser("up", help="create or restart a retained review")
    up.add_argument("name")
    up.add_argument("--ref", default="HEAD", help="committed ref to pin (default: HEAD)")
    up.add_argument("--board", help="board path relative to the reviewed worktree")
    up.add_argument("--report", help="report path relative to the reviewed worktree")
    up.add_argument("--port", type=int, help="preferred public port; API uses the next port")
    subcommands.add_parser("list", help="show retained reviews, URLs, and live health")
    down = subcommands.add_parser("down", help="stop reviews but keep them restartable")
    down.add_argument("name", nargs="?")
    down.add_argument("--all", action="store_true", help="stop every retained review")
    remove = subcommands.add_parser("remove", help="stop and delete one retained review worktree")
    remove.add_argument("name")
    serve_parser = subcommands.add_parser("_serve")
    serve_parser.add_argument("--root", required=True)
    serve_parser.add_argument("--port", type=int, required=True)
    serve_parser.add_argument("--api-port", type=int, required=True)
    serve_parser.add_argument("--name", required=True)
    serve_parser.add_argument("--commit", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_arguments()
    if args.command == "_serve":
        return serve(Path(args.root), args.port, args.api_port, args.name, args.commit)

    with registry_lock():
        reviews = load_reviews()
        if args.command == "list":
            print("\n\n".join(show(review) for _, review in sorted(reviews.items())) or "no retained reviews")
            return 0

        if args.command == "down" and args.all:
            if args.name:
                raise ReviewRuntimeError("down accepts either NAME or --all, not both")
            for name, review in reviews.items():
                reviews[name] = stop(review)
            write_reviews(reviews)
            print(f"stopped {len(reviews)} retained review(s)")
            return 0

        name = review_name(args.name) if args.name else None
        if args.command == "down" and name is None:
            raise ReviewRuntimeError("down requires NAME or --all")
        if args.command == "up":
            commit = git("rev-parse", f"{args.ref}^{{commit}}")
            existing = reviews.get(name)
            if existing and existing.commit != commit:
                raise ReviewRuntimeError(
                    f"{name} already pins {existing.commit[:12]}; remove it before replacing that published URL",
                )
            if existing:
                review = existing
                if args.board:
                    review.board = relative_artifact(Path(review.worktree), args.board, "board")
                if args.report:
                    review.report = relative_artifact(Path(review.worktree), args.report, "report")
            else:
                # WHY: a retained review's address is part of its handoff.
                # Reusing a stopped review's port makes its old board URL hit
                # another review's server, which looks like a workspace-root
                # rejection even though both boards are valid.
                reserved_ports = frozenset(
                    port
                    for retained in reviews.values()
                    for port in (retained.port, retained.api_port)
                )
                port, api_port = allocate_port_pair(args.port, reserved_ports=reserved_ports)
                root = review_worktree(REPO, name, commit)
                review = Review(
                    name, commit, args.ref, str(root), port, api_port,
                    relative_artifact(root, args.board, "board"),
                    relative_artifact(root, args.report, "report"),
                )
            if args.port is not None and args.port != review.port:
                raise ReviewRuntimeError(f"{name} already owns port {review.port}; published URLs do not move")
            reviews[name] = start(review)
            write_reviews(reviews)
            print(show(reviews[name]))
            return 0

        if name not in reviews:
            raise ReviewRuntimeError(f"no retained review named {name}")
        review = reviews[name]
        if args.command == "down":
            reviews[name] = stop(review)
            write_reviews(reviews)
            print(show(reviews[name]))
            return 0

        stop(review)
        root = Path(review.worktree)
        if root.exists():
            git("worktree", "remove", "--force", str(root))
        del reviews[name]
        write_reviews(reviews)
        print(f"removed retained review {name}")
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReviewRuntimeError as error:
        raise SystemExit(f"review runtime: {error}")
