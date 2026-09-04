/**
 * Document text is payload, not a friendly identifier. Preserve every
 * non-empty stored character when it crosses into a visible label; use a
 * fallback only for an actually absent (`''`) field. Geometry may abbreviate
 * with an ellipsis, but it must leave the full raw string available nearby.
 */
export function storedTextOr(value: string, fallback: string): string {
  return value === '' ? fallback : value
}
