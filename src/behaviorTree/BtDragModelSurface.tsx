/**
 * The drag-model overlay's own layer, above every shape on the canvas.
 *
 * WHY this exists as a separate surface (Zach, 2026-09-06: "all this overlay
 * should be at a higher z level than what you're doing"): the overlay used to
 * paint inside the Behavior Tree region's own `<svg class="BehaviorTree-layer">`.
 * A region's projected nodes are real child SHAPES, and tldraw renders every
 * shape into `.tl-html-layer` — so the cards were DOM siblings painted over
 * that SVG and no z-index inside it could ever win. The symptom was every
 * threshold line being invisible except the few px that stuck out past a card,
 * and two label placements that looked fine in the SVG and were clipped on
 * screen.
 *
 * The fix is the seam the app already owns. tldraw's `DefaultCanvas` renders
 * `InFrontOfTheCanvas` as a sibling AFTER `.tl-canvas`, so anything mounted
 * there outranks all shape content by construction (read from
 * `@tldraw/editor/.../DefaultCanvas.mjs`, not from the docs). This surface
 * mounts in `SystemSketchSurfaceHost` beside the dnd-kit host that already
 * uses that seam.
 *
 * Two coordinate facts make the move cheap:
 *   - the camera transform is a CSS transform on one wrapper div, replicating
 *     tldraw's own `getHtmlLayerTransform` so the overlay lands on the cards
 *     pixel-for-pixel rather than near them;
 *   - each region's marks stay in REGION-LOCAL coordinates inside a `<g>`
 *     carrying that shape's page matrix, so `BtDragModelOverlay`'s geometry
 *     did not have to change at all.
 */
import { useMemo, useRef } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'

import { isBehaviorTreeShape } from './behaviorTreeModel'
import { projectBehaviorTree } from './behaviorTreeProjection'
import { BtDragModelRegion, type BtLiveDragTick } from './BtDragModelOverlay'
import { BT_META_PATH, readBtChildMeta } from './behaviorTreeModel'
import { btDndDragState } from './treeDndDragState'
import { treeDragModelOverlay, treeDragModelTreeFade } from './treeDragModelOverlayState'

/**
 * tldraw's own shape-layer transform, replicated.
 *
 * WHY replicated rather than imported: `getHtmlLayerTransform` is internal to
 * `@tldraw/editor` and not on the `tldraw` package's export surface. The
 * sub-pixel `offset` is not decoration — it is what the shapes layer is
 * translated by, so an overlay that omits it sits up to half a pixel off the
 * cards it is measuring, which is exactly the error a spacing readout must not
 * have. Keep this in sync if tldraw's pin moves.
 */
function modulate(value: number, from: [number, number], to: [number, number]): number {
	const ratio = (value - from[0]) / (from[1] - from[0])
	const result = to[0] + ratio * (to[1] - to[0])
	return to[1] > to[0] ? Math.max(to[0], Math.min(to[1], result)) : Math.max(to[1], Math.min(to[0], result))
}
function toDomPrecision(value: number): number {
	return Math.round(value * 1e4) / 1e4
}
export function htmlLayerTransform(camera: { x: number; y: number; z: number }): string {
	const { x, y, z } = camera
	const offset = z >= 1 ? modulate(z, [1, 8], [0.125, 0.5]) : modulate(z, [0.1, 1], [-2, 0.125])
	return `scale(${toDomPrecision(z)}) translate(${toDomPrecision(x + offset)}px,${toDomPrecision(y + offset)}px)`
}

/** The live dragged node, per region — the same read the region's canvas does. */
function liveDragFor(editor: Editor, regionId: TLShapeId): BtLiveDragTick | null {
	const dndDrag = btDndDragState.get(editor)
	let draggedId: TLShapeId | null = null
	if (dndDrag) {
		if (dndDrag.regionId !== regionId) return null
		draggedId = dndDrag.shapeId
	} else {
		if (!editor.isIn('select.translating')) return null
		const ids = editor.getSelectedShapeIds()
		if (ids.length !== 1) return null
		draggedId = ids[0]
	}
	const dragged = editor.getShape(draggedId)
	if (!dragged || dragged.parentId !== regionId) return null
	const meta = readBtChildMeta(dragged)
	if (!meta || meta.btRole !== 'node') return null
	const { w, h } = dragged.props as { w?: number; h?: number }
	if (typeof w !== 'number' || typeof h !== 'number') return null
	return { path: meta[BT_META_PATH], rect: { x: dragged.x, y: dragged.y, w, h } }
}

function BtRegionSlot({ regionId }: { regionId: TLShapeId }) {
	const editor = useEditor()
	const shape = useValue('bt drag model shape', () => {
		const candidate = editor.getShape(regionId)
		return isBehaviorTreeShape(candidate) ? candidate : null
	}, [editor, regionId])
	// The shape's own page matrix, so the marks below stay region-local. A
	// matrix (not a translate) because a rotated region must still line up.
	const matrix = useValue('bt drag model matrix', () => {
		const transform = editor.getShapePageTransform(regionId)
		if (!transform) return null
		return `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`
	}, [editor, regionId])
	const liveDragTick = useValue('bt drag model live drag', () => liveDragFor(editor, regionId), [editor, regionId])
	const fade = useValue('bt drag model tree fade', () => treeDragModelTreeFade.get(), [])
	const projection = useMemo(() => (shape ? projectBehaviorTree(shape.props) : null), [shape])
	if (!shape || !projection || !matrix) return null
	return (
		<g transform={matrix}>
			{/* The scrim: paper over the REAL tree, under every debug mark, so
			    the model becomes the foreground instead of competing with the
			    cards for attention. Zach's ask, and the same move a DevTools
			    overlay makes to stay readable over content it does not own. */}
			{fade > 0 ? (
				<rect
					className="BehaviorTree-dragModelScrim"
					data-testid="bt-drag-model-scrim"
					x={0}
					y={0}
					width={shape.props.w}
					height={shape.props.h}
					style={{ opacity: fade }}
				/>
			) : null}
			<BtDragModelRegion shape={shape} projection={projection} liveDragTick={liveDragTick} />
		</g>
	)
}

export function BtDragModelSurface() {
	const editor = useEditor()
	const on = useValue('bt drag model master', () => treeDragModelOverlay.get(), [])
	const regionIds = useValue('bt drag model regions', () => {
		if (!treeDragModelOverlay.get()) return [] as TLShapeId[]
		const ids: TLShapeId[] = []
		for (const id of editor.getCurrentPageShapeIds()) {
			const shape = editor.getShape(id)
			if (isBehaviorTreeShape(shape) && shape.props.projection === 'tree' && shape.props.arrangement === 'tidy') {
				ids.push(id)
			}
		}
		return ids
	}, [editor])
	const camera = useValue('bt drag model camera', () => editor.getCamera(), [editor])
	// The region elements are memoized so a camera move re-renders only this
	// component and React bails on the identical children — panning costs a
	// style write, not a repaint of every mark.
	const key = regionIds.join(',')
	const regions = useMemo(
		() => regionIds.map((id) => <BtRegionSlot key={id} regionId={id} />),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[key],
	)
	if (!on || regionIds.length === 0) return null
	return (
		<div className="BehaviorTree-dragModelSurface" data-testid="bt-drag-model-surface" aria-hidden="true">
			<div className="BehaviorTree-dragModelCamera" style={{ transform: htmlLayerTransform(camera) }}>
				<svg className="BehaviorTree-dragModelCanvas" width={1} height={1} overflow="visible">
					{/* One defs for the whole surface — a per-region <pattern>
					    would collide on id the moment two regions painted. */}
					<defs>
						<pattern id="bt-drag-model-hatch" width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
							<line className="BehaviorTree-dragModelHatchBar" x1={0} y1={0} x2={0} y2={10} />
						</pattern>
					</defs>
					{regions}
				</svg>
			</div>
		</div>
	)
}
