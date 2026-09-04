/**
 * Compare changes — a modal that takes the screen while it is open.
 *
 * This is Figma's Compare panel shape, deliberately: a title bar with a close
 * button, a History rail on the left, the two boards in the middle under a
 * `Side by side | Overlay` toggle, and a `Code | Properties` panel on the right
 * scoped to whatever row is selected. The board behind it is dimmed and inert;
 * closing returns to ordinary editing with the camera and selection untouched.
 *
 * Why a *modal* and not a docked panel: this variant optimises for a reviewer
 * who wants to sit inside the diff. The cost is real and worth naming — you
 * cannot see any of the surrounding, un-diffed board while you review, and you
 * cannot fix what you find without leaving. It buys the two renders roughly
 * twice the width a docked panel could give them, which is what makes
 * side-by-side legible on a board wider than a phone mock.
 *
 * It mounts through Radix's `Dialog`, which is already this repo's dialog
 * primitive (the workspace file browser uses it), so focus trapping, Escape and
 * screen-reader modality are not reimplemented here. It portals into
 * `.systemsketch-theme-root` rather than the body so the `--ss-*` tokens the
 * ThemeRoot stamps still resolve inside it.
 */

import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, type Editor, type TLShapeId, type TLStoreSnapshot } from 'tldraw'

import { BoardRender, useLinkedCameras, type HighlightTarget } from './BoardRender'
import { CodeView } from './CodeView'
import { PropertyTable } from './PropertyTable'
import { compareBoards, recordsOfSnapshot, type CompareChange } from './compareModel'
import { orderChanges } from './propertyRows'
import { discoverHistory, loadEntrySnapshot, type HistoryEntry } from './compareSource'
// The tab strip below is the app's own `.block-inspector__tabs`, not a
// lookalike. Imported explicitly rather than leaned on transitively, so the
// rule set travels with the component that depends on it.
import '../blocks/ui/block-inspector.css'
import './compare.css'

export type CompareMode = 'side-by-side' | 'overlay'
export type CompareTab = 'properties' | 'code'

const KIND_ORDER = ['added', 'removed', 'modified'] as const

export interface CompareDialogProps {
	editor: Editor
	currentPath: string | null
	onClose: () => void
}

export function CompareDialog({ editor, currentPath, onClose }: CompareDialogProps) {
	const [history, setHistory] = useState<HistoryEntry[]>([])
	const [beforeId, setBeforeId] = useState<string | null>(null)
	const [beforeSnapshot, setBeforeSnapshot] = useState<TLStoreSnapshot | null>(null)
	const [afterSnapshot, setAfterSnapshot] = useState<TLStoreSnapshot | null>(null)
	const [mode, setMode] = useState<CompareMode>('side-by-side')
	const [tab, setTab] = useState<CompareTab>('properties')
	/** 0 shows the previous version, 100 shows the current one. */
	const [blend, setBlend] = useState(100)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [beforeEditor, setBeforeEditor] = useState<Editor | null>(null)
	const [afterEditor, setAfterEditor] = useState<Editor | null>(null)
	const [problem, setProblem] = useState<string | null>(null)
	/**
	 * Fullscreen is a STAMP on this same component, never a second surface.
	 *
	 * The obvious implementation is a separate immersive view that the modal
	 * hands its state to on the way in and takes back on the way out. That is
	 * also how "returning to modal restores exactly where you left off" quietly
	 * rots: every new piece of state is one more thing someone has to remember
	 * to carry across, and the day they forget, the reviewer loses their place.
	 *
	 * Here the tree never unmounts. Fullscreen hides the chrome with CSS and
	 * promotes the stage to the viewport, so selection, tab, blend, git-ink and
	 * both tldraw cameras are preserved BY CONSTRUCTION rather than by a
	 * save/restore anyone could get wrong.
	 */
	const [fullscreen, setFullscreen] = useState(false)
	/**
	 * The git-style intra-value ink, default OFF.
	 *
	 * Reversible on purpose — flip this literal and nothing else moves. OFF is
	 * the Figma baseline Zach named as the reason for wanting the switch at all
	 * ("in Figma, it doesn't show that"): the Previous and Current columns are
	 * already a side-by-side pair, and for most rows that is the whole story.
	 * The reviewer turns the ink on for the rows where it is not — a long
	 * identifier with one segment changed — which is the minority case.
	 */
	const [gitHighlight, setGitHighlight] = useState(false)

	useLinkedCameras(afterEditor, beforeEditor)

	// The after side is the live board, frozen the moment the modal opened.
	useEffect(() => {
		setAfterSnapshot(editor.store.getStoreSnapshot())
	}, [editor])

	useEffect(() => {
		let cancelled = false
		discoverHistory(currentPath).then((entries) => {
			if (cancelled) return
			setHistory(entries)
			const firstPrior = entries.find((entry) => !entry.isCurrent)
			setBeforeId(firstPrior?.id ?? null)
			if (!firstPrior) {
				setProblem(
					'No prior versions found beside this board. Save a `<name>.v1.systemsketch` next to it to compare against.',
				)
			}
		})
		return () => {
			cancelled = true
		}
	}, [currentPath])

	useEffect(() => {
		const entry = history.find((candidate) => candidate.id === beforeId)
		if (!entry) return
		let cancelled = false
		loadEntrySnapshot(entry, editor).then((snapshot) => {
			if (cancelled) return
			if (!snapshot) {
				setProblem(`Could not read ${entry.note}.`)
				return
			}
			setProblem(null)
			setBeforeSnapshot(snapshot)
			setSelectedId(null)
		})
		return () => {
			cancelled = true
		}
	}, [beforeId, history, editor])

	const comparison = useMemo(() => {
		if (!beforeSnapshot || !afterSnapshot) return null
		return compareBoards(recordsOfSnapshot(beforeSnapshot), recordsOfSnapshot(afterSnapshot))
	}, [beforeSnapshot, afterSnapshot])

	const selected: CompareChange | null = useMemo(() => {
		if (!comparison || !selectedId) return null
		return comparison.changes.find((change) => change.id === selectedId) ?? null
	}, [comparison, selectedId])

	const highlightBefore: HighlightTarget = useMemo(
		() => ({ shapeId: selected?.anchorBefore ?? null, kind: selected?.kind ?? null }),
		[selected],
	)
	const highlightAfter: HighlightTarget = useMemo(
		() => ({ shapeId: selected?.anchorAfter ?? null, kind: selected?.kind ?? null }),
		[selected],
	)

	/**
	 * The stepper's running order — the SAME order the table prints.
	 *
	 * Two orderings would be a quiet lie: "4 of 7" has to mean the fourth row
	 * down, or the counter is measuring a list nobody can see. One sort, shared.
	 */
	const ordered = useMemo(() => orderChanges(comparison?.changes ?? []), [comparison])
	const selectedIndex = useMemo(
		() => (selectedId ? ordered.findIndex((change) => change.id === selectedId) : -1),
		[ordered, selectedId],
	)

	/**
	 * Frame one change, on both boards at once.
	 *
	 * This is canvas-first's `zoomToSelection` handoff, adapted: a change can be
	 * a DELETION, which has no shape on the after board to select at all. So it
	 * unions whatever anchors exist across the two panes and zooms to that box —
	 * the two versions share one page coordinate space, and `useLinkedCameras`
	 * carries the move to the other pane, so a removed Block frames correctly on
	 * the side that no longer contains it.
	 */
	const jumpTo = useCallback(
		(change: CompareChange | null) => {
			if (!change || !afterEditor) return
			const boxes: Box[] = []
			for (const [editor, anchor] of [
				[afterEditor, change.anchorAfter],
				[beforeEditor, change.anchorBefore],
			] as const) {
				if (!editor || !anchor) continue
				const bounds = editor.getShapePageBounds(anchor as TLShapeId)
				if (bounds) boxes.push(Box.From(bounds))
			}
			if (boxes.length === 0) return
			afterEditor.zoomToBounds(Box.Common(boxes).expandBy(220), { animation: { duration: 180 } })
		},
		[afterEditor, beforeEditor],
	)

	/** Step the selection, wrapping — so the stepper never dead-ends. */
	const step = useCallback(
		(delta: number) => {
			if (ordered.length === 0) return
			const from = selectedIndex < 0 ? (delta > 0 ? -1 : 0) : selectedIndex
			const next = ((from + delta) % ordered.length + ordered.length) % ordered.length
			setSelectedId(ordered[next].id)
		},
		[ordered, selectedIndex],
	)

	// Selecting a change frames it, wherever the selection came from — a table
	// row, the stepper, or a click on the board itself. One rule, so the camera
	// cannot disagree with the counter about which change is on screen.
	useEffect(() => {
		if (!selectedId) return
		jumpTo(ordered.find((change) => change.id === selectedId) ?? null)
	}, [selectedId, ordered, jumpTo])

	/**
	 * Re-frame when the stage changes size, and ONLY then.
	 *
	 * Preserving the camera across the fullscreen transition is what the literal
	 * reading of "restore where you left off" asks for, and it is wrong. A
	 * camera framed inside a ~500px modal pane, replayed unchanged into a 1600px
	 * viewport, leaves the change the reviewer was reading pinned against the
	 * left edge with the rest of the screen empty — which is what it actually
	 * did, and it only showed up in a screenshot. Nothing in the state was lost;
	 * the framing had simply been computed for a viewport that no longer exists.
	 *
	 * So the selection is what persists, and the framing is re-derived from it
	 * on each side of the transition. Same change, centred in whatever viewport
	 * it is now being shown in.
	 */
	const reframe = useRef<() => void>(() => {})
	reframe.current = () => {
		const change = selectedId
			? ordered.find((candidate) => candidate.id === selectedId) ?? null
			: null
		if (change) jumpTo(change)
		else afterEditor?.zoomToFit({ animation: { duration: 0 } })
	}

	const framedMode = useRef(fullscreen)
	useEffect(() => {
		if (!afterEditor) return
		// Guarded on an actual mode flip: this must not fire on mount, where it
		// would race the initial "frame on everything that changed" pass below.
		if (framedMode.current === fullscreen) return
		framedMode.current = fullscreen
		// tldraw learns its new size from a resize observer, so the re-frame has
		// to land after that lands — zooming first would compute against the
		// viewport the stage just stopped having.
		const timer = window.setTimeout(() => reframe.current(), 140)
		return () => window.clearTimeout(timer)
	}, [fullscreen, afterEditor])

	/**
	 * Open already framed on what changed.
	 *
	 * `zoomToFit` frames the whole document, which on any real board means the
	 * changed Blocks end up a few pixels tall surrounded by everything that did
	 * not change — measured on the review fixture, whose instruction cards sit
	 * deliberately far out on the perimeter. Figma frames its Compare panes on
	 * the layer under review for the same reason. The camera lock carries this
	 * to the other pane, so both stay in step.
	 */
	const framedFor = useRef<string | null>(null)
	useEffect(() => {
		if (!comparison || !afterEditor || !beforeEditor) return
		const key = `${beforeId}:${comparison.total}`
		if (framedFor.current === key) return

		const boxes: Box[] = []
		for (const change of comparison.changes) {
			for (const [editor, anchor] of [
				[afterEditor, change.anchorAfter],
				[beforeEditor, change.anchorBefore],
			] as const) {
				if (!anchor) continue
				const bounds = editor.getShapePageBounds(anchor as TLShapeId)
				if (bounds) boxes.push(Box.From(bounds))
			}
		}
		framedFor.current = key
		if (boxes.length === 0) {
			afterEditor.zoomToFit({ animation: { duration: 0 } })
			return
		}
		// A little air, so a Block's outline mark is not flush to the pane edge.
		const frame = Box.Common(boxes).expandBy(120)
		afterEditor.zoomToBounds(frame, { animation: { duration: 0 } })
	}, [comparison, afterEditor, beforeEditor, beforeId])

	/** Canvas → table: clicking a shape selects the first row that anchors on it. */
	const pickByShape = useCallback(
		(shapeId: string) => {
			if (!comparison) return
			const hit = comparison.changes.find(
				(change) => change.anchorAfter === shapeId || change.anchorBefore === shapeId,
			)
			if (hit) setSelectedId(hit.id)
		},
		[comparison],
	)

	const beforeEntry = history.find((entry) => entry.id === beforeId) ?? null
	const tally = comparison?.tally
	/*
	 * Fullscreen is inherently a crossfade: there is one viewport and two
	 * versions to put in it. Entering from Side by side would otherwise leave
	 * the reviewer immersed in two half-width boards with a slider that does
	 * nothing, so the stage reads overlay while fullscreen regardless — and
	 * `mode` itself is untouched, which is what restores Side by side on return.
	 */
	const stageMode: CompareMode = fullscreen ? 'overlay' : mode
	const priorVersions = history.filter((entry) => !entry.isCurrent)

	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) onClose()
			}}
		>
			<Dialog.Portal container={themeRoot()}>
				<Dialog.Overlay className="systemsketch-compare__scrim" data-testid="compare-scrim" />
				<Dialog.Content
					asChild
					aria-describedby={undefined}
					aria-labelledby="compare-dialog-title"
					// Escape unwinds one layer at a time. Fullscreen is a place a
					// reviewer got to deliberately, and dropping them straight out
					// of the whole review from there would discard a selection and
					// a camera they spent time on — so the first Escape brings the
					// chrome back and only the second closes.
					onEscapeKeyDown={(event) => {
						if (!fullscreen) return
						event.preventDefault()
						setFullscreen(false)
					}}
				>
					<section
						className="systemsketch-compare"
						data-testid="compare-dialog"
						data-fullscreen={fullscreen || undefined}
					>
						<header className="systemsketch-compare__titlebar">
							<h2 id="compare-dialog-title">Compare changes</h2>
							{comparison ? (
								<p className="systemsketch-compare__summary" data-testid="compare-summary">
									{KIND_ORDER.map((kind) => {
										const count =
											(tally?.block[kind] ?? 0) +
											(tally?.port[kind] ?? 0) +
											(tally?.cable[kind] ?? 0) +
											(tally?.shape[kind] ?? 0)
										return (
											<span key={kind} className="systemsketch-compare__badge" data-kind={kind}>
												{count} {kind}
											</span>
										)
									})}
								</p>
							) : null}
							<Dialog.Close asChild>
								<button
									type="button"
									className="systemsketch-compare__close"
									data-testid="compare-close"
									aria-label="Close compare"
								>
									✕
								</button>
							</Dialog.Close>
						</header>

						<div className="systemsketch-compare__body">
							<aside className="systemsketch-compare__history" data-testid="compare-history">
								<h3>History</h3>
								<ul>
									{history.map((entry) => (
										<li key={entry.id}>
											<button
												type="button"
												data-testid={`compare-history-${entry.id}`}
												data-selected={
													(entry.isCurrent ? false : entry.id === beforeId) || undefined
												}
												data-current={entry.isCurrent || undefined}
												disabled={entry.isCurrent}
												onClick={() => setBeforeId(entry.id)}
											>
												<span className="systemsketch-compare__history-label">{entry.label}</span>
												<span className="systemsketch-compare__history-note">{entry.note}</span>
												{entry.isCurrent ? (
													<span className="systemsketch-compare__history-pin">after</span>
												) : entry.id === beforeId ? (
													<span className="systemsketch-compare__history-pin">before</span>
												) : null}
											</button>
										</li>
									))}
								</ul>
								<p className="systemsketch-compare__history-foot">
									Selecting an entry sets it as <strong>before</strong>. The current board is always{' '}
									<strong>after</strong>.
								</p>
							</aside>

							<div className="systemsketch-compare__stage" data-mode={stageMode}>
								{/*
								  * The persistent bar.
								  *
								  * It is the same element in both modes — that is the whole
								  * idea. The modal and the immersive canvas are not two
								  * screens with a jump between them; they are one screen
								  * whose chrome recedes, and this bar is what stays put
								  * while it does. Everything needed to answer "which change
								  * am I looking at, against which version" lives here, so
								  * going fullscreen never costs the reviewer their bearings.
								  */}
								<div className="systemsketch-compare__bar" data-testid="compare-bar">
									<button
										type="button"
										className="systemsketch-compare__bar-mode"
										data-testid={fullscreen ? 'compare-collapse' : 'compare-expand'}
										onClick={() => setFullscreen(!fullscreen)}
										title={
											fullscreen
												? 'Back to the review panel (Esc)'
												: 'Expand the boards to the whole screen'
										}
									>
										{fullscreen ? '↙ Back to modal' : '⤢ Fullscreen'}
									</button>

									{/* Which two versions — the question the bar must always
									  * be able to answer, so it is a control and not a caption. */}
									<label className="systemsketch-compare__bar-vs">
										<span>vs</span>
										<select
											data-testid="compare-bar-version"
											value={beforeId ?? ''}
											onChange={(event) => setBeforeId(event.target.value)}
										>
											{priorVersions.length === 0 ? (
												<option value="">no prior version</option>
											) : null}
											{priorVersions.map((entry) => (
												<option key={entry.id} value={entry.id}>
													{entry.label}
												</option>
											))}
										</select>
									</label>

									<div
										className="systemsketch-compare__stepper"
										role="group"
										aria-label="Step through the changes"
									>
										<button
											type="button"
											data-testid="compare-step-prev"
											aria-label="Previous change"
											disabled={ordered.length === 0}
											onClick={() => step(-1)}
										>
											‹
										</button>
										<span
											className="systemsketch-compare__stepper-count"
											data-testid="compare-step-count"
										>
											{ordered.length === 0
												? 'no changes'
												: selectedIndex < 0
													? `${ordered.length} changes`
													: `${selectedIndex + 1} of ${ordered.length} changes`}
										</span>
										<button
											type="button"
											data-testid="compare-step-next"
											aria-label="Next change"
											disabled={ordered.length === 0}
											onClick={() => step(1)}
										>
											›
										</button>
									</div>

									{/* The crossfade Zach singled out from canvas-first. It rides
									  * the bar rather than the panel below the boards, which is
									  * the only way it survives into fullscreen at all. */}
									{stageMode === 'overlay' ? (
										<label className="systemsketch-compare__blend">
											<span>Previous</span>
											<input
												type="range"
												min={0}
												max={100}
												step={1}
												value={blend}
												data-testid="compare-blend"
												aria-label="Crossfade previous to current"
												onChange={(event) => setBlend(Number(event.target.value))}
											/>
											<span>Current</span>
											<output data-testid="compare-blend-value">{blend}%</output>
										</label>
									) : null}
								</div>

								<div className="systemsketch-compare__panes" data-mode={stageMode}>
									<figure className="systemsketch-compare__pane" data-side="before">
										<figcaption>{beforeEntry?.label ?? 'Previous version'}</figcaption>
										<BoardRender
											snapshot={beforeSnapshot}
											side="before"
											highlight={highlightBefore}
											onEditorChange={setBeforeEditor}
											onShapePicked={pickByShape}
										/>
									</figure>
									<figure
										className="systemsketch-compare__pane"
										data-side="after"
										style={stageMode === 'overlay' ? { opacity: blend / 100 } : undefined}
									>
										<figcaption>Current version</figcaption>
										<BoardRender
											snapshot={afterSnapshot}
											side="after"
											highlight={highlightAfter}
											onEditorChange={setAfterEditor}
											onShapePicked={pickByShape}
										/>
									</figure>
								</div>

								<div className="systemsketch-compare__stagebar">
									<div className="systemsketch-compare__segmented" role="group" aria-label="View">
										<button
											type="button"
											data-testid="compare-mode-side-by-side"
											data-selected={mode === 'side-by-side' || undefined}
											onClick={() => setMode('side-by-side')}
										>
											Side by side
										</button>
										<button
											type="button"
											data-testid="compare-mode-overlay"
											data-selected={mode === 'overlay' || undefined}
											onClick={() => setMode('overlay')}
										>
											Overlay
										</button>
									</div>
								</div>
							</div>

							<aside className="systemsketch-compare__detail">
								{/*
								  * The app's own tab strip, not a lookalike.
								  *
								  * `.block-inspector__tabs` + `role="tab"` + an `.is-active`
								  * class is the pattern the Block, Branch and Connection
								  * inspectors already use, and it is the one Zach called out:
								  * *"Very important that we are consistent with what tabs look
								  * like."* Reusing the class means this strip inherits the
								  * `--ss-*` tokens and follows the SystemSketch, VS Code and
								  * Obsidian themes for free — a private copy would have to be
								  * re-themed by hand every time that one moved.
								  */}
								<nav className="block-inspector__tabs" role="tablist" aria-label="Change detail">
									<button
										type="button"
										role="tab"
										className={tab === 'properties' ? 'is-active' : ''}
										aria-selected={tab === 'properties'}
										data-testid="compare-tab-properties"
										onClick={() => setTab('properties')}
									>
										Properties
									</button>
									<button
										type="button"
										role="tab"
										className={tab === 'code' ? 'is-active' : ''}
										aria-selected={tab === 'code'}
										data-testid="compare-tab-code"
										onClick={() => setTab('code')}
									>
										Code
									</button>
								</nav>
								<div className="systemsketch-compare__detail-body">
									{problem ? (
										<p className="systemsketch-compare__problem" data-testid="compare-problem">
											{problem}
										</p>
									) : null}
									{tab === 'properties' ? (
										<>
											<label
												className="systemsketch-review__highlight-toggle"
												data-testid="compare-highlight-toggle"
											>
												<input
													type="checkbox"
													checked={gitHighlight}
													data-testid="compare-highlight-checkbox"
													onChange={(event) => setGitHighlight(event.target.checked)}
												/>
												Word-level diff highlighting
												<small>{gitHighlight ? 'on' : 'off · like Figma'}</small>
											</label>
											<PropertyTable
												changes={comparison?.changes ?? []}
												selectedId={selectedId}
												onSelect={setSelectedId}
												gitHighlight={gitHighlight}
											/>
										</>
									) : (
										<CodeView change={selected} />
									)}
								</div>
							</aside>
						</div>
					</section>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	)
}

/**
 * Portal into the ThemeRoot, not the body.
 *
 * The `--ss-*` tokens have a `:root` definition, but ThemeRoot also stamps a
 * derived inline palette for the active theme; a body portal would sit outside
 * it and render the modal in the default scheme while the app is in another.
 */
function themeRoot(): HTMLElement | undefined {
	if (typeof document === 'undefined') return undefined
	return (document.querySelector('.systemsketch-theme-root') as HTMLElement | null) ?? undefined
}
