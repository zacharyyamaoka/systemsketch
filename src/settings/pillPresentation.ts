import { useSyncExternalStore } from 'react'

/**
 * The Phase 2 ink-pass comparison lab: which structural layout and which
 * style skin the selection pill renders, and whether the on-canvas switcher
 * chip is showing at all.
 *
 * WHY `compare` gates both the chip AND the layout/skin effect (see
 * `AppearanceControls.tsx`, `SelectionContextualMenu.tsx`): the shipped,
 * judge-passed pill must render byte-identically to before this feature
 * existed whenever Zach is not actively comparing — a stored `layout: 'v1'`
 * left over from a previous session must never silently change the pill he
 * sees on an ordinary day.
 */
export type PillLayout = 'default' | 'v1' | 'v3'
export type PillSkin = 'default' | '1' | '2' | '3' | '4' | '5'

export const PILL_PRESENTATION_STORAGE_KEY = 'systemsketch.pill-presentation.v1'
export const DEFAULT_PILL_PRESENTATION: PillPresentation = {
  layout: 'default',
  skin: 'default',
  compare: false,
}

export interface PillPresentation {
  layout: PillLayout
  skin: PillSkin
  compare: boolean
}

interface StoredPillPresentation extends PillPresentation {
  version: 1
}

const PILL_LAYOUTS: readonly PillLayout[] = ['default', 'v1', 'v3']
const PILL_SKINS: readonly PillSkin[] = ['default', '1', '2', '3', '4', '5']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizePillLayout(value: unknown): PillLayout {
  return typeof value === 'string' && (PILL_LAYOUTS as readonly string[]).includes(value)
    ? (value as PillLayout)
    : DEFAULT_PILL_PRESENTATION.layout
}

export function normalizePillSkin(value: unknown): PillSkin {
  return typeof value === 'string' && (PILL_SKINS as readonly string[]).includes(value)
    ? (value as PillSkin)
    : DEFAULT_PILL_PRESENTATION.skin
}

export function parseStoredPillPresentation(value: unknown): PillPresentation {
  if (!isRecord(value) || value.version !== 1) return DEFAULT_PILL_PRESENTATION
  return {
    layout: normalizePillLayout(value.layout),
    skin: normalizePillSkin(value.skin),
    compare: value.compare === true,
  }
}

export function readPillPresentation(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): PillPresentation {
  try {
    const stored = storage.getItem(PILL_PRESENTATION_STORAGE_KEY)
    return stored === null ? DEFAULT_PILL_PRESENTATION : parseStoredPillPresentation(JSON.parse(stored))
  } catch {
    return DEFAULT_PILL_PRESENTATION
  }
}

export function writePillPresentation(
  presentation: PillPresentation,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): PillPresentation {
  const normalized: PillPresentation = {
    layout: normalizePillLayout(presentation.layout),
    skin: normalizePillSkin(presentation.skin),
    compare: presentation.compare === true,
  }
  const stored: StoredPillPresentation = { version: 1, ...normalized }
  try {
    storage.setItem(PILL_PRESENTATION_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // A lab preference is a convenience; drawing must keep working.
  }
  return normalized
}

let snapshot = DEFAULT_PILL_PRESENTATION
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readPillPresentation()
}

export function getPillPresentation(): PillPresentation {
  hydrate()
  return snapshot
}

export function updatePillPresentation(patch: Partial<PillPresentation>): PillPresentation {
  hydrate()
  const next = writePillPresentation({ ...snapshot, ...patch })
  if (next.layout === snapshot.layout && next.skin === snapshot.skin && next.compare === snapshot.compare) {
    return snapshot
  }
  snapshot = next
  listeners.forEach((listener) => listener())
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePillPresentation(): PillPresentation {
  return useSyncExternalStore(subscribe, getPillPresentation, () => DEFAULT_PILL_PRESENTATION)
}
