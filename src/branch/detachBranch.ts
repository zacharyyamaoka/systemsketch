/**
 * Lower a semantic Branch (including its invisible arm helpers) to stock
 * tldraw records. The visual is intentionally a stock approximation: an
 * ordinary stock Group contains a rectangle, lines, text and control dots.
 * Semantic arm/open state is retained only as ignored `meta.systemSketch` data
 * for a future importer. A Group is deliberately used instead of a Frame:
 * framed children clip at the region wall, which is exactly where control-port
 * rings need to cross.
 */
import {
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
	type TLDefaultColorStyle,
} from 'tldraw'

import { DETACH_FORMAT_VERSION } from '../blocks/detach/detachModel'
import { portTldrawColor } from '../blocks/ui/portPalette'
import { branchLayout, isBranchShape, type BranchShape } from './branchModel'
import { unwrapBranchArmFrames } from './branchArmFrames'
import {
	directChildren,
	liftContainerPartial,
	shapePoseInPrimitiveParent,
	unframedPrimitiveParentId,
} from '../blocks/detach/primitiveSpace'

export interface DetachedBranchPrimitives {
	/** Selectable stock group that replaced the semantic region. */
	groupId: TLShapeId
	/** Stock rectangle used as the meaningful arrow-binding target. */
	cardId: TLShapeId
}

function branchLine(parentId: TLShape['parentId'], y: number, width: number, size: 's' | 'm' = 's'): TLShapePartial {
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
			color: 'grey', dash: 'solid', size,
		},
	}
}

function branchText(
	parentId: TLShape['parentId'],
	text: string,
	box: { x: number; y: number; w: number },
	options: {
		align?: 'start' | 'middle'
		color?: TLDefaultColorStyle
		font?: 'sans' | 'mono'
		scale?: number
		bold?: boolean
		opacity?: number
	} = {},
): TLShapePartial | null {
	if (!text) return null
	const scale = options.scale ?? 0.78
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
		opacity: options.opacity,
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

/**
 * Convert one Branch to a fresh stock Group. This never mutates the mounted
 * semantic shape's type, avoiding React's incompatible ShapeUtil hook reuse;
 * the Group has no clipping wall, while its stock rectangle provides a stable
 * binding target for detached arrows.
 */
export function detachBranchToPrimitives(
	editor: Editor,
	branchId: BranchShape['id'],
	connectedPortIds: ReadonlySet<string> = new Set(),
): DetachedBranchPrimitives | null {
	const branch = editor.getShape(branchId)
	if (!isBranchShape(branch)) return null
	unwrapBranchArmFrames(editor, branch)
	const layout = branchLayout(branch.props)
	const primitiveParentId = unframedPrimitiveParentId(editor, branch.parentId)
	const pose = shapePoseInPrimitiveParent(editor, branch, primitiveParentId)
	const groupId = createShapeId()
	const cardId = createShapeId()
	// tldraw cleans up an empty group synchronously. Materialise all pieces at
	// the ordinary parent first, then ask its stock grouping command to wrap
	// them; this produces a durable Group without a Frame's clip wall.
	editor.createShape(liftContainerPartial({
		id: cardId,
		type: 'geo',
		parentId: primitiveParentId,
		x: 0,
		y: 0,
		props: { geo: 'rectangle', w: layout.w, h: layout.h, color: 'grey', fill: 'none', dash: 'solid', size: 's' },
	}, primitiveParentId, pose))
	const children = directChildren(editor, branch.id)
	const childIds = children.map((shape) => shape.id)
	if (childIds.length > 0) {
		editor.reparentShapes(childIds, primitiveParentId)
	}
	const arrowBindings = editor.getBindingsToShape<TLArrowBinding>(branch.id, 'arrow')
	for (const binding of arrowBindings) {
		editor.deleteBinding(binding.id)
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: binding.fromId,
			toId: cardId,
			props: { ...binding.props },
		})
	}
	editor.deleteShape(branch.id)

	const chrome: Array<TLShapePartial | null> = [
		branchLine(primitiveParentId, layout.band.h, layout.w),
		branchText(primitiveParentId, branch.props.title || 'Branch',
			layout.title, { align: 'middle', font: 'mono', scale: 1 }),
	]
	const outerPortChrome: TLShapePartial[] = []
	for (const control of layout.controls) {
		const stockColor = portTldrawColor(control.port.type)
		outerPortChrome.push({
			id: createShapeId(), type: 'geo', parentId: primitiveParentId,
			x: control.x - 9, y: control.y - 9,
			props: { geo: 'ellipse', w: 18, h: 18, color: stockColor, fill: 'none', dash: 'solid', size: 's' },
		})
		if (connectedPortIds.has(control.port.id)) {
			outerPortChrome.push({
				id: createShapeId(), type: 'geo', parentId: primitiveParentId,
				x: control.x - 6, y: control.y - 6,
				props: { geo: 'ellipse', w: 12, h: 12, color: stockColor, fill: 'solid', dash: 'solid', size: 's' },
			})
		}
		chrome.push(branchText(primitiveParentId, control.port.name,
			control.label, { color: 'grey', scale: 13 / 18 }))
	}
	for (const row of layout.arms) {
		if (row.dividerY !== null) chrome.push(branchLine(primitiveParentId, row.dividerY, layout.w, 'm'))
		const active = branch.props.activeArmId === row.arm.id
		const opacity = branch.props.activeArmId !== null && !active ? 0.18 : undefined
		chrome.push(branchText(primitiveParentId, row.arm.open ? '⌄' : '›', row.chevron,
			{ align: 'middle', color: 'grey', scale: 15 / 18, opacity }))
		chrome.push(branchText(primitiveParentId, row.arm.title || 'case', row.title,
			{ color: active ? 'blue' : 'black', scale: 16 / 18, bold: true, opacity }))
		if (active) {
			const centreX = row.target.x + row.target.w / 2
			const centreY = row.target.y + row.target.h / 2
			// The live glyph is a blue 11px disk with a 3.6px raised-surface
			// centre. Two stock filled ellipses preserve that active signal.
			chrome.push({
				id: createShapeId(), type: 'geo', parentId: primitiveParentId,
				x: centreX - 5.5, y: centreY - 5.5,
				props: { geo: 'ellipse', w: 11, h: 11, color: 'blue', fill: 'solid', dash: 'solid', size: 's' },
			})
			chrome.push({
				id: createShapeId(), type: 'geo', parentId: primitiveParentId,
				x: centreX - 1.8, y: centreY - 1.8,
				props: { geo: 'ellipse', w: 3.6, h: 3.6, color: 'white', fill: 'solid', dash: 'solid', size: 's' },
			})
			chrome.push(branchText(primitiveParentId, 'active', {
				x: Math.max(10, row.target.x - 40), y: row.rowTop + 9, w: 36,
			}, { color: 'blue', scale: 11 / 18, bold: true }))
		}
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
	// A Block is itself frame-like, so tldraw's grouping command deliberately
	// declines to wrap it. The Group is now non-empty and durable, which lets us
	// reparent each survivor normally without the old Frame's clipping semantics.
	if (childIds.length > 0) editor.reparentShapes(childIds, groupId)
	editor.updateShape({
		id: groupId,
		type: 'group',
		meta: {
			...branch.meta,
			systemSketch: {
				kind: 'branch',
				version: DETACH_FORMAT_VERSION,
				props: structuredClone(branch.props),
			},
		},
	})
	// Unlike a Frame, this Group does not clip. Every piece—including the full
	// 18px ring that straddles the header edge—remains in one movable stock tree.
	return { groupId, cardId }
}
