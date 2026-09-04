import {
	Circle2d,
	Group2d,
	Rectangle2d,
	ShapeUtil,
	type RecordProps,
} from 'tldraw'

import {
	FLOATING_PORT_SHAPE_PROPS,
	FLOATING_PORT_SHAPE_TYPE,
	getDefaultFloatingPortProps,
	type FloatingPortShape,
} from './floatingPortModel'
import { FLOATING_PORT_RADIUS, layoutFloatingPort } from './floatingPortLayout'
import { FloatingPortCanvas } from './FloatingPortCanvas'

function exportPortColor(type: string): string {
	const normalized = type.trim().toLowerCase()
	if (normalized === 'image') return '#c060e0'
	if (normalized === 'text' || normalized === 'str' || normalized === 'string') return '#4caf50'
	if (normalized === 'model') return '#2196f3'
	if (normalized === 'number' || normalized === 'int' || normalized === 'float') return '#9e9e9e'
	if (normalized === 'latent') return '#ff9800'
	return '#c08520'
}

/** The free Port primitive: a semantic, wireable endpoint with no enclosing Block. */
export class FloatingPortShapeUtil extends ShapeUtil<FloatingPortShape> {
	static override type = FLOATING_PORT_SHAPE_TYPE
	static override props: RecordProps<FloatingPortShape> = FLOATING_PORT_SHAPE_PROPS

	override getDefaultProps(): FloatingPortShape['props'] {
		return getDefaultFloatingPortProps()
	}

	override getGeometry(shape: FloatingPortShape) {
		const layout = layoutFloatingPort(shape.props)
		return new Group2d({
			children: [
				new Circle2d({
					x: -FLOATING_PORT_RADIUS,
					y: -FLOATING_PORT_RADIUS,
					radius: FLOATING_PORT_RADIUS,
					isFilled: true,
				}),
				new Rectangle2d({
					x: layout.label.x,
					y: layout.label.y,
					width: layout.label.w,
					height: layout.label.h,
					isFilled: true,
					isLabel: true,
				}),
			],
		})
	}

	override component(shape: FloatingPortShape) {
		return <FloatingPortCanvas shape={shape} />
	}

	override getIndicatorPath(shape: FloatingPortShape): Path2D {
		const layout = layoutFloatingPort(shape.props)
		const path = new Path2D()
		path.arc(0, 0, FLOATING_PORT_RADIUS + 2, 0, Math.PI * 2)
		path.rect(layout.label.x, layout.label.y, layout.label.w, layout.label.h)
		return path
	}

	override toSvg(shape: FloatingPortShape) {
		const layout = layoutFloatingPort(shape.props)
		const name = shape.props.name.trim() || 'port'
		const type = shape.props.type.trim() || 'Any'
		const value = shape.props.value.trim()
		const fill = shape.props.fill === 'filled' ? exportPortColor(type) : '#ffffff'
		const anchor = shape.props.direction === 'input' ? 'end' : 'start'
		const x = shape.props.direction === 'input' ? layout.label.x + layout.label.w : layout.label.x
		return (
			<g pointerEvents="none">
				<circle cx={0} cy={0} r={FLOATING_PORT_RADIUS} fill={fill} stroke={exportPortColor(type)} strokeWidth={2} />
				<text x={x} y={layout.label.y + layout.label.h / 2} textAnchor={anchor} dominantBaseline="middle" fill="#27272a" fontFamily="ui-sans-serif, system-ui" fontSize={15}>
					<tspan fontWeight={650}>{name}</tspan>
					<tspan dx={7} fill="#71717a">{type}</tspan>
					{value ? <tspan dx={6} fill="#52525b">= {value}</tspan> : null}
				</text>
			</g>
		)
	}

	override canEdit(_shape: FloatingPortShape): boolean { return false }
	override canResize(_shape: FloatingPortShape): boolean { return false }
	override hideResizeHandles(_shape: FloatingPortShape): boolean { return true }
	override hideRotateHandle(_shape: FloatingPortShape): boolean { return true }

	// WHY: the brief deliberately withdraws automatic edge snapping. A free dot
	// is the compositional primitive; it must stay exactly where its author puts
	// it until a shared primitive-edge grammar exists, not guess at one locally.
	override canSnap(_shape: FloatingPortShape): boolean { return false }
}
