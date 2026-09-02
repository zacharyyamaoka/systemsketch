from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from release_lib import (  # noqa: E402
    controller_fingerprint,
    promote_candidate,
    read_channels,
    read_manifest,
    release_build_id,
    rollback_stable,
    source_root_from_channels,
    stage_candidate,
)
import launch_systemsketch as launcher  # noqa: E402
import install_desktop as installer  # noqa: E402
from server import SystemSketchServer  # noqa: E402


class ReleaseSystemTests(unittest.TestCase):
    def make_dist(self, root: Path, marker: str) -> Path:
        dist = root / f"dist-{marker}"
        dist.mkdir()
        (dist / "index.html").write_text(f"<main>{marker}</main>", encoding="utf-8")
        return dist

    def test_candidate_promote_and_rollback_keep_immutable_builds(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"

            first, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "first"))
            promoted_first = promote_candidate(release_home)
            self.assertEqual(promoted_first.stable, first)
            self.assertIsNone(promoted_first.previous)

            second, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "second"))
            promoted_second = promote_candidate(release_home)
            self.assertEqual(promoted_second.stable, second)
            self.assertEqual(promoted_second.previous, first)
            self.assertNotEqual(first, second)
            self.assertEqual(read_manifest(release_home, first)["build"], first)

            rolled_back = rollback_stable(release_home)
            self.assertEqual(rolled_back.stable, first)
            self.assertEqual(rolled_back.previous, second)
            self.assertEqual(source_root_from_channels(release_home), PROJECT_ROOT)

    def test_release_api_identifies_stable_and_preview_without_touching_the_canvas(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "api"))
            promote_candidate(release_home)
            release = release_home / "releases" / build
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=release / "dist",
                channel="stable",
                build=build,
                release_home=release_home,
                source_root=PROJECT_ROOT,
            )
            try:
                self.assertEqual(server.health_payload()["product"], "systemsketch")
                payload = server.release_payload()
                self.assertEqual(payload["channel"], "stable")
                self.assertTrue(payload["isCurrent"])
                self.assertFalse(payload["canPromote"])
                self.assertEqual(read_channels(release_home).stable, build)
            finally:
                server.server_close()

    def test_preview_action_delegates_window_ownership_to_the_launcher(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "launch"))
            promote_candidate(release_home)
            release = release_home / "releases" / build
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=release / "dist",
                channel="stable",
                build=build,
                release_home=release_home,
                source_root=PROJECT_ROOT,
            )
            try:
                completed = type("Completed", (), {"stdout": "http://127.0.0.1:4322/\n"})()
                with patch("server.installed_launcher_path", return_value=PROJECT_ROOT / "scripts" / "launch_systemsketch.py"), patch(
                    "server.subprocess.run", return_value=completed
                ) as run:
                    url = server._ensure_channel(
                        "preview",
                        open_window=True,
                        launch_url="http://127.0.0.1:4322/?previewClone=abc",
                        new_window=True,
                    )
                command = run.call_args.args[0]
                self.assertIn("--preview", command)
                self.assertIn("--open", command)
                self.assertIn("--new-window", command)
                self.assertIn("--launch-url", command)
                self.assertIn("http://127.0.0.1:4322/?previewClone=abc", command)
                self.assertNotIn("--no-open", command)
                self.assertEqual(url, "http://127.0.0.1:4322/")
            finally:
                server.server_close()

    def test_preview_clone_is_a_one_time_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "clone"))
            promote_candidate(release_home)
            release = release_home / "releases" / build
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=release / "dist",
                channel="stable",
                build=build,
                release_home=release_home,
                source_root=PROJECT_ROOT,
            )
            try:
                snapshot = {"document": {"store": {"shape:one": {"typeName": "shape"}}}, "session": {}}
                token = server.create_preview_clone(snapshot)
                self.assertRegex(token, r"^[A-Za-z0-9_-]+$")
                self.assertEqual(server.consume_preview_clone(token), snapshot)
                with self.assertRaisesRegex(Exception, "already opened or has expired"):
                    server.consume_preview_clone(token)
            finally:
                server.server_close()

    def test_preview_action_launches_a_new_window_with_the_clone_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "clone-launch"))
            promote_candidate(release_home)
            release = release_home / "releases" / build
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=release / "dist",
                channel="stable",
                build=build,
                release_home=release_home,
                source_root=PROJECT_ROOT,
            )
            try:
                with patch.object(server, "_ensure_channel", return_value="http://127.0.0.1:4322/") as ensure:
                    payload = server.run_action("preview", snapshot={"document": {}, "session": {}})
                options = ensure.call_args.kwargs
                self.assertTrue(options["open_window"])
                self.assertTrue(options["new_window"])
                self.assertRegex(options["launch_url"], r"^http://127\.0\.0\.1:4322/\?previewClone=")
                self.assertEqual(payload["message"], "Opened an independent Preview duplicate of this board.")
            finally:
                server.server_close()

    def test_isolated_preview_preset_launches_a_fresh_named_composition(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "preset-launch"))
            promote_candidate(release_home)
            release = release_home / "releases" / build
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=release / "dist",
                channel="stable",
                build=build,
                release_home=release_home,
                source_root=PROJECT_ROOT,
            )
            try:
                with patch.object(server, "_ensure_channel", return_value="http://127.0.0.1:4322/") as ensure:
                    payload = server.run_action("preview", preset="block-dev")
                launch_url = ensure.call_args.kwargs["launch_url"]
                self.assertEqual(parse_qs(urlparse(launch_url).query), {"preset": ["block-dev"]})
                self.assertIn("Block Dev", payload["message"])
                with self.assertRaisesRegex(Exception, "unknown Preview preset"):
                    server.run_action("preview", preset="retired")
            finally:
                server.server_close()

    def test_stable_launcher_replaces_an_owned_outdated_server(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            state_home = root / "state"
            first, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "old"))
            promote_candidate(release_home)
            second, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "new"))
            promote_candidate(release_home)
            old_health = {"product": "systemsketch", "channel": "stable", "build": first}
            new_health = {"product": "systemsketch", "channel": "stable", "build": second}

            with patch.object(launcher, "health", side_effect=[old_health, None, None]), patch.object(
                launcher, "read_pid", side_effect=[123, None]
            ), patch.object(launcher, "stop_pid", return_value=True) as stop, patch.object(
                launcher, "spawn_logged", return_value=456
            ) as spawn, patch.object(launcher, "write_pid"), patch.object(
                launcher, "wait_for_health", return_value=new_health
            ):
                _url, payload = launcher.ensure_stable(release_home, state_home)

            self.assertEqual(payload["build"], second)
            stop.assert_called_once_with(state_home / "stable" / "server.pid")
            self.assertIn(second, spawn.call_args.args[0])

    def test_controller_changes_produce_a_new_release_build(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dist = self.make_dist(root, "controller-hash")
            scripts = root / "scripts"
            scripts.mkdir()
            for name in (
                "launch_systemsketch.py",
                "release.py",
                "release_lib.py",
                "server.py",
                "workspace_store.py",
            ):
                (scripts / name).write_text(f"# {name}\n", encoding="utf-8")
            before = release_build_id(root, dist)
            (scripts / "launch_systemsketch.py").write_text("# launcher changed\n", encoding="utf-8")
            self.assertNotEqual(before, release_build_id(root, dist))

    def test_controller_fingerprint_changes_with_the_preview_api_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            scripts = Path(directory)
            for name in ("release_lib.py", "server.py", "workspace_store.py"):
                (scripts / name).write_text(f"# {name}\n", encoding="utf-8")
            before = controller_fingerprint(scripts)
            (scripts / "workspace_store.py").write_text("# workspace API changed\n", encoding="utf-8")
            self.assertNotEqual(before, controller_fingerprint(scripts))

    def test_preview_launcher_restarts_an_owned_stale_controller(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release_home = root / "runtime"
            state_home = root / "state"
            _build, _ = stage_candidate(PROJECT_ROOT, release_home, self.make_dist(root, "preview"))
            promote_candidate(release_home)
            stale_health = {
                "product": "systemsketch",
                "channel": "preview",
                "build": "working-tree",
            }
            fresh_health = {
                **stale_health,
                "controllerFingerprint": controller_fingerprint(PROJECT_ROOT / "scripts"),
            }

            with patch.object(launcher, "health", side_effect=[stale_health, None, None]), patch.object(
                launcher, "read_pid", side_effect=[123, 456]
            ), patch.object(launcher, "stop_pid", return_value=True) as stop, patch.object(
                launcher, "spawn_logged", side_effect=[789, 987]
            ) as spawn, patch.object(launcher, "write_pid"), patch.object(
                launcher, "wait_for_health", return_value=fresh_health
            ):
                _url, payload = launcher.ensure_preview(release_home, state_home)

            self.assertEqual(payload["controllerFingerprint"], fresh_health["controllerFingerprint"])
            self.assertEqual(
                [call.args[0] for call in stop.call_args_list],
                [state_home / "preview" / "vite.pid", state_home / "preview" / "api.pid"],
            )
            self.assertEqual(spawn.call_count, 2)

    def test_window_focus_uses_an_exact_visible_app_class(self) -> None:
        search_result = type("Completed", (), {"returncode": 0, "stdout": "42\n"})()
        activate_result = type("Completed", (), {"returncode": 0, "stdout": ""})()
        with patch.dict(launcher.os.environ, {"DISPLAY": ":1"}), patch.object(
            launcher.shutil, "which", return_value="/usr/bin/xdotool"
        ), patch.object(launcher.subprocess, "run", side_effect=[search_result, activate_result]) as run:
            self.assertTrue(launcher.focus_existing("systemsketch"))
        self.assertEqual(
            run.call_args_list[0].args[0],
            ["/usr/bin/xdotool", "search", "--onlyvisible", "--class", "^systemsketch$"],
        )

    def test_desktop_entry_registers_both_document_types_and_forwards_the_opened_file(self) -> None:
        entry = installer.desktop_entry(
            Path("/usr/bin/python3"),
            Path("/opt/systemsketch/launch_systemsketch.py"),
            Path("/opt/systemsketch/runtime"),
        )
        self.assertIn(
            "MimeType=application/vnd.systemsketch+json;application/vnd.tldraw+json;", entry
        )
        self.assertIn("Exec=/usr/bin/python3 /opt/systemsketch/launch_systemsketch.py", entry)
        self.assertIn("--release-home /opt/systemsketch/runtime %f", entry)
        mime = installer.mime_package()
        self.assertIn(b'<glob pattern="*.systemsketch"/>', mime)
        self.assertIn(b'<glob pattern="*.tldr"/>', mime)

    def test_desktop_install_removes_icon_variants_that_outrank_the_requested_png(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            icon_root = Path(directory) / "hicolor"
            canonical_icon = icon_root / "512x512" / "apps" / "systemsketch.png"
            stale_svg = icon_root / "scalable" / "apps" / "systemsketch.svg"
            stale_png = icon_root / "256x256" / "apps" / "systemsketch.png"
            unrelated_icon = icon_root / "scalable" / "apps" / "another-app.svg"
            for path in (canonical_icon, stale_svg, stale_png, unrelated_icon):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"icon")

            installer.remove_conflicting_icon_variants(icon_root, canonical_icon)

            self.assertTrue(canonical_icon.exists())
            self.assertTrue(unrelated_icon.exists())
            self.assertFalse(stale_svg.exists())
            self.assertFalse(stale_png.exists())


if __name__ == "__main__":
    unittest.main()
