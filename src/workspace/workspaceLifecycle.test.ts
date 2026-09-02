import { describe, expect, it, vi } from 'vitest'
import { installWorkspaceLifecycleProtection } from './workspaceLifecycle'

class VisibilityTarget extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible'
}

describe('standalone workspace lifecycle protection', () => {
  function setup(dirty = true) {
    const windowTarget = new EventTarget()
    const documentTarget = new VisibilityTarget()
    const flush = vi.fn()
    const finalFlush = vi.fn()
    let hasUnsavedChanges = dirty
    const dispose = installWorkspaceLifecycleProtection({
      windowTarget,
      documentTarget,
      hasUnsavedChanges: () => hasUnsavedChanges,
      flush,
      finalFlush,
    })
    return {
      windowTarget,
      documentTarget,
      flush,
      finalFlush,
      dispose,
      setDirty: (next: boolean) => { hasUnsavedChanges = next },
    }
  }

  it('does not interfere with a clean close', () => {
    const harness = setup(false)
    const event = new Event('beforeunload', { cancelable: true })
    harness.windowTarget.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(harness.flush).not.toHaveBeenCalled()
    harness.dispose()
    expect(harness.finalFlush).not.toHaveBeenCalled()
  })

  it('flushes early and asks the browser to protect a dirty close', () => {
    const harness = setup()
    harness.documentTarget.visibilityState = 'hidden'
    harness.documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(harness.flush).toHaveBeenCalledTimes(1)

    const event = new Event('beforeunload', { cancelable: true })
    harness.windowTarget.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(harness.flush).toHaveBeenCalledTimes(2)
  })

  it('uses one final flush on pagehide and unregisters every listener', () => {
    const harness = setup()
    harness.windowTarget.dispatchEvent(new Event('pagehide'))
    harness.windowTarget.dispatchEvent(new Event('pagehide'))
    expect(harness.finalFlush).toHaveBeenCalledTimes(1)

    harness.dispose()
    harness.documentTarget.dispatchEvent(new Event('visibilitychange'))
    harness.windowTarget.dispatchEvent(new Event('beforeunload'))
    expect(harness.flush).not.toHaveBeenCalled()
    expect(harness.finalFlush).toHaveBeenCalledTimes(1)
  })

  it('allows a new final flush after a back-forward-cache restore', () => {
    const harness = setup()
    harness.windowTarget.dispatchEvent(new Event('pagehide'))
    harness.windowTarget.dispatchEvent(new Event('pageshow'))
    harness.windowTarget.dispatchEvent(new Event('pagehide'))
    expect(harness.finalFlush).toHaveBeenCalledTimes(2)
  })

  it('performs the final flush during teardown when pagehide never arrived', () => {
    const harness = setup()
    harness.dispose()
    expect(harness.finalFlush).toHaveBeenCalledTimes(1)
  })
})
