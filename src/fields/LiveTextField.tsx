import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'

import { FieldGesture, type FieldCommitMode } from './fieldCommit'

export interface LiveFieldOptions {
  /** The document's value. The field follows it whenever it is not being edited. */
  value: string
  /** Write into the document. Called per keystroke in `live` mode. */
  onWrite(value: string): void
  /** `live` (default) writes every keystroke; `exit` writes once at the end boundary. */
  mode?: FieldCommitMode
  /** Open one undo step so a rename is one Ctrl+Z, not one per character. */
  beginEdit?(): void
  /** The commit boundary — one call per gesture, the seam for a semantic backend event. */
  onEditEnd?(value: string, startValue: string): void
  /** Enter ends the gesture on single-line fields; multiline fields keep the newline. */
  multiline?: boolean
}

export interface LiveFieldBinding {
  /** What is being typed. Local, so the caret and IME composition are never disturbed. */
  value: string
  fieldProps: {
    value: string
    onFocus(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>): void
    onChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void
    onBlur(): void
    onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void
  }
}

/**
 * Bind one text box to the document through a {@link FieldGesture}.
 *
 * The rendered value is local state rather than the document value, so a round
 * trip through the store can never move the caret or fight an IME — but the
 * local copy is never the *only* copy, which is the whole point.
 */
export function useLiveField({
  value,
  onWrite,
  mode = 'live',
  beginEdit,
  onEditEnd,
  multiline = false,
}: LiveFieldOptions): LiveFieldBinding {
  const [draft, setDraft] = useState(value)

  const latest = useRef({ onWrite, beginEdit, onEditEnd })
  latest.current = { onWrite, beginEdit, onEditEnd }

  const gestureRef = useRef<FieldGesture | null>(null)
  if (!gestureRef.current) {
    gestureRef.current = new FieldGesture({
      write: (next) => latest.current.onWrite(next),
      begin: () => latest.current.beginEdit?.(),
      end: (next, startValue) => latest.current.onEditEnd?.(next, startValue),
    }, mode)
  }
  const gesture = gestureRef.current
  gesture.mode = mode

  // An idle field follows the document; an edited one is not overwritten mid-word.
  useEffect(() => {
    if (!gesture.isEditing) setDraft(value)
  }, [gesture, value])

  // The invariant. Unmount is an end boundary like any other, and it is the one
  // the browser refuses to report: no blur fires for a focused element that is
  // removed from the DOM, which is exactly what deselecting a Block does.
  useEffect(() => () => gesture.commit(), [gesture])

  return {
    value: draft,
    fieldProps: {
      value: draft,
      onFocus: () => gesture.focus(draft),
      onChange: (event) => {
        const next = event.target.value
        gesture.focus(draft)
        setDraft(next)
        gesture.change(next)
      },
      onBlur: () => gesture.commit(),
      onKeyDown: (event) => {
        if (event.nativeEvent.isComposing) return
        // Escape leaves the field the way tldraw's own on-canvas text editor
        // does — by exiting, not by discarding. Ctrl+Z is the retract, and
        // `beginEdit` made it retract the whole gesture in one press.
        if (event.key === 'Escape' || (event.key === 'Enter' && !multiline)) {
          if (event.key === 'Enter') event.preventDefault()
          event.currentTarget.blur()
        }
      },
    },
  }
}

type PassThrough = {
  className?: string
  placeholder?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
}

export type LiveTextInputProps = LiveFieldOptions & PassThrough

/** A single-line document-backed text box. */
export function LiveTextInput({
  className,
  placeholder,
  disabled,
  id,
  ariaLabel,
  ...options
}: LiveTextInputProps) {
  const { fieldProps } = useLiveField(options)
  return (
    <input
      {...fieldProps}
      id={id}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  )
}

export type LiveTextAreaProps = LiveFieldOptions & PassThrough & {
  rows?: number
  maxLength?: number
}

/** A multi-line document-backed text box. Enter inserts a newline. */
export function LiveTextArea({
  className,
  placeholder,
  disabled,
  id,
  ariaLabel,
  rows,
  maxLength,
  ...options
}: LiveTextAreaProps) {
  const { fieldProps } = useLiveField({ ...options, multiline: true })
  return (
    <textarea
      {...fieldProps}
      id={id}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      rows={rows}
      maxLength={maxLength}
    />
  )
}
