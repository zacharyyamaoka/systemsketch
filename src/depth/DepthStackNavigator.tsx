import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useEditor, useValue } from 'tldraw'

import {
  discardDepthScope,
  getDepthNavigationModel,
  getDepthNavigationSnapshot,
  returnToDepthRoot,
  stepOutOfDepthScope,
  stepToDepthAncestor,
  subscribeDepthNavigation,
} from './depthNavigation'
import './depth-stack-navigator.css'

interface ScreenFrame {
  x: number
  y: number
  w: number
  h: number
  viewportW: number
  viewportH: number
}

function stopScopeMaskPointer(event: ReactPointerEvent<HTMLElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

function ScopeMask({ frame }: { frame: ScreenFrame }) {
  const left = Math.max(0, Math.min(frame.viewportW, frame.x))
  const top = Math.max(0, Math.min(frame.viewportH, frame.y))
  const right = Math.max(left, Math.min(frame.viewportW, frame.x + frame.w))
  const bottom = Math.max(top, Math.min(frame.viewportH, frame.y + frame.h))
  const shared = {
    onPointerDown: stopScopeMaskPointer,
    onDoubleClick: stopScopeMaskPointer,
  }
  return (
    <div
      className="systemsketch-depth-mask"
      aria-hidden="true"
      data-systemsketch-chrome
      onWheel={(event) => event.stopPropagation()}
    >
      <i {...shared} style={{ left: 0, top: 0, width: frame.viewportW, height: top }} />
      <i {...shared} style={{ left: 0, top: bottom, width: frame.viewportW, height: frame.viewportH - bottom }} />
      <i {...shared} style={{ left: 0, top, width: left, height: bottom - top }} />
      <i {...shared} style={{ left: right, top, width: frame.viewportW - right, height: bottom - top }} />
      <span
        className="systemsketch-depth-mask__edge"
        style={{ left, top, width: right - left, height: bottom - top }}
      />
    </div>
  )
}

function StackGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m10 3 6 3.2-6 3.2-6-3.2L10 3Z" />
      <path d="m4 10 6 3.2 6-3.2M4 13.8 10 17l6-3.2" />
    </svg>
  )
}

export function DepthStackNavigator() {
  const editor = useEditor()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const subscribe = useCallback(
    (listener: () => void) => subscribeDepthNavigation(editor, listener),
    [editor],
  )
  const getSnapshot = useCallback(() => getDepthNavigationSnapshot(editor), [editor])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const model = useValue(
    'SystemSketch depth navigation model',
    () => getDepthNavigationModel(editor, snapshot.scopeId),
    [editor, snapshot.scopeId],
  )
  const currentPageId = useValue(
    'SystemSketch depth navigation page',
    () => editor.getCurrentPageId(),
    [editor],
  )
  const frame = useValue<ScreenFrame | null>(
    'SystemSketch depth scope screen frame',
    () => {
      if (!model) return null
      const bounds = editor.getShapePageBounds(model.current.id)
      if (!bounds) return null
      const point = editor.pageToScreen(bounds.point)
      const zoom = editor.getZoomLevel()
      const viewport = editor.getViewportScreenBounds()
      return {
        x: point.x,
        y: point.y,
        w: bounds.w * zoom,
        h: bounds.h * zoom,
        viewportW: viewport.w,
        viewportH: viewport.h,
      }
    },
    [editor, model?.current.id],
  )

  useEffect(() => {
    if (snapshot.scopeId && (!model || model.pageId !== currentPageId)) {
      discardDepthScope(editor)
    }
  }, [currentPageId, editor, model, snapshot.scopeId])

  useEffect(() => {
    setOpen(false)
  }, [snapshot.scopeId])

  useEffect(() => {
    if (!open) return
    const ownerDocument = rootRef.current?.ownerDocument ?? document
    const close = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) {
        return
      }
      setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    ownerDocument.addEventListener('pointerdown', close, true)
    ownerDocument.addEventListener('keydown', escape)
    return () => {
      ownerDocument.removeEventListener('pointerdown', close, true)
      ownerDocument.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!model || !frame) return null
  const parentName = model.parent?.name ?? model.pageName

  return (
    <>
      <ScopeMask frame={frame} />
      <div
        ref={rootRef}
        className="systemsketch-depth-navigator"
        data-testid="systemsketch-depth-navigator"
        data-depth={model.depth}
        data-systemsketch-chrome
        onWheel={(event) => event.stopPropagation()}
      >
        <nav className="systemsketch-depth-pill" aria-label="System depth">
          <button
            type="button"
            className="systemsketch-depth-pill__up"
            aria-label={`Step out to ${parentName}`}
            title={`Step out to ${parentName}`}
            onClick={() => void stepOutOfDepthScope(editor)}
          >
            ↑
          </button>
          <button
            type="button"
            className="systemsketch-depth-pill__trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls="systemsketch-depth-stack"
            onClick={() => setOpen((current) => !current)}
          >
            <span className="systemsketch-depth-pill__glyph"><StackGlyph /></span>
            <span className="systemsketch-depth-pill__name">{model.current.props.title.trim() || 'Untitled Block'}</span>
            <span className="systemsketch-depth-pill__count" aria-label={`Depth ${model.depth}`}>{model.depth}</span>
            <span className="systemsketch-depth-pill__chevron" aria-hidden="true">⌄</span>
          </button>
        </nav>

        {open ? (
          <aside
            id="systemsketch-depth-stack"
            className="systemsketch-depth-popover"
            role="menu"
            aria-label="Ancestor stack"
          >
            <header>
              <span>System depth</span>
              <b>{model.depth} {model.depth === 1 ? 'level' : 'levels'}</b>
            </header>
            <div className="systemsketch-depth-popover__path">
              <button
                type="button"
                role="menuitem"
                className="systemsketch-depth-row systemsketch-depth-row--root"
                onClick={() => void returnToDepthRoot(editor)}
              >
                <i aria-hidden="true" />
                <span><b>{model.pageName}</b><small>root canvas</small></span>
                <em>0</em>
              </button>
              {model.entries.map((entry) => entry.isCurrent ? (
                <div
                  key={entry.id}
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled="true"
                  aria-current="page"
                  className="systemsketch-depth-row is-current"
                >
                  <i aria-hidden="true" />
                  <span><b>{entry.name}</b><small>current scope</small></span>
                  <em>{entry.depth}</em>
                </div>
              ) : (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitem"
                  className="systemsketch-depth-row"
                  disabled={!entry.canFocus}
                  title={entry.canFocus ? `Jump to ${entry.name}` : `${entry.name} is not Expanded`}
                  onClick={() => void stepToDepthAncestor(editor, entry.id)}
                >
                  <i aria-hidden="true" />
                  <span><b>{entry.name}</b><small>{entry.canFocus ? 'ancestor' : 'not Expanded'}</small></span>
                  <em>{entry.depth}</em>
                </button>
              ))}
            </div>
          </aside>
        ) : null}
        <span className="systemsketch-depth-status" aria-live="polite">
          Current scope: {model.current.props.title.trim() || 'Untitled Block'}, depth {model.depth}
        </span>
      </div>
    </>
  )
}
