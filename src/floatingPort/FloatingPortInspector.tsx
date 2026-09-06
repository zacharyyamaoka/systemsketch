import { useValue, type Editor } from 'tldraw'

import {
	FLOATING_PORT_DIRECTIONS,
	FLOATING_PORT_FILL_MODES,
	FLOATING_PORT_TEXT_LAYOUTS,
	getOnlySelectedFloatingPort,
	type FloatingPortShape,
} from './floatingPortModel'
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
				<span>Name</span>
				<input
					aria-label="Port name"
					value={shape.props.name}
					onChange={(event) => updatePort(editor, shape, { name: event.target.value })}
				/>
			</label>
			<label>
				<span>Type</span>
				<input
					aria-label="Port type"
					value={shape.props.type}
					onChange={(event) => updatePort(editor, shape, { type: event.target.value })}
				/>
			</label>
			<label>
				<span>Value</span>
				<input
					aria-label="Port value"
					placeholder="Optional value"
					value={shape.props.value}
					onChange={(event) => updatePort(editor, shape, { value: event.target.value })}
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
