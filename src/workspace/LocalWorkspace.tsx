import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiButton,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useDialogs,
  loadSnapshot,
  parseTldrawJsonFile,
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
  breadcrumbTrail,
  browserRows,
  claimUntitledPath,
  documentHref,
  documentPathFor,
  documentTitle,
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
  type BrowserRow,
  type DocumentFingerprint,
} from './workspaceModel'
import './local-workspace.css'
import { SettingsGearIcon, SystemSketchSettingsDialog } from '../settings/InterfaceSettings'

const SAVE_DEBOUNCE_MS = 600
const WATCH_INTERVAL_MS = 1500
const NOTICE_TIMEOUT_MS = 6000

export type WorkspaceStatus =
  | { kind: 'loading' }
  | { kind: 'clean'; at: number | null }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'conflict' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

type WorkspaceDialogMode = 'open' | 'saveAs' | 'rename' | null

export interface LocalWorkspaceController {
  path: string | null
  title: string
  isPersisted: boolean
  status: WorkspaceStatus
  recents: string[]
  attach(editor: Editor): () => void
  open(path: string): Promise<void>
  newDocument(): Promise<void>
  save(force?: boolean): Promise<void>
  saveAs(path: string, force?: boolean): Promise<void>
  rename(path: string): Promise<void>
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function fingerprint(document: { mtime?: number; size?: number }): DocumentFingerprint | null {
  return document.mtime === undefined || document.size === undefined
    ? null
    : { mtime: document.mtime, size: document.size }
}

function loadDocumentSource(editor: Editor, source: string): string | null {
  const parsed = parseTldrawJsonFile({ json: source, schema: editor.store.schema })
  if (!parsed.ok) return `tldraw could not read this document (${parsed.error.type})`
  editor.store.mergeRemoteChanges(() => {
    loadSnapshot(editor.store, parsed.value.getStoreSnapshot())
  })
  return null
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
  const [isPersisted, setIsPersisted] = useState(false)
  const [status, setStatus] = useState<WorkspaceStatus>({ kind: 'loading' })
  const [recents, setRecents] = useState<string[]>(() => readRecentDocumentPaths())
  const [dialog, setDialog] = useState<WorkspaceDialogMode>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const editorRef = useRef<Editor | null>(null)
  const pathRef = useRef<string | null>(null)
  const sourceRef = useRef<string | null>(null)
  const digestRef = useRef<string | null>(null)
  const fingerprintRef = useRef<DocumentFingerprint | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const queuedSourceRef = useRef<Promise<string> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistRef = useRef<(force?: boolean) => Promise<void>>(async () => {})

  const updateRecents = useCallback((next: string[]) => setRecents(next), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const listing = await listWorkspace()
        const query = new URLSearchParams(window.location.search)
        const explicitPath = query.get('board')?.trim() || null
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
        pathRef.current = selectedPath
        sourceRef.current = document.source
        digestRef.current = document.digest ?? null
        fingerprintRef.current = fingerprint(document)
        if (document.source !== null) updateRecents(rememberDocumentPath(selectedPath))
        setPath(selectedPath)
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
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistRef.current()
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const persist = useCallback(async (force = false) => {
    const boardPath = pathRef.current
    const editor = editorRef.current
    const queuedSource = queuedSourceRef.current
    if (boardPath === null || (editor === null && queuedSource === null)) return
    if (savingRef.current) {
      if (dirtyRef.current) scheduleSave()
      return
    }

    savingRef.current = true
    setStatus({ kind: 'saving' })
    const sourcePromise = queuedSource ?? serializeTldrawJson(editor!)
    let savedSuccessfully = false
    try {
      const source = await sourcePromise
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
      if (queuedSourceRef.current === sourcePromise) {
        queuedSourceRef.current = null
        dirtyRef.current = false
      }
      setStatus(dirtyRef.current ? { kind: 'dirty' } : { kind: 'clean', at: Date.now() })
    } catch (cause) {
      dirtyRef.current = true
      setStatus(
        cause instanceof WorkspaceConflict
          ? { kind: 'conflict' }
          : { kind: 'error', message: errorMessage(cause) },
      )
    } finally {
      savingRef.current = false
      if (dirtyRef.current && savedSuccessfully) scheduleSave()
    }
  }, [scheduleSave, updateRecents])
  persistRef.current = persist

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
    const directory = pathRef.current ? parentDirectory(pathRef.current) : undefined
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
    setStatus({ kind: 'saving' })
    savingRef.current = true
    try {
      const source = await serializeTldrawJson(editor)
      await writeWorkspaceDocument({ path: nextPath, source, baseDigest: null, force })
      updateRecents(rememberDocumentPath(nextPath))
      window.location.assign(documentHref(nextPath))
    } catch (cause) {
      setStatus({ kind: 'clean', at: null })
      throw cause
    } finally {
      savingRef.current = false
    }
  }, [updateRecents])

  const rename = useCallback(async (nextPath: string) => {
    const currentPath = pathRef.current
    if (!currentPath || nextPath === currentPath) return
    if (!sourceRef.current) {
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
      const loadError = loadDocumentSource(editor, document.source)
      if (loadError) {
        setStatus({ kind: 'error', message: loadError })
        return
      }
      sourceRef.current = document.source
      digestRef.current = document.digest ?? null
      fingerprintRef.current = fingerprint(document)
      dirtyRef.current = false
      queuedSourceRef.current = null
      setIsPersisted(true)
      updateRecents(rememberDocumentPath(boardPath))
      setStatus({ kind: 'clean', at: Date.now() })
    } catch (cause) {
      setStatus({ kind: 'error', message: errorMessage(cause) })
    }
  }, [updateRecents])

  const trash = useCallback(async () => {
    const boardPath = pathRef.current
    if (!boardPath) return
    if (!sourceRef.current) {
      await newDocument()
      return
    }
    await waitForSave()
    if (!digestRef.current) throw new Error('The current file revision is not available yet.')
    if (!window.confirm(`Move “${documentTitle(boardPath)}” to Trash?`)) return
    await trashWorkspaceDocument({ path: boardPath, baseDigest: digestRef.current })
    updateRecents(forgetDocumentPath(boardPath))
    window.location.assign(documentHref(await reserveUntitledPath()))
  }, [newDocument, reserveUntitledPath, updateRecents, waitForSave])

  const reveal = useCallback(async () => {
    if (pathRef.current) await revealWorkspaceDocument(pathRef.current)
  }, [])

  const attach = useCallback((editor: Editor) => {
    editorRef.current = editor
    if (sourceRef.current !== null) {
      const loadError = loadDocumentSource(editor, sourceRef.current)
      if (loadError) setStatus({ kind: 'error', message: loadError })
    }
    const stop = editor.store.listen((entry) => {
      if (removesDocumentBoundary(entry)) return
      dirtyRef.current = true
      queuedSourceRef.current = serializeTldrawJson(editor)
      setStatus((current) => current.kind === 'conflict' ? current : { kind: 'dirty' })
      scheduleSave()
    }, { source: 'user', scope: 'document' })
    return () => {
      stop()
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [scheduleSave])

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
    const flush = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        void persistRef.current()
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  const controller = useMemo<LocalWorkspaceController>(() => ({
    path,
    title: path ? documentTitle(path) : 'Opening…',
    isPersisted,
    status,
    recents,
    attach,
    open,
    newDocument,
    save: persist,
    saveAs,
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
    isPersisted,
    newDocument,
    newWindow,
    notice,
    open,
    openWindow,
    path,
    persist,
    recents,
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
  return (
    <main className="systemsketch-workspace-loading">
      <div className="systemsketch-workspace-loading__mark">S</div>
      <strong>{status.kind === 'error' ? 'Could not open the local workspace' : 'Opening workspace…'}</strong>
      {status.kind === 'error' ? <p>{status.message}</p> : null}
    </main>
  )
}

function WorkspaceAlert() {
  const workspace = useLocalWorkspace()
  const { status } = workspace
  if (status.kind !== 'conflict' && status.kind !== 'missing' && status.kind !== 'error') return null
  return (
    <aside className={`systemsketch-workspace-alert is-${status.kind}`} role="alert">
      <div>
        <strong>
          {status.kind === 'conflict'
            ? 'This file changed somewhere else'
            : status.kind === 'missing'
              ? 'This file was moved or deleted'
              : 'The file could not be saved'}
        </strong>
        <span>{status.kind === 'error' ? status.message : workspace.path}</span>
      </div>
      <div className="systemsketch-workspace-alert__actions">
        {status.kind === 'conflict' ? (
          <>
            <button type="button" onClick={() => void workspace.takeDisk()}>Use disk version</button>
            <button type="button" className="primary" onClick={() => void workspace.save(true)}>Keep my version</button>
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
                <TldrawUiMenuItem id="save-document" label="Save" kbd="cmd+s" onSelect={() => void workspace.save()} />
                <TldrawUiMenuItem id="save-as-document" label="Save As…" kbd="cmd+shift+s" onSelect={() => workspace.showDialog('saveAs')} />
                <TldrawUiMenuItem id="rename-document" label="Rename…" onSelect={() => workspace.showDialog('rename')} />
              </TldrawUiMenuGroup>
              <TldrawUiMenuGroup id="file-location">
                <TldrawUiMenuItem id="reveal-document" label="Show in Files" onSelect={() => void workspace.reveal()} />
                <TldrawUiMenuItem id="trash-document" label="Move to Trash…" disabled={!workspace.isPersisted} onSelect={() => void workspace.trash()} />
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
        onClick={() => workspace.showDialog('rename')}
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
  const [name, setName] = useState(() => workspace.title)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const crumbsRef = useRef<HTMLElement | null>(null)
  const isRename = mode === 'rename'

  const load = useCallback(async (directory?: string) => {
    setBusy(true)
    setError(null)
    try {
      const next = await listWorkspace(directory)
      setListing(next)
      setSelectedPath(null)
      setQuery('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (isRename) return
    void load(workspace.path ? parentDirectory(workspace.path) : undefined)
  }, [isRename, load, workspace.path])

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
    else setName(row.title)
  }, [load, mode, workspace])

  const submit = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'open') {
        if (!selectedRow) throw new Error('Choose a .tldr document to open.')
        await activate(selectedRow)
        if (selectedRow.kind === 'folder') setBusy(false)
      } else if (mode === 'saveAs') {
        const nextPath = listing ? documentPathFor(listing.dir, name) : null
        if (!nextPath) throw new Error('Enter a file name.')
        await workspace.saveAs(nextPath)
      } else {
        const nextPath = workspace.path ? renamedDocumentPath(workspace.path, name) : null
        if (!nextPath) throw new Error('Enter a file name.')
        await workspace.rename(nextPath)
        workspace.closeDialog()
      }
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }, [activate, listing, mode, name, selectedRow, workspace])

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
      if (event.key === 'Enter' && !busy) {
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
              {mode === 'open' ? 'Open a document' : mode === 'saveAs' ? 'Save a copy' : 'Rename document'}
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
              <span>.tldr</span>
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
                <button key={path} type="button" title={path} onClick={() => {
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
                      else if (mode === 'saveAs') setName(row.title)
                    }}
                    onDoubleClick={() => void activate(row)}
                  >
                    <span aria-hidden="true">{row.kind === 'folder' ? '▰' : '◇'}</span>
                    <b>{row.title}</b>
                    <small>{row.kind === 'folder' ? 'Folder' : relativeDay(row.mtime ?? 0)}</small>
                  </button>
                ))}
                {!busy && listing && !rows.length ? (
                  <p className="systemsketch-workspace-file-list__empty">
                    {query
                      ? `Nothing here matches “${query}”.`
                      : 'This folder has no .tldr documents yet.'}
                  </p>
                ) : null}
              </div>
              {mode === 'saveAs' ? (
                <div className="systemsketch-workspace-name-field is-save-as">
                  <input autoFocus value={name} aria-label="File name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter') void submit()
                  }} />
                  <span>.tldr</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {error ? <p className="systemsketch-workspace-dialog__error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" onClick={workspace.closeDialog}>Cancel</button>
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
              className="primary"
              data-testid="workspace-confirm"
              disabled={busy || (mode === 'open' && !selectedRow)}
              onClick={() => void submit()}
            >
              {busy
                ? 'Working…'
                : mode === 'open'
                  ? selectedRow?.kind === 'folder' ? 'Open folder' : 'Open'
                  : mode === 'saveAs' ? 'Save' : 'Rename'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
