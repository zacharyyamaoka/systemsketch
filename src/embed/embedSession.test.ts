import { describe, expect, it, vi } from 'vitest'
import {
  acceptOutgoing,
  createCoalescingAsyncRunner,
  createFlushableDebounce,
  decideOutgoing,
  EMPTY_OUTGOING_QUEUE,
  externalChangeMessage,
  failOutgoing,
  installEmbeddedLifecycleFlush,
  queueOutgoing,
  retryOutgoing,
  type EmbeddedDocument,
} from './embedSession'

const OPEN: EmbeddedDocument = { path: '/goldens/01/target.systemsketch', version: 7, readOnly: false }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('an edit leaves only when it can land', () => {
  it('posts against the version the canvas is showing', () => {
    expect(decideOutgoing({ document: OPEN, text: 'a', settledText: null, inFlight: false }))
      .toEqual({ kind: 'post', text: 'a', baseVersion: 7 })
  })

  it('holds while an earlier edit is still in flight', () => {
    expect(decideOutgoing({ document: OPEN, text: 'b', settledText: 'a', inFlight: true }))
      .toEqual({ kind: 'hold', reason: 'in-flight' })
  })

  it('holds when the canvas serializes to what the host already has', () => {
    expect(decideOutgoing({ document: OPEN, text: 'a', settledText: 'a', inFlight: false }))
      .toEqual({ kind: 'hold', reason: 'unchanged' })
  })

  it('never writes to a read-only document', () => {
    expect(decideOutgoing({
      document: { ...OPEN, readOnly: true },
      text: 'a',
      settledText: null,
      inFlight: false,
    })).toEqual({ kind: 'hold', reason: 'read-only' })
  })

  it('holds before a host has opened anything', () => {
    expect(decideOutgoing({ document: null, text: 'a', settledText: null, inFlight: false }))
      .toEqual({ kind: 'hold', reason: 'no-document' })
  })

  it('posts again once the host answers with its new version', () => {
    const landed: EmbeddedDocument = { ...OPEN, version: 8 }
    expect(decideOutgoing({ document: landed, text: 'b', settledText: 'a', inFlight: false }))
      .toEqual({ kind: 'post', text: 'b', baseVersion: 8 })
  })
})

describe('edits produced while the host is writing', () => {
  it('keeps only the latest complete serialization and sends it after acceptance', () => {
    const first = queueOutgoing({ document: OPEN, text: 'first', state: EMPTY_OUTGOING_QUEUE })
    expect(first.decision).toEqual({ kind: 'post', text: 'first', baseVersion: 7 })

    const second = queueOutgoing({ document: OPEN, text: 'second', state: first.state })
    const latest = queueOutgoing({ document: OPEN, text: 'latest', state: second.state })
    expect(second.decision).toEqual({ kind: 'hold', reason: 'in-flight' })
    expect(latest.state.pendingText).toBe('latest')

    const accepted = acceptOutgoing({
      document: { ...OPEN, version: 8 },
      state: latest.state,
    })
    expect(accepted.decision).toEqual({ kind: 'post', text: 'latest', baseVersion: 8 })
    expect(accepted.state).toEqual({
      settledText: 'latest',
      inFlight: true,
      pendingText: null,
    })
  })

  it('does not resend when the latest serialization reverted to the accepted text', () => {
    const first = queueOutgoing({ document: OPEN, text: 'first', state: EMPTY_OUTGOING_QUEUE })
    const changed = queueOutgoing({ document: OPEN, text: 'second', state: first.state })
    const reverted = queueOutgoing({ document: OPEN, text: 'first', state: changed.state })

    const accepted = acceptOutgoing({
      document: { ...OPEN, version: 8 },
      state: reverted.state,
    })
    expect(accepted.decision).toEqual({ kind: 'hold', reason: 'unchanged' })
    expect(accepted.state).toEqual({
      settledText: 'first',
      inFlight: false,
      pendingText: null,
    })
  })

  it('retains a failed offer and retries it against the unchanged host version', () => {
    const offered = queueOutgoing({ document: OPEN, text: 'complete edit', state: EMPTY_OUTGOING_QUEUE })
    const failed = failOutgoing(offered.state)
    expect(failed).toEqual({ settledText: null, inFlight: false, pendingText: 'complete edit' })

    const retried = retryOutgoing({ document: OPEN, state: failed })
    expect(retried.decision).toEqual({ kind: 'post', text: 'complete edit', baseVersion: 7 })
    expect(retried.state).toEqual({ settledText: 'complete edit', inFlight: true, pendingText: null })
  })

  it('retries the newest pending document after a failed earlier offer', () => {
    const offered = queueOutgoing({ document: OPEN, text: 'earlier', state: EMPTY_OUTGOING_QUEUE })
    const pending = queueOutgoing({ document: OPEN, text: 'newest', state: offered.state })
    const retried = retryOutgoing({ document: OPEN, state: failOutgoing(pending.state) })
    expect(retried.decision).toEqual({ kind: 'post', text: 'newest', baseVersion: 7 })
  })
})

describe('a debounced canvas write at cleanup', () => {
  it('flushes the pending action exactly once instead of dropping it', () => {
    vi.useFakeTimers()
    try {
      const action = vi.fn()
      const debounce = createFlushableDebounce(action, 250)
      debounce.trigger()

      debounce.flush()
      expect(action).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(250)
      expect(action).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces rapid triggers into one latest-state action', () => {
    vi.useFakeTimers()
    try {
      const action = vi.fn()
      const debounce = createFlushableDebounce(action, 250)
      debounce.trigger()
      vi.advanceTimersByTime(200)
      debounce.trigger()
      vi.advanceTimersByTime(249)
      expect(action).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(action).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('async serialization preserves edit order without overlapping work', () => {
  it('discards an active stale result and coalesces every change behind it', async () => {
    const older = deferred<string>()
    const newer = deferred<string>()
    const tasks = [older.promise, newer.promise]
    const accepted: string[] = []
    const failed: unknown[] = []
    let active = 0
    let maxActive = 0
    let calls = 0
    const run = createCoalescingAsyncRunner(
      async () => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        try {
          return await tasks.shift()!
        } finally {
          active -= 1
        }
      },
      (value) => accepted.push(value),
      (cause) => failed.push(cause),
    )

    run()
    await Promise.resolve()
    run()
    run()
    expect(calls).toBe(1)
    older.resolve('stale snapshot')
    await older.promise
    await Promise.resolve()
    expect(calls).toBe(2)
    newer.resolve('newest snapshot')
    await newer.promise
    await Promise.resolve()

    expect(accepted).toEqual(['newest snapshot'])
    expect(failed).toEqual([])
    expect(maxActive).toBe(1)
  })

  it('ignores a stale failure and still runs the one requested replacement', async () => {
    const older = deferred<string>()
    const newer = deferred<string>()
    const tasks = [older.promise, newer.promise]
    const accepted: string[] = []
    const failed: unknown[] = []
    const run = createCoalescingAsyncRunner(
      () => tasks.shift()!,
      (value) => accepted.push(value),
      (cause) => failed.push(cause),
    )

    run()
    await Promise.resolve()
    run()
    older.reject(new Error('stale failure'))
    await expect(older.promise).rejects.toThrow('stale failure')
    await Promise.resolve()
    newer.resolve('newest snapshot')
    await newer.promise
    await Promise.resolve()

    expect(accepted).toEqual(['newest snapshot'])
    expect(failed).toEqual([])
  })
})

describe('an IDE webview lifecycle boundary flushes cached text', () => {
  it('flushes on hidden, beforeunload, and pagehide, then removes listeners', () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState }
    documentTarget.visibilityState = 'visible'
    const flush = vi.fn()
    const stop = installEmbeddedLifecycleFlush({
      windowTarget,
      documentTarget,
      flush,
    })

    documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(flush).not.toHaveBeenCalled()
    documentTarget.visibilityState = 'hidden'
    documentTarget.dispatchEvent(new Event('visibilitychange'))
    windowTarget.dispatchEvent(new Event('beforeunload'))
    windowTarget.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(3)

    stop()
    windowTarget.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(3)
  })
})

describe('replacing the canvas is explained, except when it is routine', () => {
  it('says so when an edit was overtaken', () => {
    expect(externalChangeMessage('stale-change')).toMatch(/did not land|before this edit landed/)
  })

  it('says so when the host could not write', () => {
    expect(externalChangeMessage('write-failed')).toMatch(/could not write/)
  })

  it('stays silent when the file simply changed elsewhere', () => {
    expect(externalChangeMessage('source-edit')).toBeNull()
  })
})
