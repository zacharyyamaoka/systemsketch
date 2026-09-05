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
import { HTMLContainer, TldrawUiPopover, TldrawUiPopoverTrigger, useEditor, useValue } from 'tldraw'

import {
	BT_HEADER_H,
	type BehaviorTreeShape,
	type BtSceneInsert,
} from './behaviorTreeModel'
import { projectBehaviorTree, projectedEdges, rectToRegion, sceneToRegion } from './behaviorTreeProjection'
import { insertBehaviorTreeChild } from './behaviorTreeCommands'
import type { BtDocument, BtInsertTemplate } from './btcppXml'
import { BtInsertMenu } from './ui/BtInsertMenu'
import { arrowHeadPath, edgeEndAngle, edgePathData } from './sceneSvg'
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
 */
function InsertButton({ insert, active, document, onOpenChange, onChoose }: {
	insert: BtSceneInsert
	active: boolean
	document: BtDocument
	onOpenChange(open: boolean): void
	onChoose(template: BtInsertTemplate): void
}) {
	const label = insert.kind === 'root' ? 'Add the root node' : insert.kind === 'empty' ? 'Add the first child' : 'Add a node here'
	return (
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
					style={{ left: insert.at.x, top: insert.at.y }}
					aria-label={label}
					title={label}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
				</button>
			</TldrawUiPopoverTrigger>
			<BtInsertMenu document={document} onChoose={onChoose} />
		</TldrawUiPopover>
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

	const edges = useMemo(() => projectedEdges(projection), [projection])
	const inserts = useMemo(() => projection.scene.inserts.map((insert) => ({ ...insert, at: sceneToRegion(projection, insert.at) })), [projection])
	const wireOpacity = shape.props.dataLens === 'none' ? 1 : shape.props.controlWireOpacity

	const choose = useCallback((template: BtInsertTemplate) => {
		if (!openInsert) return
		const result = insertBehaviorTreeChild(editor, shape.id, openInsert.parentPath, openInsert.index, template)
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
				data-testid={`bt-region-${shape.id}`}
				style={{ width: shape.props.w, height: shape.props.h }}
			>
				<div className="BehaviorTree-header" style={{ height: BT_HEADER_H }}>
					<span className="BehaviorTree-headerGlyph" aria-hidden="true">
						<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 3v5M12 8l-6 5M12 8l6 5M6 13v3a3 3 0 0 0 3 3h1M18 13v3a3 3 0 0 1-3 3h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
					</span>
					<span className="BehaviorTree-title" data-testid="bt-title">{shape.props.title || projection.tree?.id || 'Behavior Tree'}</span>
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
						const structural = edge.kind === 'control' || edge.kind === 'recovery' || edge.kind === 'merge'
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
