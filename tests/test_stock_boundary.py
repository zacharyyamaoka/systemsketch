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
        # Selected-text formatting stays tldraw's native Tiptap toolbar; the
        # product changes its chrome with a scoped stylesheet, never a second
        # command implementation or selection transaction.
        self.assertNotIn("RichTextToolbar:", source)
        rich_text_skin = (
            PROJECT_ROOT / "src" / "chrome" / "rich-text-toolbar.css"
        ).read_text(encoding="utf-8")
        self.assertIn(".tlui-rich-text__toolbar", rich_text_skin)
        self.assertIn("--ss-surface-inverse", rich_text_skin)
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
        self.assertIn("CodeShapeUtil", source)
        self.assertIn("CodeBlockTool", source)
        self.assertIn("TypeTool", source)
        self.assertIn("CalloutTool", source)
        self.assertIn("CalloutAddLeaderTool", source)
        self.assertIn("FloatingPortShapeUtil", source)
        self.assertIn("FloatingPortTool", source)
        self.assertIn(
            "const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, LoopTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool, BtInsertGlyphTool]", source
        )
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
        # The Loop region joins the same family slot as Block and Branch, one
        # click deeper. It must not become a top-level toolbar slot of its own.
        self.assertIn("label: 'Loop', icon: <LoopIcon />", toolbar_source)
        self.assertIn("label: 'Port', icon: <FloatingPortIcon />", toolbar_source)
        self.assertIn("label: 'Behavior Tree', icon: <BehaviorTreeIcon />", toolbar_source)
        self.assertNotIn('title="Behavior Tree"', toolbar_source)
        self.assertNotIn('title="Loop"', toolbar_source)
        # Async region is still a stock Frame gesture; its thin tool subclass
        # contributes only the semantic stamp and visible default name.
        self.assertIn("label: 'Async region', icon: <AsyncRegionIcon />", toolbar_source)
        self.assertNotIn('title="Async region"', toolbar_source)
        # Listing a tool in that submenu is not enough to make it selectable:
        # `selectSystemFamilyTool` calls `tools[id]?.onSelect(...)`, so an id
        # with no entry in tldraw's UI-tool registry is a silent no-op. Shipped
        # exactly that once — the menu showed Loop and clicking it did nothing.
        integration = (
            PROJECT_ROOT / "src" / "toolbar" / "toolbarIntegration.ts"
        ).read_text(encoding="utf-8")
        for factory in ("withBlockTool", "withBranchTool", "withLoopTool", "withAsyncRegionTool", "withBehaviorTreeTool", "withCodeTool", "withFloatingPortTool", "withCalloutTool"):
            self.assertIn(factory, integration)
        self.assertNotIn('title="Branch"', toolbar_source)
        self.assertNotIn('title="Comment"', toolbar_source)
        self.assertIn("BranchShapeUtil,", source)
        self.assertIn("BranchArmShapeUtil,", source)
        self.assertIn("LoopShapeUtil,", source)
        # The Behavior Tree is a region whose nodes are real Blocks; its own
        # shape paints only wires, rails and chips, and its control cards are a
        # helper shape — never a second canvas beside the engine.
        self.assertIn("BehaviorTreeShapeUtil,", source)
        self.assertIn("BtControlShapeUtil,", source)
        self.assertIn("const stopBehaviorTreeRegions = installBehaviorTreeRegions(editor)", product_source)
        self.assertIn("CodeShapeUtil,", source)
        self.assertIn("TypeTool,", source)
        self.assertIn(
            "const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, LoopTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool, BtInsertGlyphTool]", source
        )
        self.assertIn("const stopBranchRegions = installBranchRegions(editor)", product_source)
        self.assertIn("const stopBranchClickToEdit = installBranchClickToEdit(editor)", product_source)
        # The Branch is created from the toolbar; the right-click menu must not
        # grow an "Add > Branch region" row (the muscle memory Zach refused).
        context_menu = (PROJECT_ROOT / "src" / "blocks" / "ui" / "BlockContextMenu.tsx").read_text(encoding="utf-8")
        self.assertNotIn("Branch region", context_menu)
        self.assertNotIn("Loop region", context_menu)

    def test_the_behavior_tree_dual_drag_exception_is_scoped_and_mutually_exclusive(self) -> None:
        """A second drag system exists — deliberately, conditionally, alone.

        Zach's 2026-09-06 exception to the one-drag-engine rule: with Auto
        layout ON, a Tree region stops acting as a whiteboard and acts as a
        reactive diagram, so pressing a diagram node hands the gesture to a
        real mounted dnd-kit context; pressing anything else — whiteboard
        primitives drawn over the diagram included — stays native tldraw.
        These assertions pin the exception exactly that narrow:

          - the claim gate is the three literals (tree projection, tidy
            arrangement, node role), and the press is arbitrated by tldraw's
            OWN hit test replicated verbatim, so an arrow drawn over the
            diagram wins the point exactly as it would natively;
          - the hand-off runs through supported seams only: the select tool
            stands down via its own public cancel event, the cloned
            activation event is hidden from tldraw via markEventAsHandled,
            and the claim threshold sits strictly below tldraw's 4px drag
            threshold so translating can never engage first;
          - dnd-kit appears in exactly one module, mounted once through the
            InFrontOfTheCanvas seam both lanes already share; no sortable
            DOM mirror of the layout exists (that would be a second, staler
            copy of the projection — the forking failure mode);
          - the region installer no longer resolves drags itself: the
            reorder machinery lives with the gesture in treeDndDrag.tsx, and
            what remains is single-writer discipline (skip the gesture
            owner's shapes, settle on release).

        A future rewrite must not silently re-litigate this fork
        (single-drag-owner vs conditional-dual-drag-owner): the WHY block in
        treeDndDrag.tsx records the decision, and its durable record is
        docs/peps/0007-conditional-dual-drag-owner.md.
        """

        drag_lane = (PROJECT_ROOT / "src" / "behaviorTree" / "treeDndDrag.tsx").read_text(
            encoding="utf-8"
        )
        # The gate: Zach's scoping literals, and nothing looser — the tidy
        # arrangement, the node role, and exactly the two diagram projections
        # he authorized (tree first, process on his 2026-09-06 follow-up).
        self.assertIn("!isDndDragProjection(region.props.projection) || region.props.arrangement !== 'tidy'", drag_lane)
        self.assertIn("return projection === 'tree' || projection === 'process'", drag_lane)
        self.assertIn("meta.btRole !== 'node'", drag_lane)
        # The press is arbitrated by tldraw's own hit-test rules, replicated
        # verbatim from getHitShapeOnCanvasPointerDown — this is what keeps a
        # whiteboard primitive drawn over the diagram fully native.
        self.assertIn("hitInside: false", drag_lane)
        self.assertIn("editor.getHitTestMargin()", drag_lane)
        self.assertIn("editor.getSelectedShapeAtPoint(pagePoint)", drag_lane)
        # The hand-off uses tldraw's supported seams, never its internals.
        self.assertIn("editor.cancel()", drag_lane)
        self.assertIn("editor.markEventAsHandled(clone)", drag_lane)
        self.assertIn("export const BT_DND_CLAIM_DISTANCE_PX = 3", drag_lane)
        # The second system is real and mounted — sensors, not just math.
        self.assertIn("<DndContext", drag_lane)
        self.assertIn("PointerSensor", drag_lane)
        # The decision is recorded where it lives, and in its merge-time PEP.
        self.assertIn("docs/peps/0007-conditional-dual-drag-owner.md", drag_lane)

        # dnd-kit stays inside the one module that owns the exception; nothing
        # else in the app may import it, mount a second DndContext, or build a
        # sortable DOM mirror beside the canvas.
        offenders: list[tuple[str, str]] = []
        for path in sorted((PROJECT_ROOT / "src").rglob("*.ts*")):
            # The one mounted context, and the two PURE resolution modules
            # (Tree and its Process twin) that use dnd-kit's exported
            # collision functions without mounting anything.
            if path.name in {"treeDndDrag.tsx", "dragListReorder.ts", "processDragList.ts"}:
                continue
            source = path.read_text(encoding="utf-8")
            if "@dnd-kit" in source:
                offenders.append((str(path.relative_to(PROJECT_ROOT)), "@dnd-kit import"))
            if (
                ".test." not in path.name
                and "DndContext" in source
                and "BehaviorTreeDndDragHost" not in source
            ):
                offenders.append((str(path.relative_to(PROJECT_ROOT)), "second DndContext"))
        self.assertEqual(offenders, [])
        self.assertNotIn("from '@dnd-kit/sortable'", drag_lane)
        self.assertNotIn("<SortableContext", drag_lane)

        # Mounted once, through the InFrontOfTheCanvas seam the app already
        # owns (the embedded lane composes the same host).
        chrome = (PROJECT_ROOT / "src" / "chrome" / "SystemSketchChrome.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn("<BehaviorTreeDndDragHost />", chrome)

        # The installer no longer resolves drags: the gesture and its reorder
        # machinery moved out together, and what remains is single-writer
        # discipline for whichever system owns a given gesture.
        installer = (
            PROJECT_ROOT / "src" / "behaviorTree" / "installBehaviorTreeRegions.ts"
        ).read_text(encoding="utf-8")
        self.assertNotIn("handleAutoLayoutDrag", installer)
        self.assertNotIn("dragListReorder", installer)
        self.assertIn("skipShapeIds", installer)
        self.assertIn("nativeGlidesFor", installer)

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
        self.assertIn("BranchArmShapeUtil,", embedded)
        self.assertIn("BehaviorTreeShapeUtil,", embedded)
        self.assertIn("BtControlShapeUtil,", embedded)
        self.assertIn("PillTool,", embedded)
        self.assertIn("CodeShapeUtil,", embedded)
        self.assertIn("CodeBlockTool,", embedded)
        self.assertIn("FloatingPortShapeUtil,", embedded)
        self.assertIn("FloatingPortTool", embedded)
        self.assertIn("TypeTool,", embedded)
        self.assertIn("...SYSTEMSKETCH_ARROW_SHAPE_UTILS,", embedded)
        self.assertIn("...blockConnectionShapeUtils,", embedded)
        self.assertIn("const EMBEDDED_TOOLS = [BlockTool, BranchTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool]", embedded)
        self.assertIn("Toolbar: SystemSketchFigmaToolbar", embedded)
        self.assertIn("ContextMenu: BlockContextMenu", embedded)
        self.assertIn("InFrontOfTheCanvas: EmbeddedSystemSketchSurfaceHost", embedded)
        self.assertIn('<DepthStackNavigator placement="floating" />', embedded)
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
        self.assertIn("BranchArmShapeUtil", store_factory)
        self.assertIn("SYSTEMSKETCH_ARROW_SHAPE_UTILS", store_factory)
        self.assertIn("SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS", store_factory)
        self.assertIn("FloatingPortShapeUtil", store_factory)

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
        self.assertIn("BranchArmShapeUtil", portable_export)
        # Lowering is shared with the live Detach command through the one
        # registered-kind sweep, so export cannot grow a second, subtly
        # different custom-record conversion for any kind.
        self.assertIn("DETACHABLE_KINDS", portable_export)
        self.assertIn("runDetachSweep", portable_export)
        self.assertIn("allDetachableIds", portable_export)
        # Custom records must still be loadable in the isolated export store
        # before the sweep can lower them.
        self.assertIn("LoopShapeUtil", portable_export)
        self.assertIn("BehaviorTreeShapeUtil", portable_export)
        self.assertIn("BtControlShapeUtil", portable_export)
        self.assertIn("detachLoopToPrimitives", portable_export)
        self.assertIn("isLoopShape", portable_export)
        # A Code block is a custom CodeMirror record; the portable export must
        # lower it to stock primitives the way every other custom shape is.
        self.assertIn("CodeShapeUtil", portable_export)
        self.assertIn("detachCodeToPrimitives", portable_export)
        self.assertIn("isCodeShape", portable_export)
        self.assertIn("SYSTEMSKETCH_ROUNDED_RECT_GEO", portable_export)
        self.assertIn("portableValuePillText", portable_export)
        self.assertIn("freezeDetachedValuePill", portable_export)
        # The free semantic endpoint lowers alongside Blocks and regions; a
        # portable .tldr must never depend on the custom Port shape type.
        self.assertIn("FloatingPortShapeUtil", portable_export)

        floating_port_detachable = (
            PROJECT_ROOT / "src" / "floatingPort" / "floatingPortDetachable.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("detachFloatingPortToPrimitives", floating_port_detachable)
        self.assertIn("isFloatingPortShape", floating_port_detachable)

        # The registry is deliberately the only enumeration of detachable
        # kinds: each shape kind carries its own reduction, and every surface
        # (menu, export, composites) consumes this one list. A kind that lowers
        # outside it would be a second dispatcher growing back.
        registered_kinds = (
            PROJECT_ROOT / "src" / "detach" / "registeredKinds.ts"
        ).read_text(encoding="utf-8")
        for kind in (
            "connectionDetachable",
            "blockDetachable",
            "codeDetachable",
            "branchDetachable",
            "loopDetachable",
            "behaviorTreeDetachable",
            "floatingPortDetachable",
        ):
            self.assertIn(kind, registered_kinds)

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
