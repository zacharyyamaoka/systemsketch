import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { restorePromotedWorkspaceState } from './promotedWorkspaceState'

async function start() {
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
