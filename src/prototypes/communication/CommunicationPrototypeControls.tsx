import { useEffect, useState } from 'react'
import { useEditor, useValue } from 'tldraw'

import {
	COMMUNICATION_FAMILY_PAINT,
	activeCommunicationRegionId,
	applyActiveCommunicationRegion,
	applyCommunicationCableStyle,
	applyCommunicationComponentView,
	applyCommunicationFocus,
	applyCommunicationLens,
	applyCommunicationCableRouting,
	communicationCableRouting,
	collectCommunicationRelations,
	communicationProjection,
	isCommunicationPrototypeEnabled,
	isCommunicationPrototypeQueryEnabled,
	isShapeInCommunicationScope,
	phaseLabel,
	selectedCommunicationGroupKey,
	type CommunicationCableStyle,
	type CommunicationComponentView,
	type CommunicationLens,
} from './communicationProjection'
import { isAsyncRegionShape } from '../../asyncRegion/asyncRegionModel'
import type { ConnectionRoutingKind } from '../../blocks/connections/connectionModel'
import {
	COMMUNICATION_DRAW_FAMILIES,
	COMMUNICATION_ROLE_LABELS,
	renameCommunicationRelation,
	type CommunicationDrawFamily,
} from './communicationAuthoring'
import {
	COMMUNICATION_LINK_TOOL_ID,
	startCommunicationLinkDraw,
	stopCommunicationLinkDraw,
} from './CommunicationLinkTool'
import { CommunicationLinkPreview } from './CommunicationLinkPreview'
import './communication-prototype.css'

const LENSES: readonly { id: CommunicationLens; label: string; hint: string }[] = [
	{ id: 'dataflow', label: 'Dataflow', hint: 'The signature: ports on the left and right lanes' },
	{ id: 'communication', label: 'Communication', hint: 'The topology: ports on any of the four edges' },
]

const COMPONENT_VIEWS: readonly { id: CommunicationComponentView; label: string; hint: string }[] = [
	{ id: 'simple', label: 'S', hint: 'Simple — the card and its name' },
	{ id: 'port', label: 'P', hint: 'Port — the card and its ports' },
	{ id: 'expanded', label: 'E', hint: 'Expanded — the card opened up' },
]

const CABLE_STYLES: readonly { id: CommunicationCableStyle; label: string; hint: string }[] = [
	{ id: 'data', label: 'Data', hint: 'Every canonical cable, in grey' },
	{ id: 'split', label: 'Split', hint: 'Each protocol leg painted separately and tagged' },
	{ id: 'summary', label: 'Summary', hint: 'One cable per relationship, riding its initiating leg' },
]

const ROUTES: readonly { id: ConnectionRoutingKind; label: string; hint: string }[] = [
	{ id: 'elbow', label: 'Elbow', hint: 'Right-angled runs' },
	{ id: 'curved', label: 'Curve', hint: 'A single swept curve' },
	{ id: 'straight', label: 'Straight', hint: 'A direct line, port to port' },
]

const DRAW_FAMILIES: readonly { id: CommunicationDrawFamily; label: string; hint: string }[] = [
	{ id: 'stream', label: 'Stream', hint: 'Pub/sub: publisher → subscriber' },
	{ id: 'service', label: 'Service', hint: 'Client → server; request and response' },
	{ id: 'action', label: 'Action', hint: 'Client → server; goal, feedback and result' },
]

function cardLabel(view: CommunicationComponentView): string {
	return view === 'simple' ? 'Simple' : view === 'port' ? 'Port' : 'Expanded'
}

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
	const activeToolId = useValue('communication active tool', () => editor.getCurrentToolId(), [editor])
	const drawingFamily = useValue(
		'communication draw family',
		() => (editor.getCurrentToolId() === COMMUNICATION_LINK_TOOL_ID
			? communicationProjection.get(editor).drawFamily
			: null),
		[editor],
	)
	// Read off the cables themselves, so the bar can never disagree with what a
	// single cable's own selection menu says its shape is. Mixed reads as none.
	const cableRouting = useValue(
		'communication cable routing',
		() => communicationCableRouting(editor),
		[editor],
	)
	const [renameDraft, setRenameDraft] = useState<string | null>(null)
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
		applyCommunicationLens(editor, 'dataflow')
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

	useEffect(() => {
		// WHY: the tool is an affordance of this lens, so it must not outlive it.
		// Leaving Components mode, or the region closing under it, would otherwise
		// strand a cross-hair cursor that draws protocol legs on an ordinary board.
		if (activeToolId !== COMMUNICATION_LINK_TOOL_ID) return
		if (!enabled || state.lens !== 'communication') stopCommunicationLinkDraw(editor)
	}, [editor, activeToolId, enabled, state.lens])

	useEffect(() => {
		setRenameDraft(null)
	}, [state.focusedGroupKey])

	if (!enabled) return null

	const relationCounts = summary.relations.reduce<Record<string, number>>((counts, relation) => {
		counts[relation.family] = (counts[relation.family] ?? 0) + 1
		return counts
	}, {})
	const focusedRelation = summary.relations.find((relation) => relation.groupKey === state.focusedGroupKey)
	const unresolvedEdgeCount = summary.neutralEdgeCount - summary.localValueEdgeCount

	const drawHint = drawingFamily ? COMMUNICATION_ROLE_LABELS[drawingFamily] : null

	return (
		<>
			<CommunicationLinkPreview />
			<section
				className="communication-prototype-bar"
				aria-label={activeRegionId ? 'Async region communication controls' : 'Communication projection prototype'}
				data-testid="communication-prototype-controls"
				data-projection-lens={state.lens}
				data-projection-cables={state.cableStyle}
				data-projection-card={state.componentView}
				data-active-region-id={activeRegionId ?? undefined}
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
				onWheel={stopCanvasEvent}
			>
				<div className="communication-prototype-bar__context">
					<span>{activeRegionId ? 'Async region' : 'Prototype'}</span>
					<strong>{activeRegion?.type === 'frame' ? activeRegion.props.name || 'Communication' : 'Communication'}</strong>
				</div>
				<div className="communication-prototype-tabs" role="tablist" aria-label="Region lens">
					{LENSES.map((lens) => (
						<button
							key={lens.id}
							type="button"
							role="tab"
							aria-selected={state.lens === lens.id}
							data-testid={`communication-lens-${lens.id}`}
							title={lens.hint}
							onClick={() => applyCommunicationLens(editor, lens.id)}
						>
							{lens.label}
						</button>
					))}
				</div>
				{/* Card face and cable style are Dataflow's to choose. The
				    communication lens is fixed at Simple + Summary. */}
				{state.lens === 'dataflow' ? (
				<>
				<div className="communication-prototype-routes" aria-label="Component view">
					<span>Card</span>
					{COMPONENT_VIEWS.map((view) => (
						<button
							key={view.id}
							type="button"
							aria-pressed={state.componentView === view.id}
							data-testid={`communication-card-${view.id}`}
							title={view.hint}
							onClick={() => applyCommunicationComponentView(editor, view.id)}
						>
							{view.label}
						</button>
					))}
				</div>
				<div className="communication-prototype-routes" aria-label="Cable style">
					<span>Cables</span>
					{CABLE_STYLES.map((style) => (
						<button
							key={style.id}
							type="button"
							aria-pressed={state.cableStyle === style.id}
							data-testid={`communication-cables-${style.id}`}
							title={style.hint}
							onClick={() => applyCommunicationCableStyle(editor, style.id)}
						>
							{style.label}
						</button>
					))}
				</div>
				</>
				) : null}
				<div className="communication-prototype-routes" aria-label="Cable shape">
					<span>Arrow</span>
					{ROUTES.map((route) => (
						<button
							key={route.id}
							type="button"
							aria-pressed={cableRouting === route.id}
							data-testid={`communication-route-${route.id}`}
							title={`${route.hint} — sets every cable in this region`}
							onClick={() => applyCommunicationCableRouting(editor, route.id)}
						>
							{route.label}
						</button>
					))}
				</div>
				{state.lens === 'communication' ? (
					<div className="communication-prototype-draw" aria-label="Draw a communication relationship">
						<span>Draw</span>
						{DRAW_FAMILIES.map((family) => {
							const armed = drawingFamily === family.id
							const paint = COMMUNICATION_FAMILY_PAINT[family.id]
							return (
								<button
									key={family.id}
									type="button"
									aria-pressed={armed}
									data-testid={`communication-draw-${family.id}`}
									title={family.hint}
									style={{ '--family-ink': paint.ink, '--family-soft': paint.soft } as React.CSSProperties}
									onClick={() => (armed
										? stopCommunicationLinkDraw(editor)
										: startCommunicationLinkDraw(editor, family.id))}
								>
									<i aria-hidden="true">{paint.monogram}</i>{family.label}
								</button>
							)
						})}
					</div>
				) : null}
			</section>

			<aside
				className="communication-prototype-status"
				data-testid="communication-prototype-status"
				data-systemsketch-chrome
				onPointerDown={stopCanvasEvent}
			>
				{focusedRelation && state.cableStyle !== 'data' ? (
					<>
						<strong>{focusedRelation.displayId} focused · {focusedRelation.edgeCount} leg{focusedRelation.edgeCount === 1 ? '' : 's'}</strong>
						<span>{focusedRelation.family} · {focusedRelation.name}; unrelated edges are dimmed.</span>
						<form
							className="communication-prototype-rename"
							data-testid="communication-rename-form"
							onSubmit={(event) => {
								event.preventDefault()
								if (renameDraft === null) return
								// The name lives nowhere but the port names, so renaming the
								// relationship IS renaming its ports — one write, no index.
								renameCommunicationRelation(editor, focusedRelation, renameDraft)
								setRenameDraft(null)
							}}
						>
							<label>
								<span>Name</span>
								<input
									type="text"
									data-testid="communication-rename-input"
									value={renameDraft ?? focusedRelation.name}
									onChange={(event) => setRenameDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === 'Escape') setRenameDraft(null)
										event.stopPropagation()
									}}
								/>
							</label>
							<button type="submit" data-testid="communication-rename-submit">Rename</button>
						</form>
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
				) : (
					<>
						<strong>
							{state.cableStyle === 'data'
								? `${summary.edgeCount} canonical wire${summary.edgeCount === 1 ? '' : 's'}`
								: state.cableStyle === 'split'
									? `${summary.taggedEdgeCount} protocol leg${summary.taggedEdgeCount === 1 ? '' : 's'} parsed`
									: `${summary.relations.length} relationship${summary.relations.length === 1 ? '' : 's'}`}
						</strong>
						<span>
							{titleCase(state.lens)} · {cardLabel(state.componentView)} cards
							{state.cableStyle === 'summary' ? ' · summary rides the initiating leg' : ''}
							{state.cableStyle === 'data' && activeRegionId
								? ' · new wires default to Async'
								: ''}
						</span>
						{state.cableStyle !== 'data' ? (
							<span>
								{summary.localValueEdgeCount} local value · {unresolvedEdgeCount} unresolved ·{' '}
								{summary.issues.length} issue{summary.issues.length === 1 ? '' : 's'}
							</span>
						) : null}
					</>
				)}
			</aside>

			{state.cableStyle !== 'data' ? (
				<div
					className="communication-prototype-legend"
					aria-label="Communication family legend"
					data-systemsketch-chrome
					onPointerDown={stopCanvasEvent}
				>
					{Object.entries(COMMUNICATION_FAMILY_PAINT).map(([family, paint]) => (
						<span key={family} style={{ '--family-ink': paint.ink } as React.CSSProperties}>
							<i>{paint.monogram}</i>{family}
							{state.cableStyle === 'split' ? (
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
