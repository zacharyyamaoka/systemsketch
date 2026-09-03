import { useSyncExternalStore } from 'react'
import type { Editor } from 'tldraw'
import {
  DEFAULT_WINDOW_MS,
  FlightRecorder,
  clampWindowMs,
  type RecorderMode,
} from './flightRecorder'
import {
  armRecorder,
  readLastRecording,
  saveRecording,
  type CanvasFrame,
  type FramesSource,
  type SavedRecording,
} from './recorderClient'

/**
 * One recorder per page, and one small external store the UI reads.
 *
 * Policy, in one line: recording is explicit. Nothing listens or asks Chrome
 * for frames until the person presses Start; Stop saves and copies the packet.
 * A forgotten take is cancelled and discarded at the one-minute safety cap.
 * The older retrospective policy remains below as dormant code, not UI.
 */

export const RECORDER_ENABLED_KEY = 'systemsketch.recorder.enabled.v1'
export const RECORDER_WINDOW_KEY = 'systemsketch.recorder.window-ms.v1'
export const EXPLICIT_RECORDING_LIMIT_MS = 60_000

export interface RecorderChannelInfo {
  channel: string
  build: string
  version: string
}

export interface RecorderUiState {
  /** The recorder exists on this page at all (never in an embedded host). */
  installed: boolean
  enabled: boolean
  windowMs: number
  mode: 'idle' | 'take'
  takeStartedAt: number | null
  saving: boolean
  last: SavedRecording | null
  error: string | null
  notice: string | null
  clipboard: 'copied' | 'failed' | null
  framesSource: FramesSource | 'unknown'
  framesReason: string
}

const INITIAL: RecorderUiState = {
  installed: false,
  enabled: false,
  windowMs: EXPLICIT_RECORDING_LIMIT_MS,
  mode: 'idle',
  takeStartedAt: null,
  saving: false,
  last: null,
  error: null,
  notice: null,
  clipboard: null,
  framesSource: 'unknown',
  framesReason: '',
}

let state: RecorderUiState = INITIAL
let recorder: FlightRecorder | null = null
let editorRef: Editor | null = null
let channelInfo: RecorderChannelInfo = { channel: 'unknown', build: 'unknown', version: '' }
let takeTimer: ReturnType<typeof setTimeout> | null = null
let takeStartCanvasFrame: CanvasFrame | null = null
let hostSyncGeneration = 0
const listeners = new Set<() => void>()

function emit(next: Partial<RecorderUiState>): void {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRecorderState(): RecorderUiState {
  return state
}

export function useRecorderState(): RecorderUiState {
  return useSyncExternalStore(subscribe, getRecorderState, () => INITIAL)
}

export function defaultRecorderEnabled(): boolean {
  return import.meta.env.DEV
}

export function readStoredEnabled(): boolean | null {
  try {
    const stored = window.localStorage.getItem(RECORDER_ENABLED_KEY)
    return stored === 'on' ? true : stored === 'off' ? false : null
  } catch {
    return null
  }
}

export function readStoredWindowMs(): number {
  try {
    const stored = Number(window.localStorage.getItem(RECORDER_WINDOW_KEY))
    return stored > 0 ? clampWindowMs(stored) : DEFAULT_WINDOW_MS
  } catch {
    return DEFAULT_WINDOW_MS
  }
}

function persist(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A private window still records; it just forgets the preference.
  }
}

/** Tell the host whether this page wants frames; remember what it can offer. */
async function syncHost(enabled: boolean): Promise<void> {
  const generation = ++hostSyncGeneration
  try {
    const status = await armRecorder(enabled, window.location.href)
    if (generation !== hostSyncGeneration) return
    emit({ framesSource: status.screencast ? 'screencast' : 'canvas', framesReason: status.reason })
  } catch (cause) {
    if (generation !== hostSyncGeneration) return
    emit({ framesSource: 'canvas', framesReason: cause instanceof Error ? cause.message : String(cause) })
  }
}

function startRecorder(windowMs = state.windowMs): void {
  if (!editorRef || recorder?.running) return
  recorder?.stop()
  recorder = new FlightRecorder(editorRef, { windowMs })
  recorder.start()
}

function stopRecorder(): void {
  clearTakeTimer()
  recorder?.stop()
  recorder = null
  emit({ mode: 'idle', takeStartedAt: null })
}

function clearTakeTimer(): void {
  if (takeTimer) clearTimeout(takeTimer)
  takeTimer = null
}

/**
 * Installed from `onMount`, like every other `install*(editor)` here. Returns
 * the disposer. Never installed in an embedded IDE host, which has no Dev menu
 * and no local host to write to.
 */
export function installFlightRecorder(editor: Editor): () => void {
  editorRef = editor
  emit({
    installed: true,
    enabled: true,
    windowMs: EXPLICIT_RECORDING_LIMIT_MS,
    error: null,
    notice: null,
  })
  // Retrospective mode is intentionally parked. Keeping these calls here as
  // code-shaped documentation makes restoring the old opt-in policy small:
  // const enabled = readStoredEnabled() ?? defaultRecorderEnabled()
  // if (enabled) startRecorder(readStoredWindowMs())
  // void syncHost(enabled)
  void syncHost(false)
  void readLastRecording().then((last) => { if (last) emit({ last }) }).catch(() => undefined)
  return () => {
    stopRecorder()
    void syncHost(false)
    editorRef = null
    emit({ installed: false })
  }
}

export function setRecorderChannel(info: Partial<RecorderChannelInfo>): void {
  channelInfo = { ...channelInfo, ...info }
}

export function setRecorderEnabled(enabled: boolean): void {
  persist(RECORDER_ENABLED_KEY, enabled ? 'on' : 'off')
  emit({ enabled, error: null })
  if (enabled) startRecorder()
  else stopRecorder()
  void syncHost(enabled)
}

export function setRecorderWindowMs(windowMs: number): void {
  const next = clampWindowMs(windowMs)
  persist(RECORDER_WINDOW_KEY, String(next))
  emit({ windowMs: next })
  // A new window means a new ring; the old rows are trimmed on the next push
  // anyway, but a take in flight must not silently change length.
  if (recorder?.running && state.mode === 'idle') {
    recorder.stop()
    recorder = null
    startRecorder()
  }
}

/** The shapes-only fallback frame, when no screencast can see the page. */
async function canvasFrame(t: number): Promise<CanvasFrame | null> {
  if (!editorRef) return null
  try {
    const ids = [...editorRef.getCurrentPageShapeIds()]
    if (ids.length === 0) return null
    const { blob } = await editorRef.toImage(ids, { format: 'png', scale: 0.5, background: true })
    const buffer = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let index = 0; index < buffer.length; index += 1) binary += String.fromCharCode(buffer[index])
    return { t, png: btoa(binary) }
  } catch {
    return null
  }
}

export async function startTake(): Promise<void> {
  if (!editorRef || state.mode === 'take') return
  startRecorder(EXPLICIT_RECORDING_LIMIT_MS)
  if (!recorder?.running) return
  recorder.beginTake()
  takeStartCanvasFrame = null
  emit({
    mode: 'take',
    takeStartedAt: Date.now(),
    windowMs: EXPLICIT_RECORDING_LIMIT_MS,
    error: null,
    notice: null,
    clipboard: null,
  })
  void syncHost(true)
  // Always prepare a cheap shapes-only first frame. It is used only when the
  // host cannot provide a screencast, but does not race the visible Start.
  void canvasFrame(0).then((frame) => {
    if (state.mode === 'take' && recorder?.isTaking) takeStartCanvasFrame = frame
  })
  clearTakeTimer()
  takeTimer = setTimeout(cancelTake, EXPLICIT_RECORDING_LIMIT_MS)
}

export async function stopTake(note = ''): Promise<SavedRecording | null> {
  if (state.mode !== 'take') return null
  return saveNow('take', note)
}

/** A forgotten recording is discarded rather than silently saved as evidence. */
export function cancelTake(): void {
  if (state.mode !== 'take') return
  clearTakeTimer()
  takeStartCanvasFrame = null
  recorder?.stop()
  recorder = null
  void syncHost(false)
  emit({
    mode: 'idle',
    takeStartedAt: null,
    saving: false,
    error: null,
    clipboard: null,
    notice: 'Cancelled at the 1 min safety limit · nothing saved',
  })
}

/**
 * Parked retrospective path. It is intentionally absent from the interface;
 * keep it working so a later machine-oriented capture mode can opt back in.
 */
export async function saveLast(note = ''): Promise<SavedRecording | null> {
  return saveNow('last', note)
}

async function saveNow(mode: RecorderMode, note: string): Promise<SavedRecording | null> {
  if (!recorder?.running) {
    emit({ error: 'The recorder is off. Turn it on to record.' })
    return null
  }
  if (state.saving) return null
  clearTakeTimer()
  emit({ saving: true, error: null, notice: null, clipboard: null })
  try {
    const payload = recorder.collect(mode, note)
    // The host's availability probe only proves that a debugging port exists;
    // Chrome may still have zero attached targets or deliver no frames before
    // a very short take stops. Always send the two cheap shapes-only frames and
    // let the writer prefer screencast frames when its dump is non-empty.
    const canvasFrames: CanvasFrame[] = []
    if (mode === 'take' && takeStartCanvasFrame) canvasFrames.push(takeStartCanvasFrame)
    const end = await canvasFrame(payload.header.durationMs)
    if (end) canvasFrames.push(end)
    takeStartCanvasFrame = null
    const saved = await saveRecording(payload, { ...channelInfo, canvasFrames })
    stopRecorder()
    void syncHost(false)
    emit({ last: saved, mode: 'idle', takeStartedAt: null, saving: false })
    await copyToClipboard(saved.packet)
    return saved
  } catch (cause) {
    takeStartCanvasFrame = null
    stopRecorder()
    void syncHost(false)
    emit({ saving: false, mode: 'idle', takeStartedAt: null, error: cause instanceof Error ? cause.message : String(cause) })
    return null
  }
}

export async function copyLastRecording(): Promise<void> {
  let last = state.last
  if (!last) {
    try {
      last = await readLastRecording()
      if (last) emit({ last })
    } catch (cause) {
      emit({ error: cause instanceof Error ? cause.message : String(cause) })
      return
    }
  }
  if (!last) {
    emit({ error: 'No recording has been saved yet.' })
    return
  }
  await copyToClipboard(last.packet)
}

/**
 * A failed clipboard write is reported as a failure, never as success — the
 * copy-for-claude template learned that the hard way. `execCommand` is the
 * fallback for a document that has lost focus; if both refuse, the row says so
 * and "Copy last recording" is the retry.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    emit({ clipboard: 'copied' })
    return true
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    emit({ clipboard: ok ? 'copied' : 'failed' })
    return ok
  } catch {
    emit({ clipboard: 'failed' })
    return false
  }
}

export function addRecorderMark(text: string): void {
  recorder?.mark(text)
}

/** Test seam: the live recorder, for journeys that read buffer sizes. */
export function currentFlightRecorder(): FlightRecorder | null {
  return recorder
}
