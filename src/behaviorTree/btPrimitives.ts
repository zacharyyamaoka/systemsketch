/**
 * A Behavior Tree region's painted layer expressed as stock tldraw primitives.
 *
 * Geometry comes only from `projectBehaviorTree` — the same authority the live
 * canvas paints from — so a detached region is the picture the person was
 * looking at, not a second drawing of it. Pure: props in, region-local shape
 * partials out, no editor and no tldraw runtime.
 *
 * What is *not* here: the leaves and the Blackboard pills. Those are real
 * Blocks on the canvas, so they go through the ordinary Block detach and
 * become the same stock group any detached Block becomes. Only the things the
 * region itself paints — control cards, wires, rails, merge marks, chips,
 * group boxes and Start — are lowered here.
 */
import { createShapeId, toRichText } from 'tldraw'
import type {
	TLDefaultColorStyle,
	TLShapePartial,
} from 'tldraw'

import {
	BT_HEADER_H,
	type BehaviorTreeShapeProps,
	type BtPoint,
	type BtRect,
	type BtSceneEdge,
} from './behaviorTreeModel'
import {
	projectBehaviorTree,
	projectedEdges,
	rectToRegion,
	sceneToRegion,
	type BtProjectionResult,
} from './behaviorTreeProjection'

/**
 * Ordered index keys for a polyline. tldraw sorts a line's points by index and
 * its alphabet — digits, then upper case, then lower — happens to agree with
 * JavaScript's own string comparison, so same-length keys stay in order past
 * the ninth point (`a9` → `aA`), which `a10` would not.
 */
const INDEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function indexKeyAt(position: number): string {
	return `a${INDEX_ALPHABET[Math.min(position, INDEX_ALPHABET.length - 1)]}`
}

function polyline(
	points: BtPoint[],
	options: { color?: TLDefaultColorStyle; opacity?: number; size?: 's' | 'm'; dash?: 'solid' | 'dashed' } = {},
): TLShapePartial | null {
	if (points.length < 2) return null
	const origin = points[0]
	const entries: Record<string, { id: string; index: string; x: number; y: number }> = {}
	points.forEach((point, position) => {
		const id = indexKeyAt(position)
		entries[id] = { id, index: id, x: point.x - origin.x, y: point.y - origin.y }
	})
	return {
		id: createShapeId(),
		type: 'line',
		x: origin.x,
		y: origin.y,
		opacity: options.opacity,
		props: {
			points: entries as never,
			color: options.color ?? 'grey',
			dash: options.dash ?? 'solid',
			size: options.size ?? 's',
		},
	}
}

function text(
	content: string,
	box: { x: number; y: number; w: number },
	options: {
		align?: 'start' | 'middle'
		color?: TLDefaultColorStyle
		font?: 'sans' | 'mono'
		scale?: number
		bold?: boolean
	} = {},
): TLShapePartial | null {
	if (!content) return null
	const scale = options.scale ?? 1
	const richText = toRichText(content)
	const weighted = options.bold
		? {
			...richText,
			content: richText.content.map((paragraph) => {
				const node = paragraph as { content?: Array<{ type?: string; marks?: Array<{ type: string }>; [key: string]: unknown }>; [key: string]: unknown }
				return {
					...node,
					content: node.content?.map((leaf) => leaf.type === 'text'
						? { ...leaf, marks: [...(leaf.marks ?? []), { type: 'bold' }] }
						: leaf),
				}
			}),
		}
		: richText
	return {
		id: createShapeId(),
		type: 'text',
		x: box.x,
		y: box.y,
		props: {
			richText: weighted,
			autoSize: false,
			color: options.color ?? 'black',
			font: options.font ?? 'sans',
			scale,
			size: 's',
			textAlign: options.align ?? 'middle',
			w: Math.max(1, box.w / scale),
		},
	}
}

function rectangle(
	rect: BtRect,
	options: {
		color?: TLDefaultColorStyle
		fill?: 'none' | 'semi' | 'solid'
		dash?: 'solid' | 'dashed'
		geo?: 'rectangle' | 'oval' | 'triangle'
		size?: 's' | 'm'
	} = {},
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'geo',
		x: rect.x,
		y: rect.y,
		props: {
			geo: options.geo ?? 'rectangle',
			w: Math.max(1, rect.w),
			h: Math.max(1, rect.h),
			color: options.color ?? 'black',
			fill: options.fill ?? 'none',
			dash: options.dash ?? 'solid',
			size: options.size ?? 's',
		},
	}
}

/** Which stock colour carries a wire's meaning. */
function edgeStockColor(kind: BtSceneEdge['kind']): TLDefaultColorStyle {
	switch (kind) {
		case 'write': return 'blue'
		case 'read': return 'green'
		case 'use': return 'grey'
		default: return 'black'
	}
}

/** The direction a wire arrives at its last point, for the arrowhead. */
function endAngle(edge: BtSceneEdge): number {
	const points = edge.points
	if (points.length < 2) return 0
	const to = points[points.length - 1]
	const from = points[points.length - 2]
	return Math.atan2(to.y - from.y, to.x - from.x)
}

const ARROW_HEAD = 11

/**
 * A rotated stock triangle stands in for the painted arrowhead. A stock
 * `arrow` cannot follow an elbowed control wire, and the head is the part that
 * carries the reading direction, so the wire stays a faithful polyline and the
 * head becomes its own small primitive.
 */
function arrowHead(edge: BtSceneEdge, color: TLDefaultColorStyle, opacity: number | undefined): TLShapePartial {
	const tip = edge.points[edge.points.length - 1]
	const angle = endAngle(edge)
	// A stock triangle points up (-y), so the head turns by a quarter more than
	// the wire's own angle, which is measured from +x.
	const rotation = angle + Math.PI / 2
	const centre = {
		x: tip.x - Math.cos(angle) * ARROW_HEAD * 0.5,
		y: tip.y - Math.sin(angle) * ARROW_HEAD * 0.5,
	}
	// A shape's rotation turns it about its own top-left origin, not its middle,
	// so place the origin such that the rotated middle lands on the wire's tip.
	const half = { x: ARROW_HEAD / 2, y: ARROW_HEAD / 2 }
	const cos = Math.cos(rotation)
	const sin = Math.sin(rotation)
	return {
		...rectangle({
			x: centre.x - (half.x * cos - half.y * sin),
			y: centre.y - (half.x * sin + half.y * cos),
			w: ARROW_HEAD,
			h: ARROW_HEAD,
		}, { geo: 'triangle', color, fill: 'solid' }),
		rotation,
		opacity,
	}
}

export interface BehaviorTreePrimitives {
	/** Region-local stock records, in painting order. */
	shapes: TLShapePartial[]
	/** The projection they were drawn from, so a caller need not compute it twice. */
	projection: BtProjectionResult
}

/**
 * Every stock record the region paints for itself, in region-local
 * coordinates. Deterministic apart from freshly minted shape ids.
 */
export function behaviorTreePrimitives(props: BehaviorTreeShapeProps): BehaviorTreePrimitives {
	const projection = projectBehaviorTree(props)
	const { scene } = projection
	const parts: Array<TLShapePartial | null> = []

	// The header rule the region draws under its band. The frame that replaces
	// the region carries the title itself, so the band is not re-lettered.
	parts.push(polyline([{ x: 0, y: BT_HEADER_H }, { x: props.w, y: BT_HEADER_H }], { color: 'grey' }))

	for (const group of scene.groups) {
		const rect = rectToRegion(projection, group.rect)
		parts.push(rectangle(rect, { color: 'grey', dash: 'dashed' }))
		parts.push(text(group.title, { x: rect.x + 44, y: rect.y + 12, w: Math.max(1, rect.w - 56) }, {
			align: 'start', scale: 1, bold: true,
		}))
	}

	const wireOpacity = props.controlWireOpacity >= 1 ? undefined : props.controlWireOpacity
	for (const rail of scene.rails) {
		const from = sceneToRegion(projection, rail.from)
		const to = sceneToRegion(projection, rail.to)
		const horizontal = Math.abs(from.y - to.y) < 0.5
		const offset = horizontal ? { x: 0, y: 3 } : { x: 3, y: 0 }
		// The live rail is a doubled 2px line; two stock lines keep that weight.
		for (const sign of [-1, 1]) {
			parts.push(polyline(
				[
					{ x: from.x + offset.x * sign, y: from.y + offset.y * sign },
					{ x: to.x + offset.x * sign, y: to.y + offset.y * sign },
				],
				{ color: 'black', opacity: wireOpacity },
			))
		}
	}

	for (const edge of projectedEdges(projection)) {
		const color = edgeStockColor(edge.kind)
		const dimmed = edge.kind === 'control' || edge.kind === 'recovery' || edge.kind === 'merge'
		const opacity = dimmed ? wireOpacity : undefined
		parts.push(polyline(edge.points, { color, opacity }))
		if (edge.arrowEnd && edge.points.length >= 2) parts.push(arrowHead(edge, color, opacity))
	}

	if (scene.start) {
		// The live Start is a white capsule with dark ink; stock `solid` fill is a
		// light tint, so white lettering on it would vanish.
		const rect = rectToRegion(projection, scene.start)
		parts.push(rectangle(rect, { geo: 'oval', color: 'black', fill: 'none', size: 'm' }))
		parts.push(text('Start', { x: rect.x, y: rect.y + Math.max(0, (rect.h - 22) / 2), w: rect.w }, {
			scale: 1, bold: true,
		}))
	}

	for (const chip of scene.chips) {
		const rect = rectToRegion(projection, chip.rect)
		parts.push(rectangle(rect, { color: 'black', fill: 'none', size: chip.kind === 'fail' ? 'm' : 's' }))
		parts.push(text(chip.text, { x: rect.x, y: rect.y + Math.max(0, (rect.h - 20) / 2), w: rect.w }, {
			scale: 16 / 18, bold: chip.kind === 'fail',
		}))
	}

	// A control card is not a Block, so nothing else would lower it: a bordered
	// rectangle plus its label is what the card reads as with the glyph gone.
	for (const child of projection.children) {
		if (child.type !== 'behaviorTreeControl') continue
		const rect = { x: child.x, y: child.y, w: child.props.w, h: child.props.h }
		parts.push(rectangle(rect, { color: 'black', fill: 'none', size: 'm' }))
		const label = (child.props as { label?: string }).label ?? ''
		parts.push(text(label, { x: rect.x + 6, y: rect.y + Math.max(0, (rect.h - 24) / 2), w: Math.max(1, rect.w - 12) }, {
			scale: 1, bold: true,
		}))
	}

	return {
		shapes: parts.filter((shape): shape is TLShapePartial => shape !== null),
		projection,
	}
}
