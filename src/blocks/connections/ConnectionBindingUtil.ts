import {
	BindingUtil,
	T,
	createBindingPropsMigrationIds,
	createBindingPropsMigrationSequence,
	type BindingOnChangeOptions,
	type BindingOnCreateOptions,
	type BindingOnShapeChangeOptions,
	type BindingOnShapeDeleteOptions,
	type BindingOnShapeIsolateOptions,
	type Editor,
	type RecordProps,
	type TLBinding,
	type TLShapeId,
} from 'tldraw'
import { BLOCK_SHAPE_TYPE, isBlockShape, type BlockShape } from '../blockModel'
import { getBlockConnectionPortPagePoint, getPortHostPort, isPortHostShape } from './blockPorts'
import {
	CONNECTION_BINDING_TYPE,
	CONNECTION_SHAPE_TYPE,
	portPolarity,
	type ConnectionTerminal,
	type PortFace,
	type PortPolarity,
} from './connectionModel'
import { pairBlockFaces } from './connectionScope'
import type { ConnectionShape } from './ConnectionShapeUtil'

/**
 * A binding welds one handle of a cable to one FACE of one port.
 *
 * `terminal` is the handle (tldraw's concern), `portId` the durable identity
 * (the Block's concern), and `face` which side of the boundary the cable meets
 * the port from (the scope rules' concern). Position is never stored; it is
 * re-derived from the Block's live layout on every read.
 */
export interface ConnectionBindingProps {
	portId: string
	terminal: ConnectionTerminal
	face: PortFace
}

declare module 'tldraw' {
	export interface TLGlobalBindingPropsMap {
		[CONNECTION_BINDING_TYPE]: ConnectionBindingProps
	}
}

export type ConnectionBinding = TLBinding<typeof CONNECTION_BINDING_TYPE>

export const connectionBindingProps: RecordProps<ConnectionBinding> = {
	portId: T.string,
	terminal: T.literalEnum('start', 'end'),
	face: T.literalEnum('outer', 'inner'),
}

const connectionBindingVersions = createBindingPropsMigrationIds(CONNECTION_BINDING_TYPE, {
	AddFace: 1,
})

/** How the first inner-face implementation spelled a face: as a twin port id. */
const LEGACY_INNER_SUFFIX = '__inner'

export const connectionBindingMigrations = createBindingPropsMigrationSequence({
	sequence: [{
		id: connectionBindingVersions.AddFace,
		up(props) {
			if (typeof props.face === 'string') return
			const portId = String(props.portId ?? '')
			const inner = portId.endsWith(LEGACY_INNER_SUFFIX)
			props.face = inner ? 'inner' : 'outer'
			if (inner) props.portId = portId.slice(0, -LEGACY_INNER_SUFFIX.length)
		},
		down(props) {
			if (props.face === 'inner') props.portId = `${props.portId}${LEGACY_INNER_SUFFIX}`
			delete props.face
		},
	}],
})

/** True while the binding names an existing port on an existing Block. */
export function connectionBindingIsValid(editor: Editor, binding: ConnectionBinding): boolean {
	const connection = editor.getShape(binding.fromId)
	const host = editor.getShape(binding.toId)
	return connection?.type === CONNECTION_SHAPE_TYPE
		&& isPortHostShape(host)
		&& getPortHostPort(editor, host, binding.props.portId) !== null
}

/**
 * True while a fully bound cable's two faces are the ones its Blocks' places
 * in the tree give them. A half-bound cable is mid-gesture and passes.
 *
 * This is what a Block moving between frames re-checks: a cable from a
 * boundary's inlet to a child that has just been dragged out of the frame no
 * longer joins two faces of one scope, and a wire across a boundary is not a
 * thing this model can draw.
 */
export function connectionEndpointsAreValid(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
): boolean {
	const bindings = getConnectionBindings(editor, connection)
	if (!bindings.start || !bindings.end) return true
	const startBlock = editor.getShape(bindings.start.toId)
	const endBlock = editor.getShape(bindings.end.toId)
	if (!isPortHostShape(startBlock) || !isPortHostShape(endBlock)) return false
	const faces = pairBlockFaces(editor, startBlock, endBlock, { requireLive: false })
	if (!faces) return false
	if (faces.a !== bindings.start.props.face || faces.b !== bindings.end.props.face) return false
	const startPort = getPortHostPort(editor, startBlock, bindings.start.props.portId)
	const endPort = getPortHostPort(editor, endBlock, bindings.end.props.portId)
	if (!startPort || !endPort) return false
	return portPolarity(startPort.side, faces.a) !== portPolarity(endPort.side, faces.b)
}

/**
 * One binding per terminal. The binding stores identity only; its position is
 * always re-derived from the Block's current layout and transform.
 */
export class ConnectionBindingUtil extends BindingUtil<ConnectionBinding> {
	static override type = CONNECTION_BINDING_TYPE
	static override props = connectionBindingProps
	static override migrations = connectionBindingMigrations

	override getDefaultProps(): Partial<ConnectionBindingProps> {
		return { portId: '', terminal: 'start', face: 'outer' }
	}

	override onAfterCreate({ binding }: BindingOnCreateOptions<ConnectionBinding>): void {
		if (!connectionBindingIsValid(this.editor, binding)) {
			this.editor.deleteBinding(binding.id)
			return
		}
		settleConnection(this.editor, binding.fromId)
	}

	override onAfterChange({ bindingAfter }: BindingOnChangeOptions<ConnectionBinding>): void {
		if (!connectionBindingIsValid(this.editor, bindingAfter)) {
			this.editor.deleteShapes([bindingAfter.fromId])
			return
		}
		settleConnection(this.editor, bindingAfter.fromId)
	}

	override onAfterChangeToShape({
		binding,
		shapeBefore,
		shapeAfter,
		reason,
	}: BindingOnShapeChangeOptions<ConnectionBinding>): void {
		// This runs for every cable on a Block on every frame the Block moves.
		// A move keeps the props object and the parent, and those are all the
		// rules read: the ports come from the props, the faces from the place
		// in the tree. tldraw reports `ancestry` only when an ancestor was
		// reparented, so that case is always judged in full.
		if (
			reason === 'self'
			&& shapeBefore.props === shapeAfter.props
			&& shapeBefore.parentId === shapeAfter.parentId
		) return
		// Removal or moving an id to the opposite lane invalidates the semantic
		// edge, and so does a bound Block leaving the scope the cable lives in.
		// Hiding, reordering, and resizing remain valid and move for free.
		if (!connectionBindingIsValid(this.editor, binding)) {
			this.editor.deleteShapes([binding.fromId])
			return
		}
		// Endpoint validity is judged once, inside settleConnection.
		settleConnection(this.editor, binding.fromId)
	}

	override onBeforeIsolateToShape({
		binding,
	}: BindingOnShapeIsolateOptions<ConnectionBinding>): void {
		this.editor.deleteShapes([binding.fromId])
	}

	override onBeforeDeleteToShape({
		binding,
	}: BindingOnShapeDeleteOptions<ConnectionBinding>): void {
		this.editor.deleteShapes([binding.fromId])
	}
}

export interface ConnectionBindings {
	start?: ConnectionBinding
	end?: ConnectionBinding
}

export function connectionBindingsForTerminal(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
	terminal: ConnectionTerminal,
): ConnectionBinding[] {
	const connectionId = typeof connection === 'string' ? connection : connection.id
	return editor
		.getBindingsFromShape<ConnectionBinding>(connectionId, CONNECTION_BINDING_TYPE)
		.filter((binding) => binding.props.terminal === terminal)
}

export function getConnectionBindings(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
): ConnectionBindings {
	return {
		start: connectionBindingsForTerminal(editor, connection, 'start')[0],
		end: connectionBindingsForTerminal(editor, connection, 'end')[0],
	}
}

export function connectionHasBothTerminals(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
): boolean {
	const bindings = getConnectionBindings(editor, connection)
	return bindings.start !== undefined && bindings.end !== undefined
}

export function getConnectionBindingPositionInPageSpace(
	editor: Editor,
	binding: ConnectionBinding,
) {
	return getBlockConnectionPortPagePoint(editor, binding.toId, binding.props.portId)
}

/** The polarity of the face a binding sits on, from the live Block. */
export function connectionBindingPolarity(
	editor: Editor,
	binding: ConnectionBinding,
): PortPolarity | null {
	const host = editor.getShape(binding.toId)
	if (!isPortHostShape(host)) return null
	const port = getPortHostPort(editor, host, binding.props.portId)
	return port ? portPolarity(port.side, binding.props.face) : null
}

export interface ConnectionDirection {
	sourceTerminal: ConnectionTerminal
	sinkTerminal: ConnectionTerminal
}

/**
 * Which handle is the source, derived from the faces the cable is welded to.
 *
 * A bound end's polarity decides for both: if `start` sits on a sink face, the
 * cable's source is at `end`. Mid-gesture only the anchored end is bound and
 * it still decides, so a cable being dragged out of an inlet already leaves it
 * heading the right way. An unbound cable reads `start` → `end`.
 */
export function getConnectionDirection(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
): ConnectionDirection {
	const bindings = getConnectionBindings(editor, connection)
	const decided = (terminal: ConnectionTerminal, polarity: PortPolarity | null) => {
		if (polarity === null) return null
		const sourceTerminal: ConnectionTerminal = polarity === 'source'
			? terminal
			: terminal === 'start' ? 'end' : 'start'
		return {
			sourceTerminal,
			sinkTerminal: sourceTerminal === 'start' ? 'end' : 'start',
		} satisfies ConnectionDirection
	}
	return (bindings.start && decided('start', connectionBindingPolarity(editor, bindings.start)))
		?? (bindings.end && decided('end', connectionBindingPolarity(editor, bindings.end)))
		?? { sourceTerminal: 'start', sinkTerminal: 'end' }
}

/**
 * Make `start` the source of a settled cable.
 *
 * Direction is derived, so a reversed cable renders correctly either way — but
 * the file format is read by more than the renderer, and "start is the source"
 * is the invariant the Python side gets to rely on. Runs once at the end of a
 * gesture and once at install, never mid-drag: tldraw's handle drag holds the
 * id of the handle it is moving.
 */
export function normalizeConnectionDirection(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
): boolean {
	const connectionId = typeof connection === 'string' ? connection : connection.id
	const shape = editor.getShape<ConnectionShape>(connectionId)
	if (!shape || shape.type !== CONNECTION_SHAPE_TYPE) return false
	const bindings = getConnectionBindings(editor, connectionId)
	if (!bindings.start || !bindings.end) return false
	if (getConnectionDirection(editor, connectionId).sourceTerminal === 'start') return false

	const { start, end } = bindings
	editor.run(() => {
		editor.updateBindings([
			{ id: start.id, type: CONNECTION_BINDING_TYPE, props: { terminal: 'end' } },
			{ id: end.id, type: CONNECTION_BINDING_TYPE, props: { terminal: 'start' } },
		])
		editor.updateShape<ConnectionShape>({
			id: connectionId,
			type: CONNECTION_SHAPE_TYPE,
			props: { start: shape.props.end, end: shape.props.start },
		})
	})
	return true
}

/**
 * A pill with no type of its own takes the type of the port its cable meets,
 * on either rim: a result wired into `pose` becomes a `Pose`, an empty literal
 * wired into `gain: float` becomes a `float`. A pill that already has a type
 * keeps it; the type is written into the record so the file carries it.
 */
export function adoptCableTypeIntoPills(editor: Editor, connection: ConnectionShape | TLShapeId): void {
	const connectionId = typeof connection === 'string' ? connection : connection.id
	const bindings = getConnectionBindings(editor, connectionId)
	if (!bindings.start || !bindings.end) return
	const ends = [bindings.start, bindings.end].map((binding) => {
		const shape = editor.getShape(binding.toId)
		if (!isBlockShape(shape)) return null
		const port = [...shape.props.inputs, ...shape.props.outputs]
			.find((candidate) => candidate.id === binding.props.portId)
		return { shape, type: port?.type ?? '' }
	})
	const [a, b] = ends
	if (!a || !b) return
	for (const [pill, other] of [[a, b], [b, a]] as const) {
		if (pill.shape.props.view !== 'value' || pill.type !== '' || other.type === '') continue
		editor.updateShape<BlockShape>({
			id: pill.shape.id,
			type: BLOCK_SHAPE_TYPE,
			props: {
				inputs: pill.shape.props.inputs.map((port) => ({ ...port, type: other.type })),
				outputs: pill.shape.props.outputs.map((port) => ({ ...port, type: other.type })),
			},
		})
	}
}

/** Create or retarget exactly one semantic binding for a connection terminal. */
export function createOrUpdateConnectionBinding(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
	target: TLShapeId,
	props: ConnectionBindingProps,
): boolean {
	const connectionId = typeof connection === 'string' ? connection : connection.id
	const connectionShape = editor.getShape(connectionId)
	const host = editor.getShape(target)
	if (connectionShape?.type !== CONNECTION_SHAPE_TYPE || !isPortHostShape(host)) return false
	if (getPortHostPort(editor, host, props.portId) === null) return false

	const existingMany = connectionBindingsForTerminal(editor, connectionId, props.terminal)
	if (existingMany.length > 1) editor.deleteBindings(existingMany.slice(1))

	const existing = existingMany[0]
	if (existing) {
		if (
			existing.toId === target
			&& existing.props.portId === props.portId
			&& existing.props.face === props.face
		) return true
		editor.updateBinding<ConnectionBinding>({
			id: existing.id,
			type: CONNECTION_BINDING_TYPE,
			toId: target,
			props,
		})
	} else {
		editor.createBinding<ConnectionBinding>({
			type: CONNECTION_BINDING_TYPE,
			fromId: connectionId,
			toId: target,
			props,
		})
	}

	const settled = connectionBindingsForTerminal(editor, connectionId, props.terminal)[0]
	return settled !== undefined
		&& settled.toId === target
		&& settled.props.portId === props.portId
		&& settled.props.face === props.face
}

export function removeConnectionBinding(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
	terminal: ConnectionTerminal,
): void {
	editor.deleteBindings(connectionBindingsForTerminal(editor, connection, terminal))
}

/**
 * Keep a complete cable in the scope its two faces look into: an Expanded
 * Block for anything wired inside it, otherwise the frame or page the two
 * Blocks share. That is what composites internal wiring above the Block's
 * card and below its children (`keepConnectionsAtBottom` runs per parent).
 */
export function reparentConnectionToScope(editor: Editor, connectionId: TLShapeId): void {
	const connection = editor.getShape(connectionId)
	if (connection?.type !== CONNECTION_SHAPE_TYPE) return
	const bindings = getConnectionBindings(editor, connectionId)
	const startBlock = bindings.start ? editor.getShape(bindings.start.toId) : undefined
	const endBlock = bindings.end ? editor.getShape(bindings.end.toId) : undefined
	if (!isPortHostShape(startBlock) || !isPortHostShape(endBlock)) return
	const faces = pairBlockFaces(editor, startBlock, endBlock, { requireLive: false })
	if (!faces) return
	if (faces.scopeId !== connection.parentId) {
		editor.reparentShapes([connectionId], faces.scopeId)
	}
}

/** The binding side effect: a legal cable settles into its scope. */
function settleConnection(editor: Editor, connectionId: TLShapeId): void {
	if (!connectionEndpointsAreValid(editor, connectionId)) {
		editor.deleteShapes([connectionId])
		return
	}
	reparentConnectionToScope(editor, connectionId)
}

export interface ConnectionCleanupResult {
	bindingsRemoved: number
	connectionsRemoved: number
	connectionsNormalized: number
}

/**
 * Prune malformed, duplicate, half-bound or cross-boundary records already
 * present at install time, and make every survivor read start → end.
 */
export function cleanupStaleConnections(editor: Editor): ConnectionCleanupResult {
	let bindingsRemoved = 0
	let connectionsRemoved = 0
	let connectionsNormalized = 0
	const records = editor.store.allRecords()

	for (const record of records) {
		if (record.typeName !== 'binding' || record.type !== CONNECTION_BINDING_TYPE) continue
		const binding = record as ConnectionBinding
		if (connectionBindingIsValid(editor, binding)) continue
		editor.deleteBinding(binding.id)
		bindingsRemoved += 1
	}

	for (const record of records) {
		if (record.typeName !== 'shape' || record.type !== CONNECTION_SHAPE_TYPE) continue
		const connection = editor.getShape(record.id)
		if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) continue

		for (const terminal of ['start', 'end'] as const) {
			const duplicates = connectionBindingsForTerminal(editor, connection.id, terminal).slice(1)
			if (duplicates.length > 0) {
				editor.deleteBindings(duplicates)
				bindingsRemoved += duplicates.length
			}
		}

		if (
			!connectionHasBothTerminals(editor, connection.id)
			|| !connectionEndpointsAreValid(editor, connection.id)
		) {
			editor.deleteShapes([connection.id])
			connectionsRemoved += 1
			continue
		}
		if (normalizeConnectionDirection(editor, connection.id)) connectionsNormalized += 1
	}

	return { bindingsRemoved, connectionsRemoved, connectionsNormalized }
}
