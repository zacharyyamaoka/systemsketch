import {
	createShapeId,
	isShapeId,
	type Editor,
	type JsonObject,
	type TLBinding,
	type TLParentId,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import { isBlockShape, type BlockShape, type BlockShapeProps } from '../blockModel'

export const DEFINITION_MEMBER_META_KEY = 'systemSketchDefinitionMember'

interface DefinitionMemberRef {
	definitionId: string
	memberId: string
	occurrenceId: string
}

interface SemanticBlockProps {
	title: string
	description: string
	blockType: string
	icon: string
	notes: string
	inputs: BlockShapeProps['inputs']
	outputs: BlockShapeProps['outputs']
	expandedWeights: BlockShapeProps['expandedWeights']
	expandedSize: BlockShapeProps['views']['expanded']
}

function freshId(): string {
	return createShapeId().slice('shape:'.length)
}

export function blockDefinitionId(props: BlockShapeProps): string {
	return props.definitionId ?? ''
}

export function normalizedDefinitionName(title: string): string {
	return title.trim().replace(/\s+/g, ' ')
}

function exportStem(title: string): string {
	const withoutCall = normalizedDefinitionName(title).replace(/\(\)$/, '')
	const stem = withoutCall.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
	return stem || 'block'
}

export function definitionKeyFor(title: string, draftOrdinal?: number): string {
	if (!normalizedDefinitionName(title)) return ''
	const stem = exportStem(title)
	return draftOrdinal === undefined ? stem : `${stem}_draft_${draftOrdinal}`
}

function availableDefinitionKey(
	editor: Editor,
	desired: string,
	excludedDefinitionId = '',
): string {
	if (!desired) return ''
	const occupied = new Set(allBlocks(editor).flatMap((block) => (
		blockDefinitionId(block.props) !== excludedDefinitionId && block.props.definitionKey
			? [block.props.definitionKey]
			: []
	)))
	if (!occupied.has(desired)) return desired
	for (let ordinal = 2; ; ordinal += 1) {
		const candidate = `${desired}_${ordinal}`
		if (!occupied.has(candidate)) return candidate
	}
}

export function definitionBadge(props: BlockShapeProps): string | null {
	return props.draftOrdinal === undefined ? null : `Draft ${props.draftOrdinal}`
}

function semanticProps(props: BlockShapeProps): SemanticBlockProps {
	return {
		title: props.title,
		description: props.description,
		blockType: props.blockType,
		icon: props.icon ?? '',
		notes: props.notes ?? '',
		inputs: props.inputs,
		outputs: props.outputs,
		expandedWeights: props.expandedWeights,
		expandedSize: props.views.expanded,
	}
}

function sameJson(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

function applySemanticProps(target: BlockShapeProps, source: BlockShapeProps): BlockShapeProps {
	const expanded = { ...source.views.expanded }
	return {
		...target,
		title: source.title,
		description: source.description,
		blockType: source.blockType,
		icon: source.icon,
		notes: source.notes,
		inputs: source.inputs.map((port) => ({ ...port })),
		outputs: source.outputs.map((port) => ({ ...port })),
		expandedWeights: source.expandedWeights ? { ...source.expandedWeights } : undefined,
		views: { ...target.views, expanded },
		...(target.view === 'expanded' ? { w: expanded.w, h: expanded.h } : {}),
		definitionId: source.definitionId,
		definitionKey: source.definitionKey,
		draftOrdinal: source.draftOrdinal,
	}
}

export function allBlocks(editor: Editor): BlockShape[] {
	return editor.getPages().flatMap((page) => Array.from(editor.getPageShapeIds(page.id)).flatMap((id) => {
		const shape = editor.getShape(id)
		return isBlockShape(shape) ? [shape] : []
	}))
}

export function linkedBlockOccurrences(editor: Editor, shape: BlockShape): BlockShape[] {
	const id = blockDefinitionId(shape.props)
	return id ? allBlocks(editor).filter((candidate) => blockDefinitionId(candidate.props) === id) : [shape]
}

function ensureBlockIdentity(editor: Editor, block: BlockShape): BlockShape {
	const titled = normalizedDefinitionName(block.props.title) !== ''
	if (block.props.definitionId && (titled ? Boolean(block.props.definitionKey) : block.props.definitionKey !== undefined)) return block
	const props = {
		...block.props,
		definitionId: block.props.definitionId || freshId(),
		definitionKey: block.props.definitionKey || availableDefinitionKey(
			editor,
			definitionKeyFor(block.props.title, block.props.draftOrdinal),
			block.props.definitionId,
		),
	}
	editor.updateShape<BlockShape>({ id: block.id, type: block.type, props })
	return { ...block, props }
}

function parentBlock(editor: Editor, parentId: TLParentId): BlockShape | null {
	let current = parentId
	while (isShapeId(current)) {
		const shape = editor.getShape(current)
		if (!shape) return null
		if (isBlockShape(shape)) return shape
		current = shape.parentId
	}
	return null
}

function rootOccurrenceForShape(editor: Editor, shape: TLShape): BlockShape | null {
	return parentBlock(editor, shape.parentId)
}

function memberRef(shape: TLShape): DefinitionMemberRef | null {
	const value = shape.meta[DEFINITION_MEMBER_META_KEY]
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const candidate = value as Record<string, unknown>
	return typeof candidate.definitionId === 'string'
		&& typeof candidate.memberId === 'string'
		&& typeof candidate.occurrenceId === 'string'
		? candidate as unknown as DefinitionMemberRef
		: null
}

function withMemberRef(shape: TLShape, ref: DefinitionMemberRef): JsonObject {
	return { ...shape.meta, [DEFINITION_MEMBER_META_KEY]: { ...ref } }
}

function descendants(editor: Editor, rootId: TLShapeId): TLShape[] {
	const result: TLShape[] = []
	const visit = (parentId: TLShapeId) => {
		for (const id of editor.getSortedChildIdsForParent(parentId)) {
			const child = editor.getShape(id)
			if (!child) continue
			result.push(child)
			visit(child.id)
		}
	}
	visit(rootId)
	return result
}

function stampOccurrenceMembers(editor: Editor, occurrence: BlockShape): TLShape[] {
	const definitionId = blockDefinitionId(occurrence.props)
	if (!definitionId) return []
	const body = descendants(editor, occurrence.id)
	const updates: Array<{ id: TLShapeId; type: string; meta: JsonObject }> = []
	for (const shape of body) {
		const old = memberRef(shape)
		const memberId = old?.definitionId === definitionId ? old.memberId : freshId()
		if (old?.definitionId === definitionId
			&& old.memberId === memberId
			&& old.occurrenceId === occurrence.id) continue
		updates.push({
			id: shape.id,
			type: shape.type,
			meta: withMemberRef(shape, { definitionId, memberId, occurrenceId: occurrence.id }),
		})
	}
	if (updates.length) editor.updateShapes(updates as never)
	return body.map((shape) => {
		const update = updates.find((candidate) => candidate.id === shape.id)
		return update ? { ...shape, meta: update.meta } as TLShape : shape
	})
}

function cloneShape(
	editor: Editor,
	shape: TLShape,
	parentId: TLParentId,
	definitionId: string,
	occurrenceId: TLShapeId,
): TLShapeId {
	const ref = memberRef(shape)
	const id = createShapeId()
	const { typeName: _typeName, id: _id, parentId: _parentId, ...rest } = shape
	editor.createShape({
		...rest,
		id,
		parentId,
		meta: withMemberRef(shape, {
			definitionId,
			memberId: ref?.memberId ?? freshId(),
			occurrenceId,
		}),
	} as never)
	return id
}

function internalBindings(editor: Editor, root: BlockShape, bodyIds: ReadonlySet<TLShapeId>): TLBinding[] {
	const allowed = new Set<TLShapeId>([root.id, ...bodyIds])
	const byId = new Map<string, TLBinding>()
	for (const id of bodyIds) {
		for (const binding of editor.getBindingsInvolvingShape(id)) {
			if (allowed.has(binding.fromId) && allowed.has(binding.toId)) byId.set(binding.id, binding)
		}
	}
	return [...byId.values()]
}

function syncOccurrenceBody(editor: Editor, source: BlockShape, target: BlockShape): void {
	const definitionId = blockDefinitionId(source.props)
	if (!definitionId || source.id === target.id) return
	const sourceBody = stampOccurrenceMembers(editor, source)
	const targetBody = stampOccurrenceMembers(editor, target)
	const targetByMember = new Map(targetBody.flatMap((shape) => {
		const ref = memberRef(shape)
		return ref ? [[ref.memberId, shape] as const] : []
	}))
	const sourceIds = new Set(sourceBody.map((shape) => shape.id))
	const targetIds = new Set(targetBody.map((shape) => shape.id))
	const sourceToTarget = new Map<TLShapeId, TLShapeId>([[source.id, target.id]])
	const sourceMembers = new Set<string>()

	for (const shape of sourceBody) {
		const ref = memberRef(shape)
		if (!ref) continue
		sourceMembers.add(ref.memberId)
		const existing = targetByMember.get(ref.memberId)
		const mappedParent = shape.parentId === source.id
			? target.id
			: isShapeId(shape.parentId)
				? sourceToTarget.get(shape.parentId)
				: undefined
		if (!mappedParent) continue
		if (!existing) {
			sourceToTarget.set(shape.id, cloneShape(editor, shape, mappedParent, definitionId, target.id))
			continue
		}
		sourceToTarget.set(shape.id, existing.id)
		const { typeName: _typeName, id: _id, parentId: _parentId, ...rest } = shape
		editor.updateShape({
			...rest,
			id: existing.id,
			parentId: mappedParent,
			meta: withMemberRef(shape, { definitionId, memberId: ref.memberId, occurrenceId: target.id }),
		} as never)
	}

	const stale = targetBody.filter((shape) => {
		const ref = memberRef(shape)
		return ref && !sourceMembers.has(ref.memberId)
	})
	const staleIds = new Set(stale.map((shape) => shape.id))
	const staleRoots = stale.filter((shape) => !isShapeId(shape.parentId) || !staleIds.has(shape.parentId))
	if (staleRoots.length) editor.deleteShapes(staleRoots.map((shape) => shape.id))

	const targetBindings = internalBindings(editor, target, targetIds)
	if (targetBindings.length) editor.deleteBindings(targetBindings)
	const sourceBindings = internalBindings(editor, source, sourceIds)
	editor.createBindings(sourceBindings.flatMap((binding) => {
		const fromId = sourceToTarget.get(binding.fromId)
		const toId = sourceToTarget.get(binding.toId)
		return fromId && toId ? [{
			type: binding.type,
			fromId,
			toId,
			props: binding.props,
			meta: binding.meta,
		}] : []
	}) as never)
}

function syncLinkedProps(editor: Editor, source: BlockShape): void {
	if (!source.props.definitionId) return
	for (const target of linkedBlockOccurrences(editor, source)) {
		if (target.id === source.id || sameJson(semanticProps(target.props), semanticProps(source.props))
			&& target.props.definitionKey === source.props.definitionKey
			&& target.props.draftOrdinal === source.props.draftOrdinal) continue
		editor.updateShape<BlockShape>({
			id: target.id,
			type: target.type,
			props: applySemanticProps(target.props, source.props),
		})
	}
}

function syncLinkedBody(editor: Editor, sourceId: TLShapeId): void {
	const source = editor.getShape(sourceId)
	if (!isBlockShape(source)) return
	for (const target of linkedBlockOccurrences(editor, source)) syncOccurrenceBody(editor, source, target)
}

function bodySignature(editor: Editor, root: BlockShape): unknown {
	const visit = (parentId: TLShapeId): unknown[] => editor.getSortedChildIdsForParent(parentId).flatMap((id) => {
		const shape = editor.getShape(id)
		if (!shape) return []
		const props = isBlockShape(shape)
			? { ...semanticProps(shape.props), title: shape.props.title }
			: shape.props
		return [{
			type: shape.type,
			x: shape.x,
			y: shape.y,
			rotation: shape.rotation,
			props,
			children: visit(shape.id),
		}]
	})
	return visit(root.id)
}

function definitionContentSignature(editor: Editor, block: BlockShape): string {
	const semantic = semanticProps(block.props)
	return JSON.stringify({ ...semantic, title: undefined, body: bodySignature(editor, block) })
}

function updateDefinitionGroup(
	editor: Editor,
	group: readonly BlockShape[],
	patch: Pick<BlockShapeProps, 'definitionId' | 'definitionKey' | 'draftOrdinal'>,
): void {
	for (const block of group) {
		editor.updateShape<BlockShape>({
			id: block.id,
			type: block.type,
			props: { ...block.props, ...patch },
		})
	}
}

/** Finalize a title gesture: join matching content, or quietly allocate Draft N. */
export function commitBlockDefinitionName(editor: Editor, shapeId: TLShapeId): void {
	const raw = editor.getShape(shapeId)
	if (!isBlockShape(raw)) return
	const source = ensureBlockIdentity(editor, raw)
	const name = normalizedDefinitionName(source.props.title)
	const group = linkedBlockOccurrences(editor, source)
	if (!name) {
		updateDefinitionGroup(editor, group, {
			definitionId: source.props.definitionId,
			definitionKey: '',
			draftOrdinal: undefined,
		})
		return
	}
	const candidates = allBlocks(editor).filter((block) => (
		blockDefinitionId(block.props) !== source.props.definitionId
		&& normalizedDefinitionName(block.props.title) === name
	))
	const matching = candidates.find((candidate) => (
		definitionContentSignature(editor, candidate) === definitionContentSignature(editor, source)
	))
	if (matching) {
		updateDefinitionGroup(editor, group, {
			definitionId: matching.props.definitionId,
			definitionKey: matching.props.definitionKey || definitionKeyFor(name, matching.props.draftOrdinal),
			draftOrdinal: matching.props.draftOrdinal,
		})
		const rebound = editor.getShape(source.id)
		if (isBlockShape(rebound)) {
			syncLinkedProps(editor, rebound)
			syncLinkedBody(editor, rebound.id)
		}
		return
	}
	if (candidates.length) {
		const used = new Set(candidates.flatMap((candidate) => (
			candidate.props.draftOrdinal === undefined ? [] : [candidate.props.draftOrdinal]
		)))
		const ordinal = source.props.draftOrdinal !== undefined && !used.has(source.props.draftOrdinal)
			? source.props.draftOrdinal
			: 1 + Math.max(0, ...used)
		updateDefinitionGroup(editor, group, {
			definitionId: source.props.definitionId,
			definitionKey: availableDefinitionKey(
				editor,
				definitionKeyFor(name, ordinal),
				source.props.definitionId,
			),
			draftOrdinal: ordinal,
		})
		return
	}
	updateDefinitionGroup(editor, group, {
		definitionId: source.props.definitionId,
		definitionKey: availableDefinitionKey(editor, definitionKeyFor(name), source.props.definitionId),
		draftOrdinal: undefined,
	})
}

/** Repair legacy/file-import collisions once, without turning title keystrokes into commands. */
function reconcileExistingDefinitionNames(editor: Editor): void {
	const byName = new Map<string, BlockShape[]>()
	for (const block of allBlocks(editor)) {
		const name = normalizedDefinitionName(block.props.title)
		if (!name) continue
		const entries = byName.get(name) ?? []
		if (!entries.some((entry) => blockDefinitionId(entry.props) === blockDefinitionId(block.props))) {
			entries.push(block)
			byName.set(name, entries)
		}
	}
	for (const [name, definitions] of byName) {
		if (definitions.length < 2) continue
		const canonical = definitions.find((block) => block.props.draftOrdinal === undefined) ?? definitions[0]
		const canonicalSignature = definitionContentSignature(editor, canonical)
		const occupied = new Set(definitions.flatMap((block) => (
			block.props.draftOrdinal === undefined ? [] : [block.props.draftOrdinal]
		)))
		let nextDraft = 1
		for (const definition of definitions) {
			if (definition.id === canonical.id) continue
			const group = linkedBlockOccurrences(editor, definition)
			if (definitionContentSignature(editor, definition) === canonicalSignature) {
				updateDefinitionGroup(editor, group, {
					definitionId: canonical.props.definitionId,
					definitionKey: canonical.props.definitionKey || definitionKeyFor(name),
					draftOrdinal: canonical.props.draftOrdinal,
				})
				const rebound = editor.getShape(definition.id)
				if (isBlockShape(rebound)) syncLinkedBody(editor, rebound.id)
				continue
			}
			let ordinal = definition.props.draftOrdinal
			if (ordinal === undefined || (occupied.has(ordinal)
				&& definitions.some((other) => other.id !== definition.id && other.props.draftOrdinal === ordinal))) {
				while (occupied.has(nextDraft)) nextDraft += 1
				ordinal = nextDraft
			}
			occupied.add(ordinal)
			updateDefinitionGroup(editor, group, {
				definitionId: definition.props.definitionId,
				definitionKey: availableDefinitionKey(
					editor,
					definitionKeyFor(name, ordinal),
					definition.props.definitionId,
				),
				draftOrdinal: ordinal,
			})
		}
	}
}

function reconcileLinkedDefinitionCopies(editor: Editor): void {
	const representatives = new Map<string, TLShapeId>()
	for (const block of allBlocks(editor)) {
		const definitionId = blockDefinitionId(block.props)
		if (definitionId && !representatives.has(definitionId)) representatives.set(definitionId, block.id)
	}
	for (const id of representatives.values()) {
		const source = editor.getShape(id)
		if (!isBlockShape(source)) continue
		syncLinkedProps(editor, source)
		syncLinkedBody(editor, source.id)
	}
}

function numberedTitle(title: string, ordinal: number): string {
	const trimmed = title.trim()
	return trimmed.endsWith('()')
		? `${trimmed.slice(0, -2)}_${ordinal}()`
		: `${trimmed}_${ordinal}`
}

function uniqueTitle(editor: Editor, title: string): string {
	const occupied = new Set(allBlocks(editor).map((block) => normalizedDefinitionName(block.props.title)))
	for (let ordinal = 1; ; ordinal += 1) {
		const candidate = numberedTitle(title || 'block', ordinal)
		if (!occupied.has(candidate)) return candidate
	}
}

/** Break one occurrence away from its Definition and give it a collision-free visible name. */
export function unlinkBlockDefinition(
	editor: Editor,
	shapeId: TLShapeId,
	options: { markHistory?: boolean } = {},
): BlockShape | null {
	const current = editor.getShape(shapeId)
	if (!isBlockShape(current)) return null
	const title = uniqueTitle(editor, current.props.title)
	const definitionId = freshId()
	if (options.markHistory !== false) editor.markHistoryStoppingPoint('unlink block definition')
	editor.updateShape<BlockShape>({
		id: current.id,
		type: current.type,
		props: {
			...current.props,
			title,
			definitionId,
			definitionKey: availableDefinitionKey(editor, definitionKeyFor(title)),
			draftOrdinal: undefined,
		},
	})
	for (const shape of descendants(editor, current.id)) {
		const ref = memberRef(shape)
		if (!ref) continue
		editor.updateShape({
			id: shape.id,
			type: shape.type,
			meta: withMemberRef(shape, { ...ref, definitionId, occurrenceId: current.id }),
		} as never)
	}
	return editor.getShape(current.id) as BlockShape
}

/** Stock duplicate first (including children/bindings), then detach the new occurrence. */
export function duplicateBlockUnlinked(editor: Editor, shapeId: TLShapeId): BlockShape | null {
	const source = editor.getShape(shapeId)
	if (!isBlockShape(source)) return null
	const before = new Set(editor.getCurrentPageShapeIds())
	editor.markHistoryStoppingPoint('duplicate block unlinked')
	editor.duplicateShapes([source.id], { x: 32, y: 32 })
	const duplicate = editor.getSelectedShapes().find((shape): shape is BlockShape => (
		isBlockShape(shape) && !before.has(shape.id) && blockDefinitionId(shape.props) === blockDefinitionId(source.props)
	))
	return duplicate ? unlinkBlockDefinition(editor, duplicate.id, { markHistory: false }) : null
}

/**
 * Supported tldraw side effects keep materialized occurrences converged while
 * leaving their placement, outer wiring, current view and compact-view styling local.
 */
export function installDefinitionLinking(editor: Editor): () => void {
	let syncing = false
	let dirtyBodies = new Set<TLShapeId>()
	let needsCollisionSweep = false
	const markOwner = (shape: TLShape) => {
		const owner = rootOccurrenceForShape(editor, shape)
		if (owner) dirtyBodies.add(owner.id)
	}
	const run = (work: () => void) => {
		if (syncing) return
		syncing = true
		try { editor.run(work) } finally { syncing = false }
	}

	run(() => {
		for (const block of allBlocks(editor)) ensureBlockIdentity(editor, block)
		for (const block of allBlocks(editor)) stampOccurrenceMembers(editor, block)
		reconcileExistingDefinitionNames(editor)
		reconcileLinkedDefinitionCopies(editor)
	})

	const stopBeforeCreate = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
		if (!isBlockShape(shape)) return shape
		return {
			...shape,
			props: {
				...shape.props,
				definitionId: shape.props.definitionId || freshId(),
				definitionKey: shape.props.definitionKey || availableDefinitionKey(
					editor,
					definitionKeyFor(shape.props.title, shape.props.draftOrdinal),
					shape.props.definitionId,
				),
			},
		}
	})
	const stopAfterCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape) => {
		if (syncing) return
		if (isBlockShape(shape)) {
			syncLinkedProps(editor, shape)
			needsCollisionSweep = true
		}
		markOwner(shape)
	})
	const stopAfterChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after) => {
		if (syncing) return
		if (isBlockShape(after) && !sameJson(semanticProps(before.props as BlockShapeProps), semanticProps(after.props))) {
			run(() => syncLinkedProps(editor, after))
		}
		markOwner(before)
		markOwner(after)
	})
	const stopBeforeDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape) => {
		if (!syncing) markOwner(shape)
	})
	const markBinding = (binding: TLBinding) => {
		const from = editor.getShape(binding.fromId)
		const to = editor.getShape(binding.toId)
		if (from) markOwner(from)
		if (to) markOwner(to)
	}
	const stopBindingCreate = editor.sideEffects.registerAfterCreateHandler('binding', (binding) => {
		if (!syncing) markBinding(binding)
	})
	const stopBindingChange = editor.sideEffects.registerAfterChangeHandler('binding', (_before, after) => {
		if (!syncing) markBinding(after)
	})
	const stopBindingDelete = editor.sideEffects.registerBeforeDeleteHandler('binding', (binding) => {
		if (!syncing) markBinding(binding)
	})
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
		if (syncing || (dirtyBodies.size === 0 && !needsCollisionSweep)) return
		const pending = dirtyBodies
		dirtyBodies = new Set()
		const sweep = needsCollisionSweep
		needsCollisionSweep = false
		run(() => {
			for (const sourceId of pending) syncLinkedBody(editor, sourceId)
			if (sweep) reconcileExistingDefinitionNames(editor)
		})
	})

	return () => {
		stopComplete()
		stopBindingDelete()
		stopBindingChange()
		stopBindingCreate()
		stopBeforeDelete()
		stopAfterChange()
		stopAfterCreate()
		stopBeforeCreate()
	}
}
