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

import {
	useCallback,
	useRef,
	useState,
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
} from 'react'
import {
	ArrowRight,
	Box,
	Circle,
	Frame,
	Shapes,
	Square,
	Type,
	Waypoints,
	type LucideIcon,
} from 'lucide-react'

import { wordDiff, type DiffToken } from '../diff/wordDiff'
import type { CompareChange, SubjectKind } from './compareModel'
import {
	elementSummaries,
	orderChanges,
	propertyRowsOf,
	rowCurrent,
	rowPrevious,
	rowSupportsWordDiff,
	ELEMENT_STATUS_LABEL,
	STATE_LABEL,
	type ElementSummary,
	type PropertyRow,
} from './propertyRows'
import './review-table.css'

export type TableLayout = 'columns' | 'figma'

/**
 * The element-list column's width, in the `figma` layout.
 *
 * `DEFAULT` is wide enough to read an ordinary single name ("Controller",
 * "Button 001") without ellipsising, matching Figma's own Layers panel — the
 * reference this layout is deliberately copied from. A compound name like
 * this app's `"Plannerv2.plan → Controller.plan"` still won't fit and still
 * ellipsises; that is expected, and Figma's own panel does the same for a
 * name that long.
 *
 * `MIN` is the point below which the row's fixed furniture (icon, count,
 * status chip, and the button's own padding — see `.systemsketch-review
 * __elements button` in `review-table.css`) already eats ~110px, leaving too
 * little for any name to be worth showing at all. `MAX` is the point past
 * which the property table's own Previous/Current columns — the values a
 * reviewer is actually there to read — would be squeezed for the sake of an
 * index list.
 */
const DEFAULT_LIST_WIDTH = 220
const MIN_LIST_WIDTH = 150
const MAX_LIST_WIDTH = 440

/**
 * Which glyph stands for a change's underlying record.
 *
 * Zach's complaint was that a Block, a cable and a stock shape all read as
 * the same anonymous row — "it wasn't clear to me that one was like an edge,
 * one was a node, one was like a rectangle primitive". A `block`/`cable`/
 * `port` subject already says enough on its own; a `shape` subject is this
 * app's catch-all for every stock tldraw primitive, so it has to look one
 * level deeper — at the record's own `.type` — to tell a rectangle from a
 * text box from a frame. `Shapes` is the fallback for a stock type this
 * table has no specific glyph for yet (line, note, highlight, …), not for
 * "unknown" in general.
 */
function elementIcon(subject: SubjectKind, record: unknown): LucideIcon {
	if (subject === 'block') return Box
	if (subject === 'cable') return Waypoints
	if (subject === 'port') return Circle
	const shapeType = record && typeof record === 'object'
		? (record as { type?: unknown }).type
		: undefined
	switch (shapeType) {
		case 'text': return Type
		case 'frame': return Frame
		case 'arrow': return ArrowRight
		case 'geo': return Square
		default: return Shapes
	}
}

/** The record `elementIcon` should read for one flattened property row. */
function rowIcon(change: CompareChange): LucideIcon {
	return elementIcon(change.subject, change.recordAfter ?? change.recordBefore)
}

/**
 * The record `elementIcon` should read for a Figma-list element entry.
 *
 * An element's own change (its id matches the element id) carries the record
 * that actually says what kind of thing it is; a Block that only gained a
 * port has no such change, but `Box` is right for it regardless because
 * `subject` is already `'block'` in that case (`elementSummaries` computes
 * it the same way).
 */
function summaryIcon(element: ElementSummary): LucideIcon {
	const own = element.changes.find((change) => change.id === element.id) ?? element.changes[0]
	return elementIcon(element.subject, own?.recordAfter ?? own?.recordBefore)
}

/** Small, muted — the icon states WHAT changed; the badge states HOW. */
function ElementIcon({ Icon }: { Icon: LucideIcon }) {
	return <Icon className="systemsketch-review__element-icon" size={13} strokeWidth={2} aria-hidden="true" />
}

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

/**
 * The accept/reject affordance, present ONLY when the dialog was opened to
 * apply something (Merge, Rebase). A plain review passes nothing and this
 * table renders no checkbox at all — not a disabled one, not a hidden one.
 *
 * The unit is the ELEMENT, not the property row: IcePanel's own merge modal
 * lists one control per changed element, and a Block whose title and two ports
 * all changed is one thing a reviewer decides about, not three.
 */
export interface ElementReview {
	isAccepted(elementId: string): boolean
	onToggle(elementId: string, accepted: boolean): void
}

/** The checkbox itself, shared by both layouts so they cannot drift apart. */
function AcceptBox({
	review,
	elementId,
	elementName,
	testid,
}: {
	review: ElementReview
	elementId: string
	elementName: string
	testid: string
}) {
	const accepted = review.isAccepted(elementId)
	return (
		<input
			type="checkbox"
			className="systemsketch-review__accept"
			data-testid={testid}
			checked={accepted}
			aria-label={`Include ${elementName}`}
			// The row underneath is a select-this-element control; a click on the
			// box must decide inclusion WITHOUT also moving the boards, or every
			// tick would drag the camera somewhere the reviewer did not ask to go.
			onClick={(event) => event.stopPropagation()}
			onChange={(event) => review.onToggle(elementId, event.target.checked)}
		/>
	)
}

interface RowProps {
	change: CompareChange
	row: PropertyRow
	selected: boolean
	onSelect: (changeId: string) => void
	/** `columns` prints the element beside the property; `figma` does not. */
	showElement: boolean
	/** Action mode only, and only ever rendered in the element cell. */
	review?: ElementReview
}

function ValueRow({ change, row, selected, onSelect, showElement, review }: RowProps) {
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
					{/* One element can own several property rows, so this box repeats
					  * down the flat table — every copy reflects and toggles the SAME
					  * element, which is the point. Dropping it here instead would
					  * make an unchecked element invisible from this layout while
					  * still blocking the confirm: a disabled button with no cause on
					  * screen. */}
					<ElementIcon Icon={rowIcon(change)} />
					<span className="systemsketch-review__layer-name" title={row.element}>{row.element}</span>
					<StateBadge state={row.state} />
					{review ? (
						<AcceptBox
							review={review}
							elementId={row.elementId}
							elementName={row.element}
							testid={`compare-accept-row-${row.key}`}
						/>
					) : null}
				</th>
			) : null}
			<td className="systemsketch-review__property">
				{/*
				 * Figma puts the state to the RIGHT of the name, on the same line —
				 * not stacked above it. The inner row div (rather than `display:
				 * flex` on the `<td>` itself) is deliberate: a `<td>` given a
				 * non-table display drops out of the table's column layout and the
				 * browser wraps it in an anonymous cell, which is exactly the bug
				 * this file's own history warns about above `.systemsketch-review
				 * __property-name`'s CSS. The `<td>` stays a real table cell; only
				 * its content is a flex row.
				 */}
				<div className="systemsketch-review__property-row">
					<span className="systemsketch-review__property-name" title={row.property}>{row.property}</span>
					{/* With no Element column the badge has nowhere else to live, and
					  * dropping it would take the row's state with it. */}
					{showElement ? null : <StateBadge state={row.state} />}
				</div>
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
	/** Present only when the dialog was opened to APPLY something. */
	review?: ElementReview
}

export function PropertyTable({
	changes,
	selectedId,
	onSelect,
	gitHighlight,
	layout,
	selectedElementId,
	onSelectElement,
	review,
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
				review={review}
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
							review={review}
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
	review,
}: Omit<PropertyTableProps, 'layout'>) {
	const elements = elementSummaries(changes)
	const active = elements.find((element) => element.id === selectedElementId) ?? null

	// WHY: session-only, not persisted. Nothing else this dialog remembers
	// (`mode`, `dock`, `layout`, `gitHighlight` in `CompareDialog.tsx`) survives
	// a reopen either — they're all plain `useState` — so this control doesn't
	// get to be the first exception.
	const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH)
	const [dragging, setDragging] = useState(false)
	const dragOrigin = useRef<{ pointerX: number; startWidth: number } | null>(null)

	const clampListWidth = (width: number) =>
		Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, width))

	const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId)
		dragOrigin.current = { pointerX: event.clientX, startWidth: listWidth }
		setDragging(true)
	}, [listWidth])

	const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		const origin = dragOrigin.current
		if (!origin) return
		const delta = event.clientX - origin.pointerX
		setListWidth(clampListWidth(origin.startWidth + delta))
	}, [])

	const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId)
		}
		dragOrigin.current = null
		setDragging(false)
	}, [])

	return (
		<div
			className="systemsketch-review__figma"
			data-testid="compare-figma-layout"
			style={{ '--systemsketch-review-list-width': `${listWidth}px` } as CSSProperties}
		>
			<ul
				className="systemsketch-review__elements"
				data-testid="compare-element-list"
				data-review={review ? 'on' : undefined}
			>
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
							<ElementIcon Icon={summaryIcon(element)} />
							<span className="systemsketch-review__element-name">{element.name}</span>
							<span className="systemsketch-review__element-count">{element.rowCount}</span>
							<span
								className="systemsketch-review__element-status"
								data-status={element.status}
							>
								{ELEMENT_STATUS_LABEL[element.status]}
							</span>
						</button>
						{/*
						  * TRAILING, and a sibling of the row button rather than a child.
						  *
						  * A child is invalid HTML — an `<input>` inside a `<button>` — and
						  * the browser would route one click to both, so ticking the box
						  * would also select (or DESELECT) the element.
						  *
						  * Trailing because the row ALREADY opens with a 13px square: the
						  * kind icon for a `geo` rectangle is a square outline, and a leading
						  * checkbox beside it read as two checkboxes, one mysteriously
						  * unticked. Only visible in a screenshot. IcePanel puts its own
						  * per-row control on the right for the same reason — the decision
						  * column lines up and collides with nothing.
						  */}
						{review ? (
							<AcceptBox
								review={review}
								elementId={element.id}
								elementName={element.name}
								testid={`compare-accept-${element.id}`}
							/>
						) : null}
					</li>
				))}
				{elements.length === 0 ? (
					<li className="systemsketch-review__empty" data-testid="compare-no-changes">
						These two versions are identical.
					</li>
				) : null}
			</ul>

			{/*
			 * `onPointerDown` captures the pointer so the drag keeps tracking even
			 * once the cursor leaves this 6px strip — without capture, a fast drag
			 * outside the handle's own bounding box would silently stop updating.
			 * Double-click resets to the default width, the same low-cost
			 * affordance a resize handle usually gets; this app has no existing
			 * double-click-to-reset control to match, so this is the first one.
			 */}
			<div
				className="systemsketch-review__resize-handle"
				data-testid="compare-element-list-resize"
				data-dragging={dragging || undefined}
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize the element list"
				aria-valuenow={listWidth}
				aria-valuemin={MIN_LIST_WIDTH}
				aria-valuemax={MAX_LIST_WIDTH}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)}
			/>

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
						{/* No `review` here on purpose: this table is already scoped to
						  * ONE element, whose box lives on its row in the list to the
						  * left. Repeating it per property would imply a property-level
						  * decision that no action can honour. */}
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
