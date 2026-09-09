/**
 * The live stack: an Expanded Block in `bodyLayout: 'stack'` keeps its members
 * laid out continuously, in their authored order.
 *
 * Structure copied from `blockAutoResize.ts` on purpose: subscribe at tldraw's
 * supported side-effect seam, note dirty parents, settle ONCE after the
 * operation and never while a pointer gesture is active, write with history
 * ignored, and filter the pass's own writes so it cannot feed itself.
 *
 * The order is tldraw's own child `index`. A member the user has just dragged
 * to a new height re-takes its slot from where it landed (the same "decide at
 * the landing" judge a cable's polarity uses), by permuting the members' existing
 * indexes — so their z-order relative to cables and annotations never changes.
 */
import {
	isShapeId,
	type Editor,
	type IndexKey,
	type TLEventInfo,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import {
	blockBodyLayout,
	blockMemberSpacing,
	blockMemberWidth,
	isBlockShape,
	isExpandedBlockShape,
	resizeBlockProps,
	type BlockShape,
} from './blockModel'
import { isBlockAutoResizeGestureActive } from './blockAutoResize'
import { layoutBlock } from './layoutBlock'
import { stackMemberPlacements, type StackMember } from './memberLayout'

/**
 * Shapes that never take a slot. Stock tldraw shapes are annotations — a
 * rectangle, a line, a sticky beside a member stays where it was put — and
 * the app's own non-box shapes (cables, port dots, arms, control glyphs) belong
 * to something else. Everything with a box of its own is a member: a Block, a
 * Code block, a region.
 */
const NON_MEMBER_TYPES = new Set([
	'geo', 'arrow', 'text', 'note', 'draw', 'line', 'highlight', 'image', 'video', 'embed',
	'frame', 'group', 'bookmark',
	'connection', 'floating-port', 'branch-arm', 'behaviorTreeControl',
	'systemsketch-bt-insert-glyph', 'variableRegistry',
])

export function isStackMemberShape(shape: TLShape | undefined): shape is TLShape & { props: { w: number; h: number } } {
	if (!shape || NON_MEMBER_TYPES.has(shape.type)) return false
	const props = shape.props as { w?: unknown; h?: unknown }
	return typeof props.w === 'number' && typeof props.h === 'number'
}

export function isStackBlock(shape: TLShape | undefined): shape is BlockShape {
	return isExpandedBlockShape(shape) && blockBodyLayout(shape.props) === 'stack'
}

export function stackMemberOf(shape: TLShape & { props: { w: number; h: number } }): StackMember {
	return {
		id: shape.id,
		type: shape.type,
		x: shape.x,
		y: shape.y,
		w: shape.props.w,
		h: shape.props.h,
		view: isBlockShape(shape) ? shape.props.view : undefined,
	}
}

/** The stack's members in authored (index) order. */
export function blockStackMembers(editor: Editor, parentId: TLShapeId): (TLShape & { props: { w: number; h: number } })[] {
	return editor.getSortedChildIdsForParent(parentId).flatMap((id) => {
		const shape = editor.getShape(id)
		return isStackMemberShape(shape) ? [shape] : []
	})
}

/**
 * Give `ordered` the members' existing indexes, in that order. A permutation
 * rather than fresh indexes keeps every member where it was in z relative to
 * the cables `keepConnectionsAtBottom` parks beneath them.
 */
export function assignMemberOrder(editor: Editor, ordered: readonly TLShape[]): void {
	const indexes = [...ordered].map((shape) => shape.index).sort() as IndexKey[]
	const updates = ordered.flatMap((shape, position) => (
		shape.index === indexes[position] ? [] : [{ id: shape.id, type: shape.type, index: indexes[position] }]
	))
	if (updates.length > 0) editor.updateShapes(updates)
}

/** Members in landing order: by vertical midpoint, ties broken by the authored order. */
function membersByLanding(members: readonly (TLShape & { props: { w: number; h: number } })[]) {
	return [...members]
		.map((shape, position) => ({ shape, position, mid: shape.y + shape.props.h / 2 }))
		.sort((a, b) => a.mid - b.mid || a.position - b.position)
		.map((entry) => entry.shape)
}

/**
 * One settled pass over one stack Block. Returns true when it wrote anything.
 * Exported so a command can run it synchronously after its own write, in the
 * same undo step, when the arrangement IS the gesture.
 */
export function layoutBlockStack(
	editor: Editor,
	parentId: TLShapeId,
	options: { order?: 'landing' | 'authored' } = {},
): boolean {
	const parent = editor.getShape(parentId)
	if (!isStackBlock(parent)) return false
	const members = blockStackMembers(editor, parent.id)
	if (members.length === 0) return false

	// WHY two orders: the settle pass trusts where a member LANDED (a canvas
	// drag is the reorder gesture); a list command has just written the authored
	// order and must not have it undone by the stale positions it is about to fix.
	const ordered = options.order === 'authored' ? members : membersByLanding(members)
	if (options.order !== 'authored') assignMemberOrder(editor, ordered)

	const spacing = blockMemberSpacing(parent.props)
	const width = blockMemberWidth(parent.props)
	const { placements, bodyBottom } = stackMemberPlacements(parent.props, ordered.map(stackMemberOf), spacing, width)
	const updates: Array<{ id: TLShapeId; type: string; x?: number; y?: number; props?: object }> = []
	ordered.forEach((member, position) => {
		const placement = placements[position]
		const moved = Math.abs(member.x - placement.x) > 0.001 || Math.abs(member.y - placement.y) > 0.001
		const resized = Math.abs(member.props.w - placement.w) > 0.001
		if (!moved && !resized) return
		const props = resized && isBlockShape(member)
			? resizeBlockProps(member.props, placement.w, member.props.h)
			: undefined
		updates.push({ id: member.id, type: member.type, x: placement.x, y: placement.y, ...(props ? { props } : {}) })
	})

	if (parent.props.autoResize) {
		// Hug. Only Own members feed the width, so a Fill member can never widen
		// the parent that just widened it — the fixed point is reached in one pass.
		const frame = layoutBlock(parent.props)
		const ownWidths = ordered.flatMap((member, position) => (
			placements[position].w === member.props.w ? [member.props.w] : []
		))
		const nextW = ownWidths.length > 0 ? Math.max(...ownWidths) + spacing.gutter * 2 : parent.props.w
		// Everything the frame paints under its body: the description well when the
		// Block shows one, then the footer. Read off the frame rather than summed
		// from constants so a chrome toggle (footer hidden, description shown) is honoured.
		const chromeBelow = frame.description
			? frame.height - frame.description.y
			: frame.height - frame.footerTop
		const nextH = bodyBottom + Math.max(0, chromeBelow)
		if (Math.abs(nextW - parent.props.w) > 0.001 || Math.abs(nextH - parent.props.h) > 0.001) {
			updates.push({ id: parent.id, type: parent.type, props: resizeBlockProps(parent.props, nextW, nextH) })
		}
	}
	if (updates.length === 0) return false
	editor.updateShapes(updates as never)
	return true
}

type StackSource = 'user' | 'remote'

function noteStackAncestors(
	editor: Editor,
	shape: TLShape | undefined,
	source: StackSource,
	pending: Map<TLShapeId, StackSource>,
	laying: ReadonlySet<TLShapeId>,
): void {
	let current = shape
	while (current) {
		if (isStackBlock(current) && !laying.has(current.id) && pending.get(current.id) !== 'user') {
			pending.set(current.id, source)
		}
		if (!isShapeId(current.parentId)) return
		current = editor.getShape(current.parentId)
	}
}

/** Subscribe at the side-effect seam; settle once per operation, after any gesture. */
export function installBlockMemberStack(editor: Editor): () => void {
	let pending = new Map<TLShapeId, StackSource>()
	let queued = false
	let disposed = false
	const laying = new Set<TLShapeId>()

	const note = (shape: TLShape | undefined, source: string) => {
		noteStackAncestors(editor, shape, source === 'remote' ? 'remote' : 'user', pending, laying)
	}
	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => note(shape, source))
	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		// A member leaving the stack still dirties the stack it left.
		note(before, source)
		note(after, source)
	})
	const stopDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape) => {
		if (isShapeId(shape.parentId)) note(editor.getShape(shape.parentId), 'user')
	})

	const settle = () => {
		queued = false
		if (disposed || pending.size === 0) return
		// WHY: stock translation must be the sole geometry writer while a pointer
		// gesture is active — a live write corrupts tldraw's drag snapshot. Keep the
		// dirty set and lay out once the gesture has landed.
		if (isBlockAutoResizeGestureActive(editor)) return
		const entries = pending
		pending = new Map()
		for (const [id, source] of entries) {
			const pass = () => {
				laying.add(id)
				try {
					layoutBlockStack(editor, id)
				} finally {
					// Store side effects may flush right after `editor.run` returns; keep
					// the marker through that microtask so this pass's own writes are
					// filtered while an outer stack still sees its member change size.
					queueMicrotask(() => laying.delete(id))
				}
			}
			if (source === 'remote') editor.store.mergeRemoteChanges(pass)
			else editor.run(pass, { history: 'ignore' })
		}
		if (pending.size > 0) schedule()
	}
	const schedule = () => {
		if (queued || disposed) return
		queued = true
		queueMicrotask(settle)
	}
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(schedule)
	const onEvent = (info: TLEventInfo) => {
		if (info.name === 'pointer_up' || info.name === 'cancel' || info.name === 'interrupt') schedule()
	}
	editor.on('event', onEvent)

	// A loaded board settles once, via remote semantics, so opening it creates no undo.
	for (const record of editor.store.allRecords()) {
		if (record.typeName !== 'shape') continue
		const shape = editor.getShape(record.id as TLShapeId)
		if (isStackBlock(shape)) pending.set(shape.id, 'remote')
	}
	schedule()

	return () => {
		disposed = true
		editor.off('event', onEvent)
		stopComplete()
		stopDelete()
		stopChange()
		stopCreate()
	}
}
