import { T } from 'tldraw'
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
	toJsonSafe,
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

/**
 * The crash this guards against: a Block prop declared `T.number.optional()`
 * accepts a key that is *present* and `undefined` — which is how the definition
 * linker clears a draft ordinal, because tldraw's update merge has no "delete
 * this key" — while a shape's `meta` is validated by `T.jsonValue`, which
 * rejects `undefined` anywhere in the tree. Copying props into meta crosses
 * exactly that line. The oracle below is tldraw's own validator.
 */
describe('meta is JSON, even when props are not', () => {
	it('drops a present-but-undefined key rather than carrying it', () => {
		expect(toJsonSafe({ a: 1, b: undefined })).toEqual({ a: 1 })
		expect(Object.keys(toJsonSafe({ a: 1, b: undefined }))).toEqual(['a'])
	})

	it('keeps every value that is legitimately falsy', () => {
		const kept = { zero: 0, empty: '', no: false, nothing: null, list: [] as unknown[] }
		expect(toJsonSafe(kept)).toEqual(kept)
	})

	it('keeps an array position by writing null into its holes', () => {
		expect(toJsonSafe([1, undefined, 3])).toEqual([1, null, 3])
	})

	it('reaches all the way down', () => {
		expect(toJsonSafe({ a: { b: [{ c: undefined, d: 2 }] } })).toEqual({ a: { b: [{ d: 2 }] } })
	})

	it('makes a Block record with a cleared optional prop legal as meta', () => {
		const cleared = { ...props, draftOrdinal: undefined, notes: undefined }
		expect('draftOrdinal' in cleared).toBe(true)
		expect(() => T.jsonValue.validate({ systemSketch: { kind: 'block', version: 1, props: cleared } }))
			.toThrow(/json serializable/)

		const meta = detachMeta({ kind: 'block', version: DETACH_FORMAT_VERSION, props: cleared })
		expect(() => T.jsonValue.validate(meta)).not.toThrow()
		expect(readDetachedBlock(meta)?.props.title).toBe('decode')
		expect('draftOrdinal' in (readDetachedBlock(meta)?.props ?? {})).toBe(false)
	})

	it('is idempotent', () => {
		const once = toJsonSafe({ a: 1, b: undefined, c: [undefined] })
		expect(toJsonSafe(once)).toEqual(once)
	})
})
