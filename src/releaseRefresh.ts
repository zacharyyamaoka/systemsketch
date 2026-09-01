export const RELEASE_REFRESH_INTERVAL_MS = 15_000

export interface ReleaseRefreshEnvironment {
  windowTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  documentTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & {
    visibilityState: DocumentVisibilityState
  }
  setInterval: (callback: () => void, intervalMs: number) => unknown
  clearInterval: (timer: unknown) => void
}

function browserEnvironment(): ReleaseRefreshEnvironment {
  return {
    windowTarget: window,
    documentTarget: document,
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (timer) => window.clearInterval(timer as number),
  }
}

export function startReleaseRefresh(
  refresh: () => void | Promise<void>,
  environment: ReleaseRefreshEnvironment = browserEnvironment(),
  intervalMs = RELEASE_REFRESH_INTERVAL_MS,
): () => void {
  const refreshNow = () => void refresh()
  const refreshWhenVisible = () => {
    if (environment.documentTarget.visibilityState === 'visible') refreshNow()
  }

  refreshNow()
  const timer = environment.setInterval(refreshNow, intervalMs)
  environment.windowTarget.addEventListener('focus', refreshNow)
  environment.windowTarget.addEventListener('online', refreshNow)
  environment.documentTarget.addEventListener('visibilitychange', refreshWhenVisible)

  return () => {
    environment.clearInterval(timer)
    environment.windowTarget.removeEventListener('focus', refreshNow)
    environment.windowTarget.removeEventListener('online', refreshNow)
    environment.documentTarget.removeEventListener('visibilitychange', refreshWhenVisible)
  }
}
