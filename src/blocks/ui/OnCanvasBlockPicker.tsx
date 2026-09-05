/**
 * The offer a cable makes when it lands on nothing.
 *
 * Anchored to the loose terminal in viewport space and re-pinned on every
 * camera change, so it stays welded to the cable end while the board moves. It
 * It is deliberately NOT a tldraw dialog: this compact command surface moves
 * focus to its first action, while its document-level guard keeps Escape and
 * Undo bound to cancelling the unfinished cable rather than a modal lifecycle.
 */
import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
	Vec,
	stopEventPropagation,
	useAtom,
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
import { useInterfaceScale } from '../../settings/interfaceScale'

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
	const sizeEpoch = useAtom('on-canvas block picker size', 0)
	const interfaceScale = useInterfaceScale()
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

	useEffect(() => {
		if (!container) return
		const observer = new ResizeObserver(() => sizeEpoch.update((epoch) => epoch + 1))
		observer.observe(container)
		return () => observer.disconnect()
	}, [container, sizeEpoch])

	useEffect(() => {
		sizeEpoch.update((epoch) => epoch + 1)
	}, [interfaceScale, sizeEpoch])

	// Track the cable's live terminal rather than the point it was opened at:
	// the board can be panned or zoomed while the picker is up.
	useQuickReactor(
		'on canvas block picker position',
		() => {
			const state = blockPickerState.get(editor)
			const viewportBounds = editor.getViewportScreenBounds()
			sizeEpoch.get()
			if (!state || !container) return
			const connection = editor.getShape<ConnectionShape>(state.connectionId)
			if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) {
				closeBlockPicker(editor)
				return
			}
			const page = pickerAnchorPagePoint(editor, connection, state.terminal)
			const viewport = editor.pageToViewport(page)
			const margin = 8
			const scale = (interfaceScale || 100) / 100
			const width = container.offsetWidth * scale
			const maxHeight = Math.max(120, viewportBounds.h - margin * 2) / scale
			container.style.maxHeight = `${maxHeight}px`
			const height = Math.min(container.scrollHeight, maxHeight) * scale
			const first = container.querySelector<HTMLElement>('.OnCanvasBlockPicker-item')
			const anchor = ((first?.offsetTop ?? 0) + (first?.offsetHeight ?? 0) / 2) * scale

			// Prefer the flow-facing side, then flip and finally clamp. Quick access
			// has to remain quick at the bottom and right edges too; otherwise the
			// newly promoted second and third choices can be outside the viewport.
			const leftOfCable = viewport.x - width
			const rightOfCable = viewport.x
			const preferred = state.wantsProducer
				? (leftOfCable >= margin ? leftOfCable : rightOfCable)
				: (rightOfCable + width <= viewportBounds.w - margin ? rightOfCable : leftOfCable)
			const x = Math.min(Math.max(preferred, margin), Math.max(margin, viewportBounds.w - width - margin))
			const idealY = viewport.y - anchor
			const y = Math.min(Math.max(idealY, margin), Math.max(margin, viewportBounds.h - height - margin))

			// Custom properties rather than `transform`, so the stylesheet keeps
			// ownership of the interface scale applied at this measured top-left.
			container.style.setProperty('--systemsketch-block-picker-x', `${Math.round(x)}px`)
			container.style.setProperty('--systemsketch-block-picker-y', `${Math.round(y)}px`)
		},
		[editor, container, interfaceScale, sizeEpoch],
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
			if (editor.getCurrentToolId() === 'select' && !editor.getIsReadonly()) return
			closeBlockPicker(editor)
		},
		[editor],
	)

	// Escape or Undo closes the unfinished offer without also cancelling or
	// undoing anything behind it. The listener is on the container's document so
	// it fires before tldraw's own global shortcut reaches the select tool.
	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			const cancelsOffer = event.key === 'Escape'
				|| ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z')
			if (!cancelsOffer) return
			event.stopPropagation()
			event.preventDefault()
			close()
		}
		const target = editor.getContainer().ownerDocument
		target.addEventListener('keydown', onKeyDown, { capture: true })
		return () => target.removeEventListener('keydown', onKeyDown, { capture: true })
	}, [open, close, editor])

	// A loose cable is already a pointer gesture, but its resulting choice must
	// not become a pointer trap. Focus the first quick action and provide the
	// conventional menu-key path through all remaining choices.
	useEffect(() => {
		if (!open || !container) return
		const frame = requestAnimationFrame(() => {
			container.querySelector<HTMLButtonElement>('.OnCanvasBlockPicker-item')?.focus()
		})
		return () => cancelAnimationFrame(frame)
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
		// The host can turn a board readonly while this transient offer is open.
		// Decline through the same rollback path instead of asking tldraw to reject
		// only the new Block and leaving the already-created loose cable behind.
		if (editor.getIsReadonly()) {
			close()
			return
		}
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

	const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
		const items = Array.from(container?.querySelectorAll<HTMLButtonElement>('.OnCanvasBlockPicker-item') ?? [])
		if (items.length === 0) return
		const current = items.indexOf(editor.getContainer().ownerDocument.activeElement as HTMLButtonElement)
		let next = current
		if (event.key === 'Home') next = 0
		else if (event.key === 'End') next = items.length - 1
		else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length
		else next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
		event.preventDefault()
		event.stopPropagation()
		items[next]?.focus()
	}

	return (
		<div
			ref={setContainer}
			className="OnCanvasBlockPicker"
			data-testid="block-picker"
			role="menu"
			aria-label="Insert a Block"
			onPointerDown={stopEventPropagation}
			onKeyDown={onMenuKeyDown}
		>
			<div className="OnCanvasBlockPicker-title" role="heading" aria-level={1}>Insert a Block</div>
			{quickPresets.length > 0 && <div className="OnCanvasBlockPicker-group" role="heading" aria-level={2} data-testid="block-picker-quick-insert">Quick insert</div>}
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
			{quickPresets.length > 0 && ordinaryPresets.length > 0 && <div className="OnCanvasBlockPicker-group" role="heading" aria-level={2}>Other Blocks</div>}
			{ordinaryPresets.map((preset) => (
				<button key={preset.id} type="button" role="menuitem" className="OnCanvasBlockPicker-item" data-testid={`block-picker-${preset.id}`} onPointerDown={stopEventPropagation} onClick={() => pick(preset)}>
					<BlockIconGlyph name={preset.icon} size={16} /><span>{preset.label}</span><small>{preset.inputs}{' in · '}{preset.outputs}{' out'}</small>
				</button>
			))}
		</div>
	)
}
