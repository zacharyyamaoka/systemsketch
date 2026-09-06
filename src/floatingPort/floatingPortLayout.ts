import type { FloatingPortShape } from './floatingPortModel'

export const FLOATING_PORT_RADIUS = 6
const DOT_TO_LABEL_GAP = 11
const LABEL_HEIGHT = 22

export interface FloatingPortLayout {
	dot: { x: number; y: number; radius: number }
	label: { x: number; y: number; w: number; h: number }
	labelText: string
}

/**
 * The label is deliberately measured from its semantic pieces rather than
 * from DOM text. Geometry, SVG export, hit-testing, and the HTML face then
 * agree about where an input's left-facing label starts.
 */
export function layoutFloatingPort(props: FloatingPortShape['props']): FloatingPortLayout {
	const name = props.name.trim() || 'port'
	const type = props.type.trim() || 'Any'
	const value = props.value.trim()
	const labelText = value ? `${name}  ${type} = ${value}` : `${name}  ${type}`
	// Compact, intentionally approximate canvas typography. Its job is an
	// honest selectable envelope, not a second font-measuring engine.
	const width = Math.max(48, Math.ceil(labelText.length * 7.4) + 4)
	const y = props.textLayout === 'offset' ? -25 : -LABEL_HEIGHT / 2
	const x = props.direction === 'output'
		? FLOATING_PORT_RADIUS + DOT_TO_LABEL_GAP
		: -FLOATING_PORT_RADIUS - DOT_TO_LABEL_GAP - width
	return {
		dot: { x: 0, y: 0, radius: FLOATING_PORT_RADIUS },
		label: { x, y, w: width, h: LABEL_HEIGHT },
		labelText,
	}
}
