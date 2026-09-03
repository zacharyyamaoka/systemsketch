/**
 * Draw every invisible hit region on top of the board, in red.
 *
 * The regions that decide "did I hit that" are the ones nobody can see, so the
 * only way to have an opinion about them is to paint them. This is a
 * development instrument, not a feature: it is gated on `?hitareas=1` and on a
 * dev build, and it paints from the SAME functions the hit tests call — a
 * region drawn here that disagrees with the behaviour would be a lie, so it is
 * wired to the source rather than re-derived.
 *
 * Turn it on with `?hitareas=1` on any profile, or toggle it live with `⇧H`.
 */
import { useCallback, useEffect, useState } from 'react'
import { useEditor, useQuickReactor } from 'tldraw'

import { CONNECTION_PORT_MAGNET_RADIUS, getLiveBlockPorts } from '../connections/blockPorts'
import { portSnapPageUnits, reconnectPageUnits } from '../connections/connectionHit'
import { isBlockShape } from '../blockModel'
import './hit-area-overlay.css'

export const HIT_AREA_QUERY_KEY = 'hitareas'

interface PaintedRegion {
	key: string
	kind: 'port-snap' | 'port-reconnect' | 'add-zone'
	label: string
	/** Viewport-space rectangle, in real pixels. */
	x: number
	y: number
	w: number
	h: number
	round?: boolean
}

export function hitAreasRequested(search: string): boolean {
	return new URLSearchParams(search).get(HIT_AREA_QUERY_KEY) === '1'
}

/**
 * Compiled out of a released build.
 *
 * A debug overlay that anyone can turn on with a URL parameter is a liability in
 * a shipped app, and a constant `false` lets the bundler drop the whole
 * component. Preview runs from the dev server, which is where this is wanted.
 */
const AVAILABLE = import.meta.env.DEV

export function HitAreaOverlay() {
	const editor = useEditor()
	const [on, setOn] = useState(() => AVAILABLE && hitAreasRequested(window.location.search))
	const [regions, setRegions] = useState<PaintedRegion[]>([])

	// Shift+H, so the regions can be compared against the same board with and
	// without them without reloading and losing the shapes under test.
	useEffect(() => {
		if (!AVAILABLE) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'H' || !event.shiftKey) return
			const target = event.target
			if (target instanceof HTMLElement
				&& (target.isContentEditable || /INPUT|TEXTAREA/.test(target.tagName))) return
			setOn((current) => !current)
		}
		const document_ = editor.getContainer().ownerDocument
		document_.addEventListener('keydown', onKeyDown)
		return () => document_.removeEventListener('keydown', onKeyDown)
	}, [editor])

	const collect = useCallback((): PaintedRegion[] => {
		const zoom = editor.getZoomLevel()
		const painted: PaintedRegion[] = []
		const toViewport = (x: number, y: number) => editor.pageToViewport({ x, y })

		// --- every visible port's drop-snap and reconnect radius ------------
		const snap = portSnapPageUnits(zoom) * zoom
		const reconnect = reconnectPageUnits(zoom) * zoom
		const magnet = Math.max(snap, CONNECTION_PORT_MAGNET_RADIUS)
		for (const shape of editor.getCurrentPageShapes()) {
			if (!isBlockShape(shape) || editor.isShapeHidden(shape)) continue
			const transform = editor.getShapePageTransform(shape.id)
			for (const port of getLiveBlockPorts(editor, shape)) {
				if (port.hidden) continue
				const page = transform.applyToPoint(port)
				const centre = toViewport(page.x, page.y)
				painted.push({
					key: `snap:${shape.id}:${port.id}`,
					kind: 'port-snap',
					label: 'drop snap',
					x: centre.x - magnet,
					y: centre.y - magnet,
					w: magnet * 2,
					h: magnet * 2,
					round: true,
				})
				painted.push({
					key: `reconnect:${shape.id}:${port.id}`,
					kind: 'port-reconnect',
					label: 'reconnect',
					x: centre.x - reconnect,
					y: centre.y - reconnect,
					w: reconnect * 2,
					h: reconnect * 2,
					round: true,
				})
			}
		}

		// --- the port add gutters, read straight off the DOM ----------------
		// These are painted elements, so their region is their own box; reading
		// it rather than recomputing keeps this honest if the layout changes.
		const container = editor.getContainer().getBoundingClientRect()
		for (const zone of editor.getContainer()
			.querySelectorAll<HTMLElement>('[data-testid^="block-port-add-zone-"]')) {
			const rect = zone.getBoundingClientRect()
			painted.push({
				key: `add:${zone.dataset.testid}`,
				kind: 'add-zone',
				label: 'add port',
				x: rect.x - container.x,
				y: rect.y - container.y,
				w: rect.width,
				h: rect.height,
			})
		}

		return painted
	}, [editor])

	useQuickReactor('hit area overlay', () => {
		if (!on) return
		// Read the signals that move any of these before touching state.
		editor.getSelectedShapeIds()
		editor.getCamera()
		editor.getCurrentPageShapeIds()
		setRegions(collect())
	}, [editor, on, collect])

	// The DOM-derived gutters do not live in a signal, so follow the pointer too.
	useEffect(() => {
		if (!on) return
		const container = editor.getContainer()
		const onPointerMove = () => setRegions(collect())
		container.addEventListener('pointermove', onPointerMove)
		return () => container.removeEventListener('pointermove', onPointerMove)
	}, [on, collect, editor])

	if (!AVAILABLE || !on) return null

	return (
		<div className="systemsketch-hit-areas" data-testid="hit-area-overlay" aria-hidden="true">
			{regions.map((region) => (
				<div
					key={region.key}
					className="systemsketch-hit-area"
					data-kind={region.kind}
					data-round={region.round ? 'true' : undefined}
					style={{
						transform: `translate(${region.x}px, ${region.y}px)`,
						width: region.w,
						height: region.h,
					}}
				>
					<span>{region.label}</span>
				</div>
			))}
			<div className="systemsketch-hit-areas__legend">
				<b>Hit areas</b>
				<i data-kind="port-snap" /> port drop snap
				<i data-kind="port-reconnect" /> reconnect radius
				<i data-kind="add-zone" /> add-port gutter
				<em>⇧H to toggle</em>
			</div>
		</div>
	)
}
