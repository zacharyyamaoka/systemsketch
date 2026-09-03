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
import { discoverHistory, loadEntrySnapshot, type HistoryEntry } from './compareSource'
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
				>
					<section className="systemsketch-compare" data-testid="compare-dialog">
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

							<div className="systemsketch-compare__stage" data-mode={mode}>
								<div className="systemsketch-compare__panes" data-mode={mode}>
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
										style={mode === 'overlay' ? { opacity: blend / 100 } : undefined}
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
									{mode === 'overlay' ? (
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
							</div>

							<aside className="systemsketch-compare__detail">
								<div className="systemsketch-compare__tabs" role="tablist">
									<button
										type="button"
										role="tab"
										aria-selected={tab === 'code'}
										data-testid="compare-tab-code"
										data-selected={tab === 'code' || undefined}
										onClick={() => setTab('code')}
									>
										Code
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={tab === 'properties'}
										data-testid="compare-tab-properties"
										data-selected={tab === 'properties' || undefined}
										onClick={() => setTab('properties')}
									>
										Properties
									</button>
								</div>
								<div className="systemsketch-compare__detail-body">
									{problem ? (
										<p className="systemsketch-compare__problem" data-testid="compare-problem">
											{problem}
										</p>
									) : null}
									{tab === 'properties' ? (
										<PropertyTable
											changes={comparison?.changes ?? []}
											selectedId={selectedId}
											onSelect={setSelectedId}
										/>
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
