import {
  commentSchemaRecords,
  createComment,
  createCommentThread,
  renderPlaintextFromRichText,
  toRichText,
  type Editor,
  type TLComment,
  type TLCommentAnchor,
  type TLCommentId,
  type TLCommentThread,
  type TLCommentThreadId,
  type TLPageId,
  type TLShape,
} from 'tldraw'

/**
 * tldraw's public, opt-in comment record definitions. Pass this object to
 * `createTLStore({ records })` for every store that may open a SystemSketch
 * document. Pinned tldraw 5.3.2 does not forward a `records` prop from its
 * convenience React component into its internally-created store.
 */
export const SYSTEMSKETCH_COMMENT_RECORDS = commentSchemaRecords

export const LOCAL_COMMENT_AUTHOR = {
  id: 'systemsketch:local-author',
  name: 'You',
} as const

const SOURCE_META_KEY = 'systemSketchSource'
const CAMERA_ANIMATION = { duration: 220 }

/**
 * A source location is navigation metadata, not the durable identity of a
 * comment. The shape anchor remains canonical because Python line numbers can
 * move independently of the board.
 */
export interface CommentSourceReference {
  path: string
  symbol?: string
  startLine?: number
  endLine?: number
  digest?: string
}

export interface LocalCommentAuthor {
  id: string
  name: string
}

export interface LocalCommentView {
  record: TLComment
  body: string
  authorLabel: string
}

export interface LocalCommentThreadView {
  record: TLCommentThread
  comments: LocalCommentView[]
  source: CommentSourceReference | null
  anchorLabel: string
  targetExists: boolean
}

export interface CreateLocalCommentOptions {
  body: string
  author?: LocalCommentAuthor
  source?: CommentSourceReference | null
  anchor?: TLCommentAnchor
  /** Used for a point anchor when no single shape is selected. */
  pagePoint?: { x: number; y: number }
  now?: number
}

type CommentRecord = TLCommentThread | TLComment

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeSourceReference(value: unknown): CommentSourceReference | null {
  if (!isObject(value) || typeof value.path !== 'string') return null
  const path = value.path.trim()
  if (!path) return null

  const normalized: CommentSourceReference = { path }
  if (typeof value.symbol === 'string' && value.symbol.trim()) {
    normalized.symbol = value.symbol.trim()
  }
  if (Number.isInteger(value.startLine) && Number(value.startLine) > 0) {
    normalized.startLine = Number(value.startLine)
  }
  if (
    normalized.startLine !== undefined
    && Number.isInteger(value.endLine)
    && Number(value.endLine) > 0
  ) {
    normalized.endLine = Number(value.endLine)
  }
  if (
    normalized.startLine !== undefined
    && normalized.endLine !== undefined
    && normalized.endLine < normalized.startLine
  ) {
    normalized.endLine = normalized.startLine
  }
  if (typeof value.digest === 'string' && value.digest.trim()) {
    normalized.digest = value.digest.trim()
  }
  return normalized
}

export function sourceReferenceFromMeta(meta: unknown): CommentSourceReference | null {
  if (!isObject(meta)) return null
  return normalizeSourceReference(meta[SOURCE_META_KEY])
}

export function sourceReferenceMeta(source?: CommentSourceReference | null): TLCommentThread['meta'] {
  const normalized = normalizeSourceReference(source)
  if (!normalized) return {}
  const stored: Record<string, string | number> = { path: normalized.path }
  if (normalized.symbol !== undefined) stored.symbol = normalized.symbol
  if (normalized.startLine !== undefined) stored.startLine = normalized.startLine
  if (normalized.endLine !== undefined) stored.endLine = normalized.endLine
  if (normalized.digest !== undefined) stored.digest = normalized.digest
  return { [SOURCE_META_KEY]: stored }
}

/**
 * Accepts `path.py`, `path.py:12`, `path.py:12-18`, and any of those followed
 * by `#qualified.symbol`. A colon in a directory name is kept unless the
 * suffix is an all-numeric line range.
 */
export function parseSourceReferenceInput(input: string): CommentSourceReference | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const hashIndex = trimmed.lastIndexOf('#')
  const location = hashIndex >= 0 ? trimmed.slice(0, hashIndex).trim() : trimmed
  const symbol = hashIndex >= 0 ? trimmed.slice(hashIndex + 1).trim() : ''
  if (!location) return null

  const lineMatch = location.match(/^(.*?):(\d+)(?:-(\d+))?$/)
  const path = (lineMatch?.[1] ?? location).trim()
  if (!path) return null

  return normalizeSourceReference({
    path,
    ...(lineMatch ? { startLine: Number(lineMatch[2]) } : {}),
    ...(lineMatch?.[3] ? { endLine: Number(lineMatch[3]) } : {}),
    ...(symbol ? { symbol } : {}),
  })
}

export function formatSourceReference(source: CommentSourceReference): string {
  const normalized = normalizeSourceReference(source)
  if (!normalized) return ''
  const lines = normalized.startLine === undefined
    ? ''
    : normalized.endLine !== undefined && normalized.endLine !== normalized.startLine
      ? `:${normalized.startLine}-${normalized.endLine}`
      : `:${normalized.startLine}`
  const symbol = normalized.symbol ? `#${normalized.symbol}` : ''
  return `${normalized.path}${lines}${symbol}`
}

function isThreadRecord(record: unknown): record is TLCommentThread {
  return isObject(record) && record.typeName === 'comment-thread'
}

function isCommentRecord(record: unknown): record is TLComment {
  return isObject(record) && record.typeName === 'comment'
}

function allCommentRecords(editor: Editor): CommentRecord[] {
  return (editor.store.allRecords() as unknown[]).filter(
    (record): record is CommentRecord => isThreadRecord(record) || isCommentRecord(record),
  )
}

function getCommentRecord(editor: Editor, id: string): unknown {
  return (editor.store as unknown as { get(recordId: string): unknown }).get(id)
}

function shapeLabel(editor: Editor, shape: TLShape): string {
  try {
    const text = editor.getShapeUtil(shape).getText(shape)?.trim()
    if (text) return text
  } catch {
    // A custom shape may not expose a text adapter. Its type is still useful.
  }
  return shape.type === 'block' ? 'Block' : shape.type
}

export function describeCommentAnchor(
  editor: Editor,
  thread: TLCommentThread,
): { label: string; targetExists: boolean } {
  const page = editor.getPage(thread.pageId)
  const pageName = page?.name.trim() || 'Untitled page'
  const anchor = thread.anchor
  if (anchor.type === 'shape') {
    const shape = editor.getShape(anchor.shapeId)
    return shape
      ? { label: `${shapeLabel(editor, shape)} · ${pageName}`, targetExists: true }
      : { label: `Missing shape · ${pageName}`, targetExists: false }
  }
  if (anchor.type === 'point') return { label: `Canvas point · ${pageName}`, targetExists: true }
  if (anchor.type === 'region') return { label: `Canvas region · ${pageName}`, targetExists: true }
  return { label: `Page · ${pageName}`, targetExists: Boolean(page) }
}

/** A live read projection; comment records remain the single source of truth. */
export function getLocalCommentThreads(
  editor: Editor,
  author: LocalCommentAuthor = LOCAL_COMMENT_AUTHOR,
): LocalCommentThreadView[] {
  const records = allCommentRecords(editor)
  const comments = records.filter(isCommentRecord).filter((comment) => !comment.isDeleted)
  return records
    .filter(isThreadRecord)
    .filter((thread) => !thread.isDeleted)
    .map((thread) => {
      const anchor = describeCommentAnchor(editor, thread)
      return {
        record: thread,
        comments: comments
          .filter((comment) => comment.threadId === thread.id)
          .sort((a, b) => a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)))
          .map((comment) => ({
            record: comment,
            body: renderPlaintextFromRichText(editor, comment.body),
            authorLabel: comment.authorId === author.id ? author.name : comment.authorId,
          })),
        source: sourceReferenceFromMeta(thread.meta),
        anchorLabel: anchor.label,
        targetExists: anchor.targetExists,
      }
    })
    .sort((a, b) => {
      if (Boolean(a.record.resolved) !== Boolean(b.record.resolved)) {
        return a.record.resolved ? 1 : -1
      }
      const aLatest = a.comments.at(-1)?.record.createdAt ?? a.record.createdAt
      const bLatest = b.comments.at(-1)?.record.createdAt ?? b.record.createdAt
      return bLatest - aLatest || String(a.record.id).localeCompare(String(b.record.id))
    })
}

export function deriveCommentAnchor(
  editor: Editor,
  pagePoint?: { x: number; y: number },
): TLCommentAnchor {
  const selection = editor.getSelectedShapes()
  if (selection.length === 1) {
    return {
      type: 'shape',
      shapeId: selection[0].id,
      x: 1,
      y: 0,
      isPrecise: false,
    }
  }
  const center = pagePoint ?? editor.getViewportPageBounds().center
  return { type: 'point', x: center.x, y: center.y }
}

function putCommentRecords(editor: Editor, records: CommentRecord[]) {
  editor.run(() => {
    // Editor is intentionally typed around tldraw's core record union. These
    // official opt-in records are accepted once commentSchemaRecords is passed
    // to `createTLStore({ records })` for the editor's store.
    ;(editor.store as unknown as { put(records: CommentRecord[]): void }).put(records)
  }, { history: 'ignore' })
}

export function createLocalCommentThread(
  editor: Editor,
  options: CreateLocalCommentOptions,
): TLCommentThreadId | null {
  const body = options.body.trim()
  if (!body) return null
  const author = options.author ?? LOCAL_COMMENT_AUTHOR
  const now = options.now ?? Date.now()
  const thread = createCommentThread({
    pageId: editor.getCurrentPageId(),
    anchor: options.anchor ?? deriveCommentAnchor(editor, options.pagePoint),
    createdBy: author.id,
    now,
    meta: sourceReferenceMeta(options.source),
  })
  const comment = createComment({
    threadId: thread.id,
    pageId: thread.pageId,
    authorId: author.id,
    body: toRichText(body),
    now,
  })
  putCommentRecords(editor, [thread, comment])
  return thread.id
}

export function replyToLocalCommentThread(
  editor: Editor,
  threadId: TLCommentThreadId,
  bodyInput: string,
  author: LocalCommentAuthor = LOCAL_COMMENT_AUTHOR,
  now = Date.now(),
): TLCommentId | null {
  const body = bodyInput.trim()
  const thread = getCommentRecord(editor, threadId)
  if (!body || !isThreadRecord(thread) || thread.isDeleted) return null
  const comment = createComment({
    threadId,
    pageId: thread.pageId,
    authorId: author.id,
    body: toRichText(body),
    now,
  })
  putCommentRecords(editor, [comment])
  return comment.id
}

export function setLocalCommentThreadResolved(
  editor: Editor,
  threadId: TLCommentThreadId,
  resolved: boolean,
  author: LocalCommentAuthor = LOCAL_COMMENT_AUTHOR,
  now = Date.now(),
): boolean {
  const thread = getCommentRecord(editor, threadId)
  if (!isThreadRecord(thread) || thread.isDeleted) return false
  putCommentRecords(editor, [{
    ...thread,
    resolved: resolved ? { at: now, by: author.id } : null,
  }])
  return true
}

export function deleteLocalCommentThread(editor: Editor, threadId: TLCommentThreadId): boolean {
  const records = allCommentRecords(editor)
  const thread = records.find(
    (record): record is TLCommentThread => isThreadRecord(record) && record.id === threadId,
  )
  if (!thread || thread.isDeleted) return false
  const messages = records.filter(
    (record): record is TLComment => isCommentRecord(record) && record.threadId === threadId,
  )
  putCommentRecords(editor, [
    { ...thread, isDeleted: true },
    ...messages.filter((comment) => !comment.isDeleted).map((comment) => ({
      ...comment,
      isDeleted: true,
    })),
  ])
  return true
}

export function deleteLocalComment(editor: Editor, commentId: TLCommentId): boolean {
  const comment = getCommentRecord(editor, commentId)
  if (!isCommentRecord(comment) || comment.isDeleted) return false
  putCommentRecords(editor, [{ ...comment, isDeleted: true }])
  return true
}

export function revealLocalCommentThread(editor: Editor, thread: TLCommentThread): boolean {
  const page = editor.getPage(thread.pageId)
  if (!page) return false
  editor.setCurrentPage(thread.pageId)
  editor.setCurrentTool('select')
  const anchor = thread.anchor
  if (anchor.type === 'shape') {
    const bounds = editor.getShapePageBounds(anchor.shapeId)
    if (!bounds) return false
    editor.select(anchor.shapeId)
    editor.zoomToBounds(bounds, { inset: 72, animation: CAMERA_ANIMATION })
    return true
  }
  editor.selectNone()
  if (anchor.type === 'point') {
    editor.zoomToBounds(
      { x: anchor.x - 100, y: anchor.y - 100, w: 200, h: 200 },
      { inset: 72, animation: CAMERA_ANIMATION },
    )
    return true
  }
  if (anchor.type === 'region') {
    editor.zoomToBounds(anchor, { inset: 72, animation: CAMERA_ANIMATION })
    return true
  }
  editor.zoomToFit({ animation: CAMERA_ANIMATION })
  return true
}
