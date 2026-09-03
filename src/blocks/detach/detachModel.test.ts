import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps } from '../blockModel'
import {
	DETACH_FORMAT_VERSION,
	SYSTEMSKETCH_META_KEY,
	detachMeta,
	isDetachedCard,
	readDetachedBlock,
	readDetachedConnection,
	readDetachedRecord,
} from './detachModel'

const props = { ...getDefaultBlockProps(), title: 'decode', blockType: 'transform' }

describe('what a detached group remembers', () => {
	it('round-trips a Block record through the meta bag', () => {
		const meta = detachMeta({ kind: 'block', version: DETACH_FORMAT_VERSION, props })
		const read = readDetachedBlock(meta)
		expect(read?.props.title).toBe('decode')
		expect(read?.props.blockType).toBe('transform')
		expect(read?.props.views).toEqual(props.views)
	})

	it('round-trips a cable, keeping which end held which terminal', () => {
		const meta = detachMeta({
			kind: 'connection',
			version: DETACH_FORMAT_VERSION,
			routing: 'elbow',
			temporal: 'delayed',
			delayValue: '11',
			pillPosition: 0.65,
			rebuildWithBlocks: true,
			ends: {
				start: { portId: 'out_1', face: 'outer' },
				end: { portId: 'in_1', face: 'inner' },
			},
		})
		const read = readDetachedConnection(meta)
		expect(read?.routing).toBe('elbow')
		expect(read?.temporal).toBe('delayed')
		expect(read?.delayValue).toBe('11')
		expect(read?.pillPosition).toBe(0.65)
		expect(read?.rebuildWithBlocks).toBe(true)
		expect(read?.ends.start).toEqual({ portId: 'out_1', face: 'outer' })
		expect(read?.ends.end).toEqual({ portId: 'in_1', face: 'inner' })
	})

	it('marks the card, so a rebuild finds the anchor without storing an id', () => {
		expect(isDetachedCard(detachMeta({ kind: 'block-card', version: 1 }))).toBe(true)
		expect(isDetachedCard(detachMeta({ kind: 'block', version: 1, props }))).toBe(false)
	})

	it('declines a record from a newer SystemSketch rather than guessing', () => {
		const future = { [SYSTEMSKETCH_META_KEY]: { kind: 'block', version: DETACH_FORMAT_VERSION + 1, props } }
		expect(readDetachedRecord(future)).toBe(null)
	})

	it('is silent about meta that is not ours, and about shapes with none', () => {
		expect(readDetachedRecord({ someOtherTool: { kind: 'block' } })).toBe(null)
		expect(readDetachedRecord({})).toBe(null)
		expect(readDetachedRecord(undefined)).toBe(null)
		expect(readDetachedRecord('not an object')).toBe(null)
	})

	it('drops a malformed end rather than rebinding a cable to a guess', () => {
		const meta = {
			[SYSTEMSKETCH_META_KEY]: {
				kind: 'connection',
				version: 1,
				routing: 'curved',
				ends: { start: { portId: 'out_1', face: 'sideways' }, end: { portId: 'in_1', face: 'outer' } },
			},
		}
		const read = readDetachedConnection(meta)
		expect(read?.ends.start).toBeUndefined()
		expect(read?.ends.end).toEqual({ portId: 'in_1', face: 'outer' })
	})
})
