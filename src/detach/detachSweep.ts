/**
 * Execute a detach plan: one history stopping point, five ordered phases.
 *
 * The phases are the whole point — see `detachableKind.ts` for the two
 * invariants they protect. In order:
 *
 *   survey      read connected-port facts while every cable is still semantic
 *   edges       plain cables lower while both endpoint shapes still stand
 *   leaf nodes  kinds that lower their own incident cables go while their far
 *               endpoints still exist
 *   containers  wrappers reduce after their contents lowered or escaped
 *   finalize    arrows bound to a non-rebuildable replacement lose their
 *               Block-rebuild promise — the far end can never come home
 *
 * WHY: this replaces a hand-ordered, kind-naming dispatcher; the sequencing
 * constraints live here once instead of being re-derived per composite — see
 * docs/peps/0005-hierarchical-detach.md.
 */
import type { Editor, TLArrowBinding, TLShapeId } from 'tldraw'

import { detachMeta, readDetachedConnection } from '../blocks/detach/detachModel'
import type { DetachableKind, LoweredNode } from './detachableKind'
import { planDetach } from './detachPlan'

export interface DetachSweepResult {
	/** Replacement facts per lowered node participant, keyed by the original id. */
	lowered: Map<TLShapeId, LoweredNode>
	/** Stock arrows that replaced lowered cables, keyed by the original id. */
	arrows: Map<TLShapeId, TLShapeId>
}

export interface DetachSweepOptions {
	/** Mark a history stopping point (default true). The export clone passes false. */
	mark?: boolean
	/** Replace the selection with the replacements (default true). */
	select?: boolean
}

export function runDetachSweep(
	editor: Editor,
	requestedIds: readonly TLShapeId[],
	kinds: readonly DetachableKind[],
	options: DetachSweepOptions = {},
): DetachSweepResult {
	const result: DetachSweepResult = { lowered: new Map(), arrows: new Map() }
	const plan = planDetach(editor, requestedIds, kinds)
	if (plan.edges.length === 0 && plan.nodes.length === 0) return result

	// `editor.groupShapes` returns early — silently — unless the select tool is
	// active. Detaching from the context menu while another tool is armed would
	// otherwise leave a heap of loose primitives, and nothing would say so.
	if (editor.getCurrentToolId() !== 'select') editor.setCurrentTool('select')
	// One mark for the whole sweep, and none inside it: a second stopping point
	// in the middle would split the undo into "some of it came back".
	if (options.mark !== false) editor.markHistoryStoppingPoint('detach to primitives')

	// Any kind may wrap the sweep (a region suppresses its reactive repair for
	// the duration). Wrappers nest; each is a cheap counter when idle.
	const body = () => {
		editor.run(() => {
			executePhases(editor, plan, result, options)
		})
	}
	const wrapped = kinds.reduceRight<() => void>(
		(next, kind) => (kind.aroundSweep ? () => kind.aroundSweep!(editor, next) : next),
		body,
	)
	wrapped()
	return result
}

function executePhases(
	editor: Editor,
	plan: ReturnType<typeof planDetach>,
	result: DetachSweepResult,
	options: DetachSweepOptions,
): void {
	const replacementSelection = new Set<TLShapeId>()
	/** Replacement roots owed to each owning composite, in lowering order. */
	const adoptions = new Map<TLShapeId, TLShapeId[]>()
	const adopt = (ownerId: TLShapeId | null, rootIds: readonly TLShapeId[]) => {
		if (ownerId === null || rootIds.length === 0) return
		const bucket = adoptions.get(ownerId) ?? []
		bucket.push(...rootIds)
		adoptions.set(ownerId, bucket)
	}

	// --- survey: read facts that die during the sweep, before any mutation ---
	const surveyed = new Map<TLShapeId, ReadonlySet<string>>()
	for (const participant of plan.nodes) {
		if (!participant.kind.surveyConnectedPortIds) continue
		const shape = editor.getShape(participant.id)
		if (!shape) continue
		surveyed.set(participant.id, participant.kind.surveyConnectedPortIds(editor, shape))
	}

	// --- edges: lower while both endpoint shapes still stand ---
	for (const participant of plan.edges) {
		const shape = editor.getShape(participant.id)
		if (!shape || !participant.kind.matches(shape)) continue
		const lowered = participant.kind.lowerEdge?.(editor, shape)
		if (!lowered) continue
		result.arrows.set(participant.id, lowered.arrowId)
		adopt(participant.ownerId, [lowered.rootId])
		if (participant.selectable) replacementSelection.add(lowered.rootId)
	}

	// --- nodes: leaves before containers, contributions before their owner ---
	const nonRebuildableTargets: TLShapeId[] = []
	for (const participant of plan.nodes) {
		const shape = editor.getShape(participant.id)
		if (!shape || !participant.kind.matches(shape)) continue
		const lowered = participant.kind.lowerNode?.(editor, shape, {
			connectedPortIds: surveyed.get(participant.id) ?? new Set(),
			contributedRootIds: adoptions.get(participant.id) ?? [],
		})
		if (!lowered) continue
		result.lowered.set(participant.id, lowered)
		adopt(participant.ownerId, lowered.rootIds)
		if (participant.selectable && lowered.selectionId !== null) {
			replacementSelection.add(lowered.selectionId)
		}
		if (participant.kind.rebuildable !== true && lowered.bindingTargetId !== null) {
			nonRebuildableTargets.push(lowered.bindingTargetId)
		}
	}

	// --- finalize: a rebuild promise needs a Block on both ends eventually.
	// An arrow now bound to a container's card (or any other non-rebuildable
	// replacement) can never become a semantic cable again; keep the stock
	// arrow, clear the misleading promise. ---
	for (const targetId of nonRebuildableTargets) {
		for (const binding of editor.getBindingsToShape<TLArrowBinding>(targetId, 'arrow')) {
			const arrow = editor.getShape(binding.fromId)
			if (!arrow || arrow.type !== 'arrow') continue
			const record = readDetachedConnection(arrow.meta)
			if (!record || !record.rebuildWithBlocks) continue
			editor.updateShape({
				id: arrow.id,
				type: 'arrow',
				meta: detachMeta({ ...record, rebuildWithBlocks: false }),
			})
		}
	}

	// A semantic selection should stay a selection after its primitives take
	// over; otherwise right-clicking Detach makes the result unexpectedly
	// disappear from the user's active context.
	if (options.select !== false && replacementSelection.size > 0) {
		editor.setSelectedShapes([...replacementSelection])
	}
}
