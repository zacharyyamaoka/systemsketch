import { useEffect, useId, useRef, useState } from 'react'
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
  const elapsed = useElapsed(state.takeStartedAt)
  const [menuOpen, setMenuOpen] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const taking = state.mode === 'take'
  const busy = state.saving
  const disabledReason = !state.enabled ? 'Recorder is off' : busy ? 'Saving…' : ''

  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !splitRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [menuOpen])

  useEffect(() => {
    if (taking || busy) setMenuOpen(false)
  }, [taking, busy])

  useEffect(() => {
    if (state.error || state.clipboard === 'failed') setMenuOpen(true)
  }, [state.error, state.clipboard])

  const onTake = () => {
    setMenuOpen(false)
    if (taking) void stopTake()
    else void startTake()
  }
  const onSaveLast = () => {
    setMenuOpen(false)
    void saveLast()
  }
  const framesLabel = state.framesSource === 'screencast'
    ? 'Chrome frames'
    : state.framesSource === 'canvas'
      ? 'canvas frames'
      : 'checking frames…'
  const statusLabel = !state.enabled
    ? 'Off'
    : state.error || state.clipboard === 'failed'
      ? 'Needs attention'
      : taking
        ? `REC · ${(elapsed / 1000).toFixed(1)} / ${seconds(state.windowMs)}`
        : busy
          ? 'Saving…'
          : state.clipboard === 'copied'
            ? 'Saved · packet copied'
            : `On · ${seconds(state.windowMs)} · ${framesLabel}`

  const primaryControl = taking ? (
    <button
      type="button"
      className="systemsketch-recorder__primary systemsketch-recorder__primary--taking"
      data-action="take"
      data-taking="true"
      disabled={busy}
      onClick={onTake}
    >
      {busy ? 'Saving…' : `■ Stop and save · ${(elapsed / 1000).toFixed(1)} s`}
    </button>
  ) : (
    <div className={`systemsketch-recorder__split${!state.enabled ? ' systemsketch-recorder__split--off' : ''}`} data-testid="recorder-split">
      <button
        type="button"
        className="systemsketch-recorder__primary"
        data-action={state.enabled ? 'save-last' : 'toggle'}
        disabled={busy}
        title={disabledReason || `Save the last ${seconds(state.windowMs)}`}
        onClick={state.enabled ? onSaveLast : () => setRecorderEnabled(true)}
      >
        {state.enabled ? `● Save last ${seconds(state.windowMs)}` : 'Turn recorder on'}
      </button>
      <button
        type="button"
        className="systemsketch-recorder__more"
        data-action="more"
        aria-label="More recorder actions"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? '⌃' : '⌄'}
      </button>
    </div>
  )

  const actionMenu = menuOpen && !taking ? (
    <div id={menuId} className="systemsketch-recorder__menu" data-testid="recorder-menu">
      {state.enabled ? (
        <button type="button" className="systemsketch-recorder__menu-item" data-action="take" disabled={busy} onClick={onTake}>
          <span>▶ Record next {seconds(state.windowMs)}</span>
          <small>Stops itself at the cap</small>
        </button>
      ) : null}
      <button
        type="button"
        className="systemsketch-recorder__menu-item"
        data-action="copy-last"
        disabled={!state.last || busy}
        onClick={() => void copyLastRecording()}
      >
        <span>⧉ Copy last recording</span>
        <small data-testid="recorder-last-path">{state.last ? shortPath(state.last.path) : 'Nothing saved yet'}</small>
      </button>
      <div className="systemsketch-recorder__window" aria-label="Recording window">
        <span>Window</span>
        {WINDOW_CHOICES_MS.map((choice) => (
          <button
            type="button"
            key={choice}
            data-window={choice}
            data-on={state.windowMs === choice || undefined}
            onClick={() => {
              setRecorderWindowMs(choice)
              setMenuOpen(false)
            }}
          >
            {seconds(choice)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="systemsketch-recorder__menu-item systemsketch-recorder__power"
        data-action="toggle"
        aria-pressed={state.enabled}
        onClick={() => {
          setMenuOpen(false)
          setRecorderEnabled(!state.enabled)
        }}
      >
        <span>{state.enabled ? 'Turn recorder off' : 'Turn recorder on'}</span>
        <small>{state.enabled ? 'Stops the rolling buffer on this channel' : 'Starts the rolling buffer on this channel'}</small>
      </button>
      {state.clipboard ? (
        <small className="systemsketch-recorder__feedback" data-clipboard={state.clipboard}>
          {state.clipboard === 'copied' ? 'Packet copied' : 'Clipboard write failed · folder is safe'}
        </small>
      ) : null}
      {state.error ? <p className="systemsketch-panel-message systemsketch-panel-message--error">{state.error}</p> : null}
      {state.enabled && state.framesSource === 'canvas' && state.framesReason ? (
        <p className="systemsketch-recorder__hint">{state.framesReason}</p>
      ) : null}
    </div>
  ) : null

  if (!state.installed) return null

  if (compact) {
    return (
      <div className="systemsketch-recorder systemsketch-recorder--compact" data-testid="recorder-controls" data-mode={state.mode} data-enabled={state.enabled}>
        <small className="systemsketch-recorder__compact-status" data-testid="recorder-status">{statusLabel}</small>
        <div
          className="systemsketch-recorder__split-shell"
          ref={splitRef}
          data-open={menuOpen || undefined}
          onKeyDown={(event) => {
            if (menuOpen && event.key === 'Escape') {
              event.stopPropagation()
              setMenuOpen(false)
            }
          }}
        >
          {primaryControl}
          {actionMenu}
        </div>
      </div>
    )
  }

  return (
    <div className="systemsketch-recorder" data-testid="recorder-controls" data-mode={state.mode} data-enabled={state.enabled}>
      <div className="systemsketch-dev-section-label">
        <span>Recording</span>
        <small data-testid="recorder-status">{statusLabel}</small>
      </div>

      <div
        className="systemsketch-recorder__split-shell"
        ref={splitRef}
        data-open={menuOpen || undefined}
        onKeyDown={(event) => {
          if (menuOpen && event.key === 'Escape') {
            event.stopPropagation()
            setMenuOpen(false)
          }
        }}
      >
        {primaryControl}
        {actionMenu}
      </div>
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
