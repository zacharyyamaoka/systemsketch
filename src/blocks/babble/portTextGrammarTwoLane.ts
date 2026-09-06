/**
 * Grammar 1 — Two Lanes: side is which HALF of the document you are in.
 *
 * This is the most literal, least risky reading of the sketch, and mirrors
 * the shipped `BlockInspector`'s own two independently-scrolling Inputs and
 * Outputs sections exactly — no new "which side is this line" idea for a
 * reader to learn. A fixed sentinel line, unmistakable from the row/branch
 * `---` divider, splits the document in two:
 *
 *   pose: Pose = 10
 *   ---
 *   window: int = 5
 *   === outputs ===
 *   result: float
 *   --- error
 *   message: str
 *
 * Used by V1 (toggle UI/Source) and V4 (always-live hybrid) — the two
 * variants that differ on INTERACTION MODEL, not grammar.
 */
import type { BlockShapeProps } from '../blockModel'
import {
	applyDivider,
	DIVIDER_LINE,
	formatPortLine,
	parsePortAttrLine,
	startDividerCounter,
	walkInputRows,
	walkOutputRows,
	type InvalidPortLine,
	type ParsedPortLine,
	type ParsedPortText,
} from './portTextShared'

const LANE_MARKER = /^={3,}\s*outputs\s*={0,}$/i

export function serializeTwoLane(props: BlockShapeProps): string {
	const inputLines: string[] = []
	walkInputRows(props, {
		header: () => inputLines.push('---header'),
		row: () => inputLines.push('---'),
		port: (port) => inputLines.push(formatPortLine(port)),
	})

	const outputLines: string[] = []
	walkOutputRows(props, {
		row: () => outputLines.push('---'),
		branch: (target) => outputLines.push(`--- arm ${target}`),
		port: (port) => outputLines.push(formatPortLine(port)),
	})

	return [...inputLines, '', '=== outputs ===', ...outputLines].join('\n')
}

export function parseTwoLane(source: string): ParsedPortText {
	const rawLines = source.replace(/\r\n?/g, '\n').split('\n')
	const markerIndex = rawLines.findIndex((raw) => LANE_MARKER.test(raw.trim()))
	const inputRaw = markerIndex === -1 ? rawLines : rawLines.slice(0, markerIndex)
	const outputRaw = markerIndex === -1 ? [] : rawLines.slice(markerIndex + 1)

	const lines: ParsedPortLine[] = []
	const invalid: InvalidPortLine[] = []

	const parseLane = (raw: string[], side: 'inputs' | 'outputs', offset: number) => {
		let counter = startDividerCounter(side)
		raw.forEach((text, index) => {
			const trimmed = text.trim()
			const lineNumber = offset + index
			if (trimmed === '') return
			const divider = DIVIDER_LINE.exec(trimmed)
			if (divider) {
				const applied = applyDivider(counter, divider[1], side)
				counter = applied.counter
				return
			}
			const attr = parsePortAttrLine(trimmed)
			if (!attr) {
				invalid.push({ raw: text, line: lineNumber, reason: 'not a divider or a name: type line' })
				return
			}
			lines.push({ side, name: attr.name, type: attr.type, value: attr.value, row: counter.row, branch: counter.branch, raw: text, line: lineNumber })
		})
	}

	parseLane(inputRaw, 'inputs', 0)
	parseLane(outputRaw, 'outputs', markerIndex + 1)
	return { lines, invalid }
}

export const twoLaneGrammar = { serialize: serializeTwoLane, parse: parseTwoLane }
