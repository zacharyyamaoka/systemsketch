import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useValue } from 'tldraw'

import {
  getDepthNavigationModel,
  getDepthNavigationSnapshot,
  goBackInDepthHistory,
  goForwardInDepthHistory,
  returnToDepthRoot,
  stepToDepthAncestor,
  subscribeDepthNavigation,
} from './depthNavigation'
import { storedTextOr } from '../textFidelity'
import { compactDepthBreadcrumbs, type CompactDepthBreadcrumbItem, type DepthBreadcrumbItem } from './depthBreadcrumbs'
import './depth-stack-navigator.css'

function ArrowGlyph({ direction }: { direction: 'back' | 'forward' }) {
  const path = direction === 'back' ? 'm12.5 4-6 6 6 6M7 10h9' : direction === 'forward'
    ? 'm7.5 4 6 6-6 6M13 10H4' : 'm4 11 6-6 6 6M10 5v11'
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={path} /></svg>
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
}

function isElision(entry: CompactDepthBreadcrumbItem<DepthBreadcrumbItem>): entry is { kind: 'elision'; hiddenCount: number } {
  return 'kind' in entry && entry.kind === 'elision'
}

function Crumb({
  children,
  current = false,
  onClick,
  onCurrentMount,
  title,
}: {
  children: string
  current?: boolean
  onClick?: () => void
  onCurrentMount?: (element: HTMLElement | null) => void
  title?: string
}) {
  if (current) return <span ref={onCurrentMount} className="systemsketch-depth-crumb is-current" title={title}>{children}</span>
  return <button type="button" className="systemsketch-depth-crumb" title={title} onClick={onClick}>{children}</button>
}

export function DepthStackNavigator({ placement = 'floating' }: { placement?: 'menu' | 'floating' }) {
  const editor = useEditor()
  const rootRef = useRef<HTMLDivElement>(null)
  const currentCrumbRef = useRef<HTMLElement | null>(null)
  const popoverRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [popoverLeft, setPopoverLeft] = useState<number>()
  const subscribe = useCallback((listener: () => void) => subscribeDepthNavigation(editor, listener), [editor])
  const getSnapshot = useCallback(() => getDepthNavigationSnapshot(editor), [editor])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const model = useValue('SystemSketch depth navigation model', () => getDepthNavigationModel(editor, snapshot.scopeId), [editor, snapshot.scopeId])
  useEffect(() => setOpen(false), [snapshot.scopeId])
  useLayoutEffect(() => {
    if (!open) return
    const position = () => {
      const root = rootRef.current
      const currentCrumb = currentCrumbRef.current
      const popover = popoverRef.current
      if (!root || !currentCrumb || !popover) return
      const rootBounds = root.getBoundingClientRect()
      const currentBounds = currentCrumb.getBoundingClientRect()
      const width = popover.getBoundingClientRect().width
      const gutter = 14
      const desiredLeft = currentBounds.left
      const safeLeft = Math.max(gutter, Math.min(desiredLeft, window.innerWidth - width - gutter))
      setPopoverLeft(safeLeft - rootBounds.left)
    }
    position()
    window.addEventListener('resize', position)
    const observer = new ResizeObserver(position)
    if (rootRef.current) observer.observe(rootRef.current)
    if (currentCrumbRef.current) observer.observe(currentCrumbRef.current)
    if (popoverRef.current) observer.observe(popoverRef.current)
    return () => {
      window.removeEventListener('resize', position)
      observer.disconnect()
    }
  }, [open, snapshot.scopeId, snapshot.canGoBack, snapshot.canGoForward])
  useEffect(() => {
    if (!open) return
    const ownerDocument = rootRef.current?.ownerDocument ?? document
    const close = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) return
      setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    ownerDocument.addEventListener('pointerdown', close, true)
    ownerDocument.addEventListener('keydown', escape)
    return () => {
      ownerDocument.removeEventListener('pointerdown', close, true)
      ownerDocument.removeEventListener('keydown', escape)
    }
  }, [open])
  useEffect(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? document
    const navigate = (direction: 'back' | 'forward', event: Event) => {
      if (isEditableTarget(event.target)) return
      const possible = direction === 'back' ? snapshot.canGoBack : snapshot.canGoForward
      if (!possible) return
      event.preventDefault()
      if (direction === 'back') void goBackInDepthHistory(editor)
      else void goForwardInDepthHistory(editor)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'BrowserBack' || event.key === 'GoBack') navigate('back', event)
      if (event.key === 'BrowserForward' || event.key === 'GoForward') navigate('forward', event)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 3) navigate('back', event)
      if (event.button === 4) navigate('forward', event)
    }
    ownerDocument.addEventListener('keydown', onKeyDown, true)
    ownerDocument.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      ownerDocument.removeEventListener('keydown', onKeyDown, true)
      ownerDocument.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [editor, snapshot.canGoBack, snapshot.canGoForward])

  if (!model || (placement === 'floating' && !model.current)) return null
  const entries = model.entries
  const currentName = model.current ? storedTextOr(model.current.props.title, model.pageName) : model.pageName

  return (
    <div
      ref={rootRef}
      className={`systemsketch-depth-navigator systemsketch-depth-navigator--${placement}`}
      data-testid="systemsketch-depth-navigator"
      data-depth={model.depth}
      data-systemsketch-chrome
      onWheel={(event) => event.stopPropagation()}
    >
      <nav className="systemsketch-depth-pill" aria-label="System navigation">
        <span className="systemsketch-depth-history" aria-label="Navigation history">
          <button type="button" aria-label="Back" title="Back to previous view" disabled={!snapshot.canGoBack} onClick={() => void goBackInDepthHistory(editor)}>
            <ArrowGlyph direction="back" />
          </button>
          <button type="button" aria-label="Forward" title="Forward to next view" disabled={!snapshot.canGoForward} onClick={() => void goForwardInDepthHistory(editor)}>
            <ArrowGlyph direction="forward" />
          </button>
        </span>
        <div className="systemsketch-depth-breadcrumbs" aria-label="Structural path">
          <Crumb current={!model.current} onCurrentMount={(element) => { currentCrumbRef.current = element }} title="Board root" onClick={() => void returnToDepthRoot(editor)}>{model.pageName}</Crumb>
          {compactDepthBreadcrumbs(model.pageName, entries).map((entry) => isElision(entry) ? (
            <span key={`elision-${entry.hiddenCount}`} className="systemsketch-depth-crumb systemsketch-depth-crumb--elision" aria-label={`${entry.hiddenCount} intermediate ${entry.hiddenCount === 1 ? 'level' : 'levels'} hidden; open structural path for all levels`}>…</span>
          ) : (
            <span key={entry.id} className="systemsketch-depth-breadcrumb-pair">
              <span className="systemsketch-depth-separator" aria-hidden="true">›</span>
              <Crumb current={entry.isCurrent} onCurrentMount={(element) => { currentCrumbRef.current = element }} title={entry.name} onClick={() => void stepToDepthAncestor(editor, entry.id)}>{entry.name}</Crumb>
            </span>
          ))}
        </div>
        <button type="button" className="systemsketch-depth-counter systemsketch-depth-pill__trigger" aria-label={`Show structural path at depth ${model.depth}`} title="Show structural path" aria-expanded={open} aria-controls="systemsketch-depth-stack" onClick={() => setOpen((value) => !value)}>{model.depth}</button>
      </nav>
      {open ? (
        <aside ref={popoverRef} id="systemsketch-depth-stack" className="systemsketch-depth-popover" style={popoverLeft === undefined ? undefined : { left: popoverLeft }} aria-label="Structural path">
          <header><span>Structural path</span><b>{model.depth} {model.depth === 1 ? 'level' : 'levels'}</b></header>
          <ol className="systemsketch-depth-popover__path" aria-label="Structural path levels">
            <li className="systemsketch-depth-path-item" aria-label="Board root">
              {model.current ? <button type="button" aria-label="Return to Board root" className="systemsketch-depth-row systemsketch-depth-row--root" onClick={() => void returnToDepthRoot(editor)}><i aria-hidden="true" /><span><b>{model.pageName}</b><small>root canvas</small></span><em>0</em></button> : <div aria-current="page" className="systemsketch-depth-row systemsketch-depth-row--root is-current"><i aria-hidden="true" /><span><b>{model.pageName}</b><small>root canvas</small></span><em>0</em></div>}
            </li>
            {entries.map((entry) => (
              <li key={entry.id} className="systemsketch-depth-path-item" aria-label={`${entry.name}, ${entry.isCurrent ? 'current scope' : 'ancestor'}`}>
                {entry.isCurrent ? <div aria-current="page" className="systemsketch-depth-row is-current"><i aria-hidden="true" /><span><b title={entry.name}>{entry.name}</b><small>current scope</small></span><em>{entry.depth}</em></div> : <button type="button" aria-label={`Jump to ${entry.name}`} className="systemsketch-depth-row" disabled={!entry.canFocus} title={entry.canFocus ? `Jump to ${entry.name}` : `${entry.name} is not Expanded`} onClick={() => void stepToDepthAncestor(editor, entry.id)}><i aria-hidden="true" /><span><b>{entry.name}</b><small>ancestor</small></span><em>{entry.depth}</em></button>}
              </li>
            ))}
          </ol>
        </aside>
      ) : null}
      <span className="systemsketch-depth-status" aria-live="polite">Current scope: {currentName}, depth {model.depth}</span>
    </div>
  )
}
