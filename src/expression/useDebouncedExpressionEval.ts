import { useEffect, useState } from 'react'
import {
  evaluateExpression,
  isExpressionHostUnreachable,
  type ExpressionEvalResult,
} from './expressionClient'

const DEBOUNCE_MS = 200

export interface DebouncedExpressionEval {
  /** Last successful round trip. Never cleared to `null` by a later transport failure. */
  result: ExpressionEvalResult | null
  /** A request is in flight or debounced-pending. */
  isEvaluating: boolean
  /** The local Python host didn't answer — distinct from an expression that evaluated to an error. */
  hostUnreachable: boolean
}

/**
 * Live-evaluate `expr` against `registry` (name -> expression) whenever
 * either changes, debounced so typing doesn't flood the local host with one
 * request per keystroke. This is the "always on" half of the feature:
 * nothing here is gated by a mode or a toggle — every mounted field always
 * tries. `registry` must be referentially stable across renders that don't
 * actually change its contents (memoize it by the real entries, not
 * recreate it inline) — a new object every render would debounce-thrash.
 */
export function useDebouncedExpressionEval(
  expr: string,
  registry: Record<string, string>,
): DebouncedExpressionEval {
  const [state, setState] = useState<DebouncedExpressionEval>({
    result: null,
    isEvaluating: true,
    hostUnreachable: false,
  })

  useEffect(() => {
    // Blank is "nothing typed yet", not a syntax error — a freshly focused
    // empty field must not greet you with a red diagnostic before you've
    // typed a single character.
    if (expr.trim() === '') {
      setState({ result: { ok: true, value: '', repr: '', error: null, usedNames: [] }, isEvaluating: false, hostUnreachable: false })
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setState((current) => ({ ...current, isEvaluating: true }))
    const timer = globalThis.setTimeout(async () => {
      try {
        const result = await evaluateExpression(expr, registry, { signal: controller.signal })
        if (cancelled) return
        setState({ result, isEvaluating: false, hostUnreachable: false })
      } catch (cause) {
        if (cancelled) return
        if (isExpressionHostUnreachable(cause)) {
          setState((current) => ({ ...current, isEvaluating: false, hostUnreachable: true }))
          return
        }
        throw cause
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      controller.abort()
      globalThis.clearTimeout(timer)
    }
  }, [expr, registry])

  return state
}
