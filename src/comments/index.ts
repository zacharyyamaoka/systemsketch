export { LocalCommentsPanel, localCommentThreadDomId } from './LocalCommentsPanel'
export type { LocalCommentsPanelProps } from './LocalCommentsPanel'
export {
  createLocalCommentThread,
  deleteLocalComment,
  deleteLocalCommentThread,
  deriveCommentAnchor,
  describeCommentAnchor,
  formatSourceReference,
  getLocalCommentThreads,
  LOCAL_COMMENT_AUTHOR,
  normalizeSourceReference,
  parseSourceReferenceInput,
  replyToLocalCommentThread,
  revealLocalCommentThread,
  setLocalCommentThreadResolved,
  sourceReferenceFromMeta,
  sourceReferenceMeta,
  SYSTEMSKETCH_COMMENT_RECORDS,
} from './commentModel'
export type {
  CommentSourceReference,
  CreateLocalCommentOptions,
  LocalCommentAuthor,
  LocalCommentThreadView,
  LocalCommentView,
} from './commentModel'
