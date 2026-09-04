import type { Editor, TLCamera, TLPage, TLPageId } from 'tldraw'

/**
 * Board-owned, named camera poses.
 *
 * These are deliberately stored on the page rather than in browser preference
 * storage: a saved view explains how *this* board is usefully read, so it must
 * travel with a `.systemsketch` file and its collaborators. They are not
 * Frames, pages, or depth scopes — moving content does not silently move a
 * view, and following a view never changes the board's structure.
 */
export const BOARD_LANDMARKS_META_KEY = 'systemSketchLandmarks'
export const BOARD_LANDMARKS_VERSION = 1
const MAX_LANDMARK_NAME_LENGTH = 80

export interface BoardCameraPose {
  x: number
  y: number
  z: number
}

export interface BoardLandmark {
  id: string
  name: string
  camera: BoardCameraPose
}

interface StoredBoardLandmarks {
  version: number
  landmarks: BoardLandmark[]
}

export type LandmarkMutation =
  | { ok: true; landmark: BoardLandmark }
  | { ok: false; reason: 'missing' | 'invalid-name' | 'duplicate-name' }

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length > 0 && name.length <= MAX_LANDMARK_NAME_LENGTH ? name : null
}

function readLandmark(value: unknown): BoardLandmark | null {
  const candidate = object(value)
  if (!candidate || typeof candidate.id !== 'string') return null
  const name = validName(candidate.name)
  const camera = object(candidate.camera)
  if (!name || !camera || !finite(camera.x) || !finite(camera.y) || !finite(camera.z) || camera.z <= 0) {
    return null
  }
  return { id: candidate.id, name, camera: { x: camera.x, y: camera.y, z: camera.z } }
}

function readStored(value: unknown): StoredBoardLandmarks {
  const candidate = object(value)
  if (candidate?.version !== BOARD_LANDMARKS_VERSION || !Array.isArray(candidate.landmarks)) {
    return { version: BOARD_LANDMARKS_VERSION, landmarks: [] }
  }
  const ids = new Set<string>()
  const landmarks = candidate.landmarks.flatMap((value) => {
    const landmark = readLandmark(value)
    if (!landmark || ids.has(landmark.id)) return []
    ids.add(landmark.id)
    return [landmark]
  })
  return { version: BOARD_LANDMARKS_VERSION, landmarks }
}

function storedForPage(page: TLPage): StoredBoardLandmarks {
  return readStored((page.meta as Record<string, unknown>)[BOARD_LANDMARKS_META_KEY])
}

function cameraPose(camera: TLCamera): BoardCameraPose {
  return { x: camera.x, y: camera.y, z: camera.z }
}

function uniqueName(landmarks: readonly BoardLandmark[], name: string, exceptId?: string): boolean {
  const normalized = name.toLocaleLowerCase()
  return !landmarks.some((landmark) => landmark.id !== exceptId
    && landmark.name.toLocaleLowerCase() === normalized)
}

function write(editor: Editor, page: TLPage, landmarks: readonly BoardLandmark[]): void {
  editor.updatePage({
    id: page.id,
    meta: {
      ...page.meta,
      [BOARD_LANDMARKS_META_KEY]: {
        version: BOARD_LANDMARKS_VERSION,
        landmarks: [...landmarks],
      } as unknown as TLPage['meta'][string],
    },
  })
}

/** Return only valid v1 entries; malformed foreign metadata stays untouched until the user writes. */
export function getBoardLandmarks(editor: Editor, pageId = editor.getCurrentPageId()): BoardLandmark[] {
  const page = editor.getPage(pageId)
  return page ? storedForPage(page).landmarks : []
}

export function addBoardLandmark(
  editor: Editor,
  rawName: string,
  id = `landmark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
): LandmarkMutation {
  const page = editor.getCurrentPage()
  const name = validName(rawName)
  if (!name) return { ok: false, reason: 'invalid-name' }
  const stored = storedForPage(page)
  if (!uniqueName(stored.landmarks, name)) return { ok: false, reason: 'duplicate-name' }
  const landmark = { id, name, camera: cameraPose(editor.getCamera()) }
  write(editor, page, [...stored.landmarks, landmark])
  return { ok: true, landmark }
}

export function renameBoardLandmark(editor: Editor, id: string, rawName: string): LandmarkMutation {
  const page = editor.getCurrentPage()
  const name = validName(rawName)
  if (!name) return { ok: false, reason: 'invalid-name' }
  const stored = storedForPage(page)
  const previous = stored.landmarks.find((landmark) => landmark.id === id)
  if (!previous) return { ok: false, reason: 'missing' }
  if (!uniqueName(stored.landmarks, name, id)) return { ok: false, reason: 'duplicate-name' }
  const landmark = { ...previous, name }
  write(editor, page, stored.landmarks.map((entry) => entry.id === id ? landmark : entry))
  return { ok: true, landmark }
}

export function removeBoardLandmark(editor: Editor, id: string): boolean {
  const page = editor.getCurrentPage()
  const stored = storedForPage(page)
  if (!stored.landmarks.some((landmark) => landmark.id === id)) return false
  write(editor, page, stored.landmarks.filter((landmark) => landmark.id !== id))
  return true
}

/** Camera-only navigation keeps selection, tool, and structural depth intact. */
export function focusBoardLandmark(editor: Editor, id: string): boolean {
  const landmark = getBoardLandmarks(editor).find((entry) => entry.id === id)
  if (!landmark) return false
  editor.setCamera(landmark.camera, { animation: { duration: 220 } })
  return true
}

/** A stable short label is easier to use in an empty state than an invented example view. */
export function suggestedLandmarkName(landmarks: readonly BoardLandmark[]): string {
  let ordinal = landmarks.length + 1
  while (landmarks.some((landmark) => landmark.name === `View ${ordinal}`)) ordinal += 1
  return `View ${ordinal}`
}

export function landmarkPageId(editor: Editor): TLPageId {
  return editor.getCurrentPageId()
}
