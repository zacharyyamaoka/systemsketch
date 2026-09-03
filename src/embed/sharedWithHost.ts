/**
 * The only surface an IDE host is allowed to import from the app.
 *
 * A host extension lives in a different runtime (Node, not the browser) and is
 * bundled separately, so anything it reaches into becomes a second, invisible
 * build of that code. Keeping the list here — and keeping every module behind
 * it free of React, tldraw and the DOM — is what stops "the extension shares
 * the app's format rules" from quietly becoming "the extension has its own".
 *
 * If a host needs something that is not exported here, the right move is to
 * make that thing pure and add it, not to deep-import past this file.
 */

export type {
  EmbedAcceptedMessage,
  EmbedAppearanceMessage,
  EmbedCheckpointMessage,
  EmbedCheckpointSettledMessage,
  EmbedChangeMessage,
  EmbedCompatibilityCopyRequest,
  EmbedErrorMessage,
  EmbedExternalChangeMessage,
  EmbedHostErrorMessage,
  EmbedHostBridge,
  EmbedOpenMessage,
  EmbedReadyMessage,
  EmbedRecoveryCheckpoint,
  EmbedToHostMessage,
  HostToEmbedMessage,
} from './embedProtocol'
export { EMBED_HOST_KEY } from './embedProtocol'

export {
  createCompatibilityCopyText,
  decodeDocumentText,
  documentEncoding,
  documentSuffix,
  documentTitle,
  encodeDocumentText,
  isBlankDocument,
  newerDocumentVersion,
  systemSketchManifest,
  DOCUMENT_SUFFIXES,
  SYSTEMSKETCH_ENVELOPE_KEY,
  SYSTEMSKETCH_SUFFIX,
  TLDRAW_SUFFIX,
  type DocumentSuffix,
  type NewerDocumentVersion,
  type SystemSketchManifest,
} from './sketchDocument'
