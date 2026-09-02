from __future__ import annotations

import contextlib
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from release_lib import (  # noqa: E402
    ReleaseError,
    SOURCE_PATHS,
    controller_fingerprint,
    promote_candidate,
    read_channels,
    read_manifest,
    release_build_id,
    rollback_stable,
    source_provenance,
    source_root_from_channels,
    stage_candidate,
)
import launch_systemsketch as launcher  # noqa: E402
import release as release_cli  # noqa: E402
import install_desktop as installer  # noqa: E402
from server import SystemSketchServer  # noqa: E402


def git(root: Path, *arguments: str) -> str:
    completed = subprocess.run(
        [
            "git",
            "-c", "user.email=test@systemsketch.local",
            "-c", "user.name=SystemSketch Test",
            "-c", "commit.gpgsign=false",
            "-C", str(root),
            *arguments,
        ],
        capture_output=True, text=True, check=True,
    )
    return completed.stdout


class ReleaseSystemTests(unittest.TestCase):
    def make_git_project(self, root: Path) -> Path:
        """A committed checkout shaped like this project: enough for a release."""
        scripts = root / "scripts"
        scripts.mkdir(parents=True)
        for name in (
            "launch_systemsketch.py", "release.py", "release_lib.py",
            "server.py", "workspace_store.py",
        ):
            (scripts / name).write_text(f"# {name}\n", encoding="utf-8")
        (root / "package.json").write_text('{"version": "9.9.9"}', encoding="utf-8")
        (root / "src").mkdir()
        (root / "src" / "App.tsx").write_text("export const App = () => null\n", encoding="utf-8")
        (root / "docs").mkdir()
        (root / "docs" / "report.html").write_text("<main>report</main>", encoding="utf-8")
        git(root, "init", "-q", "-b", "main")
        git(root, "add", "-A")
        git(root, "commit", "-qm", "initial")
        return root

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


    def test_a_release_records_the_commit_it_was_built_from(self) -> None:
        """A build id is a content address; it says nothing about the source.

        The tree that produced a build keeps moving — several sessions edit it
        at once — so without a commit there is no way back from a Stable
        artifact to the code inside it.
        """
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = self.make_git_project(root / "project")
            release_home = root / "runtime"

            build, manifest = stage_candidate(project, release_home, self.make_dist(root, "one"))
            head = git(project, "rev-parse", "HEAD").strip()

            self.assertEqual(manifest["commit"], head)
            self.assertEqual(manifest["branch"], "main")
            self.assertFalse(manifest["sourceDirty"])
            # Old controllers read these manifests, so the schema must not move.
            self.assertEqual(manifest["schemaVersion"], 1)
            self.assertEqual(read_manifest(release_home, build)["commit"], head)

    def test_only_source_makes_a_build_dirty(self) -> None:
        """Regenerated reports must never block a release.

        Peers rewrite `docs/` captures constantly; if that counted as dirty,
        the gate would be permanently red and would simply be turned off.
        """
        with tempfile.TemporaryDirectory() as directory:
            project = self.make_git_project(Path(directory) / "project")

            (project / "docs" / "report.html").write_text("<main>rebuilt</main>", encoding="utf-8")
            (project / "docs" / "capture.png").write_bytes(b"\x89PNG")
            self.assertFalse(source_provenance(project).dirty)

            (project / "package.json").write_text('{"version": "9.9.9", "x": 1}', encoding="utf-8")
            (project / "src" / "Untracked.tsx").write_text("export const x = 1\n", encoding="utf-8")
            dirty = source_provenance(project)
            self.assertTrue(dirty.dirty)
            # Both names intact: `git status --porcelain` puts two status
            # columns before the path, so trimming its output would eat the
            # first character of the first line.
            self.assertEqual(dirty.dirty_paths, ("package.json", "src/Untracked.tsx"))
            self.assertIn("package.json", SOURCE_PATHS)

    def test_a_tree_with_no_git_records_unknown_rather_than_clean(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            plain = Path(directory) / "plain"
            (plain / "src").mkdir(parents=True)
            provenance = source_provenance(plain)
            self.assertIsNone(provenance.commit)
            self.assertIsNone(provenance.dirty)
            self.assertEqual(provenance.dirty_paths, ())

    def test_a_release_refuses_a_dirty_source_tree_unless_overridden(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            project = self.make_git_project(Path(directory) / "project")
            release_cli.refuse_dirty_source(False, project)  # clean: no refusal

            (project / "src" / "App.tsx").write_text("export const App = () => 1\n", encoding="utf-8")
            with self.assertRaises(ReleaseError) as refusal:
                release_cli.refuse_dirty_source(False, project)
            self.assertIn("src/App.tsx", str(refusal.exception))
            self.assertIn("--allow-dirty", str(refusal.exception))

            with contextlib.redirect_stdout(io.StringIO()) as spoken:
                release_cli.refuse_dirty_source(True, project)  # the deliberate override
            self.assertIn("src/App.tsx", spoken.getvalue())

    def test_a_dirty_release_says_so_in_its_own_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = self.make_git_project(root / "project")
            (project / "src" / "App.tsx").write_text("export const App = () => 2\n", encoding="utf-8")

            _build, manifest = stage_candidate(project, root / "runtime", self.make_dist(root, "dirty"))
            self.assertTrue(manifest["sourceDirty"])
            self.assertEqual(manifest["commit"], git(project, "rev-parse", "HEAD").strip())


if __name__ == "__main__":
    unittest.main()
