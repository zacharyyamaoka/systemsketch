import { describe, expect, it } from 'vitest'

import {
	BLOCK_STATES,
	blockDiffState,
	blockPortStateCounts,
	clearBlockStateProps,
	getDefaultBlockProps,
	hasAnyBlockState,
	isGhostPort,
	portDiffState,
	portStateBefore,
	type BlockPort,
	type BlockShapeProps,
} from '../blocks/blockModel'
import {
	DEFAULT_DIFF_BLEND,
	DEFAULT_DIFF_VARIANT,
	DIFF_VARIANTS,
	cableMarkKind,
	clampDiffBlend,
	diffBlendOpacity,
	diffVariantTraits,
	rewiredTerminals,
	describeDiffCounts,
	diffCableDashArray,
	diffCableInk,
	diffCableOpacity,
	diffGutterGlyph,
	isDiffVariant,
	readDiffPresentation,
} from './diffPresentation'
import { diagnosticSeverityState } from '../diagnostics/diagnosticsModel'

function port(overrides: Partial<BlockPort> = {}): BlockPort {
	return { id: 'in_1', name: 'frame', type: 'Frame', visible: true, ...overrides }
}

function props(overrides: Partial<BlockShapeProps> = {}): BlockShapeProps {
	return { ...getDefaultBlockProps(), ...overrides }
}

describe('the state vocabulary', () => {
	it('reads normal from a Block and a port that never heard of it', () => {
		expect(blockDiffState(props())).toBe('normal')
		expect(portDiffState(port())).toBe('normal')
		expect(portStateBefore(port())).toBe('')
		expect(isGhostPort(port())).toBe(false)
	})

	it('is one enum, and the linter maps onto it rather than inventing a second', () => {
		expect(BLOCK_STATES).toContain('error')
		expect(BLOCK_STATES).toContain('warning')
		expect(diagnosticSeverityState('error')).toBe('error')
		expect(diagnosticSeverityState('warning')).toBe('warning')
		// A note is not a mark: painting every info finding is how a diff view
		// loses the ability to show a calm board.
		expect(diagnosticSeverityState('info')).toBe('normal')
	})

	it('counts a Block at port altitude, never at record altitude', () => {
		const counted = props({
			inputs: [port({ id: 'in_1', state: 'removed' }), port({ id: 'in_2', state: 'changed' })],
			outputs: [port({ id: 'out_1', state: 'added' }), port({ id: 'out_2' })],
		})
		expect(blockPortStateCounts(counted)).toEqual({
			added: 1, removed: 1, changed: 1, error: 0, warning: 0,
		})
		expect(describeDiffCounts(blockPortStateCounts(counted)))
			.toBe('1 added · 1 missing · 1 changed')
	})

	it('says nothing at all about a board with no lens on it', () => {
		expect(hasAnyBlockState(props())).toBe(false)
		expect(describeDiffCounts({ added: 0, removed: 0, changed: 0 })).toBe('')
	})
})

describe('clearing the lens', () => {
	it('returns the very same props object when there was no lens', () => {
		const clean = props()
		expect(clearBlockStateProps(clean)).toBe(clean)
	})

	it('drops the ghost rows and returns every surviving row to normal', () => {
		const marked = props({
			state: 'changed',
			inputs: [
				port({ id: 'in_1', state: 'changed', stateBefore: 'callee' }),
				port({ id: 'in_ghost', name: 'seed', state: 'removed' }),
			],
			outputs: [port({ id: 'out_1', state: 'added' })],
		})
		const cleared = clearBlockStateProps(marked)
		expect(cleared.state).toBe('normal')
		expect(cleared.inputs.map((entry) => entry.id)).toEqual(['in_1'])
		expect(cleared.inputs[0].state).toBeUndefined()
		// A rename's provenance goes with the lens; the row keeps its real name.
		expect(cleared.inputs[0].stateBefore).toBeUndefined()
		expect(cleared.inputs[0].name).toBe('frame')
		expect(cleared.outputs[0].state).toBeUndefined()
		expect(hasAnyBlockState(cleared)).toBe(false)
	})
})

describe('the paint variants', () => {
	it('ships six, and the default is the one built on the before/after pairs', () => {
		expect(DIFF_VARIANTS).toHaveLength(6)
		expect(DEFAULT_DIFF_VARIANT).toBe('was-now')
		expect(DIFF_VARIANTS).toContain(DEFAULT_DIFF_VARIANT)
		expect(isDiffVariant('was-now')).toBe(true)
		expect(isDiffVariant('stacked')).toBe(true)
		// Round 1's pick is gone rather than demoted. A stored preference that
		// still names it falls back to the default rather than painting nothing.
		expect(isDiffVariant('diff-gutter')).toBe(false)
		expect(readDiffPresentation({ getItem: () => '{"variant":"diff-gutter"}' }).variant)
			.toBe(DEFAULT_DIFF_VARIANT)
		expect(isDiffVariant('nope')).toBe(false)
	})

	it('gives every variant an answer to all three questions', () => {
		for (const variant of DIFF_VARIANTS) {
			const traits = diffVariantTraits(variant)
			expect(['chips', 'stacked', 'tokens', 'badge']).toContain(traits.text)
			expect(['ghost', 'badge', 'none']).toContain(traits.pose)
			expect(['chip', 'line', 'endpoints']).toContain(traits.cable)
		}
		// Exactly one is the monochrome answer; more than one would mean the set
		// is spending two of its six slots on the same accessibility question.
		expect(DIFF_VARIANTS.filter((v) => diffVariantTraits(v).monochrome)).toEqual(['ghost-weight'])
	})

	it('scrubs the blend between the before board and the after board', () => {
		// The two ends are the two boards; nothing present on both sides moves.
		expect(diffBlendOpacity('removed', 0)).toBe(1)
		expect(diffBlendOpacity('added', 0)).toBe(0)
		expect(diffBlendOpacity('removed', 1)).toBe(0)
		expect(diffBlendOpacity('added', 1)).toBe(1)
		expect(diffBlendOpacity('changed', 0.5)).toBeUndefined()
		// Storage is never trusted: a scrub out of range or missing is clamped.
		expect(clampDiffBlend(-3)).toBe(0)
		expect(clampDiffBlend(9)).toBe(1)
		expect(clampDiffBlend('half')).toBe(DEFAULT_DIFF_BLEND)
		expect(readDiffPresentation({ getItem: () => '{"blend":0.25}' }).blend).toBe(0.25)
	})

	it('falls back to the default rather than trusting stored junk', () => {
		expect(readDiffPresentation({ getItem: () => 'not json' }).variant).toBe(DEFAULT_DIFF_VARIANT)
		expect(readDiffPresentation({ getItem: () => '{"variant":"nope"}' }).variant)
			.toBe(DEFAULT_DIFF_VARIANT)
		expect(readDiffPresentation({ getItem: () => '{"variant":"ghost-weight"}' }).variant)
			.toBe('ghost-weight')
	})

	it('never lets colour be the only channel', () => {
		// Every state has a glyph, and a ghost is dashed and set back, so the
		// vocabulary survives a colour-blind reader and a monochrome print.
		expect(diffGutterGlyph('added')).toBe('+')
		expect(diffGutterGlyph('removed')).toBe('−')
		expect(diffGutterGlyph('changed')).toBe('~')
		expect(diffGutterGlyph('normal')).toBe('')
		expect(diffCableDashArray('removed')).toBeTruthy()
		expect(diffCableDashArray('added')).toBeUndefined()
		expect(diffCableOpacity('removed')).toBeLessThan(1)
		expect(diffCableOpacity('added')).toBe(1)
	})

	it('leaves an unstated cable exactly the ink it already had', () => {
		expect(diffCableInk('normal', 'was-now', 'var(--tl-color-text-3)'))
			.toBe('var(--tl-color-text-3)')
		expect(diffCableInk('added', 'was-now', 'x')).toBe('var(--ss-success)')
		expect(diffCableInk('removed', 'was-now', 'x')).toBe('var(--ss-danger)')
		// The monochrome variant answers the same vocabulary in greys.
		expect(diffCableInk('added', 'ghost-weight', 'x')).toBe('var(--ss-text)')
		expect(diffCableInk('removed', 'ghost-weight', 'x')).toBe('var(--ss-text-faint)')
	})

	it('tells the four cable findings apart, which is what round 1 could not', () => {
		expect(cableMarkKind('added', undefined)).toBe('added')
		expect(cableMarkKind('removed', undefined)).toBe('removed')
		expect(cableMarkKind('changed', [{ path: 'delayValue' }])).toBe('modified')
		// A terminal that moved is still a present, `changed` cable — the state
		// enum alone can never reach `rewired`, which is why the pair rides in
		// `fieldDiffs` and why the endpoint path outranks the label path.
		expect(cableMarkKind('changed', [{ path: 'end' }])).toBe('rewired')
		expect(cableMarkKind('changed', [{ path: 'delayValue' }, { path: 'start' }])).toBe('rewired')
		// A SEGMENT match, not a leaf match: the natural spelling of a terminal's
		// field ends in `portId`, the one segment that says nothing about which
		// end moved, and leaf-matching quietly demoted every rewire to modified.
		expect(rewiredTerminals([{ path: 'props.bindings.end.portId' }])).toEqual(['end'])
		expect(cableMarkKind('changed', [{ path: 'props.bindings.end.portId' }])).toBe('rewired')
		expect(rewiredTerminals([{ path: 'delayValue' }])).toEqual([])
		expect(cableMarkKind('normal', undefined)).toBe('none')
	})

	it('does not recolour a cable whose only change is its label', () => {
		// A modified cable has not changed course. Painting its whole run would
		// make a renamed delay indistinguishable from a rewire at any distance
		// where the midpoint chip is unreadable.
		expect(diffCableInk('changed', 'was-now', 'NORMAL', 'modified')).toBe('NORMAL')
		expect(diffCableInk('changed', 'was-now', 'NORMAL', 'rewired')).toBe('var(--ss-warning)')
		// …unless the variant deliberately gave up its chip.
		expect(diffCableInk('changed', 'token-only', 'NORMAL', 'modified')).toBe('var(--ss-warning)')
	})
})
