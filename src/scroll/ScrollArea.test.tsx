import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SCROLL_AREA_CLASS, ScrollArea, scrollAreaClassName } from './ScrollArea'

describe('ScrollArea', () => {
	it('composes with a caller class instead of replacing it', () => {
		expect(scrollAreaClassName()).toBe(SCROLL_AREA_CLASS)
		expect(scrollAreaClassName('bt-library__body')).toBe(`${SCROLL_AREA_CLASS} bt-library__body`)
	})

	it('leaves data-axis off for the default vertical scroller', () => {
		// WHY it matters: the CSS keys the horizontal cases off the attribute, so
		// emitting `data-axis="y"` would be a selector that never matches.
		const html = renderToStaticMarkup(<ScrollArea>rows</ScrollArea>)
		expect(html).toContain(`class="${SCROLL_AREA_CLASS}"`)
		expect(html).not.toContain('data-axis')
	})

	it('stamps the axis when it is not the default', () => {
		expect(renderToStaticMarkup(<ScrollArea axis="x">rows</ScrollArea>)).toContain('data-axis="x"')
		expect(renderToStaticMarkup(<ScrollArea axis="both">rows</ScrollArea>)).toContain('data-axis="both"')
	})

	it('passes through the attributes a scroller normally needs', () => {
		const html = renderToStaticMarkup(<ScrollArea data-testid="probe" role="listbox">rows</ScrollArea>)
		expect(html).toContain('data-testid="probe"')
		expect(html).toContain('role="listbox"')
	})
})
