/**
 * Whether the live-tuning panel is open.
 *
 * WHY a separate store rather than dialog state: a sensitivity is judged by
 * FEEL, and feel needs the board — the modal Settings dialog blocks canvas
 * interaction, which makes tuning it against a moving board impossible. This
 * opens a small non-modal panel beside the board instead, so the Settings
 * dialog stays the place you SET a value and this becomes the place you FEEL
 * one out.
 */
let open = false
const listeners = new Set<() => void>()

export function isGestureTuningOpen(): boolean { return open }

export function setGestureTuningOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const listener of listeners) listener()
}

export function subscribeGestureTuning(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
