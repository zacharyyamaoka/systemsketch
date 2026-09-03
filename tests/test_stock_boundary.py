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
        self.assertIn("getShapeVisibility={getBlockShapeVisibility}", product_source)
        self.assertIn("bindingUtils={SYSTEMSKETCH_BINDING_UTILS}", product_source)
        self.assertIn("tools={SYSTEMSKETCH_TOOLS}", product_source)
        self.assertIn("overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}", product_source)
        self.assertIn("store={store}", product_source)
        self.assertIn("createSystemSketchStore", product_source)
        self.assertIn("BlockShapeUtil", source)
        self.assertIn("BlockTool", source)
        self.assertIn("PillTool", source)
        self.assertIn("const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, PillTool]", source)
        self.assertIn("...SYSTEMSKETCH_ARROW_SHAPE_UTILS", source)
        self.assertIn("...blockConnectionShapeUtils", source)
        self.assertIn("const SYSTEMSKETCH_BINDING_UTILS = [...blockConnectionBindingUtils]", source)
        self.assertIn("registerExcalidrawPasteHandler(editor)", product_source)
        self.assertIn("enablePasteAtCursor(editor)", product_source)
        self.assertIn("enablePasteAtCursor(editor)", development_source)
        self.assertIn("const stopWorkspace = attach(editor)", product_source)
        self.assertIn("const stopBlockConnections = installBlockConnections(editor)", product_source)
        self.assertIn("const stopDefinitionLinking = installDefinitionLinking(editor)", product_source)
        self.assertIn("const stopInstantTextEditing = installInstantTextEditing(editor)", product_source)
        self.assertIn("stopInstantTextEditing()", product_source)
        self.assertIn("const stopArrowClickToPlace = installArrowClickToPlace(editor)", product_source)
        self.assertIn("stopArrowClickToPlace()", product_source)
        self.assertIn("stopBlockConnections()", product_source)
        self.assertIn("stopDefinitionLinking()", product_source)
        self.assertIn("<SystemSketchWorkspaceProvider>", source)
        self.assertIn("<ChromeProvider>", source)
        self.assertNotIn("persistenceKey=", product_source)
        self.assertIn("persistenceKey={developmentPersistenceKey(profile)}", development_source)
        self.assertIn("if (profile !== 'product')", source)
        self.assertIn("isBlockDevelopment\n      ? installInstantTextEditing(editor)", development_source)
        self.assertIn("isBlockDevelopment\n      ? installDefinitionLinking(editor)", development_source)
        self.assertNotIn("<UpdatePill", source)
        self.assertFalse((PROJECT_ROOT / "src" / "UpdatePill.tsx").exists())

        toolbar_source = (
            PROJECT_ROOT / "src" / "toolbar" / "SystemSketchToolbar.tsx"
        ).read_text(encoding="utf-8")
        # Block and Branch share one slot, composed the way the stock shape
        # family is: a FamilyToolSlot with a chevron and a menu, never a second
        # toolbar. The Branch must not be a top-level slot of its own.
        self.assertIn('family="system"', toolbar_source)
        self.assertIn("label: 'Block', icon: <BlockIcon />", toolbar_source)
        self.assertIn("label: 'Branch', icon: <BranchIcon />", toolbar_source)
        self.assertNotIn('title="Branch"', toolbar_source)
        self.assertNotIn('title="Comment"', toolbar_source)
        self.assertIn("BranchShapeUtil,", source)
        self.assertIn("const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, PillTool]", source)
        self.assertIn("const stopBranchRegions = installBranchRegions(editor)", product_source)
        self.assertIn("const stopBranchClickToEdit = installBranchClickToEdit(editor)", product_source)
        # The Branch is created from the toolbar; the right-click menu must not
        # grow an "Add > Branch region" row (the muscle memory Zach refused).
        context_menu = (PROJECT_ROOT / "src" / "blocks" / "ui" / "BlockContextMenu.tsx").read_text(encoding="utf-8")
        self.assertNotIn("Branch region", context_menu)

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
        self.assertIn("getShapeVisibility={getBlockShapeVisibility}", embedded)
        self.assertIn("bindingUtils={EMBEDDED_BINDING_UTILS}", embedded)
        self.assertIn("overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}", embedded)
        self.assertIn("store={store}", embedded)
        self.assertIn("createSystemSketchStore", embedded)
        self.assertIn("tools={EMBEDDED_TOOLS}", embedded)
        self.assertIn("BlockShapeUtil,", embedded)
        self.assertIn("BranchShapeUtil,", embedded)
        self.assertIn("PillTool,", embedded)
        self.assertIn("...SYSTEMSKETCH_ARROW_SHAPE_UTILS,", embedded)
        self.assertIn("...blockConnectionShapeUtils,", embedded)
        self.assertIn("const EMBEDDED_TOOLS = [BlockTool, BranchTool, PillTool]", embedded)
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
        self.assertNotIn("installFlightRecorder", embedded)
        self.assertIn("const stopDefinitionLinking = installDefinitionLinking(editor)", embedded)
        self.assertIn("stopDefinitionLinking()", embedded)

        store_factory = (
            PROJECT_ROOT / "src" / "store" / "createSystemSketchStore.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("createTLStore({", store_factory)
        self.assertIn("records: SYSTEMSKETCH_COMMENT_RECORDS", store_factory)
        self.assertIn("BranchShapeUtil", store_factory)
        self.assertIn("SYSTEMSKETCH_ARROW_SHAPE_UTILS", store_factory)
        self.assertIn("SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS", store_factory)

        arrow_util = (
            PROJECT_ROOT / "src" / "systemSketchArrow.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn("class SystemSketchArrowShapeUtil extends ArrowShapeUtil", arrow_util)
        self.assertIn("return super.onHandleDrag(shape, info)", arrow_util)
        self.assertIn("return super.component(shape)", arrow_util)
        self.assertIn("return super.toSvg(shape, ctx)", arrow_util)

        portable_export = (
            PROJECT_ROOT / "src" / "export" / "portableTldraw.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("BranchShapeUtil", portable_export)
        self.assertIn("record.type === BRANCH_SHAPE_TYPE", portable_export)
        self.assertIn("SYSTEMSKETCH_ROUNDED_RECT_GEO", portable_export)
        self.assertIn("portableValuePillText", portable_export)
        self.assertIn("freezeDetachedValuePill", portable_export)

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

        # The durable recovery store has one checkpoint per document URI, so
        # the provider must preserve that single-canvas ownership invariant.
        self.assertIn("supportsMultipleEditorsPerDocument: false", extension)

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

    def test_obsidian_fallback_is_one_explicit_scoped_canvas_exception(self) -> None:
        """Obsidian has no webview and its resource URLs defeated the iframe spike.

        The accepted fallback may bundle the existing EmbeddedCanvas into the
        plugin document, but it may not grow another canvas or reach into any
        other app module directly. Its CSS must stay inside the plugin root,
        and its provenance must match the app staged for the VS Code host.
        """

        plugin = PROJECT_ROOT / "obsidian-systemsketch"
        manifest = json.loads((plugin / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["id"], "systemsketch-obsidian")
        self.assertTrue(manifest["isDesktopOnly"])

        deep_imports: list[tuple[str, str]] = []
        for path in sorted((plugin / "src").glob("*.ts")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if "../../src/" in line:
                    deep_imports.append((path.name, line.strip()))
        self.assertTrue(deep_imports)
        for module, line in deep_imports:
            with self.subTest(module=module, line=line):
                self.assertTrue(
                    "../../src/embed/sharedWithHost" in line
                    or "../../src/embed/EmbeddedCanvas" in line,
                    "the Obsidian fallback expanded beyond its declared embed seam",
                )

        canvas_importers = {
            module for module, line in deep_imports if "EmbeddedCanvas" in line
        }
        self.assertEqual(canvas_importers, {"embed.ts", "view.ts"})

        build = (plugin / "esbuild.config.mjs").read_text(encoding="utf-8")
        self.assertIn("same-document-fallback", build)
        self.assertIn("Obsidian getResourcePath()", build)
        self.assertIn("reference.sourceCommit !== sourceCommit", build)
        self.assertIn("prefixSelector", build)
        self.assertIn(".systemsketch-obsidian-scope", build)

        protocol = (PROJECT_ROOT / "src" / "embed" / "embedProtocol.ts").read_text(encoding="utf-8")
        canvas = (PROJECT_ROOT / "src" / "embed" / "EmbeddedCanvas.tsx").read_text(encoding="utf-8")
        self.assertIn("subscribe?(handler:", protocol)
        self.assertIn("bridge.subscribe(receive)", canvas)

    def test_requested_icon_is_the_repo_icon(self) -> None:
        icon = PROJECT_ROOT / "assets" / "systemsketch.png"
        self.assertTrue(icon.is_file())
        self.assertGreater(icon.stat().st_size, 10_000)


if __name__ == "__main__":
    unittest.main()
