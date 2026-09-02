import type { RecordingPayload } from './flightRecorder'

/**
 * The host side of a recording, over the same `/api` the workspace uses.
 *
 * `arm` tells the host whether this page wants frames, so it can start or
 * stop the screencast sidecar. `save` hands over the buffer and gets back the
 * folder and the packet the host wrote. `last` is what "Copy last recording"
 * reads, so the clipboard can be refilled after a reload.
 */

export type FramesSource = 'screencast' | 'canvas' | 'none'

export interface RecorderHostStatus {
  screencast: boolean
  reason: string
}

export interface SavedRecording {
  path: string
  packet: string
  savedAt: string
  frames: number
  framesSource: FramesSource
}

export interface CanvasFrame {
  t: number
  png: string
}

async function expectJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`the local SystemSketch controller returned non-JSON (${response.status})`)
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error
    throw new Error(typeof error === 'string' ? error : `recording request failed (${response.status})`)
  }
  return payload as T
}

export async function armRecorder(enabled: boolean, url: string): Promise<RecorderHostStatus> {
  return expectJson(await fetch('/api/recordings/arm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, url }),
  }))
}

export async function readRecorderHostStatus(): Promise<RecorderHostStatus> {
  return expectJson(await fetch('/api/recordings/status', { cache: 'no-store' }))
}

export async function saveRecording(
  payload: RecordingPayload,
  extras: { channel: string; build: string; version: string; canvasFrames?: CanvasFrame[] },
): Promise<SavedRecording> {
  return expectJson(await fetch('/api/recordings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...extras }),
  }))
}

export async function readLastRecording(): Promise<SavedRecording | null> {
  const payload = await expectJson<{ recording: SavedRecording | null }>(
    await fetch('/api/recordings/last', { cache: 'no-store' }),
  )
  return payload.recording ?? null
}
