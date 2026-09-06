/**
 * Pure logic for the type-name autocomplete dropdown (dev-only babble
 * synthesis of the V1/V2/V3 mockups Zach reviewed in
 * `docs/type-autocomplete-babble-2026-09-05.html`). Kept free of React/DOM so
 * registry building, matching, sorting and caret/type-slot detection are all
 * unit-testable without mounting a `<textarea>`.
 *
 * Registry is real, not simulated: a "board type" is a live Type Block
 * (`isTypeBlock`), a "mapped type" is a live alias inside a Type Mapping
 * block (`isTypeMappingBlock` / `parseTypeMappingSource`), both scanned via
 * `allBlocks`, the same real board-scan every other babble in this directory
 * already relies on. Primitives are `typeBabbleShared`'s own read-only list.
 */
import type { Editor } from 'tldraw'

import { isTypeBlock } from '../typeAttributes'
import type { BlockShape } from '../blockModel'
import { KNOWN_PRIMITIVES } from './typeBabbleShared'
import { isTypeMappingBlock, parseTypeMappingSource } from './typeMappingShared'
import { allBlocks } from '../definitions/definitionLinking'

export type AutocompleteKind = 'board-type' | 'mapped-type' | 'primitive'

/** Human label for the kind pill. Colour is a rendering concern — see the component. */
export const KIND_LABEL: Record<AutocompleteKind, string> = {
	'board-type': 'board type',
	'mapped-type': 'mapped type',
	primitive: 'primitive',
}

export interface AutocompleteEntry {
	kind: AutocompleteKind
	/** The exact text inserted on accept — a mapping's NAME, never its expression. */
	name: string
	/** Right-aligned detail column text. */
	detail: string
	/**
	 * Extra text this entry also matches against, beyond its own name — only a
	 * mapped-type's expression (`Callable[[Frame, float], Pose]`), so typing
	 * "Pose" still surfaces `Estimator = Callable[[Frame, float], Pose]` even
	 * though "Pose" never appears in the name "Estimator" itself.
	 */
	alsoMatches?: string
	/** Struck through, dimmed, and inert — VS Code's own treatment for a
	 * symbol that's valid to LIST but not to pick right now (e.g. deprecated).
	 * Nothing in this registry sets it yet; the field exists so a future
	 * caller can without a rendering change. */
	disabled?: boolean
}

/**
 * Every syntactically valid thing this board currently lets you write in a
 * type-annotation slot. `excludeBlockId` drops one block's OWN contribution
 * (its board-type title, and/or its mapped-type aliases) — for a caller that
 * wants to keep a block from referencing itself. Nothing is excluded by
 * default: `Pose` legitimately self-references (`x: Pose`) elsewhere in this
 * codebase, and that is a valid, intentional pattern, not a bug to guard
 * against.
 */
export function buildRegistry(editor: Editor, excludeBlockId?: string): AutocompleteEntry[] {
	const entries: AutocompleteEntry[] = []
	const seenBoardTypes = new Set<string>()
	const seenMappedTypes = new Set<string>()

	for (const block of allBlocks(editor)) {
		if (excludeBlockId && block.id === excludeBlockId) continue
		if (isTypeBlock(block.props)) {
			const title = block.props.title.trim()
			if (!title || seenBoardTypes.has(title)) continue
			seenBoardTypes.add(title)
			entries.push({ kind: 'board-type', name: title, detail: 'Type · this board' })
			continue
		}
		if (isTypeMappingBlock(block as BlockShape)) {
			for (const alias of parseTypeMappingSource(block.props.attributeSource ?? '')) {
				if (!alias.name || !alias.expr || seenMappedTypes.has(alias.name)) continue
				seenMappedTypes.add(alias.name)
				entries.push({ kind: 'mapped-type', name: alias.name, detail: `= ${alias.expr}`, alsoMatches: alias.expr })
			}
		}
	}

	for (const primitive of KNOWN_PRIMITIVES) {
		entries.push({ kind: 'primitive', name: primitive, detail: 'built-in' })
	}
	return entries
}

/**
 * "Board types first" ordering for the browse-everything list — an open
 * library, not a relevance ranking. Independent of registry build order so a
 * caller can hand this any entry set.
 */
export function buildBrowseList(entries: readonly AutocompleteEntry[]): AutocompleteEntry[] {
	const order: AutocompleteKind[] = ['board-type', 'mapped-type', 'primitive']
	return order.flatMap((kind) => entries.filter((entry) => entry.kind === kind))
}

/**
 * One entry's judgement against a query: `rank` 0 is a `startsWith` match on
 * the entry's own NAME, `rank` 1 is a substring-only match (via the name or,
 * for a mapped type, its expression). `null` means the entry does not match
 * at all.
 */
function matchEntry(entry: AutocompleteEntry, queryLower: string): { rank: 0 | 1 } | null {
	const nameLower = entry.name.toLowerCase()
	const nameContains = nameLower.includes(queryLower)
	const exprContains = entry.alsoMatches ? entry.alsoMatches.toLowerCase().includes(queryLower) : false
	if (!nameContains && !exprContains) return null
	return { rank: nameLower.startsWith(queryLower) ? 0 : 1 }
}

/**
 * Fuzzy-relevance ranking for an ACTIVE query — deliberately kind-agnostic.
 * A name-`startsWith` match always outranks a substring-only match so typing
 * "float" surfaces the `float` primitive above a board type that merely
 * contains "float" somewhere unrelated; primitives are never forced to the
 * bottom the way the browse list forces them there.
 */
export function buildQueryResults(entries: readonly AutocompleteEntry[], query: string): AutocompleteEntry[] {
	const queryLower = query.trim().toLowerCase()
	if (!queryLower) return []
	return entries
		.map((entry) => ({ entry, match: matchEntry(entry, queryLower) }))
		.filter((item): item is { entry: AutocompleteEntry; match: { rank: 0 | 1 } } => item.match !== null)
		.sort((a, b) => a.match.rank - b.match.rank)
		.map((item) => item.entry)
}

export interface TypeSlot {
	/** Absolute offset into the full textarea value where the query span begins. */
	start: number
	/** The trimmed text between `start` and the caret — what the dropdown searches for. */
	query: string
}

// `name: type` — the query is whatever sits between the colon (plus its
// immediate whitespace) and the first `=` or line end, so a trailing default
// value (`= 10`) is never mistaken for part of the type being typed.
const TYPE_SLOT_LINE = /^([A-Za-z_]\w*)\s*:\s*([^=\n]*)/

/**
 * Is `caret` sitting inside `value`'s type-name slot on its current line?
 * Returns the query span if so, `null` otherwise (caret before the colon,
 * caret past a `=`, or a line that doesn't parse as `name: type` at all).
 */
export function findTypeSlot(value: string, caret: number): TypeSlot | null {
	const lineStart = value.lastIndexOf('\n', caret - 1) + 1
	const nextBreak = value.indexOf('\n', caret)
	const lineEnd = nextBreak === -1 ? value.length : nextBreak
	const line = value.slice(lineStart, lineEnd)

	const match = TYPE_SLOT_LINE.exec(line)
	if (!match) return null

	// The captured type-group's own start/end, found by subtracting its
	// length from the full match's — robust to however much whitespace the
	// author put around the colon, no manual `indexOf(':')` needed.
	const queryStart = match[0].length - match[2].length
	const queryEnd = match[0].length
	const caretColumn = caret - lineStart
	if (caretColumn < queryStart || caretColumn > queryEnd) return null

	const start = lineStart + queryStart
	return { start, query: value.slice(start, caret).trim() }
}

// `Name = <expr>` — a Type Mapping alias's right-hand side can nest several
// identifiers inside brackets/commas (`Callable[[Frame, float], Pose]`), so
// unlike a flat attribute's one fixed type span, the slot is the identifier
// run ENDING at the caret, found by walking backward while the caret sits
// on a word character — empty right after `=`, `[`, or `,` (a real IDE
// offers completions there too, not just mid-word).
const ALIAS_LINE_HEAD = /^([A-Za-z_]\w*)\s*=\s*/
const WORD_CHAR = /\w/

/** Same idea as `findTypeSlot`, for a Type Mapping's `Name = <expr>` grammar. */
export function findExpressionTypeSlot(value: string, caret: number): TypeSlot | null {
	const lineStart = value.lastIndexOf('\n', caret - 1) + 1
	const nextBreak = value.indexOf('\n', caret)
	const lineEnd = nextBreak === -1 ? value.length : nextBreak
	const line = value.slice(lineStart, lineEnd)

	const head = ALIAS_LINE_HEAD.exec(line)
	if (!head) return null
	const exprStart = head[0].length
	const caretColumn = caret - lineStart
	if (caretColumn < exprStart) return null

	let start = caretColumn
	while (start > exprStart && WORD_CHAR.test(line[start - 1])) start--
	return { start: lineStart + start, query: line.slice(start, caretColumn) }
}

/**
 * Replace exactly the query span (from its start to the CARET, not the
 * grammar's full type-group end) with `name` — anything after the caret,
 * such as a trailing ` = 10`, is left untouched.
 *
 * Runtime acceptance now happens inside CodeMirror (`typeNameCompletion.ts`
 * hands it `from: slot.start, to: caret` and the accepted label, which is the
 * identical replacement); this pure form stays as the tested specification of
 * that semantics.
 */
export function applyAcceptance(value: string, slot: TypeSlot, caret: number, name: string): { value: string; caret: number } {
	const before = value.slice(0, slot.start)
	const after = value.slice(caret)
	return { value: before + name + after, caret: before.length + name.length }
}
