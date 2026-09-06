import { HTMLContainer, useEditor, useValue } from 'tldraw'

import { getBlockPortConnections } from '../blocks/connections/blockPorts'
import { PortDot, usePortHintEligibility } from '../blocks/ui/PortDot'
import { FLOATING_PORT_ID, type FloatingPortShape } from './floatingPortModel'
import { layoutFloatingPort } from './floatingPortLayout'
import './floating-port.css'

function FloatingPortDot({ shape, connected }: { shape: FloatingPortShape; connected: boolean }) {
	const { hinting, eligible } = usePortHintEligibility(shape.id, FLOATING_PORT_ID)
	return (
		<PortDot
			portId={FLOATING_PORT_ID}
			side={shape.props.direction}
			connected={connected}
			producers={0}
			portType={shape.props.type}
			x={0}
			y={0}
			hinting={hinting}
			eligible={eligible}
			testId={`floating-port-dot-${shape.id.replace('shape:', '')}`}
			title={`${shape.props.name || 'port'} · ${shape.props.type || 'Any'}`}
			className="FloatingPort-dot"
			attrs={{ 'data-floating-port-fill': shape.props.fill }}
		/>
	)
}

export function FloatingPortCanvas({ shape }: { shape: FloatingPortShape }) {
	const editor = useEditor()
	const layout = layoutFloatingPort(shape.props)
	const wired = useValue(
		'floating port wired state',
		() => getBlockPortConnections(editor, shape.id).some((connection) => connection.ownPortId === FLOATING_PORT_ID),
		[editor, shape.id],
	)
	const filled = shape.props.fill === 'auto' ? wired : shape.props.fill === 'filled'
	const name = shape.props.name.trim() || 'port'
	const type = shape.props.type.trim() || 'Any'
	const value = shape.props.value.trim()

	return (
		<HTMLContainer
			className="systemsketch-block-canvas systemsketch-floating-port-canvas"
			data-testid={`floating-port-${shape.id.replace('shape:', '')}`}
			data-direction={shape.props.direction}
			data-text-layout={shape.props.textLayout}
			data-filled={filled}
			style={{ overflow: 'visible' }}
		>
			<div className="FloatingPort-layer">
				<FloatingPortDot shape={shape} connected={filled} />
				<div
					className="FloatingPort-label"
					style={{ left: layout.label.x, top: layout.label.y, width: layout.label.w, height: layout.label.h }}
					title={layout.labelText}
				>
					<span className="FloatingPort-name">{name}</span>
					<span className="FloatingPort-type">{type}</span>
					{value ? <span className="FloatingPort-value">= {value}</span> : null}
				</div>
			</div>
		</HTMLContainer>
	)
}
