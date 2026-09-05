import { useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'

import {
	COMMUNICATION_FAMILY_PAINT,
	applyCommunicationComponentView,
	applyCommunicationFocus,
	applyCommunicationProjectionMode,
	applyCommunicationRouteStyle,
	collectCommunicationRelations,
	communicationProjection,
	isCommunicationPrototypeEnabled,
	phaseLabel,
	type CommunicationComponentView,
	type CommunicationProjectionMode,
	type CommunicationRouteStyle,
} from './communicationProjection'
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
	const enabled = isCommunicationPrototypeEnabled()

	useEffect(() => {
		if (!enabled) return
		// Re-entering a retained review starts at the canonical evidence without
		// touching the document: every projection choice lives in an EditorAtom.
		applyCommunicationProjectionMode(editor, 'wiring')
	}, [editor, enabled])

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
				aria-label="Communication projection prototype"
				data-testid="communication-prototype-controls"
				data-projection-mode={state.mode}
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
				onWheel={stopCanvasEvent}
			>
				<div className="communication-prototype-bar__context">
					<span>Prototype</span>
					<strong>Communication</strong>
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
							onClick={() => applyCommunicationFocus(editor, null)}
						>
							Clear focus
						</button>
					</>
				) : state.mode === 'wiring' ? (
					<>
						<strong>{summary.edgeCount} canonical data edges</strong>
						<span>Ports and value nodes are unchanged.</span>
					</>
				) : state.mode === 'tagged' ? (
					<>
						<strong>{summary.taggedEdgeCount} protocol legs parsed</strong>
						<span>
							{summary.localValueEdgeCount} local value · {unresolvedEdgeCount} unresolved · {summary.issues.length} issue{summary.issues.length === 1 ? '' : 's'}
						</span>
					</>
				) : (
					<>
						<strong>{summary.relations.length} component relationships</strong>
						<span>
							{state.componentView === 'simple' ? 'Same Port-sized Simple cards' : 'Port cards'} ·{' '}
							{state.routeStyle === 'elbow' ? 'canonical tracks' : 'centre lines'} · {summary.issues.length} issue{summary.issues.length === 1 ? '' : 's'}
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
