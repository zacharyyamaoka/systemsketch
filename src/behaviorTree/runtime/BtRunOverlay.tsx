/**
 * The run-mode surfaces that float OVER the canvas: per-node status paint
 * (Flowstate fills, MoveIt spinner on every RUNNING ancestor, ✓/✕ badges),
 * the purple mode frame + "MOCK RUN" tag that make run mode unmistakably not
 * editing, and the Flowstate-style transport strip docked above the region.
 *
 * WHY a front-layer overlay and not paint inside the region's own component:
 * the projected node cards are real child shapes and render ABOVE their
 * region, so a tint drawn in `BehaviorTreeCanvas` would sit underneath them.
 * This component mounts in the chrome's InFrontOfTheCanvas host, computes
 * each node's viewport rect from the region's own memoized projection, and
 * multiplies the sampled Flowstate swatches over the real cards — the same
 * treatment the runtime lab proved. Paint layers are pointer-inert; only the
 * transport takes clicks.
 */
import { Fragment, useMemo } from 'react'
import { useEditor, useValue, type Editor } from 'tldraw'

import { isBehaviorTreeShape, type BehaviorTreeShape } from '../behaviorTreeModel'
import { projectBehaviorTree } from '../behaviorTreeProjection'
import {
	backToLive,
	fmtRunTime,
	foldedStateAtCursor,
	getActiveBtRuns,
	paintForTree,
	pauseBtRun,
	resumeBtRun,
	scrubBtRunToTick,
	stepBtRunTick,
	stepBtRunTransition,
	stopBtRun,
	useBtRunVersion,
	type BtRunState,
} from './runStore'
import './bt-run-overlay.css'

const BADGE: Record<string, string> = { success: '✓', failure: '✕', halted: '−' }

function Spinner() {
	return (
		<svg viewBox="0 0 24 24" className="BtRun-spinner" aria-label="running">
			<g><circle cx="12" cy="12" r="7.9" /></g>
		</svg>
	)
}

function TransportStrip({ state }: { state: BtRunState }) {
	const editor = useEditor()
	const playing = state.phase === 'running'
	const label = state.phase === 'refused' ? 'cannot run'
		: state.phase === 'stale' ? 'tree changed — run stopped'
		: state.phase === 'finished' ? `run ${state.outcome?.toUpperCase()} · tick ${state.latestTick}`
		: null
	return (
		<div
			className="BtRun-strip"
			data-phase={state.phase}
			data-testid="bt-run-strip"
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			{state.phase === 'refused' || state.phase === 'stale' ? (
				<span className="BtRun-stripNotice" data-testid="bt-run-notice">
					{state.phase === 'refused' ? state.refusedReasons[0] : 'Tree changed — run stopped'}
				</span>
			) : (
				<>
					<button
						type="button"
						data-testid="bt-run-play"
						aria-label={playing ? 'Pause' : 'Resume'}
						disabled={state.phase === 'finished'}
						onClick={() => (playing ? pauseBtRun(state.regionId) : resumeBtRun(state.regionId))}
					>
						{playing ? '❚❚' : '▶'}
					</button>
					<button type="button" data-testid="bt-run-step" aria-label="Step one tick" disabled={Boolean(state.outcome)} onClick={() => stepBtRunTick(state.regionId)}>⇥</button>
					<button type="button" data-testid="bt-run-prev" aria-label="Step backward one transition" onClick={() => stepBtRunTransition(state.regionId, -1)}>«</button>
					<button type="button" data-testid="bt-run-next" aria-label="Step forward one transition" onClick={() => stepBtRunTransition(state.regionId, 1)}>»</button>
					<input
						type="range"
						className="BtRun-scrub"
						data-testid="bt-run-scrub"
						min={0}
						max={Math.max(0, state.latestTick)}
						value={state.cursor.tick}
						aria-label="Scrub the run by tick"
						onChange={(event) => scrubBtRunToTick(state.regionId, Number(event.target.value))}
					/>
					<span className="BtRun-clock" data-testid="bt-run-clock">
						tick {state.cursor.tick} · {fmtRunTime((state.log[state.cursor.index]?.at ?? state.cursor.tick * state.tickMs))}
					</span>
					{label ? <span className="BtRun-outcome" data-outcome={state.outcome ?? ''} data-testid="bt-run-outcome">{label}</span> : null}
					{!state.live ? (
						<button type="button" className="BtRun-live" data-testid="bt-run-live" onClick={() => backToLive(state.regionId)}>⏵ live</button>
					) : null}
				</>
			)}
			<button
				type="button"
				className="BtRun-exit"
				data-testid="bt-run-exit"
				aria-label="Exit run mode"
				onClick={() => {
					stopBtRun(state.regionId)
					// Leaving run mode returns attention to the region itself.
					const region = editor.getShape(state.regionId)
					if (region) editor.select(region.id)
				}}
			>✕</button>
		</div>
	)
}

function RegionRunOverlay({ editor, state }: { editor: Editor; state: BtRunState }) {
	const region = useValue(
		'bt run region',
		() => {
			const shape = editor.getShape(state.regionId)
			return isBehaviorTreeShape(shape) ? shape : null
		},
		[editor, state.regionId],
	)
	const frame = useValue(
		'bt run region viewport frame',
		() => {
			const shape = editor.getShape(state.regionId)
			if (!isBehaviorTreeShape(shape)) return null
			const bounds = editor.getShapePageBounds(shape.id)
			if (!bounds) return null
			const min = editor.pageToViewport({ x: bounds.minX, y: bounds.minY })
			return { x: min.x, y: min.y, zoom: editor.getZoomLevel() }
		},
		[editor, state.regionId],
	)
	const projection = useMemo(
		() => (region ? projectBehaviorTree(region.props) : null),
		[region],
	)
	const paint = useMemo(() => {
		if (!region) return null
		const folded = foldedStateAtCursor(state)
		return { folded, byPath: paintForTree(state, folded, region.props.treeId || state.treeId) }
		// The log array identity is stable while ticking; cursor/log length are
		// the actual inputs of the fold.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [region, state, state.cursor.index, state.cursor.tick, state.log.length, state.phase])
	if (!region || !frame || !projection || !paint) return null

	const runActive = state.log.length > 0 && state.cursor.index >= 0
	return (
		<div
			className="BtRun-overlay"
			data-testid={`bt-run-overlay-${state.regionId}`}
			style={{ transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})` }}
		>
			<div className="BtRun-frame" data-phase={state.phase} style={{ width: region.props.w, height: region.props.h }}>
				<span className="BtRun-tag" data-testid="bt-run-tag">
					{state.phase === 'stale' ? 'MOCK RUN · STALE' : 'MOCK RUN · document untouched'}
				</span>
			</div>
			{[...projection.nodeRects].map(([path, rect]) => {
				const held = paint.byPath.get(path)
				const status = held?.status ?? (runActive ? 'pending' : null)
				if (!status) return <Fragment key={path} />
				return (
					<div
						key={path}
						className="BtRun-node"
						data-status={status}
						data-path={path}
						style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
					>
						<span className="BtRun-fill" />
						<span className="BtRun-badge">
							{status === 'running' ? <Spinner /> : BADGE[status] ?? ''}
						</span>
					</div>
				)
			})}
			<div className="BtRun-stripSlot" style={{ left: region.props.w / 2, top: 0 }}>
				{/* The strip un-scales itself so its text stays readable at any zoom. */}
				<div style={{ transform: `scale(${1 / frame.zoom})` }}>
					<TransportStrip state={state} />
				</div>
			</div>
		</div>
	)
}

/** Every active run's overlay; mounted once in the chrome's front layer. */
export function BtRunOverlays() {
	const editor = useEditor()
	useBtRunVersion()
	const runs = getActiveBtRuns()
	if (runs.length === 0) return null
	return (
		<>
			{runs.map((state) => (
				<RegionRunOverlay key={`${String(state.regionId)}:${state.runId}`} editor={editor} state={state} />
			))}
		</>
	)
}
