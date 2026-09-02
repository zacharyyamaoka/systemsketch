import {
	Box,
	Mat,
	ShapeUtil,
	SVGContainer,
	T,
	Vec,
	createComputedCache,
	createShapeId,
	type Editor,
	type IndexKey,
	type RecordProps,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShape,
	type TLShapeId,
	type VecModel,
	useEditor,
	useValue,
	vecModelValidator,
} from 'tldraw'
import {
	getAllConnectedBlocks,
	getBlockConnectionPortAtPoint,
	getLiveBlockPorts,
} from './blockPorts'
import {
	HitPaddedCubicBezier2d,
	HitPaddedEdge2d,
	HitPaddedPolyline2d,
	cableHitPadPageUnits,
	withCableHitPad,
} from './connectionHit'
import { blockPresetProps, openBlockPicker } from './blockPicker'
import { requestBlockInlineEdit } from '../inlineBlockEditing'
import { clearPortDragState, nearbyConnection, updatePortState } from '../ports/portState'
import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	isBlockShape,
	isInnerPortId,
	type BlockShape,
} from '../blockModel'
import {
	connectionHasBothTerminals,
	createOrUpdateConnectionBinding,
	getConnectionBindingPositionInPageSpace,
	getConnectionBindings,
	removeConnectionBinding,
} from './ConnectionBindingUtil'
import {
	CONNECTION_SHAPE_TYPE,
	ConnectionRoutingStyle,
	oppositeConnectionTerminal,
	type ConnectionRoutingKind,
	type ConnectionTerminal,
} from './connectionModel'
import {
	getBentCurveCubicControlPoints,
	getConnectionCenterPoint,
	getConnectionControlPoints,
	getConnectionPath,
	getElbowConnectionRoute,
	getElbowRouteInput,
	type ConnectionCurve,
	type ConnectionElbowBoxes,
} from './connectionRouting'
import {
	authoredElbowRoute,
	captureAuthoredRoute,
	captureResolvedRoute,
	dongleEndpoints,
	moveAuthoredSegment,
	resolveAuthoredRoute,
	type ConnectionElbowRouteModel,
} from './elbowAuthoredRoute'
import {
	pinElbowSegment,
	type ElbowPin,
	type ElbowRoute,
} from '../elbow'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CONNECTION_SHAPE_TYPE]: {
			start: VecModel
			end: VecModel
			routing: ConnectionRoutingKind
			/**
			 * The waypoint a dragged control point put on a curved or straight
			 * cable, as an offset from the endpoint midpoint. Null = the automatic
			 * route. Stored relative so the bend rides with the Blocks.
			 */
			curve: ConnectionCurve | null
			/** Pinned elbow rails, in the frame spanned by the two endpoints. */
			pins: ElbowPin[]
			/**
			 * The authored multi-elbow polyline, entered by dragging an end
			 * segment. Null = auto-routed (A* plus pins).
			 */
			elbowRoute: ConnectionElbowRouteModel | null
		}
	}
}

export type ConnectionShape = TLShape<typeof CONNECTION_SHAPE_TYPE>

const elbowPinValidator = T.object({
	index: T.number,
	axis: T.literalEnum('x', 'y'),
	t: T.number,
	offset: T.number,
})

const elbowRouteValidator = T.object({
	startAxis: T.literalEnum('x', 'y'),
	corners: T.arrayOf(T.object({ tx: T.number, ox: T.number, ty: T.number, oy: T.number })),
})

export const connectionShapeProps: RecordProps<ConnectionShape> = {
	start: vecModelValidator,
	end: vecModelValidator,
	routing: ConnectionRoutingStyle,
	curve: T.object({ dx: T.number, dy: T.number }).nullable(),
	pins: T.arrayOf(elbowPinValidator),
	elbowRoute: elbowRouteValidator.nullable(),
}

/** A minimal semantic cable: custom identity and stock tldraw handle lifecycle. */
export class ConnectionShapeUtil extends ShapeUtil<ConnectionShape> {
	static override type = CONNECTION_SHAPE_TYPE
	static override props = connectionShapeProps

	override getDefaultProps(): ConnectionShape['props'] {
		return {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			routing: 'curved',
			curve: null,
			pins: [],
			elbowRoute: null,
		}
	}

	/**
	 * Switching routing forgets the geometry the previous routing authored.
	 *
	 * A `curve` waypoint means nothing to an elbow, and a pinned rail means
	 * nothing to a bezier. Carrying either across the switch makes the cable snap
	 * back into a shape the user abandoned the moment they switch back. Routing is
	 * a `StyleProp`, so a batch write only sends `routing` — the reset has to
	 * happen here, on the shape, not at the call site.
	 */
	override onBeforeUpdate(
		previous: ConnectionShape,
		next: ConnectionShape,
	): ConnectionShape | void {
		if (previous.props.routing === next.props.routing) return
		const cleared = { curve: null, pins: [], elbowRoute: null }
		return { ...next, props: { ...next.props, ...cleared } }
	}

	override canBind({ bindingType, fromShapeType, toShapeType }: Parameters<ShapeUtil['canBind']>[0]): boolean {
		return bindingType === 'connection'
			&& fromShapeType === CONNECTION_SHAPE_TYPE
			&& toShapeType === 'block'
	}

	override canEdit(_shape: ConnectionShape): boolean {
		return false
	}

	override canResize(_shape: ConnectionShape): boolean {
		return false
	}

	override hideResizeHandles(_shape: ConnectionShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: ConnectionShape): boolean {
		return true
	}

	override hideSelectionBoundsBg(_shape: ConnectionShape): boolean {
		return true
	}

	override hideSelectionBoundsFg(_shape: ConnectionShape): boolean {
		return true
	}

	override canSnap(_shape: ConnectionShape): boolean {
		return false
	}

	override getBoundsSnapGeometry(_shape: ConnectionShape) {
		return { points: [] }
	}

	/**
	 * The visible curve, with an invisible corridor around it.
	 *
	 * tldraw hits an OPEN geometry when `distanceToPoint(p) < hitTestMargin/zoom`
	 * and ignores any `margin` a caller passes on that branch — so a 2px cable is
	 * only ever ±3 screen px wide to the pointer, which is what "the clickable
	 * region is really thin" measures. The pad is applied to the geometry itself,
	 * live, so the corridor follows the active hit profile at every zoom.
	 */
	override getGeometry(connection: ConnectionShape) {
		const { start, end } = getConnectionTerminals(this.editor, connection)
		const { curve, routing } = connection.props
		const pad = () => cableHitPadPageUnits(
			this.editor.getZoomLevel(),
			this.editor.options.hitTestMargin / this.editor.getZoomLevel(),
		)

		if (routing === 'elbow') {
			const route = getConnectionElbowRoute(this.editor, connection)
			return withCableHitPad(
				new HitPaddedPolyline2d({
					points: route.points.map((point: { x: number; y: number }) => Vec.From(point)),
				}),
				pad,
			)
		}

		if (routing === 'straight' && !curve) {
			return withCableHitPad(
				new HitPaddedEdge2d({ start: Vec.From(start), end: Vec.From(end) }),
				pad,
			)
		}

		// A dragged control point turns a straight cable into a curve — activation
		// in the Excalidraw sense — so both bent cases share one geometry.
		const [cp1, cp2] = curve
			? getBentCurveCubicControlPoints(start, end, curve)
			: getConnectionControlPoints(start, end)
		return withCableHitPad(
			new HitPaddedCubicBezier2d({
				start: Vec.From(start),
				cp1,
				cp2,
				end: Vec.From(end),
			}),
			pad,
		)
	}

	/**
	 * Two terminals, plus whatever control points this routing offers.
	 *
	 * A `curved` or `straight` cable gets one: a `create` handle sitting inert on
	 * the midpoint until it is dragged, at which point it activates into a bend
	 * and becomes a `vertex`. An `elbow` cable gets one per user-draggable
	 * segment — Excalidraw's model. On an auto route the two END segments grow a
	 * new rail when dragged, converting the cable to an authored route; on an
	 * authored route the two fixed port legs carry no handle, so no drag can lay
	 * the cable along a Block's face.
	 */
	override getHandles(connection: ConnectionShape): TLHandle[] {
		const { start, end } = getConnectionTerminals(this.editor, connection)
		const handles: TLHandle[] = [
			{ id: 'start', type: 'vertex', index: 'a0' as IndexKey, x: start.x, y: start.y },
			{ id: 'end', type: 'vertex', index: 'a1' as IndexKey, x: end.x, y: end.y },
		]

		// Figma's rule: a selected edge offers its control points only while the
		// pointer is near it. Without this, selecting a cable sprinkles handles
		// across the board and every one of them is a thing you can knock.
		if (nearbyConnection.get(this.editor) !== connection.id) return handles

		if (connection.props.routing === 'elbow') {
			const route = getConnectionElbowRoute(this.editor, connection)
			const authored = connection.props.elbowRoute !== null
			const lastIndex = route.segments.length - 1
			let handleIndex = 2
			for (let position = 0; position < route.segments.length; position += 1) {
				const segment = route.segments[position]
				const isEndSegment = position === 0 || position === lastIndex
				if (authored) {
					if (!segment.pinnable) continue
				} else if (isEndSegment && segment.length < ELBOW_END_HANDLE_MIN_LENGTH) {
					// A stubby end segment leaves no room between the port and the
					// first corner; a handle there would overlap the port dot.
					continue
				}
				const id = authored
					? `route:${segment.index}`
					: isEndSegment
						? `grow:${position === 0 ? 'first' : 'last'}`
						: `segment:${segment.index}`
				handles.push({
					id,
					type: 'virtual',
					index: `a${handleIndex++}` as IndexKey,
					x: segment.midpoint.x,
					y: segment.midpoint.y,
				})
			}
			return handles
		}

		const center = getConnectionCenterPoint(connection.props.routing, start, end, {
			curve: connection.props.curve,
		})
		handles.push({
			id: 'bend',
			type: connection.props.curve ? 'vertex' : 'create',
			index: 'a2' as IndexKey,
			x: center.x,
			y: center.y,
		})
		return handles
	}

	/**
	 * Which connection a completed drop would replace. Tracked during the drag
	 * and acted on at the end, so an abandoned drag never destroys the wire it
	 * merely hovered.
	 */
	private pendingReplacementId: TLShapeId | null = null

	/**
	 * Base state of an authored-rail drag, captured on the first tick. A grow
	 * gesture inserts a rail; re-applying every tick against the same base means
	 * one drag grows exactly one rail and keeps adjusting it, rather than
	 * inserting a fresh rail on every pointer move.
	 */
	private activeRailDrag: {
		connectionId: TLShapeId
		handleId: string
		model: ConnectionElbowRouteModel
		segmentIndex: number
	} | null = null

	override onHandleDrag(
		connection: ConnectionShape,
		{ handle }: TLHandleDragInfo<ConnectionShape>,
	) {
		// A dragged control point activates a bend through the pointer. Dragging
		// it on a straight cable turns that cable into a curve — activation in the
		// Excalidraw sense, which is what the FR's "drag it and it becomes curved"
		// describes.
		if (handle.id === 'bend') {
			const { start, end } = getConnectionTerminals(this.editor, connection)
			const curve: ConnectionCurve = {
				dx: handle.x - (start.x + end.x) / 2,
				dy: handle.y - (start.y + end.y) / 2,
			}
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { curve },
			}
		}

		// A dragged rail of an authored route, or an end segment of an auto route
		// (which grows a new rail and converts the cable to authored). Everything
		// runs in the dongle frame: the rails live between the two fixed port
		// legs, never touching the ports themselves.
		if (handle.id.startsWith('route:') || handle.id.startsWith('grow:')) {
			const { start, end } = getConnectionTerminals(this.editor, connection)
			const dongles = dongleEndpoints(start, end)
			if (
				this.activeRailDrag?.connectionId !== connection.id
				|| this.activeRailDrag?.handleId !== handle.id
			) {
				const resolved = getConnectionElbowRoute(this.editor, connection)
				const model = connection.props.elbowRoute
					?? captureResolvedRoute(resolved.points, dongles.start, dongles.end)
				// `route:` ids carry the RENDERED polyline position; the inner route
				// between the dongles sits one segment earlier.
				const segmentIndex = handle.id.startsWith('route:')
					? Number(handle.id.slice('route:'.length)) - 1
					: handle.id === 'grow:first'
						? 0
						: resolved.points.length - 2
				if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return undefined
				this.activeRailDrag = {
					connectionId: connection.id,
					handleId: handle.id,
					model,
					segmentIndex,
				}
			}
			const base = this.activeRailDrag
			const moved = moveAuthoredSegment(
				dongles.start,
				dongles.end,
				resolveAuthoredRoute(base.model, dongles.start, dongles.end),
				base.segmentIndex,
				{ x: handle.x, y: handle.y },
			)
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { elbowRoute: captureAuthoredRoute(moved, dongles.start, dongles.end) },
			}
		}

		// A dragged interior rail pins that rail. The pin persists in the frame
		// spanned by the two endpoints, so it survives the Blocks moving.
		if (handle.id.startsWith('segment:')) {
			const segmentIndex = Number(handle.id.slice('segment:'.length))
			if (!Number.isInteger(segmentIndex)) return undefined
			const { start, end } = getConnectionTerminals(this.editor, connection)
			const input = getElbowRouteInput(
				start,
				end,
				getConnectionElbowBoxes(this.editor, connection),
				connection.props.pins,
			)
			const pins = pinElbowSegment(input, segmentIndex, { x: handle.x, y: handle.y })
			if (!pins) return undefined
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { pins: pins as ElbowPin[] },
			}
		}

		if (handle.id !== 'start' && handle.id !== 'end') return
		const terminal = handle.id as ConnectionTerminal
		const opposite = oppositeConnectionTerminal(terminal)
		const pagePoint = this.editor.getShapePageTransform(connection).applyToPoint(handle)
		// Which Blocks would close a loop if this end landed on them. The walk is
		// flat, so it is computed once per move and handed to the port affordance
		// as well — a port that cannot accept the cable must not light up.
		const anchoredShapeId = getConnectionBindings(this.editor, connection)[opposite]?.toId
		const target = getBlockConnectionPortAtPoint(this.editor, pagePoint, {
			terminal,
			fromShapeId: anchoredShapeId,
		})

		const wouldCycle = anchoredShapeId
			? getAllConnectedBlocks(this.editor, anchoredShapeId, terminal)
			: null

		updatePortState(this.editor, {
			eligiblePorts: { terminal, excludeBlocks: wouldCycle },
		})

		// A hierarchy edge — either end on a boundary port's INNER face — is exempt
		// from the cycle veto. The flat walk conflates a Block's inside with its
		// outside, so a child feeding its own parent's outlet reads as a cycle when
		// it is the hierarchy working as designed.
		const oppositeBinding = getConnectionBindings(this.editor, connection)[opposite]
		const isHierarchyEdge = (target?.port.inner ?? false)
			|| (oppositeBinding ? isInnerPortId(oppositeBinding.props.portId) : false)
		const vetoed = !isHierarchyEdge
			&& target !== null
			&& (wouldCycle?.has(target.shapeId) ?? false)

		if (!target || vetoed) {
			this.pendingReplacementId = null
			updatePortState(this.editor, { hintingPort: null })
			removeConnectionBinding(this.editor, connection, terminal)
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { [terminal]: { x: handle.x, y: handle.y } },
			}
		}

		// An input takes one cable. Landing a second on it replaces the first
		// rather than stacking two wires nobody can tell apart. Outputs fan out.
		const occupant = target.existingConnections
			.find((existing) => existing.connectionId !== connection.id)
		this.pendingReplacementId = occupant && terminal === 'end' ? occupant.connectionId : null

		updatePortState(this.editor, {
			hintingPort: { shapeId: target.shapeId, portId: target.port.id },
		})

		createOrUpdateConnectionBinding(this.editor, connection, target.shape.id, {
			portId: target.port.id,
			terminal,
		})
		// A binding may reparent the connection. Returning the captured shape here
		// would restore its stale parentId, so bound terminals write no shape patch.
		return undefined
	}

	override onHandleDragEnd(
		connection: ConnectionShape,
		{ handle, isCreatingShape }: TLHandleDragInfo<ConnectionShape>,
	): void {
		this.activeRailDrag = null
		if (this.pendingReplacementId) {
			this.editor.deleteShapes([this.pendingReplacementId])
			this.pendingReplacementId = null
		}
		clearPortDragState(this.editor)

		if (handle.id !== 'start' && handle.id !== 'end') return
		const terminal = handle.id as ConnectionTerminal

		if (getConnectionBindings(this.editor, connection.id)[terminal]) return

		// A cable that landed on EMPTY SPACE is a question: offer what to put
		// there. A cable that landed on a Block and was refused is not — the user
		// was aiming at that Block, and creating a new one on top of it is not the
		// alternative they wanted. Refusal is already shown during the drag, by the
		// illegal port never lighting up.
		// tldraw hands `onHandleDragEnd` the INITIAL handle, not the current one —
		// `DraggingHandle.complete()` passes `this.initialHandle`. Asking that where
		// the cable landed answers with where it started, which is always on the
		// Block whose port was pressed.
		const dropPoint = this.editor.inputs.getCurrentPagePoint()
		const overABlock = this.editor.getShapeAtPoint(dropPoint, {
			hitInside: true,
			filter: (shape) => isBlockShape(shape),
		}) !== undefined
		if (isCreatingShape && !overABlock) {
			offerBlockForLooseTerminal(this.editor, connection.id, terminal)
			return
		}

		if (!connectionHasBothTerminals(this.editor, connection.id)) {
			this.editor.deleteShapes([connection.id])
		}
	}

	override onHandleDragCancel(): void {
		this.pendingReplacementId = null
		this.activeRailDrag = null
		clearPortDragState(this.editor)
	}

	override component(connection: ConnectionShape) {
		return <ConnectionShapeComponent connection={connection} />
	}

	override toSvg(connection: ConnectionShape) {
		return (
			<path
				d={getConnectionShapePath(this.editor, connection)}
				fill="none"
				stroke="#475569"
				strokeLinecap="round"
				strokeWidth={2}
			/>
		)
	}

	override getIndicatorPath(connection: ConnectionShape): Path2D {
		return new Path2D(getConnectionShapePath(this.editor, connection))
	}

	override getAriaDescriptor(_shape: ConnectionShape): string {
		return 'Block connection'
	}
}

function ConnectionShapeComponent({ connection }: { connection: ConnectionShape }) {
	const editor = useEditor()
	const path = useValue(
		'block connection path',
		() => getConnectionShapePath(editor, connection),
		[editor, connection],
	)
	return (
		<SVGContainer>
			<path
				d={path}
				fill="none"
				stroke="var(--tl-color-text-3, #475569)"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
			/>
		</SVGContainer>
	)
}

/**
 * A stubby end segment leaves no room between the port and the first corner, so
 * it gets no handle rather than one that overlaps the port dot.
 */
export const ELBOW_END_HANDLE_MIN_LENGTH = 20

/** The routed elbow polyline for a cable, in the cable's own space. */
export function getConnectionElbowRoute(
	editor: Editor,
	connection: ConnectionShape,
): ElbowRoute {
	if (!editor.store) return computeConnectionElbowRoute(editor, connection)
	return connectionElbowRouteCache.get(editor, connection.id)
		?? computeConnectionElbowRoute(editor, connection)
}

function computeConnectionElbowRoute(editor: Editor, connection: ConnectionShape): ElbowRoute {
	const { start, end } = getConnectionTerminals(editor, connection)
	// An authored route replaces the A*: the user owns the rails, and the
	// normalize pass re-binds the end segments to the live ports.
	if (connection.props.elbowRoute) {
		return authoredElbowRoute(connection.props.elbowRoute, start, end)
	}
	return getElbowConnectionRoute(
		start,
		end,
		getConnectionElbowBoxes(editor, connection),
		connection.props.pins,
	)
}

const connectionElbowRouteCache = createComputedCache(
	'connection elbow route',
	(editor: Editor, connection: ConnectionShape) => computeConnectionElbowRoute(editor, connection),
)

/** The bound Blocks' boxes, in the cable's own space, as router obstacles. */
function getConnectionElbowBoxes(
	editor: Editor,
	connection: ConnectionShape,
): ConnectionElbowBoxes {
	const bindings = getConnectionBindings(editor, connection)
	const inverse = Mat.Inverse(editor.getShapePageTransform(connection))
	const toLocalBox = (shapeId: TLShapeId | undefined) => {
		if (!shapeId) return null
		const bounds = editor.getShapePageBounds(shapeId)
		if (!bounds) return null
		const topLeft = Mat.applyToPoint(inverse, { x: bounds.minX, y: bounds.minY })
		return { x: topLeft.x, y: topLeft.y, w: bounds.width, h: bounds.height }
	}
	return {
		start: toLocalBox(bindings.start?.toId),
		end: toLocalBox(bindings.end?.toId),
	}
}

/**
 * Sample points along a cable's rendered route, in the cable's own space.
 *
 * The proximity tracker needs "how far is the pointer from this cable", and a
 * cheap polyline sample answers that without asking the geometry cache to
 * rebuild on every pointer move.
 */
export function getConnectionShapeGeometryPoints(
	editor: Editor,
	connectionId: TLShapeId,
): Vec[] {
	const connection = editor.getShape<ConnectionShape>(connectionId)
	if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) return []
	const { start, end } = getConnectionTerminals(editor, connection)
	const { routing, curve } = connection.props

	if (routing === 'elbow') {
		return getConnectionElbowRoute(editor, connection).points.map((point: { x: number; y: number }) =>
			Vec.From(point))
	}
	if (routing === 'straight' && !curve) return [Vec.From(start), Vec.From(end)]

	const [cp1, cp2] = curve
		? getBentCurveCubicControlPoints(start, end, curve)
		: getConnectionControlPoints(start, end)
	const samples: Vec[] = []
	for (let step = 0; step <= CABLE_PROXIMITY_SAMPLES; step += 1) {
		const t = step / CABLE_PROXIMITY_SAMPLES
		const u = 1 - t
		samples.push(new Vec(
			u * u * u * start.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * end.x,
			u * u * u * start.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * end.y,
		))
	}
	return samples
}

/** Enough to keep the proximity answer smooth on a long curve, cheap to walk. */
const CABLE_PROXIMITY_SAMPLES = 24

/** Resolve both endpoints in connection-local coordinates. */
export function getConnectionTerminals(editor: Editor, connection: ConnectionShape) {
	let start: VecModel | undefined
	let end: VecModel | undefined
	const bindings = getConnectionBindings(editor, connection)
	const pageToLocal = Mat.Inverse(editor.getShapePageTransform(connection))

	if (bindings.start) {
		const pagePoint = getConnectionBindingPositionInPageSpace(editor, bindings.start)
		if (pagePoint) start = Mat.applyToPoint(pageToLocal, pagePoint)
	}
	if (bindings.end) {
		const pagePoint = getConnectionBindingPositionInPageSpace(editor, bindings.end)
		if (pagePoint) end = Mat.applyToPoint(pageToLocal, pagePoint)
	}

	return {
		start: start ?? connection.props.start,
		end: end ?? connection.props.end,
	}
}

export function getConnectionShapePath(
	editor: Editor,
	connection: ConnectionShape,
): string {
	const { start, end } = getConnectionTerminals(editor, connection)
	return getConnectionPath(connection.props.routing, start, end, {
		curve: connection.props.curve,
		route: connection.props.routing === 'elbow'
			? getConnectionElbowRoute(editor, connection)
			: undefined,
	})
}

/**
 * Offer a Block for a cable terminal that landed on nothing, and wire it up.
 *
 * The new Block is offset so its first port of the needed terminal lands exactly
 * under the cable end — the kit's placement rule, and the reason the result
 * looks deliberate rather than dropped. A declined offer deletes the cable,
 * because a half-bound cable is not a document state anything else can read.
 */
export function offerBlockForLooseTerminal(
	editor: Editor,
	connectionId: TLShapeId,
	terminal: ConnectionTerminal,
): void {
	const connection = editor.getShape<ConnectionShape>(connectionId)
	if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) return
	const local = getConnectionTerminals(editor, connection)[terminal]
	const anchor = editor.getShapePageTransform(connection).applyToPoint(local)

	openBlockPicker(editor, {
		connectionId,
		terminal,
		anchor,
		onClose: () => {
			const cable = editor.getShape(connectionId)
			if (!cable) return
			if (!connectionHasBothTerminals(editor, connectionId)) {
				editor.deleteShapes([connectionId])
			}
		},
		onPick: (preset, anchorInPageSpace) => {
			const blockId = createShapeId()
			editor.run(() => {
				editor.createShape({
					id: blockId,
					type: BLOCK_SHAPE_TYPE,
					x: anchorInPageSpace.x,
					y: anchorInPageSpace.y,
					props: blockPresetProps(preset, getDefaultBlockProps()),
				})

				const created = editor.getShape<BlockShape>(blockId)
				if (!created) return
				// Only the OUTER faces are candidates: the new Block is a sibling of
				// the cable's other end, not a boundary the cable is passing through.
				const landing = getLiveBlockPorts(editor, blockId)
					.find((port) => port.terminal === terminal && !port.hidden && !port.inner)
				if (!landing) {
					editor.deleteShapes([blockId])
					if (!connectionHasBothTerminals(editor, connectionId)) {
						editor.deleteShapes([connectionId])
					}
					return
				}

				editor.updateShape({
					id: blockId,
					type: BLOCK_SHAPE_TYPE,
					x: anchorInPageSpace.x - landing.x,
					y: anchorInPageSpace.y - landing.y,
				})
				createOrUpdateConnectionBinding(editor, connectionId, blockId, {
					portId: landing.id,
					terminal,
				})
				if (!connectionHasBothTerminals(editor, connectionId)) {
					editor.deleteShapes([connectionId, blockId])
					return
				}
				editor.select(blockId)
			})
			// The Block arrives unnamed, and naming it is the next thing anyone
			// does — the same rule the Block tool already follows after a draw.
			requestBlockInlineEdit(editor, blockId, { kind: 'title' })
		},
	})
}
