import { serializeTldrawJson, type Editor } from 'tldraw'
import { renderWithStockTldraw } from './export/stockTldrawPrimitives'

/**
 * A read-only development seam for the browser journeys.
 *
 * Every UI claim in this repo is proven by reading the painted document. That
 * rule has exactly one gap, and it is tldraw's: since v5 the selection
 * foreground, shape handles and other overlays are drawn to a `<canvas>`, so a
 * control point genuinely has no DOM node to query. A test that wants to know
 * whether a handle is being OFFERED has no pixel-level alternative.
 *
 * So this exposes the overlay ids the renderer is about to paint — one step
 * from the paint, not from the model — plus the editor itself for the same
 * class of question. It is installed only under `import.meta.env.DEV`, so it
 * cannot exist in a released Stable build.
 *
 * It is not a licence to assert against the model. A journey that could read
 * the DOM must read the DOM.
 */
export interface SystemSketchDevelopmentSeam {
	editor: Editor
	/** Ids of the overlays currently on screen, e.g. `handle:shape:x:bend`. */
	overlayIds(): string[]
	/** Painted stacking order of a shape within its parent, for z-order claims. */
	shapeIndex(shapeId: string): string | null
	/** Render a detached `.tldr` through default tldraw utilities only. */
	renderStockTldraw(json: string): Promise<string>
	/** Serialize the live board for a default-renderer proof. */
	serializeTldraw(): Promise<string>
}

declare global {
	interface Window {
		__systemsketch?: SystemSketchDevelopmentSeam
	}
}

export function installDevelopmentSeam(editor: Editor): () => void {
	if (!import.meta.env.DEV) return () => undefined

	window.__systemsketch = {
		editor,
		overlayIds: () => editor.overlays.getCurrentOverlays().map((overlay) => overlay.id),
		shapeIndex: (shapeId) => editor.getShape(shapeId as never)?.index ?? null,
		renderStockTldraw: async (json) => {
			const container = editor.getContainer().ownerDocument.createElement('div')
			container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden'
			editor.getContainer().ownerDocument.body.appendChild(container)
			try {
				return await renderWithStockTldraw(json, container)
			} finally {
				container.remove()
			}
		},
		serializeTldraw: () => serializeTldrawJson(editor),
	}

	return () => {
		if (window.__systemsketch?.editor === editor) delete window.__systemsketch
	}
}
