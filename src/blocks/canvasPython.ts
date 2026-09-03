/**
 * The small, deliberately forgiving Python-shaped grammar used by *canvas*
 * text entry. The inspector remains a raw editor: it never calls this module.
 *
 *   pose: Pose = 2
 *   raw: bytes = 2.0
 *   gain = 1.0
 *
 * A person can still type an arbitrary name on the canvas; only `:` and the
 * assignment `=` have structure. We split a single assignment token rather
 * than trying to parse Python, so literals and type expressions stay opaque.
 */
import type { BlockPort, BlockPortSide, BlockShapeProps } from './blockModel'
import { inferLiteralType, valueBlockInlet, valueBlockName, valueBlockOutlet } from './valueBlock'

export interface CanvasPythonSignature {
	name: string
	type: string
	value: string
	hasAnnotation: boolean
	hasAssignment: boolean
}

/** Find a lone Python assignment, but leave comparisons such as `a == b` alone. */
function assignmentIndex(text: string): number {
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] !== '=') continue
		const previous = text[index - 1] ?? ''
		const next = text[index + 1] ?? ''
		if (!'=!<>:'.includes(previous) && next !== '=') return index
	}
	return -1
}

/**
 * Interpret only the declaration shell. The value is intentionally just text:
 * it may be a dictionary, a call, or any expression the canvas wants to keep.
 */
export function parseCanvasPythonSignature(source: string): CanvasPythonSignature {
	const assignment = assignmentIndex(source)
	const declaration = (assignment < 0 ? source : source.slice(0, assignment)).trim()
	const candidateAnnotation = declaration.indexOf(':')
	// A colon in a dictionary literal is not an annotation. Canvas signatures
	// keep the assignment target intentionally modest: the usual Python name.
	const annotation = candidateAnnotation >= 0
		&& /^[A-Za-z_][A-Za-z0-9_]*$/.test(declaration.slice(0, candidateAnnotation).trim())
		? candidateAnnotation
		: -1
	return {
		name: (annotation < 0 ? declaration : declaration.slice(0, annotation)).trim(),
		type: annotation < 0 ? '' : declaration.slice(annotation + 1).trim(),
		value: assignment < 0 ? '' : source.slice(assignment + 1).trim(),
		hasAnnotation: annotation >= 0,
		hasAssignment: assignment >= 0,
	}
}

function samePortText(port: BlockPort | null, name: string, type: string): boolean {
	return port?.name === name && port.type === type
}

/**
 * Finish a canvas edit of a pill's name field. A pristine pill also keeps the
 * useful literal shorthand: entering `2.0` creates an unnamed float pill.
 * Once a pill has content, a bare word is always a name, as a new code line is.
 */
export function applyCanvasPillSignature(
	props: BlockShapeProps,
	source: string,
): BlockShapeProps {
	if (props.view !== 'value') return props
	const signature = parseCanvasPythonSignature(source)
	const inlet = valueBlockInlet(props)
	const outlet = valueBlockOutlet(props)
	const currentName = valueBlockName(props)
	const currentType = outlet?.type ?? inlet?.type ?? ''
	// During the edit the ordinary inline field has already mirrored its raw
	// text into both ports. `currentName === source` is therefore still the
	// freshly-created state, not evidence that the person deliberately named it.
	const isPristine = props.title === '' && (currentName === '' || currentName === source)
	const bareLiteral = !signature.hasAnnotation
		&& !signature.hasAssignment
		&& isPristine
		&& inferLiteralType(source) !== ''

	const name = bareLiteral ? '' : signature.name
	const type = signature.hasAnnotation ? signature.type : currentType
	const title = bareLiteral
		? source.trim()
		: signature.hasAssignment
			? signature.value
			: props.title
	if (props.title === title && samePortText(inlet, name, type) && samePortText(outlet, name, type)) {
		return props
	}
	return {
		...props,
		title,
		inputs: [{ ...(inlet ?? { id: 'in_1', visible: true }), name, type }],
		outputs: [{ ...(outlet ?? { id: 'out_1', visible: true }), name, type }],
	}
}

/**
 * Finish a canvas edit of a normal Block port's name. Input ports have an
 * ordinary definition default, so their `= value` part fills it; outputs keep
 * their existing value-less contract. A bare name has already been written as
 * the person types and needs no second mutation.
 */
export function canvasPortSignaturePatch(
	port: BlockPort,
	side: BlockPortSide,
	source: string,
): Partial<Omit<BlockPort, 'id'>> | null {
	const signature = parseCanvasPythonSignature(source)
	if (!signature.hasAnnotation && !signature.hasAssignment) return null
	const patch: Partial<Omit<BlockPort, 'id'>> = {
		name: signature.name,
		...(signature.hasAnnotation ? { type: signature.type } : {}),
	}
	if (side === 'inputs' && signature.hasAssignment) patch.defaultValue = signature.value
	return patch
}
