/**
 * Shared groundwork for the Type MAPPING primitive babble (5 variants, dev-only).
 *
 * Alias for this primitive: "algebraic type system." Zach's ask: pure Python
 * type-ALIAS assignments, `Name = <type expression>`, batched many-per-block —
 * `Estimator = Callable[[Frame, float], Pose]`. This is a different grammar
 * from `src/blocks/typeAttributes.ts`'s `name: Type` field list: an alias
 * MAPS/COMPOSES existing types together, it never declares a new record's
 * fields. It is also different from the sibling attribute-body babble
 * (`typeBabbleShared.ts`), whose flat `name: Type` lines describe one Type
 * Block's own fields.
 *
 * Reached only through `shape.meta.typeMappingBabbleVariant`, which no
 * ordinary board ever sets. Nothing here ships a new primitive — it borrows
 * the existing `block` shape, exactly the way the sibling babble does, and
 * reuses its real, board-scanning technique (`allBlocks`) rather than a
 * second, simulated lookup.
 */
import type { Editor } from 'tldraw'

import { allBlocks } from '../definitions/definitionLinking'
import { isTypeBlock } from '../typeAttributes'
import type { BlockShape } from '../blockModel'

/** One authored `Name = Expr` line, preserved verbatim. */
export interface TypeAlias {
	id: string
	line: number
	raw: string
	name: string
	/** The right-hand side, exact text — empty when the line did not parse. */
	expr: string
}

const ALIAS_LINE = /^([A-Za-z_]\w*)\s*=\s*(.+)$/

/** One line, one alias. A line the grammar cannot parse stays its own raw row. */
export function parseTypeMappingSource(source: string): TypeAlias[] {
	return source
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((raw, line) => ({ raw, line, trimmed: raw.trim() }))
		.filter(({ trimmed }) => trimmed !== '' && !trimmed.startsWith('#'))
		.map(({ raw, line, trimmed }) => {
			const match = ALIAS_LINE.exec(trimmed)
			return match
				? { id: `${line}:${match[1]}`, line, raw, name: match[1], expr: match[2].trim() }
				: { id: `${line}:raw`, line, raw, name: trimmed, expr: '' }
		})
}

/** The `typing` vocabulary Zach's own example leans on — always "known," no board lookup. */
export const KNOWN_TYPING_CONSTRUCTS = new Set([
	'Callable', 'Optional', 'Union', 'List', 'Dict', 'Tuple', 'Set', 'FrozenSet',
	'Sequence', 'Mapping', 'MutableMapping', 'Iterable', 'Iterator', 'Literal',
	'Type', 'Generic', 'TypeVar', 'ClassVar', 'Final', 'Protocol', 'NamedTuple',
	'TypedDict', 'Annotated',
])

/** Python's own scalar vocabulary — always "known," no board lookup. */
export const KNOWN_PRIMITIVES = new Set([
	'str', 'int', 'float', 'bool', 'bytes', 'None', 'Any', 'object',
	'list', 'dict', 'tuple', 'set', 'frozenset',
])

/** A shape wearing the Type Mapping babble hook — the exploration's own marker, not a shipped blockType. */
export function isTypeMappingBlock(shape: BlockShape | null | undefined): shape is BlockShape {
	return Boolean(shape) && shape!.meta?.typeMappingBabbleVariant != null
}

/**
 * Is `name` a live, board-scanned type? Not simulated — an ordinary scan of
 * every Block on every page, exactly what a person confirms by eye. Reuses
 * `allBlocks`, the same real lookup the shipped attribute babble uses.
 *
 * A Type Mapping block's OWN aliases are deliberately included in the scan:
 * batching means a later alias in the same block may compose an earlier one
 * (`Pair = Tuple[Pose, Pose]` then `Pairs = Iterable[Pair]`), and that is a
 * real reference, not a self-loop. Only a Type record excludes its own
 * title from matching one of its own field types, the same guard the
 * sibling babble makes for the same reason.
 */
export function findKnownTypeSource(
	editor: Editor,
	name: string,
	currentBlockId?: string,
): { block: BlockShape; alias?: TypeAlias } | null {
	const trimmed = name.trim()
	if (!trimmed) return null
	for (const block of allBlocks(editor)) {
		// A Type Mapping block IS a Type block (`blockType: 'type'`, tagged
		// additionally via `meta.typeMappingBabbleVariant`) — checking
		// `isTypeBlock` first made this branch `continue` before the mapping
		// check below ever ran, so no alias was ever resolvable. Mapping
		// identity has to be tested first.
		// Indirected through a local so TS's `shape is BlockShape` predicate
		// (needed elsewhere for its null/undefined narrowing) doesn't narrow
		// `block` to `never` in the branch below — it's already a BlockShape.
		const isMapping: boolean = isTypeMappingBlock(block)
		if (isMapping) {
			const alias = parseTypeMappingSource(block.props.attributeSource ?? '')
				.find((candidate) => candidate.name === trimmed)
			if (alias) return { block, alias }
			continue
		}
		if (isTypeBlock(block.props)) {
			if (block.id === currentBlockId) continue
			if (block.props.title.trim() === trimmed) return { block }
		}
	}
	return null
}

export type TokenResolution = 'construct' | 'primitive' | 'known' | 'unknown'

/** One judgement, shared by every variant's tree AND its source highlighting. */
export function resolveTypeToken(editor: Editor, name: string, currentBlockId?: string): TokenResolution {
	const trimmed = name.trim()
	if (KNOWN_TYPING_CONSTRUCTS.has(trimmed)) return 'construct'
	if (KNOWN_PRIMITIVES.has(trimmed)) return 'primitive'
	return findKnownTypeSource(editor, trimmed, currentBlockId) ? 'known' : 'unknown'
}

export interface ExprToken {
	text: string
	kind: 'identifier' | 'other'
}

const IDENTIFIER = /[A-Za-z_]\w*/g

/**
 * Split a type expression into identifier runs and the punctuation between
 * them — `Callable[[Frame, float], Pose]` becomes `Callable`, `[[`, `Frame`,
 * `, `, `float`, `], `, `Pose`, `]`. Every identifier is independently
 * resolved: a nested expression can name a `typing` construct, a builtin, a
 * board type, and an unknown name all in the same line.
 */
export function tokenizeTypeExpr(expr: string): ExprToken[] {
	const tokens: ExprToken[] = []
	let cursor = 0
	for (const match of expr.matchAll(IDENTIFIER)) {
		const index = match.index ?? 0
		if (index > cursor) tokens.push({ text: expr.slice(cursor, index), kind: 'other' })
		tokens.push({ text: match[0], kind: 'identifier' })
		cursor = index + match[0].length
	}
	if (cursor < expr.length) tokens.push({ text: expr.slice(cursor), kind: 'other' })
	return tokens
}
