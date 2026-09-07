import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { restorePromotedWorkspaceState } from './promotedWorkspaceState'

async function start() {
	// Evidence route: this intentionally avoids importing App and therefore
	// cannot register any SystemSketch ShapeUtil, binding util, theme, or UI
	// override around the document being tested.
	if (new URLSearchParams(window.location.search).has('stock-viewer')) {
		const { StockTldrawViewer } = await import('./StockTldrawViewer')
		createRoot(document.getElementById('root')!).render(
			<StrictMode>
				<StockTldrawViewer />
			</StrictMode>,
		)
		return
	}
	// The composition lab: every contextual-menu lever, pressable. Same lazy
	// route shape as the evidence viewer, so the product bundle never carries
	// it. See `prototypes/menuLab/menuLabModel.ts` for the prior art it follows.
	if (new URLSearchParams(window.location.search).has('menu-lab')) {
		const { ContextualMenuLab } = await import('./prototypes/menuLab/ContextualMenuLab')
		createRoot(document.getElementById('root')!).render(
			<StrictMode>
				<ContextualMenuLab />
			</StrictMode>,
		)
		return
	}
	// Stable and Preview have separate origins and Chrome profiles. Restore the
  // narrowly-scoped promotion record before App imports preference stores.
  await restorePromotedWorkspaceState()
  const { App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
