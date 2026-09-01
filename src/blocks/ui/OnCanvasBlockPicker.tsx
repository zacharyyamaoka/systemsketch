/**
 * The offer a cable makes when it lands on nothing.
 *
 * Anchored to the loose terminal in viewport space and re-pinned on every
 * camera change, so it stays welded to the cable end while the board moves. It
 * is deliberately NOT a tldraw dialog: a dialog would take the canvas's focus
 * and swallow the Escape that should cancel the cable.
 */
import { useCallback, useEffect, useState } from 'react'
import {
	Vec,
	stopEventPropagation,
	useEditor,
	useQuickReactor,
	useValue,
	type Editor,
} from 'tldraw'

import {
	BLOCK_PICKER_PRESETS,
	blockPickerState,
	closeBlockPicker,
	type BlockPickerLocation,
	type BlockPickerPreset,
} from '../connections/blockPicker'
import {
	getConnectionPageCenter,
	getConnectionTerminals,
	type ConnectionShape,
} from '../connections/ConnectionShapeUtil'
import { CONNECTION_SHAPE_TYPE } from '../connections/connectionModel'

/** Where the offer sits: a loose terminal, or the midpoint of a cable to split. */
function pickerAnchorPagePoint(
	editor: Editor,
	connection: ConnectionShape,
	location: BlockPickerLocation,
): Vec {
	if (location === 'middle') return getConnectionPageCenter(editor, connection)
	const local = getConnectionTerminals(editor, connection)[location]
	return editor.getShapePageTransform(connection).applyToPoint(local)
}
import { BlockIconGlyph } from './blockIcons'
import './on-canvas-block-picker.css'

export function OnCanvasBlockPicker() {
	const editor = useEditor()
	// State, not a ref: the position reactor has to re-run once the element
	// exists, and a ref assignment is invisible to it. Without this the offer
	// paints at the viewport origin on the frame it opens.
	const [container, setContainer] = useState<HTMLDivElement | null>(null)
	const open = useValue('block picker open', () => blockPickerState.get(editor) !== null, [editor])

	const close = useCallback(() => closeBlockPicker(editor), [editor])

	// Track the cable's live terminal rather than the point it was opened at:
	// the board can be panned or zoomed while the picker is up.
	useQuickReactor(
		'on canvas block picker position',
		() => {
			const state = blockPickerState.get(editor)
			if (!state || !container) return
			const connection = editor.getShape<ConnectionShape>(state.connectionId)
			if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) {
				closeBlockPicker(editor)
				return
			}
			const page = pickerAnchorPagePoint(editor, connection, state.terminal)
			const viewport = editor.pageToViewport(page)
			container.style.transform = `translate(${viewport.x}px, ${viewport.y}px)`
		},
		[editor, container],
	)

	// The offer belongs to the select tool. Deriving that from the live tool id
	// rather than enumerating the ways to leave is the same lesson the armed
	// cable taught: `setCurrentTool` is a plain root transition, so every new
	// tool, shortcut and toolbar button would otherwise be another exit nobody
	// remembered to close.
	useQuickReactor(
		'on canvas block picker tool guard',
		() => {
			if (blockPickerState.get(editor) === null) return
			if (editor.getCurrentToolId() === 'select') return
			closeBlockPicker(editor)
		},
		[editor],
	)

	// Escape closes the offer without also cancelling anything behind it. The
	// listener is on the container's document so it fires before tldraw's own
	// global cancel reaches the select tool.
	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.stopPropagation()
			event.preventDefault()
			close()
		}
		const target = editor.getContainer().ownerDocument
		target.addEventListener('keydown', onKeyDown, { capture: true })
		return () => target.removeEventListener('keydown', onKeyDown, { capture: true })
	}, [open, close, editor])

	// A press anywhere else is a decline, not a pick.
	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: PointerEvent) => {
			if (container?.contains(event.target as Node)) return
			close()
		}
		const target = editor.getContainer().ownerDocument
		target.addEventListener('pointerdown', onPointerDown, { capture: true })
		return () => target.removeEventListener('pointerdown', onPointerDown, { capture: true })
	}, [open, close, editor, container])

	if (!open) return null

	const pick = (preset: BlockPickerPreset) => {
		const state = blockPickerState.get(editor)
		if (!state) return
		const connection = editor.getShape<ConnectionShape>(state.connectionId)
		if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) {
			close()
			return
		}
		const page = pickerAnchorPagePoint(editor, connection, state.terminal)
		// Clear the state before the callback so the opener's `onClose` cleanup
		// (which deletes a still-unbound cable) cannot fire after a successful pick.
		blockPickerState.set(editor, null)
		state.onPick(preset, Vec.From(page))
	}

	return (
		<div
			ref={setContainer}
			className="OnCanvasBlockPicker"
			data-testid="block-picker"
			role="menu"
			aria-label="Insert a Block"
			onPointerDown={stopEventPropagation}
		>
			<div className="OnCanvasBlockPicker-title">Insert a Block</div>
			{BLOCK_PICKER_PRESETS.map((preset) => (
				<button
					key={preset.id}
					type="button"
					role="menuitem"
					className="OnCanvasBlockPicker-item"
					data-testid={`block-picker-${preset.id}`}
					onPointerDown={stopEventPropagation}
					onClick={() => pick(preset)}
				>
					<BlockIconGlyph name={preset.icon} size={16} />
					<span>{preset.label}</span>
					<small>
						{preset.inputs}
						{' in · '}
						{preset.outputs}
						{' out'}
					</small>
				</button>
			))}
		</div>
	)
}
