from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from recording_store import (  # noqa: E402
    FrameSidecar,
    RecordingError,
    build_packet,
    last_recording,
    prune_recordings,
    recording_stamp,
    recordings_dir,
    state_sources,
    write_recording,
)


def payload(note: str = "", started: str = "2026-09-01T20:41:03.000Z") -> dict:
    return {
        "header": {
            "mode": "last",
            "startedAt": started,
            "endedAt": "2026-09-01T20:41:15.400Z",
            "startedAtWall": 1_756_759_263_000,
            "endedAtWall": 1_756_759_275_400,
            "durationMs": 12_400,
            "windowMs": 30_000,
            "note": note,
            "url": "http://127.0.0.1:4322/?board=%2Ftmp%2Fx.systemsketch",
            "viewport": {"w": 1440, "h": 960},
            "devicePixelRatio": 1,
            "pathAtStart": "select.idle",
            "pathAtEnd": "select.idle",
            "shapeCount": 2,
            "recorderCostMs": 2.1,
            "recorderUptimeMs": 40_000,
        },
        "rows": [
            {"t": 0, "lane": "input", "name": "pointer_down", "screen": [10, 10]},
            {"t": 5, "lane": "state", "from": "select.idle", "to": "block.pointing", "trigger": "pointer_down"},
            {"t": 12.5, "lane": "state", "from": "select.idle", "to": "select.pointing_block_port", "trigger": "pointer_down"},
            {"t": 40, "lane": "state", "from": "select.pointing_block_port", "to": "select.dragging_handle", "trigger": "pointer_move"},
            {"t": 900, "lane": "store", "source": "user", "ops": [{"op": "add", "id": "shape:c", "type": "connection"}]},
            {"t": 950, "lane": "console", "level": "error", "args": ["boom"]},
            {"t": 1000, "lane": "mark", "text": "here it broke"},
        ],
        "startSnapshot": {"store": {}, "schema": {}},
        "endSnapshot": {"store": {"shape:c": {"id": "shape:c", "typeName": "shape", "type": "connection"}}, "schema": {}},
    }


class RecordingStoreTests(unittest.TestCase):
    def test_a_recording_is_a_folder_under_the_workspace_with_the_packet_first(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            result = write_recording(
                payload("cable jumped"),
                files_root,
                source_root=PROJECT_ROOT,
                channel="preview",
                build="working-tree",
                version="0.1.0",
            )
            folder = Path(result["path"])
            self.assertEqual(folder.parent, recordings_dir(files_root))
            self.assertTrue(folder.name.endswith("-cable-jumped"), folder.name)
            for name in ("README.md", "header.json", "timeline.jsonl", "start.snapshot.json", "end.snapshot.json", "frames.jsonl", "playback.html", "states.json"):
                self.assertTrue((folder / name).is_file(), name)
            self.assertFalse(list(recordings_dir(files_root).glob(".staging-*")))

            packet = (folder / "README.md").read_text(encoding="utf-8")
            self.assertEqual(packet, result["packet"])
            self.assertIn("Note from the person recording:\n  cable jumped", packet)
            self.assertIn("Errors during the window (1):", packet)
            self.assertIn("select.pointing_block_port  →  select.dragging_handle", packet)
            self.assertIn(str(folder / "timeline.jsonl"), packet)
            self.assertIn("No frames were captured", packet)
            self.assertEqual(result["framesSource"], "none")

            header = json.loads((folder / "header.json").read_text(encoding="utf-8"))
            self.assertEqual(header["channel"], "preview")
            self.assertEqual(header["framesSource"], "none")
            rows = [json.loads(line) for line in (folder / "timeline.jsonl").read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(rows), 6)

            playback = (folder / "playback.html").read_text(encoding="utf-8")
            self.assertIn("here it broke", playback)
            self.assertIn('"lane": "state"', playback)

    def test_the_state_map_points_at_the_files_that_define_the_states(self) -> None:
        sources = state_sources(payload()["rows"], PROJECT_ROOT)
        self.assertIn("pointing_block_port", sources)
        self.assertTrue(sources["pointing_block_port"].startswith("src/"), sources)
        # A stock tldraw state resolves into tldraw's own tools — and a shared
        # name like `idle` resolves under the tool it was seen in.
        self.assertEqual(sources["idle"], "node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Idle.mjs")
        self.assertIn("SelectTool", sources["dragging_handle"])
        # The Block tool declares its id through a constant; the map follows it.
        self.assertTrue(sources["block"].startswith("src/blocks/"), sources)
        # `block.pointing` is inherited from tldraw's base box tool, not the Eraser's.
        self.assertIn("/@tldraw/editor/", sources["pointing"])

    def test_canvas_frames_are_written_when_no_screencast_was_available(self) -> None:
        import base64

        png = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode("ascii")
        with tempfile.TemporaryDirectory() as directory:
            data = payload()
            data["canvasFrames"] = [{"t": 0, "png": png}, {"t": 12_400, "png": png}]
            result = write_recording(data, Path(directory), source_root=PROJECT_ROOT, channel="preview", build="b", version="v")
            self.assertEqual(result["framesSource"], "canvas")
            self.assertEqual(result["frames"], 2)
            self.assertTrue((Path(result["path"]) / "frames" / "f-012400.png").is_file())
            self.assertIn("Canvas-only frames", result["packet"])

    def test_a_frame_dump_makes_the_recording_a_screencast_one(self) -> None:
        def dump(frames_dir: Path, header: dict) -> dict:
            (frames_dir / "f-000300.jpg").write_bytes(b"jpeg")
            return {"ok": True, "frames": [{"t": 300, "bytes": 4, "file": "frames/f-000300.jpg"}]}

        with tempfile.TemporaryDirectory() as directory:
            result = write_recording(payload(), Path(directory), source_root=PROJECT_ROOT, channel="preview", build="b", version="v", frame_dump=dump)
            self.assertEqual(result["framesSource"], "screencast")
            self.assertIn("f-000300.jpg = +0.30 s", result["packet"])
            frames = [json.loads(line) for line in (Path(result["path"]) / "frames.jsonl").read_text().splitlines()]
            self.assertEqual(frames, [{"t": 300, "bytes": 4, "file": "frames/f-000300.jpg"}])

    def test_last_recording_and_pruning_keep_the_folder_a_buffer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            files_root = Path(directory)
            self.assertIsNone(last_recording(files_root))
            for index in range(4):
                write_recording(payload(f"take {index}", started=f"2026-09-01T20:4{index}:00.000Z"), files_root, source_root=PROJECT_ROOT, channel="preview", build="b", version="v")
            newest = last_recording(files_root)
            self.assertIsNotNone(newest)
            self.assertTrue(newest["path"].endswith("-take-3"))
            removed = prune_recordings(recordings_dir(files_root), keep=2)
            self.assertEqual(len(removed), 2)
            remaining = sorted(path.name for path in recordings_dir(files_root).iterdir())
            self.assertEqual([name[-6:] for name in remaining], ["take-2", "take-3"])

    def test_bad_payloads_are_refused_before_anything_is_written(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RecordingError):
                write_recording({"header": {}, "rows": "nope"}, Path(directory), source_root=PROJECT_ROOT, channel="p", build="b", version="v")
            self.assertFalse(recordings_dir(Path(directory)).exists() and list(recordings_dir(Path(directory)).iterdir()))

    def test_stamp_uses_local_time_and_the_note(self) -> None:
        stamp = recording_stamp({"startedAt": "2026-09-01T20:41:03Z", "note": "Cable Jumped!! twice"})
        self.assertRegex(stamp, r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-cable-jumped-twice$")
        self.assertTrue(recording_stamp({"startedAt": "nonsense", "mode": "take"}).endswith("-take"))

    def test_the_packet_names_frames_and_files_in_reading_order(self) -> None:
        data = payload()
        text = build_packet(
            {**data["header"], "framesSource": "screencast", "channel": "preview", "build": "b"},
            data["rows"],
            [{"t": 0, "file": "frames/f-000000.jpg"}, {"t": 310, "file": "frames/f-000310.jpg"}],
            Path("/tmp/rec"),
            {"pointing_block_port": "src/blocks/ports/PointingBlockPort.ts"},
        )
        order = [text.index(marker) for marker in ("1. /tmp/rec/README.md", "2. /tmp/rec/timeline.jsonl", "3. /tmp/rec/frames/", "4. /tmp/rec/start.snapshot.json", "5. /tmp/rec/playback.html")]
        self.assertEqual(order, sorted(order))
        self.assertIn("pointing_block_port          src/blocks/ports/PointingBlockPort.ts", text)

    def test_the_sidecar_reports_why_frames_are_unavailable(self) -> None:
        sidecar = FrameSidecar(PROJECT_ROOT / "scripts" / "recorder_frames.mjs", cdp_port=None)
        available, reason = sidecar.availability()
        self.assertFalse(available)
        self.assertIn("debugging port", reason)
        self.assertEqual(sidecar.arm(True, "http://127.0.0.1:4322/?x=1")["screencast"], False)
        self.assertIsNone(sidecar.dump(Path("/tmp"), {}))
        with_port = FrameSidecar(PROJECT_ROOT / "scripts" / "recorder_frames.mjs", cdp_port=1, node="/definitely/not/node")
        self.assertIn("node", with_port.availability()[1])


if __name__ == "__main__":
    unittest.main()
