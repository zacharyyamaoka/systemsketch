import { useValue, type Editor } from 'tldraw'

import {
	FLOATING_PORT_DIRECTIONS,
	FLOATING_PORT_FILL_MODES,
	FLOATING_PORT_TEXT_LAYOUTS,
	getOnlySelectedFloatingPort,
	type FloatingPortShape,
} from './floatingPortModel'
import { PortSignatureField } from '../blocks/ui/PortSignatureField'
import { EMPTY_FIELD_GUIDANCE } from '../fields/emptyFieldGuidance'
import './floating-port.css'

function updatePort(editor: Editor, shape: FloatingPortShape, props: Partial<FloatingPortShape['props']>) {
	editor.updateShape<FloatingPortShape>({ id: shape.id, type: shape.type, props })
}

function SegmentedChoice<T extends string>({
	label,
	value,
	choices,
	onChange,
}: {
	label: string
	value: T
	choices: readonly T[]
	onChange(value: T): void
}) {
	return (
		<div className="FloatingPortInspector-choice" role="group" aria-label={label}>
			{choices.map((choice) => (
				<button
					key={choice}
					type="button"
					aria-pressed={choice === value}
					onClick={() => onChange(choice)}
				>
					{choice === 'input' ? 'Input' : choice === 'output' ? 'Output' : choice[0].toUpperCase() + choice.slice(1)}
				</button>
			))}
		</div>
	)
}

/** The same direct-edit cadence as a Block's port rows, scoped to one free port. */
export function FloatingPortInspector({ editor }: { editor: Editor }) {
	const shape = useValue(
		'floating Port inspector selection',
		() => getOnlySelectedFloatingPort(editor),
		[editor],
	)
	if (!shape) return null

	return (
		<section className="FloatingPortInspector" aria-label="Port inspector" data-testid="floating-port-inspector">
			<div className="FloatingPortInspector-eyebrow">PORT</div>
			<label>
				<span>Port</span>
				{/* WHY one line: a free Port is the same declaration a Block port is —
				    `name: type = value` — so it gets the same code text box, the same
				    grammar and the same completions, not three boxes of its own. */}
				<PortSignatureField
					editor={editor}
					port={{ id: shape.id, name: shape.props.name, type: shape.props.type, defaultValue: shape.props.value || undefined }}
					ariaLabel="Port signature"
					testId="floating-port-signature"
					placeholder={EMPTY_FIELD_GUIDANCE.block.portSignature}
					beginEdit={() => editor.markHistoryStoppingPoint('edit floating port')}
					onPatch={(patch) => updatePort(editor, shape, {
						...(patch.name !== undefined ? { name: patch.name } : {}),
						...(patch.type !== undefined ? { type: patch.type } : {}),
						...('defaultValue' in patch ? { value: patch.defaultValue ?? '' } : {}),
					})}
				/>
			</label>
			<div className="FloatingPortInspector-row">
				<span>Direction</span>
				<SegmentedChoice
					label="Port direction"
					value={shape.props.direction}
					choices={FLOATING_PORT_DIRECTIONS}
					onChange={(direction) => updatePort(editor, shape, { direction })}
				/>
			</div>
			<div className="FloatingPortInspector-row">
				<span>Text</span>
				<SegmentedChoice
					label="Port text layout"
					value={shape.props.textLayout}
					choices={FLOATING_PORT_TEXT_LAYOUTS}
					onChange={(textLayout) => updatePort(editor, shape, { textLayout })}
				/>
			</div>
			<div className="FloatingPortInspector-row FloatingPortInspector-row--fill">
				<span>Filled</span>
				<SegmentedChoice
					label="Port filled state"
					value={shape.props.fill}
					choices={FLOATING_PORT_FILL_MODES}
					onChange={(fill) => updatePort(editor, shape, { fill })}
				/>
			</div>
			<p>Auto follows whether the port has a cable. Filled and Empty are explicit visual overrides.</p>
		</section>
	)
}
