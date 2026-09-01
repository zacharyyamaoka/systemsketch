import {
	Vec,
	createComputedCache,
	type Editor,
	type TLShapeId,
	type VecLike,
} from 'tldraw'
import {
	INNER_PORT_SUFFIX,
	innerPortId,
	isBlockShape,
	isInnerPortId,
	type BlockShape,
	type BlockShapeProps,
} from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import { portSnapPageUnits } from './connectionHit'
import {
	CONNECTION_BINDING_TYPE,
	terminalForBlockPortSide,
	type ConnectionTerminal,
} from './connectionModel'
import { getConnectionBindings, type ConnectionBinding } from './ConnectionBindingUtil'

/**
 * A screen-space magnet, kept as the floor under the hit profile's page-unit
 * radius so a drop still feels the same at deep zoom-out.
 */
export const CONNECTION_PORT_MAGNET_RADIUS = 13

export interface BlockConnectionPort {
	id: string
	name: string
	type: string
	side: 'input' | 'output'
	terminal: ConnectionTerminal
	/** Hidden ports retain identity and a fallback anchor, but are never hit targets. */
	hidden: boolean
	/** Centre in Block-local coordinates. */
	x: number
	y: number
	/** The same centre in normalized Block coordinates. */
	anchor: { x: number; y: number }
	/** Simple-view ports keep their geometry but use a quiet affordance. */
	subtle: boolean
	/**
	 * The INNER face of a boundary port — the derived `…__inner` twin with the
	 * flipped terminal at the same anchor, live only in the Expanded view. It
	 * draws no dot of its own; the outer dot carries the union of both faces.
	 */
	inner: boolean
}

/**
 * Derive the inner-face twin of every projected port.
 *
 * The twin shares the anchor and flips the terminal, so a drag that leaves the
 * inside of an Expanded Block finds a legal counterpart on its own boundary.
 * Outside `expanded` the twin is hidden rather than absent: a cable welded to
 * an inner face must survive Simple ↔ Port ↔ Expanded without dangling.
 */
function withInnerFaces(
	ports: BlockConnectionPort[],
	view: BlockShapeProps['view'],
): BlockConnectionPort[] {
	const inside = view === 'expanded'
	return ports.flatMap((port) => [
		port,
		{
			...port,
			id: innerPortId(port.id),
			terminal: port.terminal === 'start' ? ('end' as const) : ('start' as const),
			hidden: port.hidden || !inside,
			inner: true,
		},
	])
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

	const outer = ([
		['input', props.inputs],
		['output', props.outputs],
	] as const).flatMap(([side, ports]) => {
		const firstVisible = layout.ports.find((placed) => placed.side === side)
		const fallback = firstVisible ?? {
			x: side === 'input' ? 0 : layout.bounds.w,
			y: layout.bounds.h / 2,
			subtle: true,
		}
		return ports.map((port) => {
			const placed = placedById.get(port.id)
			const point = placed ?? fallback
			return {
				id: port.id,
				name: port.name,
				type: port.type,
				side,
				terminal: terminalForBlockPortSide(side),
				hidden: !port.visible,
				x: point.x,
				y: point.y,
				anchor: {
					x: point.x / layout.bounds.w,
					y: point.y / layout.bounds.h,
				},
				subtle: point.subtle,
				inner: false,
			}
		})
	})

	const all = withInnerFaces(outer, props.view)
	return options.includeHidden ? all : all.filter((port) => !port.hidden)
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

/** Resolve identity back to live geometry, optionally checking its terminal. */
export function getBlockConnectionPort(
	props: BlockShapeProps,
	portId: string,
	terminal?: ConnectionTerminal,
): BlockConnectionPort | null {
	return getBlockConnectionPorts(props, { includeHidden: true }).find((port) => (
		port.id === portId && (terminal === undefined || port.terminal === terminal)
	)) ?? null
}

/** The inner-face twin of a visible boundary port, when that face is live. */
export function getBlockInnerFace(
	ports: readonly BlockConnectionPort[],
	portId: string,
): BlockConnectionPort | null {
	const twin = ports.find((port) => port.id === `${portId}${INNER_PORT_SUFFIX}`)
	return twin && !twin.hidden ? twin : null
}

/**
 * Which face a press on a boundary dot starts a cable from.
 *
 * Inside an Expanded Block the dot wires the INSIDE: the inner face is the one
 * an internal drag can land on at both ends. Cables to the page are still made
 * from the other Block's dot, exactly as before. This is the single rule — the
 * DOM listener and the painted dot must not each decide it, or whichever runs
 * last silently wins.
 */
export function activeBlockPortFace(
	editor: Editor,
	shape: BlockShape | TLShapeId,
	portId: string,
): BlockConnectionPort | null {
	const ports = getLiveBlockPorts(editor, shape)
	const inner = getBlockInnerFace(ports, portId)
	if (inner) return inner
	return ports.find((port) => port.id === portId && !port.hidden) ?? null
}

/** Every port id that shares a boundary dot with `portId` — itself plus its twin. */
export function blockPortFaceIds(portId: string): string[] {
	return isInnerPortId(portId)
		? [portId, portId.slice(0, -INNER_PORT_SUFFIX.length)]
		: [portId, innerPortId(portId)]
}

export interface BlockPortConnection {
	connectionId: TLShapeId
	connectedShapeId: TLShapeId
	connectedPortId: string
	/** Which terminal of the cable this Block owns. */
	terminal: ConnectionTerminal
	ownPortId: string
}

/**
 * The cached table of cables welded to a Block, from the binding records.
 *
 * One reader for "is this port wired", for the eligible/hinting affordances and
 * for the replace-an-occupied-input rule, so the dot and the document cannot
 * disagree about what is connected.
 */
const blockPortConnectionsCache = createComputedCache(
	'block port connections',
	(editor: Editor, block: BlockShape): BlockPortConnection[] => {
		const bindings = editor.getBindingsToShape<ConnectionBinding>(block.id, CONNECTION_BINDING_TYPE)
		const connections: BlockPortConnection[] = []
		for (const binding of bindings) {
			const opposite = binding.props.terminal === 'start' ? 'end' : 'start'
			const oppositeBinding = getConnectionBindings(editor, binding.fromId)[opposite]
			if (!oppositeBinding) continue
			connections.push({
				connectionId: binding.fromId,
				connectedShapeId: oppositeBinding.toId,
				connectedPortId: oppositeBinding.props.portId,
				terminal: binding.props.terminal,
				ownPortId: binding.props.portId,
			})
		}
		return connections
	},
	{ areRecordsEqual: (a, b) => a.id === b.id },
)

export function getBlockPortConnections(
	editor: Editor,
	shape: BlockShape | TLShapeId,
): BlockPortConnection[] {
	const id = typeof shape === 'string' ? shape : shape.id
	if (!editor.store) return []
	return blockPortConnectionsCache.get(editor, id) ?? []
}

/** True when either face of a boundary dot carries a cable. */
export function blockPortIsConnected(
	editor: Editor,
	shape: BlockShape | TLShapeId,
	portId: string,
): boolean {
	const faces = new Set(blockPortFaceIds(portId))
	return getBlockPortConnections(editor, shape).some((connection) => faces.has(connection.ownPortId))
}

export interface BlockConnectionPortHit {
	shape: BlockShape
	shapeId: TLShapeId
	port: BlockConnectionPort
	pagePoint: Vec
	distance: number
	/** Cables already welded to this exact port, excluding none. */
	existingConnections: BlockPortConnection[]
}

/**
 * Which port a dropped cable end lands on: React Flow's per-port model.
 *
 * A radius around each port anchor rather than "the nearest port of whatever
 * card the pointer is inside", so a drop never binds to a port you were nowhere
 * near — the failure mode of the card model on a tall Block. The radius comes
 * from the active hit profile in page units, floored by the old screen-space
 * magnet so the target does not vanish when zoomed far out.
 *
 * Simple view is the one case the pure per-port model cannot serve: its ports
 * are `subtle` — live but undrawn — and you cannot aim at a dot that is not
 * there. For those the card itself is the fallback target, and only when no
 * visible port won first.
 */
/**
 * Which face of a boundary dot a cable coming FROM `fromShapeId` may land on.
 *
 * A boundary port is a member of two scopes, and a cable belongs to exactly one
 * of them. If the cable's other end is inside this Block, the cable is internal
 * wiring and must meet the INNER face; if it is anywhere else, the cable is on
 * the page side and must meet the OUTER one. Without this rule both faces are
 * live at the same coordinate and the terminal filter alone will happily accept
 * `decode.out → run.in` — data leaving the box through its own inlet.
 *
 * With no known origin (a cable whose other end is not yet bound) every face
 * stays eligible: there is no scope to compare against yet.
 */
function faceIsInScope(
	editor: Editor,
	port: BlockConnectionPort,
	blockId: TLShapeId,
	fromShapeId: TLShapeId | undefined,
): boolean {
	if (!fromShapeId) return true
	const from = editor.getShape(fromShapeId)
	const internal = fromShapeId === blockId
		|| (from !== undefined && editor.hasAncestor(from, blockId))
	return port.inner ? internal : !internal
}

export function getBlockConnectionPortAtPoint(
	editor: Editor,
	pagePoint: VecLike,
	options: {
		terminal?: ConnectionTerminal
		screenRadius?: number
		pageRadius?: number
		/** The Block the cable's other end is bound to, for the scope rule above. */
		fromShapeId?: TLShapeId
	} = {},
): BlockConnectionPortHit | null {
	const zoom = editor.getZoomLevel()
	const radius = options.pageRadius
		?? Math.max(
			portSnapPageUnits(zoom),
			(options.screenRadius ?? CONNECTION_PORT_MAGNET_RADIUS) / (zoom > 0 ? zoom : 1),
		)

	let best: BlockConnectionPortHit | null = null
	// The card fallback, gathered on the same pass.
	let fallback: BlockConnectionPortHit | null = null

	// Topmost wins an exact tie. Distance still outranks z-order.
	const shapes = editor.getCurrentPageShapesSorted()
	for (let index = shapes.length - 1; index >= 0; index -= 1) {
		const shape = shapes[index]
		if (!isBlockShape(shape) || shape.isLocked || editor.isShapeHidden(shape)) continue

		const bounds = editor.getShapePageBounds(shape.id)
		if (!bounds) continue
		// Plain arithmetic rather than Box.containsPoint: this is a broad phase and
		// the only thing it needs from the caller is four numbers.
		if (
			pagePoint.x < bounds.minX - radius || pagePoint.x > bounds.maxX + radius
			|| pagePoint.y < bounds.minY - radius || pagePoint.y > bounds.maxY + radius
		) continue
		const inside = pagePoint.x >= bounds.minX && pagePoint.x <= bounds.maxX
			&& pagePoint.y >= bounds.minY && pagePoint.y <= bounds.maxY

		const transform = editor.getShapePageTransform(shape.id)
		let sawVisible = false
		let nearestOnCard: BlockConnectionPortHit | null = null

		for (const port of getLiveBlockPorts(editor, shape)) {
			if (port.hidden) continue
			if (options.terminal !== undefined && port.terminal !== options.terminal) continue
			if (!faceIsInScope(editor, port, shape.id, options.fromShapeId)) continue
			const point = transform.applyToPoint(port)
			const distance = Vec.Dist(point, pagePoint)
			const hit: BlockConnectionPortHit = {
				shape,
				shapeId: shape.id,
				port,
				pagePoint: point,
				distance,
				existingConnections: [],
			}
			if (!port.subtle) {
				sawVisible = true
				if (distance <= radius && (best === null || distance < best.distance)) best = hit
			}
			if (nearestOnCard === null || distance < nearestOnCard.distance) nearestOnCard = hit
		}

		if (!sawVisible && inside && nearestOnCard
			&& (fallback === null || nearestOnCard.distance < fallback.distance)) {
			fallback = nearestOnCard
		}
	}

	const resolved = best ?? fallback
	if (!resolved) return null
	const faces = new Set(blockPortFaceIds(resolved.port.id))
	return {
		...resolved,
		existingConnections: getBlockPortConnections(editor, resolved.shapeId)
			.filter((connection) => faces.has(connection.ownPortId)),
	}
}

/** The page-space position of a named, visible port. */
export function getBlockConnectionPortPagePoint(
	editor: Editor,
	shape: BlockShape | TLShapeId,
	portId: string,
	terminal?: ConnectionTerminal,
): Vec | null {
	const block = typeof shape === 'string' ? editor.getShape(shape) : shape
	if (!isBlockShape(block)) return null
	const port = getLiveBlockPorts(editor, block.id).find((candidate) => (
		candidate.id === portId && (terminal === undefined || candidate.terminal === terminal)
	))
	if (!port) return null
	return editor.getShapePageTransform(block.id).applyToPoint(port)
}

/**
 * Walk the connection graph from a Block in one direction.
 *
 * Used for the cycle veto. Hierarchy edges — a cable on either endpoint's INNER
 * face — are excluded, because this walk is flat and would read "child feeds its
 * own parent's outlet" as a loop when that is the hierarchy working as designed.
 */
export function getAllConnectedBlocks(
	editor: Editor,
	start: TLShapeId,
	direction?: ConnectionTerminal,
): Set<TLShapeId> {
	const toVisit: TLShapeId[] = [start]
	const found = new Set<TLShapeId>()

	while (toVisit.length > 0) {
		const id = toVisit.shift()
		if (!id || found.has(id)) continue
		const shape = editor.getShape(id)
		if (!isBlockShape(shape)) continue
		found.add(id)

		for (const connection of getBlockPortConnections(editor, id)) {
			if (direction && connection.terminal !== direction) continue
			if (isInnerPortId(connection.ownPortId) || isInnerPortId(connection.connectedPortId)) continue
			toVisit.push(connection.connectedShapeId)
		}
	}

	return found
}
