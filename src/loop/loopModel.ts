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
/**
 * How far inside the wall the item outlet sits on the header's bottom edge.
 *
 * It is ON that edge, not on the wall, and its cable leaves it PERPENDICULAR —
 * straight down into the body. Both facts are carried into the router by the
 * port's `elbowSide`, because the model's old invariant ("an output leaves
 * rightward") is only true of a Block, whose ports live on its left and right
 * edges. A region's header ports face down.
 */
export const LOOP_ITEM_PORT_INSET = 16
/** Left padding for a port's label, matching the Branch's control labels. */
export const LOOP_LABEL_INSET = 14

/**
 * One of the header's two ports.
 *
 * A type and nothing else. You do not NAME these — the collection's name lives
 * on whatever produces it, and the element has no name until a Block's port
 * gives it one. What the header can say is what KIND of thing crosses it, so
 * the inlet reads `Iterable` and the outlet reads `Iter`.
 */
export const LoopPort = T.object({
	id: T.string,
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
		iterable: { id: LOOP_ITERABLE_PORT_ID, type: 'Iterable' },
		item: { id: LOOP_ITEM_PORT_ID, type: 'Iter' },
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
	/** Which way a cable leaves this port. The item outlet faces DOWN. */
	elbowSide: 'top' | 'right' | 'bottom' | 'left'
	/** True when the face looks into the region's own body. */
	facesInward: boolean
}

export interface LoopLayout {
	w: number
	h: number
	header: { x: number; y: number; w: number; h: number }
	footer: { x: number; y: number; w: number; h: number } | null
	/** Centre point AND the band it may fill, so it can truncate rather than collide. */
	title: { x: number; y: number; w: number }
	turn: { x: number; y: number; w: number; h: number } | null
	iterable: LoopPortLayout
	item: LoopPortLayout
	/** How wide a port's type label may be before it truncates. */
	labelMax: number
	body: { x: number; y: number; w: number; h: number }
}

/** Roughly what a 12.5px UI sans renders a label at. Only used for spacing. */
function labelWidth(text: string): number {
	return Math.max(24, text.length * 7.1)
}

/**
 * Roughly what the 18px monospace operator title renders at. This is a
 * threshold, rather than a second rendering path: when its whole string fits
 * in the protected central lane, the title belongs at the Loop's true centre.
 */
function titleWidth(text: string): number {
	return text.length * 10.8
}

export function loopLayout(props: LoopShapeProps): LoopLayout {
	const w = Math.max(1, props.w)
	const h = Math.max(1, props.h)
	const headerH = Math.min(LOOP_HEADER_HEIGHT, h)
	const footerH = h >= headerH + LOOP_FOOTER_HEIGHT + 24 ? LOOP_FOOTER_HEIGHT : 0

	// The header has three tenants on one row — the port type labels on the
	// left, the centred title, the turn chip on the right — and at 300px wide
	// with a long turn string they all wanted the same pixels. The QA sweep
	// caught the title running through the chip and the chip crossing the
	// region's right edge, so the row is now allocated rather than hoped for.
	const labelMax = Math.min(Math.max(64, w * 0.3), 220)

	// The collection lands ON the wall, at the header's port row.
	const iterableY = Math.min(headerH / 2 - 4, 24)
	const iterable: LoopPortLayout = {
		port: props.iterable,
		side: 'input',
		x: 0,
		y: iterableY,
		label: { x: LOOP_LABEL_INSET, y: iterableY, anchor: 'start' },
		elbowSide: 'left',
		facesInward: false,
	}
	// The element leaves the header's bottom edge. Its label sits ABOVE the dot,
	// inside the header: the cable drops straight down from here, so a label
	// under it would be struck through by the first cable anyone draws — which
	// is what the first acceptance screenshot showed.
	const itemX = Math.min(LOOP_ITEM_PORT_INSET, w / 2)
	const item: LoopPortLayout = {
		port: props.item,
		side: 'output',
		x: itemX,
		y: headerH,
		label: { x: itemX + LOOP_LABEL_INSET, y: Math.max(iterableY + 18, headerH - 11), anchor: 'start' },
		elbowSide: 'bottom',
		facesInward: true,
	}

	const turnText = props.turn.trim()
	let turnW = turnText ? Math.min(w * 0.32, labelWidth(turnText) + 20) : 0
	let bandEnd = (turnW ? w - 14 - turnW : w - 14) - 16
	const bandStart = LOOP_LABEL_INSET + labelMax + 16
	// The chip yields first when the row runs out: it reports a live state, and
	// the title is what identifies the region.
	if (turnW && bandEnd - bandStart < 60) {
		turnW = 0
		bandEnd = w - 14 - 16
	}
	const turn = turnW
		? { x: w - 14 - turnW, y: iterableY - 11, w: turnW, h: 22 }
		: null
	const bandW = Math.max(0, bandEnd - bandStart)
	// At the floor width, a long operator name needs the lane to the right of
	// the type labels. Once a resize gives its *complete* text a lane around
	// the Loop midpoint, return it to that midpoint. Measuring the complete
	// string avoids a title that is technically centred only because it has been
	// ellipsized, and keeping the same protected band means labels and the turn
	// chip never lose their reservation.
	const centredW = Math.max(0, 2 * Math.min(w / 2 - bandStart, bandEnd - w / 2))
	const title = centredW >= titleWidth(props.title)
		? { x: w / 2, y: iterableY, w: centredW }
		: { x: bandStart + bandW / 2, y: iterableY, w: bandW }

	return {
		w,
		h,
		header: { x: 0, y: 0, w, h: headerH },
		footer: footerH ? { x: 0, y: h - footerH, w, h: footerH } : null,
		title,
		turn,
		iterable,
		item,
		labelMax,
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
