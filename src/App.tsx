import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { UpdatePill } from './UpdatePill'
import './app.css'

const ASSET_URLS = getAssetUrlsByImport()
const TLDRAW_LICENSE_KEY = __TLDRAW_LICENSE_KEY__ || undefined

/**
 * The product datum: stock tldraw, plus one host-owned update pill.
 *
 * Keep all future product UI outside this component until it is deliberately
 * introduced. `assetUrls`, `licenseKey`, and `persistenceKey` are operational
 * infrastructure; no stock tool, shape, menu, shortcut, or component is
 * replaced here.
 */
export function App() {
  return (
    <main className="systemsketch-app" data-testid="systemsketch-app">
      <Tldraw
        assetUrls={ASSET_URLS}
        licenseKey={TLDRAW_LICENSE_KEY}
        persistenceKey="systemsketch-stock-whiteboard"
      />
      <UpdatePill />
    </main>
  )
}
