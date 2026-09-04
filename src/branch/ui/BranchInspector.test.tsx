import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { getDefaultBranchProps } from '../branchModel'
import { BranchInspectorContent } from './BranchInspector'

describe('Branch inspector empty fields', () => {
	it('uses field roles instead of a Branch, case, or generated-control example', () => {
		const base = getDefaultBranchProps()
		const html = renderToStaticMarkup(
			<BranchInspectorContent
				props={{
					...base,
					title: '',
					controls: [{ id: 'ctrl_1', name: '', type: '' }],
					arms: [{ ...base.arms[0], title: '' }],
				}}
			/>,
		)

		for (const role of ['Title', 'Name', 'Type', 'Case title']) {
			expect(html).toContain(`placeholder="${role}"`)
		}
		expect(html).not.toContain('placeholder="Branch"')
		expect(html).not.toContain('placeholder="case"')
	})
})
