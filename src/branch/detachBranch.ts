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
} from 'tldraw'

import { DETACH_FORMAT_VERSION } from '../blocks/detach/detachModel'
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
	options: { align?: 'start' | 'middle'; color?: 'black' | 'grey'; font?: 'sans' | 'mono'; scale?: number } = {},
): TLShapePartial | null {
	if (!text) return null
	const scale = options.scale ?? 0.78
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

/**
 * Convert one Branch to a fresh stock Frame so React remounts it with the
 * Frame utility. Mutating a mounted shape's type in place makes tldraw reuse
 * the old Branch component instance; it then has a different hook count than
 * FrameShapeUtil and visibly paints the engine's Error fallback. Children and
 * arrow bindings move over before the old record is removed.
 */
export function detachBranchToPrimitives(editor: Editor, branchId: BranchShape['id']): TLShapeId | null {
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
			{ x: 12, y: 7, w: Math.max(1, layout.w - 24) }, { align: 'middle', font: 'mono', scale: 0.86 }),
	]
	for (const control of layout.controls) {
		chrome.push({
			id: createShapeId(), type: 'geo', parentId: frameId,
			x: Math.max(1, control.x + 1), y: control.y - 5,
			props: { geo: 'ellipse', w: 10, h: 10, color: 'yellow', fill: 'semi', dash: 'solid', size: 's' },
		})
		chrome.push(branchText(frameId, [control.port.name, control.port.type].filter(Boolean).join(': '),
			{ x: 15, y: control.y - 9, w: Math.min(140, Math.max(1, layout.w * 0.3)) }, { color: 'grey', scale: 0.66 }))
	}
	for (const row of layout.arms) {
		if (row.dividerY !== null) chrome.push(branchLine(frameId, row.dividerY, layout.w, 'm'))
		chrome.push(branchText(frameId, `${row.arm.open ? '⌄' : '›'} ${row.arm.title || 'case'}`,
			{ x: 10, y: row.rowTop + 5, w: Math.max(1, layout.w - 20) }, { scale: 0.74 }))
	}
	editor.createShapes(chrome.filter((shape): shape is TLShapePartial => shape !== null))
	return frameId
}
