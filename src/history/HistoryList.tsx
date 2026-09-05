/**
 * Figma's history list, replicated — one component, two places.
 *
 * The reference is Figma's own version-history panel: a compact row carrying a
 * small circle on the left, the change's short title as primary text, a relative
 * timestamp as muted secondary text, and a soft tint on the row that is
 * currently selected. That is the entire visual language, and it is replicated
 * here rather than reinterpreted — the same way earlier rounds replicated
 * Figma's Compare panel and its word-diff.
 *
 * The rule that makes this worth writing as a component at all: the board-level
 * rail in the Compare modal and the per-element tab in the Block inspector are
 * the SAME list, at two densities. Zach asked for exactly that — *"so there's a
 * bit of unity and you only have to understand the interaction pattern once"* —
 * and the way that promise rots is two components that merely look alike on the
 * day they ship. `density` is a stamp on one implementation, never a fork.
 *
 * ## Where the optional description goes
 *
 * Figma does not show one, so its list gave no answer and the choice was open.
 * It is disclosed on click, behind a chevron that appears ONLY on rows that
 * actually carry a description:
 *
 * - A tooltip loses it to anyone on a touch screen and hides it from anyone not
 *   already suspicious there is something there.
 * - A permanent third line breaks the rhythm that makes the list read as Figma's
 *   — rows would be two lines or three depending on their data, and a ragged
 *   list is the thing the reference most obviously is not.
 * - Disclosure keeps every row identical at rest and is what Onshape's
 *   `Show changes…` does — the other reference Zach pasted. It is the union of
 *   both prior arts rather than a third invention.
 *
 * The chevron is its own button, NOT the row. Selecting a version and reading
 * about it are two different intents, and folding them into one click would mean
 * you could not read a row without also re-pointing the diff at it.
 */

import { useState } from 'react'

import { absoluteTime, metaLine, type HistoryRecord } from './historyModel'
import './history.css'

export type HistoryDensity = 'comfortable' | 'compact'

export interface HistoryListProps {
	readonly records: readonly HistoryRecord[]
	/** Which record reads as active. Figma tints exactly one. */
	readonly selectedId: string | null
	readonly onSelect?: (id: string) => void
	/** `compact` is the inspector's narrower panel. Same anatomy, tighter metrics. */
	readonly density?: HistoryDensity
	/** Shown in place of the list when there is nothing to show. */
	readonly emptyCopy?: string
	/** Namespaces the test ids so two mounted lists never collide. */
	readonly testidPrefix: string
	/** Marks rows that cannot be picked (the live board is an endpoint, not a choice). */
	readonly isDisabled?: (record: HistoryRecord) => boolean
	/** Short trailing tag on a row — the modal uses it for `before` / `after`. */
	readonly pinOf?: (record: HistoryRecord) => string | null
}

export function HistoryList({
	records,
	selectedId,
	onSelect,
	density = 'comfortable',
	emptyCopy = 'No history recorded yet.',
	testidPrefix,
	isDisabled,
	pinOf,
}: HistoryListProps) {
	/*
	 * Which descriptions are open, by id — not a single `openId`.
	 *
	 * A single open row would make the disclosure an accordion, which quietly
	 * adds a rule nobody asked for: opening one row closes another, so a reader
	 * comparing two descriptions cannot. A Set costs nothing and has no such
	 * rule.
	 */
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

	const toggle = (id: string) => {
		setExpanded((open) => {
			const next = new Set(open)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	if (records.length === 0) {
		return (
			<p className="ss-history__empty" data-testid={`${testidPrefix}-empty`}>
				{emptyCopy}
			</p>
		)
	}

	return (
		<ul className="ss-history" data-density={density} data-testid={testidPrefix}>
			{records.map((record) => {
				const disabled = isDisabled?.(record) ?? false
				const open = expanded.has(record.id)
				const pin = pinOf?.(record) ?? null
				return (
					<li key={record.id} className="ss-history__item">
						<div
							className="ss-history__row"
							data-testid={`${testidPrefix}-row-${record.id}`}
							data-selected={record.id === selectedId || undefined}
							data-current={record.isCurrent || undefined}
						>
							<button
								type="button"
								className="ss-history__pick"
								data-testid={`${testidPrefix}-pick-${record.id}`}
								disabled={disabled}
								aria-current={record.id === selectedId || undefined}
								onClick={() => onSelect?.(record.id)}
							>
								{/*
								  * Figma's circular avatar slot, carrying the only thing
								  * this app can truthfully put in it.
								  *
								  * With no author recorded there is no face to draw, and a
								  * generic person glyph would be the "Profile placeholder"
								  * button `SystemSketchSharePanel` already deleted for
								  * promising an identity that does not exist. So the circle
								  * holds the version instead: same geometry, same left rail,
								  * same rhythm — real content. When `author` is non-null it
								  * takes over, which is what makes this a slot rather than a
								  * decoration.
								  */}
								<span
									className="ss-history__avatar"
									data-tone={record.tone}
									data-kind={record.author ? 'author' : 'version'}
									aria-hidden="true"
								>
									{record.author ? initialOf(record.author.name) : record.badge}
								</span>
								<span className="ss-history__text">
									<span className="ss-history__title" data-testid={`${testidPrefix}-title-${record.id}`}>
										{record.title}
									</span>
									<span
										className="ss-history__meta"
										data-testid={`${testidPrefix}-meta-${record.id}`}
										title={absoluteTime(record.timestamp)}
									>
										{metaLine(record)}
									</span>
								</span>
								{pin ? <span className="ss-history__pin">{pin}</span> : null}
							</button>
							{record.description ? (
								<button
									type="button"
									className="ss-history__disclose"
									data-testid={`${testidPrefix}-disclose-${record.id}`}
									aria-expanded={open}
									aria-label={open ? 'Hide details' : 'Show details'}
									title={open ? 'Hide details' : 'Show details'}
									onClick={() => toggle(record.id)}
								>
									<Chevron open={open} />
								</button>
							) : null}
						</div>
						{record.description && open ? (
							<p
								className="ss-history__description"
								data-testid={`${testidPrefix}-description-${record.id}`}
							>
								{record.description}
							</p>
						) : null}
					</li>
				)
			})}
		</ul>
	)
}

function Chevron({ open }: { open: boolean }) {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true" data-open={open || undefined}>
			<path
				d="M5.5 6.5 8 9l2.5-2.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}

/**
 * First character of a name, for the avatar circle.
 *
 * Uses the code-point iterator rather than `name[0]`, so an author whose name
 * begins with an emoji or an astral character gets their actual first character
 * instead of half a surrogate pair — the same truthful-rendering rule the
 * property table follows. The full name is still rendered in the meta line; this
 * abbreviates only inside the 20px circle.
 */
function initialOf(name: string): string {
	const first = [...name.trim()][0]
	return (first ?? '?').toUpperCase()
}
