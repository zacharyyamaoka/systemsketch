import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
  Tldraw,
  loadSnapshot,
  parseTldrawJsonFile,
  serializeTldrawJson,
  type Editor,
} from 'tldraw'
import { useCallback, useEffect, useRef, useState } from 'react'
import 'tldraw/tldraw.css'
import { hydrateCustomColors } from '../appearance/customColors'
import { EXCALIDRAW_SHAPE_UTILS, registerExcalidrawPasteHandler } from '../excalidrawInterop'
import {
  BlockShapeUtil,
  BlockTool,
  getBlockShapeVisibility,
  installBlockClickToEdit,
  installBlockPortMenuTarget,
} from '../blocks'
import { BlockContextMenu } from '../blocks/ui'
import {
  blockConnectionBindingUtils,
  blockConnectionOverlayUtils,
  blockConnectionShapeUtils,
  installBlockConnections,
} from '../blocks/connections'
import { ChromeProvider } from '../chrome/ChromeProvider'
import { SystemSketchSurfaceHost } from '../chrome/SystemSketchChrome'
import { SystemSketchFigmaToolbar } from '../toolbar/SystemSketchToolbar'
import {
  registerToolbarSideEffects,
  SYSTEMSKETCH_TOOLBAR_OVERRIDES,
} from '../toolbar/toolbarIntegration'
import { interfaceScaleCssValues, useInterfaceScale } from '../settings/interfaceScale'
import { resolveHostTheme } from '../theme/themeModel'
import { installInstantTextEditing } from '../instantTextEditing'
import { enablePasteAtCursor } from '../pasteAtCursor'
import { readEmbedHostBridge, type HostToEmbedMessage } from './embedProtocol'
import { decideOutgoing, externalChangeMessage, type EmbeddedDocument } from './embedSession'
import { decodeDocumentText, encodeDocumentText, isBlankDocument } from './sketchDocument'
import type { CSSProperties } from 'react'
import '../theme/tokens.css'
import '../app.css'
import './embed.css'

const ASSET_URLS = getAssetUrlsByImport()
const TLDRAW_LICENSE_KEY = __TLDRAW_LICENSE_KEY__ || undefined

/**
 * The embedded chrome: the product's canvas with the file surfaces removed.
 *
 * `MainMenu`, `MenuPanel` and `SharePanel` all exist to answer "which document
 * am I in, and what else could I open" — questions an IDE has already answered
 * in its own tab bar and file tree before this canvas ever mounts. Keeping
 * duplicates of them here would be two file managers disagreeing. Everything
 * that edits the *board* stays exactly as it is in the app, and the navigation
 * panel falls back to tldraw's stock zoom controls because SystemSketch's own
 * one carries release channels, which an editor pane has no business showing.
 */
const EMBEDDED_COMPONENTS = {
  ContextMenu: BlockContextMenu,
  InFrontOfTheCanvas: SystemSketchSurfaceHost,
  MainMenu: null,
  MenuPanel: null,
  SharePanel: null,
  StylePanel: null,
  Toolbar: SystemSketchFigmaToolbar,
}
const EMBEDDED_SHAPE_UTILS = [
  ...EXCALIDRAW_SHAPE_UTILS,
  BlockShapeUtil,
  ...blockConnectionShapeUtils,
]
const EMBEDDED_BINDING_UTILS = [...blockConnectionBindingUtils]
const EMBEDDED_OVERLAY_UTILS = [...blockConnectionOverlayUtils]
const EMBEDDED_TOOLS = [BlockTool]

/** Long enough that a drag is one write, short enough that a pause is saved. */
const CHANGE_DEBOUNCE_MS = 250

interface OpenState extends EmbeddedDocument {
  /** The document text exactly as the host handed it over. */
  text: string
  /** Bumped on every host-driven load so the store is rebuilt, never patched. */
  nonce: number
}

function EmbeddedSurface({
  document: openDocument,
  colorScheme,
  onCanvasText,
  onLoadError,
}: {
  document: OpenState
  colorScheme: 'light' | 'dark'
  onCanvasText(text: string): void
  onLoadError(message: string): void
}) {
  const interfaceScale = useInterfaceScale()
  const scaleCss = interfaceScaleCssValues(interfaceScale)
  const editorRef = useRef<Editor | null>(null)

  /**
   * The host's theme reaches the board, not just the pane around it.
   *
   * tldraw owns light/dark for everything it paints behind one user
   * preference, and every `--tl-*` token the chrome derives from flips with
   * it, so following the host is this one supported call. The chrome around
   * the board reads the host's own variables through the `data-ss-theme`
   * stamped on the wrapper below, so a dark workbench gets a dark, legible
   * pane — the plugin journey measures the contrast rather than trusting this.
   */
  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ colorScheme })
  }, [colorScheme, openDocument])

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    if (openDocument.readOnly) editor.updateInstanceState({ isReadonly: true })
    const core = decodeDocumentText(openDocument.text)
    if (!isBlankDocument(core)) {
      // Custom colours are validated by name as the file parses; see LocalWorkspace.
      hydrateCustomColors(core, editor)
      const parsed = parseTldrawJsonFile({ json: core, schema: editor.store.schema })
      if (parsed.ok) {
        editor.store.mergeRemoteChanges(() => {
          loadSnapshot(editor.store, parsed.value.getStoreSnapshot())
        })
      } else {
        onLoadError(`tldraw could not read this document (${parsed.error.type})`)
      }
    }

    enablePasteAtCursor(editor)
    const stopBlockConnections = installBlockConnections(editor)
    const stopInstantTextEditing = installInstantTextEditing(editor)
    const stopBlockClickToEdit = installBlockClickToEdit(editor)
    const stopBlockPortMenuTarget = installBlockPortMenuTarget(editor)
    const stopExcalidrawPaste = registerExcalidrawPasteHandler(editor)
    const stopToolbarSideEffects = registerToolbarSideEffects(editor)

    // Only `source: 'user'` fires here, so loading the host's document above —
    // a remote change — cannot bounce straight back out as an edit.
    let timer: number | undefined
    const stopListening = editor.store.listen(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void serializeTldrawJson(editor).then(onCanvasText).catch(() => {
          onLoadError('SystemSketch could not serialize the canvas.')
        })
      }, CHANGE_DEBOUNCE_MS)
    }, { source: 'user', scope: 'document' })

    return () => {
      window.clearTimeout(timer)
      if (editorRef.current === editor) editorRef.current = null
      stopListening()
      stopToolbarSideEffects()
      stopExcalidrawPaste()
      stopBlockPortMenuTarget()
      stopBlockClickToEdit()
      stopInstantTextEditing()
      stopBlockConnections()
    }
  }, [openDocument, onCanvasText, onLoadError])

  return (
    <main
      className="systemsketch-app systemsketch-embedded-app"
      data-testid="systemsketch-embedded-app"
      data-embed-path={openDocument.path}
      data-embed-color-scheme={colorScheme}
      data-interface-scale={interfaceScale}
      style={{
        '--systemsketch-interface-scale': scaleCss.scale,
        '--systemsketch-interface-scale-inverse': scaleCss.inverse,
      } as CSSProperties}
    >
      <Tldraw
        assetUrls={ASSET_URLS}
        bindingUtils={EMBEDDED_BINDING_UTILS}
        components={EMBEDDED_COMPONENTS}
        getShapeVisibility={getBlockShapeVisibility}
        licenseKey={TLDRAW_LICENSE_KEY}
        onMount={onMount}
        overlayUtils={EMBEDDED_OVERLAY_UTILS}
        overrides={SYSTEMSKETCH_TOOLBAR_OVERRIDES}
        shapeUtils={EMBEDDED_SHAPE_UTILS}
        tools={EMBEDDED_TOOLS}
      />
    </main>
  )
}

/**
 * SystemSketch as an editor pane inside an IDE.
 *
 * The host opens the file, so there is nothing to browse, save-as or name from
 * in here; there is a board, and every change to it is offered straight back
 * to the host, which owns the dirty tab and the ⌘S that flushes it.
 */
export function EmbeddedCanvas() {
  const bridge = useRef(readEmbedHostBridge()).current
  const [openDocument, setOpenDocument] = useState<OpenState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light')
  /**
   * Which theme block paints the chrome: the host's own, if `tokens.css` has
   * one for the name it announced, else the default — a host nobody has
   * written a theme for gets a correct-looking app rather than an unstyled one.
   */
  const hostTheme = resolveHostTheme(bridge?.host)
  const documentRef = useRef<OpenState | null>(null)
  const settledTextRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!bridge) return
    const onMessage = (event: MessageEvent<HostToEmbedMessage>) => {
      const message = event.data
      if (typeof message !== 'object' || message === null) return
      if (message.type === 'open' || message.type === 'external-change') {
        const previous = documentRef.current
        const next: OpenState = {
          path: message.type === 'open' ? message.path : previous?.path ?? '',
          readOnly: message.type === 'open' ? message.readOnly : previous?.readOnly ?? false,
          text: message.text,
          version: message.version,
          nonce: (previous?.nonce ?? 0) + 1,
        }
        documentRef.current = next
        settledTextRef.current = null
        inFlightRef.current = false
        setOpenDocument(next)
        setError(message.type === 'open' ? null : externalChangeMessage(message.reason))
        return
      }
      if (message.type === 'accepted') {
        const current = documentRef.current
        if (current) {
          const next = { ...current, version: message.version }
          documentRef.current = next
          setOpenDocument(next)
        }
        inFlightRef.current = false
        return
      }
      if (message.type === 'appearance') {
        setColorScheme(message.colorScheme)
        return
      }
      if (message.type === 'host-error') {
        inFlightRef.current = false
        setError(message.message)
      }
    }
    window.addEventListener('message', onMessage)
    bridge.post({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [bridge])

  const onCanvasText = useCallback((tldrawJson: string) => {
    const current = documentRef.current
    if (!bridge || !current) return
    let text: string
    try {
      text = encodeDocumentText(current.path, tldrawJson)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const decision = decideOutgoing({
      document: current,
      text,
      settledText: settledTextRef.current,
      inFlight: inFlightRef.current,
    })
    if (decision.kind !== 'post') return
    inFlightRef.current = true
    settledTextRef.current = decision.text
    bridge.post({ type: 'change', text: decision.text, baseVersion: decision.baseVersion })
  }, [bridge])

  if (!bridge) return null
  if (!openDocument) {
    return (
      <div
        className="systemsketch-embed-loading"
        data-testid="systemsketch-embed-loading"
        data-ss-theme={hostTheme}
        data-ss-color-scheme={colorScheme}
      >
        Opening SystemSketch…
      </div>
    )
  }

  return (
    <ChromeProvider>
      <div
        className="systemsketch-embed"
        data-testid="systemsketch-embed"
        data-embed-color-scheme={colorScheme}
        data-ss-theme={hostTheme}
        data-ss-color-scheme={colorScheme}
      >
        {error ? (
          <div className="systemsketch-embed-error" role="alert" data-testid="systemsketch-embed-error">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>×</button>
          </div>
        ) : null}
        {openDocument.readOnly ? (
          <div className="systemsketch-embed-readonly" data-testid="systemsketch-embed-readonly">
            Read-only
          </div>
        ) : null}
        <EmbeddedSurface
          key={`${openDocument.path}:${openDocument.nonce}`}
          document={openDocument}
          colorScheme={colorScheme}
          onCanvasText={onCanvasText}
          onLoadError={setError}
        />
      </div>
    </ChromeProvider>
  )
}
