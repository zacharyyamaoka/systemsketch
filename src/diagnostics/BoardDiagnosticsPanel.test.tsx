import { renderToStaticMarkup } from 'react-dom/server'
import type { TLPageId, TLShapeId } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { BoardDiagnosticsView } from './BoardDiagnosticsPanel'
import {
	BOARD_DIAGNOSTIC_CODES,
	type BoardDiagnosticsModel,
} from './diagnosticsModel'

const PAGE = 'page:runtime' as TLPageId
const BLOCK = 'shape:worker' as TLShapeId

function model(): BoardDiagnosticsModel {
	const diagnostic = {
		id: 'systemsketch:block-title.blank:shape%3Aworker',
		code: BOARD_DIAGNOSTIC_CODES.blankBlockTitle,
		severity: 'warning' as const,
		message: 'Block has no title',
		detail: 'Name this Block.',
		pageId: PAGE,
		primaryShapeId: BLOCK,
		affectedIds: [BLOCK],
	}
	return {
		diagnostics: [diagnostic],
		pages: [{ pageId: PAGE, pageName: 'Runtime', diagnostics: [diagnostic] }],
		counts: { total: 1, error: 0, warning: 1, info: 0 },
	}
}

describe('Board diagnostics presentation', () => {
	it('renders a named Problems list with counts, filters, codes, and navigation buttons', () => {
		const html = renderToStaticMarkup(
			<BoardDiagnosticsView model={model()} onActivate={vi.fn()} />,
		)

		expect(html).toContain('aria-label="Board diagnostics"')
		expect(html).toContain('aria-label="Diagnostic counts"')
		expect(html).toContain('role="group"')
		expect(html).toContain('aria-pressed="true"')
		expect(html).toContain('aria-label="Runtime problems"')
		expect(html).toContain('Warning: Block has no title. Name this Block.')
		expect(html).toContain(BOARD_DIAGNOSTIC_CODES.blankBlockTitle)
		expect(html).toContain('Select and fit the affected board objects')
	})

	it('filters without hiding the true total and explains an empty filter', () => {
		const html = renderToStaticMarkup(
			<BoardDiagnosticsView model={model()} filter="error" onActivate={vi.fn()} />,
		)

		expect(html).toContain('data-diagnostic-count="1"')
		expect(html).toContain('No error problems')
		expect(html).not.toContain('data-diagnostic-code=')
	})

	it('has a useful clean-board state rather than an empty list', () => {
		const html = renderToStaticMarkup(
			<BoardDiagnosticsView
				model={{
					diagnostics: [],
					pages: [],
					counts: { total: 0, error: 0, warning: 0, info: 0 },
				}}
				onActivate={vi.fn()}
			/>,
		)

		expect(html).toContain('No problems')
		expect(html).toContain('Board checks are clear')
		expect(html).toContain('updates as the board changes')
		expect(html).not.toContain('Filter diagnostics')
	})
})
