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
	blockPickerPresetsFor,
	blockPickerState,
	closeBlockPicker,
	type BlockPickerPreset,
} from '../connections/blockPicker'
import {
	getConnectionTerminals,
	type ConnectionShape,
} from '../connections/ConnectionShapeUtil'
import {
	CONNECTION_SHAPE_TYPE,
	type ConnectionTerminal,
} from '../connections/connectionModel'

/** The loose terminal the offer sits on, in page space. */
function pickerAnchorPagePoint(
	editor: Editor,
	connection: ConnectionShape,
	location: ConnectionTerminal,
): Vec {
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
	// Only the presets that can answer: a cable looking for a producer is not
	// helped by a Sink, and one looking for a consumer not by a Source.
	const presets = useValue(
		'block picker presets',
		() => {
			const state = blockPickerState.get(editor)
			return state ? blockPickerPresetsFor(state.wantsProducer) : []
		},
		[editor],
	)

	const close = useCallback(() => closeBlockPicker(editor), [editor])
	const quickPresets = presets.filter((preset) => preset.group === 'quick')
	const ordinaryPresets = presets.filter((preset) => preset.group !== 'quick')

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
			// Custom properties rather than `transform`, so the stylesheet keeps
			// ownership of how the interface scale is applied on top of the anchor.
			container.style.setProperty('--systemsketch-block-picker-x', `${viewport.x}px`)
			container.style.setProperty('--systemsketch-block-picker-y', `${viewport.y}px`)

			// A cable that reaches LEFT for a producer must not have the panel laid
			// over it, so the panel goes on the far side of the terminal. The one
			// exception is a terminal close enough to the viewport's left edge that
			// the panel would land entirely off-screen: an invisible offer is worse
			// than one on the "wrong" side, and the cable still points the way.
			const wantsLeft = state.wantsProducer
			const fitsLeft = viewport.x - container.offsetWidth >= 0
			container.style.setProperty(
				'--systemsketch-block-picker-side',
				wantsLeft && fitsLeft ? '-100%' : '0px',
			)
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

	// Where the cable should meet the panel: the vertical centre of the first
	// option, because that is the one the wire would flow into. Measured from
	// the rendered panel so it survives the option list changing, and re-measured
	// per open because the interface scale changes what "first row" measures.
	useEffect(() => {
		if (!open || !container) return
		const first = container.querySelector<HTMLElement>('.OnCanvasBlockPicker-item')
		if (!first) return
		const anchor = first.offsetTop + first.offsetHeight / 2
		container.style.setProperty('--systemsketch-block-picker-anchor', `${anchor}px`)
	}, [open, container])

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
			{quickPresets.length > 0 && <div className="OnCanvasBlockPicker-group" data-testid="block-picker-quick-insert">Quick insert</div>}
			{quickPresets.map((preset) => (
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
			{quickPresets.length > 0 && ordinaryPresets.length > 0 && <div className="OnCanvasBlockPicker-group">Other Blocks</div>}
			{ordinaryPresets.map((preset) => (
				<button key={preset.id} type="button" role="menuitem" className="OnCanvasBlockPicker-item" data-testid={`block-picker-${preset.id}`} onPointerDown={stopEventPropagation} onClick={() => pick(preset)}>
					<BlockIconGlyph name={preset.icon} size={16} /><span>{preset.label}</span><small>{preset.inputs}{' in · '}{preset.outputs}{' out'}</small>
				</button>
			))}
		</div>
	)
}
