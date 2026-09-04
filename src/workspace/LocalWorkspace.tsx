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
import { Dialog } from 'radix-ui'
import {
  WorkspaceConflict,
  isRetryableWorkspaceFailure,
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
  type WorkspaceRequestOptions,
} from './workspaceClient'
import {
  SYSTEMSKETCH_SUFFIX,
  TLDRAW_SUFFIX,
  breadcrumbTrail,
  browserRows,
  autosaveSchedule,
  autosaveRetryDelay,
  canApplyExternalReload,
  claimUntitledPath,
  documentHref,
  documentPathFor,
  documentSuffix,
  documentTitle,
  encodeDocumentForPath,
  exportedTldrawPath,
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
import { exportPortableTldraw } from '../export/portableTldraw'
import './local-workspace.css'
import { hydrateCustomColors } from '../appearance/customColors'
import { SettingsGearIcon, SystemSketchSettingsDialog } from '../settings/InterfaceSettings'
import { importLegacyPyblocksSystemSketch } from '../import/legacyPyblocksSystemSketch'
import { emitRecorderDiagnostic } from '../recorder/recorderEvents'
import { useConfirm } from '../chrome/ConfirmDialog'
import { consolidateDocumentToSinglePage } from '../singlePageDocument'
import { settleConnectionParents } from '../blocks/connections/ConnectionBindingUtil'
import { useThemePortalContainer } from '../theme/ThemePortal'
import { SystemSketchUiInput } from '../chrome/SystemSketchUiInput'

const SAVE_DEBOUNCE_MS = 600
const MAX_AUTOSAVE_DELAY_MS = 30_000
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

type WorkspaceDialogMode = 'open' | 'saveAs' | 'exportTldraw' | 'portableCopy' | 'rename' | null

interface WorkspaceSaveAttempt {
  path: string
  source: string
  baseDigest: string | null
  changeEpoch: number
}

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
  exportTldraw(destination: string, force?: boolean): Promise<void>
  /**
   * Creates and opens a separate stock `.tldr` for a newer protected board.
   * The source is never rewritten or downgraded in place.
   */
  makePortableCopy(destination: string, force?: boolean): Promise<void>
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
  runAction(action: () => Promise<unknown>): void
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function currentDialogLauncher(): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  if (active?.closest('[role="menu"]')) {
    return document.querySelector<HTMLElement>('[data-testid="main-menu.button"]')
  }
  if (active && active !== document.body) return active
  return document.querySelector<HTMLElement>('[data-testid="main-menu.button"]')
}

function invalidBoardUrlMessage(query: URLSearchParams, explicitPath: string | null): string | null {
  if (explicitPath) return null
  if (query.has('board')) return 'The board link has no file path. Add a path after “?board=”.'
  if ([...query.keys()].some((key) => key.startsWith('board='))) {
    return 'Use ?board=/path/to/file.systemsketch; leave = unescaped.'
  }
  return null
}

function fingerprint(document: { mtime?: number; size?: number; digest?: string }): DocumentFingerprint | null {
  return document.mtime === undefined || document.size === undefined
    ? null
    : { mtime: document.mtime, size: document.size, digest: document.digest ?? null }
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
  // A cable's parent is its container, and a region drawn over a page-level
  // cable swallows every click on it, so re-settle what the file brought in.
  // After the page merge, not before: this reads the current page, and a
  // legacy multi-page import has not finished becoming one page until here.
  settleConnectionParents(editor)
  return { ...inspected, singlePageMigration }
}

async function firstReadableRecent(paths: string[], options: WorkspaceRequestOptions = {}): Promise<{
  path: string
  document: Awaited<ReturnType<typeof readWorkspaceDocument>>
} | null> {
  for (const path of paths) {
    try {
      const document = await readWorkspaceDocument(path, options)
      if (document.source !== null) return { path, document }
      forgetDocumentPath(path)
    } catch (cause) {
      if (options.signal?.aborted) throw cause
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
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)

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
  // Once a digest conflict is known, automatic saves stay paused until the
  // person explicitly keeps their version or accepts the disk revision.
  const conflictRef = useRef(false)
  const queuedSourceRef = useRef<Promise<string> | null>(null)
  const retrySaveRef = useRef<WorkspaceSaveAttempt | null>(null)
  // Counts document changes, so a save knows whether more arrived while it ran.
  const changeEpochRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosavePendingSinceRef = useRef<number | null>(null)
  const autosaveRetryCountRef = useRef(0)
  const autosaveStopRef = useRef<(() => void) | null>(null)
  const startAutosaveRef = useRef<() => void>(() => {})
  const persistRef = useRef<(force?: boolean) => Promise<void>>(async () => {})
  const finalFlushRef = useRef<() => void>(() => {})
  const statusRef = useRef(status)
  const dialogLauncherRef = useRef<HTMLElement | null>(null)
  statusRef.current = status

  const updateRecents = useCallback((next: string[]) => setRecents(next), [])
  // WHY: tldraw menu callbacks are fire-and-forget. Converting both immediate
  // throws and rejected file-operation promises here prevents a silent action.
  const runAction = useCallback((action: () => Promise<unknown>) => {
    try {
      void action().catch((cause) => setNotice(errorMessage(cause)))
    } catch (cause) {
      setNotice(errorMessage(cause))
    }
  }, [])
  const showDialog = useCallback((mode: Exclude<WorkspaceDialogMode, null>) => {
    dialogLauncherRef.current = currentDialogLauncher()
    setDialog(mode)
  }, [])
  const closeDialog = useCallback(() => {
    const launcher = dialogLauncherRef.current
    dialogLauncherRef.current = null
    setDialog(null)
    window.requestAnimationFrame(() => {
      const target = launcher?.isConnected
        ? launcher
        : document.querySelector<HTMLElement>('[data-testid="main-menu.button"]')
      target?.focus()
    })
  }, [])
  const retryBootstrap = useCallback(() => {
    setStatus({ kind: 'loading' })
    setBootstrapAttempt((current) => current + 1)
  }, [])
  const enterConflict = useCallback(() => {
    conflictRef.current = true
    retrySaveRef.current = null
    autosaveRetryCountRef.current = 0
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    autosavePendingSinceRef.current = null
    setStatus({ kind: 'conflict' })
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      try {
        const query = new URLSearchParams(window.location.search)
        const explicitPath = query.get('board')?.trim() || null
        const invalidBoardUrl = invalidBoardUrlMessage(query, explicitPath)
        if (invalidBoardUrl) {
          if (!cancelled) setStatus({ kind: 'invalid-url', message: invalidBoardUrl })
          return
        }
        const options = { signal: controller.signal }
        const listing = await listWorkspace(undefined, options)
        const isIndependentDevelopmentBoard = query.has('previewClone') || query.has('preset')
        let selectedPath: string
        let document: Awaited<ReturnType<typeof readWorkspaceDocument>>

        if (explicitPath) {
          selectedPath = explicitPath
          document = await readWorkspaceDocument(selectedPath, options)
        } else if (!isIndependentDevelopmentBoard) {
          const recent = await firstReadableRecent(readRecentDocumentPaths(), options)
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
            document = await readWorkspaceDocument(selectedPath, options)
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
      controller.abort()
    }
  }, [bootstrapAttempt, updateRecents])

  const scheduleSave = useCallback((
    delayMs = SAVE_DEBOUNCE_MS,
    retryAttempt?: number,
  ) => {
    if (conflictRef.current) return
    let effectiveDelayMs = delayMs
    const isExactReplay = retryAttempt !== undefined || retrySaveRef.current !== null
    if (!isExactReplay) {
      autosaveRetryCountRef.current = 0
      // WHY: draw.io 31.4.2 bounds a continuously postponed local save at
      // 30 seconds. A long drag therefore cannot keep the only new revision in
      // memory forever; nearby edits still coalesce behind the 600 ms debounce.
      // — see docs/peps/0001-workspace-persistence-alignment.md
      const schedule = autosaveSchedule(
        performance.now(),
        autosavePendingSinceRef.current,
        delayMs,
        MAX_AUTOSAVE_DELAY_MS,
      )
      autosavePendingSinceRef.current = schedule.pendingSince
      effectiveDelayMs = schedule.delayMs
    } else {
      // An exact replay remains its own recovery attempt even if a newer edit
      // accelerates the timer. Do not reset its bounded attempt count or mix
      // its backoff with the edit-burst deadline.
      autosavePendingSinceRef.current = null
    }
    const rescheduled = saveTimerRef.current !== null
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistRef.current()
    }, effectiveDelayMs)
    if (!rescheduled) {
      emitRecorderDiagnostic({
        lane: 'workspace', name: 'autosave-scheduled',
        summary: isExactReplay ? 'autosave retry scheduled' : 'autosave scheduled',
        detail: {
          path: pathRef.current,
          delayMs: effectiveDelayMs,
          requestedDelayMs: delayMs,
          retryAttempt,
          changeEpoch: changeEpochRef.current,
        },
      })
    }
  }, [])

  const resumeDirtyAutosave = useCallback(() => {
    if (!dirtyRef.current) return
    // A rename/export/Save As also occupies the single filesystem lane. If a
    // canvas edit arrived while that request was active, the timer may already
    // have observed `savingRef`; hand the still-dirty revision a fresh turn.
    setStatus((current) => current.kind === 'conflict' ? current : { kind: 'dirty' })
    scheduleSave()
  }, [scheduleSave])

  const scheduleSinglePageMigrationSave = useCallback(() => {
    dirtyRef.current = true
    changeEpochRef.current += 1
    queuedSourceRef.current = null
    retrySaveRef.current = null
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
    autosavePendingSinceRef.current = null
    autosaveStopRef.current?.()
    autosaveStopRef.current = null
    protectedRef.current = true
    conflictRef.current = false
    dirtyRef.current = false
    autosaveRetryCountRef.current = 0
    queuedSourceRef.current = null
    retrySaveRef.current = null
    editor.updateInstanceState({ isReadonly: true })
    setStatus(protection)
  }, [])

  const persist = useCallback(async (force = false) => {
    const boardPath = pathRef.current
    const editor = editorRef.current
    const queuedSource = queuedSourceRef.current
    const pendingRetry = !force && retrySaveRef.current?.path === boardPath
      ? retrySaveRef.current
      : null
    if (
      boardPath === null
      || (editor === null && queuedSource === null && pendingRetry === null)
    ) return
    if (protectedRef.current) {
      setNotice('This file is protected. Create a separate editable copy to keep the original untouched.')
      return
    }
    if (savingRef.current) {
      // The active save's `finally` schedules any newer dirty revision. Avoid
      // a second timer here, especially after the 30-second ceiling expires.
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    autosavePendingSinceRef.current = null
    savingRef.current = true
    setStatus({ kind: 'saving' })
    if (force) retrySaveRef.current = null
    const changeEpoch = pendingRetry?.changeEpoch ?? changeEpochRef.current
    const baseDigest = pendingRetry?.baseDigest ?? digestRef.current
    const saveStarted = performance.now()
    emitRecorderDiagnostic({
      lane: 'workspace', name: 'autosave-start', summary: force ? 'forced save started' : 'autosave started',
      detail: { path: boardPath, force, baseDigest, changeEpoch, replayingAttempt: pendingRetry !== null },
    })
    const sourcePromise = pendingRetry
      ? null
      : queuedSource ?? serializeTldrawJson(editor!)
    let attempt: WorkspaceSaveAttempt | null = pendingRetry
    let savedSuccessfully = false
    let retry: { delayMs: number; attempt: number } | null = null
    try {
      const source = pendingRetry?.source
        ?? encodeDocumentForPath(boardPath, await sourcePromise!)
      attempt ??= { path: boardPath, source, baseDigest, changeEpoch }
      const saved = await writeWorkspaceDocument({
        path: boardPath,
        source,
        baseDigest: attempt.baseDigest,
        force,
      })
      retrySaveRef.current = null
      digestRef.current = saved.digest
      fingerprintRef.current = { mtime: saved.mtime, size: saved.size, digest: saved.digest }
      sourceRef.current = source
      savedSuccessfully = true
      conflictRef.current = false
      autosaveRetryCountRef.current = 0
      setIsPersisted(true)
      updateRecents(rememberDocumentPath(boardPath))
      if (
        (sourcePromise !== null && queuedSourceRef.current === sourcePromise)
        || changeEpochRef.current === changeEpoch
      ) queuedSourceRef.current = null
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
      const retryable = isRetryableWorkspaceFailure(cause)
      const delayMs = retryable
        ? autosaveRetryDelay(autosaveRetryCountRef.current, { force })
        : null
      if (cause instanceof WorkspaceConflict) {
        enterConflict()
      } else if (retryable && !force && attempt !== null) {
        // WHY: retry the exact failed bytes and base revision first. If request
        // B committed but its HTTP response was lost, sending newer edit C
        // against old base A would manufacture a conflict; acknowledging B's
        // idempotent replay advances the digest, then C gets its own save.
        // Keep B even after automatic backoff is exhausted, so a later manual
        // save or edit cannot accidentally replace it with unsafe C/A.
        retrySaveRef.current = attempt
        if (delayMs !== null) {
          autosaveRetryCountRef.current += 1
          retry = { delayMs, attempt: autosaveRetryCountRef.current }
        }
      } else {
        retrySaveRef.current = null
      }
      if (!(cause instanceof WorkspaceConflict)) {
        setStatus({ kind: 'error', message: errorMessage(cause) })
      }
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
      else if (dirtyRef.current && retry) scheduleSave(retry.delayMs, retry.attempt)
    }
  }, [enterConflict, scheduleSave, updateRecents])
  persistRef.current = persist

  const finalFlush = useCallback(() => {
    const boardPath = pathRef.current
    if (protectedRef.current || !dirtyRef.current || boardPath === null) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    autosavePendingSinceRef.current = null

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
    const saveEpoch = changeEpochRef.current
    const wasProtected = protectedRef.current
    setStatus({ kind: 'saving' })
    savingRef.current = true
    try {
      const source = encodeDocumentForPath(nextPath, await serializeTldrawJson(editor))
      const saved = await writeWorkspaceDocument({ path: nextPath, source, baseDigest: null, force })
      updateRecents(rememberDocumentPath(nextPath))
      // WHY: draw.io's Make Copy changes the live file identity to the copy,
      // but its shadow flag still protects an edit made while that write ran.
      // Switch this mounted editor to the accepted digest without reloading;
      // a later epoch stays dirty and autosaves against the new path.
      const hasNewerEdits = changeEpochRef.current !== saveEpoch
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      autosavePendingSinceRef.current = null
      pathRef.current = nextPath
      sourceRef.current = source
      digestRef.current = saved.digest
      fingerprintRef.current = { mtime: saved.mtime, size: saved.size, digest: saved.digest }
      conflictRef.current = false
      retrySaveRef.current = null
      dirtyRef.current = hasNewerEdits
      if (!hasNewerEdits) queuedSourceRef.current = null
      setPath(nextPath)
      setIsPersisted(true)
      setStatus(hasNewerEdits ? { kind: 'dirty' } : { kind: 'clean', at: Date.now() })
      if (wasProtected) {
        // Recovery/future-format copies reload once so the new, safe document
        // leaves read-only quarantine through the normal bootstrap path.
        window.location.assign(documentHref(nextPath))
      } else {
        window.history.replaceState(null, '', documentHref(nextPath))
        closeDialog()
      }
    } catch (cause) {
      setStatus(previousStatus)
      throw cause
    } finally {
      savingRef.current = false
      resumeDirtyAutosave()
    }
  }, [closeDialog, resumeDirtyAutosave, updateRecents])

  /**
   * Write a stock-readable `.tldr` from an isolated cloned editor.
   *
   * WHY: export must not mutate the live board, its undo history, dirty state,
   * autosave, collaboration, or host bridge. A normal export is create-only;
   * `force` is reachable only after the dialog's explicit Replace confirmation.
   */
  const exportTldraw = useCallback(async (destination: string, force = false) => {
    const editor = editorRef.current
    if (!editor) throw new Error('The document is not ready to export yet.')
    await waitForSave()

    savingRef.current = true
    setStatus({ kind: 'saving' })
    try {
      const source = await exportPortableTldraw(editor)
      await writeWorkspaceDocument({
        path: exportedTldrawPath(destination),
        source,
        baseDigest: null,
        force,
      })
    } finally {
      savingRef.current = false
      if (dirtyRef.current) resumeDirtyAutosave()
      else {
        setStatus({ kind: 'clean', at: Date.now() })
      }
    }
  }, [resumeDirtyAutosave, waitForSave])

  /**
   * The deliberate reverse-compatibility route. We cannot know which custom
   * shape support an older app has, so the conservative target is stock
   * tldraw: every feature this build can read becomes editable primitives.
   *
   * Unlike File → Export, this action opens the duplicate afterwards. It is a
   * regression workflow, not merely a download, and the protected source is
   * left byte-for-byte as it was.
   */
  const makePortableCopy = useCallback(async (destination: string, force = false) => {
    const editor = editorRef.current
    if (!editor || savingRef.current) throw new Error('The document is not ready to make a compatible copy yet.')
    const previousStatus = statusRef.current
    const target = exportedTldrawPath(destination)
    savingRef.current = true
    setStatus({ kind: 'saving' })
    try {
      const source = await exportPortableTldraw(editor)
      await writeWorkspaceDocument({ path: target, source, baseDigest: null, force })
      updateRecents(rememberDocumentPath(target))
      window.location.assign(documentHref(target))
    } catch (cause) {
      setStatus(previousStatus)
      throw cause
    } finally {
      savingRef.current = false
    }
  }, [updateRecents])

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
      fingerprintRef.current = { mtime: renamed.mtime, size: renamed.size, digest: renamed.digest }
      setPath(nextPath)
      setIsPersisted(true)
      updateRecents(replaceRememberedDocumentPath(currentPath, nextPath))
      window.history.replaceState(null, '', documentHref(nextPath))
      conflictRef.current = false
      setStatus({ kind: 'clean', at: Date.now() })
    } catch (cause) {
      if (cause instanceof WorkspaceConflict && !cause.message.includes('already exists')) {
        enterConflict()
      } else {
        setStatus({ kind: 'clean', at: null })
      }
      throw cause
    } finally {
      savingRef.current = false
      resumeDirtyAutosave()
    }
  }, [enterConflict, resumeDirtyAutosave, saveAs, updateRecents, waitForSave])

  const reloadFromDisk = useCallback(async ({
    expectedDiskDigest = null,
    discardRequestedEdits = false,
    signal,
  }: {
    expectedDiskDigest?: string | null
    discardRequestedEdits?: boolean
    signal?: AbortSignal
  } = {}) => {
    const editor = editorRef.current
    const boardPath = pathRef.current
    if (!editor || !boardPath) return
    // WHY: the read below yields. Capture both local identities first so a slow
    // disk response cannot overwrite an edit or save that arrives meanwhile.
    const requestedChangeEpoch = changeEpochRef.current
    const requestedBaseDigest = digestRef.current
    if (dirtyRef.current && !discardRequestedEdits) {
      enterConflict()
      return
    }
    try {
      const document = await readWorkspaceDocument(boardPath, { signal })
      if (signal?.aborted) return
      const loadedDiskDigest = document.digest ?? null
      const canApply = editorRef.current === editor
        && pathRef.current === boardPath
        && !savingRef.current
        && canApplyExternalReload({
          requestedChangeEpoch,
          currentChangeEpoch: changeEpochRef.current,
          requestedBaseDigest,
          currentBaseDigest: digestRef.current,
          expectedDiskDigest,
          loadedDiskDigest,
          hasUnsavedEdits: dirtyRef.current,
          discardRequestedEdits,
        })
      if (!canApply) {
        if (
          dirtyRef.current
          && loadedDiskDigest !== null
          && loadedDiskDigest !== digestRef.current
        ) enterConflict()
        return
      }
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
      conflictRef.current = false
      editor.updateInstanceState({ isReadonly: false })
      startAutosaveRef.current()
      sourceRef.current = document.source
      digestRef.current = document.digest ?? null
      fingerprintRef.current = fingerprint(document)
      dirtyRef.current = false
      autosavePendingSinceRef.current = null
      queuedSourceRef.current = null
      retrySaveRef.current = null
      setIsPersisted(true)
      updateRecents(rememberDocumentPath(boardPath))
      setStatus({ kind: 'clean', at: Date.now() })
      if (inspected.singlePageMigration.changed) scheduleSinglePageMigrationSave()
    } catch (cause) {
      if (signal?.aborted) return
      setStatus({ kind: 'error', message: errorMessage(cause) })
    }
  }, [enterConflict, protectDocument, scheduleSinglePageMigrationSave, updateRecents])

  const takeDisk = useCallback(() => reloadFromDisk({ discardRequestedEdits: true }), [reloadFromDisk])

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
    // WHY: setInterval does not wait for its async callback. Keep the watcher
    // single-flight so a stalled stat/read cannot build an unbounded request queue.
    let polling = false
    let pollController: AbortController | null = null
    const poll = async () => {
      if (
        cancelled
        || polling
        || savingRef.current
        || retrySaveRef.current !== null
        || !editorRef.current
      ) return
      polling = true
      const controller = new AbortController()
      pollController = controller
      try {
        const disk = await statWorkspaceDocument(path, { signal: controller.signal })
        if (
          cancelled
          || savingRef.current
          || retrySaveRef.current !== null
          || !editorRef.current
          || pathRef.current !== path
        ) return
        // WHY: after an HTTP response is lost, the just-written disk bytes can
        // look external to this client. The queued exact replay is the safe
        // arbiter: it accepts only those intended bytes and digest-conflicts on
        // anything else. Polling must not manufacture a conflict first.
        const action = nextSyncAction({
          disk: disk.mtime === null || disk.size === undefined
            ? null
            : { mtime: disk.mtime, size: disk.size, digest: disk.digest ?? null },
          base: fingerprintRef.current,
          hasUnsavedEdits: dirtyRef.current,
        })
        if (action.kind === 'reload') {
          await reloadFromDisk({
            expectedDiskDigest: disk.digest ?? null,
            signal: controller.signal,
          })
        } else if (action.kind === 'conflict') enterConflict()
        else if (action.kind === 'missing') setStatus({ kind: 'missing' })
      } catch {
        // A transient failed poll should not interrupt drawing; the next poll retries.
      } finally {
        if (pollController === controller) pollController = null
        polling = false
      }
    }
    const timer = window.setInterval(() => { void poll() }, WATCH_INTERVAL_MS)
    return () => {
      cancelled = true
      pollController?.abort()
      window.clearInterval(timer)
    }
  }, [enterConflict, path, reloadFromDisk])

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
        if (event.shiftKey) showDialog('saveAs')
        else runAction(() => persistRef.current())
      } else if (key === 'o') {
        event.preventDefault()
        showDialog('open')
      } else if (key === 'n') {
        event.preventDefault()
        if (event.shiftKey) runAction(newWindow)
        else runAction(newDocument)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newDocument, newWindow, runAction, showDialog])

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
        autosavePendingSinceRef.current = null
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
    makePortableCopy,
    rename,
    trash,
    reveal,
    takeDisk,
    openWindow,
    newWindow,
    runAction,
    showDialog,
    closeDialog,
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
    makePortableCopy,
    runAction,
    takeDisk,
    rename,
    reveal,
    saveAs,
    showDialog,
    status,
    trash,
    closeDialog,
  ])

  return (
    <LocalWorkspaceContext.Provider value={controller}>
      {path ? children : <WorkspaceLoading status={status} onRetry={retryBootstrap} />}
      {dialog ? <WorkspaceDialog mode={dialog} /> : null}
      {path ? <WorkspaceAlert /> : null}
      <WorkspaceNotice />
    </LocalWorkspaceContext.Provider>
  )
}

function WorkspaceLoading({ status, onRetry }: { status: WorkspaceStatus; onRetry(): void }) {
  const invalidUrl = status.kind === 'invalid-url'
  const failed = invalidUrl || status.kind === 'error'
  return (
    <main className="systemsketch-workspace-loading">
      <div className="systemsketch-workspace-loading__mark">S</div>
      <strong data-testid={invalidUrl ? 'workspace-invalid-board-url' : undefined}>
        {invalidUrl ? 'Board link is invalid' : failed ? 'Could not open the local workspace' : 'Opening workspace…'}
      </strong>
      {failed ? <p>{status.message}</p> : null}
      {status.kind === 'error' ? (
        <button type="button" data-testid="workspace-retry-bootstrap" onClick={onRetry}>Try again</button>
      ) : null}
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
  // WHY: these states can lose work or strand a document, so they stay visible
  // beside named recovery actions instead of disappearing like a transient toast.
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
                ? 'This board is newer than this app'
                : status.kind === 'quarantined'
                  ? 'This file could not be opened safely'
                : 'The file could not be saved'}
        </strong>
        <span>
          {status.kind === 'future'
            ? `${status.message} It is visible read-only. A compatible copy creates and opens a separate stock .tldr made of editable primitives; the original remains byte-for-byte untouched.`
            : status.kind === 'quarantined'
            ? `${status.message}. The original file has not been changed. No board content was loaded, so there is nothing here to recover or make compatible.`
            : status.kind === 'error' ? status.message : workspace.path}
        </span>
      </div>
      <div className="systemsketch-workspace-alert__actions">
        {status.kind === 'conflict' ? (
          <>
            <button
              type="button"
              data-testid="workspace-conflict-use-disk"
              onClick={() => workspace.runAction(workspace.takeDisk)}
            >Use disk version</button>
            {/* WHY: draw.io puts Make Copy beside its destructive conflict
                choices. Surface Save As here so preserving both revisions is
                the obvious path, not a feature the person has to remember. */}
            <button
              type="button"
              className="primary"
              data-testid="workspace-conflict-make-copy"
              onClick={() => workspace.showDialog('saveAs')}
            >Save my version as…</button>
            <button
              type="button"
              className="is-danger"
              data-testid="workspace-conflict-overwrite"
              onClick={() => workspace.runAction(() => workspace.save(true))}
            >Overwrite disk version</button>
          </>
        ) : status.kind === 'future' ? (
          <>
            <button type="button" onClick={() => workspace.showDialog('open')}>Open another…</button>
            <button
              type="button"
              className="primary"
              data-testid="workspace-make-compatible-copy"
              onClick={() => workspace.showDialog('portableCopy')}
            >
              Make compatible copy…
            </button>
          </>
        ) : status.kind === 'quarantined' ? (
          <button type="button" onClick={() => workspace.showDialog('open')}>Open another…</button>
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
  const [isRenamingInline, setIsRenamingInline] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameBusy, setRenameBusy] = useState(false)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const renameInFlightRef = useRef(false)

  const restoreTitleFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-testid="systemsketch-file-title"]')?.focus()
    })
  }, [])

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
                  ? 'Unreadable · protected'
            : workspace.status.kind === 'future'
              ? 'Newer format · protected'
            : workspace.status.kind === 'error'
              ? 'Error'
              : 'Opening'
  const renameNeedsCopy = workspace.status.kind === 'quarantined' || workspace.status.kind === 'future'

  /**
   * A document name is one small, reversible choice. Keep it in the shell
   * where people already look, rather than moving their attention into a
   * modal. The workspace still owns the actual rename, including its digest
   * fence and file-type preservation.
   */
  const beginInlineRename = useCallback(() => {
    if (renameNeedsCopy) {
      workspace.showDialog('saveAs')
      return
    }
    setRenameDraft(workspace.title)
    setRenameError(null)
    setIsRenamingInline(true)
  }, [renameNeedsCopy, workspace])

  const cancelInlineRename = useCallback(() => {
    setRenameDraft(workspace.title)
    setRenameError(null)
    setIsRenamingInline(false)
    restoreTitleFocus()
  }, [restoreTitleFocus, workspace.title])

  const commitInlineRename = useCallback(async (nextTitle = renameDraft) => {
    if (renameInFlightRef.current || renameNeedsCopy) return
    const nextPath = workspace.path ? renamedDocumentPath(workspace.path, nextTitle) : null
    if (!nextPath) {
      setRenameError('Give this board a name.')
      window.requestAnimationFrame(() => titleInputRef.current?.focus())
      return
    }
    if (nextPath === workspace.path) {
      cancelInlineRename()
      return
    }

    renameInFlightRef.current = true
    setRenameBusy(true)
    setRenameError(null)
    try {
      await workspace.rename(nextPath)
      setIsRenamingInline(false)
    } catch (cause) {
      setRenameError(errorMessage(cause))
      window.requestAnimationFrame(() => titleInputRef.current?.focus())
    } finally {
      renameInFlightRef.current = false
      setRenameBusy(false)
    }
  }, [cancelInlineRename, renameDraft, renameNeedsCopy, workspace])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || event.defaultPrevented || isRenamingInline) return
      const target = event.target
      if (
        target instanceof HTMLElement
        && (target.matches('input, textarea, select') || target.isContentEditable)
      ) return
      event.preventDefault()
      beginInlineRename()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [beginInlineRename, isRenamingInline])

  return (
    <div className="systemsketch-file-identity">
      <DefaultMainMenu>
        <>
          <TldrawUiMenuGroup id="systemsketch-file">
            <TldrawUiMenuSubmenu id="file" label="File">
              <TldrawUiMenuGroup id="file-new-open">
                <TldrawUiMenuItem id="new-document" label="New" kbd="cmd+n" onSelect={() => workspace.runAction(workspace.newDocument)} />
                <TldrawUiMenuItem id="new-window" label="New window" kbd="cmd+shift+n" onSelect={() => workspace.runAction(workspace.newWindow)} />
                <TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={() => workspace.showDialog('open')} />
                <TldrawUiMenuSubmenu id="open-recent" label="Open recent" disabled={!workspace.recents.length}>
                  <TldrawUiMenuGroup id="recent-documents">
                    {workspace.recents.map((path) => (
                      <TldrawUiMenuItem
                        id={`recent-${path}`}
                        key={path}
                        label={documentTitle(path)}
                        onSelect={() => workspace.runAction(() => workspace.open(path))}
                      />
                    ))}
                  </TldrawUiMenuGroup>
                </TldrawUiMenuSubmenu>
              </TldrawUiMenuGroup>
              <TldrawUiMenuGroup id="file-save">
                <TldrawUiMenuItem id="save-document" label="Save" kbd="cmd+s" disabled={workspace.status.kind === 'quarantined' || workspace.status.kind === 'future'} onSelect={() => workspace.runAction(workspace.save)} />
                <TldrawUiMenuItem
                  id="save-as-document"
                  label={workspace.status.kind === 'future' ? 'Make current-format copy…' : 'Save As…'}
                  kbd="cmd+shift+s"
                  disabled={workspace.status.kind === 'quarantined'}
                  onSelect={() => workspace.showDialog('saveAs')}
                />
                <TldrawUiMenuItem
                  id="export-tldraw"
                  label={workspace.status.kind === 'future' ? 'Make compatible copy…' : 'Export to tldraw…'}
                  disabled={workspace.status.kind === 'quarantined'}
                  onSelect={() => workspace.showDialog(
                    workspace.status.kind === 'future' ? 'portableCopy' : 'exportTldraw',
                  )}
                />
                <TldrawUiMenuItem id="rename-document" label="Rename" kbd="f2" onSelect={beginInlineRename} />
              </TldrawUiMenuGroup>
              <TldrawUiMenuGroup id="file-location">
                <TldrawUiMenuItem id="reveal-document" label="Show in Files" onSelect={() => workspace.runAction(workspace.reveal)} />
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
      {isRenamingInline ? (
        <div
          className="systemsketch-file-title-editor"
          data-testid="systemsketch-inline-rename"
          data-error={renameError ? 'true' : undefined}
        >
          <SystemSketchUiInput
            ref={titleInputRef}
            className="systemsketch-file-title-input"
            aria-label="Rename document"
            aria-describedby="systemsketch-inline-rename-help"
            aria-invalid={renameError ? true : undefined}
            value={renameDraft}
            disabled={renameBusy}
            autoFocus
            autoSelect
            onValueChange={(nextTitle) => {
              setRenameDraft(nextTitle)
              setRenameError(null)
            }}
            onCommit={(nextTitle) => void commitInlineRename(nextTitle)}
            onCancel={() => cancelInlineRename()}
          />
          <span id="systemsketch-inline-rename-help" className="systemsketch-file-title-help">
            {renameError ?? 'Press Enter to rename, Escape to cancel'}
          </span>
          <i data-state={workspace.status.kind} aria-label={statusLabel} />
        </div>
      ) : (
        <TldrawUiButton
          type="low"
          className="systemsketch-file-title"
          data-testid="systemsketch-file-title"
          aria-label={`${workspace.title} ${statusLabel}. Click to ${renameNeedsCopy ? 'save a copy' : 'rename'}.`}
          title={`${workspace.path ?? ''} · ${statusLabel}`}
          onClick={beginInlineRename}
        >
          <span>{workspace.title}</span>
          <i data-state={workspace.status.kind} aria-label={statusLabel} />
        </TldrawUiButton>
      )}
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
  const portalContainer = useThemePortalContainer()
  const [listing, setListing] = useState<WorkspaceListing | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const portableCopyMode = mode === 'portableCopy'
  const currentFormatCopyMode = mode === 'saveAs' && workspace.status.kind === 'future'
  const conflictCopyMode = useRef(mode === 'saveAs' && workspace.status.kind === 'conflict').current
  const [name, setName] = useState(() => (
    portableCopyMode || currentFormatCopyMode
      ? `${workspace.title} compatible copy`
        // WHY: draw.io's safe conflict action creates a separately named copy.
        // Default away from the contested path so Enter cannot overwrite it.
        : conflictCopyMode ? `${workspace.title} local copy` : workspace.title
  ))
  const [error, setError] = useState<string | null>(null)
  const [replacePath, setReplacePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const filterInputRef = useRef<HTMLInputElement | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const crumbsRef = useRef<HTMLElement | null>(null)
  const isRename = mode === 'rename'
  const isExport = mode === 'exportTldraw'
  const writesTldraw = isExport || portableCopyMode
  // Rename never changes a document's type, so it shows the suffix the file
  // already has. An export always writes `.tldr` — that is the whole point of
  // it. Everything else is making a new file, which is `.systemsketch`.
  const suffix = writesTldraw
    ? TLDRAW_SUFFIX
    : (isRename && workspace.path ? documentSuffix(workspace.path) : null) ?? SYSTEMSKETCH_SUFFIX

  const load = useCallback(async (directory?: string) => {
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    setBusy(true)
    setError(null)
    try {
      const next = await listWorkspace(directory, { signal: controller.signal })
      if (controller.signal.aborted) return
      setListing(next)
      setSelectedPath(null)
      setQuery('')
      setReplacePath(null)
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(errorMessage(cause))
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null
        setBusy(false)
      }
    }
  }, [])

  useEffect(() => () => loadAbortRef.current?.abort(), [])

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
      } else if (mode === 'saveAs' || mode === 'exportTldraw' || portableCopyMode) {
        const proposedPath = force && replacePath
          ? replacePath
          : listing ? documentPathFor(listing.dir, name, suffix) : null
        const nextPath = proposedPath && writesTldraw
          ? exportedTldrawPath(proposedPath)
          : proposedPath
        if (!nextPath) throw new Error('Enter a file name.')
        attemptedPath = nextPath
        if (mode === 'exportTldraw') {
          await workspace.exportTldraw(nextPath, force)
          workspace.closeDialog()
        } else if (portableCopyMode) {
          await workspace.makePortableCopy(nextPath, force)
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
      if (
        (mode === 'saveAs' || mode === 'exportTldraw' || portableCopyMode)
        && !force
        && attemptedPath
        && cause instanceof WorkspaceConflict
      ) {
        setReplacePath(attemptedPath)
        setError(
          `“${documentTitle(attemptedPath)}” already exists. Replace it with ${
            mode === 'exportTldraw' ? 'this export' : portableCopyMode ? 'this compatible copy' : 'this document'
          }?`,
        )
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

  // ThemeRoot's ref is set before a person can open a dialog. Skipping this
  // pre-commit render is safer than letting Radix default to document.body.
  if (!portalContainer) return null

  return (
    // WHY: Radix is already SystemSketch's dialog dependency and the primitive
    // tldraw uses. Let it own focus trapping, Escape, outside dismissal, and
    // screen-reader modal isolation instead of maintaining a second version.
    <Dialog.Root open onOpenChange={(open) => { if (!open) workspace.closeDialog() }}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="systemsketch-workspace-dialog-backdrop">
          <Dialog.Content
            asChild
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              if (creatingFolder) {
                // WHY: the inline folder form is one level below the file browser;
                // its first Escape cancels that substate without dismissing the modal.
                event.preventDefault()
                setCreatingFolder(false)
                setFolderName('')
                setError(null)
                return
              }
              if (document.activeElement === filterInputRef.current || document.activeElement === nameInputRef.current) {
                // WHY: Radix observes Escape at the dialog boundary before an
                // input's own capture handler. Keep the dialog open so stock
                // TldrawUiInput can reset its draft and blur as designed.
                event.preventDefault()
              }
            }}
          >
            <section
              className="systemsketch-workspace-dialog"
              data-testid="workspace-dialog"
              data-mode={mode}
              aria-labelledby="workspace-dialog-title"
            >
        <header>
          <div>
            <span>Local workspace</span>
            <Dialog.Title asChild>
              <h2 id="workspace-dialog-title">
                {mode === 'open'
                  ? 'Open a document'
                  : mode === 'saveAs'
                    ? conflictCopyMode
                      ? 'Preserve your version'
                      : currentFormatCopyMode ? 'Make current-format copy' : 'Save a copy'
                    : mode === 'exportTldraw'
                      ? 'Export to tldraw'
                      : portableCopyMode ? 'Make compatible copy' : 'Rename document'}
              </h2>
            </Dialog.Title>
          </div>
          <Dialog.Close asChild>
            <button type="button" aria-label="Close">×</button>
          </Dialog.Close>
        </header>

        {portableCopyMode ? (
          <p className="systemsketch-workspace-dialog__context" data-testid="workspace-compatible-copy-explanation">
            This creates and opens a separate <code>.tldr</code>. Every SystemSketch feature this build can read becomes editable stock tldraw primitives; the original stays byte-for-byte untouched. Data this build cannot read cannot be recovered or converted here.
          </p>
        ) : currentFormatCopyMode ? (
          <p className="systemsketch-workspace-dialog__context">
            This creates a separate current-format SystemSketch board. Newer-only metadata may be omitted; use “Make compatible copy” to lower the visible board to stock primitives instead.
          </p>
        ) : null}

        {isRename ? (
          <div className="systemsketch-workspace-dialog__rename">
            <label>Name</label>
            <div className="systemsketch-workspace-name-field">
              <SystemSketchUiInput
                ref={nameInputRef}
                autoFocus
                autoSelect
                value={name}
                aria-label="File name"
                onValueChange={setName}
                onComplete={() => void submit()}
                onCancel={setName}
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
                  if (mode === 'open') workspace.runAction(() => workspace.open(path))
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
                <SystemSketchUiInput
                  ref={filterInputRef}
                  className="systemsketch-workspace-search"
                  data-testid="workspace-filter"
                  autoFocus={mode === 'open'}
                  autoSelect={mode === 'open'}
                  placeholder="Filter"
                  aria-label="Filter this folder"
                  value={query}
                  onValueChange={setQuery}
                  onCancel={setQuery}
                  // Stock inputs stop Enter after completing their edit. The
                  // open browser deliberately treats that completed query as
                  // "open the selected match", so retain that action here.
                  onComplete={mode === 'open' ? () => void submit() : undefined}
                />
              </div>
              {creatingFolder ? (
                <form className="systemsketch-workspace-new-folder" onSubmit={(event) => {
                  event.preventDefault()
                  void createFolder()
                }}>
                  <label>New folder</label>
                  <SystemSketchUiInput
                    data-testid="workspace-new-folder-name"
                    autoFocus
                    autoSelect
                    value={folderName}
                    aria-label="New folder name"
                    onValueChange={setFolderName}
                    onComplete={() => void createFolder()}
                    onCancel={() => {
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
                      else if (mode === 'saveAs' || writesTldraw) {
                        setName(row.title)
                        setReplacePath(null)
                        setError(null)
                      }
                    }}
                    onDoubleClick={() => workspace.runAction(() => activate(row))}
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
              {mode === 'saveAs' || writesTldraw ? (
                <div className="systemsketch-workspace-name-field is-save-as">
                  <SystemSketchUiInput ref={nameInputRef} autoFocus autoSelect value={name} aria-label="File name" onValueChange={(nextName) => {
                    setName(nextName)
                    setReplacePath(null)
                    setError(null)
                  }} onComplete={() => void submit()} onCancel={setName} />
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
                onClick={() => workspace.runAction(openInNewWindow)}
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
                    : mode === 'saveAs' ? 'Save' : mode === 'exportTldraw' ? 'Export' : portableCopyMode ? 'Make copy' : 'Rename'}
            </button>
          </div>
        </footer>
            </section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
