/**
 * Exact visual options for stock shapes created by SystemSketch composites.
 *
 * The records remain ordinary tldraw `geo`, `line`, and `text` shapes. Their
 * metadata only supplies display values that the public `ShapeUtil.configure`
 * seam deliberately exposes. Plain tldraw ignores the metadata and still
 * opens the shapes; SystemSketch can reproduce the composite's token colours,
 * one-pixel rules, and typography without forking any engine primitive.
 */
import {
	LineShapeUtil,
	PathBuilder,
	TextShapeUtil,
	type TLGeoShape,
	type JsonObject,
	type TLLineShape,
	type TLShape,
	type TLTextShape,
} from 'tldraw'
import { createElement } from 'react'
import type { CSSProperties } from 'react'

export const SYSTEMSKETCH_PRIMITIVE_STYLE_META_KEY = 'systemSketchPrimitiveStyle'
export const SYSTEMSKETCH_ROUNDED_RECT_GEO = 'systemsketch-rounded-rect'

export interface SystemSketchTextPrimitiveStyle {
	kind: 'text'
	color: string
	fontFamily: string
	fontSize: number
	fontWeight: number
	lineHeight: number
	letterSpacing?: string
}

export interface SystemSketchLinePrimitiveStyle {
	kind: 'line'
	strokeColor: string
	strokeWidth: number
}

export interface SystemSketchGeoPrimitiveStyle {
	kind: 'geo'
	fillColor: string
	strokeColor: string
	strokeWidth: number
	cornerRadius?: number
}

export type SystemSketchPrimitiveStyle =
	| SystemSketchTextPrimitiveStyle
	| SystemSketchLinePrimitiveStyle
	| SystemSketchGeoPrimitiveStyle

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** Read only the small, finite display contract written by our detach code. */
export function readSystemSketchPrimitiveStyle(
	shape: Pick<TLShape, 'meta'>,
): SystemSketchPrimitiveStyle | null {
	const value = shape.meta[SYSTEMSKETCH_PRIMITIVE_STYLE_META_KEY]
	if (!isRecord(value) || typeof value.kind !== 'string') return null
	return value as unknown as SystemSketchPrimitiveStyle
}

/** Merge one exact display contract into a stock shape's metadata. */
export function systemSketchPrimitiveMeta(
	style: SystemSketchPrimitiveStyle,
	meta: JsonObject = {},
): JsonObject {
	return {
		...meta,
		[SYSTEMSKETCH_PRIMITIVE_STYLE_META_KEY]: style as unknown as JsonObject,
	}
}

/** One reusable rounded rectangle path for cards and compact value chips. */
export function getSystemSketchRoundedRectPath(
	width: number,
	height: number,
	radius: number,
	isFilled = false,
): PathBuilder {
	const w = Math.max(0, width)
	const h = Math.max(0, height)
	const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2)
	if (r === 0) {
		return new PathBuilder()
			.moveTo(0, 0, { geometry: { isFilled } })
			.lineTo(w, 0)
			.lineTo(w, h)
			.lineTo(0, h)
			.close()
	}
	const k = (2 * r) / 3
	return new PathBuilder()
		.moveTo(r, 0, { geometry: { isFilled } })
		.lineTo(w - r, 0)
		.cubicBezierTo(w, r, w - r + k, 0, w, r - k)
		.lineTo(w, h - r)
		.cubicBezierTo(w - r, h, w, h - r + k, w - r + k, h)
		.lineTo(r, h)
		.cubicBezierTo(0, h - r, r - k, h, 0, h - r + k)
		.lineTo(0, r)
		.cubicBezierTo(r, 0, 0, r - k, r - k, 0)
		.close()
}

/** Display values consumed by the configured stock GeoShapeUtil. */
export function systemSketchGeoDisplayValues(shape: TLGeoShape) {
	const style = readSystemSketchPrimitiveStyle(shape)
	if (style?.kind !== 'geo') return {}
	return {
		fillColor: style.fillColor,
		strokeColor: style.strokeColor,
		strokeWidth: style.strokeWidth,
	}
}

/** Exact Block typography on otherwise normal, editable stock text shapes. */
const ConfiguredSystemSketchTextShapeUtil = TextShapeUtil.configure({
	getCustomDisplayValues(_editor, shape: TLTextShape) {
		const style = readSystemSketchPrimitiveStyle(shape)
		if (style?.kind !== 'text') return {}
		return {
			color: style.color,
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontWeight: String(style.fontWeight),
			lineHeight: style.lineHeight / style.fontSize,
		}
	},
})

class SystemSketchTextShapeUtil extends ConfiguredSystemSketchTextShapeUtil {
	override component(shape: TLTextShape) {
		const rendered = super.component(shape)
		const style = readSystemSketchPrimitiveStyle(shape)
		if (style?.kind !== 'text') return rendered
		return createElement('span', {
			className: 'systemsketch-detached-text-visual',
			style: {
				display: 'contents',
				'--systemsketch-detached-font-weight': String(style.fontWeight),
				'--systemsketch-detached-letter-spacing': style.letterSpacing ?? 'normal',
			} as CSSProperties,
		}, rendered)
	}
}

/** Exact one-pixel Block rules on ordinary stock line shapes. */
const SystemSketchLineShapeUtil = LineShapeUtil.configure({
	getCustomDisplayValues(_editor, shape: TLLineShape) {
		const style = readSystemSketchPrimitiveStyle(shape)
		if (style?.kind !== 'line') return {}
		return {
			strokeColor: style.strokeColor,
			strokeWidth: style.strokeWidth,
		}
	},
})

/** Add beside tldraw's defaults; both utilities retain their stock type ids. */
export const SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS = [
	SystemSketchTextShapeUtil,
	SystemSketchLineShapeUtil,
]
