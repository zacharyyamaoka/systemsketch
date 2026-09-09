/**
 * RISK: with no virtualisation the picker's own Icons tab put all 1,818
 * Lucide cells (and, unfiltered, the Emoji tab's 1,914 across nine groups)
 * straight into the DOM on open — measured 473ms to first paint / 11,065
 * nodes on the dev server, against the proposal's own ~100ms bar. Every
 * `.BlockIconPicker-grid` is a fixed 12-column grid of equal-height rows, so
 * this renders only the rows intersecting the scroll viewport (± overscan)
 * and holds the rest of the scroll height with top/bottom spacers — the
 * standard technique, hand-rolled rather than a new dependency per this
 * repo's own "no new dependency" call on this finding.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export const GRID_COLUMNS = 12
const OVERSCAN_ROWS = 3
/** Rows rendered before the first real measurement lands — see the WHY below. */
const INITIAL_ROWS = 6

interface GridRange {
	start: number
	end: number
	topPad: number
	bottomPad: number
}

function initialRange(itemCount: number): GridRange {
	return { start: 0, end: Math.min(itemCount, GRID_COLUMNS * INITIAL_ROWS), topPad: 0, bottomPad: 0 }
}

/**
 * One windowed grid. Each call owns its own scroll/resize listeners on its
 * nearest `.BlockIconPicker-body` ancestor (found via `closest`, not a prop
 * threaded down from the popover root) so `IconsGrid`, `EmojiGrid`'s
 * filtered list, and each of its per-group grids in the unfiltered browse
 * view can all window independently off the one shared scroll container.
 *
 * WHY a conservative `INITIAL_ROWS` guess instead of measuring before the
 * first render: React has nothing to measure on the very first render (the
 * grid element doesn't exist in the DOM yet). Rendering a small fixed guess
 * keeps that first commit cheap regardless, and `useLayoutEffect` corrects
 * it against the real row height/scroll position before the browser paints
 * — so the guess itself is never what the user sees, only what the harness
 * would catch counting DOM nodes mid-commit.
 */
export function useWindowedGrid(itemCount: number) {
	const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null)
	const [range, setRange] = useState<GridRange>(() => initialRange(itemCount))

	const recompute = useCallback(() => {
		if (!gridEl) return
		const host = gridEl.closest<HTMLElement>('.BlockIconPicker-body')
		if (!host) return
		const style = getComputedStyle(gridEl)
		const gap = parseFloat(style.rowGap || style.gap || '0') || 0
		const columnWidth = (gridEl.clientWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS
		const rowHeight = columnWidth + gap
		if (!(rowHeight > 0) || itemCount === 0) {
			setRange(initialRange(itemCount))
			return
		}
		const totalRows = Math.ceil(itemCount / GRID_COLUMNS)
		// Grid's own top within the scroll container's content, in scroll
		// coordinates — not `offsetTop` (unreliable across offsetParents when
		// a sibling section like Recent sits above this grid, not an ancestor).
		const gridTop = gridEl.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop
		const viewTop = Math.max(0, host.scrollTop - gridTop)
		const viewBottom = Math.max(0, host.scrollTop + host.clientHeight - gridTop)
		const firstRow = Math.max(0, Math.floor(viewTop / rowHeight) - OVERSCAN_ROWS)
		const lastRow = Math.min(totalRows, Math.ceil(viewBottom / rowHeight) + OVERSCAN_ROWS)
		setRange({
			start: firstRow * GRID_COLUMNS,
			end: Math.min(itemCount, lastRow * GRID_COLUMNS),
			topPad: firstRow * rowHeight,
			bottomPad: Math.max(0, (totalRows - lastRow) * rowHeight),
		})
	}, [gridEl, itemCount])

	// Runs before paint so the `INITIAL_ROWS` guess above is corrected — not
	// flashed — the first time this grid mounts or its item count changes
	// (a new filter query, a tab switch onto a freshly-measured grid).
	useLayoutEffect(() => {
		recompute()
	}, [recompute])

	useEffect(() => {
		if (!gridEl) return
		const host = gridEl.closest<HTMLElement>('.BlockIconPicker-body')
		if (!host) return
		let frame = 0
		const onScrollOrResize = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(recompute)
		}
		host.addEventListener('scroll', onScrollOrResize, { passive: true })
		const observer = new ResizeObserver(onScrollOrResize)
		observer.observe(host)
		observer.observe(gridEl)
		return () => {
			cancelAnimationFrame(frame)
			host.removeEventListener('scroll', onScrollOrResize)
			observer.disconnect()
		}
	}, [gridEl, recompute])

	return { gridRef: setGridEl, ...range }
}
