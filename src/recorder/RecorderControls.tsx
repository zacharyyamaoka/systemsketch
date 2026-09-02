import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { WINDOW_CHOICES_MS } from './flightRecorder'
import {
  copyLastRecording,
  saveLast,
  setRecorderEnabled,
  setRecorderWindowMs,
  startTake,
  stopTake,
  useRecorderState,
} from './recorderStore'
import './recorder.css'

/**
 * The recorder's controls, in the Dev panel's own row grammar.
 *
 * Three verbs and one cap: save what just happened, record the next take,
 * copy the last packet again; the window is chosen from chips so it can never
 * be unset. `compact` is the same surface shrunk for the isolated presets,
 * whose chrome is a single identity bar rather than the Dev panel.
 */

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} s`
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, now - since)
}

function shortPath(path: string): string {
  const home = path.match(/^\/home\/[^/]+\//)?.[0]
  return home ? `~/${path.slice(home.length)}` : path
}

export function RecorderControls({ compact = false }: { compact?: boolean }) {
  const state = useRecorderState()
  const [note, setNote] = useState('')
  const elapsed = useElapsed(state.takeStartedAt)
  if (!state.installed) return null
  const taking = state.mode === 'take'
  const busy = state.saving
  const disabledReason = !state.enabled ? 'Recorder is off' : busy ? 'Saving…' : ''

  const onTake = () => {
    if (taking) void stopTake(note).then(() => setNote(''))
    else void startTake()
  }
  const onSaveLast = () => { void saveLast(note).then(() => setNote('')) }
  const framesLabel = state.framesSource === 'screencast'
    ? 'frames: Chrome screencast'
    : state.framesSource === 'canvas'
      ? 'frames: canvas only'
      : 'frames: checking…'

  if (compact) {
    return (
      <div className="systemsketch-recorder systemsketch-recorder--compact" data-testid="recorder-controls" data-mode={state.mode}>
        <button type="button" data-action="save-last" disabled={!state.enabled || busy} title={disabledReason || `Save the last ${seconds(state.windowMs)}`} onClick={onSaveLast}>
          ● Save last {seconds(state.windowMs)}
        </button>
        <button type="button" data-action="take" data-taking={taking || undefined} disabled={!state.enabled || busy} title={disabledReason} onClick={onTake}>
          {taking ? `■ Stop · ${(elapsed / 1000).toFixed(1)} s` : `▶ Record next ≤ ${seconds(state.windowMs)}`}
        </button>
        <button type="button" data-action="copy-last" disabled={!state.last} onClick={() => void copyLastRecording()}>
          ⧉ Copy last
        </button>
        <button type="button" data-action="toggle" aria-pressed={state.enabled} onClick={() => setRecorderEnabled(!state.enabled)}>
          {state.enabled ? 'Recorder on' : 'Recorder off'}
        </button>
        {state.clipboard ? <small data-clipboard={state.clipboard}>{state.clipboard === 'copied' ? 'Copied' : 'Clipboard write failed'}</small> : null}
        {state.error ? <small className="error">{state.error}</small> : null}
      </div>
    )
  }

  return (
    <div className="systemsketch-recorder" data-testid="recorder-controls" data-mode={state.mode} data-enabled={state.enabled}>
      <div className="systemsketch-dev-section-label">
        <span>Recording</span>
        <small>{state.enabled ? framesLabel : 'off on this channel'}</small>
      </div>

      <div className="systemsketch-dev-presets">
        <button
          type="button"
          className="systemsketch-dev-preset systemsketch-recorder__row"
          data-action="save-last"
          disabled={!state.enabled || busy || taking}
          title={disabledReason}
          onClick={onSaveLast}
        >
          <i aria-hidden="true" data-glyph="dot">●</i>
          <span>
            <b>Save the last {seconds(state.windowMs)}</b>
            <small>What just happened · frames + state + input → folder, packet on clipboard</small>
          </span>
          <em>{busy && !taking ? '…' : '⧉'}</em>
        </button>

        <button
          type="button"
          className="systemsketch-dev-preset systemsketch-recorder__row"
          data-action="take"
          data-taking={taking || undefined}
          disabled={!state.enabled || busy}
          title={disabledReason}
          onClick={onTake}
        >
          <i aria-hidden="true" data-glyph={taking ? 'stop' : 'play'}>{taking ? '■' : '▶'}</i>
          <span>
            <b>{taking ? `Stop and save · ${(elapsed / 1000).toFixed(1)} s` : `Record next ≤ ${seconds(state.windowMs)}`}</b>
            <small>{taking ? `Stops itself at ${seconds(state.windowMs)}` : 'Explicit take · red bar at the top · stops at the cap'}</small>
          </span>
          <em>{taking ? '■' : '↗'}</em>
        </button>

        <button
          type="button"
          className="systemsketch-dev-preset systemsketch-recorder__row"
          data-action="copy-last"
          disabled={!state.last || busy}
          onClick={() => void copyLastRecording()}
        >
          <i aria-hidden="true" data-glyph="copy">⧉</i>
          <span>
            <b>Copy last recording</b>
            <small data-testid="recorder-last-path">{state.last ? shortPath(state.last.path) : 'Nothing saved yet'}</small>
          </span>
          <em>{state.clipboard === 'copied' ? 'Copied' : state.clipboard === 'failed' ? 'Failed' : '⧉'}</em>
        </button>
      </div>

      <label className="systemsketch-recorder__note">
        <span>What went wrong?</span>
        <input
          type="text"
          value={note}
          placeholder="optional · becomes the first line of the packet"
          onChange={(event) => setNote(event.target.value)}
          data-testid="recorder-note"
        />
      </label>

      <div className="systemsketch-recorder__window">
        <span>window</span>
        {WINDOW_CHOICES_MS.map((choice) => (
          <button
            type="button"
            key={choice}
            data-window={choice}
            data-on={state.windowMs === choice || undefined}
            disabled={taking}
            onClick={() => setRecorderWindowMs(choice)}
          >
            {seconds(choice)}
          </button>
        ))}
        <button
          type="button"
          className="systemsketch-recorder__toggle"
          data-action="toggle"
          aria-pressed={state.enabled}
          onClick={() => setRecorderEnabled(!state.enabled)}
        >
          {state.enabled ? 'On' : 'Off'}
        </button>
      </div>

      {state.error ? <p className="systemsketch-panel-message systemsketch-panel-message--error">{state.error}</p> : null}
      {state.clipboard === 'failed' ? (
        <p className="systemsketch-panel-message systemsketch-panel-message--error">
          The clipboard refused the write. The folder is saved; use Copy last recording.
        </p>
      ) : null}
      {state.enabled && state.framesSource === 'canvas' && state.framesReason ? (
        <p className="systemsketch-recorder__hint">{state.framesReason}</p>
      ) : null}
    </div>
  )
}

/**
 * The bar across the top of the window while an explicit take runs. Owned by
 * the existing `InFrontOfTheCanvas` surface (no new tldraw seam), but painted
 * through a portal onto `document.body`: the canvas layer sits under tldraw's
 * own top chrome, and a status bar that hides behind the Share button is not
 * a status bar. Rendered only in take mode — a retroactive save has nothing
 * to announce.
 */
export function RecorderIndicator({ label }: { label?: string }) {
  const state = useRecorderState()
  const elapsed = useElapsed(state.takeStartedAt)
  if (!state.installed || state.mode !== 'take' || typeof document === 'undefined') return null
  const total = state.windowMs
  return createPortal(
    <div className="systemsketch-recorder-indicator" role="status" data-testid="recorder-indicator">
      <span><i aria-hidden="true" />REC{label ? ` · ${label}` : ''}</span>
      <span className="systemsketch-recorder-indicator__clock">
        {(elapsed / 1000).toFixed(1)} s / {seconds(total)}
      </span>
      <button type="button" disabled={state.saving} onClick={() => void stopTake()}>
        {state.saving ? 'Saving…' : 'Stop and save'}
      </button>
    </div>,
    document.body,
  )
}
