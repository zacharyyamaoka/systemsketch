from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from workspace_store import (  # noqa: E402
    WorkspaceConflictError,
    WorkspacePathError,
    list_documents,
    load_document,
    pick_document_path,
    rename_document,
    save_document,
    stat_document,
    trash_document,
)


def document_source(marker: int = 1) -> str:
    return json.dumps(
        {
            "tldrawFileFormatVersion": 1,
            "schema": {"schemaVersion": 2, "sequences": {}},
            "records": [{"id": f"shape:{marker}", "typeName": "shape"}],
        }
    )


class WorkspaceStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.path = self.root / "SystemSketch" / "Architecture.tldr"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_atomic_save_read_stat_and_listing_use_plain_tldr_files(self) -> None:
        saved = save_document(str(self.path), document_source(), self.root)
        loaded = load_document(str(self.path), self.root)
        stat = stat_document(str(self.path), self.root)
        listing = list_documents(None, self.root)

        self.assertEqual(saved["digest"], loaded["digest"])
        self.assertEqual(stat["size"], saved["size"])
        self.assertEqual([item["title"] for item in listing["documents"]], ["Architecture"])
        self.assertEqual(listing["defaultDocument"], str(self.root / "SystemSketch" / "Untitled.tldr"))
        self.assertTrue(self.path.read_text(encoding="utf-8").endswith("\n"))

    def test_paths_are_confined_to_the_configured_root(self) -> None:
        outside = self.root.parent / "outside.tldr"
        with self.assertRaisesRegex(WorkspacePathError, "stay under"):
            save_document(str(outside), document_source(), self.root)
        with self.assertRaisesRegex(WorkspacePathError, "end with .tldr"):
            save_document(str(self.root / "board.json"), document_source(), self.root)

    def test_digest_fence_refuses_external_edits_and_missing_updates(self) -> None:
        first = save_document(str(self.path), document_source(1), self.root)
        self.path.write_text(document_source(2), encoding="utf-8")
        with self.assertRaisesRegex(WorkspaceConflictError, "changed on disk"):
            save_document(
                str(self.path), document_source(3), self.root, base_digest=first["digest"]
            )

        latest = load_document(str(self.path), self.root)
        self.path.unlink()
        with self.assertRaisesRegex(WorkspaceConflictError, "removed from disk"):
            save_document(
                str(self.path), document_source(4), self.root, base_digest=latest["digest"]
            )

    def test_rename_is_no_clobber_and_revision_checked(self) -> None:
        first = save_document(str(self.path), document_source(1), self.root)
        destination = self.path.with_name("Renamed.tldr")
        renamed = rename_document(
            str(self.path), str(destination), self.root, base_digest=first["digest"]
        )
        self.assertFalse(self.path.exists())
        self.assertEqual(renamed["path"], str(destination))

        occupied = self.path.with_name("Occupied.tldr")
        save_document(str(occupied), document_source(2), self.root)
        with self.assertRaisesRegex(WorkspaceConflictError, "already exists"):
            rename_document(
                str(destination), str(occupied), self.root, base_digest=renamed["digest"]
            )

    def test_delete_moves_the_exact_loaded_revision_to_desktop_trash(self) -> None:
        saved = save_document(str(self.path), document_source(), self.root)
        completed = type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/gio"), patch(
            "workspace_store.subprocess.run", return_value=completed
        ) as run:
            trash_document(str(self.path), self.root, base_digest=saved["digest"])
        self.assertEqual(run.call_args.args[0], ["/usr/bin/gio", "trash", str(self.path)])

    def test_native_open_chooser_returns_an_existing_tldr_path(self) -> None:
        self.path.parent.mkdir(parents=True)
        self.path.write_text(document_source(), encoding="utf-8")
        completed = type(
            "Completed",
            (),
            {"returncode": 0, "stdout": f"{self.path}\n", "stderr": ""},
        )()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/zenity"), patch(
            "workspace_store.subprocess.run", return_value=completed
        ) as run:
            picked = pick_document_path("open", str(self.path), self.root)

        self.assertEqual(picked["path"], str(self.path))
        self.assertFalse(picked["cancelled"])
        self.assertIn("--file-filter=SystemSketch files | *.tldr", run.call_args.args[0])

    def test_native_save_chooser_adds_tldr_and_preserves_overwrite_confirmation(self) -> None:
        selected = self.root / "SystemSketch" / "Copy"
        completed = type(
            "Completed",
            (),
            {"returncode": 0, "stdout": f"{selected}\n", "stderr": ""},
        )()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/zenity"), patch(
            "workspace_store.subprocess.run", return_value=completed
        ) as run:
            picked = pick_document_path("save", str(self.path), self.root)

        self.assertEqual(picked["path"], f"{selected}.tldr")
        self.assertIn("--save", run.call_args.args[0])
        self.assertIn("--confirm-overwrite", run.call_args.args[0])

    def test_native_chooser_avoids_the_busy_files_root(self) -> None:
        top_level_document = self.root / "Loose.tldr"
        completed = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": ""})()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/zenity"), patch(
            "workspace_store.subprocess.run", return_value=completed
        ) as run:
            pick_document_path("open", str(top_level_document), self.root)

        workspace = self.root / "SystemSketch"
        self.assertTrue(workspace.is_dir())
        self.assertIn(f"--filename={workspace}/", run.call_args.args[0])

    def test_native_chooser_cancellation_and_unavailability_are_not_errors(self) -> None:
        cancelled = type("Completed", (), {"returncode": 1, "stdout": "", "stderr": ""})()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/zenity"), patch(
            "workspace_store.subprocess.run", return_value=cancelled
        ):
            self.assertTrue(pick_document_path("open", None, self.root)["cancelled"])
        with patch("workspace_store.shutil.which", return_value=None):
            self.assertFalse(pick_document_path("open", None, self.root)["available"])


if __name__ == "__main__":
    unittest.main()
