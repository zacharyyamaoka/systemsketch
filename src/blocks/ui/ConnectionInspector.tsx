/**
 * The inspector lens for a selected cable.
 *
 * The FR asks for "full control from inspector panel for blocks **and edges**",
 * and until now a selected cable had no home in the right dock at all: routing
 * lived only in the right-click menu, which is a gesture, not a surface you can
 * read the current state off. This is the surface — deliberately the same flat
 * band grammar as the Block inspector so the dock does not grow a second visual
 * language for its second subject.
 *
 * Every control writes through the same `setConnectionRoutingForSelection`
 * command the menu uses, so a batch behaves identically from either entry point.
 */
import { useCallback, useEffect, useState } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'

import {
	CONNECTION_ROUTING_KINDS,
	CONNECTION_TEMPORAL_KINDS,
	ConnectionRoutingStyle,
	ConnectionTemporalStyle,
	PILL_POSITION_DEFAULT,
	type ConnectionRoutingKind,
	type ConnectionTemporalKind,
} from '../connections/connectionModel'
import {
	centreConnectionPill,
	canonicalTunnelLayer,
	getConnectionBindings,
	getConnectionDirection,
	getTunnelLayers,
	setConnectionDelayValue,
	type ConnectionBinding,
	type ConnectionShape,
} from '../connections'
import {
	getSharedStyleForSelection,
	isSharedStyleValue,
	setConnectionRoutingForSelection,
	setConnectionTemporalForSelection,
} from '../commands'
import { isBlockShape } from '../blockModel'
import { sameSharedStyle } from '../commands/blockStyleCommands'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'
import './block-inspector.css'

export interface ConnectionInspectorContext {
	count: number
	routing: ReturnType<typeof getSharedStyleForSelection<ConnectionRoutingKind>>
	/** Plain data, async delivery, or one-iteration delay; shared or mixed across the selection. */
	temporal: ReturnType<typeof getSharedStyleForSelection<ConnectionTemporalKind>>
	/** Endpoint summary, only when exactly one cable is selected. */
	endpoints: { from: string; to: string } | null
	/** Whether the single selection carries an authored bend or rails. */
	authored: boolean
	/** The single selected cable, for the per-cable delay controls. */
	only: { id: TLShapeId; delayValue: string; pillCentred: boolean } | null
	/** Shared tunnel state; null means mixed across a multi-selection. */
	tunnelEnabled: boolean | null
	/** Shared layer name; null means mixed across a multi-selection. */
	tunnelLayer: string | null
	/** Reusable tunnel layer names already present on this canvas. */
	tunnelLayers: string[]
}

const label = (value: string) => value[0].toUpperCase() + value.slice(1)

const temporalLabel = (temporal: ConnectionTemporalKind) =>
	temporal === 'delayed' ? 'Delayed (z⁻¹)' : label(temporal)

function selectedConnections(editor: Editor): ConnectionShape[] {
	return editor.getSelectedShapes()
		.filter((shape) => shape.type === CONNECTION_SHAPE_TYPE) as ConnectionShape[]
}

function sharedValue<T>(values: readonly T[]): T | null {
	if (values.length === 0) return null
	return values.every((value) => value === values[0]) ? values[0] : null
}

function describeEndpoint(editor: Editor, binding: ConnectionBinding | undefined) {
	if (!binding) return '—'
	const shape = editor.getShape(binding.toId)
	if (!isBlockShape(shape)) return '—'
	const port = [...shape.props.inputs, ...shape.props.outputs]
		.find((candidate) => candidate.id === binding.props.portId)
	// An unnamed Block still has a type; "transform.in_1" reads far better than
	// "Block.in_1" for one the picker just made. An inner face says so: a cable
	// on the inside of a boundary port is a different wire from one outside it.
	const name = shape.props.title || shape.props.blockType || 'Block'
	const face = binding.props.face === 'inner' ? ' (inside)' : ''
	return `${name}.${port?.name || port?.id || binding.props.portId}${face}`
}

/** Resolve what the dock should show for the current selection. */
export function getConnectionInspectorContext(editor: Editor): ConnectionInspectorContext | null {
	const selected = selectedConnections(editor)
	if (selected.length === 0) return null

	const only = selected.length === 1 ? selected[0] : null
	const bindings = only ? getConnectionBindings(editor, only) : null
	const direction = only ? getConnectionDirection(editor, only) : null
	return {
		count: selected.length,
		routing: getSharedStyleForSelection(editor, ConnectionRoutingStyle),
		temporal: getSharedStyleForSelection(editor, ConnectionTemporalStyle),
		only: only
			? {
				id: only.id,
				delayValue: only.props.delayValue,
				pillCentred: only.props.pillPosition === PILL_POSITION_DEFAULT,
			}
			: null,
		endpoints: bindings && direction
			? {
				from: describeEndpoint(editor, bindings[direction.sourceTerminal]),
				to: describeEndpoint(editor, bindings[direction.sinkTerminal]),
			}
			: null,
		authored: only ? only.props.routeMode === 'authored' : false,
		tunnelEnabled: sharedValue(selected.map((connection) => connection.props.tunnel)),
		tunnelLayer: sharedValue(selected.map((connection) => connection.props.tunnelLayer)),
		tunnelLayers: getTunnelLayers(editor),
	}
}

/** Same panel, same words: the previous context is kept, so nothing re-renders. */
function sameConnectionInspectorContext(
	previous: unknown,
	next: ConnectionInspectorContext | null,
): previous is ConnectionInspectorContext | null {
	if (previous === next) return true
	if (typeof previous !== 'object' || previous === null || next === null) return false
	const before = previous as ConnectionInspectorContext
	return before.count === next.count
		&& before.authored === next.authored
		&& sameSharedStyle(before.routing, next.routing)
		&& sameSharedStyle(before.temporal, next.temporal)
		&& before.tunnelEnabled === next.tunnelEnabled
		&& before.tunnelLayer === next.tunnelLayer
		&& before.tunnelLayers.length === next.tunnelLayers.length
		&& before.tunnelLayers.every((layer, index) => layer === next.tunnelLayers[index])
		&& (before.only === next.only || (
			before.only !== null && next.only !== null
			&& before.only.id === next.only.id
			&& before.only.delayValue === next.only.delayValue
			&& before.only.pillCentred === next.only.pillCentred
		))
		&& (before.endpoints === next.endpoints || (
			before.endpoints !== null && next.endpoints !== null
			&& before.endpoints.from === next.endpoints.from
			&& before.endpoints.to === next.endpoints.to
		))
}

export function EditorConnectionInspector({ editor }: { editor: Editor }) {
	const [addingLayer, setAddingLayer] = useState(false)
	const [newLayerName, setNewLayerName] = useState('')
	// Re-resolved whenever a selected cable's record changes — every frame it
	// is dragged — but kept when the panel would read the same thing.
	const context = useValue(
		'connection inspector context',
		(previous?: unknown) => {
			const next = getConnectionInspectorContext(editor)
			return sameConnectionInspectorContext(previous, next) ? previous : next
		},
		[editor],
	)
	const setRouting = useCallback(
		(routing: ConnectionRoutingKind) => void setConnectionRoutingForSelection(editor, routing),
		[editor],
	)
	const setTemporal = useCallback(
		(temporal: ConnectionTemporalKind) => void setConnectionTemporalForSelection(editor, temporal),
		[editor],
	)
	const clearAuthored = useCallback(() => {
		const selected = selectedConnections(editor)
		if (selected.length === 0) return
		editor.markHistoryStoppingPoint('reset connection route')
		editor.updateShapes(selected.map((connection) => ({
			id: connection.id,
			type: CONNECTION_SHAPE_TYPE,
			props: { curve: null, pins: [], elbowRoute: null, routeMode: 'automatic' },
		})))
	}, [editor])
	const setTunnel = useCallback((enabled: boolean) => {
		const selected = selectedConnections(editor)
		if (selected.length === 0) return
		const firstLayer = getTunnelLayers(editor)[0] ?? ''
		editor.markHistoryStoppingPoint('change tunnel mode')
		editor.updateShapes(selected.map((connection) => ({
			id: connection.id,
			type: CONNECTION_SHAPE_TYPE,
			props: {
				tunnel: enabled,
				...(enabled && connection.props.tunnelLayer === '' && firstLayer
					? { tunnelLayer: firstLayer }
					: null),
			},
		})))
	}, [editor])
	const setTunnelLayer = useCallback((layer: string) => {
		const selected = selectedConnections(editor)
		if (selected.length === 0) return
		editor.markHistoryStoppingPoint('set tunnel layer')
		editor.updateShapes(selected.map((connection) => ({
			id: connection.id,
			type: CONNECTION_SHAPE_TYPE,
			props: { tunnelLayer: layer },
		})))
	}, [editor])

	if (!context) return null
	const many = context.count > 1
	const createLayer = () => {
		const layer = canonicalTunnelLayer(editor, newLayerName)
		if (!layer) return
		setTunnelLayer(layer)
		setNewLayerName('')
		setAddingLayer(false)
	}

	return (
		<section
			className="block-inspector"
			aria-label="Connection inspector"
			data-testid="connection-inspector"
		>
			<div className="block-inspector__body">
				<section className="block-inspector__section" data-inspector-section="Connection">
					<div className="block-inspector__section-title">
						<span>{many ? `${context.count} connections` : 'Connection'}</span>
					</div>
					{context.endpoints ? (
						<p className="block-inspector__hint" data-testid="connection-endpoints">
							{context.endpoints.from} → {context.endpoints.to}
						</p>
					) : (
						<p className="block-inspector__hint">Routing applies to all {context.count}.</p>
					)}
				</section>

				<section className="block-inspector__section" data-inspector-section="Routing">
					<div className="block-inspector__section-title">Routing</div>
					<div className="block-inspector__choices" role="group" aria-label="Connection routing">
						{CONNECTION_ROUTING_KINDS.map((routing) => (
							<button
								key={routing}
								type="button"
								data-testid={`connection-routing-${routing}`}
								aria-pressed={isSharedStyleValue(context.routing, routing)}
								onClick={() => setRouting(routing)}
							>
								{label(routing)}
							</button>
						))}
					</div>
					<p className="block-inspector__hint">
						{context.routing?.type === 'mixed'
							? 'Mixed — choose one to settle the selection.'
							: 'Drag the control point to bend it; switching routing starts over.'}
					</p>
				</section>

				<section className="block-inspector__section" data-inspector-section="Edge type">
					<div className="block-inspector__section-title">Edge type</div>
					<div className="block-inspector__choices" role="group" aria-label="Connection edge type">
						{CONNECTION_TEMPORAL_KINDS.map((temporal) => (
							<button
								key={temporal}
								type="button"
								data-testid={`connection-temporal-${temporal}`}
								aria-pressed={isSharedStyleValue(context.temporal, temporal)}
								onClick={() => setTemporal(temporal)}
							>
								{temporalLabel(temporal)}
							</button>
						))}
					</div>
					<p className="block-inspector__hint">
						{context.temporal?.type === 'mixed'
							? 'Mixed — choose one to settle the selection.'
							: isSharedStyleValue(context.temporal, 'delayed')
								? 'Read one iteration late: dotted, with a z⁻¹ pill you can slide along the cable.'
								: isSharedStyleValue(context.temporal, 'async')
									? 'Async delivery: small packet marks ride a mostly continuous cable.'
									: 'Read on this pass: the plain data cable.'}
					</p>
					{context.only && isSharedStyleValue(context.temporal, 'delayed') ? (
						<DelayValueField
							key={context.only.id}
							connectionId={context.only.id}
							value={context.only.delayValue}
							pillCentred={context.only.pillCentred}
							editor={editor}
						/>
					) : null}
				</section>

				<section className="block-inspector__section" data-inspector-section="Route">
					<div className="block-inspector__section-title">Route</div>
					<button
						type="button"
						className="block-inspector__count-pill"
						data-testid="connection-reset-route"
						disabled={!context.authored && !many}
						onClick={clearAuthored}
					>
						Reset to automatic
					</button>
					<p className="block-inspector__hint">
						{context.authored
							? 'This cable carries a route you authored.'
							: 'Automatic — the router owns this cable.'}
					</p>
				</section>

				<section className="block-inspector__section" data-inspector-section="Visibility">
					<div className="block-inspector__section-title">Visibility</div>
					<div className="connection-inspector__toggle-row">
						<div>
							<strong>Tunnel</strong>
							<span>Hide the long run until it is relevant.</span>
						</div>
						<button
							type="button"
							role="switch"
							className="connection-inspector__switch"
							aria-checked={context.tunnelEnabled ?? 'mixed'}
							aria-label="Tunnel edge"
							data-testid="tunnel-toggle"
							onClick={() => setTunnel(context.tunnelEnabled !== true)}
						>
							<span />
						</button>
					</div>

					{context.tunnelEnabled ? (
						<div className="connection-inspector__tunnel-fields">
							<label className="block-inspector__field">
								<span>Layer</span>
								<select
									value={context.tunnelLayer ?? ''}
									data-testid="tunnel-layer"
									onChange={(event) => setTunnelLayer(event.target.value)}
								>
									<option value="">Choose layer…</option>
									{context.tunnelLayers.map((layer) => (
										<option key={layer} value={layer}>{layer}</option>
									))}
								</select>
							</label>
							{addingLayer ? (
								<div className="connection-inspector__new-layer">
									<input
										autoFocus
										value={newLayerName}
										placeholder="Layer name…"
										aria-label="New tunnel layer name"
										data-testid="new-tunnel-layer-name"
										onChange={(event) => setNewLayerName(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === 'Enter') createLayer()
											else if (event.key === 'Escape') setAddingLayer(false)
										}}
									/>
									<button type="button" data-testid="add-tunnel-layer" onClick={createLayer}>Add</button>
								</div>
							) : (
								<button
									type="button"
									className="block-inspector__count-pill connection-inspector__add-layer"
									data-testid="new-tunnel-layer"
									onClick={() => setAddingLayer(true)}
								>
									+ New layer
								</button>
							)}
							<p className="block-inspector__hint">
								Reveals with its layer, edge, endpoint Block, or port reattachment focus.
							</p>
						</div>
					) : null}
				</section>
			</div>
		</section>
	)
}

/**
 * The initial value a delayed cable shows in its pill, and a way to put the
 * pill back in the middle after it has been slid along the cable.
 */
function DelayValueField({
	connectionId,
	value,
	pillCentred,
	editor,
}: {
	connectionId: TLShapeId
	value: string
	pillCentred: boolean
	editor: Editor
}) {
	const [draft, setDraft] = useState(value)
	useEffect(() => setDraft(value), [value])
	const commit = useCallback(() => {
		setConnectionDelayValue(editor, connectionId, draft)
	}, [editor, connectionId, draft])
	return (
		<>
			<label className="block-inspector__field">
				<span>= value</span>
				<input
					type="text"
					data-testid="connection-delay-value"
					aria-label="Initial value"
					placeholder="1.0"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault()
							commit()
							;(event.target as HTMLInputElement).blur()
						}
					}}
				/>
			</label>
			<button
				type="button"
				className="block-inspector__count-pill"
				data-testid="connection-pill-centre"
				disabled={pillCentred}
				onClick={() => void centreConnectionPill(editor, connectionId)}
			>
				Centre the pill
			</button>
			<p className="block-inspector__hint">
				Short values read on the pill as <code>z⁻¹ = value</code>; drag the pill along the cable to place it.
			</p>
		</>
	)
}
