import { completionStatus } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { syntaxHighlighting } from '@codemirror/language'
import { Annotation, Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension, tooltips } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'

import { FieldGesture } from './fieldCommit'
import '../theme/pythonTokens.css'
import './code-field.css'

/** Marks our own imperative doc swaps so the change listener never echoes them back as typing. */
const externalSync = Annotation.define<boolean>()

export interface CodeFieldProps {
  /** The document's value. The field follows it whenever it is not being edited. */
  value: string
  /** Write into the document — per keystroke, the `live` policy every field here uses. */
  onWrite(value: string): void
  /** Open one undo step so an edit is one Ctrl+Z, not one per character. */
  beginEdit?(): void
  /** The commit boundary — one call per gesture, however the field was left. */
  onEditEnd?(value: string, startValue: string): void
  /**
   * What makes this field know its grammar: slot decorations, a completion
   * source, diagnostics. Plain text is the empty list — that is the v1 code
   * text box, and it is the same component.
   */
  extensions?: Extension[]
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  ariaDescribedBy?: string
  ariaInvalid?: boolean
  className?: string
  testId?: string
  style?: CSSProperties
  /** Take focus on mount; `'select'` also selects the whole line, as a fresh canvas editor does. */
  autoFocus?: boolean | 'select'
  /** With `autoFocus`, put the caret here instead of selecting everything. */
  cursorAt?: number
  /**
   * A lane: several lines, one per thing. Enter inserts a line, Alt+↑/↓
   * move one, Shift+Alt+↓ copies one (all CodeMirror's default keymap);
   * Ctrl/Cmd+Enter is the exit that Enter is for a single line.
   */
  multiline?: boolean
  /** Pin every line to this height so lines can sit on a host's own rows. */
  lineHeightPx?: number
  align?: 'left' | 'right'
  /**
   * Enter and Escape both end the gesture by leaving the field (the value is
   * never discarded — Ctrl+Z is the retract). A host that owns an editing
   * session, like the canvas inline editor, supplies its own exits instead.
   */
  onEnter?(): void
  onEscape?(): void
  onViewReady?(view: EditorView): void
}

/**
 * The code text box: one line of text that knows what it is.
 *
 * It is a `<LiveTextInput>` whose text box is a real CodeMirror document —
 * the same document the Code block and the parametric expression field
 * already mount, so highlighting, the completion tooltip, IME, undo and the
 * caret all come from one mature engine rather than a mirror-div. What the
 * field does NOT know is any grammar: that arrives through `extensions`, so
 * a port line, a Type alias and a plain label are the same component with
 * different extensions plugged in. Commit semantics are `FieldGesture`'s,
 * unchanged: a field never stops existing with an uncommitted edit.
 */
export function CodeField({
  value,
  onWrite,
  beginEdit,
  onEditEnd,
  extensions = [],
  disabled = false,
  placeholder,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
  className,
  testId,
  style,
  autoFocus = false,
  cursorAt,
  multiline = false,
  lineHeightPx,
  align = 'left',
  onEnter,
  onEscape,
  onViewReady,
}: CodeFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const grammarCompartment = useRef(new Compartment())
  const editableCompartment = useRef(new Compartment())
  const placeholderCompartment = useRef(new Compartment())
  const metricsCompartment = useRef(new Compartment())

  const latest = useRef({ onWrite, beginEdit, onEditEnd, onEnter, onEscape, value, disabled, multiline })
  latest.current = { onWrite, beginEdit, onEditEnd, onEnter, onEscape, value, disabled, multiline }

  const metrics = (): Extension => EditorView.theme({
    ...(lineHeightPx ? { '.cm-line': { lineHeight: `${lineHeightPx}px`, height: `${lineHeightPx}px` } } : {}),
    ...(align === 'right' ? { '.cm-content': { textAlign: 'right' } } : {}),
  })

  const gestureRef = useRef<FieldGesture | null>(null)
  if (!gestureRef.current) {
    gestureRef.current = new FieldGesture({
      write: (next) => latest.current.onWrite(next),
      begin: () => latest.current.beginEdit?.(),
      end: (next, start) => latest.current.onEditEnd?.(next, start),
    }, 'live')
  }
  const gesture = gestureRef.current

  const leave = (view: EditorView) => {
    view.contentDOM.blur()
    gesture.commit()
  }

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Enter and Escape are the field's exits, handled on the raw event
          // so the keystroke can be STOPPED: once the field closes, the same
          // keydown would otherwise reach tldraw's document listener with
          // nothing focused, where Enter on a selected shape starts editing
          // it again and Escape clears the selection. A completion popup
          // gets first refusal — its own keymap runs at a higher precedence
          // and reports when it consumed the key.
          Prec.high(EditorView.domEventHandlers({
            keydown: (event, target) => {
              if (event.isComposing) return false
              if (event.key !== 'Enter' && event.key !== 'Escape') return false
              if (completionStatus(target.state) === 'active') return false
              // In a lane a bare Enter is a new line; only the modifier form exits.
              if (event.key === 'Enter' && latest.current.multiline && !event.ctrlKey && !event.metaKey) return false
              event.preventDefault()
              event.stopPropagation()
              const exit = event.key === 'Enter' ? latest.current.onEnter : latest.current.onEscape
              if (exit) exit()
              else leave(target)
              return true
            },
          })),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          python(),
          syntaxHighlighting(classHighlighter),
          grammarCompartment.current.of(extensions),
          editableCompartment.current.of(EditorView.editable.of(!disabled)),
          placeholderCompartment.current.of(placeholder ? placeholderExtension(placeholder) : []),
          metricsCompartment.current.of(metrics()),
          tooltips({
            position: 'absolute',
            parent: host.closest<HTMLElement>('.tl-container') ?? document.body,
          }),
          // One line: a typed or pasted newline is dropped rather than
          // growing the field. A lane keeps its newlines — they are its ports.
          EditorView.inputHandler.of((target, from, to, insertedText) => {
            if (latest.current.multiline || !/[\r\n]/.test(insertedText)) return false
            const cleaned = insertedText.replace(/[\r\n]+/g, '')
            target.dispatch({ changes: { from, to, insert: cleaned }, selection: { anchor: from + cleaned.length } })
            return true
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (update.transactions.every((tr) => tr.annotation(externalSync))) return
            const text = update.state.doc.toString()
            gesture.focus(latest.current.value)
            gesture.change(text)
          }),
          EditorView.domEventHandlers({
            focus: () => {
              if (latest.current.disabled) return
              gesture.focus(latest.current.value)
            },
            // CodeMirror's contentDOM can flicker focus during its own mount
            // work; a synchronous commit on the first flicker would end the
            // gesture the instant it began. Believed only once it survives a
            // macrotask — the guard the expression field already uses.
            blur: () => {
              globalThis.setTimeout(() => {
                const current = viewRef.current
                if (current && !current.hasFocus) gesture.commit()
              }, 0)
            },
          }),
        ],
      }),
      parent: host,
    })
    viewRef.current = view
    onViewReady?.(view)
    // Focus now and again on the next frame: a host that is mid-transition
    // (tldraw entering its editing state) can take focus back after the
    // first attempt, and a field that opened without focus is a dead field.
    let frame = 0
    if (autoFocus) {
      const take = () => {
        if (view.hasFocus || !viewRef.current) return
        view.focus()
        if (cursorAt !== undefined) {
          const anchor = Math.max(0, Math.min(cursorAt, view.state.doc.length))
          view.dispatch({ selection: { anchor } })
        } else if (autoFocus === 'select') {
          view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
        }
      }
      take()
      frame = requestAnimationFrame(take)
    }
    return () => {
      cancelAnimationFrame(frame)
      viewRef.current = null
      view.destroy()
    }
    // One mount for the field's lifetime; content, grammar and editability
    // flow through compartments and dispatches so a re-render never tears
    // the document down mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The document follows the store whenever nobody is typing in it. In `live`
  // mode the value round-trips back with every keystroke, so the equality
  // guard is what keeps this from re-fighting the caret.
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    if (gesture.isEditing && view.hasFocus) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalSync.of(true),
    })
  }, [value, gesture])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: grammarCompartment.current.reconfigure(extensions) })
  }, [extensions])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)) })
  }, [disabled])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: metricsCompartment.current.reconfigure(metrics()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineHeightPx, align])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.current.reconfigure(placeholder ? placeholderExtension(placeholder) : []),
    })
  }, [placeholder])

  // tldraw calls `preventDefault()` on its own pointerdown, so clicking the
  // canvas never fires this field's native blur. A capture-phase listener on
  // `document` is the one place "clicked outside the field" is observable.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const host = hostRef.current
      const view = viewRef.current
      if (!host || !view || !view.hasFocus) return
      if (event.target instanceof Node && host.contains(event.target)) return
      const element = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement
      if (element?.closest('.cm-tooltip')) return
      leave(view)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unmount is an end boundary like any other — the one the browser refuses
  // to report, since no blur fires for a focused element removed from the DOM.
  useEffect(() => () => gesture.commit(), [gesture])

  return (
    <div
      className={`ss-code-field ss-python-tokens${className ? ` ${className}` : ''}`}
      ref={hostRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid ? true : undefined}
      aria-disabled={disabled ? true : undefined}
      data-testid={testId}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
