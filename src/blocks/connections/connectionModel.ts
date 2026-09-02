import { StyleProp, type TLShapeId } from 'tldraw'

import type { LaidOutBlockPort } from '../layoutBlock'

export const CONNECTION_SHAPE_TYPE = 'connection' as const
export const CONNECTION_BINDING_TYPE = 'connection' as const

export const CONNECTION_ROUTING_KINDS = ['curved', 'straight', 'elbow'] as const
export type ConnectionRoutingKind = (typeof CONNECTION_ROUTING_KINDS)[number]

/**
 * Routing is a style for the same reason a Block's view is: selecting a bundle
 * of cables and choosing Curved must be one write, and tldraw's shared-style
 * machinery already reports whether that bundle agrees. `elbow` is additive —
 * a stored `curved` or `straight` cable still validates unchanged.
 *
 * Being a style is also what lets a data edge follow the arrow: the toolbar
 * writes this through `setStyleForNextShapes` beside tldraw's own arrow kind
 * (see `toolbarIntegration.applyArrowPreset`), so one press of A settles both.
 * The default is `elbow` because that is the shape SystemSketch draws most,
 * and because a datum that disagrees with the toolbar's own default would show
 * up as a curved first cable on a fresh install.
 */
export const ConnectionRoutingStyle = StyleProp.defineEnum('systemsketch:connectionRouting', {
	defaultValue: 'elbow',
	values: CONNECTION_ROUTING_KINDS,
})

/**
 * The two handles tldraw drags. Nothing more.
 *
 * `start` and `end` name the ends of the cable shape, not its direction. Which
 * end is the source is derived from the faces the two bindings sit on — see
 * `portPolarity` — because a port's meaning depends on which side of a Block
 * boundary a cable meets it from, and that is only known once both ends have
 * landed. A settled cable is normalised so that `start` IS the source, which
 * keeps the file format readable, but no code may assume it mid-gesture.
 */
export type ConnectionTerminal = 'start' | 'end'

export function oppositeConnectionTerminal(
	terminal: ConnectionTerminal,
): ConnectionTerminal {
	return terminal === 'start' ? 'end' : 'start'
}

export type BlockPortLane = LaidOutBlockPort['side']

/**
 * Which side of a Block boundary a cable meets a port from.
 *
 * Every port has an `outer` face, in the scope its Block lives in. A port on
 * an Expanded Block also has an `inner` face, in the scope the Block itself
 * defines. One dot on screen; two identities, and a cable belongs to exactly
 * one of them. The face is stored on the binding, so the document says which.
 */
export type PortFace = 'outer' | 'inner'

/** What a face does in its scope: a `source` emits, a `sink` receives. */
export type PortPolarity = 'source' | 'sink'

/**
 * The one table the whole edge layer rests on.
 *
 * From outside, an output emits and an input receives. From inside the same
 * Block, the roles swap: the inlet is where data ARRIVES into the scope, so
 * it emits to the children, and the outlet is where the scope's result leaves,
 * so it receives from them. "The input port becomes like an output port once
 * you are inside the boundary" — the FR's own sentence, as a function.
 */
export function portPolarity(lane: BlockPortLane, face: PortFace): PortPolarity {
	if (face === 'outer') return lane === 'output' ? 'source' : 'sink'
	return lane === 'input' ? 'source' : 'sink'
}

export function oppositePolarity(polarity: PortPolarity): PortPolarity {
	return polarity === 'source' ? 'sink' : 'source'
}

/** One face of one port on one Block: the thing a cable end binds to. */
export interface PortEndpoint {
	shapeId: TLShapeId
	portId: string
	face: PortFace
}

/** A port on a Block with the face not yet decided — what a press produces. */
export interface PortDot {
	shapeId: TLShapeId
	portId: string
}

/**
 * The data-type seam.
 *
 * Ports carry a free-text `type` today ("Pose", "bytes", or nothing), so there
 * is no lattice to check against yet and a veto on a guess would refuse cables
 * people mean. When the Python side defines the types, this is the ONLY place
 * that changes: `judgeConnection` already routes every candidate pair through
 * it and reports `type-mismatch`, and the eligible-port highlight and the drop
 * both read that verdict.
 */
export function arePortTypesCompatible(_sourceType: string, _sinkType: string): boolean {
	return true
}
