/**
 * The rules an embedded editing session follows, with no React and no tldraw.
 *
 * All of it is about one hazard: two writers on one file. The host's text and
 * the canvas's text are the same document reached from two directions, and the
 * only thing keeping them from overwriting each other is the host's version
 * counter. Keeping that logic here — pure, and tested against invented
 * versions rather than a live IDE — is what makes it checkable at all.
 */

export interface EmbeddedDocument {
  path: string
  /** The host's version the canvas is currently showing. */
  version: number
  readOnly: boolean
}

/** What to do with a serialized canvas that is ready to leave. */
export type OutgoingDecision =
  | { kind: 'post'; text: string; baseVersion: number }
  | { kind: 'hold'; reason: 'read-only' | 'in-flight' | 'unchanged' | 'no-document' }

/**
 * The complete write-side state for one open embedded document.
 *
 * `pendingText` is deliberately one slot rather than a queue. Every canvas
 * serialization is a complete document, so only the newest value matters
 * while the host is landing the previous one.
 */
export interface OutgoingQueueState {
  /** The last text the host is known to hold, or has been offered. */
  settledText: string | null
  inFlight: boolean
  /** The newest complete serialization produced while a write is in flight. */
  pendingText: string | null
}

export const EMPTY_OUTGOING_QUEUE: OutgoingQueueState = {
  settledText: null,
  inFlight: false,
  pendingText: null,
}

export interface OutgoingQueueTransition {
  state: OutgoingQueueState
  decision: OutgoingDecision | null
}

/**
 * Whether a freshly serialized canvas should be offered to the host.
 *
 * One edit is in flight at a time. That is not throttling for its own sake:
 * the host answers with the version it landed, and a second offer sent against
 * the same base version before that answer arrives is precisely the write that
 * would be refused as stale.
 */
export function decideOutgoing(input: {
  document: EmbeddedDocument | null
  text: string
  /** The last text the host is known to hold, or has been offered. */
  settledText: string | null
  inFlight: boolean
}): OutgoingDecision {
  if (input.document === null) return { kind: 'hold', reason: 'no-document' }
  if (input.document.readOnly) return { kind: 'hold', reason: 'read-only' }
  if (input.inFlight) return { kind: 'hold', reason: 'in-flight' }
  if (input.settledText !== null && input.text === input.settledText) {
    return { kind: 'hold', reason: 'unchanged' }
  }
  return { kind: 'post', text: input.text, baseVersion: input.document.version }
}

/**
 * Offer a complete serialization to the one-write-at-a-time host channel.
 *
 * When the channel is busy, replacing `pendingText` is lossless: the newer
 * serialization already contains every earlier canvas change. Once the host
 * accepts the in-flight value, {@link acceptOutgoing} offers this latest one
 * against the newly accepted version.
 */
export function queueOutgoing(input: {
  document: EmbeddedDocument | null
  text: string
  state: OutgoingQueueState
}): OutgoingQueueTransition {
  const decision = decideOutgoing({
    document: input.document,
    text: input.text,
    settledText: input.state.settledText,
    inFlight: input.state.inFlight,
  })
  if (decision.kind === 'post') {
    return {
      state: {
        settledText: decision.text,
        inFlight: true,
        pendingText: null,
      },
      decision,
    }
  }
  if (decision.reason === 'in-flight') {
    return {
      state: { ...input.state, pendingText: input.text },
      decision,
    }
  }
  return { state: input.state, decision }
}

/**
 * Advance the channel after the host has accepted the one in-flight write.
 * `document` must carry the accepted host version.
 */
export function acceptOutgoing(input: {
  document: EmbeddedDocument | null
  state: OutgoingQueueState
}): OutgoingQueueTransition {
  const pendingText = input.state.pendingText
  const available: OutgoingQueueState = {
    ...input.state,
    inFlight: false,
    pendingText: null,
  }
  if (pendingText === null) return { state: available, decision: null }
  return queueOutgoing({ document: input.document, text: pendingText, state: available })
}

/**
 * Preserve the newest complete document after a host-side write failure.
 *
 * The offered text is not settled merely because it left the webview. Moving
 * it back to `pendingText` makes an explicit retry possible and ensures the
 * next genuine canvas edit is not compared against bytes the host never held.
 */
export function failOutgoing(state: OutgoingQueueState): OutgoingQueueState {
  return {
    settledText: null,
    inFlight: false,
    pendingText: state.pendingText ?? state.settledText,
  }
}

/** Retry the document retained by {@link failOutgoing}. */
export function retryOutgoing(input: {
  document: EmbeddedDocument | null
  state: OutgoingQueueState
}): OutgoingQueueTransition {
  const text = input.state.pendingText
  if (text === null) return { state: input.state, decision: null }
  const available: OutgoingQueueState = {
    settledText: null,
    inFlight: false,
    pendingText: null,
  }
  const transition = queueOutgoing({ document: input.document, text, state: available })
  if (transition.decision?.kind === 'hold') {
    return { state: input.state, decision: transition.decision }
  }
  return transition
}

export interface FlushableDebounce {
  /** Delay the action, restarting the debounce window if already pending. */
  trigger(): void
  /** Run a pending action now. A subsequent timer cannot run it twice. */
  flush(): void
  /** Deliberately discard a pending action. */
  cancel(): void
}

/**
 * Keep at most one whole-document task active and coalesce changes behind it.
 *
 * tldraw's serializer may fetch every external asset, so merely discarding
 * stale Promise results would still launch a network/CPU storm during a drag.
 * A request received while work is active marks that result stale and asks for
 * exactly one fresh run afterward. Only the newest complete result is accepted.
 */
export function createCoalescingAsyncRunner<T>(
  task: () => Promise<T>,
  accept: (value: T) => void,
  reject: (cause: unknown) => void,
): () => void {
  let running = false
  let rerun = false

  const run = async () => {
    running = true
    do {
      rerun = false
      try {
        const value = await task()
        if (!rerun) accept(value)
      } catch (cause) {
        if (!rerun) reject(cause)
      }
    } while (rerun)
    running = false
  }

  return () => {
    if (running) {
      rerun = true
      return
    }
    void run()
  }
}

export interface EmbeddedLifecycleFlushOptions {
  windowTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  documentTarget: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  flush(): void
}

/** Run the owner’s synchronous checkpoint/flush boundary before a webview disappears. */
export function installEmbeddedLifecycleFlush({
  windowTarget,
  documentTarget,
  flush,
}: EmbeddedLifecycleFlushOptions): () => void {
  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === 'hidden') flush()
  }
  windowTarget.addEventListener('beforeunload', flush)
  windowTarget.addEventListener('pagehide', flush)
  documentTarget.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    windowTarget.removeEventListener('beforeunload', flush)
    windowTarget.removeEventListener('pagehide', flush)
    documentTarget.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/**
 * A debounce whose owner can flush pending work during cleanup.
 *
 * Canvas teardown is a save boundary: clearing a timer there silently loses
 * the last pause-less gesture. Keeping this small primitive independent of
 * React and tldraw makes that lifecycle rule directly regression-testable.
 */
export function createFlushableDebounce(action: () => void, delayMs: number): FlushableDebounce {
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  let pending = false

  const run = () => {
    if (!pending) return
    pending = false
    timer = null
    action()
  }

  return {
    trigger() {
      pending = true
      if (timer !== null) globalThis.clearTimeout(timer)
      timer = globalThis.setTimeout(run, delayMs)
    },
    flush() {
      if (timer !== null) globalThis.clearTimeout(timer)
      run()
    },
    cancel() {
      if (timer !== null) globalThis.clearTimeout(timer)
      timer = null
      pending = false
    },
  }
}

/**
 * How a host explains itself when it replaces the canvas under an edit.
 *
 * Silence is the wrong answer here — an edit that did not land has to say so,
 * or the next thing the person draws is drawn on top of a lie.
 */
export function externalChangeMessage(
  reason: 'source-edit' | 'stale-change' | 'write-failed',
): string | null {
  if (reason === 'stale-change') {
    return 'The file changed before this edit landed. The canvas reloaded the newer document.'
  }
  if (reason === 'write-failed') {
    return 'The editor could not write this edit to the file. The canvas reloaded what is on disk.'
  }
  return null
}
