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
import { installInstantTextEditing } from '../instantTextEditing'
import { enablePasteAtCursor } from '../pasteAtCursor'
import { readEmbedHostBridge, type HostToEmbedMessage } from './embedProtocol'
import { decideOutgoing, externalChangeMessage, type EmbeddedDocument } from './embedSession'
import { decodeDocumentText, encodeDocumentText, isBlankDocument } from './sketchDocument'
import type { CSSProperties } from 'react'
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
   * The host's theme reaches the embedded chrome, and stops at the board.
   *
   * Throwing tldraw's own dark mode from here works — it was measured doing
   * exactly that in VS Code's dark workbench — and it is deliberately not
   * done, because SystemSketch's panels are authored light-only: the popout
   * header's `color` and divider are fixed light values, so a dark board ships
   * an inspector with an invisible title. The board therefore looks exactly
   * like the app it is a build of, which is the promise the extension makes.
   *
   * The signal is carried all the way here anyway, and stamped on the root, so
   * the day those panels are themed this becomes one call — and the journey
   * pins today's answer so that change has to be made on purpose.
   */
  useEffect(() => {
    editorRef.current?.user.updateUserPreferences({ colorScheme: 'light' })
  }, [colorScheme, openDocument])

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    if (openDocument.readOnly) editor.updateInstanceState({ isReadonly: true })
    const core = decodeDocumentText(openDocument.text)
    if (!isBlankDocument(core)) {
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
      <div className="systemsketch-embed-loading" data-testid="systemsketch-embed-loading">
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
