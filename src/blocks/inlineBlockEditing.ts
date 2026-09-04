/**
 * Field-level adapter for tldraw's one-shape editing lifecycle.
 *
 * This is the pyblocks interaction model without its pipeline/linked-block
 * dependencies: tldraw still owns enter/complete/cancel, while this module only
 * remembers which semantic value inside a Block the editing shape exposes.
 */
import { atom, type Atom, type Editor, type TLShapeId } from 'tldraw'

import type { BlockShape, BlockShapeProps } from './blockModel'
import {
	VALUE_FONT_PX,
	VALUE_PAD_X,
	layoutBlock,
	measureBlockText,
	type BlockRect,
} from './layoutBlock'

export type BlockInlineField =
	| { kind: 'title' | 'blockType' | 'icon' | 'description' }
	| {
			kind: 'portName' | 'portType'
			side: 'inputs' | 'outputs'
			portId: string
	  }

const DEFAULT_FIELD: BlockInlineField = { kind: 'title' }

/**
 * The active field is signal state, not paint state: a click on a second field
 * of the Block already being edited moves the editor without the shape record
 * changing, so the store has to be reactive or that move renders nothing.
 */
const activeFields = new WeakMap<Editor, Atom<ReadonlyMap<TLShapeId, BlockInlineField>>>()

function fieldsFor(editor: Editor): Atom<ReadonlyMap<TLShapeId, BlockInlineField>> {
	let fields = activeFields.get(editor)
	if (!fields) {
		fields = atom<ReadonlyMap<TLShapeId, BlockInlineField>>('block inline fields', new Map())
		activeFields.set(editor, fields)
	}
	return fields
}

export function isSameBlockInlineField(a: BlockInlineField, b: BlockInlineField): boolean {
	if (a.kind !== b.kind) return false
	if (a.kind === 'portName' || a.kind === 'portType') {
		const other = b as Extract<BlockInlineField, { portId: string }>
		return a.side === other.side && a.portId === other.portId
	}
	return true
}

export function rememberBlockInlineField(
	editor: Editor,
	shapeId: TLShapeId,
	field: BlockInlineField,
): void {
	const fields = fieldsFor(editor)
	const current = fields.get().get(shapeId)
	if (current && isSameBlockInlineField(current, field)) return
	fields.update((previous) => new Map(previous).set(shapeId, field))
}

export function ensureBlockInlineField(editor: Editor, shapeId: TLShapeId): void {
	const fields = fieldsFor(editor)
	if (fields.get().has(shapeId)) return
	fields.update((previous) => new Map(previous).set(shapeId, DEFAULT_FIELD))
}

export function getBlockInlineField(editor: Editor, shapeId: TLShapeId): BlockInlineField {
	return fieldsFor(editor).get().get(shapeId) ?? DEFAULT_FIELD
}

export function clearBlockInlineField(editor: Editor, shapeId: TLShapeId): void {
	const fields = fieldsFor(editor)
	if (!fields.get().has(shapeId)) return
	fields.update((previous) => {
		const next = new Map(previous)
		next.delete(shapeId)
		return next
	})
}

export function requestBlockInlineEdit(
	editor: Editor,
	shapeId: BlockShape['id'],
	field: BlockInlineField,
): void {
	rememberBlockInlineField(editor, shapeId, field)
	const begin = () => {
		if (!editor.getShape(shapeId)) return
		editor.setSelectedShapes([shapeId])
		editor.setEditingShape(shapeId)
	}
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(begin)
	else setTimeout(begin, 0)
}

export interface BlockInlineEditorPlacement {
	box: BlockRect
	align: 'left' | 'center' | 'right'
}

export function blockInlineEditorPlacement(
	props: BlockShapeProps,
	field: BlockInlineField,
): BlockInlineEditorPlacement | null {
	const layout = layoutBlock(props)
	const width = layout.bounds.w
	const height = layout.bounds.h
	const headerHeight = layout.headerHeight
	const footerTop = layout.footerTop

	if (props.view === 'value') {
		// A capsule is entered as one left-to-right declaration. The parser can
		// split it into its title and outlet name when the edit is committed.
		if (field.kind === 'title') {
			return layout.title ? { box: layout.title, align: 'left' } : null
		}
		if (field.kind === 'portName' && field.side === 'outputs') {
			return layout.title ? { box: layout.title, align: 'left' } : null
		}
		return null
	}

	switch (field.kind) {
		case 'title': {
			const box = layout.title ?? layout.headerTitle
			return box ? { box, align: props.view === 'simple' ? 'center' : 'left' } : null
		}
		case 'blockType': {
			const box = layout.typeLabel ?? layout.headerType
			if (box) return { box, align: props.view === 'simple' ? 'center' : 'right' }
			if (props.view === 'simple') {
				return {
					box: { x: 16, y: footerTop, w: Math.max(0, width - 32), h: Math.max(24, height - footerTop) },
					align: 'center',
				}
			}
			const editorWidth = Math.min(150, Math.max(84, width * 0.35))
			return {
				box: { x: Math.max(12, width - 12 - editorWidth), y: 0, w: editorWidth, h: headerHeight },
				align: 'right',
			}
		}
		case 'icon': {
			const box = layout.icon ?? layout.headerIcon
			if (box) return { box, align: 'left' }
			const title = layout.title ?? layout.headerTitle
			if (!title) return null
			return props.view === 'simple'
				? { box: { ...title }, align: 'center' }
				: {
						box: { x: 12, y: 0, w: Math.min(170, Math.max(0, width - 24)), h: headerHeight },
						align: 'left',
					}
		}
		case 'description': {
			if (layout.description) {
				return { box: layout.description, align: props.view === 'simple' ? 'center' : 'left' }
			}
			if (props.view === 'simple') {
				const title = layout.title
				const y = Math.max(8, Math.min(footerTop - 48, (title?.y ?? 8) + (title?.h ?? 0) + 10))
				return { box: { x: 16, y, w: Math.max(0, width - 32), h: 48 }, align: 'center' }
			}
			return {
				box: {
					x: 12,
					y: Math.max(layout.bodyTop, footerTop - 20),
					w: Math.max(0, width - 24),
					h: 16,
				},
				align: 'left',
			}
		}
		case 'portName':
		case 'portType': {
			const side = field.side === 'inputs' ? 'input' : 'output'
			const placed = layout.ports.find(
				(entry) => entry.port.id === field.portId && entry.side === side,
			)
			if (placed?.label) {
				return { box: placed.label, align: field.side === 'inputs' ? 'left' : 'right' }
			}
			if (!placed) return null
			const editorWidth = Math.max(84, width / 2 - 20)
			return {
				box: {
					x: field.side === 'inputs' ? 12 : Math.max(12, width - 12 - editorWidth),
					y: placed.y - 12,
					w: editorWidth,
					h: 24,
				},
				align: field.side === 'inputs' ? 'left' : 'right',
			}
		}
	}
}

export function blockInlineFieldAttribute(field: BlockInlineField): string {
	return JSON.stringify(field)
}

export function parseBlockInlineFieldAttribute(raw: string | undefined): BlockInlineField | null {
	if (!raw) return null
	try {
		const candidate = JSON.parse(raw) as Partial<BlockInlineField>
		if (
			candidate.kind === 'title'
			|| candidate.kind === 'blockType'
			|| candidate.kind === 'icon'
			|| candidate.kind === 'description'
		) {
			return { kind: candidate.kind }
		}
		if (
			(candidate.kind === 'portName' || candidate.kind === 'portType')
			&& (candidate.side === 'inputs' || candidate.side === 'outputs')
			&& typeof candidate.portId === 'string'
		) {
			return { kind: candidate.kind, side: candidate.side, portId: candidate.portId }
		}
	} catch {
		// A malformed paint-layer attribute is not document data.
	}
	return null
}

function contains(box: BlockRect | null, point: { x: number; y: number }): boolean {
	return Boolean(
		box
		&& point.x >= box.x
		&& point.x <= box.x + box.w
		&& point.y >= box.y
		&& point.y <= box.y + box.h,
	)
}

/**
 * Which painted field a Block-local point lands on, or `null` for the parts of
 * the face that are not text: the body, the frame interior, the footer.
 *
 * Single-click editing needs that `null`. A miss has to stay a miss so an
 * Expanded Block's interior keeps selecting and dragging its children, and so a
 * double-click on it still reaches `stepIntoDepthScope`.
 */
export function blockInlineFieldAtPointOrNull(
	props: BlockShapeProps,
	point: { x: number; y: number },
): BlockInlineField | null {
	const layout = layoutBlock(props)
	if (props.view === 'value') {
		// The painted spans answer a single click exactly; this is the reading
		// for a double-click that landed beside them: the left end names, the
		// rest edits the literal.
		const outlet = props.outputs[0]
		const nameWidth = measureBlockText(outlet?.name || '=', VALUE_FONT_PX, 500, 'mono') + 12
		if (outlet && point.x <= VALUE_PAD_X + nameWidth) {
			return { kind: 'portName', side: 'outputs', portId: outlet.id }
		}
		return contains(layout.title, point) ? { kind: 'title' } : null
	}
	if (contains(layout.icon ?? layout.headerIcon, point)) return { kind: 'icon' }
	if (contains(layout.typeLabel ?? layout.headerType, point)) return { kind: 'blockType' }
	if (contains(layout.description, point)) return { kind: 'description' }

	for (const placed of layout.ports) {
		if (!contains(placed.label, point)) continue
		const side = placed.side === 'input' ? 'inputs' : 'outputs'
		if (!placed.port.type) return { kind: 'portName', side, portId: placed.port.id }
		if (!placed.port.name) return { kind: 'portType', side, portId: placed.port.id }
		const rightHalf = point.x >= placed.label!.x + placed.label!.w / 2
		const kind = placed.side === 'input'
			? (rightHalf ? 'portType' : 'portName')
			: (rightHalf ? 'portName' : 'portType')
		return { kind, side, portId: placed.port.id }
	}

	if (contains(layout.title ?? layout.headerTitle, point)) return { kind: 'title' }
	return null
}

/** The double-click reading of the same point: a miss opens the primary field. */
export function blockInlineFieldAtPoint(
	props: BlockShapeProps,
	point: { x: number; y: number },
): BlockInlineField {
	return blockInlineFieldAtPointOrNull(props, point) ?? DEFAULT_FIELD
}

/**
 * The field painted under a viewport point, scoped to one Block's own DOM.
 *
 * The painted spans are narrower and better separated than the layout boxes —
 * a port's name and its type are two elements, not two halves of a rectangle —
 * so the DOM answers first wherever it has an opinion. Scoping by `data-shape-id`
 * keeps a nested child Block's label from being read as its parent's.
 */
export function blockInlineFieldFromClientPoint(
	document: Document,
	clientPoint: { x: number; y: number },
	shapeId: TLShapeId,
): BlockInlineField | null {
	const hit = document
		.elementFromPoint(clientPoint.x, clientPoint.y)
		?.closest<HTMLElement>('[data-pb-inline-field]')
	if (!hit) return null
	if (hit.closest<HTMLElement>('[data-shape-id]')?.dataset.shapeId !== shapeId) return null
	return parseBlockInlineFieldAttribute(hit.dataset.pbInlineField)
}
