import { useState } from 'react'
import { type Editor, useValue } from 'tldraw'

import {
	focusBoardDiagnostic,
	getBoardDiagnosticsModel,
	type BoardDiagnostic,
	type BoardDiagnosticsModel,
	type BoardDiagnosticSeverity,
} from './diagnosticsModel'
import './diagnostics.css'

export type BoardDiagnosticFilter = 'all' | BoardDiagnosticSeverity

const FILTERS: Array<{ id: BoardDiagnosticFilter; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'error', label: 'Errors' },
	{ id: 'warning', label: 'Warnings' },
]

const SEVERITY_LABEL: Record<BoardDiagnosticSeverity, string> = {
	error: 'Error',
	warning: 'Warning',
	info: 'Info',
}

const SEVERITY_ICON: Record<BoardDiagnosticSeverity, string> = {
	error: '\u00d7',
	warning: '!',
	info: 'i',
}

function visibleDiagnostics(
	model: BoardDiagnosticsModel,
	filter: BoardDiagnosticFilter,
): BoardDiagnostic[] {
	return filter === 'all'
		? model.diagnostics
		: model.diagnostics.filter((diagnostic) => diagnostic.severity === filter)
}

function DiagnosticRow({
	diagnostic,
	onActivate,
}: {
	diagnostic: BoardDiagnostic
	onActivate(diagnostic: BoardDiagnostic): void
}) {
	const severity = SEVERITY_LABEL[diagnostic.severity]
	return (
		<li className="systemsketch-diagnostics__item">
			<button
				type="button"
				className="systemsketch-diagnostics__row"
				data-diagnostic-id={diagnostic.id}
				data-diagnostic-code={diagnostic.code}
				data-severity={diagnostic.severity}
				aria-label={`${severity}: ${diagnostic.message}. ${diagnostic.detail}`}
				title="Select and fit the affected board objects"
				onClick={() => onActivate(diagnostic)}
			>
				<span
					className="systemsketch-diagnostics__severity"
					data-severity={diagnostic.severity}
					aria-hidden="true"
				>
					{SEVERITY_ICON[diagnostic.severity]}
				</span>
				<span className="systemsketch-diagnostics__copy">
					<strong>{diagnostic.message}</strong>
					<span>{diagnostic.detail}</span>
					<code>{diagnostic.code}</code>
				</span>
				<span className="systemsketch-diagnostics__navigate" aria-hidden="true">⌖</span>
			</button>
		</li>
	)
}

export interface BoardDiagnosticsViewProps {
	model: BoardDiagnosticsModel
	filter?: BoardDiagnosticFilter
	onFilterChange?(filter: BoardDiagnosticFilter): void
	onActivate(diagnostic: BoardDiagnostic): void
}

/** Pure presentation surface, exported so integration and accessibility stay testable. */
export function BoardDiagnosticsView({
	model,
	filter = 'all',
	onFilterChange,
	onActivate,
}: BoardDiagnosticsViewProps) {
	const visible = visibleDiagnostics(model, filter)
	const visibleIds = new Set(visible.map((diagnostic) => diagnostic.id))

	return (
		<section
			className="systemsketch-diagnostics"
			aria-label="Board diagnostics"
			data-testid="systemsketch-diagnostics-panel"
			data-diagnostic-count={model.counts.total}
		>
			<header className="systemsketch-diagnostics__summary" aria-live="polite">
				<div>
					<strong>{model.counts.total === 0 ? 'No problems' : `${model.counts.total} problem${model.counts.total === 1 ? '' : 's'}`}</strong>
					<span>Derived locally from this board</span>
				</div>
				<div className="systemsketch-diagnostics__counts" aria-label="Diagnostic counts">
					<span data-severity="error" aria-label={`${model.counts.error} errors`}>
						<b aria-hidden="true">×</b>{model.counts.error}
					</span>
					<span data-severity="warning" aria-label={`${model.counts.warning} warnings`}>
						<b aria-hidden="true">!</b>{model.counts.warning}
					</span>
				</div>
			</header>

			{model.counts.total > 0 ? (
				<div className="systemsketch-diagnostics__filters" role="group" aria-label="Filter diagnostics">
					{FILTERS.map((candidate) => {
						const count = candidate.id === 'all'
							? model.counts.total
							: model.counts[candidate.id]
						return (
							<button
								key={candidate.id}
								type="button"
								aria-pressed={filter === candidate.id}
								onClick={() => onFilterChange?.(candidate.id)}
							>
								{candidate.label}<span>{count}</span>
							</button>
						)
					})}
				</div>
			) : null}

			<div className="systemsketch-diagnostics__body">
				{visible.length === 0 ? (
					<div className="systemsketch-diagnostics__empty" role="status">
						<span aria-hidden="true">{model.counts.total === 0 ? '\u2713' : '\u2298'}</span>
						<strong>{model.counts.total === 0 ? 'Board checks are clear' : `No ${filter} problems`}</strong>
						<p>{model.counts.total === 0
							? 'Add and connect Blocks; this view updates as the board changes.'
							: 'Choose another severity filter to see the remaining problems.'}</p>
					</div>
				) : model.pages.map((page) => {
					const pageDiagnostics = page.diagnostics.filter((diagnostic) => visibleIds.has(diagnostic.id))
					if (pageDiagnostics.length === 0) return null
					const headingId = `systemsketch-diagnostic-page-${encodeURIComponent(page.pageId)}`
					return (
						<section key={page.pageId} className="systemsketch-diagnostics__page" aria-labelledby={headingId}>
							<h3 id={headingId}>
								<span>{page.pageName}</span>
								<b>{pageDiagnostics.length}</b>
							</h3>
							<ul aria-label={`${page.pageName} problems`}>
								{pageDiagnostics.map((diagnostic) => (
									<DiagnosticRow
										key={diagnostic.id}
										diagnostic={diagnostic}
										onActivate={onActivate}
									/>
								))}
							</ul>
						</section>
					)
				})}
			</div>
		</section>
	)
}

export interface BoardDiagnosticsPanelProps {
	editor: Editor
}

/** Live Problems-style panel. Its parent owns opening and closing the surface. */
export function BoardDiagnosticsPanel({ editor }: BoardDiagnosticsPanelProps) {
	const [filter, setFilter] = useState<BoardDiagnosticFilter>('all')
	const model = useValue(
		'SystemSketch board diagnostics',
		() => getBoardDiagnosticsModel(editor),
		[editor],
	)
	return (
		<BoardDiagnosticsView
			model={model}
			filter={filter}
			onFilterChange={setFilter}
			onActivate={(diagnostic) => focusBoardDiagnostic(editor, diagnostic)}
		/>
	)
}
