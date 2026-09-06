/**
 * Grammar 2 — Single List, Inline Sigil: side is a per-line marker.
 *
 * Closest to Zach's own sketch — one flat list, not two — at the cost of one
 * new glyph per line. `>` reads as "flows into the block" (an input); `<` as
 * "flows out" (an output), the same arrowheads a cable itself draws:
 *
 *   ---header
 *   > pose: Pose = 10
 *   > random: float = 0.1
 *   ---
 *   > window: int = 5
 *   < result: float
 *   --- error
 *   < message: str
 *
 * This is the one grammar where ROW is genuinely shared without the author
 * having to keep two independent divider counts in step: one stream, one
 * counter, so an input and an output written between the same two dividers
 * really are the same row — exactly what the real model means by "row".
 */
import { HEADER_ROW, type BlockShapeProps } from '../blockModel'
import {
	applyDivider,
	authorableSections,
	DIVIDER_LINE,
	formatPortLine,
	parsePortAttrLine,
	startDividerCounter,
	type DividerCounter,
	type InvalidPortLine,
	type ParsedPortLine,
	type ParsedPortText,
	type PortTextSide,
} from './portTextShared'
import { findTypeSlot, type TypeSlot } from './typeNameAutocompleteLogic'

const SIGIL_LINE = /^([<>])\s?(.*)$/
const SIDE_OF: Record<'>' | '<', PortTextSide> = { '>': 'inputs', '<': 'outputs' }
export const SIGIL_OF: Record<PortTextSide, '>' | '<'> = { inputs: '>', outputs: '<' }

/**
 * A single interleaved walk (unlike the two-lane/keyword grammars' two
 * independent lane walks) — this grammar's whole point is ONE shared
 * row/branch counter, so input and output lines for the same row must be
 * visited together, in row order, with exactly one bare divider between rows
 * regardless of which lane's lines surround it.
 */
export function serializeSigil(props: BlockShapeProps): string {
	const sections = authorableSections(props)
	const lines: string[] = []
	let emittedRow = HEADER_ROW + 1
	if (sections.header.length > 0) {
		lines.push('---header')
		sections.header.forEach((port) => lines.push(`${SIGIL_OF.inputs} ${formatPortLine(port)}`))
		emittedRow = HEADER_ROW
	}
	sections.rows.forEach((rowSection) => {
		const nonEmptyBranches = rowSection.branches.filter((arm) => arm.outputs.length > 0)
		if (rowSection.inputs.length === 0 && nonEmptyBranches.length === 0) return
		while (emittedRow < rowSection.row) { lines.push('---'); emittedRow += 1 }
		rowSection.inputs.forEach((port) => lines.push(`${SIGIL_OF.inputs} ${formatPortLine(port)}`))
		let emittedBranch = 0
		nonEmptyBranches.forEach((arm) => {
			while (emittedBranch < arm.branch) { lines.push(`--- arm ${emittedBranch + 1}`); emittedBranch += 1 }
			arm.outputs.forEach((port) => lines.push(`${SIGIL_OF.outputs} ${formatPortLine(port)}`))
		})
	})
	return lines.join('\n')
}

export function parseSigil(source: string): ParsedPortText {
	const rawLines = source.replace(/\r\n?/g, '\n').split('\n')
	const lines: ParsedPortLine[] = []
	const invalid: InvalidPortLine[] = []
	const counters: Record<PortTextSide, DividerCounter> = {
		inputs: startDividerCounter('inputs'),
		outputs: startDividerCounter('outputs'),
	}

	rawLines.forEach((text, lineNumber) => {
		const trimmed = text.trim()
		if (trimmed === '') return
		const divider = DIVIDER_LINE.exec(trimmed)
		if (divider) {
			const label = divider[1]
			const inputApplied = applyDivider(counters.inputs, label, 'inputs')
			const outputApplied = applyDivider(counters.outputs, label, 'outputs')
			counters.inputs = inputApplied.counter
			counters.outputs = outputApplied.counter
			return
		}
		const sigil = SIGIL_LINE.exec(trimmed)
		if (!sigil) {
			invalid.push({ raw: text, line: lineNumber, reason: 'missing a leading > (input) or < (output)' })
			return
		}
		const side = SIDE_OF[sigil[1] as '>' | '<']
		const attr = parsePortAttrLine(sigil[2])
		if (!attr) {
			invalid.push({ raw: text, line: lineNumber, reason: 'not a name: type line after the sigil' })
			return
		}
		const counter = counters[side]
		lines.push({ side, name: attr.name, type: attr.type, value: attr.value, row: counter.row, branch: counter.branch, raw: text, line: lineNumber })
	})

	return { lines, invalid }
}

export const sigilGrammar = { serialize: serializeSigil, parse: parseSigil }

/** `findTypeSlot`, adjusted for this grammar's one addition: a leading `>`/`<`
 * sigil the plain `name: type` regex was never meant to see. Strips it, reuses
 * the shared slot logic verbatim on the remainder, then shifts the result back. */
export function findSigilTypeSlot(value: string, caret: number): TypeSlot | null {
	const lineStart = value.lastIndexOf('\n', caret - 1) + 1
	const nextBreak = value.indexOf('\n', caret)
	const lineEnd = nextBreak === -1 ? value.length : nextBreak
	const line = value.slice(lineStart, lineEnd)
	const sigilMatch = /^[<>]\s?/.exec(line)
	if (!sigilMatch) return null
	const prefixLength = sigilMatch[0].length
	const caretColumn = caret - lineStart
	if (caretColumn < prefixLength) return null
	const slot = findTypeSlot(line.slice(prefixLength), caretColumn - prefixLength)
	if (!slot) return null
	return { start: lineStart + prefixLength + slot.start, query: slot.query }
}
