import { describe, expect, it } from 'vitest'

import { sameConnectionInspectorContext, type ConnectionInspectorContext } from './ConnectionInspector'

const context = (source: string): ConnectionInspectorContext => ({
	count: 1, routing: undefined, temporal: undefined, endpoints: { from: 'emit.tick', to: 'Branch.when' },
	authored: false, only: null, tunnelEnabled: false, tunnelLayer: '', tunnelLayers: [],
	semantic: {
		effective: { role: 'event', origin: 'derived', claim: { role: 'event', source, analyzer: 'python' } },
		source: { role: 'event', origin: 'derived', claim: { role: 'event', source, analyzer: 'python' } },
		sink: { role: 'control', origin: 'derived', claim: { role: 'control', source: 'Branch control band' } },
		halfBound: false, malformed: false, conflict: true, label: 'Event → Control', warning: 'Semantic-role mismatch',
	},
})

describe('Connection inspector context equality', () => {
	it('refreshes when provenance changes even though the rendered role words do not', () => {
		expect(sameConnectionInspectorContext(context('first analyser'), context('second analyser'))).toBe(false)
		expect(sameConnectionInspectorContext(context('first analyser'), context('first analyser'))).toBe(true)
	})
})
