import {
  DefaultKeyboardShortcutsDialog,
  DefaultZoomMenu,
  TldrawUiButtonIcon,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  useActions,
  useDialogs,
  useEditor,
  useValue,
} from 'tldraw'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  DEVELOPMENT_PRESETS,
  orderDevelopmentPresets,
  readRecentDevelopmentPresets,
  rememberDevelopmentPreset,
  type DevelopmentProfileId,
  type DevelopmentPresetId,
} from './developmentProfiles'
import {
  readReleaseStatus,
  runReleaseAction,
  type ReleaseAction,
  type ReleaseStatus,
} from './releaseClient'
import {
  channelLabel,
  freshnessLabel,
  hasNewPreview,
  makeStableLabel,
  makeStablePhase,
  previewDetailLabel,
  returnToStableLabel,
  shortBuild,
  versionStatusLabel,
  type MakeStablePhase,
} from './releaseModel'
import { getPortablePreviewSnapshot, loadPreviewCloneFromCurrentUrl } from './previewClone'
import { RecorderControls } from './recorder/RecorderControls'
import { setRecorderChannel, useRecorderState } from './recorder/recorderStore'
import { useChrome } from './chrome/ChromeProvider'
import { useTopNoticePlacement } from './chrome/topNoticePlacement'
import { startReleaseRefresh } from './releaseRefresh'
import { cablePresentation, setSolidBeforePill } from './blocks/connections/connectionPresentation'
import { useAppearancePreferences } from './settings/appearancePreferences'
import './systemsketch-utilities.css'
import { getBoardDiagnosticsModel } from './diagnostics'

type BusyKey = ReleaseAction | `preview:${DevelopmentProfileId}`

/** The armed Make Stable control survives a pointerdown that lands on itself. */
const MAKE_STABLE_ATTRIBUTE = 'data-make-stable'
const MAKE_STABLE_ARM_MS = 6_000

function formatTime(value: string | null): string {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function BoardOverviewIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="systemsketch-utility-icon">
      <rect x="4.5" y="4.5" width="11" height="11" rx="1" />
      <path d="M2.5 6.5h4M2.5 13.5h4M13.5 2.5v4M6.5 2.5v4M13.5 13.5v4M6.5 13.5v4M13.5 6.5h4M13.5 13.5h4" />
    </svg>
  )
}

function ProblemsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="systemsketch-utility-icon">
      <path d="M10 2.5 18 17H2L10 2.5Z" />
      <path d="M10 7v4.5M10 14.5h.01" />
    </svg>
  )
}

function DevIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="systemsketch-utility-icon systemsketch-dev-icon">
      <path d="m7 5.5-4.5 4.5L7 14.5M13 5.5l4.5 4.5-4.5 4.5M11.5 3.5l-3 13" />
    </svg>
  )
}

interface ChannelActionsProps {
  className: string
  phase: MakeStablePhase
  returning: boolean
  disabled: boolean
  onReturn: () => void
  onMakeStable: () => void
}

/**
 * The two exits from Preview, rendered identically wherever they appear:
 * go back to the verified build, or make this working tree that build.
 */
function ChannelActions({
  className,
  phase,
  returning,
  disabled,
  onReturn,
  onMakeStable,
}: ChannelActionsProps) {
  return (
    <div className={className}>
      <button
        type="button"
        data-action="return"
        data-emphasis={phase === 'published' ? 'primary' : 'secondary'}
        disabled={disabled}
        onClick={onReturn}
      >
        {returnToStableLabel(phase, returning)}
      </button>
      {phase === 'unavailable' ? null : (
        <button
          type="button"
          data-action="make-stable"
          data-phase={phase}
          disabled={disabled || phase === 'published'}
          onClick={onMakeStable}
          {...{ [MAKE_STABLE_ATTRIBUTE]: '' }}
        >
          {makeStableLabel(phase)}
        </button>
      )}
    </div>
  )
}

/**
 * A release does not expose reliable per-step completion, so this stays
 * deliberately indeterminate. It is only rendered while the promote request
 * is actually in flight; a percentage here would imply progress we cannot
 * honestly measure.
 */
function BuildProgress() {
  return (
    <div
      className="systemsketch-preview-mode__progress"
      data-testid="systemsketch-build-progress"
      role="progressbar"
      aria-label="Building Stable release"
      aria-valuetext="Build in progress"
    >
      <span aria-hidden="true" />
    </div>
  )
}

export function SystemSketchNavigationPanel() {
  const editor = useEditor()
  const actions = useActions()
  const { showZoomButtons } = useAppearancePreferences()
  const { addDialog } = useDialogs()
  const { rightSurface, setRight, toggleRight } = useChrome()
  const [status, setStatus] = useState<ReleaseStatus | null>(null)
  const [devOpen, setDevOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [recentIds, setRecentIds] = useState<DevelopmentPresetId[]>(readRecentDevelopmentPresets)
  const solidBeforePill = useValue('solid before pill', () => cablePresentation.get().solidBeforePill, [])
  const [busy, setBusy] = useState<BusyKey | null>(null)
  const [armed, setArmed] = useState(false)
  const [published, setPublished] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const recorderState = useRecorderState()
  const rootRef = useRef<HTMLDivElement>(null)
  const previewNoticeRef = useRef<HTMLElement>(null)
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const cloneImportStarted = useRef(false)
  const devPanelId = useId()
  const helpPanelId = useId()
  const releaseDetailsId = useId()
  const boardPanelOpen = rightSurface === 'board-overview'
  const problemsPanelOpen = rightSurface === 'diagnostics'
  const problemCount = useValue(
    'SystemSketch Problems count',
    () => getBoardDiagnosticsModel(editor).counts.total,
    [editor],
  )
  const orderedPresets = useMemo(() => orderDevelopmentPresets(recentIds), [recentIds])
  const previewNoticeVisible = status?.channel === 'preview' && recorderState.mode !== 'take'
  const previewNoticePlacement = useTopNoticePlacement(previewNoticeRef, previewNoticeVisible)

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current

    const request = readReleaseStatus()
      .then((next) => {
        setStatus(next)
        setError(null)
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        if (refreshInFlight.current === request) refreshInFlight.current = null
      })

    refreshInFlight.current = request
    return request
  }, [])

  useEffect(() => startReleaseRefresh(refresh), [refresh])

  useEffect(() => {
    if (cloneImportStarted.current) return
    cloneImportStarted.current = true
    void loadPreviewCloneFromCurrentUrl(editor)
      .then((imported) => {
        if (imported) setNotice('Opened an independent Preview duplicate of your Stable board.')
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [editor])

  useEffect(() => {
    if (!helpOpen && !devOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setHelpOpen(false)
        setDevOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // An armed Make Stable owns Escape first: cancelling the confirm must
      // not also close the panel the confirm was started from.
      if (event.key !== 'Escape' || armed) return
      setHelpOpen(false)
      setDevOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [armed, devOpen, helpOpen])

  useEffect(() => {
    if (!armed) return

    const disarm = () => setArmed(false)
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest?.(`[${MAKE_STABLE_ATTRIBUTE}]`)) disarm()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') disarm()
    }

    const timer = window.setTimeout(disarm, MAKE_STABLE_ARM_MS)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [armed])

  useEffect(() => {
    if (!rightSurface) return
    setDevOpen(false)
    setHelpOpen(false)
  }, [rightSurface])

  const act = async (action: ReleaseAction, preset: DevelopmentProfileId = 'product') => {
    const busyKey: BusyKey = action === 'preview' ? `preview:${preset}` : action
    setBusy(busyKey)
    setArmed(false)
    setError(null)
    setNotice(null)
    if (action !== 'promote') setPublished(false)
    try {
      const snapshot = action === 'preview' && preset === 'product'
        ? await getPortablePreviewSnapshot(editor)
        : undefined
      const next = await runReleaseAction(action, snapshot, preset)
      setStatus(next)
      setNotice(next.message ?? null)
      if (action === 'promote') setPublished(true)
      if (action === 'preview' && preset !== 'product') {
        setRecentIds(rememberDevelopmentPreset(preset))
      }
      if (action === 'stable' && next.launchUrl) window.location.assign(next.launchUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  const isPreview = status?.channel === 'preview'
  const previewAvailable = hasNewPreview(status)

  // The recorder stamps each packet with the channel it was taken from.
  useEffect(() => {
    if (status) setRecorderChannel({ channel: status.channel, build: status.build, version: status.version })
  }, [status])
  const releaseSummary = versionStatusLabel(status)
  const makeStable = makeStablePhase(status, {
    armed,
    working: busy === 'promote',
    published,
  })

  // Arming and committing are the same control: the first click states the
  // consequence, the second one starts the check-and-build that carries it out.
  const requestMakeStable = () => {
    if (busy) return
    if (!armed) {
      setArmed(true)
      return
    }
    void act('promote')
  }

  const toggleBoardPanel = () => {
    toggleRight('board-overview')
    setDevOpen(false)
    setHelpOpen(false)
  }

  const toggleProblemsPanel = () => {
    toggleRight('diagnostics')
    setDevOpen(false)
    setHelpOpen(false)
  }

  const toggleDev = () => {
    const next = !devOpen
    if (next) {
      setRight(null)
      setHelpOpen(false)
    }
    setDevOpen(next)
  }

  const toggleHelp = () => {
    const next = !helpOpen
    if (next) {
      setRight(null)
      setDevOpen(false)
    }
    setHelpOpen(next)
  }

  const openKeyboardShortcuts = () => {
    addDialog({ component: DefaultKeyboardShortcutsDialog })
    setHelpOpen(false)
  }

  const previewBusy = (profile: DevelopmentProfileId) => busy === `preview:${profile}`

  const channelActions = (className: string) => (
    <ChannelActions
      className={className}
      phase={makeStable}
      returning={busy === 'stable'}
      disabled={Boolean(busy)}
      onReturn={() => void act('stable')}
      onMakeStable={requestMakeStable}
    />
  )

  return (
    <div ref={rootRef} className="systemsketch-utilities" data-testid="systemsketch-utilities">
      {isPreview && recorderState.mode !== 'take' ? (
        <aside
          ref={previewNoticeRef}
          className="systemsketch-preview-mode"
          data-phase={makeStable}
          data-placement={previewNoticePlacement}
          data-testid="systemsketch-preview-mode"
          aria-label="Preview mode"
        >
          <div className="systemsketch-preview-mode__row">
            <span className="systemsketch-preview-mode__badge"><i aria-hidden="true" />Preview</span>
            <span className="systemsketch-preview-mode__detail">
              {previewDetailLabel(makeStable, status?.hostArtifactsReady)}
            </span>
            {channelActions('systemsketch-preview-mode__actions')}
          </div>
          {makeStable === 'working' ? <BuildProgress /> : null}
          {error ? (
            <p className="systemsketch-preview-mode__error" role="alert">{error}</p>
          ) : null}
        </aside>
      ) : null}

      {devOpen ? (
        <section id={devPanelId} className="systemsketch-dev-panel" aria-label="SystemSketch development views">
          <header className="systemsketch-panel-header">
            <div>
              <span>SystemSketch</span>
              <h2>Dev</h2>
            </div>
            <button type="button" aria-label="Close development views" onClick={() => setDevOpen(false)}>×</button>
          </header>

          {error ? <p className="systemsketch-panel-message systemsketch-panel-message--error">{error}</p> : null}
          {notice ? <p className="systemsketch-panel-message">{notice}</p> : null}

          {isPreview ? (
            <>
              {/* Where you already are is state, not an offer: no call-out styling. */}
              <div className="systemsketch-dev-latest" data-current="" data-testid="systemsketch-dev-current">
                <span className="systemsketch-dev-latest__glyph" aria-hidden="true">↯</span>
                <span>
                  <small>You are here</small>
                  <b>Latest Preview</b>
                  <em>Live working tree · full product</em>
                </span>
                <strong>Current</strong>
              </div>

              {channelActions('systemsketch-dev-actions')}

              <div className="systemsketch-dev-stable">
                <span>
                  <b>Stable</b>
                  <small>Verified {status?.version ?? '…'} · launches by default</small>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="systemsketch-dev-stable">
                <span>
                  <b>Stable</b>
                  <small>Verified {status?.version ?? '…'} · working document</small>
                </span>
                <em>Current</em>
              </div>

              <button
                type="button"
                className="systemsketch-dev-latest"
                disabled={Boolean(busy) || !status?.canPreview}
                onClick={() => void act('preview', 'product')}
              >
                <span className="systemsketch-dev-latest__glyph" aria-hidden="true">↯</span>
                <span>
                  <small>{previewAvailable ? 'New Preview available' : 'Latest'}</small>
                  <b>Open Latest Preview</b>
                  <em>Live working tree · full product · duplicate this board</em>
                </span>
                <strong>{previewBusy('product') ? '…' : '↗'}</strong>
              </button>
            </>
          )}

          <div className="systemsketch-dev-section-label">
            <span>Cable presentation</span>
            <small>This browser, live</small>
          </div>
          <label className="systemsketch-dev-toggle">
            <input
              type="checkbox"
              data-testid="systemsketch-dev-solid-before-pill"
              checked={solidBeforePill}
              onChange={(event) => setSolidBeforePill(event.target.checked)}
            />
            <span>
              <b>Solid before the z⁻¹ pill</b>
              <small>Delayed cables: solid up to the pill, dotted after it</small>
            </span>
          </label>

          <div className="systemsketch-dev-section-label">
            <span>Isolated presets</span>
            <small>{recentIds.length ? 'Recent first' : 'Independent boards'}</small>
          </div>

          <div className="systemsketch-dev-presets">
            {orderedPresets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                className="systemsketch-dev-preset"
                disabled={Boolean(busy) || !status?.canPreview}
                data-preset={preset.id}
                onClick={() => void act('preview', preset.id)}
              >
                <i aria-hidden="true">{preset.glyph}</i>
                <span>
                  <b>{preset.label}</b>
                  <small>{preset.description} · {preset.detail}</small>
                </span>
                <em>{previewBusy(preset.id) ? '…' : '↗'}</em>
              </button>
            ))}
          </div>

          <RecorderControls />

          <button
            type="button"
            className="systemsketch-help-row systemsketch-version-row"
            aria-expanded={detailsOpen}
            aria-controls={releaseDetailsId}
            onClick={() => setDetailsOpen((value) => !value)}
          >
            <span>Version &amp; updates</span>
            <span className="systemsketch-version-row__status">{releaseSummary}<b aria-hidden="true">›</b></span>
          </button>

          {detailsOpen ? (
            <section id={releaseDetailsId} className="systemsketch-release-details" aria-label="Version and update details">
              <div className="systemsketch-release-details__heading">
                <div>
                  <span>{status ? channelLabel(status.channel) : 'Status'}</span>
                  <h3>{status?.version ?? 'Checking…'}</h3>
                </div>
                <code>{status ? shortBuild(status.build) : '—'}</code>
              </div>

              {status ? <p className="systemsketch-release-details__freshness">{freshnessLabel(status)}</p> : null}

              <dl className="systemsketch-release-details__facts">
                <div><dt>Released</dt><dd>{formatTime(status?.releasedAt ?? null)}</dd></div>
                <div><dt>Composition</dt><dd>{isPreview ? 'Latest Preview' : 'Stable product'}</dd></div>
              </dl>

              {status?.changes.length ? (
                <div className="systemsketch-release-details__changes">
                  <span>What’s in Stable {status.version}</span>
                  <ul>{status.changes.slice(0, 4).map((change) => <li key={change}>{change}</li>)}</ul>
                </div>
              ) : null}

              <div className="systemsketch-release-details__actions">
                {!isPreview && status?.canRollback ? (
                  <button type="button" disabled={Boolean(busy)} onClick={() => void act('rollback')}>
                    {busy === 'rollback' ? 'Preparing…' : 'Use Previous on Next Launch'}
                  </button>
                ) : null}
              </div>
              <p className="systemsketch-release-details__automatic"><i aria-hidden="true" />Updates automatically in the background</p>
            </section>
          ) : null}

          <footer className="systemsketch-dev-footer">
            {DEVELOPMENT_PRESETS.length} active presets · code-owned compositions
          </footer>
        </section>
      ) : null}

      {helpOpen ? (
        <section id={helpPanelId} className="systemsketch-help-panel" aria-label="SystemSketch help">
          <header className="systemsketch-panel-header">
            <div>
              <span>SystemSketch</span>
              <h2>Help</h2>
            </div>
            <button type="button" aria-label="Close help" onClick={() => setHelpOpen(false)}>×</button>
          </header>

          <p className="systemsketch-help-intro">Canvas guidance stays here. Preview, publishing, and isolated feature views now live under Dev.</p>
          <button type="button" className="systemsketch-help-row" onClick={openKeyboardShortcuts}>
            <span>Keyboard shortcuts</span>
            <kbd>Ctrl Shift ?</kbd>
          </button>
        </section>
      ) : null}

      <TldrawUiToolbar
        className="systemsketch-utility-strip"
        label="Board navigation, zoom, development, and help"
        orientation="horizontal"
        tooltipSide="top"
      >
        <TldrawUiToolbarButton
          type="icon"
          title="Board overview"
          aria-expanded={boardPanelOpen}
          aria-controls={boardPanelOpen ? 'systemsketch-right-popout' : undefined}
          onClick={toggleBoardPanel}
        >
          <BoardOverviewIcon />
        </TldrawUiToolbarButton>
        <TldrawUiToolbarButton
          type="icon"
          className="systemsketch-diagnostics-trigger"
          title={problemCount === 1 ? 'Problems — 1 issue' : `Problems — ${problemCount} issues`}
          aria-expanded={problemsPanelOpen}
          aria-controls={problemsPanelOpen ? 'systemsketch-right-popout' : undefined}
          onClick={toggleProblemsPanel}
        >
          <ProblemsIcon />
          {problemCount > 0 ? (
            <span className="systemsketch-problem-count" aria-hidden="true">
              {problemCount > 99 ? '99+' : problemCount}
            </span>
          ) : null}
        </TldrawUiToolbarButton>
        {showZoomButtons ? (
          <TldrawUiToolbarButton
            type="icon"
            title="Zoom out"
            data-testid="systemsketch-zoom-out"
            onClick={() => actions['zoom-out'].onSelect('navigation-zone')}
          >
            <TldrawUiButtonIcon small icon="minus" />
          </TldrawUiToolbarButton>
        ) : null}
        <DefaultZoomMenu />
        {showZoomButtons ? (
          <TldrawUiToolbarButton
            type="icon"
            title="Zoom in"
            data-testid="systemsketch-zoom-in"
            onClick={() => actions['zoom-in'].onSelect('navigation-zone')}
          >
            <TldrawUiButtonIcon small icon="plus" />
          </TldrawUiToolbarButton>
        ) : null}
        <TldrawUiToolbarButton
          type="icon"
          className="systemsketch-dev-trigger"
          title={previewAvailable ? 'Development views — new Preview available' : 'Development views'}
          aria-expanded={devOpen}
          aria-controls={devOpen ? devPanelId : undefined}
          onClick={toggleDev}
        >
          <DevIcon />
          {previewAvailable ? <span className="systemsketch-preview-indicator" aria-hidden="true" /> : null}
        </TldrawUiToolbarButton>
        <TldrawUiToolbarButton
          type="icon"
          className="systemsketch-help-trigger"
          title="Help"
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? helpPanelId : undefined}
          onClick={toggleHelp}
        >
          <TldrawUiButtonIcon small icon="question-mark" />
        </TldrawUiToolbarButton>
      </TldrawUiToolbar>
    </div>
  )
}
