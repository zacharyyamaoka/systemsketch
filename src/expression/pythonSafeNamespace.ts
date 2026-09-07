/**
 * Display-only mirror of the backend's safe-eval namespace
 * (`scripts/expression_eval.py`). Used purely to populate the autocomplete
 * list with function names and a short signature hint — the backend remains
 * the only place that actually decides what is callable; getting this list
 * out of sync would make autocomplete misleading, never make evaluation
 * unsafe, since real evaluation never happens client-side.
 */
export interface SafeNamespaceEntry {
  name: string
  signature: string
}

export const PYTHON_SAFE_NAMESPACE: readonly SafeNamespaceEntry[] = [
  { name: 'abs', signature: 'abs(x)' },
  { name: 'round', signature: 'round(x, ndigits=0)' },
  { name: 'min', signature: 'min(*values)' },
  { name: 'max', signature: 'max(*values)' },
  { name: 'pow', signature: 'pow(x, y)' },
  { name: 'sum', signature: 'sum(values)' },
  { name: 'len', signature: 'len(x)' },
  { name: 'clamp', signature: 'clamp(x, lo, hi)' },
  { name: 'sin', signature: 'sin(x)' },
  { name: 'cos', signature: 'cos(x)' },
  { name: 'tan', signature: 'tan(x)' },
  { name: 'sqrt', signature: 'sqrt(x)' },
  { name: 'floor', signature: 'floor(x)' },
  { name: 'ceil', signature: 'ceil(x)' },
  { name: 'radians', signature: 'radians(x)' },
  { name: 'degrees', signature: 'degrees(x)' },
  { name: 'log', signature: 'log(x, base=e)' },
  { name: 'log2', signature: 'log2(x)' },
  { name: 'log10', signature: 'log10(x)' },
  { name: 'exp', signature: 'exp(x)' },
  { name: 'pi', signature: 'pi' },
  { name: 'e', signature: 'e' },
]

const NAMES = new Set(PYTHON_SAFE_NAMESPACE.map((entry) => entry.name))

export function isSafeNamespaceName(name: string): boolean {
  return NAMES.has(name)
}
