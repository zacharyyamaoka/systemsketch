import {
	Vec,
	createComputedCache,
	type Editor,
	type TLShapeId,
	type VecLike,
} from 'tldraw'
import { isBlockShape, type BlockShape, type BlockShapeProps } from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import { portSnapPageUnits } from './connectionHit'
import {
	CONNECTION_BINDING_TYPE,
	portPolarity,
	type BlockPortLane,
	type ConnectionTerminal,
	type PortFace,
	type PortPolarity,
} from './connectionModel'
import { getConnectionBindings, type ConnectionBinding } from './ConnectionBindingUtil'

/**
 * A screen-space magnet, kept as the floor under the hit profile's page-unit
 * radius so a drop still feels the same at deep zoom-out.
 */
export const CONNECTION_PORT_MAGNET_RADIUS = 13

/**
 * A port as the connection layer sees it: identity plus where its dot is.
 *
 * There is exactly one of these per port. A port has no direction of its own
 * here — `portPolarity(side, face)` answers that once a face is chosen, and
 * the face is chosen by where the cable's other end is, never by the port.
 */
export interface BlockConnectionPort {
	id: string
	name: string
	type: string
	side: BlockPortLane
	/** Hidden ports retain identity and a fallback anchor, but are never hit targets. */
	hidden: boolean
	/** Centre in Block-local coordinates. */
	x: number
	y: number
	/** The same centre in normalized Block coordinates. */
	anchor: { x: number; y: number }
	/** Simple-view ports keep their geometry but use a quiet affordance. */
	subtle: boolean
}

/**
 * Project semantic port identity onto the canonical Block layout.
 *
 * Hidden ports deliberately keep a fallback anchor so view-level information
 * hiding is non-destructive: their existing cables remain attached, while hit
 * testing and new connection gestures continue to ignore them.
 */
export function getBlockConnectionPorts(
	props: BlockShapeProps,
	options: { includeHidden?: boolean } = {},
): BlockConnectionPort[] {
	const layout = layoutBlock(props)
	const placedById = new Map(layout.ports.map((placed) => [placed.port.id, placed]))

	const ports = ([
		['input', props.inputs],
		['output', props.outputs],
	] as const).flatMap(([side, lane]) => {
		const firstVisible = layout.ports.find((placed) => placed.side === side)
		const fallback = firstVisible ?? {
			x: side === 'input' ? 0 : layout.bounds.w,
			y: layout.bounds.h / 2,
			subtle: true,
		}
		return lane.map((port) => {
			const placed = placedById.get(port.id)
			const point = placed ?? fallback
			return {
				id: port.id,
				name: port.name,
				type: port.type,
				side,
				hidden: !port.visible,
				x: point.x,
				y: point.y,
				anchor: {
					x: point.x / layout.bounds.w,
					y: point.y / layout.bounds.h,
				},
				subtle: point.subtle,
			}
		})
	})

	return options.includeHidden ? ports : ports.filter((port) => !port.hidden)
}

/**
 * The cached port table for a live Block.
 *
 * tldraw's computed cache re-evaluates only when the Block record changes, so
 * the port dot, the drag hit test, the connected-state read and the binding
 * position all resolve the same projection without recomputing the layout per
 * pointer move.
 */
const blockPortsCache = createComputedCache('block ports', (_editor: Editor, block: BlockShape) => (
	getBlockConnectionPorts(block.props, { includeHidden: true })
))

/**
 * The cache is a memo over a pure projection, never the truth.
 *
 * `createComputedCache` needs a live store, which an editor assembled for a
 * pure unit test does not have. Falling through to the projection keeps the
 * answer identical and costs a layout pass, so no caller has to know which kind
 * of editor it holds.
 */
export function getLiveBlockPorts(
	editor: Editor,
	shape: BlockShape | TLShapeId,
): BlockConnectionPort[] {
	const block = typeof shape === 'string' ? editor.getShape(shape) : shape
	if (!isBlockShape(block)) return []
	if (!editor.store) return getBlockConnectionPorts(block.props, { includeHidden: true })
	return blockPortsCache.get(editor, block.id) ?? []
}

/** Resolve identity back to live geometry, hidden or not. */
export function getBlockConnectionPort(
	props: BlockShapeProps,
	portId: string,
): BlockConnectionPort | null {
	return getBlockConnectionPorts(props, { includeHidden: true })
		.find((port) => port.id === portId) ?? null
}

/** The page-space position of a named port, hidden or not. */
export function getBlockConnectionPortPagePoint(
	editor: Editor,
	shape: BlockShape | TLShapeId,
	portId: string,
): Vec | null {
	const block = typeof shape === 'string' ? editor.getShape(shape) : shape
	if (!isBlockShape(block)) return null
	const port = getLiveBlockPorts(editor, block.id).find((candidate) => candidate.id === portId)
	if (!port) return null
	return editor.getShapePageTransform(block.id).applyToPoint(port)
}

/* ----------------------------- the wiring table ---------------------------- */

export interface BlockPortConnection {
	connectionId: TLShapeId
	/** Which handle of the cable this Block holds — what a reconnect drags. */
	terminal: ConnectionTerminal
	ownPortId: string
	ownFace: PortFace
	ownSide: BlockPortLane
	ownPolarity: PortPolarity
	connectedShapeId: TLShapeId
	connectedPortId: string
	connectedFace: PortFace
	connectedSide: BlockPortLane
	connectedPolarity: PortPolarity
}

/**
 * The cached table of cables welded to a Block, from the binding records.
 *
 * One reader for "is this port wired", for the eligible/hinting affordances,
 * for the replace-an-occupied-sink rule and for the cycle walk, so the dot and
 * the document cannot disagree about what is connected.
 *
 * The derive reads the LIVE record rather than the one the cache hands it: a
 * by-id equality shortcut would pin the Block's props to whatever they were
 * when the entry was first made, and a port added after that would never
 * resolve — a wired dot that stays hollow, measured on 2026-09-01.
 */
const blockPortConnectionsCache = createComputedCache(
	'block port connections',
	(editor: Editor, cached: BlockShape): BlockPortConnection[] => {
		const block = editor.getShape(cached.id)
		if (!isBlockShape(block)) return []
		const ownPorts = getLiveBlockPorts(editor, block)
		const bindings = editor.getBindingsToShape<ConnectionBinding>(block.id, CONNECTION_BINDING_TYPE)
		const connections: BlockPortConnection[] = []
		for (const binding of bindings) {
			const opposite = binding.props.terminal === 'start' ? 'end' : 'start'
			const oppositeBinding = getConnectionBindings(editor, binding.fromId)[opposite]
			if (!oppositeBinding) continue
			const ownPort = ownPorts.find((port) => port.id === binding.props.portId)
			const connectedShape = editor.getShape(oppositeBinding.toId)
			const connectedPort = isBlockShape(connectedShape)
				? getLiveBlockPorts(editor, connectedShape).find((port) => port.id === oppositeBinding.props.portId)
				: undefined
			if (!ownPort || !connectedPort) continue
			connections.push({
				connectionId: binding.fromId,
				terminal: binding.props.terminal,
				ownPortId: binding.props.portId,
				ownFace: binding.props.face,
				ownSide: ownPort.side,
				ownPolarity: portPolarity(ownPort.side, binding.props.face),
				connectedShapeId: oppositeBinding.toId,
				connectedPortId: oppositeBinding.props.portId,
				connectedFace: oppositeBinding.props.face,
				connectedSide: connectedPort.side,
				connectedPolarity: portPolarity(connectedPort.side, oppositeBinding.props.face),
			})
		}
		return connections
	},
)

export function getBlockPortConnections(
	editor: Editor,
	shape: BlockShape | TLShapeId,
): BlockPortConnection[] {
	const id = typeof shape === 'string' ? shape : shape.id
	if (!editor.store) return []
	return blockPortConnectionsCache.get(editor, id) ?? []
}

/** True when either face of a dot carries a cable. */
export function blockPortIsConnected(
	editor: Editor,
	shape: BlockShape | TLShapeId,
	portId: string,
): boolean {
	return getBlockPortConnections(editor, shape).some((connection) => connection.ownPortId === portId)
}

/* ------------------------------ dot hit testing ---------------------------- */

export interface BlockPortDotHit {
	shape: BlockShape
	shapeId: TLShapeId
	port: BlockConnectionPort
	pagePoint: Vec
	distance: number
}

/**
 * Every visible dot within reach of a page point, nearest first.
 *
 * React Flow's per-port model: a radius around each port anchor rather than
 * "the nearest port of whatever card the pointer is inside", so a drop never
 * binds to a port you were nowhere near. The radius comes from the active hit
 * profile in page units, floored by the old screen-space magnet so the target
 * does not vanish when zoomed far out.
 *
 * Simple view is the one case the pure per-port model cannot serve: its ports
 * are `subtle` — live but undrawn — and you cannot aim at a dot that is not
 * there. For those the card itself is the target, and only when no visible dot
 * on any Block is within reach.
 *
 * This answers geometry only. Which of the candidates a cable may actually
 * land on is the rules' question — see `findConnectionTarget`.
 */
export function getBlockPortDotsNear(
	editor: Editor,
	pagePoint: VecLike,
	options: { screenRadius?: number; pageRadius?: number } = {},
): BlockPortDotHit[] {
	const zoom = editor.getZoomLevel()
	const radius = options.pageRadius
		?? Math.max(
			portSnapPageUnits(zoom),
			(options.screenRadius ?? CONNECTION_PORT_MAGNET_RADIUS) / (zoom > 0 ? zoom : 1),
		)

	const visible: BlockPortDotHit[] = []
	const cards: BlockPortDotHit[] = []

	// Topmost first, so an exact tie resolves to the shape on top.
	const shapes = editor.getCurrentPageShapesSorted()
	for (let index = shapes.length - 1; index >= 0; index -= 1) {
		const shape = shapes[index]
		if (!isBlockShape(shape) || shape.isLocked || editor.isShapeHidden(shape)) continue

		const bounds = editor.getShapePageBounds(shape.id)
		if (!bounds) continue
		if (
			pagePoint.x < bounds.minX - radius || pagePoint.x > bounds.maxX + radius
			|| pagePoint.y < bounds.minY - radius || pagePoint.y > bounds.maxY + radius
		) continue
		const inside = pagePoint.x >= bounds.minX && pagePoint.x <= bounds.maxX
			&& pagePoint.y >= bounds.minY && pagePoint.y <= bounds.maxY

		const transform = editor.getShapePageTransform(shape.id)
		let sawVisible = false
		const onCard: BlockPortDotHit[] = []

		for (const port of getLiveBlockPorts(editor, shape)) {
			if (port.hidden) continue
			const point = transform.applyToPoint(port)
			const distance = Vec.Dist(point, pagePoint)
			const hit: BlockPortDotHit = { shape, shapeId: shape.id, port, pagePoint: point, distance }
			if (!port.subtle) {
				sawVisible = true
				if (distance <= radius) visible.push(hit)
			}
			onCard.push(hit)
		}

		if (!sawVisible && inside) cards.push(...onCard)
	}

	const byDistance = (a: BlockPortDotHit, b: BlockPortDotHit) => a.distance - b.distance
	visible.sort(byDistance)
	cards.sort(byDistance)
	return visible.length > 0 ? visible : cards
}

/** The single nearest visible dot within reach — for a press or a right-click. */
export function getBlockPortDotAtPoint(
	editor: Editor,
	pagePoint: VecLike,
	options: { screenRadius?: number; pageRadius?: number } = {},
): BlockPortDotHit | null {
	return getBlockPortDotsNear(editor, pagePoint, options)[0] ?? null
}
