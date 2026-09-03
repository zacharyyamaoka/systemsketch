/**
 * The Loop region's HTML face: a header carrying the centred title, the
 * `Iterable` inlet on the wall and the item outlet on the header's bottom
 * edge, then an open body, then a footer.
 *
 * The dots reuse the Block's `.Port` element and classes on purpose: the
 * capture listener in `installConnections.ts` turns a press on any
 * `.systemsketch-block-canvas .Port` into a cable, and the eligible / hinting
 * paint rides the same rules. A Loop port is not new to the connection layer —
 * only the shape it hangs off is.
 */
import { useMemo, type CSSProperties } from 'react'
import { HTMLContainer, useEditor, useValue } from 'tldraw'

import { getBlockPortConnections } from '../blocks/connections/blockPorts'
import { judgeConnection } from '../blocks/connections/connectionRules'
import { getEligiblePorts, portState } from '../blocks/ports'
import { PortCountBadge, countProducers } from '../blocks/ui/BlockCanvas'
import { portColor } from '../blocks/ui/portPalette'
import { loopLayout, type LoopPortLayout, type LoopShape } from './loopModel'
import './loop-canvas.css'

function LoopPortDot({ shape, placed, connected, producers }: {
	shape: LoopShape
	placed: LoopPortLayout
	connected: boolean
	producers: number
}) {
	const editor = useEditor()
	const portId = placed.port.id
	const isHinting = useValue('loop port hinting', () => {
		const { hintingPort } = portState.get(editor)
		return hintingPort?.shapeId === shape.id && hintingPort.portId === portId
	}, [editor, shape.id, portId])
	const isEligible = useValue('loop port eligible', () => {
		const eligible = getEligiblePorts(editor)
		if (!eligible) return false
		return judgeConnection(
			editor,
			eligible.anchor,
			{ shapeId: shape.id, portId },
			{ excludeBlocks: eligible.excludeBlocks, connectionId: eligible.connectionId },
		).ok
	}, [editor, shape.id, portId])

	const classes = [
		'Port',
		placed.side === 'input' ? 'Port_end' : 'Port_start',
		connected ? 'Port_connected' : '',
		isHinting ? 'Port_hinting' : isEligible ? 'Port_eligible' : '',
	].filter(Boolean).join(' ')

	return (
		<div
			className={classes}
			data-block-port-id={portId}
			data-block-port-side={placed.side}
			data-testid={`loop-port-dot-${portId}`}
			style={{ '--port-color': portColor(placed.port.type), left: placed.x, top: placed.y } as CSSProperties}
		>
			{producers >= 2 ? <PortCountBadge portId={portId} count={producers} /> : null}
		</div>
	)
}

export function LoopCanvas({ shape }: { shape: LoopShape }) {
	const editor = useEditor()
	const layout = loopLayout(shape.props)
	const connections = useValue(
		'loop connections',
		() => getBlockPortConnections(editor, shape.id),
		[editor, shape.id],
	)
	const connectedIds = new Set(connections.map((connection) => connection.ownPortId))
	const producerCounts = useMemo(() => countProducers(connections), [connections])

	return (
		<HTMLContainer>
			{/* The block-canvas class is what the connection layer listens on. */}
			<div className="systemsketch-loop-canvas systemsketch-block-canvas" data-testid={`loop-${shape.id}`}>
				<div className="Loop-layer">
					<div className="Loop-header" style={{ height: layout.header.h }} />
					{layout.footer ? (
						<div className="Loop-footer" style={{ top: layout.footer.y, height: layout.footer.h }} />
					) : null}
					<div className="Loop-title" style={{ left: layout.title.x, top: layout.title.y }}>
						{shape.props.title}
					</div>
					{layout.turn ? (
						<div
							className="Loop-turn"
							style={{ left: layout.turn.x, top: layout.turn.y, width: layout.turn.w, height: layout.turn.h }}
							data-testid="loop-turn"
						>
							{shape.props.turn}
						</div>
					) : null}
					{[layout.iterable, layout.item].map((placed) => (
						<div
							key={`${placed.port.id}-label`}
							className="Loop-portLabel"
							style={{ left: placed.label.x, top: placed.label.y }}
							data-testid={`loop-port-label-${placed.port.id}`}
						>
							{placed.port.type}
						</div>
					))}
					{layout.footer ? (
						<div className="Loop-menuDot" style={{ left: layout.w - 16, top: layout.footer.y + layout.footer.h / 2 }}>⋮</div>
					) : null}
				</div>
				{[layout.iterable, layout.item].map((placed) => (
					<LoopPortDot
						key={placed.port.id}
						shape={shape}
						placed={placed}
						connected={connectedIds.has(placed.port.id)}
						producers={producerCounts.get(placed.port.id) ?? 0}
					/>
				))}
			</div>
		</HTMLContainer>
	)
}
