/**
 * Lower a semantic Branch (including its invisible arm helpers) to stock
 * tldraw records. The visual is intentionally a stock approximation: a Frame
 * contains ordinary lines, text and control dots. Semantic arm/open state is
 * retained only as ignored `meta.systemSketch` data for a future importer.
 */
import { createShapeId, toRichText, type Editor, type TLFrameShape, type TLShapePartial } from 'tldraw'

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
 * Convert one Branch in place so children and stock bindings retain their ids
 * and local transforms. Arm helpers are first unwrapped, so none survive.
 */
export function detachBranchToPrimitives(editor: Editor, branchId: BranchShape['id']): boolean {
	const branch = editor.getShape(branchId)
	if (!isBranchShape(branch)) return false
	const layout = branchLayout(branch.props)
	unwrapBranchArmFrames(editor, branch)

	const frame: TLFrameShape = {
		...branch,
		type: 'frame',
		props: {
			w: branch.props.w,
			h: branch.props.h,
			name: branch.props.title || 'Branch',
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
	// Replacing the isolated record preserves its id, descendants and transforms.
	editor.store.put([frame])

	const chrome: Array<TLShapePartial | null> = [
		branchLine(branch.id, layout.band.h, layout.w),
		branchText(branch.id, branch.props.title || 'Branch',
			{ x: 12, y: 7, w: Math.max(1, layout.w - 24) }, { align: 'middle', font: 'mono', scale: 0.86 }),
	]
	for (const control of layout.controls) {
		chrome.push({
			id: createShapeId(), type: 'geo', parentId: branch.id,
			x: Math.max(1, control.x + 1), y: control.y - 5,
			props: { geo: 'ellipse', w: 10, h: 10, color: 'yellow', fill: 'semi', dash: 'solid', size: 's' },
		})
		chrome.push(branchText(branch.id, [control.port.name, control.port.type].filter(Boolean).join(': '),
			{ x: 15, y: control.y - 9, w: Math.min(140, Math.max(1, layout.w * 0.3)) }, { color: 'grey', scale: 0.66 }))
	}
	for (const row of layout.arms) {
		if (row.dividerY !== null) chrome.push(branchLine(branch.id, row.dividerY, layout.w, 'm'))
		chrome.push(branchText(branch.id, `${row.arm.open ? '⌄' : '›'} ${row.arm.title || 'case'}`,
			{ x: 10, y: row.rowTop + 5, w: Math.max(1, layout.w - 20) }, { scale: 0.74 }))
	}
	editor.createShapes(chrome.filter((shape): shape is TLShapePartial => shape !== null))
	return true
}
