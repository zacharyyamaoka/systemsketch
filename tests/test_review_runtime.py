from __future__ import annotations

import io
import json
import socket
import sys
import tempfile
import unittest
from contextlib import nullcontext
from pathlib import Path
from unittest.mock import patch
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
            report="docs/pill.html",
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
            self.assertEqual(json.loads(registry.read_text(encoding="utf-8"))["version"], 2)

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

    def test_review_urls_are_derived_from_the_pinned_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "review tree"
            review = self.review(root)
            self.assertEqual(runtime.report_url(review), "http://127.0.0.1:4600/docs/pill.html")
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


if __name__ == "__main__":
    unittest.main()
