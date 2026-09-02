from __future__ import annotations

import json
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

    def test_the_embedded_lane_is_the_same_engine_with_the_file_surfaces_removed(self) -> None:
        """An IDE host must reach tldraw through the same seams the app does.

        This is the boundary the plugin is most likely to break, because the
        cheap way to put a canvas in a webview is to write a second, smaller
        one. These assertions say: the embedded lane composes the *same* Block
        shape, tool, bindings, overlays and toolbar overrides through tldraw's
        public props, and the only thing it drops is the chrome that answers
        "which file am I in" — which the IDE already answers.
        """

        app = (PROJECT_ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("import { EmbeddedCanvas, isEmbedded } from './embed'", app)
        self.assertIn("if (isEmbedded()) {", app)
        # The host decides before the workspace app can mount, so an embedded
        # canvas never starts a local-workspace session it has to tear down.
        self.assertLess(app.index("if (isEmbedded())"), app.index("if (profile !== 'product')"))

        embedded = (PROJECT_ROOT / "src" / "embed" / "EmbeddedCanvas.tsx").read_text(encoding="utf-8")
        self.assertIn("<Tldraw", embedded)
        self.assertIn("components={EMBEDDED_COMPONENTS}", embedded)
        self.assertIn("shapeUtils={EMBEDDED_SHAPE_UTILS}", embedded)
        self.assertIn("bindingUtils={EMBEDDED_BINDING_UTILS}", embedded)
        self.assertIn("overlayUtils={EMBEDDED_OVERLAY_UTILS}", embedded)
        self.assertIn("overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}", embedded)
        self.assertIn("tools={EMBEDDED_TOOLS}", embedded)
        self.assertIn("BlockShapeUtil,", embedded)
        self.assertIn("...blockConnectionShapeUtils,", embedded)
        self.assertIn("Toolbar: SystemSketchFigmaToolbar", embedded)
        self.assertIn("ContextMenu: BlockContextMenu", embedded)
        self.assertIn("InFrontOfTheCanvas: SystemSketchSurfaceHost", embedded)
        # The IDE owns files; the canvas must not grow a second file manager.
        self.assertIn("MainMenu: null", embedded)
        self.assertIn("MenuPanel: null", embedded)
        self.assertIn("SharePanel: null", embedded)
        self.assertNotIn("SystemSketchWorkspaceProvider", embedded)
        self.assertNotIn("useLocalWorkspace", embedded)
        self.assertNotIn("workspaceClient", embedded)
        # A released build must not carry a browser-local persistence key that
        # would quietly compete with the file the host opened.
        self.assertNotIn("persistenceKey", embedded)

    def test_the_host_bridge_stays_the_only_thing_an_extension_imports(self) -> None:
        """A host runs in Node and bundles separately, so anything it reaches
        into becomes a second build of that code. One narrow module is the
        whole contract, and it must stay free of React, tldraw and the DOM."""

        extension = (
            PROJECT_ROOT / "vscode-systemsketch" / "src" / "extension.ts"
        ).read_text(encoding="utf-8")
        app_imports = [
            line for line in extension.splitlines()
            if "../../src/" in line
        ]
        self.assertTrue(app_imports, "the extension no longer shares the app's format rules")
        for line in app_imports:
            self.assertIn("../../src/embed/sharedWithHost", line)

        # The chain, not just its head: `sketchDocument.ts` delegates the
        # envelope and the suffix rules to the workspace lane rather than
        # restating them, so those modules are inside the host's bundle too.
        reachable = [
            PROJECT_ROOT / "src" / "embed" / "sharedWithHost.ts",
            PROJECT_ROOT / "src" / "embed" / "sketchDocument.ts",
            PROJECT_ROOT / "src" / "embed" / "embedProtocol.ts",
            PROJECT_ROOT / "src" / "workspace" / "systemSketchFile.ts",
            PROJECT_ROOT / "src" / "workspace" / "workspaceModel.ts",
        ]
        for path in reachable:
            source = path.read_text(encoding="utf-8")
            with self.subTest(module=path.name):
                self.assertNotIn("from 'react'", source)
                self.assertNotIn("from 'tldraw'", source)
                self.assertNotIn("import '", source)

    def test_the_embed_lane_does_not_keep_a_second_copy_of_the_envelope(self) -> None:
        """One codec, or the two ends agree only by coincidence.

        Both lanes write `.systemsketch` files — the workspace through the
        Python host, an IDE through its own editor. A second implementation of
        the envelope would not fail loudly when it drifted; it would write
        files the other lane quietly mis-reads.
        """

        embed = (PROJECT_ROOT / "src" / "embed" / "sketchDocument.ts").read_text(encoding="utf-8")
        self.assertIn("from '../workspace/systemSketchFile'", embed)
        self.assertIn("from '../workspace/workspaceModel'", embed)
        for restated in ("JSON.stringify({", "typeName === 'shape'", "DOCUMENT_SUFFIXES = ["):
            self.assertNotIn(restated, embed, "the embed lane restated the envelope")

    def test_the_extension_ships_a_build_of_the_app_rather_than_its_own_canvas(self) -> None:
        """The webview is the app's own vite output, staged and stamped.

        If the extension ever bundles `src/` into a webview of its own, it has
        forked the product: two canvases, one of which nobody released.
        """

        esbuild = (
            PROJECT_ROOT / "vscode-systemsketch" / "esbuild.config.mjs"
        ).read_text(encoding="utf-8")
        self.assertIn("src/extension.ts", esbuild)
        self.assertNotIn("webview", esbuild.split("await build(")[1])

        stage = (
            PROJECT_ROOT / "vscode-systemsketch" / "scripts" / "stage_app.mjs"
        ).read_text(encoding="utf-8")
        # `--base ./` is load-bearing: a webview has no origin root for
        # vite's default absolute `/assets/...` URLs to resolve against.
        self.assertIn("'--base', './'", stage)
        self.assertIn("--require-stable", stage)
        self.assertIn("matchesStable", stage)

        manifest = json.loads(
            (PROJECT_ROOT / "vscode-systemsketch" / "package.json").read_text(encoding="utf-8")
        )
        selectors = manifest["contributes"]["customEditors"][0]["selector"]
        self.assertEqual(
            sorted(item["filenamePattern"] for item in selectors),
            ["*.systemsketch", "*.tldr"],
        )
        commands = {item["command"] for item in manifest["contributes"]["commands"]}
        # File management belongs to the IDE, so the extension contributes no
        # New / Open / Save command of its own.
        self.assertFalse({command for command in commands if command.endswith(".new")})
        self.assertIn("systemsketch.openCanvas", commands)
        self.assertEqual(manifest["scripts"]["package"].count("--require-stable"), 1)

    def test_requested_icon_is_the_repo_icon(self) -> None:
        icon = PROJECT_ROOT / "assets" / "systemsketch.png"
        self.assertTrue(icon.is_file())
        self.assertGreater(icon.stat().st_size, 10_000)


if __name__ == "__main__":
    unittest.main()
