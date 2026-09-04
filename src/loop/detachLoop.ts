/**
 * Lower a Loop region to stock tldraw records.
 *
 * A Loop is a container first, so the stock Frame keeps its child tree and
 * transform intact. Its operator chrome is then materialised as ordinary
 * lines, text, and small geo dots: the resulting `.tldr` needs no Loop shape
 * utility to stay legible or editable.
 */
import {
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLFrameShape,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
} from 'tldraw'

import { DETACH_FORMAT_VERSION } from '../blocks/detach/detachModel'
import { loopLayout, isLoopShape, type LoopShape } from './loopModel'

function loopLine(parentId: LoopShape['id'], y: number, width: number): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'line',
		parentId,
		x: 0,
		y,
		props: {
			points: {
				a1: { id: 'a1', index: 'a1' as never, x: 0, y: 0 },
				a2: { id: 'a2', index: 'a2' as never, x: width, y: 0 },
			},
			color: 'grey', dash: 'solid', size: 's',
		},
	}
}

function loopText(
	parentId: LoopShape['id'],
	text: string,
	box: { x: number; y: number; w: number },
	options: { align?: 'start' | 'middle'; color?: 'black' | 'grey'; font?: 'sans' | 'mono'; scale?: number } = {},
): TLShapePartial | null {
	if (!text) return null
	const scale = options.scale ?? 0.74
	return {
		id: createShapeId(),
		type: 'text',
		parentId,
		x: box.x,
		y: box.y,
		props: {
			richText: toRichText(text),
			autoSize: false,
			color: options.color ?? 'black',
			font: options.font ?? 'sans',
			scale,
			size: 's',
			textAlign: options.align ?? 'start',
			w: Math.max(1, box.w / scale),
		},
	}
}

/** Match the live header's single-line truncation rather than wrapping it. */
function loopTitleForWidth(title: string, width: number): string {
	// The live header is 18px monospace; its glyph advance is about 10.8px.
	const maxChars = Math.max(1, Math.floor(width / 10.8))
	if (title.length <= maxChars) return title
	return `${title.slice(0, Math.max(0, maxChars - 1))}…`
}

/**
 * Convert one Loop to a fresh stock Frame. A fresh id is necessary: React
 * cannot safely reuse a mounted Loop component for FrameShapeUtil because the
 * two components have different hooks. Child records and stock arrow bindings
 * move to the replacement before the semantic record is deleted.
 */
export function detachLoopToPrimitives(editor: Editor, loopId: LoopShape['id']): TLShapeId | null {
	const loop = editor.getShape(loopId)
	if (!isLoopShape(loop)) return null
	const layout = loopLayout(loop.props)
	const frameId = createShapeId()

	const frame: TLFrameShape = {
		...loop,
		id: frameId,
		type: 'frame',
		props: {
			w: loop.props.w,
			h: loop.props.h,
			// The stock Frame owns containment; the stock text below owns the title.
			// A zero-width word joiner prevents the Frame's “Frame” fallback label.
			name: '\u2060',
			color: 'black',
		},
		meta: {
			...loop.meta,
			systemSketch: {
				kind: 'loop',
				version: DETACH_FORMAT_VERSION,
				props: structuredClone(loop.props),
			},
		},
	} as unknown as TLFrameShape
	editor.createShape(frame)
	const childIds = editor.getSortedChildIdsForParent(loop.id)
	const children = childIds
		.map((childId) => editor.getShape(childId))
		.filter((shape): shape is TLShape => shape !== undefined)
	if (childIds.length > 0) {
		editor.reparentShapes(childIds, frameId)
		// Parent transform is unchanged; keep child local values byte-stable
		// instead of retaining the matrix round-trip's floating-point dust.
		editor.updateShapes(children.map((shape) => ({
			id: shape.id, type: shape.type, x: shape.x, y: shape.y, rotation: shape.rotation,
		})))
	}
	const arrowBindings = editor.getBindingsToShape<TLArrowBinding>(loop.id, 'arrow')
	for (const binding of arrowBindings) {
		editor.deleteBinding(binding.id)
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: binding.fromId,
			toId: frameId,
			props: { ...binding.props },
		})
	}
	editor.deleteShape(loop.id)

	const chrome: Array<TLShapePartial | null> = [
		loopLine(frameId, layout.header.h, layout.w),
		layout.footer ? loopLine(frameId, layout.footer.y, layout.w) : null,
		loopText(frameId, loopTitleForWidth(loop.props.title || 'For Loop', layout.title.w),
			{ x: Math.max(1, layout.title.x - layout.title.w / 2), y: 14, w: Math.max(1, layout.title.w) },
			{ align: 'middle', font: 'mono', scale: 0.86 }),
	]

	for (const placed of [layout.iterable, layout.item]) {
		chrome.push({
			id: createShapeId(), type: 'geo', parentId: frameId,
			x: placed.x - 5, y: placed.y - 5,
			props: { geo: 'ellipse', w: 10, h: 10, color: 'blue', fill: 'semi', dash: 'solid', size: 's' },
		})
		chrome.push(loopText(frameId, placed.port.type,
			{ x: placed.label.x, y: placed.label.y - 7, w: Math.max(1, layout.labelMax) },
			{ color: 'grey', scale: 0.66 }))
	}

	if (layout.turn) {
		const chipId = createShapeId()
		chrome.push({
			id: chipId, type: 'geo', parentId: frameId,
			x: layout.turn.x, y: layout.turn.y,
			props: { geo: 'oval', w: layout.turn.w, h: layout.turn.h, color: 'blue', fill: 'semi', dash: 'solid', size: 's' },
		})
		chrome.push(loopText(frameId, loop.props.turn,
			{ x: layout.turn.x + 6, y: layout.turn.y + 5, w: Math.max(1, layout.turn.w - 12) },
			{ align: 'middle', font: 'mono', scale: 0.62 }))
	}

	editor.createShapes(chrome.filter((shape): shape is TLShapePartial => shape !== null))
	return frameId
}
