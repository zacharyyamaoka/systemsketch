import type { Editor, TLCamera, TLPage, TLPageId } from 'tldraw'

/** Board-owned named camera poses, persisted with a board rather than a browser. */
export const BOARD_LANDMARKS_META_KEY = 'systemSketchLandmarks'
export const BOARD_LANDMARKS_VERSION = 1
const MAX_LANDMARK_NAME_LENGTH = 80

export interface BoardCameraPose { x: number; y: number; z: number }
export interface BoardLandmark { id: string; name: string; camera: BoardCameraPose }

export type BoardLandmarkState =
  | { kind: 'ready'; landmarks: BoardLandmark[] }
  | { kind: 'unsupported-version'; version: unknown }
  | { kind: 'malformed' }
type ReadyLandmarkState = Extract<BoardLandmarkState, { kind: 'ready' }>

export type LandmarkFailureReason =
  | 'missing' | 'invalid-name' | 'duplicate-name' | 'unsupported-version'
  | 'malformed' | 'readonly' | 'unchanged'
export type LandmarkMutation =
  | { ok: true; landmark: BoardLandmark }
  | { ok: false; reason: LandmarkFailureReason }

export interface ImportedLandmarkPage {
  page: TLPage
  /** Page-space displacement applied to the former page's content. */
  displacement: { x: number; y: number }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function validName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length > 0 && name.length <= MAX_LANDMARK_NAME_LENGTH ? name : null
}
function normalizedName(name: string): string { return name.trim().toLocaleLowerCase() }
function validId(value: unknown): string | null { return typeof value === 'string' && value.trim().length > 0 ? value : null }

function readLandmark(value: unknown): BoardLandmark | null {
  const candidate = object(value)
  const id = candidate ? validId(candidate.id) : null
  const name = candidate ? validName(candidate.name) : null
  const camera = candidate ? object(candidate.camera) : null
  if (!id || !name || !camera || !finite(camera.x) || !finite(camera.y) || !finite(camera.z) || camera.z <= 0) return null
  return { id, name, camera: { x: camera.x, y: camera.y, z: camera.z } }
}

function readState(value: unknown): BoardLandmarkState {
  if (value === undefined) return { kind: 'ready', landmarks: [] }
  const candidate = object(value)
  if (!candidate || candidate.version !== BOARD_LANDMARKS_VERSION) return { kind: 'unsupported-version', version: candidate?.version }
  if (!Array.isArray(candidate.landmarks)) return { kind: 'malformed' }
  const ids = new Set<string>()
  const names = new Set<string>()
  const landmarks: BoardLandmark[] = []
  for (const raw of candidate.landmarks) {
    const landmark = readLandmark(raw)
    if (!landmark || ids.has(landmark.id) || names.has(normalizedName(landmark.name))) {
      // WHY: a malformed record may be future tooling's data. Do not silently
      // "repair" it during a normal save, rename, or delete by writing less.
      return { kind: 'malformed' }
    }
    ids.add(landmark.id)
    names.add(normalizedName(landmark.name))
    landmarks.push(landmark)
  }
  return { kind: 'ready', landmarks }
}
function stateForPage(page: TLPage): BoardLandmarkState {
  return readState((page.meta as Record<string, unknown>)[BOARD_LANDMARKS_META_KEY])
}
function cameraPose(camera: TLCamera): BoardCameraPose { return { x: camera.x, y: camera.y, z: camera.z } }
function mutationFailure(value: BoardLandmarkState | LandmarkMutation): value is Extract<LandmarkMutation, { ok: false }> {
  return 'ok' in value && !value.ok
}
function readyOrFailure(editor: Editor, page: TLPage): ReadyLandmarkState | Extract<LandmarkMutation, { ok: false }> {
  if (editor.getIsReadonly()) return { ok: false, reason: 'readonly' }
  const state = stateForPage(page)
  if (state.kind === 'unsupported-version') return { ok: false, reason: 'unsupported-version' }
  if (state.kind === 'malformed') return { ok: false, reason: 'malformed' }
  return state
}
function hasName(landmarks: readonly BoardLandmark[], name: string, exceptId?: string): boolean {
  const normalized = normalizedName(name)
  return landmarks.some((landmark) => landmark.id !== exceptId && normalizedName(landmark.name) === normalized)
}

function write(editor: Editor, page: TLPage, landmarks: readonly BoardLandmark[], historyLabel: string): void {
  // WHY: page metadata shares tldraw's undo history. A separate mark keeps a
  // bookmark edit from coalescing with a preceding drag or text edit.
  editor.markHistoryStoppingPoint(historyLabel)
  editor.updatePage({
    id: page.id,
    meta: {
      ...page.meta,
      [BOARD_LANDMARKS_META_KEY]: { version: BOARD_LANDMARKS_VERSION, landmarks: [...landmarks] } as unknown as TLPage['meta'][string],
    },
  })
}

/** Read state as well as values, so an unknown version can never become an empty v1 list. */
export function getBoardLandmarkState(editor: Editor, pageId = editor.getCurrentPageId()): BoardLandmarkState {
  const page = editor.getPage(pageId)
  return page ? stateForPage(page) : { kind: 'malformed' }
}
export function getBoardLandmarks(editor: Editor, pageId = editor.getCurrentPageId()): BoardLandmark[] {
  const state = getBoardLandmarkState(editor, pageId)
  return state.kind === 'ready' ? state.landmarks : []
}

export function addBoardLandmark(editor: Editor, rawName: string, id = `landmark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): LandmarkMutation {
  const page = editor.getCurrentPage()
  const name = validName(rawName)
  if (!name) return { ok: false, reason: 'invalid-name' }
  const state = readyOrFailure(editor, page)
  if (mutationFailure(state)) return state
  if (hasName(state.landmarks, name)) return { ok: false, reason: 'duplicate-name' }
  if (!validId(id) || state.landmarks.some((landmark) => landmark.id === id)) return { ok: false, reason: 'malformed' }
  const landmark = { id, name, camera: cameraPose(editor.getCamera()) }
  write(editor, page, [...state.landmarks, landmark], 'save board landmark')
  return { ok: true, landmark }
}

export function renameBoardLandmark(editor: Editor, id: string, rawName: string): LandmarkMutation {
  const page = editor.getCurrentPage()
  const name = validName(rawName)
  if (!name) return { ok: false, reason: 'invalid-name' }
  const state = readyOrFailure(editor, page)
  if (mutationFailure(state)) return state
  const previous = state.landmarks.find((landmark) => landmark.id === id)
  if (!previous) return { ok: false, reason: 'missing' }
  if (previous.name === name) return { ok: false, reason: 'unchanged' }
  if (hasName(state.landmarks, name, id)) return { ok: false, reason: 'duplicate-name' }
  const landmark = { ...previous, name }
  write(editor, page, state.landmarks.map((entry) => entry.id === id ? landmark : entry), 'rename board landmark')
  return { ok: true, landmark }
}

export function removeBoardLandmark(editor: Editor, id: string): LandmarkMutation {
  const page = editor.getCurrentPage()
  const state = readyOrFailure(editor, page)
  if (mutationFailure(state)) return state
  const landmark = state.landmarks.find((entry) => entry.id === id)
  if (!landmark) return { ok: false, reason: 'missing' }
  write(editor, page, state.landmarks.filter((entry) => entry.id !== id), 'delete board landmark')
  return { ok: true, landmark }
}

/** Camera-only navigation keeps selection, tool, zoom intent, and structural depth intact. */
export function focusBoardLandmark(editor: Editor, id: string): boolean {
  const landmark = getBoardLandmarks(editor).find((entry) => entry.id === id)
  if (!landmark) return false
  editor.setCamera(landmark.camera, { animation: { duration: 220 } })
  return true
}

function stableImportedId(ids: Set<string>, pageId: string, original: string): string {
  if (!ids.has(original)) return original
  const prefix = `${pageId.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'}:${original}`
  let candidate = prefix
  for (let ordinal = 2; ids.has(candidate); ordinal += 1) candidate = `${prefix}:${ordinal}`
  return candidate
}
function stableImportedName(names: Set<string>, sourcePageName: string, original: string): string {
  if (!names.has(normalizedName(original))) return original
  const prefix = `${sourcePageName || 'Imported board'} · ${original}`
  let candidate = prefix
  for (let ordinal = 2; names.has(normalizedName(candidate)); ordinal += 1) candidate = `${prefix} (${ordinal})`
  return candidate
}

/**
 * Merge readable camera views when a legacy multi-page board becomes one canvas.
 *
 * A tldraw camera is a screen translation. If a page's content moves by `d`
 * page units, preserving that view moves the translation by `-d * zoom`.
 * This inverse is the same displacement fact as the imported Frame movement.
 * Unknown/malformed root metadata returns `null`, preserving it untouched.
 */
export function mergeImportedPageLandmarks(rootPage: TLPage, imported: readonly ImportedLandmarkPage[]): TLPage['meta'] | null {
  const root = stateForPage(rootPage)
  if (root.kind !== 'ready') return null
  const landmarks = [...root.landmarks]
  const ids = new Set(landmarks.map((landmark) => landmark.id))
  const names = new Set(landmarks.map((landmark) => normalizedName(landmark.name)))
  for (const source of imported) {
    if (source.page.id === rootPage.id) continue
    const state = stateForPage(source.page)
    if (state.kind !== 'ready') continue
    for (const original of state.landmarks) {
      const id = stableImportedId(ids, source.page.id, original.id)
      const name = stableImportedName(names, source.page.name, original.name)
      const landmark = { id, name, camera: {
        x: original.camera.x - source.displacement.x * original.camera.z,
        y: original.camera.y - source.displacement.y * original.camera.z,
        z: original.camera.z,
      } }
      ids.add(id); names.add(normalizedName(name)); landmarks.push(landmark)
    }
  }
  return {
    ...rootPage.meta,
    [BOARD_LANDMARKS_META_KEY]: { version: BOARD_LANDMARKS_VERSION, landmarks } as unknown as TLPage['meta'][string],
  }
}

export function suggestedLandmarkName(landmarks: readonly BoardLandmark[]): string {
  let ordinal = landmarks.length + 1
  while (landmarks.some((landmark) => normalizedName(landmark.name) === normalizedName(`View ${ordinal}`))) ordinal += 1
  return `View ${ordinal}`
}
export function landmarkPageId(editor: Editor): TLPageId { return editor.getCurrentPageId() }
