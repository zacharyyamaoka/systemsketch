import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { useEditor, useValue } from 'tldraw'

import { isBranchShape, type BranchShape, type BranchShapeProps } from './branchModel'
import { branchInlineEditorPlacement, getBranchInlineField, type BranchInlineField } from './branchInlineEditing'
import { EMPTY_FIELD_GUIDANCE } from '../fields/emptyFieldGuidance'

function valueFor(props: BranchShapeProps, field: BranchInlineField): string {
	switch (field.kind) {
		case 'title':
			return props.title
		case 'armTitle':
			return props.arms.find((arm) => arm.id === field.armId)?.title ?? ''
		case 'controlName':
			return props.controls.find((port) => port.id === field.portId)?.name ?? ''
	}
}

function withValue(props: BranchShapeProps, field: BranchInlineField, value: string): BranchShapeProps {
	switch (field.kind) {
		case 'title':
			return props.title === value ? props : { ...props, title: value }
		case 'armTitle': {
			const index = props.arms.findIndex((arm) => arm.id === field.armId)
			if (index < 0 || props.arms[index].title === value) return props
			const arms = [...props.arms]
			arms[index] = { ...arms[index], title: value }
			return { ...props, arms }
		}
		case 'controlName': {
			const index = props.controls.findIndex((port) => port.id === field.portId)
			if (index < 0 || props.controls[index].name === value) return props
			const controls = [...props.controls]
			controls[index] = { ...controls[index], name: value }
			return { ...props, controls }
		}
	}
}

export function branchInlineTestId(field: BranchInlineField): string {
	if (field.kind === 'armTitle') return `branch-inline-arm-${field.armId}`
	if (field.kind === 'controlName') return `branch-inline-control-${field.portId}`
	return 'branch-inline-title'
}

/** The one text input a Branch exposes while tldraw says it is being edited. */
export function BranchInlineEditor({ shape }: { shape: BranchShape }) {
	const editor = useEditor()
	const field = useValue('active Branch inline field', () => getBranchInlineField(editor, shape.id), [editor, shape.id])
	const placement = branchInlineEditorPlacement(shape.props, field)
	const inputRef = useRef<HTMLInputElement>(null)
	const markedSession = useRef<string | null>(null)

	const write = (value: string) => {
		const session = `${shape.id}:${branchInlineTestId(field)}`
		if (markedSession.current !== session) {
			markedSession.current = session
			editor.markHistoryStoppingPoint(`edit branch ${field.kind}`)
		}
		const current = editor.getShape(shape.id)
		if (!isBranchShape(current)) return
		const props = withValue(current.props, field, value)
		if (props === current.props) return
		editor.updateShape<BranchShape>({ id: current.id, type: current.type, props })
	}

	useEffect(() => {
		markedSession.current = null
		const input = inputRef.current
		if (!input) return
		const focusAndSelect = () => {
			if (editor.getEditingShapeId() !== shape.id) return
			input.focus({ preventScroll: true })
			input.select()
		}
		focusAndSelect()
		const frame = requestAnimationFrame(focusAndSelect)
		return () => cancelAnimationFrame(frame)
	}, [editor, field.kind, 'armId' in field ? field.armId : '', 'portId' in field ? field.portId : '', shape.id])

	if (!placement) return null
	const { box, align } = placement
	const style: CSSProperties = {
		left: box.x,
		top: box.y,
		width: Math.max(96, box.w),
		height: box.h,
		textAlign: align,
		fontSize: field.kind === 'title' ? 18 : 16,
		fontWeight: field.kind === 'title' ? 500 : 700,
	}

	return (
		<input
			ref={inputRef}
			type="text"
			autoComplete="off"
			className={`BlockNode-inlineEditor Branch-inlineEditor Branch-inlineEditor--${field.kind}`}
			style={style}
			value={valueFor(shape.props, field)}
			data-testid={branchInlineTestId(field)}
			aria-label={field.kind === 'title' ? 'Edit branch title' : field.kind === 'armTitle' ? 'Edit arm title' : 'Edit control port name'}
			placeholder={field.kind === 'title'
				? EMPTY_FIELD_GUIDANCE.branch.title
				: field.kind === 'armTitle'
					? EMPTY_FIELD_GUIDANCE.branch.armTitle
					: EMPTY_FIELD_GUIDANCE.branch.controlName}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onChange={(event) => write(event.target.value)}
			onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
				if (event.nativeEvent.isComposing) return
				if (event.key === 'Escape') {
					event.preventDefault()
					event.stopPropagation()
					editor.cancel()
				} else if (event.key === 'Enter') {
					event.preventDefault()
					event.stopPropagation()
					editor.complete()
				}
			}}
		/>
	)
}
