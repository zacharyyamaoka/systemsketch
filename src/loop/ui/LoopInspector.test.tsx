import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getDefaultLoopProps } from '../loopModel'
import { LoopInspectorContent } from './LoopInspector'

describe('Loop inspector empty fields', () => {
	it('uses generic field roles instead of an example iteration', () => {
		const base = getDefaultLoopProps()
		const html = renderToStaticMarkup(
			<LoopInspectorContent
				props={{
					...base,
					title: '',
					iterable: { ...base.iterable, type: '' },
					item: { ...base.item, type: '' },
					turn: '',
				}}
			/>,
		)

		for (const role of ['Title', 'Type', 'Iteration status']) {
			expect(html).toContain(`placeholder="${role}"`)
		}
		expect(html).not.toContain('placeholder="For Loop"')
		expect(html).not.toContain('placeholder="iteration 3 of 7"')
	})
})
