import { getDefaultBlockProps, type BlockShapeProps } from './blockModel'

/**
 * A Type is a Block-shaped domain definition, not a second dataflow engine.
 * Its one body is text because Python annotations already have a mature,
 * composable syntax. `TypeAttributeRegion` renders `parseTypeAttributeSource`'s
 * result as a dense, foldable tree; neither this module nor that one ever
 * turns a row back into an independently editable field. See
 * `src/blocks/ui/TypeAttributeRegion.tsx`.
 */
export const TYPE_BLOCK_TYPE = 'type'

/** One authored source line, preserved verbatim and annotated with its readable pieces. */
export interface TypeAttribute {
	id: string
	line: number
	indent: number
	raw: string
	name: string
	type: string
	value: string
	children: TypeAttribute[]
}

const CLASS_HEADER = /^class\s+[A-Za-z_]\w*(?:\[[^\]]+\])?\s*(?:\([^)]*\))?\s*:$/
const ATTRIBUTE_LINE = /^([A-Za-z_]\w*)\s*:\s*([^=]+?)(?:\s*=\s*(.*))?$/

function attributeAt(line: number, indent: number, raw: string, trimmed: string): TypeAttribute {
	const match = ATTRIBUTE_LINE.exec(trimmed)
	return match
		? { id: `${line}:${match[1]}`, line, indent, raw, name: match[1], type: match[2].trim(), value: (match[3] ?? '').trim(), children: [] }
		: { id: `${line}:raw`, line, indent, raw, name: trimmed, type: '', value: '', children: [] }
}

/**
 * Projects a Type's exact source into a nested read tree. A line the grammar
 * cannot parse stays visible as its own raw row instead of becoming a
 * validation error — a whiteboard draft is allowed to be mid-thought.
 */
export function parseTypeAttributeSource(source: string): TypeAttribute[] {
	const roots: TypeAttribute[] = []
	const stack: TypeAttribute[] = []
	const lines = source.replace(/\r\n?/g, '\n').split('\n')

	// A pasted `class Foo(NamedTuple):` body carries one authoring indent that
	// is not semantic nesting. `bodyIndent` is learned from the first indented
	// line under the header, so this holds for any indent width the paste
	// used — two spaces, four, or a tab — rather than assuming PEP 8's four.
	let classHeaderIndent: number | null = null
	let bodyIndent: number | null = null
	let docstringQuote: "'''" | '"""' | null = null

	for (const [line, rawLine] of lines.entries()) {
		const trimmed = rawLine.trim()
		if (docstringQuote) {
			if (trimmed.includes(docstringQuote)) docstringQuote = null
			continue
		}
		if (trimmed === '' || trimmed.startsWith('#')) continue

		const openingQuote = trimmed.startsWith('"""') ? '"""' : trimmed.startsWith("'''") ? "'''" : null
		if (openingQuote) {
			// A one-line docstring opens and closes on the same line; only a
			// multi-line one needs its prose suppressed until the closing quote.
			if (trimmed.slice(3).includes(openingQuote)) continue
			docstringQuote = openingQuote
			continue
		}

		const indent = rawLine.length - rawLine.trimStart().length
		if (CLASS_HEADER.test(trimmed)) {
			classHeaderIndent = indent
			continue
		}
		if (classHeaderIndent !== null && bodyIndent === null && indent > classHeaderIndent) {
			bodyIndent = indent
		}
		const relativeIndent = classHeaderIndent !== null && indent > classHeaderIndent
			? indent - (bodyIndent ?? indent)
			: indent

		const attribute = attributeAt(line, Math.max(0, relativeIndent), rawLine, trimmed)
		while (stack.length > 0 && attribute.indent <= stack[stack.length - 1]!.indent) stack.pop()
		const parent = stack[stack.length - 1]
		if (parent) parent.children.push(attribute)
		else roots.push(attribute)
		stack.push(attribute)
	}
	return roots
}

/** The one-line rendering of an attribute, used for tooltips and export text. */
export function typeAttributeDisplay(attribute: Pick<TypeAttribute, 'name' | 'type' | 'value'>): string {
	const type = attribute.type ? `: ${attribute.type}` : ''
	const value = attribute.value ? ` = ${attribute.value}` : ''
	return `${attribute.name}${type}${value}`
}

export function isTypeBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === TYPE_BLOCK_TYPE
}

/** The props of a freshly drawn Type: a Port-view Block with a placeholder attribute. */
export function createTypeProps(base = getDefaultBlockProps()): BlockShapeProps {
	const port = { w: 380, h: 264 }
	const expanded = { w: 560, h: 460 }
	return {
		...base,
		title: base.title || 'Type',
		description: '',
		blockType: TYPE_BLOCK_TYPE,
		icon: 'Braces',
		attributeSource: base.attributeSource || 'field: Type',
		view: 'port',
		w: port.w,
		h: port.h,
		views: {
			...base.views,
			port,
			expanded,
		},
		inputs: [],
		outputs: [],
	}
}
