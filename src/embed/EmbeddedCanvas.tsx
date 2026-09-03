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
  PillTool,
  getBlockShapeVisibility,
  installBlockClickToEdit,
  installBlockPortMenuTarget,
} from '../blocks'
import { BlockContextMenu } from '../blocks/ui'
import {
  BranchArmShapeUtil,
  BranchShapeUtil,
  BranchTool,
  installBranchClickToEdit,
  installBranchRegions,
} from '../branch'
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
import { createSystemSketchStore } from '../store/createSystemSketchStore'
import {
  readEmbedHostBridge,
  type EmbedHostBridge,
  type HostToEmbedMessage,
} from './embedProtocol'
import {
  acceptOutgoing,
  createCoalescingAsyncRunner,
  createFlushableDebounce,
  EMPTY_OUTGOING_QUEUE,
  externalChangeMessage,
  failOutgoing,
  installEmbeddedLifecycleFlush,
  queueOutgoing,
  retryOutgoing,
  type EmbeddedDocument,
  type OutgoingQueueState,
} from './embedSession'
import {
  decodeDocumentText,
  encodeDocumentText,
  isBlankDocument,
  newerDocumentVersion,
  type NewerDocumentVersion,
} from './sketchDocument'
import type { CSSProperties } from 'react'
import '../theme/tokens.css'
import '../app.css'
import './embed.css'
import { SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS } from '../stockPrimitiveVisuals'
import {
  importLegacyPyblocksSystemSketch,
  parseLegacyPyblocksSystemSketch,
} from '../import/legacyPyblocksSystemSketch'

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
  ...SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS,
  BlockShapeUtil,
  BranchShapeUtil,
  BranchArmShapeUtil,
  ...blockConnectionShapeUtils,
]
const EMBEDDED_BINDING_UTILS = [...blockConnectionBindingUtils]
const EMBEDDED_OVERLAY_UTILS = [...blockConnectionOverlayUtils]
const EMBEDDED_TOOLS = [BlockTool, BranchTool, PillTool]

/** Long enough that a drag is one write, short enough that a pause is saved. */
const CHANGE_DEBOUNCE_MS = 250
/** Avoid serializing every pointer move while retaining a lifecycle flush. */
const SERIALIZATION_DEBOUNCE_MS = 80

interface OpenState extends EmbeddedDocument {
  /** Read-only as requested by the host, before local format protection. */
  hostReadOnly: boolean
  /** The document text exactly as the host handed it over. */
  text: string
  /** Host-generated fence for checkpoints and serialized changes. */
  session: string
  /** Opaque stock Editor snapshot recovered after an interrupted teardown. */
  recovery?: { snapshot: unknown }
  /** Bumped on every host-driven load so the store is rebuilt, never patched. */
  nonce: number
  /** Present only when SystemSketch, rather than the host, protects the wrapper. */
  formatProtection?: NewerDocumentVersion
}

function EmbeddedSurface({
  document: openDocument,
  colorScheme,
  onCanvasText,
  onCanvasCheckpoint,
  onLoadError,
  onCompatibilityCopyAvailable,
}: {
  document: OpenState
  colorScheme: 'light' | 'dark'
  onCanvasText(text: string, sourceNonce: number, checkpointRevision: number): void
  onCanvasCheckpoint(snapshot: unknown, sourceNonce: number, revision: number): void
  onLoadError(message: string): void
  onCompatibilityCopyAvailable(available: boolean): void
}) {
  const interfaceScale = useInterfaceScale()
  const scaleCss = interfaceScaleCssValues(interfaceScale)
  const editorRef = useRef<Editor | null>(null)
  const [store] = useState(createSystemSketchStore)

  useEffect(() => () => store.dispose(), [store])

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
    onCompatibilityCopyAvailable(false)
    if (openDocument.readOnly) editor.updateInstanceState({ isReadonly: true })
    const core = decodeDocumentText(openDocument.text)
    // Custom colours are validated by name while a snapshot is loaded. Register
    // every name before either the durable document or an interrupted-edit
    // checkpoint reaches tldraw's stock schema.
    hydrateCustomColors(core, editor)
    let recoveredCheckpoint = false
    if (openDocument.recovery) {
      try {
        hydrateCustomColors(JSON.stringify(openDocument.recovery.snapshot) ?? '', editor)
        editor.store.mergeRemoteChanges(() => {
          loadSnapshot(
            editor.store,
            openDocument.recovery?.snapshot as Parameters<typeof loadSnapshot>[1],
          )
        })
        recoveredCheckpoint = true
      } catch {
        onLoadError('SystemSketch could not restore the interrupted edit checkpoint.')
      }
    }
    if (!recoveredCheckpoint) {
      if (!isBlankDocument(core)) {
        const legacy = parseLegacyPyblocksSystemSketch(core)
        if (legacy) {
          importLegacyPyblocksSystemSketch(editor, legacy)
        } else {
          const parsed = parseTldrawJsonFile({ json: core, schema: editor.store.schema })
          if (parsed.ok) {
            editor.store.mergeRemoteChanges(() => {
              loadSnapshot(editor.store, parsed.value.getStoreSnapshot())
            })
            if (openDocument.formatProtection) onCompatibilityCopyAvailable(true)
          } else {
            onLoadError(`tldraw could not read this document (${parsed.error.type})`)
          }
        }
      }
    }
    if (openDocument.formatProtection && recoveredCheckpoint) {
      onCompatibilityCopyAvailable(true)
    }

    enablePasteAtCursor(editor)
    const stopBlockConnections = installBlockConnections(editor)
    const stopInstantTextEditing = installInstantTextEditing(editor)
    const stopBlockClickToEdit = installBlockClickToEdit(editor)
    const stopBranchClickToEdit = installBranchClickToEdit(editor)
    const stopBranchRegions = installBranchRegions(editor)
    const stopBlockPortMenuTarget = installBlockPortMenuTarget(editor)
    const stopExcalidrawPaste = registerExcalidrawPasteHandler(editor)
    const stopToolbarSideEffects = registerToolbarSideEffects(editor)

    // Only `source: 'user'` fires here, so loading the host's document above —
    // a remote change — cannot bounce straight back out as an edit.
    let serializationRequests = 0
    let flushThroughRequest = 0
    let checkpointedRequest = 0
    let latestSerializedText: string | null = null
    let latestSerializedRevision = 0
    const postLatestSerialization = createFlushableDebounce(() => {
      if (latestSerializedText !== null) {
        onCanvasText(latestSerializedText, openDocument.nonce, latestSerializedRevision)
      }
    }, CHANGE_DEBOUNCE_MS)
    const serializeLatest = createCoalescingAsyncRunner(
      async () => {
        const revision = serializationRequests
        return { text: await serializeTldrawJson(editor), revision }
      },
      ({ text, revision }) => {
        latestSerializedText = text
        latestSerializedRevision = revision
        postLatestSerialization.trigger()
        // A lifecycle boundary may have arrived while serialization was still
        // resolving. In that case the just-finished cached payload leaves now,
        // rather than starting a fresh debounce the dying webview cannot wait.
        if (serializationRequests <= flushThroughRequest) {
          postLatestSerialization.flush()
        }
      },
      () => {
        onLoadError('SystemSketch could not serialize the canvas.')
      },
    )
    const checkpointLatest = () => {
      if (serializationRequests === 0 || checkpointedRequest >= serializationRequests) return
      try {
        checkpointedRequest = serializationRequests
        onCanvasCheckpoint(editor.getSnapshot(), openDocument.nonce, checkpointedRequest)
      } catch {
        onLoadError('SystemSketch could not checkpoint the canvas before it closed.')
      }
    }
    const serializePending = () => {
      // Move a stock Editor snapshot into host ownership before the official
      // serializer starts resolving assets. The host keeps it opaque and uses
      // stock loadSnapshot if an interrupted pane must be recovered.
      checkpointLatest()
      serializeLatest()
    }
    const requestSerialization = () => {
      serializationRequests += 1
      pendingSerialization.trigger()
    }
    const pendingSerialization = createFlushableDebounce(
      serializePending,
      SERIALIZATION_DEBOUNCE_MS,
    )
    const flushCachedSerialization = () => {
      flushThroughRequest = serializationRequests
      pendingSerialization.flush()
      // A serializer may already be running while a newer request is waiting.
      // The synchronous checkpoint crosses into host ownership before teardown.
      checkpointLatest()
      postLatestSerialization.flush()
    }
    const stopLifecycleFlush = installEmbeddedLifecycleFlush({
      windowTarget: window,
      documentTarget: document,
      flush: flushCachedSerialization,
    })
    const stopListening = editor.store.listen(() => {
      // A short serialization debounce coalesces pointer moves. pagehide and
      // cleanup flush it before the dying webview can strand the last gesture.
      requestSerialization()
    }, { source: 'user', scope: 'document' })
    if (recoveredCheckpoint && !openDocument.readOnly) requestSerialization()

    return () => {
      stopListening()
      // Teardown is also a save boundary. Serialize before the editor and its
      // store are released so a final drag or keystroke is not dropped merely
      // because it did not sit idle for the full debounce window.
      flushCachedSerialization()
      stopLifecycleFlush()
      if (editorRef.current === editor) editorRef.current = null
      stopToolbarSideEffects()
      stopExcalidrawPaste()
      stopBlockPortMenuTarget()
      stopBranchRegions()
      stopBranchClickToEdit()
      stopBlockClickToEdit()
      stopInstantTextEditing()
      stopBlockConnections()
    }
  }, [openDocument, onCanvasCheckpoint, onCanvasText, onCompatibilityCopyAvailable, onLoadError])

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
        store={store}
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
export interface EmbeddedCanvasProps {
  /** Direct injection for a host mounted in this document, such as Obsidian. */
  bridge?: EmbedHostBridge | null
}

export function EmbeddedCanvas({ bridge: injectedBridge }: EmbeddedCanvasProps = {}) {
  const detectedBridge = useRef(readEmbedHostBridge()).current
  const bridge = injectedBridge ?? detectedBridge
  const [openDocument, setOpenDocument] = useState<OpenState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryHostWrite, setRetryHostWrite] = useState(false)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light')
  const [canCompatibilityCopy, setCanCompatibilityCopy] = useState(false)
  /**
   * Which theme block paints the chrome: the host's own, if `tokens.css` has
   * one for the name it announced, else the default — a host nobody has
   * written a theme for gets a correct-looking app rather than an unstyled one.
   */
  const hostTheme = resolveHostTheme(bridge?.host)
  const documentRef = useRef<OpenState | null>(null)
  const outgoingRef = useRef<OutgoingQueueState>(EMPTY_OUTGOING_QUEUE)
  const outgoingRevisionRef = useRef({ settled: 0, pending: 0 })

  const postChange = useCallback((
    current: OpenState,
    text: string,
    baseVersion: number,
    checkpointRevision: number,
  ) => {
    if (!bridge) return
    bridge.post({
      type: 'change',
      text,
      baseVersion,
      session: current.session,
      checkpointRevision,
    })
  }, [bridge])

  useEffect(() => {
    if (!bridge) return
    const receive = (message: HostToEmbedMessage) => {
      if (typeof message !== 'object' || message === null) return
      if (message.type === 'open' || message.type === 'external-change') {
        const previous = documentRef.current
        const path = message.type === 'open' ? message.path : previous?.path ?? ''
        const hostReadOnly = message.type === 'open'
          ? message.readOnly
          : previous?.hostReadOnly ?? false
        const newerVersion = newerDocumentVersion(path, message.text)
        const next: OpenState = {
          path,
          hostReadOnly,
          readOnly: hostReadOnly || newerVersion?.readOnly === true,
          text: message.text,
          version: message.version,
          session: message.session,
          recovery: message.type === 'open' ? message.recovery : undefined,
          nonce: (previous?.nonce ?? 0) + 1,
          formatProtection: hostReadOnly ? undefined : newerVersion ?? undefined,
        }
        documentRef.current = next
        outgoingRef.current = EMPTY_OUTGOING_QUEUE
        outgoingRevisionRef.current = { settled: 0, pending: 0 }
        setRetryHostWrite(false)
        setCanCompatibilityCopy(false)
        setOpenDocument(next)
        setError(
          newerVersion?.message
          ?? (message.type === 'open' ? null : externalChangeMessage(message.reason)),
        )
        return
      }
      if (message.type === 'accepted') {
        const current = documentRef.current
        if (current) {
          const next = { ...current, version: message.version, recovery: undefined }
          documentRef.current = next
          setOpenDocument(next)
          const transition = acceptOutgoing({
            document: next,
            state: outgoingRef.current,
          })
          outgoingRef.current = transition.state
          const pendingRevision = outgoingRevisionRef.current.pending
          if (transition.decision?.kind === 'post') {
            outgoingRevisionRef.current = { settled: pendingRevision, pending: 0 }
            postChange(
              next,
              transition.decision.text,
              transition.decision.baseVersion,
              pendingRevision,
            )
          } else {
            outgoingRevisionRef.current = {
              settled: Math.max(outgoingRevisionRef.current.settled, pendingRevision),
              pending: 0,
            }
            if (transition.decision?.kind === 'hold' && transition.decision.reason === 'unchanged') {
              bridge.post({
                type: 'checkpoint-settled',
                session: next.session,
                revision: pendingRevision,
              })
            }
          }
          setRetryHostWrite(false)
          setError(null)
        }
        return
      }
      if (message.type === 'appearance') {
        setColorScheme(message.colorScheme)
        return
      }
      if (message.type === 'host-error') {
        if (message.retryable === false) {
          setRetryHostWrite(false)
          setError(message.message)
          return
        }
        const state = outgoingRef.current
        const retainedRevision = state.pendingText === null
          ? outgoingRevisionRef.current.settled
          : outgoingRevisionRef.current.pending
        outgoingRef.current = failOutgoing(outgoingRef.current)
        outgoingRevisionRef.current = { settled: 0, pending: retainedRevision }
        setRetryHostWrite(true)
        setError(message.message)
      }
    }
    const onMessage = (event: MessageEvent<HostToEmbedMessage>) => receive(event.data)
    const unsubscribe = bridge.subscribe
      ? bridge.subscribe(receive)
      : (() => {
          window.addEventListener('message', onMessage)
          return () => window.removeEventListener('message', onMessage)
        })()
    bridge.post({ type: 'ready' })
    return unsubscribe
  }, [bridge, postChange])

  const onCanvasText = useCallback((
    tldrawJson: string,
    sourceNonce: number,
    checkpointRevision: number,
  ) => {
    const current = documentRef.current
    // A host-driven reload remounts the surface. Its old cleanup may finish
    // serialization asynchronously; never apply those bytes to the newer file.
    if (!bridge || !current || current.nonce !== sourceNonce) return
    let text: string
    try {
      text = encodeDocumentText(current.path, tldrawJson)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return
    }
    const transition = queueOutgoing({
      document: current,
      text,
      state: outgoingRef.current,
    })
    outgoingRef.current = transition.state
    if (transition.decision?.kind === 'post') {
      outgoingRevisionRef.current = { settled: checkpointRevision, pending: 0 }
    } else if (transition.decision?.kind === 'hold' && transition.decision.reason === 'in-flight') {
      outgoingRevisionRef.current.pending = checkpointRevision
    }
    if (transition.decision?.kind === 'hold' && transition.decision.reason === 'unchanged') {
      outgoingRevisionRef.current.settled = Math.max(
        outgoingRevisionRef.current.settled,
        checkpointRevision,
      )
      bridge.post({
        type: 'checkpoint-settled',
        session: current.session,
        revision: checkpointRevision,
      })
      return
    }
    if (transition.decision?.kind !== 'post') return
    setRetryHostWrite(false)
    setError(null)
    postChange(
      current,
      transition.decision.text,
      transition.decision.baseVersion,
      checkpointRevision,
    )
  }, [bridge, postChange])

  const onCanvasCheckpoint = useCallback((
    snapshot: unknown,
    sourceNonce: number,
    revision: number,
  ) => {
    const current = documentRef.current
    if (!bridge || !current || current.readOnly || current.nonce !== sourceNonce) return
    bridge.post({
      type: 'checkpoint',
      snapshot,
      session: current.session,
      revision,
    })
  }, [bridge])

  const retryFailedHostWrite = useCallback(() => {
    const current = documentRef.current
    if (!bridge || !current) return
    const pendingRevision = outgoingRevisionRef.current.pending
    const transition = retryOutgoing({ document: current, state: outgoingRef.current })
    outgoingRef.current = transition.state
    if (transition.decision?.kind !== 'post') return
    outgoingRevisionRef.current = { settled: pendingRevision, pending: 0 }
    setRetryHostWrite(false)
    setError(null)
    postChange(
      current,
      transition.decision.text,
      transition.decision.baseVersion,
      pendingRevision,
    )
  }, [bridge, postChange])

  const requestCompatibilityCopy = useCallback(() => {
    const current = documentRef.current
    if (!bridge || !current?.formatProtection || !canCompatibilityCopy) return
    bridge.post({
      type: 'request-compatible-copy',
      session: current.session,
      baseVersion: current.version,
    })
  }, [bridge, canCompatibilityCopy])

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
            {retryHostWrite ? (
              <button type="button" className="systemsketch-embed-error__retry" onClick={retryFailedHostWrite}>
                Retry
              </button>
            ) : null}
            <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>×</button>
          </div>
        ) : null}
        {openDocument.recovery ? (
          <div className="systemsketch-embed-recovery" role="status" data-testid="systemsketch-embed-recovery">
            Recovered unsaved canvas edits from the closed pane. The IDE is catching up…
          </div>
        ) : null}
        {openDocument.readOnly ? (
          <div className="systemsketch-embed-readonly" data-testid="systemsketch-embed-readonly">
            <span>Read-only</span>
            {openDocument.formatProtection && canCompatibilityCopy ? (
              <button
                type="button"
                data-testid="systemsketch-compatible-copy"
                onClick={requestCompatibilityCopy}
              >Create editable copy…</button>
            ) : null}
          </div>
        ) : null}
        <EmbeddedSurface
          key={`${openDocument.path}:${openDocument.nonce}`}
          document={openDocument}
          colorScheme={colorScheme}
          onCanvasText={onCanvasText}
          onCanvasCheckpoint={onCanvasCheckpoint}
          onLoadError={setError}
          onCompatibilityCopyAvailable={setCanCompatibilityCopy}
        />
      </div>
    </ChromeProvider>
  )
}
