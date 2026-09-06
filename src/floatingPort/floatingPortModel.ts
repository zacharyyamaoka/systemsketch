import { T, type RecordProps, type TLShape } from 'tldraw'

/** A free canvas endpoint, kept independent from the Block that may sit near it. */
export const FLOATING_PORT_SHAPE_TYPE = 'floating-port' as const
export const FLOATING_PORT_TOOL_ID = 'floating-port' as const
export const FLOATING_PORT_ID = 'port' as const

export const FLOATING_PORT_DIRECTIONS = ['input', 'output'] as const
export type FloatingPortDirection = (typeof FLOATING_PORT_DIRECTIONS)[number]

export const FLOATING_PORT_TEXT_LAYOUTS = ['inline', 'offset'] as const
export type FloatingPortTextLayout = (typeof FLOATING_PORT_TEXT_LAYOUTS)[number]

/** Auto is a derived visual state; the other two are explicit author overrides. */
export const FLOATING_PORT_FILL_MODES = ['auto', 'filled', 'empty'] as const
export type FloatingPortFillMode = (typeof FLOATING_PORT_FILL_MODES)[number]

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[FLOATING_PORT_SHAPE_TYPE]: {
			/** A tiny retained box lets the stock box-tool own click/drag creation. */
			w: number
			h: number
			name: string
			type: string
			value: string
			direction: FloatingPortDirection
			textLayout: FloatingPortTextLayout
			fill: FloatingPortFillMode
		}
	}
}

export type FloatingPortShape = TLShape<typeof FLOATING_PORT_SHAPE_TYPE>

export const FLOATING_PORT_SHAPE_PROPS: RecordProps<FloatingPortShape> = {
	w: T.number,
	h: T.number,
	name: T.string,
	type: T.string,
	value: T.string,
	direction: T.literalEnum(...FLOATING_PORT_DIRECTIONS),
	textLayout: T.literalEnum(...FLOATING_PORT_TEXT_LAYOUTS),
	fill: T.literalEnum(...FLOATING_PORT_FILL_MODES),
}

export function getDefaultFloatingPortProps(): FloatingPortShape['props'] {
	return {
		w: 1,
		h: 1,
		name: 'port',
		type: 'Any',
		value: '',
		direction: 'input',
		textLayout: 'inline',
		fill: 'auto',
	}
}

export function isFloatingPortShape(shape: TLShape | null | undefined): shape is FloatingPortShape {
	return shape?.type === FLOATING_PORT_SHAPE_TYPE
}

/** The connection layer sees one stable dot, even when a person renames it. */
export function getOnlySelectedFloatingPort(editor: { getSelectedShapes(): TLShape[] }): FloatingPortShape | null {
	const selected = editor.getSelectedShapes()
	return selected.length === 1 && isFloatingPortShape(selected[0]) ? selected[0] : null
}
