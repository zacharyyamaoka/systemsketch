import {
	BindingUtil,
	T,
	type BindingOnChangeOptions,
	type BindingOnCreateOptions,
	type BindingOnShapeChangeOptions,
	type BindingOnShapeDeleteOptions,
	type BindingOnShapeIsolateOptions,
	type Editor,
	type RecordProps,
	type TLBinding,
	type TLParentId,
	type TLShapeId,
} from 'tldraw'
import { canBlockContainChildren, isBlockShape } from '../blockModel'
import { getBlockConnectionPort, getBlockConnectionPortPagePoint } from './blockPorts'
import {
	CONNECTION_BINDING_TYPE,
	CONNECTION_SHAPE_TYPE,
	type ConnectionTerminal,
} from './connectionModel'
import type { ConnectionShape } from './ConnectionShapeUtil'

export interface ConnectionBindingProps {
	portId: string
	terminal: ConnectionTerminal
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
}

/** True while the binding names an existing port on the correct side. */
export function connectionBindingIsValid(editor: Editor, binding: ConnectionBinding): boolean {
	const connection = editor.getShape(binding.fromId)
	const block = editor.getShape(binding.toId)
	return connection?.type === CONNECTION_SHAPE_TYPE
		&& isBlockShape(block)
		&& getBlockConnectionPort(block.props, binding.props.portId, binding.props.terminal) !== null
}

/**
 * One binding per terminal. The binding stores identity only; its position is
 * always re-derived from the Block's current layout and transform.
 */
export class ConnectionBindingUtil extends BindingUtil<ConnectionBinding> {
	static override type = CONNECTION_BINDING_TYPE
	static override props = connectionBindingProps

	override getDefaultProps(): Partial<ConnectionBindingProps> {
		return { portId: '', terminal: 'start' }
	}

	override onAfterCreate({ binding }: BindingOnCreateOptions<ConnectionBinding>): void {
		if (!connectionBindingIsValid(this.editor, binding)) {
			this.editor.deleteBinding(binding.id)
			return
		}
		reparentConnectionToSharedAncestor(this.editor, binding.fromId)
	}

	override onAfterChange({ bindingAfter }: BindingOnChangeOptions<ConnectionBinding>): void {
		if (!connectionBindingIsValid(this.editor, bindingAfter)) {
			this.editor.deleteShapes([bindingAfter.fromId])
			return
		}
		reparentConnectionToSharedAncestor(this.editor, bindingAfter.fromId)
	}

	override onAfterChangeToShape({
		binding,
	}: BindingOnShapeChangeOptions<ConnectionBinding>): void {
		// Removal or moving an id to the opposite lane invalidates the semantic
		// edge. Hiding, reordering, and resizing remain valid and move for free.
		if (!connectionBindingIsValid(this.editor, binding)) {
			this.editor.deleteShapes([binding.fromId])
			return
		}
		reparentConnectionToSharedAncestor(this.editor, binding.fromId)
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
	return getBlockConnectionPortPagePoint(
		editor,
		binding.toId,
		binding.props.portId,
		binding.props.terminal,
	)
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
	const block = editor.getShape(target)
	if (connectionShape?.type !== CONNECTION_SHAPE_TYPE || !isBlockShape(block)) return false
	if (getBlockConnectionPort(block.props, props.portId, props.terminal) === null) return false

	const existingMany = connectionBindingsForTerminal(editor, connectionId, props.terminal)
	if (existingMany.length > 1) editor.deleteBindings(existingMany.slice(1))

	const existing = existingMany[0]
	if (existing) {
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
}

export function removeConnectionBinding(
	editor: Editor,
	connection: ConnectionShape | TLShapeId,
	terminal: ConnectionTerminal,
): void {
	editor.deleteBindings(connectionBindingsForTerminal(editor, connection, terminal))
}

/** Keep a complete connection in the closest subtree shared by its endpoints. */
export function reparentConnectionToSharedAncestor(
	editor: Editor,
	connectionId: TLShapeId,
): void {
	const connection = editor.getShape(connectionId)
	if (connection?.type !== CONNECTION_SHAPE_TYPE) return
	const bindings = getConnectionBindings(editor, connectionId)
	const startShape = bindings.start ? editor.getShape(bindings.start.toId) : undefined
	const endShape = bindings.end ? editor.getShape(bindings.end.toId) : undefined
	if (!startShape || !endShape) return
	const pageId = editor.getAncestorPageId(connection)
	if (!pageId) return

	let nextParentId: TLParentId
	if (startShape.id === endShape.id) {
		nextParentId = isBlockShape(startShape) && canBlockContainChildren(startShape.props.view)
			? startShape.id
			: startShape.parentId
	} else if (editor.hasAncestor(endShape, startShape.id)) {
		nextParentId = startShape.id
	} else if (editor.hasAncestor(startShape, endShape.id)) {
		nextParentId = endShape.id
	} else {
		nextParentId = editor.findCommonAncestor([startShape, endShape]) ?? pageId
	}

	if (nextParentId !== connection.parentId) {
		editor.reparentShapes([connectionId], nextParentId)
	}
}

export interface ConnectionCleanupResult {
	bindingsRemoved: number
	connectionsRemoved: number
}

/** Prune malformed, duplicate, or half-bound records already present at install time. */
export function cleanupStaleConnections(editor: Editor): ConnectionCleanupResult {
	let bindingsRemoved = 0
	let connectionsRemoved = 0
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

		if (connectionHasBothTerminals(editor, connection.id)) continue
		editor.deleteShapes([connection.id])
		connectionsRemoved += 1
	}

	return { bindingsRemoved, connectionsRemoved }
}
