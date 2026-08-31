from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StockBoundaryTests(unittest.TestCase):
    def test_tldraw_has_only_operational_props(self) -> None:
        source = (PROJECT_ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("<Tldraw", source)
        for forbidden in (
            "components=",
            "shapeUtils=",
            "bindingUtils=",
            "tools=",
            "overrides=",
            "onMount=",
        ):
            self.assertNotIn(forbidden, source)
        self.assertIn("persistenceKey=", source)
        self.assertIn("<UpdatePill />", source)

    def test_requested_icon_is_the_repo_icon(self) -> None:
        icon = PROJECT_ROOT / "assets" / "systemsketch.png"
        self.assertTrue(icon.is_file())
        self.assertGreater(icon.stat().st_size, 10_000)


if __name__ == "__main__":
    unittest.main()
