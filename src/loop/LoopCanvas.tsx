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
import { useMemo } from 'react'
import { HTMLContainer, useEditor, useValue } from 'tldraw'

import { getBlockPortConnections } from '../blocks/connections/blockPorts'
import { countProducers, PortDot, usePortHintEligibility } from '../blocks/ui/PortDot'
import { loopLayout, type LoopPortLayout, type LoopShape } from './loopModel'
import './loop-canvas.css'

function LoopPortDot({ shape, placed, connected, producers }: {
	shape: LoopShape
	placed: LoopPortLayout
	connected: boolean
	producers: number
}) {
	const portId = placed.port.id
	const { hinting, eligible } = usePortHintEligibility(shape.id, portId)
	return (
		<PortDot
			portId={portId}
			side={placed.side}
			connected={connected}
			producers={producers}
			portType={placed.port.type}
			x={placed.x}
			y={placed.y}
			hinting={hinting}
			eligible={eligible}
			testId={`loop-port-dot-${portId}`}
		/>
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
					<div
						className="Loop-title"
						style={{ left: layout.title.x, top: layout.title.y, width: layout.title.w }}
						title={shape.props.title}
					>
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
							style={{ left: placed.label.x, top: placed.label.y, maxWidth: layout.labelMax }}
							data-testid={`loop-port-label-${placed.port.id}`}
							title={placed.port.type}
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
