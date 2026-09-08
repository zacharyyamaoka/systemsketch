import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'tldraw/tldraw.css'
import './index.css'
import App from './App.tsx'

// mode is read once at startup from the query string and decides which
// (if any) Tailwind CSS entry gets dynamically imported, so the network
// panel for a given mode shows exactly one extra stylesheet or none.
const params = new URLSearchParams(window.location.search)
const mode = (params.get('mode') ?? 'none') as 'none' | 'full' | 'layers'

async function loadModeCss(m: string) {
  if (m === 'full') {
    await import('./styles/full.css')
  } else if (m === 'layers') {
    await import('./styles/layers.css')
  }
  // 'none' (or anything else) loads no Tailwind CSS at all.
}

loadModeCss(mode).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App mode={mode} />
    </StrictMode>,
  )
})
