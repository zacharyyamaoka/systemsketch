/**
 * Which text on a Branch tldraw's one-shape editing session is exposing.
 *
 * Same shape as the Block's adapter: tldraw owns enter / complete / cancel,
 * this module only remembers the field, and the field is signal state so a
 * click on a second title moves the editor without a record changing.
 */
import { atom, type Atom, type Editor, type TLShapeId } from 'tldraw'

import { branchLayout, type BranchRect, type BranchShapeProps } from './branchModel'

export type BranchInlineField =
	| { kind: 'title' }
	| { kind: 'armTitle'; armId: string }
	| { kind: 'controlName'; portId: string }

const DEFAULT_FIELD: BranchInlineField = { kind: 'title' }

const activeFields = new WeakMap<Editor, Atom<ReadonlyMap<TLShapeId, BranchInlineField>>>()

function fieldsFor(editor: Editor): Atom<ReadonlyMap<TLShapeId, BranchInlineField>> {
	let fields = activeFields.get(editor)
	if (!fields) {
		fields = atom<ReadonlyMap<TLShapeId, BranchInlineField>>('branch inline fields', new Map())
		activeFields.set(editor, fields)
	}
	return fields
}

export function isSameBranchInlineField(a: BranchInlineField, b: BranchInlineField): boolean {
	if (a.kind !== b.kind) return false
	if (a.kind === 'armTitle') return a.armId === (b as typeof a).armId
	if (a.kind === 'controlName') return a.portId === (b as typeof a).portId
	return true
}

export function rememberBranchInlineField(editor: Editor, shapeId: TLShapeId, field: BranchInlineField): void {
	const fields = fieldsFor(editor)
	const current = fields.get().get(shapeId)
	if (current && isSameBranchInlineField(current, field)) return
	fields.update((previous) => new Map(previous).set(shapeId, field))
}

export function ensureBranchInlineField(editor: Editor, shapeId: TLShapeId): void {
	const fields = fieldsFor(editor)
	if (fields.get().has(shapeId)) return
	fields.update((previous) => new Map(previous).set(shapeId, DEFAULT_FIELD))
}

export function getBranchInlineField(editor: Editor, shapeId: TLShapeId): BranchInlineField {
	return fieldsFor(editor).get().get(shapeId) ?? DEFAULT_FIELD
}

export function clearBranchInlineField(editor: Editor, shapeId: TLShapeId): void {
	const fields = fieldsFor(editor)
	if (!fields.get().has(shapeId)) return
	fields.update((previous) => {
		const next = new Map(previous)
		next.delete(shapeId)
		return next
	})
}

/** Open the editor on a field after the current gesture has settled. */
export function requestBranchInlineEdit(editor: Editor, shapeId: TLShapeId, field: BranchInlineField): void {
	rememberBranchInlineField(editor, shapeId, field)
	const begin = () => {
		if (!editor.getShape(shapeId)) return
		editor.setSelectedShapes([shapeId])
		editor.setEditingShape(shapeId)
	}
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(begin)
	else setTimeout(begin, 0)
}

export function branchInlineEditorPlacement(
	props: BranchShapeProps,
	field: BranchInlineField,
): { box: BranchRect; align: 'left' | 'center' } | null {
	const layout = branchLayout(props)
	switch (field.kind) {
		case 'title':
			return { box: layout.title, align: 'center' }
		case 'armTitle': {
			const row = layout.arms.find((arm) => arm.arm.id === field.armId)
			return row ? { box: row.title, align: 'left' } : null
		}
		case 'controlName': {
			const control = layout.controls.find((entry) => entry.port.id === field.portId)
			return control ? { box: control.label, align: 'left' } : null
		}
	}
}

export function branchInlineFieldAttribute(field: BranchInlineField): string {
	return JSON.stringify(field)
}

export function parseBranchInlineFieldAttribute(raw: string | undefined): BranchInlineField | null {
	if (!raw) return null
	try {
		const candidate = JSON.parse(raw) as Partial<BranchInlineField> & { armId?: unknown; portId?: unknown }
		if (candidate.kind === 'title') return { kind: 'title' }
		if (candidate.kind === 'armTitle' && typeof candidate.armId === 'string') {
			return { kind: 'armTitle', armId: candidate.armId }
		}
		if (candidate.kind === 'controlName' && typeof candidate.portId === 'string') {
			return { kind: 'controlName', portId: candidate.portId }
		}
	} catch {
		// A malformed paint-layer attribute is not document data.
	}
	return null
}

function contains(box: BranchRect | null, point: { x: number; y: number }): boolean {
	return Boolean(
		box
		&& point.x >= box.x
		&& point.x <= box.x + box.w
		&& point.y >= box.y
		&& point.y <= box.y + box.h,
	)
}

/** The text field under a Branch-local point, or null for chrome and interior. */
export function branchInlineFieldAtPointOrNull(
	props: BranchShapeProps,
	point: { x: number; y: number },
): BranchInlineField | null {
	const layout = branchLayout(props)
	for (const control of layout.controls) {
		if (contains(control.label, point)) return { kind: 'controlName', portId: control.port.id }
	}
	if (contains(layout.title, point)) return { kind: 'title' }
	for (const row of layout.arms) {
		if (contains(row.title, point)) return { kind: 'armTitle', armId: row.arm.id }
	}
	return null
}

/** The double-click reading: a miss on the band opens the title. */
export function branchInlineFieldAtPoint(
	props: BranchShapeProps,
	point: { x: number; y: number },
): BranchInlineField {
	return branchInlineFieldAtPointOrNull(props, point) ?? DEFAULT_FIELD
}

/** The painted field under a viewport point, scoped to one Branch's DOM. */
export function branchInlineFieldFromClientPoint(
	document: Document,
	clientPoint: { x: number; y: number },
	shapeId: TLShapeId,
): BranchInlineField | null {
	const hit = document
		.elementFromPoint(clientPoint.x, clientPoint.y)
		?.closest<HTMLElement>('[data-branch-field]')
	if (!hit) return null
	if (hit.closest<HTMLElement>('[data-shape-id]')?.dataset.shapeId !== shapeId) return null
	return parseBranchInlineFieldAttribute(hit.dataset.branchField)
}
