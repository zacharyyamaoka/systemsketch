import { autocompletion, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { syntaxHighlighting } from '@codemirror/language'
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import { Decoration, EditorView, keymap, tooltips, type DecorationSet } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { FieldGesture } from '../fields/fieldCommit'
import { isSafeNamespaceName, PYTHON_SAFE_NAMESPACE } from './pythonSafeNamespace'
import { useDebouncedExpressionEval } from './useDebouncedExpressionEval'
import type { ExpressionEvalResult, UsedName } from './expressionClient'
import '../theme/pythonTokens.css'
import './expandingExpressionField.css'

/** Marks our own imperative doc-content swaps so the change listener never echoes them back as typing. */
const externalSync = Annotation.define<boolean>()
const setDiagnostics = StateEffect.define<UsedName[]>()

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setDiagnostics)) continue
      const builder = new RangeSetBuilder<Decoration>()
      const docLength = tr.state.doc.length
      for (const used of effect.value) {
        if (used.defined) continue
        const from = Math.max(0, Math.min(used.start, docLength))
        const to = Math.max(from, Math.min(used.end, docLength))
        if (to > from) builder.add(from, to, Decoration.mark({ class: 'ss-expr-squiggle' }))
      }
      return builder.finish()
    }
    return value.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

function completionSource(registryNames: readonly string[]) {
  return (context: import('@codemirror/autocomplete').CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    return {
      from: word.from,
      options: [
        ...registryNames.map((name) => ({ label: name, type: 'variable', detail: 'variable' })),
        ...PYTHON_SAFE_NAMESPACE.map((entry) => (
          { label: entry.name, type: 'function', detail: entry.signature }
        )),
      ],
    }
  }
}

/** Collapsed display for a value that hasn't evaluated to anything printable yet, or at all. */
function fallbackDisplay(value: string): string {
  return value
}

export interface ExpandingExpressionFieldProps {
  className?: string
  value: string
  disabled?: boolean
  ariaLabel?: string
  /** Shown, muted, in place of an empty collapsed field — never rendered while expanded. */
  placeholder?: string
  /** name -> that name's own expression string. Must be referentially stable across renders. */
  registry: Record<string, string>
  beginEdit?(): void
  onWrite(value: string): void
  onEditEnd?(value: string, startValue: string): void
  /** The field's latest live evaluation, for a parent that aggregates "variables used" across fields. */
  onEvalResult?(result: ExpressionEvalResult | null): void
}

/**
 * A property box that is honestly Python from the first pixel: collapsed, it
 * shows the live-resolved value (syntax highlighted, exactly what a plain
 * literal shows today); focused, it becomes the real editable formula in a
 * real CodeMirror document with IntelliSense, and a wavy underline on any
 * name that doesn't resolve. Evaluation is always on — there is no mode to
 * turn it off — and always happens against the local Python host (never
 * client-side), so a legacy value that isn't valid Python today (a bare
 * word standing in for a string, an invalid path) just falls back to
 * showing its own raw text with a small warning glyph, exactly as it always
 * has, rather than being silently reinterpreted.
 */
export function ExpandingExpressionField({
  className,
  value,
  disabled,
  ariaLabel,
  placeholder,
  registry,
  beginEdit,
  onWrite,
  onEditEnd,
  onEvalResult,
}: ExpandingExpressionFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const editableCompartment = useRef(new Compartment())
  const completionCompartment = useRef(new Compartment())
  const [expanded, setExpanded] = useState(false)
  const [liveExpr, setLiveExpr] = useState(value)
  const helpId = useId()

  const evalState = useDebouncedExpressionEval(liveExpr, registry)
  const registryNames = Object.keys(registry)

  const latest = useRef({ onWrite, beginEdit, onEditEnd, onEvalResult, value, disabled })
  latest.current = { onWrite, beginEdit, onEditEnd, onEvalResult, value, disabled }

  const gestureRef = useRef<FieldGesture | null>(null)
  if (!gestureRef.current) {
    gestureRef.current = new FieldGesture({
      write: (next) => latest.current.onWrite(next),
      begin: () => latest.current.beginEdit?.(),
      end: (next, start) => latest.current.onEditEnd?.(next, start),
    }, 'live')
  }
  const gesture = gestureRef.current

  // The actual activation trigger — see the mount effect's `focus` handler
  // comment for why clicking a non-editable CodeMirror view can't do this
  // on its own. Read through a ref so the wrapper's pointerdown (defined in
  // the render below) always calls the current version.
  const activateRef = useRef(() => {
    if (latest.current.disabled) return
    gesture.focus(latest.current.value)
    setExpanded(true)
  })

  // An idle field follows the document, exactly like every other port field.
  useEffect(() => {
    if (!expanded) setLiveExpr(value)
  }, [value, expanded])

  useEffect(() => {
    latest.current.onEvalResult?.(evalState.result)
  }, [evalState.result])

  const hasError = expanded
    ? evalState.result != null && !evalState.result.ok
    : evalState.result != null && !evalState.result.ok
  const errorMessage = evalState.hostUnreachable
    ? 'The local SystemSketch controller is not running — start it with npm run desktop:preview to evaluate expressions.'
    : evalState.result?.error ?? null

  const registryNamesRef = useRef(registryNames)
  registryNamesRef.current = registryNames

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      state: EditorState.create({
        doc: fallbackDisplay(value),
        extensions: [
          history(),
          Prec.high(keymap.of([{
            key: 'Escape',
            run: (target) => { target.contentDOM.blur(); return true },
          }])),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          python(),
          syntaxHighlighting(classHighlighter),
          diagnosticsField,
          editableCompartment.current.of(EditorView.editable.of(false)),
          completionCompartment.current.of([]),
          tooltips({
            position: 'absolute',
            parent: host.closest<HTMLElement>('.tl-container') ?? document.body,
          }),
          // A property value is one line: typing or pasting a newline is
          // simply dropped rather than growing the field.
          EditorView.inputHandler.of((_view, from, to, insertedText) => {
            if (!/[\r\n]/.test(insertedText)) return false
            const cleaned = insertedText.replace(/[\r\n]+/g, '')
            _view.dispatch({ changes: { from, to, insert: cleaned }, selection: { anchor: from + cleaned.length } })
            return true
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (update.transactions.every((tr) => tr.annotation(externalSync))) return
            const text = update.state.doc.toString()
            setLiveExpr(text)
            gesture.change(text)
          }),
          EditorView.domEventHandlers({
            // Belt-and-braces: a non-editable CodeMirror view is not
            // click-focusable at all (confirmed: `.focus()` on its
            // `contentDOM` while `editable:false` is a no-op, tabIndex -1) —
            // activation actually happens via `activateRef` from the
            // wrapper's own pointerdown below. This still fires once the
            // field IS editable (e.g. Tab-key navigation into it).
            focus: (_event, focusedView) => {
              if (latest.current.disabled) { focusedView.contentDOM.blur(); return }
              gesture.focus(latest.current.value)
              setExpanded(true)
            },
            // CodeMirror's contentDOM can flicker focus during its own mount
            // work — a synchronous commit on the first flicker would collapse
            // the field the instant it opened. Believed only once it survives
            // a macrotask, same guard `SourceCodeEditor` uses.
            blur: () => {
              globalThis.setTimeout(() => {
                const current = viewRef.current
                if (current && !current.hasFocus) {
                  gesture.commit()
                  setExpanded(false)
                }
              }, 0)
            },
          }),
        ],
      }),
      parent: host,
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
    // One mount for the field's whole lifetime; content/editability/
    // completion/diagnostics all flow through the compartment and dispatch
    // effects below so a re-render never tears the editor down mid-gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // tldraw's canvas calls `preventDefault()` on its own pointerdown, which —
  // per plain DOM semantics — means clicking the canvas or another shape
  // never fires this field's native blur. A capture-phase listener on
  // `document` is the one place "clicked outside the field" is reliably
  // observable while expanded (mirrors `useSourceToggleEditor`'s listener).
  useEffect(() => {
    if (!expanded) return
    const handlePointerDown = (event: PointerEvent) => {
      const host = hostRef.current
      if (!host) return
      if (event.target instanceof Node && host.contains(event.target)) return
      const element = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement
      if (element?.closest('.cm-tooltip')) return
      const current = viewRef.current
      current?.contentDOM.blur()
      gesture.commit()
      setExpanded(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [expanded, gesture])

  // Editable must flip on BEFORE the doc swaps and focuses: a non-editable
  // CodeMirror view silently refuses `.focus()` (confirmed — its contentDOM
  // isn't in the tab order at all while `editable:false`), so this used to
  // be two separately-ordered effects that focused a still-read-only view
  // and landed nowhere. The unchanged-content guard below is what stops
  // this from re-fighting the caret on every keystroke: `value` is a
  // `live`-mode prop, so it round-trips back with each character typed,
  // re-running this effect — but by then the doc already reads exactly that.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: [
        editableCompartment.current.reconfigure(EditorView.editable.of(expanded && !disabled)),
        completionCompartment.current.reconfigure(
          expanded ? [autocompletion({ override: [completionSource(registryNamesRef.current)] })] : [],
        ),
      ],
    })
    if (!expanded || view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: externalSync.of(true),
      selection: { anchor: value.length },
    })
    view.focus()
  }, [expanded, disabled, value, registryNames.join(' ')])

  // Collapsed display always follows the latest live evaluation — so a
  // global variable changing elsewhere on the board updates every field
  // that reads it without anyone needing to focus it.
  useEffect(() => {
    if (expanded) return
    const view = viewRef.current
    if (!view) return
    const display = evalState.result?.ok ? (evalState.result.repr ?? '') : fallbackDisplay(value)
    if (view.state.doc.toString() === display) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: display },
      annotations: externalSync.of(true),
    })
  }, [expanded, evalState.result, value])

  // The wavy underline only makes sense on the real formula text, which is
  // only what's on screen while expanded — applying stale offsets to the
  // (much shorter) collapsed resolved-value text would underline nonsense.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setDiagnostics.of(expanded ? (evalState.result?.usedNames ?? []) : []) })
  }, [expanded, evalState.result])

  useEffect(() => () => gesture.commit(), [gesture])

  const undefinedNames = (evalState.result?.usedNames ?? []).filter((used) => !used.defined)
  const knownUndefined = undefinedNames.filter((used) => !isSafeNamespaceName(used.name))

  return (
    <span
      className={`ss-expr-field${className ? ` ${className}` : ''}${expanded ? ' is-expanded' : ''}`}
      data-error={hasError ? 'true' : undefined}
      data-unreachable={evalState.hostUnreachable ? 'true' : undefined}
    >
      <div
        className="ss-expr-field__editor ss-python-tokens"
        ref={hostRef}
        role="textbox"
        aria-label={ariaLabel}
        aria-describedby={helpId}
        aria-invalid={hasError ? true : undefined}
        aria-readonly={!expanded || disabled}
        onPointerDown={(event) => {
          event.stopPropagation()
          if (!expanded) activateRef.current()
        }}
      />
      {placeholder && !expanded && liveExpr.trim() === '' ? (
        <span className="ss-expr-field__placeholder" aria-hidden="true">{placeholder}</span>
      ) : null}
      {knownUndefined.length > 0 && !expanded ? (
        <span className="ss-expr-field__warning" aria-hidden="true" title={errorMessage ?? undefined}>⚠</span>
      ) : null}
      <span id={helpId} className="ss-expr-field__help">
        {errorMessage ?? 'Type a value or a Python expression'}
      </span>
    </span>
  )
}
