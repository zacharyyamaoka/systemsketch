import { useSyncExternalStore } from 'react'

export const INTERFACE_SCALE_STORAGE_KEY = 'systemsketch.interface-scale.v1'
export const MIN_INTERFACE_SCALE = 80
export const MAX_INTERFACE_SCALE = 160
export const INTERFACE_SCALE_STEP = 5
export const DEFAULT_INTERFACE_SCALE = 100
export const INTERFACE_SCALE_PRESETS = [90, 100, 110, 125, 150] as const

interface StoredInterfaceScale {
  version: 1
  percent: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeInterfaceScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_INTERFACE_SCALE
  const stepped = Math.round(value / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP
  return Math.min(MAX_INTERFACE_SCALE, Math.max(MIN_INTERFACE_SCALE, stepped))
}

export function parseStoredInterfaceScale(value: unknown): number {
  if (!isRecord(value) || value.version !== 1 || typeof value.percent !== 'number') {
    return DEFAULT_INTERFACE_SCALE
  }
  return normalizeInterfaceScale(value.percent)
}

export function readInterfaceScale(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): number {
  try {
    const stored = storage.getItem(INTERFACE_SCALE_STORAGE_KEY)
    return stored === null
      ? DEFAULT_INTERFACE_SCALE
      : parseStoredInterfaceScale(JSON.parse(stored))
  } catch {
    return DEFAULT_INTERFACE_SCALE
  }
}

export function writeInterfaceScale(
  percent: number,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): number {
  const normalized = normalizeInterfaceScale(percent)
  const stored: StoredInterfaceScale = { version: 1, percent: normalized }
  try {
    storage.setItem(INTERFACE_SCALE_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Interface scale is a convenience preference; drawing must keep working.
  }
  return normalized
}

let snapshot = DEFAULT_INTERFACE_SCALE
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readInterfaceScale()
}

export function getInterfaceScale(): number {
  hydrate()
  return snapshot
}

export function updateInterfaceScale(percent: number): number {
  hydrate()
  const next = writeInterfaceScale(percent)
  if (next === snapshot) return snapshot
  snapshot = next
  listeners.forEach((listener) => listener())
  return snapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInterfaceScale(): number {
  return useSyncExternalStore(subscribe, getInterfaceScale, () => DEFAULT_INTERFACE_SCALE)
}

export function interfaceScaleCssValues(percent: number): {
  scale: string
  inverse: string
} {
  const normalized = normalizeInterfaceScale(percent)
  return {
    scale: String(normalized / 100),
    inverse: String(100 / normalized),
  }
}
