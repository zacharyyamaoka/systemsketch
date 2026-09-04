/**
 * Deliberately bare tldraw document viewer.
 *
 * This route is evidence for the portable-export contract: it mounts the
 * downloaded `.tldr` with the library's default store/schema/components only.
 * It does not import SystemSketch shape utils, bindings, themes, tools, or
 * renderer overrides. A document that appears here will appear in a stock
 * tldraw 5.3.2 canvas for the same reason, not because our app recognizes it.
 */
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { createTLSchema, parseTldrawJsonFile, Tldraw, type Editor, type TLStore } from 'tldraw'
import { useEffect, useState } from 'react'
import 'tldraw/tldraw.css'
import './app.css'

const ASSET_URLS = getAssetUrlsByImport()
const TLDRAW_LICENSE_KEY = __TLDRAW_LICENSE_KEY__ || undefined

declare global {
	interface Window {
		/** Development-only assertion seam for the otherwise unmodified viewer. */
		__stockTldrawViewer?: Editor
	}
}

type ViewerState =
	| { kind: 'loading' }
	| { kind: 'error'; message: string }
	| { kind: 'ready'; store: TLStore }

function documentUrl(): URL | null {
	const file = new URLSearchParams(window.location.search).get('stock-viewer')
	if (!file) return null
	const resolved = new URL(file, window.location.origin)
	return resolved.origin === window.location.origin ? resolved : null
}

export function StockTldrawViewer() {
	const [state, setState] = useState<ViewerState>({ kind: 'loading' })

	useEffect(() => {
		const url = documentUrl()
		if (!url) {
			setState({ kind: 'error', message: 'Pass a same-origin .tldr path as ?stock-viewer=/docs/assets/example.tldr' })
			return
		}
		let cancelled = false
		void fetch(url)
			.then(async (response) => {
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
				return response.text()
			})
			.then((json) => {
				const parsed = parseTldrawJsonFile({ json, schema: createTLSchema() })
				if (!parsed.ok) throw new Error(`Stock tldraw rejected the document: ${parsed.error.type}`)
				if (!cancelled) setState({ kind: 'ready', store: parsed.value })
			})
			.catch((error: unknown) => {
				if (!cancelled) setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
			})
		return () => { cancelled = true }
	}, [])

	if (state.kind === 'loading') return <main className="systemsketch-app" data-testid="stock-tldraw-viewer-loading">Loading stock tldraw document…</main>
	if (state.kind === 'error') return <main className="systemsketch-app" data-testid="stock-tldraw-viewer-error">{state.message}</main>

	return (
		<main className="systemsketch-app" data-testid="stock-tldraw-viewer">
			<Tldraw
				assetUrls={ASSET_URLS}
				licenseKey={TLDRAW_LICENSE_KEY}
				store={state.store}
				onMount={(editor) => {
					window.__stockTldrawViewer = editor
					editor.zoomToFit({ animation: { duration: 0 } })
					return () => {
						if (window.__stockTldrawViewer === editor) delete window.__stockTldrawViewer
					}
				}}
			/>
		</main>
	)
}
