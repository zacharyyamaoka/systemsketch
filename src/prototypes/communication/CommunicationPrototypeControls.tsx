import { useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'

import {
	COMMUNICATION_FAMILY_PAINT,
	activeCommunicationRegionId,
	applyActiveCommunicationRegion,
	applyCommunicationActionTrack,
	applyCommunicationComponentView,
	applyCommunicationFocus,
	applyCommunicationProjectionMode,
	applyCommunicationRouteStyle,
	applyCommunicationServiceTrack,
	collectCommunicationRelations,
	communicationProjection,
	isCommunicationPrototypeEnabled,
	isCommunicationPrototypeQueryEnabled,
	isShapeInCommunicationScope,
	phaseLabel,
	selectedCommunicationGroupKey,
	type CommunicationComponentView,
	type CommunicationProjectionMode,
	type CommunicationRouteStyle,
	type CommunicationActionTrack,
	type CommunicationServiceTrack,
} from './communicationProjection'
import { isAsyncRegionShape } from '../../asyncRegion/asyncRegionModel'
import './communication-prototype.css'

const MODES: readonly {
	id: CommunicationProjectionMode
	label: string
	hint: string
}[] = [
	{ id: 'wiring', label: 'Dataflow', hint: 'Canonical ports and values' },
	{ id: 'tagged', label: 'Tag edges', hint: 'Parsed protocol legs' },
	{ id: 'components', label: 'Components', hint: 'Collapsed relationships' },
]

const ROUTES: readonly { id: CommunicationRouteStyle; label: string }[] = [
	{ id: 'elbow', label: 'Elbow' },
	{ id: 'straight', label: 'Straight' },
]

const COMPONENT_VIEWS: readonly { id: CommunicationComponentView; label: string }[] = [
	{ id: 'simple', label: 'Simple' },
	{ id: 'port', label: 'Port' },
]

const SERVICE_TRACKS: readonly { id: CommunicationServiceTrack; label: string }[] = [
	{ id: 'request', label: 'Request' },
	{ id: 'response', label: 'Response' },
	{ id: 'shortest', label: 'Shortest' },
]

const ACTION_TRACKS: readonly { id: CommunicationActionTrack; label: string }[] = [
	{ id: 'goal', label: 'Goal' },
	{ id: 'feedback', label: 'Feedback' },
	{ id: 'result', label: 'Result' },
	{ id: 'shortest', label: 'Shortest' },
]

function titleCase(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function stopCanvasEvent(event: React.SyntheticEvent) {
	event.stopPropagation()
}

export function CommunicationPrototypeControls() {
	const editor = useEditor()
	const state = useValue(
		'communication prototype mode',
		() => communicationProjection.get(editor),
		[editor],
	)
	const summary = useValue(
		'communication prototype summary',
		() => collectCommunicationRelations(editor),
		[editor],
	)
	const selectionKey = useValue(
		'communication focus selection',
		() => [...editor.getSelectedShapeIds()].sort().join(','),
		[editor],
	)
	const selectedAsyncRegionId = useValue(
		'selected Async region',
		() => {
			const selected = editor.getOnlySelectedShape()
			return isAsyncRegionShape(selected) ? selected.id : null
		},
		[editor],
	)
	const legacyPrototype = isCommunicationPrototypeQueryEnabled()
	const enabled = isCommunicationPrototypeEnabled(editor)
	const activeRegionId = activeCommunicationRegionId(editor)
	const activeRegion = activeRegionId ? editor.getShape(activeRegionId) : null

	useEffect(() => {
		const selectedIds = [...editor.getSelectedShapeIds()]
		if (selectedAsyncRegionId) {
			if (state.activeRegionId !== selectedAsyncRegionId) {
				applyActiveCommunicationRegion(editor, selectedAsyncRegionId)
			}
			return
		}
		if (state.activeRegionId && !activeRegionId) {
			applyActiveCommunicationRegion(editor, null)
			return
		}
		if (legacyPrototype || !activeRegionId) return
		// Stay in the region while selecting its components or communication
		// edges. Another region or any outside shape closes it. An empty
		// selection alone is not enough: completing a new cable intentionally
		// clears selection, but did not leave the region.
		if (
			selectedIds.some((id) => !isShapeInCommunicationScope(editor, id))
		) {
			applyActiveCommunicationRegion(editor, null)
		}
	}, [editor, selectionKey, selectedAsyncRegionId, state.activeRegionId, activeRegionId, legacyPrototype])

	useEffect(() => {
		if (legacyPrototype || !activeRegionId) return
		const container = editor.getContainer()
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target
			if (target instanceof Element && target.closest('[data-systemsketch-chrome]')) return
			const bounds = editor.getShapePageBounds(activeRegionId)
			const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
			// WHY: selection can go empty after a successful wire, so dismissal is
			// spatial: interacting inside the region keeps its lens; pressing the
			// canvas beyond its frame leaves the region and closes the controls.
			if (!bounds?.containsPoint(point)) applyActiveCommunicationRegion(editor, null)
		}
		container.addEventListener('pointerdown', onPointerDown, { capture: true })
		return () => container.removeEventListener('pointerdown', onPointerDown, { capture: true })
	}, [editor, activeRegionId, legacyPrototype])

	useEffect(() => {
		if (!legacyPrototype) return
		// Re-entering a retained review starts at the canonical evidence without
		// touching the document: every projection choice lives in an EditorAtom.
		applyCommunicationProjectionMode(editor, 'wiring')
	}, [editor, legacyPrototype])

	useEffect(() => {
		if (!enabled || state.focusedGroupKey === null) return
		const selectedGroupKey = selectedCommunicationGroupKey(summary, editor.getSelectedShapeIds())
		if (selectedGroupKey === state.focusedGroupKey) return
		// WHY: communication focus is selection-scoped. Following tldraw's own
		// selection means canvas clicks, other shapes, marquee, and Escape all
		// dismiss the lens without a competing document-level click-away handler.
		applyCommunicationFocus(editor, null)
	}, [editor, enabled, selectionKey, state.focusedGroupKey, summary])

	if (!enabled) return null

	const relationCounts = summary.relations.reduce<Record<string, number>>((counts, relation) => {
		counts[relation.family] = (counts[relation.family] ?? 0) + 1
		return counts
	}, {})
	const focusedRelation = summary.relations.find((relation) => relation.groupKey === state.focusedGroupKey)
	const unresolvedEdgeCount = summary.neutralEdgeCount - summary.localValueEdgeCount

	return (
		<>
			<section
				className="communication-prototype-bar"
				aria-label={activeRegionId ? 'Async region communication controls' : 'Communication projection prototype'}
				data-testid="communication-prototype-controls"
				data-projection-mode={state.mode}
				data-active-region-id={activeRegionId ?? undefined}
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
				onWheel={stopCanvasEvent}
			>
				<div className="communication-prototype-bar__context">
					<span>{activeRegionId ? 'Async region' : 'Prototype'}</span>
					<strong>{activeRegion?.type === 'frame' ? activeRegion.props.name || 'Communication' : 'Communication'}</strong>
				</div>
				<div className="communication-prototype-tabs" role="tablist" aria-label="Board projection">
					{MODES.map((mode) => (
						<button
							key={mode.id}
							type="button"
							role="tab"
							aria-selected={state.mode === mode.id}
							data-testid={`communication-mode-${mode.id}`}
							title={mode.hint}
							onClick={() => applyCommunicationProjectionMode(editor, mode.id)}
						>
							{mode.label}
						</button>
					))}
				</div>
				{state.mode === 'components' ? (
					<>
						<div className="communication-prototype-routes" aria-label="Component presentation">
							<span>Card</span>
							{COMPONENT_VIEWS.map((view) => (
								<button
									key={view.id}
									type="button"
									aria-pressed={state.componentView === view.id}
									data-testid={`communication-components-view-${view.id}`}
									onClick={() => applyCommunicationComponentView(editor, view.id)}
								>
									{view.label}
								</button>
							))}
						</div>
						<div className="communication-prototype-routes" aria-label="Relationship routing">
							<span>Arrow</span>
							{ROUTES.map((route) => (
								<button
									key={route.id}
									type="button"
									aria-pressed={state.routeStyle === route.id}
									data-testid={`communication-route-${route.id}`}
									onClick={() => applyCommunicationRouteStyle(editor, route.id)}
								>
									{route.label}
								</button>
							))}
						</div>
						<div
							className="communication-prototype-track-selectors"
							aria-label="Representative protocol edges"
							title={state.routeStyle === 'straight' ? 'Representative edges apply to Elbow routing' : undefined}
						>
							<label>
								<span>Service edge</span>
								<select
									aria-label="Service representative edge"
									data-testid="communication-service-track"
									value={state.serviceTrack}
									disabled={state.routeStyle === 'straight'}
									onChange={(event) => applyCommunicationServiceTrack(
										editor,
										event.target.value as CommunicationServiceTrack,
									)}
								>
									{SERVICE_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
								</select>
							</label>
							<label>
								<span>Action edge</span>
								<select
									aria-label="Action representative edge"
									data-testid="communication-action-track"
									value={state.actionTrack}
									disabled={state.routeStyle === 'straight'}
									onChange={(event) => applyCommunicationActionTrack(
										editor,
										event.target.value as CommunicationActionTrack,
									)}
								>
									{ACTION_TRACKS.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
								</select>
							</label>
						</div>
					</>
				) : null}
			</section>

			<aside
				className="communication-prototype-status"
				data-testid="communication-prototype-status"
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
			>
				{focusedRelation && state.mode !== 'wiring' ? (
					<>
						<strong>{focusedRelation.displayId} focused · {focusedRelation.edgeCount} leg{focusedRelation.edgeCount === 1 ? '' : 's'}</strong>
						<span>{focusedRelation.family} · {focusedRelation.name}; unrelated edges are dimmed.</span>
						<button
							type="button"
							data-testid="communication-focus-clear"
							onClick={() => {
								applyCommunicationFocus(editor, null)
								editor.selectNone()
							}}
						>
							Clear focus
						</button>
					</>
				) : state.mode === 'wiring' ? (
					<>
						<strong>{summary.edgeCount} canonical wire{summary.edgeCount === 1 ? '' : 's'}</strong>
						<span>{activeRegionId ? 'New wires in this region default to Async.' : 'Ports and value nodes are unchanged.'}</span>
					</>
				) : state.mode === 'tagged' ? (
					<>
						<strong>{summary.taggedEdgeCount} protocol leg{summary.taggedEdgeCount === 1 ? '' : 's'} parsed</strong>
						<span>
							{summary.localValueEdgeCount} local value · {unresolvedEdgeCount} unresolved · {summary.issues.length} issue{summary.issues.length === 1 ? '' : 's'}
						</span>
					</>
				) : (
					<>
						<strong>{summary.relations.length} component relationships</strong>
						<span>
							{state.componentView === 'simple' ? 'Same Port-sized Simple cards' : 'Port cards'} ·{' '}
							{state.routeStyle === 'elbow'
								? `${titleCase(state.serviceTrack)} service · ${titleCase(state.actionTrack)} action tracks`
								: 'centre lines'} · {summary.issues.length} issue{summary.issues.length === 1 ? '' : 's'}
						</span>
					</>
				)}
			</aside>

			{state.mode !== 'wiring' ? (
				<div
					className="communication-prototype-legend"
					aria-label="Communication family legend"
					data-systemsketch-chrome
					onPointerDown={stopCanvasEvent}
				>
					{Object.entries(COMMUNICATION_FAMILY_PAINT).map(([family, paint]) => (
						<span key={family} style={{ '--family-ink': paint.ink } as React.CSSProperties}>
							<i>{paint.monogram}</i>{family}
							{state.mode === 'tagged' ? (
								<small>{summary.relations.filter((relation) => relation.family === family)
									.flatMap((relation) => phaseLabel(relation.phase)).length || relationCounts[family] || 0}</small>
							) : null}
						</span>
					))}
				</div>
			) : null}
		</>
	)
}
