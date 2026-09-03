import type { Editor, TLParentId, TLShape, TLShapeId, VecLike } from 'tldraw'

import {
	isBlockShape,
	isExpandedBlockShape,
	type BlockShapeProps,
} from '../blockModel'
import {
	getBlockConnectionPorts,
	getBlockPortConnections,
	getBlockPortDotsNear,
	getLiveBlockPorts,
	isPortHostShape,
	type BlockConnectionPort,
	type BlockPortDotHit,
	type PortHostShape,
} from './blockPorts'
import {
	arePortTypesCompatible,
	oppositePolarity,
	portPolarity,
	type BlockPortLane,
	type PortDot,
	type PortEndpoint,
	type PortPolarity,
} from './connectionModel'
import { pairBlockFaces, type ScopeReader } from './connectionScope'
import { isImportedPageFrame } from '../../singlePageDocument'

/**
 * The rules. One function decides whether two ports may be wired and which
 * way the data flows; everything that needs that answer — the drop, the
 * eligible-port highlight, the picker, validation on load — asks it.
 */

export type ConnectionRefusal =
	| 'missing-port'
	| 'hidden-port'
	| 'no-shared-scope'
	| 'same-polarity'
	| 'type-mismatch'
	| 'cycle'
	| 'duplicate'

export interface JudgedEndpoint extends PortEndpoint {
	side: BlockPortLane
	polarity: PortPolarity
	port: BlockConnectionPort
}

export type ConnectionVerdict =
	| {
		ok: true
		/** The judged pair, in the order asked. */
		a: JudgedEndpoint
		b: JudgedEndpoint
		source: JudgedEndpoint
		sink: JudgedEndpoint
		/** The scope the cable lives in — the parent it takes. */
		scopeId: TLParentId
	}
	| { ok: false; reason: ConnectionRefusal }

export interface JudgeOptions {
	/** Blocks a landing on which would close a loop, relative to `a`. */
	excludeBlocks?: ReadonlySet<TLShapeId> | null
	/** Validation of a stored cable: hidden ports and collapsed frames stay legal. */
	existing?: boolean
	/**
	 * The cable being judged, so a wire already joining these two faces counts
	 * as a duplicate only when it is some OTHER cable — a reconnect drag that
	 * lands back where it started is not a copy of itself.
	 */
	connectionId?: TLShapeId
}

type RulesReader = ScopeReader & { store?: Editor['store'] }

function livePort(editor: RulesReader, block: PortHostShape, portId: string): BlockConnectionPort | null {
	return getLiveBlockPorts(editor as Editor, block).find((port) => port.id === portId) ?? null
}

/**
 * May a cable join these two ports, and which way does it point?
 *
 *   1. both ports must exist, and be visible for a new cable
 *   2. the two Blocks must share a scope, which fixes each end's face
 *   3. the faces must differ in polarity — one emits, one receives
 *   4. the types must be compatible (a seam; permissive today)
 *   5. between outer faces, the landing must not close a loop
 *   6. the two faces must not already be joined — sinks fan in, but a second
 *      copy of the same wire is nothing anyone can tell apart
 */
export function judgeConnection(
	editor: RulesReader,
	a: PortDot,
	b: PortDot,
	options: JudgeOptions = {},
): ConnectionVerdict {
	const shapeA = editor.getShape(a.shapeId)
	const shapeB = editor.getShape(b.shapeId)
	if (!isPortHostShape(shapeA) || !isPortHostShape(shapeB)) return { ok: false, reason: 'missing-port' }
	const portA = livePort(editor, shapeA, a.portId)
	const portB = livePort(editor, shapeB, b.portId)
	if (!portA || !portB) return { ok: false, reason: 'missing-port' }
	if (!options.existing && (portA.hidden || portB.hidden)) return { ok: false, reason: 'hidden-port' }

	const faces = pairBlockFaces(editor, shapeA, shapeB, { requireLive: !options.existing })
	if (!faces) {
		return { ok: false, reason: 'no-shared-scope' }
	}

	const endpointA: JudgedEndpoint = {
		shapeId: shapeA.id,
		portId: portA.id,
		face: faces.a,
		side: portA.side,
		polarity: portPolarity(portA.side, faces.a),
		port: portA,
	}
	const endpointB: JudgedEndpoint = {
		shapeId: shapeB.id,
		portId: portB.id,
		face: faces.b,
		side: portB.side,
		polarity: portPolarity(portB.side, faces.b),
		port: portB,
	}
	if (endpointA.polarity === endpointB.polarity) return { ok: false, reason: 'same-polarity' }

	const [source, sink] = endpointA.polarity === 'source'
		? [endpointA, endpointB]
		: [endpointB, endpointA]
	if (!arePortTypesCompatible(source.port.type, sink.port.type)) {
		return { ok: false, reason: 'type-mismatch' }
	}
	if (
		shapeA.id !== shapeB.id
		&& faces.a === 'outer' && faces.b === 'outer'
		&& options.excludeBlocks?.has(shapeB.id)
	) {
		return { ok: false, reason: 'cycle' }
	}
	if (!options.existing && facesAlreadyJoined(editor, endpointA, endpointB, options.connectionId)) {
		return { ok: false, reason: 'duplicate' }
	}

	return { ok: true, a: endpointA, b: endpointB, source, sink, scopeId: faces.scopeId }
}

/** Is there some other cable already welded to exactly these two faces? */
function facesAlreadyJoined(
	editor: RulesReader,
	a: JudgedEndpoint,
	b: JudgedEndpoint,
	except: TLShapeId | undefined,
): boolean {
	if (!editor.store) return false
	return getBlockPortConnections(editor as Editor, a.shapeId).some((connection) => (
		connection.connectionId !== except
		&& connection.ownPortId === a.portId
		&& connection.ownFace === a.face
		&& connection.connectedShapeId === b.shapeId
		&& connection.connectedPortId === b.portId
		&& connection.connectedFace === b.face
	))
}

/* -------------------------------- cycles ---------------------------------- */

/**
 * Walk the flat graph of one scope from a Block, following its outer faces of
 * one polarity: `source` walks downstream, `sink` walks upstream. Cables on an
 * inner face are hierarchy, not flow, and are never followed — a child feeding
 * its own parent's outlet is the hierarchy working, not a loop.
 */
export function connectedBlocksByPolarity(
	editor: Editor,
	start: TLShapeId,
	follow: PortPolarity,
): Set<TLShapeId> {
	const toVisit: TLShapeId[] = [start]
	const found = new Set<TLShapeId>()
	while (toVisit.length > 0) {
		const id = toVisit.shift()
		if (!id || found.has(id)) continue
		if (!isPortHostShape(editor.getShape(id))) continue
		found.add(id)
		for (const connection of getBlockPortConnections(editor, id)) {
			if (connection.ownFace !== 'outer' || connection.connectedFace !== 'outer') continue
			if (connection.ownPolarity !== follow) continue
			toVisit.push(connection.connectedShapeId)
		}
	}
	return found
}

/**
 * The Blocks a cable from `anchor` must not land on, or it would loop.
 *
 * Read from the anchor's OUTER polarity: a source may not feed anything
 * upstream of itself, a sink may not be fed by anything downstream. The set
 * includes the anchor's own Block. Inner faces are exempt at the judge, so the
 * set only ever bites between siblings.
 */
export function blocksThatWouldCycle(editor: Editor, anchor: PortDot): Set<TLShapeId> | null {
	const shape = editor.getShape(anchor.shapeId)
	if (!isPortHostShape(shape)) return null
	const port = livePort(editor, shape, anchor.portId)
	if (!port) return null
	return connectedBlocksByPolarity(
		editor,
		shape.id,
		oppositePolarity(portPolarity(port.side, 'outer')),
	)
}

/* --------------------------------- drops ---------------------------------- */

export interface ConnectionTarget {
	hit: BlockPortDotHit
	verdict: Extract<ConnectionVerdict, { ok: true }>
	/** The anchor, with the face this landing gives it. */
	anchor: JudgedEndpoint
	/** The landing, with its face. */
	target: JudgedEndpoint
}

/**
 * The nearest dot within reach that the rules let a cable from `anchor` land
 * on. An illegal dot never shadows a legal one behind it: refusal is judged
 * per candidate, in distance order.
 */
export function findConnectionTarget(
	editor: Editor,
	pagePoint: VecLike,
	anchor: PortDot,
	options: {
		excludeBlocks?: ReadonlySet<TLShapeId> | null
		/** The cable whose loose end is landing, exempt from the duplicate rule. */
		connectionId?: TLShapeId
		screenRadius?: number
		pageRadius?: number
	} = {},
): ConnectionTarget | null {
	for (const hit of getBlockPortDotsNear(editor, pagePoint, options)) {
		const verdict = judgeConnection(
			editor,
			anchor,
			{ shapeId: hit.shapeId, portId: hit.port.id },
			{ excludeBlocks: options.excludeBlocks, connectionId: options.connectionId },
		)
		if (verdict.ok) return { hit, verdict, anchor: verdict.a, target: verdict.b }
	}
	return null
}

export type DropScope =
	/** Empty space: the scope a Block placed here would live in. */
	| { kind: 'scope'; scopeId: TLParentId }
	/** A collapsed Block's card: the cable was aimed at it, and refused. */
	| { kind: 'block'; block: TLShape }

/**
 * What a cable end that landed on no port landed IN.
 *
 * The interior of an Expanded Block is a scope, so a drop there is an offer to
 * put a Block inside. A collapsed card is not: a cable dropped on one was aimed
 * at that Block, and a new Block on top of it is not the alternative anyone
 * wanted.
 */
export function dropScopeAt(editor: Editor, pagePoint: VecLike): DropScope {
	// `hitFrameInside`: tldraw treats the empty interior of a frame-like shape
	// as a miss unless asked, and an Expanded Block's interior is precisely the
	// scope this is looking for.
	const hit = editor.getShapeAtPoint(pagePoint, {
		hitInside: true,
		hitFrameInside: true,
		filter: (shape) => isBlockShape(shape) || isImportedPageFrame(shape),
	})
	if (!hit) return { kind: 'scope', scopeId: editor.getCurrentPageId() }
	if (isExpandedBlockShape(hit)) return { kind: 'scope', scopeId: hit.id }
	if (isImportedPageFrame(hit)) return { kind: 'scope', scopeId: hit.id }
	return { kind: 'block', block: hit }
}

/** The first visible port of a Block that a cable end of `polarity` can meet from outside. */
export function firstOuterPortForPolarity(
	props: BlockShapeProps,
	needed: PortPolarity,
): BlockConnectionPort | null {
	const lane: BlockPortLane = needed === 'source' ? 'output' : 'input'
	return getBlockConnectionPorts(props).find((port) => port.side === lane) ?? null
}
