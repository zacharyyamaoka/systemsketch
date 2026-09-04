import { TldrawUiInput } from 'tldraw'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'

export interface SystemSketchUiInputProps {
  /** The current local draft. Keep this local to the surface, never to the document model. */
  value: string
  className?: string
  autoFocus?: boolean
  autoSelect?: boolean
  disabled?: boolean
  maxLength?: number
  placeholder?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'data-testid'?: string
  onValueChange(value: string): void
  /** Enter only; use this when a field's key performs a domain action. */
  onComplete?(value: string): void
  /** A completed single-line identity edit, via Enter or by leaving the field. */
  onCommit?(value: string): void
  /** Escape restores the value from when this input was mounted. */
  onCancel?(initialValue: string): void
}

/**
 * The stock tldraw input is the default for ordinary single-line chrome.
 *
 * WHY: it already solves the fiddly, cross-browser input mechanics (focus,
 * select-on-entry, IME composition, Enter, Escape, and iOS scrolling). This
 * adapter deliberately owns only the one seam tldraw cannot know: whether a
 * completed string renames a file, creates a folder, or filters a list.
 *
 * Do not use this for canvas shape editors, live document-backed inspector
 * fields, command execution, or multiline prose. Those surfaces have a
 * different transaction or key contract; see `AGENTS.md#chrome-text-fields`.
 */
export const SystemSketchUiInput = forwardRef<HTMLInputElement, SystemSketchUiInputProps>(
  function SystemSketchUiInput(
    {
      value,
      onValueChange,
      onComplete,
      onCommit,
      onCancel,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...inputProps
    },
    ref,
  ) {
    const committedRef = useRef(false)
    const cancelledRef = useRef(false)
    const initialValueRef = useRef(value)
    const inputRef = useRef<HTMLInputElement | null>(null)
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    useEffect(() => {
      const input = inputRef.current
      if (!input) return
      if (ariaDescribedBy) input.setAttribute('aria-describedby', ariaDescribedBy)
      else input.removeAttribute('aria-describedby')
      if (ariaInvalid) input.setAttribute('aria-invalid', 'true')
      else input.removeAttribute('aria-invalid')
    }, [ariaDescribedBy, ariaInvalid])

    useEffect(() => {
      const input = inputRef.current
      if (input && input.value !== value) input.value = value
    }, [value])

    const complete = useCallback((next: string) => {
      committedRef.current = true
      onComplete?.(next)
      onCommit?.(next)
    }, [onCommit, onComplete])

    const handleBlur = useCallback((next: string) => {
      // Tldraw intentionally blurs before calling onComplete for Enter. Wait
      // one microtask so a single Enter cannot become an accidental second
      // filesystem mutation or command.
      queueMicrotask(() => {
        if (cancelledRef.current) {
          cancelledRef.current = false
          return
        }
        if (committedRef.current) {
          committedRef.current = false
          return
        }
        onCommit?.(next)
      })
    }, [onCommit])

    const handleCancel = useCallback((initialValue: string) => {
      cancelledRef.current = true
      onCancel?.(initialValue)
    }, [onCancel])

    return (
      <TldrawUiInput
        {...inputProps}
        ref={inputRef}
        defaultValue={initialValueRef.current}
        onValueChange={onValueChange}
        onComplete={complete}
        onCancel={handleCancel}
        onBlur={handleBlur}
      />
    )
  },
)
