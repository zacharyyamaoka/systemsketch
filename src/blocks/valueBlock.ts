/**
 * The separate `value` representation: a literal argument drawn as a capsule.
 *
 * `pose = estimate(frame, 2.0)` — the 2.0 is not estimate's default, it is a
 * value fed in from outside, a source. The capsule shares the Block
 * primitive rather than creating a new shape, so cables, the polarity judge,
 * click-to-edit, the inspector, and the file format apply to it unchanged.
 * It is nevertheless intentionally excluded from ordinary Block presentation
 * and batch-style controls.
 *
 * A pill is a variable, so it can be fed as well as read: it always has one
 * inlet on its left rim and one outlet on its right, so it can be a source
 * (`gain = 2.0` feeding a call), a sink, or both (`pose = estimate(…)`
 * passed on to `encode`). A cable remains a visible relationship; it never
 * replaces the words someone has written on the pill.
 * Three facts of the Block carry it:
 *
 * - `title` is the literal itself (`2.0`, `{"quat": True, …}`), the value the
 *   pill has. An inlet cable does not hide or replace this literal;
 * - the ports' `name` is the variable name, one name mirrored on both rims —
 *   empty means the literal is passed inline, so the name is the whole
 *   difference between `estimate(frame, 2.0)` and
 *   `gain = 2.0; estimate(frame, gain)`;
 * - the ports' `type` is inferred from the literal whenever the literal
 *   changes, and left alone when it cannot be (`math.pi` keeps whatever type
 *   it had).
 *
 * The definition default a port carries (`gain: float = 1.0`, the grey chip on
 * the consumer's row) is a fact about the callee and stays where it is; a
 * supplied literal is never drawn as that chip.
 */
import type { BlockPort, BlockShapeProps, BlockViewSize } from './blockModel'
import {
	VALUE_FONT_PX,
	VALUE_HEIGHT_PX,
	VALUE_MAX_WIDTH_PX,
	VALUE_MIN_WIDTH_PX,
	VALUE_PAD_X,
	measureBlockText,
} from './layoutBlock'

/** Literals longer than this, or spanning lines, abbreviate to `…` on the capsule. */
export const VALUE_FOLD_LENGTH = 18

/**
 * The Python type a literal's spelling declares, or '' when the text is an
 * expression whose type the spelling does not give away.
 */
export function inferLiteralType(literal: string): string {
	const text = literal.trim()
	if (text === '') return ''
	if (text === 'True' || text === 'False') return 'bool'
	if (text === 'None') return 'None'
	if (/^[+-]?\d+$/.test(text)) return 'int'
	if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(text)) return 'float'
	if (/^(?:[bB][rR]?|[rR][bB])["']/.test(text)) return 'bytes'
	if (/^(?:[rRuUfF]|[fF][rR]|[rR][fF])?["']/.test(text)) return 'str'
	if (text.startsWith('{')) return text === '{}' || text.includes(':') ? 'dict' : 'set'
	if (text.startsWith('[')) return 'list'
	if (text.startsWith('(')) return 'tuple'
	return ''
}

export function isFoldedLiteral(literal: string): boolean {
	return literal.includes('\n') || literal.length > VALUE_FOLD_LENGTH
}

export interface ValueBlockLabel {
	/** The variable name; '' when the literal is passed inline. */
	name: string
	/** The Python annotation carried by the mirrored ports. */
	type: string
	/** The literal exactly as typed. */
	literal: string
	/** What the capsule paints after `=`: the literal, or an explicit `…` abbreviation. */
	display: string
	folded: boolean
}

export function valueBlockOutlet(props: BlockShapeProps): BlockPort | null {
	return props.outputs[0] ?? null
}

export function valueBlockInlet(props: BlockShapeProps): BlockPort | null {
	return props.inputs[0] ?? null
}

/** The variable name: the outlet's, or the inlet's on a record with no outlet yet. */
export function valueBlockName(props: BlockShapeProps): string {
	return valueBlockOutlet(props)?.name ?? valueBlockInlet(props)?.name ?? ''
}

/** The variable annotation: the outlet wins, as it does for the name. */
export function valueBlockType(props: BlockShapeProps): string {
	return valueBlockOutlet(props)?.type ?? valueBlockInlet(props)?.type ?? ''
}

export function valueBlockLabel(props: BlockShapeProps): ValueBlockLabel {
	const literal = props.title
	const folded = isFoldedLiteral(literal)
	return {
		name: valueBlockName(props),
		type: valueBlockType(props),
		literal,
		// A pill is a direct rendering of its stored literal. Do not trim
		// punctuation or whitespace away just because it is subtle in a compact
		// capsule. Folding is the one explicit abbreviation.
		display: folded ? '…' : literal,
		folded,
	}
}

/** The text the capsule paints, name and all. */
export function valueBlockText(label: ValueBlockLabel): string {
	if (label.name === '') return `= ${label.display}`
	const annotation = label.type === '' ? label.name : `${label.name}: ${label.type}`
	return `${annotation} = ${label.display}`
}

/** The entire stored pill label, before a visible `…` abbreviation is applied. */
export function valueBlockExactText(label: ValueBlockLabel): string {
	return valueBlockText({ ...label, display: label.literal })
}

/**
 * A capsule is as wide as its text and never taller than one line.
 * Its fit uses the literal that is actually shown; a cable never substitutes
 * a different rendered value.
 */
export function valueBlockSize(label: ValueBlockLabel): BlockViewSize {
	const textWidth = measureBlockText(valueBlockText(label), VALUE_FONT_PX, 500, 'mono')
	const w = Math.round(
		Math.min(VALUE_MAX_WIDTH_PX, Math.max(VALUE_MIN_WIDTH_PX, textWidth + VALUE_PAD_X * 2)),
	)
	return { w, h: VALUE_HEIGHT_PX }
}

/**
 * Which of two mirrored values moved since the previous record: the one that
 * differs from its own previous value wins, so a rename through either rim is
 * honoured; with no history the outlet is canonical.
 */
function mirrored(
	outlet: string | undefined,
	inlet: string | undefined,
	previousOutlet: string | undefined,
	previousInlet: string | undefined,
): string {
	if (outlet === undefined) return inlet ?? ''
	if (inlet === undefined || inlet === outlet) return outlet
	if (inlet !== previousInlet && outlet === previousOutlet) return inlet
	return outlet
}

function samePort(port: BlockPort | undefined, wanted: BlockPort): boolean {
	return port !== undefined
		&& port.id === wanted.id
		&& port.name === wanted.name
		&& port.type === wanted.type
		&& port.visible
		&& port.defaultValue === undefined
		&& port.row === undefined
		&& port.branch === undefined
}

/**
 * The invariants of a Block in the `value` view, applied on every write:
 * exactly one inlet and one outlet sharing the variable's name and type, a
 * type that follows the literal, and a box that fits the text. Returns the
 * same object when nothing has to change, so a caller's no-op check still
 * sees a no-op.
 */
export function normalizeValueBlockProps(
	props: BlockShapeProps,
	previous?: BlockShapeProps,
): BlockShapeProps {
	if (props.view !== 'value') return props

	// Definition identity belongs to callable Blocks. A value capsule is one
	// variable occurrence, so stock duplicate / copy-and-paste must leave the
	// new capsule independently editable. Older capsules can carry these fields
	// because every Block once received them by default; clear that stale data
	// the first time a pill is normalised as well.
	const hasDefinitionMetadata = props.definitionId !== undefined
		|| props.definitionKey !== undefined
		|| props.draftOrdinal !== undefined
	const {
		definitionId: _definitionId,
		definitionKey: _definitionKey,
		draftOrdinal: _draftOrdinal,
		...unlinkedProps
	} = props

	const outletExisting = props.outputs[0]
	const inletExisting = props.inputs[0]
	const previousOutlet = previous?.view === 'value' ? previous.outputs[0] : undefined
	const previousInlet = previous?.view === 'value' ? previous.inputs[0] : undefined

	const name = mirrored(
		outletExisting?.name, inletExisting?.name, previousOutlet?.name, previousInlet?.name,
	)
	const literalChanged = previous === undefined
		|| previous.view !== 'value'
		|| previous.title !== props.title
	const inferred = inferLiteralType(props.title)
	const kept = mirrored(
		outletExisting?.type, inletExisting?.type, previousOutlet?.type, previousInlet?.type,
	)
	const explicitTypeChanged = previous !== undefined
		&& previous.view === 'value'
		&& kept !== (previousOutlet?.type ?? previousInlet?.type ?? '')
	// A title-only write follows Python's literal spelling. A canvas signature
	// writes title and annotation together, though, and its explicit annotation
	// must win over the inferred spelling (`pose: Pose = 2`, not `pose: int`).
	const type = literalChanged
		? (explicitTypeChanged && kept !== '' ? kept : (inferred !== '' ? inferred : kept))
		: (kept !== '' ? kept : inferred)

	const outlet: BlockPort = { id: outletExisting?.id ?? 'out_1', name, type, visible: true }
	const inlet: BlockPort = { id: inletExisting?.id ?? 'in_1', name, type, visible: true }

	const size = valueBlockSize(valueBlockLabel({ ...unlinkedProps, outputs: [outlet] }))
	const unchanged = props.inputs.length === 1
		&& props.outputs.length === 1
		&& samePort(inletExisting, inlet)
		&& samePort(outletExisting, outlet)
		&& props.w === size.w
		&& props.h === size.h
		&& props.views.value.w === size.w
		&& props.views.value.h === size.h
		&& !hasDefinitionMetadata
	if (unchanged) return props

	return {
		...unlinkedProps,
		inputs: [inlet],
		outputs: [outlet],
		w: size.w,
		h: size.h,
		views: { ...props.views, value: size },
	}
}

/** A Block nothing has been typed into or added to yet — what a drawing tool has just made. */
export function isBlankBlockProps(props: BlockShapeProps): boolean {
	return props.view !== 'value'
		&& props.title === ''
		&& props.inputs.length === 0
		&& props.outputs.length === 0
}

/**
 * The props of a fresh pill: an empty literal, an unnamed inlet and outlet, a
 * fitted box.
 *
 * The other views' remembered boxes are left exactly as they came: a box tool
 * creates a 1×1 shape on the drag path, and parking that as the Simple box
 * would make a later switch to Simple restore a 1×1 card.
 */
export function createValueBlockProps(
	base: BlockShapeProps,
	literal = '',
	name = '',
): BlockShapeProps {
	const seeded: BlockShapeProps = {
		...base,
		view: 'value',
		title: literal,
		blockType: 'literal',
		inputs: [{ id: 'in_1', name, type: '', visible: true }],
		outputs: [{ id: 'out_1', name, type: '', visible: true }],
	}
	return normalizeValueBlockProps(seeded)
}
