/**
 * Append one host write while checking its session at execution time.
 *
 * A message can be current when received but wait behind an in-flight IDE
 * edit. If a source edit reloads the canvas meanwhile, the queued work belongs
 * to the old webview session and must disappear without touching the new one.
 */
export function enqueueSessionWrite(
  previous: Promise<void>,
  queuedSession: string,
  currentSession: () => string,
  write: () => Promise<void>,
): Promise<void> {
  return previous.then(async () => {
    if (queuedSession !== currentSession()) return
    await write()
  })
}
