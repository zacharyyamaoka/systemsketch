from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]



def _without_comments(source: str) -> str:
    """TypeScript source with block and line comments removed.

    Only used for presence checks, so it does not need to be a parser: it must
    merely stop a module's own explanation of what it refuses from counting as
    the thing itself.
    """
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", source)


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
            "const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, LoopTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool, BtInsertGlyphTool, CommunicationLinkTool]", source
        )
        self.assertIn("...SYSTEMSKETCH_ARROW_SHAPE_UTILS", source)
        self.assertIn("...blockConnectionShapeUtils", source)
        self.assertIn("const SYSTEMSKETCH_BINDING_UTILS = [...blockConnectionBindingUtils]", source)
        self.assertIn("registerExcalidrawPasteHandler(editor)", product_source)
        # The product lane's paste-at-cursor is user-settable (Settings →
        # Canvas → Pointer), so it goes through installSystemSketchGestures
        # rather than the unconditional call the development lane still uses.
        self.assertIn("installSystemSketchGestures(editor)", product_source)
        self.assertIn("enablePasteAtCursor(editor)", development_source)
        self.assertIn("const stopWorkspace = attach(editor)", product_source)
        self.assertIn("const stopBlockConnections = installBlockConnections(editor)", product_source)
        self.assertIn("const stopDefinitionLinking = installDefinitionLinking(editor)", product_source)
        self.assertIn("const stopBlockMemberStack = installBlockMemberStack(editor)", product_source)
        self.assertIn("stopBlockMemberStack()", product_source)
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

        # The Menu lab is a real Settings section, not a URL a person has to
        # know. It renders the SAME board the standalone `?menu-lab` route
        # does — a second implementation living in Settings is exactly the
        # drift the shared registry exists to prevent.
        settings_source = (
            PROJECT_ROOT / "src" / "settings" / "InterfaceSettings.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn("id: 'menu-lab',", settings_source)
        self.assertIn("label: 'Menu lab',", settings_source)
        self.assertIn("'shortcuts', 'menu-lab', 'pill-lab']", settings_source)
        self.assertIn(
            "import { MenuLabPanel } from '../prototypes/menuLab/ContextualMenuLab'",
            settings_source,
        )
        lab_source = (
            PROJECT_ROOT / "src" / "prototypes" / "menuLab" / "ContextualMenuLab.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn("export function MenuLabPanel", lab_source)
        self.assertIn("<MenuLabPanel standalone />", lab_source)
        # Popovers opened inside the dialog must portal into it: tldraw's
        # popover layer sits below its dialog layer.
        self.assertIn("ContainerProvider container={host ?? container}", lab_source)
        self.assertIn(".tlui-dialog__positioner", lab_source)

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
            "const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool, LoopTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool, BtInsertGlyphTool, CommunicationLinkTool]", source
        )
        self.assertIn("const stopBranchRegions = installBranchRegions(editor)", product_source)
        self.assertIn("const stopBranchClickToEdit = installBranchClickToEdit(editor)", product_source)
        # The Branch is created from the toolbar; the right-click menu must not
        # grow an "Add > Branch region" row (the muscle memory Zach refused).
        context_menu = (PROJECT_ROOT / "src" / "blocks" / "ui" / "BlockContextMenu.tsx").read_text(encoding="utf-8")
        self.assertNotIn("Branch region", context_menu)
        self.assertNotIn("Loop region", context_menu)

    def test_the_behavior_tree_dual_drag_exception_is_scoped_and_mutually_exclusive(self) -> None:
        """Two dnd-kit canvas drag owners exist, deliberately and narrowly scoped.

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

        The SECOND owner (Zach's 2026-09-06 call) is the Communication lens's
        port drag: dnd-kit moves a socket around a card's four walls, entered
        from `pointing_block_port` on tldraw's own `long_press`. It earns its
        place the way the panel lane does — by property, not by name.

        KNOWN GAP — these owners are NOT yet mutually exclusive.
        This test asserts that each owner is narrowly scoped. It does NOT
        assert that two owners cannot claim one press, because today they can.
        The defect PREDATES this file's second owner and is live on `main`
        independently of it; nothing below causes it.

        There are THREE gesture owners riding tldraw's `long_press`, not two,
        and only two of them are dnd-kit — so the dnd-kit-shaped rule above
        structurally cannot see the third:
          1. the tree lane (`treeDndDrag.tsx`, dnd-kit) — claims by preempting
             below tldraw's drag threshold, armed in the CAPTURE phase of
             pointerdown while the select tool is still `idle`;
          2. the port lane (`CommunicationPortDnd.tsx`, dnd-kit) — claims on
             `long_press`, under the Communication lens;
          3. the Dataflow reorder lane (`portInteraction.ts`
             `DraggingBlockPort`) — native tldraw `StateNode`, claims on the
             same `long_press`, under the DEFAULT lens, and asserted below to
             use no dnd-kit at all.

        WHY they collide, and why the obvious defence does not work: timing
        cannot separate them. `long_press` does not mean "has not moved" —
        tldraw clears its long-press timer only once a press crosses its own
        drag threshold (see tests/test_long_press_semantics.py), so a press
        that moves a few pixels and dwells fires `long_press` AND satisfies the
        tree lane's preempt distance. That distance is a live knob
        (`btDragTuning.claimDistancePx`) explicitly allowed to exceed the
        threshold, so no numeric relationship between the two is assertable
        either. Both orderings reach two owners:
          - move-then-dwell: the tree lane claims at its preempt distance
            without re-checking state, and because the press never crossed the
            threshold `long_press` still fires afterwards;
          - dwell-then-move: a lane takes the press on `long_press`, and the
            tree lane's armed shadow then claims the same gesture on the next
            move, calling `editor.cancel()` underneath a live drag.
        The tree/reorder pair (1 and 3) is the most reachable: it needs only
        the default lens, and Behavior Tree nodes are real Blocks whose port
        dots route into the port lane (`installConnections.ts` does not exclude
        region children).

        The property a fix must establish is select-tool STATE ownership,
        re-checked at CLAIM time and covering every state a port press can
        occupy (`pointing_block_port` AND `dragging_block_port`) — never
        timing. That constraint is recorded in
        docs/peps/0013-two-scoped-canvas-drag-owners.md; the fix itself is
        deliberately not in this merge, because it spans all three lanes and
        changes shipped Behavior Tree behaviour.

        A future rewrite must not silently re-litigate the fork this DOES
        settle (single-drag-owner vs two-scoped-canvas-owners): the WHY blocks
        in treeDndDrag.tsx and CommunicationPortDnd.tsx record the decision,
        and its durable records are
        docs/peps/0007-conditional-dual-drag-owner.md and
        docs/peps/0013-two-scoped-canvas-drag-owners.md.
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

        # dnd-kit reaches exactly two kinds of place, and nowhere else: the
        # canvas lane above, and plain React panels that no tldraw canvas
        # shares a pointer with (Zach's 2026-09-06 call — see
        # docs/peps/0009-dndkit-for-plain-react-panels.md).
        CANVAS_DND = {
            "treeDndDrag.tsx",
            "dragListReorder.ts",
            "processDragList.ts",
            # The second admitted canvas owner. It is a genuine CANVAS dnd
            # owner, not a panel one — it calls markEventAsHandled,
            # screenToPage and getPointInShapeSpace and mounts its own
            # context — so it must never be filed under PANEL_DND.
            "CommunicationPortDnd.tsx",
            # The third admitted canvas owner (Zach, 2026-09-09: "in stack mode
            # I want them to behave more like cards in a kanban row,
            # implementing using dnd kit"). A stacked Block is a reactive
            # layout, not a whiteboard frame — PEP 0007's reason, applied to
            # Block members. Asserted by property below.
            "memberStackDnd.tsx",
        }
        PANEL_DND = {"BlockInspector.tsx"}

        offenders: list[tuple[str, str]] = []
        for path in sorted((PROJECT_ROOT / "src").rglob("*.ts*")):
            # The one mounted canvas context, the two PURE resolution modules
            # (Tree and its Process twin) that use dnd-kit's exported collision
            # functions without mounting anything, and the panel surfaces.
            if path.name in CANVAS_DND | PANEL_DND:
                continue
            source = path.read_text(encoding="utf-8")
            if "@dnd-kit" in source:
                offenders.append((str(path.relative_to(PROJECT_ROOT)), "@dnd-kit import"))
            if (
                ".test." not in path.name
                and "DndContext" in source
                and "BehaviorTreeDndDragHost" not in source
                and "CommunicationPortDndHost" not in source
                and "StackMemberDndHost" not in source
            ):
                offenders.append((str(path.relative_to(PROJECT_ROOT)), "second DndContext"))
        self.assertEqual(offenders, [])
        self.assertNotIn("from '@dnd-kit/sortable'", drag_lane)
        self.assertNotIn("<SortableContext", drag_lane)

        # ---------------- the second canvas owner, by property ----------------
        # Judge the CODE, not the prose: this module explains at length which
        # dnd-kit layers it refuses, so a raw-text check would read the refusal
        # as the offence.
        port_lane_path = PROJECT_ROOT / "src" / "blocks" / "ports" / "CommunicationPortDnd.tsx"
        port_lane = _without_comments(port_lane_path.read_text(encoding="utf-8"))
        port_gate = _without_comments(
            (PROJECT_ROOT / "src" / "blocks" / "ports" / "communicationPortDrag.ts").read_text(
                encoding="utf-8"
            )
        )
        pointing_port = _without_comments(
            (PROJECT_ROOT / "src" / "blocks" / "connections" / "PointingBlockPort.ts").read_text(
                encoding="utf-8"
            )
        )
        # It is real and mounted — a sensor, not just math.
        self.assertIn("<DndContext", port_lane)
        self.assertIn("PointerSensor", port_lane)
        # The gate: it claims only through canMoveCommunicationPort, which is
        # the only place the lens is consulted, and only ever from long_press.
        self.assertIn("if (!canMoveCommunicationPort(editor, ref)) return false", port_lane)
        self.assertIn("blockLayoutLensFor(editor, ref.shapeId) !== 'communication'", port_gate)
        self.assertIn("override onLongPress", pointing_port)
        self.assertIn("beginCommunicationPortDnd(this.editor, ref)", pointing_port)
        # It refuses the sortable layer for the same reason the tree lane does:
        # a DOM mirror of a tldraw layout is a second, staler copy of it.
        for refused in ("@dnd-kit/sortable", "useSortable", "SortableContext", "arrayMove"):
            self.assertNotIn(refused, port_lane)
        # Geometry stays in PAGE space, where the layout's truth lives, rather
        # than in the screen-space DOM rects the sortable layer would measure.
        self.assertIn("blockEdgeAt(", port_lane)

        # ---------------- the third canvas owner, by property ----------------
        # The stack lane earns its place the way the first two do. What it
        # must prove is PEP 0013's property: select-tool STATE ownership,
        # re-checked at claim time — the claim fires only while tldraw is in
        # `select.pointing_shape` for that press, so a port press (which lives
        # in `pointing_block_port` / `dragging_block_port`) is never taken.
        stack_lane_path = PROJECT_ROOT / "src" / "blocks" / "memberStackDnd.tsx"
        stack_lane = _without_comments(stack_lane_path.read_text(encoding="utf-8"))
        self.assertIn("if (!editor.isIn('select.pointing_shape')) return", stack_lane)
        self.assertIn("if (!editor.isIn('select.idle')) return null", stack_lane)
        self.assertIn("if (!isStackBlock(parent) || parent.isLocked) return null", stack_lane)
        self.assertIn("export const STACK_DND_CLAIM_DISTANCE_PX = 3", stack_lane)
        self.assertIn("editor.cancel()", stack_lane)
        self.assertIn("editor.markEventAsHandled(clone)", stack_lane)
        self.assertIn("<DndContext", stack_lane)
        self.assertIn("editor.getShapeAtPoint(pagePoint, {", stack_lane)
        self.assertIn("editor.getPointInShapeSpace(parent, pagePoint)", stack_lane)
        for refused in ("@dnd-kit/sortable", "useSortable", "SortableContext", "arrayMove"):
            self.assertNotIn(refused, stack_lane)
        # Single writer: the settle pass stands down for the parent dnd-kit owns.
        stack_pass = _without_comments(
            (PROJECT_ROOT / "src" / "blocks" / "memberStack.ts").read_text(encoding="utf-8")
        )
        self.assertIn("if (memberStackDragState.get(editor)?.parentId === id) continue", stack_pass)

        # ------- the third gesture owner the dnd-kit rule cannot see --------
        # See KNOWN GAP in the docstring. The Dataflow reorder lane rides the
        # same `long_press` but is native tldraw, so the offenders sweep above
        # is blind to it by construction. Pin that it stays native: the day it
        # reaches for dnd-kit it becomes a THIRD mounted context and must be
        # admitted deliberately, like the two above.
        reorder_lane = _without_comments(
            (PROJECT_ROOT / "src" / "blocks" / "ports" / "portInteraction.ts").read_text(
                encoding="utf-8"
            )
        )
        self.assertIn("class DraggingBlockPort extends StateNode", reorder_lane)
        self.assertNotIn("@dnd-kit", reorder_lane)

        # A panel surface earns the permission by staying panel-shaped. These
        # are properties, not a name on an allow-list: a later refactor that
        # reaches for the sortable layer fails here rather than in review.
        for name in sorted(PANEL_DND):
            found = [p for p in (PROJECT_ROOT / "src").rglob(name)]
            self.assertEqual(len(found), 1, f"{name} must name exactly one module")
            # Judge the CODE, not the prose. These modules explain at length
            # which dnd-kit layers they deliberately refuse, so a check run
            # over raw text would read the refusal as the offence — and, worse,
            # a required symbol could be "found" in a comment that promises it.
            panel = _without_comments(found[0].read_text(encoding="utf-8"))

            # 1. dnd-kit may own the GESTURE (sensor + draggable handle) and
            #    nothing else. The sortable layer sorts a flat array of DOM
            #    ids; a port row's place is {row, branch, before} — a body row,
            #    a conditional arm inside it, and the heading band as row 0 —
            #    so arrayMove cannot express a legal move, and on the managed
            #    face (hidden ports shown) a DOM index disagrees with the lane
            #    outright.
            self.assertIn("useDraggable", panel)
            self.assertIn("PointerSensor", panel)
            self.assertNotIn("@dnd-kit/sortable", panel)
            self.assertNotIn("useSortable", panel)
            self.assertNotIn("SortableContext", panel.replace("`SortableContext`", ""))
            self.assertNotIn("arrayMove", panel)

            # 2. The REDUCER stays the oracle for what a release would do, so
            #    the preview cannot disagree with the commit. This is the one
            #    property the drag library must never be allowed to take over.
            self.assertIn("moveBlockPortToSectionProps(props, side", panel)
            self.assertIn("listDropTarget", panel)

            # 3. No tldraw canvas shares the pointer with this panel, which is
            #    the whole reason the canvas lane's claim/preempt/hand-off
            #    machinery is absent here and must stay absent.
            self.assertNotIn("markEventAsHandled", panel)
            self.assertNotIn("getHitShapeOnCanvasPointerDown", panel)

        # Mounted once, through the InFrontOfTheCanvas seam the app already
        # owns (the embedded lane composes the same host).
        chrome = (PROJECT_ROOT / "src" / "chrome" / "SystemSketchChrome.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn("<BehaviorTreeDndDragHost />", chrome)
        self.assertIn("<StackMemberDndHost />", chrome)

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
        self.assertIn("const EMBEDDED_TOOLS = [BlockTool, BranchTool, AsyncRegionTool, BehaviorTreeTool, CodeBlockTool, PillTool, TypeTool, FloatingPortTool, CalloutTool, CalloutAddLeaderTool, CommunicationLinkTool]", embedded)
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
        # Still tldraw's own arrow: `configure` returns a subclass of
        # ArrowShapeUtil, so the thickness override rides the published
        # display-value seam rather than a reimplemented renderer.
        self.assertIn("ArrowShapeUtil.configure({", arrow_util)
        self.assertIn("getCustomDisplayValues: (_editor, shape) => strokeWidthDisplay(shape)", arrow_util)
        self.assertIn(
            "class SystemSketchArrowShapeUtil extends ConfiguredArrowShapeUtil", arrow_util
        )
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
