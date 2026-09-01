import {
  DefaultToolbar,
  TldrawUiButton,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  useActions,
  useEditor,
  usePassThroughWheelEvents,
  useTldrawUiComponents,
  useValue,
} from 'tldraw'
import { useEffect, useRef } from 'react'
import { BLOCK_TOOL_ID, getBlockInspectorContext, selectionHasBlockStyles } from '../blocks'
import {
  EditorBlockInspector,
  EditorBlockSelectionMiniMenu,
  EditorConnectionInspector,
  getConnectionInspectorContext,
  OnCanvasBlockPicker,
} from '../blocks/ui'
import { DepthStackNavigator } from '../depth/DepthStackNavigator'
import { useChrome } from './ChromeProvider'
import { SelectionContextualMenu } from './SelectionContextualMenu'
import type { RightSurface } from './chromeState'
import './systemsketch-chrome.css'

function ShapesIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <circle cx="14" cy="6" r="3" />
      <path d="m6 12 3.5 5H2.5L6 12Zm6 0h5v5h-5z" />
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M12 3.5v13" />
    </svg>
  )
}

function CommandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M7 5.5a2.5 2.5 0 1 0-2.5 2.5H15.5A2.5 2.5 0 1 0 13 5.5v9a2.5 2.5 0 1 0 2.5-2.5H4.5A2.5 2.5 0 1 0 7 14.5v-9Z" />
    </svg>
  )
}

function BlockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M3 7.5h14M6 5.25h.01M8.5 5.25h.01" />
    </svg>
  )
}

export function SystemSketchMenuPanel() {
  const editor = useEditor()
  const { MainMenu, PageMenu } = useTldrawUiComponents()
  const { leftSurface, toggleLeft } = useChrome()
  const ref = useRef<HTMLElement>(null)
  usePassThroughWheelEvents(ref)
  const isSinglePageMode = useValue(
    'systemsketch single page mode',
    () => editor.options.maxPages <= 1,
    [editor],
  )

  return (
    <nav
      ref={ref}
      className="systemsketch-top-left-shell"
      aria-label="Board, pages, and library"
      data-testid="systemsketch-top-left-shell"
      data-systemsketch-chrome
    >
      {MainMenu ? <MainMenu /> : null}
      {PageMenu && !isSinglePageMode ? <PageMenu /> : null}
      <TldrawUiButton
        type="icon"
        className="systemsketch-shell-icon-button"
        title="Shapes library"
        aria-expanded={leftSurface === 'shapes'}
        aria-controls={leftSurface === 'shapes' ? 'systemsketch-left-popout' : undefined}
        onClick={() => toggleLeft('shapes')}
      >
        <ShapesIcon />
      </TldrawUiButton>
    </nav>
  )
}

export function SystemSketchSharePanel() {
  const { rightSurface, toggleRight } = useChrome()
  const ref = useRef<HTMLElement>(null)
  usePassThroughWheelEvents(ref)

  return (
    <nav
      ref={ref}
      className="systemsketch-top-right-shell"
      aria-label="Collaboration and sharing"
      data-testid="systemsketch-top-right-shell"
      data-systemsketch-chrome
    >
      <TldrawUiButton type="low" className="systemsketch-avatar-button" title="Profile placeholder">
        Z
      </TldrawUiButton>
      <TldrawUiButton
        type="icon"
        className="systemsketch-shell-icon-button"
        title="Comments and inspector"
        aria-expanded={rightSurface === 'comments'}
        aria-controls={rightSurface ? 'systemsketch-right-popout' : undefined}
        onClick={() => toggleRight('comments')}
      >
        <PanelIcon />
      </TldrawUiButton>
      <span className="systemsketch-timer" aria-label="Timer placeholder">◉ 03:00</span>
      <TldrawUiButton type="primary" className="systemsketch-share-button" title="Share placeholder">
        Share
      </TldrawUiButton>
    </nav>
  )
}

function ShapeTile({ label, kind = 'square' }: { label: string; kind?: string }) {
  return (
    <button type="button" className="systemsketch-shape-tile" aria-label={label} title={`${label} placeholder`}>
      <i data-kind={kind} />
    </button>
  )
}

function ShapesLibrary() {
  return (
    <div className="systemsketch-library-body">
      <label className="systemsketch-panel-search">
        <span aria-hidden="true">⌕</span>
        <input placeholder="Search shapes" aria-label="Search shapes" />
      </label>
      <section>
        <h3><span>Recents</span><span aria-hidden="true">⌃</span></h3>
        <div className="systemsketch-shape-grid">
          <ShapeTile label="Recent rectangle" />
        </div>
      </section>
      <section>
        <h3><span>Connections</span><span aria-hidden="true">⌃</span></h3>
        <div className="systemsketch-connection-grid" aria-label="Connection placeholders">
          <button type="button" title="Elbow connection placeholder">↱</button>
          <button type="button" title="Curved connection placeholder">⤴</button>
          <button type="button" title="Arrow connection placeholder">↗</button>
          <button type="button" title="Network connection placeholder">⌘</button>
        </div>
      </section>
      <section>
        <h3><span>Basic</span><span aria-hidden="true">⌃</span></h3>
        <div className="systemsketch-shape-grid">
          <ShapeTile label="Rectangle" />
          <ShapeTile label="Ellipse" kind="circle" />
          <ShapeTile label="Diamond" kind="diamond" />
          <ShapeTile label="Triangle" kind="triangle" />
          <ShapeTile label="Rounded rectangle" kind="rounded" />
          <ShapeTile label="Pentagon" kind="pentagon" />
          <ShapeTile label="Plus" kind="plus" />
          <ShapeTile label="Star" kind="star" />
        </div>
      </section>
      <section>
        <h3><span>Flowchart</span><span aria-hidden="true">⌃</span></h3>
        <div className="systemsketch-shape-grid">
          <ShapeTile label="Process" kind="process" />
          <ShapeTile label="Database" kind="database" />
          <ShapeTile label="Document" kind="document" />
          <ShapeTile label="Decision" kind="diamond" />
        </div>
      </section>
    </div>
  )
}

function PlaceholderEmptyState({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="systemsketch-panel-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  )
}

function RightSurfaceBody({ surface, onClose }: { surface: RightSurface; onClose(): void }) {
  const editor = useEditor()
  if (surface === 'board-overview') {
    return (
      <PlaceholderEmptyState
        icon="▣"
        title="Board overview"
        detail="Frames, regions, and board navigation will live here."
      />
    )
  }
  if (surface === 'inspector') {
    // A selected cable is the dock's other subject. The Block lens wins when
    // both could apply, because a Block carries far more to edit.
    if (getBlockInspectorContext(editor).kind === 'empty'
      && getConnectionInspectorContext(editor) !== null) {
      return <EditorConnectionInspector editor={editor} />
    }
    return <EditorBlockInspector editor={editor} onRequestClose={onClose} />
  }
  return (
    <PlaceholderEmptyState
      icon="◯"
      title="Comments"
      detail="Give feedback, ask a question, or leave a note. Comment data is not wired yet."
    />
  )
}

function SelectionMiniMenu() {
  const editor = useEditor()
  const { setRight } = useChrome()
  const canShow = useValue(
    'systemsketch selection mini menu',
    () => (
      editor.getSelectedShapeIds().length > 0
      && editor.getEditingShapeId() === null
      && editor.getCurrentToolId() === 'select'
    ),
    [editor],
  )
  const selectionCount = useValue(
    'systemsketch selection count',
    () => editor.getSelectedShapeIds().length,
    [editor],
  )
  // Any Block in the selection — one, nine, or nested inside a group — gets the
  // Block mini menu, because every control on it is now a batch style write.
  const hasBlocks = useValue(
    'systemsketch selection has Blocks',
    () => selectionHasBlockStyles(editor),
    [editor],
  )
  if (!canShow) return null

  return (
    <SelectionContextualMenu
      className="systemsketch-selection-menu"
      label="Selection actions"
    >
      {hasBlocks ? (
        <EditorBlockSelectionMiniMenu editor={editor} onOpenInspector={() => setRight('inspector')} />
      ) : (
        <>
          <span className="systemsketch-selection-count">{selectionCount} selected</span>
          <TldrawUiToolbarButton
            type="icon"
            className="systemsketch-selection-action"
            title="Open inspector"
            onClick={() => setRight('inspector')}
          >
            Inspect
          </TldrawUiToolbarButton>
        </>
      )}
    </SelectionContextualMenu>
  )
}

export function SystemSketchSurfaceHost() {
  const editor = useEditor()
  const { leftSurface, rightSurface, setLeft, setRight } = useChrome()
  const blockInspectorContextKey = useValue(
    'systemsketch Block inspector context',
    () => {
      const context = getBlockInspectorContext(editor)
      if (context.kind === 'selected') return context.shape.id
      if (context.kind === 'multi') return `multi:${context.styles.blockCount}`
      if (context.kind === 'tool') return 'tool:block'
      // Selecting a cable opens the dock too — it is the panel's other subject.
      const connection = getConnectionInspectorContext(editor)
      if (connection) return `connection:${connection.count}`
      return null
    },
    [editor],
  )
  const previousBlockInspectorContextKey = useRef<string | null>(null)

  useEffect(() => {
    if (
      blockInspectorContextKey
      && blockInspectorContextKey !== previousBlockInspectorContextKey.current
    ) {
      setRight('inspector')
    }
    previousBlockInspectorContextKey.current = blockInspectorContextKey
  }, [blockInspectorContextKey, setRight])

  const rightTitle = rightSurface === 'board-overview'
    ? 'Board overview'
    : rightSurface === 'inspector'
      ? 'Inspector'
      : 'Comments'

  return (
    <div className="systemsketch-surface-host" data-testid="systemsketch-surface-host">
      <OnCanvasBlockPicker />
      <DepthStackNavigator />
      {leftSurface ? (
        <aside
          id="systemsketch-left-popout"
          className="systemsketch-popout systemsketch-popout--left"
          aria-label="Shapes library"
          data-testid="systemsketch-left-popout"
          data-systemsketch-chrome
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="systemsketch-popout__header">
            <div><span>Library</span><h2>Shapes</h2></div>
            <button type="button" aria-label="Close shapes library" onClick={() => setLeft(null)}>×</button>
          </header>
          <ShapesLibrary />
        </aside>
      ) : null}

      {rightSurface ? (
        <aside
          id="systemsketch-right-popout"
          className="systemsketch-popout systemsketch-popout--right"
          aria-label={rightTitle}
          data-testid="systemsketch-right-popout"
          data-surface={rightSurface}
          data-systemsketch-chrome
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="systemsketch-popout__header">
            <div><span>Right panel</span><h2>{rightTitle}</h2></div>
            <button type="button" aria-label={`Close ${rightTitle}`} onClick={() => setRight(null)}>×</button>
          </header>
          <RightSurfaceBody surface={rightSurface} onClose={() => setRight(null)} />
        </aside>
      ) : null}

      <SelectionMiniMenu />
    </div>
  )
}

export function SystemSketchToolbar() {
  const editor = useEditor()
  const actions = useActions()
  const { rightSurface, setRight, toolbarSurface, setToolbar } = useChrome()
  const isOpen = toolbarSurface === 'commands'
  const isBlockTool = useValue(
    'systemsketch Block tool selected',
    () => editor.getCurrentToolId() === BLOCK_TOOL_ID,
    [editor],
  )

  const runAction = (id: string) => {
    actions[id]?.onSelect('toolbar')
    setToolbar(null)
  }

  return (
    <div className="systemsketch-toolbar-shell" data-testid="systemsketch-toolbar-shell">
      <DefaultToolbar />
      <div className="systemsketch-toolbar-extras">
        <TldrawUiButton
          type="icon"
          className="systemsketch-block-tool-button"
          title="Block"
          isActive={isBlockTool}
          aria-pressed={isBlockTool}
          aria-expanded={rightSurface === 'inspector'}
          onClick={() => {
            editor.setCurrentTool(BLOCK_TOOL_ID)
            setRight('inspector')
          }}
        >
          <BlockIcon />
        </TldrawUiButton>
        <TldrawUiPopover
          id="systemsketch-toolbar-commands"
          open={isOpen}
          onOpenChange={(open) => setToolbar(open ? 'commands' : null)}
        >
          <TldrawUiPopoverTrigger>
            <TldrawUiButton
              type="icon"
              className="systemsketch-toolbar-menu-button"
              title="Commands and palettes"
              aria-expanded={isOpen}
            >
              <CommandIcon />
            </TldrawUiButton>
          </TldrawUiPopoverTrigger>
          <TldrawUiPopoverContent side="top" align="end" sideOffset={8} collisionPadding={16}>
            <section
              className="systemsketch-toolbar-menu"
              aria-label="Commands and palettes"
              data-testid="systemsketch-toolbar-menu"
              data-systemsketch-chrome
              onWheel={(event) => event.stopPropagation()}
            >
              <label className="systemsketch-panel-search">
                <span aria-hidden="true">⌕</span>
                <input
                  autoFocus
                  placeholder="Search"
                  aria-label="Search commands"
                  onKeyDown={(event) => event.stopPropagation()}
                />
              </label>
              <span className="systemsketch-toolbar-menu__eyebrow">Suggestions</span>
              <button type="button" disabled>
                <span>⌕ &nbsp; Find and replace…</span><kbd>Ctrl F</kbd>
              </button>
              <button type="button" onClick={() => runAction('select-all')}>
                <span>◎ &nbsp; Select all</span><kbd>Ctrl A</kbd>
              </button>
              <button type="button" onClick={() => runAction('undo')}>
                <span>↶ &nbsp; Undo</span><kbd>Ctrl Z</kbd>
              </button>
              <span className="systemsketch-toolbar-menu__eyebrow">Quick colors</span>
              <div className="systemsketch-color-row" aria-label="Color placeholders">
                {['violet', 'orange', 'yellow', 'green', 'white'].map((color) => (
                  <button key={color} type="button" data-color={color} aria-label={`${color} placeholder`} />
                ))}
              </div>
            </section>
          </TldrawUiPopoverContent>
        </TldrawUiPopover>
      </div>
    </div>
  )
}
