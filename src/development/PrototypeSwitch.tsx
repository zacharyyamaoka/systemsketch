import { useEditor } from 'tldraw'

import {
	PORT_EDITOR_MODES,
	setPortEditorMode,
	usePortEditorMode,
	type PortEditorMode,
} from '../blocks/portLanePrototype'
import './prototype-switch.css'

const LABEL: Record<PortEditorMode, string> = {
	'one-line': 'Port editor · single line per port, drag-and-drop rows',
	lanes: 'Port editor · multi-line lanes, one solid box',
	'lanes-ragged': 'Port editor · multi-line lanes, ragged lines (prototype)',
}

/**
 * Temporary prototype chrome in the bottom-right corner: a drop-down over
 * the same port-editor preference Settings › Canvas exposes, plus the lane
 * style still being prototyped. Exists so a variant can be tried without
 * editing the URL; goes away when the lane style is settled.
 */
export function PrototypeSwitch() {
	const editor = useEditor()
	const mode = usePortEditorMode()
	return (
		<label className="systemsketch-prototype-switch" data-testid="systemsketch-prototype-switch">
			<span>Prototype</span>
			<select
				aria-label="Port editor prototype"
				value={mode}
				onChange={(event) => {
					// Close any open editor first: a lane and a one-line box must
					// never be alive across the switch.
					if (editor.getEditingShapeId()) editor.complete()
					setPortEditorMode(event.target.value as PortEditorMode)
				}}
			>
				{PORT_EDITOR_MODES.map((option) => (
					<option key={option} value={option}>{LABEL[option]}</option>
				))}
			</select>
		</label>
	)
}
