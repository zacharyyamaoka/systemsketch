import {
	Box,
	Mat,
	ShapeUtil,
	SVGContainer,
	T,
	Vec,
	createComputedCache,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	createShapeId,
	isShapeId,
	type Editor,
	type IndexKey,
	type RecordProps,
	type TLHandle,
	type TLHandleDragInfo,
	type TLParentId,
	type TLShape,
	type TLShapeId,
	type VecModel,
	useEditor,
	useValue,
	vecModelValidator,
} from 'tldraw'
import { getBlockPortConnections, getBlockPortDotAtPoint } from './blockPorts'
import {
	HitPaddedCubicBezier2d,
	HitPaddedEdge2d,
	HitPaddedPolyline2d,
	cableHitPadPageUnits,
	withCableHitPad,
} from './connectionHit'
import { blockPresetProps, openBlockPicker } from './blockPicker'
import { requestBlockInlineEdit } from '../inlineBlockEditing'
import { clearPortDragState, updatePortState } from '../ports/portState'
import {
	BLOCK_SHAPE_TYPE,
	getDefaultBlockProps,
	type BlockShape,
} from '../blockModel'
import {
	adoptCableTypeIntoPills,
	connectionBindingPolarity,
	connectionHasBothTerminals,
	createOrUpdateConnectionBinding,
	getConnectionBindingPositionInPageSpace,
	getConnectionBindings,
	getConnectionDirection,
	normalizeConnectionDirection,
	removeConnectionBinding,
	type ConnectionBinding,
} from './ConnectionBindingUtil'
import {
	CONNECTION_SHAPE_TYPE,
	ConnectionRoutingStyle,
	oppositeConnectionTerminal,
	oppositePolarity,
	type ConnectionRoutingKind,
	type ConnectionTerminal,
	type PortDot,
	type PortFace,
	ConnectionTemporalStyle,
	type ConnectionTemporalKind,
	clampPillPosition,
	PILL_POSITION_DEFAULT,
} from './connectionModel'
import {
	blocksThatWouldCycle,
	dropScopeAt,
	findConnectionTarget,
	firstOuterPortForPolarity,
} from './connectionRules'
import { anchorFaceForScope, blockScopeId } from './connectionScope'
import {
	cablePresentation,
	DELAY_DOT_GAP_PX,
	DELAY_DOT_PX,
	DELAY_PILL_HEIGHT,
	delayPillLabel,
	delayPillWidth,
	fractionNearest,
	PATH_LENGTH_UNITS,
	pointAtFraction,
	polylineLength,
	splitDashArrays,
} from './connectionPresentation'
import { BRANCH_FADE_OPACITY } from '../../branch/branchModel'
import { branchAncestry, branchFadeOpacity } from '../../branch/branchScope'
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
			/** `data` on this pass, `delayed` one iteration later (a loop's back edge). */
			temporal: ConnectionTemporalKind
			/** The initial value a delayed cable names in its pill, `= value`; empty = none. */
			delayValue: string
			/** Where the z⁻¹ pill sits, as a fraction of the cable's arc length. */
			pillPosition: number
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
	temporal: ConnectionTemporalStyle,
	delayValue: T.string,
	pillPosition: T.number,
}

const connectionVersions = createShapePropsMigrationIds(CONNECTION_SHAPE_TYPE, {
	AddAuthoredRoutingGeometry: 1,
	AddTemporalQualifier: 2,
})

const connectionShapeMigrations = createShapePropsMigrationSequence({
	sequence: [{
		id: connectionVersions.AddAuthoredRoutingGeometry,
		up(props) {
			// Connections created before authored routing landed have none of these
			// keys. Make the automatic route explicit before the current validator
			// sees the persisted record.
			if (props.curve === undefined) props.curve = null
			if (props.pins === undefined) props.pins = []
			if (props.elbowRoute === undefined) props.elbowRoute = null
		},
		down(props) {
			delete props.curve
			delete props.pins
			delete props.elbowRoute
		},
	}, {
		id: connectionVersions.AddTemporalQualifier,
		up(props) {
			// Every cable saved before the edge vocabulary is a plain data cable.
			if (props.temporal === undefined) props.temporal = 'data'
			if (props.delayValue === undefined) props.delayValue = ''
			if (props.pillPosition === undefined) props.pillPosition = PILL_POSITION_DEFAULT
		},
		down(props) {
			delete props.temporal
			delete props.delayValue
			delete props.pillPosition
		},
	}],
})

/** A minimal semantic cable: custom identity and stock tldraw handle lifecycle. */
export class ConnectionShapeUtil extends ShapeUtil<ConnectionShape> {
	static override type = CONNECTION_SHAPE_TYPE
	static override props = connectionShapeProps
	static override migrations = connectionShapeMigrations

	override getDefaultProps(): ConnectionShape['props'] {
		return {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			// Overridden by `stylesForNextShape` on every real creation; kept in
			// step with `ConnectionRoutingStyle` so the two never disagree.
			routing: 'elbow',
			curve: null,
			pins: [],
			elbowRoute: null,
			temporal: 'data',
			delayValue: '',
			pillPosition: PILL_POSITION_DEFAULT,
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
			&& (toShapeType === 'block' || toShapeType === 'branch')
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
		const { source, sink } = getConnectionEndpoints(this.editor, connection)
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
				new HitPaddedEdge2d({ start: Vec.From(source), end: Vec.From(sink) }),
				pad,
			)
		}

		// A dragged control point turns a straight cable into a curve — activation
		// in the Excalidraw sense — so both bent cases share one geometry.
		const [cp1, cp2] = curve
			? getBentCurveCubicControlPoints(source, sink, curve)
			: getConnectionControlPoints(source, sink)
		return withCableHitPad(
			new HitPaddedCubicBezier2d({
				start: Vec.From(source),
				cp1,
				cp2,
				end: Vec.From(sink),
			}),
			pad,
		)
	}

	/**
	 * Two terminals, plus whatever control points this routing offers.
	 *
	 * A `curved` or `straight` cable gets one: a `virtual` handle sitting on
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

		// The z⁻¹ pill is a thing you can see, so it is always a thing you can
		// drag: it rides the cable at `pillPosition` and slides along it.
		if (connection.props.temporal === 'delayed') {
			const pill = pointAtFraction(
				getConnectionRenderPoints(this.editor, connection),
				clampPillPosition(connection.props.pillPosition),
			)
			handles.push({ id: 'pill', type: 'virtual', index: 'a1V' as IndexKey, x: pill.x, y: pill.y })
		}

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
					// Elbow arrows use vertex handles for their draggable rails. A
					// data edge does too: selecting either connector now produces the
					// same always-visible control rather than a second hover-gated UI.
					type: 'vertex',
					index: `a${handleIndex++}` as IndexKey,
					x: segment.midpoint.x,
					y: segment.midpoint.y,
				})
			}
			return handles
		}

		const { source, sink } = getConnectionEndpoints(this.editor, connection)
		const center = getConnectionCenterPoint(connection.props.routing, source, sink, {
			curve: connection.props.curve,
		})
		handles.push({
			id: 'bend',
			// Stock curved arrows keep their midpoint visible on selection. A
			// straight / curved data edge follows that same interaction pattern;
			// dragging this virtual point activates it into a persistent vertex.
			type: connection.props.curve ? 'vertex' : 'virtual',
			index: 'a2' as IndexKey,
			x: center.x,
			y: center.y,
		})
		return handles
	}

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
		// The pill slides along the cable: the nearest point of the routed path
		// to the pointer, kept clear of both ports.
		if (handle.id === 'pill') {
			const points = getConnectionRenderPoints(this.editor, connection)
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { pillPosition: clampPillPosition(fractionNearest(points, handle)) },
			}
		}

		// A dragged control point activates a bend through the pointer. Dragging
		// it on a straight cable turns that cable into a curve — activation in the
		// Excalidraw sense, which is what the FR's "drag it and it becomes curved"
		// describes.
		if (handle.id === 'bend') {
			const { source, sink } = getConnectionEndpoints(this.editor, connection)
			const curve: ConnectionCurve = {
				dx: handle.x - (source.x + sink.x) / 2,
				dy: handle.y - (source.y + sink.y) / 2,
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
			const { source, sink } = getConnectionEndpoints(this.editor, connection)
			const dongles = dongleEndpoints(source, sink)
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
			const { source, sink } = getConnectionEndpoints(this.editor, connection)
			const input = getElbowRouteInput(
				source,
				sink,
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
		return this.dragTerminal(connection, handle.id, handle)
	}

	/**
	 * The loose end of a cable, following the pointer.
	 *
	 * The other end is welded to a dot. Which FACE of that dot — and therefore
	 * which way the cable points — is not fixed at the press: it is whatever the
	 * landing needs. Over a port, the rules judge the pair and hand back both
	 * faces. Over empty space, the scope under the pointer decides the anchored
	 * face, so a cable dragged from an Expanded Block's outlet into its own
	 * interior already reads as the inside returning through the outlet, and the
	 * offer made on release puts the new Block inside.
	 */
	private dragTerminal(
		connection: ConnectionShape,
		terminal: ConnectionTerminal,
		handle: TLHandle,
	) {
		const anchoredTerminal = oppositeConnectionTerminal(terminal)
		const anchoredBinding = getConnectionBindings(this.editor, connection)[anchoredTerminal]
		const pagePoint = this.editor.getShapePageTransform(connection).applyToPoint(handle)

		if (!anchoredBinding) {
			// Nothing to judge against: a cable with no welded end just follows.
			updatePortState(this.editor, { hintingPort: null, eligiblePorts: null })
			removeConnectionBinding(this.editor, connection, terminal)
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { [terminal]: { x: handle.x, y: handle.y } },
			}
		}

		const anchor: PortDot = { shapeId: anchoredBinding.toId, portId: anchoredBinding.props.portId }
		// Which Blocks would close a loop if this end landed on them. The walk is
		// flat, computed once per move and handed to the port affordance as well —
		// a port that cannot accept the cable must not light up.
		const excludeBlocks = blocksThatWouldCycle(this.editor, anchor)
		updatePortState(this.editor, {
			eligiblePorts: { anchor, excludeBlocks, connectionId: connection.id },
		})

		const target = findConnectionTarget(this.editor, pagePoint, anchor, {
			excludeBlocks,
			connectionId: connection.id,
		})

		if (!target) {
			updatePortState(this.editor, { hintingPort: null })
			removeConnectionBinding(this.editor, connection, terminal)
			// The scope under the pointer decides which face the anchored end is
			// reaching out from, so the cable is drawn — and the offer is made —
			// for the place the pointer actually is.
			const scope = dropScopeAt(this.editor, pagePoint)
			const face = scope.kind === 'scope'
				? anchorFaceForScope(this.editor, anchor, scope.scopeId)
				: null
			setAnchoredFace(this.editor, anchoredBinding, face ?? 'outer')
			return {
				id: connection.id,
				type: CONNECTION_SHAPE_TYPE,
				props: { [terminal]: { x: handle.x, y: handle.y } },
			}
		}

		setAnchoredFace(this.editor, anchoredBinding, target.anchor.face)

		// Sources fan out and sinks fan in: a second cable onto an occupied input
		// joins it rather than replacing what is there. The one thing a drop
		// never makes is a second copy of a wire that already exists, and the
		// rules refuse that before it gets here.
		updatePortState(this.editor, {
			hintingPort: { shapeId: target.hit.shapeId, portId: target.target.portId },
		})

		createOrUpdateConnectionBinding(this.editor, connection, target.hit.shapeId, {
			portId: target.target.portId,
			face: target.target.face,
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
		clearPortDragState(this.editor)

		if (handle.id !== 'start' && handle.id !== 'end') return
		const terminal = handle.id as ConnectionTerminal

		if (getConnectionBindings(this.editor, connection.id)[terminal]) {
			// Settled: make the document read source → sink, and let an untyped
			// pill take the type of the port it just met.
			normalizeConnectionDirection(this.editor, connection.id)
			adoptCableTypeIntoPills(this.editor, connection.id)
			// A cable you just DREW is not left selected. Its terminal handles sit
			// exactly on the dots it joins, and a selected cable's handle wins the
			// next press on that dot — so leaving it selected would turn "wire this
			// output to a second input" into "drag the first wire away". A cable
			// you re-routed stays selected: you chose it, and its handles are live.
			if (isCreatingShape) this.editor.selectNone()
			return
		}

		// A cable that landed in EMPTY SPACE is a question: offer what to put
		// there, in the scope it landed in. A cable that landed on a collapsed
		// Block and was refused is not — the user was aiming at that Block, and
		// creating a new one on top of it is not the alternative they wanted.
		// Refusal is already shown during the drag, by the illegal port never
		// lighting up.
		// tldraw hands `onHandleDragEnd` the INITIAL handle, not the current one —
		// `DraggingHandle.complete()` passes `this.initialHandle`. Asking that where
		// the cable landed answers with where it started, which is always on the
		// Block whose port was pressed.
		const dropPoint = this.editor.inputs.getCurrentPagePoint()
		// A release within reach of a dot was aimed at that dot. If it is still
		// unbound here the rules refused it, and refusal is quiet: no offer.
		const aimedAtPort = getBlockPortDotAtPoint(this.editor, dropPoint) !== null
		const scope = dropScopeAt(this.editor, dropPoint)
		if (isCreatingShape && !aimedAtPort && scope.kind === 'scope') {
			if (offerBlockForLooseTerminal(this.editor, connection.id, terminal, scope.scopeId)) return
		}

		if (!connectionHasBothTerminals(this.editor, connection.id)) {
			this.editor.deleteShapes([connection.id])
		}
	}

	override onHandleDragCancel(): void {
		this.activeRailDrag = null
		clearPortDragState(this.editor)
	}

	override component(connection: ConnectionShape) {
		return <ConnectionShapeComponent connection={connection} />
	}

	override toSvg(connection: ConnectionShape) {
		const path = getConnectionShapePath(this.editor, connection)
		if (connection.props.temporal !== 'delayed') {
			return <path d={path} fill="none" stroke="#475569" strokeLinecap="round" strokeWidth={2} />
		}
		const pill = delayPillGeometry(this.editor, connection)
		return (
			<g>
				<DelayedCablePaths path={path} pill={pill} dashAfterPill={cablePresentation.get().dashAfterPill} stroke="#475569" />
				<DelayPill pill={pill} label={delayPillLabel(connection.props.delayValue)} stroke="#475569" fill="#ffffff" ink="#1d2230" />
			</g>
		)
	}

	override getIndicatorPath(connection: ConnectionShape): Path2D {
		return new Path2D(getConnectionShapePath(this.editor, connection))
	}

	override getAriaDescriptor(_shape: ConnectionShape): string {
		return 'Block connection'
	}
}

/** Re-face the welded end of an in-flight cable; a no-op when it already matches. */
function setAnchoredFace(editor: Editor, binding: ConnectionBinding, face: PortFace): void {
	if (binding.props.face === face) return
	editor.updateBinding<ConnectionBinding>({
		id: binding.id,
		type: binding.type,
		props: { face },
	})
}

function ConnectionShapeComponent({ connection }: { connection: ConnectionShape }) {
	const editor = useEditor()
	const path = useValue(
		'block connection path',
		() => getConnectionShapePath(editor, connection),
		[editor, connection],
	)
	// A cable touching a non-active Branch arm fades with that arm.
	const opacity = useValue(
		'block connection branch fade',
		() => connectionBranchFade(editor, connection),
		[editor, connection.id],
	)
	const delayed = connection.props.temporal === 'delayed'
	const dashAfterPill = useValue('dash after pill', () => cablePresentation.get().dashAfterPill, [])
	const pill = useValue(
		'delay pill geometry',
		() => (delayed ? delayPillGeometry(editor, connection) : null),
		[editor, connection, delayed],
	)
	const stroke = 'var(--tl-color-text-3, #475569)'
	if (!delayed || !pill) {
		return (
			<SVGContainer style={{ opacity }}>
				<path
					d={path}
					fill="none"
					stroke={stroke}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
				/>
			</SVGContainer>
		)
	}
	return (
		<SVGContainer style={{ opacity }} data-temporal="delayed">
			<DelayedCablePaths path={path} pill={pill} dashAfterPill={dashAfterPill} stroke={stroke} />
			<DelayPill
				pill={pill}
				label={delayPillLabel(connection.props.delayValue)}
				stroke={stroke}
				fill="var(--ss-surface, #ffffff)"
				ink="var(--ss-text, #1d2230)"
			/>
		</SVGContainer>
	)
}

interface DelayPillGeometry {
	x: number
	y: number
	/** Arc length of the routed cable, in shape units. */
	length: number
	dash: ReturnType<typeof splitDashArrays>
}

/** Where the pill sits on this cable's routed path, and the dashes that split there. */
export function delayPillGeometry(editor: Editor, connection: ConnectionShape): DelayPillGeometry {
	const points = getConnectionRenderPoints(editor, connection)
	const t = clampPillPosition(connection.props.pillPosition)
	const at = pointAtFraction(points, t)
	const length = polylineLength(points)
	return { x: at.x, y: at.y, length, dash: splitDashArrays(length, t) }
}

/**
 * The delayed line: dotted end to end by default, or dotted up to the pill
 * and dashed after it when the presentation switch says so. The split draws
 * the same smooth path twice with complementary dash arrays normalised to
 * `pathLength`, so a curve stays a curve.
 */
function DelayedCablePaths({
	path,
	pill,
	dashAfterPill,
	stroke,
}: {
	path: string
	pill: DelayPillGeometry
	dashAfterPill: boolean
	stroke: string
}) {
	if (!dashAfterPill) {
		return (
			<path
				d={path}
				fill="none"
				stroke={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				strokeDasharray={`${DELAY_DOT_PX} ${DELAY_DOT_GAP_PX}`}
				data-delay-segment="all"
			/>
		)
	}
	return (
		<>
			<path
				d={path}
				pathLength={PATH_LENGTH_UNITS}
				fill="none"
				stroke={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				strokeDasharray={pill.dash.before}
				data-delay-segment="before"
			/>
			<path
				d={path}
				pathLength={PATH_LENGTH_UNITS}
				fill="none"
				stroke={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				strokeDasharray={pill.dash.after}
				data-delay-segment="after"
			/>
		</>
	)
}

/** The z⁻¹ pill: a value store riding the cable, in the port default chip's grammar. */
function DelayPill({
	pill,
	label,
	stroke,
	fill,
	ink,
}: {
	pill: DelayPillGeometry
	label: string
	stroke: string
	fill: string
	ink: string
}) {
	const width = delayPillWidth(label)
	return (
		<g transform={`translate(${pill.x} ${pill.y})`} data-testid="connection-delay-pill">
			<rect
				x={-width / 2}
				y={-DELAY_PILL_HEIGHT / 2}
				width={width}
				height={DELAY_PILL_HEIGHT}
				rx={DELAY_PILL_HEIGHT / 2}
				fill={fill}
				stroke={stroke}
				strokeWidth={1.3}
			/>
			<text
				x={0}
				y={4}
				textAnchor="middle"
				fontSize={12}
				fontWeight={700}
				fontFamily="'JetBrains Mono', ui-monospace, Menlo, monospace"
				fill={ink}
				style={{ userSelect: 'none' }}
			>
				{label}
			</text>
		</g>
	)
}

/**
 * The active-path rule for a cable, as Zach's many-to-one design states it.
 *
 * With an arm chosen, a cable fades when (i, ii) either end sits in a
 * non-chosen arm — the ends' own fade — or (iii) it lands on a port that a
 * live cable from the chosen arm also reaches, and does not come from that
 * arm itself: phi-resolution at the consumer, so an outside competitor reads
 * at 18% while the chosen arm's cable stays live. A control cable into a band
 * never fades by (iii): the condition is evaluated whichever arm runs. With no
 * arm chosen everything is full, and nothing is ever emphasised.
 */
export function connectionBranchFade(editor: Editor, connection: ConnectionShape | TLShapeId): number {
	const bindings = getConnectionBindings(editor, connection)
	const ends = endsBranchFade(editor, bindings)
	if (ends < 1) return ends
	const connectionId = typeof connection === 'string' ? connection : connection.id
	for (const binding of [bindings.start, bindings.end]) {
		if (!binding) continue
		const host = editor.getShape(binding.toId)
		if (!host || host.type !== 'block') continue
		const table = getBlockPortConnections(editor, host.id)
		const mine = table.find((entry) => entry.connectionId === connectionId)
		if (!mine || mine.ownPolarity !== 'sink') continue
		const myLevels = branchAncestry(editor, mine.connectedShapeId)
		for (const other of table) {
			if (other.connectionId === connectionId) continue
			if (other.ownPortId !== mine.ownPortId || other.ownPolarity !== 'sink') continue
			for (const level of branchAncestry(editor, other.connectedShapeId)) {
				const chosen = level.branch.props.activeArmId
				if (chosen === null || level.armId !== chosen) continue
				if (myLevels.some((own) => own.branch.id === level.branch.id && own.armId === chosen)) continue
				if (endsBranchFade(editor, getConnectionBindings(editor, other.connectionId)) < 1) continue
				return BRANCH_FADE_OPACITY
			}
		}
	}
	return 1
}

/** The lower of the two ends' Branch fades: a cable is as faded as either end. */
function endsBranchFade(editor: Editor, bindings: ReturnType<typeof getConnectionBindings>): number {
	let opacity = 1
	for (const binding of [bindings.start, bindings.end]) {
		if (!binding) continue
		opacity = Math.min(opacity, branchFadeOpacity(editor, binding.toId))
	}
	return opacity
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
	const { source, sink } = getConnectionEndpoints(editor, connection)
	// An authored route replaces the A*: the user owns the rails, and the
	// normalize pass re-binds the end segments to the live ports.
	if (connection.props.elbowRoute) {
		return authoredElbowRoute(connection.props.elbowRoute, source, sink)
	}
	return getElbowConnectionRoute(
		source,
		sink,
		getConnectionElbowBoxes(editor, connection),
		connection.props.pins,
	)
}

const connectionElbowRouteCache = createComputedCache(
	'connection elbow route',
	(editor: Editor, connection: ConnectionShape) => computeConnectionElbowRoute(editor, connection),
)

/**
 * The bound Blocks' boxes, in the cable's own space, as router obstacles.
 *
 * A face looks into one scope, and the Block it belongs to is only an obstacle
 * in the OTHER one: a cable leaving an outlet has to get out of the way of the
 * Block's card, but a cable arriving at that outlet from inside the frame is
 * already inside the box, and routing it around its own container is how an
 * elbow ends up wrapping the board. An inner face contributes no box.
 */
function getConnectionElbowBoxes(
	editor: Editor,
	connection: ConnectionShape,
): ConnectionElbowBoxes {
	const bindings = getConnectionBindings(editor, connection)
	const direction = getConnectionDirection(editor, connection)
	const inverse = Mat.Inverse(editor.getShapePageTransform(connection))
	const toLocalBox = (binding: ConnectionBinding | undefined) => {
		if (!binding || binding.props.face === 'inner') return null
		const bounds = editor.getShapePageBounds(binding.toId)
		if (!bounds) return null
		const topLeft = Mat.applyToPoint(inverse, { x: bounds.minX, y: bounds.minY })
		return { x: topLeft.x, y: topLeft.y, w: bounds.width, h: bounds.height }
	}
	return {
		start: toLocalBox(bindings[direction.sourceTerminal]),
		end: toLocalBox(bindings[direction.sinkTerminal]),
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
	return sampleConnectionPoints(editor, connection, CABLE_PROXIMITY_SAMPLES)
}

/**
 * The routed path as a polyline dense enough to place a mark on by arc length:
 * exact for an elbow or a straight cable, sampled for a curve.
 */
export function getConnectionRenderPoints(
	editor: Editor,
	connection: ConnectionShape,
): Vec[] {
	return sampleConnectionPoints(editor, connection, CABLE_RENDER_SAMPLES)
}

function sampleConnectionPoints(editor: Editor, connection: ConnectionShape, sampleCount: number): Vec[] {
	const { source, sink } = getConnectionEndpoints(editor, connection)
	const { routing, curve } = connection.props

	if (routing === 'elbow') {
		return getConnectionElbowRoute(editor, connection).points.map((point: { x: number; y: number }) =>
			Vec.From(point))
	}
	if (routing === 'straight' && !curve) return [Vec.From(source), Vec.From(sink)]

	const [cp1, cp2] = curve
		? getBentCurveCubicControlPoints(source, sink, curve)
		: getConnectionControlPoints(source, sink)
	const samples: Vec[] = []
	for (let step = 0; step <= sampleCount; step += 1) {
		const t = step / sampleCount
		const u = 1 - t
		samples.push(new Vec(
			u * u * u * source.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * sink.x,
			u * u * u * source.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * sink.y,
		))
	}
	return samples
}

/** Enough to keep the proximity answer smooth on a long curve, cheap to walk. */
const CABLE_PROXIMITY_SAMPLES = 24
/** Enough that a pill placed by arc length sits on the drawn curve, not beside it. */
const CABLE_RENDER_SAMPLES = 64

/** Resolve both handles in connection-local coordinates. */
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

/**
 * The cable's two ends by ROLE, in connection-local coordinates.
 *
 * Every route is drawn from the source to the sink: it leaves the source
 * heading +x and arrives at the sink heading +x, which is right for an output
 * on a right edge, an input on a left edge, and — because the polarity flips
 * with the face — for the inside of an inlet or an outlet just the same.
 */
export function getConnectionEndpoints(editor: Editor, connection: ConnectionShape) {
	const terminals = getConnectionTerminals(editor, connection)
	const direction = getConnectionDirection(editor, connection)
	return {
		source: terminals[direction.sourceTerminal],
		sink: terminals[direction.sinkTerminal],
		sourceTerminal: direction.sourceTerminal,
		sinkTerminal: direction.sinkTerminal,
	}
}

export function getConnectionShapePath(
	editor: Editor,
	connection: ConnectionShape,
): string {
	const { source, sink } = getConnectionEndpoints(editor, connection)
	return getConnectionPath(connection.props.routing, source, sink, {
		curve: connection.props.curve,
		route: connection.props.routing === 'elbow'
			? getConnectionElbowRoute(editor, connection)
			: undefined,
	})
}

/**
 * Offer a Block for a cable terminal that landed on nothing, and wire it up.
 *
 * The new Block goes into the scope the cable landed in — inside the Expanded
 * Block whose interior the pointer was over, or beside the cable's other end —
 * and is offset so its first port of the needed polarity lands exactly under
 * the cable end: the kit's placement rule, and the reason the result looks
 * deliberate rather than dropped. A declined offer deletes the cable, because a
 * half-bound cable is not a document state anything else can read.
 *
 * Returns false when the landing scope is one the anchored end cannot reach —
 * a cable from a Block on the page dropped inside some OTHER Expanded Block —
 * so the caller can discard the cable instead of offering the impossible.
 */
export function offerBlockForLooseTerminal(
	editor: Editor,
	connectionId: TLShapeId,
	terminal: ConnectionTerminal,
	scopeId: TLParentId,
): boolean {
	const connection = editor.getShape<ConnectionShape>(connectionId)
	if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) return false
	const anchoredBinding = getConnectionBindings(editor, connection)[oppositeConnectionTerminal(terminal)]
	if (!anchoredBinding) return false
	const anchor: PortDot = { shapeId: anchoredBinding.toId, portId: anchoredBinding.props.portId }
	const face = anchorFaceForScope(editor, anchor, scopeId)
	if (!face) return false
	setAnchoredFace(editor, anchoredBinding, face)
	const anchoredPolarity = connectionBindingPolarity(editor, { ...anchoredBinding, props: { ...anchoredBinding.props, face } })
	if (!anchoredPolarity) return false
	const needed = oppositePolarity(anchoredPolarity)

	const local = getConnectionTerminals(editor, connection)[terminal]
	const anchorPoint = editor.getShapePageTransform(connection).applyToPoint(local)

	openBlockPicker(editor, {
		connectionId,
		terminal,
		anchor: anchorPoint,
		wantsProducer: needed === 'source',
		scopeId,
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
				const props = blockPresetProps(preset, getDefaultBlockProps())
				const landing = firstOuterPortForPolarity(props, needed)
				if (!landing) {
					if (!connectionHasBothTerminals(editor, connectionId)) {
						editor.deleteShapes([connectionId])
					}
					return
				}
				// Position in the scope's own space: a child of an Expanded Block
				// is placed relative to that Block, exactly as a drawn one is.
				const origin = new Vec(anchorInPageSpace.x - landing.x, anchorInPageSpace.y - landing.y)
				const inParent = isShapeId(scopeId)
					? Mat.applyToPoint(Mat.Inverse(editor.getShapePageTransform(scopeId)), origin)
					: origin
				editor.createShape({
					id: blockId,
					type: BLOCK_SHAPE_TYPE,
					parentId: scopeId,
					x: inParent.x,
					y: inParent.y,
					props,
				})

				const created = editor.getShape<BlockShape>(blockId)
				if (!created) return
				createOrUpdateConnectionBinding(editor, connectionId, blockId, {
					portId: landing.id,
					face: 'outer',
					terminal,
				})
				if (!connectionHasBothTerminals(editor, connectionId)) {
					editor.deleteShapes([connectionId, blockId])
					return
				}
				normalizeConnectionDirection(editor, connectionId)
				adoptCableTypeIntoPills(editor, connectionId)
				editor.select(blockId)
			})
			// The Block arrives unnamed, and naming it is the next thing anyone
			// does — the same rule the Block tool already follows after a draw.
			if (editor.getShape(blockId)) requestBlockInlineEdit(editor, blockId, { kind: 'title' })
		},
	})
	return true
}

/** The scope a cable's welded end lives in from outside — where a tap's offer goes. */
export function outerScopeOf(editor: Editor, shapeId: TLShapeId): TLParentId {
	return blockScopeId(editor, shapeId)
}

/** Page bounds helper shared by tests and overlays. */
export function connectionPageBounds(editor: Editor, connectionId: TLShapeId): Box | null {
	return editor.getShapePageBounds(connectionId) ?? null
}
