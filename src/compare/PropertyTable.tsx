/**
 * The property comparison table — the centerpiece of the panel.
 *
 * Three columns, `Layer · Previous · Current`, and three states. Simulink's
 * Comparison Tool prints its legend at the bottom of the window in exactly
 * these terms — *Insertion · Deletion · Modification*, three colours, not two —
 * and it is the closest domain match in the whole prior-art sweep: it compares
 * boxes with named ports joined by signal lines, which is what a board is.
 *
 * Two rules are load-bearing and both come from `compareModel`:
 *
 * 1. A port row nests under its Block *whether or not the Block itself changed*.
 *    A Block that only gained a port shows no row of its own — just its name as
 *    a group header, with an `Added` port beneath. That is the visible form of
 *    "an insertion is not a modification of the thing that gained it".
 *
 * 2. Word-level ink appears only inside a `Modified` row's two cells. An
 *    `Added` row has no previous value and a `Removed` row has no current one,
 *    so there is nothing to align; the cell says so with an em dash instead of
 *    pretending to a comparison. `canWordDiff` is the guard.
 *
 * The ink itself is GitHub's: the cell carries a light wash saying "this side
 * of the pair", and only the runs that actually differ take the stronger fill.
 * Additive, never a strikethrough — `run_inference` → `run_predict` inks
 * `inference` and `predict` and leaves `run_` alone.
 */

import { Fragment, useMemo } from 'react'

import { wordDiff, type DiffToken } from '../diff/wordDiff'
import { canWordDiff, type ChangeKind, type CompareChange, type FieldChange } from './compareModel'

const KIND_LABEL: Record<ChangeKind, string> = {
	added: 'Added',
	removed: 'Removed',
	modified: 'Modified',
}

/** A run of text, washed by the side it is on and filled where it differs. */
function InkedValue({ tokens, side }: { tokens: readonly DiffToken[]; side: 'before' | 'after' }) {
	return (
		<span className="systemsketch-compare__value" data-side={side}>
			{tokens.map((token, index) => (
				<span
					key={index}
					className="systemsketch-compare__run"
					data-kind={token.kind}
					// A `same` run is deliberately unmarked: GitHub touches
					// nothing outside the tokens that actually differ.
				>
					{token.text}
				</span>
			))}
		</span>
	)
}

/** The cell for a side that has no value at all, which is not the same as ''. */
function AbsentValue({ label }: { label: string }) {
	return (
		<span className="systemsketch-compare__absent" aria-label={label} title={label}>
			—
		</span>
	)
}

interface RowProps {
	change: CompareChange
	field: FieldChange | null
	selected: boolean
	onSelect: (changeId: string) => void
}

function ValueRow({ change, field, selected, onSelect }: RowProps) {
	const inked = useMemo(() => {
		if (!field) return null
		if (!canWordDiff(change)) return null
		return wordDiff(field.before, field.after)
	}, [change, field])

	const label = field
		? field.path
		: change.subject === 'port'
			? 'port'
			: change.subject === 'cable'
				? 'cable'
				: change.subject

	return (
		<tr
			className="systemsketch-compare__row"
			data-kind={change.kind}
			data-subject={change.subject}
			data-change-id={change.id}
			data-selected={selected || undefined}
			data-testid={`compare-row-${change.id}${field ? `-${field.path}` : ''}`}
			onClick={() => onSelect(change.id)}
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return
				event.preventDefault()
				onSelect(change.id)
			}}
		>
			<th scope="row" className="systemsketch-compare__layer">
				<span className="systemsketch-compare__badge" data-kind={change.kind}>
					{KIND_LABEL[change.kind]}
				</span>
				<span className="systemsketch-compare__name">{change.name}</span>
				<span className="systemsketch-compare__path">{label}</span>
			</th>
			<td className="systemsketch-compare__cell" data-side="before">
				{change.kind === 'added' ? (
					<AbsentValue label="did not exist before" />
				) : inked ? (
					<InkedValue tokens={inked.before} side="before" />
				) : (
					<span className="systemsketch-compare__value" data-side="before">
						{describeWhole(change, 'before')}
					</span>
				)}
			</td>
			<td className="systemsketch-compare__cell" data-side="after">
				{change.kind === 'removed' ? (
					<AbsentValue label="does not exist now" />
				) : inked ? (
					<InkedValue tokens={inked.after} side="after" />
				) : (
					<span className="systemsketch-compare__value" data-side="after">
						{describeWhole(change, 'after')}
					</span>
				)}
			</td>
		</tr>
	)
}

/** What a whole-object insertion or deletion says in its one populated cell. */
function describeWhole(change: CompareChange, side: 'before' | 'after'): string {
	const record = side === 'before' ? change.recordBefore : change.recordAfter
	if (!record || typeof record !== 'object') return ''
	const props = (record as { props?: Record<string, unknown> }).props ?? record
	const bag = props as Record<string, unknown>
	const parts: string[] = []
	for (const key of ['name', 'title', 'type', 'blockType', 'defaultValue']) {
		const value = bag[key]
		if (typeof value !== 'string' || value === '') continue
		parts.push(key === 'defaultValue' ? `= ${value}` : value)
	}
	return parts.join(' · ') || change.name
}

export interface PropertyTableProps {
	changes: readonly CompareChange[]
	selectedId: string | null
	onSelect: (changeId: string) => void
}

export function PropertyTable({ changes, selectedId, onSelect }: PropertyTableProps) {
	// Group children under their parent so an inserted port reads as belonging
	// to a Block that did not itself change.
	const groups = useMemo(() => {
		const roots: Array<{ key: string; header: string | null; rows: CompareChange[] }> = []
		const byParent = new Map<string, CompareChange[]>()
		for (const change of changes) {
			if (!change.parentId) continue
			const list = byParent.get(change.parentId) ?? []
			list.push(change)
			byParent.set(change.parentId, list)
		}
		const seen = new Set<string>()
		for (const change of changes) {
			if (change.parentId) continue
			seen.add(change.id)
			roots.push({ key: change.id, header: null, rows: [change, ...(byParent.get(change.id) ?? [])] })
		}
		// A Block that produced no row of its own still heads its port rows.
		for (const [parentId, rows] of byParent) {
			if (seen.has(parentId)) continue
			roots.push({ key: parentId, header: rows[0]?.name.split('.')[0] ?? parentId, rows })
		}
		return roots
	}, [changes])

	if (changes.length === 0) {
		return (
			<p className="systemsketch-compare__none" data-testid="compare-no-changes">
				No differences between these two versions.
			</p>
		)
	}

	return (
		<table className="systemsketch-compare__table" data-testid="compare-property-table">
			<colgroup>
				<col className="systemsketch-compare__col-layer" />
				<col className="systemsketch-compare__col-value" />
				<col className="systemsketch-compare__col-value" />
			</colgroup>
			<thead>
				<tr>
					<th scope="col">Layer</th>
					<th scope="col">Previous</th>
					<th scope="col">Current</th>
				</tr>
			</thead>
			<tbody>
				{groups.map((group) => (
					<Fragment key={group.key}>
						{group.header ? (
							<tr className="systemsketch-compare__group">
								<th scope="rowgroup" colSpan={3}>
									{group.header}
									<span className="systemsketch-compare__group-note">unchanged itself</span>
								</th>
							</tr>
						) : null}
						{group.rows.map((change) =>
							change.fields.length === 0 ? (
								<ValueRow
									key={change.id}
									change={change}
									field={null}
									selected={selectedId === change.id}
									onSelect={onSelect}
								/>
							) : (
								change.fields.map((field) => (
									<ValueRow
										key={`${change.id}:${field.path}`}
										change={change}
										field={field}
										selected={selectedId === change.id}
										onSelect={onSelect}
									/>
								))
							),
						)}
					</Fragment>
				))}
			</tbody>
		</table>
	)
}
