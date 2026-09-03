import {
  TldrawUiButton,
  TldrawUiToolbarButton,
  useActions,
  useEditor,
  usePassThroughWheelEvents,
  useTldrawUiComponents,
  useToasts,
  useValue,
  type Editor,
} from 'tldraw'
import { useEffect, useMemo, useRef } from 'react'
import { AppearanceControls } from '../appearance/AppearanceControls'
import { BLOCK_TOOL_ID, PILL_TOOL_ID, getBlockInspectorContext, selectionHasBlockStyles } from '../blocks'
import { describeTidyEdgesOutcome, tidyEdges } from '../blocks/connections/tidyEdges'
import { describeOrganizeNodesOutcome, organizeNodes } from '../blocks/layout'
import {
  EditorBlockInspector,
  EditorBlockSelectionMiniMenu,
  EditorConnectionInspector,
  getConnectionInspectorContext,
  HitAreaOverlay,
  OnCanvasBlockPicker,
} from '../blocks/ui'
import {
  BRANCH_TOOL_ID,
  EditorBranchInspector,
  EditorBranchSelectionMiniMenu,
  getOnlySelectedBranch,
} from '../branch'
import { DepthStackNavigator } from '../depth/DepthStackNavigator'
import { PortableShareButton } from '../export/PortableShareButton'
import { ShapeLibraryBrowser } from '../library/ShapeLibraryBrowser'
import { BoardOverview } from './BoardOverview'
import { LocalCommentsPanel } from '../comments'
import { BoardDiagnosticsPanel } from '../diagnostics'
import {
  SystemSketchCommandPalette,
  type CommandPaletteAction,
} from '../commands'
import { RecorderIndicator } from '../recorder/RecorderControls'
import { useChrome } from './ChromeProvider'
import { SelectionContextualMenu } from './SelectionContextualMenu'
import {
  getSelectionLayoutActionAvailability,
  SelectionLayoutActions,
} from './SelectionLayoutActions'
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

export function SystemSketchMenuPanel() {
  const editor = useEditor()
  const { MainMenu, PageMenu } = useTldrawUiComponents()
  const { leftSurface, toggleLeft, toolbarSurface, setToolbar } = useChrome()
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
      <TldrawUiButton
        type="icon"
        className="systemsketch-shell-icon-button"
        title="Search and commands (Ctrl+P)"
        aria-label="Search and commands"
        aria-keyshortcuts="Control+P Meta+P"
        aria-expanded={toolbarSurface !== null}
        onClick={() => setToolbar(toolbarSurface ? null : 'commands')}
      >
        <CommandIcon />
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
      <PortableShareButton />
    </nav>
  )
}

function ShapesLibrary() {
  const { setLeft } = useChrome()
  return <ShapeLibraryBrowser autoFocus onCancel={() => setLeft(null)} onInserted={() => setLeft(null)} />
}

function RightSurfaceBody({ surface, onClose }: { surface: RightSurface; onClose(): void }) {
  const editor = useEditor()
  const readOnly = useValue(
    'SystemSketch comments read-only state',
    () => editor.getInstanceState().isReadonly,
    [editor],
  )
  if (surface === 'board-overview') {
    return <BoardOverview />
  }
  if (surface === 'diagnostics') {
    return <BoardDiagnosticsPanel editor={editor} />
  }
  if (surface === 'inspector') return <InspectorDock editor={editor} onClose={onClose} />
  return <LocalCommentsPanel editor={editor} readOnly={readOnly} />
}

/**
 * Which inspector the dock shows for the current selection.
 *
 * A selected Branch is its own subject; a selected cable is the dock's other
 * subject. The Block lens wins when both could apply, because a Block carries
 * far more to edit.
 */
function InspectorDock({ editor, onClose }: { editor: Editor; onClose(): void }) {
  const subject = useValue(
    'systemsketch inspector subject',
    () => {
      if (getOnlySelectedBranch(editor)) return 'branch'
      if (getBlockInspectorContext(editor).kind === 'empty'
        && getConnectionInspectorContext(editor) !== null) return 'connection'
      return 'block'
    },
    [editor],
  )
  if (subject === 'branch') return <EditorBranchInspector editor={editor} onRequestClose={onClose} />
  if (subject === 'connection') return <EditorConnectionInspector editor={editor} />
  return <EditorBlockInspector editor={editor} onRequestClose={onClose} />
}

function SelectionMiniMenu() {
  const editor = useEditor()
  const { addToast } = useToasts()
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
  // A Block stays a Block selection as the user adds or removes peers. Keep a
  // selection-identity value so its batch controls refresh across those
  // transitions without narrating the selected count in the menu.
  const selectionKey = useValue(
    'systemsketch selection identity',
    () => Array.from(editor.getSelectedShapeIds()).sort().join(','),
    [editor],
  )
  // Any Block in the selection — one, nine, or nested inside a group — gets the
  // Block mini menu, because every control on it is now a batch style write.
  const hasBlocks = useValue(
    'systemsketch selection has Blocks',
    () => selectionHasBlockStyles(editor),
    [editor],
  )
  const hasBranch = useValue(
    'systemsketch selection is one Branch',
    () => getOnlySelectedBranch(editor) !== null,
    [editor],
  )
  const layoutActions = useValue(
    'systemsketch selection layout actions',
    () => getSelectionLayoutActionAvailability(editor),
    [editor],
  )
  const runTidyEdges = () => {
    const outcome = tidyEdges(editor)
    addToast({ title: describeTidyEdgesOutcome(outcome), severity: 'info' })
  }
  const runOrganizeNodes = async () => {
    const outcome = await organizeNodes(editor)
    addToast({ title: describeOrganizeNodesOutcome(outcome), severity: 'info' })
  }
  if (!canShow) return null

  if (hasBranch) {
    return (
      <SelectionContextualMenu
        className="systemsketch-selection-menu"
        label="Selection actions"
      >
        <EditorBranchSelectionMiniMenu editor={editor} onOpenInspector={() => setRight('inspector')} />
      </SelectionContextualMenu>
    )
  }

  return (
    <SelectionContextualMenu
      className="systemsketch-selection-menu"
      label="Selection actions"
    >
      {/* Appearance rides on both branches. A Block carries no tldraw styles of
          its own, so it contributes nothing here — but a Block selected
          *alongside* a rectangle must not put the rectangle's colour out of
          reach. The control renders nothing when the selection has no styles,
          so the Block-only pill is unchanged. */}
      {hasBlocks ? (
        <>
          <EditorBlockSelectionMiniMenu
            key={selectionKey}
            editor={editor}
            onOpenInspector={() => setRight('inspector')}
          />
          <AppearanceControls />
          <SelectionLayoutActions
            {...layoutActions}
            onTidyEdges={runTidyEdges}
            onOrganizeNodes={() => void runOrganizeNodes()}
          />
        </>
      ) : (
        <>
          {/* Appearance first, the way FigJam leads with what the thing looks
              like; Inspect stays on the right as the way out to detail. */}
          <AppearanceControls />
          <SelectionLayoutActions
            {...layoutActions}
            onTidyEdges={runTidyEdges}
            onOrganizeNodes={() => void runOrganizeNodes()}
          />
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
  const actions = useActions()
  const { addToast } = useToasts()
  const {
    leftSurface,
    rightSurface,
    toolbarSurface,
    setLeft,
    setRight,
    setToolbar,
  } = useChrome()
  const blockInspectorContextKey = useValue(
    'systemsketch Block inspector context',
    () => {
      const branch = getOnlySelectedBranch(editor)
      if (branch) return `branch:${branch.id}`
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

  const commandActions = useMemo<CommandPaletteAction[]>(() => {
    const stock = (id: string) => actions[id]?.onSelect('menu')
    return [
      {
        id: 'find-board',
        label: 'Find and replace on board',
        description: 'Search editable text across every page',
        keywords: ['search', 'replace'],
        shortcut: 'Ctrl F',
        icon: '⌕',
        keepOpen: true,
        run: () => setToolbar('find-replace'),
      },
      {
        id: 'insert-block',
        label: 'Insert Block',
        description: 'Switch to the semantic Block tool',
        keywords: ['node'],
        icon: '▣',
        run: () => editor.setCurrentTool(BLOCK_TOOL_ID),
      },
      {
        id: 'insert-branch',
        label: 'Insert Branch',
        description: 'Switch to the semantic Branch region tool',
        keywords: ['conditional', 'region'],
        icon: '⑂',
        run: () => editor.setCurrentTool(BRANCH_TOOL_ID),
      },
      {
        id: 'insert-pill',
        label: 'Insert Pill',
        description: 'Switch to the literal Value Pill tool',
        keywords: ['value', 'literal', 'variable'],
        icon: '＝',
        run: () => editor.setCurrentTool(PILL_TOOL_ID),
      },
      {
        id: 'shape-library',
        label: 'Open Shapes library',
        description: 'Browse searchable shape families',
        keywords: ['insert'],
        icon: '◇',
        run: () => setLeft('shapes'),
      },
      {
        id: 'show-problems',
        label: 'Show board Problems',
        description: 'List diagnostics and navigate to affected objects',
        keywords: ['lint', 'diagnostics'],
        icon: '⚠',
        run: () => setRight('diagnostics'),
      },
      {
        id: 'show-comments',
        label: 'Show comments',
        description: 'Review local discussions attached to this board',
        icon: '◌',
        run: () => setRight('comments'),
      },
      {
        id: 'tidy-edges',
        label: 'Tidy edges',
        description: 'Route automatic elbows around Blocks, then separate their channels',
        keywords: ['nudge', 'cables', 'connections', 'layout'],
        icon: '≋',
        disabled: () => !getSelectionLayoutActionAvailability(editor).tidyEdges,
        run: () => {
          const outcome = tidyEdges(editor)
          addToast({ title: describeTidyEdgesOutcome(outcome), severity: 'info' })
        },
      },
      {
        id: 'organize-nodes',
        label: 'Organize nodes',
        description: 'Arrange Blocks left to right while preserving model order',
        keywords: ['tidy', 'blocks', 'auto layout', 'elk'],
        icon: '▦',
        disabled: () => !getSelectionLayoutActionAvailability(editor).organizeNodes,
        run: async () => {
          const outcome = await organizeNodes(editor)
          addToast({ title: describeOrganizeNodesOutcome(outcome), severity: 'info' })
        },
      },
      {
        id: 'select-all',
        label: 'Select all',
        shortcut: 'Ctrl A',
        icon: '◎',
        run: () => stock('select-all'),
      },
      {
        id: 'undo',
        label: 'Undo',
        shortcut: 'Ctrl Z',
        icon: '↶',
        disabled: () => !editor.getCanUndo(),
        run: () => stock('undo'),
      },
      {
        id: 'redo',
        label: 'Redo',
        shortcut: 'Ctrl Shift Z',
        icon: '↷',
        disabled: () => !editor.getCanRedo(),
        run: () => stock('redo'),
      },
      {
        id: 'zoom-to-fit',
        label: 'Zoom to fit',
        description: 'Show the whole current page',
        shortcut: 'Shift 1',
        icon: '⌗',
        run: () => stock('zoom-to-fit'),
      },
    ]
  }, [actions, addToast, editor, setLeft, setRight, setToolbar])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key !== 'p' && key !== 'k' && key !== 'f') return
      event.preventDefault()
      event.stopPropagation()
      setToolbar(key === 'f' ? 'find-replace' : 'commands')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [setToolbar])

  useEffect(() => {
    if (
      blockInspectorContextKey
      && blockInspectorContextKey !== previousBlockInspectorContextKey.current
      && rightSurface !== 'board-overview'
      && rightSurface !== 'diagnostics'
    ) {
      setRight('inspector')
    }
    previousBlockInspectorContextKey.current = blockInspectorContextKey
  }, [blockInspectorContextKey, rightSurface, setRight])

  const rightTitle = rightSurface === 'board-overview'
    ? 'Board overview'
    : rightSurface === 'diagnostics'
      ? 'Problems'
    : rightSurface === 'inspector'
      ? 'Inspector'
      : 'Comments'

  return (
    <div className="systemsketch-surface-host" data-testid="systemsketch-surface-host">
      <RecorderIndicator />
      <OnCanvasBlockPicker />
      <HitAreaOverlay />
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

      {toolbarSurface ? (
        <SystemSketchCommandPalette
          initialMode={toolbarSurface}
          actions={commandActions}
          onModeChange={setToolbar}
          onClose={() => setToolbar(null)}
        />
      ) : null}

      <SelectionMiniMenu />
    </div>
  )
}
