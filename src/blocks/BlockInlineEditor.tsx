import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useEditor, useValue } from 'tldraw'

import { blockIconRef, isBlockShape, type BlockShape, type BlockShapeProps } from './blockModel'
import { patchBlockPortProps, updateBlockDetails } from './commands/blockCommands'
import {
	blockInlineEditorPlacement,
	getBlockInlineField,
	type BlockInlineField,
} from './inlineBlockEditing'
import { VALUE_FONT_PX } from './layoutBlock'
import { blockTitleAppearance } from './titleAppearance'
import { BlockIconPicker } from './ui/iconPicker/BlockIconPicker'
import { encodeBlockIcon } from './ui/iconPicker/iconRef'
import { EMPTY_FIELD_GUIDANCE } from '../fields/emptyFieldGuidance'

const DISPLAY_DESCRIPTION_LIMIT = 120

function currentBlock(editor: ReturnType<typeof useEditor>, shapeId: BlockShape['id']) {
	const current = editor.getShape(shapeId)
	return isBlockShape(current) ? current : null
}

function updateBlock(
	editor: ReturnType<typeof useEditor>,
	shapeId: BlockShape['id'],
	change: (props: BlockShapeProps) => BlockShapeProps,
): void {
	const current = currentBlock(editor, shapeId)
	if (!current) return
	const props = change(current.props)
	if (props === current.props) return
	editor.updateShape<BlockShape>({ id: current.id, type: current.type, props })
}

function valueFor(props: BlockShapeProps, field: BlockInlineField): string {
	switch (field.kind) {
		case 'title':
			return props.title
		case 'blockType':
			return props.blockType
		case 'icon':
			return props.icon ?? ''
		case 'description':
			return props.description
		case 'portName':
		case 'portType': {
			const port = props[field.side].find((candidate) => candidate.id === field.portId)
			return port?.[field.kind === 'portName' ? 'name' : 'type'] ?? ''
		}
	}
}

function updateField(
	editor: ReturnType<typeof useEditor>,
	shape: BlockShape,
	field: BlockInlineField,
	value: string,
): void {
	updateBlock(editor, shape.id, (props) => {
		switch (field.kind) {
			case 'title':
				return props.title === value ? props : { ...props, title: value }
			case 'blockType':
				return props.blockType === value ? props : { ...props, blockType: value }
			case 'icon':
				return (props.icon ?? '') === value ? props : { ...props, icon: value }
			case 'description':
				return props.description === value ? props : { ...props, description: value }
			case 'portName':
			case 'portType': {
				// Through the shared patch, not a private one: an accessor typed on
				// the canvas has to be spelled the way the inspector and the menu
				// spell it, and that rule lives in patchBlockPortProps.
				const key = field.kind === 'portName' ? 'name' : 'type'
				return patchBlockPortProps(props, field.side, field.portId, { [key]: value })
			}
		}
	})
}

function editorStyle(
	editor: ReturnType<typeof useEditor>,
	props: BlockShapeProps,
	field: BlockInlineField,
	box: { x: number; y: number; w: number; h: number },
	align: 'left' | 'center' | 'right',
): CSSProperties {
	const titleAppearance = field.kind === 'title'
		? blockTitleAppearance(editor, props)
		: null
	const minimumWidth = field.kind === 'icon'
		? 170
		: field.kind === 'description'
			? 150
			: field.kind === 'title'
				? 112
				: 84
	const width = Math.max(minimumWidth, box.w)
	const height = Math.max(field.kind === 'description' ? 48 : 30, box.h)
	let left = box.x
	if (align === 'right') left = box.x + box.w - width
	else if (align === 'center') left = box.x + (box.w - width) / 2
	return {
		left,
		top: box.y + (box.h - height) / 2,
		width,
		height,
		textAlign: titleAppearance?.textAlign ?? align,
		fontFamily: titleAppearance?.fontFamily,
		fontWeight: titleAppearance?.fontWeight,
		color: titleAppearance?.color,
		fontSize: titleAppearance?.fontSize ?? (props.view === 'value'
			? VALUE_FONT_PX
			: field.kind === 'title'
				? (props.view === 'simple' ? 38 : 30)
				: field.kind.startsWith('port')
					? 17
					: 16),
	}
}

/** What an empty field promises: on a capsule the title is the literal and the outlet is its name. */
function placeholderFor(props: BlockShapeProps, field: BlockInlineField): string {
	if (props.view === 'value') {
		return field.kind === 'title'
			? EMPTY_FIELD_GUIDANCE.pill.value
			: EMPTY_FIELD_GUIDANCE.pill.name
	}
	return field.kind === 'title'
		? EMPTY_FIELD_GUIDANCE.block.title
		: field.kind === 'blockType'
			? EMPTY_FIELD_GUIDANCE.block.type
			: field.kind === 'portName'
				? EMPTY_FIELD_GUIDANCE.block.portName
				: EMPTY_FIELD_GUIDANCE.block.portType
}

function testIdFor(field: BlockInlineField): string {
	if (field.kind === 'portName' || field.kind === 'portType') {
		return `block-inline-${field.kind === 'portName' ? 'port-name' : 'port-type'}-${field.side}-${field.portId}`
	}
	return `block-inline-${field.kind === 'blockType' ? 'type' : field.kind}`
}

export function BlockInlineEditor({ shape }: { shape: BlockShape }) {
	const editor = useEditor()
	// Reactive: a click on a second field moves this editor without the Block's
	// shape record changing, so a plain read would strand it on the first field.
	const field = useValue(
		'active Block inline field',
		() => getBlockInlineField(editor, shape.id),
		[editor, shape.id],
	)
	const placement = blockInlineEditorPlacement(shape.props, field)
	const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)
	const markedSession = useRef<string | null>(null)

	/**
	 * Writing every keystroke straight into the shape is what makes on-canvas
	 * editing WYSIWYG, but without a boundary those characters merge into
	 * whatever came before — undoing a rename used to delete the Block that was
	 * created just before it. One mark per editing session, stamped lazily on
	 * the first character so simply opening the editor leaves no history.
	 */
	const writeField = (value: string) => {
		const session = `${shape.id}:${testIdFor(field)}`
		if (markedSession.current !== session) {
			markedSession.current = session
			editor.markHistoryStoppingPoint(`edit block ${field.kind}`)
		}
		updateField(editor, shape, field, value)
	}

	useEffect(() => {
		markedSession.current = null
		const input = editorRef.current
		if (!input) return
		const focusAndSelect = () => {
			if (editor.getEditingShapeId() !== shape.id) return
			input.focus({ preventScroll: true })
			if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select()
		}
		focusAndSelect()
		const frame = requestAnimationFrame(focusAndSelect)
		return () => cancelAnimationFrame(frame)
	}, [editor, field.kind, 'portId' in field ? field.portId : '', shape.id])

	if (!placement) return null
	const value = valueFor(shape.props, field)
	const style = editorStyle(editor, shape.props, field, placement.box, placement.align)
	const common = {
		ref: editorRef as never,
		className: `BlockNode-inlineEditor BlockNode-inlineEditor--${field.kind}${
			shape.props.view === 'value' ? ' BlockNode-inlineEditor--value' : ''
		}`,
		style,
		value,
		'data-testid': testIdFor(field),
		onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
		onClick: (event: React.MouseEvent) => event.stopPropagation(),
		onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
		onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
			if (event.nativeEvent.isComposing) return
			if (event.key === 'Escape') {
				event.preventDefault()
				event.stopPropagation()
				editor.cancel()
			} else if (
				event.key === 'Enter'
				&& (!(event.currentTarget instanceof HTMLTextAreaElement) || event.metaKey || event.ctrlKey)
			) {
				event.preventDefault()
				event.stopPropagation()
				editor.complete()
			}
		},
	}

	if (field.kind === 'icon') {
		// WHY this doesn't spread `common`: that shape is built for a text
		// input/textarea/select (a `value`, an `onKeyDown` for Escape/Enter).
		// The picker owns Escape (Radix's dismissable layer → `onOpenChange`)
		// and Enter (picks the first visible cell) itself, and there is no text
		// value to show — only an invisible box at the on-canvas icon's
		// position for `BlockIconPicker` to anchor its popover against. `open`
		// is always true here: this branch only renders while tldraw's own
		// editing lifecycle already has the icon field active, so closing the
		// popover (Escape, an outside click, or a pick) is what should end
		// that lifecycle, not the other way around.
		//
		// WHY `onChange` never calls `editor.complete()`/`.cancel()` itself,
		// and `onOpenChange` only ever calls `.complete()`: a pick already
		// applied its own undo step (`updateBlockDetails`), so ending the
		// editing lifecycle here is bookkeeping, not a second action to
		// record. Calling `.complete()` from `onChange` used to end that
		// lifecycle immediately, so by the time the picker's own `choose()`
		// closed the popover a beat later the select tool was already back in
		// `idle` — and `editor.cancel()` dispatched there instead of to
		// `editing_shape`, landing on `Idle.onCancel()`, which marks a second
		// history step and calls `selectNone()`. That cost every pick an
		// extra undo and a deselected Block. `.cancel()` after a pick is
		// wrong for the same reason Escape/outside-click use `.complete()`
		// too: there is nothing left to cancel. Guarding on
		// `getEditingShapeId() === shape.id` keeps a stale close (this Block
		// already lost editing focus to something else) from completing an
		// editing session it doesn't own.
		return (
			<BlockIconPicker
				value={blockIconRef(shape.props)}
				title={shape.props.title}
				open
				onOpenChange={(next) => {
					if (!next && editor.getEditingShapeId() === shape.id) editor.complete()
				}}
				onChange={(icon) => {
					const { icon: iconValue, assetId } = encodeBlockIcon(icon)
					updateBlockDetails(editor, shape.id, { icon: iconValue, assetId }, { historyLabel: 'edit block icon' })
				}}
			>
				<span
					aria-hidden="true"
					data-testid={testIdFor(field)}
					style={{ position: 'absolute', left: style.left, top: style.top, width: style.width, height: style.height, pointerEvents: 'none' }}
				/>
			</BlockIconPicker>
		)
	}

	if (field.kind === 'description') {
		return (
			<textarea
				{...common}
				aria-label="Edit display description"
				rows={2}
				maxLength={DISPLAY_DESCRIPTION_LIMIT}
				placeholder={EMPTY_FIELD_GUIDANCE.block.displayDescription}
				onChange={(event) => writeField(event.target.value)}
			/>
		)
	}

	return (
		<input
			{...common}
			type="text"
			autoComplete="off"
			aria-label={
				field.kind === 'title'
					? 'Edit block title'
					: field.kind === 'blockType'
						? 'Edit block type'
						: field.kind === 'portName'
							? 'Edit port name'
							: 'Edit port type'
			}
			placeholder={placeholderFor(shape.props, field)}
			onChange={(event) => writeField(event.target.value)}
		/>
	)
}
