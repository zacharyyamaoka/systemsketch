/**
 * A Block's appearance expressed as editable tldraw primitives.
 *
 * Geometry comes only from `layoutBlock`, the same authority used by the live
 * renderer and cable anchors. The resulting records deliberately use only
 * stock tldraw props: a detached Block must remain meaningful when its
 * metadata is ignored and no SystemSketch shape utility is registered.
 */
import { createShapeId, toRichText } from 'tldraw'
import type {
	TLDefaultColorStyle,
	TLDefaultSizeStyle,
	TLGeoShape,
	TLShapeId,
	TLShapePartial,
} from 'tldraw'

import { portDefaultValue, type BlockShapeProps } from '../blockModel'
import {
	BLOCK_CORNER_RADIUS,
	BLOCK_PORT_RADIUS,
	PORT_TEXT_FONT_PX,
	PORT_TITLE_FONT_PX,
	SIMPLE_ICON_GAP_PX,
	SIMPLE_TEXT_FONT_PX,
	SIMPLE_TITLE_FONT_PX,
	layoutBlock,
	type BlockRect,
	type LaidOutBlockPort,
} from '../layoutBlock'
import { portColor, portTldrawColor } from '../ui/portPalette'
import { valueBlockLabel, valueBlockText } from '../valueBlock'

/** The outer ring keeps the live indicator's full 18px footprint. */
export const PORT_INDICATOR_RADIUS = BLOCK_PORT_RADIUS + 3
/** Connected/default ports add the live 12px filled core inside that ring. */
export const PORT_CORE_RADIUS = BLOCK_PORT_RADIUS

const SANS_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const PORT_LABEL_GAP_PX = 8
const PORT_DEFAULT_FONT_PX = 13
const PORT_DEFAULT_LINE_PX = 18
const PORT_DEFAULT_PAD_X_PX = 7
const PORT_DEFAULT_MAX_CONTENT_PX = 88

let measureContext: CanvasRenderingContext2D | null | undefined
const measuredText = new Map<string, number>()
function measureText(text: string, px: number, family: string, weight = 400): number {
	const key = `${weight}:${px}:${family}:${text}`
	const cached = measuredText.get(key)
	if (cached !== undefined) return cached
	if (typeof document !== 'undefined') {
		const probe = document.createElement('span')
		probe.textContent = text
		Object.assign(probe.style, {
			position: 'fixed',
			left: '-10000px',
			top: '0',
			visibility: 'hidden',
			whiteSpace: 'nowrap',
			fontFamily: family,
			fontSize: `${px}px`,
			fontWeight: String(weight),
			lineHeight: 'normal',
		})
		document.body.appendChild(probe)
		const width = probe.getBoundingClientRect().width
		probe.remove()
		if (width > 0) {
			measuredText.set(key, width)
			return width
		}
	}
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
	return text.length * px * (family === MONO_FONT ? 0.61 : 0.55)
}
interface TextOptions {
	text: string
	px: number
	lineHeight: number
	weight: number
	box: BlockRect
	origin: { x: number; y: number }
	font: 'sans' | 'mono'
	color: string
	stockColor: TLDefaultColorStyle
	align: 'start' | 'middle' | 'end'
	letterSpacing?: string
	/** Prevent a one-line DOM label from becoming a two-line text primitive. */
	naturalWidth?: number
}

function fontFamily(font: 'sans' | 'mono'): string {
	return font === 'mono' ? MONO_FONT : SANS_FONT
}

/**
 * The four stock text sizes are 18, 24, 36, and 44 canvas px in this pinned
 * tldraw build. `scale` is a stock, serialised text prop, so it lets a
 * primitive retain the authored 11px, 13px, or 16px rhythm rather than
 * snapping every label to the 18px `s` preset.
 */
const STOCK_TEXT_BASES: ReadonlyArray<{ size: TLDefaultSizeStyle; px: number }> = [
	{ size: 's', px: 18 },
	{ size: 'm', px: 24 },
	{ size: 'l', px: 36 },
	{ size: 'xl', px: 44 },
]

function stockTextStyle(px: number): { size: TLDefaultSizeStyle; scale: number } {
	const base = STOCK_TEXT_BASES.find((candidate) => px <= candidate.px)
		?? STOCK_TEXT_BASES[STOCK_TEXT_BASES.length - 1]
	return { size: base.size, scale: px / base.px }
}

type RichTextNode = {
	type: string
	text?: string
	marks?: Array<{ type: string }>
	content?: RichTextNode[]
	[key: string]: unknown
}

/** Apply the stock rich-text bold mark when the authored label is semibold. */
function richTextForWeight(text: string, weight: number) {
	const richText = toRichText(text)
	if (weight < 600) return richText
	return {
		...richText,
		content: (richText.content as RichTextNode[]).map((paragraph) => ({
			...paragraph,
			content: paragraph.content?.map((leaf) => leaf.type === 'text'
				? { ...leaf, marks: [...(leaf.marks ?? []), { type: 'bold' }] }
				: leaf),
		})),
	}
}

function textAt(options: TextOptions): TLShapePartial {
	const stock = stockTextStyle(options.px)
	const naturalWidth = options.naturalWidth
		?? measureText(options.text, options.px, fontFamily(options.font), options.weight)
	// TextShapeUtil floors a fixed width before it measures. The live DOM does
	// not, so reserve the same +1 tldraw itself uses for auto-sized labels.
	// RichTextLabel adds a small DOM measurement tolerance on top of that
	// floor. Keep it inside the row's 8px inter-item gap rather than letting a
	// final glyph wrap and disappear below the fixed 24px row.
	const width = Math.max(1, Math.ceil(Math.max(options.box.w, naturalWidth)) + 10)
	const x = options.align === 'end'
		? options.box.x + options.box.w - width
		: options.align === 'middle'
			? options.box.x + (options.box.w - width) / 2
			: options.box.x
	return {
		id: createShapeId(),
		type: 'text',
		x: options.origin.x + x,
		y: options.origin.y + options.box.y + (options.box.h - options.lineHeight) / 2,
		props: {
			richText: richTextForWeight(options.text, options.weight),
			color: options.stockColor,
			size: stock.size,
			font: options.font,
			scale: stock.scale,
			autoSize: false,
			// Width lives in the text shape's unscaled coordinate system.
			w: width / stock.scale,
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

function roundedRectAt(
	origin: { x: number; y: number },
	box: BlockRect,
	options: {
		cornerRadius: number
		fillColor: string
		strokeColor: string
		strokeWidth?: number
		stockColor?: TLDefaultColorStyle
		stockFill?: 'none' | 'semi' | 'solid' | 'fill'
	},
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'geo',
		x: origin.x + box.x,
		y: origin.y + box.y,
		props: {
			// tldraw's stock oval is its capsule primitive. It is an honest
			// approximation for default-value chips; every other rounded surface
			// becomes the ordinary editable rectangle.
			geo: (options.cornerRadius >= Math.min(box.w, box.h) / 2
				? 'oval'
				: 'rectangle') as TLGeoShape['props']['geo'],
			w: Math.max(1, box.w),
			h: Math.max(1, box.h),
			color: options.stockColor ?? 'grey',
			fill: options.stockFill ?? 'semi',
			dash: 'solid',
			size: 's',
		},
	}
}

function ellipseAt(
	box: BlockRect,
	options: {
		fillColor: string
		strokeColor: string
		strokeWidth?: number
		stockColor?: TLDefaultColorStyle
		stockFill?: 'none' | 'semi' | 'solid' | 'fill'
	},
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'geo',
		x: box.x,
		y: box.y,
		props: {
			geo: 'ellipse',
			w: Math.max(1, box.w),
			h: Math.max(1, box.h),
			color: options.stockColor ?? 'grey',
			fill: options.stockFill ?? 'semi',
			dash: 'solid',
			size: 's',
		},
	}
}

interface PortLabelElement {
	kind: 'name' | 'type' | 'default'
	text: string
	font: 'sans' | 'mono'
	px: number
	lineHeight: number
	color: string
	stockColor: TLDefaultColorStyle
	contentWidth: number
	outerWidth: number
}

/** Project the live flex row into separately editable shapes at the same boxes. */
function portLabelsAt(
	placed: LaidOutBlockPort,
	origin: { x: number; y: number },
): TLShapePartial[] {
	if (!placed.label) return []
	const defaultValue = placed.side === 'input' ? portDefaultValue(placed.port) : ''
	const element = (
		kind: PortLabelElement['kind'],
		text: string,
		font: 'sans' | 'mono',
		px: number,
		lineHeight: number,
		color: string,
		stockColor: TLDefaultColorStyle,
	): PortLabelElement => {
		const measured = measureText(text, px, fontFamily(font))
		const contentWidth = kind === 'default'
			? Math.min(PORT_DEFAULT_MAX_CONTENT_PX, measured)
			: measured
		return {
			kind, text, font, px, lineHeight, color, stockColor, contentWidth,
			outerWidth: contentWidth + (kind === 'default' ? PORT_DEFAULT_PAD_X_PX * 2 + 2 : 0),
		}
	}
	const name = element('name', placed.port.name, 'sans', PORT_TEXT_FONT_PX, 24, 'var(--ss-text)', 'black')
	const type = element('type', placed.port.type, 'mono', PORT_TEXT_FONT_PX, 24, 'var(--ss-text-muted)', 'grey')
	const chip = element(
		'default', defaultValue === '' ? '' : `= ${defaultValue}`,
		'mono', PORT_DEFAULT_FONT_PX, PORT_DEFAULT_LINE_PX, 'var(--ss-text-muted)', 'grey',
	)
	const ordered = (placed.side === 'input' ? [name, type, chip] : [type, name, chip])
		.filter((part) => part.text !== '')
	if (ordered.length === 0) return []

	const gaps = PORT_LABEL_GAP_PX * Math.max(0, ordered.length - 1)
	const desired = ordered.reduce((sum, part) => sum + part.outerWidth, gaps)
	let x = placed.side === 'input'
		? placed.label.x
		: placed.label.x + placed.label.w - desired
	const result: TLShapePartial[] = []

	for (const part of ordered) {
		if (part.kind === 'default') {
			const pillY = placed.label.y + (placed.label.h - (PORT_DEFAULT_LINE_PX + 2)) / 2
			result.push(roundedRectAt(origin, {
				x,
				y: pillY,
				w: part.outerWidth,
				h: PORT_DEFAULT_LINE_PX + 2,
			}, {
				cornerRadius: 999,
				fillColor: 'var(--ss-surface-sunken)',
				strokeColor: 'var(--ss-border)',
				stockColor: 'grey',
				stockFill: 'semi',
			}))
			result.push(textAt({
				text: part.text,
				px: part.px,
				lineHeight: part.lineHeight,
				weight: 400,
				box: {
					x: x + PORT_DEFAULT_PAD_X_PX + 1,
					y: pillY + 1,
					w: part.contentWidth,
					h: PORT_DEFAULT_LINE_PX,
				},
				origin,
				font: part.font,
				color: part.color,
				stockColor: part.stockColor,
				align: 'start',
				naturalWidth: Math.min(part.contentWidth, measureText(part.text, part.px, fontFamily(part.font))),
			}))
		} else {
			result.push(textAt({
				text: part.text,
				px: part.px,
				lineHeight: part.lineHeight,
				weight: 400,
				box: { x, y: placed.label.y, w: part.outerWidth, h: placed.label.h },
				origin,
				font: part.font,
				color: part.color,
				stockColor: part.stockColor,
				align: 'start',
				naturalWidth: part.contentWidth,
			}))
		}
		x += part.outerWidth + PORT_LABEL_GAP_PX
	}
	return result
}

export interface PortPrimitiveRow {
	portId: string
	side: 'input' | 'output'
	/** Circle, name, type, and both default-chip shapes for this one row. */
	shapeIds: TLShapeId[]
}

export interface BlockPrimitives {
	/** Card first — it is the shape cables are re-pointed at. */
	shapes: TLShapePartial[]
	cardId: TLShapeId
	/** Membership used by detach to make groups nested inside the Block group. */
	portRows: PortPrimitiveRow[]
}

export function primitivesForBlock(
	props: BlockShapeProps,
	origin: { x: number; y: number },
	connectedPortIds: ReadonlySet<string> = new Set(),
): BlockPrimitives {
	const layout = layoutBlock(props)
	const { width, height } = layout
	const card = roundedRectAt(origin, { x: 0, y: 0, w: width, h: height }, {
		cornerRadius: layout.view === 'value' ? height / 2 : BLOCK_CORNER_RADIUS,
		fillColor: 'var(--ss-surface-raised)',
		strokeColor: 'var(--ss-border)',
		stockColor: 'grey',
		stockFill: 'semi',
	})
	const parts: TLShapePartial[] = []
	const portRows = new Map<string, PortPrimitiveRow>()
	const pushPortPart = (placed: LaidOutBlockPort, partial: TLShapePartial) => {
		parts.push(partial)
		const key = `${placed.side}:${placed.port.id}`
		let row = portRows.get(key)
		if (!row) {
			row = { portId: placed.port.id, side: placed.side, shapeIds: [] }
			portRows.set(key, row)
		}
		row.shapeIds.push(partial.id as TLShapeId)
	}

	// A Value Block is already a pill in the semantic canvas. Detaching keeps
	// that truth with stock `geo: oval`, ordinary stock text, and rim dots — no
	// custom radius renderer or portable-only cleanup pass required.
	if (layout.view === 'value') {
		if (layout.title) {
			parts.push(textAt({
				text: valueBlockText(valueBlockLabel(props)), px: PORT_TITLE_FONT_PX,
				lineHeight: layout.title.h, weight: 500, box: layout.title, origin,
				font: 'mono', color: 'var(--ss-text)', stockColor: 'black', align: 'middle',
			}))
		}
		for (const placed of layout.ports) {
			const exactColor = portColor(placed.port.type)
			const stockColor = portTldrawColor(placed.port.type)
			pushPortPart(placed, ellipseAt({
				x: origin.x + placed.x - PORT_INDICATOR_RADIUS,
				y: origin.y + placed.y - PORT_INDICATOR_RADIUS,
				w: PORT_INDICATOR_RADIUS * 2, h: PORT_INDICATOR_RADIUS * 2,
			}, {
				fillColor: 'var(--ss-surface-raised)', strokeColor: exactColor, strokeWidth: 1,
				stockColor, stockFill: 'semi',
			}))
		}
		return { shapes: [card, ...parts], cardId: card.id as TLShapeId, portRows: [...portRows.values()] }
	}

	const chromeless = layout.view === 'simple'
	if (!chromeless) {
		parts.push(lineAt(origin, layout.headerHeight, width))
		if (layout.headerIcon) {
			parts.push(roundedRectAt(origin, layout.headerIcon, {
				cornerRadius: 4,
				fillColor: 'transparent',
				strokeColor: 'var(--ss-text-muted)',
				stockFill: 'none',
			}))
		}
		if (layout.headerTitle && props.title !== '') {
			parts.push(textAt({
				text: props.title, px: PORT_TITLE_FONT_PX, lineHeight: 40, weight: 500,
				box: layout.headerTitle, origin, font: 'mono', color: 'var(--ss-text)',
				stockColor: 'black', align: 'start', letterSpacing: '-0.02em',
			}))
		}
		if (layout.headerType && props.blockType !== '') {
			parts.push(textAt({
				text: props.blockType, px: PORT_TEXT_FONT_PX, lineHeight: 24, weight: 400,
				box: layout.headerType, origin, font: 'sans', color: 'var(--ss-text-muted)',
				stockColor: 'grey', align: 'end',
			}))
		}
		for (const divider of layout.dividers) {
			parts.push(lineAt(origin, divider.y, divider.w, divider.x))
		}
		parts.push(lineAt(origin, layout.footerTop, width))

		const footerCentreY = layout.footerTop + (height - layout.footerTop - 6) / 2
		const kebabX = origin.x + width - 20
		for (const dy of [-4, 0, 4]) {
			parts.push(ellipseAt({ x: kebabX - 1, y: origin.y + footerCentreY + dy - 1, w: 2, h: 2 }, {
				fillColor: 'var(--ss-text-muted)',
				strokeColor: 'var(--ss-text-muted)',
				strokeWidth: 0,
				stockColor: 'grey',
				stockFill: 'solid',
			}))
		}
	}

	if (layout.icon) {
		parts.push(roundedRectAt(origin, layout.icon, {
			cornerRadius: 6,
			fillColor: 'transparent',
			strokeColor: 'var(--ss-text)',
			stockColor: 'black',
			stockFill: 'none',
		}))
	}
	if (layout.title && props.title !== '') {
		const textLeft = layout.icon ? layout.icon.x + layout.icon.w + SIMPLE_ICON_GAP_PX : 0
		const titleBox = layout.icon
			? { ...layout.title, x: textLeft, w: Math.max(1, layout.title.x + layout.title.w - textLeft) }
			: layout.title
		parts.push(textAt({
			text: props.title, px: SIMPLE_TITLE_FONT_PX, lineHeight: 50, weight: 600,
			box: titleBox, origin, font: 'sans', color: 'var(--ss-text)',
			stockColor: 'black', align: layout.icon ? 'start' : 'middle',
		}))
	}
	if (layout.description && props.showDescription && props.description !== '') {
		parts.push(textAt({
			text: props.description,
			px: chromeless ? SIMPLE_TEXT_FONT_PX : 11,
			lineHeight: chromeless ? 24 : 16,
			weight: 400,
			box: layout.description,
			origin,
			font: 'sans',
			color: 'var(--ss-text-muted)',
			stockColor: 'grey',
			align: chromeless ? 'middle' : 'start',
		}))
	}
	if (layout.typeLabel && props.blockType !== '') {
		parts.push(textAt({
			text: props.blockType, px: SIMPLE_TEXT_FONT_PX, lineHeight: 24, weight: 400,
			box: layout.typeLabel, origin, font: 'sans', color: 'var(--ss-text-muted)',
			stockColor: 'grey', align: 'middle',
		}))
	}

	for (const placed of layout.ports) {
		for (const label of portLabelsAt(placed, origin)) pushPortPart(placed, label)
	}

	for (const placed of layout.ports) {
		if (placed.subtle) continue
		const exactColor = portColor(placed.port.type)
		const stockColor = portTldrawColor(placed.port.type)
		const connected = connectedPortIds.has(placed.port.id)
		const hasDefault = placed.side === 'input' && portDefaultValue(placed.port) !== ''
		// The live DOM dot is a 12px core with a 2px surface gap and a 1px
		// type-coloured ring. Keep the ring as the stable outer primitive, then
		// add the core only when the live port paints one (wired or defaulted).
		pushPortPart(placed, ellipseAt({
			x: origin.x + placed.x - PORT_INDICATOR_RADIUS,
			y: origin.y + placed.y - PORT_INDICATOR_RADIUS,
			w: PORT_INDICATOR_RADIUS * 2,
			h: PORT_INDICATOR_RADIUS * 2,
		}, {
			fillColor: 'var(--ss-surface-raised)',
			strokeColor: exactColor,
			strokeWidth: 1,
			stockColor,
			stockFill: 'semi',
		}))
		if (connected || hasDefault) {
			const coreColor = connected ? exactColor : 'var(--ss-text-muted)'
			pushPortPart(placed, ellipseAt({
				x: origin.x + placed.x - PORT_CORE_RADIUS,
				y: origin.y + placed.y - PORT_CORE_RADIUS,
				w: PORT_CORE_RADIUS * 2,
				h: PORT_CORE_RADIUS * 2,
			}, {
				fillColor: coreColor,
				strokeColor: coreColor,
				strokeWidth: 0,
				stockColor: connected ? stockColor : 'grey',
				stockFill: 'solid',
			}))
		}
	}

	return {
		shapes: [card, ...parts],
		cardId: card.id as TLShapeId,
		portRows: [...portRows.values()],
	}
}
