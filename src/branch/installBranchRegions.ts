/**
 * Keep every semantic Branch projected into one invisible frame per arm.
 *
 * The projection is repaired after complete editor operations, so drawing,
 * dropping, folding, copy/paste, undo and document loading all converge on the
 * same tree without a parallel React state model.
 */
import { isShapeId, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { isBranchShape } from './branchModel'
import { isBranchArmShape } from './BranchArmShapeUtil'
import { owningBranchId, reconcileBranchArmFrames } from './branchArmFrames'

type RepairSource = 'user' | 'remote'

function branchIdForShape(editor: Editor, shape: TLShape): TLShapeId | null {
	if (isBranchShape(shape)) return shape.id
	if (!isShapeId(shape.parentId)) return null
	const parent = editor.getShape(shape.parentId)
	if (isBranchShape(parent)) return parent.id
	if (isBranchArmShape(parent) && isShapeId(parent.parentId)) {
		return isBranchShape(editor.getShape(parent.parentId)) ? parent.parentId : null
	}
	return null
}

export function installBranchRegions(editor: Editor): () => void {
	let pending = new Map<TLShapeId, RepairSource>()
	let normalizingSelection = false

	const queue = (id: TLShapeId, source: RepairSource) => {
		// A local edit wins over a remote/load repair so its structural changes
		// remain in the same ordinary editor operation and autosave stream.
		if (pending.get(id) === 'user') return
		pending.set(id, source)
	}
	const noteShape = (shape: TLShape, source: RepairSource) => {
		const id = branchIdForShape(editor, shape)
		if (id) queue(id, source)
	}

	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		noteShape(shape, source === 'remote' ? 'remote' : 'user')
	})
	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		const repairSource = source === 'remote' ? 'remote' : 'user'
		if (
			before.parentId !== after.parentId
			|| before.x !== after.x
			|| before.y !== after.y
			|| (isBranchShape(after) && isBranchShape(before) && before.props.arms !== after.props.arms)
			|| isBranchArmShape(before)
			|| isBranchArmShape(after)
		) {
			noteShape(before, repairSource)
			noteShape(after, repairSource)
		}
	})
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(() => {
		let pass = 0
		while (pending.size > 0 && pass < 3) {
			pass += 1
			const branchEntries = pending
			pending = new Map()
			for (const [id, source] of branchEntries) {
				const repair = () => {
					const branch = editor.getShape(id)
					if (isBranchShape(branch)) reconcileBranchArmFrames(editor, branch)
				}
				if (source === 'remote') editor.store.mergeRemoteChanges(repair)
				else repair()
			}
		}
	})

	// An internal helper must never become a user-facing selection. Replacing it
	// synchronously also means dragging an arm edge moves/selects the Branch,
	// exactly as dragging the Branch's own border did before helpers existed.
	const stopSelection = editor.sideEffects.registerAfterChangeHandler(
		'instance_page_state',
		(_before, after) => {
			if (normalizingSelection) return
			const selected = after.selectedShapeIds
			const normalized = selected.map((id) => owningBranchId(editor, id) ?? id)
			if (normalized.every((id, index) => id === selected[index])) return
			normalizingSelection = true
			try {
				editor.setSelectedShapes([...new Set(normalized)])
			} finally {
				normalizingSelection = false
			}
		},
	)

	// Embedded documents are loaded before this installer runs; the desktop
	// workspace may load afterwards and is covered by the remote handlers above.
	editor.store.mergeRemoteChanges(() => {
		for (const record of editor.store.allRecords()) {
			if (record.typeName !== 'shape') continue
			const branch = editor.getShape(record.id as TLShapeId)
			if (isBranchShape(branch)) reconcileBranchArmFrames(editor, branch)
		}
	})

	return () => {
		stopSelection()
		stopCreate()
		stopChange()
		stopComplete()
	}
}
