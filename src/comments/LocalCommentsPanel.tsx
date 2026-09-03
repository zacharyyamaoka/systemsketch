import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useValue, type Editor, type TLCommentThreadId } from 'tldraw'
import {
  createLocalCommentThread,
  deleteLocalCommentThread,
  deriveCommentAnchor,
  formatSourceReference,
  getLocalCommentThreads,
  LOCAL_COMMENT_AUTHOR,
  parseSourceReferenceInput,
  replyToLocalCommentThread,
  revealLocalCommentThread,
  setLocalCommentThreadResolved,
  type LocalCommentAuthor,
  type LocalCommentThreadView,
} from './commentModel'
import './comments.css'

export interface LocalCommentsPanelProps {
  editor: Editor
  readOnly?: boolean
  author?: LocalCommentAuthor
}

function submitOnModEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
  event.preventDefault()
  event.currentTarget.form?.requestSubmit()
}

function CommentThreadCard({
  editor,
  thread,
  readOnly,
  author,
}: {
  editor: Editor
  thread: LocalCommentThreadView
  readOnly: boolean
  author: LocalCommentAuthor
}) {
  const [reply, setReply] = useState('')
  const [copied, setCopied] = useState(false)
  const replyId = useId()

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || !replyToLocalCommentThread(editor, thread.record.id, reply, author)) return
    setReply('')
  }

  async function copySource() {
    if (!thread.source) return
    const value = formatSourceReference(thread.source)
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article
      id={localCommentThreadDomId(thread.record.id)}
      className="systemsketch-comments__thread"
      data-resolved={thread.record.resolved ? true : undefined}
      data-testid={`systemsketch-comment-thread-${thread.record.id}`}
    >
      <header className="systemsketch-comments__thread-header">
        <button
          type="button"
          className="systemsketch-comments__anchor"
          data-missing={!thread.targetExists || undefined}
          onClick={() => revealLocalCommentThread(editor, thread.record)}
          title="Reveal this comment on the board"
        >
          <span aria-hidden="true">⌖</span>
          <span>{thread.anchorLabel}</span>
        </button>
        <span className="systemsketch-comments__status">
          {thread.record.resolved ? 'Resolved' : 'Open'}
        </span>
      </header>

      {thread.source ? (
        <button
          type="button"
          className="systemsketch-comments__source"
          onClick={() => void copySource()}
          title="Copy Python source reference"
          aria-label={`Copy source reference ${formatSourceReference(thread.source)}`}
        >
          <span aria-hidden="true">{copied ? '✓' : '⌘'}</span>
          <code>{formatSourceReference(thread.source)}</code>
        </button>
      ) : null}

      <ol className="systemsketch-comments__messages" aria-label="Comment messages">
        {thread.comments.map((comment) => (
          <li key={comment.record.id}>
            <span className="systemsketch-comments__avatar" aria-hidden="true">
              {comment.authorLabel.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{comment.authorLabel}</strong>
              <time dateTime={new Date(comment.record.createdAt).toISOString()}>
                {new Date(comment.record.createdAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
              <p>{comment.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {!readOnly && !thread.record.resolved ? (
        <form className="systemsketch-comments__reply" onSubmit={submitReply}>
          <label htmlFor={replyId}>Reply</label>
          <textarea
            id={replyId}
            value={reply}
            rows={2}
            maxLength={4_000}
            placeholder="Reply…"
            onChange={(event) => setReply(event.currentTarget.value)}
            onKeyDown={submitOnModEnter}
          />
          <button type="submit" disabled={!reply.trim()}>Reply</button>
        </form>
      ) : null}

      {!readOnly ? (
        <footer className="systemsketch-comments__thread-actions">
          <button
            type="button"
            onClick={() => setLocalCommentThreadResolved(
              editor,
              thread.record.id,
              !thread.record.resolved,
              author,
            )}
          >
            {thread.record.resolved ? 'Reopen' : 'Resolve'}
          </button>
          <button
            type="button"
            className="systemsketch-comments__delete"
            onClick={() => {
              if (window.confirm('Delete this comment thread?')) {
                deleteLocalCommentThread(editor, thread.record.id)
              }
            }}
          >
            Delete
          </button>
        </footer>
      ) : null}
    </article>
  )
}

export function LocalCommentsPanel({
  editor,
  readOnly = false,
  author = LOCAL_COMMENT_AUTHOR,
}: LocalCommentsPanelProps) {
  const [body, setBody] = useState('')
  const [sourceInput, setSourceInput] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const bodyId = useId()
  const sourceId = useId()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const model = useValue(
    'SystemSketch local comments',
    () => ({
      threads: getLocalCommentThreads(editor, author),
      anchor: deriveCommentAnchor(editor),
      editorReadOnly: editor.getIsReadonly(),
    }),
    [editor, author.id, author.name],
  )
  const visibleThreads = useMemo(
    () => model.threads.filter((thread) => showResolved || !thread.record.resolved),
    [model.threads, showResolved],
  )
  const resolvedCount = model.threads.filter((thread) => thread.record.resolved).length
  const isReadOnly = readOnly || model.editorReadOnly
  const anchorHint = model.anchor.type === 'shape'
    ? 'Anchored to the selected shape'
    : model.anchor.type === 'point'
      ? 'Anchored to the centre of the current view'
      : 'Anchored to the board'

  function submitThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isReadOnly) return
    const source = parseSourceReferenceInput(sourceInput)
    const created = createLocalCommentThread(editor, { body, author, source })
    if (!created) return
    setBody('')
    setSourceInput('')
    bodyRef.current?.focus()
  }

  return (
    <section className="systemsketch-comments" data-testid="systemsketch-comments-panel">
      <header className="systemsketch-comments__heading">
        <div>
          <strong>Comments</strong>
          <span>{model.threads.filter((thread) => !thread.record.resolved).length} open</span>
        </div>
        {resolvedCount > 0 ? (
          <label className="systemsketch-comments__resolved-toggle">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(event) => setShowResolved(event.currentTarget.checked)}
            />
            Show resolved ({resolvedCount})
          </label>
        ) : null}
      </header>

      {isReadOnly ? (
        <p className="systemsketch-comments__readonly" role="status">
          This board is read-only. Existing comments can still be revealed.
        </p>
      ) : (
        <form className="systemsketch-comments__composer" onSubmit={submitThread}>
          <label htmlFor={bodyId}>New comment</label>
          <textarea
            ref={bodyRef}
            id={bodyId}
            value={body}
            rows={3}
            maxLength={4_000}
            placeholder="Leave a comment…"
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={submitOnModEnter}
          />
          <span className="systemsketch-comments__anchor-hint">{anchorHint}</span>
          <label htmlFor={sourceId}>Python source (optional)</label>
          <input
            id={sourceId}
            value={sourceInput}
            placeholder="src/pipeline.py:24-31#build"
            spellCheck={false}
            onChange={(event) => setSourceInput(event.currentTarget.value)}
          />
          <div className="systemsketch-comments__compose-actions">
            <span>⌘/Ctrl + Enter</span>
            <button type="submit" disabled={!body.trim()}>Comment</button>
          </div>
        </form>
      )}

      <div className="systemsketch-comments__list" aria-live="polite">
        {visibleThreads.map((thread) => (
          <CommentThreadCard
            key={thread.record.id}
            editor={editor}
            thread={thread}
            readOnly={isReadOnly}
            author={author}
          />
        ))}
        {visibleThreads.length === 0 ? (
          <div className="systemsketch-comments__empty">
            <span aria-hidden="true">◌</span>
            <strong>{model.threads.length ? 'No open comments' : 'No comments yet'}</strong>
            <p>
              {model.threads.length
                ? 'Turn on Show resolved to revisit earlier threads.'
                : 'Select a Block to anchor a thread, or leave a pin at the centre of this view.'}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** Useful to integrations that want to open or highlight a particular thread. */
export function localCommentThreadDomId(threadId: TLCommentThreadId) {
  return `systemsketch-comment-thread-${threadId}`
}
