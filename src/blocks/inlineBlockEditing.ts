/**
 * Field-level adapter for tldraw's one-shape editing lifecycle.
 *
 * This is the pyblocks interaction model without its pipeline/linked-block
 * dependencies: tldraw still owns enter/complete/cancel, while this module only
 * remembers which semantic value inside a Block the editing shape exposes.
 */
import { atom, type Atom, type Editor, type TLShapeId } from 'tldraw'

import { caretOffsetFromPoint } from './babble/caretGeometry'
import { blockHeaderAlign, isBlockShape, isEffectPort, portInHeader, type BlockShape, type BlockShapeProps } from './blockModel'
import { portLanesEnabled } from './portLanePrototype'
import { formatPortSignature, parsePortSignature } from './portSignature'
import { isClockTriggerBlock } from './stockBlocks'
import {
	PORT_LABEL_INSET_PX,
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
			/** Character offset inside the clicked span, when the click hit painted text. */
			column?: number
	  }
	| {
			/**
			 * The port-lane prototype: one multi-line editor over a whole lane,
			 * one line per port. `line` and `column` are where the click landed,
			 * so the caret opens beside the character that was clicked.
			 */
			kind: 'portLane'
			side: 'inputs' | 'outputs'
			line?: number
			column?: number
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
	const aIsPort = a.kind === 'portName' || a.kind === 'portType'
	const bIsPort = b.kind === 'portName' || b.kind === 'portType'
	// A port's painted name and type are two spans over ONE editable line
	// (`name: Type = default`), so a click that moves from one span to the
	// other on the same port is the same field, not a second editing session.
	if (aIsPort && bIsPort) {
		const first = a as Extract<BlockInlineField, { portId: string }>
		const other = b as Extract<BlockInlineField, { portId: string }>
		return first.side === other.side && first.portId === other.portId
	}
	// A lane is one editor for its whole side; which line was clicked only
	// places the caret and never restarts the session.
	if (a.kind === 'portLane' && b.kind === 'portLane') return a.side === b.side
	return a.kind === b.kind
}

/**
 * With the lane prototype on, a Port-view Block has no one-port editor: every
 * way of asking for a port's name or type — click-to-edit, double-click, the
 * `+` bead, the context menu — opens that side's lane with the caret on the
 * port's line. Normalised HERE, at the one place a field is remembered, so
 * the lane and the one-line editor can never alternate.
 */
function normalizeInlineField(editor: Editor, shapeId: TLShapeId, field: BlockInlineField): BlockInlineField {
	if (field.kind !== 'portName' && field.kind !== 'portType') return field
	if (!portLanesEnabled()) return field
	const shape = editor.getShape(shapeId)
	if (!shape || !isBlockShape(shape) || shape.props.view !== 'port') return field
	const lane = shape.props[field.side].filter((port) => port.visible && !portInHeader(port) && !isEffectPort(port))
	const line = lane.findIndex((port) => port.id === field.portId)
	// A header port is not a lane line (it lives in the header band), so it
	// keeps its own one-port editor — the round-2 judge found the header `+`
	// bead typing into line 0's port instead.
	if (line < 0) return field
	const port = lane[line]
	// The clicked character travels with the click: an offset inside the
	// painted name is that column; inside the painted type it is the type
	// slot's start plus the offset.
	let column: number | undefined
	if (port && field.column !== undefined) {
		const { spans } = parsePortSignature(formatPortSignature(port))
		column = field.kind === 'portType' && spans.type
			? spans.type.start + Math.min(field.column, spans.type.end - spans.type.start)
			: spans.name.start + Math.min(field.column, spans.name.end - spans.name.start)
	}
	return { kind: 'portLane', side: field.side, line, column }
}

export function rememberBlockInlineField(
	editor: Editor,
	shapeId: TLShapeId,
	field: BlockInlineField,
): void {
	const fields = fieldsFor(editor)
	const current = fields.get().get(shapeId)
	const next = normalizeInlineField(editor, shapeId, field)
	if (current && isSameBlockInlineField(current, next)) {
		// The same lane, but a more precise landing: two handlers see one
		// click (tldraw's own and click-to-edit's), and whichever carries the
		// character wins. Same editor, only the caret moves.
		if (
			next.kind === 'portLane' && current.kind === 'portLane'
			&& (next.column !== undefined || next.line !== undefined)
			&& (next.column !== current.column || next.line !== current.line)
			&& !(next.column === undefined && current.column !== undefined && next.line === current.line)
		) {
			fields.update((previous) => new Map(previous).set(shapeId, next))
		}
		return
	}
	fields.update((previous) => new Map(previous).set(shapeId, next))
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
	/** A lane's line pitch, so each line of the editor sits on its port's row. */
	linePitch?: number
}

/** The default row pitch a lane assumes when it has fewer than two ports to measure. */
export const PORT_LANE_DEFAULT_PITCH_PX = 44

/**
 * Where a lane editor sits: over the side's body ports, one line per port,
 * measured from the laid-out dots so the lines land on the rows. An empty
 * lane still gets one line's worth of room to type the first port into.
 */
export function portLanePlacement(
	props: BlockShapeProps,
	side: 'inputs' | 'outputs',
): BlockInlineEditorPlacement | null {
	if (props.view !== 'port') return null
	const layout = layoutBlock(props)
	const width = layout.bounds.w
	const placed = layout.ports.filter((entry) =>
		entry.side === (side === 'inputs' ? 'input' : 'output')
		&& entry.label !== null
		&& (entry.edge === 'left' || entry.edge === 'right'))
	const pitch = placed.length > 1 ? placed[1]!.y - placed[0]!.y : PORT_LANE_DEFAULT_PITCH_PX
	const top = placed.length > 0 ? placed[0]!.y - pitch / 2 : layout.bodyTop
	const laneWidth = Math.max(120, width / 2 - PORT_LABEL_INSET_PX - 8)
	// WHY the outputs lane sits OUTSIDE the right edge, typed left-to-right:
	// a right-aligned editor "feels reverse" (Zach, 2026-09-09) — nobody types
	// with the caret anchored at the right. Parking the lane just past the
	// dots keeps the rows aligned one-to-one with the ports while the text
	// reads and edits the ordinary way; only the horizontal mirroring of the
	// painted labels is given up, and only while the lane is open.
	return {
		box: {
			x: side === 'inputs' ? PORT_LABEL_INSET_PX : width + PORT_LABEL_INSET_PX,
			y: top,
			w: laneWidth,
			h: Math.max(pitch, pitch * placed.length),
		},
		align: 'left',
		linePitch: pitch,
	}
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
			return box ? {
				box,
				align: props.view === 'simple' || blockHeaderAlign(props) === 'center'
					? 'center'
					: 'left',
			} : null
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
		case 'portLane':
			return portLanePlacement(props, field.side)
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
/**
 * The lane under a Block-local point, for the port-lane prototype: the left
 * half of a Port view's body is the inputs lane, the right half the outputs
 * lane, and the nearest port row is the line the caret opens on.
 */
export function portLaneAtPoint(
	props: BlockShapeProps,
	point: { x: number; y: number },
): Extract<BlockInlineField, { kind: 'portLane' }> | null {
	if (props.view !== 'port') return null
	const layout = layoutBlock(props)
	if (point.y < layout.bodyTop || point.y > layout.footerTop) return null
	const side = point.x < layout.bounds.w / 2 ? 'inputs' : 'outputs'
	const placed = layout.ports.filter((entry) =>
		entry.side === (side === 'inputs' ? 'input' : 'output')
		&& entry.label !== null
		&& (entry.edge === 'left' || entry.edge === 'right'))
	let line = 0
	let best = Number.POSITIVE_INFINITY
	placed.forEach((entry, index) => {
		const distance = Math.abs(entry.y - point.y)
		if (distance < best) {
			best = distance
			line = index
		}
	})
	return { kind: 'portLane', side, line }
}

export function blockInlineFieldAtPointOrNull(
	props: BlockShapeProps,
	point: { x: number; y: number },
	options: { portLanes?: boolean } = {},
): BlockInlineField | null {
	if (options.portLanes) {
		const lane = portLaneAtPoint(props, point)
		if (lane) return lane
	}
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
	// A Clock face includes an immutable derived declaration plus an optional
	// annotation. Its combined paint is not one editable string; edit the
	// annotation honestly in the inspector instead of overwriting the label.
	if (contains(layout.description, point) && !isClockTriggerBlock(props)) return { kind: 'description' }

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
	const field = parseBlockInlineFieldAttribute(hit.dataset.pbInlineField)
	if (field && (field.kind === 'portName' || field.kind === 'portType')) {
		// Per-character: which character of the painted span was under the
		// pointer, so the editor can open with the caret right there.
		return { ...field, column: caretOffsetFromPoint(hit, clientPoint.x, clientPoint.y) }
	}
	return field
}
