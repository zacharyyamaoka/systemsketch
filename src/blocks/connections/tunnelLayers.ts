import { atom, type Editor, type TLShape } from 'tldraw'

import { CONNECTION_SHAPE_TYPE } from './connectionModel'

const focusedLayerByEditor = new WeakMap<Editor, ReturnType<typeof atom<string | null>>>()

function focusedLayerAtom(editor: Editor) {
	let value = focusedLayerByEditor.get(editor)
	if (!value) {
		value = atom<string | null>('focused tunnel layer', null)
		focusedLayerByEditor.set(editor, value)
	}
	return value
}

/** View-local layer focus. It never mutates or dirties the board. */
export function getFocusedTunnelLayer(editor: Editor): string | null {
	return focusedLayerAtom(editor).get()
}

export function setFocusedTunnelLayer(editor: Editor, layer: string | null): void {
	const normalized = layer?.trim() || null
	focusedLayerAtom(editor).set(
		focusedLayerAtom(editor).get() === normalized ? null : normalized,
	)
}

function shapeTunnelLayer(shape: TLShape): string | null {
	if (shape.type !== CONNECTION_SHAPE_TYPE) return null
	const props = shape.props as Record<string, unknown>
	if (props.tunnel !== true || typeof props.tunnelLayer !== 'string') return null
	return props.tunnelLayer.trim() || null
}

/** Reusable names are derived from the board's tunneled connections. */
export function getTunnelLayers(editor: Editor): string[] {
	const byCaseFoldedName = new Map<string, string>()
	for (const shape of editor.getCurrentPageShapes()) {
		const layer = shapeTunnelLayer(shape)
		if (layer) byCaseFoldedName.set(layer.toLocaleLowerCase(), layer)
	}
	return [...byCaseFoldedName.values()].sort((a, b) => a.localeCompare(b))
}

export function canonicalTunnelLayer(editor: Editor, name: string): string {
	const trimmed = name.trim()
	return getTunnelLayers(editor).find(
		(layer) => layer.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
	) ?? trimmed
}
