/**
 * The property comparison table — ported from the omnibox variant, in two
 * layouts a reviewer can switch between.
 *
 * `TokenRun` and `ValueCell` are that variant's `src/review/DiffReviewModal.tsx`
 * verbatim, down to the class names, because this is the table Zach picked when
 * he compared the five. What has changed since is the ALTITUDE it groups at.
 *
 * ## Why an element column at all
 *
 * The first port listed rows like `run_predict.threshold` — one row per
 * property, with the element folded into a dotted path string. That reads as a
 * list of properties that happen to mention an element. Figma's Layers list and
 * Simulink's comparison tree both group by ELEMENT — a node or a cable, never a
 * property and never a port — because "what did I change" is answered by
 * pointing at a thing on the board, not by scanning a column of paths.
 *
 * ## The two layouts
 *
 * - `columns` — `Element · Property · Previous · Current`. One flat table, but
 *   every row now states its element instead of burying it in a path.
 * - `figma` — Figma's own shape: a list of elements on the left, each with an
 *   Added/Edited/Removed badge, and a `Property · Previous · Current` table on
 *   the right scoped to whichever one is selected. Nothing selected shows
 *   Figma's own empty-state sentence rather than an empty grid.
 *
 * Both are real views over the same rows, not a filter dressed as a mode, so
 * the comparison between them is a fair one.
 */

import { wordDiff, type DiffToken } from '../diff/wordDiff'
import type { CompareChange } from './compareModel'
import {
	elementSummaries,
	orderChanges,
	propertyRowsOf,
	rowCurrent,
	rowPrevious,
	rowSupportsWordDiff,
	ELEMENT_STATUS_LABEL,
	STATE_LABEL,
	type PropertyRow,
} from './propertyRows'
import './review-table.css'

export type TableLayout = 'columns' | 'figma'

function TokenRun({ tokens }: { tokens: readonly DiffToken[] }) {
	return (
		<>
			{tokens.map((token, index) => (
				token.kind === 'same'
					? <span key={index}>{token.text}</span>
					: <mark key={index} data-token={token.kind}>{token.text}</mark>
			))}
		</>
	)
}

/**
 * One cell of the Previous/Current pair.
 *
 * Word-level highlight fires only where both sides exist — a `modified` row.
 * On an `added` or `removed` row the other side is genuinely absent, and the
 * cell says so with an explicit absence mark rather than going blank: empty
 * reads as "unknown", and absence is the entire claim the row is making.
 */
function ValueCell({
	row,
	side,
}: {
	row: PropertyRow
	side: 'previous' | 'current'
}) {
	const value = side === 'previous' ? rowPrevious(row) : rowCurrent(row)
	if (value === null) {
		return (
			<td className="systemsketch-review__value" data-absent="true">
				<span className="systemsketch-review__absent" aria-label="not present">—</span>
			</td>
		)
	}
	if (rowSupportsWordDiff(row)) {
		const diff = wordDiff(row.previous, row.current)
		return (
			<td className="systemsketch-review__value" data-side={side}>
				<code><TokenRun tokens={side === 'previous' ? diff.before : diff.after} /></code>
			</td>
		)
	}
	return (
		<td className="systemsketch-review__value" data-side={side}>
			<code>{value}</code>
		</td>
	)
}

/** The state badge, in the Layer/Property cell. */
function StateBadge({ state }: { state: PropertyRow['state'] }) {
	return (
		<span className="systemsketch-review__state" data-state={state}>
			{STATE_LABEL[state]}
		</span>
	)
}

interface RowProps {
	change: CompareChange
	row: PropertyRow
	selected: boolean
	onSelect: (changeId: string) => void
	/** `columns` prints the element beside the property; `figma` does not. */
	showElement: boolean
}

function ValueRow({ change, row, selected, onSelect, showElement }: RowProps) {
	return (
		<tr
			data-state={row.state}
			data-testid={`compare-row-${row.key}`}
			data-change-id={change.id}
			data-element-id={row.elementId}
			data-selected={selected || undefined}
			tabIndex={0}
			role="button"
			aria-label={`${STATE_LABEL[row.state]} · ${row.element} · ${row.property}`}
			onClick={() => onSelect(change.id)}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return
				event.preventDefault()
				onSelect(change.id)
			}}
		>
			{showElement ? (
				<th scope="row" className="systemsketch-review__layer">
					<StateBadge state={row.state} />
					<span className="systemsketch-review__layer-name">{row.element}</span>
				</th>
			) : null}
			<td className="systemsketch-review__property">
				{/* With no Element column the badge has nowhere else to live, and
				  * dropping it would take the row's state with it. */}
				{showElement ? null : <StateBadge state={row.state} />}
				<span className="systemsketch-review__property-name">{row.property}</span>
			</td>
			<ValueCell row={row} side="previous" />
			<ValueCell row={row} side="current" />
		</tr>
	)
}

export interface PropertyTableProps {
	changes: readonly CompareChange[]
	selectedId: string | null
	onSelect: (changeId: string) => void
	/** Whether the two-layer git-style ink is painted. See `review-table.css`. */
	gitHighlight: boolean
	layout: TableLayout
	/** `figma` only: which element's properties the right-hand table shows. */
	selectedElementId: string | null
	onSelectElement: (elementId: string | null) => void
}

export function PropertyTable({
	changes,
	selectedId,
	onSelect,
	gitHighlight,
	layout,
	selectedElementId,
	onSelectElement,
}: PropertyTableProps) {
	const ordered = orderChanges(changes)

	if (layout === 'figma') {
		return (
			<FigmaLayout
				changes={changes}
				selectedId={selectedId}
				onSelect={onSelect}
				gitHighlight={gitHighlight}
				selectedElementId={selectedElementId}
				onSelectElement={onSelectElement}
			/>
		)
	}

	return (
		<table
			className="systemsketch-review__table"
			data-testid="compare-property-table"
			data-layout="columns"
			data-git-highlight={gitHighlight ? 'on' : 'off'}
		>
			<thead>
				<tr>
					<th scope="col">Element</th>
					<th scope="col">Property</th>
					<th scope="col">Previous</th>
					<th scope="col">Current</th>
				</tr>
			</thead>
			<tbody>
				{ordered.flatMap((change) =>
					propertyRowsOf(change).map((row) => (
						<ValueRow
							key={row.key}
							change={change}
							row={row}
							selected={change.id === selectedId}
							onSelect={onSelect}
							showElement
						/>
					)),
				)}
				{changes.length === 0 ? (
					<tr><td colSpan={4} className="systemsketch-review__empty" data-testid="compare-no-changes">
						These two versions are identical.
					</td></tr>
				) : null}
			</tbody>
		</table>
	)
}

/**
 * Figma's layout, copied rather than approximated.
 *
 * A left list of the elements that changed, each badged; the right side is the
 * property comparison for exactly one of them. The empty-state sentence is
 * Figma's own wording, which is the point — this view exists to be judged
 * against the tool it came from, so paraphrasing it would blur the comparison.
 */
function FigmaLayout({
	changes,
	selectedId,
	onSelect,
	gitHighlight,
	selectedElementId,
	onSelectElement,
}: Omit<PropertyTableProps, 'layout'>) {
	const elements = elementSummaries(changes)
	const active = elements.find((element) => element.id === selectedElementId) ?? null

	return (
		<div className="systemsketch-review__figma" data-testid="compare-figma-layout">
			<ul className="systemsketch-review__elements" data-testid="compare-element-list">
				{elements.map((element) => (
					<li key={element.id}>
						<button
							type="button"
							data-testid={`compare-element-${element.id}`}
							data-status={element.status}
							data-selected={element.id === selectedElementId || undefined}
							aria-pressed={element.id === selectedElementId}
							// A cable's name is both endpoints, which will not fit an index
							// column. It ellipsises, so the complete value has to stay one
							// hover away — a clipped name must never be the only copy.
							title={element.name}
							onClick={() => onSelectElement(
								element.id === selectedElementId ? null : element.id,
							)}
						>
							<span
								className="systemsketch-review__element-status"
								data-status={element.status}
							>
								{ELEMENT_STATUS_LABEL[element.status]}
							</span>
							<span className="systemsketch-review__element-name">{element.name}</span>
							<span className="systemsketch-review__element-count">{element.rowCount}</span>
						</button>
					</li>
				))}
				{elements.length === 0 ? (
					<li className="systemsketch-review__empty" data-testid="compare-no-changes">
						These two versions are identical.
					</li>
				) : null}
			</ul>

			{active ? (
				<table
					className="systemsketch-review__table"
					data-testid="compare-property-table"
					data-layout="figma"
					data-git-highlight={gitHighlight ? 'on' : 'off'}
				>
					<thead>
						<tr>
							<th scope="col">Property</th>
							<th scope="col">Previous</th>
							<th scope="col">Current</th>
						</tr>
					</thead>
					<tbody>
						{active.changes.flatMap((change) =>
							propertyRowsOf(change).map((row) => (
								<ValueRow
									key={row.key}
									change={change}
									row={row}
									selected={change.id === selectedId}
									onSelect={onSelect}
									showElement={false}
								/>
							)),
						)}
					</tbody>
				</table>
			) : (
				<p className="systemsketch-review__figma-empty" data-testid="compare-figma-empty">
					Select an edited element to compare changes
				</p>
			)}
		</div>
	)
}
