from __future__ import annotations

import io
import json
import shutil
import socket
import sys
import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import call, patch
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

import review_runtime as runtime  # noqa: E402
import sweep_worktrees as sweep  # noqa: E402


class ReviewRuntimeTests(unittest.TestCase):
    def review(self, root: Path) -> runtime.Review:
        return runtime.Review(
            name="pill-entry",
            commit="a" * 40,
            ref="example",
            worktree=str(root),
            port=4600,
            api_port=4601,
            board="sketches/review/pill.systemsketch",
            report="reports/pill.html",
            report_media="reports/media/pill-entry",
            report_builder="docs/build_pill.py",
        )

    def healthy_payload(self, review: runtime.Review) -> dict:
        return {
            "product": "systemsketch",
            "channel": "preview",
            "build": runtime.expected_build(review),
        }

    def test_review_name_refuses_paths_and_keeps_url_safe_label(self) -> None:
        self.assertEqual(runtime.review_name("pill-entry-2"), "pill-entry-2")
        for candidate in ("Pill", "pill_entry", "../pill", "pill entry", "x" * 49):
            with self.subTest(candidate=candidate):
                with self.assertRaises(runtime.ReviewRuntimeError):
                    runtime.review_name(candidate)

    def test_artifacts_stay_within_the_pinned_review_tree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review"
            root.mkdir()
            self.assertEqual(
                runtime.relative_artifact(root, "docs/report.html", "report"),
                "docs/report.html",
            )
            for artifact in ("../outside.html", str(Path(directory) / "outside.html")):
                with self.subTest(artifact=artifact):
                    with self.assertRaises(runtime.ReviewRuntimeError):
                        runtime.relative_artifact(root, artifact, "report")

    def test_registry_round_trip_is_atomic_and_keeps_review_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            registry = Path(directory) / "reviews.json"
            review = self.review(Path(directory) / "review")
            with patch.object(runtime, "registry_path", return_value=registry):
                runtime.write_reviews({review.name: review})
                restored = runtime.load_reviews()
            self.assertEqual(restored, {review.name: review})
            self.assertEqual(json.loads(registry.read_text(encoding="utf-8"))["version"], 3)

    def test_a_bound_requested_port_is_never_stolen(self) -> None:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(runtime.ReviewRuntimeError, "already occupied"):
                runtime.allocate_port_pair(port)

    def test_a_retired_review_keeps_its_port_pair_reserved(self) -> None:
        # A retained review may be down while still owning a durable URL.
        # Allocation must not make a later review silently replace that URL.
        with patch.object(runtime, "port_is_free", return_value=True):
            self.assertEqual(
                runtime.allocate_port_pair(reserved_ports=frozenset({4600, 4601})),
                (4602, 4603),
            )

    def test_new_publish_reserves_ports_listed_in_the_registry(self) -> None:
        existing = self.review(Path("/tmp/existing-review"))
        existing.name = "existing-review"
        saved: dict[str, runtime.Review] = {}
        with (
            patch.object(runtime, "registry_lock", return_value=nullcontext()),
            patch.object(runtime, "load_reviews", return_value={existing.name: existing}),
            patch.object(runtime, "git", return_value="b" * 40),
            patch.object(runtime, "review_worktree", return_value=Path("/tmp/new-review")),
            patch.object(runtime, "port_is_free", return_value=True),
            patch.object(runtime, "start", side_effect=lambda review: review),
            patch.object(runtime, "write_reviews", side_effect=lambda reviews: saved.update(reviews)),
            patch.object(sys, "argv", ["review_runtime.py", "up", "new-review", "--ref", "example"]),
        ):
            self.assertEqual(runtime.main(), 0)

        self.assertEqual(saved["new-review"].port, 4602)
        self.assertEqual(saved["new-review"].api_port, 4603)

    def test_initial_publish_resolves_head_in_the_invoking_track(self) -> None:
        source = Path("/tmp/implementation-track")
        saved: dict[str, runtime.Review] = {}
        with (
            patch.object(runtime, "registry_lock", return_value=nullcontext()),
            patch.object(runtime, "load_reviews", return_value={}),
            patch.object(runtime, "invoking_checkout", return_value=source),
            patch.object(runtime, "git", return_value="b" * 40) as git,
            patch.object(runtime, "review_worktree", return_value=Path("/tmp/new-review")),
            patch.object(runtime, "port_is_free", return_value=True),
            patch.object(runtime, "start", side_effect=lambda review: review),
            patch.object(runtime, "write_reviews", side_effect=lambda reviews: saved.update(reviews)),
            patch.object(sys, "argv", ["review_runtime.py", "up", "new-review", "--ref", "HEAD"]),
        ):
            self.assertEqual(runtime.main(), 0)

        self.assertIn(call("rev-parse", "HEAD^{commit}", cwd=source), git.call_args_list)
        self.assertEqual(saved["new-review"].commit, "b" * 40)

    def test_review_urls_are_derived_from_the_pinned_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review tree"
            review = self.review(root)
            self.assertEqual(runtime.report_url(review), "http://127.0.0.1:4600/reports/pill.html")
            self.assertEqual(
                runtime.board_url(review),
                "http://127.0.0.1:4600/?board="
                + quote(str(root.resolve() / "sketches/review/pill.systemsketch"), safe=""),
            )

    def test_every_agent_publishes_beside_the_primary_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            primary = Path(directory) / "systemsketch"
            primary.mkdir()
            agent_track = Path(directory) / "agent-track"
            with patch.object(runtime, "primary_checkout", return_value=primary):
                actual = runtime.review_worktree(agent_track, "pill-entry", "b" * 40)
            self.assertEqual(actual, Path(directory) / ".systemsketch-reviews" / "pill-entry-bbbbbbbbbbbb")

    def test_health_requires_the_pinned_public_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            review = self.review(Path(directory) / "review")
            response = io.StringIO(json.dumps(self.healthy_payload(review)))
            with patch.object(runtime.urllib.request, "urlopen", return_value=response):
                self.assertEqual(runtime.review_health(review), self.healthy_payload(review))
            wrong = self.healthy_payload(review) | {"build": "some-other-review"}
            with patch.object(runtime.urllib.request, "urlopen", return_value=io.StringIO(json.dumps(wrong))):
                self.assertIsNone(runtime.review_health(review))

    def test_runner_without_a_healthy_public_endpoint_is_not_reported_up(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            review = self.review(Path(directory) / "review")
            with patch.object(runtime, "process_in_worktree", return_value=True), patch.object(
                runtime, "review_health", return_value=None
            ):
                self.assertEqual(runtime.review_state(review), "unhealthy")

    def test_down_all_stops_every_lease_without_removing_any_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = self.review(Path(directory) / "first")
            second = self.review(Path(directory) / "second")
            second.name = "loop-ports"
            saved: dict[str, runtime.Review] = {}
            with patch.object(runtime, "registry_lock", return_value=nullcontext()), patch.object(
                runtime, "load_reviews", return_value={first.name: first, second.name: second}
            ), patch.object(runtime, "stop", side_effect=lambda review: review) as stop, patch.object(
                runtime, "write_reviews", side_effect=lambda reviews: saved.update(reviews)
            ), patch.object(sys, "argv", ["review_runtime.py", "down", "--all"]):
                self.assertEqual(runtime.main(), 0)
            self.assertEqual(stop.call_count, 2)
            self.assertEqual(set(saved), {"pill-entry", "loop-ports"})

    def test_sweeper_calls_a_review_lease_out_by_name(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lease = root / ".review-runtime"
            lease.mkdir()
            (lease / "lease.json").write_text('{"name":"pill-entry"}\n', encoding="utf-8")
            self.assertEqual(sweep.review_lease(root), "pill-entry")

    def test_review_vite_config_keeps_optimizer_cache_inside_its_lease(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review"
            root.mkdir()
            (root / ".review-runtime").mkdir()
            wrapper = runtime.review_vite_config(root)
            source = wrapper.read_text(encoding="utf-8")
            self.assertEqual(wrapper, root / ".review-runtime" / "vite.review.config.mjs")
            self.assertIn(json.dumps(str(root / "vite.config.ts")), source)
            self.assertIn(json.dumps(str(root / ".review-runtime" / "vite-cache")), source)

    def test_review_card_prefers_clear_actions_over_runtime_internals(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            review = self.review(Path(directory) / "review")
            with (
                patch.object(runtime, "review_state", return_value="up"),
                patch.object(runtime, "board_url", return_value="http://127.0.0.1:4600/board"),
                patch.object(runtime, "report_url", return_value="http://127.0.0.1:4600/report"),
            ):
                card = runtime.show(review)
            self.assertEqual(
                card,
                "\nReview · pill-entry\n"
                "Read\n"
                "📄 Standard HTML Rich Report  view\n"
                "\n"
                "Explore\n"
                "🖱 Guided Review Board  launch\n",
            )
            for absent in ("RUNNING", "pinned", "Media", "builder", "Re-run", "worktree", "ports"):
                with self.subTest(absent=absent):
                    self.assertNotIn(absent, card)

    def test_review_card_omits_empty_purpose_lanes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            report_only = self.review(Path(directory) / "report")
            report_only.board = None
            board_only = self.review(Path(directory) / "board")
            board_only.report = None

            self.assertEqual(
                runtime.show(report_only),
                "\nReview · pill-entry\nRead\n📄 Standard HTML Rich Report  view\n",
            )
            self.assertEqual(
                runtime.show(board_only),
                "\nReview · pill-entry\nExplore\n🖱 Guided Review Board  launch\n",
            )

    def test_report_media_stays_in_the_ignored_capture_namespace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review"
            root.mkdir()
            self.assertEqual(
                runtime.relative_report_media(root, "reports/media/pill-entry"),
                "reports/media/pill-entry",
            )
            for candidate in ("reports/pill-entry", "docs/assets/pill-entry", "reports/media"):
                with self.subTest(candidate=candidate):
                    with self.assertRaises(runtime.ReviewRuntimeError):
                        runtime.relative_report_media(root, candidate)

    def test_initial_publish_copies_ignored_media_and_restart_uses_the_retained_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            directory_path = Path(directory)
            source = directory_path / "track"
            root = directory_path / "review"
            (source / "reports/media/pill-entry").mkdir(parents=True)
            (source / "reports/media/pill-entry/hero.mp4").write_bytes(b"first capture")
            root.mkdir()
            review = self.review(root)

            runtime.copy_report_media(review, root, source)
            retained = root / "reports/media/pill-entry/hero.mp4"
            self.assertEqual(retained.read_bytes(), b"first capture")

            # A later `up` may come from an arbitrary terminal after the source
            # track has been swept. It must leave the retained evidence intact.
            shutil.rmtree(source / "reports")
            runtime.copy_report_media(review, root, source)
            self.assertEqual(retained.read_bytes(), b"first capture")

    def test_report_builder_receives_pinned_output_and_media_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review"
            (root / ".review-runtime").mkdir(parents=True)
            (root / "docs").mkdir()
            builder = root / "docs/build_pill.py"
            builder.write_text(
                "import os\n"
                "from pathlib import Path\n"
                "output = Path(os.environ['SYSTEMSKETCH_REPORT_OUTPUT'])\n"
                "output.parent.mkdir(parents=True, exist_ok=True)\n"
                "output.write_text(os.environ['SYSTEMSKETCH_REPORT_MEDIA_DIR'])\n",
                encoding="utf-8",
            )
            review = self.review(root)

            runtime.rebuild_report(review, root)

            self.assertEqual(
                (root / "reports/pill.html").read_text(encoding="utf-8"),
                str(root / "reports/media/pill-entry"),
            )


if __name__ == "__main__":
    unittest.main()
