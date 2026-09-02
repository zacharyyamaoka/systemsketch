import { Vec, type Editor, type TLParentId, type TLShapeId, type VecLike } from 'tldraw'
import { EditorAtom } from '../ports/portState'
import type { BlockShapeProps, BlockView } from '../blockModel'
import type { ConnectionTerminal } from './connectionModel'

/**
 * A cable that landed on nothing is a question, not a mistake.
 *
 * Both tldraw starter kits answer a drop into empty space by offering what to
 * put there, anchored to the loose end, and binding the new node's first
 * compatible port to it. SystemSketch has one Block type rather than the kits'
 * node zoo, so the offer is a small set of shaped presets plus a plain Block.
 *
 * The state is an editor-scoped atom for the same reason the port highlights
 * are: an unanswered question must never reach the document.
 */
export interface BlockPickerPreset {
	id: string
	label: string
	icon: string
	blockType: string
	view: BlockView
	inputs: number
	outputs: number
}

export const BLOCK_PICKER_PRESETS: readonly BlockPickerPreset[] = [
	{ id: 'call', label: 'Call', icon: 'SquareFunction', blockType: 'call', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'transform', label: 'Transform', icon: 'ArrowRightLeft', blockType: 'transform', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'branch', label: 'Branch', icon: 'GitBranch', blockType: 'branch', view: 'port', inputs: 1, outputs: 2 },
	{ id: 'store', label: 'Store', icon: 'Database', blockType: 'store', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'sink', label: 'Sink', icon: 'Terminal', blockType: 'sink', view: 'port', inputs: 1, outputs: 0 },
	{ id: 'source', label: 'Source', icon: 'Zap', blockType: 'source', view: 'port', inputs: 0, outputs: 1 },
	// A literal argument: the capsule. Offered only to a cable that wants a producer.
	{ id: 'value', label: 'Value', icon: 'Braces', blockType: 'literal', view: 'value', inputs: 0, outputs: 1 },
	{ id: 'group', label: 'Expanded group', icon: 'Boxes', blockType: 'group', view: 'expanded', inputs: 1, outputs: 1 },
]

/** The presets that can actually answer the cable: a producer needs an output, a consumer an input. */
export function blockPickerPresetsFor(wantsProducer: boolean): BlockPickerPreset[] {
	return BLOCK_PICKER_PRESETS.filter((preset) => (
		wantsProducer ? preset.outputs > 0 : preset.inputs > 0
	))
}

export interface BlockPickerState {
	connectionId: TLShapeId
	/** The loose handle that is asking, and where the offer anchors. */
	terminal: ConnectionTerminal
	/** Page point the new Block's matching port should land on. */
	anchor: VecLike
	/**
	 * Whether the cable is looking for something to feed it (a producer, whose
	 * output lands on the cable end) or something to feed (a consumer). Decides
	 * which presets are offered and which side of the cable end the panel sits.
	 */
	wantsProducer: boolean
	/** The scope the new Block will be created in: a page or an Expanded Block. */
	scopeId: TLParentId
	onPick: (preset: BlockPickerPreset, anchorInPageSpace: Vec) => void
	onClose: () => void
}

export const blockPickerState = new EditorAtom<BlockPickerState | null>(
	'on canvas block picker',
	() => null,
)

export function openBlockPicker(editor: Editor, state: BlockPickerState): void {
	// An open offer is the thing to answer. Leaving the cable selected underneath
	// it puts the selection menu on screen at the same time, competing with the
	// offer for the same click — the donor clears the selection here too.
	editor.selectNone()
	blockPickerState.set(editor, state)
}

/** Dismiss the picker and run whatever cleanup the opener registered. */
export function closeBlockPicker(editor: Editor): void {
	const state = blockPickerState.get(editor)
	if (!state) return
	blockPickerState.set(editor, null)
	state.onClose()
}

export function blockPickerIsOpen(editor: Editor): boolean {
	return blockPickerState.get(editor) !== null
}

/**
 * Build the props for a picked preset.
 *
 * Ports are named `in_1…` / `out_1…` so they match what the inspector's own Add
 * control produces; nothing downstream should be able to tell a Block born from
 * the picker apart from one drawn by hand.
 */
export function blockPresetProps(
	preset: BlockPickerPreset,
	base: BlockShapeProps,
): BlockShapeProps {
	const inputs = Array.from({ length: preset.inputs }, (_, index) => ({
		id: `in_${index + 1}`,
		name: `in_${index + 1}`,
		type: '',
		visible: true,
	}))
	const outputs = Array.from({ length: preset.outputs }, (_, index) => ({
		id: `out_${index + 1}`,
		// A capsule's outlet name IS the variable name, and a fresh literal has
		// none: it is passed inline until someone names it.
		name: preset.view === 'value' ? '' : `out_${index + 1}`,
		type: '',
		visible: true,
	}))
	const size = base.views[preset.view]
	return {
		...base,
		blockType: preset.blockType,
		icon: preset.icon,
		view: preset.view,
		w: size.w,
		h: size.h,
		inputs,
		outputs,
	}
}
