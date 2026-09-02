/**
 * A Block's appearance, as a list of stock tldraw shapes.
 *
 * Ported from pyblocks' `src/pipeline/nodes/detachNode.ts`, which is where this
 * operation was worked out. Two properties carried over unchanged, because they
 * are what make the result trustworthy:
 *
 *  1. Everything is read from `layoutBlock` — the same function the renderer,
 *     the indicator and the binding anchors read. The detached copy therefore
 *     cannot drift from what was on screen a frame earlier.
 *  2. It is pure apart from minting ids (and a DOM text measurer when there is
 *     one), so the look can be asserted in a unit test with no editor at all.
 *     The look is a value, not a side effect.
 *
 * Two approximations are declared rather than hidden: stock-palette port
 * colours (tldraw cannot reach `#c08520`), and square corners where a lucide
 * glyph or a 9px radius has no primitive equivalent.
 */
import { createShapeId, toRichText } from 'tldraw'
import type { TLDefaultColorStyle, TLShapeId, TLShapePartial } from 'tldraw'

import type { BlockShapeProps } from '../blockModel'
import {
	BLOCK_PORT_RADIUS,
	PORT_TEXT_FONT_PX,
	PORT_TITLE_FONT_PX,
	SIMPLE_ICON_GAP_PX,
	SIMPLE_TEXT_FONT_PX,
	SIMPLE_TITLE_FONT_PX,
	TLDRAW_TEXT_S_PX,
	layoutBlock,
	type BlockRect,
} from '../layoutBlock'
import { portDefaultValue } from '../blockModel'
import { portTldrawColor } from '../ui/portPalette'

/** The painted ring around a port dot: a 12px core inside a 3px colour ring. */
export const PORT_INDICATOR_RADIUS = BLOCK_PORT_RADIUS + 3

/** tldraw renders a `size: 's'` label at 18px against the default 16px root. */
const TLDRAW_LINE_HEIGHT = 1.35

/**
 * Text runs are measured with the DOM's own measurer when there is one, so a
 * right-aligned output name lands where flexbox put it. The fallback keeps this
 * module importable — and testable — in Node.
 */
let measureContext: CanvasRenderingContext2D | null | undefined
function measureText(text: string, px: number, family: string, weight = 400): number {
	if (measureContext === undefined) {
		measureContext = typeof document === 'undefined'
			? null
			: (document.createElement('canvas').getContext('2d') ?? null)
	}
	if (measureContext) {
		measureContext.font = `${weight} ${px}px ${family}`
		const width = measureContext.measureText(text).width
		if (width > 0) return width
	}
	return text.length * px * 0.62
}

interface TextOptions {
	text: string
	/** Font size the Block drew this at, in shape-local pixels. */
	px: number
	/** The layout box this text occupies, in shape-local pixels. */
	box: BlockRect
	origin: { x: number; y: number }
	font: 'sans' | 'mono'
	color: TLDefaultColorStyle
	align: 'start' | 'middle' | 'end'
}

function textAt(options: TextOptions): TLShapePartial {
	// A text shape is positioned by its top-left, so centre it inside the row
	// the layout allocated rather than trusting that row's top edge.
	const height = options.px * TLDRAW_LINE_HEIGHT
	const scale = options.px / TLDRAW_TEXT_S_PX
	return {
		id: createShapeId(),
		type: 'text',
		x: options.origin.x + options.box.x,
		y: options.origin.y + options.box.y + (options.box.h - height) / 2,
		props: {
			richText: toRichText(options.text),
			color: options.color,
			size: 's',
			font: options.font,
			scale,
			autoSize: false,
			// `w` is in the shape's PRE-scale units: a 40px-wide label drawn at
			// scale 2/3 needs w=60, or tldraw wraps the text mid-word.
			w: Math.max(1, options.box.w / scale),
			textAlign: options.align,
		},
	}
}

function lineAt(
	origin: { x: number; y: number },
	y: number,
	width: number,
	x = 0,
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'line',
		x: origin.x + x,
		y: origin.y + y,
		props: {
			points: {
				a1: { id: 'a1', index: 'a1' as never, x: 0, y: 0 },
				a2: { id: 'a2', index: 'a2' as never, x: width, y: 0 },
			},
			color: 'grey',
			dash: 'solid',
			size: 's',
		},
	}
}

function outlineAt(
	origin: { x: number; y: number },
	box: BlockRect,
	color: TLDefaultColorStyle,
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'geo',
		x: origin.x + box.x,
		y: origin.y + box.y,
		props: {
			geo: 'rectangle',
			w: Math.max(1, box.w),
			h: Math.max(1, box.h),
			color,
			fill: 'none',
			dash: 'solid',
			size: 's',
		},
	}
}

export interface BlockPrimitives {
	/** Card first — it is the shape cables are re-pointed at. */
	shapes: TLShapePartial[]
	cardId: TLShapeId
}

/**
 * Build the stock shapes that reproduce one Block's appearance.
 *
 * `connectedPortIds` decides which dots detach filled: a hollow core means no
 * cable, which is what the live canvas draws, and freezing the screen is the
 * whole contract.
 */
export function primitivesForBlock(
	props: BlockShapeProps,
	origin: { x: number; y: number },
	connectedPortIds: ReadonlySet<string> = new Set(),
): BlockPrimitives {
	const layout = layoutBlock(props)
	const { width, height } = layout

	const card: TLShapePartial = {
		id: createShapeId(),
		type: 'geo',
		x: origin.x,
		y: origin.y,
		props: {
			geo: 'rectangle',
			w: width,
			h: height,
			color: 'grey',
			// 'semi' is the near-white tint, so the card reads the way the Block
			// draws itself — white against the canvas, with a grey outline.
			fill: 'semi',
			dash: 'solid',
			size: 's',
		},
	}

	const parts: TLShapePartial[] = []

	// Simple is chromeless: a centred stack on a bare card, no heading band and
	// no footer rule. Port and Expanded wear both.
	const chromeless = layout.view === 'simple'

	if (!chromeless) {
		parts.push(lineAt(origin, layout.headerHeight, width))
		if (layout.headerIcon) parts.push(outlineAt(origin, layout.headerIcon, 'grey'))
		// An untitled Block detaches to no text shape at all: an empty tldraw
		// text shape is an invisible, unselectable box the user has to hunt for.
		if (layout.headerTitle && props.title !== '') {
			parts.push(textAt({
				text: props.title, px: PORT_TITLE_FONT_PX, box: layout.headerTitle,
				origin, font: 'mono', color: 'black', align: 'start',
			}))
		}
		if (layout.headerType && props.blockType !== '') {
			parts.push(textAt({
				text: props.blockType, px: PORT_TEXT_FONT_PX, box: layout.headerType,
				origin, font: 'sans', color: 'grey', align: 'end',
			}))
		}

		// Full rules split async rows, right-half rules split conditional
		// branches — the same geometry the Block draws.
		for (const divider of layout.dividers) {
			parts.push(lineAt(origin, divider.y, divider.w, divider.x))
		}
		parts.push(lineAt(origin, layout.footerTop, width))
	}

	// The Simple face: an icon box, an XL title, and the S description/type.
	// A lucide glyph has no primitive equivalent, so the icon becomes a square
	// outline — the second declared approximation.
	if (layout.icon) parts.push(outlineAt(origin, layout.icon, 'black'))
	if (layout.title && props.title !== '') {
		const textLeft = layout.icon ? layout.icon.x + layout.icon.w + SIMPLE_ICON_GAP_PX : 0
		const titleBox = layout.icon
			? { ...layout.title, x: textLeft, w: Math.max(1, layout.title.x + layout.title.w - textLeft) }
			: layout.title
		parts.push(textAt({
			text: props.title, px: SIMPLE_TITLE_FONT_PX, box: titleBox,
			origin, font: 'sans', color: 'black', align: layout.icon ? 'start' : 'middle',
		}))
	}
	if (layout.description && props.showDescription && props.description !== '') {
		parts.push(textAt({
			text: props.description, px: SIMPLE_TEXT_FONT_PX, box: layout.description,
			origin, font: 'sans', color: 'grey', align: 'middle',
		}))
	}
	if (layout.typeLabel && props.blockType !== '') {
		parts.push(textAt({
			text: props.blockType, px: SIMPLE_TEXT_FONT_PX, box: layout.typeLabel,
			origin, font: 'sans', color: 'grey', align: 'middle',
		}))
	}

	// Port labels. The NAME hugs the edge its dot sits on and the type sits
	// inboard of it, mirroring the DOM's span order on each side. Names are
	// aligned to their box's edge, so their anchoring never depends on how this
	// measurer's font differs from tldraw's; only the TYPE's offset rides on
	// the measured name.
	const gap = 6
	for (const placed of layout.ports) {
		if (!placed.label) continue
		const nameWidth = Math.min(
			measureText(placed.port.name, PORT_TEXT_FONT_PX, "'Inter', sans-serif"),
			placed.label.w,
		)
		const hasType = placed.port.type !== ''
		if (placed.side === 'input') {
			if (placed.port.name !== '') {
				parts.push(textAt({
					text: placed.port.name, px: PORT_TEXT_FONT_PX, box: placed.label,
					origin, font: 'sans', color: 'black', align: 'start',
				}))
			}
			if (hasType) {
				const x = placed.label.x + nameWidth + gap
				parts.push(textAt({
					text: placed.port.type, px: PORT_TEXT_FONT_PX,
					box: { ...placed.label, x, w: Math.max(1, placed.label.x + placed.label.w - x) },
					origin, font: 'mono', color: 'grey', align: 'start',
				}))
			}
		} else {
			if (placed.port.name !== '') {
				parts.push(textAt({
					text: placed.port.name, px: PORT_TEXT_FONT_PX, box: placed.label,
					origin, font: 'sans', color: 'black', align: 'end',
				}))
			}
			if (hasType) {
				parts.push(textAt({
					text: placed.port.type, px: PORT_TEXT_FONT_PX,
					box: { ...placed.label, w: Math.max(1, placed.label.w - nameWidth - gap) },
					origin, font: 'mono', color: 'grey', align: 'end',
				}))
			}
		}
	}

	// The dots last, so they sit above the card. A dot is a 12px core inside a
	// colour ring with the card showing through between them: hollow until a
	// cable lands, grey-filled when an unwired input carries a default.
	// A Simple anchor is invisible until hovered, so the frozen copy draws none.
	for (const placed of layout.ports) {
		if (placed.subtle) continue
		const color = portTldrawColor(placed.port.type)
		const connected = connectedPortIds.has(placed.port.id)
		const hasDefault = portDefaultValue(placed.port) !== ''
		parts.push({
			id: createShapeId(),
			type: 'geo',
			x: origin.x + placed.x - PORT_INDICATOR_RADIUS,
			y: origin.y + placed.y - PORT_INDICATOR_RADIUS,
			props: {
				geo: 'ellipse',
				w: PORT_INDICATOR_RADIUS * 2,
				h: PORT_INDICATOR_RADIUS * 2,
				color, fill: 'none', dash: 'solid', size: 's',
			},
		})
		parts.push({
			id: createShapeId(),
			type: 'geo',
			x: origin.x + placed.x - BLOCK_PORT_RADIUS,
			y: origin.y + placed.y - BLOCK_PORT_RADIUS,
			props: {
				geo: 'ellipse',
				w: BLOCK_PORT_RADIUS * 2,
				h: BLOCK_PORT_RADIUS * 2,
				color: !connected && hasDefault ? 'grey' : color,
				fill: connected ? 'fill' : hasDefault ? 'solid' : 'semi',
				dash: 'solid', size: 's',
			},
		})
	}

	return { shapes: [card, ...parts], cardId: card.id as TLShapeId }
}
