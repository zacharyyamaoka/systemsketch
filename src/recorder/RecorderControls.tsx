import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTopNoticePlacement } from '../chrome/topNoticePlacement'
import {
  copyLastRecording,
  EXPLICIT_RECORDING_LIMIT_MS,
  startTake,
  stopTake,
  useRecorderState,
} from './recorderStore'
import './recorder.css'

/**
 * The recorder's controls, in the Dev panel's own row grammar.
 *
 * One primary path: Start recording, reproduce the bug, Stop and save. Copying
 * the last packet remains behind the adjoining disclosure. `compact` is the
 * same surface shrunk for the isolated presets.
 */

const LIMIT_LABEL = `${EXPLICIT_RECORDING_LIMIT_MS / 60_000} min`

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

  const onRecord = () => {
    setMenuOpen(false)
    if (taking) void stopTake()
    else void startTake()
  }
  const statusLabel = state.error || state.clipboard === 'failed'
    ? 'Needs attention'
    : taking
      ? `REC · ${(elapsed / 1000).toFixed(1)} / ${LIMIT_LABEL}`
      : busy
        ? 'Saving…'
        : state.notice
          ? 'Cancelled · nothing saved'
          : state.clipboard === 'copied'
            ? 'Saved · packet copied'
            : `Ready · ${LIMIT_LABEL} maximum`

  const primaryControl = taking ? (
    <button
      type="button"
      className="systemsketch-recorder__primary systemsketch-recorder__primary--taking"
      data-action="stop-recording"
      data-taking="true"
      disabled={busy}
      onClick={onRecord}
    >
      {busy ? 'Saving…' : `■ Stop and save · ${(elapsed / 1000).toFixed(1)} s`}
    </button>
  ) : (
    <div className="systemsketch-recorder__split" data-testid="recorder-split">
      <button
        type="button"
        className="systemsketch-recorder__primary"
        data-action="start-recording"
        disabled={busy}
        title="Start recording · one minute maximum"
        onClick={onRecord}
      >
        ● Start recording
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
      <small className="systemsketch-recorder__policy">
        Stop saves and copies · the {LIMIT_LABEL} limit cancels without saving
      </small>
      {state.clipboard ? (
        <small className="systemsketch-recorder__feedback" data-clipboard={state.clipboard}>
          {state.clipboard === 'copied' ? 'Packet copied' : 'Clipboard write failed · folder is safe'}
        </small>
      ) : null}
      {state.error ? <p className="systemsketch-panel-message systemsketch-panel-message--error">{state.error}</p> : null}
      {state.framesSource === 'canvas' && state.framesReason ? (
        <p className="systemsketch-recorder__hint">{state.framesReason}</p>
      ) : null}
    </div>
  ) : null

  if (!state.installed) return null

  if (compact) {
    return (
      <div className="systemsketch-recorder systemsketch-recorder--compact" data-testid="recorder-controls" data-mode={state.mode}>
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
    <div className="systemsketch-recorder" data-testid="recorder-controls" data-mode={state.mode}>
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
 * The high-priority top notice while an explicit take runs. Owned by
 * the existing `InFrontOfTheCanvas` surface (no new tldraw seam), but painted
 * through a portal onto the app theme root: the canvas layer sits under
 * tldraw's own top chrome, while the theme root keeps the notice inside the
 * SystemSketch token scope. It uses the same measured collision rule as the
 * Preview notice, which yields the slot entirely while recording is active.
 */
export function RecorderIndicator({ label }: { label?: string }) {
  const state = useRecorderState()
  const elapsed = useElapsed(state.takeStartedAt)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const placement = useTopNoticePlacement(indicatorRef, state.installed && state.mode === 'take')
  if (!state.installed || state.mode !== 'take' || typeof document === 'undefined') return null
  const portalTarget = document.querySelector<HTMLElement>('.systemsketch-theme-root') ?? document.body
  return createPortal(
    <div
      ref={indicatorRef}
      className="systemsketch-recorder-indicator"
      role="status"
      data-testid="recorder-indicator"
      data-placement={placement}
    >
      <span><i aria-hidden="true" />REC{label ? ` · ${label}` : ''}</span>
      <span className="systemsketch-recorder-indicator__clock">
        {(elapsed / 1000).toFixed(1)} s / {LIMIT_LABEL}
      </span>
      <button type="button" disabled={state.saving} onClick={() => void stopTake()}>
        {state.saving ? 'Saving…' : 'Stop and save'}
      </button>
    </div>,
    portalTarget,
  )
}
