import { describe, expect, it } from 'vitest'
import type { TLRecord } from 'tldraw'

import { assertStockPrimitives, stockPrimitiveProblems } from './stockTldrawPrimitives'

const records = (items: unknown[]) => items as TLRecord[]

describe('stock .tldr primitive boundary', () => {
	it('accepts only default shape and binding kinds plus structural groups', () => {
		const stock = records([
			{ id: 'shape:arrow', typeName: 'shape', type: 'arrow', props: {} },
			{ id: 'shape:group', typeName: 'shape', type: 'group', props: {} },
			{ id: 'shape:oval', typeName: 'shape', type: 'geo', props: { geo: 'oval' } },
			{ id: 'binding:arrow', typeName: 'binding', type: 'arrow', fromId: 'shape:arrow', toId: 'shape:oval', props: {} },
		])
		expect(stockPrimitiveProblems(stock)).toEqual([])
		expect(() => assertStockPrimitives(stock)).not.toThrow()
	})

	it('rejects SystemSketch custom shapes, bindings, geometries, and comments', () => {
		const problems = stockPrimitiveProblems(records([
			{ id: 'shape:block', typeName: 'shape', type: 'block', props: {} },
			{ id: 'shape:rounded', typeName: 'shape', type: 'geo', props: { geo: 'systemsketch-rounded-rect' } },
			{ id: 'binding:connection', typeName: 'binding', type: 'connection', props: {} },
			{ id: 'comment:thread', typeName: 'comment-thread' },
		]))
		expect(problems.map((problem) => problem.reason)).toEqual([
			'custom shape type block',
			'custom geo systemsketch-rounded-rect',
			'custom binding type connection',
			'SystemSketch comment record comment-thread',
		])
	})
})
