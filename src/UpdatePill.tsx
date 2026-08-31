import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { readReleaseStatus, runReleaseAction, type ReleaseAction, type ReleaseStatus } from './releaseClient'
import { channelLabel, freshnessLabel, pillLabel, shortBuild } from './releaseModel'
import './update-pill.css'

function formatTime(value: string | null): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="6" cy="4" r="2" />
      <circle cx="14" cy="6" r="2" />
      <circle cx="6" cy="16" r="2" />
      <path d="M6 6v8M8 10h1.5A4.5 4.5 0 0 0 14 7.5" />
    </svg>
  )
}

export function UpdatePill() {
  const [status, setStatus] = useState<ReleaseStatus | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<ReleaseAction | 'refresh' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const refresh = useCallback(async () => {
    setBusy('refresh')
    try {
      setStatus(await readReleaseStatus())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const act = async (action: ReleaseAction) => {
    setBusy(action)
    setError(null)
    setNotice(null)
    try {
      const next = await runReleaseAction(action)
      setStatus(next)
      setNotice(next.message ?? null)
      if (next.launchUrl) {
        if (action === 'stable') window.location.assign(next.launchUrl)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const isPreview = status?.channel === 'preview'

  return (
    <div ref={rootRef} className="update-pill" data-testid="update-pill">
      <button
        type="button"
        className="update-pill__trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${pillLabel(status)}. Open updates.`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`update-pill__dot update-pill__dot--${isPreview ? 'preview' : 'stable'}`} />
        <span>{pillLabel(status)}</span>
        <BranchIcon />
      </button>

      {open ? (
        <section id={panelId} className="update-pill__panel" aria-label="SystemSketch updates">
          <header className="update-pill__header">
            <div>
              <span className="update-pill__eyebrow">{status ? channelLabel(status.channel) : 'SystemSketch'}</span>
              <h2>{status?.version ?? 'Checking…'}</h2>
            </div>
            <span className="update-pill__build">{status ? shortBuild(status.build) : '—'}</span>
          </header>

          {status ? <p className="update-pill__freshness">{freshnessLabel(status)}</p> : null}

          <dl className="update-pill__facts">
            <div><dt>Released</dt><dd>{formatTime(status?.releasedAt ?? null)}</dd></div>
            <div><dt>Safety</dt><dd>{isPreview ? 'Separate local canvas' : 'Immutable while open'}</dd></div>
          </dl>

          {status?.changes.length ? (
            <div className="update-pill__changes">
              <span>What changed</span>
              <ul>{status.changes.slice(0, 4).map((change) => <li key={change}>{change}</li>)}</ul>
            </div>
          ) : null}

          {error ? <p className="update-pill__message update-pill__message--error">{error}</p> : null}
          {notice ? <p className="update-pill__message">{notice}</p> : null}

          <div className="update-pill__actions">
            {isPreview ? (
              <>
                <button type="button" className="update-pill__primary" disabled={Boolean(busy)} onClick={() => void act('stable')}>
                  {busy === 'stable' ? 'Returning…' : 'Return to Stable'}
                </button>
                <button type="button" disabled={Boolean(busy) || !status?.canPromote} onClick={() => void act('promote')}>
                  {busy === 'promote' ? 'Verifying…' : 'Publish Preview'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="update-pill__primary" disabled={Boolean(busy) || !status?.canPreview} onClick={() => void act('preview')}>
                  {busy === 'preview' ? 'Opening…' : 'Open Live Preview'}
                </button>
                {status?.canRollback ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void act('rollback')}>
                    {busy === 'rollback' ? 'Preparing…' : 'Use Previous on Next Launch'}
                  </button>
                ) : null}
              </>
            )}
            <button type="button" disabled={Boolean(busy)} onClick={() => void refresh()}>
              {busy === 'refresh' ? 'Checking…' : 'Check again'}
            </button>
          </div>

          <footer>Stable stays still. Preview follows this repo live.</footer>
        </section>
      ) : null}
    </div>
  )
}
