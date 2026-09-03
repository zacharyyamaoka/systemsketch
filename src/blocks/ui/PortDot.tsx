/**
 * One port dot, painted the same way regardless of which container it hangs
 * off. Reuses the Block's `.Port` element and classes on purpose: the capture
 * listener in `installConnections.ts` turns a press on any
 * `.systemsketch-block-canvas .Port` into a cable, and the eligible / hinting
 * paint rides the same rules. A Loop port or a Branch control port is not new
 * to the connection layer — only the shape it hangs off is.
 *
 * An Expanded Block's dot carries real extra state (default-value badge, the
 * footer-drag offset, the mutates hook, the effect-edge glyph) that a Loop or
 * Branch dot never needs — `className`/`attrs`/`style`/`title` are open ends
 * for that, not a sign the shared part isn't shared.
 */
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import type { CSSProperties } from 'react'

import { getEligiblePorts, portState } from '../ports'
import { judgeConnection } from '../connections/connectionRules'
import { portColor } from './portPalette'

/** Whether a live cable is being aimed at this port, and whether it could land. */
export function usePortHintEligibility(shapeId: TLShapeId, portId: string): {
	hinting: boolean
	eligible: boolean
} {
	const editor = useEditor()
	const hinting = useValue('port hinting', () => {
		const { hintingPort } = portState.get(editor)
		return hintingPort?.shapeId === shapeId && hintingPort.portId === portId
	}, [editor, shapeId, portId])
	const eligible = useValue('port eligible', () => {
		const eligiblePorts = getEligiblePorts(editor)
		if (!eligiblePorts) return false
		return judgeConnection(
			editor,
			eligiblePorts.anchor,
			{ shapeId, portId },
			{ excludeBlocks: eligiblePorts.excludeBlocks, connectionId: eligiblePorts.connectionId },
		).ok
	}, [editor, shapeId, portId])
	return { hinting, eligible }
}

/**
 * Many-to-one, shown as a count. A port with two or more producers wears a
 * muted pill beside its dot — the inspector's count-chip idiom — and nothing
 * else: which producer is live is the Branch fade's job, not the cable's.
 */
export function PortCountBadge({ portId, count }: { portId: string; count: number }) {
	return (
		<span className="Port-count" data-testid={`port-count-${portId}`} aria-label={`${count} cables into this port`}>
			{count}
		</span>
	)
}

/** How many live cables feed each port — 2+ is what earns a port its count badge. */
export function countProducers(
	connections: readonly { ownPortId: string; ownPolarity: string }[],
): Map<string, number> {
	const counts = new Map<string, number>()
	for (const connection of connections) {
		if (connection.ownPolarity !== 'sink') continue
		counts.set(connection.ownPortId, (counts.get(connection.ownPortId) ?? 0) + 1)
	}
	return counts
}

export interface PortDotProps {
	portId: string
	side: 'input' | 'output'
	connected: boolean
	producers: number
	portType: string
	x: number
	y: number
	hinting: boolean
	eligible: boolean
	testId?: string
	title?: string
	/** Extra classes appended after the shared Port / side / connected / hint set. */
	className?: string
	/** Extra data-* (or other) attributes a caller's container needs on the dot. */
	attrs?: Record<string, string | undefined>
	/** Merged over the shared `--port-color` / left / top style. */
	style?: CSSProperties
}

export function PortDot({
	portId, side, connected, producers, portType, x, y, hinting, eligible,
	testId, title, className, attrs, style,
}: PortDotProps) {
	const classes = [
		'Port',
		side === 'input' ? 'Port_end' : 'Port_start',
		connected ? 'Port_connected' : '',
		hinting ? 'Port_hinting' : eligible ? 'Port_eligible' : '',
		className ?? '',
	].filter(Boolean).join(' ')

	return (
		<div
			className={classes}
			data-block-port-id={portId}
			data-block-port-side={side}
			data-testid={testId}
			title={title}
			{...attrs}
			style={{ '--port-color': portColor(portType), left: x, top: y, ...style } as CSSProperties}
		>
			{producers >= 2 ? <PortCountBadge portId={portId} count={producers} /> : null}
		</div>
	)
}
