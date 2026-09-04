/**
 * Lower a Loop region to stock tldraw records.
 *
 * A Loop is a container first, so a stock Group keeps its child tree and
 * transform intact without imposing the clipping wall of a Frame. Its operator
 * chrome is materialised as ordinary lines, text, and small geo dots: the
 * resulting `.tldr` needs no Loop shape utility to stay legible or editable.
 */
import {
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
} from 'tldraw'

import { DETACH_FORMAT_VERSION } from '../blocks/detach/detachModel'
import { portTldrawColor } from '../blocks/ui/portPalette'
import { loopLayout, isLoopShape, type LoopShape } from './loopModel'
import {
	directChildren,
	liftContainerPartial,
	shapePoseInPrimitiveParent,
	unframedPrimitiveParentId,
} from '../blocks/detach/primitiveSpace'

export interface DetachedLoopPrimitives {
	/** Selectable stock group that replaced the semantic region. */
	groupId: TLShapeId
	/** Stock rectangle used as the meaningful arrow-binding target. */
	cardId: TLShapeId
}

function loopLine(parentId: TLShape['parentId'], y: number, width: number): TLShapePartial {
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
	parentId: TLShape['parentId'],
	text: string,
	box: { x: number; y: number; w: number },
	options: {
		align?: 'start' | 'middle'
		color?: 'black' | 'grey'
		font?: 'sans' | 'mono'
		scale?: number
		bold?: boolean
	} = {},
): TLShapePartial | null {
	if (!text) return null
	const scale = options.scale ?? 0.74
	const richText = toRichText(text)
	const weightedRichText = options.bold
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
		parentId,
		x: box.x,
		y: box.y,
		props: {
			richText: weightedRichText,
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
 * Convert one Loop to a fresh stock Group. A fresh id is necessary: React
 * cannot safely reuse a mounted Loop component for a different ShapeUtil
 * without hook mismatch. The Group has no clipping wall, while its stock
 * rectangle supplies the arrow-binding geometry a Frame formerly supplied.
 */
export function detachLoopToPrimitives(
	editor: Editor,
	loopId: LoopShape['id'],
	connectedPortIds: ReadonlySet<string> = new Set(),
): DetachedLoopPrimitives | null {
	const loop = editor.getShape(loopId)
	if (!isLoopShape(loop)) return null
	const layout = loopLayout(loop.props)
	const primitiveParentId = unframedPrimitiveParentId(editor, loop.parentId)
	const pose = shapePoseInPrimitiveParent(editor, loop, primitiveParentId)
	const groupId = createShapeId()
	const cardId = createShapeId()
	// Build real stock pieces first, then use tldraw's group command. An empty
	// manually-created Group is removed by the editor before children can land.
	editor.createShape(liftContainerPartial({
		id: cardId,
		type: 'geo',
		parentId: primitiveParentId,
		x: 0,
		y: 0,
		props: { geo: 'rectangle', w: layout.w, h: layout.h, color: 'grey', fill: 'none', dash: 'solid', size: 's' },
	}, primitiveParentId, pose))
	const children = directChildren(editor, loop.id)
	const childIds = children.map((shape) => shape.id)
	if (childIds.length > 0) {
		editor.reparentShapes(childIds, primitiveParentId)
	}
	const arrowBindings = editor.getBindingsToShape<TLArrowBinding>(loop.id, 'arrow')
	for (const binding of arrowBindings) {
		editor.deleteBinding(binding.id)
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: binding.fromId,
			toId: cardId,
			props: { ...binding.props },
		})
	}
	editor.deleteShape(loop.id)

	const chrome: Array<TLShapePartial | null> = [
		loopLine(primitiveParentId, layout.header.h, layout.w),
		layout.footer ? loopLine(primitiveParentId, layout.footer.y, layout.w) : null,
		loopText(primitiveParentId, loopTitleForWidth(loop.props.title || 'For Loop', layout.title.w),
			{ x: Math.max(1, layout.title.x - layout.title.w / 2), y: 14, w: Math.max(1, layout.title.w) },
			{ align: 'middle', font: 'mono', scale: 1 }),
	]
	const outerPortChrome: TLShapePartial[] = []

	for (const placed of [layout.iterable, layout.item]) {
		const stockColor = portTldrawColor(placed.port.type)
		outerPortChrome.push({
			id: createShapeId(), type: 'geo', parentId: primitiveParentId,
			x: placed.x - 9, y: placed.y - 9,
			props: { geo: 'ellipse', w: 18, h: 18, color: stockColor, fill: 'none', dash: 'solid', size: 's' },
		})
		if (connectedPortIds.has(placed.port.id)) {
			outerPortChrome.push({
				id: createShapeId(), type: 'geo', parentId: primitiveParentId,
				x: placed.x - 6, y: placed.y - 6,
				props: { geo: 'ellipse', w: 12, h: 12, color: stockColor, fill: 'solid', dash: 'solid', size: 's' },
			})
		}
		chrome.push(loopText(primitiveParentId, placed.port.type,
			{ x: placed.label.x, y: placed.label.y - 7, w: Math.max(1, layout.labelMax) },
			{ color: 'grey', scale: 12.5 / 18 }))
	}

	if (layout.turn) {
		const chipId = createShapeId()
		chrome.push({
			id: chipId, type: 'geo', parentId: primitiveParentId,
			x: layout.turn.x, y: layout.turn.y,
			props: { geo: 'oval', w: layout.turn.w, h: layout.turn.h, color: 'blue', fill: 'semi', dash: 'solid', size: 's' },
		})
		chrome.push(loopText(primitiveParentId, loop.props.turn,
			{ x: layout.turn.x + 6, y: layout.turn.y + 5, w: Math.max(1, layout.turn.w - 12) },
			{ align: 'middle', font: 'mono', scale: 11 / 18, bold: true }))
	}

	const material = [
		...chrome.filter((shape): shape is TLShapePartial => shape !== null),
		...outerPortChrome,
	].map((shape) => liftContainerPartial(shape, primitiveParentId, pose))
	editor.createShapes(material)
	editor.groupShapes([cardId, ...material.map((shape) => shape.id as TLShapeId)], {
		groupId,
		select: false,
	})
	if (!editor.getShape(groupId)) return null
	// Frame-like Blocks cannot be wrapped by `groupShapes`, but the Group is now
	// real and non-empty. Reparent their existing records into it so the child
	// tree survives, moves with the region, and no clipping wall reappears.
	if (childIds.length > 0) editor.reparentShapes(childIds, groupId)
	editor.updateShape({
		id: groupId,
		type: 'group',
		meta: {
			...loop.meta,
			systemSketch: {
				kind: 'loop',
				version: DETACH_FORMAT_VERSION,
				props: structuredClone(loop.props),
			},
		},
	})
	// Groups do not clip: both rings, their filled wired cores, and every label
	// remain in one movable stock ownership tree.
	return { groupId, cardId }
}
