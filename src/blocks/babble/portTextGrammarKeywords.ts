/**
 * Grammar 3 — Section Keywords: side is a reserved keyword line.
 *
 * Leans into the literal reading of Zach's own sketch — `data_in:` reads like
 * a keyword announcing a section, not a port named "data_in" with no type —
 * by making that pattern real: `inputs:` / `outputs:` (case-insensitive, the
 * only thing on their line) switch which lane subsequent port lines belong
 * to. Absent, the document starts as `inputs:` implicitly, so a short,
 * inputs-only Block never has to write the keyword at all.
 *
 *   inputs:
 *   pose: Pose = 10
 *   ---
 *   window: int = 5
 *   outputs:
 *   result: float
 *   --- error
 *   message: str
 *
 * ONE row/branch counter runs across the WHOLE document regardless of how
 * many times the keyword toggles lane — `outputs:` … `inputs:` … `outputs:`
 * again is legal and keeps counting rows forward, unlike the two-lane
 * grammar's independent per-half counters. This is also the strict variant:
 * a named divider opened while the active lane is `inputs` is flagged (not
 * merely tolerated), and a default value outside the restricted
 * literal/call subset is flagged too — both stay in the text and in
 * `defaultValue` regardless, per axis #4's "visibly flagged" reading.
 */
import type { BlockShapeProps } from '../blockModel'
import {
	applyDivider,
	DIVIDER_LINE,
	formatPortLine,
	isRestrictedDefaultExpr,
	parsePortAttrLine,
	startDividerCounter,
	walkInputRows,
	walkOutputRows,
	type InvalidPortLine,
	type ParsedPortLine,
	type ParsedPortText,
	type PortTextSide,
} from './portTextShared'

const KEYWORD_LINE = /^(inputs|outputs)\s*:\s*$/i

export function serializeKeywords(props: BlockShapeProps): string {
	const lines: string[] = ['inputs:']
	walkInputRows(props, {
		header: () => lines.push('---header'),
		row: () => lines.push('---'),
		port: (port) => lines.push(formatPortLine(port)),
	})

	lines.push('outputs:')
	walkOutputRows(props, {
		row: () => lines.push('---'),
		branch: (target) => lines.push(`--- arm ${target}`),
		port: (port) => lines.push(formatPortLine(port)),
	})
	return lines.join('\n')
}

export function parseKeywords(source: string): ParsedPortText {
	const rawLines = source.replace(/\r\n?/g, '\n').split('\n')
	const lines: ParsedPortLine[] = []
	const invalid: InvalidPortLine[] = []
	let side: PortTextSide = 'inputs'
	let counter = startDividerCounter('inputs')

	rawLines.forEach((text, lineNumber) => {
		const trimmed = text.trim()
		if (trimmed === '') return
		const keyword = KEYWORD_LINE.exec(trimmed)
		if (keyword) {
			side = keyword[1].toLowerCase() as PortTextSide
			return
		}
		const divider = DIVIDER_LINE.exec(trimmed)
		if (divider) {
			const applied = applyDivider(counter, divider[1], side)
			counter = applied.counter
			if (applied.inertBranchLabel) {
				invalid.push({ raw: text, line: lineNumber, reason: 'a named divider opens a branch, and inputs cannot branch — kept as a plain heading' })
			}
			return
		}
		const attr = parsePortAttrLine(trimmed)
		if (!attr) {
			invalid.push({ raw: text, line: lineNumber, reason: 'not "inputs:", "outputs:", a divider, or a name: type line' })
			return
		}
		const invalidDefault = attr.value !== '' && !isRestrictedDefaultExpr(attr.value)
		lines.push({
			side, name: attr.name, type: attr.type, value: attr.value,
			row: counter.row, branch: counter.branch, raw: text, line: lineNumber,
			...(invalidDefault ? { invalidDefault: true } : {}),
		})
	})

	return { lines, invalid }
}

export const keywordsGrammar = { serialize: serializeKeywords, parse: parseKeywords }
