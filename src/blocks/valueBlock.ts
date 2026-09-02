/**
 * The Block's `value` view: a literal argument drawn as a capsule.
 *
 * `pose = estimate(frame, 2.0)` — the 2.0 is not estimate's default, it is a
 * value fed in from outside, a source. The capsule is the Block primitive
 * wearing a fourth view rather than a new shape, so cables, the polarity
 * judge, click-to-edit, the inspector, batch styles and the file format all
 * apply to it unchanged. Three facts of the Block carry the literal:
 *
 * - `title` is the literal itself (`2.0`, `{"quat": True, …}`);
 * - the one outlet's `name` is the variable name — empty means the literal is
 *   passed inline, so the name is the whole difference between
 *   `estimate(frame, 2.0)` and `gain = 2.0; estimate(frame, gain)`;
 * - the outlet's `type` is inferred from the literal whenever the literal
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

/** Literals longer than this, or spanning lines, fold to `…` on the capsule. */
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
	return literal.includes('\n') || literal.trim().length > VALUE_FOLD_LENGTH
}

export interface ValueBlockLabel {
	/** The variable name; '' when the literal is passed inline. */
	name: string
	/** The literal exactly as typed. */
	literal: string
	/** What the capsule paints after `=`: the literal, or `…` when folded. */
	display: string
	folded: boolean
}

export function valueBlockOutlet(props: BlockShapeProps): BlockPort | null {
	return props.outputs[0] ?? null
}

export function valueBlockLabel(props: BlockShapeProps): ValueBlockLabel {
	const literal = props.title
	const folded = isFoldedLiteral(literal)
	return {
		name: valueBlockOutlet(props)?.name ?? '',
		literal,
		display: folded ? '…' : literal.trim(),
		folded,
	}
}

/** The text the capsule paints, name and all. */
export function valueBlockText(label: ValueBlockLabel): string {
	return label.name === '' ? `= ${label.display}` : `${label.name} = ${label.display}`
}

/** A capsule is as wide as its text and never taller than one line. */
export function valueBlockSize(label: ValueBlockLabel): BlockViewSize {
	const textWidth = measureBlockText(valueBlockText(label), VALUE_FONT_PX, 500, 'mono')
	const w = Math.round(
		Math.min(VALUE_MAX_WIDTH_PX, Math.max(VALUE_MIN_WIDTH_PX, textWidth + VALUE_PAD_X * 2)),
	)
	return { w, h: VALUE_HEIGHT_PX }
}

/**
 * The invariants of a Block in the `value` view, applied on every write:
 * no inputs, exactly one outlet, a type that follows the literal, and a box
 * that fits the text. Returns the same object when nothing has to change, so
 * a caller's no-op check still sees a no-op.
 */
export function normalizeValueBlockProps(
	props: BlockShapeProps,
	previous?: BlockShapeProps,
): BlockShapeProps {
	if (props.view !== 'value') return props

	const existing = props.outputs[0]
	const literalChanged = previous === undefined
		|| previous.view !== 'value'
		|| previous.title !== props.title
	const inferred = inferLiteralType(props.title)
	const kept = existing?.type ?? ''
	const type = literalChanged
		? (inferred !== '' ? inferred : kept)
		: (kept !== '' ? kept : inferred)
	const outlet: BlockPort = existing
		? { ...existing, type, visible: true }
		: { id: 'out_1', name: '', type, visible: true }

	const size = valueBlockSize(valueBlockLabel({ ...props, outputs: [outlet] }))
	const unchanged = props.inputs.length === 0
		&& props.outputs.length === 1
		&& existing?.type === type
		&& existing.visible
		&& props.w === size.w
		&& props.h === size.h
		&& props.views.value.w === size.w
		&& props.views.value.h === size.h
	if (unchanged) return props

	return {
		...props,
		inputs: [],
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
 * The props of a fresh pill: an empty literal, an unnamed outlet, a fitted box.
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
		inputs: [],
		outputs: [{ id: 'out_1', name, type: '', visible: true }],
	}
	return normalizeValueBlockProps(seeded)
}
