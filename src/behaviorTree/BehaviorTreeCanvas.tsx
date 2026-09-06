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
import { HTMLContainer, useEditor, useValue, type TLShapeId } from 'tldraw'

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
import type { BtInsertTemplate } from './btcppXml'
import { BtInsertMenu } from './ui/BtInsertMenu'
import { arrowHeadPath, edgeEndAngle, edgePathData } from './sceneSvg'
import './behavior-tree.css'

function InsertButton({ insert, active, onOpen }: { insert: BtSceneInsert; active: boolean; onOpen(insert: BtSceneInsert): void }) {
	const label = insert.kind === 'root' ? 'Add the root node' : insert.kind === 'empty' ? 'Add the first child' : 'Add a node here'
	const button = (
		<button
			type="button"
			className="BehaviorTree-insert"
			data-kind={insert.kind}
			data-persistent={insert.persistent}
			data-active={active}
			data-testid={`bt-insert-${insert.id}`}
			style={insert.persistent ? { left: insert.at.x, top: insert.at.y } : undefined}
			aria-label={label}
			title={label}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => {
				event.stopPropagation()
				onOpen(insert)
			}}
		>
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
		</button>
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
	useEffect(() => {
		if (!selected) setOpenInsert(null)
	}, [selected])
	useEffect(() => {
		setOpenInsert(null)
	}, [shape.props.xml, shape.props.projection, shape.props.orientation])

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
		setOpenInsert(null)
		if (!result.ok) setNotice(result.reason)
	}, [editor, openInsert, shape.id])

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
						return (
							<g key={group.path} className="BehaviorTree-group">
								<rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={6} className="BehaviorTree-groupFrame" />
								<rect x={rect.x} y={rect.y} width={rect.w} height={48} rx={6} className="BehaviorTree-groupHeader" />
								<rect x={rect.x + 14} y={rect.y + 15} width={18} height={18} rx={2} className="BehaviorTree-groupGlyph" />
								<text x={rect.x + 44} y={rect.y + 30} className="BehaviorTree-groupTitle">{group.title}</text>
								<path d={`M ${rect.x + rect.w - 26} ${rect.y + 21} l 5 6 l 5 -6`} className="BehaviorTree-groupChevron" />
							</g>
						)
					})}
					{edges.map((edge) => {
						const structural = edge.kind === 'control' || edge.kind === 'recovery' || edge.kind === 'retryLoop' || edge.kind === 'merge'
						return (
							<g key={edge.id} className="BehaviorTree-edge" data-kind={edge.kind} style={{ opacity: structural ? wireOpacity : 1 }}>
								<path d={edgePathData(edge)} className="BehaviorTree-wire" />
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
						return (
							<g className="BehaviorTree-start" data-testid="bt-start">
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
						<InsertButton key={insert.id} insert={insert} active={openInsert?.id === insert.id} onOpen={setOpenInsert} />
					))}
					{notice ? <div className="BehaviorTree-notice" role="status" data-testid="bt-notice">{notice}</div> : null}
					{openInsert ? (
						<BtInsertMenu
							at={openInsert.at}
							document={projection.document}
							onChoose={choose}
							onClose={() => setOpenInsert(null)}
							// WHY: a `beforePath` insert's node is always the one right
							// below it — opening downward would put the menu's own rows
							// underneath that node's real Block shape, which paints above
							// this region's overlay, stealing the click (see BtInsertMenu).
							openUpward={Boolean(openInsert.beforePath)}
						/>
					) : null}
				</div>
			</div>
		</HTMLContainer>
	)
}
