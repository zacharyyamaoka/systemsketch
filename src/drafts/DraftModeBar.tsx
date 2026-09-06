/**
 * The draft-mode bar — a real chrome row, not an overlay.
 *
 * Confirmed with Zach: it PUSHES the canvas down (`App.tsx` stacks it above
 * `.systemsketch-app__canvas` in a flex column) rather than floating over the
 * board. An earlier look at this — an inverted/black bar, or a hazard-stripe
 * treatment — was an explicit rejection; this one paints from the same quiet
 * `--ss-surface-raised`/`--ss-text`/`--ss-border` tokens as the rest of the
 * chrome, at the chrome's own `--systemsketch-top-height`.
 *
 * It renders as a sibling of `<Tldraw>`, not inside it (see `App.tsx`), so
 * none of tldraw's own UI context is available here — no `useEditor()`,
 * no `TldrawUiButton`, no `useToasts()`. Every control below is a plain
 * element, and the one thing that needs the live document (Compare's two
 * snapshots) goes through `useDrafts().getCompareSnapshots()` instead, which
 * already holds the editor ref from `attachEditor`.
 */
import { AlertTriangle, ArrowLeft, ChevronDown, MoreHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useCompare } from '../compare'
import { useDrafts } from './DraftProvider'
import './drafts.css'

/** How long a self-clearing status line (a Rebase result, mostly) stays up. */
const STATUS_TIMEOUT_MS = 5000

/**
 * A rename's second, near-simultaneous click must not land as a caret-placing
 * click on the newly-mounted `<input>` — see the WHY on `renameMountedAtRef`
 * below, at both call sites.
 */
const RENAME_MOUSEDOWN_GUARD_MS = 400

function useOutsideDismiss(open: boolean, onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onDismiss])
  return ref
}

/**
 * A tiny dropdown, hand-rolled rather than `@radix-ui/react-dropdown-menu`
 * for the overflow `⋯` menu specifically: it is one item today (Discard),
 * and the Merge▾ split button below is where Radix's dropdown-menu earns its
 * keep (the GitHub split-button shape Zach asked for, with real keyboard
 * support on a menu people will actually reach for often). A one-item menu
 * does not need that machinery twice.
 */
function OverflowMenu({ onDiscard }: { onDiscard(): void }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const close = useCallback(() => { setOpen(false); setConfirming(false) }, [])
  const ref = useOutsideDismiss(open, close)

  return (
    <div className="systemsketch-draft-bar__overflow" ref={ref}>
      <button
        type="button"
        className="systemsketch-draft-bar__icon-button"
        aria-label="Draft options"
        aria-expanded={open}
        data-testid="systemsketch-draft-bar-overflow"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <div className="systemsketch-draft-bar__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="systemsketch-draft-bar__menu-item systemsketch-draft-bar__menu-item--danger"
            data-testid="systemsketch-draft-bar-discard"
            onClick={() => {
              if (confirming) { onDiscard(); close() }
              else setConfirming(true)
            }}
          >
            {confirming ? 'Click again to discard' : 'Discard draft'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * GitHub's merge-button pattern: a solid primary segment plus a chevron that
 * opens a small menu — the shape Zach specifically asked for.
 *
 * WHY the primary segment is a single click again: it used to be a two-step
 * arm-then-confirm, matching Discard, because Merge writes over the shared
 * file wholesale and a bare click was asymmetric with the destructive controls
 * beside it. That confirmation was REPLACED, not dropped — clicking Merge now
 * opens the Compare dialog on the same Draft-vs-Main diff, with the confirm at
 * the bottom of it. Zach's words: *"instead of doing a double click
 * confirmation... it will again open essentially the compare view."* Keeping
 * both would stack a confirmation in front of a confirmation, and a review
 * showing exactly what is about to be overwritten is a strictly better guard
 * than a button that changes its own label.
 *
 * `blocked` is a look, not a lock: `hasConflict` is only ever advisory (see
 * the WHY on `DraftProvider`'s `refreshConflict`), so the button stays
 * genuinely clickable even while it reads as blocked — `merge()` runs its own
 * fresh check at the instant of the CONFIRM regardless, and a stale flag must
 * never veto a merge that would actually succeed. This just points the eye at
 * Rebase, behind the chevron, as the way forward.
 */
function MergeSplitButton({
  disabled,
  blocked,
  onMerge,
  onRebase,
}: {
  disabled: boolean
  blocked: boolean
  onMerge(): void
  onRebase(): void
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideDismiss(open, close)

  return (
    <div
      className="systemsketch-draft-bar__split"
      data-disabled={disabled}
      data-blocked={blocked && !disabled}
      ref={ref}
    >
      <button
        type="button"
        className="systemsketch-draft-bar__split-primary"
        data-testid="systemsketch-draft-bar-merge"
        disabled={disabled}
        onClick={() => { close(); onMerge() }}
      >
        Merge
      </button>
      <button
        type="button"
        className="systemsketch-draft-bar__split-chevron"
        aria-label="Merge options"
        aria-expanded={open}
        data-testid="systemsketch-draft-bar-merge-chevron"
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <ChevronDown size={14} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open ? (
        <div className="systemsketch-draft-bar__menu systemsketch-draft-bar__menu--right" role="menu">
          <button
            type="button"
            role="menuitem"
            className="systemsketch-draft-bar__menu-item"
            data-testid="systemsketch-draft-bar-rebase"
            onClick={() => { onRebase(); close() }}
          >
            Rebase
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function DraftModeBar() {
  const {
    activeDraft, changes, hasConflict, hasUnpromotedEdits,
    switchTo, renameDraftAction, discard, merge, rebaseDraftAction, previewRebase, getCompareSnapshots,
  } = useDrafts()
  const compare = useCompare()
  const [renaming, setRenaming] = useState(false)
  const [renameDraftValue, setRenameDraftValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameTriggerRef = useRef<HTMLButtonElement>(null)
  // WHY this exists: `beginRename` opens the input on a single click and
  // selects its text, so a user's HABITUAL double-click's second click lands
  // ~90-200ms later on the now-different element — the freshly-mounted
  // `<input>`, not the button. That is a plain click-inside-a-focused-input,
  // which collapses the selection to a caret; the user then types expecting
  // to replace the selected text and instead inserts mid-word ("Draft 1" ->
  // "DraNew nameft 1"), committing silently on blur. No native `dblclick` can
  // ever fire here — the two clicks hit different elements — so this records
  // when the input mounted and the input's own `onMouseDown` below swallows a
  // second click that lands within the window, leaving the selection intact.
  const renameMountedAtRef = useRef(0)

  useEffect(() => {
    if (status === null) return
    const timer = window.setTimeout(() => setStatus(null), STATUS_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (renaming) {
      renameMountedAtRef.current = performance.now()
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renaming])

  // Rendered only while `isDraftMode` (see App.tsx), but `activeDraft` is
  // still nullable by type — nothing to draw for the instant it is not.
  if (!activeDraft) return null

  const beginRename = () => {
    setRenameDraftValue(activeDraft.name)
    setRenameError(null)
    setRenaming(true)
  }
  const cancelRename = () => {
    setRenaming(false)
    setRenameError(null)
    // Parity with the file-title rename (LocalWorkspace.tsx): focus goes back
    // to the trigger rather than wherever the input happened to leave it — a
    // frame late, since the trigger button does not exist yet this tick.
    window.requestAnimationFrame(() => renameTriggerRef.current?.focus())
  }
  const commitRename = () => {
    const trimmed = renameDraftValue.trim()
    if (!trimmed) {
      // A friendly message instead of a silent revert — same convention as
      // the file-title rename's "Give this board a name."
      setRenameError('Give this draft a name.')
      window.requestAnimationFrame(() => renameInputRef.current?.focus())
      return
    }
    if (trimmed !== activeDraft.name) renameDraftAction(activeDraft.id, trimmed)
    setRenaming(false)
    setRenameError(null)
    window.requestAnimationFrame(() => renameTriggerRef.current?.focus())
  }

  const onCompare = async () => {
    if (!compare) return
    const { main, draftHead } = await getCompareSnapshots()
    if (!main || !draftHead) {
      setStatus('Could not read Main to compare.')
      return
    }
    compare.open({
      beforeLabel: 'Main',
      before: main,
      afterLabel: activeDraft.name,
      after: draftHead,
    })
  }

  const plural = (count: number) => (count === 1 ? '' : 's')

  /** The refusal `merge()` reported, in the words the bar has always used. */
  const mergeRefusal = (result: Awaited<ReturnType<typeof merge>>) =>
    result.reason === 'drifted'
      ? `Merge blocked — Main has ${result.driftCount} change${plural(result.driftCount)} this draft doesn't have yet. Rebase first.`
      : 'Could not check Main before merging — try again.'

  /**
   * Rebase — open the SAME review, showing the draft as it WOULD look.
   *
   * WHY the preview is not just Main-vs-draft: a rebase does not make the
   * draft look like Main, it folds Main's work INTO the draft. Showing the
   * two inputs would leave the reviewer to imagine the output; `computeRebase`
   * already produces that output as a pure value, so the review shows the
   * actual proposal. The confirm then re-runs the REAL `rebaseDraftAction`
   * rather than applying this snapshot — it re-reads all three inputs and is
   * the one tested path that writes.
   */
  const onRebase = async () => {
    if (!compare) return
    const preview = await previewRebase(activeDraft.id)
    if (preview.outcome === 'unreadable' || !preview.draftHead || !preview.main) {
      setStatus('Rebase failed — try again.')
      return
    }

    if (preview.outcome === 'conflicted') {
      const count = preview.conflictCount
      // The status line stays too: it is the trace that survives closing the
      // dialog, and it is where a reviewer who dismisses the review still
      // finds out why nothing happened.
      setStatus(`Rebase blocked — ${count} conflicting change${plural(count)}. Review in Compare.`)
      compare.open(
        { beforeLabel: 'Main', before: preview.main, afterLabel: activeDraft.name, after: preview.draftHead },
        {
          label: 'Rebase',
          confirmLabel: (n) => (n > 0 ? `Rebase ${n} change${plural(n)}` : 'Rebase onto the latest Main'),
          blockedReason: `Rebase blocked — ${count} conflicting change${plural(count)}. Main and this draft changed the same thing, so there is nothing safe to apply.`,
          // Unreachable while `blockedReason` disables the confirm, and still
          // spelled out: a future edit that re-enables the button must not
          // silently inherit a no-op.
          onConfirm: async () => ({ ok: false, reason: 'Resolve the conflicting changes first.' }),
        },
      )
      return
    }

    compare.open(
      {
        beforeLabel: activeDraft.name,
        before: preview.draftHead,
        afterLabel: `${activeDraft.name} (after Rebase)`,
        after: preview.proposed!,
      },
      {
        label: 'Rebase',
        confirmLabel: (n) => (n > 0 ? `Rebase ${n} change${plural(n)}` : 'Rebase onto the latest Main'),
        onConfirm: async () => {
          try {
            const result = await rebaseDraftAction(activeDraft.id)
            if (result.ok) {
              setStatus('Rebased onto the latest Main.')
              return { ok: true }
            }
            const count = result.conflictCount
            setStatus(`Rebase blocked — ${count} conflicting change${plural(count)}. Review in Compare.`)
            return { ok: false, reason: `Rebase blocked — ${count} conflicting change${plural(count)}.` }
          } catch {
            // rebaseDraftAction resolves {ok, conflictCount} for the normal
            // blocked-vs-succeeded outcomes above; a throw here means something
            // outside that contract went wrong (no open board, draft went away
            // mid-action) — surface it rather than pretending nothing happened.
            setStatus('Rebase failed — try again.')
            return { ok: false, reason: 'Rebase failed — try again.' }
          }
        },
      },
    )
  }

  /**
   * Merge — the same Draft-vs-Main review the Compare button shows, plus a
   * confirm. Deliberately NOT pre-checked for drift here: `merge()` owns the
   * fail-closed check and runs it fresh at the instant of the confirm, so a
   * second check at open time would be a second authority that could disagree
   * with it. A drifted Main therefore refuses IN the dialog, with the reason.
   */
  const onMerge = async () => {
    if (!compare) return
    const { main, draftHead } = await getCompareSnapshots()
    if (!main || !draftHead) {
      setStatus('Could not read Main to compare.')
      return
    }
    compare.open(
      { beforeLabel: 'Main', before: main, afterLabel: activeDraft.name, after: draftHead },
      {
        label: 'Merge',
        // A move-only draft has no display-diff rows and is still perfectly
        // mergeable (`hasUnpromotedEdits`, not `changes.total`, gates the
        // button) — so "Merge 0 changes" needs real words, not a count.
        confirmLabel: (n) => (n > 0 ? `Merge ${n} change${plural(n)}` : 'Merge this draft into Main'),
        onConfirm: async () => {
          const result = await merge(activeDraft.id)
          if (result.ok) return { ok: true }
          const reason = mergeRefusal(result)
          setStatus(reason)
          return { ok: false, reason }
        },
      },
    )
  }

  return (
    <div className="systemsketch-draft-bar" data-testid="systemsketch-draft-bar">
      <div className="systemsketch-draft-bar__left">
        <button
          type="button"
          className="systemsketch-draft-bar__exit"
          data-testid="systemsketch-draft-bar-exit"
          onClick={() => void switchTo(null)}
        >
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Exit
        </button>
        <div className="systemsketch-draft-bar__divider" />
        {renaming ? (
          <div className="systemsketch-draft-bar__rename" data-error={renameError ? 'true' : undefined}>
            <input
              ref={renameInputRef}
              className="systemsketch-draft-bar__rename-input"
              value={renameDraftValue}
              aria-label="Rename draft"
              aria-describedby="systemsketch-draft-bar-rename-help"
              aria-invalid={renameError ? true : undefined}
              onChange={(event) => { setRenameDraftValue(event.target.value); setRenameError(null) }}
              onMouseDown={(event) => {
                if (performance.now() - renameMountedAtRef.current < RENAME_MOUSEDOWN_GUARD_MS) {
                  // Suppresses native caret placement while leaving focus (and
                  // the selection `select()` above just made) intact — a
                  // rapid second click leaves the text still fully selected,
                  // so typing replaces it. A DELIBERATE slow second click,
                  // outside the window, places a caret normally.
                  event.preventDefault()
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                else if (event.key === 'Escape') { event.preventDefault(); cancelRename() }
              }}
              onBlur={commitRename}
            />
            <span id="systemsketch-draft-bar-rename-help" className="systemsketch-draft-bar__rename-help">
              {renameError ?? 'Press Enter to rename, Escape to cancel'}
            </span>
          </div>
        ) : (
          <button
            ref={renameTriggerRef}
            type="button"
            className="systemsketch-draft-bar__name"
            data-testid="systemsketch-draft-bar-name"
            title={activeDraft.name}
            aria-label={`${activeDraft.name}. Click to rename.`}
            onClick={beginRename}
          >
            {activeDraft.name}
          </button>
        )}
        <OverflowMenu onDiscard={() => void discard(activeDraft.id)} />
        {hasConflict ? (
          <div className="systemsketch-draft-bar__conflict" data-testid="systemsketch-draft-bar-conflict">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
            <span>Main changed since this draft — review before merging</span>
          </div>
        ) : null}
      </div>
      <div className="systemsketch-draft-bar__right">
        {status ? <span className="systemsketch-draft-bar__status" role="status">{status}</span> : null}
        <button
          type="button"
          className="systemsketch-draft-bar__compare"
          data-testid="systemsketch-draft-bar-compare"
          disabled={!compare}
          onClick={() => void onCompare()}
        >
          {`Compare ${changes.total} Change${changes.total === 1 ? '' : 's'}`}
        </button>
        <MergeSplitButton
          disabled={!hasUnpromotedEdits}
          blocked={hasConflict}
          onMerge={() => void onMerge()}
          onRebase={() => void onRebase()}
        />
      </div>
    </div>
  )
}
