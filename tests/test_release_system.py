from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from release_lib import (  # noqa: E402
    promote_candidate,
    read_channels,
    read_manifest,
    rollback_stable,
    source_root_from_channels,
    stage_candidate,
)
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
                    url = server._ensure_channel("preview", open_window=True)
                command = run.call_args.args[0]
                self.assertIn("--preview", command)
                self.assertIn("--open", command)
                self.assertNotIn("--no-open", command)
                self.assertEqual(url, "http://127.0.0.1:4322/")
            finally:
                server.server_close()


if __name__ == "__main__":
    unittest.main()
