/**
 * The Loop inspector, in the Block and Branch inspector's idiom.
 *
 * Three sections, and each one exists because the region has exactly three
 * authored facts: what it is called, what crosses its header, and what it is
 * reporting right now. There is no port NAME field anywhere, because a header
 * port has no name — the collection's name lives on whatever produces it, and
 * the element has no name until a Block's port gives it one.
 */
import { useMemo } from 'react'
import { type Editor, useValue } from 'tldraw'

import { LiveTextInput } from '../../fields'
import { EMPTY_FIELD_GUIDANCE } from '../../fields/emptyFieldGuidance'
import { portColor } from '../../blocks/ui/portPalette'
import {
	getOnlySelectedLoop,
	setLoopPortType,
	setLoopTitle,
	setLoopTurn,
} from '../loopCommands'
import {
	LOOP_ITEM_PORT_ID,
	LOOP_ITERABLE_PORT_ID,
	type LoopShape,
	type LoopShapeProps,
} from '../loopModel'
import '../../blocks/ui/block-inspector.css'
import './loop-inspector.css'

export interface LoopInspectorActions {
	setTitle(title: string): void
	setTurn(turn: string): void
	setPortType(portId: string, type: string): void
	beginEdit(label: string): void
}

function XIcon() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
			<path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
		</svg>
	)
}

const HEADER_PORTS = [
	{
		id: LOOP_ITERABLE_PORT_ID,
		key: 'iterable' as const,
		label: 'Iterable in',
		hint: 'What the collection arriving on the header is.',
	},
	{
		id: LOOP_ITEM_PORT_ID,
		key: 'item' as const,
		label: 'Element out',
		hint: 'What one turn of the loop emits.',
	},
]

export function LoopInspectorContent({ props, actions }: {
	props: LoopShapeProps
	actions?: LoopInspectorActions
}) {
	const readOnly = !actions
	return (
		<div className="block-inspector__body" role="tabpanel" aria-label="Loop details">
			<section className="block-inspector__section" data-inspector-section="Loop">
				<div className="block-inspector__section-title">Loop</div>
				<label className="block-inspector__field">
					<span>Title</span>
					<LiveTextInput
						value={props.title}
						disabled={readOnly}
						placeholder={EMPTY_FIELD_GUIDANCE.loop.title}
						ariaLabel="Loop title"
						beginEdit={() => actions?.beginEdit('rename loop')}
						onWrite={(title) => actions?.setTitle(title)}
					/>
				</label>
			</section>

			<section
				className="block-inspector__section"
				aria-label="Header ports"
				data-inspector-section="Header ports"
			>
				<div className="block-inspector__section-title">Header ports</div>
				<ul className="block-inspector__ports">
					{HEADER_PORTS.map((port) => (
						<li key={port.id} className="block-inspector__port-row" data-loop-port={port.id}>
							<span className="block-inspector__port-name" aria-hidden="true">{port.label}</span>
							<LiveTextInput
								className="block-inspector__port-type"
								value={props[port.key].type}
								disabled={readOnly}
								placeholder={EMPTY_FIELD_GUIDANCE.loop.portType}
								ariaLabel={`${port.label} type`}
								beginEdit={() => actions?.beginEdit('retype loop port')}
								onWrite={(type) => actions?.setPortType(port.id, type)}
							/>
							<span
								className="block-inspector__port-swatch"
								style={{ background: portColor(props[port.key].type) }}
								aria-hidden="true"
							/>
						</li>
					))}
				</ul>
				<p className="block-inspector__hint">
					A header port carries a type and no name. The collection's name lives on
					whatever produces it; the element has no name until a Block's port gives
					it one.
				</p>
			</section>

			<section className="block-inspector__section" data-inspector-section="Turn">
				<div className="block-inspector__section-title">Turn</div>
				<label className="block-inspector__field">
					<span>Reads</span>
					<LiveTextInput
						value={props.turn}
						disabled={readOnly}
						placeholder={EMPTY_FIELD_GUIDANCE.loop.turn}
						ariaLabel="Loop turn"
						beginEdit={() => actions?.beginEdit('set loop turn')}
						onWrite={(turn) => actions?.setTurn(turn)}
					/>
				</label>
				<p className="block-inspector__hint">
					Empty hides the chip. It yields to the title when the header runs out of room.
				</p>
			</section>
		</div>
	)
}

/** Reactive adapter from the selection to the Loop inspector body. */
export function EditorLoopInspector({ editor, onRequestClose }: {
	editor: Editor
	onRequestClose?: () => void
}) {
	const loop = useValue(
		'SystemSketch Loop inspector subject',
		(previous?: unknown) => {
			const next = getOnlySelectedLoop(editor)
			const before = previous as LoopShape | null | undefined
			if (before && next && before.id === next.id && before.props === next.props) return before
			return next
		},
		[editor],
	)
	const actions = useMemo<LoopInspectorActions | undefined>(() => {
		if (!loop) return undefined
		const id = loop.id
		// A keystroke must not become its own undo step; the label lands on the
		// first edit of a run instead.
		const continuous = { historyLabel: false } as const
		return {
			setTitle: (title) => void setLoopTitle(editor, id, title, continuous),
			setTurn: (turn) => void setLoopTurn(editor, id, turn, continuous),
			setPortType: (portId, type) => void setLoopPortType(editor, id, portId, type, continuous),
			beginEdit: (label) => editor.markHistoryStoppingPoint(label),
		}
	}, [editor, loop])

	if (!loop) return null
	return (
		<section
			className="block-inspector loop-inspector"
			aria-label="Loop inspector"
			data-status="selected"
			data-testid="loop-inspector"
		>
			<nav className="block-inspector__tabs" role="tablist" aria-label="Loop inspector">
				<button type="button" role="tab" className="is-active" aria-selected="true">Loop</button>
				{onRequestClose ? (
					<button
						type="button"
						className="block-inspector__dock-close"
						aria-label="Close Loop inspector"
						onClick={onRequestClose}
					>
						<XIcon />
					</button>
				) : null}
			</nav>
			<LoopInspectorContent props={loop.props} actions={actions} />
		</section>
	)
}
