/**
 * Item 6: the Tidy button promoted into a real Auto layout toggle.
 *
 * Both diagram views since the 2026-09-06 Process port — `arrangement`
 * gates the dnd drag lane's live model-reorder (`treeDndDrag.tsx`, resolved
 * by `dragListReorder.ts` for Tree and `processDragList.ts` for Process)
 * and `behaviorTreeProjection.ts`'s decision to apply free offsets at all.
 *
 * One primary button toggles the mode (purple/pressed when auto layout is
 * on); its chevron opens a small popover with the one-shot "Arrange now"
 * (today's Tidy — clear every free offset without changing the mode) beside
 * a switch that mirrors the same toggle, so the choice is reachable either
 * as a single click or from the menu.
 */
import { useEffect, useRef, useState } from 'react'

import type { BtArrangement } from '../behaviorTreeModel'
import './behavior-tree-inspector.css'

export function BtAutoLayoutControl({ arrangement, offsetCount, onSetArrangement, onArrangeNow }: {
	arrangement: BtArrangement
	offsetCount: number
	onSetArrangement(next: BtArrangement): void
	onArrangeNow(): void
}) {
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLDivElement>(null)
	const auto = arrangement === 'tidy'

	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		// CAPTURE phase, not bubble.
		//
		// WHY: this control now also lives inside the Drag Model Tuner, whose
		// panel calls `stopPropagation()` on its own pointerdown to keep the
		// gesture off the canvas — and React's synthetic `stopPropagation` calls
		// the native one, so a bubble-phase listener on `document` never sees a
		// click that lands anywhere in that panel. The popover would then stay
		// open over the knobs below it with no way to dismiss it by pointer.
		// Capture runs before the React root handler, so the dismissal is
		// independent of what any host panel does with the event.
		document.addEventListener('pointerdown', onPointerDown, true)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [open])

	return (
		<div className="bt-auto-layout" ref={rootRef}>
			<div className="bt-auto-layout__split">
				<button
					type="button"
					className="bt-auto-layout__toggle"
					aria-pressed={auto}
					data-testid="bt-auto-layout-toggle"
					title={auto ? 'Auto layout is on — dragging a node reorders the tree' : 'Auto layout is off — dragging a node sets a free position, same as before'}
					onClick={() => onSetArrangement(auto ? 'free' : 'tidy')}
				>
					<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
						<path d="M2 3h10M2 7h10M2 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
					<span>Auto layout</span>
				</button>
				<button
					type="button"
					className="bt-auto-layout__chevron"
					aria-label="Auto layout options"
					aria-expanded={open}
					aria-haspopup="menu"
					data-testid="bt-auto-layout-chevron"
					onClick={() => setOpen((value) => !value)}
				>
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
				</button>
			</div>
			{open ? (
				<div className="bt-auto-layout__menu" role="menu" data-testid="bt-auto-layout-menu">
					<button
						type="button"
						role="menuitem"
						className="bt-auto-layout__menuItem"
						disabled={offsetCount === 0}
						data-testid="bt-auto-layout-arrange-now"
						onClick={() => {
							onArrangeNow()
							setOpen(false)
						}}
					>
						Arrange now
					</button>
					<label className="bt-auto-layout__menuSwitch">
						<input
							type="checkbox"
							checked={auto}
							data-testid="bt-auto-layout-switch"
							onChange={(event) => onSetArrangement(event.target.checked ? 'tidy' : 'free')}
						/>
						Auto layout
					</label>
				</div>
			) : null}
		</div>
	)
}
