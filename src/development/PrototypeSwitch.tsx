import { useEditor } from 'tldraw'

import {
	PORT_EDITOR_MODES,
	setPortEditorMode,
	usePortEditorMode,
	type PortEditorMode,
} from '../blocks/portLanePrototype'
import './prototype-switch.css'

const LABEL: Record<PortEditorMode, string> = {
	'one-line': 'Port editor · one line per port (shipped)',
	lanes: 'Port editor · lanes, one line per port (prototype)',
}

/**
 * Temporary prototype chrome in the bottom-right corner: a drop-down that
 * flips the port editor between the shipped one-line field and the lane
 * prototype, remembered in this browser. Exists so a variant can be tried
 * without editing the URL; goes away with the prototype it switches.
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
