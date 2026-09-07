/**
 * The region's own paint: a header band, then one SVG layer with everything
 * that is not a child shape — Start, control wires, Flowstate rails, group
 * frames, outcome chips, Blackboard access edges — and the "+" insertion
 * targets with their Add-process menu.
 *
 * Nothing in the layer is hit-tested by tldraw; the buttons take their own
 * pointer events and stop them, the way the Branch chevrons do.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { HTMLContainer, TldrawUiPopover, TldrawUiPopoverTrigger, useEditor, useValue, type TLShapeId } from 'tldraw'

import {
	BT_HEADER_H,
	BT_META_PATH,
	readBtChildMeta,
	type BehaviorTreeShape,
	type BtSceneInsert,
} from './behaviorTreeModel'
import { projectBehaviorTree, projectedEdges, rectToRegion, sceneToRegion } from './behaviorTreeProjection'
import { withLiveDragWires } from './liveDragWires'
import { btDndDragState } from './treeDndDragState'
import { insertBehaviorTreeChild, insertBehaviorTreeSiblingOf, stepOutOfBehaviorTreeSubtree } from './behaviorTreeCommands'
import type { BtDocument, BtInsertTemplate } from './btcppXml'
import { BtInsertMenu } from './ui/BtInsertMenu'
import { arrowHeadPath, edgeEndAngle, edgePathData } from './sceneSvg'
import { foldedStateAtCursor, getBtRun, paintForTree, useBtRunVersion, type BtNodePaint } from './runtime/runStore'
import './behavior-tree.css'

/** The id `editor.menus` tracks this insert's popover under — shared between
 * `InsertButton` (which registers it) and `BehaviorTreeCanvas` (which needs
 * to force-close it directly; see the WHY below). */
function insertMenuId(insert: BtSceneInsert): string {
	return `bt-insert-${insert.id}`
}

/**
 * The "+" and its Add-process menu, as one `TldrawUiPopover`: registering
 * with tldraw's own menu state gets outside-click dismissal, Escape, Tab
 * trapping and focus return for free (and puts this menu on the recorder's
 * menu lane), rather than re-deriving all of that by hand. `open` is driven
 * by the region's own single `openInsert` id, matching every other stock
 * `open={x} onOpenChange={setX}` call site (`OverflowingToolbar`, the style
 * panel's dropdown pickers) — so opening one target's menu closes any other
 * that was open.
 *
 * WHY that alone isn't enough, and `BehaviorTreeCanvas` also calls
 * `editor.menus.deleteOpenMenu(insertMenuId(...))` directly in a few places:
 * `TldrawUiPopover` computes its real `open` as `open ?? false || isOpen`,
 * where `isOpen` mirrors `editor.menus` — the OR means our own `open` prop
 * can only ever WIDEN that to true, never force it closed; the only way to
 * actually close a popover is for `editor.menus` itself to drop the id.
 * Every *stock* trigger lives in the chrome layer (`.tlui-layout`, z-index
 * 300), safely above `MenuClickCapture` (tldraw's invisible full-viewport
 * layer that appears over the canvas whenever any menu is open, z-index
 * 250) — but this "+" lives on the canvas itself, below that layer, so two
 * of tldraw's own mechanisms end up fighting our state instead of updating
 * it:
 *   - A canvas pointer-down closes menus by having `MenuClickCapture` call
 *     `editor.menus.clearOpenMenus()` directly, bypassing `onOpenChange`
 *     entirely — an outside click cleared `editor.menus` while `openInsert`
 *     (and therefore the forced-open `open` prop) stayed stuck true, so the
 *     popover never visibly closed (`insert.outside-closes`, caught live:
 *     `editor.menus.getOpenMenus()` read `[]` right after the click while
 *     the menu's DOM node was still there).
 *   - `choose()` closes the other way: clearing only `openInsert` did
 *     nothing, because `editor.menus` still listed the id and the OR kept
 *     `open` true regardless (`insert.closes-on-choose`).
 * The sync effect below closes the first gap (mirrors `editor.menus` back
 * into `openInsert`); `closeInsert` and the `onOpenChange` below close the
 * second (mirror `openInsert` closes back into `editor.menus`).
 *
 * WHY switching to a *different* "+" while one is open takes two clicks
 * (`insert.one-open-at-a-time` in tests/behavior_tree_smoke.mjs has the full
 * mechanism): `MenuClickCapture` is a full-viewport overlay tldraw mounts
 * whenever `editor.menus` is non-empty, specifically to swallow canvas
 * clicks for outside-dismissal — and because every stock popover trigger
 * lives in the chrome layer (z-index 300) while this "+" lives on the
 * canvas itself, that overlay sits above it. The first click always lands on
 * the overlay and just closes the open menu; only the second reaches the
 * real button. Zach's call (2026-09-05): leave it — "it's kind of a rare
 * gesture ... the first click, you see the menu disappear, so you get the
 * visual feedback." A cheaper fix than portaling every "+" to the chrome
 * layer would be to stop registering this popover with `editor.menus`
 * entirely and hand-roll outside-click/Escape ourselves (a handful of plain
 * listeners) — no `MenuClickCapture` mounts for a menu `editor.menus` never
 * heard of, so canvas clicks reach other buttons directly. Not done: it
 * trades away tldraw's free Tab-trapping and the recorder's menu-lane
 * tracking for a one-click convenience on an already-rare path.
 */
function InsertButton({ insert, active, document, onOpenChange, onChoose }: {
	insert: BtSceneInsert
	active: boolean
	document: BtDocument
	onOpenChange(open: boolean): void
	onChoose(template: BtInsertTemplate): void
}) {
	const label = insert.kind === 'root' ? 'Add the root node' : insert.kind === 'empty' ? 'Add the first child' : 'Add a node here'
	const button = (
		<TldrawUiPopover id={insertMenuId(insert)} open={active} onOpenChange={onOpenChange}>
			<TldrawUiPopoverTrigger>
				<button
					type="button"
					className="BehaviorTree-insert"
					data-kind={insert.kind}
					data-persistent={insert.persistent}
					data-active={active}
					aria-pressed={active}
					data-testid={`bt-insert-${insert.id}`}
					style={insert.persistent ? { left: insert.at.x, top: insert.at.y } : undefined}
					aria-label={label}
					title={label}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
				</button>
			</TldrawUiPopoverTrigger>
			{/* WHY: a `beforePath` insert's node is always the one right below
			    it — opening downward would drop the menu over that node; the
			    popover opens upward there instead (see BtInsertMenu). */}
			<BtInsertMenu document={document} onChoose={onChoose} openUpward={Boolean(insert.beforePath)} />
		</TldrawUiPopover>
	)
	// Persistent targets (a sequence's terminal "+", Tree view's always-shown
	// ones) render bare — they are always visible, so there is nothing to
	// reveal on approach. A non-persistent one (Process view's interior "+")
	// rides inside a padded, otherwise-invisible zone: hovering NEAR it, not
	// only its own 28px box, is what reveals it — Flowstate's own feel, per
	// Zach's screenshot note ("the other ones just appear when you hover near
	// them"). The zone has no click handler and never stops propagation, so a
	// click on its padding still reaches tldraw's own geometry-based hit test
	// exactly as a plain background pixel would.
	if (insert.persistent) return button
	return (
		<div className="BehaviorTree-insertZone" style={{ left: insert.at.x, top: insert.at.y }}>
			{button}
		</div>
	)
}

export function BehaviorTreeCanvas({ shape }: { shape: BehaviorTreeShape }) {
	const editor = useEditor()
	const projection = useMemo(() => projectBehaviorTree(shape.props), [shape.props])
	const selected = useValue('bt region selected', () => {
		const ids = editor.getSelectedShapeIds()
		if (ids.includes(shape.id)) return true
		return ids.some((id) => editor.getShape(id)?.parentId === shape.id)
	}, [editor, shape.id])
	const [openInsert, setOpenInsert] = useState<BtSceneInsert | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(null), 3200)
		return () => window.clearTimeout(timer)
	}, [notice])
	// Force-close an insert's popover from our own side: clears `openInsert`
	// (so the forced-open half of `open={active}` drops away) AND tells
	// `editor.menus` directly, since that's the only thing that can actually
	// close it — see the WHY on `InsertButton` above.
	const closeInsert = useCallback((insert: BtSceneInsert | null) => {
		setOpenInsert(null)
		if (insert) editor.menus.deleteOpenMenu(insertMenuId(insert))
	}, [editor])
	useEffect(() => {
		if (!selected) closeInsert(openInsert)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected])
	useEffect(() => {
		closeInsert(openInsert)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [shape.props.xml, shape.props.projection, shape.props.orientation])
	// Mirror `editor.menus` back into `openInsert` for the direction
	// `closeInsert` doesn't cover: `MenuClickCapture`'s canvas-click-closes
	// path drops the id from `editor.menus` directly, without ever touching
	// our state.
	const openInsertIsRegistered = useValue(
		'bt insert menu registered',
		() => (openInsert ? editor.menus.isMenuOpen(insertMenuId(openInsert)) : true),
		[editor, openInsert],
	)
	useEffect(() => {
		if (openInsert && !openInsertIsRegistered) setOpenInsert(null)
	}, [openInsert, openInsertIsRegistered])

	// The node a live drag is moving inside THIS region right now, with its
	// live rect — null the rest of the time, so the value only changes (and
	// only re-renders this region) while a drag is actually in flight. Two
	// drags qualify: a claimed dnd-kit reorder (`treeDndDrag.tsx`, the normal
	// case in tidy Tree view — read from its editor-scoped atom) and tldraw's
	// own `select.translating` (still reachable for the gestures the dnd lane
	// leaves native). Scoped to Tree view with Auto layout on: that is the
	// one mode where a drag's position writes are NOT flowing through the
	// region's own props every frame (free arrangement records offsets per
	// frame, so its wires already track), which is exactly the
	// wire-lags-then-jumps bug from Zach's 2026-09-05 recordings — see
	// `liveDragWires.ts` for the rule.
	const liveDrag = useValue('bt live dragged node', () => {
		if (shape.props.projection !== 'tree' || shape.props.arrangement !== 'tidy') return null
		const dndDrag = btDndDragState.get(editor)
		let draggedId: TLShapeId | null = null
		if (dndDrag) {
			if (dndDrag.regionId !== shape.id) return null
			draggedId = dndDrag.shapeId
		} else {
			if (!editor.isIn('select.translating')) return null
			const ids = editor.getSelectedShapeIds()
			if (ids.length !== 1) return null
			draggedId = ids[0]
		}
		const dragged = editor.getShape(draggedId)
		if (!dragged || dragged.parentId !== shape.id) return null
		const meta = readBtChildMeta(dragged)
		if (!meta || meta.btRole !== 'node') return null
		const { w, h } = dragged.props as { w?: number; h?: number }
		if (typeof w !== 'number' || typeof h !== 'number') return null
		return { path: meta[BT_META_PATH], rect: { x: dragged.x, y: dragged.y, w, h } }
	}, [editor, shape.id, shape.props.projection, shape.props.arrangement])

	const edges = useMemo(() => {
		const projected = projectedEdges(projection)
		if (!liveDrag) return projected
		return withLiveDragWires(projected, {
			draggedPath: liveDrag.path,
			draggedRect: liveDrag.rect,
			nodeRects: projection.nodeRects,
			startRect: projection.scene.start ? rectToRegion(projection, projection.scene.start) : null,
			orientation: shape.props.orientation,
			edgeStyle: shape.props.edgeStyle,
		})
	}, [projection, liveDrag, shape.props.orientation, shape.props.edgeStyle])
	const inserts = useMemo(() => projection.scene.inserts.map((insert) => ({ ...insert, at: sceneToRegion(projection, insert.at) })), [projection])
	const wireOpacity = shape.props.dataLens === 'none' ? 1 : shape.props.controlWireOpacity

	// Run-mode paint on the connective tissue this component owns: wires wear
	// the status of the node they lead to (Groot2's rule — the RUNNING chain
	// marches from Start to the ticking node), group headers aggregate their
	// own node's status (Flowstate: lavender header while running, mint header
	// + pale-green surface wash on success), Start goes hot while the root
	// runs. Node-card fills live in `runtime/BtRunOverlay.tsx` because child
	// shapes render above this layer.
	useBtRunVersion()
	const run = getBtRun(shape.id)
	const runPaint: Map<string, BtNodePaint> | null = useMemo(() => {
		if (!run || run.cursor.index < 0) return null
		return paintForTree(run, foldedStateAtCursor(run), shape.props.treeId || run.treeId)
	}, [run, run?.cursor.index, run?.cursor.tick, run?.log.length, run?.phase, shape.props.treeId])
	const statusOf = (path: string | undefined | null) => (path ? runPaint?.get(path)?.status ?? null : null)

	const choose = useCallback((template: BtInsertTemplate) => {
		if (!openInsert) return
		// A recovery-lane terminus carries `afterPath`, and the gap above a
		// recovery arm's own first node (or above the root sequence's first
		// child) carries `beforePath` — either way it isn't a plain
		// parentPath/index slot, see `BtSceneInsert`, because growing it may
		// need to wrap a bare leaf in a Sequence first.
		const result = openInsert.afterPath
			? insertBehaviorTreeSiblingOf(editor, shape.id, openInsert.afterPath, true, template)
			: openInsert.beforePath
				? insertBehaviorTreeSiblingOf(editor, shape.id, openInsert.beforePath, false, template)
				: insertBehaviorTreeChild(editor, shape.id, openInsert.parentPath, openInsert.index, template)
		closeInsert(openInsert)
		if (!result.ok) setNotice(result.reason)
	}, [editor, openInsert, shape.id, closeInsert])

	const errors = projection.document.diagnostics.filter((entry) => entry.severity === 'error').length
	const nodeCount = projection.tree?.nodes.length ?? 0

	return (
		<HTMLContainer>
			<div
				className="systemsketch-behavior-tree"
				data-projection={shape.props.projection}
				data-orientation={shape.props.orientation}
				data-lens={shape.props.dataLens}
				data-selected={selected}
				data-insert-visibility={shape.props.insertVisibility}
				data-run-phase={run?.phase ?? undefined}
				data-testid={`bt-region-${shape.id}`}
				style={{ width: shape.props.w, height: shape.props.h }}
			>
				<div className="BehaviorTree-header" style={{ height: BT_HEADER_H }}>
					<span className="BehaviorTree-headerGlyph" aria-hidden="true">
						<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3v5M12 8l-6 5M12 8l6 5M6 13v3a3 3 0 0 0 3 3h1M18 13v3a3 3 0 0 1-3 3h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
					</span>
					<span className="BehaviorTree-title" data-testid="bt-title">{shape.props.title || projection.tree?.id || 'Behavior Tree'}</span>
					{shape.props.treeStack.length > 0 ? (
						// Item 3's breadcrumb: this region is currently showing a Sub
						// Tree's own definition rather than the tree that called it.
						// "Step out" reverses exactly one `stepIntoBehaviorTreeSubtree`.
						<button
							type="button"
							className="BehaviorTree-stepOut"
							data-testid="bt-step-out-breadcrumb"
							title="Step out to the tree that called this Sub Tree"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => {
								event.stopPropagation()
								stepOutOfBehaviorTreeSubtree(editor, shape.id)
							}}
						>
							← Step out of {projection.tree?.id ?? shape.props.treeId}
						</button>
					) : null}
					<span className="BehaviorTree-subtitle">
						{projection.tree ? `${projection.tree.id} · ${nodeCount} node${nodeCount === 1 ? '' : 's'}` : 'no tree'}
						{errors > 0 ? ` · ${errors} error${errors === 1 ? '' : 's'}` : ''}
					</span>
				</div>
				<svg className="BehaviorTree-layer" width={shape.props.w} height={shape.props.h} aria-hidden="true">
					{projection.scene.groups.map((group) => {
						const rect = rectToRegion(projection, group.rect)
						const status = statusOf(group.path)
						return (
							<g key={group.path} className="BehaviorTree-group" data-run-status={status ?? undefined}>
								<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={6} className="BehaviorTree-groupFrame" />
								<rect x={rect.x} y={rect.y} width={rect.w} height={48} rx={6} className="BehaviorTree-groupHeader" />
								<rect x={rect.x + 14} y={rect.y + 15} width={18} height={18} rx={2} className="BehaviorTree-groupGlyph" />
								<g className="BehaviorTree-groupSpin"><circle cx={rect.x + 23} cy={rect.y + 24} r={8} /></g>
								<text x={rect.x + 44} y={rect.y + 30} className="BehaviorTree-groupTitle">{group.title}</text>
								<path d={`M ${rect.x + rect.w - 26} ${rect.y + 21} l 5 6 l 5 -6`} className="BehaviorTree-groupChevron" />
							</g>
						)
					})}
					{edges.map((edge) => {
						const structural = edge.kind === 'control' || edge.kind === 'recovery' || edge.kind === 'retryLoop' || edge.kind === 'merge'
						const status = structural ? statusOf(edge.to) : null
						const painted = status === 'running' || status === 'success' || status === 'failure' ? status : null
						return (
							<g key={edge.id} className="BehaviorTree-edge" data-kind={edge.kind} style={{ opacity: structural ? wireOpacity : 1 }}>
								<path d={edgePathData(edge)} className="BehaviorTree-wire" />
								{painted ? <path d={edgePathData(edge)} className="BehaviorTree-statusWire" data-s={painted} /> : null}
								{edge.arrowEnd ? <path d={arrowHeadPath(edge.points[edge.points.length - 1], edgeEndAngle(edge))} className="BehaviorTree-arrowHead" /> : null}
							</g>
						)
					})}
					{projection.scene.rails.map((rail) => {
						const from = sceneToRegion(projection, rail.from)
						const to = sceneToRegion(projection, rail.to)
						const horizontal = Math.abs(from.y - to.y) < 0.5
						const offset = horizontal ? { x: 0, y: 3 } : { x: 3, y: 0 }
						return (
							<g key={rail.id} className="BehaviorTree-rail" data-kind={rail.kind} style={{ opacity: wireOpacity }}>
								<line x1={from.x - offset.x} y1={from.y - offset.y} x2={to.x - offset.x} y2={to.y - offset.y} />
								<line x1={from.x + offset.x} y1={from.y + offset.y} x2={to.x + offset.x} y2={to.y + offset.y} />
							</g>
						)
					})}
					{projection.scene.chips.map((chip) => {
						const rect = rectToRegion(projection, chip.rect)
						return (
							<g key={chip.id} className="BehaviorTree-chip" data-kind={chip.kind}>
								<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={chip.kind === 'fail' ? 4 : 6} />
								<text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2 + 1}>{chip.text}</text>
							</g>
						)
					})}
					{projection.scene.start ? (() => {
						const rect = rectToRegion(projection, projection.scene.start)
						const rootRunning = projection.tree?.root ? statusOf(projection.tree.root.path) === 'running' : false
						return (
							<g className="BehaviorTree-start" data-hot={rootRunning || undefined} data-testid="bt-start">
								<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={rect.h / 2} />
								<text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2 + 1}>Start</text>
							</g>
						)
					})() : null}
					{/* The drag-model debug overlay does NOT paint here: the
					    projected nodes are real shapes that tldraw renders over
					    this SVG, so it mounts through InFrontOfTheCanvas
					    instead — see BtDragModelSurface.tsx. */}
				</svg>
				<div className="BehaviorTree-controls" style={{ '--bt-header': `${BT_HEADER_H}px` } as CSSProperties}>
					{inserts.map((insert) => (
						<InsertButton
							key={insert.id}
							insert={insert}
							active={openInsert?.id === insert.id}
							document={projection.document}
							onOpenChange={(open) => {
								if (open) {
									// Defensive: force any other insert's `editor.menus` entry
									// closed too, so a stray leftover registration can never
									// hold two popovers open at once (see the WHY above).
									if (openInsert && openInsert.id !== insert.id) editor.menus.deleteOpenMenu(insertMenuId(openInsert))
									setOpenInsert(insert)
								} else {
									closeInsert(insert)
								}
							}}
							onChoose={choose}
						/>
					))}
					{notice ? <div className="BehaviorTree-notice" role="status" data-testid="bt-notice">{notice}</div> : null}
				</div>
			</div>
		</HTMLContainer>
	)
}
