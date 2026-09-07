/**
 * The one bridge from a property's typed text to a real Python process.
 *
 * Every property box is "always on": the inspector sends whatever is typed
 * to the existing local Python host and shows back whatever it says, rather
 * than a client-side approximation of Python semantics — the standing rule
 * for this repo is that the canvas never derives or lints semantics itself.
 * This mirrors `workspaceClient.ts`'s request/timeout/error shape exactly,
 * at a much shorter timeout since a keystroke, not a save, is waiting on it.
 */

export interface UsedName {
  name: string
  /** Character offset into the evaluated expression string. */
  start: number
  end: number
  defined: boolean
  value: unknown
  error: string | null
}

export interface ExpressionEvalResult {
  ok: boolean
  value: unknown
  repr: string | null
  error: string | null
  usedNames: UsedName[]
}

export class ExpressionRequestTimeout extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`The local SystemSketch controller did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`)
    this.name = 'ExpressionRequestTimeout'
    this.timeoutMs = timeoutMs
  }
}

export class ExpressionTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionTransportError'
  }
}

export class ExpressionRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ExpressionRequestError'
    this.status = status
  }
}

const EVAL_TIMEOUT_MS = 4_000

/**
 * Evaluate `expr` against `registry` (name -> that name's own expression
 * string, so a registry entry may itself reference other registry entries).
 * Never throws for an expression that fails to evaluate — that is a normal
 * `{ok: false, ...}` result. It throws only for transport/timeout failures
 * (host unreachable, e.g. running `npm run dev` without the Preview API),
 * which callers should treat as "can't evaluate right now", not "invalid".
 */
export async function evaluateExpression(
  expr: string,
  registry: Record<string, string>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ExpressionEvalResult> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? EVAL_TIMEOUT_MS)
  const controller = new AbortController()
  let timedOut = false
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch('/api/expression/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expr, registry }),
      signal: controller.signal,
    })
    const text = await response.text()
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new ExpressionRequestError(
        `the local SystemSketch controller returned non-JSON (${response.status})`,
        response.status,
      )
    }
    if (!response.ok) {
      throw new ExpressionRequestError(
        typeof payload.error === 'string' ? payload.error : `request failed (${response.status})`,
        response.status,
      )
    }
    return {
      ok: payload.ok === true,
      value: payload.value ?? null,
      repr: typeof payload.repr === 'string' ? payload.repr : null,
      error: typeof payload.error === 'string' ? payload.error : null,
      usedNames: Array.isArray(payload.usedNames) ? (payload.usedNames as UsedName[]) : [],
    }
  } catch (cause) {
    if (timedOut) throw new ExpressionRequestTimeout(timeoutMs)
    if (cause instanceof TypeError) throw new ExpressionTransportError(cause.message)
    throw cause
  } finally {
    globalThis.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}

/** True for "the host isn't reachable right now" — never true for a normal eval failure. */
export function isExpressionHostUnreachable(cause: unknown): boolean {
  return cause instanceof ExpressionRequestTimeout || cause instanceof ExpressionTransportError
}
