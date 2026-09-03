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
    SYSTEMSKETCH_FORMAT_VERSION,
    WorkspaceConflictError,
    WorkspaceFormatError,
    WorkspacePathError,
    create_directory,
    default_document_path,
    document_digest,
    list_documents,
    load_document,
    rename_document,
    save_document,
    stat_document,
    trash_document,
)


def tldraw_source(marker: int = 1) -> str:
    """A plain tldraw file — what a `.tldr` document holds."""
    return json.dumps(
        {
            "tldrawFileFormatVersion": 1,
            "schema": {"schemaVersion": 2, "sequences": {}},
            "records": [{"id": f"shape:{marker}", "typeName": "shape", "type": "block"}],
        }
    )


def document_source(marker: int = 1, *, format_version: int = SYSTEMSKETCH_FORMAT_VERSION) -> str:
    """The same file wrapped as `.systemsketch`, envelope first."""
    document = {
        "systemSketch": {
            "formatVersion": format_version,
            "application": "SystemSketch",
            "shapes": {"block": 1},
            "bindings": {},
        }
    }
    document.update(json.loads(tldraw_source(marker)))
    return json.dumps(document)


class WorkspaceStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.path = self.root / "SystemSketch" / "Architecture.systemsketch"
        self.legacy = self.root / "SystemSketch" / "Legacy.tldr"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_atomic_save_read_stat_and_listing_carry_both_document_types(self) -> None:
        saved = save_document(str(self.path), document_source(), self.root)
        save_document(str(self.legacy), tldraw_source(), self.root)
        loaded = load_document(str(self.path), self.root)
        stat = stat_document(str(self.path), self.root)
        listing = list_documents(None, self.root)

        self.assertEqual(saved["digest"], loaded["digest"])
        self.assertEqual(stat["size"], saved["size"])
        self.assertEqual(
            [(item["title"], item["kind"]) for item in listing["documents"]],
            [("Architecture", "systemsketch"), ("Legacy", "tldraw")],
        )
        self.assertEqual(
            listing["defaultDocument"],
            str(self.root / "SystemSketch" / "Untitled.systemsketch"),
        )
        self.assertTrue(self.path.read_text(encoding="utf-8").endswith("\n"))

    def test_the_suffix_decides_the_encoding_in_both_directions(self) -> None:
        """A `.systemsketch` must carry the envelope; a `.tldr` must not."""
        with self.assertRaisesRegex(WorkspaceFormatError, "must carry a systemSketch envelope"):
            save_document(str(self.path), tldraw_source(), self.root)
        with self.assertRaisesRegex(WorkspaceFormatError, "must stay a plain tldraw file"):
            save_document(str(self.legacy), document_source(), self.root)

        # Reading is the lenient direction: a hand-renamed file still opens.
        renamed_by_hand = self.root / "SystemSketch" / "ByHand.systemsketch"
        renamed_by_hand.parent.mkdir(parents=True, exist_ok=True)
        renamed_by_hand.write_text(tldraw_source(), encoding="utf-8")
        self.assertEqual(load_document(str(renamed_by_hand), self.root)["title"], "ByHand")

    def test_a_legacy_pyblocks_systemsketch_is_readable_but_never_writable(self) -> None:
        legacy = self.root / "SystemSketch" / "Golden.systemsketch"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        source = json.dumps({
            "version": 1,
            "nodes": [],
            "edges": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "metadata": {"pyblocks.golden": {"version": 1}},
        })
        legacy.write_text(source, encoding="utf-8")

        self.assertEqual(load_document(str(legacy), self.root)["source"], source)
        with self.assertRaisesRegex(WorkspaceFormatError, "tldrawFileFormatVersion"):
            save_document(str(legacy), source, self.root, base_digest=document_digest(source))

    def test_a_document_from_a_newer_systemsketch_loads_exactly_but_cannot_be_overwritten(self) -> None:
        future = self.root / "SystemSketch" / "Future.systemsketch"
        future.parent.mkdir(parents=True, exist_ok=True)
        source = document_source(format_version=SYSTEMSKETCH_FORMAT_VERSION + 1)
        future.write_text(source, encoding="utf-8")
        loaded = load_document(str(future), self.root)
        self.assertEqual(loaded["source"], source)
        with self.assertRaisesRegex(WorkspaceFormatError, "written by a newer SystemSketch"):
            save_document(
                str(future), source, self.root, base_digest=loaded["digest"]
            )

    def test_create_directory_is_visible_nested_and_preserves_unicode(self) -> None:
        parent = self.root / "SystemSketch"
        parent.mkdir()
        created = create_directory(str(parent), "  Architecture Ω  ", self.root)
        nested = create_directory(created["path"], "Drafts", self.root)

        self.assertEqual(created, {
            "name": "Architecture Ω",
            "path": str(parent / "Architecture Ω"),
        })
        self.assertEqual(nested["path"], str(parent / "Architecture Ω" / "Drafts"))
        self.assertIn(created, list_documents(str(parent), self.root)["directories"])

    def test_create_directory_rejects_invisible_unsafe_and_colliding_names(self) -> None:
        parent = self.root / "SystemSketch"
        parent.mkdir()
        for name in ("", " ", ".", "..", ".hidden", "a/b", "a\\b", "bad\nname"):
            with self.subTest(name=repr(name)), self.assertRaises(WorkspacePathError):
                create_directory(str(parent), name, self.root)

        occupied_file = parent / "Taken"
        occupied_file.write_text("occupied", encoding="utf-8")
        with self.assertRaisesRegex(WorkspacePathError, "already exists"):
            create_directory(str(parent), "Taken", self.root)
        occupied_file.unlink()
        (parent / "Taken").mkdir()
        with self.assertRaisesRegex(WorkspacePathError, "already exists"):
            create_directory(str(parent), "Taken", self.root)

    def test_create_directory_requires_a_real_confined_parent(self) -> None:
        missing = self.root / "missing"
        with self.assertRaisesRegex(WorkspacePathError, "does not exist"):
            create_directory(str(missing), "Folder", self.root)
        file_parent = self.root / "file"
        file_parent.write_text("not a folder", encoding="utf-8")
        with self.assertRaisesRegex(WorkspacePathError, "not a directory"):
            create_directory(str(file_parent), "Folder", self.root)
        with self.assertRaisesRegex(WorkspacePathError, "stay under"):
            create_directory(str(self.root.parent), "Outside", self.root)

    def test_zero_byte_documents_open_blank_and_save_their_first_real_revision(self) -> None:
        """Standalone matches the IDE's intentional zero-byte new-file state."""
        for path, first_revision in (
            (self.path, document_source()),
            (self.legacy, tldraw_source()),
        ):
            with self.subTest(suffix=path.suffix):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"")

                loaded = load_document(str(path), self.root)
                self.assertEqual(loaded["source"], "")
                self.assertEqual(loaded["size"], 0)
                self.assertEqual(loaded["digest"], document_digest(""))

                saved = save_document(
                    str(path), first_revision, self.root, base_digest=loaded["digest"]
                )
                self.assertGreater(saved["size"], 0)
                self.assertEqual(load_document(str(path), self.root)["digest"], saved["digest"])

    def test_an_existing_legacy_untitled_board_stays_the_default_document(self) -> None:
        legacy_default = self.root / "SystemSketch" / "Untitled.tldr"
        legacy_default.parent.mkdir(parents=True, exist_ok=True)
        legacy_default.write_text(tldraw_source(), encoding="utf-8")
        self.assertEqual(default_document_path(self.root), legacy_default)

        current_default = self.root / "SystemSketch" / "Untitled.systemsketch"
        current_default.write_text(document_source(), encoding="utf-8")
        self.assertEqual(default_document_path(self.root), current_default)

    def test_paths_are_confined_to_the_configured_root(self) -> None:
        outside = self.root.parent / "outside.systemsketch"
        with self.assertRaisesRegex(WorkspacePathError, "stay under"):
            save_document(str(outside), document_source(), self.root)
        with self.assertRaisesRegex(WorkspacePathError, "end with .systemsketch or .tldr"):
            save_document(str(self.root / "board.json"), document_source(), self.root)

    def test_an_explicit_additional_root_allows_a_worktree_board_only(self) -> None:
        with (
            tempfile.TemporaryDirectory() as development_directory,
            tempfile.TemporaryDirectory() as outside_directory,
        ):
            development_root = Path(development_directory)
            review = development_root / "sketches" / "review" / "Feature.systemsketch"
            saved = save_document(
                str(review),
                document_source(),
                self.root,
                additional_roots=(development_root,),
            )
            loaded = load_document(
                str(review),
                self.root,
                additional_roots=(development_root,),
            )

            self.assertEqual(loaded["digest"], saved["digest"])
            self.assertEqual(
                stat_document(
                    str(review),
                    self.root,
                    additional_roots=(development_root,),
                )["size"],
                saved["size"],
            )
            self.assertEqual(list_documents(None, self.root)["root"], str(self.root))
            # Extra roots authorize a direct document, not a second browser.
            # Save As and New Folder must remain rooted in the user's primary
            # workspace even while a review fixture is open from a worktree.
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                list_documents(str(review.parent), self.root)
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                create_directory(str(review.parent), "Escaped", self.root)
            self.assertFalse((review.parent / "Escaped").exists())
            with self.assertRaisesRegex(WorkspacePathError, "stay under an allowed root"):
                load_document(
                    str(Path(outside_directory) / "Other.systemsketch"),
                    self.root,
                    additional_roots=(development_root,),
                )

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

    def test_rename_is_no_clobber_revision_checked_and_type_preserving(self) -> None:
        first = save_document(str(self.path), document_source(1), self.root)
        destination = self.path.with_name("Renamed.systemsketch")
        renamed = rename_document(
            str(self.path), str(destination), self.root, base_digest=first["digest"]
        )
        self.assertFalse(self.path.exists())
        self.assertEqual(renamed["path"], str(destination))

        occupied = self.path.with_name("Occupied.systemsketch")
        save_document(str(occupied), document_source(2), self.root)
        with self.assertRaisesRegex(WorkspaceConflictError, "already exists"):
            rename_document(
                str(destination), str(occupied), self.root, base_digest=renamed["digest"]
            )

        # A rename that changed the extension would relabel the bytes without
        # rewriting them, so it is refused rather than silently corrupting.
        with self.assertRaisesRegex(WorkspacePathError, "cannot change a document's type"):
            rename_document(
                str(destination),
                str(destination.with_name("Renamed.tldr")),
                self.root,
                base_digest=renamed["digest"],
            )

    def test_delete_moves_the_exact_loaded_revision_to_desktop_trash(self) -> None:
        saved = save_document(str(self.path), document_source(), self.root)
        completed = type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()
        with patch("workspace_store.shutil.which", return_value="/usr/bin/gio"), patch(
            "workspace_store.subprocess.run", return_value=completed
        ) as run:
            trash_document(str(self.path), self.root, base_digest=saved["digest"])
        self.assertEqual(run.call_args.args[0], ["/usr/bin/gio", "trash", str(self.path)])

    def test_the_host_never_shells_out_to_a_desktop_file_chooser(self) -> None:
        """The in-app browser is the only chooser.

        A GUI subprocess run inside an HTTP handler makes a second application
        a hard dependency of File > Open: when zenity wedged, the request never
        returned and the whole Open path wedged with it.
        """
        scripts = PROJECT_ROOT / "scripts"
        for module in sorted(scripts.glob("*.py")):
            source = module.read_text(encoding="utf-8")
            for chooser in ("zenity", "kdialog", "yad", "--file-selection"):
                self.assertNotIn(chooser, source, f"{module.name} reintroduced {chooser}")

    def test_no_workspace_endpoint_spawns_a_chooser(self) -> None:
        server = (PROJECT_ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
        self.assertNotIn("/api/workspace/pick", server)
        self.assertIn("/api/workspace/list", server)

if __name__ == "__main__":
    unittest.main()
