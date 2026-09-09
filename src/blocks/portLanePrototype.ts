/**
 * The port-editor prototype switch.
 *
 * WHY an in-app switch and not a URL flag: Zach's rating on 2026-09-09 —
 * "I don't want to have to switch the url to test a variant; when doing
 * prototypes like this, just add a temporary drop-down selector to the UI".
 * The choice persists in this browser (localStorage), so a retained review
 * opens the way it was last left; `?portLanes=1|0` still overrides for a
 * journey that needs a fixed mode. It is prototype chrome: inert on every
 * ordinary board until the switch is used, and deleted when the prototype is
 * promoted or dropped.
 */
import { useSyncExternalStore } from 'react'

export const PORT_EDITOR_MODES = ['one-line', 'lanes'] as const
export type PortEditorMode = (typeof PORT_EDITOR_MODES)[number]

const STORAGE_KEY = 'systemsketch.prototype.portEditor'
const listeners = new Set<() => void>()

function stored(): PortEditorMode | null {
	try {
		const value = window.localStorage.getItem(STORAGE_KEY)
		return value === 'lanes' || value === 'one-line' ? value : null
	} catch {
		return null
	}
}

function fromUrl(): PortEditorMode | null {
	const value = new URLSearchParams(window.location.search).get('portLanes')
	if (value === '1') return 'lanes'
	if (value === '0') return 'one-line'
	return null
}

export function getPortEditorMode(): PortEditorMode {
	if (typeof window === 'undefined') return 'one-line'
	return fromUrl() ?? stored() ?? 'one-line'
}

export function setPortEditorMode(mode: PortEditorMode): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, mode)
	} catch {
		// A blocked storage still switches for this page.
	}
	listeners.forEach((listener) => listener())
}

export function subscribePortEditorMode(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function usePortEditorMode(): PortEditorMode {
	return useSyncExternalStore(subscribePortEditorMode, getPortEditorMode, () => 'one-line' as PortEditorMode)
}

export function portLanesEnabled(): boolean {
	return getPortEditorMode() === 'lanes'
}
