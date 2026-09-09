/**
 * The port-editor preference: how a Port-view Block's ports are edited.
 *
 * `multi-line` (default) — each side is one text box, a line per port, with
 * IDE line keys (Zach, 2026-09-09: "for people used to working in an IDE this
 * feels natural and fast"). `single-line` — the previous editor, one field per
 * port with drag-and-drop rows, kept for whoever it feels more natural to.
 * `laneStyle` is the remaining prototype choice inside multi-line: one solid
 * box per side, or ragged lines that each carry their own box.
 *
 * Stored in this browser (localStorage), read by Settings › Canvas and by the
 * bottom-right prototype drop-down alike, so there is one truth. WHY the
 * `?portLanes=` URL override survives: journeys that prove the single-line
 * editor pin it explicitly; it is never how a person switches (that was
 * rated Bad — see feedback_prototype_switch_in_app).
 */
import { useSyncExternalStore } from 'react'

export const PORT_EDITOR_KINDS = ['multi-line', 'single-line'] as const
export type PortEditorKind = (typeof PORT_EDITOR_KINDS)[number]
export const PORT_LANE_STYLES = ['solid', 'ragged'] as const
export type PortLaneStyle = (typeof PORT_LANE_STYLES)[number]

export interface PortEditorPreference {
	portEditor: PortEditorKind
	laneStyle: PortLaneStyle
}

export const DEFAULT_PORT_EDITOR_PREFERENCE: PortEditorPreference = Object.freeze({
	portEditor: 'multi-line',
	laneStyle: 'solid',
})

/** The drop-down's three faces of the same two keys. */
export const PORT_EDITOR_MODES = ['one-line', 'lanes', 'lanes-ragged'] as const
export type PortEditorMode = (typeof PORT_EDITOR_MODES)[number]

const STORAGE_KEY = 'systemsketch.portEditor.v1'
const listeners = new Set<() => void>()
let snapshot: PortEditorPreference | null = null

export function parseStoredPortEditorPreference(value: unknown): PortEditorPreference {
	if (typeof value !== 'object' || value === null) return DEFAULT_PORT_EDITOR_PREFERENCE
	const record = value as Record<string, unknown>
	const portEditor = (PORT_EDITOR_KINDS as readonly unknown[]).includes(record.portEditor)
		? record.portEditor as PortEditorKind
		: DEFAULT_PORT_EDITOR_PREFERENCE.portEditor
	const laneStyle = (PORT_LANE_STYLES as readonly unknown[]).includes(record.laneStyle)
		? record.laneStyle as PortLaneStyle
		: DEFAULT_PORT_EDITOR_PREFERENCE.laneStyle
	return { portEditor, laneStyle }
}

function read(): PortEditorPreference {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		return raw === null ? DEFAULT_PORT_EDITOR_PREFERENCE : parseStoredPortEditorPreference(JSON.parse(raw))
	} catch {
		return DEFAULT_PORT_EDITOR_PREFERENCE
	}
}

export function getPortEditorPreference(): PortEditorPreference {
	if (typeof window === 'undefined') return DEFAULT_PORT_EDITOR_PREFERENCE
	if (!snapshot) snapshot = read()
	return snapshot
}

export function updatePortEditorPreference(patch: Partial<PortEditorPreference>): PortEditorPreference {
	const current = getPortEditorPreference()
	const next = { ...current, ...patch }
	if (next.portEditor === current.portEditor && next.laneStyle === current.laneStyle) return current
	snapshot = next
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
	} catch {
		// A blocked storage still switches for this page.
	}
	listeners.forEach((listener) => listener())
	return next
}

export function subscribePortEditorPreference(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function usePortEditorPreference(): PortEditorPreference {
	return useSyncExternalStore(subscribePortEditorPreference, getPortEditorPreference, () => DEFAULT_PORT_EDITOR_PREFERENCE)
}

function fromUrl(): PortEditorMode | null {
	if (typeof window === 'undefined') return null
	const value = new URLSearchParams(window.location.search).get('portLanes')
	if (value === '1') return 'lanes'
	if (value === '0') return 'one-line'
	if (value === 'ragged') return 'lanes-ragged'
	return null
}

export function modeOf(preference: PortEditorPreference): PortEditorMode {
	if (preference.portEditor === 'single-line') return 'one-line'
	return preference.laneStyle === 'ragged' ? 'lanes-ragged' : 'lanes'
}

export function preferenceOf(mode: PortEditorMode): PortEditorPreference {
	if (mode === 'one-line') return { ...getPortEditorPreference(), portEditor: 'single-line' }
	return { portEditor: 'multi-line', laneStyle: mode === 'lanes-ragged' ? 'ragged' : 'solid' }
}

/** The effective mode: a journey's URL pin, else the stored preference. */
export function getPortEditorMode(): PortEditorMode {
	return fromUrl() ?? modeOf(getPortEditorPreference())
}

export function setPortEditorMode(mode: PortEditorMode): void {
	updatePortEditorPreference(preferenceOf(mode))
}

export function usePortEditorMode(): PortEditorMode {
	const preference = usePortEditorPreference()
	return fromUrl() ?? modeOf(preference)
}

export function portLanesEnabled(): boolean {
	return getPortEditorMode() !== 'one-line'
}

export function portLanesRagged(): boolean {
	return getPortEditorMode() === 'lanes-ragged'
}
