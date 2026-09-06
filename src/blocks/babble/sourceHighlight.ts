/**
 * Pure span computation for the CodeMirror-backed Source editor.
 *
 * `AttributeSpans` / `AliasSpans` render the READ view as React elements; the
 * Source view is now a real CodeMirror document, whose highlighting is a set
 * of class-marked ranges, not children. These helpers produce those ranges
 * with the SAME class vocabulary and the SAME resolution judgement, so the
 * two surfaces can never disagree about whether `Pose` is recognised.
 *
 * All offsets are line-relative, against the raw (untrimmed) line text.
 */
import type { FlatAttribute, TypeResolution } from './typeBabbleShared'
import type { TokenResolution, TypeAlias } from './typeMappingShared'
import { tokenizeTypeExpr } from './typeMappingShared'

export interface SourceSpan {
	from: number
	to: number
	className: string
}

function push(spans: SourceSpan[], from: number, to: number, className: string): void {
	if (to > from) spans.push({ from, to, className })
}

/** The flat `name: Type = value` grammar's spans for one raw line. */
export function attributeLineSpans(
	attribute: Pick<FlatAttribute, 'name' | 'type' | 'value' | 'raw'>,
	resolve: (typeName: string) => TypeResolution,
): SourceSpan[] {
	const spans: SourceSpan[] = []
	const raw = attribute.raw
	if (!attribute.type) {
		push(spans, 0, raw.length, 'TypeBabble-raw')
		return spans
	}
	const nameStart = raw.indexOf(attribute.name)
	if (nameStart === -1) return spans
	const nameEnd = nameStart + attribute.name.length
	push(spans, nameStart, nameEnd, 'TypeBabble-name')

	const typeStart = raw.indexOf(attribute.type, nameEnd)
	if (typeStart === -1) return spans
	const typeEnd = typeStart + attribute.type.length
	push(spans, nameEnd, typeStart, 'TypeBabble-punct')
	push(spans, typeStart, typeEnd, `TypeBabble-type TypeBabble-type--${resolve(attribute.type)}`)

	if (attribute.value) {
		const valueStart = raw.indexOf(attribute.value, typeEnd)
		if (valueStart === -1) return spans
		push(spans, typeEnd, valueStart, 'TypeBabble-punct')
		push(spans, valueStart, valueStart + attribute.value.length, 'TypeBabble-value')
	}
	return spans
}

/** The `Name = <type expression>` alias grammar's spans for one raw line. */
export function aliasLineSpans(
	alias: Pick<TypeAlias, 'name' | 'expr' | 'raw'>,
	resolve: (typeName: string) => TokenResolution,
): SourceSpan[] {
	const spans: SourceSpan[] = []
	const raw = alias.raw
	if (!alias.expr) {
		push(spans, 0, raw.length, 'TypeMapping-raw')
		return spans
	}
	const nameStart = raw.indexOf(alias.name)
	if (nameStart === -1) return spans
	const nameEnd = nameStart + alias.name.length
	push(spans, nameStart, nameEnd, 'TypeMapping-name')

	const exprStart = raw.indexOf(alias.expr, nameEnd)
	if (exprStart === -1) return spans
	push(spans, nameEnd, exprStart, 'TypeMapping-punct')

	let cursor = exprStart
	for (const token of tokenizeTypeExpr(alias.expr)) {
		const tokenEnd = cursor + token.text.length
		if (token.kind === 'identifier') {
			push(spans, cursor, tokenEnd, `TypeMapping-token TypeMapping-token--${resolve(token.text)}`)
		} else {
			push(spans, cursor, tokenEnd, 'TypeMapping-punct')
		}
		cursor = tokenEnd
	}
	return spans
}
