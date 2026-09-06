import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, portBranch, portInHeader, portRow, type BlockPort, type BlockShapeProps } from '../blockModel'
import { keywordsGrammar } from './portTextGrammarKeywords'
import { findSigilTypeSlot, sigilGrammar } from './portTextGrammarSigil'
import { twoLaneGrammar } from './portTextGrammarTwoLane'
import { applyParsedPortText, reconcilePortLane, type ParsedPortLine } from './portTextShared'

function port(overrides: Partial<BlockPort> & Pick<BlockPort, 'id' | 'name'>): BlockPort {
	return { type: '', visible: true, ...overrides }
}

function propsWith(inputs: BlockPort[], outputs: BlockPort[]): BlockShapeProps {
	return { ...getDefaultBlockProps(), inputs, outputs }
}

const GRAMMARS = [
	['two-lane', twoLaneGrammar],
	['sigil', sigilGrammar],
	['keywords', keywordsGrammar],
] as const

describe('port-text grammars: round trip', () => {
	for (const [label, grammar] of GRAMMARS) {
		it(`${label}: serialize -> parse -> applyParsedPortText reconstructs the same ports`, () => {
			const props = propsWith(
				[
					// Explicit row:0 — header is opt-in, never the default (see
					// `portRow`), so this is the one input actually lifted into it.
					port({ id: 'in_1', name: 'pose', type: 'Pose', defaultValue: '10', row: 0 }),
					port({ id: 'in_2', name: 'window', type: 'int' }), // default row (1)
				],
				[
					port({ id: 'out_1', name: 'result', type: 'float' }), // default row (1), arm 0
					port({ id: 'out_2', name: 'message', type: 'str', branch: 1 }),
				],
			)
			const source = grammar.serialize(props)
			const parsed = grammar.parse(source)
			expect(parsed.invalid).toEqual([])
			const nextProps = applyParsedPortText(props, parsed)
			const pose = nextProps.inputs.find((p) => p.name === 'pose')!
			const window = nextProps.inputs.find((p) => p.name === 'window')!
			const result = nextProps.outputs.find((p) => p.name === 'result')!
			const message = nextProps.outputs.find((p) => p.name === 'message')!
			expect([pose.id, pose.type, pose.defaultValue, portInHeader(pose)]).toEqual(['in_1', 'Pose', '10', true])
			expect([window.id, window.type, portRow(window)]).toEqual(['in_2', 'int', portRow(window)])
			expect(portInHeader(window)).toBe(false)
			expect([result.id, result.type, portBranch(result)]).toEqual(['out_1', 'float', 0])
			expect([message.id, message.type, portBranch(message)]).toEqual(['out_2', 'str', 1])
			expect(portRow(result)).toBe(portRow(message))
		})
	}

	it('sigil: an input and an output written between the same two dividers share one row', () => {
		const source = '> pose: Pose\n---\n> window: int\n< result: float'
		const parsed = sigilGrammar.parse(source)
		expect(parsed.invalid).toEqual([])
		const pose = parsed.lines.find((line) => line.name === 'pose')
		const window = parsed.lines.find((line) => line.name === 'window')
		const result = parsed.lines.find((line) => line.name === 'result')
		expect(window?.row).toBe(result?.row)
		expect(window?.row).toBe((pose?.row ?? 0) + 1)
	})

	it('two-lane: independent per-lane counters do not force alignment — a real, honest limitation', () => {
		// The input lane sees one divider before `window`; the output lane sees
		// none before `result`. Nothing keeps the two counts in step.
		const source = 'pose: Pose\n---\nwindow: int\n=== outputs ===\nresult: float'
		const parsed = twoLaneGrammar.parse(source)
		const pose = parsed.lines.find((line) => line.name === 'pose')
		const window = parsed.lines.find((line) => line.name === 'window')
		const result = parsed.lines.find((line) => line.name === 'result')
		expect(window?.row).toBe((pose?.row ?? 0) + 1)
		expect(result?.row).toBe(pose?.row) // drifted: same nominal row as `pose`, not as `window`
	})

	it('a named divider on the input lane is inert on the counter but not silently invisible in the keywords grammar', () => {
		const source = 'inputs:\npose: Pose\n--- section heading\nwindow: int'
		const parsed = keywordsGrammar.parse(source)
		const pose = parsed.lines.find((line) => line.name === 'pose')
		const window = parsed.lines.find((line) => line.name === 'window')
		expect(pose?.row).toBe(window?.row) // the label did not advance the row
		expect(parsed.invalid.some((entry) => entry.reason.includes('cannot branch'))).toBe(true)
	})

	it('keywords: repeated inputs:/outputs: toggling shares one row counter across the whole document', () => {
		const source = 'inputs:\npose: Pose\noutputs:\nresult: float\n---\ninputs:\nwindow: int\noutputs:\nmessage: str'
		const parsed = keywordsGrammar.parse(source)
		const byName = new Map(parsed.lines.map((line) => [line.name, line]))
		// No divider before `pose`/`result` — same ambient row. One bare divider
		// advances the SHARED counter once, regardless of which lane's lines
		// surround it, so `window`/`message` land one row later.
		expect(byName.get('pose')?.row).toBe(byName.get('result')?.row)
		expect(byName.get('window')?.row).toBe((byName.get('pose')?.row ?? 0) + 1)
		expect(byName.get('message')?.row).toBe(byName.get('window')?.row)
	})

	it('keywords: an out-of-subset default is kept verbatim and flagged, never dropped', () => {
		const source = 'inputs:\nrandom: MyComponent = Component(var=0.1, extra=Nested(1))'
		const parsed = keywordsGrammar.parse(source)
		expect(parsed.lines[0].value).toBe('Component(var=0.1, extra=Nested(1))')
		expect(parsed.lines[0].invalidDefault).toBe(true)
	})

	it('keywords: the exact literal/call shapes from the sketch are accepted, not flagged', () => {
		const source = 'inputs:\na: int = 10\nb: float = 0.1\nc: MyComponent = Component(var=0.1)'
		const parsed = keywordsGrammar.parse(source)
		expect(parsed.lines.every((line) => !line.invalidDefault)).toBe(true)
	})

	it('sigil: findSigilTypeSlot resolves the type slot past the leading sigil', () => {
		const value = '> pose: Po'
		const slot = findSigilTypeSlot(value, value.length)
		expect(slot).toEqual({ start: 8, query: 'Po' })
	})
})

describe('reconcilePortLane', () => {
	it('preserves id and extra fields for an unrenamed port', () => {
		const existing = [port({ id: 'in_1', name: 'pose', type: 'Pose', mutates: true })]
		const lines: ParsedPortLine[] = [{ side: 'inputs', name: 'pose', type: 'Pose2', value: '', row: 0, branch: 0, raw: '', line: 0 }]
		const result = reconcilePortLane(existing, lines, 'inputs')
		// row:0 is the explicit header placement this line asked for — distinct
		// from the default (absent-means-first-body-row), so it is stored.
		expect(result).toEqual([port({ id: 'in_1', name: 'pose', type: 'Pose2', mutates: true, row: 0 })])
	})

	it('a pure retype (same position, new name) keeps the old id — the rename case', () => {
		const existing = [port({ id: 'in_1', name: 'pose', type: 'Pose' })]
		const lines: ParsedPortLine[] = [{ side: 'inputs', name: 'transform', type: 'Pose', value: '', row: 0, branch: 0, raw: '', line: 0 }]
		const result = reconcilePortLane(existing, lines, 'inputs')
		expect(result[0].id).toBe('in_1')
		expect(result[0].name).toBe('transform')
	})

	it('a deleted line drops its port entirely', () => {
		const existing = [
			port({ id: 'in_1', name: 'pose', type: 'Pose' }),
			port({ id: 'in_2', name: 'window', type: 'int' }),
		]
		const lines: ParsedPortLine[] = [{ side: 'inputs', name: 'pose', type: 'Pose', value: '', row: 0, branch: 0, raw: '', line: 0 }]
		const result = reconcilePortLane(existing, lines, 'inputs')
		expect(result).toHaveLength(1)
		expect(result[0].id).toBe('in_1')
	})

	it('a genuinely new line gets a fresh id in the existing in_N/out_N numbering', () => {
		const existing = [port({ id: 'in_3', name: 'pose', type: 'Pose' })]
		const lines: ParsedPortLine[] = [
			{ side: 'inputs', name: 'pose', type: 'Pose', value: '', row: 0, branch: 0, raw: '', line: 0 },
			{ side: 'inputs', name: 'window', type: 'int', value: '', row: 0, branch: 0, raw: '', line: 1 },
		]
		const result = reconcilePortLane(existing, lines, 'inputs')
		expect(result[1].id).toBe('in_4')
	})
})
