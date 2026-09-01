from __future__ import annotations

import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class StockBoundaryTests(unittest.TestCase):
    def test_tldraw_keeps_stock_engine_behind_deliberate_extension_seams(self) -> None:
        source = (PROJECT_ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        product_source = source.split("function SystemSketchCanvas", 1)[1].split(
            "function DevelopmentCanvas", 1
        )[0]
        development_source = source.split("function DevelopmentCanvas", 1)[1]

        self.assertIn("<Tldraw", product_source)
        self.assertIn("MainMenu: SystemSketchMainMenu", source)
        self.assertIn("MenuPanel: SystemSketchMenuPanel", source)
        self.assertIn("NavigationPanel: SystemSketchNavigationPanel", source)
        self.assertIn("SharePanel: SystemSketchSharePanel", source)
        self.assertIn("StylePanel: null", source)
        self.assertIn("Toolbar: SystemSketchFigmaToolbar", source)
        self.assertIn("InFrontOfTheCanvas: SystemSketchSurfaceHost", source)
        self.assertIn("components={SYSTEMSKETCH_COMPONENTS}", product_source)
        self.assertIn("shapeUtils={SYSTEMSKETCH_SHAPE_UTILS}", product_source)
        self.assertIn("bindingUtils={SYSTEMSKETCH_BINDING_UTILS}", product_source)
        self.assertIn("tools={SYSTEMSKETCH_TOOLS}", product_source)
        self.assertIn("overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}", product_source)
        self.assertIn("BlockShapeUtil", source)
        self.assertIn("BlockTool", source)
        self.assertIn("...blockConnectionShapeUtils", source)
        self.assertIn("const SYSTEMSKETCH_BINDING_UTILS = [...blockConnectionBindingUtils]", source)
        self.assertIn("registerExcalidrawPasteHandler(editor)", product_source)
        self.assertIn("enablePasteAtCursor(editor)", product_source)
        self.assertIn("enablePasteAtCursor(editor)", development_source)
        self.assertIn("const stopWorkspace = attach(editor)", product_source)
        self.assertIn("const stopBlockConnections = installBlockConnections(editor)", product_source)
        self.assertIn("const stopInstantTextEditing = installInstantTextEditing(editor)", product_source)
        self.assertIn("stopInstantTextEditing()", product_source)
        self.assertIn("stopBlockConnections()", product_source)
        self.assertIn("<SystemSketchWorkspaceProvider>", source)
        self.assertIn("<ChromeProvider>", source)
        self.assertNotIn("persistenceKey=", product_source)
        self.assertIn("persistenceKey={developmentPersistenceKey(profile)}", development_source)
        self.assertIn("if (profile !== 'product')", source)
        self.assertIn("isBlockDevelopment\n      ? installInstantTextEditing(editor)", development_source)
        self.assertNotIn("<UpdatePill", source)
        self.assertFalse((PROJECT_ROOT / "src" / "UpdatePill.tsx").exists())

        toolbar_source = (
            PROJECT_ROOT / "src" / "toolbar" / "SystemSketchToolbar.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn('title="Block"', toolbar_source)
        self.assertIn('fallbackIcon={<BlockIcon />}', toolbar_source)
        self.assertNotIn('title="Comment"', toolbar_source)

    def test_requested_icon_is_the_repo_icon(self) -> None:
        icon = PROJECT_ROOT / "assets" / "systemsketch.png"
        self.assertTrue(icon.is_file())
        self.assertGreater(icon.stat().st_size, 10_000)


if __name__ == "__main__":
    unittest.main()
