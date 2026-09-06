/**
 * The Drafts chip — top-left chrome, between the file identity and the
 * breadcrumb (see the insertion comment in `SystemSketchChrome.tsx`).
 *
 * A plain `<button>`, not `TldrawUiButton`: this control has to serve as a
 * Radix `Popover.Trigger`, and the trigger/child contract Radix relies on
 * (forwarding a ref and spreading its own a11y/event props onto one real DOM
 * node) is safest against a native element rather than a tldraw UI primitive
 * this repo has never asked to play that role. Everything else about its look
 * — height, separators, `--ss-*` tokens — matches the file-title chip beside
 * it (`local-workspace.css`/`systemsketch-chrome.css`) by hand instead.
 */
import * as Popover from '@radix-ui/react-popover'
import { GitBranch, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { relativeTime } from '../history/historyModel'
import { useDrafts } from './DraftProvider'
import type { DraftRecord } from './draftModel'
import './drafts.css'

/**
 * How long a rename input's own `mousedown` is swallowed after it mounts —
 * see the WHY on `InlineRename`'s `mountedAtRef` below. Same window and same
 * root cause as `DraftModeBar.tsx`'s `RENAME_MOUSEDOWN_GUARD_MS`: this app's
 * house rule is to fix a bug at every sibling site the pattern exists, not
 * only the reported one.
 */
const RENAME_MOUSEDOWN_GUARD_MS = 400

/** Same reasoning as `CompareDialog.tsx`'s `themeRoot()` — portal into the
 * ThemeRoot, not the body, so the `--ss-*` tokens it stamps still resolve. */
function themeRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return (document.querySelector('.systemsketch-theme-root') as HTMLElement | null) ?? undefined
}

/**
 * A row's rename control: click the pencil, edit inline, Enter commits,
 * Escape reverts. Kept local to this file rather than reusing
 * `SystemSketchUiInput` — that wrapper is built on tldraw's own
 * `TldrawUiInput`, and this popover already renders inside `<Tldraw>`'s tree
 * (it is the `MenuPanel` override), but a second consumer of the exact same
 * contract for one text field is not worth the coupling.
 */
function InlineRename({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit(next: string): void
  onCancel(): void
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const helpId = useId()
  // Same bug, same fix as `DraftModeBar.tsx`'s rename input: a habitual
  // double-click's second click lands on this freshly-mounted `<input>`
  // rather than the pencil button that opened it, which is a plain
  // click-inside-a-focused-input and collapses the just-made selection to a
  // caret. Recording the mount time and swallowing a `mousedown` within the
  // window keeps the selection intact for a rapid second click, while a
  // deliberate slow one still places a caret normally.
  const mountedAtRef = useRef(0)
  useEffect(() => {
    mountedAtRef.current = performance.now()
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed) {
      // A friendly message instead of a silent revert to the old name.
      setError('Give this draft a name.')
      window.requestAnimationFrame(() => inputRef.current?.focus())
      return
    }
    if (trimmed !== value) onCommit(trimmed)
    else onCancel()
  }, [draft, onCancel, onCommit, value])
  return (
    <div className="systemsketch-drafts-rename" data-error={error ? 'true' : undefined}>
      <input
        ref={inputRef}
        className="systemsketch-drafts-rename-input"
        value={draft}
        aria-label="Rename draft"
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        onChange={(event) => { setDraft(event.target.value); setError(null) }}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => {
          if (performance.now() - mountedAtRef.current < RENAME_MOUSEDOWN_GUARD_MS) event.preventDefault()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit() }
          else if (event.key === 'Escape') {
            event.preventDefault()
            // Radix's own dismissable-layer Escape handler also listens on
            // this popover — without this, Escape here closed the WHOLE
            // popover instead of just canceling the rename.
            event.stopPropagation()
            onCancel()
          }
        }}
        onBlur={commit}
      />
      <span id={helpId} className="systemsketch-drafts-rename-help">
        {error ?? 'Press Enter to rename, Escape to cancel'}
      </span>
    </div>
  )
}

function DraftRow({
  draft,
  isCurrent,
  onSelect,
}: {
  draft: DraftRecord
  isCurrent: boolean
  onSelect(): void
}) {
  const { renameDraftAction, discard, versions } = useDrafts()
  const [renaming, setRenaming] = useState(false)
  // Discard is a two-step confirm rather than a native/tldraw dialog: this
  // popover already renders inside `<Tldraw>`'s tree, but the same row markup
  // is the closest sibling `DraftModeBar`'s own overflow menu has, and that
  // component has no dialog stack of its own (it renders outside `<Tldraw>`,
  // pushing the canvas down rather than overlaying it). One local pattern
  // for both keeps "discard a draft" behaving identically everywhere it
  // appears, instead of a modal in one place and something else in the other.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const renameTriggerRef = useRef<HTMLButtonElement>(null)

  const closeRename = () => {
    setRenaming(false)
    // Parity with the file-title rename: focus returns to the control that
    // opened it (the pencil button) rather than wherever the input's own
    // unmount happens to leave it.
    window.requestAnimationFrame(() => renameTriggerRef.current?.focus())
  }

  // `versions` is always empty today — no version has ever been pinned — so
  // `draft.baseLabel` (derived from `currentVersionLabel`, see draftModel.ts)
  // is fabricated: every draft reads "based on v0.1" whether or not that
  // means anything. Show the truthful creation-time form until a version is
  // actually pinned; prefer the real label once one exists.
  const hasPinnedVersion = versions.length > 0
  const secondaryLabel = hasPinnedVersion
    ? `based on ${draft.baseLabel}`
    : `based on Main · ${relativeTime(draft.createdAt)}`

  return (
    <div className="systemsketch-drafts-row" data-current={isCurrent} data-testid={`systemsketch-drafts-row-${draft.id}`}>
      {renaming ? (
        <div className="systemsketch-drafts-row__main">
          <i aria-hidden="true" />
          <InlineRename
            value={draft.name}
            onCommit={(next) => { renameDraftAction(draft.id, next); closeRename() }}
            onCancel={closeRename}
          />
        </div>
      ) : (
        <button
          type="button"
          className="systemsketch-drafts-row__main"
          onClick={onSelect}
          data-testid={`systemsketch-drafts-select-${draft.id}`}
          // `<b>` and `<small>` are adjacent block elements with no
          // whitespace between them in the accessible-name computation
          // ("Draft 1based on v0.1") — spell the name out explicitly instead.
          aria-label={`${draft.name}, ${secondaryLabel}`}
        >
          <i aria-hidden="true" />
          <span>
            <b>{draft.name}</b>
            <small>{secondaryLabel}</small>
          </span>
        </button>
      )}
      <div className="systemsketch-drafts-row__actions">
        <button
          ref={renameTriggerRef}
          type="button"
          className="systemsketch-drafts-row__action"
          aria-label={`Rename ${draft.name}`}
          onClick={() => { setConfirmingDiscard(false); setRenaming(true) }}
        >
          <Pencil size={13} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="systemsketch-drafts-row__action systemsketch-drafts-row__action--danger"
          data-confirming={confirmingDiscard}
          aria-label={confirmingDiscard ? `Confirm discard ${draft.name}` : `Discard ${draft.name}`}
          onClick={() => {
            if (confirmingDiscard) void discard(draft.id)
            else setConfirmingDiscard(true)
          }}
          onBlur={() => setConfirmingDiscard(false)}
        >
          {confirmingDiscard ? <span className="systemsketch-drafts-row__confirm-label">Discard?</span> : <Trash2 size={13} strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

export function DraftsControl() {
  const { activeDraftId, drafts, isDraftMode, switchTo, createDraftAction } = useDrafts()
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="systemsketch-drafts-trigger"
          data-active={isDraftMode}
          data-testid="systemsketch-drafts-trigger"
          aria-label="Drafts"
        >
          <GitBranch size={15} strokeWidth={2} aria-hidden="true" />
          <span>Drafts</span>
          {drafts.length > 0 ? <span className="systemsketch-drafts-badge">{drafts.length}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal container={themeRoot()}>
        <Popover.Content
          className="systemsketch-drafts-popover"
          data-testid="systemsketch-drafts-popover"
          sideOffset={8}
          align="start"
          collisionPadding={14}
          aria-labelledby="systemsketch-drafts-popover-title"
        >
          <header>
            <b id="systemsketch-drafts-popover-title">Drafts</b>
          </header>
          <div className="systemsketch-drafts-popover__list">
            <button
              type="button"
              className="systemsketch-drafts-row systemsketch-drafts-row--main"
              data-current={activeDraftId === null}
              data-testid="systemsketch-drafts-row-main"
              onClick={() => { void switchTo(null); setOpen(false) }}
            >
              <i aria-hidden="true" />
              <span><b>Main</b></span>
            </button>
            {drafts.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                isCurrent={draft.id === activeDraftId}
                onSelect={() => { void switchTo(draft.id); setOpen(false) }}
              />
            ))}
          </div>
          <button
            type="button"
            className="systemsketch-drafts-popover__new"
            data-testid="systemsketch-drafts-new"
            onClick={() => { void createDraftAction(); setOpen(false) }}
          >
            <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
            New draft
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
