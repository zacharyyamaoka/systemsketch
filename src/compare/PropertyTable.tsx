/**
 * The property comparison table — ported from the omnibox variant.
 *
 * `TokenRun`, `ValueCell` and the `<table>` below are that variant's
 * `src/review/DiffReviewModal.tsx` verbatim, down to the class names, because
 * this is the table Zach picked when he compared the five: *"I like the
 * property table in omnibox."* What changed on the way over is the data behind
 * it (`propertyRows.ts` adapts this tree's real `CompareChange` into omnibox's
 * `PropertyRow`, so the rows are read off real boards rather than a fixture)
 * and two things Zach asked for:
 *
 *  - **Modified is blue**, not amber. See `review-table.css`.
 *  - **A toggle for the git-style intra-value highlighting**, because Figma's
 *    property panel does not word-diff and is usually clear enough. It is a
 *    pure presentation switch: the same rows, the same `<mark>` elements, one
 *    `data-git-highlight` stamp on the table deciding whether they carry ink.
 *
 * Two rules survive the port unchanged, and both are load-bearing:
 *
 *  1. Word-level ink fires only on a `modified` row. An `added` row has no
 *     previous value and a `removed` row has no current one, so there is
 *     nothing to align; the cell asserts the absence with an em dash on a
 *     hatched ground instead of going blank, because an empty cell reads as
 *     "unknown" and absence is the entire claim the row is making.
 *  2. The highlight is additive — `run_inference` → `run_predict` inks
 *     `inference` and `predict` and leaves `run_` alone. Never a strikethrough.
 */

import { wordDiff, type DiffToken } from '../diff/wordDiff'
import type { CompareChange } from './compareModel'
import {
	orderChanges,
	propertyRowsOf,
	rowCurrent,
	rowPrevious,
	rowSupportsWordDiff,
	STATE_LABEL,
	type PropertyRow,
} from './propertyRows'
import './review-table.css'

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

export interface PropertyTableProps {
	changes: readonly CompareChange[]
	selectedId: string | null
	onSelect: (changeId: string) => void
	/** Whether the two-layer git-style ink is painted. See `review-table.css`. */
	gitHighlight: boolean
}

export function PropertyTable({ changes, selectedId, onSelect, gitHighlight }: PropertyTableProps) {
	const ordered = orderChanges(changes)

	return (
		<table
			className="systemsketch-review__table"
			data-testid="compare-property-table"
			data-git-highlight={gitHighlight ? 'on' : 'off'}
		>
			<thead>
				<tr>
					<th scope="col">Layer</th>
					<th scope="col">Previous</th>
					<th scope="col">Current</th>
				</tr>
			</thead>
			<tbody>
				{ordered.flatMap((change) =>
					propertyRowsOf(change).map((row) => (
						<tr
							key={row.key}
							data-state={row.state}
							data-testid={`compare-row-${row.key}`}
							data-change-id={change.id}
							data-selected={change.id === selectedId || undefined}
							tabIndex={0}
							role="button"
							aria-label={`${STATE_LABEL[row.state]} · ${row.layer}`}
							onClick={() => onSelect(change.id)}
							onKeyDown={(event) => {
								if (event.key !== 'Enter' && event.key !== ' ') return
								event.preventDefault()
								onSelect(change.id)
							}}
						>
							<th scope="row" className="systemsketch-review__layer">
								<span className="systemsketch-review__state" data-state={row.state}>
									{STATE_LABEL[row.state]}
								</span>
								<span className="systemsketch-review__layer-name">{row.layer}</span>
							</th>
							<ValueCell row={row} side="previous" />
							<ValueCell row={row} side="current" />
						</tr>
					)),
				)}
				{changes.length === 0 ? (
					<tr><td colSpan={3} className="systemsketch-review__empty" data-testid="compare-no-changes">
						These two versions are identical.
					</td></tr>
				) : null}
			</tbody>
		</table>
	)
}
