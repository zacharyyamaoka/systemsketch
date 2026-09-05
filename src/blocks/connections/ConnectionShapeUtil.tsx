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
import {
	PORT_HOST_SHAPE_TYPES,
	getBlockConnectionPortPagePoint,
	getBlockPortConnections,
	getBlockPortDotAtPoint,
	getPortHostPort,
	isPortHostShape,
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
import { clearPortDragState, updatePortState } from '../ports/portState'
import {
	BLOCK_SHAPE_TYPE,
	BlockFieldDiff,
	BlockStateStyle,
	getDefaultBlockProps,
	isBlockShape,
	isEffectPort,
	isProjectionBlock,
	type BlockShape,
	type BlockState,
} from '../blockModel'
import {
	adoptCableTypeIntoProjection,
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
import { resolveConnectionSemanticRole } from './semanticRoles'
import { getSemanticTagsVisible } from '../semanticTagVisibility'
import {
	blocksThatWouldCycle,
	dropScopeAt,
	findConnectionTarget,
	firstOuterPortForPolarity,
} from './connectionRules'
import { anchorFaceForScope, blockScopeId } from './connectionScope'
import {
	ASYNC_PACKET_DASHARRAY,
	asyncDashOffsetForLength,
	cablePresentation,
	DELAY_DOT_GAP_PX,
	DELAY_DOT_PX,
	DELAY_PILL_HEIGHT,
	cablePillLabel,
	delayPillLabel,
	delayPillWidth,
	fractionNearest,
	PATH_LENGTH_UNITS,
	pointAtFraction,
	polylineLength,
	splitDashArrays,
} from './connectionPresentation'
import { tunnelDisplayState, tunnelVisualForPoints, type TunnelVisual } from './tunnelEdge'
import { getFocusedTunnelLayer } from './tunnelLayers'
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
import { showConnectorInteriorControls } from '../../connectorControlVisibility'
import {
	pinElbowSegment,
	type ElbowPin,
	type ElbowRoute,
	type ElbowSide,
} from '../elbow'
import {
	EFFECT_CABLE_INK,
	EFFECT_CABLE_WIDTH,
	EFFECT_PILL_LABEL,
	isEffectCable,
} from './effectCable'
import {
	cableMarkKind,
	diffCableDashArray,
	diffCableInk,
	diffCableOpacity,
	diffPresentation,
	diffVariantTraits,
	rewiredTerminals,
} from '../../diff/diffPresentation'
import { findFieldDiff } from '../../diff/fieldDiff'
import { wordDiff, type DiffToken } from '../../diff/wordDiff'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[CONNECTION_SHAPE_TYPE]: {
			start: VecModel
			end: VecModel
			routing: ConnectionRoutingKind
			/**
			 * The waypoint a dragged control point put on a curved or straight
			 * cable, as an offset from the endpoint midpoint. Stored relative so
			 * the bend rides with the Blocks. Null means no curved/straight bend.
			 */
			curve: ConnectionCurve | null
			/** Legacy/single-axis elbow rails; any non-empty set is person-authored. */
			pins: ElbowPin[]
			/**
			 * A resolved multi-elbow polyline. Automatic Tidy snapshots and
			 * person-authored routes share this geometry; `routeMode` owns it.
			 */
			elbowRoute: ConnectionElbowRouteModel | null
			/** Who owns the current routing geometry. Tidy may only replace automatic routes. */
			routeMode: 'automatic' | 'authored'
			/** Plain `data`, intermittent `async`, or one-iteration-late `delayed`. */
			temporal: ConnectionTemporalKind
			/** The initial value a delayed cable names in its pill, `= value`; empty = none. */
			delayValue: string
			/** Where the z⁻¹ pill sits, as a fraction of the cable's arc length. */
			pillPosition: number
			/** Hide the long run until this cable's context is focused. */
			tunnel: boolean
			/** Reusable layer name whose focus reveals this tunnel cable. */
			tunnelLayer: string
			/** The lens's verdict on this cable — see `BlockStateStyle`. */
			state: BlockState
			/**
			 * Every changed field as a before/after pair. `temporal`, `routing`
			 * and `delayValue` are the cable's own text; `start` and `end` carry
			 * the port ids a REWIRED terminal moved between, which is what makes
			 * rewired a different mark from a removal beside an addition.
			 */
			fieldDiffs?: BlockFieldDiff[]
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
	startLeg: T.number.optional(),
	endLeg: T.number.optional(),
})

export const connectionShapeProps: RecordProps<ConnectionShape> = {
	start: vecModelValidator,
	end: vecModelValidator,
	routing: ConnectionRoutingStyle,
	curve: T.object({ dx: T.number, dy: T.number }).nullable(),
	pins: T.arrayOf(elbowPinValidator),
	elbowRoute: elbowRouteValidator.nullable(),
	routeMode: T.literalEnum('automatic', 'authored'),
	temporal: ConnectionTemporalStyle,
	delayValue: T.string,
	pillPosition: T.number,
	tunnel: T.boolean,
	tunnelLayer: T.string,
	state: BlockStateStyle,
	fieldDiffs: T.arrayOf(BlockFieldDiff).optional(),
}

const connectionVersions = createShapePropsMigrationIds(CONNECTION_SHAPE_TYPE, {
	AddAuthoredRoutingGeometry: 1,
	AddTemporalQualifier: 2,
	AddRouteOwnership: 3,
	AddTunnelVisibility: 4,
	AddDiffState: 5,
	AddFieldDiffs: 6,
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
	}, {
		id: connectionVersions.AddRouteOwnership,
		up(props) {
			// Old files cannot distinguish a user pin from an old Tidy pin. Preserve
			// geometry rather than guessing: any stored bend migrates as authored.
			if (props.routeMode === undefined) {
				const pins = Array.isArray(props.pins) ? props.pins : []
				props.routeMode = props.curve !== null || props.elbowRoute !== null || pins.length > 0
					? 'authored'
					: 'automatic'
			}
		},
		down(props) {
			delete props.routeMode
		},
	}, {
		id: connectionVersions.AddTunnelVisibility,
		up(props) {
			if (props.tunnel === undefined) props.tunnel = false
			if (props.tunnelLayer === undefined) props.tunnelLayer = ''
		},
		down(props) {
			delete props.tunnel
			delete props.tunnelLayer
		},
	}, {
		id: connectionVersions.AddDiffState,
		up(props) {
			// The other half of the Block's DiffState migration: one vocabulary,
			// so a diff projector marks a cable exactly the way it marks a port.
			// A StyleProp cannot be optional, so every stored cable needs the
			// ordinary `normal` written in.
			if (props.state === undefined) props.state = 'normal'
		},
		down(props) {
			delete props.state
		},
	}, {
		id: connectionVersions.AddFieldDiffs,
		up() {
			// An ordinary optional prop: absent already means no lens.
		},
		down(props) {
			// Without the vocabulary a rewired cable would render as an ordinary
			// one landing on its new port, with no sign it used to land
			// somewhere else. Drop the lens rather than half-report it.
			delete props.fieldDiffs
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
			routeMode: 'automatic',
			temporal: 'data',
			delayValue: '',
			pillPosition: PILL_POSITION_DEFAULT,
			tunnel: false,
			tunnelLayer: '',
			state: 'normal',
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
		const cleared = { curve: null, pins: [], elbowRoute: null, routeMode: 'automatic' as const }
		return { ...next, props: { ...next.props, ...cleared } }
	}

	override canBind({ bindingType, fromShapeType, toShapeType }: Parameters<ShapeUtil['canBind']>[0]): boolean {
		return bindingType === 'connection'
			&& fromShapeType === CONNECTION_SHAPE_TYPE
			&& PORT_HOST_SHAPE_TYPES.includes(toShapeType)
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

		// A pill you can see is a pill you can drag — whichever it is. This used
		// to be gated on `delayed` alone, which is how `mut` came out visible but
		// stuck: the two marks are one object that differs only in its text.
		if (cablePillLabel({
			temporal: connection.props.temporal,
			delayValue: connection.props.delayValue,
			effect: isEffectCable(this.editor, connection),
		}) !== null) {
			const pill = pointAtFraction(
				getConnectionRenderPoints(this.editor, connection),
				clampPillPosition(connection.props.pillPosition),
			)
			handles.push({ id: 'pill', type: 'virtual', index: 'a1V' as IndexKey, x: pill.x, y: pill.y })
		}

		// Terminals (and the visible delay pill) stay available for the entire
		// selection. Only controls between the terminals follow the shared FigJam
		// route-rectangle reveal policy.
		if (!showConnectorInteriorControls(this.editor, connection.id)) return handles

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
				props: { curve, routeMode: 'authored' as const },
			}
		}

		// A dragged rail of an authored route, or an end segment of an auto route
		// (which grows a new rail and converts the cable to authored). Everything
		// runs in the dongle frame: the rails live between the two fixed port
		// legs, never touching the ports themselves.
		if (handle.id.startsWith('route:') || handle.id.startsWith('grow:')) {
			const { source, sink } = getConnectionEndpoints(this.editor, connection)
			if (
				this.activeRailDrag?.connectionId !== connection.id
				|| this.activeRailDrag?.handleId !== handle.id
			) {
				const resolved = getConnectionElbowRoute(this.editor, connection)
				const initialDongles = dongleEndpoints(source, sink, connection.props.elbowRoute ?? {})
				const model = connection.props.elbowRoute
					?? captureResolvedRoute(resolved.points, initialDongles.start, initialDongles.end)
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
			const dongles = dongleEndpoints(source, sink, base.model)
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
				props: {
					elbowRoute: captureAuthoredRoute(moved, dongles.start, dongles.end, base.model),
					routeMode: 'authored' as const,
				},
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
				props: { pins: pins as ElbowPin[], routeMode: 'authored' as const },
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
			// WHY: a whiteboard wire is a relationship, not permission to overwrite
			// an intentionally contradictory pill. The explicit “Adopt cable type”
			// command makes a requested derivation visible and undoable.
			normalizeConnectionDirection(this.editor, connection.id)
			adoptCableTypeIntoProjection(this.editor, connection.id)
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
		const points = getConnectionRenderPoints(this.editor, connection)
		const tunnel = connection.props.tunnel ? tunnelVisualForPoints(points, false) : null
		if (tunnel) {
			return (
				<g>
					<DataCablePath
						path={path}
						length={polylineLength(points)}
						temporal={connection.props.temporal}
						stroke="#475569"
						tunnel={tunnel}
					/>
					<TunnelVias tunnel={tunnel} stroke="#475569" fill="#ffffff" />
				</g>
			)
		}
		if (connection.props.temporal !== 'delayed') {
			const length = polylineLength(points)
			return <DataCablePath path={path} length={length} temporal={connection.props.temporal} stroke="#475569" />
		}
		const exportPillLabel = cablePillLabel({
			temporal: connection.props.temporal,
			delayValue: connection.props.delayValue,
			effect: isEffectCable(this.editor, connection),
		})
		const pill = delayPillGeometry(this.editor, connection)
		return (
			<g>
				<DelayedCablePaths path={path} pill={pill} solidBeforePill={cablePresentation.get().solidBeforePill} stroke="#475569" />
				<DelayPill pill={pill} label={exportPillLabel ?? delayPillLabel(connection.props.delayValue)} stroke="#475569" fill="#ffffff" ink="#1d2230" />
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
	const semanticTagsVisible = useValue(
		'connection semantic tag visibility',
		() => getSemanticTagsVisible(editor),
		[editor],
	)
	const semanticTag = useValue(
		'connection semantic tag',
		() => semanticTagsVisible ? resolveConnectionSemanticRole(editor, connection) : null,
		[editor, connection, semanticTagsVisible],
	)
	const solidBeforePill = useValue('solid before pill', () => cablePresentation.get().solidBeforePill, [])
	const pill = useValue(
		'delay pill geometry',
		() => (delayed ? delayPillGeometry(editor, connection) : null),
		[editor, connection, delayed],
	)
	// A cable leaving an effect port carries a value the call gave no name to, so
	// it is the only channel there is. Drawn warm and a shade heavier than a data
	// cable, and never in the near-black that control cables own.
	const effect = useValue(
		'effect cable',
		() => isEffectCable(editor, connection),
		[editor, connection.id],
	)
	// A lens somebody put on this document. A ghost cable — one the target
	// asserts and this board does not have — is the mark that makes a missing
	// connection legible where it is missing, rather than as an annotation
	// floating beside two Blocks.
	const diffState = connection.props.state ?? 'normal'
	const diffVariant = useValue('diff variant', () => diffPresentation.get().variant, [])
	const diffTraits = diffVariantTraits(diffVariant)
	// Which of the four findings this cable is. `fieldDiffs` is what makes
	// `rewired` reachable at all — the state enum alone cannot tell a moved
	// terminal from any other edit.
	const cableMark = cableMarkKind(diffState, connection.props.fieldDiffs)
	const stroke = diffCableInk(
		diffState,
		diffVariant,
		effect ? EFFECT_CABLE_INK : 'var(--tl-color-text-3, #475569)',
		cableMark,
	)
	const diffDash = diffCableDashArray(diffState)
	// One pill, wherever it comes from. `pill` above is the delayed case, which
	// also owns the split path; this is the same object for a cable that is only
	// an effect. Both ride `pillPosition` and both are draggable.
	const pillLabel = cablePillLabel({
		temporal: connection.props.temporal,
		delayValue: connection.props.delayValue,
		effect,
	})
	const effectPill = useValue(
		'effect pill geometry',
		() => (effect && !delayed ? delayPillGeometry(editor, connection) : null),
		[editor, connection, effect, delayed],
	)
	const tunnelState = useValue(
		'connection tunnel display',
		() => {
			const focusedLayer = getFocusedTunnelLayer(editor)
			// The ordinary case is neither tunneled nor under a layer lens. Avoid
			// collecting bindings and cloning the selection set for every plain cable
			// on every frame its endpoint moves.
			if (!connection.props.tunnel && !focusedLayer) return 'off'
			const bindings = getConnectionBindings(editor, connection)
			const selected = new Set(editor.getSelectedShapeIds())
			const hovered = editor.getHoveredShapeId()
			const endpointIds = [bindings.start?.toId, bindings.end?.toId]
				.filter((id): id is TLShapeId => id !== undefined)
			const edgeFocused = selected.has(connection.id) || hovered === connection.id
			return tunnelDisplayState({
				enabled: connection.props.tunnel,
				layer: connection.props.tunnelLayer,
				focusedLayer,
				contextFocused: edgeFocused
					|| endpointIds.some((id) => selected.has(id) || hovered === id)
					|| (edgeFocused && editor.isIn('select.dragging_handle')),
			})
		},
		[editor, connection.id, connection.props.tunnel, connection.props.tunnelLayer],
	)
	const needsRenderPoints = connection.props.temporal === 'async'
		|| tunnelState !== 'off'
		|| semanticTag?.effective?.role !== 'data'
		|| (cableMark === 'modified' && diffTraits.cable === 'endpoints')
	const renderPoints = useValue(
		'block connection render points',
		() => (needsRenderPoints ? getConnectionRenderPoints(editor, connection) : []),
		[editor, connection, needsRenderPoints],
	)
	const tunnelMouths = tunnelState === 'hidden' || tunnelState === 'preview'
		? tunnelVisualForPoints(renderPoints, false)
		: null
	const hiddenTunnel = tunnelState === 'hidden' ? tunnelMouths : null
	const paintedTunnelState = tunnelMouths || tunnelState === 'off'
		? tunnelState
		: 'revealed'
	// WHY: tags are authored in the spacious inspector, but canvas labels are a
	// board-wide reading aid; hiding them removes presentation, never meaning.
	const semanticTagLabel = semanticTag?.effective?.role !== 'data' ? semanticTag?.label : null
	// The delay/effect pill is draggable, so put the tag on the opposite side;
	// ordinary and modified cables reserve the middle for other existing chips.
	const semanticTagFraction = delayed || effect
		? connection.props.pillPosition < 0.5 ? 0.72 : 0.28
		: 0.72
	const semanticTagPoint = semanticTagLabel
		? pointAtFraction(renderPoints, semanticTagFraction)
		: null
	// A MODIFIED cable's was→now chip. Only built when the variant actually
	// draws a chip for it — `diffCableInk` above has already left the line's
	// own ink untouched for exactly this mark, so recolouring it here as well
	// would say the same thing twice and say nothing about *what* changed.
	const cableMarkChip = useValue(
		'cable mark chip',
		() => {
			if (cableMark !== 'modified' || diffTraits.cable !== 'chip') return null
			const fieldDiff = primaryCableFieldDiff(connection.props.fieldDiffs)
			if (!fieldDiff) return null
			// z⁻¹ already owns the cable's midpoint by default; a was→now chip
			// stacked on it there would be unreadable, so a delayed cable's chip
			// rides a quarter of the way along the run instead.
			const fraction = delayed ? CABLE_MARK_CHIP_FRACTION_DELAYED : CABLE_MARK_CHIP_FRACTION
			return { geometry: cableMarkChipGeometry(editor, connection, fraction), fieldDiff }
		},
		[editor, connection, cableMark, diffTraits.cable, delayed, connection.props.fieldDiffs],
	)
	// A REWIRED cable's terminal rings: a hollow ring at the port the terminal
	// used to be bound to, a filled one at where it lands now. Resolution can
	// fail — the old port's Block may itself be gone — and a terminal that
	// cannot be placed is skipped rather than guessed at.
	const cableRewireMarks = useValue(
		'cable rewire marks',
		() => {
			if (cableMark !== 'rewired') return []
			const marks: { terminal: ConnectionTerminal; oldAnchor: Vec; liveAnchor: Vec }[] = []
			for (const terminal of rewiredTerminals(connection.props.fieldDiffs)) {
				const fieldDiff = findFieldDiff(connection.props.fieldDiffs, terminal)
				if (!fieldDiff) continue
				const oldAnchor = resolveRewiredOldAnchor(editor, connection, terminal, fieldDiff.before)
				if (!oldAnchor) continue
				const points = getConnectionRenderPoints(editor, connection)
				const liveAnchor = terminal === 'start' ? points[0] : points[points.length - 1]
				if (!liveAnchor) continue
				marks.push({ terminal, oldAnchor, liveAnchor })
			}
			return marks
		},
		[editor, connection, cableMark, connection.props.fieldDiffs],
	)
	if (!delayed || !pill) {
		const length = polylineLength(renderPoints)
		return (
			<SVGContainer
				style={{ opacity: opacity * diffCableOpacity(diffState) }}
				data-temporal={connection.props.temporal}
				data-channel={effect ? 'effect' : 'return'}
				data-tunnel={paintedTunnelState}
				data-diff-state={diffState === 'normal' ? undefined : diffState}
				data-cable-mark={cableMark === 'none' ? undefined : cableMark}
			>
				<DataCablePath
					path={path}
					length={length}
					temporal={connection.props.temporal}
					stroke={stroke}
					strokeWidth={effect ? EFFECT_CABLE_WIDTH : undefined}
					tunnel={hiddenTunnel}
					dashArray={diffDash}
				/>
				{tunnelMouths ? <TunnelVias tunnel={tunnelMouths} stroke={stroke} fill="var(--ss-surface, #ffffff)" /> : null}
				{effectPill && !hiddenTunnel ? (
					<DelayPill
						pill={effectPill}
						label={pillLabel ?? EFFECT_PILL_LABEL}
						stroke={EFFECT_CABLE_INK}
						fill="var(--ss-surface, #ffffff)"
						ink={EFFECT_CABLE_INK}
					/>
				) : null}
				{semanticTagPoint && semanticTagLabel ? <SemanticTagPill point={semanticTagPoint} label={semanticTagLabel} /> : null}
				{cableMarkChip ? (
					<CableWasNowChip
						pill={cableMarkChip.geometry}
						before={cableMarkChip.fieldDiff.before}
						after={cableMarkChip.fieldDiff.after}
						connectionId={connection.id}
						monochrome={diffTraits.monochrome}
					/>
				) : null}
				{cableMark === 'modified' && diffTraits.cable === 'endpoints' ? (
					<CableModifiedEndpointMarks points={renderPoints} connectionId={connection.id} monochrome={diffTraits.monochrome} />
				) : null}
				{cableRewireMarks.length > 0 ? (
					<CableRewireRings marks={cableRewireMarks} connectionId={connection.id} monochrome={diffTraits.monochrome} />
				) : null}
			</SVGContainer>
		)
	}
	if (hiddenTunnel) {
		return (
			<SVGContainer
				style={{ opacity: opacity * diffCableOpacity(diffState) }}
				data-temporal="delayed"
				data-tunnel="hidden"
				data-diff-state={diffState === 'normal' ? undefined : diffState}
				data-cable-mark={cableMark === 'none' ? undefined : cableMark}
			>
				<DataCablePath path={path} length={polylineLength(renderPoints)} temporal="delayed" stroke={stroke} tunnel={hiddenTunnel} dashArray={diffDash} />
				<TunnelVias tunnel={hiddenTunnel} stroke={stroke} fill="var(--ss-surface, #ffffff)" />
			</SVGContainer>
		)
	}
	return (
		<SVGContainer
			style={{ opacity: opacity * diffCableOpacity(diffState) }}
			data-temporal="delayed"
			data-tunnel={paintedTunnelState}
			data-diff-state={diffState === 'normal' ? undefined : diffState}
			data-cable-mark={cableMark === 'none' ? undefined : cableMark}
		>
			<DelayedCablePaths path={path} pill={pill} solidBeforePill={solidBeforePill} stroke={stroke} />
			{tunnelMouths ? <TunnelVias tunnel={tunnelMouths} stroke={stroke} fill="var(--ss-surface, #ffffff)" /> : null}
			{semanticTagPoint && semanticTagLabel ? <SemanticTagPill point={semanticTagPoint} label={semanticTagLabel} /> : null}
			<DelayPill
				pill={pill}
				label={pillLabel ?? delayPillLabel(connection.props.delayValue)}
				stroke={stroke}
				fill="var(--ss-surface, #ffffff)"
				ink="var(--ss-text, #1d2230)"
			/>
			{cableMarkChip ? (
				<CableWasNowChip
					pill={cableMarkChip.geometry}
					before={cableMarkChip.fieldDiff.before}
					after={cableMarkChip.fieldDiff.after}
					connectionId={connection.id}
					monochrome={diffTraits.monochrome}
				/>
			) : null}
			{cableMark === 'modified' && diffTraits.cable === 'endpoints' ? (
				<CableModifiedEndpointMarks points={renderPoints} connectionId={connection.id} monochrome={diffTraits.monochrome} />
			) : null}
			{cableRewireMarks.length > 0 ? (
				<CableRewireRings marks={cableRewireMarks} connectionId={connection.id} monochrome={diffTraits.monochrome} />
			) : null}
		</SVGContainer>
	)
}

/**
 * The paths without a z⁻¹ pill. Keeping this one component behind both the
 * live canvas and `toSvg` makes the async cadence export exactly as drawn.
 */
export function DataCablePath({
	path,
	length,
	temporal,
	stroke,
	strokeWidth = 2,
	vectorEffect,
	tunnel,
	dashArray,
}: {
	path: string
	length: number
	temporal: ConnectionTemporalKind
	stroke: string
	strokeWidth?: number
	vectorEffect?: 'non-scaling-stroke'
	tunnel?: TunnelVisual | null
	/** A lens's dash, which outranks the cadence the cable's own kind draws. */
	dashArray?: string
}) {
	const async = temporal === 'async' && !tunnel
	return (
		<path
			d={path}
			fill="none"
			stroke={stroke}
			strokeLinecap={async && !dashArray ? 'butt' : 'round'}
			strokeLinejoin="round"
			strokeWidth={strokeWidth}
			strokeDasharray={dashArray ?? tunnel?.dashArray ?? (async ? ASYNC_PACKET_DASHARRAY : undefined)}
			strokeDashoffset={async && !dashArray ? asyncDashOffsetForLength(length) : undefined}
			vectorEffect={vectorEffect}
			data-edge-type={temporal}
		/>
	)
}

function TunnelVias({
	tunnel,
	stroke,
	fill,
}: {
	tunnel: TunnelVisual
	stroke: string
	fill: string
}) {
	return (
		<g className="ConnectionShape-tunnelVias" data-testid="connection-tunnel-vias">
			<circle cx={tunnel.startVia.x} cy={tunnel.startVia.y} r={4} fill={fill} stroke={stroke} strokeWidth={2} />
			<circle cx={tunnel.endVia.x} cy={tunnel.endVia.y} r={4} fill={fill} stroke={stroke} strokeWidth={2} />
		</g>
	)
}

export interface DelayPillGeometry {
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

/* ------------------------------ round-2 marks ----------------------------- */

/** Arc fraction for a MODIFIED cable's was→now chip on a plain or async cable. */
const CABLE_MARK_CHIP_FRACTION = 0.5
/**
 * z⁻¹ owns the midpoint by default (`PILL_POSITION_DEFAULT`), and a user may
 * have dragged it anywhere else along the run. A fixed quarter-point keeps the
 * chip clear of the common case without chasing the pill's live position.
 */
const CABLE_MARK_CHIP_FRACTION_DELAYED = 0.25
/** Radius of a REWIRED terminal's hollow-old / filled-live ring. */
const CABLE_MARK_RING_RADIUS = 6
/**
 * The three text fields a cable can be MODIFIED in. `start`/`end` are not
 * here — a terminal that moved is `rewired`, a more specific finding than
 * `modified`, and is read through `rewiredTerminals` instead.
 */
const CABLE_MODIFIED_FIELD_PATHS = ['temporal', 'delayValue', 'routing'] as const

/** The one field diff a modified cable's chip shows, in that priority order. */
function primaryCableFieldDiff(
	fieldDiffs: readonly BlockFieldDiff[] | undefined,
): BlockFieldDiff | undefined {
	for (const path of CABLE_MODIFIED_FIELD_PATHS) {
		const found = findFieldDiff(fieldDiffs, path)
		if (found) return found
	}
	return undefined
}

/**
 * The was→now chip's geometry, at an arbitrary arc fraction rather than the
 * z⁻¹ pill's own draggable `pillPosition` — the two marks answer different
 * questions and must be free to sit at different points on the same cable.
 */
function cableMarkChipGeometry(editor: Editor, connection: ConnectionShape, fraction: number): DelayPillGeometry {
	const points = getConnectionRenderPoints(editor, connection)
	const at = pointAtFraction(points, fraction)
	const length = polylineLength(points)
	return { x: at.x, y: at.y, length, dash: splitDashArrays(length, fraction) }
}

/**
 * Where a REWIRED terminal's old port sat, from nothing but its bare id.
 *
 * The terminal's current binding is tried first — a rewire that only moved
 * within the same Block is the common case. Failing that, every port-hosting
 * shape on the page is searched, because a rewire can retarget to a different
 * Block entirely and the id alone carries no host. Finding none is answered by
 * `null`, never a guess: the board diff contract forbids inventing a position.
 */
function resolveRewiredOldAnchor(
	editor: Editor,
	connection: ConnectionShape,
	terminal: ConnectionTerminal,
	portId: string,
): Vec | null {
	const bindings = getConnectionBindings(editor, connection)
	const currentBinding = terminal === 'start' ? bindings.start : bindings.end
	if (currentBinding) {
		const atCurrentHost = getBlockConnectionPortPagePoint(editor, currentBinding.toId, portId)
		if (atCurrentHost) return atCurrentHost
	}
	for (const shape of editor.getCurrentPageShapes()) {
		if (!isPortHostShape(shape)) continue
		const point = getBlockConnectionPortPagePoint(editor, shape, portId)
		if (point) return point
	}
	return null
}

/**
 * The delayed line: dotted end to end by default, or solid up to the pill
 * and dotted after it when the presentation switch says so. The split draws
 * the same smooth path twice with complementary dash arrays normalised to
 * `pathLength`, so a curve stays a curve.
 */
export function DelayedCablePaths({
	path,
	pill,
	solidBeforePill,
	stroke,
	strokeWidth = 2,
	vectorEffect,
}: {
	path: string
	pill: DelayPillGeometry
	solidBeforePill: boolean
	stroke: string
	strokeWidth?: number
	vectorEffect?: 'non-scaling-stroke'
}) {
	if (!solidBeforePill) {
		return (
			<path
				d={path}
				fill="none"
				stroke={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={strokeWidth}
				strokeDasharray={`${DELAY_DOT_PX} ${DELAY_DOT_GAP_PX}`}
				vectorEffect={vectorEffect}
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
				strokeWidth={strokeWidth}
				strokeDasharray={pill.dash.before}
				vectorEffect={vectorEffect}
				data-delay-segment="before"
			/>
			<path
				d={path}
				pathLength={PATH_LENGTH_UNITS}
				fill="none"
				stroke={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={strokeWidth}
				strokeDasharray={pill.dash.after}
				vectorEffect={vectorEffect}
				data-delay-segment="after"
			/>
		</>
	)
}

/** The z⁻¹ pill: a value store riding the cable, in the port default chip's grammar. */
export function DelayPill({
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

/** A read-only role cue; connection semantics remain resolved from its endpoints. */
function SemanticTagPill({ point, label }: { point: { x: number; y: number }; label: string }) {
	const width = delayPillWidth(label)
	return (
		<g transform={`translate(${point.x} ${point.y})`} data-testid="connection-semantic-tag" aria-label={`${label} semantic tag`} pointerEvents="none">
			<rect x={-width / 2} y={-DELAY_PILL_HEIGHT / 2} width={width} height={DELAY_PILL_HEIGHT} rx={DELAY_PILL_HEIGHT / 2} fill="var(--ss-surface, #ffffff)" stroke="var(--ss-accent, #2563eb)" strokeWidth={1.3} />
			<text x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', ui-monospace, Menlo, monospace" fill="var(--ss-accent, #2563eb)" style={{ userSelect: 'none' }}>{label}</text>
		</g>
	)
}

/**
 * A run of a word-diff token, drawn as its own tspan so only the runs that
 * actually differ carry a bolder, solid-coloured fill — the rest of the
 * chip's label stays in the ordinary text ink. This is the `was-now` variant's
 * own rule (see `diffPresentation.ts`), applied to a cable instead of a field.
 */
function CableChipRuns({
	tokens,
	changedFill,
	monochrome,
}: {
	tokens: readonly DiffToken[]
	changedFill: string
	monochrome: boolean
}) {
	return (
		<>
			{tokens.map((token, index) => {
				const changed = token.kind !== 'same'
				return (
					<tspan
						key={index}
						fill={changed ? changedFill : 'var(--ss-text)'}
						fontWeight={changed ? 800 : 400}
						textDecoration={monochrome && changed && token.kind === 'removed' ? 'line-through' : undefined}
					>
						{token.text}
					</tspan>
				)
			})}
		</>
	)
}

/**
 * The MODIFIED cable's was→now chip: the two chip halves `diff-gutter`'s
 * doc comment describes, at the cable's midpoint instead of a Block's row.
 * The line itself keeps its own ink (`diffCableInk` already leaves it alone
 * for this mark) — recolouring the whole run would make a renamed delay
 * indistinguishable from a rewire, which is the entire reason this mark
 * exists as its own chip rather than as another stroke colour.
 */
function CableWasNowChip({
	pill,
	before,
	after,
	connectionId,
	monochrome,
}: {
	pill: DelayPillGeometry
	before: string
	after: string
	connectionId: string
	monochrome: boolean
}) {
	const diff = wordDiff(before, after)
	if (!diff.changed) return null
	const beforeWidth = delayPillWidth(before)
	const afterWidth = delayPillWidth(after)
	const arrowWidth = 14
	const totalWidth = beforeWidth + afterWidth + arrowWidth
	const beforeX = -totalWidth / 2
	const arrowX = beforeX + beforeWidth + arrowWidth / 2
	const afterX = beforeX + beforeWidth + arrowWidth
	// No hue in `ghost-weight`: the former value keeps a fainter, dashed
	// outline and no wash; the current one gets the ordinary ink and a solid
	// outline. Unreachable today (`ghost-weight`'s cable trait is `line`, not
	// `chip`), kept so a future monochrome+chip variant is not silently wrong.
	const wasStroke = monochrome ? 'var(--ss-text-faint)' : 'var(--ss-danger)'
	const nowStroke = monochrome ? 'var(--ss-text)' : 'var(--ss-success)'
	const wasFill = monochrome ? 'none' : 'var(--ss-danger)'
	const nowFill = monochrome ? 'none' : 'var(--ss-success)'
	const textProps = {
		y: 4,
		textAnchor: 'middle' as const,
		fontSize: 11,
		fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
		style: { userSelect: 'none' as const },
	}
	return (
		<g
			transform={`translate(${pill.x} ${pill.y})`}
			data-testid={`cable-mark-modified-${connectionId.replace('shape:', '')}`}
		>
			<rect
				x={beforeX}
				y={-DELAY_PILL_HEIGHT / 2}
				width={beforeWidth}
				height={DELAY_PILL_HEIGHT}
				rx={DELAY_PILL_HEIGHT / 2}
				fill={wasFill}
				fillOpacity={monochrome ? undefined : 0.16}
				stroke={wasStroke}
				strokeWidth={1.3}
				strokeDasharray={monochrome ? '3 3' : undefined}
			/>
			<text {...textProps} x={beforeX + beforeWidth / 2}>
				<CableChipRuns tokens={diff.before} changedFill={wasStroke} monochrome={monochrome} />
			</text>
			<text {...textProps} x={arrowX} fill="var(--ss-text)">→</text>
			<rect
				x={afterX}
				y={-DELAY_PILL_HEIGHT / 2}
				width={afterWidth}
				height={DELAY_PILL_HEIGHT}
				rx={DELAY_PILL_HEIGHT / 2}
				fill={nowFill}
				fillOpacity={monochrome ? undefined : 0.16}
				stroke={nowStroke}
				strokeWidth={1.3}
			/>
			<text {...textProps} x={afterX + afterWidth / 2}>
				<CableChipRuns tokens={diff.after} changedFill={nowStroke} monochrome={monochrome} />
			</text>
		</g>
	)
}

/**
 * The `delta-badge` reading of a MODIFIED cable: no chip, no recoloured line —
 * just a small dot at each terminal saying "this cable changed", the same
 * quietness the Block face keeps at board zoom in that variant.
 */
function CableModifiedEndpointMarks({
	points,
	connectionId,
	monochrome,
}: {
	points: readonly Vec[]
	connectionId: string
	monochrome: boolean
}) {
	if (points.length === 0) return null
	const start = points[0]
	const end = points[points.length - 1]
	const ink = monochrome ? 'var(--ss-text)' : 'var(--ss-warning)'
	return (
		<g data-testid={`cable-mark-modified-${connectionId.replace('shape:', '')}`}>
			<circle cx={start.x} cy={start.y} r={3} fill={ink} />
			<circle cx={end.x} cy={end.y} r={3} fill={ink} />
		</g>
	)
}

/**
 * A REWIRED cable's terminal rings: hollow at the port a terminal used to
 * land on, filled at the one it lands on now. Drawn only for the terminal(s)
 * `rewiredTerminals` actually names, so a cable rewired at one end never marks
 * the end that never moved.
 */
function CableRewireRings({
	marks,
	connectionId,
	monochrome,
}: {
	marks: readonly { terminal: ConnectionTerminal; oldAnchor: Vec; liveAnchor: Vec }[]
	connectionId: string
	monochrome: boolean
}) {
	if (marks.length === 0) return null
	const oldInk = monochrome ? 'var(--ss-text-faint)' : 'var(--ss-danger)'
	const liveInk = monochrome ? 'var(--ss-text)' : 'var(--ss-success)'
	return (
		<g data-testid={`cable-mark-rewired-${connectionId.replace('shape:', '')}`}>
			{marks.map((mark) => (
				<g key={mark.terminal}>
					<circle
						cx={mark.oldAnchor.x}
						cy={mark.oldAnchor.y}
						r={CABLE_MARK_RING_RADIUS}
						fill="none"
						stroke={oldInk}
						strokeWidth={2}
						strokeDasharray={monochrome ? '3 3' : undefined}
						data-rewire-terminal={mark.terminal}
						data-rewire-anchor="old"
					/>
					<circle
						cx={mark.liveAnchor.x}
						cy={mark.liveAnchor.y}
						r={CABLE_MARK_RING_RADIUS}
						fill={liveInk}
						stroke={liveInk}
						strokeWidth={2}
						data-rewire-terminal={mark.terminal}
						data-rewire-anchor="live"
					/>
				</g>
			))}
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
	const portFor = (binding: ConnectionBinding | undefined) => (
		binding ? getPortHostPort(editor, binding.toId, binding.props.portId) : null
	)
	const toLocalBox = (binding: ConnectionBinding | undefined) => {
		if (!binding || binding.props.face === 'inner') return null
		// A face that looks into its own host contributes no box, for exactly the
		// reason an inner face does not: the cable starts inside the thing it
		// would otherwise be routed around. The Loop's item outlet is such a face.
		if (portFor(binding)?.facesInward) return null
		const bounds = editor.getShapePageBounds(binding.toId)
		if (!bounds) return null
		const topLeft = Mat.applyToPoint(inverse, { x: bounds.minX, y: bounds.minY })
		return { x: topLeft.x, y: topLeft.y, w: bounds.width, h: bounds.height }
	}
	// Which edge each terminal sits on. Neither side special-cases a port kind:
	// the port table answers, because whatever placed the dot already knew its
	// edge. An effect output says `top`, a Loop's item outlet says `bottom`, and
	// every ordinary lane says nothing and takes the default below.
	const source = bindings[direction.sourceTerminal]
	const sink = bindings[direction.sinkTerminal]
	return {
		start: toLocalBox(source),
		end: toLocalBox(sink),
		startSide: portFor(source)?.elbowSide,
		endSide: portFor(sink)?.elbowSide,
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
				// Keep a picker-created cable as manual as a hand-drawn one; the same
				// explicit command is the only path that copies its type into a pill.
				normalizeConnectionDirection(editor, connectionId)
				adoptCableTypeIntoProjection(editor, connectionId)
				editor.select(blockId)
			})
			// The Block arrives unnamed, and naming it is the next thing anyone
			// does — the same rule the Block tool already follows after a draw.
			// A projection is the exception: it named itself from the type on the
			// cable, so asking for a title would invite overwriting a derived fact.
			// What it wants typed is the member, so its first row gets the caret.
			const placed = editor.getShape<BlockShape>(blockId)
			if (!placed) return
			const derived = isProjectionBlock(placed.props) && placed.props.title !== ''
			const firstRow = placed.props.outputs[0]
			if (derived && firstRow) {
				requestBlockInlineEdit(editor, blockId, {
					kind: 'portName',
					side: 'outputs',
					portId: firstRow.id,
				})
			} else {
				requestBlockInlineEdit(editor, blockId, { kind: 'title' })
			}
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
