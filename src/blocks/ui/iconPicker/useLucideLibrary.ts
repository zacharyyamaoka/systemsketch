/**
 * Subscribes a component to the lazily-loaded Lucide chunk, kicking off the
 * load the first time a Block or the picker asks for an icon outside the
 * curated static set. Returns null until the JSON chunk has resolved once.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { loadLucideLibrary, peekLucideLibrary, subscribeLucideLibrary, type LucideLibrary } from './lucideLibrary'

export function useLucideLibrary(): LucideLibrary | null {
	const library = useSyncExternalStore(subscribeLucideLibrary, peekLucideLibrary)
	useEffect(() => {
		// WHY: `loadLucideLibrary()` is idempotent (checks `loaded`/`loading`
		// before starting the import), so re-running this on every null render
		// only ever starts the one chunk fetch.
		if (!library) void loadLucideLibrary()
	}, [library])
	return library
}
