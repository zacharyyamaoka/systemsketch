/**
 * The one channel between SystemSketch and an IDE that hosts it.
 *
 * SystemSketch does not know what VS Code, Cursor or Obsidian are. It knows
 * that *something* may have put a bridge on `window` before the bundle ran; if
 * it did, the document arrives over this channel instead of from the local
 * workspace controller, and every edit leaves the same way. That is the whole
 * seam — no host SDK is imported here, and nothing below `src/embed/` imports
 * anything from a host.
 *
 * The host owns the file. It decides what is open, whether it is writable,
 * when it is saved and what a dirty tab looks like. SystemSketch only ever
 * offers it new text and is told which version landed, which is why every
 * message carries the host's own monotonic `version`: a change posted against
 * a stale version is refused rather than silently overwriting a newer file.
 */

/** Where a host leaves its bridge. Read once, before React mounts. */
export const EMBED_HOST_KEY = '__systemSketchEmbedHost'

/** Sent once the document is on screen, so a host can stop showing a spinner. */
export interface EmbedReadyMessage {
  type: 'ready'
}

/** A canvas edit, offered to the host against the version it was made on. */
export interface EmbedChangeMessage {
  type: 'change'
  text: string
  baseVersion: number
}

/** SystemSketch failed at something the host should surface in its own UI. */
export interface EmbedErrorMessage {
  type: 'embed-error'
  message: string
}

export type EmbedToHostMessage = EmbedReadyMessage | EmbedChangeMessage | EmbedErrorMessage

/** The host handing over the file it opened. Arrives first, and on reload. */
export interface EmbedOpenMessage {
  type: 'open'
  /** The document's path. Its suffix — and only its suffix — picks the encoding. */
  path: string
  text: string
  version: number
  readOnly: boolean
}

/** The file changed underneath us: another editor, a checkout, a generator. */
export interface EmbedExternalChangeMessage {
  type: 'external-change'
  text: string
  version: number
  /** Why the host is replacing the canvas, in words a person can act on. */
  reason: 'source-edit' | 'stale-change' | 'write-failed'
}

/** The host took the offered text; this is the version it now holds. */
export interface EmbedAcceptedMessage {
  type: 'accepted'
  version: number
}

/** Something failed on the host's side of the bridge. */
export interface EmbedHostErrorMessage {
  type: 'host-error'
  message: string
}

/**
 * The host's light/dark choice, which the canvas follows.
 *
 * It is a message rather than a field on `open` because an IDE theme changes
 * while a file stays open, and because it keeps the host's own vocabulary —
 * class names, theme kinds, media queries — on the host's side of the bridge.
 */
export interface EmbedAppearanceMessage {
  type: 'appearance'
  colorScheme: 'light' | 'dark'
}

export type HostToEmbedMessage =
  | EmbedOpenMessage
  | EmbedExternalChangeMessage
  | EmbedAcceptedMessage
  | EmbedHostErrorMessage
  | EmbedAppearanceMessage

/** The object a host installs on `window` under {@link EMBED_HOST_KEY}. */
export interface EmbedHostBridge {
  post(message: EmbedToHostMessage): void
  /** How the host wants to be named in the canvas, e.g. `vscode`. */
  readonly host?: string
  /** Which SystemSketch build the host shipped, for an honest provenance line. */
  readonly build?: string
}

function bridgeCarrier(): Record<string, unknown> | null {
  return typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>)
}

/** The bridge this page was launched with, or `null` for the standalone app. */
export function readEmbedHostBridge(): EmbedHostBridge | null {
  const candidate = bridgeCarrier()?.[EMBED_HOST_KEY]
  if (typeof candidate !== 'object' || candidate === null) return null
  return typeof (candidate as EmbedHostBridge).post === 'function'
    ? (candidate as EmbedHostBridge)
    : null
}

/** Whether SystemSketch is running inside an IDE rather than as the app. */
export function isEmbedded(): boolean {
  return readEmbedHostBridge() !== null
}
