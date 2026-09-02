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
import { useCallback } from 'react'
import { useEditor, useValue, type Editor } from 'tldraw'

import {
	CONNECTION_ROUTING_KINDS,
	ConnectionRoutingStyle,
	type ConnectionRoutingKind,
} from '../connections/connectionModel'
import {
	getConnectionBindings,
	getConnectionDirection,
	type ConnectionBinding,
	type ConnectionShape,
} from '../connections'
import {
	getSharedStyleForSelection,
	isSharedStyleValue,
	setConnectionRoutingForSelection,
} from '../commands'
import { isBlockShape } from '../blockModel'
import { sameSharedStyle } from '../commands/blockStyleCommands'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'
import './block-inspector.css'

export interface ConnectionInspectorContext {
	count: number
	routing: ReturnType<typeof getSharedStyleForSelection<ConnectionRoutingKind>>
	/** Endpoint summary, only when exactly one cable is selected. */
	endpoints: { from: string; to: string } | null
	/** Whether the single selection carries an authored bend or rails. */
	authored: boolean
}

const label = (value: string) => value[0].toUpperCase() + value.slice(1)

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
	const selected = editor.getSelectedShapes()
		.filter((shape) => shape.type === CONNECTION_SHAPE_TYPE) as ConnectionShape[]
	if (selected.length === 0) return null

	const only = selected.length === 1 ? selected[0] : null
	const bindings = only ? getConnectionBindings(editor, only) : null
	const direction = only ? getConnectionDirection(editor, only) : null
	return {
		count: selected.length,
		routing: getSharedStyleForSelection(editor, ConnectionRoutingStyle),
		endpoints: bindings && direction
			? {
				from: describeEndpoint(editor, bindings[direction.sourceTerminal]),
				to: describeEndpoint(editor, bindings[direction.sinkTerminal]),
			}
			: null,
		authored: only
			? only.props.curve !== null || only.props.pins.length > 0 || only.props.elbowRoute !== null
			: false,
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
		&& (before.endpoints === next.endpoints || (
			before.endpoints !== null && next.endpoints !== null
			&& before.endpoints.from === next.endpoints.from
			&& before.endpoints.to === next.endpoints.to
		))
}

export function EditorConnectionInspector({ editor }: { editor: Editor }) {
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
	const clearAuthored = useCallback(() => {
		const selected = editor.getSelectedShapes()
			.filter((shape) => shape.type === CONNECTION_SHAPE_TYPE) as ConnectionShape[]
		if (selected.length === 0) return
		editor.markHistoryStoppingPoint('reset connection route')
		editor.updateShapes(selected.map((connection) => ({
			id: connection.id,
			type: CONNECTION_SHAPE_TYPE,
			props: { curve: null, pins: [], elbowRoute: null },
		})))
	}, [editor])

	if (!context) return null
	const many = context.count > 1

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
			</div>
		</section>
	)
}
