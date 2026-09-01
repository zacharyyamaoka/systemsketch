import { StyleProp } from 'tldraw'

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
 */
export const ConnectionRoutingStyle = StyleProp.defineEnum('systemsketch:connectionRouting', {
	defaultValue: 'curved',
	values: CONNECTION_ROUTING_KINDS,
})

export type ConnectionTerminal = 'start' | 'end'

/** Outputs originate a connection; inputs receive one. */
export function terminalForBlockPortSide(
	side: LaidOutBlockPort['side'],
): ConnectionTerminal {
	return side === 'output' ? 'start' : 'end'
}

export function oppositeConnectionTerminal(
	terminal: ConnectionTerminal,
): ConnectionTerminal {
	return terminal === 'start' ? 'end' : 'start'
}
