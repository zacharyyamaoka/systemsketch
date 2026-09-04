/**
 * Lower a semantic Branch (including its invisible arm helpers) to stock
 * tldraw records. The visual is intentionally a stock approximation: a Frame
 * contains ordinary lines, text and control dots. Semantic arm/open state is
 * retained only as ignored `meta.systemSketch` data for a future importer.
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
	type TLDefaultColorStyle,
} from 'tldraw'

import { DETACH_FORMAT_VERSION } from '../blocks/detach/detachModel'
import { portTldrawColor } from '../blocks/ui/portPalette'
import { branchLayout, isBranchShape, type BranchShape } from './branchModel'
import { unwrapBranchArmFrames } from './branchArmFrames'

function branchLine(parentId: BranchShape['id'], y: number, width: number, size: 's' | 'm' = 's'): TLShapePartial {
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
	parentId: BranchShape['id'],
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
 * Convert one Branch to a fresh stock Frame so React remounts it with the
 * Frame utility. Mutating a mounted shape's type in place makes tldraw reuse
 * the old Branch component instance; it then has a different hook count than
 * FrameShapeUtil and visibly paints the engine's Error fallback. Children and
 * arrow bindings move over before the old record is removed.
 */
export function detachBranchToPrimitives(
	editor: Editor,
	branchId: BranchShape['id'],
	connectedPortIds: ReadonlySet<string> = new Set(),
): TLShapeId | null {
	const branch = editor.getShape(branchId)
	if (!isBranchShape(branch)) return null
	const layout = branchLayout(branch.props)
	unwrapBranchArmFrames(editor, branch)
	const frameId = createShapeId()

	const frame: TLFrameShape = {
		...branch,
		id: frameId,
		type: 'frame',
		props: {
			w: branch.props.w,
			h: branch.props.h,
			// The materialised title below is the visible label. A zero-width word
			// joiner keeps stock Frame from substituting its own visible “Frame”
			// placeholder above the header.
			name: '\u2060',
			color: 'black',
		},
		meta: {
			...branch.meta,
			systemSketch: {
				kind: 'branch',
				version: DETACH_FORMAT_VERSION,
				props: structuredClone(branch.props),
			},
		},
	} as unknown as TLFrameShape
	// Keep the original sibling rank. The old record goes away immediately after
	// its survivors have moved, so the short-lived duplicate index never escapes
	// this editor transaction.
	editor.createShape(frame)
	const childIds = editor.getSortedChildIdsForParent(branch.id)
	const children = childIds
		.map((childId) => editor.getShape(childId))
		.filter((shape): shape is TLShape => shape !== undefined)
	if (childIds.length > 0) {
		editor.reparentShapes(childIds, frameId)
		// The Frame has the Branch's exact parent-local transform. Restore the
		// local values after tldraw's general matrix round trip so an export does
		// not pick up floating-point dust merely by detaching a container.
		editor.updateShapes(children.map((shape) => ({
			id: shape.id, type: shape.type, x: shape.x, y: shape.y, rotation: shape.rotation,
		})))
	}
	const arrowBindings = editor.getBindingsToShape<TLArrowBinding>(branch.id, 'arrow')
	for (const binding of arrowBindings) {
		editor.deleteBinding(binding.id)
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: binding.fromId,
			toId: frameId,
			props: { ...binding.props },
		})
	}
	editor.deleteShape(branch.id)

	const chrome: Array<TLShapePartial | null> = [
		branchLine(frameId, layout.band.h, layout.w),
		branchText(frameId, branch.props.title || 'Branch',
			layout.title, { align: 'middle', font: 'mono', scale: 1 }),
	]
	const outerPortChrome: TLShapePartial[] = []
	for (const control of layout.controls) {
		const stockColor = portTldrawColor(control.port.type)
		outerPortChrome.push({
			id: createShapeId(), type: 'geo', parentId: frameId,
			x: control.x - 9, y: control.y - 9,
			props: { geo: 'ellipse', w: 18, h: 18, color: stockColor, fill: 'none', dash: 'solid', size: 's' },
		})
		if (connectedPortIds.has(control.port.id)) {
			outerPortChrome.push({
				id: createShapeId(), type: 'geo', parentId: frameId,
				x: control.x - 6, y: control.y - 6,
				props: { geo: 'ellipse', w: 12, h: 12, color: stockColor, fill: 'solid', dash: 'solid', size: 's' },
			})
		}
		chrome.push(branchText(frameId, control.port.name,
			control.label, { color: 'grey', scale: 13 / 18 }))
	}
	for (const row of layout.arms) {
		if (row.dividerY !== null) chrome.push(branchLine(frameId, row.dividerY, layout.w, 'm'))
		const active = branch.props.activeArmId === row.arm.id
		const opacity = branch.props.activeArmId !== null && !active ? 0.18 : undefined
		chrome.push(branchText(frameId, row.arm.open ? '⌄' : '›', row.chevron,
			{ align: 'middle', color: 'grey', scale: 15 / 18, opacity }))
		chrome.push(branchText(frameId, row.arm.title || 'case', row.title,
			{ color: active ? 'blue' : 'black', scale: 16 / 18, bold: true, opacity }))
		if (active) {
			const centreX = row.target.x + row.target.w / 2
			const centreY = row.target.y + row.target.h / 2
			// The live glyph is a blue 11px disk with a 3.6px raised-surface
			// centre. Two stock filled ellipses preserve that active signal.
			chrome.push({
				id: createShapeId(), type: 'geo', parentId: frameId,
				x: centreX - 5.5, y: centreY - 5.5,
				props: { geo: 'ellipse', w: 11, h: 11, color: 'blue', fill: 'solid', dash: 'solid', size: 's' },
			})
			chrome.push({
				id: createShapeId(), type: 'geo', parentId: frameId,
				x: centreX - 1.8, y: centreY - 1.8,
				props: { geo: 'ellipse', w: 3.6, h: 3.6, color: 'white', fill: 'solid', dash: 'solid', size: 's' },
			})
			chrome.push(branchText(frameId, 'active', {
				x: Math.max(10, row.target.x - 40), y: row.rowTop + 9, w: 36,
			}, { color: 'blue', scale: 11 / 18, bold: true }))
		}
	}
	editor.createShapes(chrome.filter((shape): shape is TLShapePartial => shape !== null))
	// A Frame clips its direct children at the wall. The control rim is the one
	// visual that intentionally crosses it, so it is an ordinary sibling stock
	// geo while the rest of the chrome remains a transform-owning Frame child.
	const exteriorPortShapes = outerPortChrome.map((shape) => ({
		...shape,
		parentId: branch.parentId,
		x: branch.x + (shape.x ?? 0),
		y: branch.y + (shape.y ?? 0),
		rotation: branch.rotation,
	}))
	editor.createShapes(exteriorPortShapes)
	return frameId
}
