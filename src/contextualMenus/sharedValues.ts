import type { SharedStyle } from 'tldraw'

/**
 * THE one reduce for "do these agree?".
 *
 * WHY: every contextual surface needs "is this property the same across every
 * relevant subject, or mixed" — and each surface used to hand-roll its own
 * fold (`combineShared` in appearanceModel, `sharedEdgeValue` in strokeMeta,
 * a first+every in the appearance pill's arrow reading, an epsilon-compare in
 * customFontSize). Divergent copies of the same fold are how one menu says
 * mixed while its neighbour claims a value. Surfaces fold raw readings with
 * `sharedValueAcross` and already-folded readings with `combineSharedStyles`;
 * neither is reimplemented at a call site.
 *
 * `undefined` readings mean "this subject has nothing to say" and are skipped
 * rather than counted as disagreement; a set with no opinions folds to
 * `undefined`, never to a fabricated value.
 */
export function sharedValueAcross<T>(
  values: Iterable<T | undefined>,
  equals: (a: T, b: T) => boolean = Object.is,
): SharedStyle<T> | undefined {
  let found: T | undefined
  let has = false
  for (const value of values) {
    if (value === undefined) continue
    if (!has) {
      found = value
      has = true
    } else if (!equals(found as T, value)) {
      return { type: 'mixed' }
    }
  }
  return has ? { type: 'shared', value: found as T } : undefined
}

/** Fold readings that are already shared/mixed verdicts into one verdict. */
export function combineSharedStyles<T>(
  readings: readonly SharedStyle<T>[],
  equals?: (a: T, b: T) => boolean,
): SharedStyle<T> | undefined {
  if (readings.some((reading) => reading.type === 'mixed')) return { type: 'mixed' }
  return sharedValueAcross(
    readings.map((reading) => (reading as { type: 'shared'; value: T }).value),
    equals,
  )
}
