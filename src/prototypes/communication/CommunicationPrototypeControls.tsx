import { useEffect } from 'react'
import { useEditor, useValue } from 'tldraw'

import {
	COMMUNICATION_FAMILY_PAINT,
	applyCommunicationProjectionMode,
	applyCommunicationRouteStyle,
	collectCommunicationRelations,
	communicationProjection,
	isCommunicationPrototypeEnabled,
	phaseLabel,
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
	{ id: 'curved', label: 'Curved' },
	{ id: 'straight', label: 'Straight' },
	{ id: 'laser', label: 'Laser' },
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
		// A retained review may have autosaved while the Components lens was on.
		// Re-entering the prototype always starts from its canonical evidence.
		applyCommunicationProjectionMode(editor, 'wiring')
	}, [editor, enabled])

	if (!enabled) return null

	const relationCounts = summary.relations.reduce<Record<string, number>>((counts, relation) => {
		counts[relation.family] = (counts[relation.family] ?? 0) + 1
		return counts
	}, {})

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
				) : null}
			</section>

			<aside
				className="communication-prototype-status"
				data-testid="communication-prototype-status"
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
			>
				{state.mode === 'wiring' ? (
					<>
						<strong>{summary.edgeCount} canonical data edges</strong>
						<span>Ports and value nodes are unchanged.</span>
					</>
				) : state.mode === 'tagged' ? (
					<>
						<strong>{summary.taggedEdgeCount} protocol legs parsed</strong>
						<span>{summary.localValueEdgeCount} local value edge{summary.localValueEdgeCount === 1 ? '' : 's'} left neutral.</span>
					</>
				) : (
					<>
						<strong>{summary.relations.length} component relationships</strong>
						<span>{summary.taggedEdgeCount} legs collapsed; value nodes hidden.</span>
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
