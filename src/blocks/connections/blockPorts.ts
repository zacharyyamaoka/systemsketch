import {
	Vec,
	createComputedCache,
	type Editor,
	type TLShape,
	type TLShapeId,
	type VecLike,
} from 'tldraw'
import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockShape, type BlockShapeProps } from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import { BRANCH_SHAPE_TYPE, branchLayout, isBranchShape, type BranchShape } from '../../branch/branchModel'
import { branchFoldAttachPoint } from '../../branch/branchScope'
import { LOOP_SHAPE_TYPE, isLoopShape, loopLayout, type LoopShape } from '../../loop/loopModel'
import type { ElbowSide } from '../elbow'
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
	/**
	 * The direction a cable leaves this port in, when it is not the model's
	 * default of "an output leaves rightward, an input is entered leftward".
	 *
	 * A Block's ports live on its left and right edges, so the default is the
	 * whole truth for them. A region's header ports do not: the Loop's item
	 * outlet sits on the header's BOTTOM edge and faces down into the body, and
	 * a rightward dongle sent a 120px run on a lap around the whole region.
	 */
	elbowSide?: ElbowSide
	/**
	 * True when this face looks INTO its own host — the item outlet again. Such
	 * a face contributes no obstacle box, for the same reason an inner face does
	 * not: the cable starts inside the thing it would otherwise route around.
	 */
	facesInward?: boolean
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
	// Memoised on the props object, like the layout it projects: the binding
	// side effects and the polarity reads ask for this table on every drag
	// frame of every cable, and a moved Block keeps its props object.
	let entry = connectionPortsMemo.get(props)
	if (!entry) {
		const all = projectBlockConnectionPorts(props)
		entry = { all, visible: all.filter((port) => !port.hidden) }
		connectionPortsMemo.set(props, entry)
	}
	return options.includeHidden ? entry.all : entry.visible
}

const connectionPortsMemo = new WeakMap<
	BlockShapeProps,
	{ all: BlockConnectionPort[]; visible: BlockConnectionPort[] }
>()

function projectBlockConnectionPorts(props: BlockShapeProps): BlockConnectionPort[] {
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

	return ports
}

/**
 * A shape that carries ports: a Block, or a Branch with control ports on its
 * band. The connection layer reads both through this one table, so a cable
 * welds to a control port with the same binding, rules and paint as a Block's
 * input — the Branch is only a second kind of host, not a second edge model.
 */
export type PortHostShape = BlockShape | BranchShape | LoopShape

/**
 * The one list of shape types a cable may weld to.
 *
 * `ConnectionShapeUtil.canBind` reads it too. Before that it spelled the same
 * set out by hand, so adding the Loop region as a host silently produced a
 * cable tldraw would not bind — the drag simply died with no error. One list,
 * two readers, and a new host can only be forgotten in one place.
 */
export const PORT_HOST_SHAPE_TYPES: readonly string[] = [
	BLOCK_SHAPE_TYPE,
	BRANCH_SHAPE_TYPE,
	LOOP_SHAPE_TYPE,
]

export function isPortHostShape(shape: TLShape | null | undefined): shape is PortHostShape {
	return isBlockShape(shape) || isBranchShape(shape) || isLoopShape(shape)
}

/**
 * A Loop's header ports as the connection layer sees them.
 *
 * Two, and only two: the collection lands on the header (`input`) and the
 * element leaves it (`output`). The header is an operator, so nothing passes
 * through the region on its way to a Block inside — and because the item port
 * is an ordinary output, the cable it carries is an ordinary SOLID connection.
 * That is the whole of "B solid drop": no new cable kind, just a real port.
 */
export function getLoopConnectionPorts(loop: LoopShape): BlockConnectionPort[] {
	const layout = loopLayout(loop.props)
	return [layout.iterable, layout.item].map((placed) => ({
		id: placed.port.id,
		// A header port has no name — only a type. `name` is what the connection
		// layer prints, so the type IS the label here.
		name: placed.port.type,
		type: placed.port.type,
		side: placed.side,
		hidden: false,
		x: placed.x,
		y: placed.y,
		anchor: { x: placed.x / layout.w, y: placed.y / layout.h },
		subtle: false,
		elbowSide: placed.elbowSide,
		facesInward: placed.facesInward,
	}))
}

/** A Branch's control ports as the connection layer sees them: inputs on the band. */
export function getBranchConnectionPorts(branch: BranchShape): BlockConnectionPort[] {
	const layout = branchLayout(branch.props)
	return layout.controls.map((control) => ({
		id: control.port.id,
		name: control.port.name,
		type: control.port.type,
		side: 'input' as const,
		hidden: false,
		x: control.x,
		y: control.y,
		anchor: { x: control.x / layout.w, y: control.y / layout.h },
		subtle: false,
	}))
}

function projectHostPorts(host: PortHostShape): BlockConnectionPort[] {
	if (isBranchShape(host)) return getBranchConnectionPorts(host)
	if (isLoopShape(host)) return getLoopConnectionPorts(host)
	return getBlockConnectionPorts(host.props, { includeHidden: true })
}

/**
 * The cached port table for a live host.
 *
 * tldraw's computed cache re-evaluates only when the record changes, so the
 * port dot, the drag hit test, the connected-state read and the binding
 * position all resolve the same projection without recomputing the layout per
 * pointer move.
 */
const blockPortsCache = createComputedCache('block ports', (_editor: Editor, host: PortHostShape) => (
	projectHostPorts(host)
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
	shape: TLShape | TLShapeId,
): BlockConnectionPort[] {
	const host = typeof shape === 'string' ? editor.getShape(shape) : shape
	if (!isPortHostShape(host)) return []
	if (!editor.store) return projectHostPorts(host)
	return blockPortsCache.get(editor, host.id) ?? []
}

/** Resolve a port on a live host by id, hidden or not. */
export function getPortHostPort(
	editor: Editor,
	shape: TLShape | TLShapeId,
	portId: string,
): BlockConnectionPort | null {
	return getLiveBlockPorts(editor, shape).find((port) => port.id === portId) ?? null
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
	shape: TLShape | TLShapeId,
	portId: string,
): Vec | null {
	const host = typeof shape === 'string' ? editor.getShape(shape) : shape
	if (!isPortHostShape(host)) return null
	const port = getLiveBlockPorts(editor, host.id).find((candidate) => candidate.id === portId)
	if (!port) return null
	// Inside a folded Branch arm the dot is not on screen; the cable attaches
	// at that arm's header edge instead — left for an input, right for an output.
	if (editor.store) {
		const attach = branchFoldAttachPoint(editor, host.id, port.side === 'input' ? 'in' : 'out')
		if (attach) return attach
	}
	return editor.getShapePageTransform(host.id).applyToPoint(port)
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
/**
 * Two wiring tables are the same when every entry is: the cache then keeps the
 * previous array, and a Block that merely moved does not repaint its dots. The
 * derive itself still runs on every record change; what this stops is every
 * reader downstream of it.
 */
function sameBlockPortConnections(
	before: BlockPortConnection[],
	after: BlockPortConnection[],
): boolean {
	if (before === after) return true
	if (before.length !== after.length) return false
	for (let index = 0; index < before.length; index += 1) {
		const a = before[index]
		const b = after[index]
		if (
			a.connectionId !== b.connectionId
			|| a.terminal !== b.terminal
			|| a.ownPortId !== b.ownPortId
			|| a.ownFace !== b.ownFace
			|| a.ownSide !== b.ownSide
			|| a.ownPolarity !== b.ownPolarity
			|| a.connectedShapeId !== b.connectedShapeId
			|| a.connectedPortId !== b.connectedPortId
			|| a.connectedFace !== b.connectedFace
			|| a.connectedSide !== b.connectedSide
			|| a.connectedPolarity !== b.connectedPolarity
		) return false
	}
	return true
}

const blockPortConnectionsCache = createComputedCache(
	'block port connections',
	(editor: Editor, cached: PortHostShape): BlockPortConnection[] => {
		const block = editor.getShape(cached.id)
		if (!isPortHostShape(block)) return []
		const ownPorts = getLiveBlockPorts(editor, block)
		const bindings = editor.getBindingsToShape<ConnectionBinding>(block.id, CONNECTION_BINDING_TYPE)
		const connections: BlockPortConnection[] = []
		for (const binding of bindings) {
			const opposite = binding.props.terminal === 'start' ? 'end' : 'start'
			const oppositeBinding = getConnectionBindings(editor, binding.fromId)[opposite]
			if (!oppositeBinding) continue
			const ownPort = ownPorts.find((port) => port.id === binding.props.portId)
			const connectedShape = editor.getShape(oppositeBinding.toId)
			const connectedPort = isPortHostShape(connectedShape)
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
	{ areResultsEqual: sameBlockPortConnections },
)

export function getBlockPortConnections(
	editor: Editor,
	shape: TLShape | TLShapeId,
): BlockPortConnection[] {
	const id = typeof shape === 'string' ? shape : shape.id
	if (!editor.store) return []
	return blockPortConnectionsCache.get(editor, id) ?? []
}

/** True when either face of a dot carries a cable. */
export function blockPortIsConnected(
	editor: Editor,
	shape: TLShape | TLShapeId,
	portId: string,
): boolean {
	return getBlockPortConnections(editor, shape).some((connection) => connection.ownPortId === portId)
}

/* ------------------------------ dot hit testing ---------------------------- */

export interface BlockPortDotHit {
	shape: PortHostShape
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
		if (!isPortHostShape(shape) || shape.isLocked || editor.isShapeHidden(shape)) continue

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
