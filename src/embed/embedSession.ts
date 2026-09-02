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
