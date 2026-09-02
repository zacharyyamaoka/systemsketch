export interface WorkspaceLifecycleOptions {
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  documentTarget: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  hasUnsavedChanges(): boolean
  flush(): void
  finalFlush(): void
}

/**
 * Protect a dirty standalone document across every browser exit signal.
 *
 * `visibilitychange` starts an ordinary, observable save at the earliest
 * reliable lifecycle signal. `beforeunload` both retries and asks the browser
 * to keep the window open if work is still dirty. `pagehide` is the final
 * keepalive path after navigation has actually won.
 */
export function installWorkspaceLifecycleProtection({
  windowTarget,
  documentTarget,
  hasUnsavedChanges,
  flush,
  finalFlush,
}: WorkspaceLifecycleOptions): () => void {
  let finalFlushRequested = false

  const flushIfDirty = () => {
    if (hasUnsavedChanges()) flush()
  }
  const requestFinalFlush = () => {
    if (!hasUnsavedChanges() || finalFlushRequested) return
    finalFlushRequested = true
    finalFlush()
  }
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return
    flush()
    event.preventDefault()
    try {
      // Legacy Chromium still checks returnValue; preventDefault is the modern
      // contract. Some EventTarget test implementations expose it read-only.
      event.returnValue = true
    } catch {
      // `preventDefault` above remains the authoritative signal.
    }
  }
  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === 'hidden') flushIfDirty()
  }
  const onPageShow = () => {
    // A pagehide may have put this document into the back/forward cache rather
    // than destroying it. Once restored, the next editing session needs its
    // own final-flush opportunity.
    finalFlushRequested = false
  }

  windowTarget.addEventListener('beforeunload', onBeforeUnload)
  windowTarget.addEventListener('pagehide', requestFinalFlush)
  windowTarget.addEventListener('pageshow', onPageShow)
  documentTarget.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    windowTarget.removeEventListener('beforeunload', onBeforeUnload)
    windowTarget.removeEventListener('pagehide', requestFinalFlush)
    windowTarget.removeEventListener('pageshow', onPageShow)
    documentTarget.removeEventListener('visibilitychange', onVisibilityChange)
    requestFinalFlush()
  }
}
