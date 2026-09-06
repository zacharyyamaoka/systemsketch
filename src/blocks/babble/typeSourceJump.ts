import { atom } from 'tldraw'

/**
 * Cross-shape "go here" for the attribute babble's expanded, foreign rows.
 *
 * A nested row inside an expanded preview (`pose: Pose`'s own `x`/`y`/`z`) is
 * rendered by THIS block's tree, but its source lives in a DIFFERENT Type
 * block's own `useSourceToggleEditor` instance — one React component per
 * shape, each with its own private mode/draft state. There is no prop path
 * from the row that was clicked to the owner's already-mounted editor, so the
 * click instead leaves a request here; the owner's own hook (subscribed by
 * shape id) picks it up on its next render and enters Source mode itself.
 * Ephemeral and unpersisted — this is a one-shot instruction, not state.
 */
export const pendingSourceJump = atom<{ blockId: string; offset: number } | null>(
	'pending type source jump',
	null,
)

export function requestSourceJump(blockId: string, offset: number): void {
	pendingSourceJump.set({ blockId, offset })
}

/** Called by the shape named `blockId`, from an effect (not a derivation) —
 * this clears the shared request, so it must run as a side effect once, never
 * during render. */
export function consumeSourceJump(blockId: string): number | null {
	const pending = pendingSourceJump.get()
	if (!pending || pending.blockId !== blockId) return null
	pendingSourceJump.set(null)
	return pending.offset
}
