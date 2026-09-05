import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PortDot } from './PortDot'

describe('PortDot semantic cue', () => {
	it('puts a visible, accessible Control cue in the DOM without adding a pointer target', () => {
		const html = renderToStaticMarkup(
			<PortDot portId="when" side="input" connected={false} producers={0} portType="bool"
				x={0} y={16} hinting={false} eligible={false} semanticLabel="Control" />,
		)
		expect(html).toContain('aria-label="Control port"')
		expect(html).toContain('<span class="Port-semanticCue">Control</span>')
	})
})
