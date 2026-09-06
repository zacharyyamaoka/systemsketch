import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { btLeafIcon } from './behaviorTreeModel'
import { BtNodeIcon, btSubjectIconName, btSubjectIsControl } from './btNodeIcons'

describe('BtNodeIcon', () => {
	it('draws leaves through the SAME function the projection uses', () => {
		// The point of the module: a projected Block and its library row cannot
		// disagree, because both ask `btLeafIcon`.
		expect(btSubjectIconName({ id: 'MoveTo', kind: 'action' })).toBe(btLeafIcon({ kind: 'action' }))
		expect(btSubjectIconName({ id: 'IsAt', kind: 'condition' })).toBe(btLeafIcon({ kind: 'condition' }))
		expect(btSubjectIconName({ id: 'Sub', kind: 'subtree' })).toBe(btLeafIcon({ kind: 'subtree' }))
		expect(btSubjectIconName({ id: 'Sequence', kind: 'control', controlKind: 'sequence' })).toBe('')
	})

	it('renders a lucide Block icon for an action and a condition', () => {
		const action = renderToStaticMarkup(<BtNodeIcon subject={{ id: 'MoveTo', kind: 'action' }} />)
		const condition = renderToStaticMarkup(<BtNodeIcon subject={{ id: 'IsAt', kind: 'condition' }} />)
		expect(action).toContain('<svg')
		expect(condition).toContain('<svg')
		expect(action).not.toBe(condition)
		expect(action).toContain('lucide')
	})

	it('renders the stroked control glyph, and follows the reading direction', () => {
		const subject = { id: 'Sequence', kind: 'control' as const, controlKind: 'sequence' as const }
		expect(btSubjectIsControl(subject)).toBe(true)
		// Same contract `btGlyphs.test.tsx` pins: sequence runs with the children.
		expect(renderToStaticMarkup(<BtNodeIcon subject={subject} orientation="down" />)).toContain('H20')
		expect(renderToStaticMarkup(<BtNodeIcon subject={subject} orientation="right" />)).toContain('V20')
	})

	it('gives each decorator its own mark rather than one generic box', () => {
		const marks = new Set(['RetryUntilSuccessful', 'Repeat', 'Timeout', 'Inverter', 'ForceSuccess'].map((id) => (
			renderToStaticMarkup(<BtNodeIcon subject={{ id, kind: 'decorator' }} orientation="down" />)
		)))
		expect(marks.size).toBe(5)
	})

	it('treats an unknown node with a control kind as a control', () => {
		expect(btSubjectIsControl({ id: 'Mystery', kind: 'unknown', controlKind: 'sequence' })).toBe(true)
		expect(btSubjectIsControl({ id: 'Mystery', kind: 'unknown' })).toBe(false)
	})

	it('honours the requested size', () => {
		expect(renderToStaticMarkup(<BtNodeIcon subject={{ id: 'Sequence', kind: 'control', controlKind: 'sequence' }} size={32} />))
			.toContain('width="32"')
		expect(renderToStaticMarkup(<BtNodeIcon subject={{ id: 'MoveTo', kind: 'action' }} size={32} />))
			.toContain('width="32"')
	})
})
