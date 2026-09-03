import {
  TldrawUiButton,
  TldrawUiToolbarButton,
  useActions,
  useDialogs,
  useEditor,
  usePassThroughWheelEvents,
  useTldrawUiComponents,
  useToasts,
  useValue,
  type Editor,
} from 'tldraw'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { AppearanceControls } from '../appearance/AppearanceControls'
import { WrapSelectionControl } from '../frames/WrapSelectionControl'
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
  TunnelLayerBar,
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
import { ShapeFactsPanel } from './ShapeFactsPanel'
import {
  inspectorSubjectOwnsHeader,
  inspectorSubjectTitle,
  readInspectorSubject,
  type InspectorSubject,
} from './inspectorSubject'
import { SystemSketchSettingsDialog } from '../settings/InterfaceSettings'
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
  const { MainMenu } = useTldrawUiComponents()
  const { leftSurface, toggleLeft, toolbarSurface, setToolbar } = useChrome()
  const ref = useRef<HTMLElement>(null)
  usePassThroughWheelEvents(ref)
  return (
    <nav
      ref={ref}
      className="systemsketch-top-left-shell"
      aria-label="Board, depth, and library"
      data-testid="systemsketch-top-left-shell"
      data-systemsketch-chrome
    >
      {MainMenu ? <MainMenu /> : null}
      <DepthStackNavigator placement="menu" />
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
  const { addDialog } = useDialogs()
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
      {/* There is no identity to show — SystemSketch is local and single-user —
          so this badge used to be a button labelled "Profile placeholder" that
          did nothing when pressed. A control in the chrome has to do the thing
          its shape promises, and the honest thing behind a profile badge in a
          local app is the preferences it would have opened: the same Settings
          dialog the main menu opens, at the same id so the two share one
          instance. */}
      <TldrawUiButton
        type="low"
        className="systemsketch-avatar-button"
        title="Settings — theme and interface scale"
        aria-label="Open settings"
        data-testid="systemsketch-avatar-button"
        /* Landing on Appearance rather than Interface: theme is the preference
           closest to what a profile badge implies, and it is the one a person
           reaches for first on a new machine. */
        onClick={() => addDialog({
          id: 'systemsketch-settings',
          component: (props) => <SystemSketchSettingsDialog {...props} category="appearance" />,
        })}
      >
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

function RightSurfaceBody({
  surface,
  subject,
  onClose,
}: {
  surface: RightSurface
  subject: InspectorSubject
  onClose(): void
}) {
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
  if (surface === 'inspector') return <InspectorDock editor={editor} subject={subject} onClose={onClose} />
  return <LocalCommentsPanel editor={editor} readOnly={readOnly} />
}

/**
 * The dock's body for a resolved subject.
 *
 * Precedence and header ownership both live in `inspectorSubject.ts`; this only
 * maps a subject to its panel. The `shape` arm is the new one: `Inspect` is
 * offered for every selection, so an ordinary rectangle now lands on the facts
 * tldraw actually holds instead of on "Select a Block to inspect it."
 */
function InspectorDock({
  editor,
  subject,
  onClose,
}: {
  editor: Editor
  subject: InspectorSubject
  onClose(): void
}) {
  if (subject === 'branch') return <EditorBranchInspector editor={editor} onRequestClose={onClose} />
  if (subject === 'connection') return <EditorConnectionInspector editor={editor} />
  if (subject === 'shape') return <ShapeFactsPanel editor={editor} />
  if (subject === 'empty') return <InspectorEmptyState />
  return <EditorBlockInspector editor={editor} onRequestClose={onClose} />
}

/**
 * Nothing selected.
 *
 * The old empty state was a bare `<p>` centred in an otherwise blank 280px
 * column. Every other panel in this app already has a designed empty state —
 * glyph, heading, one sentence of guidance — and `.systemsketch-panel-empty` is
 * that pattern, so the dock uses it rather than a fourth look.
 */
function InspectorEmptyState() {
  return (
    <div className="systemsketch-panel-empty" data-testid="systemsketch-inspector-empty">
      <span aria-hidden="true">▣</span>
      <strong>Nothing selected</strong>
      <p>
        Select a Block, a Branch or a cable to edit it here. Any other shape shows
        what the board knows about it.
      </p>
    </div>
  )
}

function SelectionMiniMenu() {
  const editor = useEditor()
  const { addToast } = useToasts()
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
        <EditorBranchSelectionMiniMenu editor={editor} />
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
          <EditorBlockSelectionMiniMenu key={selectionKey} editor={editor} />
          <AppearanceControls />
          <WrapSelectionControl />
          <SelectionLayoutActions
            {...layoutActions}
            onTidyEdges={runTidyEdges}
            onOrganizeNodes={() => void runOrganizeNodes()}
          />
        </>
      ) : (
        <>
          {/* Appearance first, the way FigJam leads with what the thing looks
              like. There is no Inspect button on either branch any more: the
              dock follows the selection, so the pill only carries the things
              that change the shape. */}
          <AppearanceControls />
          <WrapSelectionControl />
          <SelectionLayoutActions
            {...layoutActions}
            onTidyEdges={runTidyEdges}
            onOrganizeNodes={() => void runOrganizeNodes()}
          />
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
  /**
   * What the dock is currently about, as one comparable string.
   *
   * `null` means "nothing the dock can speak about", which is now only an empty
   * selection: the pill no longer carries an Inspect button, so the dock has to
   * follow the selection by itself for EVERY subject, an ordinary rectangle
   * included. A button that only ever meant "show me the panel for what I
   * already selected" was a step the selection had already taken.
   */
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
      // Any other selection is the shape lens. Keyed on the ids themselves so
      // moving from one rectangle to another is a new context, exactly as it is
      // for one Block to another.
      const selected = editor.getSelectedShapeIds()
      if (selected.length > 0) return `shape:${[...selected].sort().join(',')}`
      return null
    },
    [editor],
  )
  const previousBlockInspectorContextKey = useRef<string | null>(null)
  /**
   * The context the user last dismissed the dock on.
   *
   * Without this, closing the inspector was undone by the next click: the
   * auto-open effect fires whenever the context key changes, so selecting a
   * second Block re-opened the panel the user had just closed. Remembering the
   * dismissal makes the close stick for the rest of that run of selections;
   * clearing the selection (key `null`) or opening the dock by hand releases it.
   */
  const dismissedInspectorContextKey = useRef<string | null>(null)
  const inspectorSubject = useValue(
    'systemsketch inspector subject',
    () => readInspectorSubject(editor, {
      getOnlySelectedBranch,
      getBlockInspectorContextKind: (target) => getBlockInspectorContext(target).kind,
      getConnectionInspectorContext,
    }),
    [editor],
  )

  /** Closing the dock records the dismissal; opening it by hand clears one. */
  const closeRightSurface = useCallback(() => {
    if (rightSurface === 'inspector') {
      dismissedInspectorContextKey.current = blockInspectorContextKey ?? 'dismissed'
    }
    setRight(null)
  }, [blockInspectorContextKey, rightSurface, setRight])
  const openInspector = useCallback(() => {
    dismissedInspectorContextKey.current = null
    setRight('inspector')
  }, [setRight])

  const commandActions = useMemo<CommandPaletteAction[]>(() => {
    const stock = (id: string) => actions[id]?.onSelect('menu')
    return [
      {
        id: 'find-board',
        label: 'Find and replace on board',
        description: 'Search editable text across the entire board',
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
        id: 'show-inspector',
        label: 'Show inspector',
        description: 'Open the panel for the current selection',
        keywords: ['inspect', 'properties', 'dock'],
        icon: '▤',
        run: () => openInspector(),
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
        description: 'Show the whole board',
        shortcut: 'Shift 1',
        icon: '⌗',
        run: () => stock('zoom-to-fit'),
      },
    ]
  }, [actions, addToast, editor, openInspector, setLeft, setRight, setToolbar])

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
    // An empty selection ends the run the dismissal applied to.
    if (blockInspectorContextKey === null) dismissedInspectorContextKey.current = null
    if (
      blockInspectorContextKey
      && blockInspectorContextKey !== previousBlockInspectorContextKey.current
      && dismissedInspectorContextKey.current === null
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
      ? inspectorSubjectTitle(inspectorSubject)
      : 'Comments'

  return (
    <div className="systemsketch-surface-host" data-testid="systemsketch-surface-host">
      <RecorderIndicator />
      <TunnelLayerBar />
      <OnCanvasBlockPicker />
      <HitAreaOverlay />
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
          data-inspector-subject={rightSurface === 'inspector' ? inspectorSubject : undefined}
          /* Which element draws the header, and the stylesheet obeys it rather
             than repeating the list. `body` means the panel below supplies its
             own title and close button; `frame` means it does not, and the
             dock's header stays. Before this the inspector hid the header for
             every subject, which left a cable, an ordinary shape and an empty
             selection in a headerless column with no pointer way out. */
          data-inspector-header={rightSurface === 'inspector'
            ? (inspectorSubjectOwnsHeader(inspectorSubject) ? 'body' : 'frame')
            : undefined}
          data-systemsketch-chrome
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="systemsketch-popout__header">
            <div><span>Right panel</span><h2>{rightTitle}</h2></div>
            <button
              type="button"
              aria-label={`Close ${rightTitle}`}
              data-testid="systemsketch-right-popout-close"
              onClick={closeRightSurface}
            >×</button>
          </header>
          <RightSurfaceBody
            surface={rightSurface}
            subject={inspectorSubject}
            onClose={closeRightSurface}
          />
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
