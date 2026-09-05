import { Vec, type Editor, type TLParentId, type TLShapeId, type VecLike } from 'tldraw'
import { EditorAtom } from '../ports/portState'
import {
	PROJECTION_BLOCK_TYPE,
	type BlockShapeProps,
	type BlockView,
} from '../blockModel'
import { stockBlockPresetProps, type StockBlockPresetId } from '../stockBlocks'
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
	/** A curated semantic Block whose full rows/config are authored by its factory. */
	stockPreset?: StockBlockPresetId
	/** Edge-local data vocabulary comes first because it answers the cable immediately. */
	group?: 'quick'
}

export const BLOCK_PICKER_PRESETS: readonly BlockPickerPreset[] = [
	{ id: 'call', label: 'Call', icon: 'SquareFunction', blockType: 'call', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'transform', label: 'Transform', icon: 'ArrowRightLeft', blockType: 'transform', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'branch', label: 'Branch', icon: 'GitBranch', blockType: 'branch', view: 'port', inputs: 1, outputs: 2 },
	{ id: 'store', label: 'Store', icon: 'Database', blockType: 'store', view: 'port', inputs: 1, outputs: 1 },
	{ id: 'sink', label: 'Sink', icon: 'Terminal', blockType: 'sink', view: 'port', inputs: 1, outputs: 0 },
	{ id: 'source', label: 'Source', icon: 'Zap', blockType: 'source', view: 'port', inputs: 0, outputs: 1 },
	// A variable: the capsule, with an inlet and an outlet. A cable wanting a
	// producer gets a literal to type; one wanting a consumer gets a named result.
	{ id: 'value', label: 'Value', icon: 'Braces', blockType: 'literal', view: 'value', inputs: 1, outputs: 1 },
	{ id: 'bundle', label: 'Bundle', icon: 'PackagePlus', blockType: 'bundle', view: 'port', inputs: 2, outputs: 1, stockPreset: 'bundle', group: 'quick' },
	// Reading a member is function application, so its established picker id is
	// preserved for saved fixtures while fresh Blocks use the canonical Unbundle type.
	{ id: 'projection', label: 'Unbundle', icon: 'Shuffle', blockType: PROJECTION_BLOCK_TYPE, view: 'port', inputs: 1, outputs: 1, stockPreset: 'unbundle', group: 'quick' },
	{ id: 'copy', label: 'Copy', icon: 'Copy', blockType: 'copy', view: 'port', inputs: 1, outputs: 1, stockPreset: 'copy', group: 'quick' },
	{ id: 'set-attributes', label: 'Set attributes', icon: 'Settings', blockType: 'set-attributes', view: 'port', inputs: 2, outputs: 1, stockPreset: 'set-attributes' },
	{ id: 'select', label: 'Select', icon: 'GitBranch', blockType: 'select', view: 'port', inputs: 3, outputs: 1, stockPreset: 'select' },
	{ id: 'clock-trigger', label: 'Clock / Trigger', icon: 'Timer', blockType: 'clock-trigger', view: 'port', inputs: 0, outputs: 1, stockPreset: 'clock-trigger' },
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

// History marks are UI-session state, never board data. The drag creates the
// cable before the menu click, so this bridges that one interaction boundary.
const pickerCreationMarks = new WeakMap<Editor, Map<TLShapeId, string>>()
export function rememberPickerCreationMark(editor: Editor, connectionId: TLShapeId, mark: string): void {
	const marks = pickerCreationMarks.get(editor) ?? new Map<TLShapeId, string>()
	// WHY: stock cancellation can remove its cable after the shape util callback;
	// pruning on the next creation keeps this UI-only bridge from retaining dead IDs.
	for (const id of marks.keys()) if (!editor.getShape(id)) marks.delete(id)
	marks.set(connectionId, mark)
	pickerCreationMarks.set(editor, marks)
}
export function takePickerCreationMark(editor: Editor, connectionId: TLShapeId): string | undefined {
	const marks = pickerCreationMarks.get(editor)
	const mark = marks?.get(connectionId)
	marks?.delete(connectionId)
	return mark
}

/** Drop a transient history bridge when a loose cable resolves without a picker. */
export function forgetPickerCreationMark(editor: Editor, connectionId: TLShapeId): void {
	pickerCreationMarks.get(editor)?.delete(connectionId)
}
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
	if (preset.stockPreset) return stockBlockPresetProps(preset.stockPreset, base)
	const projection = preset.blockType === PROJECTION_BLOCK_TYPE
	const inputs = Array.from({ length: preset.inputs }, (_, index) => ({
		id: `in_${index + 1}`,
		// A projection's inlet is the type itself, so it carries no name of its
		// own; the type arrives from the cable that opened the picker.
		name: (preset.view === 'value' || projection) ? '' : `in_${index + 1}`,
		type: '',
		visible: true,
	}))
	const outputs = Array.from({ length: preset.outputs }, (_, index) => ({
		id: `out_${index + 1}`,
		// A capsule's outlet name IS the variable name, and a fresh literal has
		// none: it is passed inline until someone names it.
		name: preset.view === 'value' ? '' : projection ? '.' : `out_${index + 1}`,
		// An accessor is assumed to decompose properly, so its type is simply not
		// filled in yet. `?` is reserved for what was looked at and could not be told.
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
