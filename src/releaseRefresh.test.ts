import { describe, expect, it, vi } from 'vitest'
import { RELEASE_REFRESH_INTERVAL_MS, startReleaseRefresh, type ReleaseRefreshEnvironment } from './releaseRefresh'

describe('release status background refresh', () => {
  it('refreshes immediately, on schedule, and whenever the app becomes current again', () => {
    const windowTarget = new EventTarget()
    const documentTarget = Object.assign(new EventTarget(), {
      visibilityState: 'visible' as DocumentVisibilityState,
    })
    const scheduled: { callback: (() => void) | null } = { callback: null }
    const clearInterval = vi.fn()
    const refresh = vi.fn()
    const environment: ReleaseRefreshEnvironment = {
      windowTarget,
      documentTarget,
      setInterval: (callback, intervalMs) => {
        expect(intervalMs).toBe(RELEASE_REFRESH_INTERVAL_MS)
        scheduled.callback = callback
        return 42
      },
      clearInterval,
    }

    const stop = startReleaseRefresh(refresh, environment)
    expect(refresh).toHaveBeenCalledTimes(1)

    scheduled.callback?.()
    windowTarget.dispatchEvent(new Event('focus'))
    windowTarget.dispatchEvent(new Event('online'))
    expect(refresh).toHaveBeenCalledTimes(4)

    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).toHaveBeenCalledTimes(4)
    documentTarget.visibilityState = 'visible'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).toHaveBeenCalledTimes(5)

    stop()
    expect(clearInterval).toHaveBeenCalledWith(42)
    windowTarget.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(5)
  })
})
