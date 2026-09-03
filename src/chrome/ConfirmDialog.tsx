/**
 * One confirmation surface for the destructive actions.
 *
 * Two of them asked with `window.confirm`: deleting a comment thread and
 * moving a board to Trash. A native confirm is the wrong instrument in this
 * app for three separate reasons — it steals the OS focus from a canvas the
 * user is mid-gesture on, it cannot be styled so it arrives in the browser's
 * palette rather than the board's theme, and an embedded host (a VS Code or
 * Obsidian webview) may suppress it outright, which turns "are you sure?" into
 * a silent yes or a silent no depending on the host.
 *
 * So the ask goes through tldraw's own dialog stack — the same one Settings and
 * the keyboard-shortcuts sheet use — and returns a promise, so a caller reads
 * exactly as it did with `confirm`.
 */
import {
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDialogBody,
  TldrawUiDialogFooter,
  TldrawUiDialogHeader,
  TldrawUiDialogTitle,
  react,
  useDialogs,
  type TLUiDialogProps,
} from 'tldraw'
import { useCallback, useEffect, useRef } from 'react'

import './confirm-dialog.css'

export interface ConfirmRequest {
  title: string
  /** One sentence naming the consequence, not restating the title. */
  body: string
  /** The verb, e.g. `Delete` or `Move to Trash`. */
  confirmLabel: string
  cancelLabel?: string
  /** `danger` paints the confirm button as destructive. */
  tone?: 'danger' | 'default'
}

interface ConfirmDialogProps extends TLUiDialogProps, ConfirmRequest {
  onResolve(confirmed: boolean): void
}

export function SystemSketchConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  onClose,
  onResolve,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // The destructive verb is deliberately NOT the initially focused control.
  // Cancel is, so Enter on a dialog nobody read cancels.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    onResolve(confirmed)
    onClose()
  }, [onClose, onResolve])

  return (
    <div className="systemsketch-confirm" data-testid="systemsketch-confirm-dialog" data-tone={tone}>
      <TldrawUiDialogHeader>
        <TldrawUiDialogTitle>{title}</TldrawUiDialogTitle>
      </TldrawUiDialogHeader>
      <TldrawUiDialogBody className="systemsketch-confirm__body">{body}</TldrawUiDialogBody>
      <TldrawUiDialogFooter className="systemsketch-confirm__footer">
        <TldrawUiButton
          ref={cancelRef}
          type="normal"
          data-testid="systemsketch-confirm-cancel"
          onClick={() => settle(false)}
        >
          <TldrawUiButtonLabel>{cancelLabel}</TldrawUiButtonLabel>
        </TldrawUiButton>
        <TldrawUiButton
          type={tone === 'danger' ? 'danger' : 'primary'}
          data-testid="systemsketch-confirm-accept"
          onClick={() => settle(true)}
        >
          <TldrawUiButtonLabel>{confirmLabel}</TldrawUiButtonLabel>
        </TldrawUiButton>
      </TldrawUiDialogFooter>
    </div>
  )
}

/**
 * `const ok = await confirm({ … })` — the shape `window.confirm` had, minus
 * the OS modal. Resolves `false` for Escape, the backdrop and Cancel alike.
 *
 * Dismissal is detected by watching the dialog leave tldraw's dialog atom, not
 * by a React teardown effect, and that distinction is the whole reason this is
 * written the long way. `DefaultDialogs` never invokes a dialog record's
 * `onClose`; it only removes the record, so unmount is the only signal — and
 * under StrictMode React mounts, unmounts and remounts every component once,
 * which made a teardown-based resolve fire `false` the instant the dialog
 * opened. The browser journey caught exactly that: Cancel appeared to work
 * because `false` is what Cancel means, and Confirm silently did nothing.
 */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const { addDialog, dialogs } = useDialogs()
  return useCallback((request: ConfirmRequest) => new Promise<boolean>((resolve) => {
    let stopWatching: (() => void) | null = null
    let answered = false
    const answer = (confirmed: boolean) => {
      if (answered) return
      answered = true
      stopWatching?.()
      resolve(confirmed)
    }
    const id = addDialog({
      component: (props) => (
        <SystemSketchConfirmDialog {...props} {...request} onResolve={answer} />
      ),
    })
    // `addDialog` has already put the record in the atom, so this first run
    // finds it and the reactor only fires once the dialog genuinely leaves.
    stopWatching = react('systemsketch confirm dialog lifetime', () => {
      if (!dialogs.get().some((dialog) => dialog.id === id)) answer(false)
    })
  }), [addDialog, dialogs])
}
