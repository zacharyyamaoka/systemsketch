/**
 * The one-line grammar of a port, the way Python already spells a parameter:
 *
 *   pose: Pose = None
 *   window: int = 5
 *   temperature sensor readings          ← free text is a name, nothing else
 *
 * WHY one text field and not three boxes: a port on a whiteboard is a label
 * first and a Python parameter second. Three boxes impose the parameter's
 * structure on someone who is only naming a signal, while one line lets the
 * structure appear exactly when it is typed — a `:` makes a type, an `=`
 * makes a default — and disappear when it is deleted. Zach's call on
 * 2026-09-09: "having the 3 separate text boxes there just feels like imposing
 * structure when none is perhaps needed."
 *
 * WHY the stored record stays `{ name, type, defaultValue }`: a port line has
 * nothing a parse drops (a Type's multi-line body does — comments, docstrings,
 * indentation — which is why `attributeSource` stays text). The triple is the
 * line's parse tree; `formatPortSignature` and `parsePortSignature` are the
 * only two functions allowed to cross between them, and the round trip is
 * lossless for every triple whose name holds no depth-0 `:` or `=`. The
 * bindings, the Python projection, the detach primitives and every journey
 * keep reading the triple untouched. If the grammar ever grows something the
 * triple cannot hold (`*args`, a trailing `# comment`), add a `source` field
 * then — not before, because two canonical copies of one fact is the
 * semantic-merge-conflict trap the members work just avoided.
 *
 * WHY depth-0 splitting rather than `parseCanvasPythonSignature`'s identifier
 * rule: the pill grammar needs `{"a": 1}` typed alone to be a literal, so it
 * refuses a colon unless an identifier precedes it. A port line has no such
 * ambiguity — nobody names a port with a dict — and the identifier rule would
 * silently re-split a legacy name with a space in it (`a b: int`) into a
 * name with no type. Brackets and quotes are respected so `dict[str, int]`,
 * `Callable[[int], str] = f` and `lambda x: x` all land in the slot they
 * belong to.
 */
import type { BlockPort } from './blockModel'

export type PortSignatureSlot = 'name' | 'type' | 'default'

export interface PortSignatureSpan {
	start: number
	end: number
}

export interface PortSignature {
	name: string
	type: string
	defaultValue: string
	/** Untrimmed character ranges of each slot in the source text. */
	spans: {
		name: PortSignatureSpan
		colon: number | null
		type: PortSignatureSpan | null
		equals: number | null
		default: PortSignatureSpan | null
	}
}

interface Split {
	colon: number
	equals: number
}

/** The first depth-0 `:` (before any `=`) and the first depth-0 assignment `=`. */
function splitPoints(text: string): Split {
	let depth = 0
	let quote: string | null = null
	let colon = -1
	let equals = -1
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]!
		if (quote) {
			if (char === '\\') index += 1
			else if (char === quote) quote = null
			continue
		}
		if (char === '"' || char === "'") {
			quote = char
			continue
		}
		if (char === '(' || char === '[' || char === '{') {
			depth += 1
			continue
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1)
			continue
		}
		if (depth !== 0) continue
		if (char === ':' && colon < 0 && text[index + 1] !== '=') {
			colon = index
			continue
		}
		if (char === '=') {
			const previous = text[index - 1] ?? ''
			const next = text[index + 1] ?? ''
			// `==`, `!=`, `<=`, `>=` are comparisons, `:=` is a walrus; only a
			// bare `=` is the default's assignment.
			if (next === '=' || '=!<>:'.includes(previous)) continue
			equals = index
			break
		}
	}
	return { colon, equals }
}

function trimmedSpan(text: string, start: number, end: number): PortSignatureSpan {
	let from = start
	let to = end
	while (from < to && /\s/.test(text[from]!)) from += 1
	while (to > from && /\s/.test(text[to - 1]!)) to -= 1
	return { start: from, end: to }
}

export function parsePortSignature(text: string): PortSignature {
	const { colon, equals } = splitPoints(text)
	const nameEnd = colon >= 0 ? colon : equals >= 0 ? equals : text.length
	const typeEnd = equals >= 0 ? equals : text.length
	const name = trimmedSpan(text, 0, nameEnd)
	const type = colon >= 0 ? trimmedSpan(text, colon + 1, typeEnd) : null
	const defaultSpan = equals >= 0 ? trimmedSpan(text, equals + 1, text.length) : null
	return {
		name: text.slice(name.start, name.end),
		type: type ? text.slice(type.start, type.end) : '',
		defaultValue: defaultSpan ? text.slice(defaultSpan.start, defaultSpan.end) : '',
		spans: {
			name,
			colon: colon >= 0 ? colon : null,
			type,
			equals: equals >= 0 ? equals : null,
			default: defaultSpan,
		},
	}
}

/** The canonical spelling of a port's stored triple, `name: Type = default`. */
export function formatPortSignature(
	port: Pick<BlockPort, 'name' | 'type'> & { defaultValue?: string },
): string {
	const type = port.type ? `: ${port.type}` : ''
	const defaultValue = port.defaultValue ? ` = ${port.defaultValue}` : ''
	return `${port.name}${type}${defaultValue}`
}

export interface PortSignatureSlotAt {
	slot: PortSignatureSlot
	/** Where the slot's text begins — the point a completion replaces from. */
	start: number
	end: number
	/** The slot's text from its start to the caret, trimmed. */
	query: string
}

/**
 * Which slot the caret is in. This is what makes the field grammar-aware:
 * the same keystroke offers types after a `:`, values after an `=`, and —
 * deliberately — nothing at all while a name is being typed.
 */
export function portSignatureSlotAt(text: string, caret: number): PortSignatureSlotAt {
	// One port is one line. In a lane of several ports the grammar is applied
	// to the caret's own line, with every offset reported against the whole
	// text so a completion can splice into the document directly.
	const at = Math.max(0, Math.min(caret, text.length))
	const lineStart = text.lastIndexOf('\n', at - 1) + 1
	const nextBreak = text.indexOf('\n', at)
	const lineEnd = nextBreak === -1 ? text.length : nextBreak
	const line = text.slice(lineStart, lineEnd)
	const local = at - lineStart
	const { colon, equals } = splitPoints(line)
	const shift = (found: PortSignatureSlotAt): PortSignatureSlotAt => ({
		...found,
		start: found.start + lineStart,
		end: found.end + lineStart,
	})
	if (equals >= 0 && local > equals) {
		const start = leadingSpaceEnd(line, equals + 1)
		return shift({ slot: 'default', start, end: line.length, query: line.slice(start, local).trim() })
	}
	if (colon >= 0 && local > colon) {
		const start = leadingSpaceEnd(line, colon + 1)
		const end = equals >= 0 ? equals : line.length
		return shift({ slot: 'type', start, end, query: line.slice(start, Math.min(local, end)).trim() })
	}
	const end = colon >= 0 ? colon : equals >= 0 ? equals : line.length
	return shift({ slot: 'name', start: 0, end, query: line.slice(0, Math.min(local, end)).trim() })
}

/** Every line of a lane parsed, with its spans shifted to whole-text offsets. */
export function parsePortLaneLines(text: string): Array<PortSignature & { lineStart: number; lineEnd: number }> {
	const lines: Array<PortSignature & { lineStart: number; lineEnd: number }> = []
	let lineStart = 0
	for (const line of text.split('\n')) {
		const parsed = parsePortSignature(line)
		const shiftSpan = (span: PortSignatureSpan | null) => (span ? { start: span.start + lineStart, end: span.end + lineStart } : null)
		lines.push({
			...parsed,
			spans: {
				name: shiftSpan(parsed.spans.name)!,
				colon: parsed.spans.colon === null ? null : parsed.spans.colon + lineStart,
				type: shiftSpan(parsed.spans.type),
				equals: parsed.spans.equals === null ? null : parsed.spans.equals + lineStart,
				default: shiftSpan(parsed.spans.default),
			},
			lineStart,
			lineEnd: lineStart + line.length,
		})
		lineStart += line.length + 1
	}
	return lines
}

function leadingSpaceEnd(text: string, from: number): number {
	let index = from
	while (index < text.length && text[index] === ' ') index += 1
	return index
}

/**
 * The `findSlot` adapter for the board's type-name completion: a slot only
 * while the caret sits in the type, spelled the way `typeNameCompletion`
 * expects it (`start` + `query`).
 */
export function portTypeSlot(text: string, caret: number): { start: number; query: string } | null {
	const found = portSignatureSlotAt(text, caret)
	return found.slot === 'type' ? { start: found.start, query: found.query } : null
}

/**
 * The write half of the seam: the patch a typed line means for a stored
 * port, or `null` when it already says exactly this. An empty default clears
 * the key rather than storing `''`, so a port that never had one stays
 * byte-identical after a rename.
 */
export function portSignaturePatch(
	port: Pick<BlockPort, 'name' | 'type'> & { defaultValue?: string },
	text: string,
): Partial<Omit<BlockPort, 'id'>> | null {
	const parsed = parsePortSignature(text)
	const patch: Partial<Omit<BlockPort, 'id'>> = {}
	if (parsed.name !== port.name) patch.name = parsed.name
	if (parsed.type !== port.type) patch.type = parsed.type
	const nextDefault = parsed.defaultValue === '' ? undefined : parsed.defaultValue
	if (nextDefault !== port.defaultValue) patch.defaultValue = nextDefault
	return Object.keys(patch).length === 0 ? null : patch
}
