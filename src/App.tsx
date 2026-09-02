import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { Tldraw, type Editor } from 'tldraw'
import { useCallback } from 'react'
import 'tldraw/tldraw.css'
import { EXCALIDRAW_SHAPE_UTILS, registerExcalidrawPasteHandler } from './excalidrawInterop'
import {
  BlockShapeUtil,
  BlockTool,
  installBlockClickToEdit,
  installBlockPortMenuTarget,
} from './blocks'
import { BlockContextMenu } from './blocks/ui'
import {
  blockConnectionBindingUtils,
  blockConnectionOverlayUtils,
  blockConnectionShapeUtils,
  installBlockConnections,
} from './blocks/connections'
import {
  BLOCK_DEVELOPMENT_OVERRIDES,
  BlockDevelopmentPreviewChrome,
  BlockDevelopmentToolbar,
  DevelopmentPreviewChrome,
} from './development/DevelopmentPreviewChrome'
import {
  developmentPersistenceKey,
  resolveDevelopmentProfile,
  type DevelopmentProfileId,
} from './developmentProfiles'
import { EmbeddedCanvas, isEmbedded } from './embed'
import { ChromeProvider } from './chrome/ChromeProvider'
import {
  SystemSketchMenuPanel,
  SystemSketchSharePanel,
  SystemSketchSurfaceHost,
} from './chrome/SystemSketchChrome'
import { SystemSketchNavigationPanel } from './SystemSketchUtilities'
import { SystemSketchFigmaToolbar } from './toolbar/SystemSketchToolbar'
import {
  applyStoredArrowPreset,
  registerToolbarSideEffects,
  SYSTEMSKETCH_TOOLBAR_OVERRIDES,
} from './toolbar/toolbarIntegration'
import {
  SystemSketchMainMenu,
  SystemSketchWorkspaceProvider,
  useLocalWorkspace,
} from './workspace/LocalWorkspace'
import { interfaceScaleCssValues, useInterfaceScale } from './settings/interfaceScale'
import { installInstantTextEditing } from './instantTextEditing'
import { installDevelopmentSeam } from './developmentSeam'
import { enablePasteAtCursor } from './pasteAtCursor'
import type { CSSProperties } from 'react'
import './app.css'
import { SYSTEMSKETCH_THEMES } from './appearance/figjamPalette'

const ASSET_URLS = getAssetUrlsByImport()
const TLDRAW_LICENSE_KEY = __TLDRAW_LICENSE_KEY__ || undefined
const SYSTEMSKETCH_COMPONENTS = {
  ContextMenu: BlockContextMenu,
  InFrontOfTheCanvas: SystemSketchSurfaceHost,
  MainMenu: SystemSketchMainMenu,
  MenuPanel: SystemSketchMenuPanel,
  NavigationPanel: SystemSketchNavigationPanel,
  SharePanel: SystemSketchSharePanel,
  StylePanel: null,
  Toolbar: SystemSketchFigmaToolbar,
}
const SYSTEMSKETCH_SHAPE_UTILS = [
  ...EXCALIDRAW_SHAPE_UTILS,
  BlockShapeUtil,
  ...blockConnectionShapeUtils,
]
const SYSTEMSKETCH_BINDING_UTILS = [...blockConnectionBindingUtils]
/**
 * Added to tldraw's own overlays, not replacing them: this one paints a halo
 * under a revealed control point so it is big enough to see and aim at, while
 * tldraw keeps painting and hit-testing the handle itself.
 */
const SYSTEMSKETCH_OVERLAY_UTILS = [...blockConnectionOverlayUtils]
const SYSTEMSKETCH_TOOLS = [BlockTool]
const STOCK_DEVELOPMENT_COMPONENTS = {
  InFrontOfTheCanvas: DevelopmentPreviewChrome,
}
const BLOCK_DEVELOPMENT_COMPONENTS = {
  ContextMenu: BlockContextMenu,
  InFrontOfTheCanvas: BlockDevelopmentPreviewChrome,
  Toolbar: BlockDevelopmentToolbar,
}
const BLOCK_DEVELOPMENT_SHAPE_UTILS = [BlockShapeUtil, ...blockConnectionShapeUtils]
const BLOCK_DEVELOPMENT_BINDING_UTILS = [...blockConnectionBindingUtils]
const BLOCK_DEVELOPMENT_OVERLAY_UTILS = [...blockConnectionOverlayUtils]

/**
 * The product datum: stock tldraw with deliberately narrow product seams.
 *
 * SystemSketch keeps tldraw's canvas engine and interaction lifecycle, then
 * composes its chrome, local workspace, paste adapter, and semantic Block
 * through the SDK's public component, tool, shape, override, and mount APIs.
 */
function SystemSketchCanvas() {
  const { attach } = useLocalWorkspace()
  const interfaceScale = useInterfaceScale()
  const scaleCss = interfaceScaleCssValues(interfaceScale)
  const onMount = useCallback((editor: Editor) => {
    enablePasteAtCursor(editor)
    const stopWorkspace = attach(editor)
    const stopBlockConnections = installBlockConnections(editor)
    const stopDevelopmentSeam = installDevelopmentSeam(editor)
    const stopInstantTextEditing = installInstantTextEditing(editor)
    const stopBlockClickToEdit = installBlockClickToEdit(editor)
    const stopBlockPortMenuTarget = installBlockPortMenuTarget(editor)
    const stopExcalidrawPaste = registerExcalidrawPasteHandler(editor)
    const stopToolbarSideEffects = registerToolbarSideEffects(editor)
    return () => {
      stopToolbarSideEffects()
      stopExcalidrawPaste()
      stopBlockPortMenuTarget()
      stopBlockClickToEdit()
      stopInstantTextEditing()
      stopDevelopmentSeam()
      stopBlockConnections()
      stopWorkspace()
    }
  }, [attach])

  return (
    <main
      className="systemsketch-app"
      data-testid="systemsketch-app"
      data-interface-scale={interfaceScale}
      style={{
        '--systemsketch-interface-scale': scaleCss.scale,
        '--systemsketch-interface-scale-inverse': scaleCss.inverse,
      } as CSSProperties}
    >
      <Tldraw
        assetUrls={ASSET_URLS}
        bindingUtils={SYSTEMSKETCH_BINDING_UTILS}
        components={SYSTEMSKETCH_COMPONENTS}
        licenseKey={TLDRAW_LICENSE_KEY}
        onMount={onMount}
        overlayUtils={SYSTEMSKETCH_OVERLAY_UTILS}
        overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}
        shapeUtils={SYSTEMSKETCH_SHAPE_UTILS}
        themes={SYSTEMSKETCH_THEMES}
        tools={SYSTEMSKETCH_TOOLS}
      />
    </main>
  )
}

function DevelopmentCanvas({ profile }: { profile: Exclude<DevelopmentProfileId, 'product'> }) {
  const isBlockDevelopment = profile === 'block-dev'
  const onMount = useCallback((editor: Editor) => {
    enablePasteAtCursor(editor)
    // The development profiles keep tldraw's stock toolbar, so they cannot
    // cycle the preset — but they must still open on the same arrow and the
    // same edge routing the product does, or the lab lies about the datum.
    applyStoredArrowPreset(editor)
    const stopBlockConnections = isBlockDevelopment
      ? installBlockConnections(editor)
      : () => undefined
    const stopInstantTextEditing = isBlockDevelopment
      ? installInstantTextEditing(editor)
      : () => undefined
    const stopBlockClickToEdit = isBlockDevelopment
      ? installBlockClickToEdit(editor)
      : () => undefined
    const stopBlockPortMenuTarget = isBlockDevelopment
      ? installBlockPortMenuTarget(editor)
      : () => undefined
    const stopDevelopmentSeam = installDevelopmentSeam(editor)
    return () => {
      stopDevelopmentSeam()
      stopBlockPortMenuTarget()
      stopBlockClickToEdit()
      stopInstantTextEditing()
      stopBlockConnections()
    }
  }, [isBlockDevelopment])

  return (
    <main
      className="systemsketch-app systemsketch-development-app"
      data-testid="systemsketch-development-app"
      data-development-profile={profile}
    >
      <Tldraw
        assetUrls={ASSET_URLS}
        bindingUtils={isBlockDevelopment ? BLOCK_DEVELOPMENT_BINDING_UTILS : undefined}
        components={isBlockDevelopment ? BLOCK_DEVELOPMENT_COMPONENTS : STOCK_DEVELOPMENT_COMPONENTS}
        licenseKey={TLDRAW_LICENSE_KEY}
        onMount={onMount}
        overlayUtils={isBlockDevelopment ? BLOCK_DEVELOPMENT_OVERLAY_UTILS : undefined}
        overrides={isBlockDevelopment ? BLOCK_DEVELOPMENT_OVERRIDES : undefined}
        persistenceKey={developmentPersistenceKey(profile)}
        shapeUtils={isBlockDevelopment ? BLOCK_DEVELOPMENT_SHAPE_UTILS : undefined}
        themes={SYSTEMSKETCH_THEMES}
        tools={isBlockDevelopment ? [BlockTool] : undefined}
      />
    </main>
  )
}

export function App() {
  const profile = resolveDevelopmentProfile(window.location.search)

  /**
   * An IDE that hosts SystemSketch installs its bridge before this bundle
   * runs, so the decision is already made by the time App renders. The
   * embedded lane is the same canvas and the same seams; what it drops is the
   * local workspace, because the host opened the file and owns saving it.
   */
  if (isEmbedded()) {
    return <EmbeddedCanvas />
  }

  if (profile !== 'product') {
    return <DevelopmentCanvas profile={profile} />
  }

  return (
    <SystemSketchWorkspaceProvider>
      <ChromeProvider>
        <SystemSketchCanvas />
      </ChromeProvider>
    </SystemSketchWorkspaceProvider>
  )
}
