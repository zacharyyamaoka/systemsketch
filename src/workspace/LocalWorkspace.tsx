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
  pickWorkspaceDocument,
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
  documentHref,
  documentPathFor,
  documentSuffix,
  documentTitle,
  encodeDocumentForPath,
  forgetDocumentPath,
  nextSyncAction,
  nextUntitledDocumentPath,
  parentDirectory,
  readRecentDocumentPaths,
  rememberDocumentPath,
  removesDocumentBoundary,
  renamedDocumentPath,
  replaceRememberedDocumentPath,
  type DocumentFingerprint,
} from './workspaceModel'
import { decodeSystemSketchDocument } from './systemSketchFile'
import './local-workspace.css'
import { SettingsGearIcon, SystemSketchSettingsDialog } from '../settings/InterfaceSettings'

const SAVE_DEBOUNCE_MS = 600
const WATCH_INTERVAL_MS = 1500

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
  showFileDialog(mode: 'open' | 'saveAs'): Promise<void>
  showDialog(mode: Exclude<WorkspaceDialogMode, null>): void
  closeDialog(): void
}

const LocalWorkspaceContext = createContext<LocalWorkspaceController | null>(null)

export function useLocalWorkspace(): LocalWorkspaceController {
  const workspace = useContext(LocalWorkspaceContext)
  if (!workspace) throw new Error('Local workspace controls must be used inside the provider')
  return workspace
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
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
function loadDocumentSource(editor: Editor, source: string): string | null {
  const { core } = decodeSystemSketchDocument(source)
  const parsed = parseTldrawJsonFile({ json: core, schema: editor.store.schema })
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

  const newDocument = useCallback(async () => {
    await waitForSave()
    const directory = pathRef.current ? parentDirectory(pathRef.current) : undefined
    const listing = await listWorkspace(directory)
    const nextPath = nextUntitledDocumentPath(
      listing.dir,
      listing.documents.map((candidate) => candidate.path),
    )
    window.location.assign(documentHref(nextPath))
  }, [waitForSave])

  const saveAs = useCallback(async (nextPath: string, force = false) => {
    const editor = editorRef.current
    if (!editor || savingRef.current) throw new Error('The document is not ready to save yet.')
    setStatus({ kind: 'saving' })
    savingRef.current = true
    try {
      const source = encodeDocumentForPath(nextPath, await serializeTldrawJson(editor))
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

  const showFileDialog = useCallback(async (mode: 'open' | 'saveAs') => {
    try {
      const picked = await pickWorkspaceDocument({
        mode: mode === 'open' ? 'open' : 'save',
        currentPath: pathRef.current,
      })
      if (!picked.available) {
        setDialog(mode)
        return
      }
      if (picked.cancelled || !picked.path) return
      if (mode === 'open') await open(picked.path)
      else await saveAs(picked.path, picked.replaceExisting === true)
    } catch {
      setDialog(mode)
    }
  }, [open, saveAs])

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
    const listing = await listWorkspace(parentDirectory(boardPath))
    const nextPath = nextUntitledDocumentPath(
      listing.dir,
      listing.documents.map((candidate) => candidate.path),
    )
    window.location.assign(documentHref(nextPath))
  }, [newDocument, updateRecents, waitForSave])

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
        if (event.shiftKey) void showFileDialog('saveAs')
        else void persistRef.current()
      } else if (key === 'o') {
        event.preventDefault()
        void showFileDialog('open')
      } else if (key === 'n') {
        event.preventDefault()
        void newDocument()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [newDocument, showFileDialog])

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
    showFileDialog,
    showDialog: setDialog,
    closeDialog: () => setDialog(null),
  }), [
    attach,
    isPersisted,
    newDocument,
    open,
    path,
    persist,
    recents,
    reloadFromDisk,
    rename,
    reveal,
    saveAs,
    showFileDialog,
    status,
    trash,
  ])

  return (
    <LocalWorkspaceContext.Provider value={controller}>
      {path ? children : <WorkspaceLoading status={status} />}
      {dialog ? <WorkspaceDialog mode={dialog} /> : null}
      <WorkspaceAlert />
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
          <button type="button" onClick={() => void workspace.showFileDialog('saveAs')}>Save As…</button>
        )}
      </div>
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
                <TldrawUiMenuItem id="open-document" label="Open…" kbd="cmd+o" onSelect={() => void workspace.showFileDialog('open')} />
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
                <TldrawUiMenuItem id="save-as-document" label="Save As…" kbd="cmd+shift+s" onSelect={() => void workspace.showFileDialog('saveAs')} />
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

function WorkspaceDialog({ mode }: { mode: Exclude<WorkspaceDialogMode, null> }) {
  const workspace = useLocalWorkspace()
  const [listing, setListing] = useState<WorkspaceListing | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [name, setName] = useState(() => workspace.title)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isRename = mode === 'rename'
  // Rename never changes a document's type, so it shows the suffix the file
  // already has. Everything else is making a new file, which is .systemsketch.
  const suffix = (isRename && workspace.path ? documentSuffix(workspace.path) : null)
    ?? SYSTEMSKETCH_SUFFIX

  const load = useCallback(async (directory?: string) => {
    setBusy(true)
    setError(null)
    try {
      const next = await listWorkspace(directory)
      setListing(next)
      setSelectedPath(null)
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') workspace.closeDialog()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [workspace])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'open') {
        if (!selectedPath) throw new Error('Choose a document to open.')
        await workspace.open(selectedPath)
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
  }

  return (
    <div className="systemsketch-workspace-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) workspace.closeDialog()
    }}>
      <section className="systemsketch-workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title">
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
              <span>{suffix}</span>
            </div>
            <p>{workspace.path ? parentDirectory(workspace.path) : ''}</p>
          </div>
        ) : (
          <div className="systemsketch-workspace-browser">
            <aside>
              <strong>Recent</strong>
              {workspace.recents.length ? workspace.recents.map((path) => (
                <button key={path} type="button" title={path} onClick={() => {
                  if (mode === 'open') setSelectedPath(path)
                  else void load(parentDirectory(path))
                }}>
                  <span>{documentTitle(path)}</span>
                  <small>{parentDirectory(path)}</small>
                </button>
              )) : <p>No recent files yet.</p>}
            </aside>
            <div className="systemsketch-workspace-browser__files">
              <div className="systemsketch-workspace-pathbar">
                <button type="button" disabled={!listing?.parent || busy} aria-label="Parent folder" onClick={() => listing?.parent && void load(listing.parent)}>←</button>
                <code title={listing?.dir}>{listing?.dir ?? 'Opening…'}</code>
              </div>
              <div className="systemsketch-workspace-file-list" role="listbox" aria-label="Local files">
                {listing?.directories.map((directory) => (
                  <button key={directory.path} type="button" className="folder" onDoubleClick={() => void load(directory.path)} onClick={() => void load(directory.path)}>
                    <span aria-hidden="true">▰</span><b>{directory.name}</b><small>Folder</small>
                  </button>
                ))}
                {listing?.documents.map((document) => (
                  <button
                    key={document.path}
                    type="button"
                    className={selectedPath === document.path ? 'selected' : ''}
                    role="option"
                    aria-selected={selectedPath === document.path}
                    onClick={() => setSelectedPath(document.path)}
                    onDoubleClick={() => mode === 'open' && void workspace.open(document.path)}
                  >
                    <span aria-hidden="true">◇</span>
                    <b>{document.title}</b>
                    <small data-kind={document.kind ?? 'systemsketch'}>
                      {document.kind === 'tldraw' ? 'tldraw' : 'sketch'}
                      {' · '}
                      {new Date(document.mtime * 1000).toLocaleDateString()}
                    </small>
                  </button>
                ))}
                {!busy && listing && !listing.directories.length && !listing.documents.length ? (
                  <p className="systemsketch-workspace-file-list__empty">This folder has no SystemSketch documents yet.</p>
                ) : null}
              </div>
              {mode === 'saveAs' ? (
                <div className="systemsketch-workspace-name-field is-save-as">
                  <input autoFocus value={name} aria-label="File name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
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
          <button type="button" onClick={workspace.closeDialog}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={busy || (mode === 'open' && !selectedPath)}
            onClick={() => void submit()}
          >
            {busy ? 'Working…' : mode === 'open' ? 'Open' : mode === 'saveAs' ? 'Save' : 'Rename'}
          </button>
        </footer>
      </section>
    </div>
  )
}
