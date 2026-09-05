/**
 * One element's history, in the Block inspector — the SAME list as the board's.
 *
 * This is the second half of the unity Zach asked for: *"whatever you implement
 * for the history panel in the modal, let's please use potentially a similar, or
 * perhaps more compacted, design in also the history panel you see on the
 * per-element [inspector] — just so there's a bit of unity and you only have to
 * understand the interaction pattern once."*
 *
 * So this file contains no rows and no row styling. It resolves data and hands
 * it to `HistoryList` at `density="compact"`. If a row ever needs to look
 * different here, that is a change to the shared component or it does not happen
 * — a private copy would look identical on the day it shipped and diverge on
 * every day after.
 *
 * ## What this can and cannot tell you
 *
 * Per-element history is DERIVED, not logged. SystemSketch stores no per-shape
 * changelog — the only thing resembling one is tldraw's in-memory undo stack,
 * which is never serialised. So this diffs the `.vN` files that exist beside the
 * board and reports the versions in which THIS element changed. That is real,
 * and it is coarse: it can say a port was added between v1 and v2, never that it
 * happened on Tuesday or who did it. Loading is gated on mount, which the tab
 * does for free — no fetch happens until someone opens History.
 */

import { useEffect, useState } from 'react'
import type { Editor } from 'tldraw'

import { useOptionalLocalWorkspace } from '../workspace/LocalWorkspace'
import { HistoryList } from './HistoryList'
import {
	buildVersionChain,
	discoverVersions,
	elementHistoryRecords,
	type VersionStep,
} from './boardHistory'
import type { HistoryRecord } from './historyModel'

export interface ElementHistoryPanelProps {
	readonly editor: Editor
	/**
	 * The element's id in the comparison's vocabulary — `block:shape:predict`.
	 * `compareModel` keys elements this way, and matching it here is what lets
	 * one chain serve both panels.
	 */
	readonly elementId: string | null
	/** What the element is called, for the empty state's sentence. */
	readonly elementName: string
}

type LoadState = 'loading' | 'ready' | 'no-file'

export function ElementHistoryPanel({ editor, elementId, elementName }: ElementHistoryPanelProps) {
	const workspace = useOptionalLocalWorkspace()
	const path = workspace?.path ?? null
	const [steps, setSteps] = useState<VersionStep[] | null>(null)
	const [state, setState] = useState<LoadState>('loading')

	useEffect(() => {
		if (!path) {
			setState('no-file')
			return
		}
		let cancelled = false
		setState('loading')
		discoverVersions(path)
			.then((files) => buildVersionChain(files, editor))
			.then((chain) => {
				if (cancelled) return
				setSteps(chain)
				setState('ready')
			})
			.catch(() => {
				if (!cancelled) setState('no-file')
			})
		return () => {
			cancelled = true
		}
	}, [path, editor])

	const records: HistoryRecord[] = steps ? elementHistoryRecords(steps, elementId) : []
	// Only the live row: this element exists, and no saved version differs from
	// it. Worth saying in words, because an unexplained one-row list reads as a
	// panel that failed to load.
	const onlyCurrent = records.length === 1 && records[0].isCurrent

	return (
		<section
			className="block-inspector__history"
			role="tabpanel"
			aria-label="Element history"
			data-testid="element-history-panel"
			data-state={state}
		>
			<header>
				<span className="block-inspector__section-title">History</span>
				<p>
					{state === 'no-file'
						? 'This board has not been saved to a file yet.'
						: `Versions in which ${elementName || 'this element'} changed.`}
				</p>
			</header>

			{state === 'loading' ? (
				<p className="block-inspector__history-note">Reading versions…</p>
			) : (
				<HistoryList
					records={records}
					selectedId={records.find((record) => record.isCurrent)?.id ?? null}
					density="compact"
					testidPrefix="element-history"
					emptyCopy={
						state === 'no-file'
							? 'Save this board to a file to start a history.'
							: 'No recorded history for this element.'
					}
				/>
			)}

			{/*
			  * The gap, stated in the panel rather than only in a report.
			  *
			  * A reviewer who sees three rows will reasonably assume the app logged
			  * three edits. It did not — it measured three files. Saying so where
			  * the list is read is the difference between a derived history and a
			  * misleading one, and it is the same reason the Compare panel names
			  * which file it is diffing rather than just showing the diff.
			  */}
			{state === 'ready' ? (
				<p className="block-inspector__history-note" data-testid="element-history-provenance">
					{onlyCurrent
						? 'Compared against the saved versions beside this board — none of them differ here. '
						: 'Derived by comparing the saved versions beside this board. '}
					SystemSketch does not record who made a change, so no author is shown.
				</p>
			) : null}
		</section>
	)
}
