import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { clampSpeedPercent, MAX_SPEED_PERCENT, MIN_SPEED_PERCENT } from './gestureSettings'

/**
 * A percent field you can actually TYPE a number into, for the Sensitivity
 * rows beside it — the slider is how you FIND a value, this is how you SET
 * one exactly.
 *
 * WHY a draft string instead of clamping `onChange` on every keystroke:
 * clamping mid-type makes the field fight the person using it. Starting at 50
 * and typing "25", clamping the "2" immediately up to the 5% minimum would
 * make the next keystroke land on 55, not 25 — silently saving more than
 * double what was typed. So the draft is whatever has been typed,
 * uncommitted, and the clamp happens once at commit — blur or Enter. Escape
 * abandons. An empty or nonsense draft reverts to the live value rather than
 * writing a guess.
 */
export function PercentInput({ value, onCommit, testId, style }: {
  value: number
  onCommit(percent: number): void
  testId: string
  style?: CSSProperties
}) {
  // The draft lives in a REF as well as state, and `commit` reads the ref.
  //
  // WHY: an `onKeyDown` for Escape that only cleared React state and then
  // called `blur()` would race — state updates are not synchronous, so the
  // ensuing `onBlur` would still close over the pre-clear draft and commit
  // it, meaning Escape saved the value it was supposed to abandon. A ref
  // updates immediately, so there is exactly one commit path.
  const draftRef = useRef<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  const setDraft = (next: string | null) => {
    draftRef.current = next
    setIsEditing(next !== null)
  }

  // Follow the store while NOT editing — a slider drag has to move the
  // number, but must not yank a half-typed value out from under the keyboard.
  useEffect(() => { if (!isEditing && ref.current) ref.current.value = String(value) }, [value, isEditing])

  const commit = () => {
    const raw = draftRef.current
    setDraft(null)
    // Nothing uncommitted — an Escape already cleared it, or this is the blur
    // that follows an Enter which already committed.
    if (raw === null) return
    const parsed = Number(raw.trim())
    if (!Number.isFinite(parsed) || raw.trim() === '') {
      if (ref.current) ref.current.value = String(value)
      return
    }
    const next = clampSpeedPercent(parsed)
    if (ref.current) ref.current.value = String(next)
    onCommit(next)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      data-testid={testId}
      aria-label="Sensitivity percent"
      defaultValue={String(value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // tldraw listens for keys globally; a digit or a letter shortcut
        // would otherwise also reach the canvas and switch tools mid-entry.
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); commit(); ref.current?.blur() }
        if (event.key === 'Escape') {
          event.preventDefault()
          // Clear the ref FIRST: the blur below runs `commit`, which must
          // find nothing to save.
          setDraft(null)
          if (ref.current) ref.current.value = String(value)
          ref.current?.blur()
        }
      }}
      title={`${MIN_SPEED_PERCENT}–${MAX_SPEED_PERCENT}%`}
      style={style}
    />
  )
}
