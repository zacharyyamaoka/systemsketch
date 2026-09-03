import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiButton,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useDialogs,
  loadSnapshot,
  serializeTldrawJson,
  type Editor,
} from 'tldraw'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  WorkspaceConflict,
  createWorkspaceDirectory,
  flushWorkspaceDocument,
  listWorkspace,
  readWorkspaceDocument,
  renameWorkspaceDocument,
  revealWorkspaceDocument,
  statWorkspaceDocument,
  trashWorkspaceDocument,
  writeWorkspaceDocument,
  type WorkspaceListing,
} from './workspaceClient'
import {
  SYSTEMSKETCH_SUFFIX,
  TLDRAW_SUFFIX,
  breadcrumbTrail,
  browserRows,
  claimUntitledPath,
  documentHref,
  documentPathFor,
  documentSuffix,
  documentTitle,
  encodeDocumentForPath,
  forgetDocumentPath,
  moveBrowserSelection,
  nextSyncAction,
  nextUntitledDocumentPath,
  parentDirectory,
  readRecentDocumentPaths,
  readUntitledClaims,
  rememberDocumentPath,
  removesDocumentBoundary,
  renamedDocumentPath,
  resolveBrowserSelection,
  replaceRememberedDocumentPath,
  workspaceBrowserDirectory,
  type BrowserRow,
  type DocumentFingerprint,
} from './workspaceModel'
import { inspectWorkspaceDocumentSource } from './workspaceDocument'
import { installWorkspaceLifecycleProtection } from './workspaceLifecycle'
import { decodeSystemSketchDocument } from './systemSketchFile'
import { detachAllPrimitives } from '../blocks/detach'
import './local-workspace.css'
import { hydrateCustomColors } from '../appearance/customColors'
import { SettingsGearIcon, SystemSketchSettingsDialog } from '../settings/InterfaceSettings'
import { importLegacyPyblocksSystemSketch } from '../import/legacyPyblocksSystemSketch'
import { emitRecorderDiagnostic } from '../recorder/recorderEvents'
import { useConfirm } from '../chrome/ConfirmDialog'
import { consolidateDocumentToSinglePage } from '../singlePageDocument'

const SAVE_DEBOUNCE_MS = 600
const WATCH_INTERVAL_MS = 1500
const NOTICE_TIMEOUT_MS = 6000

export type WorkspaceStatus =
  | { kind: 'loading' }
  | { kind: 'invalid-url'; message: string }
  | { kind: 'clean'; at: number | null }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'conflict' }
  | { kind: 'missing' }
  | { kind: 'future'; message: string; formatVersion: number; supportedVersion: number }
  | { kind: 'quarantined'; message: string }
  | { kind: 'error'; message: string }

type WorkspaceDialogMode = 'open' | 'saveAs' | 'exportTldraw' | 'rename' | null

export interface LocalWorkspaceController {
  path: string | null
  /** A directory the primary-root-only file browser is authorized to list. */
  browserDirectory: string | null
  title: string
  isPersisted: boolean
  status: WorkspaceStatus
  recents: string[]
  attach(editor: Editor): () => void
  open(path: string): Promise<void>
  newDocument(): Promise<void>
  save(force?: boolean): Promise<void>
  saveAs(path: string, force?: boolean): Promise<void>
  exportTldraw(destination: string): Promise<void>
  rename(path: string): Promise<void>
  /**
   * Moves the open board to Trash unconditionally.
   *
   * The confirmation deliberately lives at the call site rather than in here:
   * this provider is mounted *above* `<Tldraw>`, so it has no dialog stack of
   * its own, and asking from here is what forced the old `window.confirm`.
   */
  trash(): Promise<void>
  reveal(): Promise<void>
  takeDisk(): Promise<void>
  openWindow(path?: string): Promise<void>
  newWindow(): Promise<void>
  showDialog(mode: Exclude<WorkspaceDialogMode, null>): void
  closeDialog(): void
  notice: string | null
  dismissNotice(): void
}

const LocalWorkspaceContext = createContext<LocalWorkspaceController | null>(null)

export function useLocalWorkspace(): LocalWorkspaceController {
  const workspace = useContext(LocalWorkspaceContext)
  if (!workspace) throw new Error('Local workspace controls must be used inside the provider')
  return workspace
}

/**
 * A real second OS window, not a tab: `popup` is what makes Chrome open a
 * separate window, and the desktop app runs in `--app` mode where that window
 * inherits the same chromeless frame the first one has.
 */
function newWindowFeatures(): string {
  const width = Math.max(900, Math.round((window.outerWidth || 1440) * 0.92))
  const height = Math.max(640, Math.round((window.outerHeight || 900) * 0.92))
  return [
    'popup=yes',
    'noopener=no',
    `width=${width}`,
    `height=${height}`,
    `left=${(window.screenX || 0) + 48}`,
    `top=${(window.screenY || 0) + 48}`,
  ].join(',')
}

/**
 * Force an export destination to `.tldr`.
 *
 * The chooser is asked for `.tldr` and appends it when nothing is typed, but a
 * person can still type `Board.systemsketch` into a save dialog. An export that
 * honoured that would write stock primitives under the extension that promises
 * semantics — the exact confusion the two file types exist to prevent.
 */
function exportedTldrawPath(path: string): string {
  const suffix = documentSuffix(path)
  return suffix === TLDRAW_SUFFIX ? path : `${suffix ? path.slice(0, -suffix.length) : path}${TLDRAW_SUFFIX}`
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function invalidBoardUrlMessage(query: URLSearchParams, explicitPath: string | null): string | null {
  if (explicitPath) return null
  if (query.has('board')) return 'The board link has no file path. Add a path after “?board=”.'
  if ([...query.keys()].some((key) => key.startsWith('board='))) {
    return 'Use ?board=/path/to/file.systemsketch; leave = unescaped.'
  }
  return null
}

function fingerprint(document: { mtime?: number; size?: number }): DocumentFingerprint | null {
  return document.mtime === undefined || document.size === undefined
    ? null
    : { mtime: document.mtime, size: document.size }
}

/**
 * One reader for both document types. `.systemsketch` loses its envelope here
 * and `.tldr` passes through byte-identical, so from this line down tldraw is
 * parsing exactly the portable file it has always parsed.
 */
function loadDocumentSource(editor: Editor, source: string) {
  const { core } = decodeSystemSketchDocument(source)
  // A custom colour is a named colour that carries its hex, and the store
  // validates names as it parses — so every name the file uses is registered
  // from the text first, or the parse below would reject the document.
  hydrateCustomColors(core, editor)
  const inspected = inspectWorkspaceDocumentSource(source, editor.store.schema)
  if (inspected.kind === 'legacy-pyblocks') {
    importLegacyPyblocksSystemSketch(editor, inspected.document)
  } else if (inspected.kind === 'ready' || inspected.kind === 'future') {
    editor.store.mergeRemoteChanges(() => {
      loadSnapshot(editor.store, inspected.snapshot)
    })
  }
  const singlePageMigration = (
    inspected.kind === 'legacy-pyblocks'
    || inspected.kind === 'ready'
  )
    ? consolidateDocumentToSinglePage(editor)
    : { changed: false, pageCountBefore: 0, frameIds: [] }
  return { ...inspected, singlePageMigration }
}

async function firstReadableRecent(paths: string[]): Promise<{
  path: string
  document: Awaited<ReturnType<typeof readWorkspaceDocument>>
} | null> {
  for (const path of paths) {
    try {
      const document = await readWorkspaceDocument(path)
      if (document.source !== null) return { path, document }
      forgetDocumentPath(path)
    } catch {
      forgetDocumentPath(path)
    }
  }
  return null
}

export function SystemSketchWorkspaceProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string | null>(null)
  const [browserHome, setBrowserHome] = useState<{ root: string; directory: string } | null>(null)
  const [isPersisted, setIsPersisted] = useState(false)
  const [status, setStatus] = useState<WorkspaceStatus>({ kind: 'loading' })
  const [recents, setRecents] = useState<string[]>(() => readRecentDocumentPaths())
  const [dialog, setDialog] = useState<WorkspaceDialogMode>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const editorRef = useRef<Editor | null>(null)
  const browserHomeRef = useRef<{ root: string; directory: string } | null>(null)
  const pathRef = useRef<string | null>(null)
  const sourceRef = useRef<string | null>(null)
  const digestRef = useRef<string | null>(null)
  const fingerprintRef = useRef<DocumentFingerprint | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  /** True for unreadable recovery and parseable future-format documents alike. */
  const protectedRef = useRef(false)
  // Held while an export is borrowing the live document. See `exportTldraw`.
  const exportingRef = useRef(false)
  const queuedSourceRef = useRef<Promise<string> | null>(null)
  // Counts document changes, so a save knows whether more arrived while it ran.
  const changeEpochRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveStopRef = useRef<(() => void) | null>(null)
  const startAutosaveRef = useRef<() => void>(() => {})
  const persistRef = useRef<(force?: boolean) => Promise<void>>(async () => {})
  const finalFlushRef = useRef<() => void>(() => {})
  const statusRef = useRef(status)
  statusRef.current = status

  const updateRecents = useCallback((next: string[]) => setRecents(next), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const query = new URLSearchParams(window.location.search)
        const explicitPath = query.get('board')?.trim() || null
        const invalidBoardUrl = invalidBoardUrlMessage(query, explicitPath)
        if (invalidBoardUrl) {
          if (!cancelled) setStatus({ kind: 'invalid-url', message: invalidBoardUrl })
          return
        }
        const listing = await listWorkspace()
        const isIndependentDevelopmentBoard = query.has('previewClone') || query.has('preset')
        let selectedPath: string
        let document: Awaited<ReturnType<typeof readWorkspaceDocument>>

        if (explicitPath) {
          selectedPath = explicitPath
          document = await readWorkspaceDocument(selectedPath)
        } else if (!isIndependentDevelopmentBoard) {
          const recent = await firstReadableRecent(readRecentDocumentPaths())
          if (recent) {
            selectedPath = recent.path
            document = recent.document
          } else {
            const existingDefault = listing.documents.find(
              (candidate) => candidate.path === listing.defaultDocument,
            )
            selectedPath = existingDefault?.path
              ?? nextUntitledDocumentPath(
                listing.dir,
                listing.documents.map((candidate) => candidate.path),
              )
            document = await readWorkspaceDocument(selectedPath)
          }
        } else {
          selectedPath = nextUntitledDocumentPath(
            listing.dir,
            listing.documents.map((candidate) => candidate.path),
          )
          document = { path: selectedPath, source: null }
        }

        if (cancelled) return
        const nextBrowserHome = { root: listing.root, directory: listing.dir }
        browserHomeRef.current = nextBrowserHome
        pathRef.current = selectedPath
        sourceRef.current = document.source
        digestRef.current = document.digest ?? null
        fingerprintRef.current = fingerprint(document)
        if (document.source !== null) updateRecents(rememberDocumentPath(selectedPath))
        setPath(selectedPath)
        setBrowserHome(nextBrowserHome)
        setIsPersisted(document.source !== null)
        setStatus({ kind: 'clean', at: null })
      } catch (cause) {
        if (!cancelled) setStatus({ kind: 'error', message: errorMessage(cause) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [updateRecents])

  const scheduleSave = useCallback(() => {
    const rescheduled = saveTimerRef.current !== null
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistRef.current()
    }, SAVE_DEBOUNCE_MS)
    if (!rescheduled) {
      emitRecorderDiagnostic({
        lane: 'workspace', name: 'autosave-scheduled', summary: 'autosave scheduled',
        detail: { path: pathRef.current, delayMs: SAVE_DEBOUNCE_MS, changeEpoch: changeEpochRef.current },
      })
    }
  }, [])

  const scheduleSinglePageMigrationSave = useCallback(() => {
    dirtyRef.current = true
    changeEpochRef.current += 1
    queuedSourceRef.current = null
    setStatus({ kind: 'dirty' })
    scheduleSave()
  }, [scheduleSave])

  const protectDocument = useCallback((
    editor: Editor,
    protection:
      | { kind: 'quarantined'; message: string }
      | { kind: 'future'; message: string; formatVersion: number; supportedVersion: number },
  ) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    autosaveStopRef.current?.()
    autosaveStopRef.current = null
    protectedRef.current = true
    dirtyRef.current = false
    queuedSourceRef.current = null
    editor.updateInstanceState({ isReadonly: true })
    setStatus(protection)
  }, [])

  const persist = useCallback(async (force = false) => {
    const boardPath = pathRef.current
    const editor = editorRef.current
    const queuedSource = queuedSourceRef.current
    if (boardPath === null || (editor === null && queuedSource === null)) return
    if (protectedRef.current) {
      setNotice('This file is protected. Create a separate editable copy to keep the original untouched.')
      return
    }
    // An export detaches every Block in the live document and puts it straight
    // back. Persisting mid-export would write that borrowed state to the file
    // the user is actually editing.
    if (exportingRef.current) return
    if (savingRef.current) {
      if (dirtyRef.current) scheduleSave()
      return
    }

    savingRef.current = true
    setStatus({ kind: 'saving' })
    const changeEpoch = changeEpochRef.current
    const saveStarted = performance.now()
    emitRecorderDiagnostic({
      lane: 'workspace', name: 'autosave-start', summary: force ? 'forced save started' : 'autosave started',
      detail: { path: boardPath, force, baseDigest: digestRef.current, changeEpoch },
    })
    const sourcePromise = queuedSource ?? serializeTldrawJson(editor!)
    let savedSuccessfully = false
    try {
      const source = encodeDocumentForPath(boardPath, await sourcePromise)
      const saved = await writeWorkspaceDocument({
        path: boardPath,
        source,
        baseDigest: digestRef.current,
        force,
      })
      digestRef.current = saved.digest
      fingerprintRef.current = { mtime: saved.mtime, size: saved.size }
      sourceRef.current = source
      savedSuccessfully = true
      setIsPersisted(true)
      updateRecents(rememberDocumentPath(boardPath))
      if (queuedSourceRef.current === sourcePromise) queuedSourceRef.current = null
      // Clean only if nothing changed while the save was in flight.
      if (changeEpochRef.current === changeEpoch) dirtyRef.current = false
      setStatus(dirtyRef.current ? { kind: 'dirty' } : { kind: 'clean', at: Date.now() })
      emitRecorderDiagnostic({
        lane: 'workspace', name: 'autosave-complete', summary: dirtyRef.current ? 'save completed; newer edits remain' : 'autosave completed',
        detail: {
          path: boardPath,
          force,
          durationMs: +(performance.now() - saveStarted).toFixed(1),
          digest: saved.digest,
          mtime: saved.mtime,
          size: saved.size,
          changeEpoch,
          currentChangeEpoch: changeEpochRef.current,
          dirtyAfterSave: dirtyRef.current,
        },
      })
    } catch (cause) {
      dirtyRef.current = true
      setStatus(
        cause instanceof WorkspaceConflict
          ? { kind: 'conflict' }
          : { kind: 'error', message: errorMessage(cause) },
      )
      emitRecorderDiagnostic({
        lane: 'workspace', name: 'autosave-error', summary: cause instanceof WorkspaceConflict ? 'autosave conflict' : 'autosave failed', level: 'error',
        detail: {
          path: boardPath,
          force,
          durationMs: +(performance.now() - saveStarted).toFixed(1),
          changeEpoch,
          error: cause instanceof Error ? { name: cause.name, message: cause.message, stack: cause.stack } : String(cause),
          diskMtime: cause instanceof WorkspaceConflict ? cause.diskMtime : undefined,
          diskDigest: cause instanceof WorkspaceConflict ? cause.diskDigest : undefined,
        },
      })
    } finally {
      savingRef.current = false
      if (dirtyRef.current && savedSuccessfully) scheduleSave()
    }
  }, [scheduleSave, updateRecents])
  persistRef.current = persist

  const finalFlush = useCallback(() => {
    const boardPath = pathRef.current
    if (protectedRef.current || !dirtyRef.current || boardPath === null) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const editor = editorRef.current
    const sourcePromise = queuedSourceRef.current
      ?? (editor ? serializeTldrawJson(editor) : null)
    if (sourcePromise === null) return

    const baseDigest = digestRef.current
    void sourcePromise.then((tldrawSource) => flushWorkspaceDocument({
      path: boardPath,
      source: encodeDocumentForPath(boardPath, tldrawSource),
      baseDigest,
    })).catch(() => {
      // There is no remaining page UI after pagehide. The ordinary save kicked
      // off by visibilitychange/beforeunload is still running, and the browser
      // close prompt already gave the user the explicit chance to stay.
    })
  }, [])
  finalFlushRef.current = finalFlush

  const waitForSave = useCallback(async () => {
    const deadline = Date.now() + 5000
    while (savingRef.current && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 25))
    }
    if (savingRef.current) throw new Error('SystemSketch is still saving this document.')
    if (dirtyRef.current) await persistRef.current()
    if (dirtyRef.current) throw new Error('Resolve the save conflict before changing documents.')
  }, [])

  const open = useCallback(async (nextPath: string) => {
    await waitForSave()
    window.location.assign(documentHref(nextPath))
  }, [waitForSave])

  const reserveUntitledPath = useCallback(async () => {
    const home = browserHomeRef.current
    const directory = workspaceBrowserDirectory(
      pathRef.current,
      home?.root ?? null,
      home?.directory ?? null,
    )
    const listing = await listWorkspace(directory)
    const nextPath = nextUntitledDocumentPath(listing.dir, [
      ...listing.documents.map((candidate) => candidate.path),
      ...readUntitledClaims(),
    ])
    claimUntitledPath(nextPath)
    return nextPath
  }, [])

  const newDocument = useCallback(async () => {
    await waitForSave()
    window.location.assign(documentHref(await reserveUntitledPath()))
  }, [reserveUntitledPath, waitForSave])

  /**
   * The window handle is taken synchronously, inside the gesture that asked
   * for it, and only then pointed at a board: a popup opened after an awaited
   * round trip is the one Chrome blocks.
   */
  const openWindow = useCallback(async (target?: string) => {
    const handle = window.open('', '_blank', newWindowFeatures())
    if (!handle) {
      setNotice('SystemSketch could not open a new window. Allow pop-ups for this app, then try again.')
      return
    }
    try {
      const nextPath = target ?? (await reserveUntitledPath())
      handle.location.replace(new URL(documentHref(nextPath), window.location.href).toString())
      handle.focus()
    } catch (cause) {
      handle.close()
      setNotice(errorMessage(cause))
    }
  }, [reserveUntitledPath])

  const newWindow = useCallback(() => openWindow(), [openWindow])

  const saveAs = useCallback(async (nextPath: string, force = false) => {
    const editor = editorRef.current
    if (!editor || savingRef.current) throw new Error('The document is not ready to save yet.')
    const previousStatus = statusRef.current
    setStatus({ kind: 'saving' })
    savingRef.current = true
    try {
      const source = encodeDocumentForPath(nextPath, await serializeTldrawJson(editor))
      await writeWorkspaceDocument({ path: nextPath, source, baseDigest: null, force })
      updateRecents(rememberDocumentPath(nextPath))
      window.location.assign(documentHref(nextPath))
    } catch (cause) {
      setStatus(previousStatus)
      throw cause
    } finally {
      savingRef.current = false
    }
  }, [updateRecents])

  /**
   * Write the board as a plain `.tldr` that stock tldraw can open.
   *
   * The FR's own recipe: run detach-to-primitives over everything, so every
   * Block and cable reduces to a group of stock shapes, and let each group's
   * `meta` carry what it would take to rebuild it. Going back the other way is
   * then Rebuild Block from primitives, on the same records.
   *
   * The export borrows the LIVE document rather than building a second one:
   * detach is already one atomic, undoable operation, and running the real
   * command is the only way the exported file is guaranteed to match what the
   * canvas would have produced. Two things make borrowing safe — autosave is
   * held off for the whole window, and the bail is in a `finally`, so a failed
   * write cannot leave the user looking at a detached board.
   */
  const exportTldraw = useCallback(async (destination: string) => {
    const editor = editorRef.current
    if (!editor) throw new Error('The document is not ready to export yet.')
    await waitForSave()

    exportingRef.current = true
    setStatus({ kind: 'saving' })
    const mark = editor.markHistoryStoppingPoint('export to .tldr')
    try {
      detachAllPrimitives(editor)
      const source = await serializeTldrawJson(editor)
      await writeWorkspaceDocument({ path: destination, source, baseDigest: null, force: true })
    } finally {
      editor.bailToMark(mark)
      // The bail restored the document, so nothing is pending for it; anything
      // the detach queued describes a board that no longer exists.
      queuedSourceRef.current = null
      dirtyRef.current = false
      exportingRef.current = false
      setStatus({ kind: 'clean', at: Date.now() })
    }
  }, [waitForSave])

  const rename = useCallback(async (nextPath: string) => {
    const currentPath = pathRef.current
    if (!currentPath || nextPath === currentPath) return
    if (sourceRef.current === null) {
      await saveAs(nextPath)
      return
    }
    await waitForSave()
    if (!digestRef.current) throw new Error('The current file revision is not available yet.')
    setStatus({ kind: 'saving' })
    savingRef.current = true
    try {
      const renamed = await renameWorkspaceDocument({
        path: currentPath,
        destination: nextPath,
        baseDigest: digestRef.current,
      })
      pathRef.current = nextPath
      digestRef.current = renamed.digest
      fingerprintRef.current = { mtime: renamed.mtime, size: renamed.size }
      setPath(nextPath)
      setIsPersisted(true)
      updateRecents(replaceRememberedDocumentPath(currentPath, nextPath))
      window.history.replaceState(null, '', documentHref(nextPath))
      setStatus({ kind: 'clean', at: Date.now() })
    } catch (cause) {
      setStatus(
        cause instanceof WorkspaceConflict && !cause.message.includes('already exists')
          ? { kind: 'conflict' }
          : { kind: 'clean', at: null },
      )
      throw cause
    } finally {
      savingRef.current = false
    }
  }, [saveAs, updateRecents, waitForSave])

  const reloadFromDisk = useCallback(async () => {
    const editor = editorRef.current
    const boardPath = pathRef.current
    if (!editor || !boardPath) return
    try {
      const document = await readWorkspaceDocument(boardPath)
      if (document.source === null) {
        setStatus({ kind: 'missing' })
        return
      }
      const inspected = loadDocumentSource(editor, document.source)
      if (inspected.kind === 'quarantined' || inspected.kind === 'future') {
        sourceRef.current = document.source
        digestRef.current = document.digest ?? null
        fingerprintRef.current = fingerprint(document)
        setIsPersisted(true)
        protectDocument(editor, inspected)
        return
      }
      protectedRef.current = false
      editor.updateInstanceState({ isReadonly: false })
      startAutosaveRef.current()
      sourceRef.current = document.source
      digestRef.current = document.digest ?? null
      fingerprintRef.current = fingerprint(document)
      dirtyRef.current = false
      queuedSourceRef.current = null
      setIsPersisted(true)
      updateRecents(rememberDocumentPath(boardPath))
      setStatus({ kind: 'clean', at: Date.now() })
      if (inspected.singlePageMigration.changed) scheduleSinglePageMigrationSave()
    } catch (cause) {
      setStatus({ kind: 'error', message: errorMessage(cause) })
    }
  }, [protectDocument, scheduleSinglePageMigrationSave, updateRecents])

  const trash = useCallback(async () => {
    const boardPath = pathRef.current
    if (!boardPath) return
    if (sourceRef.current === null) {
      await newDocument()
      return
    }
    await waitForSave()
    if (!digestRef.current) throw new Error('The current file revision is not available yet.')
    await trashWorkspaceDocument({ path: boardPath, baseDigest: digestRef.current })
    updateRecents(forgetDocumentPath(boardPath))
    window.location.assign(documentHref(await reserveUntitledPath()))
  }, [newDocument, reserveUntitledPath, updateRecents, waitForSave])

  const reveal = useCallback(async () => {
    if (pathRef.current) await revealWorkspaceDocument(pathRef.current)
  }, [])

  const attach = useCallback((editor: Editor) => {
    editorRef.current = editor
    let disposed = false
    let migratedToSinglePage = false

    const startAutosave = () => {
      if (
        disposed
        || protectedRef.current
        || editorRef.current !== editor
        || autosaveStopRef.current !== null
      ) return

      autosaveStopRef.current = editor.store.listen((entry) => {
        if (removesDocumentBoundary(entry)) return
        dirtyRef.current = true
        changeEpochRef.current += 1
        // No serialisation here. The store flushes listeners once per frame, so
        // this ran on every frame of a drag and serialised the whole document
        // each time — while only the copy taken after the debounce is ever
        // written. `persist` serialises once, when it saves. And a status that
        // is already dirty stays the same object, or every frame re-renders
        // everything that reads the workspace context.
        setStatus((current) => (
          current.kind === 'conflict' || current.kind === 'dirty' ? current : { kind: 'dirty' }
        ))
        scheduleSave()
      }, { source: 'user', scope: 'document' })
    }
    startAutosaveRef.current = startAutosave

    if (sourceRef.current !== null) {
      const inspected = loadDocumentSource(editor, sourceRef.current)
      migratedToSinglePage = inspected.singlePageMigration.changed
      if (inspected.kind === 'quarantined' || inspected.kind === 'future') {
        protectDocument(editor, inspected)
      }
    }
    if (!protectedRef.current) {
      editor.updateInstanceState({ isReadonly: false })
      startAutosave()
      if (migratedToSinglePage) scheduleSinglePageMigrationSave()
    }

    return () => {
      disposed = true
      autosaveStopRef.current?.()
      autosaveStopRef.current = null
      if (startAutosaveRef.current === startAutosave) startAutosaveRef.current = () => {}
      // The editor is going away. If edits are still unsaved, take the one
      // snapshot a later `persist` will need once it can no longer ask for it.
      if (!protectedRef.current && dirtyRef.current && queuedSourceRef.current === null) {
        queuedSourceRef.current = serializeTldrawJson(editor)
      }
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [protectDocument, scheduleSave, scheduleSinglePageMigrationSave])

  useEffect(() => {
    if (!path) return
    let cancelled = false
    const timer = window.setInterval(() => {
      void (async () => {
        if (cancelled || savingRef.current || !editorRef.current) return
        try {
          const disk = await statWorkspaceDocument(path)
          const action = nextSyncAction({
            disk: disk.mtime === null || disk.size === undefined
              ? null
              : { mtime: disk.mtime, size: disk.size },
            base: fingerprintRef.current,
            hasUnsavedEdits: dirtyRef.current,
          })
          if (action.kind === 'reload') await reloadFromDisk()
          else if (action.kind === 'conflict') setStatus({ kind: 'conflict' })
          else if (action.kind === 'missing') setStatus({ kind: 'missing' })
        } catch {
          // A transient failed poll should not interrupt drawing; the next poll retries.
        }
      })()
    }, WATCH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [path, reloadFromDisk])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement
        && (target.matches('input, textarea, select') || target.isContentEditable)
      ) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        if (event.shiftKey) setDialog('saveAs')
        else void persistRef.current()
      } else if (key === 'o') {
        event.preventDefault()
        setDialog('open')
      } else if (key === 'n') {
        event.preventDefault()
        if (event.shiftKey) void newWindow()
        else void newDocument()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newDocument, newWindow])

  useEffect(() => {
    document.title = path ? `${documentTitle(path)} — SystemSketch` : 'SystemSketch'
  }, [path])

  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    return installWorkspaceLifecycleProtection({
      windowTarget: window,
      documentTarget: document,
      hasUnsavedChanges: () => !protectedRef.current && dirtyRef.current,
      flush: () => {
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
        }
        void persistRef.current()
      },
      finalFlush: () => finalFlushRef.current(),
    })
  }, [])

  const controller = useMemo<LocalWorkspaceController>(() => ({
    path,
    browserDirectory: workspaceBrowserDirectory(
      path,
      browserHome?.root ?? null,
      browserHome?.directory ?? null,
    ) ?? null,
    title: path ? documentTitle(path) : 'Opening…',
    isPersisted,
    status,
    recents,
    attach,
    open,
    newDocument,
    save: persist,
    saveAs,
    exportTldraw,
    rename,
    trash,
    reveal,
    takeDisk: reloadFromDisk,
    openWindow,
    newWindow,
    showDialog: setDialog,
    closeDialog: () => setDialog(null),
    notice,
    dismissNotice: () => setNotice(null),
  }), [
    attach,
    browserHome,
    isPersisted,
    newDocument,
    newWindow,
    notice,
    open,
    openWindow,
    path,
    persist,
    recents,
    exportTldraw,
    reloadFromDisk,
    rename,
    reveal,
    saveAs,
    status,
    trash,
  ])

  return (
    <LocalWorkspaceContext.Provider value={controller}>
      {path ? children : <WorkspaceLoading status={status} />}
      {dialog ? <WorkspaceDialog mode={dialog} /> : null}
      <WorkspaceAlert />
      <WorkspaceNotice />
    </LocalWorkspaceContext.Provider>
  )
}

function WorkspaceLoading({ status }: { status: WorkspaceStatus }) {
  const invalidUrl = status.kind === 'invalid-url'
  const failed = invalidUrl || status.kind === 'error'
  return (
    <main className="systemsketch-workspace-loading">
      <div className="systemsketch-workspace-loading__mark">S</div>
      <strong data-testid={invalidUrl ? 'workspace-invalid-board-url' : undefined}>
        {invalidUrl ? 'Board link is invalid' : failed ? 'Could not open the local workspace' : 'Opening workspace…'}
      </strong>
      {failed ? <p>{status.message}</p> : null}
    </main>
  )
}

function WorkspaceAlert() {
  const workspace = useLocalWorkspace()
  const { status } = workspace
  if (
    status.kind !== 'conflict'
    && status.kind !== 'missing'
    && status.kind !== 'future'
    && status.kind !== 'quarantined'
    && status.kind !== 'error'
  ) return null
  return (
    <aside
      className={`systemsketch-workspace-alert is-${status.kind}`}
      role="alert"
      data-testid={
        status.kind === 'quarantined'
          ? 'workspace-quarantine'
          : status.kind === 'future' ? 'workspace-future-format' : undefined
      }
    >
      <div>
        <strong>
          {status.kind === 'conflict'
            ? 'This file changed somewhere else'
            : status.kind === 'missing'
              ? 'This file was moved or deleted'
              : status.kind === 'future'
                ? 'A newer-format original is protected'
                : status.kind === 'quarantined'
                  ? 'This file is open read-only for safety'
                : 'The file could not be saved'}
        </strong>
        <span>
          {status.kind === 'future'
            ? `${status.message} Create an editable current-format copy; the original remains byte-for-byte untouched and newer-only metadata may be omitted.`
            : status.kind === 'quarantined'
            ? `${status.message}. The original file has not been changed.`
            : status.kind === 'error' ? status.message : workspace.path}
        </span>
      </div>
      <div className="systemsketch-workspace-alert__actions">
        {status.kind === 'conflict' ? (
          <>
            <button type="button" onClick={() => void workspace.takeDisk()}>Use disk version</button>
            <button type="button" className="primary" onClick={() => void workspace.save(true)}>Keep my version</button>
          </>
        ) : status.kind === 'future' ? (
          <>
            <button type="button" onClick={() => workspace.showDialog('open')}>Open another…</button>
            <button type="button" className="primary" onClick={() => workspace.showDialog('saveAs')}>
              Create editable copy…
            </button>
          </>
        ) : status.kind === 'quarantined' ? (
          <>
            <button type="button" onClick={() => workspace.showDialog('open')}>Open another…</button>
            <button type="button" className="primary" onClick={() => workspace.showDialog('saveAs')}>Save recovery as…</button>
          </>
        ) : (
          <button type="button" onClick={() => workspace.showDialog('saveAs')}>Save As…</button>
        )}
      </div>
    </aside>
  )
}

function WorkspaceNotice() {
  const workspace = useLocalWorkspace()
  if (!workspace.notice) return null
  return (
    <aside className="systemsketch-workspace-notice" role="status" data-testid="workspace-notice">
      <span>{workspace.notice}</span>
      <button type="button" aria-label="Dismiss" onClick={workspace.dismissNotice}>×</button>
    </aside>
  )
}

export function SystemSketchMainMenu() {
  const workspace = useLocalWorkspace()
  const { addDialog } = useDialogs()
  const confirm = useConfirm()

  /** The ask, in the app's own dialog rather than the browser's. */
  const requestTrash = async () => {
    const confirmed = await confirm({
      title: `Move “${workspace.title}” to Trash?`,
      body: 'The board leaves this folder and a new untitled board opens in its place. Your file manager can restore it from Trash.',
      confirmLabel: 'Move to Trash',
    })
    if (confirmed) await workspace.trash()
  }
  const statusLabel = workspace.status.kind === 'clean'
    ? 'Saved'
    : workspace.status.kind === 'saving'
      ? 'Saving'
      : workspace.status.kind === 'dirty'
        ? 'Unsaved'
        : workspace.status.kind === 'conflict'
          ? 'Conflict'
          : workspace.status.kind === 'missing'
            ? 'Missing'
            : workspace.status.kind === 'quarantined'
              ? 'Read-only recovery'
            : workspace.status.kind === 'future'
              ? 'Newer format · protected'
            : workspace.status.kind === 'error'
              ? 'Error'
              : 'Opening'
  return (
    <div className="systemsketch-file-identity">
      <DefaultMainMenu>
        <>
          <TldrawUiMenuGroup id="systemsketch-file">
            <TldrawUiMenuSubmenu id="file" label="File">
              <TldrawUiMenuGroup id="file-new-open">
                <TldrawUiMenuItem id="new-document" label="New" kbd="cmd+n" onSelect={() => void workspace.newDocument()} />
                <TldrawUiMenuItem id="new-window" label="New window" kbd="cmd+shift+n" onSelect={() => void workspace.newWindow()} />
                <TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={() => workspace.showDialog('open')} />
                <TldrawUiMenuSubmenu id="open-recent" label="Open recent" disabled={!workspace.recents.length}>
                  <TldrawUiMenuGroup id="recent-documents">
                    {workspace.recents.map((path) => (
                      <TldrawUiMenuItem
                        id={`recent-${path}`}
                        key={path}
                        label={documentTitle(path)}
                        onSelect={() => void workspace.open(path)}
                      />
                    ))}
                  </TldrawUiMenuGroup>
                </TldrawUiMenuSubmenu>
              </TldrawUiMenuGroup>
              <TldrawUiMenuGroup id="file-save">
                <TldrawUiMenuItem id="save-document" label="Save" kbd="cmd+s" disabled={workspace.status.kind === 'quarantined' || workspace.status.kind === 'future'} onSelect={() => void workspace.save()} />
                <TldrawUiMenuItem id="save-as-document" label="Save As…" kbd="cmd+shift+s" onSelect={() => workspace.showDialog('saveAs')} />
                <TldrawUiMenuItem
                  id="export-tldraw"
                  label="Export to tldraw…"
                  onSelect={() => workspace.showDialog('exportTldraw')}
                />
                <TldrawUiMenuItem id="rename-document" label="Rename…" disabled={workspace.status.kind === 'quarantined' || workspace.status.kind === 'future'} onSelect={() => workspace.showDialog('rename')} />
              </TldrawUiMenuGroup>
              <TldrawUiMenuGroup id="file-location">
                <TldrawUiMenuItem id="reveal-document" label="Show in Files" onSelect={() => void workspace.reveal()} />
                <TldrawUiMenuItem
                  id="trash-document"
                  label="Move to Trash…"
                  disabled={!workspace.isPersisted}
                  onSelect={() => void requestTrash()}
                />
              </TldrawUiMenuGroup>
            </TldrawUiMenuSubmenu>
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="systemsketch-settings">
            <TldrawUiMenuItem
              id="settings"
              label="Settings"
              iconLeft={<SettingsGearIcon />}
              onSelect={() => {
                addDialog({ id: 'systemsketch-settings', component: SystemSketchSettingsDialog })
              }}
            />
          </TldrawUiMenuGroup>
          <DefaultMainMenuContent />
        </>
      </DefaultMainMenu>
      <TldrawUiButton
        type="low"
        className="systemsketch-file-title"
        aria-label={`${workspace.title} ${statusLabel}`}
        title={`${workspace.path ?? ''} · ${statusLabel}`}
        onClick={() => workspace.showDialog(
          workspace.status.kind === 'quarantined' || workspace.status.kind === 'future'
            ? 'saveAs'
            : 'rename',
        )}
      >
        <span>{workspace.title}</span>
        <i data-state={workspace.status.kind} aria-label={statusLabel} />
      </TldrawUiButton>
    </div>
  )
}

function relativeDay(mtime: number): string {
  const when = new Date(mtime * 1000)
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000)
  if (days <= 0) return when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return when.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * The app's own file browser.
 *
 * This used to be the fallback behind a `zenity` subprocess; it is now the only
 * chooser, so opening a board never depends on a second GTK application being
 * alive. It reads the same digest-fenced workspace API the canvas saves through.
 */
function WorkspaceDialog({ mode }: { mode: Exclude<WorkspaceDialogMode, null> }) {
  const workspace = useLocalWorkspace()
  const [listing, setListing] = useState<WorkspaceListing | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const recoveryMode = useRef(workspace.status.kind === 'quarantined').current
  const compatibilityMode = useRef(workspace.status.kind === 'future').current
  const [name, setName] = useState(() => (
    recoveryMode
      ? `${workspace.title} recovery`
      : compatibilityMode ? `${workspace.title} compatible copy` : workspace.title
  ))
  const [error, setError] = useState<string | null>(null)
  const [replacePath, setReplacePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const crumbsRef = useRef<HTMLElement | null>(null)
  const isRename = mode === 'rename'
  const isExport = mode === 'exportTldraw'
  // Rename never changes a document's type, so it shows the suffix the file
  // already has. An export always writes `.tldr` — that is the whole point of
  // it. Everything else is making a new file, which is `.systemsketch`.
  const suffix = isExport
    ? TLDRAW_SUFFIX
    : (isRename && workspace.path ? documentSuffix(workspace.path) : null) ?? SYSTEMSKETCH_SUFFIX

  const load = useCallback(async (directory?: string) => {
    setBusy(true)
    setError(null)
    try {
      const next = await listWorkspace(directory)
      setListing(next)
      setSelectedPath(null)
      setQuery('')
      setReplacePath(null)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (isRename) return
    void load(workspace.browserDirectory ?? undefined)
  }, [isRename, load, workspace.browserDirectory])

  const rows = useMemo(() => browserRows(listing, query), [listing, query])
  const selectedRow = rows.find((row) => row.path === selectedPath) ?? null
  const trail = listing ? breadcrumbTrail(listing.dir, listing.root) : []

  // Enter means something the moment the list appears, without a click first.
  useEffect(() => {
    if (isRename) return
    setSelectedPath((current) => resolveBrowserSelection(rows, current))
  }, [isRename, rows])

  const activate = useCallback(async (row: BrowserRow) => {
    if (row.kind === 'folder') {
      await load(row.path)
      return
    }
    if (mode === 'open') await workspace.open(row.path)
    else {
      setName(row.title)
      setReplacePath(null)
    }
  }, [load, mode, workspace])

  const createFolder = useCallback(async () => {
    if (!listing) return
    setBusy(true)
    setError(null)
    try {
      const created = await createWorkspaceDirectory(listing.dir, folderName)
      setCreatingFolder(false)
      setFolderName('')
      await load(created.path)
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }, [folderName, listing, load])

  const submit = useCallback(async (force = false) => {
    setBusy(true)
    setError(null)
    let attemptedPath: string | null = null
    try {
      if (mode === 'open') {
        if (!selectedRow) throw new Error('Choose a document to open.')
        await activate(selectedRow)
        if (selectedRow.kind === 'folder') setBusy(false)
      } else if (mode === 'saveAs' || mode === 'exportTldraw') {
        const nextPath = force && replacePath
          ? replacePath
          : listing ? documentPathFor(listing.dir, name, suffix) : null
        if (!nextPath) throw new Error('Enter a file name.')
        attemptedPath = nextPath
        if (mode === 'exportTldraw') {
          await workspace.exportTldraw(nextPath)
          workspace.closeDialog()
        } else {
          await workspace.saveAs(nextPath, force)
        }
      } else {
        const nextPath = workspace.path ? renamedDocumentPath(workspace.path, name) : null
        if (!nextPath) throw new Error('Enter a file name.')
        await workspace.rename(nextPath)
        workspace.closeDialog()
      }
    } catch (cause) {
      if (mode === 'saveAs' && !force && attemptedPath && cause instanceof WorkspaceConflict) {
        setReplacePath(attemptedPath)
        setError(`“${documentTitle(attemptedPath)}” already exists. Replace it with this document?`)
      } else {
        setReplacePath(null)
        setError(errorMessage(cause))
      }
      setBusy(false)
    }
  }, [activate, listing, mode, name, replacePath, selectedRow, suffix, workspace])

  const openInNewWindow = useCallback(async () => {
    if (!selectedRow || selectedRow.kind !== 'document') return
    await workspace.openWindow(selectedRow.path)
    workspace.closeDialog()
  }, [selectedRow, workspace])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        workspace.closeDialog()
        return
      }
      if (isRename) return
      const target = event.target
      const typing = target instanceof HTMLElement
        && (target.matches('input, textarea') || target.isContentEditable)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = moveBrowserSelection(rows, selectedPath, event.key === 'ArrowDown' ? 1 : -1)
        setSelectedPath(next)
        listRef.current
          ?.querySelector(`[data-path="${CSS.escape(next ?? '')}"]`)
          ?.scrollIntoView({ block: 'nearest' })
        return
      }
      if (event.key === 'Enter' && !busy && (!typing || mode === 'open')) {
        event.preventDefault()
        void submit()
        return
      }
      if (event.key === 'Backspace' && !typing && listing?.parent) {
        event.preventDefault()
        void load(listing.parent)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, isRename, listing, load, rows, selectedPath, submit, workspace])

  // A deep path keeps its tail — the folder you are in — in view.
  useEffect(() => {
    const crumbs = crumbsRef.current
    if (crumbs) crumbs.scrollLeft = crumbs.scrollWidth
  }, [listing])

  const places = listing
    ? [
        { label: 'SystemSketch', path: parentDirectory(listing.defaultDocument) },
        { label: 'Home', path: listing.root },
      ].filter((place, index, all) => all.findIndex((other) => other.path === place.path) === index)
    : []

  return (
    <div className="systemsketch-workspace-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) workspace.closeDialog()
    }}>
      <section
        className="systemsketch-workspace-dialog"
        data-testid="workspace-dialog"
        data-mode={mode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-dialog-title"
      >
        <header>
          <div>
            <span>Local workspace</span>
            <h2 id="workspace-dialog-title">
              {mode === 'open'
                ? 'Open a document'
                : mode === 'saveAs'
                  ? 'Save a copy'
                  : mode === 'exportTldraw' ? 'Export to tldraw' : 'Rename document'}
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={workspace.closeDialog}>×</button>
        </header>

        {isRename ? (
          <div className="systemsketch-workspace-dialog__rename">
            <label htmlFor="workspace-document-name">Name</label>
            <div className="systemsketch-workspace-name-field">
              <input
                id="workspace-document-name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit()
                }}
              />
              <span>{suffix}</span>
            </div>
            <p>{workspace.path ? parentDirectory(workspace.path) : ''}</p>
          </div>
        ) : (
          <div className="systemsketch-workspace-browser">
            <aside>
              <strong>Places</strong>
              {places.map((place) => (
                <button
                  key={place.path}
                  type="button"
                  title={place.path}
                  data-testid="workspace-place"
                  className={listing?.dir === place.path ? 'is-current' : ''}
                  onClick={() => void load(place.path)}
                >
                  <span>{place.label}</span>
                  <small>{place.path}</small>
                </button>
              ))}
              <strong>Recent</strong>
              {workspace.recents.length ? workspace.recents.map((path) => (
                <button key={path} type="button" title={path} data-testid="workspace-recent" onClick={() => {
                  if (mode === 'open') void workspace.open(path)
                  else void load(parentDirectory(path))
                }}>
                  <span>{documentTitle(path)}</span>
                  <small>{parentDirectory(path)}</small>
                </button>
              )) : <p>No recent files yet.</p>}
            </aside>
            <div className="systemsketch-workspace-browser__files">
              <div className="systemsketch-workspace-pathbar">
                <button
                  type="button"
                  disabled={!listing?.parent || busy}
                  aria-label="Parent folder"
                  data-testid="workspace-parent"
                  onClick={() => listing?.parent && void load(listing.parent)}
                >←</button>
                <nav className="systemsketch-workspace-crumbs" ref={crumbsRef} aria-label="Folder path">
                  {trail.map((segment, index) => (
                    <span key={segment.path}>
                      {index > 0 ? <i aria-hidden="true">/</i> : null}
                      <button
                        type="button"
                        title={segment.path}
                        disabled={busy || segment.path === listing?.dir}
                        onClick={() => void load(segment.path)}
                      >{segment.label}</button>
                    </span>
                  ))}
                </nav>
                <button
                  type="button"
                  className="systemsketch-workspace-new-folder-button"
                  data-testid="workspace-new-folder"
                  disabled={busy || !listing?.exists}
                  onClick={() => {
                    setCreatingFolder(true)
                    setFolderName('')
                    setError(null)
                  }}
                >+ Folder</button>
                <input
                  className="systemsketch-workspace-search"
                  data-testid="workspace-filter"
                  type="search"
                  autoFocus={mode === 'open'}
                  placeholder="Filter"
                  aria-label="Filter this folder"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {creatingFolder ? (
                <form className="systemsketch-workspace-new-folder" onSubmit={(event) => {
                  event.preventDefault()
                  void createFolder()
                }}>
                  <label htmlFor="workspace-new-folder-name">New folder</label>
                  <input
                    id="workspace-new-folder-name"
                    data-testid="workspace-new-folder-name"
                    autoFocus
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        // Submit exactly once, and do not also let the dialog's
                        // window-level Enter shortcut open the selected row.
                        event.preventDefault()
                        event.stopPropagation()
                        void createFolder()
                        return
                      }
                      if (event.key !== 'Escape') return
                      event.preventDefault()
                      event.stopPropagation()
                      setCreatingFolder(false)
                      setFolderName('')
                      setError(null)
                    }}
                  />
                  <button type="submit" disabled={busy || !folderName.trim()}>Create</button>
                  <button type="button" onClick={() => {
                    setCreatingFolder(false)
                    setFolderName('')
                    setError(null)
                  }}>Cancel</button>
                </form>
              ) : null}
              <div
                className="systemsketch-workspace-file-list"
                ref={listRef}
                role="listbox"
                aria-label="Local files"
              >
                {rows.map((row) => (
                  <button
                    key={row.path}
                    type="button"
                    data-testid="workspace-row"
                    data-kind={row.kind}
                    data-path={row.path}
                    className={`${row.kind === 'folder' ? 'folder' : ''}${selectedPath === row.path ? ' selected' : ''}`}
                    role="option"
                    aria-selected={selectedPath === row.path}
                    onClick={() => {
                      setSelectedPath(row.path)
                      if (row.kind === 'folder') void load(row.path)
                      else if (mode === 'saveAs' || mode === 'exportTldraw') {
                        setName(row.title)
                        setReplacePath(null)
                        setError(null)
                      }
                    }}
                    onDoubleClick={() => void activate(row)}
                  >
                    <span aria-hidden="true">{row.kind === 'folder' ? '▰' : '◇'}</span>
                    <b>{row.title}</b>
                    <small data-kind={row.encoding ?? 'folder'}>
                      {row.kind === 'folder'
                        ? 'Folder'
                        : `${row.encoding === 'tldraw' ? 'tldraw' : 'sketch'} · ${relativeDay(row.mtime ?? 0)}`}
                    </small>
                  </button>
                ))}
                {!busy && listing && !rows.length ? (
                  <p className="systemsketch-workspace-file-list__empty">
                    {query
                      ? `Nothing here matches “${query}”.`
                      : 'This folder has no SystemSketch documents yet.'}
                  </p>
                ) : null}
              </div>
              {mode === 'saveAs' || mode === 'exportTldraw' ? (
                <div className="systemsketch-workspace-name-field is-save-as">
                  <input autoFocus value={name} aria-label="File name" onChange={(event) => {
                    setName(event.target.value)
                    setReplacePath(null)
                    setError(null)
                  }} onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit()
                  }} />
                  <span>{suffix}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {error ? <p className="systemsketch-workspace-dialog__error" role="alert">{error}</p> : null}
        <footer>
          <button
            type="button"
            data-testid={replacePath ? 'workspace-replace-cancel' : undefined}
            onClick={workspace.closeDialog}
          >Cancel</button>
          <div className="systemsketch-workspace-dialog__confirm">
            {mode === 'open' ? (
              <button
                type="button"
                data-testid="workspace-open-in-new-window"
                disabled={busy || selectedRow?.kind !== 'document'}
                onClick={() => void openInNewWindow()}
              >
                Open in new window
              </button>
            ) : null}
            <button
              type="button"
              className={`primary${replacePath ? ' is-danger' : ''}`}
              data-testid={replacePath ? 'workspace-replace' : 'workspace-confirm'}
              disabled={busy || (mode === 'open' && !selectedRow)}
              onClick={() => void submit(Boolean(replacePath))}
            >
              {busy
                ? 'Working…'
                : mode === 'open'
                  ? selectedRow?.kind === 'folder' ? 'Open folder' : 'Open'
                  : replacePath
                    ? 'Replace'
                    : mode === 'saveAs' ? 'Save' : mode === 'exportTldraw' ? 'Export' : 'Rename'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
