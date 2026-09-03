import { useEditor, useValue } from 'tldraw'

import {
	getFocusedTunnelLayer,
	getTunnelLayers,
	setFocusedTunnelLayer,
} from '../connections/tunnelLayers'
import './tunnel-layer-bar.css'

/** The narrow layer lens that makes grouped tunnel routes recoverable. */
export function TunnelLayerBar() {
	const editor = useEditor()
	const layers = useValue('tunnel layers', () => getTunnelLayers(editor), [editor])
	const focused = useValue(
		'focused tunnel layer',
		() => getFocusedTunnelLayer(editor),
		[editor],
	)
	if (layers.length === 0) return null

	return (
		<nav
			className="tunnel-layer-bar"
			aria-label="Tunnel layers"
			data-testid="tunnel-layer-bar"
			data-systemsketch-chrome
		>
			<span>Layers</span>
			{layers.map((layer) => (
				<button
					key={layer}
					type="button"
					aria-pressed={focused === layer}
					data-testid="tunnel-layer-focus"
					data-tunnel-layer={layer}
					onClick={() => setFocusedTunnelLayer(editor, layer)}
				>
					<i aria-hidden="true" />
					{layer}
				</button>
			))}
		</nav>
	)
}
