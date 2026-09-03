/**
 * The Loop region: a `for` drawn as a frame-like container, never a Block.
 *
 * The grammar Zach settled across 2026-09-02/03, and the reason each part is
 * shaped the way it is:
 *
 *   - **the header is an operator.** The collection does not pass through the
 *     region on its way to a Block inside; it lands ON the header, exactly the
 *     way a Branch's controlling value lands on its band. The header then emits
 *     the current element from a second port. Both are real ports.
 *   - **a real port, not a derived one.** "100% I want a port myself so I can
 *     wire and show the type of iteration" — so the item outlet is an ordinary
 *     port carrying an ordinary cable. Nothing here is computed-only, and the
 *     drawing stays hackable.
 *   - **the item cable is SOLID.** Variant B of the item-connection babble.
 *     Solid means data, dashed is the async rail and dotted is `temporal:
 *     delayed` — one turn late. The element is *this* turn's value, so it is
 *     ordinary data, and dotted stays reserved for the back cable. That is the
 *     whole of "B solid drop", and it needs no new cable kind: an ordinary
 *     connection from a real output port already draws it.
 *   - **the title is centred**, because an operator's name belongs over the
 *     middle of it; left-aligned reads as a label on a container.
 *
 * Everything geometric derives from `loopLayout`, so the painted chrome, the
 * hit targets, the SVG export and the connection layer's port table are one
 * projection rather than four.
 */
import { T, type TLShape } from 'tldraw'

export const LOOP_SHAPE_TYPE = 'loop' as const
export const LOOP_TOOL_ID = 'loop' as const

/** Header, footer and paddings, at canvas scale (a Block's header is 48). */
export const LOOP_HEADER_HEIGHT = 56
export const LOOP_FOOTER_HEIGHT = 30
export const LOOP_MIN_WIDTH = 300
export const LOOP_MIN_HEIGHT = 180
export const LOOP_CORNER_RADIUS = 6
export const LOOP_PORT_RADIUS = 6
/** Where the item outlet sits along the header's bottom edge. */
export const LOOP_ITEM_PORT_INSET = 36
/** Left padding for a port's label, matching the Branch's control labels. */
export const LOOP_LABEL_INSET = 14

/** One of the header's two ports. Authored, never derived from the title. */
export const LoopPort = T.object({
	id: T.string,
	name: T.string,
	type: T.string,
})
export type LoopPort = T.TypeOf<typeof LoopPort>

export const LOOP_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	title: T.string,
	/** The collection arriving at the header. */
	iterable: LoopPort,
	/** The element the header emits, once per turn. */
	item: LoopPort,
	/** What the turn chip reads. Empty hides the chip. */
	turn: T.string,
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[LOOP_SHAPE_TYPE]: {
			w: number
			h: number
			title: string
			iterable: LoopPort
			item: LoopPort
			turn: string
		}
	}
}

export type LoopShape = TLShape<typeof LOOP_SHAPE_TYPE>
export type LoopShapeProps = LoopShape['props']

export function isLoopShape(shape: TLShape | null | undefined): shape is LoopShape {
	return shape?.type === LOOP_SHAPE_TYPE
}

export const LOOP_ITERABLE_PORT_ID = 'iterable'
export const LOOP_ITEM_PORT_ID = 'item'

export function getDefaultLoopProps(): LoopShapeProps {
	return {
		w: 520,
		h: 320,
		title: 'For Loop',
		iterable: { id: LOOP_ITERABLE_PORT_ID, name: 'Iterable', type: 'Iterable' },
		item: { id: LOOP_ITEM_PORT_ID, name: 'Iter', type: 'Item' },
		turn: '',
	}
}

export interface LoopPortLayout {
	port: LoopPort
	/** `input` receives the collection; `output` emits the element. */
	side: 'input' | 'output'
	x: number
	y: number
	label: { x: number; y: number; anchor: 'start' }
}

export interface LoopLayout {
	w: number
	h: number
	header: { x: number; y: number; w: number; h: number }
	footer: { x: number; y: number; w: number; h: number } | null
	title: { x: number; y: number }
	turn: { x: number; y: number; w: number; h: number } | null
	iterable: LoopPortLayout
	item: LoopPortLayout
	body: { x: number; y: number; w: number; h: number }
}

/** Roughly what a 12.5px UI sans renders a label at. Only used for spacing. */
function labelWidth(text: string): number {
	return Math.max(24, text.length * 7.1)
}

export function loopLayout(props: LoopShapeProps): LoopLayout {
	const w = Math.max(1, props.w)
	const h = Math.max(1, props.h)
	const headerH = Math.min(LOOP_HEADER_HEIGHT, h)
	const footerH = h >= headerH + LOOP_FOOTER_HEIGHT + 24 ? LOOP_FOOTER_HEIGHT : 0

	// The collection lands ON the wall, at the header's port row.
	const iterableY = Math.min(headerH / 2, 28)
	const iterable: LoopPortLayout = {
		port: props.iterable,
		side: 'input',
		x: 0,
		y: iterableY,
		label: { x: LOOP_LABEL_INSET, y: iterableY, anchor: 'start' },
	}
	// The element leaves from the header's bottom edge, inside the wall. Its
	// label sits ABOVE the dot rather than beside it: a cable leaving this port
	// runs right or down, and a label on that line would be struck through by
	// the first cable anyone draws — which is exactly what the first acceptance
	// screenshot showed.
	const itemX = Math.min(LOOP_ITEM_PORT_INSET, w / 2)
	const item: LoopPortLayout = {
		port: props.item,
		side: 'output',
		x: itemX,
		y: headerH,
		label: { x: itemX + LOOP_LABEL_INSET, y: Math.max(12, headerH - 13), anchor: 'start' },
	}

	const turnText = props.turn.trim()
	const turnW = turnText ? Math.min(w * 0.42, labelWidth(turnText) + 20) : 0
	const turn = turnText ? { x: w - 14 - turnW, y: iterableY - 11, w: turnW, h: 22 } : null

	// The title is centred, but never under the iterable label or the turn chip.
	const leftGuard = LOOP_LABEL_INSET + labelWidth(props.iterable.name) + 12
	const rightGuard = turn ? w - turn.x + 12 : 14
	const centre = w / 2
	const title = {
		x: Math.min(Math.max(centre, leftGuard + 30), Math.max(leftGuard + 30, w - rightGuard - 30)),
		y: iterableY,
	}

	return {
		w,
		h,
		header: { x: 0, y: 0, w, h: headerH },
		footer: footerH ? { x: 0, y: h - footerH, w, h: footerH } : null,
		title,
		turn,
		iterable,
		item,
		body: { x: 0, y: headerH, w, h: Math.max(0, h - headerH - footerH) },
	}
}

/** Keep a programmatic or resized record on its own floor. */
export function reconcileLoopProps(next: LoopShapeProps): LoopShapeProps {
	const w = Math.max(LOOP_MIN_WIDTH, Math.round(next.w))
	const h = Math.max(LOOP_MIN_HEIGHT, Math.round(next.h))
	if (w === next.w && h === next.h) return next
	return { ...next, w, h }
}
