/**
 * Shared groundwork for the Type attribute-body babble (5 variants, dev-only).
 *
 * Every variant here is deliberately FLAT: one line, one attribute, no
 * indentation nesting. A field that names another Type is a reference, not a
 * nested body — the source stays the honest, algebraic spelling Zach asked
 * for, and "what's inside Pose" becomes a question the UI answers by looking
 * at the *other* Type block on the same board, not by re-typing its fields.
 *
 * This module is throwaway exploration: it is only reached through
 * `shape.meta.babbleVariant`, which no ordinary board ever sets. Nothing here
 * replaces `src/blocks/typeAttributes.ts`, the shipped parser.
 */
import { useValue, type Editor } from 'tldraw'

import { allBlocks } from '../definitions/definitionLinking'
import { isTypeBlock } from '../typeAttributes'
import type { BlockShape } from '../blockModel'

export type TypeResolution = 'primitive' | 'known' | 'unknown'

export interface FlatAttribute {
	id: string
	line: number
	raw: string
	name: string
	type: string
	value: string
}

const ATTRIBUTE_LINE = /^([A-Za-z_]\w*)\s*:\s*([^=]+?)(?:\s*=\s*(.*))?$/

/** One line per attribute. A line the grammar cannot parse stays a raw row. */
export function parseFlatAttributes(source: string): FlatAttribute[] {
	return source
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((raw, line) => ({ raw, line, trimmed: raw.trim() }))
		.filter(({ trimmed }) => trimmed !== '' && !trimmed.startsWith('#'))
		.map(({ raw, line, trimmed }) => {
			const match = ATTRIBUTE_LINE.exec(trimmed)
			return match
				? { id: `${line}:${match[1]}`, line, raw, name: match[1], type: match[2].trim(), value: (match[3] ?? '').trim() }
				: { id: `${line}:raw`, line, raw, name: trimmed, type: '', value: '' }
		})
}

/** Python's own scalar vocabulary — always "known," with no board lookup. */
export const KNOWN_PRIMITIVES = new Set([
	'str', 'int', 'float', 'bool', 'bytes', 'None', 'Any',
	'list', 'dict', 'tuple', 'set', 'frozenset',
])

/**
 * The one piece of real "auto-detection" every variant can build on: is
 * `typeName` a live Type Block elsewhere on this board? This is not
 * simulated — it is an ordinary page scan, exactly what a person visually
 * confirms by looking for another Type card with that title.
 */
export function findKnownTypeBlock(editor: Editor, typeName: string, excludeId?: string): BlockShape | null {
	const name = typeName.trim()
	if (!name) return null
	return allBlocks(editor).find((block) => (
		block.id !== excludeId
		&& isTypeBlock(block.props)
		&& block.props.title.trim() === name
	)) ?? null
}

export function isKnownTypeName(editor: Editor, typeName: string, excludeId?: string): boolean {
	const name = typeName.trim()
	return KNOWN_PRIMITIVES.has(name) || findKnownTypeBlock(editor, name, excludeId) !== null
}

/** The fields a resolved Type Block would show, for a drill-in preview. */
export function knownTypeFields(block: BlockShape): FlatAttribute[] {
	return parseFlatAttributes(block.props.attributeSource ?? '')
}
