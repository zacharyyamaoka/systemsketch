/**
 * One editing contract for every text box in SystemSketch.
 *
 * The law: **a field never stops existing with an uncommitted edit.** Typing is
 * an editing *gesture* with three boundaries — it begins, it produces values,
 * and it ends exactly once — and how you leave the field only decides *when*
 * the gesture ends, never *whether* the value was kept. Blur, Enter, Escape,
 * clicking another control, switching tabs, and the panel unmounting because
 * the shape got deselected are all the same boundary.
 *
 * The browser will not tell you about the last one: Chrome fires no `blur` for
 * a focused element removed from the DOM, so a commit-on-blur field silently
 * drops whatever was typed the moment its panel unmounts. This gesture is
 * driven from the React lifecycle instead, where unmount is observable.
 *
 * Two write policies, chosen per field, both loss-free:
 *
 * - `live` — every keystroke writes straight into the document, so the document
 *            is the only copy of the text and there is nothing left to lose.
 *            This is what the on-canvas inline editor already does, and it is
 *            the default everywhere.
 * - `exit` — the value is buffered and written once, at the end boundary, for
 *            fields whose write is genuinely expensive. Still loss-free,
 *            because unmount *is* an end boundary.
 *
 * `begin` exists so a live field is one undo step rather than one per
 * character. `end` is the commit boundary an out-of-process backend hangs a
 * semantic `rename(port, from, to)` off — without the document write ever
 * having to wait for the round trip.
 */

export type FieldCommitMode = 'live' | 'exit'

export interface FieldGestureHooks {
  /** Write into the document. Per keystroke in `live`, once at the end in `exit`. */
  write(value: string): void
  /**
   * Open one undoable step. Called lazily — on the first keystroke that really
   * changes the value — so merely focusing a field leaves no trace in history.
   */
  begin?(): void
  /** The commit boundary. Fires exactly once per gesture, whatever ended it. */
  end?(value: string, startValue: string): void
}

export class FieldGesture {
  mode: FieldCommitMode

  private readonly hooks: FieldGestureHooks
  private editing = false
  private began = false
  private start = ''
  private current = ''

  constructor(hooks: FieldGestureHooks, mode: FieldCommitMode = 'live') {
    this.hooks = hooks
    this.mode = mode
  }

  get isEditing(): boolean {
    return this.editing
  }

  get startValue(): string {
    return this.start
  }

  get value(): string {
    return this.current
  }

  /** Enter the field. Idempotent: re-entering keeps the original pre-edit value. */
  focus(value: string): void {
    if (this.editing) return
    this.editing = true
    this.began = false
    this.start = value
    this.current = value
  }

  /** One keystroke, paste, or IME commit. */
  change(value: string): void {
    if (!this.editing) this.focus(this.current)
    if (value === this.current) return
    this.current = value
    if (this.mode !== 'live') return
    this.ensureBegun()
    this.hooks.write(value)
  }

  /**
   * End the gesture and keep the value. Every exit route calls this — blur,
   * Enter, Escape, and the unmount cleanup — so it must stay idempotent.
   */
  commit(): void {
    if (!this.editing) return
    if (this.mode === 'exit' && this.current !== this.start) {
      this.ensureBegun()
      this.hooks.write(this.current)
    }
    const value = this.current
    const start = this.start
    this.editing = false
    this.began = false
    this.hooks.end?.(value, start)
  }

  private ensureBegun(): void {
    if (this.began) return
    this.began = true
    this.hooks.begin?.()
  }
}
