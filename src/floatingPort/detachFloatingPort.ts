import { createShapeId, toRichText, type Editor, type TLShapeId, type TLShapePartial } from 'tldraw'

import { portTldrawColor } from '../blocks/ui/portPalette'
import { layoutFloatingPort, FLOATING_PORT_RADIUS } from './floatingPortLayout'
import { isFloatingPortShape } from './floatingPortModel'

/**
 * Lower a free endpoint after semantic cables have already become stock arrows.
 * The result is intentionally two ordinary shapes: a typed dot and readable
 * text, useful in plain tldraw without pretending a stock document has a Port
 * record schema.
 */
export function detachFloatingPortToPrimitives(editor: Editor, shapeId: TLShapeId): TLShapeId[] | null {
	const port = editor.getShape(shapeId)
	if (!isFloatingPortShape(port)) return null
	const layout = layoutFloatingPort(port.props)
	const label = port.props.value.trim()
		? `${port.props.name || 'port'}  ${port.props.type || 'Any'} = ${port.props.value.trim()}`
		: `${port.props.name || 'port'}  ${port.props.type || 'Any'}`
	const dotId = createShapeId()
	const labelId = createShapeId()
	const primitives: TLShapePartial[] = [
		{
			id: dotId,
			type: 'geo',
			parentId: port.parentId,
			x: port.x - FLOATING_PORT_RADIUS,
			y: port.y - FLOATING_PORT_RADIUS,
			props: {
				geo: 'ellipse',
				w: FLOATING_PORT_RADIUS * 2,
				h: FLOATING_PORT_RADIUS * 2,
				color: portTldrawColor(port.props.type),
				fill: port.props.fill === 'filled' ? 'solid' : 'none',
				dash: 'solid',
				size: 's',
			},
		},
		{
			id: labelId,
			type: 'text',
			parentId: port.parentId,
			x: port.x + layout.label.x,
			y: port.y + layout.label.y,
			props: {
				richText: toRichText(label),
				color: 'black',
				size: 's',
				font: 'draw',
				scale: 15 / 18,
				autoSize: false,
				w: layout.label.w / (15 / 18),
				textAlign: port.props.direction === 'input' ? 'end' : 'start',
			},
		},
	]
	editor.run(() => {
		editor.createShapes(primitives)
		editor.deleteShape(port.id)
	})
	return [dotId, labelId]
}
