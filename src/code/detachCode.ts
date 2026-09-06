/**
 * Lower a Code block to stock tldraw records.
 *
 * Stock tldraw has no CodeMirror document shape, so the authored text freezes
 * into two editable stock primitives — the dark card and a mono text run —
 * grouped as one movable unit. The group's `meta` remembers the full Code
 * record the same way a detached Branch or Loop remembers its props: stock
 * viewers ignore it, and a future importer can put the Code block back.
 *
 * Lowering happens in place (the replacement keeps the Code shape's parent):
 * when the Code sits inside a composite being detached, the composite's own
 * wrapper reduction lifts and adopts the replacement like any other child.
 */
import {
	createShapeId,
	toRichText,
	type Editor,
	type TLArrowBinding,
	type TLShapeId,
} from 'tldraw'

import { DETACH_FORMAT_VERSION, toJsonSafe } from '../blocks/detach/detachModel'
import type { CodeShape } from './codeModel'

export interface DetachedCodePrimitives {
	/** Selectable stock group that replaced the Code block, when grouping held. */
	groupId: TLShapeId | null
	/** The dark stock rectangle that stood where the Code block stood. */
	cardId: TLShapeId
}

export function detachCodeToPrimitives(
	editor: Editor,
	code: CodeShape,
): DetachedCodePrimitives {
	const cardId = createShapeId()
	const textId = createShapeId()
	const inset = 14 + (code.props.showLineNumbers ? 42 : 0)
	editor.createShapes([
		{
			id: cardId,
			type: 'geo',
			parentId: code.parentId,
			x: code.x,
			y: code.y,
			props: {
				geo: 'rectangle', w: code.props.w, h: code.props.h,
				color: 'black', fill: 'solid', dash: 'solid', size: 's',
			},
		},
		{
			id: textId,
			type: 'text',
			parentId: code.parentId,
			x: code.x + inset,
			y: code.y + 34,
			props: {
				richText: toRichText(code.props.code),
				autoSize: false,
				color: 'white',
				font: 'mono',
				scale: code.props.fontSize / 18,
				size: 's',
				textAlign: 'start',
				w: Math.max(1, code.props.w - inset - 14),
			},
		},
	])
	// A stock arrow bound to the Code block would die with it; hand the binding
	// to the card at the same anchor, the way every other kind's card takes over.
	for (const binding of editor.getBindingsToShape<TLArrowBinding>(code.id, 'arrow')) {
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: binding.fromId,
			toId: cardId,
			props: { ...binding.props },
		})
		editor.deleteBinding(binding.id)
	}
	editor.deleteShape(code.id)

	const groupId = createShapeId()
	editor.groupShapes([cardId, textId], { groupId, select: false })
	if (!editor.getShape(groupId)) return { groupId: null, cardId }
	editor.updateShape({
		id: groupId,
		type: 'group',
		meta: {
			...toJsonSafe(code.meta),
			systemSketch: {
				kind: 'code',
				version: DETACH_FORMAT_VERSION,
				// WHY: `meta` is `T.jsonValue`; a present-but-undefined optional
				// prop is legal in `props` and fatal here. See `toJsonSafe`.
				props: toJsonSafe(structuredClone(code.props)),
			},
		},
	})
	return { groupId, cardId }
}
